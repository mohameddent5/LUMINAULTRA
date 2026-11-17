/**
 * Care pathway engine.
 *
 * Takes a person from a screening result to completed care:
 *   screening -> recommended next step (with a plain reason) -> consent ->
 *   booked visit -> reminders -> missed-visit escalation -> follow-up
 *   confirmation -> clinician sign-off.
 *
 * Every function here is pure and deterministic so the pathway can be tested
 * without a browser. Nothing is invented: each recommendation names the finding
 * that triggered it, and a visit only counts as complete when a human confirms
 * it. Where the pathway needs a value the system does not have, the field stays
 * null rather than being filled with a plausible guess.
 */

/* ------------------------------------------------------------------ types */

export type ScreeningSource =
  | "clinician_scan"
  | "community_worker"
  | "self_report"
  | "dsd_scan";

export type Severity = "mild" | "moderate" | "severe";

export type FindingCode =
  | "pain"
  | "swelling"
  | "bleeding"
  | "deep_pocket"
  | "mobility"
  | "caries"
  | "broken_tooth"
  | "missing_tooth"
  | "sensitivity"
  | "esthetic_concern";

export interface Finding {
  code: FindingCode;
  severity: Severity;
}

export interface MeasuredValue {
  label: string;
  value: number;
  unit: string;
}

export interface ScreeningResult {
  id: string;
  createdAt: string;
  source: ScreeningSource;
  patientName: string;
  ageYears: number | null;
  contact: string;
  findings: Finding[];
  note: string;
  /** Values carried over from an instrument (for example a DSD scan). */
  measured: MeasuredValue[];
}

export type CareTier =
  | "emergency"
  | "primary_dental"
  | "specialist_perio"
  | "specialist_prostho"
  | "esthetic_consult"
  | "self_care";

export type Urgency = "urgent" | "soon" | "routine";

export interface Reason {
  /** The finding code that produced this reason. */
  triggeredBy: FindingCode | "policy";
  /** One sentence a patient can understand, without jargon. */
  plain: string;
  /** Why that finding changes the next step. */
  because: string;
  weight: "primary" | "supporting";
}

export interface Recommendation {
  tier: CareTier;
  urgency: Urgency;
  /** Human readable care setting, e.g. "Community dental clinic". */
  setting: string;
  /** Target window for the visit, in days. */
  timeframeDays: number;
  headline: string;
  reasons: Reason[];
  /** Plain answer to "what happens if I do nothing". */
  ifDelayed: string;
  requiredCapability: string[];
}

export type Stage =
  | "recommended"
  | "awaiting_consent"
  | "awaiting_booking"
  | "booked"
  | "missed"
  | "attended"
  | "closed";

export interface Consent {
  granted: boolean;
  grantedAt: string | null;
  /** Share the screening summary with the provider we refer to. */
  shareWithProvider: boolean;
  /** Allow appointment reminders on the contact details given. */
  allowReminders: boolean;
  /** Allow de-identified data to be used for service quality reporting. */
  allowQualityReporting: boolean;
  withdrawnAt: string | null;
}

export interface Appointment {
  providerId: string;
  providerName: string;
  slotISO: string;
  bookedAt: string;
}

export interface Reminder {
  id: string;
  dueAt: string;
  channel: "sms" | "email";
  message: string;
  sentAt: string | null;
}

export interface EscalationStep {
  step: number;
  afterHours: number;
  action: string;
  owner: string;
}

export interface FollowUp {
  visited: boolean | null;
  outcome: string;
  confirmedAt: string | null;
  confirmedBy: string;
}

export interface ClinicianSignOff {
  clinicianName: string;
  registrationId: string;
  decision: "confirmed" | "amended";
  comment: string;
  signedAt: string;
}

export interface AuditEvent {
  at: string;
  actor: string;
  event: string;
  detail: string;
}

export interface CarePathway {
  id: string;
  createdAt: string;
  screening: ScreeningResult;
  recommendation: Recommendation;
  consent: Consent;
  appointment: Appointment | null;
  reminders: Reminder[];
  escalations: number;
  followUp: FollowUp;
  clinician: ClinicianSignOff | null;
  stage: Stage;
  history: AuditEvent[];
}

