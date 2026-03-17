## Kubernetes-Backed Integration Test Spec (Temporal Upload Pipeline)

Use this spec when Temporal, NFS, MinIO, and AVIF converter are already running in Kubernetes and you do not want to run those dependencies locally.

### 1. Goal
Validate upload pipeline changes (namespace, queue configuration, final status payload) against existing Kubernetes services.

Success criteria for this test pass:
- API and worker operate in the same configured Temporal namespace.
- Task queue is configuration-driven and present at runtime.
- `POST /bulk/upload/:folder` responds `202` quickly.
- `GET /bulk/status/:workflowId` returns final `result` payload for completed workflows.

### 2. Scope
In scope:
- `pv-api` bulk Temporal endpoints.
- `pv-temporal-worker` workflow and activity execution.
- Integration with in-cluster Temporal, NFS, converter, and MinIO.

Out of scope:
- Running dependency services on laptop.
- SPA-level UX tests.

---

### 3. Test Topology

Choose one approach and keep it consistent for a full run.

### Option A: In-cluster API + worker (recommended)
- Deploy candidate `pv-api` and `pv-worker` images to a test namespace or isolated release.
- Run test requests from laptop to cluster ingress/service.

### Option B: Local API/worker against Kubernetes dependencies
- Run only `pv-api` and `pv-worker` locally.
- Point them to K8s dependency endpoints via reachable hostnames or `kubectl port-forward`.
- Keep NFS path shared/reachable for both local API and local worker processes.

---

### 4. Preconditions

For both options:
- Temporal frontend reachable and healthy.
- Converter service reachable.
- MinIO bucket `pv` exists and credentials are valid.
- NFS volume mounted for runtime where API and worker execute.

Required runtime config:
- Namespace: value from `TEMPORAL_NAMESPACE` (for example `photovault`).
- Task queue: `image-processing` (or your chosen queue) set via env/config, not source hardcoding.

Expected variables for API:
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TASK_QUEUE` (or `TEMPORAL_TASK_QUEUE`)
- `NFS_PATH`

Expected variables for worker:
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TASK_QUEUE`
- `AVIF_CONVERTER_URL`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_NAME`

---

### 5. Test Data

Prepare files locally for upload:
- `fixtures/good/1.jpg`
- `fixtures/good/2.png`
- `fixtures/good/3.webp`
- `fixtures/bad/not-an-image.txt` (optional failure scenario)

---

## 6. Test Cases

### TC-01 Config sanity in cluster runtime
1. Confirm API and worker env include queue and Temporal address.
2. Confirm API config resolves queue (for example via config map values).

Expected:
- Both services have `TASK_QUEUE` configured.
- No startup errors about missing queue.

### TC-02 API connectivity check
1. Call:
```bash
curl -s "<API_BASE_URL>/bulk/test" | jq
```

Expected:
- `success: true`
- `temporalConnected: true`
- `nfsPath` matches deployment mount path.

### TC-03 Happy path upload returns 202
1. Upload valid files:
```bash
curl -s -X POST "<API_BASE_URL>/bulk/upload/test-album" \
  -F "images=@fixtures/good/1.jpg" \
  -F "images=@fixtures/good/2.png" \
  -F "images=@fixtures/good/3.webp" | jq
```

Expected:
- HTTP `202`
- response includes `batchId`, `imageCount`, `folder`.

### TC-04 Workflow reaches running/completed
1. Build workflow id: `batch-<batchId>`.
2. Poll:
```bash
curl -s "<API_BASE_URL>/bulk/status/batch-<batchId>" | jq
```

Expected:
- Initial status may be `RUNNING`.
- Response includes `workflowId`, `status`, `startTime`.

### TC-05 Completed workflow returns final payload
1. Poll until status is `COMPLETED`.

Expected:
- `closeTime` is present.
- `result` exists and includes:
  - `totalImages`
  - `successful`
  - `failed`
  - `results`
  - `processingTimeMs`

### TC-06 Missing workflow id returns 404
1. Call:
```bash
curl -s "<API_BASE_URL>/bulk/status/batch-does-not-exist" | jq
```

Expected:
- HTTP `404`
- JSON contains `error: "Workflow not found"`.

### TC-07 Partial failure handling
1. Upload valid images plus one invalid file.

Expected:
- Workflow completes (does not crash entire batch).
- Result reports at least one failed item.

### TC-08 Final error payload for failed terminal states
1. Induce converter failure (for test namespace/release only).
2. Upload valid files.

Expected:
- Status reaches terminal failure state (`FAILED` or similar).
- Status response includes `error` object when available.

### TC-09 NFS cleanup in cluster
1. After completion, inspect NFS mount path for `batchId` staging directory from API/worker runtime.

Expected:
- Batch staging directory cleaned up.

### TC-10 MinIO object verification
1. Verify objects under `pv/test-album/`.

Expected:
- Files saved as `<original-name-without-ext>.avif`.
- Object count equals `result.successful`.

---

## 7. Pass/Fail Criteria

Pass:
- TC-01 through TC-06 pass.
- At least one of TC-07 or TC-08 is executed and passes.
- TC-09 and TC-10 confirm persistence and cleanup.

Fail:
- Namespace or queue mismatch.
- Missing final `result` for completed workflows.
- Silent failures with no observable status/error.

---

## 8. Suggested Execution Order

1. TC-01, TC-02
2. TC-03, TC-04, TC-05
3. TC-06
4. TC-07 and TC-08
5. TC-09, TC-10

---

## 9. Command Template Variables

Replace these placeholders before running:
- `<API_BASE_URL>`: example `https://vault-api.example.com` or local forwarded URL.
- `batch-<batchId>`: use `batchId` from upload response.
