import { pgTable, serial, integer, text, timestamp, boolean, type AnyPgColumn } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

export const teamNotesTable = pgTable("team_notes", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  nickname: text("nickname"),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  // Quoted-reply target — nullable self-reference, cleared (not cascaded) if
  // the quoted note is deleted so the reply itself survives.
  replyToId: integer("reply_to_id").references((): AnyPgColumn => teamNotesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamNote = typeof teamNotesTable.$inferSelect;
