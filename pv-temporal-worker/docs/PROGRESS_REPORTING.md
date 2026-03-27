# Bulk Upload Progress Reporting

## Overview

The pv-temporal-worker tracks bulk-upload progress inside the Temporal workflow and exposes it via a Temporal query. The API queries the workflow handle to return live progress to clients. There is also a legacy SSE/in-memory progress path in the API for non-Temporal background processing.

## Mechanism

- Primary: Temporal workflow in `pv-temporal-worker/worker/src/workflows/image-batch-workflow.ts` maintains an in-memory `progressState` and registers a query handler (commonly named `getProgress`) using `setHandler`.
- The API (see `pv-api/src/routes/temporalUploads.js`) obtains a workflow handle and calls `handle.query('getProgress')` (often alongside `handle.describe()`) to fetch the latest progress for a given `workflowId` (typically `batch-${batchId}`).
- Activities (e.g., AVIF conversion, metadata calls, MinIO persists) perform work via HTTP or SDKs but do not emit client-facing progress themselves.

## Key fields returned

- `totalRequested` — total number of images requested for processing
- `processed` — processed count (successful + failed)
- `successful` — number of successful items
- `failed` — number of failed items
- `percentage` — integer percentage complete (usually rounded)
- `message`, `updatedAt` — optional metadata/status strings

## Relevant files

- Worker workflow: pv-temporal-worker/worker/src/workflows/image-batch-workflow.ts
- Worker bootstrap: pv-temporal-worker/worker/src/index.ts
- Activities: pv-temporal-worker/worker/src/activities/* (examples: `convertImage.ts`, `metadataActivity.ts`, `persistToMinio.ts`)
- API (Temporal): pv-api/src/routes/temporalUploads.js
- Legacy SSE/in-memory progress: pv-api/src/server.js (SSE emitter + `progressStore` and polling endpoint)

## How clients get progress

1. Client asks the API for progress for a batch.
2. API creates/gets a Temporal workflow handle for the `workflowId` and runs `handle.query('getProgress')`.
3. API returns the `progressState` object to the client.

## Notes

- No Temporal signals are required for clients to receive progress; the workflow exposes a query handler that is polled by the API.
- If the Temporal worker is not used (legacy flow), the API’s SSE/polling implementation provides progress updates via an in-memory store.

---
Generated: summary of how pv-temporal-worker reports bulk upload progress.
