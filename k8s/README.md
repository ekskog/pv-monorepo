This folder is intended to become the consolidated Kubernetes manifests for the monorepo.

Current state: manifests still live in each package's `k8s/` folder. Recommended next steps:

  - pv-client/k8s/
  - pv-api/k8s/
  - pv-converter/k8s/
  - pv-temporal-worker/k8s/
  - pv-uploader/k8s/



I created a root workflow at `.github/workflows/monorepo-ci.yml` that detects changes per service and builds/pushes images and now prefers consolidated manifests under `k8s/base/<service>/`.

What I changed in this repo:

- Copied per-service manifests into `k8s/base/<service>/` for each service.
- Removed the original per-package `k8s/` folders so `k8s/base/` is now the single source of truth.
- Updated the root workflow to prefer `k8s/base/${{ matrix.name }}` and fall back to package `k8s/` only if present.

Next recommended steps:

- Review the manifests under `k8s/base/` and adjust any environment-specific values (LoadBalancer IPs, hostAliases, PVC names).
- Add `k8s/overlays/<env>/` or templating later if you want environment differences.
- Commit and push changes, then run the CI to verify builds and deployments.

If you want, I can remove any empty `k8s/` directories left in packages or create a small sync script to keep `k8s/base/` updated automatically.