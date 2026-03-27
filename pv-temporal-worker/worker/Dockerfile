FROM node:22-slim AS builder

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install CA certs
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files and install (dev deps for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Bundle workflows at build time to avoid runtime bundling noise
# This produces dist/workflows.bundle.js and avoids webpack output at startup.
RUN npx @temporalio/worker bundle -o dist/workflows.bundle.js dist/workflows/image-batch-workflow.js || true

FROM node:22-slim AS runtime
WORKDIR /app

# Minimal runtime deps
COPY package*.json ./
RUN npm ci --production

# Copy built app and production node_modules from builder
COPY --from=builder /app/dist ./dist

# Set production env to reduce log verbosity
ENV NODE_ENV=production

# If the build created a pre-bundled workflows file, prefer that path.
ENV WORKFLOWS_BUNDLE_PATH=/app/dist/workflows.bundle.js

CMD ["node", "dist/index.js"]