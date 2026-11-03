# =============================================================================
# KostKas — Multi-Stage Production Dockerfile
# =============================================================================
# Arsitektur: Multi-stage build berbasis Node.js 22 Alpine (ARM64 & AMD64)
# Keamanan: Menjalankan container dengan non-root user (nextjs:nodejs)
# Optimasi: Next.js Standalone Output & Prisma Client terintegrasi
# =============================================================================

# --- STAGE 1: Base Environment ---
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# --- STAGE 2: Dependencies Cache ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- STAGE 3: Build & Asset Optimization ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Siapkan Prisma Schema & Config sebelum generate client
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npx prisma generate

# Salin kode sumber aplikasi
COPY src ./src
COPY public ./public
COPY tsconfig.json ./
COPY next.config.ts ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Jalankan build Next.js (Standalone output diaktifkan di next.config.ts)
RUN npm run build

# --- STAGE 4: Production Runner (Non-Root Minimal Image) ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=320"
ENV NODE_PATH=/usr/local/lib/node_modules

# Pasang curl untuk healthcheck internal serta CLI Prisma untuk auto-migration
RUN apk add --no-cache curl && \
    npm install -g prisma@7.10.1 && \
    npm cache clean --force

# Buat grup dan pengguna non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Salin public assets
COPY --from=builder /app/public ./public

# Salin build standalone dan static files Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Salin kebutuhan Prisma migrations untuk runtime deploy otomatis
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma7.config.ts ./

# Salin entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Healthcheck internal pada endpoint /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
