/**
 * Wind extraction (METAR + TAF) and runway headwind/crosswind math for the
 * dashboard's per-airport wind panel. Pure functions only — no React here.
 */

export interface WindReport {
  id: string;
  /** e.g. "METAR", "TAF başlangıç", "TAF BECMG", "TAF TEMPO", "TAF FM" */
  label: string;
  /** e.g. "(042050Z)", "(0412Z)", "(01:18–01:21)" — already parenthesized-free, caller wraps it */
  timeLabel: string | null;
  dirDeg: number | null; // null when VRB
  isVariable: boolean;
  isCalm: boolean;
  speedKt: number;
  gustKt: number | null;
  raw: string;
  /** max(speedKt, gustKt ?? 0) — used to pick the "most severe" default */
  severityKt: number;
}

// Per spec: VRB|3-digit dir, 2-3 digit speed, optional gust, KT|MPS unit.
// KMH is also accepted (some TAFs use it, mirrors metarParser's existing support).
const WIND_RE = /\b(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)\b/;

function toKt(value: number, unit: string): number {
  if (unit === "MPS") return Math.round(value * 1.94384 * 10) / 10;
  if (unit === "KMH") return Math.round(value * 0.5399568 * 10) / 10;
  return value;
}

function parseWindToken(text: string): Omit<WindReport, "id" | "label" | "timeLabel"> | null {
  const m = text.match(WIND_RE);
  if (!m) return null;
  const [raw, dirRaw, spdRaw, gstRaw, unit] = m;
  const isVariable = dirRaw === "VRB";
  const dirDeg = isVariable ? null : parseInt(dirRaw, 10);
  const speedKt = toKt(parseInt(spdRaw, 10), unit);
  const gustKt = gstRaw ? toKt(parseInt(gstRaw, 10), unit) : null;
  const isCalm = !isVariable && dirDeg === 0 && speedKt === 0;
  return {
    dirDeg,
    isVariable,
    isCalm,
    speedKt,
    gustKt,
    raw,
    severityKt: Math.max(speedKt, gustKt ?? 0),
  };
}

function extractMetarReport(rawMetar: string): WindReport | null {
  const wind = parseWindToken(rawMetar);
  if (!wind) return null;
  const timeMatch = rawMetar.match(/\b\d{2}(\d{2})(\d{2})Z\b/);
  const timeLabel = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}Z` : null;
  return { id: "metar", label: "METAR", timeLabel, ...wind };
}

const TAF_GROUP_RE = /(?=\bBECMG\b|\bTEMPO\b|\bPROB\d{2}\b|\bFM\d{4,6}\b|\bRMK\b)/g;

function splitTafGroups(rawTaf: string): string[] {
  const normalized = rawTaf.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  const parts = normalized.split(TAF_GROUP_RE).map((s) => s.trim()).filter(Boolean);
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

function formatDdhhPoint(ddhh: string): string {
  return `${ddhh}Z`;
}

function formatDdhhRange(startDdhh: string, endDdhh: string): string {
  const fmt = (s: string) => `${s.slice(0, 2)}:${s.slice(2, 4)}`;
  return `${fmt(startDdhh)}–${fmt(endDdhh)}`;
}

function extractTafReports(rawTaf: string): WindReport[] {
  const groups = splitTafGroups(rawTaf);
  const reports: WindReport[] = [];

  groups.forEach((group, idx) => {
    if (/^RMK\b/.test(group)) return; // remarks carry no forecast wind

    let label: string;
    let timeLabel: string | null = null;

    if (idx === 0) {
      label = "TAF başlangıç";
      const periodMatch = group.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
      if (periodMatch) timeLabel = formatDdhhPoint(periodMatch[1] + periodMatch[2]);
    } else if (/^PROB\d{2}\s+TEMPO\b/.test(group)) {
      const probNum = group.match(/^PROB(\d{2})/)?.[1] ?? "";
      label = `TAF PROB${probNum} TEMPO`;
      const periodMatch = group.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
      if (periodMatch) timeLabel = formatDdhhRange(periodMatch[1] + periodMatch[2], periodMatch[3] + periodMatch[4]);
    } else if (/^BECMG\b/.test(group)) {
      label = "TAF BECMG";
      const periodMatch = group.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
      if (periodMatch) timeLabel = formatDdhhRange(periodMatch[1] + periodMatch[2], periodMatch[3] + periodMatch[4]);
    } else if (/^TEMPO\b/.test(group)) {
      label = "TAF TEMPO";
      const periodMatch = group.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
      if (periodMatch) timeLabel = formatDdhhRange(periodMatch[1] + periodMatch[2], periodMatch[3] + periodMatch[4]);
    } else if (/^FM\d{4,6}\b/.test(group)) {
      label = "TAF FM";
      const fmMatch = group.match(/^FM(\d{4,6})/);
      if (fmMatch) timeLabel = formatDdhhPoint(fmMatch[1].slice(0, 4));
    } else {
      label = "TAF";
    }

    const wind = parseWindToken(group);
    if (!wind) return; // group carries no wind of its own — previous value still holds, no new list entry

    reports.push({ id: `taf-${idx}`, label, timeLabel, ...wind });
  });

  return reports;
}

/** All wind groups found across a METAR and its paired TAF, in report order (METAR first). */
export function extractAllWindReports(rawMetar: string | null, rawTaf: string | null): WindReport[] {
  const reports: WindReport[] = [];
  if (rawMetar) {
    const m = extractMetarReport(rawMetar);
    if (m) reports.push(m);
  }
  if (rawTaf) reports.push(...extractTafReports(rawTaf));
  return reports;
}

/** Most severe report by max(sustained, gust); ties prefer the current METAR, then the earliest TAF group. */
export function pickDefaultReport(reports: WindReport[]): WindReport | null {
  if (reports.length === 0) return null;
  return reports.reduce((best, cur) => {
    if (cur.severityKt > best.severityKt) return cur;
    if (cur.severityKt === best.severityKt && best.id !== "metar" && cur.id === "metar") return cur;
    return best;
  }, reports[0]);
}

export interface RunwayWindResult {
  /** Positive = headwind, negative = tailwind */
  headwindKt: number;
  /** Absolute crosswind magnitude */
  crosswindKt: number;
  crosswindSide: "L" | "R" | null;
}

export function calcRunwayWind(windDirDeg: number, windSpeedKt: number, runwayHeadingDegT: number): RunwayWindResult {
  const diffRad = ((windDirDeg - runwayHeadingDegT) * Math.PI) / 180;
  const headwindKt = Math.round(windSpeedKt * Math.cos(diffRad) * 10) / 10;
  const crosswindRaw = windSpeedKt * Math.sin(diffRad);
  const crosswindKt = Math.round(Math.abs(crosswindRaw) * 10) / 10;
  const crosswindSide = Math.abs(crosswindRaw) < 0.05 ? null : crosswindRaw > 0 ? "R" : "L";
  return { headwindKt, crosswindKt, crosswindSide };
}
