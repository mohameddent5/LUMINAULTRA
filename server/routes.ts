import type { Express } from "express";
import type { Server } from "http";
import { SYNCED_KEYS } from "@shared/schema";
import { storage, usingDatabase } from "./storage";
import { setupAuth, requireAuth } from "./auth";

const allowed = new Set<string>(SYNCED_KEYS);
const uid = (req: any) => (req.user as { id: string }).id;

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true, database: usingDatabase }));
  setupAuth(app);

  // All synced collections for the signed-in user.
  app.get("/api/data", requireAuth, async (req, res) => res.json(await storage.getAllData(uid(req))));

  app.put("/api/data/:key", requireAuth, async (req, res) => {
    const key = String(req.params.key);
    if (!allowed.has(key)) return res.status(400).json({ message: "Unknown data key" });
    if (req.body === undefined || req.body === null || typeof req.body !== "object") {
      return res.status(400).json({ message: "JSON object or array required" });
    }
    await storage.putData(uid(req), key, req.body);
    res.json({ ok: true });
  });

  app.delete("/api/data/:key", requireAuth, async (req, res) => {
    const key = String(req.params.key);
    if (!allowed.has(key)) return res.status(400).json({ message: "Unknown data key" });
    await storage.deleteData(uid(req), key);
    res.json({ ok: true });
  });

  return httpServer;
}
