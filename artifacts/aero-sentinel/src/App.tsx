import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Alerts from "@/pages/Alerts";
import Airports from "@/pages/Airports";
import AirportDetail from "@/pages/AirportDetail";
import { WatchlistProvider } from "@/context/WatchlistContext";
import { TimezoneProvider } from "@/components/ClockDisplay";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { AlertToastContainer } from "@/components/AlertToast";
import { ThemeTransition } from "@/components/ThemeTransition";
import { useTheme } from "@/hooks/useTheme";
import { createContext, useContext, useEffect, useState } from "react";
import { initGA, trackPageView } from "@/lib/ga";
import { usePersistedState } from "@/hooks/usePersistedState";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
});

// ── Theme context ─────────────────────────────────────────────────────────────
interface ThemeCtx {
  theme: "dark" | "light";
  toggleTheme: () => void;
  transitioning: boolean;
  pendingTheme: "dark" | "light" | null;
  completeTransition: () => void;
}
const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  toggleTheme: () => {},
  transitioning: false,
  pendingTheme: null,
  completeTransition: () => {},
});
export const useThemeContext = () => useContext(ThemeContext);

// ── LocalAck context — shared per-user ACK state across all components ────────
interface LocalAckCtx {
  localAcked: number[];
  setLocalAcked: (val: number[] | ((prev: number[]) => number[])) => void;
}
const LocalAckContext = createContext<LocalAckCtx>({ localAcked: [], setLocalAcked: () => {} });
export const useLocalAck = () => useContext(LocalAckContext);

// ── Test panel context — always-mounted, toggled via secret input ───────────
interface TestPanelCtx {
  testPanelVisible: boolean;
  setTestPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
}
const TestPanelContext = createContext<TestPanelCtx>({
  testPanelVisible: false,
  setTestPanelVisible: () => {},
});
export const useTestPanel = () => useContext(TestPanelContext);

function AppInner() {
  const { permission, requestPermission, dismiss, showBanner, dismissed, forceCheck, pendingToasts, dismissToast } = useAlertNotifications();
  const { theme, toggleTheme, transitioning, pendingTheme, completeTransition } = useTheme();
  const [localAcked, setLocalAcked] = usePersistedState<number[]>("as-acked-ids-v2", []);
  const [location] = useLocation();
  const [testPanelVisible, setTestPanelVisible] = useState(false);

  // ─── Cross-window sync for localAcked ──────────────────────────────────────
  // Kiosk modu (window.open) ile ana site arasındaki senkronizasyon için
  // Başka bir pencerede localAcked değiştiğinde bu pencereyi de güncelle.
  useEffect(() => {
    const KEY = "as-acked-ids-v2";
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        const newVal: number[] = e.newValue !== null ? JSON.parse(e.newValue) : [];
        setLocalAcked((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(newVal)) return prev;
          return newVal;
        });
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [setLocalAcked]);

  // Secret test-toggle listener — lives here (always mounted) so it works from any page
  useEffect(() => {
    const handler = () => setTestPanelVisible((prev) => !prev);
    window.addEventListener("test-toggle", handler);
    return () => window.removeEventListener("test-toggle", handler);
  }, []);

  // Sayfa görüntüleme takibi
  useEffect(() => {
    trackPageView(location);
  }, [location]);

  return (
    <TestPanelContext.Provider value={{ testPanelVisible, setTestPanelVisible }}>
    <ThemeContext.Provider value={{ theme, toggleTheme, transitioning, pendingTheme, completeTransition }}>
      <LocalAckContext.Provider value={{ localAcked, setLocalAcked }}>
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

        {showBanner && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 z-50 max-w-xs">
            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl px-4 py-3 shadow-2xl"
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(56,189,248,0.12)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono font-bold text-white tracking-wider">ENABLE NOTIFICATIONS</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1 leading-relaxed">
                    Get pop-up alerts when new weather events are detected at your watched airports.
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button type="button" onClick={requestPermission}
                      className="text-[10px] font-mono font-bold px-4 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                      Allow
                    </button>
                    <button type="button" onClick={dismiss}
                      className="text-[10px] font-mono px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      Not Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {permission === "denied" && !dismissed && (
          <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg px-3 py-2 shadow flex items-center gap-2 text-xs font-mono text-muted-foreground max-w-xs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Notifications blocked by browser
            <button onClick={dismiss} className="ml-1 hover:text-foreground text-lg leading-none">×</button>
          </div>
        )}

        <AlertToastContainer
          items={pendingToasts}
          onDismiss={dismissToast}
          onAck={(id) => setLocalAcked(prev => prev.includes(id) ? prev : [...prev, id])}
          onViewChanges={(id, type, icao) => {
            if (window.location.pathname.startsWith("/alerts")) {
              // Alerts sayfasındaysak direkt event dispatch et
              window.dispatchEvent(new CustomEvent("open-diff-modal", { detail: { alertId: id, alertType: type, icao } }));
            } else {
              // Alerts sayfasında değilsek sessionStorage'a kaydet ve navigate et
              sessionStorage.setItem("pending-diff-modal", JSON.stringify({ alertId: id, alertType: type, icao }));
              window.location.href = "/alerts";
            }
          }}
        />
        {transitioning && pendingTheme && (
          <ThemeTransition targetTheme={pendingTheme} onComplete={completeTransition} />
        )}
        <Toaster />
      </LocalAckContext.Provider>
    </ThemeContext.Provider>
    </TestPanelContext.Provider>
  );
}

function App() {
  // Google Analytics'i başlat
  useEffect(() => {
    initGA();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TimezoneProvider>
          <WatchlistProvider>
            <AppInner />
          </WatchlistProvider>
        </TimezoneProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
