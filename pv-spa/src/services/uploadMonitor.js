import { reactive, readonly } from 'vue';
import apiService from './api.js';
import SSEService from './sseService.js';
import WorkflowStatusService from './workflowStatusService.js';
import userSettings from './userSettings.js';

const jobsState = reactive({});
const controllers = new Map();

const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'TERMINATED',
  'CANCELED',
  'CANCELLED',
]);

const clampPercentage = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const nowIso = () => new Date().toISOString();

export const isTerminalUploadStatus = (status) => TERMINAL_STATUSES.has(status);

const monitoringEnabledFor = (job) => {
  if (!job) {
    return false;
  }

  if (job.kind === 'legacy') {
    return !!userSettings.get('monitorNonBulkUploads');
  }

  return !!userSettings.get('monitorBulkUploads');
};

const disabledMessageFor = (job) => {
  if (job?.kind === 'legacy') {
    return 'Live monitoring is disabled for non-bulk uploads. Enable it in Settings to stream progress here.';
  }

  return 'Live monitoring is disabled for bulk uploads. Enable it in Settings to poll progress here.';
};

const defaultMessageFor = (job) => {
  if (job?.kind === 'legacy') {
    return 'Waiting for upload processing updates...';
  }

  return 'Waiting for bulk processing updates...';
};

const upsertJob = (jobId, patch) => {
  const current = jobsState[jobId] || {};
  jobsState[jobId] = {
    ...current,
    ...patch,
    progress: patch.progress ? { ...(current.progress || {}), ...patch.progress } : (current.progress || patch.progress),
    updatedAt: nowIso(),
  };
  return jobsState[jobId];
};

const stopMonitoring = (jobKey) => {
  const active = controllers.get(jobKey);
  if (!active) {
    return;
  }

  active.sseService?.stop();
  active.workflowStatusService?.stop();

  if (active.progressIntervalId) {
    clearInterval(active.progressIntervalId);
  }

  controllers.delete(jobKey);
};

const markTerminal = (jobKey, status, patch = {}) => {
  const current = jobsState[jobKey];
  if (!current) {
    return;
  }

  stopMonitoring(jobKey);
  upsertJob(jobKey, {
    ...patch,
    status,
    completedAt: nowIso(),
  });
};

const fetchBulkProgress = async (jobKey) => {
  const job = jobsState[jobKey];
  if (!job?.batchId || isTerminalUploadStatus(job.status)) {
    return;
  }

  const response = await apiService.getBulkJobProgress(job.batchId);
  if (!response?.progress) {
    return;
  }

  const progress = response.progress;
  upsertJob(jobKey, {
    progress: {
      uploaded: progress.uploaded ?? 0,
      total: progress.total ?? 0,
      failed: progress.failed ?? 0,
      percentage: clampPercentage(progress.percentage ?? 0),
      current: progress.current ?? progress.uploaded ?? 0,
    },
    status: 'RUNNING',
    message: `Uploaded ${progress.uploaded ?? 0} of ${progress.total ?? 0} files`,
  });
};

