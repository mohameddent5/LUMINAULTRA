/** Spacing geometry tests on synthetic tooth boxes. Run with `npm run test:spacing`. */
import { spacingNotes, upperGaps } from "../client/src/lib/spacingGeometry";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
}
// arch boxes overlap by about 20% of width, as on his plain photos
function row(gaps: number[]) {
  const teeth: any[] = [];
  let x = 0;
  for (let i = 0; i < gaps.length + 1; i++) {
    teeth.push({ id: i + 1, bx: x, by: 10, bw: 50, bh: 60 });
    x += 50 + (gaps[i] ?? 0) * 50;
  }
  return { teeth } as any;
}
const plain = row([-0.2, -0.2, -0.2, -0.2, -0.2]);
check("plain row gives no note", spacingNotes(plain).length === 0);
const noisy = row([-0.24, -0.1, -0.2, -0.16, -0.2]);
check("12% jitter gives no note", spacingNotes(noisy).length === 0);
const diastema = row([-0.2, -0.2, 0.4, -0.2, -0.2]);
const n = spacingNotes(diastema);
check("diastema pair fires as space", n.length === 1 && n[0].kind === "space" && n[0].between[0] === 3);
const missing = row([-0.2, -0.2, 0.7, -0.2, -0.2]);
const m = spacingNotes(missing);
check("wide gap fires as missing", m.length === 1 && m[0].kind === "missing");
check("fewer than 4 teeth gives nothing", upperGaps(row([0.5, 0.5])).length === 0);
check("null engine gives nothing", spacingNotes(null).length === 0);
const lower = { teeth: [...plain.teeth, { id: 99, bx: 20, by: 200, bw: 50, bh: 60 }] } as any;
check("a lower-row box is ignored", upperGaps(lower).length === 5);
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("spacing: all checks passed");
