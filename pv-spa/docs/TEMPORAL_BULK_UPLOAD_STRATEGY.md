# Temporal Bulk Upload Integration Strategy (pv-spa)

## Context
Current SPA upload flow is built around:
- upload endpoint: `/buckets/:bucket/upload`
- async progress transport: SSE (`/processing-status/:jobId`)
- UI wiring in:
  - `pv-spa/src/components/MediaUpload.vue`
  - `pv-spa/src/components/AlbumViewer.vue`
  - `pv-spa/src/services/sseService.js`
  - `pv-spa/src/services/api.js`

New backend flow (Temporal bulk) is:
- start upload: `POST /bulk/upload/:folder`
- immediate response: `202` + `batchId`
- status endpoint: `GET /bulk/status/:workflowId`
- completed payload includes final `result`
- workflow id convention: `batch-${batchId}`

Because transport changed from SSE push to status polling, this is mostly a client orchestration change, not a UI rewrite.

---

## Product Goals
1. Keep existing SSE upload flow fully intact (no behavior changes).
2. Add a second, explicit Temporal bulk-upload flow as a new button.
3. Remove the 10-file cap only for the new bulk-upload flow.
4. Keep API service as the only place that knows endpoint details.
5. Be resilient to slow jobs and transient network failures.

---

## Recommended Rollout Strategy

Important product rule for this implementation:
- Legacy upload button and SSE flow stay exactly as-is.
- New bulk upload is additive only, using separate UI controls and code path.

## Phase 1: Add Temporal APIs to service layer (no UI breakage)
Add new methods in `pv-spa/src/services/api.js`:
- `uploadBulkToTemporal(folder, files)`
- `getBulkWorkflowStatus(workflowId)`
- `buildBulkWorkflowId(batchId)`

Behavior:
- `uploadBulkToTemporal` sends multipart field name `images` (not `files`) to `/bulk/upload/:folder`.
- return parsed response with `batchId`.
- `buildBulkWorkflowId` returns `batch-${batchId}`.

Why first:
- isolates contract changes in one place.
- allows easy testing from component console without UI rewiring.

---

## Phase 2: Introduce polling status service
Create a small polling utility (new file suggested: `pv-spa/src/services/workflowStatusService.js`) to replace SSE for this path.

Responsibilities:
- Poll `/bulk/status/:workflowId` every 2s to start.
- Backoff after 30s (e.g., to 4s) to reduce load.
- Stop on terminal states: `COMPLETED`, `FAILED`, `TIMED_OUT`, `TERMINATED`, `CANCELED`, `CANCELLED`.
- Expose callbacks:
  - `onUpdate(statusPayload)`
  - `onComplete(resultPayload)`
  - `onError(errorPayload)`
- Provide `stop()` for dialog close/navigation cleanup.

Why:
- keeps polling concerns out of Vue components.
- gives a drop-in equivalent to current `SSEService` pattern.

---

## Phase 3: Add a New Bulk Upload UI (do not modify legacy behavior)
File: `pv-spa/src/components/MediaUpload.vue`

UI change:
- Keep current "Photos" and "Videos" buttons unchanged.
- Add a third button: `Bulk Photos (Temporal)`.

Behavior split:
- `photos` and `videos` continue using existing `/buckets/:bucket/upload` + SSE `jobId`.
- `bulk-photos` uses `/bulk/upload/:folder` + status polling.

New flow:
1. Keep current client-side validations (permissions, file type, max file count).
2. Keep XMLHttpRequest upload progress for request body transmission.
3. For `bulk-photos` only, send files using `images` field to `/bulk/upload/:albumName`.
4. On success:
   - read `batchId`
   - compute `workflowId = batch-${batchId}`
   - emit `jobReady` payload with both:
     - `workflowId`
     - `batchId`
5. Keep dialog behavior the same (close after accepted upload and let parent manage processing UI).

Validation rule change:
- Keep max-10 limit for legacy `photos` and `videos` paths.
- Disable max-10 limit for `bulk-photos` path.

Important:
- Upload progress now only reflects HTTP upload transfer, not conversion/persistence progress.
- Post-upload processing progress comes from workflow status polling.

---

