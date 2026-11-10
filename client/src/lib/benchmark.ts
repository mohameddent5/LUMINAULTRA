/**
 * TypeScript port of `evaluate.py` (the uploaded landmark-benchmark reference).
 *
 * The Python script remains the authoritative implementation and is still
 * runnable as a CLI:
 *
 *     python3 evaluate.py gt.json pred.json [tau] [out.json]
 *
 * This port exists so the same metrics can be computed in the browser: the
 * production runtime image is Node-only, so shelling out to Python from the
 * deployed app would fail. `script/check_benchmark_parity.ts` asserts that this
 * port reproduces the Python output on the shared self-test fixture.
 *
 * Semantics mirrored deliberately (see the Python file):
 *  - channels 0..31 are the four landmarks of eight FDI teeth (14..24);
 *    32..38 are papillae between adjacent teeth; 39 is the dental midline.
 *  - a channel absent from the predictions was refused by the decoder;
 *    a channel absent from the annotations is unannotated and ignored.
 *  - "correct" := annotated visible AND localisation error <= tau.
 *  - accepted-only accuracy is reported separately from all-prediction
 *    accuracy, because a gate only helps if it improves reliability.
 */

export const FDI = [14, 13, 12, 11, 21, 22, 23, 24] as const;
export const KINDS = ["incisal_mid", "zenith", "mesial_corner", "distal_corner"] as const;

export interface GtLandmark {
  x: number;
  y: number;
  visible: boolean;
}
export interface GtImage {
  id: string;
  mm_per_px?: number | null;
  landmarks: Record<string, GtLandmark>;
}
export interface PredLandmark {
  x: number;
  y: number;
  accepted?: boolean;
  gate_p?: number | null;
  detection?: number;
  sigma_px?: number | null;
  reasons?: string[];
}
export interface PredImage {
  id: string;
  landmarks: Record<string, PredLandmark>;
}
export interface BenchmarkFile {
  schema?: string;
  images: GtImage[];
}
export interface PredictionsFile {
  schema?: string;
  images: PredImage[];
}

export interface Stats {
  n: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
}

export interface CalibrationBin {
  bin: string;
  n: number;
  mean_p: number;
  empirical: number;
}

export interface Acceptance {
  precision: number;
  recall_of_visible: number;
  false_accept_rate_of_accepted: number;
  hidden_accept_rate: number;
  false_reject_rate_of_correct: number;
  baseline_precision_without_gate: number;
}

export interface BenchmarkResult {
  tau_px: number;
  n_annotated: number;
  n_visible: number;
  n_decoded: number;
  n_accepted: number;
  all_predictions: Stats;
  accepted_only: Stats;
  accepted_normalised_by_crown_width: Stats;
  accepted_mm: Stats | null;
  acceptance: Acceptance;
  gate_probability_calibration?: { ece: number; bins: CalibrationBin[] };
  sigma_calibration: { n: number; coverage_at_95: number; target: number } | null;
  per_landmark_accepted: Record<string, Stats>;
  per_tooth_accepted: Record<string, Stats>;
  refusal_reasons: Record<string, number>;
}

export function kindOf(c: number): string {
  if (c < 32) return KINDS[c % 4];
  return c < 39 ? "papilla" : "dental_midline";
}

export function nameOf(c: number): string {
  if (c < 32) return `${kindOf(c)}_${FDI[Math.floor(c / 4)]}`;
  return c < 39 ? `papilla_${FDI[c - 32]}|${FDI[c - 31]}` : "dental_midline";
}

export function toothOf(c: number): number | null {
  return c < 32 ? FDI[Math.floor(c / 4)] : null;
}

