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

  // Request permission once on mount
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => setPermission(p));
    }
  }, []);

  // Watch for new alerts
  useEffect(() => {
    if (!recent?.length) return;
    if (permission !== "granted") return;

    if (!initialized.current) {
      // On first load, seed seen IDs without firing notifications
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
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Notification API unavailable
      }
    }
  }, [recent, permission]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  };

  return { permission, requestPermission };
}
