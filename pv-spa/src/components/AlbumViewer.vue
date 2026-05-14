<template>
  <div class="py-2 sm:py-4">
    <!-- Use the new AlbumHeader component -->
    <AlbumHeader
      :album-name="albumName"
      :photo-count="mediaType === 'images' ? visiblePhotos.length : visibleVideos.length"
      :loading="loading"
      :can-upload-photos="canUploadPhotos"
      :media-type="mediaType"
      :show-metadata="showPhotoMetadata"
      :sort-order="sortOrder"
      @back="$emit('back')"
      @refresh="refreshAlbum"
      @upload="showUploadDialog = true"
      @media-type-change="mediaType = $event"
      @metadata-toggle="showPhotoMetadata = !showPhotoMetadata"
      @sort-change="sortOrder = $event"
    />

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div
        class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"
      ></div>
      <p class="text-gray-600">Loading album photos...</p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="text-center py-8 text-red-500">
      <p class="mb-4">
        <i class="fas fa-exclamation-triangle mr-2"></i> {{ error }}
      </p>
      <button
        class="bg-gray-100 text-gray-700 border border-gray-300 px-6 py-3 rounded-md hover:bg-gray-200 transition-colors"
        @click="loadPhotos"
      >
        Try Again
      </button>
    </div>

    <!-- Empty State -->
    <PhotoGridEmpty v-if="!loading && !error && mediaType === 'images' && visiblePhotos.length === 0" />
    <div v-if="!loading && !error && mediaType === 'videos' && visibleVideos.length === 0" class="text-center py-12">
      <i class="fas fa-video text-gray-400 text-6xl mb-4"></i>
      <p class="text-gray-600">No videos found in this album</p>
    </div>

    <!-- Grid size controls (desktop only) -->
    <div v-if="mediaType === 'images' && !loading && !error && visiblePhotos.length > 0"
      class="hidden sm:flex items-center justify-end gap-2 mb-2 px-1">
      <span class="text-xs text-gray-400">Grid size</span>
      <button
        @click="adjustCellSize(-50)"
        class="w-7 h-7 flex items-center justify-center rounded border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors text-sm leading-none"
        :disabled="cellSize <= 150"
        aria-label="Decrease grid size"
      >−</button>
      <span class="text-xs text-gray-400 w-12 text-center">{{ cellSize }}px</span>
      <button
        @click="adjustCellSize(50)"
        class="w-7 h-7 flex items-center justify-center rounded border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors text-sm leading-none"
        :disabled="cellSize >= 700"
        aria-label="Increase grid size"
      >+</button>
    </div>

    <!-- Photos Grid with Pagination (now uses sortedPhotos) -->
    <PhotoGrid
      v-if="mediaType === 'images'"
      :photos="sortedPhotos"
      :photo-metadata-lookup="photoMetadataLookup"
      :image-loaded-map="imageLoadedMap"
      :album-name="albumName"
      :bucket-name="BUCKET_NAME"
      :show-metadata="showPhotoMetadata"
      :items-per-page="24"
      :cell-size="cellSize"
      @photo-click="openPhoto"
      @image-load="handleImageLoad"
      @image-error="handleImageError"
      @image-load-start="handleImageLoadStart"
    />

    <!-- Videos Grid -->
    <VideoGrid
      v-if="mediaType === 'videos'"
      :videos="sortedVideos"
      :photo-metadata-lookup="photoMetadataLookup"
      :album-name="albumName"
      :bucket-name="BUCKET_NAME"
      :items-per-page="24"
      @video-click="openVideo"
    />

    <!-- Upload Dialog -->
    <MediaUpload
      :showUploadDialog="showUploadDialog"
      :album-name="albumName"
      @close="handleUploadDialogClose"
      @jobReady="handleJobReady"
    />

    <!-- Delete Photo Dialog -->
    <div v-if="showDeletePhotoDialog">
      <DeletePhotoDialog
        :show="showDeletePhotoDialog"
        :photoName="
          photoToDelete ? getPhotoDisplayName(photoToDelete.name) : ''
        "
        :deleting="deletingPhoto"
        @cancel="closeDeletePhotoDialog"
        @delete="handleDialogDelete"
      />
    </div>

    <!-- Lightbox Viewer (now uses sortedLightboxPhotos) -->
    <PhotoLightbox
      :show="showLightbox"
      :photos="sortedLightboxPhotos"
      :current-index="currentPhotoIndex"
      :loading="lightboxLoading"
      :can-delete="canDeletePhoto"
      bucket-name="photovault"
      :album-name="albumName"
      :photo-metadata-lookup="photoMetadataLookup"
      @close="closeLightbox"
      @next-photo="nextPhoto"
      @previous-photo="previousPhoto"
      @delete-photo="confirmDeletePhoto"
    />

    <!-- Video Lightbox Viewer -->
    <VideoLightbox
      :show="showVideoLightbox"
      :videos="sortedLightboxVideos"
      :current-index="currentVideoIndex"
      :loading="false"
      :can-delete="canDeletePhoto"
      bucket-name="photovault"
      :album-name="albumName"
      :photo-metadata-lookup="photoMetadataLookup"
      @close="closeVideoLightbox"
      @next-video="nextVideo"
      @previous-video="previousVideo"
      @delete-video="confirmDeleteVideo"
    />

    <!-- Toasts -->
    <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end" aria-live="polite">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="max-w-xs w-full bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg border border-gray-800"
      >
        {{ t.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import apiService from "../services/api.js";
import authService from "../services/auth.js";
import { useToast } from "../composables/useToast";
import { useUploadMonitor, isTerminalUploadStatus } from "../services/uploadMonitor.js";

import AlbumHeader from "./AlbumHeader.vue";
import MediaUpload from "./MediaUpload.vue";
import PhotoLightbox from "./PhotoLightbox.vue";
import VideoLightbox from "./VideoLightbox.vue";
import DeletePhotoDialog from "./DeletePhotoDialog.vue";
import PhotoGridEmpty from "./PhotoGridEmpty.vue";
import PhotoGrid from "./PhotoGrid.vue";
import VideoGrid from "./VideoGrid.vue";

const props = defineProps({ albumName: String, isPublic: Boolean });
const emit = defineEmits(["back", "photoOpened", "uploadComplete"]);

const BUCKET_NAME = "photovault";

const loading = ref(false);
const error = ref(null);
const photos = ref([]);
const albumMetadata = ref(null);
const photoMetadataLookup = ref({});
const imageLoadedMap = ref({});
const currentPage = ref(1);
const showUploadDialog = ref(false);
const showLightbox = ref(false);
const currentPhotoIndex = ref(0);
const lightboxLoading = ref(false);
const showVideoLightbox = ref(false);
const currentVideoIndex = ref(0);
const showDeletePhotoDialog = ref(false);
const photoToDelete = ref(null);
const deletingPhoto = ref(false);
const preloadStats = ref({
  total: 0,
  preloaded: 0,
  percentage: 0,
  currentlyFetchingFullSize: null,
  readyImages: [],
});
const progressTracker = ref(null);
// Toasts
const { toasts, showToast } = useToast();
const { jobs: trackedUploads, registerLegacyUpload, registerBulkUpload } = useUploadMonitor();
const handledAlbumCompletions = new Set();

// NEW: Sort order state
const sortOrder = ref('reverse'); // 'chronological' or 'reverse'

// NEW: Media type state (images or videos)
const mediaType = ref('images'); // 'images' or 'videos'
const showPhotoMetadata = ref(true);

// Grid cell size (desktop only), persisted in localStorage
const CELL_SIZE_KEY = 'pv-grid-cell-size';
const cellSize = ref(parseInt(localStorage.getItem(CELL_SIZE_KEY) || '400', 10));
const adjustCellSize = (delta) => {
  cellSize.value = Math.min(700, Math.max(150, cellSize.value + delta));
  localStorage.setItem(CELL_SIZE_KEY, String(cellSize.value));
};

// Helper function to sort photos by timestamp
const sortPhotosByTimestamp = (photosArray, order = 'chronological') => {
  return [...photosArray].sort((a, b) => {
    const metadataA = photoMetadataLookup.value[a.fullPath] || photoMetadataLookup.value[a.name];
    const metadataB = photoMetadataLookup.value[b.fullPath] || photoMetadataLookup.value[b.name];
    
    const timestampA = metadataA?.timestamp;
    const timestampB = metadataB?.timestamp;
    
    // Handle missing timestamps - put them at the end
    if (!timestampA && !timestampB) return 0;
    if (!timestampA) return 1;
    if (!timestampB) return -1;
    
    // Parse timestamps and sort
    const dateA = new Date(timestampA);
    const dateB = new Date(timestampB);
    
    // Switch direction based on sort order
    const direction = order === 'reverse' ? -1 : 1;
    return direction * (dateA - dateB);
  });
};

const canUploadPhotos = computed(() =>
  authService.canPerformAction("upload_photos")
);
const canDeletePhoto = computed(() => true);

const visiblePhotos = computed(() =>
  photos.value.filter(
    (p) =>
      /\.(avif|jpg|jpeg|png|gif|heic)$/i.test(p.name) &&
      !/_thumb\./i.test(p.name)
  )
);

// NEW: Visible videos computed property
const visibleVideos = computed(() =>
  photos.value.filter(
    (p) =>
      /\.(mp4|mov|avi|mkv|webm|m4v|3gp|flv|wmv)$/i.test(p.name)
  )
);

// NEW: Sorted photos computed property
const sortedPhotos = computed(() => {
  if (!visiblePhotos.value.length) return [];
  return sortPhotosByTimestamp(visiblePhotos.value, sortOrder.value);
});

// NEW: Sorted videos computed property
const sortedVideos = computed(() => {
  if (!visibleVideos.value.length) return [];
  return sortPhotosByTimestamp(visibleVideos.value, sortOrder.value);
});

// NEW: Sorted lightbox photos computed property
const sortedLightboxPhotos = computed(() => sortedPhotos.value);

// NEW: Sorted lightbox videos computed property
const sortedLightboxVideos = computed(() => sortedVideos.value);

const handleJobReady = (payload) => {
  if (payload?.workflowId) {
    registerBulkUpload({
      workflowId: payload.workflowId,
      batchId: payload.batchId,
      albumName: props.albumName,
    });
    return;
  }

  if (payload?.jobId) {
    registerLegacyUpload({
      jobId: payload.jobId,
      albumName: props.albumName,
    });
  }
};

const handleUploadDialogClose = (payload) => {
  showUploadDialog.value = false;
  if (payload?.filesCount) {
    if (payload.mode === 'temporal-bulk') {
      showBulkUploadNotification(payload.jobId || payload.workflowId || payload.batchId);
    } else {
      showNonBulkUploadNotification(payload.jobId);
    }
  }
};

const resetPagination = () => (currentPage.value = 1);

const loadPhotos = async () => {
  loading.value = true;
  error.value = null;
  try {
    const albumName = props.albumName.trim().replace(/\/+$/, "");
    console.log("[AlbumViewer] Loading photos for album:", albumName, "type:", typeof albumName);
    console.log("[AlbumViewer] Album name encoded:", encodeURIComponent(albumName));
    await loadAlbumMetadata(albumName);

    const response = await apiService.getAlbumContents(albumName);
    console.log("[AlbumViewer] Album contents response:", response);

    // Handle different response structures
    let objects = [];
    if (response.success) {
      if (response.album && response.album.objects) {
        objects = response.album.objects;
      } else if (response.objects) {
        objects = response.objects;
      } else if (Array.isArray(response)) {
        objects = response;
      }
    }

    if (objects.length > 0) {
      console.log("[AlbumViewer] Raw objects from API:", objects);
      const allFiles = objects
        .filter((obj) => obj.name && !obj.name.endsWith("/"))
        .map((obj) => {
          // Remove album prefix from the object name
          const nameWithoutAlbum = obj.name.startsWith(`${albumName}/`)
            ? obj.name.slice(albumName.length + 1)
            : obj.name;

          return {
            ...obj,
            name: nameWithoutAlbum, // safe name for keys and display
            fullPath: obj.name, // full path for fetching from backend/MinIO
          };
        });

      console.log("[AlbumViewer] Processed photos:", allFiles.length, "files");
      photos.value = allFiles;

      resetPagination();
    } else {
      console.log("[AlbumViewer] No photos found - set empty array to show PhotoGridEmpty component");
      photos.value = [];
      resetPagination();
    }
  } catch (err) {
    error.value = `Error loading photos: ${err.message}`;
  } finally {
    loading.value = false;
  }
};

const refreshAlbum = async () => await loadPhotos();

const loadAlbumMetadata = async (albumName) => {
  try {
    const metadataUrl = apiService.getObject(albumName, `${albumName}.json`);
    const response = await fetch(metadataUrl);
    if (response.ok) {
      const metadata = await response.json();
      //console.log(`DEBUG METADATA: ${Date.now()} >> ${JSON.stringify(metadata)}`);
      albumMetadata.value = metadata;
      const lookup = {};
      if (Array.isArray(metadata.media)) {
        metadata.media.forEach((mediaMeta) => {
          if (mediaMeta.sourceImage) {
            const filename = mediaMeta.sourceImage.split("/").pop();
            lookup[filename] = mediaMeta;
            lookup[mediaMeta.sourceImage] = mediaMeta;
          }
        });
      }
      photoMetadataLookup.value = lookup;
      if (photos.value.length > 0) {
        const currentPhotos = photos.value;
        photos.value = [];
        await nextTick();
        photos.value = currentPhotos;
      }
    }
  } catch (err) {
    console.warn("Could not load album metadata:", err.message);
  }
};

const getPhotoDisplayName = (filename) => filename.split("/").pop() || filename;
const getPhotoUrl = (photo) =>
  photo.presignedUrl || apiService.getObject(props.albumName, photo.name);
const preloadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const loadImageProgressively = async (photo, imgElement) => {
  try {
    const photoSrc = getPhotoUrl(photo);
    preloadStats.value.currentlyFetchingFullSize = photo.name;
    preloadImage(photoSrc)
      .then(() => {
        imgElement.dataset.fullLoaded = "true";
        if (!preloadStats.value.readyImages.includes(photo.name)) {
          preloadStats.value.readyImages.push(photo.name);
        }
        preloadStats.value.currentlyFetchingFullSize = null;
        trackProgressiveLoadingStats();
      })
      .catch(() => {
        preloadStats.value.currentlyFetchingFullSize = null;
      });
  } catch (error) {
    console.error(`Failed to load image for ${photo.name}:`, error);
  }
};

const handleImageError = (event) => {
  // Create a simple SVG placeholder for failed images
  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#f3f4f6"/>
    <circle cx="100" cy="80" r="30" fill="#d1d5db"/>
    <path d="M70 120 Q100 140 130 120" stroke="#9ca3af" stroke-width="3" fill="none"/>
    <text x="100" y="170" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">Image Error</text>
  </svg>`;
  const encodedSvg = btoa(svgData);
  event.target.src = `data:image/svg+xml;base64,${encodedSvg}`;
};

const handleImageLoadStart = (event) => {};
const handleImageLoad = (event) =>
  (imageLoadedMap.value[event.target.alt] = true);

const openPhoto = async (photo) => {
  // UPDATED: Find photo in sorted array
  const targetPhotoIndex = sortedLightboxPhotos.value.findIndex(
    (p) => p.name === photo.name
  );
  if (targetPhotoIndex === -1) return;
  const gridImage = document.querySelector(
    `img[alt="${photo.name}"][data-full-loaded="true"]`
  );
  const isPreloaded = gridImage?.dataset.fullLoaded === "true";
  currentPhotoIndex.value = targetPhotoIndex;
  showLightbox.value = true;
  if (!isPreloaded) lightboxLoading.value = true;
};

const openVideo = async (video) => {
  console.log('[AlbumViewer] openVideo called with:', video)
  console.log('[AlbumViewer] sortedLightboxVideos:', sortedLightboxVideos.value)
  console.log('[AlbumViewer] sortedLightboxVideos length:', sortedLightboxVideos.value?.length)
  // Find video in sorted array
  const targetVideoIndex = sortedLightboxVideos.value.findIndex(
    (v) => v.name === video.name
  );
  console.log('[AlbumViewer] Found video at index:', targetVideoIndex)
  if (targetVideoIndex === -1) {
    console.error('[AlbumViewer] Video not found in sortedLightboxVideos:', video.name)
    return;
  }
  currentVideoIndex.value = targetVideoIndex;
  showVideoLightbox.value = true;
  console.log('[AlbumViewer] Video lightbox opened, currentVideoIndex:', currentVideoIndex.value)
};

const closeVideoLightbox = () => {
  showVideoLightbox.value = false;
};

const nextVideo = () => {
  if (currentVideoIndex.value < sortedLightboxVideos.value.length - 1) {
    currentVideoIndex.value++;
  }
};

const previousVideo = () => {
  if (currentVideoIndex.value > 0) {
    currentVideoIndex.value--;
  }
};

const closeLightbox = () => {
  showLightbox.value = false;
  lightboxLoading.value = false;
};

const nextPhoto = () => {
  // UPDATED: Use sorted lightbox photos
  if (currentPhotoIndex.value < sortedLightboxPhotos.value.length - 1) {
    const nextPhoto = sortedLightboxPhotos.value[currentPhotoIndex.value + 1];
    const nextGridImage = document.querySelector(
      `img[alt="${nextPhoto.name}"][data-full-loaded="true"]`
    );
    if (!nextGridImage?.dataset.fullLoaded) lightboxLoading.value = true;
    currentPhotoIndex.value++;
  }
};

const previousPhoto = () => {
  // UPDATED: Use sorted lightbox photos
  if (currentPhotoIndex.value > 0) {
    const prevPhoto = sortedLightboxPhotos.value[currentPhotoIndex.value - 1];
    const prevGridImage = document.querySelector(
      `img[alt="${prevPhoto.name}"][data-full-loaded="true"]`
    );
    if (!prevGridImage?.dataset.fullLoaded) lightboxLoading.value = true;
    currentPhotoIndex.value--;
  }
};

const confirmDeleteVideo = (video) => {
  photoToDelete.value = video;
  showDeletePhotoDialog.value = true;
};

const confirmDeletePhoto = (photo) => {
  photoToDelete.value = photo;
  console.log(`Confirm delete photo: ${photo.name}`);
  showDeletePhotoDialog.value = true;
};

const handleDialogDelete = async () => await deletePhoto();

const deletePhoto = async () => {
  if (!photoToDelete.value) return;
  deletingPhoto.value = true;
  error.value = null;
  try {
    const response = await apiService.deleteObject(
      props.albumName,
      photoToDelete.value.name
    );
    if (response.success) {
      await loadPhotos();
      if (showLightbox.value) {
        // UPDATED: Use sorted lightbox photos
        if (sortedLightboxPhotos.value.length > 1) {
          if (currentPhotoIndex.value >= sortedLightboxPhotos.value.length - 1) {
            currentPhotoIndex.value = Math.max(
              0,
              sortedLightboxPhotos.value.length - 2
            );
          }
        } else {
          closeLightbox();
        }
      }
      closeDeletePhotoDialog();
    } else {
      error.value = response.error || "Failed to delete photo";
    }
  } catch (err) {
    error.value = `Failed to delete photo: ${err.message}`;
  } finally {
    deletingPhoto.value = false;
  }
};

const closeDeletePhotoDialog = () => {
  showDeletePhotoDialog.value = false;
  photoToDelete.value = null;
  deletingPhoto.value = false;
};

const trackProgressiveLoadingStats = () => {
  const allImages = document.querySelectorAll(".photo-image");
  const preloadedImages = document.querySelectorAll(
    '.photo-image[data-full-loaded="true"]'
  );
  const totalImages = allImages.length;
  const preloadedCount = preloadedImages.length;
  const preloadPercentage =
    totalImages > 0 ? Math.round((preloadedCount / totalImages) * 100) : 0;
  preloadStats.value = {
    total: totalImages,
    preloaded: preloadedCount,
    percentage: preloadPercentage,
    currentlyFetchingFullSize: preloadStats.value.currentlyFetchingFullSize,
    readyImages: preloadStats.value.readyImages,
  };
  return {
    total: totalImages,
    preloaded: preloadedCount,
    percentage: preloadPercentage,
  };
};

const startAggressivePreloading = () => {
  const imageElements = document.querySelectorAll(".photo-image");
  imageElements.forEach((img, index) => {
    const photoName = img.alt;
    // UPDATED: Use sorted photos for preloading
    const photo = sortedPhotos.value.find((p) => p.name === photoName);
    if (photo) {
      setTimeout(() => loadImageProgressively(photo, img), index * 100);
    }
  });
};

const preloadVisibleImages = () => {
  const imageElements = document.querySelectorAll(
    '.photo-image[loading="lazy"]'
  );
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const photoName = img.alt;
          // UPDATED: Use sorted photos for preloading
          const photo = sortedPhotos.value.find((p) => p.name === photoName);
          if (photo) loadImageProgressively(photo, img);
          observer.unobserve(img);
        }
      });
    },
    { rootMargin: "100px", threshold: 0.1 }
  );
  imageElements.forEach((img) => observer.observe(img));
};

const showBackgroundProcessingNotification = () => {
  const title = "Photos processing in background";
  const body = "Your upload is being processed in the background and will appear in the album when ready.";
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else {
    // Use in-app toast for a native-like, non-blocking notification
    try {
      showToast(`${title}: ${body}`);
    } catch (e) {
      // Fallback to alert if toasts fail for any reason
      setTimeout(() => {
        try { window.alert(`${title}\n\n${body}`); } catch (err) { console.log(title, body); }
      }, 100);
    }
  }
};

const showBulkUploadNotification = (workflowId) => {
  const title = "Bulk upload accepted";
  const body = "Your bulk upload has been accepted. You can monitor progress on the Monitor page.";
  const message = workflowId ? `${title}: ${body} (job: ${workflowId})` : `${title}: ${body}`;

  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body, icon: "/favicon.ico" });
    n.onclick = () => {
      try { window.focus(); } catch (e) {}
      // Optionally navigate to bulk jobs if app router listens to window focus/navigation
    };
  } else {
    try {
      showToast(message);
    } catch (e) {
      setTimeout(() => { try { window.alert(`${title}\n\n${body}`); } catch (err) { console.log(title, body); } }, 100);
    }
  }
};

const showNonBulkUploadNotification = (jobId) => {
  const title = 'Upload accepted';
  const body = 'Your upload is processing in the background. You can monitor progress on the Monitor page.';
  const message = jobId ? `${title}: ${body} (job: ${jobId})` : `${title}: ${body}`;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else {
    try {
      showToast(message);
    } catch (e) {
      showBackgroundProcessingNotification();
    }
  }
};

watch(
  () => Object.values(trackedUploads).map((job) => `${job.id}:${job.status}:${job.completedAt || ''}`),
  async () => {
    const matchingJobs = Object.values(trackedUploads).filter(
      (job) => job.albumName === props.albumName && job.completedAt && !handledAlbumCompletions.has(`${job.id}:${job.completedAt}`)
    );

    if (matchingJobs.length === 0) {
      return;
    }

    matchingJobs.forEach((job) => {
      handledAlbumCompletions.add(`${job.id}:${job.completedAt}`);
    });

    const successfulJobs = matchingJobs.filter((job) => job.status === 'COMPLETED');
    if (successfulJobs.length > 0) {
      await refreshAlbum();
      successfulJobs.forEach((job) => {
        emit('uploadComplete', job.workflowId || job.jobId || job.id);
      });
    }
  },
  { deep: true }
);

onMounted(async () => {
  console.log("[AlbumViewer] Mounted with album:", props.albumName);
  await loadPhotos();
  setTimeout(() => {
    startAggressivePreloading();
    preloadVisibleImages();
    trackProgressiveLoadingStats();
    progressTracker.value = setInterval(() => {
      const stats = trackProgressiveLoadingStats();
      if (stats.percentage >= 100) {
        clearInterval(progressTracker.value);
        progressTracker.value = null;
      }
    }, 2000);
  }, 100);
});

onUnmounted(() => {
  if (progressTracker.value) {
    clearInterval(progressTracker.value);
    progressTracker.value = null;
  }
});
</script>
