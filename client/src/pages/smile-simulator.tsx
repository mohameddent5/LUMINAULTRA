import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Download,
  ImagePlus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ types */

type MetricKey = "wlRatio" | "goldenRatio" | "gingivalSym" | "convexity" | "vdo";
type MetricState = Record<MetricKey, number>;

interface CapturedSnapshot {
  id: number;
  date: string;
  time: string;
  image: string;
  analysis?: unknown;
}

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  ideal: number;
  help: string;
}

/* ------------------------------------------------------------------ config */

const METRICS: readonly MetricDef[] = [
  {
    key: "wlRatio",
    label: "Central incisor W/L",
    unit: "%",
    min: 50,
    max: 100,
    step: 0.5,
    ideal: 78,
    help: "Width-to-length proportion of the central incisor. Target ≈ 78 %.",
  },
  {
    key: "goldenRatio",
    label: "Golden proportion",
    unit: "%",
    min: 40,
    max: 90,
    step: 0.5,
    ideal: 62,
    help: "Apparent lateral-to-central incisor width. Target ≈ 62 %.",
  },
  {
    key: "gingivalSym",
    label: "Gingival symmetry",
    unit: "%",
    min: 30,
    max: 100,
    step: 1,
    ideal: 90,
    help: "Agreement of gingival zenith heights left to right. Target ≥ 90 %.",
  },
  {
    key: "convexity",
    label: "Smile convexity",
    unit: "",
    min: 30,
    max: 100,
    step: 1,
    ideal: 75,
    help: "Curvature of the incisal plane against the commissure line. Target ≈ 75.",
  },
  {
    key: "vdo",
    label: "VDO / display",
    unit: "%",
    min: 20,
    max: 80,
    step: 0.5,
    ideal: 45,
    help: "Vertical dimension of occlusion as a share of lower-face height. Target ≈ 45 %.",
  },
] as const;

const IDEAL: MetricState = {
  wlRatio: 78,
  goldenRatio: 62,
  gingivalSym: 90,
  convexity: 75,
  vdo: 45,
};

/** Starting point used when a photo carries no measurements (manual simulation). */
const MANUAL_START: MetricState = {
  wlRatio: 66,
  goldenRatio: 51,
  gingivalSym: 62,
  convexity: 58,
  vdo: 56,
};

const KEYS = METRICS.map((m) => m.key);

/* ------------------------------------------------------------------ helpers */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const round = (v: number, digits = 0) => (isNum(v) ? v.toFixed(digits) : "n/a");

/** Aliases seen across scanner releases; the first finite value wins. */
const ALIASES: Record<MetricKey, readonly string[]> = {
  wlRatio: ["centralIncisorsWLRatio", "centralIncisorWLRatio", "wlRatio", "widthLengthRatio"],
  goldenRatio: ["goldenRatioLateral", "goldenRatio", "goldenProportion"],
  gingivalSym: ["gingivalSymmetry", "gingivalSym", "zenithSymmetry"],
  convexity: ["smileConvexityScore", "smileConvexity", "convexity"],
  vdo: ["verticalDimensionRatio", "vdoRatio", "vdo"],
};

/** Keyword fallbacks for the `metrics[]` array shape used by DsdReport. */
const LABEL_HINTS: Record<MetricKey, readonly string[]> = {
  wlRatio: ["width/length", "width to length", "w/l"],
  goldenRatio: ["golden"],
  gingivalSym: ["gingival", "zenith"],
  convexity: ["convexity", "smile line", "incisal plane"],
  vdo: ["vdo", "vertical dimension"],
};

function readFromBag(source: unknown): Partial<MetricState> {
  const out: Partial<MetricState> = {};
  if (!source || typeof source !== "object") return out;
  const bag = source as Record<string, unknown>;
  for (const key of KEYS) {
    for (const alias of ALIASES[key]) {
      const value = bag[alias];
      if (isNum(value)) {
        out[key] = value;
        break;
      }
    }
  }
  return out;
}

