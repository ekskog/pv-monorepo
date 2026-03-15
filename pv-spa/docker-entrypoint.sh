#!/bin/sh
set -e

echo "Starting HBVU PHOTOS Frontend..."
echo "Injecting runtime environment variables..."

# Create env-config.js map from environment variables
cat <<EOF > /usr/share/nginx/html/env-config.js
window.__ENV__ = {
  API_URL: "${API_URL}",
  APP_TITLE: "${APP_TITLE}",
  APP_DESCRIPTION: "${APP_DESCRIPTION}",
  ENABLE_USER_MANAGEMENT: "${ENABLE_USER_MANAGEMENT}",
  ENABLE_ALBUM_SHARING: "${ENABLE_ALBUM_SHARING}",
  ENABLE_PHOTO_COMMENTS: "${ENABLE_PHOTO_COMMENTS}",
  MAX_UPLOAD_SIZE: "${MAX_UPLOAD_SIZE}",
  THUMBNAIL_QUALITY: "${THUMBNAIL_QUALITY}",
  LAZY_LOADING: "${LAZY_LOADING}",
  DEBUG_MODE: "${DEBUG_MODE}",
  LOG_LEVEL: "${LOG_LEVEL}",
  TURNSTILE_SITE_KEY: "${TURNSTILE_SITE_KEY}"
};
EOF

echo "Starting Nginx..."
exec nginx -g "daemon off;"
