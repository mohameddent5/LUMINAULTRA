/**
 * Parity check: the TypeScript port must reproduce `evaluate.py` exactly.
 *
 * The expected values are produced by the authoritative Python script:
 *
 *     python3 evaluate.py shared/benchmark-selftest.gt.json \
 *         shared/benchmark-selftest.pred.json 2.0 shared/benchmark-selftest.expected.json
 *
 * Run: npx tsx script/check_benchmark_parity.ts
 * Exits non-zero on any mismatch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, toMarkdown } from "../client/src/lib/benchmark";

const root = process.cwd();
const read = (name: string) => JSON.parse(readFileSync(join(root, "shared", name), "utf8"));

const gt = read("benchmark-selftest.gt.json");
const pred = read("benchmark-selftest.pred.json");
const expected = read("benchmark-selftest.expected.json");

const actual = evaluate(gt, pred, 2.0);

const diffs: string[] = [];
const TOL = 1e-9;

function walk(a: unknown, b: unknown, path: string): void {
  if (typeof a === "number" && typeof b === "number") {
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    if (Math.abs(a - b) > TOL * scale) diffs.push(`${path}: ts=${a} py=${b}`);
    return;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    if (a !== b) diffs.push(`${path}: ts=${JSON.stringify(a)} py=${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (!Array.isArray(aa) || !Array.isArray(bb)) {
      diffs.push(`${path}: shape mismatch`);
      return;
    }
    if (aa.length !== bb.length) {
      diffs.push(`${path}: length ts=${aa.length} py=${bb.length}`);
      return;
    }
    aa.forEach((v, i) => walk(v, bb[i], `${path}[${i}]`));
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of [...keys].sort()) {
      if (k.startsWith("_")) continue; // fixture notes are not metrics
      if (!(k in ao)) {
        diffs.push(`${path}.${k}: missing in TypeScript`);
        continue;
      }
      if (!(k in bo)) {
        diffs.push(`${path}.${k}: unexpected in TypeScript`);
        continue;
      }
      walk(ao[k], bo[k], `${path}.${k}`);
    }
    return;
  }
  if (a !== b) diffs.push(`${path}: ts=${JSON.stringify(a)} py=${JSON.stringify(b)}`);
}

walk(actual, expected, "$");

console.log(toMarkdown(actual, "Landmark benchmark (TypeScript port)"));
console.log(`images=${gt.images.length} annotated=${actual.n_annotated}`);

if (diffs.length) {
  console.error(`\nPARITY FAILED — ${diffs.length} difference(s):`);
  for (const d of diffs.slice(0, 40)) console.error(`  ${d}`);
  process.exit(1);
}

console.log("PARITY OK — TypeScript port matches evaluate.py on every metric.");
