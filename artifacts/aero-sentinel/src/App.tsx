import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Alerts from "@/pages/Alerts";
import Airports from "@/pages/Airports";
import AirportDetail from "@/pages/AirportDetail";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
    },
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

      {permission === "default" && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 max-w-sm">
          <div className="w-2 h-2 rounded-full bg-yellow-400 sentinel-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-foreground font-medium">DESKTOP BILDIRIMLERI</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Yeni alert'lerde pop-up almak ister misiniz?</p>
          </div>
          <button
            onClick={requestPermission}
            className="flex-shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            IZIN VER
          </button>
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
        <AppInner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
