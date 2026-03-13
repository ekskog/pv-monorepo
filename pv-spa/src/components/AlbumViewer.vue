<template>
  <div class="max-w-6xl mx-auto p-8">
    <!-- Use the new AlbumHeader component -->
    <AlbumHeader
      :album-name="albumName"
      :photo-count="mediaType === 'images' ? visiblePhotos.length : visibleVideos.length"
      :loading="loading"
      :can-upload-photos="canUploadPhotos"
      :media-type="mediaType"
      @back="$emit('back')"
      @refresh="refreshAlbum"
      @upload="showUploadDialog = true"
      @media-type-change="mediaType = $event"
    />

    <!-- Sort Controls - Add this section -->
    <div v-if="!loading && !error && (mediaType === 'images' ? visiblePhotos.length > 0 : visibleVideos.length > 0)" class="flex justify-end items-center mb-6">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Sort by:</span>
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button 
            @click="sortOrder = 'chronological'"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-colors',
              sortOrder === 'chronological' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            ]"
          >
            Oldest First
          </button>
          <button 
            @click="sortOrder = 'reverse'"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-colors',
              sortOrder === 'reverse' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            ]"
          >
            Newest First
          </button>
        </div>
      </div>
    </div>

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

    <!-- Processing Status -->
    <div v-if="processingNotifications" class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          <i class="fas fa-cog fa-spin text-blue-600"></i>
        </div>
        <div class="flex-grow">
          <p class="text-sm font-medium text-blue-800">{{ processingStatus }}</p>
          <div v-if="processingJobId" class="text-xs text-blue-600 mt-1">
            Job ID: {{ processingJobId }}
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <PhotoGridEmpty v-if="!loading && !error && mediaType === 'images' && visiblePhotos.length === 0" />
    <div v-if="!loading && !error && mediaType === 'videos' && visibleVideos.length === 0" class="text-center py-12">
      <i class="fas fa-video text-gray-400 text-6xl mb-4"></i>
      <p class="text-gray-600">No videos found in this album</p>
    </div>

    <!-- Photos Grid with Pagination (now uses sortedPhotos) -->
    <PhotoGrid
      v-if="mediaType === 'images'"
      :photos="sortedPhotos"
      :photo-metadata-lookup="photoMetadataLookup"
      :image-loaded-map="imageLoadedMap"
      :album-name="albumName"
      :bucket-name="BUCKET_NAME"
      :items-per-page="24"
      :auto-load="false"
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
      :auto-load="false"
      @video-click="openVideo"
    />

    <!-- Upload Dialog -->
    <MediaUpload
      :showUploadDialog="showUploadDialog"
      :album-name="albumName"
      :currentJobId="processingJobId"
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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import apiService from "../services/api.js";
import authService from "../services/auth.js";
import SSEService from "../services/sseService.js";

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

const processingNotifications = ref(false);
const processingStatus = ref("");
const processingJobId = ref(null);
const pendingJobId = ref(null);
let sseService = null;

// NEW: Sort order state
const sortOrder = ref('chronological'); // 'chronological' or 'reverse'

// NEW: Media type state (images or videos)
const mediaType = ref('images'); // 'images' or 'videos'

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
  if (payload?.jobId) {
    processingJobId.value = payload.jobId;
    startProcessingListener(payload.jobId);
  }
};

const handleUploadDialogClose = (payload) => {
  showUploadDialog.value = false;
  if (payload?.filesCount) {
    processingNotifications.value = true;
    processingStatus.value = `Waiting for job ID...`;
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
  apiService.getObject(props.albumName, photo.name);
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

// SSE Integration
const startProcessingListener = (jobId) => {
  // Prevent multiple SSE connections to the same job
  if (processingJobId.value === jobId && sseService) {
    console.log('[ALBUM VIEWER DEBUG] Already connected to job:', jobId);
    return;
  }

  processingJobId.value = jobId;
  processingNotifications.value = true;
  processingStatus.value = "Starting photo processing...";

  sseService = new SSEService(
    apiService,
    jobId,
    handleProcessingUpdate,
    () => {}
  );
  sseService.start();
  console.log('[ALBUM VIEWER DEBUG] Started processing listener for job:', jobId);
};

const stopProcessingListener = () => {
  sseService?.stop();
  sseService = null;
  processingNotifications.value = false;
  processingStatus.value = "";
  processingJobId.value = null;
  console.log('[ALBUM VIEWER DEBUG] Stopped processing listener');
};

const processingProgress = ref(0);

const handleProcessingUpdate = (data) => {
  console.log('[ALBUM VIEWER DEBUG] Processing update:', data.type, data);

  switch (data.type) {
    case "connected":
      processingStatus.value = "Connected to photo processing service...";
      processingProgress.value = 0;
      break;

    case "started":
      processingStatus.value = data.message || `Processing started for ${data.progress?.total || 0} files...`;
      processingProgress.value = 0;
      break;

    case "progress":
      if (data.progress) {
        const { current, total, percentage, uploaded, failed, lastUploaded, lastFailed } = data.progress;

        // Show detailed progress status
        let statusText = `Processing: ${percentage}% complete`;
        statusText += ` (${current}/${total} files)`;

        if (uploaded > 0 || failed > 0) {
          const parts = [];
          if (uploaded > 0) parts.push(`${uploaded} successful`);
          if (failed > 0) parts.push(`${failed} failed`);
          statusText += ` - ${parts.join(', ')}`;
        }

        processingStatus.value = statusText;
        processingProgress.value = percentage;

        console.log(`[ALBUM VIEWER DEBUG] Progress: ${uploaded} uploaded, ${failed} failed`);

        if (lastUploaded) {
          console.log(`[ALBUM VIEWER DEBUG] ✓ Processed: ${lastUploaded}`);
        }
        if (lastFailed) {
          console.log(`[ALBUM VIEWER DEBUG] ✗ Failed: ${lastFailed}`);
        }
      } else {
        processingStatus.value = data.message || "Processing photos...";
      }
      break;
    case "complete":
      if (data.results) {
        const { uploaded, failed } = data.results;
        let completeMessage = `Photo processing complete! 🎉`;

        if (failed > 0) {
          completeMessage += ` (${uploaded} uploaded, ${failed} failed)`;
        } else {
          completeMessage += ` All ${uploaded} photos processed successfully!`;
        }

        processingStatus.value = completeMessage;
      } else {
        processingStatus.value = "Photo processing complete! 🎉";
      }

      // Reset upload state
      if (pendingJobId.value) {
        emit('uploadComplete', pendingJobId.value);
      }

      showProcessingCompleteNotification();
      setTimeout(async () => {
        await refreshAlbum();
        stopProcessingListener();
      }, 2000);
      break;
    case "failed":
      if (data.error) {
        processingStatus.value = `Photo processing failed: ${data.error}`;
      } else {
        processingStatus.value = "Photo processing failed. Please try again.";
      }
      setTimeout(() => stopProcessingListener(), 5000);
      break;
    default:
      processingStatus.value = data.message || "Processing photos...";
  }
};

const showProcessingCompleteNotification = () => {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Photo Processing Complete!", {
      body: "Your photos are now ready to view in the album.",
      icon: "/favicon.ico",
    });
  }
};

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
  stopProcessingListener();
});
</script>
