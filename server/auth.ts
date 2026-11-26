import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import pg from "pg";
import { credentialsSchema, type User } from "@shared/schema";
import { storage } from "./storage";

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, n: number) => Promise<Buffer>;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}
async function verifyPassword(pw: string, stored: string) {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface User { id: string; username: string } }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Not signed in" });
}

export function setupAuth(app: Express) {
  const prod = process.env.NODE_ENV === "production";
  const secret = process.env.SESSION_SECRET;
  if (prod && !secret) throw new Error("SESSION_SECRET must be set in production");

  let store: session.Store;
  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    store = new PgStore({
      pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }),
      createTableIfMissing: true,
    });
  } else {
    store = new (createMemoryStore(session))({ checkPeriod: 86400000 });
  }

  if (prod) app.set("trust proxy", 1);
  app.use(session({
    secret: secret || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { httpOnly: true, sameSite: "lax", secure: prod, maxAge: 1000 * 60 * 60 * 24 * 14 },
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const u = await storage.getUserByUsername(username);
      if (!u || !(await verifyPassword(password, u.password))) return done(null, false);
      return done(null, { id: u.id, username: u.username });
    } catch (e) { return done(e); }
  }));
  passport.serializeUser((u, done) => done(null, (u as User).id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const u = await storage.getUser(id);
      done(null, u ? { id: u.id, username: u.username } : false);
    } catch (e) { done(e); }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Username 3+ chars and password 8+ chars required" });
    if (process.env.ALLOW_REGISTRATION === "false") return res.status(403).json({ message: "Registration is closed" });
    if (await storage.getUserByUsername(parsed.data.username)) return res.status(409).json({ message: "Username taken" });
    const u = await storage.createUser({ username: parsed.data.username, password: await hashPassword(parsed.data.password) });
    req.login({ id: u.id, username: u.username }, (err) => err ? next(err) : res.status(201).json({ id: u.id, username: u.username }));
  });
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => res.json(req.user));
  app.post("/api/auth/logout", (req, res, next) => req.logout((e) => e ? next(e) : res.json({ ok: true })));
  app.get("/api/auth/me", (req, res) => req.isAuthenticated() ? res.json(req.user) : res.status(401).json({ message: "Not signed in" }));
}
