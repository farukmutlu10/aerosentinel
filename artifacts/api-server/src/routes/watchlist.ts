import { Router } from "express";
import { db, watchlistTable, alertsTable } from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { updateCachedIcaos, getAirports, clearDisplayCache, refreshIcaoCache, fetchWeatherForIcao } from "../lib/monitor.js";

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

async function fetchJsonFast(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers: INIT_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.trim().length === 0) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Detect alerts from live TAF/METAR (no DB writes, no monitor state) ─────
function hasLifrConditions(raw: string): boolean {
  if (raw.includes("CAVOK")) return false;
  const visMatch = raw.match(/\b(\d{3}\d{1,2}|VRB\d{2,3})(?:G\d{2,3})?(?:KT|MPS|KMH)\s+(\d{4})\b/);
  if (visMatch) { const vis = parseInt(visMatch[2], 10); if (vis < 1600 && vis > 0) return true; }
  const ceilMatches = [...raw.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)];
  for (const m of ceilMatches) { if (parseInt(m[2], 10) * 100 < 500) return true; }
  return false;
}

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
  const ids = icaos.join(",");
  if (!ids) return results;

  // Fetch TAF and METAR in parallel (single attempt, fast timeout)
  const [tafData, metarData] = await Promise.all([
    fetchJsonFast(`${INIT_BASE_URL}/taf?ids=${ids}&format=json`),
    fetchJsonFast(`${INIT_BASE_URL}/metar?ids=${ids}&format=json`),
  ]);

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

  // Process METAR
  for (const entry of metarData as Array<{ icaoId?: string; rawOb?: string; metarType?: string }>) {
    const icao = entry.icaoId;
    const rawMetar = entry.rawOb ?? "";
    const metarType = (entry.metarType ?? "").toUpperCase();
    if (!icao || !rawMetar) continue;

    const hasSpeci = rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ") || metarType === "SPECI";
    if (hasSpeci) {
      results.push({ id: -results.length - 1, type: "SPECI", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasLifrConditions(rawMetar)) {
      results.push({ id: -results.length - 1, type: "LIFR", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWxExtreme(rawMetar)) {
      results.push({ id: -results.length - 1, type: "WX_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
    } else if (hasWindExtreme(rawMetar)) {
      results.push({ id: -results.length - 1, type: "WIND_EXTREME", icao, rawText: rawMetar, previousRawText: null, detectedAt: now.toISOString(), acknowledged: false, acknowledgedAt: null });
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
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
  if (icaos.length > 0) {
    await db.insert(watchlistTable).values(icaos.map((icao) => ({ icao, userId }))).onConflictDoNothing();
  }
  // Refresh cache from ALL users' watchlists (not just this user's)
  await refreshIcaoCache();

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
    } catch (err) {
      console.error("[watchlist/sync] Failed to query initial alerts:", err);
    }

    // 2. Detect live alerts from current weather (fast, single attempt, no DB writes)
    try {
      const liveAlerts = await detectLiveAlerts(icaos);
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

  return res.json({ ok: true, icaos, initialAlerts });
});

router.delete("/watchlist/:icao", async (req, res) => {
  const userId = getDeviceId(req);
  const icao = req.params.icao?.toUpperCase();
  await db.delete(watchlistTable).where(and(eq(watchlistTable.icao, icao), eq(watchlistTable.userId, userId)));
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
