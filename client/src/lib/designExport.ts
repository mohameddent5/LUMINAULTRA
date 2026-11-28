import type { AutoDesign } from "./autoDesign";
import type { P2 } from "./screening";

/** Closed Catmull-Rom spline through the polygon points, as cubic Bezier segments. Same curve for the canvas and the SVG. */
export function smoothSegments(poly: P2[], tension = 0.5): { c1: P2; c2: P2; to: P2 }[] {
  const n = poly.length, k = tension / 3 * 2;
  const out: { c1: P2; c2: P2; to: P2 }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n], p3 = poly[(i + 2) % n];
    out.push({ c1: { x: p1.x + (p2.x - p0.x) * k / 2 * 1.0, y: p1.y + (p2.y - p0.y) * k / 2 }, c2: { x: p2.x - (p3.x - p1.x) * k / 2, y: p2.y - (p3.y - p1.y) * k / 2 }, to: p2 });
  }
  return out;
}

export function smoothPathD(poly: P2[]): string {
  const f = (v: number) => v.toFixed(1);
  const segs = smoothSegments(poly);
  return `M${f(poly[0].x)} ${f(poly[0].y)}` + segs.map((s) => `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.to.x)} ${f(s.to.y)}`).join("") + "Z";
}

/** Open Catmull-Rom spline through points (the gum scallop). */
export function openSegments(pts: P2[]): { c1: P2; c2: P2; to: P2 }[] {
  const out: { c1: P2; c2: P2; to: P2 }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    out.push({ c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, to: p2 });
  }
  return out;
}
export function openPathD(pts: P2[]): string {
  const f = (v: number) => v.toFixed(1);
  return `M${f(pts[0].x)} ${f(pts[0].y)}` + openSegments(pts).map((s) => `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.to.x)} ${f(s.to.y)}`).join("");
}

/** Simple outline SVG: no photo, no tooth library. Units are source-photo pixels unless mmPerPx is given (then a scale bar of 10 mm is added). */
export function designSvg(d: AutoDesign, mmPerPx?: number | null): string {
  const pad = 20, b = d.bbox, W = b.x1 - b.x0 + 2 * pad, H = b.y1 - b.y0 + 2 * pad;
  const ox = b.x0 - pad, oy = b.y0 - pad;
  const tr = (p: P2): P2 => ({ x: p.x - ox, y: p.y - oy });
  const line = (a: P2, c: P2, col: string, dash = "") => { const p = tr(a), q = tr(c); return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${col}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`; };
  const teeth = d.teeth.map((t) => `<path d="${smoothPathD(t.poly.map(tr))}" fill="none" stroke="#111" stroke-width="1.5"><title>${t.name}: ${t.wMm.toFixed(1)} x ${t.hMm.toFixed(1)} mm (${d.scaleTag} scale), height from ${t.heightFrom}</title></path>`).join("");
  const gum = openPathD(d.gumCurve.map(tr));
  let bar = "";
  if (mmPerPx && mmPerPx > 0) { const L = 10 / mmPerPx; bar = `<line x1="${pad}" y1="${H - 8}" x2="${(pad + L).toFixed(1)}" y2="${H - 8}" stroke="#111" stroke-width="2"/><text x="${pad}" y="${H - 12}" font-size="10" font-family="sans-serif">10 mm (scale estimated)</text>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}"><rect width="100%" height="100%" fill="#fff"/>${teeth}<path d="${gum}" fill="none" stroke="#db2777" stroke-width="1.4"/>${line(d.plane[0], d.plane[1], "#0284c7")}${line(d.midline[0], d.midline[1], "#d97706")}${bar}<text x="${pad}" y="12" font-size="9" font-family="sans-serif" fill="#555">Estimated outline from ratios, not a simulated result. Dentist must verify.</text></svg>`;
}
