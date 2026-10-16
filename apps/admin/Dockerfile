# syntax=docker/dockerfile:1

# Build from the repository root so the workspace lockfile is in the context:
#   docker build -f apps/admin/Dockerfile -t modelvend-admin .
# Dockerfile.dockerignore next to this file trims the context to this app.

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace apps/admin

FROM deps AS builder
COPY apps/admin apps/admin
# NEXT_PUBLIC_* values are inlined at build time; ADMIN_API_URL is read at runtime.
ARG NEXT_PUBLIC_CONSOLE_NAME
ARG NEXT_PUBLIC_CONSOLE_URL
ARG NEXT_PUBLIC_API_BASE_URL
RUN npm run build --workspace apps/admin

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
# The standalone output mirrors the workspace layout (apps/admin/server.js plus the traced root node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
