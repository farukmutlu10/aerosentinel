import { useRef } from "react";
import { Link } from "wouter";
import { useListAirports, getListAirportsQueryKey } from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { formatDistanceToNow } from "date-fns";

export default function Airports() {
  const { data: allAirports, isLoading } = useListAirports({
    query: { queryKey: getListAirportsQueryKey(), refetchInterval: 30_000 },
  });

  const { rawInput, setRawInput, clearWatchlist, isWatching, hasFilter, watchedIcaos } = useWatchlist();
  const inputRef = useRef<HTMLInputElement>(null);

  const airports = allAirports ?? [];
  const displayed = hasFilter ? airports.filter((a) => isWatching(a.icao)) : airports;

  const criticalCount = displayed.filter((a) => a.status === "critical").length;
  const warningCount = displayed.filter((a) => a.status === "warning").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Watchlist filter */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
            WATCHLIST — Alert Alınacak Meydanlar
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="LTFJ, LTAC, LTBU, EDDF ..."
              className="flex-1 bg-background border border-input rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {hasFilter && (
              <button
                onClick={clearWatchlist}
                className="px-3 py-2 text-xs font-mono border border-border rounded text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                TEMIZLE
              </button>
            )}
          </div>
          {hasFilter ? (
            <p className="text-xs text-sky-400 font-mono mt-2">
              {watchedIcaos.length} meydan izleniyor — tüm sayfalarda bu filtre geçerli
            </p>
          ) : (
            <p className="text-xs text-muted-foreground font-mono mt-2">
              Boş bırakılırsa tüm {airports.length} meydan izlenir
            </p>
          )}
        </div>

        {/* Status summary */}
        <div className="flex items-center gap-6 mb-6 text-sm font-mono">
          <span className="text-muted-foreground">
            {displayed.length}{hasFilter ? ` / ${airports.length}` : ""} AIRPORTS
          </span>
          {criticalCount > 0 && <span className="text-red-400">{criticalCount} CRITICAL</span>}
          {warningCount > 0 && <span className="text-yellow-400">{warningCount} WARNING</span>}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {[...Array(48)].map((_, i) => (
              <div key={i} className="h-16 rounded bg-card animate-pulse border border-border" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {displayed.map((airport) => (
              <Link
                key={airport.icao}
                href={`/airports/${airport.icao}`}
                className={`block border rounded p-2.5 transition-all hover:scale-105 cursor-pointer ${
                  airport.status === "critical"
                    ? "border-red-500/40 bg-red-500/10 hover:border-red-500/60"
                    : airport.status === "warning"
                    ? "border-yellow-500/40 bg-yellow-500/10 hover:border-yellow-500/60"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-xs font-bold ${
                    airport.status === "critical" ? "text-red-400" :
                    airport.status === "warning" ? "text-yellow-400" :
                    "text-foreground"
                  }`}>
                    {airport.icao}
                  </span>
                  {airport.alertCount > 0 && (
                    <span className={`text-xs font-mono font-bold ${
                      airport.status === "critical" ? "text-red-400" : "text-yellow-400"
                    }`}>
                      {airport.alertCount}
                    </span>
                  )}
                </div>
                {airport.lastAlert ? (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {formatDistanceToNow(new Date(airport.lastAlert), { addSuffix: true }).replace("about ", "")}
                  </p>
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full mt-1 bg-green-500/60" />
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
