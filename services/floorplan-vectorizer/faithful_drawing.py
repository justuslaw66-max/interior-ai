"""faithful_drawing.py <page image> <out.json> [--max-softness=1.4] [--max-pixels=4000000]
[--trace=<picture> --to-page=a,b,c,d,e,f]: the faithful trace of a clean plan (faithful_trace.py) as the evidence's
`drawing`, in the page's pixels. With --trace, that picture is traced instead and its drawing put on the page by the
affine map --to-page (the upload as it came, where the app's raster deskew turned the page square and resampled it).

The faithful trace copies what is drawn - solid fills as polygons, every line, arc and dot at its own width and tone,
lettering and small marks by their outline - and reads nothing as a room, a door or a wall. The app draws it as the
plan's clean vector drawing in place of stage 1's reading of the page.

Only for dark ink on light paper (a plan drawn light on a dark ground traces as one black sheet; with FV_INVERT_DARK=1
such a plan is traced turned over instead, since 30 Oct) and a picture that is not blurred (stage 1's softness measure around solid black, at most --max-softness: a blurred scan or photo is left).
A picture that is merely soft without solid black (a low-resolution JPEG plan enlarged into a brochure page) is traced,
which is better than the app's older pixel trace (J, 24 Oct); since r8 its lettering is copied letter by letter where
it runs together or into the line work under it, and since r9 that holds for such a plan as the app renders a PDF page
(its pixels repeated, not blended), whose light lines are traced as lines, and since r10 a long slanting or curved
line in it as one line or band. Since r11 every trace is tidied as a drawing: letters and figures outlined smoothly, a
thin line at one weight along its length, square corners, door swings run into their jambs, circles fitted as
circles, ticks and hatching kept whole and within their lines. Since r12 a fixture drawn in thin lines (a sink, a drainer, a WC) is
redrawn clean rather than copied (J, 29 Oct: "reproduce a clean and sharp version of the original plan and not trace
the blurry and uneven parts"): straight lines and true arcs joined into one path per shape, lines on the plan's few
pens; lettering is left as traced (retyping it in clean type is built, off by default). Since 31 Oct a plan that leans a
little (a scan or a re-saved web plan whose plumb or level lines lean by a few tenths of a degree, in the drawing and in
the picture's own long lines alike) is drawn straight: one affine map of the whole drawing, then near-level and
near-plumb edges set exactly so, joins kept, lettering moved whole (FT_STRAIGHTEN, on;
see "straightening" below). A plan that reads straight is drawn exactly as before.
The trace works at twice the picture's size up to --max-pixels (about 350-400 MB of memory per million pixels of the
picture); a larger picture, up to three times --max-pixels, is traced at its own size (about 110 MB per million pixels:
the same memory at most), and a larger one still is left. Otherwise, and on any error, the output is {"skipped": <why>}
and the app draws no traced drawing for the page (its picture is shown as it is), with a note saying why.

Output (the evidence's `drawing`, see vectorizer-evidence-schema.ts):
  {"version": "faithful-trace-r12", "items": [{"kind", "fill", "strokeWidthPx", "tone", "commands", "points"}],
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

VERSION = "faithful-trace-r12"
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


def paper_tone(g):
    """the picture's most common grey: its paper (dark for a plan drawn in light lines on a dark ground)"""
    return int(np.argmax(np.bincount(g.ravel(), minlength=256)))


