import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, real, jsonb, timestamp, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// One row per patient analysis (replaces localStorage "patientArchive").
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patientName: text("patient_name").notNull(),
  harmony: real("harmony").notNull().default(0),
  measurements: jsonb("measurements").$type<Record<string, number>>().notNull().default({}),
  notes: text("notes").notNull().default(""),
  clinicalNotes: text("clinical_notes"),
  visitHistory: jsonb("visit_history")
    .$type<{ date: string; harmony: number; notes: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("patients_user_idx").on(t.userId) }));

// Captured scanner snapshots (replaces "capturedSnapshots"). Image is a JPEG data URL for now;
// move to object storage before large-scale use.
export const snapshots = pgTable("snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").references(() => patients.id, { onDelete: "set null" }),
  image: text("image").notNull(),
  analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("snapshots_user_idx").on(t.userId) }));

// Treatment plans (replaces "treatmentPlans").
export const treatmentPlans = pgTable("treatment_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").references(() => patients.id, { onDelete: "set null" }),
  measurements: jsonb("measurements").$type<Record<string, number>>().notNull().default({}),
  harmony: real("harmony").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("plans_user_idx").on(t.userId) }));

// Clinic settings, one row per user (replaces "clinicSettings").
export const clinicSettings = pgTable("clinic_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(200),
});

export const patientInputSchema = z.object({
  patientName: z.string().trim().min(1).max(200),
  harmony: z.number().min(0).max(100).default(0),
  measurements: z.record(z.string(), z.number()).default({}),
  notes: z.string().max(20000).default(""),
  clinicalNotes: z.string().max(20000).nullish(),
  visitHistory: z.array(z.object({
    date: z.string(), harmony: z.number(), notes: z.string(),
  })).default([]),
});
export const patientUpdateSchema = patientInputSchema.partial();

export const snapshotInputSchema = z.object({
  patientId: z.string().nullish(),
  image: z.string().max(8_000_000),
  analysis: z.record(z.string(), z.unknown()).default({}),
});
export const planInputSchema = z.object({
  patientId: z.string().nullish(),
  measurements: z.record(z.string(), z.number()).default({}),
  harmony: z.number().min(0).max(100).default(0),
});
export const settingsInputSchema = z.record(z.string(), z.unknown());

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type PatientInput = z.infer<typeof patientInputSchema>;
export type Snapshot = typeof snapshots.$inferSelect;
export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type TreatmentPlan = typeof treatmentPlans.$inferSelect;
export type PlanInput = z.infer<typeof planInputSchema>;
