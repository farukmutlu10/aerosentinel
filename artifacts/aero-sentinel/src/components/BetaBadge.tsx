/** Small premium-styled pill signaling a feature is still in active development. */
export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center text-[8px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0 ${className}`}
      style={{
        background: "linear-gradient(135deg, #f5d78e, #d4a843)",
        color: "#1a1405",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      }}
    >
      BETA
    </span>
  );
}
