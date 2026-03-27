const debug = require('debug');
const debugSSE = debug('pv:server:sse');

const sseConnections = new Map();
const progressStore = new Map();

function persistProgress(jobId, data = {}) {
  if (data && data.progress) {
    try {
      progressStore.set(jobId, data.progress);
    } catch (e) {
      debugSSE(`[sse-service] Failed to persist progress for ${jobId}: ${e.message}`);
    }
  }
}

function getProgress(jobId) {
  try {
    return progressStore.has(jobId) ? progressStore.get(jobId) : null;
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