export interface Provider {
  id: string;
  name: string;
  setting: string;
  city: string;
  capabilities: string[];
  /** Days until the next available appointment. Demo directory data. */
  nextSlotDays: number;
}

/* -------------------------------------------------------------- directory */

/**
 * Demonstration provider directory. Slots are generated relative to today so
 * the booking step always has something to offer; names are illustrative.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "riverside-community",
    name: "Riverside Community Dental Clinic",
    setting: "Community dental clinic",
    city: "Riverside",
    capabilities: ["primary_dental", "urgent_care", "restorative"],
    nextSlotDays: 2,
  },
  {
    id: "northgate-family",
    name: "Northgate Family Dental",
    setting: "Family dental practice",
    city: "Northgate",
    capabilities: ["primary_dental", "restorative", "esthetic"],
    nextSlotDays: 4,
  },
  {
    id: "meridian-perio",
    name: "Meridian Periodontal Institute",
    setting: "Specialist periodontal centre",
    city: "Meridian",
    capabilities: ["specialist_perio", "surgery"],
    nextSlotDays: 9,
  },
  {
    id: "harbour-prostho",
    name: "Harbour Prosthodontic Centre",
    setting: "Specialist prosthodontic centre",
    city: "Harbour",
    capabilities: ["specialist_prostho", "implants"],
    nextSlotDays: 16,
  },
  {
    id: "studio-estera",
    name: "Studio Estera Aesthetic Dentistry",
    setting: "Aesthetic dental studio",
    city: "Central",
    capabilities: ["esthetic", "restorative"],
    nextSlotDays: 11,
  },
  {
    id: "st-martins-emergency",
    name: "St Martin's Hospital Dental Unit",
    setting: "Hospital dental emergency unit",
    city: "St Martin's",
    capabilities: ["urgent_care", "surgery", "primary_dental"],
    nextSlotDays: 0,
  },
];

/* ------------------------------------------------------------------ rules */

const TIER_SETTING: Record<CareTier, string> = {
  emergency: "Hospital dental emergency unit",
  primary_dental: "Community dental clinic",
  specialist_perio: "Specialist periodontal centre",
  specialist_prostho: "Specialist prosthodontic centre",
  esthetic_consult: "Aesthetic dental studio",
  self_care: "No referral needed — prevention and routine recall",
};

const TIER_CAPABILITY: Record<CareTier, string[]> = {
  emergency: ["urgent_care"],
  primary_dental: ["primary_dental"],
  specialist_perio: ["specialist_perio"],
  specialist_prostho: ["specialist_prostho"],
  esthetic_consult: ["esthetic"],
  self_care: [],
};

const TIER_TIMEFRAME: Record<CareTier, number> = {
  emergency: 0,
  primary_dental: 7,
  specialist_perio: 14,
  specialist_prostho: 30,
  esthetic_consult: 30,
  self_care: 180,
};

const TIER_URGENCY: Record<CareTier, Urgency> = {
  emergency: "urgent",
  primary_dental: "soon",
  specialist_perio: "soon",
  specialist_prostho: "routine",
  esthetic_consult: "routine",
  self_care: "routine",
};

const TIER_HEADLINE: Record<CareTier, string> = {
  emergency: "Be seen today at a hospital dental unit",
  primary_dental: "Book a dental clinic visit this week",
  specialist_perio: "See a gum (periodontal) specialist within two weeks",
  specialist_prostho: "See a replacement-teeth (prosthodontic) specialist",
  esthetic_consult: "Book an aesthetic consultation",
  self_care: "No treatment referral needed yet",
};

const TIER_IF_DELAYED: Record<CareTier, string> = {
  emergency:
    "Swelling and pain can spread quickly. Waiting risks a serious infection that is harder to treat.",
  primary_dental:
    "A small cavity can be filled simply now. Left alone it usually reaches the nerve and needs a root canal or extraction.",
  specialist_perio:
    "Gum disease is slow but it does not heal on its own. Without treatment the bone holding the teeth keeps shrinking.",
  specialist_prostho:
    "A gap lets neighbouring teeth drift and the jaw bone shrink, which makes replacement harder later.",
  esthetic_consult:
    "Nothing gets worse clinically, but the concern you raised stays unaddressed.",
  self_care:
    "Your mouth looks healthy today. Keeping the six-month check keeps it that way.",
};

