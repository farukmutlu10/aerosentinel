import { db, alertsTable, watchlistTable, monitorCacheTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

let cachedIcaos: string[] = [];

const sonGorulenTaf:   Record<string, string> = {};
const sonGorulenMetar: Record<string, string> = {};
const sonGorulenTs:    Record<string, number> = {}; // last-scanned timestamp per ICAO

const WEATHER_CACHE_MAX_AGE = 90_000; // 90 s — monitor scans every 60 s

// Separate display cache for /watchlist/weather — NEVER touches change-detection state
const displayCache: Record<string, { rawTaf: string | null; rawMetar: string | null; ts: number }> = {};
const DISPLAY_CACHE_MAX_AGE = 60_000; // 60 s

let scanCount = 0;
let scanCountToday = 0;
let lastResetDateStr = getUtcDateStr();
let lastScan: Date | null = null;
let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const HEADERS = { "User-Agent": "Mozilla/5.0 AERO-SENTINEL/1.8" };
const BASE_URL = "https://aviationweather.gov/api/data";

function getUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkDailyReset() {
  const today = getUtcDateStr();
  if (today !== lastResetDateStr) {
    scanCountToday = 0;
    lastResetDateStr = today;
  }
}

async function fetchJson(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`[monitor] HTTP ${res.status} for ${url.split('?')[0]}`);
      return [];
    }
    const data = await res.json() as unknown[];
    return data;
  } catch (err) {
    console.error(`[monitor] fetch error for ${url.split('?')[0]}:`, err);
    return [];
  }
}

async function refreshIcaoCache(): Promise<string[]> {
  // Tüm kullanıcılardaki benzersiz ICAO'lar
  const allRows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  if (allRows.length === 0) {
    await db.insert(watchlistTable).values({ icao: "LTFH", userId: "legacy" }).onConflictDoNothing();
    cachedIcaos = ["LTFH"];
  } else {
    const uniqueIcaos = [...new Set(allRows.map(r => r.icao))];
    cachedIcaos = uniqueIcaos;
  }
  return cachedIcaos;
}

async function seedIfEmpty() {
  const rows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  if (rows.length === 0) {
    await db.insert(watchlistTable).values({ icao: "LTFH", userId: "legacy" }).onConflictDoNothing();
    cachedIcaos = ["LTFH"];
  } else {
    const uniqueIcaos = [...new Set(rows.map(r => r.icao))];
    cachedIcaos = uniqueIcaos;
  }
}

async function loadMonitorCache() {
  try {
    const rows = await db.select().from(monitorCacheTable);
    for (const row of rows) {
      if (row.dataType === "TAF") {
        sonGorulenTaf[row.icao] = row.rawText;
      } else if (row.dataType === "METAR") {
        sonGorulenMetar[row.icao] = row.rawText;
      }
    }
    console.log(`[monitor] Loaded cache: ${rows.length} entries from database`);
  } catch (err) {
    console.error("[monitor] Failed to load cache from database:", err);
  }
}

