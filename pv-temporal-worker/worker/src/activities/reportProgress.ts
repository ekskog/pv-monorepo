import type { BatchProgressState } from '../workflows/image-batch-workflow';

const PROGRESS_API_URL = 'http://pv-api-service';


export async function reportProgress(progress: BatchProgressState | any): Promise<void> {
  const url = `${PROGRESS_API_URL.replace(/\/$/, '')}/bulk/progress`;
  const body = {
    workflowId: (progress && progress.batchId) || progress.workflowId || undefined,
    batchId: progress.batchId || undefined,
    albumName: progress.albumName || null,
    processed: progress.processed,
    totalRequested: progress.totalRequested,
    successful: progress.successful,
    failed: progress.failed,
    percentage: progress.percentage,
    lastFile: progress.lastSuccessFile || progress.lastFailedFile || null,
    timestamp: progress.updatedAt || new Date().toISOString(),
    state: progress.completedAt ? 'complete' : 'running',
    message: progress?.message ?? null,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Use global fetch available in Node 18+ via globalThis.
  const _fetch = (globalThis as any).fetch;
  if (typeof _fetch !== 'function') return;

  // Do a small retry loop with exponential backoff but never throw.
  const maxAttempts = 3;
  let attempt = 0;
  let backoff = 250; // ms

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await _fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res && typeof res.ok === 'boolean' && res.ok) {
        return; // success
      }

      // Non-2xx response — treat as transient and retry
      const status = res && (res.status || 'unknown');
      if (attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, backoff));
      backoff *= 2;
    } catch (err: unknown) {
      // swallow errors — do not let reporting break workflow
      if (attempt >= maxAttempts) {
        // eslint-disable-next-line no-console
        console.warn('reportProgress final failure:', err instanceof Error ? err.message : String(err));
      } else {
        // small delay before retry
        // eslint-disable-next-line no-empty
        await new Promise((r) => setTimeout(r, backoff)).catch(() => {});
        backoff *= 2;
      }
    }
  }
}
