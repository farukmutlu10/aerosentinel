FROM node:22-alpine AS base

# pnpm kurulumu
RUN npm install -g pnpm@11.5.2

WORKDIR /app

# Sadece package.json'ları kopyala (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/aero-sentinel/package.json ./artifacts/aero-sentinel/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

# Bağımlılıkları yükle
RUN pnpm install --frozen-lockfile

# Kaynak kodları kopyala
COPY . .

# Build (typecheck'i atla, sadece esbuild ile API server'ı build et)
RUN pnpm -r --filter "@workspace/api-server" run build

# ── Production image ──────────────────────────────────────────
FROM node:22-alpine AS production

RUN npm install -g pnpm@11.5.2

WORKDIR /app

# Sadece build çıktısı ve bağımlılıkları kopyala
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/artifacts ./artifacts
COPY --from=base /app/lib ./lib

ENV NODE_ENV=production
EXPOSE 8080

# Railway'de PORT env değişkeni otomatik set edilir
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
