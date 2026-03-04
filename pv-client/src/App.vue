<!-- force rebuilt to before load more meltdown -->
<template>
  <div id="app" class="min-h-screen font-sans bg-gray-50">


    <!-- Header (hidden in public view) -->
    <AppHeader
      v-if="!isPublicView"
      :currentView="currentView"
      :currentUser="currentUser"
      :isAuthenticated="isAuthenticated"
      @navigate="handleNavigation"
      @logout="handleLogout"
      @login="handleLoginTrigger"
      @register="handleRegisterTrigger"
      @search="handleSearch"
    />

    <!-- Main content -->
    <main class="px-6 py-8 max-w-screen-xl mx-auto">
      <Home v-if="currentView === 'home'" @navigate="handleNavigation" />
      <Albums
        v-else-if="currentView === 'albums'"
        @navigate="handleNavigation"
        @openAlbum="handleAlbumOpen"
      />
      <AlbumViewer
        v-else-if="
          currentView === 'album-detail' || currentView === 'public-album'
        "
        :albumName="selectedAlbumName"
        :isPublic="isPublicView"
        @back="handleBackToAlbums"
        @photoOpened="handlePhotoOpen"
      />
      <UserManagement
        v-else-if="currentView === 'users'"
        v-if="isAuthenticated"
      />
      <Settings v-else-if="currentView === 'settings'" v-if="isAuthenticated" />
    </main>

   

    <!-- Share Dialog -->
    <ShareDialog
      v-if="showShareDialog"
      :album-name="selectedAlbumName"
      :share-url="shareUrl"
      @close="showShareDialog = false"
    />

    <!-- Login/Register modals (hidden in public view) -->
    <Login
      v-if="showLogin && !isPublicView"
      @login-success="handleLoginSuccess"
      @close="handleLoginClose"
    />
    <Register
      v-if="showRegister && !isPublicView"
      @register-success="handleRegisterSuccess"
      @close="handleRegisterClose"
    />

    <!-- Search Results Modal -->
    <SearchResults
      :visible="showSearchResults"
      :search-query="currentSearchQuery"
      @close="closeSearchResults"
      @select-album="handleSearchAlbumSelect"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watchEffect } from "vue";
import AppHeader from "./components/AppHeader.vue";
import Home from "./components/Home.vue";
import Albums from "./components/Albums.vue";
import AlbumViewer from "./components/AlbumViewer.vue";
import Login from "./components/Login.vue";
import UserManagement from "./components/UserManagement.vue";
import Settings from "./components/Settings.vue";
import Register from "./components/Register.vue";
import ShareDialog from "./components/ShareDialog.vue";
import SearchResults from "./components/SearchResults.vue";
import authService from "./services/auth.js";
import urlService from "./services/urlService.js";

// Reactive state
const currentView = ref("home");
const selectedAlbumName = ref("");
const showLogin = ref(false);
const showRegister = ref(false);
const showShareDialog = ref(false);
const showSearchResults = ref(false);
const currentSearchQuery = ref("");
const isAuthenticated = ref(false);
const currentUser = ref(null);
const userRole = computed(() => currentUser.value?.role || "guest");

// Computed share URL
const shareUrl = computed(() => {
  if (!selectedAlbumName.value) return "";
  return urlService.generateShareableUrl(selectedAlbumName.value);
});

// Computed public view flag
const isPublicView = computed(() => currentView.value === "public-album");

// Lifecycle
let urlCleanup = null;

onMounted(async () => {
  await authService.init();
  updateAuthState();

  const albumSlug = urlService.getCurrentAlbumFromUrl();
  const isPublic = window.location.hash.startsWith("#/public/");

  if (albumSlug) {
    selectedAlbumName.value = albumSlug;
    currentView.value = isPublic ? "public-album" : "album-detail";
  } else {
    currentView.value = isAuthenticated.value ? "albums" : "home";
  }

  urlCleanup = urlService.onUrlChange(handleUrlChange);
  window.addEventListener("storage", handleStorageChange);
});

onUnmounted(() => {
  window.removeEventListener("storage", handleStorageChange);
  if (urlCleanup) urlCleanup();
});

// URL change handler
const handleUrlChange = () => {
  const albumSlug = urlService.getCurrentAlbumFromUrl();
  const isPublic = urlService.isPublicAlbumUrl();

  if (albumSlug) {
    selectedAlbumName.value = albumSlug;
    currentView.value = isPublic ? "public-album" : "album-detail";
  } else if (["album-detail", "public-album"].includes(currentView.value)) {
    selectedAlbumName.value = "";
    currentView.value = isAuthenticated.value ? "albums" : "home";
  }
};

// Auth state
const updateAuthState = () => {
  isAuthenticated.value = authService.isAuthenticated();
  currentUser.value = authService.getCurrentUser();
};

const handleStorageChange = (event) => {
  if (event.key === "hbvu_auth_token" && !event.newValue) {
    updateAuthState();
  }
};

// Navigation
const handleNavigation = (view) => {
  if (
    ["album-detail", "public-album"].includes(currentView.value) &&
    view !== "album-detail"
  ) {
    urlService.clearAlbumFromUrl();
  }
  currentView.value = view;
};

const handleAlbumOpen = (album) => {
  selectedAlbumName.value = album.name;
  currentView.value = "album-detail";
  urlService.setAlbumInUrl(album.name);
};

const handleBackToAlbums = () => {
  selectedAlbumName.value = "";
  currentView.value = "albums";
  urlService.clearAlbumFromUrl();
};

const handlePhotoOpen = (photo) => {
  // TODO: Show lightbox or photo viewer
};

// Login/Register
const handleLoginTrigger = () => (showLogin.value = true);
const handleLoginClose = () => (showLogin.value = false);
const handleLoginSuccess = () => {
  showLogin.value = false;
  updateAuthState();
  currentView.value = "home";
};

const handleRegisterTrigger = () => (showRegister.value = true);
const handleRegisterClose = () => (showRegister.value = false);
const handleRegisterSuccess = () => {
  showRegister.value = false;
  showLogin.value = true;
};

const handleLogout = () => {
  authService.logout();
  updateAuthState();
  currentView.value = "home";
  if (["album-detail", "public-album"].includes(currentView.value)) {
    urlService.clearAlbumFromUrl();
  }
};

const handleSearch = (query) => {
  console.log('App: handleSearch called with query:', query)
  currentSearchQuery.value = query;
  showSearchResults.value = true;
};

const closeSearchResults = () => {
  console.log('App: Closing search results')
  showSearchResults.value = false;
  currentSearchQuery.value = "";
};

const handleSearchAlbumSelect = (album) => {
  // Navigate to the selected album
  selectedAlbumName.value = album.name;
  currentView.value = "album-detail";
  urlService.setAlbumInUrl(album.name);
  closeSearchResults();
};
</script>
