<template>
  <div class="max-w-6xl mx-auto p-4 md:p-8">
    
    <div class="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/40 p-5 md:p-6">
      <h2 class="text-2xl font-semibold text-slate-900">Monitor Media Uploads</h2>
      <p class="mt-1 text-sm text-slate-600">
        
      </p>
    </div>
  
  
    <section class="grid grid-cols-1 gap-6">
      <article class="rounded-xl border border-gray-200 bg-white p-4 md:p-5 min-h-[30rem]">
        <div class="flex items-center justify-between gap-3">

        </div>
        <div class="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-600">Show</label>
            <select
              v-model="temporalStatusView"
              class="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="ALL">All</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Running: {{ temporalRunningCount }}
            </span>
            <span class="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              Completed: {{ temporalCompletedCount }}
            </span>
            <button
              class="bg-white text-gray-700 border border-gray-300 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
              @click="loadJobs"
              :disabled="loading"
            >
              {{ loading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {{ error }}
        </div>

        <div v-if="temporalPanelJobs.length === 0" class="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          No Temporal workflows for this filter.
        </div>

        <div v-else class="mt-4 max-h-[22rem] overflow-y-auto pr-1 space-y-3">
          <div
            v-for="job in temporalPanelJobs"
            :key="job.workflowId"
            class="rounded-lg border border-gray-200 p-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs text-gray-500">{{ formatDate(job.startTime) }}</div>
              <span
                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                :class="statusClass(job.status)"
              >
                {{ job.status }}
              </span>
            </div>
            <div class="mt-2 text-xs text-gray-600">Workflow: <span class="font-mono break-all">{{ job.workflowId || '-' }}</span></div>

            <div class="mt-2 text-sm text-gray-700">
              <template v-if="progressMap[job.batchId]">
                <div class="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">Succeeded</span>
                    <span class="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{{ progressMap[job.batchId].uploaded ?? 0 }}</span>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">Failed</span>
                    <span class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{{ progressMap[job.batchId].failed ?? 0 }}</span>
                  </div>

                  <div class="text-xs text-gray-500">{{ progressMap[job.batchId].current ?? ( (progressMap[job.batchId].uploaded ?? 0) + (progressMap[job.batchId].failed ?? 0) ) }} / {{ progressMap[job.batchId].total ?? '-' }} files</div>

                  <div class="ml-2 text-xs text-gray-500">{{ progressMap[job.batchId].percentage ?? 0 }}%</div>
                </div>
              </template>
              <span v-else class="text-gray-400">No progress sample yet</span>
            </div>
          </div>
        </div>
      </article>

      <!--  Hide Legacy
      <article class="rounded-xl border border-gray-200 bg-white p-4 md:p-5 min-h-[30rem]">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-gray-900">Non-Bulk Live SSE</h3>
            <p class="mt-1 text-sm text-gray-600">Latest non-bulk uploads for this browser session, with ongoing jobs highlighted.</p>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <span class="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Live SSE jobs: {{ legacyRunningCount }}
          </span>
          <span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
            Session total: {{ legacyUploads.length }}
          </span>
        </div>

        <div v-if="legacyUploads.length === 0" class="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          No non-bulk SSE uploads in this session yet.
        </div>

        <div v-else class="mt-4 max-h-[22rem] overflow-y-auto pr-1 space-y-4">
          <section>
            <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Ongoing</div>
            <div v-if="legacyOngoingUploads.length === 0" class="rounded-lg border border-dashed border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-700">
              No ongoing non-bulk uploads right now.
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="job in legacyOngoingUploads"
                :key="`ongoing-${job.id}`"
                class="rounded-xl border-2 border-blue-300 bg-blue-50/40 p-1"
              >
                <UploadProgress :job="job" />
              </div>
            </div>
          </section>

          <section>
            <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Latest In This Session</div>
            <div class="space-y-3">
              <div
                v-for="job in latestLegacySessionUploads"
                :key="`latest-${job.id}`"
                :class="[
                  'rounded-xl border p-1',
                  isTerminalUploadStatus(job.status)
                    ? 'border-gray-200 bg-gray-50/40'
                    : 'border-blue-200 bg-blue-50/30'
                ]"
              >
                <UploadProgress :job="job" />
              </div>
            </div>
          </section>
        </div>
      </article>
    -->
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import apiService from '../services/api.js';
import UploadProgress from './UploadProgress.vue';
import { useUploadMonitor, isTerminalUploadStatus } from '../services/uploadMonitor.js';

const jobs = ref([]);
const loading = ref(false);
const error = ref('');
const temporalStatusView = ref('RUNNING');
const progressMap = ref({});

let progressInterval = null;
let jobsInterval = null;

const { jobs: trackedUploads } = useUploadMonitor();

const legacyUploads = computed(() =>
  Object.values(trackedUploads)
    .filter((job) => job.kind === 'legacy')
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
);

const legacyRunningCount = computed(() =>
  legacyUploads.value.filter((job) => !isTerminalUploadStatus(job.status)).length
);

const legacyOngoingUploads = computed(() =>
  legacyUploads.value.filter((job) => !isTerminalUploadStatus(job.status))
);

const latestLegacySessionUploads = computed(() => legacyUploads.value.slice(0, 8));

const temporalRunningCount = computed(() => jobs.value.filter((job) => job.status === 'RUNNING').length);
const temporalCompletedCount = computed(() => jobs.value.filter((job) => job.status === 'COMPLETED').length);

const temporalPanelJobs = computed(() => {
  if (temporalStatusView.value === 'ALL') {
    return jobs.value;
  }

  return jobs.value.filter((job) => job.status === temporalStatusView.value);
});

const loadJobs = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = await apiService.listBulkJobs({ limit: 200 });

    jobs.value = response.jobs || [];
    await loadProgressForRunningJobs();
  } catch (err) {
    error.value = `Failed to load jobs: ${err.message}`;
    jobs.value = [];
  } finally {
    loading.value = false;
  }
};

