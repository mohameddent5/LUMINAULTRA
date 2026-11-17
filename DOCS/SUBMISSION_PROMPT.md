# LUMINA ULTRA — Submission Pack

Everything a person (or an AI) needs to write the solution summary, the "what we built"
text, or a full pitch deck. Written to be honest: every claim here is either a measured
property of the code, a cited published value, or explicitly labelled as a limitation.

---

## PART 1 — The copy-paste AI prompt

Paste the block below into any capable AI to generate your submission text or slide deck.
It is self-contained.

---

> **ROLE**
> You are a technical writer and pitch strategist for a health-technology hackathon.
> Write submission material about a software product called **LUMINA ULTRA**, described
> fully below. Do not invent features, numbers, customers, approvals or clinical claims
> that are not in this brief. Where the brief says "limitation", keep it — honesty is part
> of the product's credibility.
>
> **THE PRODUCT (as built)**
> LUMINA ULTRA is a browser-based aesthetic-dentistry workspace that turns an ordinary
> webcam or a phone photo into structured, evidence-referenced smile measurements, then
> carries that result through to a plan, a simulated outcome, a prescription, and a
> tracked care pathway with clinician sign-off.
>
> It runs entirely in the browser. No image ever leaves the device — there is no upload
> endpoint, no server-side storage of faces, and no account required. A Node/Express
> server serves the built client and nothing else. This is a privacy-by-architecture
> design choice, not a marketing line: the face landmark model, the tooth detector and
> the depth model all execute locally in WebAssembly / WebGL.
>
> **THE PROBLEM IT ADDRESSES**
> Smile assessment in practice depends on calipers, transparent grids, reference
> photographs and the clinician's eye. That makes it subjective, hard to reproduce, and
> hard to explain to a patient. The consultation gap is not a lack of opinion — it is a
> lack of a shared, repeatable number the patient can see and the clinician can defend.
>
> **HOW IT WORKS — the measurement engine**
> A 478-point face mesh plus a dental keypoint detector locate the lips, the commissures,
> the incisal edges and the gingival zeniths. A calibration step converts pixels to
> millimetres using a physical reference in frame; without it, millimetre metrics are
> withheld and only scale-free proportions are shown.
>
> The engine reports **20 metrics** across four families:
> 1. **Proportion** — central incisor width/length ratio, lateral-to-central and
>    canine-to-lateral width ratios, golden proportion, RED proportion.
> 2. **Alignment** — dental midline shift, midline cant, occlusal plane cant,
>    commissural cant.
> 3. **Gingival** — gingival display on smile, gingival margin height difference,
>    gingival symmetry.
> 4. **Smile composition** — smile arc classification (consonant / flat / reverse),
>    buccal corridor, diastema, smile fullness, tooth display.
>
> Each metric carries its ideal value, its acceptable band, its evidence grade, the
> published reference behind it, and a measurement uncertainty in millimetres. The
> composite harmony score is a weighted function of those bands — and it is deliberately
> **withheld** when too few metrics are measurable.
>
> **THE INTEGRITY LAYER (the most defensible part of the build)**
> Early versions produced readings that were physically impossible — a gingival display of
> −40 mm, a width/length ratio of 300%, an 89° cant. The cause was not a bad formula; it
> was landmark jitter. One frame with a mis-placed keypoint produced geometry that no human
> face can have, and the classifier dutifully graded it.
>
> Three guards now make that impossible:
> 1. **Physiological bounds.** Every physical metric declares a plausible range with a
>    written rationale. A value outside that range is not graded — it is withheld and the
>    reason is shown ("outside the physiological range — likely unstable tracking").
> 2. **Robust temporal consensus.** Measurements are aggregated over a rolling window using
>    the **median** and **median absolute deviation**, so a single spiking frame cannot move
>    the reported value. Outlying frames are counted and disclosed.
> 3. **A quality gate.** The report states how many frames were seen, how many metrics are
>    settled versus provisional, how many outlying readings were discarded, and it refuses
>    to show a composite score at all when fewer than five metrics are measurable.
>
> The design principle is stated in the code: *a number nobody can defend is worse than no
> number.* The system reports "n/a" with a reason rather than inventing a plausible value.
> This was verified by a dedicated regression suite (13 checks) plus the 15-check
> measurement suite.
>
> **THE CARE PATHWAY**
> A screening result is not an end point. From the measured result the product proposes the
> next step with a plain-language reason, books a visit with a provider, schedules
> reminders, escalates when a follow-up is missed, records the follow-up that actually
> happened, and captures clinician sign-off on the key decisions. Consent and privacy
> controls gate the record. Every step is written to an audit trail, so the patient journey
> is reconstructable end to end.
>
> **WHAT A USER CAN DO TODAY (all working, all in the live demo)**
> - Run a live camera screening, or upload a photo — no camera permission needed.
> - See 20 measurements with ideal values, bands, evidence references and uncertainty.
> - Read a data-quality verdict explaining how settled the numbers are.
> - Simulate a smile outcome from the measured baseline: sliders drive a real visual change,
>   "apply ideal" shows the corrected proportions, and a labelled before/after image can be
>   downloaded.
> - Generate a prescription from a stored analysis, with an explicit demo record for
>   evaluation.
> - Compare a baseline against a review visit, side by side.
> - Follow a patient through the care pathway: reason, booking, reminder, escalation,
>   follow-up check, clinician confirmation.
> - Review the clinical dashboard and the validation page documenting how the metrics are
>   defined and guarded.
>
> **TECHNICAL STACK (factual)**
> React + TypeScript + Vite client; Tailwind-styled UI; MediaPipe-based face landmarking and
> a dental keypoint model running in-browser; ONNX Runtime Web (WASM, single-threaded,
> self-hosted) for the depth estimator; an Express/Node server serving the static build on
> `0.0.0.0`; Docker deployment on an Alpine base. All patient records and analyses live in
> the browser's local storage — nothing is transmitted.
>
> **HONEST LIMITATIONS — state these plainly**
> - This is **not a validated clinical instrument**. It has not been compared against
>   caliper measurement on a patient cohort, and no clinician has signed off its accuracy.
>   It is a structured, reproducible *aid* to a conversation.
> - Accuracy depends on capture quality: lighting, head pose, focus, and a visible scale
>   reference for millimetre values. The quality gate makes this visible rather than hidden.
> - The smile simulation is a geometric/visual preview of proportion changes, not a
>   prediction of a clinical outcome.
> - Depth estimation is approximate and used for guidance, not for measurement.
> - Demo cases are clearly labelled demo data, not real patients.
> - Data lives in the browser; there is no multi-device sync, and clearing browser storage
>   clears the record.
>
> **EVIDENCE BASE — cite these correctly**
> The metric ideals follow published aesthetic-dentistry literature: maxillary central
> incisor width/height ratio around 78–80% (Melo et al., 2019; Coronel et al., 2025 review
> reporting population means of 80–85%); lateral incisor ≈66% of the central width and
> canine ≈84% of the lateral (Cinelli et al., 2023); upper lip elevation displaying roughly
> 10 mm of maxillary incisor on smile (JCO, "The Eight Components of a Balanced Smile").
> The product's own values were chosen independently and then cross-checked against this
> literature — say that, do not claim the papers were ingested as training data.
>
> **WHAT MAKES THIS DIFFERENT — the argument to lead with**
> Most smile apps produce a picture. This produces a *defensible number, then a journey*:
> measurement with stated uncertainty → an explanation the patient can follow → a plan and a
> simulation → a prescription → a booked, reminded, escalated, confirmed episode of care.
> And it refuses to answer when the evidence is not there, which is precisely the behaviour
> a clinician needs before trusting any of it.
>
> **DELIVERABLES I WANT FROM YOU**
> Ask me which of these you should produce, then produce it:
> 1. A 250-word solution summary.
> 2. A 10-slide deck outline: one idea per slide, a headline, three supporting bullets, and
>    a suggested visual for each.
> 3. A 3-minute demo script with exact clicks and the sentence to say at each step.
> 4. A judge Q&A sheet: the eight hardest questions and honest, confident answers.
> 5. A one-paragraph "what we built" blurb for a submission form.
>
> **STYLE**
> Confident, specific, no hype adjectives, no invented statistics. Prefer a number with a
> caveat over a superlative. Never describe the product as clinically validated.

