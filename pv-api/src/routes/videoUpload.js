const express = require('express');
const router = express.Router();
const multer = require('multer');
const { nanoid } = require('nanoid');
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/authMW');
const config = require('../config');
const debug = require('debug');

const debugVideo = debug('pv:video');

module.exports = (minioClient, { getTemporalClient } = {}) => {
  const videoStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
      if (!req._videoBatchId) req._videoBatchId = nanoid();
      const batchDir = path.join(
        config.temporal.nfsPath || '/nfs-storage',
        `video-${req._videoBatchId}`
      );
      try { await fs.mkdir(batchDir, { recursive: true }); }
      catch (e) { return cb(e); }
      cb(null, batchDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
  });
  const videoUpload = multer({ storage: videoStorage });

  // POST /video/upload/:folder
  // Receives video file(s) as multipart/form-data, stages to NFS, kicks off
  // a Temporal workflow to upload to MinIO, returns 202 immediately.
  // The old streaming approach (req → putObject) crashed the pod on connection drops.
  router.post('/upload/:folder', authenticateToken, requireRole('admin'),
    videoUpload.array('videos'),
    async (req, res) => {
      const folder = decodeURIComponent(req.params.folder);
      const files = req.files;
      const batchId = req._videoBatchId;

      if (!files || files.length === 0)
        return res.status(400).json({ success: false, error: 'No files uploaded' });

      const temporalClient = getTemporalClient ? getTemporalClient() : null;
      if (!temporalClient)
        return res.status(503).json({ success: false, error: 'Temporal client not available' });

      const videos = files.map(f => ({
        filename: f.originalname,
        path: f.path,
        contentType: f.mimetype || 'video/quicktime',
        objectName: `${folder}/${f.originalname}`,
      }));

      debugVideo(`Received ${files.length} video(s) for batch ${batchId}, folder: ${folder}`);

      res.status(202).json({
        success: true,
        batchId,
        message: 'Accepted: video processing started in background.',
        videoCount: files.length,
        folder,
      });

      setImmediate(async () => {
        try {
          await temporalClient.workflow.start('processVideoUpload', {
            taskQueue: config.temporal.taskQueue,
            workflowId: `video-${batchId}`,
            args: [{ batchId, folder, videos }],
          });
          debugVideo(`Workflow video-${batchId} started`);
        } catch (err) {
          debugVideo(`Failed to start video workflow ${batchId}: ${err.message}`);
        }
      });
    }
  );

  return router;
};
