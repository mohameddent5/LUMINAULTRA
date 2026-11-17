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
check("audits every listed property", audit.total === audit.checks.length && audit.total >= 8, `${audit.total} checks`);
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

console.log("");
if (failures > 0) {
  console.error(`${failures} integrity audit check(s) failed`);
  process.exit(1);
}
console.log(`All ${audit.checks.length} integrity properties hold (${audit.passed}/${audit.total} pass, 0 fail)`);
