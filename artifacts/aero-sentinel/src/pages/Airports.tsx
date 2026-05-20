import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { useListAirports, getListAirportsQueryKey } from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { formatDistanceToNow } from "date-fns";

export default function Airports() {
  const { data: allAirports, isLoading } = useListAirports({
    query: { queryKey: getListAirportsQueryKey(), refetchInterval: 30_000 },
  });

  const { watchedIcaos, addIcao, removeIcao, clearWatchlist, isWatching, hasFilter } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const airports = allAirports ?? [];
  const displayed = hasFilter ? airports.filter((a) => isWatching(a.icao)) : airports;
  const criticalCount = displayed.filter((a) => a.status === "critical").length;
  const warningCount = displayed.filter((a) => a.status === "warning").length;

  const handleAdd = () => {
    const codes = inputVal.split(/[,\s]+/).filter(Boolean);
    codes.forEach(addIcao);
    setInputVal("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Backspace" && inputVal === "" && watchedIcaos.length > 0) {
      removeIcao(watchedIcaos[watchedIcaos.length - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Watchlist tag input */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              WATCHLIST — İzlenecek Meydanlar
            </label>
            {hasFilter && (
              <button
                onClick={clearWatchlist}
                className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors"
              >
                Tümünü Temizle
              </button>
            )}
          </div>

          {/* Tag input box */}
          <div
            className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
            onClick={() => inputRef.current?.focus()}
          >
            {watchedIcaos.map((icao) => (
              <span
                key={icao}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold"
              >
                {icao}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                  className="text-primary/60 hover:text-primary transition-colors leading-none"
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder={watchedIcaos.length === 0 ? "ICAO kodu gir, Enter ile ekle... (örn: LTFJ)" : "Ekle..."}
              className="flex-1 min-w-[140px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
            />
            {inputVal.length >= 2 && (
              <button
                type="button"
                onClick={handleAdd}
                className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
              >
                EKLE
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground font-mono mt-2">
            {hasFilter
              ? <span className="text-sky-400">{watchedIcaos.length} meydan izleniyor — tüm sayfalarda bu filtre geçerli</span>
              : `Boş bırakılırsa tüm ${airports.length} meydan izlenir`
            }
          </p>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-6 mb-5 text-sm font-mono">
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
                    : "border-border bg-card hover:border-foreground/20"
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
