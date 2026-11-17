import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Home,
  Lock,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  type CarePathway,
  type Finding,
  type FindingCode,
  type MeasuredValue,
  type ScreeningSource,
  type Severity,
  ESCALATION_STEPS,
  bookAppointment,
  clinicianSignOff,
  confirmFollowUp,
  createPathway,
  eraseAllData,
  escalate,
  grantConsent,
  isComplete,
  journeySteps,
  loadPathways,
  loadPrivacy,
  markVisitMissed,
  nextEscalation,
  providersFor,
  rebook,
  savePrivacy,
  slotsFor,
  upsertPathway,
  withdrawConsent,
} from "@/lib/careJourney";

const FINDING_OPTIONS: Array<{ code: FindingCode; label: string; hint: string }> = [
  { code: "pain", label: "Pain", hint: "Toothache or pain on biting" },
  { code: "swelling", label: "Swelling", hint: "Facial or gum swelling" },
  { code: "bleeding", label: "Bleeding gums", hint: "Bleeds when brushing" },
  { code: "deep_pocket", label: "Deep gum pocket", hint: "Probing depth over 4 mm" },
  { code: "mobility", label: "Loose tooth", hint: "Tooth moves when tested" },
  { code: "caries", label: "Tooth decay", hint: "Cavity or visible breakdown" },
  { code: "broken_tooth", label: "Broken tooth", hint: "Fractured or chipped" },
  { code: "missing_tooth", label: "Missing tooth", hint: "Gap in the arch" },
  { code: "sensitivity", label: "Sensitivity", hint: "Hot or cold sensitivity" },
  { code: "esthetic_concern", label: "Appearance concern", hint: "Shape, colour or alignment" },
];

const SEVERITIES: Array<Severity | "none"> = ["none", "mild", "moderate", "severe"];

const SOURCES: Array<{ id: ScreeningSource; label: string }> = [
  { id: "clinician_scan", label: "Clinician scan" },
  { id: "community_worker", label: "Community health worker" },
  { id: "self_report", label: "Self report" },
  { id: "dsd_scan", label: "Digital smile scan (this app)" },
];

type FindingState = Record<FindingCode, Severity | "none">;

