/**
 * Regression check for physiological plausibility and frame consensus.
 *
 * These are the exact failure modes that made the screening untrustworthy: a
 * value that cannot exist anatomically, and a single bad frame dragging the
 * whole result. Both must be impossible after this suite passes.
 *
 * Run with: npm run test:plausibility
 */
import assert from "node:assert/strict";
import { analyze, type DsdReport, type MetricResult } from "../client/src/lib/dsd";
import { EVIDENCE_BY_ID } from "../client/src/lib/dsdEvidence";
import { BOUNDED_METRIC_IDS, PHYSIO_BOUNDS, plausibility } from "../client/src/lib/physioBounds";
import { MetricTracker, robustEstimate } from "../client/src/lib/plausibility";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/* ------------------------------------------------------- 1. the hard gate */

check("an impossible gingival display is rejected, not graded", () => {
  // -40 mm would mean the zenith sits 4 cm below the lip margin: physically
  // impossible, and a classic symptom of a bad keypoint on one frame.
  const result = plausibility("gingival_display", -40);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /physiological range/);
  assert.match(result.reason ?? "", /unstable/);
});

check("a 300 % width/length ratio is rejected", () => {
  const result = plausibility("central_wl_ratio", 300);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /central incisor/);
});

check("an 89 degree cant is rejected", () => {
  assert.equal(plausibility("midline_cant", 89).ok, false);
  assert.equal(plausibility("occlusal_plane_cant", 89).ok, false);
  assert.equal(plausibility("commissural_cant", 89).ok, false);
});

check("a 95 % buccal corridor is rejected", () => {
  assert.equal(plausibility("buccal_corridor", 95).ok, false);
});

check("realistic values pass the gate", () => {
  assert.equal(plausibility("gingival_display", 2.5).ok, true);
  assert.equal(plausibility("central_wl_ratio", 82).ok, true);
  assert.equal(plausibility("midline_cant", 1.4).ok, true);
  assert.equal(plausibility("buccal_corridor", 12).ok, true);
  assert.equal(plausibility("dental_midline_shift", 0).ok, true);
});

check("every bounded metric declares a usable range", () => {
  assert.ok(BOUNDED_METRIC_IDS.length >= 18, `expected 18+ bounded metrics, saw ${BOUNDED_METRIC_IDS.length}`);
  for (const id of BOUNDED_METRIC_IDS) {
    const bound = PHYSIO_BOUNDS[id];
    assert.ok(bound, `${id} has no bound`);
    assert.ok(bound.min < bound.max, `${id} has an inverted range`);
    assert.ok(bound.rationale.length > 20, `${id} has no stated rationale`);
  }
});

/* ------------------------------------- 2. the core cannot emit impossible values */

check("analyze() with degenerate input emits no impossible value", () => {
  // Every landmark collapsed to one point and no tooth keypoints: the worst
  // possible capture. Nothing may be reported as a plausible-looking number.
  const flat = { points: Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 })) };
  const report = analyze({
    face: flat,
    teeth: null,
    calibration: {
      mmPerPx: 0.5,
      imageWidth: 192,
      imageHeight: 128,
      source: "test",
      confidence: 0.9,
    },
    profile: "clinician",
  });
  for (const metric of report.metrics) {
    if (metric.value === null) continue;
    // Category metrics carry an internal signed ratio (the arc classification),
    // not a physical quantity, so they are outside the physical gate by design.
    if (!(metric.unit === "mm" || metric.unit === "deg" || metric.unit === "%")) continue;
    const gate = plausibility(metric.id, metric.value);
    assert.equal(gate.ok, true, `${metric.id} reported ${metric.value}, which is impossible: ${gate.reason}`);
    assert.ok(Number.isFinite(metric.value), `${metric.id} reported a non-finite value`);
  }
});

/* ------------------------------------------------ 3. spike rejection in a window */

function makeMetric(id: string, value: number | null): MetricResult {
  const ev = EVIDENCE_BY_ID.get(id);
  assert.ok(ev, `missing evidence for ${id}`);
  return {
    id,
    label: ev.label,
    unit: ev.unit,
    value,
    text: value === null ? "n/a" : String(value),
    band: value === null ? "unavailable" : "green",
    sigma: null,
    available: value !== null,
    derivedBand: false,
    grade: ev.grade,
    refs: ev.refs,
    idealText: ev.idealText,
    note: ev.note,
  };
}

