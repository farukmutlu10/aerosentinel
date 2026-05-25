export enum FlightCategory {
  VFR = "VFR",
  MVFR = "MVFR",
  IFR = "IFR",
  LIFR = "LIFR",
}

export const CATEGORY_COLOR: Record<FlightCategory, string> = {
  [FlightCategory.VFR]:  "#22c55e",
  [FlightCategory.MVFR]: "#3b82f6",
  [FlightCategory.IFR]:  "#ef4444",
  [FlightCategory.LIFR]: "#a855f7",
};

export const CATEGORY_BG: Record<FlightCategory, string> = {
  [FlightCategory.VFR]:  "bg-green-500/10 border-green-500/40",
  [FlightCategory.MVFR]: "bg-blue-500/10 border-blue-500/40",
  [FlightCategory.IFR]:  "bg-red-500/10 border-red-500/40",
  [FlightCategory.LIFR]: "bg-purple-500/10 border-purple-500/40",
};

export interface WindData {
  direction: string;
  sustainedKt: number;
  gustKt?: number;
  dangerColor: string;
  raw: string;
}

export interface CloudLayer {
  type: "FEW" | "SCT" | "BKN" | "OVC" | "VV";
  heightFt: number;
  raw: string;
}

export interface MetarParsed {
  stationId: string;
  raw: string;
  flightCategory: FlightCategory;
  categoryColor: string;
  visibility?: number;
  cavok: boolean;
  ceiling?: { feet: number; type: "BKN" | "OVC" | "VV" };
  wind?: WindData;
  phenomena: Array<{ code: string; label: string; danger: boolean }>;
  valid: boolean;
}

export const WX_LABELS: Record<string, string> = {
  TS: "Thunderstorm", TSRA: "T-storm/Rain", TSGR: "T-storm/Hail",
  TSSN: "T-storm/Snow", TSPL: "T-storm/Ice Pellets",
  FG: "Fog", FZFG: "Freezing Fog",
  FZRA: "Freezing Rain", FZDZ: "Freezing Drizzle",
  "-FZRA": "Lt Freezing Rain", "+FZRA": "Hvy Freezing Rain",
  "-FZDZ": "Lt Freezing Drizzle", "+FZDZ": "Hvy Freezing Drizzle",
  BR: "Mist", HZ: "Haze", FU: "Smoke", DU: "Dust", SA: "Sand",
  VA: "Volcanic Ash", GR: "Hail", GS: "Small Hail",
  "-DZ": "Lt Drizzle", DZ: "Drizzle", "+DZ": "Hvy Drizzle",
  "-RA": "Lt Rain", RA: "Rain", "+RA": "Hvy Rain",
  "-SN": "Lt Snow", SN: "Snow", "+SN": "Hvy Snow",
  "-RASN": "Lt Rain/Snow", RASN: "Rain/Snow Mix", "+RASN": "Hvy Rain/Snow",
  BLSN: "Blowing Snow", "+BLSN": "Hvy Blowing Snow",
  DRSN: "Drifting Snow", BLDU: "Blowing Dust", BLSA: "Blowing Sand",
  DRDU: "Drifting Dust", DRSA: "Drifting Sand",
  SH: "Showers", SHRA: "Rain Showers", "-SHRA": "Lt Rain Showers",
  "+SHRA": "Hvy Rain Showers", SHSN: "Snow Showers", "-SHSN": "Lt Snow Showers",
  "+SHSN": "Hvy Snow Showers", SHGR: "Hail Showers", SHGS: "Small Hail Showers",
  VCSH: "Vcnty Showers", VCTS: "Vcnty T-storm",
  SS: "Sandstorm", DS: "Duststorm", SG: "Snow Grains",
  IC: "Ice Crystals", PL: "Ice Pellets", FC: "Funnel Cloud", SQ: "Squall",
  NSW: "No Sig Weather", CB: "Cumulonimbus",
  "-TS": "Lt Thunderstorm", "+TS": "Hvy Thunderstorm",
  "-TSRA": "Lt T-storm/Rain", "+TSRA": "Hvy T-storm/Rain",
  "-SH": "Lt Showers", "+SH": "Hvy Showers",
};

// ── Critical / orange wx sets ─────────────────────────────────────────────────

/** Orange-level phenomena */
export const ORANGE_WX = new Set([
  "VCTS", "TS", "-TS", "TSRA", "-TSRA", "CB",
  "DU", "FU", "-SH", "SH", "-RA", "RA", "SHRA", "-SHRA",
  "SA", "FG", "BLDU", "BLSA", "DRDU", "DRSA",
]);

