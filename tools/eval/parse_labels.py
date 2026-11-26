"""Read hand-drawn landmark strokes from a labeled overlay image by colour.
Usage: python parse_labels.py OVERLAY.jpg OUT.json   (output stays private, never commit)
Legend (user, confirmed): blue = mesial border, black = distal border, cyan = cervical margin,
yellow = free gingival margin (line) and zeniths (dots), orange = buccal corridor,
purple = papilla, thick gray = facial midline.
Each colour is thresholded in HSV, then split into connected strokes with bbox, centroid and pixel count.
Caveat: first version, tuned by eye on one image (ex6); black and yellow can pick up dark gaps and gum glare.
"""
import sys, json, cv2, numpy as np
im = cv2.imread(sys.argv[1]); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
H, S, V = hsv[:, :, 0].astype(int), hsv[:, :, 1].astype(int), hsv[:, :, 2].astype(int)
masks = {
    "blue": (H >= 110) & (H <= 130) & (S > 200) & (V > 150),
    "cyan": (H >= 84) & (H <= 100) & (S > 150) & (V > 150),
    "yellow": (H >= 20) & (H <= 32) & (S > 170) & (V > 200),
    "black": (V < 45),
}
out = {"w": im.shape[1], "h": im.shape[0], "strokes": {}}
for k, m in masks.items():
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    s = [dict(x=int(st[i, 0]), y=int(st[i, 1]), w=int(st[i, 2]), h=int(st[i, 3]), cx=round(float(cen[i][0])), cy=round(float(cen[i][1])), px=int(st[i, 4]))
         for i in range(1, n) if st[i, 4] >= 40]
    out["strokes"][k] = sorted(s, key=lambda t: t["cx"])
    print(k, len(s))
json.dump(out, open(sys.argv[2], "w"), indent=1)
