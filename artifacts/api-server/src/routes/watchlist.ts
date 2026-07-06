import { Router } from "express";
import { db, watchlistTable, alertsTable } from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { updateCachedIcaos, getAirports, clearDisplayCache, refreshIcaoCache, fetchWeatherForIcao } from "../lib/monitor.js";
import { hasLifrConditions } from "../lib/conditions.js";

// Access the alerts cache declared in alerts.ts (global)
declare global {
  // eslint-disable-next-line no-var
  var __alertsCache: Map<string, { data: object | object[]; ts: number }> | undefined;
}

const router = Router();

function getDeviceId(req: Express.Request): string {
  return (req.headers["x-device-id"] as string) ?? "legacy";
}

router.get("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  const rows = await db
    .select({ icao: watchlistTable.icao })
    .from(watchlistTable)
    .where(eq(watchlistTable.userId, userId))
    .orderBy(watchlistTable.addedAt);
  return res.json(rows.map((r) => r.icao));
});

router.post("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  const icao = ((req.body?.icao as string) ?? "").trim().toUpperCase();
  if (!icao || icao.length < 2 || icao.length > 6) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
  await db.insert(watchlistTable).values({ icao, userId }).onConflictDoNothing();
  // Immediately add to monitor's in-memory list so next scan covers it
  const current = getAirports();
  if (!current.includes(icao)) {
    updateCachedIcaos([...current, icao]);
  }
  // Monitor will detect alerts on next scan cycle — no need to generate here
  return res.json({ ok: true, icao });
});

router.delete("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
  return res.json({ ok: true });
});

// ── Lightweight single-attempt fetch (no retries, no monitor side-effects) ──
const INIT_HEADERS = { "User-Agent": "Mozilla/5.0 AERO-SENTINEL/1.8" };
const INIT_BASE_URL = "https://aviationweather.gov/api/data";
const INIT_BATCH_SIZE = 50; // Match monitor's batch size
const INIT_TIMEOUT_MS = 15_000; // 15s per batch (was 8s for all)

async function fetchJsonFast(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers: INIT_HEADERS, signal: AbortSignal.timeout(INIT_TIMEOUT_MS) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.trim().length === 0) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Detect alerts from live TAF/METAR (no DB writes, no monitor state) ─────
// Uses the token-based hasLifrConditions from monitor.ts (B3 fix)

const EXTREME_WX_CODES = [
  "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
  "DS", "-DS", "+DS", "SS", "-SS", "+SS",
  "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
  "TSSN", "+TSSN", "TSGR", "TSPL",
  "-FZRA", "FZRA", "+FZRA", "FZDZ", "-FZDZ", "+FZDZ", "FZFG", "FZSN",
  "BLSN", "+BLSN", "-BLSN", "DRSN", "-RASN", "RASN", "+RASN",
  "SHGR", "SHGS", "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
];

function hasWxExtreme(raw: string): boolean {
  for (const code of EXTREME_WX_CODES) {
    const escaped = code.replace(/[+]/g, "\\+");
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(raw)) return true;
  }
  return false;
}

