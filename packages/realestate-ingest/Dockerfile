FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/isir ./packages/isir
COPY packages/realestate-ingest ./packages/realestate-ingest
RUN npm install --workspaces --include-workspace-root --legacy-peer-deps
RUN npm run build --workspace=@czagents/shared
RUN npm run build --workspace=@czagents/isir
RUN npm run build --workspace=@czagents/realestate-ingest

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# ISIR Tier-B document text extraction (runtime only): pdftotext (poppler-utils)
# for clean PDFs + tesseract -l ces for scanned / Identity-H vyhláška PDFs.
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-ces
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/isir/dist ./packages/isir/dist
COPY --from=builder /app/packages/isir/package.json ./packages/isir/package.json
COPY --from=builder /app/packages/realestate-ingest/dist ./packages/realestate-ingest/dist
COPY --from=builder /app/packages/realestate-ingest/package.json ./packages/realestate-ingest/package.json
# Long-running container so Dokploy schedule can exec the CLI on a cron.
CMD ["sh", "-c", "node packages/realestate-ingest/dist/cli.js; tail -f /dev/null"]
