# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AERO-SENTINEL is a free, professional aviation weather monitoring platform (SPA/PWA) providing real-time TAF, METAR, and SPECI alerts for pilots, dispatchers, and aviation professionals. No account required — every "user" is an anonymous device identified by a client-generated UUID (see **Identity Model** below). Live at https://aerosentinel.app

## Architecture

**Monorepo** managed by pnpm workspaces:

```
├── artifacts/
│   ├── aero-sentinel/    # Frontend — React 19 SPA (Vite + Tailwind CSS v4)
│   ├── api-server/       # Backend — Express 5 API server (Node 22)
│   └── mockup-sandbox/   # Standalone Vite design-mockup playground, not deployed
├── lib/
│   ├── api-client-react/ # Generated typed React Query hooks (via Orval) — also supports an Expo/React Native consumer (see custom-fetch.ts)
│   ├── api-spec/         # OpenAPI 3.1 spec — not fully in sync with actual routes, see API Architecture
│   ├── api-zod/          # Generated Zod schemas from OpenAPI
│   └── db/               # Drizzle ORM schema + PostgreSQL migrations + in-memory fallback
├── scripts/              # DevOps, deploy, and utility scripts — many hardcode a stale absolute path, see Key Commands
├── plans/                # Technical planning documents (Turkish) — plans/deploy-policy.md defines the deploy rules under Deployment
└── brand-kit/            # Logo, icons, fonts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Wouter (routing), TanStack Query, Recharts, Framer Motion |
| UI Components | Radix UI primitives + shadcn/ui pattern (CVA + clsx + tailwind-merge) |
| Backend | Express 5, TypeScript, esbuild (bundle), Pino (logging) |
| Database | PostgreSQL + Drizzle ORM (with an in-memory fallback, see Environment Variables) |
| API Contract | OpenAPI 3.1 → Orval generates `api-client-react` and `api-zod` |
| Deployment | Railway (API server via Docker), Cloudflare Pages (frontend) |
| Push | Web Push (VAPID) for browser notifications |
| Package Manager | pnpm 11.5.2 with supply-chain attack defense (1-day minimum release age) |

## Key Commands

```bash
# Install dependencies (enforces pnpm)
pnpm install

# Frontend only — http://localhost:5173 (proxies /api/* to :5001, see vite.config.ts)
cd artifacts/aero-sentinel && pnpm dev

# API server only — builds then runs dist/index.mjs on :5001
cd artifacts/api-server && pnpm dev

# Typecheck entire workspace / just shared libs (project references via tsc --build)
pnpm run typecheck
pnpm run typecheck:libs

# Build everything (typecheck, then build each package that has a build script)
pnpm run build

# Run the API server's tests (single file, Node's built-in test runner)
cd artifacts/api-server && pnpm test
# Run a subset by name:
cd artifacts/api-server && node --experimental-strip-types --experimental-transform-types --no-warnings src/lib/conditions.test.ts --test-name-pattern="LIFR"

