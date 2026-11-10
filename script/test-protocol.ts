import assert from "node:assert/strict";
import {
  PHOTO_VIEWS,
  PHONETIC_CHECKS,
  UPPER_ANTERIOR,
  UPPER_PREMOLARS,
  GOLDEN_PROPORTION,
  GOLDEN_PERCENTAGE,
  RED_PROPORTION,
  NORMS,
  PRESETS,
  evaluateNorm,
  classifySmileArc,
  classifyEdgeLine,
  edgeLineCantDeg,
  poseWarning,
  fdiLabel,
  viewsForMetric,
  SIMULATION_NOTICE,
  CALIBRATION_NOTICE,
} from "../client/src/lib/dsdProtocol";

let passed = 0;
const checks: string[] = [];
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  checks.push(name);
}

/* ---- capture protocol (guide 4.1) ---- */
ok("standard photo set has 9 views with unique ids", () => {
  assert.equal(PHOTO_VIEWS.length, 9);
  assert.equal(new Set(PHOTO_VIEWS.map((v) => v.id)).size, 9);
});

ok("the three mandatory views are rest, social smile and retracted frontal", () => {
  const required = PHOTO_VIEWS.filter((v) => v.required).map((v) => v.id).sort();
  assert.deepEqual(required, ["rest", "retracted-frontal", "social"]);
});

ok("every view declares what it measures", () => {
  for (const v of PHOTO_VIEWS) assert.ok(v.measures.length > 0, v.id);
});

ok("midline is measurable from a rest or social-smile photo", () => {
  assert.ok(viewsForMetric("midline").length >= 2);
});

/* ---- phonetics (guide 4.3) ---- */
ok("phonetic validation covers M, F/V and S", () => {
  assert.equal(PHONETIC_CHECKS.length, 3);
  assert.deepEqual(PHONETIC_CHECKS.map((p) => p.sound), ["M", "F / V", "S"]);
});

/* ---- tooth reference data (guide 2.1, 2.2) ---- */
ok("upper anterior teeth are in FDI order 13 12 11 21 22 23", () => {
  assert.deepEqual(UPPER_ANTERIOR.map((t) => t.fdi), [13, 12, 11, 21, 22, 23]);
});

ok("central incisor crown is 8.5-9.0 mm wide and 10-11 mm long", () => {
  const central = UPPER_ANTERIOR.find((t) => t.fdi === 11)!;
  assert.deepEqual(central.widthMm, [8.5, 9.0]);
  assert.deepEqual(central.lengthMm, [10, 11]);
});

ok("lateral incisor is 6.0-7.0 mm wide and 8.5-9.5 mm long", () => {
  const lateral = UPPER_ANTERIOR.find((t) => t.fdi === 12)!;
  assert.deepEqual(lateral.widthMm, [6.0, 7.0]);
  assert.deepEqual(lateral.lengthMm, [8.5, 9.5]);
});

ok("canine is 7.0-8.0 mm wide and 10-11 mm long", () => {
  const canine = UPPER_ANTERIOR.find((t) => t.fdi === 13)!;
  assert.deepEqual(canine.widthMm, [7.0, 8.0]);
  assert.deepEqual(canine.lengthMm, [10, 11]);
});

ok("premolars are 6.5-7.0 mm wide", () => {
  assert.equal(UPPER_PREMOLARS.length, 4);
  for (const p of UPPER_PREMOLARS) assert.deepEqual(p.widthMm, [6.5, 7.0]);
});

ok("FDI 11 is the upper right central, 21 the upper left", () => {
  assert.ok(fdiLabel(11).includes("upper right"));
  assert.ok(fdiLabel(21).includes("upper left"));
});

/* ---- proportions (guide 5) ---- */
ok("golden proportion is 1.0 : 0.618 : 0.382", () => {
  assert.deepEqual(GOLDEN_PROPORTION, { central: 1.0, lateral: 0.618, canine: 0.382 });
});

ok("golden percentage is 25 / 15 / 10 per side and totals 100%", () => {
  assert.equal(GOLDEN_PERCENTAGE.central, 25);
  assert.equal(GOLDEN_PERCENTAGE.lateral, 15);
  assert.equal(GOLDEN_PERCENTAGE.canine, 10);
  const total = GOLDEN_PERCENTAGE.central * 2 + GOLDEN_PERCENTAGE.lateral * 2 + GOLDEN_PERCENTAGE.canine * 2;
  assert.equal(total, 100);
});

ok("per-tooth golden percentages match the table", () => {
  for (const t of UPPER_ANTERIOR) {
    const expected =
      t.nickname === "Central" ? 25 : t.nickname === "Lateral" ? 15 : 10;
    assert.equal(t.goldenPercent, expected, `FDI ${t.fdi}`);
  }
});

ok("RED proportion is 70-80%", () => {
  assert.equal(RED_PROPORTION.minPercent, 70);
  assert.equal(RED_PROPORTION.maxPercent, 80);
});

