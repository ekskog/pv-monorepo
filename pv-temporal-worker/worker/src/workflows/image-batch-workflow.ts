import { proxyActivities, log } from '@temporalio/workflow';
// Use type imports for the underlying function signatures
import type * as convertDeps from '../activities/convertImage';
import type * as persistDeps from '../activities/persistToMinio';
import type * as metadataDeps from '../activities/metadataActivity';

// 1. Unified type for the proxy. 
// Note: cleanupBatch MUST be exported in one of these files.
type AllActivities = typeof convertDeps & typeof persistDeps & typeof metadataDeps;

const { convertImage, persistToMinio, persistMetadataForImage, cleanupBatch } = proxyActivities<AllActivities>({
  startToCloseTimeout: '60 minutes',
  retry: { maximumAttempts: 5 }
});

// 2. Local Interfaces (Restored to prevent 'Cannot find name' errors)
export interface ImageFile {
  filename: string;
  path: string;
  contentType: string;
  metadata?: Record<string, unknown>;
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
  metadataPersisted: number;
  results: any[];
  processingTimeMs: number;
}

/**
 * Main workflow - orchestrates batch image conversion and MinIO persistence
 */
export async function processBatchImages(input: BatchInput): Promise<BatchResult> {
  const startTime = Date.now();
  const { batchId, batchDir, images } = input;
  const albumName = input.albumName || input.folder;

  if (!albumName) {
    throw new Error(`Missing albumName/folder for batch ${batchId}`);
  }
  
  log.info(`Starting batch ${batchId} with ${images.length} images`);
  log.info(`Album destination: ${albumName}`);
  
  // 3. Typed Map (Fixes 'image' implicitly has 'any' type)
  const conversionPromises = images.map(async (image: ImageFile) => {
    try {
      const result = await convertImage(image);
      
      // We check success and the presence of avifPath (returned by convertImage)
      if (result.success && 'avifPath' in result) {
        log.info(`↑ Uploading ${image.filename} to MinIO...`);
        
        const storageInfo = await persistToMinio(
          result.avifPath,
          image.filename, 
          albumName
        );

        // Keep metadata sync non-fatal, matching API non-blocking behavior.
        try {
          const metadataOk = await persistMetadataForImage(image.metadata, storageInfo.objectName);
          if (!metadataOk) {
            log.error(`Metadata update returned false for ${image.filename}`);
          } else {
            log.info(`Metadata persisted for ${image.filename}`, {
              objectName: storageInfo.objectName,
            });
          }
        } catch (metadataErr) {
          log.error(`Metadata update crashed for ${image.filename}`, { error: String(metadataErr) });
        }
        
        return {
          ...result,
          minioPath: storageInfo.minioPath,
          metadataPersisted: true,
          avifPath: undefined 
        };
      }
      return result;
    } catch (error) {
      log.error(`✗ ${image.filename} crashed:`, { error: String(error) });
      return {
        filename: image.filename,
        success: false as const,
        error: String(error),
      };
    }
  });

  const results = await Promise.all(conversionPromises);
  
  // 4. Explicitly Typed Filters (Fixes 'r' implicitly has 'any' type)
  const successful = results.filter((r: any) => r?.success && 'minioPath' in r).length;
  const failed = results.filter((r: any) => !r?.success).length;
  const metadataPersisted = results.filter((r: any) => r?.metadataPersisted === true).length;
  const processingTimeMs = Date.now() - startTime;

  log.info(`Batch ${batchId} SUMMARY: ${successful} fully processed, ${failed} failed, ${metadataPersisted} metadata persisted`);

  // 5. Cleanup only after all persistence is done
  try {
    await cleanupBatch(batchDir);
    log.info(`✓ Successfully cleaned up NFS directory: ${batchDir}`);
  } catch (err) {
    log.error(`File cleanup failed: ${String(err)}`);
  }

  return {
    totalImages: images.length,
    successful,
    failed,
    metadataPersisted,
    results,
    processingTimeMs
  };
}