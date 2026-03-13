<template>
  <div class="max-w-[1200px] mx-auto px-4 py-8">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-12">

      <!-- Actions Section -->
      <div class="flex items-center gap-3 flex-wrap">
        <!-- Sort Controls (only show when albums exist) -->
        <div v-if="!loading && !error && albums.length > 0" class="flex items-center gap-2 flex-wrap">
          <span class="text-sm text-gray-600 hidden sm:inline">Sort by:</span>

          <!-- Date sorting buttons -->
          <div class="flex bg-white border border-gray-300 rounded-md overflow-hidden">
            <button
              @click="sortOrder = 'date-desc'"
              :class="['px-3 py-2 text-sm transition whitespace-nowrap', sortOrder === 'date-desc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
            >
              <i class="fas fa-calendar-alt mr-1"></i><span class="hidden lg:inline">Date</span> &darr;
            </button>
            <button
              @click="sortOrder = 'date-asc'"
              :class="['px-3 py-2 text-sm transition whitespace-nowrap', sortOrder === 'date-asc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
            >
              <i class="fas fa-calendar-alt mr-1"></i><span class="hidden lg:inline">Date</span> &uarr;
            </button>
          </div>

          <!-- Name sorting buttons -->
          <div class="flex bg-white border border-gray-300 rounded-md overflow-hidden">
            <button
              @click="sortOrder = 'name-asc'"
              :class="['px-3 py-2 text-sm transition whitespace-nowrap', sortOrder === 'name-asc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
            >
              <i class="fas fa-sort-alpha-down mr-1"></i><span class="hidden lg:inline">Name</span> &darr;
            </button>
            <button
              @click="sortOrder = 'name-desc'"
              :class="['px-3 py-2 text-sm transition whitespace-nowrap', sortOrder === 'name-desc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
            >
              <i class="fas fa-sort-alpha-up mr-1"></i><span class="hidden lg:inline">Name</span> &uarr;
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <button @click="refreshAlbums" :disabled="loading" title="Refresh albums"
          class="bg-gray-100 text-gray-800 border border-gray-300 px-4 py-3 rounded-md text-sm font-medium transition hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i> <span class="hidden sm:inline">Refresh</span>
        </button>
        <button v-if="canCreateAlbum" @click="showCreateDialog = true"
          class="bg-blue-500 text-white px-4 py-3 rounded-md text-sm font-semibold shadow-md transition hover:bg-blue-600 hover:-translate-y-[1px] hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap">
          <i class="fas fa-plus"></i> <span class="hidden sm:inline">Create Album</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      <p>Loading albums...</p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="text-center py-8 text-red-500">
      <p><i class="fas fa-exclamation-triangle"></i> {{ error }}</p>
      <button @click="loadAlbums"
        class="mt-4 bg-gray-100 text-gray-800 border border-gray-300 px-4 py-3 rounded-md text-sm transition hover:bg-gray-200">
        Try Again
      </button>
    </div>

    <!-- Albums Grid -->
    <div v-if="!loading && !error">
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <AlbumCard
          v-for="album in paginatedAlbums"
          :key="album.name"
          :album="album"
          :can-rename="canRenameAlbum"
          :can-delete="canDeleteAlbum"
          @click="openAlbum"
          @rename="confirmRename"
          @delete="confirmDelete"
        />
        <!-- Empty State -->
        <div v-if="albums.length === 0" class="col-span-full text-center py-16 px-8">
          <div class="text-5xl mb-4 text-gray-400"><i class="fas fa-camera"></i></div>
          <h3 class="text-xl text-gray-800 mb-4">No Albums Yet</h3>
          <p class="text-gray-600 mb-6">
            <span v-if="canCreateAlbum">Create your first photo album to get started!</span>
            <span v-else>No albums available to view.</span>
          </p>
          <button v-if="canCreateAlbum" @click="showCreateDialog = true"
            class="bg-blue-500 text-white px-6 py-3 rounded-md text-sm font-semibold shadow-md transition hover:bg-blue-600">
            <i class="fas fa-plus mr-2"></i>Create Album
          </button>
        </div>
      </div>

      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" class="flex justify-center items-center gap-2 mt-8">
        <button
          @click="goToPage(currentPage - 1)"
          :disabled="currentPage === 1"
          class="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="text-sm text-gray-600">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <button
          @click="goToPage(currentPage + 1)"
          :disabled="currentPage === totalPages"
          class="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>

    <!-- Create Album Dialog -->
    <CreateAlbumDialog 
      :visible="showCreateDialog" 
      :creating="creating" 
      @create="handleCreateAlbum" 
      @close="closeCreateDialog" 
    />

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteDialog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
      @click="closeDeleteDialog">
      <div class="bg-white rounded-xl p-8 w-full max-w-md shadow-xl mx-4" @click.stop>
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Delete Album</h3>
        <p class="mb-4">Are you sure you want to delete the album "<strong>{{ getAlbumDisplayName(albumToDelete?.name)
        }}</strong>"?</p>
        <p class="text-orange-600 text-sm mb-6 bg-orange-50 p-3 rounded-md">
          <i class="fas fa-exclamation-triangle mr-2"></i>This action cannot be undone and will delete all photos in this album.
        </p>
        <div class="flex justify-end gap-4 flex-wrap sm:flex-nowrap">
          <button @click="closeDeleteDialog"
            class="bg-gray-100 text-gray-800 border border-gray-300 px-4 py-3 rounded-md text-sm transition hover:bg-gray-200 min-w-[80px]">
            Cancel
          </button>
          <button @click="deleteAlbum" :disabled="deleting"
            class="bg-red-500 text-white px-4 py-3 rounded-md text-sm font-semibold transition hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px]">
            {{ deleting ? 'Deleting...' : 'Delete Album' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Rename Album Dialog -->
    <div v-if="showRenameDialog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
      @click="closeRenameDialog">
      <div class="bg-white rounded-xl p-8 w-full max-w-md shadow-xl mx-4" @click.stop>
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Rename Album</h3>
        <p class="mb-4">Enter a new name for the album "<strong>{{ getAlbumDisplayName(albumToRename?.name) }}</strong>".</p>
        <div class="mb-6">
          <label for="renameAlbumName" class="block mb-2 font-medium text-gray-800">New Album Name:</label>
          <input id="renameAlbumName" v-model="newAlbumNameForRename" type="text" placeholder="Enter new album name..."
            @keyup.enter="renameAlbum" ref="renameAlbumNameInput"
            class="w-full px-4 py-3 border border-gray-300 rounded-md text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
        </div>
        <div class="flex justify-end gap-4 flex-wrap sm:flex-nowrap">
          <button @click="closeRenameDialog"
            class="bg-gray-100 text-gray-800 border border-gray-300 px-4 py-3 rounded-md text-sm transition hover:bg-gray-200 min-w-[80px]">
            Cancel
          </button>
          <button @click="renameAlbum" :disabled="!newAlbumNameForRename.trim() || renaming || newAlbumNameForRename.trim() === albumToRename?.name"
            class="bg-blue-500 text-white px-4 py-3 rounded-md text-sm font-semibold shadow-md transition hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px]">
            {{ renaming ? 'Renaming...' : 'Rename Album' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import apiService from '../services/api.js'
import authService from '../services/auth.js'
import CreateAlbumDialog from './CreateAlbumDialog.vue'
import AlbumCard from './AlbumCard.vue'

// Emits
const emit = defineEmits(['navigate', 'openAlbum'])

// Reactive state
const loading = ref(false)
const error = ref(null)
const albums = ref([])
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const showRenameDialog = ref(false)
const newAlbumNameForRename = ref('')
const creating = ref(false)
const deleting = ref(false)
const renaming = ref(false)
const albumToDelete = ref(null)
const albumToRename = ref(null)
const renameAlbumNameInput = ref(null)
const sortOrder = ref('date-desc')
const currentPage = ref(1)
const itemsPerPage = ref(24)
// Computed property for sorted albums
const sortedAlbums = computed(() => {
  return [...albums.value].sort((a, b) => {
    switch (sortOrder.value) {
      case 'date-desc':
        if (!a.lastModified) return 1
        if (!b.lastModified) return -1
        return new Date(b.lastModified) - new Date(a.lastModified)
      case 'date-asc':
        if (!a.lastModified) return 1
        if (!b.lastModified) return -1
        return new Date(a.lastModified) - new Date(b.lastModified)
      case 'name-asc':
        return a.name.localeCompare(b.name)
      case 'name-desc':
        return b.name.localeCompare(a.name)
      default:
        return 0
    }
  })
})

// Computed property for paginated albums
const paginatedAlbums = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return sortedAlbums.value.slice(start, end)
})

// Computed property for total pages
const totalPages = computed(() => {
  return Math.ceil(sortedAlbums.value.length / itemsPerPage.value)
})

// Computed properties for permission checks
const canCreateAlbum = computed(() => {
  return authService.canPerformAction('create_album')
})

const canDeleteAlbum = computed(() => {
  return authService.canPerformAction('delete_album')
})

const canRenameAlbum = computed(() => {
  return authService.canPerformAction('delete_album')
})

// Constants
const BUCKET_NAME = 'photovault'

// Methods
const loadAlbums = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await apiService.getAlbums()

    if (response.success && response.albums) {
      const albumsWithDates = response.albums.map((album) => {
        return {
          name: album.name,
          lastModified: album.updated_at 
            ? new Date(album.updated_at).toISOString() 
            : null,
          fileCount: album.fileCount ?? 0,
        }
      })

      albums.value = albumsWithDates
    } else {
      throw new Error(response.error || 'Failed to load albums - API returned unsuccessful response')
    }
  } catch (err) {
    console.error('[ALBUMS ERROR]', err)
    error.value = `Error loading albums: ${err.message}. Check browser console for details.`
  } finally {
    loading.value = false
  }
}

