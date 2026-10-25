"""faithful_trace.py <image> <out.svg> [--drop-text] [--json=<out.json>]: a clean floor plan copied as clean vectors.

No recognition: nothing is read as a room, a door or a wall - what is drawn is copied, as clean geometry.
  - solid fills (walls drawn solid, columns, black blocks) -> polygons with straight edges, an edge within SNAP_DEG of
    level or plumb made exactly level or plumb, its corners where those edges meet;
  - every thin stroke (lines, outlines, door leaves and swings, fixtures, hatching, dashes) -> followed along its
    centre and fitted as straight segments and circular arcs (each within FIT_PX of the drawn centre), a segment within
    SNAP_DEG of level or plumb made exactly so, drawn at the stroke's own width;
  - lettering is copied as it is drawn, like any other line work; --drop-text leaves out the marks that stand in a row
    like the letters of a word and read as one (tesseract), as an experiment;
  - (r8) in a soft picture (a low-resolution plan enlarged into a brochure), lettering that runs together, or into the
    lighter line work under it (a room's name on its floor's stripes), is copied letter by letter by its outline, and
    the line work under it is traced without it (letters_over_lines).
Output: an SVG in the image's pixel coordinates, one element per wall polygon, segment and arc."""
import json, math, os, sys
import cv2, numpy as np
from skimage.morphology import skeletonize
from skimage import measure

def cross2(a, b):
    a = np.asarray(a, float); b = np.asarray(b, float)
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


FIT_PX = 0.75          # a straight segment or an arc must lie within this of the stroke's drawn centre
SNAP_DEG = 2.0         # within this of level / plumb -> exactly level / plumb ...
SNAP_PX = 1.0          # ... where making it so moves its ends no more than this (a long wall drawn 2 degrees off stays so)
SOLID_R = 2.6          # ink at least this far from paper on every side (a band over ~5 px wide) is a solid fill
EDGE_TOL = 0.6         # polygon simplification on the solid fills' sub-pixel outlines
INK = 0.2              # ink: at least this share of the way from the paper to the darkest ink
FAINT = float(__import__("os").environ.get("FT_FAINT", "0.08"))   # fainter ink counts where it joins ink and is the darkest across itself
CORE = 0.55            # ... and, between two darker lines, at least this share of the darkest ink within 2 px


def darkness(g):
    hist = np.bincount(g.ravel(), minlength=256)
    paper = int(np.argmax(hist))
    darkest = float(np.percentile(g[g < paper - 40], 1)) if (g < paper - 40).any() else 0.0
    return np.clip((paper - g.astype(np.float32)) / max(1.0, paper - darkest), 0, 1), paper, darkest


def valleys(d, reach=2, diagonal=True):
    """pixels with darker ink on both sides (1 or 2 px away, across any of four directions): the paper between two
    close lines, greyed by the rendering"""
    H, W = d.shape
    P = reach * PX
    pad = np.pad(d, P)
    v = np.zeros((H, W), bool)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)) if diagonal else ((0, 1), (1, 0)):
        for k in range(1, P + 1):
            a = pad[P + k * dy:P + k * dy + H, P + k * dx:P + k * dx + W]
            b = pad[P - k * dy:P - k * dy + H, P - k * dx:P - k * dx + W]
            v |= (a >= d + 0.15) & (b >= d + 0.15)
    return v


def part_corners(m, d, vmask):
    """two lines that touch only corner to corner across darkened paper (two close diagonals: both pixels beside the
    touch are valleys, paper greyed between two darker lines) are parted there: the two touching pixels are cleared.
    A single anti-aliased line's step is not touched (its side pixels are its own edge, not a valley)."""
    m = m.copy()
    a, b, c, e = m[:-1, :-1], m[:-1, 1:], m[1:, :-1], m[1:, 1:]
    # paper greyed between two lines, not clean paper: lines on opposite sides of it, level or plumb, within 1 px (the
    # grey pixel in a single line's staircase step has the line beside it and below it, which at 2 x reads as a
    # diagonal valley; a hatch stroke's edge has the next stroke 3 px off)
    grey = valleys(d, 1, diagonal=False) & (d >= INK)
    vb, vc, va, ve = grey[:-1, 1:], grey[1:, :-1], grey[:-1, :-1], grey[1:, 1:]
    main = (a > 0) & (e > 0) & (b == 0) & (c == 0) & vb & vc
    anti = (b > 0) & (c > 0) & (a == 0) & (e == 0) & va & ve
    ys, xs = np.nonzero(main)
    m[ys, xs] = 0; m[ys + 1, xs + 1] = 0
    ys, xs = np.nonzero(anti)
    m[ys, xs + 1] = 0; m[ys + 1, xs] = 0
    return m


def bridge_gaps(ink, d, cleared):
    """a light curve's anti-aliased pixels are uneven, and the lighter ones drop out of the ink, leaving the curve in
    pieces a pixel apart: a faint pixel between two pieces (within 1 px of both) is put back, unless it is paper
    greyed between two lines (a level or plumb valley) or a touch that was parted on purpose"""
    cand = (d > FAINT) & (ink == 0) & ~valleys(d, 2, diagonal=False) & (cleared == 0)
    if not cand.any():
        return ink
    ink = ink.copy()
    K = np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)
    big = np.float32(1e7)
    # only between pieces of like darkness (a light X's end and the black box round it stay apart)
    di = np.where(ink > 0, d, 0).astype(np.float32)
    hi = cv2.dilate(di, K)
    lo = cv2.erode(np.where(ink > 0, d, 9.0).astype(np.float32), K)
    cand &= hi <= 1.5 * lo
    for _ in range(2):
        n, lab = cv2.connectedComponents(ink, connectivity=8)
        lf = lab.astype(np.float32)
        mx = cv2.dilate(lf, K)
        mn = cv2.erode(np.where(lab > 0, lf, big), K)
        add = cand & (mx > 0) & (mn < big) & (mx != mn) & (ink == 0)
        if not add.any():
            break
        ink[add] = 1
    return ink


MOTTLE = os.environ.get("FT_MOTTLE", "0") == "1"   # (r7) a mottled grey band (a double hairline merged by the rendering) kept whole


