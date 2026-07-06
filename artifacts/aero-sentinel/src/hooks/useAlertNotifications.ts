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

  // ─── Per-ICAO "tracked since" — replaces the old global isFirstFetch flag ──
  // A blanket "first fetch after any watchlist change" flag suppressed
  // notifications for EVERY airport whenever the watchlist changed at all —
  // including genuinely new alerts for airports that had been watched for a
  // while. Instead, each ICAO gets its own reference timestamp: airports
  // present when the hook mounts are tracked from "now" (app load), airports
  // added later are tracked from the exact moment they're added. An alert
  // notifies only if its detectedAt is AFTER its ICAO's tracked-since time —
  // pre-existing conditions on a newly-added airport are still suppressed,
  // but that suppression no longer bleeds into already-watched airports.
  const trackedSince = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setPendingToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Bootstrap: ICAOs already in the watchlist when this hook mounts are
  // "tracked from app load" — their pre-existing alerts are suppressed once.
  useEffect(() => {
    const now = Date.now();
    for (const icao of effectiveIcaosRef.current) {
      trackedSince.current.set(icao.toUpperCase(), now);
    }
    log(`Bootstrap: tracking ${trackedSince.current.size} ICAO(s) from app load`);
  }, []);

  // A specific ICAO was just added — track it from this exact moment, so its
  // pre-existing conditions get suppressed without touching other airports.
  useEffect(() => {
    const handleAirportAdded = (e: Event) => {
      const icao = (e as CustomEvent<string>).detail;
      if (icao) {
        trackedSince.current.set(icao.toUpperCase(), Date.now());
        log(`ICAO tracked from now: ${icao}`);
      }
    };
    window.addEventListener("watchlist-airport-added", handleAirportAdded);
    return () => window.removeEventListener("watchlist-airport-added", handleAirportAdded);
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
  // of alerts (new ICAOs, removed ICAOs). Invalidate so the next poll reflects
  // it — per-ICAO tracked-since (above) already handles new-vs-known airports
  // correctly, so there's no need to reset anything global here.
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

    let newAlertCount = 0;
    let skippedWatchlist = 0;
    let skippedSnooze = 0;
    let skippedSeen = 0;
    let skippedPreExisting = 0;
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

      // Pre-existing condition on this ICAO (predates when we started tracking
      // it) — mark seen so it won't be re-evaluated, but don't notify. This is
      // scoped per-ICAO, so it never suppresses genuinely new alerts on other,
      // already-watched airports.
      const trackedFrom = trackedSince.current.get(alert.icao.toUpperCase());
      const isPreExisting = trackedFrom !== undefined && new Date(alert.detectedAt).getTime() < trackedFrom;

      seenIds.current.add(alert.id);

      if (isPreExisting) {
        skippedPreExisting++;
        continue;
      }

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

    // Save seenIds whenever anything got newly marked as seen (notified or pre-existing)
    if (newAlertCount > 0 || skippedPreExisting > 0) saveSeenIds(seenIds.current);

    const totalSkipped = skippedWatchlist + skippedSnooze + skippedSeen + skippedPreExisting;
    if (totalSkipped > 0) log(`⏭️ ${totalSkipped} atlandı (seen=${skippedSeen} watchlist=${skippedWatchlist} snooze=${skippedSnooze} preExisting=${skippedPreExisting})`);
    if (newAlertCount === 0) log("Yeni alert yok (tümü seenIds'de veya filtrelenmiş)");
    else log(`✅ ${newAlertCount} yeni alert için bildirim gönderildi`);
  }, [allAlerts, playAlert, effectiveIcaos, isSnoozed]);

  return { forceCheck, pendingToasts, dismissToast };
}
