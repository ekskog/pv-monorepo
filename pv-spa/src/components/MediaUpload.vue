<template>
  <!-- Upload Dialog -->
  <div v-if="showUploadDialog" class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-6"
    @click="closeUploadDialog">
    <div class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-xl max-h-[90vh] overflow-y-auto" @click.stop>
      <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
        <i class="fas fa-cloud-upload-alt text-blue-500"></i> Upload Media
      </h3>

      <!-- Upload Type Selector -->
      <div class="flex gap-2 mb-3">
        <button
          class="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:border-blue-500 hover:text-blue-500 transition"
          @click="triggerUpload('bulk-photos')">
          <i class="fas fa-layer-group text-base"></i> Photos
          <i class="fas fa-circle-info text-xs text-emerald-600"
            title="Follow progress on Monitor Tab."
            aria-label="Bulk upload info"></i>
          <!-- hidden for now 
        </i>
          <i class="fas fa-image text-base"></i> Photos
          -->
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:border-blue-500 hover:text-blue-500 transition"
          @click="triggerUpload('videos')">
          <i class="fas fa-video text-base"></i> Videos
        </button>
      </div>
      <!-- Use only tempral uploads for now, hide the legacy paths
      <div class="mb-6">
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-emerald-300 bg-emerald-50 rounded-lg text-emerald-800 text-sm font-semibold hover:border-emerald-500 hover:bg-emerald-100 transition"
          @click="triggerUpload('bulk-photos')"
          title="Temporal bulk upload for large photo batches (no 10-file limit)."
        >
          <i class="fas fa-layer-group text-base"></i> Bulk Photos (max 500 MB)
          <i
            class="fas fa-circle-info text-xs text-emerald-600"
            title="Uses Temporal background processing. Best for large image batches."
            aria-label="Bulk upload info"
          ></i>
        </button>
      </div>
    -->
      <!-- Hidden File Input -->
      <input ref="fileInput" type="file" :accept="isImageUploadMode ? 'image/*' : 'video/*'" multiple
        @change="handleFileSelect" class="hidden" />

      <!-- Selected Files Summary -->
      <div v-if="selectedFiles.length > 0" class="mb-6 text-sm text-gray-700">
        <p>
          <strong>{{ selectedFiles.length }}</strong>
          file{{ selectedFiles.length > 1 ? 's' : '' }} selected —
          <strong>{{ totalSizeMB }}</strong> MB total
        </p>
      </div>


      <!-- Error Message -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-800">
          <i class="fas fa-exclamation-circle mr-2"></i>
          {{ error }}
        </p>
      </div>

      <!-- Upload Progress -->
      <div v-if="uploading" class="mb-6">
        <div class="w-full h-2 bg-gray-200 rounded overflow-hidden mb-2">
          <div class="h-full bg-blue-500 transition-all duration-300" :style="{ width: `${uploadProgress}%` }"></div>
        </div>
        <p class="text-center text-sm text-gray-600">{{ uploadStatus }}</p>
      </div>

      <!-- Dialog Actions -->
      <div class="flex justify-end gap-4 mt-6">
        <button class="bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300 transition"
          @click="closeUploadDialog">
          {{ uploadProgress === 100 && !uploading ? 'Done' : 'Cancel' }}
        </button>
        <button v-if="uploadProgress < 100"
          class="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
          @click="uploadFiles" :disabled="selectedFiles.length === 0 || uploading">
          {{ uploading ? 'Uploading...' : `Upload ${selectedFiles.length} ${uploadType === 'videos' ? 'Video' :
            'Photo'}${selectedFiles.length !== 1 ? 's' : ''}` }}
        </button>
      </div>
    </div>
  </div>

  <!-- Upload Complete Modal -->
  <div v-if="showUploadCompleteModal" class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-6"
    @click="showUploadCompleteModal = false">
    <div class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md" @click.stop>
      <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <i class="fas fa-check-circle text-green-500"></i> Upload Complete
      </h3>
      <p class="text-sm text-gray-700 mb-6">
        Your files have been uploaded. The album will refresh automatically when processing is complete.
      </p>
      <div class="flex justify-end">
        <button class="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition"
          @click="confirmUploadComplete">
          OK
        </button>
      </div>
    </div>
  </div>
