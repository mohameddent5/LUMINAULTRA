# LUMINAULTRA user guide (for the dentist)

This is a smile-design assistant. It reads a photo of the smile, finds the upper front teeth, and draws a starting design for you to adjust. It is not a diagnosis tool and nothing it shows replaces your clinical judgement.

## Taking a good photo
- Use the camera inside the app, or upload a photo taken straight on.
- Upper front teeth fully visible, in focus, evenly lit, no flash glare, camera level with the teeth.
- Show gum above the teeth if you can. Without visible gum, no design is drawn.
- Any camera works, but very small, dark or soft photos are refused or less reliable.

## What you get
Colours follow one legend on every drawing:
- blue: mesial edge of each tooth
- black: distal edge
- red: incisal edge
- cyan: cervical line
- yellow dots: zenith points (placed from the literature, not measured per photo)

Numbers are shown as ratios and percentages by default. Millimetres appear only when the photo has a valid scale.

## Preview confidence (A, B, C)
- **A**: all photo checks passed and at least 6 clear teeth were found. A design is drawn.
- **B**: usable with care. Some checks were borderline, or one or two teeth carry a "possible caries" flag. A design is drawn.
- **C**: not reliable. Either the photo checks failed (sharpness, light, size, teeth visible), the teeth look like braces, the teeth outlines are damaged or merged, the two sides differ too much (over 30%), fewer than 6 upper teeth were found, or the tool may have picked up the lower front teeth. No design is drawn, with a reason and a retake tip. Photos with braces or several flagged teeth may still draw a design, with a red CHECK banner and "check" tags on the affected teeth.

## "Check" tags and flags
- Teeth marked "check" (braces, or colour flags for possible caries) need your own look before you rely on their outline.
- "Possible caries" is a colour prompt only. It cannot tell decay from stain, calculus, a dark filling or shadow. It is never a diagnosis.
- Decay flags are **investigational**: every place one is shown carries "Investigational: a dentist must confirm." (English, plus an Arabic line that has not been reviewed by a native speaker). On a 14-photo development set the flags caught about 1 in 6 of the teeth marked as decayed, with a few false flags on healthy teeth. They are not clinically validated. A missing flag does not mean a tooth is sound.
- Spacing and missing-tooth notes come from geometry (gap compared with the other gaps in the row). They are assistive and have not been validated on a labelled set.

## What has and has not been tested
- The tooth finder and the colour rules were tuned by eye on a small set of photos, mostly your own. Accuracy on other photos, cameras and patients is unknown.
- Small decay at the gum margin or between teeth is mostly missed today (one of six marked teeth flagged on the first labelled photo). Do not treat the absence of a flag as healthy.
- Severely broken upper teeth can make the finder lock onto the lower teeth. The tool now refuses such a photo when it sees another tooth-sized shape above the found row. That check was fitted on one photo.
- Braces flags can appear falsely on dark or degraded photos, and low-light or small photos can lose teeth.
- See `docs/open-items.md` for the running list and the numbers.

## Privacy
Photo analysis runs in the browser. Saving cases to a server needs a database and is off until one is set up. Patient photos, videos and labels used for testing stay out of the code repository. Do not use real patient photos on a deployed copy until the database is set up with a fresh, isolated Postgres (see `docs/DEPLOY.md`).
