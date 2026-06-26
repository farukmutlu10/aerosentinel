import { useState, useEffect } from "react";
import { Link } from "wouter";

const COOKIE_KEY = "aero-cookie-consent";
type ConsentStatus = "accepted" | "rejected" | null;

export function getCookieConsent(): ConsentStatus {
  const val = localStorage.getItem(COOKIE_KEY);
  if (val === "accepted" || val === "rejected") return val;
  return null;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (!consent) setVisible(true);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_KEY, "accepted");
    // GA Consent Mode v2 — grant analytics and ads
    window.gtag?.("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "granted",
    });
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_KEY, "rejected");
    // GA Consent Mode v2 — deny analytics and ads
    window.gtag?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
    });
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}>
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 border border-primary/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
                <path d="M8.5 8.5v.01"/>
                <path d="M16 15.5v.01"/>
                <path d="M12 12v.01"/>
                <path d="M11 17v.01"/>
                <path d="M7 14v.01"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-bold text-foreground tracking-wide">
                Cookie Preferences
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-1.5 leading-relaxed">
                We use cookies and similar technologies to enhance your experience,
                analyze site traffic, and serve relevant advertisements. You can choose
                which cookies to allow below.
              </p>
              <p className="text-[10px] text-muted-foreground/60 font-mono mt-1.5">
                Learn more in our{" "}
                <Link href="/privacy" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                  Privacy Policy
                </Link>.
              </p>
            </div>
          </div>
        </div>
        <div className="flex border-t border-border/60">
          <button
            onClick={handleAccept}
            className="flex-1 px-4 py-3 text-xs sm:text-sm font-mono font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
          >
            Accept All
          </button>
          <div className="w-px bg-border/60" />
          <button
            onClick={handleReject}
            className="flex-1 px-4 py-3 text-xs sm:text-sm font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            Reject All
          </button>
        </div>
      </div>
    </div>
  );
}
