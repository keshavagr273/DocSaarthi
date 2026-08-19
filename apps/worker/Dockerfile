# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl vips-dev

FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @docsaarthi/worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci

COPY --from=builder /app/out/full/ .
RUN npx prisma generate --schema=./packages/database/prisma/schema.prisma
RUN npm run build --workspace=@docsaarthi/worker

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker
USER worker

COPY --from=installer --chown=worker:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=installer --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=worker:nodejs /app/packages ./packages

CMD ["node", "apps/worker/dist/main.js"]