function hasWindExtreme(raw: string): boolean {
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

interface InitialAlert {
  id: number;
  type: string;
  icao: string;
  rawText: string;
  previousRawText: string | null;
  detectedAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

async function detectLiveAlerts(icaos: string[]): Promise<InitialAlert[]> {
  const results: InitialAlert[] = [];
  if (icaos.length === 0) return results;

  // Batch ICAOs into groups of INIT_BATCH_SIZE (matching monitor behavior)
  // to avoid URL-too-long issues and timeouts with large watchlists
  const batches: string[] = [];
  for (let i = 0; i < icaos.length; i += INIT_BATCH_SIZE) {
    batches.push(icaos.slice(i, i + INIT_BATCH_SIZE).join(","));
  }

  console.log(`[watchlist/sync:detectLiveAlerts] ${icaos.length} ICAOs in ${batches.length} batch(es) of ≤${INIT_BATCH_SIZE}`);

  // Fetch TAF and METAR in parallel for ALL batches, then merge
  const allTafData: unknown[] = [];
  const allMetarData: unknown[] = [];

  for (const batchIds of batches) {
    const [tafData, metarData] = await Promise.all([
      fetchJsonFast(`${INIT_BASE_URL}/taf?ids=${batchIds}&format=json`),
      fetchJsonFast(`${INIT_BASE_URL}/metar?ids=${batchIds}&format=json&hours=2`),
    ]);
    allTafData.push(...tafData);
    allMetarData.push(...metarData);
  }

  const tafData = allTafData;
  const metarData = allMetarData;

  console.log(`[watchlist/sync:detectLiveAlerts] API returned: ${tafData.length} TAF, ${metarData.length} METAR entries`);

  const now = new Date();

  // Process TAF
  for (const entry of tafData as Array<{ icaoId?: string; rawTAF?: string; tafType?: string }>) {
    const icao = entry.icaoId;
    const rawTaf = entry.rawTAF ?? "";
    const tafType = (entry.tafType ?? "").toUpperCase();
    if (!icao || !rawTaf) continue;

    const hasAmdCor = rawTaf.includes("COR") || rawTaf.includes("AMD") || tafType === "AMD" || tafType === "COR";
    if (hasAmdCor) {
      const alertType = rawTaf.includes("COR") ? "TAF_COR" : "TAF_AMD";
      results.push({ id: -results.length - 1, type: alertType, icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasLifrConditions(rawTaf)) {
      results.push({ id: -results.length - 1, type: "LIFR", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWxExtreme(rawTaf)) {
      results.push({ id: -results.length - 1, type: "WX_EXTREME", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWindExtreme(rawTaf)) {
      results.push({ id: -results.length - 1, type: "WIND_EXTREME", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    }
  }

  // Process METAR — deduplicate by ICAO (hours=2 returns multiple entries/station).
  // Group by ICAO, sort newest-first, process latest for conditions and always
  // surface SPECI entries regardless of position in the history.
  type MetarEntry = { icaoId?: string; rawOb?: string; metarType?: string; obsTime?: number };
  const metarByIcao = new Map<string, MetarEntry[]>();
  for (const entry of metarData as MetarEntry[]) {
    const icao = entry.icaoId;
    if (!icao) continue;
    let arr = metarByIcao.get(icao);
    if (!arr) { arr = []; metarByIcao.set(icao, arr); }
    arr.push(entry);
  }

  for (const [icao, entries] of metarByIcao) {
    entries.sort((a, b) => (b.obsTime ?? 0) - (a.obsTime ?? 0));
    const hasSpeciAlready = new Set<string>();

    // First pass: surface ALL SPECI entries (retroactive detection)
    for (const entry of entries) {
      const rawMetar = entry.rawOb ?? "";
      const metarType = (entry.metarType ?? "").toUpperCase();
      if (!rawMetar) continue;
      const isSpeci = rawMetar.startsWith("SPECI") || metarType === "SPECI";
      if (isSpeci && !hasSpeciAlready.has(rawMetar)) {
        hasSpeciAlready.add(rawMetar);
        results.push({ id: -results.length - 1, type: "SPECI", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
      }
    }

    // Second pass: check latest entry for non-SPECI conditions (only if no SPECI found)
    if (hasSpeciAlready.size === 0) {
      const latest = entries[0];
      const rawMetar = latest?.rawOb ?? "";
      if (rawMetar) {
        if (hasLifrConditions(rawMetar)) {
          results.push({ id: -results.length - 1, type: "LIFR", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
        } else if (hasWxExtreme(rawMetar)) {
          results.push({ id: -results.length - 1, type: "WX_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
        } else if (hasWindExtreme(rawMetar)) {
          results.push({ id: -results.length - 1, type: "WIND_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
        }
      }
    }
  }

  return results;
}

// Replace entire watchlist with the given list (browser sync on mount)
// Now includes inline initial alerts for instant display
router.put("/watchlist/sync", async (req, res) => {
  const userId = getDeviceId(req);
  const raw = req.body?.icaos;
  const icaos: string[] = Array.isArray(raw)
    ? raw.map((s: unknown) => String(s).trim().toUpperCase()).filter((s) => s.length >= 2 && s.length <= 6)
    : [];

  // Use a transaction to make DELETE + INSERT atomic — prevents GET /alerts
  // from seeing an empty watchlist between the two operations (race condition fix)
  if (typeof (db as any).transaction === "function") {
    await (db as any).transaction(async (tx: any) => {
      await tx.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
      if (icaos.length > 0) {
        await tx.insert(watchlistTable).values(icaos.map((icao) => ({ icao, userId }))).onConflictDoNothing();
      }
    });
  } else {
    // In-memory fallback: sequential operations (no real concurrency)
    await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
    if (icaos.length > 0) {
      await db.insert(watchlistTable).values(icaos.map((icao) => ({ icao, userId }))).onConflictDoNothing();
    }
  }

  // Refresh cache from ALL users' watchlists (not just this user's)
  await refreshIcaoCache();

  // Invalidate ALL alerts caches so GET /alerts picks up the new watchlist immediately.
  // Clearing the entire map is safer than per-key deletion because the cache key includes
  // serialized query params that may differ between requests.
  globalThis.__alertsCache?.clear();

  console.log(`[watchlist/sync] userId=${userId.slice(0, 8)}… synced ${icaos.length} ICAOs (cache cleared, tx committed)`);

  // ── Inline initial alerts: DB + live detection ──────────────────────
  let initialAlerts: InitialAlert[] = [];

  if (icaos.length > 0) {
    // 1. Query existing alerts from DB (last 6 hours for these ICAOs)
    const sixHoursAgo = new Date(Date.now() - 6 * 3600_000);
    try {
      const dbAlerts = await db
        .select({
          id: alertsTable.id,
          type: alertsTable.type,
          icao: alertsTable.icao,
          rawText: alertsTable.rawText,
          previousRawText: alertsTable.previousRawText,
          detectedAt: alertsTable.detectedAt,
          acknowledged: alertsTable.acknowledged,
          acknowledgedAt: alertsTable.acknowledgedAt,
        })
        .from(alertsTable)
        .where(and(
          inArray(alertsTable.icao, icaos),
          sql`${alertsTable.detectedAt} >= ${sixHoursAgo}`,
        ))
        .orderBy(desc(alertsTable.detectedAt))
        .limit(100);

      initialAlerts = dbAlerts.map((a) => ({
        ...a,
        detectedAt: a.detectedAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
      }));
      console.log(`[watchlist/sync] DB alerts: ${initialAlerts.length} found for ${icaos.length} ICAOs`);
    } catch (err) {
      console.error("[watchlist/sync] Failed to query initial alerts:", err);
    }

    // 2. Detect live alerts from current weather (batched, no DB writes)
    try {
      const liveAlerts = await detectLiveAlerts(icaos);
      console.log(`[watchlist/sync] Live alerts detected: ${liveAlerts.length}`);
      // Merge: live alerts that don't already exist in DB results
      // (match by ICAO + type to avoid duplicates)
      const existingKeys = new Set(initialAlerts.map((a) => `${a.icao}-${a.type}`));
      for (const la of liveAlerts) {
        if (!existingKeys.has(`${la.icao}-${la.type}`)) {
          initialAlerts.push(la);
        }
      }
    } catch (err) {
      console.error("[watchlist/sync] Failed to detect live alerts:", err);
    }
  }

  console.log(`[watchlist/sync] Response: ${initialAlerts.length} initialAlerts for ${icaos.length} ICAOs`);
  return res.json({ ok: true, icaos, initialAlerts });
});

router.delete("/watchlist/:icao", async (req, res) => {
  const userId = getDeviceId(req);
  const icao = req.params.icao?.toUpperCase();
  await db.delete(watchlistTable).where(and(eq(watchlistTable.icao, icao), eq(watchlistTable.userId, userId)));
  // Refresh the in-memory ICAO cache so the monitor stops scanning removed airports
  await refreshIcaoCache();
  return res.json({ ok: true, icao });
});

router.get("/watchlist/weather", async (req, res) => {
  const userId = getDeviceId(req);
  const force = req.query.force === "true" || req.query.force === "1";
  const icaosParam = ((req.query.icaos as string) ?? "").trim();
  const icaos = icaosParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && s.length <= 6);

  // If no icaos param, fetch from this user's watchlist
  let list: string[];
  if (icaos.length > 0) {
    list = icaos;
  } else {
    const rows = await db
      .select({ icao: watchlistTable.icao })
      .from(watchlistTable)
      .where(eq(watchlistTable.userId, userId));
    list = rows.length > 0 ? rows.map((r) => r.icao) : ["LTFH"];
  }

  if (force) {
    // Clear display cache for all requested ICAOs so fresh data is fetched
    for (const icao of list) clearDisplayCache(icao);
  }

  const results = await Promise.all(
    list.map(async (icao) => ({
      icao,
      ...(await fetchWeatherForIcao(icao, { force })),
    }))
  );
  return res.json(results);
});

export default router;