const FINDING_LABEL: Record<FindingCode, string> = {
  pain: "pain",
  swelling: "swelling",
  bleeding: "gums that bleed when brushed",
  deep_pocket: "a deep gum pocket",
  mobility: "a loose tooth",
  caries: "tooth decay",
  broken_tooth: "a broken tooth",
  missing_tooth: "a missing tooth",
  sensitivity: "tooth sensitivity",
  esthetic_concern: "a concern about how your smile looks",
};

function has(findings: Finding[], code: FindingCode): Finding | undefined {
  return findings.find((f) => f.code === code);
}

function atLeast(findings: Finding[], code: FindingCode, min: Severity): boolean {
  const order: Severity[] = ["mild", "moderate", "severe"];
  const f = has(findings, code);
  return !!f && order.indexOf(f.severity) >= order.indexOf(min);
}

function reasonFor(
  findings: Finding[],
  code: FindingCode,
  because: string,
  weight: "primary" | "supporting",
): Reason | null {
  const f = has(findings, code);
  if (!f) return null;
  const severityNote =
    f.severity === "severe" ? " (severe)" : f.severity === "moderate" ? " (moderate)" : "";
  return {
    triggeredBy: code,
    plain: `Your screening recorded ${FINDING_LABEL[code]}${severityNote}.`,
    because,
    weight,
  };
}

/**
 * Decide the next step for a screening result.
 *
 * Order matters: the most time-critical finding wins. Supporting reasons are
 * still listed so the patient sees the full picture, not just one trigger.
 */
export function recommend(screening: ScreeningResult): Recommendation {
  const f = screening.findings;

  let tier: CareTier = "self_care";
  const primaryCode: FindingCode | null = null;
  let primaryReason: Reason | null = null;

  if (atLeast(f, "swelling", "moderate") || atLeast(f, "pain", "severe")) {
    tier = "emergency";
    primaryReason =
      reasonFor(
        f,
        "swelling",
        "Swelling with pain can mean an infection is spreading beyond the tooth, which needs same-day care.",
        "primary",
      ) ??
      reasonFor(
        f,
        "pain",
        "Severe pain that keeps you awake usually means the nerve or the bone around the tooth is involved.",
        "primary",
      );
  } else if (atLeast(f, "pain", "moderate")) {
    tier = "primary_dental";
    primaryReason = reasonFor(
      f,
      "pain",
      "Pain at this level is normally treatable in a general clinic and should not wait.",
      "primary",
    );
  } else if (
    atLeast(f, "deep_pocket", "mild") ||
    atLeast(f, "bleeding", "moderate") ||
    atLeast(f, "mobility", "moderate")
  ) {
    tier = "specialist_perio";
    primaryReason =
      reasonFor(
        f,
        "deep_pocket",
        "A pocket deeper than 4 mm means the gum has detached from the tooth and needs specialist cleaning.",
        "primary",
      ) ??
      reasonFor(
        f,
        "mobility",
        "A tooth that moves has lost supporting bone, which a gum specialist is trained to assess.",
        "primary",
      ) ??
      reasonFor(
        f,
        "bleeding",
        "Bleeding at this level is active gum inflammation and needs professional treatment, not just better brushing.",
        "primary",
      );
  } else if (atLeast(f, "caries", "mild") || atLeast(f, "broken_tooth", "mild")) {
    tier = "primary_dental";
    primaryReason =
      reasonFor(
        f,
        "caries",
        "Decay that has not reached the nerve can usually be fixed with a simple filling.",
        "primary",
      ) ??
      reasonFor(
        f,
        "broken_tooth",
        "A broken tooth is open to decay and needs sealing before it gets worse.",
        "primary",
      );
  } else if (has(f, "missing_tooth")) {
    tier = "specialist_prostho";
    primaryReason = reasonFor(
      f,
      "missing_tooth",
      "Replacing a missing tooth is a prosthodontic decision, so the referral goes to that specialist.",
      "primary",
    );
  } else if (has(f, "esthetic_concern")) {
    tier = "esthetic_consult";
    primaryReason = reasonFor(
      f,
      "esthetic_concern",
      "You raised a concern about appearance rather than disease, so an aesthetic consultation is the right first step.",
      "primary",
    );
  } else {
    primaryReason = {
      triggeredBy: "policy",
      plain: "Your screening found no active disease.",
      because:
        "With no decay, gum pockets or pain recorded, a six-month recall is enough to catch problems early.",
      weight: "primary",
    };
  }

  const supporting: Reason[] = [];
  const addSupporting = (code: FindingCode, because: string) => {
    if (code === primaryReason?.triggeredBy) return;
    const r = reasonFor(f, code, because, "supporting");
    if (r) supporting.push(r);
  };
  addSupporting("sensitivity", "Sensitivity often means enamel has worn thin over a live nerve.");
  addSupporting("bleeding", "Bleeding gums are the earliest sign of gum disease and are easy to treat early.");
  addSupporting("missing_tooth", "A gap changes how the remaining teeth bite together.");
  addSupporting("esthetic_concern", "Appearance concerns are recorded so the clinician can address them in the same visit.");

  const reasons = primaryReason ? [primaryReason, ...supporting] : supporting;

  return {
    tier,
    urgency: TIER_URGENCY[tier],
    setting: TIER_SETTING[tier],
    timeframeDays: TIER_TIMEFRAME[tier],
    headline: TIER_HEADLINE[tier],
    reasons,
    ifDelayed: TIER_IF_DELAYED[tier],
    requiredCapability: TIER_CAPABILITY[tier],
  };
}

