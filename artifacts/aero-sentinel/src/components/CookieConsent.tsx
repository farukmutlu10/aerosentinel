import { useState, useEffect } from "react";
import { Link } from "wouter";
import { updateConsent, rejectAllConsent, initGA } from "@/lib/ga";

const COOKIE_KEY = "aero-cookie-consent";

export interface CookiePreferences {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

/**
 * Read current cookie preferences from localStorage.
 * Returns null if the user hasn't made a choice yet.
 */
export function getCookiePreferences(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.analytics === "boolean" && typeof parsed.marketing === "boolean") {
      return { necessary: true, analytics: parsed.analytics, marketing: parsed.marketing };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Backward-compatible helper: returns "accepted" | "rejected" | null
 * based on the new granular preferences.
 */
export function getCookieConsent(): "accepted" | "rejected" | null {
  const prefs = getCookiePreferences();
  if (!prefs) return null;
  return prefs.analytics || prefs.marketing ? "accepted" : "rejected";
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const existing = getCookiePreferences();
    if (!existing) {
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => { clearTimeout(timer); };
    }
    // If already consented, init GA based on stored preferences
    if (existing.analytics) {
      initGA();
    }
    updateConsent({ analytics: existing.analytics, marketing: existing.marketing });
    return undefined;
  }, []);

  // Cross-tab storage event listener
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === COOKIE_KEY) {
        const updated = getCookiePreferences();
        if (updated) {
          setPreferences(updated);
          setVisible(false);
          if (updated.analytics) {
            initGA();
          }
        } else {
          setVisible(true);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const persistAndClose = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(prefs));
    updateConsent({ analytics: prefs.analytics, marketing: prefs.marketing });
    if (prefs.analytics) {
      initGA();
    }
    setVisible(false);
    // NotificationBanner'a haber ver
    window.dispatchEvent(new Event('aero-consent-given'));
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = { necessary: true, analytics: true, marketing: true };
    persistAndClose(allAccepted);
    // Notification.requestPermission() removed — NotificationBanner handles this now
  };

  const handleRejectAll = () => {
    const allRejected: CookiePreferences = { necessary: true, analytics: false, marketing: false };
    localStorage.setItem(COOKIE_KEY, JSON.stringify(allRejected));
    rejectAllConsent();
    setVisible(false);
    // NotificationBanner'a haber ver
    window.dispatchEvent(new Event('aero-consent-given'));
  };

  const handleSavePreferences = () => {
    persistAndClose(preferences);
    // Notification.requestPermission() removed — NotificationBanner handles this now
  };

  const toggleAnalytics = () => {
    setPreferences((prev) => ({ ...prev, analytics: !prev.analytics }));
  };

  const toggleMarketing = () => {
    setPreferences((prev) => ({ ...prev, marketing: !prev.marketing }));
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 sm:pb-4 pb-24 sm:p-4">
      <div
        className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 border border-primary/20 text-lg">
              🍪
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-bold text-foreground tracking-wide">
                We Value Your Privacy
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-1.5 leading-relaxed">
                We use cookies to improve your experience and serve personalized ads.
                You can choose which cookies to allow.
              </p>
              <p className="text-[10px] text-muted-foreground/60 font-mono mt-1.5">
                Learn more in our{" "}
                <Link
                  href="/privacy"
                  className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Expanded Preferences View */}
        {expanded && (
          <div className="px-4 sm:px-6 pb-4 space-y-3 border-t border-border/60 pt-4">
            {/* Necessary Cookies */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔒</span>
                <div>
                  <p className="text-xs font-mono font-bold text-foreground">Necessary</p>
                  <p className="text-[10px] text-muted-foreground font-mono">Required for site functionality</p>
                </div>
              </div>
              <div className="w-10 h-5 rounded-full bg-primary/30 flex items-center justify-end px-0.5 cursor-not-allowed opacity-60">
                <div className="w-4 h-4 rounded-full bg-primary shadow-sm" />
              </div>
            </div>

            {/* Analytics Cookies */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">📊</span>
                <div>
                  <p className="text-xs font-mono font-bold text-foreground">Analytics</p>
                  <p className="text-[10px] text-muted-foreground font-mono">Google Analytics (GA4)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleAnalytics}
                className={`w-10 h-5 rounded-full flex items-center transition-colors px-0.5 ${
                  preferences.analytics
                    ? "bg-primary justify-end"
                    : "bg-muted justify-start"
                }`}
                aria-label="Toggle analytics cookies"
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            {/* Marketing Cookies */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">📢</span>
                <div>
                  <p className="text-xs font-mono font-bold text-foreground">Marketing</p>
                  <p className="text-[10px] text-muted-foreground font-mono">Personalized ads (AdSense)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMarketing}
                className={`w-10 h-5 rounded-full flex items-center transition-colors px-0.5 ${
                  preferences.marketing
                    ? "bg-primary justify-end"
                    : "bg-muted justify-start"
                }`}
                aria-label="Toggle marketing cookies"
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            {/* Save Preferences Button */}
            <button
              onClick={handleSavePreferences}
              className="w-full px-4 py-2.5 text-xs sm:text-sm font-mono font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors rounded-lg mt-2"
            >
              Save Preferences
            </button>
          </div>
        )}

        {/* Bottom Action Buttons */}
        {!expanded && (
          <div className="flex border-t border-border/60">
            <button
              onClick={handleAcceptAll}
              className="flex-1 px-4 py-3 text-xs sm:text-sm font-mono font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
            >
              Accept All
            </button>
            <div className="w-px bg-border/60" />
            <button
              onClick={handleRejectAll}
              className="flex-1 px-4 py-3 text-xs sm:text-sm font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              Reject All
            </button>
            <div className="w-px bg-border/60" />
            <button
              onClick={() => setExpanded(true)}
              className="flex-1 px-4 py-3 text-xs sm:text-sm font-mono font-bold text-sky-400 hover:text-sky-300 hover:bg-muted/30 transition-colors"
            >
              Manage Preferences
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