/** numpy.percentile default method ("linear") on an already-sorted array. */
function percentileSorted(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (!n) return null;
  const idx = (n - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  return percentileSorted([...values].sort((a, b) => a - b), p);
}

function stats(values: number[]): Stats {
  const n = values.length;
  if (!n) return { n: 0, mean: null, median: null, p90: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    n,
    mean: sum / n,
    median: percentileSorted(sorted, 50),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
    max: sorted[n - 1],
  };
}

/** Radial 95% quantile in units of per-axis sigma (Rayleigh). */
export const RAYLEIGH_95 = Math.sqrt(-2 * Math.log(0.05));

/** Median crown width from visible mesial/distal corner pairs, else 24 px. */
export function crownWidth(gtImage: GtImage): number {
  const widths: number[] = [];
  for (let t = 0; t < 8; t += 1) {
    const m = gtImage.landmarks[String(t * 4 + 2)];
    const d = gtImage.landmarks[String(t * 4 + 3)];
    if (m && d && m.visible && d.visible) widths.push(Math.abs(m.x - d.x));
  }
  const med = quantile(widths, 50);
  return med === null ? 24.0 : med;
}

interface Row {
  c: number;
  visible: boolean;
  decoded: boolean;
  accepted: boolean;
  w0: number;
  mmpp: number | null;
  err: number | null;
  gate_p: number | null;
  sigma: number | null;
  reasons: string[];
}

export function evaluate(gt: BenchmarkFile, pred: PredictionsFile, tau = 2.0): BenchmarkResult {
  const byId = new Map<string, PredImage>();
  for (const im of pred.images ?? []) byId.set(im.id, im);

  const rows: Row[] = [];
  for (const g of gt.images ?? []) {
    const p = byId.get(g.id) ?? { id: g.id, landmarks: {} };
    const w0 = crownWidth(g);
    for (const [ch, a] of Object.entries(g.landmarks ?? {})) {
      const c = Number.parseInt(ch, 10);
      const r = p.landmarks ? p.landmarks[ch] : undefined;
      const row: Row = {
        c,
        visible: Boolean(a.visible),
        decoded: r !== undefined && r !== null,
        accepted: r ? Boolean(r.accepted) : false,
        w0,
        mmpp: g.mm_per_px ?? null,
        err: null,
        gate_p: null,
        sigma: null,
        reasons: [],
      };
      if (r) {
        row.err = Math.hypot(r.x - a.x, r.y - a.y);
        row.gate_p = r.gate_p ?? null;
        row.sigma = r.sigma_px ?? null;
        row.reasons = r.reasons ?? [];
      }
      rows.push(row);
    }
  }

  const dec = rows.filter((r) => r.decoded);
  const visDec = dec.filter((r) => r.visible);
  const acc = dec.filter((r) => r.accepted);
  const accVis = acc.filter((r) => r.visible);
  const correct = (r: Row) => r.visible && r.err !== null && r.err <= tau;

  const nVisible = rows.filter((r) => r.visible).length;
  const result: BenchmarkResult = {
    tau_px: tau,
    n_annotated: rows.length,
    n_visible: nVisible,
    n_decoded: dec.length,
    n_accepted: acc.length,
    all_predictions: stats(visDec.map((r) => r.err as number)),
    accepted_only: stats(accVis.map((r) => r.err as number)),
    accepted_normalised_by_crown_width: stats(accVis.map((r) => (r.err as number) / r.w0)),
    accepted_mm: null,
    acceptance: {
      precision: 0,
      recall_of_visible: 0,
      false_accept_rate_of_accepted: 0,
      hidden_accept_rate: 0,
      false_reject_rate_of_correct: 0,
      baseline_precision_without_gate: 0,
    },
    sigma_calibration: null,
    per_landmark_accepted: {},
    per_tooth_accepted: {},
    refusal_reasons: {},
  };

  const mm = accVis.filter((r) => r.mmpp).map((r) => (r.err as number) * (r.mmpp as number));
  if (mm.length) result.accepted_mm = stats(mm);

  const nOk = acc.filter(correct).length;
  const hidDec = dec.filter((r) => !r.visible);
  const okDec = dec.filter(correct);
  result.acceptance = {
    precision: nOk / Math.max(1, acc.length),
    recall_of_visible: nOk / Math.max(1, nVisible),
    false_accept_rate_of_accepted: 1 - nOk / Math.max(1, acc.length),
    hidden_accept_rate: hidDec.filter((r) => r.accepted).length / Math.max(1, hidDec.length),
    false_reject_rate_of_correct: okDec.filter((r) => !r.accepted).length / Math.max(1, okDec.length),
    baseline_precision_without_gate: okDec.length / Math.max(1, dec.length),
  };

  // Confidence calibration of the visibility probability against correctness.
  const gp = dec
    .filter((r) => r.gate_p !== null)
    .map((r) => [r.gate_p as number, correct(r)] as const);
  if (gp.length) {
    const pr = gp.map((g) => g[0]);
    const hit = gp.map((g) => (g[1] ? 1 : 0));
    let ece = 0;
    const table: CalibrationBin[] = [];
    for (let i = 0; i < 10; i += 1) {
      const lo = i / 10;
      const hi = (i + 1) / 10;
      const eps = hi === 1 ? 1e-9 : 0;
      const idx: number[] = [];
      for (let k = 0; k < pr.length; k += 1) {
        if (pr[k] >= lo && pr[k] < hi + eps) idx.push(k);
      }
      if (idx.length) {
        const meanP = idx.reduce((s, k) => s + pr[k], 0) / idx.length;
        const meanHit = idx.reduce((s, k) => s + hit[k], 0) / idx.length;
        ece += (idx.length / pr.length) * Math.abs(meanP - meanHit);
        table.push({
          bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
          n: idx.length,
          mean_p: meanP,
          empirical: meanHit,
        });
      }
    }
    result.gate_probability_calibration = { ece, bins: table };
  }

  const sg = accVis
    .filter((r) => r.sigma !== null && r.sigma !== 0)
    .map((r) => [r.err as number, r.sigma as number] as const);
  if (sg.length) {
    const inside = sg.filter(([e, s]) => e <= RAYLEIGH_95 * s).length;
    result.sigma_calibration = { n: sg.length, coverage_at_95: inside / sg.length, target: 0.95 };
  }

  const byLandmark = new Map<string, number[]>();
  for (const r of accVis) {
    const key = r.c >= 32 ? nameOf(r.c) : `${kindOf(r.c)}_${toothOf(r.c)}`;
    const list = byLandmark.get(key) ?? [];
    list.push(r.err as number);
    byLandmark.set(key, list);
  }
  result.per_landmark_accepted = {};
  for (const key of [...byLandmark.keys()].sort()) {
    result.per_landmark_accepted[key] = stats(byLandmark.get(key) as number[]);
  }

  const byTooth = new Map<string, number[]>();
  for (const r of accVis) {
    const t = toothOf(r.c);
    if (t === null) continue;
    const key = String(t);
    const list = byTooth.get(key) ?? [];
    list.push(r.err as number);
    byTooth.set(key, list);
  }
  result.per_tooth_accepted = {};
  for (const key of [...byTooth.keys()].sort()) {
    result.per_tooth_accepted[key] = stats(byTooth.get(key) as number[]);
  }

  for (const r of dec) {
    if (r.accepted) continue;
    const reasons = r.reasons.length ? r.reasons : ["DECODED_BUT_NO_REASON_RECORDED"];
    for (const reason of reasons) {
      result.refusal_reasons[reason] = (result.refusal_reasons[reason] ?? 0) + 1;
    }
  }

  return result;
}

const fixed = (x: number | null, digits = 3) => (x === null ? "-" : x.toFixed(digits));

/** Same markdown layout as `to_markdown` in evaluate.py. */
export function toMarkdown(r: BenchmarkResult, title = "Landmark benchmark"): string {
  const a = r.accepted_only;
  const al = r.all_predictions;
  const ac = r.acceptance;
  const lines: string[] = [
    `# ${title}`,
    "",
    `tau = ${Number.isInteger(r.tau_px) ? r.tau_px.toFixed(1) : r.tau_px} px; annotated ${r.n_annotated}, visible ${r.n_visible}, decoded ${r.n_decoded}, accepted ${r.n_accepted}.`,
    "",
    "| | n | mean | median | p90 | p95 | max |",
    "|---|---|---|---|---|---|---|",
    `| all visible predictions (px) | ${al.n} | ${fixed(al.mean)} | ${fixed(al.median)} | ${fixed(al.p90)} | ${fixed(al.p95)} | ${fixed(al.max)} |`,
    `| accepted visible only (px) | ${a.n} | ${fixed(a.mean)} | ${fixed(a.median)} | ${fixed(a.p90)} | ${fixed(a.p95)} | ${fixed(a.max)} |`,
    "",
    `Acceptance precision ${fixed(ac.precision)} (without a gate: ${fixed(ac.baseline_precision_without_gate)}); recall of visible ${fixed(ac.recall_of_visible)}; hidden-accept rate ${fixed(ac.hidden_accept_rate)}; false-reject rate of correct ${fixed(ac.false_reject_rate_of_correct)}.`,
  ];
  if (r.gate_probability_calibration) {
    lines.push(`Gate-probability ECE ${fixed(r.gate_probability_calibration.ece)}.`);
  }
  if (r.sigma_calibration) {
    lines.push(
      `Nominal sigma: ${fixed(r.sigma_calibration.coverage_at_95)} of accepted errors fall inside the claimed 95% circle (target 0.95).`,
    );
  }
  lines.push("", `Refusal reasons: ${JSON.stringify(r.refusal_reasons)}`);
  return `${lines.join("\n")}\n`;
}

export const SELF_TEST_DISCLAIMER =
  "These figures come from a synthetic self-test fixture (fixed seed) that exercises every code path of the evaluator. They are NOT model accuracy and must not be reported as such. Real numbers require the ONNX weights, the paired shards and clinician annotations, none of which are included in this build.";
