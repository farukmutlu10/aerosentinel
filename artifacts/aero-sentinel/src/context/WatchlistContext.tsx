import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeIcao } from "@/lib/icaoUtils";

const WATCHLIST_KEY = ["watchlist"];
const DEFAULT_ICAO = "LTFH";

interface WatchlistEntry { id: number; icao: string; addedAt: string }

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

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery<WatchlistEntry[]>({
    queryKey: WATCHLIST_KEY,
    queryFn: () => apiFetch("/api/watchlist"),
    staleTime: 10_000,
  });

  const watchedIcaos = entries.map((e) => e.icao);
  const effectiveIcaos = watchedIcaos.length > 0 ? watchedIcaos : [DEFAULT_ICAO];

  const addMutation = useMutation({
    mutationFn: (icao: string) =>
      apiFetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ icao }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const removeMutation = useMutation({
    mutationFn: (icao: string) => apiFetch(`/api/watchlist/${icao}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch("/api/watchlist/all", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const addIcao = useCallback((raw: string) => {
    const icao = normalizeIcao(raw);
    if (icao.length !== 4) return;
    addMutation.mutate(icao);
  }, [addMutation]);

  const removeIcao = useCallback((icao: string) => {
    removeMutation.mutate(icao.toUpperCase());
  }, [removeMutation]);

  const clearWatchlist = useCallback(() => {
    clearMutation.mutate();
  }, [clearMutation]);

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
