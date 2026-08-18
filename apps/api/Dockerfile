FROM node:20-alpine AS base
RUN npm install -g turbo@2

# ── Pruner stage ──────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=@docsaarthi/api --docker

# ── Installer stage ───────────────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci

COPY --from=pruner /app/out/full/ .
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN turbo run build --filter=@docsaarthi/api

# ── Runner stage ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=installer --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=installer --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=nestjs:nodejs /app/packages ./packages

USER nestjs

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "dist/main"]
