import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * First-visit splash screen — Glitch Reveal effect.
 * Gold background (#d4a843), dark monokrom text (#0f0f1a).
 * 2.5 seconds total. Shows on every new tab (sessionStorage), not on page refresh.
 * Blocks all content underneath during display.
 */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"enter" | "show" | "exit">("enter");

  useEffect(() => {
    // Always show splash if opened as kiosk (query param ?kiosk=...)
    const isKiosk = new URLSearchParams(window.location.search).has("kiosk");
    if (!isKiosk) {
      const seen = sessionStorage.getItem("aero-splash-seen");
      if (seen) return;
      sessionStorage.setItem("aero-splash-seen", "1");
    }
    setShow(true);

    const t1 = setTimeout(() => setPhase("show"), 50);
    const t2 = setTimeout(() => setPhase("exit"), 2200);
    const t3 = setTimeout(() => setShow(false), 2500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (!show) return null;

  // Start fully opaque so dashboard never shows underneath
  const bgOpacity = phase === "exit" ? 0 : 1;

  return createPortal(
    <>
      <style>{`
        @keyframes splash-glitch {
          0% { opacity: 0; transform: translateX(-4px); }
          5% { opacity: 1; transform: translateX(3px); }
          8% { transform: translateX(-2px); }
          10% { transform: translateX(0); }
          12% { opacity: 1; }
          75% { opacity: 1; }
          80% { opacity: 1; transform: translateX(2px); }
          82% { transform: translateX(-1px); }
          85% { transform: translateX(0); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes splash-glitch-r {
          0% { opacity: 0; clip-path: inset(0 0 100% 0); }
          5% { opacity: 0.7; clip-path: inset(20% 0 60% 0); transform: translateX(3px); }
          8% { clip-path: inset(50% 0 30% 0); transform: translateX(-2px); }
          10% { clip-path: inset(0); transform: translateX(0); opacity: 0; }
          12% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes splash-glitch-b {
          0% { opacity: 0; clip-path: inset(100% 0 0 0); }
          5% { opacity: 0.7; clip-path: inset(60% 0 20% 0); transform: translateX(-3px); }
          8% { clip-path: inset(30% 0 50% 0); transform: translateX(2px); }
          10% { clip-path: inset(0); transform: translateX(0); opacity: 0; }
          12% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes splash-scanline {
          0% { opacity: 0.5; }
          75% { opacity: 0.5; }
          100% { opacity: 0; }
        }
      `}</style>
      {/* Solid backdrop — blocks all content underneath */}
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center"
        style={{
          backgroundColor: "#d4a843",
          opacity: bgOpacity,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        {/* Scanlines overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
            animation: "splash-scanline 2s linear forwards",
            pointerEvents: "none",
          }}
        />

        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at center, rgba(255,255,255,0.12) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        {/* Glitch text — main layer */}
        <span
          className="select-none"
          style={{
            fontFamily: "'Psilograph', Impact, 'Arial Narrow', sans-serif",
            textTransform: "uppercase",
            fontSize: "clamp(48px, 8vw, 100px)",
            lineHeight: 1,
            letterSpacing: 0,
            display: "flex",
            alignItems: "baseline",
            color: "#0f0f1a",
            position: "relative",
            zIndex: 2,
            animation: phase === "show" ? "splash-glitch 2s steps(1) forwards" : "none",
            opacity: 0,
            textShadow: "0 2px 16px rgba(0,0,0,0.12)",
          }}
          data-text="AEROSENTINEL"
        >
          <span style={{ fontWeight: 100 }}>AERO</span>
          <span style={{ fontWeight: 600 }}>SENTINEL</span>
        </span>

        {/* Glitch red ghost */}
        <span
          className="select-none"
          aria-hidden="true"
          style={{
            fontFamily: "'Psilograph', Impact, 'Arial Narrow', sans-serif",
            textTransform: "uppercase",
            fontSize: "clamp(48px, 8vw, 100px)",
            lineHeight: 1,
            letterSpacing: 0,
            display: "flex",
            alignItems: "baseline",
            color: "#ff0040",
            position: "absolute",
            zIndex: 3,
            animation: phase === "show" ? "splash-glitch-r 2s steps(1) forwards" : "none",
            opacity: 0,
          }}
        >
          <span style={{ fontWeight: 100 }}>AERO</span>
          <span style={{ fontWeight: 600 }}>SENTINEL</span>
        </span>

        {/* Glitch cyan ghost */}
        <span
          className="select-none"
          aria-hidden="true"
          style={{
            fontFamily: "'Psilograph', Impact, 'Arial Narrow', sans-serif",
            textTransform: "uppercase",
            fontSize: "clamp(48px, 8vw, 100px)",
            lineHeight: 1,
            letterSpacing: 0,
            display: "flex",
            alignItems: "baseline",
            color: "#00d4ff",
            position: "absolute",
            zIndex: 3,
            animation: phase === "show" ? "splash-glitch-b 2s steps(1) forwards" : "none",
            opacity: 0,
          }}
        >
          <span style={{ fontWeight: 100 }}>AERO</span>
          <span style={{ fontWeight: 600 }}>SENTINEL</span>
        </span>
      </div>
    </>,
    document.body
  );
}
