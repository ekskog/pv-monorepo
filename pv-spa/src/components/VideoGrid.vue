<template>
  <div class="w-full">
    <!-- Video Grid -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 transform-gpu"
    >
      <div
        v-for="video in displayedVideos"
        :key="video.name"
        class="bg-white border border-gray-200 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:border-gray-400 hover:shadow-lg hover:-translate-y-1 will-change-transform"
        @click="$emit('videoClick', video)"
      >
        <div class="relative w-full aspect-square overflow-hidden bg-gray-900 flex items-center justify-center">
          <!-- Video Thumbnail/Preview -->
          <video
            :src="getVideoUrl(video)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            @loadedmetadata="handleVideoLoaded"
            @click.stop="handleVideoPlay(video, $event)"
          />
          <!-- Play Button Overlay -->
          <div 
            class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 hover:bg-opacity-20 transition-opacity cursor-pointer"
            @click.stop="handleVideoPlay(video, $event)"
          >
            <i class="fas fa-play-circle text-white text-6xl opacity-80"></i>
          </div>
          <!-- Video Icon Badge -->
          <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
            <i class="fas fa-video"></i>
            <span>Video</span>
          </div>
        </div>
        <div class="p-3">
          <div 
            v-if="hasVideoTimestamp(video)" 
            class="flex items-center gap-2 text-sm text-gray-600 mb-1"
          >
            <i class="fas fa-clock text-xs text-gray-400 w-3"></i>
            {{ formatVideoTimestamp(video) }}
          </div>
          <div class="text-xs text-gray-500 truncate" :title="video.name">
            {{ getVideoDisplayName(video.name) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Load More Button -->
    <div class="flex justify-center mt-8" v-if="hasMoreVideos">
      <button 
        @click="loadMore"
        :disabled="isLoading"
        class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
      >
        <span v-if="!isLoading">Load More Videos</span>
        <span v-else class="flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      </button>
    </div>

    <!-- Video Count Info -->
    <div class="text-center mt-4 text-sm text-gray-600" v-if="videos.length > 0">
      Showing {{ displayedVideos.length }} of {{ videos.length }} videos
    </div>

    <!-- Empty State -->
    <div v-if="videos.length === 0" class="text-center py-12">
      <i class="fas fa-video text-gray-400 text-6xl mb-4"></i>
      <p class="text-gray-600">No videos found in this album</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import apiService from '../services/api.js'

const props = defineProps({
  videos: { type: Array, required: true },
  photoMetadataLookup: { type: Object, required: true },
  albumName: { type: String, required: true },
  bucketName: { type: String, required: true },
  itemsPerPage: { type: Number, default: 24 },
  autoLoad: { type: Boolean, default: false }
})

const emit = defineEmits([
  'videoClick', 
  'videoLoad', 
  'videoError', 
  'videoLoadStart'
])

// State for load more functionality
const currentlyDisplayed = ref(props.itemsPerPage)
const isLoading = ref(false)

// Computed properties
const displayedVideos = computed(() => {
  return props.videos.slice(0, currentlyDisplayed.value)
})

const hasMoreVideos = computed(() => {
  return currentlyDisplayed.value < props.videos.length
})

// Load more functionality
const loadMore = async () => {
  if (isLoading.value || !hasMoreVideos.value) return
  
  isLoading.value = true
  
  // Simulate loading delay
  await new Promise(resolve => setTimeout(resolve, 300))
  
  currentlyDisplayed.value = Math.min(
    currentlyDisplayed.value + props.itemsPerPage,
    props.videos.length
  )
  
  isLoading.value = false
  
  console.log('📹 VideoGrid: Loaded more videos. Now showing:', currentlyDisplayed.value)
}

// Reset displayed count when videos array changes
watch(() => props.videos, () => {
  currentlyDisplayed.value = Math.min(props.itemsPerPage, props.videos.length)
  console.log('📹 VideoGrid: Videos changed, reset to show:', currentlyDisplayed.value)
}, { deep: true })

// Helper methods
const getVideoUrl = (video) => {
  return apiService.getObject(props.albumName, video.name)
}

const getVideoDisplayName = (filename) => {
  return filename.split('/').pop() || filename
}

const hasVideoTimestamp = (video) => {
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return false;
  }

  const filename = video.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[video.name];

  if (!metadata || !metadata.timestamp) {
    return false;
  }

  try {
    const date = new Date(metadata.timestamp);
    // Check if date is valid
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

const formatVideoTimestamp = (video) => {
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return "";
  }

  const filename = video.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[video.name];

  if (!metadata || !metadata.timestamp) {
    return "";
  }

  try {
    const date = new Date(metadata.timestamp);
    return (
      date.toLocaleDateString("en-GB") +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

const handleVideoLoaded = (event) => {
  emit('videoLoad', event)
}

const handleVideoPlay = (video, event) => {
  // Emit the video click event to parent
  emit('videoClick', video)
}

// Expose loadMore method for parent component if needed
defineExpose({
  loadMore,
  resetToInitial: () => {
    currentlyDisplayed.value = props.itemsPerPage
  }
})
</script>

