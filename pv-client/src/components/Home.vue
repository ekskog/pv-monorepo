<template>
  <div class="p-8 max-w-6xl mx-auto sm:p-4 xs:p-3">
    <div class="text-center py-16 border-b border-gray-300 mb-12 sm:py-10 sm:mb-8 xs:py-8 xs:mb-6">
      <h1 class="text-5xl font-bold text-gray-800 mb-4 bg-gradient-to-br from-blue-500 to-blue-700 bg-clip-text text-transparent sm:text-4xl xs:text-3xl">
        EKSKOG GALLERY
      </h1>
      <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed px-4 sm:text-lg sm:px-4 xs:text-base">
        Minimalist photo gallery and storage management
      </p>
    </div>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-8 mt-8 sm:grid-cols-1 sm:gap-6 xs:gap-4 xs:mt-6">
      <div class="bg-white border border-gray-300 rounded-xl p-8 text-center transition-all duration-200 cursor-pointer hover:border-blue-500 hover:shadow-[0_4px_16px_rgba(33,150,243,0.1)] hover:-translate-y-0.5 sm:p-6 xs:p-5" @click="$emit('navigate', 'albums')">
        <div class="text-5xl mb-4 text-red-500 sm:text-4xl xs:text-4xl">
          <i class="fas fa-layer-group"></i>
        </div>
        <h3 class="text-xl font-semibold text-gray-800 mb-4 sm:text-lg xs:text-lg">Organize Albums</h3>
        <p class="text-gray-600 leading-relaxed sm:text-sm xs:text-sm">
          Create and manage albums to organize your photos efficiently.
        </p>
      </div>
      <div class="bg-white border border-gray-300 rounded-xl p-8 text-center transition-all duration-200 sm:p-6 xs:p-5">
        <div class="text-5xl mb-4 text-blue-500 sm:text-4xl xs:text-4xl">
          <i class="fas fa-chart-bar"></i>
        </div>
        <h3 class="text-xl font-semibold text-gray-800 mb-4 sm:text-lg xs:text-lg">Gallery Statistics</h3>
        <p class="text-gray-600 leading-relaxed sm:text-sm xs:text-sm">
          See file counts, sizes, and type breakdowns.
        </p>
        <button class="btn-primary mt-4" @click="showStats = !showStats">
          {{ showStats ? 'Hide Statistics' : 'Show Statistics' }}
        </button>
        <div v-if="showStats" class="mt-6 text-left">
          <BucketStats noBorder />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BucketStats from './BucketStats.vue'
// Emits
defineEmits(['navigate'])
const showStats = ref(false)
</script>