// Use the full exifr build — required for HEIC/ISOBMFF support.
// The default exifr entry point does not include the HEIC parser.
const exifr = require("exifr/dist/full.umd.cjs");
const debug = require("debug");
const debugMetadata = debug("pv:metadata");
const debugGps = debug("pv:metadata:gps");
const config = require('../config'); // defaults to ./config/index.js

/**
 * Optimized Metadata Service - Only extracts date and GPS location
 */
class MetadataService {
  constructor(minioClient, mapboxToken = null) {
    this.minioClient = minioClient;
    this.mapboxToken = config.mapbox_token;
    this.gpsCache = new Map(); // Cache GPS lookups
  }

  // Helper: dump initial header as hex string
  headerHex(buf, len = 32) {
    if (!buf) return '';
    const slice = buf.slice(0, Math.min(len, buf.length));
    const hex = Buffer.from(slice).toString('hex');
    const parts = hex.match(/.{1,2}/g) || [];
    return parts.join(' ');
  }

  isJpeg(buf) {
    return buf && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
  }

  isHeic(buf) {
    // ISO BMFF: at offset 4 must be 'ftyp' and major brand at offset 8 often 'heic','heix','hevc','mif1'
    if (!buf || buf.length < 12) return false;
    const box = buf.toString('ascii', 4, 8);
    if (box !== 'ftyp') return false;
    const brand = buf.toString('ascii', 8, 12);
    return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
  }

  /**
   * Build exifr parse options appropriate for the file type.
   * HEIC files need heic:true and tiff:true to locate the embedded EXIF block.
   */
  buildParseOptions(isHeicFile = false) {
    return {
      gps: true,
      // Enable HEIC container + embedded TIFF/EXIF parsing when needed.
      // These flags are ignored by the default exifr build, which is why
      // we switched to exifr/dist/full.umd.cjs above.
      heic: isHeicFile,
      tiff: true,
      icc: false,   // skip — not needed, saves time
      iptc: false,  // skip — not needed
      xmp: false,   // skip — not needed
      pick: [
        // Date/time
        "DateTimeOriginal",
        "CreateDate",
        "DateTime",
        "DateTimeDigitized",
        // GPS
        "latitude",
        "longitude",
        "GPSLatitude",
        "GPSLongitude",
        "GPSLatitudeRef",
        "GPSLongitudeRef",
        // Camera info
        "Make",
        "Model",
        "Software",
        "LensModel",
        // Photo settings
        "ISO",
        "ISOSpeedRatings",
        "FNumber",
        "ApertureValue",
        "ExposureTime",
        "ShutterSpeedValue",
        "FocalLength",
        "Flash",
        "WhiteBalance",
        // Image properties
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
        "Orientation",
        "ColorSpace",
        "XResolution",
        "YResolution",
      ],
    };
  }