async function scanTaf(ids: string) {
  if (!ids) return;
  const allIcaos = ids.split(",");
  const requestedCount = allIcaos.length;
  const BATCH_SIZE = 50;
  const batches: string[] = [];
  for (let i = 0; i < allIcaos.length; i += BATCH_SIZE) {
    batches.push(allIcaos.slice(i, i + BATCH_SIZE).join(","));
  }

  const allData: unknown[] = [];
  for (const batchIds of batches) {
    const data = await fetchJson(`${BASE_URL}/taf?ids=${batchIds}&format=json`);
    allData.push(...data);
  }

  const now = Date.now();
  const returnedIcaos: string[] = [];
  const watchlistSet = new Set(allIcaos);
  for (const entry of allData as Array<{ icaoId?: string; rawTAF?: string }>) {
    const icao = entry.icaoId;
    const rawTaf = entry.rawTAF ?? "";
    if (!icao) continue;
    returnedIcaos.push(icao);
    sonGorulenTs[icao] = now;
    if (sonGorulenTaf[icao] !== rawTaf) {
      const previousRawText = sonGorulenTaf[icao] ?? null;
      sonGorulenTaf[icao] = rawTaf;
      // Persist to database
      try {
        await db.insert(monitorCacheTable)
          .values({ icao, dataType: "TAF", rawText: rawTaf })
          .onConflictDoUpdate({
            target: [monitorCacheTable.icao, monitorCacheTable.dataType],
            set: { rawText: rawTaf, updatedAt: new Date() },
          });
      } catch (err) {
        console.error(`[monitor] Failed to persist TAF cache for ${icao}:`, err);
      }
      if (rawTaf.includes("AMD") || rawTaf.includes("COR")) {
        const alertType = rawTaf.includes("AMD") ? "TAF_AMD" : "TAF_COR";
        try {
          await db.insert(alertsTable).values({ type: alertType, icao, rawText: rawTaf, previousRawText });
          console.log(`[monitor] ✅ TAF alert: ${alertType} for ${icao}`);
        } catch (err) {
          console.error(`[monitor] ❌ TAF insert FAILED for ${icao}:`, err);
        }
      }

      // ── WX_EXTREME detection from TAF ──────────────────────────────────
      const TAF_EXTREME_WX_CODES = [
        "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
        "DS", "-DS", "+DS", "SS", "-SS", "+SS",
        "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
        "TSSN", "+TSSN", "TSGR", "TSPL",
        "-FZRA", "FZRA", "+FZRA",
        "FZDZ", "-FZDZ", "+FZDZ",
        "FZFG", "FZSN",
        "BLSN", "+BLSN", "-BLSN", "DRSN",
        "-RASN", "RASN", "+RASN",
        "SHGR", "SHGS",
        "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
      ];

      let hasTafWxExtreme = false;
      for (const code of TAF_EXTREME_WX_CODES) {
        const escaped = code.replace(/[+]/g, "\\+");
        if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(rawTaf)) {
          hasTafWxExtreme = true;
          break;
        }
      }
      if (hasTafWxExtreme) {
        // Deduplicate: skip if recent alert with same ICAO+type+rawText exists
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "WX_EXTREME"),
            eq(alertsTable.rawText, rawTaf),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "WX_EXTREME", icao, rawText: rawTaf, previousRawText });
            console.log(`[monitor] ✅ TAF WX_EXTREME alert for ${icao}`);
          } catch (err) {
            console.error(`[monitor] Failed to insert TAF WX_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate TAF WX_EXTREME for ${icao} (recent alert exists)`);
        }
      }

      // ── WIND_EXTREME detection from TAF ────────────────────────────────
      let hasTafWindExtreme = false;
      for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
        const spd = parseInt(m[1]);
        const gst = m[2] ? parseInt(m[2]) : 0;
        if (spd >= 25 || gst >= 29) { hasTafWindExtreme = true; break; }
      }
      if (!hasTafWindExtreme) {
        for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
          const spd = parseInt(m[1]);
          const gst = m[2] ? parseInt(m[2]) : 0;
          if (spd >= 13 || gst >= 15) { hasTafWindExtreme = true; break; }
        }
      }
      if (!hasTafWindExtreme) {
        for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
          const spd = Math.round(parseInt(m[1]) * 0.5399568);
          const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
          if (spd >= 25 || gst >= 29) { hasTafWindExtreme = true; break; }
        }
      }
      if (hasTafWindExtreme) {
        // Deduplicate: skip if recent alert with same ICAO+type+rawText exists
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "WIND_EXTREME"),
            eq(alertsTable.rawText, rawTaf),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "WIND_EXTREME", icao, rawText: rawTaf, previousRawText });
            console.log(`[monitor] ✅ TAF WIND_EXTREME alert for ${icao}`);
          } catch (err) {
            console.error(`[monitor] Failed to insert TAF WIND_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate TAF WIND_EXTREME for ${icao} (recent alert exists)`);
        }
      }
    }
  }
  // ── DIAG: Coverage analysis ────────────────────────────────────────────
  const returnedSet = new Set(returnedIcaos);
  const missingAirports = [...watchlistSet].filter(icao => !returnedSet.has(icao));
  if (missingAirports.length > 0) {
    console.log(`[monitor] ⚠️ DIAG: ${missingAirports.length} airports MISSING from TAF API response! Examples: ${missingAirports.slice(0, 10).join(", ")}`);
  }
  console.log(`[monitor] TAF scan: ${allData.length} entries for ${requestedCount} airports (missing: ${missingAirports.length})`);
}

