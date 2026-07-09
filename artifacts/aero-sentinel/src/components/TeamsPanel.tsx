import { useState, useRef, useEffect, useCallback, type ChangeEvent } from "react";
import {
  Users, Copy, LogOut, RefreshCw, Check, Upload, Pencil, Link2, ChevronDown, ChevronUp, Plus, MessageSquare, Trophy,
  Crown, UserMinus, UserPlus, PencilLine, Search, X,
} from "lucide-react";
import { useTeam } from "@/context/TeamContext";
import { normalizeIcao } from "@/lib/icaoUtils";
import { iataToIcao } from "@/lib/iataMap";
import { AVATAR_PRESETS, TeamAvatarView, presetAvatarValue, resizeImageToAvatarDataUrl } from "@/lib/teamAvatars";
import { BetaBadge } from "@/components/BetaBadge";
import { useDraggableEdgeButton, BUTTON_SIZE } from "@/hooks/useDraggableEdgeButton";
import { ChatDialog } from "@/components/TeamChatPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";

const PRESENCE_ONLINE_WINDOW_MS = 5 * 60_000;
const MIN_NAME_LENGTH = 3;

function isOnline(lastSeenAt: string): boolean {
  return Date.now() - new Date(lastSeenAt).getTime() < PRESENCE_ONLINE_WINDOW_MS;
}

/** Forces uppercase A-Z and spaces only, matching what the backend accepts for nicknames/team names. */
function toUppercaseName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z ]/g, "");
}

function buildInviteLink(code: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, "/");
  return `${base}?team=${code}`;
}

// ── Avatar picker ────────────────────────────────────────────────────────
function AvatarPicker({ value, onChange }: { value: string; onChange: (avatar: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploadError(null);
      const dataUrl = await resizeImageToAvatarDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not use that image");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <TeamAvatarView avatar={value} size={48} />
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_PRESETS.map((preset) => {
            const presetValue = presetAvatarValue(preset.id);
            const selected = value === presetValue;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                onClick={() => onChange(presetValue)}
                className="rounded-full transition-transform hover:scale-110"
                style={{ outline: selected ? `2px solid ${preset.color}` : "none", outlineOffset: 2 }}
              >
                <TeamAvatarView avatar={presetValue} size={28} />
              </button>
            );
          })}
          <button
            type="button"
            title="Upload photo"
            onClick={() => fileInputRef.current?.click()}
            className="w-7 h-7 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            <Upload size={13} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
        </div>
      </div>
      {uploadError && <p className="text-[11px] text-destructive">{uploadError}</p>}
    </div>
  );
}

