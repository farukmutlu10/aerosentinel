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
  windBadge: boolean; // extreme wind — sustained ≥25 KT / ≥13 MPS or gust ≥29 KT / ≥15 MPS
  raw: string;
  isMps?: boolean;
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
  temperature?: number;
  dewpoint?: number;
  pressure?: { value: number; unit: "hPa" | "inHg" };
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
  SS: "Sandstorm", DS: "Duststorm", "-DS": "Lt Duststorm", "+DS": "Hvy Duststorm", "-SS": "Lt Sandstorm", "+SS": "Hvy Sandstorm", SG: "Snow Grains",
  IC: "Ice Crystals", PL: "Ice Pellets", FC: "Funnel Cloud", SQ: "Squall",
  NSW: "No Sig Weather", CB: "Cumulonimbus",
  "-TS": "Lt Thunderstorm", "+TS": "Hvy Thunderstorm",
  "-TSRA": "Lt T-storm/Rain", "+TSRA": "Hvy T-storm/Rain",
  "-SH": "Lt Showers", "+SH": "Hvy Showers",
};

export const ORANGE_WX = new Set([
  "VCTS", "TS", "-TS", "TSRA", "-TSRA",
  "DU", "FU", "-SH", "SH", "-RA", "RA", "+RA", "DZ", "-DZ", "+DZ", "SHRA", "-SHRA",
  "SA", "FG", "BLDU", "BLSA", "DRDU", "DRSA", "PO", "BCFG",
]);

export const RED_WX = new Set([
  "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ", "DS", "-DS", "+DS", "SS", "-SS", "+SS",
  "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
  "TSSN", "+TSSN", "TSGR", "TSPL",
  "-FZRA", "FZRA", "+FZRA",
  "FZDZ", "-FZDZ", "+FZDZ",
  "FZFG", "FZSN",
  "BLSN", "+BLSN", "-BLSN", "DRSN",
  "-RASN", "RASN", "+RASN",
  "SHGR", "SHGS",
  "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
]);

const DANGER_CODES = [...RED_WX];

export function hasCritWx(raw: string): boolean {
  for (const code of RED_WX) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  return false;
}

export function hasOrangeWx(raw: string): boolean {
  for (const code of ORANGE_WX) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  return false;
}

/** True if raw text contains extreme wind (wind badge threshold) */
export function hasBadgeWind(raw: string | null): boolean {
  if (!raw) return false;
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
    const spd = parseInt(m[1]);
    const gst = m[2] ? parseInt(m[2]) : 0;
    if (spd >= 25 || gst >= 29) return true;
  }
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
    const spd = parseInt(m[1]);
    const gst = m[2] ? parseInt(m[2]) : 0;
    if (spd >= 13 || gst >= 15) return true;
  }
  for (const m of raw.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
    const spd = Math.round(parseInt(m[1]) * 0.5399568);
    const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
    if (spd >= 25 || gst >= 29) return true;
  }
  return false;
}

// ── Internal parsers ──────────────────────────────────────────────────────────

