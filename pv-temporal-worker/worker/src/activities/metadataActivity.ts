import * as Minio from 'minio';

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

const BULK_UPLOAD_BUCKET = MINIO_BUCKET_NAME;

async function readObjectAsString(bucketName: string, objectName: string): Promise<string | null> {
  try {
    const stream = await minioClient.getObject(bucketName, objectName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Persists metadata payload from API bulk route to folder JSON metadata in MinIO.
 * API already runs the canonical extraction pipeline (MetadataService).
 */
export async function persistMetadataForImage(
  metadata: Record<string, any> | undefined,
  objectName: string
): Promise<boolean> {
  const folderName = objectName.split('/')[0];
  if (!folderName || folderName === objectName) {
    return false;
  }

  const jsonFileName = `${folderName}/${folderName}.json`;

  try {
    const mediaEntry = {
      sourceImage: objectName,
      timestamp: metadata?.timestamp ?? 'not captured',
      location: metadata?.location ?? 'not captured',
      coordinates: metadata?.coordinates ?? 'not captured',
      camera: metadata?.camera ?? 'not found',
      settings: metadata?.settings ?? 'not found',
      dimensions: metadata?.dimensions ?? 'not found',
    };

    let folderData: any;
    const existingJson = await readObjectAsString(BULK_UPLOAD_BUCKET, jsonFileName);

    if (existingJson) {
      folderData = JSON.parse(existingJson);
    } else {
      folderData = {
        folderName,
        media: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    folderData.media = (folderData.media || []).filter((item: any) => item?.sourceImage !== objectName);
    folderData.media.push(mediaEntry);
    folderData.lastUpdated = new Date().toISOString();

    const content = Buffer.from(JSON.stringify(folderData, null, 2), 'utf-8');
    await minioClient.putObject(BULK_UPLOAD_BUCKET, jsonFileName, content, content.length, {
      'Content-Type': 'application/json',
      'X-Amz-Meta-Type': 'album-metadata',
    });

    return true;
  } catch (error) {
    console.error('Failed metadata persistence for bulk upload:', error);
    return false;
  }
}