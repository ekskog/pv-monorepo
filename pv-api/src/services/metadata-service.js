const debug = require("debug");
const debugMetadata = debug("pv:metadata");
const config = require("../config");

/**
 * Metadata Service - Orchestrates remote extraction and MinIO persistence
 */
class MetadataService {
  constructor(minioClient) {
    this.minioClient = minioClient;
    this.mapboxToken = config.mapbox_token;
    this.metadataUrl = config.metadata?.url || 'http://pv-metadata-service';
  }

  /**
   * Extract essential metadata via Python Microservice
   */
  async extractEssentialMetadata(buffer, filename) {
    try {
      const formData = new FormData();
      const blob = new Blob([buffer]);
      formData.append("file", blob, filename);

      const response = await fetch(`${this.metadataUrl}/extract`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Metadata service returned ${response.status}`);
      }

      const pythonData = await response.json();

      // Mapping Python response back to your specific API schema
      // Ensuring Numbers stay Numbers and Strings stay Strings
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
      debugMetadata(`Remote metadata extraction failed for ${filename}: ${error.message}`);
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
   * Update folder metadata JSON in MinIO - CRITICAL PERSISTENCE LOGIC
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
        // Create new folder metadata if it doesn't exist
        folderData = {
          folderName,
          media: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Merge new extraction with existing folder data
      const imageData = {
        sourceImage: objectName,
        timestamp: metadata.timestamp || "not captured",
        coordinates: metadata.coordinates || "not captured",
        camera: metadata.camera || "not found",
        settings: metadata.settings || "not found"
      };

      // De-duplicate: Remove old entry for this image if it exists
      folderData.media = folderData.media.filter(img => img.sourceImage !== objectName);
      folderData.media.push(imageData);
      folderData.lastUpdated = new Date().toISOString();

      // Write back to MinIO
      await this.minioClient.putObject(
        bucketName,
        jsonFileName,
        Buffer.from(JSON.stringify(folderData, null, 2))
      );

      debugMetadata(`Successfully updated metadata for ${objectName} in ${jsonFileName}`);
      return true;
    } catch (error) {
      debugMetadata(`Failed to update folder metadata: ${error.message}`);
      return false;
    }
  }
}

module.exports = MetadataService;