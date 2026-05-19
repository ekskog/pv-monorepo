import { proxyActivities, log } from '@temporalio/workflow';
import type * as videoDeps from '../activities/uploadVideo';
import type * as cleanupDeps from '../activities/cleanup';

type VideoActivities = typeof videoDeps & typeof cleanupDeps;

const { uploadVideoToMinIO } = proxyActivities<VideoActivities>({
  startToCloseTimeout: '120 minutes',
  retry: { maximumAttempts: 3 },
});

const { cleanupBatch } = proxyActivities<VideoActivities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 2 },
});

export interface VideoUploadWorkflowInput {
  batchId: string;
  folder: string;
  videos: Array<{
    filename: string;
    path: string;
    contentType: string;
    objectName: string;
  }>;
}

export async function processVideoUpload(input: VideoUploadWorkflowInput): Promise<void> {
  const { batchId, folder, videos } = input;
  const batchDir = `/nfs-storage/video-${batchId}`;

  log.info('processVideoUpload: start', { batchId, folder, videoCount: videos.length });

  try {
    const result = await uploadVideoToMinIO(input);
    log.info('processVideoUpload: complete', { batchId, uploaded: result.uploaded });
  } finally {
    await cleanupBatch(batchDir);
  }
}
