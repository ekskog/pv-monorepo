<template>
  <div
    class="bg-white border border-black rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:border-black-500 hover:shadow-lg hover:-translate-y-1 will-change-transform"
    @click="$emit('click', photo)"
  >
    <div class="relative w-full aspect-square overflow-hidden bg-gray-50">
      <img
        :src="getOptimizedPhotoUrl(photo)"
        :alt="photo.name"
        @error="handleImageError"
        @load="handleImageLoad"
        @loadstart="handleImageLoadStart"
        class="w-full h-full object-cover transition-opacity duration-300"
        loading="lazy"
        :data-full-src="getPhoto(photo)"
      />
      <!-- Loading placeholder for images -->
      <div
        class="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400 text-2xl transition-opacity duration-300 pointer-events-none"
        :class="{
          'opacity-0': imageLoaded,
          'opacity-100': !imageLoaded,
        }"
      >
        <i class="fas fa-image"></i>
      </div>
    </div>
    <div v-if="showMetadata" class="hidden sm:block p-3">
      <div class="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <i class="fas fa-clock text-xs text-gray-400 w-3"></i>
        {{ formatPhotoTimestamp(photo) }}
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-600">
        <i class="fas fa-map-marker-alt text-xs text-gray-400 w-3"></i>
        {{ formatPhotoGPS(photo) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import apiService from '../services/api.js'
import { formatMetadataTimestamp } from '../utils/timestamp.js'

const props = defineProps({
  photo: { type: Object, required: true },
  photoMetadataLookup: { type: Object, required: true },
  showMetadata: { type: Boolean, default: true },
  imageLoaded: { type: Boolean, default: false },
  bucketName: { type: String, required: true },
  albumName: { type: String, required: true }
})

const emit = defineEmits(['click', 'imageLoad', 'imageError', 'imageLoadStart'])

const locationCache = ref(new Map())

// Move the formatting methods here from PhotoGrid
const formatPhotoTimestamp = (photo) => {
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return "Loading...";
  }

  const filename = photo.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[photo.name];

  // AVIF fallback logic
  if (!metadata && photo.name.includes(".avif")) {
    const baseName = filename.replace(/\.avif$/i, "");
    const possibleOriginals = Object.keys(props.photoMetadataLookup).filter((key) => {
      const originalBase = key.replace(/\.[^.]+$/, "");
      return baseName.includes(originalBase) || originalBase.includes(baseName);
    });

    if (possibleOriginals.length > 0) {
      metadata = props.photoMetadataLookup[possibleOriginals[0]];
    }
  }

  if (!metadata || !metadata.timestamp) {
    return "No date";
  }

  return formatMetadataTimestamp(metadata.timestamp);
};

const formatPhotoGPS = (photo) => {
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return "Loading...";
  }

  const cacheKey = photo.name;
  if (locationCache.value.has(cacheKey)) {
    return locationCache.value.get(cacheKey);
  }

  const filename = photo.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[photo.name];

  // AVIF fallback
  if (!metadata && photo.name.includes(".avif")) {
    const baseName = filename.replace(/\.avif$/i, "");
    const possibleOriginals = Object.keys(props.photoMetadataLookup).filter((key) => {
      const originalBase = key.replace(/\.[^.]+$/, "");
      return baseName.includes(originalBase) || originalBase.includes(baseName);
    });

    if (possibleOriginals.length > 0) {
      metadata = props.photoMetadataLookup[possibleOriginals[0]];
    }
  }

  if (metadata && metadata.location) {
    locationCache.value.set(cacheKey, metadata.location);
    return metadata.location;
  }

  if (metadata && metadata.coordinates) {
    locationCache.value.set(cacheKey, metadata.coordinates);
    return metadata.coordinates;
  }

  return "No location";
};

const getPhoto = (photo) => {
  // Full-resolution URL for the lightbox
  return photo.presignedUrl || apiService.getObject(props.albumName, photo.name);
};

const getOptimizedPhotoUrl = (photo) => {
  return photo.thumbnailUrl || photo.presignedUrl || apiService.getObject(props.albumName, photo.name);
};


const handleImageLoad = (event) => {
  emit('imageLoad', event)
  // Prefetch full-res so lightbox opens instantly
  const fullSrc = getPhoto(props.photo)
  if (fullSrc && event.target.src !== fullSrc) {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = fullSrc
    document.head.appendChild(link)
  }
}

const handleImageError = (event) => {
  const fullSrc = getPhoto(props.photo)
  if (fullSrc && event.target.src !== fullSrc) {
    // Thumbnail failed — silently fall back to full-res, don't tell parent yet
    event.target.src = fullSrc
    return
  }
  // Full-res also failed — let parent show the error placeholder
  emit('imageError', event)
}

const handleImageLoadStart = (event) => {
  emit('imageLoadStart', event)
}

</script>