FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

# Workspace install — copy package.json + lock + every dependent package
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/realestate ./packages/realestate

# `npm install` (not ci) — package-lock may not yet have realestate entry
# until we regenerate it on the host. Workspace deps resolved from source.
RUN npm install --workspaces --include-workspace-root --legacy-peer-deps

RUN npm run build --workspace=@czagents/shared
RUN npm run build --workspace=@czagents/realestate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/realestate/dist ./packages/realestate/dist
COPY --from=builder /app/packages/realestate/package.json ./packages/realestate/package.json

ENV PORT=3036
EXPOSE 3036

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3036/health || exit 1

CMD ["node", "packages/realestate/dist/http.js"]
