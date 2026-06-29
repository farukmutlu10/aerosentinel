import { useMemo, useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Link } from "wouter";
import {
  useListAlerts, getListAlertsQueryKey,
  getGetAlertsSummaryQueryKey, getGetRecentAlertsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useLocalAck, useTestPanel } from "@/App";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { ClockCard } from "@/components/ClockDisplay";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useQueryClient } from "@tanstack/react-query";
import { AlertBadge } from "@/components/AlertBadge";
import { IataBadge } from "@/components/IataBadge";
import { TafText } from "@/components/TafText";
import { AdSlot } from "@/components/ads/AdSlot";
import { Skeleton } from "@/components/ui/skeleton";
import { TafDiffModal } from "@/components/TafDiffModal";
import { useAlertSound, playAlertSound } from "@/hooks/useAlertSound";
import { formatDistanceToNow, format } from "date-fns";

type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";
type SortMode = "newest" | "oldest" | "icao-az";

const ALL_ALERT_TYPES: AlertType[] = ["TAF_AMD", "TAF_COR", "SPECI"];

const TYPE_LABELS: Record<AlertType, string> = {
  TAF_AMD: "TAF AMD",
  TAF_COR: "TAF COR",
  SPECI: "SPECI",
};

const TYPE_COLORS: Record<AlertType, string> = {
  TAF_AMD: "#facc15",  // yellow-400 — matches AlertBadge
  TAF_COR: "#fb923c",  // orange-400 — matches AlertBadge
  SPECI:   "#f87171",  // red-400   — matches AlertBadge
};

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest",  label: "Newest" },
  { value: "oldest",  label: "Oldest" },
  { value: "icao-az", label: "ICAO A–Z" },
];

const DEFAULT_TYPES = ALL_ALERT_TYPES as string[];
const DEFAULT_SORT: SortMode = "newest";
const DEFAULT_HIDE_ACK = false;

// ── Stat card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  bg?: string;
  border?: string;
  numberColor?: string;
  labelColor?: string;
  barFill?: string;
  barWidth?: number;
  pulse?: boolean;
}

