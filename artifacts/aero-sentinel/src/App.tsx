import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Alerts from "@/pages/Alerts";
import Airports from "@/pages/Airports";
import AirportDetail from "@/pages/AirportDetail";
import { WatchlistProvider } from "@/context/WatchlistContext";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1 },
  },
});

function AppInner() {
  const { permission, requestPermission } = useAlertNotifications();

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/airports" component={Airports} />
          <Route path="/airports/:icao">
            {(params) => <AirportDetail icao={params.icao} />}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>

      {/* Desktop notification permission banner */}
      {permission === "default" && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg px-4 py-3 shadow-xl flex items-center gap-3 max-w-xs">
          <div className="w-2 h-2 rounded-full bg-yellow-400 sentinel-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-foreground font-semibold tracking-wider">MASAÜSTÜ BİLDİRİMLERİ</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 leading-relaxed">
              Yeni alert'lerde pop-up almak ister misiniz?
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestPermission();
            }}
            className="flex-shrink-0 text-xs font-mono font-bold px-3 py-2 rounded border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
          >
            İZİN VER
          </button>
        </div>
      )}
      {permission === "granted" && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-green-500/30 rounded-lg px-4 py-2 shadow flex items-center gap-2 text-xs font-mono text-green-400 pointer-events-none select-none"
          style={{ animation: "fadeOut 3s ease forwards 2s" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          BİLDİRİMLER AKTİF
        </div>
      )}

      <Toaster />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WatchlistProvider>
          <AppInner />
        </WatchlistProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
