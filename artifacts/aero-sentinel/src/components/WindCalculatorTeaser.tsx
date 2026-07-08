import { useMemo, useState } from "react";
import { Wind, ChevronDown, RotateCcw, X } from "lucide-react";
import { useRunways } from "@/hooks/useRunways";
import {
  useGetAirportTaf, getGetAirportTafQueryKey,
  useGetAirportMetar, getGetAirportMetarQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  extractAllWindReports, pickDefaultReport, calcRunwayWind, trueToMagnetic, designatorHeadingDeg,
  headwindSeverity, tailwindSeverity, crosswindSeverity, isExtreme,
  type WindReport, type Severity,
} from "@/lib/windCalc";
import { cn } from "@/lib/utils";

// Order matches the toggle's left-to-right layout: by-runway-name, true, magnetic.
type NorthReference = "designator" | "true" | "magnetic";

function formatDeg(deg: number): string {
  return Number.isInteger(deg) ? String(deg) : deg.toFixed(1);
}

interface WindCalculatorTeaserProps {
  /** 4-letter ICAO airport code, e.g. "LTFM" */
  icao: string;
  /**
   * Current raw METAR/TAF, when the caller already has them in memory
   * (Dashboard, AirportDetail). Passing these avoids a redundant fetch and
   * lets the trigger button reflect wind severity before the panel is even
   * opened. When omitted, the panel fetches them lazily on open instead.
   */
  rawMetar?: string | null;
  rawTaf?: string | null;
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

function endLevel(end: RunwayEnd): "none" | Severity | "extreme" {
  const tailwindKt = end.headwindKt < 0 ? Math.abs(end.headwindKt) : 0;
  const headwindKt = end.headwindKt > 0 ? end.headwindKt : 0;
  if (isExtreme(headwindKt, tailwindKt, end.crosswindKt)) return "extreme";
  const sevs = [headwindSeverity(headwindKt), tailwindSeverity(tailwindKt), crosswindSeverity(end.crosswindKt)];
  if (sevs.includes("red")) return "red";
  if (sevs.includes("orange")) return "orange";
  return "none";
}

/**
 * Per-runway headwind/crosswind panel — opens on the wind-icon button next to
 * each airport's ICAO/IATA/runway badges. When rawMetar/rawTaf aren't passed
 * in, TAF/METAR are fetched lazily while open (works everywhere without
 * changing every call site — see AirportDetail/Alerts).
 */
export function WindCalculatorTeaser({ icao, rawMetar: rawMetarProp, rawTaf: rawTafProp }: WindCalculatorTeaserProps) {
  const { data: runways } = useRunways(icao);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [overrideDir, setOverrideDir] = useState<string>("");
  const [overrideSpeed, setOverrideSpeed] = useState<string>("");
  const [northRef, setNorthRef] = useState<NorthReference>("true");

  const hasExternalData = rawMetarProp !== undefined || rawTafProp !== undefined;

  const { data: tafData } = useGetAirportTaf(icao, {
    query: { enabled: open && !hasExternalData, queryKey: getGetAirportTafQueryKey(icao) },
  });
  const { data: metarData } = useGetAirportMetar(icao, {
    query: { enabled: open && !hasExternalData, queryKey: getGetAirportMetarQueryKey(icao) },
  });

  const rawMetar = hasExternalData ? (rawMetarProp ?? null) : (metarData?.rawMetar ?? null);
  const rawTaf = hasExternalData ? (rawTafProp ?? null) : (tafData?.rawTaf ?? null);

  const reports = useMemo(() => extractAllWindReports(rawMetar, rawTaf), [rawMetar, rawTaf]);
  const defaultReport = useMemo(() => pickDefaultReport(reports), [reports]);
  const selectedReport: WindReport | null = (selectedId && reports.find((r) => r.id === selectedId)) || defaultReport;

  // Airport-level magnetic variation — averaged across its runways (their footprint
  // is small enough that this is effectively exact) — used to convert the *wind*
  // direction, which METAR/TAF always report relative to true north.
  const airportMagVarDeg = useMemo(() => {
    const vals = (runways ?? []).map((r) => r.magVarDeg).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [runways]);
  const canUseMagnetic = airportMagVarDeg !== null;

  const isOverridden = overrideDir.trim() !== "" || overrideSpeed.trim() !== "";
  // The wind direction number is frame-agnostic: it stays exactly as reported
  // (or as typed) in BOTH True and Mag modes. Only the runway headings convert
  // between frames — matching the reference wind-component calculator, where
  // toggling True/Mag changes the runway heading (and the resulting components)
  // but never the entered wind direction.
  const reportDirDeg = selectedReport && !selectedReport.isVariable && selectedReport.dirDeg != null
    ? selectedReport.dirDeg
    : null;
  const effectiveDirDeg = overrideDir.trim() !== "" ? ((Number(overrideDir) % 360) + 360) % 360 : reportDirDeg;
  const effectiveSpeedKt = overrideSpeed.trim() !== "" ? Math.max(0, Number(overrideSpeed)) : (selectedReport?.calcSpeedKt ?? null);
  const effectiveIsVariable = overrideDir.trim() === "" && !!selectedReport?.isVariable;
  const hasUsableWind = !effectiveIsVariable && effectiveDirDeg !== null && effectiveSpeedKt !== null && !Number.isNaN(effectiveDirDeg) && !Number.isNaN(effectiveSpeedKt);

  const runwayEnds: RunwayEnd[] = useMemo(() => {
    if (!runways || !hasUsableWind || effectiveDirDeg === null || effectiveSpeedKt === null) return [];
    // Every runway must convert through the SAME airport-level declination — using
    // each runway's own individually-surveyed magVarDeg here caused parallel/tied
    // runways to drift apart by hundredths of a degree between True and Mag,
    // which could flip which one "wins" the headwind tie-break inconsistently.
    // "designator" mode ignores survey data entirely and uses the heading implied
    // by the runway's own name (e.g. "28L" -> 280°), so it needs the ident, not
    // the true heading.
    const headingFor = (trueDeg: number, ident: string) => {
      if (northRef === "designator") return designatorHeadingDeg(ident);
      if (northRef === "magnetic" && airportMagVarDeg != null) return trueToMagnetic(trueDeg, airportMagVarDeg);
      return trueDeg;
    };
    const ends: RunwayEnd[] = [];
    for (const r of runways) {
      if (r.leIdent && r.leHeadingDegT != null) {
        const heading = headingFor(r.leHeadingDegT, r.leIdent);
        const w = calcRunwayWind(effectiveDirDeg, effectiveSpeedKt, heading);
        ends.push({ key: `${r.designator}-le`, ident: r.leIdent, headingDegT: heading, ...w });
      }
      if (r.heIdent && r.heHeadingDegT != null) {
        const heading = headingFor(r.heHeadingDegT, r.heIdent);
        const w = calcRunwayWind(effectiveDirDeg, effectiveSpeedKt, heading);
        ends.push({ key: `${r.designator}-he`, ident: r.heIdent, headingDegT: heading, ...w });
      }
    }
    return ends.sort((a, b) => b.headwindKt - a.headwindKt);
  }, [runways, hasUsableWind, effectiveDirDeg, effectiveSpeedKt, northRef, airportMagVarDeg]);

  // Every end tied for the highest headwind is "best" — parallel runways (e.g. 24L/24R) are both recommended.
  const bestHeadwind = runwayEnds.length > 0 ? runwayEnds[0].headwindKt : null;
  const bestKeys = new Set(
    bestHeadwind !== null ? runwayEnds.filter((e) => Math.abs(e.headwindKt - bestHeadwind) < 0.05).map((e) => e.key) : [],
  );

  // Trigger-button indicator reflects the worst condition among the recommended runway(s) —
  // that's the realistic choice a pilot faces, not an unused orientation.
  const bestLevel = useMemo(() => {
    const bestEnds = runwayEnds.filter((e) => bestKeys.has(e.key));
    const order: Array<"none" | Severity | "extreme"> = ["none", "orange", "red", "extreme"];
    let worst: "none" | Severity | "extreme" = "none";
    for (const e of bestEnds) {
      const lvl = endLevel(e);
      if (order.indexOf(lvl) > order.indexOf(worst)) worst = lvl;
    }
    return worst;
  }, [runwayEnds, bestKeys]);

  function resetOverride() {
    setOverrideDir("");
    setOverrideSpeed("");
  }

  // Toggling True/Mag keeps the entered wind direction and only reinterprets
  // the runway headings, so there's nothing to reset when the frame changes.

  if (!runways || runways.length === 0) return null;

  const triggerClass =
    bestLevel === "extreme"
      ? "border-red-500/60 bg-red-500/20 text-red-400 animate-pulse"
      : bestLevel === "red"
        ? "border-red-500/50 bg-red-500/10 text-red-400"
        : bestLevel === "orange"
          ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
          : "border-green-500/30 bg-green-500/10 text-green-400/90 hover:bg-green-500/20 hover:border-green-500/50";

  const dotClass =
    bestLevel === "extreme" || bestLevel === "red" ? "bg-red-400"
      : bestLevel === "orange" ? "bg-orange-400"
        : "bg-green-400";

  // Selected report summary — shown on the collapsed "Report Values" toggle so
  // it's clear which entry is driving the numbers without expanding the list.
  const selectedReportSummary = selectedReport
    ? `${selectedReport.label}${selectedReport.timeLabel ? ` (${selectedReport.timeLabel})` : ""} — ${
        selectedReport.isVariable ? "VRB" : `${String(selectedReport.dirDeg).padStart(3, "0")}°`
      }/${selectedReport.isCalm ? "Calm" : `${selectedReport.speedKt}${selectedReport.gustKt ? `G${selectedReport.gustKt}` : ""}kt`}`
    : null;

  return (
    // React bubbles portaled events through the *React* tree, not the DOM tree — so a
    // click on the dialog's full-screen overlay (dismissing it) would otherwise bubble
    // straight up into the card's <Link>, triggering navigation. This wrapper (laid out
    // via display:contents, so it doesn't affect the surrounding badge row) intercepts
    // that bubbling before it reaches the Link.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) { setSelectedId(null); setReportsExpanded(false); resetOverride(); }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          className={cn("relative inline-flex items-center justify-center w-[19px] h-[19px] rounded border transition-colors", triggerClass)}
          title="Wind Calculator"
        >
          <Wind className="w-[11px] h-[11px]" strokeWidth={2.5} />
          <span className={cn("absolute -top-[3px] -right-[3px] w-[6px] h-[6px] rounded-full animate-pulse", dotClass)} />
        </button>
      </DialogTrigger>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        showCloseButton={false}
        className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-[420px] max-h-[85vh] p-0 gap-0 font-mono rounded-lg flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
          <Wind className="w-3.5 h-3.5 text-primary flex-shrink-0" strokeWidth={2.5} />
          <DialogTitle asChild>
            <span className="text-[11px] font-bold tracking-wider">{icao} — WIND CALCULATOR</span>
          </DialogTitle>
          <DialogClose className="ml-auto flex items-center justify-center rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none">
            <X className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
            <WindCompass dirDeg={effectiveDirDeg} isVariable={effectiveIsVariable} runwayEnds={runwayEnds} bestKeys={bestKeys} />
            <div className="w-full sm:flex-1 sm:min-w-0 space-y-2 text-center">
              <div>
                <div className="flex flex-col items-center gap-1 mb-1">
                  <label className="text-[9.5px] text-muted-foreground tracking-wide">Direction (°)</label>
                  <div className="inline-flex rounded border border-border overflow-hidden text-[9px] font-bold">
                    <button
                      type="button"
                      onClick={() => setNorthRef("designator")}
                      title="Heading implied by each runway's own name (e.g. 28L = 280°) — ignores survey/declination data"
                      className={cn("px-1.5 py-0.5 transition-colors", northRef === "designator" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      RWY
                    </button>
                    <button
                      type="button"
                      onClick={() => setNorthRef("true")}
                      className={cn("px-1.5 py-0.5 transition-colors border-l border-border", northRef === "true" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      TRUE
                    </button>
                    {canUseMagnetic && (
                      <button
                        type="button"
                        onClick={() => setNorthRef("magnetic")}
                        className={cn("px-1.5 py-0.5 transition-colors border-l border-border", northRef === "magnetic" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        MAG
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={overrideDir !== "" ? overrideDir : (reportDirDeg !== null ? formatDeg(reportDirDeg) : "")}
                  onChange={(e) => setOverrideDir(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  placeholder={selectedReport?.isVariable ? "VRB" : "e.g. 250"}
                  className="w-full rounded border border-border bg-muted/20 px-2.5 py-1.5 text-sm font-bold tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[9.5px] text-muted-foreground tracking-wide block mb-1">Speed (kt)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={overrideSpeed !== "" ? overrideSpeed : (selectedReport ? String(selectedReport.calcSpeedKt) : "")}
                  onChange={(e) => setOverrideSpeed(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 15"
                  className="w-full rounded border border-border bg-muted/20 px-2.5 py-1.5 text-sm font-bold tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {isOverridden && (
                <button
                  type="button"
                  onClick={resetOverride}
                  className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Report Value
                </button>
              )}
            </div>
          </div>

          {reports.length === 0 && !isOverridden && (
            <p className="text-xs text-muted-foreground italic mt-3">No wind data available — enter values above to calculate.</p>
          )}

          {effectiveIsVariable && (
            <p className="text-[11px] text-amber-500 mt-3 leading-snug">
              Wind direction is variable — runway recommendation unavailable.
            </p>
          )}
          {hasUsableWind && effectiveSpeedKt === 0 && (
            <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
              Calm wind — all runways suitable.
            </p>
          )}

          {reports.length > 1 && (
            <button
              type="button"
              onClick={() => setReportsExpanded((v) => !v)}
              className="mt-3 w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded border-2 border-primary/60 text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <span className="min-w-0 flex flex-col justify-center gap-0.5">
                <span className="text-[11px] font-bold leading-tight">Report Values</span>
                {!isOverridden && selectedReportSummary && !reportsExpanded && (
                  <span className="block text-[10px] font-normal leading-tight opacity-80 truncate">{selectedReportSummary}</span>
                )}
              </span>
              <ChevronDown className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", reportsExpanded && "rotate-180")} />
            </button>
          )}

          {(reportsExpanded || reports.length === 1) && (
            <div className="mt-1.5 -mx-3 border-t border-border/60">
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setSelectedId(r.id); resetOverride(); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-[11px] border-b border-border/40 last:border-b-0 text-left transition-colors",
                    !isOverridden && selectedReport?.id === r.id ? "bg-primary/15 text-primary" : "hover:bg-muted/40 text-foreground",
                  )}
                >
                  <span className={!isOverridden && selectedReport?.id === r.id ? "font-bold" : ""}>
                    {r.label}
                    {r.timeLabel && <span className="text-muted-foreground font-normal"> ({r.timeLabel})</span>}
                  </span>
                  <span className="tabular-nums flex-shrink-0 ml-2">
                    {r.isVariable ? "VRB" : `${String(r.dirDeg).padStart(3, "0")}°`} / {r.isCalm ? "Calm" : `${r.speedKt}${r.gustKt ? `G${r.gustKt}` : ""}kt`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {runwayEnds.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {runwayEnds.map((end) => (
                <RunwayCard key={end.key} end={end} isBest={bestKeys.has(end.key)} />
              ))}
            </div>
          )}
        </div>

        <WindLegendFooter />
      </DialogContent>
    </Dialog>
    </span>
  );
}

function severityTextClass(sev: Severity): string {
  if (sev === "red") return "text-red-400 font-bold";
  if (sev === "orange") return "text-orange-400 font-bold";
  return "";
}

/** Pinned legend explaining the trigger-button/icon colors — always visible, independent of the body's own scroll. */
function WindLegendFooter() {
  return (
    <div className="px-4 py-2 border-t border-border flex-shrink-0">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <WindLegendItem
          swatchClass="border-green-500/30 bg-green-500/10 text-green-400/90"
          label="Safe"
          detail="Below every caution threshold, or this is the best headwind runway available."
        />
        <WindLegendItem
          swatchClass="border-orange-500/50 bg-orange-500/10 text-orange-400"
          label="Caution"
          detail="Headwind ≥40kt · Tailwind ≥10kt · Crosswind ≥20kt"
        />
        <WindLegendItem
          swatchClass="border-red-500/50 bg-red-500/10 text-red-400"
          label="Severe"
          detail="Headwind ≥45kt · Tailwind ≥13kt · Crosswind ≥25kt"
        />
        <WindLegendItem
          swatchClass="border-red-500/60 bg-red-500/20 text-red-400 animate-pulse"
          label="Extreme"
          detail="Tailwind ≥15kt · Crosswind ≥30kt · Headwind ≥50kt (on the best runway)"
        />
      </div>
    </div>
  );
}

function WindLegendItem({ swatchClass, label, detail }: { swatchClass: string; label: string; detail: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-1 cursor-default">
          <span className={cn("relative inline-flex items-center justify-center w-[15px] h-[15px] rounded border", swatchClass)}>
            <Wind className="w-[9px] h-[9px]" strokeWidth={2.5} />
          </span>
          <span className="text-[9.5px] text-muted-foreground">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-[10px] font-mono max-w-[220px] text-center">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}

function RunwayCard({ end, isBest }: { end: RunwayEnd; isBest: boolean }) {
  const isTailwind = end.headwindKt < 0;
  const tailwindKt = isTailwind ? Math.abs(end.headwindKt) : 0;
  const headwindKt = isTailwind ? 0 : end.headwindKt;
  const level = endLevel(end);

  // Border colour: a tailwind runway is always red — it's a downwind runway
  // regardless of how mild — same for headwind runways that breach a red/
  // extreme limit. Otherwise, only the single (tied-)best headwind runway(s)
  // get green; everything else is a neutral outline.
  const cardClass = isTailwind || level === "red" || level === "extreme"
    ? "border-red-500 bg-red-500/10"
    : isBest
      ? "border-green-500 bg-green-500/10"
      : "border-border bg-muted/20";

  return (
    <div className={cn("rounded px-2.5 py-2 text-center border-2", cardClass)}>
      <div className="text-xs font-bold tracking-wide text-primary">RWY {end.ident}</div>
      <div className="text-[10.5px] mt-0.5 text-muted-foreground">
        {isTailwind ? (
          <span className={severityTextClass(tailwindSeverity(tailwindKt))}>Tailwind {tailwindKt}kt</span>
        ) : (
          <span className={severityTextClass(headwindSeverity(headwindKt))}>Headwind {headwindKt}kt</span>
        )}
        {end.crosswindKt > 0.1 && (
          <>
            {" · "}
            <span className={severityTextClass(crosswindSeverity(end.crosswindKt))}>Crosswind {end.crosswindKt}kt</span>
          </>
        )}
      </div>
    </div>
  );
}

function WindCompass({
  dirDeg, isVariable, runwayEnds, bestKeys,
}: {
  dirDeg: number | null; isVariable: boolean;
  runwayEnds: RunwayEnd[]; bestKeys: Set<string>;
}) {
  // "Bold Flat" design — 2x the original 104px diagram: a chunky filled
  // chevron wind arrow and runway ends as solid gold circular badges.
  const size = 208;
  const c = size / 2;
  const r = c - 28;

  // Draw only the best runway pair (matched by shared designator prefix) as the
  // runway bar — other runways still get their own cards below, just not
  // rendered here, to keep the diagram legible with 3+ runways.
  const bestKey = [...bestKeys][0];
  const bestDesignator = bestKey?.replace(/-(le|he)$/, "");
  const pairEnds = bestDesignator ? runwayEnds.filter((e) => e.key.startsWith(bestDesignator)) : [];

  const toXY = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180; // 0deg = up (N)
    return { x: c + radius * Math.cos(rad), y: c + radius * Math.sin(rad) };
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={c} cy={c} r={r} fill="hsl(var(--muted) / 0.15)" stroke="hsl(var(--border))" strokeWidth="2" />

      {/* Cardinal ticks */}
      {[0, 90, 180, 270].map((deg) => {
        const p1 = toXY(deg, r);
        const p2 = toXY(deg, r - 10);
        return <line key={deg} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" />;
      })}
      {[45, 135, 225, 315].map((deg) => {
        const p1 = toXY(deg, r);
        const p2 = toXY(deg, r - 6);
        return <line key={deg} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="hsl(var(--muted-foreground) / 0.5)" strokeWidth="2" />;
      })}
      <text x={c} y={c - r + 18} textAnchor="middle" fontSize="16" fontWeight="800" fill="hsl(var(--muted-foreground))">N</text>

      {/* Runway bar with dashed centerline */}
      {pairEnds.length === 2 && (
        <RunwayBar ends={pairEnds} radius={r} toXY={toXY} />
      )}

      {isVariable ? (
        <text x={c} y={c + 6} textAnchor="middle" fontSize="20" fontWeight="800" fill="hsl(var(--muted-foreground))">VRB</text>
      ) : dirDeg != null ? (
        <WindArrow dirDeg={dirDeg} center={c} radius={r} />
      ) : (
        <text x={c} y={c + 6} textAnchor="middle" fontSize="18" fill="hsl(var(--muted-foreground))">—</text>
      )}
    </svg>
  );
}

/** Bold, fully-filled chevron arrow — tail near the compass edge (where the wind is FROM), head near the center. */
function WindArrow({ dirDeg, center, radius }: { dirDeg: number; center: number; radius: number }) {
  const rad = ((dirDeg - 90) * Math.PI) / 180;
  const out = { x: Math.cos(rad), y: Math.sin(rad) };   // tip -> tail direction (points where the wind is FROM)
  const perp = { x: -out.y, y: out.x };

  // Paper-airplane / dart silhouette, tip at center: a swept-wing outer dart
  // plus a smaller offset inner facet on top for a layered, folded look.
  const at = (dist: number, side: number) => ({
    x: center + out.x * dist * radius + perp.x * side * radius,
    y: center + out.y * dist * radius + perp.y * side * radius,
  });
  const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const outerPoints = poly([
    at(1.0, 0),        // tail
    at(0.09, -0.055),  // right notch
    at(0.15, -0.12),   // right wingtip
    at(0, 0),          // tip (center)
    at(0.15, 0.12),    // left wingtip
    at(0.09, 0.055),   // left notch
  ]);
  const innerPoints = poly([
    at(0.62, 0.02),    // inner tail
    at(0.05, -0.007),  // inner notch
    at(0, 0),          // tip
    at(0.1, 0.09),     // inner wing
    at(0.13, 0.04),    // inner wing
  ]);

  return (
    <g>
      <polygon points={outerPoints} fill="hsl(var(--primary))" strokeLinejoin="round" />
      <polygon points={innerPoints} fill="hsl(var(--primary-foreground) / 0.18)" strokeLinejoin="round" />
    </g>
  );
}

function RunwayBar({
  ends, radius, toXY,
}: {
  ends: RunwayEnd[]; radius: number;
  toXY: (deg: number, r: number) => { x: number; y: number };
}) {
  const [a, b] = ends;
  const barPa = toXY(a.headingDegT, radius - 24);
  const barPb = toXY(b.headingDegT, radius - 24);
  const labelPa = toXY(a.headingDegT, radius - 2);
  const labelPb = toXY(b.headingDegT, radius - 2);
  return (
    <g>
      <line x1={barPa.x} y1={barPa.y} x2={barPb.x} y2={barPb.y} stroke="hsl(var(--muted-foreground) / 0.55)" strokeWidth="14" strokeLinecap="round" />
      <line x1={barPa.x} y1={barPa.y} x2={barPb.x} y2={barPb.y} stroke="hsl(var(--primary) / 0.18)" strokeWidth="14" strokeLinecap="round" />
      <line x1={barPa.x} y1={barPa.y} x2={barPb.x} y2={barPb.y} stroke="hsl(var(--background))" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" />
      <RunwayEndBadge x={labelPa.x} y={labelPa.y} text={a.ident} />
      <RunwayEndBadge x={labelPb.x} y={labelPb.y} text={b.ident} />
    </g>
  );
}

function RunwayEndBadge({ x, y, text }: { x: number; y: number; text: string }) {
  const r = Math.max(15, text.length * 4.5 + 8);
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="hsl(var(--primary))" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="800" fill="hsl(var(--primary-foreground))">{text}</text>
    </g>
  );
}
