<template>
  <!-- Upload Dialog -->
  <div
    v-if="showUploadDialog"
    class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-6"
    @click="closeUploadDialog"
  >
    <div
      class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      @click.stop
    >
      <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
        <i class="fas fa-cloud-upload-alt text-blue-500"></i> Upload Media
      </h3>

      <!-- Upload Type Selector -->
      <div class="flex gap-2 mb-6">
        <button
          class="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:border-blue-500 hover:text-blue-500 transition"
          @click="triggerUpload('photos')"
        >
          <i class="fas fa-image text-base"></i> Photos
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:border-blue-500 hover:text-blue-500 transition"
          @click="triggerUpload('videos')"
        >
          <i class="fas fa-video text-base"></i> Videos
        </button>
      </div>

      <!-- Hidden File Input -->
      <input
        ref="fileInput"
        type="file"
        :accept="uploadType === 'photos' ? 'image/*' : 'video/*'"
        multiple
        @change="handleFileSelect"
        class="hidden"
      />

      <!-- Selected Files Summary -->
      <div v-if="selectedFiles.length > 0" class="mb-6 text-sm text-gray-700">
        <p>
          <strong>{{ selectedFiles.length }}</strong>
          file{{ selectedFiles.length > 1 ? 's' : '' }} selected —
          <strong>{{ totalSizeMB }}</strong> MB total
          <span class="text-gray-500">(max 10 files)</span>
        </p>
      </div>
      
      <!-- File Limit Warning -->
      <div v-if="filesRejectedDueToLimit" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p class="text-sm text-yellow-800">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          Maximum file limit reached (10 files). Remove some files to add more.
        </p>
      </div>
      
      <!-- Selected Files List -->
      <div v-if="filesRejectedDueToLimit && selectedFiles.length > 0" class="mb-6 max-h-40 overflow-y-auto">
        <div class="space-y-2">
          <div 
            v-for="(file, index) in selectedFiles" 
            :key="index"
            class="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ file.name }}</p>
              <p class="text-xs text-gray-500">{{ (file.size / (1024 * 1024)).toFixed(2) }} MB</p>
            </div>
            <button
              @click="removeFile(index)"
              class="ml-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              title="Remove file"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
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
          <div
            class="h-full bg-blue-500 transition-all duration-300"
            :style="{ width: `${uploadProgress}%` }"
          ></div>
        </div>
        <p class="text-center text-sm text-gray-600">{{ uploadStatus }}</p>
      </div>

      <!-- Dialog Actions -->
      <div class="flex justify-end gap-4 mt-6">
        <button
          class="bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300 transition"
          @click="closeUploadDialog"
        >
          {{ uploadProgress === 100 && !uploading ? 'Done' : 'Cancel' }}
        </button>
        <button
          v-if="uploadProgress < 100"
          class="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
          @click="uploadFiles"
          :disabled="selectedFiles.length === 0 || uploading"
        >
          {{ uploading ? 'Uploading...' : `Upload ${selectedFiles.length} ${uploadType === 'photos' ? 'Photo' : 'Video'}${selectedFiles.length !== 1 ? 's' : ''}` }}
        </button>
      </div>
    </div>
  </div>

  <!-- Upload Complete Modal -->
  <div
    v-if="showUploadCompleteModal"
    class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-6"
    @click="showUploadCompleteModal = false"
  >
    <div
      class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md"
      @click.stop
    >
      <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <i class="fas fa-check-circle text-green-500"></i> Upload Complete
      </h3>
      <p class="text-sm text-gray-700 mb-6">
        Your files have been uploaded. The album will refresh automatically when processing is complete.
      </p>
      <div class="flex justify-end">
        <button
          class="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 transition"
          @click="confirmUploadComplete"
        >
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
const uploadType = ref('photos')
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
const filesRejectedDueToLimit = ref(false)

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
  filesRejectedDueToLimit.value = false
  
  // Reset the file input to ensure accept attribute is properly applied
  // This is especially important on mobile devices (iOS/Android) where the
  // accept attribute might not update reactively when uploadType changes
  if (fileInput.value) {
    fileInput.value.value = ''
    const acceptValue = type === 'photos' ? 'image/*' : 'video/*'
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
    uploadType.value === 'photos'
      ? file.type.startsWith('image/')
      : file.type.startsWith('video/')
  )

  // Check if adding these files would exceed the 10 file limit
  const totalFilesAfterAdd = selectedFiles.value.length + validFiles.length
  if (totalFilesAfterAdd > 10) {
    const allowedFiles = validFiles.slice(0, 10 - selectedFiles.value.length)
    selectedFiles.value.push(...allowedFiles)
    filesRejectedDueToLimit.value = true
    alert(`Maximum 10 files allowed. Only ${allowedFiles.length} files were added.`)
  } else {
    selectedFiles.value.push(...validFiles)
  }

  if (validFiles.length !== files.length) {
    alert(`Some files were skipped. Only ${uploadType.value} are allowed.`)
  }
}

