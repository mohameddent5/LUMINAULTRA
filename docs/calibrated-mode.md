# Optional calibrated (mm) mode: literature and design

Default stays ratios, angles and percentages. mm appear only when calibration passes the checks below.

## What the literature says (read for this note; numbers were not extracted unless stated)
- A 2D photo can be scaled from an object of known size placed in the picture. A published protocol uses a 1 cm adhesive scale and shows how to correct a mis-oriented tab (PMC8122989, scoping review plus protocol).
- Two main error sources in 2D image measurement: the accuracy of the calibration scale and image orientation, and landmark subjectivity (PMC2981770).
- Photographic measures of tooth proportions are only true when the camera's lens axis is along the patient's midsagittal line. A simulation with a plaster model rotated up to 10 degrees showed the anterior tooth ratios change with rotation (PMC4820596; the abstract is cut off in my fetch, so I do not quote the size of the change).
- Smartphone versus DSLR accuracy on photographed casts, and the effect of camera distance, were compared against an intraoral scanner (PMC8694966). I did not extract the error values, so I do not quote them. They must be read in full before an error range is shown to users.
- Lens distortion (radial and tangential) limits photogrammetric accuracy; better lenses distort less (PMC11314698). Photogrammetry on a live face had about 1 mm deviation versus about 0.2 mm on inanimate casts in one orthodontic study (PMC8659967), which is a reason to keep error ranges generous for living subjects.
- Depth: a ruler held in front of or behind the tooth plane changes scale (perspective). This is geometry, not a cited result: the tooth surface and the ruler must sit in one plane facing the camera.

## Design (not built yet)
1. Detect the ruler automatically in the frame: a long thin rectangle with regular tick marks. Read the graduation spacing (px per tick) along its length and the tick pattern to get the real length.
2. Checks, any failure falls back to percentages with a plain message:
   - Ticks are evenly spaced (spacing varies by under a small tolerance along the ruler): shows it is not strongly tilted or bent.
   - Ruler is near the incisal plane: its vertical position in the frame is within the tooth band, and its apparent width matches what a flat, facing ruler would show.
   - Face lines and midline show the head is roughly frontal, so the 2D scale holds for the tooth plane.
   - Sharp and large enough that ticks resolve (at least several px per tick).
3. mm per pixel from the tick spacing. Report each mm value with a range, and always say "in the ruler plane". Error range comes from tick-spacing scatter plus a fixed allowance for depth offset, to be set after reading the full accuracy papers above.
4. Confidence shown as A, B, C like the rest of the app. Under C, no mm.
5. Modes stay few: Percent (default) and Millimeter (only with a verified ruler).

## Honest limits
No test image with a ruler exists yet. The detector cannot be scored until the user sends clips or photos with a known ruler. The mm range must not be shown until it is validated against known lengths.
