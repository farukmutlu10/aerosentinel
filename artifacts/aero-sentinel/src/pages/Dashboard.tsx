import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetMonitorStatus, getGetMonitorStatusQueryKey,
} from "@workspace/api-client-react";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { TafText } from "@/components/TafText";
import { ColoredRawText } from "@/components/ColoredRawText";
import { ClockBadge } from "@/components/ClockDisplay";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { usePersistedState } from "@/hooks/usePersistedState";
import { normalizeIcao } from "@/lib/icaoUtils";
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
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: WEATHER_KEY(key) });
  return { ...query, refresh };
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "lifr-first", label: "Worst First" },
  { value: "vfr-first", label: "Best First" },
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // v2 key — avoids stale localStorage with old format (without CRIT)
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-dash-cats-v2", DEFAULT_CATS);
  const [view, setView] = usePersistedState<ViewMode>("as-dash-view", DEFAULT_VIEW);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-dash-route", DEFAULT_ROUTE);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-dash-sort", DEFAULT_SORT);
  const [timeFilters, setTimeFilters] = usePersistedState<string[]>("as-dash-time-multi", []);
  const [icaoSearch, setIcaoSearch] = usePersistedState<string>("as-dash-icao-search", "");
  const [watchlistOpen, setWatchlistOpen] = usePersistedState<boolean>("as-dash-watchlist-open", true);
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);
  const [wlInput, setWlInput] = useState("");
  const wlInputRef = useRef<HTMLInputElement>(null);

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
      const icao = normalizeIcao(c);
      if (icao.length === 4) addIcao(icao);
      else if (icao.length > 0) skipped.push(c);
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
      .toUpperCase().replace(/[^A-Z0-9,\s]/g, "");
    setWlInput(val);
  };

  useEffect(() => {
    if (!timeOpen) return;
    const handler = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setTimeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [timeOpen]);

  const { data: monitor } = useGetMonitorStatus({
    query: { queryKey: getGetMonitorStatusQueryKey(), refetchInterval: 30_000 },
  });
  const { data: weatherData, isLoading: weatherLoading, refresh: refreshWeather } = useWatchlistWeather(effectiveIcaos);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshWeather();
    setTimeout(() => setIsRefreshing(false), 600);
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
        const critCodes = [...RED_WX].filter((code) => {
          const esc = code.replace(/[+]/g, "\\+");
          return new RegExp(`(?:^|\\s)${esc}(?=\\s|$)`).test(w.rawMetar ?? "");
        });
        const windAlert = hasBadgeWind(w.rawMetar) || hasBadgeWind(w.rawTaf);
        const body = [
          critCodes.length ? critCodes.slice(0, 5).join(", ") : windAlert ? "EXTREME WIND" : "Critical condition",
          (w.rawMetar ?? "").slice(0, 120),
        ].filter(Boolean).join("\n");
        try {
          const n = new Notification(`⚠ CRITICAL — ${w.icao}`, {
            body,
            icon: `${import.meta.env.BASE_URL}ajet-logo.jpeg`,
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5 space-y-3">

        {/* Monitor bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
            <span className="text-muted-foreground tracking-widest">MONITOR</span>
            <span className={monitorData?.running ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
              {monitorData?.running ? "ACTIVE" : "STOPPED"}
            </span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">SCANS TODAY</span>
            <span className="tabular-nums">{monitorData?.scanCountToday ?? monitorData?.scanCount ?? 0}</span>
            {watchedIcaos.length > 0 && (
              <><span className="text-border">|</span>
              <span className="text-sky-400">WATCHLIST {watchedIcaos.length}</span></>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-mono">INTERVAL: 60s</span>
            <ClockBadge />
          </div>
        </div>

        {/* Collapsible watchlist */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setWatchlistOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-sky-400 tracking-widest">WATCHED AIRPORTS</span>
              <span className="text-muted-foreground">
                {watchedIcaos.length > 0 ? `${watchedIcaos.length} airports` : "default: LTFH"}
              </span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-muted-foreground transition-transform duration-200 ${watchlistOpen ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {watchlistOpen && (
            <div className="border-t border-border/60 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">WATCHLIST — Monitored Airports</span>
                {hasFilter && (
                  <button onClick={clearWatchlist} className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors">Clear All</button>
                )}
              </div>
              <div
                className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
                onClick={() => wlInputRef.current?.focus()}
              >
                {watchedIcaos.map((icao) => (
                  <span key={icao} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold">
                    {icao}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                      className="text-primary/60 hover:text-primary transition-colors leading-none">✕</button>
                  </span>
                ))}
                <input ref={wlInputRef} type="text" value={wlInput}
                  onChange={handleWlInputChange} onKeyDown={handleWlKeyDown}
                  placeholder={watchedIcaos.length === 0 ? "Enter ICAO and press Enter — e.g. LTFJ,LTAC,LTFM" : "Add (comma-separated)..."}
                  className="flex-1 min-w-[200px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
                />
                {wlInput.replace(/[,\s]/g, "").length >= 4 && (
                  <button type="button" onClick={handleWlAdd}
                    className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">ADD</button>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-2">
                {hasFilter
                  ? <span className="text-sky-400">{watchedIcaos.length} airports monitored — this browser only.</span>
                  : <span>Watchlist empty — showing default <span className="text-primary font-bold">LTFH</span>. Add any 4-letter ICAO code.</span>}
              </p>
            </div>
          )}
        </div>

        {/* Airport Weather Section */}
        <section>
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Category filters — all same toggle logic */}
            <div className="flex items-center gap-1">
              {ALL_CATS.map((cat) => {
                const isActive = activeCats.has(cat);
                return (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                    style={isActive ? {
                      borderColor: CATEGORY_COLOR[cat] + "99",
                      color: CATEGORY_COLOR[cat],
                      backgroundColor: CATEGORY_COLOR[cat] + "18",
                    } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                    {cat}
                  </button>
                );
              })}
              {/* CRIT — same toggle logic: active = crit shown, inactive = crit hidden */}
              <button onClick={toggleCritFilter}
                className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                style={critActive ? {
                  borderColor: "#ef444499", color: "#ef4444", backgroundColor: "#ef444418",
                } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                CRIT
              </button>
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* DOM/INT */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                <button key={f} onClick={() => setRouteFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* Sort */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {SORT_OPTIONS.map((s) => (
                <button key={s.value} onClick={() => setSortMode(s.value)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* View */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {VIEW_OPTIONS.map((v) => (
                <button key={v.value} onClick={() => { setView(v.value); setTimeFilters([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${view === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className="text-border text-xs font-mono">|</span>

            {/* TIME multi-select */}
            {!weatherLoading && allTimeSlots.length > 0 && (
              <div className="relative" ref={timeRef}>
                <button onClick={() => setTimeOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${timeFilters.length > 0 ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  TIME
                  {timeFilters.length > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full text-[9px] font-bold px-1 leading-tight">{timeFilters.length}</span>
                  )}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${timeOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {timeOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg min-w-[150px] overflow-hidden">
                    {timeFilters.length > 0 && (
                      <button onClick={() => setTimeFilters([])}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-b border-border/50">
                        Clear selection
                      </button>
                    )}
                    {allTimeSlots.map((slot) => {
                      const selected = timeFilters.includes(slot);
                      return (
                        <button key={slot} onClick={() => toggleTimeSlot(slot)}
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

            {isFiltered && (
              <button onClick={resetFilters} title="Reset all filters"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                Reset
              </button>
            )}

            <span className="text-muted-foreground text-xs font-mono ml-auto">
              {weatherLoading ? "loading..." : `${displayed.length} airports`}
            </span>
          </div>

          {/* ICAO search + REFRESH (same height) */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Filter airports — e.g. LTFH,LTAC,LTFJ or LTFH LTAC LTFJ"
                value={icaoSearch}
                onChange={(e) => setIcaoSearch(e.target.value.toUpperCase().replace(/[^A-Z0-9,\s]/g, ""))}
                className={`w-full h-[34px] pl-8 pr-7 rounded-lg text-xs font-mono border bg-card transition-colors focus:outline-none focus:border-primary ${icaoSearch ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
              />
              {icaoSearch && (
                <button onClick={() => setIcaoSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-sm leading-none">×</button>
              )}
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh weather data"
              className="h-[34px] flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-mono font-bold border transition-all disabled:opacity-50 flex-shrink-0"
              style={{ borderColor: "#38BDF840", color: "#38BDF8", backgroundColor: "#38BDF810" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? "animate-spin" : ""}>
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              {isRefreshing ? "..." : "REFRESH"}
            </button>
          </div>

          {weatherLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-lg bg-card animate-pulse border border-border" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground font-mono text-sm">No airports match current filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map((a) => (
                <WeatherCard key={a.icao} icao={a.icao} rawTaf={a.rawTaf} rawMetar={a.rawMetar} parsed={a.parsed} view={view} />
              ))}
            </div>
          )}
        </section>
      </main>
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
          <span className="font-mono font-bold text-base tracking-wider">{icao}</span>
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
          <div className="px-3 py-3">
            {rawTaf ? (
              <div className="max-h-36 overflow-y-auto"><TafText raw={rawTaf} /></div>
            ) : (
              <p className="text-xs font-mono text-muted-foreground italic">Awaiting TAF data...</p>
            )}
          </div>
        )}

        {/* METAR section */}
        {(view === "METAR" || view === "BOTH") && (
          <div className={`px-3 py-3 ${view === "BOTH" ? "border-t border-border/60 bg-background/30" : ""}`}>
            {rawMetar ? <ColoredRawText raw={rawMetar} /> : <p className="text-xs font-mono text-muted-foreground italic">Awaiting METAR...</p>}
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
