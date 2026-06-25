import { useEffect, useRef, useState, useCallback } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useWatchlist } from "@/context/WatchlistContext";

const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
};

const AUTO_CLOSE_MS = 30_000;
const LOG = "[AeroNotif]";
const log = (...args: unknown[]) => console.log(LOG, new Date().toISOString(), ...args);
const INIT_KEY = "alert-notifications-initialized";

async function showSWNotification(title: string, options: NotificationOptions): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    if (!registration || Notification.permission !== "granted") return false;
    await registration.showNotification(title, { ...options, icon: options.icon || `${self.location.origin}/alert-icon.png` });
    return true;
  } catch (err) { log("⚠️ SW notification hatası:", err); return false; }
}

function showNativeNotification(title: string, options: NotificationOptions): Notification | null {
  try { return new Notification(title, options); } catch (err) { log("⚠️ Native notification hatası:", err); return null; }
}

async function sendNotification(title: string, options: NotificationOptions): Promise<Notification | null> {
  const native = showNativeNotification(title, options);
  if (native) return native;
  await showSWNotification(title, options);
  return null;
}

export function useAlertNotifications() {
  const { play: playAlert } = useAlertSound();
  const { effectiveIcaos } = useWatchlist();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const isFirstLoad = useRef(true);
  const pollCount = useRef(0);
  const watchlistSet = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newSet = new Set(effectiveIcaos.map(s => s.toUpperCase()));
    const oldSize = watchlistSet.current.size;
    watchlistSet.current = newSet;
    if (oldSize > 0 && newSet.size !== oldSize) {
      seenIds.current.clear();
      isFirstLoad.current = true;
      log(`Watchlist değişti (${oldSize} → ${newSet.size}): seenIds sıfırlandı`);
    }
  }, [effectiveIcaos]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
      log("Başlangıç: permission =", Notification.permission);
    } else { log("⚠️ Notification API desteklenmiyor!"); }
    const wasDismissed = sessionStorage.getItem("notif-dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  const forceCheck = useCallback(async () => {
    log("forceCheck: query invalidation tetikleniyor");
    await queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
  }, [queryClient]);

  // ─── Polling — useListAlerts ile (Alerts sayfasıyla aynı API) ──────────────
  const { data: allAlerts, error: recentError, isLoading } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: 15_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchOnMount: true, retry: 3 } }
  );

  useEffect(() => { if (recentError) log("⚠️ API HATASI:", recentError.message || recentError); }, [recentError]);

  useEffect(() => {
    pollCount.current++;
    log(`Poll #${pollCount.current}: alerts.length = ${allAlerts?.length ?? 0} | isFirstLoad: ${isFirstLoad.current} | permission: ${typeof Notification !== "undefined" ? Notification.permission : "N/A"} | seenIds: ${seenIds.current.size} | loading: ${isLoading}`);
    if (allAlerts && allAlerts.length > 0) log("  Alert IDs:", allAlerts.slice(0, 15).map(a => `${a.id}(${a.icao}:${a.type})`).join(", "));
  }, [allAlerts]);

  // ─── Ana bildirim effect'i ─────────────────────────────────────────────────
  useEffect(() => {
    if (!allAlerts?.length) { log("⚠️ alerts verisi boş — bildirim tetiklenemez"); return; }

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      allAlerts.forEach((a) => seenIds.current.add(a.id));
      if (sessionStorage.getItem(INIT_KEY) !== "1") sessionStorage.setItem(INIT_KEY, "1");
      log(`İlk yükleme: ${allAlerts.length} alert seenIds'e eklendi (bildirim gönderilmedi)`);
      return;
    }

    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      log("⚠️ Notification izni yok!");
      return;
    }

    // ─── YENİ ALERT'LERİ ALGILA VE BİLDİRİM GÖNDER ─────────────────────────
    // watchlist filtresi + ICAO bazında deduplikasyon
    const notifiedIcaos = new Set<string>();
    let newAlertCount = 0;
    let skippedCount = 0;

    for (const alert of allAlerts) {
      if (seenIds.current.has(alert.id)) continue;

      // Watchlist filtresi
      if (watchlistSet.current.size > 0 && !watchlistSet.current.has(alert.icao.toUpperCase())) {
        skippedCount++;
        seenIds.current.add(alert.id);
        continue;
      }

      // ICAO deduplikasyon — aynı ICAO için sadece ilk alert
      if (notifiedIcaos.has(alert.icao.toUpperCase())) {
        seenIds.current.add(alert.id);
        skippedCount++;
        continue;
      }

      seenIds.current.add(alert.id);
      notifiedIcaos.add(alert.icao.toUpperCase());
      newAlertCount++;

      log("🔔 YENİ ALERT BİLDİRİM:", alert.id, alert.type, alert.icao);

      const title = `AERO-SENTINEL — ${TYPE_LABELS[alert.type] ?? alert.type}`;
      const body = `${alert.icao}: ${alert.rawText.slice(0, 120)}`;
      const icon = `${import.meta.env.BASE_URL}alert-icon.png`;

      sendNotification(title, { body, icon, tag: `aero-alert-${alert.icao}`, requireInteraction: false }).then((n) => {
        if (n) {
          const timer = setTimeout(() => n.close(), AUTO_CLOSE_MS);
          n.onclick = () => { clearTimeout(timer); window.focus(); n.close(); };
          n.onclose = () => clearTimeout(timer);
        }
      });

      try { playAlert(); } catch { /* ignore */ }
    }

    if (skippedCount > 0) log(`⏭️ ${skippedCount} alert atlandı (watchlist dışı veya duplicate)`);
    if (newAlertCount === 0) log("Yeni alert yok (tümü seenIds'de veya duplicate)");
  }, [allAlerts, permission, playAlert]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") { sessionStorage.removeItem(INIT_KEY); sessionStorage.removeItem("notif-dismissed"); setDismissed(false); }
    } catch { Notification.requestPermission((p) => setPermission(p)); }
  };

  const dismiss = () => { sessionStorage.setItem("notif-dismissed", "1"); setDismissed(true); };
  const showBanner = permission === "default" && !dismissed;
  return { permission, requestPermission, dismiss, showBanner, dismissed, forceCheck };
}
