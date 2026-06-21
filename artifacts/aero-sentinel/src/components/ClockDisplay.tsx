import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  TIMEZONE_GROUPS,
  DEFAULT_TIMEZONE,
  getTimezoneLabel,
  getTimezoneOffset,
  type TimezoneOption,
} from "@/lib/timezones";

export function useSelectedTimezone() {
  return usePersistedState<string>("as-clock-tz", DEFAULT_TIMEZONE);
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function TimezonePicker({
  anchorRef,
  selected,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  selected: string;
  onSelect: (tz: TimezoneOption) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pickerH = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = spaceBelow >= pickerH + 8 || spaceBelow >= rect.top;
    if (showBelow) {
      setPos({ top: rect.bottom + 4, left: Math.min(rect.right, window.innerWidth - 272) });
    } else {
      setPos({ top: rect.top - pickerH - 4, left: Math.min(rect.right, window.innerWidth - 272) });
    }
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => { ref.current?.querySelector("input")?.focus(); }, []);

  const searchLower = search.toLowerCase();
  const filteredGroups = TIMEZONE_GROUPS.map((g) => ({
    ...g,
    zones: g.zones.filter((z) =>
      z.label.toLowerCase().includes(searchLower) ||
      z.iana.toLowerCase().includes(searchLower) ||
      g.group.toLowerCase().includes(searchLower)
    ),
  })).filter((g) => g.zones.length > 0);

  return createPortal(
    <div ref={ref} className="fixed z-[9999] w-64 max-h-80 bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col" style={{ top: pos.top, left: pos.left }}>
      <div className="p-2 border-b border-border/60">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search city or timezone…"
          className="w-full bg-muted/40 border border-border/40 rounded px-2.5 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50" />
      </div>
      <div className="overflow-y-auto flex-1 p-1">
        {filteredGroups.map((group) => (
          <div key={group.group}>
            <div className="px-2 py-1 text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest sticky top-0 bg-card">{group.group}</div>
            {group.zones.map((tz) => {
              const isSelected = tz.iana === selected;
              return (
                <button key={tz.iana} onClick={() => { onSelect(tz); onClose(); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono flex items-center justify-between gap-2 transition-colors ${isSelected ? "bg-amber-400/15 text-amber-400 font-bold" : "text-foreground hover:bg-muted/40"}`}>
                  <span className="truncate">{tz.label}</span>
                  <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{getTimezoneOffset(tz.iana)}</span>
                </button>
              );
            })}
          </div>
        ))}
        {filteredGroups.length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground text-center font-mono">No results</div>}
      </div>
    </div>,
    document.body
  );
}

export function ClockCard() {
  const [selectedTz, setSelectedTz] = useSelectedTimezone();
  const [showPicker, setShowPicker] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const now = useNow();

  const utcTime = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tzTime = now.toLocaleTimeString("en-GB", { timeZone: selectedTz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tzDate = now.toLocaleDateString("en-GB", { timeZone: selectedTz, day: "2-digit", month: "short" });
  const tzLabel = getTimezoneLabel(selectedTz);
  const tzOffset = getTimezoneOffset(selectedTz);

  return (
    <div className="relative rounded-lg sm:border h-full" style={{ borderColor: "#f59e0b30", backgroundColor: "hsl(var(--card))" }}>
      <div className="absolute inset-y-0 left-0 w-[2px] sm:w-[3px] rounded-l-xl bg-amber-400" />
      <div className="flex flex-col items-center justify-center px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">
        <p className="text-[6px] sm:text-[7px] font-mono text-sky-400 uppercase tracking-widest leading-none mb-0.5">UTC</p>
        <p className="text-[11px] sm:text-lg font-mono font-black tabular-nums leading-none text-sky-300">{utcTime}</p>
        <div className="w-5 border-t border-border/50 my-0.5" />
        <button ref={btnRef} onClick={() => setShowPicker((v) => !v)}
          className="relative flex flex-col items-center justify-center w-full rounded border border-amber-400/25 bg-amber-400/5 hover:bg-amber-400/10 hover:border-amber-400/50 transition-all py-0.5 px-1.5"
          title="Click to change timezone">
          <div className="flex items-center gap-1">
            <span className="text-[7px] sm:text-[8px] font-mono text-amber-400 uppercase tracking-widest leading-none font-bold">{tzLabel}</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-amber-400/80 transition-transform ${showPicker ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <p className="text-[11px] sm:text-lg font-mono font-black tabular-nums leading-none text-amber-300">{tzTime}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[6px] sm:text-[7px] font-mono text-amber-400/70 leading-none">{tzDate}</span>
            <span className="text-[6px] sm:text-[7px] font-mono text-amber-400/50 leading-none">{tzOffset}</span>
          </div>
        </button>
      </div>
      {showPicker && (
        <TimezonePicker anchorRef={btnRef} selected={selectedTz} onSelect={(tz) => setSelectedTz(tz.iana)} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

export function ClockBadge() {
  const [selectedTz, setSelectedTz] = useSelectedTimezone();
  const [showPicker, setShowPicker] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const now = useNow();

  const utcTime = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const utcDate = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
  const tzTime = now.toLocaleTimeString("en-GB", { timeZone: selectedTz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tzDate = now.toLocaleDateString("en-GB", { timeZone: selectedTz, day: "2-digit", month: "short" });
  const tzLabel = getTimezoneLabel(selectedTz);
  const tzOffset = getTimezoneOffset(selectedTz);

  return (
    <div className="relative flex items-stretch gap-0 bg-card border border-border rounded-lg shrink-0">
      <div className="flex flex-col justify-center px-2 sm:px-4 py-1.5 sm:py-2.5 border-r border-border/60">
        <span className="text-[7px] sm:text-[9px] font-mono text-sky-400 uppercase tracking-widest leading-none mb-0.5 sm:mb-1">UTC</span>
        <span className="text-xs sm:text-base font-bold font-mono text-sky-300 leading-none tabular-nums">{utcTime}</span>
        <span className="text-[8px] sm:text-[10px] font-mono text-sky-400/50 leading-none mt-0.5">{utcDate}</span>
      </div>
      <button ref={btnRef} onClick={() => setShowPicker((v) => !v)}
        className="relative flex flex-col justify-center px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-md hover:bg-amber-400/10 transition-colors group"
        title="Click to change timezone">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[8px] sm:text-[10px] font-mono text-amber-400 uppercase tracking-widest leading-none font-bold">{tzLabel}</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`text-amber-400/70 transition-transform group-hover:text-amber-400 ${showPicker ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <span className="text-xs sm:text-base font-bold font-mono text-amber-300 leading-none tabular-nums">{tzTime}</span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] sm:text-[10px] font-mono text-amber-400/70 leading-none">{tzDate}</span>
          <span className="text-[8px] sm:text-[10px] font-mono text-amber-400/50 leading-none">{tzOffset}</span>
        </div>
      </button>
      {showPicker && (
        <TimezonePicker anchorRef={btnRef} selected={selectedTz} onSelect={(tz) => setSelectedTz(tz.iana)} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
