# Progress monitoring — pv-api

This document explains how to monitor bulk upload progress exposed by the `pv-api` service.

## Flows supported

- Temporal-based (recommended): the API queries a Temporal workflow's `getProgress` query handler. Workflows are started with `workflowId = batch-${batchId}`.
- Legacy/dev SSE + polling: the API can push progress via Server-Sent Events (SSE) and stores the latest progress in an in-memory `progressStore` for polling.

## Important endpoints

- Start a bulk upload (returns a `batchId`):

  POST /bulk/upload/:folder

  - Returns 202 with JSON including `batchId` which you will use to monitor progress.

- Temporal progress query (live):

  GET /bulk/progress/:workflowId

  - For workflows started via `/bulk/upload/:folder` the `workflowId` will be `batch-${batchId}`.
  - The route queries the workflow handle and calls the workflow query handler `getProgress`.

- Workflow status/result:

  GET /bulk/status/:workflowId

  - Returns workflow describe() information and result() for completed workflows.

- SSE (legacy/dev) real-time stream:

  GET /processing-status/:jobId

  - Opens an SSE stream that emits `started`, `progress`, and `complete` events.

- Polling fallback (in-memory):

  GET /bulk/progress/:batchId

  - Returns the last stored progress from the in-memory `progressStore` (used by SSE/dev flow).

## Typical client flow (Temporal)

1. POST `/bulk/upload/:folder` → receive `batchId`.
2. Poll `GET /bulk/progress/batch-${batchId}` (replace `${batchId}`) to get live progress.

Example (curl):

```bash
# Start upload (example)
curl -F "images=@image1.jpg" -F "images=@image2.jpg" \
  https://api.example.com/bulk/upload/my-album

# Poll progress (Temporal)
curl https://api.example.com/bulk/progress/batch-<BATCH_ID>
```

## Typical client flow (SSE / legacy)

1. Start a legacy upload endpoint that returns a `jobId` (or use UI that negotiates SSE).
2. Open an SSE connection to `GET /processing-status/:jobId` to receive push updates.
3. Optionally poll `GET /bulk/progress/:jobId` to read the last persisted progress snapshot.

Example (SSE using curl):

```bash
curl -N https://api.example.com/processing-status/<JOB_ID>
```

Events emitted over SSE include `started`, repeated `progress` updates, and a final `complete` event. Each event contains a `progress` object with fields like `current`, `total`, `percentage`, and optional `lastUploaded` / `lastFailed`.

## Progress payloads

- Temporal `/bulk/progress/:workflowId` response fields (important keys):

  - `progress.totalRequested` — total number of images requested
  - `progress.processed` — processed count (successful + failed)
  - `progress.successful` — successful items
  - `progress.failed` — failed items
  - `progress.percentage` — integer percent complete
  - `meta` — metadata object containing `startedAt`, `updatedAt`, `completedAt`, `message`, `lastSuccessFile`, `lastFailedFile`, `error`

- SSE `progress` event shape (example):

  ```json
  {
    "type": "progress",
    "timestamp": "2026-03-27T...",
    "progress": {
      "current": 5,
      "total": 20,
      "percentage": 25,
      "lastUploaded": "img5.jpg",
      "uploaded": 5,
      "failed": 0
    }
  }
  ```

## Errors & edge cases

- If `temporalClient` is not initialized, Temporal endpoints may return 503 and background tasks may be staged but not started.
- Temporal progress is read via a workflow query; the API does not push Temporal workflow progress directly — it polls the workflow's `getProgress` handler.
- The SSE/polling in-memory store is ephemeral and for dev/legacy flows only (not durable across restarts).

## Relevant files

- Temporal routes & progress query: pv-api/src/routes/temporalUploads.js
- SSE + polling implementation (legacy/dev): pv-api/src/server.js (see `sendSSEEvent`, `progressStore`, `/processing-status/:jobId`, and `/bulk/progress/:batchId`)

---
Created: quick usage guide for progress monitoring in `pv-api`.
