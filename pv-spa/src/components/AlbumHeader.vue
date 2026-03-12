<template>
  <div
    class="flex flex-col space-y-6 pb-8 border-b border-gray-200 dark:border-gray-700"
  >
    <!-- Back Button -->
    <div class="flex items-center gap-3 justify-start">
      <button
        v-if="!isPublic"
        class="flex-shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-400 px-4 py-2 rounded-md text-sm transition h-10 w-12"
        @click="$emit('back')"
      >
        <i class="fas fa-arrow-left"></i>
      </button>
      <!-- Header Actions -->
      <div class="flex items-center gap-3 flex-shrink-0">
        <button
          v-if="!isPublic"
          class="bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-400 px-4 py-2 rounded-md text-sm transition flex items-center justify-center disabled:opacity-60 h-10 w-12"
          @click="$emit('refresh')"
          :disabled="loading"
          title="Refresh album"
        >
          <i class="fas fa-sync-alt"  :class="{ 'fa-spin': loading }"></i>
        </button>

         <!-- Icon-only Share Button -->
        <button
          @click="handleShare"
          class="flex bg-blue-100 hover:bg-blue-200 text-gray-800 border border-gray-400 px-4 py-2 rounded-md text-sm transition items-center justify-center h-10 w-12"
          title="Share this album"
        >
          <i class="fas fa-share-alt"></i>
        </button>

        <button
          v-if="canUploadPhotos"
          class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold transition disabled:opacity-60 h-10 w-12"
          @click="$emit('upload')"
        >
          <i class="fas fa-plus"></i>
        </button>
       
      </div>
    </div>

       <!-- Album Info and Media Type Selector -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3 flex-grow min-w-0">
        <h2
          class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 truncate"
        >
          <i class="fas fa-images text-blue-500"></i> {{ cleanAlbumName }}
        </h2>
        <span class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {{ photoCount }} {{ mediaType === 'images' ? 'photos' : 'videos' }}
        </span>
      </div>

      <!-- Media Type Selector -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Show:</span>
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button 
            @click="$emit('mediaTypeChange', 'images')"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-2',
              mediaType === 'images' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            ]"
          >
            <i class="fas fa-image"></i>
            Images
          </button>
          <button 
            @click="$emit('mediaTypeChange', 'videos')"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-2',
              mediaType === 'videos' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            ]"
          >
            <i class="fas fa-video"></i>
            Videos
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import urlService from "../services/urlService.js";

const props = defineProps({
  albumName: { type: String, required: true },
  photoCount: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  canUploadPhotos: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  mediaType: { type: String, default: 'images' }, // 'images' or 'videos'
});

const emit = defineEmits(["back", "refresh", "upload", "mediaTypeChange"]);

const cleanAlbumName = computed(() => {
  const match = props.albumName.match(/^(.*)\.(\d{2})\/$/);
  return match ? `${match[1]} (${match[2]})` : props.albumName;
});

onMounted(() => {
 console.log("[AlbumHeader] Mounted with album:", props.albumName);
});

const handleShare = async () => {
  const shareUrl = urlService.generateShareableUrl(props.albumName, true);
  console.log("[AlbumHeader] Share button clicked");
  console.log("[AlbumHeader] Generated share URL:", shareUrl);

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Shared Album",
        text: `Check out this album: ${props.albumName}`,
        url: shareUrl,
      });
      console.log("[AlbumHeader] Native share triggered");
    } catch (err) {
      console.error("[AlbumHeader] Share failed:", err);
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
      console.log("[AlbumHeader] Fallback: copied to clipboard");
    } catch (err) {
      console.error("[AlbumHeader] Clipboard copy failed:", err);
    }
  }
};
</script>