const EMPTY_FINDINGS: FindingState = FINDING_OPTIONS.reduce((acc, f) => {
  acc[f.code] = "none";
  return acc;
}, {} as FindingState);

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function urgencyTone(urgency: string): string {
  if (urgency === "urgent") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (urgency === "soon") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

export default function CareJourney() {
  const [, navigate] = useLocation();
  const [pathways, setPathways] = useState<CarePathway[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // screening form
  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [contact, setContact] = useState("");
  const [source, setSource] = useState<ScreeningSource>("community_worker");
  const [findings, setFindings] = useState<FindingState>(EMPTY_FINDINGS);
  const [note, setNote] = useState("");
  const [measured, setMeasured] = useState<MeasuredValue[]>([]);

  // downstream inputs
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("Treatment completed");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [clinicianName, setClinicianName] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [decision, setDecision] = useState<"confirmed" | "amended">("confirmed");
  const [comment, setComment] = useState("");
  const [privacy, setPrivacy] = useState(loadPrivacy());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const list = loadPathways();
    setPathways(list);
    if (list.length > 0) setActiveId(list[0].id);
    setPrivacy(loadPrivacy());
  }, []);

  const active = useMemo(
    () => pathways.find((p) => p.id === activeId) ?? null,
    [pathways, activeId],
  );

  function apply(updated: CarePathway) {
    setPathways(upsertPathway(updated));
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  /* ------------------------------------------------------------ screening */

  function resetForm() {
    setPatientName("");
    setAge("");
    setContact("");
    setSource("community_worker");
    setFindings(EMPTY_FINDINGS);
    setNote("");
    setMeasured([]);
  }

  function loadExample() {
    setPatientName("Amara Osei");
    setAge("42");
    setContact("+1 555 0142");
    setSource("community_worker");
    setFindings({
      ...EMPTY_FINDINGS,
      deep_pocket: "moderate",
      bleeding: "moderate",
      sensitivity: "mild",
    });
    setNote("Screening at a community outreach clinic. Gums bleed on brushing, upper right molar probes 5 mm.");
    setMeasured([]);
  }

  function importLastScan() {
    try {
      const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
      const last = Array.isArray(archive) && archive.length > 0 ? archive[archive.length - 1] : null;
      if (!last) {
        flash("No saved smile scan found yet. Run a scan first, or enter findings manually.");
        return;
      }
      const values: MeasuredValue[] = [];
      if (typeof last.harmony === "number") {
        values.push({ label: "Smile harmony score", value: last.harmony, unit: "/100" });
      }
      if (typeof last.patientName === "string" && last.patientName) setPatientName(last.patientName);
      setMeasured(values);
      setSource("dsd_scan");
      setNote(
        values.length > 0
          ? `Measurements imported from a digital smile scan. The screener still records the clinical findings below.`
          : "Scan imported without numeric measurements. Record the clinical findings below.",
      );
      flash("Scan measurements imported. Findings still need to be recorded by the screener.");
    } catch {
      flash("Could not read the saved scan. Enter the findings manually.");
    }
  }

  function submitScreening() {
    const list: Finding[] = FINDING_OPTIONS.filter((f) => findings[f.code] !== "none").map(
      (f) => ({ code: f.code, severity: findings[f.code] as Severity }),
    );
    if (list.length === 0 && measured.length === 0) {
      flash("Record at least one finding, or import a scan with measurements, before continuing.");
      return;
    }
    const pathway = createPathway({
      id: `scr_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      source,
      patientName: patientName.trim() || "Unnamed patient",
      ageYears: age.trim() === "" ? null : Number(age),
      contact: contact.trim(),
      findings: list,
      note: note.trim(),
      measured,
    });
    setPathways(upsertPathway(pathway));
    setActiveId(pathway.id);
    resetForm();
    flash("Screening recorded. The recommended next step is ready.");
  }

  /* ---------------------------------------------------------------- views */

  const steps = active ? journeySteps(active) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="flex items-center gap-3">
          <Stethoscope className="w-5 h-5 text-accent" />
          <h1 className="font-heading font-bold">Care Pathway</h1>
          <Badge className="hidden sm:inline-flex border-white/20 text-white/70">
            screening to completed care
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {pathways.length > 0 && (
            <select
              value={activeId ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
              className="bg-white/5 border border-white/15 rounded-md px-2 py-1.5 text-sm text-white"
            >
              {pathways.map((p) => (
                <option key={p.id} value={p.id} className="bg-neutral-900">
                  {p.screening.patientName} — {new Date(p.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
            <Home className="w-5 h-5" />
          </Button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {notice && (
          <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-white/90">
            {notice}
          </div>
        )}

        {/* ---------------------------------------------------------- stage rail */}
        {active && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={`rounded-lg border p-3 space-y-1 ${
                  s.done
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : s.active
                      ? "border-accent/60 bg-accent/10"
                      : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-white/60">
                  {s.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                  )}
                  Step {i + 1}
                </div>
                <p className="text-sm font-medium leading-tight">{s.label}</p>
                <p className="text-xs text-white/50 leading-tight line-clamp-2">{s.detail}</p>
              </div>
            ))}
          </div>
        )}

        {active && isComplete(active) && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-200">Journey complete</p>
              <p className="text-sm text-white/70">
                The visit was confirmed and {active.clinician?.clinicianName} signed off the decision.
              </p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- screening form */}
        {!active && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-accent" />
                <h2 className="font-heading font-semibold">Start from a screening result</h2>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pname" className="text-xs text-white/60">Patient</Label>
                  <Input id="pname" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="page" className="text-xs text-white/60">Age</Label>
                  <Input id="page" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Years" inputMode="numeric" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pcontact" className="text-xs text-white/60">Contact for reminders</Label>
                  <Input id="pcontact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="psource" className="text-xs text-white/60">Who recorded the screening</Label>
                <select
                  id="psource"
                  value={source}
                  onChange={(e) => setSource(e.target.value as ScreeningSource)}
                  className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                >
                  {SOURCES.map((s) => (
                    <option key={s.id} value={s.id} className="bg-neutral-900">{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-white/60">Findings</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {FINDING_OPTIONS.map((f) => (
                    <div key={f.code} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{f.label}</p>
                        <p className="text-[11px] text-white/40 truncate">{f.hint}</p>
                      </div>
                      <select
                        aria-label={`${f.label} severity`}
                        value={findings[f.code]}
                        onChange={(e) => setFindings((prev) => ({ ...prev, [f.code]: e.target.value as Severity | "none" }))}
                        className="bg-white/5 border border-white/15 rounded px-1.5 py-1 text-xs shrink-0"
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s} className="bg-neutral-900">{s}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pnote" className="text-xs text-white/60">Screener notes</Label>
                <Textarea id="pnote" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What you observed, in your own words" />
              </div>

              {measured.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs text-white/60 mb-1">Imported measurements</p>
                  <div className="flex flex-wrap gap-2">
                    {measured.map((m) => (
                      <Badge key={m.label} className="border-white/20 text-white/80">
                        {m.label}: {m.value}{m.unit}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={submitScreening}>
                  Get the next step <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={loadExample}>Load example case</Button>
                <Button variant="ghost" onClick={importLastScan}>
                  <FileText className="w-4 h-4 mr-1" /> Import last smile scan
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h2 className="font-heading font-semibold">Privacy by default</h2>
              </div>
              <ul className="text-sm text-white/60 space-y-2 list-disc pl-4">
                <li>Screening data stays in this browser until the patient consents to sharing.</li>
                <li>Nothing is sent to a provider before consent is given.</li>
                <li>The patient can withdraw consent and erase everything at any time.</li>
                <li>Every step is written to an audit trail the patient can read.</li>
              </ul>
              <p className="text-xs text-white/40">
                Demonstration build: records are stored on this device only, so judges can test the
                full journey without a login.
              </p>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- active case */}
        {active && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* screening summary */}
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading font-semibold">{active.screening.patientName}</h2>
                    <p className="text-xs text-white/50">
                      {active.screening.ageYears !== null ? `${active.screening.ageYears} years · ` : ""}
                      screening by {active.screening.source.replace(/_/g, " ")} · {fmtDateTime(active.screening.createdAt)}
                    </p>
                  </div>
                  <Badge className={urgencyTone(active.recommendation.urgency)}>
                    {active.recommendation.urgency}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {active.screening.findings.length === 0 && (
                    <span className="text-sm text-white/50">No active findings recorded.</span>
                  )}
                  {active.screening.findings.map((f) => (
                    <Badge key={f.code} className="border-white/20 text-white/80">
                      {f.code.replace(/_/g, " ")}: {f.severity}
                    </Badge>
                  ))}
                  {active.screening.measured.map((m) => (
                    <Badge key={m.label} className="border-accent/40 text-accent">
                      {m.label}: {m.value}{m.unit}
                    </Badge>
                  ))}
                </div>

                {active.screening.note && (
                  <p className="text-sm text-white/60 border-l-2 border-white/15 pl-3">{active.screening.note}</p>
                )}
              </section>

              {/* recommendation */}
              <section className="rounded-xl border border-accent/30 bg-accent/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-accent" />
                  <h2 className="font-heading font-semibold">Recommended next step</h2>
                </div>
                <div>
                  <p className="text-lg font-medium">{active.recommendation.headline}</p>
                  <p className="text-sm text-white/60">
                    {active.recommendation.setting} · within {active.recommendation.timeframeDays === 0
                      ? "today"
                      : `${active.recommendation.timeframeDays} days`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-white/40">Why this step</p>
                  {active.recommendation.reasons.map((r, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-sm">{r.plain}</p>
                      <p className="text-xs text-white/55 mt-1">{r.because}</p>
                      <p className="text-[11px] text-white/30 mt-1">
                        {r.weight === "primary" ? "Deciding factor" : "Also considered"} · from finding “{String(r.triggeredBy).replace(/_/g, " ")}”
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-white/70">
                    <span className="text-amber-200">If this is delayed: </span>
                    {active.recommendation.ifDelayed}
                  </p>
                </div>
              </section>

              {/* consent */}
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-heading font-semibold">Consent</h2>
                  {active.consent.granted && (
                    <Badge className="border-emerald-500/40 text-emerald-200">given</Badge>
                  )}
                </div>

                {active.consent.granted ? (
                  <>
                    <p className="text-sm text-white/60">
                      Consent given {active.consent.grantedAt ? fmtDateTime(active.consent.grantedAt) : ""}.
                      Sharing with the provider: {active.consent.shareWithProvider ? "allowed" : "not allowed"} ·
                      reminders: {active.consent.allowReminders ? "allowed" : "not allowed"} ·
                      quality reporting: {active.consent.allowQualityReporting ? "allowed" : "not allowed"}.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => apply(withdrawConsent(active))}>
                      Withdraw consent
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      {([
                        ["shareWithProvider", "Share my screening summary with the provider I am referred to"],
                        ["allowReminders", "Send me appointment reminders on the contact I gave"],
                        ["allowQualityReporting", "Use my de-identified data to improve services"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-start gap-2 text-sm text-white/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={active.consent[key]}
                            onChange={(e) => {
                              const updated: CarePathway = {
                                ...active,
                                consent: { ...active.consent, [key]: e.target.checked } as CarePathway["consent"],
                              };
                              apply(updated);
                            }}
                            className="mt-1 accent-emerald-400"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <Button size="sm" onClick={() => apply(grantConsent(active, {}))}>
                      Patient gives consent
                    </Button>
                  </>
                )}
              </section>

              {/* booking */}
              {active.recommendation.tier !== "self_care" && (
                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-accent" />
                    <h2 className="font-heading font-semibold">Booked visit</h2>
                  </div>

                  {active.appointment ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                      <p className="text-sm">{active.appointment.providerName}</p>
                      <p className="text-xs text-white/60">{fmtDateTime(active.appointment.slotISO)}</p>
                      {active.stage !== "missed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            apply(markVisitMissed(active));
                            flash("Visit marked as missed. Escalation has started.");
                          }}
                        >
                          Mark visit as missed
                        </Button>
                      )}
                    </div>
                  ) : active.consent.granted ? (
                    <div className="space-y-3">
                      <p className="text-sm text-white/60">
                        Providers who can deliver {active.recommendation.setting.toLowerCase()}:
                      </p>
                      <div className="space-y-2">
                        {providersFor(active).map((prov) => (
                          <div key={prov.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm">{prov.name}</p>
                                <p className="text-xs text-white/45">{prov.setting} · {prov.city}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={selectedProvider === prov.id ? "default" : "outline"}
                                onClick={() => setSelectedProvider(prov.id)}
                              >
                                {selectedProvider === prov.id ? "Selected" : "Choose"}
                              </Button>
                            </div>
                            {selectedProvider === prov.id && (
                              <div className="flex flex-wrap gap-2">
                                {slotsFor(prov).map((slot, i) => (
                                  <Button
                                    key={slot}
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Book ${prov.id} slot ${i + 1}`}
                                    onClick={() => {
                                      apply(bookAppointment(active, prov, slot));
                                      setSelectedProvider(null);
                                      flash("Visit booked and reminders scheduled.");
                                    }}
                                  >
                                    {fmtDateTime(slot)}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-200/80">
                      Consent is needed before a visit can be booked.
                    </p>
                  )}
                </section>
              )}

              {/* reminders + escalation */}
              {active.appointment && (
                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-accent" />
                    <h2 className="font-heading font-semibold">Reminders</h2>
                  </div>

                  {active.reminders.length === 0 ? (
                    <p className="text-sm text-white/55">
                      Reminders are switched off because the patient did not consent to them.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {active.reminders.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{r.message}</p>
                            <p className="text-[11px] text-white/40">
                              {fmtDateTime(r.dueAt)} · {r.channel.toUpperCase()}
                            </p>
                          </div>
                          {r.sentAt ? (
                            <Badge className="border-emerald-500/40 text-emerald-200 shrink-0">sent</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0"
                              onClick={() =>
                                apply({
                                  ...active,
                                  reminders: active.reminders.map((x) =>
                                    x.id === r.id ? { ...x, sentAt: new Date().toISOString() } : x,
                                  ),
                                })
                              }
                            >
                              Send
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {active.stage === "missed" && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="w-4 h-4 text-red-300" />
                        <p className="text-sm text-red-200">Missed visit — escalation</p>
                      </div>
                      <div className="space-y-1">
                        {ESCALATION_STEPS.map((s) => {
                          const done = active.escalations >= s.step;
                          const isNext = nextEscalation(active)?.step === s.step;
                          return (
                            <div key={s.step} className="flex items-start gap-2 text-xs">
                              <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-red-400/30 text-red-100" : isNext ? "border border-red-400/60" : "border border-white/20"}`}>
                                {done ? <Check className="w-3 h-3" /> : s.step}
                              </span>
                              <div>
                                <p className={done ? "text-white/50 line-through" : isNext ? "text-white" : "text-white/60"}>
                                  {s.action}
                                </p>
                                <p className="text-white/30">{s.owner} · after {s.afterHours}h</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {nextEscalation(active) ? (
                        <Button size="sm" variant="outline" onClick={() => apply(escalate(active))}>
                          Run next escalation step
                        </Button>
                      ) : (
                        <p className="text-xs text-white/50">All escalation steps used — the coordinator is reviewing this case.</p>
                      )}
                      <div className="pt-2 border-t border-white/10">
                        <p className="text-xs text-white/50 mb-2">Or rebook straight away:</p>
                        <div className="flex flex-wrap gap-2">
                          {providersFor(active).slice(0, 2).map((prov) =>
                            slotsFor(prov).slice(0, 1).map((slot) => (
                              <Button
                                key={`${prov.id}-${slot}`}
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  apply(rebook(active, prov, slot));
                                  flash("Visit rebooked.");
                                }}
                              >
                                {prov.name.split(" ")[0]} · {fmtDateTime(slot)}
                              </Button>
                            )),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* follow-up */}
              {active.appointment && (
                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-accent" />
                    <h2 className="font-heading font-semibold">Did the visit happen?</h2>
                  </div>

                  {active.followUp.visited !== null ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1">
                      <p className="text-sm">
                        {active.followUp.visited ? "Visit confirmed" : "Visit did not happen"}
                      </p>
                      <p className="text-xs text-white/55">
                        Outcome: {active.followUp.outcome || "not recorded"} · checked by{" "}
                        {active.followUp.confirmedBy} {active.followUp.confirmedAt ? `on ${fmtDateTime(active.followUp.confirmedAt)}` : ""}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {["Treatment completed", "Further referral needed", "Patient declined treatment", "Still on a waiting list"].map((o) => (
                          <Button
                            key={o}
                            size="sm"
                            variant={outcome === o ? "default" : "outline"}
                            onClick={() => setOutcome(o)}
                          >
                            {o}
                          </Button>
                        ))}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input
                          value={confirmedBy}
                          onChange={(e) => setConfirmedBy(e.target.value)}
                          placeholder="Who checked (name and role)"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!confirmedBy.trim()) {
                                flash("Record who checked the follow-up before confirming.");
                                return;
                              }
                              apply(confirmFollowUp(active, { visited: true, outcome, confirmedBy: confirmedBy.trim() }));
                              flash("Follow-up confirmed.");
                            }}
                          >
                            Visit happened
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!confirmedBy.trim()) {
                                flash("Record who checked the follow-up before confirming.");
                                return;
                              }
                              apply(confirmFollowUp(active, { visited: false, outcome: "Did not attend", confirmedBy: confirmedBy.trim() }));
                              flash("Recorded as missed. Escalation continues.");
                            }}
                          >
                            Did not happen
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* clinician sign-off */}
              {active.followUp.visited !== null && (
                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-accent" />
                    <h2 className="font-heading font-semibold">Clinician confirmation</h2>
                  </div>

                  {active.clinician ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                      <p className="text-sm">
                        {active.clinician.clinicianName} ({active.clinician.registrationId}) —{" "}
                        {active.clinician.decision === "confirmed" ? "confirmed the pathway" : "amended the pathway"}
                      </p>
                      <p className="text-xs text-white/55">
                        {active.clinician.comment || "No comment recorded"} · {fmtDateTime(active.clinician.signedAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input value={clinicianName} onChange={(e) => setClinicianName(e.target.value)} placeholder="Clinician name" />
                        <Input value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} placeholder="Registration / licence number" />
                      </div>
                      <div className="flex gap-2">
                        {(["confirmed", "amended"] as const).map((d) => (
                          <Button key={d} size="sm" variant={decision === d ? "default" : "outline"} onClick={() => setDecision(d)}>
                            {d === "confirmed" ? "Confirm decisions" : "Amend decisions"}
                          </Button>
                        ))}
                      </div>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={2}
                        placeholder="Optional clinical comment"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!clinicianName.trim() || !registrationId.trim()) {
                            flash("A clinician name and registration number are required to sign off.");
                            return;
                          }
                          apply(clinicianSignOff(active, {
                            clinicianName: clinicianName.trim(),
                            registrationId: registrationId.trim(),
                            decision,
                            comment: comment.trim(),
                          }));
                          flash("Clinician sign-off recorded.");
                        }}
                      >
                        Sign off
                      </Button>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* ---------------------------------------------------------- sidebar */}
            <div className="space-y-6">
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-heading font-semibold">Privacy controls</h2>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={privacy.storeLocallyOnly}
                    onChange={(e) => {
                      const next = { ...privacy, storeLocallyOnly: e.target.checked };
                      setPrivacy(next);
                      savePrivacy(next);
                    }}
                    className="accent-emerald-400"
                  />
                  Keep this record on this device only
                </label>
                <div className="space-y-1">
                  <Label className="text-xs text-white/50">Retention</Label>
                  <select
                    value={privacy.retentionDays}
                    onChange={(e) => {
                      const next = { ...privacy, retentionDays: Number(e.target.value) };
                      setPrivacy(next);
                      savePrivacy(next);
                    }}
                    className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
                  >
                    {[30, 90, 180, 365].map((d) => (
                      <option key={d} value={d} className="bg-neutral-900">{d} days</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(pathways, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "care-pathways.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" /> Export
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!window.confirm("Erase every pathway stored on this device?")) return;
                      eraseAllData();
                      setPathways([]);
                      setActiveId(null);
                      flash("All local records erased.");
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Erase all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveId(null);
                      resetForm();
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" /> New screening
                  </Button>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  <h2 className="font-heading font-semibold">Audit trail</h2>
                </div>
                <ol className="space-y-2">
                  {[...active.history].reverse().map((h, i) => (
                    <li key={i} className="text-xs border-l-2 border-white/10 pl-3">
                      <p className="text-white/80">{h.event}</p>
                      <p className="text-white/45">{h.detail}</p>
                      <p className="text-white/30">{h.actor} · {fmtDateTime(h.at)}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
