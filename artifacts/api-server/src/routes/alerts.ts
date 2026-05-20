import { Router } from "express";
import { db, alertsTable } from "@workspace/db";
import { eq, and, desc, sql, isNotNull, count } from "drizzle-orm";
import {
  ListAlertsQueryParams,
  AcknowledgeAlertParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/alerts", async (req, res) => {
  const parsed = ListAlertsQueryParams.safeParse(req.query);
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

router.get("/alerts/summary", async (_req, res) => {
  const [total] = await db.select({ count: count() }).from(alertsTable);
  const [unacked] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(eq(alertsTable.acknowledged, false));
  const [tafRevisions] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(sql`${alertsTable.type} IN ('TAF_AMD', 'TAF_COR')`);
  const [speciAlerts] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(eq(alertsTable.type, "SPECI"));
  const affectedRows = await db
    .selectDistinct({ icao: alertsTable.icao })
    .from(alertsTable);
  const [lastScanRow] = await db
    .select({ detectedAt: alertsTable.detectedAt })
    .from(alertsTable)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(1);

  return res.json({
    totalAlerts: Number(total.count),
    unacknowledged: Number(unacked.count),
    tafRevisions: Number(tafRevisions.count),
    speciAlerts: Number(speciAlerts.count),
    airportsAffected: affectedRows.length,
    lastScan: lastScanRow?.detectedAt ?? null,
  });
});

router.get("/alerts/recent", async (_req, res) => {
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.detectedAt))
    .limit(10);
  return res.json(alerts);
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