/** Red/critical phenomena */
export const RED_WX = new Set([
  "+TS", "+TSRA", "+SH", "+SHRA", "DS", "SS",
  "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
  "TSSN", "+TSSN", "TSGR", "TSPL",
  "-FZRA", "FZRA", "+FZRA",
  "FZDZ", "-FZDZ", "+FZDZ",
  "FZFG",
  "BLSN", "+BLSN", "-BLSN", "DRSN",
  "-RASN", "RASN", "+RASN",
  "SHGR", "SHGS",
  "IC", "PL", "GR", "GS", "VA", "FC", "SQ",
]);

const DANGER_CODES = [...RED_WX];

/** Returns true if raw text contains any red (critical) weather code */
export function hasCritWx(raw: string): boolean {
  for (const code of RED_WX) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  // Also check compound codes not explicitly listed
  if (/\b(BL|DR)(SN)/.test(raw)) return true;
  if (/\bFZ(FG|DZ|SN)\b/.test(raw)) return true;
  if (/\bTS(SN|GR|PL)\b/.test(raw)) return true;
  return false;
}

/** Returns true if raw text contains any orange weather code */
export function hasOrangeWx(raw: string): boolean {
  for (const code of ORANGE_WX) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  return false;
}

// ── Internal parsers ──────────────────────────────────────────────────────────

function parseWind(raw: string): WindData | undefined {
  const m = raw.match(/\b(?<dir>\d{3}|VRB)(?<spd>\d{2,3})(?:G(?<gst>\d{2,3}))?KT\b/);
  if (!m?.groups) return undefined;
  const sustainedKt = parseInt(m.groups.spd);
  const gustKt = m.groups.gst ? parseInt(m.groups.gst) : undefined;
  const g = gustKt ?? 0;
  let dangerColor: string;
  if (sustainedKt >= 15 || g >= 25) dangerColor = "#ef4444";
  else if (sustainedKt >= 12 || g >= 20) dangerColor = "#f97316";
  else dangerColor = "";
  return { direction: m.groups.dir, sustainedKt, gustKt, dangerColor, raw: m[0] };
}

function parseVisibility(raw: string): { meters?: number; cavok: boolean } {
  if (/\b(CAVOK|NSC|NCD|SKC|CLR)\b/.test(raw)) return { meters: 9999, cavok: true };
  const m = raw.match(/(?:^|\s)(?<vis>\d{4})(?!\/)(?:\s|$)/);
  if (m?.groups) return { meters: parseInt(m.groups.vis), cavok: false };
  return { cavok: false };
}

function parseCeiling(raw: string): { feet: number; type: "BKN" | "OVC" | "VV" } | undefined {
  const layers = [...raw.matchAll(/\b(?<type>BKN|OVC|VV)(?<h>\d{3})\b/g)];
  if (!layers.length) return undefined;
  let lowest = Infinity, lowestType: "BKN" | "OVC" | "VV" = "BKN";
  for (const l of layers) {
    if (!l.groups) continue;
    const ft = parseInt(l.groups.h) * 100;
    if (ft < lowest) { lowest = ft; lowestType = l.groups.type as "BKN" | "OVC" | "VV"; }
  }
  return lowest === Infinity ? undefined : { feet: lowest, type: lowestType };
}

function parsePhenomena(raw: string) {
  const found: Array<{ code: string; label: string; danger: boolean }> = [];
  const wxPat = /\b(\+?(?:TS|SH|FZ|DR|BL|VC|MI|PR|BC)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|NSW)[\w]*|\+SN|GR|TS|FG|VA|VCSH|VCTS)\b/g;
  const seen = new Set<string>();
  for (const m of raw.matchAll(wxPat)) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    const label = WX_LABELS[code] ?? code;
    const danger = DANGER_CODES.some((d) => code === d || code.includes(d));
    found.push({ code, label, danger });
  }
  return found;
}

function categorizeFlight(
  vis?: number,
  ceiling?: { feet: number },
): FlightCategory {
  const v = vis ?? 9999;
  const c = ceiling?.feet ?? 99999;

  if (v < 1600 || c < 500) return FlightCategory.LIFR;
  if (v < 4800 || c < 1000) return FlightCategory.IFR;
  if (v < 8000 || c < 3000) return FlightCategory.MVFR;
  return FlightCategory.VFR;
}

