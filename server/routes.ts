import type { Express, Request, Response } from "express";
import type { Server } from "http";
import type { ZodType } from "zod";
import {
  patientInputSchema, patientUpdateSchema, snapshotInputSchema, planInputSchema, settingsInputSchema,
} from "@shared/schema";
import { storage, usingDatabase } from "./storage";
import { setupAuth, requireAuth } from "./auth";

function parse<T>(schema: ZodType<T, any, any>, req: Request, res: Response): T | undefined {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    res.status(400).json({ message: "Invalid data", issues: r.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    return undefined;
  }
  return r.data;
}
const uid = (req: Request) => (req.user as { id: string }).id;
const idParam = (req: Request) => String(req.params.id);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true, database: usingDatabase }));
  setupAuth(app);

  app.get("/api/patients", requireAuth, async (req, res) => res.json(await storage.listPatients(uid(req))));
  app.get("/api/patients/:id", requireAuth, async (req, res) => {
    const p = await storage.getPatient(uid(req), idParam(req));
    p ? res.json(p) : res.status(404).json({ message: "Not found" });
  });
  app.post("/api/patients", requireAuth, async (req, res) => {
    const d = parse(patientInputSchema, req, res); if (!d) return;
    res.status(201).json(await storage.createPatient(uid(req), d));
  });
  app.patch("/api/patients/:id", requireAuth, async (req, res) => {
    const d = parse(patientUpdateSchema, req, res); if (!d) return;
    const p = await storage.updatePatient(uid(req), idParam(req), d);
    p ? res.json(p) : res.status(404).json({ message: "Not found" });
  });
  app.delete("/api/patients/:id", requireAuth, async (req, res) => {
    (await storage.deletePatient(uid(req), idParam(req))) ? res.json({ ok: true }) : res.status(404).json({ message: "Not found" });
  });

  app.get("/api/snapshots", requireAuth, async (req, res) => res.json(await storage.listSnapshots(uid(req))));
  app.post("/api/snapshots", requireAuth, async (req, res) => {
    const d = parse(snapshotInputSchema, req, res); if (!d) return;
    res.status(201).json(await storage.createSnapshot(uid(req), d));
  });
  app.delete("/api/snapshots/:id", requireAuth, async (req, res) => {
    (await storage.deleteSnapshot(uid(req), idParam(req))) ? res.json({ ok: true }) : res.status(404).json({ message: "Not found" });
  });

  app.get("/api/plans", requireAuth, async (req, res) => res.json(await storage.listPlans(uid(req))));
  app.post("/api/plans", requireAuth, async (req, res) => {
    const d = parse(planInputSchema, req, res); if (!d) return;
    res.status(201).json(await storage.createPlan(uid(req), d));
  });
  app.delete("/api/plans/:id", requireAuth, async (req, res) => {
    (await storage.deletePlan(uid(req), idParam(req))) ? res.json({ ok: true }) : res.status(404).json({ message: "Not found" });
  });

  app.get("/api/settings", requireAuth, async (req, res) => res.json(await storage.getSettings(uid(req))));
  app.put("/api/settings", requireAuth, async (req, res) => {
    const d = parse(settingsInputSchema, req, res); if (!d) return;
    res.json(await storage.saveSettings(uid(req), d));
  });

  // One-time import of data the old localStorage version kept in the browser.
  app.post("/api/import-local", requireAuth, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    let patients = 0, plans = 0, snaps = 0;
    for (const raw of Array.isArray(b.patients) ? b.patients : []) {
      const r = patientInputSchema.safeParse({ ...raw, harmony: Number(raw?.harmony) || 0 });
      if (r.success) { await storage.createPatient(uid(req), r.data); patients++; }
    }
    for (const raw of Array.isArray(b.plans) ? b.plans : []) {
      const r = planInputSchema.safeParse({ ...raw, harmony: Number(raw?.harmony) || 0 });
      if (r.success) { await storage.createPlan(uid(req), r.data); plans++; }
    }
    for (const raw of Array.isArray(b.snapshots) ? b.snapshots : []) {
      const r = snapshotInputSchema.safeParse({ image: raw?.image, analysis: raw?.analysis ?? {} });
      if (r.success) { await storage.createSnapshot(uid(req), r.data); snaps++; }
    }
    if (b.settings && typeof b.settings === "object") await storage.saveSettings(uid(req), b.settings as Record<string, unknown>);
    res.json({ imported: { patients, plans, snapshots: snaps } });
  });

  return httpServer;
}
