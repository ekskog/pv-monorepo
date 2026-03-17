<template>
  <div class="max-w-6xl mx-auto p-8">
    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-gray-900">Bulk Upload Jobs</h2>
      <p class="text-sm text-gray-600 mt-1">
        View Temporal bulk upload workflows by start date range.
      </p>
    </div>

    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label class="block text-sm text-gray-700 mb-1">From</label>
          <input
            v-model="fromInput"
            type="datetime-local"
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">To</label>
          <input
            v-model="toInput"
            type="datetime-local"
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-700 mb-1">Max Results</label>
          <input
            v-model.number="limit"
            type="number"
            min="1"
            max="1000"
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div class="flex gap-2">
          <button
            class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            @click="loadJobs"
            :disabled="loading"
          >
            {{ loading ? 'Loading...' : 'Load Jobs' }}
          </button>
          <button
            class="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
            @click="loadJobs"
            :disabled="loading"
          >
            Refresh
          </button>
          <button
            class="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200"
            @click="setLast24Hours"
          >
            Last 24h
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
      {{ error }}
    </div>

    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div class="text-sm text-gray-600">
          Showing {{ filteredJobs.length }} of {{ jobs.length }} job{{ jobs.length === 1 ? '' : 's' }}
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-700">Status</label>
          <select
            v-model="statusFilter"
            class="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="ALL">All</option>
            <option
              v-for="status in availableStatuses"
              :key="status"
              :value="status"
            >
              {{ status }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="filteredJobs.length === 0 && !loading" class="p-8 text-center text-gray-500 text-sm">
        No bulk jobs found for the selected range.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-gray-700">
            <tr>
              <th class="text-left px-4 py-3 font-medium">Start Time</th>
              <th class="text-left px-4 py-3 font-medium">Batch ID</th>
              <th class="text-left px-4 py-3 font-medium">Workflow ID</th>
              <th class="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in filteredJobs"
              :key="job.workflowId"
              class="border-t border-gray-100"
            >
              <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(job.startTime) }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ job.batchId }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ job.workflowId }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                  :class="statusClass(job.status)"
                >
                  {{ job.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import apiService from '../services/api.js';

const jobs = ref([]);
const loading = ref(false);
const error = ref('');
const limit = ref(200);
const fromInput = ref('');
const toInput = ref('');
const statusFilter = ref('ALL');

const availableStatuses = computed(() => {
  const statuses = new Set(jobs.value.map((job) => job.status).filter(Boolean));
  return Array.from(statuses).sort();
});

const filteredJobs = computed(() => {
  if (statusFilter.value === 'ALL') {
    return jobs.value;
  }
  return jobs.value.filter((job) => job.status === statusFilter.value);
});

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toLocalDateTimeInput = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const setLast24Hours = () => {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  fromInput.value = toLocalDateTimeInput(from);
  toInput.value = toLocalDateTimeInput(now);
};

const loadJobs = async () => {
  loading.value = true;
  error.value = '';

  try {
    const from = toIsoOrNull(fromInput.value);
    const to = toIsoOrNull(toInput.value);

    const response = await apiService.listBulkJobs({
      from,
      to,
      limit: limit.value || 200,
    });

    jobs.value = response.jobs || [];
  } catch (err) {
    error.value = `Failed to load jobs: ${err.message}`;
    jobs.value = [];
  } finally {
    loading.value = false;
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const statusClass = (status) => {
  switch (status) {
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
      return 'bg-gray-100 text-gray-700';
  }
};

onMounted(() => {
  setLast24Hours();
  loadJobs();
});
</script>
