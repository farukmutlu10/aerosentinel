import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("legacy"),
  icao: text("icao").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIcaoUnique: unique("watchlist_user_icao_unique").on(table.userId, table.icao),
}));

export type WatchlistEntry = typeof watchlistTable.$inferSelect;
