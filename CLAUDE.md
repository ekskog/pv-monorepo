# PhotoVault Monorepo — CLAUDE.md

## Project Overview

**PhotoVault (pv)** is a Kubernetes-native photo gallery and storage platform. It handles photo uploads, HEIC/JPEG to AVIF conversion, EXIF metadata extraction, location-based tagging, and album management. All services run in a self-hosted K8s cluster.

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
