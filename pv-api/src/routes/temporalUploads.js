const express = require("express");
const router = express.Router();

const debug = require("debug");
const debugTemporal = debug("pv:server:temporal");
const debugBBulkApi = debug("pv:server:bulk");

const multer = require("multer");
const { nanoid } = require("nanoid");
const mime = require('mime-types');
const fs = require('fs').promises;
const path = require('path');
const MetadataService = require("../services/metadata-service");
// Use memory storage to handle the manual write to NFS
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (temporalClient, config) => {
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

        // 1. Immediate Validation (Synchronous)
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        debugBBulkApi(`Received upload request for folder "${folder}" with ${files.length} files.`);

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

                debugBBulkApi(`[Background] Files staged for batch ${batchId} at ${batchDir}`);

                // 4. Trigger Temporal
                // Verify client exists before calling
                if (temporalClient) {
                        const taskQueue = config.temporal?.taskQueue;
                        if (!taskQueue) {
                            throw new Error('Temporal task queue is not configured');
                        }

                        await temporalClient.workflow.start('processBatchImages', {
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
     * Status route to check on the workflow
     */
    router.get('/status/:workflowId', async (req, res) => {
        if (!temporalClient) {
            return res.status(503).json({ error: "Temporal client not available" });
        }
        try {
            const workflowId = req.params.workflowId;
            const handle = temporalClient.workflow.getHandle(workflowId);
            const description = await handle.describe();

            const status = description.status.name;
            const response = {
                workflowId,
                status,
                startTime: description.startTime,
                closeTime: description.closeTime || null,
            };

            // Return payload for closed workflows without blocking running ones.
            if (status === 'COMPLETED') {
                response.result = await handle.result();
            } else if (['FAILED', 'TIMED_OUT', 'TERMINATED', 'CANCELED', 'CANCELLED'].includes(status)) {
                try {
                    await handle.result();
                } catch (resultError) {
                    response.error = {
                        name: resultError?.name,
                        message: resultError?.message || String(resultError),
                    };
                }
            }

            res.json(response);
        } catch (err) {
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
        if (!temporalClient) {
            return res.status(503).json({ error: 'Temporal client not available' });
        }

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

            // Iterate visibility results and filter to bulk jobs by workflow id prefix.
            for await (const execution of temporalClient.workflow.list()) {
                scanned += 1;

                const workflowId = execution?.workflowId || execution?.execution?.workflowId;
                if (!workflowId || !workflowId.startsWith('batch-')) {
                    continue;
                }

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
                    break;
                }
            }

            jobs.sort((a, b) => {
                const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                return bTime - aTime;
            });

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
            return res.status(500).json({
                error: 'Failed to list bulk jobs',
                message: error?.message || String(error),
            });
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
            temporalConnected: !!temporalClient
        });
    });

    return router;
};