# Regenerate API client + Zod schemas from openapi.yaml
cd lib/api-spec && pnpm run codegen
```

There is no root-level lint command and no Prettier config wired up (Prettier is a devDependency but unused by any script) — don't invent one.

**`scripts/start-dev.sh` is currently broken in this checkout**: it hardcodes `PROJROOT="/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"`, a path from a different machine/checkout. The same stale path appears in ~17 other scripts under `scripts/` (deploy, git-push, etc.). Until someone updates `PROJROOT`, run the two `pnpm dev` commands above directly instead of relying on these scripts.

## Environment Variables

See `.env.example` for the full list. Key ones:
- `DATABASE_URL` — PostgreSQL connection string. If it's unset or unreachable, `lib/db/src/index.ts` transparently falls back to an in-memory duck-typed store so the server still boots — only the `LTFH` airport is seeded/monitored and nothing persists across restarts. Fine for a quick smoke test, not for real development.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Web Push keys (generate with `npx web-push generate-vapid-keys`)
- `PORT` — API server port (default 5001)
- `LOG_LEVEL` — Pino log level (default `info`)
- `BASE_PATH` — Vite `base` path for both `aero-sentinel` and `mockup-sandbox` builds (default `/`). Note: `.env.example` documents this as `VITE_BASE_PATH`, but both vite configs actually read `process.env.BASE_PATH` (no `VITE_` prefix) — the example's variable name doesn't match what's consumed.

**NEVER commit `.env` files.** They contain production credentials.

## Coding Conventions

### TypeScript
- `tsconfig.base.json` enables most strict checks individually (`strictNullChecks`, `alwaysStrict`, `noImplicitAny`, `strictPropertyInitialization`, etc.) rather than the blanket `strict: true`. Notably `strictFunctionTypes` and `noImplicitOverride` are off and `noUnusedLocals` is off — unused locals won't fail typecheck.
- All packages use `"type": "module"` (ESM)
- Use `@/` path alias for frontend imports (maps to `artifacts/aero-sentinel/src/`)
- Generated code lives in `src/generated/` directories — do not edit manually

### Frontend Patterns
- **Routing**: Wouter (`<Link>`, `useLocation`, `useRoute`) — routes and lazy-loaded page components are defined in `App.tsx`
- **Data fetching**: TanStack Query with generated hooks from `@workspace/api-client-react` (`QueryClient` defaults: `staleTime: 20_000`, `retry: 1`, set in `App.tsx`)
- **Styling**: Tailwind CSS v4 utility classes + `cn()` helper (`clsx` + `tailwind-merge`)
- **Components**: shadcn/ui pattern in `src/components/ui/` — uses CVA for variants
- **State**: React state + `usePersistedState` hook (localStorage-backed) — backs the Theme, LocalAck (acknowledged-alert IDs), and watchlist state in `App.tsx` / `WatchlistContext.tsx`
- **i18n**: Currently English only; UI strings are inline
- **SEO**: `react-helmet-async` for per-page meta tags
- **Analytics**: Google Analytics 4 via `react-ga4`, only initialized if the user has given cookie/analytics consent (`CookieConsent` component)

### Backend Patterns
- **Framework**: Express 5 with TypeScript
- **Build**: esbuild bundles to a single ESM file (`dist/index.mjs`)
- **Logging**: Pino (structured JSON logging), redacts `authorization`/`cookie` headers
- **Security**: Helmet (CSP in production only), CORS with an explicit origin allowlist (incl. wildcard `*.aerosentinel.pages.dev` matching), rate limiting (200 req/min per IP on `/api`)
- **Database**: Drizzle ORM with raw SQL migrations in `lib/db/migrations/`
- **Push**: Web Push notifications via the `web-push` library

## Identity Model (no accounts)

There is no login. The frontend generates a UUID on first load (`localStorage["aero-device-id"]`, in `src/lib/deviceId.ts`, duplicated for the generated client in `lib/api-client-react/src/custom-fetch.ts`) and sends it as an `X-Device-ID` header on every request. The backend's `getDeviceId()` (`reqContext.ts`) uses that header as the identity key for watchlists, alert acknowledgement, and push subscriptions; a missing header defaults to `"legacy"`.

## Alert Detection Engine (Backend)

The core domain logic lives in `artifacts/api-server/src/lib/monitor.ts` + `conditions.ts` — the least discoverable part of the codebase, since it takes reading both files (plus `routes/alerts.ts` and `routes/watchlist.ts`) to see the whole picture:

- **Loop**: `startMonitor()` seeds the watchlist, loads `monitor_cache` from Postgres into in-memory maps (`sonGorulenTaf`/`sonGorulenMetar`/`sonGorulenTs` — "last-seen TAF/METAR/timestamp"), then polls `aviationweather.gov` every 60s for all watched ICAOs (batched 50 at a time, retried up to 3x with exponential backoff).
- **Change detection**: an alert is only considered when raw TAF/METAR text differs from the cached value. New text is persisted to `monitor_cache` immediately (survives restarts); `insertAlertIfNew()` dedupes against the `alerts` table by `(icao, type, rawText)` within a rolling 24h window before inserting a row and firing a push notification.
- **Alert types & priority**: `TAF_AMD`/`TAF_COR` (TAF revisions) and `SPECI` (special METAR) take priority over the three condition alerts — `LIFR` > `WX_EXTREME` > `WIND_EXTREME` (`detectConditionType()`). This is a "one alert per report" rule: when a report is itself an AMD/COR/SPECI, condition alerts are suppressed for that same text so the UI never double-alerts on one report.
- **TAF active-period re-evaluation**: even when a TAF's raw text is unchanged, `getActiveTafPeriod()`/`getActiveTempos()` re-parse FM/TEMPO/BECMG groups so a period becoming "active" (an FM group's start time passing) can still trigger a fresh condition check — tracked per-ICAO in `tafPeriodLastAlert` to avoid re-alerting the same period twice.
- **METAR SPECI backfill**: the `hours=2` METAR query can return SPECI reports already superseded before the monitor's next scan; `scanMetar()` retroactively alerts on any historical SPECI entry not matching the current cache.
- Routes never write monitor state directly — `routes/watchlist.ts`'s `detectLiveAlerts()` re-implements a read-only version of the same condition checks against live data (deterministic negative synthetic IDs via `stableSyntheticId()`) so `PUT /watchlist/sync` can return `initialAlerts` instantly, without waiting for the next 60s scan.

## Frontend Alert/Notification Pipeline

`hooks/useAlertNotifications.ts` polls `GET /alerts?limit=100&since_hours=6` every 30s (`refetchIntervalInBackground: true`, plus a `visibilitychange` listener to counter browser throttling of background tabs) and layers client-side filtering on top of the backend's alerts:
- Already-notified IDs are tracked in `localStorage["aero-notif-seen-ids-v4"]` (bump the version suffix if this logic changes) so a page reload doesn't re-notify.
- Alerts outside the current watchlist, or currently snoozed (`useAlertSnooze`), are skipped without being marked "seen" — so they can still fire later if relevant again.
- A single new alert renders a full toast; ≥2 in the same poll collapse into one batch-summary toast (`AlertToast.tsx`, sentinel `alertId === 0`) linking to `/alerts`.
- `WatchlistContext` owns the watched-ICAO list (localStorage + `BroadcastChannel` for cross-tab sync), calls `PUT /watchlist/sync` on change, and dispatches a `watchlist-synced` window event that this hook and `Alerts.tsx` both listen for to invalidate their queries.
- Push notifications (`hooks/usePushNotifications.ts`) are a separate opt-in flow: fetch the VAPID key → `PushManager.subscribe()` → `POST /push/subscribe`. The service worker is a static file (`public/sw.js`) registered directly in `index.html`, not from React.

## Database
- Migrations are plain SQL files in `lib/db/migrations/`, applied in order by `runMigrations()` (tracked in a `_migrations` table)
- Schema defined in `lib/db/src/schema/` using Drizzle
- Tables: `alerts`, `watchlist`, `monitor_cache`, `push_subscriptions`

## API Architecture

`lib/api-spec/openapi.yaml` is the intended source of truth, but it currently only documents `/healthz`, `/alerts*`, `/airports`, `/airports/{icao}/taf|metar`, and `/monitor/status`. The Express app (`routes/`) also serves `/watchlist*`, `/push/*`, `/airports/{icao}/runways`, `/airports/weather`, `/alerts/{id}/diff`, `/alerts/acknowledge-all`, `/monitor/diag`, `/monitor/debug`, and a dev-only `/alerts/test` — none of these are in the spec, so the frontend calls them with hand-written `fetch` rather than `@workspace/api-client-react` hooks. When adding a genuinely new endpoint, extend `openapi.yaml` and regenerate — but don't assume every existing route has a spec entry.

## Deployment

- **API Server**: Railway via `Dockerfile` → `artifacts/api-server/dist/index.mjs`, port 8080. **Railway runs a single instance — there is no preview/production split.** Any deploy there immediately affects production.
- **Frontend**: Cloudflare Pages (Wrangler) → `artifacts/aero-sentinel/dist/public/`. Preview deploys omit `--branch`; production deploys pass `--branch=main`.
- **Deploy policy** (`plans/deploy-policy.md`): always deploy to preview first. Only deploy `--branch=main` (frontend) or touch the Railway service (backend) when the user explicitly asks to go live ("canlıya al"). Get confirmation before any production deploy.
- `main.tsx` hardcodes the production/preview API base URLs by hostname (Railway service URLs) — keep these in sync with the CORS allowlist in `app.ts` if either ever changes.
- Health check: `GET /api/healthz`

## Important Notes

- Weather data comes from NOAA Aviation Weather Center (aviationweather.gov) — never fabricate or modify raw reports
- The `plans/` directory contains technical planning docs (mostly in Turkish) — useful for understanding design decisions
- Security: pnpm enforces 1-day minimum release age for npm packages (supply-chain attack defense)
- Font: Psilograph (custom brand font, logo only) + Inter (UI text)