function parseWind(raw: string): WindData | undefined {
  // Try KT first
  const ktM = raw.match(/\b(?<dir>\d{3}|VRB)(?<spd>\d{2,3})(?:G(?<gst>\d{2,3}))?KT\b/);
  if (ktM?.groups) {
    const sustainedKt = parseInt(ktM.groups.spd);
    const gustKt = ktM.groups.gst ? parseInt(ktM.groups.gst) : undefined;
    const g = gustKt ?? 0;
    let dangerColor: string;
    if (sustainedKt >= 15 || g >= 25) dangerColor = "#ef4444";
    else if (sustainedKt >= 12 || g >= 20) dangerColor = "#f97316";
    else dangerColor = "";
    return { direction: ktM.groups.dir, sustainedKt, gustKt, dangerColor, windBadge: sustainedKt >= 25 || g >= 29, raw: ktM[0] };
  }
  // Try MPS
  const mpsM = raw.match(/\b(?<dir>\d{3}|VRB)(?<spd>\d{2,3})(?:G(?<gst>\d{2,3}))?MPS\b/);
  if (mpsM?.groups) {
    const sustainedMPS = parseInt(mpsM.groups.spd);
    const gustMPS = mpsM.groups.gst ? parseInt(mpsM.groups.gst) : undefined;
    const g = gustMPS ?? 0;
    let dangerColor: string;
    if (sustainedMPS >= 12 || g >= 20) dangerColor = "#ef4444";
    else if (sustainedMPS >= 6 || g >= 10) dangerColor = "#f97316";
    else dangerColor = "";
    return {
      direction: mpsM.groups.dir,
      sustainedKt: Math.round(sustainedMPS * 1.944),
      gustKt: gustMPS ? Math.round(gustMPS * 1.944) : undefined,
      dangerColor,
      windBadge: sustainedMPS >= 13 || g >= 15,
      raw: mpsM[0],
      isMps: true,
    };
  }
  // Try KMH
  const kmhM = raw.match(/\b(?<dir>\d{3}|VRB)(?<spd>\d{2,3})(?:G(?<gst>\d{2,3}))?KMH\b/);
  if (kmhM?.groups) {
    const sustainedKMH = parseInt(kmhM.groups.spd);
    const gustKMH = kmhM.groups.gst ? parseInt(kmhM.groups.gst) : undefined;
    const sustainedKt = Math.round(sustainedKMH * 0.5399568);
    const gustKt = gustKMH ? Math.round(gustKMH * 0.5399568) : undefined;
    const g = gustKt ?? 0;
    let dangerColor: string;
    if (sustainedKt >= 15 || g >= 25) dangerColor = "#ef4444";
    else if (sustainedKt >= 12 || g >= 20) dangerColor = "#f97316";
    else dangerColor = "";
    return {
      direction: kmhM.groups.dir,
      sustainedKt,
      gustKt,
      dangerColor,
      windBadge: sustainedKt >= 25 || g >= 29,
      raw: kmhM[0],
    };
  }
  return undefined;
}

function parseVisibility(raw: string): { meters?: number; cavok: boolean } {
  // Only true CAVOK sets cavok: true
  if (/\bCAVOK\b/.test(raw)) return { meters: 9999, cavok: true };
  // NSC/SKC/NCD/CLR — no significant clouds; visibility not specified by these codes
  // Do NOT return cavok: true for these; they are cloud descriptors, not visibility guarantees.
  if (/\b(NSC|NCD|SKC|CLR)\b/.test(raw)) return { cavok: false };
  // SM format — check before meter regex
  // P6SM (more than 6 SM)
  if (/\bP6SM\b/.test(raw)) return { meters: 9999, cavok: false };
  // Whole + fraction SM: "1 1/2SM" (space-separated in raw)
  const smMixed = raw.match(/(?:^|\s)(\d+)\s+(\d+)\/(\d+)SM\b/);
  if (smMixed) {
    const whole = parseInt(smMixed[1]);
    const num = parseInt(smMixed[2]);
    const den = parseInt(smMixed[3]);
    return { meters: Math.round((whole + num / den) * 1609), cavok: false };
  }
  // Fraction-only SM: "1/2SM", "3/4SM"
  const smFrac = raw.match(/(?:^|\s)(\d+)\/(\d+)SM\b/);
  if (smFrac) {
    return { meters: Math.round((parseInt(smFrac[1]) / parseInt(smFrac[2])) * 1609), cavok: false };
  }
  // Integer SM: "10SM"
  const smInt = raw.match(/(?:^|\s)(\d+)SM\b/);
  if (smInt) {
    return { meters: Math.round(parseInt(smInt[1]) * 1609), cavok: false };
  }
  // Meter format
  const m = raw.match(/(?:^|\s)(?<vis>\d{4,5})(?!\/)(?:\s|$)/);
  if (m?.groups) { const v = parseInt(m.groups.vis); return { meters: v > 9999 ? 9999 : v, cavok: false }; }
  return { cavok: false };
}

