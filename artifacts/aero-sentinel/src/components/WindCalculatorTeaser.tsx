import { useState } from "react";
import { Wind } from "lucide-react";
import { useRunways } from "@/hooks/useRunways";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface WindCalculatorTeaserProps {
  /** 4-letter ICAO airport code, e.g. "LTFM" */
  icao: string;
}

/**
 * Teaser button for the upcoming per-runway wind calculator (crosswind /
 * headwind component). Only shown where we actually have runway heading
 * data for this airport — otherwise there'd be nothing to calculate.
 * See plans/pist-yonu-ozelligi-plan.md for the full feature roadmap.
 */
export function WindCalculatorTeaser({ icao }: WindCalculatorTeaserProps) {
  const { data: runways } = useRunways(icao);
  const [open, setOpen] = useState(false);

  if (!runways || runways.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          className="relative inline-flex items-center justify-center w-[19px] h-[19px] rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400/90 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-colors"
          title="Wind Calculator — coming soon"
        >
          <Wind className="w-[11px] h-[11px]" strokeWidth={2.5} />
          <span className="absolute -top-[3px] -right-[3px] w-[6px] h-[6px] rounded-full bg-cyan-400 animate-pulse" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Wind className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
          <span className="text-[11px] font-bold tracking-wider">WIND CALCULATOR</span>
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 tracking-wider">
            SOON
          </span>
        </div>
        <div className="px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Instant crosswind &amp; headwind for every runway — coming very soon.
        </div>
      </PopoverContent>
    </Popover>
  );
}
