<template>
  <div class="w-full">
    <!-- Photo Grid -->
    <div
      class="photo-grid grid grid-cols-3 gap-1 sm:gap-2 transform-gpu"
      :style="{ '--cell-size': cellSize + 'px' }"
    >
      <PhotoCard
        v-for="photo in displayedPhotos"
        :key="photo.name"
        :photo="photo"
        :photo-metadata-lookup="photoMetadataLookup"
        :show-metadata="showMetadata"
        :image-loaded="imageLoadedMap[photo.name]"
        :albumName="albumName"
        :bucketName="bucketName"
        @click="$emit('photoClick', photo)"
        @image-load="$emit('imageLoad', $event)"
        @image-error="$emit('imageError', $event)"
        @image-load-start="$emit('imageLoadStart', $event)"
      />
    </div>

    <!-- Infinite scroll sentinel — always in DOM so observer ref stays stable -->
    <div
      ref="scrollTrigger"
      class="h-12 flex items-center justify-center"
      v-show="hasMorePhotos"
    >
      <svg v-if="isLoading" class="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Photo count -->
    <div class="text-center mt-2 mb-4 text-sm text-gray-400" v-if="photos.length > 0">
      Showing {{ displayedPhotos.length }} of {{ photos.length }} photos
    </div>
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
  showMetadata: { type: Boolean, default: true },
  itemsPerPage: { type: Number, default: 24 },
  cellSize: { type: Number, default: 400 },
})

const emit = defineEmits([
  'photoClick',
  'imageLoad',
  'imageError',
  'imageLoadStart'
])

const currentlyDisplayed = ref(props.itemsPerPage)
const isLoading = ref(false)

const displayedPhotos = computed(() => props.photos.slice(0, currentlyDisplayed.value))
const hasMorePhotos = computed(() => currentlyDisplayed.value < props.photos.length)

const loadMore = () => {
  if (isLoading.value || !hasMorePhotos.value) return
  isLoading.value = true
  currentlyDisplayed.value = Math.min(
    currentlyDisplayed.value + props.itemsPerPage,
    props.photos.length
  )
  isLoading.value = false
}

watch(() => props.photos, () => {
  currentlyDisplayed.value = Math.min(props.itemsPerPage, props.photos.length)
}, { deep: true })

const scrollTrigger = ref(null)
let observer = null

const setupObserver = () => {
  if (!scrollTrigger.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMorePhotos.value && !isLoading.value) {
      loadMore()
    }
  }, { rootMargin: '200px' })
  observer.observe(scrollTrigger.value)
}

const teardownObserver = () => {
  observer?.disconnect()
  observer = null
}

onMounted(setupObserver)
onUnmounted(teardownObserver)


defineExpose({ loadMore })
</script>

<style scoped>
@media (min-width: 640px) {
  .photo-grid {
    grid-template-columns: repeat(auto-fill, minmax(var(--cell-size, 400px), 1fr));
  }
}
</style>
