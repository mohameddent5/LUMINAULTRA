/**
 * Executable integrity audit.
 *
 * Why this module exists
 * ----------------------
 * The validation page used to *describe* the physiological gate: a table of
 * bounds and a paragraph claiming that impossible readings are refused rather
 * than clamped. A description is not evidence. A reader had to take the claim on
 * faith, and a regression in the gate would have been invisible on screen while
 * every number still looked plausible.
 *
 * This module turns the claim into an experiment. It exercises the shipped gate
 * — the same `plausibility()`, `robustEstimate()` and `MetricTracker` the
 * screening uses, imported from the same files — and reports what it measured:
 *
 *   - every bounded metric accepts its own minimum, maximum and mid-range value,
 *     and refuses one step outside either end (boundary inclusivity);
 *   - a refusal is a verdict, never a substituted number (no silent clamping);
 *   - one extreme frame inside a settled window cannot move the reported value;
 *   - once that frame leaves the window the value returns to baseline;
 *   - a capture with too few measurable metrics produces no composite score;
 *   - a complete capture does produce one, with an "ok" gate.
 *
 * Everything is computed on page load from the bundled code. There is no stored
 * result to go stale, no network call, and no number here that is not produced
 * by running the gate. If a property stops holding, the page says so.
 */
import { BOUNDED_METRIC_IDS, PHYSIO_BOUNDS, plausibility } from "./physioBounds";
import { MIN_METRICS_FOR_SCORE, MetricTracker, robustEstimate } from "./plausibility";
import { EVIDENCE_BY_ID } from "./dsdEvidence";
import type { DsdReport, MetricResult } from "./dsd";

export type AuditStatus = "pass" | "warn" | "fail";

export interface AuditCheck {
  id: string;
  title: string;
  status: AuditStatus;
  /** What the check measured, in one line, with the numbers it actually saw. */
  measured: string;
  /** What that measurement means for a reader of the report. */
  detail: string;
}

export interface IntegrityAudit {
  checks: AuditCheck[];
  passed: number;
  warned: number;
  failed: number;
  total: number;
  /** Metrics the gate covers, exercised by the boundary sweep. */
  boundedMetrics: number;
  generatedAt: string;
  verdict: "hold" | "attention" | "breach";
}

/* ------------------------------------------------------------------ fixtures */

/**
 * Minimal metric/report stubs. The gate and the tracker read only `id`, `value`,
 * `available` and `band`, so the audit does not need a full measurement core —
 * which also keeps it out of the validation page's bundle.
 */
function metricStub(id: string, value: number | null): MetricResult {
  return {
    id,
    label: id,
    unit: "count",
    value,
    text: value === null ? "n/a" : String(value),
    band: value === null ? "unavailable" : "green",
    sigma: null,
    available: value !== null,
    derivedBand: false,
    grade: "C",
    refs: [],
    idealText: "",
    note: "",
  } as unknown as MetricResult;
}

function reportOf(values: Record<string, number | null>): DsdReport {
  const metrics = Object.entries(values).map(([id, v]) => metricStub(id, v));
  return {
    metrics,
    score: null,
    scoreUsed: [],
    scoreExcluded: [],
    profile: "clinician",
    measured: metrics.filter((m) => m.available).length,
    total: metrics.length,
    calibration: null,
    notes: [],
    quality: null,
  } as unknown as DsdReport;
}

/** A capture with every metric a full assessment needs, all inside its bounds. */
const FULL_CAPTURE: Record<string, number> = {
  central_wl_ratio: 82,
  gingival_display: 1.5,
  dental_midline_shift: 0.4,
  occlusal_plane_cant: 1.2,
  buccal_corridor: 12,
  lateral_central_width_ratio: 66,
  canine_lateral_width_ratio: 80,
  gingival_margin_diff: 0.4,
  diastema: 0.2,
};

const round = (n: number, digits = 1) => Number(n.toFixed(digits));

/* -------------------------------------------------------------------- checks */

function boundsTable(): AuditCheck {
  const problems: string[] = [];
  for (const id of BOUNDED_METRIC_IDS) {
    const bound = PHYSIO_BOUNDS[id];
    if (!bound) {
      problems.push(`${id} is listed but has no bound`);
      continue;
    }
    if (!(bound.min < bound.max)) problems.push(`${id} has an inverted range`);
    if (!bound.unit) problems.push(`${id} declares no unit`);
    if (bound.rationale.trim().length < 20) problems.push(`${id} has no stated rationale`);
  }
  return {
    id: "bounds-table",
    title: "Every bound is complete and explainable",
    status: problems.length === 0 ? "pass" : "fail",
    measured: `${BOUNDED_METRIC_IDS.length} bounded metrics · ${
      BOUNDED_METRIC_IDS.length - problems.length
    } declare min < max, a unit and a rationale`,
    detail:
      problems.length === 0
        ? "A rejected reading can always be explained to the reader, because every bound carries its anatomical justification."
        : problems.join("; "),
  };
}

