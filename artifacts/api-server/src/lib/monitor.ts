import { db, alertsTable, watchlistTable, monitorCacheTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { sendPushForAlert } from "./push.js";

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
        console.error(
          `[monitor] HTTP ${res.status} for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}) body: "${preview}"`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.log(`[monitor] Retrying ${endpoint} in ${backoff}ms...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      // Check for empty body before attempting JSON parse
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        console.error(
          `[monitor] Empty response body for ${endpoint} (attempt ${attempt}/${MAX_RETRIES})`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.log(`[monitor] Retrying ${endpoint} in ${backoff}ms (empty body)...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      const data = JSON.parse(text) as unknown[];

      if (!Array.isArray(data)) {
        console.error(
          `[monitor] Unexpected non-array response for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}): "${text.slice(0, 200)}"`
        );
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.log(`[monitor] Retrying ${endpoint} in ${backoff}ms (non-array)...`);
          await sleep(backoff);
          continue;
        }
        return [];
      }

      if (attempt > 1) {
        console.log(`[monitor] ✅ ${endpoint} succeeded on attempt ${attempt}/${MAX_RETRIES}`);
      }
      return data;

    } catch (err) {
      const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(
        `[monitor] fetch error for ${endpoint} (attempt ${attempt}/${MAX_RETRIES}): ${errMsg}`
      );
      if (attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`[monitor] Retrying ${endpoint} in ${backoff}ms...`);
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
      console.log(`[monitor] 🔄 TAF CHANGE: ${icao} | cached=${cachedLen} new=${newLen} | "${tafPrefix}" | prior=${prior} tafType="${tafType}" firstScan=${isFirstScan}`);
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
      const hasAmdCor = rawTaf.includes("COR") || rawTaf.includes("AMD") || tafType === "AMD" || tafType === "COR";
      if (hasAmdCor) {
        tafAmdCorDetected++;
        const alertType = rawTaf.includes("COR") ? "TAF_COR" : "TAF_AMD";
        try {
          await db.insert(alertsTable).values({ type: alertType, icao, rawText: rawTaf, previousRawText });
          tafAlertsInserted++;
          console.log(`[monitor] ✅ TAF alert: ${alertType} for ${icao}`);
          void sendPushForAlert(alertType, icao, rawTaf, 0);
        } catch (err) {
          console.error(`[monitor] ❌ TAF insert FAILED for ${icao}:`, err);
        }
      }

      // When AMD/COR is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
      // since the AMD/COR card already shows the changed TAF text.
      if (!hasAmdCor) {
      // ── Priority-based WX_CRIT suppression: LIFR > WX_EXTREME > WIND_EXTREME ──

      // 1. LIFR detection from TAF (highest priority)
      if (hasLifrConditions(rawTaf)) {
        const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.icao, icao),
            eq(alertsTable.type, "LIFR"),
            eq(alertsTable.rawText, rawTaf),
            sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
          )).limit(1);
        if (recentDup.length === 0) {
          try {
            await db.insert(alertsTable).values({ type: "LIFR", icao, rawText: rawTaf, previousRawText });
            console.log(`[monitor] ✅ TAF LIFR alert for ${icao}`);
            void sendPushForAlert("LIFR", icao, rawTaf, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert TAF LIFR alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate TAF LIFR for ${icao} (recent alert exists)`);
        }
      } else {
      // 2. WX_EXTREME detection from TAF (second priority)
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
            void sendPushForAlert("WX_EXTREME", icao, rawTaf, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert TAF WX_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate TAF WX_EXTREME for ${icao} (recent alert exists)`);
        }
      } else {
      // 3. WIND_EXTREME detection from TAF (lowest priority)
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
            void sendPushForAlert("WIND_EXTREME", icao, rawTaf, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert TAF WIND_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate TAF WIND_EXTREME for ${icao} (recent alert exists)`);
        }
      }
      } // end WX_EXTREME else
      } // end LIFR else
      } // end !hasAmdCor
    } else if (rawTaf) {
      // ── B2 fix: TAF text unchanged — re-evaluate active period conditions ──
      // A FM period may have become "current" since the last scan even though
      // the full TAF text hasn't changed.  Re-evaluate LIFR / WX_EXTREME /
      // WIND_EXTREME on the active period's weather section.
      const activePeriod = getActiveTafPeriod(rawTaf);
      const periodKey = activePeriod?.key ?? "BASE";
      const lastAlert = tafPeriodLastAlert[icao];

      // Only re-evaluate when the active period has changed
      if (!lastAlert || lastAlert.periodKey !== periodKey) {
        const periodText = activePeriod?.text ?? rawTaf;
        let alertType: "LIFR" | "WX_EXTREME" | "WIND_EXTREME" | null = null;

        // ── Priority-based: LIFR > WX_EXTREME > WIND_EXTREME ──

        // 1. LIFR
        if (hasLifrConditions(periodText)) {
          alertType = "LIFR";
        } else {
        // 2. WX_EXTREME
        const _PERIOD_EXTREME_WX_CODES = [
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
        let _periodWxExtreme = false;
        for (const code of _PERIOD_EXTREME_WX_CODES) {
          const escaped = code.replace(/[+]/g, "\\+");
          if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(periodText)) {
            _periodWxExtreme = true; break;
          }
        }
        if (_periodWxExtreme) {
          alertType = "WX_EXTREME";
        } else {
        // 3. WIND_EXTREME
        let _periodWindExtreme = false;
        for (const m of periodText.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
          const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
          if (spd >= 25 || gst >= 29) { _periodWindExtreme = true; break; }
        }
        if (!_periodWindExtreme) {
          for (const m of periodText.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
            const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
            if (spd >= 13 || gst >= 15) { _periodWindExtreme = true; break; }
          }
        }
        if (!_periodWindExtreme) {
          for (const m of periodText.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
            const spd = Math.round(parseInt(m[1]) * 0.5399568);
            const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
            if (spd >= 25 || gst >= 29) { _periodWindExtreme = true; break; }
          }
        }
        if (_periodWindExtreme) alertType = "WIND_EXTREME";
        } // end WX_EXTREME else
        } // end LIFR else

        if (alertType) {
          // DB dedup: use period text as rawText for per-period deduplication
          const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
            .where(and(
              eq(alertsTable.icao, icao),
              eq(alertsTable.type, alertType),
              eq(alertsTable.rawText, periodText),
              sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
            )).limit(1);
          if (recentDup.length === 0) {
            try {
              await db.insert(alertsTable).values({ type: alertType, icao, rawText: periodText, previousRawText: rawTaf });
              console.log(`[monitor] ✅ TAF ${alertType} (period re-eval) for ${icao} [${periodKey}]`);
              void sendPushForAlert(alertType, icao, periodText, 0);
            } catch (err) {
              console.error(`[monitor] Failed to insert TAF ${alertType} for ${icao}:`, err);
            }
          } else {
            console.log(`[monitor] ⏭️ Skipping duplicate TAF ${alertType} for ${icao} [${periodKey}] (recent alert exists)`);
          }
        }
        tafPeriodLastAlert[icao] = { periodKey, alertType: alertType ?? "NONE" };
      }
    }
  }
  // ── DIAG: Coverage analysis ────────────────────────────────────────────
  const returnedSet = new Set(returnedIcaos);
  const missingAirports = [...watchlistSet].filter(icao => !returnedSet.has(icao));
  if (missingAirports.length > 0) {
    console.log(`[monitor] ⚠️ DIAG: ${missingAirports.length} airports MISSING from TAF API response! Examples: ${missingAirports.slice(0, 10).join(", ")}`);
  }
  console.log(`[monitor] TAF scan SUMMARY: ${allData.length} entries for ${requestedCount} airports | rawTAF: ${tafEntriesWithRaw}✓ ${tafEntriesWithoutRaw}✗ | changes: ${tafChangesDetected} | amdCor: ${tafAmdCorDetected} | inserted: ${tafAlertsInserted} | missing: ${missingAirports.length}`);
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
      console.log(`[monitor] 🔍 DIAG METAR ${icao}: metarType="${metarType}" rawOb_start="${rawMetar.slice(0, 60)}" isSpeci=${rawMetar.startsWith("SPECI")} changed=${sonGorulenMetar[icao] !== rawMetar} cached="${(sonGorulenMetar[icao] ?? "(none)").slice(0, 60)}"`);
    }

    if (sonGorulenMetar[icao] !== rawMetar) {
      metChangesDetected++;
      const previousRawText = sonGorulenMetar[icao] ?? null;
      const cachedLen = previousRawText?.length ?? -1;
      const newLen = rawMetar.length;
      const metarPrefix = rawMetar.substring(0, 50);
      console.log(`[monitor] 🔄 METAR CHANGE: ${icao} | cached=${cachedLen} new=${newLen} | "${metarPrefix}" | metarType="${metarType}"`);
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
      const hasSpeci = rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ") || metarType === "SPECI";
      if (hasSpeci) {
        try {
          await db.insert(alertsTable).values({ type: "SPECI", icao, rawText: rawMetar, previousRawText });
          metAlertsInserted++;
          console.log(`[monitor] ✅ SPECI alert for ${icao}`);
          void sendPushForAlert("SPECI", icao, rawMetar, 0);
        } catch (err) {
          console.error(`[monitor] ❌ SPECI insert FAILED for ${icao}:`, err);
        }
      }

      // When SPECI is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
      // since the SPECI card already shows the special METAR text.
      if (!hasSpeci) {
      // ── Priority-based WX_CRIT suppression: LIFR > WX_EXTREME > WIND_EXTREME ──

      // 1. LIFR detection (highest priority)
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
            void sendPushForAlert("LIFR", icao, rawMetar, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert LIFR alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate LIFR for ${icao} (recent alert exists)`);
        }
      } else {
      // 2. WX_EXTREME detection (second priority)
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
            void sendPushForAlert("WX_EXTREME", icao, rawMetar, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert WX_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate WX_EXTREME for ${icao} (recent alert exists)`);
        }
      } else {
      // 3. WIND_EXTREME detection (lowest priority)
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
            void sendPushForAlert("WIND_EXTREME", icao, rawMetar, 0);
          } catch (err) {
            console.error(`[monitor] Failed to insert WIND_EXTREME alert for ${icao}:`, err);
          }
        } else {
          console.log(`[monitor] ⏭️ Skipping duplicate WIND_EXTREME for ${icao} (recent alert exists)`);
        }
      }
      } // end WX_EXTREME else
      } // end LIFR else
      } // end !hasSpeci
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
      // Deduplicate against DB: skip if a recent alert with same raw text exists
      const recentDup = await db.select({ id: alertsTable.id }).from(alertsTable)
        .where(and(
          eq(alertsTable.icao, icao),
          eq(alertsTable.type, "SPECI"),
          eq(alertsTable.rawText, entryRaw),
          sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
        )).limit(1);
      if (recentDup.length === 0) {
        try {
          await db.insert(alertsTable).values({
            type: "SPECI", icao, rawText: entryRaw,
            previousRawText: sonGorulenMetar[icao] ?? null,
          });
          metSpeciFromHistory++;
          metAlertsInserted++;
          console.log(`[monitor] ✅ SPECI (from history) alert for ${icao}: "${entryRaw.slice(0, 60)}"`);
          void sendPushForAlert("SPECI", icao, entryRaw, 0);
        } catch (err) {
          console.error(`[monitor] ❌ SPECI (from history) insert FAILED for ${icao}:`, err);
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
  console.log(`[monitor] METAR scan SUMMARY: ${allData.length} raw → ${latestMetarData.length} unique for ${requestedCount} airports | rawOb: ${metEntriesWithRaw}✓ ${metEntriesWithoutRaw}✗ | changes: ${metChangesDetected} | alerts: ${metAlertsInserted} | speciFromHistory: ${metSpeciFromHistory} | missing: ${missingAirports.length}`);
}

function hasLifrConditions(rawMetar: string): boolean {
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

// ── TAF active-period parsing (for B2 fix) ──────────────────────────────────

/** Tracks which TAF period was last alerted per ICAO to avoid re-alerting */
const tafPeriodLastAlert: Record<string, { periodKey: string; alertType: string }> = {};

/**
 * Parse the TAF text and return the currently active time segment.
 * Returns the FM segment whose start time ≤ now, or the base section if
 * no FM has started yet.  Returns null when the TAF has no FM groups
 * (entire TAF is base conditions — handled by text-change detection).
 */
function getActiveTafPeriod(rawTaf: string): { key: string; text: string } | null {
  const now = new Date();
  const nowDay = now.getUTCDate();
  const nowHHMM = now.getUTCHours() * 60 + now.getUTCMinutes();

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
  console.log("[monitor] startMonitor() called — running=true");
  void (async () => {
    try {
      console.log("[monitor] IIFE: starting seedIfEmpty()");
      await seedIfEmpty();
      console.log(`[monitor] IIFE: seedIfEmpty() done — ${cachedIcaos.length} ICAOs`);
    } catch (err) {
      console.error("[monitor] ❌ IIFE: seedIfEmpty() FAILED:", err);
      // Don't return — try to continue with whatever cachedIcaos we have
    }
    try {
      console.log("[monitor] IIFE: starting loadMonitorCache()");
      await loadMonitorCache();
      console.log("[monitor] IIFE: loadMonitorCache() done");
    } catch (err) {
      console.error("[monitor] ❌ IIFE: loadMonitorCache() FAILED:", err);
    }
    try {
      console.log(`AERO-SENTINEL monitor started — watching ${cachedIcaos.length} airports`);
      await sentinelRadar();
    } catch (err) {
      console.error("[monitor] ❌ IIFE: first sentinelRadar() FAILED:", err);
    }
    intervalHandle = setInterval(sentinelRadar, 60_000);
    console.log("[monitor] ✅ setInterval armed — monitor is fully operational");
  })().catch((err) => {
    console.error("[monitor] ❌ IIFE: UNHANDLED top-level rejection:", err);
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

  // Cache is stale, bypassed, or this airport hasn't been scanned yet — fetch live
  try {
    const [tafData, metarData] = await Promise.all([
      fetchJson(`${BASE_URL}/taf?ids=${icao}&format=json`),
      fetchJson(`${BASE_URL}/metar?ids=${icao}&format=json`),
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

/** Clear the display cache for a specific ICAO (or all if no arg) */
export function clearDisplayCache(icao?: string) {
  if (icao) {
    delete displayCache[icao];
  } else {
    for (const key of Object.keys(displayCache)) delete displayCache[key];
  }
}
