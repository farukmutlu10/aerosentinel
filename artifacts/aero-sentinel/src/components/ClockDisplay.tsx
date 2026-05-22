import { useState, useEffect } from "react";

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ClockCard() {
  const now = useNow();
  const utcTime = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const utcDate = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
  const istTime = now.toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const istDate = now.toLocaleDateString("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short" });

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex flex-col gap-1.5">
        <div className="pb-1.5 border-b border-border/50">
          <p className="text-[9px] font-mono text-sky-400 uppercase tracking-widest mb-0.5">UTC</p>
          <p className="text-lg font-bold font-mono text-sky-300 leading-none">{utcTime}</p>
          <p className="text-[10px] text-sky-400/60 font-mono">{utcDate}</p>
        </div>
        <div className="pt-0.5">
          <p className="text-[9px] font-mono text-amber-400 uppercase tracking-widest mb-0.5">IST (UTC+3)</p>
          <p className="text-lg font-bold font-mono text-amber-300 leading-none">{istTime}</p>
          <p className="text-[10px] text-amber-400/60 font-mono">{istDate}</p>
        </div>
      </div>
    </div>
  );
}

export function ClockBadge() {
  const now = useNow();
  const utcTime = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const utcDate = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
  const istTime = now.toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const istDate = now.toLocaleDateString("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short" });

  return (
    <div className="flex items-stretch gap-0 bg-card border border-border rounded-lg overflow-hidden shrink-0">
      <div className="flex flex-col justify-center px-4 py-2.5 border-r border-border/60">
        <span className="text-[9px] font-mono text-sky-400 uppercase tracking-widest leading-none mb-1">UTC</span>
        <span className="text-base font-bold font-mono text-sky-300 leading-none tabular-nums">{utcTime}</span>
        <span className="text-[10px] font-mono text-sky-400/50 leading-none mt-0.5">{utcDate}</span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2.5">
        <span className="text-[9px] font-mono text-amber-400 uppercase tracking-widest leading-none mb-1">IST (UTC+3)</span>
        <span className="text-base font-bold font-mono text-amber-300 leading-none tabular-nums">{istTime}</span>
        <span className="text-[10px] font-mono text-amber-400/50 leading-none mt-0.5">{istDate}</span>
      </div>
    </div>
  );
}
