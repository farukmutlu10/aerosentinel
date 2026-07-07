import { db, alertsTable, watchlistTable, monitorCacheTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { sendPushForAlert } from "./push.js";
import { hasLifrConditions, hasWxExtreme, hasWindExtreme, getActiveTafPeriod, getActiveTempos } from "./conditions.js";
import { logger } from "./logger.js";
export { hasLifrConditions, getActiveTafPeriod, getActiveTempos };

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
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000; // 2s → 4s → 8s
const MIN_REQUEST_INTERVAL_MS = 500; // rate-limit guard
let lastFetchTimestamp = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

/**
 * Single-attempt, no-backoff fetch for interactive (user-facing) requests.
 * fetchJson()'s 3-retry/2s-4s-8s-backoff behavior exists for the unattended
 * background scan, where nobody's watching and patience costs nothing — for
 * a request the user is staring at a loading skeleton for, the same policy
 * meant a single aviationweather.gov 429 could stall a watchlist-add for up
 * to ~14s. This still respects the shared MIN_REQUEST_INTERVAL_MS rate-limit
 * guard (so it doesn't hammer aviationweather.gov concurrently with the
 * periodic scan), it just doesn't retry on failure — the next 60s poll will
 * pick up any airport that came back empty.
 */
async function fetchJsonFast(url: string, timeoutMs = 8_000): Promise<unknown[]> {
  const endpoint = url.split('?')[0];
  try {
    const elapsed = Date.now() - lastFetchTimestamp;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastFetchTimestamp = Date.now();

    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      logger.error(`[monitor] fetchJsonFast: HTTP ${res.status} for ${endpoint} — not retrying`);
      return [];
    }
    const text = await res.text();
    if (!text || text.trim().length === 0) return [];
    const data = JSON.parse(text) as unknown[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logger.error(`[monitor] fetchJsonFast: fetch error for ${endpoint}: ${errMsg}`);
    return [];
  }
}

async function fetchJson(url: string): Promise<unknown[]> {
  const endpoint = url.split('?')[0];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Rate-limit guard: ensure minimum interval between requests
      const elapsed = Date.now() - lastFetchTimestamp;
      if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
      }
      lastFetchTimestamp = Date.now();

      const res = await fetch(url, { headers: HEADERS });

      if (!res.ok) {
        const preview = (await res.text()).slice(0, 200);
        logger.error(
          `[monitor] HTTP ${res.status} for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}) body: "${preview}"`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.info(`[monitor] Retrying ${endpoint} in ${backoff}ms...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      // Check for empty body before attempting JSON parse
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        logger.error(
          `[monitor] Empty response body for ${endpoint} (attempt ${attempt}/${MAX_RETRIES})`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.info(`[monitor] Retrying ${endpoint} in ${backoff}ms (empty body)...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      const data = JSON.parse(text) as unknown[];

      if (!Array.isArray(data)) {
        logger.error(
          `[monitor] Unexpected non-array response for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}): "${text.slice(0, 200)}"`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.info(`[monitor] Retrying ${endpoint} in ${backoff}ms (non-array)...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      if (attempt > 1) {
        logger.info(`[monitor] ✅ ${endpoint} succeeded on attempt ${attempt}/${MAX_RETRIES}`);
      }
      return data;

    } catch (err) {
      const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      logger.error(
        `[monitor] fetch error for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}): ${errMsg}`
      );
      if (attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.info(`[monitor] Retrying ${endpoint} in ${backoff}ms...`);
        await sleep(backoff);
      }
    }
  }

  return [];
}

export async function refreshIcaoCache(): Promise<string[]> {
  // Only include watchlist entries added within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allRows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable)
    .where(gte(watchlistTable.addedAt, thirtyDaysAgo));
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
    logger.info(`[monitor] Loaded cache: ${rows.length} entries from database`);
  } catch (err) {
    logger.error({ err }, "[monitor] Failed to load cache from database:");
  }
}

type ConditionAlertType = "LIFR" | "WX_EXTREME" | "WIND_EXTREME";
type AlertType = "TAF_AMD" | "TAF_COR" | "SPECI" | ConditionAlertType;

/** Priority-based condition detection: LIFR > WX_EXTREME > WIND_EXTREME. */
function detectConditionType(rawText: string): ConditionAlertType | null {
  if (hasLifrConditions(rawText)) return "LIFR";
  if (hasWxExtreme(rawText)) return "WX_EXTREME";
  if (hasWindExtreme(rawText)) return "WIND_EXTREME";
  return null;
}

/**
 * Inserts an alert unless an identical one (same icao+type+rawText) was
 * already recorded in the last 24h. Used for EVERY alert type (TAF_AMD/COR,
 * SPECI, LIFR/WX_EXTREME/WIND_EXTREME) so a race between overlapping scans,
 * a process restart mid-cycle, or any other double-detection can never
 * surface the exact same report to the user twice.
 */
async function insertAlertIfNew(
  alertType: AlertType,
  icao: string,
  rawText: string,
  previousRawText: string | null,
): Promise<number | null> {
  const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
    .where(and(
      eq(alertsTable.icao, icao),
      eq(alertsTable.type, alertType),
      eq(alertsTable.rawText, rawText),
      sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
    )).limit(1);
  if (recentDup.length > 0) {
    logger.info({ icao, alertType }, "[monitor] Skipping duplicate alert (recent alert exists)");
    return null;
  }
  try {
    // .returning() so sendPushForAlert gets the real row id instead of the
    // hardcoded 0 it used to receive — that made every push notification's
    // dedup tag for a given icao+type collide (aero-alert-ICAO-0 for all of
    // them, letting one overwrite another) and made notification-click
    // routing unable to target the specific alert.
    const inserted = await db.insert(alertsTable)
      .values({ type: alertType, icao, rawText, previousRawText })
      .returning({ id: alertsTable.id });
    const alertId = inserted[0]?.id ?? 0;
    logger.info({ icao, alertType, alertId }, "[monitor] Alert inserted");
    void sendPushForAlert(alertType, icao, rawText, alertId);
    return alertId;
  } catch (err) {
    logger.error({ err, icao, alertType }, "[monitor] Failed to insert alert");
    return null;
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
  let tafEntriesWithRaw = 0;
  let tafEntriesWithoutRaw = 0;
  let tafChangesDetected = 0;
  let tafAmdCorDetected = 0;
  let tafAlertsInserted = 0;
  for (const entry of allData as Array<{ icaoId?: string; rawTAF?: string; tafType?: string; prior?: number }>) {
    const icao = entry.icaoId;
    const rawTaf = entry.rawTAF ?? "";
    const tafType = (entry.tafType ?? "").toUpperCase();
    const prior = entry.prior;
    if (!icao) continue;
    returnedIcaos.push(icao);
    sonGorulenTs[icao] = now;
    if (rawTaf) tafEntriesWithRaw++; else tafEntriesWithoutRaw++;
    if (sonGorulenTaf[icao] !== rawTaf) {
      tafChangesDetected++;
      const previousRawText = sonGorulenTaf[icao] ?? null;
      const isFirstScan = previousRawText === null;
      const cachedLen = previousRawText?.length ?? -1;
      const newLen = rawTaf.length;
      const tafPrefix = rawTaf.substring(0, 50);
      logger.info(`[monitor] 🔄 TAF CHANGE: ${icao} | cached=${cachedLen} new=${newLen} | "${tafPrefix}" | prior=${prior} tafType="${tafType}" firstScan=${isFirstScan}`);
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
        logger.error({ err }, `[monitor] Failed to persist TAF cache for ${icao}:`);
      }
      const hasAmdCor = rawTaf.includes("COR") || rawTaf.includes("AMD") || tafType === "AMD" || tafType === "COR";
      if (hasAmdCor) {
        tafAmdCorDetected++;
        const alertType = rawTaf.includes("COR") ? "TAF_COR" : "TAF_AMD";
        await insertAlertIfNew(alertType, icao, rawTaf, previousRawText);
        tafAlertsInserted++;
      }

      // When AMD/COR is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
      // since the AMD/COR card already shows the changed TAF text.
      if (!hasAmdCor) {
        const conditionType = detectConditionType(rawTaf);
        if (conditionType) {
          await insertAlertIfNew(conditionType, icao, rawTaf, previousRawText);
        }
      }
    } else if (rawTaf) {
      // ── B2 fix: TAF text unchanged — re-evaluate active period + TEMPO conditions ──
      // A FM period may have become "current" since the last scan even though
      // the full TAF text hasn't changed.  Re-evaluate LIFR / WX_EXTREME /
      // WIND_EXTREME on the active period's weather section + any active TEMPO/BECMG groups.
      //
      // Skip entirely when this (unchanged) TAF is itself an AMD/COR — that
      // report already produced a TAF_AMD/TAF_COR alert when it first arrived,
      // and per the "one alert per report" rule an AMD/COR must never ALSO
      // spawn a LIFR/WX_EXTREME/WIND_EXTREME alert for the same underlying text.
      const hasAmdCor = rawTaf.includes("COR") || rawTaf.includes("AMD") || tafType === "AMD" || tafType === "COR";
      if (hasAmdCor) continue;

      const activePeriod = getActiveTafPeriod(rawTaf);
      const activeTempos = getActiveTempos(rawTaf);
      const tempoSuffix = activeTempos.length > 0
        ? `+TEMPO[${activeTempos.join("|").slice(0, 60)}]`
        : "";
      const periodKey = (activePeriod?.key ?? "BASE") + tempoSuffix;
      const lastAlert = tafPeriodLastAlert[icao];

      // Only re-evaluate when the active period or TEMPO composition has changed
      if (!lastAlert || lastAlert.periodKey !== periodKey) {
        const periodText = activePeriod?.text ?? rawTaf;
        // Merge: base/FM period text + active TEMPO/BECMG weather — but only
        // append TEMPO/BECMG text not already present in periodText. When there's
        // no FM group, periodText falls back to the entire raw TAF, which already
        // contains every TEMPO/BECMG line; appending activeTempos unconditionally
        // duplicated that text (e.g. "...OVC002 0300 −RA FG OVC003" repeating a
        // group verbatim) and made an unchanged TAF look like a new report.
        const newTempos = activeTempos.filter((t) => !periodText.includes(t));
        const combinedText = newTempos.length > 0
          ? periodText + " " + newTempos.join(" ")
          : periodText;

        // Check combined text (period + TEMPO) so TEMPO visibility/wind is detected
        const alertType = detectConditionType(combinedText);
        if (alertType) {
          // DB dedup uses combined text (period + TEMPO) as rawText for per-period deduplication
          await insertAlertIfNew(alertType, icao, combinedText, rawTaf);
        }
        tafPeriodLastAlert[icao] = { periodKey, alertType: alertType ?? "NONE" };
      }
    }
  }
  // ── DIAG: Coverage analysis ────────────────────────────────────────────
  const returnedSet = new Set(returnedIcaos);
  const missingAirports = [...watchlistSet].filter(icao => !returnedSet.has(icao));
  if (missingAirports.length > 0) {
    logger.info(`[monitor] ⚠️ DIAG: ${missingAirports.length} airports MISSING from TAF API response! Examples: ${missingAirports.slice(0, 10).join(", ")}`);
  }
  logger.info(`[monitor] TAF scan SUMMARY: ${allData.length} entries for ${requestedCount} airports | rawTAF: ${tafEntriesWithRaw}✓ ${tafEntriesWithoutRaw}✗ | changes: ${tafChangesDetected} | amdCor: ${tafAmdCorDetected} | inserted: ${tafAlertsInserted} | missing: ${missingAirports.length}`);
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
    const data = await fetchJson(`${BASE_URL}/metar?ids=${batchIds}&format=json&hours=2`);
    allData.push(...data);
  }

  // Deduplicate: hours=2 returns multiple entries per station.
  // Keep only the latest per ICAO for change detection; store older
  // entries in historyByIcao so we can retroactively catch SPECIs that
  // were already superseded by a regular METAR before the monitor scanned.
  type MetarApiEntry = { icaoId?: string; rawOb?: string; metarType?: string; obsTime?: number };
  const groupedByIcao = new Map<string, MetarApiEntry[]>();
  for (const entry of allData as MetarApiEntry[]) {
    const icao = entry.icaoId;
    if (!icao) continue;
    let arr = groupedByIcao.get(icao);
    if (!arr) { arr = []; groupedByIcao.set(icao, arr); }
    arr.push(entry);
  }
  const latestMetarData: MetarApiEntry[] = [];
  const historyByIcao = new Map<string, MetarApiEntry[]>();
  for (const [icao, entries] of groupedByIcao) {
    entries.sort((a, b) => (b.obsTime ?? 0) - (a.obsTime ?? 0));
    latestMetarData.push(entries[0]);
    if (entries.length > 1) historyByIcao.set(icao, entries.slice(1));
  }

  const now = Date.now();
  const returnedIcaos: string[] = [];
  const watchlistSet = new Set(allIcaos);
  let metEntriesWithRaw = 0;
  let metEntriesWithoutRaw = 0;
  let metChangesDetected = 0;
  let metAlertsInserted = 0;
  let metSpeciFromHistory = 0;
  for (const entry of latestMetarData) {
    const icao = entry.icaoId;
    const rawMetar = entry.rawOb ?? "";
    const metarType = (entry.metarType ?? "").toUpperCase();
    if (!icao) continue;
    returnedIcaos.push(icao);
    sonGorulenTs[icao] = now;
    if (rawMetar) metEntriesWithRaw++; else metEntriesWithoutRaw++;

    // ── DIAG: Log SPECI-related entries for key airports ─────────────────
    if (icao === "UAUU" || icao === "ULLI") {
      logger.info(`[monitor] 🔍 DIAG METAR ${icao}: metarType="${metarType}" rawOb_start="${rawMetar.slice(0, 60)}" isSpeci=${rawMetar.startsWith("SPECI")} changed=${sonGorulenMetar[icao] !== rawMetar} cached="${(sonGorulenMetar[icao] ?? "(none)").slice(0, 60)}"`);
    }

    if (sonGorulenMetar[icao] !== rawMetar) {
      metChangesDetected++;
      const previousRawText = sonGorulenMetar[icao] ?? null;
      const cachedLen = previousRawText?.length ?? -1;
      const newLen = rawMetar.length;
      const metarPrefix = rawMetar.substring(0, 50);
      logger.info(`[monitor] 🔄 METAR CHANGE: ${icao} | cached=${cachedLen} new=${newLen} | "${metarPrefix}" | metarType="${metarType}"`);
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
        logger.error({ err }, `[monitor] Failed to persist METAR cache for ${icao}:`);
      }
      const hasSpeci = rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ") || metarType === "SPECI";
      if (hasSpeci) {
        await insertAlertIfNew("SPECI", icao, rawMetar, previousRawText);
        metAlertsInserted++;
      }

      // When SPECI is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
      // since the SPECI card already shows the special METAR text.
      if (!hasSpeci) {
        const conditionType = detectConditionType(rawMetar);
        if (conditionType) {
          await insertAlertIfNew(conditionType, icao, rawMetar, previousRawText);
        }
      }
    }
  }

  // ── Retroactive SPECI detection: catch SPECIs that were superseded ─────
  // When aviationweather.gov returns hours=2 data, older SPECI entries may
  // appear alongside the latest regular METAR. We scan these to avoid
  // missing short-lived SPECIs that were replaced before the next monitor scan.
  for (const [icao, historyEntries] of historyByIcao) {
    for (const entry of historyEntries) {
      const entryRaw = entry.rawOb ?? "";
      const entryType = (entry.metarType ?? "").toUpperCase();
      const isSpeci = entryRaw.startsWith("SPECI") || entryType === "SPECI";
      if (!isSpeci) continue;
      // Skip if this SPECI text matches what's currently cached (already processed)
      if (entryRaw === sonGorulenMetar[icao]) continue;
      await insertAlertIfNew("SPECI", icao, entryRaw, sonGorulenMetar[icao] ?? null);
      metSpeciFromHistory++;
      metAlertsInserted++;
    }
  }

  // ── DIAG: Coverage analysis ────────────────────────────────────────────
  const returnedSet = new Set(returnedIcaos);
  const missingAirports = [...watchlistSet].filter(icao => !returnedSet.has(icao));
  if (missingAirports.length > 0) {
    logger.info(`[monitor] ⚠️ DIAG: ${missingAirports.length} airports MISSING from METAR API response! Examples: ${missingAirports.slice(0, 10).join(", ")}`);
    if (missingAirports.includes("UAUU")) {
      logger.info(`[monitor] 🚨 DIAG: UAUU is MISSING from METAR API response!`);
    }
  }
  logger.info(`[monitor] METAR scan SUMMARY: ${allData.length} raw → ${latestMetarData.length} unique for ${requestedCount} airports | rawOb: ${metEntriesWithRaw}✓ ${metEntriesWithoutRaw}✗ | changes: ${metChangesDetected} | alerts: ${metAlertsInserted} | speciFromHistory: ${metSpeciFromHistory} | missing: ${missingAirports.length}`);
}

// ── TAF active-period parsing (for B2 fix) ──────────────────────────────────

/** Tracks which TAF period was last alerted per ICAO to avoid re-alerting */
const tafPeriodLastAlert: Record<string, { periodKey: string; alertType: string }> = {};

let isScanning = false;

async function sentinelRadar() {
  if (isScanning) {
    logger.warn("[monitor] Previous scan still running — skipping this cycle to avoid overlap");
    return;
  }
  isScanning = true;
  try {
    checkDailyReset();
    const icaos = await refreshIcaoCache();
    const ids = icaos.join(",");
    const urlLen = ids.length;
    logger.info(`[monitor] 🔍 DIAG: Scanning ${icaos.length} airports, ids string length: ${urlLen} chars`);
    // Log a few sample ICAOs to verify watchlist content
    const sampleIcaos = icaos.slice(0, 5).join(", ") + (icaos.length > 5 ? ` ... (total ${icaos.length})` : "");
    logger.info(`[monitor] 🔍 DIAG: Sample ICAOs: ${sampleIcaos}`);
    // Check if key airports are in the list
    const hasUAUU = icaos.includes("UAUU");
    const hasULLI = icaos.includes("ULLI");
    logger.info(`[monitor] 🔍 DIAG: UAUU in watchlist: ${hasUAUU}, ULLI in watchlist: ${hasULLI}`);
    await Promise.all([scanTaf(ids), scanMetar(ids)]);
  } catch (err) {
    logger.error({ err }, "Scan error:");
  } finally {
    scanCount++;
    scanCountToday++;
    lastScan = new Date();
    isScanning = false;
  }
}

export function startMonitor() {
  if (running) return;
  running = true;
  logger.info("[monitor] startMonitor() called — running=true");
  void (async () => {
    try {
      logger.info("[monitor] IIFE: starting seedIfEmpty()");
      await seedIfEmpty();
      logger.info(`[monitor] IIFE: seedIfEmpty() done — ${cachedIcaos.length} ICAOs`);
    } catch (err) {
      logger.error({ err }, "[monitor] ❌ IIFE: seedIfEmpty() FAILED:");
      // Don't return — try to continue with whatever cachedIcaos we have
    }
    try {
      logger.info("[monitor] IIFE: starting loadMonitorCache()");
      await loadMonitorCache();
      logger.info("[monitor] IIFE: loadMonitorCache() done");
    } catch (err) {
      logger.error({ err }, "[monitor] ❌ IIFE: loadMonitorCache() FAILED:");
    }
    try {
      logger.info(`AERO-SENTINEL monitor started — watching ${cachedIcaos.length} airports`);
      await sentinelRadar();
    } catch (err) {
      logger.error({ err }, "[monitor] ❌ IIFE: first sentinelRadar() FAILED:");
    }
    intervalHandle = setInterval(sentinelRadar, 60_000);
    logger.info("[monitor] ✅ setInterval armed — monitor is fully operational");
  })().catch((err) => {
    logger.error({ err }, "[monitor] ❌ IIFE: UNHANDLED top-level rejection:");
    // Don't crash — keep running=true so status endpoint doesn't show "stopped"
  });
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
): Promise<{ rawTaf: string | null; rawMetar: string | null; tafType: string | null; metarType: string | null }> {
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
        tafType: null,
        metarType: null,
      };
    }

    // Check display cache before hitting the live API (skip null entries)
    const dcEntry = displayCache[icao];
    if (dcEntry && Date.now() - dcEntry.ts < DISPLAY_CACHE_MAX_AGE
        && (dcEntry.rawTaf !== null || dcEntry.rawMetar !== null)) {
      return { rawTaf: dcEntry.rawTaf, rawMetar: dcEntry.rawMetar, tafType: null, metarType: null };
    }
  }

  // Cache is stale, bypassed, or this airport hasn't been scanned yet — fetch live.
  // Fast path (no retry/backoff): this is a user-facing request, not the scan.
  try {
    const [tafData, metarData] = await Promise.all([
      fetchJsonFast(`${BASE_URL}/taf?ids=${icao}&format=json`),
      fetchJsonFast(`${BASE_URL}/metar?ids=${icao}&format=json`),
    ]);
    const tafEntry = (tafData as Array<{ rawTAF?: string; tafType?: string }>)[0];
    const metarEntry = (metarData as Array<{ rawOb?: string; metarType?: string }>)[0];
    const rawTaf   = tafEntry?.rawTAF ?? null;
    const rawMetar = metarEntry?.rawOb  ?? null;
    const tafType  = tafEntry?.tafType ?? null;
    const metarType = metarEntry?.metarType ?? null;

    // Store in display cache ONLY — NEVER touch monitor's change-detection state
    displayCache[icao] = { rawTaf, rawMetar, ts: Date.now() };

    return { rawTaf, rawMetar, tafType, metarType };
  } catch {
    return { rawTaf: null, rawMetar: null, tafType: null, metarType: null };
  }
}

/**
 * Batched version of fetchWeatherForIcao — used by /watchlist/weather so that
 * pasting a large batch of never-before-seen ICAOs doesn't serialize into
 * one aviationweather.gov round trip per airport per report type. fetchJson()
 * shares a single global rate limiter (MIN_REQUEST_INTERVAL_MS) across the
 * whole process, so N airports needing a live fetch used to mean 2N
 * individually-throttled requests (~500ms apart) before this existed. Batching
 * mirrors what the periodic monitor scan already does for scanTaf/scanMetar:
 * up to 50 ICAOs per request, so N airports collapse into ceil(N/50)*2 calls.
 */
export async function fetchWeatherForIcaos(
  icaos: string[],
  { force = false }: { force?: boolean } = {},
): Promise<Record<string, { rawTaf: string | null; rawMetar: string | null }>> {
  const result: Record<string, { rawTaf: string | null; rawMetar: string | null }> = {};
  const needsFetch: string[] = [];

  for (const icao of icaos) {
    if (!force) {
      const ts = sonGorulenTs[icao] ?? 0;
      const isFresh = Date.now() - ts < WEATHER_CACHE_MAX_AGE;
      if (isFresh && sonGorulenTaf[icao] !== undefined && sonGorulenMetar[icao] !== undefined) {
        result[icao] = { rawTaf: sonGorulenTaf[icao] ?? null, rawMetar: sonGorulenMetar[icao] ?? null };
        continue;
      }
      const dcEntry = displayCache[icao];
      if (dcEntry && Date.now() - dcEntry.ts < DISPLAY_CACHE_MAX_AGE
          && (dcEntry.rawTaf !== null || dcEntry.rawMetar !== null)) {
        result[icao] = { rawTaf: dcEntry.rawTaf, rawMetar: dcEntry.rawMetar };
        continue;
      }
    }
    needsFetch.push(icao);
  }

  if (needsFetch.length === 0) return result;

  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < needsFetch.length; i += BATCH_SIZE) {
    batches.push(needsFetch.slice(i, i + BATCH_SIZE));
  }

  const tafByIcao: Record<string, string> = {};
  const metarByIcao: Record<string, string> = {};

  // Batches themselves still run through fetchJsonFast's shared rate limiter
  // sequentially (by design, to be polite to aviationweather.gov), but that's
  // now ceil(N/50)*2 throttled calls instead of N*2. Uses the no-retry fast
  // path — this is a user-facing request, not the background scan.
  for (const batch of batches) {
    const ids = batch.join(",");
    try {
      const [tafData, metarData] = await Promise.all([
        fetchJsonFast(`${BASE_URL}/taf?ids=${ids}&format=json`),
        fetchJsonFast(`${BASE_URL}/metar?ids=${ids}&format=json`),
      ]);
      for (const entry of tafData as Array<{ icaoId?: string; rawTAF?: string }>) {
        if (entry.icaoId && entry.rawTAF) tafByIcao[entry.icaoId] = entry.rawTAF;
      }
      for (const entry of metarData as Array<{ icaoId?: string; rawOb?: string }>) {
        if (entry.icaoId && entry.rawOb) metarByIcao[entry.icaoId] = entry.rawOb;
      }
    } catch (err) {
      logger.error({ err }, "[monitor] fetchWeatherForIcaos batch failed:");
    }
  }

  for (const icao of needsFetch) {
    const rawTaf = tafByIcao[icao] ?? null;
    const rawMetar = metarByIcao[icao] ?? null;
    displayCache[icao] = { rawTaf, rawMetar, ts: Date.now() };
    result[icao] = { rawTaf, rawMetar };
  }

  return result;
}

/** Clear the display cache for a specific ICAO (or all if no arg) */
export function clearDisplayCache(icao?: string) {
  if (icao) {
    delete displayCache[icao];
  } else {
    for (const key of Object.keys(displayCache)) delete displayCache[key];
  }
}
