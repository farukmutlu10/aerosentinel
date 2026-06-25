import { useEffect, useRef, useState, useCallback } from "react";
import { useGetRecentAlerts, getGetRecentAlertsQueryKey, listAlerts } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAlertSound } from "@/hooks/useAlertSound";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
};

const AUTO_CLOSE_MS = 30_000;

// ─── Service Worker ile notification göster ───────────────────────────────────
// Service Worker notification'ları Opera dahil TÜM tarayıcılarda çalışır.
// `new Notification()` Opera'da sessizce başarısız olabilir.
async function showSWNotification(
  title: string,
  options: NotificationOptions
): Promise<boolean> {
  try {
    // Service Worker kullanılabilir mi?
    if (!("serviceWorker" in navigator)) return false;

    const registration = await navigator.serviceWorker.ready;
    if (!registration) return false;

    // Service Worker notification izni var mı?
    if (Notification.permission !== "granted") return false;

    await registration.showNotification(title, {
      ...options,
      // SW notification'larda icon zorunlu — PNG kullan
      icon: options.icon || `${self.location.origin}/alert-icon.png`,
    });
    return true;
  } catch (err) {
    console.warn("[AeroNotif] SW notification hatası:", err);
    return false;
  }
}

// ─── Fallback: `new Notification()` ──────────────────────────────────────────
// SW çalışmıyorsa (eski tarayıcılar) native notification dene
function showNativeNotification(
  title: string,
  options: NotificationOptions
): Notification | null {
  try {
    return new Notification(title, options);
  } catch (err) {
    console.warn("[AeroNotif] Native notification hatası:", err);
    return null;
  }
}

// ─── Bildirim gönder (öncelik: SW → Native) ─────────────────────────────────
async function sendNotification(
  title: string,
  options: NotificationOptions
): Promise<Notification | null> {
  // 1. Service Worker notification dene (Opera dahil her yerde çalışır)
  const swOk = await showSWNotification(title, options);
  if (swOk) return null; // SW notification başarılı, native'e gerek yok

  // 2. Fallback: native Notification
  return showNativeNotification(title, options);
}

// ─── sessionStorage key ──────────────────────────────────────────────────────
const INIT_KEY = "alert-notifications-initialized";

export function useAlertNotifications() {
  const { play: playAlert } = useAlertSound();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const openNotifs = useRef<Map<number, Notification>>(new Map());
  const queryClient = useQueryClient();
  const isFirstLoad = useRef(true);

  // ─── İlk yükleme: permission ve dismissed kontrolü ────────────────────────
  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    const wasDismissed = sessionStorage.getItem("notif-dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  // ─── Yeni eklenen meydanlar için seenIds'e ekle ───────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const icao = (e as CustomEvent<string>).detail;
      if (!icao) return;
      try {
        const alerts = await listAlerts({ icao, limit: 50 });
        alerts.forEach((a) => seenIds.current.add(a.id));
      } catch { /* ignore */ }
    };
    window.addEventListener("watchlist-airport-added", handler);
    return () => window.removeEventListener("watchlist-airport-added", handler);
  }, []);

  // ─── Manuel bildirim kontrolü ─────────────────────────────────────────────
  const forceCheck = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
  }, [queryClient]);

  // ─── Polling — 15 saniye aralıkla ─────────────────────────────────────────
  const { data: recent, error: recentError } = useGetRecentAlerts({
    query: {
      queryKey: getGetRecentAlertsQueryKey(),
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 3,
    },
  });

  // ─── API hata loglaması ───────────────────────────────────────────────────
  useEffect(() => {
    if (recentError) {
      console.error("[AeroNotif] API hatası:", recentError.message || recentError);
    }
  }, [recentError]);

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    if (!recent?.length) return;

    // İlk yükleme — mevcut alert'leri seenIds'e ekle
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      recent.forEach((a) => seenIds.current.add(a.id));
      if (sessionStorage.getItem(INIT_KEY) !== "1") {
        sessionStorage.setItem(INIT_KEY, "1");
      }
      return;
    }

    // Notification izni yoksa çık
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }

    // Yeni alert'ler için bildirim gönder
    for (const alert of recent) {
      if (seenIds.current.has(alert.id)) continue;
      seenIds.current.add(alert.id);

      const title = `AERO-SENTINEL — ${TYPE_LABELS[alert.type] ?? alert.type}`;
      const body = `${alert.icao}: ${alert.rawText.slice(0, 120)}`;
      const icon = `${import.meta.env.BASE_URL}alert-icon.png`;

      // Bildirim gönder (SW veya Native)
      sendNotification(title, {
        body,
        icon,
        tag: `aero-alert-${alert.id}`,
        requireInteraction: false,
      }).then((n) => {
        // Native notification ise auto-close kur
        if (n) {
          openNotifs.current.set(alert.id, n);
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
        }
      });

      // Ses çal
      try { playAlert(); } catch { /* ignore */ }
    }
  }, [recent, permission, playAlert]);

  // ─── İzin isteme ──────────────────────────────────────────────────────────
  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        sessionStorage.removeItem(INIT_KEY);
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
  };

  const showBanner = permission === "default" && !dismissed;

  return { permission, requestPermission, dismiss, showBanner, dismissed, forceCheck };
}
