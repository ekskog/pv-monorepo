FROM node:22-bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips \
    perl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src/ ./src/

USER node

EXPOSE 3000

CMD ["npm", "start"]
