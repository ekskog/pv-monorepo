const exifr = require("exifr");
const sharp = require("sharp");
const debug = require("debug");
const debugMetadata = debug("pv:metadata");
const debugGps = debug("pv:metadata:gps");
const config = require("../config"); // defaults to ./config/index.js

/**
 * Optimized Metadata Service - Only extracts date and GPS location
 */
class MetadataService {
  constructor(minioClient, mapboxToken = null) {
    this.minioClient = minioClient;
    this.mapboxToken = config.mapbox_token;
    this.gpsCache = new Map(); // Cache GPS lookups
  }

  /**
   * Extract essential metadata from image buffer
   * @param {Buffer} buffer - Image buffer
   * @param {string} filename - Original filename
   * @returns {Object} Extracted metadata
   */
  async extractEssentialMetadata(buffer, filename) {
    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: "image/heic" }); // adjust based on actual type
      formData.append("file", blob, filename);

      const response = await fetch(`${config.metadata.url}/extract`, {
        method: "POST",
        body: formData,
        timeout: config.metadata.timeout,
      });

      if (!response.ok)
        throw new Error(`Metadata service failed: ${response.status}`);

      const pythonData = await response.json();

      // Map the Python service response back to your Express metadata schema
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
        },
        // ... map other fields as needed
      };
    } catch (error) {
      console.error(
        "Remote metadata extraction failed, using empty defaults:",
        error.message,
      );
      return this.getEmptyMetadata(filename); // helper to return "not found" object
    }
  }

  /**
   * Convert DMS (degrees, minutes, seconds) to decimal degrees
   * @param {number} degrees - Degrees
   * @param {number} minutes - Minutes
   * @param {number} seconds - Seconds
   * @param {string} direction - Direction (N, S, E, W)
   * @returns {number} Decimal degrees
   */
  dmsToDecimal(degrees, minutes, seconds, direction) {
    let decimal = degrees + minutes / 60 + seconds / 3600;
    if (direction === "S" || direction === "W") {
      decimal = decimal * -1;
    }
    return decimal;
  }

  /**
   * Get address from coordinates using Mapbox API
   * @param {string} coordinates - Coordinates in "lat,lng" format
   * @param {string} filename - Filename for logging
   * @returns {string} Address or error message
   */
  async getAddressFromCoordinates(coordinates) {
    if (coordinates === "not found") return "not found";

    const apiKey = this.mapboxToken;
    if (!apiKey) {
      //debugGps(`[metadata-service.js LINE 257]:  MAPBOX_TOKEN not found in environment variables`);
      return "API key not configured";
    }

    try {
      const [lat, lng] = coordinates.split(",");
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${apiKey}&types=address,poi,place`;

      //debugGps(` [metadata-service.js LINE 262]:    Coordinates: ${coordinates}`);

      const response = await fetch(url, { timeout: 5000 });

      if (!response.ok) {
        debugGps(
          `[(277)]: Mapbox API error: ${response.status} ${response.statusText}`,
        );
        return `API error: ${response.status}`;
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const address =
          feature.place_name || feature.text || "Address not found";
        //debugGps(` [(277)]:  Found address: ${address}`);
        return address;
      } else {
        //debugGps(`[(285)]:  No features found in Mapbox response`;
        return "Address not found";
      }
    } catch (error) {
      //debugGps(` [(3290)]: Error getting address for ${coordinates}: ${error.message}`);
      return "Address lookup failed";
    }
  }

  /**
   * Update folder metadata JSON with essential data only
   */
  async updateFolderMetadata(bucketName, objectName, metadata) {
    const folderName = objectName.split("/")[0];
    if (!folderName || folderName === objectName) return; // Skip root uploads
    const jsonFileName = `${folderName}/${folderName}.json`;
    //debugMetadata(`[(302)]: Bucket: ${bucketName}, Folder: ${folderName}, JSON: ${jsonFileName}`);

    try {
      let folderData;
      const chunks = [];

      try {
        //debugMetadata(`[(309)]: Attempting to retrieve existing metadata from ${jsonFileName}...`);
        const stream = await this.minioClient.getObject(
          bucketName,
          jsonFileName,
        );
        for await (const chunk of stream) chunks.push(chunk);
        const rawData = Buffer.concat(chunks).toString();
        folderData = JSON.parse(rawData);
        //debugMetadata(`[(334)]: Parsed existing metadata successfully.`);
      } catch (err) {
        //debugMetadata(`[(335)]: Could not retrieve or parse existing metadata. Reason: ${err.message}`);
        folderData = {
          folderName,
          media: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      const imageData = {
        sourceImage: objectName,
        timestamp: metadata.timestamp ?? "not captured",
        location: metadata.location ?? "not captured",
        coordinates: metadata.coordinates ?? "not captured",
        camera: metadata.camera ?? "not found",
        settings: metadata.settings ?? "not found",
        dimensions: metadata.dimensions ?? "not found",
      };

      folderData.media = folderData.media.filter(
        (img) => img.sourceImage !== objectName,
      );
      folderData.media.push(imageData);
      folderData.lastUpdated = new Date().toISOString();

      const jsonContent = Buffer.from(JSON.stringify(folderData, null, 2));
      const minioResult = await this.minioClient.putObject(
        bucketName,
        jsonFileName,
        jsonContent,
      );

      return true;
    } catch (error) {
      //debugMetadata(`[(376)]: Failed to update folder metadata: ${error.message}`);
      return false;
    }
  }
}

module.exports = MetadataService;