export function parseMetar(raw: string): MetarParsed {
  if (!raw || raw.trim().length < 4) {
    return { stationId: "???", raw, flightCategory: FlightCategory.VFR, categoryColor: CATEGORY_COLOR[FlightCategory.VFR], cavok: false, phenomena: [], valid: false };
  }

  const tokens = raw.trim().split(/\s+/);
  let stationId = "???";
  for (const t of tokens) {
    if (/^[A-Z]{4}$/.test(t) && !["METAR", "SPECI", "AUTO", "CORR"].includes(t)) {
      stationId = t;
      break;
    }
  }

  const wind = parseWind(raw);
  const { meters: vis, cavok } = parseVisibility(raw);
  const ceiling = parseCeiling(raw);
  const phenomena = parsePhenomena(raw);
  const flightCategory = categorizeFlight(vis, ceiling);

  return {
    stationId, raw, flightCategory,
    categoryColor: CATEGORY_COLOR[flightCategory],
    visibility: vis, cavok, ceiling, wind, phenomena, valid: true,
  };
}

// ── Tokenizer for colored display ─────────────────────────────────────────────

export interface DisplayToken {
  text: string;
  color?: string;
  bold?: boolean;
  title?: string;
}

function visColor(m?: number): string {
  if (!m) return "";
  if (m < 1600) return "#a855f7";
  if (m < 4800) return "#ef4444";
  return "";
}

function ceilColor(ft: number): string {
  if (ft < 500) return "#a855f7";
  if (ft < 1000) return "#ef4444";
  return "";
}

/**
 * Returns colour for a wx code token.
 * Handles both exact codes (in RED_WX/ORANGE_WX) and compound codes
 * like BLSN, DRSN, TSSN, FZFG, FZDZ that aren't explicitly listed.
 */
function wxColor(code: string): string {
  if (RED_WX.has(code)) return "#ef4444";
  if (ORANGE_WX.has(code)) return "#f97316";
  if (/^(BR|HZ)$/.test(code)) return "#d1a054";

  // Compound code fallback: strip leading +/-
  const base = code.replace(/^[-+]/, "");
  // Blowing/drifting snow/ice → red
  if (/^(BL|DR)(SN|RA)/.test(base)) return "#ef4444";
  // Freezing phenomena → red
  if (/^FZ(FG|DZ|SN|RA)/.test(base)) return "#ef4444";
  // Thunderstorm + ice/snow/hail → red
  if (/^TS(SN|GR|PL|IC)/.test(base)) return "#ef4444";
  // Rain/Snow mix → red
  if (/^RA(SN)/.test(base)) return "#ef4444";
  // Heavy shower with hail → red
  if (/^SH(GR|GS)/.test(base)) return "#ef4444";
  // Thunderstorm combos → orange (if not caught above)
  if (/^TS/.test(base)) return "#f97316";
  // Shower combos → orange
  if (/^(SH|VC)/.test(base)) return "#f97316";

  return "#94a3b8";
}

