<template>
  <div class="px-8 py-6 max-w-screen-xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-4 border-b border-gray-200">
      <div>
        <h1 class="text-3xl font-semibold text-gray-800">User Management</h1>
        <p class="text-sm text-gray-500 mt-1">Manage system users and permissions</p>
      </div>
      <button class="bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm px-4 py-2 rounded-md flex items-center gap-2" @click="showCreateDialog = true">
        <i class="fas fa-user-plus"></i> Add New User
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-gray-600">Loading users...</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="text-center bg-red-50 text-red-700 p-6 rounded-lg mb-6">
      <p><i class="fas fa-exclamation-triangle"></i> {{ error }}</p>
      <button class="mt-4 bg-gray-100 hover:bg-gray-200 text-sm px-4 py-2 rounded-md" @click="loadUsers">Try Again</button>
    </div>

    <!-- Users Table -->
    <div v-if="!loading && !error">
      <div class="bg-white rounded-lg shadow overflow-x-auto">
        <table class="min-w-full table-auto">
          <thead class="bg-gray-50 text-gray-700 text-left text-sm font-semibold">
            <tr>
              <th class="px-6 py-4">User</th>
              <th class="px-6 py-4">Role</th>
              <th class="px-6 py-4">Created</th>
              <th class="px-6 py-4">Last Login</th>
              <th class="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="hover:bg-indigo-50">
              <td class="px-6 py-4 flex items-center gap-4">
                <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg">
                  <i class="fas fa-user"></i>
                </div>
                <div>
                  <div class="font-semibold text-gray-800">{{ user.name }}</div>
                  <div class="text-sm text-gray-500">{{ user.email }}</div>
                  <div class="text-xs text-gray-400 font-mono">@{{ user.username }}</div>
                </div>
              </td>
              <td class="px-6 py-4">
                <span :class="user.role === 'admin' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'" class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold">
                  <i :class="user.role === 'admin' ? 'fas fa-crown' : 'fas fa-user'"></i>
                  {{ user.role === 'admin' ? 'Admin' : 'User' }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-600">{{ formatDate(user.createdAt) }}</td>
              <td class="px-6 py-4 text-sm text-gray-600">{{ formatDate(user.lastLogin) }}</td>
              <td class="px-6 py-4">
                <div class="flex gap-2">
                  <button class="border border-gray-300 text-blue-600 hover:bg-blue-50 rounded-md w-8 h-8 flex items-center justify-center" @click="editUser(user)" title="Edit User">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="border border-gray-300 text-orange-500 hover:bg-orange-50 rounded-md w-8 h-8 flex items-center justify-center" @click="changePassword(user)" title="Change Password">
                    <i class="fas fa-key"></i>
                  </button>
                  <button v-if="user.id !== currentUser?.id" class="border border-gray-300 text-red-600 hover:bg-red-50 rounded-md w-8 h-8 flex items-center justify-center" @click="confirmDeleteUser(user)" title="Delete User">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div v-if="users.length === 0" class="text-center bg-white rounded-lg shadow p-10 mt-6">
        <div class="text-5xl text-gray-300 mb-4"><i class="fas fa-users"></i></div>
        <h3 class="text-xl font-semibold text-gray-800 mb-2">No Users Found</h3>
        <p class="text-gray-500 mb-6">Start by adding your first user to the system.</p>
        <button class="bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm px-4 py-2 rounded-md" @click="showCreateDialog = true">
          Add User
        </button>
      </div>
    </div>

    <!-- Dialogs -->
    <!-- Create/Edit Dialog -->
    <div v-if="showCreateDialog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click="closeCreateDialog">
      <div class="bg-white rounded-xl p-6 w-full max-w-md mx-4 overflow-y-auto max-h-[90vh]" @click.stop>
        <h3 class="text-xl font-semibold text-gray-800 mb-6">{{ isEditing ? 'Edit User' : 'Create New User' }}</h3>
        <form @submit.prevent="saveUser" class="space-y-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700">Full Name</label>
            <input id="name" v-model="formData.name" type="text" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700">Username</label>
            <input id="username" v-model="formData.username" type="text" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
            <input id="email" v-model="formData.email" type="email" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div v-if="!isEditing">
            <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
            <input id="password" v-model="formData.password" type="password" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="role" class="block text-sm font-medium text-gray-700">Role</label>
            <select id="role" v-model="formData.role" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </form>
        <div class="flex justify-end gap-3 mt-6">
          <button class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md" @click="closeCreateDialog">Cancel</button>
          <button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-semibold" :disabled="!isFormValid || saving" @click="saveUser">
            {{ saving ? 'Saving...' : (isEditing ? 'Update User' : 'Create User') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteDialog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click="closeDeleteDialog">
      <div class="bg-white rounded-xl p-6 w-full max-w-md mx-4 overflow-y-auto max-h-[90vh]" @click.stop>
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Delete User</h3>
        <p class="text-gray-700 mb-2">Are you sure you want to delete user "<strong>{{ userToDelete?.name }}</strong>"?</p>
        <p class="text-sm text-orange-500 flex items-center gap-2 mb-6">
          <i class="fas fa-exclamation-triangle"></i> This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md" @click="closeDeleteDialog">Cancel</button>
          <button class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md font-semibold" :disabled="deleting" @click="deleteUser">
            {{ deleting ? 'Deleting...' : 'Delete User' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Password Change Dialog -->
    <PasswordChange
      v-if="showPasswordDialog"
      :user="passwordUser"
      :show="showPasswordDialog"
      @close="closePasswordDialog"
      @success="handlePasswordSuccess"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import authService from '../services/auth.js'
import PasswordChange from './PasswordChange.vue'

// Reactive state
const loading = ref(false)
const error = ref(null)
const users = ref([])
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const showPasswordDialog = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const userToDelete = ref(null)
const passwordUser = ref(null)
const editingUserId = ref(null)

// Form data
const formData = ref({
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'user'
})

// Current user
const currentUser = computed(() => authService.getCurrentUser())

// Form validation
const isFormValid = computed(() => {
  return formData.value.name.trim() && 
         formData.value.username.trim() && 
         formData.value.email.trim() && 
         formData.value.role &&
         (isEditing.value || formData.value.password.trim())
})

// Methods
const loadUsers = async () => {
  loading.value = true
  error.value = null
}

const editUser = (user) => {
  isEditing.value = true
  editingUserId.value = user.id
  formData.value = {
    name: user.name,
    username: user.username,
    email: user.email,
    password: '', // Don't pre-fill password
    role: user.role
  }
  showCreateDialog.value = true
}

const saveUser = async () => {
  if (!isFormValid.value) return
  
  saving.value = true
  error.value = null
  
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    
    if (isEditing.value) {
      // Update existing user
      const index = users.value.findIndex(u => u.id === editingUserId.value)
      if (index !== -1) {
        users.value[index] = {
          ...users.value[index],
          name: formData.value.name,
          username: formData.value.username,
          email: formData.value.email,
          role: formData.value.role
        }
      }
    } else {
      // Create new user
      const newUser = {
        id: Date.now(), // In real app, this would be generated by backend
        ...formData.value,
        createdAt: new Date().toISOString(),
        lastLogin: null
      }
      delete newUser.password // Don't store password in frontend
      users.value.push(newUser)
    }
    
    closeCreateDialog()
  } catch (err) {
    error.value = `Failed to ${isEditing.value ? 'update' : 'create'} user: ${err.message}`
  } finally {
    saving.value = false
  }
}

const confirmDeleteUser = (user) => {
  userToDelete.value = user
  showDeleteDialog.value = true
}

const deleteUser = async () => {
  if (!userToDelete.value) return
  
  deleting.value = true
  error.value = null
  
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const index = users.value.findIndex(u => u.id === userToDelete.value.id)
    if (index !== -1) {
      users.value.splice(index, 1)
    }
    
    closeDeleteDialog()
  } catch (err) {
    error.value = `Failed to delete user: ${err.message}`
  } finally {
    deleting.value = false
  }
}

const closeCreateDialog = () => {
  showCreateDialog.value = false
  isEditing.value = false
  editingUserId.value = null
  formData.value = {
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'user'
  }
  saving.value = false
}

const closeDeleteDialog = () => {
  showDeleteDialog.value = false
  userToDelete.value = null
  deleting.value = false
}

const changePassword = (user) => {
  passwordUser.value = user
  showPasswordDialog.value = true
}

const closePasswordDialog = () => {
  showPasswordDialog.value = false
  passwordUser.value = null
}

const handlePasswordSuccess = (data) => {
  // Show success message
  console.log(`Password changed successfully for user ${data.userId}`)
  
  // If user changed their own password, they might need to re-authenticate
  if (data.isOwnPassword) {
    // In a real app, you might want to redirect to login or show a message
    console.log('User changed their own password')
  }
}

const formatDate = (dateString) => {
  if (!dateString) return 'Never'
  
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return 'Invalid date'
  }
}

// Lifecycle
onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.user-management {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.user-management-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.user-management-header h1 {
  font-size: 2rem;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.subtitle {
  font-size: 1rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.btn-primary {
  background: #2196f3;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary:hover:not(:disabled) {
  background: #1976d2;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 2rem;
  background: #ffebee;
  border-radius: 8px;
  color: #c62828;
  margin-bottom: 2rem;
}

.users-table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.users-table {
  width: 100%;
  border-collapse: collapse;
}

.users-table th {
  background: #f8f9fa;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 1px solid #dee2e6;
}

.users-table td {
  padding: 1rem;
  border-bottom: 1px solid #f8f9fa;
}

.user-row:hover {
  background: #f8f9ff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-avatar {
  width: 40px;
  height: 40px;
  background: #e3f2fd;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1976d2;
  font-size: 1.2rem;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-name {
  font-weight: 600;
  color: #333;
}

.user-email {
  font-size: 0.9rem;
  color: #666;
}

.user-username {
  font-size: 0.8rem;
  color: #999;
  font-family: monospace;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  font-size: 0.8rem;
  font-weight: 600;
}

.role-badge.admin {
  background: #fff3e0;
  color: #f57c00;
}

.role-badge.user {
  background: #e8f5e8;
  color: #2e7d32;
}

.date-cell {
  font-size: 0.9rem;
  color: #666;
}

.actions-cell {
  width: 120px;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-action {
  background: none;
  border: 1px solid #dee2e6;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-edit {
  color: #1976d2;
}

.btn-edit:hover {
  background: #e3f2fd;
  border-color: #1976d2;
}

.btn-password {
  color: #f57c00;
}

.btn-password:hover {
  background: #fff3e0;
  border-color: #f57c00;
}

.btn-delete {
  color: #d32f2f;
}

.btn-delete:hover {
  background: #ffebee;
  border-color: #d32f2f;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.empty-icon {
  font-size: 4rem;
  color: #ccc;
  margin-bottom: 1rem;
}

.empty-state h3 {
  font-size: 1.5rem;
  color: #333;
  margin: 0 0 1rem 0;
}

.empty-state p {
  color: #666;
  margin: 0 0 2rem 0;
}

.dialog-overlay {
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

.dialog {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  min-width: 400px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog h3 {
  margin: 0 0 1.5rem 0;
  color: #333;
}

.user-form {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.dialog-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
  border: 1px solid #ddd;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.btn-danger {
  background: #f44336;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.btn-danger:hover:not(:disabled) {
  background: #d32f2f;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.warning {
  color: #ff9800;
  font-size: 0.9rem;
  margin: 1rem 0;
}

@media (max-width: 768px) {
  .user-management {
    padding: 1rem;
  }
  
  .user-management-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  
  .users-table-container {
    overflow-x: auto;
  }
  
  .users-table {
    min-width: 600px;
  }
  
  .dialog {
    min-width: auto;
    margin: 1rem;
  }
}
</style>
