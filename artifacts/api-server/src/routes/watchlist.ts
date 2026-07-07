import { Router } from "express";
import { db, watchlistTable, alertsTable } from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { updateCachedIcaos, getAirports, clearDisplayCache, refreshIcaoCache, fetchWeatherForIcaos } from "../lib/monitor.js";
import { hasLifrConditions, hasWxExtreme, hasWindExtreme } from "../lib/conditions.js";
import { getDeviceId } from "../lib/reqContext.js";
import { logger } from "../lib/logger.js";

// Access the alerts cache declared in alerts.ts (global)
declare global {
  // eslint-disable-next-line no-var
  var __alertsCache: Map<string, { data: object | object[]; ts: number }> | undefined;
}

const router = Router();

// 100 silently truncated real users' pasted lists (~210 airports observed in
// production) — the monitor batches 50 ICAOs/request so 300 is still only 6
// upstream calls per scan
const MAX_WATCHLIST_SIZE = 300;

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
  const existingCount = await db
    .select({ icao: watchlistTable.icao })
    .from(watchlistTable)
    .where(eq(watchlistTable.userId, userId));
  if (existingCount.length >= MAX_WATCHLIST_SIZE && !existingCount.some((r) => r.icao === icao)) {
    return res.status(400).json({ error: `Watchlist cannot exceed ${MAX_WATCHLIST_SIZE} airports` });
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
// Uses the shared hasLifrConditions/hasWxExtreme/hasWindExtreme from conditions.ts

/**
 * Deterministic negative id for a live-detected (not-yet-persisted) alert.
 * MUST be stable across calls for the same underlying condition — the
 * frontend's per-device ACK tracking (localStorage) keys off alert id, and a
 * naive "-index-1" counter resets to -1, -2, -3... on every /watchlist/sync
 * call, so an unrelated alert from a completely different watchlist could
 * collide with a previously-ACK'd id and render as already-acknowledged.
 */
function stableSyntheticId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0; // 32-bit int hash
  }
  return hash === 0 ? -1 : -Math.abs(hash);
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

  logger.info(`[watchlist/sync:detectLiveAlerts] ${icaos.length} ICAOs in ${batches.length} batch(es) of ≤${INIT_BATCH_SIZE}`);

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

  logger.info(`[watchlist/sync:detectLiveAlerts] API returned: ${tafData.length} TAF, ${metarData.length} METAR entries`);

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
      results.push({ id: stableSyntheticId(`${icao}-${alertType}-${rawTaf}`), type: alertType, icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasLifrConditions(rawTaf)) {
      results.push({ id: stableSyntheticId(`${icao}-LIFR-${rawTaf}`), type: "LIFR", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWxExtreme(rawTaf)) {
      results.push({ id: stableSyntheticId(`${icao}-WX_EXTREME-${rawTaf}`), type: "WX_EXTREME", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWindExtreme(rawTaf)) {
      results.push({ id: stableSyntheticId(`${icao}-WIND_EXTREME-${rawTaf}`), type: "WIND_EXTREME", icao, rawText: rawTaf, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
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
        results.push({ id: stableSyntheticId(`${icao}-SPECI-${rawMetar}`), type: "SPECI", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
      }
    }

    // Second pass: check latest entry for non-SPECI conditions (only if no SPECI found)
    if (hasSpeciAlready.size === 0) {
      const latest = entries[0];
      const rawMetar = latest?.rawOb ?? "";
      if (rawMetar) {
        if (hasLifrConditions(rawMetar)) {
          results.push({ id: stableSyntheticId(`${icao}-LIFR-${rawMetar}`), type: "LIFR", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
        } else if (hasWxExtreme(rawMetar)) {
          results.push({ id: stableSyntheticId(`${icao}-WX_EXTREME-${rawMetar}`), type: "WX_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
        } else if (hasWindExtreme(rawMetar)) {
          results.push({ id: stableSyntheticId(`${icao}-WIND_EXTREME-${rawMetar}`), type: "WIND_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
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
    ? [...new Set(raw.map((s: unknown) => String(s).trim().toUpperCase()).filter((s) => s.length >= 2 && s.length <= 6))].slice(0, MAX_WATCHLIST_SIZE)
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

  logger.info(`[watchlist/sync] userId=${userId.slice(0, 8)}… synced ${icaos.length} ICAOs (cache cleared, tx committed)`);

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
      logger.info(`[watchlist/sync] DB alerts: ${initialAlerts.length} found for ${icaos.length} ICAOs`);
    } catch (err) {
      logger.error({ err }, "[watchlist/sync] Failed to query initial alerts:");
    }

    // 2. Detect live alerts from current weather (batched, no DB writes)
    try {
      const liveAlerts = await detectLiveAlerts(icaos);
      logger.info(`[watchlist/sync] Live alerts detected: ${liveAlerts.length}`);
      // Merge: live alerts that don't already exist in DB results
      // (match by ICAO + type to avoid duplicates)
      const existingKeys = new Set(initialAlerts.map((a) => `${a.icao}-${a.type}`));
      for (const la of liveAlerts) {
        if (!existingKeys.has(`${la.icao}-${la.type}`)) {
          initialAlerts.push(la);
        }
      }
    } catch (err) {
      logger.error({ err }, "[watchlist/sync] Failed to detect live alerts:");
    }
  }

  logger.info(`[watchlist/sync] Response: ${initialAlerts.length} initialAlerts for ${icaos.length} ICAOs`);
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

  const weatherByIcao = await fetchWeatherForIcaos(list, { force });
  const results = list.map((icao) => ({ icao, ...weatherByIcao[icao] }));
  return res.json(results);
});

export default router;
