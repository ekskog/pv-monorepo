<template>
  <div
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
    @click="closeDialog"
  >
    <div
      class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h3 class="text-gray-800 text-lg font-semibold flex items-center gap-2">
          <i class="fas fa-key"></i> Change Password
        </h3>
        <button
          class="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-2 rounded transition"
          @click="closeDialog"
        >
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-4">
        <!-- Info Banner -->
        <div
          v-if="isOwnPassword"
          class="bg-blue-100 border border-blue-300 text-blue-800 p-4 rounded-lg mb-6 flex items-center gap-2 text-sm"
        >
          <i class="fas fa-info-circle"></i>
          You are changing your own password. You will need to log in again after changing it.
        </div>
        <div
          v-else
          class="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 rounded-lg mb-6 flex items-center gap-2 text-sm"
        >
          <i class="fas fa-shield-alt"></i>
          You are changing the password for <strong>{{ user?.name || user?.username }}</strong>
        </div>

        <!-- Form -->
        <form @submit.prevent="changePassword" class="space-y-6">
          <!-- Current Password -->
          <div v-if="isOwnPassword">
            <label for="currentPassword" class="block text-sm font-medium text-gray-700 mb-2">Current Password:</label>
            <div class="relative flex items-center">
              <input
                id="currentPassword"
                v-model="currentPassword"
                :type="showCurrentPassword ? 'text' : 'password'"
                placeholder="Enter your current password"
                required
                :disabled="loading"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-base focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-gray-100"
              />
              <button
                type="button"
                class="absolute right-3 text-gray-500 hover:text-gray-700"
                @click="showCurrentPassword = !showCurrentPassword"
              >
                <i :class="showCurrentPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div>
            <label for="newPassword" class="block text-sm font-medium text-gray-700 mb-2">New Password:</label>
            <div class="relative flex items-center">
              <input
                id="newPassword"
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                placeholder="Enter new password"
                required
                minlength="6"
                :disabled="loading"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-base focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-gray-100"
              />
              <button
                type="button"
                class="absolute right-3 text-gray-500 hover:text-gray-700"
                @click="showNewPassword = !showNewPassword"
              >
                <i :class="showNewPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
              </button>
            </div>

            <!-- Strength Meter -->
            <div class="mt-2 flex items-center gap-3">
              <div class="flex-1 h-1 rounded bg-gray-200 overflow-hidden">
                <div
                  class="h-full rounded transition-all duration-300"
                  :class="passwordStrength.class"
                  :style="{ width: passwordStrength.width }"
                ></div>
              </div>
              <span class="text-xs font-semibold" :class="passwordStrength.class">{{ passwordStrength.text }}</span>
            </div>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-2">Confirm New Password:</label>
            <div class="relative flex items-center">
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="Confirm new password"
                required
                :disabled="loading"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-base focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-gray-100"
              />
              <button
                type="button"
                class="absolute right-3 text-gray-500 hover:text-gray-700"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <i :class="showConfirmPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
              </button>
            </div>

            <div
              v-if="confirmPassword && !passwordsMatch"
              class="mt-2 text-red-600 text-sm flex items-center gap-1"
            >
              <i class="fas fa-exclamation-triangle"></i> Passwords do not match
            </div>
          </div>

          <!-- Error Message -->
          <div
            v-if="error"
            class="bg-red-100 border border-red-300 text-red-700 p-3 rounded flex items-center gap-2 text-sm"
          >
            <i class="fas fa-exclamation-triangle"></i> {{ error }}
          </div>

          <!-- Success Message -->
          <div
            v-if="success"
            class="bg-green-100 border border-green-300 text-green-700 p-3 rounded flex items-center gap-2 text-sm"
          >
            <i class="fas fa-check-circle"></i> {{ success }}
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
              @click="closeDialog"
              :disabled="loading"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-500 border border-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              :disabled="!canSubmit || loading"
            >
              <i v-if="loading" class="fas fa-spinner fa-spin"></i>
              <i v-else class="fas fa-key"></i>
              {{ loading ? 'Changing...' : 'Change Password' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import authService from '../services/auth.js'

// Props
const props = defineProps({
  user: {
    type: Object,
    required: true
  },
  show: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'success'])

// Reactive state
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

// Password visibility toggles
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Computed properties
const isOwnPassword = computed(() => {
  const currentUser = authService.getCurrentUser()
  return currentUser && currentUser.id === props.user.id
})

const passwordsMatch = computed(() => {
  return newPassword.value === confirmPassword.value
})

const passwordStrength = computed(() => {
  const password = newPassword.value
  if (!password) return { class: '', width: '0%', text: '' }

  let score = 0

  // Length check
  if (password.length >= 8) score += 2
  else if (password.length >= 6) score += 1

  // Character variety
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  // Determine strength
  if (score <= 2) return { class: 'weak', width: '25%', text: 'Weak' }
  if (score <= 4) return { class: 'fair', width: '50%', text: 'Fair' }
  if (score <= 6) return { class: 'good', width: '75%', text: 'Good' }
  return { class: 'strong', width: '100%', text: 'Strong' }
})

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!newPassword.value || !confirmPassword.value) return false
  if (!passwordsMatch.value) return false
  if (newPassword.value.length < 6) return false
  if (isOwnPassword.value && !currentPassword.value) return false
  return true
})

// Methods
const changePassword = async () => {
  if (!canSubmit.value) return

  loading.value = true
  error.value = ''
  success.value = ''

  try {

      // Production mode - call backend API
      const response = await authService.changePassword({
        userId: props.user.id,
        currentPassword: isOwnPassword.value ? currentPassword.value : undefined,
        newPassword: newPassword.value
      })
      
      success.value = 'Password changed successfully!'
      
      setTimeout(() => {
        emit('success', {
          userId: props.user.id,
          isOwnPassword: isOwnPassword.value
        })
        closeDialog()
      }, 1500)
    
  } catch (err) {
    error.value = err.message || 'Failed to change password'
  } finally {
    loading.value = false
  }
}

const closeDialog = () => {
  // Reset form
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  error.value = ''
  success.value = ''
  showCurrentPassword.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
  
  emit('close')
}

// Watch for show prop changes to reset form
watch(() => props.show, (newVal) => {
  if (newVal) {
    // Reset form when dialog opens
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    error.value = ''
    success.value = ''
  }
})
</script>
