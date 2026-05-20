import { Link } from "wouter";
import { useListAirports, getListAirportsQueryKey } from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { formatDistanceToNow } from "date-fns";

export default function Airports() {
  const { data: airports, isLoading } = useListAirports({
    query: { queryKey: getListAirportsQueryKey(), refetchInterval: 30_000 },
  });

  const criticalCount = airports?.filter((a) => a.status === "critical").length ?? 0;
  const warningCount = airports?.filter((a) => a.status === "warning").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status summary */}
        <div className="flex items-center gap-6 mb-6 text-sm font-mono">
          <span className="text-muted-foreground">{airports?.length ?? 0} AIRPORTS MONITORED</span>
          {criticalCount > 0 && <span className="text-red-400">{criticalCount} CRITICAL</span>}
          {warningCount > 0 && <span className="text-yellow-400">{warningCount} WARNING</span>}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {[...Array(48)].map((_, i) => (
              <div key={i} className="h-16 rounded bg-card animate-pulse border border-border" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {airports?.map((airport) => (
              <Link
                key={airport.icao}
                href={`/airports/${airport.icao}`}
                className={`block border rounded p-2.5 transition-all hover:scale-105 cursor-pointer ${
                  airport.status === "critical"
                    ? "border-red-500/40 bg-red-500/10 hover:border-red-500/60"
                    : airport.status === "warning"
                    ? "border-yellow-500/40 bg-yellow-500/10 hover:border-yellow-500/60"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-xs font-bold ${
                    airport.status === "critical" ? "text-red-400" :
                    airport.status === "warning" ? "text-yellow-400" :
                    "text-foreground"
                  }`}>
                    {airport.icao}
                  </span>
                  {airport.alertCount > 0 && (
                    <span className={`text-xs font-mono font-bold ${
                      airport.status === "critical" ? "text-red-400" : "text-yellow-400"
                    }`}>
                      {airport.alertCount}
                    </span>
                  )}
                </div>
                {airport.lastAlert ? (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {formatDistanceToNow(new Date(airport.lastAlert), { addSuffix: true }).replace("about ", "")}
                  </p>
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    airport.status === "normal" ? "bg-green-500/60" : ""
                  }`} />
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
