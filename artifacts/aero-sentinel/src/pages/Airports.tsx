import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { useQuery } from "@tanstack/react-query";
import { usePersistedState } from "@/hooks/usePersistedState";
import { parseMetar, FlightCategory, CATEGORY_COLOR } from "@/lib/metarParser";
import { normalizeIcao } from "@/lib/icaoUtils";

type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

function useWatchlistWeather(icaos: string[]) {
  const key = icaos.join(",");
  return useQuery<WeatherItem[]>({
    queryKey: ["watchlist", "weather", key],
    queryFn: () => fetch(`/api/watchlist/weather?icaos=${key}`).then((r) => r.json()),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "lifr-first", label: "Worst First" },
  { value: "vfr-first", label: "Best First" },
];

export default function Airports() {
  const { watchedIcaos, effectiveIcaos, addIcao, removeIcao, clearWatchlist, hasFilter } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: weatherData, isLoading: weatherLoading } = useWatchlistWeather(effectiveIcaos);

  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-airports-cats", ALL_CATS);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-airports-route", "ALL");
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-airports-sort", "alpha");

  const activeCats = new Set<FlightCategory>(activeCatsArr as FlightCategory[]);
  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const handleAdd = () => {
    const codes = inputVal.split(/[,\s]+/).filter(Boolean);
    const skipped: string[] = [];
    codes.forEach((c) => {
      const icao = normalizeIcao(c);
      if (icao.length === 4) addIcao(icao);
      else if (icao.length > 0) skipped.push(c);
    });
    setInputVal(skipped.length > 0 ? skipped.join(",") : "");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Backspace" && inputVal === "" && watchedIcaos.length > 0) removeIcao(watchedIcaos[watchedIcaos.length - 1]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
      .replace(/İ/g, "I").replace(/ı/g, "I")
      .replace(/Ş/g, "S").replace(/ş/g, "S")
      .replace(/Ğ/g, "G").replace(/ğ/g, "G")
      .replace(/Ü/g, "U").replace(/ü/g, "U")
      .replace(/Ö/g, "O").replace(/ö/g, "O")
      .replace(/Ç/g, "C").replace(/ç/g, "C")
      .toUpperCase()
      .replace(/[^A-Z0-9,\s]/g, "");
    setInputVal(val);
  };

  const enriched = effectiveIcaos.map((icao) => {
    const w = weatherData?.find((d) => d.icao === icao);
    const parsed = w?.rawMetar ? parseMetar(w.rawMetar) : null;
    return { icao, rawMetar: w?.rawMetar ?? null, rawTaf: w?.rawTaf ?? null, parsed };
  });

  const displayed = (() => {
    let list = enriched;
    list = list.filter((a) => activeCats.has(a.parsed?.flightCategory ?? FlightCategory.VFR));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    const sorted = [...list];
    if (sortMode === "alpha") {
      sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    } else {
      const order = sortMode === "lifr-first"
        ? [FlightCategory.LIFR, FlightCategory.IFR, FlightCategory.MVFR, FlightCategory.VFR]
        : [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
      sorted.sort((a, b) => {
        const ai = order.indexOf(a.parsed?.flightCategory ?? FlightCategory.VFR);
        const bi = order.indexOf(b.parsed?.flightCategory ?? FlightCategory.VFR);
        return ai !== bi ? ai - bi : a.icao.localeCompare(b.icao);
      });
    }
    return sorted;
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Watchlist input */}
        <div className="bg-card border border-border rounded-lg p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              WATCHLIST — Monitored Airports
            </label>
            {hasFilter && (
              <button onClick={clearWatchlist} className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors">
                Clear All
              </button>
            )}
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
            onClick={() => inputRef.current?.focus()}>
            {watchedIcaos.map((icao) => (
              <span key={icao} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold">
                {icao}
                <button type="button" onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                  className="text-primary/60 hover:text-primary transition-colors leading-none">✕</button>
              </span>
            ))}
            <input ref={inputRef} type="text" value={inputVal}
              onChange={handleInputChange} onKeyDown={handleKeyDown}
              placeholder={watchedIcaos.length === 0 ? "Type ICAO codes and press Enter — e.g. LTFJ,LTAC,LTFM" : "Add more (comma-separated)..."}
              className="flex-1 min-w-[200px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
            />
            {inputVal.replace(/[,\s]/g, "").length >= 4 && (
              <button type="button" onClick={handleAdd}
                className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">
                ADD
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-2">
            {hasFilter
              ? <span className="text-sky-400">{watchedIcaos.length} airports in watchlist — saved to this browser only.</span>
              : <span>Empty watchlist — showing default <span className="text-primary font-bold">LTFH</span>. Add any 4-letter ICAO code.</span>
            }
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1">
            {ALL_CATS.map((cat) => (
              <button key={cat} onClick={() => toggleCat(cat)}
                className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                style={activeCats.has(cat) ? {
                  borderColor: CATEGORY_COLOR[cat] + "99",
                  color: CATEGORY_COLOR[cat],
                  backgroundColor: CATEGORY_COLOR[cat] + "18",
                } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                {cat}
              </button>
            ))}
          </div>
          <span className="text-border text-xs">|</span>
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
              <button key={f} onClick={() => setRouteFilter(f)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <span className="text-border text-xs">|</span>
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {SORT_OPTIONS.map((s) => (
              <button key={s.value} onClick={() => setSortMode(s.value)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground text-xs font-mono ml-auto">
            {weatherLoading ? "loading..." : `${displayed.length} airports`}
          </span>
        </div>

        {/* Grid */}
        {weatherLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => <div key={i} className="h-28 rounded-lg bg-card animate-pulse border border-border" />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground font-mono text-sm">No airports match current filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {displayed.map(({ icao, rawMetar, parsed }) => {
              const cat = parsed?.flightCategory ?? null;
              const catColor = cat ? CATEGORY_COLOR[cat] : undefined;
              const isDom = icao.startsWith("LT");
              return (
                <Link key={icao} href={`/airports/${icao}`}
                  className="block bg-card rounded-lg border border-border hover:border-foreground/20 transition-all cursor-pointer overflow-hidden"
                  style={catColor ? { borderLeftWidth: "3px", borderLeftColor: catColor } : undefined}>
                  <div className="px-3 py-3">
                    <div className="flex items-start justify-between mb-2 gap-1">
                      <span className="font-mono font-bold text-sm leading-tight">{icao}</span>
                      <div className="flex flex-col items-end gap-1">
                        {isDom && <span className="text-[9px] font-mono text-muted-foreground">DOM</span>}
                        {cat && <span className="text-[9px] font-mono font-bold" style={{ color: catColor }}>{cat}</span>}
                      </div>
                    </div>
                    {rawMetar ? (
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
