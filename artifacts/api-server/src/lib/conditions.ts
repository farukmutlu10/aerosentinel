/**
 * Pure, side-effect-free weather condition detection functions.
 * Shared between monitor.ts (scanner) and watchlist.ts (sync detection).
 * Extracted here for testability and to avoid code duplication.
 */

/**
 * Detect LIFR (Low IFR) conditions from a raw METAR/TAF string.
 *
 * LIFR criteria (ICAO):
 *   - Visibility < 1600 m  AND  > 0 (not missing/CALM)
 *   - Ceiling (lowest BKN/OVC/VV) < 500 ft
 *
 * Uses token-based parsing for robustness against variable wind direction
 * groups (dddVddd) that break adjacency-based regex, e.g.:
 *   "18008G15KT 150V210 0800"
 *
 * @param rawMetar - Raw METAR or TAF weather string
 * @returns true if LIFR conditions are detected
 */
export function hasLifrConditions(rawMetar: string): boolean {
  // CAVOK means good conditions, not LIFR
  if (rawMetar.includes("CAVOK")) return false;

  // Token-based visibility parsing — robust against variable wind direction groups
  // that break the old wind+visibility adjacency regex (e.g., "18008G15KT 150V210 0800").
  const tokens = rawMetar.split(/\s+/);
  let visMeters: number | null = null;
  let foundWind = false;

  for (let i = 0; i < tokens.length; i++) {
    // Match wind group: dddss[Ggg](KT|MPS|KMH) or VRBss[Ggg](KT|MPS|KMH)
    if (/^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS|KMH)$/.test(tokens[i])) {
      foundWind = true;
      continue;
    }
    if (foundWind) {
      // Skip optional variable wind direction group (dddVddd)
      if (/^\d{3}V\d{3}$/.test(tokens[i])) continue;
      // Next token should be visibility
      if (/^\d{4}$/.test(tokens[i])) {
        visMeters = parseInt(tokens[i], 10);
      }
      break;
    }
  }

  if (visMeters !== null && visMeters < 1600 && visMeters > 0) return true;

  // Parse ceiling: lowest BKN, OVC, or VV layer
  const ceilMatches = [...rawMetar.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)];
  for (const m of ceilMatches) {
    const heightFt = parseInt(m[2], 10) * 100;
    if (heightFt < 500) return true;
  }

  return false;
}

/**
 * Parse the TAF text and return the currently active time segment.
 * Returns the FM segment whose start time ≤ now, or the base section if
 * no FM has started yet.  Returns null when the TAF has no FM groups
 * (entire TAF is base conditions — handled by text-change detection).
 *
 * @param rawTaf - Full raw TAF text
 * @param now    - Current time (defaults to new Date())
 */
export function getActiveTafPeriod(rawTaf: string, now?: Date): { key: string; text: string } | null {
  const _now = now ?? new Date();
  const nowDay = _now.getUTCDate();
  const nowHHMM = _now.getUTCHours() * 60 + _now.getUTCMinutes();

  const fmMatches = [...rawTaf.matchAll(/\bFM(\d{2})(\d{2})(\d{2})\b/g)];
  if (fmMatches.length === 0) {
    // No FM groups — base conditions only; text-change detection handles this
    return null;
  }

  // Find the most recent FM that has already started
  let activeIdx = -1; // -1 = base (before any FM)
  for (let i = 0; i < fmMatches.length; i++) {
    const fmDay = parseInt(fmMatches[i][1], 10);
    const fmHHMM = parseInt(fmMatches[i][2], 10) * 60 + parseInt(fmMatches[i][3], 10);
    // TAFs span <30 h so a simple day comparison suffices
    if (fmDay < nowDay || (fmDay === nowDay && fmHHMM <= nowHHMM)) {
      activeIdx = i;
    }
  }

  if (activeIdx === -1) {
    // Before any FM — base section (text before first FM)
    const baseEnd = fmMatches[0].index!;
    const baseText = rawTaf.substring(0, baseEnd).trim();
    return { key: "BASE", text: baseText || rawTaf };
  }

  // Extract text from active FM marker to next FM (or end of TAF)
  const fm = fmMatches[activeIdx];
  const startIdx = fm.index! + fm[0].length;
  const endIdx = activeIdx + 1 < fmMatches.length
    ? fmMatches[activeIdx + 1].index!
    : rawTaf.length;
  const segmentText = rawTaf.substring(startIdx, endIdx).trim();
  return { key: fm[0], text: segmentText || rawTaf };
}

