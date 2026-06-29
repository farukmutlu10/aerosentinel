import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  targetTheme: "dark" | "light";
  onComplete: () => void;
}

/**
 * Logo color transition overlay shown during theme switches.
 *
 * Gold monokrom logo fades/transitions to the target variant:
 *  - Dark→Light : gold → white monokrom (#d4a843 → #f0f0f0)
 *  - Light→Dark : gold → dark monokrom  (#d4a843 → #1a1a2e)
 *
 * Duration: ~2000ms total
 */
export function ThemeTransition({ targetTheme, onComplete }: Props) {
  const [phase, setPhase] = useState<"enter" | "show" | "exit">("enter");

  const fromColor = "#d4a843";
  // Dark theme → gold→dark, Light theme → gold→white
  const toColor = targetTheme === "dark" ? "#1a1a2e" : "#f0f0f0";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("show"), 200);
    const t2 = setTimeout(() => {
      onComplete();
      setPhase("exit");
    }, 1800);
    const t3 = setTimeout(() => setPhase("exit"), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const bgOpacity = phase === "enter" ? 0 : phase === "show" ? 1 : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none"
      style={{
        backgroundColor: targetTheme === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
        opacity: bgOpacity,
        transition: "opacity 0.4s ease-in-out",
      }}
    >
      {/* Logo — 2x bigger, no label, color transition */}
      <span
        className="select-none"
        style={{
          fontFamily: "'Psilograph', Impact, 'Arial Narrow', sans-serif",
          textTransform: "uppercase",
          fontSize: "144px",
          lineHeight: 1,
          letterSpacing: 0,
          display: "flex",
          alignItems: "baseline",
          color: phase === "enter" ? fromColor : toColor,
          transition: "color 1.5s ease-in-out",
        }}
      >
        <span style={{ fontWeight: 100 }}>AERO</span>
        <span style={{ fontWeight: 600 }}>SENTINEL</span>
      </span>
    </div>,
    document.body
  );
}