def light_on_dark(g):
    """True for a plan drawn light on a dark ground: its paper (most common grey) under 128 and its ink lighter - at
    least twice as much ink lighter than the paper as darker (floorplan_vectorize.light_on_dark: the same rule)"""
    hist = np.bincount(g.ravel(), minlength=256)
    paper = int(np.argmax(hist))
    if paper >= 128:
        return False
    lighter = int(hist[min(255, paper + 60):].sum())
    darker = int(hist[:max(0, paper - 60)].sum())
    if lighter < 2 * darker or lighter < 0.002 * g.size:
        return False
    # and dark round its edges, as a page is: a plan whose black fills cover more than half of white paper is not
    b = max(1, min(g.shape[:2]) // 50)
    frame = np.concatenate([g[:b].ravel(), g[-b:].ravel(), g[:, :b].ravel(), g[:, -b:].ravel()])
    return float(np.median(frame)) < 128


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
    if e["k"] == "path":
        # (r12) a shape drawn as one path: its lines and arcs in turn, closed - no ends, so no caps
        segs, start = [], None
        for p in e["parts"]:
            if p[0] == "L":
                if start is None:
                    start = _p(*p[1])
                segs.append(("L", [_p(*p[2])]))
            else:
                _, (cx, cy), r, a0, a1 = p
                if start is None:
                    start = _p(cx + r * math.cos(a0), cy + r * math.sin(a0))
                segs += [("C", [_p(*c1), _p(*c2), _p(*p3)]) for c1, c2, p3 in _arc_cubics(cx, cy, r, a0, a1)]
        if e.get("closed") and segs and segs[-1][0] == "L":
            segs = segs[:-1]                                   # (its last side is the closing Z)
        return start, segs, bool(e.get("closed"))
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


JOIN = os.environ.get("FT_JOIN", "1") == "1"   # (r12) lines of one pen meeting end to end drawn as one path


def _joined(lines, w):
    """(r12) straight lines of one pen that meet end to end (a door leaf's corners, a frame's) as paths that run on
    through their corners, so a corner is drawn whole (a mitred join) instead of two ends overlapping: a line's free
    end keeps its square cap (carried on half the width)"""
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    at = {}
    for i, e in enumerate(lines):
        at.setdefault(key(e["a"]), []).append((i, 0)); at.setdefault(key(e["b"]), []).append((i, 1))
    used = [False] * len(lines)
    out = []
    def other(i, end):
        e = lines[i]
        return e["b"] if end == 0 else e["a"]
    for i in range(len(lines)):
        if used[i]:
            continue
        used[i] = True
        pts = [list(lines[i]["a"]), list(lines[i]["b"])]
        # walk on from the b end, then back from the a end, through ends where exactly two lines meet
        for direction in (1, 0):
            while True:
                tip = pts[-1] if direction == 1 else pts[0]
                lst = [(j, en) for j, en in at.get(key(tip), []) if not used[j]]
                if len(at.get(key(tip), [])) != 2 or len(lst) != 1:
                    break
                j, en = lst[0]
                used[j] = True
                nxt = list(other(j, en))
                if direction == 1:
                    pts.append(nxt)
                else:
                    pts.insert(0, nxt)
        closed = len(pts) > 3 and key(pts[0]) == key(pts[-1])
        P = np.asarray(pts, float)
        if closed:
            P = P[:-1]
        else:
            h = w / 2.0
            for k, nb in ((0, 1), (-1, -2)):
                v = P[k] - P[nb]
                L = float(np.linalg.norm(v))
                if L > 1e-6:
                    P[k] = P[k] + v / L * h
        out.append((_p(*P[0]), [("L", [_p(*q)]) for q in P[1:]], closed))
    return out


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
    lines_by = {}
    for e in t["strokes"]:
        if JOIN and e["k"] == "line":
            lines_by.setdefault((1 if e.get("light") else 0, -int(e["g"]), round(float(e["w"]), 2), "line"), []).append(e)
            continue
        if e["k"] == "dot":
            r = max(0.5, e["w"] / 2.0)
            piece = (_p(e["c"][0] + r, e["c"][1]),
                     [("C", [_p(*c1), _p(*c2), _p(*p3)]) for c1, c2, p3 in _arc_cubics(e["c"][0], e["c"][1], r, 0.0, 2 * math.pi)], True)
            key = (2, -int(e["g"]), 0.0, "dot")
        else:
            piece = _stroke_piece(e)
            key = (1 if e.get("light") else 0, -int(e["g"]), round(float(e["w"]), 2), e["k"])
        groups.setdefault(key, []).append(piece)
    for key, ls in lines_by.items():
        groups.setdefault(key, []).extend(_joined(ls, key[2]))
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


# ----------------------------------------------------------------------------------------------- straightening
# (31 Oct, J on s038: "did we build a feature where it will rebuild a tilted plan like this straighten out") A scanned
# or re-saved web plan often leans a little: its plumb lines all lean the same way by a few tenths of a degree, its level
# lines sometimes too (a shear, or a slight turn). The trace copies the lean, and where it squares a wall's pieces
# (r11) a leaning wall becomes a staircase of plumb pieces a pixel apart. Stage 1 straightens only a turn it can read
# along whole lines, and on a small picture a lean of 0.4 degrees reads as plumb runs a pixel apart, so it reads 0.
# The lean is measured on the drawing itself (the trace may have drawn straight what leans in the picture): points
# along its near-plumb (near-level) edges are sheared until their columns (rows) are sharpest, which also finds a
# staircase of squared pieces. A few long lines can line up by chance under some shear (s065, s064: straight pictures
# read as leaning 0.3-0.4 degrees), so a direction is straightened only where the picture's own long lines lean the same
# way, about as far. It is then straightened by one affine map of the whole drawing (every join kept), and each
# near-level or near-plumb straight edge is set exactly level or plumb, with what meets it (an arc's end, another item's
# corner) carried along. The drawing then sits up to a few pixels off the picture towards its edges. A page that reads
# straight is left exactly as traced.
STRAIGHTEN = os.environ.get("FT_STRAIGHTEN", "1") == "1"
LEAN_RANGE = 2.0             # degrees searched each way; more is a turned page or a photo, not a lean
LEAN_MIN = 0.1               # degrees: less is left
LEAN_DRIFT_PX = 1.5          # picture px the lean must add up to across the line work: less is within a pixel or so of
                             # straight already, and whole pixels cannot put it righter, only add steps
LEAN_GAIN = float(os.environ.get("FT_LEAN_GAIN", "1.05"))   # how much sharper the sheared edges must be than none
LEAN_INK = 1000              # points along the drawing's edges the measure needs, each way
LEAN_SAMPLE = 1_000_000      # points it uses at most
PIC_LINE_PX = 80             # picture px: the picture's long straight lines, that its own lean is read from
PIC_LINES = 8                # of them each way at least, or the picture says nothing
PIC_PIXELS = 2_000_000       # a larger picture is read reduced to this (the lines' angles are the same)
PIC_AGREE = 2.0              # the picture's lean within this factor of the drawing's, the same way
SNAP_DEG = 0.6               # degrees: a straight edge this near level or plumb (beyond the lean put right) is set so
SNAP_MIN_PX = 4.0            # picture px: shorter edges are left (a letter's curve)
SNAP_SHAPE_PX = 20.0         # picture px: a filled shape smaller than this both ways (a letter) is not snapped
RIGID_PX = 0.5               # picture px: nor one too short for the lean to add up to this along it (a title's letter)
WORD_GAP_PX = 2.0            # picture px: shapes moved whole this near each other (a word's letters) move as one,
WORD_PX = 1.0                # while the lean adds up to less than this across them all
RUN_GAP_PX = 40.0            # picture px: pieces of one wall, end to end, at most this far apart along it
ATTACH_PX = 2.0              # picture px: a door swing's end this near a corner of the line work moves with it


def _sharpest(u, v):
    """the angle (degrees) a shear u - tan(a) * v makes u's profile sharpest, and how much sharper than none"""
    def score(a):
        # each point split between the two nearest whole-pixel bins, so the sharpness changes smoothly with the angle
        # and peaks at the lean itself (whole bins hold a run of angles equally sharp, not centred on it)
        q = u - math.tan(math.radians(a)) * v
        f = np.floor(q)
        w = q - f
        k = (f - f.min()).astype(np.int64)
        h = np.bincount(k, weights=1.0 - w, minlength=int(k.max()) + 2) + np.bincount(k + 1, weights=w, minlength=int(k.max()) + 2)
        return float((h * h).sum())
    s0 = score(0.0)
    coarse = np.round(np.arange(-LEAN_RANGE, LEAN_RANGE + 1e-9, 0.1), 3)
    a0 = float(coarse[int(np.argmax([score(a) for a in coarse]))])
    fine = np.round(np.arange(a0 - 0.15, a0 + 0.15 + 1e-9, 0.01), 3)
    sf = np.array([score(a) for a in fine])
    k = int(np.argmax(sf))
    a = float(fine[k])
    if 0 < k < len(fine) - 1:                    # between the samples: the peak of the parabola through the top three
        den = sf[k - 1] - 2 * sf[k] + sf[k + 1]
        if den < 0:
            a += 0.01 * 0.5 * (sf[k - 1] - sf[k + 1]) / den
    return round(float(a), 3), (float(sf[k]) / s0 if s0 else 1.0)


def picture_lean(g):
    """(plumb, level): how far the picture's own long straight lines lean, in degrees as lean() reads them: the
    length-weighted median of the lines (LSD) within LEAN_RANGE of plumb (level), or None where it has too few. Its
    lettering is left out by length; read from all its edges, a picture reads straight at any lean, its letters' and
    marks' edges being the pixels' own rows and columns."""
    s = min(1.0, math.sqrt(PIC_PIXELS / float(g.shape[0] * g.shape[1])))
    small = cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1.0 else g
    found = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD).detect(small)[0]
    segs = found[:, 0].astype(float) if found is not None else np.zeros((0, 4))
    dx, dy = segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1]
    length = np.hypot(dx, dy)
    out = []
    for a in (np.degrees(np.arctan2(dx, dy)), np.degrees(np.arctan2(dy, dx))):
        a = (a + 90.0) % 180.0 - 90.0                # either way along the line
        keep = (length >= PIC_LINE_PX * s) & (np.abs(a) <= LEAN_RANGE)
        if int(keep.sum()) < PIC_LINES:
            out.append(None)
            continue
        a, w = a[keep], length[keep]
        o = np.argsort(a)
        c = np.cumsum(w[o])
        out.append(round(float(a[o][int(np.searchsorted(c, c[-1] / 2.0))]), 3))
    return out[0], out[1]