const handleCreateAlbum = async (albumData) => {
  if (!authService.canPerformAction('create_album')) {
    error.value = 'You do not have permission to create albums'
    return
  }

  creating.value = true
  error.value = null

  try {
    const response = await apiService.createFolder(albumData.name, albumData.description, albumData.month, albumData.year)

    if (response.success) {
      closeCreateDialog()
      await loadAlbums()
    } else {
      throw new Error(response.error || 'Failed to create album')
    }
  } catch (err) {
    console.error('[ALBUMS ERROR]', err)
    error.value = `Failed to create album: ${err.message}`
  } finally {
    creating.value = false
  }
}

const closeCreateDialog = () => {
  showCreateDialog.value = false
  creating.value = false
}

const confirmDelete = (album) => {
  if (!authService.canPerformAction('delete_album')) {
    error.value = 'You do not have permission to delete albums'
    return
  }

  albumToDelete.value = album
  showDeleteDialog.value = true
}

const deleteAlbum = async () => {
  if (!albumToDelete.value) return

  deleting.value = true
  error.value = null

  try {
    const response = await apiService.deleteFolder(BUCKET_NAME, albumToDelete.value.name)

    if (response.success) {
      await loadAlbums()
      closeDeleteDialog()
    } else {
      throw new Error(response.error || 'Failed to delete album')
    }
  } catch (err) {
    console.error('[ALBUMS ERROR]', err)
    error.value = `Failed to delete album: ${err.message}`
  } finally {
    deleting.value = false
  }
}