/* ------------------------------------------------------------- pathway ops */

export function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function addDaysISO(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function event(actor: string, eventName: string, detail: string): AuditEvent {
  return { at: new Date().toISOString(), actor, event: eventName, detail };
}

export function createPathway(screening: ScreeningResult): CarePathway {
  const recommendation = recommend(screening);
  const needsBooking = recommendation.tier !== "self_care";
  return {
    id: uid("path"),
    createdAt: new Date().toISOString(),
    screening,
    recommendation,
    consent: {
      granted: false,
      grantedAt: null,
      shareWithProvider: true,
      allowReminders: true,
      allowQualityReporting: false,
      withdrawnAt: null,
    },
    appointment: null,
    reminders: [],
    escalations: 0,
    followUp: { visited: null, outcome: "", confirmedAt: null, confirmedBy: "" },
    clinician: null,
    stage: needsBooking ? "awaiting_consent" : "recommended",
    history: [
      event(
        screening.source === "dsd_scan" ? "Screening instrument" : "Screener",
        "Screening recorded",
        `${screening.findings.length} finding(s) recorded from ${screening.source.replace(/_/g, " ")}.`,
      ),
      event("Care pathway engine", "Next step recommended", recommendation.headline),
    ],
  };
}

export function grantConsent(p: CarePathway, consent: Partial<Consent>): CarePathway {
  const granted: Consent = {
    ...p.consent,
    ...consent,
    granted: true,
    grantedAt: new Date().toISOString(),
    withdrawnAt: null,
  };
  return {
    ...p,
    consent: granted,
    stage: p.stage === "awaiting_consent" ? "awaiting_booking" : p.stage,
    history: [
      ...p.history,
      event(
        "Patient",
        "Consent given",
        `Sharing with provider: ${granted.shareWithProvider ? "yes" : "no"}; reminders: ${
          granted.allowReminders ? "yes" : "no"
        }; quality reporting: ${granted.allowQualityReporting ? "yes" : "no"}.`,
      ),
    ],
  };
}

export function withdrawConsent(p: CarePathway): CarePathway {
  return {
    ...p,
    consent: {
      ...p.consent,
      granted: false,
      withdrawnAt: new Date().toISOString(),
      shareWithProvider: false,
      allowReminders: false,
    },
    reminders: p.reminders.map((r) => (r.sentAt ? r : { ...r, sentAt: null })),
    history: [
      ...p.history,
      event("Patient", "Consent withdrawn", "Sharing stopped and pending reminders cancelled."),
    ],
  };
}

export function providersFor(p: CarePathway): Provider[] {
  const need = p.recommendation.requiredCapability;
  if (need.length === 0) return [];
  return PROVIDERS.filter((prov) => need.every((c) => prov.capabilities.includes(c)));
}

/** Offer three concrete slots for a provider, relative to now. */
export function slotsFor(provider: Provider, now: Date = new Date()): string[] {
  const base = provider.nextSlotDays;
  return [base, base + 2, base + 5].map((days, i) => {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + days);
    d.setHours(9 + i * 3, 0, 0, 0);
    return d.toISOString();
  });
}

