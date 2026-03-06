<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cursor-pointer" @click="$emit('close')">
    <div class="relative w-full h-full flex items-center justify-center cursor-default" @click.stop>
      
      <!-- Navigation Controls -->
      <button 
        class="absolute top-1/2 left-8 transform -translate-y-1/2 bg-white bg-opacity-10 text-white w-15 h-15 rounded-full text-2xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed md:left-4 md:w-12 md:h-12 md:text-xl" 
        @click.stop="previousVideo" 
        :disabled="currentIndex === 0"
        title="Previous Video (←)"
      >
        <i class="fas fa-chevron-left"></i>
      </button>

      <button 
        class="absolute top-1/2 right-8 transform -translate-y-1/2 bg-white bg-opacity-10 text-white w-15 h-15 rounded-full text-2xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed md:right-4 md:w-12 md:h-12 md:text-xl" 
        @click.stop="nextVideo"
        :disabled="currentIndex === videos.length - 1" 
        title="Next Video (→)"
      >
        <i class="fas fa-chevron-right"></i>
      </button>

      <!-- Close Button -->
      <button class="absolute top-8 right-8 bg-white bg-opacity-10 text-white w-12 h-12 rounded-full text-xl flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10 hover:bg-opacity-20 hover:scale-110 md:top-4 md:right-4 md:w-10 md:h-10 md:text-base" @click.stop="$emit('close')" title="Close (Esc)">
        <i class="fas fa-times"></i>
      </button>

      <!-- Video Display -->
      <div class="flex flex-col max-w-[95vw] max-h-[95vh] w-full h-full items-center justify-center">
        <div class="flex-1 flex items-center justify-center relative w-full min-h-0" style="height: calc(100% - 80px);">
          
          <video 
            v-if="currentVideo" 
            ref="videoPlayer"
            :src="getVideoUrl(currentVideo)" 
            class="max-w-full w-auto h-auto object-contain shadow-2xl rounded block mx-auto"
            style="max-height: calc(100vh - 120px);"
            controls
            preload="metadata"
            playsinline
            webkit-playsinline
            @error="handleVideoError" 
            @loadedmetadata="handleVideoLoad"
            @canplay="handleVideoCanPlay"
            @play="handleVideoPlay"
            @pause="handleVideoPause"
            @click="handleVideoClick"
          >
            Your browser does not support the video tag.
          </video>

          <!-- Loading Spinner -->
          <div v-if="!videoLoaded" class="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
            <i class="fas fa-spinner fa-spin text-5xl mb-4"></i>
            <p>Loading video...</p>
          </div>
        </div>

        <!-- Video Info & Actions -->
        <div class="bg-black bg-opacity-80 backdrop-blur-sm text-white p-4 px-6 flex justify-between items-center rounded-lg mt-auto flex-shrink-0 w-full max-w-3xl md:flex-col md:gap-4 md:text-center md:p-4">
          <div>
            <p class="m-0 text-sm opacity-80">
              {{ currentIndex + 1 }} of {{ videos.length }}
            </p>
            <p class="m-0 text-xs opacity-60 mt-1">
              {{ currentVideo?.name?.split('/').pop() || 'Unknown' }}
            </p>
          </div>

          <div class="flex gap-3">
            <button 
              @click="showMetadata = !showMetadata"
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-opacity-20 hover:scale-110" 
              title="Video Info"
            >
              <i class="fas fa-info"></i>
            </button>
            <button 
              @click="downloadVideo(currentVideo)" 
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-opacity-20 hover:scale-110" 
              title="Download Video"
            >
              <i class="fas fa-download"></i>
            </button>
            <button 
              v-if="canShowDeleteButton" 
              @click="$emit('delete-video', currentVideo)"
              class="bg-white bg-opacity-10 text-white w-10 h-10 rounded-full text-base flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-red-600 hover:bg-opacity-80 hover:scale-110" 
              title="Delete Video"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- Metadata Overlay -->
        <div 
          v-if="showMetadata && currentVideo" 
          class="absolute bottom-20 right-8 bg-black bg-opacity-90 backdrop-blur-sm text-white p-4 rounded-lg max-w-sm z-20 transition-all duration-300 max-h-96 overflow-y-auto"
          @click.stop
        >
          <div class="flex justify-between items-center mb-3">
            <span class="font-semibold">Video Information</span>
            <button @click="showMetadata = false" class="text-gray-400 hover:text-white text-sm">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="text-sm space-y-2">
            <p><strong>Name:</strong> {{ currentVideo.name?.split('/').pop() || 'Unknown' }}</p>
            <p v-if="videoMetadata?.timestamp"><strong>Date:</strong> {{ formatTimestamp(videoMetadata.timestamp) }}</p>
            <p v-if="videoMetadata?.location"><strong>Location:</strong> {{ videoMetadata.location }}</p>
            <p v-if="currentVideo.size"><strong>Size:</strong> {{ formatFileSize(currentVideo.size) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import apiService from '../services/api.js'
import authService from '../services/auth.js'

// Props
const props = defineProps({
  show: Boolean,
  videos: Array,
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
const emit = defineEmits(['close', 'next-video', 'previous-video', 'delete-video'])

// Local state
const videoLoaded = ref(false)
const showMetadata = ref(false)
const videoPlayer = ref(null)
const isPlaying = ref(false)

// Computed
const currentVideo = computed(() => props.videos[props.currentIndex] || null)

const videoMetadata = computed(() => {
  if (!currentVideo.value) return null
  const filename = currentVideo.value.name?.split('/').pop()
  return props.photoMetadataLookup[filename] || props.photoMetadataLookup[currentVideo.value.name] || null
})

const canShowDeleteButton = computed(() => {
  return props.canDelete && authService.isAuthenticated()
})

// Watch for video changes
watch(currentVideo, (newVideo, oldVideo) => {
  console.log('[VideoLightbox] Video changed:', {
    from: oldVideo?.name,
    to: newVideo?.name,
    index: props.currentIndex
  })
  videoLoaded.value = false
  showMetadata.value = false
  isPlaying.value = false
  // Pause current video when switching
  if (videoPlayer.value) {
    videoPlayer.value.pause()
    videoPlayer.value.currentTime = 0
  }
})

// Watch for show prop changes
watch(() => props.show, (isShowing) => {
  console.log('[VideoLightbox] Show prop changed:', isShowing)
  if (isShowing) {
    console.log('[VideoLightbox] Opening with video:', currentVideo.value?.name)
    console.log('[VideoLightbox] Video URL:', getVideoUrl(currentVideo.value))
    console.log('[VideoLightbox] Videos array length:', props.videos?.length)
    console.log('[VideoLightbox] Current index:', props.currentIndex)
  }
})

// Methods
const handleVideoLoad = () => {
  console.log('[VideoLightbox] Video loaded:', currentVideo.value?.name)
  console.log('[VideoLightbox] Video URL:', getVideoUrl(currentVideo.value))
  console.log('[VideoLightbox] Video element:', videoPlayer.value)
  console.log('[VideoLightbox] Video readyState:', videoPlayer.value?.readyState)
  videoLoaded.value = true
}

const handleVideoError = (event) => {
  console.error('[VideoLightbox] Video load error:', event)
  console.error('[VideoLightbox] Error details:', {
    code: event.target?.error?.code,
    message: event.target?.error?.message,
    networkState: event.target?.networkState,
    readyState: event.target?.readyState,
    src: event.target?.src
  })
  videoLoaded.value = true // Hide loading spinner even on error
}

const handleVideoPlay = () => {
  console.log('[VideoLightbox] Video play event triggered')
  console.log('[VideoLightbox] Video element:', videoPlayer.value)
  console.log('[VideoLightbox] Video paused:', videoPlayer.value?.paused)
  isPlaying.value = true
}

const handleVideoPause = () => {
  console.log('[VideoLightbox] Video pause event triggered')
  isPlaying.value = false
}

const handleVideoCanPlay = () => {
  console.log('[VideoLightbox] Video can play - ready to play')
  console.log('[VideoLightbox] Video duration:', videoPlayer.value?.duration)
  console.log('[VideoLightbox] Video networkState:', videoPlayer.value?.networkState)
}

const handleVideoClick = (event) => {
  console.log('[VideoLightbox] Video element clicked:', event)
  console.log('[VideoLightbox] Video paused before click:', videoPlayer.value?.paused)
  // On iOS, sometimes we need to explicitly call play()
  if (videoPlayer.value && videoPlayer.value.paused) {
    console.log('[VideoLightbox] Attempting to play video programmatically')
    videoPlayer.value.play().then(() => {
      console.log('[VideoLightbox] Video play() promise resolved')
    }).catch((error) => {
      console.error('[VideoLightbox] Video play() promise rejected:', error)
    })
  }
}

const getVideoUrl = (video) => {
  if (!video) {
    console.warn('[VideoLightbox] getVideoUrl called with no video')
    return ''
  }
  const url = apiService.getObject(props.albumName, video.name)
  console.log('[VideoLightbox] Generated video URL:', url, 'for video:', video.name)
  return url
}

const getVideoDisplayName = (filename) => {
  return filename?.split('/').pop() || filename || 'Unknown'
}

const downloadVideo = (video) => {
  if (!video) return
  const url = getVideoUrl(video)
  const link = document.createElement('a')
  link.href = url
  link.download = getVideoDisplayName(video.name)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown'
  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString("en-GB") + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return 'Invalid date'
  }
}

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

const nextVideo = () => {
  if (props.currentIndex < props.videos.length - 1) {
    emit('next-video')
  }
}

const previousVideo = () => {
  if (props.currentIndex > 0) {
    emit('previous-video')
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
  if (event.key === 'ArrowLeft') previousVideo()
  if (event.key === 'ArrowRight') nextVideo()
  if (event.key === 'i' || event.key === 'I') showMetadata.value = !showMetadata.value
  // Space bar to play/pause
  if (event.key === ' ' && videoPlayer.value) {
    event.preventDefault()
    if (isPlaying.value) {
      videoPlayer.value.pause()
    } else {
      videoPlayer.value.play()
    }
  }
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
    // Pause video when closing
    if (videoPlayer.value) {
      videoPlayer.value.pause()
    }
  }
})
</script>

