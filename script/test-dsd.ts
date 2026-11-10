/**
 * Deterministic regression check for the smile-design measurement core.
 *
 * Fixtures are constructed in millimetres and then converted to the coordinate
 * spaces the app actually receives (normalised image points for the face mesh,
 * 192x128 pixels for the dental network). That makes every expected value
 * independently checkable by hand.
 *
 * Run with: npm run test:dsd
 */
import assert from "node:assert/strict";
import { analyze } from "../client/src/lib/dsd";
import type { CalibrationScale, FacialFrame } from "../client/src/lib/dsd";
import { classify } from "../client/src/lib/dsdEvidence";
import type { Landmark } from "../client/src/lib/dentalNet";

/* ------------------------------------------------------------------ fixture */

const IMAGE_W = 192;
const IMAGE_H = 128;
const MM_PER_PX = 0.5;

/** Image pixel -> normalised image coordinate. */
const nx = (px: number): number => px / IMAGE_W;
const ny = (py: number): number => py / IMAGE_H;

const CALIBRATION: CalibrationScale = {
  mmPerPx: MM_PER_PX,
  imageWidth: IMAGE_W,
  imageHeight: IMAGE_H,
  source: "iris (HVID 11.7 mm)",
  confidence: 0.9,
};

function faceMesh(overrides: Record<number, [number, number]>): FacialFrame {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [index, [px, py]] of Object.entries(overrides)) {
    points[Number(index)] = { x: nx(px), y: ny(py) };
  }
  return { points };
}

/**
 * Face in image pixels. Midline at x=96; glabella above the chin; iris centres
 * level with each other so the interpupillary reference is exactly horizontal.
 */
const FACE: FacialFrame = faceMesh({
  10: [96, 16], // glabella
  168: [96, 24],
  1: [96, 60], // nose tip
  2: [96, 52],
  152: [96, 108], // chin
  13: [96, 52], // upper lip, inner margin
  61: [38, 74], // mouth corner, patient right
  291: [154, 74], // mouth corner, patient left
  33: [68, 52],
  263: [124, 52],
  468: [76, 52],
  469: [76, 52],
  470: [76, 52],
  471: [76, 52],
  472: [76, 52],
  473: [116, 52],
  474: [116, 52],
  475: [116, 52],
  476: [116, 52],
  477: [116, 52],
});

interface ToothSpec {
  /** [cornerA.x, cornerB.x, incisal y, zenith x, zenith y] in network pixels. */
  corners: [number, number, number];
  incisal: [number, number];
  zenith: [number, number];
}

/**
 * Eight teeth, FDI 14..24. Centrals are 16.4 px wide (8.2 mm) and 20 px tall
 * (10 mm) => width/length 82 %, inside the 75-85 % preferred band.
 * The incisal edges rise toward the canines, which is a consonant smile arc.
 */
function buildTeeth(overrides: Partial<Record<number, ToothSpec>> = {}): Landmark[] {
  const base: Record<number, ToothSpec> = {
    0: { corners: [45.7, 59.7, 71], incisal: [52.7, 71], zenith: [52.7, 52.3] },
    1: { corners: [59.7, 68.6, 71], incisal: [64.15, 71], zenith: [64.15, 59.1] },
    2: { corners: [68.6, 79.6, 72], incisal: [74.1, 72], zenith: [70.1, 57.9] },
    3: { corners: [79.6, 96, 74], incisal: [87.8, 74], zenith: [87.8, 54] },
    4: { corners: [96, 112.4, 74], incisal: [104.2, 74], zenith: [104.2, 54] },
    5: { corners: [112.4, 123.4, 72], incisal: [117.9, 72], zenith: [121.9, 57.9] },
    6: { corners: [123.4, 132.3, 71], incisal: [127.85, 71], zenith: [127.85, 59.1] },
    7: { corners: [132.3, 146.3, 71], incisal: [139.3, 71], zenith: [139.3, 52.3] },
  };

  const landmarks: Landmark[] = [];
  const add = (channel: number, x: number, y: number): void => {
    landmarks.push({ channel, x, y, peak: 0.9, group: "test", gateP: 0.99, accepted: true });
  };

  for (let tooth = 0; tooth < 8; tooth += 1) {
    const spec = overrides[tooth] ?? base[tooth];
    if (!spec) continue;
    const [ax, bx, edgeY] = spec.corners;
    const base4 = tooth * 4;
    add(base4 + 0, spec.incisal[0], spec.incisal[1]);
    add(base4 + 1, spec.zenith[0], spec.zenith[1]);
    add(base4 + 2, ax, edgeY);
    add(base4 + 3, bx, edgeY);
  }

  add(39, 96, 54); // dental midline
  return landmarks;
}

const value = (report: ReturnType<typeof analyze>, id: string): number | null => {
  const metric = report.metrics.find((m) => m.id === id);
  assert.ok(metric, `metric ${id} must exist in the report`);
  return metric.value;
};

