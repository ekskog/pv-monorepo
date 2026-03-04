<template>
  <div :class="noBorder ? 'px-2 py-3' : 'max-w-md mx-auto px-4 py-4'">
    <div v-if="loading" class="text-center py-3">
      <div class="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
      <p class="text-gray-500 text-sm md:text-lg">Loading...</p>
    </div>

    <div v-else-if="error" class="py-2 text-red-600 text-sm md:text-lg text-center">
      <p class="mb-1"><i class="fas fa-exclamation-triangle"></i> {{ error }}</p>
      <button class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200" @click="fetchStats">Retry</button>
    </div>

    <div v-else class="space-y-4">
      <!-- General Stats Block -->
      <div class="px-4 py-3 w-fit mx-auto text-left text-sm md:text-lg space-y-1">
        <div><span class="text-gray-500">Gallery Size:</span> <span class="text-gray-800">{{ formatSize(stats.totalSize) }}</span></div>
        <div><span class="text-gray-500">Total Files:</span> <span class="text-gray-800">{{ stats.fileCount }}</span></div>
        <div class="pt-1 text-gray-600 font-medium text-sm md:text-base">Total File Types </div>
        <div class="flex flex-wrap gap-2 pt-1 text-sm md:text-base">
          <span v-for="(count, type) in stats.fileTypeCounts" :key="type" class="text-gray-700">
            .{{ type }} <span class="font-semibold">({{ count }})</span>
          </span>
        </div>
      </div>

      <!-- Table -->
      <div class="w-fit mx-auto">
        <table class="text-sm md:text-base text-gray-800 border border-gray-200">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="px-3 py-2 border-b border-gray-200 text-left">Album</th>
              <th class="px-3 py-2 border-b border-gray-200 text-right">.avif</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(types, folder) in stats.folderTypeCounts"
              :key="folder"
              class="border-t border-gray-100"
            >
              <td class="px-3 py-2 text-left whitespace-nowrap">{{ folder }}</td>
              <td class="px-3 py-2 text-right text-blue-600 font-semibold">{{ types.avif ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>


<script setup>
import { ref, onMounted } from 'vue'
const props = defineProps({ noBorder: Boolean })
import apiService from '../services/api.js'

const loading = ref(true)
const error = ref(null)
const stats = ref({})

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

async function fetchStats() {
  loading.value = true
  error.value = null
  try {
    const result = await apiService.request('/stats')
    stats.value = result
  } catch (err) {
    error.value = err.message || 'Failed to fetch bucket statistics.'
  } finally {
    loading.value = false
  }
}

onMounted(fetchStats)
</script>

