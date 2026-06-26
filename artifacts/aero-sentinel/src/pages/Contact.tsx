import { Link } from "wouter";
import { useEffect } from "react";

export default function Contact() {
  useEffect(() => {
    // Redirect to mailto
    window.location.href = "mailto:contact@aerosentinel.app";
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span className="font-mono font-bold text-sm">Back to Dashboard</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Contact Us</h1>
          <p className="text-muted-foreground mb-6">Opening your email client...</p>
          <a href="mailto:contact@aerosentinel.app" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-xs font-bold">
            contact@aerosentinel.app
          </a>
          <div className="mt-4">
            <Link href="/" className="text-sm text-primary hover:underline">← Back to Dashboard</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
