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
