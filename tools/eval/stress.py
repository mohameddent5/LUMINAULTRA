"""Stress test over every private clip. Nothing private is written to git.

Usage: python stress.py [CLIP_DIR=/downloads] [OUT=/downloads/stress.private.json]
Every video-*.mp4 in CLIP_DIR is a clip; new clips are picked up automatically.
Per clip, sampled at 15 fps (the movement gate was tuned at 15 fps), it logs the failure modes below and a verdict:
  PASS    a natural, usable frame exists (face, teeth, eyes open, frontal, sharp, steady)
  REFUSE  no usable frame, with the reasons (the app should say so and guide a retake)
  closeup most frames have no whole face: needs the mouth-only path
Failure modes counted (share of frames): no_face, no_teeth, eyes_shut, rolled, turned, blurry, moving, dark, bright, ruler_seen.
A frame that passes every gate is not proof the design is right: no dentist ground truth exists.
"""
import sys, glob, os, json, subprocess, tempfile
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

src = sys.argv[1] if len(sys.argv) > 1 else "/downloads"
out = sys.argv[2] if len(sys.argv) > 2 else "/downloads/stress.private.json"
lm = vision.FaceLandmarker.create_from_options(
    vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path="/tmp/face_landmarker.task"), num_faces=1))

def ruler(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    m = ((hsv[:, :, 0] > 85) & (hsv[:, :, 0] < 110) & (hsv[:, :, 1] > 110) & (hsv[:, :, 2] > 120)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(m)
    return any(st[i, 4] > 800 and max(st[i, 2], st[i, 3]) > 1.5 * min(st[i, 2], st[i, 3]) for i in range(1, n))

res = {}
for vid in sorted(glob.glob(f"{src}/video-*.mp4")):
    name = os.path.basename(vid)[6:-4]
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", vid, "-vf", "fps=15,scale='min(960,iw)':-2", "-q:v", "3", f"{d}/f%04d.jpg"])
        files = sorted(glob.glob(d + "/f*.jpg"))
        c = dict(no_face=0, no_teeth=0, eyes_shut=0, rolled=0, turned=0, blurry=0, moving=0, dark=0, bright=0, ruler_seen=0)
        good, prev = [], None
        for f in files:
            im = cv2.imread(f); h, w = im.shape[:2]
            g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
            sharp = cv2.Laplacian(cv2.resize(g, (640, int(640 * h / w))), cv2.CV_64F).var()
            mean = g.mean()
            sm = cv2.resize(g, (48, 64)).astype(float)
            mv = 0 if prev is None else float(np.abs(sm - prev).mean()); prev = sm
            c["ruler_seen"] += ruler(im)
            c["dark"] += mean < 60; c["bright"] += mean > 200
            c["blurry"] += sharp < 15; c["moving"] += mv >= 6
            r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)))
            if not r.face_landmarks:
                c["no_face"] += 1; continue
            L = r.face_landmarks[0]; P = lambda i: (L[i].x * w, L[i].y * h)
            ear = min(abs(P(159)[1] - P(145)[1]) / max(1e-6, abs(P(33)[0] - P(133)[0])), abs(P(386)[1] - P(374)[1]) / max(1e-6, abs(P(362)[0] - P(263)[0])))
            roll = np.degrees(np.arctan2(P(263)[1] - P(33)[1], P(263)[0] - P(33)[0]))
            yaw = (P(1)[0] - (P(33)[0] + P(263)[0]) / 2) / (abs(P(263)[0] - P(33)[0]) or 1)
            opening = (P(14)[1] - P(13)[1]) / max(1e-6, np.hypot(P(291)[0] - P(61)[0], P(291)[1] - P(61)[1]))
            teeth = opening > 0.08
            c["eyes_shut"] += ear <= 0.12; c["rolled"] += abs(roll) >= 8; c["turned"] += abs(yaw) >= 0.12; c["no_teeth"] += not teeth
            if teeth and ear > 0.12 and abs(roll) < 8 and abs(yaw) < 0.12 and sharp >= 15 and mv < 6 and 60 < mean < 200:
                good.append(len(good))
        n = max(1, len(files))
        share = {k: round(v / n, 2) for k, v in c.items()}
        if c["no_face"] / n > 0.7: verdict = "closeup"
        elif good: verdict = "PASS"
        else: verdict = "REFUSE"
        main = sorted(((k, v) for k, v in share.items() if k != "ruler_seen"), key=lambda t: -t[1])[:3]
        res[name] = dict(frames=n, usable=len(good), verdict=verdict, top_failures=main, share=share)
        print(f"{name}: {verdict} usable {len(good)}/{n} top failures {main} ruler {share['ruler_seen']}")
json.dump(res, open(out, "w"), indent=1)
print("clips", len(res), {v: sum(1 for r in res.values() if r["verdict"] == v) for v in ("PASS", "REFUSE", "closeup")})
