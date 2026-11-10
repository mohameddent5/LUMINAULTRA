"""
Synthetic frontal-smile generator with EXACT ground truth.

Purpose: a controlled test bed for the dental-perception stack (classical baseline now,
learned model later). It is NOT a substitute for clinical photographs: it cannot show that
a method works on real mouths, only that it works on this simplified world and where it breaks.

Geometry (all mm unless noted, then scaled by `px_per_mm`):
  * 8 maxillary teeth (FDI 14,13,12,11,21,22,23,24) placed on a circular arch of radius R.
    Projected tooth width = R*(sin(theta_r)-sin(theta_l)) -> natural foreshortening toward the
    posterior. A yaw rotates the arch about the vertical axis.
  * Each tooth is an axis-aligned rounded rectangle (crown); teeth are flush at contacts.
  * Smile arc, gingival display, lip line, lower lip gap and midline offset are randomised.

Coordinate convention: final pixel i has its centre at x = i (pixel-centre coordinates).
Keypoints are analytic floats in that convention, with a `visible` flag (False if covered by a lip).
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage.color import lab2rgb

W, H, SS = 384, 256, 4

FDI = [14, 13, 12, 11, 21, 22, 23, 24]
# mesiodistal width (mm), crown height (mm), relative incisal length offset (mm, + shorter)
TOOTH_DEF = {
    14: (7.0, 8.5, 1.8), 13: (7.5, 10.0, 0.8), 12: (6.5, 9.0, 1.4), 11: (8.5, 10.5, 0.0),
    21: (8.5, 10.5, 0.0), 22: (6.5, 9.0, 1.4), 23: (7.5, 10.0, 0.8), 24: (7.0, 8.5, 1.8),
}

LABELS = {"skin": 0, "upper_lip": 1, "lower_lip": 2, "gingiva": 3, "cavity": 4, "tooth": 5}


@dataclass
class Keypoint:
    name: str
    x: float
    y: float
    visible: bool
    fdi: int | None = None


@dataclass
class Sample:
    image: np.ndarray            # H,W,3 uint8
    labels: np.ndarray           # H,W uint8 (LABELS)
    instances: np.ndarray        # H,W uint8: 0 none, else index into FDI (1..8) for visible tooth pixels
    keypoints: list[Keypoint]
    midline_x: float             # dental midline (boundary 11|21) in px
    px_per_mm: float
    params: dict = field(default_factory=dict)


def _rounded_rect_sdf(X, Y, cx, cy, hw, hh, r):
    qx = np.abs(X - cx) - (hw - r)
    qy = np.abs(Y - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def _smooth_noise(rng, shape, sigma):
    n = gaussian_filter(rng.normal(size=shape).astype(np.float32), sigma)
    return n / (np.abs(n).max() + 1e-9)


def render(seed: int, *, hard: bool = False, stress: str | None = None, ss: int = SS) -> Sample:
    rng = np.random.default_rng(seed)
    s = float(rng.uniform(5.6, 7.4))               # px per mm
    R = float(rng.uniform(26, 34))                  # arch radius mm
    yaw = np.deg2rad(float(rng.uniform(-10, 10)))
    cxm = W / 2 + float(rng.uniform(-14, 14))       # image x of arch origin
    y_base = H * float(rng.uniform(0.46, 0.54))     # incisal level of centrals (px)
    smile_k = float(rng.choice([1, 1, 1, -1, 0]) * rng.uniform(0.0, 0.0012)) * (7 / s) ** 0  # curvature px^-1
    gingival_display = float(rng.uniform(-1.5, 4.0))  # mm, negative = lip covers gingiva/teeth tops
    lower_gap = float(rng.uniform(-0.3, 3.5))         # mm gap from edge to lower lip (neg = lip covers edges)
    mouth_half = float(rng.uniform(0.40, 0.47)) * W

    # ---- supersampled coordinate grid (final pixel-centre convention) ----
    xs = (np.arange(W * ss) + 0.5) / ss - 0.5
    ys = (np.arange(H * ss) + 0.5) / ss - 0.5
    X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))

    # ---- arch layout ----
    widths = np.array([TOOTH_DEF[f][0] for f in FDI])
    # arc positions: tooth boundaries from the 11|21 midline outward
    u_bound = np.zeros(len(FDI) + 1)
    mid_idx = FDI.index(21)            # boundary index between 11 and 21 is mid_idx
    u_bound[mid_idx] = 0.0
    for i in range(mid_idx, len(FDI)):
        u_bound[i + 1] = u_bound[i] + widths[i]
    for i in range(mid_idx - 1, -1, -1):
        u_bound[i] = u_bound[i + 1] - widths[i]
    # asymmetry: tooth widths vary a little per side
    xb = cxm + s * R * np.sin(u_bound / R + yaw) - s * R * np.sin(yaw) * 0.0
    midline_x = float(xb[mid_idx])

    teeth = []
    for i, f in enumerate(FDI):
        wmm, hmm, short = TOOTH_DEF[f]
        hmm_i = hmm * float(rng.uniform(0.92, 1.08))
        short_i = short * float(rng.uniform(0.6, 1.4))
        x_l, x_r = xb[i], xb[i + 1]
        xc = 0.5 * (x_l + x_r)
        hw = 0.5 * abs(x_r - x_l)
        # smile arc: y grows (lower) toward the centre
        y_edge = y_base + short_i * s - smile_k * (xc - midline_x) ** 2
        # lateral incisor/canine in a flat/reverse arc can protrude: handled by negative k
        y_top = y_edge - hmm_i * s
        teeth.append(dict(f=f, xc=float(xc), hw=float(hw), y_edge=float(y_edge), y_top=float(y_top)))

    top_mean = float(np.mean([t["y_top"] for t in teeth[2:6]]))
    edge_mean = float(np.mean([t["y_edge"] for t in teeth[2:6]]))

    # ---- lips ----
    xm = midline_x
    def y_upper(x):  # lower margin of the upper lip
        return top_mean - gingival_display * s - 0.0004 * (x - xm) ** 2
    def y_lower(x):  # upper margin of the lower lip (concave up: rises toward the commissures)
        return edge_mean + lower_gap * s - 0.0010 * (x - xm) ** 2
    yu = y_upper(X)
    yl = y_lower(X)
    taper = np.abs(X - xm) / mouth_half
    in_mouth_x = taper < 1.0
    # mouth closes toward the commissures
    open_scale = np.sqrt(np.clip(1 - taper ** 2, 0, 1))
    yc_open = 0.5 * (yu + yl)
    half_open = 0.5 * (yl - yu) * open_scale
    opening = in_mouth_x & (np.abs(Y - yc_open) <= np.maximum(half_open, 0))
    lip_th = 7.0 * s
    upper_band = in_mouth_x & (Y < yc_open - np.maximum(half_open, 0)) & (Y > yc_open - np.maximum(half_open, 0) - lip_th)
    lower_band = in_mouth_x & (Y > yc_open + np.maximum(half_open, 0)) & (Y < yc_open + np.maximum(half_open, 0) + lip_th)

    # ---- label map & instance map at supersampled resolution ----
    L = np.zeros(X.shape, np.uint8)
    inst = np.zeros(X.shape, np.uint8)
    L[opening] = LABELS["cavity"]
    # gingiva: above the tooth centre line, within the dental span, inside the opening
    span_l, span_r = xb[0], xb[-1]
    in_span = (X >= span_l) & (X <= span_r)
    idx_near = np.clip(np.searchsorted(xb, X, side="right") - 1, 0, len(FDI) - 1)
    yc_near = np.array([0.5 * (t["y_top"] + t["y_edge"]) for t in teeth], np.float32)[idx_near]
    gingiva = opening & in_span & (Y < yc_near)
    L[gingiva] = LABELS["gingiva"]
    sdf_all = []
    for i, t in enumerate(teeth):
        cy = 0.5 * (t["y_top"] + t["y_edge"])
        hh = 0.5 * (t["y_edge"] - t["y_top"])
        sdf = _rounded_rect_sdf(X, Y, t["xc"], cy, t["hw"], hh, 1.1 * s)
        sdf_all.append(sdf)
        m = (sdf < 0) & (opening | upper_band | lower_band | True)
        L[m] = LABELS["tooth"]
        inst[m] = i + 1
    # lips painted over everything
    L[upper_band] = LABELS["upper_lip"]; inst[upper_band] = 0
    L[lower_band] = LABELS["lower_lip"]; inst[lower_band] = 0
    # teeth only exist in/under the opening: anything tooth outside opening+bands that lips do not cover is a skin cut
    outside_tooth = (L == LABELS["tooth"]) & ~(opening)
    L[outside_tooth] = LABELS["skin"]; inst[outside_tooth] = 0

    # ---- colours (Lab) ----
    img = np.zeros(X.shape + (3,), np.float32)
    tone = float(rng.uniform(-6, 6))
    skin_lab = np.array([68 + tone, 14 + rng.uniform(-3, 5), 17 + rng.uniform(-3, 6)])
    lip_lab = np.array([50 + rng.uniform(-6, 8), 30 + rng.uniform(-8, 6), 18 + rng.uniform(-4, 4)])
    gum_lab = np.array([58 + rng.uniform(-5, 6), 26 + rng.uniform(-6, 5), 13 + rng.uniform(-3, 3)])
    cav_lab = np.array([14 + rng.uniform(-4, 6), 8, 5])
    tooth_lab = np.array([87 + rng.uniform(-6, 5), rng.uniform(-1, 3), 12 + rng.uniform(-3, 9)])
    if stress == 'lowcontrast':  # teeth close to gingiva in colour (stained/yellow teeth, pale pink gums)
        tooth_lab = np.array([70.0, 9.0, 16.0]); gum_lab = np.array([66.0, 14.0, 14.0])
    if hard:  # darker, more yellow teeth and paler gums/lips => weaker colour contrast
        tooth_lab += np.array([-12, 1, 6]); gum_lab = gum_lab * 0.5 + lip_lab * 0.5
    lab = np.zeros(X.shape + (3,), np.float32)
    for name, col in (("skin", skin_lab), ("upper_lip", lip_lab), ("lower_lip", lip_lab), ("gingiva", gum_lab), ("cavity", cav_lab)):
        lab[L == LABELS[name]] = col
    # tooth shading: cylinder, cervical darkening, translucent incisal third, contact darkening
    tm = L == LABELS["tooth"]
    tooth_L = np.zeros(X.shape, np.float32)
    tab = np.zeros(X.shape + (3,), np.float32)
    tab[...] = tooth_lab
    for i, t in enumerate(teeth):
        m = inst == i + 1
        if not m.any():
            continue
        dx = np.clip((X - t["xc"]) / t["hw"], -1, 1)
        v = np.clip((Y - t["y_top"]) / (t["y_edge"] - t["y_top"]), 0, 1)
        shade = 0.80 + 0.20 * np.cos(np.pi * dx / 2)
        cerv = 0.90 + 0.10 * v
        trans = np.clip((v - 0.78) / 0.22, 0, 1)
        col = tab.copy()
        col[..., 0] = tooth_lab[0] * shade * cerv - 7 * trans
        col[..., 1] = tooth_lab[1] - 1.0 * trans
        col[..., 2] = tooth_lab[2] - 8 * trans
        lab[m] = col[m]
    # contact lines
    cdark = float(rng.uniform(5, 14)) * (0.5 if hard else 1.0)
    for b in xb[1:-1]:
        lab[..., 0] -= cdark * np.exp(-0.5 * ((X - b) / (0.35 * s)) ** 2) * (L == LABELS["tooth"])
    # specular highlights
    for _ in range(int(rng.integers(3, 7)) if stress == 'specular' else int(rng.integers(0, 3))):
        k = int(rng.integers(2, 6)); t = teeth[k]
        hx = t["xc"] + rng.uniform(-0.4, 0.4) * t["hw"]; hy = t["y_top"] + rng.uniform(0.25, 0.55) * (t["y_edge"] - t["y_top"])
        lab[..., 0] += (60 if stress == 'specular' else 22) * np.exp(-0.5 * (((X - hx) / (0.35 * t["hw"])) ** 2 + ((Y - hy) / (0.8 * s)) ** 2)) * (inst == k + 1)
    # low-frequency illumination and texture
    illum = 1 + 0.10 * _smooth_noise(rng, (H, W), 40)
    if stress == 'shadow':  # strong directional shadow across the arch
        ramp = np.linspace(1.0, 0.42, W)[None, :] if rng.random() < 0.5 else np.linspace(0.42, 1.0, W)[None, :]
        illum = illum * ramp
    illum = np.kron(illum, np.ones((ss, ss), np.float32))
    lab[..., 0] = np.clip(lab[..., 0] * illum, 0, 100)
    rgb = lab2rgb(lab.astype(np.float64)).astype(np.float32)

    # ---- downsample (box) ----
    rgb = rgb.reshape(H, ss, W, ss, 3).mean(axis=(1, 3))
    labels = L[ss // 2 :: ss, ss // 2 :: ss]
    instances = inst[ss // 2 :: ss, ss // 2 :: ss]

    # ---- camera: white balance, blur, noise, JPEG ----
    wb = rng.uniform(0.94, 1.06, 3); gain = float(rng.uniform(0.78, 1.15))
    rgb = np.clip(rgb * wb * gain, 0, 1)
    sigma_blur = float(rng.uniform(0.7, 1.6)) * (1.4 if hard else 1.0)
    rgb = np.stack([gaussian_filter(rgb[..., c], sigma_blur) for c in range(3)], -1)
    rgb = np.clip(rgb + rng.normal(0, float(rng.uniform(0.004, 0.02)), rgb.shape), 0, 1)
    buf = io.BytesIO()
    q = int(rng.integers(12, 28)) if stress == 'compression' else int(rng.integers(55, 92))
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(buf, "JPEG", quality=q)
    image = np.array(Image.open(io.BytesIO(buf.getvalue())).convert("RGB"))

    # ---- keypoints with visibility ----
    kps: list[Keypoint] = []
    def lab_at(x, y):
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < W and 0 <= yi < H:
            return int(labels[yi, xi]), int(instances[yi, xi])
        return -1, 0
    for i, t in enumerate(teeth):
        r = 1.1 * s
        mesial_sign = -1 if t["xc"] > midline_x else 1  # toward the midline
        inner = t["hw"] - r
        for name, x, y, dy_in in (
            ("incisal_mid", t["xc"], t["y_edge"], -1.5),
            ("zenith", t["xc"], t["y_top"], +1.5),
            ("mesial_corner", t["xc"] + mesial_sign * inner, t["y_edge"], -1.5),
            ("distal_corner", t["xc"] - mesial_sign * inner, t["y_edge"], -1.5),
        ):
            lbl, ins = lab_at(x, y + dy_in)
            kps.append(Keypoint(name, float(x), float(y), bool(lbl == LABELS["tooth"] and ins == i + 1), t["f"]))
    for i in range(1, len(FDI)):
        a, b = teeth[i - 1], teeth[i]
        x = float(xb[i]); y = float(max(a["y_top"], b["y_top"]) + 1.1 * s)
        lbl, _ = lab_at(x, y - 3)
        kps.append(Keypoint("papilla", x, y, bool(lbl in (LABELS["gingiva"], LABELS["tooth"])), None))
    c11, c21 = teeth[3], teeth[4]
    lbl, _ = lab_at(midline_x, 0.5 * (c11["y_edge"] + c21["y_edge"]) - 1.1 * s - 3)  # above the incisal embrasure, at the contact
    kps.append(Keypoint("dental_midline", midline_x, 0.5 * (c11["y_edge"] + c21["y_edge"]), bool(lbl == LABELS["tooth"]), None))

    params = dict(seed=seed, px_per_mm=s, R=R, yaw_deg=float(np.rad2deg(yaw)), gingival_display_mm=gingival_display,
                  lower_gap_mm=lower_gap, smile_k=smile_k, blur=sigma_blur, hard=hard, stress=stress)
    return Sample(image, labels.astype(np.uint8), instances.astype(np.uint8), kps, midline_x, s, params)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/synth"
    import os
    os.makedirs(out, exist_ok=True)
    for sd in range(6):
        sm = render(sd, hard=sd % 2 == 1)
        Image.fromarray(sm.image).save(f"{out}/s{sd}.png")
        pal = np.array([[200, 170, 140], [200, 80, 90], [190, 70, 80], [240, 150, 160], [20, 10, 10], [250, 250, 240]], np.uint8)
        Image.fromarray(pal[sm.labels]).save(f"{out}/s{sd}_labels.png")
    print("ok")