const confirmRename = (album) => {
  if (!authService.canPerformAction('delete_album')) {
    error.value = 'You do not have permission to rename albums'
    return
  }

  albumToRename.value = album
  newAlbumNameForRename.value = album.name
  showRenameDialog.value = true
}

const renameAlbum = async () => {
  if (!albumToRename.value || !newAlbumNameForRename.value.trim()) return

  renaming.value = true
  error.value = null

  try {
    const response = await apiService.renameFolder(albumToRename.value.name, newAlbumNameForRename.value.trim())

    if (response.success) {
      await loadAlbums()
      closeRenameDialog()
    } else {
      throw new Error(response.error || 'Failed to rename album')
    }
  } catch (err) {
    console.error('[ALBUMS ERROR]', err)
    error.value = `Failed to rename album: ${err.message}`
  } finally {
    renaming.value = false
  }
}

const openAlbum = (album) => {
  emit('openAlbum', album)
}

const closeDeleteDialog = () => {
  showDeleteDialog.value = false
  albumToDelete.value = null
  deleting.value = false
}

const closeRenameDialog = () => {
  showRenameDialog.value = false
  albumToRename.value = null
  newAlbumNameForRename.value = ''
  renaming.value = false
}

const getAlbumDisplayName = (folderName) => {
  return folderName.replace(/\.+/g, ' ')
}

const refreshAlbums = async () => {
  await loadAlbums()
}

const goToPage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const focusRenameInput = async () => {
  await nextTick()
  if (renameAlbumNameInput.value) {
    renameAlbumNameInput.value.focus()
    renameAlbumNameInput.value.select()
  }
}

watch(showRenameDialog, (newVal) => {
  if (newVal) {
    focusRenameInput()
  }
})

watch(sortOrder, () => {
  currentPage.value = 1
})

// Lifecycle
onMounted(() => {
  loadAlbums()
})
</script>

<style scoped>
button {
  min-height: 44px;
}

.transition {
  transition: all 0.2s ease-in-out;
}
</style>