def lean(d, W, H, picture=None):
    """(plumb, level, report): how far the drawing's plumb lines lean (x = x0 + tan(plumb) * y) and its level lines fall
    (y = y0 + tan(level) * x), in degrees, each 0.0 unless clearly so; the report has the measures as read. Read from
    the drawing itself, not the picture: the trace may already have drawn a line straight that leans in the picture,
    and a wall it squared piece by piece leans only as a whole (its pieces step sideways). Points every pixel along its
    lines' straight edges within 3 degrees of plumb (or level) are sheared until their columns (rows) are sharpest.
    With picture (picture_lean's reading), a direction counts only where the picture's long lines lean the same way,
    within PIC_AGREE times as far."""
    near = math.tan(math.radians(LEAN_RANGE + 1.0))
    fam = {"v": ([], []), "h": ([], [])}
    for it in d["items"]:
        if it.get("fill"):                       # line work only: lettering's outlines, traced from the pixels' steps,
            continue                             # are level and plumb at any lean, and a tinted band is any width
        pts = it["points"]
        for i, j in _walk(it):
            (x0, y0), (x1, y1) = pts[i], pts[j]
            dx, dy = abs(x1 - x0), abs(y1 - y0)
            n = int(math.hypot(dx, dy))
            if n < 2:
                continue
            key = "v" if dx <= near * dy else "h" if dy <= near * dx else None
            if key:
                t = np.linspace(0.0, 1.0, n + 1)
                fam[key][0].append(x0 + t * (x1 - x0)); fam[key][1].append(y0 + t * (y1 - y0))
    out, report = [], {}
    for key in ("v", "h"):
        xs, ys = fam[key]
        if not xs or sum(len(a) for a in xs) < LEAN_INK:
            out.append(0.0); report[key] = "too little"
            continue
        x, y = np.concatenate(xs) - W / 2.0, np.concatenate(ys) - H / 2.0
        if len(x) > LEAN_SAMPLE:
            keep = np.random.default_rng(0).choice(len(x), LEAN_SAMPLE, replace=False)
            x, y = x[keep], y[keep]
        u, v = (x, y) if key == "v" else (y, x)
        a, gain = _sharpest(u, v)
        drift = math.tan(math.radians(abs(a))) * float(v.max() - v.min())
        report[key] = (a, round(gain, 3), round(drift, 1))
        clear = LEAN_MIN <= abs(a) <= LEAN_RANGE and gain >= LEAN_GAIN and drift >= LEAN_DRIFT_PX
        if clear and picture is not None:
            seen = picture[0 if key == "v" else 1]
            report[key] += (seen,)
            clear = seen is not None and 1.0 / PIC_AGREE <= seen / a <= PIC_AGREE
        out.append(a if clear else 0.0)
    return out[0], out[1], report