</template>



<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import authService from '../services/auth.js'
import apiService from '../services/api.js'

// Props
const props = defineProps({
  showUploadDialog: {
    type: Boolean,
    default: false
  },
  albumName: {
    type: String,
    default: 'Test'
  },
  currentJobId: {
    type: String,
    default: null
  }
})

// Emits
const emit = defineEmits(['close', 'jobReady'])

// Constants
const BUCKET_NAME = 'photovault'

// Reactive state
const uploadType = ref('bulk-photos')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const selectedFiles = ref([])
const uploadedFiles = ref(new Set())
const failedFiles = ref(new Set())
const error = ref(null)
const fileInput = ref(null)
const showUploadCompleteModal = ref(false)
const pendingJobId = ref(null)
const isImageUploadMode = computed(() => uploadType.value === 'bulk-photos')

// Watch for job completion
watch(() => props.currentJobId, (newJobId, oldJobId) => {
  if (newJobId !== oldJobId && oldJobId === pendingJobId.value) {
    console.log('[MediaUpload] Processing completed for job:', newJobId);
    // Reset uploading state when processing is complete
    uploading.value = false;
    uploadStatus.value = 'Processing complete!';
  }
});


// Trigger upload flow
const triggerUpload = (type) => {
  uploadType.value = type
  selectedFiles.value = []

  // Reset the file input to ensure accept attribute is properly applied
  // This is especially important on mobile devices (iOS/Android) where the
  // accept attribute might not update reactively when uploadType changes
  if (fileInput.value) {
    fileInput.value.value = ''
    const acceptValue = (type === 'photos' || type === 'bulk-photos') ? 'image/*' : 'video/*'
    fileInput.value.setAttribute('accept', acceptValue)
  }

  // Small delay to ensure attribute is set before opening picker
  setTimeout(() => {
    fileInput.value?.click()
  }, 10)
}

// File selection
const handleFileSelect = (event) => {
  const files = Array.from(event.target.files)
  const validFiles = files.filter(file =>
    uploadType.value === 'bulk-photos'
      ? file.type.startsWith('image/')
      : file.type.startsWith('video/')
  )
  selectedFiles.value.push(...validFiles)

  if (validFiles.length !== files.length) {
    alert(`Some files were skipped. Only ${uploadType.value === 'bulk-photos' ? 'images' : 'videos'} are allowed.`)
  }
}


const totalSizeMB = computed(() => {
  const totalBytes = selectedFiles.value.reduce((sum, file) => sum + file.size, 0)
  return (totalBytes / (1024 * 1024)).toFixed(2)
})

