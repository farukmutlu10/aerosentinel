import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { normalizeIcao } from "@/lib/icaoUtils";

const DEFAULT_ICAO = "LTFH";
const LS_KEY = "aero-sentinel-watchlist";

function loadLocal(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
    return [];
  } catch {
    return [];
  }
}

function saveLocal(icaos: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(icaos)); } catch {}
}

// Generate or retrieve a persistent device ID for this browser
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("aero-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("aero-device-id", id);
  }
  return id;
}

const deviceId = getOrCreateDeviceId();
const headers: Record<string, string> = { "X-Device-ID": deviceId, "Content-Type": "application/json" };

// Initial alert shape returned from sync endpoint
export interface InitialAlert {
  id: number;
  type: string;
  icao: string;
  rawText: string;
  previousRawText: string | null;
  detectedAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

// On mount: replace backend list with this browser's localStorage list
// Returns initial alerts from sync response for instant display
// NOTE: Does NOT dispatch "watchlist-synced" — caller is responsible for dispatching
// AFTER setting initialAlerts state, to avoid race condition where query invalidation
// triggers a GET /alerts refetch before initialAlerts are available in React state.
async function syncToBackend(icaos: string[]): Promise<InitialAlert[]> {
  const MAX_RETRIES = 3;
  const bodyStr = JSON.stringify({ icaos });
  console.log(`[WATCHLIST DIAG] syncToBackend called with ${icaos.length} ICAOs`, icaos.length > 0 ? icaos.slice(0, 5).join(",") + "…" : "(empty)");
  console.log(`[WATCHLIST DIAG] localStorage raw:`, (localStorage.getItem(LS_KEY) ?? "(null)").slice(0, 200));
  console.log(`[WATCHLIST DIAG] request body (${bodyStr.length} bytes):`, bodyStr.slice(0, 200));
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("/api/watchlist/sync", {
        method: "PUT",
        headers,
        body: bodyStr,
      });
      const data = await res.json();
      const alerts = Array.isArray(data?.initialAlerts) ? data.initialAlerts : [];
      console.log(`[WATCHLIST DIAG] server response: ok=${data?.ok} initialAlerts=${alerts.length} icaos=${Array.isArray(data?.icaos) ? data.icaos.length : "?"}`);
      return alerts;
    } catch (err) {
      console.error(`[WATCHLIST DIAG] syncToBackend FAILED (attempt ${attempt}/${MAX_RETRIES}):`, err);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  console.error(`[WATCHLIST DIAG] syncToBackend: all ${MAX_RETRIES} attempts failed — monitor may miss airports`);
  return [];
}

function apiAdd(icao: string) {
  void fetch("/api/watchlist", {
    method: "POST",
    headers,
    body: JSON.stringify({ icao }),
  }).catch(() => {});
}

function apiRemove(icao: string) {
  void fetch(`/api/watchlist/${icao}`, {
    method: "DELETE",
    headers,
  }).catch(() => {});
}

function apiClear() {
  void fetch("/api/watchlist", {
    method: "DELETE",
    headers,
  }).catch(() => {});
}

interface WatchlistContextValue {
  watchedIcaos: string[];
  effectiveIcaos: string[];
  addIcao: (icao: string) => void;
  removeIcao: (icao: string) => void;
  clearWatchlist: () => void;
  isWatching: (icao: string) => boolean;
  hasFilter: boolean;
  isLoading: false;
  initialAlerts: InitialAlert[];
  initialAlertsReady: boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchedIcaos, setWatchedIcaos] = useState<string[]>(loadLocal);
  const [initialAlerts, setInitialAlerts] = useState<InitialAlert[]>([]);
  const [initialAlertsReady, setInitialAlertsReady] = useState(false);

