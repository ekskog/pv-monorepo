import { promises as fs } from 'fs';

/**
 * Remove a finished batch directory from the NFS scratchpad.
 */
export async function cleanupBatch(batchDir: string): Promise<void> {
  try {
    await fs.rm(batchDir, { recursive: true, force: true });
  } catch (err) {
    // Do not throw - cleanup should be best-effort from the workflow
    console.warn(`[cleanup] Failed to remove batch dir ${batchDir}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
