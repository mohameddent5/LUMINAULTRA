/** Screening measurements on synthetic landmarks. Run with `npm run test:screen`. Behaviour pins only. */
import { screen } from "../client/src/lib/screening";
let failed = 0;
const check = (n: string, ok: boolean) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${n}`); if (!ok) failed++; };
const tooth = (cx: number, bottom: number, w = 40, h = 52): any => ({ cx, cy: bottom - h / 2, bx: cx - w / 2, by: bottom - h, bw: w, bh: h, incisalDown: true });
const row = (shift = 0, slopeDeg = 0): any[] => [-125, -85, -45, 0, 45, 85, 125].map((x, i) => { void i; return tooth(300 + x + (x > 0 ? 0 : 0) + shift, 200 + Math.tan((slopeDeg * Math.PI) / 180) * x); });
// 6 teeth with the gap at x=300: centres at 255,... build explicit
const teeth = (slope = 0, shift = 0): any[] => [-130, -86, -43, 43, 86, 130].map((x) => tooth(300 + x + shift, 200 + Math.tan((slope * Math.PI) / 180) * x));
const region = { x0: 0, y0: 0 };
const face = (rollDeg = 0, midX = 300): any => ({ ipl: [{ x: 100, y: 100 }, { x: 500, y: 100 + 400 * Math.tan((rollDeg * Math.PI) / 180) }], mid: [{ x: midX, y: 50 }, { x: midX, y: 400 }], com: [{ x: 200, y: 200 }, { x: 400, y: 200 + 200 * Math.tan((rollDeg * Math.PI) / 180) }] });
const get = (a: any[], id: string) => a.find((x) => x.id === id);
void row;
{
  const a = screen({ face: face(), teeth: teeth(), region });
  check("level symmetric case: eye line ok", get(a, "eye-line").level === "ok");
  check("level symmetric case: midline ok", get(a, "midline").level === "ok");
  check("level symmetric case: incisal plane ok", get(a, "incisal-plane").level === "ok");
  check("level symmetric case: asymmetry ok", get(a, "incisal-asym").level === "ok");
}
{
  const a = screen({ face: face(6), teeth: teeth(6), region });
  check("6 degree roll flagged on the eye line", get(a, "eye-line").level === "check");
  check("teeth rolled with the head: plane cant vs eye line stays ok", get(a, "incisal-plane").level === "ok");
}
{
  const a = screen({ face: face(), teeth: teeth(5), region });
  const p = get(a, "incisal-plane");
  check("incisal plane 5 degrees off the eye line is flagged", p.level === "check" && /patient's left side lower/.test(p.value));
}
{
  const a = screen({ face: face(), teeth: teeth(0, 14), region });
  const m = get(a, "midline");
  check("dental midline shifted about a third of a central width is flagged", m.level !== "ok" && /patient's left/.test(m.value));
  const b = screen({ face: face(0, 314), teeth: teeth(0, 14), region });
  check("coincident midlines are ok", get(b, "midline").level === "ok");
}
{
  const a = screen({ face: null, teeth: teeth(), region });
  check("no face: facial references reported as n/a, no midline or eye line", get(a, "no-face") && !get(a, "midline") && !get(a, "eye-line"));
  check("no face: incisal plane is against the image horizontal", /image horizontal/.test(get(a, "incisal-plane").label));
}
{
  const a = screen({ face: face(), teeth: [-130, -86, -43, 43, 86].map((x) => tooth(300 + x, 200)), region });
  check("only 2 teeth on one side: midline and central edges not reported, incisal plane still is", !!get(a, "midline-unreliable") && !get(a, "midline") && !get(a, "incisal-asym") && !!get(a, "incisal-plane"));
}
check("fewer than 4 teeth: no dental values", !!get(screen({ face: null, teeth: teeth().slice(0, 3), region }), "no-teeth"));
console.log(failed ? `screening: ${failed} FAILED` : "screening: all checks passed");
process.exit(failed ? 1 : 0);
