import webPush from "web-push";
import { db, pushSubscriptionsTable, watchlistTable, teamWatchlistTable, teamMembersTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

// ── VAPID configuration ──────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@aerosentinel.app";

let vapidConfigured = false;

export function configureVapid(): boolean {
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("[push] VAPID keys not configured — push notifications disabled");
    return false;
  }
  (webPush as any).setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  logger.info("[push] ✅ VAPID keys configured");
  return true;
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

// ── Send an arbitrary push payload to a set of devices ───────────────────────
// Shared by @mention notifications (routes/teams.ts) — a smaller, generic
// sibling of sendPushForAlert's alert-specific fan-out. Same dedupe-by-latest-
// subscription-per-device and expired-subscription cleanup behavior.
export async function sendPushToDevices(
  deviceIds: string[],
  payload: { title: string; body: string; tag: string; data?: Record<string, unknown> },
): Promise<void> {
  if (!vapidConfigured || deviceIds.length === 0) return;

  try {
    const uniqueIds = [...new Set(deviceIds)];
    const subscriptions: Array<{ id: number; userId: string; endpoint: string; p256dh: string; auth: string }> =
      await (db as any)
        .select()
        .from(pushSubscriptionsTable)
        .where(
          sql`${pushSubscriptionsTable.userId} IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})`,
        );
    if (subscriptions.length === 0) return;

    const latestPerUser = new Map<string, (typeof subscriptions)[number]>();
    for (const sub of subscriptions) {
      const existing = latestPerUser.get(sub.userId);
      if (!existing || sub.id > existing.id) latestPerUser.set(sub.userId, sub);
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/alert-icon.png?v=7",
      tag: payload.tag,
      data: payload.data ?? {},
    });

    await Promise.allSettled(
      [...latestPerUser.values()].map(async (sub) => {
        try {
          await (webPush as any).sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err: any) {
          const statusCode = err?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await (db as any).delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
          } else {
            logger.error({ err }, `[push] Failed to send to ${sub.endpoint.slice(0, 60)}…`);
          }
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "[push] Error sending targeted push notifications:");
  }
}

// ── Send push notifications for a new alert ──────────────────────────────────
export async function sendPushForAlert(
  alertType: string,
  icao: string,
  rawText: string,
  alertId: number,
): Promise<void> {
  if (!vapidConfigured) return;

  try {
    // Find all users who have this ICAO in their personal watchlist
    const watchlistRows: Array<{ userId: string }> = await (db as any)
      .select({ userId: watchlistTable.userId })
      .from(watchlistTable)
      .where(eq(watchlistTable.icao, icao));

    // Also fan out to every device belonging to a team whose shared
    // watchlist includes this ICAO — team members' push subscriptions stay
    // keyed by their own real device id (not the team code), so this only
    // widens the set of deviceIds targeted below, it never touches how
    // subscriptions are stored/deduped.
    const teamWatchlistRows: Array<{ teamId: number }> = await (db as any)
      .select({ teamId: teamWatchlistTable.teamId })
      .from(teamWatchlistTable)
      .where(eq(teamWatchlistTable.icao, icao));

    const teamDeviceIds: string[] = [];
    if (teamWatchlistRows.length > 0) {
      const teamIds = [...new Set(teamWatchlistRows.map((r) => r.teamId))];
      const teamMemberRows: Array<{ deviceId: string }> = await (db as any)
        .select({ deviceId: teamMembersTable.deviceId })
        .from(teamMembersTable)
        .where(inArray(teamMembersTable.teamId, teamIds));
      teamDeviceIds.push(...teamMemberRows.map((r) => r.deviceId));
    }

    if (watchlistRows.length === 0 && teamDeviceIds.length === 0) return;

    const userIds: string[] = [
      ...new Set([...watchlistRows.map((r: { userId: string }) => r.userId), ...teamDeviceIds]),
    ];

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

    // ── One push per device ──────────────────────────────────────────────────
    // A single device (userId) should have exactly one live subscription, but
    // stale rows can accumulate when a browser rotates its endpoint without the
    // old row being deleted (see the prune in routes/push.ts). Fanning out to
    // every row makes that device receive the same notification twice. Collapse
    // to the newest subscription (highest id) per userId so each device is
    // notified once, regardless of leftover rows. (routes/push.ts prunes these
    // on the next subscribe; this guarantees single delivery in the meantime.)
    const latestPerUser = new Map<string, (typeof subscriptions)[number]>();
    for (const sub of subscriptions) {
      const existing = latestPerUser.get(sub.userId);
      if (!existing || sub.id > existing.id) latestPerUser.set(sub.userId, sub);
    }
    const dedupedSubscriptions = [...latestPerUser.values()];

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
      dedupedSubscriptions.map(async (sub) => {
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
            logger.info(`[push] Removing expired subscription: ${sub.endpoint.slice(0, 60)}…`);
            await (db as any)
              .delete(pushSubscriptionsTable)
              .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
          } else {
            logger.error({ err }, `[push] Failed to send to ${sub.endpoint.slice(0, 60)}…`);
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
      logger.info(`[push] Alert ${alertId} (${alertType} ${icao}): sent=${succeeded} failed=${failed}`);
    }
  } catch (err) {
    logger.error({ err }, "[push] Error sending push notifications:");
  }
}
