import { db, alertAcksTable, teamMembersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import type { ResolvedTeam } from "./teamContext.js";

export interface AckEntry { deviceId: string; nickname: string | null; ackedAt: string }

/**
 * Device IDs whose acks are relevant to display to this requester: their
 * team's members when in a team, otherwise just themselves. Acknowledgement
 * is always stored per-device — this is only about who gets SHOWN as having
 * acked, never about who the ack is written for.
 */
async function ackScopeDeviceIds(team: ResolvedTeam | null, deviceId: string): Promise<string[]> {
  if (!team) return [deviceId];
  const rows = await db
    .select({ deviceId: teamMembersTable.deviceId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.teamId));
  const ids = rows.map((r) => r.deviceId);
  return ids.includes(deviceId) ? ids : [...ids, deviceId];
}

/** Nickname to attribute an ack to, when the acking device is a team member. */
export async function resolveAckNickname(team: ResolvedTeam | null, deviceId: string): Promise<string | null> {
  if (!team) return null;
  const rows = await db
    .select({ nickname: teamMembersTable.nickname })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, deviceId)));
  return rows[0]?.nickname ?? null;
}

/**
 * Annotates alert rows with per-device acknowledgement info: `acknowledged`
 * / `acknowledgedAt` reflect the REQUESTER's own ack only — one device
 * hitting ACK never flips this for anyone else. `ackedBy` lists everyone
 * relevant (team members when in a team, otherwise just the requester) who
 * has acked, for a multi-person "ACKED BY X, Y, Z" display.
 */
export async function annotateAcks<T extends { id: number }>(
  alerts: T[],
  deviceId: string,
  team: ResolvedTeam | null,
): Promise<Array<T & { acknowledged: boolean; acknowledgedAt: string | null; ackedBy: AckEntry[] }>> {
  if (alerts.length === 0) return [];
  const alertIds = alerts.map((a) => a.id).filter((id) => id > 0); // synthetic/live-detected alerts (negative ids) are never persisted
  const scopeDeviceIds = await ackScopeDeviceIds(team, deviceId);

  const ackRows = alertIds.length > 0
    ? await db
        .select({ alertId: alertAcksTable.alertId, deviceId: alertAcksTable.deviceId, nickname: alertAcksTable.nickname, ackedAt: alertAcksTable.ackedAt })
        .from(alertAcksTable)
        .where(and(inArray(alertAcksTable.alertId, alertIds), inArray(alertAcksTable.deviceId, scopeDeviceIds)))
    : [];

  const byAlert = new Map<number, AckEntry[]>();
  const myAck = new Map<number, string>();
  for (const row of ackRows) {
    const list = byAlert.get(row.alertId) ?? [];
    list.push({ deviceId: row.deviceId, nickname: row.nickname, ackedAt: row.ackedAt.toISOString() });
    byAlert.set(row.alertId, list);
    if (row.deviceId === deviceId) myAck.set(row.alertId, row.ackedAt.toISOString());
  }

  return alerts.map((a) => ({
    ...a,
    acknowledged: myAck.has(a.id),
    acknowledgedAt: myAck.get(a.id) ?? null,
    ackedBy: byAlert.get(a.id) ?? [],
  }));
}

/** Records that `deviceId` acked `alertId`. Idempotent — a repeat ACK from the same device is a no-op. */
export async function ackAlert(alertId: number, deviceId: string, nickname: string | null): Promise<void> {
  await db.insert(alertAcksTable).values({ alertId, deviceId, nickname }).onConflictDoNothing();
}

/** Bulk version of ackAlert — one row per (alertId, deviceId), idempotent. */
export async function ackAlertsBulk(alertIds: number[], deviceId: string, nickname: string | null): Promise<void> {
  if (alertIds.length === 0) return;
  await db.insert(alertAcksTable).values(alertIds.map((alertId) => ({ alertId, deviceId, nickname }))).onConflictDoNothing();
}

/** Alert ids (within `alertIds`) that `deviceId` has NOT yet acked. */
export async function unackedByDevice(alertIds: number[], deviceId: string): Promise<number[]> {
  if (alertIds.length === 0) return [];
  const ackedRows = await db
    .select({ alertId: alertAcksTable.alertId })
    .from(alertAcksTable)
    .where(and(inArray(alertAcksTable.alertId, alertIds), eq(alertAcksTable.deviceId, deviceId)));
  const acked = new Set(ackedRows.map((r) => r.alertId));
  return alertIds.filter((id) => !acked.has(id));
}
