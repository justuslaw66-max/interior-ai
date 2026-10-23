"""faithful_drawing.py <page image> <out.json> [--max-softness=1.4] [--max-pixels=4000000]: the faithful trace of a
clean plan (faithful_trace.py) as the evidence's `drawing`, in the page's pixels.

The faithful trace copies what is drawn - solid fills as polygons, every line, arc and dot at its own width and tone,
lettering and small marks by their outline - and reads nothing as a room, a door or a wall. The app draws it as the
plan's clean vector drawing in place of stage 1's reading of the page.

Only for a clean picture: one whose ink has crisp edges (stage 1's own softness measure, at most --max-softness; a
blurred scan or photo is left to stage 1) and that is no larger than --max-pixels (the trace works at twice the
picture's size; about 400 MB of memory per million pixels of the picture). Otherwise, and on any error, the output is
{"skipped": <why>} and the app keeps stage 1's drawing.

Output (the evidence's `drawing`, see vectorizer-evidence-schema.ts):
  {"version": "faithful-trace-r6", "items": [{"kind", "fill", "strokeWidthPx", "tone", "commands", "points"}],
   "textBoxes": []}
  - fills: one item per polygon, each ring a closed sub-path; rings are wound by how deep they are nested (an outline
    one way, its holes the other, an island in a hole the first way again), so the nonzero rule the app draws with
    fills them as the trace's even-odd rule does;
  - lines: the trace draws them with square caps, so each is carried on by half its width at both ends (the app's
    paths have butt caps); lines of one width and tone are one item of separate sub-paths;
  - arcs: cubic Beziers of at most 90 degrees; a full circle is closed;
  - dots: filled circles, one item per tone;
  - strokes lighter in tone are listed first, so darker lines lie over them; the light lines drawn through dark fills
    (a white line across a black column) come last;
  - `tone` is the grey the trace drew it in (0 black - 255 white); the page's paper is not drawn.
"""
import json, math, os, sys

import cv2
import numpy as np

VERSION = "faithful-trace-r6"
MAX_COMMANDS = 4000           # per item (vectorizer-evidence-schema.ts)
MAX_POINTS = 12000
MAX_ITEMS = 8000


def softness(g):
    """stage 1's measure (floorplan_vectorize.extract): mid-grey pixels per perimeter pixel around solid black,
    about 0.7 for a crisp screenshot, about 2 for a blurred JPEG"""
    w = cv2.morphologyEx(((g < 60) * 255).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    er = cv2.erode(w, np.ones((3, 3), np.uint8))
    per = int(((w > 0) & (er == 0)).sum())
    band = (cv2.dilate(w, np.ones((7, 7), np.uint8)) > 0) & (er == 0)
    return float((band & (g > 60) & (g < 215)).sum()) / max(1, per)


def read_gray(path):
    """the picture in grey, transparency over white (as the app's own trace reads it)"""
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise ValueError("unreadable picture")
    if im.dtype != np.uint8:
        im = (im / 257).astype(np.uint8) if im.dtype == np.uint16 else np.clip(im, 0, 255).astype(np.uint8)
    if im.ndim == 2:
        return im
    if im.shape[2] == 4:
        a = im[:, :, 3:4].astype(np.float32) / 255.0
        im = (im[:, :, :3].astype(np.float32) * a + 255.0 * (1 - a)).round().astype(np.uint8)
    return cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2GRAY)


def _p(x, y):
    return [round(float(x), 2), round(float(y), 2)]


def _area(r):
    x, y = r[:, 0], r[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y))


def _depths(rings):
    """how many of the polygon's other rings each ring lies inside (by most of a few of its vertices)"""
    depth = [0] * len(rings)
    for i, r in enumerate(rings):
        idx = np.linspace(0, len(r) - 1, min(len(r), 7)).astype(int)
        for j, q in enumerate(rings):
            if i == j:
                continue
            c = q.astype(np.float32).reshape(-1, 1, 2)
            s = sum(cv2.pointPolygonTest(c, (float(r[k, 0]), float(r[k, 1])), False) for k in idx)
            if s > 0:
                depth[i] += 1
    return depth


def fill_item(poly):
    rings = [np.asarray(r, float) for r in poly["rings"] if len(r) >= 3]
    if not rings:
        return None
    depth = _depths(rings)
    commands, points = [], []
    for r, dp in zip(rings, depth):
        if (_area(r) > 0) != (dp % 2 == 0):
            r = r[::-1]
        if points:
            commands.append("M")
        points.append(_p(*r[0]))
        for v in r[1:]:
            commands.append("L"); points.append(_p(*v))
        commands.append("Z")
    if len(commands) > MAX_COMMANDS or len(points) > MAX_POINTS:
        return None
    return {"kind": "fill", "fill": True, "strokeWidthPx": 0, "tone": int(poly["g"]), "commands": commands, "points": points}