function StatCard({
  label, value, icon, bg, border, numberColor, labelColor, barFill, barWidth = 0, pulse,
}: StatCardProps) {
  return (
    <div
      className={`relative rounded-lg sm:rounded-xl overflow-hidden ${pulse ? "animate-pulse-slow" : ""}`}
      style={{ backgroundColor: bg || "hsl(var(--card))", border: border || "0.5px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-col items-center justify-center px-1 sm:px-2 py-2 sm:py-2.5 text-center">
        <span style={{ color: numberColor || "rgba(255,255,255,0.45)" }} className="mb-0.5 sm:mb-1">{icon}</span>
        <p className="text-xl sm:text-2xl font-mono font-black tabular-nums leading-none" style={{ color: numberColor || "rgba(255,255,255,0.85)" }}>{value}</p>
        <p className="text-[8px] sm:text-[10px] font-mono tracking-widest uppercase mt-0.5" style={{ color: labelColor || "rgba(255,255,255,0.35)" }}>{label}</p>
      </div>
      {/* Progress bar */}
      <div className="h-[2px] mx-2 mb-1.5 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: barFill || "rgba(255,255,255,0.2)" }} />
      </div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const IconList = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IconTaf = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const IconSpeci = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export default function Alerts() {
  // v2 key for type filter — now an array of active types (all active by default)
  const [activeTypesArr, setActiveTypesArr] = usePersistedState<string[]>("as-alerts-types-v2", DEFAULT_TYPES);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-alerts-sort", DEFAULT_SORT);
  const [hideAcknowledged, setHideAcknowledged] = usePersistedState<boolean>("as-alerts-hide-ack", DEFAULT_HIDE_ACK);
  // Per-user ACK: shared via LocalAckContext (persisted in localStorage)
  const { localAcked, setLocalAcked } = useLocalAck();
  const [ackingAll, setAckingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => !!sessionStorage.getItem("swipe-ack-seen"));
  const { testPanelVisible } = useTestPanel();

  // Pull-to-refresh (mobile)
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);


  // Swipe-to-ACK (mobile)
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const swipeXRef = useRef(0);
  const swipedIdRef = useRef<number | null>(null);
  const touchStartX = useRef(0);

  // TafDiffModal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffAlertId, setDiffAlertId] = useState<number | null>(null);
  const [diffAlertType, setDiffAlertType] = useState<string>("");
  const [diffAlertIcao, setDiffAlertIcao] = useState<string>("");
  const { play: playDiffSound } = useAlertSound();

  const openDiffModal = (alert: { id: number; type: string; icao: string }) => {
    setDiffAlertId(alert.id);
    setDiffAlertType(alert.type);
    setDiffAlertIcao(alert.icao);
    setDiffModalOpen(true);
  };

  // In-app toast "VIEW" butonu için event listener
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.alertId) {
        openDiffModal({ id: detail.alertId, type: detail.alertType, icao: detail.icao });
      }
    };
    window.addEventListener("open-diff-modal", handler);
    return () => window.removeEventListener("open-diff-modal", handler);
  }, []);

  // Monitor sayfasından navigate edildiğinde sessionStorage'daki pending modal'ı aç
  useEffect(() => {
    const pending = sessionStorage.getItem("pending-diff-modal");
    if (pending) {
      try {
        const detail = JSON.parse(pending);
        sessionStorage.removeItem("pending-diff-modal");
        if (detail.alertId) {
          openDiffModal({ id: detail.alertId, type: detail.alertType, icao: detail.icao });
        }
      } catch { sessionStorage.removeItem("pending-diff-modal"); }
    }
  }, []);

  const activeTypesSet = new Set<string>(activeTypesArr);
  const localAckedSet = useMemo(() => new Set(localAcked), [localAcked]);
  const isAcked = useCallback((a: { id: number }) => localAckedSet.has(a.id), [localAckedSet]);

  const handleAck = (id: number) => {
    setLocalAcked((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const toggleType = (t: AlertType) =>
    setActiveTypesArr((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  const isFiltered =
    DEFAULT_TYPES.some((t) => !activeTypesArr.includes(t)) ||
    sortMode !== DEFAULT_SORT || hideAcknowledged !== DEFAULT_HIDE_ACK;

  const resetFilters = () => {
    setActiveTypesArr(DEFAULT_TYPES);
    setSortMode(DEFAULT_SORT);
    setHideAcknowledged(DEFAULT_HIDE_ACK);
  };

  const queryClient = useQueryClient();
  const { isWatching, watchedIcaos } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();

  const { data: allAlerts, isLoading } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: Infinity, refetchIntervalInBackground: true } }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    fetch("/api/alerts/summary?refresh=1").catch(() => {});
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAlertsSummaryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() }),
    ]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const alerts = useMemo(() => {
    let list = allAlerts ?? [];
    // Deduplicate: keep only the latest alert per ICAO
    const seen = new Map<string, number>();
    list = list.filter((a) => {
      const prev = seen.get(a.icao);
      if (prev === undefined || new Date(a.detectedAt).getTime() > prev) {
        seen.set(a.icao, new Date(a.detectedAt).getTime());
        return true;
      }
      return false;
    });
    list = list.filter((a) => activeTypesSet.has(a.type));
    if (hideAcknowledged) list = list.filter((a) => !isAcked(a));
    list = list.filter((a) => isWatching(a.icao) || a.icao.startsWith("TEST"));
    const sorted = [...list];
    if (sortMode === "newest") sorted.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    else if (sortMode === "oldest") sorted.sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());
    else sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    return sorted;
  }, [allAlerts, activeTypesArr, hideAcknowledged, localAcked, isWatching, sortMode]);

  const handleAckAll = () => {
    setAckingAll(true);
    const ids = alerts.filter((a) => !isAcked(a)).map((a) => a.id);
    setLocalAcked((prev) => [...new Set([...prev, ...ids])]);
    setAckingAll(false);
  };

  const unackedCount = alerts.filter((a) => !isAcked(a)).length;
  const dash = isLoading ? "—" : undefined;
  const totalAlerts    = alerts.length;
  const tafRevisions   = alerts.filter((a) => a.type === "TAF_AMD" || a.type === "TAF_COR").length;
  const speciAlerts    = alerts.filter((a) => a.type === "SPECI").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main
        className="flex-1 max-w-7xl mx-auto w-full px-0 pt-1.5 sm:py-3 pb-24 sm:pb-3 space-y-1.5 sm:space-y-3"
        onTouchStart={(e) => { if (window.scrollY === 0) { setIsPulling(true); touchStartY.current = e.touches[0].clientX; } }}
        onTouchMove={(e) => { if (!isPulling) return; const delta = e.touches[0].clientY - touchStartY.current; if (delta > 0) setPullDistance(Math.min(delta, 100)); }}
        onTouchEnd={() => { if (pullDistance > 60) handleRefresh(); setPullDistance(0); setIsPulling(false); }}
      >
        {/* Pull-to-refresh indicator (mobile) */}
        {pullDistance > 0 && (
          <div className="flex items-center justify-center sm:hidden py-2" style={{ height: Math.min(pullDistance / 2, 50) }}>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-primary ${pullDistance > 60 ? "" : "opacity-50"} ${isRefreshing ? "animate-spin" : ""}`}
              style={{ transform: `rotate(${pullDistance * 3}deg)` }}
            >
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            <span className="text-[10px] font-mono text-muted-foreground ml-2">
              {pullDistance > 60 ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        )}

        {/* Stats — Mobile: 2×2 grid + full-width clock | Desktop: flex row */}
        <div className="grid grid-cols-2 gap-1.5 sm:hidden">
          <StatCard label="Total" value={dash ?? String(totalAlerts)} icon={<IconList />} bg="rgba(100,116,139,0.06)" border="0.5px solid rgba(100,116,139,0.15)" numberColor="rgba(100,116,139,0.9)" labelColor="rgba(100,116,139,0.5)" barFill="rgba(255,255,255,0.2)" barWidth={100} />
          <StatCard label="Unacked" value={dash ?? String(unackedCount)} icon={<IconAlert />} bg="rgba(226,75,74,0.08)" border="0.5px solid rgba(226,75,74,0.25)" numberColor="#e24b4a" labelColor="rgba(226,75,74,0.6)" barFill="#e24b4a" barWidth={totalAlerts > 0 ? (unackedCount / totalAlerts) * 100 : 0} pulse={unackedCount > 0} />
          <StatCard label="TAF Rev" value={dash ?? String(tafRevisions)} icon={<IconTaf />} bg="rgba(239,159,39,0.07)" border="0.5px solid rgba(239,159,39,0.2)" numberColor="#ef9f27" labelColor="rgba(239,159,39,0.6)" barFill="#ef9f27" barWidth={totalAlerts > 0 ? (tafRevisions / totalAlerts) * 100 : 0} />
          <StatCard label="SPECI" value={dash ?? String(speciAlerts)} icon={<IconSpeci />} bg="rgba(255,140,50,0.07)" border="0.5px solid rgba(255,140,50,0.2)" numberColor="#ff8c32" labelColor="rgba(255,140,50,0.6)" barFill="#ff8c32" barWidth={totalAlerts > 0 ? (speciAlerts / totalAlerts) * 100 : 0} />
        </div>
        <div className="sm:hidden">
          <ClockCard />
        </div>
        {/* Desktop: flex row */}
        <div className="hidden sm:flex sm:flex-nowrap" style={{gap:"10px"}}>
          <div className="w-full sm:flex-1"><StatCard label="Total" value={dash ?? String(totalAlerts)} icon={<IconList />} bg="rgba(100,116,139,0.06)" border="0.5px solid rgba(100,116,139,0.15)" numberColor="rgba(100,116,139,0.9)" labelColor="rgba(100,116,139,0.5)" barFill="rgba(255,255,255,0.2)" barWidth={100} /></div>
          <div className="w-full sm:flex-1"><StatCard label="Unacked" value={dash ?? String(unackedCount)} icon={<IconAlert />} bg="rgba(226,75,74,0.08)" border="0.5px solid rgba(226,75,74,0.25)" numberColor="#e24b4a" labelColor="rgba(226,75,74,0.6)" barFill="#e24b4a" barWidth={totalAlerts > 0 ? (unackedCount / totalAlerts) * 100 : 0} pulse={unackedCount > 0} /></div>
          <div className="w-full sm:flex-1"><StatCard label="TAF Rev" value={dash ?? String(tafRevisions)} icon={<IconTaf />} bg="rgba(239,159,39,0.07)" border="0.5px solid rgba(239,159,39,0.2)" numberColor="#ef9f27" labelColor="rgba(239,159,39,0.6)" barFill="#ef9f27" barWidth={totalAlerts > 0 ? (tafRevisions / totalAlerts) * 100 : 0} /></div>
          <div className="w-full sm:flex-1"><StatCard label="SPECI" value={dash ?? String(speciAlerts)} icon={<IconSpeci />} bg="rgba(255,140,50,0.07)" border="0.5px solid rgba(255,140,50,0.2)" numberColor="#ff8c32" labelColor="rgba(255,140,50,0.6)" barFill="#ff8c32" barWidth={totalAlerts > 0 ? (speciAlerts / totalAlerts) * 100 : 0} /></div>
          <div className="w-full sm:flex-1">
            <ClockCard />
          </div>
        </div>

        {/* ═══════ Alert Filters ═══════ */}

        {/* Desktop filters — eski düzen */}
        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2 mb-2" role="group" aria-label="Filter alerts">
          <div className="filter-group">
            {ALL_ALERT_TYPES.map((t) => (
              <button key={t} onClick={() => toggleType(t)} className="filter-btn"
                style={activeTypesSet.has(t) ? {
                  backgroundColor: TYPE_COLORS[t] + "26",
                  color: TYPE_COLORS[t],
                  borderColor: TYPE_COLORS[t],
                } : {
                  backgroundColor: "transparent",
                  color: TYPE_COLORS[t] + "99",
                  borderColor: TYPE_COLORS[t] + "4D",
                }}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <span className="text-border text-xs">|</span>
          <div className="filter-group">
            {SORT_OPTIONS.map((s) => (
              <button key={s.value} onClick={() => setSortMode(s.value)} className="filter-btn"
                style={sortMode === s.value ? { backgroundColor: "rgba(212,168,67,0.15)", color: "#d4a843", borderColor: "#d4a843" } : { backgroundColor: "transparent", color: "rgba(212,168,67,0.6)", borderColor: "rgba(212,168,67,0.3)" }}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-border text-xs">|</span>
          <button onClick={() => setHideAcknowledged(!hideAcknowledged)} className="filter-btn"
            style={hideAcknowledged ? {
              backgroundColor: "rgba(212,168,67,0.15)",
              color: "#d4a843",
              borderColor: "rgba(212,168,67,0.5)",
            } : {
              backgroundColor: "transparent",
              color: "rgba(212,168,67,0.7)",
              borderColor: "rgba(212,168,67,0.3)",
            }}>
            {hideAcknowledged ? "Show All" : "Hide ACK'ed"}
          </button>
          {isFiltered && <div className="w-px h-5" style={{ backgroundColor: "rgba(212,168,67,0.3)" }} />}
          {isFiltered && (
            <button onClick={resetFilters} className="filter-btn"
              style={{ backgroundColor: "transparent", color: "rgba(212,168,67,0.7)", borderColor: "rgba(212,168,67,0.3)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              <span>Reset</span>
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {unackedCount > 0 && (
              <button onClick={handleAckAll} disabled={ackingAll} className="filter-btn" style={{ borderColor: "rgba(16,185,129,0.6)", color: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" }}>
                {ackingAll ? "..." : `ACK All (${unackedCount})`}
              </button>
            )}
            <button onClick={handleRefresh} disabled={isRefreshing} className="filter-btn flex items-center gap-1.5" style={{ borderColor: "rgba(56,189,248,0.4)", color: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={isRefreshing ? "animate-spin" : ""}>
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              <span>{isRefreshing ? "..." : "REFRESH"}</span>
            </button>
          </div>
        </div>

        {/* Mobil filters — yeni tasarım */}
        <div className="sm:hidden space-y-1.5 mb-3" role="group" aria-label="Filter alerts">
          <div className="flex items-center justify-between gap-1.5 w-full flex-wrap">
            <div className="filter-group">
              {ALL_ALERT_TYPES.map((t) => (
                <button key={t} onClick={() => toggleType(t)} className="filter-btn"
                  style={activeTypesSet.has(t) ? {
                    backgroundColor: TYPE_COLORS[t] + "26",
                    color: TYPE_COLORS[t],
                    borderColor: TYPE_COLORS[t],
                  } : {
                    backgroundColor: "transparent",
                    color: TYPE_COLORS[t] + "99",
                    borderColor: TYPE_COLORS[t] + "4D",
                  }}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="w-px h-5" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <div className="filter-group">
              {SORT_OPTIONS.map((s) => (
                <button key={s.value} onClick={() => setSortMode(s.value)} className="filter-btn"
                  style={sortMode === s.value ? { backgroundColor: "rgba(212,168,67,0.15)", color: "#d4a843", borderColor: "#d4a843" } : { backgroundColor: "transparent", color: "rgba(212,168,67,0.6)", borderColor: "rgba(212,168,67,0.3)" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setHideAcknowledged(!hideAcknowledged)} className="filter-btn"
              style={hideAcknowledged ? {
                backgroundColor: "rgba(212,168,67,0.15)",
                color: "#d4a843",
                borderColor: "rgba(212,168,67,0.5)",
              } : {
                backgroundColor: "transparent",
                color: "rgba(212,168,67,0.7)",
                borderColor: "rgba(212,168,67,0.3)",
              }}>
              {hideAcknowledged ? "Show All" : "Hide ACK'ed"}
            </button>
            {isFiltered && <div className="w-px h-5" style={{ backgroundColor: "rgba(212,168,67,0.3)" }} />}
            {isFiltered && (
              <button onClick={resetFilters} className="filter-btn"
                style={{ backgroundColor: "transparent", color: "rgba(212,168,67,0.7)", borderColor: "rgba(212,168,67,0.3)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            <div className="flex-1" />
            {unackedCount > 0 && (
              <button onClick={handleAckAll} disabled={ackingAll} className="filter-btn" style={{ borderColor: "rgba(16,185,129,0.6)", color: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" }}>
                {ackingAll ? "..." : `ACK All (${unackedCount})`}
              </button>
            )}
            <button onClick={handleRefresh} disabled={isRefreshing} className="filter-btn flex items-center gap-1.5" style={{ borderColor: "rgba(56,189,248,0.4)", color: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={isRefreshing ? "animate-spin" : ""}>
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              <span className="hidden sm:inline">{isRefreshing ? "..." : "REFRESH"}</span>
            </button>
          </div>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-lg bg-card border border-border overflow-hidden">
                <Skeleton className="h-20 sm:h-24 rounded-none" />
              </div>
            ))}
          </div>
        ) : !alerts.length ? (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-8 sm:p-16 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-mono font-bold text-foreground">No alerts at the moment</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">AeroSentinel is monitoring airports for weather changes.</p>
              </div>
              {isFiltered && (
                <button onClick={resetFilters} className="px-4 py-2 text-xs font-mono font-bold rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
                  Reset Filters
                </button>
              )}
            </div>
            <AdSlot
              slot="alerts-infeed"
              sponsor={{
                name: "AERO-SENTINEL",
                url: "#",
                description: "Premium aviation weather monitoring",
              }}
            />
          </div>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {alerts.slice(0, displayLimit).map((alert, idx) => (
              <Fragment key={alert.id}>
                {/* Sponsor — 2. alert sonrası */}
                {idx === 2 && (
                  <AdSlot
                    slot="alerts-infeed"
                    sponsor={{
                      name: "AERO-SENTINEL",
                      url: "#",
                      description: "Premium aviation weather monitoring",
                    }}
                  />
                )}
                {/* Sponsor — 5. alert sonrası */}
                {idx === 5 && (
                  <AdSlot
                    slot="alerts-infeed"
                    sponsor={{
                      name: "AERO-SENTINEL",
                      url: "#",
                      description: "Premium aviation weather monitoring",
                    }}
                  />
                )}
                <div
                  onTouchStart={(e) => { swipedIdRef.current = alert.id; setSwipedId(alert.id); touchStartX.current = e.touches[0].clientX; }}
                  onTouchMove={(e) => {
                    if (swipedIdRef.current !== alert.id || isAcked(alert)) return;
                    const dx = e.touches[0].clientX - touchStartX.current;
                    if (dx < 0) { const clamped = Math.max(dx, -80); swipeXRef.current = clamped; setSwipeX(clamped); }
                  }}
                  onTouchEnd={() => {
                    if (swipeXRef.current < -50 && !isAcked(alert)) { handleAck(alert.id); }
                    swipeXRef.current = 0; setSwipeX(0);
                    swipedIdRef.current = null; setSwipedId(null);
                  }}
                  style={{ transform: `translateX(${swipedId === alert.id ? swipeX : 0}px)`, transition: "transform 0.2s ease" }}
                  className={`relative border rounded-lg px-3 sm:px-4 py-2.5 sm:py-4 transition-opacity ${isAcked(alert) ? "opacity-65 dark:opacity-40" : ""} ${
                    alert.type === "SPECI" ? "alert-speci" : alert.type === "TAF_AMD" ? "alert-taf-amd" : "alert-taf-cor"
                  }`}>

                {/* ACK indicator — visible on swipe */}
                {swipedId === alert.id && swipeX < -20 && !isAcked(alert) && (
                  <div className="absolute right-full top-0 bottom-0 flex items-center pr-2">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">ACK →</span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 pt-0.5"><AlertBadge type={alert.type as AlertType} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2 flex-wrap">
                        <Link href={`/airports/${alert.icao}`} className="font-mono font-bold text-xs sm:text-sm hover:underline inline-flex items-center gap-1">
                          {alert.icao}
                          <IataBadge icao={alert.icao} />
                        </Link>
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">{new Date(alert.detectedAt).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " UTC"}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-mono hidden sm:inline">({formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })})</span>
                        {isAcked(alert) && <span className="text-[10px] sm:text-xs bg-muted text-muted-foreground font-mono px-1.5 sm:px-2 py-0.5 rounded">ACK</span>}
                      </div>
                      <TafText raw={alert.rawText} />
                    </div>
                  </div>
                  {/* Sağ taraf: butonlar — yan yana, ortalanmış */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-center ml-2 sm:ml-4">
                    {/* CHANGES butonu — ikincil, daha az vurgulu */}
                    {(alert as any).previousRawText && (
                      <button
                        onClick={() => openDiffModal(alert)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-sky-500/30 bg-sky-500/5 text-sky-400/80 text-[10px] sm:text-[11px] font-mono font-bold tracking-wider hover:bg-sky-500/12 hover:border-sky-400/50 hover:text-sky-300 transition-all"
                      >
                        CHANGES
                      </button>
                    )}
                    {/* ACK butonu — birincil, hap şeklinde, beyaz metin, sofistike gölge */}
                    {!isAcked(alert) && (
                      <button onClick={() => handleAck(alert.id)}
                        className="flex-shrink-0 self-center ml-2 sm:ml-4 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border text-[10px] sm:text-xs font-mono font-bold tracking-[0.15em] sm:tracking-[0.2em] transition-all"
                        style={{
                          borderColor: "rgba(16,185,129,0.6)",
                          color: "#10b981",
                          backgroundColor: "rgba(16,185,129,0.12)",
                          boxShadow: "0 2px 8px rgba(16,185,129,0.2)",
                        }}>
                        ACK
                      </button>
                    )}
                  </div>
                </div>
              </div>
              </Fragment>
            ))}

            {displayLimit < alerts.length && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => setDisplayLimit((n) => n + 20)}
                  className="px-4 sm:px-6 py-2 rounded-lg border border-border text-[10px] sm:text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  Load more ({alerts.length - displayLimit} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />

      {/* Swipe hint — mobile only, Apple-style notification card */}
      {!swipeHintDismissed && (
        <div
          className="fixed bottom-24 left-4 right-4 z-40 sm:hidden"
          style={{
            animation: "fadeInUp 0.4s ease-out",
          }}
        >
          <div
            className="mx-auto max-w-sm rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "rgba(30, 30, 40, 0.92)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
              border: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(16, 185, 129, 0.15)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white leading-tight">Swipe to ACK</p>
                <p className="text-[12px] text-white/60 mt-0.5 leading-snug">
                  Swipe alerts <span className="text-emerald-400 font-semibold">left</span> to acknowledge
                </p>
              </div>
              <button
                onClick={() => {
                  sessionStorage.setItem("swipe-ack-seen", "1");
                  setSwipeHintDismissed(true);
                }}
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {/* Bottom action bar */}
            <div
              className="flex border-t"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <button
                onClick={() => {
                  sessionStorage.setItem("swipe-ack-seen", "1");
                  setSwipeHintDismissed(true);
                }}
                className="flex-1 py-2.5 text-[13px] font-semibold text-emerald-400 active:bg-white/5 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TafDiffModal */}
      {diffAlertId !== null && (
        <TafDiffModal
          open={diffModalOpen}
          onClose={() => { setDiffModalOpen(false); setDiffAlertId(null); }}
          alertId={diffAlertId}
          alertType={diffAlertType}
          icao={diffAlertIcao}
        />
      )}

      {/* ── Test Alert Panel (hidden by default, toggle via secret) ── */}
      {testPanelVisible && (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t border-border px-3 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3">
          <span className="text-[10px] sm:text-xs font-mono text-muted-foreground font-bold tracking-wider">TEST</span>
          <button
            onClick={async () => {
              try {
                const res = await customFetch("/api/alerts/test", { method: "POST" }) as any;
                console.log("[TestPanel] POST /api/alerts/test response:", res);

                // Ensure notification permission
                if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
                  await Notification.requestPermission();
                }

                // Play sound directly
                try { playAlertSound(); } catch (e) { console.warn("[TestPanel] Sound error:", e); }

                // Show notification directly (sadece tek notification — polling invalidation kaldırıldı)
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                  const icao = res?.icao || "TEST";
                  const type = res?.type || "SPECI";
                  const n = new Notification(`AERO-SENTINEL — Test ${type}`, {
                    body: `${icao}: Test alert created successfully`,
                    icon: `${import.meta.env.BASE_URL}alert-icon.png?v=7`,
                    tag: `test-alert-${Date.now()}`,
                    requireInteraction: false,
                  });
                  setTimeout(() => n.close(), 30_000);
                  console.log("[TestPanel] Notification shown for", icao);
                } else {
                  console.warn("[TestPanel] Notification permission:", Notification.permission);
                }

                // Sadece alert listesini güncelle, recent alerts'i invalidate ETME (çift bildirim engeli)
                await queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
              } catch (e) { console.error("[TestPanel] Test alert failed:", e); }
            }}
            className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
          >
            + Single
          </button>
          <button
            id="test-alert-start"
            onClick={() => {
              const sendTest = async () => {
                try {
                  const res = await customFetch("/api/alerts/test", { method: "POST" }) as any;

                  // Doğrudan ses çal
                  try { playAlertSound(); } catch (e) { console.warn("[TestPanel] Sound error:", e); }

                  // Doğrudan bildirim göster
                  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                    const icao = res?.icao || "TEST";
                    const type = res?.type || "SPECI";
                    const n = new Notification(`AERO-SENTINEL — Test ${type}`, {
                      body: `${icao}: Test alert (auto)`,
                      icon: `${import.meta.env.BASE_URL}alert-icon.png?v=7`,
                      tag: `test-alert-${Date.now()}`,
                      requireInteraction: false,
                    });
                    setTimeout(() => n.close(), 30_000);
                  }

                  // Sadece alert listesini güncelle (çift bildirim engeli)
                  await queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
                } catch (e) { console.error("[TestPanel] Test alert failed:", e); }
              };
              sendTest();
              const id = window.setInterval(sendTest, 30_000);
              (window as any).__testAlertInterval = id;
              const btn = document.getElementById("test-alert-start");
              const stopBtn = document.getElementById("test-alert-stop");
              if (btn) btn.style.display = "none";
              if (stopBtn) stopBtn.style.display = "flex";
            }}
            className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/40 hover:bg-sky-500/30 transition-colors"
          >
            ▶ Start 30s
          </button>
          <button
            id="test-alert-stop"
            onClick={() => {
              const id = (window as any).__testAlertInterval;
              if (id) clearInterval(id);
              (window as any).__testAlertInterval = null;
              const btn = document.getElementById("test-alert-start");
              const stopBtn = document.getElementById("test-alert-stop");
              if (btn) btn.style.display = "flex";
              if (stopBtn) stopBtn.style.display = "none";
            }}
            style={{ display: "none" }}
            className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors"
          >
            ■ Stop
          </button>
          <button
            onClick={async (e) => {
              e.preventDefault();
              const btn = e.currentTarget;
              const origText = btn.textContent;
              btn.textContent = "⏳ Deleting...";
              btn.style.opacity = "0.5";
              try {
                console.log("[TestPanel] DELETE /api/alerts/test gönderiliyor...");
                const data = await customFetch("/api/alerts/test", { method: "DELETE" }) as any;
                console.log("[TestPanel] DELETE response:", data);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() }),
                  queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey() }),
                ]);
                btn.textContent = `✅ Deleted ${data.deleted || 0}`;
                setTimeout(() => { btn.textContent = origText; btn.style.opacity = "1"; }, 2000);
                console.log("[TestPanel] Delete tamamlandı");
              } catch (e) {
                console.error("[TestPanel] Delete FAILED:", e);
                btn.textContent = "❌ Failed";
                setTimeout(() => { btn.textContent = origText; btn.style.opacity = "1"; }, 2000);
              }
            }}
            className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-mono font-bold bg-red-500/15 text-red-400/80 border border-red-500/30 hover:bg-red-500/25 transition-colors"
          >
            🗑 Delete All
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
