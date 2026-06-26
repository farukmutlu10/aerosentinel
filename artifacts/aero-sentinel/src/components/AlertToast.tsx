import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface AlertToastItem {
  id: string;
  title: string;
  icao: string;
  alertId: number;
  alertType: string;
}

interface Props {
  item: AlertToastItem;
  onDismiss: (id: string) => void;
  onAck: (alertId: number) => void;
  onViewChanges: (alertId: number, alertType: string, icao: string) => void;
}

export function AlertToast({ item, onDismiss, onAck, onViewChanges }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in animation
    requestAnimationFrame(() => setVisible(true));
    // Auto dismiss after 30 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 300);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const handleAck = () => {
    onAck(item.alertId);
    setVisible(false);
    setTimeout(() => onDismiss(item.id), 300);
  };

  const handleViewChanges = () => {
    onViewChanges(item.alertId, item.alertType, item.icao);
    setVisible(false);
    setTimeout(() => onDismiss(item.id), 300);
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ease-out max-w-[380px] ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
      style={{
        backgroundColor: "rgba(22, 22, 30, 0.95)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(250, 204, 21, 0.12)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono font-bold text-white/90 tracking-wide truncate">
          {item.title}
        </p>
        <p className="text-[10px] font-mono text-white/40 mt-0.5">
          {item.icao} • {item.alertType.replace("_", " ")}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleAck}
          className="px-2.5 py-1 rounded-md border text-[9px] font-mono font-bold tracking-wider transition-all hover:scale-105"
          style={{ borderColor: "rgba(52, 211, 153, 0.4)", color: "#34d399", backgroundColor: "rgba(52, 211, 153, 0.08)" }}
        >
          ACK
        </button>
        <button
          onClick={handleViewChanges}
          className="px-2.5 py-1 rounded-md border text-[9px] font-mono font-bold tracking-wider transition-all hover:scale-105"
          style={{ borderColor: "rgba(56, 189, 248, 0.4)", color: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.08)" }}
        >
          VIEW
        </button>
      </div>
    </div>
  );
}

// ─── Toast Container — App.tsx'te render edilir ─────────────────────────────
interface ToastContainerProps {
  items: AlertToastItem[];
  onDismiss: (id: string) => void;
  onAck: (alertId: number) => void;
  onViewChanges: (alertId: number, alertType: string, icao: string) => void;
}

export function AlertToastContainer({ items, onDismiss, onAck, onViewChanges }: ToastContainerProps) {
  if (items.length === 0) return null;

  return createPortal(
    <div className="fixed top-16 right-4 z-[9998] flex flex-col gap-2">
      {items.map((item) => (
        <AlertToast
          key={item.id}
          item={item}
          onDismiss={onDismiss}
          onAck={onAck}
          onViewChanges={onViewChanges}
        />
      ))}
    </div>,
    document.body
  );
}
