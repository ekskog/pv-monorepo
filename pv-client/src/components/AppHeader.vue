<template>
  <header
    class="relative flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm"
  >
    <!-- Left: Logo or Hamburger -->
    <div class="flex items-center gap-4 relative">
      <!-- const props = defineProps({
  currentView: String,
  currentUser: Object,
  isAuthenticated: Boolean,
});
const emit = defineEmits(["navigate", "logout", "login", "register", "search"]);

const isHealthy = ref(false);
const healthStatus = ref("Checking...");
const showUserDropdown = ref(false);
const showPasswordDialog = ref(false);
const userMenuRef = ref(null);
const showMobileMenu = ref(false);
const showMobileUserDropdown = ref(false);
const searchQuery = ref("");
const mobileSearchQuery = ref("");ible on md and below) -->
      <button class="md:hidden text-xl text-gray-700" @click="toggleMobileMenu">
        <i class="fas fa-bars"></i>
      </button>

      <!-- Mobile Menu (anchored to hamburger) -->
      <div
        v-if="showMobileMenu"
        class="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-md z-40 rounded-lg w-max min-w-[10rem]"
      >
        <!-- Search Input for Mobile -->
        <div class="px-4 py-2 border-b border-gray-200">
          <div class="relative">
            <input
              v-model="mobileSearchQuery"
              type="text"
              placeholder="Search albums..."
              class="w-full px-3 py-2 pl-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              @keyup.enter="performMobileSearch"
            />
            <i class="fas fa-search absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
          </div>
        </div>

        <!-- Navigation Buttons -->
        <button
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          @click="
            () => {
              showMobileMenu = false;
              $emit('navigate', 'albums');
            }
          "
        >
          Albums
        </button>
        <button
          v-if="isAdmin"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          @click="
            () => {
              showMobileMenu = false;
              $emit('navigate', 'user-management');
            }
          "
        >
          Manage Users
        </button>
        <button
          v-if="isAdmin"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          @click="
            () => {
              showMobileMenu = false;
              $emit('navigate', 'settings');
            }
          "
        >
          Settings
        </button>

        <!-- Auth Menu Section -->
        <div class="border-t border-gray-200 px-4 py-2">
          <template v-if="isAuthenticated">
            <!-- User Dropdown Toggle -->
            <button
              class="w-full text-left text-sm flex items-center justify-between py-2"
              @click="showMobileUserDropdown = !showMobileUserDropdown"
            >
              <span>{{ currentUser.name }}</span>
              <span :class="showMobileUserDropdown ? 'rotate-180' : ''" class="transition-transform text-xs">⌄</span>
            </button>

            <!-- Submenu -->
            <div v-if="showMobileUserDropdown" class="mt-2 ml-2 flex flex-col gap-1">
              <button class="text-left text-sm px-2 py-1 hover:bg-gray-100" @click="changePassword">
                Change Password
              </button>
              <button class="text-left text-sm px-2 py-1 hover:bg-gray-100" @click="logout">
                Logout
              </button>
            </div>
          </template>
          <template v-else>
            <button class="w-full text-left text-sm py-2 hover:bg-gray-100" @click="triggerLogin">
              Login
            </button>
            <button class="w-full text-left text-sm py-2 hover:bg-gray-100" @click="triggerRegister">
              Register
            </button>
          </template>
        </div>
      </div>

      <!-- Logo (visible on md and up) -->
      <div
        class="hidden md:block text-xl text-gray-800 cursor-pointer"
        @click="$emit('navigate', 'home')"
      >
        <i class="fas fa-camera text-2xl text-blue-500 hover:text-blue-700"></i>
      </div>
    </div>

    <!-- Center: Search + Navigation (hidden on md and below) -->
    <div class="hidden md:flex gap-4 flex-wrap justify-center items-center">
      <!-- Search Input -->
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search albums..."
          class="w-64 px-4 py-2 pl-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          @keyup.enter="performSearch"
        />
        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
      </div>

      <button
        class="text-sm px-4 py-2 border-b-2 transition-all"
        :class="
          currentView === 'albums'
            ? 'text-blue-600 bg-blue-50 border-blue-600 font-semibold'
            : 'text-gray-600 border-transparent hover:text-blue-500 hover:bg-blue-50'
        "
        @click="$emit('navigate', 'albums')"
      >
        <i class="fas fa-layer-group mr-2"></i> Albums
      </button>
      <button
        v-if="isAdmin"
        class="text-sm px-4 py-2 border-b-2 transition-all"
        :class="
          currentView === 'user-management'
            ? 'text-blue-600 bg-blue-50 border-blue-600 font-semibold'
            : 'text-gray-600 border-transparent hover:text-blue-500 hover:bg-blue-50'
        "
        @click="$emit('navigate', 'user-management')"
      >
        <i class="fas fa-users mr-2"></i> Manage Users
      </button>
      <button
        v-if="isAdmin"
        class="text-sm px-4 py-2 border-b-2 transition-all"
        :class="
          currentView === 'settings'
            ? 'text-blue-600 bg-blue-50 border-blue-600 font-semibold'
            : 'text-gray-600 border-transparent hover:text-blue-500 hover:bg-blue-50'
        "
        @click="$emit('navigate', 'settings')"
      >
        <i class="fas fa-cog mr-2"></i> Settings
      </button>
    </div>

    <!-- Right: Status + User Menu -->
    <div class="flex items-center gap-4">
      <!-- Status Dot (always visible) -->
      <div
        :class="isHealthy ? 'bg-green-500' : 'bg-red-500'"
        class="w-3 h-3 rounded-full flex items-center justify-center text-white text-[0.5rem] leading-none"
      >
        <i :class="isHealthy ? 'fas fa-check' : 'fas fa-exclamation'"></i>
      </div>

      <!-- User Menu (hidden on sm, visible on md+) -->
      <div
        class="hidden md:flex relative items-center gap-2 cursor-pointer"
        @click="toggleUserDropdown"
        ref="userMenuRef"
      >
        <div
          class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg"
        >
          <i class="fas fa-user-circle"></i>
        </div>
        <div class="flex flex-col">
          <div class="text-sm font-semibold" @click="handleUserClick">
            {{ isAuthenticated ? currentUser.name : "Login" }}
          </div>
        </div>
        <i
          class="fas fa-chevron-down text-xs transition-transform"
          :class="{ 'rotate-180': showUserDropdown }"
        ></i>

        <!-- Dropdown -->
        <div
          v-if="showUserDropdown"
          class="absolute top-full right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
        >
          <template v-if="isAuthenticated">
            <button
              class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100"
              @click="changePassword"
            >
              <i class="fas fa-key"></i> Change Password
            </button>
            <div class="h-px bg-gray-200 my-1"></div>
            <button
              class="w-full text-left px-4 py-2 text-sm text-red-600 flex items-center gap-2 hover:bg-red-50"
              @click="logout"
            >
              <i class="fas fa-sign-out-alt"></i> Logout
            </button>
          </template>
          <template v-else>
            <button
              class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100"
              @click="triggerLogin"
            >
              <i class="fas fa-sign-in-alt"></i> Login
            </button>
            <button
              class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100"
              @click="triggerRegister"
            >
              <i class="fas fa-user-plus"></i> Register
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Password Dialog -->
    <PasswordChange
      v-if="showPasswordDialog"
      :user="currentUser"
      :show="showPasswordDialog"
      @close="closePasswordDialog"
      @success="handlePasswordSuccess"
    />
  </header>
