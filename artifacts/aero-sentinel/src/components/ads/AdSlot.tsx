import { useEffect, useRef } from "react";
import { useThemeContext } from "@/App";

export type AdSlotKey =
  | "monitor-infeed"
  | "alerts-infeed"
  | "analyze-footer";

interface AdSlotConfig {
  slotId: string;
  format: "auto" | "fluid" | "autorelaxed";
  layoutKey?: string;
}

// Dark tema slot ID: 5578520493
// Light tema slot ID: 4699033183
const SLOT_CONFIG_DARK: Record<AdSlotKey, AdSlotConfig> = {
  "monitor-infeed": { slotId: "5578520493", format: "fluid", layoutKey: "-f5+5m+5u-c5+1i" },
  "alerts-infeed": { slotId: "5578520493", format: "fluid", layoutKey: "-f5+5m+5u-c5+1i" },
  "analyze-footer": { slotId: "5578520493", format: "fluid", layoutKey: "-f5+5m+5u-c5+1i" },
};

const SLOT_CONFIG_LIGHT: Record<AdSlotKey, AdSlotConfig> = {
  "monitor-infeed": { slotId: "4699033183", format: "fluid", layoutKey: "-f3+5s+51-da+64" },
  "alerts-infeed": { slotId: "4699033183", format: "fluid", layoutKey: "-f3+5s+51-da+64" },
  "analyze-footer": { slotId: "4699033183", format: "fluid", layoutKey: "-f3+5s+51-da+64" },
};

interface AdSlotProps {
  slot: AdSlotKey;
  className?: string;
  sponsor?: {
    name: string;
    logo?: string;
    url: string;
    description?: string;
  } | null;
}

/**
 * AdSlot — WeatherCard/AlertCard ile aynı formatta reklam/sponsor kartı.
 * Kartların arasına entegre edilir, grid içinde normal kart gibi davranır.
 * Dark/light tema değişimine göre uygun AdSense slot'u otomatik seçilir.
 * AdSense onaylanıp reklam gösterirse sponsor metin otomatik gizlenir.
 */
export function AdSlot({ slot, className = "", sponsor }: AdSlotProps) {
  const { theme } = useThemeContext();
  const config = theme === "dark" ? SLOT_CONFIG_DARK[slot] : SLOT_CONFIG_LIGHT[slot];
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (sponsor) return;
    const timer = setTimeout(() => {
      try {
        if (typeof (window as any).adsbygoogle !== "undefined") {
          (window as any).adsbygoogle = (window as any).adsbygoogle || [];
          (window as any).adsbygoogle.push({});
        }
      } catch { /* AdBlock */ }
    }, 100);
    return () => clearTimeout(timer);
  }, [slot, sponsor, theme]);

  // Google AdSense — her zaman render edilir (sponsor olsun veya olmasın)
  // Sponsor bilgisi AdSense'in üstünde gösterilir
  return (
    <div className={`bg-card border border-border/40 rounded-lg overflow-hidden relative ${className}`}>
      {/* Sponsor overlay — AdSense yüklenemezse veya sponsor prop verilmişse görünür */}
      {sponsor && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 px-4 py-3">
            {sponsor.logo && (
              <img src={sponsor.logo} alt={sponsor.name} className="h-8 w-auto object-contain flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-0.5">SPONSORED</p>
              <p className="text-xs font-mono font-bold text-foreground truncate">{sponsor.name}</p>
              {sponsor.description && (
                <p className="text-[10px] font-mono text-muted-foreground/70 truncate">{sponsor.description}</p>
              )}
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30 flex-shrink-0">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
        </div>
      )}
      {/* AdSense iframe */}
      <div className="flex items-center justify-center py-4 px-3">
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: "block", width: "100%", minHeight: "60px" }}
          data-ad-client="ca-pub-2662411656601000"
          data-ad-slot={config.slotId}
          data-ad-format={config.format}
          data-ad-layout-key={config.layoutKey}
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}