/**
 * Parse TEMPO/BECMG groups from a TAF and return weather text for groups
 * whose time range overlaps the current time.
 *
 * TEMPO groups augment base/FM conditions — they don't replace them.
 * Example:
 *   TAF 1206/1224 18012KT 9999
 *        TEMPO 1212/1218 +TSRA
 *        FM121800 24008KT 9999
 *   At 12:15 UTC → returns ["+TSRA"] (TEMPO active during base period)
 *
 * BECMG groups indicate gradual transitions; the weather after BECMG DDHH/DDHH
 * is what conditions are becoming, so we check if we're in the transition window.
 *
 * @param rawTaf - Full raw TAF text
 * @param now    - Current time (defaults to new Date())
 */
export function getActiveTempos(rawTaf: string, now?: Date): string[] {
  const _now = now ?? new Date();
  const nowDay = _now.getUTCDate();
  const nowHHMM = _now.getUTCHours() * 60 + _now.getUTCMinutes();
  const nowTotalMin = nowDay * 1440 + nowHHMM;

  const active: string[] = [];

  // Match both TEMPO and BECMG groups
  const groupRe = /\b(TEMPO|BECMG)\s+(\d{2})(\d{2})\/(\d{2})(\d{2})\b/g;
  let match: RegExpExecArray | null;

  while ((match = groupRe.exec(rawTaf)) !== null) {
    const startDay = parseInt(match[2], 10);
    const startH = parseInt(match[3], 10);
    const endDay = parseInt(match[4], 10);
    const endH = parseInt(match[5], 10);

    const startTotalMin = startDay * 1440 + startH * 60;
    const endTotalMin = endDay * 1440 + endH * 60;

    if (nowTotalMin >= startTotalMin && nowTotalMin < endTotalMin) {
      // Extract weather text: everything after the group header until next section marker
      const afterHeader = rawTaf.substring(match.index! + match[0].length);
      const nextMarker = afterHeader.search(
        /\b(?:FM\d{2}\d{4}|TEMPO\s+\d{2}\d{2}\/|BECMG\s+\d{2}\d{2}\/|PROB\d{2}\s+(?:TEMPO\s+)?\d{2}\d{2}\/)\b/,
      );
      const weatherText = nextMarker >= 0
        ? afterHeader.substring(0, nextMarker).trim()
        : afterHeader.trim();
      if (weatherText) active.push(weatherText);
    }
  }

  return active;
}

/**
 * Extreme weather codes used for WX_EXTREME detection in TAF/METAR.
 */
export const EXTREME_WX_CODES = [
  "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
  "DS", "-DS", "+DS", "SS", "-SS", "+SS",
  "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
  "TSSN", "+TSSN", "TSGR", "TSPL",
  "-FZRA", "FZRA", "+FZRA", "FZDZ", "-FZDZ", "+FZDZ", "FZFG", "FZSN",
  "BLSN", "+BLSN", "-BLSN", "DRSN", "-RASN", "RASN", "+RASN",
  "SHGR", "SHGS",
  "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
];

/**
 * Detect extreme weather phenomena in a raw METAR/TAF string.
 */
export function hasWxExtreme(raw: string): boolean {
  for (const code of EXTREME_WX_CODES) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  return false;
}

/**
 * Detect extreme wind conditions in a raw METAR/TAF string.
 * Thresholds: KT ≥ 25 / gust ≥ 29, MPS ≥ 13 / gust ≥ 15, KMH converted to KT equivalent.
 */
export function hasWindExtreme(raw: string): boolean {
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
    const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
    if (spd >= 25 || gst >= 29) return true;
  }
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
    const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
    if (spd >= 13 || gst >= 15) return true;
  }
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
    const spd = Math.round(parseInt(m[1]) * 0.5399568); const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
    if (spd >= 25 || gst >= 29) return true;
  }
  return false;
}
