<template>
  <div class="pb-3 sm:pb-5 border-b border-gray-200">

    <!-- Row 1: back · title + count · actions -->
    <div class="flex items-center gap-2 mb-2 sm:mb-3">

      <button v-if="!isPublic" @click="$emit('back')"
        class="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition">
        <i class="fas fa-arrow-left text-sm"></i>
      </button>

      <div class="flex-1 min-w-0 flex items-baseline gap-2">
        <h2 class="text-lg sm:text-xl font-semibold text-gray-900 truncate">
          {{ cleanAlbumName }}
        </h2>
        <span class="text-sm text-gray-500 whitespace-nowrap flex-shrink-0">
          {{ photoCount }} {{ mediaType === 'images' ? 'photos' : 'videos' }}
        </span>
      </div>

      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button v-if="!isPublic" @click="$emit('refresh')" :disabled="loading"
          class="h-9 w-9 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition disabled:opacity-50"
          title="Refresh">
          <i class="fas fa-sync-alt text-sm" :class="{ 'fa-spin': loading }"></i>
        </button>
        <button @click="handleShare"
          class="h-9 w-9 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition"
          title="Share">
          <i class="fas fa-share-alt text-sm"></i>
        </button>
        <button v-if="canUploadPhotos" @click="$emit('upload')"
          class="h-9 w-9 flex items-center justify-center rounded-md bg-blue-500 hover:bg-blue-600 text-white transition"
          title="Upload">
          <i class="fas fa-plus text-sm"></i>
        </button>
        <button @click="$emit('metadataToggle')"
          class="hidden sm:flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition"
          :title="showMetadata ? 'Hide Metadata' : 'Show Metadata'">
          <i :class="showMetadata ? 'fas fa-eye-slash' : 'fas fa-eye'" class="text-sm"></i>
        </button>
      </div>
    </div>

    <!-- Row 2: media type · sort -->
    <div class="flex items-center justify-between gap-2">

      <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button @click="$emit('mediaTypeChange', 'images')" :class="[
          'px-2.5 py-1 text-sm rounded-md transition-colors flex items-center gap-1.5',
          mediaType === 'images' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        ]">
          <i class="fas fa-image text-xs"></i> Images
        </button>
        <button @click="$emit('mediaTypeChange', 'videos')" :class="[
          'px-2.5 py-1 text-sm rounded-md transition-colors flex items-center gap-1.5',
          mediaType === 'videos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        ]">
          <i class="fas fa-video text-xs"></i> Videos
        </button>
      </div>

      <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button @click="$emit('sortChange', 'chronological')" :class="[
          'px-2.5 py-1 text-sm rounded-md transition-colors',
          sortOrder === 'chronological' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        ]">Oldest</button>
        <button @click="$emit('sortChange', 'reverse')" :class="[
          'px-2.5 py-1 text-sm rounded-md transition-colors',
          sortOrder === 'reverse' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        ]">Newest</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import urlService from "../services/urlService.js";

const props = defineProps({
  albumName: { type: String, required: true },
  photoCount: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  canUploadPhotos: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  mediaType: { type: String, default: 'images' },
  showMetadata: { type: Boolean, default: true },
  sortOrder: { type: String, default: 'reverse' },
});

const emit = defineEmits(["back", "refresh", "upload", "mediaTypeChange", "metadataToggle", "sortChange"]);

const cleanAlbumName = computed(() => {
  const match = props.albumName.match(/^(.*)\.(\d{2})\/$/);
  return match ? `${match[1]} (${match[2]})` : props.albumName;
});

const handleShare = async () => {
  const shareUrl = urlService.generateShareableUrl(props.albumName, true);
  if (navigator.share) {
    try {
      await navigator.share({ title: props.albumName, url: shareUrl });
    } catch {
      // user cancelled or not supported
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    } catch {
      // clipboard not available
    }
  }
};
</script>
