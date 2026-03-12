// Configuration Service
// Manages runtime configuration using environment variables only

class ConfigService {
  constructor() {
    this.config = {
      apiUrl: import.meta.env.VITE_API_URL,
      // Load auth token from localStorage if present (frontend-only)
      hbvu_auth_token: typeof localStorage !== 'undefined' ? localStorage.getItem('hbvu_auth_token') : null,
    }

    console.log('🔧 Config: Loaded from environment variables:', this.config)
  }

  // Get the stored auth token (reads from in-memory config)
  getAuthToken() {
    // Keep config in sync with localStorage
    if (typeof localStorage !== 'undefined') {
      this.config.hbvu_auth_token = localStorage.getItem('hbvu_auth_token')
    }
    return this.config.hbvu_auth_token
  }

  // Set auth token both in localStorage and in-memory config
  setAuthToken(token) {
    if (typeof localStorage !== 'undefined') {
      if (token === null || token === undefined) {
        localStorage.removeItem('hbvu_auth_token')
      } else {
        localStorage.setItem('hbvu_auth_token', token)
      }
    }
    this.config.hbvu_auth_token = token
  }

  // Clear auth token
  clearAuthToken() {
    this.setAuthToken(null)
  }

  // Get entire config
  getConfig() {
    return { ...this.config }
  }

  // Get specific config value
  get(key) {
    return this.config[key]
  }

  // Get API URL
  getApiUrl() {
    return this.config.apiUrl
  }

  // Test API connection
  async testApiConnection(url = null) {
    const testUrl = url || this.getApiUrl()

    try {
      const response = await fetch(`${testUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      })

      return {
        success: response.ok,
        status: response.status,
        url: testUrl
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: testUrl
      }
    }
  }
}

// Export singleton instance
const configService = new ConfigService()
export default configService
