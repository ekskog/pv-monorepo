const fs = require("fs");
const util = require("util");
const unlink = util.promisify(fs.unlink);
const debug = require("debug");
const debugUpload = debug("pv:upload-service");

const MINIO_BUCKET = process.env.MINIO_BUCKET || "photovault";

class UploadService {
  constructor(minioClient) {
    this.minioClient = minioClient;
  }

  /**
   * Process and upload a single file. Only videos are handled here —
   * photos go through the Temporal bulk upload path.
   */
  async processAndUploadFile(file, bucketName, folderPath = "") {
    const { mimetype, originalname } = file;
    debugUpload(`Processing file: ${originalname} (${mimetype})`);

    try {
      if (["video/mp4", "video/mov", "video/avi", "video/quicktime"].includes(mimetype)) {
        debugUpload(`File identified as video: ${originalname}`);
        const result = await this.processVideoFile(file, bucketName, folderPath);
        debugUpload(`Video upload complete: ${originalname}`);
        return result;
      }

      debugUpload(`Unsupported file type for legacy path: ${mimetype} for ${originalname}`);
      return null;
    } catch (error) {
      console.error(`Error processing ${originalname}:`, error.message);
      throw new Error(`Failed processing ${originalname}: ${error.message}`);
    } finally {
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

module.exports = UploadService;