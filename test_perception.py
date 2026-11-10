"""Run: cd perception && python3 -m unittest discover -s tests -v   (about 30 s)"""
import sys, pathlib, unittest
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from synth import render, LABELS, FDI, W, H
from classical import segment_and_find_keypoints, jitter_roi


def roi_of(sm, seed):
    return jitter_roi(np.isin(sm.labels, [LABELS["gingiva"], LABELS["cavity"], LABELS["tooth"]]), np.random.default_rng(seed))


class TestSynth(unittest.TestCase):
    def test_deterministic(self):
        a, b = render(7), render(7)
        self.assertTrue(np.array_equal(a.image, b.image) and np.array_equal(a.labels, b.labels))
        self.assertFalse(np.array_equal(a.image, render(8).image))

    def test_ground_truth_is_self_consistent(self):
        for sd in range(3):
            sm = render(sd)
            self.assertEqual(sm.image.shape, (H, W, 3))
            # every instance pixel is a tooth pixel and vice versa
            self.assertTrue(np.array_equal(sm.instances > 0, sm.labels == LABELS["tooth"]))
            self.assertLessEqual(sm.instances.max(), len(FDI))
            for k in sm.keypoints:
                self.assertTrue(-20 < k.x < W + 20 and -20 < k.y < H + 20, k)
            # visible incisal midpoints lie on/near the tooth boundary of the right instance
            for k in sm.keypoints:
                if k.name == "incisal_mid" and k.visible:
                    xi, yi = int(round(k.x)), int(round(k.y - 2))
                    self.assertEqual(sm.instances[yi, xi], FDI.index(k.fdi) + 1)


class TestBaseline(unittest.TestCase):
    def test_easy_segmentation_and_numbering(self):
        dices, ok, tot = [], 0, 0
        for sd in range(1000, 1005):
            sm = render(sd)
            res = segment_and_find_keypoints(sm.image, roi_of(sm, sd))
            self.assertIsNone(res.refusal)
            gt = sm.labels == LABELS["tooth"]
            p = res.tooth_mask
            dices.append(2 * (p & gt).sum() / (p.sum() + gt.sum()))
        self.assertGreater(np.mean(dices), 0.95)

    def test_incisal_midpoints_are_subpixel_accurate_when_claimed(self):
        errs = []
        for sd in range(1000, 1005):
            sm = render(sd)
            res = segment_and_find_keypoints(sm.image, roi_of(sm, sd))
            for g in sm.keypoints:
                if g.name == "incisal_mid" and g.visible:
                    c = [p for p in res.keypoints if p.name == "incisal_mid" and p.fdi == g.fdi]
                    if c:
                        errs.append(np.hypot(c[0].x - g.x, c[0].y - g.y))
        self.assertGreater(len(errs), 10)
        self.assertLess(np.median(errs), 0.5)

    def test_does_not_claim_covered_keypoints(self):
        claims = 0
        for sd in range(1000, 1006):
            sm = render(sd)
            res = segment_and_find_keypoints(sm.image, roi_of(sm, sd))
            for g in sm.keypoints:
                if g.visible or g.name in ("mesial_corner", "distal_corner", "papilla"):
                    continue
                claims += any(p.name == g.name and (g.fdi is None or p.fdi == g.fdi) for p in res.keypoints)
        self.assertLessEqual(claims, 3)

    def test_refuses_most_low_contrast_images(self):
        refused = 0
        for sd in range(9000, 9008):
            sm = render(sd, stress="lowcontrast")
            res = segment_and_find_keypoints(sm.image, roi_of(sm, sd))
            refused += int(res.refusal is not None or "LOW_COLOUR_CONTRAST" in res.flags or "numbering_ambiguous" in res.flags)
        self.assertGreaterEqual(refused, 4)

    def test_empty_roi_is_refused(self):
        sm = render(1)
        self.assertEqual(segment_and_find_keypoints(sm.image, np.zeros((H, W), bool)).refusal, "ROI_TOO_SMALL")


if __name__ == "__main__":
    unittest.main()
