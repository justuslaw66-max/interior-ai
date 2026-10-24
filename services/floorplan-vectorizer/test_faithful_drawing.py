"""test_faithful_drawing.py: the faithful trace as the evidence's drawing (faithful_drawing.py), without tracing.

    services/floorplan-vectorizer/.venv/bin/python3 -m unittest services/floorplan-vectorizer/test_faithful_drawing.py
"""
import json, math, os, sys, tempfile, unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import faithful_drawing as fd


def area(points):
    p = np.asarray(points, float)
    return 0.5 * float(np.dot(p[:, 0], np.roll(p[:, 1], -1)) - np.dot(np.roll(p[:, 0], -1), p[:, 1]))


def rings(item):
    """the item's closed rings as point lists"""
    out, cur, k = [], [item["points"][0]], 1
    for c in item["commands"]:
        if c == "Z":
            out.append(cur); cur = []
        elif c == "M":
            cur = [item["points"][k]]; k += 1
        else:
            n = 3 if c == "C" else 1
            cur += item["points"][k:k + n]; k += n
    return out


class FaithfulDrawing(unittest.TestCase):
    def test_fill_rings_wound_by_depth(self):
        # an outline, a hole in it and an island in the hole, all drawn the same way round
        sq = lambda a, b: [[a, a], [b, a], [b, b], [a, b]]
        t = {"walls": [{"rings": [sq(0, 100), sq(20, 80), sq(40, 60)], "g": 17}], "strokes": []}
        d = fd.drawing(t)
        item = d["items"][0]
        self.assertEqual((item["kind"], item["fill"], item["tone"]), ("fill", True, 17))
        self.assertEqual(item["commands"], ["L", "L", "L", "Z", "M", "L", "L", "L", "Z", "M", "L", "L", "L", "Z"])
        a = [area(r) for r in rings(item)]
        self.assertTrue(a[0] > 0 > a[1] and a[2] > 0, "nested rings alternate, so the nonzero rule fills as even-odd")

    def test_lines_square_caps_grouped_by_width_and_tone(self):
        line = lambda a, b, w, g: {"k": "line", "a": a, "b": b, "w": w, "g": g}
        t = {"walls": [], "strokes": [line([10, 10], [50, 10], 2.0, 0), line([10, 20], [10, 60], 2.0, 0),
                                      line([0, 0], [5, 0], 1.0, 200), {**line([5, 5], [9, 5], 1.0, 230), "light": True}]}
        d = fd.drawing(t)
        self.assertEqual([(i["kind"], i["tone"], i["strokeWidthPx"]) for i in d["items"]],
                         [("line", 200, 1.0), ("line", 0, 2.0), ("line", 230, 1.0)], "light to dark; light lines in fills last")
        dark = d["items"][1]
        self.assertEqual(dark["commands"], ["L", "M", "L"])
        self.assertEqual(dark["points"], [[9.0, 10.0], [51.0, 10.0], [10.0, 19.0], [10.0, 61.0]], "carried on by half the width")

    def test_arcs_dots_and_circles(self):
        t = {"walls": [], "strokes": [{"k": "arc", "c": [0, 0], "r": 10, "a0": 0.0, "a1": math.pi, "w": 1, "g": 50},
                                      {"k": "arc", "c": [50, 50], "r": 5, "a0": 0.3, "a1": 0.3 + 2 * math.pi, "w": 1, "g": 50},
                                      {"k": "dot", "c": [20, 20], "w": 4, "g": 0}]}
        d = fd.drawing(t)
        dot = d["items"][0]
        self.assertEqual((dot["kind"], dot["fill"], dot["commands"]), ("dot", True, ["C", "C", "C", "C", "Z"]))
        arcs = d["items"][1]
        self.assertEqual(arcs["commands"], ["C", "C", "M", "C", "C", "C", "C", "Z"], "a half circle in two quarters; a full one closed")
        end = arcs["points"][6]
        self.assertAlmostEqual(end[0], -10.0, places=2); self.assertAlmostEqual(end[1], 0.0, places=2)
        mid = fd._arc_cubics(0, 0, 10, 0.0, math.pi / 2)[0]
        # a cubic quarter circle is within 0.03 % of the radius at its middle
        t_ = 0.5
        p0, (c1, c2, p3) = (10.0, 0.0), mid
        x = (1 - t_) ** 3 * p0[0] + 3 * (1 - t_) ** 2 * t_ * c1[0] + 3 * (1 - t_) * t_ ** 2 * c2[0] + t_ ** 3 * p3[0]
        y = (1 - t_) ** 3 * p0[1] + 3 * (1 - t_) ** 2 * t_ * c1[1] + 3 * (1 - t_) * t_ ** 2 * c2[1] + t_ ** 3 * p3[1]
        self.assertAlmostEqual(math.hypot(x, y), 10.0, delta=0.003)

    def test_limits_split_items(self):
        t = {"walls": [], "strokes": [{"k": "line", "a": [i, 0], "b": [i, 5], "w": 1, "g": 0} for i in range(2500)]}
        d = fd.drawing(t)
        self.assertEqual(len(d["items"]), 2)
        self.assertTrue(all(len(i["commands"]) <= fd.MAX_COMMANDS and len(i["points"]) <= fd.MAX_POINTS for i in d["items"]))

    def test_leaves_blurred_or_large_pictures(self):
        with tempfile.TemporaryDirectory() as folder:
            self._leaves(folder)

    def _leaves(self, folder):
        def result(path):
            with open(path) as f:
                return json.load(f)
        img = np.full((200, 200), 255, np.uint8)
        cv2.rectangle(img, (40, 40), (160, 160), 0, -1)
        blurred = cv2.GaussianBlur(img, (0, 0), 3)
        cv2.imwrite(os.path.join(folder, "soft.png"), blurred)
        out = os.path.join(folder, "out.json")
        fd.main([os.path.join(folder, "soft.png"), out])
        self.assertIn("not crisp", result(out)["skipped"])
        cv2.imwrite(os.path.join(folder, "big.png"), img)
        fd.main([os.path.join(folder, "big.png"), out, "--max-pixels=1000"])
        self.assertIn("too large", result(out)["skipped"])
        fd.main([os.path.join(folder, "missing.png"), out])
        self.assertIn("failed", result(out)["skipped"])
        # light lines on a dark ground (a brochure's white-on-black plan): the trace would be one black sheet
        cv2.imwrite(os.path.join(folder, "dark.png"), 255 - img)
        fd.main([os.path.join(folder, "dark.png"), out])
        self.assertIn("dark ground", result(out)["skipped"])
        # thin lines blurred: no solid black, so stage 1's softness measure sees nothing, but the edges are spread
        grid = np.full((200, 200), 255, np.uint8)
        for x in range(30, 180, 20):
            cv2.line(grid, (x, 20), (x, 180), 0, 2)
        for y in range(30, 180, 30):
            cv2.line(grid, (20, y), (180, y), 0, 2)
        self.assertGreater(fd.edge_sharpness(grid), 0.95, "crisp lines are sharp")
        soft_grid = cv2.GaussianBlur(grid, (0, 0), 1.5)
        self.assertEqual(fd.softness(soft_grid), 0.0)
        cv2.imwrite(os.path.join(folder, "grid.png"), soft_grid)
        fd.main([os.path.join(folder, "grid.png"), out])
        self.assertIn("not sharp enough", result(out)["skipped"])

    def test_traces_a_page_over_the_limit_at_its_own_size(self):
        with tempfile.TemporaryDirectory() as folder:
            import faithful_trace
            img = np.full((200, 200), 255, np.uint8)
            cv2.rectangle(img, (40, 40), (160, 160), 0, -1)
            path, out = os.path.join(folder, "page.png"), os.path.join(folder, "out.json")
            cv2.imwrite(path, img)
            seen, orig = [], faithful_trace.trace_gray
            faithful_trace.trace_gray = lambda g, *a: (seen.append(faithful_trace.UP), orig(g, *a))[1]
            try:
                fd.main([path, out, "--max-pixels=20000"])       # 40,000 px: over the 2x limit, within 3x it
                fd.main([path, os.path.join(folder, "out2.json"), "--max-pixels=40000"])   # within the 2x limit
            finally:
                faithful_trace.trace_gray = orig
            self.assertEqual(seen, [1, 2], "traced at its own size over the limit, at twice its size within it")
            with open(out) as f:
                d = json.load(f)
            self.assertNotIn("skipped", d)
            fills = [i for i in d["items"] if i["kind"] == "fill"]
            self.assertEqual(len(fills), 1, "the black square is one fill")
            xs = [p[0] for p in fills[0]["points"]]
            self.assertAlmostEqual(min(xs), 40, delta=1.0); self.assertAlmostEqual(max(xs), 161, delta=1.0)
            self.assertEqual(faithful_trace.UP, 2, "the working scale is put back for the next page")


if __name__ == "__main__":
    unittest.main()
