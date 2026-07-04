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
const SEEN_KEY = "aero-notif-seen-ids-v2";

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

  // ─── TIME-BASED SUPPRESSION (bulletproof) ────────────────────────────────
  // Global timestamp set in main.tsx BEFORE React mounts.
  // This is immune to SW cache, service worker timing, ref resets, etc.
  const APP_START_TIME = (window as any).__APP_START_TIME ?? Date.now();
  const SUPPRESS_MS = 90_000; // 90 seconds — suppress ALL notifications on first load

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
  const { data: allAlerts, error: recentError, isLoading } = useListAlerts(
    { limit: 100, since_hours: 6 } as any,
    { query: { queryKey: getListAlertsQueryKey({ limit: 100, since_hours: 6 } as any), refetchInterval: 30_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  useEffect(() => { if (recentError) log("⚠️ API HATASI:", recentError.message || recentError); }, [recentError]);

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    // Cookie consent guard
    const raw = localStorage.getItem('aero-cookie-consent');
    const consent = raw ? JSON.parse(raw) : null;
    if (!consent) {
      // Mark alerts as seen even without consent to prevent notification flood
      // when consent is later granted — but don't send any notifications
      if (allAlerts?.length) {
        let marked = 0;
        for (const alert of allAlerts) {
          if (!seenIds.current.has(alert.id)) {
            seenIds.current.add(alert.id);
            marked++;
          }
        }
        if (marked > 0) saveSeenIds(seenIds.current);
        log(`⏳ Cookie consent yok — ${marked} alert seenIds'e eklendi (bildirim gönderilmedi)`);
      }
      return;
    }

    if (!allAlerts?.length) { log("⚠️ alerts verisi boş — bildirim tetiklenemez"); return; }

    // ─── TIME-BASED SUPPRESSION: Within first 90 seconds, mark ALL as seen ─
    const elapsed = Date.now() - APP_START_TIME;
    if (elapsed < SUPPRESS_MS) {
      const newIds = allAlerts
        .map(a => a.id)
        .filter((id): id is number => id != null && !seenIds.current.has(id));
      if (newIds.length > 0) {
        for (const id of newIds) seenIds.current.add(id);
        saveSeenIds(seenIds.current);
      }
      log(`Time-gate suppression (${Math.round(elapsed / 1000)}s < ${SUPPRESS_MS / 1000}s): ${newIds.length} alerts marked as seen, 0 notifications`);
      return; // NO notifications during first 90 seconds
    }

    // ─── AFTER 90 SECONDS: Normal notification logic ──────────────────────
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

      // Browser notification gönder (izin varsa)
      if (hasPermission) {
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
    if (newAlertCount === 0) log("Yeni alert yok (tümü seenIds'de veya duplicate)");
    else log(`✅ ${newAlertCount} yeni alert için bildirim gönderildi`);
  }, [allAlerts, playAlert, effectiveIcaos, isSnoozed]);

  return { forceCheck, pendingToasts, dismissToast };
}