def mottle_fill(ink, d, vmask):
    """(r7) a grey outline drawn as two hairlines a pixel apart (a toilet's, a pillow's, a chair's) renders as a mottled
    band - dark and light pixels in turn - and the light ones fall out of the ink (the rule that keeps close lines apart
    takes each for the paper between two lines), leaving the outline in crumbs. A light pixel inside such a band (a gap
    of a pixel, which closing the ink fills) is put back, unless it lies in a channel of greyed paper running along
    between two lines (paper between two parallel lines a pixel apart, between hatch strokes): a valley 4 px or longer."""
    K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * PX + 1, 3 * PX + 1))
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, K)
    ds = cv2.blur(d.astype(np.float32), (3 * PX, 3 * PX))
    cand = (closed > 0) & (ink == 0) & (d > FAINT) & (ds >= 0.2)
    if not cand.any():
        return ink
    vv = (vmask & (d > FAINT)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(vv, 8)
    longv = np.zeros(n, bool)
    longv[1:] = np.maximum(st[1:, 2], st[1:, 3]) >= 4 * PX
    protect = cv2.dilate(longv[lab].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    add = cand & ~protect
    if not add.any():
        return ink
    # never between two larger pieces of line work (a chair's inner outline and its outer one a few pixels off): only
    # crumbs are joined, to each other or to one piece
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    large = np.zeros(n2, bool); large[1:] = np.maximum(st2[1:, 2], st2[1:, 3]) > 8 * PX
    lf = np.where(large[lab2], lab2, 0).astype(np.float32)
    big = np.float32(1e7)
    Kn = np.ones((3 * PX + 1, 3 * PX + 1), np.uint8)
    mx = cv2.dilate(lf, Kn); mn = cv2.erode(np.where(lf > 0, lf, big), Kn)
    add &= ~((mx > 0) & (mn < big) & (mx != mn))
    out = ink.copy(); out[add] = 1
    return out


RECTS = os.environ.get("FT_RECTS", "1") == "1"   # (r7) narrow hollow rectangles drawn as rectangles


def hollow_rects(stroke, d, fill, marks=None):
    """(r7) a narrow hollow rectangle drawn in thin lines (a hanger's bar, a sliding-door panel, a narrow box): the
    paper it encloses is a narrow hole in the stroke ink - at most 5 px across, three times as long, filling its
    rectangle (90 %) - ringed by a thin line (2 px or less). Its sides are too short or too close for the line readers,
    which draw it as loose sides or a bar. Returns each as (corners of its centre-line rectangle, line width, darkness)."""
    H, W = stroke.shape
    free = (stroke == 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    out = []
    near_fill = fill > 0
    _rb = [float(v) for v in os.environ["FT_RDBG"].split(",")] if os.environ.get("FT_RDBG") else None
    def _rj(msg):
        if _rb and _rb[0] <= x / PX <= _rb[2] and _rb[1] <= y / PX <= _rb[3]:
            print("rect?", x / PX, y / PX, w, h, msg)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if x == 0 or y == 0 or x + w >= W or y + h >= H:
            continue
        if area < 2 * PX * PX or max(w, h) > 120 * PX or min(w, h) > 12 * PX:
            continue
        m = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if not cnts:
            continue
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(cnts[0] + np.array([[x, y]]))
        rw, rh = rw + 1.0, rh + 1.0                                     # (pixel centres to pixel edges)
        cx, cy = cx + 0.5, cy + 0.5                                     # (pixel (x, y) covers [x, x + 1))
        am = ang % 90.0
        if min(am, 90.0 - am) <= SNAP_DEG:
            ang = round(ang / 90.0) * 90.0                              # (level and plumb sides made exactly so)
        short, long_ = min(rw, rh), max(rw, rh)
        if short > 5 * PX or long_ < 3 * short or long_ < 12 * PX or area < 0.9 * rw * rh:   # (a letter's counter is shorter)
            _rj("shape %.1f x %.1f fill %.2f" % (rw, rh, area / (rw * rh))); continue
        # the ring: the stroke ink within 3 px of the hole, none of it a solid fill's
        ya, yb, xa, xb = max(0, y - 3 * PX), min(H, y + h + 3 * PX), max(0, x - 3 * PX), min(W, x + w + 3 * PX)
        hole = np.zeros((yb - ya, xb - xa), np.uint8); hole[y - ya:y - ya + h, x - xa:x - xa + w] = m
        if near_fill[ya:yb, xa:xb][cv2.dilate(hole, np.ones((3 * PX, 3 * PX), np.uint8)) > 0].any():
            _rj("near a fill"); continue
        around = (cv2.dilate(hole, np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)) > 0) & (hole == 0)
        st_ = stroke[ya:yb, xa:xb] > 0
        if marks is not None and long_ < 10 * PX and (marks[ya:yb, xa:xb][around] > 0).mean() > 0.2:
            _rj("a letter's counter"); continue                 # (a D or an O in a narrow lettering: its counter)
        # a closed shape standing alone (a letter D or O, a small box symbol) is copied as drawn, by its outline; a
        # hanger's bar, a door panel, a loop on a stem is joined to the line work round it
        ring_px = (around & st_)
        ys_r, xs_r = np.nonzero(ring_px)
        if len(ys_r):
            sy, sx = int(ys_r[0]) + ya, int(xs_r[0]) + xa
            x2, y2 = max(0, x - 6 * PX), max(0, y - 6 * PX)
            x3, y3 = min(W, x + w + 6 * PX), min(H, y + h + 6 * PX)
            win_ = (stroke[y2:y3, x2:x3] > 0).astype(np.uint8)
            nn_, ll_ = cv2.connectedComponents(win_, connectivity=8)
            comp_ = ll_ == ll_[sy - y2, sx - x2]
            cys, cxs = np.nonzero(comp_)
            if (cxs.min() > 0 and cys.min() > 0 and cxs.max() < win_.shape[1] - 1 and cys.max() < win_.shape[0] - 1
                    and cxs.min() + x2 >= x - 3 * PX and cxs.max() + x2 <= x + w + 3 * PX
                    and cys.min() + y2 >= y - 3 * PX and cys.max() + y2 <= y + h + 3 * PX):
                _rj("stands alone"); continue
        if around.sum() == 0 or st_[around].mean() < 0.9:
            _rj("ring %.2f" % (st_[around].mean() if around.sum() else 0)); continue   # (an open shape: the hole leaks)
        # the line's width: the ink outward from the hole, read along the long sides' middles
        th = []
        a = math.radians(ang)
        ux, uy = (math.cos(a), math.sin(a)) if rw >= rh else (-math.sin(a), math.cos(a))   # along
        vx, vy = -uy, ux                                                                 # across
        for t_ in np.linspace(-0.3, 0.3, 7) * long_:
            for sgn in (-1, 1):
                px_, py_ = cx + ux * t_ + vx * sgn * short / 2.0, cy + uy * t_ + vy * sgn * short / 2.0
                k = 0.0; tot = 0.0; mx = 0.0
                while k < 4 * PX:
                    qx, qy = int(math.floor(px_ + vx * sgn * (k + 0.5))), int(math.floor(py_ + vy * sgn * (k + 0.5)))
                    if not (0 <= qx < W and 0 <= qy < H) or not stroke[qy, qx]:
                        break
                    tot += float(d[qy, qx]); mx = max(mx, float(d[qy, qx])); k += 1.0
                th.append((k, tot / mx if mx > 0 else 0.0))
        ks = np.array([t[0] for t in th]); tots = np.array([t[1] for t in th])
        if (ks == 0).mean() > 0.2:
            _rj("no line across"); continue
        lw = float(np.median(tots[ks > 0]))                     # (its ink across, faint edges counted by their share)
        # both long sides thin and of one weight (a heavy wall line with a thin line beside it is not a rectangle)
        sides_ = [tots[1::2][ks[1::2] > 0], tots[0::2][ks[0::2] > 0]]
        if any(len(v) == 0 for v in sides_):
            _rj("a side without ink"); continue
        w1, w2 = float(np.median(sides_[0])), float(np.median(sides_[1]))
        if max(w1, w2) > 2.0 * PX or max(w1, w2) > 1.6 * min(w1, w2) + 0.25 * PX:
            _rj("sides %.2f / %.2f" % (w1, w2)); continue
        if lw > 2.5 * PX or lw < 0.5 * PX:
            _rj("width %.2f" % lw); continue                    # (a heavy frame is the line readers')
        dark = float(np.percentile(d[ya:yb, xa:xb][around & st_], 90))
        half = (short + lw) / 2.0, (long_ + lw) / 2.0
        # its long sides end at its short ones on one end at least: two long lines that run on past both ends (a door's
        # frame lines with the panel between them, two parallel walls with jambs across) enclose paper, but are lines
        runs_on = 0
        for su in (-1, 1):
            both = True
            for sv in (-1, 1):
                bx = cx + ux * su * half[1] + vx * sv * half[0]; by = cy + uy * su * half[1] + vy * sv * half[0]
                hit = 0
                for kk in range(1, 7):
                    qx = int(math.floor(bx + ux * su * (lw / 2.0 + kk * PX))); qy = int(math.floor(by + uy * su * (lw / 2.0 + kk * PX)))
                    hit += 0 <= qx < W and 0 <= qy < H and stroke[qy, qx] > 0
                both = both and hit >= 5
            runs_on += both
        if runs_on == 2:
            _rj("runs on"); continue
        _rj("RECT w %.2f" % lw)
        corners = []
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corners.append((cx + ux * su * half[1] + vx * sv * half[0], cy + uy * su * half[1] + vy * sv * half[0]))
        kr = 2 * int(math.ceil(lw + 0.5 * PX)) + 1
        ring = (cv2.dilate(hole, np.ones((kr, kr), np.uint8)) > 0) & (hole == 0) & st_
        out.append({"corners": np.array(corners), "w": lw, "dark": max(0.2, dark), "ring": (ya, xa, ring)})
    return out


def merge_rects(rects):
    """(r7) two hollow rectangles end to end - one rectangle a line runs across (a hanger's bar on its rail) - of one
    width, in line, their facing sides within the line's width and 2 px of each other: one rectangle"""
    rects = [dict(r) for r in rects]
    changed = True
    while changed:
        changed = False
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                A, B = rects[i]["corners"], rects[j]["corners"]
                ua = A[1] - A[0]; la = float(np.linalg.norm(ua)); va = A[3] - A[0]; wa = float(np.linalg.norm(va))
                ub = B[1] - B[0]; lb = float(np.linalg.norm(ub)); wb = float(np.linalg.norm(B[3] - B[0]))
                # long axis of each
                if la < wa:
                    ua, la, va, wa = va, wa, ua, la
                if lb < wb:
                    ub, lb = B[3] - B[0], wb; wb = float(np.linalg.norm(B[1] - B[0]))
                u = ua / la
                if abs(float(np.dot(u, ub / lb))) < math.cos(math.radians(3)) or abs(wa - wb) > 1.0 * PX:
                    continue
                ca, cb = A.mean(0), B.mean(0)
                if abs(float(cross2(u, cb - ca))) > 1.0 * PX:
                    continue
                along = abs(float(np.dot(cb - ca, u)))
                gap = along - (la + lb) / 2.0
                if gap > max(rects[i]["w"], rects[j]["w"]) + 2 * PX:
                    continue
                P = np.vstack([A, B]); t = (P - ca) @ u
                n_ = np.array([-u[1], u[0]]); half = (wa + wb) / 4.0
                lo, hi = float(t.min()), float(t.max())
                C = [ca + u * lo - n_ * half, ca + u * hi - n_ * half, ca + u * hi + n_ * half, ca + u * lo + n_ * half]
                rects[i] = {"corners": np.array(C), "w": (rects[i]["w"] + rects[j]["w"]) / 2.0,
                            "dark": max(rects[i]["dark"], rects[j]["dark"])}
                del rects[j]; changed = True
                break
            if changed:
                break
    return rects


def _explained(P, rects, tol_of):
    """(r7) whether all the points lie on one of the rectangles' outlines (within tol_of(r)); rectangles whose box
    does not hold the points are not tried"""
    lo, hi = P.min(0), P.max(0)
    for r in rects:
        bl, bh = r["corners"].min(0) - r["w"] - 2 * PX, r["corners"].max(0) + r["w"] + 2 * PX
        if lo[0] < bl[0] or lo[1] < bl[1] or hi[0] > bh[0] or hi[1] > bh[1]:
            continue
        if np.all(_dist_to_rect(P, r["corners"]) <= tol_of(r)):
            return True
    return False


def _dist_to_rect(P, R):
    """the distance of each point to the rectangle's outline (corners in order)"""
    best = np.full(len(P), np.inf)
    for k in range(4):
        a, b = R[k], R[(k + 1) % 4]; v = b - a
        t = np.clip(((P - a) @ v) / max(1e-9, float(v @ v)), 0.0, 1.0)
        best = np.minimum(best, np.linalg.norm(P - (a + t[:, None] * v), axis=1))
    return best


def rect_outlines(rects, segs, polys):
    """(r7) each hollow rectangle drawn as its four sides; the strokes and outlines it explains (its loose sides and
    caps, crumbs at its corners) dropped: every point of them within the line's half width (and FIT_PX) of its outline"""
    keep = []
    for e in segs:
        P = _seg_points(e) if e["k"] != "dot" else np.asarray(e["c"], float)[None]
        if not _explained(P, rects, lambda r: r["w"] / 2.0 + e["w"] / 2.0 + FIT_PX):
            keep.append(e)
    pk = []
    for p in polys:
        if p.get("mark"):
            P = np.array([q for ring in p["rings"] for q in ring], float)
            if _explained(P, rects, lambda r: r["w"] + FIT_PX):
                continue
        pk.append(p)
    longs = [e for e in keep if e["k"] == "line" and np.linalg.norm(e["b"] - e["a"]) >= 4 * PX]
    for r in rects:
        R = r["corners"]
        for k in range(4):
            a, b = R[k].copy(), R[(k + 1) % 4].copy()
            # a side a line already draws (a frame line running on past the rectangle) is not drawn twice
            v = b - a; Lv = float(np.linalg.norm(v)); u = v / max(1e-9, Lv)
            S = a[None] + np.linspace(0.05, 0.95, 10)[:, None] * v[None]
            cov = np.zeros(len(S), bool)
            for e in longs:
                if abs(float(np.dot(_dir(e), u))) < math.cos(math.radians(3)):
                    continue
                ev = e["b"] - e["a"]; t = ((S - e["a"]) @ ev) / max(1e-9, float(ev @ ev))
                dd = np.abs(cross2(_dir(e), S - e["a"]))
                cov |= (t >= -0.02) & (t <= 1.02) & (dd <= FIT_PX + 0.25 * PX)
            if cov.mean() >= 0.9:
                continue
            keep.append({"k": "line", "a": a, "b": b, "w": r["w"], "dark": r["dark"], "na": -1, "nb": -1, "rect": True})
    return keep, pk


CURVES = os.environ.get("FT_CURVES", "1") == "1"   # (r7) light curves made whole: arcs run on, merged, gaps bridged


def _end(e, end):
    """an end of a line or an arc: its point and the direction it leaves the stroke"""
    if e["k"] == "line":
        u = _dir(e)
        return (e["a"].copy(), -u) if end == "a" else (e["b"].copy(), u)
    th = e["a0"] if end == "a" else e["a1"]
    sg = 1.0 if e["a1"] >= e["a0"] else -1.0
    t = np.array([-math.sin(th), math.cos(th)])
    p = e["c"] + e["r"] * np.array([math.cos(th), math.sin(th)])
    return p, (-sg * t if end == "a" else sg * t)


def _seg_label_map(segs, shape):
    """each stroke drawn into a label image (its index + 1), as wide as it is plus a pixel each side"""
    lab = np.zeros(shape, np.int32)
    for i, e in enumerate(segs):
        P = _seg_points(e)
        th = max(1, int(math.ceil(e["w"])) + 2)
        if len(P) == 1:
            cv2.circle(lab, (int(P[0][0]), int(P[0][1])), max(1, th // 2), i + 1, -1)
            continue
        pts = np.round(P * 4).astype(np.int32)
        cv2.polylines(lab, [pts], False, i + 1, th, cv2.LINE_8, shift=2)
    return lab


def close_curves(segs, d, solid):
    """(r7) a light curve's ends fall where its anti-aliased ink fades, so it comes out short or in pieces (a door swing
    stopping short of the jamb, a round table or a lamp's circle with gaps, a pillow's or a cushion's outline broken):
      - an arc's free end runs on along its circle while faint ink (a third of its own darkness) does, up to 60 degrees,
        stopping at a darker line or another stroke;
      - arcs on one circle (centre and radius within 1.5 px), of one weight and darkness, are one arc where the ink runs
        on between them (or the gap is under 2 px): a circle closed all round is drawn closed;
      - two free ends of one weight facing each other within 4 px, faint ink between them, are joined."""
    H, W = d.shape
    dmx = cv2.dilate(d.astype(np.float32), np.ones((3, 3), np.uint8))
    sol = solid > 0
    def at(p):
        x, y = int(math.floor(p[0])), int(math.floor(p[1]))
        if 0 <= x < W and 0 <= y < H:
            return float(dmx[y, x]), bool(sol[y, x])
        return 0.0, True
    lab = _seg_label_map(segs, (H, W))
    def owner(p):
        x, y = int(math.floor(p[0])), int(math.floor(p[1]))
        return int(lab[y, x]) - 1 if 0 <= x < W and 0 <= y < H else -2
    tip = lambda e, end: e.get("na" if end == "a" else "nb", 0) != -1
    def attached(i, end):
        p, u = _end(segs[i], end)
        for k in (0.5, 1.0, 1.5):
            o = owner(p + u * (segs[i]["w"] / 2.0 + k * PX))
            if o >= 0 and o != i:
                return True
        return False
    # 1. arcs run on along their circle
    arc_ends = []
    for i, e in enumerate(segs):
        if e["k"] == "arc":
            for th_ in (e["a0"], e["a1"]):
                arc_ends.append((i, e["c"] + e["r"] * np.array([math.cos(th_), math.sin(th_)])))
    AE = np.array([q for _, q in arc_ends]) if arc_ends else np.zeros((0, 2))
    AI = np.array([k for k, _ in arc_ends]) if arc_ends else np.zeros(0, int)
    for i, e in enumerate(segs):
        if e["k"] != "arc" or e["r"] < 3 * PX:
            continue
        sg = 1.0 if e["a1"] >= e["a0"] else -1.0
        thr = max(0.07, 0.33 * e["dark"])
        for end in ("a", "b"):
            if not tip(e, end) or attached(i, end):
                continue
            key = "a0" if end == "a" else "a1"
            step = 0.5 * PX / e["r"] * (-sg if end == "a" else sg)
            th = e[key]; last = th; miss = 0; n_ = 0
            while n_ * abs(step) < math.radians(35):
                n_ += 1
                th += step
                q = e["c"] + e["r"] * np.array([math.cos(th), math.sin(th)])
                v, insol = at(q)
                o = owner(q)
                if len(AE):
                    near_ = (np.linalg.norm(AE - q, axis=1) <= 2 * PX + e["w"]) & (AI != i)
                    if near_.any():
                        last = th; break                        # (it meets another arc's end: they join there)
                if insol or (o >= 0 and o != i) or v >= 1.8 * e["dark"] + 0.1:
                    if o >= 0 and o != i:
                        last = th                               # (it runs up to the stroke it meets)
                    break
                if v >= thr:
                    last = th; miss = 0
                else:
                    miss += 1
                    if miss > PX:
                        break
            if abs(last - e[key]) * e["r"] >= 1.5 * PX:
                e[key] = last
    # 2. arcs on one circle made one arc
    arcs = [i for i, e in enumerate(segs) if e["k"] == "arc" and e["r"] >= 3 * PX]
    dead = set()
    def interval(e):
        a0, a1 = (e["a0"], e["a1"]) if e["a1"] >= e["a0"] else (e["a1"], e["a0"])
        return a0, a1
    def gap_inked(c, r, t0, t1, dark, mine=()):
        L = (t1 - t0) * r
        if L <= 2 * PX:
            return True
        ts = np.linspace(t0, t1, max(3, int(L / (0.5 * PX))))
        hit = 0; other = 0
        for t in ts:
            q = c + r * np.array([math.cos(t), math.sin(t)])
            v, _ = at(q)
            o = owner(q)
            if o >= 0 and o not in mine:
                so = segs[o]
                tang = np.array([-math.sin(t), math.cos(t)])
                if so["k"] == "line" and abs(float(np.dot(_dir(so), tang))) <= math.cos(math.radians(45)):
                    hit += 1                                    # (a line crossing the circle: the circle runs on under it)
                else:
                    other += 1                                  # (ink another stroke already draws along it)
            elif v >= max(0.07, 0.33 * dark):
                hit += 1
        return hit >= 0.6 * len(ts) and other <= 0.3 * len(ts)
    absorbed = {i: {i} for i in arcs}
    changed = True
    while changed:
        changed = False
        for ii in range(len(arcs)):
            i = arcs[ii]
            if i in dead:
                continue
            e = segs[i]
            for jj in range(ii + 1, len(arcs)):
                j = arcs[jj]
                if j in dead:
                    continue
                f = segs[j]
                tol = 1.0 * PX + 0.02 * max(e["r"], f["r"])
                if np.linalg.norm(e["c"] - f["c"]) > tol or abs(e["r"] - f["r"]) > tol:
                    continue
                # both on one circle (two concentric arcs a few pixels apart - a curved double line - are not)
                Q = np.vstack([_seg_points(e), _seg_points(f)])
                cf = fit_circle(Q)
                if cf is None or cf[3] > 1.5 * FIT_PX:
                    continue
                if max(e["w"], f["w"]) > 1.6 * min(e["w"], f["w"]) + 0.3 * PX or \
                        max(e["dark"], f["dark"]) > 1.6 * min(e["dark"], f["dark"]) + 0.05:
                    continue
                c = np.array([cf[0], cf[1]]); r = cf[2]
                ea0, ea1 = interval(e); fa0, fa1 = interval(f)
                # f's interval moved by whole turns to sit after e's
                best = None
                for kk in (-1, 0, 1):
                    g0, g1 = fa0 + 2 * math.pi * kk, fa1 + 2 * math.pi * kk
                    if g0 >= ea1 - 0.05:
                        gap = (ea1, g0)
                    elif ea0 >= g1 - 0.05:
                        gap = (g1, ea0)
                    else:
                        gap = (0.0, 0.0)                        # (overlapping)
                    span = max(ea1, g1) - min(ea0, g0)
                    if best is None or span < best[0]:
                        best = (span, g0, g1, gap)
                span, g0, g1, gap = best
                if span > 2 * math.pi + 0.3:
                    continue
                if gap[1] - gap[0] > 0 and not gap_inked(c, r, gap[0], gap[1], max(e["dark"], f["dark"]), absorbed[i] | absorbed[j]):
                    continue
                lo, hi = min(ea0, g0), max(ea1, g1)
                if hi - lo >= 2 * math.pi - 0.02:
                    lo, hi = lo, lo + 2 * math.pi
                else:
                    # a circle nearly closed: closed, where its last gap is inked too
                    rest_ = 2 * math.pi - (hi - lo)
                    if rest_ * r <= 12 * PX and gap_inked(c, r, hi, lo + 2 * math.pi, max(e["dark"], f["dark"]), absorbed[i] | absorbed[j]):
                        hi = lo + 2 * math.pi
                wl = e["r"] * (ea1 - ea0) + 1e-6; wf = f["r"] * (g1 - g0) + 1e-6
                e.update(c=c, r=r, a0=lo, a1=hi, w=(e["w"] * wl + f["w"] * wf) / (wl + wf), dark=max(e["dark"], f["dark"]),
                         na=0, nb=0)
                dead.add(j); absorbed[i] |= absorbed[j]; changed = True
    segs = [e for k, e in enumerate(segs) if k not in dead]
    # 3. free ends facing each other across a short faint gap joined
    lab = _seg_label_map(segs, (H, W))
    ends = []
    for i, e in enumerate(segs):
        if e["k"] not in ("line", "arc"):
            continue
        if e["k"] == "arc" and abs(e["a1"] - e["a0"]) >= 2 * math.pi - 0.02:
            continue
        for end in ("a", "b"):
            if tip(e, end) and not attached(i, end):
                p, u = _end(e, end)
                ends.append((i, end, p, u))
    used_ = set(); add = []
    cell = 8 * PX
    egrid = {}
    for k2, (j, endj, q, v) in enumerate(ends):
        egrid.setdefault((int(q[0] // cell), int(q[1] // cell)), []).append(k2)
    for k, (i, end, p, u) in enumerate(ends):
        if (i, end) in used_:
            continue
        best = None
        gx_, gy_ = int(p[0] // cell), int(p[1] // cell)
        near_k = [k2 for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k2 in egrid.get((gx_ + dx, gy_ + dy), [])]
        for k2 in near_k:
            j, endj, q, v = ends[k2]
            if j == i or (j, endj) in used_ or k2 == k:
                continue
            g = q - p; L = float(np.linalg.norm(g))
            if L < 0.5 * PX or L > 4 * PX + 0.5 * (segs[i]["w"] + segs[j]["w"]):
                continue
            gu = g / L
            if float(np.dot(u, gu)) < math.cos(math.radians(40)) or float(np.dot(v, -gu)) < math.cos(math.radians(40)):
                continue
            e, f = segs[i], segs[j]
            if max(e["w"], f["w"]) > 1.6 * min(e["w"], f["w"]) + 0.3 * PX or \
                    max(e["dark"], f["dark"]) > 1.6 * min(e["dark"], f["dark"]) + 0.05:
                continue
            ts = np.linspace(0.0, 1.0, max(3, int(L / (0.5 * PX)) + 1))
            vals = [at(p + gu * L * t)[0] for t in ts]
            if np.mean(np.array(vals) >= max(0.07, 0.33 * min(e["dark"], f["dark"]))) < 0.7:
                continue
            if best is None or L < best[0]:
                best = (L, j, endj, q)
        if best:
            L, j, endj, q = best
            e, f = segs[i], segs[j]
            add.append({"k": "line", "a": p.copy(), "b": q.copy(), "w": (e["w"] + f["w"]) / 2.0,
                        "dark": (e["dark"] + f["dark"]) / 2.0, "na": -1, "nb": -1})
            used_.add((i, end)); used_.add((j, endj))
    return segs + add


DASHES = os.environ.get("FT_DASHES", "1") == "1"   # (r7) the dashes (and dots) of a dashed or dash-dot line set on one line


def align_dashes(segs, polys=None):
    """(r7) a dashed or dash-dot line is traced dash by dash, each fitted on its own pixels, so the dashes wobble off
    the line and vary in weight (a shaft's dashed cross, a dash-dot centre line). Three or more short pieces in a row -
    two dashes at least, each within 6 degrees of the others' direction, within a pixel of one line, no more than three
    dash lengths (and 15 px) apart - are set on the line fitted through them all, at their common weight and darkness."""
    # (the dots of a dash-dot line, copied as small marks, take part as dots)
    mdots = {}
    n0 = len(segs)
    segs = list(segs)
    for pi, p in enumerate(polys or []):
        if not p.get("mark") or len(p["rings"]) != 1:
            continue
        R = np.asarray(p["rings"][0], float)
        ext = R.max(0) - R.min(0)
        if max(ext) > 4.5 * PX or max(ext) < 0.8 * PX or max(ext) > 2.0 * max(min(ext), 0.5 * PX):
            continue                                            # (a dot: about as wide as long)
        mdots[len(segs)] = pi
        segs.append({"k": "dot", "c": (R.max(0) + R.min(0)) / 2.0, "w": float(min(ext)), "dark": 1.0,
                     "mdot": pi, "ext": R})
    idx = [i for i, e in enumerate(segs) if (e["k"] == "line" and np.linalg.norm(e["b"] - e["a"]) <= 14 * PX and not e.get("rect"))
           or e["k"] == "dot"]
    if len(idx) < 3:
        return segs[:n0], polys
    mid = {i: ((segs[i]["a"] + segs[i]["b"]) / 2.0 if segs[i]["k"] == "line" else np.asarray(segs[i]["c"], float)) for i in idx}
    grid = {}
    for i in idx:
        grid.setdefault((int(mid[i][0] // (16 * PX)), int(mid[i][1] // (16 * PX))), []).append(i)
    parent = {i: i for i in idx}
    def root(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for i in idx:
        e = segs[i]
        if e["k"] != "line":
            continue
        u = _dir(e); L = float(np.linalg.norm(e["b"] - e["a"]))
        if L < 1.5 * PX:
            continue
        gx, gy = int(mid[i][0] // (16 * PX)), int(mid[i][1] // (16 * PX))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((gx + dx, gy + dy), []):
                    if j == i:
                        continue
                    f = segs[j]
                    if f["k"] == "line":
                        if abs(float(np.dot(u, _dir(f)))) < math.cos(math.radians(6)):
                            continue
                        Lf = float(np.linalg.norm(f["b"] - f["a"]))
                        pts = [f["a"], f["b"]]
                    else:
                        Lf = 0.0; pts = [mid[j]]
                    if max(abs(float(cross2(u, q - e["a"]))) for q in pts) > 1.0 * PX + 0.5 * max(e["w"], f["w"]):
                        continue
                    # the gap between them along the line
                    t = [float(np.dot(q - e["a"], u)) for q in pts]
                    gap = max(0.0, min(t) - L, -max(t))
                    if gap > min(15 * PX, 3 * max(L, Lf, 2 * PX)) or gap < 0.5 * PX and f["k"] == "line":
                        continue                                # (touching pieces are a line's, merged before)
                    if "mdot" not in f and max(e["dark"], f["dark"]) > 1.6 * min(e["dark"], f["dark"]) + 0.05:
                        continue
                    if f["k"] == "line" and max(e["w"], f["w"]) > 1.4 * min(e["w"], f["w"]) + 0.25 * PX:
                        continue                                # (dashes of one line are of one weight)
                    ra, rb = root(i), root(j)
                    if ra != rb:
                        parent[rb] = ra
    groups = {}
    for i in idx:
        groups.setdefault(root(i), []).append(i)
    for g in groups.values():
        lines = [i for i in g if segs[i]["k"] == "line"]
        if len(g) < 3 or sum(1 for i in lines if np.linalg.norm(segs[i]["b"] - segs[i]["a"]) >= 4 * PX) < 2:
            continue                                            # (two real dashes at least: stipple is not a dashed line)
        P = []; Wt = []
        for i in g:
            e = segs[i]
            if e["k"] == "line":
                L = float(np.linalg.norm(e["b"] - e["a"]))
                P += [e["a"], e["b"]]; Wt += [L, L]
            else:
                P.append(mid[i]); Wt.append(1.0)
        P = np.array(P); Wt = np.array(Wt)
        c = (P * Wt[:, None]).sum(0) / Wt.sum()
        C = ((P - c) * Wt[:, None]).T @ (P - c)
        vals, vecs = np.linalg.eigh(C)
        u = vecs[:, 1]; nrm = vecs[:, 0]
        if np.max(np.abs((P - c) @ nrm)) > 0.5 * PX + 0.25 * max(segs[i]["w"] for i in g):
            continue                                            # (dashes along a curve are not set straight)
        angs = [math.degrees(math.atan2(*(_dir(segs[i])[::-1]))) % 180 for i in lines]
        ref_ = angs[0]
        if max(min(abs(a_ - ref_), 180 - abs(a_ - ref_)) for a_ in angs) > 4.0:
            continue
        ang = math.degrees(math.atan2(u[1], u[0])) % 180
        ext = float(np.ptp((P - c) @ u))
        if min(ang, 180 - ang) <= SNAP_DEG and abs(math.sin(math.radians(ang))) * ext <= 2 * SNAP_PX:
            u = np.array([1.0, 0.0]); nrm = np.array([0.0, 1.0])
        elif abs(ang - 90) <= SNAP_DEG and abs(math.cos(math.radians(ang))) * ext <= 2 * SNAP_PX:
            u = np.array([0.0, 1.0]); nrm = np.array([1.0, 0.0])
        wmed = float(np.median([segs[i]["w"] for i in lines])); dmed = float(np.median([segs[i]["dark"] for i in lines]))
        proj = lambda q: c + u * float(np.dot(q - c, u))
        for i in g:
            e = segs[i]
            if e["k"] == "line":
                e["a"], e["b"] = proj(e["a"]), proj(e["b"]); e["w"] = wmed; e["dark"] = dmed
            elif "mdot" in e:
                # a dot copied as a mark: a short dash on the line, as long as the mark along it
                t = (e["ext"] - c) @ u
                t0, t1 = float(t.min()) + wmed / 2.0, float(t.max()) - wmed / 2.0
                if t1 < t0:
                    t0 = t1 = (t0 + t1) / 2.0
                e.update(k="line", a=c + u * t0, b=c + u * t1, w=wmed, dark=dmed, na=-1, nb=-1, dashdot=True)
            else:
                e["c"] = proj(np.asarray(e["c"], float)); e["dark"] = dmed
    drop = {segs[i]["mdot"] for i in mdots if segs[i].get("dashdot")}
    out = segs[:n0] + [segs[i] for i in mdots if segs[i].get("dashdot")]
    for e in out:
        e.pop("mdot", None); e.pop("ext", None)
    return out, [p for k, p in enumerate(polys or []) if k not in drop]


def grey_areas(d, solid):
    """hatching or stipple too fine to resolve (a lower-resolution copy), merged into grey: areas mostly mid-grey (not
    paper, not ink) over a 7 px window, grown into the looser grey round them; solid fills are not among them"""
    mid = ((d >= 0.15) & (d <= 0.85)).astype(np.float32)
    df = d.astype(np.float32)
    def area(k, frac, lo, op):
        fm = cv2.boxFilter(mid, -1, (k, k)); md = cv2.boxFilter(df, -1, (k, k))
        a = ((fm >= frac) & (md >= lo) & (md <= 0.8)).astype(np.uint8)
        return cv2.morphologyEx(a, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (op, op)))
    strict = area(7 * PX + 1, 0.7, 0.2, 5 * PX + 1)
    if not strict.any():
        return np.zeros_like(strict)
    loose = area(5 * PX + 1, 0.5, 0.15, 3 * PX + 1) | strict
    loose &= 1 - cv2.dilate(solid, np.ones((4 * PX + 1, 4 * PX + 1), np.uint8))
    strict &= loose
    n, lab, st, _ = cv2.connectedComponentsWithStats(loose, 8)
    hit = np.zeros(n, bool); hit[np.unique(lab[strict > 0])] = True; hit[0] = False
    big = st[:, 4] >= 100 * PX * PX
    return (hit & big)[lab].astype(np.uint8)


def grey_polygons(ga, g):
    """each grey area as a polygon in its own median tone"""
    n, lab, st, _ = cv2.connectedComponentsWithStats(ga, 8)
    polys = []
    for i in range(1, n):
        x, y, w, h = st[i, :4]
        x0, y0 = max(0, x - 1), max(0, y - 1)
        m = (lab[y0:y + h + 1, x0:x + w + 1] == i)
        tone = int(round(float(np.mean(g[y0:y + h + 1, x0:x + w + 1][m]))))     # the grey the hatching averages to
        rings = []
        for c in measure.find_contours(np.pad(m.astype(float), 1), 0.5):
            if len(c) < 8:
                continue
            pts = np.stack([c[:, 1] - 1 + x0 + 0.5, c[:, 0] - 1 + y0 + 0.5], 1)
            ring = squared(rdp(pts, EDGE_TOL))
            if len(ring) >= 3 and abs(signed_area(ring)) >= 12 * PX * PX:
                rings.append(ring)
        if rings:
            polys.append({"rings": rings, "g": tone, "grey": True})
    return polys


# ---------------------------------------------------------------- solid fills
def solid_polygons(d, ink, g):
    """each solid fill: its outline rings (traced where the ink is half as dark as the fill itself) and its tone"""
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    core = (dt >= SOLID_R).astype(np.uint8)
    # a fill is thick over an area: where two heavy lines meet, or hatching touches a heavy outline, the ink is thick
    # only at a spot (a core of a few px), and that spot is line work, not a fill
    n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
    small = np.nonzero(st[:, 4] < 16 * PX * PX)[0]
    small = small[small > 0]
    if len(small):
        core[np.isin(lab, small)] = 0
    if not core.any():
        solid_polygons.rim = solid_polygons.light = np.zeros_like(ink)
        return [], np.zeros_like(ink)
    r = int(math.ceil(SOLID_R)) + 1
    solid = cv2.dilate(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) & ink
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid, 8)
    polys = []
    rim = np.zeros_like(ink); light = np.zeros_like(ink)
    for i in range(1, n):
        if st[i, 4] < 30 * PX * PX:
            solid[lab == i] = 0
            continue
        x, y, w, h = st[i, :4]
        pad = 2
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(d.shape[1], x + w + pad), min(d.shape[0], y + h + pad)
        m = (lab[y0:y1, x0:x1] == i)
        inner = m & (core[y0:y1, x0:x1] > 0)
        fill_d = float(np.median(d[y0:y1, x0:x1][inner])) if inner.any() else 1.0
        level = 0.5 * fill_d
        tone = int(np.median(g[y0:y1, x0:x1][inner])) if inner.any() else 0
        dd_ = d[y0:y1, x0:x1]
        # a grey fill's darker edge lines (10 Evelyn's walls) and a dark fill's lighter lines (a white diagonal through
        # a black column) are line work of their own, drawn over the fill
        if fill_d <= 0.8:
            rim[y0:y1, x0:x1] |= (m & (dd_ >= fill_d + 0.25)).astype(np.uint8)
        if fill_d >= 0.6:
            mi = cv2.erode(m.astype(np.uint8), np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)) > 0
            light[y0:y1, x0:x1] |= (mi & (dd_ <= fill_d - (0.1 if fill_d >= 0.9 else 0.3))).astype(np.uint8)
        field = np.where(cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0, d[y0:y1, x0:x1], 0.0)
        field = np.pad(field, 1)
        rings = []
        for c in measure.find_contours(field, level):
            if len(c) < 8:
                continue
            pts = np.stack([c[:, 1] - 1 + x0 + 0.5, c[:, 0] - 1 + y0 + 0.5], 1)
            area = 0.5 * abs(np.dot(pts[:-1, 0], pts[1:, 1]) - np.dot(pts[1:, 0], pts[:-1, 1]))
            if area < 12 * PX * PX:
                continue
            ring = squared(rdp(pts, EDGE_TOL))
            if len(ring) >= 3:
                rings.append(ring)
        if rings:
            polys.append({"rings": rings, "g": tone})
    solid_polygons.rim, solid_polygons.light = rim, light
    return polys, solid


def signed_area(r):
    r = np.asarray(r)
    return 0.5 * (np.dot(r[:, 0], np.roll(r[:, 1], -1)) - np.dot(np.roll(r[:, 0], -1), r[:, 1]))


def rdp(pts, tol):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    closed = np.allclose(pts[0], pts[-1])
    if closed:
        pts = pts[:-1]
        # split the ring at its two farthest points so both halves simplify well
        far = int(np.argmax(np.linalg.norm(pts - pts[0], axis=1)))
        a = _rdp(np.vstack([pts[:far + 1]]), tol); b = _rdp(np.vstack([pts[far:], pts[:1]]), tol)
        return np.vstack([a[:-1], b[:-1]])
    return _rdp(pts, tol)


def _rdp(pts, tol):
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        ab = b - a; L = np.hypot(*ab)
        seg = pts[i + 1:j]
        dd = np.abs(cross2(ab, seg - a)) / L if L > 1e-9 else np.linalg.norm(seg - a, axis=1)
        k = int(np.argmax(dd))
        if dd[k] > tol:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return pts[keep]


def squared(ring):
    """edges within SNAP_DEG of level / plumb made exactly so; each corner where its two edges meet"""
    ring = np.asarray(ring, float)
    n = len(ring)
    if n < 3:
        return ring.tolist()
    edges = []
    for k in range(n):
        a, b = ring[k], ring[(k + 1) % n]
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
        if min(ang, 180 - ang) <= SNAP_DEG and abs(b[1] - a[1]) <= 2 * SNAP_PX:
            edges.append(("h", (a[1] + b[1]) / 2.0, a, b))
        elif abs(ang - 90) <= SNAP_DEG and abs(b[0] - a[0]) <= 2 * SNAP_PX:
            edges.append(("v", (a[0] + b[0]) / 2.0, a, b))
        else:
            edges.append(("s", None, a, b))
    out = []
    for k in range(n):
        e1, e2 = edges[k - 1], edges[k]                         # the corner at ring[k]: between e1 (into it) and e2
        p = ring[k].copy()
        if e1[0] == "h" and e2[0] == "v":
            p = np.array([e2[1], e1[1]])
        elif e1[0] == "v" and e2[0] == "h":
            p = np.array([e1[1], e2[1]])
        elif e1[0] == "h":
            p[1] = e1[1]
            if e2[0] == "s":
                p = _meet_axis(e2, "h", e1[1], p)
        elif e1[0] == "v":
            p[0] = e1[1]
            if e2[0] == "s":
                p = _meet_axis(e2, "v", e1[1], p)
        elif e2[0] == "h":
            p = _meet_axis(e1, "h", e2[1], p)
        elif e2[0] == "v":
            p = _meet_axis(e1, "v", e2[1], p)
        out.append(p)
    out = np.array(out)
    # drop corners that a straight run passes through
    keep = []
    for k in range(len(out)):
        a, b, c = out[k - 1], out[k], out[(k + 1) % len(out)]
        if abs(cross2(b - a, c - b)) > 1e-6 or np.linalg.norm(b - a) < 1e-9:
            keep.append(b)
    return [[round(float(x), 2), round(float(y), 2)] for x, y in keep]


def _meet_axis(e, axis, at, fallback):
    a, b = e[2], e[3]
    if axis == "h" and abs(b[1] - a[1]) > 1e-9:
        t = (at - a[1]) / (b[1] - a[1]); return np.array([a[0] + t * (b[0] - a[0]), at])
    if axis == "v" and abs(b[0] - a[0]) > 1e-9:
        t = (at - a[0]) / (b[0] - a[0]); return np.array([at, a[1] + t * (b[1] - a[1])])
    return fallback


# ---------------------------------------------------------------- lettering
DEBUG_TEXT = False
ROUND = set("oO0QDCcGe@")


def reads_as_word(txt, conf):
    """two letters or more read with confidence, not only round letters (a hob's rings read as 'OO', '00')"""
    letters = sum(ch.isalpha() for ch in txt)
    return conf >= 60 and len(txt) >= 2 and letters >= 1 and not set(txt) <= ROUND


def lettering_mask(stroke, g):
    """lettering: small separate marks standing side by side along a line, as the letters of a word do (along the rows,
    and along the columns for lettering turned upright), that read as a word: tesseract, shown those marks alone, reads
    two letters or more there with confidence. A row of marks that does not read (pillows, a hob's rings, chairs) stays
    line work."""
    import pytesseract
    n, lab, st, _ = cv2.connectedComponentsWithStats(stroke, 8)
    out = np.zeros_like(stroke)
    H, W = stroke.shape
    words = set()
    for turn, boxes in ((False, st[:, :4]), (True, st[:, [1, 0, 3, 2]])):     # rows; columns (x and y swapped)
        cand = [i for i in range(1, n) if 6 <= boxes[i, 3] <= 40 and 2 <= boxes[i, 2] <= 40 and st[i, 4] >= 6
                and boxes[i, 2] <= 3 * boxes[i, 3]]
        cand.sort(key=lambda i: boxes[i, 0])
        parent = {i: i for i in cand}

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for a_ in range(len(cand)):
            i = cand[a_]; xi, yi, wi, hi = boxes[i]
            for b_ in range(a_ + 1, len(cand)):
                j = cand[b_]; xj, yj, wj, hj = boxes[j]
                H_ = max(hi, hj)
                if xj > xi + wi + 0.6 * H_:
                    break
                if xj < xi + wi - 0.25 * min(wi, wj) - 1:          # overlapping along the row: not side by side
                    continue
                if H_ > 2.4 * min(hi, hj):
                    continue
                ov = min(yi + hi, yj + hj) - max(yi, yj)
                if ov < 0.5 * min(hi, hj):
                    continue
                if abs((yi + hi) - (yj + hj)) > 0.3 * H_ and abs(yi - yj) > 0.3 * H_:
                    continue
                parent[find(i)] = find(j)
        groups = {}
        for i in cand:
            groups.setdefault(find(i), []).append(i)
        groups = [gm for gm in groups.values() if len(gm) >= 2]
        if not groups:
            continue
        # the groups' marks alone, as the page shows them, read by tesseract (upright lettering: the page turned)
        show = np.full((H, W), 255, np.uint8)
        member = np.isin(lab, np.array([i for gm in groups for i in gm]))
        show[member] = g[member]
        reads = []
        for rot in ((cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE) if turn else (None,)):
            img = cv2.rotate(show, rot) if rot is not None else show
            data = pytesseract.image_to_data(img, config="--psm 11 --oem 1", output_type=pytesseract.Output.DICT)
            for k in range(len(data["text"])):
                txt = "".join(ch for ch in data["text"][k] if ch.isalnum())
                conf = float(data["conf"][k])
                if DEBUG_TEXT and txt:
                    print("ocr", turn, rot, repr(data["text"][k]), conf, data["left"][k], data["top"][k], data["width"][k], data["height"][k])
                if not reads_as_word(txt, conf):
                    continue
                x, y, w, h = data["left"][k], data["top"][k], data["width"][k], data["height"][k]
                cx, cy = x + w / 2.0, y + h / 2.0
                if rot == cv2.ROTATE_90_CLOCKWISE:                    # (cx, cy) on the turned page -> the page
                    cx, cy = cy, H - 1 - cx
                elif rot == cv2.ROTATE_90_COUNTERCLOCKWISE:
                    cx, cy = W - 1 - cy, cx
                reads.append((cx, cy))
        for gm in groups:
            x0 = min(st[i, 0] for i in gm); y0 = min(st[i, 1] for i in gm)
            x1 = max(st[i, 0] + st[i, 2] for i in gm); y1 = max(st[i, 1] + st[i, 3] for i in gm)
            m = 0.3 * max(st[i, 3 if not turn else 2] for i in gm)
            if any(x0 - m <= cx <= x1 + m and y0 - m <= cy <= y1 + m for cx, cy in reads):
                words.update(gm)
    if words:
        out[np.isin(lab, np.array(sorted(words)))] = 1
    return out


# ---------------------------------------------------------------- lettering over line work (r8)
OVERTEXT = __import__("os").environ.get("FT_OVERTEXT", "1") == "1"   # (r8) dark lettering drawn over lighter line work, copied apart from it
OVER_DARK = float(__import__("os").environ.get("FT_OVER_DARK", "0.45"))   # a letter's ink: at least this dark
OVER_LEVEL = float(__import__("os").environ.get("FT_OVER_LEVEL", "0.6"))   # ... its outline traced at this share of its darkest
OVER_SMOOTH = float(__import__("os").environ.get("FT_OVER_SMOOTH", "0.5"))   # ... from the picture smoothed this much (picture px)
OVER_SOFT = float(__import__("os").environ.get("FT_OVER_SOFT", "0.60"))   # ... only in a soft picture: its ink edges' median steepness under this (p05, a crisp web plan of thin lettering, measures 0.619)
OVER_MIN_PX = int(__import__("os").environ.get("FT_OVER_MIN_PX", "400000"))   # ... in a picture of at least this many pixels
OVER_SHARE = float(__import__("os").environ.get("FT_OVER_SHARE", "0.55"))   # ... the line work round it at most this share as dark


def edge_steepness(g):
    """the median steepness of the picture's strong ink edges (at each edge where a 5 px window spans half the black-to-
    paper range, the local peak of the gradient, per unit of that range): about 1 at a crisp edge, lower as the
    picture is softer (0.8 / sigma for a Gaussian blur of sigma px). The plans the tracer was built on measure 0.64
    and up; a low-resolution picture enlarged into a brochure (111 Emerald Hill) 0.57."""
    hist = np.bincount(g.ravel(), minlength=256)
    paper = 128 + int(np.argmax(hist[128:]))
    dark = g[g < 160]
    black = float(np.percentile(dark, 1)) if dark.size >= 200 else 0.0
    span = max(1.0, paper - black)
    gf = g.astype(np.float32)
    mag = np.hypot(cv2.Sobel(gf, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(gf, cv2.CV_32F, 0, 1, ksize=3)) / (4.0 * span)
    strong = (cv2.dilate(gf, np.ones((5, 5), np.uint8)) - cv2.erode(gf, np.ones((5, 5), np.uint8))) >= 0.5 * span
    peak = (mag >= cv2.dilate(mag, np.ones((3, 3), np.uint8)) - 1e-6) & strong & (mag > 0.05)
    v = mag[peak]
    return float(np.median(v)) if v.size >= 200 else 1.0


def _side_by_side(boxes, idx):
    """the members of idx standing side by side along a row as the letters of a word do (boxes: x, y, w, h), in groups"""
    idx = sorted(idx, key=lambda i: boxes[i][0])
    parent = {i: i for i in idx}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for a_ in range(len(idx)):
        i = idx[a_]; xi, yi, wi, hi = boxes[i]
        for b_ in range(a_ + 1, len(idx)):
            j = idx[b_]; xj, yj, wj, hj = boxes[j]
            H_ = max(hi, hj)
            if xj > xi + wi + 0.8 * H_:
                break
            if H_ > 2.6 * min(hi, hj) and min(hi, hj) > 4 * PX:
                continue
            ov = min(yi + hi, yj + hj) - max(yi, yj)
            if ov < 0.5 * min(hi, hj):
                continue
            parent[find(i)] = find(j)
    groups = {}
    for i in idx:
        groups.setdefault(find(i), []).append(i)
    return [gm for gm in groups.values() if len(gm) >= 2]


def letters_over_lines(d, g):
    """lettering drawn dark over lighter line work - a room's name across its floor's stripes, a label over a table's
    edge - or run together by a soft picture. Small dark marks that stand apart from one another at a darker level
    (each at least OVER_DARK dark, the line work round it at most OVER_SHARE as dark as its darkest), but that the
    ink's level joins into one piece with line work or with one another, not one thin line, two or more side by side
    as letters stand (along the rows, or the columns
    for upright lettering). Each is copied by its outline, traced above the line work's level, and taken out of the
    picture with a pixel round it, so that the line work under it is traced as the lines it is (with the letters' gaps),
    not as a blob of letters and stripes. A mark standing alone at the ink's level is left to small_marks; lettering
    over line work as dark as itself cannot be told apart by its grey and is left as it was. Returns (the pixels taken,
    the outlines)."""
    H, W = d.shape
    taken = np.zeros((H, W), np.uint8)
    out = []
    ink = (d > INK).astype(np.uint8)
    nI, labI, stI, _ = cv2.connectedComponentsWithStats(ink, 8)
    bigI = np.maximum(stI[:, 2], stI[:, 3]) > MARK_PX
    bigI[0] = False
    dark = (d >= OVER_DARK).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark, 8)
    K1 = np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)
    K2 = np.ones((6 * PX + 1, 6 * PX + 1), np.uint8)
    K3 = np.ones((3 * PX + 1, 3 * PX + 1), np.uint8)
    near_dark = cv2.dilate(dark, K3) > 0
    # the dark marks each piece of ink holds: a soft word's letters run together at the ink's level
    on = dark > 0
    pairs = np.unique(np.stack([lab[on], labI[on]], 1), axis=0)
    held = np.bincount(pairs[:, 1], minlength=nI)
    of = np.zeros(n, np.int64)
    of[pairs[:, 0]] = pairs[:, 1]
    cand = {}
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if not (3 * PX <= max(w, h) <= 24 * PX) or a < 3 * PX * PX:
            continue
        x0, y0 = max(0, x - 3 * PX), max(0, y - 3 * PX)
        x1, y1 = min(W, x + w + 3 * PX), min(H, y + h + 3 * PX)
        m = lab[y0:y1, x0:x1] == i
        thin = _thin_stroke(m)                                  # one thin line: a hatching stroke, or an I or a 1
        dm = d[y0:y1, x0:x1]
        peak = float(dm[m].max())
        mu8 = m.astype(np.uint8)
        # the line work round it: ink beside it, away from it and from the other dark marks (its neighbours in a word)
        ring = (cv2.dilate(mu8, K2) > 0) & ~near_dark[y0:y1, x0:x1] & (ink[y0:y1, x0:x1] > 0)
        rd = float(np.percentile(dm[ring], 75)) if ring.sum() >= 2 * PX else INK
        if rd > OVER_SHARE * peak:
            continue                                            # the line work round it is as dark: not told apart
        cand[i] = (x0, y0, x1, y1, peak, rd, bool(bigI[of[i]] or held[of[i]] >= 2), thin)
    if not cand:
        return taken, out
    words = set()
    for turn in (False, True):
        boxes = {i: ((st[i, 0], st[i, 1], st[i, 2], st[i, 3]) if not turn else (st[i, 1], st[i, 0], st[i, 3], st[i, 2]))
                 for i in cand}
        for gm in _side_by_side(boxes, list(cand)):
            # a word one of whose letters the ink's level joins to line work or to another letter; a word whose
            # letters all stand apart at the ink's level is left to small_marks as it was
            # (two letters at least that are not one thin line: a row of hatching strokes is not a word; an I or a 1
            # in a word is one of its letters)
            if any(cand[i][6] for i in gm) and sum(not cand[i][7] for i in gm) >= 2:
                words.update(gm)
    global MARK_LEVEL
    keep_level = MARK_LEVEL
    # the outline from the picture smoothed by about half a pixel of the picture as given: traced at UP x, a soft
    # letter's edge is the enlarged picture's blocks, which would make every stem a staircase
    ds = cv2.GaussianBlur(d, (0, 0), OVER_SMOOTH * PX) if OVER_SMOOTH > 0 else d
    try:
        for i in sorted(words):
            x0, y0, x1, y1, peak, rd, _, _ = cand[i]
            m = lab[y0:y1, x0:x1] == i
            # traced above the line work's level, so that no stripe it touches is taken into its outline
            # (at half its darkest, the edge of a soft letter as it is seen; higher where the line work round it is darker)
            MARK_LEVEL = max(OVER_LEVEL, min(0.9, (rd + 0.05) / peak))
            mk = _outline_mark(m, x0, y0, x1, y1, ds, g)
            if not mk:
                continue
            mk["over"] = True
            out.append(mk)
            # taken out of the picture: the letter, the ink within two pixels of it (its soft edge, the line work it
            # touches) and a pixel round them
            dm = d[y0:y1, x0:x1]
            near = (cv2.dilate(m.astype(np.uint8), K1) > 0) & (dm > FAINT)
            taken[y0:y1, x0:x1] |= cv2.dilate((near | m).astype(np.uint8), np.ones((PX + 1, PX + 1), np.uint8))
    finally:
        MARK_LEVEL = keep_level
    return taken, out


# ---------------------------------------------------------------- small marks
MARK_PX = int(__import__("os").environ.get("FT_MARK", "64"))   # a mark standing alone no larger than this (a letter, a dot, a basin) is copied by its outline
MARK_LEVEL = float(__import__("os").environ.get("FT_MARK_LEVEL", "0.4"))   # ... traced where its ink is this share of its darkest


def small_marks(weak, stroke, d, g):
    """each small mark standing alone - a letter, a figure, a dot, a dash, a small symbol (a pillow, a basin, a chair) -
    copied by its own outline, traced where its ink is MARK_LEVEL as dark as its own darkest (so a symbol drawn in
    light grey keeps its lines), filled in its darkest tone: at this size a centre line loses the shape (a B turns
    into an 8). A mark is what stands apart from all other ink, faint ink included. Returns the outlines and the
    pixels they took."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(weak, 8)
    taken = np.zeros_like(stroke)
    out = []
    H, W = stroke.shape
    # a piece within a pixel of larger line work (a light circle's arc between the lines that cross it) is part of
    # that line work, not a mark standing alone
    big = np.nonzero(np.maximum(st[:, 2], st[:, 3]) > MARK_PX)[0]
    big = big[big > 0]
    near_big = cv2.dilate(np.isin(lab, big).astype(np.uint8), np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)) if len(big) \
        else np.zeros_like(stroke)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if max(w, h) > MARK_PX or area < 2 * PX * PX:
            continue
        x0, y0 = max(0, x - 2 * PX), max(0, y - 2 * PX)
        x1, y1 = min(W, x + w + 2 * PX), min(H, y + h + 2 * PX)
        m = lab[y0:y1, x0:x1] == i
        if not (stroke[y0:y1, x0:x1][m]).any():
            continue                                            # faint ink alone: not a mark
        if near_big[y0:y1, x0:x1][m].any():
            continue
        if _thin_stroke(m, stroke[y0:y1, x0:x1] > 0):
            continue                                            # a lone thin line or arc is drawn as one, not outlined
        mk = _outline_mark(m, x0, y0, x1, y1, d, g)
        if mk:
            out.append(mk)
            taken[y0:y1, x0:x1] |= m.astype(np.uint8)
    return out, taken


def _thin_stroke(m, core=None):
    """a piece that is one thin straight line or one arc (a light sloping line, a short door swing standing alone): its
    outline would follow the pixel steps, so it is left to the strokes, which draw it as one segment or one arc. Only
    a piece the strokes will draw that way: all of it along one straight line, or its centre one open chain fitted as
    one line or one hairline arc, every pixel of it lying along it. With `core` (the ink the strokes are traced from),
    only a piece whose centre runs on that ink: a faint curve would be lost to the strokes. Anything else (a line with
    bent ends, a pillow's rounded corner, an L - the letter's foot would be lost) keeps its outline."""
    if __import__("os").environ.get("FT_THIN", "1") != "1":
        return False
    ys, xs = np.nonzero(m)
    if len(xs) < 6 * PX:
        return False
    sk = skeletonize(m)
    L = float(sk.sum())
    if L < 8 * PX:
        return False
    if core is not None and (sk & core).sum() < 0.9 * L:
        return False
    thick = len(xs) / L
    if thick > 3.0 * PX:
        return False
    P = np.stack([xs + 1.5, ys + 1.5], 1).astype(float)          # (in the padded piece's pixels, as the chain below)
    tol = thick / 2.0 + FIT_PX
    ok = lambda dv: np.percentile(dv, 95) <= tol and dv.max() <= tol + 0.5 * PX
    c_, dvec, _, _, _ = fit_line(P)
    if ok(np.abs((P - c_) @ np.array([-dvec[1], dvec[0]]))):
        return True                                             # all of it along one straight line
    try:
        ch, _ = skeleton_graph(np.pad(m, 1).astype(np.uint8), np.ones((m.shape[0] + 2, m.shape[1] + 2)))
    except Exception:
        return False
    ch = [c for c in ch if c["n"] > 1]
    if len(ch) != 1 or ch[0]["closed"]:
        return False
    out = []
    fit_path(ch[0]["pts"], out)
    def _segd(a, b):
        a, b = np.asarray(a, float), np.asarray(b, float); v = b - a
        t = np.clip(((P - a) @ v) / max(1e-9, float(v @ v)), 0.0, 1.0)
        return np.linalg.norm(P - (a + t[:, None] * v), axis=1)
    if len(out) == 1 and out[0][0] == "line":
        return bool(np.linalg.norm(np.asarray(out[0][2]) - np.asarray(out[0][1])) >= 4 * PX and ok(_segd(out[0][1], out[0][2])))
    if len(out) == 1 and out[0][0] == "arc":
        cx, cy, r, a0, a1 = out[0][1]
        # a hairline arc (a letter's bowl is copied by its outline)
        return bool(r >= 8 * PX and thick <= 1.5 * PX and ok(np.abs(np.hypot(P[:, 0] - cx, P[:, 1] - cy) - r)))
    return False


def _outline_mark(m, x0, y0, x1, y1, d, g, strict=False):
    """a mark's outline rings, where its ink (and 1 px round it) is MARK_LEVEL as dark as its darkest; its tone"""
    grow = cv2.dilate(m.astype(np.uint8), np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)) > 0
    field = np.where(grow, d[y0:y1, x0:x1], 0.0)
    peak = float(d[y0:y1, x0:x1][m].max()) if m.any() else 0.0     # its own darkest (not a darker line it touches)
    if peak <= 0:
        return None
    # one outline holds one tone: a piece drawn partly dark and partly light (a light X inside a black box, light hangers
    # on a black rail) would lose its light lines, so it is left to the strokes
    dm = d[y0:y1, x0:x1]
    lp = cv2.dilate(dm, np.ones((2 * PX + 1, 2 * PX + 1), np.uint8))
    ridge = m & (dm >= lp - 0.02) & (dm > FAINT)
    nr = int(ridge.sum())
    if nr:
        dark = int((ridge & (dm >= 0.75 * peak)).sum()); light = int((ridge & (dm <= 0.5 * peak)).sum())
        share = 0.05 if strict else 0.15
        if dark >= share * nr and light >= share * nr:
            return None
        if strict and float(np.median(dm[ridge])) < 0.7:
            return None                                         # a light piece at a line is the line work's, not a letter
    tone = int(np.percentile(g[y0:y1, x0:x1][m], 5))
    level = MARK_LEVEL * peak
    if PX > 1:
        # at UP x a thin diagonal is blocks touching at their corners, and a contour would part them there: the
        # darker pixel beside each such touch is lifted to the level
        field = field.copy()
        for _ in range(2):
            mk = field >= level
            a, b, c, e = mk[:-1, :-1], mk[:-1, 1:], mk[1:, :-1], mk[1:, 1:]
            ys, xs = np.nonzero(a & e & ~b & ~c)
            pb = field[ys, xs + 1] >= field[ys + 1, xs]
            field[ys[pb], xs[pb] + 1] = level + 1e-3; field[ys[~pb] + 1, xs[~pb]] = level + 1e-3
            ys, xs = np.nonzero(b & c & ~a & ~e)
            pa = field[ys, xs] >= field[ys + 1, xs + 1]
            field[ys[pa], xs[pa]] = level + 1e-3; field[ys[~pa] + 1, xs[~pa] + 1] = level + 1e-3
    rings = []
    for c in measure.find_contours(np.pad(field, 1), level):
        if len(c) < 4:
            continue
        pts = np.stack([c[:, 1] - 1 + x0 + 0.5, c[:, 0] - 1 + y0 + 0.5], 1)
        # edges near level or plumb made exactly so (a dash's edges stay parallel, a letter's stems stay straight)
        ring = np.asarray(squared(rdp(pts, 0.3 * PX)), float)
        if len(ring) >= 3 and abs(signed_area(ring)) >= 0.5 * PX * PX:
            rings.append([[round(float(a), 2), round(float(b), 2)] for a, b in ring])
    return {"rings": rings, "g": tone, "mark": True} if rings else None


def _seg_points(e):
    if e["k"] == "line":
        t = np.linspace(0.0, 1.0, max(2, int(np.linalg.norm(e["b"] - e["a"]) / PX) + 2))[:, None]
        return e["a"][None] * (1 - t) + e["b"][None] * t
    if e["k"] == "arc":
        a = np.linspace(e["a0"], e["a1"], max(3, int(abs(e["a1"] - e["a0"]) * e["r"] / PX) + 2))
        return np.stack([e["c"][0] + e["r"] * np.cos(a), e["c"][1] + e["r"] * np.sin(a)], 1)
    return np.asarray(e["c"], float)[None]


def marks_on_lines(segs, weak, d, g):
    """a small mark that touches a long line (a letter on a void's cross, a K against a wall, a chair at a table) was
    traced with the line's strokes and comes out broken: with the long lines' ink set aside, a small piece that three
    or more strokes were fitted into is copied by its outline instead (the outline runs into the line a little, and
    the line is drawn over it, so no gap opens). Returns the strokes left and the outlines."""
    H, W = weak.shape
    is_long = [e["k"] == "line" and np.linalg.norm(e["b"] - e["a"]) >= 40 * PX for e in segs]
    if not any(is_long):
        return segs, []
    lm = np.zeros((H, W), np.uint8)
    for e, lg in zip(segs, is_long):
        if lg:
            a = np.round((e["a"] - 0.5) * 16).astype(int); b = np.round((e["b"] - 0.5) * 16).astype(int)
            cv2.line(lm, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), 1, thickness=int(math.ceil(e["w"])) + 2,
                     lineType=cv2.LINE_8, shift=4)
    resid = (weak & (1 - lm)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(resid, 8)
    if n <= 1:
        return segs, []
    labd = cv2.dilate(lab.astype(np.float32), np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)).astype(np.int32)
    lmd = cv2.dilate(lm, np.ones((2 * PX + 1, 2 * PX + 1), np.uint8))
    # each short stroke belongs to the pieces its points lie on; a stroke that crosses a long line from one piece to
    # another (an S cut by a wall line) joins the two pieces into one mark
    parent = list(range(n))
    def root(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    seg_lab = {}
    for k, (e, lg) in enumerate(zip(segs, is_long)):
        if lg:
            continue
        P = _seg_points(e)
        xi = np.clip(np.floor(P[:, 0]).astype(int), 0, W - 1); yi = np.clip(np.floor(P[:, 1]).astype(int), 0, H - 1)
        ls = labd[yi, xi]
        off = ls == 0
        if off.any() and not lmd[yi[off], xi[off]].all():
            continue                                            # it runs off the pieces (and not just over a long line)
        u = np.unique(ls[~off])
        if not len(u):
            continue
        for v in u[1:]:
            ra, rb = root(int(u[0])), root(int(v))
            if ra != rb:
                parent[rb] = ra
        seg_lab[k] = int(u[0])
    groups = {}
    for k, l0 in seg_lab.items():
        groups.setdefault(root(l0), []).append(k)
    members = {}
    for i in range(1, n):
        members.setdefault(root(i), []).append(i)
    out, drop = [], set()
    for r_, ks in groups.items():
        comp = members[r_]
        x = int(min(st[i, 0] for i in comp)); y = int(min(st[i, 1] for i in comp))
        xe = int(max(st[i, 0] + st[i, 2] for i in comp)); ye = int(max(st[i, 1] + st[i, 3] for i in comp))
        w, h = xe - x, ye - y
        area = int(sum(st[i, 4] for i in comp))
        if max(w, h) > MARK_PX or area < 2 * PX * PX:
            continue
        if not (len(ks) >= 3 or (len(ks) >= 2 and max(w, h) <= 16 * PX)):
            continue                                            # a letter's piece has two strokes or more
        if any(segs[k]["k"] == "line" and np.linalg.norm(segs[k]["b"] - segs[k]["a"]) >= 14 * PX for k in ks):
            continue                                            # and no straight stroke longer than a letter's
        x0, y0 = max(0, x - 2 * PX), max(0, y - 2 * PX)
        x1, y1 = min(W, xe + 2 * PX), min(H, ye + 2 * PX)
        m = np.isin(lab[y0:y1, x0:x1], comp)
        if not lmd[y0:y1, x0:x1][m].any():
            continue                                            # not at a long line (a mark standing alone is copied already)
        if os.environ.get("FT_THIN2", "1") == "1" and _thin_stroke(m):
            continue                                            # a dash or a thin L is better as its strokes
        mk = _outline_mark(m, x0, y0, x1, y1, d, g, strict=True)
        if mk:
            out.append(mk); drop.update(ks)
    return [e for k, e in enumerate(segs) if k not in drop], out


# ---------------------------------------------------------------- level and plumb lines
STEPS = os.environ.get("FT_STEPS", "1") == "1"   # (r7) a short dark piece spanning the gap between two lines (a panel's end) is drawn


def _spans_gap(m, x, y, w, h, used, dm):
    """A crumb that runs straight across the gap between two lines (a sliding panel's end, the step between a thin and a
    heavy line): narrow, dark, and with line ink just beyond both its ends along its length (lines joined elsewhere count:
    the two lines are one piece of `used` when they meet further on)."""
    H, W = used.shape
    if h >= w:
        if w > 3 * PX or h < 2 * PX or y < 1 or y + h >= H:
            return False
        a, b = used[y - 1, x:x + w], used[y + h, x:x + w]
    else:
        if h > 3 * PX or w < 2 * PX or x < 1 or x + w >= W:
            return False
        a, b = used[y:y + h, x - 1], used[y:y + h, x + w]
    if not (a.any() and b.any()):
        return False
    return float(np.median(dm[m])) >= 0.6


RUN = 10               # a level (plumb) line: ink running at least this far along a row (column)


def _level_fit(cx, cy, w, across=0.0):
    """the band's centre line: for a short heavy band (`across`: its ink across, per column), fitted on its middle (its
    ends lean with the anti-aliasing and the lines that meet it there); a thin line is fitted whole"""
    if os.environ.get("FT_LEVELFIT", "1") == "1" and w < 4 * RUN and len(cx) >= 10 and across >= 3 * PX:
        a, b = int(0.2 * len(cx)), int(0.8 * len(cx))
        k, c0 = np.polyfit(cx[a:b], cy[a:b], 1)
        # (held to all but its very ends: a slightly slanted short line's middle can lie in one step of its staircase)
        a, b = int(0.1 * len(cx)), int(math.ceil(0.9 * len(cx)))
        return k, c0, np.abs(cy[a:b] - (k * cx[a:b] + c0))
    k, c0 = np.polyfit(cx, cy, 1)
    return k, c0, np.abs(cy - (k * cx + c0))


def _band_parts(dd, x0, y0, w, h, band):
    """a band's rows that belong to it: the rows that run most of its length, and any group of shorter rows that line
    up with each other (a stretch drawn heavier). Shorter rows that step along (a shallow curve or slant running into
    the line, tangent to it) are not the line's and go back to the strokes. What is left, part by part, in level pieces."""
    if h > 2 * PX and os.environ.get("FT_BANDROWS", "1") == "1":
        lens = band.sum(1)
        core = lens >= 0.5 * lens.max()
        band = band.copy()
        r = 0
        while r < h:
            if core[r]:
                r += 1; continue
            r2 = r
            while r2 < h and not core[r2]:
                r2 += 1
            grp = band[r:r2]
            nr = int(grp.any(1).sum())
            if nr:
                # the columns all (but a few) of these rows cover are a stretch drawn heavier; the rest steps along
                cov = grp.sum(0)
                blk = cov >= max(1, 0.8 * nr)
                # stretches shorter than 2 px are not stretches
                pad = np.concatenate([[0], blk.astype(np.int8), [0]]); dfb = np.diff(pad)
                for a_, b_ in zip(np.nonzero(dfb == 1)[0], np.nonzero(dfb == -1)[0]):
                    if b_ - a_ < 2 * PX:
                        blk[a_:b_] = False
                band[r:r2] = grp & blk[None, :]
            r = r2
    n, lab, st, _ = cv2.connectedComponentsWithStats(band.astype(np.uint8), connectivity=4)
    out = []
    for i in range(1, n):
        bx, by, bw, bh, _a = st[i]
        if bw < RUN:
            continue
        sub = lab[by:by + bh, bx:bx + bw] == i
        out += _level_pieces(dd, x0 + bx, y0 + by, bw, bh, sub)
    return out


CURVE_BANDS = os.environ.get("FT_CURVEBANDS", "1") == "1"


def _drifts(cx, cy, h, across):
    """(r7) a band whose centre drifts smoothly off level - a slanted straight line or a shallow curve running near
    level (a pillow's or cushion's side, a lens, a chair's side, a toilet's flank) - is not a stack of level pieces: its
    centre keeps within FIT_PX of one slanted line, or of one parabola that bends one way, and it drifts by 1.5 px or
    more. A heavy outline that steps (a box side stepping out) fits neither: its steps are sharp."""
    if len(cx) < RUN or across > 4 * PX:
        return False                                            # (a heavy band: its rows say little of a curve)
    span = float(cx[-1] - cx[0]) if len(cx) > 1 else 0.0
    if span < RUN:
        return False
    if len(cy) > 1 and float(np.max(np.abs(np.diff(cy)))) > 1.0 * PX:
        return False                                            # (a sharp step: a heavy outline that jogs)
    k1, c1 = np.polyfit(cx, cy, 1)
    r1 = np.abs(cy - (k1 * cx + c1))
    if abs(k1) * span >= 1.5 * PX and np.percentile(r1, 90) <= FIT_PX and r1.max() <= FIT_PX + 0.5 * PX:
        return True
    q = np.polyfit(cx, cy, 2)
    r2 = np.abs(cy - np.polyval(q, cx))
    fitted = np.polyval(q, cx)
    if np.percentile(r2, 90) <= FIT_PX and r2.max() <= FIT_PX + 0.5 * PX and float(fitted.max() - fitted.min()) >= 1.5 * PX:
        return True
    return False


def _level_pieces(dd, x0, y0, w, h, band):
    """a band as it is, if it keeps level; else cut where its centre moves off by more than FIT_PX for 2 px or more (a
    heavy outline that jogs, a box side that steps out), each piece trimmed to its own rows"""
    dv = dd[y0:y0 + h, x0:x0 + w] * band
    colw = dv.sum(0)
    ok = colw > 0
    if ok.sum() < RUN:
        return [(x0, y0, w, h, band)]
    ys = np.arange(y0, y0 + h)[:, None] + 0.5
    cy = np.where(ok, (dv * ys).sum(0) / np.maximum(colw, 1e-9), np.nan)
    cx = np.arange(x0, x0 + w)[ok] + 0.5
    k, c0, res = _level_fit(cx, cy[ok], w, float(band.sum()) / max(1, w))
    if not (abs(k) > math.tan(math.radians(SNAP_DEG)) or abs(k) * w > 2 * SNAP_PX or np.percentile(res, 90) > FIT_PX) \
            or os.environ.get("FT_SPLIT", "1") != "1":
        return [(x0, y0, w, h, band)]
    if CURVE_BANDS and _drifts(cx, cy[ok], h, float(band.sum()) / max(1, w)):
        return []                                               # (r7) a slanted line or a shallow curve: left to the strokes
    cuts = [0]; start = 0; ref = None; run_start = None
    for j in range(w):
        if not ok[j]:
            continue
        if ref is None:
            ref = cy[j]; continue
        if abs(cy[j] - ref) > FIT_PX:
            if run_start is None:
                run_start = j
            if j - run_start + 1 >= 2 * PX:
                cuts.append(run_start); start = run_start
                ref = float(np.nanmedian(cy[run_start:j + 1])); run_start = None
        else:
            run_start = None
            ref = float(np.nanmedian(cy[start:j + 1]))
    cuts.append(w)
    out = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        if b - a < RUN:
            continue
        sub = band[:, a:b]
        rows = np.nonzero(sub.any(1))[0]
        if not len(rows):
            continue
        r0, r1 = int(rows[0]), int(rows[-1]) + 1
        # a piece must be a band as thick as its ink across: one that spans more rows than that holds a slanting
        # line that runs into the level one (a stair's stringer meeting a tread), and is left to the strokes
        cnt = sub[r0:r1].sum(0)
        if (r1 - r0) > 1.6 * float(np.median(cnt[cnt > 0])) + 2 * PX:
            continue
        out.append((x0 + a, y0 + r0, b - a, r1 - r0, sub[r0:r1]))
    return out


GREY = os.environ.get("FT_GREY", "1") == "1"   # unresolved hatching copied as a grey fill
MARK2 = os.environ.get("FT_MARK2", "1") == "1"   # small marks touching long lines copied by outline
BRIDGE = os.environ.get("FT_BRIDGE", "1") == "1"   # put back faint pixels between pieces of a light curve
CONT = os.environ.get("FT_CONT", "0") == "1"   # the short-band-runs-on-into-a-curve check (off: it dropped heavy outlines that hatching touches)
AXDBG = None   # (x, y) in working px: axis_lines says what it decides about the band there


def _axdbg(level, x0, y0, w, h, msg):
    if AXDBG is None:
        return
    X, Y = AXDBG if level else (AXDBG[1], AXDBG[0])
    if x0 - 2 <= X <= x0 + w + 2 and y0 - 2 <= Y <= y0 + h + 2:
        print("axis", "level" if level else "plumb", "x0 y0 w h", x0, y0, w, h, ":", msg)


TANGENT = os.environ.get("FT_TANGENT", "1") == "1"   # (r7) a thin band whose end runs on into a curve along it


def _runs_on_tangent(grp, level, x0, y0, w, h, rest, fill):
    """(r7) a thin band (a hairline, 2 px or less) whose end runs on into stroke ink no band took, heading on along the
    band (within 35 degrees of it): the straight stretch of a curve (a lens's side, a pillow's flank, a chair's arm, a
    door swing near its end) - left to the curves, so the curve is fitted whole. A heavy band is not touched (hatching
    meeting a heavy outline)."""
    if max(e["w"] for e in grp) > 3.5 * PX or w > 80 * PX:
        return False
    r_ = rest if level else rest.T
    f_ = None if fill is None else (fill if level else fill.T)
    # a slice of a heavier slanted or curved stroke (a heavy door swing near its hinge): the stroke's own ink, left
    # to the strokes, runs along beside the band for half its length or more
    above = r_[y0 - 1, x0:x0 + w] if y0 > 0 else np.zeros(w, r_.dtype)
    below = r_[y0 + h, x0:x0 + w] if y0 + h < r_.shape[0] else np.zeros(w, r_.dtype)
    side = (above > 0) | (below > 0)
    if w >= RUN and float(side.mean()) >= 0.5:
        pad = np.concatenate([[0], side.astype(np.int8), [0]]); dv_ = np.diff(pad)
        runs = np.nonzero(dv_ == -1)[0] - np.nonzero(dv_ == 1)[0]
        # (hatching touching a line touches it in short runs; a line drawn heavier for a stretch has the extra ink on
        # one side; a slanted stroke crosses the band: its ink lies above it at one end and below it at the other)
        ab, be = np.nonzero(above > 0)[0], np.nonzero(below > 0)[0]
        crosses = len(ab) >= 0.2 * w and len(be) >= 0.2 * w and abs(float(ab.mean()) - float(be.mean())) >= 0.3 * w
        if len(runs) and int(runs.max()) >= max(RUN, 0.3 * w) and crosses:
            return True
    q = 4 * PX
    for side in (-1, 1):
        xa, xb = (max(0, x0 - q), x0) if side < 0 else (x0 + w, min(r_.shape[1], x0 + w + q))
        ya, yb = max(0, y0 - q), min(r_.shape[0], y0 + h + q)
        if xb <= xa:
            continue
        if f_ is not None and f_[y0:y0 + h, xa:xb].any():
            continue
        blk = r_[ya:yb, xa:xb]
        n_ = int(blk.sum())
        if n_ < 2 * PX * PX:
            continue
        cols_ = int((blk.sum(0) > 0).sum())
        if cols_ and n_ / cols_ > 1.6 * max(e["w"] for e in grp) + PX:
            continue                                            # (heavier ink running on: a heavier line, not a curve)
        ys_, xs_ = np.nonzero(blk)
        dx = float(np.mean(xs_ + xa + 0.5)) - (x0 if side < 0 else x0 + w)
        # (across from the centre of the band's own end piece, not the band's: a band drawn heavier for a stretch is
        # centred off its thin line)
        along_ = lambda e_: float(min(e_["a"][0], e_["b"][0])) if level else float(min(e_["a"][1], e_["b"][1]))
        endp = min(grp, key=along_) if side < 0 else max(grp, key=along_)
        yc_ = float(endp["a"][1]) if level else float(endp["a"][0])
        dy = float(np.mean(ys_ + ya + 0.5)) - yc_
        if abs(dx) < 1e-6:
            continue
        if side * dx > 0 and abs(dy) <= math.tan(math.radians(35)) * abs(dx) and abs(dy) >= 0.5 * PX:
            # (and it bends off the band: ink straight on is the line itself running on past a crossing; ink running
            # on level beside it is the line stepping a pixel, not a curve)
            if len(set(xs_.tolist())) >= 3:
                k_, _c = np.polyfit(xs_.astype(float), ys_.astype(float), 1)
                if abs(k_) < math.tan(math.radians(3)):
                    continue
            return True
    return False


def axis_lines(stroke, d, fill=None, run=None, min_h=0):
    """the level and plumb lines, read straight off the rows and columns: the ink that runs RUN px or more along a row,
    as one band; a band that keeps level (within SNAP_DEG, its centre within FIT_PX of a straight line) is one line,
    as long as the band and as thick as its ink across. Returns the lines and the pixels they took."""
    H, W = stroke.shape
    used = np.zeros_like(stroke)
    lines = []
    for level in (True, False):
        m = stroke if level else stroke.T
        dd = d if level else d.T
        pad = np.pad(m.astype(np.int8), ((0, 0), (1, 1)))
        df = np.diff(pad, axis=1)
        sr, sc = np.nonzero(df == 1)
        er, ec = np.nonzero(df == -1)
        mark = np.zeros_like(m)
        run_ = RUN if run is None else run
        for r, a, b in zip(sr, sc, ec):
            if b - a >= run_:
                mark[r, a:b] = 1
        # the rows of a short heavy piece are not all as long as RUN (its outer rows lose a pixel to anti-aliasing):
        # a run at least half as long that lies along a marked run is the same band
        for _ in range(2 if min_h else 0):
            for r, a, b in zip(sr, sc, ec):
                if b - a >= run_ / 2 and not mark[r, a]:
                    # (lying within it, both ends: the rows of a slanted heavy line run on past the row before them)
                    if any(0 <= rr < m.shape[0] and mark[rr, a] and mark[rr, b - 1] and mark[rr, a:b].mean() >= 0.7
                           for rr in (r - 1, r + 1)):
                        mark[r, a:b] = 1
        n, lab, st, _ = cv2.connectedComponentsWithStats(mark, connectivity=4)
        for i in range(1, n):
            x0, y0, w, h, area = st[i]
            if h > 12 * PX or w < run_:
                _axdbg(level, x0, y0, w, h, "too thick or short")
                continue
            band = lab[y0:y0 + h, x0:x0 + w] == i
            if min_h:
                # the short-band pass: only a thick, square-cut piece (a heavy outline's step, a jamb), as long as it is
                # thick at least; the flat top of a heavy curve is lens-shaped and is left to the curves
                cs_, rs_ = band.sum(0), band.sum(1)
                if h < min_h or w < 1.5 * h or cs_.min() < 0.75 * cs_.max() or rs_.min() < 0.75 * rs_.max():
                    continue
            for x0, y0, w, h, band in _band_parts(dd, x0, y0, w, h, band):
                dv = dd[y0:y0 + h, x0:x0 + w] * band
                colw = dv.sum(0)
                ok = colw > 0
                if ok.sum() < run_:
                    continue
                ys = np.arange(y0, y0 + h)[:, None] + 0.5
                cy = (dv * ys).sum(0)[ok] / colw[ok]
                cx = np.arange(x0, x0 + w)[ok] + 0.5
                k, c0, res = _level_fit(cx, cy, w, float(band.sum()) / max(1, w))
                if abs(k) > math.tan(math.radians(SNAP_DEG)) or abs(k) * w > 2 * SNAP_PX or np.percentile(res, 90) > FIT_PX:
                    _axdbg(level, x0, y0, w, h, "not level: k %.3f res90 %.2f" % (k, np.percentile(res, 90)))
                    continue
                # its ink across, column by column (a row above and below the band included), and its darkness
                ya, yb = max(0, y0 - PX), min(m.shape[0], y0 + h + PX)
                # (the row above and below count for the line's own anti-aliased edge, not where they are another
                # line's ink: two lines a pixel apart would read as one heavy one)
                blk_ = dd[ya:yb, x0:x0 + w]
                inb_ = np.zeros(blk_.shape, bool); inb_[y0 - ya:y0 - ya + h] = band
                other_ = (m[ya:yb, x0:x0 + w] > 0) & ~inb_
                across = np.where(other_, 0.0, blk_).sum(0)
                dark = float(np.percentile(dd[y0:y0 + h, x0:x0 + w][band], 90))
                dark = max(0.2, dark)
                # a line whose weight changes along it (a thin line running on as a box's heavy side, a wall's line drawn
                # 2 px for a stretch) is cut where it does: pieces whose weights differ by 40 % and by 0.8 px or more
                tcol = across / dark
                # columns where another line crosses (ink just outside the band on either side) say nothing of its weight
                above = m[y0 - 1, x0:x0 + w] if y0 > 0 else np.zeros(w, m.dtype)
                below = m[y0 + h, x0:x0 + w] if y0 + h < m.shape[0] else np.zeros(w, m.dtype)
                # (a line crossing it touches it for its own width; ink running alongside for a long stretch is a
                # parallel line a pixel off, and says nothing against the weight)
                def _short(v):
                    v = v > 0
                    pad = np.concatenate([[0], v.astype(np.int8), [0]]); dv_ = np.diff(pad)
                    out_ = np.zeros(len(v), bool)
                    for a_, b_ in zip(np.nonzero(dv_ == 1)[0], np.nonzero(dv_ == -1)[0]):
                        if b_ - a_ <= 6 * PX:
                            out_[a_:b_] = True
                    return out_
                crossing = cv2.dilate((_short(above) | _short(below)).astype(np.uint8)[None, :], np.ones((1, 2 * PX + 1), np.uint8))[0] > 0
                k_ = 2 * PX + 1
                tpad = np.pad(tcol, k_ // 2, mode="edge")
                tsm = np.median(np.lib.stride_tricks.sliding_window_view(tpad, k_), axis=1)
                idx = np.nonzero(~crossing)[0]
                cuts = [0]
                if len(idx) >= 3:
                    seq = tsm[idx]
                    ref = seq[0]; start = 0; run_start = None
                    for j in range(1, len(seq)):
                        differs = (max(seq[j], ref) > 1.4 * min(seq[j], ref)) and abs(seq[j] - ref) >= 0.8 * PX
                        if differs:
                            if run_start is None:
                                run_start = j
                            if idx[j] - idx[run_start] + 1 >= 3 * PX:
                                cuts.append(int(idx[run_start])); start = run_start
                                ref = float(np.median(seq[run_start:j + 1])); run_start = None
                        else:
                            run_start = None
                            ref = float(np.median(seq[start:j + 1]))
                cuts.append(w)
                # a cut sits where the weight changes among the columns no other line crosses; the crossed columns just
                # before (after) it go with the piece whose weight they show (a thin line running on as a box's heavy
                # top changes weight at the box's side, which crosses it there)
                for ci in range(1, len(cuts) - 1):
                    a_, c_, b_ = cuts[ci - 1], cuts[ci], cuts[ci + 1]
                    wo = tsm[a_:c_][~crossing[a_:c_]]; wn = tsm[c_:b_][~crossing[c_:b_]]
                    if not len(wo) or not len(wn):
                        continue
                    ro, rn = float(np.median(wo)), float(np.median(wn))
                    while c_ - 1 > a_ and crossing[c_ - 1] and abs(tsm[c_ - 1] - rn) < abs(tsm[c_ - 1] - ro):
                        c_ -= 1
                    while c_ + 1 < b_ and c_ == cuts[ci] and crossing[c_] and abs(tsm[c_] - ro) < abs(tsm[c_] - rn):
                        c_ += 1
                    cuts[ci] = c_
                if AXDBG is not None:
                    X_, Y_ = AXDBG if level else (AXDBG[1], AXDBG[0])
                    if x0 <= X_ <= x0 + w and y0 - 2 <= Y_ <= y0 + h + 2:
                        lo_ = max(0, X_ - x0 - 30); hi_ = min(w, X_ - x0 + 30)
                        print("cuts", [x0 + c for c in cuts], "cols", x0 + lo_, "..")
                        print(" tsm", " ".join("%.1f" % v for v in tsm[lo_:hi_]))
                        print(" crs", " ".join(" X " if v else " . " for v in crossing[lo_:hi_]))
                ys_all = np.arange(y0, y0 + h)[:, None] + 0.5
                for si in range(len(cuts) - 1):
                    c0_, c1_ = cuts[si], cuts[si + 1]
                    seg_t = tcol[c0_:c1_][~crossing[c0_:c1_]]
                    if not len(seg_t):
                        seg_t = tcol[c0_:c1_]
                    # the weight it mostly shows, read on its thinner part (a hairline the rendering drew 1 px here, 2 px
                    # there is a 1 px line); its centre where it shows that weight
                    t = float(np.percentile(seg_t, 35)) if len(seg_t) else 1.0
                    t = min(h + 1.0 * PX, max(0.6 * PX, t))
                    sel = (tcol[c0_:c1_] <= 1.25 * t + 0.25 * PX) & ~crossing[c0_:c1_]
                    if not sel.any():
                        sel = tcol[c0_:c1_] <= 1.25 * t + 0.25 * PX
                    dv_s = dv[:, c0_:c1_][:, sel]
                    cw = dv_s.sum(0)
                    okc = cw > 0
                    yc = float(np.median((dv_s * ys_all).sum(0)[okc] / cw[okc])) if okc.any() else float(np.median(cy))
                    # its ends where its ink across falls to half (a ragged anti-aliased end does not run it on)
                    med = float(np.median(across[c0_:c1_])) if c1_ > c0_ else 1.0
                    left = x0 + c0_ + (1.0 - min(1.0, across[c0_] / med) if si == 0 and med > 0 else 0.0)
                    right = x0 + c1_ - (1.0 - min(1.0, across[c1_ - 1] / med) if si == len(cuts) - 2 and med > 0 else 0.0)
                    xa, xb = left + t / 2.0, right - t / 2.0
                    if xb < xa:
                        xa = xb = (left + right) / 2.0
                    a_, b_ = (np.array([xa, yc]), np.array([xb, yc])) if level else (np.array([yc, xa]), np.array([yc, xb]))
                    lines.append({"k": "line", "a": a_, "b": b_, "w": t, "dark": dark, "na": 0, "nb": 0, "axis": True,
                                  "band": (level, x0, y0, w, h, band) if si == 0 else None})
                if level:
                    used[y0:y0 + h, x0:x0 + w] |= band.astype(np.uint8)
                else:
                    used[x0:x0 + w, y0:y0 + h] |= band.T.astype(np.uint8)
    # a short band whose end runs on into ink no band took is the straight part of a curve (a C's top, a basin's side):
    # left to the curves
    rest = stroke & (1 - used)
    keep, used2 = [], np.zeros_like(stroke)
    groups = []
    for e in lines:
        if e["band"] is not None:
            groups.append([e])
        else:
            groups[-1].append(e)
    for grp in groups:
        level, x0, y0, w, h, band = grp[0]["band"]
        for e in grp:
            e.pop("band")
        if w < 40 * PX and CONT:
            r_ = rest if level else rest.T
            q = 3 * PX
            ya, yb = max(0, y0 - q), min(r_.shape[0], y0 + h + q)
            left = r_[ya:yb, max(0, x0 - q):x0 + q].sum()
            right = r_[ya:yb, max(0, x0 + w - q):min(r_.shape[1], x0 + w + q)].sum()
            # an end that runs into a solid fill goes on as that fill (a heavy outline's corner), not as a curve: the
            # ink beside it there (hatching touching the outline) says nothing
            if fill is not None:
                f_ = fill if level else fill.T
                if f_[y0:y0 + h, max(0, x0 - q):x0].any():
                    left = 0
                if f_[y0:y0 + h, x0 + w:min(f_.shape[1], x0 + w + q)].any():
                    right = 0
            if left >= 3 * PX * PX or right >= 3 * PX * PX:
                _axdbg(level, x0, y0, w, h, "runs on into a curve: left %d right %d" % (left, right))
                continue
        if TANGENT and _runs_on_tangent(grp, level, x0, y0, w, h, rest, fill):
            _axdbg(level, x0, y0, w, h, "a thin band running on into a curve along it: left to the curves")
            continue
        _axdbg(level, x0, y0, w, h, "kept, %d pieces" % len(grp))
        keep += grp
        if level:
            used2[y0:y0 + h, x0:x0 + w] |= band.astype(np.uint8)
        else:
            used2[x0:x0 + w, y0:y0 + h] |= band.T.astype(np.uint8)
    return keep, used2


# ---------------------------------------------------------------- strokes
def skeleton_graph(mask, d):
    """the strokes' centre lines as chains between nodes (a junction's pixels are one node, at their centre), each chain
    with its ink: width (the ink across it, summed) and its darkness"""
    # corner-to-corner contacts made edge to edge first (at UP x, a 1 px staircase is blocks touching at corners, and
    # thinning would part them): the darker of the two pixels beside the touch is filled
    mask = mask.copy()
    for _ in range(2):
        a, b, c, e = mask[:-1, :-1], mask[:-1, 1:], mask[1:, :-1], mask[1:, 1:]
        main = (a > 0) & (e > 0) & (b == 0) & (c == 0)
        anti = (b > 0) & (c > 0) & (a == 0) & (e == 0)
        ys, xs = np.nonzero(main)
        pick_b = d[ys, xs + 1] >= d[ys + 1, xs]
        mask[ys[pick_b], xs[pick_b] + 1] = 1; mask[ys[~pick_b] + 1, xs[~pick_b]] = 1
        ys, xs = np.nonzero(anti)
        pick_a = d[ys, xs] >= d[ys + 1, xs + 1]
        mask[ys[pick_a], xs[pick_a]] = 1; mask[ys[~pick_a] + 1, xs[~pick_a] + 1] = 1
    sk = skeletonize(mask > 0).astype(np.uint8)
    half = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 3)
    # a junction is where three or more branches leave (the crossing number round the pixel), not just any pixel with
    # three neighbours (a staircase's corners have three)
    p = np.pad(sk, 1)
    H_, W_ = sk.shape
    ring = [p[0:H_, 1:W_ + 1], p[0:H_, 2:W_ + 2], p[1:H_ + 1, 2:W_ + 2], p[2:H_ + 2, 2:W_ + 2],
            p[2:H_ + 2, 1:W_ + 1], p[2:H_ + 2, 0:W_], p[1:H_ + 1, 0:W_], p[0:H_, 0:W_]]
    cn = np.zeros(sk.shape, np.int32)
    for i in range(8):
        cn += ((ring[i] == 0) & (ring[(i + 1) % 8] == 1)).astype(np.int32)
    junc = ((sk > 0) & (cn >= 3)).astype(np.uint8)
    nj, jlab, jst, jcen = cv2.connectedComponentsWithStats(junc, 8)
    rest = ((sk > 0) & (junc == 0)).astype(np.uint8)
    nc, clab = cv2.connectedComponents(rest, connectivity=8)
    # ink pixels to the nearest skeleton pixel: each chain's ink
    near = (cv2.dilate(mask, np.ones((3, 3), np.uint8)) > 0) & (d > 0.04)
    _, lbl = cv2.distanceTransformWithLabels((1 - sk).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(sk)
    l2chain = np.zeros(lbl.max() + 1, np.int32)
    l2chain[lbl[ys, xs]] = np.where(junc[ys, xs] > 0, 0, clab[ys, xs])
    l2pix = np.zeros(lbl.max() + 1, np.int64)
    l2pix[lbl[ys, xs]] = ys * mask.shape[1] + xs
    iy, ix = np.nonzero(near)
    owner = l2chain[lbl[iy, ix]]
    mass_pix = np.bincount(l2pix[lbl[iy, ix]], weights=d[iy, ix], minlength=mask.size)
    chains = []
    order = np.argsort(clab[ys, xs], kind="stable")
    cy_, cx_ = ys[order], xs[order]
    cl = clab[cy_, cx_]
    bounds = np.searchsorted(cl, np.arange(1, nc + 1))
    dark_by_chain = {}
    if len(owner):
        o_sort = np.argsort(owner, kind="stable")
        ob = np.searchsorted(owner[o_sort], np.arange(0, nc + 2))
        for c in range(1, nc):
            sel = o_sort[ob[c]:ob[c + 1]]
            if len(sel):
                dark_by_chain[c] = float(np.percentile(d[iy[sel], ix[sel]], 90))
    H, W = mask.shape
    extra_chains = []
    for c in range(1, nc):
        py, px = cy_[bounds[c - 1]:bounds[c]], cx_[bounds[c - 1]:bounds[c]]
        pix = set(zip(py.tolist(), px.tolist()))
        nb = {p: [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (p[0] + dy, p[1] + dx) in pix] for p in pix}
        ends = [p for p, q in nb.items() if len(q) <= 1]
        seen = set()
        walks = []
        starts = list(ends) + sorted(pix)
        for start in starts:
            if start in seen:
                continue
            seq, cur = [start], start
            seen.add(start)
            while True:
                nxt = [q for q in nb[cur] if q not in seen]
                if not nxt:
                    break
                # prefer a 4-neighbour step, so a staircase is walked pixel by pixel
                nxt.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
                cur = nxt[0]; seen.add(cur); seq.append(cur)
            walks.append(seq)
        # the main walk is the chain; pieces a staircase's corner left aside are kept as chains of their own
        walks.sort(key=len, reverse=True)
        for extra in walks[1:]:
            if len(extra) >= 2:
                extra_chains.append((extra, c))
        seq = walks[0]
        closed = not ends and len(seq) > 2
        def node_at(p):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    y, x = p[0] + dy, p[1] + dx
                    if 0 <= y < H and 0 <= x < W and jlab[y, x] > 0:
                        return int(jlab[y, x])
            return 0
        na, nb_ = (0, 0) if closed else (node_at(seq[0]), node_at(seq[-1]))
        pts = np.array([[x + 0.5, y + 0.5] for y, x in seq], float)      # pixel (x, y) covers [x, x+1)
        if closed:
            pts = np.vstack([pts, pts[:1]])
        per = mass_pix[[y * W + x for y, x in seq]]
        # the ink across the stroke per unit of its length (a diagonal's centre pixels stand 1.4 px apart)
        sq = np.array(seq, float)
        gap = np.linalg.norm(np.diff(sq, axis=0), axis=1) if len(sq) > 1 else np.ones(1)
        step = np.concatenate([[gap[0]], (gap[:-1] + gap[1:]) / 2, [gap[-1]]]) if len(sq) > 1 else np.ones(1)
        per = per / np.maximum(step, 1.0)
        core = per[2:-2] if len(per) > 6 else per
        chains.append({"pts": pts, "a": na, "b": nb_, "free_a": not closed and len(nb.get(seq[0], [])) <= 1 and not na,
                       "free_b": not closed and len(nb.get(seq[-1], [])) <= 1 and not nb_, "closed": closed,
                       "mass": float(np.median(core)) if len(core) else 1.0, "dark": dark_by_chain.get(c, 1.0), "n": len(seq),
                       # no wider than the ink is thick where the chain runs
                       "thick": 2.0 * float(max(half[y, x] for y, x in seq)) + 0.5})
    for seq, c in extra_chains:
        pts = np.array([[x + 0.5, y + 0.5] for y, x in seq], float)
        per = mass_pix[[y * W + x for y, x in seq]]
        # (as dark as the chain it was walked beside: a light diagonal's corner pieces are light too)
        chains.append({"pts": pts, "a": 0, "b": 0, "free_a": True, "free_b": True, "closed": False,
                       "mass": float(np.median(per)) if len(per) else 1.0, "dark": dark_by_chain.get(c, 1.0), "n": len(seq),
                       "thick": 2.0 * float(max(half[y, x] for y, x in seq)) + 0.5})
    # a lone dot (a skeleton pixel with no neighbour) is a chain of one point
    return chains, jcen


def prune_spurs(chains):
    """a short chain from a junction to a free end, no longer than the stroke is wide, is the stroke's own corner"""
    out = []
    for c in chains:
        w = c["mass"] / max(0.2, c["dark"])
        L = float(np.sum(np.linalg.norm(np.diff(c["pts"], axis=0), axis=1))) if len(c["pts"]) > 1 else 0.0
        spur = (c["free_a"] and c["b"]) or (c["free_b"] and c["a"])
        if spur and L <= 0.6 * w + 0.6 * PX:                       # a thick stroke's corner, not a tick drawn on a line
            continue
        out.append(c)
    return out


def fit_line(P):
    c = P.mean(0)
    u, s, vt = np.linalg.svd(P - c)
    d = vt[0]
    t = (P - c) @ d
    dev = np.abs((P - c) @ vt[1]) if len(vt) > 1 else np.zeros(len(P))
    return c, d, t.min(), t.max(), float(dev.max())


def fit_circle(P):
    x, y = P[:, 0], P[:, 1]
    A = np.stack([x, y, np.ones_like(x)], 1)
    b = -(x * x + y * y)
    try:
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy = -sol[0] / 2, -sol[1] / 2
    r2 = cx * cx + cy * cy - sol[2]
    if r2 <= 0:
        return None
    r = math.sqrt(r2)
    dev = np.abs(np.hypot(x - cx, y - cy) - r)
    return cx, cy, r, float(dev.max())


def _line_ok(P):
    if len(P) <= 2:
        return True
    c, d, t0, t1, dev = fit_line(P)
    if dev > FIT_PX:
        return False
    # a walk that goes out along a line and comes back beside it (two lines a pixel apart, joined at their ends) is two
    # lines, not one: the stretch's ends must be its extremes
    ta, tb = float((P[0] - c) @ d), float((P[-1] - c) @ d)
    return abs(tb - ta) >= (t1 - t0) - 2 * FIT_PX


def _arc_of(P):
    """a circular arc through the points, within FIT_PX, turning one way through 15 degrees or more"""
    if len(P) < 8 * PX:
        return None
    circ = fit_circle(P)
    if not circ:
        return None
    cx, cy, r, cdev = circ
    if cdev > FIT_PX or r < 3 * PX or r > 4000 * PX:
        return None
    ang = np.unwrap(np.arctan2(P[:, 1] - cy, P[:, 0] - cx))
    step = np.diff(ang)
    if len(step) and (np.all(step >= -0.02) or np.all(step <= 0.02)):
        span = abs(ang[-1] - ang[0])
        if math.radians(15) <= span <= 2 * math.pi + 0.1:
            return (cx, cy, r, float(ang[0]), float(ang[-1]))
    return None


ARC_OVER = os.environ.get("FT_ARCOVER", "1") == "1"


def fit_path(P, out):
    """straight segments and circular arcs, each within FIT_PX of the drawn centre: the run's corners found first (its
    simplified polyline), then from each corner the longest stretch that one straight line or one arc holds"""
    if len(P) < 2:
        return
    closed = len(P) > 3 and np.allclose(P[0], P[-1])
    if closed:
        arc = _arc_of(P)
        if arc and abs(arc[4] - arc[3]) >= 2 * math.pi - 0.3:
            cx, cy, r, a0, _ = arc
            out.append(("arc", (cx, cy, r, a0, a0 + 2 * math.pi), P[0], P[-1]))
            return
    keep = np.zeros(len(P), bool); keep[0] = keep[-1] = True
    stack = [(0, len(P) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        A, B = P[i], P[j]; ab = B - A; L = np.hypot(*ab)
        seg = P[i + 1:j]
        dd = np.abs(cross2(ab, seg - A)) / L if L > 1e-9 else np.linalg.norm(seg - A, axis=1)
        k = int(np.argmax(dd))
        if dd[k] > FIT_PX:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    V = np.nonzero(keep)[0]
    k = 0
    while k < len(V) - 1:
        # the longest straight stretch from V[k] ...
        m = k + 1
        while m + 1 < len(V) and _line_ok(P[V[k]:V[m + 1] + 1]):
            m += 1
        # ... unless one arc holds a longer stretch that really bends (its points stand off their chord by more than
        # twice the fit tolerance): a straight stroke's pixel stair is not an arc
        best = None
        for ma in range(len(V) - 1, max(k + 1, m), -1):
            arc = _arc_of(P[V[k]:V[ma] + 1])
            if arc:
                Q = P[V[k]:V[ma] + 1]; A_, B_ = Q[0], Q[-1]; L_ = np.linalg.norm(B_ - A_)
                sag = float(np.max(np.abs(cross2(B_ - A_, Q - A_)) / L_)) if L_ > 1e-9 else 0.0
                if sag > 2 * FIT_PX or (ARC_OVER and sag > FIT_PX and V[ma] >= V[m] + 4 * PX):
                    # (r7) or a gentle bend that one arc holds further than any straight stretch does: a long arc's
                    # shallow piece is not a polyline of two or three lines
                    best = (ma, arc)
                break
        if best:
            ma, arc = best
            out.append(("arc", arc, P[V[k]], P[V[ma]]))
            k = ma; continue
        seg = P[V[k]:V[m] + 1]
        if len(seg) > 2:
            c, d, t0, t1, _ = fit_line(seg)
            A = c + d * np.dot(seg[0] - c, d); B = c + d * np.dot(seg[-1] - c, d)
        else:
            A, B = seg[0], seg[-1]
        out.append(("line", A, B))
        k = m


def snap_line(a, b):
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
    if np.linalg.norm(b - a) <= 8 * PX:
        # a stub a few px long (a heavy box's short side, a jamb) leans only because its ends sit on junction centres
        if min(ang, 180 - ang) <= 12:
            y = (a[1] + b[1]) / 2.0; return np.array([a[0], y]), np.array([b[0], y])
        if abs(ang - 90) <= 12:
            x = (a[0] + b[0]) / 2.0; return np.array([x, a[1]]), np.array([x, b[1]])
    if min(ang, 180 - ang) <= SNAP_DEG and abs(b[1] - a[1]) <= 2 * SNAP_PX:
        y = (a[1] + b[1]) / 2.0; return np.array([a[0], y]), np.array([b[0], y])
    if abs(ang - 90) <= SNAP_DEG and abs(b[0] - a[0]) <= 2 * SNAP_PX:
        x = (a[0] + b[0]) / 2.0; return np.array([x, a[1]]), np.array([x, b[1]])
    return a, b


def fit_chains(chains):
    """each chain fitted as straight segments and arcs; the chain's ends keep their junction"""
    segs = []
    for ci, c in enumerate(chains):
        w = min(c["thick"], max(0.5, c["mass"] / max(0.2, c["dark"])))
        P = c["pts"]
        if len(P) == 1:
            segs.append({"k": "dot", "c": P[0], "w": w, "dark": c["dark"]}); continue
        out = []
        fit_path(P, out)
        run = []
        for i, s_ in enumerate(out):
            e = {"w": w, "dark": c["dark"], "na": c["a"] if i == 0 else -1, "nb": c["b"] if i == len(out) - 1 else -1}
            if s_[0] == "line":
                A_, B_ = np.asarray(s_[1], float), np.asarray(s_[2], float)
                if len(out) == 1 and np.linalg.norm(B_ - A_) <= 8 * PX:
                    # a stub between two lines (a heavy box's short side) leans only because its ends sit on the
                    # junctions' centres: set level or plumb now, so the corners close square
                    ang = math.degrees(math.atan2(B_[1] - A_[1], B_[0] - A_[0])) % 180
                    tol_ = 15 if np.linalg.norm(B_ - A_) > 4 * PX else 30      # a 2 px stub's angle says little
                    if min(ang, 180 - ang) <= tol_:
                        y_ = (A_[1] + B_[1]) / 2.0; A_, B_ = np.array([A_[0], y_]), np.array([B_[0], y_])
                    elif abs(ang - 90) <= tol_:
                        x_ = (A_[0] + B_[0]) / 2.0; A_, B_ = np.array([x_, A_[1]]), np.array([x_, B_[1]])
                e.update(k="line", a=A_, b=B_)
            else:
                cx, cy, r, a0, a1 = s_[1]
                e.update(k="arc", c=np.array([cx, cy]), r=r, a0=a0, a1=a1)
            run.append(e)
        # a short piece leaning into a level or plumb neighbour (a heavy outline's step: its centre line bends into the
        # corner) is a step: set square to that neighbour, its far end kept, so the corner closes square
        if len(run) > 1:
            ax_ = lambda e: (abs(_dir(e)[0]) >= math.cos(math.radians(SNAP_DEG))) or (abs(_dir(e)[1]) >= math.cos(math.radians(SNAP_DEG)))
            for i_, e in enumerate(run):
                if e["k"] != "line" or np.linalg.norm(e["b"] - e["a"]) > 6 * PX or ax_(e):
                    continue
                for j_, far in ((i_ - 1, "b"), (i_ + 1, "a")):
                    if not (0 <= j_ < len(run)) or run[j_]["k"] != "line" or not ax_(run[j_]) or \
                            np.linalg.norm(run[j_]["b"] - run[j_]["a"]) < 2 * PX:
                        continue
                    n_ = run[j_]; nd = _dir(n_)
                    if abs(float(np.dot(_dir(e), nd))) > math.cos(math.radians(65)):
                        continue                                # (not across its neighbour)
                    keep = e[far]                               # the end away from the neighbour
                    if abs(nd[0]) > abs(nd[1]):                 # neighbour level: the step is plumb
                        x_ = keep[0]; e["a"], e["b"] = np.array([x_, e["a"][1]]), np.array([x_, e["b"][1]])
                    else:                                       # neighbour plumb: the step is level
                        y_ = keep[1]; e["a"], e["b"] = np.array([e["a"][0], y_]), np.array([e["b"][0], y_])
                    break
        # one run, no breaks: two straight pieces meet where their lines cross (when that is near), a straight piece
        # ends where the arc after or before it ends
        arc_end = lambda e, k: e["c"] + e["r"] * np.array([math.cos(e[k]), math.sin(e[k])])
        for e, f in zip(run, run[1:]):
            if e["k"] == "line" and f["k"] == "line":
                X = _meet(e["a"], _dir(e), f["a"], _dir(f))
                if X is None or np.linalg.norm(X - e["b"]) > 2 * PX or np.linalg.norm(X - f["a"]) > 2 * PX:
                    X = (e["b"] + f["a"]) / 2
                e["b"] = X; f["a"] = X.copy()
            elif e["k"] == "line":
                e["b"] = arc_end(f, "a0")
            elif f["k"] == "line":
                f["a"] = arc_end(e, "a1")
        segs += run
    return segs


def _dir(e):
    v = e["b"] - e["a"]; L = np.linalg.norm(v)
    return v / L if L > 1e-9 else np.array([1.0, 0.0])


def merge_lines(segs, ink=None):
    """straight pieces meeting end to end along one line become one segment: pieces of a line the skeleton broke where
    other lines meet it (their ends at the same junction, or within 1.6 px), when all four ends lie within FIT_PX of
    the line through the two far ends"""
    lines = [e for e in segs if e["k"] == "line"]
    other = [e for e in segs if e["k"] != "line"]
    length = lambda e: float(np.linalg.norm(e["b"] - e["a"]))
    changed = True
    while changed:
        changed = False
        grid = {}
        for i, e in enumerate(lines):
            for end in ("a", "b"):
                grid.setdefault((int(e[end][0] // (4 * PX)), int(e[end][1] // (4 * PX))), []).append((i, end))
        dead = set()
        for i in range(len(lines)):
            if i in dead:
                continue
            for end in ("a", "b"):
                e = lines[i]
                if i in dead:
                    break
                p = e[end]; node = e["na" if end == "a" else "nb"]
                kx, ky = int(p[0] // (4 * PX)), int(p[1] // (4 * PX))
                best = None
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for j, endj in grid.get((kx + dx, ky + dy), []):
                            if j == i or j in dead:
                                continue
                            f = lines[j]
                            nodej = f["na" if endj == "a" else "nb"]
                            gap = np.linalg.norm(f[endj] - p)
                            # (a line broken where another crosses it: its two ends sit in the crossing's junction, which
                            # the skeleton may part into two nodes)
                            across = gap <= max(6 * PX, e["w"] + f["w"] + 2 * PX) and (
                                (node > 0 and nodej > 0) or (ink is not None and _inked(ink, p, f[endj])))
                            if not (gap <= 1.6 * PX or (node > 0 and node == nodej and gap <= 6 * PX) or across):
                                continue
                            far_e = e["b"] if end == "a" else e["a"]
                            far_f = f["b"] if endj == "a" else f["a"]
                            L = np.linalg.norm(far_f - far_e)
                            if L < 1e-6:
                                continue
                            u = (far_f - far_e) / L
                            if max(abs(cross2(u, q - far_e)) for q in (p, f[endj])) > FIT_PX + 0.3 * PX:
                                continue
                            # each piece must run along the line (not fold back on it)
                            if np.dot(p - far_e, u) < -PX or np.dot(far_f - f[endj], u) < -PX:
                                continue
                            Le, Lf = length(e), length(f)
                            if min(Le, Lf) >= 5 * PX and max(e["w"], f["w"]) > 1.6 * min(e["w"], f["w"]) + 0.3 * PX:
                                continue
                            if across and not (gap <= 1.6 * PX or (node > 0 and node == nodej and gap <= 6 * PX)) and (
                                    min(Le, Lf) < 6 * PX or max(e["w"], f["w"]) > 1.6 * min(e["w"], f["w"]) + 0.3 * PX
                                    or max(abs(cross2(u, q - far_e)) for q in (p, f[endj])) > 0.5 * PX):
                                continue                                # (across a crossing: one line's two long pieces of
                                                                        # one weight, in line - not a line and a dot beyond
                                                                        # a band, nor two lines a pixel apart, which a
                                                                        # join would draw slanted)
                            if e.get("axis") and f.get("axis") and max(e["w"], f["w"]) > 1.3 * min(e["w"], f["w"]):
                                continue                                # a line's pieces of different weight stay apart
                            if e.get("axis") and f.get("axis") and abs(cross2(_dir(e), f["a"] - e["a"])) > 0.5 * PX:
                                continue                                # two level lines a pixel apart (a rail running on
                                                                        # as a hanger's side) are a step, not one line
                            if best is None or gap < best[0]:
                                best = (gap, j, endj, far_e, far_f, Le, Lf)
                if best:
                    _, j, endj, far_e, far_f, Le, Lf = best
                    f = lines[j]
                    ne = dict(e)
                    wl = (Le + 1e-9) / (Le + Lf + 2e-9)
                    ne.update(a=far_e, b=far_f, w=e["w"] * wl + f["w"] * (1 - wl), dark=max(e["dark"], f["dark"]),
                              na=e["nb" if end == "a" else "na"], nb=f["nb" if endj == "a" else "na"])
                    lines[i] = ne; dead.add(j); changed = True
        lines = [e for k, e in enumerate(lines) if k not in dead]
    return lines + other


def _meet(p, u, q, v):
    den = cross2(u, v)
    if abs(den) < 1e-9:
        return None
    t = cross2(q - p, v) / den
    return p + u * t


MEET_ON = os.environ.get("FT_MEETON", "1") == "1"   # (r7) an end carried onto another line meets it within its drawn length


def join_ends(segs, solid, ink=None):
    """corners closed (two lines' ends near each other meet where their lines cross), a line's end at another line's
    side carried onto its centre line, and a free end short of a wall carried onto the wall"""
    lines = [e for e in segs if e["k"] == "line"]
    tip = lambda e, end: e["na" if end == "a" else "nb"] != -1     # a chain's end, not a joint inside a run
    ends = [(i, end) for i, e in enumerate(lines) for end in ("a", "b") if tip(e, end)]
    pos = np.array([lines[i][end] for i, end in ends]) if ends else np.zeros((0, 2))
    met = set()
    for k, (i, end) in enumerate(ends):
        if (i, end) in met:
            continue
        e = lines[i]; p = e[end]; u = _dir(e)
        reach = 1.5 * PX + e["w"]
        dd = np.linalg.norm(pos - p, axis=1)
        best = None
        for m in np.argsort(dd):
            if dd[m] > 2 * reach + 3 * PX:
                break
            j, endj = ends[m]
            if j == i or (j, endj) in met:
                continue
            f = lines[j]; v = _dir(f)
            if abs(np.dot(u, v)) > math.cos(math.radians(60)):         # a corner, not a bend along a curve
                continue
            X = _meet(p, u, f[endj], v)
            if X is None:
                continue
            if np.linalg.norm(X - p) <= e["w"] + 1.2 * PX and np.linalg.norm(X - f[endj]) <= f["w"] + 1.2 * PX:
                best = (j, endj, X); break
        if best:
            j, endj, X = best
            f = lines[j]
            # each end so that its square cap reaches the other line's far face, not past it
            ue = _dir(e) * (1 if end == "b" else -1); uf = _dir(f) * (1 if endj == "b" else -1)
            e[end] = X + ue * (f["w"] - e["w"]) / 2.0
            f[endj] = X + uf * (e["w"] - f["w"]) / 2.0
            met.add((i, end)); met.add((j, endj))
    # an end at another line's side
    for i, e in enumerate(lines):
        for end in ("a", "b"):
            if (i, end) in met or not tip(e, end):
                continue
            p = e[end]; u = _dir(e)
            # of the lines this end is at, the one it meets nearest (and most squarely): a joint line across a
            # hatched wall stops at the wall's outline, not at a hatch stroke that ends beside it
            best = None
            for j, f in enumerate(lines):
                if j == i:
                    continue
                v = _dir(f)
                if abs(np.dot(u, v)) > math.cos(math.radians(20)):
                    continue
                L = np.linalg.norm(f["b"] - f["a"])
                t = np.dot(p - f["a"], v)
                if t < -PX or t > L + PX:
                    continue
                side = abs(cross2(v, p - f["a"]))
                if side > f["w"] / 2 + e["w"] / 2 + 2.5 * PX:
                    continue
                X = _meet(p, u, f["a"], v)
                if X is not None and MEET_ON and not (-PX - f["w"] / 2 <= float(np.dot(X - f["a"], v)) <= L + PX + f["w"] / 2):
                    continue                                    # (r7) it would meet the line's run-on past its end
                if X is not None and np.linalg.norm(X - p) <= f["w"] / 2 + 3 * PX:
                    sin = abs(cross2(u, v))
                    rank = (float(np.linalg.norm(X - p)) - 0.5 * f["w"] * sin, -sin)
                    if best is None or rank < best[0]:
                        best = (rank, f, X, sin)
            if best is not None:
                _, f, X, sin = best
                # its square cap stops at the other line's far face; unless the drawing runs it on past that face
                # (a cross's arm past a box's side: the band's end is where its ink ends, so that is drawn)
                ue = u * (1 if end == "b" else -1)
                target = (f["w"] / max(0.3, sin) - e["w"]) / 2.0
                if e.get("axis") and float(np.dot(p - X, ue)) > target + 1.5 * PX and _inked(ink, X + ue * (target + f["w"] / 2.0 + 0.5 * PX), p):
                    met.add((i, end)); continue
                e[end] = X + ue * target
                met.add((i, end))
    # a free end short of a wall
    H, W = solid.shape
    for i, e in enumerate(lines):
        for end in ("a", "b"):
            if (i, end) in met or not tip(e, end):
                continue
            p = e[end]; u = _dir(e) * (1 if end == "b" else -1)
            for s_ in np.arange(0.5, 4.01 * PX, 0.5):
                q = p + u * s_
                x, y = int(math.floor(q[0])), int(math.floor(q[1]))
                if 0 <= x < W and 0 <= y < H and solid[y, x]:
                    e[end] = p + u * (s_ + 0.5); break
    return lines + [e for e in segs if e["k"] != "line"]


def _inked(ink, a, b):
    """the stretch a..b lies on ink (most of it): a line's end past another line is kept only where it is drawn"""
    if ink is None:
        return True
    L = float(np.linalg.norm(b - a))
    if L < 0.5:
        return True
    t = np.linspace(0.0, 1.0, max(2, int(L) + 1))[:, None]
    P = a[None] * (1 - t) + b[None] * t
    H, W = ink.shape
    xi = np.clip(np.floor(P[:, 0]).astype(int), 0, W - 1); yi = np.clip(np.floor(P[:, 1]).astype(int), 0, H - 1)
    return float((ink[yi, xi] > 0).mean()) >= 0.7


UP = int(__import__("os").environ.get("FT_UP", "2"))   # the picture is traced at UP x its size (close lines part, small shapes keep their form)
PX = 1                 # one pixel of the picture as given, in the pixels traced (UP while tracing)


def trace(path, keep_text=True):
    return trace_gray(cv2.imread(path, cv2.IMREAD_GRAYSCALE), keep_text)


def trace_gray(g0, keep_text=True):
    """the trace of a grey picture (uint8, H x W), in its pixels"""
    global FIT_PX, SNAP_PX, SOLID_R, EDGE_TOL, RUN, MARK_PX, PX
    interp = cv2.INTER_NEAREST if __import__("os").environ.get("FT_INTERP", "nearest") == "nearest" else cv2.INTER_CUBIC
    g = g0 if UP == 1 else cv2.resize(g0, None, fx=UP, fy=UP, interpolation=interp)
    base = (FIT_PX, SNAP_PX, SOLID_R, EDGE_TOL, RUN, MARK_PX)
    PX = UP
    FIT_PX, SNAP_PX, SOLID_R, EDGE_TOL, RUN, MARK_PX = [v * UP for v in base]
    try:
        return _trace(g0, g, keep_text)
    finally:
        FIT_PX, SNAP_PX, SOLID_R, EDGE_TOL, RUN, MARK_PX = base
        PX = 1


def _trace(g0, g, keep_text):
    d, paper, darkest = darkness(g)
    over = []
    # (only in a soft picture: in a crisp one each letter already stands apart, and the darker level would split a thin
    # anti-aliased line - a hairline cross, an N's diagonal - into pieces that pass for letters)
    # (and not in a tiny picture - a web thumbnail of 0.2 MP, its lettering 5-7 px tall - where the darker level cannot
    # tell a letter from a piece of wall between two doors: blind-graded worse there, 25 Oct)
    if OVERTEXT and g0.size >= OVER_MIN_PX and edge_steepness(g0) < OVER_SOFT:
        over_taken, over = letters_over_lines(d, g)
        if over_taken.any():
            d = np.where(over_taken > 0, 0.0, d).astype(d.dtype)
            g = np.where(over_taken > 0, paper, g).astype(g.dtype)
    # ink: dark enough, and at least CORE of the darkest ink beside it, so that close lines (hatching) stay apart where
    # the paper between them is greyed by the rendering
    import os
    mode = os.environ.get("FT_CORE", "both")
    weak_all = None
    vmask = np.zeros(d.shape, bool)
    if mode == "valley":
        peak = cv2.dilate(d, np.ones((5, 5), np.uint8))
        ink = ((d > INK) & ~(valleys(d) & (d < CORE * peak))).astype(np.uint8)
    elif mode == "p3":
        peak = cv2.dilate(d, np.ones((3, 3), np.uint8))
        ink = ((d > INK) & (d >= CORE * peak)).astype(np.uint8)
    elif mode == "p5":
        peak = cv2.dilate(d, np.ones((5, 5), np.uint8))
        ink = ((d > INK) & (d >= CORE * peak)).astype(np.uint8)
    else:   # valley5 or p3
        peak5 = cv2.dilate(d, np.ones((4 * PX + 1, 4 * PX + 1), np.uint8)); peak3 = cv2.dilate(d, np.ones((2 * PX + 1, 2 * PX + 1), np.uint8))
        vmask = valleys(d)
        keep = ~(vmask & (d < CORE * peak5)) & (d >= CORE * peak3)
        ink = ((d > INK) & keep).astype(np.uint8)
        weak_all = ((d > FAINT) & keep).astype(np.uint8)
        if FAINT < INK:
            # faint ink joined to ink (a light anti-aliased curve between its darker pixels), as in hysteresis
            weak = ((d > FAINT) & keep).astype(np.uint8)
            n, lab = cv2.connectedComponents(weak, connectivity=8)
            strong = np.zeros(n, bool); strong[np.unique(lab[ink > 0])] = True; strong[0] = False
            # only where the faint pixel is the darkest across it (a curve's own pixels, not a line's fringe)
            # (darkest across it in both directions: a line's fringe has the line beside it, darker)
            ridge = (d >= cv2.dilate(d, np.array([[0, 0, 0], [1, 0, 1], [0, 0, 0]], np.uint8)) - 0.02) & \
                    (d >= cv2.dilate(d, np.array([[0, 1, 0], [0, 0, 0], [0, 1, 0]], np.uint8)) - 0.02)
            ink = (ink | (strong[lab] & ridge & (weak > 0))).astype(np.uint8)
    if MOTTLE:
        ink = mottle_fill(ink, d, vmask)
    ink_pc = part_corners(ink, d, vmask)
    ink = bridge_gaps(ink_pc, d, ink & (1 - ink_pc)) if BRIDGE else ink_pc
    text = np.zeros_like(ink) if keep_text else lettering_mask(ink, g)
    ink = ink & (1 - text)
    polys, solid = solid_polygons(d, ink, g)
    polys += over
    K = np.ones((2 * PX + 1, 2 * PX + 1), np.uint8)
    if GREY:
        ga = grey_areas(d, solid)
        if ga.any():
            polys += grey_polygons(ga, g)
            # the grey itself is drawn as the fill; its darker lines (a wall's outline) stay line work
            ink = ink & (1 - (ga & (d < 0.9)))
            if weak_all is not None:
                weak_all = weak_all & (1 - (ga & (d < 0.9)))
    stroke = ink & (1 - cv2.dilate(solid, K))
    if MARK_PX:
        weak = ((weak_all | ink) if weak_all is not None else ink) & (1 - cv2.dilate(solid, K)) & (1 - text)
        marks, taken = small_marks(weak, stroke, d, g)
        polys += marks
        stroke = stroke & (1 - taken)
    fill_ = cv2.dilate(solid, np.ones((4 * PX + 1, 4 * PX + 1), np.uint8))
    rects = []
    if RECTS:
        rects = hollow_rects(stroke, d, fill_)
        # (a light rectangle's ring is whole only with its fainter ink; its inside, if narrow, greys with it too: the
        # ink is read at two more depths)
        free_ = (1 - cv2.dilate(solid, K)) & (1 - text) & ((1 - taken) if MARK_PX else 1)
        masks_ = [((d > t_) & (free_ > 0)) for t_ in (0.3, 0.14)]
        # (a loop whose inside is a pixel across: the inside is paper greyed between the two sides - a valley - and
        # its rounded ends are faint)
        masks_.append((d > FAINT) & ~vmask & (cv2.dilate(solid, K) == 0) & (text == 0))
        for m_ in masks_:
            for r in hollow_rects(m_.astype(np.uint8), d, fill_, taken if MARK_PX else None):
                cen = r["corners"].mean(0)
                if all(np.linalg.norm(cen - q["corners"].mean(0)) > 2 * PX for q in rects):
                    rects.append(r)
    if rects:
        rects = merge_rects(rects)
        # (r7) a hollow rectangle is drawn as itself: its outline is not read again as lines (its sides would run on into
        # the lines that meet it - a hanger's stem - and be drawn slanted); a line across it (a hanger's rail) stays
        om = np.zeros_like(stroke)
        for r in rects:
            r.pop("ring", None)
            pts = np.round(r["corners"] * 4).astype(np.int32)
            cv2.polylines(om, [pts], True, 1, max(1, int(round(r["w"] + PX))), cv2.LINE_8, shift=2)
    ax, used = axis_lines(stroke, d, fill_)
    if rects:
        ax = [e for e in ax if not _explained(_seg_points(e), rects, lambda r, e=e: r["w"] / 2.0 + e["w"] / 2.0 + FIT_PX)]
    # short heavy pieces (a step in a heavy outline, a jamb): level or plumb too, though shorter than RUN
    if os.environ.get("FT_SHORTBAND", "1") == "1":
        ax2, used2 = axis_lines(stroke & (1 - used), d, fill_, run=5 * PX, min_h=4 * PX)
        ax += ax2; used = used | used2
    rest = stroke & (1 - used)
    if rects:
        rest = rest & (1 - om)
    # crumbs a level or plumb line leaves at its edge
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest, 8)
    near_used = cv2.dilate(used, np.ones((3, 3), np.uint8))
    crumbs = [i for i in range(1, n) if (st[i, 4] <= 3 * PX * PX or (st[i, 4] <= 10 * PX * PX and max(st[i, 2], st[i, 3]) <= 4 * PX))
              and near_used[lab == i].any()]
    if crumbs:
        # a short piece that joins two lines (a double line's end cap, the step between two heavy lines) is drawn
        nu, labu = cv2.connectedComponents(used, connectivity=8)
        keep_c = []
        for i in crumbs:
            x, y, w, h = st[i, :4]
            ya, yb, xa, xb = max(0, y - 1), y + h + 1, max(0, x - 1), x + w + 1
            m = cv2.dilate((lab[ya:yb, xa:xb] == i).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            if len(set(np.unique(labu[ya:yb, xa:xb][m]).tolist()) - {0}) >= 2:
                keep_c.append(i)
            elif STEPS and _spans_gap(lab[y:y + h, x:x + w] == i, x, y, w, h, used, d[y:y + h, x:x + w]):
                keep_c.append(i)
        crumbs = [i for i in crumbs if i not in keep_c]
    if crumbs:
        rest[np.isin(lab, np.array(crumbs))] = 0
    chains, _ = skeleton_graph(rest, d * (1 - cv2.dilate(text, K)) * (1 - solid) * (1 - used))
    chains = prune_spurs(chains)
    segs = join_ends(merge_lines(fit_chains(chains) + ax, ink), solid, ink)
    if MARK_PX and MARK2:
        segs, marks2 = marks_on_lines(segs, weak & (1 - taken), d, g)
        polys += marks2
    if rects:
        segs, polys = rect_outlines(rects, segs, polys)
    if CURVES:
        segs = close_curves(segs, d, solid)
    if DASHES:
        segs, polys = align_dashes(segs, polys)
    # the fills' own line work: darker edges, and lighter lines through dark fills (their tone kept as lightness)
    rim, light = solid_polygons.rim, solid_polygons.light
    over = []
    if rim.any():
        rax, rused = axis_lines(rim, d)
        rch, _ = skeleton_graph(rim & (1 - rused), d * (1 - rused))
        over += merge_lines(fit_chains(prune_spurs(rch)) + rax)
    if light.any():
        inv = (1.0 - d) * (light > 0)
        lch, _ = skeleton_graph(light, inv)
        for e in merge_lines(fit_chains(lch)):
            e["light"] = True
            over.append(e)
    elems = []
    tone_dark = lambda dk: int(round(paper - min(1.0, dk) * (paper - darkest)))
    for e in segs + over:
        tone = (lambda dk: int(round(darkest + min(1.0, dk) * (paper - darkest)))) if e.get("light") else tone_dark
        if e["k"] == "line":
            a, b = snap_line(e["a"], e["b"])
            elems.append({"k": "line", "a": [round(float(a[0]), 2), round(float(a[1]), 2)], "b": [round(float(b[0]), 2), round(float(b[1]), 2)],
                          "w": round(float(e["w"]), 2), "g": tone(e["dark"])})
        elif e["k"] == "arc":
            elems.append({"k": "arc", "c": [round(float(e["c"][0]), 2), round(float(e["c"][1]), 2)], "r": round(float(e["r"]), 2),
                          "a0": round(float(e["a0"]), 4), "a1": round(float(e["a1"]), 4), "w": round(float(e["w"]), 2), "g": tone(e["dark"])})
        else:
            elems.append({"k": "dot", "c": [round(float(e["c"][0]), 2), round(float(e["c"][1]), 2)], "w": round(float(e["w"]), 2), "g": tone(e["dark"])})
        if e.get("light"):
            elems[-1]["light"] = True                           # (a light line through a dark fill: drawn over it)
    if UP > 1:
        f = 1.0 / UP
        for p in polys:
            p["rings"] = [[[round(x * f, 2), round(y * f, 2)] for x, y in r] for r in p["rings"]]
        for e in elems:
            for k_ in ("a", "b", "c"):
                if k_ in e:
                    e[k_] = [round(e[k_][0] * f, 2), round(e[k_][1] * f, 2)]
            e["w"] = round(e["w"] * f, 2)
            if "r" in e:
                e["r"] = round(e["r"] * f, 2)
    return {"size": [int(g0.shape[1]), int(g0.shape[0])], "paper": int(paper), "walls": polys, "strokes": elems,
            "text_px": int(text.sum())}


def to_svg(t):
    W, H = t["size"]
    pg = t["paper"]
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><rect width="100%%" height="100%%" fill="rgb(%d,%d,%d)"/>' % (W, H, W, H, pg, pg, pg)]
    col = lambda v: "rgb(%d,%d,%d)" % (v, v, v)
    for p in t["walls"]:
        d = " ".join("M" + " L".join("%.2f,%.2f" % (x, y) for x, y in r) + " Z" for r in p["rings"])
        out.append('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (d, col(p["g"])))
    for e in t["strokes"]:
        if e["k"] == "line":
            out.append('<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" stroke-width="%.2f" stroke-linecap="square"/>' % (
                e["a"][0], e["a"][1], e["b"][0], e["b"][1], col(e["g"]), e["w"]))
        elif e["k"] == "dot":
            out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"/>' % (e["c"][0], e["c"][1], max(0.5, e["w"] / 2), col(e["g"])))
        else:
            cx, cy = e["c"]; r = e["r"]; a0, a1 = e["a0"], e["a1"]
            if abs(a1 - a0) >= 2 * math.pi - 0.05:
                out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="none" stroke="%s" stroke-width="%.2f"/>' % (cx, cy, r, col(e["g"]), e["w"]))
                continue
            x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
            x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
            large = 1 if abs(a1 - a0) > math.pi else 0
            sweep = 1 if a1 > a0 else 0
            out.append('<path d="M%.2f,%.2f A%.2f,%.2f 0 %d %d %.2f,%.2f" fill="none" stroke="%s" stroke-width="%.2f"/>' % (
                x0, y0, r, r, large, sweep, x1, y1, col(e["g"]), e["w"]))
    out.append("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opt = dict(a.split("=", 1) if "=" in a else (a, True) for a in sys.argv[1:] if a.startswith("--"))
    t = trace(args[0], keep_text="--drop-text" not in opt)
    open(args[1], "w").write(to_svg(t))
    if "--json" in opt:
        json.dump(t, open(opt["--json"], "w"))
    print("%s: %d wall polygons, %d strokes (%d arcs), lettering %d px" % (
        args[0], len(t["walls"]), len(t["strokes"]), sum(1 for e in t["strokes"] if e["k"] == "arc"), t["text_px"]))
