import { useEffect, useMemo, useRef } from "react";
import { autoDesign } from "@/lib/autoDesign";
import type { ScreenInput } from "@/lib/screening";
import { smoothSegments, openSegments, designSvg } from "@/lib/designExport";

/** Automatic proposed design next to the untouched photo. Estimated from ratios; not a finished treatment plan. */
export function ProposedDesign({ src, input, flags, muted, card }: { src: HTMLCanvasElement; input: ScreenInput; flags: string[]; muted: string; card: string }) {
  const d = useMemo(() => autoDesign(input, src), [input.teeth, input.face, input.region.x0, input.region.y0, src]); // eslint-disable-line react-hooks/exhaustive-deps
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
      // full-width horizontal reference line (parallel to the incisal plane) and the plane itself over the teeth
      const ux = Math.cos(d.angle), uy = Math.sin(d.angle), far = Math.max(sw, sh) * 2;
      g.strokeStyle = "rgba(56,189,248,0.8)"; g.lineWidth = lw; g.beginPath(); g.moveTo(d.origin.x - ux * far, d.origin.y - uy * far); g.lineTo(d.origin.x + ux * far, d.origin.y + uy * far); g.stroke();
      // scalloped gum line through the zeniths (papilla height is schematic)
      g.strokeStyle = "#f472b6"; g.lineWidth = lw * 1.3; g.beginPath(); g.moveTo(d.gumCurve[0].x, d.gumCurve[0].y);
      for (const s of openSegments(d.gumCurve)) g.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
      g.stroke();
      g.fillStyle = "#f472b6"; for (const p of d.gum) { g.beginPath(); g.arc(p.x, p.y, lw * 1.6, 0, 6.3); g.fill(); }
      g.strokeStyle = "#fcd34d"; g.beginPath(); g.moveTo(d.midline[0].x, d.midline[0].y); g.lineTo(d.midline[1].x, d.midline[1].y); g.stroke();
      // height arrows (zenith to edge) with mm labels, ratio under each tooth
      const fs = Math.max(7, sw / 46);
      g.font = `600 ${fs}px sans-serif`; g.textAlign = "center";
      for (const t of d.teeth) {
        g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(t.zenith.x, t.zenith.y + lw * 2); g.lineTo(t.edge.x, t.edge.y - lw * 2); g.stroke();
        const lx = t.zenith.x, ly = (t.zenith.y + t.edge.y) / 2;
        const tag = t.heightFrom === "gum colour step" ? "" : "*";
        g.fillStyle = "#fff"; g.strokeStyle = "rgba(15,23,42,0.85)"; g.lineWidth = lw * 2;
        const hs = `${t.hMm.toFixed(1)}${tag}`, ws = `${t.wMm.toFixed(1)}`;
        g.strokeText(hs, lx, ly); g.fillText(hs, lx, ly);
        g.strokeText(ws, t.edge.x, t.edge.y + fs * 1.1); g.fillText(ws, t.edge.x, t.edge.y + fs * 1.1);
        const rs = t.widthRel.toFixed(2); g.strokeText(rs, t.edge.x, t.edge.y + fs * 2.3); g.fillText(rs, t.edge.x, t.edge.y + fs * 2.3);
      }
      g.restore();
    }
  }, [d, src]);
  if (!d) return <section className={card} data-testid="proposed-design"><h3 className="text-xl font-semibold">Proposed design (automatic)</h3><p className={muted}>Fewer than 3 upper teeth were found, so no design was drawn. Retake with the upper front teeth in frame.</p></section>;
  return (
    <section className={card} data-testid="proposed-design">
      <h3 className="text-xl font-semibold">Proposed design (automatic, for the dentist)</h3>
      <p className={muted}>Left: the photo as taken. Right: proposed outlines for the six upper front teeth, gingival zenith line (pink), incisal plane (blue) and midline (yellow). On each tooth: crown height in mm (an asterisk means derived from the width, no gum margin was found), then width in mm, then width relative to the central incisor (1.00). The mm values use the {d.scaleTag} scale, so treat them as about plus or minus {d.scaleTag === "iris" ? 12 : 20}%. The long blue line is the horizontal reference line. Drawn from ratios and the detected crown widths, so it appears even when decay or quality checks raise a flag.</p>
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
