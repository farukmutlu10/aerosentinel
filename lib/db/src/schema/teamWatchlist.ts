import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

export const teamWatchlistTable = pgTable("team_watchlist", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  icao: text("icao").notNull(),
  addedByDeviceId: text("added_by_device_id"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  teamIcaoUnique: unique("team_watchlist_team_icao_unique").on(table.teamId, table.icao),
}));

export type TeamWatchlistEntry = typeof teamWatchlistTable.$inferSelect;
