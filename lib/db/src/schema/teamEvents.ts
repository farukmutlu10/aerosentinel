import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

// Audit/system-message log: joins, leaves, kicks, ownership transfers,
// renames. Powers both the Activity tab and the chat's inline system messages.
export const teamEventsTable = pgTable("team_events", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id"),
  nickname: text("nickname"),
  type: text("type").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamEvent = typeof teamEventsTable.$inferSelect;
