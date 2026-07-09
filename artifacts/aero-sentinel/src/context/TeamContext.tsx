import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTeam, useJoinTeam, useLeaveTeam, useRegenerateTeamCode, useUpdateTeamProfile,
  useGetTeam, useGetTeamWatchlist, useAddTeamWatchlistIcao, useAddTeamWatchlistIcaosBulk, useRemoveTeamWatchlistIcao,
  useGetTeamNotes, useAddTeamNote, useUpdateTeamNote, useDeleteTeamNote, usePinTeamNote, useGetTeamActivity, useGetTeamLeaderboard,
  useKickTeamMember, useTransferTeamOwnership, useRenameTeam,
  useAddTeamNoteReaction, useRemoveTeamNoteReaction, useMarkTeamRead, useSendTypingIndicator, useGetTypingIndicator,
  getGetTeamQueryKey, getGetTeamWatchlistQueryKey, getGetTeamNotesQueryKey, getGetTeamActivityQueryKey, getGetTeamLeaderboardQueryKey,
  getGetTypingIndicatorQueryKey,
  setTeamCodeGetter,
  type TeamMember, type TeamNote, type TeamActivityItem, type TeamLeaderboardEntry,
} from "@workspace/api-client-react";
import { getDeviceId } from "@/lib/deviceId";
import { defaultAvatarValue } from "@/lib/teamAvatars";
import { useAlertSound } from "@/hooks/useAlertSound";
import { toast } from "@/hooks/use-toast";

const TEAM_CODE_KEY = "aero-team-code";
const TEAM_NICKNAME_KEY = "aero-team-nickname";
const TEAM_AVATAR_KEY = "aero-team-avatar";

// Deliberately raw strings in localStorage (not JSON-encoded like
// usePersistedState) — WatchlistContext.tsx's getHeaders() and the getter
// registered below both read this key directly and send it as an HTTP
// header verbatim.
function loadTeamCode(): string | null {
  try { return localStorage.getItem(TEAM_CODE_KEY); } catch { return null; }
}
function saveTeamCode(code: string | null) {
  try {
    if (code) localStorage.setItem(TEAM_CODE_KEY, code);
    else localStorage.removeItem(TEAM_CODE_KEY);
  } catch { /* ignore */ }
}
function loadNickname(): string {
  try { return localStorage.getItem(TEAM_NICKNAME_KEY) ?? ""; } catch { return ""; }
}
function saveNickname(nickname: string) {
  try { localStorage.setItem(TEAM_NICKNAME_KEY, nickname); } catch { /* ignore */ }
}
function loadAvatar(): string {
  try { return localStorage.getItem(TEAM_AVATAR_KEY) || defaultAvatarValue(); } catch { return defaultAvatarValue(); }
}
function saveAvatar(avatar: string) {
  try { localStorage.setItem(TEAM_AVATAR_KEY, avatar); } catch { /* ignore */ }
}

const CHAT_LASTREAD_PREFIX = "aero-team-chat-lastread-";
function loadLastReadId(code: string): number {
  try { return Number(localStorage.getItem(CHAT_LASTREAD_PREFIX + code)) || 0; } catch { return 0; }
}
function saveLastReadId(code: string, id: number) {
  try { localStorage.setItem(CHAT_LASTREAD_PREFIX + code, String(id)); } catch { /* ignore */ }
}

// Registered once at module load (not inside a useEffect) so the very first
// request fired by any generated hook — including ones in components that
// mount before TeamProvider's own effects run — already carries the current
// team code. Reads localStorage fresh on every call, so it doesn't need to
// know about React state changes.
setTeamCodeGetter(loadTeamCode);

interface TeamInfo {
  code: string;
  teamId: number;
  name: string | null;
}

