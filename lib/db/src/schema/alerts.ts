import { pgTable, serial, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertTypeEnum = pgEnum("alert_type", ["TAF_AMD", "TAF_COR", "SPECI"]);

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: alertTypeEnum("type").notNull(),
  icao: text("icao").notNull(),
  rawText: text("raw_text").notNull(),
  previousRawText: text("previous_raw_text"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, detectedAt: true, acknowledged: true, acknowledgedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
