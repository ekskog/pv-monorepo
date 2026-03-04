<template>
  <div v-if="visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
    @click="$emit('close')">
    <div class="bg-white rounded-xl p-8 w-full max-w-md shadow-xl mx-4" @click.stop>
      <h3 class="text-lg font-semibold text-gray-800 mb-6">Create New Album</h3>
      <div class="mb-6">
        <label for="albumName" class="block mb-2 font-medium text-gray-800">Album Name:</label>
        <input id="albumName" v-model="albumName" type="text" placeholder="Enter album name..."
          @keyup.enter="handleCreate" ref="albumNameInput"
          class="w-full px-4 py-3 border border-gray-300 rounded-md text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
      </div>
      <div class="mb-6">
        <label for="albumDescription" class="block mb-2 font-medium text-gray-800">Description (optional):</label>
        <textarea 
          id="albumDescription" 
          v-model="albumDescription" 
          placeholder="Enter album description..."
          rows="3"
          class="w-full px-4 py-3 border border-gray-300 rounded-md text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none"
        ></textarea>
      </div>
      <div class="mb-6">
        <label for="albumMonth" class="block mb-2 font-medium text-gray-800">Month:</label>
        <select id="albumMonth" v-model="albumMonth"
          class="w-full px-4 py-3 border border-gray-300 rounded-md text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
          <option value="">Select month...</option>
          <option value="01">January</option>
          <option value="02">February</option>
          <option value="03">March</option>
          <option value="04">April</option>
          <option value="05">May</option>
          <option value="06">June</option>
          <option value="07">July</option>
          <option value="08">August</option>
          <option value="09">September</option>
          <option value="10">October</option>
          <option value="11">November</option>
          <option value="12">December</option>
        </select>
      </div>
      <div class="mb-6">
        <label for="albumYear" class="block mb-2 font-medium text-gray-800">Year:</label>
        <input id="albumYear" v-model="albumYear" type="number" placeholder="Enter year (e.g., 2025)" min="1900" max="2100"
          class="w-full px-4 py-3 border border-gray-300 rounded-md text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
      </div>
      <div class="flex justify-end gap-4 flex-wrap sm:flex-nowrap">
        <button @click="$emit('close')"
          class="bg-gray-100 text-gray-800 border border-gray-300 px-4 py-3 rounded-md text-sm transition hover:bg-gray-200 min-w-[80px]">
          Cancel
        </button>
        <button @click="handleCreate" :disabled="!albumName.trim() || creating"
          class="bg-blue-500 text-white px-4 py-3 rounded-md text-sm font-semibold shadow-md transition hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px]">
          {{ creating ? 'Creating...' : 'Create Album' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  creating: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['create', 'close'])

// Reactive state
const albumName = ref('')
const albumDescription = ref('')
const albumMonth = ref('')
const albumYear = ref('')
const albumNameInput = ref(null)

// Methods
const handleCreate = () => {
  if (!albumName.value.trim()) return

  emit('create', {
    name: albumName.value.trim(),
    description: albumDescription.value.trim() || null,
    month: albumMonth.value || null,
    year: albumYear.value || null
  })
}

const resetForm = () => {
  albumName.value = ''
  albumDescription.value = ''
  albumMonth.value = ''
  albumYear.value = ''
}

// Focus input when dialog opens
const focusInput = async () => {
  await nextTick()
  if (albumNameInput.value) {
    albumNameInput.value.focus()
  }
}

watch(() => props.visible, (newVal) => {
  if (newVal) {
    resetForm()
    focusInput()
  }
})
</script>

<style scoped>
/* Ensure buttons have proper touch targets for mobile */
button {
  min-height: 44px;
}

/* Smooth transitions */
.transition {
  transition: all 0.2s ease-in-out;
}
</style>