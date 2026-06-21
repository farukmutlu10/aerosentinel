import { useMemo, useState, Fragment } from "react";
import { Link } from "wouter";
import {
  useListAlerts, getListAlertsQueryKey,
  getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey,
} from "@workspace/api-client-react";
import { useLocalAck } from "@/App";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { ClockCard } from "@/components/ClockDisplay";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useQueryClient } from "@tanstack/react-query";
import { AlertBadge } from "@/components/AlertBadge";
import { IataBadge } from "@/components/IataBadge";
import { TafText } from "@/components/TafText";
import { AdSlot } from "@/components/ads/AdSlot";
import { formatDistanceToNow, format } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";
type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "newest" | "oldest" | "icao-az";

const ALL_ALERT_TYPES: AlertType[] = ["TAF_AMD", "TAF_COR", "SPECI"];

const TYPE_LABELS: Record<AlertType, string> = {
  TAF_AMD: "TAF AMD",
  TAF_COR: "TAF COR",
  SPECI: "SPECI",
};

const TYPE_COLORS: Record<AlertType, string> = {
  TAF_AMD: "#f59e0b",
  TAF_COR: "#38bdf8",
  SPECI:   "#ef4444",
};

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest",  label: "Newest" },
  { value: "oldest",  label: "Oldest" },
  { value: "icao-az", label: "ICAO A–Z" },
];

const DEFAULT_TYPES = ALL_ALERT_TYPES as string[];
const DEFAULT_ROUTE: RouteFilter = "ALL";
const DEFAULT_SORT: SortMode = "newest";
const DEFAULT_HIDE_ACK = false;

