import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByDeviceId: text("created_by_device_id").notNull(),
});

export type Team = typeof teamsTable.$inferSelect;