function readFromMetricsArray(source: unknown): Partial<MetricState> {
  const out: Partial<MetricState> = {};
  if (!source || typeof source !== "object") return out;
  const list = (source as { metrics?: unknown }).metrics;
  if (!Array.isArray(list)) return out;

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const metric = entry as { id?: unknown; label?: unknown; value?: unknown };
    if (!isNum(metric.value)) continue;
    const label = `${metric.id ?? ""} ${metric.label ?? ""}`.toLowerCase();

    for (const key of KEYS) {
      if (out[key] !== undefined) continue;
      const hit = ALIASES[key].some((a) => label.includes(a.toLowerCase()))
        || LABEL_HINTS[key].some((h) => label.includes(h));
      if (hit) {
        out[key] = metric.value;
        break;
      }
    }
  }
  return out;
}

/** Best-effort extraction from any snapshot shape; never throws. */
function metricsFromAnalysis(analysis: unknown): Partial<MetricState> {
  const bag = readFromBag(analysis);
  const bagged = readFromBag(
    analysis && typeof analysis === "object"
      ? (analysis as { measurements?: unknown }).measurements
      : undefined,
  );
  const fromArray = readFromMetricsArray(analysis);
  return { ...fromArray, ...bag, ...bagged };
}

function harmonyOf(state: MetricState): number {
  const deviations = METRICS.map((m) => Math.abs(state[m.key] - m.ideal) / m.ideal);
  const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  return clamp(100 - mean * 100, 0, 100);
}

function gradeOf(score: number): { label: string; className: string } {
  if (score >= 85) return { label: "Harmonious", className: "bg-emerald-900/60 text-emerald-300" };
  if (score >= 70) return { label: "Acceptable", className: "bg-amber-900/60 text-amber-300" };
  return { label: "Needs treatment", className: "bg-red-900/60 text-red-300" };
}

