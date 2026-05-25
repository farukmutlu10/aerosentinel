import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { TafText } from "@/components/TafText";
import { ColoredRawText } from "@/components/ColoredRawText";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  parseMetar, FlightCategory, CATEGORY_COLOR,
  extractTimeSlots, parseTafWorstCategory,
  hasCritWx, hasOrangeWx,
} from "@/lib/metarParser";

type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
type ViewMode = "TAF" | "METAR" | "BOTH";
const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

const DEFAULT_CATS = ALL_CATS as string[];
const DEFAULT_VIEW: ViewMode = "TAF";
const DEFAULT_ROUTE: RouteFilter = "ALL";
const DEFAULT_SORT: SortMode = "alpha";

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

const WEATHER_KEY = (key: string) => ["watchlist", "weather", key];

function useWatchlistWeather(icaos: string[]) {
  const key = icaos.join(",");
  const queryClient = useQueryClient();
  const query = useQuery<WeatherItem[]>({
    queryKey: WEATHER_KEY(key),
    queryFn: () => fetch(`/api/watchlist/weather?icaos=${key}`).then((r) => r.json()),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: WEATHER_KEY(key) });
  return { ...query, refresh };
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "lifr-first", label: "Worst First" },
  { value: "vfr-first", label: "Best First" },
];

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "TAF",   label: "TAF" },
  { value: "METAR", label: "METAR" },
  { value: "BOTH",  label: "TAF+METAR" },
];

