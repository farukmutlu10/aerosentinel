import { Router } from "express";
import { db, watchlistTable, alertsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { fetchWeatherForIcao, updateCachedIcaos, getAirports, clearDisplayCache, refreshIcaoCache } from "../lib/monitor.js";

const router = Router();

// ── Initial alert retry configuration ────────────────────────────────────────
const INITIAL_ALERT_MAX_RETRIES = 3; // 1st attempt + 2 retries = 3 total
const INITIAL_ALERT_BASE_BACKOFF_MS = 3000; // 3s → 6s → 12s

function alertSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// ── Initial alert check for newly added airports ─────────────────────────────
// When a user adds a new airport, check if the current TAF/METAR already
// contains alert-worthy conditions (AMD, COR, SPECI, extreme weather, etc.)
// and generate alerts so the user sees historical context immediately.
// Includes retry logic for when the API returns empty/null responses.
async function generateInitialAlerts(icao: string) {
  let rawTaf: string | null = null;
  let rawMetar: string | null = null;
  let tafType: string | null = null;
  let metarType: string | null = null;

  // ── Retry loop: re-fetch when API returns null TAF+METAR ─────────────────
  for (let attempt = 1; attempt <= INITIAL_ALERT_MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWeatherForIcao(icao, { force: true });
      rawTaf = result.rawTaf;
      rawMetar = result.rawMetar;
      tafType = result.tafType;
      metarType = result.metarType;

      // If at least one of TAF/METAR has data, proceed with alert generation
      if (rawTaf || rawMetar) {
        if (attempt > 1) {
          console.log(`[watchlist] ✅ generateInitialAlerts: ${icao} fetched on attempt ${attempt}/${INITIAL_ALERT_MAX_RETRIES}`);
        }
        break;
      }

      // Both null — retry with backoff
      if (attempt < INITIAL_ALERT_MAX_RETRIES) {
        const backoff = INITIAL_ALERT_BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`[watchlist] ⚠️ generateInitialAlerts: ${icao} returned null TAF+METAR (attempt ${attempt}/${INITIAL_ALERT_MAX_RETRIES}), retrying in ${backoff}ms...`);
        await alertSleep(backoff);
      } else {
        console.log(`[watchlist] ❌ generateInitialAlerts: ${icao} returned null TAF+METAR after ${INITIAL_ALERT_MAX_RETRIES} attempts — no alerts generated`);
      }
    } catch (err) {
      console.error(`[watchlist] generateInitialAlerts: ${icao} fetch error (attempt ${attempt}/${INITIAL_ALERT_MAX_RETRIES}):`, err);
      if (attempt < INITIAL_ALERT_MAX_RETRIES) {
        const backoff = INITIAL_ALERT_BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await alertSleep(backoff);
      }
    }
  }

  // ── Helper: check if a recent (24h) duplicate alert already exists ────────
  async function hasRecentDuplicate(alertType: string, icaoCode: string, text: string): Promise<boolean> {
    const existing = await db.select({ id: alertsTable.id }).from(alertsTable)
      .where(and(
        eq(alertsTable.icao, icaoCode),
        eq(alertsTable.type, alertType as any),
        eq(alertsTable.rawText, text),
        sql`${alertsTable.detectedAt} > NOW() - INTERVAL '24 hours'`,
      )).limit(1);
    return existing.length > 0;
  }

  // ── Helper: insert alert only if not a duplicate ──────────────────────────
  async function insertIfNew(alertType: string, icaoCode: string, text: string, source: string) {
    if (await hasRecentDuplicate(alertType, icaoCode, text)) {
      console.log(`[watchlist] ⏭️ Skipping duplicate ${alertType} for ${icaoCode} (recent alert exists) — ${source}`);
      return;
    }
    await db.insert(alertsTable).values({ type: alertType as any, icao: icaoCode, rawText: text, previousRawText: null });
    console.log(`[watchlist] ✅ Initial ${alertType} alert for ${icaoCode} — ${source}`);
  }

  // ── TAF analysis ─────────────────────────────────────────────────────────
  if (rawTaf) {
    // Check both raw text AND API tafType field for AMD/COR detection
    const hasAmdCor = rawTaf.includes("COR") || rawTaf.includes("AMD") || (tafType ?? "").toUpperCase() === "AMD" || (tafType ?? "").toUpperCase() === "COR";
    if (hasAmdCor) {
      const alertType = rawTaf.includes("COR") ? "TAF_COR" : "TAF_AMD";
      await insertIfNew(alertType, icao, rawTaf, "TAF AMD/COR");
    }

    // When AMD/COR is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
    if (!hasAmdCor) {
    // ── Priority-based WX_CRIT suppression: LIFR > WX_EXTREME > WIND_EXTREME ──

    // 1. TAF-based LIFR detection (highest priority)
    let hasTafLifr = false;
    if (!rawTaf.includes("CAVOK")) {
      const visMatch = rawTaf.match(/\b(\d{3}\d{1,2}|VRB\d{2,3})(?:G\d{2,3})?(?:KT|MPS|KMH)\s+(\d{4})\b/);
      if (visMatch && parseInt(visMatch[2], 10) < 1600 && parseInt(visMatch[2], 10) > 0) hasTafLifr = true;
      if (!hasTafLifr) {
        for (const m of rawTaf.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)) {
          if (parseInt(m[2], 10) * 100 < 500) { hasTafLifr = true; break; }
        }
      }
    }
    if (hasTafLifr) {
      await insertIfNew("LIFR", icao, rawTaf, "TAF LIFR");
    } else {
    // 2. TAF-based extreme weather detection (second priority)
    const TAF_EXTREME_WX_CODES = [
      "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
      "DS", "-DS", "+DS", "SS", "-SS", "+SS",
      "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
      "TSSN", "+TSSN", "TSGR", "TSPL",
      "-FZRA", "FZRA", "+FZRA", "FZDZ", "-FZDZ", "+FZDZ", "FZFG", "FZSN",
      "BLSN", "+BLSN", "-BLSN", "DRSN",
      "-RASN", "RASN", "+RASN", "SHGR", "SHGS",
      "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
    ];
    let hasTafWxExtreme = false;
    for (const code of TAF_EXTREME_WX_CODES) {
      const escaped = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(rawTaf)) { hasTafWxExtreme = true; break; }
    }
    if (hasTafWxExtreme) {
      await insertIfNew("WX_EXTREME", icao, rawTaf, "TAF WX_EXTREME");
    } else {
    // 3. TAF-based extreme wind detection (lowest priority)
    let hasTafWindExtreme = false;
    for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
      const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
      if (spd >= 25 || gst >= 29) { hasTafWindExtreme = true; break; }
    }
    if (!hasTafWindExtreme) {
      for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
        const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
        if (spd >= 13 || gst >= 15) { hasTafWindExtreme = true; break; }
      }
    }
    if (!hasTafWindExtreme) {
      for (const m of rawTaf.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
        const spd = Math.round(parseInt(m[1]) * 0.5399568); const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
        if (spd >= 25 || gst >= 29) { hasTafWindExtreme = true; break; }
      }
    }
    if (hasTafWindExtreme) {
      await insertIfNew("WIND_EXTREME", icao, rawTaf, "TAF WIND_EXTREME");
    }
    } // end WX_EXTREME else
    } // end LIFR else
    } // end !hasAmdCor
  }

  // ── METAR analysis ───────────────────────────────────────────────────────
  if (rawMetar) {
    // Check both raw text AND API metarType field for SPECI detection
    const hasSpeci = rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ") || (metarType ?? "").toUpperCase() === "SPECI";
    if (hasSpeci) {
      await insertIfNew("SPECI", icao, rawMetar, "METAR SPECI");
    }

    // When SPECI is present, suppress WX_EXTREME, WIND_EXTREME, LIFR
    if (!hasSpeci) {
    // ── Priority-based WX_CRIT suppression: LIFR > WX_EXTREME > WIND_EXTREME ──

    // 1. LIFR detection (highest priority)
    let hasLifr = false;
    if (!rawMetar.includes("CAVOK")) {
      const visMatch = rawMetar.match(/\b(\d{3}\d{1,2}|VRB\d{2,3})(?:G\d{2,3})?(?:KT|MPS|KMH)\s+(\d{4})\b/);
      if (visMatch && parseInt(visMatch[2], 10) < 1600 && parseInt(visMatch[2], 10) > 0) hasLifr = true;
      if (!hasLifr) {
        for (const m of rawMetar.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)) {
          if (parseInt(m[2], 10) * 100 < 500) { hasLifr = true; break; }
        }
      }
    }
    if (hasLifr) {
      await insertIfNew("LIFR", icao, rawMetar, "METAR LIFR");
    } else {
    // 2. Extreme weather codes (second priority)
    const EXTREME_WX_CODES = [
      "+TS", "+TSRA", "+SH", "+SHRA", "+RA", "+DZ",
      "DS", "-DS", "+DS", "SS", "-SS", "+SS",
      "-SN", "SN", "+SN", "-SHSN", "SHSN", "+SHSN",
      "TSSN", "+TSSN", "TSGR", "TSPL",
      "-FZRA", "FZRA", "+FZRA", "FZDZ", "-FZDZ", "+FZDZ", "FZFG", "FZSN",
      "BLSN", "+BLSN", "-BLSN", "DRSN",
      "-RASN", "RASN", "+RASN", "SHGR", "SHGS",
      "IC", "PL", "GR", "GS", "VA", "FC", "SQ", "SG",
    ];
    let hasWxExtreme = false;
    for (const code of EXTREME_WX_CODES) {
      const escaped = code.replace(/[+]/g, "\\+");
      if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(rawMetar)) { hasWxExtreme = true; break; }
    }
    if (hasWxExtreme) {
      await insertIfNew("WX_EXTREME", icao, rawMetar, "METAR WX_EXTREME");
    } else {
    // 3. Extreme wind check (lowest priority)
    let hasWindExtreme = false;
    for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g)) {
      const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
      if (spd >= 25 || gst >= 29) { hasWindExtreme = true; break; }
    }
    if (!hasWindExtreme) {
      for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?MPS\b/g)) {
        const spd = parseInt(m[1]); const gst = m[2] ? parseInt(m[2]) : 0;
        if (spd >= 13 || gst >= 15) { hasWindExtreme = true; break; }
      }
    }
    if (!hasWindExtreme) {
      for (const m of rawMetar.matchAll(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KMH\b/g)) {
        const spd = Math.round(parseInt(m[1]) * 0.5399568); const gst = m[2] ? Math.round(parseInt(m[2]) * 0.5399568) : 0;
        if (spd >= 25 || gst >= 29) { hasWindExtreme = true; break; }
      }
    }
    if (hasWindExtreme) {
      await insertIfNew("WIND_EXTREME", icao, rawMetar, "METAR WIND_EXTREME");
    }
    } // end WX_EXTREME else
    } // end LIFR else
    } // end !hasSpeci
  }
}

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
  // Fire-and-forget: check if current weather already has alert conditions
  void generateInitialAlerts(icao).catch(err => {
    console.error(`[watchlist] ❌ generateInitialAlerts FAILED for ${icao}:`, err);
  });
  return res.json({ ok: true, icao });
});

