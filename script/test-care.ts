/**
 * Rules test for the care pathway engine.
 *
 * Run with `npm run test:care`. Exits non-zero on the first failed expectation
 * so a broken recommendation rule cannot reach the demo.
 */
import {
  ESCALATION_STEPS,
  PROVIDERS,
  bookAppointment,
  buildReminders,
  clinicianSignOff,
  confirmFollowUp,
  createPathway,
  escalate,
  isComplete,
  journeySteps,
  markVisitMissed,
  nextEscalation,
  providersFor,
  recommend,
  slotsFor,
  withdrawConsent,
  grantConsent,
  type CarePathway,
  type Finding,
  type ScreeningResult,
} from "../client/src/lib/careJourney";

let passed = 0;
const failures: string[] = [];

function ok(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
  } else {
    failures.push(label);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  ok(
    actual === expected,
    `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
}

function screening(findings: Finding[]): ScreeningResult {
  return {
    id: "scr_test",
    createdAt: new Date("2026-01-01T09:00:00Z").toISOString(),
    source: "community_worker",
    patientName: "Test Patient",
    ageYears: 40,
    contact: "+1 555 0000",
    findings,
    note: "",
    measured: [],
  };
}

/* ------------------------------------------------------- recommendation rules */

const emergency = recommend(screening([{ code: "swelling", severity: "severe" }]));
eq(emergency.tier, "emergency", "severe swelling routes to emergency care");
eq(emergency.timeframeDays, 0, "emergency is same day");
eq(emergency.urgency, "urgent", "emergency is urgent");
eq(emergency.reasons[0].triggeredBy, "swelling", "emergency reason cites swelling");

const severePain = recommend(screening([{ code: "pain", severity: "severe" }]));
eq(severePain.tier, "emergency", "severe pain routes to emergency care");

const moderatePain = recommend(screening([{ code: "pain", severity: "moderate" }]));
eq(moderatePain.tier, "primary_dental", "moderate pain routes to a dental clinic");
eq(moderatePain.urgency, "soon", "moderate pain is seen soon");

const perio = recommend(screening([{ code: "deep_pocket", severity: "mild" }]));
eq(perio.tier, "specialist_perio", "a deep pocket routes to a periodontal specialist");
eq(perio.timeframeDays, 14, "periodontal referral window is 14 days");

const caries = recommend(screening([{ code: "caries", severity: "mild" }]));
eq(caries.tier, "primary_dental", "decay routes to a dental clinic");

const missing = recommend(screening([{ code: "missing_tooth", severity: "mild" }]));
eq(missing.tier, "specialist_prostho", "a missing tooth routes to prosthodontics");

const esthetic = recommend(screening([{ code: "esthetic_concern", severity: "mild" }]));
eq(esthetic.tier, "esthetic_consult", "an appearance concern routes to an aesthetic consult");

const healthy = recommend(screening([]));
eq(healthy.tier, "self_care", "no findings means no referral");
eq(healthy.reasons[0].triggeredBy, "policy", "self care reason cites policy, not a finding");
eq(healthy.requiredCapability.length, 0, "self care needs no provider capability");

for (const rec of [emergency, moderatePain, perio, caries, missing, esthetic, healthy]) {
  ok(rec.reasons.length > 0, `${rec.tier} always explains itself`);
  ok(
    rec.reasons.every((r) => r.plain.length > 10 && r.because.length > 10),
    `${rec.tier} reasons are written in plain language`,
  );
  ok(rec.ifDelayed.length > 20, `${rec.tier} explains what delay costs`);
  ok(Number.isFinite(rec.timeframeDays) && rec.timeframeDays >= 0, `${rec.tier} has a real window`);
}

const multi = recommend(
  screening([
    { code: "deep_pocket", severity: "moderate" },
    { code: "bleeding", severity: "moderate" },
    { code: "sensitivity", severity: "mild" },
  ]),
);
eq(multi.tier, "specialist_perio", "the most time-critical finding decides the tier");
ok(multi.reasons.length > 1, "supporting findings are still explained");
ok(
  multi.reasons.some((r) => r.triggeredBy === "sensitivity"),
  "sensitivity is listed as a supporting reason",
);

/* ------------------------------------------------------------------ pathway */

const pathway: CarePathway = createPathway(screening([{ code: "deep_pocket", severity: "moderate" }]));
eq(pathway.stage, "awaiting_consent", "a referral pathway waits for consent");
eq(pathway.consent.granted, false, "consent starts ungranted");
eq(pathway.history.length, 2, "screening and recommendation are both audited");

const matching = providersFor(pathway);
ok(matching.length > 0, "a perio referral finds at least one provider");
ok(
  matching.every((p) => p.capabilities.includes("specialist_perio")),
  "only providers with the required capability are offered",
);

const slots = slotsFor(matching[0], new Date("2026-01-01T00:00:00Z"));
eq(slots.length, 3, "three slots are offered");
ok(slots.every((s) => new Date(s).getTime() > 0), "every slot is a real timestamp");

let threw = false;
try {
  bookAppointment(pathway, matching[0], slots[0]);
} catch {
  threw = true;
}
ok(threw, "booking is refused without consent");

const consented = grantConsent(pathway, { allowReminders: true });
eq(consented.consent.granted, true, "consent is recorded");
eq(consented.stage, "awaiting_booking", "consent unlocks booking");

const booked = bookAppointment(consented, matching[0], slots[0]);
eq(booked.stage, "booked", "booking moves the pathway forward");
eq(booked.reminders.length, 3, "three reminders are scheduled");
ok(booked.reminders.every((r) => r.sentAt === null), "reminders start unsent");

const noReminders = buildReminders(
  { providerId: "x", providerName: "X", slotISO: slots[0], bookedAt: new Date().toISOString() },
  { ...consented.consent, allowReminders: false },
);
eq(noReminders.length, 0, "no reminders are scheduled without consent");

/* --------------------------------------------------------------- escalation */

const missed = markVisitMissed(booked);
eq(missed.stage, "missed", "a missed visit is recorded");
eq(nextEscalation(missed)?.step, 2, "the first escalation step is already applied");

const escalated = escalate(missed);
eq(escalated.escalations, 2, "escalation advances");
eq(nextEscalation(escalated)?.step, 3, "the next escalation step is offered");

const exhausted = escalate(escalated);
eq(nextEscalation(exhausted), null, "escalation stops after the final step");
ok(ESCALATION_STEPS.length === 3, "there are three defined escalation steps");

/* ------------------------------------------------------- follow-up and sign-off */

const attended = confirmFollowUp(booked, {
  visited: true,
  outcome: "Treatment completed",
  confirmedBy: "Nurse A. Bello",
});
eq(attended.stage, "attended", "a confirmed visit moves to attended");
eq(isComplete(attended), false, "attendance alone is not completion");

const signed = clinicianSignOff(attended, {
  clinicianName: "Dr R. Mensah",
  registrationId: "REG-12345",
  decision: "confirmed",
  comment: "Findings and treatment agreed.",
});
eq(isComplete(signed), true, "clinician sign-off completes the journey");
eq(signed.stage, "closed", "the pathway closes after sign-off");
eq(signed.history[signed.history.length - 1].actor, "Dr R. Mensah", "sign-off is attributed");

const notAttended = confirmFollowUp(booked, {
  visited: false,
  outcome: "Did not attend",
  confirmedBy: "Nurse A. Bello",
});
eq(notAttended.stage, "missed", "a visit that did not happen returns to escalation");
eq(isComplete(notAttended), false, "an unattended visit is never complete");

/* ------------------------------------------------------------- consent + steps */

const withdrawn = withdrawConsent(consented);
eq(withdrawn.consent.granted, false, "consent can be withdrawn");
eq(withdrawn.consent.shareWithProvider, false, "withdrawal stops sharing");
ok(withdrawn.consent.withdrawnAt !== null, "withdrawal is timestamped");

const steps = journeySteps(signed);
eq(steps.length, 6, "the journey has six visible steps");
eq(steps[0].id, "screening", "the journey starts at the screening result");
ok(steps.every((s) => s.done), "a signed-off journey shows every step done");

const earlySteps = journeySteps(pathway);
ok(earlySteps[2].active && !earlySteps[2].done, "the active step is the first unfinished one");

eq(PROVIDERS.length >= 4, true, "the directory has providers to route to");

/* --------------------------------------------------------------------- report */

if (failures.length > 0) {
  console.error(`test:care FAILED — ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`test:care passed — ${passed} checks`);