function loadSnapshots(): CapturedSnapshot[] {
  try {
    const raw = JSON.parse(localStorage.getItem("capturedSnapshots") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s): s is CapturedSnapshot =>
        !!s && typeof s === "object" && typeof (s as CapturedSnapshot).image === "string",
    );
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ page */

export default function SmileSimulator() {
  const [, navigate] = useLocation();
  const [snapshots, setSnapshots] = useState<CapturedSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [measured, setMeasured] = useState(false);
  const [baseline, setBaseline] = useState<MetricState>(MANUAL_START);
  const [state, setState] = useState<MetricState>(MANUAL_START);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Load stored captures once. Bad data must not blank the page. */
  useEffect(() => {
    const saved = loadSnapshots();
    setSnapshots(saved);
    const last = saved[saved.length - 1];
    if (!last) return;

    const extracted = metricsFromAnalysis(last.analysis);
    const next: MetricState = { ...MANUAL_START };
    for (const key of KEYS) {
      const value = extracted[key];
      if (isNum(value)) next[key] = value;
    }
    setSelectedId(last.id);
    setPhoto(last.image);
    setMeasured(Object.keys(extracted).length > 0);
    setBaseline(next);
    setState(next);
  }, []);

  const applySnapshot = (snap: CapturedSnapshot) => {
    const extracted = metricsFromAnalysis(snap.analysis);
    const next: MetricState = { ...MANUAL_START };
    for (const key of KEYS) {
      const value = extracted[key];
      if (isNum(value)) next[key] = value;
    }
    setSelectedId(snap.id);
    setPhoto(snap.image);
    setMeasured(Object.keys(extracted).length > 0);
    setBaseline(next);
    setState(next);
  };

  const readFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Not an image",
        description: "Choose a JPG, PNG or HEIC photo of a smile.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) {
        toast({ variant: "destructive", title: "Could not read that file" });
        return;
      }
      setPhoto(dataUrl);
      setSelectedId(null);
      setMeasured(false);
      setBaseline(MANUAL_START);
      setState(MANUAL_START);
      toast({
        title: "Photo loaded",
        description: "Set the baseline values, then move the sliders to simulate the outcome.",
      });
    };
    reader.onerror = () =>
      toast({ variant: "destructive", title: "Could not read that file", description: "Try another image." });
    reader.readAsDataURL(file);
  };

  const deleteSnapshot = (id: number) => {
    const updated = snapshots.filter((s) => s.id !== id);
    setSnapshots(updated);
    try {
      localStorage.setItem("capturedSnapshots", JSON.stringify(updated));
    } catch {
      /* storage full — the in-memory list still updates */
    }
    if (selectedId === id) {
      const next = updated[updated.length - 1];
      if (next) applySnapshot(next);
      else {
        setSelectedId(null);
        setPhoto(null);
        setMeasured(false);
        setBaseline(MANUAL_START);
        setState(MANUAL_START);
      }
    }
    toast({ title: "Snapshot deleted" });
  };

  const baseScore = harmonyOf(baseline);
  const simulatedScore = harmonyOf(state);
  const gain = simulatedScore - baseScore;

  /** Visual response to slider movement — the "after" panel really changes. */
  const preview = useMemo(() => {
    const dWl = (state.wlRatio - baseline.wlRatio) / 100;
    const dGolden = (state.goldenRatio - baseline.goldenRatio) / 100;
    const dGing = (state.gingivalSym - baseline.gingivalSym) / 100;
    const dVdo = (state.vdo - baseline.vdo) / 100;

    return {
      scaleX: clamp(1 + dWl * 1.15, 0.82, 1.24),
      scaleY: clamp(1 + dVdo * 0.85, 0.84, 1.2),
      brightness: clamp(1 + dGolden * 0.85, 0.86, 1.22),
      saturate: clamp(1 + dGolden * 0.3, 0.94, 1.1),
      gum: clamp(0.26 - dGing * 0.55, 0.02, 0.5),
      changed: Math.abs(dWl) + Math.abs(dGolden) + Math.abs(dGing) + Math.abs(dVdo) > 0.004,
    };
  }, [state, baseline]);

  const downloadComparison = () => {
    if (!photo) return;
    const img = new Image();
    img.onload = () => {
      const W = 1240;
      const H = 660;
      const pad = 26;
      const panelW = (W - pad * 3) / 2;
      const panelH = H - 150;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast({ variant: "destructive", title: "Export not available in this browser" });
        return;
      }

      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, W, H);

      const drawPanel = (x: number, simulated: boolean) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 92, panelW, panelH);
        ctx.clip();
        ctx.fillStyle = "#111827";
        ctx.fillRect(x, 92, panelW, panelH);
        if (simulated) {
          ctx.filter = `brightness(${preview.brightness}) saturate(${preview.saturate})`;
          ctx.translate(x + panelW / 2, 92 + panelH / 2);
          ctx.scale(preview.scaleX, preview.scaleY);
          ctx.drawImage(img, -panelW / 2, -panelH / 2, panelW, panelH);
        } else {
          ctx.drawImage(img, x, 92, panelW, panelH);
        }
        ctx.restore();
        ctx.strokeStyle = simulated ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, 92, panelW, panelH);
      };

      drawPanel(pad, false);
      drawPanel(pad * 2 + panelW, true);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px Arial, sans-serif";
      ctx.fillText("LUMINA ULTRA — smile simulation", pad, 44);
      ctx.font = "16px Arial, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(
        `Baseline ${round(baseScore)}/100  →  Simulated ${round(simulatedScore)}/100   |   ${new Date().toLocaleString()}`,
        pad,
        70,
      );

      ctx.font = "bold 18px Arial, sans-serif";
      ctx.fillStyle = "#fca5a5";
      ctx.fillText(`BEFORE — ${round(baseScore)}/100`, pad + 8, 118);
      ctx.fillStyle = "#86efac";
      ctx.fillText(`AFTER — ${round(simulatedScore)}/100`, pad * 2 + panelW + 8, 118);

      ctx.font = "13px Arial, sans-serif";
      ctx.fillStyle = "#cbd5e1";
      let y = 92 + panelH + 30;
      ctx.fillText(
        METRICS.map((m) => `${m.label}: ${round(baseline[m.key])}${m.unit} → ${round(state[m.key])}${m.unit}`).join("    •    "),
        pad,
        y,
      );
      y += 22;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(
        "Visualisation of proportion and shade targets for discussion only — not a clinical prediction.",
        pad,
        y,
      );

      const link = document.createElement("a");
      link.download = `smile-simulation-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Comparison downloaded" });
    };
    img.onerror = () =>
      toast({ variant: "destructive", title: "Could not export", description: "The photo could not be re-read." });
    img.src = photo;
  };

  const setMetric = (key: MetricKey, value: number) =>
    setState((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Stored captures from the scanner */}
      {snapshots.length > 0 && (
        <div className="bg-card/50 rounded-xl border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Captured analyses</h3>
            <span className="text-xs text-muted-foreground">{snapshots.length} stored on this device</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className={`relative flex-shrink-0 w-24 rounded-lg overflow-hidden border-2 transition-all ${
                  selectedId === snap.id ? "border-primary" : "border-white/10 hover:border-white/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applySnapshot(snap)}
                  className="block w-full text-left"
                  aria-label={`Load capture from ${snap.date} ${snap.time}`}
                >
                  <img src={snap.image} alt="" className="w-full h-24 object-cover" />
                  <span className="block px-1.5 py-1 text-[10px] text-muted-foreground truncate">
                    {snap.date} {snap.time}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSnapshot(snap.id)}
                  className="absolute top-1 right-1 rounded bg-black/70 p-1 hover:bg-red-600/80"
                  aria-label="Delete capture"
                >
                  <Trash2 className="w-3 h-3 text-red-300" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!photo ? (
        /* ------------------------------------------------ empty state */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            readFile(e.dataTransfer.files?.[0]);
          }}
          className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-primary bg-primary/10" : "border-white/15 bg-card/30"
          }`}
        >
          <ImagePlus className="w-12 h-12 text-muted-foreground mx-auto opacity-60" />
          <h3 className="mt-4 font-semibold text-white">Start a simulation</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Drop a smile photo here, or upload one from this device. No camera or scanner required —
            you can set the baseline values yourself and simulate the outcome.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => fileRef.current?.click()} className="bg-primary hover:bg-primary/90">
              <ImagePlus className="w-4 h-4 mr-2" />
              Upload photo
            </Button>
            <Button variant="outline" onClick={() => navigate("/scanner")}>
              <Camera className="w-4 h-4 mr-2" />
              Run AR scanner instead
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------ before / after */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card/50 rounded-xl border border-red-500/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Before</h3>
                <Badge className="bg-red-900/60 text-red-300">Baseline</Badge>
              </div>
              <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-white/10 bg-black">
                <img src={photo} alt="Baseline smile" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Harmony index</span>
                <span className="text-2xl font-bold text-red-300">{round(baseScore)}</span>
              </div>
              <dl className="space-y-1.5 p-3 bg-white/5 rounded border border-white/10">
                {METRICS.map((m) => (
                  <div key={m.key} className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">{m.label}</dt>
                    <dd className="text-white font-semibold">
                      {round(baseline[m.key])}
                      {m.unit}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="bg-card/50 rounded-xl border border-emerald-500/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">After (simulated)</h3>
                <Badge className="bg-emerald-900/60 text-emerald-300">Simulation</Badge>
              </div>
              <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-white/10 bg-black">
                <img
                  src={photo}
                  alt="Simulated smile"
                  className="w-full h-full object-cover transition-transform duration-200 ease-out"
                  style={{
                    transform: `scale(${preview.scaleX}, ${preview.scaleY})`,
                    filter: `brightness(${preview.brightness}) saturate(${preview.saturate})`,
                  }}
                />
                {/* Gingival display overlay: shrinks as symmetry improves */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-pink-300/70 to-transparent transition-opacity duration-200"
                  style={{ opacity: preview.gum }}
                />
                {!preview.changed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <p className="text-xs text-white/90 px-6 text-center">
                      Move a slider below to preview the treatment effect.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Harmony index</span>
                <span className="text-2xl font-bold text-emerald-300">{round(simulatedScore)}</span>
              </div>
              <dl className="space-y-1.5 p-3 bg-white/5 rounded border border-white/10">
                {METRICS.map((m) => {
                  const onTarget = Math.abs(state[m.key] - m.ideal) <= m.ideal * 0.05;
                  return (
                    <div key={m.key} className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">{m.label}</dt>
                      <dd className={onTarget ? "text-emerald-300 font-semibold" : "text-white font-semibold"}>
                        {round(state[m.key])}
                        {m.unit}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>

          {/* ------------------------------------------------ controls */}
          <div className="bg-card/50 rounded-xl border border-white/10 p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Simulate treatment</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag a value to see the predicted effect on the smile preview and the harmony index.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setState({ ...IDEAL })}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Apply ideal
                </Button>
                <Button variant="outline" size="sm" onClick={() => setState({ ...baseline })}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>

            {!measured && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-900/15 p-3">
                <TriangleAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-200">
                  These baseline values are a starting template, not measurements. Set them to match the
                  patient, or run the AR scanner so the values are measured from the photo.
                </p>
              </div>
            )}

            <div className="space-y-4">
              {METRICS.map((m) => {
                const value = state[m.key];
                const delta = value - baseline[m.key];
                return (
                  <div key={m.key}>
                    <div className="flex items-baseline justify-between text-xs mb-2 gap-3">
                      <span className="text-muted-foreground" title={m.help}>
                        {m.label}
                      </span>
                      <span className="flex items-center gap-2">
                        {Math.abs(delta) >= 0.5 && (
                          <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>
                            {delta > 0 ? "+" : ""}
                            {round(delta, 1)}
                          </span>
                        )}
                        <span className="text-white font-semibold">
                          {round(value)}
                          {m.unit}
                        </span>
                        <span className="text-muted-foreground">
                          (ideal {m.ideal}
                          {m.unit})
                        </span>
                      </span>
                    </div>
                    <Slider
                      value={[value]}
                      onValueChange={(v) => setMetric(m.key, clamp(v[0] ?? value, m.min, m.max))}
                      min={m.min}
                      max={m.max}
                      step={m.step}
                      aria-label={m.label}
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Baseline</p>
                <p className="text-2xl font-bold text-red-300">{round(baseScore)}</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <p className="text-lg text-muted-foreground">→</p>
                <p
                  className={`text-xs font-semibold ${
                    gain > 0.5 ? "text-emerald-400" : gain < -0.5 ? "text-red-400" : "text-muted-foreground"
                  }`}
                >
                  {gain > 0.5 ? `+${round(gain, 1)}` : gain < -0.5 ? round(gain, 1) : "no change"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Simulated</p>
                <p className="text-2xl font-bold text-emerald-300">{round(simulatedScore)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-xs text-muted-foreground">Simulated outcome</span>
              <Badge className={gradeOf(simulatedScore).className}>{gradeOf(simulatedScore).label}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadComparison} className="bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Download before / after
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Change photo
              </Button>
              <Button variant="outline" onClick={() => navigate("/scanner")}>
                <Camera className="w-4 h-4 mr-2" />
                Measure with scanner
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The preview scales and shades the photo to illustrate proportion and shade targets. It is a
              communication aid for discussing a plan — not a prediction of the clinical result.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
