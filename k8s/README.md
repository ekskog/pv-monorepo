This folder is intended to become the consolidated Kubernetes manifests for the monorepo.

Current state: manifests still live in each package's `k8s/` folder. Recommended next steps:

  - pv-client/k8s/
  - pv-api/k8s/
  - pv-converter/k8s/
  - pv-temporal-worker/k8s/
  - pv-uploader/k8s/


There is a root workflow at `.github/workflows/monorepo-ci.yml` that detects changes per service and builds/pushes images and now prefers consolidated manifests under `k8s/base/<service>/`.

