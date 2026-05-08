# PhotoVault Monorepo — CLAUDE.md

## Project Overview

**PhotoVault (pv)** is a Kubernetes-native photo gallery and storage platform. It handles photo uploads, HEIC/JPEG to AVIF conversion, EXIF metadata extraction, location-based tagging, and album management. All services run in a self-hosted K3s cluster.

---

## Repository Structure

| Directory | Role | Language/Framework |
|---|---|---|
| `pv-api/` | Backend REST API | Node.js / Express 5.x |
| `pv-spa/` | Web frontend | Vue 3 / Vite / Tailwind |
| `pv-converter/` | AVIF image conversion service | Python 3.11 / FastAPI |
| `pv-metadata/` | EXIF extraction + album index writer (MinIO) | Python 3.11 / FastAPI |
| `pv-temporal-worker/` | Async batch processing worker | TypeScript / Temporal SDK |
| `pv-uploader/` | Simple web upload interface | Node.js / Express 4.x |
| `pv_bulk_upload/` | CLI bulk upload tool | Node.js |
| `k8s/` | Kubernetes manifests | YAML (base configs per service) |
| `tools/` | Utility scripts | — |

---

## Architecture

```
── Traditional upload ────────────────────────────────────────────
Browser → pv-spa → pv-api
                    │ (orchestrates)
                    ├──→ pv-metadata ──→ MinIO  (writes <folder>.json)
                    └──→ pv-converter ──→ MinIO  (writes AVIF)
                    (both called in parallel)

── Bulk upload ───────────────────────────────────────────────────
Browser → pv-spa → pv-api
                    │ 1. stage files to NFS
                    │ 2. start Temporal workflow → 202
                    │
                    └──→ Temporal ──→ pv-temporal-worker
                                        │ (orchestrates, per image)
                                        ├──→ pv-metadata ──→ MinIO
                                        ├──→ pv-converter ──→ MinIO
                                        ├──→ reportProgress ──→ pv-api POST /bulk/progress
                                        │                           │ (SSE → browser)
                                        └──→ cleanupBatch (NFS)

pv-api also serves:
  GET /bulk/status/:workflowId  (Temporal query)
  GET /bulk/progress/:workflowId (Temporal query)

Shared backing services (all flows):
  MinIO (S3)  ·  MariaDB  ·  Temporal server
```

**Key communication patterns:**
- **pv-api → pv-converter**: `POST /convert` (AVIF conversion)
- **pv-api → pv-metadata**: `POST /extract` with the original file + converted `object_name`; pv-metadata extracts EXIF and **writes the result directly to MinIO** (`<folder>/<folder>.json`)
- **pv-api → Temporal**: gRPC to start `processBatchImages` workflows
- **pv-temporal-worker → pv-converter / MinIO**: direct HTTP + S3 API
- **pv-api → browser**: Server-Sent Events (SSE) for real-time upload progress

---

## Infrastructure Dependencies

All of these must be running for the full system to work:

| Service | Address | Purpose |
|---|---|---|
| MinIO | `mjolnir:9000` | S3-compatible object storage (bucket: `photovault`) |
| MariaDB | `mariadb.data.svc.cluster.local:3306` | User/album relational data |
| Temporal | `temporal-frontend.temporal.svc.cluster.local:7233` | Workflow orchestration |
| NFS mount | `/nfs-storage` | Staging area for bulk uploads |
| Mapbox (optional) | API call | Reverse geocoding for GPS coordinates |
| Cloudflare Turnstile (optional) | API call | CAPTCHA on login |

---

## Dev Commands

```bash
# pv-api (Node.js / CommonJS)
cd pv-api && npm install
npm run dev      # nodemon + DEBUG logging
npm start        # production

# pv-spa (Vue 3 / Vite)
cd pv-spa && npm install
npm run dev      # Vite dev server on :5173
npm run build    # output → dist/
npm run preview

# pv-converter (Python / FastAPI)
cd pv-converter && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000

# pv-metadata (Python / FastAPI)
cd pv-metadata && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# pv-temporal-worker (TypeScript)
cd pv-temporal-worker && npm install
npm run dev      # ts-node src/index.ts
npm run build    # tsc output
npm start        # run compiled JS
```

---

## Configuration

**pv-api** centralizes all config in `pv-api/src/config/index.js`. Key sections:

- `server` — port 3000, environment
- `cors` — allowlist: `photos.ekskog.me`, `localhost:5173`, Capacitor app origins
- `temporal` — address, namespace, task queue, NFS path
- `minio` — endpoint, port 9000, bucket name
- `upload` — max file size 2 GB, allowed MIME types
- `converter` — URL + 300s timeout
- `metadata` — URL + 30s timeout
- `auth` — JWT secret, 24h expiry
- `database` — MariaDB host/port/credentials
- `kubernetes` — service name, namespace, public URL