export function tokenizeRaw(raw: string): DisplayToken[] {
  if (!raw) return [];
  const tokens: DisplayToken[] = [];
  let nonSpaceIdx = 0;

  for (const part of raw.trim().split(/(\s+)/)) {
    if (/^\s+$/.test(part)) { tokens.push({ text: part }); continue; }

    const t = part.trim();
    let color: string | undefined;
    let bold = false;
    let title: string | undefined;

    if (/^(METAR|SPECI|TAF|AMD|COR|NIL)$/.test(t)) {
      color = "#38BDF8"; bold = true;
    } else if (nonSpaceIdx <= 2 && /^[A-Z]{4}$/.test(t) && !/^(AUTO|CORR|NOSIG|BECMG|TEMPO|INTER|PROB)$/.test(t)) {
      color = "#38BDF8"; bold = true; title = `Station: ${t}`;
    } else if (/^\d{6}Z$/.test(t) || /^\d{4}\/\d{4}$/.test(t)) {
      color = "#64748b"; title = "Time";
    } else if (/^(VRB|\d{3})\d{2,3}(G\d{2,3})?KT$/.test(t)) {
      const spd = parseInt(t.match(/(?:VRB|\d{3})(\d{2,3})/)?.[1] ?? "0");
      const gst = parseInt(t.match(/G(\d{2,3})/)?.[1] ?? "0");
      if (spd >= 15 || gst >= 25) {
        color = "#ef4444"; title = `Wind: Dangerous (${spd}kt${gst ? `/G${gst}kt` : ""})`;
      } else if (spd >= 12 || gst >= 20) {
        color = "#f97316"; title = `Wind: Strong (${spd}kt${gst ? `/G${gst}kt` : ""})`;
      }
    } else if (/^(CAVOK|NSC|NCD|SKC|CLR)$/.test(t)) {
      color = "#64748b"; title = t === "CAVOK" ? "Ceiling And Visibility OK" : "No Significant Clouds";
    } else if (/^\d{4}$/.test(t) && !t.includes("/")) {
      // 4-digit number not followed by / → visibility
      const vis = parseInt(t);
      if (vis <= 9999) {
        const c = visColor(vis);
        if (c) color = c;
        title = `Visibility: ${vis}m`;
      }
    } else if (/^(BKN|OVC|VV)\d{3}/.test(t)) {
      const ft = parseInt(t.slice(t.startsWith("VV") ? 2 : 3)) * 100;
      const c = ceilColor(ft);
      if (c) color = c;
      title = `Ceiling: ${ft}ft`;
    } else if (/^(FEW|SCT)\d{3}/.test(t)) {
      color = "#94a3b8"; title = `Cloud layer: ${parseInt(t.slice(3)) * 100}ft`;
    } else if (/^M?\d{2}\/M?\d{2}$/.test(t)) {
      color = "#94a3b8"; title = "Temp/Dew";
    } else if (/^Q\d{4}$/.test(t) || /^A\d{4}$/.test(t)) {
      color = "#94a3b8"; title = `QNH: ${t.slice(1)} ${t.startsWith("Q") ? "hPa" : "inHg"}`;
    } else if (/^(BECMG|TEMPO|INTER|PROB\d{2})$/.test(t) || /^FM\d{6}$/.test(t) || /^AT\d{4}$/.test(t) || /^TL\d{4}$/.test(t)) {
      color = "#f59e0b"; bold = true; title = "TAF change group";
    } else if (t === "NOSIG") {
      color = "#64748b"; title = "No Significant Change";
    } else if (/^(RMK|TX|TN)/.test(t)) {
      color = "#64748b";
    } else {
      // Weather phenomenon token
      const wx = wxColor(t);
      const isWxLike = /^[-+]?(?:TS|SH|FZ|DR|BL|VC|MI|PR|BC|NSW)/.test(t) ||
        /(?:DZ|RA|SN|SG|IC|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|FC|SQ|SS|DS)/.test(t);
      if (isWxLike || wx !== "#94a3b8") {
        color = wx;
        const label = WX_LABELS[t];
        if (label) title = label;
      }
    }

    tokens.push({ text: part, color, bold, title });
    nonSpaceIdx++;
  }

  return tokens;
}

// ── TAF worst-case category ───────────────────────────────────────────────────

