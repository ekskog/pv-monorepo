// Configuration Service
// Manages runtime configuration using environment variables only

class ConfigService {
  constructor() {
    this.config = {
      apiUrl: import.meta.env.VITE_API_URL,
    }

    console.log('🔧 Config: Loaded from environment variables:', this.config)
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
