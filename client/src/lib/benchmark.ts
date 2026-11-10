/**
 * TypeScript port of `evaluate.py` (the uploaded landmark-benchmark reference).
 *
 * The Python script stays the authoritative implementation and is still runnable
 * as a CLI (`python3 evaluate.py gt.json pred.json [tau] [out.json]`). This port
 * exists so the same metrics can be computed in the browser: the production
 * runtime image is Node-only, so shelling out to Python from the deployed app
 * would fail. `script/check_benchmark_parity.ts` proves both implementations
 * return identical numbers on the shipped self-test fixture.
 *
 * Metric semantics are preserved exactly, including:
 *  - ACCEPTED-only accuracy reported separately from ALL-prediction accuracy
 *    (a gate is only useful if it improves reliability);
 *  - precision/recall/false-accept/false-reject and the no-gate baseline;
 *  - gate-probability calibration (ECE over 10 equal-width bins);
 *  - sigma calibration as radial 95% coverage (Rayleigh quantile);
 *  - refusal reasons, per-landmark and per-tooth breakdowns.
 *
 * "correct" := annotated visible AND localisation error <= tau (default 2 px).
 */

export const FDI = [14, 13, 12, 11, 21, 22, 23, 24] as const;

export type LandmarkKind =
  | "incisal_mid"
  | "zenith"
  | "mesial_corner"
  | "distal_corner"
  | "papilla"
  | "dental_midline";

const QUADRANT_KINDS: LandmarkKind[] = [
  "incisal_mid",
  "zenith",
  "mesial_corner",
  "distal_corner",
];

/** Channel -> landmark kind (channels 0..31 tooth corners, 32..38 papillae, 39 midline). */
export function kindOf(c: number): LandmarkKind {
  if (c < 32) return QUADRANT_KINDS[c % 4];
  return c < 39 ? "papilla" : "dental_midline";
}

/** Channel -> FDI tooth number, or null for papilla / midline channels. */
export function toothOf(c: number): number | null {
  return c < 32 ? FDI[Math.floor(c / 4)] : null;
}

/** Human-readable landmark name, e.g. "zenith_21" or "papilla_11|21". */
export function nameOf(c: number): string {
  if (c < 32) return `${kindOf(c)}_${FDI[Math.floor(c / 4)]}`;
  if (c < 39) return `papilla_${FDI[c - 32]}|${FDI[c - 31]}`;
  return "dental_midline";
}

export interface GtLandmark {
  x: number;
  y: number;
  visible: boolean;
}

export interface PredLandmark {
  x: number;
  y: number;
  accepted: boolean;
  gate_p?: number | null;
  detection?: number | null;
  sigma_px?: number | null;
  reasons?: string[];
}

export interface BenchmarkImage {
  id: string;
  mm_per_px?: number | null;
  landmarks: Record<string, GtLandmark>;
}

export interface PredictionImage {
  id: string;
  landmarks: Record<string, PredLandmark>;
}

export interface BenchmarkGt {
  schema: string;
  images: BenchmarkImage[];
}

export interface Predictions {
  schema: string;
  images: PredictionImage[];
}

export interface Stats {
  n: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
}

export interface Acceptance {
  precision: number;
  recall_of_visible: number;
  false_accept_rate_of_accepted: number;
  hidden_accept_rate: number;
  false_reject_rate_of_correct: number;
  baseline_precision_without_gate: number;
}

export interface CalibrationBin {
  bin: string;
  n: number;
  mean_p: number;
  empirical: number;
}

export interface GateCalibration {
  ece: number;
  bins: CalibrationBin[];
}

export interface SigmaCalibration {
  n: number;
  coverage_at_95: number;
  target: number;
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
  gate_probability_calibration?: GateCalibration;
  sigma_calibration: SigmaCalibration | null;
  per_landmark_accepted: Record<string, Stats>;
  per_tooth_accepted: Record<string, Stats>;
  refusal_reasons: Record<string, number>;
}

/** Radial 95% quantile in units of per-axis sigma (Rayleigh distribution). */
export const RAYLEIGH_95 = Math.sqrt(-2 * Math.log(0.05));

/** numpy.percentile default ("linear") interpolation, matching the Python reference. */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const pos = (n - 1) * (p / 100);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stats(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, median: null, p90: null, p95: null, max: null };
  const e = values.slice().sort((a, b) => a - b);
  let sum = 0;
  for (const v of e) sum += v;
  return {
    n,
    mean: sum / n,
    median: percentile(e, 50),
    p90: percentile(e, 90),
    p95: percentile(e, 95),
    max: e[n - 1],
  };
}

/** Median mesial-to-distal corner width, used to normalise error by crown width. */
export function crownWidth(gtImage: BenchmarkImage): number {
  const widths: number[] = [];
  for (let t = 0; t < 8; t++) {
    const m = gtImage.landmarks[String(t * 4 + 2)];
    const d = gtImage.landmarks[String(t * 4 + 3)];
    if (m && d && m.visible && d.visible) widths.push(Math.abs(m.x - d.x));
  }
  return widths.length ? stats(widths).median ?? 24 : 24;
}

