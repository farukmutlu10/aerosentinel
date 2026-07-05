import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getVapidPublicKey } from "../lib/push.js";

const router = Router();

function getDeviceId(req: Express.Request): string {
  return (req.headers["x-device-id"] as string) ?? "legacy";
}

// ── GET /push/vapid-key — returns the VAPID public key for the frontend ──────
router.get("/push/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: "Push notifications not configured" });
  return res.json({ publicKey: key });
});

// ── POST /push/subscribe — save a push subscription ──────────────────────────
router.post("/push/subscribe", async (req, res) => {
  const userId = getDeviceId(req);
  const { endpoint, keys } = req.body ?? {};

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Missing endpoint or keys" });
  }

  try {
    await (db as any)
      .insert(pushSubscriptionsTable)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { p256dh: keys.p256dh, auth: keys.auth, userId },
      });

    console.log(`[push] Subscription saved: userId=${userId.slice(0, 8)}… endpoint=${endpoint.slice(0, 60)}…`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[push] Failed to save subscription:", err);
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

// ── DELETE /push/unsubscribe — remove a push subscription ────────────────────
router.delete("/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body ?? {};

  if (!endpoint) {
    return res.status(400).json({ error: "Missing endpoint" });
  }

  try {
    await (db as any)
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));

    console.log(`[push] Subscription removed: endpoint=${endpoint.slice(0, 60)}…`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[push] Failed to remove subscription:", err);
    return res.status(500).json({ error: "Failed to remove subscription" });
  }
});

export default router;
