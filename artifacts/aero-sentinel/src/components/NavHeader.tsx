import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetAlertsSummary } from "@workspace/api-client-react";
import { ChangelogModal } from "./ChangelogModal";

interface Props {
  monitorStatus?: { running: boolean };
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

const NAV_ITEMS = [
  {
    label: "MONITOR",
    href: "/",
    activeClass: "text-sky-400 bg-sky-400/10 border border-sky-400/30",
    inactiveClass: "text-sky-400/50 hover:text-sky-400 hover:bg-sky-400/5",
  },
  {
    label: "ALERTS",
    href: "/alerts",
    activeClass: "text-amber-400 bg-amber-400/10 border border-amber-400/30",
    inactiveClass: "text-amber-400/50 hover:text-amber-400 hover:bg-amber-400/5",
  },
  {
    label: "ANALYZE",
    href: "/airports",
    activeClass: "text-emerald-400 bg-emerald-400/10 border border-emerald-400/30",
    inactiveClass: "text-emerald-400/50 hover:text-emerald-400 hover:bg-emerald-400/5",
  },
];

export function NavHeader({ monitorStatus, theme, onToggleTheme }: Props) {
  const [location] = useLocation();
  const [changelogOpen, setChangelogOpen] = useState(false);

  const { data: summary } = useGetAlertsSummary({
    query: { refetchInterval: 30_000, refetchIntervalInBackground: true },
  });
  const unacknowledgedCount = summary?.unacknowledged ?? 0;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <header className="border-b border-border bg-card px-4 sm:px-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 sm:h-16 gap-3">

          {/* Left — logo + version badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/">
              <img
                src={`${import.meta.env.BASE_URL}aero-logo.png`}
                alt="AERO-SENTINEL"
                className="h-7 sm:h-9 object-contain select-none"
              />
            </Link>
            <button
              className="rgb-badge-wrapper flex-shrink-0"
              onClick={() => setChangelogOpen(true)}
              title="View changelog"
            >
              <div className="rgb-badge-spinner" />
              <span className="rgb-badge-inner">v1.8</span>
            </button>
          </div>

          {/* Right — nav + controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-2.5 py-1 rounded text-[11px] font-mono font-bold tracking-wider transition-all border border-transparent ${
                    isActive(item.href) ? item.activeClass : item.inactiveClass
                  }`}
                >
                  {item.label}
                  {item.href === "/alerts" && unacknowledgedCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white font-mono">
                      {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors ml-0.5"
              >
                {theme === "dark" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            )}

            {monitorStatus !== undefined && (
              <div className="flex items-center gap-1.5 border-l border-border pl-2 ml-0.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${monitorStatus.running ? "bg-green-400 sentinel-pulse" : "bg-red-500"}`} />
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest hidden sm:block">
                  {monitorStatus.running ? "LIVE" : "OFFLINE"}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </>
  );
}
