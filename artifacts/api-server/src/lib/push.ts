import webPush from "web-push";
import { db, pushSubscriptionsTable, watchlistTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

// ── VAPID configuration ──────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@aerosentinel.app";

let vapidConfigured = false;

export function configureVapid() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] ⚠️ VAPID keys not configured — push notifications disabled");
    return;
  }
  (webPush as any).setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  console.log("[push] ✅ VAPID keys configured");
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// ── Alert type labels (shared with frontend) ─────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  TAF_AMD: "TAF Revision (AMD)",
  TAF_COR: "TAF Revision (COR)",
  SPECI: "SPECI Alert",
  WX_EXTREME: "Extreme Weather",
  WIND_EXTREME: "Extreme Wind",
  LIFR: "Low IFR (LIFR)",
};

// ── Send push notifications for a new alert ──────────────────────────────────
export async function sendPushForAlert(
  alertType: string,
  icao: string,
  rawText: string,
  alertId: number,
): Promise<void> {
  if (!vapidConfigured) return;

  try {
    // Find all users who have this ICAO in their watchlist
    const watchlistRows: Array<{ userId: string }> = await (db as any)
      .select({ userId: watchlistTable.userId })
      .from(watchlistTable)
      .where(eq(watchlistTable.icao, icao));

    if (watchlistRows.length === 0) return;

    const userIds: string[] = [...new Set(watchlistRows.map((r: { userId: string }) => r.userId))];

    // Get push subscriptions for those users — use SQL to avoid type inference issues
    const subscriptions: Array<{
      id: number;
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }> = await (db as any)
      .select()
      .from(pushSubscriptionsTable)
      .where(
        sql`${pushSubscriptionsTable.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`
      );

    if (subscriptions.length === 0) return;

    const label = TYPE_LABELS[alertType] ?? alertType;
    const payload = JSON.stringify({
      title: `AERO-SENTINEL — ${label}`,
      body: `${icao}: ${rawText.slice(0, 120)}`,
      icon: "/alert-icon.png?v=7",
      tag: `aero-alert-${icao}-${alertId}`,
      data: { url: "/alerts", alertId, alertType, icao },
    });

    // Send to all subscriptions in parallel
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await (webPush as any).sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          return { success: true, endpoint: sub.endpoint };
        } catch (err: any) {
          const statusCode = err?.statusCode;
          // 410 Gone or 404 — subscription expired/invalid, remove it
          if (statusCode === 410 || statusCode === 404) {
            console.log(`[push] Removing expired subscription: ${sub.endpoint.slice(0, 60)}…`);
            await (db as any)
              .delete(pushSubscriptionsTable)
              .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
          } else {
            console.error(`[push] Failed to send to ${sub.endpoint.slice(0, 60)}…:`, err.message);
          }
          return { success: false, endpoint: sub.endpoint };
        }
      }),
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any).success,
    ).length;
    const failed = results.length - succeeded;

    if (succeeded > 0 || failed > 0) {
      console.log(`[push] Alert ${alertId} (${alertType} ${icao}): sent=${succeeded} failed=${failed}`);
    }
  } catch (err) {
    console.error("[push] Error sending push notifications:", err);
  }
}