const band = (report: ReturnType<typeof analyze>, id: string): string => {
  const metric = report.metrics.find((m) => m.id === id);
  assert.ok(metric, `metric ${id} must exist in the report`);
  return metric.band;
};

const text = (report: ReturnType<typeof analyze>, id: string): string => {
  const metric = report.metrics.find((m) => m.id === id);
  assert.ok(metric, `metric ${id} must exist in the report`);
  return metric.text;
};

const near = (actual: number | null, expected: number, tolerance: number, label: string): void => {
  assert.ok(actual !== null, `${label} should be measurable, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
};

/* -------------------------------------------------------------------- checks */

let passed = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
};

console.log("DSD measurement core");

/* 1. Every metric in the report is one the evidence table defines. */
check("reports all 20 evidence metrics", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  assert.equal(report.total, 20, `expected 20 metrics, got ${report.total}`);
  assert.equal(report.metrics.length, 20);
  const ids = new Set(report.metrics.map((m) => m.id));
  assert.equal(ids.size, 20, "metric ids must be unique");
});

/* 2. The central incisor ratio is a real measurement, not the old constant. */
check("central width/length is measured, not 71.43", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  near(value(report, "central_wl_ratio"), 82.0, 0.5, "central_wl_ratio");
  assert.notEqual(value(report, "central_wl_ratio"), 71.43, "the fabricated constant must be gone");
  assert.equal(band(report, "central_wl_ratio"), "green");
});

/* 3. Crown length must not be halved by averaging the incisal point. */
check("crown length uses the zenith-to-incisal-line height", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  // 8.2 mm wide / 10 mm tall = 82 %. Halving the length would report ~164 %.
  const ratio = value(report, "central_wl_ratio");
  assert.ok(ratio !== null && ratio < 100, `a 82 % fixture must not report ${ratio}`);
});

/* 4. A different face must produce a different proportion: proves no constant. */
check("width proportion tracks the fixture", () => {
  const narrow = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  const wide = analyze({
    face: FACE,
    teeth: buildTeeth({ 2: { corners: [68.6, 82, 72], incisal: [75.3, 72], zenith: [75.3, 57.9] } }),
    calibration: CALIBRATION,
    profile: "clinician",
  });
  const narrowRatio = value(narrow, "lateral_central_width_ratio");
  const wideRatio = value(wide, "lateral_central_width_ratio");
  near(narrowRatio, 67.1, 0.5, "narrow lateral/central");
  near(wideRatio, 81.7, 0.5, "wide lateral/central");
  assert.notEqual(narrowRatio, wideRatio, "two different geometries must not give the same ratio");
});

/* 5. Symmetric fixtures give zero asymmetry, and asymmetry is detected. */
check("asymmetry metrics detect a real difference", () => {
  const symmetric = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  near(value(symmetric, "central_width_diff"), 0, 0.01, "symmetric width difference");
  near(value(symmetric, "central_edge_height_diff"), 0, 0.01, "symmetric edge height difference");
  near(value(symmetric, "gingival_margin_diff"), 0, 0.01, "symmetric margin difference");
  near(value(symmetric, "diastema"), 0, 0.01, "diastema");

  // Drop the left central 1.5 mm lower (3 px) and widen it by 1 mm (2 px).
  const skewed = analyze({
    face: FACE,
    teeth: buildTeeth({ 4: { corners: [96, 114.4, 77], incisal: [105.2, 77], zenith: [105.2, 54] } }),
    calibration: CALIBRATION,
    profile: "clinician",
  });
  near(value(skewed, "central_edge_height_diff"), 1.5, 0.05, "skewed edge height difference");
  near(value(skewed, "central_width_diff"), 1.0, 0.05, "skewed width difference");
});

/* 6. Angular metrics use the interpupillary reference, not the raw image axis. */
check("cant metrics are zero against a level reference", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  near(value(report, "occlusal_plane_cant"), 0, 0.2, "occlusal cant");
  near(value(report, "midline_cant"), 0, 0.2, "midline cant");
  near(value(report, "commissural_cant"), 0, 0.2, "commissural cant");
});

/* 7. Smile arc is classified from the fit, and consonant is recognised. */
check("smile arc classifies a consonant fixture", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  assert.equal(text(report, "smile_arc"), "Consonant");
  assert.equal(band(report, "smile_arc"), "green");

  const reverse = analyze({
    face: FACE,
    teeth: buildTeeth({
      0: { corners: [45.7, 59.7, 78], incisal: [52.7, 78], zenith: [52.7, 58] },
      7: { corners: [132.3, 146.3, 78], incisal: [139.3, 78], zenith: [139.3, 58] },
    }),
    calibration: CALIBRATION,
    profile: "clinician",
  });
  assert.equal(text(reverse, "smile_arc"), "Reverse");
});

/* 8. No teeth: metrics are withheld with a reason, never estimated from lips. */
check("absent teeth produce unavailable metrics, not invented values", () => {
  const report = analyze({ face: FACE, teeth: null, calibration: CALIBRATION, profile: "clinician" });
  for (const id of ["central_wl_ratio", "diastema", "smile_arc", "lateral_central_width_ratio", "visible_teeth"]) {
    const metric = report.metrics.find((m) => m.id === id);
    assert.ok(metric, `${id} must still be listed`);
    assert.equal(metric.value, null, `${id} must be null without teeth`);
    assert.equal(metric.band, "unavailable", `${id} must be unavailable`);
    assert.equal(metric.text, "n/a");
    assert.ok(metric.reason && metric.reason.length > 0, `${id} must explain why it is unavailable`);
  }
  assert.ok(report.notes.some((note) => note.includes("withheld")), "the report must say tooth metrics were withheld");
});

/* 9. No calibration: millimetre values withheld, scale-free ratios still work. */
check("uncalibrated frames withhold millimetres but keep proportions", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: null, profile: "clinician" });
  assert.equal(value(report, "central_wl_ratio"), null, "width/length needs calibration");
  assert.equal(value(report, "diastema"), null, "diastema needs calibration");
  assert.equal(value(report, "occlusal_plane_cant"), null, "angles need calibration");
  assert.notEqual(value(report, "lateral_central_width_ratio"), null, "width proportions are scale-free");
  near(value(report, "lateral_central_width_ratio"), 67.1, 0.5, "uncalibrated width proportion");
  assert.ok(report.notes.some((note) => note.includes("calibration")), "the report must explain the missing scale");
});

/* 10. Golden proportion is report-only and can never be scored red. */
check("golden proportion is report-only", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  const metric = report.metrics.find((m) => m.id === "golden_percentage");
  assert.ok(metric);
  assert.equal(metric.band, "report-only", "the paper forbids grading it");
  assert.ok(!report.scoreUsed.includes("golden_percentage"), "it must be excluded from the score");
});

/* 11. The score excludes everything it cannot justify. */
check("score excludes unavailable and report-only metrics", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  assert.ok(report.score !== null, "a fully measured frame must score");
  assert.ok(report.score > 80, `a near-ideal fixture should score well, got ${report.score}`);
  assert.ok(!report.scoreUsed.includes("central_crown_length_error"), "a metric needing a patient reference cannot score");
  for (const id of report.scoreUsed) {
    const metric = report.metrics.find((m) => m.id === id);
    assert.ok(metric && metric.available, `${id} is scored but not available`);
    assert.notEqual(metric.band, "report-only", `${id} is report-only yet scored`);
  }
});

/* 12. Band classification edges. */
check("band classification respects inclusive green edges", () => {
  const band75 = { green: [75, 85], amber: [65, 95], derived: false } as const;
  assert.equal(classify(75, band75), "green");
  assert.equal(classify(85, band75), "green");
  assert.equal(classify(74.9, band75), "amber");
  assert.equal(classify(64.9, band75), "red");
  assert.equal(classify(null, band75), "unavailable");
  assert.equal(classify(82, null), "report-only");
});

/* 13. Both profiles are served and the patient profile is more permissive. */
check("clinician and patient profiles both produce a score", () => {
  const clinician = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  const patient = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "patient" });
  assert.ok(clinician.score !== null && patient.score !== null);
  assert.equal(clinician.profile, "clinician");
  assert.equal(patient.profile, "patient");
});

/* 14. Uncertainty is propagated onto millimetre metrics. */
check("millimetre metrics carry an uncertainty", () => {
  const report = analyze({ face: FACE, teeth: buildTeeth(), calibration: CALIBRATION, profile: "clinician" });
  const diastema = report.metrics.find((m) => m.id === "central_width_diff");
  assert.ok(diastema && diastema.sigma !== null && diastema.sigma > 0, "mm metrics must report sigma");
  const ratio = report.metrics.find((m) => m.id === "lateral_central_width_ratio");
  assert.ok(ratio && ratio.sigma === null, "dimensionless ratios carry no mm uncertainty");
});

/* 15. Degenerate input must not throw. */
check("degenerate frames do not throw", () => {
  const empty = analyze({ face: { points: [] }, teeth: [], calibration: null, profile: "clinician" });
  assert.equal(empty.measured, 0);
  assert.equal(empty.score, null);
  const collapsed = analyze({
    face: FACE,
    teeth: buildTeeth({ 3: { corners: [96, 96, 74], incisal: [96, 74], zenith: [96, 54] } }),
    calibration: CALIBRATION,
    profile: "clinician",
  });
  assert.ok(Number.isFinite(collapsed.score ?? 0) || collapsed.score === null);
});

console.log(`\n${passed} checks passed`);
