import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "wouter";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
          <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold font-mono text-foreground">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground font-mono leading-relaxed">
              An unexpected error occurred. Our team has been notified.
              Please try again or return to the dashboard.
            </p>
            {isDev && this.state.error && (
              <div className="text-left bg-red-500/5 border border-red-500/20 rounded-lg p-3 overflow-auto max-h-40">
                <p className="text-[11px] font-mono text-red-400 font-bold mb-1">Error Details:</p>
                <pre className="text-[10px] font-mono text-red-400/80 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                  {"\n"}
                  {this.state.error.stack}
                </pre>
              </div>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-bold hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <Link
                href="/"
                className="px-5 py-2.5 rounded-lg border border-border text-xs font-mono font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
