import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileJson, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  evaluate,
  toMarkdown,
  SELF_TEST_DISCLAIMER,
  type BenchmarkFile,
  type BenchmarkResult,
  type PredictionsFile,
} from "@/lib/benchmark";
import gtRaw from "../../../shared/benchmark-selftest.gt.json?raw";
import predRaw from "../../../shared/benchmark-selftest.pred.json?raw";

const TAU = 2.0;

const fmt = (x: number | null | undefined, digits = 3) =>
  x === null || x === undefined ? "–" : x.toFixed(digits);

const pct = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`;

function isBenchmarkFile(v: unknown): v is BenchmarkFile {
  if (!v || typeof v !== "object") return false;
  const images = (v as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return false;
  return images.every((im) => {
    if (!im || typeof im !== "object") return false;
    const rec = im as { id?: unknown; landmarks?: unknown };
    return typeof rec.id === "string" && !!rec.landmarks && typeof rec.landmarks === "object";
  });
}

/** Self-test fixture, evaluated once at module load. */
let fixtureResult: BenchmarkResult | null = null;
let fixtureError: string | null = null;
try {
  const gt = JSON.parse(gtRaw) as BenchmarkFile;
  const pred = JSON.parse(predRaw) as PredictionsFile;
  if (!isBenchmarkFile(gt)) throw new Error("self-test annotation fixture is malformed");
  fixtureResult = evaluate(gt, pred, TAU);
} catch (err) {
  fixtureError = err instanceof Error ? err.message : "failed to evaluate the self-test fixture";
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card/50 rounded-lg border border-white/10 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card/50 rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function Validation() {
  const [, navigate] = useLocation();
  const [custom, setCustom] = useState<{ result: BenchmarkResult; label: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const gtRef = useRef<BenchmarkFile | null>(null);
  const predRef = useRef<PredictionsFile | null>(null);

  const result = custom?.result ?? fixtureResult;
  const error = custom ? null : fixtureError;

  const handlePick = (kind: "gt" | "pred") => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBenchmarkFile(parsed)) {
        throw new Error(`${file.name} is not a valid file: expected { "images": [ { "id", "landmarks" } ] }`);
      }
      if (kind === "gt") gtRef.current = parsed;
      else predRef.current = parsed as PredictionsFile;

      const gt = gtRef.current;
      const pred = predRef.current;
      if (!gt || !pred) {
        setUploadError("Loaded. Now add the other file to run the comparison.");
        return;
      }
      const next = evaluate(gt, pred, TAU);
      if (next.n_decoded === 0) {
        throw new Error("No landmark ids matched between the two files — check the image ids.");
      }
      setCustom({ result: next, label: `${file.name} + comparison` });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      event.target.value = "";
    }
  };

  const downloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([toMarkdown(result, "Landmark benchmark")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "landmark-benchmark.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const perLandmark = result
    ? Object.entries(result.per_landmark_accepted).sort(
        (a, b) => (b[1].mean ?? 0) - (a[1].mean ?? 0),
      )
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-heading font-bold text-white">Model Validation</h1>
            <p className="text-xs text-muted-foreground">Landmark benchmark engine</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">τ = {TAU.toFixed(1)} px</span>
      </nav>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Integrity banner — the figures on this page are NOT model accuracy. */}
        <div className="bg-amber-900/30 border border-amber-500/40 rounded-lg p-4">
          <h2 className="text-amber-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Self-test data — not model accuracy
          </h2>
          <p className="text-xs text-amber-100/80 mt-2 leading-relaxed">{SELF_TEST_DISCLAIMER}</p>
        </div>

        {error ? (
          <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4 text-sm text-red-200">
            The self-test fixture could not be evaluated: {error}
          </div>
        ) : null}

        {result ? (
          <>
            {/* Provenance */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card title="Evaluator" subtitle="evaluate.py, ported to TypeScript">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The uploaded Python reference stays authoritative and runnable as a CLI. This page runs a
                  faithful port so the same metrics work in the deployed Node-only app.
                </p>
                <p className="text-xs text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Parity asserted against Python output
                </p>
              </Card>
              <Card title="Fixture" subtitle="Deterministic self-test set">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  4 synthetic cases, seed 7, {result.n_annotated} annotated landmarks across 40 channels.
                  Exercises refused channels, hidden-but-accepted landmarks and gross errors.
                </p>
              </Card>
              <Card title="Data source" subtitle={custom ? "Your uploaded files" : "Bundled self-test"}>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {custom
                    ? "Results below are computed from the two files you loaded in this browser session."
                    : "Results below are computed from the bundled self-test fixture."}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    gtRef.current = null;
                    predRef.current = null;
                    setCustom(null);
                    setUploadError(null);
                  }}
                  className="text-cyan-300 hover:bg-white/10 px-0"
                >
                  Reset to self-test
                </Button>
              </Card>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Annotated" value={String(result.n_annotated)} hint="landmarks in the annotation file" />
              <StatTile label="Visible" value={String(result.n_visible)} hint="ground-truth visible" />
              <StatTile label="Decoded" value={String(result.n_decoded)} hint="produced a prediction" />
              <StatTile label="Accepted" value={String(result.n_accepted)} hint="passed the gate" />
            </div>

            {/* Error distribution */}
            <Card
              title="Localisation error (px)"
              subtitle="Accepted-only accuracy must be read next to all-prediction accuracy — a gate only helps if it improves reliability."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground border-b border-white/10">
                      <th className="text-left py-2 pr-3 font-medium">Population</th>
                      <th className="text-right py-2 px-2 font-medium">n</th>
                      <th className="text-right py-2 px-2 font-medium">mean</th>
                      <th className="text-right py-2 px-2 font-medium">median</th>
                      <th className="text-right py-2 px-2 font-medium">p90</th>
                      <th className="text-right py-2 px-2 font-medium">p95</th>
                      <th className="text-right py-2 pl-2 font-medium">max</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-3 text-muted-foreground">All visible predictions</td>
                      <td className="text-right px-2">{result.all_predictions.n}</td>
                      <td className="text-right px-2">{fmt(result.all_predictions.mean)}</td>
                      <td className="text-right px-2">{fmt(result.all_predictions.median)}</td>
                      <td className="text-right px-2">{fmt(result.all_predictions.p90)}</td>
                      <td className="text-right px-2">{fmt(result.all_predictions.p95)}</td>
                      <td className="text-right pl-2">{fmt(result.all_predictions.max)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 text-cyan-300">Accepted visible only</td>
                      <td className="text-right px-2">{result.accepted_only.n}</td>
                      <td className="text-right px-2">{fmt(result.accepted_only.mean)}</td>
                      <td className="text-right px-2">{fmt(result.accepted_only.median)}</td>
                      <td className="text-right px-2">{fmt(result.accepted_only.p90)}</td>
                      <td className="text-right px-2">{fmt(result.accepted_only.p95)}</td>
                      <td className="text-right pl-2">{fmt(result.accepted_only.max)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Normalised by crown width: mean {fmt(result.accepted_normalised_by_crown_width.mean, 4)}
                {result.accepted_mm
                  ? ` · in millimetres (${result.accepted_mm.n} cases with a scale): mean ${fmt(result.accepted_mm.mean, 3)} mm`
                  : " · no scale available for millimetre conversion"}
              </p>
            </Card>

            {/* Gate value */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Does the gate help?" subtitle="Precision with the gate vs. accepting everything">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">With gate</span>
                    <span className="text-2xl font-bold text-white">{fmt(result.acceptance.precision)}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Without gate</span>
                    <span className="text-xl font-semibold text-muted-foreground">
                      {fmt(result.acceptance.baseline_precision_without_gate)}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-300">
                    +{fmt((result.acceptance.precision - result.acceptance.baseline_precision_without_gate) * 100, 1)} points
                  </p>
                </div>
              </Card>
              <Card title="Trade-off" subtitle="What the gate costs and protects">
                <dl className="text-xs space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Recall of visible</dt>
                    <dd className="text-white">{fmt(result.acceptance.recall_of_visible)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Hidden-accept rate</dt>
                    <dd className="text-white">{fmt(result.acceptance.hidden_accept_rate)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">False-reject rate of correct</dt>
                    <dd className="text-white">{fmt(result.acceptance.false_reject_rate_of_correct)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">False-accept rate of accepted</dt>
                    <dd className="text-white">{fmt(result.acceptance.false_accept_rate_of_accepted)}</dd>
                  </div>
                </dl>
              </Card>
            </div>

            {/* Calibration */}
            {result.gate_probability_calibration ? (
              <Card
                title="Gate-probability calibration"
                subtitle={`ECE ${fmt(result.gate_probability_calibration.ece)} — lower is better. Bars: empirical correctness per confidence bin.`}
              >
                <div className="space-y-1.5">
                  {result.gate_probability_calibration.bins.map((bin) => (
                    <div key={bin.bin} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{bin.bin}</span>
                      <div className="flex-1 h-3 bg-white/5 rounded overflow-hidden relative">
                        <div
                          className="h-full bg-cyan-400/70"
                          style={{ width: `${Math.max(0, Math.min(1, bin.empirical)) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-amber-300"
                          style={{ left: `${Math.max(0, Math.min(1, bin.mean_p)) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-white tabular-nums">{bin.n}</span>
                      <span className="w-14 text-right text-muted-foreground tabular-nums">
                        {pct(bin.empirical, 0)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cyan = empirical correctness · amber tick = mean predicted confidence · n = landmarks in bin.
                </p>
              </Card>
            ) : null}

            {/* Sigma */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Uncertainty coverage" subtitle="Do the claimed 95% circles actually contain the truth?">
                {result.sigma_calibration ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Observed coverage</span>
                      <span className="text-2xl font-bold text-white">
                        {pct(result.sigma_calibration.coverage_at_95)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Target {pct(result.sigma_calibration.target, 0)} over {result.sigma_calibration.n} accepted
                      landmarks with a nominal sigma.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No sigma values in this file.</p>
                )}
              </Card>
              <Card title="Refusal reasons" subtitle="Why the decoder or gate withheld a landmark">
                {Object.keys(result.refusal_reasons).length ? (
                  <ul className="text-xs space-y-2">
                    {Object.entries(result.refusal_reasons)
                      .sort((a, b) => b[1] - a[1])
                      .map(([reason, count]) => (
                        <li key={reason} className="flex justify-between">
                          <span className="text-muted-foreground">{reason}</span>
                          <span className="text-white tabular-nums">{count}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing was refused.</p>
                )}
              </Card>
            </div>

            {/* Per landmark */}
            <Card
              title="Per-landmark accuracy"
              subtitle="Accepted localisation error by anatomical landmark, worst first."
            >
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="uppercase text-muted-foreground border-b border-white/10">
                      <th className="text-left py-2 pr-3 font-medium">Landmark</th>
                      <th className="text-right py-2 px-2 font-medium">n</th>
                      <th className="text-right py-2 px-2 font-medium">mean</th>
                      <th className="text-right py-2 px-2 font-medium">median</th>
                      <th className="text-right py-2 pl-2 font-medium">p95</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {perLandmark.map(([name, s]) => (
                      <tr key={name} className="border-b border-white/5">
                        <td className="py-1.5 pr-3 text-muted-foreground">{name}</td>
                        <td className="text-right px-2 tabular-nums">{s.n}</td>
                        <td className="text-right px-2 tabular-nums">{fmt(s.mean)}</td>
                        <td className="text-right px-2 tabular-nums">{fmt(s.median)}</td>
                        <td className="text-right pl-2 tabular-nums">{fmt(s.p95)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Upload */}
            <Card
              title="Evaluate your own annotations"
              subtitle="Load a ground-truth file and a prediction file (schemas lumina.benchmark/1 and lumina.predictions/1). Nothing is uploaded — both files are read in this browser tab."
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:bg-white/10 text-xs text-white">
                  <FileJson className="w-4 h-4 text-cyan-300" />
                  <span>Annotation file (ground truth)</span>
                  <input type="file" accept="application/json,.json" className="hidden" onChange={handlePick("gt")} />
                </label>
                <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:bg-white/10 text-xs text-white">
                  <Upload className="w-4 h-4 text-cyan-300" />
                  <span>Prediction file</span>
                  <input type="file" accept="application/json,.json" className="hidden" onChange={handlePick("pred")} />
                </label>
              </div>
              {uploadError ? <p className="text-xs text-amber-300">{uploadError}</p> : null}
            </Card>

            {/* Export */}
            <Card title="Reproducible output" subtitle="The same markdown report the Python CLI prints.">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={downloadMarkdown} className="text-cyan-300 hover:bg-white/10">
                  <Download className="w-4 h-4 mr-1" /> Download report (.md)
                </Button>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-white">Show report</summary>
                <pre className="mt-2 p-3 bg-black/40 border border-white/10 rounded overflow-x-auto text-[11px] text-muted-foreground whitespace-pre-wrap">
                  {toMarkdown(result, "Landmark benchmark")}
                </pre>
              </details>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
