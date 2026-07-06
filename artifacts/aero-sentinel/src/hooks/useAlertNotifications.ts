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
const log = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(LOG, new Date().toISOString(), ...args);
};

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

/** Ortak "N new alerts" özet metni — havalimanı ve tür kırılımıyla. */
function buildBatchSummary(alerts: Array<{ icao: string; type: string }>): { body: string; icaoCount: number } {
  const typeCounts: Record<string, number> = {};
  const icaos = new Set<string>();
  for (const a of alerts) {
    typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1;
    icaos.add(a.icao);
  }
  const parts = Object.entries(typeCounts).map(([type, count]) => `${count} ${TYPE_LABELS[type] ?? type}`);
  return { body: `${icaos.size} airport(s): ${parts.join(", ")}`, icaoCount: icaos.size };
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
    isSummary?: boolean;
  }>>([]);
  const seenIds = useRef<Set<number>>(loadSeenIds());
  const queryClient = useQueryClient();
  const effectiveIcaosRef = useRef(effectiveIcaos);
  // Keep ref in sync with latest effectiveIcaos
  effectiveIcaosRef.current = effectiveIcaos;

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
  // When the watchlist syncs to backend, the API may return a different set
  // of alerts (new ICAOs, removed ICAOs). Invalidate so the next poll reflects it.
  useEffect(() => {
    const handleWatchlistSynced = () => {
      log("watchlist-synced: invalidating queries");
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
    };
    window.addEventListener("watchlist-synced", handleWatchlistSynced);
    return () => window.removeEventListener("watchlist-synced", handleWatchlistSynced);
  }, [queryClient]);

  // ─── Background tab throttling compensation ────────────────────────────────
  // Chrome throttles JS timers (including setInterval/setTimeout) to once per
  // minute when a tab is in the background. This means refetchInterval: 30_000
  // actually fires ~every 60s when the tab is hidden. To compensate, listen for
  // visibilitychange and immediately invalidate queries when the user returns to
  // the tab, so any missed polls are instantly caught up.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        log("Tab visible — invalidating queries to compensate for background throttling");
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  // ─── Polling — useListAlerts ile (Alerts sayfasıyla aynı API) ──────────────
  // refetchIntervalInBackground MUTLAKA true olmalı: kullanıcı sekmeyi arka
  // planda/ikinci monitörde açık tutuyorsa (dispatcher/pilot kullanım senaryosu),
  // visibilitychange handler'ı SADECE sekmeye geri dönüldüğünde yakalar — sekme
  // arka planda kaldığı sürece hiç invalidate etmez. Chrome yine de arka plan
  // timer'larını ~60sn'ye throttle eder ama bu, "sekme odakta değilken hiç
  // güncellenmiyor" durumundan çok daha iyidir.
  const { data: allAlerts, error: recentError, isLoading, fetchStatus, status } = useListAlerts(
    { limit: 100, since_hours: 6 } as any,
    { query: { queryKey: getListAlertsQueryKey({ limit: 100, since_hours: 6 } as any), staleTime: 0, refetchInterval: 30_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  // ─── DIAGNOSTIC refs: track allAlerts reference between renders ───────────
  const prevAlertsRef = useRef<typeof allAlerts>(undefined);
  const pollCountRef = useRef(0);

  useEffect(() => { if (recentError) log("⚠️ API HATASI:", recentError.message || recentError); }, [recentError]);

  // ─── DIAGNOSTIC: Track allAlerts reference changes ─────────────────────────
  // This block runs on every render (not inside useEffect) so we can detect
  // whether React Query structural sharing keeps the same reference between polls.
  {
    const prevLen = prevAlertsRef.current?.length;
    const newLen = allAlerts?.length;
    const prevFirstId = prevAlertsRef.current?.[0]?.id;
    const newFirstId = allAlerts?.[0]?.id;
    const refChanged = prevAlertsRef.current !== allAlerts;

    if (refChanged) {
      pollCountRef.current++;
      log(`[POLL #${pollCountRef.current}] REF CHANGED — prev: len=${prevLen} firstId=${prevFirstId}, new: len=${newLen} firstId=${newFirstId}, seenIds=${seenIds.current.size}, isLoading=${isLoading}, fetchStatus=${fetchStatus}, status=${status}`);
      prevAlertsRef.current = allAlerts;
    } else if (allAlerts !== undefined) {
      // Log periodically even when ref hasn't changed, so we know the hook is alive
      pollCountRef.current++;
      if (pollCountRef.current % 5 === 0) {
        log(`[POLL #${pollCountRef.current}] SAME REF — len=${newLen} firstId=${newFirstId}, seenIds=${seenIds.current.size}, isLoading=${isLoading}, fetchStatus=${fetchStatus}, status=${status}`);
      }
    }
  }

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    log(`[NOTIF EFFECT] Fired — allAlerts=${allAlerts?.length ?? "undefined"}, seenIds=${seenIds.current.size}`);
    if (!allAlerts?.length) { log("⚠️ alerts verisi boş — bildirim tetiklenemez"); return; }

    // Cookie consent guard — only blocks browser notifications (Notification API).
    // In-app toasts and sounds are core app functionality and work without consent.
    const raw = localStorage.getItem('aero-cookie-consent');
    const consent = raw ? JSON.parse(raw) : null;
    const hasCookieConsent = !!consent;
    const hasPermission = typeof Notification !== "undefined" && Notification.permission === "granted";

    let skippedWatchlist = 0;
    let skippedSnooze = 0;
    let skippedSeen = 0;

    // Use ref to get the latest effectiveIcaos (avoids stale closure issues)
    const currentIcaos = effectiveIcaosRef.current;
    const watchlistSet = new Set(currentIcaos.map(s => s.toUpperCase()));

    // ─── Pass 1: filter down to genuinely new, notify-worthy alerts ──────────
    // No side effects here yet — we need the full set before deciding whether
    // to notify individually or collapse into one batch summary.
    const newAlerts: typeof allAlerts = [];
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

      // Genuinely new to this device — notify (individually or batched below).
      // This includes alerts already sitting in the last 6h on first load /
      // right after adding a new airport: with batching in place, "there could
      // be a lot of these" is no longer a reason to notify silently — a big
      // first-load batch just collapses into one summary notification instead.
      seenIds.current.add(alert.id);
      newAlerts.push(alert);
    }

    // Save seenIds whenever anything got newly marked as seen
    if (newAlerts.length > 0) saveSeenIds(seenIds.current);

    // ─── Pass 2: notify ───────────────────────────────────────────────────────
    // A single new alert keeps today's full-detail notification. Two or more
    // arriving in the same poll (e.g. a frontal system triggering SPECI at many
    // airports at once) collapse into ONE summary notification/toast/sound
    // instead of firing once per airport.
    const icon = `${import.meta.env.BASE_URL}alert-icon.png?v=7`;

    if (newAlerts.length === 1) {
      const alert = newAlerts[0];
      const label = TYPE_LABELS[alert.type] ?? alert.type;
      const title = `AERO-SENTINEL — ${label}`;
      const body = `${alert.icao}: ${alert.rawText.slice(0, 120)}`;

      log("🔔 YENİ ALERT BİLDİRİM:", alert.id, alert.type, alert.icao);

      if (hasPermission && hasCookieConsent) {
        sendNotification(title, { body, icon, tag: `aero-alert-${alert.icao}-${alert.id}`, requireInteraction: false }).then((n) => {
          if (n) {
            const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
            n.onclick = () => { clearTimeout(timer); window.location.href = "/alerts"; n.close(); };
            n.onclose = () => clearTimeout(timer);
          }
        });
      }

      setPendingToasts(prev => [...prev, {
        id: `toast-${alert.id}-${Date.now()}`,
        title: label,
        icao: alert.icao,
        alertId: alert.id,
        alertType: alert.type,
      }]);

      try { playAlert(); } catch { /* ignore */ }
    } else if (newAlerts.length > 1) {
      const { body, icaoCount } = buildBatchSummary(newAlerts);
      const title = `AERO-SENTINEL — ${newAlerts.length} New Alerts`;

      log(`🔔 TOPLU BİLDİRİM: ${newAlerts.length} alert, ${icaoCount} havalimanı — ${body}`);

      if (hasPermission && hasCookieConsent) {
        sendNotification(title, { body, icon, tag: `aero-alert-batch-${Date.now()}`, requireInteraction: false }).then((n) => {
          if (n) {
            const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
            n.onclick = () => { clearTimeout(timer); window.location.href = "/alerts"; n.close(); };
            n.onclose = () => clearTimeout(timer);
          }
        });
      }

      // alertId: 0 is a sentinel — never a real DB id (serial starts at 1) or a
      // synthetic live-scan id (stableSyntheticId never produces 0). AlertToast
      // and App.tsx's onViewChanges use it to render/route the summary case.
      setPendingToasts(prev => [...prev, {
        id: `toast-batch-${Date.now()}`,
        title: `${newAlerts.length} New Alerts`,
        icao: body,
        alertId: 0,
        alertType: "SUMMARY",
        isSummary: true,
      }]);

      try { playAlert(); } catch { /* ignore */ }
    }

    const totalSkipped = skippedWatchlist + skippedSnooze + skippedSeen;
    if (totalSkipped > 0) log(`⏭️ ${totalSkipped} atlandı (seen=${skippedSeen} watchlist=${skippedWatchlist} snooze=${skippedSnooze})`);
    if (newAlerts.length === 0) log("Yeni alert yok (tümü seenIds'de veya filtrelenmiş)");
    else log(`✅ ${newAlerts.length} yeni alert için bildirim gönderildi (${newAlerts.length > 1 ? "toplu" : "tekli"})`);
  }, [allAlerts, playAlert, effectiveIcaos, isSnoozed]);

  return { forceCheck, pendingToasts, dismissToast };
}
