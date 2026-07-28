# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t aff-cms-api .

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages
RUN npm ci -w @aff-cms/api --include-workspace-root

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY packages ./packages
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV API_PORT=3001
WORKDIR /app/apps/api

RUN apk add --no-cache wget \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && chown -R nestjs:nodejs /app/apps/api

USER nestjs
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
