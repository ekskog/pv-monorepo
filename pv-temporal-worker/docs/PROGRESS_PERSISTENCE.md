# Progress persistence and calculation

This document describes where bulk/Temporal progress is persisted and how progress/metrics are calculated and surfaced to the UI.

**Files changed / relevant locations**
- `pv-api/src/services/sse-service.js` — in-memory `progressStore` Map plus disk persistence under `pv-api/data/bulk_progress/<jobId>.json` via `persistProgress()` and helper `writePersistedFile()`.
- `pv-api/src/routes/temporalUploads.js` — `/bulk/progress` POST handler receives worker snapshots and calls `sendSSEEvent()` and `persistProgress()`; `/bulk/progress/:workflowId` GET prefers persisted snapshots (via `getProgress`) and falls back to the live Temporal query.
- `pv-api/src/server.js` — passes `persistProgress` and `getProgress` into the temporal routes.
- `pv-temporal-worker/worker/src/workflows/image-batch-workflow.ts` — workflow maintains an internal `progressState` and calls `reportProgress()` to POST snapshots to the API.
- `pv-temporal-worker/worker/src/activities/reportProgress.ts` — activity that posts progress snapshots to `POST /bulk/progress`.

Where progress is persisted
- In-memory: `sse-service.js` keeps the latest progress snapshot in `progressStore` (fast reads for active SSE clients).
- On-disk: `sse-service.js` writes JSON snapshots to `pv-api/data/bulk_progress/<jobId>.json` (created under the API process directory) containing `progress` and/or `result` objects. The server reads from this file as a fallback when live query is unavailable.

How progress is calculated (workflow-side)
- The Temporal workflow `processBatchImages` creates and updates a `progressState` object per batch with these fields: `totalRequested`, `processed`, `successful`, `failed`, `percentage`, `startedAt`, `updatedAt`, `completedAt`, `message`, `lastSuccessFile`, `lastFailedFile`.
- For each image:
  - On success: `successful++`, `processed = successful + failed`, recompute `percentage = Math.round((processed / totalRequested) * 100)` and set `lastSuccessFile`.
  - On failure: `failed++`, `processed = successful + failed`, recompute `percentage` and set `lastFailedFile`.
- After each update the workflow calls `reportProgress()` which posts the snapshot to `POST /bulk/progress` on the API.

How progress is handled server-side
- `POST /bulk/progress` (in `temporalUploads.js`) receives the worker snapshot and does two things:
  1. Calls `sendSSEEvent(jobId, 'progress', { progress, ... })` so any connected SSE client receives the update in real time.
  2. Calls `persistProgress(jobId, { progress: body })` which updates the in-memory `progressStore` and writes a persisted JSON file on disk.
- The API `GET /bulk/progress/:workflowId` now prefers reading the persisted snapshot (via `getProgress(batchId)`) and returns that to callers if available. Otherwise it falls back to a live Temporal `getProgress` query.
- When a workflow reaches `COMPLETED`, the `/status/:workflowId` handler obtains `handle.result()` and the code persists the full `result` snapshot via `persistProgress(batchId, { result })` so the final outputs are available to the UI later.

What is persisted in the JSON snapshot
- `progress`: the `BatchProgressState` snapshot (counts, percentage, timestamps, last file names, optional error/message).
- `result`: the final workflow `result()` object returned by the workflow when it completes. This includes `totalImages`, `successful`, `failed`, `results` (per-image results), and `processingTimeMs`.

How to compute averages per activity (metadata, conversion)
- Per-image activity metrics are available in the workflow `result().results` array. Each entry may contain:
  - conversion metrics: `metrics.conversionTimeSec` (returned by `convertImage` activity)
  - metadata metrics: `metrics.metadataTimeMs` (returned by `extractAndPersistMetadata` activity)
- To compute averages for a batch:
  - Average conversion time = sum(results[i].conversionMetrics?.conversionTimeSec) / countOfImagesWithConversionMetrics
  - Average metadata time = sum(results[i].metrics?.metadataTimeMs) / countOfImagesWithMetadataMetrics
- If you prefer server-side aggregation, the workflow can be extended to compute and persist aggregated fields (e.g., `avgConversionSec`, `avgMetadataMs`) into the final `result` before returning; the code already persists `result` for completed workflows so adding aggregations will make them available to the UI via the existing mechanism.

Frontend notes (`pv-spa`)
- The UI already polls `GET /bulk/progress/:workflowId` via `api.getBulkJobProgress()`; with this change it will receive persisted snapshots for completed batches and live snapshots while running.
- To show averages in the Monitor UI you can either:
  1. Read `response.result` (for completed jobs) and compute averages from `result.results`.
  2. Or add aggregated fields to `result` server-side and display them directly.

Next steps / suggestions
- If you want aggregated per-activity averages visible directly in the Monitor list (without fetching the full `result`), I can:
  - Update `processBatchImages` to compute `avgConversionSec` and `avgMetadataMs` and include them in the returned `result`.
  - Persist those fields via `persistProgress()` so `GET /bulk/progress/:workflowId` returns them.
- I can also backfill persisted snapshots for recent batches if you want to populate history from existing worker logs (requires additional scripting).

If you'd like, I will add the optional workflow-side aggregations now and update the Monitor UI to show per-batch averages directly.

---
File: pv-temporal-worker/docs/PROGRESS_PERSISTENCE.md