**Secrets** are managed via Kubernetes Secrets (`pv-api-secret`): `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `DB_PASSWORD`, `JWT_SECRET`, `MAPBOX_TOKEN`, `TURNSTILE_SECRET_KEY`.

Non-sensitive vars live in ConfigMaps per service under `k8s/base/<service>/configmap.yaml`.

---

## Key API Endpoints (pv-api)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | JWT login (with Turnstile CAPTCHA) |
| POST | `/auth/register` | User registration |
| GET | `/albums` | List albums |
| POST | `/albums` | Create album |
| DELETE | `/albums/:id` | Delete album |
| POST | `/upload/:folder` | Single/multi file upload + AVIF conversion |
| POST | `/bulk/upload/:folder` | Bulk upload → Temporal workflow (returns 202 + batchId) |
| GET | `/bulk/status/:workflowId` | Poll bulk workflow progress |
| GET | `/health` | Health check |
| GET | `/stats` | Storage and photo statistics |

---

## Upload Flows

### Traditional (small batches)
1. Browser → `POST /upload/:folder`
2. pv-api converts original file to AVIF → pv-converter
3. pv-api stores converted AVIF in MinIO
4. pv-api calls pv-metadata with the original file + AVIF `object_name`
5. pv-metadata extracts EXIF, optionally reverse-geocodes, and upserts the image entry into `<folder>/<folder>.json` in MinIO
6. SSE events stream progress to client

### Bulk (Temporal async)
1. Browser → `POST /bulk/upload/:folder` → 202 + batchId
2. Files staged to `/nfs-storage/<batchId>`
3. Temporal workflow `processBatchImages` started
4. pv-temporal-worker processes sequentially (1 concurrent; 1 GB RAM limit)
5. Client polls `GET /bulk/status/:workflowId` or uses SSE

---

## CI/CD

**File**: `.github/workflows/monorepo-ci.yml`  
**Trigger**: push to `main`

Each service has a matrix entry that:
1. Detects if its source directory or its `k8s/base/<service>/` manifests changed
2. Builds and pushes Docker image to GHCR (`ghcr.io/ekskog/<service>:latest` + `:<short-sha>`)
3. Deploys to the K8s cluster via `kubectl apply`

Special rule: `pv-temporal-worker` rebuilds whenever `pv-api` changes (shared types dependency).

Registry auth: `secrets.EK_GITHUB_PAT`

---

## Kubernetes Deployment

All manifests live under `k8s/base/<service>/` with per-service:
- `deployment.yaml`
- `service.yaml`
- `configmap.yaml` (non-sensitive vars)
- `secrets.yaml` (sensitive vars — do not commit actual values)

**Namespace**: `pv`  
**Public endpoints**: `https://photos.ekskog.me` (frontend), `https://vault-api.ekskog.net` (API)

---

## Testing

Minimal test coverage today:
- `pv-api`: test script is a placeholder (`echo "Error: no test specified"`)
- `pv-spa`: `@playwright/test` is installed but no test files currently exist
- Other services: no test setup

---

## Resource Limits (K8s)

| Service | CPU Request | CPU Limit | Mem Request | Mem Limit |
|---|---|---|---|---|
| pv-api | 100m | 1000m | 128Mi | 512Mi |
| pv-converter | 250m | 2000m | 512Mi | 4Gi |
| pv-spa | 50m | 100m | 64Mi | 128Mi |
| pv-temporal-worker | 500m | 1000m | 512Mi | 1Gi |

`pv-converter` runs on a dedicated node (`ubumac`) via node affinity/toleration (`avif-converter` taint).

---

## Security Notes

- JWT auth, 24h expiry
- Bcrypt password hashing (`bcrypt` + `bcryptjs`)
- Cloudflare Turnstile CAPTCHA on login
- CORS allowlist — not open
- All secrets in K8s Secrets, not ConfigMaps

---

## Coding Conventions

- **pv-api**: CommonJS (`require`/`module.exports`), not ESM
- **pv-spa**: ESM Vue 3 Composition API
- **pv-temporal-worker**: TypeScript strict mode
- **pv-converter / pv-metadata**: Python 3.11, async FastAPI handlers
- No formal test suite — rely on integration testing against the running cluster

## SPA Layout

`App.vue` `<main>` uses `px-2 sm:px-4 py-4 sm:py-6` — minimal horizontal padding, no `max-w` constraint. Individual views that need centering (e.g. `Albums.vue`) apply their own `max-w-[1200px] mx-auto`. Do not add a global `max-w` back to `App.vue` — it causes excessive whitespace in the photo grid.

## Photo Grid (`PhotoGrid.vue`)

- Renders a slice of the full photo array (`itemsPerPage: 24` default); all photos are fetched at once from the API.
- Infinite scroll via `IntersectionObserver` on a sentinel `<div ref="scrollTrigger">` at the bottom. The sentinel uses `v-show` (not `v-if`) — `v-if` would destroy and recreate the element on each batch load, breaking the observer's DOM reference.
- `rootMargin: '200px'` on the observer pre-triggers the next batch before the user reaches the bottom.
- No extra network requests on scroll — `loadMore()` is a synchronous `Array.slice`.