/* ---- norm evaluation (guide 5, checklist 4) ---- */
ok("width/length 77% is within the 75-80% target", () => {
  assert.equal(evaluateNorm("widthLength", 77).status, "within");
});

ok("width/length 72% is borderline and 68% is outside", () => {
  assert.equal(evaluateNorm("widthLength", 72).status, "review");
  assert.equal(evaluateNorm("widthLength", 68).status, "outside");
});

ok("width/length 88% is outside (square/short)", () => {
  assert.equal(evaluateNorm("widthLength", 88).status, "outside");
});

ok("result always states the measurement and the norm together", () => {
  const r = evaluateNorm("widthLength", 82);
  assert.ok(r.text.includes("82%"));
  assert.ok(r.text.includes("75–80%"));
});

ok("midline 1.5 mm is tolerated, 4 mm is outside", () => {
  assert.equal(evaluateNorm("midlineDeviation", 1.5).status, "within");
  assert.equal(evaluateNorm("midlineDeviation", 2.5).status, "review");
  assert.equal(evaluateNorm("midlineDeviation", 4).status, "outside");
});

ok("gingival display 1 mm is accepted, 4 mm is excessive", () => {
  assert.equal(evaluateNorm("gummyDisplay", 1).status, "within");
  assert.equal(evaluateNorm("gummyDisplay", 2.5).status, "review");
  assert.equal(evaluateNorm("gummyDisplay", 4).status, "outside");
});

ok("overjet and overbite target 2-3 mm", () => {
  assert.equal(evaluateNorm("overjet", 2.5).status, "within");
  assert.equal(evaluateNorm("overbite", 2.5).status, "within");
  assert.equal(evaluateNorm("overjet", 6).status, "outside");
});

ok("an unavailable measurement is reported as n/a, never invented", () => {
  const r = evaluateNorm("widthLength", NaN);
  assert.equal(r.status, "outside");
  assert.ok(r.text.includes("n/a"));
});

ok("unknown norm ids throw rather than silently passing", () => {
  assert.throws(() => evaluateNorm("not-a-norm", 1));
});

/* ---- shape classification (guide 5, 7.2) ---- */
ok("consonant smile arc when canine edges follow the lower lip", () => {
  assert.equal(classifySmileArc(100, 104, 10).type, "consonant");
});

ok("flat arc when the edges are level", () => {
  assert.equal(classifySmileArc(100, 100.5, 10).type, "flat");
});

ok("reverse arc when the corners rise", () => {
  assert.equal(classifySmileArc(100, 96, 10).type, "reverse");
});

ok("gull wing when the lateral is 0.5-1 mm shorter than the central", () => {
  const r = classifyEdgeLine(100, 93, 100, 10);
  assert.equal(r.pattern, "gull-wing");
  assert.ok(Math.abs(r.lateralShortMm - 0.7) < 1e-9);
});

ok("lateral-dominant when the lateral is not shorter", () => {
  assert.equal(classifyEdgeLine(100, 102, 100, 10).pattern, "lateral-dominant");
});

ok("excessive drop when the lateral is far shorter than 1 mm", () => {
  assert.equal(classifyEdgeLine(100, 80, 100, 10).pattern, "excessive-drop");
});

ok("edge-line cant is zero against a level pupil line", () => {
  const cant = edgeLineCantDeg({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 10, y: 80 }, { x: 90, y: 80 });
  assert.ok(cant < 1e-9, `cant was ${cant}`);
});

ok("edge-line cant detects a tilted edge line", () => {
  const cant = edgeLineCantDeg({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 10, y: 80 }, { x: 90, y: 90 });
  assert.ok(cant > 5, `cant was ${cant}`);
});

/* ---- safety (guide 8) ---- */
ok("large head rotation raises a warning", () => {
  assert.ok(poseWarning(15, 0));
  assert.ok(poseWarning(0, 15));
});

ok("a square-on pose raises no warning", () => {
  assert.equal(poseWarning(1, 1), null);
});

ok("presets exist and stay inside the guide's 70-85% envelope", () => {
  for (const id of ["natural", "youthful", "bold"] as const) {
    const p = PRESETS[id];
    assert.ok(p.widthLength[0] >= 70 && p.widthLength[1] <= 85, id);
  }
});

ok("norm ids are unique", () => {
  assert.equal(new Set(NORMS.map((n) => n.id)).size, NORMS.length);
});

ok("every norm carries a target and a rationale", () => {
  for (const n of NORMS) {
    assert.ok(n.target.length > 0, n.id);
    assert.ok(n.rationale.length > 0, n.id);
  }
});

ok("simulation and calibration notices are present", () => {
  assert.ok(SIMULATION_NOTICE.toLowerCase().includes("simulation"));
  assert.ok(CALIBRATION_NOTICE.toLowerCase().includes("approximate"));
});

console.log(`\nDSD protocol conformance: ${passed} checks passed\n`);
for (const c of checks) console.log(`  ok  ${c}`);
console.log("");
