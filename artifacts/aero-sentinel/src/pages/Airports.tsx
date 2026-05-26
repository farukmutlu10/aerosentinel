import { useRef, useState, useEffect, useMemo, type KeyboardEvent, type DragEvent } from "react";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { useThemeContext } from "@/App";
import { parseMetar, FlightCategory, CATEGORY_COLOR, analyzeTafWindow, type TafWindowResult } from "@/lib/metarParser";

// ── Excel parsing ─────────────────────────────────────────────────────────────

export interface FlightRow {
  id: number;
  flightRaw: string;
  flight: string;
  reg: string;
  fromIcao: string;
  toIcao: string;
  etd: string;
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
    // Excel serial time: fraction of a day
    const totalMinutes = Math.floor(((val % 1) + 1) % 1 * 24 * 60 + 0.5);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  // HH:MM or H:MM
  const m1 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m1) return `${m1[1].padStart(2, "0")}:${m1[2]}`;
  // HHMM
  if (/^\d{3,4}$/.test(s)) return `${s.slice(0, -2).padStart(2, "0")}:${s.slice(-2)}`;
  return s;
}

function parseEtaHour(eta: string): number | null {
  const m = eta.match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]) % 24;
  return null;
}

/** Split a search string by commas and whitespace into non-empty tokens */
function splitTokens(s: string): string[] {
  return s.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * Strip 2-letter country prefix + optional dash from a registration or flight term.
 * "TC-OHV" → "OHV", "TCAYT" → "AYT", "XX-3205" → "3205", "TK3205" → "3205"
 */
function stripPrefix(s: string): string {
  return s.replace(/^[A-Za-z]{2}-?/, "").trim();
}

// Keywords to detect the header row (any match is enough)
const HEADER_KEYWORDS = [
  "FLIGHT", "FLT", "SEFER",
  "REG", "TAIL",
  "ICAO", "DEP", "FROM", "TO", "DEST", "ORIG",
  "ETD", "ETA", "STA", "STD",
];

function scoreHeaderRow(row: unknown[]): number {
  let score = 0;
  for (const cell of row) {
    const v = String(cell ?? "").trim().toUpperCase();
    if (!v) continue;
    for (const kw of HEADER_KEYWORDS) {
      if (v.includes(kw)) { score++; break; }
    }
  }
  return score;
}

function parseExcelFile(file: File): Promise<FlightRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        // Read as raw 2D array to locate the real header row
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!raw.length) { resolve([]); return; }

        // Scan first 40 rows — pick the one with most header keyword hits
        let bestRow = 0;
        let bestScore = 0;
        const scanLimit = Math.min(40, raw.length);
        for (let i = 0; i < scanLimit; i++) {
          const s = scoreHeaderRow(raw[i]);
          if (s > bestScore) { bestScore = s; bestRow = i; }
        }

        // Build column name → index map from the detected header row
        const headerRow = raw[bestRow];
        const colIndex: Record<string, number> = {};
        headerRow.forEach((cell, idx) => {
          const v = String(cell ?? "").trim();
          if (v) colIndex[v] = idx;
        });

        // Helper: find first matching column index
        const findIdx = (patterns: string[]): number | undefined => {
          const keys = Object.keys(colIndex);
          for (const p of patterns) {
            const key = keys.find((k) => k.toUpperCase().includes(p.toUpperCase()));
            if (key !== undefined) return colIndex[key];
          }
          return undefined;
        };

        const flightIdx = findIdx(["FLIGHT NO", "FLIGHT NUMBER", "FLT NO", "SEFER NO", "SEFER", "FLIGHT", "FLT"]);
        const regIdx    = findIdx(["REG", "TAIL", "A/C REG", "AIRCRAFT", "KUYRUK", "TESCIL"]);
        const fromIdx   = findIdx(["FROM (S) ICAO", "FROM S ICAO", "DEP ICAO", "FROM ICAO", "ORIGIN ICAO", "ORIG ICAO", "KALKIŞ ICAO", "KALKIS ICAO", "DEP", "FROM", "ORIG", "KALKIŞ", "KALKIS"]);
        const toIdx     = findIdx(["TO (S) ICAO", "TO S ICAO", "DEST ICAO", "ARR ICAO", "TO ICAO", "DESTINATION ICAO", "VARIŞ ICAO", "VARIS ICAO", "DEST", "TO", "ARR", "DESTN", "VARIŞ", "VARIS"]);
        const etdIdx    = findIdx(["ETD", "EST DEP", "ESTIMATED DEP", "STD", "DEP TIME", "KALKIŞ SAATİ", "STA", "SCHED ARR", "SCHEDULED ARR"]);
        const etaIdx    = findIdx(["ETA", "EST ARR", "ESTIMATED ARR", "ACT ARR", "ACTUAL ARR", "BT ARR", "BLOK ARR", "TAHMINI VARIŞ"]);

        const getCell = (row: unknown[], idx: number | undefined): unknown =>
          idx !== undefined ? row[idx] : "";

        // Data rows start right after the header row
        const parsed: FlightRow[] = raw
          .slice(bestRow + 1)
          .filter((row) => {
            const f = String(getCell(row, flightIdx) ?? "").trim();
            const t = String(getCell(row, toIdx) ?? "").trim();
            return f || t;
          })
          .map((row, idx) => {
            const flightRaw = String(getCell(row, flightIdx) ?? "").trim();
            const flight    = flightRaw ? extractFlightNum(flightRaw) : "";
            const regRaw    = String(getCell(row, regIdx) ?? "").trim();
            // Strip 2-letter country prefix + optional dash: "TC-OHV" → "OHV", "TCAYT" → "AYT"
            const reg       = regRaw.replace(/^[A-Za-z]{2}-?/, "").trim();
            const fromIcao  = String(getCell(row, fromIdx) ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const toIcao    = String(getCell(row, toIdx) ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const etd       = excelTimeToHHMM(getCell(row, etdIdx));
            const eta       = excelTimeToHHMM(getCell(row, etaIdx));
            const etaHour   = parseEtaHour(eta || etd);
            return { id: idx, flightRaw, flight, reg, fromIcao, toIcao, etd, eta, etaHour };
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
  if (icaos.length === 0) return {};
  const results: Record<string, string | null> = {};
  const BATCH = 20;
  for (let i = 0; i < icaos.length; i += BATCH) {
    const batch = icaos.slice(i, i + BATCH);
    try {
      const r = await fetch(`/api/watchlist/weather?icaos=${batch.join(",")}`);
      if (r.ok) {
        const data: Array<{ icao: string; rawTaf: string | null }> = await r.json();
        for (const item of data) results[item.icao] = item.rawTaf ?? null;
      } else {
        for (const icao of batch) results[icao] = null;
      }
    } catch {
      for (const icao of batch) results[icao] = null;
    }
  }
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
  if (result === undefined) return <span className="text-muted-foreground text-xs font-mono">—</span>;
  if (result === null) return <span className="text-[10px] font-mono text-muted-foreground/60">NO TAF</span>;
  const { category, visibility, ceiling, critCodes, orangeCodes } = result;
  // All significant wx codes → orange
  const allCodes = [...new Set([...critCodes, ...orangeCodes])].slice(0, 5);
  const hasWeather = allCodes.length > 0 || (visibility !== null && visibility < 9999) || (ceiling !== null && ceiling < 3000);
  if (!hasWeather && category === FlightCategory.VFR) {
    return <span className="text-[10px] font-mono text-muted-foreground/50">VFR</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-[120px]">
      <CatBadge cat={category} />
      {/* Visibility — purple when low */}
      {visibility !== null && visibility < 9999 && (
        <span className="text-[11px] font-mono font-bold"
          style={{ color: "#a855f7" }}>
          {String(visibility).padStart(4, "0")}
        </span>
      )}
      {/* Ceiling — shown when below 3000ft */}
      {ceiling !== null && ceiling < 3000 && (
        <span className="text-[10px] font-mono" style={{ color: "#a855f7", opacity: 0.75 }}>
          C{String(Math.round(ceiling / 100)).padStart(3, "0")}
        </span>
      )}
      {/* Wx codes — all orange */}
      {allCodes.map((code) => (
        <span key={code}
          className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded"
          style={{ color: "#f97316", backgroundColor: "#f9731618" }}>
          {code}
        </span>
      ))}
    </div>
  );
}

// ── Column filter dropdown ────────────────────────────────────────────────────

interface ColFilterProps {
  label: string;
  allValues: string[];
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}

function ColFilterDropdown({ label, allValues, selected, onChange }: ColFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const searchTokens = splitTokens(search).map((t) => stripPrefix(t).toLowerCase());
  const filtered = allValues.filter((v) => {
    if (searchTokens.length === 0) return true;
    const lv = v.toLowerCase();
    return searchTokens.some((t) => lv.includes(t));
  });
  const isAllSelected = selected.size === 0;
  const isActive = selected.size > 0;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // If all items checked, clear (= select all)
    onChange(next.size === allValues.length ? new Set<string>() : next);
  };

  const selectAll = () => onChange(new Set<string>());

  const isChecked = (v: string) => selected.size === 0 ? true : selected.has(v);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Filter by ${label}`}
        className={`ml-1.5 p-0.5 rounded transition-colors ${isActive ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl w-52 flex flex-col overflow-hidden"
          style={{ maxHeight: "280px" }}>
          {/* Search */}
          <div className="p-2 border-b border-border/50">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label}...`}
              autoFocus
              className="w-full px-2 py-1 text-xs font-mono border border-border rounded bg-background focus:outline-none focus:border-primary"
            />
          </div>
          {/* Select All */}
          <div className="border-b border-border/50">
            <button
              onClick={selectAll}
              className="w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-muted flex items-center gap-2 transition-colors"
            >
              <div className={`w-3 h-3 border rounded flex-shrink-0 flex items-center justify-center ${isAllSelected ? "bg-primary border-primary" : "border-border"}`}>
                {isAllSelected && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span className={isAllSelected ? "text-foreground font-medium" : "text-muted-foreground"}>Select All</span>
            </button>
          </div>
          {/* Values */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground px-2.5 py-2">No matches</p>
            ) : filtered.map((v) => {
              const checked = isChecked(v);
              return (
                <button key={v} onClick={() => toggle(v)}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-muted flex items-center gap-2 transition-colors">
                  <div className={`w-3 h-3 border rounded flex-shrink-0 flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-border"}`}>
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <span className={checked ? "text-foreground" : "text-muted-foreground"}>{v}</span>
                </button>
              );
            })}
          </div>
          {/* Clear */}
          {isActive && (
            <div className="p-2 border-t border-border/50">
              <button onClick={selectAll} className="w-full text-xs font-mono text-primary hover:underline text-center">
                Clear filter ({selected.size} selected)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Airports() {
  const { theme, toggleTheme } = useThemeContext();

  // Analyze states
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({
    tafMap: {}, loading: false, done: false, error: null,
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Column filters
  const [filterFlight, setFilterFlight] = useState<Set<string>>(new Set());
  const [filterReg, setFilterReg] = useState<Set<string>>(new Set());
  const [filterFrom, setFilterFrom] = useState<Set<string>>(new Set());
  const [filterTo, setFilterTo] = useState<Set<string>>(new Set());

  // Unique column values for dropdown filters
  const allFlightNums = useMemo(() =>
    [...new Set(flights.map((f) => f.flight).filter(Boolean))].sort(), [flights]);
  const allRegs = useMemo(() =>
    [...new Set(flights.map((f) => f.reg).filter(Boolean))].sort(), [flights]);
  const allFromIcaos = useMemo(() =>
    [...new Set(flights.map((f) => f.fromIcao).filter(Boolean))].sort(), [flights]);
  const allToIcaos = useMemo(() =>
    [...new Set(flights.map((f) => f.toIcao).filter(Boolean))].sort(), [flights]);

  // Filtered flights
  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      if (filterFlight.size > 0 && !filterFlight.has(f.flight)) return false;
      if (filterReg.size > 0 && !filterReg.has(f.reg)) return false;
      if (filterFrom.size > 0 && !filterFrom.has(f.fromIcao)) return false;
      if (filterTo.size > 0 && !filterTo.has(f.toIcao)) return false;
      return true;
    });
  }, [flights, filterFlight, filterReg, filterFrom, filterTo]);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError("Unsupported format. Supported: .xlsx, .xls, .csv");
      return;
    }
    setParseError(null);
    setFileName(file.name);
    setAnalysis({ tafMap: {}, loading: false, done: false, error: null });
    setFilterFlight(new Set());
    setFilterReg(new Set());
    setFilterFrom(new Set());
    setFilterTo(new Set());
    try {
      const rows = await parseExcelFile(file);
      setFlights(rows);
      if (rows.length === 0) {
        setParseError("No flight data found in file or column names not recognised.");
        return;
      }
      // Auto-run TAF analysis
      const uniqueIcaos = [...new Set(rows.map((r) => r.toIcao).filter((x) => x.length === 4))];
      setAnalysis((prev) => ({ ...prev, loading: true }));
      const tafMap = await fetchTafBatch(uniqueIcaos);
      setAnalysis({ tafMap, loading: false, done: true, error: null });
    } catch (err) {
      setParseError("Failed to parse file: " + String(err));
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
    setFilterFlight(new Set());
    setFilterReg(new Set());
    setFilterFrom(new Set());
    setFilterTo(new Set());
  };

  const analysisResults: (TafWindowResult | null | undefined)[] = filteredFlights.map((f) => {
    if (!analysis.done) return undefined;
    const rawTaf = analysis.tafMap[f.toIcao] ?? null;
    if (f.etaHour === null) return null;
    if (!rawTaf) return null;
    return analyzeTafWindow(rawTaf, f.etaHour);
  });

  const hasActiveFilter = filterFlight.size > 0 || filterReg.size > 0 || filterFrom.size > 0 || filterTo.size > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-5 border-b border-border pb-3">
          <span className="text-xs font-mono font-bold text-emerald-400 tracking-widest uppercase border-b-2 border-emerald-400 pb-2 -mb-3">
            FLIGHT ANALYSIS
          </span>
          {flights.length > 0 && (
            <span className="text-xs font-mono text-muted-foreground ml-auto">
              {filteredFlights.length} / {flights.length} flights
              {hasActiveFilter && (
                <button onClick={() => { setFilterFlight(new Set()); setFilterReg(new Set()); setFilterFrom(new Set()); setFilterTo(new Set()); }}
                  className="ml-2 text-primary hover:underline">clear filters</button>
              )}
            </span>
          )}
        </div>

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
                  <p className="text-sm font-mono font-bold text-foreground">Upload Excel flight plan</p>
                  <p className="text-xs font-mono text-muted-foreground mt-1">Drag & drop or click · .xlsx .xls .csv</p>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                  Required columns: Flight · Reg · From (S) ICAO · To (S) ICAO · ETD · ETA
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
                  <span className="text-emerald-400 font-bold">{flights.length} flights</span>
                  {analysis.loading && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Fetching TAF data...
                    </span>
                  )}
                  {analysis.done && <span className="text-emerald-400">✓ TAF analysis complete</span>}
                </div>
                <button
                  onClick={clearAnalysis}
                  className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Clear
                </button>
              </div>

              {/* Flight table */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider whitespace-nowrap">
                        <span className="flex items-center">
                          #FLIGHT
                          <ColFilterDropdown label="flight" allValues={allFlightNums} selected={filterFlight} onChange={setFilterFlight} />
                        </span>
                      </th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">
                        <span className="flex items-center">
                          REG
                          <ColFilterDropdown label="REG" allValues={allRegs} selected={filterReg} onChange={setFilterReg} />
                        </span>
                      </th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">
                        <span className="flex items-center">
                          FROM
                          <ColFilterDropdown label="FROM" allValues={allFromIcaos} selected={filterFrom} onChange={setFilterFrom} />
                        </span>
                      </th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">
                        <span className="flex items-center">
                          TO
                          <ColFilterDropdown label="TO" allValues={allToIcaos} selected={filterTo} onChange={setFilterTo} />
                        </span>
                      </th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">ETD</th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider">ETA</th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground tracking-wider min-w-[160px]">TAF ANALYSIS (ETA±1h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlights.map((f, idx) => {
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
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{f.etd || "—"}</td>
                          <td className="px-3 py-2.5 font-bold tabular-nums"
                            style={{ color: f.eta ? "hsl(45 90% 50%)" : undefined }}>
                            {f.eta || (f.etd ? <span className="opacity-50">{f.etd}</span> : "—")}
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

              {/* Upload new file */}
              <button
                onClick={() => { clearAnalysis(); setTimeout(() => fileInputRef.current?.click(), 50); }}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload different file
              </button>

              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