// ── Stat card — vertical centered on all screen sizes ──────────────────────────
function StatCard({
  label, value, accent, icon, pulse,
}: {
  label: string;
  value: string;
  accent: string;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div
      className={`relative rounded-lg sm:rounded-xl border overflow-hidden ${pulse ? "animate-pulse-slow" : ""}`}
      style={{ borderColor: `${accent}30`, backgroundColor: "hsl(var(--card))" }}
    >
      {/* Left accent glow */}
      <div className="absolute inset-y-0 left-0 w-[2px] sm:w-[3px] rounded-l-xl" style={{ backgroundColor: accent }} />
      {/* Vertical centered: icon, value, label stacked */}
      <div className="flex flex-col items-center justify-center px-1 sm:px-2 py-2 sm:py-2.5 text-center">
        <span style={{ color: accent, opacity: 0.85 }} className="mb-0.5 sm:mb-1">{icon}</span>
        <p className="text-xl sm:text-2xl font-mono font-black tabular-nums leading-none" style={{ color: accent }}>{value}</p>
        <p className="text-[8px] sm:text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const IconList = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IconTaf = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const IconSpeci = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export default function Alerts() {
  // v2 key for type filter — now an array of active types (all active by default)
  const [activeTypesArr, setActiveTypesArr] = usePersistedState<string[]>("as-alerts-types-v2", DEFAULT_TYPES);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-alerts-route", DEFAULT_ROUTE);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-alerts-sort", DEFAULT_SORT);
  const [hideAcknowledged, setHideAcknowledged] = usePersistedState<boolean>("as-alerts-hide-ack", DEFAULT_HIDE_ACK);
  // Per-user ACK: shared via LocalAckContext (persisted in localStorage)
  const { localAcked, setLocalAcked } = useLocalAck();
  const [ackingAll, setAckingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);

  const activeTypesSet = new Set<string>(activeTypesArr);
  const localAckedSet = useMemo(() => new Set(localAcked), [localAcked]);
  const isAcked = (a: { id: number; acknowledged: boolean }) => a.acknowledged || localAckedSet.has(a.id);

  const handleAck = (id: number) => {
    setLocalAcked((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const toggleType = (t: AlertType) =>
    setActiveTypesArr((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  const isFiltered =
    DEFAULT_TYPES.some((t) => !activeTypesArr.includes(t)) ||
    routeFilter !== DEFAULT_ROUTE || sortMode !== DEFAULT_SORT || hideAcknowledged !== DEFAULT_HIDE_ACK;

  const resetFilters = () => {
    setActiveTypesArr(DEFAULT_TYPES);
    setRouteFilter(DEFAULT_ROUTE);
    setSortMode(DEFAULT_SORT);
    setHideAcknowledged(DEFAULT_HIDE_ACK);
  };

  const queryClient = useQueryClient();
  const { isWatching } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();

  const { data: allAlerts, isLoading } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: 180_000 } }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    fetch("/api/alerts/summary?refresh=1").catch(() => {});
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() }),
    ]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const alerts = useMemo(() => {
    let list = allAlerts ?? [];
    list = list.filter((a) => activeTypesSet.has(a.type));
    if (hideAcknowledged) list = list.filter((a) => !isAcked(a));
    list = list.filter((a) => isWatching(a.icao));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    const sorted = [...list];
    if (sortMode === "newest") sorted.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    else if (sortMode === "oldest") sorted.sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());
    else sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    return sorted;
  }, [allAlerts, activeTypesArr, hideAcknowledged, isWatching, routeFilter, sortMode]);

  const handleAckAll = () => {
    setAckingAll(true);
    const ids = alerts.filter((a) => !isAcked(a)).map((a) => a.id);
    setLocalAcked((prev) => [...new Set([...prev, ...ids])]);
    setAckingAll(false);
  };

  const unackedCount = alerts.filter((a) => !isAcked(a)).length;
  const dash = isLoading ? "—" : undefined;
  const totalAlerts    = allAlerts?.length ?? 0;
  const tafRevisions   = allAlerts?.filter((a) => a.type === "TAF_AMD" || a.type === "TAF_COR").length ?? 0;
  const speciAlerts    = allAlerts?.filter((a) => a.type === "SPECI").length ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-0 py-1.5 sm:py-3 space-y-1.5 sm:space-y-3">

        {/* Stats — flex row, cards fill full width, gap between cards is 1px */}
        <div className="flex flex-wrap sm:flex-nowrap" style={{gap:"10px"}}>
          <div className="w-1/2 sm:flex-1"><StatCard label="Total" value={dash ?? String(totalAlerts)} accent="#64748b" icon={<IconList />} /></div>
          <div className="w-1/2 sm:flex-1"><StatCard label="Unacked" value={dash ?? String(allAlerts ? allAlerts.filter((a) => isWatching(a.icao) && !isAcked(a)).length : 0)} accent={unackedCount > 0 ? "#ef4444" : "#64748b"} icon={<IconAlert />} pulse={unackedCount > 0} /></div>
          <div className="w-1/2 sm:flex-1"><StatCard label="TAF Rev" value={dash ?? String(tafRevisions)} accent="#f59e0b" icon={<IconTaf />} /></div>
          <div className="w-1/2 sm:flex-1"><StatCard label="SPECI" value={dash ?? String(speciAlerts)} accent="#ef4444" icon={<IconSpeci />} /></div>
          <div className="w-1/2 sm:flex-1">
            <ClockCard />
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">

          {/* Type filters */}
          <div className="flex items-center gap-0">
            {ALL_ALERT_TYPES.map((t) => {
              const isActive = activeTypesSet.has(t);
              const color = TYPE_COLORS[t];
              return (
                <button key={t} onClick={() => toggleType(t)}
                  className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-mono font-medium border transition-colors"
                  style={isActive ? {
                    borderColor: color + "99",
                    color,
                    backgroundColor: color + "18",
                  } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>

          <span className="text-border text-xs hidden sm:inline">|</span>

          {/* DOM/INT */}
          <div className="flex items-center gap-0 bg-card border border-border rounded-lg p-0.5">
            {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
              <button key={f} onClick={() => setRouteFilter(f)}
                className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>

          <span className="text-border text-xs hidden sm:inline">|</span>

          {/* Sort */}
          <div className="flex items-center gap-0 bg-card border border-border rounded-lg p-0.5">
            {SORT_OPTIONS.map((s) => (
              <button key={s.value} onClick={() => setSortMode(s.value)}
                className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>

          <span className="text-border text-xs hidden sm:inline">|</span>

          {/* Hide acknowledged */}
          <button onClick={() => {
            if (!hideAcknowledged) {
              // When hiding, add all current alert IDs to localAcked so they disappear immediately
              const allIds = (allAlerts ?? []).map((a) => a.id);
              setLocalAcked((prev) => [...new Set([...prev, ...allIds])]);
            }
            setHideAcknowledged(!hideAcknowledged);
          }}
            className={`px-2 sm:px-3 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono font-medium border transition-colors ${hideAcknowledged ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {hideAcknowledged ? "Show All" : "Hide Ack"}
          </button>

          {isFiltered && (
            <button onClick={resetFilters} title="Reset all filters"
              className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 transition-colors">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              Reset
            </button>
          )}

          {unackedCount > 0 && (
            <button onClick={handleAckAll} disabled={ackingAll}
              className="ml-auto px-2 sm:px-3 py-0.5 sm:py-1.5 text-[10px] sm:text-xs font-mono font-bold border border-green-500/40 text-green-400 rounded hover:bg-green-500/10 transition-colors disabled:opacity-50 flex items-center gap-1">
              {ackingAll ? "..." : `ACK ALL (${unackedCount})`}
            </button>
          )}

          <span className={`text-[10px] sm:text-xs text-muted-foreground font-mono ${unackedCount > 0 ? "" : "ml-auto"}`}>
            {Math.min(displayLimit, alerts.length)} / {alerts.length}
          </span>
          {/* REFRESH - far right */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh alerts"
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-mono font-bold border transition-all disabled:opacity-50 ml-auto"
            style={{ borderColor: "#38BDF840", color: "#38BDF8", backgroundColor: "#38BDF810" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={isRefreshing ? "animate-spin" : ""}>
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            {isRefreshing ? "..." : "REFRESH"}
          </button>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-20 sm:h-24 rounded-lg bg-card animate-pulse border border-border" />)}
          </div>
        ) : !alerts.length ? (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-8 sm:p-16 text-center">
              <p className="text-muted-foreground font-mono text-xs sm:text-sm">No alerts match current filters</p>
            </div>
            <AdSlot
              slot="alerts-infeed"
              sponsor={{
                name: "AERO-SENTINEL",
                url: "#",
                description: "Premium aviation weather monitoring",
              }}
            />
          </div>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {alerts.slice(0, displayLimit).map((alert, idx) => (
              <Fragment key={alert.id}>
                {/* Sponsor — 2. alert sonrası */}
                {idx === 2 && (
                  <AdSlot
                    slot="alerts-infeed"
                    sponsor={{
                      name: "AERO-SENTINEL",
                      url: "#",
                      description: "Premium aviation weather monitoring",
                    }}
                  />
                )}
                {/* Sponsor — 5. alert sonrası */}
                {idx === 5 && (
                  <AdSlot
                    slot="alerts-infeed"
                    sponsor={{
                      name: "AERO-SENTINEL",
                      url: "#",
                      description: "Premium aviation weather monitoring",
                    }}
                  />
                )}
                <div
                  className={`border rounded-lg px-3 sm:px-4 py-2.5 sm:py-4 transition-opacity ${isAcked(alert) ? "opacity-65 dark:opacity-40" : ""} ${
                    alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
                  }`}>

                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 pt-0.5"><AlertBadge type={alert.type as AlertType} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2 flex-wrap">
                        <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-xs sm:text-sm hover:underline inline-flex items-center gap-1">
                          {alert.icao}
                          <IataBadge icao={alert.icao} />
                        </Link>
                        <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground border border-border px-1 py-0.5 rounded">{alert.icao.startsWith("LT") ? "DOM" : "INT"}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">{format(new Date(alert.detectedAt), "dd MMM HH:mm")} UTC</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-mono hidden sm:inline">({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})</span>
                        {isAcked(alert) && <span className="text-[10px] sm:text-xs bg-muted text-muted-foreground font-mono px-1.5 sm:px-2 py-0.5 rounded">ACK</span>}
                      </div>
                      <TafText raw={alert.rawText} />
                    </div>
                  </div>
                  {!isAcked(alert) && (
                    <button onClick={() => handleAck(alert.id)}
                      className="flex-shrink-0 self-center ml-2 sm:ml-4 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/8 text-emerald-400 text-[10px] sm:text-xs font-mono font-bold tracking-[0.15em] sm:tracking-[0.2em] hover:bg-emerald-500/18 hover:border-emerald-400/70 hover:text-emerald-300 transition-all">
                      ACK
                    </button>
                  )}
                </div>
              </div>
              </Fragment>
            ))}

            {displayLimit < alerts.length && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => setDisplayLimit((n) => n + 20)}
                  className="px-4 sm:px-6 py-2 rounded-lg border border-border text-[10px] sm:text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  Load more ({alerts.length - displayLimit} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
