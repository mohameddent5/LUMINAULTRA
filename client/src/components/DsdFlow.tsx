import { useMemo, useState } from "react";
import { autoLines, measureLines, type Finding, type ScreenInput } from "@/lib/screening";
import { autoDesign } from "@/lib/autoDesign";
import { RefLinesEditor } from "./RefLinesEditor";
import { ProposedDesign } from "./ProposedDesign";

const GOAL: Record<string, string> = {
  "eye-line": "0 to 2° (level)", commissure: "parallel to eye line, within 2°", thirds: "about 100% (middle = lower third)", "lower-third": "about 1 : 2",
  midline: "dental on facial midline, under about 2 mm", "midline-angle": "parallel to facial midline, within 2°", "incisal-plane": "parallel to eye line, within 2°",
  "gum-show": "0 to 2 mm (above 3 mm = gummy)", "incisal-asym": "under 6% of central length",
};
const VERIFY: Record<string, string> = {
  "eye-line": "Retake level or confirm head position before trusting the other angles.",
  commissure: "Compare with a full-smile clinical photo.",
  thirds: "Check on a relaxed frontal photo with the hair line visible.",
  "lower-third": "Check lip position at rest.",
  midline: "Confirm on a frontal photo with a horizontal reference.",
  "midline-angle": "Confirm with a facebow or a straight-on photo.",
  "incisal-plane": "Check the occlusal plane clinically or with a profile photo.",
  "gum-show": "Posed smile and at-rest photographs; periodontal probing if gingival findings are present.",
  "incisal-asym": "Verify on the mouth with a mirror, not from the photo box.",
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
function printReport(rows: Finding[], flags: string[], calibrated: boolean) {
  const w = window.open("", "_blank");
  if (!w) return;
  const key = rows.filter((r) => r.level !== "ok" && r.value !== "n/a");
  const flagged = rows.filter((r) => r.level !== "ok").length;
  const card = (r: Finding) => `<div class="card"><b>${esc(r.label)}: ${esc(r.value)}</b><div>${r.level === "check" ? "Outside the goal on this photo" : "Borderline or uncertain"} (goal: ${esc(GOAL[r.id] || "n/a")})</div><div class="v">Verify: ${esc(VERIFY[r.id] || "Check clinically.")}</div></div>`;
  const snap = rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td><td>${esc(GOAL[r.id] || "")}</td><td>${r.level === "ok" ? "Right" : r.level === "note" ? "Uncertain" : "Wrong"}</td></tr>`).join("");
  const list = ["Review key findings before the patient is seated.", "Prepare full-smile and at-rest photographs for clinical comparison.", ...(rows.some((r) => r.id === "gum-show" && r.level !== "ok") ? ["Periodontal probing is recommended: gum show is outside the goal."] : []), "Frontal clinical photograph with a horizontal reference level may be useful.", ...(flagged >= 3 ? ["Several parameters flagged: consider mounted models before consultation."] : []), ...flags.map((f) => `Flag to check clinically: ${f}`)];
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pre-clinical DSD screening summary</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:20px;margin:0}h2{background:#0e7490;color:#fff;padding:4px 8px;font-size:12px;margin:14px 0 6px}.card{border:1px solid #94a3b8;border-radius:8px;padding:8px;margin:6px 0}.v{color:#475569;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e2e8f0;padding:3px 4px;text-align:left;vertical-align:top}.meta{display:flex;gap:24px;background:#f1f5f9;padding:6px 8px;margin-top:8px}li{margin:3px 0;list-style:none}li:before{content:"\\2610  "}small{color:#475569}</style></head><body>
<h1>Pre-clinical DSD screening summary</h1><small>Screening only. Requires clinical verification before any decision. No single score is given on purpose.</small>
<div class="meta"><span>Patient ID: ________</span><span>Date: ${esc(new Date().toLocaleString())}</span><span>Scale: ${calibrated ? "Calibrated on entered central width" : "Assumed 8.5 mm central incisor"}</span><span>Mode: single photo, no depth</span></div>
<h2>KEY FINDINGS (${key.length})</h2>${key.length ? key.map(card).join("") : "<div class='card'>No measured parameter is outside its goal on this photo. Still verify clinically.</div>"}
<h2>PARAMETER SNAPSHOT</h2><table><tr><th>Measure</th><th>Value</th><th>Goal</th><th>Flag</th></tr>${snap}</table>
<h2>ADDITIONAL OBSERVATIONS</h2><div class="card">Numbers come from a face mesh and rough tooth boxes (about 5 to 15% error); gum show and mm values are estimates (about 1 mm). Decay flags are investigational.</div>
<h2>PRE-SESSION CONSIDERATIONS</h2><ul style="padding:0">${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
const FLAG = { ok: ["Right", "bg-emerald-400"], note: ["Uncertain / borderline", "bg-amber-300"], check: ["Wrong (outside goal)", "bg-red-400"] } as const;

function Report({ input, flags, muted, card }: { input: ScreenInput; flags: string[]; muted: string; card: string }) {
  const rows = useMemo(() => {
    const a = autoLines(input);
    const f: Finding[] = [...measureLines(a.lines)];
    if (a.asym) f.push(a.asym);
    if (!a.enough) f.push({ id: "no-teeth", label: "Upper teeth", value: "n/a", level: "note", note: "Fewer than 4 upper teeth were found, so tooth-based numbers are not available." });
    else if (!a.trusted) f.push({ id: "midline-unreliable", label: "Dental midline", value: "n/a", level: "note", note: "The row found is not symmetric enough (missing, broken or merged tooth): mark by eye." });
    const d = autoDesign(input);
    if (d) {
      const w = input.teeth.filter((t) => t.incisalDown).sort((x, y) => x.cx - y.cx);
      f.push({ id: "teeth-found", label: "Upper teeth found", value: `${w.length}`, level: w.length >= 6 ? "ok" : "note", note: "Teeth the automatic outline found; design uses the 6 nearest the midline." });
    }
    return f;
  }, [input.teeth, input.face, input.region.x0, input.region.y0]); // eslint-disable-line react-hooks/exhaustive-deps
  const gum = rows.find((r) => r.id === "gum-show");
  const calibrated = false;
  return (
    <section className={`${card} w-full`} data-testid="dsd-report">
      <h3 className="text-xl font-semibold">Report for the dentist</h3>
      <div className="rounded-xl border border-white/20 p-3 mt-2" data-testid="report-headline">
        <div className={muted}>Headline: gum show at this smile</div>
        <div className="text-2xl font-semibold">{gum ? gum.value : "not measurable"}</div>
        <div className={muted}>{gum ? gum.note : "Needs a face in frame (lip edge) and 4 or more upper teeth. Without a calibrated central width it assumes an 8.5 mm central incisor."}</div>
      </div>
      <button type="button" className="underline text-base min-h-[44px]" data-testid="report-print" onClick={() => printReport(rows, flags, calibrated)}>Print or save the report (one page)</button>
      <table className="w-full table-fixed text-left mt-3 text-base"><colgroup><col style={{ width: "42%" }} /><col style={{ width: "20%" }} /><col style={{ width: "20%" }} /><col style={{ width: "18%" }} /></colgroup>
        <thead><tr className={muted}><th className="py-1 pr-2">Measure</th><th className="pr-2">Value</th><th className="pr-2">Goal</th><th>Flag</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-white/10 align-top" data-testid={`report-${r.id}`}>
              <td className="py-2 pr-2">{r.label}<div className={`text-sm ${muted}`}>{r.note}</div></td>
              <td className="pr-2 break-words">{r.value}</td>
              <td className="pr-2">{GOAL[r.id] || ""}</td>
              <td><span className={`inline-block w-3 h-3 rounded-full mr-1 ${FLAG[r.level][1]}`} />{FLAG[r.level][0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {flags.length > 0 && <ul className={`${muted} list-disc pl-5 mt-2`}>{flags.map((x) => <li key={x}>Flag: {x}</li>)}</ul>}
      <p className={`${muted} mt-2`}>Confidence: measured on one 2D photo with no depth, from a face mesh and rough tooth boxes (about 5 to 15% error). Goals are common DSD teaching values, not clinical cut-offs. "Right" means inside the goal on this photo, not a diagnosis. Any decay or braces flag is for the dentist to check clinically. There is no single DSD score on purpose.</p>
    </section>
  );
}

export function DsdFlow({ src, input, flags, caseKey, muted, card }: { src: HTMLCanvasElement; input: ScreenInput; flags: string[]; caseKey: string; muted: string; card: string }) {
  const [step, setStep] = useState<"trace" | "design" | "report">("trace");
  const tabs = [["trace", "1. Tracing"], ["design", "2. Design"], ["report", "3. Report"]] as const;
  const box = `rounded-2xl p-5 space-y-3 ${card}`;
  return (
    <div className="space-y-3" data-testid="dsd-flow">
      <div role="tablist" className="flex gap-2">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={step === k} data-testid={`dsd-tab-${k}`} onClick={() => setStep(k)}
            className={`min-h-[44px] px-4 rounded-full border text-base ${step === k ? "bg-sky-700 border-sky-400 text-white" : "border-white/30"}`}>{l}</button>
        ))}
      </div>
      <div hidden={step !== "trace"}><RefLinesEditor src={src} input={input} caseKey={caseKey} muted={muted} card={card} /></div>
      <div hidden={step !== "design"}><ProposedDesign src={src} input={input} flags={flags} muted={muted} card={box} /></div>
      <div hidden={step !== "report"}><Report input={input} flags={flags} muted={muted} card={box} /></div>
    </div>
  );
}
