import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  nickname: text("nickname"),
  // Either "preset:<id>" (one of the built-in aviation/weather avatar icons)
  // or a small base64 data: URL for a custom-uploaded image.
  avatar: text("avatar"),
  // "owner" (the team's creator — exactly one per team) or "member". Owner-only
  // actions (regenerate code, rename, kick) are enforced server-side in routes/teams.ts.
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  teamDeviceUnique: unique("team_members_team_device_unique").on(table.teamId, table.deviceId),
}));

export type TeamMember = typeof teamMembersTable.$inferSelect;
