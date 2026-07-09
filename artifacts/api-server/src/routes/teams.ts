import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  db, teamsTable, teamMembersTable, teamWatchlistTable, teamNotesTable, alertsTable, alertAcksTable,
  teamNoteReactionsTable, teamReadCursorsTable, teamEventsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDeviceId } from "../lib/reqContext.js";
import { resolveTeam } from "../lib/teamContext.js";
import { generateTeamCode, normalizeTeamCode } from "../lib/teamCode.js";
import { updateCachedIcaos, getAirports } from "../lib/monitor.js";
import { sendPushToDevices } from "../lib/push.js";
import { logger } from "../lib/logger.js";

const router = Router();

const MAX_TEAM_WATCHLIST_SIZE = 300;
const MAX_NOTE_LENGTH = 500;
const MIN_NAME_LENGTH = 3;
const MAX_NICKNAME_LENGTH = 40;
const MAX_TEAM_NAME_LENGTH = 60;
const MAX_CODE_GEN_ATTEMPTS = 10;
// ~45KB decoded — enough for a small square avatar photo, small enough to
// keep in a TEXT column without ballooning row size.
const MAX_AVATAR_LENGTH = 60_000;

// Join/create are the brute-force-sensitive surface (4-char code) — a
// dedicated, narrower limiter than the global 200/min so that presence
// polling on GET /teams/:code isn't throttled by the same bucket.
const teamJoinLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Nicknames/team names are constrained to uppercase letters and spaces on
// the client; enforce the same shape server-side so direct API calls can't
// smuggle in arbitrary text.
function sanitizeUppercaseName(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeNickname(raw: unknown): string | null {
  return sanitizeUppercaseName(raw, MAX_NICKNAME_LENGTH);
}

function sanitizeTeamName(raw: unknown): string | null {
  return sanitizeUppercaseName(raw, MAX_TEAM_NAME_LENGTH);
}

// Either "preset:<id>" (a built-in icon, looked up client-side) or a small
// base64 image data URL for a custom upload. Only called when the caller
// already confirmed req.body.avatar is present — absence means "leave
// unchanged" (join/profile update) or "no avatar" (create), decided by the
// route, not this validator.
function sanitizeAvatar(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  if (raw.length === 0) return { ok: false, error: "Avatar must not be empty" };
  if (raw.length > MAX_AVATAR_LENGTH) return { ok: false, error: "Avatar is too large" };
  if (raw.startsWith("preset:") || /^data:image\/(png|jpeg|webp);base64,/.test(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, error: "Unsupported avatar format" };
}

// The mem-fallback store has no real UNIQUE enforcement, so collisions must
// be checked in application code on both backends — generate, look up,
// retry, rather than relying on a DB constraint violation to signal a clash.
async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < MAX_CODE_GEN_ATTEMPTS; i++) {
    const candidate = generateTeamCode();
    const existing = await resolveTeam(candidate);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique team code after max attempts");
}

// ── Roles ────────────────────────────────────────────────────────────────
// Exactly one 'owner' per team (the creator, or whoever it's been
// transferred to); everyone else is 'member'. Fetched fresh per request
// rather than trusted from the client — role lives only in team_members.
async function getMember(teamId: number, deviceId: string): Promise<{ role: string; nickname: string | null } | null> {
  const rows = await db
    .select({ role: teamMembersTable.role, nickname: teamMembersTable.nickname })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.deviceId, deviceId)));
  return rows[0] ?? null;
}

async function requireOwner(teamId: number, deviceId: string): Promise<{ ok: true; nickname: string | null } | { ok: false; status: number; error: string }> {
  const member = await getMember(teamId, deviceId);
  if (!member) return { ok: false, status: 403, error: "Not a member of this team" };
  if (member.role !== "owner") return { ok: false, status: 403, error: "Only the team owner can do this" };
  return { ok: true, nickname: member.nickname };
}

async function logTeamEvent(teamId: number, deviceId: string | null, nickname: string | null, type: string, detail?: string | null) {
  try {
    await db.insert(teamEventsTable).values({ teamId, deviceId, nickname, type, detail: detail ?? null });
  } catch (err) {
    logger.error({ err }, `[teams] Failed to log team event type=${type}`);
  }
}

