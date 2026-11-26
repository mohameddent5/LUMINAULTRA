import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

/**
 * Per-user documents. The v1.0 app keeps its records as JSON collections under fixed keys
 * (patientArchive, capturedSnapshots, treatmentPlans, clinicSettings). The server stores the
 * same collections per user so they survive cache clears and follow the user across devices.
 * Move to row-per-record tables when multi-user/clinic sharing is needed.
 */
export const userData = pgTable("user_data", {
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }));

/** Keys the server will store. care-journey keys are deliberately local-only (privacy design). */
export const SYNCED_KEYS = ["patientArchive", "capturedSnapshots", "treatmentPlans", "clinicSettings"] as const;
export type SyncedKey = (typeof SYNCED_KEYS)[number];

export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(200),
});

export type InsertUser = { username: string; password: string };
export type User = typeof users.$inferSelect;
