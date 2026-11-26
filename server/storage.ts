import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, patients, snapshots, treatmentPlans, clinicSettings,
  type User, type InsertUser, type Patient, type PatientInput,
  type Snapshot, type SnapshotInput, type TreatmentPlan, type PlanInput,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  listPatients(userId: string): Promise<Patient[]>;
  getPatient(userId: string, id: string): Promise<Patient | undefined>;
  createPatient(userId: string, p: PatientInput): Promise<Patient>;
  updatePatient(userId: string, id: string, p: Partial<PatientInput>): Promise<Patient | undefined>;
  deletePatient(userId: string, id: string): Promise<boolean>;

  listSnapshots(userId: string): Promise<Snapshot[]>;
  createSnapshot(userId: string, s: SnapshotInput): Promise<Snapshot>;
  deleteSnapshot(userId: string, id: string): Promise<boolean>;

  listPlans(userId: string): Promise<TreatmentPlan[]>;
  createPlan(userId: string, p: PlanInput): Promise<TreatmentPlan>;
  deletePlan(userId: string, id: string): Promise<boolean>;

  getSettings(userId: string): Promise<Record<string, unknown>>;
  saveSettings(userId: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Postgres-backed storage. Every query is scoped by userId so clinics never see each other's data. */
export class PgStorage implements IStorage {
  private db;
  constructor(url: string) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    this.db = drizzle(pool);
  }
  async getUser(id: string) {
    return (await this.db.select().from(users).where(eq(users.id, id)))[0];
  }
  async getUserByUsername(username: string) {
    return (await this.db.select().from(users).where(eq(users.username, username)))[0];
  }
  async createUser(u: InsertUser) {
    return (await this.db.insert(users).values(u).returning())[0];
  }
  async listPatients(userId: string) {
    return this.db.select().from(patients).where(eq(patients.userId, userId)).orderBy(desc(patients.createdAt));
  }
  async getPatient(userId: string, id: string) {
    return (await this.db.select().from(patients).where(and(eq(patients.id, id), eq(patients.userId, userId))))[0];
  }
  async createPatient(userId: string, p: PatientInput) {
    return (await this.db.insert(patients).values({ ...p, clinicalNotes: p.clinicalNotes ?? null, userId }).returning())[0];
  }
  async updatePatient(userId: string, id: string, p: Partial<PatientInput>) {
    const rows = await this.db.update(patients)
      .set({ ...p, updatedAt: new Date() })
      .where(and(eq(patients.id, id), eq(patients.userId, userId))).returning();
    return rows[0];
  }
  async deletePatient(userId: string, id: string) {
    return (await this.db.delete(patients).where(and(eq(patients.id, id), eq(patients.userId, userId))).returning()).length > 0;
  }
  async listSnapshots(userId: string) {
    return this.db.select().from(snapshots).where(eq(snapshots.userId, userId)).orderBy(desc(snapshots.createdAt));
  }
  async createSnapshot(userId: string, s: SnapshotInput) {
    return (await this.db.insert(snapshots).values({ ...s, patientId: s.patientId ?? null, userId }).returning())[0];
  }
  async deleteSnapshot(userId: string, id: string) {
    return (await this.db.delete(snapshots).where(and(eq(snapshots.id, id), eq(snapshots.userId, userId))).returning()).length > 0;
  }
  async listPlans(userId: string) {
    return this.db.select().from(treatmentPlans).where(eq(treatmentPlans.userId, userId)).orderBy(desc(treatmentPlans.createdAt));
  }
  async createPlan(userId: string, p: PlanInput) {
    return (await this.db.insert(treatmentPlans).values({ ...p, patientId: p.patientId ?? null, userId }).returning())[0];
  }
  async deletePlan(userId: string, id: string) {
    return (await this.db.delete(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.userId, userId))).returning()).length > 0;
  }
  async getSettings(userId: string) {
    const r = (await this.db.select().from(clinicSettings).where(eq(clinicSettings.userId, userId)))[0];
    return r?.data ?? {};
  }
  async saveSettings(userId: string, data: Record<string, unknown>) {
    await this.db.insert(clinicSettings).values({ userId, data })
      .onConflictDoUpdate({ target: clinicSettings.userId, set: { data, updatedAt: new Date() } });
    return data;
  }
}

/** In-memory fallback for local dev without a database. Data is lost on restart. */
export class MemStorage implements IStorage {
  private u = new Map<string, User>();
  private p = new Map<string, Patient>();
  private s = new Map<string, Snapshot>();
  private t = new Map<string, TreatmentPlan>();
  private cfg = new Map<string, Record<string, unknown>>();

  async getUser(id: string) { return this.u.get(id); }
  async getUserByUsername(name: string) { return Array.from(this.u.values()).find((x) => x.username === name); }
  async createUser(i: InsertUser) { const user = { ...i, id: randomUUID() }; this.u.set(user.id, user); return user; }

  async listPatients(uid: string) { return Array.from(this.p.values()).filter((x) => x.userId === uid).reverse(); }
  async getPatient(uid: string, id: string) { const x = this.p.get(id); return x?.userId === uid ? x : undefined; }
  async createPatient(uid: string, i: PatientInput) {
    const now = new Date();
    const row: Patient = { id: randomUUID(), userId: uid, ...i, clinicalNotes: i.clinicalNotes ?? null, createdAt: now, updatedAt: now };
    this.p.set(row.id, row); return row;
  }
  async updatePatient(uid: string, id: string, i: Partial<PatientInput>) {
    const cur = await this.getPatient(uid, id); if (!cur) return undefined;
    const row = { ...cur, ...i, clinicalNotes: i.clinicalNotes === undefined ? cur.clinicalNotes : i.clinicalNotes ?? null, updatedAt: new Date() } as Patient;
    this.p.set(id, row); return row;
  }
  async deletePatient(uid: string, id: string) { return (await this.getPatient(uid, id)) ? this.p.delete(id) : false; }

  async listSnapshots(uid: string) { return Array.from(this.s.values()).filter((x) => x.userId === uid).reverse(); }
  async createSnapshot(uid: string, i: SnapshotInput) {
    const row: Snapshot = { id: randomUUID(), userId: uid, patientId: i.patientId ?? null, image: i.image, analysis: i.analysis, createdAt: new Date() };
    this.s.set(row.id, row); return row;
  }
  async deleteSnapshot(uid: string, id: string) { const x = this.s.get(id); return x?.userId === uid ? this.s.delete(id) : false; }

  async listPlans(uid: string) { return Array.from(this.t.values()).filter((x) => x.userId === uid).reverse(); }
  async createPlan(uid: string, i: PlanInput) {
    const row: TreatmentPlan = { id: randomUUID(), userId: uid, patientId: i.patientId ?? null, measurements: i.measurements, harmony: i.harmony, createdAt: new Date() };
    this.t.set(row.id, row); return row;
  }
  async deletePlan(uid: string, id: string) { const x = this.t.get(id); return x?.userId === uid ? this.t.delete(id) : false; }

  async getSettings(uid: string) { return this.cfg.get(uid) ?? {}; }
  async saveSettings(uid: string, d: Record<string, unknown>) { this.cfg.set(uid, d); return d; }
}

export const storage: IStorage = process.env.DATABASE_URL
  ? new PgStorage(process.env.DATABASE_URL)
  : new MemStorage();
export const usingDatabase = Boolean(process.env.DATABASE_URL);
