"""
Landmark benchmark: reproducible annotation format + evaluation. Separates ACCEPTED-landmark accuracy from ALL-prediction accuracy
(a gate is only useful if it improves reliability) and measures confidence calibration.

Annotation file  (schema "lumina.benchmark/1", coordinates in the 192x128 levelled mouth-crop frame, pixel centres at integers):
  {"schema": "lumina.benchmark/1", "images": [{"id": "...", "mm_per_px": null | float,
      "landmarks": {"<channel 0..39>": {"x": float, "y": float, "visible": bool}, ...}}]}
Prediction file  (same ids):
  {"schema": "lumina.predictions/1", "images": [{"id": "...", "landmarks": {"<channel>": {"x","y","accepted": bool,
      "gate_p": float|null, "detection": float, "sigma_px": float|null, "reasons": [str]}}}]}
A channel absent from the predictions had no decodable peak (refused by the decoder). A channel absent from the annotations is unannotated and ignored.
"correct" := annotated visible AND localisation error <= tau (default 2 px).
"""
from __future__ import annotations
import json, sys
import numpy as np

FDI = [14, 13, 12, 11, 21, 22, 23, 24]
def kind_of(c: int) -> str: return ['incisal_mid', 'zenith', 'mesial_corner', 'distal_corner'][c % 4] if c < 32 else ('papilla' if c < 39 else 'dental_midline')
def name_of(c: int) -> str: return f"{kind_of(c)}_{FDI[c // 4]}" if c < 32 else (f"papilla_{FDI[c-32]}|{FDI[c-31]}" if c < 39 else 'dental_midline')
def tooth_of(c: int): return FDI[c // 4] if c < 32 else None
def q(a, p): return float(np.percentile(a, p)) if len(a) else None
def stats(e):
    e = np.asarray(e, float); return dict(n=int(len(e)), mean=float(e.mean()) if len(e) else None, median=q(e, 50), p90=q(e, 90), p95=q(e, 95), max=float(e.max()) if len(e) else None)
RAYLEIGH_95 = float(np.sqrt(-2 * np.log(0.05)))   # radial 95% quantile in units of per-axis sigma

def crown_width(gt_img: dict) -> float:
    ws = []
    for t in range(8):
        m, d = gt_img['landmarks'].get(str(t * 4 + 2)), gt_img['landmarks'].get(str(t * 4 + 3))
        if m and d and m['visible'] and d['visible']: ws.append(abs(m['x'] - d['x']))
    return float(np.median(ws)) if ws else 24.0

def evaluate(gt: dict, pred: dict, tau: float = 2.0) -> dict:
    P = {im['id']: im for im in pred['images']}; rows = []
    for g in gt['images']:
        p = P.get(g['id'], {'landmarks': {}}); w0 = crown_width(g)
        for ch, a in g['landmarks'].items():
            c = int(ch); r = p['landmarks'].get(ch)
            row = dict(c=c, visible=bool(a['visible']), decoded=r is not None, accepted=bool(r and r.get('accepted')), w0=w0, mmpp=g.get('mm_per_px'))
            if r is not None:
                row.update(err=float(np.hypot(r['x'] - a['x'], r['y'] - a['y'])), gate_p=r.get('gate_p'), sigma=r.get('sigma_px'), reasons=r.get('reasons', []))
            rows.append(row)
    dec = [r for r in rows if r['decoded']]; vis_dec = [r for r in dec if r['visible']]; acc = [r for r in dec if r['accepted']]
    acc_vis = [r for r in acc if r['visible']]; correct = lambda r: r['visible'] and r['err'] <= tau
    out = dict(tau_px=tau, n_annotated=len(rows), n_visible=sum(r['visible'] for r in rows), n_decoded=len(dec), n_accepted=len(acc))
    out['all_predictions'] = stats([r['err'] for r in vis_dec]); out['accepted_only'] = stats([r['err'] for r in acc_vis])
    out['accepted_normalised_by_crown_width'] = stats([r['err'] / r['w0'] for r in acc_vis])
    mm = [r['err'] * r['mmpp'] for r in acc_vis if r['mmpp']]; out['accepted_mm'] = stats(mm) if mm else None
    n_ok = sum(correct(r) for r in acc); hid_dec = [r for r in dec if not r['visible']]; ok_dec = [r for r in dec if correct(r)]
    out['acceptance'] = dict(precision=n_ok / max(1, len(acc)), recall_of_visible=n_ok / max(1, out['n_visible']),
        false_accept_rate_of_accepted=1 - n_ok / max(1, len(acc)), hidden_accept_rate=sum(r['accepted'] for r in hid_dec) / max(1, len(hid_dec)),
        false_reject_rate_of_correct=sum(not r['accepted'] for r in ok_dec) / max(1, len(ok_dec)),
        baseline_precision_without_gate=len(ok_dec) / max(1, len(dec)))
    # confidence calibration of the visibility probability against correctness, among decoded landmarks
    gp = [(r['gate_p'], correct(r)) for r in dec if r.get('gate_p') is not None]
    if gp:
        pr = np.array([x[0] for x in gp]); hit = np.array([x[1] for x in gp], float); bins = np.linspace(0, 1, 11); ece = 0.0; table = []
        for lo, hi in zip(bins[:-1], bins[1:]):
            m = (pr >= lo) & (pr < hi + (1e-9 if hi == 1 else 0))
            if m.any(): ece += m.mean() * abs(pr[m].mean() - hit[m].mean()); table.append(dict(bin=f"{lo:.1f}-{hi:.1f}", n=int(m.sum()), mean_p=float(pr[m].mean()), empirical=float(hit[m].mean())))
        out['gate_probability_calibration'] = dict(ece=float(ece), bins=table)
    sg = [(r['err'], r['sigma']) for r in acc_vis if r.get('sigma')]
    out['sigma_calibration'] = dict(n=len(sg), coverage_at_95=float(np.mean([e <= RAYLEIGH_95 * s for e, s in sg])), target=0.95) if sg else None
    by = {}
    for r in acc_vis: by.setdefault(name_of(r['c']) if r['c'] >= 32 else kind_of(r['c']) + '_' + str(tooth_of(r['c'])), []).append(r['err'])
    out['per_landmark_accepted'] = {k: stats(v) for k, v in sorted(by.items())}
    tooth = {}
    for r in acc_vis:
        t = tooth_of(r['c'])
        if t is not None: tooth.setdefault(t, []).append(r['err'])
    out['per_tooth_accepted'] = {str(k): stats(v) for k, v in sorted(tooth.items())}
    reasons = {}
    for r in dec:
        if not r['accepted']:
            for x in r['reasons'] or ['DECODED_BUT_NO_REASON_RECORDED']: reasons[x] = reasons.get(x, 0) + 1
    out['refusal_reasons'] = reasons
    return out

def to_markdown(r: dict, title='Landmark benchmark') -> str:
    f = lambda x, d=3: '-' if x is None else f"{x:.{d}f}"
    a, al, ac = r['accepted_only'], r['all_predictions'], r['acceptance']
    L = [f"# {title}", "", f"tau = {r['tau_px']} px; annotated {r['n_annotated']}, visible {r['n_visible']}, decoded {r['n_decoded']}, accepted {r['n_accepted']}.", "",
         "| | n | mean | median | p90 | p95 | max |", "|---|---|---|---|---|---|---|",
         f"| all visible predictions (px) | {al['n']} | {f(al['mean'])} | {f(al['median'])} | {f(al['p90'])} | {f(al['p95'])} | {f(al['max'])} |",
         f"| accepted visible only (px) | {a['n']} | {f(a['mean'])} | {f(a['median'])} | {f(a['p90'])} | {f(a['p95'])} | {f(a['max'])} |", "",
         f"Acceptance precision {f(ac['precision'])} (without a gate: {f(ac['baseline_precision_without_gate'])}); recall of visible {f(ac['recall_of_visible'])}; hidden-accept rate {f(ac['hidden_accept_rate'])}; false-reject rate of correct {f(ac['false_reject_rate_of_correct'])}."]
    if r.get('gate_probability_calibration'): L.append(f"Gate-probability ECE {f(r['gate_probability_calibration']['ece'])}.")
    if r.get('sigma_calibration'): L.append(f"Nominal sigma: {f(r['sigma_calibration']['coverage_at_95'])} of accepted errors fall inside the claimed 95% circle (target 0.95).")
    L += ["", "Refusal reasons: " + json.dumps(r['refusal_reasons'])]
    return "\n".join(L) + "\n"

if __name__ == "__main__":
    gt, pred = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); res = evaluate(gt, pred, float(sys.argv[3]) if len(sys.argv) > 3 else 2.0); print(to_markdown(res)); json.dump(res, open(sys.argv[4] if len(sys.argv) > 4 else 'benchmark_result.json', 'w'), indent=1)
