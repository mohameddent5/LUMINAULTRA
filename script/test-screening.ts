/** Screening measurements on synthetic landmarks. Run with `npm run test:screen`. Behaviour pins only. */
import { summarizeFrames } from "../client/src/lib/frameStats";
import { screen, measureLines } from "../client/src/lib/screening";
import { autoDesign } from "../client/src/lib/autoDesign";
import { designSvg } from "../client/src/lib/designExport";
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
{
  const L: any = { ipl: [{ x: 0, y: 0 }, { x: 100, y: 0 }], mid: [{ x: 50, y: -50 }, { x: 50, y: 50 }], dmid: [{ x: 60, y: -10 }, { x: 60, y: 10 }], cw: 20 };
  const a = get(measureLines(L), "midline");
  check("midline: 10 px at central width 20 px is 50% and about 4.3 mm uncalibrated", /50% of central width \(about 4\.3 mm/.test(a.value) && a.level === "check");
  const b = get(measureLines({ ...L, pxPerMm: 2 }), "midline");
  check("calibrated: 10 px at 2 px/mm is 5 mm and is marked calibrated", /5 mm, calibrated/.test(b.value));
  check("a dragged eye line changes the angle", get(measureLines({ ...L, ipl: [{ x: 0, y: 0 }, { x: 100, y: 10 }] }), "eye-line").value === "5.7°");
}
{
  const L: any = { ipl: [{ x: 0, y: 0 }, { x: 100, y: 0 }], mid: [{ x: 50, y: -50 }, { x: 50, y: 50 }], dmid: [{ x: 60, y: -10 }, { x: 60, y: 10 }], cw: 20, irisPx: 23.4 };
  const a = measureLines(L);
  check("iris scale: 11.7 mm iris at 23.4 px gives 2 px/mm, midline 5 mm marked iris", /5 mm, iris/.test(get(a, "midline").value));
  check("iris scale: implied central width 10 mm is reported", /^10 mm/.test(get(a, "scale-check").value));
  const b = measureLines({ ...L, cw: 60 });
  check("iris scale: implausible central width (30 mm) is not used and is flagged", /assumed/.test(get(b, "midline").value) && get(b, "scale-check").level === "check");
  const c = measureLines({ ...L, marks: { glabella: { x: 50, y: -40 }, subnasale: { x: 70, y: 0 }, stomion: { x: 70, y: 30 }, menton: { x: 50, y: 50 }, upperLip: { x: 60, y: 28 } }, ctop: 25 });
  check("two facial midline estimates disagreeing: midline is marked not reliable", !!get(c, "midline").unreliable && !!get(c, "midline-angle").unreliable);
  const d = measureLines({ ...L, marks: { glabella: { x: 50, y: -40 }, subnasale: { x: 50, y: 0 }, stomion: { x: 50, y: 30 }, menton: { x: 50, y: 50 }, upperLip: { x: 50, y: 28 } }, ctop: 25 });
  check("agreeing estimates: midline not marked", !get(d, "midline").unreliable);
}
{
  const mk = (e: number): any => ({ eyeDeg: e, comDeg: 0.5, midPct: 1, irisRel: 0.02 });
  const fr = summarizeFrames([0.1, -0.2, 0.0, 0.2, -0.1, 0.1, 25, 0.0, -0.1, 0.2].map(mk));
  check("frame consensus: one 25 degree spike frame does not move the median or the spread", !!fr && Math.abs(fr.eye.med) < 0.15 && fr.eye.sd < 0.5);
  check("frame consensus: fewer than 5 frames gives no statistics", summarizeFrames([mk(0), mk(1)]) === null);
}
{
  const xs = [-130, -86, -43, 43, 86, 130];
  const mkT = (ys: number[]): any[] => xs.map((x, i) => tooth(300 + x, ys[i]));
  const lipAt = (x: number) => 230 - 14 * Math.pow((x - 300) / 140, 2);
  const f: any = { ...face(), lowerLip: [-170, -130, -86, -43, 0, 43, 86, 130, 170].map((x) => ({ x: 300 + x, y: lipAt(300 + x) })), mouthInner: [{ x: 130, y: 220 }, { x: 470, y: 220 }] };
  const cls = (ys: number[]) => get(screen({ face: f, teeth: mkT(ys), region }), "smile-arc")?.value || "";
  check("smile arc: edges curved like the lip is consonant", /^consonant/.test(cls([190, 196, 200, 200, 196, 190])));
  check("smile arc: straight edges is flat", /^flat/.test(cls([200, 200, 200, 200, 200, 200])));
  check("smile arc: centrals higher than canines is reverse", /^reverse/.test(cls([205, 200, 190, 190, 200, 205])));
  check("buccal corridor row is informational (ok)", get(screen({ face: f, teeth: mkT([190, 196, 200, 200, 196, 190]), region }), "buccal")?.level === "ok");
  check("no lip points: no smile arc row", !get(screen({ face: face(), teeth: teeth(), region }), "smile-arc"));
}
{
  const inp: any = { face: face(), teeth: teeth(), region };
  const d = autoDesign(inp)!;
  const wid = (n: string) => d.teeth.filter((t) => t.name.startsWith(n)).map((t) => t.wMm);
  check("design: left and right widths are identical (symmetric by construction)", ["Central", "Lateral", "Canine"].every((n) => Math.abs(wid(n)[0] - wid(n)[1]) < 1e-6));
  check("design: central height gives W/H 0.78", Math.abs(d.teeth.find((t) => t.name === "Central R")!.wh - 0.78) < 0.01);
  check("design: centrals and canines share the zenith level, laterals are lower on the screen (more incisal)", (() => { const z = (n: string) => d.teeth.find((t) => t.name === n)!.zenith.y; return Math.abs(z("Central R") - z("Canine R")) < 1 && z("Lateral R") > z("Central R"); })());
  const svg = designSvg(d, d.mmPerPx, d.scaleTag);
  check("svg export has the outlines, the gum line and a 10 mm scale bar", (svg.match(/<path/g) || []).length >= 7 && /10 mm/.test(svg));
}
check("fewer than 4 teeth: no dental values", !!get(screen({ face: null, teeth: teeth().slice(0, 3), region }), "no-teeth"));
console.log(failed ? `screening: ${failed} FAILED` : "screening: all checks passed");
process.exit(failed ? 1 : 0);
