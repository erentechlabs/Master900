# syntax=docker/dockerfile:1.7
# Multi-stage build for Microsoft Fundamentals Academy.
#   runner - minimal production image (Next.js standalone server, non-root)
#   tools  - full toolchain for migrations, seeding and the background worker

ARG NODE_VERSION=24

# ---------------------------------------------------------------- dependencies
FROM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate` for this image's platform.
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM deps AS builder
COPY . .
# The public URL decides whether HTTPS-only headers (HSTS, upgrade-insecure-requests) are emitted.
ARG NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_URL=${NEXTAUTH_URL} NODE_ENV=production
RUN npm run build

# ---------------------------------------------------------------- tools (migrate / seed / worker)
FROM builder AS tools
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/app/storage

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
