import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  icao: text("icao").notNull().unique(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WatchlistEntry = typeof watchlistTable.$inferSelect;
