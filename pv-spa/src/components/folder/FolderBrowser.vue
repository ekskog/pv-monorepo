<template>
  <section class="contents-section">
    <div class="contents-header">
      <h2>{{ bucketName }}</h2>
      <button @click="showCreateFolderForm = true" class="btn-primary">
        + New Folder
      </button>
    </div>

    <!-- Breadcrumb navigation -->
    <nav class="breadcrumb" v-if="currentPath">
      <span @click="navigateToPath('')" class="breadcrumb-item">{{ bucketName }}</span>
      <span v-for="(segment, index) in pathSegments" :key="index">
        <span class="separator">/</span>
        <span 
          @click="navigateToPath(getPathUpTo(index))"
          class="breadcrumb-item"
        >
          {{ segment }}
        </span>
      </span>
    </nav>

    <!-- Folder contents -->
    <div class="contents-grid">
      <!-- Back button -->
      <div 
        v-if="currentPath" 
        class="folder-item back-button"
        @click="navigateUp"
      >
        <div class="folder-icon"><i class="fas fa-arrow-up"></i></div>
        <div class="folder-name">..</div>
      </div>

      <!-- Folders -->
      <div 
        v-for="folder in folders" 
        :key="folder.name"
        class="folder-item"
        @click="navigateToPath(folder.name)"
      >
        <div class="folder-icon"><i class="fas fa-images"></i></div>
        <div class="folder-name">{{ folder.displayName }}</div>
        <button 
          @click.stop="deleteFolder(folder.name)"
          class="delete-btn"
          title="Delete folder"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- Create Folder Modal -->
    <div v-if="showCreateFolderForm" class="modal-overlay" @click="showCreateFolderForm = false">
      <div class="modal" @click.stop>
        <h3>Create New Folder</h3>
        <input 
          v-model="newFolderName" 
          type="text" 
          placeholder="Folder name"
          @keyup.enter="createFolder"
        >
        <div class="modal-actions">
          <button @click="showCreateFolderForm = false" class="btn-secondary">Cancel</button>
          <button @click="createFolder" class="btn-primary">Create</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import apiService from '../../services/api.js'

// Props
const props = defineProps({
  bucketName: {
    type: String,
    required: true
  }
})

// Emits
const $emit = defineEmits(['error'])

// Reactive state
const currentPath = ref('')
const folders = ref([])
const showCreateFolderForm = ref(false)
const newFolderName = ref('')

// Computed properties
const pathSegments = computed(() => {
  return currentPath.value ? currentPath.value.split('/').filter(Boolean) : []
})

// Methods
const loadBucketContents = async () => {
  if (!props.bucketName) return
  
  try {
    const response = await apiService.getBucketContents(props.bucketName, currentPath.value)
    folders.value = response.data?.folders || []
  } catch (err) {
    $emit('error', 'Failed to load folder contents: ' + err.message)
  }
}

const navigateToPath = async (path) => {
  currentPath.value = path
  await loadBucketContents()
}

const navigateUp = () => {
  const segments = pathSegments.value
  if (segments.length > 0) {
    segments.pop()
    navigateToPath(segments.join('/'))
  }
}

const getPathUpTo = (index) => {
  return pathSegments.value.slice(0, index + 1).join('/')
}

const createFolder = async () => {
  if (!newFolderName.value.trim()) return
  
  try {
    const folderPath = currentPath.value 
      ? `${currentPath.value}/${newFolderName.value}`
      : newFolderName.value
    
    await apiService.createFolder(props.bucketName, folderPath)
    newFolderName.value = ''
    showCreateFolderForm.value = false
    await loadBucketContents()
  } catch (err) {
    $emit('error', 'Failed to create folder: ' + err.message)
  }
}

const deleteFolder = async (folderPath) => {
  if (!confirm('Are you sure you want to delete this folder?')) return
  
  try {
    await apiService.deleteFolder(props.bucketName, folderPath)
    await loadBucketContents()
  } catch (err) {
    $emit('error', 'Failed to delete folder: ' + err.message)
  }
}

// Watch for bucket changes
watch(() => props.bucketName, async (newBucket) => {
  if (newBucket) {
    currentPath.value = ''
    await loadBucketContents()
  }
}, { immediate: true })
</script>

<style scoped>
.contents-section {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #e0e0e0;
}

.contents-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.contents-header h2 {
  margin: 0;
  color: #333;
}

.btn-primary {
  background: #2196f3;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s ease;
}

.btn-primary:hover {
  background: #1976d2;
}

.btn-secondary {
  background: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s ease;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.breadcrumb {
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.breadcrumb-item {
  color: #2196f3;
  cursor: pointer;
  text-decoration: underline;
}

.separator {
  margin: 0 0.5rem;
  color: #666;
}

.contents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.folder-item {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  text-align: center;
}

.folder-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.1);
}

.folder-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.folder-name {
  font-weight: 500;
  word-break: break-word;
}

.delete-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.folder-item:hover .delete-btn {
  opacity: 1;
}

.back-button {
  background: #f8f9fa;
  border-color: #dee2e6;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  min-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.modal h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.modal input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .folder-browser {
    padding: 1rem;
  }
  
  .header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .actions {
    justify-content: center;
  }
  
  .breadcrumb {
    text-align: center;
    font-size: 0.8rem;
  }
  
  .contents-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
  }
  
  .folder-item {
    padding: 0.75rem;
  }
  
  .folder-icon {
    font-size: 1.75rem;
  }
  
  .folder-name {
    font-size: 0.875rem;
  }
  
  .modal {
    margin: 1rem;
    min-width: auto;
    max-width: 90vw;
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .folder-browser {
    padding: 0.75rem;
  }
  
  .header h2 {
    font-size: 1.25rem;
  }
  
  .breadcrumb {
    font-size: 0.75rem;
  }
  
  .separator {
    margin: 0 0.25rem;
  }
  
  .contents-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
  }
  
  .folder-item {
    padding: 0.5rem;
    min-height: 80px;
  }
  
  .folder-icon {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
  }
  
  .folder-name {
    font-size: 0.8rem;
  }
  
  .delete-btn {
    font-size: 0.875rem;
    top: 0.25rem;
    right: 0.25rem;
  }
  
  .modal {
    padding: 1.5rem;
  }
  
  .btn-primary,
  .btn-secondary {
    padding: 0.625rem 0.875rem;
    font-size: 0.85rem;
  }
}
</style>
