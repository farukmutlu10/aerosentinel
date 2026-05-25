import { tokenizeRaw } from "@/lib/metarParser";

interface Props {
  raw: string;
  className?: string;
}

export function ColoredRawText({ raw, className = "" }: Props) {
  const tokens = tokenizeRaw(raw);
  return (
    <pre className={`font-mono text-xs whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {tokens.map((tok, i) => (
        tok.color ? (
          <span
            key={i}
            style={{ color: tok.color }}
            className={tok.bold ? "font-bold" : undefined}
            title={tok.title}
          >
            {tok.text}
          </span>
        ) : (
          <span key={i} className="text-muted-foreground">{tok.text}</span>
        )
      ))}
    </pre>
  );
}
