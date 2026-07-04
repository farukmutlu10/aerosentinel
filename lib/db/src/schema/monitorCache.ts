import { pgTable, varchar, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const monitorCacheTable = pgTable("monitor_cache", {
  icao: varchar("icao", { length: 10 }).notNull(),
  dataType: varchar("data_type", { length: 10 }).notNull(),
  rawText: text("raw_text").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.icao, t.dataType] }),
]);
