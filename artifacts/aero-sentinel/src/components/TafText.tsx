import { ColoredRawText } from "./ColoredRawText";

const TAF_GROUP_RE = /(?=\bBECMG\b|\bTEMPO\b|\bPROB\d{2}\b|\bFM\d{4,6}\b|\bRMK\b)/g;

function splitTaf(raw: string): string[] {
  const normalized = raw.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  const parts = normalized.split(TAF_GROUP_RE).map((s) => s.trim()).filter(Boolean);

  // Merge "PROB30" / "PROB40" parts with the following TEMPO or BECMG line
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    const next = parts[i + 1];
    if (/^PROB\d{2}$/.test(cur) && next && /^(TEMPO|BECMG)\b/.test(next)) {
      merged.push(cur + " " + next);
      i++;
    } else {
      merged.push(cur);
    }
  }
  return merged;
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
