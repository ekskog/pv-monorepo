FROM node:22-alpine AS production

RUN apk add --no-cache \
    vips \
    libc6-compat \
    perl

WORKDIR /app

COPY --chown=1000:1000 package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=1000:1000 src/ ./src/

RUN addgroup -g 1000 -S nodejs && \
    adduser -S pv -u 1000 -G nodejs

USER pv

EXPOSE 3000

CMD ["npm", "start"]