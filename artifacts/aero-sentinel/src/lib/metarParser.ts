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

const WX_LABELS: Record<string, string> = {
  TS: "Thunderstorm", TSRA: "T-storm/Rain", TSGR: "T-storm/Hail",
  TSSN: "T-storm/Snow", FG: "Fog", FZFG: "Freezing Fog",
  FZRA: "Freezing Rain", FZDZ: "Freezing Drizzle",
  BR: "Mist", HZ: "Haze", FU: "Smoke", DU: "Dust", SA: "Sand",
  VA: "Volcanic Ash", GR: "Hail", GS: "Small Hail",
  "-DZ": "Lt Drizzle", DZ: "Drizzle", "+DZ": "Hvy Drizzle",
  "-RA": "Lt Rain", RA: "Rain", "+RA": "Hvy Rain",
  "-SN": "Lt Snow", SN: "Snow", "+SN": "Hvy Snow",
  "-RASN": "Lt Rain/Snow", RASN: "Rain+Snow",
  SH: "Showers", SHRA: "Rain Showers", SHSN: "Snow Showers",
  SHGR: "Hail Showers", VCSH: "Vcnty Showers", VCTS: "Vcnty T-storm",
  BLSN: "Blowing Snow", BLDU: "Blowing Dust", DRSN: "Drifting Snow",
  SS: "Sandstorm", DS: "Duststorm", SG: "Snow Grains",
  IC: "Ice Crystals", PL: "Ice Pellets",
  NSW: "No Sig Weather",
};

const DANGER_CODES = ["TS", "FG", "FZFG", "+SN", "GR", "VA", "TSRA", "TSGR", "TSSN", "FZRA", "SS", "DS"];

function parseWind(raw: string): WindData | undefined {
  const m = raw.match(/\b(?<dir>\d{3}|VRB)(?<spd>\d{2,3})(?:G(?<gst>\d{2,3}))?KT\b/);
  if (!m?.groups) return undefined;
  const sustainedKt = parseInt(m.groups.spd);
  const gustKt = m.groups.gst ? parseInt(m.groups.gst) : undefined;
  const max = Math.max(sustainedKt, gustKt ?? 0);
  const dangerColor = max >= 35 ? "#ef4444" : max >= 25 ? "#f97316" : max >= 16 ? "#eab308" : "#22c55e";
  return { direction: m.groups.dir, sustainedKt, gustKt, dangerColor, raw: m[0] };
}

function parseVisibility(raw: string): { meters?: number; cavok: boolean } {
  if (/\b(CAVOK|NSC|NCD|SKC|CLR)\b/.test(raw)) return { meters: 9999, cavok: true };
  const m = raw.match(/(?:^|\s)(?<vis>\d{4})(?:\s|$)/);
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
  const wxPat = /\b(\+?(?:TS|SH|FZ|DR|BL|VC|MI|PR|BC)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|NSW)[\w+]*|\+SN|GR|TS|FG|VA|VCSH|VCTS)\b/g;
  const seen = new Set<string>();
  for (const m of raw.matchAll(wxPat)) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    const label = WX_LABELS[code] ?? code;
    const danger = DANGER_CODES.some((d) => code.includes(d));
    found.push({ code, label, danger });
  }
  return found;
}

function categorizeFlight(
  vis?: number,
  ceiling?: { feet: number },
  phenomena?: Array<{ code: string; danger: boolean }>
): FlightCategory {
  const hasDanger = phenomena?.some((p) => p.danger) ?? false;

  const v = vis ?? 9999;
  const c = ceiling?.feet ?? 99999;

  let catVis: FlightCategory;
  if (v < 1500) catVis = FlightCategory.LIFR;
  else if (v <= 4999) catVis = FlightCategory.IFR;
  else if (v <= 8000) catVis = FlightCategory.MVFR;
  else catVis = FlightCategory.VFR;

  let catCeil: FlightCategory;
  if (c < 500) catCeil = FlightCategory.LIFR;
  else if (c < 1000) catCeil = FlightCategory.IFR;
  else if (c <= 3000) catCeil = FlightCategory.MVFR;
  else catCeil = FlightCategory.VFR;

  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  const worst = order[Math.max(order.indexOf(catVis), order.indexOf(catCeil))];

  if (hasDanger) {
    if (worst === FlightCategory.LIFR || v < 1500 || c < 500) return FlightCategory.LIFR;
    return FlightCategory.IFR;
  }
  return worst;
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
  const flightCategory = categorizeFlight(vis, ceiling, phenomena);

  return {
    stationId,
    raw,
    flightCategory,
    categoryColor: CATEGORY_COLOR[flightCategory],
    visibility: vis,
    cavok,
    ceiling,
    wind,
    phenomena,
    valid: true,
  };
}

