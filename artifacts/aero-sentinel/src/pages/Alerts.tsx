import { useState } from "react";
import { Link } from "wouter";
import { useListAlerts, getListAlertsQueryKey, useAcknowledgeAlert, getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey } from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { useQueryClient } from "@tanstack/react-query";
import { AlertBadge } from "@/components/AlertBadge";
import { formatDistanceToNow, format } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";

export default function Alerts() {
  const [typeFilter, setTypeFilter] = useState<AlertType | undefined>(undefined);
  const [hideAcknowledged, setHideAcknowledged] = useState(false);
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useListAlerts(
    { type: typeFilter, acknowledged: hideAcknowledged ? false : undefined, limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ type: typeFilter, acknowledged: hideAcknowledged ? false : undefined, limit: 100 }), refetchInterval: 30_000 } }
  );

  const { mutate: acknowledge, isPending } = useAcknowledgeAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
      },
    },
  });

  const filters: Array<{ label: string; value: AlertType | undefined }> = [
    { label: "ALL", value: undefined },
    { label: "TAF AMD", value: "TAF_AMD" },
    { label: "TAF COR", value: "TAF_COR" },
    { label: "SPECI", value: "SPECI" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Filter bar */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            {filters.map((f) => (
              <button
                key={String(f.value)}
                onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors ${
                  typeFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setHideAcknowledged(!hideAcknowledged)}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium border transition-colors ${
              hideAcknowledged
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {hideAcknowledged ? "SHOWING UNACKNOWLEDGED ONLY" : "HIDE ACKNOWLEDGED"}
          </button>

          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {alerts?.length ?? 0} ALERTS
          </span>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-card animate-pulse border border-border" />
            ))}
          </div>
        ) : !alerts?.length ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <p className="text-muted-foreground font-mono text-sm">NO ALERTS MATCH CURRENT FILTERS</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`border rounded-lg px-4 py-4 transition-opacity ${alert.acknowledged ? "opacity-40" : ""} ${
                  alert.type === "SPECI" ? "alert-speci" :
                  alert.type === "TAF_AMD" ? "alert-taf-amd" :
                  "alert-taf-cor"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 pt-0.5">
                      <AlertBadge type={alert.type as AlertType} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-sm hover:underline">
                          {alert.icao}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(new Date(alert.detectedAt), "dd MMM HH:mm")} UTC
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          ({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})
                        </span>
                        {alert.acknowledged && (
                          <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">
                            ACKNOWLEDGED
                          </span>
                        )}
                      </div>
                      <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
                        {alert.rawText}
                      </pre>
                    </div>
                  </div>

                  {!alert.acknowledged && (
                    <button
                      onClick={() => acknowledge({ id: alert.id })}
                      disabled={isPending}
                      className="flex-shrink-0 text-xs font-mono px-3 py-1.5 border border-border rounded hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      ACK
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
