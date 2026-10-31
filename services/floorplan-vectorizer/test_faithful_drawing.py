"""test_faithful_drawing.py: the faithful trace as the evidence's drawing (faithful_drawing.py), without tracing.

    services/floorplan-vectorizer/.venv/bin/python3 -m unittest services/floorplan-vectorizer/test_faithful_drawing.py
"""
import json, math, os, shutil, sys, tempfile, unittest

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


def _untyped(run):
    """run() with retyping off (r12): lettering the reader is unsure of is still traced, as these tests trace it"""
    import faithful_trace
    keep = faithful_trace.RT.RETYPE
    try:
        faithful_trace.RT.RETYPE = False
        return run()
    finally:
        faithful_trace.RT.RETYPE = keep


def _reduced(draw, w, h, s=4):
    """a picture drawn at s x by draw(img, s) and reduced, so its lines are anti-aliased as a page's are"""
    big = np.full((h * s, w * s), 255, np.uint8)
    draw(big, s)
    return cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)


class DarkGround(unittest.TestCase):
    """No upload gives nothing (beta step 2.1, 30 Oct 2026): with FV_INVERT_DARK=1 a plan drawn light on a dark ground is
    traced turned over; stage 1 (floorplan_vectorize.light_on_dark) uses the same rule"""

    @staticmethod
    def _grid(paper, ink, size=200):
        g = np.full((size, size), paper, np.uint8)
        for x in range(30, 180, 30):
            cv2.line(g, (x, 20), (x, 180), ink, 3)
        for y in range(30, 180, 50):
            cv2.line(g, (20, y), (180, y), ink, 3)
        return g

    def test_which_pages_are_light_on_dark(self):
        self.assertTrue(fd.light_on_dark(self._grid(0, 255)), "white lines on black")
        self.assertTrue(fd.light_on_dark(self._grid(40, 230)), "light lines on a dark blue page, in grey")
        self.assertFalse(fd.light_on_dark(self._grid(255, 0)), "an ordinary plan")
        self.assertFalse(fd.light_on_dark(self._grid(100, 20)), "a dim photo of an ordinary plan: its ink darker than its paper")
        heavy = self._grid(255, 0)
        cv2.rectangle(heavy, (25, 25), (175, 175), 0, -1)
        self.assertFalse(fd.light_on_dark(heavy), "a plan of heavy black fills on white paper")
        self.assertFalse(fd.light_on_dark(np.full((200, 200), 10, np.uint8)), "a black page with nothing on it")

    def test_stage1_uses_the_same_rule(self):
        import floorplan_vectorize as fv
        for g in (self._grid(0, 255), self._grid(40, 230), self._grid(255, 0), self._grid(100, 20)):
            self.assertEqual(fv.light_on_dark(g), fd.light_on_dark(g))

    def test_traced_turned_over_only_with_the_switch(self):
        saved = os.environ.get("FV_INVERT_DARK")
        try:
            with tempfile.TemporaryDirectory() as folder:
                src, out = os.path.join(folder, "dark.png"), os.path.join(folder, "out.json")
                cv2.imwrite(src, self._grid(0, 255))
                os.environ.pop("FV_INVERT_DARK", None)
                fd.main([src, out])
                with open(out) as f:
                    self.assertIn("dark ground", json.load(f)["skipped"], "off: left, as before")
                os.environ["FV_INVERT_DARK"] = "1"
                fd.main([src, out])
                with open(out) as f:
                    d = json.load(f)
                self.assertNotIn("skipped", d)
                self.assertTrue(d["items"], "on: traced")
                self.assertTrue(all(it.get("tone", 0) < 128 for it in d["items"]), "drawn as dark ink, as the app draws on white")
                plain = os.path.join(folder, "plain.png")
                cv2.imwrite(plain, self._grid(255, 0))
                fd.main([plain, out])
                with open(out) as f:
                    on = json.load(f)
                os.environ.pop("FV_INVERT_DARK", None)
                fd.main([plain, out])
                with open(out) as f:
                    self.assertEqual(json.load(f), on, "an ordinary plan is traced the same with the switch on")
        finally:
            if saved is None:
                os.environ.pop("FV_INVERT_DARK", None)
            else:
                os.environ["FV_INVERT_DARK"] = saved