interface Row {
  c: number;
  visible: boolean;
  decoded: boolean;
  accepted: boolean;
  w0: number;
  mmpp?: number | null;
  err?: number;
  gate_p?: number | null;
  sigma?: number | null;
  reasons?: string[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function evaluate(gt: BenchmarkGt, pred: Predictions, tau = 2.0): BenchmarkResult {
  const predictions = new Map(pred.images.map((im) => [im.id, im]));
  const rows: Row[] = [];

  for (const g of gt.images) {
    const p = predictions.get(g.id) ?? { id: g.id, landmarks: {} };
    const w0 = crownWidth(g);
    // Sort channel keys numerically so ordering never depends on JS object key ordering.
    const channels = Object.keys(g.landmarks).sort((a, b) => Number(a) - Number(b));
    for (const ch of channels) {
      const a = g.landmarks[ch];
      const c = Number(ch);
      const r = p.landmarks[ch];
      const row: Row = {
        c,
        visible: Boolean(a.visible),
        decoded: r != null,
        accepted: Boolean(r && r.accepted),
        w0,
        mmpp: g.mm_per_px ?? null,
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
  const correct = (r: Row) => r.visible && (r.err ?? Number.POSITIVE_INFINITY) <= tau;
  const errOf = (r: Row) => r.err ?? 0;

  const nVisible = rows.filter((r) => r.visible).length;
  const out: BenchmarkResult = {
    tau_px: tau,
    n_annotated: rows.length,
    n_visible: nVisible,
    n_decoded: dec.length,
    n_accepted: acc.length,
    all_predictions: stats(visDec.map(errOf)),
    accepted_only: stats(accVis.map(errOf)),
    accepted_normalised_by_crown_width: stats(accVis.map((r) => errOf(r) / r.w0)),
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

  const mm = accVis.filter((r) => r.mmpp).map((r) => errOf(r) * (r.mmpp as number));
  out.accepted_mm = mm.length ? stats(mm) : null;

  const nOk = acc.filter(correct).length;
  const hidDec = dec.filter((r) => !r.visible);
  const okDec = dec.filter(correct);
  const denom = (n: number) => Math.max(1, n);

  out.acceptance = {
    precision: nOk / denom(acc.length),
    recall_of_visible: nOk / denom(nVisible),
    false_accept_rate_of_accepted: 1 - nOk / denom(acc.length),
    hidden_accept_rate: hidDec.filter((r) => r.accepted).length / denom(hidDec.length),
    false_reject_rate_of_correct: okDec.filter((r) => !r.accepted).length / denom(okDec.length),
    baseline_precision_without_gate: okDec.length / denom(dec.length),
  };

  // Gate-probability calibration of the visibility probability against correctness.
  const gp = dec
    .filter((r) => isNum(r.gate_p))
    .map((r) => ({ p: r.gate_p as number, hit: correct(r) ? 1 : 0 }));
  if (gp.length) {
    const bins: CalibrationBin[] = [];
    let ece = 0;
    for (let i = 0; i < 10; i++) {
      const lo = i / 10;
      const hi = (i + 1) / 10;
      const upper = hi + (hi === 1 ? 1e-9 : 0);
      const inBin = gp.filter((x) => x.p >= lo && x.p < upper);
      if (!inBin.length) continue;
      const meanP = inBin.reduce((s, x) => s + x.p, 0) / inBin.length;
      const empirical = inBin.reduce((s, x) => s + x.hit, 0) / inBin.length;
      ece += (inBin.length / gp.length) * Math.abs(meanP - empirical);
      bins.push({
        bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
        n: inBin.length,
        mean_p: meanP,
        empirical,
      });
    }
    out.gate_probability_calibration = { ece, bins };
  }

  const sg = accVis.filter((r) => r.sigma).map((r) => ({ err: errOf(r), sigma: r.sigma as number }));
  out.sigma_calibration = sg.length
    ? {
        n: sg.length,
        coverage_at_95:
          sg.filter((x) => x.err <= RAYLEIGH_95 * x.sigma).length / sg.length,
        target: 0.95,
      }
    : null;

  const byLandmark: Record<string, number[]> = {};
  for (const r of accVis) {
    const key = r.c >= 32 ? nameOf(r.c) : `${kindOf(r.c)}_${toothOf(r.c)}`;
    (byLandmark[key] ??= []).push(errOf(r));
  }
  for (const k of Object.keys(byLandmark).sort()) out.per_landmark_accepted[k] = stats(byLandmark[k]);

  const byTooth: Record<string, number[]> = {};
  for (const r of accVis) {
    const t = toothOf(r.c);
    if (t !== null) (byTooth[String(t)] ??= []).push(errOf(r));
  }
  for (const k of Object.keys(byTooth).sort((a, b) => Number(a) - Number(b))) {
    out.per_tooth_accepted[k] = stats(byTooth[k]);
  }

  const reasons: Record<string, number> = {};
  for (const r of dec) {
    if (r.accepted) continue;
    const list = r.reasons && r.reasons.length ? r.reasons : ["DECODED_BUT_NO_REASON_RECORDED"];
    for (const x of list) reasons[x] = (reasons[x] ?? 0) + 1;
  }
  out.refusal_reasons = reasons;

  return out;
}

/** Format a nullable number the way the Python reference does. */
export function fmt(x: number | null | undefined, digits = 3): string {
  return x === null || x === undefined || Number.isNaN(x) ? "-" : x.toFixed(digits);
}
