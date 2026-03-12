<template>
  <div class="w-full">
    <!-- Photo Grid -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 transform-gpu"
    >
      <PhotoCard
        v-for="photo in displayedPhotos"
        :key="photo.name"
        :photo="photo"
        :photo-metadata-lookup="photoMetadataLookup"
        :image-loaded="imageLoadedMap[photo.name]"
        :albumName="albumName"
        :bucketName="bucketName"
        @click="$emit('photoClick', photo)"
        @image-load="$emit('imageLoad', $event)"
        @image-error="$emit('imageError', $event)"
        @image-load-start="$emit('imageLoadStart', $event)"
      />
    </div>

    <!-- Load More Button -->
    <div class="flex justify-center mt-8" v-if="hasMorePhotos">
      <button 
        @click="loadMore"
        :disabled="isLoading"
        class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
      >
        <span v-if="!isLoading">Load More Photos</span>
        <span v-else class="flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      </button>
    </div>

    <!-- Photo Count Info -->
    <div class="text-center mt-4 text-sm text-gray-600" v-if="photos.length > 0">
      Showing {{ displayedPhotos.length }} of {{ photos.length }} photos
    </div>

    <!-- Infinite Scroll Trigger (Optional - uncomment to enable auto-loading) -->
    <!-- 
    <div 
      ref="scrollTrigger" 
      class="h-10 flex items-center justify-center"
      v-if="hasMorePhotos && autoLoad"
    >
      <span class="text-sm text-gray-500">Loading more photos...</span>
    </div>
    -->
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import PhotoCard from './PhotoCard.vue'

const props = defineProps({
  photos: { type: Array, required: true },
  photoMetadataLookup: { type: Object, required: true },
  imageLoadedMap: { type: Object, required: true },
  albumName: { type: String, required: true },
  bucketName: { type: String, required: true },
  itemsPerPage: { type: Number, default: 24 },
  autoLoad: { type: Boolean, default: false } // Set to true for infinite scroll
})

const emit = defineEmits([
  'photoClick', 
  'imageLoad', 
  'imageError', 
  'imageLoadStart'
])

// State for load more functionality
const currentlyDisplayed = ref(props.itemsPerPage)
const isLoading = ref(false)

// Computed properties
const displayedPhotos = computed(() => {
  return props.photos.slice(0, currentlyDisplayed.value)
})

const hasMorePhotos = computed(() => {
  return currentlyDisplayed.value < props.photos.length
})

// Load more functionality
const loadMore = async () => {
  if (isLoading.value || !hasMorePhotos.value) return
  
  isLoading.value = true
  
  // Simulate loading delay (remove this in production if not needed)
  await new Promise(resolve => setTimeout(resolve, 300))
  
  currentlyDisplayed.value = Math.min(
    currentlyDisplayed.value + props.itemsPerPage,
    props.photos.length
  )
  
  isLoading.value = false
  
  console.log('📋 PhotoGrid: Loaded more photos. Now showing:', currentlyDisplayed.value)
}

// Reset displayed count when photos array changes
watch(() => props.photos, () => {
  currentlyDisplayed.value = Math.min(props.itemsPerPage, props.photos.length)
  console.log('📋 PhotoGrid: Photos changed, reset to show:', currentlyDisplayed.value)
}, { deep: true })

// Optional: Infinite scroll functionality
const scrollTrigger = ref(null)
let observer = null

const setupInfiniteScroll = () => {
  if (!props.autoLoad || !scrollTrigger.value) return
  
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMorePhotos.value && !isLoading.value) {
      loadMore()
    }
  }, {
    threshold: 0.1,
    rootMargin: '100px'
  })
  
  observer.observe(scrollTrigger.value)
}

const cleanupInfiniteScroll = () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
}

onMounted(() => {
  if (props.autoLoad) {
    setupInfiniteScroll()
  }
})

onUnmounted(() => {
  cleanupInfiniteScroll()
})

// Expose loadMore method for parent component if needed
defineExpose({
  loadMore,
  resetToInitial: () => {
    currentlyDisplayed.value = props.itemsPerPage
  }
})
</script>
