import { Router } from "express";
import { db, alertsTable, watchlistTable } from "@workspace/db";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import {
  ListAlertsQueryParams,
  AcknowledgeAlertParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

// ── Global Map cache (survives module re-evaluation in hot-reload) ────────────
type CacheEntry = { data: object | object[]; ts: number };

declare global {
  // eslint-disable-next-line no-var
  var __alertsCache: Map<string, CacheEntry> | undefined;
}

globalThis.__alertsCache ??= new Map<string, CacheEntry>();
const cache = globalThis.__alertsCache;

const SUMMARY_CACHE_TTL = 60_000;
const RECENT_CACHE_TTL  = 60_000;

function cacheAge(ts: number): string {
  return `${Math.round((Date.now() - ts) / 1000)}s`;
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

router.get("/alerts", async (req, res) => {
  const raw = req.query;
  const coerced = {
    ...raw,
    acknowledged:
      raw.acknowledged === "true"  ? true  :
      raw.acknowledged === "false" ? false :
      undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  };
  const parsed = ListAlertsQueryParams.safeParse(coerced);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }

  const { type, icao, acknowledged, limit = 50 } = parsed.data;
  const conditions = [];
  if (type)                       conditions.push(eq(alertsTable.type, type));
  if (icao)                       conditions.push(eq(alertsTable.icao, icao));
  if (acknowledged !== undefined) conditions.push(eq(alertsTable.acknowledged, acknowledged));

  const alerts = await db
    .select()
    .from(alertsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(limit);

  return res.json(alerts);
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/alerts/summary", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const now          = Date.now();
  const entry        = cache.get("summary");

  if (!forceRefresh && entry && now - entry.ts < SUMMARY_CACHE_TTL) {
    logger.info(
      { endpoint: "/alerts/summary", cache: "HIT", age: cacheAge(entry.ts) },
      "[cache] HIT",
    );
    return res.json(entry.data);
  }

  logger.info(
    {
      endpoint: "/alerts/summary",
      cache: "MISS",
      reason: forceRefresh ? "force-refresh" : !entry ? "empty" : "expired",
    },
    "[cache] MISS → DB",
  );

  const today = startOfTodayUtc();

  const watchlistRows  = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  const watchlistIcaos = watchlistRows.map((r) => r.icao);

  if (watchlistIcaos.length === 0) {
    const empty = { totalAlerts: 0, unacknowledged: 0, tafRevisions: 0, speciAlerts: 0, airportsAffected: 0, lastScan: null };
    cache.set("summary", { data: empty, ts: now });
    return res.json(empty);
  }

  const baseConditions = [
    gte(alertsTable.detectedAt, today),
    inArray(alertsTable.icao, watchlistIcaos),
  ];

  const [agg] = await db.select({
    total:            sql<number>`COUNT(*)::int`,
    unacknowledged:   sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.acknowledged} = false)::int`,
    tafRevisions:     sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.type} IN ('TAF_AMD', 'TAF_COR'))::int`,
    speciAlerts:      sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.type} = 'SPECI')::int`,
    airportsAffected: sql<number>`COUNT(DISTINCT ${alertsTable.icao})::int`,
  }).from(alertsTable).where(and(...baseConditions));

  const [lastScanRow] = await db.select({ detectedAt: alertsTable.detectedAt })
    .from(alertsTable).orderBy(desc(alertsTable.detectedAt)).limit(1);

  const result = {
    totalAlerts:      agg?.total ?? 0,
    unacknowledged:   agg?.unacknowledged ?? 0,
    tafRevisions:     agg?.tafRevisions ?? 0,
    speciAlerts:      agg?.speciAlerts ?? 0,
    airportsAffected: agg?.airportsAffected ?? 0,
    lastScan:         lastScanRow?.detectedAt ?? null,
  };

  cache.set("summary", { data: result, ts: now });
  return res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/alerts/recent", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));
  const now   = Date.now();

  // Cache applies only for the default page=1&limit=10 request (notification hook)
  const canUseCache = !forceRefresh && page === 1 && limit === 10;
  const cacheKey    = "recent_p1_l10";
  const entry       = canUseCache ? cache.get(cacheKey) : undefined;

  if (entry && now - entry.ts < RECENT_CACHE_TTL) {
    logger.info(
      { endpoint: "/alerts/recent", cache: "HIT", age: cacheAge(entry.ts) },
      "[cache] HIT",
    );
    return res.json(entry.data);
  }

  logger.info(
    {
      endpoint: "/alerts/recent",
      cache: canUseCache ? "MISS" : "SKIP",
      reason: !canUseCache
        ? `non-default params (page=${page} limit=${limit})`
        : forceRefresh ? "force-refresh"
        : !entry    ? "empty"
        : "expired",
      page,
      limit,
    },
    canUseCache ? "[cache] MISS → DB" : "[cache] SKIP → DB",
  );

  const offset = (page - 1) * limit;
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(limit)
    .offset(offset);

  if (canUseCache) {
    cache.set(cacheKey, { data: alerts, ts: now });
  }

  return res.json(alerts);
});

// ─────────────────────────────────────────────────────────────────────────────

function invalidateAckCaches() {
  cache.delete("summary");
  for (const key of [...cache.keys()]) {
    if (key.startsWith("recent:")) cache.delete(key);
  }
}

router.patch("/alerts/acknowledge-all", async (_req, res) => {
  await db
    .update(alertsTable)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(eq(alertsTable.acknowledged, false));
  invalidateAckCaches();
  return res.json({ ok: true });
});

router.patch("/alerts/:id/acknowledge", async (req, res) => {
  const parsed = AcknowledgeAlertParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const [updated] = await db
    .update(alertsTable)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(eq(alertsTable.id, parsed.data.id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Alert not found" });
  invalidateAckCaches();
  return res.json(updated);
});

export default router;
