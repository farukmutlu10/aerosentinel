import { getIataCode } from "@/lib/iataMap";

interface IataBadgeProps {
  /** 4-letter ICAO airport code, e.g. "LTFM" */
  icao: string;
  /**
   * Size variant.
   * - `"xs"` – tiny, for dense layouts (watchlist badges, table cells)
   * - `"sm"` – small, for card headers and links (default)
   */
  size?: "xs" | "sm";
  /**
   * When `true` (default), nothing is rendered when the IATA code is unknown.
   * Set to `false` to show a muted "—" placeholder.
   */
  hideIfMissing?: boolean;
}

const SIZE_CLASS: Record<"xs" | "sm", string> = {
  xs: "text-[9px] leading-none px-[3px] py-[1px] tracking-wider",
  sm: "text-[10px] leading-none px-1 py-[2px] tracking-wider",
};

/**
 * Renders a compact, stylish IATA 3-letter code badge next to an ICAO code.
 *
 * ```tsx
 * <IataBadge icao="LTFM" />        →  "IST"
 * <IataBadge icao="LTFM" size="xs" /> → smaller
 * <IataBadge icao="XXXX" />        → (nothing)
 * ```
 */
export function IataBadge({ icao, size = "sm", hideIfMissing = true }: IataBadgeProps) {
  const iata = getIataCode(icao);

  if (!iata) {
    if (hideIfMissing) return null;
    return (
      <span className={`inline-flex items-center font-mono text-muted-foreground/30 border border-border/20 rounded ${SIZE_CLASS[size]}`}>
        —
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-medium text-muted-foreground/70 border border-border/50 rounded bg-background/40 ${SIZE_CLASS[size]}`}
      title={`${icao.toUpperCase()} — ${iata}`}
    >
      {iata}
    </span>
  );
}