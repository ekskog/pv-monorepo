// Force rebuild: 23/03 09:26
const exifr = require("exifr");
const { exiftool } = require("exiftool-vendored");
const os = require("os");
const fs = require("fs");
const path = require("path");
const debug = require("debug");
const debugMetadata = debug("pv:metadata");
const debugGps = debug("pv:metadata:gps");
const config = require("../config");

class MetadataService {
  constructor(minioClient) {
    this.minioClient = minioClient;
    this.mapboxToken = config.mapbox_token;
  }

  isHeic(buf) {
    if (!buf || buf.length < 12) return false;
    const box = buf.toString("ascii", 4, 8);
    if (box !== "ftyp") return false;
    const brand = buf.toString("ascii", 8, 12);
    return ["heic", "heix", "hevc", "mif1", "msf1"].includes(brand);
  }

  emptyMetadata(filename) {
    return {
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
        resolution: { x: "not found", y: "not found" },
      },
    };
  }

  /**
   * Fire-and-forget call to the Python metadata microservice.
   * Results are logged only — does not affect the existing extraction flow.
   */
  async callPythonService(buffer, filename) {
    const url = `http://pv-metadata-service/extract`;
    try {
      //debugMetadata(`[python] Calling Python metadata service for ${filename}`);

      const FormData = require("form-data");
      const form = new FormData();
      form.append("file", buffer, { filename, contentType: "image/heic" });

      const response = await fetch(url, {
        method: "POST",
        body: form.getBuffer(),
        headers: form.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        //debugMetadata(`[python] Service returned ${response.status} for ${filename}`);
        return;
      }

      const result = await response.json();
      //debugMetadata(`[python] Result for ${filename}: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      //debugMetadata(`[python] Call failed for ${filename}: ${err.message}`);
    }
  }

  /**
   * Extract metadata from a HEIC file using exiftool-vendored.
   * Writes buffer to a temp file, reads tags, cleans up.
   */
  async extractHeicMetadata(buffer, filename) {
    const tmp = path.join(os.tmpdir(), `pv-${Date.now()}-${filename}`);
    try {
      fs.writeFileSync(tmp, buffer);
      return await exiftool.read(tmp);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch (_) {}
    }
  }

  /**
   * Extract essential metadata from image buffer
   */
  async extractEssentialMetadata(buffer, filename) {
    const metadata = this.emptyMetadata(filename);

    try {
      //debugMetadata(`Extracting metadata from: ${filename}`);

      // Fire Python service in parallel — logs only, does not affect this flow
      this.callPythonService(buffer, filename).catch(() => {});

      let raw;

      if (this.isHeic(buffer)) {
        //debugMetadata(`HEIC detected, using exiftool-vendored for ${filename}`);
        raw = await this.extractHeicMetadata(buffer, filename);

        const date = raw.DateTimeOriginal || raw.CreateDate || raw.DateTime;
        if (date) {
          try {
            metadata.timestamp = new Date(date).toISOString();
          } catch (_) {}
        }

        const lat = raw.GPSLatitude;
        const lng = raw.GPSLongitude;
        if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
          metadata.coordinates = `${lat},${lng}`;
          metadata.location = await this.getAddressFromCoordinates(
            metadata.coordinates,
            filename,
          );
        }

        metadata.camera.make = raw.Make || "not found";
        metadata.camera.model = raw.Model || "not found";
        metadata.camera.software = raw.Software || "not found";
        metadata.camera.lens = raw.LensModel || "not found";

        metadata.settings.iso = raw.ISO || "not found";
        metadata.settings.aperture = raw.FNumber || "not found";
        metadata.settings.shutterSpeed = raw.ExposureTime || "not found";
        metadata.settings.focalLength = raw.FocalLength || "not found";
        metadata.settings.flash = raw.Flash || "not found";
        metadata.settings.whiteBalance = raw.WhiteBalance || "not found";

        metadata.dimensions.width =
          raw.ImageWidth || raw.ExifImageWidth || "not found";
        metadata.dimensions.height =
          raw.ImageHeight || raw.ExifImageHeight || "not found";
        metadata.dimensions.orientation = raw.Orientation || "not found";
        metadata.dimensions.colorSpace = raw.ColorSpace || "not found";
        metadata.dimensions.resolution.x = raw.XResolution || "not found";
        metadata.dimensions.resolution.y = raw.YResolution || "not found";
      } else {
        //debugMetadata(`Non-HEIC, using exifr for ${filename}`);
        raw = await exifr.parse(buffer, {
          gps: true,
          tiff: true,
          icc: false,
          iptc: false,
          xmp: false,
          pick: [
            "DateTimeOriginal",
            "CreateDate",
            "DateTime",
            "DateTimeDigitized",
            "latitude",
            "longitude",
            "GPSLatitude",
            "GPSLongitude",
            "GPSLatitudeRef",
            "GPSLongitudeRef",
            "Make",
            "Model",
            "Software",
            "LensModel",
            "ISO",
            "ISOSpeedRatings",
            "FNumber",
            "ApertureValue",
            "ExposureTime",
            "ShutterSpeedValue",
            "FocalLength",
            "Flash",
            "WhiteBalance",
            "ImageWidth",
            "ImageHeight",
            "ExifImageWidth",
            "ExifImageHeight",
            "Orientation",
            "ColorSpace",
            "XResolution",
            "YResolution",
          ],
        });

        if (!raw) {
          //debugMetadata(`No EXIF data found for ${filename}`);
          return metadata;
        }

        for (const field of [
          "DateTimeOriginal",
          "CreateDate",
          "DateTime",
          "DateTimeDigitized",
        ]) {
          if (raw[field]) {
            try {
              metadata.timestamp = new Date(raw[field]).toISOString();
              break;
            } catch (_) {}
          }
        }

        let lat =
          raw.latitude ??
          (Array.isArray(raw.GPSLatitude)
            ? this.dmsToDecimal(...raw.GPSLatitude, raw.GPSLatitudeRef || "N")
            : undefined);
        let lng =
          raw.longitude ??
          (Array.isArray(raw.GPSLongitude)
            ? this.dmsToDecimal(...raw.GPSLongitude, raw.GPSLongitudeRef || "E")
            : undefined);

        if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
          metadata.coordinates = `${lat},${lng}`;
          metadata.location = await this.getAddressFromCoordinates(
            metadata.coordinates,
            filename,
          );
        }

        metadata.camera.make = raw.Make || "not found";
        metadata.camera.model = raw.Model || "not found";
        metadata.camera.software = raw.Software || "not found";
        metadata.camera.lens = raw.LensModel || "not found";

        metadata.settings.iso = raw.ISO || raw.ISOSpeedRatings || "not found";
        metadata.settings.aperture =
          raw.FNumber || raw.ApertureValue || "not found";
        metadata.settings.shutterSpeed =
          raw.ExposureTime || raw.ShutterSpeedValue || "not found";
        metadata.settings.focalLength = raw.FocalLength || "not found";
        metadata.settings.flash = raw.Flash || "not found";
        metadata.settings.whiteBalance = raw.WhiteBalance || "not found";

        metadata.dimensions.width =
          raw.ImageWidth || raw.ExifImageWidth || "not found";
        metadata.dimensions.height =
          raw.ImageHeight || raw.ExifImageHeight || "not found";
        metadata.dimensions.orientation = raw.Orientation || "not found";
        metadata.dimensions.colorSpace = raw.ColorSpace || "not found";
        metadata.dimensions.resolution.x = raw.XResolution || "not found";
        metadata.dimensions.resolution.y = raw.YResolution || "not found";
      }

      //debugMetadata(`Final metadata for ${filename}:`, metadata);
      return metadata;
    } catch (error) {
      //debugMetadata(`Error extracting metadata from ${filename}: ${error.message}`);
      return this.emptyMetadata(filename);
    }
  }

  dmsToDecimal(degrees, minutes, seconds, direction) {
    let decimal = degrees + minutes / 60 + seconds / 3600;
    if (direction === "S" || direction === "W") decimal *= -1;
    return decimal;
  }

  async getAddressFromCoordinates(coordinates, filename) {
    if (!coordinates || coordinates === "not found") return "not found";
    if (!this.mapboxToken) {
      //debugGps(`MAPBOX_TOKEN not configured`);
      return "API key not configured";
    }

    try {
      const [lat, lng] = coordinates.split(",");
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${this.mapboxToken}&types=address,poi,place`;
      //debugGps(`Reverse geocoding: ${coordinates} for ${filename}`);

      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return `API error: ${response.status}`;

      const data = await response.json();
      if (data.features?.length > 0) {
        const address =
          data.features[0].place_name ||
          data.features[0].text ||
          "Address not found";
        //debugGps(`Found address: ${address}`);
        return address;
      }
      return "Address not found";
    } catch (error) {
      //debugGps(`Address lookup failed for ${coordinates}: ${error.message}`);
      return "Address lookup failed";
    }
  }

  async updateFolderMetadata(bucketName, objectName, metadata) {
    const folderName = objectName.split("/")[0];
    if (!folderName || folderName === objectName) return;
    const jsonFileName = `${folderName}/${folderName}.json`;

    try {
      let folderData;
      try {
        const chunks = [];
        const stream = await this.minioClient.getObject(
          bucketName,
          jsonFileName,
        );
        for await (const chunk of stream) chunks.push(chunk);
        folderData = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        folderData = {
          folderName,
          media: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      folderData.media = folderData.media.filter(
        (img) => img.sourceImage !== objectName,
      );
      folderData.media.push({
        sourceImage: objectName,
        timestamp: metadata.timestamp ?? "not captured",
        location: metadata.location ?? "not captured",
        coordinates: metadata.coordinates ?? "not captured",
        camera: metadata.camera ?? "not found",
        settings: metadata.settings ?? "not found",
        dimensions: metadata.dimensions ?? "not found",
      });
      folderData.lastUpdated = new Date().toISOString();

      await this.minioClient.putObject(
        bucketName,
        jsonFileName,
        Buffer.from(JSON.stringify(folderData, null, 2)),
      );
      return true;
    } catch (error) {
      //debugMetadata(`Failed to update folder metadata: ${error.message}`);
      return false;
    }
  }
}

module.exports = MetadataService;
