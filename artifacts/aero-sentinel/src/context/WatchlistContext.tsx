import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface WatchlistContextValue {
  watchedIcaos: string[];
  rawInput: string;
  setRawInput: (val: string) => void;
  clearWatchlist: () => void;
  isWatching: (icao: string) => boolean;
  hasFilter: boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function parseIcaos(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 3);
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [rawInput, setRawInputState] = useState<string>(
    () => localStorage.getItem("aero-sentinel-watchlist") ?? ""
  );

  const setRawInput = useCallback((val: string) => {
    setRawInputState(val);
    localStorage.setItem("aero-sentinel-watchlist", val);
  }, []);

  const clearWatchlist = useCallback(() => {
    setRawInputState("");
    localStorage.removeItem("aero-sentinel-watchlist");
  }, []);

  const watchedIcaos = parseIcaos(rawInput);
  const hasFilter = watchedIcaos.length > 0;

  const isWatching = useCallback(
    (icao: string) => !hasFilter || watchedIcaos.includes(icao.toUpperCase()),
    [watchedIcaos, hasFilter]
  );

  return (
    <WatchlistContext.Provider value={{ watchedIcaos, rawInput, setRawInput, clearWatchlist, isWatching, hasFilter }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
