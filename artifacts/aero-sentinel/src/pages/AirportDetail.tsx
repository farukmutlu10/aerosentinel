import { Link } from "wouter";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useThemeContext } from "@/App";
import { TafText } from "@/components/TafText";
import { ColoredRawText } from "@/components/ColoredRawText";
import {
  useGetAirportTaf, getGetAirportTafQueryKey,
  useGetAirportMetar, getGetAirportMetarQueryKey,
  useListAlerts, getListAlertsQueryKey,
  useAcknowledgeAlert, getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWatchlistWeather } from "@/pages/Dashboard";
import { useWatchlist } from "@/context/WatchlistContext";
import { AlertBadge } from "@/components/AlertBadge";
import { IataBadge } from "@/components/IataBadge";
import { parseMetar, CATEGORY_COLOR, FlightCategory } from "@/lib/metarParser";
import { formatDistanceToNow, format } from "date-fns";
import { useMemo } from "react";

interface Props { icao: string }

export default function AirportDetail({ icao }: Props) {
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useThemeContext();
  const { effectiveIcaos } = useWatchlist();

  // Dashboard'un cache'inden beslen (watchlist'teki havalimanlar için)
  // Watchlist dışı havalimanlar için ayrı API çağrısı
  const isInWatchlist = effectiveIcaos.some(i => i.toUpperCase() === icao.toUpperCase());
  const { data: watchlistWeather, isLoading: watchlistLoading } = useWatchlistWeather(effectiveIcaos);

  // Watchlist'teyse Dashboard cache'inden, değilse ayrı API'den
  const { data: tafFallback, isLoading: tafLoadingFallback } = useGetAirportTaf(icao, {
    query: { enabled: !!icao && !isInWatchlist, queryKey: getGetAirportTafQueryKey(icao), refetchInterval: 60_000 },
  });
  const { data: metarFallback, isLoading: metarLoadingFallback } = useGetAirportMetar(icao, {
    query: { enabled: !!icao && !isInWatchlist, queryKey: getGetAirportMetarQueryKey(icao), refetchInterval: 60_000 },
  });

  // Watchlist verisinden kendi havalimanını filtrele
  const watchlistItem = watchlistWeather?.find(w => w.icao.toUpperCase() === icao.toUpperCase());

  // TAF/METAR: watchlist'ten al (varsa), yoksa fallback API'den
  const taf = watchlistItem ? { rawTaf: watchlistItem.rawTaf } : tafFallback;
  const metar = watchlistItem ? { rawMetar: watchlistItem.rawMetar } : metarFallback;
  const tafLoading = isInWatchlist ? watchlistLoading : tafLoadingFallback;
  const metarLoading = isInWatchlist ? watchlistLoading : metarLoadingFallback;

  // Alert history: useAlertNotifications cache'inden filtrele (ek API isteği yok)
  const { data: allAlerts, isLoading: alertsLoading } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: Infinity } }
  );
  const alerts = allAlerts?.filter(a => a.icao.toUpperCase() === icao.toUpperCase()) ?? [];

  const { mutate: acknowledge, isPending } = useAcknowledgeAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() });
      },
    },
  });

  const parsedMetar = useMemo(() => (metar?.rawMetar ? parseMetar(metar.rawMetar) : null), [metar?.rawMetar]);
  const cat = parsedMetar?.flightCategory ?? FlightCategory.VFR;
  const catColor = CATEGORY_COLOR[cat];
  const isDom = icao.startsWith("LT");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 pt-8 pb-24 sm:pb-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/airports" className="text-xs text-muted-foreground hover:text-foreground font-mono transition-colors">
              &larr; AIRPORTS
            </Link>
            <div className="flex items-center gap-3 mt-2">
              <h2 className="text-3xl font-bold font-mono text-primary inline-flex items-center gap-2">
                {icao}
                <IataBadge icao={icao} size="sm" />
              </h2>
              {parsedMetar && (
                <span className="text-sm font-mono font-bold px-2.5 py-1 rounded border"
                  style={{ color: catColor, borderColor: `${catColor}60`, backgroundColor: `${catColor}18` }}>
                  {cat}
                </span>
              )}
              <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded">
                {isDom ? "DOM" : "INT"}
              </span>
            </div>
          </div>
          {parsedMetar && (
            <div className="hidden md:flex items-center gap-4 text-xs font-mono bg-card border border-border rounded-lg px-4 py-2">
              {parsedMetar.cavok ? (
                <span className="text-green-400 font-bold">CAVOK</span>
              ) : (
                <>
                  {parsedMetar.visibility != null && (
                    <div>
                      <span className="text-muted-foreground">VIS </span>
                      <span style={{ color: parsedMetar.visibility >= 8001 ? "#22c55e" : parsedMetar.visibility >= 5000 ? "#3b82f6" : parsedMetar.visibility >= 1500 ? "#ef4444" : "#a855f7" }}>
                        {parsedMetar.visibility >= 9999 ? "9999+" : parsedMetar.visibility}m
                      </span>
                    </div>
                  )}
                  {parsedMetar.ceiling && (
                    <div>
                      <span className="text-muted-foreground">CEIL </span>
                      <span style={{ color: parsedMetar.ceiling.feet > 3000 ? "#22c55e" : parsedMetar.ceiling.feet >= 1000 ? "#3b82f6" : parsedMetar.ceiling.feet >= 500 ? "#ef4444" : "#a855f7" }}>
                        {parsedMetar.ceiling.type}{String(parsedMetar.ceiling.feet / 100).padStart(3, "0")} ({parsedMetar.ceiling.feet}ft)
                      </span>
                    </div>
                  )}
                </>
              )}
              {parsedMetar.wind && (
                <div>
                  <span className="text-muted-foreground">WIND </span>
                  <span style={{ color: parsedMetar.wind.dangerColor }}>{parsedMetar.wind.raw}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TAF / METAR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">CURRENT TAF</p>
            {tafLoading ? (
              <div className="h-16 animate-pulse bg-muted rounded" />
            ) : taf?.rawTaf ? (
              <TafText raw={taf.rawTaf} />
            ) : (
              <p className="text-muted-foreground font-mono text-sm">No data yet — awaiting first scan</p>
            )}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">CURRENT METAR</p>
            {metarLoading ? (
              <div className="h-16 animate-pulse bg-muted rounded" />
            ) : metar?.rawMetar ? (
              <ColoredRawText raw={metar.rawMetar} />
            ) : (
              <p className="text-muted-foreground font-mono text-sm">No data yet — awaiting first scan</p>
            )}
          </div>
        </div>

        {/* Alert history */}
        <section>
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            Alert History ({alerts?.length ?? 0})
          </h3>
          {alertsLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-card animate-pulse border border-border" />)}</div>
          ) : !alerts?.length ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <p className="text-muted-foreground font-mono text-sm">No alerts detected for {icao}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id}
                  className={`border rounded-lg px-4 py-3 transition-opacity ${alert.acknowledged ? "opacity-40" : ""} ${
                    alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
                  }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <AlertBadge type={alert.type as "TAF_AMD" | "TAF_COR" | "SPECI"} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">{format(new Date(alert.detectedAt), "dd MMM HH:mm")} UTC</span>
                          <span className="text-xs text-muted-foreground font-mono">({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})</span>
                          {alert.acknowledged && <span className="text-xs bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded">ACK</span>}
                        </div>
                        <ColoredRawText raw={alert.rawText} />
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
        </section>
      </main>
      <Footer />
    </div>
  );
}
