import { useEffect, useRef, useState } from "react";
import { useGetRecentAlerts, getGetRecentAlertsQueryKey, listAlerts } from "@workspace/api-client-react";
import { useAlertSound } from "@/hooks/useAlertSound";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
};

const AUTO_CLOSE_MS = 60_000; // 60 saniye sonra otomatik kapat

export function useAlertNotifications() {
  const { play: playAlert } = useAlertSound();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const [deniedDismissed, setDeniedDismissed] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);
  const openNotifs = useRef<Map<number, Notification>>(new Map());

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    const wasDismissed = sessionStorage.getItem("notif-dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  // Yeni eklenen meydanlar için mevcut alert'leri seenIds'e ekle (notification tetiklemesin)
  useEffect(() => {
    const handler = async (e: Event) => {
      const icao = (e as CustomEvent<string>).detail;
      if (!icao) return;
      try {
        const alerts = await listAlerts({ icao, limit: 50 });
        alerts.forEach((a) => seenIds.current.add(a.id));
      } catch {}
    };
    window.addEventListener("watchlist-airport-added", handler);
    return () => window.removeEventListener("watchlist-airport-added", handler);
  }, []);

  const { data: recent } = useGetRecentAlerts({
    query: {
      queryKey: getGetRecentAlertsQueryKey(),
      refetchInterval: 180_000,
      refetchIntervalInBackground: true,
    },
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
          `AERO-SENTINEL — ${TYPE_LABELS[alert.type] ?? alert.type}`,
          {
            body: `${alert.icao}: ${alert.rawText.slice(0, 120)}\n\nTıklayarak onaylayabilirsiniz.`,
            icon: `${import.meta.env.BASE_URL}alert-icon.svg`,
            tag: `aero-alert-${alert.id}`,
            requireInteraction: false,
          }
        );
        openNotifs.current.set(alert.id, n);

        playAlert();

        // Auto-dismiss after 60 seconds
        const timer = setTimeout(() => {
          n.close();
          openNotifs.current.delete(alert.id);
        }, AUTO_CLOSE_MS);

        n.onclick = () => {
          clearTimeout(timer);
          window.focus();
          n.close();
          openNotifs.current.delete(alert.id);
        };

        n.onclose = () => {
          clearTimeout(timer);
          openNotifs.current.delete(alert.id);
        };
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
      Notification.requestPermission((p) => setPermission(p));
    }
  };

  const dismiss = () => {
    sessionStorage.setItem("notif-dismissed", "1");
    setDismissed(true);
    setDeniedDismissed(true);
  };

  const showBanner = permission === "default" && !dismissed;

  return { permission, requestPermission, dismiss, showBanner, dismissed };
}