</template>



<script setup>
import { ref, computed, onMounted, onUnmounted, watchEffect } from "vue";
import apiService from "../services/api.js";
import PasswordChange from "./PasswordChange.vue";

const props = defineProps({
  currentView: String,
  currentUser: Object,
  isAuthenticated: Boolean,
});
const emit = defineEmits(["navigate", "logout", "login", "register", "search"]);

const isHealthy = ref(false);
const healthStatus = ref("Checking...");
const showUserDropdown = ref(false);
const showPasswordDialog = ref(false);
const userMenuRef = ref(null);
const showMobileMenu = ref(false);
const showMobileUserDropdown = ref(false);
const searchQuery = ref("");
const mobileSearchQuery = ref("");

const isAdmin = computed(() => props.currentUser?.role === "admin");

const toggleMobileMenu = () => {
  console.log("Hamburger clicked");
  showMobileMenu.value = !showMobileMenu.value;
};
// Reset submenu when auth status changes
watchEffect(() => {
  // Collapse submenu when auth state changes
  showMobileUserDropdown.value = false
})

const toggleUserDropdown = (e) => {
  e.stopPropagation();
  showUserDropdown.value = !showUserDropdown.value;
};
const handleUserClick = () => {
  if (!props.isAuthenticated) emit("login");
};
const triggerLogin = () => {
  showUserDropdown.value = false;
  emit("login");
};
const triggerRegister = () => {
  showUserDropdown.value = false;
  emit("register");
};
const changePassword = () => {
  showUserDropdown.value = false;
  showPasswordDialog.value = true;
};
const closePasswordDialog = () => (showPasswordDialog.value = false);
const handlePasswordSuccess = () => (showPasswordDialog.value = false);
const logout = () => {
  showUserDropdown.value = false;
  emit("logout");
};
const performSearch = () => {
  if (searchQuery.value.trim()) {
    emit("search", searchQuery.value.trim());
    searchQuery.value = ""; // Clear the search field
  }
};
const performMobileSearch = () => {
  if (mobileSearchQuery.value.trim()) {
    showMobileMenu.value = false; // Close mobile menu
    emit("search", mobileSearchQuery.value.trim());
    mobileSearchQuery.value = ""; // Clear the mobile search field
  }
};
const checkHealth = async () => {
  try {
    const health = await apiService.getHealth();
    console.log("Health:", health);
    isHealthy.value = health.status === "healthy";
    healthStatus.value = isHealthy.value ? "Connected" : "Disconnected";
  } catch {
    isHealthy.value = false;
    healthStatus.value = "Offline";
  }
};
const handleClickOutside = (e) => {
  // Close user dropdown if clicking outside
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    showUserDropdown.value = false;
  }
  
  // Close mobile menu if clicking outside
  // Check if the click target is not the hamburger button or within the mobile menu
  const hamburgerButton = e.target.closest('button[class*="md:hidden"]');
  const mobileMenu = e.target.closest('[class*="absolute top-full left-0"]');
  
  if (showMobileMenu.value && !hamburgerButton && !mobileMenu) {
    showMobileMenu.value = false;
  }
};
onMounted(() => {
  checkHealth();
  document.addEventListener("click", handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>
