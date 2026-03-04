<template>
  <div class="p-3">
    <div class="flex items-center gap-2 text-sm text-gray-600 mb-1">
      <i class="fas fa-clock text-xs text-gray-400 w-3"></i>
      {{ formattedTimestamp }}
    </div>
    <div class="flex items-center gap-2 text-sm text-gray-600">
      <i class="fas fa-map-marker-alt text-xs text-gray-400 w-3"></i>
      {{ formattedGPS }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  photo: { type: Object, required: true },
  photoMetadataLookup: { type: Object, required: true }
})

const locationCache = ref(new Map())

onMounted(() => {
  console.log('📊 PhotoMetadata: mounted for photo', props.photo.name)
  console.log('📊 PhotoMetadata: has lookup =', Object.keys(props.photoMetadataLookup).length > 0)
})

onUnmounted(() => {
  console.log('📊 PhotoMetadata: unmounted for photo', props.photo.name)
})

const formattedTimestamp = computed(() => {
  console.log('📊 PhotoMetadata: computing timestamp for', props.photo.name)
  
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return "Loading...";
  }

  const filename = props.photo.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[props.photo.name];

  // AVIF fallback logic
  if (!metadata && props.photo.name.includes(".avif")) {
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

  try {
    const date = new Date(metadata.timestamp);
    return (
      date.toLocaleDateString("en-GB") +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "Invalid date";
  }
})

const formattedGPS = computed(() => {
  console.log('📊 PhotoMetadata: computing GPS for', props.photo.name)
  
  if (Object.keys(props.photoMetadataLookup).length === 0) {
    return "Loading...";
  }

  const cacheKey = props.photo.name;
  if (locationCache.value.has(cacheKey)) {
    return locationCache.value.get(cacheKey);
  }

  const filename = props.photo.name.split("/").pop();
  let metadata = props.photoMetadataLookup[filename] || props.photoMetadataLookup[props.photo.name];

  // AVIF fallback
  if (!metadata && props.photo.name.includes(".avif")) {
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
})
</script>