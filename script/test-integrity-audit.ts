/**
 * Regression test for the executable integrity audit.
 *
 * The validation page now proves the physiological gate rather than describing
 * it, so the audit itself needs to be pinned: if someone loosens a bound, widens
 * the rejection threshold or removes the score gate, this script fails before
 * the page can quietly claim a property that no longer holds.
 *
 * Run with: npm run test:integrity
 */
import { runIntegrityAudit } from "../client/src/lib/integrityAudit";
import { BOUNDED_METRIC_IDS, PHYSIO_BOUNDS, plausibility } from "../client/src/lib/physioBounds";

const audit = runIntegrityAudit();
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Integrity audit\n");

for (const c of audit.checks) {
  check(`${c.id}: ${c.title}`, c.status !== "fail", `${c.status} — ${c.measured}`);
}

console.log("");

// The audit must be complete, not merely free of failures.
check("audits every listed property", audit.total === audit.checks.length && audit.total >= 9, `${audit.total} checks`);
check("exercises the whole bounded metric set", audit.boundedMetrics >= 19, `${audit.boundedMetrics} metrics`);
check("no property is merely warned about", audit.warned === 0, `${audit.warned} warnings`);
check("overall verdict is hold", audit.verdict === "hold", audit.verdict);

// Every check must carry measured evidence a reader could inspect.
for (const c of audit.checks) {
  check(`${c.id} reports a measurement`, c.measured.trim().length > 20, c.measured);
  check(`${c.id} explains its meaning`, c.detail.trim().length > 20, c.detail);
}

// The audit must be deterministic: same verdicts on a second run.
const again = runIntegrityAudit();
check(
  "identical verdicts on a repeat run",
  JSON.stringify(again.checks.map((c) => [c.id, c.status, c.measured])) ===
    JSON.stringify(audit.checks.map((c) => [c.id, c.status, c.measured])),
);

/* ------------------------------------------------------- gate robustness */
// The audit above proves the properties the page advertises. These cases pin the
// gate's behaviour on inputs the capture pipeline can actually produce: a
// landmark that never converged (NaN), a division by a zero-width reference
// (Infinity), a metric that arrived missing, and a value of the wrong type from
// a stale cached report. Each one used to be a way to get a number into the
// report that no clinician could defend.

console.log("Gate robustness\n");

check(
  "an unlisted metric passes through untouched (documented scope)",
  plausibility("not_a_metric", 42).ok === true,
);

// Exact edges and the first representable step outside them, for every bound.
const edgeFailures: string[] = [];
const outsideFailures: string[] = [];
const substituteFields: string[] = [];

for (const id of BOUNDED_METRIC_IDS) {
  const bound = PHYSIO_BOUNDS[id];
  const span = bound.max - bound.min;
  const eps = Math.max(span * 1e-6, 1e-6);

  if (!plausibility(id, bound.min).ok) edgeFailures.push(`${id} refuses its own min ${bound.min}`);
  if (!plausibility(id, bound.max).ok) edgeFailures.push(`${id} refuses its own max ${bound.max}`);
  if (plausibility(id, bound.min - eps).ok) outsideFailures.push(`${id} accepts ${bound.min - eps}`);
  if (plausibility(id, bound.max + eps).ok) outsideFailures.push(`${id} accepts ${bound.max + eps}`);

  for (const verdict of [plausibility(id, bound.min - eps), plausibility(id, bound.max + eps)]) {
    for (const [key, value] of Object.entries(verdict)) {
      if (key !== "ok" && typeof value === "number") substituteFields.push(`${id}.${key}`);
    }
  }
}

check("every bound accepts its own minimum and maximum exactly", edgeFailures.length === 0, edgeFailures.slice(0, 3).join("; "));
check("every bound refuses the first step outside either end", outsideFailures.length === 0, outsideFailures.slice(0, 3).join("; "));
check("no refusal carries a substitute number", substituteFields.length === 0, substituteFields.slice(0, 3).join(", "));

// Non-finite values: NaN compares false against every bound, so it is the one
// input that a naive `value < min || value > max` test would wave through.
for (const [name, value] of [
  ["NaN", Number.NaN],
  ["+Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
] as Array<[string, number]>) {
  const verdict = plausibility("central_wl_ratio", value);
  check(`${name} is refused`, verdict.ok === false);
  check(`${name} refusal states a reason`, (verdict.reason ?? "").trim().length > 10, verdict.reason ?? "(no reason)");
}

// Missing and mistyped values from a stale or partially-populated report.
for (const [name, value] of [
  ["null", null],
  ["undefined", undefined],
  ['the string "80"', "80"],
  ["a plain object", { value: 80 }],
  ["an array", [80]],
  ["a boolean", true],
] as Array<[string, unknown]>) {
  const verdict = plausibility("central_wl_ratio", value as unknown as number);
  check(`${name} is refused, not coerced`, verdict.ok === false);
}

// Values far outside any human range, including the extremes of the float type.
for (const [name, value] of [
  ["Number.MAX_VALUE", Number.MAX_VALUE],
  ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  ["Number.MIN_VALUE", Number.MIN_VALUE],
  ["1e21", 1e21],
  ["-1e21", -1e21],
] as Array<[string, number]>) {
  check(`${name} is refused`, plausibility("central_wl_ratio", value).ok === false);
}

// The gate is per-metric by design: it cannot see that a 70 % central share and
// a 100 % lateral/central ratio cannot describe the same mouth. Pinned so that
// nobody reads the audit as a cross-metric consistency proof.
check(
  "gate is per-metric: contradictory pairs are individually in range (documented scope)",
  plausibility("golden_percentage", 70).ok && plausibility("lateral_central_width_ratio", 100).ok,
);

// Repeated identical evaluation must return identical verdicts and reasons.
const repeatRuns = [0, 1, 2].map(() =>
  JSON.stringify(BOUNDED_METRIC_IDS.map((id) => plausibility(id, PHYSIO_BOUNDS[id].max + 1))),
);
check("gate verdicts are identical across repeated runs", new Set(repeatRuns).size === 1);

console.log("");
if (failures > 0) {
  console.error(`${failures} integrity audit check(s) failed`);
  process.exit(1);
}
console.log(
  `All ${audit.checks.length} integrity properties hold (${audit.passed}/${audit.total} pass, 0 fail); ` +
    `${BOUNDED_METRIC_IDS.length} bounds exercised at and beyond their edges`,
);
