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
        # thin lines blurred: no solid black, so the softness measure sees nothing; such a picture is traced
        # (its lettering may blob, but that is better than the app's older pixel trace)
        grid = np.full((200, 200), 255, np.uint8)
        for x in range(30, 180, 20):
            cv2.line(grid, (x, 20), (x, 180), 0, 2)
        for y in range(30, 180, 30):
            cv2.line(grid, (20, y), (180, y), 0, 2)
        soft_grid = cv2.GaussianBlur(grid, (0, 0), 1.5)
        self.assertEqual(fd.softness(soft_grid), 0.0)
        cv2.imwrite(os.path.join(folder, "grid.png"), soft_grid)
        fd.main([os.path.join(folder, "grid.png"), out])
        self.assertNotIn("skipped", result(out))

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


    def test_soft_lettering_over_stripes_copied_letter_by_letter(self):
        # (r8) a room's name on its floor's stripes in a soft picture: each letter is copied by its outline ("over"),
        # one per letter; in the crisp picture, and in a tiny one, the step does not run
        import faithful_trace
        def page(sigma, size=(600, 720)):
            img = np.full(size, 255, np.uint8)
            for y in range(100, 500, 6):
                cv2.line(img, (60, y), (660, y), 150, 1)
            x = 200
            for ch in "BEDROOM":
                (w, _), _ = cv2.getTextSize(ch, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
                cv2.putText(img, ch, (x, 310), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 2, cv2.LINE_AA)
                x += w + 4
            cv2.rectangle(img, (40, 80), (680, 520), 30, 6)
            return cv2.GaussianBlur(img, (0, 0), sigma) if sigma else img
        over = lambda t: [p for p in t["walls"] if p.get("over")]
        soft = page(1.3)
        self.assertLess(faithful_trace.edge_steepness(soft), faithful_trace.OVER_SOFT)
        letters = over(faithful_trace.trace_gray(soft))
        self.assertEqual(len(letters), 7, "B E D R O O M, one outline each")
        for p in letters:
            xs = [x for r in p["rings"] for x, _ in r]; ys = [y for r in p["rings"] for _, y in r]
            self.assertTrue(195 <= min(xs) and max(xs) <= 330 and 295 <= min(ys) and max(ys) <= 315, "within the word")
        crisp = page(0)
        self.assertGreaterEqual(faithful_trace.edge_steepness(crisp), faithful_trace.OVER_SOFT)
        self.assertEqual(over(faithful_trace.trace_gray(crisp)), [], "a crisp picture: each letter already stands apart")
        tiny = cv2.resize(soft, (360, 300), interpolation=cv2.INTER_AREA)
        self.assertEqual(over(faithful_trace.trace_gray(tiny)), [], "a picture under 0.4 MP is left as r7 traced it")

    @staticmethod
    def _name_over_stripes(gap=4, hangers=False):
        img = np.full((600, 720), 255, np.uint8)
        for y in range(100, 500, 6):
            cv2.line(img, (60, y), (660, y), 150, 1)
        x = 200
        for ch in "BEDROOM":
            (w, _), _ = cv2.getTextSize(ch, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.putText(img, ch, (x, 310), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 2, cv2.LINE_AA)
            x += w + gap
        if hangers:
            for k in range(8):                                  # a wardrobe's hangers: upright strokes 20 px tall
                cv2.line(img, (420 + 7 * k, 200), (422 + 7 * k, 220), 60, 2, cv2.LINE_AA)
        cv2.rectangle(img, (40, 80), (680, 520), 30, 6)
        return img

    @staticmethod
    def _blocky(img):
        # a low-resolution picture enlarged 1.44 x by repeating its pixels, as the app's PDF renderer (pdf.js) draws a
        # 100 ppi JPEG plan on a page rendered at 144 dpi (111 Emerald Hill)
        small = cv2.GaussianBlur(cv2.resize(img, None, fx=1 / 1.44, fy=1 / 1.44, interpolation=cv2.INTER_AREA), (0, 0), 0.8)
        return cv2.resize(small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)

    def test_blocky_enlarged_lettering_copied_and_hangers_left(self):
        # (r9) the name over stripes as the app renders such a plan: steep edges (r8's steepness reads it as crisp) but
        # wide ones; each letter is still copied by its outline, and the row of hangers beside it is not a word
        import faithful_trace
        crisp = self._name_over_stripes(hangers=True)
        blocky = self._blocky(crisp)
        self.assertGreaterEqual(faithful_trace.edge_steepness(blocky), faithful_trace.OVER_SOFT)
        self.assertGreaterEqual(faithful_trace.edge_width(blocky), faithful_trace.OVER_EDGE)
        self.assertLess(faithful_trace.edge_width(crisp), faithful_trace.OVER_EDGE)
        letters = [p for p in faithful_trace.trace_gray(blocky)["walls"] if p.get("over")]
        self.assertEqual(len(letters), 7, "B E D R O O M, one outline each; no hanger")
        for p in letters:
            xs = [x for r in p["rings"] for x, _ in r]; ys = [y for r in p["rings"] for _, y in r]
            self.assertTrue(195 <= min(xs) and max(xs) <= 330 and 295 <= min(ys) and max(ys) <= 315, "within the word")

    def test_touching_soft_letters_read_apart_at_darker_levels(self):
        # (r9) soft letters set close enough to touch at the dark level: a mark a short word long is read again at
        # darker levels, and more of its letters are copied apart
        import faithful_trace
        blocky = self._blocky(self._name_over_stripes(gap=1))
        over = lambda: len([p for p in faithful_trace.trace_gray(blocky)["walls"] if p.get("over")])
        keep = faithful_trace.OVER_SPLIT
        try:
            faithful_trace.OVER_SPLIT = False
            whole = over()
            faithful_trace.OVER_SPLIT = True
            split = over()
        finally:
            faithful_trace.OVER_SPLIT = keep
        self.assertGreaterEqual(split, 5)
        self.assertLess(whole, split)

    def test_soft_slanting_double_line_one_band_not_a_ladder(self):
        # (r10) a facade drawn as two lines 4 px apart, slanting, in a low-resolution picture of brochure size enlarged
        # by repeating pixels: r9 traced it as a ladder of hundreds of short pieces; r10 as one band along it
        import faithful_trace
        img = np.full((1200, 1300), 255, np.uint8)
        for off in (0, 4):
            cv2.line(img, (150 + off, 1100), (1100 + off, 300), 140, 2, cv2.LINE_AA)
        cv2.rectangle(img, (40, 80), (1260, 1160), 30, 6)
        small = cv2.GaussianBlur(cv2.resize(img, None, fx=1 / 1.44, fy=1 / 1.44, interpolation=cv2.INTER_AREA), (0, 0), 0.8)
        blocky = cv2.resize(small, (1300, 1200), interpolation=cv2.INTER_NEAREST)
        self.assertGreaterEqual(blocky.size, faithful_trace.SOFT_LINES_MIN_PX)
        a, b = np.array([151.5, 1100.0]), np.array([1101.5, 300.0])
        v = b - a
        def along(pts):
            P = np.asarray(pts, float)
            s = ((P - a) @ v) / (v @ v)
            return s, np.hypot(*(P - (a + s[:, None] * v)).T)
        def read(t):
            pieces = 0
            for e in t["strokes"]:
                s, off = along([e[k] for k in ("a", "b", "c") if k in e])
                pieces += bool((off <= 7).all() and (s >= 0.03).all() and (s <= 0.97).all())
            span = 0.0
            for p in t["walls"]:
                s, off = along([q for r in p["rings"] for q in r])
                if (off <= 8).all():
                    span = max(span, float(s.max() - s.min()))
            return pieces, span
        keep = faithful_trace.SOFT_LINES_MIN_PX
        try:
            faithful_trace.SOFT_LINES_MIN_PX = 10 ** 9
            ladder, _ = read(faithful_trace.trace_gray(blocky))
        finally:
            faithful_trace.SOFT_LINES_MIN_PX = keep
        pieces, span = read(faithful_trace.trace_gray(blocky))
        self.assertGreater(ladder, 300, "r9: a ladder of short pieces")
        self.assertLessEqual(pieces * 4, ladder)
        self.assertGreaterEqual(span, 0.9, "one band along the whole line")


def _switched(name, value, run):
    """run() with faithful_trace.<name> set to value, put back afterwards"""
    import faithful_trace
    keep = getattr(faithful_trace, name)
    try:
        setattr(faithful_trace, name, value)
        return run()
    finally:
        setattr(faithful_trace, name, keep)


def _reduced(draw, w, h, s=4):
    """a picture drawn at s x by draw(img, s) and reduced, so its lines are anti-aliased as a page's are"""
    big = np.full((h * s, w * s), 255, np.uint8)
    draw(big, s)
    return cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)


class Sharp(unittest.TestCase):
    """(r11) the trace as sharp and joined as the drawing it copies"""

    def test_figures_outlined_smoothly(self):
        # d12's "900": a figure's outline followed the steps of the picture's pixels as traced at 2x, so it came out
        # lumpy; read from the picture enlarged smoothly it has no sharp turns but the figure's own
        import faithful_trace
        img = np.full((120, 260), 255, np.uint8)
        cv2.putText(img, "900", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.2, 0, 2, cv2.LINE_AA)
        def sharp_turns():
            n = 0
            for p in faithful_trace.trace_gray(img)["walls"]:
                for r in (p["rings"] if p.get("mark") else []):
                    P = np.asarray(r, float)
                    u = P - np.roll(P, 1, 0); v = np.roll(P, -1, 0) - P
                    cos = (u * v).sum(1) / np.maximum(1e-9, np.hypot(*u.T) * np.hypot(*v.T))
                    n += int((cos < math.cos(math.radians(40))).sum())
            return n
        self.assertGreater(_switched("SMOOTH_MARKS", False, sharp_turns), 100)
        self.assertLessEqual(sharp_turns(), 4)

    def test_thin_line_one_weight_wherever_its_pixels(self):
        # a 1 px black line on the pixel grid is one black column; 3/8 of a pixel off it, a dark grey and a light grey
        # one: traced as a wider grey line (d12's door leaf: 1.1 px black against 1.8 px grey). Weighed by its ink
        # across it, it is the same 1 px black line
        import faithful_trace
        o = 3
        def draw(big, s):
            cv2.rectangle(big, (50 * s, 50 * s), (51 * s - 1, 150 * s), 0, -1)                   # on the grid
            cv2.rectangle(big, (150 * s + o, 50 * s), (151 * s + o - 1, 150 * s), 0, -1)          # 3/8 off
            cv2.rectangle(big, (50 * s, 50 * s), (151 * s, 51 * s - 1), 0, -1)
            cv2.rectangle(big, (50 * s, 149 * s + o), (151 * s, 150 * s + o - 1), 0, -1)
        img = _reduced(draw, 200, 200, 8)
        def sides():
            t = faithful_trace.trace_gray(img)
            return [(e["w"], e["g"]) for e in t["strokes"] if e["k"] == "line" and math.dist(e["a"], e["b"]) > 50]
        before = _switched("TIDY_WEIGH", False, sides)
        self.assertEqual(len(before), 4)
        self.assertGreaterEqual(max(w for w, _ in before) - min(w for w, _ in before), 0.6, "r10: 1 px and wider")
        self.assertGreaterEqual(max(g for _, g in before), 60, "r10: the off-grid sides grey")
        after = sides()
        self.assertEqual(len(after), 4)
        for w, g in after:
            self.assertAlmostEqual(w, 1.0, delta=0.15)
            self.assertLessEqual(g, 10)

    def test_door_swing_runs_into_the_jamb(self):
        # a swing whose last stretch along the jamb was read as part of the jamb's side, a pixel aside: the arc
        # stopped short of the jamb with a kink. Joined, it runs on to where it touches the jamb's side
        import faithful_trace
        def draw(big, s):
            ln = lambda a, b: cv2.line(big, (int(a[0] * s), int(a[1] * s)), (int(b[0] * s), int(b[1] * s)), 0, s, cv2.LINE_AA)
            cv2.rectangle(big, (20 * s, 200 * s), (60 * s, 212 * s), 0, 3 * s)
            for a, b in (((60, 200), (70, 200)), ((70, 200), (70, 206)), ((70, 206), (68, 206)), ((68, 206), (68, 212)),
                         ((68, 212), (60, 212)), ((70, 80), (70, 200)), ((77, 80), (77, 200)), ((70, 80), (77, 80)),
                         ((190, 200), (190, 212)), ((190, 212), (200, 212)), ((190, 200), (200, 200))):
                ln(a, b)
            cv2.ellipse(big, (70 * s, 200 * s), (120 * s, 120 * s), 0, -90, 0, 0, s, cv2.LINE_AA)
        img = _reduced(draw, 300, 260)
        def gap():
            t = faithful_trace.trace_gray(img)
            arc = max((e for e in t["strokes"] if e["k"] == "arc"), key=lambda e: e["r"])
            ends = [(arc["c"][0] + arc["r"] * math.cos(a), arc["c"][1] + arc["r"] * math.sin(a)) for a in (arc["a0"], arc["a1"])]
            low = max(ends, key=lambda p: p[1])
            side = [e for e in t["strokes"] if e["k"] == "line" and abs(e["a"][0] - e["b"][0]) < 0.5 and 185 < e["a"][0] < 195]
            return low, min(min(math.dist(low, e["a"]), math.dist(low, e["b"])) for e in side)
        (_, y0), g0 = _switched("TIDY_ARCS", False, gap)
        self.assertGreater(g0, 1.0, "r10: the arc stops short of the jamb's side")
        self.assertLess(y0, 190)
        (_, y1), g1 = gap()
        self.assertLess(g1, 0.1, "the arc's end is the jamb side's end")
        self.assertGreater(y1, 199, "it runs on to the floor line")

    def test_swing_stopping_short_runs_on_to_the_floor_line(self):
        # d12's double door: the large swing stopped 6 px above the floor line where it meets the small one, which
        # reached it; a swing runs on to a line across its end by up to a twentieth of its length, and is cut back
        # by no more than 3 px
        import faithful_trace
        floor = {"k": "line", "a": np.array([0.0, 200.0]), "b": np.array([300.0, 200.0]), "w": 3.0, "dark": 1.0, "na": -1, "nb": -1}
        def arc_end(stop_y):
            a1 = math.asin((stop_y - 200.0) / 130.0)
            arc = {"k": "arc", "c": np.array([40.0, 200.0]), "r": 130.0, "a0": -math.pi / 2, "a1": a1, "w": 1.0, "dark": 1.0}
            faithful_trace._join_arcs([arc, dict(floor)])
            return 200.0 + 130.0 * math.sin(arc["a1"])
        self.assertAlmostEqual(arc_end(194.0), 200.0, delta=0.05, msg="6 px short: run on to the floor line")
        self.assertAlmostEqual(arc_end(184.0), 184.0, delta=0.05, msg="16 px short: left as drawn")

    def test_corner_square_and_one_weight(self):
        # the top of d12's door leaf: its top line 1.26 px, its sides 1.08 and 1.5, ends a hair apart - a nub at one
        # corner and a notch at the other. Joined at corners, they take one weight and meet exactly
        import faithful_trace
        mk = lambda a, b, w: {"k": "line", "a": np.array(a, float), "b": np.array(b, float), "w": w, "dark": 1.0,
                              "na": -1, "nb": -1}
        top, left, right = mk((302.29, 83.25), (294.51, 83.25), 1.26), mk((294.5, 83.24), (294.5, 212.4), 1.08), \
            mk((301.94, 83.59), (301.94, 205.1), 1.5)
        far = mk((400, 50), (400, 90), 4.0)                            # a heavier line nearby: not one of them
        out = faithful_trace._corners([top, left, right, far])
        self.assertEqual(len({round(e["w"], 6) for e in (top, left, right)}), 1, "one weight")
        self.assertEqual(far["w"], 4.0)
        self.assertLess(np.linalg.norm(top["b"] - left["a"]), 1e-9, "the left corner: one point")
        self.assertLess(np.linalg.norm(top["a"] - right["a"]), 1e-9, "the right corner: one point")
        self.assertAlmostEqual(float(top["a"][1]), 83.25, delta=0.01)
        self.assertEqual(len(out), 4)

    def test_close_double_ring_fitted_as_two_circles(self):
        # d12's sink waste and hob burners: two thin rings 2 px apart came out as one lumpy ring. Fitted as circles,
        # they are two clean circles at their own radii
        import faithful_trace
        def draw(big, s):
            for r in (11.5, 13.5):
                cv2.circle(big, (80 * s, 60 * s), int(r * s), 0, s, cv2.LINE_AA)
            cv2.circle(big, (80 * s, 60 * s), 3 * s, 0, s, cv2.LINE_AA)
            cv2.rectangle(big, (20 * s, 20 * s), (140 * s, 100 * s), 0, s)
        img = _reduced(draw, 160, 120)
        def circles():
            t = faithful_trace.trace_gray(img)
            return sorted(round(e["r"], 1) for e in t["strokes"] if e["k"] == "arc" and abs(e["a1"] - e["a0"]) > 6.2
                          and math.dist(e["c"], (80, 60)) < 1.0)
        self.assertEqual(len([r for r in _switched("RINGS", False, circles) if r > 10]), 0, "r10: no such circles")
        found = [r for r in circles() if r > 10]
        self.assertEqual(len(found), 2, found)
        for want, got in zip((11.5, 13.5), found):
            self.assertAlmostEqual(got, want, delta=0.4)

    def test_line_traced_twice_drawn_once(self):
        # d12's door leaf: its inner lines traced as a rectangle's side and as a stroke, 0.2 px apart, and a line
        # traced in two pieces end to end: drawn once each
        import faithful_trace
        mk = lambda a, b, w=2.0: {"k": "line", "a": np.array(a, float), "b": np.array(b, float), "w": w, "dark": 1.0,
                                  "na": -1, "nb": -1}
        segs = [mk((10, 20), (10, 120)), mk((10.4, 20), (10.4, 120), 2.4), mk((30, 20), (30, 60)), mk((30, 61), (30, 120)),
                mk((50, 20), (50, 120)), mk((53, 20), (53, 120)), mk((70, 20), (70, 120), 2.0), mk((70.3, 125), (70.3, 160), 6.0)]
        out = [e for e in faithful_trace._merge_pieces(segs) if e["k"] == "line"]
        self.assertEqual(len(out), 6, "the doubled line and the two pieces each one; a double line 3 px apart and a "
                                      "heavier line beyond a thin one stay")
        whole = [e for e in out if abs(e["a"][0] - 30) < 0.5]
        self.assertEqual(len(whole), 1)
        self.assertAlmostEqual(abs(whole[0]["b"][1] - whole[0]["a"][1]), 100.0, delta=0.01)

    def test_hatch_ends_within_the_wall_line(self):
        # a hatch stroke ending at a wall's outline: its square cap's corner showed past the outline, a row of dots
        # along every hatched wall
        import faithful_trace
        def draw(big, s):
            cv2.rectangle(big, (40 * s, 60 * s), (260 * s, 100 * s), 0, 3 * s)
            for x in range(0, 320, 8):
                cv2.line(big, ((40 + x) * s, 100 * s), ((80 + x) * s, 60 * s), 90, s, cv2.LINE_AA)
            big[:int(58.5 * s)] = 255; big[int(101.5 * s):] = 255; big[:, :int(38.5 * s)] = 255; big[:, int(261.5 * s):] = 255
        img = _reduced(draw, 300, 200)
        def poke():
            worst = 0.0
            for e in faithful_trace.trace_gray(img)["strokes"]:
                if e["k"] != "line" or e["w"] > 2:
                    continue
                a, b = np.array(e["a"]), np.array(e["b"]); u = (b - a) / max(1e-9, float(np.linalg.norm(b - a)))
                if abs(u[0]) < 0.3 or abs(u[1]) < 0.3:
                    continue
                n = np.array([-u[1], u[0]]); h = e["w"] / 2.0
                for p, sg in ((a, -1), (b, 1)):
                    for c in (p + sg * u * h + n * h, p + sg * u * h - n * h):
                        worst = max(worst, 58.5 - c[1], c[1] - 101.5)
            return worst
        self.assertGreater(_switched("TIDY_TEES", False, poke), 0.1)
        self.assertLessEqual(poke(), 0.01)

    def test_slash_tick_one_slash(self):
        # a dimension's slash tick across the dimension line and the witness line came apart at them: a flag and a
        # square at each end of d12's dimensions
        import faithful_trace
        def draw(big, s):
            cv2.line(big, (20 * s, 60 * s), (180 * s, 60 * s), 0, s, cv2.LINE_AA)
            cv2.line(big, (100 * s, 35 * s), (100 * s, 85 * s), 0, s, cv2.LINE_AA)
            cv2.line(big, (95 * s, 65 * s), (105 * s, 55 * s), 0, 3 * s, cv2.LINE_AA)
        img = _reduced(draw, 200, 120)
        heavy = lambda: [e for e in faithful_trace.trace_gray(img)["strokes"] if e["k"] == "line" and e["w"] >= 2]
        self.assertEqual(len(_switched("TIDY_TICKS", False, heavy)), 2)
        one = heavy()
        self.assertEqual(len(one), 1)
        self.assertGreater(math.dist(one[0]["a"], one[0]["b"]), 12, "across both lines")

    def test_tinted_band_lies_under_its_lettering(self):
        # a web plan's footer: dark lettering on a grey band. The band had a hole round each line of text (a white
        # halo) and the lettering's texture became grey smudges
        import faithful_trace
        img = np.full((120, 420), 255, np.uint8)
        cv2.rectangle(img, (10, 30), (410, 90), 192, -1)
        cv2.putText(img, "Found in: Clementi", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 20, 2, cv2.LINE_AA)
        def band():
            t = faithful_trace.trace_gray(img)
            bands = [p for p in t["walls"] if not (p.get("mark") or p.get("over") or p.get("grey")) and 150 <= p["g"] <= 230]
            return [len(p["rings"]) for p in bands], len([p for p in t["walls"] if p.get("grey")])
        rings, grey = _switched("FILL_DARK_HOLES", False, band)
        self.assertGreater(max(rings), 1)
        self.assertGreater(grey, 0)
        self.assertEqual(band(), ([1], 0))

    def test_l_in_a_word_outlined_as_a_letter(self):
        # an l in a word was drawn as a line with square caps: taller and heavier than the letters beside it
        import faithful_trace
        img = np.full((80, 220), 255, np.uint8)
        cv2.putText(img, "Clementi", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2, cv2.LINE_AA)
        upright = lambda: len([e for e in faithful_trace.trace_gray(img)["strokes"]
                               if e["k"] == "line" and abs(e["a"][0] - e["b"][0]) < 0.5 and abs(e["a"][1] - e["b"][1]) > 10])
        self.assertEqual(_switched("LETTER_STROKES", False, upright), 1)
        self.assertEqual(upright(), 0)


if __name__ == "__main__":
    unittest.main()