// Send all selected video files as multipart/form-data to pv-api, which stages them
// to NFS and hands off to a Temporal workflow. Returns 202 + batchId immediately.
async function uploadVideoFiles() {
  const API_BASE_URL = apiService.getApiBaseUrl();
  const token = apiService.getAuthToken();
  const folder = encodeURIComponent(props.albumName || '');
  const url = `${API_BASE_URL}/video/upload/${folder}`;

  const formData = new FormData();
  selectedFiles.value.forEach(file => formData.append('videos', file));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      uploadProgress.value = pct;
      uploadStatus.value = `Uploading ${selectedFiles.value.length} video(s)… ${pct}%`;
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid JSON response')); }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during video upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

async function uploadFiles() {
  if (selectedFiles.value.length === 0) return;

  if (!authService.canPerformAction('upload_photos')) {
    error.value = `You do not have permission to upload ${uploadType.value}`;
    return;
  }

  uploading.value = true;
  uploadProgress.value = 0;
  uploadStatus.value = `Preparing to upload ${selectedFiles.value.length} files...`;
  error.value = null;
  uploadedFiles.value = new Set();
  failedFiles.value = new Set();

  const isBulkUpload = uploadType.value === 'bulk-photos';
  console.log('[MediaUpload] uploadType:', uploadType.value, '→ isBulkUpload:', isBulkUpload);

  try {
    if (isBulkUpload) {
      // ── Bulk photo upload via Temporal ──────────────────────────────────
      const formData = new FormData();
      selectedFiles.value.forEach((file) => formData.append('images', file));

      const API_BASE_URL = apiService.getApiBaseUrl();
      const url = `${API_BASE_URL}/bulk/upload/${encodeURIComponent(props.albumName || '')}`;
      const token = apiService.getAuthToken();

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            uploadProgress.value = pct;
            uploadStatus.value = `Uploading ${selectedFiles.value.length} photos… ${pct}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error('Invalid JSON response')); }
          } else {
            reject(new Error(`HTTP error! status: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error occurred')));
        xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')));

        xhr.open('POST', url);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      if (!response.success) throw new Error(response.error || 'Upload failed');
      if (!response.batchId) throw new Error('Bulk upload response missing batchId');

      const workflowId = `batch-${response.batchId}`;
      console.log('[MediaUpload] Bulk upload accepted, workflowId:', workflowId);
      pendingJobId.value = workflowId;
      emit('jobReady', { mode: 'temporal-bulk', batchId: response.batchId, workflowId });

    } else {
      // ── Video upload → Temporal ─────────────────────────────────────────
      uploadStatus.value = `Uploading ${selectedFiles.value.length} video(s)…`;
      const response = await uploadVideoFiles();

      if (!response.success) throw new Error(response.error || 'Video upload failed');
      if (!response.batchId) throw new Error('Video upload response missing batchId');

      const workflowId = `video-${response.batchId}`;
      console.log('[MediaUpload] Video accepted, workflowId:', workflowId);
      pendingJobId.value = workflowId;
      emit('jobReady', { mode: 'temporal-video', batchId: response.batchId, workflowId });
    }

    // Close dialog after successful upload
    emit('close', {
      filesCount: selectedFiles.value.length,
      jobId: pendingJobId.value,
      mode: isBulkUpload ? 'temporal-bulk' : 'legacy-video',
    });

  } catch (err) {
    error.value = `Upload failed: ${err.message}`;
    console.error('[MediaUpload] Upload failed:', err);
    uploading.value = false;
    uploadProgress.value = 0;
    uploadStatus.value = `Upload failed: ${err.message}`;
  }
}

const confirmUploadComplete = () => {
  showUploadCompleteModal.value = false
  // Don't reset uploading state here - let processing finish
  closeUploadDialog(pendingJobId.value, false) // false = don't reset uploading state
}

// Close dialog
const closeUploadDialog = (jobId = null, resetUploadingState = true) => {
  console.log('[MediaUpload] closeUploadDialog called, jobId:', jobId, 'resetUploading:', resetUploadingState)

  selectedFiles.value = []
  uploadProgress.value = 0
  uploadStatus.value = ''

  // Only reset uploading state if explicitly requested or if no jobId (meaning no processing is happening)
  if (resetUploadingState || !jobId) {
    uploading.value = false
    uploadedFiles.value = new Set()
    failedFiles.value = new Set()
  }

  error.value = null
  pendingJobId.value = null

  // Emit close event with jobId if provided
  if (jobId) {
    emit('close', {
      jobId: jobId,
      filesCount: selectedFiles.value.length || 0
    })
  } else {
    emit('close')
  }
  console.log('[MediaUpload] close event emitted')
}

watch(() => props.showUploadDialog, (isOpen) => {
  if (!isOpen) {
    selectedFiles.value = []
    uploadProgress.value = 0
    uploadStatus.value = ''
    uploading.value = false
    uploadedFiles.value = new Set()
    failedFiles.value = new Set()
    error.value = null
  }
})

onMounted(() => {
  console.log('[MediaUpload] version: 2026-04-13-temporal-only — Photos→bulk-photos, Videos→videos')
})
</script>