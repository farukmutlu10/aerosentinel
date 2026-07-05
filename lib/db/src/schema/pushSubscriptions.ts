import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("legacy"),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  endpointUnique: unique("push_sub_endpoint_unique").on(table.endpoint),
}));

export type PushSubscriptionEntry = typeof pushSubscriptionsTable.$inferSelect;