// ── Force re-check all watchlist airports for alert conditions ──
router.post("/watchlist/force-check", async (req, res) => {
  const userId = getDeviceId(req);
  const rows = await db
    .select({ icao: watchlistTable.icao })
    .from(watchlistTable)
    .where(eq(watchlistTable.userId, userId));
  
  if (rows.length === 0) {
    return res.json({ ok: true, message: "No airports in watchlist", checked: 0 });
  }

  console.log(`[watchlist] 🔧 Force-check: re-running initial alerts for ${rows.length} airports (${rows.map(r => r.icao).join(", ")})`);
  
  let checked = 0;
  let alertsCreated = 0;
  for (const row of rows) {
    try {
      const prevCount = (await db.select({ id: alertsTable.id }).from(alertsTable).where(eq(alertsTable.icao, row.icao))).length;
      await generateInitialAlerts(row.icao);
      const afterCount = (await db.select({ id: alertsTable.id }).from(alertsTable).where(eq(alertsTable.icao, row.icao))).length;
      if (afterCount > prevCount) alertsCreated += afterCount - prevCount;
      checked++;
    } catch (err) {
      console.error(`[watchlist] ❌ Force-check failed for ${row.icao}:`, err);
    }
  }
  
  console.log(`[watchlist] ✅ Force-check done: ${checked} airports checked, ${alertsCreated} new alerts created`);
  return res.json({ ok: true, checked, alertsCreated });
});

router.delete("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
  return res.json({ ok: true });
});

// Replace entire watchlist with the given list (browser sync on mount)
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
  // Run sequentially with delay to reduce API rate limiting
  // (each generateInitialAlerts() hits TAF+METAR APIs)
  void (async () => {
    for (let i = 0; i < icaos.length; i++) {
      try {
        await generateInitialAlerts(icaos[i]);
      } catch (err) {
        console.error(`[watchlist] ❌ generateInitialAlerts FAILED for ${icaos[i]}:`, err);
      }
      // 1.5s delay between ICAOs to avoid rate limiting (except after last)
      if (i < icaos.length - 1) {
        await alertSleep(1500);
      }
    }
  })().catch(err => {
    console.error("[watchlist] ❌ Sequential initial alerts batch FAILED:", err);
  });
  return res.json({ ok: true, icaos });
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
