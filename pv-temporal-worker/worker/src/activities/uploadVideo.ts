import { createReadStream, statSync } from 'fs';
import { promises as fs } from 'fs';
import { Client as MinioClient } from 'minio';

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'mjolnir',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'photovault';

export interface VideoFile {
  filename: string;
  path: string;
  contentType: string;
  objectName: string;
}

export interface VideoUploadInput {
  batchId: string;
  folder: string;
  videos: VideoFile[];
}

export async function uploadVideoToMinIO(input: VideoUploadInput): Promise<{ uploaded: string[] }> {
  const uploaded: string[] = [];
  for (const video of input.videos) {
    const stat = statSync(video.path);
    const stream = createReadStream(video.path);
    await minioClient.putObject(
      MINIO_BUCKET,
      video.objectName,
      stream,
      stat.size,
      { 'Content-Type': video.contentType }
    );
    console.log(`[uploadVideo] Uploaded ${video.objectName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    uploaded.push(video.objectName);
    await fs.unlink(video.path).catch(() => {});
  }
  return { uploaded };
}
