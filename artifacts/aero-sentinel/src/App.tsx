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
import { useTheme } from "@/hooks/useTheme";
import { createContext, useContext } from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
});

interface ThemeCtx { theme: "dark" | "light"; toggleTheme: () => void }
const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });
export const useThemeContext = () => useContext(ThemeContext);

function AppInner() {
  const { permission, requestPermission, dismiss, showBanner } = useAlertNotifications();
  const { theme, toggleTheme } = useTheme();

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
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

      {/* Desktop notification banner */}
      {showBanner && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg px-4 py-3 shadow-xl flex items-start gap-3 max-w-xs">
          <div className="w-2 h-2 rounded-full bg-yellow-400 sentinel-pulse flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-foreground font-semibold tracking-wider">MASAÜSTÜ BİLDİRİMLERİ</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 leading-relaxed">
              Yeni alert'lerde pop-up almak ister misiniz?
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={requestPermission}
                className="text-xs font-mono font-bold px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                İZİN VER
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="text-xs font-mono px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {permission === "denied" && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg px-3 py-2 shadow flex items-center gap-2 text-xs font-mono text-muted-foreground max-w-xs">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          Bildirimler tarayıcıdan engellendi
          <button onClick={dismiss} className="ml-1 hover:text-foreground">✕</button>
        </div>
      )}

      <Toaster />
    </ThemeContext.Provider>
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