def _plan(W=640, H=800, shear_plumb=0.0, shear_level=0.0):
    """a plain plan of walls and dimension lines, its plumb lines leaning by shear_plumb degrees and its level lines
    falling by shear_level (about the page's middle)"""
    g = np.full((H, W), 255, np.uint8)
    for x in (80, 260, 420, 560):
        cv2.line(g, (x, 90), (x, 700), 0, 3)
    for y in (90, 330, 520, 700):
        cv2.line(g, (80, y), (560, y), 0, 3)
    cv2.line(g, (40, 90), (40, 700), 0, 1)                       # a dimension line and its ticks
    for y in (90, 330, 520, 700):
        cv2.line(g, (34, y), (46, y), 0, 1)
    cv2.rectangle(g, (255, 300), (265, 360), 0, -1)              # a column
    if shear_plumb or shear_level:
        tv, th = math.tan(math.radians(shear_plumb)), math.tan(math.radians(shear_level))
        M = np.float32([[1, tv, -tv * H / 2], [th, 1, -th * W / 2]])
        g = cv2.warpAffine(g, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
    return g


class Straighten(unittest.TestCase):
    """(31 Oct) a plan whose plumb or level lines lean a little is drawn straight: one affine map, then near-level and
    near-plumb edges set exactly so; a straight plan is left exactly as traced"""

    @staticmethod
    def _lines(segments):
        return {"version": fd.VERSION, "textBoxes": [], "items": [
            {"kind": "line", "fill": False, "strokeWidthPx": 1, "tone": 0,
             "commands": (["L"] + ["M", "L"] * (len(segments) - 1)),
             "points": [list(map(float, p)) for seg in segments for p in seg]}]}

    def test_lean_read(self):
        W, H = 600, 800
        tv = math.tan(math.radians(0.4))
        plumb = [((x + tv * (100 - H / 2), 100), (x + tv * (700 - H / 2), 700)) for x in (80, 200, 320, 440, 520)]
        level = [((60, y), (540, y)) for y in (100, 300, 500, 700)]
        p, l, _ = fd.lean(self._lines(plumb + level), W, H)
        self.assertAlmostEqual(p, 0.4, delta=0.03)
        self.assertEqual(l, 0.0)
        th = math.tan(math.radians(-0.3))
        falling = [((60, y + th * (60 - W / 2)), (540, y + th * (540 - W / 2))) for y in (100, 300, 500, 700)]
        p, l, _ = fd.lean(self._lines([((x, 100), (x, 700)) for x in (80, 200, 320, 440, 520)] + falling), W, H)
        self.assertEqual(p, 0.0)
        self.assertAlmostEqual(l, -0.3, delta=0.03)
        # a wall the trace squared piece by piece: plumb pieces 100 px long, each a pixel further over
        stairs = [((x + k, 100 + 100 * k), (x + k, 200 + 100 * k)) for x in (80, 300, 520) for k in range(6)]
        p, l, _ = fd.lean(self._lines(stairs + level), W, H)
        self.assertAlmostEqual(p, math.degrees(math.atan(0.01)), delta=0.05)
        straight = [((x, 100), (x, 700)) for x in (80, 200, 320, 440, 520)] + level
        self.assertEqual(fd.lean(self._lines(straight), W, H)[:2], (0.0, 0.0), "a straight drawing reads straight")
        self.assertEqual(fd.lean(self._lines([((10, 10), (10, 60))]), W, H)[:2], (0.0, 0.0), "too little to say")

    def test_snapping_keeps_joins(self):
        # a leaning wall the trace squared piece by piece: three plumb pieces on pixel middles stepping sideways, a level
        # line meeting its top in another item, and a door swing ending at its foot; for a lean within the snapping's
        # own tolerance and for one beyond it. The wall keeps its place within the pixel as traced, so it draws at the
        # weight and grey it was traced at (round 2 set lines where they draw crisp: grey lines drew black).
        W, H = 200, 400
        for step in (1.0, 3.0):                  # whole pixels, as the trace steps a squared wall (0.57 and 1.72 deg)
            deg = math.degrees(math.atan(step / 100.0))
            x = [100.5, 100.5 + step, 100.5 + 2 * step]
            wall = {"kind": "line", "fill": False, "strokeWidthPx": 2, "tone": 0, "commands": ["L", "M", "L", "M", "L"],
                    "points": [[x[0], 50.0], [x[0], 150.0], [x[1], 150.0], [x[1], 250.0], [x[2], 250.0], [x[2], 350.0]]}
            top = {"kind": "line", "fill": False, "strokeWidthPx": 2, "tone": 0, "commands": ["L"],
                   "points": [[20.0, 50.0], [x[0], 50.0]]}
            swing = {"kind": "arc", "fill": False, "strokeWidthPx": 1, "tone": 0, "commands": ["C"],
                     "points": [[x[2], 350.0], [x[2] + 28.0, 350.0], [x[2] + 48.0, 330.0], [x[2] + 48.0, 300.0]]}
            d = {"version": fd.VERSION, "items": [wall, top, swing], "textBoxes": []}
            fd.straighten(d, W, H, deg, 0.0)
            xs = {p[0] for p in wall["points"]}
            self.assertEqual(len(xs), 1, "%s deg: the three pieces share one x, one plumb wall: %s" % (deg, xs))
            self.assertEqual(next(iter(xs)) % 1.0, 0.5, "%s deg: on a pixel's middle, as traced" % deg)
            self.assertEqual(top["points"][1], wall["points"][0], "%s deg: the level line still meets the wall's top" % deg)
            self.assertEqual(top["points"][0][1], top["points"][1][1], "%s deg: and is level" % deg)
            self.assertEqual(swing["points"][0], wall["points"][-1], "%s deg: the swing still ends at the wall's foot" % deg)
            self.assertAlmostEqual(swing["points"][1][1], swing["points"][0][1], places=2, msg="%s deg: its tangent kept" % deg)

    def test_small_shapes_move_whole_pixels(self):
        # a letter (a small fill) at fractions of a pixel, on a page leaning enough to move it by more than a pixel
        W, H = 400, 800
        letter = [[300.13, 700.12], [306.88, 700.12], [306.88, 712.87], [300.13, 712.87]]
        d = {"version": fd.VERSION, "textBoxes": [], "items": [
            {"kind": "fill", "fill": True, "strokeWidthPx": 0, "tone": 0, "commands": ["L", "L", "L", "Z"],
             "points": [list(p) for p in letter]}]}
        fd.straighten(d, W, H, 0.5, 0.0)
        got = d["items"][0]["points"]
        shift = got[0][0] - letter[0][0]
        self.assertNotEqual(shift, 0.0, "the page's lean moves it")
        self.assertEqual(shift, round(shift), "by whole pixels, so it draws as crisp as traced")
        self.assertEqual([[round(x - shift, 2), y] for x, y in got], letter, "as one: its shape unchanged")

    def test_lettering_moves_as_traced(self):
        # s009's HOUSEHOLD read HCUSEHOLD: an O's outline and its hole each moved by its own whole pixels. And s039's
        # title, its letters 40 px tall: a letter's sides were each set plumb by itself. A word moves as one, each
        # letter (outline and holes) exactly as traced
        W, H = 800, 800
        def ring(x0, y0, x1, y1):
            return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
        def shape(*rings):
            return {"kind": "fill", "fill": True, "strokeWidthPx": 0, "tone": 0,
                    "commands": [c for k in range(len(rings)) for c in (["M"] if k else []) + ["L", "L", "L", "Z"]],
                    "points": [p for r in rings for p in r]}
        # a word of three 12 px letters 2 px apart, the middle one an O whose hole sits to its right, where the page's
        # level lines fall about half a pixel across the word (its letters' and the O's hole's own moves round apart)
        letters = [shape(ring(442.4 + 14 * k, 700.3, 454.4 + 14 * k, 712.3), ring(465.0, 703.3, 467.4, 709.3))
                   if k == 1 else shape(ring(442.4 + 14 * k, 700.3, 454.4 + 14 * k, 712.3)) for k in range(3)]
        title = shape(ring(100.3, 100.2, 112.7, 140.6))         # a title's letter, 40 px tall
        d = {"version": fd.VERSION, "textBoxes": [], "items": [dict(it, points=[list(p) for p in it["points"]])
                                                              for it in letters + [title]]}
        fd.straighten(d, W, H, 0.45, 0.45)
        for before, after in zip(letters + [title], d["items"]):
            dx = {round(a[0] - b[0], 6) for a, b in zip(after["points"], before["points"])}
            dy = {round(a[1] - b[1], 6) for a, b in zip(after["points"], before["points"])}
            self.assertEqual((len(dx), len(dy)), (1, 1), "each letter, its hole with it, moved as one")
            self.assertEqual((next(iter(dx)) % 1.0, next(iter(dy)) % 1.0), (0.0, 0.0), "by whole pixels")
        word = {(round(a[0] - b[0], 6), round(a[1] - b[1], 6))
                for before, after in zip(letters, d["items"]) for a, b in zip(after["points"], before["points"])}
        self.assertEqual(len(word), 1, "the word moved as one: %s" % word)

    def test_like_lines_elsewhere_keep_their_place(self):
        # s039: a line on a pixel's middle drew across two pixels, grey, after its run took the place of a longer line
        # half a pixel from it at the far side of the page. Pieces end to end take one place; lines apart keep theirs
        W, H = 800, 400
        d = Straighten._lines([((50.0, 200.5), (300.0, 200.5)), ((500.0, 200.1), (760.0, 200.1))])
        fd.straighten(d, W, H, 0.0, 0.05)
        ys = [p[1] for p in d["items"][0]["points"]]
        self.assertEqual({y % 1.0 for y in ys[:2]}, {0.5})
        self.assertEqual({round(y % 1.0, 2) for y in ys[2:]}, {0.1})

    def test_lean_needs_the_picture_to_lean_too(self):
        # s065 and s064: straight pictures whose few short lines lined up best under a shear of 0.3-0.4 degrees, and
        # were drawn tilted. A direction counts only where the picture's own long lines lean the same way
        W, H = 600, 800
        tv = math.tan(math.radians(0.4))
        d = self._lines([((x + tv * (100 - H / 2), 100), (x + tv * (700 - H / 2), 700)) for x in (80, 200, 320, 440, 520)])
        self.assertAlmostEqual(fd.lean(d, W, H)[0], 0.4, delta=0.03)
        self.assertAlmostEqual(fd.lean(d, W, H, (0.35, None))[0], 0.4, delta=0.03, msg="the picture leans as far")
        self.assertEqual(fd.lean(d, W, H, (0.0, None))[0], 0.0, "the picture is straight")
        self.assertEqual(fd.lean(d, W, H, (None, None))[0], 0.0, "the picture says nothing")
        self.assertEqual(fd.lean(d, W, H, (-0.4, None))[0], 0.0, "it leans the other way")
        self.assertEqual(fd.lean(d, W, H, (0.1, None))[0], 0.0, "a quarter as far")
        for deg in (0.0, 0.5, -0.3):
            p, l = fd.picture_lean(_plan(shear_plumb=deg))
            self.assertAlmostEqual(p, deg, delta=0.05, msg="the picture's long lines read: %s" % deg)
            self.assertAlmostEqual(l, 0.0, delta=0.05)

    def test_unturned_upload_put_on_the_page(self):
        # s037 (31 Oct window): the app turned the upload 0.375 degrees square, resampling it, and the trace drew its
        # blurred lettering as grey blobs. Traced from the upload as it came (--trace) and put on the page by the turn's
        # map (--to-page), the drawing lies on the turned page, its long lines exactly level and plumb
        source = _plan()
        h, w = source.shape
        t = math.radians(0.375)
        W, H = int(round(w * math.cos(t) + h * math.sin(t))), int(round(h * math.cos(t) + w * math.sin(t)))
        M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), 0.375, 1.0)
        M[0, 2] += (W - w) / 2.0
        M[1, 2] += (H - h) / 2.0
        page = cv2.warpAffine(source, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
        to_page = (M[0, 0], M[1, 0], M[0, 1], M[1, 1], M[0, 2], M[1, 2])
        with tempfile.TemporaryDirectory() as folder:
            paths = {k: os.path.join(folder, k + ".png") for k in ("source", "page")}
            cv2.imwrite(paths["source"], source)
            cv2.imwrite(paths["page"], page)
            def run(*extra, straighten=True):
                out = os.path.join(folder, "out.json")
                _switched_in(fd, "STRAIGHTEN", straighten, lambda: fd.main([paths["page"], out] + list(extra)))
                with open(out) as f:
                    return json.load(f)
            arg = "--to-page=" + ",".join(repr(float(v)) for v in to_page)
            put = run("--trace=" + paths["source"], arg)
            exact = run("--trace=" + paths["source"], arg, straighten=False)
            self.assertIn("skipped", run("--trace=" + paths["source"], "--to-page=1,0,0,1,0"))
        traced = fd.drawing(fd.trace_at(source, 2))
        self.assertEqual(exact, fd._mapped(traced, to_page), "straightening off: the trace put on the page exactly")
        tol = math.tan(math.radians(fd.SNAP_DEG))
        long_edges = leaning = 0
        for it in put["items"]:
            for i, j in fd._walk(it):
                (x0, y0), (x1, y1) = it["points"][i], it["points"][j]
                if max(abs(x1 - x0), abs(y1 - y0)) >= 100:
                    long_edges += 1
                    leaning += 0 < min(abs(x1 - x0), abs(y1 - y0)) <= tol * max(abs(x1 - x0), abs(y1 - y0))
        self.assertGreater(long_edges, 10)
        self.assertEqual(leaning, 0, "every long line exactly level or plumb on the page")
        # on the page: the dimension line (x 40 in the upload) where the turn put it, within a pixel
        a, b, c, d, e, f = to_page
        want = a * 40.5 + c * 395.5 + e
        xs = [(it["points"][i][0] + it["points"][j][0]) / 2.0 for it in put["items"] if not it.get("fill")
              for i, j in fd._walk(it) if min(it["points"][i][1], it["points"][j][1]) < 395.5 < max(it["points"][i][1], it["points"][j][1])
              and abs(it["points"][i][0] - want) < 3]
        self.assertTrue(xs and min(abs(x - want) for x in xs) <= 1.0, "the dimension line on the page: %s vs %.2f" % (xs[:4], want))

    def test_straight_plan_untouched_and_leaning_plan_drawn_plumb(self):
        with tempfile.TemporaryDirectory() as folder:
            outs = {}
            for name, g in (("straight", _plan()), ("leaning", _plan(shear_plumb=0.5))):
                src = os.path.join(folder, name + ".png")
                cv2.imwrite(src, g)
                for on in ("1", "0"):
                    out = os.path.join(folder, "%s.%s.json" % (name, on))
                    _switched_in(fd, "STRAIGHTEN", on == "1", lambda: fd.main([src, out]))
                    with open(out) as f:
                        outs[name, on] = json.load(f)
            self.assertEqual(outs["straight", "1"], outs["straight", "0"], "a straight plan is left exactly as traced")
            self.assertNotEqual(outs["leaning", "1"], outs["leaning", "0"])
            tol = math.tan(math.radians(fd.SNAP_DEG))
            for on, plumb_wanted in (("1", True), ("0", False)):
                leaning_edges = 0
                for it in outs["leaning", on]["items"]:
                    for i, j in fd._walk(it):
                        (x0, y0), (x1, y1) = it["points"][i], it["points"][j]
                        if abs(y1 - y0) >= 100 and 0 < abs(x1 - x0) <= tol * abs(y1 - y0):
                            leaning_edges += 1
                if plumb_wanted:
                    self.assertEqual(leaning_edges, 0, "straightened: every long near-plumb edge exactly plumb")
                else:
                    self.assertGreater(leaning_edges, 0, "as traced, the long lines lean")


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
        self.assertGreater(_untyped(lambda: _switched("SMOOTH_MARKS", False, sharp_turns)), 100)
        self.assertLessEqual(_untyped(sharp_turns), 4)

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
        self.assertEqual(_untyped(lambda: _switched("LETTER_STROKES", False, upright)), 1)
        self.assertEqual(_untyped(upright), 0)


# ------------------------------------------------------------------------------------------------ (r12)
def _letter(big, s, text, x, y, cap, weight):
    """text drawn into `big` (s times the picture) from the bundled type's outlines: its baseline's start at (x, y)
    picture px, its capitals `cap` picture px tall"""
    import retype
    polys, _ = retype.layout(text, weight)
    hb = retype.layout("H", weight)[1]
    k = cap * s / (hb[3] - hb[1])
    pts = [np.round(np.stack([x * s + P[:, 0] * k, y * s - P[:, 1] * k], 1) * 16).astype(np.int32) for P in polys]
    cv2.fillPoly(big, pts, 0, cv2.LINE_AA, shift=4)


def _switched_in(module, name, value, run):
    keep = getattr(module, name)
    try:
        setattr(module, name, value)
        return run()
    finally:
        setattr(module, name, keep)


def _trace_small(img):
    """the trace of a small test picture (a drawing in it may take more of it than one in a plan does)"""
    import faithful_trace
    return _switched_in(faithful_trace.CLN, "DRAW_REL", 1.0, lambda: _switched_in(
        faithful_trace.CLN, "DRAW_LETTERS", 0.0, lambda: faithful_trace.trace_gray(img)))


def _path_pts(e, step=0.25):
    out = []
    for p in e["parts"]:
        if p[0] == "L":
            a, b = np.asarray(p[1], float), np.asarray(p[2], float)
            n = max(2, int(np.hypot(*(b - a)) / step) + 1)
            out.append(a + (b - a) * np.linspace(0, 1, n)[:, None])
        else:
            _, c, r, a0, a1 = p
            n = max(3, int(abs(a1 - a0) * r / step) + 1)
            A = np.linspace(a0, a1, n)
            out.append(np.stack([c[0] + r * np.cos(A), c[1] + r * np.sin(A)], 1))
    return np.vstack(out)


def _slot_outline(c1, r1, c2, r2, n=2000):
    """points round the hull of two circles"""
    A = np.linspace(0, 2 * math.pi, n, endpoint=False)
    P = np.vstack([np.stack([c1[0] + r1 * np.cos(A), c1[1] + r1 * np.sin(A)], 1),
                   np.stack([c2[0] + r2 * np.cos(A), c2[1] + r2 * np.sin(A)], 1)]).astype(np.float32)
    return cv2.convexHull(P)[:, 0, :].astype(float)


class Clean(unittest.TestCase):
    """(r12) J, 29 Oct: "trace and reproduce a clean and sharp version of the original plan and not trace the blurry
    and uneven parts out" """

    def test_slot_drawn_as_one_path_with_round_ends(self):
        # a drainer's tapered slot in a thin grey line: outlined, it was a wobbly band with breaks at its narrow end;
        # redrawn, it is one closed path of two straight sides and two round ends, on the line's own centre
        import faithful_trace
        c1, r1, c2, r2 = (40, 30), 7.0, (150, 30), 3.0
        hull = _slot_outline(c1, r1, c2, r2)
        def draw(big, s):
            cv2.polylines(big, [np.round(hull * s * 16).astype(np.int32)], True, 90, int(1.2 * s), cv2.LINE_AA, shift=4)
        img = _reduced(draw, 200, 60, 8)
        t = _trace_small(img)
        paths = [e for e in t["strokes"] if e["k"] == "path"]
        self.assertEqual(len(paths), 1)
        p = paths[0]
        self.assertTrue(p["closed"])
        arcs = [q for q in p["parts"] if q[0] == "A"]
        lines = [q for q in p["parts"] if q[0] == "L"]
        self.assertGreaterEqual(len(arcs), 2)
        self.assertLessEqual(len(p["parts"]), 6)
        self.assertGreaterEqual(max(math.dist(q[1], q[2]) for q in lines), 100, "a side is one straight line")
        # within half a pixel of the slot's true outline all round
        P = _path_pts(p)
        H = hull.astype(np.float32).reshape(-1, 1, 2)
        d = np.array([abs(cv2.pointPolygonTest(H, (float(x), float(y)), True)) for x, y in P])
        self.assertLessEqual(float(d.max()), 0.5)
        # as before (CLEAN off) it was not one path
        self.assertEqual(_switched_in(faithful_trace.CLN, "CLEAN", False,
                                   lambda: sum(1 for e in _trace_small(img)["strokes"] if e["k"] == "path")), 0)

    def test_rounded_box_round_corners_straight_sides(self):
        import faithful_trace
        def draw(big, s):
            x0, y0, x1, y1, r = 30 * s, 20 * s, 150 * s, 100 * s, 9 * s
            th = int(1.0 * s)
            for a, b in (((x0 + r, y0), (x1 - r, y0)), ((x0 + r, y1), (x1 - r, y1)), ((x0, y0 + r), (x0, y1 - r)), ((x1, y0 + r), (x1, y1 - r))):
                cv2.line(big, a, b, 40, th, cv2.LINE_AA)
            for (cx, cy), ang in (((x0 + r, y0 + r), 180), ((x1 - r, y0 + r), 270), ((x1 - r, y1 - r), 0), ((x0 + r, y1 - r), 90)):
                cv2.ellipse(big, (cx, cy), (r, r), 0, ang, ang + 90, 40, th, cv2.LINE_AA)
        img = _reduced(draw, 180, 120, 8)
        paths = [e for e in _trace_small(img)["strokes"] if e["k"] == "path"]
        self.assertEqual(len(paths), 1)
        kinds = sorted(q[0] for q in paths[0]["parts"])
        self.assertEqual(kinds, ["A"] * 4 + ["L"] * 4)
        for q in paths[0]["parts"]:
            if q[0] == "A":
                self.assertAlmostEqual(q[2], 9.0, delta=1.0)

    def test_double_hairline_drawn_as_two_lines(self):
        # a basin's rim: two hairlines a pixel and a half apart, blurred into a band where they run straight
        import faithful_trace
        def draw(big, s):
            for off in (0.0, 1.8):
                x0, y0, x1, y1, r = (30 + off) * s, (20 + off) * s, (150 - off) * s, (100 - off) * s, (10 - off) * s
                pts = []
                for (cx, cy), a0 in (((x1 - r, y0 + r), -90), ((x1 - r, y1 - r), 0), ((x0 + r, y1 - r), 90), ((x0 + r, y0 + r), 180)):
                    A = np.radians(np.linspace(a0, a0 + 90, 30))
                    pts += list(zip(cx + r * np.cos(A), cy + r * np.sin(A)))
                cv2.polylines(big, [np.round(np.array(pts) * 16).astype(np.int32)], True, 60, int(0.8 * s), cv2.LINE_AA, shift=4)
        img = _reduced(draw, 180, 120, 8)
        paths = [e for e in _trace_small(img)["strokes"] if e["k"] == "path" and e["closed"]]
        self.assertEqual(len(paths), 2, "two closed lines, not one band")

    def test_faint_end_carried_through_but_not_a_dashed_lines_gaps(self):
        import faithful_trace
        hull = _slot_outline((40, 30), 6.0, (150, 30), 3.0)
        def draw_with(tone_end):
            def draw(big, s):
                cv2.polylines(big, [np.round(hull * s * 16).astype(np.int32)], True, 70, int(1.2 * s), cv2.LINE_AA, shift=4)
                # the slot's narrow end drawn fainter, as a blurred plan shows it
                faint = np.full_like(big, 255)
                cv2.polylines(faint, [np.round(hull * s * 16).astype(np.int32)], True, tone_end, int(1.2 * s), cv2.LINE_AA, shift=4)
                big[:, 150 * s:] = faint[:, 150 * s:]
                for x in range(20, 180, 8):                      # a dashed line below it
                    cv2.line(big, (x * s, 80 * s), ((x + 5) * s, 80 * s), 70, int(1.2 * s), cv2.LINE_AA)
            return draw
        img = _reduced(draw_with(185), 200, 100, 8)
        t = _trace_small(img)
        slot = [e for e in t["strokes"] if e["k"] == "path" and _path_pts(e)[:, 1].max() < 50]
        self.assertEqual(len(slot), 1)
        self.assertTrue(slot[0]["closed"], "its faint end drawn")
        self.assertGreaterEqual(_path_pts(slot[0])[:, 0].max(), 152.5)
        low = lambda e: (_path_pts(e)[:, 1].min() if e["k"] == "path" else min(e["a"][1], e["b"][1]) if e["k"] == "line" else 0)
        dashes = [e for e in t["strokes"] if e["k"] in ("line", "path") and low(e) > 70] + \
                 [p for p in t["walls"] if min(y for r in p["rings"] for _, y in r) > 70]
        self.assertGreaterEqual(len(dashes), 15, "the dashes stay dashes")
        self.assertFalse(any(e["k"] == "path" and low(e) > 70 for e in t["strokes"]), "not redrawn as one line")

    def test_ring_with_a_faint_part_drawn_as_one_circle(self):
        # a tap hole: a small ring whose top is drawn fainter - it was an open arc with a dash beside its gap
        def draw(big, s):
            cv2.circle(big, (60 * s, 40 * s), 7 * s, 70, int(1.1 * s), cv2.LINE_AA)
            faint = np.full_like(big, 255)
            cv2.circle(faint, (60 * s, 40 * s), 7 * s, 175, int(1.1 * s), cv2.LINE_AA)
            big[:36 * s, 55 * s:65 * s] = faint[:36 * s, 55 * s:65 * s]
            cv2.rectangle(big, (20 * s, 20 * s), (100 * s, 60 * s), 60, int(1.0 * s), cv2.LINE_AA)
        img = _reduced(draw, 120, 80, 8)
        t = _trace_small(img)
        # (drawn whole by the clean drawing, or by the circle fitting before it)
        rings = [e["parts"][0] for e in t["strokes"] if e["k"] == "path" and len(e["parts"]) == 1 and e["parts"][0][0] == "A"
                 and abs(abs(e["parts"][0][4] - e["parts"][0][3]) - 2 * math.pi) < 1e-3] + \
                [("A", e["c"], e["r"], e["a0"], e["a1"]) for e in t["strokes"] if e["k"] == "arc"
                 and abs(abs(e["a1"] - e["a0"]) - 2 * math.pi) < 1e-3]
        self.assertEqual(len(rings), 1, "one whole circle")
        _, c, r, _, _ = rings[0]
        self.assertAlmostEqual(c[0], 60.0, delta=0.5); self.assertAlmostEqual(c[1], 40.0, delta=0.5)
        self.assertAlmostEqual(r, 7.0, delta=0.5)
        near = [e for e in t["strokes"] if e["k"] in ("line", "arc") and
                np.hypot(*(np.mean([e.get("a", e.get("c")), e.get("b", e.get("c"))], 0) - [60, 33])) < 4]
        self.assertEqual(near, [], "no dash left beside it")

    def test_gentle_curve_drawn_as_one_arc(self):
        # a basin's long curved side: read as many short lines, it is one arc
        def draw(big, s):
            cv2.ellipse(big, (100 * s, 150 * s), (120 * s, 120 * s), 0, 240, 300, 60, int(1.0 * s), cv2.LINE_AA)
            cv2.ellipse(big, (100 * s, 150 * s), (90 * s, 90 * s), 0, 230, 310, 60, int(1.0 * s), cv2.LINE_AA)
            cv2.line(big, (40 * s, 46 * s), (40 * s, 70 * s), 60, int(1.0 * s), cv2.LINE_AA)
        img = _reduced(draw, 200, 90, 8)
        paths = [e for e in _trace_small(img)["strokes"] if e["k"] == "path"]
        arcs = [q for e in paths for q in e["parts"] if q[0] == "A" and q[2] > 60]
        self.assertGreaterEqual(len(arcs), 1)
        big = max(arcs, key=lambda q: abs(q[4] - q[3]) * q[2])
        self.assertTrue(abs(big[2] - 120) < 3 or abs(big[2] - 90) < 3, big[2])
        self.assertGreater(abs(big[4] - big[3]), math.radians(50), "the whole curve, not pieces of it")

    def test_slots_inside_a_sink_redrawn_with_it(self):
        # d12's drainer: each slot is smaller than a drawing on its own (2.5 letters tall), but lies inside the sink's
        # outline in finer lines than the plan's lettering - drawn clean with the sink, not traced
        import faithful_trace
        def draw(big, s):
            cv2.rectangle(big, (20 * s, 20 * s), (220 * s, 140 * s), 50, int(1.2 * s), cv2.LINE_AA)
            for k in range(4):
                y = 32 + 26 * k
                cv2.ellipse(big, (90 * s, (y + 6) * s), (6 * s, 6 * s), 0, 90, 270, 70, int(1.0 * s), cv2.LINE_AA)
                cv2.ellipse(big, (190 * s, (y + 6) * s), (6 * s, 6 * s), 0, -90, 90, 70, int(1.0 * s), cv2.LINE_AA)
                cv2.line(big, (90 * s, y * s), (190 * s, y * s), 70, int(1.0 * s), cv2.LINE_AA)
                cv2.line(big, (90 * s, (y + 12) * s), (190 * s, (y + 12) * s), 70, int(1.0 * s), cv2.LINE_AA)
            _letter(big, s, "KITCHEN", 30, 200, 24, "regular")
        img = _reduced(draw, 260, 220, 4)
        t = _switched_in(faithful_trace.CLN, "DRAW_REL", 1.0, lambda: faithful_trace.trace_gray(img))
        slots = [e for e in t["strokes"] if e["k"] == "path" and e["closed"] and 70 < _path_pts(e)[:, 0].mean() < 210
                 and _path_pts(e)[:, 1].max() < 135]
        self.assertEqual(len(slots), 4, "each slot one closed path")

    def test_lines_drawn_with_the_plans_pens(self):
        import faithful_trace
        elems = [{"k": "line", "a": [0, 0], "b": [100, 0], "w": 1.0, "g": 0},
                 {"k": "line", "a": [0, 10], "b": [100, 10], "w": 1.12, "g": 14},
                 {"k": "line", "a": [0, 20], "b": [30, 20], "w": 0.95, "g": 9},
                 {"k": "line", "a": [0, 30], "b": [100, 30], "w": 3.0, "g": 0},
                 {"k": "line", "a": [0, 40], "b": [100, 40], "w": 1.0, "g": 120}]
        faithful_trace._pens(elems)
        self.assertEqual({e["w"] for e in elems[:3]}, {1.0})
        self.assertEqual({e["g"] for e in elems[:4]}, {0})
        self.assertEqual(elems[3]["w"], 3.0)
        self.assertEqual(elems[4]["g"], 120)

    def test_corner_of_one_pen_drawn_as_one_path(self):
        # a door leaf's corner: two lines of one pen ending at one point were two square-capped ends overlapping
        # (a notch where they are not square to each other); joined, the corner is drawn whole
        line = lambda a, b: {"k": "line", "a": a, "b": b, "w": 2.0, "g": 0}
        d = fd.drawing({"walls": [], "strokes": [line([10, 10], [50, 10]), line([50, 10], [60, 50]), line([60, 50], [10, 10])]})
        it = [i for i in d["items"] if i["kind"] == "line"]
        self.assertEqual(len(it), 1)
        self.assertEqual(it[0]["commands"], ["L", "L", "Z"], "one closed path")
        d = fd.drawing({"walls": [], "strokes": [line([10, 10], [50, 10]), line([50, 10], [50, 50])]})
        it = [i for i in d["items"] if i["kind"] == "line"][0]
        self.assertEqual(it["commands"], ["L", "L"])
        self.assertEqual(it["points"], [[9.0, 10.0], [50.0, 10.0], [50.0, 51.0]], "free ends keep their square caps")


@unittest.skipUnless(shutil.which("tesseract"), "tesseract is not installed")
class Retype(unittest.TestCase):
    def test_word_read_with_confidence_set_in_type(self):
        import faithful_trace
        # (lettering drawn from the bundled outlines: cv2.putText draws a different face in OpenCV 4 and 5)
        def draw(big, s):
            _letter(big, s, "KITCHEN", 30, 50, 10, "regular")
            _letter(big, s, "3050", 40, 90, 10, "bold")
        img = _reduced(draw, 200, 110, 8)
        t = _switched_in(faithful_trace.RT, "RETYPE", True, lambda: _trace_small(img))      # (retyping is off by default)
        typed = sorted(w[0] for w in t["typed"])
        self.assertEqual(typed, ["3050", "KITCHEN"])
        self.assertEqual(sorted(p["type"] for p in t["walls"] if p.get("type")), ["3050", "KITCHEN"])
        # and none of the traced letters left under the type
        self.assertEqual(sum(1 for p in t["walls"] if p.get("mark")), 0)

    def test_readings_put_right_by_the_plans_words_and_checked(self):
        import retype
        self.assertEqual(retype.corrected("BrDROOM"), "BEDROOM")
        self.assertEqual(retype.corrected("SHELIER"), "SHELTER")
        self.assertEqual(retype.corrected("HIVING/DINING"), "LIVING/DINING")
        self.assertEqual(retype.corrected("QWERTY"), "QWERTY")
        for ok in ("BEDROOM", "3050", "4.2m", "1200x600", "D1", "2A", "M.BATH"):
            self.assertTrue(retype.plausible(ok), ok)
        for bad in ("8ED7", "|", "Qe_", ""):
            self.assertFalse(retype.plausible(bad), bad)


if __name__ == "__main__":
    unittest.main()