---

## PART 2 — Slide-by-slide skeleton (if you want to skip the AI)

| # | Slide | Headline | Core content |
|---|-------|----------|--------------|
| 1 | Title | LUMINA ULTRA — from a smile to completed care | One-line promise + the live URL |
| 2 | Problem | Smile assessment is an opinion, not a number | Calipers, grids, subjectivity, no reproducible record |
| 3 | Insight | The gap is a shared number | Patient and clinician cannot point at the same evidence |
| 4 | What it does | 20 measurements from a webcam or a photo | Metric families, bands, uncertainty, evidence refs |
| 5 | Integrity | It refuses to answer when the data is bad | Bounds + median/MAD consensus + quality gate |
| 6 | Beyond measurement | Simulation with the measured baseline | Sliders, apply-ideal, labelled before/after export |
| 7 | The journey | Screening → reason → booking → follow-up → sign-off | Care pathway with audit trail |
| 8 | Privacy | The face never leaves the device | In-browser inference, local storage, no upload |
| 9 | Proof | What is verified, and what is not | 28 automated checks, live deployment, stated limits |
| 10 | Ask | Pilot with a clinic | What you want next |

## PART 3 — Demo script (about 3 minutes)

1. **Landing page** — "Every consultation starts with an opinion. We start with a number."
2. **Scanner** — run the camera or upload a photo. Point at the measurement panel: "Twenty
   metrics, each with its ideal, its band, and its uncertainty."
