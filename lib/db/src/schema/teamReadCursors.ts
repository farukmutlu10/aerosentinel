import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

// One row per (team, device): "this device has seen every note up through
// last_read_note_id" — cheap to compute "seen by" per message (>= comparison)
// without a row-per-message read-receipt table.
export const teamReadCursorsTable = pgTable("team_read_cursors", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  lastReadNoteId: integer("last_read_note_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  teamDeviceUnique: unique("team_read_cursors_team_device_unique").on(table.teamId, table.deviceId),
}));

export type TeamReadCursor = typeof teamReadCursorsTable.$inferSelect;
