import { useEffect, useRef, useState } from "react";
import { useGetRecentAlerts, getGetRecentAlertsQueryKey } from "@workspace/api-client-react";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI:   "SPECI Alert",
};

export function useAlertNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const seenIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  const { data: recent } = useGetRecentAlerts({
    query: {
      queryKey: getGetRecentAlertsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  // Sync permission state if it changed externally
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  // Watch for new alerts and fire notifications
  useEffect(() => {
    if (!recent?.length) return;
    if (permission !== "granted") return;

    if (!initialized.current) {
      recent.forEach((a) => seenIds.current.add(a.id));
      initialized.current = true;
      return;
    }

    for (const alert of recent) {
      if (seenIds.current.has(alert.id)) continue;
      seenIds.current.add(alert.id);

      const title = `AJET AERO-SENTINEL — ${TYPE_LABELS[alert.type] ?? alert.type}`;
      const body = `${alert.icao}: ${alert.rawText.slice(0, 120)}`;

      try {
        const n = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: `aero-alert-${alert.id}`,
          requireInteraction: true,
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch {
        // unavailable
      }
    }
  }, [recent, permission]);

  // Must be called directly from a user gesture (button click)
  const requestPermission = () => {
    if (typeof Notification === "undefined") return;
    // Using callback form for broadest browser compat
    Notification.requestPermission(function (p) {
      setPermission(p);
      if (p === "granted") {
        initialized.current = false; // re-seed so we don't spam old alerts
      }
    });
  };

  return { permission, requestPermission };
}
