const debug = require('debug');
const debugSSE = debug('pv:server:sse');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const sseConnections = new Map();
const progressStore = new Map();

const PERSIST_DIR = path.join(__dirname, '..', 'data', 'bulk_progress');

async function ensurePersistDir() {
  try {
    await fsp.mkdir(PERSIST_DIR, { recursive: true });
  } catch (e) {
    debugSSE(`[sse-service] Failed to ensure persist dir: ${e.message}`);
  }
}

async function writePersistedFile(jobId, payload) {
  try {
    await ensurePersistDir();
    const filePath = path.join(PERSIST_DIR, `${jobId}.json`);
    await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    debugSSE(`[sse-service] Failed to write persisted file for ${jobId}: ${e.message}`);
  }
}

function persistProgress(jobId, data = {}) {
  if (!jobId) return;
  // Persist in-memory for fast reads
  if (data && data.progress) {
    try {
      progressStore.set(jobId, data.progress);
    } catch (e) {
      debugSSE(`[sse-service] Failed to persist progress in-memory for ${jobId}: ${e.message}`);
    }
  }

  // Persist to disk asynchronously (includes progress or full result)
  (async () => {
    try {
      const filePayload = {};
      if (data.progress) filePayload.progress = data.progress;
      if (data.result) filePayload.result = data.result;
      // If nothing meaningful, skip
      if (Object.keys(filePayload).length === 0) return;
      await writePersistedFile(jobId, filePayload);
      debugSSE(`[sse-service] Persisted progress/result for ${jobId} to disk`);
    } catch (e) {
      debugSSE(`[sse-service] Error persisting progress to disk for ${jobId}: ${e.message}`);
    }
  })();
}

function getProgress(jobId) {
  try {
    if (progressStore.has(jobId)) return progressStore.get(jobId);

    // Fallback - try reading persisted file
    const filePath = path.join(PERSIST_DIR, `${jobId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.progress) return parsed.progress;
      } catch (e) {
        debugSSE(`[sse-service] Failed to parse persisted file for ${jobId}: ${e.message}`);
      }
    }

    return null;
  } catch (e) {
    debugSSE(`[sse-service] Failed to get progress for ${jobId}: ${e.message}`);
    return null;
  }
}

function sendSSEEvent(jobId, eventType, data = {}) {
  const connection = sseConnections.get(jobId);
  if (!connection) {
    debugSSE(`[sse-service] No connection found for job ${jobId}`);
    return;
  }

  const eventData = {
    type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const message = `data: ${JSON.stringify(eventData)}\n\n`;

  try {
    connection.write(message);
    // Force a flush by writing an empty chunk
    connection.write('');
    debugSSE(`[sse-service] Event "${eventType}" sent to job ${jobId}`);

    // Persist progress updates for polling clients
    persistProgress(jobId, data);

    if (eventType === 'complete') {
      connection.end();
      sseConnections.delete(jobId);
      progressStore.delete(jobId);
    }
  } catch (error) {
    debugSSE(`[sse-service] Error sending to job ${jobId}: ${error.message}`);
    sseConnections.delete(jobId);
  }
}

function attachSseRoutes(app, { pendingJobs, onStartPendingJob } = {}) {
  app.get('/processing-status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    debugSSE(`[sse-service] Client connecting for job ${jobId}`);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no',
    });

    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    res.flushHeaders();

    sseConnections.set(jobId, res);
    debugSSE(`[sse-service] Connection stored for job ${jobId}. Total connections: ${sseConnections.size}`);

    const confirmationData = JSON.stringify({ type: 'connected', jobId, message: 'SSE connection established' });
    res.write(`data: ${confirmationData}\n\n`);
    debugSSE(`[sse-service] Sent connection confirmation for job ${jobId}`);

    const pendingJob = pendingJobs && pendingJobs.get ? pendingJobs.get(jobId) : null;
    if (pendingJob) {
      debugSSE(`[sse-service] Found pending job ${jobId}, starting processing...`);
      if (pendingJobs && typeof pendingJobs.delete === 'function') pendingJobs.delete(jobId);
      if (typeof onStartPendingJob === 'function') {
        const { files, bucketName, folderPath } = pendingJob;
        const startTime = Date.now();
        try {
          onStartPendingJob(files, bucketName, folderPath, startTime, jobId);
        } catch (err) {
          debugSSE(`[sse-service] Error starting pending job ${jobId}: ${err.message}`);
        }
      }
    } else {
      debugSSE(`[sse-service] No pending job found for ${jobId}`);
    }

    req.on('close', () => {
      debugSSE(`[sse-service] Client disconnected for job ${jobId}`);
      sseConnections.delete(jobId);
    });

    req.on('error', (error) => {
      debugSSE(`[sse-service] SSE connection error for job ${jobId}: ${error.message}`);
      sseConnections.delete(jobId);
    });
  });
}

module.exports = {
  attachSseRoutes,
  sendSSEEvent,
  persistProgress,
  getProgress,
};