function parseCeiling(raw: string): { feet: number; type: "BKN" | "OVC" | "VV" } | undefined {
  const layers = [...raw.matchAll(/\b(?<type>BKN|OVC|VV)(?<h>\d{3})(?:CB)?\b/g)];
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
  const wxPat = /\b([-+]?(?:TS|SH|FZ|DR|BL|VC|MI|PR|BC)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|NSW)|[-+]?SN|GR|TS|FG|VA|VCSH|VCTS)\b/g;
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

function categorizeFlight(vis?: number, ceiling?: { feet: number }): FlightCategory {
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
    if (/^[A-Z]{4}$/.test(t) && !["METAR", "SPECI", "AUTO", "CORR"].includes(t)) { stationId = t; break; }
  }
  const wind = parseWind(raw);
  const { meters: vis, cavok } = parseVisibility(raw);
  const ceiling = parseCeiling(raw);
  const phenomena = parsePhenomena(raw);
  const flightCategory = categorizeFlight(vis, ceiling);

  // Extract temperature & dewpoint (M = minus prefix)
  let temperature: number | undefined;
  let dewpoint: number | undefined;
  const tdMatch = raw.match(/\b(M?\d{2})\/(M?\d{2})\b/);
  if (tdMatch) {
    temperature = tdMatch[1].startsWith("M") ? -parseInt(tdMatch[1].slice(1)) : parseInt(tdMatch[1]);
    dewpoint = tdMatch[2].startsWith("M") ? -parseInt(tdMatch[2].slice(1)) : parseInt(tdMatch[2]);
  }

  // Extract pressure (QNH in hPa or altimeter in inHg)
  let pressure: { value: number; unit: "hPa" | "inHg" } | undefined;
  const qnhMatch = raw.match(/\bQ(\d{4})\b/);
  if (qnhMatch) {
    pressure = { value: parseInt(qnhMatch[1]), unit: "hPa" };
  } else {
    const altMatch = raw.match(/\bA(\d{4})\b/);
    if (altMatch) {
      pressure = { value: parseInt(altMatch[1]), unit: "inHg" };
    }
  }

  return { stationId, raw, flightCategory, categoryColor: CATEGORY_COLOR[flightCategory], visibility: vis, cavok, ceiling, wind, phenomena, temperature, dewpoint, pressure, valid: true };
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

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

