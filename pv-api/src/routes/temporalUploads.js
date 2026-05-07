const express = require("express");
const router = express.Router();

const debug = require("debug");
const debugTemporal = debug("pv:server:temporal");
const debugBulkApi = debug("pv:server:bulk");

const database = require("../services/database-service");

const multer = require("multer");
const { nanoid } = require("nanoid");
const mime = require('mime-types');
const fs = require('fs').promises;
const path = require('path');
const MetadataService = require("../services/metadata-service");
// Use memory storage to handle the manual write to NFS
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (getTemporalClient, config, { sendSSEEvent, persistProgress, getProgress } = {}) => {
    const metadataService = new MetadataService(null);

    const toIsoStringOrNull = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };

    /**
     * POST /bulk/upload/:folder
     * Logic: Returns 202 instantly, processes NFS and Temporal in the background.
     */
    router.post("/upload/:folder", upload.array("images"), (req, res) => {
        const { folder } = req.params;
        const files = req.files;
        const batchId = nanoid();

        debugBulkApi(`New bulk upload request received — folder: "${folder}", batchId: ${batchId}, files: ${files?.length ?? 0}`);

        // 1. Immediate Validation (Synchronous)
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        debugBulkApi(`Received upload request for folder "${folder}" with ${files.length} files.`);

        // 2. Respond immediately - connection closes for the user HERE
        res.status(202).json({
            success: true,
            batchId,
            message: "Accepted: Processing started in background.",
            imageCount: files.length,
            folder
        });

        // 3. Background Task (Asynchronous / Non-blocking)
        setImmediate(async () => {
            try {
                // Ensure we have a base path from config or default
                const nfsBase = config.temporal?.nfsPath || '/nfs-storage';
                const batchDir = path.join(nfsBase, batchId);

                // Create directory on NFS
                await fs.mkdir(batchDir, { recursive: true });

                // Map and write the files to the NFS
                const imagePaths = await Promise.all(
                    files.map(async (file) => {
                        const extractedMetadata = await metadataService.extractEssentialMetadata(file.buffer, file.originalname);
                        const filePath = path.join(batchDir, file.originalname);
                        await fs.writeFile(filePath, file.buffer);
                        
                        const detectedType = mime.lookup(file.originalname);
                        return {
                            filename: file.originalname,
                            path: filePath,
                            contentType: detectedType || file.mimetype,
                            metadata: extractedMetadata,
                        };
                    })
                );

                debugBulkApi(`[Background] Files staged for batch ${batchId} at ${batchDir}`);

                // 4. Trigger Temporal
                // Verify client exists before calling
                if (getTemporalClient()) {
                        const taskQueue = config.temporal?.taskQueue;
                        if (!taskQueue) {
                            throw new Error('Temporal task queue is not configured');
                        }

                        await getTemporalClient().workflow.start('processBatchImages', {
                            taskQueue,
                            workflowId: `batch-${batchId}`,
                            args: [{
                                batchId,
                                batchDir,
                                images: imagePaths,
                                // Keep both keys temporarily for backward compatibility across worker versions.
                                folder,
                                albumName: folder,
                            }],
                        });
                    debugTemporal(`[Background] Workflow started for batch ${batchId}`);
                    debugTemporal(`[Background] Will save to album ${folder} after processing.`);
                } else {
                    debugTemporal(`[Background] Temporal Client not initialized. Batch ${batchId} staged but not started.`);
                }

            } catch (error) {
                // Since the client is long gone, we must log detailed errors here
                debugTemporal(`[CRITICAL BACKGROUND FAILURE] Batch ${batchId}:`, error);
            }
        });
    });

    /**
     * Internal endpoint for workers to report aggregated progress snapshots.
     */
    router.post('/progress', (req, res) => {
    debugBulkApi('[internal/progress] Received progress from worker:', JSON.stringify(req.body));

        try {
            const body = req.body || {};
            const jobId = body.workflowId || body.batchId;
            if (!jobId) return res.status(400).json({ success: false, message: 'Missing workflowId/batchId' });

            if (typeof sendSSEEvent === 'function') {
                debugBulkApi('[internal/progress] Sending SSE event for jobId:', jobId);
                sendSSEEvent(jobId, 'progress', {
                    status: body.state || 'processing',
                    message: body.message || null,
                    progress: {
                        current: body.processed || null,
                        total: body.totalRequested || null,
                        percentage: body.percentage || null,
                        lastUploaded: body.lastFile || null,
                        uploaded: body.successful || null,
                        failed: body.failed || null,
                    },
                    timestamp: body.timestamp || new Date().toISOString(),
                });
            }

            // Persist if helper provided
            if (typeof persistProgress === 'function') {
                persistProgress(jobId, { progress: body });
            }

            // When the batch completes, credit the successful count to the album counter
            if (body.state === 'complete' && body.albumName && body.successful > 0) {
                database.incrementFileCounter(body.successful, body.albumName).catch((err) => {
                    debugBulkApi('[internal/progress] Failed to update album counter:', err.message);
                });
            }

            return res.json({ success: true });
        } catch (err) {
            debugBulkApi('[internal/bulk/progress] Error handling internal progress:', err.message || err);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    });

    /**
     * Status route to check on the workflow
     */
    router.get('/status/:workflowId', async (req, res) => {
        if (!getTemporalClient()) {
            return res.status(503).json({ error: "Temporal client not available" });
        }
        try {
            const requestStartedAt = Date.now();
            const workflowId = req.params.workflowId;
            debugBulkApi(`[status] Request started for workflowId=${workflowId}`);
            const handle = getTemporalClient().workflow.getHandle(workflowId);
            debugBulkApi(`[status] Calling describe() for workflowId=${workflowId}`);
            const description = await handle.describe();
            debugBulkApi(
                `[status] describe() completed for workflowId=${workflowId} in ${Date.now() - requestStartedAt}ms`
            );
            try {
                debugBulkApi('[status] describe result for', workflowId, description);
            } catch (dbgErr) {
                debugBulkApi('[status] describe result (stringified) for', workflowId, JSON.stringify(description));
            }

            const status = description.status.name;
            const response = {
                workflowId,
                status,
                startTime: description.startTime,
                closeTime: description.closeTime || null,
            };

            // Try to obtain a live progress snapshot from the workflow's query handler.
            // This is non-blocking for closed workflows and best-effort for running ones.
            try {
                const progress = await handle.query('getProgress');
                try {
                    debugBulkApi('[status] getProgress result for', workflowId, progress);
                } catch (dbgErr) {
                    debugBulkApi('[status] getProgress result (stringified) for', workflowId, JSON.stringify(progress));
                }
                if (progress) {
                    response.progress = {
                        totalRequested: progress.totalRequested,
                        processed: progress.processed,
                        successful: progress.successful,
                        failed: progress.failed,
                        percentage: progress.percentage,
                    };
                    response.meta = response.meta || {};
                    response.meta.progress = {
                        startedAt: progress.startedAt,
                        updatedAt: progress.updatedAt,
                        completedAt: progress.completedAt,
                        message: progress.message,
                        lastSuccessFile: progress.lastSuccessFile,
                        lastFailedFile: progress.lastFailedFile,
                        error: progress.error,
                    };
                }
            } catch (qErr) {
                debugBulkApi(`[status] getProgress query failed for workflowId=${workflowId}: ${qErr?.message || qErr}`);
                // don't fail the status call if the progress query isn't available
            }

            // Return payload for closed workflows without blocking running ones.
                        if (status === 'COMPLETED') {
                const resultStartedAt = Date.now();
                debugBulkApi(`[status] Calling result() for completed workflowId=${workflowId}`);
                                response.result = await handle.result();
                                // Persist final result snapshot for future reads
                                try {
                                    if (typeof persistProgress === 'function') {
                                        persistProgress(batchId, { result: response.result });
                                    }
                                } catch (e) {
                                    debugBulkApi(`[status] Failed to persist result for ${workflowId}: ${e?.message || e}`);
                                }
                debugBulkApi(
                    `[status] result() completed for workflowId=${workflowId} in ${Date.now() - resultStartedAt}ms`
                );
            } else if (['FAILED', 'TIMED_OUT', 'TERMINATED', 'CANCELED', 'CANCELLED'].includes(status)) {
                try {
                    const resultStartedAt = Date.now();
                    debugBulkApi(`[status] Calling result() for terminal workflowId=${workflowId}, status=${status}`);
                    await handle.result();
                    debugBulkApi(
                        `[status] result() unexpectedly resolved for terminal workflowId=${workflowId} in ${Date.now() - resultStartedAt}ms`
                    );
                } catch (resultError) {
                    response.error = {
                        name: resultError?.name,
                        message: resultError?.message || String(resultError),
                    };
                }
            }

            debugBulkApi(
                `[status] Responding for workflowId=${workflowId}, status=${status}, totalDurationMs=${Date.now() - requestStartedAt}`
            );
            res.json(response);
        } catch (err) {
            debugBulkApi(`[status] Failed for workflowId=${req.params.workflowId}: ${err.message}`);
            res.status(404).json({ error: "Workflow not found", message: err.message });
        }
    });

    /**
     * List bulk workflow jobs within a date range.
     * Query params:
     * - from: ISO date string (inclusive)
     * - to: ISO date string (inclusive)
     * - limit: max number of returned jobs (default 200, max 1000)
     */
    router.get('/jobs', async (req, res) => {
        if (!getTemporalClient()) {
            return res.status(503).json({ error: 'Temporal client not available' });
        }

        const requestStartedAt = Date.now();
        debugBulkApi(
            `[jobs] Request started with query=${JSON.stringify(req.query || {})}`
        );

        const fromIso = toIsoStringOrNull(req.query.from);
        const toIso = toIsoStringOrNull(req.query.to);
        const parsedLimit = parseInt(req.query.limit || '200', 10);
        const limit = Number.isNaN(parsedLimit)
            ? 200
            : Math.min(Math.max(parsedLimit, 1), 1000);

        if (req.query.from && !fromIso) {
            return res.status(400).json({ error: 'Invalid from date. Use ISO-8601 format.' });
        }

        if (req.query.to && !toIso) {
            return res.status(400).json({ error: 'Invalid to date. Use ISO-8601 format.' });
        }

        const fromDate = fromIso ? new Date(fromIso) : null;
        const toDate = toIso ? new Date(toIso) : null;

        try {
            const jobs = [];
            let scanned = 0;
            let matched = 0;
            let lastProgressLogAt = Date.now();

            // debugBulkApi(`[jobs] Starting Temporal visibility scan (limit=${limit}, from=${fromIso || 'none'}, to=${toIso || 'none'})`);

            // Iterate visibility results and filter to bulk jobs by workflow id prefix.
            for await (const execution of getTemporalClient().workflow.list()) {
                scanned += 1;

                if (Date.now() - lastProgressLogAt >= 5000) {
                    debugBulkApi(
                        `[jobs] Scan progress: scanned=${scanned}, matched=${matched}, collected=${jobs.length}, elapsedMs=${Date.now() - requestStartedAt}`
                    );
                    lastProgressLogAt = Date.now();
                }

                const workflowId = execution?.workflowId || execution?.execution?.workflowId;
                if (!workflowId || !workflowId.startsWith('batch-')) {
                    continue;
                }

                matched += 1;

                const startTimeRaw = execution?.startTime || execution?.executionTime || execution?.historyStartTime;
                const closeTimeRaw = execution?.closeTime;
                const startTime = startTimeRaw ? new Date(startTimeRaw) : null;

                if (fromDate && startTime && startTime < fromDate) {
                    continue;
                }

                if (toDate && startTime && startTime > toDate) {
                    continue;
                }

                const status = execution?.status?.name || execution?.status || 'UNKNOWN';

                jobs.push({
                    workflowId,
                    batchId: workflowId.replace(/^batch-/, ''),
                    status,
                    startTime: startTime ? startTime.toISOString() : null,
                    closeTime: closeTimeRaw ? new Date(closeTimeRaw).toISOString() : null,
                });

                if (jobs.length >= limit) {
                    debugBulkApi(
                        `[jobs] Reached limit=${limit} after scanned=${scanned}, matched=${matched}, elapsedMs=${Date.now() - requestStartedAt}`
                    );
                    break;
                }
            }

            jobs.sort((a, b) => {
                const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                return bTime - aTime;
            });

            debugBulkApi(
                `[jobs] Responding success: scanned=${scanned}, matched=${matched}, returned=${jobs.length}, totalDurationMs=${Date.now() - requestStartedAt}`
            );

            return res.json({
                success: true,
                from: fromIso,
                to: toIso,
                limit,
                scanned,
                count: jobs.length,
                jobs,
            });
        } catch (error) {
            console.error('[Bulk jobs] Failed to list workflows:', error);
            debugBulkApi(
                `[jobs] Failed after elapsedMs=${Date.now() - requestStartedAt}: ${error?.message || String(error)}`
            );
            return res.status(500).json({
                error: 'Failed to list bulk jobs',
                message: error?.message || String(error),
            });
        }
    });

    /**
     * GET /bulk/progress/:workflowId
     * Query the live progress state of a running (or completed) workflow.
     * Calls the Temporal query handler registered in the worker as 'getProgress'.
     */
    router.get('/progress/:workflowId', async (req, res) => {
        if (!getTemporalClient()) {
            return res.status(503).json({ error: 'Temporal client not available' });
        }
        try {
            const { workflowId } = req.params;
            debugBulkApi(`[progress] Request started for workflowId=${workflowId}`);
            const handle = getTemporalClient().workflow.getHandle(workflowId);
            debugBulkApi(`[progress] Calling describe() and getProgress() for workflowId=${workflowId}`);
            const [description, progress] = await Promise.all([
                handle.describe(),
                handle.query('getProgress'),
            ]);
            try {
                debugBulkApi('[progress] describe result for', workflowId, description);
            } catch (dErr) {
                debugBulkApi('[progress] describe (stringified) for', workflowId, JSON.stringify(description));
            }
            try {
                debugBulkApi('[progress] getProgress result for', workflowId, progress);
            } catch (pErr) {
                debugBulkApi('[progress] getProgress (stringified) for', workflowId, JSON.stringify(progress));
            }
                        const batchId = workflowId.replace(/^batch-/, '');

                        // If there's a persisted snapshot (result or progress), prefer that for completed workflows
                        if (typeof getProgress === 'function') {
                            try {
                                const persisted = getProgress(batchId);
                                if (persisted) {
                                    return res.json({
                                        workflowId,
                                        batchId,
                                        status: description.status.name,
                                        progress: {
                                            totalRequested: persisted.totalRequested ?? persisted.total ?? null,
                                            processed: persisted.processed ?? null,
                                            successful: persisted.successful ?? persisted.uploaded ?? null,
                                            failed: persisted.failed ?? null,
                                            percentage: persisted.percentage ?? null,
                                        },
                                        meta: {
                                            startedAt: persisted.startedAt ?? null,
                                            updatedAt: persisted.updatedAt ?? null,
                                            completedAt: persisted.completedAt ?? null,
                                            message: persisted.message ?? null,
                                            lastSuccessFile: persisted.lastSuccessFile ?? null,
                                            lastFailedFile: persisted.lastFailedFile ?? null,
                                            error: persisted.error ?? null,
                                        },
                                    });
                                }
                            } catch (e) {
                                debugBulkApi('[progress] reading persisted data failed for', workflowId, e?.message || e);
                                // fallthrough to try live query
                            }
                        }

                        return res.json({
                                workflowId,
                                batchId,
                                status: description.status.name,
                                progress: {
                                        totalRequested: progress.totalRequested,
                                        processed: progress.processed,
                                        successful: progress.successful,
                                        failed: progress.failed,
                                        percentage: progress.percentage,
                                },
                                meta: {
                                        startedAt: progress.startedAt,
                                        updatedAt: progress.updatedAt,
                                        completedAt: progress.completedAt,
                                        message: progress.message,
                                        lastSuccessFile: progress.lastSuccessFile,
                                        lastFailedFile: progress.lastFailedFile,
                                        error: progress.error,
                                },
                        });
        } catch (err) {
            debugBulkApi(`[progress] Failed for workflowId=${req.params.workflowId}: ${err.message}`);
            if (err.message?.includes('not found') || err.name === 'WorkflowNotFoundError') {
                return res.status(404).json({ error: 'Workflow not found', message: err.message });
            }
            return res.status(500).json({ error: 'Failed to query workflow progress', message: err.message });
        }
    });

    /**
     * Sanity check route
     */
    router.get("/test", async (req, res) => {
        res.json({ 
            success: true, 
            message: "Route is active.",
            nfsPath: config.temporal?.nfsPath || '/nfs-storage',
            temporalConnected: !!getTemporalClient()
        });
    });

    return router;
};