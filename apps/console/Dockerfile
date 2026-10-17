# syntax=docker/dockerfile:1

# Build from the repository root so the workspace lockfile is in the context:
#   docker build -f apps/console/Dockerfile -t modelvend-console .
# Dockerfile.dockerignore next to this file trims the context to this app.

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/console/package.json apps/console/
# Workspace packages the app depends on: npm links them, so their manifests must be here before npm ci.
COPY packages/config-eslint/package.json packages/config-eslint/
COPY packages/config-typescript/package.json packages/config-typescript/
RUN npm ci --workspace apps/console

FROM deps AS builder
COPY packages/config-eslint packages/config-eslint
COPY packages/config-typescript packages/config-typescript
COPY apps/console apps/console
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_DOCS_URL
RUN npm run build --workspace apps/console

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
# The standalone output mirrors the workspace layout (apps/console/server.js plus the traced root node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/public ./apps/console/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/console/server.js"]