function wxColor(code: string): string {
  if (RED_WX.has(code)) return "#ef4444";
  if (ORANGE_WX.has(code)) return "#f97316";
  if (/^(BR|HZ)$/.test(code)) return "#d1a054";
  if (/^CB$/.test(code)) return "#d1a054";
  const base = code.replace(/^[-+]/, "");
  if (RED_WX.has(base)) return "#ef4444";
  if (ORANGE_WX.has(base)) return "#f97316";
  if (/^(BL|DR)(SN|RA)/.test(base)) return "#ef4444";
  if (/^(DS|SS|SG)$/.test(base)) return "#ef4444";
  if (/^FZ(FG|DZ|SN|RA)/.test(base)) return "#ef4444";
  if (/^TS(SN|GR|PL|IC)/.test(base)) return "#ef4444";
  if (/^RA(SN)/.test(base)) return "#ef4444";
  if (/^SH(GR|GS)/.test(base)) return "#ef4444";
  if (/^TS/.test(base)) return "#f97316";
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
    // SCT030CB, BKN015CB gibi token'ları ikiye böl
    const cbSplit = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB)$/);
    if (cbSplit) {
      // İlk parça: cloud layer
      const cloudToken = cbSplit[1] + cbSplit[2];
      const ft = parseInt(cbSplit[2]) * 100;
      tokens.push({ text: cloudToken, color: "#94a3b8", title: `Cloud: ${ft}ft` });
      // İkinci parça: CB
      tokens.push({ text: "CB", color: "#d1a054", title: "Cumulonimbus" });
      nonSpaceIdx++;
      continue;
    }
    let color: string | undefined;
    let bold = false;
    let title: string | undefined;

    if (/^(METAR|SPECI|TAF|AMD|COR|NIL)$/.test(t)) {
      color = "#38BDF8"; bold = true;
    } else if (t === "CB") {
      color = "#d1a054"; title = "Cumulonimbus";
    } else if (/^(BECMG|TEMPO|INTER|PROB\d{2})$/.test(t) || /^FM\d{4,6}$/.test(t) || /^AT\d{4}$/.test(t) || /^TL\d{4}$/.test(t)) {
      bold = true; color = "currentColor"; title = "TAF change group";
    } else if (/^[-+]?(?:TS|SH|FZ|DR|BL|VC|MI|PR|BC|NSW)/.test(t) || /(?:DZ|RA|SN|SG|IC|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PO|CB|FC|SQ|SS|DS)/.test(t)) {
      const wx = wxColor(t);
      color = wx;
      const label = WX_LABELS[t];
      if (label) title = label;
    } else if (nonSpaceIdx <= 2 && /^[A-Z]{4}$/.test(t) && !/^(AUTO|CORR|NOSIG|BECMG|TEMPO|INTER|PROB)$/.test(t)) {
      color = "#38BDF8"; bold = true; title = `Station: ${t}`;
    } else if (/^\d{6}Z$/.test(t) || /^\d{4}\/\d{4}$/.test(t)) {
      color = "#64748b"; title = "Time";
    } else if (/^(VRB|\d{3})\d{2,3}(G\d{2,3})?KT$/.test(t)) {
      const spd = parseInt(t.match(/(?:VRB|\d{3})(\d{2,3})/)?.[1] ?? "0");
      const gst = parseInt(t.match(/G(\d{2,3})/)?.[1] ?? "0");
      if (spd >= 15 || gst >= 25) {
        color = "#ef4444"; title = `Wind: Dangerous (${spd} kt${gst ? `/G${gst} kt` : ""})`;
      } else if (spd >= 12 || gst >= 20) {
        color = "#f97316"; title = `Wind: Strong (${spd} kt${gst ? `/G${gst} kt` : ""})`;
      }
    } else if (/^(VRB|\d{3})\d{2,3}(G\d{2,3})?MPS$/.test(t)) {
      const spd = parseInt(t.match(/(?:VRB|\d{3})(\d{2,3})/)?.[1] ?? "0");
      const gst = parseInt(t.match(/G(\d{2,3})/)?.[1] ?? "0");
      if (spd >= 8 || gst >= 12) {
        color = "#ef4444"; title = `Wind: Dangerous (${spd} MPS${gst ? `/G${gst} MPS` : ""})`;
      } else if (spd >= 6 || gst >= 10) {
        color = "#f97316"; title = `Wind: Strong (${spd} MPS${gst ? `/G${gst} MPS` : ""})`;
      }
    } else if (/^(VRB|\d{3})\d{2,3}(G\d{2,3})?KMH$/.test(t)) {
      const spdKMH = parseInt(t.match(/(?:VRB|\d{3})(\d{2,3})/)?.[1] ?? "0");
      const gstKMH = parseInt(t.match(/G(\d{2,3})/)?.[1] ?? "0");
      const spd = Math.round(spdKMH * 0.5399568);
      const gst = gstKMH ? Math.round(gstKMH * 0.5399568) : 0;
      if (spd >= 15 || gst >= 25) {
        color = "#ef4444"; title = `Wind: Dangerous (${spdKMH} km/h${gstKMH ? `/G${gstKMH} km/h` : ""})`;
      } else if (spd >= 12 || gst >= 20) {
        color = "#f97316"; title = `Wind: Strong (${spdKMH} km/h${gstKMH ? `/G${gstKMH} km/h` : ""})`;
      }
    } else if (/^\d{3}V\d{3}$/.test(t)) {
      color = "#64748b"; title = `Variable wind direction: ${t}`;
    } else if (/^R\d{2}[LCR]?\/\d{4}(?:V\d{4})?[UDN]?$/.test(t)) {
      color = "#64748b"; title = `RVR: ${t}`;
    } else if (/^(CAVOK|NSC|NCD|SKC|CLR)$/.test(t)) {
      color = "#64748b"; title = t === "CAVOK" ? "Ceiling And Visibility OK" : "No Significant Clouds";
    } else if (/^\d{4}$/.test(t) && !t.includes("/")) {
      const vis = parseInt(t);
      if (vis <= 9999) {
        const c = visColor(vis);
        if (c) color = c;
        title = `Visibility: ${vis}m`;
      }
    } else if (/^(BKN|OVC|VV|FEW|SCT)\d{3}CB$/i.test(t)) {
      const digits = t.match(/\d{3}/)?.[0] ?? "000";
      const ft = parseInt(digits) * 100;
      color = "#d1a054"; title = `Cloud with CB: ${ft}ft`;
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
    } else if (t === "NOSIG") {
      color = "#64748b"; title = "No Significant Change";
    } else if (/^(RMK|TX|TN)/.test(t)) {
      color = "#64748b";
    }

    tokens.push({ text: part, color, bold, title });
    nonSpaceIdx++;
  }
  return tokens;
}

