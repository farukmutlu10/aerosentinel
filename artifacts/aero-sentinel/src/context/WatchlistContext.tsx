import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
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

// On mount: replace backend list with this browser's localStorage list
function syncToBackend(icaos: string[]) {
  void fetch("/api/watchlist/sync", {
    method: "PUT",
    headers,
    body: JSON.stringify({ icaos }),
  }).catch(() => {});
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
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchedIcaos, setWatchedIcaos] = useState<string[]>(loadLocal);

  // On mount: push this browser's list to backend as source of truth
  useEffect(() => {
    syncToBackend(loadLocal());
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
  }, [broadcastUpdate]);

  const removeIcao = useCallback((icao: string) => {
    const up = icao.toUpperCase();
    setWatchedIcaos((prev) => {
      const next = prev.filter((c) => c !== up);
      broadcastUpdate(next);
      apiRemove(up);
      return next;
    });
  }, [broadcastUpdate]);

  const clearWatchlist = useCallback(() => {
    setWatchedIcaos([]);
    broadcastUpdate([]);
    apiClear();
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
