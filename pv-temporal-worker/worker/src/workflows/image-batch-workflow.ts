import { proxyActivities, log, defineQuery, setHandler } from '@temporalio/workflow';
import type * as convertDeps from '../activities/convertImage';
import type * as metadataDeps from '../activities/metadataActivity';
import type * as persistDeps from '../activities/persistToMinio';
import type * as reportDeps from '../activities/reportProgress';

type AllActivities = typeof convertDeps & typeof metadataDeps & typeof persistDeps & typeof reportDeps;

const { convertImage, extractAndPersistMetadata, cleanupBatch, reportProgress } =
  proxyActivities<AllActivities>({
    startToCloseTimeout: '60 minutes',
    retry: { maximumAttempts: 5 },
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
 * Main workflow — orchestrates parallel metadata + conversion for each image,
 * with rollback on failure.
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
  };

  // Register query handler — returns a snapshot of progressState at any point
  setHandler(getProgressQuery, () => ({ ...progressState }));

  if (!albumName) {
    throw new Error(`Missing albumName/folder for batch ${batchId}`);
  }

  log.info('processBatchImages: start', { batchId, imageCount: images.length, albumName });

  let lastReportedPercent = -1;

  const imageResults = await Promise.all(
    images.map(async (image: ImageFile) => {
      const objectName = predictObjectName(albumName, image.filename);

      log.info('image: dispatching activities', { batchId, filename: image.filename, objectName });

      // Run conversion and metadata extraction in parallel
      const [conversionResult, metadataResult] = await Promise.allSettled([
        convertImage(image, objectName),
        extractAndPersistMetadata(image.path, image.filename, objectName),
      ]);

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

        // Maybe report aggregated progress for the UI every N files
        try {
          if (progressState.processed % 5 === 0 || progressState.percentage === 100) {
            // include batchId to help the API map to workflow/job id
            log.info('reportProgress: calling (failure path)', { batchId, percentage: progressState.percentage });
            await reportProgress({ ...progressState, batchId, workflowId: `batch-${batchId}` });
            log.info('reportProgress: done (failure path)', { batchId, percentage: progressState.percentage });
            lastReportedPercent = progressState.percentage;
          }
        } catch (e) {
          log.error('reportProgress: failed (failure path)', {
            batchId,
            percentage: progressState.percentage,
            error: e instanceof Error ? e.message : String(e),
            cause: (e as any)?.cause?.message,
          });
        }

        return {
          filename: image.filename,
          success: false as const,
          error: errors.join(' | '),
        };
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

      // Report progress for every successful image
      try {
        log.info('reportProgress: calling (success path)', { batchId, filename: image.filename, percentage: progressState.percentage });
        await reportProgress({ ...progressState, batchId });
        log.info('reportProgress: done (success path)', { batchId, filename: image.filename, percentage: progressState.percentage });
        lastReportedPercent = progressState.percentage;
      } catch (e) {
        log.error('reportProgress: failed (success path)', {
          batchId,
          filename: image.filename,
          percentage: progressState.percentage,
          error: e instanceof Error ? e.message : String(e),
          cause: (e as any)?.cause?.message,
        });
      }

      return {
        filename: image.filename,
        success: true as const,
        objectName,
        conversionMetrics: conversionResult.value.metrics,
      };
    })
  );

  // Finalize terminal state
  progressState.completedAt = new Date().toISOString();
  progressState.updatedAt = progressState.completedAt;
  progressState.message = 'Batch processing completed';
  progressState.percentage = 100; // All images have been processed
  const firstFailure = imageResults.find((r) => !r.success);
  if (firstFailure) {
    progressState.error = firstFailure.error;
  }

  log.info('processBatchImages: all images settled', {
    batchId,
    successful: progressState.successful,
    failed: progressState.failed,
    totalImages: progressState.totalRequested,
  });

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