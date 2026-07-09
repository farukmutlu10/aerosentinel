import type { Request } from "express";
import { db, teamsTable, teamWatchlistTable, watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeTeamCode } from "./teamCode.js";
import { getDeviceId } from "./reqContext.js";

export interface ResolvedTeam {
  teamId: number;
  code: string;
  name: string | null;
}

/** Reads the X-Team-Code header, or null if absent/empty. */
export function getTeamCodeHeader(req: Request): string | null {
  const raw = req.headers["x-team-code"];
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return null;
  const code = normalizeTeamCode(val);
  return code.length > 0 ? code : null;
}

/**
 * Resolves a team by its current code — the code IS the credential on every
 * call, never a client-supplied numeric team id (which would be sequential
 * and enumerable). Regenerating a team's code immediately invalidates every
 * old reference to it.
 */
export async function resolveTeam(code: string | null): Promise<ResolvedTeam | null> {
  if (!code) return null;
  const rows = await db
    .select({ id: teamsTable.id, code: teamsTable.code, name: teamsTable.name })
    .from(teamsTable)
    .where(eq(teamsTable.code, code));
  const row = rows[0];
  if (!row) return null;
  return { teamId: row.id, code: row.code, name: row.name };
}

export async function resolveTeamFromRequest(req: Request): Promise<ResolvedTeam | null> {
  return resolveTeam(getTeamCodeHeader(req));
}

/**
 * The single seam alert/watchlist routes use to decide which ICAO set a
 * request should operate on: the active team's shared list when X-Team-Code
 * resolves, otherwise the requester's own personal watchlist. Deliberately
 * exclusive (not a union of both) — team mode is an all-or-nothing toggle so
 * every existing personal-watchlist code path stays untouched when no team
 * is active, and alerts/push/monitor never need to query two sources at once.
 */
export async function getEffectiveIcaos(req: Request): Promise<{ icaos: string[]; team: ResolvedTeam | null }> {
  const team = await resolveTeamFromRequest(req);
  if (team) {
    const rows = await db
      .select({ icao: teamWatchlistTable.icao })
      .from(teamWatchlistTable)
      .where(eq(teamWatchlistTable.teamId, team.teamId));
    return { icaos: rows.map((r) => r.icao), team };
  }
  const userId = getDeviceId(req);
  const rows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable).where(eq(watchlistTable.userId, userId));
  return { icaos: rows.map((r) => r.icao), team: null };
}
