# syntax=docker/dockerfile:1

# =====================================================================
# Canvas Design Editor — production Docker image
#
# Three stages so the final image only ships the compiled app, not the
# whole Next.js build toolchain:
#   1. deps     installs node_modules from the lockfile
#   2. builder  runs `next build` (output: "standalone" in next.config.js)
#   3. runner   copies just the standalone server + static assets
# =====================================================================

ARG NODE_VERSION=20-alpine

# ---------------------------------------------------------------------
# 1. deps — install dependencies exactly as locked
# ---------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# libc6-compat is needed on Alpine for some native Node addons.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
# Falls back to `npm install` if no lockfile has been committed yet.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------------------------------------------------------------------
# 2. builder — compile the Next.js app
# ---------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------
# 3. runner — minimal production image
# ---------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user inside the container.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# `output: "standalone"` traces only the production dependencies a
# request actually needs into .next/standalone, including a
# self-contained server.js — no full node_modules copy required.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
