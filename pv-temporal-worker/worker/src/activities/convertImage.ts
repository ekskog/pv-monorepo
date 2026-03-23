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

  const response = await fetch(`${AVIF_CONVERTER_URL}/convert`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Converter returned ${response.status}: ${errorText}`);
  }

  const result = await response.json() as ConverterResponse;

  if (!result.success) {
    throw new Error(`Converter reported failure for ${image.filename}`);
  }

  console.log(`[convertImage] ✓ Converted and written to MinIO: ${objectName}`);

  return {
    filename: image.filename,
    success: true,
    objectName: result.object_name,
    metrics: result.metrics,
  };
}