const loadProgressForRunningJobs = async () => {
  const running = jobs.value.filter((job) => job.status === 'RUNNING');
  if (running.length === 0) return;

  await Promise.all(
    running.map(async (job) => {
      try {
        console.log('[BulkUploadJobs] fetching progress for batchId=', job.batchId);
        const res = await apiService.getBulkJobProgress(job.batchId);
                if (res && res.progress) {
                  // Normalize progress shapes between Temporal and legacy SSE polling
                  const p = res.progress;
                  const totalVal = (p.totalRequested ?? p.total) || 1;
                  const processedVal = p.processed ?? p.current ?? 0;
                  const percentageVal = p.percentage ?? Math.round((processedVal / totalVal) * 100);
                  const normalized = {
                    total: p.total ?? p.totalRequested ?? 0,
                    current: processedVal,
                    uploaded: p.uploaded ?? p.successful ?? 0,
                    failed: p.failed ?? 0,
                    percentage: percentageVal,
                    // keep raw for debugging
                    _raw: p,
                  };
                  progressMap.value = { ...progressMap.value, [job.batchId]: normalized };
                  console.log('[BulkUploadJobs] progress for', job.batchId, progressMap.value[job.batchId]);
        }
      } catch (e) {
        console.debug('[BulkUploadJobs] progress fetch error for', job.batchId, e?.message || e);
        // ignore 404 / no-progress
      }
    })
  );
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const shortId = (id) => {
  if (!id) return '-';
  return String(id).slice(0, 6);
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
  loadJobs();

  // Keep workflow list fresh so RUNNING->COMPLETED transitions appear without manual refresh.
  jobsInterval = setInterval(() => {
    loadJobs().catch(() => {});
  }, 10000);

  progressInterval = setInterval(() => {
    loadProgressForRunningJobs().catch(() => {});
  }, 5000);
});

onBeforeUnmount(() => {
  if (progressInterval) clearInterval(progressInterval);
  if (jobsInterval) clearInterval(jobsInterval);
});
</script>
