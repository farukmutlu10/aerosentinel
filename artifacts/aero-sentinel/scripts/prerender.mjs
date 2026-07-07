#!/usr/bin/env node
/**
 * Build-time prerender script for AERO-SENTINEL.
 * Reads dist/public/index.html and creates per-route static HTML files
 * with correct meta tags embedded directly in the HTML.
 *
 * As of this version, content pages (About/Privacy/Terms/Contact/FAQ/
 * Blog/BlogPost/Features/FeatureDetail/UseCases/UseCaseDetail) are also
 * server-rendered via react-dom/server and injected into <div id="root">,
 * so crawlers (notably AdSense's reviewer, which doesn't reliably execute
 * JS) see real article/page text instead of an empty div. main.tsx uses
 * createRoot(...).render() (not hydrateRoot), so this is safe: React
 * simply replaces the injected markup on mount, no hydration mismatch.
 * The app itself (Dashboard/Alerts/Airports/AirportDetail) is left as
 * pure CSR — it's an interactive tool, not a content page, and it needs
 * live API data that doesn't exist at build time.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { Router, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist", "public");
const TEMPLATE = join(DIST, "index.html");

const SITE_URL = "https://aerosentinel.app";
const DEFAULT_IMAGE = "https://aerosentinel.app/opengraph.jpg";

// HTML-escape utility
const AMP = String.fromCharCode(38) + "amp;";
const QUOT = String.fromCharCode(38) + "quot;";
const LT = String.fromCharCode(38) + "lt;";
const GT = String.fromCharCode(38) + "gt;";

function escapeHtml(str) {
  return str
    .replace(/&/g, AMP)
    .replace(/"/g, QUOT)
    .replace(/</g, LT)
    .replace(/>/g, GT);
}

// ── Minimal browser-global polyfills for SSR ────────────────────────────────
// These page components are written for the browser (WatchlistContext reads
// localStorage at MODULE SCOPE to mint a device id) — importing them under
// Node without this throws immediately. Effects (useEffect) never run during
// renderToStaticMarkup, so this only needs to cover module-scope/render-time
// reads, not the full browser API surface.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (typeof globalThis.window.location === "undefined") {
  globalThis.window.location = { pathname: "/", hostname: "aerosentinel.app", href: SITE_URL };
}
if (typeof globalThis.window.matchMedia === "undefined") {
  globalThis.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
}
if (typeof globalThis.window.addEventListener === "undefined") {
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
  globalThis.window.dispatchEvent = () => true;
}

// ── Data (kept in sync manually with src/data/* — used for meta tags and
//    list pages that don't warrant a full component SSR pass) ──────────────

const blogPosts = [
  { slug: "what-is-taf-understanding-terminal-aerodrome-forecasts", title: "What is TAF? Understanding Terminal Aerodrome Forecasts", description: "A comprehensive guide to Terminal Aerodrome Forecasts — how they work, how to decode them, and why they are essential for flight planning and aviation safety.", date: "2026-06-20" },
  { slug: "how-to-read-metar-reports-a-complete-guide", title: "How to Read METAR Reports: A Complete Guide", description: "Master the art of decoding METAR reports — from wind and visibility to cloud layers and pressure settings.", date: "2026-06-18" },
  { slug: "speci-reports-when-standard-weather-isnt-enough", title: "SPECI Reports: When Standard Weather Isn’t Enough", description: "Learn when and why SPECI reports are issued, how they differ from routine METARs, and the trigger conditions.", date: "2026-06-15" },
  { slug: "wind-shear-the-invisible-threat-to-aviation-safety", title: "Wind Shear: The Invisible Threat to Aviation Safety", description: "An in-depth exploration of wind shear — its causes, types, detection methods, and pilot mitigation strategies.", date: "2026-06-12" },
  { slug: "understanding-turbulence-categories-reporting-and-pilot-tips", title: "Understanding Turbulence: Categories, Reporting, and Pilot Tips", description: "A thorough guide to turbulence — its types, severity categories, reporting methods, and practical tips for pilots.", date: "2026-06-10" },
  { slug: "visibility-and-rvr-critical-factors-for-safe-landing", title: "Visibility and RVR: Critical Factors for Safe Landing", description: "Understanding how visibility is measured, what Runway Visual Range means, and how CAT I/II/III approach criteria work.", date: "2026-06-08" },
  { slug: "cloud-types-and-their-impact-on-flight-operations", title: "Cloud Types and Their Impact on Flight Operations", description: "A detailed overview of cloud types encountered in aviation and their operational implications for pilots.", date: "2026-06-05" },
  { slug: "icao-airport-codes-the-global-language-of-aviation", title: "ICAO Airport Codes: The Global Language of Aviation", description: "Understanding the difference between ICAO and IATA airport codes, their structure, and why they matter.", date: "2026-06-03" },
  { slug: "how-weather-affects-flight-planning", title: "How Weather Affects Flight Planning", description: "A comprehensive look at how weather conditions shape every phase of flight planning.", date: "2026-06-01" },
  { slug: "sigmets-airmets-and-convective-outlooks", title: "SIGMETs, AIRMETs, and Convective Outlooks", description: "Learn to decode and apply SIGMET and AIRMET advisories for identifying significant weather hazards.", date: "2026-05-28" },
  { slug: "cold-weather-operations-de-icing-icing-and-cold-soak", title: "Cold Weather Operations: De-icing, Icing, and Cold Soak", description: "A detailed guide to cold weather aviation operations — icing types, de-icing procedures, and extreme cold challenges.", date: "2026-05-25" },
  { slug: "thunderstorm-hazards-what-every-pilot-should-know", title: "Thunderstorm Hazards: What Every Pilot Should Know", description: "An essential guide to thunderstorm-related hazards in aviation — microbursts, hail, lightning, and safety strategies.", date: "2026-05-22" },
  { slug: "fog-and-low-visibility-procedures-lvp", title: "Fog and Low Visibility Procedures (LVP)", description: "Understanding fog formation, types, Low Visibility Procedures, and how ILS categories enable operations.", date: "2026-05-18" },
  { slug: "how-real-time-weather-monitoring-saves-aviation-lives", title: "How Real-Time Weather Monitoring Saves Aviation Lives", description: "The critical role of real-time weather monitoring in aviation safety — from early warning to prevention.", date: "2026-05-15" },
  { slug: "building-an-aviation-weather-dashboard-technical-deep-dive", title: "Building an Aviation Weather Dashboard: Technical Deep Dive", description: "A technical exploration of how AeroSentinel parses TAF/METAR data, detects changes, and delivers alerts.", date: "2026-05-10" },
];

const features = [
  { slug: "taf-monitoring", title: "TAF Monitoring", description: "Continuous Terminal Aerodrome Forecast tracking with instant change detection and visual diff comparison." },
  { slug: "metar-parser", title: "METAR Parser", description: "Real-time METAR decoding with human-readable translations and coded group explanations." },
  { slug: "weather-alerts", title: "Weather Alerts", description: "Intelligent alert system with configurable thresholds and critical condition detection." },
  { slug: "flight-analysis", title: "Flight Analysis", description: "Comprehensive weather analysis tools for flight planning and operational decision-making." },
  { slug: "watchlist", title: "Personalized Watchlists", description: "Custom airport watchlists for targeted weather monitoring and filtered alert delivery." },
  { slug: "global-airports", title: "Global Airport Coverage", description: "Worldwide airport database with ICAO codes and comprehensive aviation weather data integration." },
];

const useCases = [
  { slug: "pilots", title: "For Pilots", description: "Pre-flight planning, en-route monitoring, and arrival weather assessment for professional and student pilots." },
  { slug: "dispatchers", title: "For Dispatchers", description: "Real-time weather tracking and route optimization for flight dispatchers and operations centers." },
  { slug: "students", title: "For Aviation Students", description: "Learning tool for TAF/METAR interpretation, weather theory, and aviation meteorology education." },
  { slug: "aircraft-operators", title: "For Aircraft Operators", description: "Fleet management support with weather-based operational decisions and multi-airport monitoring." },
  { slug: "weather-enthusiasts", title: "For Weather Enthusiasts", description: "Global weather tracking, data analysis, and aviation meteorology exploration for weather enthusiasts." },
];

const faqQA = [
  { q: "What is AeroSentinel?", a: "AeroSentinel is a professional-grade aviation weather monitoring platform that provides real-time TAF, METAR, and SPECI data for airports worldwide." },
  { q: "Is AeroSentinel free to use?", a: "Yes, AeroSentinel is free to use for all users. No subscription or payment required." },
  { q: "Which airports are supported?", a: "AeroSentinel supports 7,000+ airports worldwide that issue ICAO-standard METAR and TAF reports." },
  { q: "How do weather alerts work?", a: "When AeroSentinel detects a significant weather change at your watched airports, it generates alerts delivered via browser push notifications." },
  { q: "What is the difference between TAF and METAR?", a: "A METAR reports current weather conditions. A TAF is a forecast of expected conditions over 24-30 hours." },
];

// ── Route list ───────────────────────────────────────────────────────────────

const routes = [
  { path: "/", title: "AERO-SENTINEL — Real-Time Aviation Weather Monitoring", description: "Monitor TAF, METAR and SPECI alerts for your favorite airports. Real-time weather tracking for pilots and dispatchers.", jsonLd: { "@context": "https://schema.org", "@type": "WebApplication", name: "AERO-SENTINEL", url: SITE_URL, description: "Professional aviation weather monitoring platform providing real-time TAF, METAR, and SPECI alerts for pilots, dispatchers, and aviation professionals.", applicationCategory: "UtilitiesApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } },
  { path: "/alerts", title: "Alerts — TAF/METAR Weather Alerts", description: "View and manage TAF AMD, COR, SPECI, extreme weather and LIFR alerts for your watchlist airports." },
  { path: "/airports", title: "Airports — Global Airport Weather", description: "Browse and monitor airport weather conditions worldwide. Add airports to your watchlist for real-time alerts." },
  { path: "/about", title: "About AERO-SENTINEL", description: "Learn about AERO-SENTINEL, the professional aviation weather monitoring platform built for pilots and dispatchers.", ssrModule: "/src/pages/About.tsx" },
  { path: "/blog", title: "Blog — Aviation Weather Insights", description: "Expert articles on TAF, METAR, aviation weather monitoring, flight safety, and pilot tools.", ssrModule: "/src/pages/Blog.tsx" },
  { path: "/features", title: "Features — Aviation Weather Tools", description: "Explore AERO-SENTINEL features: real-time TAF/METAR monitoring, weather alerts, airport watchlists, and more.", ssrModule: "/src/pages/Features.tsx" },
  { path: "/faq", title: "FAQ — Frequently Asked Questions", description: "Get answers to common questions about AERO-SENTINEL weather monitoring, alerts, and features.", jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqQA.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) }, ssrModule: "/src/pages/FAQ.tsx" },
  { path: "/use-cases", title: "Use Cases", description: "Discover how pilots, dispatchers, and aviation enthusiasts use AERO-SENTINEL for weather monitoring.", ssrModule: "/src/pages/UseCases.tsx" },
  { path: "/privacy", title: "Privacy Policy", description: "AERO-SENTINEL privacy policy. Learn how we handle your data and protect your privacy.", ssrModule: "/src/pages/Privacy.tsx" },
  { path: "/terms", title: "Terms of Service", description: "AERO-SENTINEL terms of service. Read our terms and conditions for using the platform.", ssrModule: "/src/pages/Terms.tsx" },
  { path: "/contact", title: "Contact Us", description: "Get in touch with the AERO-SENTINEL team. Send us your questions, feedback, or partnership inquiries.", ssrModule: "/src/pages/Contact.tsx" },
];

// Dynamic routes
for (const p of blogPosts) {
  routes.push({
    path: "/blog/" + p.slug,
    title: p.title,
    description: p.description,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      author: { "@type": "Organization", name: "AERO-SENTINEL" },
      publisher: { "@type": "Organization", name: "AERO-SENTINEL" },
      url: SITE_URL + "/blog/" + p.slug,
      image: DEFAULT_IMAGE,
    },
    ssrModule: "/src/pages/BlogPost.tsx",
    ssrMatchPath: "/blog/:slug",
  });
}
for (const f of features) {
  routes.push({
    path: "/features/" + f.slug, title: f.title + " — AERO-SENTINEL", description: f.description,
    ssrModule: "/src/pages/FeatureDetail.tsx", ssrMatchPath: "/features/:slug",
  });
}
for (const u of useCases) {
  routes.push({
    path: "/use-cases/" + u.slug, title: u.title + " — AERO-SENTINEL", description: u.description,
    ssrModule: "/src/pages/UseCaseDetail.tsx", ssrMatchPath: "/use-cases/:slug",
  });
}

// ── Inject meta tags ─────────────────────────────────────────────────────────

function injectMeta(html, route) {
  var fullTitle = route.title.indexOf("AERO-SENTINEL") !== -1 ? route.title : route.title + " — AERO-SENTINEL";
  var url = SITE_URL + route.path;
  var ogType = route.ogType || "website";

  var tags = [];
  tags.push("    <title>" + escapeHtml(fullTitle) + "</title>");
  tags.push('    <meta name="description" content="' + escapeHtml(route.description) + '" />');
  tags.push('    <link rel="canonical" href="' + url + '" />');
  tags.push('    <meta property="og:title" content="' + escapeHtml(fullTitle) + '" />');
  tags.push('    <meta property="og:description" content="' + escapeHtml(route.description) + '" />');
  tags.push('    <meta property="og:url" content="' + url + '" />');
  tags.push('    <meta property="og:image" content="' + DEFAULT_IMAGE + '" />');
  tags.push('    <meta property="og:type" content="' + ogType + '" />');
  tags.push('    <meta name="twitter:card" content="summary_large_image" />');
  tags.push('    <meta name="twitter:title" content="' + escapeHtml(fullTitle) + '" />');
  tags.push('    <meta name="twitter:description" content="' + escapeHtml(route.description) + '" />');

  if (route.jsonLd) {
    tags.push('    <script type="application/ld+json">' + JSON.stringify(route.jsonLd) + "</script>");
  }

  return html.replace("</head>", tags.join("\n") + "\n  </head>");
}

// ── Inject server-rendered body content into <div id="root"> ───────────────
// createRoot(...).render() (see main.tsx) fully replaces #root's children on
// mount rather than hydrating/diffing against them, so this markup only
// needs to be valid HTML for first paint / crawlers — it doesn't need to
// exactly match what React renders client-side.
function injectBody(html, bodyHtml) {
  return html.replace('<div id="root"></div>', '<div id="root">' + bodyHtml + "</div>");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(TEMPLATE)) {
    console.error("[prerender] Template not found: " + TEMPLATE);
    process.exit(1);
  }

  var template = readFileSync(TEMPLATE, "utf-8");

  var vite = await createServer({
    root: ROOT,
    configFile: join(ROOT, "vite.config.ts"),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });

  var ssrCache = new Map(); // ssrModule path -> loaded component
  // Footer.tsx (pulled in by FAQ/FeatureDetail/UseCaseDetail) reads
  // useWatchlist(), which throws without a WatchlistProvider ancestor —
  // load it the same way as page components (raw TSX via Vite's SSR
  // transform) and wrap every SSR tree with it, since it's cheap and
  // some routes need it and some don't isn't worth tracking separately.
  var watchlistMod = await vite.ssrLoadModule("/src/context/WatchlistContext.tsx");
  var WatchlistProvider = watchlistMod.WatchlistProvider;
  var queryClient = new QueryClient();

  async function renderRouteBody(route) {
    if (!route.ssrModule) return null;
    try {
      var cacheKey = route.ssrModule;
      var Component = ssrCache.get(cacheKey);
      if (!Component) {
        var mod = await vite.ssrLoadModule(route.ssrModule);
        Component = mod.default;
        ssrCache.set(cacheKey, Component);
      }
      var page = route.ssrMatchPath
        ? React.createElement(Route, { path: route.ssrMatchPath, component: Component })
        : React.createElement(Component);
      var tree = React.createElement(
        HelmetProvider,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            WatchlistProvider,
            null,
            React.createElement(Router, { ssrPath: route.path }, page),
          ),
        ),
      );
      var rendered = renderToStaticMarkup(tree);
      // PageMeta's <Helmet> children (title/meta/canonical/json-ld) render
      // in place during a plain renderToStaticMarkup pass instead of being
      // extracted to <head> (that extraction needs the Helmet context
      // consumed via helmetContext.helmet, which we deliberately don't do —
      // injectMeta() above already puts the correct tags in <head>). Strip
      // them out of the body so #root doesn't end up with an invalid,
      // duplicate <title>/<meta>/<link>/<script> nested inside a <div>.
      // These page components never render meta/link/script tags for any
      // reason OTHER than Helmet, so a blanket removal by tag name is safe.
      rendered = rendered
        .replace(/<title[^>]*>[\s\S]*?<\/title>/g, "")
        .replace(/<meta\b[^>]*\/?>/g, "")
        .replace(/<link\b[^>]*\/?>/g, "")
        .replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "");
      return rendered;
    } catch (err) {
      console.warn("[prerender] SSR render failed for " + route.path + " — falling back to meta-only:", err && err.message);
      return null;
    }
  }

  // Update root index.html (Dashboard is intentionally left CSR-only — it's
  // an interactive tool needing live data, not a content page)
  var dashRoute = routes.find(function(r) { return r.path === "/"; });
  writeFileSync(TEMPLATE, injectMeta(template, dashRoute));
  console.log("[prerender] Updated index.html with Dashboard meta tags");

  var count = 1;
  var ssrCount = 0;
  for (var i = 0; i < routes.length; i++) {
    var route = routes[i];
    if (route.path === "/") continue;

    var outDir = join(DIST, route.path);
    var outFile = join(outDir, "index.html");

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    var out = injectMeta(template, route);
    var bodyHtml = await renderRouteBody(route);
    if (bodyHtml) {
      out = injectBody(out, bodyHtml);
      ssrCount++;
    }

    writeFileSync(outFile, out);
    console.log("[prerender] " + route.path + (bodyHtml ? " (SSR)" : ""));
    count++;
  }

  await vite.close();

  console.log("[prerender] Done — " + count + " routes pre-rendered, " + ssrCount + " with full SSR content.");
}

main();
