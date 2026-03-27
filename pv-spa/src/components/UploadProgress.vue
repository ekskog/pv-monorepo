<template>
  <article class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {{ jobTypeLabel }}
        </div>
        <h3 class="mt-1 text-sm font-semibold text-gray-900">{{ title }}</h3>
        <p v-if="job.albumName" class="mt-1 text-xs text-gray-500">
          Album: {{ job.albumName }}
        </p>
      </div>

      <span
        class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
        :class="statusClass"
      >
        {{ statusLabel }}
      </span>
    </div>

    <div class="mt-4">
      <div class="mb-2 flex items-center justify-between gap-3 text-xs text-gray-600">
        <span class="truncate">{{ job.message || fallbackMessage }}</span>
        <span v-if="showPercentage" class="font-semibold text-gray-900">{{ percentage }}%</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="progressBarClass"
          :style="{ width: `${percentage}%` }"
        ></div>
      </div>
    </div>

    <div v-if="stats.length" class="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600 md:grid-cols-4">
      <div
        v-for="item in stats"
        :key="item.label"
        class="rounded-lg bg-gray-50 px-3 py-2"
      >
        <div class="text-[11px] uppercase tracking-wide text-gray-400">{{ item.label }}</div>
        <div class="mt-1 font-semibold text-gray-900">{{ item.value }}</div>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      <span v-if="job.jobId">Job: {{ shortId(job.jobId) }}</span>
      <span v-if="job.workflowId">Workflow: {{ shortId(job.workflowId) }}</span>
      <span v-if="job.batchId">Batch: {{ shortId(job.batchId) }}</span>
      <span v-if="job.updatedAt">Updated: {{ formattedUpdatedAt }}</span>
    </div>

    <p v-if="job.error" class="mt-3 text-xs font-medium text-red-600">
      {{ job.error }}
    </p>
  </article>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  job: {
    type: Object,
    required: true,
  },
});

const progressProp = computed(() => props.job.progress || {});
const localProgress = ref({});
const localMeta = ref({});
const polling = ref(null);
let eventSource = null;

// SSE should only be used for non-bulk (legacy) uploads. Bulk uploads use Temporal polling.
const useSSE = () => Boolean(props.job.jobId && props.job.kind !== 'bulk' && !props.job.workflowId);

const normalizeProgress = (raw) => {
  if (!raw) return {};
  // If temporal shape
  if (raw.totalRequested !== undefined || raw.percentage !== undefined) {
    return {
      percentage: raw.percentage ?? 0,
      total: raw.totalRequested ?? raw.total,
      current: raw.processed ?? raw.current,
      uploaded: raw.successful ?? raw.uploaded,
      failed: raw.failed ?? 0,
      startedAt: raw.startedAt || raw.startedAt,
      updatedAt: raw.updatedAt || raw.updatedAt,
      completedAt: raw.completedAt || raw.completedAt,
      lastSuccessFile: raw.lastSuccessFile,
      lastFailedFile: raw.lastFailedFile,
      error: raw.error,
      // keep raw for debugging
      _raw: raw,
    };
  }
  // SSE/legacy shape (current/total)
  if (raw.current !== undefined || raw.total !== undefined) {
    return {
      percentage: raw.percentage ?? (raw.total ? Math.round((raw.current / raw.total) * 100) : 0),
      total: raw.total,
      current: raw.current,
      uploaded: raw.uploaded ?? raw.current,
      failed: raw.failed ?? 0,
      lastUploaded: raw.lastUploaded || raw.lastUploaded,
      lastFailed: raw.lastFailed || raw.lastFailed,
      _raw: raw,
    };
  }
  return raw;
};

const setLocalProgressFromApi = (apiResp) => {
  if (!apiResp) return;
  // apiResp may be full response { progress, meta, status }
  if (apiResp.progress || apiResp.meta) {
    localProgress.value = normalizeProgress(apiResp.progress || apiResp);
    localMeta.value = apiResp.meta || {};
  } else {
    localProgress.value = normalizeProgress(apiResp);
  }
};

const startSSE = (jobId) => {
  try {
    console.log('[UploadProgress] startSSE -> connecting to', `/processing-status/${jobId}`);
    eventSource = new EventSource(`/processing-status/${jobId}`);
    eventSource.onopen = () => {
      console.log('[UploadProgress] SSE open', jobId);
    };
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        console.log('[UploadProgress] SSE message', jobId, data);
        if (data && data.progress) {
          localProgress.value = normalizeProgress(data.progress);
          localMeta.value.updatedAt = data.timestamp || new Date().toISOString();
        }
      } catch (err) {
        // ignore parse errors
      }
    };
    eventSource.onerror = () => {
      console.warn('[UploadProgress] SSE error/closed', jobId);
      // close on error
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  } catch (err) {
    console.debug('[UploadProgress] startSSE failed', err?.message || err);
    // fallback: do nothing
  }
};

