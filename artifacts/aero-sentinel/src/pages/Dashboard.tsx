import { useMemo, useState } from "react";
import {
  useGetAlertsSummary, getGetAlertsSummaryQueryKey,
  useGetRecentAlerts, getGetRecentAlertsQueryKey,
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
  useAcknowledgeAlert, getListAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertBadge } from "@/components/AlertBadge";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { formatDistanceToNow } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";
const ALL_TYPES: AlertType[] = ["SPECI", "TAF_AMD", "TAF_COR"];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { isWatching, hasFilter, watchedIcaos } = useWatchlist();
  const [activeTypes, setActiveTypes] = useState<Set<AlertType>>(new Set(ALL_TYPES));

  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { queryKey: getGetAlertsSummaryQueryKey(), refetchInterval: 30_000 },
  });
  const { data: allRecent, isLoading: recentLoading } = useGetRecentAlerts({
    query: { queryKey: getGetRecentAlertsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { mutate: acknowledge, isPending } = useAcknowledgeAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      },
    },
  });

  const recent = useMemo(() => {
    let list = allRecent ?? [];
    if (hasFilter) list = list.filter((a) => isWatching(a.icao));
    list = list.filter((a) => activeTypes.has(a.type as AlertType));
    return list;
  }, [allRecent, hasFilter, isWatching, activeTypes]);

  const toggleType = (t: AlertType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { next.delete(t); } else { next.add(t); }
      return next;
    });
  };

  const TYPE_LABELS: Record<AlertType, string> = {
    SPECI: "SPECI",
    TAF_AMD: "TAF AMD",
    TAF_COR: "TAF COR",
  };
  const TYPE_ACTIVE_CLASS: Record<AlertType, string> = {
    SPECI: "border-red-500/60 text-red-400 bg-red-500/10",
    TAF_AMD: "border-yellow-500/60 text-yellow-400 bg-yellow-500/10",
    TAF_COR: "border-orange-500/60 text-orange-400 bg-orange-500/10",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader monitorStatus={monitor} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="TOTAL ALERTS" value={summaryLoading ? "—" : String(summary?.totalAlerts ?? 0)} />
          <StatCard label="UNACKNOWLEDGED" value={summaryLoading ? "—" : String(summary?.unacknowledged ?? 0)} highlight={!summaryLoading && (summary?.unacknowledged ?? 0) > 0} />
          <StatCard label="TAF REVISIONS" value={summaryLoading ? "—" : String(summary?.tafRevisions ?? 0)} color="amber" />
          <StatCard label="SPECI ALERTS" value={summaryLoading ? "—" : String(summary?.speciAlerts ?? 0)} color="red" />
          <StatCard label="AIRPORTS HIT" value={summaryLoading ? "—" : String(summary?.airportsAffected ?? 0)} />
        </div>

        {/* Monitor status bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm font-mono">
            <span className="text-muted-foreground">MONITOR</span>
            <span className={monitor?.running ? "text-green-400" : "text-red-400"}>
              {monitor?.running ? "ACTIVE" : "STOPPED"}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">SCANS</span>
            <span className="text-foreground">{monitor?.scanCount ?? 0}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">AIRPORTS</span>
            <span className="text-foreground">{monitor?.monitoredAirports ?? 0}</span>
            {hasFilter && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="text-sky-400 font-mono text-xs">
                  WATCHING {watchedIcaos.length} AIRPORTS
                </span>
              </>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono">INTERVAL: 60s</span>
        </div>

        {/* Recent Alerts Feed */}
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent Alerts</h2>
              {/* Type filter toggles */}
              <div className="flex items-center gap-1">
                {ALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                      activeTypes.has(t)
                        ? TYPE_ACTIVE_CLASS[t]
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/alerts" className="text-xs text-primary hover:underline font-mono">VIEW ALL</Link>
          </div>

          {recentLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : !recent.length ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <p className="text-muted-foreground font-mono text-sm">NO ALERTS MATCH CURRENT FILTERS</p>
              <p className="text-muted-foreground text-xs mt-1">
                {hasFilter
                  ? `Watching ${watchedIcaos.join(", ")}`
                  : `Scanning ${monitor?.monitoredAirports ?? 95} airports`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onAck={() => acknowledge({ id: alert.id })}
                  ackPending={isPending}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function StatCard({ label, value, highlight, color }: {
  label: string; value: string; highlight?: boolean; color?: "amber" | "red";
}) {
  const valueColor =
    color === "amber" ? "text-yellow-400" :
    color === "red" ? "text-red-400" :
    highlight ? "text-yellow-300" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
    </div>
  );
}

function AlertRow({ alert, onAck, ackPending }: {
  alert: { id: number; type: string; icao: string; rawText: string; detectedAt: string; acknowledged: boolean };
  onAck: () => void;
  ackPending: boolean;
}) {
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-start gap-4 transition-opacity ${
      alert.acknowledged ? "opacity-40" : ""
    } ${
      alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
    }`}>
      <div className="flex-shrink-0 pt-0.5">
        <AlertBadge type={alert.type as "TAF_AMD" | "TAF_COR" | "SPECI"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-sm hover:underline">
            {alert.icao}
          </Link>
          <span className="text-xs text-muted-foreground font-mono">
            {formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })}
          </span>
          {alert.acknowledged && (
            <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">ACK</span>
          )}
        </div>
        <p className="font-mono text-xs text-muted-foreground truncate">{alert.rawText}</p>
      </div>
      {!alert.acknowledged && (
        <button
          onClick={onAck}
          disabled={ackPending}
          className="flex-shrink-0 text-xs font-mono px-3 py-1.5 border border-border rounded hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          ACK
        </button>
      )}
    </div>
  );
}
