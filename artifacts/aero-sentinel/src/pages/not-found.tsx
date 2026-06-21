import { Link } from "wouter";
import { NavHeader } from "@/components/NavHeader";
import { useThemeContext } from "@/App";

export default function NotFound() {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-xl p-10 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold font-mono text-foreground mb-2">404</h1>
          <p className="text-muted-foreground font-mono text-sm mb-6">
            Page not found. Did you forget to add the page to the router?
          </p>
          <Link href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-xs font-bold hover:opacity-90 transition-opacity">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Return to Monitor
          </Link>
        </div>
      </main>
    </div>
  );
}
