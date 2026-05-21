import { useMemo, useState } from "react";
import {
  useGetAlertsSummary, getGetAlertsSummaryQueryKey,
  useGetRecentAlerts, getGetRecentAlertsQueryKey,
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
  useAcknowledgeAlert, getListAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertBadge } from "@/components/AlertBadge";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { parseMetar, FlightCategory, CATEGORY_COLOR } from "@/lib/metarParser";
import { formatDistanceToNow } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";
const ALL_TYPES: AlertType[] = ["SPECI", "TAF_AMD", "TAF_COR"];
const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
type RouteFilter = "ALL" | "DOM" | "INT";

interface WeatherItem { icao: string; rawMetar: string | null; rawTaf: string | null }

function useAllWeather() {
  return useQuery<WeatherItem[]>({
    queryKey: ["airports", "weather"],
    queryFn: () => fetch("/api/airports/weather").then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { isWatching, hasFilter, watchedIcaos } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();

  const [activeTypes, setActiveTypes] = useState<Set<AlertType>>(new Set(ALL_TYPES));
  const [activeCats, setActiveCats] = useState<Set<FlightCategory>>(new Set(ALL_CATS));
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("ALL");

  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { queryKey: getGetAlertsSummaryQueryKey(), refetchInterval: 30_000 },
  });
  const { data: allRecent, isLoading: recentLoading } = useGetRecentAlerts({
    query: { queryKey: getGetRecentAlertsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { data: weatherData, isLoading: weatherLoading } = useAllWeather();
  const { mutate: acknowledge, isPending } = useAcknowledgeAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      },
    },
  });

  const parsedWeather = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.map((w) => ({
      ...w,
      parsed: w.rawMetar ? parseMetar(w.rawMetar) : null,
    }));
  }, [weatherData]);

  const filteredWeather = useMemo(() => {
    let list = parsedWeather;
    if (hasFilter) list = list.filter((w) => isWatching(w.icao));
    if (routeFilter === "DOM") list = list.filter((w) => w.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((w) => !w.icao.startsWith("LT"));
    list = list.filter((w) => {
      const cat = w.parsed?.flightCategory ?? FlightCategory.VFR;
      return activeCats.has(cat);
    });
    return list;
  }, [parsedWeather, hasFilter, isWatching, routeFilter, activeCats]);

  const recent = useMemo(() => {
    let list = allRecent ?? [];
    if (hasFilter) list = list.filter((a) => isWatching(a.icao));
    return list.filter((a) => activeTypes.has(a.type as AlertType));
  }, [allRecent, hasFilter, isWatching, activeTypes]);

  const toggleType = (t: AlertType) => setActiveTypes((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toggleCat = (c: FlightCategory) => setActiveCats((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const TYPE_ACTIVE_CLASS: Record<AlertType, string> = {
    SPECI: "border-red-500/60 text-red-400 bg-red-500/10",
    TAF_AMD: "border-yellow-500/60 text-yellow-400 bg-yellow-500/10",
    TAF_COR: "border-orange-500/60 text-orange-400 bg-orange-500/10",
  };

  const CAT_LABEL: Record<FlightCategory, string> = {
    [FlightCategory.VFR]: "VFR",
    [FlightCategory.MVFR]: "MVFR",
    [FlightCategory.IFR]: "IFR",
    [FlightCategory.LIFR]: "LIFR",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader monitorStatus={monitor} theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="TOTAL ALERTS" value={summaryLoading ? "—" : String(summary?.totalAlerts ?? 0)} />
          <StatCard label="UNACKNOWLEDGED" value={summaryLoading ? "—" : String(summary?.unacknowledged ?? 0)} highlight={!summaryLoading && (summary?.unacknowledged ?? 0) > 0} />
          <StatCard label="TAF REVISIONS" value={summaryLoading ? "—" : String(summary?.tafRevisions ?? 0)} color="amber" />
          <StatCard label="SPECI ALERTS" value={summaryLoading ? "—" : String(summary?.speciAlerts ?? 0)} color="red" />
          <StatCard label="AIRPORTS HIT" value={summaryLoading ? "—" : String(summary?.airportsAffected ?? 0)} />
        </div>

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-5 text-xs font-mono">
            <span className="text-muted-foreground">MONITOR</span>
            <span className={monitor?.running ? "text-green-400" : "text-red-400"}>{monitor?.running ? "ACTIVE" : "STOPPED"}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">SCANS</span>
            <span className="text-foreground">{monitor?.scanCount ?? 0}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">AIRPORTS</span>
            <span className="text-foreground">{monitor?.monitoredAirports ?? 0}</span>
            {hasFilter && (
              <><span className="text-muted-foreground">|</span>
              <span className="text-sky-400">WATCHING {watchedIcaos.length}</span></>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono">INTERVAL: 60s</span>
        </div>

        {/* ── AIRPORT WEATHER GRID ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Airport Weather</h2>
              <div className="flex items-center gap-1">
                {ALL_CATS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                    style={activeCats.has(cat) ? {
                      borderColor: CATEGORY_COLOR[cat] + "99",
                      color: CATEGORY_COLOR[cat],
                      backgroundColor: CATEGORY_COLOR[cat] + "18",
                    } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                  >
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
              {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setRouteFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {weatherLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
              {[...Array(28)].map((_, i) => <div key={i} className="h-20 rounded bg-card animate-pulse border border-border" />)}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground font-mono mb-2">
                {filteredWeather.length} airports
                {routeFilter !== "ALL" && <span className="ml-1 text-primary">· {routeFilter}</span>}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                {filteredWeather.map((w) => (
                  <AirportWeatherCard key={w.icao} icao={w.icao} rawMetar={w.rawMetar} parsed={w.parsed} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── RECENT ALERTS ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent Alerts</h2>
              <div className="flex items-center gap-1">
                {ALL_TYPES.map((t) => (
                  <button key={t} onClick={() => toggleType(t)}
                    className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                      activeTypes.has(t) ? TYPE_ACTIVE_CLASS[t] : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {t === "SPECI" ? "SPECI" : t === "TAF_AMD" ? "TAF AMD" : "TAF COR"}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/alerts" className="text-xs text-primary hover:underline font-mono">VIEW ALL</Link>
          </div>

          {recentLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-card animate-pulse border border-border" />)}</div>
          ) : !recent.length ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-muted-foreground font-mono text-sm">NO ALERTS MATCH CURRENT FILTERS</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onAck={() => acknowledge({ id: alert.id })} ackPending={isPending} />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function AirportWeatherCard({ icao, rawMetar, parsed }: {
  icao: string;
  rawMetar: string | null;
  parsed: ReturnType<typeof parseMetar> | null;
}) {
  const cat = parsed?.flightCategory ?? FlightCategory.VFR;
  const color = CATEGORY_COLOR[cat];
  const isDom = icao.startsWith("LT");

  const visStr = () => {
    if (!parsed || !rawMetar) return null;
    if (parsed.cavok) return { text: "CAVOK", color: "#22c55e" };
    if (parsed.visibility != null) {
      const v = parsed.visibility;
      const c = v >= 8001 ? "#22c55e" : v >= 5000 ? "#3b82f6" : v >= 1500 ? "#ef4444" : "#a855f7";
      return { text: `${v >= 9999 ? "9999+" : v}m`, color: c };
    }
    return null;
  };

  const ceilStr = () => {
    if (!parsed?.ceiling) return null;
    const ft = parsed.ceiling.feet;
    const c = ft > 3000 ? "#22c55e" : ft >= 1000 ? "#3b82f6" : ft >= 500 ? "#ef4444" : "#a855f7";
    return { text: `${parsed.ceiling.type}${String(ft / 100).padStart(3, "0")}`, color: c };
  };

  const vis = visStr();
  const ceil = ceilStr();

  return (
    <Link
      href={`/airports/${icao}`}
      className="block bg-card rounded border-l-[3px] border-t border-r border-b border-border hover:opacity-80 transition-opacity px-2 py-2 cursor-pointer"
      style={{ borderLeftColor: rawMetar ? color : undefined }}
    >
      <div className="flex items-start justify-between mb-1 gap-1">
        <span className="font-mono font-bold text-xs leading-tight">{icao}</span>
        <div className="flex items-center gap-1">
          {isDom && <span className="text-[9px] font-mono text-muted-foreground">DOM</span>}
          {rawMetar && (
            <span className="text-[9px] font-mono font-bold" style={{ color }}>{parsed?.flightCategory ?? "—"}</span>
          )}
        </div>
      </div>
      {rawMetar ? (
        <div className="space-y-0.5">
          {vis && <div className="text-[10px] font-mono"><span className="text-muted-foreground">V </span><span style={{ color: vis.color }}>{vis.text}</span></div>}
          {ceil && <div className="text-[10px] font-mono"><span className="text-muted-foreground">C </span><span style={{ color: ceil.color }}>{ceil.text}</span></div>}
          {parsed?.wind && (
            <div className="text-[10px] font-mono"><span className="text-muted-foreground">W </span><span style={{ color: parsed.wind.dangerColor }}>{parsed.wind.raw}</span></div>
          )}
          {!vis && !ceil && !parsed?.wind && (
            <div className="text-[10px] text-muted-foreground font-mono">CLR</div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground font-mono mt-1">awaiting...</div>
      )}
    </Link>
  );
}

function StatCard({ label, value, highlight, color }: {
  label: string; value: string; highlight?: boolean; color?: "amber" | "red";
}) {
  const vc = color === "amber" ? "text-yellow-400" : color === "red" ? "text-red-400" : highlight ? "text-yellow-300" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono ${vc}`}>{value}</p>
    </div>
  );
}

function AlertRow({ alert, onAck, ackPending }: {
  alert: { id: number; type: string; icao: string; rawText: string; detectedAt: string; acknowledged: boolean };
  onAck: () => void;
  ackPending: boolean;
}) {
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-start gap-4 transition-opacity ${alert.acknowledged ? "opacity-40" : ""} ${
      alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
    }`}>
      <div className="flex-shrink-0 pt-0.5"><AlertBadge type={alert.type as "TAF_AMD" | "TAF_COR" | "SPECI"} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-sm hover:underline">{alert.icao}</Link>
          <span className="text-xs text-muted-foreground font-mono">{formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })}</span>
          {alert.acknowledged && <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">ACK</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground truncate">{alert.rawText}</p>
      </div>
      {!alert.acknowledged && (
        <button onClick={onAck} disabled={ackPending}
          className="flex-shrink-0 text-xs font-mono px-3 py-1.5 border border-border rounded hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          ACK
        </button>
      )}
    </div>
  );
}
