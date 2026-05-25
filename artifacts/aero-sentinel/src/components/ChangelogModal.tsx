import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const V18_SECTIONS = [
  {
    title: "Flight Category Rules",
    items: [
      "LIFR threshold updated from 1500m to 1600m; IFR 1600–4799m, MVFR 4800–7999m, VFR ≥8000m.",
      "Ceiling values: LIFR <500ft, IFR 500–999ft, MVFR 1000–2999ft, VFR ≥3000ft.",
      "Rule logic: for LIFR, either VIS or ceiling criterion is sufficient (OR); for VFR, both must be satisfied (AND).",
    ],
  },
  {
    title: "Weather Cards",
    items: [
      "Card left border colour follows TAF category in TAF mode; METAR category in METAR mode.",
      "In METAR mode the coloured strip moves to the RIGHT side of the card.",
      "In TAF+METAR mode the card has both a left (TAF) and right (METAR) coloured strip.",
      "Side strip width ~18px with vertical TAF / METAR label inside.",
      "Old '⚠ TAF LIFR' badge removed; replaced by 'CRIT TAF' / 'CRIT METAR' badges on critical phenomena.",
      "VFR/MVFR/IFR/LIFR badge now reflects the active view mode (TAF category in TAF/TAF+METAR, METAR category in METAR).",
      "DOM/INT badge removed from card header (DOM/INT filter in toolbar is sufficient).",
    ],
  },
  {
    title: "Wind Colouring",
    items: [
      "Sustained ≥12 kt or gust ≥20 kt → orange.",
      "Sustained ≥15 kt or gust ≥25 kt → red.",
      "Calm/light winds no longer highlighted green (neutral).",
    ],
  },
  {
    title: "Phenomenon Colouring",
    items: [
      "Orange phenomena in TAF/METAR raw text: TS, -TS, TSRA, -TSRA, CB, VCTS, SH, RA and variants, FG, DU, FU, SA, BLDU, BLSA.",
      "Red (critical) phenomena: +TS, +TSRA, DS, SS, SN and variants, FZRA and variants, FZDZ, FZFG, GR, GS, VA, FC, SQ, IC, PL.",
      "Compound codes now correctly coloured: BLSN, DRSN, TSSN, TSGR, TSPL, FZFG, FZDZ, RASN and variants.",
      "Improved tokeniser — compound wx codes that were previously shown in grey now get correct red/orange colouring.",
    ],
  },
  {
    title: "MONITOR Page",
    items: [
      "Page renamed from OVERVIEW to MONITOR.",
      "Clock (UTC + IST) restored to the monitor bar.",
      "Watchlist input moved to MONITOR page as a collapsible panel (below monitor bar).",
      "ICAO search moved below filter row, full width, supports comma- or space-separated multi-ICAO (e.g. LTFH,LTAC,LTFJ).",
      "CRIT filter button added alongside VFR/MVFR/IFR/LIFR to show only airports with critical weather.",
      "Worst First / Best First sorting now uses TAF category in TAF/TAF+METAR mode, METAR category in METAR mode.",
      "WX TAF badge removed from cards.",
      "REFRESH button tooltip translated to English.",
    ],
  },
  {
    title: "ALERTS Page",
    items: [
      "TOTAL / UNACK / TAF REV / SPECI stat cards redesigned — larger text, centred layout.",
      "Stats are calculated from UTC 00:00 today for watchlist airports only.",
      "Clock card (UTC + IST) added to stats row.",
      "Alert log title updated to 'Alert Log — Today UTC'.",
    ],
  },
  {
    title: "ANALYZE Page",
    items: [
      "Page renamed from AIRPORTS to ANALYZE.",
      "Excel (.xlsx / .xls / .csv) flight plan upload with TAF analysis per flight.",
      "Columns read: Flight, Reg, From ICAO, To ICAO, STA, ETA.",
      "Each flight's destination ICAO is analysed against a TAF window of ETA ±1 h.",
      "TAF analysis shows visibility, ceiling, critical/orange phenomena, and flight category.",
      "Excel-style column filters added for #FLIGHT, FROM, and TO columns (search + checkbox dropdown).",
      "WATCHLIST tab removed — watchlist management moved to MONITOR page.",
      "All Turkish strings translated to English.",
    ],
  },
  {
    title: "Navigation",
    items: [
      "Logo moved to the left; version badge placed to the right of the logo.",
      "Logo size reduced by ~30%.",
      "Each tab uses a distinct colour: MONITOR (cyan), ALERTS (amber), ANALYZE (emerald).",
      "Version badge opens the changelog modal.",
    ],
  },
  {
    title: "Notifications",
    items: [
      "Desktop notifications auto-close after 60 seconds.",
      "Clicking a notification brings the window to focus and dismisses the notification.",
    ],
  },
  {
    title: "Bug Fixes",
    items: [
      "Long token single-character line-break issue in raw METAR/TAF text resolved.",
      "Visibility 4-digit regex no longer mismatches TAF period numbers (e.g. 2503/2512).",
      "TAF window analysis generates a full hour range for period groups instead of only start/mid/end.",
    ],
  },
];

const V17_SECTIONS = [
  {
    title: "Interface (v1.7)",
    items: [
      "Logo updated to high-resolution colour version and resized.",
      "Version badge added top-left.",
      "Live clock card added showing UTC and IST (+3).",
      "Light theme colours strengthened; alert cards and ACK warnings more readable.",
    ],
  },
  {
    title: "TAF Display (v1.7)",
    items: [
      "PROB30/PROB40 + TEMPO/BECMG lines grouped correctly.",
      "Low visibility values shown in purple (LIFR).",
      "Each airport card shows two badges: METAR status and TAF worst-case forecast.",
    ],
  },
  {
    title: "Filters (v1.7)",
    items: [
      "View selector: TAF / METAR / TAF+METAR.",
      "TIME button for multi-slot time filtering.",
      "VFR and MVFR colours neutralised.",
      "One-click filter reset button added on all pages.",
    ],
  },
  {
    title: "Monitoring System (v1.7)",
    items: [
      "Fixed airport list removed; only watchlist airports are monitored.",
      "Watchlist stored per browser.",
      "Alerts page shows only watchlist airports.",
    ],
  },
];

export function ChangelogModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const renderSections = (sections: typeof V18_SECTIONS) =>
    sections.map((section) => (
      <div key={section.title}>
        <h3 className="font-mono text-[11px] font-semibold tracking-widest text-primary uppercase mb-2">
          {section.title}
        </h3>
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-snug">
              <span className="text-primary/50 mt-0.5 flex-shrink-0">›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl max-h-[85vh] flex flex-col rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-0.5">
              Release Notes
            </p>
            <h2 className="font-mono text-lg font-bold text-foreground tracking-tight">
              AERO-SENTINEL <span className="changelog-version-badge">v1.8</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {renderSections(V18_SECTIONS)}

          <div className="border-t border-border/40 pt-4">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-4">
              — Previous Release: v1.7 —
            </p>
            <div className="space-y-5 opacity-60">
              {renderSections(V17_SECTIONS)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/40 flex justify-end">
          <button
            onClick={onClose}
            className="font-mono text-xs px-4 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors tracking-wider"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
