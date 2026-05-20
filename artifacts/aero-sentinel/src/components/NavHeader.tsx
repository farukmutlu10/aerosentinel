import { Link, useLocation } from "wouter";

interface Props {
  monitorStatus?: { running: boolean; lastScan?: string | null; scanCount?: number };
}

export function NavHeader({ monitorStatus }: Props) {
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
              style={{ color: "#FF5E14", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}
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
        <div className="flex items-center gap-6">
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

          {monitorStatus && (
            <div className="flex items-center gap-2 border-l border-border pl-6">
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
