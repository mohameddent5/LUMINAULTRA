/** Lower-row guard tests on synthetic masks. Run with `npm run test:rowguard`. */
import { upperRowSuspect, type GuardMask } from "../client/src/lib/rowGuard";
let failed = 0;
const check = (n: string, ok: boolean) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${n}`); if (!ok) failed++; };
const m = (x0: number, y0: number, w = 30, h = 50): GuardMask => ({ x0, x1: x0 + w, y0, y1: y0 + h, cy: y0 + h / 2, area: w * h * 0.8, lum: 150 });
const row = [0, 1, 2, 3, 4, 5].map((i) => m(100 + i * 32, 300));
const big = { x0: 100, x1: 130 };
const run = (others: GuardMask[], teeth = row) => upperRowSuspect(teeth, others, big, 50, 100, 600, 500);
check("no other masks: not suspect", run([]) === false);
check("tooth-sized mask above and centred: suspect", run([m(180, 200)]) === true);
check("same mask touching the image border: ignored", run([m(180, 0)]) === false);
check("mask beside the row, not centred over it: ignored", run([m(400, 200)]) === false);
check("mask far too big (face or gum): ignored", run([m(150, 150, 120, 120)]) === false);
check("dim mask: ignored", run([{ ...m(180, 200), lum: 60 }]) === false);
check("mask below the row (lower teeth under a correct upper row): ignored", run([m(180, 360)]) === false);
check("mask overlapping the row height: ignored", run([m(180, 280)]) === false);
check("empty teeth: not suspect", run([m(180, 200)], []) === false);
console.log(failed ? `rowguard: ${failed} FAILED` : "rowguard: all checks passed");
process.exit(failed ? 1 : 0);