def _walk(it):
    """an item's straight edges as (i, j) point indices, closing edges included"""
    edges, cur, start, i = [], 0, 0, 1
    for c in it["commands"]:
        if c == "M":
            cur = start = i; i += 1
        elif c == "L":
            edges.append((cur, i)); cur = i; i += 1
        elif c == "C":
            cur = i + 2; i += 3
        elif c == "Z":
            if cur != start:
                edges.append((cur, start))
            cur = start
    return edges


def _subpaths(it):
    """an item's sub-paths as lists of point indices (a cubic's control points included, in order)"""
    subs, cur, i = [[0]], None, 1
    for c in it["commands"]:
        if c == "M":
            subs.append([i]); i += 1
        elif c == "L":
            subs[-1].append(i); i += 1
        elif c == "C":
            subs[-1].extend((i, i + 1, i + 2)); i += 3
    return subs


def _cubic_ends(it):
    """(end point, its control point) index pairs of an item's cubics, both ends of each"""
    pairs, cur, i = [], 0, 1
    for c in it["commands"]:
        if c == "M":
            cur = i; i += 1
        elif c == "L":
            cur = i; i += 1
        elif c == "C":
            pairs += [(cur, i), (i + 2, i + 1)]
            cur = i + 2; i += 3
    return pairs


