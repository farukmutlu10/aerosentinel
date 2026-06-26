import { useEffect } from "react";
import { getCookieConsent } from "./CookieConsent";

/**
 * Loads Google AdSense script only when user has given consent.
 * Must be rendered inside the App after CookieConsent check.
 */
export function AdSenseConsent() {
  useEffect(() => {
    const consent = getCookieConsent();
    if (consent !== "accepted") return;

    // Avoid duplicate script injection
    if (document.querySelector('script[data-adsense-consent]')) return;

    const script = document.createElement("script");
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2662411656601000";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-adsense-consent", "true");
    document.head.appendChild(script);
  }, []);

  // Re-check consent whenever localStorage changes (e.g. from Privacy page)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "aero-cookie-consent" && e.newValue === "accepted") {
        if (!document.querySelector('script[data-adsense-consent]')) {
          const script = document.createElement("script");
          script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2662411656601000";
          script.async = true;
          script.crossOrigin = "anonymous";
          script.setAttribute("data-adsense-consent", "true");
          document.head.appendChild(script);
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return null;
}