// ── TAF worst-case ────────────────────────────────────────────────────────────

export function parseTafWorstCategory(rawTaf: string | null): FlightCategory | null {
  if (!rawTaf) return null;
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  let worst: FlightCategory = FlightCategory.VFR;
  const tokens = rawTaf.split(/\s+/);
  for (const token of tokens) {
    if (/^\d{4}$/.test(token)) {
      const v = parseInt(token);
      let cat: FlightCategory;
      if (v < 1600) cat = FlightCategory.LIFR;
      else if (v < 4800) cat = FlightCategory.IFR;
      else if (v < 8000) cat = FlightCategory.MVFR;
      else cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
    const ceilMatch = token.match(/^(?:BKN|OVC|VV)(\d{3})$/);
    if (ceilMatch) {
      const c = parseInt(ceilMatch[1]) * 100;
      let cat: FlightCategory;
      if (c < 500) cat = FlightCategory.LIFR;
      else if (c < 1000) cat = FlightCategory.IFR;
      else if (c < 3000) cat = FlightCategory.MVFR;
      else cat = FlightCategory.VFR;
      if (order.indexOf(cat) > order.indexOf(worst)) worst = cat;
    }
  }
  return worst;
}

export function extractTimeSlots(raw: string): string[] {
  const slots = new Set<string>();
  for (const m of raw.matchAll(/\b\d{6}Z\b/g)) slots.add(m[0]);
  return [...slots];
}

// ── TAF window analysis ───────────────────────────────────────────────────────

export interface TafWindowResult {
  category: FlightCategory | null;
  critCodes: string[];
  orangeCodes: string[];
  visibility: number | null;
  ceiling: number | null;
  rawCeil: string | null;
  critWind: string | null;
  orangeWind: string | null;
}

/**
 * Analyze which TAF groups overlap with the flight's ETA window (±1 h).
 *
 * @param etaDay  UTC day-of-month extracted from the Excel "Date" column.
 *                When provided, period day digits in the TAF (DDHH/DDHH) are
 *                compared so that e.g. "2812/2816" and "2908/2912" are never
 *                confused even though both contain hour 12.
 *                When null, falls back to hour-only matching (legacy behaviour).
 */
export function analyzeTafWindow(rawTaf: string, etaHour: number, etaDay: number | null = null): TafWindowResult {
  if (!rawTaf) return { category: null, critCodes: [], orangeCodes: [], visibility: null, ceiling: null, rawCeil: null, critWind: null, orangeWind: null };

  // Hour-only window (used when etaDay is unknown)
  const windowStart = (etaHour - 1 + 24) % 24;
  const windowEnd   = (etaHour + 1) % 24;
  const wraps       = windowEnd < windowStart;
  function hourInWindow(h: number): boolean {
    if (wraps) return h >= windowStart || h <= windowEnd;
    return h >= windowStart && h <= windowEnd;
  }

  // Absolute-hour window (used when etaDay is known)
  const absMin = etaDay !== null ? etaDay * 24 + (etaHour - 1) : 0;
  const absMax = etaDay !== null ? etaDay * 24 + (etaHour + 1) : 0;

  const normalized = rawTaf.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  const groupRe = /(?=\b(?:BECMG|TEMPO|PROB\d{2}|FM\d{4,6})\b)/g;
  const rawParts = normalized.split(groupRe);
  // Fix #9: Merge standalone PROB groups with following TEMPO groups
  const parts: string[] = [];
  for (let pi = 0; pi < rawParts.length; pi++) {
    if (/^PROB\d{2}$/.test(rawParts[pi].trim()) && pi + 1 < rawParts.length && /^\s*TEMPO\b/.test(rawParts[pi + 1])) {
      parts.push(rawParts[pi] + rawParts[pi + 1]);
      pi++;
    } else {
      parts.push(rawParts[pi]);
    }
  }

  let worstCat: FlightCategory = FlightCategory.VFR;
  const order = [FlightCategory.VFR, FlightCategory.MVFR, FlightCategory.IFR, FlightCategory.LIFR];
  const allCrit = new Set<string>();
  const allOrange = new Set<string>();
  let worstVis: number | null = null;
  let worstCeil: number | null = null;
  let worstCeilRaw: string | null = null;
  let critWindRaw: string | null = null;
  let orangeWindRaw: string | null = null;
  let hasOverlap = false;

  for (const group of parts) {
    // Fix #1: FM flexible matching — FMddhhmm (6), FMddhh (4), FMhhmm (4)
    const fmMatch6 = group.match(/\bFM(\d{2})(\d{2})(\d{2})\b/);   // FMddhhmm
    const fmMatch4 = !fmMatch6 ? group.match(/\bFM(\d{2})(\d{2})\b/) : null;
    let fmDay: number | null = null;
    let fmHour: number | null = null;
    if (fmMatch6) {
      fmDay = parseInt(fmMatch6[1]);
      fmHour = parseInt(fmMatch6[2]);
    } else if (fmMatch4) {
      const first = parseInt(fmMatch4[1]);
      const second = parseInt(fmMatch4[2]);
      if (first > 23) { // FMddhh — first pair can't be hour (max 23)
        fmDay = first;
        fmHour = second;
      } else { // FMhhmm — no day info
        fmHour = first;
      }
    }
    const periodMatch = group.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/); // [1]=sDay [2]=sHour [3]=eDay [4]=eHour

    let overlaps = false;

    if (etaDay !== null) {
      // ── Day-aware matching ─────────────────────────────────────────────────
      if (fmDay !== null && fmHour !== null) {
        // Fix #4: month boundary correction
        let tafDay = fmDay;
        if (tafDay > etaDay + 15) tafDay -= 31;
        const fmAbs = tafDay * 24 + fmHour;
        overlaps = fmAbs >= absMin && fmAbs <= absMax;
      } else if (fmHour !== null) {
        // FM with no day info — fall back to hour-only matching
        overlaps = hourInWindow(fmHour);
      } else if (periodMatch) {
        let startDay = parseInt(periodMatch[1]);
        let endDay = parseInt(periodMatch[3]);
        // Fix #4: month boundary correction
        if (startDay > etaDay + 15) startDay -= 31;
        if (endDay > etaDay + 15) endDay -= 31;
        const periodAbsStart = startDay * 24 + parseInt(periodMatch[2]);
        const periodAbsEnd   = endDay * 24 + parseInt(periodMatch[4]);
        overlaps = periodAbsStart <= absMax && periodAbsEnd >= absMin;
      } else {
        overlaps = true; // base (header) group — always include
      }
    } else {
      // ── Hour-only matching (legacy, no date info) ──────────────────────────
      if (fmHour !== null) {
        overlaps = hourInWindow(fmHour);
      } else if (periodMatch) {
        const startH = parseInt(periodMatch[2]);
        const endH   = parseInt(periodMatch[4]);
        const hours: number[] = [];
        let h = startH;
        while (true) {
          hours.push(h % 24);
          if (h % 24 === endH % 24) break;
          h++;
          if (hours.length > 25) break;
        }
        overlaps = hours.some((h) => hourInWindow(h));
      } else {
        overlaps = true; // base (header) group — always include
      }
    }

    if (!overlaps) continue;
    hasOverlap = true;

    const visMatch = group.match(/(?:^|\s)(\d{4,5})(?!\/)(?:\s|$)/);
    if (visMatch) {
      const v = Math.min(parseInt(visMatch[1]), 9999);
      if (worstVis === null || v < worstVis) worstVis = v;
    }
    if (/\bCAVOK\b/.test(group) && worstVis === null) worstVis = 9999;

    for (const m of group.matchAll(/\b(?:BKN|OVC|VV)(\d{3})\b/g)) {
      const ft = parseInt(m[1]) * 100;
      if (worstCeil === null || ft < worstCeil) { worstCeil = ft; worstCeilRaw = m[0]; }
    }

    const groupVis = visMatch ? Math.min(parseInt(visMatch[1]), 9999) : (/\bCAVOK\b/.test(group) ? 9999 : undefined);
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

    for (const code of RED_WX) {
      const esc = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${esc}(?=\\s|$)`).test(group)) allCrit.add(code);
    }
    for (const code of ORANGE_WX) {
      const esc = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${esc}(?=\\s|$)`).test(group)) allOrange.add(code);
    }
    if (/\b(BL|DR)(SN)\b/.test(group)) allCrit.add("BLSN");
    if (/\bFZ(FG|DZ)\b/.test(group)) { const r = group.match(/\b(FZFG|FZDZ)\b/)?.[1]; if (r) allCrit.add(r); }
    if (/\bTS(SN|GR|PL)\b/.test(group)) { const r = group.match(/\b(TSSN|TSGR|TSPL)\b/)?.[1]; if (r) allCrit.add(r); }

    // CRIT wind detection (red): sustained ≥25 KT or gusts ≥29 KT
    if (!critWindRaw) {
      for (const m of group.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
        if (parseInt(m[1]) >= 25 || (m[2] && parseInt(m[2]) >= 29)) { critWindRaw = m[0]; break; }
      }
    }
    if (!critWindRaw) {
      for (const m of group.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
        if (parseInt(m[1]) >= 12 || (m[2] && parseInt(m[2]) >= 20)) { critWindRaw = m[0]; break; }
      }
    }
    // ORANGE wind detection: sustained ≥15 KT or gusts ≥20 KT (below red threshold)
    if (!orangeWindRaw && !critWindRaw) {
      for (const m of group.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
        if (parseInt(m[1]) >= 15 || (m[2] && parseInt(m[2]) >= 20)) { orangeWindRaw = m[0]; break; }
      }
    }
    if (!orangeWindRaw && !critWindRaw) {
      for (const m of group.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
        if (parseInt(m[1]) >= 6 || (m[2] && parseInt(m[2]) >= 10)) { orangeWindRaw = m[0]; break; }
      }
    }
  }

  if (!hasOverlap) return { category: null, critCodes: [], orangeCodes: [], visibility: null, ceiling: null, rawCeil: null, critWind: null, orangeWind: null };

  // Deduplicate: heavier intensity supersedes lighter in the same phenomenon family.
  // e.g. TSRA present → remove -TSRA; +TSRA present → also remove TSRA.
  for (const code of [...allCrit, ...allOrange]) {
    const stripped = code.replace(/^[-+]/, "");
    const isLight  = code.startsWith("-");
    const isHeavy  = code.startsWith("+");
    if (isLight) {
      // Remove -X if base X or +X is present anywhere
      if (allCrit.has(stripped) || allOrange.has(stripped) || allCrit.has("+" + stripped) || allOrange.has("+" + stripped)) {
        allCrit.delete(code); allOrange.delete(code);
      }
    } else if (!isHeavy) {
      // Remove base X if +X is present anywhere
      if (allCrit.has("+" + code) || allOrange.has("+" + code)) {
        allCrit.delete(code); allOrange.delete(code);
      }
    }
  }

  return { category: worstCat, critCodes: [...allCrit], orangeCodes: [...allOrange], visibility: worstVis, ceiling: worstCeil, rawCeil: worstCeilRaw, critWind: critWindRaw, orangeWind: critWindRaw ? null : orangeWindRaw };
}
