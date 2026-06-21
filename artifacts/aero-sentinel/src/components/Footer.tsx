import { Link, useLocation } from "wouter";
import { useMemo } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useWatchlist } from "@/context/WatchlistContext";
import { useLocalAck } from "@/App";

const TABS = [
  {
    label: "MONITOR",
    href: "/",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    activeColor: "text-sky-400",
    inactiveColor: "text-muted-foreground",
  },
  {
    label: "ALERTS",
    href: "/alerts",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    activeColor: "text-amber-400",
    inactiveColor: "text-muted-foreground",
  },
  {
    label: "ANALYZE",
    href: "/airports",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    activeColor: "text-emerald-400",
    inactiveColor: "text-muted-foreground",
  },
];

export function Footer() {
  const [location] = useLocation();
  const { isWatching } = useWatchlist();
  const { localAcked } = useLocalAck();

  const localAckedSet = useMemo(() => new Set(localAcked), [localAcked]);

  const { data: allAlerts } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: 180_000, refetchIntervalInBackground: true } }
  );

  const unacknowledgedCount = allAlerts
    ? allAlerts.filter((a) => isWatching(a.icao) && !a.acknowledged && !localAckedSet.has(a.id)).length
    : 0;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      {/* Desktop footer */}
      <footer className="hidden sm:block mt-16 border-t border-border/40 py-6 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-end">
          <span className="text-xs text-muted-foreground/50 font-mono tracking-widest select-none">
            DESIGNED BY <span className="text-muted-foreground/80 font-semibold">FM</span>
          </span>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-2">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                  active ? tab.activeColor : tab.inactiveColor
                }`}
              >
                <div className="relative">
                  {tab.icon}
                  {tab.href === "/alerts" && unacknowledgedCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-white font-mono">
                      {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-mono font-bold tracking-wider">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
