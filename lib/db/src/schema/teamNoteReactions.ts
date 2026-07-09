import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teamNotesTable } from "./teamNotes";

export const teamNoteReactionsTable = pgTable("team_note_reactions", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => teamNotesTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  noteDeviceEmojiUnique: unique("team_note_reactions_unique").on(table.noteId, table.deviceId, table.emoji),
}));

export type TeamNoteReaction = typeof teamNoteReactionsTable.$inferSelect;
