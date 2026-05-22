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

async function apiGet(): Promise<string[]> {
  const res = await fetch("/api/watchlist");
  if (!res.ok) return [];
  return (await res.json()) as string[];
}

async function apiAdd(icao: string): Promise<void> {
  await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icao }),
  });
}

async function apiRemove(icao: string): Promise<void> {
  await fetch(`/api/watchlist/${icao}`, { method: "DELETE" });
}

async function apiClear(): Promise<void> {
  await fetch("/api/watchlist", { method: "DELETE" });
}

interface WatchlistContextValue {
  watchedIcaos: string[];
  effectiveIcaos: string[];
  addIcao: (icao: string) => void;
  removeIcao: (icao: string) => void;
  clearWatchlist: () => void;
  isWatching: (icao: string) => boolean;
  hasFilter: boolean;
  isLoading: boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchedIcaos, setWatchedIcaos] = useState<string[]>(loadLocal);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: fetch from backend and use as source of truth
  useEffect(() => {
    apiGet()
      .then((serverList) => {
        setWatchedIcaos(serverList);
        saveLocal(serverList);
      })
      .catch(() => {
        // Backend unreachable — fall back to localStorage
      })
      .finally(() => setIsLoading(false));
  }, []);

  const addIcao = useCallback((raw: string) => {
    const icao = normalizeIcao(raw);
    if (icao.length !== 4) return;
    setWatchedIcaos((prev) => {
      if (prev.includes(icao)) return prev;
      const next = [...prev, icao];
      saveLocal(next);
      void apiAdd(icao);
      return next;
    });
  }, []);

  const removeIcao = useCallback((icao: string) => {
    const up = icao.toUpperCase();
    setWatchedIcaos((prev) => {
      const next = prev.filter((c) => c !== up);
      saveLocal(next);
      void apiRemove(up);
      return next;
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchedIcaos([]);
    saveLocal([]);
    void apiClear();
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
      isLoading,
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