export function bookAppointment(
  p: CarePathway,
  provider: Provider,
  slotISO: string,
): CarePathway {
  if (!p.consent.granted) {
    throw new Error("Consent is required before a visit can be booked.");
  }
  const appointment: Appointment = {
    providerId: provider.id,
    providerName: provider.name,
    slotISO,
    bookedAt: new Date().toISOString(),
  };
  return {
    ...p,
    appointment,
    reminders: buildReminders(appointment, p.consent),
    stage: "booked",
    history: [
      ...p.history,
      event(
        "Patient",
        "Visit booked",
        `${provider.name} on ${new Date(slotISO).toLocaleString()}.`,
      ),
    ],
  };
}

export function buildReminders(a: Appointment, consent: Consent): Reminder[] {
  if (!consent.allowReminders) return [];
  const visit = new Date(a.slotISO).getTime();
  const channel: Reminder["channel"] = consent.shareWithProvider ? "sms" : "email";
  const plan: Array<{ offsetDays: number; message: string }> = [
    { offsetDays: -7, message: "One week until your dental visit. Reply YES to confirm." },
    { offsetDays: -1, message: "Your dental visit is tomorrow. Reply YES to confirm." },
    { offsetDays: 0, message: "Your dental visit is today. Bring your screening summary." },
  ];
  return plan.map((r, i) => ({
    id: `rem_${i}_${a.providerId}`,
    dueAt: new Date(visit + r.offsetDays * 86400000).toISOString(),
    channel,
    message: r.message,
    sentAt: null,
  }));
}

export const ESCALATION_STEPS: EscalationStep[] = [
  {
    step: 1,
    afterHours: 0,
    action: "Send a reschedule link offering the next three available slots.",
    owner: "Automated reminder service",
  },
  {
    step: 2,
    afterHours: 24,
    action: "Community health worker calls the patient to find out what stopped the visit.",
    owner: "Community health worker",
  },
  {
    step: 3,
    afterHours: 72,
    action: "Clinic coordinator reviews the case and offers a home or outreach visit.",
    owner: "Clinic coordinator",
  },
];

export function markVisitMissed(p: CarePathway): CarePathway {
  if (!p.appointment) throw new Error("There is no booked visit to mark as missed.");
  const next = { ...p, stage: "missed" as Stage, escalations: Math.max(1, p.escalations) };
  return {
    ...next,
    history: [
      ...p.history,
      event("Clinic", "Visit missed", `${p.appointment.providerName}: patient did not attend.`),
      event("Reminder service", "Escalation started", ESCALATION_STEPS[0].action),
    ],
  };
}

export function nextEscalation(p: CarePathway): EscalationStep | null {
  if (p.stage !== "missed") return null;
  const idx = Math.min(p.escalations, ESCALATION_STEPS.length);
  return ESCALATION_STEPS[idx] ?? null;
}

export function escalate(p: CarePathway): CarePathway {
  const step = nextEscalation(p);
  if (!step) return p;
  return {
    ...p,
    escalations: p.escalations + 1,
    history: [
      ...p.history,
      event(step.owner, `Escalation step ${step.step}`, step.action),
    ],
  };
}

export function rebook(p: CarePathway, provider: Provider, slotISO: string): CarePathway {
  const appointment: Appointment = {
    providerId: provider.id,
    providerName: provider.name,
    slotISO,
    bookedAt: new Date().toISOString(),
  };
  return {
    ...p,
    appointment,
    reminders: buildReminders(appointment, p.consent),
    stage: "booked",
    history: [
      ...p.history,
      event(
        "Patient",
        "Visit rebooked",
        `${provider.name} on ${new Date(slotISO).toLocaleString()}.`,
      ),
    ],
  };
}