// ── Tokenizer for colored display ────────────────────────────────────────────

export interface DisplayToken {
  text: string;
  color?: string;
  bold?: boolean;
  title?: string;
}

// Only color IFR (red) and LIFR (purple) — VFR/MVFR visibility stays neutral
// Thresholds match categorizeFlight(): LIFR <1500m, IFR 1500–4999m, MVFR/VFR ≥5000m
function visColor(m?: number): string {
  if (!m) return "";
  if (m >= 5000) return "";        // MVFR or VFR — no highlight
  if (m >= 1500) return "#ef4444"; // IFR
  return "#a855f7";                // LIFR
}

// Only color IFR (red) and LIFR (purple) ceilings — higher stays neutral
function ceilColor(ft: number): string {
  if (ft >= 1000) return "";      // VFR or MVFR — no highlight
  if (ft >= 500)  return "#ef4444"; // IFR
  return "#a855f7";                // LIFR
}

function wxColor(code: string): string {
  if (/TS|GR|VA|\+SN|SS|DS/.test(code)) return "#ef4444";
  if (/FG|FZFG|FZRA|FZDZ/.test(code)) return "#ef4444";
  if (/RA|DZ|SN|SH/.test(code)) return "#93c5fd";
  if (/BR|HZ|FU|DU|SA/.test(code)) return "#d1a054";
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
      const max = Math.max(spd, gst);
      // Only highlight moderate+ winds — light winds stay neutral
      color = max >= 35 ? "#ef4444" : max >= 25 ? "#f97316" : max >= 16 ? "#eab308" : undefined;
      if (max >= 16) title = `Wind: ${max >= 35 ? "Extreme" : max >= 25 ? "Strong" : "Moderate"}`;
    } else if (/^(CAVOK|NSC|NCD|SKC|CLR)$/.test(t)) {
      // Neutral — good conditions, no highlight needed
      color = "#64748b"; title = t === "CAVOK" ? "Ceiling And Visibility OK" : "No Significant Clouds";
    } else if (/^\d{4}$/.test(t) && parseInt(t) <= 9999) {
      const vis = parseInt(t);
      const c = visColor(vis);
      if (c) color = c;
      title = `Visibility: ${vis}m`;
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
    } else if (/^(RMK|TEMPO|TX|TN)/.test(t)) {
      color = "#64748b";
    } else {
      const wx = wxColor(t);
      if (wx !== "#94a3b8" || /[+-]?(TS|DZ|RA|SN|SG|IC|PL|GR|GS|FG|BR|HZ|FU|VA|DU|SA|VCSH|VCTS)/.test(t)) {
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

/** Scan all groups in a raw TAF and return the worst FlightCategory found */
export function parseTafWorstCategory(rawTaf: string | null): FlightCategory | null {
  if (!rawTaf) return null;
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  let worst: FlightCategory = FlightCategory.VFR;

  const tokens = rawTaf.split(/\s+/);
  for (const token of tokens) {
    // Visibility: bare 4-digit meter value (not a validity period DDHH/DDHH which contains /)
    if (/^\d{4}$/.test(token)) {
      const v = parseInt(token);
      let cat: FlightCategory;
      if (v < 1500)       cat = FlightCategory.LIFR;
      else if (v <= 4999) cat = FlightCategory.IFR;
      else if (v <= 8000) cat = FlightCategory.MVFR;
      else                cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
    // Ceiling: BKN or OVC + 3-digit height in hundreds of feet
    const ceilMatch = token.match(/^(?:BKN|OVC)(\d{3})$/);
    if (ceilMatch) {
      const c = parseInt(ceilMatch[1]) * 100;
      let cat: FlightCategory;
      if (c < 500)        cat = FlightCategory.LIFR;
      else if (c < 1000)  cat = FlightCategory.IFR;
      else if (c <= 3000) cat = FlightCategory.MVFR;
      else                cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
  }
  return worst;
}

// ── Time slot extraction ──────────────────────────────────────────────────────

/** Extract unique full raw timestamps (e.g. "221940Z") from a raw METAR/TAF string */
export function extractTimeSlots(raw: string): string[] {
  const slots = new Set<string>();
  for (const m of raw.matchAll(/\b\d{6}Z\b/g)) {
    slots.add(m[0]); // e.g. "221940Z"
  }
  return [...slots];
}
