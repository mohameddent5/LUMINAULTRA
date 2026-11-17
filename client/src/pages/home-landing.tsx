import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  GitCompare,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { type CarePathway, isComplete, loadPathways } from "@/lib/careJourney";

const STAGE_LABEL: Record<string, string> = {
  recommended: "Recommendation ready",
  awaiting_consent: "Waiting for consent",
  awaiting_booking: "Not booked yet",
  booked: "Visit booked",
  missed: "Missed — escalating",
  attended: "Visit attended",
  closed: "Closed",
};

const STAGE_TONE: Record<string, string> = {
  recommended: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  awaiting_consent: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  awaiting_booking: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  booked: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  missed: "border-red-500/40 bg-red-500/10 text-red-200",
  attended: "border-primary/40 bg-primary/10 text-primary",
  closed: "border-white/20 bg-white/5 text-white/70",
};

const TOOLS: Array<{ href: string; label: string; hint: string; icon: React.ReactNode }> = [
  { href: "/scanner", label: "AR scanner", hint: "Live facial and smile analysis", icon: <Camera className="w-5 h-5 text-primary" /> },
  { href: "/treatment-planner", label: "Treatment planner", hint: "Design and compare options", icon: <ClipboardList className="w-5 h-5 text-secondary" /> },
  { href: "/smile-simulator", label: "Smile simulator", hint: "Preview the planned outcome", icon: <Sparkles className="w-5 h-5 text-cyan-400" /> },
  { href: "/prescription-generator", label: "Lab prescription", hint: "Prepare lab instructions", icon: <FileText className="w-5 h-5 text-orange-300" /> },
  { href: "/patient-archive", label: "Patient archive", hint: "Stored analyses and reports", icon: <FolderOpen className="w-5 h-5 text-purple-300" /> },
  { href: "/patient-comparison", label: "Compare patients", hint: "Side-by-side measurements", icon: <GitCompare className="w-5 h-5 text-indigo-300" /> },
  { href: "/clinical-guidelines", label: "DSD guidelines", hint: "Protocol library", icon: <Stethoscope className="w-5 h-5 text-teal-300" /> },
  { href: "/validation", label: "Validation", hint: "Evidence and accuracy limits", icon: <ShieldCheck className="w-5 h-5 text-emerald-300" /> },
];

