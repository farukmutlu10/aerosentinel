import { useRef, useState, useEffect, type KeyboardEvent, type DragEvent } from "react";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/context/WatchlistContext";
import { useThemeContext } from "@/App";
import { useQuery } from "@tanstack/react-query";
import { usePersistedState } from "@/hooks/usePersistedState";
import { parseMetar, FlightCategory, CATEGORY_COLOR, analyzeTafWindow, type TafWindowResult } from "@/lib/metarParser";
import { normalizeIcao } from "@/lib/icaoUtils";

type Tab = "analyze" | "watchlist";
type RouteFilter = "ALL" | "DOM" | "INT";
type SortMode = "alpha" | "lifr-first" | "vfr-first";
const ALL_CATS = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];

interface WeatherItem { icao: string; rawTaf: string | null; rawMetar: string | null }

function useWatchlistWeather(icaos: string[]) {
  const key = icaos.join(",");
  return useQuery<WeatherItem[]>({
    queryKey: ["watchlist", "weather", key],
    queryFn: () => fetch(`/api/watchlist/weather?icaos=${key}`).then((r) => r.json()),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
}

// ── Excel parsing ─────────────────────────────────────────────────────────────

export interface FlightRow {
  id: number;
  flightRaw: string;
  flight: string;
  reg: string;
  fromIcao: string;
  toIcao: string;
  sta: string;
  eta: string;
  etaHour: number | null;
}

type ColMap = Record<string, string>;

function findCol(map: ColMap, patterns: string[]): string | undefined {
  const keys = Object.keys(map);
  for (const p of patterns) {
    const key = keys.find((k) => k.toUpperCase().includes(p.toUpperCase()));
    if (key) return key;
  }
  return undefined;
}

function extractFlightNum(raw: string): string {
  const nums = String(raw).match(/\d+/g);
  return nums ? nums.join("") : String(raw).trim();
}

function excelTimeToHHMM(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const mm = (totalMinutes % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  if (/^\d{3,4}$/.test(s)) return `${s.slice(0, -2).padStart(2, "0")}:${s.slice(-2)}`;
  return s;
}

function parseEtaHour(eta: string): number | null {
  const m = eta.match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]);
  return null;
}

function parseExcelFile(file: File): Promise<FlightRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!rows.length) { resolve([]); return; }
        const sample = rows[0] as ColMap;

        const flightCol = findCol(sample, ["FLIGHT NO", "FLIGHT NUMBER", "FLT NO", "FLIGHT"]);
        const regCol = findCol(sample, ["REG", "TAIL", "A/C REG", "AIRCRAFT"]);
        const fromCol = findCol(sample, ["DEP ICAO", "DEP", "FROM ICAO", "ORIGIN ICAO", "ORIG ICAO", "FROM", "ORIG"]);
        const toCol = findCol(sample, ["DEST ICAO", "ARR ICAO", "DEST", "TO ICAO", "DESTINATION ICAO", "TO", "DESTN", "ARR"]);
        const staCol = findCol(sample, ["STA", "SCHED ARR", "SCHEDULED"]);
        const etaCol = findCol(sample, ["ETA", "EST ARR", "ESTIMATED ARR", "ACT ARR", "ACTUAL ARR"]);

        const parsed: FlightRow[] = rows
          .filter((r) => {
            const f = String(r[flightCol ?? ""] ?? "").trim();
            const t = String(r[toCol ?? ""] ?? "").trim();
            return f || t;
          })
          .map((r, idx) => {
            const flightRaw = String(r[flightCol ?? ""] ?? "").trim();
            const flight = flightRaw ? extractFlightNum(flightRaw) : "";
            const reg = String(r[regCol ?? ""] ?? "").trim();
            const fromIcao = String(r[fromCol ?? ""] ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const toIcao = String(r[toCol ?? ""] ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const staRaw = r[staCol ?? ""];
            const etaRaw = r[etaCol ?? ""];
            const sta = excelTimeToHHMM(staRaw);
            const eta = excelTimeToHHMM(etaRaw);
            const etaHour = parseEtaHour(eta || sta);
            return { id: idx, flightRaw, flight, reg, fromIcao, toIcao, sta, eta, etaHour };
          });

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Analysis hook ─────────────────────────────────────────────────────────────

interface AnalysisState {
  tafMap: Record<string, string | null>;
  loading: boolean;
  done: boolean;
  error: string | null;
}

async function fetchTafBatch(icaos: string[]): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  await Promise.allSettled(
    icaos.map(async (icao) => {
      try {
        const r = await fetch(`/api/airports/${icao}/taf`);
        if (r.ok) {
          const d = await r.json();
          results[icao] = d.rawTaf ?? null;
        } else {
          results[icao] = null;
        }
      } catch {
        results[icao] = null;
      }
    })
  );
  return results;
}

// ── Category badge ────────────────────────────────────────────────────────────

function CatBadge({ cat }: { cat: FlightCategory | null }) {
  if (!cat) return <span className="text-[10px] font-mono text-muted-foreground">—</span>;
  const color = CATEGORY_COLOR[cat];
  return (
    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: `${color}50`, backgroundColor: `${color}15` }}>
      {cat}
    </span>
  );
}

