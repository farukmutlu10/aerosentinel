# AERO-SENTINEL — Master Implementation Record

> Created: 2026-07-05 | Updated: 2026-07-05
> Status: LIVE IN PRODUCTION
> Production: https://aerosentinel.app | Preview: https://preview.aerosentinel.pages.dev

---

## 1. SEO & Meta Tags Implementation

### Problem
All routes served the same `index.html` with identical `<title>`, `<meta description>`, OG tags, and JSON-LD. Non-JS crawlers saw no per-page SEO data.

### Solution: Two-Layer Architecture

#### Layer 1: Build-Time Prerendering
- **Script**: [`scripts/prerender.mjs`](artifacts/aero-sentinel/scripts/prerender.mjs)
- **Trigger**: Automatic via `package.json` build: `vite build && node scripts/prerender.mjs`
- **What it does**: Reads built `dist/public/index.html`, injects per-route `<title>`, `<meta description>`, `<link canonical>`, OG tags, Twitter cards, and JSON-LD into `<head>`, writes static HTML for 37 routes
- **Zero dependencies**: Pure Node.js built-ins only

#### Layer 2: Client-Side react-helmet-async
- **Provider**: [`src/App.tsx`](artifacts/aero-sentinel/src/App.tsx) — `<HelmetProvider>` wraps entire app
- **Component**: [`src/hooks/usePageMeta.tsx`](artifacts/aero-sentinel/src/hooks/usePageMeta.tsx) — `<PageMeta>` wraps `react-helmet-async`'s `<Helmet>`
- **Metadata**: [`src/lib/page-meta.ts`](artifacts/aero-sentinel/src/lib/page-meta.ts) — all page definitions, dynamic builders, JSON-LD helpers

### Per-Page Meta Tag Table

| Page | Title | Description | JSON-LD |
|------|-------|-------------|---------|
| Dashboard `/` | AERO-SENTINEL — Real-Time Aviation Weather Monitoring | Monitor TAF, METAR and SPECI alerts... | `WebApplication` |
| Alerts `/alerts` | Alerts — TAF/METAR Weather Alerts | View and manage TAF AMD, COR, SPECI... | `BreadcrumbList` |
| Airports `/airports` | Airports — Global Airport Weather | Browse and monitor airport weather... | `BreadcrumbList` |
| About `/about` | About AERO-SENTINEL | Learn about AERO-SENTINEL... | `BreadcrumbList` |
| Blog `/blog` | Blog — Aviation Weather Insights | Expert articles on TAF, METAR... | `BreadcrumbList` |
| BlogPost `/blog/:slug` | Dynamic from blog post data | Dynamic | `Article` + `BreadcrumbList` |
| FAQ `/faq` | FAQ — Frequently Asked Questions | Get answers to common questions... | `FAQPage` + `BreadcrumbList` |
| Features `/features` | Features — Aviation Weather Tools | Explore AERO-SENTINEL's features... | `BreadcrumbList` |
| FeatureDetail `/features/:slug` | Dynamic | Dynamic | `BreadcrumbList` |
| UseCases `/use-cases` | Use Cases | Discover how pilots, dispatchers... | `BreadcrumbList` |
| UseCaseDetail `/use-cases/:slug` | Dynamic | Dynamic | `BreadcrumbList` |
| Privacy `/privacy` | Privacy Policy | AERO-SENTINEL's privacy policy... | `BreadcrumbList` |
| Terms `/terms` | Terms of Service | AERO-SENTINEL terms of service... | `BreadcrumbList` |
| Contact `/contact` | Contact Us | Get in touch with the AERO-SENTINEL team... | `BreadcrumbList` |
| AirportDetail `/airports/:icao` | {ICAO} — Airport Weather & TAF/METAR | Dynamic with ICAO code | `Place` + `BreadcrumbList` |
| NotFound `/*` | Page Not Found | The page you're looking for doesn't exist... | None |

### Files Created
| File | Purpose |
|------|---------|
| [`src/hooks/usePageMeta.tsx`](artifacts/aero-sentinel/src/hooks/usePageMeta.tsx) | `<PageMeta>` component — react-helmet-async wrapper |
| [`src/lib/page-meta.ts`](artifacts/aero-sentinel/src/lib/page-meta.ts) | Page metadata definitions, JSON-LD helpers, breadcrumb builders |
| [`scripts/prerender.mjs`](artifacts/aero-sentinel/scripts/prerender.mjs) | Build-time prerender script (Node.js, zero deps) |
| [`public/llms.txt`](artifacts/aero-sentinel/public/llms.txt) | LLM discovery file |
| [`plans/seo-meta-tags-implementation.md`](plans/seo-meta-tags-implementation.md) | This document |