## Phase 4: Add Parallel Orchestration in AlbumViewer
File: `pv-spa/src/components/AlbumViewer.vue`

Current orchestration:
- `startProcessingListener(jobId)` uses `SSEService` and expects `data.type` events.

New orchestration:
- Keep existing SSE orchestration for legacy uploads.
- Add second orchestration path for Temporal workflow polling.
- `handleJobReady(payload)` branches by payload shape:
  - legacy: `payload.jobId` -> existing `SSEService`
  - temporal bulk: `payload.workflowId` -> new `workflowStatusService`

Suggested UI mapping from workflow status:
- `RUNNING`: "Processing in background..."
- `COMPLETED`: show success summary from `result`:
  - total, successful, failed, processingTimeMs
- `FAILED/TIMED_OUT/TERMINATED/CANCELED`: show error message from `error`

Completion behavior:
- keep existing refresh logic (`refreshAlbum`) after terminal completion.
- if `failed > 0`, show partial success wording, do not treat as total failure.

---

## Phase 5: Optional Toggle (not required)
Because this is additive, a global feature flag is optional.

Recommended default:
- both buttons always visible for users with upload permission.
- legacy remains default/first option for regular uploads.
- temporal bulk button clearly labeled for large image batches.

---

## Data Contracts (Frontend-facing)

## Start upload response
Expected from `POST /bulk/upload/:folder`:
```json
{
  "success": true,
  "batchId": "IOiScBwVun7JUOztDBPvn",
  "message": "Accepted: Processing started in background.",
  "imageCount": 3,
  "folder": "temporal"
}
```

## Status response (running)
```json
{
  "workflowId": "batch-...",
  "status": "RUNNING",
  "startTime": "...",
  "closeTime": null
}
```

## Status response (completed)
```json
{
  "workflowId": "batch-...",
  "status": "COMPLETED",
  "startTime": "...",
  "closeTime": "...",
  "result": {
    "totalImages": 3,
    "successful": 3,
    "failed": 0,
    "results": [],
    "processingTimeMs": 9173
  }
}
```

---

## UX Guidance
1. Keep two distinct progress phases:
- Phase A: "Uploading files" (XHR upload percentage)
- Phase B: "Processing in background" (indeterminate or status text)

2. Keep mode distinction clear in UI copy:
- legacy button: "Upload Photos" (max 10)
- new button: "Bulk Upload (Temporal)" (large batches)

3. Avoid fake precision during processing:
- backend status does not expose per-file incremental percentage through `/bulk/status`.
- show clear textual state instead of a misleading progress bar.

4. Show completion summary:
- e.g., "3 processed, 0 failed in 9.2s".

5. Preserve album refresh behavior:
- refresh once on terminal success/partial success.

---

## Error Handling Strategy
- Upload request fails: keep dialog open and show actionable error.
- Polling transient error: retry with capped attempts.
- Polling hard failure (404 namespace/workflow not found): show clear error + stop polling.
- Terminal failed workflow: show backend-provided error details.

Add a max polling timeout (e.g., 15 minutes) with user-visible message.

---

## Testing Plan (SPA-specific)
1. Legacy photo upload still works exactly as before (SSE path).
2. Legacy video upload still works exactly as before (SSE path).
3. Temporal bulk button can upload more than 10 images.
4. Temporal bulk job reaches `COMPLETED` and refreshes album.
5. Partial failure case for temporal bulk (one invalid image) surfaces correctly.
6. User closes dialog mid-processing and returns to album.
7. Navigation away during polling and component unmount cleanup.
8. Unauthorized token (401) behavior remains correct.

---

## Suggested Implementation Order
1. `api.js` new bulk methods.
2. `workflowStatusService.js` polling utility.
3. `MediaUpload.vue` add new `bulk-photos` mode/button and keep legacy paths unchanged.
4. `AlbumViewer.vue` add dual orchestration (SSE for legacy, polling for temporal).
5. End-to-end manual test in your k3s environment.

---

## Key Risk To Avoid
Do not mix old contract assumptions (`response.data.jobId`, SSE event `type`) with the new Temporal contract (`batchId`, `workflowId`, workflow status payload). Keep them as separate execution paths.
