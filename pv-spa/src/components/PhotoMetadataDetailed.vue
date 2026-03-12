<template>
  <div class="space-y-3">
    <div class="flex justify-between items-center border-b border-gray-600 pb-2">
      <h3 class="text-sm font-semibold">Photo Details</h3>
    </div>
    
    <div v-if="metadata" class="text-xs space-y-3">
      <!-- Timestamp -->
      <div v-if="metadata.timestamp" class="flex items-start gap-2">
        <i class="fas fa-clock text-gray-400 w-3 mt-0.5"></i>
        <div>
          <div class="text-gray-300">{{ formattedTimestamp }}</div>
        </div>
      </div>
      
      <!-- Location -->
      <div v-if="metadata.location || metadata.coordinates" class="flex items-start gap-2">
        <i class="fas fa-map-marker-alt text-gray-400 w-3 mt-0.5"></i>
        <div>
          <div v-if="metadata.location" class="text-gray-300">{{ metadata.location }}</div>
          <div v-if="metadata.coordinates" class="text-gray-400 text-xs">{{ metadata.coordinates }}</div>
        </div>
      </div>
      
      <!-- Camera -->
      <div v-if="metadata.camera" class="border-t border-gray-600 pt-2">
        <h4 class="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <i class="fas fa-camera text-gray-400"></i>
          Camera
        </h4>
        <div class="text-gray-400 space-y-1 ml-5">
          <div v-if="metadata.camera.make">{{ metadata.camera.make }} {{ metadata.camera.model }}</div>
          <div v-if="metadata.camera.software">Software: {{ metadata.camera.software }}</div>
          <div v-if="metadata.camera.lens">{{ metadata.camera.lens }}</div>
        </div>
      </div>
      
      <!-- Settings -->
      <div v-if="metadata.settings" class="border-t border-gray-600 pt-2">
        <h4 class="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <i class="fas fa-cog text-gray-400"></i>
          Settings
        </h4>
        <div class="text-gray-400 grid grid-cols-2 gap-1 ml-5">
          <div v-if="metadata.settings.iso">ISO {{ metadata.settings.iso }}</div>
          <div v-if="metadata.settings.aperture">f/{{ metadata.settings.aperture }}</div>
          <div v-if="metadata.settings.shutterSpeed">{{ formatShutterSpeed(metadata.settings.shutterSpeed) }}</div>
          <div v-if="metadata.settings.focalLength">{{ metadata.settings.focalLength?.toFixed(1) }}mm</div>
        </div>
        <div v-if="metadata.settings.flash" class="text-gray-400 mt-1 ml-5 text-xs">
          Flash: {{ metadata.settings.flash }}
        </div>
        <div v-if="metadata.settings.whiteBalance" class="text-gray-400 ml-5 text-xs">
          WB: {{ metadata.settings.whiteBalance }}
        </div>
      </div>
      
      <!-- Dimensions -->
      <div v-if="metadata.dimensions" class="border-t border-gray-600 pt-2">
        <h4 class="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <i class="fas fa-expand text-gray-400"></i>
          Dimensions
        </h4>
        <div class="text-gray-400 ml-5 space-y-1">
          <div>{{ metadata.dimensions.width }} × {{ metadata.dimensions.height }}</div>
          <div v-if="metadata.dimensions.orientation" class="text-xs">{{ metadata.dimensions.orientation }}</div>
        </div>
      </div>
    </div>
    
    <div v-else class="text-gray-400 text-xs text-center py-4">
      No metadata available for this photo
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  photo: { type: Object, required: true },
  photoMetadataLookup: { type: Object, required: true }
})

onMounted(() => {
  console.log('📊 PhotoMetadataDetailed: mounted for photo', props.photo.name)
})

onUnmounted(() => {
  console.log('📊 PhotoMetadataDetailed: unmounted for photo', props.photo.name)
})

// Get metadata for current photo (same logic as PhotoMetadata)
const metadata = computed(() => {
  if (Object.keys(props.photoMetadataLookup).length === 0) return null
  
  const filename = props.photo.name.split("/").pop()
  let meta = props.photoMetadataLookup[filename] || props.photoMetadataLookup[props.photo.name]
  
  // AVIF fallback logic
  if (!meta && props.photo.name.includes(".avif")) {
    const baseName = filename.replace(/\.avif$/i, "")
    const possibleOriginals = Object.keys(props.photoMetadataLookup).filter(key => {
      const originalBase = key.replace(/\.[^.]+$/, "")
      return baseName.includes(originalBase) || originalBase.includes(baseName)
    })
    
    if (possibleOriginals.length > 0) {
      meta = props.photoMetadataLookup[possibleOriginals[0]]
    }
  }
  
  return meta
})

const formattedTimestamp = computed(() => {
  if (!metadata.value?.timestamp) return "No date"
  
  try {
    const date = new Date(metadata.value.timestamp)
    return date.toLocaleDateString("en-GB") + " " + 
           date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "Invalid date"
  }
})

const formatShutterSpeed = (speed) => {
  if (speed >= 1) return `${speed}s`
  return `1/${Math.round(1/speed)}s`
}
</script>