3. **Quality line** — "This is the part that matters. It tells you how settled these numbers
   are, and if the capture is poor it withholds the score entirely."
4. **Smile simulator** — move one slider. "That is the patient's own baseline, and this is
   the corrected proportion — side by side, downloadable."
5. **Prescription** — generate from the stored analysis. "The measurement becomes a document."
6. **Care journey** — walk reason → booking → missed reminder → escalation → follow-up →
   clinician sign-off. "The screening is not the product. The completed episode is."
7. **Close** — "It measures, it explains itself, and it knows when to stay silent."

## PART 4 — Judge Q&A (the hard questions)

**"Is this clinically validated?"**
No, and we say so in the product. It is a measurement aid with stated uncertainty; the next
step is a comparison study against caliper measurement. What we have validated is that it
cannot produce a physically impossible reading.

**"What happens if the camera is bad?"**
Millimetre metrics are withheld without calibration, outlying frames are discarded, and the
composite score disappears below five measurable metrics. Degradation is visible, not hidden.

**"Why should I trust the numbers?"**
Each has a published reference, a band, and a stated uncertainty in millimetres. And the
system shows its data quality — including how many frames it discarded.

**"Where does patient data go?"**
Nowhere. Inference and storage are local to the browser. There is no upload endpoint.

**"What is genuinely novel?"**
The refusal behaviour and the continuity: a guarded measurement that flows into a simulated
outcome, a prescription and a tracked episode of care with sign-off.

**"What is the business model?"**
Not asserted in this build. The credible path is a clinic subscription for the consultation
and follow-up workflow; that is a hypothesis, not a claim.

**"What breaks at scale?"**
Nothing is server-side, so scale is a client concern: model download size and older phones.
The depth model loads lazily and the app degrades to face-mesh geometry without it.

**"What did you not finish?"**
Real multi-user persistence and a validated accuracy study. Both are named, neither is
faked.

## PART 5 — Verification record (what is actually proven)

- `npm run check` — TypeScript compiles clean.
- `npm run test:dsd` — 15 measurement checks (metrics measured not hard-coded, cant zero
  against a level reference, uncalibrated frames withhold millimetres, degenerate frames do
  not throw, score excludes unavailable metrics).
- `npm run test:plausibility` — 13 integrity checks (impossible values rejected, one spike
  cannot move a settled value, a tracker drops impossible frames, thin captures yield no
  score, a single frame is provisional).
- Production build succeeds; the app is deployed and serving.
- Browser route sweep across the workspace pages with no page errors.

Not proven: clinical accuracy on patients, behaviour on every phone and camera, and
accessibility conformance. Say so if asked.
