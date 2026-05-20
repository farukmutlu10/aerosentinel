import { Link } from "wouter";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useThemeContext } from "@/App";
import {
  useGetAirportTaf, getGetAirportTafQueryKey,
  useGetAirportMetar, getGetAirportMetarQueryKey,
  useListAlerts, getListAlertsQueryKey,
  useAcknowledgeAlert, getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertBadge } from "@/components/AlertBadge";
import { formatDistanceToNow, format } from "date-fns";

interface Props { icao: string }

export default function AirportDetail({ icao }: Props) {
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useThemeContext();

  const { data: taf, isLoading: tafLoading } = useGetAirportTaf(icao, {
    query: { enabled: !!icao, queryKey: getGetAirportTafQueryKey(icao), refetchInterval: 60_000 },
  });
  const { data: metar, isLoading: metarLoading } = useGetAirportMetar(icao, {
    query: { enabled: !!icao, queryKey: getGetAirportMetarQueryKey(icao), refetchInterval: 60_000 },
  });
  const { data: alerts, isLoading: alertsLoading } = useListAlerts(
    { icao, limit: 50 },
    { query: { queryKey: getListAlertsQueryKey({ icao, limit: 50 }), refetchInterval: 30_000 } }
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        <div>
          <Link href="/airports" className="text-xs text-muted-foreground hover:text-foreground font-mono transition-colors">
            &larr; AIRPORTS
          </Link>
          <h2 className="text-3xl font-bold font-mono text-primary mt-2">{icao}</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">Airport monitoring detail</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WeatherCard title="CURRENT TAF" isLoading={tafLoading} data={taf?.rawTaf} />
          <WeatherCard title="CURRENT METAR" isLoading={metarLoading} data={metar?.rawMetar} />
        </div>

        <section>
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            Alert History ({alerts?.length ?? 0})
          </h3>

          {alertsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : !alerts?.length ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <p className="text-muted-foreground font-mono text-sm">NO ALERTS DETECTED FOR {icao}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border rounded-lg px-4 py-3 transition-opacity ${alert.acknowledged ? "opacity-40" : ""} ${
                    alert.type === "SPECI" ? "alert-speci" :
                    alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <AlertBadge type={alert.type as "TAF_AMD" | "TAF_COR" | "SPECI"} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(alert.detectedAt), "dd MMM HH:mm")} UTC
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            ({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})
                          </span>
                          {alert.acknowledged && (
                            <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">ACK</span>
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
        </section>
      </main>

      <Footer />
    </div>
  );
}

function WeatherCard({ title, isLoading, data }: { title: string; isLoading: boolean; data?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">{title}</p>
      {isLoading ? (
        <div className="h-16 animate-pulse bg-muted rounded" />
      ) : data ? (
        <pre className="font-mono text-sm text-foreground whitespace-pre-wrap break-all leading-relaxed">{data}</pre>
      ) : (
        <p className="text-muted-foreground font-mono text-sm">No data yet — awaiting first scan</p>
      )}
    </div>
  );
}