async function scanMetar(ids: string) {
  if (!ids) return;
  const allIcaos = ids.split(",");
  const requestedCount = allIcaos.length;
  const BATCH_SIZE = 50;
  const batches: string[] = [];
  for (let i = 0; i < allIcaos.length; i += BATCH_SIZE) {
    batches.push(allIcaos.slice(i, i + BATCH_SIZE).join(","));
  }

  const allData: unknown[] = [];
  for (const batchIds of batches) {
    const data = await fetchJson(`${BASE_URL}/metar?ids=${batchIds}&format=json`);
    allData.push(...data);
  }

  const now = Date.now();
  const returnedIcaos: string[] = [];
  const watchlistSet = new Set(allIcaos);
  for (const entry of allData as Array<{ icaoId?: string; rawOb?: string; metarType?: string }>) {
    const icao = entry.icaoId;
    const rawMetar = entry.rawOb ?? "";
    if (!icao) continue;
    returnedIcaos.push(icao);
    sonGorulenTs[icao] = now;

    // ── DIAG: Log SPECI-related entries for key airports ─────────────────
    if (icao === "UAUU" || icao === "ULLI") {
      console.log(`[monitor] 🔍 DIAG METAR ${icao}: metarType=${entry.metarType} rawOb_start="${rawMetar.slice(0, 60)}" isSpeci=${rawMetar.startsWith("SPECI")} changed=${sonGorulenMetar[icao] !== rawMetar} cached="${(sonGorulenMetar[icao] ?? "(none)").slice(0, 60)}"`);
    }

    if (sonGorulenMetar[icao] !== rawMetar) {
      const previousRawText = sonGorulenMetar[icao] ?? null;
      sonGorulenMetar[icao] = rawMetar;
      // Persist to database
      try {
        await db.insert(monitorCacheTable)
          .values({ icao, dataType: "METAR", rawText: rawMetar })
          .onConflictDoUpdate({
            target: [monitorCacheTable.icao, monitorCacheTable.dataType],
            set: { rawText: rawMetar, updatedAt: new Date() },
          });
      } catch (err) {
        console.error(`[monitor] Failed to persist METAR cache for ${icao}:`, err);
      }
      if (rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ")) {
        try {
          await db.insert(alertsTable).values({ type: "SPECI", icao, rawText: rawMetar, previousRawText });
          console.log(`[monitor] ✅ SPECI alert for ${icao}`);
        } catch (err) {
          console.error(`[monitor] ❌ SPECI insert FAILED for ${icao}:`, err);
        }
      }

      // ── WX_EXTREME detection ──────────────────────────────────────────
      const EXTREME_WX_CODES = [
        "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
        "DS", "-DS", "+DS", "SS", "-SS", "+SS",
        "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
        "TSSN", "+TSSN", "TSGR", "TSPL",
        "-FZRA", "FZRA", "+FZRA",
        "FZDZ", "-FZDZ", "+FZDZ",
        "FZFG", "FZSN",
        "BLSN", "+BLSN", "-BLSN", "DRSN",
        "-RASN", "RASN", "+RASN",
        "SHGR", "SHGS",
        "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
      ];

      let hasWxExtreme = false;
      for (const code of EXTREME_WX_CODES) {
        const escaped = code.replace(/[+]/g, "\\+");
        if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(rawMetar)) {
          hasWxExtreme = true;
          break;
        }
      }
      if (hasWxExtreme) {
        // Deduplicate: skip if recent alert with same ICAO+type+rawText exists
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "WX_EXTREME"),
            eq(alertsTable.rawText, rawMetar),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "WX_EXTREME", icao, rawText: rawMetar, previousRawText });
            console.log(`[monitor] ✅ WX_EXTREME alert for ${icao}`);
          } catch (err) {
            console.error(`[monitor] Failed to insert WX_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate WX_EXTREME for ${icao} (recent alert exists)`);
        }
      }

      // ── WIND_EXTREME detection ────────────────────────────────────────
      let hasWindExtreme = false;
      for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
        const spd = parseInt(m[1]);
        const gst = m[2] ? parseInt(m[2]) : 0;
        if (spd >= 25 || gst >= 29) { hasWindExtreme = true; break; }
      }
      if (!hasWindExtreme) {
        for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
          const spd = parseInt(m[1]);
          const gst = m[2] ? parseInt(m[2]) : 0;
          if (spd >= 13 || gst >= 15) { hasWindExtreme = true; break; }
        }
      }
      if (!hasWindExtreme) {
        for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
          const spd = Math.round(parseInt(m[1]) * 0.5399568);
          const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
          if (spd >= 25 || gst >= 29) { hasWindExtreme = true; break; }
        }
      }
      if (hasWindExtreme) {
        // Deduplicate: skip if recent alert with same ICAO+type+rawText exists
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "WIND_EXTREME"),
            eq(alertsTable.rawText, rawMetar),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "WIND_EXTREME", icao, rawText: rawMetar, previousRawText });
            console.log(`[monitor] ✅ WIND_EXTREME alert for ${icao}`);
          } catch (err) {
            console.error(`[monitor] Failed to insert WIND_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate WIND_EXTREME for ${icao} (recent alert exists)`);
        }
      }

      // ── LIFR detection ─────────────────────────────────────────────────
      if (hasLifrConditions(rawMetar)) {
        // Deduplicate: skip if recent alert with same ICAO+type+rawText exists
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "LIFR"),
            eq(alertsTable.rawText, rawMetar),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "LIFR", icao, rawText: rawMetar, previousRawText });
            console.log(`[monitor] ✅ LIFR alert for ${icao}`);
          } catch (err) {
            console.error(`[monitor] Failed to insert LIFR alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate LIFR for ${icao} (recent alert exists)`);
        }
      }
    }
  }
  // ── DIAG: Coverage analysis ────────────────────────────────────────────
  const returnedSet = new Set(returnedIcaos);
  const missingAirports = [...watchlistSet].filter(icao => !returnedSet.has(icao));
  if (missingAirports.length > 0) {
    console.log(`[monitor] ⚠️ DIAG: ${missingAirports.length} airports MISSING from METAR API response! Examples: ${missingAirports.slice(0, 10).join(", ")}`);
    if (missingAirports.includes("UAUU")) {
      console.log(`[monitor] 🚨 DIAG: UAUU is MISSING from METAR API response!`);
    }
  }
  console.log(`[monitor] METAR scan: ${allData.length} entries for ${requestedCount} airports (missing: ${missingAirports.length})`);
}

