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

// ─── Persisted seen-alert tracker ───────────────────────────────────────────
// sessionStorage'da son görülen alert ID'lerini sakla.
// Sayfa kapanıp açıldığında, kapalı sürede gelen alertler bildirim tetikler.
const SEEN_KEY = "aero-notif-seen-ids";

function loadSeenIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((n) => typeof n === "number"));
    return new Set();
  } catch { return new Set(); }
}

function saveSeenIds(ids: Set<number>) {
  try {
    // En fazla son 500 ID'yi sakla (sessionStorage boyut limiti)
    const arr = [...ids].sort((a, b) => b - a).slice(0, 500);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
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
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const [pendingToasts, setPendingToasts] = useState<Array<{
    id: string;
    title: string;
    icao: string;
    alertId: number;
    alertType: string;
  }>>([]);
  const seenIds = useRef<Set<number>>(loadSeenIds());
  const queryClient = useQueryClient();
  const isFirstLoad = useRef(true);
  const pollCount = useRef(0);
  const watchlistSet = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setPendingToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const newSet = new Set(effectiveIcaos.map(s => s.toUpperCase()));
    const oldSize = watchlistSet.current.size;
    watchlistSet.current = newSet;
    if (oldSize > 0 && newSet.size !== oldSize) {
      seenIds.current.clear();
      isFirstLoad.current = true;
      saveSeenIds(seenIds.current);
      log(`Watchlist değişti (${oldSize} → ${newSet.size}): seenIds sıfırlandı`);
    }
  }, [effectiveIcaos]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
      log("Başlangıç: permission =", Notification.permission, "| sessionStorage'da seenIds:", seenIds.current.size);
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

    // İlk yükleme: sessionStorage'dan yüklenen seenIds zaten var.
    // isFirstLoad = true VE sessionStorage boşsa (ilk ziyaret), mevcut alertleri seenIds'e ekle.
    // isFirstLoad = true VE sessionStorage'da seenIds varsa (sayfa yenileme), kapalı sürede gelen alertleri bildir.
    if (isFirstLoad.current) {
      isFirstLoad.current = false;

      if (seenIds.current.size === 0) {
        // İlk ziyaret — sessionStorage boş. Tüm mevcut alertleri seenIds'e ekle (spam engeli).
        allAlerts.forEach((a) => seenIds.current.add(a.id));
        saveSeenIds(seenIds.current);
        log(`İlk ziyaret (sessionStorage boş): ${allAlerts.length} alert seenIds'e eklendi (bildirim gönderilmedi)`);
        return;
      }

      // Sayfa yenileme — sessionStorage'da seenIds var.
      // seenIds'de OLMAYAN alertler = kapalı sürede gelen yeni alertler → bildirim gönder!
      const newOnLoad = allAlerts.filter((a) => !seenIds.current.has(a.id));
      log(`Sayfa yenileme: ${newOnLoad.length} yeni alert sessionStorage'da yok → bildirim tetiklenecek`);
      // isFirstLoad sonrası normal akışa devam et (return yok)
    }

    // Notification izni istemeden ÖNCE cookie consent kontrolü
    const cookieConsent = localStorage.getItem("aero-cookie-consent");
    const hasConsent = (() => {
      try {
        const parsed = cookieConsent ? JSON.parse(cookieConsent) : null;
        return parsed?.marketing === true;
      } catch { return false; }
    })();

    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      if (!hasConsent) {
        log("⚠️ Notification izni yok + cookie consent yok — beklemede");
        return; // Cookie consent verilmeden notification sorma
      }
      log("⚠️ Notification izni yok — in-app toast kullanılacak");
    }

    // ─── YENİ ALERT'LERİ ALGILA VE BİLDİRİM GÖNDER ─────────────────────────
    const notifiedIcaos = new Set<string>();
    let newAlertCount = 0;
    let skippedCount = 0;
    const hasPermission = typeof Notification !== "undefined" && Notification.permission === "granted";

    for (const alert of allAlerts) {
      if (seenIds.current.has(alert.id)) continue;

      // Watchlist filtresi
      if (watchlistSet.current.size > 0 && !watchlistSet.current.has(alert.icao.toUpperCase())) {
        skippedCount++;
        seenIds.current.add(alert.id);
        continue;
      }

      // ICAO deduplikasyon — aynı ICAO için sadece ilk alert
      // (Aynı poll döngüsünde aynı ICAO için birden fazla alert gelirse)
      if (notifiedIcaos.has(alert.icao.toUpperCase())) {
        seenIds.current.add(alert.id);
        skippedCount++;
        continue;
      }

      seenIds.current.add(alert.id);
      notifiedIcaos.add(alert.icao.toUpperCase());
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
            n.onclick = () => { clearTimeout(timer); window.focus(); n.close(); };
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

    // seenIds'i sessionStorage'a kaydet
    if (newAlertCount > 0) saveSeenIds(seenIds.current);

    if (skippedCount > 0) log(`⏭️ ${skippedCount} alert atlandı (watchlist dışı veya duplicate)`);
    if (newAlertCount === 0) log("Yeni alert yok (tümü seenIds'de veya duplicate)");
    else log(`✅ ${newAlertCount} yeni alert için bildirim gönderildi`);
  }, [allAlerts, permission, playAlert]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") { sessionStorage.removeItem("notif-dismissed"); setDismissed(false); }
    } catch { Notification.requestPermission((p) => setPermission(p)); }
  };

  const dismiss = () => { sessionStorage.setItem("notif-dismissed", "1"); setDismissed(true); };
  const showBanner = permission === "default" && !dismissed;
  return { permission, requestPermission, dismiss, showBanner, dismissed, forceCheck, pendingToasts, dismissToast };
}
