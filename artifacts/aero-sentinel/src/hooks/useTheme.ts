import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";
const KEY = "aero-sentinel-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {}
    return "dark";
  });

  const [transitioning, setTransitioning] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setPendingTheme(next);
    setTransitioning(true);
  }, [theme]);

  const completeTransition = useCallback(() => {
    if (pendingTheme) {
      setTheme(pendingTheme);
      setPendingTheme(null);
    }
    setTransitioning(false);
  }, [pendingTheme]);

  return { theme, toggleTheme, transitioning, pendingTheme, completeTransition };
}
