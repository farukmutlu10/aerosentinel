import { Link, useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { useListAlerts, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useWatchlist } from "@/context/WatchlistContext";
import { useLocalAck } from "@/App";
import { useAlertSound } from "@/hooks/useAlertSound";

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
  const { isWatching } = useWatchlist();
  const { localAcked } = useLocalAck();

  const { play: playAlert, setEnabled: setSoundEnabled, isEnabled: isSoundEnabled } = useAlertSound();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const desktopSettingsRef = useRef<HTMLDivElement>(null);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem("aerosentinel-sound") !== "0"; } catch { return true; }
  });

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    setIsPWA(window.matchMedia('(display-mode: standalone)').matches);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleKiosk = async () => {
    if (isPWA) return;

    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstallPrompt(null);
      return;
    }

    const width = 500;
    const height = 1200;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    window.open(
      '/alerts',
      'AeroSentinel Kiosk',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,location=no,status=no,resizable=yes`
    );
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const localAckedSet = useMemo(() => new Set(localAcked), [localAcked]);

  const { data: allAlerts } = useListAlerts(
    { limit: 100 },
    { query: { queryKey: getListAlertsQueryKey({ limit: 100 }), refetchInterval: 180_000, refetchIntervalInBackground: true } }
  );

  // Deduplicate by ICAO (keep latest), same as Alerts.tsx
  const dedupedAlerts = useMemo(() => {
    if (!allAlerts) return [];
    const seen = new Map<string, number>();
    return allAlerts.filter((a) => {
      const prev = seen.get(a.icao);
      const ts = new Date(a.detectedAt).getTime();
      if (prev === undefined || ts > prev) {
        seen.set(a.icao, ts);
        return true;
      }
      return false;
    });
  }, [allAlerts]);

  const unacknowledgedCount = dedupedAlerts
    ? dedupedAlerts.filter((a) => isWatching(a.icao) && !localAckedSet.has(a.id)).length
    : 0;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <header className="border-b border-border bg-card px-3 sm:px-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-12 sm:h-16 gap-2 sm:gap-3 relative">

          {/* Logo — centered on mobile, left on desktop */}
          <div className="flex items-center flex-shrink-0 absolute left-1/2 -translate-x-1/2 sm:relative sm:left-0 sm:translate-x-0">
            <Link href="/">
              <img
                src={`${import.meta.env.BASE_URL}aero-logo.png`}
                alt="AERO-SENTINEL"
                className="h-6 sm:h-9 object-contain select-none"
              />
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 min-w-0">
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

            {/* Settings gear button — desktop */}
            <div className="relative" ref={desktopSettingsRef}>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                title="Settings"
                className="hidden md:flex w-7 h-7 items-center justify-center rounded-md transition-colors ml-0.5"
                style={{ backgroundColor: '#d4a843', color: '#0f0f1a', border: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#c49a36')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#d4a843')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1.5 z-50 min-w-[140px]">
                  <button
                    onClick={() => { handleKiosk(); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    Kiosk
                  </button>
                  {onToggleTheme && (
                    <button
                      onClick={() => { onToggleTheme(); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
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
                      {theme === "dark" ? "Light" : "Dark"}
                    </button>
                  )}
                  <button
                    onClick={toggleSound}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
                  >
                    {soundOn ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    )}
                    Sound: {soundOn ? "On" : "Off"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile — settings gear */}
          <div className="flex sm:hidden items-center relative" ref={mobileSettingsRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
              className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
              style={{ backgroundColor: '#d4a843', color: '#0f0f1a', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#c49a36')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#d4a843')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute left-auto right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1.5 z-50 min-w-[140px] max-w-[200px]">
                <button
                  onClick={() => { handleKiosk(); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                  Kiosk
                </button>
                {onToggleTheme && (
                  <button
                    onClick={() => { onToggleTheme(); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
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
                    {theme === "dark" ? "Light" : "Dark"}
                  </button>
                )}
                <button
                  onClick={toggleSound}
                  className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 font-mono font-bold tracking-wider text-[11px] w-full text-left"
                >
                  {soundOn ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                  )}
                  Sound: {soundOn ? "On" : "Off"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Click outside to close settings dropdown */}
      {settingsOpen && (
        <SettingsClickOutside desktopRef={desktopSettingsRef} mobileRef={mobileSettingsRef} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}

function SettingsClickOutside({ desktopRef, mobileRef, onClose }: {
  desktopRef: React.RefObject<HTMLDivElement | null>;
  mobileRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDesktop = desktopRef.current && desktopRef.current.contains(target);
      const insideMobile = mobileRef.current && mobileRef.current.contains(target);
      if (!insideDesktop && !insideMobile) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [desktopRef, mobileRef, onClose]);
  return null;
}