  /**
   * Extract essential metadata from image buffer
   * @param {Buffer} buffer - Image buffer
   * @param {string} filename - Original filename
   * @returns {Object} Extracted metadata
   */
  async extractEssentialMetadata(buffer, filename) {
    const emptyMetadata = () => ({
      sourceImage: filename,
      timestamp: "not found",
      coordinates: "not found",
      location: "not found",
      camera: {
        make: "not found",
        model: "not found",
        software: "not found",
        lens: "not found",
      },
      settings: {
        iso: "not found",
        aperture: "not found",
        shutterSpeed: "not found",
        focalLength: "not found",
        flash: "not found",
        whiteBalance: "not found",
      },
      dimensions: {
        width: "not found",
        height: "not found",
        orientation: "not found",
        colorSpace: "not found",
        resolution: {
          x: "not found",
          y: "not found",
        },
      },
    });

    try {
      debugMetadata(`[(25)] > Extracting metadata from: ${filename}`);

      const heicFile = this.isHeic(buffer);

      try {
        debugMetadata(`[(25.1)] Header: ${this.headerHex(buffer, 32)}`);
        debugMetadata(`[(25.2)] isJPEG: ${this.isJpeg(buffer)}, isHEIC: ${heicFile}`);
      } catch (hdrErr) {
        debugMetadata(`[(25.3)] Header inspection failed: ${hdrErr.message}`);
      }

      const parseOptions = this.buildParseOptions(heicFile);

      let exifData;
      try {
        exifData = await exifr.parse(buffer, parseOptions);
      } catch (err) {
        debugMetadata(`[(48)]: exifr.parse threw for ${filename}: ${err.stack || err.message}`);
        debugMetadata(`[(49)]: buffer info: typeof=${typeof buffer}, isBuffer=${Buffer.isBuffer(buffer)}, length=${buffer?.length}, byteLength=${buffer?.byteLength}`);
        debugMetadata(`[(50)]: header64: ${this.headerHex(buffer, 64)}`);

        // Fallback 1: Uint8Array — helps when exifr expects typed arrays
        try {
          if (Buffer.isBuffer(buffer)) {
            const arr = new Uint8Array(buffer);
            exifData = await exifr.parse(arr, parseOptions);
            debugMetadata(`[(54)]: exifr.parse succeeded with Uint8Array fallback for ${filename}`);
          } else if (buffer && buffer.buffer) {
            exifData = await exifr.parse(buffer.buffer, parseOptions);
            debugMetadata(`[(56)]: exifr.parse succeeded with ArrayBuffer fallback for ${filename}`);
          }
        } catch (fallbackErr) {
          debugMetadata(`[(60)]: exifr fallback attempts failed for ${filename}: ${fallbackErr.stack || fallbackErr.message}`);
          // Return empty rather than throw — a metadata failure should not crash the upload pipeline
          return emptyMetadata();
        }
      }

      const metadata = emptyMetadata();

      if (exifData) {
        debugMetadata(`[(122)]: Extracted EXIF data for ${filename}:`, exifData);

        // Extract timestamp — prefer DateTimeOriginal, fall back through alternatives
        const dateFields = [
          "DateTimeOriginal",
          "CreateDate",
          "DateTime",
          "DateTimeDigitized",
        ];
        for (const field of dateFields) {
          if (exifData[field]) {
            debugMetadata(`[(128)]: Found date field ${field} for ${filename}: ${exifData[field]}`);
            try {
              metadata.timestamp = new Date(exifData[field]).toISOString();
              break;
            } catch (e) {
              continue;
            }
          }
        }

        // Extract GPS coordinates
        let lat, lng;

        // Method 1: Direct decimal coordinates (exifr resolves these automatically)
        if (exifData.latitude && exifData.longitude) {
          lat = exifData.latitude;
          lng = exifData.longitude;
        }
        // Method 2: DMS format conversion (fallback if decimal not present)
        else if (
          exifData.GPSLatitude &&
          exifData.GPSLongitude &&
          Array.isArray(exifData.GPSLatitude) &&
          Array.isArray(exifData.GPSLongitude)
        ) {
          const latDMS = exifData.GPSLatitude;
          const lngDMS = exifData.GPSLongitude;
          const latRef = exifData.GPSLatitudeRef || "N";
          const lngRef = exifData.GPSLongitudeRef || "E";

          if (latDMS.length >= 3 && lngDMS.length >= 3) {
            lat = this.dmsToDecimal(latDMS[0], latDMS[1], latDMS[2], latRef);
            lng = this.dmsToDecimal(lngDMS[0], lngDMS[1], lngDMS[2], lngRef);
          }
        }

        if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
          metadata.coordinates = `${lat},${lng}`;
          metadata.location = await this.getAddressFromCoordinates(metadata.coordinates, filename);
        } else {
          debugGps(`[(207)]: No valid GPS coordinates found for ${filename}`);
        }

        // Camera info
        metadata.camera.make     = exifData.Make      || "not found";
        metadata.camera.model    = exifData.Model     || "not found";
        metadata.camera.software = exifData.Software  || "not found";
        metadata.camera.lens     = exifData.LensModel || "not found";

        // Photo settings
        metadata.settings.iso          = exifData.ISO           || exifData.ISOSpeedRatings || "not found";
        metadata.settings.aperture     = exifData.FNumber       || exifData.ApertureValue   || "not found";
        metadata.settings.shutterSpeed = exifData.ExposureTime  || exifData.ShutterSpeedValue || "not found";
        metadata.settings.focalLength  = exifData.FocalLength   || "not found";
        metadata.settings.flash        = exifData.Flash         || "not found";
        metadata.settings.whiteBalance = exifData.WhiteBalance  || "not found";

        // Dimensions
        metadata.dimensions.width       = exifData.ImageWidth   || exifData.ExifImageWidth  || "not found";
        metadata.dimensions.height      = exifData.ImageHeight  || exifData.ExifImageHeight || "not found";
        metadata.dimensions.orientation = exifData.Orientation  || "not found";
        metadata.dimensions.colorSpace  = exifData.ColorSpace   || "not found";
        metadata.dimensions.resolution.x = exifData.XResolution || "not found";
        metadata.dimensions.resolution.y = exifData.YResolution || "not found";
      }

      debugMetadata(`[(263)]: Final extracted metadata for ${filename}:`, metadata);
      return metadata;

    } catch (error) {
      debugMetadata(`Error extracting metadata from ${filename}:`, error.message);
      return emptyMetadata();
    }
  }

  /**
   * Convert DMS (degrees, minutes, seconds) to decimal degrees
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
  async getAddressFromCoordinates(coordinates, filename) {
    if (coordinates === "not found") return "not found";

    const apiKey = this.mapboxToken;
    if (!apiKey) {
      debugGps(`[metadata-service.js]: MAPBOX_TOKEN not found in environment variables`);
      return "API key not configured";
    }

    try {
      const [lat, lng] = coordinates.split(",");
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${apiKey}&types=address,poi,place`;

      debugGps(`[metadata-service.js]: Reverse geocoding coordinates: ${coordinates} for ${filename}`);

      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (!response.ok) {
        debugGps(`[(277)]: Mapbox API error: ${response.status} ${response.statusText}`);
        return `API error: ${response.status}`;
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const address = feature.place_name || feature.text || "Address not found";
        debugGps(`[(277)]: Found address: ${address}`);
        return address;
      } else {
        debugGps(`[(285)]: No features found in Mapbox response`);
        return "Address not found";
      }
    } catch (error) {
      debugGps(`[(290)]: Error getting address for ${coordinates} (${filename}): ${error.message}`);
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
    debugMetadata(`[(302)]: Bucket: ${bucketName}, Folder: ${folderName}, JSON: ${jsonFileName}`);

    try {
      let folderData;
      const chunks = [];

      try {
        debugMetadata(`[(309)]: Attempting to retrieve existing metadata from ${jsonFileName}...`);
        const stream = await this.minioClient.getObject(bucketName, jsonFileName);
        for await (const chunk of stream) chunks.push(chunk);
        const rawData = Buffer.concat(chunks).toString();
        folderData = JSON.parse(rawData);
        debugMetadata(`[(334)]: Parsed existing metadata successfully.`);
      } catch (err) {
        debugMetadata(`[(335)]: Could not retrieve or parse existing metadata. Reason: ${err.message}`);
        folderData = {
          folderName,
          media: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      const imageData = {
        sourceImage: objectName,
        timestamp:   metadata.timestamp   ?? "not captured",
        location:    metadata.location    ?? "not captured",
        coordinates: metadata.coordinates ?? "not captured",
        camera:      metadata.camera      ?? "not found",
        settings:    metadata.settings    ?? "not found",
        dimensions:  metadata.dimensions  ?? "not found",
      };

      folderData.media = folderData.media.filter(
        (img) => img.sourceImage !== objectName
      );
      folderData.media.push(imageData);
      folderData.lastUpdated = new Date().toISOString();

      const jsonContent = Buffer.from(JSON.stringify(folderData, null, 2));
      await this.minioClient.putObject(bucketName, jsonFileName, jsonContent);

      return true;
    } catch (error) {
      debugMetadata(`[(376)]: Failed to update folder metadata: ${error.message}`);
      return false;
    }
  }
}

module.exports = MetadataService;