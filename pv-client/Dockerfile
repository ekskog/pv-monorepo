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

# Create a simple startup script
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'echo "Starting HBVU PHOTOS Frontend..."' >> /docker-entrypoint.sh && \
    echo 'nginx -g "daemon off;"' >> /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
