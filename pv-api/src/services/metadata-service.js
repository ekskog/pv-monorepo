const sharp = require("sharp");
const debug = require("debug");
const debugMetadata = debug("pv:metadata");
const debugGps = debug("pv:metadata:gps");
const config = require("../config");

/**
 * Optimized Metadata Service - Delegates extraction to pv-metadata microservice
 */
class MetadataService {
  constructor(minioClient) {
    this.minioClient = minioClient;
    this.mapboxToken = config.mapbox_token;
    // The internal K3s URL for your Python service
    this.metadataUrl = config.metadata?.url || 'http://pv-metadata-service';
  }

  /**
   * Extract essential metadata from image buffer via Python Microservice
   */
  async extractEssentialMetadata(buffer, filename) {
    try {
      const formData = new FormData();
      // Node 22 native Blob and FormData
      const blob = new Blob([buffer]);
      formData.append("file", blob, filename);

      const response = await fetch(`${this.metadataUrl}/extract`, {
        method: "POST",
        body: formData,
        // Using a standard signal for timeout if needed, or rely on K8s/Node defaults
      });

      if (!response.ok) {
        throw new Error(`Metadata service returned ${response.status}`);
      }

      const pythonData = await response.json();

      // Map Python response back to your existing API schema
      return {
        sourceImage: filename,
        timestamp: pythonData.device?.created_at || "not found",
        coordinates: pythonData.location
          ? `${pythonData.location.lat},${pythonData.location.lon}`
          : "not found",
        camera: {
          make: pythonData.device?.make || "not found",
          model: pythonData.device?.model || "not found",
          software: pythonData.device?.software || "not found",
        },
        settings: {
          iso: pythonData.exposure?.iso || "not found",
          aperture: pythonData.exposure?.f_number || "not found",
          shutterSpeed: pythonData.exposure?.exposure_time || "not found",
        }
      };
    } catch (error) {
      console.error(`Remote metadata extraction failed for ${filename}:`, error.message);
      return this.getEmptyMetadata(filename);
    }
  }

  /**
   * Helper to provide default structure on failure
   */
  getEmptyMetadata(filename) {
    return {
      sourceImage: filename,
      timestamp: "not found",
      coordinates: "not found",
      camera: { make: "not found", model: "not found", software: "not found" },
      settings: { iso: "not found", aperture: "not found", shutterSpeed: "not found" }
    };
  }

  /**
   * Get address from coordinates using Mapbox API
   */
  async getAddressFromCoordinates(coordinates) {
    if (!coordinates || coordinates === "not found") return "not found";

    const apiKey = this.mapboxToken;
    if (!apiKey) return "API key not configured";

    try {
      const [lat, lng] = coordinates.split(",");
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${apiKey}&types=address,poi,place`;

      const response = await fetch(url);
      if (!response.ok) return `API error: ${response.status}`;

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features[0].place_name || "Address not found";
      }
      return "Address not found";
    } catch (error) {
      return "Address lookup failed";
    }
  }

  /**
   * Update folder metadata JSON in MinIO
   */
  async updateFolderMetadata(bucketName, objectName, metadata) {
    const parts = objectName.split("/");
    const folderName = parts[0];
    if (!folderName || folderName === objectName) return; 
    
    const jsonFileName = `${folderName}/${folderName}.json`;

    try {
      let folderData;
      try {
        const stream = await this.minioClient.getObject(bucketName, jsonFileName);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        folderData = JSON.parse(Buffer.concat(chunks).toString());
      } catch (err) {
        folderData = {
          folderName,
          media: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      const imageData = {
        sourceImage: objectName,
        timestamp: metadata.timestamp || "not captured",
        coordinates: metadata.coordinates || "not captured",
        camera: metadata.camera || "not found",
        settings: metadata.settings || "not found"
      };

      folderData.media = folderData.media.filter(img => img.sourceImage !== objectName);
      folderData.media.push(imageData);
      folderData.lastUpdated = new Date().toISOString();

      await this.minioClient.putObject(
        bucketName,
        jsonFileName,
        Buffer.from(JSON.stringify(folderData, null, 2))
      );

      return true;
    } catch (error) {
      debugMetadata(`Failed to update folder metadata: ${error.message}`);
      return false;
    }
  }
}

module.exports = MetadataService;