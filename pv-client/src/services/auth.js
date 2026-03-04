// HBVU PHOTOS Authentication Service
// S2025-09-02T06:32:35.317Z - Turnstyle integration

import configService from "./config.js";

const AUTH_TOKEN_KEY = "hbvu_auth_token";
const USER_DATA_KEY = "hbvu_user_data";

// Configuration with dual-mode authentication support
const getConfig = () => ({
  apiUrl: configService.getApiUrl(),
  authMode: "api",
  authEndpoint: "/auth/login",
  userEndpoint: "/auth/user",
  statusEndpoint: "/auth/status",
});

// API authentication function (production) - UPDATED to include Turnstile
async function apiLogin(username, password, turnstileToken) {
  const config = getConfig();
  const response = await fetch(`${config.apiUrl}${config.authEndpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      username, 
      password, 
      turnstileToken 
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Login failed" }));
    throw new Error(error.message || "Authentication failed");
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Authentication failed");
  }

  return {
    token: data.data.token,
    user: {
      id: data.data.user.id,
      username: data.data.user.username,
      name: data.data.user.username, // Use username as name if no display name
      email: data.data.user.email,
      role: data.data.user.role,
      avatar: "👤",
      permissions:
        data.data.user.role === "admin"
          ? [
              "upload_photos",
              "create_album",
              "delete_album",
              "delete_photo",
              "edit_metadata",
              "manage_users",
            ]
          : [],
    },
  };
}

// Validate token with backend
async function validateToken(token) {
  const config = getConfig();

  // API token validation
  try {
    const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

class AuthService {
  constructor() {
    this.currentUser = null;
    this.token = localStorage.getItem(AUTH_TOKEN_KEY);
    this.isInitialized = false;
    this.isValidating = false; // Prevent concurrent validations

    // Set up API service reference after import
    this.setupApiService();
  }

  // Set up API service reference to avoid circular import issues
  async setupApiService() {
    const { default: apiService } = await import("./api.js");
    apiService.setAuthService(this);
  }

  // Initialize auth service and restore session
  async init() {
    if (this.isValidating) {
      return;
    }

    if (this.token) {
      this.isValidating = true;
      try {
        // Validate token with backend
        const isValid = await validateToken(this.token);
        if (isValid) {
          // Try to get user data from localStorage first
          const userData = localStorage.getItem(USER_DATA_KEY);
          if (userData) {
            this.currentUser = JSON.parse(userData);
          } else {
            // If no cached user data, fetch from backend
            await this.fetchCurrentUser();
          }
        } else {
          console.warn("Token validation failed, clearing auth");
          this.clearAuth();
        }
      } catch (error) {
        console.warn("Token validation failed, clearing auth:", error);
        this.clearAuth();
      } finally {
        this.isValidating = false;
      }
    }
    this.isInitialized = true;
  }

  // Fetch current user from backend
  async fetchCurrentUser() {
    const config = getConfig();
    try {
      const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.user) {
          this.currentUser = {
            id: data.data.user.id,
            username: data.data.user.username,
            name: data.data.user.username,
            email: data.data.user.email,
            role: data.data.user.role,
            avatar: "👤",
            permissions:
              data.data.user.role === "admin"
                ? [
                    "upload_photos",
                    "create_album",
                    "delete_album",
                    "delete_photo",
                    "edit_metadata",
                    "manage_users",
                  ]
                : [],
          };
          localStorage.setItem(USER_DATA_KEY, JSON.stringify(this.currentUser));
        }
      } else {
        throw new Error("Failed to fetch user data");
      }
    } catch (error) {
      console.error("Failed to fetch current user:", error);
      this.clearAuth();
    }
  }

  // Login with username and password - UPDATED to pass Turnstile token
  async login(username, password, turnstileToken) {
    const config = getConfig();
    try {
      let response;

      response = await apiLogin(username, password, turnstileToken);

      this.token = response.token;
      this.currentUser = response.user;

      localStorage.setItem(AUTH_TOKEN_KEY, this.token);
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(this.currentUser));

      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: error.message };
    }
  }

  // Logout and clear session
  logout() {
    this.clearAuth();
    return { success: true };
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.token && this.currentUser);
  }

  // Check if user is admin
  isAdmin() {
    return this.currentUser && this.currentUser.role === "admin";
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get auth token
  getToken() {
    return this.token;
  }

  // Clear authentication state
  clearAuth() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  }

  // Permission system
  canPerformAction(action) {
    if (!this.isAuthenticated()) {
      return false;
    }

    // Check if user has specific permission
    if (this.currentUser.permissions) {
      return this.currentUser.permissions.includes(action);
    }

    // Fallback to role-based permissions
    const adminActions = [
      "upload_photos",
      "create_album",
      "delete_album",
      "delete_photo",
      "edit_metadata",
      "manage_users",
    ];
    if (adminActions.includes(action)) {
      return this.isAdmin();
    }

    return true; // Regular users can view content
  }

  // User management methods (for demo mode)
  async getUsers() {
    // Production: fetch from backend
    const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch users");
    }

    return await response.json();
  }

  async createUser(userData) {
    // Production: create user via backend
    const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to create user" }));
      throw new Error(error.message);
    }

    return await response.json();
  }

  async updateUser(userId, userData) {
    // Production: update user via backend
    const response = await fetch(
      `${config.apiUrl}${config.userEndpoint}/${userId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(userData),
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to update user" }));
      throw new Error(error.message);
    }

    return await response.json();
  }

  async deleteUser(userId) {
    // Production: delete user via backend
    const response = await fetch(
      `${config.apiUrl}${config.userEndpoint}/${userId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to delete user" }));
      throw new Error(error.message);
    }

    return true;
  }

  // Password change method
  async changePassword({ userId, currentPassword, newPassword }) {
    const isSelf = !userId || userId === this.getCurrentUser()?.id;

    const endpoint = isSelf
      ? `${config.apiUrl}/auth/change-password`
      : `${config.apiUrl}/auth/users/${userId}/password`;

    const body = isSelf
      ? { oldPassword: currentPassword, newPassword }
      : { newPassword };

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to change password" }));
      throw new Error(error.message);
    }

    return await response.json();
  }
}

export default new AuthService();