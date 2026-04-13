// HBVU PHOTOS API Service
// Handles all communication with the HBVU PHOTOS Express API

import configService from "./config.js";

class ApiService {
  constructor() {
    this.authService = null; // Will be set by auth service
  }

  // Get current API base URL
  getApiBaseUrl() {
    return configService.getApiUrl();
  }

  // Get SSE URL for processing status
  getProcessingStatusUrl(jobId) {
    const API_BASE_URL = this.getApiBaseUrl();
    return `${API_BASE_URL}/processing-status/${jobId}`;
  }

  // Set auth service reference (to avoid circular imports)
  setAuthService(authService) {
    this.authService = authService;
  }

  // Build bulk upload URL for a target folder/album
  getBulkUploadUrl(folder) {
    const API_BASE_URL = this.getApiBaseUrl();
    return `${API_BASE_URL}/bulk/upload/${encodeURIComponent(folder)}`;
  }

  // Build bulk workflow status URL
  getBulkWorkflowStatusUrl(workflowId) {
    const API_BASE_URL = this.getApiBaseUrl();
    return `${API_BASE_URL}/bulk/status/${encodeURIComponent(workflowId)}`;
  }

  // API convention: workflow id is derived from batch id
  buildBulkWorkflowId(batchId) {
    return `batch-${batchId}`;
  }

  // Get authentication token
  getAuthToken() {
    return localStorage.getItem("hbvu_auth_token");
  }

async request(endpoint, options = {}) {
  // Debug: inspect configService + API URL
  console.log("🔧 apiService.request called");
  console.log("  endpoint:", endpoint);


  const API_BASE_URL = this.getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;


  // Build headers
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add auth token if available
  const token = this.getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    headers,
    ...options,
  };

  console.log("  Fetch config:", config);

  try {
    const response = await fetch(url, config);
    console.log("  Response:", response.status);

    // Handle 401 Unauthorized - token might be expired
    if (response.status === 401) {
      console.warn("⚠️ Authentication failed (401) – clearing tokens");

      // Clear invalid token
      localStorage.removeItem("hbvu_auth_token");
      localStorage.removeItem("hbvu_user_data");

      // Clear auth service state if available
      if (this.authService) {
        console.log("  Clearing authService state");
        this.authService.clearAuth();
      }

      throw new Error("Invalid or expired token");
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `HTTP error! status: ${response.status}` }));
      throw new Error(
        errorData.message ||
          errorData.error ||
          `HTTP error! status: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("🔥 apiService.request error:", error);
    console.error("🔥 Call stack:", new Error().stack);
    throw error;
  }
}


  // Health check
  async getHealth() {

    return this.request("/health");
  }

  async getAlbumContents(name, options = {}) {
    const endpoint = `/objects/${encodeURIComponent(name)}`;
    return this.request(endpoint, options);
  }

  // Folder/Object operations
  async getAlbums(options = {}) {
    return this.request('/albums', options);
  }

  async createFolder(folderPath, description = null, month = null, year = null) {
    const body = { description, month, year };
    return this.request(`/album/${encodeURIComponent(folderPath)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async renameFolder(currentName, newName) {
    return this.request(`/album/${encodeURIComponent(currentName)}`, {
      method: "PUT",
      body: JSON.stringify({ newName }),
    });
  }

  async deleteFolder(bucketName, folderPath) {
    return this.request(`/buckets/${bucketName}/folders`, {
      method: "DELETE",
      body: JSON.stringify({ folderPath: encodeURIComponent(folderPath) }),
    });
  }

  // Delete object
  async deleteObject(folderPath, objectName) {
    return this.request(`/objects/${encodeURIComponent(folderPath)}/${encodeURIComponent(objectName)}`, {
      method: "DELETE",
    });
  }

  // Update photo metadata
  async updatePhotoMetadata(folderPath, objectName, metadata) {
    return this.request(`/objects/${encodeURIComponent(folderPath)}/${encodeURIComponent(objectName)}`, {
      method: "PUT",
      body: JSON.stringify({ metadata }),
    });
  }

  // Temporal bulk image upload (202 Accepted + batchId)
  async uploadBulkToTemporal(folder, files) {
    const formData = new FormData();

    if (Array.isArray(files)) {
      files.forEach((file) => {
        formData.append("images", file);
      });
    } else {
      formData.append("images", files);
    }

    const url = this.getBulkUploadUrl(folder);
    const headers = {};
    const token = this.getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `HTTP error! status: ${response.status}` }));
      throw new Error(
        errorData.message ||
          errorData.error ||
          `HTTP error! status: ${response.status}`
      );
    }

    return await response.json();
  }

  // Temporal workflow status lookup
  async getBulkWorkflowStatus(workflowId) {
    if (!workflowId) throw new Error('workflowId is required');

    const API_BASE_URL = this.getApiBaseUrl();
    const url = `${API_BASE_URL}/bulk/status/${encodeURIComponent(workflowId)}`;

    const headers = {
      'Content-Type': 'application/json',
    };
    const token = this.getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const resp = await fetch(url, { headers });

      // Temporal status can lag right after upload acceptance.
      // Treat initial 404 as "not ready yet" instead of a hard error.
      if (resp.status === 404) {
        return null;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `HTTP error! status: ${resp.status}`);
      }

      return await resp.json();
    } catch (err) {
      console.debug('getBulkWorkflowStatus error:', err?.message || err);
      return null;
    }
  }

  // List temporal bulk jobs in a date range
  async listBulkJobs({ from = null, to = null, limit = 200 } = {}) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (limit) params.set('limit', String(limit));

    const query = params.toString();
    return this.request(`/bulk/jobs${query ? `?${query}` : ''}`);
  }

  // Poll for the latest progress for a bulk batch (dev-friendly)
  async getBulkJobProgress(batchId) {
    if (!batchId) throw new Error('batchId is required');

    // Use a lightweight fetch here so we can quietly handle 404 (no progress yet)
    const API_BASE_URL = this.getApiBaseUrl();
    const headers = {
      'Content-Type': 'application/json',
    };
    const token = this.getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // First try using the Temporal workflow id convention: `batch-<batchId>`
    const workflowId = this.buildBulkWorkflowId(batchId);
    const workflowUrl = `${API_BASE_URL}/bulk/progress/${encodeURIComponent(workflowId)}`;
    const legacyUrl = `${API_BASE_URL}/bulk/progress/${encodeURIComponent(batchId)}`;

    try {
      console.log('[api] getBulkJobProgress -> trying workflowUrl', workflowUrl);
      let resp = await fetch(workflowUrl, { headers });
      if (resp.status === 404) {
        // workflow not found under that id - try legacy polling endpoint with raw batchId
        console.debug('[api] workflow not found, falling back to legacy progress URL', legacyUrl);
        resp = await fetch(legacyUrl, { headers });
        if (resp.status === 404) return null;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `HTTP error! status: ${resp.status}`);
      }

      return await resp.json();
    } catch (err) {
      // Network or other error; don't spam console for expected missing-progress cases
      console.debug('getBulkJobProgress error:', err?.message || err);
      return null;
    }
  }


  // Object URL generation for downloading/viewing files
  getObject(albumName, objectName) {
    const API_BASE_URL = this.getApiBaseUrl();
    return `${API_BASE_URL}/albums/${encodeURIComponent(albumName)}/object/${encodeURIComponent(objectName)}`;
  }

  // User registration
  async registerUser(userData) {
    return this.request("/user/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }
}

export default new ApiService();
