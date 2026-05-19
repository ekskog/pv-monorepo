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

module.exports = (minioClient) => {

  // POST /video/upload/:folder/:filename
  // Streams the raw request body directly to MinIO — no temp file, no MinIO CORS needed.
  // The browser sends the file as the raw body (Content-Type: video/*, Content-Length required).
  router.post('/upload/:folder/:filename', authenticateToken, requireRole('admin'), (req, res) => {
    const folder = decodeURIComponent(req.params.folder);
    const filename = decodeURIComponent(req.params.filename);
    const objectName = normalizePath(folder, filename);
    const contentType = req.headers['content-type'] || 'video/quicktime';
    const contentLength = parseInt(req.headers['content-length'], 10);

    if (!contentLength || isNaN(contentLength)) {
      return res.status(400).json({ success: false, error: 'Content-Length header is required' });
    }

    debugVideo(`Streaming upload → ${objectName} (${(contentLength / 1024 / 1024).toFixed(1)} MB)`);

    minioClient.putObject(
      config.minio.bucketName,
      objectName,
      req,
      contentLength,
      { 'Content-Type': contentType },
    ).then(() => {
      debugVideo(`Upload complete: ${objectName}`);
      res.json({ success: true, objectName, bucket: config.minio.bucketName });
    }).catch((err) => {
      debugVideo(`Upload failed for ${objectName}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    });
  });

  return router;
};
