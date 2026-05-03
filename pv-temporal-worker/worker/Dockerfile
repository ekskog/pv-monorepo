FROM node:22-slim

WORKDIR /app

# Set environment to avoid debconf warnings
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
    
# Install necessary system dependencies for Temporal native bindings
RUN apt-get update && apt-get install -y \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Copy package files
COPY --chown=node:node package*.json ./

# Install dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Clean up source files
RUN rm -rf src tsconfig.json

USER node

# Run the worker
CMD ["node", "dist/index.js"]