interface TeamContextValue {
  code: string | null;
  nickname: string;
  avatar: string;
  isInTeam: boolean;
  team: TeamInfo | null;
  members: TeamMember[];
  selfMember: TeamMember | null;
  isLoadingTeam: boolean;
  teamError: boolean;
  watchlist: string[];
  notes: TeamNote[];
  activity: TeamActivityItem[];
  leaderboard: TeamLeaderboardEntry[];
  createTeam: (nickname: string, name: string, avatar: string) => Promise<void>;
  joinTeam: (code: string, nickname: string, avatar: string) => Promise<{ ok: boolean; error?: string }>;
  leaveTeam: () => Promise<void>;
  regenerateCode: () => Promise<void>;
  updateProfile: (fields: { nickname?: string; avatar?: string }) => Promise<void>;
  addWatchlistIcao: (icao: string) => Promise<void>;
  addWatchlistIcaos: (icaos: string[]) => Promise<void>;
  removeWatchlistIcao: (icao: string) => Promise<void>;
  addNote: (body: string, replyToId?: number | null) => Promise<void>;
  editNote: (id: number, body: string) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  pinNote: (id: number, pinned: boolean) => Promise<void>;
  unreadChatCount: number;
  markChatRead: () => void;
  isOwner: boolean;
  kickMember: (deviceId: string) => Promise<void>;
  transferOwnership: (deviceId: string) => Promise<{ ok: boolean; error?: string }>;
  renameTeam: (name: string) => Promise<void>;
  addReaction: (noteId: number, emoji: string) => Promise<void>;
  removeReaction: (noteId: number, emoji: string) => Promise<void>;
  typingNicknames: string[];
  notifyTyping: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { play: playNoteSound } = useAlertSound();
  const deviceId = getDeviceId();
  const [code, setCodeState] = useState<string | null>(loadTeamCode);
  const [nickname, setNicknameState] = useState<string>(loadNickname);
  const [avatar, setAvatarState] = useState<string>(loadAvatar);

  const setCode = useCallback((c: string | null) => {
    setCodeState(c);
    saveTeamCode(c);
  }, []);
  const setNickname = useCallback((n: string) => {
    setNicknameState(n);
    saveNickname(n);
  }, []);
  const setAvatar = useCallback((a: string) => {
    setAvatarState(a);
    saveAvatar(a);
  }, []);

  const createMutation = useCreateTeam();
  const joinMutation = useJoinTeam();
  const leaveMutation = useLeaveTeam();
  const regenerateMutation = useRegenerateTeamCode();
  const updateProfileMutation = useUpdateTeamProfile();
  const addIcaoMutation = useAddTeamWatchlistIcao();
  const addIcaosBulkMutation = useAddTeamWatchlistIcaosBulk();
  const removeIcaoMutation = useRemoveTeamWatchlistIcao();
  const addNoteMutation = useAddTeamNote();
  const updateNoteMutation = useUpdateTeamNote();
  const deleteNoteMutation = useDeleteTeamNote();
  const pinNoteMutation = usePinTeamNote();
  const kickMemberMutation = useKickTeamMember();
  const transferOwnershipMutation = useTransferTeamOwnership();
  const renameTeamMutation = useRenameTeam();
  const addReactionMutation = useAddTeamNoteReaction();
  const removeReactionMutation = useRemoveTeamNoteReaction();
  const markReadMutation = useMarkTeamRead();
  const sendTypingMutation = useSendTypingIndicator();

