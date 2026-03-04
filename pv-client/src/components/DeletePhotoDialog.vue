<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" @click="onCancel">
    <div class="bg-white rounded-xl p-8 min-w-96 max-w-[90vw] max-h-[90vh] overflow-y-auto shadow-2xl" @click.stop>
      <h3 class="text-xl font-semibold text-gray-800 mb-6">Delete Photo</h3>
      <p class="text-gray-700 mb-4 leading-relaxed">
        Are you sure you want to delete "<strong>{{ photoName }}</strong>"?
      </p>
      <p class="text-orange-600 text-sm mb-8 flex items-center gap-2">
        <i class="fas fa-exclamation-triangle"></i>
        This action cannot be undone.
      </p>
      <div class="flex gap-4 justify-end">
        <button class="bg-gray-100 text-gray-700 border border-gray-300 px-6 py-3 rounded-md hover:bg-gray-200 transition-colors" @click="onCancel">
          Cancel
        </button>
        <button class="bg-red-500 text-white px-6 py-3 rounded-md hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" @click="onDelete" :disabled="deleting">
          {{ deleting ? 'Deleting...' : 'Delete Photo' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  photoName: String,
  deleting: Boolean
})
const emit = defineEmits(['cancel', 'delete'])
const onCancel = () => emit('cancel')
const onDelete = () => emit('delete')
</script>
