import { useState } from "react";
import { useRunways } from "@/hooks/useRunways";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RunwayBadgeProps {
  /** 4-letter ICAO airport code, e.g. "LTFM" */
  icao: string;
}

const SURFACE_LABEL: Record<string, string> = {
  ASP: "asphalt", "ASPH-G": "asphalt", ASPH: "asphalt", BIT: "asphalt",
  CON: "concrete", CONC: "concrete", PEM: "concrete",
  GRVL: "gravel", GRV: "gravel", GRAVEL: "gravel",
  GRS: "grass", GRASS: "grass", TURF: "grass",
  WATER: "water",
};

function surfaceLabel(surface: string | null): string | null {
  if (!surface) return null;
  return SURFACE_LABEL[surface.toUpperCase()] ?? surface;
}

/**
 * Renders a compact runway-designator badge next to a card's ICAO/IATA
 * header. Clicking opens a popover with heading, length, and surface per
 * runway. Data comes from a static OurAirports-derived lookup, not the
 * live weather scan — see plans/pist-yonu-ozelligi-plan.md.
 */
export function RunwayBadge({ icao }: RunwayBadgeProps) {
  const { data: runways } = useRunways(icao);
  const [open, setOpen] = useState(false);

  if (!runways || runways.length === 0) return null;

  const summary = runways.map((r) => r.designator).join(" · ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/*
          The card this badge sits in is itself a <Link> (an <a> tag).
          A plain stopPropagation() isn't enough here: it can stop Radix's
          own toggle from being blocked, but nothing then cancels the
          anchor's native "navigate to href" default action, so the browser
          still follows the link. Managing `open` state ourselves and
          calling preventDefault + stopPropagation is what actually stops
          both the SPA navigation (wouter's Link) and the native one.
        */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          className="inline-flex items-center font-mono text-[10px] leading-none px-1.5 py-[3px] tracking-wide rounded border border-sky-500/30 bg-sky-500/10 text-sky-400/90 hover:bg-sky-500/20 transition-colors"
          title="Runway details"
        >
          {summary}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[11px] font-bold tracking-wider">{icao} — RUNWAYS</span>
        </div>
        <div className="px-3 py-1.5">
          {runways.map((r) => (
            <div key={r.designator} className="py-1.5 border-b border-border/60 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{r.designator}</span>
                {(r.leHeadingDegT != null || r.heHeadingDegT != null) && (
                  <span className="text-xs text-muted-foreground">
                    {r.leHeadingDegT ?? "—"}° / {r.heHeadingDegT ?? "—"}°
                  </span>
                )}
              </div>
              {(r.lengthFt != null || r.surface) && (
                <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                  {r.lengthFt != null && `${Math.round(r.lengthFt * 0.3048).toLocaleString("en-US")} m`}
                  {r.lengthFt != null && surfaceLabel(r.surface) && " · "}
                  {surfaceLabel(r.surface)}
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
