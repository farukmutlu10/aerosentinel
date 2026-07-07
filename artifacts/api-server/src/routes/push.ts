import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { getVapidPublicKey } from "../lib/push.js";
import { getDeviceId } from "../lib/reqContext.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Only accept subscriptions targeting known push services (SSRF guard) ────
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return ALLOWED_PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
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

  if (!isAllowedPushEndpoint(endpoint)) {
    return res.status(400).json({ error: "Unrecognized push service endpoint" });
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

    // ── Prune stale endpoints for this device ────────────────────────────────
    // In this app's identity model a deviceId maps to exactly one browser, which
    // holds exactly one active push subscription per origin. A browser can hand
    // us a NEW endpoint (subscription rotation after a service-worker update, or
    // a re-enable) without the old row ever being deleted — leaving two live
    // rows for one device. Since sendPushForAlert() fans out to EVERY row, that
    // device then receives the exact same notification twice. Any endpoint for
    // this userId other than the one just registered is therefore stale → drop
    // it so each real device gets exactly one push.
    await (db as any)
      .delete(pushSubscriptionsTable)
      .where(and(
        eq(pushSubscriptionsTable.userId, userId),
        ne(pushSubscriptionsTable.endpoint, endpoint),
      ));

    logger.info(`[push] Subscription saved: userId=${userId.slice(0, 8)}… endpoint=${endpoint.slice(0, 60)}… (stale endpoints for device pruned)`);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[push] Failed to save subscription:");
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

    logger.info(`[push] Subscription removed: endpoint=${endpoint.slice(0, 60)}…`);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[push] Failed to remove subscription:");
    return res.status(500).json({ error: "Failed to remove subscription" });
  }
});

export default router;
