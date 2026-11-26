"""Score a luminance-valley tooth-border finder against hand labels.

Usage: python3 score_valleys.py PHOTO LABELS.json
LABELS.json (kept private, never committed): {"truth": [x, ...], "band": [y0, y1], "x": [x0, x1]}
Prints per-border error in px, hits within 12 px, and extra (false) borders.
Needs numpy, scipy, pillow. Experimental, tuned on one photo: not an accuracy claim.
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import find_peaks

img, lab = sys.argv[1], json.load(open(sys.argv[2]))
lum = np.asarray(Image.open(img).convert("RGB")).astype(float).mean(2)
(y0, y1), (x0, x1) = lab["band"], lab["x"]
prof = ndi.gaussian_filter1d(lum[y0:y1, x0:x1].mean(0), 2)
pk, _ = find_peaks(-prof, prominence=2.0, distance=18)
cands = [x0 + int(p) for p in pk]
errs = [min(abs(c - t) for c in cands) for t in lab["truth"]]
extra = [c for c in cands if min(abs(c - t) for t in lab["truth"]) > 12]
print("candidates", cands)
print("errors px", errs, "hits<=12:", sum(e <= 12 for e in errs), "of", len(errs), "extra:", len(extra))