  // retry: false + networkMode: "always" — a 404 here means the code is
  // stale/regenerated, not a transient network blip, so retrying can't help.
  // Skipping retries also avoids TanStack Query's retry-pause codepath
  // leaving the query stuck at fetchStatus "paused"/status "pending"
  // indefinitely instead of settling to "error" — which otherwise means the
  // "kod artık geçerli değil" UI never appears for a stale cached code.
  const teamQuery = useGetTeam(code ?? "", {
    query: { queryKey: getGetTeamQueryKey(code ?? ""), enabled: !!code, refetchInterval: 15_000, retry: false, networkMode: "always" },
  });
  const watchlistQuery = useGetTeamWatchlist(code ?? "", {
    query: { queryKey: getGetTeamWatchlistQueryKey(code ?? ""), enabled: !!code, refetchInterval: 30_000, retry: false, networkMode: "always" },
  });
  // Chat-speed polling (faster than the other team queries) — this is the
  // one surface meant to feel like live messaging.
  const notesQuery = useGetTeamNotes(code ?? "", {
    query: { queryKey: getGetTeamNotesQueryKey(code ?? ""), enabled: !!code, refetchInterval: 7_000, retry: false, networkMode: "always" },
  });
  const activityQuery = useGetTeamActivity(code ?? "", {
    query: { queryKey: getGetTeamActivityQueryKey(code ?? ""), enabled: !!code, refetchInterval: 30_000, retry: false, networkMode: "always" },
  });
  // No manual invalidation wired up (unlike activity/notes/watchlist) — this
  // is a derived, non-critical stat, the 30s poll is enough to keep it fresh.
  const leaderboardQuery = useGetTeamLeaderboard(code ?? "", {
    query: { queryKey: getGetTeamLeaderboardQueryKey(code ?? ""), enabled: !!code, refetchInterval: 30_000, retry: false, networkMode: "always" },
  });
  // Typing indicator — short poll, only meaningful while a human is plausibly
  // looking at the chat, but cheap enough (tiny in-memory response) to just
  // always run alongside the other team queries rather than plumbing an
  // "is the chat dialog open" flag through the context.
  const typingQuery = useGetTypingIndicator(code ?? "", {
    query: { queryKey: getGetTypingIndicatorQueryKey(code ?? ""), enabled: !!code, refetchInterval: 3_000, retry: false, networkMode: "always" },
  });

  const createTeam = useCallback(async (nick: string, name: string, av: string) => {
    const result = await createMutation.mutateAsync({ data: { nickname: nick || undefined, name: name || undefined, avatar: av } });
    setNickname(nick);
    setAvatar(av);
    setCode(result.code);
  }, [createMutation, setCode, setNickname, setAvatar]);

  const joinTeam = useCallback(async (rawCode: string, nick: string, av: string) => {
    const normalized = rawCode.trim().toUpperCase();
    try {
      const result = await joinMutation.mutateAsync({ code: normalized, data: { nickname: nick || undefined, avatar: av } });
      setNickname(nick);
      setAvatar(av);
      setCode(result.code);
      return { ok: true };
    } catch {
      return { ok: false, error: "Code not found or invalid" };
    }
  }, [joinMutation, setCode, setNickname, setAvatar]);

  const leaveTeam = useCallback(async () => {
    if (!code) return;
    const leavingCode = code;
    try { await leaveMutation.mutateAsync({ code: leavingCode }); } catch { /* best-effort — clear locally regardless */ }
    setCode(null);
    queryClient.removeQueries({ queryKey: getGetTeamQueryKey(leavingCode) });
    queryClient.removeQueries({ queryKey: getGetTeamWatchlistQueryKey(leavingCode) });
    queryClient.removeQueries({ queryKey: getGetTeamNotesQueryKey(leavingCode) });
    queryClient.removeQueries({ queryKey: getGetTeamActivityQueryKey(leavingCode) });
  }, [code, leaveMutation, setCode, queryClient]);

  const regenerateCode = useCallback(async () => {
    if (!code) return;
    const result = await regenerateMutation.mutateAsync({ code });
    setCode(result.code);
  }, [code, regenerateMutation, setCode]);

