# CLAUDE.md — AERO-SENTINEL

## Project Overview

AERO-SENTINEL is a free, professional aviation weather monitoring platform (SPA/PWA) providing real-time TAF, METAR, and SPECI alerts for pilots, dispatchers, and aviation professionals. No account required. Live at https://aerosentinel.app

## Architecture

**Monorepo** managed by pnpm workspaces with this structure:

```
├── artifacts/
│   ├── aero-sentinel/    # Frontend — React 19 SPA (Vite + Tailwind CSS v4)
│   ├── api-server/       # Backend — Express 5 API server (Node 22)
│   └── mockup-sandbox/   # Design mockup playground
├── lib/
│   ├── api-client-react/ # Generated typed React Query hooks (via Orval)
│   ├── api-spec/         # OpenAPI 3.1 spec (single source of truth)
│   ├── api-zod/          # Generated Zod schemas from OpenAPI
│   └── db/               # Drizzle ORM schema + PostgreSQL migrations
├── scripts/              # DevOps, deploy, and utility scripts
├── plans/                # Technical planning documents (Turkish)
└── brand-kit/            # Logo, icons, fonts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Wouter (routing), TanStack Query, Recharts, Framer Motion |
| UI Components | Radix UI primitives + shadcn/ui pattern (CVA + clsx + tailwind-merge) |
| Backend | Express 5, TypeScript, esbuild (bundle), Pino (logging) |
| Database | PostgreSQL + Drizzle ORM |
| API Contract | OpenAPI 3.1 → Orval generates `api-client-react` and `api-zod` |
| Deployment | Railway (API server via Docker), Cloudflare Pages (frontend) |
| Push | Web Push (VAPID) for browser notifications |
| Package Manager | pnpm 11.5.2 with supply-chain attack defense (1-day minimum release age) |

## Key Commands

```bash
# Install dependencies (enforces pnpm)
pnpm install

# Start full dev environment (API + frontend)
bash scripts/start-dev.sh

# Frontend only
cd artifacts/aero-sentinel && pnpm dev          # → http://localhost:5173

# API server only
cd artifacts/api-server && pnpm dev             # → http://localhost:5001

# Typecheck entire workspace
pnpm run typecheck

# Typecheck only shared libs
pnpm run typecheck:libs

# Build everything
pnpm run build

# Run API server tests
cd artifacts/api-server && pnpm test

# Regenerate API client + Zod schemas from OpenAPI spec
cd lib/api-spec && pnpm run generate
```

## Environment Variables

See `.env.example` for all required variables. Key ones:
- `DATABASE_URL` — PostgreSQL connection string (Railway sets automatically)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push keys
- `PORT` — API server port (default: 5001)
- `VITE_BASE_PATH` — Frontend base path (default: `/`)

**NEVER commit `.env` files.** They contain production credentials.

## Coding Conventions

### TypeScript
- Strict mode enabled across all packages
- All packages use `"type": "module"` (ESM)
- Use `@/` path alias for frontend imports (maps to `artifacts/aero-sentinel/src/`)
- Generated code lives in `src/generated/` directories — do not edit manually

### Frontend Patterns
- **Routing**: Wouter (`<Link>`, `useLocation`, `useRoute`)
- **Data fetching**: TanStack Query with generated hooks from `@workspace/api-client-react`
- **Styling**: Tailwind CSS v4 utility classes + `cn()` helper (`clsx` + `tailwind-merge`)
- **Components**: shadcn/ui pattern in `src/components/ui/` — uses CVA for variants
- **State**: React state + `usePersistedState` hook for localStorage persistence
- **i18n**: Currently English only; UI strings are inline
- **SEO**: `react-helmet-async` for per-page meta tags
- **Analytics**: Google Analytics 4 via `react-ga4`

### Backend Patterns
- **Framework**: Express 5 with TypeScript
- **Build**: esbuild bundles to single ESM file (`dist/index.mjs`)
- **Logging**: Pino (structured JSON logging)
- **Security**: Helmet, CORS, rate limiting, cookie-parser
- **Database**: Drizzle ORM with raw SQL migrations in `lib/db/migrations/`
- **Monitoring**: Background monitor fetches weather data, evaluates alert conditions, stores results
- **Push**: Web Push notifications via `web-push` library

### Database
- Migrations are in `lib/db/migrations/` (plain SQL files)
- Schema defined in `lib/db/src/schema/` using Drizzle
- Tables: `alerts`, `watchlist`, `monitor_cache`, `push_subscriptions`

## API Architecture

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth** for the API contract. From it:
- `lib/api-client-react/` — Generated typed fetch client + React Query hooks (via Orval)
- `lib/api-zod/` — Generated Zod validation schemas (via Orval)

**When changing API endpoints**: Update `openapi.yaml` first, then run code generation.

## Deployment

- **API Server**: Railway via Dockerfile → `artifacts/api-server/dist/index.mjs` on port 8080
- **Frontend**: Cloudflare Pages (Wrangler) → `artifacts/aero-sentinel/dist/public/`
- **Health check**: `GET /api/healthz`
- Deploy scripts: `scripts/deploy.sh`, `scripts/deploy-production.sh`, `scripts/deploy-api.sh`

## Important Notes

- Weather data comes from NOAA Aviation Weather Center (aviationweather.gov) — never fabricate or modify raw reports
- The `plans/` directory contains technical planning docs (mostly in Turkish) — useful for understanding design decisions
- Security: pnpm enforces 1-day minimum release age for npm packages (supply-chain defense)
- The frontend proxies `/api/*` to the backend during development (configured in `vite.config.ts`)
- Font: Psilograph (custom brand font) + Inter (UI text)