export function confirmFollowUp(
  p: CarePathway,
  input: { visited: boolean; outcome: string; confirmedBy: string },
): CarePathway {
  return {
    ...p,
    followUp: {
      visited: input.visited,
      outcome: input.outcome,
      confirmedAt: new Date().toISOString(),
      confirmedBy: input.confirmedBy,
    },
    stage: input.visited ? "attended" : "missed",
    history: [
      ...p.history,
      event(
        input.confirmedBy,
        "Follow-up checked",
        input.visited
          ? `Visit confirmed. Outcome: ${input.outcome || "not recorded"}.`
          : "Visit did not happen. Pathway returns to escalation.",
      ),
    ],
  };
}

export function clinicianSignOff(
  p: CarePathway,
  input: {
    clinicianName: string;
    registrationId: string;
    decision: "confirmed" | "amended";
    comment: string;
  },
): CarePathway {
  const signOff: ClinicianSignOff = { ...input, signedAt: new Date().toISOString() };
  return {
    ...p,
    clinician: signOff,
    stage: p.followUp.visited ? "closed" : p.stage,
    history: [
      ...p.history,
      event(
        input.clinicianName,
        input.decision === "confirmed" ? "Clinician confirmed" : "Clinician amended",
        input.comment || "Key decisions reviewed.",
      ),
    ],
  };
}

/** Whether the case is finished: visit confirmed and a clinician signed it off. */
export function isComplete(p: CarePathway): boolean {
  return p.followUp.visited === true && p.clinician !== null;
}

export interface JourneyStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
}

export function journeySteps(p: CarePathway): JourneyStep[] {
  const consentDone = p.consent.granted;
  const bookedDone = p.appointment !== null;
  const attendedDone = p.followUp.visited === true;
  const signedDone = p.clinician !== null;
  const order = [
    { id: "screening", label: "Screening result", detail: "What was found", done: true },
    {
      id: "recommendation",
      label: "Next step",
      detail: p.recommendation.headline,
      done: true,
    },
    {
      id: "consent",
      label: "Consent",
      detail: consentDone ? "Given" : "Waiting for the patient",
      done: consentDone,
    },
    {
      id: "booking",
      label: "Booked visit",
      detail: bookedDone
        ? new Date(p.appointment!.slotISO).toLocaleString()
        : "Not booked yet",
      done: bookedDone,
    },
    {
      id: "followup",
      label: "Visit happened",
      detail: attendedDone
        ? "Confirmed"
        : p.followUp.visited === false
          ? "Missed — escalating"
          : "Awaiting confirmation",
      done: attendedDone,
    },
    {
      id: "signoff",
      label: "Clinician sign-off",
      detail: signedDone ? p.clinician!.clinicianName : "Not signed yet",
      done: signedDone,
    },
  ];
  const firstOpen = order.findIndex((s) => !s.done);
  return order.map((s, i) => ({
    ...s,
    active: i === (firstOpen === -1 ? order.length - 1 : firstOpen),
  }));
}

/* ---------------------------------------------------------------- storage */

const STORE_KEY = "carePathways";
const PRIVACY_KEY = "carePrivacy";

export interface PrivacySettings {
  storeLocallyOnly: boolean;
  retentionDays: number;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  storeLocallyOnly: true,
  retentionDays: 90,
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadPathways(): CarePathway[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<CarePathway[]>(window.localStorage.getItem(STORE_KEY), []);
  return Array.isArray(list) ? list : [];
}

export function savePathways(list: CarePathway[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the pathway still works for this session */
  }
}

export function upsertPathway(p: CarePathway): CarePathway[] {
  const list = loadPathways();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = p;
  else list.unshift(p);
  savePathways(list);
  return list;
}

export function loadPrivacy(): PrivacySettings {
  if (typeof window === "undefined") return DEFAULT_PRIVACY;
  return { ...DEFAULT_PRIVACY, ...safeParse<Partial<PrivacySettings>>(
    window.localStorage.getItem(PRIVACY_KEY),
    {},
  ) };
}

export function savePrivacy(s: PrivacySettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRIVACY_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Erase every pathway and the privacy record. Used by the privacy panel. */
export function eraseAllData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem(PRIVACY_KEY);
  } catch {
    /* ignore */
  }
}
