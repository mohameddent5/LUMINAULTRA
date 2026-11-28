import { useEffect, useMemo, useRef, useState } from "react";
import { autoLines, measureLines, type Finding, type P2, type RefLines, type ScreenInput } from "@/lib/screening";

/**
 * Reference lines on the photo for the dentist: eye line, facial midline, mouth-corner line, dental midline, incisal plane.
 * Drag any handle and the numbers update. Everything starts from the automatic landmarks; nothing here is a finding.
 */
type Key = "ipl" | "mid" | "com" | "dmid" | "inc";
const COL: Record<Key, string> = { ipl: "#e2e8f0", mid: "#e2e8f0", com: "#fcd34d", dmid: "#f472b6", inc: "#38bdf8" };
const NAME: Record<Key, string> = { ipl: "Eye line", mid: "Facial midline", com: "Mouth corners", dmid: "Dental midline", inc: "Incisal plane" };

export function RefLinesEditor({ src, input, caseKey, muted, card }: { src: HTMLCanvasElement; input: ScreenInput; caseKey: string; muted: string; card: string }) {
  const auto = useMemo(() => autoLines(input), [input.teeth, input.face, input.region.x0, input.region.y0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lines, setLines] = useState<RefLines>(auto.lines);
  const [toothMm, setToothMm] = useState("");
  const [showW, setShowW] = useState(true);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ k: Key; i: number | "move" } | null>(null);
  useEffect(() => { setLines(auto.lines); setToothMm(""); }, [auto, caseKey]);
  const mm = parseFloat(toothMm);
  const pxPerMm = lines.cw && mm > 3 && mm < 15 ? lines.cw / mm : undefined;
  const L2: RefLines = { ...lines, pxPerMm };
  const findings: Finding[] = [...measureLines(L2)];
  if (!auto.enough) findings.push({ id: "no-teeth", label: "Upper teeth", value: "n/a", level: "note", note: "Fewer than 4 upper teeth were found, so no dental lines were drawn." });
  else if (!auto.trusted) findings.push({ id: "midline-unreliable", label: "Dental midline", value: "n/a", level: "note", note: "The row found is not symmetric enough (a missing, broken or merged tooth), so no dental midline was placed. Mark it by eye." });
  if (auto.asym) findings.push(auto.asym);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d")!;
    g.drawImage(src, 0, 0);
    c.dataset.lines = JSON.stringify(lines);
    const lw = Math.max(2, src.width / 450), hr = Math.max(5, src.width / 150);
    const ext = (a: P2, b: P2, k: number): [P2, P2] => [{ x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k }, { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }];
    if (lines.marks && lines.ipl) {
      const dir = { x: lines.ipl[1].x - lines.ipl[0].x, y: lines.ipl[1].y - lines.ipl[0].y };
      const dl = Math.hypot(dir.x, dir.y) || 1;
      g.setLineDash([lw * 4, lw * 4]); g.font = `600 ${Math.max(10, Math.round(src.width / 80))}px sans-serif`; g.textAlign = "left";
      (["glabella", "subnasale", "menton"] as const).forEach((n) => {
        const q = lines.marks![n], half = src.width * 0.3;
        g.strokeStyle = "rgba(148,163,184,0.8)"; g.lineWidth = Math.max(1, lw * 0.7);
        g.beginPath(); g.moveTo(q.x - (dir.x / dl) * half, q.y - (dir.y / dl) * half); g.lineTo(q.x + (dir.x / dl) * half, q.y + (dir.y / dl) * half); g.stroke();
        g.fillStyle = "rgba(203,213,225,0.95)"; g.fillText(n[0].toUpperCase() + n.slice(1), q.x + (dir.x / dl) * half + 4, q.y + (dir.y / dl) * half);
      });
      g.setLineDash([]);
    }
    (Object.keys(COL) as Key[]).forEach((k) => {
      const l = lines[k];
      if (!l) return;
      const [a, b] = k === "dmid" || k === "inc" ? ext(l[0], l[1], 0.15) : ext(l[0], l[1], k === "mid" ? 0.25 : 0.35);
      g.strokeStyle = COL[k]; g.lineWidth = lw; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.font = `600 ${Math.max(11, Math.round(src.width / 70))}px sans-serif`; g.fillStyle = COL[k]; g.textAlign = "left";
      if (k === "dmid") g.fillText(NAME[k], a.x + hr, a.y - hr); else g.fillText(NAME[k], b.x + hr, b.y);
      for (const p of l) { g.fillStyle = COL[k]; g.strokeStyle = "#0f172a"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, hr, 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (k === "dmid") { const m = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 }; g.fillStyle = COL[k]; g.beginPath(); g.rect(m.x - hr, m.y - hr, 2 * hr, 2 * hr); g.fill(); g.stroke(); }
    });
    if (showW && auto.enough) {
      const upT = input.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
      const cwPx = lines.cw || 0;
      const ppm = lines.cw && mm > 3 && mm < 15 ? lines.cw / mm : 0;
      g.textAlign = "center";
      g.font = `600 ${Math.max(10, Math.round(src.width / 90))}px sans-serif`;
      const mid0 = lines.dmid ? (lines.dmid[0].x + lines.dmid[1].x) / 2 : upT.reduce((a, t) => a + t.cx, 0) / Math.max(1, upT.length);
      const six = [...upT].sort((a, b) => Math.abs(a.cx - mid0) - Math.abs(b.cx - mid0)).slice(0, 6);
      const base = Math.max(10, Math.round(src.width / 90));
      for (const t of six) {
        const cxp = input.region.x0 + t.bx + t.bw / 2, yb = input.region.y0 + t.by + t.bh;
        const fs = Math.min(base, t.bw / 4.8);
        const wh = t.bw / Math.max(1, t.bh);
        const w1 = ppm ? `${(t.bw / ppm).toFixed(1)}mm` : cwPx ? `${Math.round((t.bw / cwPx) * 100)}%` : "";
        const two = fs >= 8;
        const f2 = Math.max(6, Math.min(base, two ? fs : t.bw / 3.2));
        g.font = `600 ${f2}px sans-serif`;
        g.fillStyle = "rgba(15,23,42,0.75)";
        g.fillRect(cxp - t.bw / 2 + 1, yb + 3, t.bw - 2, (two ? 2 : 1) * f2 + 4);
        g.fillStyle = Math.abs(wh - 0.75) > 0.12 ? "#fcd34d" : "#e2e8f0";
        g.fillText(w1, cxp, yb + 3 + f2);
        if (two) g.fillText(`W/H ${Math.round(wh * 100)}%`, cxp, yb + 3 + 2 * f2);
      }
    }
  }, [lines, src, showW, mm]); // eslint-disable-line react-hooks/exhaustive-deps

  const toCanvas = (e: React.PointerEvent) => {
    const c = cv.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const pick = (p: P2) => {
    const c = cv.current!;
    const hr = Math.max(5, c.width / 150) * 3;
    let best: { k: Key; i: number | "move"; d: number } | null = null;
    (Object.keys(COL) as Key[]).forEach((k) => {
      const l = lines[k];
      if (!l) return;
      l.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < hr && (!best || d < best.d)) best = { k, i, d }; });
      if (k === "dmid") { const m = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 }; const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < hr && (!best || d < best.d)) best = { k, i: "move", d }; }
    });
    return best as { k: Key; i: number | "move" } | null;
  };
  const down = (e: React.PointerEvent) => {
    const h = pick(toCanvas(e));
    if (!h) return;
    drag.current = h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    setLines((cur) => {
      const l = cur[d.k];
      if (!l) return cur;
      let n: [P2, P2];
      if (d.i === "move") { const dx = p.x - (l[0].x + l[1].x) / 2, dy = p.y - (l[0].y + l[1].y) / 2; n = [{ x: l[0].x + dx, y: l[0].y + dy }, { x: l[1].x + dx, y: l[1].y + dy }]; }
      else n = d.i === 0 ? [p, l[1]] : [l[0], p];
      return { ...cur, [d.k]: n };
    });
  };
  const up = () => { drag.current = null; };
  const dot = (l: string) => (l === "check" ? "bg-red-400" : l === "note" ? "bg-amber-300" : "bg-emerald-400");
  const exportPng = () => {
    cv.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "reference-lines.png";
      a.click();
    }, "image/png");
  };
  return (
    <section className={`rounded-2xl p-5 space-y-3 ${card}`} data-testid="dentist-screen" aria-label="Reference lines and screening for the dentist">
      <h2 className="font-semibold">Reference lines and screening (for the dentist)</h2>
      <p className={`text-sm ${muted}`}>Lines start from the automatic landmarks. Drag a dot to correct a line and the numbers update. Measured on this one photo with no depth. Cut-offs are not clinically validated. Prompts to look, not findings.</p>
      <canvas ref={cv} data-testid="reflines-canvas" className="w-full rounded-xl touch-none" style={{ aspectRatio: `${src.width}/${src.height}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Photo with draggable reference lines" />
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" className="underline text-base min-h-[44px]" onClick={() => setLines(auto.lines)} data-testid="reflines-reset">Reset lines</button>
        <button type="button" className="underline text-base min-h-[44px]" onClick={exportPng} data-testid="reflines-export">Save photo with lines (PNG)</button>
        <label className="text-base flex items-center gap-2"><input type="checkbox" checked={showW} onChange={(e) => setShowW(e.target.checked)} data-testid="reflines-widths" />Tooth widths and W/H</label>
        <label className="text-base flex items-center gap-2">Central incisor width (mm), optional
          <input inputMode="decimal" value={toothMm} onChange={(e) => setToothMm(e.target.value)} className="w-20 rounded-lg px-2 py-1 bg-slate-900 border border-slate-600" data-testid="reflines-mm" />
        </label>
      </div>
      {showW && <p className={`text-sm ${muted}`} data-testid="reflines-width-note">Tooth width and W/H labels come from the detected tooth boxes, which are rough (they can include gum, shadow or a neighbour): treat them as about plus or minus 15% and check by eye. Goal W/H is about 75%; amber means more than 12 points away from it.</p>}
      <p className={`text-sm ${muted}`}>{pxPerMm ? "mm values use the width you entered for the central teeth, so they are only as good as that number and the tooth boxes." : "Without a width, mm values assume 8.5 mm for a central incisor and are marked about."}</p>
      <ul className="space-y-2">
        {findings.map((f) => (
          <li key={f.id} className="text-base" data-testid={`screen-${f.id}`}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 align-baseline ${dot(f.level)}`} aria-hidden />
            <span className="font-semibold">{f.label}: {f.value}</span>
            <span className="sr-only"> ({f.level})</span>
            <span className={`block text-sm ${muted}`}>{f.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