  const updateProfile = useCallback(async (fields: { nickname?: string; avatar?: string }) => {
    if (!code) return;
    await updateProfileMutation.mutateAsync({ code, data: fields });
    if (fields.nickname) setNickname(fields.nickname);
    if (fields.avatar) setAvatar(fields.avatar);
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(code) });
  }, [code, updateProfileMutation, setNickname, setAvatar, queryClient]);

  const addWatchlistIcao = useCallback(async (icao: string) => {
    if (!code) return;
    await addIcaoMutation.mutateAsync({ code, data: { icao: icao.toUpperCase() } });
    queryClient.invalidateQueries({ queryKey: getGetTeamWatchlistQueryKey(code) });
    queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
  }, [code, addIcaoMutation, queryClient]);

  // Bulk add (paste of many ICAOs at once) — one request for the whole
  // paste, same rationale as the personal watchlist's addIcaos().
  const addWatchlistIcaos = useCallback(async (icaos: string[]) => {
    if (!code || icaos.length === 0) return;
    await addIcaosBulkMutation.mutateAsync({ code, data: { icaos: icaos.map((c) => c.toUpperCase()) } });
    queryClient.invalidateQueries({ queryKey: getGetTeamWatchlistQueryKey(code) });
    queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
  }, [code, addIcaosBulkMutation, queryClient]);

  const removeWatchlistIcao = useCallback(async (icao: string) => {
    if (!code) return;
    await removeIcaoMutation.mutateAsync({ code, icao: icao.toUpperCase() });
    queryClient.invalidateQueries({ queryKey: getGetTeamWatchlistQueryKey(code) });
  }, [code, removeIcaoMutation, queryClient]);

  const addNote = useCallback(async (body: string, replyToId?: number | null) => {
    const trimmed = body.trim();
    if (!code || !trimmed) return;
    await addNoteMutation.mutateAsync({ code, data: { body: trimmed, replyToId: replyToId ?? undefined } });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
    queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
  }, [code, addNoteMutation, queryClient]);

  const editNote = useCallback(async (id: number, body: string) => {
    const trimmed = body.trim();
    if (!code || !trimmed) return;
    await updateNoteMutation.mutateAsync({ code, id, data: { body: trimmed } });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
  }, [code, updateNoteMutation, queryClient]);

  const deleteNote = useCallback(async (id: number) => {
    if (!code) return;
    await deleteNoteMutation.mutateAsync({ code, id });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
  }, [code, deleteNoteMutation, queryClient]);

  // Any team member may pin/unpin (not just the author) — see routes/teams.ts.
  const pinNote = useCallback(async (id: number, pinned: boolean) => {
    if (!code) return;
    await pinNoteMutation.mutateAsync({ code, id, data: { pinned } });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
  }, [code, pinNoteMutation, queryClient]);

  const kickMember = useCallback(async (deviceIdToKick: string) => {
    if (!code) return;
    await kickMemberMutation.mutateAsync({ code, deviceId: deviceIdToKick });
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(code) });
    queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
  }, [code, kickMemberMutation, queryClient]);

  const transferOwnership = useCallback(async (targetDeviceId: string) => {
    if (!code) return { ok: false, error: "Not in a team" };
    try {
      await transferOwnershipMutation.mutateAsync({ code, data: { deviceId: targetDeviceId } });
      queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(code) });
      queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not transfer ownership" };
    }
  }, [code, transferOwnershipMutation, queryClient]);

  const renameTeam = useCallback(async (name: string) => {
    if (!code) return;
    await renameTeamMutation.mutateAsync({ code, data: { name } });
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(code) });
    queryClient.invalidateQueries({ queryKey: getGetTeamActivityQueryKey(code) });
  }, [code, renameTeamMutation, queryClient]);

  const addReaction = useCallback(async (noteId: number, emoji: string) => {
    if (!code) return;
    await addReactionMutation.mutateAsync({ code, id: noteId, data: { emoji } });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
  }, [code, addReactionMutation, queryClient]);

  const removeReaction = useCallback(async (noteId: number, emoji: string) => {
    if (!code) return;
    await removeReactionMutation.mutateAsync({ code, id: noteId, emoji });
    queryClient.invalidateQueries({ queryKey: getGetTeamNotesQueryKey(code) });
  }, [code, removeReactionMutation, queryClient]);

  // Fire-and-forget, throttled client-side (see notifyTyping below) so a
  // whole burst of keystrokes doesn't turn into a request per keystroke.
  const lastTypingPingRef = useRef(0);
  const notifyTyping = useCallback(() => {
    if (!code) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 2_000) return;
    lastTypingPingRef.current = now;
    void sendTypingMutation.mutateAsync({ code });
  }, [code, sendTypingMutation]);

  // Unread chat badge: counts messages from OTHER devices posted after the
  // highest note id this device has viewed, persisted per-team so it
  // survives reloads. Cleared by markChatRead() when the chat panel opens.
  const [lastReadId, setLastReadIdState] = useState<number>(() => (code ? loadLastReadId(code) : 0));
  useEffect(() => {
    setLastReadIdState(code ? loadLastReadId(code) : 0);
  }, [code]);
  const unreadChatCount = useMemo(() => {
    const notesData = notesQuery.data ?? [];
    return notesData.filter((n) => n.id > lastReadId && n.deviceId !== deviceId).length;
  }, [notesQuery.data, lastReadId, deviceId]);
  const markChatRead = useCallback(() => {
    if (!code) return;
    const notesData = notesQuery.data ?? [];
    const maxId = notesData.reduce((m, n) => Math.max(m, n.id), 0);
    if (maxId > lastReadId) {
      saveLastReadId(code, maxId);
      setLastReadIdState(maxId);
      // Also advance the server-side read cursor that powers "seen by" on
      // other members' bubbles — separate from the local unread-badge
      // bookkeeping above, which only this device ever reads.
      void markReadMutation.mutateAsync({ code, data: { lastReadNoteId: maxId } });
    }
  }, [code, notesQuery.data, lastReadId, markReadMutation]);

  // Notify teammates (sound + toast) when a new note appears that wasn't
  // posted by this device — skips the first load (so an existing note
  // history doesn't all fire at once on join) and resets its baseline
  // whenever the active team changes.
  const seenNoteIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    seenNoteIdsRef.current = null;
  }, [code]);
  useEffect(() => {
    const notesData = notesQuery.data;
    if (!notesData) return;
    if (seenNoteIdsRef.current === null) {
      seenNoteIdsRef.current = new Set(notesData.map((n) => n.id));
      return;
    }
    const fresh = notesData.filter((n) => !seenNoteIdsRef.current!.has(n.id) && n.deviceId !== deviceId);
    if (fresh.length > 0) {
      playNoteSound();
      for (const n of fresh) {
        toast({ title: `New note from ${n.nickname || "a teammate"}`, description: n.body });
      }
    }
    seenNoteIdsRef.current = new Set(notesData.map((n) => n.id));
  }, [notesQuery.data, deviceId, playNoteSound]);

  const members = teamQuery.data?.members ?? [];
  const selfMember = members.find((m) => m.deviceId === deviceId) ?? null;

  const value: TeamContextValue = {
    code,
    nickname,
    avatar,
    isInTeam: !!code,
    team: teamQuery.data ? { code: teamQuery.data.code, teamId: teamQuery.data.teamId, name: teamQuery.data.name } : null,
    members,
    selfMember,
    isLoadingTeam: !!code && teamQuery.isLoading,
    teamError: !!code && teamQuery.isError,
    watchlist: watchlistQuery.data ?? [],
    notes: notesQuery.data ?? [],
    activity: activityQuery.data ?? [],
    leaderboard: leaderboardQuery.data ?? [],
    createTeam,
    joinTeam,
    leaveTeam,
    regenerateCode,
    updateProfile,
    addWatchlistIcao,
    addWatchlistIcaos,
    removeWatchlistIcao,
    addNote,
    editNote,
    deleteNote,
    pinNote,
    unreadChatCount,
    markChatRead,
    isOwner: selfMember?.role === "owner",
    kickMember,
    transferOwnership,
    renameTeam,
    addReaction,
    removeReaction,
    typingNicknames: typingQuery.data?.nicknames ?? [],
    notifyTyping,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
