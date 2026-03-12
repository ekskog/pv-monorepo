// Frontend Update Plan for HEIC Optimization
// File: /src/components/AlbumViewer.vue

/* 
STEP 1: Replace current HEIC logic with server-variant detection
Update these functions in AlbumViewer.vue:
*/

// Replace getPhotoUrl function
const getPhotoUrl = (photo) => {
  if (!isHeicFile(photo.name)) {
    return apiService.getObjectUrl(BUCKET_NAME, photo.name)
  }
  
  // For HEIC files, try medium quality server variant first
  const baseName = photo.name.replace(/\.(heic|heif)$/i, '')
  const mediumVariant = `${baseName}_medium.jpeg`
  return apiService.getObjectUrl(BUCKET_NAME, mediumVariant)
}

// Replace getOptimizedPhotoUrl function  
const getOptimizedPhotoUrl = (photo) => {
  if (!isHeicFile(photo.name)) {
    return apiService.getObjectUrl(BUCKET_NAME, photo.name)
  }
  
  // For HEIC files, use thumbnail variant for grid view
  const baseName = photo.name.replace(/\.(heic|heif)$/i, '')
  const thumbnailVariant = `${baseName}_thumbnail.jpeg`
  return apiService.getObjectUrl(BUCKET_NAME, thumbnailVariant)
}

// Update convertHeicImageOnDemand with server-variant check
const convertHeicImageOnDemand = async (photo) => {
  if (heicConversionStates.value[photo.name] === 'success' || 
      heicConversionStates.value[photo.name] === 'loading') {
    return
  }
  
  heicConversionStates.value = { 
    ...heicConversionStates.value, 
    [photo.name]: 'loading' 
  }
  
  try {
    // First, check if server variants exist
    const baseName = photo.name.replace(/\.(heic|heif)$/i, '')
    const mediumVariant = `${baseName}_medium.jpeg`
    
    const serverResponse = await fetch(
      apiService.getObjectUrl(BUCKET_NAME, mediumVariant), 
      { method: 'HEAD' }
    )
    
    if (serverResponse.ok) {
      // Server variant exists - use it!
      const serverUrl = apiService.getObjectUrl(BUCKET_NAME, mediumVariant)
      convertedImages.value = { ...convertedImages.value, [photo.name]: serverUrl }
      heicConversionStates.value = { ...heicConversionStates.value, [photo.name]: 'success' }
      console.log(`✅ Using server-processed variant: ${mediumVariant}`)
      return
    }
    
    // Fallback to client-side conversion (legacy HEIC files)
    console.log(`🔄 Server variant not found, converting client-side: ${photo.name}`)
    
    const response = await fetch(apiService.getObjectUrl(BUCKET_NAME, photo.name))
    if (!response.ok) {
      throw new Error(`Failed to fetch HEIC file: ${response.statusText}`)
    }
    
    const heicBlob = await response.blob()
    
    const convertedBlob = await heic2any({
      blob: heicBlob,
      toType: 'image/jpeg',
      quality: 0.8,
      maxWidth: 800,
      maxHeight: 800
    })
    
    const blobUrl = URL.createObjectURL(convertedBlob)
    convertedImages.value = { ...convertedImages.value, [photo.name]: blobUrl }
    heicConversionStates.value = { ...heicConversionStates.value, [photo.name]: 'success' }
    
  } catch (error) {
    console.error(`❌ HEIC processing failed: ${photo.name}`, error)
    heicConversionStates.value = { ...heicConversionStates.value, [photo.name]: 'error' }
  }
}

/*
STEP 2: Update template to use server variants immediately
Update the img tags in the template:
*/

// For grid view - use optimized (thumbnail) variants
`<img 
  v-if="!isHeicFile(photo.name)"
  :src="getOptimizedPhotoUrl(photo)" 
  :alt="photo.name" 
  @error="handleImageError"
  class="photo-image"
  loading="lazy"
>`

// For HEIC files - try server variant first, fallback to conversion
`<img 
  v-else-if="isHeicFile(photo.name)"
  :src="getOptimizedPhotoUrl(photo)" 
  :alt="photo.name" 
  @error="handleHeicImageError(photo)"
  class="photo-image"
  loading="lazy"
>`

/*
STEP 3: Add error handler for missing server variants
*/
const handleHeicImageError = async (photo) => {
  console.log(`🔄 Server variant failed, falling back to conversion: ${photo.name}`)
  await convertHeicImageOnDemand(photo)
}

/*
IMPLEMENTATION PRIORITY:
1. Update getPhotoUrl and getOptimizedPhotoUrl ⭐⭐⭐
2. Update convertHeicImageOnDemand with server detection ⭐⭐⭐  
3. Update template img tags ⭐⭐
4. Add error handling ⭐
*/