// @NICKNAME mentions — matched against current member nicknames (which may
// contain spaces, e.g. "TOP GUN") rather than a single word, since the
// frontend's autocomplete inserts the full nickname after "@". Longest names
// are tried first so "TOP GUN" doesn't get shadowed by a hypothetical "TOP".
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionedNicknames(body: string, memberNicknames: string[]): string[] {
  const sorted = [...new Set(memberNicknames.filter(Boolean))].sort((a, b) => b.length - a.length);
  const mentioned: string[] = [];
  for (const name of sorted) {
    if (new RegExp(`@${escapeRegex(name)}\\b`, "i").test(body)) mentioned.push(name);
  }
  return mentioned;
}

// ── Typing indicator ─────────────────────────────────────────────────────
// Deliberately in-memory only (no DB write, no persistence needed) — a
// per-process Map keyed by team code, each value a deviceId→timestamp map.
// Entries older than TYPING_TTL_MS are treated as "no longer typing" without
// any cleanup timer; GET just filters by age on read.
const TYPING_TTL_MS = 5_000;
const typingByTeam = new Map<string, Map<string, { nickname: string | null; at: number }>>();

// ── Create ───────────────────────────────────────────────────────────────
router.post("/teams", teamJoinLimiter, async (req, res) => {
  const deviceId = getDeviceId(req);
  const nickname = sanitizeNickname(req.body?.nickname);
  const name = sanitizeTeamName(req.body?.name);
  if (!nickname || nickname.length < MIN_NAME_LENGTH) {
    return res.status(400).json({ error: `Callsign must be at least ${MIN_NAME_LENGTH} letters` });
  }
  if (!name || name.length < MIN_NAME_LENGTH) {
    return res.status(400).json({ error: `Team name must be at least ${MIN_NAME_LENGTH} letters` });
  }

  let avatar: string | null = null;
  if (typeof req.body?.avatar === "string") {
    const result = sanitizeAvatar(req.body.avatar);
    if (!result.ok) return res.status(400).json({ error: result.error });
    avatar = result.value;
  }

  let code: string;
  try {
    code = await generateUniqueCode();
  } catch (err) {
    logger.error({ err }, "[teams] Failed to generate a unique team code");
    return res.status(500).json({ error: "Could not create team, please try again" });
  }

  await db.insert(teamsTable).values({ code, name, createdByDeviceId: deviceId });
  const team = await resolveTeam(code);
  if (!team) return res.status(500).json({ error: "Could not create team, please try again" });

  await db.insert(teamMembersTable).values({ teamId: team.teamId, deviceId, nickname, avatar, role: "owner" });
  await logTeamEvent(team.teamId, deviceId, nickname, "team_created");

  logger.info(`[teams] Created team code=${code} by device=${deviceId.slice(0, 8)}…`);
  return res.json({ code: team.code, teamId: team.teamId, name: team.name });
});

// ── Join ─────────────────────────────────────────────────────────────────
router.post("/teams/:code/join", teamJoinLimiter, async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const nickname = sanitizeNickname(req.body?.nickname);
  if (!nickname || nickname.length < MIN_NAME_LENGTH) {
    return res.status(400).json({ error: `Callsign must be at least ${MIN_NAME_LENGTH} letters` });
  }

  let avatar: string | null = null;
  if (typeof req.body?.avatar === "string") {
    const result = sanitizeAvatar(req.body.avatar);
    if (!result.ok) return res.status(400).json({ error: result.error });
    avatar = result.value;
  }

  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const existing = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, deviceId)));

  if (existing.length > 0) {
    const updateFields: { lastSeenAt: Date; nickname?: string; avatar?: string } = { lastSeenAt: new Date() };
    if (nickname) updateFields.nickname = nickname;
    if (avatar) updateFields.avatar = avatar;
    await db.update(teamMembersTable).set(updateFields).where(eq(teamMembersTable.id, existing[0].id));
  } else {
    await db.insert(teamMembersTable).values({ teamId: team.teamId, deviceId, nickname, avatar, role: "member" });
    await logTeamEvent(team.teamId, deviceId, nickname, "member_joined");
  }

  logger.info(`[teams] device=${deviceId.slice(0, 8)}… joined team code=${code}`);
  return res.json({ code: team.code, teamId: team.teamId, name: team.name });
});

// ── Update own profile (nickname/avatar) without leaving and rejoining ───
router.patch("/teams/:code/profile", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const updateFields: { nickname?: string; avatar?: string } = {};
  if (typeof req.body?.nickname === "string") {
    const nickname = sanitizeNickname(req.body.nickname);
    if (nickname) updateFields.nickname = nickname;
  }
  if (typeof req.body?.avatar === "string") {
    const result = sanitizeAvatar(req.body.avatar);
    if (!result.ok) return res.status(400).json({ error: result.error });
    updateFields.avatar = result.value;
  }
  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  await db
    .update(teamMembersTable)
    .set(updateFields)
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, deviceId)));

  return res.json({ ok: true });
});

