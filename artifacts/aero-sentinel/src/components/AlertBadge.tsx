type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI" | "WX_EXTREME" | "WIND_EXTREME" | "LIFR";

const CONFIG: Record<AlertType, { label: string; className: string }> = {
  TAF_AMD:     { label: "TAF AMD",      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  TAF_COR:     { label: "TAF COR",      className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  SPECI:       { label: "SPECI",        className: "bg-red-500/15 text-red-400 border-red-500/30" },
  WX_EXTREME:  { label: "WX EXTREME",   className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  WIND_EXTREME:{ label: "WIND EXTREME", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  LIFR:        { label: "LIFR",         className: "bg-indigo-600/20 text-indigo-300 border-indigo-500/40" },
};

export function AlertBadge({ type }: { type: AlertType }) {
  const cfg = CONFIG[type];
  return (
    <span className={`inline-flex items-center justify-center min-w-[68px] px-2 py-0.5 rounded text-xs font-mono font-bold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
