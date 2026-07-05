/* ── Per-page SEO metadata definitions ─────────────────────────────────────── */

export const SITE_NAME = "AERO-SENTINEL";
export const SITE_URL = "https://aerosentinel.app";
export const DEFAULT_IMAGE = "https://aerosentinel.app/opengraph.jpg";

// ── Breadcrumb JSON-LD helper ────────────────────────────────────────────────

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ── Static page metadata ─────────────────────────────────────────────────────

export const pageMeta = {
  dashboard: {
    title: "AERO-SENTINEL — Real-Time Aviation Weather Monitoring",
    description:
      "Monitor TAF, METAR and SPECI alerts for your favorite airports. Real-time weather tracking for pilots and dispatchers.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "AERO-SENTINEL",
      url: SITE_URL,
      description:
        "Professional aviation weather monitoring platform providing real-time TAF, METAR, and SPECI alerts for pilots, dispatchers, and aviation professionals.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Real-time TAF/METAR monitoring",
        "SPECI and weather change alerts",
        "Flight analysis tools",
        "Personalized airport watchlists",
        "Global airport weather data",
        "PWA support for kiosk mode",
      ],
      aboutPage: `${SITE_URL}/about`,
      privacyPolicy: `${SITE_URL}/privacy`,
      termsOfService: `${SITE_URL}/terms`,
    },
  },

  alerts: {
    title: "Alerts — TAF/METAR Weather Alerts",
    description:
      "View and manage TAF AMD, COR, SPECI, extreme weather and LIFR alerts for your watchlist airports.",
  },

  airports: {
    title: "Airports — Global Airport Weather",
    description:
      "Browse and monitor airport weather conditions worldwide. Add airports to your watchlist for real-time alerts.",
  },

  about: {
    title: "About AERO-SENTINEL",
    description:
      "Learn about AERO-SENTINEL, the professional aviation weather monitoring platform built for pilots and dispatchers.",
  },

  blog: {
    title: "Blog — Aviation Weather Insights",
    description:
      "Expert articles on TAF, METAR, aviation weather monitoring, flight safety, and pilot tools.",
  },

  faq: {
    title: "FAQ — Frequently Asked Questions",
    description:
      "Get answers to common questions about AERO-SENTINEL's weather monitoring, alerts, and features.",
  },

  features: {
    title: "Features — Aviation Weather Tools",
    description:
      "Explore AERO-SENTINEL's features: real-time TAF/METAR monitoring, weather alerts, airport watchlists, and more.",
  },

  privacy: {
    title: "Privacy Policy",
    description:
      "AERO-SENTINEL's privacy policy. Learn how we handle your data and protect your privacy.",
  },

  terms: {
    title: "Terms of Service",
    description:
      "AERO-SENTINEL terms of service. Read our terms and conditions for using the platform.",
  },

  contact: {
    title: "Contact Us",
    description:
      "Get in touch with the AERO-SENTINEL team. Send us your questions, feedback, or partnership inquiries.",
  },

  useCases: {
    title: "Use Cases",
    description:
      "Discover how pilots, dispatchers, and aviation enthusiasts use AERO-SENTINEL for weather monitoring.",
  },

  notFound: {
    title: "Page Not Found",
    description:
      "The page you're looking for doesn't exist. Return to AERO-SENTINEL dashboard.",
  },
} as const;

// ── Dynamic metadata builders ────────────────────────────────────────────────

export function airportDetailMeta(icao: string) {
  return {
    title: `${icao} — Airport Weather & TAF/METAR`,
    description: `Real-time TAF, METAR and SPECI weather data for ${icao} airport. Monitor wind, visibility, clouds, and flight category changes.`,
    canonical: `${SITE_URL}/airports/${icao}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Place",
      name: `${icao} Airport`,
      url: `${SITE_URL}/airports/${icao}`,
      description: `Live aviation weather monitoring for ${icao} including TAF forecasts, METAR observations, and weather alerts.`,
    },
    breadcrumbs: breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Airports", url: `${SITE_URL}/airports` },
      { name: icao, url: `${SITE_URL}/airports/${icao}` },
    ]),
  };
}

export function blogPostMeta(post: { slug: string; title: string; description: string; date: string }) {
  return {
    title: post.title,
    description: post.description,
    canonical: `${SITE_URL}/blog/${post.slug}`,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      author: { "@type": "Organization", name: "AERO-SENTINEL" },
      publisher: { "@type": "Organization", name: "AERO-SENTINEL" },
      url: `${SITE_URL}/blog/${post.slug}`,
      image: DEFAULT_IMAGE,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    },
    breadcrumbs: breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Blog", url: `${SITE_URL}/blog` },
      { name: post.title, url: `${SITE_URL}/blog/${post.slug}` },
    ]),
  };
}

export function featureDetailMeta(feature: { slug: string; title: string; description: string }) {
  return {
    title: feature.title,
    description: feature.description,
    canonical: `${SITE_URL}/features/${feature.slug}`,
    breadcrumbs: breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Features", url: `${SITE_URL}/features` },
      { name: feature.title, url: `${SITE_URL}/features/${feature.slug}` },
    ]),
  };
}

export function useCaseDetailMeta(useCase: { slug: string; title: string; description: string }) {
  return {
    title: useCase.title,
    description: useCase.description,
    canonical: `${SITE_URL}/use-cases/${useCase.slug}`,
    breadcrumbs: breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Use Cases", url: `${SITE_URL}/use-cases` },
      { name: useCase.title, url: `${SITE_URL}/use-cases/${useCase.slug}` },
    ]),
  };
}

// ── FAQ JSON-LD builder ──────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

export function faqJsonLd(items: FAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