def _phased(value, phase):
    """value moved to the nearest number with the given fraction (where a crisp line or edge sits in its pixel)"""
    return phase + round(value - phase)


def _whole_shapes(items, orig, amap, lean_t):
    """{item index: (dx, dy)} whole pixels for each filled item moved whole: one too small for the lean (lean_t, its
    tangent) to add up to RIGID_PX along it, or under SNAP_SHAPE_PX. A letter's outline and its holes are one item, so
    they move together; the items of a word (within WORD_GAP_PX of each other) take one move while the lean adds up to
    less than WORD_PX across the word, else each its own (the map's move at its middle, rounded)"""
    box = {}
    for n, (it, pts) in enumerate(zip(items, orig)):
        if it.get("fill") and pts:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            b = (min(xs), min(ys), max(xs), max(ys))
            e = max(b[2] - b[0], b[3] - b[1])
            if e < SNAP_SHAPE_PX or e * lean_t < RIGID_PX:
                box[n] = b
    up = {n: n for n in box}

    def root(a):
        while up[a] != a:
            up[a] = up[up[a]]
            a = up[a]
        return a
    cell, g = 32.0, WORD_GAP_PX
    grid = {}
    for n, (x0, y0, x1, y1) in box.items():
        for gx in range(int((x0 - g) // cell), int((x1 + g) // cell) + 1):
            for gy in range(int((y0 - g) // cell), int((y1 + g) // cell) + 1):
                for m in grid.get((gx, gy), ()):
                    a = box[m]
                    if a[0] <= x1 + g and x0 <= a[2] + g and a[1] <= y1 + g and y0 <= a[3] + g:
                        up[root(m)] = root(n)
                grid.setdefault((gx, gy), []).append(n)
    words = {}
    for n in box:
        words.setdefault(root(n), []).append(n)
    shift = {}
    for members in words.values():
        bs = [box[n] for n in members]
        wb = (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))
        one = max(wb[2] - wb[0], wb[3] - wb[1]) * lean_t < WORD_PX
        for n in members:
            b = wb if one else box[n]
            mx, my = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
            ax, ay = amap(mx, my)
            shift[n] = (round(ax - mx), round(ay - my))
    return shift


def _mapped(d, base):
    """a copy of the drawing d with every point through the affine map base (a, b, c, d, e, f: x' = a x + c y + e,
    y' = b x + d y + f) and its lines' widths scaled with it"""
    a, b, c, dd, e, f = base
    k = math.sqrt(abs(a * dd - b * c))
    return dict(d, items=[dict(it, points=[_p(a * x + c * y + e, b * x + dd * y + f) for x, y in it["points"]],
                               strokeWidthPx=round(float(it.get("strokeWidthPx") or 0) * k, 3) if not it.get("fill")
                               else it.get("strokeWidthPx", 0))
                          for it in d["items"]])


def straighten(d, W, H, plumb, level, base=None):
    """the drawing d straightened in place, and how many points were set level or plumb.

    With base (an affine map, as _mapped takes it), the drawing was traced from another picture than the page's own: the
    upload as it came, before the app turned it square (raster_deskew_v1). It is then put into the page's pixels by base
    first, by the same rules, so it draws as crisp as traced rather than resampled.

    One affine map sets plumb lines plumb and level lines level about the page's middle. Each run of near-plumb
    (near-level) straight edges then takes one x (y): the map's mean along it, moved to where the run sat within its
    pixel as traced, so it draws at the weight and grey it was traced at (a grey 1-px line the trace drew as a thinner
    black one across two pixels stays grey; set crisp, it drew black). Everything else moves by whole pixels, so it draws
    exactly as crisp as traced: a filled shape too small for the lean to tell along it (a letter, a figure, a dot) as
    one, never reshaped, and the shapes of a word together; a long one point by point. A point several pieces share (a
    corner drawn as two pieces, an arc's end at a jamb) moves as one point, and a cubic's control point moves with its
    end."""
    tv, th = math.tan(math.radians(plumb)), math.tan(math.radians(level))
    cx, cy = W / 2.0, H / 2.0
    ba, bb, bc, bd, be, bf = base or (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    turn = abs(math.degrees(math.atan2(bb, ba)))
    shear = lambda x, y: (x - tv * (y - cy), y - th * (x - cx))
    amap = lambda x, y: shear(ba * x + bc * y + be, bb * x + bd * y + bf)
    items = d["items"]
    orig = [[(float(p[0]), float(p[1])) for p in it["points"]] for it in items]
    if base:
        k = math.sqrt(abs(ba * bd - bb * bc))
        for it in items:
            if not it.get("fill"):
                it["strokeWidthPx"] = round(float(it.get("strokeWidthPx") or 0) * k, 3)
    shift = _whole_shapes(items, orig, amap, math.tan(math.radians(max(abs(plumb), abs(level)) + turn)))
    # what the map turned: a piece the trace had already squared now leans by the whole lean (and the turn), so each
    # direction takes its lean as well as the snapping's own tolerance
    tol_v = math.tan(math.radians(abs(plumb) + turn + SNAP_DEG))
    tol_h = math.tan(math.radians(abs(level) + turn + SNAP_DEG))
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    edges = {0: [], 1: []}                       # axis set (0: x of a plumb run, 1: y of a level run) -> edges
    for n, (it, pts) in enumerate(zip(items, orig)):
        if n in shift:
            continue                             # a letter or a small mark: moved whole below, never reshaped
        for i, j in _walk(it):
            a, b = pts[i], pts[j]
            (x0, y0), (x1, y1) = amap(*a), amap(*b)
            dx, dy = abs(x1 - x0), abs(y1 - y0)
            if max(dx, dy) < SNAP_MIN_PX:
                continue
            if dx <= tol_v * dy:
                edges[0].append((a, b, dy, (x0 + x1) / 2.0))
            elif dy <= tol_h * dx:
                edges[1].append((a, b, dx, (y0 + y1) / 2.0))
    snapped = {}                                 # original point -> [x or None, y or None]
    for axis, es in edges.items():
        parent.clear()
        for a, b, *_ in es:
            parent[find(a)] = find(b)
        runs = {}
        for e in es:
            runs.setdefault(find(e[0]), []).append(e)
        along = 1 - axis
        runs = [(sum(e[2] * e[3] for e in run) / sum(e[2] for e in run), sum(e[2] for e in run), run,
                 min(min(e[0][along], e[1][along]) for e in run), max(max(e[0][along], e[1][along]) for e in run))
                for run in runs.values()]
        runs.sort(key=lambda r: r[0])
        # runs within half a pixel of each other once straightened and end to end (the pieces of one wall, which the
        # map has brought into line) take one place, so rounding to the pixel cannot set them a pixel apart; lines
        # elsewhere on the page that happen to sit as near keep their own
        top = list(range(len(runs)))

        def head(a):
            while top[a] != a:
                top[a] = top[top[a]]
                a = top[a]
            return a
        for k, r in enumerate(runs):
            for m in range(k - 1, -1, -1):
                q = runs[m]
                if r[0] - q[0] >= 0.5:
                    break
                if r[3] - q[4] <= RUN_GAP_PX and q[3] - r[4] <= RUN_GAP_PX:
                    top[head(m)] = head(k)
        by = {}
        for k, r in enumerate(runs):
            by.setdefault(head(k), []).append(r[:3])
        for group in by.values():
            target = sum(t * wt for t, wt, _ in group) / sum(wt for _, wt, _ in group)
            # where most of its length sat within its pixel as traced (each edge at its middle), so most of it draws
            # as it was traced: pieces a part of a pixel apart drew some crisp and some across two pixels
            phases = [(((e[0][axis] + e[1][axis]) / 2.0) % 1.0, e[2]) for _, _, run in group for e in run]
            near = lambda f, g: min(abs(f - g), 1.0 - abs(f - g)) <= 0.15
            phase = max(phases, key=lambda f: sum(w for g, w in phases if near(f[0], g)))[0]
            value = round(_phased(target, phase), 2)
            for _, _, run in group:
                for e in run:
                    for p in (e[0], e[1]):
                        snapped.setdefault(p, [None, None])[axis] = value
    # where every point goes otherwise: whole pixels, a small sub-path as one
    uses = {}
    for it, pts in zip(items, orig):
        for sub in _subpaths(it):
            for k in set(sub):
                uses[pts[k]] = uses.get(pts[k], 0) + 1
    whole = lambda p: (p[0] + round(amap(*p)[0] - p[0]), p[1] + round(amap(*p)[1] - p[1]))
    moved = 0
    placed = {}                                  # original point -> where the line work put it
    order = [k for k, it in enumerate(items) if it.get("kind") != "arc"] + [k for k, it in enumerate(items) if it.get("kind") == "arc"]
    cells = {}
    for n in order:
        it, pts = items[n], orig[n]
        new = list(pts)
        if n in shift:                           # a letter, a word: as one, its shape as traced
            sx, sy = shift[n]
            new = [(x + sx, y + sy) for x, y in pts]
        for sub in (_subpaths(it) if n not in shift else ()):
            if it.get("kind") == "arc":
                # a door swing follows what it ends at (a jamb, a leaf's end): the move of the nearest corner of the
                # line work within ATTACH_PX of each end; else whole pixels like any small mark
                found = {}
                for k in (sub[0], sub[-1]):
                    q = pts[k]
                    best = None
                    for cx_ in (int(q[0] // ATTACH_PX) + o for o in (-1, 0, 1)):
                        for cy_ in (int(q[1] // ATTACH_PX) + o for o in (-1, 0, 1)):
                            for c in cells.get((cx_, cy_), ()):
                                dist = math.hypot(c[0] - q[0], c[1] - q[1])
                                if dist <= ATTACH_PX and (best is None or dist < best[0]):
                                    best = (dist, c)
                    if best:
                        to = placed[best[1]]
                        found[k] = (to[0] - best[1][0], to[1] - best[1][1])
                a, b = pts[sub[0]], pts[sub[-1]]
                chord = (b[0] - a[0], b[1] - a[1])
                cc = chord[0] ** 2 + chord[1] ** 2
                if len(found) == 2 and cc > 1.0:
                    # each end with what it meets (a jamb and a leaf can move by different whole pixels), the move
                    # blended along the swing between them
                    (ax, ay), (bx, by) = found[sub[0]], found[sub[-1]]
                    for k in sub:
                        t = min(1.0, max(0.0, ((pts[k][0] - a[0]) * chord[0] + (pts[k][1] - a[1]) * chord[1]) / cc))
                        new[k] = (pts[k][0] + ax + t * (bx - ax), pts[k][1] + ay + t * (by - ay))
                    continue
                if found:
                    sx, sy = next(iter(found.values()))
                    for k in sub:
                        new[k] = (pts[k][0] + sx, pts[k][1] + sy)
                    continue
            disp = [(amap(*pts[k])[0] - pts[k][0], amap(*pts[k])[1] - pts[k][1]) for k in sub]
            span = max(max(dd[0] for dd in disp) - min(dd[0] for dd in disp), max(dd[1] for dd in disp) - min(dd[1] for dd in disp))
            if span < 1.0:
                sx = round(sum(dd[0] for dd in disp) / len(disp)); sy = round(sum(dd[1] for dd in disp) / len(disp))
                for k in sub:
                    new[k] = whole(pts[k]) if uses[pts[k]] > 1 else (pts[k][0] + sx, pts[k][1] + sy)
            else:
                for k in sub:
                    new[k] = whole(pts[k])
        ends = {}
        for e, c in _cubic_ends(it):
            ends.setdefault(e, []).append(c)
        controls = {c for cs in ends.values() for c in cs}
        for k, p in enumerate(pts):
            if k in controls or p not in snapped or n in shift:
                continue
            sx, sy = snapped[p]
            to = (new[k][0] if sx is None else sx, new[k][1] if sy is None else sy)
            for c in ends.get(k, ()):            # keep the curve's tangent: its control point moves with its end
                new[c] = (new[c][0] + to[0] - new[k][0], new[c][1] + to[1] - new[k][1])
            new[k] = to
            moved += 1
        if it.get("kind") != "arc":
            for k, p in enumerate(pts):
                if k not in controls and p not in placed:
                    placed[p] = new[k]
                    cells.setdefault((int(p[0] // ATTACH_PX), int(p[1] // ATTACH_PX)), []).append(p)
        it["points"] = [_p(x, y) for x, y in new]
    return moved


def _onto_page(d, base, page):
    """the drawing d, traced from the upload as it came, in the page's pixels (page: the page's own picture). base puts
    it there; with straightening on, by straighten's rules (whole pixels, straight lines set level and plumb), after any
    lean the page keeps is read from the drawing put there and from the page itself; with it off, exactly. It fails soft
    to the exact map."""
    if not STRAIGHTEN:
        return _mapped(d, base)
    H, W = page.shape
    try:
        plumb, level, _ = lean(_mapped(d, base), W, H, picture_lean(page))
        s = dict(d, items=[dict(it, points=[list(p) for p in it["points"]]) for it in d["items"]])
        n = straighten(s, W, H, plumb, level, base=base)
        print("faithful drawing traced unturned and put on the page (turned %.2f deg): plumb lines leaned %.2f deg, "
              "level lines %.2f deg; %d points set level or plumb" % (math.degrees(math.atan2(base[1], base[0])), plumb,
                                                                       level, n))
        return s
    except Exception as cause:
        print("faithful drawing put on the page exactly, not straightened: %s" % (str(cause)[:160] or type(cause).__name__))
        return _mapped(d, base)


ONE_X_SHARE = 3              # at its own size the trace needs about a third of the memory it needs at twice the size


def trace_at(g, up):
    """the faithful trace of g, worked at `up` x its size (2 as built; 1 for a page over the 2x limit)"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import faithful_trace
    was = faithful_trace.UP
    faithful_trace.UP = up
    try:
        return faithful_trace.trace_gray(g)
    finally:
        faithful_trace.UP = was


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opt = dict(a[2:].split("=", 1) for a in argv if a.startswith("--") and "=" in a)
    src, out_path = args[0], args[1]
    max_soft = float(opt.get("max-softness", "1.4")); max_px = int(float(opt.get("max-pixels", "4000000")))
    result = None
    try:
        page = read_gray(src)
        # --trace=<picture> --to-page=a,b,c,d,e,f: the upload as it came, before the app turned it square, is traced
        # instead of the page (turning resamples it: small lettering and thin lines blur, and the trace drew them as
        # grey blobs, s037 in the 31 Oct window), and its drawing is put into the page's pixels by that map
        base = tuple(float(v) for v in opt["to-page"].split(",")) if "trace" in opt else None
        if base is not None and len(base) != 6:
            raise ValueError("--to-page takes six numbers")
        g = read_gray(opt["trace"]) if base else page
        H, W = g.shape
        reason = None
        # No upload gives nothing (beta step 2.1): with FV_INVERT_DARK=1 a plan drawn light on a dark ground is traced
        # turned over, as dark ink on light paper (the app draws the trace on white), instead of being left
        if os.environ.get("FV_INVERT_DARK", "0") == "1" and light_on_dark(g):
            g = 255 - g
        if H * W > ONE_X_SHARE * max_px:
            reason = "picture too large for the faithful trace (%d x %d px)" % (W, H)
        elif paper_tone(g) < 128:
            reason = "picture drawn light on a dark ground; the faithful trace needs dark ink on light paper"
        elif softness(g) > max_soft:
            reason = "picture not crisp enough for the faithful trace (edge softness %.2f)" % softness(g)
        if reason:
            result = {"skipped": reason}
        else:
            # over the limit at twice its size, a page is traced at its own size (close lines a pixel apart may merge,
            # but it is drawn) rather than left to stage 1
            d = drawing(trace_at(g, 1 if H * W > max_px else 2))
            result = d if d else {"skipped": "faithful trace has too many shapes"}
            if d and base:
                result = _onto_page(d, base, page)
            elif d and STRAIGHTEN:
                try:                                             # fails soft: the drawing as traced
                    plumb, level, _ = lean(d, W, H, picture_lean(g))
                    if plumb or level:
                        s = dict(d, items=[dict(it, points=[list(p) for p in it["points"]]) for it in d["items"]])
                        n = straighten(s, W, H, plumb, level)
                        result = s
                        print("faithful drawing straightened: plumb lines leaned %.2f deg, level lines %.2f deg; %d "
                              "points set level or plumb" % (plumb, level, n))
                except Exception as cause:
                    print("faithful drawing not straightened: %s" % (str(cause)[:160] or type(cause).__name__))
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