function hasLifrConditions(rawMetar: string): boolean {
  // CAVOK means good conditions, not LIFR
  if (rawMetar.includes("CAVOK")) return false;

  // Parse visibility: 4-digit number before wind group in METAR
  // Pattern: ... station time wind visibility ...
  // Visibility appears as 4 digits after wind group (e.g., "26007KT 0800")
  const visMatch = rawMetar.match(/\b(\d{3}\d{1,2}|VRB\d{2,3})(?:G\d{2,3})?(?:KT|MPS|KMH)\s+(\d{4})\b/);
  if (visMatch) {
    const visMeters = parseInt(visMatch[2], 10);
    if (visMeters < 1600 && visMeters > 0) return true;
  }

  // Parse ceiling: lowest BKN, OVC, or VV layer
  const ceilMatches = [...rawMetar.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)];
  for (const m of ceilMatches) {
    const heightFt = parseInt(m[2], 10) * 100;
    if (heightFt < 500) return true;
  }

  return false;
}

async function sentinelRadar() {
  try {
    checkDailyReset();
    const icaos = await refreshIcaoCache();
    const ids = icaos.join(",");
    const urlLen = ids.length;
    console.log(`[monitor] 🔍 DIAG: Scanning ${icaos.length} airports, ids string length: ${urlLen} chars`);
    // Log a few sample ICAOs to verify watchlist content
    const sampleIcaos = icaos.slice(0, 5).join(", ") + (icaos.length > 5 ? ` ... (total ${icaos.length})` : "");
    console.log(`[monitor] 🔍 DIAG: Sample ICAOs: ${sampleIcaos}`);
    // Check if key airports are in the list
    const hasUAUU = icaos.includes("UAUU");
    const hasULLI = icaos.includes("ULLI");
    console.log(`[monitor] 🔍 DIAG: UAUU in watchlist: ${hasUAUU}, ULLI in watchlist: ${hasULLI}`);
    await Promise.all([scanTaf(ids), scanMetar(ids)]);
  } catch (err) {
    console.error("Scan error:", err);
  } finally {
    scanCount++;
    scanCountToday++;
    lastScan = new Date();
  }
}

