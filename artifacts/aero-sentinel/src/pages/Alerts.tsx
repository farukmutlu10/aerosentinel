import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListAlerts, getListAlertsQueryKey,
  useAcknowledgeAlert, getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey,
  useGetAlertsSummary,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { ClockCard } from "@/components/ClockDisplay";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useQueryClient } from "@tanstack/react-query";
import { AlertBadge } from "@/components/AlertBadge";
import { TafText } from "@/components/TafText";
import { formatDistanceToNow, format } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";
type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "newest" | "oldest" | "icao-az";

const TYPE_FILTERS: Array<{ label: string; value: AlertType | undefined }> = [
  { label: "ALL", value: undefined },
  { label: "TAF AMD", value: "TAF_AMD" },
  { label: "TAF COR", value: "TAF_COR" },
  { label: "SPECI", value: "SPECI" },
];
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "icao-az", label: "ICAO A–Z" },
];

const DEFAULT_TYPE = undefined;
const DEFAULT_ROUTE: RouteFilter = "ALL";
const DEFAULT_SORT: SortMode = "newest";
const DEFAULT_HIDE_ACK = false;

interface StatCardProps { label: string; value: string; highlight?: boolean; color?: "amber" | "red" | "sky" }

function StatCard({ label, value, highlight, color }: StatCardProps) {
  const textColor =
    color === "amber" ? "text-amber-400" :
    color === "red" ? "text-red-400" :
    color === "sky" ? "text-sky-400" :
    highlight ? "text-foreground" : "text-foreground";
  const borderColor =
    color === "amber" ? "border-amber-400/30" :
    color === "red" ? "border-red-400/30" :
    color === "sky" ? "border-sky-400/30" :
    highlight ? "border-primary/40" : "border-border";
  const bgColor =
    color === "amber" ? "bg-amber-400/5" :
    color === "red" ? "bg-red-400/5" :
    color === "sky" ? "bg-sky-400/5" :
    "bg-card";
  return (
    <div className={`rounded-lg border px-4 py-3 ${bgColor} ${borderColor}`}>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-mono font-bold tabular-nums ${textColor}`}>{value}</p>
    </div>
  );
}

export default function Alerts() {
  const [typeFilter, setTypeFilter] = usePersistedState<AlertType | undefined>("as-alerts-type", DEFAULT_TYPE);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-alerts-route", DEFAULT_ROUTE);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-alerts-sort", DEFAULT_SORT);
  const [hideAcknowledged, setHideAcknowledged] = usePersistedState<boolean>("as-alerts-hide-ack", DEFAULT_HIDE_ACK);
  const [ackingAll, setAckingAll] = useState(false);

  const isFiltered = typeFilter !== DEFAULT_TYPE || routeFilter !== DEFAULT_ROUTE || sortMode !== DEFAULT_SORT || hideAcknowledged !== DEFAULT_HIDE_ACK;
  const resetFilters = () => {
    setTypeFilter(DEFAULT_TYPE);
    setRouteFilter(DEFAULT_ROUTE);
    setSortMode(DEFAULT_SORT);
    setHideAcknowledged(DEFAULT_HIDE_ACK);
  };

  const queryClient = useQueryClient();
  const { isWatching } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();

  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { refetchInterval: 30_000 },
  });

  const { data: allAlerts, isLoading } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: 30_000 } }
  );

  const alerts = useMemo(() => {
    let list = allAlerts ?? [];
    if (typeFilter) list = list.filter((a) => a.type === typeFilter);
    if (hideAcknowledged) list = list.filter((a) => !a.acknowledged);
    list = list.filter((a) => isWatching(a.icao));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    const sorted = [...list];
    if (sortMode === "newest") sorted.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    else if (sortMode === "oldest") sorted.sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());
    else if (sortMode === "icao-az") sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    return sorted;
  }, [allAlerts, typeFilter, hideAcknowledged, isWatching, routeFilter, sortMode]);

  const { mutate: acknowledge, isPending } = useAcknowledgeAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
      },
    },
  });

  const handleAckAll = async () => {
    setAckingAll(true);
    try {
      await fetch("/api/alerts/acknowledge-all", { method: "PATCH" });
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
    } finally {
      setAckingAll(false);
    }
  };

  const unackedCount = alerts.filter((a) => !a.acknowledged).length;
  const dash = summaryLoading ? "—" : undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="TOTAL ALERTS" value={dash ?? String(summary?.totalAlerts ?? 0)} />
          <StatCard
            label="UNACKNOWLEDGED"
            value={dash ?? String(summary?.unacknowledged ?? 0)}
            highlight={!summaryLoading && (summary?.unacknowledged ?? 0) > 0}
          />
          <StatCard label="TAF REVISIONS" value={dash ?? String(summary?.tafRevisions ?? 0)} color="amber" />
          <StatCard label="SPECI ALERTS" value={dash ?? String(summary?.speciAlerts ?? 0)} color="red" />
          <ClockCard />
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Alert Log — Bugün UTC</h1>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {TYPE_FILTERS.map((f) => (
              <button key={String(f.value)} onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors ${typeFilter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f.label}
              </button>
            ))}
          </div>

          <span className="text-border text-xs">|</span>

          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
              <button key={f} onClick={() => setRouteFilter(f)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>

          <span className="text-border text-xs">|</span>

          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {SORT_OPTIONS.map((s) => (
              <button key={s.value} onClick={() => setSortMode(s.value)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>

          <button onClick={() => setHideAcknowledged(!hideAcknowledged)}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium border transition-colors ${hideAcknowledged ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {hideAcknowledged ? "Unacknowledged Only ✓" : "Hide Acknowledged"}
          </button>

          {isFiltered && (
            <button onClick={resetFilters} title="Reset all filters"
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-mono text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 transition-colors">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              Reset
            </button>
          )}

          {unackedCount > 0 && (
            <button onClick={handleAckAll} disabled={ackingAll}
              className="ml-auto px-3 py-1.5 text-xs font-mono font-bold border border-green-500/40 text-green-400 rounded hover:bg-green-500/10 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {ackingAll ? "Acknowledging..." : `ACK ALL (${unackedCount})`}
            </button>
          )}

          <span className={`text-xs text-muted-foreground font-mono ${unackedCount > 0 ? "" : "ml-auto"}`}>
            {alerts.length} / {allAlerts?.length ?? 0} alerts
          </span>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-24 rounded-lg bg-card animate-pulse border border-border" />)}</div>
        ) : !alerts.length ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <p className="text-muted-foreground font-mono text-sm">No alerts match current filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id}
                className={`border rounded-lg px-4 py-4 transition-opacity ${alert.acknowledged ? "opacity-65 dark:opacity-40" : ""} ${
                  alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
                }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 pt-0.5"><AlertBadge type={alert.type as AlertType} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-sm hover:underline">{alert.icao}</Link>
                        <span className="text-[10px] font-mono text-muted-foreground border border-border px-1 py-0.5 rounded">{alert.icao.startsWith("LT") ? "DOM" : "INT"}</span>
                        <span className="text-xs text-muted-foreground font-mono">{format(new Date(alert.detectedAt), "dd MMM HH:mm")} UTC</span>
                        <span className="text-xs text-muted-foreground font-mono">({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})</span>
                        {alert.acknowledged && <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">ACK</span>}
                      </div>
                      <TafText raw={alert.rawText} />
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <button onClick={() => acknowledge({ id: alert.id })} disabled={isPending}
                      className="flex-shrink-0 text-xs font-mono px-3 py-1.5 border border-border rounded hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
                      ACK
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