export default function HomeLanding() {
  const [, navigate] = useLocation();
  const [showProtocols, setShowProtocols] = useState(false);
  const [pathways, setPathways] = useState<CarePathway[]>([]);
  const [analyses, setAnalyses] = useState(0);

  useEffect(() => {
    try {
      setPathways(loadPathways());
      const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
      setAnalyses(Array.isArray(archive) ? archive.length : 0);
    } catch {
      /* storage unavailable — the workspace still renders */
    }
  }, []);

  const completed = pathways.filter(isComplete).length;
  const open = pathways.length - completed;
  const booked = pathways.filter((p) => p.stage === "booked").length;
  const recent = [...pathways].reverse().slice(0, 4);

  const stats = [
    { label: "Open journeys", value: open, icon: <Activity className="w-5 h-5" />, tone: "text-cyan-300" },
    { label: "Completed journeys", value: completed, icon: <CheckCircle2 className="w-5 h-5" />, tone: "text-emerald-300" },
    { label: "Visits booked", value: booked, icon: <CalendarCheck className="w-5 h-5" />, tone: "text-primary" },
    { label: "Stored analyses", value: analyses, icon: <Users className="w-5 h-5" />, tone: "text-purple-300" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Primary workflow */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/10 via-card/40 to-secondary/10 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge className="border-primary/30 bg-primary/10 text-primary">Clinical workflow</Badge>
          <Badge className="border-white/15 bg-white/5 text-white/70">Screening → completed care</Badge>
        </div>
        <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white leading-tight">
          From a screening result to completed care
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
          Record what was found, get the next step with a plain-language reason, book it, chase it if the visit is
          missed, and confirm the follow-up happened — with the clinician signing off on the key decisions.
        </p>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => navigate("/care-journey")}
            className="px-6 py-5 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-[0_0_25px_rgba(0,212,255,0.25)] active:scale-95"
          >
            Start a screening
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            onClick={() => navigate("/scanner")}
            variant="outline"
            className="px-6 py-5 font-semibold border-white/20 hover:bg-white/5 rounded-xl"
          >
            <Camera className="w-5 h-5 mr-2" />
            Open AR scanner
          </Button>
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          {[
            { icon: <Activity className="w-4 h-4" />, title: "1 · Screen", text: "Findings, severity and measurements" },
            { icon: <CalendarCheck className="w-4 h-4" />, title: "2 · Book & remind", text: "Right setting, reminders, escalation" },
            { icon: <CheckCircle2 className="w-4 h-4" />, title: "3 · Confirm care", text: "Follow-up checked, clinician signs off" },
          ].map((s) => (
            <div key={s.title} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex items-center gap-2 text-white text-xs font-semibold">
                <span className="text-primary">{s.icon}</span>
                {s.title}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workspace state */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-card/40 p-4">
            <div className={`flex items-center gap-2 ${s.tone}`}>
              {s.icon}
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </section>

      {/* Continue a journey */}
      <section className="rounded-xl border border-white/10 bg-card/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Continue a journey</h3>
            <p className="text-[11px] text-muted-foreground">Saved on this device. Open one to pick up where it stopped.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/care-journey")} className="text-primary hover:bg-primary/10">
            All journeys
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center">
            <p className="text-sm text-white/80">No journeys yet.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Start a screening and the pathway will appear here with its current stage.
            </p>
            <Button
              onClick={() => navigate("/care-journey")}
              size="sm"
              className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Start the first one
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate("/care-journey")}
                className="w-full flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left hover:border-primary/40 hover:bg-white/10 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.screening.patientName || "Unnamed patient"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{p.recommendation.headline}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] rounded-full border px-2 py-0.5 ${STAGE_TONE[p.stage] ?? STAGE_TONE.closed}`}>
                    {STAGE_LABEL[p.stage] ?? p.stage}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Tools */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Clinical tools</h3>
            <p className="text-[11px] text-muted-foreground">Everything in the suite, one workspace.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/clinical-dashboard")} className="text-muted-foreground hover:text-white">
            Practice dashboard
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOLS.map((t) => (
            <button
              key={t.href}
              onClick={() => navigate(t.href)}
              className="rounded-lg border border-white/10 bg-white/5 p-4 text-left hover:border-primary/40 hover:bg-white/10 transition-colors"
            >
              <div className="mb-2">{t.icon}</div>
              <p className="text-xs font-semibold text-white">{t.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{t.hint}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Capability + standards */}
      <section className="grid md:grid-cols-3 gap-4">
        {[
          {
            icon: <TrendingUp className="w-5 h-5 text-primary" />,
            title: "Real-time analysis",
            text: "15+ clinical measurements calculated instantly: facial midline, golden proportions, gingival symmetry and smile arc.",
          },
          {
            icon: <ShieldCheck className="w-5 h-5 text-secondary" />,
            title: "Evidence-based protocols",
            text: "Bands and grades come from peer-reviewed DSD literature, and anything that cannot be measured is shown as not available rather than guessed.",
          },
          {
            icon: <Users className="w-5 h-5 text-cyan-400" />,
            title: "Patient communication",
            text: "Plain-language reasons, printable reports and lab prescriptions that the patient and the next clinician can both follow.",
          },
        ].map((c) => (
          <div key={c.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3">{c.icon}</div>
            <h4 className="text-sm font-semibold text-white">{c.title}</h4>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{c.text}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-white/10 bg-card/40 p-5">
        {[
          { value: "15+", label: "Clinical metrics" },
          { value: "Sub-1mm", label: "Measurement precision" },
          { value: "0ms", label: "Cloud latency (on-device)" },
          { value: "81", label: "Pathway rules tested" },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-xl font-bold text-primary">{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </section>

      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-900/20 to-cyan-900/20 p-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-blue-200">Clinical decision support, not a diagnosis</h4>
            <p className="text-xs text-blue-100/80 leading-relaxed">
              Measurements follow published DSD protocols and the pathway follows clinical referral logic, but the tool
              supports professional judgement rather than replacing an examination. Records stay on this device; consent
              is required before a summary is shared with a provider.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowProtocols(true)}
              className="text-blue-200 hover:bg-blue-400/10 px-0"
            >
              View the clinical protocols
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>

      {showProtocols && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-heading font-bold text-white">Clinical DSD protocols</h2>
              <button onClick={() => setShowProtocols(false)} aria-label="Close protocols" className="text-muted-foreground hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-5 text-sm">
              <div className="space-y-2">
                <h3 className="font-semibold text-primary">1. Golden proportion (Snow, 1999)</h3>
                <p className="text-muted-foreground">Central : lateral : canine width as 1.618 : 1.0 : 0.618.</p>
                <p className="text-muted-foreground italic">This exact ratio only exists in roughly 14–25% of natural smiles.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-secondary">2. RED proportion (Ward, 2001)</h3>
                <p className="text-muted-foreground">Recurring esthetic dental proportion, acceptable range 62–80%.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-cyan-400">3. Central incisor width/length</h3>
                <p className="text-muted-foreground">Ideal 75–80%; clinical preference 78%; natural population average 84–87%.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-green-400">4. Gingival symmetry</h3>
                <p className="text-muted-foreground">Ideal above 90%, acceptable above 85%, needs attention below 80%.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-white">5. Smile characteristics</h3>
                <p className="text-muted-foreground">
                  Smile arc follows the lower lip, smile fullness 50–80%, buccal corridors 2–4 mm, commissural line
                  horizontal.
                </p>
              </div>

              <div className="rounded-lg border border-blue-500/30 bg-blue-900/20 p-3">
                <p className="text-[11px] text-blue-100 leading-relaxed">
                  Individual variation, ethnic background and patient preference always inform the final decision.
                  Lumina Ultra provides objective measurements to support clinical judgement, not to replace it.
                </p>
              </div>
            </div>

            <Button onClick={() => setShowProtocols(false)} className="w-full bg-primary hover:bg-primary/90">
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
