# PhotoVault Frontend Dockerfile
# Multi-stage build with runtime environment variable support

# Build stage
FROM node:18-alpine AS build-stage

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Accept build-time environment variables (only API URL needed)
ARG VITE_API_URL=https://vault-api.ekskog.net

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL

# Declare the build argument
ARG VITE_TURNSTILE_SITE_KEY

# Make it available as an environment variable inside the container
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN echo "Turnstile key length: ${#VITE_TURNSTILE_SITE_KEY}"


# Build the app
RUN npm run build


# Production stage
FROM nginx:alpine AS production-stage

# Install envsubst for runtime environment variable substitution
RUN apk add --no-cache gettext

# Copy built app from build stage
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create a startup script that performs runtime environment variable substitution
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'echo "Starting EKSKOG PHOTOS Frontend with runtime env injection..."' >> /docker-entrypoint.sh && \
    echo 'set -e' >> /docker-entrypoint.sh && \
    echo '# List of variables to substitute (add others as needed)' >> /docker-entrypoint.sh && \
    echo 'VARS="\$VITE_API_URL \$VITE_AUTH_ENDPOINT \$VITE_USER_ENDPOINT \$VITE_JWT_SECRET \$VITE_SESSION_TIMEOUT \$VITE_API_TIMEOUT"' >> /docker-entrypoint.sh && \
    echo 'echo "Injecting runtime variables: $VARS"' >> /docker-entrypoint.sh && \
    echo 'find /usr/share/nginx/html -type f -name "*.js" -exec sh -c "envsubst \"$VARS\" < {} > {}.tmp && mv {}.tmp {}" \;' >> /docker-entrypoint.sh && \
    echo 'echo "Starting Nginx..."' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