  // Debounce timer for re-syncing after batch addIcao calls (e.g. paste 97 airports)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule a debounced re-sync — reads the latest localStorage
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToBackend(loadLocal()).then((alerts) => {
        if (alerts.length > 0) setInitialAlerts(alerts);
        // Dispatch AFTER setting initialAlerts so Alerts.tsx useMemo has data to work with
        window.dispatchEvent(new CustomEvent("watchlist-synced"));
      });
    }, 500);
  }, []);

  // On mount: push this browser's list to backend as source of truth.
  // Guard: a browser that has NEVER stored a watchlist (localStorage key absent,
  // e.g. a fresh profile/incognito/kiosk window before first use) must not PUT
  // an empty list — that would wipe the device's server-side watchlist and the
  // monitor would stop alerting until the next non-empty sync. An explicit
  // "user cleared everything" state is stored as "[]" and still syncs.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(LS_KEY); } catch { /* ignore */ }
    if (stored === null) {
      console.log("[WATCHLIST] no stored watchlist yet — skipping mount sync (won't wipe server list)");
      setInitialAlertsReady(true);
      window.dispatchEvent(new CustomEvent("watchlist-synced"));
      return;
    }
    syncToBackend(loadLocal()).then((alerts) => {
      console.log(`[WATCHLIST] syncToBackend resolved: ${alerts.length} initialAlerts, setting state...`);
      if (alerts.length > 0) {
        setInitialAlerts(alerts);
      }
      setInitialAlertsReady(true);
      // Dispatch AFTER setting initialAlerts state — ensures Alerts.tsx useMemo
      // has initialAlerts available when the query invalidation triggers a re-render
      window.dispatchEvent(new CustomEvent("watchlist-synced"));
      console.log(`[WATCHLIST] watchlist-synced event dispatched (after state update)`);
    });
  }, []);

  // ─── Cross-tab/cross-window sync ──────────────────────────────────────────
  // Kiosk modu (window.open) ile ana site arasındaki senkronizasyon için
  // `storage` event'ini dinle. Bu event, başka bir tab/pencerede localStorage
  // değiştiğinde tetiklenir.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return;
      try {
        const newVal = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(newVal)) {
          setWatchedIcaos(newVal.filter((s): s is string => typeof s === "string"));
        }
      } catch { /* ignore parse errors */ }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // ─── BroadcastChannel for same-origin instant sync ────────────────────────
  // storage event'i bazı tarayıcılarda gecikebilir, BroadcastChannel daha hızlı.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("aero-watchlist-sync");
      channel.onmessage = (e) => {
        if (e.data?.type === "update" && Array.isArray(e.data.icaos)) {
          setWatchedIcaos(e.data.icaos.filter((s: unknown): s is string => typeof s === "string"));
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { try { channel?.close(); } catch {} };
  }, []);

  // Helper: save + broadcast changes to other tabs/windows
  const broadcastUpdate = useCallback((icaos: string[]) => {
    saveLocal(icaos);
    try {
      const ch = new BroadcastChannel("aero-watchlist-sync");
      ch.postMessage({ type: "update", icaos });
      ch.close();
    } catch { /* BroadcastChannel not supported */ }
  }, []);

  const addIcao = useCallback((raw: string) => {
    const icao = normalizeIcao(raw);
    if (icao.length !== 4) return;
    setWatchedIcaos((prev) => {
      if (prev.includes(icao)) return prev;
      const next = [...prev, icao];
      broadcastUpdate(next);
      apiAdd(icao);
      window.dispatchEvent(new CustomEvent("watchlist-airport-added", { detail: icao }));
      return next;
    });
    // Re-sync the full watchlist to backend after batch additions (debounced)
    scheduleSync();
  }, [broadcastUpdate, scheduleSync]);

  const removeIcao = useCallback((icao: string) => {
    const up = icao.toUpperCase();
    setWatchedIcaos((prev) => {
      const next = prev.filter((c) => c !== up);
      broadcastUpdate(next);
      apiRemove(up);
      window.dispatchEvent(new CustomEvent("watchlist-synced"));
      return next;
    });
  }, [broadcastUpdate]);

  const clearWatchlist = useCallback(() => {
    setWatchedIcaos([]);
    broadcastUpdate([]);
    apiClear();
    window.dispatchEvent(new CustomEvent("watchlist-synced"));
  }, [broadcastUpdate]);

  const effectiveIcaos = watchedIcaos.length > 0 ? watchedIcaos : [DEFAULT_ICAO];

  const isWatching = useCallback(
    (icao: string) => effectiveIcaos.includes(icao.toUpperCase()),
    [effectiveIcaos]
  );

  return (
    <WatchlistContext.Provider value={{
      watchedIcaos,
      effectiveIcaos,
      addIcao,
      removeIcao,
      clearWatchlist,
      isWatching,
      hasFilter: watchedIcaos.length > 0,
      isLoading: false,
      initialAlerts,
      initialAlertsReady,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
