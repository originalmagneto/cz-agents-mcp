FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root manifest + shared package first (better layer caching)
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ares ./packages/ares

RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@cz-agents/shared
RUN npm run build --workspace=@cz-agents/ares

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/ares/dist ./packages/ares/dist
COPY --from=builder /app/packages/ares/package.json ./packages/ares/package.json

ENV PORT=3030
EXPOSE 3030
CMD ["node", "packages/ares/dist/http.js"]
