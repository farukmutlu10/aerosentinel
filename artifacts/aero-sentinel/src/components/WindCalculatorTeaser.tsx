import { useMemo, useState } from "react";
import { Wind, ChevronDown } from "lucide-react";
import { useRunways } from "@/hooks/useRunways";
import {
  useGetAirportTaf, getGetAirportTafQueryKey,
  useGetAirportMetar, getGetAirportMetarQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  extractAllWindReports, pickDefaultReport, calcRunwayWind,
  type WindReport,
} from "@/lib/windCalc";
import { cn } from "@/lib/utils";

interface WindCalculatorTeaserProps {
  /** 4-letter ICAO airport code, e.g. "LTFM" */
  icao: string;
}

/** Runway-end wind computed from the active WindReport, one per usable direction. */
interface RunwayEnd {
  key: string;
  ident: string;
  headingDegT: number;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | null;
}

/**
 * Per-runway headwind/crosswind panel — opens on the wind-icon button next to
 * each airport's ICAO/IATA/runway badges. Fetches TAF/METAR only while open
 * (Dashboard cards already have the raw text in memory for watchlist airports,
 * but AirportDetail/Alerts don't always — a lazy fetch here works everywhere
 * without changing any call site).
 */
export function WindCalculatorTeaser({ icao }: WindCalculatorTeaserProps) {
  const { data: runways } = useRunways(icao);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportsExpanded, setReportsExpanded] = useState(false);

  const { data: tafData } = useGetAirportTaf(icao, {
    query: { enabled: open, queryKey: getGetAirportTafQueryKey(icao) },
  });
  const { data: metarData } = useGetAirportMetar(icao, {
    query: { enabled: open, queryKey: getGetAirportMetarQueryKey(icao) },
  });

  const reports = useMemo(
    () => extractAllWindReports(metarData?.rawMetar ?? null, tafData?.rawTaf ?? null),
    [metarData?.rawMetar, tafData?.rawTaf],
  );

  const defaultReport = useMemo(() => pickDefaultReport(reports), [reports]);
  const active: WindReport | null = (selectedId && reports.find((r) => r.id === selectedId)) || defaultReport;

  const runwayEnds: RunwayEnd[] = useMemo(() => {
    if (!runways || !active || active.isVariable || active.dirDeg === null) return [];
    const ends: RunwayEnd[] = [];
    for (const r of runways) {
      if (r.leIdent && r.leHeadingDegT != null) {
        const w = calcRunwayWind(active.dirDeg, active.speedKt, r.leHeadingDegT);
        ends.push({ key: `${r.designator}-le`, ident: r.leIdent, headingDegT: r.leHeadingDegT, ...w });
      }
      if (r.heIdent && r.heHeadingDegT != null) {
        const w = calcRunwayWind(active.dirDeg, active.speedKt, r.heHeadingDegT);
        ends.push({ key: `${r.designator}-he`, ident: r.heIdent, headingDegT: r.heHeadingDegT, ...w });
      }
    }
    return ends.sort((a, b) => b.headwindKt - a.headwindKt);
  }, [runways, active]);

  if (!runways || runways.length === 0) return null;

  const bestKey = runwayEnds.length > 0 ? runwayEnds[0].key : null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedId(null); setReportsExpanded(false); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          className="relative inline-flex items-center justify-center w-[19px] h-[19px] rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400/90 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-colors"
          title="Wind Calculator"
        >
          <Wind className="w-[11px] h-[11px]" strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] sm:w-[380px] p-0 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Wind className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
          <span className="text-[11px] font-bold tracking-wider">{icao} — WIND CALCULATOR</span>
        </div>

        <div className="px-3 py-3">
          {reports.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">Rüzgar verisi yok.</p>
          ) : (
            <>
              <div className="flex gap-3 items-center">
                <WindCompass dirDeg={active?.dirDeg ?? null} isVariable={!!active?.isVariable} runwayEnds={runwayEnds} bestKey={bestKey} />
                <div className="flex-1 min-w-0 space-y-2">
                  <ValueBox label="yön (°)" value={active?.isVariable ? "VRB" : active?.dirDeg != null ? String(active.dirDeg).padStart(3, "0") : "—"} />
                  <ValueBox
                    label="hız (kt)"
                    value={active ? `${active.speedKt}${active.gustKt ? `G${active.gustKt}` : ""}` : "—"}
                  />
                </div>
              </div>

              {active?.isVariable && (
                <p className="text-[11px] text-amber-500 mt-3 leading-snug">
                  Rüzgar yönü değişken, pist önerisi hesaplanamıyor.
                </p>
              )}
              {active?.isCalm && (
                <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
                  Sakin rüzgar — tüm pistler uygun.
                </p>
              )}

              {reports.length > 1 && (
                <button
                  type="button"
                  onClick={() => setReportsExpanded((v) => !v)}
                  className="mt-3 w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-[11px] text-muted-foreground"
                >
                  Rapor değerleri
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", reportsExpanded && "rotate-180")} />
                </button>
              )}

              {(reportsExpanded || reports.length === 1) && (
                <div className="mt-1.5 -mx-3 border-t border-border/60">
                  {reports.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 text-[11px] border-b border-border/40 last:border-b-0 text-left transition-colors",
                        active?.id === r.id ? "bg-primary/15 text-primary" : "hover:bg-muted/40 text-foreground",
                      )}
                    >
                      <span className={active?.id === r.id ? "font-bold" : ""}>
                        {r.label}
                        {r.timeLabel && <span className="text-muted-foreground font-normal"> ({r.timeLabel})</span>}
                      </span>
                      <span className="tabular-nums flex-shrink-0 ml-2">
                        {r.isVariable ? "VRB" : `${String(r.dirDeg).padStart(3, "0")}°`} / {r.isCalm ? "sakin" : `${r.speedKt}${r.gustKt ? `G${r.gustKt}` : ""}kt`}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {runwayEnds.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {runwayEnds.map((end) => (
                    <RunwayCard key={end.key} end={end} isBest={end.key === bestKey} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ValueBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/20 px-2.5 py-1.5">
      <div className="text-[9.5px] text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function crosswindColor(kt: number): string {
  if (kt >= 20) return "text-red-400";
  if (kt >= 15) return "text-orange-400";
  return "text-foreground";
}

function tailwindColor(kt: number): string {
  if (kt >= 10) return "text-red-400";
  if (kt >= 5) return "text-orange-400";
  return "text-foreground";
}

function RunwayCard({ end, isBest }: { end: RunwayEnd; isBest: boolean }) {
  const isTailwind = end.headwindKt < 0;
  return (
    <div
      className={cn(
        "rounded border px-2.5 py-2 text-center",
        isBest ? "border-primary/50 bg-primary/10" : "border-border bg-muted/20",
      )}
    >
      <div className="text-xs font-bold tracking-wide">RWY {end.ident}</div>
      <div className="text-[10.5px] text-muted-foreground mt-0.5">
        {isTailwind ? (
          <span className={tailwindColor(Math.abs(end.headwindKt))}>tailwind {Math.abs(end.headwindKt)}kt</span>
        ) : (
          <>
            <span>headwind {end.headwindKt}kt</span>
            {end.crosswindKt > 0.1 && (
              <>
                {" · "}
                <span className={crosswindColor(end.crosswindKt)}>crosswind {end.crosswindKt}kt</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WindCompass({
  dirDeg, isVariable, runwayEnds, bestKey,
}: {
  dirDeg: number | null; isVariable: boolean;
  runwayEnds: RunwayEnd[]; bestKey: string | null;
}) {
  const size = 84;
  const c = size / 2;
  const r = c - 10;

  // Draw only the best runway pair (matched by shared designator prefix) as the
  // thick diameter line — other runways still get their own cards below, just
  // not rendered here, to keep the diagram legible with 3+ runways.
  const best = runwayEnds.find((e) => e.key === bestKey);
  const bestDesignator = best?.key.replace(/-(le|he)$/, "");
  const pairEnds = bestDesignator ? runwayEnds.filter((e) => e.key.startsWith(bestDesignator)) : [];

  const toXY = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180; // 0deg = up (N)
    return { x: c + radius * Math.cos(rad), y: c + radius * Math.sin(rad) };
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" />
      <text x={c} y={c - r - 2} textAnchor="middle" fontSize="7" fill="hsl(var(--muted-foreground))">N</text>

      {/* Runway diameter line — drawn from the best runway's two ends */}
      {pairEnds.length === 2 && (
        <RunwayLine ends={pairEnds} radius={r} toXY={toXY} />
      )}

      {isVariable ? (
        <text x={c} y={c + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="hsl(var(--muted-foreground))">VRB</text>
      ) : dirDeg != null ? (
        <WindArrow dirDeg={dirDeg} center={c} radius={r} toXY={toXY} />
      ) : null}
    </svg>
  );
}

function WindArrow({
  dirDeg, center, radius, toXY,
}: { dirDeg: number; center: number; radius: number; toXY: (deg: number, r: number) => { x: number; y: number } }) {
  const tail = toXY(dirDeg, radius - 4);
  const head = toXY(dirDeg, radius * 0.15);
  return (
    <g>
      <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} stroke="hsl(var(--wx-blue))" strokeWidth="2" strokeLinecap="round" markerEnd="url(#windArrowHead)" />
      <defs>
        <marker id="windArrowHead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--wx-blue))" />
        </marker>
      </defs>
      <circle cx={center} cy={center} r="1.5" fill="hsl(var(--wx-blue))" />
    </g>
  );
}

function RunwayLine({
  ends, radius, toXY,
}: {
  ends: RunwayEnd[]; radius: number;
  toXY: (deg: number, r: number) => { x: number; y: number };
}) {
  const [a, b] = ends;
  const linePa = toXY(a.headingDegT, radius - 8);
  const linePb = toXY(b.headingDegT, radius - 8);
  const labelPa = toXY(a.headingDegT, radius + 6);
  const labelPb = toXY(b.headingDegT, radius + 6);
  return (
    <g>
      <line x1={linePa.x} y1={linePa.y} x2={linePb.x} y2={linePb.y} stroke="hsl(var(--muted-foreground))" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <text x={labelPa.x} y={labelPa.y} textAnchor="middle" dominantBaseline="middle" fontSize="6.5" fontWeight="bold" fill="hsl(var(--foreground))">{a.ident}</text>
      <text x={labelPb.x} y={labelPb.y} textAnchor="middle" dominantBaseline="middle" fontSize="6.5" fontWeight="bold" fill="hsl(var(--foreground))">{b.ident}</text>
    </g>
  );
}
