<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cursor-pointer" @click="$emit('close')">
    <div class="relative w-full h-full flex items-center justify-center cursor-default" @click.stop>
      
      <!-- Navigation Controls -->
      <button 
        class="absolute top-1/2 left-8 transform -translate-y-1/2 bg-white bg-opacity-10 text-white w-15 h-15 rounded-full text-2xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed md:left-4 md:w-12 md:h-12 md:text-xl" 
        @click.stop="previousPhoto" 
        :disabled="currentIndex === 0"
        title="Previous Photo (←)"
      >
        <i class="fas fa-chevron-left"></i>
      </button>

      <button 
        class="absolute top-1/2 right-8 transform -translate-y-1/2 bg-white bg-opacity-10 text-white w-15 h-15 rounded-full text-2xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed md:right-4 md:w-12 md:h-12 md:text-xl" 
        @click.stop="nextPhoto"
        :disabled="currentIndex === photos.length - 1" 
        title="Next Photo (→)"
      >
        <i class="fas fa-chevron-right"></i>
      </button>

      <!-- Close Button -->
      <button class="absolute top-8 right-8 bg-white bg-opacity-10 text-white w-12 h-12 rounded-full text-xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 md:top-4 md:right-4 md:w-10 md:h-10 md:text-base" @click.stop="$emit('close')" title="Close (Esc)">
        <i class="fas fa-times"></i>
      </button>

      <!-- Photo Display -->
      <div class="flex flex-col max-w-[95vw] max-h-[95vh] w-full h-full items-center justify-center">
        <div class="flex-1 flex items-center justify-center relative w-full min-h-0" style="height: calc(100% - 80px);">
          
          <img 
            v-if="currentPhoto" 
            :src="getPhotoUrl(currentPhoto)" 
            :alt="currentPhoto.name" 
            class="max-w-full w-auto h-auto object-contain shadow-2xl rounded block mx-auto"
            style="max-height: calc(100vh - 120px);"
            @error="handleImageError" 
            @load="handleImageLoad"
          >

          <!-- Loading Spinner -->
          <div v-if="!imageLoaded" class="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
            <i class="fas fa-spinner fa-spin text-5xl mb-4"></i>
            <p>Loading image...</p>
          </div>
        </div>

        <!-- Photo Info & Actions -->
        <div class="bg-black bg-opacity-80 backdrop-blur-sm text-white p-4 px-6 flex justify-between items-center rounded-lg mt-auto flex-shrink-0 w-full max-w-3xl md:flex-col md:gap-4 md:text-center md:p-4">
          <div>
            <p class="m-0 text-sm opacity-80">
              {{ currentIndex + 1 }} of {{ photos.length }}
            </p>
          </div>

          <div class="flex gap-3">
            <button 
              @click="showMetadata = !showMetadata"
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-opacity-20 hover:scale-110" 
              title="Photo Info"
            >
              <i class="fas fa-info"></i>
            </button>
            <button 
              @click="downloadPhoto(currentPhoto)" 
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-opacity-20 hover:scale-110" 
              title="Download Photo"
            >
              <i class="fas fa-download"></i>
            </button>
            <button 
              v-if="canShowDeleteButton" 
              @click="$emit('delete-photo', currentPhoto)"
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-red-600 hover:bg-opacity-80 hover:scale-110" 
              title="Delete Photo"
            >
              <i class="fas fa-trash"></i>
            </button>
            <button 
              v-if="canShowEditButton"
              @click="showMetadataEditor = true"
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-opacity-20 hover:scale-110" 
              title="Edit Metadata"
            >
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>

        <!-- Metadata Overlay -->
        <div 
          v-if="showMetadata && currentPhoto" 
          class="absolute bottom-20 right-8 bg-black bg-opacity-90 backdrop-blur-sm text-white p-4 rounded-lg max-w-sm z-20 transition-all duration-300 max-h-96 overflow-y-auto"
          @click.stop
        >
          <div class="flex justify-between items-center mb-3">
            <span></span> <!-- spacer -->
            <button @click="showMetadata = false" class="text-gray-400 hover:text-white text-sm">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <PhotoMetadataDetailed 
            :photo="currentPhoto"
            :photo-metadata-lookup="photoMetadataLookup" 
          />
        </div>

        <!-- Metadata Editor Modal -->
        <EditPhotoMetadata 
          v-if="showMetadataEditor" 
          :photo="currentPhoto" 
          :photo-metadata-lookup="photoMetadataLookup" 
          @close="showMetadataEditor = false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import apiService from '../services/api.js'
import authService from '../services/auth.js'
import PhotoMetadataDetailed from './PhotoMetadataDetailed.vue'
import EditPhotoMetadata from './EditPhotoMetadata.vue'

// Props
const props = defineProps({
  show: Boolean,
  photos: Array,
  currentIndex: Number,
  loading: Boolean,
  canDelete: Boolean,
  bucketName: {
    type: String,
    default: 'photovault'
  },
  albumName: {
    type: String,
    required: true
  },
  photoMetadataLookup: { type: Object, default: () => ({}) }
})

// Emits
const emit = defineEmits(['close', 'next-photo', 'previous-photo', 'delete-photo'])

// Local state
const imageLoaded = ref(false)
const showMetadata = ref(false)
const showMetadataEditor = ref(false)

// Computed
const currentPhoto = computed(() => props.photos[props.currentIndex] || null)

const canShowDeleteButton = computed(() => {
  return props.canDelete && authService.isAuthenticated()
})

const canShowEditButton = computed(() => {
  return authService.isAuthenticated() && authService.canPerformAction('edit_metadata')
})

// Watch for photo changes
watch(currentPhoto, () => {
  imageLoaded.value = false
  showMetadata.value = false // Hide metadata when changing photos
})

// Methods
const handleImageLoad = () => {
  imageLoaded.value = true
}

const handleImageError = (event) => {
  event.target.src = 'data:image/svg+xml;base64,...' // fallback SVG
}

const getPhotoUrl = (photo) => {
  let url =  apiService.getObject(props.albumName, photo.name);
  return url;
};

const getPhoto = (photo) => {
  return apiService.getObject(props.albumName, photo.name);
};

const getPhotoDisplayName = (filename) => {
  return filename.split('/').pop() || filename
}

const downloadPhoto = (photo) => {
  if (!photo) return
  const url = getPhoto(photo)
  const link = document.createElement('a')
  link.href = url
  link.download = getPhotoDisplayName(photo.name)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const nextPhoto = () => {
  if (props.currentIndex < props.photos.length - 1) {
    emit('next-photo')
  }
}

const previousPhoto = () => {
  if (props.currentIndex > 0) {
    emit('previous-photo')
  }
}

const handleKeyboard = (event) => {
  if (!props.show) return
  if (event.key === 'Escape') {
    if (showMetadata.value) {
      showMetadata.value = false
    } else {
      emit('close')
    }
  }
  if (event.key === 'ArrowLeft') previousPhoto()
  if (event.key === 'ArrowRight') nextPhoto()
  if (event.key === 'i' || event.key === 'I') showMetadata.value = !showMetadata.value
}

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeyboard)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    document.addEventListener('keydown', handleKeyboard)
  } else {
    document.removeEventListener('keydown', handleKeyboard)
    showMetadata.value = false
  }
})
</script>