function boundarySweep(): AuditCheck {
  const anomalies: string[] = [];
  let acceptedEdges = 0;
  let refusedOutside = 0;
  const total = BOUNDED_METRIC_IDS.length;

  for (const id of BOUNDED_METRIC_IDS) {
    const bound = PHYSIO_BOUNDS[id];
    if (!bound) continue;
    const span = bound.max - bound.min;
    const step = Math.max(span * 0.02, 0.2);
    const mid = bound.min + span / 2;

    if (!plausibility(id, mid).ok) anomalies.push(`${id} refuses its own mid-range value ${round(mid, 2)}`);
    if (plausibility(id, bound.min).ok && plausibility(id, bound.max).ok) acceptedEdges += 1;
    else anomalies.push(`${id} refuses a value sitting exactly on its bound`);

    if (!plausibility(id, bound.min - step).ok && !plausibility(id, bound.max + step).ok) {
      refusedOutside += 1;
    } else {
      anomalies.push(`${id} accepts a value one step outside its range`);
    }
  }

  const ok = anomalies.length === 0 && acceptedEdges === total && refusedOutside === total;
  return {
    id: "boundary-sweep",
    title: "Bounds are inclusive at the edge and hard outside it",
    status: ok ? "pass" : "fail",
    measured: `${acceptedEdges}/${total} accept min, mid and max · ${refusedOutside}/${total} refuse one step beyond`,
    detail: ok
      ? "A legitimate edge-of-range reading is never lost to an off-by-one, and a value outside the anatomical range is always refused."
      : anomalies.slice(0, 4).join("; "),
  };
}

function verdictOnly(): AuditCheck {
  const refused = plausibility("central_wl_ratio", 300);
  const record = refused as unknown as Record<string, unknown>;
  const substituted = Object.entries(record).filter(
    ([key, value]) => key !== "ok" && typeof value === "number",
  );
  const ok = refused.ok === false && substituted.length === 0;
  return {
    id: "no-clamping",
    title: "A refusal is a verdict, never a corrected number",
    status: ok ? "pass" : "fail",
    measured:
      substituted.length === 0
        ? "300 % width/length ratio refused; the gate returned a reason and no replacement value"
        : `the gate returned substituted fields: ${substituted.map(([k]) => k).join(", ")}`,
    detail:
      substituted.length === 0
        ? "Clamping would silently invent a borderline measurement. The gate instead withholds the value and states why, so nothing in the report is a guess dressed as a reading."
        : "The gate emitted a numeric substitute, which means a failed measurement could reach the report looking plausible.",
  };
}

function spikeResistance(): AuditCheck {
  const baseline = 80;
  const jittered = Array.from({ length: 12 }, (_, i) => ({
    value: baseline + (i % 3) - 1,
    metric: metricStub("central_wl_ratio", baseline + (i % 3) - 1),
  }));
  const spike = { value: 108, metric: metricStub("central_wl_ratio", 108) };
  const estimate = robustEstimate([...jittered, spike], "central_wl_ratio");
  const delta = estimate.value === null ? null : Math.abs(estimate.value - baseline);
  const ok = delta !== null && delta <= 2 && estimate.rejected >= 1;

  return {
    id: "spike-resistance",
    title: "One bad frame cannot move a settled reading",
    status: ok ? "pass" : "fail",
    measured:
      estimate.value === null
        ? "the estimate came back empty"
        : `one 108 % frame among 13 at ${baseline} % → reported ${round(estimate.value)} % (Δ ${round(
            delta ?? 0,
          )} points), ${estimate.rejected} frame discarded`,
    detail: ok
      ? "The spike is a real value that a mis-placed keypoint could produce. Median consensus with robust-sigma rejection keeps it out of the report and records that it was discarded."
      : "A single frame influenced the reported value, which is the failure that used to make the screening impossible to trust.",
  };
}

function windowRecovery(): AuditCheck {
  const tracker = new MetricTracker({ window: 6, minSamples: 3 });
  for (let i = 0; i < 6; i += 1) tracker.add(reportOf({ central_wl_ratio: 80 + (i % 3) - 1 }));
  tracker.add(reportOf({ central_wl_ratio: 108 }));
  for (let i = 0; i < 6; i += 1) tracker.add(reportOf({ central_wl_ratio: 80 + (i % 3) - 1 }));
  const stabilised = tracker.summarise(reportOf({ central_wl_ratio: 80 }));
  const reported = stabilised.metrics[0]?.value ?? null;
  const recovered = reported !== null && Math.abs(reported - 80) <= 1.2;

  return {
    id: "window-recovery",
    title: "A transient fault does not stick",
    status: recovered ? "pass" : "fail",
    measured:
      reported === null
        ? "no value was reported after the fault cleared"
        : `after the 108 % frame leaves a 6-frame window the reading returns to ${round(reported)} %`,
    detail: recovered
      ? "Rejection is bounded to the window, so a blink or a head roll costs one frame rather than the rest of the capture."
      : "The reading did not return to baseline once the faulty frame left the window.",
  };
}

