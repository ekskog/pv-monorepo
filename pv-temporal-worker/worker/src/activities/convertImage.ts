import { promises as fs } from 'fs';
import path from 'path';

export interface ImageFile {
  filename: string;
  path: string;
  contentType: string;
}

export interface ConversionResult {
  filename: string;
  success: true;
  objectName: string;
  metrics: {
    conversionTimeSec: number;
  };
}

export interface ConversionFailure {
  filename: string;
  success: false;
  error: string;
}

export type ProcessResult = ConversionResult | ConversionFailure;

interface ConverterResponse {
  success: boolean;
  object_name: string;
  metrics: {
    memoryBeforeMB: any;
    memoryAfterMB: any;
    peakMemoryMB: number;
    conversionTimeSec: number;
  };
}

const AVIF_CONVERTER_URL = process.env.AVIF_CONVERTER_URL ||
  'http://pv-avif-converter-service.pv.svc.cluster.local:3000';
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'photovault';

export async function convertImage(image: ImageFile, objectName: string): Promise<ConversionResult> {
  console.log(`[convertImage] Starting conversion for ${image.filename} -> ${objectName}`);

  const imageBuffer = await fs.readFile(image.path);
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: image.contentType });
  formData.set('image', blob, image.filename);
  formData.set('object_name', objectName);
  formData.set('bucket', MINIO_BUCKET);

  try {
    const response = await fetch(`${AVIF_CONVERTER_URL}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[convertImage] Converter service error for ${image.filename}: ${response.status} - ${errorText}`);
      throw new Error(`Converter returned ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as ConverterResponse;

    if (!result.success) {
      console.error(`[convertImage] Converter reported failure for ${image.filename}: ${JSON.stringify(result)}`);
      throw new Error(`Converter reported failure for ${image.filename}`);
    }

    console.log(`[convertImage] ✓ Converted and written to MinIO: ${objectName}`);

    // Only clean up the NFS file after confirmed success
    try {
      await fs.unlink(image.path);
      console.log(`[convertImage] Removed intermediate file: ${image.path}`);
    } catch (e) {
      console.warn(`[convertImage] Failed to remove intermediate file ${image.path}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      filename: image.filename,
      success: true,
      objectName: result.object_name,
      metrics: result.metrics,
    };

  } catch (err) {
    // Do NOT delete the file here — Temporal will retry and needs it
    console.error(`[convertImage] Failed for ${image.filename}, leaving NFS file intact for retry`);
    throw err;
  }
}