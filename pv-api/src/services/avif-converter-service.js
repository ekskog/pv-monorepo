const debug = require("debug");
const debugConverter = debug("pv:converter");
const config = require('../config');

class AvifConverterService {
  constructor() {
    this.converterUrl = config.converter.url;
    this.converterTimeout = parseInt(config.converter.timeout);
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.converterUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      return { success: true, data: await response.json() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Convert an image to AVIF and write it directly to MinIO.
   * Returns { success, object_name } — no base64 content.
   */
  async convertImage(fileBuffer, originalName, mimeType, objectName, bucket) {
    debugConverter(`[AVIF-CONVERTER] >>> Starting conversion request for ${originalName} to ${this.converterUrl}`);
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('image', blob, originalName);
      formData.append('mimeType', mimeType);
      formData.append('object_name', objectName);
      formData.append('bucket', bucket);

      debugConverter(`[AVIF-CONVERTER] Sending POST to ${this.converterUrl}/convert...`);
      const response = await fetch(`${this.converterUrl}/convert`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.converterTimeout),
      });

      debugConverter(`[AVIF-CONVERTER] Received ${response.status} from converter for ${originalName}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Conversion failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(`Conversion failed: ${responseData.error || 'Unknown error'}`);
      }

      return { success: true, object_name: responseData.object_name };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkAllServicesHealth() {
    const health = await this.checkHealth();
    return {
      converter: health,
      overallStatus: health.success ? 'healthy' : 'degraded'
    };
  }

  async isAvailable() {
    const health = await this.checkHealth();
    return health.success;
  }
}

module.exports = AvifConverterService;