function AnalysisCell({ result }: { result: TafWindowResult | null | undefined }) {
  if (result === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  if (result === null) return <span className="text-muted-foreground text-xs font-mono">TAF YOK</span>;
  const { category, visibility, ceiling, critCodes, orangeCodes } = result;
  const codes = [...critCodes, ...orangeCodes.filter((c) => !critCodes.includes(c))].slice(0, 4);
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center gap-1.5 flex-wrap">
        <CatBadge cat={category} />
        {visibility !== null && (
          <span className="text-[10px] font-mono text-muted-foreground">{visibility >= 9999 ? "9999+" : `${visibility}m`}</span>
        )}
        {ceiling !== null && (
          <span className="text-[10px] font-mono text-muted-foreground">C{String(Math.round(ceiling / 100)).padStart(3, "0")}</span>
        )}
      </div>
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {codes.map((code) => (
            <span key={code}
              className="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{
                color: critCodes.includes(code) ? "#ef4444" : "#f97316",
                backgroundColor: critCodes.includes(code) ? "#ef444415" : "#f9731615",
              }}>
              {code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "lifr-first", label: "Worst First" },
  { value: "vfr-first", label: "Best First" },
];

export default function Airports() {
  const { watchedIcaos, effectiveIcaos, addIcao, removeIcao, clearWatchlist, hasFilter } = useWatchlist();
  const { theme, toggleTheme } = useThemeContext();
  const [activeTab, setActiveTab] = usePersistedState<Tab>("as-analyze-tab", "analyze");

  // Watchlist states
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: weatherData, isLoading: weatherLoading } = useWatchlistWeather(effectiveIcaos);
  const [activeCatsArr, setActiveCatsArr] = usePersistedState<string[]>("as-airports-cats", ALL_CATS as string[]);
  const [routeFilter, setRouteFilter] = usePersistedState<RouteFilter>("as-airports-route", "ALL");
  const [sortMode, setSortMode] = usePersistedState<SortMode>("as-airports-sort", "alpha");

  // Analyze states
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({
    tafMap: {}, loading: false, done: false, error: null,
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCats = new Set<FlightCategory>(activeCatsArr as FlightCategory[]);
  const toggleCat = (c: FlightCategory) =>
    setActiveCatsArr((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const handleAdd = () => {
    const codes = inputVal.split(/[,\s]+/).filter(Boolean);
    const skipped: string[] = [];
    codes.forEach((c) => {
      const icao = normalizeIcao(c);
      if (icao.length === 4) addIcao(icao);
      else if (icao.length > 0) skipped.push(c);
    });
    setInputVal(skipped.length > 0 ? skipped.join(",") : "");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Backspace" && inputVal === "" && watchedIcaos.length > 0) removeIcao(watchedIcaos[watchedIcaos.length - 1]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
      .replace(/İ/g, "I").replace(/ı/g, "I")
      .replace(/Ş/g, "S").replace(/ş/g, "S")
      .replace(/Ğ/g, "G").replace(/ğ/g, "G")
      .replace(/Ü/g, "U").replace(/ü/g, "U")
      .replace(/Ö/g, "O").replace(/ö/g, "O")
      .replace(/Ç/g, "C").replace(/ç/g, "C")
      .toUpperCase()
      .replace(/[^A-Z0-9,\s]/g, "");
    setInputVal(val);
  };

  const enriched = effectiveIcaos.map((icao) => {
    const w = weatherData?.find((d) => d.icao === icao);
    const parsed = w?.rawMetar ? parseMetar(w.rawMetar) : null;
    return { icao, rawMetar: w?.rawMetar ?? null, rawTaf: w?.rawTaf ?? null, parsed };
  });

  const displayedWatchlist = (() => {
    let list = enriched;
    list = list.filter((a) => activeCats.has(a.parsed?.flightCategory ?? FlightCategory.VFR));
    if (routeFilter === "DOM") list = list.filter((a) => a.icao.startsWith("LT"));
    else if (routeFilter === "INT") list = list.filter((a) => !a.icao.startsWith("LT"));
    const sorted = [...list];
    if (sortMode === "alpha") {
      sorted.sort((a, b) => a.icao.localeCompare(b.icao));
    } else {
      const order = sortMode === "lifr-first"
        ? [FlightCategory.LIFR, FlightCategory.IFR, FlightCategory.MVFR, FlightCategory.VFR]
        : [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
      sorted.sort((a, b) => {
        const ai = order.indexOf(a.parsed?.flightCategory ?? FlightCategory.VFR);
        const bi = order.indexOf(b.parsed?.flightCategory ?? FlightCategory.VFR);
        return ai !== bi ? ai - bi : a.icao.localeCompare(b.icao);
      });
    }
    return sorted;
  })();

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError("Desteklenen format: .xlsx, .xls, .csv");
      return;
    }
    setParseError(null);
    setFileName(file.name);
    setAnalysis({ tafMap: {}, loading: false, done: false, error: null });
    try {
      const rows = await parseExcelFile(file);
      setFlights(rows);
      if (rows.length === 0) {
        setParseError("Dosyada uçuş verisi bulunamadı veya sütun adları tanınamadı.");
        return;
      }
      // Auto-run analysis
      const uniqueIcaos = [...new Set(rows.map((r) => r.toIcao).filter((x) => x.length >= 3 && x.length <= 4))];
      setAnalysis((prev) => ({ ...prev, loading: true }));
      const tafMap = await fetchTafBatch(uniqueIcaos);
      setAnalysis({ tafMap, loading: false, done: true, error: null });
    } catch (err) {
      setParseError("Dosya ayrıştırılamadı: " + String(err));
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const clearAnalysis = () => {
    setFlights([]);
    setFileName(null);
    setAnalysis({ tafMap: {}, loading: false, done: false, error: null });
    setParseError(null);
  };

  const analysisResults: (TafWindowResult | null)[] = flights.map((f) => {
    if (!analysis.done) return undefined as unknown as null;
    const rawTaf = analysis.tafMap[f.toIcao] ?? null;
    if (f.etaHour === null) return null;
    if (!rawTaf) return null;
    return analyzeTafWindow(rawTaf, f.etaHour);
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-border pb-0">
          <button
            onClick={() => setActiveTab("analyze")}
            className={`px-4 py-2 text-xs font-mono font-bold tracking-wider rounded-t border-b-2 transition-colors ${
              activeTab === "analyze"
                ? "text-emerald-400 border-emerald-400 bg-emerald-400/5"
                : "text-muted-foreground border-transparent hover:text-emerald-400/70"
            }`}>
            UÇUŞ ANALİZİ
          </button>
          <button
            onClick={() => setActiveTab("watchlist")}
            className={`px-4 py-2 text-xs font-mono font-bold tracking-wider rounded-t border-b-2 transition-colors ${
              activeTab === "watchlist"
                ? "text-sky-400 border-sky-400 bg-sky-400/5"
                : "text-muted-foreground border-transparent hover:text-sky-400/70"
            }`}>
            WATCHLIST
          </button>
        </div>

        {/* ── ANALYZE TAB ── */}
        {activeTab === "analyze" && (
          <div className="space-y-5">
            {/* Upload area */}
            {flights.length === 0 && (
              <div
                className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? "border-emerald-400/60 bg-emerald-400/5"
                    : "border-border hover:border-emerald-400/40 hover:bg-emerald-400/3"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-mono font-bold text-foreground">Excel dosyasını yükle</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">Sürükle-bırak veya tıkla · .xlsx .xls .csv</p>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                    Gerekli sütunlar: Flight · Reg · From ICAO · To ICAO · STA · ETA
                  </p>
                </div>
              </div>
            )}

            {parseError && (
              <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 text-sm font-mono text-red-400">
                {parseError}
              </div>
            )}

            {/* File loaded + analysis */}
            {flights.length > 0 && (
              <>
                {/* File info bar */}
                <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-muted-foreground">{fileName}</span>
                    <span className="text-emerald-400 font-bold">{flights.length} uçuş</span>
                    {analysis.loading && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                        TAF çekiliyor...
                      </span>
                    )}
                    {analysis.done && <span className="text-emerald-400">✓ TAF analizi tamamlandı</span>}
                  </div>
                  <button
                    onClick={clearAnalysis}
                    className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Temizle
                  </button>
                </div>

                {/* Flight table */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider whitespace-nowrap">#FLIGHT</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">REG</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">FROM</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">TO</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">STA</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">ETA</th>
                        <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider min-w-[160px]">TAF ANALİZİ (ETA±1h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flights.map((f, idx) => {
                        const result = analysisResults[idx];
                        const cat = (result as TafWindowResult | null | undefined)?.category;
                        const rowBg = cat === FlightCategory.LIFR ? "bg-purple-500/5" :
                                      cat === FlightCategory.IFR ? "bg-red-500/5" :
                                      cat === FlightCategory.MVFR ? "bg-blue-500/5" : "";
                        return (
                          <tr key={f.id} className={`border-b border-border/60 last:border-b-0 hover:bg-muted/20 transition-colors ${rowBg}`}>
                            <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{f.flight || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{f.reg || "—"}</td>
                            <td className="px-3 py-2.5">
                              {f.fromIcao ? (
                                <Link href={`/airports/${f.fromIcao}`} className="text-sky-400 hover:underline">{f.fromIcao}</Link>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              {f.toIcao ? (
                                <Link href={`/airports/${f.toIcao}`} className="text-sky-400 hover:underline">{f.toIcao}</Link>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{f.sta || "—"}</td>
                            <td className="px-3 py-2.5 font-bold tabular-nums"
                              style={{ color: f.eta ? "hsl(45 90% 50%)" : undefined }}>
                              {f.eta || (f.sta ? <span className="opacity-50">{f.sta}</span> : "—")}
                            </td>
                            <td className="px-3 py-2.5">
                              {analysis.loading ? (
                                <span className="text-muted-foreground animate-pulse">...</span>
                              ) : (
                                <AnalysisCell result={result as TafWindowResult | null | undefined} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Upload new file button */}
                <button
                  onClick={() => { clearAnalysis(); setTimeout(() => fileInputRef.current?.click(), 50); }}
                  className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Farklı dosya yükle
                </button>

                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
              </>
            )}
          </div>
        )}

        {/* ── WATCHLIST TAB ── */}
        {activeTab === "watchlist" && (
          <div className="space-y-5">
            {/* Watchlist input */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  WATCHLIST — Monitored Airports
                </label>
                {hasFilter && (
                  <button onClick={clearWatchlist} className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors">
                    Clear All
                  </button>
                )}
              </div>
              <div
                className="flex flex-wrap items-center gap-1.5 min-h-[42px] bg-background border border-input rounded-md px-2 py-1.5 cursor-text focus-within:border-primary transition-colors"
                onClick={() => inputRef.current?.focus()}>
                {watchedIcaos.map((icao) => (
                  <span key={icao} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold">
                    {icao}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeIcao(icao); }}
                      className="text-primary/60 hover:text-primary transition-colors leading-none">✕</button>
                  </span>
                ))}
                <input ref={inputRef} type="text" value={inputVal}
                  onChange={handleInputChange} onKeyDown={handleKeyDown}
                  placeholder={watchedIcaos.length === 0 ? "ICAO kodunu gir ve Enter'a bas — örn: LTFJ,LTAC,LTFM" : "Ekle (virgülle ayır)..."}
                  className="flex-1 min-w-[200px] bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
                />
                {inputVal.replace(/[,\s]/g, "").length >= 4 && (
                  <button type="button" onClick={handleAdd}
                    className="px-2 py-0.5 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">
                    ADD
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-2">
                {hasFilter
                  ? <span className="text-sky-400">{watchedIcaos.length} meydan izleniyor — sadece bu tarayıcıda.</span>
                  : <span>Watchlist boş — varsayılan <span className="text-primary font-bold">LTFH</span> gösteriliyor. 4 harfli ICAO kodu ekleyebilirsin.</span>
                }
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {ALL_CATS.map((cat) => (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                    style={activeCats.has(cat) ? {
                      borderColor: CATEGORY_COLOR[cat] + "99",
                      color: CATEGORY_COLOR[cat],
                      backgroundColor: CATEGORY_COLOR[cat] + "18",
                    } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                    {cat}
                  </button>
                ))}
              </div>
              <span className="text-border text-xs">|</span>
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
                {(["ALL", "DOM", "INT"] as RouteFilter[]).map((f) => (
                  <button key={f} onClick={() => setRouteFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${routeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-border text-xs">|</span>
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
                {SORT_OPTIONS.map((s) => (
                  <button key={s.value} onClick={() => setSortMode(s.value)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${sortMode === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="text-muted-foreground text-xs font-mono ml-auto">
                {weatherLoading ? "loading..." : `${displayedWatchlist.length} airports`}
              </span>
            </div>

            {/* Grid */}
            {weatherLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {[...Array(12)].map((_, i) => <div key={i} className="h-28 rounded-lg bg-card animate-pulse border border-border" />)}
              </div>
            ) : displayedWatchlist.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <p className="text-muted-foreground font-mono text-sm">No airports match current filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {displayedWatchlist.map(({ icao, rawMetar, parsed }) => {
                  const cat = parsed?.flightCategory ?? null;
                  const catColor = cat ? CATEGORY_COLOR[cat] : undefined;
                  const isDom = icao.startsWith("LT");
                  return (
                    <Link key={icao} href={`/airports/${icao}`}
                      className="block bg-card rounded-lg border border-border hover:border-foreground/20 transition-all cursor-pointer overflow-hidden"
                      style={catColor ? { borderLeftWidth: "3px", borderLeftColor: catColor } : undefined}>
                      <div className="px-3 py-3">
                        <div className="flex items-start justify-between mb-2 gap-1">
                          <span className="font-mono font-bold text-sm leading-tight">{icao}</span>
                          <div className="flex flex-col items-end gap-1">
                            {isDom && <span className="text-[9px] font-mono text-muted-foreground">DOM</span>}
                            {cat && <span className="text-[9px] font-mono font-bold" style={{ color: catColor }}>{cat}</span>}
                          </div>
                        </div>
                        {rawMetar ? (
                          <div className="space-y-0.5">
                            {parsed?.cavok ? (
                              <div className="text-[10px] font-mono text-green-400">CAVOK</div>
                            ) : (
                              <>
                                {parsed?.visibility != null && (
                                  <div className="text-[10px] font-mono">
                                    <span className="text-muted-foreground">V </span>
                                    <span style={{ color: parsed.visibility < 1600 ? "#a855f7" : parsed.visibility < 4800 ? "#ef4444" : undefined }}>
                                      {parsed.visibility >= 9999 ? "9999+" : parsed.visibility}m
                                    </span>
                                  </div>
                                )}
                                {parsed?.ceiling && (
                                  <div className="text-[10px] font-mono">
                                    <span className="text-muted-foreground">C </span>
                                    <span style={{ color: parsed.ceiling.feet < 500 ? "#a855f7" : parsed.ceiling.feet < 1000 ? "#ef4444" : undefined }}>
                                      {parsed.ceiling.type}{String(parsed.ceiling.feet / 100).padStart(3, "0")}
                                    </span>
                                  </div>
                                )}
                                {parsed?.wind && (
                                  <div className="text-[10px] font-mono">
                                    <span className="text-muted-foreground">W </span>
                                    <span style={{ color: parsed.wind.dangerColor }}>{parsed.wind.raw}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground font-mono">awaiting...</div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
