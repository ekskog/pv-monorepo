import * as Minio from 'minio';
import { promises as fs } from 'fs';
import path from 'path'; // Add this at the top if not there

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'mjolnir';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'photovault';

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required for worker persistence');
}

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// Contract: temporal bulk uploads persist under the configured bucket.
const BULK_UPLOAD_BUCKET = MINIO_BUCKET_NAME;

/**
 * Moves the converted file from the NFS scratchpad to MinIO storage.
 */
export async function persistToMinio(
  avifPath: string,
  filename: string,
  albumName: string
): Promise<{ minioPath: string; objectName: string }> {
  // Use path.parse to get the name without the extension (e.g., "003.JPG" -> "003")
  const fileNameWithoutExt = path.parse(filename).name;
  const objectName = `${albumName}/${fileNameWithoutExt}.avif`;

  try {
    const avifBuffer = await fs.readFile(avifPath);

    await minioClient.putObject(
      BULK_UPLOAD_BUCKET,
      objectName,
      avifBuffer,
      avifBuffer.length,
      { 'Content-Type': 'image/avif' }
    );

    console.log(`✓ Persisted to MinIO: ${BULK_UPLOAD_BUCKET}/${objectName}`);
    return {
      minioPath: `${BULK_UPLOAD_BUCKET}/${objectName}`,
      objectName,
    };
  } catch (error) {
    console.error(`Failed MinIO upload:`, error);
    throw error;
  }
}

export async function cleanupBatch(batchDir: string): Promise<void> {
  await fs.rm(batchDir, { recursive: true, force: true });
}