---

## SPA Runtime Configuration

The SPA is a static nginx-served Vue app. Runtime config (API URL, feature flags) is injected at container startup by an entrypoint script that reads env vars from the ConfigMap and writes `/usr/share/nginx/html/env-config.js`, which sets `window.__ENV__`.

**Critical:** `env-config.js` must never be cached. nginx is configured with `Cache-Control: no-store` for that path. If `env-config.js` gets stale (e.g. after a pod restart with a configmap change), Cloudflare may serve the old version — purge `https://photos.ekskog.me/env-config.js` from the Cloudflare cache.

The correct `API_URL` in `k8s/base/pv-spa/configmap.yaml` is **`https://vault-api.ekskog.net`** — the public API hostname. Do not use the internal K8s DNS name (`http://pv-api-service.pv.svc.cluster.local`): browsers cannot resolve it and it triggers mixed-content blocking on HTTPS pages.

The SPA's nginx (`pv-spa/nginx.conf`) also proxies API paths (`/auth`, `/albums`, `/objects`, etc.) to `http://pv-api-service` internally — this is a secondary path used for same-origin requests and does not affect how the runtime config URL is set.

---

## Public Endpoints and Networking

| Hostname | What it points to | Via |
|---|---|---|
| `photos.ekskog.me` | pv-spa nginx (port 80) | Cloudflare Tunnel |
| `vault-api.ekskog.net` | pv-api (port 3000) | Cloudflare Tunnel |
| `objects.ekskog.net` | MinIO (port 9000) | Cloudflare Proxy (orange cloud) |

All Cloudflare Tunnel routes are configured in the **Cloudflare dashboard** (not in K8s). The cloudflared pod runs in the `webapps` namespace and connects outbound to Cloudflare. It resolves backend services by K8s cluster DNS.

**MinIO presigned URLs** must be signed with the *public* hostname (`objects.ekskog.net`) as the endpoint. `pv-api` maintains a separate `publicMinioClient` for this purpose (`server.js`). The standard `minioClient` uses the internal address and must not be used for generating presigned URLs served to browsers.

---

## Thumbnails

Thumbnails are pre-generated WebP files stored at `<album>/thumbs/<filename>.webp` in the `photovault` MinIO bucket. They are 400px wide, WebP quality 75.

**How thumbnails are created:**
- **New uploads**: `pv-converter` generates the WebP thumbnail from the source image (JPEG/HEIC) using Pillow before freeing source bytes, then uploads it to `<album>/thumbs/<filename>.webp`. This runs for both traditional and Temporal bulk uploads since both go through pv-converter.
- **Existing images**: `tools/generate-thumbs.js` — run locally with MinIO credentials. Idempotent (skips existing thumbs). Supports `--album <name>` to process a single album. Credentials: `MINIO_ACCESS_KEY=lucarv MINIO_SECRET_KEY=<secret>`.

**How thumbnails are served:**
- `pv-api` `getPhotos` generates a presigned URL for `<album>/thumbs/<filename>.webp` and returns it as `thumbnailUrl`.
- `PhotoCard.vue` loads `thumbnailUrl` for the grid. On error (thumbnail missing), it silently falls back to the full-res presigned URL without showing an error to the user. On successful thumbnail load, it prefetches the full-res URL so the lightbox opens instantly.
- Thumbnails are deleted alongside their parent AVIF when a photo is deleted (`albums.js` `deleteObjects`).


---

## Album Counter (`albums.counter`)

The `albums.counter` column in MariaDB caches the photo count per album and is used by `GET /albums` to avoid N MinIO list calls.

**How it is maintained:**
- Traditional upload (`server.js`): incremented by the number of successfully processed files after the upload completes.
- Bulk upload (`temporalUploads.js`): incremented when a `reportProgress` POST arrives with `state === 'complete'`.
- Delete (`albums.js`): decremented by 1 per deleted object.

**Known limitation:** Re-uploading the same files overwrites the MinIO objects silently but still increments the counter, causing drift. If counters look wrong, run the audit+fix script (counts actual `.avif/.jpg/.mp4` objects in MinIO per album prefix and resets the DB counter to match).

**Root cause of past counter bug (fixed):** The Temporal workflow was setting `completedAt` after the image loop but never calling `reportProgress` with that final state. The API only increments the counter when `state === 'complete'`, so the counter was never updated for bulk uploads. Fixed in `image-batch-workflow.ts` by adding a final `reportProgress` call after `completedAt` is set.

**Do not** count objects from the per-album metadata JSON (`<folder>/<folder>.json`) to derive the counter — the JSON may contain entries for files that no longer exist in MinIO, or for original files that were converted and replaced. Count actual MinIO objects instead.
