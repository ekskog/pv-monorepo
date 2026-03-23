import { promises as fs } from 'fs';
import FormData from 'form-data';

const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL ||
  'http://pv-metadata-service.pv.svc.cluster.local/extract';
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'photovault';

export interface MetadataResult {
  filename: string;
  success: boolean;
  objectName: string;
}

/**
 * Calls the Python metadata microservice with the original image file.
 * The service extracts EXIF, geocodes, and writes the JSON to MinIO directly.
 */
export async function extractAndPersistMetadata(
  imagePath: string,
  filename: string,
  objectName: string,
): Promise<MetadataResult> {
  console.log(`[metadataActivity] Starting metadata extraction for ${filename} -> ${objectName}`);

  const imageBuffer = await fs.readFile(imagePath);

  const form = new FormData();
  form.append('file', imageBuffer, { filename, contentType: 'application/octet-stream' });
  form.append('object_name', objectName);
  form.append('bucket', MINIO_BUCKET);

  const response = await fetch(METADATA_SERVICE_URL, {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders(),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Metadata service returned ${response.status}: ${body}`);
  }

  const result = await response.json() as { status: string; object_name: string };

  console.log(`[metadataActivity] ✓ Metadata extracted and written to MinIO for ${filename}`);

  return {
    filename,
    success: true,
    objectName: result.object_name,
  };
}