const handleLegacyUpdate = (jobKey, data) => {
  if (!jobsState[jobKey]) {
    return;
  }

  switch (data?.type) {
    case 'connected':
      upsertJob(jobKey, {
        status: 'RUNNING',
        message: 'Connected to upload processing service...',
      });
      break;

    case 'started':
      upsertJob(jobKey, {
        status: 'RUNNING',
        message: data.message || `Processing started for ${data.progress?.total || 0} files...`,
        progress: {
          current: 0,
          total: data.progress?.total || 0,
          uploaded: 0,
          failed: 0,
          percentage: 0,
        },
      });
      break;

    case 'progress': {
      const progress = data.progress || {};
      const current = progress.current ?? 0;
      const total = progress.total ?? 0;
      const uploaded = progress.uploaded ?? 0;
      const failed = progress.failed ?? 0;
      const percentage = clampPercentage(progress.percentage ?? 0);
      let message = `Processing ${current}/${total} files`;

      if (uploaded > 0 || failed > 0) {
        const fragments = [];
        if (uploaded > 0) {
          fragments.push(`${uploaded} successful`);
        }
        if (failed > 0) {
          fragments.push(`${failed} failed`);
        }
        message += ` • ${fragments.join(', ')}`;
      }

      upsertJob(jobKey, {
        status: 'RUNNING',
        message,
        progress: {
          current,
          total,
          uploaded,
          failed,
          percentage,
          lastUploaded: progress.lastUploaded || null,
          lastFailed: progress.lastFailed || null,
        },
      });
      break;
    }

    case 'complete': {
      const uploaded = data.results?.uploaded ?? data.progress?.uploaded ?? 0;
      const failed = data.results?.failed ?? data.progress?.failed ?? 0;
      const total = data.results?.total ?? uploaded + failed;
      markTerminal(jobKey, 'COMPLETED', {
        message: failed > 0
          ? `Processing complete: ${uploaded} uploaded, ${failed} failed`
          : `Processing complete: ${uploaded} uploaded`,
        progress: {
          current: total,
          total,
          uploaded,
          failed,
          percentage: 100,
        },
      });
      break;
    }

    case 'failed':
      markTerminal(jobKey, 'FAILED', {
        error: data.error || 'Upload processing failed.',
        message: data.error || 'Upload processing failed.',
      });
      break;

    default:
      upsertJob(jobKey, {
        message: data?.message || jobsState[jobKey]?.message || defaultMessageFor(jobsState[jobKey]),
      });
  }
};

const handleLegacyError = (jobKey, error) => {
  if (!jobsState[jobKey] || isTerminalUploadStatus(jobsState[jobKey].status)) {
    return;
  }

  upsertJob(jobKey, {
    status: 'FAILED',
    error: error?.message || 'Lost connection to upload processing stream.',
    message: error?.message || 'Lost connection to upload processing stream.',
    completedAt: nowIso(),
  });
  stopMonitoring(jobKey);
};

const handleBulkStatusUpdate = (jobKey, payload) => {
  const job = jobsState[jobKey];
  if (!job) {
    return;
  }

  const status = payload?.status || 'RUNNING';

  switch (status) {
    case 'RUNNING':
      upsertJob(jobKey, {
        status,
        message: job.progress?.total
          ? `Uploaded ${job.progress.uploaded || 0} of ${job.progress.total} files`
          : 'Bulk upload is running...',
      });
      break;

    case 'COMPLETED': {
      const result = payload?.result || {};
      const successful = result.successful ?? job.progress?.uploaded ?? 0;
      const failed = result.failed ?? job.progress?.failed ?? 0;
      const total = result.totalImages ?? job.progress?.total ?? successful + failed;
      markTerminal(jobKey, 'COMPLETED', {
        message: failed > 0
          ? `Bulk upload complete: ${successful}/${total} successful, ${failed} failed`
          : `Bulk upload complete: ${successful}/${total} successful`,
        progress: {
          current: total,
          total,
          uploaded: successful,
          failed,
          percentage: 100,
        },
      });
      break;
    }

    case 'FAILED':
    case 'TIMED_OUT':
    case 'TERMINATED':
    case 'CANCELED':
    case 'CANCELLED':
      markTerminal(jobKey, status, {
        error: payload?.error?.message || 'Bulk processing failed.',
        message: payload?.error?.message || `Bulk processing ended with status ${status}.`,
      });
      break;

    default:
      upsertJob(jobKey, {
        status,
        message: payload?.message || `Bulk upload status: ${status}`,
      });
  }
};

const handleBulkStatusError = (jobKey, error) => {
  if (!jobsState[jobKey] || isTerminalUploadStatus(jobsState[jobKey].status)) {
    return;
  }

  upsertJob(jobKey, {
    error: error?.message || 'Bulk status polling failed.',
    message: error?.message || jobsState[jobKey].message || 'Bulk status polling failed.',
  });
};

const startLegacyMonitoring = (jobKey) => {
  const job = jobsState[jobKey];
  if (!job?.jobId) {
    return;
  }

  const active = controllers.get(jobKey) || {};
  if (active.sseService) {
    return;
  }

  const sseService = new SSEService(
    apiService,
    job.jobId,
    (data) => handleLegacyUpdate(jobKey, data),
    (error) => handleLegacyError(jobKey, error)
  );

  controllers.set(jobKey, {
    ...active,
    sseService,
  });

  upsertJob(jobKey, {
    status: 'RUNNING',
    message: job.message || defaultMessageFor(job),
  });
  sseService.start();
};

