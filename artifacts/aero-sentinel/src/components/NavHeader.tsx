import { Link, useLocation } from "wouter";
import { useGetAlertsSummary } from "@workspace/api-client-react";

interface Props {
  monitorStatus?: { running: boolean };
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export function NavHeader({ monitorStatus, theme, onToggleTheme }: Props) {
  const [location] = useLocation();

  const { data: summary } = useGetAlertsSummary({
    query: { refetchInterval: 30_000, refetchIntervalInBackground: true },
  });
  const unacknowledgedCount = summary?.unacknowledged ?? 0;

  const navItems = [
    { label: "OVERVIEW", href: "/" },
    { label: "ALERTS", href: "/alerts" },
    { label: "AIRPORTS", href: "/airports" },
  ];

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <header className="border-b border-border bg-card px-6 py-0">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2.5 select-none">
          <img
            src={`${import.meta.env.BASE_URL}ajet-logo.jpeg`}
            alt="AJET"
            className="h-8 w-8 rounded-md object-cover flex-shrink-0"
          />
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm tracking-widest text-primary font-mono">AERO-SENTINEL</span>
            <span className="text-muted-foreground text-xs font-mono">v1.6</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-1 rounded text-xs font-mono font-medium tracking-wider transition-colors ${
                  isActive(item.href)
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {item.href === "/alerts" && unacknowledgedCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white font-mono">
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
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors ml-2"
            >
              {theme === "dark" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          )}

          {monitorStatus !== undefined && (
            <div className="flex items-center gap-2 border-l border-border pl-3 ml-1">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${monitorStatus.running ? "bg-green-400 sentinel-pulse" : "bg-red-500"}`} />
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                {monitorStatus.running ? "LIVE" : "OFFLINE"}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
