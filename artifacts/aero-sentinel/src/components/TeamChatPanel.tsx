import { useState, useEffect, useRef, useMemo, type KeyboardEvent, type ChangeEvent } from "react";
import { Pencil, Trash2, Check, X, Pin, PinOff, Reply, SmilePlus, Search, UserPlus, UserMinus, Crown, PencilLine } from "lucide-react";
import { useTeam } from "@/context/TeamContext";
import { getDeviceId } from "@/lib/deviceId";
import { TeamAvatarView } from "@/lib/teamAvatars";
import { BetaBadge } from "@/components/BetaBadge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import type { TeamNote } from "@workspace/api-client-react";

const REACTION_EMOJI = ["👍", "✈️", "⚠️", "👀", "✅", "❤️"];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits a message body on "@NICKNAME" tokens (matching current members) and bolds them. */
function renderBodyWithMentions(body: string, memberNicknames: string[], isOwn: boolean) {
  const names = [...new Set(memberNicknames.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return body;
  const re = new RegExp(`(@(?:${names.map(escapeRegex).join("|")}))\\b`, "gi");
  const parts = body.split(re);
  if (parts.length === 1) return body;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <span key={i} className="font-bold" style={{ textDecoration: "underline", textDecorationColor: isOwn ? "currentColor" : "hsl(var(--primary))", color: isOwn ? "inherit" : "hsl(var(--primary))" }}>{part}</span>
      : <span key={i}>{part}</span>,
  );
}

function systemEventText(type: string, nickname: string | null, detail: string): string | null {
  const who = nickname || "Someone";
  switch (type) {
    case "member_joined": return `${who} joined the team`;
    case "member_left": return `${who} left the team`;
    case "member_kicked": return `${who} was removed${detail ? ` by ${detail}` : ""}`;
    case "ownership_transferred": return `${who} is now the owner`;
    case "team_renamed": return `${who} renamed the team to "${detail}"`;
    default: return null;
  }
}

type StreamItem =
  | { kind: "note"; at: string; note: TeamNote }
  | { kind: "system"; at: string; text: string; icon: "join" | "leave" | "owner" | "rename" };

// iMessage-style bubbles, restyled onto the site's own palette (--primary
// gold for own messages, --muted for teammates') rather than iOS blue/grey —
// "premium" here means the bubble shapes/spacing/pinned-strip treatment, not
// literally copying Apple's colors.
export function ChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const {
    notes, members, activity, isOwner, addNote, editNote, deleteNote, pinNote, markChatRead,
    addReaction, removeReaction, typingNicknames, notifyTyping,
  } = useTeam();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; nickname: string | null; body: string } | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [mentionMenu, setMentionMenu] = useState<{ query: string; start: number } | null>(null);
  const deviceId = getDeviceId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const avatarByDevice = useMemo(() => new Map(members.map((m) => [m.deviceId, m.avatar])), [members]);
  const memberNicknames = useMemo(() => members.map((m) => m.nickname).filter((n): n is string => !!n), [members]);

  useEffect(() => {
    if (open) markChatRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notes.length]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, notes.length]);

  // Merge the team-events system messages (join/leave/kick/transfer/rename)
  // into the note stream, sorted purely by timestamp — these have no note id
  // to interleave by, unlike regular messages.
  const stream = useMemo<StreamItem[]>(() => {
    const noteItems: StreamItem[] = notes.map((n) => ({ kind: "note", at: n.createdAt, note: n }));
    const systemItems: StreamItem[] = activity
      .filter((a) => ["member_joined", "member_left", "member_kicked", "ownership_transferred", "team_renamed"].includes(a.type))
      .map((a) => {
        const text = systemEventText(a.type, a.nickname, a.detail);
        const icon: "join" | "leave" | "owner" | "rename" =
          a.type === "member_joined" ? "join" : a.type === "ownership_transferred" ? "owner" : a.type === "team_renamed" ? "rename" : "leave";
        return text ? { kind: "system" as const, at: a.at, text, icon } : null;
      })
      .filter((x): x is Extract<StreamItem, { kind: "system" }> => x !== null);
    const merged = [...noteItems, ...systemItems].sort((a, b) => a.at.localeCompare(b.at));
    if (!search.trim()) return merged;
    const q = search.trim().toLowerCase();
    return merged.filter((item) =>
      item.kind === "system"
        ? item.text.toLowerCase().includes(q)
        : item.note.body.toLowerCase().includes(q) || (item.note.nickname ?? "").toLowerCase().includes(q),
    );
  }, [notes, activity, search]);

  const pinned = notes.filter((n) => n.pinned);

  // "Seen by" only renders on the single most recent own message that has
  // any readers — like iMessage, not a running tally on every bubble.
  const lastSeenOwnNoteId = useMemo(() => {
    const ownWithReaders = notes.filter((n) => n.deviceId === deviceId && n.seenBy.length > 0);
    return ownWithReaders.length > 0 ? Math.max(...ownWithReaders.map((n) => n.id)) : null;
  }, [notes, deviceId]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    void addNote(input, replyTo?.id ?? null);
    setInput("");
    setReplyTo(null);
    setMentionMenu(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu && (e.key === "Escape")) { setMentionMenu(null); return; }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    notifyTyping();

    // @mention trigger: look backwards from the cursor for an "@" that isn't
    // already part of a completed token (no whitespace between it and the cursor).
    const cursor = e.target.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, cursor);
    const at = uptoCursor.lastIndexOf("@");
    if (at !== -1 && !/\s/.test(uptoCursor.slice(at + 1))) {
      setMentionMenu({ query: uptoCursor.slice(at + 1), start: at });
    } else {
      setMentionMenu(null);
    }
  };

  const applyMention = (nickname: string) => {
    if (!mentionMenu) return;
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionMenu.start);
    const after = input.slice(cursor);
    const next = `${before}@${nickname} ${after}`;
    setInput(next);
    setMentionMenu(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const mentionSuggestions = mentionMenu
    ? [...new Set(memberNicknames)].filter((n) => n.toLowerCase().startsWith(mentionMenu.query.toLowerCase())).slice(0, 5)
    : [];

  const startEdit = (id: number, body: string) => {
    setEditingId(id);
    setEditDraft(body);
  };

  const saveEdit = () => {
    if (editingId === null || !editDraft.trim()) return;
    void editNote(editingId, editDraft);
    setEditingId(null);
  };

  const toggleReaction = (note: TeamNote, emoji: string) => {
    const already = note.reactions.find((r) => r.emoji === emoji)?.deviceIds.includes(deviceId);
    if (already) void removeReaction(note.id, emoji);
    else void addReaction(note.id, emoji);
    setReactionPickerFor(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border space-y-2">
          <DialogTitle className="font-mono tracking-wider flex items-center gap-2">
            TEAM CHAT
            <BetaBadge />
          </DialogTitle>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </DialogHeader>

        {/* Pinned strip — visually distinct from the message stream below:
            a compact list of cards (not bubbles) with a filled pin icon,
            so a pinned note never reads as "just another message". */}
        {pinned.length > 0 && !search.trim() && (
          <div
            className="flex-shrink-0 px-3 pt-2.5 pb-2 space-y-1.5 border-b border-border"
            style={{ backgroundColor: "hsl(var(--primary) / 0.06)" }}
          >
            {pinned.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5"
                style={{ backgroundColor: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}
              >
                <Pin size={12} className="mt-0.5 flex-shrink-0 fill-current" style={{ color: "hsl(var(--primary))" }} />
                <p className="flex-1 min-w-0">
                  <span className="font-mono font-bold" style={{ color: "hsl(var(--primary))" }}>{n.nickname || "Unnamed pilot"}</span>{" "}
                  <span className="text-foreground/80">{n.body}</span>
                </p>
                <button onClick={() => void pinNote(n.id, false)} title="Unpin" className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <PinOff size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-[240px] px-3 py-3 space-y-2.5" style={{ backgroundColor: "hsl(var(--background))" }}>
          {stream.map((item, i) => {
            if (item.kind === "system") {
              const Icon = item.icon === "join" ? UserPlus : item.icon === "owner" ? Crown : item.icon === "rename" ? PencilLine : UserMinus;
              return (
                <div key={`sys-${i}`} className="flex items-center justify-center gap-1.5 py-1">
                  <Icon size={11} className="text-muted-foreground/70" />
                  <span className="text-[11px] text-muted-foreground/70 font-mono">{item.text}</span>
                </div>
              );
            }

            const n = item.note;
            const isOwn = n.deviceId === deviceId;
            const isEditing = editingId === n.id;
            const prevItem = stream[i - 1];
            const prevNote = prevItem?.kind === "note" ? prevItem.note : null;
            // Group consecutive messages from the same sender the way iMessage
            // does: only the first bubble in a run gets the name/avatar.
            const sameSenderAsPrev = prevNote?.deviceId === n.deviceId;
            const canDelete = isOwn || isOwner;

            return (
              <div key={n.id} className={`group flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                <div className="w-[22px] flex-shrink-0">
                  {!isOwn && !sameSenderAsPrev && <TeamAvatarView avatar={avatarByDevice.get(n.deviceId) ?? null} size={22} />}
                </div>
                <div className={`flex flex-col max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                  {!isOwn && !sameSenderAsPrev && (
                    <span className="text-[11px] font-mono font-bold text-muted-foreground mb-0.5 px-1">{n.nickname || "Unnamed pilot"}</span>
                  )}
                  {isEditing ? (
                    <div className="flex items-start gap-1.5 w-full">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
                        maxLength={500}
                        rows={2}
                        className="text-sm flex-1"
                      />
                      <div className="flex flex-col gap-1 pt-0.5">
                        <button onClick={saveEdit} title="Save" className="text-emerald-500 hover:opacity-80"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} title="Cancel" className="text-muted-foreground hover:opacity-80"><X size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        className={`relative px-3 py-2 text-sm break-words shadow-sm ${
                          isOwn ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"
                        }`}
                        style={isOwn
                          ? { backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                          : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                      >
                        {n.replyTo && (
                          <div
                            className="mb-1.5 pl-2 border-l-2 text-xs opacity-80 truncate max-w-[220px]"
                            style={{ borderColor: isOwn ? "hsl(var(--primary-foreground) / 0.5)" : "hsl(var(--primary))" }}
                          >
                            <span className="font-bold">{n.replyTo.nickname || "Unnamed pilot"}</span>{" "}
                            <span>{n.replyTo.body}</span>
                          </div>
                        )}
                        {n.pinned && <Pin size={10} className="inline-block mr-1 mb-0.5 fill-current opacity-70" />}
                        {renderBodyWithMentions(n.body, memberNicknames, isOwn)}
                      </div>

                      {/* Reaction pills — below the bubble, toggle on click */}
                      {n.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                          {n.reactions.map((r) => {
                            const mine = r.deviceIds.includes(deviceId);
                            return (
                              <button
                                key={r.emoji}
                                onClick={() => toggleReaction(n, r.emoji)}
                                className="text-[11px] rounded-full px-1.5 py-0.5 border flex items-center gap-0.5"
                                style={mine
                                  ? { backgroundColor: "hsl(var(--primary) / 0.18)", borderColor: "hsl(var(--primary) / 0.5)" }
                                  : { backgroundColor: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}
                              >
                                <span>{r.emoji}</span><span className="font-mono">{r.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Reaction picker popover */}
                      {reactionPickerFor === n.id && (
                        <div
                          className={`absolute z-10 top-full mt-1 flex gap-1 rounded-full border bg-popover px-2 py-1 shadow-lg ${isOwn ? "right-0" : "left-0"}`}
                          style={{ borderColor: "hsl(var(--border))" }}
                          onMouseLeave={() => setReactionPickerFor(null)}
                        >
                          {REACTION_EMOJI.map((emoji) => (
                            <button key={emoji} onClick={() => toggleReaction(n, emoji)} className="text-base hover:scale-125 transition-transform">
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {lastSeenOwnNoteId === n.id && (
                    <div className="flex items-center gap-1 mt-0.5 px-1">
                      <span className="flex -space-x-1">
                        {n.seenBy.slice(0, 3).map((id) => <TeamAvatarView key={id} avatar={avatarByDevice.get(id) ?? null} size={12} />)}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono">Seen</span>
                    </div>
                  )}

                  <div className={`flex items-center gap-2 mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-[10px] text-muted-foreground font-mono">{formatDistanceToNow(new Date(n.createdAt))} ago</span>
                    <button onClick={() => setReactionPickerFor(reactionPickerFor === n.id ? null : n.id)} title="React" className="text-muted-foreground hover:text-foreground">
                      <SmilePlus size={11} />
                    </button>
                    <button onClick={() => setReplyTo({ id: n.id, nickname: n.nickname, body: n.body })} title="Reply" className="text-muted-foreground hover:text-foreground">
                      <Reply size={11} />
                    </button>
                    <button onClick={() => void pinNote(n.id, !n.pinned)} title={n.pinned ? "Unpin" : "Pin"} className="text-muted-foreground hover:text-foreground">
                      {n.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                    </button>
                    {isOwn && !isEditing && (
                      <button onClick={() => startEdit(n.id, n.body)} title="Edit" className="text-muted-foreground hover:text-foreground">
                        <Pencil size={11} />
                      </button>
                    )}
                    {canDelete && !isEditing && (
                      <button onClick={() => void deleteNote(n.id)} title={isOwn ? "Delete" : "Delete (owner)"} className="text-muted-foreground hover:text-destructive">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {stream.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {search.trim() ? "No messages match your search." : "No messages yet. Say hello to your team."}
            </p>
          )}
        </div>

        {typingNicknames.length > 0 && (
          <div className="px-4 pb-1 text-[11px] text-muted-foreground font-mono italic flex-shrink-0">
            {typingNicknames.join(", ")} {typingNicknames.length === 1 ? "is" : "are"} typing…
          </div>
        )}

        <div className="flex-shrink-0 border-t border-border p-3 space-y-2">
          {replyTo && (
            <div className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: "hsl(var(--muted))" }}>
              <Reply size={12} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
              <p className="flex-1 min-w-0 truncate">
                <span className="font-bold">{replyTo.nickname || "Unnamed pilot"}</span>{" "}
                <span className="text-muted-foreground">{replyTo.body}</span>
              </p>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X size={12} /></button>
            </div>
          )}
          <div className="relative">
            {mentionMenu && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full mb-1 left-0 right-0 rounded-lg border bg-popover shadow-lg overflow-hidden z-10" style={{ borderColor: "hsl(var(--border))" }}>
                {mentionSuggestions.map((n) => (
                  <button
                    key={n}
                    onClick={() => applyMention(n)}
                    className="w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-muted transition-colors"
                  >
                    @{n}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message the team... (@ to mention)"
              maxLength={500}
              rows={2}
              className="text-sm rounded-2xl"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
