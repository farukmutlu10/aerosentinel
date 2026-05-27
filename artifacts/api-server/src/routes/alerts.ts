import { Router } from "express";
import { db, alertsTable, watchlistTable } from "@workspace/db";
import { eq, and, desc, sql, count, gte, inArray } from "drizzle-orm";
import {
  ListAlertsQueryParams,
  AcknowledgeAlertParams,
} from "@workspace/api-zod";

const router = Router();

// ── In-memory caches ─────────────────────────────────────────────────────────
let summaryCache: { data: object; ts: number } | null = null;
const SUMMARY_CACHE_TTL = 60_000;

let recentCache: { data: object[]; ts: number } | null = null;
const RECENT_CACHE_TTL = 60_000;

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

router.get("/alerts", async (req, res) => {
  const raw = req.query;
  const coerced = {
    ...raw,
    acknowledged:
      raw.acknowledged === "true" ? true :
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
  if (type) conditions.push(eq(alertsTable.type, type));
  if (icao) conditions.push(eq(alertsTable.icao, icao));
  if (acknowledged !== undefined) conditions.push(eq(alertsTable.acknowledged, acknowledged));

  const alerts = await db
    .select()
    .from(alertsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(limit);

  return res.json(alerts);
});

router.get("/alerts/summary", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const now = Date.now();

  // Serve from cache unless forced refresh or cache expired
  if (!forceRefresh && summaryCache && now - summaryCache.ts < SUMMARY_CACHE_TTL) {
    return res.json(summaryCache.data);
  }

  const today = startOfTodayUtc();

  // Query 1: watchlist (tiny table)
  const watchlistRows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  const watchlistIcaos = watchlistRows.map((r) => r.icao);

  if (watchlistIcaos.length === 0) {
    const empty = { totalAlerts: 0, unacknowledged: 0, tafRevisions: 0, speciAlerts: 0, airportsAffected: 0, lastScan: null };
    summaryCache = { data: empty, ts: now };
    return res.json(empty);
  }

  const baseConditions = [
    gte(alertsTable.detectedAt, today),
    inArray(alertsTable.icao, watchlistIcaos),
  ];

  // Query 2: single aggregation replacing 5 separate COUNT queries
  const [agg] = await db.select({
    total:            sql<number>`COUNT(*)::int`,
    unacknowledged:   sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.acknowledged} = false)::int`,
    tafRevisions:     sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.type} IN ('TAF_AMD', 'TAF_COR'))::int`,
    speciAlerts:      sql<number>`COUNT(*) FILTER (WHERE ${alertsTable.type} = 'SPECI')::int`,
    airportsAffected: sql<number>`COUNT(DISTINCT ${alertsTable.icao})::int`,
  }).from(alertsTable).where(and(...baseConditions));

  // Query 3: last scan time from all alerts
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

  summaryCache = { data: result, ts: now };
  return res.json(result);
});

router.get("/alerts/recent", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));
  const now   = Date.now();

  // Page 1 with default limit=10 is served from cache (covers notification hook usage)
  const canUseCache = !forceRefresh && page === 1 && limit === 10;
  if (canUseCache && recentCache && now - recentCache.ts < RECENT_CACHE_TTL) {
    return res.json(recentCache.data);
  }

  const offset = (page - 1) * limit;
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(limit)
    .offset(offset);

  if (canUseCache) {
    recentCache = { data: alerts, ts: now };
  }

  return res.json(alerts);
});

router.patch("/alerts/acknowledge-all", async (_req, res) => {
  await db
    .update(alertsTable)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(eq(alertsTable.acknowledged, false));
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
  return res.json(updated);
});

export default router;
