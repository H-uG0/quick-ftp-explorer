# Quick FTP Explorer - production image. Setup: docs/deployment.md.
# Node.js LTS on Alpine: no build step, one runtime dependency, plus ffmpeg.
FROM node:24-alpine

# Converts the camera clips browsers can't play (server/video.js).
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so code changes don't invalidate this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Only what the server runs. Owned by root, so the app can't modify itself.
COPY server ./server
COPY public ./public

# Accounts, shortcuts, session secret and audit log live on a volume here.
RUN mkdir -p /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "server/index.js"]
