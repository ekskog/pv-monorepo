import { proxyActivities, log, defineQuery, setHandler } from '@temporalio/workflow';
import type * as convertDeps from '../activities/convertImage';
import type * as metadataDeps from '../activities/metadataActivity';
import type * as persistDeps from '../activities/cleanup';
import type * as reportDeps from '../activities/reportProgress';

type AllActivities = typeof convertDeps & typeof metadataDeps & typeof persistDeps & typeof reportDeps;

const { convertImage, extractAndPersistMetadata, cleanupBatch } =
  proxyActivities<AllActivities>({
    startToCloseTimeout: '60 minutes',
    retry: { maximumAttempts: 5 },
  });

// reportProgress must not block the workflow for long — give it a tight timeout
// so a transient pv-api restart can't freeze the entire batch for 60 minutes.
const { reportProgress } = proxyActivities<AllActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 1 },
});

export interface ImageFile {
  filename: string;
  path: string;
  contentType: string;
}

export interface BatchInput {
  batchId: string;
  batchDir: string;
  images: ImageFile[];
  folder?: string;
  albumName?: string;
}

export interface BatchResult {
  totalImages: number;
  successful: number;
  failed: number;
  results: any[];
  processingTimeMs: number;
}

export interface BatchProgressState {
  totalRequested: number;
  processed: number;
  successful: number;
  failed: number;
  percentage: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  message: string | null;
  lastSuccessFile: string | null;
  lastFailedFile: string | null;
  error: string | null;
  albumName: string | null;
}

// Query definition — exported so the API client can reference the same name
export const getProgressQuery = defineQuery<BatchProgressState>('getProgress');

/**
 * Predict the final AVIF object name.
 * e.g. albumName="test", filename="IMG_4293.HEIC" -> "test/IMG_4293.avif"
 */
function predictObjectName(albumName: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '.avif');
  return `${albumName}/${base}`;
}

/**
 * Main workflow — orchestrates sequential processing of each image,
 * running conversion and metadata extraction in parallel per image.
 */