const stopSSE = () => {
  if (eventSource) {
    try { eventSource.close(); } catch (e) {}
    eventSource = null;
  }
};

const startPolling = (workflowId) => {
  if (polling.value) return;
  const fetchOnce = async () => {
    try {
      console.log('[UploadProgress] polling progress for', workflowId);
      const res = await fetch(`/bulk/progress/${encodeURIComponent(workflowId)}`);
      if (!res.ok) {
        console.debug('[UploadProgress] poll non-ok response', workflowId, res.status);
        return;
      }
      const data = await res.json();
      console.log('[UploadProgress] poll response for', workflowId, data);
      // expected { progress, meta, status }
      setLocalProgressFromApi(data.progress ? data : data);
      // If workflow status indicates terminal, stop polling
      const status = data.status || (data.meta && data.meta.status) || props.job.status;
      if (status === 'COMPLETED' || ['FAILED','TIMED_OUT','TERMINATED','CANCELED','CANCELLED'].includes(status)) {
        stopPolling();
      }
    } catch (err) {
      console.debug('[UploadProgress] polling error for', workflowId, err?.message || err);
      // ignore transient fetch errors
    }
  };
  // initial
  fetchOnce();
  polling.value = setInterval(fetchOnce, 2000);
};

const stopPolling = () => {
  if (polling.value) {
    clearInterval(polling.value);
    polling.value = null;
  }
};

onMounted(() => {
  // kick off monitoring based on identifiers
  if (useSSE()) {
    startSSE(props.job.jobId);
  } else if (props.job.workflowId) {
    startPolling(props.job.workflowId);
  } else if (props.job.batchId) {
    // try workflowId prefix first
    startPolling(`batch-${props.job.batchId}`);
  }
});

onUnmounted(() => {
  stopPolling();
  stopSSE();
});

const progress = computed(() => Object.keys(localProgress.value).length ? localProgress.value : progressProp.value || {});

const percentage = computed(() => {
  const numeric = Number(progress.value.percentage ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
});

const showPercentage = computed(() => percentage.value > 0 || props.job.status === 'COMPLETED');

const jobTypeLabel = computed(() => (props.job.kind === 'bulk' ? 'Bulk Upload' : 'Upload'));

const title = computed(() => {
  if (props.job.albumName) {
    return `${props.job.title} for ${props.job.albumName}`;
  }
  return props.job.title || 'Upload';
});

const fallbackMessage = computed(() => {
  if (props.job.kind === 'bulk') {
    return 'Waiting for bulk processing updates...';
  }
  return 'Waiting for upload processing updates...';
});

const statusLabel = computed(() => String(props.job.status || 'UNKNOWN').replaceAll('_', ' '));

const statusClass = computed(() => {
  switch (props.job.status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'RUNNING':
      return 'bg-blue-100 text-blue-800';
    case 'FAILED':
    case 'TIMED_OUT':
    case 'TERMINATED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-amber-100 text-amber-800';
  }
});

const progressBarClass = computed(() => {
  switch (props.job.status) {
    case 'COMPLETED':
      return 'bg-green-500';
    case 'FAILED':
    case 'TIMED_OUT':
    case 'TERMINATED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'bg-red-500';
    default:
      return 'bg-blue-500';
  }
});

const stats = computed(() => {
  const items = [];
  if (progress.value.total !== undefined) {
    items.push({ label: 'Processed', value: `${progress.value.current ?? 0} / ${progress.value.total ?? 0}` });
  } else if (progressProp.value.total) {
    items.push({ label: 'Processed', value: `${progressProp.value.current ?? 0} / ${progressProp.value.total ?? 0}` });
  }
  if (progress.value.uploaded !== undefined || props.job.status === 'COMPLETED') {
    items.push({ label: 'Uploaded', value: progress.value.uploaded ?? progressProp.value.uploaded ?? 0 });
  }
  if (progress.value.failed) {
    items.push({ label: 'Failed', value: progress.value.failed });
  }
  if (showPercentage.value) {
    items.push({ label: 'Progress', value: `${percentage.value}%` });
  }
  return items;
});

const shortId = (value) => {
  if (!value) {
    return '-';
  }
  const text = String(value);
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
};

const formattedUpdatedAt = computed(() => {
  if (!props.job.updatedAt) {
    return '-';
  }
  const date = new Date(props.job.updatedAt);
  if (Number.isNaN(date.getTime())) {
    return String(props.job.updatedAt);
  }
  return date.toLocaleTimeString();
});
</script>