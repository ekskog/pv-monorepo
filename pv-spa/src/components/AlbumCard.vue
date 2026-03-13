<!-- AlbumCard.vue -->
<template>
    <div
      class="group relative bg-white border border-gray-200 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:border-gray-400 hover:shadow-md"
      @click="$emit('click', album)"
    >
      <!-- Hover Action Buttons - Top Right Corner -->
      <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        <button 
          v-if="canRename" 
          @click.stop="$emit('rename', album)" 
          title="Rename Album"
          class="w-8 h-8 bg-white/95 backdrop-blur-sm text-gray-700 rounded-full shadow-md hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center"
        >
          <i class="fas fa-edit text-sm"></i>
        </button>
        <button 
          v-if="canDelete" 
          @click.stop="$emit('delete', album)" 
          title="Delete Album"
          class="w-8 h-8 bg-white/95 backdrop-blur-sm text-gray-700 rounded-full shadow-md hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
        >
          <i class="fas fa-trash text-sm"></i>
        </button>
      </div>
  
      <!-- Album Content -->
      <div class="p-6 text-center">
        <div class="text-4xl mb-4 text-gray-400 transition-colors group-hover:text-gray-600">
          <i class="fas fa-images"></i>
        </div>
        <h3 class="text-base font-semibold text-gray-900 mb-2">{{ displayName }}</h3>
        <p class="text-sm text-gray-600 mb-1">{{ album.fileCount || 0 }} photos</p>
        <p class="text-xs text-gray-400">{{ formattedDate }}</p>
      </div>
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    album: {
      type: Object,
      required: true
    },
    canRename: {
      type: Boolean,
      default: false
    },
    canDelete: {
      type: Boolean,
      default: false
    }
  })
  
  defineEmits(['click', 'rename', 'delete'])
  
  const displayName = computed(() => {
    return props.album.name.replace(/\.+/g, ' ')
  })
  
  const formattedDate = computed(() => {
    if (!props.album.lastModified) return 'Unknown'
    return new Date(props.album.lastModified).toLocaleDateString()
  })
  </script>