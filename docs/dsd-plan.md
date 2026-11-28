# Dentist DSD tool: plan (Nov 28)

Direction (Mohamed, 5:24 and 5:26): a clinical tool that halves the dentist's DSD time. Not a patient preview. Success test: it draws the lines and measurements a dentist would draw by hand first, and the dentist can adjust them. Sources read: PMC6112329 (review of DSD parameters), PMC3010027 (principles of smile design), the DSD concept handout (go.digitalsmiledesign.com, Apostila_DSD.pdf).

## What a real DSD shows
Facial references on the full-face smile photo: interpupillary line (horizontal reference), facial midline (perpendicular to it), commissure line, occlusal or incisal plane against the eye line, dental midline against facial midline. Dental: incisal edge position and smile arc (incisal edges following the lower lip), gingival zeniths and heights, central width to length proportion and red proportion, buccal corridors, tooth contours drawn over the photo, a grid or ruler calibrated on one tooth (a central incisor width), and the plan then transferred to the intraoral and 12 o'clock views.

## What we have (measured now)
- Face mesh gives eye line, mouth corners, facial midline (nose bridge to chin). The tooth finder gives upper tooth boxes and masks. A ratio design (RED 75%, W/L 77.5%, zeniths) is drawn on found or estimated teeth.
- Shipped today (f6290d6): dentist screening panel with eye line roll, mouth-corner line vs eye line, dental vs facial midline (% of central width, approximate mm with a stated assumption), incisal plane cant vs eye line, central edge height difference. Guarded: no number when the row is not symmetric (missing, broken or merged teeth); no facial values when no face is in the frame. Cut-offs are conventional DSD expectations, NEITHER-sourced and unvalidated.

## What we add, in order
1. Reference lines drawn on the photo, dentist-draggable (eye line, facial midline, dental midline, incisal plane, commissure line), same values as the panel, updating live. Safe: pure display, no detection change.
2. Calibration: dentist taps two points on a central incisor (or enters its width) so mm values replace the 8.5 mm assumption. Scale is only as good as that tap.
3. Smile arc and lip: incisal edge curve vs lower lip (already used for the design), consonant, flat or reverse as a screening note.
4. Gummy smile (gingival display), buccal corridor ratio, from the lip ring and the mouth-corner points. Need honest error bars: boxes are rough.
5. Design drawn even when quality or decay gates fail: ratio design on found or estimated teeth, problem teeth flagged for the dentist (decay, braces, missing or broken) instead of refusing. Gates become warnings addressed to the dentist, with the measured value.
6. Dentist-editable tooth contours (drag outline points) and export of the annotated photo with lines.
7. Drop patient-facing framing (marketing options, "preview for the patient") from the main screen and report; patient material only on request.

## Cannot be done without a bigger engine
- True occlusal plane or lip support (needs profile or 3D); a real smile arc on strongly curved arches with deep shadows; accurate per-tooth outlines on broken or decayed teeth (the finder boxes them roughly); real-world mm without a reference in the frame; separating head roll from camera roll.

## Rules held
No-regression table for any detection change, tests, honest numbers, no photo worse, no new photos requested. Arabic strings unreviewed.

## Update 5:35: Mohamed's references (private, not in git)
His target output (a collage of finished DSDs, plus screenshots and a recording of his earlier live-camera version): reference lines on the photo (facial thirds landmarks glabella, nasion, subnasale, menton; bipupillary; commissural; horizontal reference line; aesthetic plane; dental and facial midline), a proposed gum line and tooth contour, tooth width labels in mm, a proportion ruler across the anterior teeth (1.3, 1.5, 1.7, 1.9...), gingival height labels in mm ("+3.0 mm"), a W/H ratio note with the goal (e.g. "90% squat, goal 75%"), a clinician note (e.g. gingivectomy for asymmetry), and readouts (cant, midline mm, smile arc, gum show mm, DSD index, classification such as "Gummy (severe), reverse").
Order after this update: (1) DONE: draggable reference lines on the photo, live numbers (eye line, facial midline, mouth corners, dental midline, incisal plane; optional central width in mm for calibration; save PNG). (2) Add facial thirds landmarks (glabella, nasion, subnasale, menton) from the face mesh and the horizontal reference line. (3) Width labels per tooth in mm after calibration and a W/H note per tooth with the goal (75%). (4) Proportion ruler across the anterior teeth. (5) Gingival line and gum show in mm (needs gum visible; uses the lip ring and tooth tops). (6) Smile arc and a classification line. (7) Draw the design even when gates fail. Anything estimated stays labelled (no scale, no depth). A "DSD index" score is not planned: no validated formula, and a single number would imply accuracy we do not have.

## Progress (Nov 28 evening)
- Step 2 DONE: facial thirds lines (glabella, subnasale, menton from the face mesh) drawn as dashed horizontals, with middle vs lower third and 1:2 lower-third split findings. Mesh points, about 5 to 10% error; hair line not measured.
- Step 3 DONE (rough): per-tooth width and W/H labels on the 6 anterior teeth, sized to each tooth. Rough boxes; draggable tooth edges are still to do.

