import { useMemo } from "react";
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
import { parseMetar, FlightCategory, CATEGORY_COLOR, extractTimeSlots, formatTimeSlot } from "@/lib/metarParser";

type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
type ViewMode = "TAF" | "METAR" | "BOTH";
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

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "TAF",  label: "TAF" },
  { value: "METAR", label: "METAR" },
  { value: "BOTH",  label: "TAF+METAR" },
];

export default function Dashboard() {
  const { theme, toggleTheme } = useThemeContext();
  const { effectiveIcaos, watchedIcaos } = useWatchlist();

  const [view, setView] = usePersistedState<ViewMode>("as-dash-view", "TAF");
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-dash-cats", ALL_CATS);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-dash-route", "ALL");
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-dash-sort", "alpha");
  const [timeSlotFilter, setTimeSlotFilter] = usePersistedState<string>("as-dash-time", "ALL");

  const activeCats = new Set<FlightCategory>(activeCatsArr as FlightCategory[]);
  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

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

  // Collect all unique time slots across all airport reports
  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const a of airports) {
      if (a.rawMetar) extractTimeSlots(a.rawMetar).forEach((s) => slots.add(s));
      if (a.rawTaf) extractTimeSlots(a.rawTaf).forEach((s) => slots.add(s));
    }
    return [...slots].sort();
  }, [airports]);

  const displayed = useMemo(() => {
    let list = airports;
    list = list.filter((a) => activeCats.has(a.parsed?.flightCategory ?? FlightCategory.VFR));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    if (timeSlotFilter !== "ALL") {
      list = list.filter((a) => {
        const raw = (a.rawMetar ?? "") + " " + (a.rawTaf ?? "");
        return extractTimeSlots(raw).includes(timeSlotFilter);
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
  }, [airports, activeCatsArr, routeFilter, sortMode, timeSlotFilter]);

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
          {/* Filter row 1: category / route / sort / view */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
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
            {/* View: TAF / METAR / BOTH */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {VIEW_OPTIONS.map((v) => (
                <button key={v.value} onClick={() => setView(v.value)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${view === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className="text-muted-foreground text-xs font-mono ml-auto">
              {weatherLoading ? "loading..." : `${displayed.length} airports`}
            </span>
          </div>

          {/* Filter row 2: time slots (only when data available) */}
          {!weatherLoading && allTimeSlots.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">OBS</span>
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
                <button
                  onClick={() => setTimeSlotFilter("ALL")}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${timeSlotFilter === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  ALL
                </button>
                {allTimeSlots.map((slot) => (
                  <button key={slot}
                    onClick={() => setTimeSlotFilter(timeSlotFilter === slot ? "ALL" : slot)}
                    className={`px-2.5 py-1 rounded text-xs font-mono tabular-nums transition-colors ${timeSlotFilter === slot ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {formatTimeSlot(slot)}
                  </button>
                ))}
              </div>
            </div>
          )}

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
  return (
    <Link href={`/airports/${icao}`}
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer"
      style={{ borderLeftWidth: "3px", borderLeftColor: rawMetar ? catColor : undefined }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base tracking-wider">{icao}</span>
          <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">{isDom ? "DOM" : "INT"}</span>
        </div>
        {rawMetar ? (
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
            style={{ color: catColor, borderColor: `${catColor}60`, backgroundColor: `${catColor}18` }}>{cat}</span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">NO DATA</span>
        )}
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
