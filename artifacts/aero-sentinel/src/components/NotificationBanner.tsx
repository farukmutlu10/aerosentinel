/**
 * Custom notification permission banner.
 *
 * - Appears AFTER cookie consent is given (not before)
 * - Only shows if Notification.permission === "default"
 * - User clicks "Allow" → Notification.requestPermission() → Chrome native popup
 * - User clicks "No thanks" → saved to localStorage, never shown again
 * - This is our own UI — NOT the Chrome popup
 */

import { useState, useEffect } from "react";

const NOTIFICATION_BANNER_KEY = "aero-notification-dismissed";

export function NotificationBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Only show if cookie consent was given AND notification hasn't been asked yet
    const consentRaw = localStorage.getItem("aero-cookie-consent");
    const dismissed = localStorage.getItem(NOTIFICATION_BANNER_KEY);

    if (!consentRaw || dismissed) return;
    if (Notification.permission !== "default") return;

    // 2-second delay — wait for the cookie consent banner to close first
    const timer = setTimeout(() => setShowBanner(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleAllow = async () => {
    const result = await Notification.requestPermission();
    // result: 'granted', 'denied', or 'default'
    localStorage.setItem(NOTIFICATION_BANNER_KEY, "true");
    setShowBanner(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(NOTIFICATION_BANNER_KEY, "true");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-4 py-3 shadow-lg">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        {/* Bell icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Stay Updated
          </p>
          <p className="text-xs text-muted-foreground">
            Get instant alerts when weather conditions change at your airports.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAllow}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Allow
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80 transition-colors"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
