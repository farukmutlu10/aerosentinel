import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { createPortal } from "react-dom";
import {
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { TafText } from "@/components/TafText";
import { ColoredRawText } from "@/components/ColoredRawText";
import { ClockBadge, useSelectedTimezone } from "@/components/ClockDisplay";
import { IataBadge } from "@/components/IataBadge";
import { AdSlot } from "@/components/ads/AdSlot";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { normalizeIcao } from "@/lib/icaoUtils";
import { iataToIcao } from "@/lib/iataMap";
import {
  parseMetar, FlightCategory, CATEGORY_COLOR,
  extractTimeSlots, parseTafWorstCategory,
  hasCritWx, hasBadgeWind, RED_WX,
} from "@/lib/metarParser";

type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
type ViewMode = "TAF" | "METAR" | "BOTH";

const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
const CRIT_KEY = "CRIT";
// v2 key — forces fresh default, clears any stale localStorage state
const DEFAULT_CATS = [...ALL_CATS, CRIT_KEY] as string[];
const DEFAULT_VIEW: ViewMode = "TAF";
const DEFAULT_ROUTE: RouteFilter = "ALL";
const DEFAULT_SORT: SortMode = "alpha";

const CAT_ORDER = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

const WEATHER_KEY = (key: string) => ["watchlist", "weather", key];

function useWatchlistWeather(icaos: string[]) {
  const key = icaos.join(",");
  const queryClient = useQueryClient();
  const query = useQuery<WeatherItem[]>({
    queryKey: WEATHER_KEY(key),
    queryFn: () => fetch(`/api/watchlist/weather?icaos=${key}`).then((r) => r.json()),
    enabled: icaos.length > 0,
    refetchInterval: 180_000,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: WEATHER_KEY(key) });
  return { ...query, refresh };
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "lifr-first", label: "Worst" },
  { value: "vfr-first", label: "Best" },
];

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "TAF",   label: "TAF" },
  { value: "METAR", label: "METAR" },
  { value: "BOTH",  label: "TAF+METAR" },
];

/** True when airport has critical weather or extreme wind */
function airportIsCrit(rawTaf: string | null, rawMetar: string | null): boolean {
  return hasCritWx(rawTaf ?? "") || hasCritWx(rawMetar ?? "")
    || hasBadgeWind(rawTaf) || hasBadgeWind(rawMetar);
}

function getEffectiveCat(
  rawTaf: string | null,
  metar: ReturnType<typeof parseMetar> | null,
  view: ViewMode,
): FlightCategory {
  if (view === "METAR") return metar?.flightCategory ?? FlightCategory.VFR;
  const tafCat = parseTafWorstCategory(rawTaf);
  return tafCat ?? metar?.flightCategory ?? FlightCategory.VFR;
}

function worstOf(a: FlightCategory, b: FlightCategory): FlightCategory {
  return CAT_ORDER.indexOf(a) >= CAT_ORDER.indexOf(b) ? a : b;
}

