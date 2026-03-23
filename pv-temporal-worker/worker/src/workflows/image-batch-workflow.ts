import { proxyActivities, log } from '@temporalio/workflow';
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

        return {
          filename: image.filename,
          success: false as const,
          error: errors.join(' | '),
        };
      }

      log.info(`✓ ${image.filename} fully processed`);

      return {
        filename: image.filename,
        success: true as const,
        objectName,
        conversionMetrics: conversionResult.value.metrics,
      };
    })
  );

  const successful = imageResults.filter((r) => r.success).length;
  const failed     = imageResults.filter((r) => !r.success).length;

  log.info(`Batch ${batchId} complete: ${successful} succeeded, ${failed} failed`);

  // Cleanup NFS scratch directory regardless of individual failures
  try {
    await cleanupBatch(batchDir);
    log.info(`✓ Cleaned up NFS directory: ${batchDir}`);
  } catch (err) {
    log.error(`NFS cleanup failed: ${String(err)}`);
  }

  return {
    totalImages: images.length,
    successful,
    failed,
    results: imageResults,
    processingTimeMs: Date.now() - startTime,
  };
}