// ── Team info + member presence ─────────────────────────────────────────
router.get("/teams/:code", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const members = await db
    .select({
      deviceId: teamMembersTable.deviceId,
      nickname: teamMembersTable.nickname,
      avatar: teamMembersTable.avatar,
      role: teamMembersTable.role,
      joinedAt: teamMembersTable.joinedAt,
      lastSeenAt: teamMembersTable.lastSeenAt,
    })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.teamId));

  // Presence heartbeat: a device polling for team info is by definition alive.
  const self = members.find((m) => m.deviceId === deviceId);
  if (self) {
    const now = new Date();
    await db
      .update(teamMembersTable)
      .set({ lastSeenAt: now })
      .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, deviceId)));
    self.lastSeenAt = now;
  }

  return res.json({ code: team.code, teamId: team.teamId, name: team.name, members });
});

// ── Leave (self) ─────────────────────────────────────────────────────────
// Owner policy (per product decision): an owner with other members present
// must transfer ownership first (POST /transfer) before they can leave —
// a team must never end up ownerless while people are still in it. A sole
// remaining member (owner or not) can always leave; the team is simply left
// empty, same as before roles existed.
router.delete("/teams/:code/members", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const self = await getMember(team.teamId, deviceId);
  if (self?.role === "owner") {
    const others = await db
      .select({ deviceId: teamMembersTable.deviceId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, team.teamId));
    if (others.filter((m) => m.deviceId !== deviceId).length > 0) {
      return res.status(409).json({ error: "Transfer ownership to another member before leaving" });
    }
  }

  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, deviceId)));
  if (self) await logTeamEvent(team.teamId, deviceId, self.nickname, "member_left");
  return res.json({ ok: true });
});

// ── Kick a member (owner only) ───────────────────────────────────────────
router.delete("/teams/:code/members/:deviceId", async (req, res) => {
  const requesterId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const targetDeviceId = String(req.params.deviceId ?? "");
  if (targetDeviceId === requesterId) {
    return res.status(400).json({ error: "Use Leave instead of removing yourself" });
  }

  const owner = await requireOwner(team.teamId, requesterId);
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error });

  const target = await getMember(team.teamId, targetDeviceId);
  if (!target) return res.status(404).json({ error: "That member is not on this team" });

  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, targetDeviceId)));
  await logTeamEvent(team.teamId, targetDeviceId, target.nickname, "member_kicked", owner.nickname);
  return res.json({ ok: true });
});

// ── Transfer ownership (owner only) ──────────────────────────────────────
router.post("/teams/:code/transfer", async (req, res) => {
  const requesterId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const owner = await requireOwner(team.teamId, requesterId);
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error });

  const targetDeviceId = String(req.body?.deviceId ?? "");
  if (!targetDeviceId || targetDeviceId === requesterId) {
    return res.status(400).json({ error: "Pick another member to transfer ownership to" });
  }
  const target = await getMember(team.teamId, targetDeviceId);
  if (!target) return res.status(404).json({ error: "That member is not on this team" });

  await db.update(teamMembersTable).set({ role: "owner" })
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, targetDeviceId)));
  await db.update(teamMembersTable).set({ role: "member" })
    .where(and(eq(teamMembersTable.teamId, team.teamId), eq(teamMembersTable.deviceId, requesterId)));
  await logTeamEvent(team.teamId, targetDeviceId, target.nickname, "ownership_transferred", owner.nickname);
  return res.json({ ok: true });
});

// ── Rename team (owner only) ─────────────────────────────────────────────
router.patch("/teams/:code/rename", async (req, res) => {
  const requesterId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const owner = await requireOwner(team.teamId, requesterId);
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error });

  const name = sanitizeTeamName(req.body?.name);
  if (!name || name.length < MIN_NAME_LENGTH) {
    return res.status(400).json({ error: `Team name must be at least ${MIN_NAME_LENGTH} letters` });
  }

  await db.update(teamsTable).set({ name }).where(eq(teamsTable.id, team.teamId));
  await logTeamEvent(team.teamId, requesterId, owner.nickname, "team_renamed", name);
  return res.json({ ok: true, name });
});

