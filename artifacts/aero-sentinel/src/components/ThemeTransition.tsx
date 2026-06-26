import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  targetTheme: "dark" | "light";
  onComplete: () => void;
}

export function ThemeTransition({ targetTheme, onComplete }: Props) {
  const [phase, setPhase] = useState<"enter" | "show" | "exit">("enter");

  useEffect(() => {
    // Phase 1: enter (0-200ms)
    const t1 = setTimeout(() => setPhase("show"), 50);
    // Phase 2: show (200-600ms) — tema değişimi burada olur
    const t2 = setTimeout(() => {
      onComplete();
      setPhase("exit");
    }, 500);
    // Phase 3: exit (600-900ms)
    const t3 = setTimeout(() => setPhase("exit"), 800);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const isDark = targetTheme === "dark";
  const symbol = isDark ? "🌙" : "☀️";
  const label = isDark ? "Dark Mode" : "Light Mode";

  const bgOpacity = phase === "enter" ? 0 : phase === "show" ? 1 : 0;
  const scale = phase === "enter" ? 0.3 : phase === "show" ? 1 : 0.3;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none"
      style={{
        backgroundColor: isDark ? "rgba(0, 0, 0, 0.85)" : "rgba(255, 255, 255, 0.9)",
        opacity: bgOpacity,
        transition: "opacity 0.3s ease",
      }}
    >
      <div
        className="flex flex-col items-center gap-3"
        style={{
          transform: `scale(${scale})`,
          transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <span className="text-5xl" role="img" aria-label={label}>{symbol}</span>
        <span
          className="font-mono font-bold text-sm tracking-[0.2em] uppercase"
          style={{ color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)" }}
        >
          {label}
        </span>
      </div>
    </div>,
    document.body
  );
}
