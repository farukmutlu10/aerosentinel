import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetAlertsSummary, getGetAlertsSummaryQueryKey,
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { TafText } from "@/components/TafText";
import { ColoredRawText } from "@/components/ColoredRawText";
import { ClockCard } from "@/components/ClockDisplay";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { parseMetar, FlightCategory, CATEGORY_COLOR, extractTimeSlots, parseTafWorstCategory } from "@/lib/metarParser";

type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
type ViewMode = "TAF" | "METAR" | "BOTH";
const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

const DEFAULT_CATS = ALL_CATS as string[];
const DEFAULT_VIEW: ViewMode = "TAF";
const DEFAULT_ROUTE: RouteFilter = "ALL";
const DEFAULT_SORT: SortMode = "alpha";

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

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "TAF",   label: "TAF" },
  { value: "METAR", label: "METAR" },
  { value: "BOTH",  label: "TAF+METAR" },
];

export default function Dashboard() {
  const { theme, toggleTheme } = useThemeContext();
  const { effectiveIcaos, watchedIcaos } = useWatchlist();

  const [view, setView] = usePersistedState<ViewMode>("as-dash-view", DEFAULT_VIEW);
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-dash-cats", DEFAULT_CATS);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-dash-route", DEFAULT_ROUTE);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-dash-sort", DEFAULT_SORT);
  const [timeFilters, setTimeFilters] = usePersistedState<string[]>("as-dash-time-multi", []);
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);

  const activeCats = new Set<FlightCategory>(activeCatsArr as FlightCategory[]);
  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const toggleTimeSlot = (slot: string) =>
    setTimeFilters((p) => p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot]);

  // Close dropdown when clicking outside
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

  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { queryKey: getGetAlertsSummaryQueryKey(), refetchInterval: 30_000 },
  });
  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { data: weatherData, isLoading: weatherLoading } = useWatchlistWeather(effectiveIcaos);

  const airports = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.map((w) => ({ ...w, parsed: w.rawMetar ? parseMetar(w.rawMetar) : null }));
  }, [weatherData]);

  // Extract time slots based on active view: TAF→rawTaf, METAR→rawMetar, BOTH→rawTaf
  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const a of airports) {
      const raw = view === "METAR" ? (a.rawMetar ?? "") : (a.rawTaf ?? "");
      extractTimeSlots(raw).forEach((s) => slots.add(s));
    }
    return [...slots].sort().reverse(); // newest first
  }, [airports, view]);

  // Drop stale time filters when view changes
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
    timeFilters.length > 0;

  const resetFilters = () => {
    setView(DEFAULT_VIEW);
    setActiveCatsArr(DEFAULT_CATS);
    setRouteFilter(DEFAULT_ROUTE);
    setSortMode(DEFAULT_SORT);
    setTimeFilters([]);
  };

  const displayed = useMemo(() => {
    let list = airports;
    list = list.filter((a) => activeCats.has(a.parsed?.flightCategory ?? FlightCategory.VFR));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
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
  }, [airports, activeCatsArr, routeFilter, sortMode, timeFilters, view]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader monitorStatus={monitor} theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="TOTAL ALERTS" value={summaryLoading ? "—" : String(summary?.totalAlerts ?? 0)} />
          <StatCard label="UNACKNOWLEDGED" value={summaryLoading ? "—" : String(summary?.unacknowledged ?? 0)} highlight={!summaryLoading && (summary?.unacknowledged ?? 0) > 0} />
          <StatCard label="TAF REVISIONS" value={summaryLoading ? "—" : String(summary?.tafRevisions ?? 0)} color="amber" />
          <StatCard label="SPECI ALERTS" value={summaryLoading ? "—" : String(summary?.speciAlerts ?? 0)} color="red" />
          <ClockCard />
        </div>

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-5 text-xs font-mono flex-wrap">
            <span className="text-muted-foreground">MONITOR</span>
            <span className={monitor?.running ? "text-green-400" : "text-red-400"}>{monitor?.running ? "ACTIVE" : "STOPPED"}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">SCANS</span>
            <span>{monitor?.scanCount ?? 0}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">AIRPORTS</span>
            <span>{monitor?.monitoredAirports ?? 0}</span>
            {watchedIcaos.length > 0 && (
              <><span className="text-muted-foreground">|</span>
              <span className="text-sky-400">WATCHLIST {watchedIcaos.length}</span></>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono hidden sm:block">INTERVAL: 60s</span>
        </div>

        {/* Airport Weather Section */}
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Category */}
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

            {/* TIME multi-select dropdown */}
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
                      return (
                        <button key={slot}
                          onClick={() => toggleTimeSlot(slot)}
                          className={`w-full text-left px-3 py-2 text-xs font-mono tabular-nums flex items-center justify-between gap-3 transition-colors ${
                            selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}>
                          {slot}
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
  const tafIsBadder = tafWorst && rawTaf && order.indexOf(tafWorst) > order.indexOf(cat);
  const tafWorstColor = tafWorst ? CATEGORY_COLOR[tafWorst] : null;

  return (
    <Link href={`/airports/${icao}`}
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer"
      style={{ borderLeftWidth: "3px", borderLeftColor: rawMetar ? catColor : undefined }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base tracking-wider">{icao}</span>
          <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">{isDom ? "DOM" : "INT"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {rawMetar ? (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
              style={{ color: catColor, borderColor: `${catColor}60`, backgroundColor: `${catColor}18` }}>
              {cat}
            </span>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">NO DATA</span>
          )}
          {tafIsBadder && tafWorst && tafWorstColor && (
            <span
              title={`TAF worst forecast: ${tafWorst}`}
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-1"
              style={{ color: tafWorstColor, borderColor: `${tafWorstColor}60`, backgroundColor: `${tafWorstColor}18` }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              TAF {tafWorst}
            </span>
          )}
        </div>
      </div>
      {showTaf && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">TAF</p>
          {rawTaf ? (
            <div className="max-h-36 overflow-y-auto">
              <TafText raw={rawTaf} />
            </div>
          ) : (
            <p className="text-xs font-mono text-muted-foreground italic">Awaiting TAF data...</p>
          )}
        </div>
      )}
      {showMetar && (
        <div className={`px-4 py-3 ${showTaf ? "border-t border-border/60 bg-background/30" : ""}`}>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">METAR</p>
          {rawMetar ? <ColoredRawText raw={rawMetar} /> : <p className="text-xs font-mono text-muted-foreground italic">Awaiting METAR...</p>}
        </div>
      )}
    </Link>
  );
}

function StatCard({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: "amber" | "red" }) {
  const vc = color === "amber" ? "text-yellow-400" : color === "red" ? "text-red-400" : highlight ? "text-yellow-300" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono ${vc}`}>{value}</p>
    </div>
  );
}
