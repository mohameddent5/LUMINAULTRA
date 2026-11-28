import { useEffect, useMemo, useRef } from "react";
import { autoDesign } from "@/lib/autoDesign";
import type { ScreenInput } from "@/lib/screening";
import { smoothSegments, designSvg } from "@/lib/designExport";

/** Automatic proposed design next to the untouched photo. Estimated from ratios; not a finished treatment plan. */
export function ProposedDesign({ src, input, flags, muted, card }: { src: HTMLCanvasElement; input: ScreenInput; flags: string[]; muted: string; card: string }) {
  const d = useMemo(() => autoDesign(input), [input.teeth, input.face, input.region.x0, input.region.y0]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!d || !a.current || !b.current) return;
    const bb = d.bbox, w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
    const padX = w * 0.35, padY = h * 0.6;
    const sx = Math.max(0, bb.x0 - padX), sy = Math.max(0, bb.y0 - padY);
    const sw = Math.min(src.width - sx, w + 2 * padX), sh = Math.min(src.height - sy, h + 2 * padY);
    const scale = Math.min(2.2, 560 / sw);
    for (const [c, after] of [[a.current, false], [b.current, true]] as const) {
      c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      const g = c.getContext("2d")!;
      g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (!after) continue;
      g.save(); g.scale(scale, scale); g.translate(-sx, -sy);
      const lw = Math.max(1.2, sw / 330);
      const path = (poly: { x: number; y: number }[]) => { g.beginPath(); g.moveTo(poly[0].x, poly[0].y); for (const s of smoothSegments(poly)) g.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y); g.closePath(); };
      g.lineJoin = "round";
      for (const t of d.teeth) { path(t.poly); g.fillStyle = "rgba(255,255,255,0.22)"; g.fill(); g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = lw; g.stroke(); }
      g.setLineDash([lw * 3, lw * 2]); g.strokeStyle = "#f472b6"; g.lineWidth = lw; g.beginPath(); d.gum.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#f472b6"; for (const p of d.gum) { g.beginPath(); g.arc(p.x, p.y, lw * 1.6, 0, 6.3); g.fill(); }
      g.strokeStyle = "#38bdf8"; g.beginPath(); g.moveTo(d.plane[0].x, d.plane[0].y); g.lineTo(d.plane[1].x, d.plane[1].y); g.stroke();
      g.strokeStyle = "#fcd34d"; g.beginPath(); g.moveTo(d.midline[0].x, d.midline[0].y); g.lineTo(d.midline[1].x, d.midline[1].y); g.stroke();
      g.font = `600 ${Math.max(8, sw / 38)}px sans-serif`; g.textAlign = "center"; g.fillStyle = "#fff"; g.strokeStyle = "rgba(15,23,42,0.85)"; g.lineWidth = lw * 2;
      for (const t of d.teeth) { const s = `${t.widthRel.toFixed(2)}`; g.strokeText(s, t.edge.x, t.edge.y + sw / 30); g.fillText(s, t.edge.x, t.edge.y + sw / 30); }
      g.restore();
    }
  }, [d, src]);
  if (!d) return <section className={card} data-testid="proposed-design"><h3 className="text-xl font-semibold">Proposed design (automatic)</h3><p className={muted}>Fewer than 3 upper teeth were found, so no design was drawn. Retake with the upper front teeth in frame.</p></section>;
  return (
    <section className={card} data-testid="proposed-design">
      <h3 className="text-xl font-semibold">Proposed design (automatic, for the dentist)</h3>
      <p className={muted}>Left: the photo as taken. Right: proposed outlines for the six upper front teeth, gingival zenith line (pink), incisal plane (blue) and midline (yellow). The numbers under the teeth are widths relative to the central incisor (1.00). Drawn from ratios and the detected crown widths, so it appears even when decay or quality checks raise a flag.</p>
      <div className="flex flex-wrap gap-3 mt-2">
        <figure><canvas ref={a} className="max-w-full rounded" data-testid="design-before" /><figcaption className={muted}>Before (photo)</figcaption></figure>
        <figure><canvas ref={b} className="max-w-full rounded" data-testid="design-after" /><figcaption className={muted}>Proposed (estimated outlines, not a simulated result)</figcaption></figure>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className="px-3 py-1 rounded border" data-testid="export-png" onClick={() => { const c = b.current; if (!c) return; const l = document.createElement("a"); l.download = "dsd-proposed.png"; l.href = c.toDataURL("image/png"); l.click(); }}>Save PNG (proposed)</button>
        <button type="button" className="px-3 py-1 rounded border" data-testid="export-svg" onClick={() => { const l = document.createElement("a"); l.download = "dsd-outline.svg"; l.href = URL.createObjectURL(new Blob([designSvg(d)], { type: "image/svg+xml" })); l.click(); }}>Save outline (SVG)</button>
      </div>
      <ul className={`${muted} list-disc pl-5 mt-2`}>
        <li data-testid="design-source">Outline source: {d.basis.fitted} of 6 teeth use the detected crown width (when it is within 20% below to 25% above the ratio width), {d.basis.ratio} use the generic ratio width (detection missing or implausible).</li>
        <li>Midline: {d.basis.midline}. Incisal plane: {d.basis.plane}. Size: {d.basis.span} ({d.basis.nUsed} teeth used).</li>
        <li>Generic ratio is the RED 75% rule (each tooth 75% of the apparent width of the one nearer the midline: central 1, lateral 0.75, canine 0.56), a teaching choice; height = width / 0.78 is derived from a W/H goal, not measured, laterals about 7% shorter, lateral zeniths about 8% lower. Tooth boxes are rough (plus or minus 15%), so check size by eye.</li>
        {flags.map((f) => <li key={f}>Flag: {f}</li>)}
      </ul>
    </section>
  );
}
