## Test Run Checklist (Kubernetes-Backed)

Use this as a quick execution companion to `docs/test-spec.md`.

### 1. Set Variables

```bash
export NS="pv"
export API_BASE_URL="https://vault-api.example.com"
export TEST_ALBUM="temporal-test-$(date +%Y%m%d-%H%M%S)"
```

If you are using a local port-forward instead of ingress:

```bash
# Terminal A
kubectl -n "$NS" port-forward svc/pv-api-service 3000:3000

# Terminal B
export API_BASE_URL="http://localhost:3000"
```

### 2. Preflight Sanity

```bash
kubectl -n "$NS" get deploy pv-api pv-worker
kubectl -n "$NS" get pods -l app=pv-api
kubectl -n "$NS" get pods -l app=pv-worker
```

Check queue/env wiring is present:

```bash
kubectl -n "$NS" get configmap pv-api-config -o yaml | grep -E "TASK_QUEUE|TEMPORAL_ADDRESS|TEMPORAL_NAMESPACE|NFS_PATH"
kubectl -n "$NS" get configmap pv-worker-config -o yaml | grep -E "TASK_QUEUE|TEMPORAL_ADDRESS|TEMPORAL_NAMESPACE|AVIF_CONVERTER_URL"
```

Optional: verify recent logs do not show startup config errors:

```bash
kubectl -n "$NS" logs deploy/pv-api --tail=100 | grep -i -E "temporal|task_queue|error" || true
kubectl -n "$NS" logs deploy/pv-worker --tail=100 | grep -i -E "temporal|task queue|error" || true
```

### 3. API Connectivity Check

```bash
curl -s "$API_BASE_URL/bulk/test" | jq
```

Expected:
- `success: true`
- `temporalConnected: true`

### 4. Happy Path Upload

Adjust paths to your local fixture files:

```bash
UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE_URL/bulk/upload/$TEST_ALBUM" \
  -F "images=@fixtures/good/1.jpg" \
  -F "images=@fixtures/good/2.png" \
  -F "images=@fixtures/good/3.webp")

echo "$UPLOAD_RESPONSE" | jq
```

Extract IDs:

```bash
BATCH_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.batchId')
WORKFLOW_ID="batch-$BATCH_ID"
echo "BATCH_ID=$BATCH_ID"
echo "WORKFLOW_ID=$WORKFLOW_ID"
```

Expected:
- HTTP 202 from upload call
- JSON contains `batchId`

### 5. Poll Workflow Status Until Terminal

```bash
for i in $(seq 1 60); do
  STATUS_JSON=$(curl -s "$API_BASE_URL/bulk/status/$WORKFLOW_ID")
  STATUS=$(echo "$STATUS_JSON" | jq -r '.status')
  echo "[$i] status=$STATUS"
  echo "$STATUS_JSON" | jq

  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "TERMINATED" ] || [ "$STATUS" = "CANCELED" ] || [ "$STATUS" = "CANCELLED" ]; then
    break
  fi

  sleep 2
done
```

Expected:
- If `COMPLETED`, payload includes `.result`
- If failed terminal state, payload may include `.error`

### 6. Validate Completed Result Payload

```bash
echo "$STATUS_JSON" | jq '.result'
```

Expected fields:
- `totalImages`
- `successful`
- `failed`
- `results`
- `processingTimeMs`

### 7. Negative Check: Unknown Workflow

```bash
curl -s "$API_BASE_URL/bulk/status/batch-does-not-exist" | jq
```

Expected:
- Not found response with `error: "Workflow not found"`

### 8. Optional Partial Failure Scenario

```bash
BAD_UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE_URL/bulk/upload/$TEST_ALBUM-bad" \
  -F "images=@fixtures/good/1.jpg" \
  -F "images=@fixtures/bad/not-an-image.txt")

echo "$BAD_UPLOAD_RESPONSE" | jq
```

Then poll status as above and verify at least one failure in final result.

### 9. MinIO Verification

Verify objects exist under album path (method depends on your tooling):
- Prefix: `pv/$TEST_ALBUM/`
- Object naming: `<original-name-without-ext>.avif`

If you use `mc`:

```bash
# Example only, adjust alias and endpoint for your environment
mc ls myminio/pv/$TEST_ALBUM/
```

### 10. Worker/API Log Spot Check

```bash
kubectl -n "$NS" logs deploy/pv-api --tail=200
kubectl -n "$NS" logs deploy/pv-worker --tail=200
```

Look for:
- workflow start confirmation in API logs
- conversion + MinIO persistence logs in worker logs
- no repeated config/runtime errors

### 11. Pass Criteria

Mark run as pass when all are true:
- Upload endpoint returns 202 quickly
- Status endpoint transitions and returns terminal state
- `COMPLETED` responses include final `.result`
- MinIO objects were created with expected naming
- No critical errors in API/worker logs
