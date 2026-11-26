import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

// Private landmark labeling tool. Images are opened from the user's disk, drawn in the browser and never
// uploaded. Only the exported JSON (point names and pixel coordinates) leaves the page, by download.
// Point names follow the engine output seen in the clinic's own screenshots: zenNN, papNN|MM, incNN, disNN, dental_midline.
const UPPER = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27"];
const PAIRS = UPPER.slice(0, -1).map((t, i) => `${t}|${UPPER[i + 1]}`);
const NAMES = [
  "dental_midline",
  ...UPPER.map((t) => `zen${t}`),
  ...PAIRS.map((p) => `pap${p}`),
  ...UPPER.map((t) => `inc${t}`),
  ...UPPER.map((t) => `dis${t}`),
];
type Pt = { name: string; x: number; y: number; refused?: "vis" | "occluded" | "ambiguous" };
type Doc = { file: string; width: number; height: number; points: Pt[]; teeth?: [number, number][][] };

export default function Annotate() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [idx, setIdx] = useState(0);
  const [current, setCurrent] = useState(NAMES[0]);
  const [mode, setMode] = useState<"points" | "outline">("points");
  const [poly, setPoly] = useState<[number, number][]>([]);
  const [refuse, setRefuse] = useState<"" | "vis" | "occluded" | "ambiguous">("");
  const file = files[idx];
  const doc = file ? docs[file.name] : undefined;

  const done = useMemo(() => new Set((doc?.points ?? []).map((p) => p.name)), [doc]);

  const draw = () => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const r = Math.max(4, c.width / 220);
    ctx.font = `${Math.max(12, c.width / 60)}px sans-serif`;
    const tracePoly = (pts: [number, number][], closed: boolean, col: string) => {
      if (!pts.length) return;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (closed) ctx.closePath();
      ctx.lineWidth = Math.max(2, r / 2); ctx.strokeStyle = col; ctx.stroke();
      if (closed) { ctx.fillStyle = col + "33"; ctx.fill(); }
    };
    (doc?.teeth ?? []).forEach((t) => tracePoly(t, true, "#38bdf8"));
    tracePoly(poly, false, "#f472b6");
    for (const p of doc?.points ?? []) {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, r / 2);
      ctx.strokeStyle = p.refused ? "#ef4444" : "#22c55e"; ctx.stroke();
      if (!p.refused) { ctx.fillStyle = "#22c55e"; ctx.fill(); }
      ctx.fillStyle = "#facc15"; ctx.fillText(p.refused ? `${p.name} ${p.refused}` : p.name, p.x + r + 2, p.y - r);
    }
  };

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setDocs((d) => d[file.name] ? d : { ...d, [file.name]: { file: file.name, width: img.naturalWidth, height: img.naturalHeight, points: [] } });
      draw();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(draw, [docs, idx, poly]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!file || !doc) return;
    const c = canvasRef.current!, b = c.getBoundingClientRect();
    const x = Math.round(((e.clientX - b.left) / b.width) * c.width);
    const y = Math.round(((e.clientY - b.top) / b.height) * c.height);
    if (mode === "outline") { setPoly([...poly, [x, y]]); return; }
    const points = [...doc.points.filter((p) => p.name !== current), { name: current, x, y, refused: refuse || undefined }];
    setDocs({ ...docs, [file.name]: { ...doc, points } });
    const next = NAMES.find((n) => n !== current && !points.some((p) => p.name === n));
    if (next) setCurrent(next);
  };

  const closeTooth = () => {
    if (!doc || poly.length < 3) return;
    setDocs({ ...docs, [file!.name]: { ...doc, teeth: [...(doc.teeth ?? []), poly] } });
    setPoly([]);
  };
  const undo = () => mode === "outline" ? (poly.length ? setPoly(poly.slice(0, -1)) : doc && setDocs({ ...docs, [file!.name]: { ...doc, teeth: (doc.teeth ?? []).slice(0, -1) } })) : doc && setDocs({ ...docs, [file!.name]: { ...doc, points: doc.points.slice(0, -1) } });
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, labels: Object.values(docs) }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `landmarks-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen bg-background text-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold">Landmark labeling (private, images stay on this device)</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><Home className="w-5 h-5" /></Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <input type="file" accept="image/*" multiple onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setIdx(0); }} />
        <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Prev</Button>
        <span>{files.length ? `${idx + 1}/${files.length}` : "no images"}</span>
        <Button size="sm" variant="outline" disabled={idx >= files.length - 1} onClick={() => setIdx(idx + 1)}>Next</Button>
        <Button size="sm" variant="outline" onClick={undo}>Undo</Button>
        <select className="bg-background border border-white/20 rounded p-1" value={refuse} onChange={(e) => setRefuse(e.target.value as any)}>
          <option value="">accepted point</option>
          <option value="vis">refused: not visible</option>
          <option value="occluded">refused: occluded</option>
          <option value="ambiguous">refused: ambiguous</option>
        </select>
        <Button size="sm" variant={mode === "outline" ? "default" : "outline"} onClick={() => { setMode(mode === "outline" ? "points" : "outline"); setPoly([]); }}>
          {mode === "outline" ? "Tooth outlines: on" : "Tooth outlines: off"}
        </Button>
        {mode === "outline" && <Button size="sm" variant="outline" onClick={closeTooth} disabled={poly.length < 3}>Close tooth ({doc?.teeth?.length ?? 0} done)</Button>}
        <Button size="sm" onClick={exportJson} disabled={!Object.keys(docs).length}>Export JSON</Button>
      </div>
      <div className="grid md:grid-cols-[1fr_220px] gap-3">
        <canvas ref={canvasRef} onClick={click} className="w-full max-h-[80vh] object-contain bg-black/40 rounded cursor-crosshair" />
        <div className="text-xs space-y-1 max-h-[80vh] overflow-auto">
          {NAMES.map((n) => (
            <button key={n} onClick={() => setCurrent(n)}
              className={`block w-full text-left px-2 py-1 rounded ${n === current ? "bg-primary text-primary-foreground" : done.has(n) ? "text-green-400" : "text-white/70"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-white/50">Click a landmark name, then click the point on the photo. In tooth-outline mode, click around one visible tooth edge, press Close tooth, repeat for each tooth (needed to build and test a real-photo tooth segmenter). Labels are saved only in this page until exported.</p>
    </div>
  );
}
