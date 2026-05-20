import { useEffect, useRef, useState } from "react";
import { useGetRecentAlerts, getGetRecentAlertsQueryKey } from "@workspace/api-client-react";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
};

export function useAlertNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    const wasDismissed = sessionStorage.getItem("notif-dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  const { data: recent } = useGetRecentAlerts({
    query: { queryKey: getGetRecentAlertsQueryKey(), refetchInterval: 30_000 },
  });

  useEffect(() => {
    if (!recent?.length || permission !== "granted") return;
    if (!initialized.current) {
      recent.forEach((a) => seenIds.current.add(a.id));
      initialized.current = true;
      return;
    }
    for (const alert of recent) {
      if (seenIds.current.has(alert.id)) continue;
      seenIds.current.add(alert.id);
      try {
        const n = new Notification(
          `AJET AERO-SENTINEL — ${TYPE_LABELS[alert.type] ?? alert.type}`,
          {
            body: `${alert.icao}: ${alert.rawText.slice(0, 120)}`,
            icon: "/favicon.ico",
            tag: `aero-alert-${alert.id}`,
            requireInteraction: true,
          }
        );
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    }
  }, [recent, permission]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        initialized.current = false;
        sessionStorage.removeItem("notif-dismissed");
        setDismissed(false);
      }
    } catch {
      // Safari fallback
      Notification.requestPermission((p) => {
        setPermission(p);
      });
    }
  };

  const dismiss = () => {
    sessionStorage.setItem("notif-dismissed", "1");
    setDismissed(true);
  };

  const showBanner = permission === "default" && !dismissed;

  return { permission, requestPermission, dismiss, showBanner };
}