// Remove a file from the selection
const removeFile = (index) => {
  selectedFiles.value.splice(index, 1)
  // Reset the flag if we're now below the limit
  if (selectedFiles.value.length < 10) {
    filesRejectedDueToLimit.value = false
  }
}

const totalSizeMB = computed(() => {
  const totalBytes = selectedFiles.value.reduce((sum, file) => sum + file.size, 0)
  return (totalBytes / (1024 * 1024)).toFixed(2)
})

async function uploadFiles() {
  if (selectedFiles.value.length === 0) return;

  const actionType = uploadType.value === 'photos' ? 'upload_photos' : 'upload_photos';
  if (!authService.canPerformAction(actionType)) {
    error.value = `You do not have permission to upload ${uploadType.value}`;
    return;
  }

  uploading.value = true;
  uploadProgress.value = 0;
  uploadStatus.value = `Preparing to upload ${selectedFiles.value.length} files...`;
  error.value = null;
  uploadedFiles.value = new Set();
  failedFiles.value = new Set();

  try {
    // Build FormData
    const formData = new FormData();
    selectedFiles.value.forEach((file) => {
      formData.append("files", file);
    });
    if (props.albumName) {
      formData.append("folderPath", props.albumName);
    }

    // Get API details
    const API_BASE_URL = apiService.getApiBaseUrl();
    const url = `${API_BASE_URL}/buckets/${BUCKET_NAME}/upload`;
    const token = apiService.getAuthToken();

    // Use XMLHttpRequest for progress tracking
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          uploadProgress.value = percentComplete;
          uploadStatus.value = `Uploading ${selectedFiles.value.length} files... ${percentComplete}%`;
          // Don't close dialog here - wait for server response
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            uploadProgress.value = 100;
            uploadStatus.value = `Upload complete! Processing starting...`;
            resolve(response);
          } catch (error) {
            reject(new Error("Invalid JSON response"));
          }
        } else {
          reject(new Error(`HTTP error! status: ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error occurred"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload was cancelled"));
      });

      xhr.open("POST", url);
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    });

    if (!response.success) {
      throw new Error(response.error || 'Upload failed');
    }

    // Files uploaded successfully to server, now waiting for processing
    console.log('[MediaUpload] Upload complete, jobId:', response.data.jobId);

    // Store jobId and emit jobReady
    pendingJobId.value = response.data.jobId;
    emit('jobReady', { jobId: pendingJobId.value });
    
    // Close dialog after successful upload
    emit('close', { 
      filesCount: selectedFiles.value.length,
      jobId: pendingJobId.value 
    });

    // Show success modal - skip that for now
    // showUploadCompleteModal.value = true;

    // Keep uploading state as true until processing is complete
    // The parent component will monitor SSE events and update the UI accordingly

  } catch (err) {
    error.value = `Upload failed: ${err.message}`;
    console.error('[MediaUpload] Upload failed:', err);
    uploading.value = false;
    uploadProgress.value = 0;
    uploadStatus.value = `Upload failed: ${err.message}`;
    // Don't close dialog on error - let user see the error message
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
    // Dialog closed - reset everything
    selectedFiles.value = []
    uploadProgress.value = 0
    uploadStatus.value = ''
    uploading.value = false
    uploadedFiles.value = new Set()
    failedFiles.value = new Set()
    error.value = null
    filesRejectedDueToLimit.value = false
  }
})

// Detect mobile (optional)
onMounted(() => {
  // You can add mobile-specific logic here if needed
})
</script>