const startBulkMonitoring = (jobKey) => {
  const job = jobsState[jobKey];
  if (!job?.workflowId) {
    return;
  }

  const active = controllers.get(jobKey) || {};

  if (!active.workflowStatusService) {
    active.workflowStatusService = new WorkflowStatusService(
      apiService,
      job.workflowId,
      (payload) => handleBulkStatusUpdate(jobKey, payload),
      (error) => handleBulkStatusError(jobKey, error)
    );
    active.workflowStatusService.start();
  }

  if (!active.progressIntervalId && job.batchId) {
    fetchBulkProgress(jobKey).catch(() => {});
    active.progressIntervalId = setInterval(() => {
      fetchBulkProgress(jobKey).catch(() => {});
    }, 5000);
  }

  controllers.set(jobKey, active);

  upsertJob(jobKey, {
    status: job.status === 'ACCEPTED' ? 'RUNNING' : job.status,
    message: job.message || defaultMessageFor(job),
  });
};

const syncMonitoringForJob = (jobKey) => {
  const job = jobsState[jobKey];
  if (!job || isTerminalUploadStatus(job.status)) {
    stopMonitoring(jobKey);
    return;
  }

  if (!monitoringEnabledFor(job)) {
    stopMonitoring(jobKey);
    upsertJob(jobKey, {
      status: 'ACCEPTED',
      message: disabledMessageFor(job),
    });
    return;
  }

  if (job.kind === 'legacy') {
    startLegacyMonitoring(jobKey);
    return;
  }

  startBulkMonitoring(jobKey);
};

const syncAllMonitoring = () => {
  Object.keys(jobsState).forEach((jobKey) => syncMonitoringForJob(jobKey));
};

const registerLegacyUpload = ({ jobId, albumName }) => {
  if (!jobId) {
    return null;
  }

  const jobKey = `legacy:${jobId}`;
  upsertJob(jobKey, {
    id: jobKey,
    kind: 'legacy',
    status: monitoringEnabledFor({ kind: 'legacy' }) ? 'RUNNING' : 'ACCEPTED',
    title: 'Photo upload',
    albumName: albumName || '',
    jobId,
    workflowId: null,
    batchId: null,
    message: monitoringEnabledFor({ kind: 'legacy' }) ? defaultMessageFor({ kind: 'legacy' }) : disabledMessageFor({ kind: 'legacy' }),
    progress: {
      current: 0,
      total: 0,
      uploaded: 0,
      failed: 0,
      percentage: 0,
    },
    startedAt: jobsState[jobKey]?.startedAt || nowIso(),
    completedAt: null,
    error: null,
  });
  syncMonitoringForJob(jobKey);
  return jobKey;
};

const registerBulkUpload = ({ workflowId, batchId, albumName }) => {
  if (!workflowId) {
    return null;
  }

  const jobKey = `bulk:${workflowId}`;
  upsertJob(jobKey, {
    id: jobKey,
    kind: 'bulk',
    status: monitoringEnabledFor({ kind: 'bulk' }) ? 'RUNNING' : 'ACCEPTED',
    title: 'Bulk upload',
    albumName: albumName || '',
    jobId: null,
    workflowId,
    batchId: batchId || null,
    message: monitoringEnabledFor({ kind: 'bulk' }) ? defaultMessageFor({ kind: 'bulk' }) : disabledMessageFor({ kind: 'bulk' }),
    progress: {
      current: 0,
      total: 0,
      uploaded: 0,
      failed: 0,
      percentage: 0,
    },
    startedAt: jobsState[jobKey]?.startedAt || nowIso(),
    completedAt: null,
    error: null,
  });
  syncMonitoringForJob(jobKey);
  return jobKey;
};

const clearTrackedJob = (jobKey) => {
  stopMonitoring(jobKey);
  delete jobsState[jobKey];
};

if (typeof userSettings.onChange === 'function') {
  userSettings.onChange(() => {
    syncAllMonitoring();
  });
}

export function useUploadMonitor() {
  return {
    jobs: readonly(jobsState),
    registerLegacyUpload,
    registerBulkUpload,
    clearTrackedJob,
    syncAllMonitoring,
  };
}