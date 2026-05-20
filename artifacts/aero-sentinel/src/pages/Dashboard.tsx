import { useGetAlertsSummary, getGetAlertsSummaryQueryKey, useGetRecentAlerts, getGetRecentAlertsQueryKey, useGetMonitorStatus, getGetMonitorStatusQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertBadge } from "@/components/AlertBadge";
import { NavHeader } from "@/components/NavHeader";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { queryKey: getGetAlertsSummaryQueryKey(), refetchInterval: 30_000 },
  });
  const { data: recent, isLoading: recentLoading } = useGetRecentAlerts({
    query: { queryKey: getGetRecentAlertsQueryKey(), refetchInterval: 30_000 },
  });
  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });

  return (
    <div className="min-h-screen bg-background">
      <NavHeader monitorStatus={monitor} />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
          </div>
          <span className="text-xs text-muted-foreground font-mono">INTERVAL: 60s</span>
        </div>

        {/* Recent Alerts Feed */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent Alerts</h2>
            <Link href="/alerts" className="text-xs text-primary hover:underline font-mono">VIEW ALL</Link>
          </div>

          {recentLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : !recent?.length ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <p className="text-muted-foreground font-mono text-sm">NO ALERTS DETECTED</p>
              <p className="text-muted-foreground text-xs mt-1">System is scanning {monitor?.monitoredAirports ?? 66} airports</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: "amber" | "red" }) {
  const valueColor =
    color === "amber" ? "text-yellow-400" :
    color === "red" ? "text-red-400" :
    highlight ? "text-yellow-300" :
    "text-foreground";

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
    </div>
  );
}

function AlertRow({ alert }: { alert: { id: number; type: string; icao: string; rawText: string; detectedAt: string; acknowledged: boolean } }) {
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-start gap-4 transition-opacity ${alert.acknowledged ? "opacity-50" : ""} ${
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
          {alert.acknowledged && <span className="text-xs text-muted-foreground font-mono">ACK</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground truncate">{alert.rawText}</p>
      </div>
    </div>
  );
}