export default function Dashboard() {
  const { theme, toggleTheme } = useThemeContext();
  const { effectiveIcaos, watchedIcaos } = useWatchlist();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [view, setView] = usePersistedState<ViewMode>("as-dash-view", DEFAULT_VIEW);
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-dash-cats", DEFAULT_CATS);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-dash-route", DEFAULT_ROUTE);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-dash-sort", DEFAULT_SORT);
  const [timeFilters, setTimeFilters] = usePersistedState<string[]>("as-dash-time-multi", []);
  const [icaoSearch, setIcaoSearch] = usePersistedState<string>("as-dash-icao-search", "");
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);

  const activeCats = new Set<FlightCategory>(activeCatsArr as FlightCategory[]);
  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const toggleTimeSlot = (slot: string) =>
    setTimeFilters((p) => p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot]);

  useEffect(() => {
    if (!timeOpen) return;
    const handler = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) {
        setTimeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [timeOpen]);

  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { data: weatherData, isLoading: weatherLoading, refresh: refreshWeather } = useWatchlistWeather(effectiveIcaos);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshWeather();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const airports = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.map((w) => ({ ...w, parsed: w.rawMetar ? parseMetar(w.rawMetar) : null }));
  }, [weatherData]);

  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const a of airports) {
      if (routeFilter === "DOM" && !a.icao.startsWith("LT")) continue;
      if (routeFilter === "INT" && a.icao.startsWith("LT")) continue;
      const raw = view === "METAR" ? (a.rawMetar ?? "") : (a.rawTaf ?? "");
      extractTimeSlots(raw).forEach((s) => slots.add(s));
    }
    return [...slots].sort().reverse();
  }, [airports, view, routeFilter]);

  useEffect(() => {
    if (timeFilters.length > 0 && allTimeSlots.length > 0) {
      const valid = timeFilters.filter((f) => allTimeSlots.includes(f));
      if (valid.length !== timeFilters.length) setTimeFilters(valid);
    }
  }, [allTimeSlots]);

  const isFiltered =
    view !== DEFAULT_VIEW ||
    activeCatsArr.length !== DEFAULT_CATS.length ||
    routeFilter !== DEFAULT_ROUTE ||
    sortMode !== DEFAULT_SORT ||
    timeFilters.length > 0 ||
    icaoSearch.trim() !== "";

  const resetFilters = () => {
    setView(DEFAULT_VIEW);
    setActiveCatsArr(DEFAULT_CATS);
    setRouteFilter(DEFAULT_ROUTE);
    setSortMode(DEFAULT_SORT);
    setTimeFilters([]);
    setIcaoSearch("");
  };

  const displayed = useMemo(() => {
    let list = airports;
    list = list.filter((a) => activeCats.has(a.parsed?.flightCategory ?? FlightCategory.VFR));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    if (icaoSearch.trim()) {
      const q = icaoSearch.trim().toUpperCase();
      list = list.filter((a) => a.icao.includes(q));
    }
    if (timeFilters.length > 0) {
      list = list.filter((a) => {
        const raw = view === "METAR" ? (a.rawMetar ?? "") : (a.rawTaf ?? "");
        const slots = extractTimeSlots(raw);
        return timeFilters.some((f) => slots.includes(f));
      });
    }
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
  }, [airports, activeCatsArr, routeFilter, sortMode, timeFilters, icaoSearch, view]);

  const monitorData = monitor as { running?: boolean; scanCount?: number; scanCountToday?: number; monitoredAirports?: number } | undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader monitorStatus={monitor} theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5 space-y-4">

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
            <span className="text-muted-foreground tracking-widest">MONITOR</span>
            <span className={monitorData?.running ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
              {monitorData?.running ? "ACTIVE" : "STOPPED"}
            </span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">SCANS TODAY</span>
            <span className="tabular-nums">{monitorData?.scanCountToday ?? monitorData?.scanCount ?? 0}</span>
            {watchedIcaos.length > 0 && (
              <><span className="text-border">|</span>
              <span className="text-sky-400">WATCHLIST {watchedIcaos.length}</span></>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">INTERVAL: 60s</span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Hava verisini yenile"
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono font-bold border transition-all disabled:opacity-50"
              style={{
                borderColor: "#38BDF840",
                color: "#38BDF8",
                backgroundColor: "#38BDF810",
              }}
            >
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={isRefreshing ? "animate-spin" : ""}
              >
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              {isRefreshing ? "..." : "REFRESH"}
            </button>
          </div>
        </div>

        {/* Airport Weather Section */}
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Category filters */}
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
            <span className="text-border text-xs font-mono">|</span>

            {/* DOM/INT */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                <button key={f} onClick={() => setRouteFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* Sort */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {SORT_OPTIONS.map((s) => (
                <button key={s.value} onClick={() => setSortMode(s.value)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* View */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {VIEW_OPTIONS.map((v) => (
                <button key={v.value} onClick={() => { setView(v.value); setTimeFilters([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${view === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* TIME multi-select */}
            {!weatherLoading && allTimeSlots.length > 0 && (
              <div className="relative" ref={timeRef}>
                <button
                  onClick={() => setTimeOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${
                    timeFilters.length > 0
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  TIME
                  {timeFilters.length > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full text-[9px] font-bold px-1 leading-tight">
                      {timeFilters.length}
                    </span>
                  )}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${timeOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {timeOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg min-w-[150px] overflow-hidden">
                    {timeFilters.length > 0 && (
                      <button
                        onClick={() => setTimeFilters([])}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-b border-border/50">
                        Clear selection
                      </button>
                    )}
                    {allTimeSlots.map((slot) => {
                      const selected = timeFilters.includes(slot);
                      const dayPart = slot.slice(0, 2);
                      const hourMin = slot.slice(2, 6);
                      const zPart = slot.slice(6);
                      return (
                        <button key={slot}
                          onClick={() => toggleTimeSlot(slot)}
                          className={`w-full text-left px-3 py-2 text-xs font-mono tabular-nums flex items-center justify-between gap-3 transition-colors ${
                            selected ? "bg-primary/10" : "hover:bg-muted"
                          }`}>
                          <span>
                            <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{dayPart}</span>
                            <span className="text-[hsl(45_90%_50%)] font-bold">{hourMin}</span>
                            <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{zPart}</span>
                          </span>
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ICAO search */}
            <div className="relative flex items-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-2 text-muted-foreground pointer-events-none">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="ICAO..."
                value={icaoSearch}
                onChange={(e) => setIcaoSearch(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className={`pl-6 pr-2 py-1 w-20 rounded text-xs font-mono border bg-card transition-colors focus:outline-none focus:w-28 focus:border-primary ${
                  icaoSearch ? "border-primary text-primary" : "border-border text-muted-foreground"
                }`}
              />
            </div>

            {/* Reset filters */}
            {isFiltered && (
              <button onClick={resetFilters}
                title="Reset all filters"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                Reset
              </button>
            )}

            <span className="text-muted-foreground text-xs font-mono ml-auto">
              {weatherLoading ? "loading..." : `${displayed.length} airports`}
            </span>
          </div>

          {weatherLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-lg bg-card animate-pulse border border-border" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground font-mono text-sm">No airports match current filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map((a) => (
                <WeatherCard key={a.icao} icao={a.icao} rawTaf={a.rawTaf} rawMetar={a.rawMetar} parsed={a.parsed} view={view} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

// ── WeatherCard ───────────────────────────────────────────────────────────────

function WeatherCard({ icao, rawTaf, rawMetar, parsed, view }: {
  icao: string; rawTaf: string | null; rawMetar: string | null;
  parsed: ReturnType<typeof parseMetar> | null; view: ViewMode;
}) {
  const cat = parsed?.flightCategory ?? FlightCategory.VFR;
  const catColor = CATEGORY_COLOR[cat];
  const isDom = icao.startsWith("LT");
  const showTaf = view === "TAF" || view === "BOTH";
  const showMetar = view === "METAR" || view === "BOTH";

  const tafWorst = parseTafWorstCategory(rawTaf);
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

  // Left border color + label: TAF mode uses TAF worst, METAR mode uses METAR category
  let borderColor: string;
  let borderLabel: string;
  if (view === "METAR") {
    borderColor = rawMetar ? catColor : "hsl(var(--border))";
    borderLabel = "METAR";
  } else {
    // TAF or BOTH: left border = TAF worst category
    const effectiveCat = tafWorst && rawTaf
      ? (order.indexOf(tafWorst) >= order.indexOf(cat) ? tafWorst : cat)
      : cat;
    borderColor = rawTaf ? CATEGORY_COLOR[effectiveCat] : (rawMetar ? catColor : "hsl(var(--border))");
    borderLabel = "TAF";
  }

  const critTaf = rawTaf ? hasCritWx(rawTaf) : false;
  const critMetar = rawMetar ? hasCritWx(rawMetar) : false;
  const orangeTaf = rawTaf ? hasOrangeWx(rawTaf) : false;

  return (
    <Link href={`/airports/${icao}`}
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer flex"
      style={{ borderLeftWidth: "3px", borderLeftColor: borderColor }}>

      {/* Colored left strip with vertical label */}
      <div
        className="flex-shrink-0 w-[18px] flex items-center justify-center"
        style={{ backgroundColor: `${borderColor}12` }}>
        <span
          className="text-[7px] font-mono font-bold tracking-[0.15em] select-none"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            color: borderColor,
            opacity: 0.75,
          }}>
          {borderLabel}
        </span>
      </div>

      {/* Card content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-base tracking-wider">{icao}</span>
            <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">{isDom ? "DOM" : "INT"}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {rawMetar ? (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                style={{ color: catColor, borderColor: `${catColor}60`, backgroundColor: `${catColor}18` }}>
                {cat}
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground">NO DATA</span>
            )}
            {critTaf && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/50 bg-red-400/10">
                CRIT TAF
              </span>
            )}
            {critMetar && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/50 bg-red-400/10">
                CRIT METAR
              </span>
            )}
            {!critTaf && orangeTaf && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-orange-400 border-orange-400/50 bg-orange-400/10">
                WX TAF
              </span>
            )}
          </div>
        </div>

        {/* TAF section */}
        {showTaf && (
          <div className="px-3 py-3">
            {rawTaf ? (
              <div className="max-h-36 overflow-y-auto">
                <TafText raw={rawTaf} />
              </div>
            ) : (
              <p className="text-xs font-mono text-muted-foreground italic">Awaiting TAF data...</p>
            )}
          </div>
        )}

        {/* METAR section */}
        {showMetar && (
          <div className={`px-3 py-3 ${showTaf ? "border-t border-border/60 bg-background/30" : ""}`}>
            {rawMetar ? <ColoredRawText raw={rawMetar} /> : <p className="text-xs font-mono text-muted-foreground italic">Awaiting METAR...</p>}
          </div>
        )}
      </div>
    </Link>
  );
}