## Redirect (Nov 28, 5:54 PM): automatic proposed design first
Mohamed: no dragging, everything automatic; measurement is only the analysis layer, the product is the proposed design drawn on the photo.
- DONE (first version): client/src/lib/autoDesign.ts and ProposedDesign.tsx draw proposed outlines of the 6 upper front teeth, gingival zenith line, incisal plane (parallel to the eye line when a face is found) and midline (facial midline when found), before vs proposed, with flags. No quality or decay gate stops it (needs 3+ upper teeth).
- Open: canine looks too narrow with golden widths (0.62 of a central); try 1 : 0.75 : 0.7. Outline is an estimate, not a simulated result. No held-out scoring yet (nothing to score against: there is no hand-drawn design ground truth).
- Next: gum-show / zenith heights in mm, smile arc following the lower lip, patient-wording cleanup, test on decay and braces photos.
- Extra style reference (Mohamed 5:57, private image-23279dda): live tool with a golden-ratio guide (phi = 1.618 label), canine guide lines, a pink smile arc under the teeth, a gingival line, vertical tooth-boundary guides and a mirrored midline. Fold into the DSD view: smile arc, canine guides, vertical tooth boundary guides.
- Structure to build next (Mohamed 5:57): 3-step switcher: Tracing view, DSD view, Report view (value, goal, right/wrong/uncertain flag, confidence; headline: gum show in mm at the natural smile, with the assumption stated when uncalibrated).
- More style references (Mohamed 5:57, private: image-af87de50, image-ed2598bd, video-dca9a67d): chips for W/L, lateral/central %, symmetry, smile arc; numbered tooth grid 13 to 23 with widths; side tags (cant, smile width, incisal edge length, gingival); a numbers panel with classification wording. Use for Tracing and Report views. No single DSD index unless validated; no claim we cannot measure.

## 3-step flow DONE (Nov 28 6:00)
DsdFlow.tsx: Tracing (reference lines editor), Design (before vs proposed), Report (headline gum show in mm, table of measure / value / goal / Right-Uncertain-Wrong flag, confidence note). Gum show = upper inner lip edge (face mesh 13) to the top of the central tooth boxes, scaled by the entered or assumed 8.5 mm central width; about 1 mm error; goal 0 to 2 mm, over 3 mm gummy (teaching values). Proportions now central 1 : lateral 0.75 : canine 0.7, W/H 0.78 (average proportions; published DSD teaching norms: W/H 75 to 80%, gum show 0 to 2 mm, midline within 2 mm, plane parallel to the eye line; see PMC6112329 and PMC3010027). To do: cite each norm inline, printable one-page report with a pre-design checklist (from his 6:00 stopwatch demo), speed (photo to result under a minute), smile arc and numbered tooth grid 13 to 23, Arabic labels for the new views (not yet written).
- Printable one-page report DONE (6:04): "Print or save the report" in the Report view. Layout after his old tool's summary: header, scale and mode row (no single score), key findings cards with a Verify line, parameter snapshot (value, goal, flag), additional observations, pre-session checkbox list (probing only if gum show is outside the goal; mounted models only if 3 or more flags). Patient ID left blank on purpose. To do: smile arc, numbered tooth grid 13 to 23, timing, Arabic.

## Beyond 2D (Mohamed 6:28), order by value per effort
1. DONE: automatic scale from the iris (face mesh 469/471 and 474/476, 11.7 mm average, about 12% error incl. depth). Priority: dentist-entered width, then iris (only if the implied central width is 6.5 to 11 mm), then the assumed 8.5 mm. The report says which scale each mm figure used, and a "Scale cross-check" row shows the central width the iris implies (normal about 8 to 9.5 mm): disagreement flags mm figures as unreliable.
2. TODO: cross-check mesh vs tooth-box midline; "not reliable, check by eye" when a number's error is above tolerance.
3. TODO: 5 to 10 s capture, median over frames for spikes and an uncertainty (needs a video capture screen; the photo path stays).
4. TODO: head roll vs camera roll and approximate profile from a slow head turn (face mesh depth); error to be measured, not assumed.
5. Optional later: profile-smile photo (occlusal plane), retracted view (gingival margin).
- (2) DONE: cross-checks (two facial midline estimates; iris vs tooth box) turn a number into "not reliable, check by eye".
- (3) PARTLY DONE: during the 8 s smile capture each frame's eye-line angle, mouth-corner angle, mid offset and iris size are collected; the Report shows median and robust spread (MAD) over N frames and marks the angles "check by eye" when the spread exceeds 2.5 degrees. Unit-tested (one spike frame does not move the median). Not yet run with a real camera session in a browser. It measures repeatability, not accuracy.
- Design fit DONE (6:36): each of the 6 outline teeth uses the detected crown width when it is 0.8 to 1.25 of the ratio width and the box W/H is 0.5 to 1.2; otherwise the generic ratio width. The design view says how many teeth used which. Heights are still ratio-based (width / 0.78) because tooth boxes include shadow and gum. Seen on f9b769c5 (6 of 6 fitted) and aff97db1 (5 of 6).
