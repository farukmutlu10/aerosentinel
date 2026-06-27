import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// ── Route-based code splitting (React.lazy) ──────────────────────────────────
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Airports = lazy(() => import("@/pages/Airports"));
const AirportDetail = lazy(() => import("@/pages/AirportDetail"));
const About = lazy(() => import("@/pages/About"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const Contact = lazy(() => import("@/pages/Contact"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Features = lazy(() => import("@/pages/Features"));
const FeatureDetail = lazy(() => import("@/pages/FeatureDetail"));
const FAQ = lazy(() => import("@/pages/FAQ"));
const UseCases = lazy(() => import("@/pages/UseCases"));
const UseCaseDetail = lazy(() => import("@/pages/UseCaseDetail"));
const NotFound = lazy(() => import("@/pages/not-found"));
import { WatchlistProvider } from "@/context/WatchlistContext";
import { TimezoneProvider } from "@/components/ClockDisplay";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { AlertToastContainer } from "@/components/AlertToast";
import { ThemeTransition } from "@/components/ThemeTransition";
import { useTheme } from "@/hooks/useTheme";
import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { initGA, trackPageView } from "@/lib/ga";
import { usePersistedState } from "@/hooks/usePersistedState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CookieConsent, getCookiePreferences } from "@/components/CookieConsent";
import { AdSenseConsent } from "@/components/AdSenseConsent";
import { BackToTop } from "@/components/BackToTop";
import { NotificationBanner } from "@/components/NotificationBanner";

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
  const { forceCheck, pendingToasts, dismissToast } = useAlertNotifications();
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
        <ErrorBoundary>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/airports" component={Airports} />
            <Route path="/airports/:icao">
              {(params) => <AirportDetail icao={params.icao} />}
            </Route>
            <Route path="/about" component={About} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/contact" component={Contact} />
            <Route path="/blog" component={Blog} />
            <Route path="/blog/:slug" component={BlogPost} />
            <Route path="/features" component={Features} />
            <Route path="/features/:slug" component={FeatureDetail} />
            <Route path="/faq" component={FAQ} />
            <Route path="/use-cases" component={UseCases} />
            <Route path="/use-cases/:slug" component={UseCaseDetail} />
            <Route component={NotFound} />
          </Switch>
        </WouterRouter>
        </Suspense>
        </ErrorBoundary>

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
        <CookieConsent />
        <NotificationBanner />
        <AdSenseConsent />
        <BackToTop />
      </LocalAckContext.Provider>
    </ThemeContext.Provider>
    </TestPanelContext.Provider>
  );
}

function App() {
  // Google Analytics'i sadece consent verilmişse başlat
  useEffect(() => {
    const prefs = getCookiePreferences();
    if (prefs?.analytics) {
      initGA();
    }
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
