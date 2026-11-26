# Gingival display at smile, and DSD pitfalls: literature notes

Written 26 Nov 2026. Sources are PubMed or PubMed Central pages read for this note. Numbers below are what the sources say; none were measured by this app. The app has no scale, so it never shows mm.

## 1. Gingival display at smile

Smile line classes (Tjan, as restated in PMC9226730):
- High: the full crown length plus a continuous band of gum.
- Average: 75 to 100 percent of the upper front teeth, and only the gum between the teeth (interproximal).
- Low: under 75 percent of the upper front teeth.

Passia 2011, systematic review (PMID 21876867): the smile line is a valid esthetic parameter. On average 75 to 100 percent of the upper front teeth show. Average and parallel smile lines are the most common and are rated most attractive by orthodontists, general dentists and laypeople alike.

How much gum is acceptable:
- Lay acceptance, systematic review of 34 studies (PMID 35587001): ideal and acceptable range pooled to roughly +3 to -2.7 mm, median 0 mm (already in dsdEvidence.ts as ref 2).
- StatPearls (NBK470437): 1 to 2 mm of gum when smiling is considered normal. Some authors call more than 2 mm excessive, others more than 3 to 4 mm. Dentists rate 4 mm or more unattractive.
- Dynamic video study (PMID 41604296, ref 3 in dsdEvidence.ts): tolerance differs by sex, up to 3 mm for female and 1.5 mm for male smiles.
- Posed and spontaneous smiles differ. A posed smile is reproducible. A spontaneous (Duchenne) smile lifts the lip more (Manjula 2015, PMC4439690). A still posed photo can under-show the gum compared with a real laugh.

Causes of excessive gingival display (StatPearls NBK470437; PMID 32111273; PMC8603798). It is often multifactorial:
- Altered passive eruption: teeth look short and square because gum sits coronal to the cemento-enamel junction.
- Short upper lip (under 20 mm subnasale-to-stomion at rest; average 20 to 24 mm in young adults) or a hypermobile lip.
- Vertical maxillary excess, one of the commonest causes.
- Dentoalveolar extrusion, incisal wear, gingival overgrowth.
- The cause decides the treatment (crown lengthening, lip repositioning, botulinum toxin, orthodontics, orthognathic surgery). A photo cannot tell the causes apart. Skeletal assessment needs a radiograph (PMC8603798).

## 2. DSD complications and pitfalls

- A 2D design is built on one photo. Perspective distortion and head position change how the smile arc and canine tips look in frontal view (smile arc review, PMC8279119). 2D to 3D conversion can be inaccurate for the same reason (PMC12906862).
- Measured: in 30 patients, 2D photo and 3D scan widths differed significantly for lateral incisors and canines, and 2D and 3D plans differed on most linear measures. Neither differed significantly from the finished veneers in that study (PMC9033542, CC BY 4.0). Read with care: the study used a DSLR with a macro lens and a flash protocol, not a phone or an intraoral camera.
- The finished result may not match the digital design. Materials, anatomy and software limits all matter (PMC11056402; PMC9469272).
- Smile design needs the whole picture: orthodontics, periodontal, surgical and plastic input, not only tooth shape (PMC9469272). A design that ignores the gum or lip cause of a gummy smile will look right on screen and fail in the mouth.
- Dynamic information (lip movement in video) is not in a still photo (PMID 28196157, Coachman; PMC8837067).

## 3. What the camera-only app can honestly do with this

No scale, so no mm. Relative checks only:
- Gum band above the upper teeth as a fraction of the central incisor crown height, shown as a bar or ratio, never as mm. The literature thresholds are in mm; to compare them we would have to assume a crown height. That assumption is not sourced here, so the app should only say "gum shows above the teeth" versus "teeth reach the lip" and refer the dentist to measure in the mouth.
- Share of crown covered by the upper lip (low smile line, per Tjan).
- Always label the result "posed photo, one moment of the smile".
- When the smile shows a lot of gum, show a plain warning: the cause (lip, eruption, bone) cannot be judged from a photo, so the design should not change tooth length until it is checked clinically.
- Warn when the head is tilted or the photo is not frontal, because perspective changes the apparent smile arc and widths.
- Never present the simulated result as a promise of the final result.

Not done yet in code: the gum band ratio and the warnings. The tooth finder must be reliable first.
