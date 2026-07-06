import { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getCookiePreferences } from "@/components/CookieConsent";

const DISMISSED_KEY = "aero-push-prompt-dismissed";

/**
 * Floating prompt that asks users to enable push notifications.
 * Only shown when:
 *   - Push is supported
 *   - Permission is "default" (not yet asked)
 *   - User hasn't dismissed the prompt
 *   - Cookie consent has been given
 */
export function PushNotificationPrompt() {
  const { permission, isSubscribed, isSupported, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = usePersistedState<boolean>(DISMISSED_KEY, false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check cookie consent — re-run whenever CookieConsent dispatches
    // "aero-consent-given" (clicking Accept/Reject) so the prompt can appear
    // right away on first visit, instead of only after a later page reload.
    let cancelTimer: (() => void) | undefined;

    const checkAndSchedule = () => {
      cancelTimer?.();
      cancelTimer = undefined;

      const hasConsent = getCookiePreferences() !== null;

      const shouldShow =
        isSupported &&
        !isSubscribed &&
        permission === "default" &&
        !dismissed &&
        hasConsent;

      if (shouldShow) {
        const timer = setTimeout(() => setVisible(true), 3000);
        cancelTimer = () => clearTimeout(timer);
      } else {
        setVisible(false);
      }
    };

    checkAndSchedule();
    window.addEventListener("aero-consent-given", checkAndSchedule);
    return () => {
      cancelTimer?.();
      window.removeEventListener("aero-consent-given", checkAndSchedule);
    };
  }, [isSupported, isSubscribed, permission, dismissed]);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setVisible(false);
    } else if (permission === "denied") {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground">
              Enable Push Notifications
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Get instant alerts for weather changes at your watched airports — even when the tab is closed.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <BellOff className="h-3.5 w-3.5" />
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