def _arc_cubics(cx, cy, r, a0, a1):
    """the arc from a0 to a1 (radians, y down as drawn) as cubic Beziers of at most 90 degrees: [(c1, c2, end), ...]"""
    n = max(1, int(math.ceil(abs(a1 - a0) / (math.pi / 2) - 1e-9)))
    out, step = [], (a1 - a0) / n
    k = 4.0 / 3.0 * math.tan(step / 4.0)
    for i in range(n):
        t0, t1 = a0 + i * step, a0 + (i + 1) * step
        p0 = (cx + r * math.cos(t0), cy + r * math.sin(t0)); p3 = (cx + r * math.cos(t1), cy + r * math.sin(t1))
        c1 = (p0[0] - k * r * math.sin(t0), p0[1] + k * r * math.cos(t0))
        c2 = (p3[0] + k * r * math.sin(t1), p3[1] - k * r * math.cos(t1))
        out.append((c1, c2, p3))
    return out


def _stroke_piece(e):
    """one stroke as (start, [(command, [points...]), ...], closed)"""
    if e["k"] == "line":
        a, b = np.asarray(e["a"], float), np.asarray(e["b"], float)
        L = float(np.linalg.norm(b - a))
        u = (b - a) / L if L > 1e-6 else np.array([1.0, 0.0])
        h = e["w"] / 2.0                                     # (square caps)
        a, b = a - u * h, b + u * h
        return _p(*a), [("L", [_p(*b)])], False
    cx, cy = e["c"]; r = e["r"]; a0, a1 = e["a0"], e["a1"]
    full = abs(a1 - a0) >= 2 * math.pi - 0.05
    if full:
        a0, a1 = 0.0, 2 * math.pi
    segs = [("C", [_p(*c1), _p(*c2), _p(*p3)]) for c1, c2, p3 in _arc_cubics(cx, cy, r, a0, a1)]
    return _p(cx + r * math.cos(a0), cy + r * math.sin(a0)), segs, full


def _items_of(pieces, base):
    """pieces of one style as items of separate sub-paths, each within the limits"""
    items, cur = [], None
    for start, segs, closed in pieces:
        nc = 1 + sum(1 for _ in segs) + (1 if closed else 0)
        npts = 1 + sum(len(p) for _, p in segs)
        if cur is None or len(cur["commands"]) + nc > MAX_COMMANDS or len(cur["points"]) + npts > MAX_POINTS:
            cur = dict(base, commands=[], points=[])
            items.append(cur)
        if cur["points"]:
            cur["commands"].append("M")
        cur["points"].append(start)
        for c, p in segs:
            cur["commands"].append(c); cur["points"].extend(p)
        if closed:
            cur["commands"].append("Z")
    return items


def drawing(t):
    """the trace (faithful_trace.trace) as the evidence's drawing"""
    items = []
    for poly in t["walls"]:
        it = fill_item(poly)
        if it:
            items.append(it)
    groups = {}
    for e in t["strokes"]:
        if e["k"] == "dot":
            r = max(0.5, e["w"] / 2.0)
            piece = (_p(e["c"][0] + r, e["c"][1]),
                     [("C", [_p(*c1), _p(*c2), _p(*p3)]) for c1, c2, p3 in _arc_cubics(e["c"][0], e["c"][1], r, 0.0, 2 * math.pi)], True)
            key = (2, -int(e["g"]), 0.0, "dot")
        else:
            piece = _stroke_piece(e)
            key = (1 if e.get("light") else 0, -int(e["g"]), round(float(e["w"]), 2), e["k"])
        groups.setdefault(key, []).append(piece)
    # dots (filled) with the fills, before the strokes; then strokes light to dark; light lines in dark fills last
    for key in sorted(groups, key=lambda k: (0 if k[0] == 2 else 1 + k[0], k[1], k[2], k[3])):
        light, tone, w, kind = key
        if kind == "dot":
            base = {"kind": "dot", "fill": True, "strokeWidthPx": 0, "tone": -tone}
        else:
            base = {"kind": kind, "fill": False, "strokeWidthPx": max(0.05, w), "tone": -tone}
        items.extend(_items_of(groups[key], base))
    if len(items) > MAX_ITEMS:
        return None
    return {"version": VERSION, "items": items, "textBoxes": []}


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opt = dict(a[2:].split("=", 1) for a in argv if a.startswith("--") and "=" in a)
    src, out_path = args[0], args[1]
    max_soft = float(opt.get("max-softness", "1.4")); max_px = int(float(opt.get("max-pixels", "4000000")))
    result = None
    try:
        g = read_gray(src)
        H, W = g.shape
        soft = softness(g)
        if H * W > max_px:
            result = {"skipped": "picture too large for the faithful trace (%d x %d px)" % (W, H)}
        elif soft > max_soft:
            result = {"skipped": "picture not crisp enough for the faithful trace (edge softness %.2f)" % soft}
        else:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import faithful_trace
            d = drawing(faithful_trace.trace_gray(g))
            result = d if d else {"skipped": "faithful trace has too many shapes"}
    except Exception as cause:                                   # the app keeps stage 1's drawing
        result = {"skipped": "faithful trace failed: %s" % (str(cause)[:160] or type(cause).__name__)}
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))
    if "skipped" in result:
        print(result["skipped"])
    else:
        print("faithful drawing: %d items" % len(result["items"]))


if __name__ == "__main__":
    main(sys.argv[1:])
