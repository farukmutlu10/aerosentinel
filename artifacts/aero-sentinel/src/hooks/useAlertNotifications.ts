import { useEffect, useRef, useState, useCallback } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useWatchlist } from "@/context/WatchlistContext";
import { useAlertSnooze } from "@/hooks/useAlertSnooze";
import { getCookiePreferences } from "@/components/CookieConsent";

// ─── V5 key: bump when seenIds persistence logic changes ─────────────────────
// V3→V4: Fixed over-persistence bug where watchlist-filtered alerts were added
// to seenIds, permanently suppressing notifications after watchlist changes.
// V4→V5: Switched from numeric DB id to a content key (icao|type|rawText).
// A live-detected alert (negative synthetic id) and its later DB-persisted
// counterpart (positive id, same report) are the SAME real-world event, but
// numeric-id dedup treated them as two — notifying (and playing the sound)
// twice for one weather change once the backend caught up.
const SEEN_KEY = "aero-notif-seen-ids-v5";

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
// Production'da poll/notify teşhisleri tamamen görünmezdi (DEV-gated), bu
// yüzden canlıdaki her bildirim arızası kör tahminle ayıklanıyordu. Konsolda
// `localStorage.setItem("aero-debug","1")` + sayfa yenileme ile production'da
// da aynı loglar açılır (modül yüklenirken bir kez okunur).
const debugEnabled = (() => {
  if (import.meta.env.DEV) return true;
  try { return localStorage.getItem("aero-debug") === "1"; } catch { return false; }
})();
const log = (...args: unknown[]) => {
  if (debugEnabled) console.log(LOG, new Date().toISOString(), ...args);
};
// Errors on this path fail silently by design (a broken notification must
// never crash the app), which also means production gave us zero signal when
// something did break here. Unlike log(), these always print — a warning in
// the console costs nothing, but it previously would have been the only way
// to notice CookieConsent's stored value being unparseable and quietly
// killing every notification in prod (getCookiePreferences() itself already
// guards its JSON.parse, so this is now just a diagnostics hook, not a fix).
const logError = (...args: unknown[]) => console.error(LOG, new Date().toISOString(), ...args);

// ─── Persisted seen-alert tracker ───────────────────────────────────────────

// Content-based identity for a report: a live-detected sighting (negative
// synthetic id) and its later DB-persisted counterpart (positive id) share
// this key, so they're recognized as the same real-world event exactly once,
// regardless of which id happens to reach this hook first.
function alertKey(a: { icao: string; type: string; rawText: string }): string {
  return `${a.icao}|${a.type}|${a.rawText.slice(0, 200)}`;
}

function loadSeenIds(): Set<string> {
  // Clean up old numeric-id-based keys (v3/v4 — incompatible format)
  try { localStorage.removeItem("aero-notif-seen-ids-v3"); } catch { /* ignore */ }
  try { localStorage.removeItem("aero-notif-seen-ids-v4"); } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((s) => typeof s === "string"));
    return new Set();
  } catch { return new Set(); }
}

function saveSeenIds(keys: Set<string>) {
  try {
    // En fazla son 500 anahtarı sakla
    const arr = [...keys].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// ─── Notification helpers — SW önce, native fallback ───────────────────────
// Failures here previously only logged via the DEV-gated log() — a report
// of "sound played but no browser popup appeared" had zero trace to diagnose
// from in production. Always-log (logError) on every failure/skip path so a
// future occurrence is actually diagnosable instead of a silent no-op.
async function showSWNotification(title: string, options: NotificationOptions): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) { logError("⚠️ SW notification atlandı: serviceWorker desteklenmiyor"); return false; }
    const registration = await navigator.serviceWorker.ready;
    if (!registration) { logError("⚠️ SW notification atlandı: registration yok"); return false; }
    if (Notification.permission !== "granted") { logError(`⚠️ SW notification atlandı: permission=${Notification.permission}`); return false; }
    await registration.showNotification(title, { ...options, icon: options.icon || `${self.location.origin}/alert-icon.png?v=7` });
    return true;
  } catch (err) { logError("⚠️ SW notification hatası:", err); return false; }
}

