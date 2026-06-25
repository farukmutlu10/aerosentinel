import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TafText } from "@/components/TafText";

interface TafDiffModalProps {
  open: boolean;
  onClose: () => void;
  alertId: number;
  alertType: string;
  icao: string;
}

interface DiffData {
  previous: string;
  current: string;
}

export function TafDiffModal({ open, onClose, alertId, alertType, icao }: TafDiffModalProps) {
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !alertId) return;
    setLoading(true);
    setError(null);
    setDiff(null);

    fetch(`/api/alerts/${alertId}/diff`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setDiff({ previous: data.previous ?? "", current: data.current ?? "" });
      })
      .catch((err) => {
        setError(err?.message || "Failed to load diff");
      })
      .finally(() => setLoading(false));
  }, [open, alertId]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  const typeColor =
    alertType === "TAF_AMD" ? "#facc15" :
    alertType === "TAF_COR" ? "#fb923c" :
    "#f87171";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 transition-opacity duration-300"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl transition-all duration-300"
        style={{ animation: "tafDiffSlideIn 0.3s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-border/50">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <span className="font-mono font-bold text-sm sm:text-base">{icao}</span>
            <span
              className="text-[10px] sm:text-xs font-mono font-semibold px-1.5 sm:px-2 py-0.5 rounded-md"
              style={{ backgroundColor: typeColor + "18", color: typeColor, border: `1px solid ${typeColor}40` }}
            >
              {alertType.replace("_", " ")}
            </span>
          </div>
       </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-4 sm:pb-5 pt-2">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-1/2 rounded" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-destructive font-mono text-xs sm:text-sm">{error}</p>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          ) : !diff ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <p className="text-muted-foreground font-mono text-xs sm:text-sm">No diff data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              <DiffBlock lines={diff.previous} variant="previous" />
              <DiffBlock lines={diff.current} variant="current" />
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes tafDiffSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Diff block (Previous / Current) ────────────────────────────────────────
function DiffBlock({ lines, variant }: { lines: string; variant: "previous" | "current" }) {
  const borderColor = variant === "previous" ? "rgba(100,116,139,0.2)" : "rgba(56,189,248,0.25)";
  const hasData = lines.trim().length > 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
      <div className="px-3 py-2.5">
        {/* Colored header label */}
        <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${variant === "previous" ? "text-red-400" : "text-green-400"}`}>
          {variant === "previous" ? "Previous" : "Current"}
        </p>
        {hasData ? (
          <TafText raw={lines} className="text-[11px] sm:text-xs" />
        ) : (
          <p className="text-xs font-mono text-muted-foreground/50 italic">No data</p>
        )}
      </div>
    </div>
  );
}

