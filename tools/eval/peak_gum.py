"""Prototype: track gum display over a smile video and pick the peak frame.

Usage: python peak_gum.py VIDEO OUTNAME   (frames go to /tmp/fr/OUTNAME, nothing is written to git)
Needs mediapipe, opencv, numpy and /tmp/face_landmarker.task.

Per frame: face landmarks, then in a central band between the inner lip points, rows are
classed as gum (pink, saturated) or tooth (bright, low saturation). Gum ratio = gum rows
above the first tooth run / height of that tooth run. A ratio, never mm.
Peak = highest smoothed ratio among steady frames (small frame-to-frame movement) after a ramp-up.
"""
import sys, glob, os, subprocess
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

vid, out = sys.argv[1], sys.argv[2]
d = f"/tmp/fr/{out}"
os.makedirs(d, exist_ok=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", vid, "-vf", "fps=15", "-q:v", "2", f"{d}/f%03d.jpg"])
lm = vision.FaceLandmarker.create_from_options(
    vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path="/tmp/face_landmarker.task"), num_faces=1))

rows, prev = [], None
for f in sorted(glob.glob(d + "/f*.jpg")):
    im = cv2.imread(f)
    h, w = im.shape[:2]
    sm = cv2.cvtColor(cv2.resize(im, (48, 64)), cv2.COLOR_BGR2GRAY).astype(float)
    mv = 0.0 if prev is None else float(np.abs(sm - prev).mean())
    prev = sm
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)))
    if not r.face_landmarks:
        rows.append(dict(f=f, ok=False, move=mv))
        continue
    L = r.face_landmarks[0]
    P = lambda i: (L[i].x * w, L[i].y * h)
    top, bot, cl, cr = P(13), P(14), P(61), P(291)
    mw = float(np.hypot(cr[0] - cl[0], cr[1] - cl[1]))
    cx = (top[0] + bot[0]) / 2
    x0, x1 = int(cx - 0.12 * mw), int(cx + 0.12 * mw)
    y0, y1 = int(top[1]), int(bot[1])
    if y1 - y0 < 6 or x1 - x0 < 6:
        rows.append(dict(f=f, ok=False, move=mv))
        continue
    patch = im[y0:y1, x0:x1].astype(float)
    hsv = cv2.cvtColor(im[y0:y1, x0:x1], cv2.COLOR_BGR2HSV).astype(float)
    R, G = patch[:, :, 2], patch[:, :, 1]
    S, V = hsv[:, :, 1], hsv[:, :, 2]
    tooth = (S < 95) & (V > 120) & ((R - G) < 45)
    gum = ((R - G) >= 45) & (S >= 70) & (V > 110)
    tr, gr = tooth.mean(axis=1) > 0.5, gum.mean(axis=1) > 0.5
    ty = np.where(tr)[0]
    if len(ty) < 3:
        rows.append(dict(f=f, ok=False, move=mv))
        continue
    first = last = ty[0]
    for y in ty:
        if y - last <= 3:
            last = y
        else:
            break
    th = int(last - first + 1)
    gh = int(gr[:first].sum())
    rows.append(dict(f=f, ok=True, move=mv, ratio=gh / max(th, 1), gum=gh, tooth=th, open=(y1 - y0) / mw, mw=mw / w))

ok = [i for i, r in enumerate(rows) if r["ok"]]
ratio = np.full(len(rows), np.nan)
for i in ok:
    ratio[i] = rows[i]["ratio"]
sm = ratio.copy()
for i in range(len(rows)):  # 5-frame median of valid values
    win = [ratio[j] for j in range(max(0, i - 2), min(len(rows), i + 3)) if not np.isnan(ratio[j])]
    sm[i] = np.median(win) if len(win) >= 3 else np.nan
steady = [i for i, r in enumerate(rows) if r["ok"] and r["move"] < 6.0 and not np.isnan(sm[i])]
print("frames", len(rows), "face+teeth", len(ok), "steady", len(steady))
print("smoothed ratio by frame:", " ".join("%d:%s" % (i, "-" if np.isnan(v) else "%.2f" % v) for i, v in enumerate(sm)))
if steady:
    best = max(steady, key=lambda i: sm[i])
    print("PEAK frame", best, os.path.basename(rows[best]["f"]), "smoothed ratio %.2f raw %.2f move %.1f" % (sm[best], rows[best]["ratio"], rows[best]["move"]))
    print("median smoothed ratio %.2f, range %.2f-%.2f" % (np.nanmedian(sm), np.nanmin(sm), np.nanmax(sm)))
    cv2.imwrite(f"/downloads/peak_{out}.private.jpg", cv2.imread(rows[best]["f"]))
