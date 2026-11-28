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
  return (
    <section className={`${card} w-full`} data-testid="dsd-report">
      <h3 className="text-xl font-semibold">Report for the dentist</h3>
      <div className="rounded-xl border border-white/20 p-3 mt-2" data-testid="report-headline">
        <div className={muted}>Headline: gum show at this smile</div>
        <div className="text-2xl font-semibold">{gum ? gum.value : "not measurable"}</div>
        <div className={muted}>{gum ? gum.note : "Needs a face in frame (lip edge) and 4 or more upper teeth. Without a calibrated central width it assumes an 8.5 mm central incisor."}</div>
      </div>
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