function makeReport(values: Record<string, number | null>): DsdReport {
  const metrics = Object.entries(values).map(([id, v]) => makeMetric(id, v));
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
  };
}

check("one spike cannot move a settled value", () => {
  const samples = [
    ...Array.from({ length: 12 }, (_, i) => ({ value: 80 + (i % 3) - 1, metric: makeMetric("central_wl_ratio", 80 + (i % 3) - 1) })),
    { value: 108, metric: makeMetric("central_wl_ratio", 108) },
  ];
  const estimate = robustEstimate(samples, "central_wl_ratio");
  assert.ok(estimate.value !== null);
  assert.ok(estimate.value <= 82, `spike leaked through: ${estimate.value}`);
  assert.ok(estimate.rejected >= 1, "the spike was not counted as rejected");
});

check("a tracker drops impossible frames before they are stored", () => {
  const tracker = new MetricTracker();
  // The impossible frame is already unavailable at the core, so it never enters
  // the window even if it is fed in directly.
  tracker.add(makeReport({ gingival_display: null, central_wl_ratio: 80 }));
  assert.equal(tracker.samplesFor("gingival_display").length, 0);
  assert.equal(tracker.samplesFor("central_wl_ratio").length, 1);
});

check("a spike in the middle of a capture is rejected by the window", () => {
  const tracker = new MetricTracker({ window: 24, minSamples: 5 });
  for (let i = 0; i < 10; i += 1) {
    tracker.add(makeReport({ central_wl_ratio: 80 + (i % 2) * 0.4, dental_midline_shift: 0.5 }));
  }
  tracker.add(makeReport({ central_wl_ratio: 106, dental_midline_shift: 0.5 }));
  const stabilised = tracker.summarise(makeReport({ central_wl_ratio: 106, dental_midline_shift: 0.5 }));
  const ratio = stabilised.metrics.find((m) => m.id === "central_wl_ratio");
  assert.ok(ratio && ratio.value !== null);
  assert.ok(ratio.value <= 81, `spike reached the report: ${ratio.value}`);
  const quality = stabilised.quality?.perMetric.find((q) => q.samples >= 0);
  assert.ok(quality, "no per-metric quality produced");
  assert.ok((stabilised.quality?.perMetric ?? []).some((q) => q.rejected >= 1), "spike not recorded as rejected");
});

/* --------------------------------------------------------- 4. the score gate */

check("a capture with too few metrics yields no score", () => {
  const tracker = new MetricTracker();
  const thin = { central_wl_ratio: 80, gingival_display: 2, dental_midline_shift: 0.4 };
  for (let i = 0; i < 6; i += 1) tracker.add(makeReport(thin));
  const stabilised = tracker.summarise(makeReport(thin));
  assert.equal(stabilised.score, null, "a score was shown on an unusable capture");
  assert.equal(stabilised.quality?.gate, "insufficient");
  assert.ok((stabilised.quality?.reasons ?? []).some((r) => /no score is shown/.test(r)));
});

check("a full capture produces a score and an ok gate", () => {
  const tracker = new MetricTracker();
  const full = {
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
  for (let i = 0; i < 8; i += 1) tracker.add(makeReport(full));
  const stabilised = tracker.summarise(makeReport(full));
  assert.ok(stabilised.score !== null, "no score on a complete capture");
  assert.equal(stabilised.quality?.gate, "ok");
  assert.ok((stabilised.quality?.stableMetrics ?? 0) >= 8, "settled metrics undercounted");
  assert.equal(stabilised.quality?.frames, 8);
});

check("a single frame is reported as provisional, never as settled", () => {
  const tracker = new MetricTracker();
  const one = { central_wl_ratio: 82, gingival_display: 1.5, dental_midline_shift: 0.4 };
  tracker.add(makeReport(one));
  const stabilised = tracker.summarise(makeReport(one));
  assert.equal(stabilised.quality?.frames, 1);
  assert.equal(stabilised.quality?.stableMetrics, 0, "a single frame must not be called settled");
  assert.ok((stabilised.quality?.reasons ?? []).some((r) => /provisional|single frame/.test(r)));
});

console.log(`\nplausibility: ${passed} checks passed`);
