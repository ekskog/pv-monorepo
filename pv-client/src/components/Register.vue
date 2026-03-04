<template>
  <div class="login-container" ref="registerContainer">
    <div class="login-card">
      <div class="login-header">
        <div class="login-icon">
          <i class="fas fa-user-plus"></i>
        </div>
        <h1>HBVU PHOTOS</h1>
        <p class="login-subtitle">Create your account to get started</p>
      </div>

      <form @submit.prevent="handleRegister" class="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            required
            placeholder="Choose a username"
            :disabled="loading"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
            placeholder="Enter your email"
            :disabled="loading"
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            required
            placeholder="Create a password"
            :disabled="loading"
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          <i v-if="loading" class="fas fa-spinner fa-spin"></i>
          <span>{{ loading ? 'Registering...' : 'Register' }}</span>
        </button>

        <div v-if="error" class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          {{ error }}
        </div>

        <button type="button" class="cancel-btn" @click="$emit('close')" :disabled="loading">
          <i class="fas fa-times-circle"></i>
          Cancel
        </button>
      </form>

      <div class="security-notice">
        <small>🔒 Your information is securely transmitted</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import apiService from '../services/api.js'

const emit = defineEmits(['register-success', 'close'])

const form = ref({
  username: '',
  email: '',
  password: ''
})
const loading = ref(false)
const error = ref('')

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  try {
    const result = await apiService.registerUser(form.value)
    if (result.success) {
      emit('register-success', result.data.user)
      form.value = { username: '', email: '', password: '' }
    } else {
      error.value = result.message || 'Registration failed'
    }
  } catch (err) {
    error.value = 'Network error'
  } finally {
    loading.value = false
  }
}

const handleKeyDown = (e) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))
</script>

<style scoped>
.login-container {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  overflow-y: auto;
  padding: 2rem;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.4s ease;
}

@keyframes fadeInUp {
  0% {
    transform: translateY(20px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-icon {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #2196f3, #1976d2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: white;
  margin: 0 auto 1.5rem;
}

.login-header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 0.5rem;
}

.login-subtitle {
  color: #686;
  font-size: 1rem;
  margin: 0;
}

.login-form {
  margin-bottom: 2rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}

.form-group input {
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.form-group input:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
}

.form-group input:disabled {
  background: #f8f9fa;
  opacity: 0.7;
}

.login-btn {
  width: 100%;
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 50px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.3);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  width: 100%;
  margin-top: 0.75rem;
  background: transparent;
  color: #555;
  border: 2px solid #ddd;
  padding: 0.875rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.cancel-btn:hover:not(:disabled) {
  background: #f2f2f2;
  border-color: #bbb;
}

.cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.security-notice {
  text-align: center;
  margin-top: 15px;
  color: #6c757d;
}

.security-notice small {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

@media (max-width: 768px) {
  .login-container {
    padding: 1rem;
  }

  .login-card {
    padding: 2rem;
  }

  .login-icon {
    width: 60px;
    height: 60px;
    font-size: 1.5rem;
  }

  .login-header h1 {
    font-size: 1.5rem;
  }

  .form-group input {
    font-size: 0.95rem;
    padding: 0.75rem 0.875rem;
  }

  .login-btn,
  .cancel-btn {
    font-size: 0.95rem;
    padding: 0.875rem;
  }

  .error-message {
    font-size: 0.85rem;
    padding: 0.875rem;
  }

  .security-notice {
    font-size: 0.85rem;
  }
}
</style>