### Files Modified
| File | Change |
|------|--------|
| [`src/App.tsx`](artifacts/aero-sentinel/src/App.tsx) | Wrapped in `<HelmetProvider>` |
| [`index.html`](artifacts/aero-sentinel/index.html) | Removed hardcoded meta tags (now per-page) |
| [`package.json`](artifacts/aero-sentinel/package.json) | Build: `vite build && node scripts/prerender.mjs` |
| [`public/_headers`](artifacts/aero-sentinel/public/_headers) | Added `/*/index.html → no-cache` for prerendered routes |
| 16 page components | Added `<PageMeta>` with unique meta + JSON-LD |

---

## 2. Deploy Policy

### Rule: Preview First
All changes deploy to **preview** first. Production ONLY when user says "canlıya al".

### Frontend (Cloudflare Pages)
- **Preview**: `npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=preview`
  - URL: `https://preview.aerosentinel.pages.dev`
- **Production**: `npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=main`
  - URL: `https://aerosentinel.app`

### Backend (Railway)
- Single Railway instance — no preview/production split
- API server changes affect production immediately
- Railway token: `a5fd363a-cd15-4a9d-8ec3-c3085c63a85a` (in [`scripts/deploy-production.sh`](scripts/deploy-production.sh))
- Railway deployment ID: `accec5e6-3e38-4167-af66-7247c0fc3566`

### Deploy Commands
```bash
# Build (includes prerendering)
cd artifacts/aero-sentinel && npx pnpm run build

# Preview deploy
npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=preview

# Production deploy (full script)
bash scripts/deploy-production.sh
# Then: npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=main
```

---

## 3. Git Branch Strategy
- **`preview`**: Active development branch, all PRs merge here
- **`main`**: Production branch, only updated via `git merge preview`
- Production deploy script (`scripts/deploy-production.sh`) handles merge + push

---

## 4. Cache Strategy
| Resource | Cache-Control |
|----------|---------------|
| `/index.html` | `no-cache, no-store, must-revalidate` |
| `/*/index.html` (prerendered) | `no-cache, no-store, must-revalidate` |
| `/sw.js` | `no-cache, no-store, must-revalidate` |
| `/assets/*` | Default (long cache, fingerprinted filenames) |

---

## 5. JSON-LD Structured Data Registry

| Schema Type | Pages | Key Properties |
|-------------|-------|----------------|
| `WebApplication` | Dashboard | name, url, applicationCategory, offers (free) |
| `BreadcrumbList` | All pages | itemListElement with position/name/item |
| `Article` | Blog posts | headline, datePublished, author, publisher, image |
| `FAQPage` | FAQ | mainEntity with Question/Answer pairs |
| `Place` | AirportDetail | name (ICAO), url, description |

---

## 6. LLM/AI Discovery (`llms.txt`)

- **URL**: https://aerosentinel.app/llms.txt
- **Contents**: Site description, key pages, features, data sources (NOAA AWC), disclaimer, contact
- **Purpose**: LLMs can discover and understand the site structure

---

## 7. Known Issues & Notes

1. **Terminal shell integration**: VS Code terminal intermittently fails. Workaround: `node -e "require('child_process').execSync(...)"`
2. **Cloudflare edge cache**: Different edge nodes may serve stale content. No-cache headers mitigate.
3. **Railway auto-deploy**: GitHub push to `main` triggers Railway auto-deploy for backend.
4. **SPA routing**: Cloudflare Pages serves `index.html` for all routes (SPA fallback). Prerendered route files take precedence when they exist.

---

## 8. Verification

```bash
# Check production meta tags
curl -s https://aerosentinel.app/ | grep -oE '<title>[^<]+</title>'
curl -s https://aerosentinel.app/faq/ | grep -oE '<title>[^<]+</title>'
curl -s https://aerosentinel.app/about/ | grep -oE '<meta name="description" content="[^"]*"'

# Check JSON-LD
curl -s https://aerosentinel.app/ | grep 'application/ld+json'

# Check llms.txt
curl -s https://aerosentinel.app/llms.txt

# Check no-cache headers
curl -sI https://aerosentinel.app/faq/ | grep -i cache-control
```
