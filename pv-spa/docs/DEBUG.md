# Debug Module Usage Guide

The HBVU PHOTOS frontend includes a comprehensive debug module that allows you to control logging output via environment variables, making it easy to debug issues in both development and production environments.

## Environment Variable Configuration

### Kubernetes Deployment

In your Kubernetes deployment, you can control debugging through environment variables:

```yaml
# k8s/deployment.yaml
env:
- name: VITE_DEBUG
  value: "true"  # Enable debug logging
- name: VITE_DEBUG_PATTERN
  value: "hbvu:*"  # Enable all HBVU debug namespaces
```

### Common Debug Patterns

```bash
# Enable all debugging
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:*"

# Enable only lightbox debugging
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:lightbox*"

# Enable API and upload debugging
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:api*,hbvu:upload*"

# Disable all debugging
VITE_DEBUG="false"
```

## Debug Namespaces

The debug module organizes logging into the following namespaces:

### Component Namespaces
- `hbvu:lightbox` - Lightbox operations and navigation
- `hbvu:gallery` - Photo gallery operations
- `hbvu:upload` - File upload operations
- `hbvu:auth` - Authentication operations
- `hbvu:navigation` - App navigation

### API Namespaces
- `hbvu:api:request` - API requests
- `hbvu:api:response` - API responses
- `hbvu:api:error` - API errors

### Performance Namespaces
- `hbvu:performance` - Performance monitoring
- `hbvu:image:loading` - Image loading performance

### General Namespaces
- `hbvu:general` - General application logging
- `hbvu:error` - Error logging
- `hbvu:warning` - Warning logging

## Usage in Code

### Basic Debug Logging

```javascript
import { debugLog, debugLightbox, debugGallery } from '@/services/debug.js'

// Generic debug logging
debugLog('lightbox', 'Opening photo in lightbox', { photoName, index })

// Specific component logging
debugLightbox('Current file showing', { name: photo.name, index })
debugGallery('Files received from backend', fileList)
```

### Error and Warning Logging

```javascript
import { debugError, debugWarn } from '@/services/debug.js'

// Error logging (always shows if debug enabled)
debugError('upload', 'Failed to upload file', error)

// Warning logging
debugWarn('performance', 'Slow image load detected', { loadTime, photoName })
```

### API Debugging

```javascript
import { debugApi } from '@/services/debug.js'

// API request logging
debugApi('request', 'Fetching bucket contents', { bucket, prefix })

// API response logging
debugApi('response', 'Bucket contents received', response)

// API error logging
debugApi('error', 'Request failed', error)
```

### Performance Monitoring

```javascript
import { debugPerformance } from '@/services/debug.js'

const startTime = Date.now()
// ... some operation
const duration = Date.now() - startTime

debugPerformance('Image load completed', { 
  photoName, 
  duration, 
  isSlowLoad: duration > 2000 
})
```

## Debug Panel (Development)

In development mode, a floating debug panel appears in the top-right corner that allows you to:

- View current debug status
- Toggle individual namespaces on/off
- Enable/disable all debugging
- Clear console logs

The debug panel only appears when:
- `VITE_DEBUG="true"` OR
- `VITE_DEBUG_MODE="true"` OR
- `MODE="development"`

## Production Debugging

### Enabling Debug in Production

To enable debugging in a production Kubernetes deployment:

1. Update the deployment:
```bash
kubectl set env deployment/photovault-vue VITE_DEBUG=true VITE_DEBUG_PATTERN="hbvu:*" -n photovault
```

2. Or edit the deployment directly:
```bash
kubectl edit deployment photovault-vue -n photovault
```

3. Pods will automatically restart with debug enabled.

### Disabling Debug in Production

```bash
kubectl set env deployment/photovault-vue VITE_DEBUG=false -n photovault
```

### Checking Current Debug Status

```bash
# Check environment variables
kubectl get deployment photovault-vue -n photovault -o jsonpath='{.spec.template.spec.containers[0].env}'

# Check logs for debug output
kubectl logs -f deployment/photovault-vue -n photovault
```

## Browser Console

When debugging is enabled, you'll see structured log output in the browser console:

```
hbvu:lightbox Current file showing in lightbox +0ms {name: "photo.avif", index: 0}
hbvu:gallery Files received from backend +5ms [{name: "photo1.avif"}, {name: "photo2.avif"}]
hbvu:api:response RAW RESPONSE FROM BACKEND +10ms {success: true, data: {...}}
```

## Best Practices

1. **Use specific namespaces** in production to avoid log noise
2. **Include relevant context** in debug messages
3. **Use debugError for critical issues** that need attention
4. **Monitor performance logs** to identify bottlenecks
5. **Disable debugging** when not needed to improve performance

## Examples

### Debugging Upload Issues
```bash
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:upload*,hbvu:api*"
```

### Debugging Lightbox Problems
```bash
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:lightbox*,hbvu:gallery*"
```

### Performance Monitoring
```bash
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:performance*,hbvu:image*"
```

### Full Debugging
```bash
VITE_DEBUG="true"
VITE_DEBUG_PATTERN="hbvu:*"
```
