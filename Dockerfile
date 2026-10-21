# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && pnpm --filter web build

# ── runtime: API serwuje również zbudowany frontend ─────────────────────────
FROM node:22-alpine
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app /app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then npx ts-node prisma/seed.ts; fi && node dist/main"]