// ── Not-in-a-team: create/join flows ────────────────────────────────────────
function TeamOnboarding({ initialJoinCode }: { initialJoinCode?: string | null }) {
  const { createTeam, joinTeam, avatar: currentAvatar } = useTeam();
  const [mode, setMode] = useState<"create" | "join">(initialJoinCode ? "join" : "create");
  const [nickname, setNickname] = useState("");
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? "");
  const [avatar, setAvatar] = useState(currentAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nicknameValid = nickname.trim().length >= MIN_NAME_LENGTH;
  const teamNameValid = teamName.trim().length >= MIN_NAME_LENGTH;
  const codeValid = joinCode.trim().length === 4;
  const canSubmit = mode === "create" ? nicknameValid && teamNameValid : nicknameValid && codeValid;

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createTeam(nickname, teamName, avatar);
    } catch {
      setError("Could not create the team. Give it another shot.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError(null);
    const result = await joinTeam(joinCode, nickname, avatar);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not join that team.");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => { setMode("create"); setError(null); }}
          className={`flex-1 py-2 rounded-md text-sm font-mono font-bold tracking-wider transition-colors ${
            mode === "create" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          CREATE TEAM
        </button>
        <button
          onClick={() => { setMode("join"); setError(null); }}
          className={`flex-1 py-2 rounded-md text-sm font-mono font-bold tracking-wider transition-colors ${
            mode === "join" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          JOIN TEAM
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-mono text-muted-foreground">Avatar</label>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        <div>
          <label className="text-xs font-mono text-muted-foreground">Callsign</label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(toUppercaseName(e.target.value))}
            placeholder="MAVERICK"
            maxLength={40}
            className="font-mono uppercase"
          />
          {!nicknameValid && nickname.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">At least {MIN_NAME_LENGTH} letters.</p>
          )}
        </div>

        {mode === "create" ? (
          <div>
            <label className="text-xs font-mono text-muted-foreground">Team name</label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(toUppercaseName(e.target.value))}
              placeholder="NIGHT OWLS"
              maxLength={60}
              className="font-mono uppercase"
            />
            {!teamNameValid && teamName.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">At least {MIN_NAME_LENGTH} letters.</p>
            )}
          </div>
        ) : (
          <div>
            <label className="text-xs font-mono text-muted-foreground">Team code</label>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="AB12"
              maxLength={4}
              className="font-mono text-lg tracking-[0.3em] text-center uppercase"
            />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button className="w-full" disabled={busy || !canSubmit} onClick={mode === "create" ? handleCreate : handleJoin}>
          {busy ? "Working on it..." : mode === "create" ? "Create Team" : "Join Team"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        No account needed. Anyone with the code can see and edit this team's watchlist, notes, and alert acknowledgements.
      </p>
    </div>
  );
}

// ── In a team: shared dashboard ─────────────────────────────────────────────
function TeamDashboard() {
  const {
    team, code, nickname, avatar, members, selfMember, isOwner, watchlist, activity, leaderboard, teamError,
    leaveTeam, regenerateCode, renameTeam, kickMember, transferOwnership, updateProfile,
    addWatchlistIcao, addWatchlistIcaos, removeWatchlistIcao,
  } = useTeam();
  const [icaoInput, setIcaoInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftNickname, setDraftNickname] = useState(nickname);
  const [draftAvatar, setDraftAvatar] = useState(avatar);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(team?.name ?? "");
  const [activitySearch, setActivitySearch] = useState("");

  // An owner with other members present must transfer ownership before they
  // can leave (see routes/teams.ts) — a team must never end up ownerless
  // while people are still in it.
  const otherMembers = members.filter((m) => m.deviceId !== selfMember?.deviceId);
  const ownerMustTransferFirst = isOwner && otherMembers.length > 0;

  const saveTeamName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length < MIN_NAME_LENGTH) return;
    void renameTeam(trimmed);
    setEditingName(false);
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const handleCopyLink = () => {
    if (!code) return;
    navigator.clipboard?.writeText(buildInviteLink(code)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    }).catch(() => {});
  };

  // Same paste rules as the personal watchlist: comma/space separated,
  // 4-letter ICAOs pass through, 3-letter codes resolve via the IATA map,
  // and the whole paste goes out as a single bulk request.
  const handleAddIcaos = () => {
    const codes = icaoInput.split(/[,\s]+/).filter(Boolean);
    const toAdd: string[] = [];
    codes.forEach((c) => {
      const raw = normalizeIcao(c);
      if (raw.length === 4) toAdd.push(raw);
      else if (raw.length === 3) {
        const resolved = iataToIcao(raw);
        if (resolved) toAdd.push(resolved);
      }
    });
    if (toAdd.length === 1) void addWatchlistIcao(toAdd[0]);
    else if (toAdd.length > 1) void addWatchlistIcaos(toAdd);
    setIcaoInput("");
  };

  const nicknameValid = draftNickname.trim().length >= MIN_NAME_LENGTH;

  const saveProfile = () => {
    if (!nicknameValid) return;
    void updateProfile({ nickname: draftNickname, avatar: draftAvatar });
    setEditingProfile(false);
  };

  if (teamError) {
    return (
      <div className="text-center space-y-4 py-4">
        <p className="text-sm text-muted-foreground">
          This code stopped working. A teammate may have rotated it, or the team no longer exists.
        </p>
        <Button variant="outline" onClick={() => void leaveTeam()}>Leave Team</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team header */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {editingName ? (
              <div className="flex items-center gap-1.5 mb-1">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(toUppercaseName(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTeamName(); }}
                  maxLength={60}
                  className="font-mono uppercase h-7 text-xs"
                />
                <button onClick={saveTeamName} className="text-emerald-500 hover:opacity-80"><Check size={14} /></button>
                <button onClick={() => { setEditingName(false); setDraftName(team?.name ?? ""); }} className="text-muted-foreground hover:opacity-80"><X size={14} /></button>
              </div>
            ) : (
              <p className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1.5">
                {team?.name || "Team Code"}
                {isOwner && (
                  <button onClick={() => { setDraftName(team?.name ?? ""); setEditingName(true); }} title="Rename team" className="hover:text-foreground">
                    <PencilLine size={11} />
                  </button>
                )}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-[0.3em]">{code}</span>
              <button onClick={handleCopy} title="Copy code" className="p-1.5 rounded hover:bg-muted transition-colors">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
              <button onClick={handleCopyLink} title="Copy invite link" className="p-1.5 rounded hover:bg-muted transition-colors">
                {linkCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />New Code</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rotate the code?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The old code and invite link stop working immediately. Anyone who hasn't seen the new one loses access.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Never mind</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void regenerateCode()}>Rotate</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {ownerMustTransferFirst ? (
              <Button variant="outline" size="sm" disabled title="Make another member the owner before you can leave">
                <LogOut className="h-3.5 w-3.5 mr-1.5" />Leave
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"><LogOut className="h-3.5 w-3.5 mr-1.5" />Leave</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave this team?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll stop seeing the shared watchlist and switch back to your own.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Never mind</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void leaveTeam()}>Leave</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        {ownerMustTransferFirst && (
          <p className="text-[11px] text-muted-foreground mt-2">
            You're the owner — make someone else owner (crown icon below) before you can leave.
          </p>
        )}

        {/* Own profile row */}
        <div className="mt-3 pt-3 border-t border-border/60">
          {editingProfile ? (
            <div className="space-y-2">
              <AvatarPicker value={draftAvatar} onChange={setDraftAvatar} />
              <Input
                value={draftNickname}
                onChange={(e) => setDraftNickname(toUppercaseName(e.target.value))}
                placeholder="MAVERICK"
                maxLength={40}
                className="font-mono uppercase"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={!nicknameValid} onClick={saveProfile}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingProfile(false); setDraftNickname(nickname); setDraftAvatar(avatar); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingProfile(true)}
              className="flex items-center gap-2 text-sm font-mono hover:opacity-80 transition-opacity"
            >
              <TeamAvatarView avatar={selfMember?.avatar ?? avatar} size={24} />
              <span>{selfMember?.nickname || nickname}</span>
              <Pencil size={11} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Team members */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-mono tracking-wider flex items-center gap-2 mb-2">
              <Users className="h-4 w-4" /> TEAM ({members.length})
            </p>
            <div className="space-y-1.5">
              {members.map((m) => {
                const isSelf = m.deviceId === selfMember?.deviceId;
                return (
                  <div key={m.deviceId} className="flex items-center gap-2 text-sm">
                    <TeamAvatarView avatar={m.avatar} size={22} />
                    <span className="font-mono">{m.nickname || "Unnamed pilot"}</span>
                    {m.role === "owner" && (
                      <span title="Owner" className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.5 rounded" style={{ color: "#d4a843", backgroundColor: "hsl(var(--primary) / 0.12)" }}>
                        <Crown size={9} /> OWNER
                      </span>
                    )}
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isOnline(m.lastSeenAt) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {isOnline(m.lastSeenAt) ? "online" : `${formatDistanceToNow(new Date(m.lastSeenAt))} ago`}
                    </span>
                    {isOwner && !isSelf && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button title="Make owner" className="text-muted-foreground hover:text-foreground p-0.5"><UserPlus size={13} /></button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Make {m.nickname || "this pilot"} the owner?</AlertDialogTitle>
                              <AlertDialogDescription>
                                You'll become a regular member. Only the new owner can rotate the code, rename the team, or remove members afterward.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Never mind</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void transferOwnership(m.deviceId)}>Transfer</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button title="Remove from team" className="text-muted-foreground hover:text-destructive p-0.5"><UserMinus size={13} /></button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {m.nickname || "this pilot"}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                They'll lose access to this team's shared watchlist, chat, and code immediately.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Never mind</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void kickMember(m.deviceId)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })}
              {members.length === 0 && <p className="text-xs text-muted-foreground">Flying solo so far.</p>}
            </div>
          </div>

          {/* Shared watchlist */}
          <div className="rounded-lg border border-border bg-card p-4">
            <button
              onClick={() => setWatchlistOpen((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-mono tracking-wider mb-2"
            >
              <span>SHARED WATCHLIST {watchlist.length > 0 ? `(${watchlist.length})` : ""}</span>
              {watchlistOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <div className="flex gap-2">
              <Input
                value={icaoInput}
                onChange={(e) => setIcaoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddIcaos(); }}
                placeholder="LTFH, KJFK, EGLL..."
                className="font-mono flex-1 min-w-0"
              />
              <Button onClick={handleAddIcaos} className="flex-shrink-0">Add</Button>
            </div>
            {watchlistOpen && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {watchlist.map((icao) => (
                  <span key={icao} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs font-mono">
                    {icao}
                    <button onClick={() => void removeWatchlistIcao(icao)} className="text-muted-foreground hover:text-destructive">×</button>
                  </span>
                ))}
                {watchlist.length === 0 && <p className="text-xs text-muted-foreground">No airports yet. Drop some in above.</p>}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search activity..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {activity
                .filter((item) => {
                  if (!activitySearch.trim()) return true;
                  const q = activitySearch.trim().toLowerCase();
                  return (item.nickname ?? "").toLowerCase().includes(q) || item.detail.toLowerCase().includes(q);
                })
                .map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5">
                    {item.type === "watchlist_add" && <Plus className="h-3.5 w-3.5 text-emerald-500" />}
                    {item.type === "note" && <MessageSquare className="h-3.5 w-3.5 text-sky-400" />}
                    {item.type === "alert_ack" && <Check className="h-3.5 w-3.5 text-amber-400" />}
                    {item.type === "member_joined" && <UserPlus className="h-3.5 w-3.5 text-emerald-500" />}
                    {item.type === "member_left" && <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />}
                    {item.type === "member_kicked" && <UserMinus className="h-3.5 w-3.5 text-destructive" />}
                    {item.type === "ownership_transferred" && <Crown className="h-3.5 w-3.5" style={{ color: "#d4a843" }} />}
                    {item.type === "team_renamed" && <PencilLine className="h-3.5 w-3.5 text-sky-400" />}
                  </span>
                  <p className="flex-1 min-w-0 text-muted-foreground">
                    <span className="font-mono font-bold text-foreground">{item.nickname || "Unnamed pilot"}</span>
                    {item.type === "watchlist_add" && <> added <span className="font-mono">{item.detail}</span> to the watchlist</>}
                    {item.type === "note" && <> left a note: {item.detail}</>}
                    {item.type === "alert_ack" && <> acknowledged <span className="font-mono">{item.detail}</span></>}
                    {item.type === "member_joined" && <> joined the team</>}
                    {item.type === "member_left" && <> left the team</>}
                    {item.type === "member_kicked" && <> was removed{item.detail ? ` by ${item.detail}` : ""}</>}
                    {item.type === "ownership_transferred" && <> is now the owner</>}
                    {item.type === "team_renamed" && <> renamed the team to <span className="font-mono">{item.detail}</span></>}
                  </p>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">{formatDistanceToNow(new Date(item.at))} ago</span>
                </div>
              ))}
              {activity.length === 0 && <p className="text-xs text-muted-foreground">Nothing has happened yet.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-3">Fastest average acknowledgement time this week (last 7 days).</p>
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={entry.deviceId} className={`flex items-center gap-2.5 text-sm rounded-md px-2 py-1.5 ${entry.deviceId === selfMember?.deviceId ? "bg-muted" : ""}`}>
                  <span className="w-4 text-xs font-mono text-muted-foreground flex-shrink-0">
                    {i === 0 ? <Trophy className="h-3.5 w-3.5 text-[#d4a843]" /> : `#${i + 1}`}
                  </span>
                  <TeamAvatarView avatar={entry.avatar} size={22} />
                  <span className="font-mono truncate">{entry.nickname || "Unnamed pilot"}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground flex-shrink-0">
                    {formatAckDuration(entry.avgSeconds)} avg · {entry.ackCount} ack{entry.ackCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-xs text-muted-foreground">No acknowledgements yet this week. First one on the board wins.</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatAckDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

// ── Draggable floating button ───────────────────────────────────────────────
// Gold circle matching the mobile "add to watchlist" FAB's frame (see
// Dashboard.tsx), with a violet icon + label so it reads as its own feature
// rather than another watchlist action.
export const VIOLET = "#6d28d9";

// One shared hide/peek arrow, reused for both circles in the merged group —
// pressing either arrow hides the whole group (they're wired to the same
// togglePeek), matching the "hide/show together" requirement.
function PeekArrow({ edge, togglePeek }: { edge: "left" | "right"; togglePeek: (e: React.PointerEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      title="Hide"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={togglePeek}
      className="absolute flex items-center justify-center w-4 h-4 rounded-full border-2 z-10"
      style={{
        top: "50%", [edge === "right" ? "left" : "right"]: -6, transform: "translateY(-50%)",
        backgroundColor: "#d4a843", borderColor: "#1a1405",
      } as React.CSSProperties}
    >
      {edge === "right"
        ? <ChevronDown className="h-2.5 w-2.5 rotate-90" style={{ color: VIOLET }} strokeWidth={3} />
        : <ChevronDown className="h-2.5 w-2.5 -rotate-90" style={{ color: VIOLET }} strokeWidth={3} />}
    </button>
  );
}

// ── Merged Teams+Chat floating buttons ──────────────────────────────────────
// Two circles sharing ONE drag/peek/position state (a single
// useDraggableEdgeButton instance) so they dock to the same edge, move
// together when dragged, and hide/reveal together when peeked — visually
// they're two stacked, touching circles (no gap) rather than a single pill,
// matching the reference design. Each circle still opens its own dialog on a
// plain click/tap; `data-role` on each tells the shared pointer-up handler
// which one was pressed.
function DraggableTeamChatButtons({
  isInTeam, unread, onOpenTeam, onOpenChat,
}: { isInTeam: boolean; unread: number; onOpenTeam: () => void; onOpenChat: () => void }) {
  const showChat = isInTeam;
  const groupHeight = showChat ? BUTTON_SIZE * 2 : BUTTON_SIZE;
  const { edge, y, peeked, left, handlePointerDown, handlePointerMove, handlePointerUp, togglePeek, unpeek } =
    useDraggableEdgeButton(
      "aero-team-chat-btn",
      window.innerHeight / 2 - BUTTON_SIZE,
      (role) => (role === "chat" ? onOpenChat() : onOpenTeam()),
      { height: groupHeight },
    );

  return (
    <div
      onPointerDown={peeked ? undefined : handlePointerDown}
      onPointerMove={peeked ? undefined : handlePointerMove}
      onPointerUp={peeked ? undefined : handlePointerUp}
      onClick={peeked ? unpeek : undefined}
      className={`fixed z-40 flex flex-col select-none cursor-pointer ${peeked ? "" : "transition-[left] duration-150"}`}
      style={{ left, top: y, width: BUTTON_SIZE, height: groupHeight, touchAction: "none" }}
    >
      <div
        role="button"
        tabIndex={0}
        data-role="team"
        title="Team"
        className="relative rounded-full shadow-lg flex flex-col items-center justify-center gap-0.5"
        style={{ width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: "#d4a843", boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}
      >
        <Users size={18} color={VIOLET} strokeWidth={2.5} />
        <span className="text-[8px] font-mono font-bold tracking-widest" style={{ color: VIOLET }}>TEAMS</span>
        {isInTeam && (
          <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-violet-600 border-2 border-background" />
        )}
        {!peeked && <PeekArrow edge={edge} togglePeek={togglePeek} />}
      </div>

      {showChat && (
        <div
          role="button"
          tabIndex={0}
          data-role="chat"
          title="Team Chat"
          className="relative rounded-full shadow-lg flex flex-col items-center justify-center gap-0.5"
          style={{ width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: "#d4a843", boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}
        >
          <MessageSquare size={18} color={VIOLET} strokeWidth={2.5} />
          <span className="text-[8px] font-mono font-bold tracking-widest" style={{ color: VIOLET }}>CHAT</span>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold flex items-center justify-center border-2 border-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          {!peeked && <PeekArrow edge={edge} togglePeek={togglePeek} />}
        </div>
      )}
    </div>
  );
}

// ── Floating button + popup ─────────────────────────────────────────────────
export function TeamsPanel() {
  const { isInTeam, unreadChatCount } = useTeam();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [prefillCode, setPrefillCode] = useState<string | null>(null);

  useEffect(() => {
    if (isInTeam) return;
    const params = new URLSearchParams(window.location.search);
    const teamParam = params.get("team");
    if (teamParam && teamParam.trim().length === 4) {
      setPrefillCode(teamParam.trim().toUpperCase());
      setOpen(true);
      params.delete("team");
      const search = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (search ? `?${search}` : "") + window.location.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DraggableTeamChatButtons
          isInTeam={isInTeam}
          unread={unreadChatCount}
          onOpenTeam={() => setOpen(true)}
          onOpenChat={() => setChatOpen(true)}
        />
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono tracking-wider flex items-center gap-2">
              {isInTeam ? "TEAM PANEL" : "SHIFT TEAM"}
              <BetaBadge />
            </DialogTitle>
          </DialogHeader>
          {isInTeam ? <TeamDashboard /> : <TeamOnboarding initialJoinCode={prefillCode} />}
        </DialogContent>
      </Dialog>
      {isInTeam && <ChatDialog open={chatOpen} onOpenChange={setChatOpen} />}
    </>
  );
}
