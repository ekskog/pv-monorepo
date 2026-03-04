# HEIC Integration Manual Test Plan

## Overview
This test plan verifies that the new server-side HEIC processing is working correctly and provides the expected 50x performance improvement.

## Prerequisites
- Backend server running on port 3001 with HEIC processing enabled
- Frontend server running on port 5173
- HEIC test images available (iPhone photos work best)

## Test Scenarios

### 1. Upload HEIC Files Test
**Objective**: Verify server-side HEIC processing during upload

**Steps**:
1. Open PhotoVault frontend (http://localhost:5173)
2. Navigate to an album or create a new one
3. Click "Add Photos" 
4. Select HEIC files from iPhone/device
5. Upload the files

**Expected Results**:
- Upload completes successfully
- Backend logs show "🔄 Processing HEIC file: [filename]"
- Backend logs show "✅ HEIC processing complete: [filename] (4 variants)"
- Multiple variants created: original.heic, original_thumbnail.jpeg, original_medium.jpeg, original_large.jpeg

### 2. Display Performance Test
**Objective**: Verify fast HEIC display using server variants

**Steps**:
1. Navigate to album with uploaded HEIC files
2. Observe loading time for HEIC images in grid view
3. Check browser developer console for logs
4. Open lightbox view of HEIC images

**Expected Results**:
- HEIC images load in ~100ms (vs 2-5 seconds with client conversion)
- Console shows: "✅ Using server-processed HEIC variant: [filename]_thumbnail.jpeg"
- No client-side conversion should occur for newly uploaded files
- Images display immediately without conversion loading states

### 3. Fallback Test
**Objective**: Verify graceful fallback for old HEIC files without server variants

**Steps**:
1. Upload HEIC files using old system (if available)
2. View these files in the updated frontend
3. Check console logs for fallback behavior

**Expected Results**:
- Console shows: "⚠️ No server variants found for [filename], falling back to client conversion"
- Client-side conversion still works as backup
- Images eventually display after conversion

### 4. Error Handling Test
**Objective**: Verify proper error handling for HEIC processing failures

**Steps**:
1. Try uploading corrupted HEIC files
2. Test with very large HEIC files
3. Test network interruptions during upload

**Expected Results**:
- Graceful error messages displayed
- Fallback mechanisms work properly
- No application crashes

## Performance Benchmarks

### Before (Client-side conversion):
- HEIC loading time: 2-5 seconds
- CPU usage: High during conversion
- Memory usage: Spikes during conversion
- User experience: Loading spinners, delays

### After (Server-side variants):
- HEIC loading time: ~100ms (50x improvement)
- CPU usage: Minimal
- Memory usage: Stable
- User experience: Instant display

## Test Data Collection

### Upload Test Results:
- [ ] HEIC file uploaded successfully
- [ ] Server variants created (thumbnail, medium, large)
- [ ] Original HEIC preserved
- [ ] Metadata preserved

### Display Test Results:
- [ ] Grid view loads HEIC thumbnails instantly
- [ ] Lightbox loads HEIC medium quality quickly
- [ ] No client-side conversion triggered
- [ ] Console shows server variant usage

### Performance Test Results:
- Time to display HEIC thumbnail: ___ms
- Time to display HEIC full view: ___ms
- Browser memory usage: ___MB
- No conversion loading states visible: [ ]

## Browser Console Commands

Run these in browser console during testing:

```javascript
// Check conversion states
console.log('HEIC States:', window.heicConversionStates)

// Check converted images cache
console.log('Converted Images:', window.convertedImages)

// Monitor network requests for HEIC variants
performance.getEntriesByType('resource').filter(r => r.name.includes('heic') || r.name.includes('jpeg'))
```

## Backend Log Monitoring

Watch for these log messages:

```bash
# Success patterns
✅ HEIC support: Available
🔄 Processing HEIC file: [filename]
✅ HEIC processing complete: [filename] (4 variants)

# Error patterns
❌ HEIC processing failed for [filename]:
❌ HEIC support: Not available
```

## Manual Test Checklist

### Upload Process:
- [ ] Can select HEIC files from file picker
- [ ] Upload progress shows correctly
- [ ] Upload completes without errors
- [ ] Backend creates multiple variants
- [ ] Files appear in album immediately

### Display Process:
- [ ] HEIC thumbnails load instantly in grid
- [ ] No "Converting HEIC..." loading states
- [ ] Lightbox opens HEIC images quickly
- [ ] Image quality is good
- [ ] Navigation between HEIC images is smooth

### Fallback Process:
- [ ] Old HEIC files without variants still work
- [ ] Client conversion activates when needed
- [ ] Error states display appropriately
- [ ] Download original HEIC still works

## Troubleshooting

### If HEIC images don't display:
1. Check backend logs for processing errors
2. Verify Sharp library installation
3. Check MinIO bucket for variant files
4. Test with different HEIC files

### If performance is still slow:
1. Verify server variants are being used (check console)
2. Check network tab for request sizes
3. Ensure thumbnails are being loaded first

### If uploads fail:
1. Check file size limits
2. Verify HEIC detection logic
3. Check Sharp library HEIC support
4. Review backend error logs

## Success Criteria

✅ **Test passes if**:
- New HEIC uploads create server variants
- HEIC images display in <200ms
- No client conversion for new uploads
- Fallback works for old files
- Error handling is graceful

❌ **Test fails if**:
- HEIC images still take >1 second to display
- Client conversion happens for new uploads
- Upload process fails for HEIC files
- Application crashes or shows errors
