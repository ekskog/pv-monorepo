<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click="$emit('close')">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Share Album</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mb-4">
        <p class="text-sm text-gray-600 mb-2">Share this album with others:</p>
        <div class="flex items-center gap-2">
          <input
            ref="urlInput"
            type="text"
            :value="shareUrl"
            readonly
            class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            @click="copyToClipboard"
            class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <!-- Social sharing buttons (optional) -->
      <div class="flex gap-2 mb-4">
        <button
          @click="shareVia('whatsapp')"
          class="flex-1 bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 transition-colors text-sm"
        >
          WhatsApp
        </button>
        <button
          @click="shareVia('email')"
          class="flex-1 bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-colors text-sm"
        >
          Email
        </button>
      </div>

      <!-- QR Code option -->
      <div class="pt-4 border-t border-gray-200">
        <button
          @click="generateQR"
          class="w-full text-gray-600 hover:text-gray-800 text-sm py-2"
        >
          📱 Generate QR Code
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  albumName: String,
  shareUrl: String
})

const emit = defineEmits(['close'])

const copied = ref(false)
const urlInput = ref(null)

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.shareUrl)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    // Fallback for older browsers
    urlInput.value.select()
    document.execCommand('copy')
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

const shareVia = (platform) => {
  const url = encodeURIComponent(props.shareUrl)
  const text = encodeURIComponent(`Check out this photo album: ${props.albumName}`)
  
  switch (platform) {
    case 'whatsapp':
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank')
      break
    case 'email':
      window.open(`mailto:?subject=Photo Album: ${encodeURIComponent(props.albumName)}&body=${text}%20${url}`)
      break
  }
}

const generateQR = () => {
  // Using a free QR code service
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(props.shareUrl)}`
  window.open(qrUrl, '_blank')
}
</script>