export async function processBatchImages(input: BatchInput): Promise<BatchResult> {
  const startTime = Date.now();
  const { batchId, batchDir, images } = input;
  const albumName = input.albumName || input.folder;
  const nowIso = new Date().toISOString();
  const progressState: BatchProgressState = {
    totalRequested: images.length,
    processed: 0,
    successful: 0,
    failed: 0,
    percentage: 0,
    startedAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    message: `Accepted ${images.length} images for processing`,
    lastSuccessFile: null,
    lastFailedFile: null,
    error: null,
    albumName: albumName ?? null,
  };

  // Register query handler — returns a snapshot of progressState at any point
  setHandler(getProgressQuery, () => ({ ...progressState }));

  if (!albumName) {
    throw new Error(`Missing albumName/folder for batch ${batchId}`);
  }

  log.info('processBatchImages: start', { batchId, imageCount: images.length, albumName });

  // ── Sequential loop — one image fully completes before the next starts.
  // Conversion + metadata still run in parallel for each individual image,
  // but we never have two conversions running simultaneously.
  const imageResults: Array<
    | { filename: string; success: true; objectName: string; conversionMetrics: any }
    | { filename: string; success: false; error: string }
  > = [];

  for (const image of images) {
    const objectName = predictObjectName(albumName, image.filename);

    log.info('image: dispatching activities', { batchId, filename: image.filename, objectName });

    // Run metadata first, then conversion. Conversion must not start if metadata fails.
    let metadataResult: any;
    try {
      const meta = await extractAndPersistMetadata(image.path, image.filename, objectName);
      metadataResult = { status: 'fulfilled', value: meta };
    } catch (err) {
      metadataResult = { status: 'rejected', reason: err };
    }

    let conversionResult: any;
    if (metadataResult.status === 'rejected') {
      // Skip conversion if metadata failed
      conversionResult = { status: 'rejected', reason: new Error(`Metadata failed: ${String(metadataResult.reason)}`) };
    } else {
      try {
        const conv = await convertImage(image, objectName);
        conversionResult = { status: 'fulfilled', value: conv };
      } catch (err) {
        conversionResult = { status: 'rejected', reason: err };
      }
    }

    log.info('image: activities settled', {
      batchId,
      filename: image.filename,
      conversionStatus: conversionResult.status,
      metadataStatus: metadataResult.status,
    });

    const conversionFailed = conversionResult.status === 'rejected';
    const metadataFailed = metadataResult.status === 'rejected';

    if (conversionFailed || metadataFailed) {
      const errors: string[] = [];
      if (conversionFailed) errors.push(`Conversion: ${conversionResult.reason}`);
      if (metadataFailed) errors.push(`Metadata: ${metadataResult.reason}`);

      log.error('image: one or more activities failed', {
        batchId,
        filename: image.filename,
        conversionFailed,
        metadataFailed,
        conversionError: conversionFailed ? String(conversionResult.reason) : null,
        metadataError: metadataFailed ? String(metadataResult.reason) : null,
      });

      // Update progress state incrementally on failure
      progressState.failed++;
      progressState.processed = progressState.successful + progressState.failed;
      progressState.percentage =
        progressState.totalRequested > 0
          ? Math.round((progressState.processed / progressState.totalRequested) * 100)
          : 0;
      progressState.updatedAt = new Date().toISOString();
      progressState.lastFailedFile = image.filename;
      progressState.message = `Processing images (${progressState.processed} of ${progressState.totalRequested} done)`;

      try {
        log.info('reportProgress: calling (failure path)', { batchId, percentage: progressState.percentage });
        await reportProgress({ ...progressState, batchId, workflowId: `batch-${batchId}` });
        log.info('reportProgress: done (failure path)', { batchId, percentage: progressState.percentage });
      } catch (e) {
        log.error('reportProgress: failed (failure path)', {
          batchId,
          percentage: progressState.percentage,
          error: e instanceof Error ? e.message : String(e),
          cause: (e as any)?.cause?.message,
        });
      }

      imageResults.push({
        filename: image.filename,
        success: false as const,
        error: errors.join(' | '),
      });

      continue; // move to next image
    }

    log.info('image: all activities succeeded', { batchId, filename: image.filename, objectName });

    // Update progress state incrementally on success
    progressState.successful++;
    progressState.processed = progressState.successful + progressState.failed;
    progressState.percentage =
      progressState.totalRequested > 0
        ? Math.round((progressState.processed / progressState.totalRequested) * 100)
        : 0;
    progressState.updatedAt = new Date().toISOString();
    progressState.lastSuccessFile = image.filename;
    progressState.message = `Processing images (${progressState.processed} of ${progressState.totalRequested} done)`;

    try {
      log.info('reportProgress: calling (success path)', { batchId, filename: image.filename, percentage: progressState.percentage });
      await reportProgress({ ...progressState, batchId, workflowId: `batch-${batchId}` });
      log.info('reportProgress: done (success path)', { batchId, filename: image.filename, percentage: progressState.percentage });
    } catch (e) {
      log.error('reportProgress: failed (success path)', {
        batchId,
        filename: image.filename,
        percentage: progressState.percentage,
        error: e instanceof Error ? e.message : String(e),
        cause: (e as any)?.cause?.message,
      });
    }

    imageResults.push({
      filename: image.filename,
      success: true as const,
      objectName,
      conversionMetrics: (conversionResult.value as any).metrics,
    });
  }

  // Finalize terminal state
  progressState.completedAt = new Date().toISOString();
  progressState.updatedAt = progressState.completedAt;
  progressState.message = 'Batch processing completed';
  progressState.percentage = 100;
  const firstFailure = imageResults.find((r) => !r.success);
  if (firstFailure && !firstFailure.success) {
    progressState.error = firstFailure.error;
  }

  log.info('processBatchImages: all images settled', {
    batchId,
    successful: progressState.successful,
    failed: progressState.failed,
    totalImages: progressState.totalRequested,
  });

  // Report final completed state so the API can increment the album counter
  try {
    await reportProgress({ ...progressState, batchId, workflowId: `batch-${batchId}` });
  } catch (e) {
    log.error('reportProgress: failed (completion)', {
      batchId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Cleanup NFS scratch directory regardless of individual failures
  try {
    log.info('cleanupBatch: calling', { batchId, batchDir });
    await cleanupBatch(batchDir);
    log.info('cleanupBatch: done', { batchId, batchDir });
  } catch (err) {
    log.error('cleanupBatch: failed', {
      batchId,
      batchDir,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  log.info('processBatchImages: complete', {
    batchId,
    successful: progressState.successful,
    failed: progressState.failed,
    processingTimeMs: Date.now() - startTime,
  });

  return {
    totalImages: progressState.totalRequested,
    successful: progressState.successful,
    failed: progressState.failed,
    results: imageResults,
    processingTimeMs: Date.now() - startTime,
  };
}