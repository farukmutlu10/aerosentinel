import ReactGA from "react-ga4";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/**
 * Google Analytics'i başlatır.
 * VITE_GA_MEASUREMENT_ID env değişkeni tanımlıysa aktif olur.
 */
export function initGA(): void {
  // Consent Mode v2 defaults — sadece index.html'de tanımlı (gtag('consent', 'default', ...))
  // Burada tekrar tetiklemiyoruz çünkü React GA initialize ettiğinde consent defaults zaten çalışmış olur.

  if (!GA_MEASUREMENT_ID) {
    console.info("[GA] Measurement ID tanımlı değil — Analytics devre dışı.");
    return;
  }

  ReactGA.initialize(GA_MEASUREMENT_ID, {
    gaOptions: {
      // Gizlilik dostu ayarlar
      anonymizeIp: true,
      allowGoogleSignals: false,
    },
  });

  console.info("[GA] Google Analytics başlatıldı.");
}

/**
 * Consent Mode v2 — update consent based on user preferences.
 * Called when user accepts all, rejects all, or saves granular preferences.
 */
export function updateConsent(preferences: { analytics: boolean; marketing: boolean }): void {
  window.gtag?.("consent", "update", {
    analytics_storage: preferences.analytics ? "granted" : "denied",
    ad_storage: preferences.marketing ? "granted" : "denied",
    ad_user_data: preferences.marketing ? "granted" : "denied",
    ad_personalization: preferences.marketing ? "granted" : "denied",
  });
}

/**
 * Consent Mode v2 — reject all consent.
 * Called when user clicks "Reject All".
 */
export function rejectAllConsent(): void {
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

/**
 * Sayfa görüntülemesi gönderir.
 * @param pagePath — Örn: "/dashboard", "/alerts", "/airports/LTFH"
 */
export function trackPageView(pagePath: string): void {
  if (!GA_MEASUREMENT_ID) return;

  ReactGA.send({
    hitType: "pageview",
    page: pagePath,
  });
}

/**
 * Özel event gönderir.
 * @param category — Örn: "Watchlist", "Alert", "Navigation"
 * @param action — Örn: "add_airport", "remove_airport", "click"
 * @param label — Opsiyonel etiket
 * @param value — Opsiyonel sayısal değer
 */
export function trackEvent(
  category: string,
  action: string,
  label?: string,
  value?: number,
): void {
  if (!GA_MEASUREMENT_ID) return;

  ReactGA.event({
    category,
    action,
    label,
    value,
  });
}
