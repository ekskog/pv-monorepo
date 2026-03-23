FROM node:22-alpine AS production

RUN apk add --no-cache \
    vips \
    libc6-compat \
    perl

WORKDIR /app

COPY --chown=1001:1001 package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=1001:1001 src/ ./src/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S pv -u 1001 -G nodejs

USER pv

EXPOSE 3000

CMD ["npm", "start"]