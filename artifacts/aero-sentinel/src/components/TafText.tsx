import { ColoredRawText } from "./ColoredRawText";

const TAF_GROUP_RE = /(?=\bBECMG\b|\bTEMPO\b|\bPROB\d{2}\b|\bFM\d{4,6}\b|\bRMK\b)/g;

function splitTaf(raw: string): string[] {
  const normalized = raw.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  return normalized.split(TAF_GROUP_RE).map((s) => s.trim()).filter(Boolean);
}

interface Props {
  raw: string;
  className?: string;
}

export function TafText({ raw, className = "" }: Props) {
  const lines = splitTaf(raw);

  if (lines.length <= 1) {
    return <ColoredRawText raw={raw} className={className} />;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, i) => (
        <div key={i} className={i > 0 ? "pl-3 border-l-2 border-border/50" : ""}>
          <ColoredRawText raw={line} />
        </div>
      ))}
    </div>
  );
}