// ── Regenerate code (owner only) — rotates access, invalidates old invites ─
router.post("/teams/:code/regenerate", teamJoinLimiter, async (req, res) => {
  const requesterId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const owner = await requireOwner(team.teamId, requesterId);
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error });

  let newCode: string;
  try {
    newCode = await generateUniqueCode();
  } catch (err) {
    logger.error({ err }, "[teams] Failed to regenerate team code");
    return res.status(500).json({ error: "Could not regenerate code, please try again" });
  }

  await db.update(teamsTable).set({ code: newCode }).where(eq(teamsTable.id, team.teamId));
  logger.info(`[teams] Regenerated code for teamId=${team.teamId}: ${code} → ${newCode}`);
  return res.json({ code: newCode, teamId: team.teamId, name: team.name });
});

// ── Team watchlist ───────────────────────────────────────────────────────
router.get("/teams/:code/watchlist", async (req, res) => {
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const rows = await db
    .select({ icao: teamWatchlistTable.icao })
    .from(teamWatchlistTable)
    .where(eq(teamWatchlistTable.teamId, team.teamId));
  return res.json(rows.map((r) => r.icao));
});

router.post("/teams/:code/watchlist", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const icao = ((req.body?.icao as string) ?? "").trim().toUpperCase();
  if (!icao || icao.length < 2 || icao.length > 6) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }

  const existingCount = await db
    .select({ icao: teamWatchlistTable.icao })
    .from(teamWatchlistTable)
    .where(eq(teamWatchlistTable.teamId, team.teamId));
  if (existingCount.length >= MAX_TEAM_WATCHLIST_SIZE && !existingCount.some((r) => r.icao === icao)) {
    return res.status(400).json({ error: `Team watchlist cannot exceed ${MAX_TEAM_WATCHLIST_SIZE} airports` });
  }

  await db.insert(teamWatchlistTable).values({ teamId: team.teamId, icao, addedByDeviceId: deviceId }).onConflictDoNothing();

  // Immediately add to the monitor's in-memory scan list, same as personal watchlist POST.
  const current = getAirports();
  if (!current.includes(icao)) {
    updateCachedIcaos([...current, icao]);
  }

  return res.json({ ok: true, icao });
});

// Bulk add (paste of many ICAOs at once) — mirrors the personal watchlist's
// addIcaos()/PUT-sync rationale: one request for the whole paste instead of
// one POST per airport, which previously flooded the rate limiter on large
// pastes (see WatchlistContext.tsx). Adds (union), never removes — a
// destructive replace would be unsafe with multiple concurrent team writers.
router.post("/teams/:code/watchlist/bulk", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const raw = req.body?.icaos;
  const icaos = Array.isArray(raw)
    ? [...new Set(raw.map((s: unknown) => String(s).trim().toUpperCase()).filter((s) => s.length >= 2 && s.length <= 6))]
    : [];
  if (icaos.length === 0) return res.status(400).json({ error: "No valid ICAO codes provided" });

  const existing = await db
    .select({ icao: teamWatchlistTable.icao })
    .from(teamWatchlistTable)
    .where(eq(teamWatchlistTable.teamId, team.teamId));
  const existingSet = new Set(existing.map((r) => r.icao));
  const room = MAX_TEAM_WATCHLIST_SIZE - existingSet.size;
  const toAdd = icaos.filter((icao) => !existingSet.has(icao)).slice(0, Math.max(0, room));

  if (toAdd.length > 0) {
    await db
      .insert(teamWatchlistTable)
      .values(toAdd.map((icao) => ({ teamId: team.teamId, icao, addedByDeviceId: deviceId })))
      .onConflictDoNothing();

    const current = getAirports();
    const missing = toAdd.filter((icao) => !current.includes(icao));
    if (missing.length > 0) updateCachedIcaos([...current, ...missing]);
  }

  return res.json({ ok: true, added: toAdd, icaos: [...existingSet, ...toAdd] });
});

router.delete("/teams/:code/watchlist/:icao", async (req, res) => {
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const icao = req.params.icao?.toUpperCase();
  await db
    .delete(teamWatchlistTable)
    .where(and(eq(teamWatchlistTable.teamId, team.teamId), eq(teamWatchlistTable.icao, icao)));
  return res.json({ ok: true, icao });
});