function scoreWithheld(): AuditCheck {
  const tracker = new MetricTracker();
  const thin = { central_wl_ratio: 80, gingival_display: 2, dental_midline_shift: 0.4 };
  for (let i = 0; i < 6; i += 1) tracker.add(reportOf(thin));
  const stabilised = tracker.summarise(reportOf(thin));
  const withheld = stabilised.score === null && stabilised.quality?.gate === "insufficient";
  const measurable = Object.keys(thin).length;

  return {
    id: "score-withheld",
    title: "No composite score from a thin capture",
    status: withheld ? "pass" : "fail",
    measured: `${measurable} measurable metrics, below the ${MIN_METRICS_FOR_SCORE} required → ${
      stabilised.score === null ? "score withheld" : `score ${round(stabilised.score)} shown`
    }, gate "${stabilised.quality?.gate ?? "none"}"`,
    detail: withheld
      ? "A harmony score built on three metrics would look authoritative and mean nothing. Below the threshold the report shows the measurements and states that no score is possible yet."
      : "A score was produced from too few metrics, which would present an unreliable figure as a clinical summary.",
  };
}

function scorePresent(): AuditCheck {
  const tracker = new MetricTracker();
  for (let i = 0; i < 8; i += 1) tracker.add(reportOf(FULL_CAPTURE));
  const stabilised = tracker.summarise(reportOf(FULL_CAPTURE));
  const ok = stabilised.score !== null && stabilised.quality?.gate === "ok";

  return {
    id: "score-present",
    title: "A complete capture does produce a score",
    status: ok ? "pass" : "fail",
    measured:
      stabilised.score === null
        ? `no score from ${Object.keys(FULL_CAPTURE).length} metrics over 8 frames`
        : `score ${round(stabilised.score)} from ${stabilised.scoreUsed.length} metrics over 8 frames, gate "${stabilised.quality?.gate}"`,
    detail: ok
      ? "The gate is not simply conservative: when the capture supports an assessment, the score appears and states how many metrics it used."
      : "A complete capture failed to produce a score, which means the gate would withhold a defensible result.",
  };
}

function gradedCoverage(): AuditCheck {
  const graded = Array.from(EVIDENCE_BY_ID.keys());
  const unbounded = graded.filter((id) => !PHYSIO_BOUNDS[id]);
  const covered = graded.length - unbounded.length;
  return {
    id: "graded-coverage",
    title: "Graded metrics are inside the gate",
    status: unbounded.length === 0 ? "pass" : "warn",
    measured: `${covered}/${graded.length} graded metrics carry a hard physiological bound`,
    detail:
      unbounded.length === 0
        ? "Every metric that can influence a grade is gated before it is graded."
        : `No hard bound is declared for: ${unbounded.join(", ")}. These are reported but sit outside the gate's scope.`,
  };
}

/* --------------------------------------------------------------- entry point */

function safely(
  id: string,
  title: string,
  run: () => AuditCheck,
): AuditCheck {
  try {
    return run();
  } catch (err) {
    return {
      id,
      title,
      status: "fail",
      measured: "the check could not complete",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run every integrity property against the shipped gate. Pure and synchronous:
 * a few hundred arithmetic operations, safe to call during render.
 */
export function runIntegrityAudit(): IntegrityAudit {
  const checks: AuditCheck[] = [
    safely("bounds-table", "Every bound is complete and explainable", boundsTable),
    safely("boundary-sweep", "Bounds are inclusive at the edge and hard outside it", boundarySweep),
    safely("no-clamping", "A refusal is a verdict, never a corrected number", verdictOnly),
    safely("spike-resistance", "One bad frame cannot move a settled reading", spikeResistance),
    safely("window-recovery", "A transient fault does not stick", windowRecovery),
    safely("score-withheld", "No composite score from a thin capture", scoreWithheld),
    safely("score-present", "A complete capture does produce a score", scorePresent),
    safely("graded-coverage", "Graded metrics are inside the gate", gradedCoverage),
  ];

  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    checks,
    passed,
    warned,
    failed,
    total: checks.length,
    boundedMetrics: BOUNDED_METRIC_IDS.length,
    generatedAt: new Date().toISOString(),
    verdict: failed > 0 ? "breach" : warned > 0 ? "attention" : "hold",
  };
}