function showNativeNotification(title: string, options: NotificationOptions): Notification | null {
  try { return new Notification(title, options); } catch (err) { logError("⚠️ Native notification hatası:", err); return null; }
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
  // liveInitialAlerts: /watchlist/sync's instant, not-yet-persisted detections
  // (synthetic negative ids) for airports just added to the watchlist. These
  // used to only reach Alerts.tsx's list — this hook never saw them, so
  // adding an airport with an active LIFR/extreme condition produced zero
  // notification until the next periodic scan happened to persist a real row.
  const { effectiveIcaos, initialAlerts: liveInitialAlerts } = useWatchlist();
  const { isSnoozed } = useAlertSnooze();
  const [pendingToasts, setPendingToasts] = useState<Array<{
    id: string;
    title: string;
    icao: string;
    alertId: number;
    alertType: string;
    isSummary?: boolean;
  }>>([]);
  const seenIds = useRef<Set<string>>(loadSeenIds());
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
          const arr = JSON.parse(e.newValue) as string[];
          if (Array.isArray(arr)) {
            seenIds.current = new Set(arr.filter((s) => typeof s === "string"));
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
  // actually fires ~every 60s when the tab is hidden — and the SAME throttling
  // applies to fetchWithTimeout/customFetch's own abort setTimeout, so a fetch
  // stalled while backgrounded (see custom-fetch.ts) might not even get
  // aborted at the intended 20s; it could take up to a throttled ~60s+. Plain
  // invalidateQueries() doesn't help in that window — TanStack Query dedupes
  // by query key and won't start a new fetch while the old one is still
  // "in flight," it just marks the query stale for whenever that fetch
  // settles. cancelQueries() first forces that in-flight fetch's AbortSignal
  // to fire immediately (customFetch composes it into the request), so the
  // moment the user returns to the tab, recovery is immediate instead of
  // bounded by however long the (possibly throttled) timeout takes to fire.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        log("Tab visible — cancelling any stuck in-flight fetch and refetching");
        queryClient.cancelQueries({ queryKey: getListAlertsQueryKey() }).then(() => {
          queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        });
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
    { limit: 200, since_hours: 6 } as any,
    { query: { queryKey: getListAlertsQueryKey({ limit: 200, since_hours: 6 } as any), staleTime: 0, refetchInterval: 30_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  // ─── DIAGNOSTIC refs: track allAlerts reference between renders ───────────
  const prevAlertsRef = useRef<typeof allAlerts>(undefined);
  const pollCountRef = useRef(0);

  // Always-log (not DEV-gated): a 429/5xx on the alert poll is exactly the
  // failure mode that was invisible in production while alerts "randomly"
  // stopped arriving.
  useEffect(() => { if (recentError) logError("⚠️ API HATASI (alert poll):", recentError.message || recentError); }, [recentError]);

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

  // ─── One-time baseline seed — covers BOTH allAlerts and liveInitialAlerts ──
  // Any time seenIds starts empty for this browser (genuinely first-ever
  // visit, cleared site data, a browser that doesn't persist localStorage
  // reliably, or simply the first run of this merged pipeline), the very
  // first batch this effect sees can be the DB's entire since_hours=6
  // backlog — for a broad watchlist that's easily 50-100 alerts, all
  // reported as "new" purely because nothing had ever marked them seen,
  // producing one huge, meaningless "100 New Alerts" notification. The
  // first successful batch (from either source) is absorbed into seenIds
  // silently instead of notified; only alerts arriving after that point —
  // including a freshly-watchlisted airport's live-detected condition —
  // actually notify. Gated by a persisted flag (not just seenIds.size, so a
  // browser that wipes storage between sessions doesn't re-flood on every
  // visit — it flags "already did my one baseline pass" permanently once
  // that pass has happened, event if seenIds itself later gets cleared).
  const BASELINE_KEY = "aero-notif-baseline-seeded-v2";
  const baselineDoneRef = useRef<boolean | null>(null); // null = not checked yet

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    // Combine the polled DB alerts with /watchlist/sync's instant live
    // detections (synthetic negative ids for airports not yet scanned) —
    // same seenIds set, so if the same condition later gets a real DB row
    // and reappears via allAlerts, it just looks like a second alert rather
    // than silently being dropped either way.
    const combinedAlerts: Array<{ id: number; type: string; icao: string; rawText: string }> =
      [...(allAlerts ?? []), ...liveInitialAlerts];

    log(`[NOTIF EFFECT] Fired — allAlerts=${allAlerts?.length ?? "undefined"}, liveInitialAlerts=${liveInitialAlerts.length}, seenIds=${seenIds.current.size}`);
    if (!combinedAlerts.length) { log("⚠️ alerts verisi boş — bildirim tetiklenemez"); return; }

    if (baselineDoneRef.current === null) {
      try { baselineDoneRef.current = localStorage.getItem(BASELINE_KEY) === "1"; }
      catch { baselineDoneRef.current = false; }
    }

    // Cookie consent guard — only blocks browser notifications (Notification API).
    // In-app toasts and sounds are core app functionality and work without consent.
    const consentGiven = getCookiePreferences() !== null;
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
    const newAlerts: typeof combinedAlerts = [];
    for (const alert of combinedAlerts) {
      // Already seen → skip silently (don't add again)
      if (seenIds.current.has(alertKey(alert))) { skippedSeen++; continue; }

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
      seenIds.current.add(alertKey(alert));
      newAlerts.push(alert);
    }

    // Save seenIds whenever anything got newly marked as seen
    if (newAlerts.length > 0) saveSeenIds(seenIds.current);

    // First-ever batch for this browser: seenIds is now updated (so none of
    // these re-appear as "new" later), but skip notifying for THIS pass —
    // whatever's already sitting in the last 6h isn't something that "just
    // happened," it's the pre-existing backlog on a fresh notification state.
    if (!baselineDoneRef.current) {
      baselineDoneRef.current = true;
      try { localStorage.setItem(BASELINE_KEY, "1"); } catch { /* ignore */ }
      log(`Baseline run — silently seeded ${newAlerts.length} pre-existing alert(s), no notification for this pass`);
      return;
    }

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

      if (hasPermission && consentGiven) {
        sendNotification(title, { body, icon, tag: `aero-alert-${alert.icao}-${alert.id}`, requireInteraction: false }).then((n) => {
          if (n) {
            const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
            n.onclick = () => { clearTimeout(timer); window.location.href = "/alerts"; n.close(); };
            n.onclose = () => clearTimeout(timer);
          }
        });
      } else {
        logError(`⚠️ Browser bildirimi atlandı: hasPermission=${hasPermission} consentGiven=${consentGiven}`);
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

      if (hasPermission && consentGiven) {
        sendNotification(title, { body, icon, tag: `aero-alert-batch-${Date.now()}`, requireInteraction: false }).then((n) => {
          if (n) {
            const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
            n.onclick = () => { clearTimeout(timer); window.location.href = "/alerts"; n.close(); };
            n.onclose = () => clearTimeout(timer);
          }
        });
      } else {
        logError(`⚠️ Browser bildirimi (toplu) atlandı: hasPermission=${hasPermission} consentGiven=${consentGiven}`);
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
  }, [allAlerts, liveInitialAlerts, playAlert, effectiveIcaos, isSnoozed]);

  return { forceCheck, pendingToasts, dismissToast };
}
