import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { useQuery } from "@tanstack/react-query";
import { parseMetar, FlightCategory, CATEGORY_COLOR } from "@/lib/metarParser";

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

function useWatchlistWeather() {
  return useQuery<WeatherItem[]>({
    queryKey: ["watchlist", "weather"],
    queryFn: () => fetch("/api/watchlist/weather").then((r) => r.json()),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
}

export default function Airports() {
  const { watchedIcaos, effectiveIcaos, addIcao, removeIcao, clearWatchlist, hasFilter, isLoading: wlLoading } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: weatherData, isLoading: weatherLoading } = useWatchlistWeather();

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

  const isLoading = wlLoading || weatherLoading;

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
              placeholder={watchedIcaos.length === 0 ? "ICAO kodu gir, Enter ile ekle... (örn: LTFJ, VIDP, EDDF)" : "Ekle..."}
              className="flex-1 min-w-[200px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
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
              ? <span className="text-sky-400">{watchedIcaos.length} meydan izleniyor — tüm sayfalarda bu filtre geçerli. Herhangi bir ICAO eklenebilir.</span>
              : <span>Boş bırakılırsa varsayılan olarak <span className="text-primary font-bold">LTFH</span> gösterilir</span>
            }
          </p>
        </div>

        {/* Info if no custom watchlist */}
        {!hasFilter && (
          <div className="mb-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2.5">
            <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs font-mono text-muted-foreground">
              Watchlist boş — varsayılan olarak <span className="text-primary font-bold">LTFH</span> gösteriliyor.
              Herhangi bir meydan ICAO kodu ekleyebilirsiniz (LTFJ, VIDP, EDDF, RJTT vb.)
            </p>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-4 mb-5 text-sm font-mono">
          <span className="text-muted-foreground">{effectiveIcaos.length} AIRPORTS</span>
          {!hasFilter && <span className="text-muted-foreground text-xs">(varsayılan)</span>}
        </div>

        {/* Weather grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-card animate-pulse border border-border" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {effectiveIcaos.map((icao) => {
              const w = weatherData?.find((d) => d.icao === icao);
              const parsed = w?.rawMetar ? parseMetar(w.rawMetar) : null;
              const cat = parsed?.flightCategory ?? null;
              const catColor = cat ? CATEGORY_COLOR[cat] : undefined;
              const isDom = icao.startsWith("LT");

              return (
                <Link
                  key={icao}
                  href={`/airports/${icao}`}
                  className="block bg-card rounded-lg border border-border hover:border-foreground/20 transition-all cursor-pointer overflow-hidden"
                  style={catColor ? { borderLeftWidth: "3px", borderLeftColor: catColor } : undefined}
                >
                  <div className="px-3 py-3">
                    <div className="flex items-start justify-between mb-2 gap-1">
                      <span className="font-mono font-bold text-sm leading-tight">{icao}</span>
                      <div className="flex flex-col items-end gap-1">
                        {isDom && <span className="text-[9px] font-mono text-muted-foreground leading-tight">DOM</span>}
                        {cat && (
                          <span className="text-[9px] font-mono font-bold leading-tight" style={{ color: catColor }}>
                            {cat}
                          </span>
                        )}
                      </div>
                    </div>

                    {w?.rawMetar ? (
                      <div className="space-y-0.5">
                        {parsed?.cavok ? (
                          <div className="text-[10px] font-mono text-green-400">CAVOK</div>
                        ) : (
                          <>
                            {parsed?.visibility != null && (
                              <div className="text-[10px] font-mono">
                                <span className="text-muted-foreground">V </span>
                                <span style={{ color: parsed.visibility >= 8001 ? "#22c55e" : parsed.visibility >= 5000 ? "#3b82f6" : parsed.visibility >= 1500 ? "#ef4444" : "#a855f7" }}>
                                  {parsed.visibility >= 9999 ? "9999+" : parsed.visibility}m
                                </span>
                              </div>
                            )}
                            {parsed?.ceiling && (
                              <div className="text-[10px] font-mono">
                                <span className="text-muted-foreground">C </span>
                                <span style={{ color: parsed.ceiling.feet > 3000 ? "#22c55e" : parsed.ceiling.feet >= 1000 ? "#3b82f6" : parsed.ceiling.feet >= 500 ? "#ef4444" : "#a855f7" }}>
                                  {parsed.ceiling.type}{String(parsed.ceiling.feet / 100).padStart(3, "0")}
                                </span>
                              </div>
                            )}
                            {parsed?.wind && (
                              <div className="text-[10px] font-mono">
                                <span className="text-muted-foreground">W </span>
                                <span style={{ color: parsed.wind.dangerColor }}>{parsed.wind.raw}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground font-mono">awaiting...</div>
                    )}

                    {/* Non-monitored badge */}
                    {!w?.rawTaf && !w?.rawMetar && w !== undefined && (
                      <div className="text-[9px] text-muted-foreground font-mono mt-1">custom ICAO</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
