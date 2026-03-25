import { proxyActivities, log, defineQuery, setHandler } from '@temporalio/workflow';
import type * as convertDeps from '../activities/convertImage';
import type * as metadataDeps from '../activities/metadataActivity';
import type * as persistDeps from '../activities/persistToMinio';

type AllActivities = typeof convertDeps & typeof metadataDeps & typeof persistDeps;

const { convertImage, extractAndPersistMetadata, cleanupBatch } =
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

interface BatchProgressState {
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

  log.info(`Starting batch ${batchId} with ${images.length} images, album: ${albumName}`);

  const imageResults = await Promise.all(
    images.map(async (image: ImageFile) => {
      const objectName = predictObjectName(albumName, image.filename);

      log.info(`Processing ${image.filename} -> ${objectName}`);

      // Run conversion and metadata extraction in parallel
      const [conversionResult, metadataResult] = await Promise.allSettled([
        convertImage(image, objectName),
        extractAndPersistMetadata(image.path, image.filename, objectName),
      ]);

      const conversionFailed = conversionResult.status === 'rejected';
      const metadataFailed   = metadataResult.status   === 'rejected';

      if (conversionFailed || metadataFailed) {
        const errors: string[] = [];
        if (conversionFailed) errors.push(`Conversion: ${conversionResult.reason}`);
        if (metadataFailed)   errors.push(`Metadata: ${metadataResult.reason}`);

        log.error(`✗ ${image.filename} failed: ${errors.join(' | ')}`);

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

        return {
          filename: image.filename,
          success: false as const,
          error: errors.join(' | '),
        };
      }

      log.info(`✓ ${image.filename} fully processed`);

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

  log.info(`Batch ${batchId} complete: ${progressState.successful} succeeded, ${progressState.failed} failed`);

  // Cleanup NFS scratch directory regardless of individual failures
  try {
    await cleanupBatch(batchDir);
    log.info(`✓ Cleaned up NFS directory: ${batchDir}`);
  } catch (err) {
    log.error(`NFS cleanup failed: ${String(err)}`);
  }

  return {
    totalImages: progressState.totalRequested,
    successful: progressState.successful,
    failed: progressState.failed,
    results: imageResults,
    processingTimeMs: Date.now() - startTime,
  };
}