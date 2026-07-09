import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { alertsTable } from "./alerts";

// One row per (alertId, deviceId) — acknowledgement is tracked per device,
// never as a single shared flag on the alert row, so one person hitting ACK
// never silently acks it for anyone else.
export const alertAcksTable = pgTable("alert_acks", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").notNull().references(() => alertsTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  nickname: text("nickname"),
  ackedAt: timestamp("acked_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqAlertDevice: unique().on(t.alertId, t.deviceId),
}));

export type AlertAck = typeof alertAcksTable.$inferSelect;
