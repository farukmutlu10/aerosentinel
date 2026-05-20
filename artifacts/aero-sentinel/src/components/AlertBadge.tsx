type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI";

const CONFIG: Record<AlertType, { label: string; className: string }> = {
  TAF_AMD: { label: "TAF AMD", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  TAF_COR: { label: "TAF COR", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  SPECI:   { label: "SPECI",   className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export function AlertBadge({ type }: { type: AlertType }) {
  const cfg = CONFIG[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
