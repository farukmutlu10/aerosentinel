import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface WatchlistContextValue {
  watchedIcaos: string[];
  addIcao: (icao: string) => void;
  removeIcao: (icao: string) => void;
  clearWatchlist: () => void;
  isWatching: (icao: string) => boolean;
  hasFilter: boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem("aero-sentinel-watchlist") ?? "[]");
  } catch {
    return [];
  }
}

function save(list: string[]) {
  localStorage.setItem("aero-sentinel-watchlist", JSON.stringify(list));
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchedIcaos, setWatchedIcaos] = useState<string[]>(load);

  const addIcao = useCallback((raw: string) => {
    const icao = raw.trim().toUpperCase();
    if (icao.length < 2) return;
    setWatchedIcaos((prev) => {
      if (prev.includes(icao)) return prev;
      const next = [...prev, icao];
      save(next);
      return next;
    });
  }, []);

  const removeIcao = useCallback((icao: string) => {
    setWatchedIcaos((prev) => {
      const next = prev.filter((x) => x !== icao);
      save(next);
      return next;
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchedIcaos([]);
    localStorage.removeItem("aero-sentinel-watchlist");
  }, []);

  const hasFilter = watchedIcaos.length > 0;

  const isWatching = useCallback(
    (icao: string) => !hasFilter || watchedIcaos.includes(icao.toUpperCase()),
    [watchedIcaos, hasFilter]
  );

  return (
    <WatchlistContext.Provider value={{ watchedIcaos, addIcao, removeIcao, clearWatchlist, isWatching, hasFilter }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