export function startMonitor() {
  if (running) return;
  running = true;
  void (async () => {
    await seedIfEmpty();
    await loadMonitorCache();
    console.log(`AERO-SENTINEL monitor started — watching ${cachedIcaos.length} airports`);
    await sentinelRadar();
    intervalHandle = setInterval(sentinelRadar, 60_000);
  })();
}

export function stopMonitor() {
  if (intervalHandle) clearInterval(intervalHandle);
  running = false;
}

export function getMonitorState() {
  checkDailyReset();
  return { running, scanCount, scanCountToday, lastScan, monitoredAirports: cachedIcaos.length };
}

export function getAirports(): string[] {
  return cachedIcaos;
}

export function updateCachedIcaos(icaos: string[]) {
  cachedIcaos = icaos;
}

export async function getCurrentTaf(icao: string): Promise<string | null> {
  return sonGorulenTaf[icao] ?? null;
}

export async function getCurrentMetar(icao: string): Promise<string | null> {
  return sonGorulenMetar[icao] ?? null;
}

export function getAllWeather(): Array<{ icao: string; rawMetar: string | null; rawTaf: string | null }> {
  return cachedIcaos.map((icao) => ({
    icao,
    rawMetar: sonGorulenMetar[icao] ?? null,
    rawTaf:   sonGorulenTaf[icao]   ?? null,
  }));
}

export async function fetchWeatherForIcao(
  icao: string,
  { force = false }: { force?: boolean } = {},
): Promise<{ rawTaf: string | null; rawMetar: string | null }> {
  if (!force) {
    const ts      = sonGorulenTs[icao] ?? 0;
    const isFresh = Date.now() - ts < WEATHER_CACHE_MAX_AGE;

    // Return in-memory cache only when BOTH TAF and METAR have been populated
    // by a recent monitor scan. Using AND prevents returning null TAF when
    // METAR was scanned first (race condition between parallel scans).
    if (isFresh && sonGorulenTaf[icao] !== undefined && sonGorulenMetar[icao] !== undefined) {
      return {
        rawTaf:   sonGorulenTaf[icao]   ?? null,
        rawMetar: sonGorulenMetar[icao] ?? null,
      };
    }

    // Check display cache before hitting the live API (skip null entries)
    const dcEntry = displayCache[icao];
    if (dcEntry && Date.now() - dcEntry.ts < DISPLAY_CACHE_MAX_AGE
        && (dcEntry.rawTaf !== null || dcEntry.rawMetar !== null)) {
      return { rawTaf: dcEntry.rawTaf, rawMetar: dcEntry.rawMetar };
    }
  }

  // Cache is stale, bypassed, or this airport hasn't been scanned yet — fetch live
  try {
    const [tafData, metarData] = await Promise.all([
      fetchJson(`${BASE_URL}/taf?ids=${icao}&format=json`),
      fetchJson(`${BASE_URL}/metar?ids=${icao}&format=json`),
    ]);
    const rawTaf   = (tafData   as Array<{ rawTAF?: string }>)[0]?.rawTAF ?? null;
    const rawMetar = (metarData as Array<{ rawOb?:  string }>)[0]?.rawOb  ?? null;

    // Store in display cache ONLY — NEVER touch monitor's change-detection state
    displayCache[icao] = { rawTaf, rawMetar, ts: Date.now() };

    return { rawTaf, rawMetar };
  } catch {
    return { rawTaf: null, rawMetar: null };
  }
}

/** Clear the display cache for a specific ICAO (or all if no arg) */
export function clearDisplayCache(icao?: string) {
  if (icao) {
    delete displayCache[icao];
  } else {
    for (const key of Object.keys(displayCache)) delete displayCache[key];
  }
}
