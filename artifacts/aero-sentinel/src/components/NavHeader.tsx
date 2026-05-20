import { Link, useLocation } from "wouter";

interface Props {
  monitorStatus?: { running: boolean; lastScan?: string | null; scanCount?: number };
  notificationPermission?: NotificationPermission;
  onRequestNotification?: () => void;
}

export function NavHeader({ monitorStatus, notificationPermission, onRequestNotification }: Props) {
  const [location] = useLocation();

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
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group select-none">
          <div className="flex items-center gap-0 leading-none">
            <span
              className="font-black text-xl tracking-tight"
              style={{ color: "#38BDF8", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}
            >
              AJET
            </span>
            <span className="mx-1.5 text-border font-light text-lg">|</span>
            <span className="font-bold text-sm tracking-widest text-primary font-mono">
              AERO-SENTINEL
            </span>
            <span className="ml-1.5 text-muted-foreground text-xs font-mono">v1.5</span>
          </div>
        </Link>

        {/* Nav + status */}
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1 rounded text-xs font-mono font-medium tracking-wider transition-colors ${
                  isActive(item.href)
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Notification bell */}
          {notificationPermission !== undefined && (
            <button
              onClick={onRequestNotification}
              title={
                notificationPermission === "granted"
                  ? "Desktop bildirimleri aktif"
                  : notificationPermission === "denied"
                  ? "Bildirimler engellendi"
                  : "Desktop bildirimlerini etkinleştir"
              }
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                notificationPermission === "granted"
                  ? "text-green-400 cursor-default"
                  : notificationPermission === "denied"
                  ? "text-muted-foreground cursor-not-allowed"
                  : "text-yellow-400 hover:text-yellow-300 cursor-pointer sentinel-pulse"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          )}

          {monitorStatus !== undefined && (
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  monitorStatus.running ? "bg-green-400 sentinel-pulse" : "bg-red-500"
                }`}
              />
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
