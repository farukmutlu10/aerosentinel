import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
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

// Notify backend to add airport to the monitored pool (fire-and-forget)
function notifyBackendAdd(icao: string) {
  void fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icao }),
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

  const addIcao = useCallback((raw: string) => {
    const icao = normalizeIcao(raw);
    if (icao.length !== 4) return;
    setWatchedIcaos((prev) => {
      if (prev.includes(icao)) return prev;
      const next = [...prev, icao];
      saveLocal(next);
      notifyBackendAdd(icao); // add to monitoring pool
      return next;
    });
  }, []);

  const removeIcao = useCallback((icao: string) => {
    const up = icao.toUpperCase();
    setWatchedIcaos((prev) => {
      const next = prev.filter((c) => c !== up);
      saveLocal(next);
      // do NOT remove from backend — other browsers may still have it
      return next;
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchedIcaos([]);
    saveLocal([]);
    // do NOT clear backend — shared monitoring pool
  }, []);

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
