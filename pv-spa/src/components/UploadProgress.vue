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
import { computed } from 'vue';

const props = defineProps({
  job: {
    type: Object,
    required: true,
  },
});

const progress = computed(() => props.job.progress || {});

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
  if (progress.value.total) {
    items.push({ label: 'Processed', value: `${progress.value.current || 0} / ${progress.value.total}` });
  }
  if (progress.value.uploaded || props.job.status === 'COMPLETED') {
    items.push({ label: 'Uploaded', value: progress.value.uploaded ?? 0 });
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