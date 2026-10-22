FROM node:22.23.4-alpine3.23@sha256:6abbcf5dd6b231da109bcde1181db1d92bf78015ae1a9514d9807c1f857869db AS builder
WORKDIR /app

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/sanctions ./packages/sanctions

RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace=@czagents/shared
RUN npm run build --workspace=@czagents/sanctions

FROM node:22.23.4-alpine3.23@sha256:6abbcf5dd6b231da109bcde1181db1d92bf78015ae1a9514d9807c1f857869db AS runner
WORKDIR /app
ENV NODE_ENV=production

# wget for healthchecks; sqlite3 for ad-hoc DB inspection in container
RUN apk add --no-cache wget sqlite

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/sanctions/dist ./packages/sanctions/dist
COPY --from=builder /app/packages/sanctions/package.json ./packages/sanctions/package.json

# data dir mounted as volume
ENV SANCTIONS_DB=/var/lib/czagents-sanctions/sanctions.db
VOLUME ["/var/lib/czagents-sanctions"]

ENV PORT=3030
EXPOSE 3030
CMD ["node", "packages/sanctions/dist/http.js"]
