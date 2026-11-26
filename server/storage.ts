import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { users, userData, type User, type InsertUser } from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllData(userId: string): Promise<Record<string, unknown>>;
  putData(userId: string, key: string, value: unknown): Promise<void>;
  deleteData(userId: string, key: string): Promise<void>;
}

/** Postgres storage. Every query is scoped by userId. */
export class PgStorage implements IStorage {
  private db;
  constructor(url: string) {
    this.db = drizzle(new pg.Pool({ connectionString: url, max: 10 }));
  }
  async getUser(id: string) { return (await this.db.select().from(users).where(eq(users.id, id)))[0]; }
  async getUserByUsername(name: string) { return (await this.db.select().from(users).where(eq(users.username, name)))[0]; }
  async createUser(u: InsertUser) { return (await this.db.insert(users).values(u).returning())[0]; }
  async getAllData(userId: string) {
    const rows = await this.db.select().from(userData).where(eq(userData.userId, userId));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  async putData(userId: string, key: string, value: unknown) {
    await this.db.insert(userData).values({ userId, key, value: value as any })
      .onConflictDoUpdate({ target: [userData.userId, userData.key], set: { value: value as any, updatedAt: new Date() } });
  }
  async deleteData(userId: string, key: string) {
    await this.db.delete(userData).where(and(eq(userData.userId, userId), eq(userData.key, key)));
  }
}

/** In-memory fallback for local dev without a database. Data is lost on restart. */
export class MemStorage implements IStorage {
  private u = new Map<string, User>();
  private d = new Map<string, Map<string, unknown>>();
  async getUser(id: string) { return this.u.get(id); }
  async getUserByUsername(name: string) { return Array.from(this.u.values()).find((x) => x.username === name); }
  async createUser(i: InsertUser) { const user = { ...i, id: randomUUID() }; this.u.set(user.id, user); return user; }
  async getAllData(uid: string) { return Object.fromEntries(this.d.get(uid) ?? []); }
  async putData(uid: string, key: string, value: unknown) {
    if (!this.d.has(uid)) this.d.set(uid, new Map());
    this.d.get(uid)!.set(key, value);
  }
  async deleteData(uid: string, key: string) { this.d.get(uid)?.delete(key); }
}

export const storage: IStorage = process.env.DATABASE_URL ? new PgStorage(process.env.DATABASE_URL) : new MemStorage();
export const usingDatabase = Boolean(process.env.DATABASE_URL);
