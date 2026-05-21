import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetAlertsSummary, getGetAlertsSummaryQueryKey,
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { ColoredRawText } from "@/components/ColoredRawText";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { parseMetar, FlightCategory, CATEGORY_COLOR } from "@/lib/metarParser";

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

function useWatchlistWeather() {
  return useQuery<WeatherItem[]>({
    queryKey: ["watchlist", "weather"],
    queryFn: () => fetch("/api/watchlist/weather").then((r) => r.json()),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
}

export default function Dashboard() {
  const { theme, toggleTheme } = useThemeContext();
  const { watchedIcaos } = useWatchlist();
  const [showMetar, setShowMetar] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useGetAlertsSummary({
    query: { queryKey: getGetAlertsSummaryQueryKey(), refetchInterval: 30_000 },
  });
  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { data: weatherData, isLoading: weatherLoading } = useWatchlistWeather();

  const airports = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.map((w) => ({
      ...w,
      parsed: w.rawMetar ? parseMetar(w.rawMetar) : null,
    }));
  }, [weatherData]);

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
          <StatCard label="AIRPORTS HIT" value={summaryLoading ? "—" : String(summary?.airportsAffected ?? 0)} />
        </div>

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-5 text-xs font-mono flex-wrap">
            <span className="text-muted-foreground">MONITOR</span>
            <span className={monitor?.running ? "text-green-400" : "text-red-400"}>{monitor?.running ? "ACTIVE" : "STOPPED"}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">SCANS</span>
            <span className="text-foreground">{monitor?.scanCount ?? 0}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">AIRPORTS</span>
            <span className="text-foreground">{monitor?.monitoredAirports ?? 0}</span>
            {watchedIcaos.length > 0 && (
              <><span className="text-muted-foreground">|</span>
              <span className="text-sky-400">WATCHLIST {watchedIcaos.length}</span></>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono hidden sm:block">INTERVAL: 60s</span>
        </div>

        {/* Airport Weather Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Airport Weather
              </h2>
              {!weatherLoading && (
                <span className="text-xs text-muted-foreground font-mono">
                  {airports.length} {airports.length === 1 ? "airport" : "airports"}
                </span>
              )}
            </div>

            {/* METAR toggle switch */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <span className="text-xs font-mono text-muted-foreground">TAF + METAR</span>
              <button
                type="button"
                role="switch"
                aria-checked={showMetar}
                onClick={() => setShowMetar(!showMetar)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  showMetar ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    showMetar ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </label>
          </div>

          {weatherLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-40 rounded-lg bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : airports.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground font-mono text-sm">Hava verisi bekleniyor...</p>
              <p className="text-muted-foreground font-mono text-xs mt-2">İlk tarama tamamlandığında görünecek</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {airports.map((a) => (
                <WeatherCard
                  key={a.icao}
                  icao={a.icao}
                  rawTaf={a.rawTaf}
                  rawMetar={a.rawMetar}
                  parsed={a.parsed}
                  showMetar={showMetar}
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

function WeatherCard({
  icao, rawTaf, rawMetar, parsed, showMetar,
}: {
  icao: string;
  rawTaf: string | null;
  rawMetar: string | null;
  parsed: ReturnType<typeof parseMetar> | null;
  showMetar: boolean;
}) {
  const cat = parsed?.flightCategory ?? FlightCategory.VFR;
  const catColor = CATEGORY_COLOR[cat];
  const isDom = icao.startsWith("LT");

  return (
    <Link
      href={`/airports/${icao}`}
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer"
      style={{ borderLeftWidth: "3px", borderLeftColor: rawMetar ? catColor : undefined }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base tracking-wider">{icao}</span>
          <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">
            {isDom ? "DOM" : "INT"}
          </span>
        </div>
        {rawMetar ? (
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
            style={{ color: catColor, borderColor: `${catColor}60`, backgroundColor: `${catColor}18` }}
          >
            {cat}
          </span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">NO DATA</span>
        )}
      </div>

      {/* TAF section */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">TAF</p>
        {rawTaf ? (
          <div className="max-h-32 overflow-y-auto">
            <ColoredRawText raw={rawTaf} className="text-[11px] leading-relaxed" />
          </div>
        ) : (
          <p className="text-xs font-mono text-muted-foreground italic">Awaiting TAF data...</p>
        )}
      </div>

      {/* METAR section (conditional) */}
      {showMetar && (
        <div className="px-4 py-3 border-t border-border/60 bg-background/30">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">METAR</p>
          {rawMetar ? (
            <ColoredRawText raw={rawMetar} className="text-[11px] leading-relaxed" />
          ) : (
            <p className="text-xs font-mono text-muted-foreground italic">Awaiting METAR data...</p>
          )}
        </div>
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
