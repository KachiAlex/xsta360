# ---- deps stage ----
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
# Install build deps for sharp (native image processing used by @xenova/transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
COPY .npmrc .npmrc
# Install with build scripts allowed (sharp needs native binary)
RUN pnpm install --frozen-lockfile

# ---- builder stage ----
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL="postgresql://xsta360:xsta360@db:5432/xsta360"
ARG SESSION_SECRET="placeholder-for-build"
ARG APP_URL="http://localhost:3000"
ENV DATABASE_URL=$DATABASE_URL
ENV SESSION_SECRET=$SESSION_SECRET
ENV APP_URL=$APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Pre-download the Whisper model so the first request doesn't timeout.
# This downloads ~40MB to /tmp/transformers-cache.
RUN node -e "\
  import('@xenova/transformers').then(async ({ pipeline, env }) => { \
    env.allowRemoteModels = true; \
    env.cacheDir = '/tmp/transformers-cache'; \
    console.log('Pre-downloading Whisper model...'); \
    await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true }); \
    console.log('Whisper model cached.'); \
  }).catch((e) => { console.error('Model pre-download failed (non-fatal):', e.message); process.exit(0); }); \
"

# ---- runner stage ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy built app + all source for migrations
COPY --from=builder --chown=nextjs:nodejs /app ./

# Copy pre-downloaded Whisper model cache
COPY --from=builder --chown=nextjs:nodejs /tmp/transformers-cache /tmp/transformers-cache

# Install postgresql-client for healthcheck + pg_isready
# Install libgomp1 + libstdc++6 for ONNX Runtime (Whisper transcription)
# Install libvips for sharp (used by @xenova/transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libgomp1 \
    libstdc++6 \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npx", "next", "start"]
