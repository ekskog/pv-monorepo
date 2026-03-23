const AvifConverterService = require("./avif-converter-service");
const FormData = require("form-data");
const fs = require("fs");
const util = require("util");
const readFile = util.promisify(fs.readFile);
const unlink = util.promisify(fs.unlink);
const debug = require("debug");
const debugUpload = debug("pv:upload-service");

const METADATA_SERVICE_URL = "http://pv-metadata-service/extract";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "photovault";

class UploadService {
  constructor(minioClient) {
    this.minioClient = minioClient;
    this.avifConverter = new AvifConverterService();
  }

  /**
   * Predict the final AVIF object name from folder + original filename.
   * e.g. "test" + "IMG_4293.HEIC" -> "test/IMG_4293.avif"
   */
  _predictObjectName(folderPath, originalname) {
    const base = originalname.replace(/\.[^.]+$/, ".avif");
    return folderPath ? `${folderPath.replace(/\/$/, "")}/${base}` : base;
  }

  /**
   * Roll back MinIO objects written by the microservices.
   * Deletes AVIF and the image's entry cannot be individually removed from the JSON,
   * so we delete the whole JSON key only if it was freshly created (best effort).
   */
  async _rollback(objectNames) {
    for (const name of objectNames) {
      if (!name) continue;
      try {
        await this.minioClient.removeObject(MINIO_BUCKET, name);
        debugUpload(`[ROLLBACK] Deleted ${MINIO_BUCKET}/${name}`);
      } catch (err) {
        debugUpload(`[ROLLBACK] Failed to delete ${name}: ${err.message}`);
      }
    }
  }

  /**
   * Call the Python metadata microservice.
   */
  async _callMetadataService(buffer, originalname, objectName) {
    const form = new FormData();
    form.append("file", buffer, { filename: originalname, contentType: "application/octet-stream" });
    form.append("object_name", objectName);
    form.append("bucket", MINIO_BUCKET);

    const response = await fetch(METADATA_SERVICE_URL, {
      method: "POST",
      body: form.getBuffer(),
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Metadata service returned ${response.status}: ${body}`);
    }

    return response.json();
  }

  /**
   * Process and upload a single file.
   */
  async processAndUploadFile(file, bucketName, folderPath = "") {
    let { mimetype, originalname, buffer } = file;
    debugUpload(`Processing file: ${originalname} (${mimetype})`);

    try {
      // Read from disk if multer used diskStorage
      if ((!buffer || buffer.length === 0) && file.path) {
        try {
          buffer = await readFile(file.path);
          file.buffer = buffer;
          file.size = buffer.length;
        } catch (fsErr) {
          debugUpload(`Failed to read temp file ${file.path}: ${fsErr.message}`);
        }
      }

      // ── Video ──────────────────────────────────────────────────────────────
      if (["video/mp4", "video/mov", "video/avi", "video/quicktime"].includes(mimetype)) {
        debugUpload(`File identified as video: ${originalname}`);
        const result = await this.processVideoFile(file, bucketName, folderPath);
        debugUpload(`Video upload complete: ${originalname}`);
        return result;
      }

      // ── Image ──────────────────────────────────────────────────────────────
      if (mimetype !== "image/heic" && mimetype !== "image/jpeg") {
        debugUpload(`Unsupported image subtype: ${mimetype} for ${originalname}`);
        return null;
      }

      const objectName = this._predictObjectName(folderPath, originalname);
      debugUpload(`Predicted object name: ${objectName}`);

      // Run metadata extraction and AVIF conversion in parallel
      debugUpload(`Starting parallel: metadata + conversion for ${originalname}`);
      const [metadataResult, conversionResult] = await Promise.allSettled([
        this._callMetadataService(buffer, originalname, objectName),
        this.avifConverter.convertImage(buffer, originalname, mimetype, objectName, bucketName),
      ]);

      const metadataFailed   = metadataResult.status   === "rejected";
      const conversionFailed = conversionResult.status === "rejected" ||
                               !conversionResult.value?.success;

      if (metadataFailed || conversionFailed) {
        const errors = [];
        if (metadataFailed)   errors.push(`Metadata: ${metadataResult.reason?.message}`);
        if (conversionFailed) errors.push(`Conversion: ${conversionResult.reason?.message || conversionResult.value?.error}`);
        debugUpload(`Parallel step failed for ${originalname}: ${errors.join(" | ")}`);

        // Rollback whatever was written to MinIO
        const toDelete = [];
        if (!conversionFailed) toDelete.push(objectName);           // AVIF was written
        if (!metadataFailed)   toDelete.push(_jsonKey(folderPath));  // JSON was written
        await this._rollback(toDelete);

        throw new Error(`Failed processing ${originalname}: ${errors.join(" | ")}`);
      }

      debugUpload(`Both parallel steps succeeded for ${originalname}`);

      return {
        originalName: originalname,
        objectName,
        mimetype: "image/avif",
      };

    } catch (error) {
      console.error(`Error processing ${originalname}:`, error.message);
      throw new Error(`Failed processing ${originalname}: ${error.message}`);
    } finally {
      if (file.buffer) file.buffer = null;
      if (file.path) {
        try { await unlink(file.path); } catch (_) {}
      }
    }
  }

  /**
   * Process video file - upload directly to MinIO without conversion
   */
  async processVideoFile(file, bucketName, folderPath) {
    const maxSizeMB = 2000;
    const fileSizeMB = file.size / 1024 / 1024;
    if (fileSizeMB > maxSizeMB) {
      throw new Error(`Video file too large: ${fileSizeMB.toFixed(2)}MB. Maximum: ${maxSizeMB}MB`);
    }

    const objectName = folderPath
      ? `${folderPath.replace(/\/$/, "")}/${file.originalname}`
      : file.originalname;

    let source = null;
    if (file.buffer && file.buffer.length) {
      source = file.buffer;
    } else if (file.path) {
      source = fs.createReadStream(file.path);
    } else {
      throw new Error("No file buffer or path available for video upload");
    }

    const uploadInfo = await this.minioClient.putObject(
      bucketName,
      objectName,
      source,
      file.size,
      {
        "Content-Type": file.mimetype || "video/quicktime",
        "X-Amz-Meta-Original-Name": file.originalname,
        "X-Amz-Meta-Upload-Date": new Date().toISOString(),
        "X-Amz-Meta-File-Type": "video",
        "X-Amz-Meta-Source": "iPhone",
      }
    );

    return {
      originalName: file.originalname,
      objectName,
      size: file.size,
      mimetype: file.mimetype || "video/quicktime",
      etag: uploadInfo.etag,
      versionId: uploadInfo.versionId,
      fileType: "video",
    };
  }

  /**
   * Process multiple files in batch
   */
  async processMultipleFiles(files, bucketName, folderPath = "") {
    const allResults = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.processAndUploadFile(file, bucketName, folderPath);
        allResults.push(result);
      } catch (error) {
        errors.push({ filename: file.originalname, error: error.message });
      }
    }

    return { results: allResults, errors };
  }
}

// Helper — derive the JSON key from the folder path
function _jsonKey(folderPath) {
  const folder = folderPath.replace(/\/$/, "");
  return folder ? `${folder}/${folder}.json` : null;
}

module.exports = UploadService;