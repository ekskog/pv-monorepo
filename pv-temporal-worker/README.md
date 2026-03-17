# pv-temporal-worker

Temporal-based background image processing for the Photo Vault monorepo.

This component processes batch uploads asynchronously by converting images to AVIF and persisting them to MinIO.

## What It Does

1. `pv-api` receives files at `POST /bulk/upload/:folder`.
2. API immediately returns `202 Accepted` with a `batchId`.
3. API stages files to shared NFS (`/nfs-storage/<batchId>`).
4. API starts Temporal workflow `processBatchImages` on the configured task queue.
5. Worker consumes tasks from Temporal, converts each image, uploads to MinIO, and cleans up NFS batch files.
6. API status endpoint can return final workflow payload once completed.

## Repository Layout

- `worker/src/index.ts`: Temporal worker bootstrap.
- `worker/src/workflows/image-batch-workflow.ts`: Batch orchestration workflow.
- `worker/src/activities/convertImage.ts`: Calls AVIF converter and writes `.avif` to NFS.
- `worker/src/activities/persistToMinio.ts`: Uploads AVIF from NFS to MinIO and removes batch directory.

## Runtime Requirements

- Temporal cluster reachable from API and worker.
- Shared writable filesystem mounted at `/nfs-storage` for both API and worker pods.
- AVIF converter service reachable by worker.
- MinIO reachable by worker.
- API and worker must use the same Temporal namespace and task queue.

Namespace is runtime-configurable via `TEMPORAL_NAMESPACE`.

## Environment Variables

### Worker

- `TEMPORAL_ADDRESS`: Temporal frontend address.
	Example: `temporal-frontend.temporal.svc.cluster.local:7233`
- `TEMPORAL_NAMESPACE`: Required. Temporal namespace (example: `photovault`).
- `TASK_QUEUE`: Required. Queue this worker listens on.
- `AVIF_CONVERTER_URL`: Converter endpoint.
	Example: `http://pv-avif-converter-service.pv.svc.cluster.local:3000`
- `MINIO_ACCESS_KEY`: MinIO access key.
- `MINIO_SECRET_KEY`: MinIO secret key.
- `MINIO_BUCKET_NAME`: Destination bucket (default in code: `pv`).

### API (related)

- `TEMPORAL_ADDRESS`: Temporal frontend address.
- `TEMPORAL_NAMESPACE`: Temporal namespace used by API Temporal client.
- `TASK_QUEUE` or configured `config.temporal.taskQueue`: Queue used when starting workflows.
- `NFS_PATH`: Shared staging path (default in API config: `/nfs-storage`).

## Workflow Contract

Workflow name: `processBatchImages`

Input:

```json
{
	"batchId": "string",
	"batchDir": "/nfs-storage/<batchId>",
	"folder": "album-folder",
	"images": [
		{
			"filename": "IMG_0001.JPG",
			"path": "/nfs-storage/<batchId>/IMG_0001.JPG",
			"contentType": "image/jpeg"
		}
	]
}
```

Result shape:

```json
{
	"totalImages": 10,
	"successful": 9,
	"failed": 1,
	"results": [],
	"processingTimeMs": 12345
}
```

## API Endpoints (Temporal Upload Path)

### Start Upload

`POST /bulk/upload/:folder`

- Accepts multipart files in field `images`.
- Returns `202` immediately with `batchId`.
- Starts processing in background.

### Check Workflow Status

`GET /bulk/status/:workflowId`

- Returns current workflow status.
- For completed workflows, includes `result` payload from Temporal.
- For failed/terminated/timed-out workflows, includes `error` details when available.

Example completed response:

```json
{
	"workflowId": "batch-abc123",
	"status": "COMPLETED",
	"startTime": "2026-03-17T10:00:00.000Z",
	"closeTime": "2026-03-17T10:00:05.000Z",
	"result": {
		"totalImages": 3,
		"successful": 3,
		"failed": 0,
		"results": [],
		"processingTimeMs": 5100
	}
}
```

## Local Development

From `pv-temporal-worker/worker`:

```bash
npm ci
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

## Kubernetes

Deployment manifest: `k8s/base/pv-temporal-worker/worker-deployment.yaml`

Important settings in manifest:

- `TEMPORAL_ADDRESS`
- `TASK_QUEUE`
- `AVIF_CONVERTER_URL`
- NFS volume mount at `/nfs-storage`

## Operational Notes

- The API returns before Temporal start succeeds or fails; failures are logged server-side.
- Conversion writes AVIF artifacts to NFS first to avoid large payloads in workflow history.
- Cleanup removes the entire batch directory after processing.
- Failed image conversions do not stop the whole batch; per-image result is tracked.