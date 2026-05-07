// Configuration Service
// Manages runtime configuration using environment variables only

class ConfigService {
  constructor() {
    // Read from window.__ENV__ (injected by Docker at runtime)
    // Fallback to import.meta.env for local Vite development/testing
    const env = window.__ENV__ || {};
    // Allow persisted overrides from localStorage for development
    const persisted = (() => {
      try {
        const raw = localStorage.getItem('pv_config');
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    })();

    const baseConfig = {
      apiUrl: env.API_URL || import.meta.env.VITE_API_URL || 'https://vault-api.ekskog.net',
      appTitle: env.APP_TITLE || import.meta.env.VITE_APP_TITLE || 'EKSKOG PHOTOS',
      appDescription: env.APP_DESCRIPTION || import.meta.env.VITE_APP_DESCRIPTION || 'Secure Photo Gallery',
      enableUserManagement: (env.ENABLE_USER_MANAGEMENT || import.meta.env.VITE_ENABLE_USER_MANAGEMENT) === 'true',
      enableAlbumSharing: (env.ENABLE_ALBUM_SHARING || import.meta.env.VITE_ENABLE_ALBUM_SHARING) === 'true',
      enablePhotoComments: (env.ENABLE_PHOTO_COMMENTS || import.meta.env.VITE_ENABLE_PHOTO_COMMENTS) === 'true',
      maxUploadSize: parseInt(env.MAX_UPLOAD_SIZE || import.meta.env.VITE_MAX_UPLOAD_SIZE || '20485760', 10),
      thumbnailQuality: parseInt(env.THUMBNAIL_QUALITY || import.meta.env.VITE_THUMBNAIL_QUALITY || '80', 10),
      lazyLoading: (env.LAZY_LOADING || import.meta.env.VITE_LAZY_LOADING || 'true') === 'true',
      debugMode: (env.DEBUG_MODE || import.meta.env.VITE_DEBUG_MODE) === 'true',
      logLevel: env.LOG_LEVEL || import.meta.env.VITE_LOG_LEVEL || 'info',
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
    }

    // Only allow persisted keys that are intentionally user-overridable in the UI.
    // This prevents stale localStorage values from clobbering env-managed values
    // such as VITE_TURNSTILE_SITE_KEY.
    const persistedOverrides = {};
    if (persisted && typeof persisted === 'object') {
      if (typeof persisted.apiUrl === 'string' && persisted.apiUrl.trim()) {
        persistedOverrides.apiUrl = persisted.apiUrl;
      }
    }

    this.config = {
      ...baseConfig,
      ...persistedOverrides,
    };

    console.log('🔧 Config: Loaded from runtime configuration:', this.config)
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

  // Persist runtime config to localStorage (dev-only)
  saveConfig(changes = {}) {
    try {
      this.config = { ...this.config, ...changes };
      const persisted = {
        apiUrl: this.config.apiUrl,
      };
      localStorage.setItem('pv_config', JSON.stringify(persisted));
      return true;
    } catch (e) {
      console.warn('Failed to persist config:', e.message);
      return false;
    }
  }

  // Reset persisted config to defaults (does not reload)
  reset() {
    try {
      localStorage.removeItem('pv_config');
      // Rebuild config from environment
      const env = window.__ENV__ || {};
      this.config.apiUrl = env.API_URL || import.meta.env.VITE_API_URL || 'https://vault-api.ekskog.net';
      this.config.appTitle = env.APP_TITLE || import.meta.env.VITE_APP_TITLE || 'EKSKOG PHOTOS';
      this.config.appDescription = env.APP_DESCRIPTION || import.meta.env.VITE_APP_DESCRIPTION || 'Secure Photo Gallery';
      this.config.turnstileSiteKey = env.TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
      return true;
    } catch (e) {
      console.warn('Failed to reset config:', e.message);
      return false;
    }
  }

  // Convenience accessor used in a few places in the SPA
  getToken() {
    return localStorage.getItem('hbvu_auth_token');
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
