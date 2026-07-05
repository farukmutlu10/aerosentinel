import { useEffect, useRef, useState, useCallback } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useWatchlist } from "@/context/WatchlistContext";
import { useAlertSnooze } from "@/hooks/useAlertSnooze";

// ─── V4 key: bump when seenIds persistence logic changes ─────────────────────
// V3→V4: Fixed over-persistence bug where watchlist-filtered alerts were added
// to seenIds, permanently suppressing notifications after watchlist changes.
const SEEN_KEY = "aero-notif-seen-ids-v4";

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

function loadSeenIds(): Set<number> {
  // Clean up old v3 key (migration from v3→v4 seenIds logic)
  try { localStorage.removeItem("aero-notif-seen-ids-v3"); } catch { /* ignore */ }
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
  const effectiveIcaosRef = useRef(effectiveIcaos);
  // Keep ref in sync with latest effectiveIcaos
  effectiveIcaosRef.current = effectiveIcaos;

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

  // ─── watchlist-synced listener: re-check alerts when watchlist changes ──────
  // When the watchlist syncs to backend, the API may return different alerts.
  // Invalidate the query so the next poll returns fresh data filtered by the
  // correct watchlist. Also reset isFirstFetch so the new data set is properly
  // suppressed (all existing alerts marked as seen).
  useEffect(() => {
    const handleWatchlistSynced = () => {
      log("watchlist-synced: resetting isFirstFetch and invalidating queries");
      isFirstFetch.current = true;
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
    };
    window.addEventListener("watchlist-synced", handleWatchlistSynced);
    return () => window.removeEventListener("watchlist-synced", handleWatchlistSynced);
  }, [queryClient]);

  // ─── Polling — useListAlerts ile (Alerts sayfasıyla aynı API) ──────────────
  const { data: allAlerts, error: recentError, isLoading } = useListAlerts(
    { limit: 100, since_hours: 6 } as any,
    { query: { queryKey: getListAlertsQueryKey({ limit: 100, since_hours: 6 } as any), staleTime: 0, refetchInterval: 30_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  useEffect(() => { if (recentError) log("⚠️ API HATASI:", recentError.message || recentError); }, [recentError]);

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    // Cookie consent guard — only blocks browser notifications (Notification API).
    // In-app toasts and sounds are core app functionality and work without consent.
    const raw = localStorage.getItem('aero-cookie-consent');
    const consent = raw ? JSON.parse(raw) : null;
    const hasCookieConsent = !!consent;

    // ─── FIRST-FETCH SUPPRESSION ──────────────────────────────────────────────
    // On the first successful API response (allAlerts is defined, not undefined),
    // mark all existing alerts as seen. This prevents notifications for
    // pre-existing alerts on page load.
    // IMPORTANT: Only clear isFirstFetch when allAlerts is DEFINED (not loading).
    // Previously it was cleared on undefined (loading state), which meant the
    // actual first data arrival bypassed suppression.
    if (isFirstFetch.current) {
      // Wait for actual data — don't clear the flag on loading state (undefined)
      if (allAlerts === undefined) {
        log("First-fetch: still loading (allAlerts=undefined), waiting...");
        return;
      }
      isFirstFetch.current = false;

      if (!allAlerts.length) {
        log("First-fetch: empty data set, 0 existing alerts to suppress");
        return;
      }

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
    let skippedWatchlist = 0;
    let skippedSnooze = 0;
    let skippedSeen = 0;
    const hasPermission = typeof Notification !== "undefined" && Notification.permission === "granted";

    // Use ref to get the latest effectiveIcaos (avoids stale closure issues)
    const currentIcaos = effectiveIcaosRef.current;
    const watchlistSet = new Set(currentIcaos.map(s => s.toUpperCase()));

    for (const alert of allAlerts) {
      // Already seen → skip silently (don't add again)
      if (seenIds.current.has(alert.id)) { skippedSeen++; continue; }

      // Watchlist filter — do NOT add to seenIds (watchlist may change later)
      if (watchlistSet.size > 0 && !watchlistSet.has(alert.icao.toUpperCase())) {
        skippedWatchlist++;
        continue;
      }

      // Snooze filter — do NOT add to seenIds (snooze will expire later)
      if (isSnoozed(alert.icao)) {
        skippedSnooze++;
        continue;
      }

      // ─── Genuinely new alert → mark as seen and notify ──────────────────
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

    // Only save seenIds when new alerts were actually processed (not skipped)
    if (newAlertCount > 0) saveSeenIds(seenIds.current);

    const totalSkipped = skippedWatchlist + skippedSnooze + skippedSeen;
    if (totalSkipped > 0) log(`⏭️ ${totalSkipped} atlandı (seen=${skippedSeen} watchlist=${skippedWatchlist} snooze=${skippedSnooze})`);
    if (newAlertCount === 0) log("Yeni alert yok (tümü seenIds'de veya filtrelenmiş)");
    else log(`✅ ${newAlertCount} yeni alert için bildirim gönderildi`);
  }, [allAlerts, playAlert, effectiveIcaos, isSnoozed]);

  // ─── Periodic backend refresh trigger ───────────────────────────────────
  // Calls /api/alerts/summary?refresh=1 every 2 minutes to trigger the backend
  // to scan for new weather data and create alert records.
  useEffect(() => {
    const REFRESH_INTERVAL = 120_000; // 2 minutes
    const intervalId = setInterval(() => {
      fetch("/api/alerts/summary?refresh=1").catch(() => {});
    }, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  return { forceCheck, pendingToasts, dismissToast };
}
