import { useState, useCallback, useEffect } from "react";

const SNOOZE_KEY = "aero-alert-snooze-v1";

export interface SnoozeEntry {
  icao: string;       // "__GLOBAL__" for all-airport snooze
  until: number;      // UTC timestamp when snooze expires
  createdAt: number;
}

export type SnoozeDuration = "1h" | "4h" | "8h" | "24h";

const DURATION_MS: Record<SnoozeDuration, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "4h":  4 * 60 * 60 * 1000,
  "8h":  8 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

export const SNOOZE_OPTIONS: { value: SnoozeDuration; label: string }[] = [
  { value: "1h",  label: "1 hour" },
  { value: "4h",  label: "4 hours" },
  { value: "8h",  label: "8 hours" },
  { value: "24h", label: "24 hours" },
];

function loadSnoozes(): SnoozeEntry[] {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Filter expired entries on load
    const now = Date.now();
    return arr.filter((s: SnoozeEntry) => s.until > now);
  } catch { return []; }
}

function saveSnoozes(entries: SnoozeEntry[]) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

export function useAlertSnooze() {
  const [snoozes, setSnoozes] = useState<SnoozeEntry[]>(loadSnoozes);

  // Clean expired entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSnoozes(prev => {
        const now = Date.now();
        const clean = prev.filter(s => s.until > now);
        if (clean.length !== prev.length) saveSnoozes(clean);
        return clean;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SNOOZE_KEY && e.newValue) {
        try {
          const arr = JSON.parse(e.newValue) as SnoozeEntry[];
          if (Array.isArray(arr)) {
            const now = Date.now();
            setSnoozes(arr.filter(s => s.until > now));
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const snooze = useCallback((icao: string, duration: SnoozeDuration) => {
    setSnoozes(prev => {
      const filtered = prev.filter(s => s.icao !== icao);
      const entry: SnoozeEntry = {
        icao,
        until: Date.now() + DURATION_MS[duration],
        createdAt: Date.now(),
      };
      const next = [...filtered, entry];
      saveSnoozes(next);
      return next;
    });
  }, []);

  const snoozeAll = useCallback((duration: SnoozeDuration) => {
    snooze("__GLOBAL__", duration);
  }, [snooze]);

  const unsnooze = useCallback((icao: string) => {
    setSnoozes(prev => {
      const next = prev.filter(s => s.icao !== icao);
      saveSnoozes(next);
      return next;
    });
  }, []);

  const unsnoozeAll = useCallback(() => {
    setSnoozes([]);
    saveSnoozes([]);
  }, []);

  const isSnoozed = useCallback((icao: string): boolean => {
    const now = Date.now();
    return snoozes.some(s => (s.icao === icao || s.icao === "__GLOBAL__") && s.until > now);
  }, [snoozes]);

  const isGloballySnoozed = useCallback((): boolean => {
    const now = Date.now();
    return snoozes.some(s => s.icao === "__GLOBAL__" && s.until > now);
  }, [snoozes]);

  const getSnoozeExpiry = useCallback((icao: string): number | null => {
    const now = Date.now();
    const entry = snoozes.find(s => (s.icao === icao || s.icao === "__GLOBAL__") && s.until > now);
    return entry ? entry.until : null;
  }, [snoozes]);

  return {
    snooze,
    snoozeAll,
    unsnooze,
    unsnoozeAll,
    isSnoozed,
    isGloballySnoozed,
    getSnoozeExpiry,
    snoozes,
  };
}
