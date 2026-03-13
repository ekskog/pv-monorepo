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

  // File upload - Updated to match API spec
  async uploadFile(bucketName, files, folderPath = "") {
    const formData = new FormData();

    // Add files to form data
    if (Array.isArray(files)) {
      files.forEach((file) => {
        formData.append("files", file);
      });
    } else {
      formData.append("files", files);
    }

    // Add folder path if provided
    if (folderPath) {
      formData.append("folderPath", folderPath); // Don't encode here, let the backend handle it
    }

    const API_BASE_URL = this.getApiBaseUrl();
    const url = `${API_BASE_URL}/buckets/${bucketName}/upload`;

    // Prepare headers (don't set Content-Type for FormData)
    const headers = {};

    // Add auth token if available
    const token = this.getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  // Single file upload with progress tracking
  async uploadSingleFile(bucketName, file, folderPath = "", onProgress = null) {
    const formData = new FormData();
    formData.append("files", file);

    if (folderPath) {
      formData.append("folderPath", folderPath);
    }

    const API_BASE_URL = this.getApiBaseUrl();
    const url = `${API_BASE_URL}/buckets/${bucketName}/upload`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error("Invalid JSON response"));
          }
        } else {
          reject(new Error(`HTTP error! status: ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener("error", () => {
        reject(new Error("Network error occurred"));
      });

      // Start the upload - MUST be called before setting headers
      xhr.open("POST", url);

      // Add auth header if available - AFTER xhr.open()
      const token = this.getAuthToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    });
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
