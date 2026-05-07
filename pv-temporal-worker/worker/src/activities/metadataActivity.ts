import { promises as fs } from 'fs';

const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL ||
  'http://pv-metadata-service.pv.svc.cluster.local/extract';
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'photovault';

export interface MetadataResult {
  filename: string;
  success: boolean;
  objectName: string;
  metrics: {
    metadataTimeMs: number | null;
  };
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
  const blob = new Blob([imageBuffer], { type: 'application/octet-stream' });
  form.set('file', blob, filename);
  form.set('object_name', objectName);
  form.set('bucket', MINIO_BUCKET);

  const response = await fetch(METADATA_SERVICE_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Metadata service returned ${response.status}: ${body}`);
  }

  const result = await response.json() as { status: string; object_name: string };

  // console.log(`[metadataActivity] ✓ Metadata extracted and written to MinIO for ${filename}`);

  const metadataTimeMs = Date.now() - (response?.headers?.get('x-start-ts') ? Number(response.headers.get('x-start-ts')) : 0);

  return {
    filename,
    success: true,
    objectName: result.object_name,
    // include basic timing so workflows can compute averages
    metrics: {
      metadataTimeMs: metadataTimeMs > 0 ? metadataTimeMs : null,
    },
  };
}