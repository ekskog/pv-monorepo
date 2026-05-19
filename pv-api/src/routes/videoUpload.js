const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/authMW');
const config = require('../config');
const debug = require('debug');

const debugVideo = debug('pv:video');

function normalizePath(folder, filename) {
  const f = folder.replace(/^\/+|\/+$/g, '');
  return f ? `${f}/${filename}` : filename;
}

// minioClient        — internal client (for bucket ops)
// publicMinioClient  — client configured with MINIO_PUBLIC_URL, so presigned
//                      URLs are signed with a host the browser can reach.
//                      Falls back to minioClient if not configured (local network).
module.exports = (minioClient, publicMinioClient) => {
  const presignClient = publicMinioClient || minioClient;

  // POST /video/presign
  // Returns a short-lived presigned PUT URL the browser uses to upload a video
  // directly to MinIO, bypassing pv-api and any proxy size limits.
  router.post('/presign', authenticateToken, requireRole('admin'), async (req, res) => {
    const { folder, filename } = req.body;

    if (!folder || !filename) {
      return res.status(400).json({ success: false, error: 'folder and filename are required' });
    }

    const objectName = normalizePath(folder, filename);
    const expiry = 3600; // 1 hour

    try {
      const presignedUrl = await presignClient.presignedPutObject(
        config.minio.bucketName,
        objectName,
        expiry,
      );

      debugVideo(`Presigned URL generated for ${objectName}`);

      return res.json({
        success: true,
        presignedUrl,
        objectName,
        bucket: config.minio.bucketName,
        expiresIn: expiry,
      });
    } catch (err) {
      debugVideo(`Error generating presigned URL: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
