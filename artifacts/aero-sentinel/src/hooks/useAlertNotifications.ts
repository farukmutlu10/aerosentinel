import { useEffect, useRef, useState, useCallback } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useWatchlist } from "@/context/WatchlistContext";
import { useAlertSnooze } from "@/hooks/useAlertSnooze";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
  WX_EXTREME: "Extreme Weather",
  WIND_EXTREME: "Extreme Wind",
  LIFR: "Low IFR (LIFR)",
};

const AUTO_CLOSE_MS = 30_000;
const LOG = "[AeroNotif]";
const log = (...args: unknown[]) => console.log(LOG, new Date().toISOString(), ...args);

// ─── Persisted seen-alert tracker ───────────────────────────────────────────
const SEEN_KEY = "aero-notif-seen-ids-v3";

function loadSeenIds(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((n) => typeof n === "number"));
    return new Set();
  } catch { return new Set(); }
}

function saveSeenIds(ids: Set<number>) {
  try {
    // En fazla son 500 ID'yi sakla
    const arr = [...ids].sort((a, b) => b - a).slice(0, 500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// ─── Notification helpers — SW önce, native fallback ───────────────────────
async function showSWNotification(title: string, options: NotificationOptions): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    if (!registration || Notification.permission !== "granted") return false;
    await registration.showNotification(title, { ...options, icon: options.icon || `${self.location.origin}/alert-icon.png?v=7` });
    return true;
  } catch (err) { log("⚠️ SW notification hatası:", err); return false; }
}

function showNativeNotification(title: string, options: NotificationOptions): Notification | null {
  try { return new Notification(title, options); } catch (err) { log("⚠️ Native notification hatası:", err); return null; }
}

// SW önce dene (Windows'ta daha güvenilir), native fallback
async function sendNotification(title: string, options: NotificationOptions): Promise<Notification | null> {
  const swSent = await showSWNotification(title, options);
  if (swSent) return null; // SW başarılı — native'e gerek yok
  return showNativeNotification(title, options);
}

export function useAlertNotifications() {
  const { play: playAlert } = useAlertSound();
  const { effectiveIcaos } = useWatchlist();
  const { isSnoozed } = useAlertSnooze();
  const [pendingToasts, setPendingToasts] = useState<Array<{
    id: string;
    title: string;
    icao: string;
    alertId: number;
    alertType: string;
  }>>([]);
  const seenIds = useRef<Set<number>>(loadSeenIds());
  const queryClient = useQueryClient();

  // ─── FIRST-FETCH SUPPRESSION ──────────────────────────────────────────────
  // On the first successful API response, mark all existing alerts as seen.
  // This prevents notifications for pre-existing alerts on page load.
  // After the first fetch, only truly new alerts trigger notifications.
  const isFirstFetch = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setPendingToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Cross-tab localStorage senkronizasyonu ───────────────────────────────
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SEEN_KEY && e.newValue) {
        try {
          const arr = JSON.parse(e.newValue) as number[];
          if (Array.isArray(arr)) {
            seenIds.current = new Set(arr.filter((n) => typeof n === "number"));
            log(`Cross-tab sync: seenIds güncellendi (${seenIds.current.size} entries)`);
          }
        } catch { /* ignore parse errors */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const forceCheck = useCallback(async () => {
    log("forceCheck: query invalidation tetikleniyor");
    await queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
  }, [queryClient]);

  // ─── Polling — useListAlerts ile (Alerts sayfasıyla aynı API) ──────────────
  const { data: allAlerts, error: recentError, isLoading, dataUpdatedAt } = useListAlerts(
    { limit: 100, since_hours: 6 } as any,
    { query: { queryKey: getListAlertsQueryKey({ limit: 100, since_hours: 6 } as any), staleTime: 0, refetchInterval: 30_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  // ─── DIAGNOSTIC: Log polling data changes ──────────────────────────────
  useEffect(() => {
    log(`[DIAG] Polling data güncellendi: alerts=${allAlerts?.length ?? "undefined"} updatedAt=${dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : "never"} isLoading=${isLoading}`);
  }, [allAlerts, dataUpdatedAt, isLoading]);

  useEffect(() => { if (recentError) log("⚠️ API HATASI:", recentError.message || recentError); }, [recentError]);

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    // ─── DIAGNOSTIC LOG: Log every effect invocation ─────────────────────
    const alertIds = allAlerts?.map(a => a.id) ?? [];
    log(`[DIAG] Effect tetiklendi: allAlerts=${allAlerts?.length ?? "undefined"} ids=[${alertIds.slice(0, 5).join(",")}${alertIds.length > 5 ? "..." : ""}] isFirstFetch=${isFirstFetch.current} seenIds=${seenIds.current.size} consent=${!!localStorage.getItem('aero-cookie-consent')}`);

    // Cookie consent guard — only blocks browser notifications (Notification API).
    // In-app toasts and sounds are core app functionality and work without consent.
    // Alerts are still marked as seen to prevent notification flood when consent is later granted.
    const raw = localStorage.getItem('aero-cookie-consent');
    const consent = raw ? JSON.parse(raw) : null;
    const hasCookieConsent = !!consent;
    if (!hasCookieConsent) {
      log(`[DIAG] Cookie consent yok — browser notification engellendi ama in-app toast ve ses çalışacak`);
    }

    // ─── FIRST-FETCH SUPPRESSION: Advance isFirstFetch BEFORE empty check ─
    // BUG FIX: Previously, isFirstFetch stayed true if the first fetch returned
    // empty data. When alerts arrived on subsequent fetches, they were ALL
    // suppressed as "pre-existing" — no notifications ever fired.
    // Now: isFirstFetch is set to false on the first effect run WITH data,
    // regardless of whether the array is empty or not.
    if (isFirstFetch.current) {
      if (!allAlerts?.length) {
        // First effect run but no data yet — advance the flag so the NEXT
        // fetch with data triggers normal notification logic instead of
        // being silently suppressed.
        isFirstFetch.current = false;
        log(`[DIAG] First-fetch: data empty, isFirstFetch → false (next fetch with data will trigger notifications)`);
        return;
      }
      isFirstFetch.current = false;
      const existingIds = allAlerts
        .map(a => a.id)
        .filter((id): id is number => id != null && !seenIds.current.has(id));
      if (existingIds.length > 0) {
        for (const id of existingIds) seenIds.current.add(id);
        saveSeenIds(seenIds.current);
      }
      log(`First-fetch suppression: ${existingIds.length} existing alerts marked as seen, 0 notifications`);
      return; // No notifications for pre-existing alerts
    }

    if (!allAlerts?.length) { log("⚠️ alerts verisi boş — bildirim tetiklenemez"); return; }

    // ─── NORMAL NOTIFICATION LOGIC: Process genuinely new alerts ──────────
    let newAlertCount = 0;
    let skippedCount = 0;
    const hasPermission = typeof Notification !== "undefined" && Notification.permission === "granted";

    const watchlistSet = new Set(effectiveIcaos.map(s => s.toUpperCase()));

    for (const alert of allAlerts) {
      if (seenIds.current.has(alert.id)) continue;

      // Watchlist filtresi
      if (watchlistSet.size > 0 && !watchlistSet.has(alert.icao.toUpperCase())) {
        skippedCount++;
        seenIds.current.add(alert.id);
        continue;
      }

      // Snooze filter
      if (isSnoozed(alert.icao)) {
        skippedCount++;
        seenIds.current.add(alert.id);
        continue;
      }

      seenIds.current.add(alert.id);
      newAlertCount++;

      const label = TYPE_LABELS[alert.type] ?? alert.type;
      const title = `AERO-SENTINEL — ${label}`;
      const body = `${alert.icao}: ${alert.rawText.slice(0, 120)}`;
      const icon = `${import.meta.env.BASE_URL}alert-icon.png?v=7`;

      log("🔔 YENİ ALERT BİLDİRİM:", alert.id, alert.type, alert.icao);

      // Browser notification gönder (izin + cookie consent varsa)
      if (hasPermission && hasCookieConsent) {
        sendNotification(title, { body, icon, tag: `aero-alert-${alert.icao}-${alert.id}`, requireInteraction: false }).then((n) => {
          if (n) {
            const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
            n.onclick = () => { clearTimeout(timer); window.location.href = "/alerts"; n.close(); };
            n.onclose = () => clearTimeout(timer);
          }
        });
      }

      // Her durumda in-app toast göster (izin olmasa bile)
      const toastId = `toast-${alert.id}-${Date.now()}`;
      setPendingToasts(prev => [...prev, {
        id: toastId,
        title: `${TYPE_LABELS[alert.type] ?? alert.type}`,
        icao: alert.icao,
        alertId: alert.id,
        alertType: alert.type,
      }]);

      // Ses çal
      try { playAlert(); } catch { /* ignore */ }
    }

    // seenIds'i localStorage'a kaydet
    if (newAlertCount > 0 || skippedCount > 0) saveSeenIds(seenIds.current);

    if (skippedCount > 0) log(`⏭️ ${skippedCount} alert atlandı (watchlist dışı veya duplicate)`);
    if (newAlertCount === 0) log(`[DIAG] Yeni alert yok — toplam ${allAlerts.length} alert incelendi, seenIds=${seenIds.current.size}`);
    else log(`✅ ${newAlertCount} yeni alert için bildirim gönderildi`);
  }, [allAlerts, playAlert, effectiveIcaos, isSnoozed]);

  // ─── Periodic backend refresh trigger ───────────────────────────────────
  // Calls /api/alerts/summary?refresh=1 every 2 minutes to trigger the backend
  // to scan for new weather data and create alert records. Without this,
  // the backend may not create new alerts until explicitly triggered.
  useEffect(() => {
    const REFRESH_INTERVAL = 120_000; // 2 minutes
    const intervalId = setInterval(() => {
      log("[DIAG] Periodic backend refresh tetikleniyor...");
      fetch("/api/alerts/summary?refresh=1").then(r => {
        log(`[DIAG] Backend refresh response: ${r.status}`);
      }).catch(err => {
        log("[DIAG] Backend refresh hatası:", err);
      });
    }, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  return { forceCheck, pendingToasts, dismissToast };
}