// ── Shift-handoff notes (append-only log) ───────────────────────────────
router.get("/teams/:code/notes", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const notes = await db
    .select({
      id: teamNotesTable.id,
      deviceId: teamNotesTable.deviceId,
      nickname: teamNotesTable.nickname,
      body: teamNotesTable.body,
      pinned: teamNotesTable.pinned,
      replyToId: teamNotesTable.replyToId,
      createdAt: teamNotesTable.createdAt,
    })
    .from(teamNotesTable)
    .where(eq(teamNotesTable.teamId, team.teamId))
    .orderBy(desc(teamNotesTable.createdAt))
    .limit(100);

  const noteIds = notes.map((n) => n.id);
  const replyToIds = [...new Set(notes.map((n) => n.replyToId).filter((id): id is number => id !== null))];

  const [reactionRows, quotedRows, cursorRows] = await Promise.all([
    noteIds.length > 0
      ? db.select({ noteId: teamNoteReactionsTable.noteId, deviceId: teamNoteReactionsTable.deviceId, emoji: teamNoteReactionsTable.emoji })
          .from(teamNoteReactionsTable).where(inArray(teamNoteReactionsTable.noteId, noteIds))
      : Promise.resolve([]),
    replyToIds.length > 0
      ? db.select({ id: teamNotesTable.id, nickname: teamNotesTable.nickname, body: teamNotesTable.body })
          .from(teamNotesTable).where(inArray(teamNotesTable.id, replyToIds))
      : Promise.resolve([]),
    db.select({ deviceId: teamReadCursorsTable.deviceId, lastReadNoteId: teamReadCursorsTable.lastReadNoteId })
      .from(teamReadCursorsTable).where(eq(teamReadCursorsTable.teamId, team.teamId)),
  ]);

  const quotedById = new Map(quotedRows.map((q) => [q.id, q]));

  // Reactions grouped per note: { emoji -> deviceIds[] }
  const reactionsByNote = new Map<number, Map<string, string[]>>();
  for (const r of reactionRows) {
    let byEmoji = reactionsByNote.get(r.noteId);
    if (!byEmoji) { byEmoji = new Map(); reactionsByNote.set(r.noteId, byEmoji); }
    const list = byEmoji.get(r.emoji) ?? [];
    list.push(r.deviceId);
    byEmoji.set(r.emoji, list);
  }

  // "Seen by" per note: every member whose read cursor is >= this note's id,
  // excluding the note's own author (seeing your own message isn't news) and
  // the requester (no point telling you that you've seen it).
  const cursors = cursorRows.filter((c) => c.deviceId !== deviceId);

  const result = notes.map((n) => {
    const byEmoji = reactionsByNote.get(n.id);
    const reactions = byEmoji
      ? [...byEmoji.entries()].map(([emoji, deviceIds]) => ({ emoji, deviceIds, count: deviceIds.length }))
      : [];
    const seenBy = cursors
      .filter((c) => c.deviceId !== n.deviceId && c.lastReadNoteId !== null && c.lastReadNoteId >= n.id)
      .map((c) => c.deviceId);
    return {
      ...n,
      replyTo: n.replyToId !== null ? quotedById.get(n.replyToId) ?? null : null,
      reactions,
      seenBy,
    };
  });

  return res.json(result);
});

router.post("/teams/:code/notes", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const body = ((req.body?.body as string) ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  if (!body) return res.status(400).json({ error: "Note body is required" });

  let replyToId: number | null = null;
  if (req.body?.replyToId !== undefined && req.body?.replyToId !== null) {
    const candidate = Number(req.body.replyToId);
    if (Number.isFinite(candidate)) {
      const [quoted] = await db.select({ id: teamNotesTable.id })
        .from(teamNotesTable)
        .where(and(eq(teamNotesTable.id, candidate), eq(teamNotesTable.teamId, team.teamId)));
      if (quoted) replyToId = quoted.id;
    }
  }

  const members = await db
    .select({ deviceId: teamMembersTable.deviceId, nickname: teamMembersTable.nickname })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.teamId));
  const nickname = members.find((m) => m.deviceId === deviceId)?.nickname ?? null;

  await db.insert(teamNotesTable).values({ teamId: team.teamId, deviceId, nickname, body, replyToId });

  // @mentions → targeted push, separate from (and in addition to) whatever
  // general "new chat message" notification the client-side polling already
  // surfaces — this one is addressed, so it warrants interrupting the
  // mentioned pilot specifically rather than waiting for them to notice.
  const mentioned = findMentionedNicknames(body, members.map((m) => m.nickname).filter((n): n is string => !!n));
  if (mentioned.length > 0) {
    const mentionedDeviceIds = members
      .filter((m) => m.nickname && mentioned.includes(m.nickname) && m.deviceId !== deviceId)
      .map((m) => m.deviceId);
    if (mentionedDeviceIds.length > 0) {
      await sendPushToDevices(mentionedDeviceIds, {
        title: `${nickname ?? "A teammate"} mentioned you`,
        body: body.slice(0, 120),
        tag: `aero-team-mention-${team.teamId}`,
        data: { url: "/", teamCode: team.code },
      });
    }
  }

  return res.json({ ok: true });
});

