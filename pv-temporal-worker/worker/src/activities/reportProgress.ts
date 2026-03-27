import type { BatchProgressState } from '../workflows/image-batch-workflow';

const PROGRESS_API_URL = process.env.PROGRESS_API_URL || process.env.PV_API_INTERNAL_URL || 'http://pv-api:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_PROGRESS_TOKEN;

export async function reportProgress(progress: BatchProgressState | any): Promise<void> {
  try {
    const url = `${PROGRESS_API_URL.replace(/\/$/, '')}/internal/bulk/progress`;
    const body = {
      workflowId: (progress && progress.batchId) || progress.workflowId || undefined,
      batchId: progress.batchId || undefined,
      processed: progress.processed,
      totalRequested: progress.totalRequested,
      successful: progress.successful,
      failed: progress.failed,
      percentage: progress.percentage,
      lastFile: progress.lastSuccessFile || progress.lastFailedFile || null,
      timestamp: progress.updatedAt || new Date().toISOString(),
      state: progress.completedAt ? 'complete' : 'running',
      message: progress.message,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_TOKEN) headers['x-internal-token'] = INTERNAL_TOKEN;

    // Use global fetch (Node 18+), fallback to require('node-fetch') if not available
    const _fetch = (typeof fetch !== 'undefined') ? fetch : (await import('node-fetch')).default;

    await _fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // small timeout is enforced by network infra; keep request short
    });
  } catch (err) {
    // Activities should not throw for reporting failures – just log and continue
    // console.warn is safe inside activity context
    // eslint-disable-next-line no-console
    console.warn('reportProgress failed:', err && err.message ? err.message : err);
  }
}
