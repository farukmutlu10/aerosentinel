import ReactGA from "react-ga4";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/**
 * Google Analytics'i başlatır.
 * VITE_GA_MEASUREMENT_ID env değişkeni tanımlıysa aktif olur.
 */
export function initGA(): void {
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