// Edit/delete are restricted to the note's own author (matched by
// device id) — not any team member, unlike watchlist/regenerate which are
// intentionally shared-write. A note is a personal log entry attributed to
// whoever wrote it, so only they can change or retract it.
router.patch("/teams/:code/notes/:id", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid note id" });

  const body = ((req.body?.body as string) ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  if (!body) return res.status(400).json({ error: "Note body is required" });

  const [updated] = await db
    .update(teamNotesTable)
    .set({ body })
    .where(and(eq(teamNotesTable.id, id), eq(teamNotesTable.teamId, team.teamId), eq(teamNotesTable.deviceId, deviceId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Note not found" });
  return res.json({ ok: true });
});

// Owner can delete ANY note (moderation), not just their own — a member can
// still only delete a note they authored themselves.
router.delete("/teams/:code/notes/:id", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid note id" });

  const self = await getMember(team.teamId, deviceId);
  const where = self?.role === "owner"
    ? and(eq(teamNotesTable.id, id), eq(teamNotesTable.teamId, team.teamId))
    : and(eq(teamNotesTable.id, id), eq(teamNotesTable.teamId, team.teamId), eq(teamNotesTable.deviceId, deviceId));

  const [deleted] = await db.delete(teamNotesTable).where(where).returning();
  if (!deleted) return res.status(404).json({ error: "Note not found" });
  return res.json({ ok: true });
});

// Pinning is open to any team member (unlike edit/delete) — it's a shared
// "keep this visible" signal for the whole shift, not a personal-log action.
router.patch("/teams/:code/notes/:id/pin", async (req, res) => {
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid note id" });
  const pinned = req.body?.pinned === true;

  const [updated] = await db
    .update(teamNotesTable)
    .set({ pinned })
    .where(and(eq(teamNotesTable.id, id), eq(teamNotesTable.teamId, team.teamId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Note not found" });
  return res.json({ ok: true });
});

// ── Reactions ────────────────────────────────────────────────────────────
const ALLOWED_REACTION_EMOJI = new Set(["👍", "✈️", "⚠️", "👀", "✅", "❤️"]);

router.post("/teams/:code/notes/:id/reactions", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid note id" });
  const emoji = String(req.body?.emoji ?? "");
  if (!ALLOWED_REACTION_EMOJI.has(emoji)) return res.status(400).json({ error: "Unsupported reaction" });

  const [note] = await db.select({ id: teamNotesTable.id })
    .from(teamNotesTable).where(and(eq(teamNotesTable.id, id), eq(teamNotesTable.teamId, team.teamId)));
  if (!note) return res.status(404).json({ error: "Note not found" });

  await db.insert(teamNoteReactionsTable).values({ noteId: id, deviceId, emoji }).onConflictDoNothing();
  return res.json({ ok: true });
});

router.delete("/teams/:code/notes/:id/reactions/:emoji", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid note id" });
  const emoji = decodeURIComponent(req.params.emoji ?? "");

  await db.delete(teamNoteReactionsTable)
    .where(and(eq(teamNoteReactionsTable.noteId, id), eq(teamNoteReactionsTable.deviceId, deviceId), eq(teamNoteReactionsTable.emoji, emoji)));
  return res.json({ ok: true });
});

// ── Read receipts ────────────────────────────────────────────────────────
// One cursor per (team, device): "seen everything up through this note id".
// The client calls this with the newest note id it has rendered, typically
// right after opening the chat dialog or receiving new notes while open.
router.post("/teams/:code/read", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const lastReadNoteId = Number(req.body?.lastReadNoteId);
  if (!Number.isFinite(lastReadNoteId)) return res.status(400).json({ error: "Invalid lastReadNoteId" });

  await db.insert(teamReadCursorsTable)
    .values({ teamId: team.teamId, deviceId, lastReadNoteId })
    .onConflictDoUpdate({
      target: [teamReadCursorsTable.teamId, teamReadCursorsTable.deviceId],
      set: { lastReadNoteId, updatedAt: new Date() },
    });
  return res.json({ ok: true });
});

// ── Typing indicator ─────────────────────────────────────────────────────
// In-memory only (see typingByTeam above) — no persistence, no history, just
// "who's typing right now" for the ~5s a client last pinged.
router.post("/teams/:code/typing", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const member = await getMember(team.teamId, deviceId);
  let byDevice = typingByTeam.get(code);
  if (!byDevice) { byDevice = new Map(); typingByTeam.set(code, byDevice); }
  byDevice.set(deviceId, { nickname: member?.nickname ?? null, at: Date.now() });
  return res.json({ ok: true });
});

router.get("/teams/:code/typing", async (req, res) => {
  const deviceId = getDeviceId(req);
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const byDevice = typingByTeam.get(code);
  if (!byDevice) return res.json({ nicknames: [] });
  const now = Date.now();
  const nicknames: string[] = [];
  for (const [id, entry] of byDevice) {
    if (id === deviceId) continue;
    if (now - entry.at > TYPING_TTL_MS) continue;
    if (entry.nickname) nicknames.push(entry.nickname);
  }
  return res.json({ nicknames });
});

// ── Activity feed ────────────────────────────────────────────────────────
// Deliberately no dedicated event-log table — watchlist adds, notes, and
// alert acknowledgements already carry a device/nickname/timestamp on their
// own rows (team_watchlist, team_notes, alerts), so the feed is just those
// three sources merged and sorted, not a new write path to keep in sync.
router.get("/teams/:code/activity", async (req, res) => {
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  // Projection keys deliberately match the underlying column names (no
  // aliasing) — the in-memory dev fallback's select() ignores the requested
  // projection shape entirely and returns raw rows keyed by their original
  // property names (see lib/db/src/index.ts), so e.g. `at: ...addedAt`
  // would silently come back as `undefined` outside real Postgres.
  const [watchlistRows, notesRows, memberRows, eventRows] = await Promise.all([
    db.select({ icao: teamWatchlistTable.icao, addedByDeviceId: teamWatchlistTable.addedByDeviceId, addedAt: teamWatchlistTable.addedAt })
      .from(teamWatchlistTable).where(eq(teamWatchlistTable.teamId, team.teamId)),
    db.select({ id: teamNotesTable.id, deviceId: teamNotesTable.deviceId, nickname: teamNotesTable.nickname, body: teamNotesTable.body, createdAt: teamNotesTable.createdAt })
      .from(teamNotesTable).where(eq(teamNotesTable.teamId, team.teamId)),
    db.select({ deviceId: teamMembersTable.deviceId, nickname: teamMembersTable.nickname })
      .from(teamMembersTable).where(eq(teamMembersTable.teamId, team.teamId)),
    db.select({ deviceId: teamEventsTable.deviceId, nickname: teamEventsTable.nickname, type: teamEventsTable.type, detail: teamEventsTable.detail, createdAt: teamEventsTable.createdAt })
      .from(teamEventsTable).where(eq(teamEventsTable.teamId, team.teamId)),
  ]);

  const nicknameByDevice = new Map(memberRows.map((m) => [m.deviceId, m.nickname]));
  const memberDeviceIds = memberRows.map((m) => m.deviceId);
  const teamIcaos = [...new Set(watchlistRows.map((w) => w.icao))];

  // Acknowledgement is now tracked per device (alert_acks), never as a
  // shared flag on the alert row — pull team alerts, then join their
  // per-member acks in JS.
  const teamAlerts = teamIcaos.length > 0
    ? await db.select({ id: alertsTable.id, type: alertsTable.type, icao: alertsTable.icao })
        .from(alertsTable).where(inArray(alertsTable.icao, teamIcaos))
    : [];
  const teamAlertIds = teamAlerts.map((a) => a.id);
  const alertById = new Map(teamAlerts.map((a) => [a.id, a]));

  const ackRows = teamAlertIds.length > 0 && memberDeviceIds.length > 0
    ? await db.select({ alertId: alertAcksTable.alertId, deviceId: alertAcksTable.deviceId, nickname: alertAcksTable.nickname, ackedAt: alertAcksTable.ackedAt })
        .from(alertAcksTable).where(and(inArray(alertAcksTable.alertId, teamAlertIds), inArray(alertAcksTable.deviceId, memberDeviceIds)))
    : [];

  type EventType = "member_joined" | "member_left" | "member_kicked" | "ownership_transferred" | "team_renamed" | "team_created";

  interface ActivityItem {
    type: "watchlist_add" | "note" | "alert_ack" | EventType;
    deviceId: string | null;
    nickname: string | null;
    detail: string;
    at: string;
  }

  const items: ActivityItem[] = [];
  for (const w of watchlistRows) {
    items.push({ type: "watchlist_add", deviceId: w.addedByDeviceId, nickname: w.addedByDeviceId ? nicknameByDevice.get(w.addedByDeviceId) ?? null : null, detail: w.icao, at: w.addedAt.toISOString() });
  }
  for (const n of notesRows) {
    items.push({ type: "note", deviceId: n.deviceId, nickname: n.nickname, detail: n.body.slice(0, 80), at: n.createdAt.toISOString() });
  }
  for (const a of ackRows) {
    const alert = alertById.get(a.alertId);
    if (!alert) continue;
    items.push({ type: "alert_ack", deviceId: a.deviceId, nickname: a.nickname, detail: `${alert.type} ${alert.icao}`, at: a.ackedAt.toISOString() });
  }
  for (const e of eventRows) {
    if (e.type === "team_created") continue; // noise — every team has exactly one, right at the top
    items.push({ type: e.type as EventType, deviceId: e.deviceId, nickname: e.nickname, detail: e.detail ?? "", at: e.createdAt.toISOString() });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return res.json(items.slice(0, 50));
});

// Weekly response-speed leaderboard — average time from alert detection to
// acknowledgement, per member, over a rolling 7-day window. No new table:
// derived entirely from alerts already scoped to the team's watchlist
// ICAOs, same approach as the activity feed above.
router.get("/teams/:code/leaderboard", async (req, res) => {
  const code = normalizeTeamCode(String(req.params.code ?? ""));
  const team = await resolveTeam(code);
  if (!team) return res.status(404).json({ error: "Team not found" });

  const [watchlistRows, memberRows] = await Promise.all([
    db.select({ icao: teamWatchlistTable.icao }).from(teamWatchlistTable).where(eq(teamWatchlistTable.teamId, team.teamId)),
    db.select({ deviceId: teamMembersTable.deviceId, nickname: teamMembersTable.nickname, avatar: teamMembersTable.avatar })
      .from(teamMembersTable).where(eq(teamMembersTable.teamId, team.teamId)),
  ]);

  const teamIcaos = [...new Set(watchlistRows.map((w) => w.icao))];
  const memberDeviceIds = memberRows.map((m) => m.deviceId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const teamAlerts = teamIcaos.length > 0
    ? await db.select({ id: alertsTable.id, detectedAt: alertsTable.detectedAt }).from(alertsTable).where(inArray(alertsTable.icao, teamIcaos))
    : [];
  const teamAlertIds = teamAlerts.map((a) => a.id);
  const detectedAtById = new Map(teamAlerts.map((a) => [a.id, a.detectedAt]));

  const ackRows = teamAlertIds.length > 0 && memberDeviceIds.length > 0
    ? await db.select({ alertId: alertAcksTable.alertId, deviceId: alertAcksTable.deviceId, ackedAt: alertAcksTable.ackedAt })
        .from(alertAcksTable).where(and(inArray(alertAcksTable.alertId, teamAlertIds), inArray(alertAcksTable.deviceId, memberDeviceIds)))
    : [];

  const totalsByDevice = new Map<string, { totalMs: number; count: number }>();
  for (const a of ackRows) {
    if (a.ackedAt < weekAgo) continue;
    const detectedAt = detectedAtById.get(a.alertId);
    if (!detectedAt) continue;
    const ms = a.ackedAt.getTime() - detectedAt.getTime();
    if (ms < 0) continue;
    const entry = totalsByDevice.get(a.deviceId) ?? { totalMs: 0, count: 0 };
    entry.totalMs += ms;
    entry.count += 1;
    totalsByDevice.set(a.deviceId, entry);
  }

  interface LeaderboardEntry {
    deviceId: string;
    nickname: string | null;
    avatar: string | null;
    avgSeconds: number;
    ackCount: number;
  }

  const entries: LeaderboardEntry[] = memberRows
    .filter((m) => totalsByDevice.has(m.deviceId))
    .map((m) => {
      const { totalMs, count } = totalsByDevice.get(m.deviceId)!;
      return { deviceId: m.deviceId, nickname: m.nickname, avatar: m.avatar, avgSeconds: Math.round(totalMs / count / 1000), ackCount: count };
    })
    .sort((a, b) => a.avgSeconds - b.avgSeconds);

  return res.json(entries);
});

export default router;
