<template>
  <div v-if="showResults" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]" @click="closeResults">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4" @click.stop>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-800">
          Search Results for "{{ searchQuery }}"
        </h3>
        <button @click="closeResults" class="text-gray-400 hover:text-gray-600">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div v-if="loading" class="text-center py-8">
        <div class="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-600">Searching...</p>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <div class="text-red-500 mb-4">
          <i class="fas fa-exclamation-triangle text-2xl"></i>
        </div>
        <p class="text-gray-600">{{ error }}</p>
      </div>

      <div v-else-if="matchingAlbums.length === 0" class="text-center py-8">
        <div class="text-gray-400 mb-4">
          <i class="fas fa-search text-2xl"></i>
        </div>
        <p class="text-gray-600">No albums found matching "{{ searchQuery }}"</p>
      </div>

      <div v-else class="space-y-2">
        <p class="text-sm text-gray-600 mb-4">
          Found {{ matchingAlbums.length }} album{{ matchingAlbums.length > 1 ? 's' : '' }}:
        </p>
        <button
          v-for="album in matchingAlbums"
          :key="album.name"
          @click="selectAlbum(album)"
          class="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-800">{{ getAlbumDisplayName(album.name) }}</div>
              <div class="text-sm text-gray-500">{{ album.fileCount || 0 }} photos</div>
            </div>
            <i class="fas fa-chevron-right text-gray-400"></i>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import apiService from '../services/api.js'

// Props
const props = defineProps({
  searchQuery: {
    type: String,
    default: ''
  },
  visible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'selectAlbum'])

// Reactive state
const loading = ref(false)
const error = ref(null)
const albums = ref([])
const albumsLoaded = ref(false)

// Computed
const showResults = computed(() => props.visible && props.searchQuery.trim())

const matchingAlbums = computed(() => {
  if (!props.searchQuery.trim() || !albumsLoaded.value) return []

  const query = props.searchQuery.toLowerCase().trim()
  const matches = albums.value.filter(album =>
    album.name.toLowerCase().includes(query)
  )
  console.log('SearchResults: Found', matches.length, 'matches for query:', query)
  return matches
})

// Methods
const loadAlbums = async () => {
  if (albumsLoaded.value && albums.value.length > 0) {
    // Albums already loaded, just filter them
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    console.log('SearchResults: Loading albums...')
    const response = await apiService.getAlbums()
    console.log('SearchResults: API response:', response)

    if (response.success && response.albums) {
      albums.value = response.albums.map(album => ({
        name: album.name,
        fileCount: album.fileCount || 0,
        lastModified: album.updated_at ? new Date(album.updated_at).toISOString() : null
      }))
      albumsLoaded.value = true
      console.log('SearchResults: Albums loaded successfully:', albums.value.length)
    } else {
      throw new Error(response.error || 'Failed to load albums')
    }
  } catch (err) {
    console.error('SearchResults: Failed to load albums:', err)
    error.value = `Failed to load albums: ${err.message}`
    albumsLoaded.value = false // Reset flag on error
  } finally {
    loading.value = false
  }
}

const getAlbumDisplayName = (folderName) => {
  return folderName.replace(/\.+/g, ' ')
}

const selectAlbum = (album) => {
  console.log('SearchResults: selectAlbum called with:', album.name, 'fileCount:', album.fileCount)
  emit('selectAlbum', album)
  emit('close')
}

const closeResults = () => {
  console.log('SearchResults: closeResults called')
  emit('close')
}

// Watch for search query changes
watch(() => props.searchQuery, (newQuery, oldQuery) => {
  if (newQuery && newQuery.trim() && newQuery !== oldQuery) {
    // Reset error state for new search
    error.value = null
    loading.value = true // Set loading to true for new search
    loadAlbums()
  }
})

// Load albums when component becomes visible
watch(() => props.visible, (visible, oldVisible) => {
  if (visible && !albumsLoaded.value) {
    // Reset states when modal opens
    error.value = null
    loading.value = false
    loadAlbums()
  }
})

// Initial load
onMounted(() => {
  if (props.visible) {
    loadAlbums()
  }
})
</script>