export function parseTafWorstCategory(rawTaf: string | null): FlightCategory | null {
  if (!rawTaf) return null;
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  let worst: FlightCategory = FlightCategory.VFR;

  const tokens = rawTaf.split(/\s+/);
  for (const token of tokens) {
    // 4-digit visibility (not part of a period like 2503/2512)
    if (/^\d{4}$/.test(token)) {
      const v = parseInt(token);
      let cat: FlightCategory;
      if (v < 1600)       cat = FlightCategory.LIFR;
      else if (v < 4800)  cat = FlightCategory.IFR;
      else if (v < 8000)  cat = FlightCategory.MVFR;
      else                cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
    const ceilMatch = token.match(/^(?:BKN|OVC|VV)(\d{3})$/);
    if (ceilMatch) {
      const c = parseInt(ceilMatch[1]) * 100;
      let cat: FlightCategory;
      if (c < 500)        cat = FlightCategory.LIFR;
      else if (c < 1000)  cat = FlightCategory.IFR;
      else if (c < 3000)  cat = FlightCategory.MVFR;
      else                cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
  }
  return worst;
}

// ── Time slot extraction ──────────────────────────────────────────────────────

export function extractTimeSlots(raw: string): string[] {
  const slots = new Set<string>();
  for (const m of raw.matchAll(/\b\d{6}Z\b/g)) {
    slots.add(m[0]);
  }
  return [...slots];
}

// ── TAF time-window analysis (for ANALYZE page) ───────────────────────────────

export interface TafWindowResult {
  category: FlightCategory | null;
  critCodes: string[];
  orangeCodes: string[];
  visibility: number | null;
  ceiling: number | null;
}

export function analyzeTafWindow(rawTaf: string, etaHour: number): TafWindowResult {
  if (!rawTaf) return { category: null, critCodes: [], orangeCodes: [], visibility: null, ceiling: null };

  const windowStart = (etaHour - 1 + 24) % 24;
  const windowEnd = (etaHour + 1) % 24;
  const wraps = windowEnd < windowStart;

  function hourInWindow(h: number): boolean {
    if (wraps) return h >= windowStart || h <= windowEnd;
    return h >= windowStart && h <= windowEnd;
  }

  const normalized = rawTaf.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  const groupRe = /(?=\b(?:BECMG|TEMPO|PROB\d{2}|FM\d{4,6})\b)/g;
  const parts = normalized.split(groupRe);

  let worstCat: FlightCategory = FlightCategory.VFR;
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  const allCrit = new Set<string>();
  const allOrange = new Set<string>();
  let worstVis: number | null = null;
  let worstCeil: number | null = null;
  let hasOverlap = false;

  for (const group of parts) {
    const fmMatch = group.match(/\bFM\d{2}(\d{2})\d{2}\b/);
    // Match period like 2506/2509 → hours 06 and 09
    const periodMatch = group.match(/\b\d{2}(\d{2})\/\d{2}(\d{2})\b/);

    let groupHours: number[] = [];
    if (fmMatch) {
      const h = parseInt(fmMatch[1]);
      groupHours = [h];
    } else if (periodMatch) {
      const startH = parseInt(periodMatch[1]);
      const endH = parseInt(periodMatch[2]);
      // Generate all hours in this range
      const hours: number[] = [];
      let h = startH;
      while (true) {
        hours.push(h % 24);
        if (h % 24 === endH % 24) break;
        h++;
        if (hours.length > 25) break; // safety
      }
      groupHours = hours;
    } else {
      // Base conditions — always applies
      groupHours = Array.from({ length: 24 }, (_, i) => i);
    }

    const overlaps = groupHours.some((h) => hourInWindow(h));
    if (!overlaps) continue;
    hasOverlap = true;

    // Visibility: match 4-digit number NOT part of a period (followed by /)
    const visMatch = group.match(/(?:^|\s)(\d{4})(?!\/)(?:\s|$)/);
    if (visMatch) {
      const v = parseInt(visMatch[1]);
      if (v <= 9999) {
        if (worstVis === null || v < worstVis) worstVis = v;
      }
    }
    if (/\b(CAVOK|NSC)\b/.test(group)) {
      if (worstVis === null) worstVis = 9999;
    }

    // Ceiling
    for (const m of group.matchAll(/\b(?:BKN|OVC|VV)(\d{3})\b/g)) {
      const ft = parseInt(m[1]) * 100;
      if (worstCeil === null || ft < worstCeil) worstCeil = ft;
    }

    // Category for this group
    const groupVis = visMatch ? parseInt(visMatch[1]) : (/\b(CAVOK|NSC)\b/.test(group) ? 9999 : undefined);
    const groupCeil = (() => {
      let lowest: number | null = null;
      for (const m of group.matchAll(/\b(?:BKN|OVC|VV)(\d{3})\b/g)) {
        const ft = parseInt(m[1]) * 100;
        if (lowest === null || ft < lowest) lowest = ft;
      }
      return lowest !== null ? { feet: lowest } : undefined;
    })();
    const cat = categorizeFlight(groupVis, groupCeil);
    if (order.indexOf(cat) > order.indexOf(worstCat)) worstCat = cat;

    // Phenomena
    for (const code of RED_WX) {
      const escaped = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(group)) allCrit.add(code);
    }
    for (const code of ORANGE_WX) {
      const escaped = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(group)) allOrange.add(code);
    }
    // Check compound codes
    if (/\b(BL|DR)(SN)\b/.test(group)) allCrit.add("BLSN");
    if (/\bFZ(FG|DZ)\b/.test(group)) allCrit.add(group.match(/\b(FZFG|FZDZ)\b/)?.[1] ?? "FZFG");
    if (/\bTS(SN|GR|PL)\b/.test(group)) allCrit.add(group.match(/\b(TSSN|TSGR|TSPL)\b/)?.[1] ?? "TSSN");
  }

  if (!hasOverlap) return { category: null, critCodes: [], orangeCodes: [], visibility: null, ceiling: null };

  return {
    category: worstCat,
    critCodes: [...allCrit],
    orangeCodes: [...allOrange],
    visibility: worstVis,
    ceiling: worstCeil,
  };
}