export default function Dashboard() {
  const { theme, toggleTheme } = useThemeContext();
  const { effectiveIcaos, watchedIcaos, addIcao, removeIcao, clearWatchlist, hasFilter } = useWatchlist();
  const [selectedTz] = useSelectedTimezone();
  const isIstanbul = selectedTz === "Europe/Istanbul";
  const [isRefreshing, setIsRefreshing] = useState(false);

  // v2 key — avoids stale localStorage with old format (without CRIT)
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-dash-cats-v2", DEFAULT_CATS);
  const [view, setView] = usePersistedState<ViewMode>("as-dash-view", DEFAULT_VIEW);
  const [routeFilter, setRouteFilter] = useState<RouteFilter>(DEFAULT_ROUTE);

  // Reset route filter to ALL when timezone is not Istanbul
  useEffect(() => {
    if (!isIstanbul && routeFilter !== "ALL") setRouteFilter("ALL");
  }, [isIstanbul]);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-dash-sort", DEFAULT_SORT);
  const [timeFilters, setTimeFilters] = usePersistedState<string[]>("as-dash-time-multi", []);
  const [icaoSearch, setIcaoSearch] = usePersistedState<string>("as-dash-icao-search", "");
  const [watchlistOpen, setWatchlistOpen] = usePersistedState<boolean>("as-dash-watchlist-open", true);
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);
  const [wlInput, setWlInput] = useState("");
  const wlInputRef = useRef<HTMLInputElement>(null);
  const [copiedWatchlist, setCopiedWatchlist] = useState(false);

  // Pull-to-refresh (mobile)
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);

  // Mobile watchlist bottom sheet
  const [watchlistSheetOpen, setWatchlistSheetOpen] = useState(false);

  // Notification tracking
  const prevWeatherRef = useRef<Map<string, { rawMetar: string | null; rawTaf: string | null }>>(new Map());
  const notifInitRef = useRef(false);

  const activeCats = new Set<string>(activeCatsArr);
  const critActive = activeCats.has(CRIT_KEY);

  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const toggleCritFilter = () =>
    setActiveCatsArr((p) => p.includes(CRIT_KEY) ? p.filter((x) => x !== CRIT_KEY) : [...p, CRIT_KEY]);

  const toggleTimeSlot = (slot: string) =>
    setTimeFilters((p) => p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot]);

  const handleWlAdd = () => {
    const codes = wlInput.split(/[,\s]+/).filter(Boolean);
    const skipped: string[] = [];
    codes.forEach((c) => {
      const raw = c.trim().toUpperCase();
      if (raw.length === 4) {
        addIcao(raw);
      } else if (raw.length === 3) {
        const resolved = iataToIcao(raw);
        if (resolved) addIcao(resolved);
        else skipped.push(c);
      } else if (raw.length > 0) {
        skipped.push(c);
      }
    });
    setWlInput(skipped.length > 0 ? skipped.join(",") : "");
    wlInputRef.current?.focus();
  };

  const handleWlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleWlAdd(); }
    if (e.key === "Backspace" && wlInput === "" && watchedIcaos.length > 0)
      removeIcao(watchedIcaos[watchedIcaos.length - 1]);
  };

  const handleWlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
      .replace(/[İı]/g, "I").replace(/[Şş]/g, "S").replace(/[Ğğ]/g, "G")
      .replace(/[Üü]/g, "U").replace(/[Öö]/g, "O").replace(/[Çç]/g, "C")
      .toUpperCase().replace(/[\n\r]/g, ",").replace(/[^A-Z0-9,\s]/g, "").replace(/,{2,}/g, ",");
    setWlInput(val);
    if (/[\n\r]/.test(e.target.value)) {
      setTimeout(() => handleWlAdd(), 0);
    }
  };

  useEffect(() => {
    if (!timeOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) {
        setTimeOpen(false);
      }
    };
    // Document'a timeout ile ekle ki pull-to-refresh'ten SONRA çalışsın
    const timer = setTimeout(() => {
      document.addEventListener("click", handler);
      document.addEventListener("touchstart", handler, { passive: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [timeOpen]);

  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 180_000 },
  });
  const { data: weatherData, isLoading: weatherLoading, refresh: refreshWeather } = useWatchlistWeather(effectiveIcaos);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshWeather();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // ── Pull-to-refresh handlers (mobile) ──
  const handleTouchStart = (e: React.TouchEvent) => {
    if (timeOpen) return;
    if (window.scrollY === 0) {
      setIsPulling(true);
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setPullDistance(Math.min(delta, 100));
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      handleRefresh();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  // ── CRIT / Wind notifications ─────────────────────────────────────────────
  useEffect(() => {
    if (!weatherData) return;
    const permGranted = typeof Notification !== "undefined" && Notification.permission === "granted";

    if (!notifInitRef.current) {
      for (const w of weatherData)
        prevWeatherRef.current.set(w.icao, { rawMetar: w.rawMetar, rawTaf: w.rawTaf });
      notifInitRef.current = true;
      return;
    }

    for (const w of weatherData) {
      const prev = prevWeatherRef.current.get(w.icao);
      const nowCrit = airportIsCrit(w.rawTaf, w.rawMetar);
      const prevCrit = prev ? airportIsCrit(prev.rawTaf, prev.rawMetar) : false;

      if (permGranted && nowCrit && !prevCrit) {
        const makeRe = (code: string) => new RegExp(`(?:^|\\s)${code.replace(/[+]/g, "\\+")}(?=\\s|$)`);
        const critCodesMetar = [...RED_WX].filter((code) => makeRe(code).test(w.rawMetar ?? ""));
        const critCodesTaf   = [...RED_WX].filter((code) => makeRe(code).test(w.rawTaf   ?? ""));
        const windFromMetar  = hasBadgeWind(w.rawMetar);
        const windFromTaf    = hasBadgeWind(w.rawTaf);
        // Use TAF as source only when METAR has no crit condition
        const useTaf    = !critCodesMetar.length && !windFromMetar && (critCodesTaf.length > 0 || windFromTaf);
        const critCodes = useTaf ? critCodesTaf : critCodesMetar;
        const windAlert = windFromMetar || windFromTaf;
        const sourceRaw = useTaf ? (w.rawTaf ?? "") : (w.rawMetar ?? "");
        const body = [
          critCodes.length ? critCodes.slice(0, 5).join(", ") : windAlert ? "EXTREME WIND" : "Critical condition",
          sourceRaw.slice(0, 120),
        ].filter(Boolean).join("\n");
        try {
          const n = new Notification(`⚠ CRITICAL — ${w.icao}`, {
            body,
            icon: `${import.meta.env.BASE_URL}alert-icon.png?v=7`,
            tag: `crit-${w.icao}-${Date.now()}`,
            requireInteraction: false,
          });
          setTimeout(() => n.close(), 60_000);
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* blocked */ }
      }
      prevWeatherRef.current.set(w.icao, { rawMetar: w.rawMetar, rawTaf: w.rawTaf });
    }
  }, [weatherData]);

  const airports = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.map((w) => ({ ...w, parsed: w.rawMetar ? parseMetar(w.rawMetar) : null }));
  }, [weatherData]);

  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const a of airports) {
      if (routeFilter === "DOM" && !a.icao.startsWith("LT")) continue;
      if (routeFilter === "INT" && a.icao.startsWith("LT")) continue;
      extractTimeSlots(view === "METAR" ? (a.rawMetar ?? "") : (a.rawTaf ?? "")).forEach((s) => slots.add(s));
    }
    return [...slots].sort().reverse();
  }, [airports, view, routeFilter]);

  useEffect(() => {
    if (timeFilters.length > 0 && allTimeSlots.length > 0) {
      const valid = timeFilters.filter((f) => allTimeSlots.includes(f));
      if (valid.length !== timeFilters.length) setTimeFilters(valid);
    }
  }, [allTimeSlots]);

  const isFiltered =
    DEFAULT_CATS.some((c) => !activeCatsArr.includes(c)) ||
    activeCatsArr.some((c) => !DEFAULT_CATS.includes(c)) ||
    view !== DEFAULT_VIEW || routeFilter !== DEFAULT_ROUTE ||
    sortMode !== DEFAULT_SORT || timeFilters.length > 0 || icaoSearch.trim() !== "";

  const resetFilters = () => {
    setActiveCatsArr(DEFAULT_CATS);
    setView(DEFAULT_VIEW);
    setRouteFilter(DEFAULT_ROUTE);
    setSortMode(DEFAULT_SORT);
    setTimeFilters([]);
    setIcaoSearch("");
  };

  const displayed = useMemo(() => {
    const activeFlightCats = ALL_CATS.filter((c) => activeCats.has(c));
    // CRIT airports bypass the category filter when CRIT is active.
    // A non-crit airport is shown only if its category button is active.
    let list = airports.filter((a) => {
      const cat = getEffectiveCat(a.rawTaf, a.parsed, view);
      const isCrit = airportIsCrit(a.rawTaf, a.rawMetar);
      return activeFlightCats.includes(cat) || (critActive && isCrit);
    });

    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));

    if (icaoSearch.trim()) {
      const queries = icaoSearch.trim().toUpperCase().split(/[,\s]+/).filter((q) => q.length >= 2);
      if (queries.length > 0)
        list = list.filter((a) => queries.some((q) => a.icao.startsWith(q) || a.icao.includes(q)));
    }

    if (timeFilters.length > 0) {
      list = list.filter((a) => {
        const raw = view === "METAR" ? (a.rawMetar ?? "") : (a.rawTaf ?? "");
        return timeFilters.some((f) => extractTimeSlots(raw).includes(f));
      });
    }

    const sorted = [...list];
    if (sortMode === "alpha") {
      sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    } else {
      const order = sortMode === "lifr-first"
        ? [FlightCategory.LIFR, FlightCategory.IFR, FlightCategory.MVFR, FlightCategory.VFR]
        : [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
      sorted.sort((a, b) => {
        const ai = order.indexOf(getEffectiveCat(a.rawTaf, a.parsed, view));
        const bi = order.indexOf(getEffectiveCat(b.rawTaf, b.parsed, view));
        return ai !== bi ? ai - bi : a.icao.localeCompare(b.icao);
      });
    }
    return sorted;
  }, [airports, activeCatsArr, routeFilter, sortMode, timeFilters, icaoSearch, view, critActive]);

  const monitorData = monitor as { running?: boolean; scanCountToday?: number; scanCount?: number } | undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader monitorStatus={monitor} theme={theme} onToggleTheme={toggleTheme} />

      <main
        className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-3 sm:py-5 space-y-2 sm:space-y-3"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-mono flex-wrap">
            <span className="text-muted-foreground tracking-widest">MONITOR</span>
            <span className={monitorData?.running ? "text-green-400 font-bold flex items-center gap-1.5" : "text-red-400 font-bold"}>
              {monitorData?.running
                ? <><div className="w-1.5 h-1.5 rounded-full bg-green-400 sentinel-pulse flex-shrink-0" />LIVE</>
                : "STOPPED"}
            </span>
            <span className="text-border hidden sm:inline">|</span>
            <span className="text-muted-foreground">SCANS</span>
            <span className="tabular-nums">{monitorData?.scanCountToday ?? monitorData?.scanCount ?? 0}</span>
            <span className="text-border hidden sm:inline">|</span>
            <span className="text-muted-foreground hidden sm:inline">INTERVAL</span>
            <span className="tabular-nums hidden sm:inline">60s</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ClockBadge />
          </div>
        </div>

        {/* ── Watchlist — Desktop: inline collapsible ── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden hidden sm:block">
          <div
            onClick={() => setWatchlistOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono hover:bg-muted/30 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#d4a843]">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-[#d4a843] tracking-widest">WATCHED AIRPORTS</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded text-[9px] font-mono font-bold"
                style={{
                  backgroundColor: "rgba(212,168,67,0.12)",
                  color: "#d4a843",
                  border: "1px solid rgba(212,168,67,0.3)"
                }}>
                {watchedIcaos.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasFilter && (
                <div className="inline-flex items-stretch border border-border rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(watchedIcaos.join(',')); setCopiedWatchlist(true); setTimeout(() => setCopiedWatchlist(false), 3000); }}
                    className="flex items-center gap-1.5 text-xs font-mono bg-transparent hover:bg-muted/30 transition-colors px-4 py-1.5"
                    style={{ color: copiedWatchlist ? '#d4a843' : undefined }}
                  >
                    {copiedWatchlist ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    )}
                    <span className={!copiedWatchlist ? 'text-muted-foreground' : ''}>{copiedWatchlist ? 'Copied' : 'Copy All'}</span>
                  </button>
                  <div className="w-px bg-border self-stretch" />
                  <button
                    onClick={clearWatchlist}
                    className="flex items-center gap-1.5 text-xs font-mono bg-transparent text-red-500/85 hover:bg-red-500/10 transition-colors px-4 py-1.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Clear All
                  </button>
                </div>
              )}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`text-muted-foreground transition-transform duration-200 ${watchlistOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          {watchlistOpen && (
            <div className="border-t border-border/60 px-4 py-3">
              <div
                className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
                onClick={() => wlInputRef.current?.focus()}
              >
                {watchedIcaos.map((icao) => (
                  <span key={icao} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold">
                    <span>{icao}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                      className="text-primary/60 hover:text-primary transition-colors leading-none">✕</button>
                  </span>
                ))}
                <input ref={wlInputRef} type="text" value={wlInput}
                  onChange={handleWlInputChange} onKeyDown={handleWlKeyDown}
                  placeholder={watchedIcaos.length === 0 ? "Search by ICAO or IATA — separate multiple codes with comma or space." : ""}
                  className="flex-1 min-w-[80px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
                />
                {wlInput.replace(/[,\s]/g, "").length >= 3 && (
                  <button type="button" onClick={handleWlAdd}
                    className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">ADD</button>
                )}
              </div>
              {!hasFilter && (
                <div className="mt-2 py-3 px-3 bg-background/50 border border-border/40 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5 flex-shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">
                        No airports in your watchlist yet. Add airports from the Airports page to get started.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                        Default: <span className="text-primary font-bold">LTFH</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Watchlist — Mobile: header tap opens bottom sheet ── */}
        <div className="sm:hidden bg-card border border-border rounded-lg overflow-hidden">
          <div
            onClick={() => setWatchlistSheetOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-muted/30 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#d4a843]">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-[#d4a843] tracking-widest">WATCHLIST</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded text-[9px] font-mono font-bold"
                style={{
                  backgroundColor: "rgba(212,168,67,0.12)",
                  color: "#d4a843",
                  border: "1px solid rgba(212,168,67,0.3)"
                }}>
                {watchedIcaos.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {watchedIcaos.slice(0, 3).map((icao) => (
                <span key={icao} className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[9px] font-mono font-bold">{icao}</span>
              ))}
              {watchedIcaos.length > 3 && (
                <span className="text-[9px] text-muted-foreground font-mono">+{watchedIcaos.length - 3}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Watchlist Bottom Sheet (mobile only) ── */}
        {watchlistSheetOpen && createPortal(
          <>
            <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => setWatchlistSheetOpen(false)} />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl border-t shadow-2xl sm:hidden max-h-[80vh] flex flex-col">
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                <span className="text-xs font-mono text-[#d4a843] tracking-widest font-bold">WATCHLIST</span>
                <button onClick={() => setWatchlistSheetOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
                  onClick={() => wlInputRef.current?.focus()}>
                  {watchedIcaos.map((icao) => (
                    <span key={icao} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold">
                      <span>{icao}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                        className="text-primary/60 hover:text-primary transition-colors leading-none">✕</button>
                    </span>
                  ))}
                  <input ref={wlInputRef} type="text" value={wlInput}
                    onChange={handleWlInputChange} onKeyDown={handleWlKeyDown}
                    placeholder={watchedIcaos.length === 0 ? "Search by ICAO or IATA" : ""}
                    className="flex-1 min-w-[80px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
                  />
                  {wlInput.replace(/[,\s]/g, "").length >= 3 && (
                    <button type="button" onClick={handleWlAdd}
                      className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">ADD</button>
                  )}
                </div>
                {!hasFilter && (
                  <div className="mt-2 py-2 px-2.5 bg-background/50 border border-border/40 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5 flex-shrink-0">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          No airports in your watchlist yet. Add airports from the Airports page to get started.
                        </p>
                        <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                          Default: <span className="text-primary font-bold">LTFH</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Sticky bottom buttons */}
              <div className="flex border-t border-border px-4 py-3 gap-2">
                <button
                  onClick={() => { navigator.clipboard?.writeText(watchedIcaos.join(',')); setCopiedWatchlist(true); setTimeout(() => setCopiedWatchlist(false), 2000); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-mono border border-border rounded-lg py-2 hover:bg-muted/30 transition-colors"
                  style={{ color: copiedWatchlist ? '#d4a843' : undefined }}
                >
                  {copiedWatchlist ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                  <span className={!copiedWatchlist ? 'text-muted-foreground' : ''}>{copiedWatchlist ? 'Copied' : 'Copy All'}</span>
                </button>
                <button
                  onClick={() => { clearWatchlist(); setWatchlistSheetOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-mono border border-red-500/30 text-red-500/85 rounded-lg py-2 hover:bg-red-500/10 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Clear All
                </button>
              </div>
            </div>
          </>,
          document.body
        )}

        {/* Airport Weather Section */}
        <section>
          {/* Mobile filters — compact layout */}
          <div className="sm:hidden space-y-1.5 mb-2">
            {/* Row 1: Category — VFR MVFR IFR LIFR CRIT */}
            <div className="flex items-center gap-1 w-full">
              {ALL_CATS.map((cat) => {
                const isActive = activeCats.has(cat);
                return (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className="filter-btn flex-1"
                    style={isActive ? {
                      borderColor: CATEGORY_COLOR[cat] + "99",
                      color: CATEGORY_COLOR[cat],
                      backgroundColor: CATEGORY_COLOR[cat] + "18",
                    } : undefined}>
                    {cat}
                  </button>
                );
              })}
              <button onClick={toggleCritFilter}
                className="filter-btn flex-1"
                style={critActive ? {
                  borderColor: "#ef444499", color: "#ef4444", backgroundColor: "#ef444418",
                } : undefined}>
                CRIT
              </button>
            </div>

            {/* Row 2: Sort + View */}
            <div className="flex items-center gap-1.5">
              <div className="filter-group flex-1">
                {SORT_OPTIONS.map((s) => (
                  <button key={s.value} onClick={() => setSortMode(s.value)}
                    className="filter-btn flex-1"
                    style={sortMode === s.value ? {
                      borderColor: "rgba(212, 168, 67, 0.6)",
                      color: "#d4a843",
                      backgroundColor: "rgba(212, 168, 67, 0.12)",
                    } : undefined}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-border" />
              <div className="filter-group flex-1">
                {VIEW_OPTIONS.map((v) => (
                  <button key={v.value} onClick={() => { setView(v.value); setTimeFilters([]); }}
                    className="filter-btn flex-1"
                    style={view === v.value ? {
                      borderColor: "rgba(212, 168, 67, 0.6)",
                      color: "#d4a843",
                      backgroundColor: "rgba(212, 168, 67, 0.12)",
                    } : undefined}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Route + Timestamp + Reset */}
            <div className="flex items-center gap-1.5">
              {isIstanbul && (
                <div className="filter-group">
                  {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                    <button key={f} onClick={() => setRouteFilter(f)}
                      className="filter-btn"
                      style={routeFilter === f ? { borderColor: "rgba(212,168,67,0.6)", color: "#d4a843", backgroundColor: "rgba(212,168,67,0.12)" } : {}}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
              <div className="w-px h-5 bg-border" />
              {!weatherLoading && allTimeSlots.length > 0 && (
                <div className="relative" ref={timeRef}>
                  <button onClick={() => setTimeOpen((o) => !o)}
                    className={`filter-btn flex items-center gap-1 ${timeFilters.length > 0 ? "border-primary text-primary bg-primary/10" : ""}`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span className="hidden sm:inline">Timestamp</span>
                    {timeFilters.length > 0 && (
                      <span className="bg-primary text-primary-foreground rounded-full text-[9px] font-bold px-1 leading-tight">{timeFilters.length}</span>
                    )}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${timeOpen ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {timeOpen && (
                    <div onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-1 z-[60] bg-card border border-border rounded-lg shadow-lg min-w-[160px] overflow-hidden" style={{ pointerEvents: "auto" }}>
                      {timeFilters.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setTimeFilters([]); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setTimeFilters([]); }}
                          className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-b border-border/50">
                          Clear selection
                        </button>
                      )}
                      {allTimeSlots.map((slot) => {
                        const selected = timeFilters.includes(slot);
                        return (
                          <button key={slot} onClick={(e) => { e.stopPropagation(); toggleTimeSlot(slot); }}
                            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); toggleTimeSlot(slot); }}
                            className="w-full text-left px-3 py-2 text-xs font-mono tabular-nums flex items-center justify-between gap-3 transition-colors"
                            style={{ WebkitTapHighlightColor: "transparent", ...(selected ? { backgroundColor: "rgba(212,168,67,0.10)" } : {}) }}>
                            <span>
                              <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{slot.slice(0, 2)}</span>
                              <span className="font-bold" style={{ color: "hsl(45 90% 50%)" }}>{slot.slice(2, 6)}</span>
                              <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{slot.slice(6)}</span>
                            </span>
                            {selected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {isFiltered && <div className="w-px h-5" style={{ backgroundColor: "rgba(212,168,67,0.3)" }} />}
              {isFiltered && (
                <button onClick={resetFilters} title="Reset all filters"
                  className="filter-btn flex items-center gap-1 text-muted-foreground hover:text-destructive hover:border-destructive/50 flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                  </svg>
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Desktop: mevcut flex layout */}
          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2 mb-2">
            {/* Category filters — all same toggle logic */}
            <div className="flex items-center gap-1">
              {ALL_CATS.map((cat) => {
                const isActive = activeCats.has(cat);
                return (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className="filter-btn"
                    style={isActive ? {
                      borderColor: CATEGORY_COLOR[cat] + "99",
                      color: CATEGORY_COLOR[cat],
                      backgroundColor: CATEGORY_COLOR[cat] + "18",
                    } : undefined}>
                    {cat}
                  </button>
                );
              })}
              <button onClick={toggleCritFilter}
                className="filter-btn"
                style={critActive ? {
                  borderColor: "#ef444499", color: "#ef4444", backgroundColor: "#ef444418",
                } : undefined}>
                CRIT
              </button>
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {isIstanbul && (
              <>
                {/* ALL/DOM/INT grubu — çerçeve içinde */}
                <div className="filter-group">
                  {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                    <button key={f} onClick={() => setRouteFilter(f)}
                      className="filter-btn"
                      style={routeFilter === f ? { borderColor: "rgba(212,168,67,0.6)", color: "#d4a843", backgroundColor: "rgba(212,168,67,0.12)" } : {}}>
                      {f}
                    </button>
                  ))}
                </div>
                <span className="text-border text-xs font-mono">|</span>
              </>
            )}

            {/* Sort grubu */}
            <div className="filter-group">
              {SORT_OPTIONS.map((s) => (
                <button key={s.value} onClick={() => setSortMode(s.value)}
                  className="filter-btn"
                  style={sortMode === s.value ? {
                    borderColor: "rgba(212, 168, 67, 0.6)",
                    color: "#d4a843",
                    backgroundColor: "rgba(212, 168, 67, 0.12)",
                  } : undefined}>
                  {s.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border mx-1" />

            {/* View grubu */}
            <div className="filter-group">
              {VIEW_OPTIONS.map((v) => (
                <button key={v.value} onClick={() => { setView(v.value); setTimeFilters([]); }}
                  className="filter-btn"
                  style={view === v.value ? {
                    borderColor: "rgba(212, 168, 67, 0.6)",
                    color: "#d4a843",
                    backgroundColor: "rgba(212, 168, 67, 0.12)",
                  } : undefined}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {!weatherLoading && allTimeSlots.length > 0 && (
              <div className="relative" ref={timeRef}>
                <button onClick={() => setTimeOpen((o) => !o)}
                  className={`filter-btn flex items-center gap-1.5 ${timeFilters.length > 0 ? "border-primary text-primary bg-primary/10" : ""}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>Timestamp</span>
                  {timeFilters.length > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full text-[9px] font-bold px-1 leading-tight">{timeFilters.length}</span>
                  )}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${timeOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {timeOpen && (
                  <div onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-1 z-[60] bg-card border border-border rounded-lg shadow-lg min-w-[150px] overflow-hidden" style={{ pointerEvents: "auto" }}>
                    {timeFilters.length > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setTimeFilters([]); }}
                        onTouchEnd={(e) => { e.stopPropagation(); setTimeFilters([]); }}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-b border-border/50">
                        Clear selection
                      </button>
                    )}
                    {allTimeSlots.map((slot) => {
                      const selected = timeFilters.includes(slot);
                      return (
                        <button key={slot} onClick={(e) => { e.stopPropagation(); toggleTimeSlot(slot); }}
                          onTouchEnd={(e) => { e.stopPropagation(); toggleTimeSlot(slot); }}
                          className={`w-full text-left px-3 py-2 text-xs font-mono tabular-nums flex items-center justify-between gap-3 transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted"}`}>
                          <span>
                            <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{slot.slice(0, 2)}</span>
                            <span className="font-bold" style={{ color: "hsl(45 90% 50%)" }}>{slot.slice(2, 6)}</span>
                            <span className={`opacity-50 ${selected ? "text-primary" : "text-muted-foreground"}`}>{slot.slice(6)}</span>
                          </span>
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {isFiltered && <div className="w-px h-5" style={{ backgroundColor: "rgba(212,168,67,0.3)" }} />}
            {isFiltered && (
              <button onClick={resetFilters} title="Reset all filters"
                className="filter-btn flex items-center gap-1 text-muted-foreground hover:text-destructive hover:border-destructive/50">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                Reset
              </button>
            )}

          </div>


          {/* ICAO search — sticky on mobile */}
          <div className="sticky top-12 z-30 bg-background py-2 mb-2 sm:mb-3 -mx-3 px-3 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:z-auto">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative flex-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Filter — e.g. LTFH,LTAC"
                  value={icaoSearch}
                  onChange={(e) => setIcaoSearch(e.target.value.toUpperCase().replace(/[^A-Z0-9,\s]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && icaoSearch === "TEST3411TEST55") {
                      window.dispatchEvent(new CustomEvent("test-toggle"));
                      setIcaoSearch("");
                    }
                  }}
                  className={`w-full h-[30px] sm:h-[34px] pl-7 sm:pl-8 pr-6 sm:pr-7 rounded-lg text-[10px] sm:text-xs font-mono border bg-card transition-colors focus:outline-none focus:border-primary ${icaoSearch ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                />
                {icaoSearch && (
                  <button onClick={() => setIcaoSearch("")}
                    className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-sm leading-none">×</button>
                )}
              </div>
              {/* REFRESH — icon on mobile, text on desktop */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh weather data"
                className="filter-btn flex items-center gap-1 sm:gap-1.5 font-bold disabled:opacity-50 flex-shrink-0 transition-all"
                style={{ borderColor: "#38BDF840", color: "#38BDF8", backgroundColor: "#38BDF810" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? "animate-spin" : ""}>
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                <span className="hidden sm:inline">{isRefreshing ? "..." : "REFRESH"}</span>
              </button>
            </div>
          </div>

          {/* Airport count — right-aligned between search and cards */}
          <div className="flex justify-end mb-2 sm:mb-3">
            <span className="text-muted-foreground text-[10px] sm:text-xs font-mono">
              {weatherLoading ? "loading..." : `${displayed.length} airports`}
            </span>
          </div>

          {weatherLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-lg bg-card border border-border overflow-hidden">
                  <Skeleton className="h-32 sm:h-40 rounded-none" />
                </div>
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 sm:p-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted/30 border border-border flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-mono font-bold text-foreground">No airports match current filters</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">Try adjusting your filters or adding more airports to your watchlist.</p>
              </div>
              {isFiltered && (
                <button onClick={resetFilters} className="px-4 py-2 text-xs font-mono font-bold rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
              {displayed.slice(0, 2).map((a) => (
                <WeatherCard key={a.icao} icao={a.icao} rawTaf={a.rawTaf} rawMetar={a.rawMetar} parsed={a.parsed} view={view} />
              ))}
              {/* Sponsor — 2. ve 3. kart arasında */}
              <AdSlot
                slot="monitor-infeed"
                sponsor={{
                  name: "AERO-SENTINEL",
                  url: "#",
                  description: "Premium aviation weather monitoring",
                }}
              />
              {displayed.slice(2, 5).map((a) => (
                <WeatherCard key={a.icao} icao={a.icao} rawTaf={a.rawTaf} rawMetar={a.rawMetar} parsed={a.parsed} view={view} />
              ))}
              {/* Sponsor — 5. ve 6. kart arasında */}
              {displayed.length > 5 && (
                <AdSlot
                  slot="monitor-infeed"
                  sponsor={{
                    name: "AERO-SENTINEL",
                    url: "#",
                    description: "Premium aviation weather monitoring",
                  }}
                />
              )}
              {displayed.slice(5).map((a) => (
                <WeatherCard key={a.icao} icao={a.icao} rawTaf={a.rawTaf} rawMetar={a.rawMetar} parsed={a.parsed} view={view} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FAB — mobile only */}
      <div className="fixed bottom-20 right-4 z-40 sm:hidden">
        <button
          onClick={() => setWatchlistSheetOpen(true)}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <Footer />
    </div>
  );
}

// ── WeatherCard ───────────────────────────────────────────────────────────────

function WeatherCard({ icao, rawTaf, rawMetar, parsed, view }: {
  icao: string; rawTaf: string | null; rawMetar: string | null;
  parsed: ReturnType<typeof parseMetar> | null; view: ViewMode;
}) {
  const metarCat = parsed?.flightCategory ?? FlightCategory.VFR;
  const metarColor = CATEGORY_COLOR[metarCat];
  const tafWorst = parseTafWorstCategory(rawTaf);
  const tafCat = tafWorst ?? metarCat;
  const tafColor = rawTaf ? CATEGORY_COLOR[tafCat] : "hsl(var(--border))";
  const metarBorderColor = rawMetar ? metarColor : "hsl(var(--border))";

  const showLeftStrip = view === "TAF" || view === "BOTH";
  const showRightStrip = view === "METAR" || view === "BOTH";

  const critTaf = rawTaf ? hasCritWx(rawTaf) : false;
  const critMetar = rawMetar ? hasCritWx(rawMetar) : false;
  // CRIT badge also includes extreme wind
  const critAny = airportIsCrit(rawTaf, rawMetar);

  const bothWorst = worstOf(tafCat, metarCat);
  const bothWorstColor = CATEGORY_COLOR[bothWorst];

  const borderStyle: React.CSSProperties = {};
  if (showLeftStrip) { borderStyle.borderLeftWidth = "3px"; borderStyle.borderLeftColor = tafColor; }
  if (showRightStrip) { borderStyle.borderRightWidth = "3px"; borderStyle.borderRightColor = metarBorderColor; }

  // Vertical strip text style — upright letters, top→bottom, 2× readable size
  const stripTextStyle: React.CSSProperties = {
    writingMode: "vertical-lr",
    textOrientation: "upright",
    fontSize: "9px",
    fontFamily: "monospace",
    fontWeight: "700",
    letterSpacing: "0.12em",
    lineHeight: 1,
    userSelect: "none",
  };

  return (
    <Link href={`/airports/${icao}`}
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer flex"
      style={borderStyle}>

      {/* Left strip — TAF */}
      {showLeftStrip && (
        <div className="flex-shrink-0 w-[26px] flex items-center justify-center" style={{ backgroundColor: `${tafColor}12` }}>
          <span style={{ ...stripTextStyle, color: tafColor, opacity: 0.9 }}>TAF</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
          <span className="font-mono font-bold text-xs sm:text-sm tracking-wider inline-flex items-center gap-1.5">
            {icao}
            <IataBadge icao={icao} />
          </span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Single category badge — worst in BOTH mode */}
            {view === "TAF" && rawTaf && tafWorst && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                style={{ color: CATEGORY_COLOR[tafCat], borderColor: `${CATEGORY_COLOR[tafCat]}60`, backgroundColor: `${CATEGORY_COLOR[tafCat]}18` }}>
                {tafCat}
              </span>
            )}
            {view === "METAR" && rawMetar && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                style={{ color: metarColor, borderColor: `${metarColor}60`, backgroundColor: `${metarColor}18` }}>
                {metarCat}
              </span>
            )}
            {view === "BOTH" && (rawTaf || rawMetar) && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                style={{ color: bothWorstColor, borderColor: `${bothWorstColor}60`, backgroundColor: `${bothWorstColor}18` }}>
                {bothWorst}
              </span>
            )}
            {!rawMetar && !rawTaf && (
              <span className="text-xs font-mono text-muted-foreground">NO DATA</span>
            )}
            {/* CRIT badges (wx codes) */}
            {critTaf && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/50 bg-red-400/10">
                CRIT TAF
              </span>
            )}
            {critMetar && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/50 bg-red-400/10">
                CRIT METAR
              </span>
            )}
            {/* Extreme wind included in CRIT, badge only when no wx-code CRIT */}
            {!critTaf && !critMetar && critAny && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-red-400 border-red-400/50 bg-red-400/10">
                CRIT WIND
              </span>
            )}
          </div>
        </div>

        {/* TAF section */}
        {(view === "TAF" || view === "BOTH") && (
          <div className="px-3 py-2.5">
            {rawTaf ? (
              <div className="sm:max-h-36 overflow-hidden sm:overflow-y-auto"><TafText raw={rawTaf} /></div>
            ) : (
              <p className="text-xs font-mono text-muted-foreground italic">Awaiting TAF data...</p>
            )}
          </div>
        )}

        {/* METAR section */}
        {(view === "METAR" || view === "BOTH") && (
          <div className={`px-3 py-2.5 ${view === "BOTH" ? "border-t border-border/60 bg-background/30" : ""}`}>
            {rawMetar ? <div><ColoredRawText raw={rawMetar} /></div> : <p className="text-xs font-mono text-muted-foreground italic">Awaiting METAR...</p>}
          </div>
        )}
      </div>

      {/* Right strip — METAR */}
      {showRightStrip && (
        <div className="flex-shrink-0 w-[26px] flex items-center justify-center" style={{ backgroundColor: `${metarBorderColor}12` }}>
          <span style={{ ...stripTextStyle, color: metarBorderColor, opacity: 0.9 }}>METAR</span>
        </div>
      )}
    </Link>
  );
}
