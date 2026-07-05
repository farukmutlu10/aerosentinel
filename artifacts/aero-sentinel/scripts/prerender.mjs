#!/usr/bin/env node
/**
 * Build-time prerender script for AERO-SENTINEL.
 * Reads dist/public/index.html and creates per-route static HTML files
 * with correct meta tags embedded directly in the HTML.
 * No external dependencies — uses only Node.js built-ins.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist", "public");
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

// ── Data ─────────────────────────────────────────────────────────────────────

const blogPosts = [
  { slug: "what-is-taf-understanding-terminal-aerodrome-forecasts", title: "What is TAF? Understanding Terminal Aerodrome Forecasts", description: "A comprehensive guide to Terminal Aerodrome Forecasts \u2014 how they work, how to decode them, and why they are essential for flight planning and aviation safety.", date: "2026-06-20" },
  { slug: "how-to-read-metar-reports-a-complete-guide", title: "How to Read METAR Reports: A Complete Guide", description: "Master the art of decoding METAR reports \u2014 from wind and visibility to cloud layers and pressure settings.", date: "2026-06-18" },
  { slug: "speci-reports-when-standard-weather-isnt-enough", title: "SPECI Reports: When Standard Weather Isn\u2019t Enough", description: "Learn when and why SPECI reports are issued, how they differ from routine METARs, and the trigger conditions.", date: "2026-06-15" },
  { slug: "wind-shear-the-invisible-threat-to-aviation-safety", title: "Wind Shear: The Invisible Threat to Aviation Safety", description: "An in-depth exploration of wind shear \u2014 its causes, types, detection methods, and pilot mitigation strategies.", date: "2026-06-12" },
  { slug: "understanding-turbulence-categories-reporting-and-pilot-tips", title: "Understanding Turbulence: Categories, Reporting, and Pilot Tips", description: "A thorough guide to turbulence \u2014 its types, severity categories, reporting methods, and practical tips for pilots.", date: "2026-06-10" },
  { slug: "visibility-and-rvr-critical-factors-for-safe-landing", title: "Visibility and RVR: Critical Factors for Safe Landing", description: "Understanding how visibility is measured, what Runway Visual Range means, and how CAT I/II/III approach criteria work.", date: "2026-06-08" },
  { slug: "cloud-types-and-their-impact-on-flight-operations", title: "Cloud Types and Their Impact on Flight Operations", description: "A detailed overview of cloud types encountered in aviation and their operational implications for pilots.", date: "2026-06-05" },
  { slug: "icao-airport-codes-the-global-language-of-aviation", title: "ICAO Airport Codes: The Global Language of Aviation", description: "Understanding the difference between ICAO and IATA airport codes, their structure, and why they matter.", date: "2026-06-03" },
  { slug: "how-weather-affects-flight-planning", title: "How Weather Affects Flight Planning", description: "A comprehensive look at how weather conditions shape every phase of flight planning.", date: "2026-06-01" },
  { slug: "sigmets-airmets-and-convective-outlooks", title: "SIGMETs, AIRMETs, and Convective Outlooks", description: "Learn to decode and apply SIGMET and AIRMET advisories for identifying significant weather hazards.", date: "2026-05-28" },
  { slug: "cold-weather-operations-de-icing-icing-and-cold-soak", title: "Cold Weather Operations: De-icing, Icing, and Cold Soak", description: "A detailed guide to cold weather aviation operations \u2014 icing types, de-icing procedures, and extreme cold challenges.", date: "2026-05-25" },
  { slug: "thunderstorm-hazards-what-every-pilot-should-know", title: "Thunderstorm Hazards: What Every Pilot Should Know", description: "An essential guide to thunderstorm-related hazards in aviation \u2014 microbursts, hail, lightning, and safety strategies.", date: "2026-05-22" },
  { slug: "fog-and-low-visibility-procedures-lvp", title: "Fog and Low Visibility Procedures (LVP)", description: "Understanding fog formation, types, Low Visibility Procedures, and how ILS categories enable operations.", date: "2026-05-18" },
  { slug: "how-real-time-weather-monitoring-saves-aviation-lives", title: "How Real-Time Weather Monitoring Saves Aviation Lives", description: "The critical role of real-time weather monitoring in aviation safety \u2014 from early warning to prevention.", date: "2026-05-15" },
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
  { path: "/", title: "AERO-SENTINEL \u2014 Real-Time Aviation Weather Monitoring", description: "Monitor TAF, METAR and SPECI alerts for your favorite airports. Real-time weather tracking for pilots and dispatchers.", jsonLd: { "@context": "https://schema.org", "@type": "WebApplication", name: "AERO-SENTINEL", url: SITE_URL, description: "Professional aviation weather monitoring platform providing real-time TAF, METAR, and SPECI alerts for pilots, dispatchers, and aviation professionals.", applicationCategory: "UtilitiesApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } },
  { path: "/alerts", title: "Alerts \u2014 TAF/METAR Weather Alerts", description: "View and manage TAF AMD, COR, SPECI, extreme weather and LIFR alerts for your watchlist airports." },
  { path: "/airports", title: "Airports \u2014 Global Airport Weather", description: "Browse and monitor airport weather conditions worldwide. Add airports to your watchlist for real-time alerts." },
  { path: "/about", title: "About AERO-SENTINEL", description: "Learn about AERO-SENTINEL, the professional aviation weather monitoring platform built for pilots and dispatchers." },
  { path: "/blog", title: "Blog \u2014 Aviation Weather Insights", description: "Expert articles on TAF, METAR, aviation weather monitoring, flight safety, and pilot tools." },
  { path: "/features", title: "Features \u2014 Aviation Weather Tools", description: "Explore AERO-SENTINEL features: real-time TAF/METAR monitoring, weather alerts, airport watchlists, and more." },
  { path: "/faq", title: "FAQ \u2014 Frequently Asked Questions", description: "Get answers to common questions about AERO-SENTINEL weather monitoring, alerts, and features.", jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqQA.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) } },
  { path: "/use-cases", title: "Use Cases", description: "Discover how pilots, dispatchers, and aviation enthusiasts use AERO-SENTINEL for weather monitoring." },
  { path: "/privacy", title: "Privacy Policy", description: "AERO-SENTINEL privacy policy. Learn how we handle your data and protect your privacy." },
  { path: "/terms", title: "Terms of Service", description: "AERO-SENTINEL terms of service. Read our terms and conditions for using the platform." },
  { path: "/contact", title: "Contact Us", description: "Get in touch with the AERO-SENTINEL team. Send us your questions, feedback, or partnership inquiries." },
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
  });
}
for (const f of features) {
  routes.push({ path: "/features/" + f.slug, title: f.title + " \u2014 AERO-SENTINEL", description: f.description });
}
for (const u of useCases) {
  routes.push({ path: "/use-cases/" + u.slug, title: u.title + " \u2014 AERO-SENTINEL", description: u.description });
}

// ── Inject ───────────────────────────────────────────────────────────────────

function injectMeta(html, route) {
  var fullTitle = route.title.indexOf("AERO-SENTINEL") !== -1 ? route.title : route.title + " \u2014 AERO-SENTINEL";
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

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(TEMPLATE)) {
    console.error("[prerender] Template not found: " + TEMPLATE);
    process.exit(1);
  }

  var template = readFileSync(TEMPLATE, "utf-8");

  // Update root index.html
  var dashRoute = routes.find(function(r) { return r.path === "/"; });
  writeFileSync(TEMPLATE, injectMeta(template, dashRoute));
  console.log("[prerender] Updated index.html with Dashboard meta tags");

  var count = 1;
  for (var i = 0; i < routes.length; i++) {
    var route = routes[i];
    if (route.path === "/") continue;

    var outDir = join(DIST, route.path);
    var outFile = join(outDir, "index.html");

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(outFile, injectMeta(template, route));
    console.log("[prerender] " + route.path);
    count++;
  }

  console.log("[prerender] Done \u2014 " + count + " routes pre-rendered.");
}

main();
