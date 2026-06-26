import { useEffect } from "react";
import { getCookiePreferences } from "./CookieConsent";

function loadAdSense() {
  // Avoid duplicate script injection
  if (document.querySelector('script[data-adsense-consent]')) return;

  const script = document.createElement("script");
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2662411656601000";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-adsense-consent", "true");
  document.head.appendChild(script);
}

/**
 * Loads Google AdSense script only when user has given marketing consent.
 * Must be rendered inside the App after CookieConsent check.
 */
export function AdSenseConsent() {
  useEffect(() => {
    const prefs = getCookiePreferences();
    if (!prefs?.marketing) return;
    loadAdSense();
  }, []);

  // Re-check consent whenever localStorage changes (e.g. from Privacy page)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== "aero-cookie-consent") return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null;
        if (parsed?.marketing === true) {
          loadAdSense();
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return null;
}
