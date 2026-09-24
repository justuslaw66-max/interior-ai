#!/usr/bin/env python3
"""
floorplan_vectorize.py  --  printed-raster extractor (stage 1 prototype)

raster floor plan  ->  structured model (JSON)  ->  clean, editable SVG

Nothing here traces pixel contours for walls/lines/text. Each element is
recognised as a primitive and re-drawn:

  walls      -> rectilinear polygons, exact 0/90 degree edges, sharp corners
  lines      -> <line>, grouped by measured pen weight (at most two classes), globally snapped coordinates
  dashed     -> ONE <line> with stroke-dasharray (not N little pieces)
  door arcs  -> true circular arcs (SVG 'A' command)
  diagonals  -> bi-fold door 'V's as straight polylines that end exactly on the line they spring from
  fixtures   -> WC / basin symbols recognised as whole shapes: exact lines + smooth cubics, circles, ellipses
                (the only place cubic Beziers are allowed); tiny dense symbols (taps) as sub-pixel silhouettes
  dim dots   -> <circle>, one shared radius (also dots fused in pairs and dots sitting on a wall face)
  text       -> live <text> (OCR), horizontal and vertical, one size per lettering class, width-fitted to the ink
  unread     -> lettering that could not be read is flagged in 'needs-review', never turned into linework

usage: python3 floorplan_vectorize.py input.png out_basename
"""
import os
import sys, json, math, re
import cv2
import numpy as np
if int(cv2.__version__.split(".")[0]) >= 5:
    sys.exit("This program was built and measured on OpenCV 4 (4.9 - 4.13); OpenCV %s returns several results in a different shape.\n"
             "Use the pinned versions:  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt  and run with .venv/bin/python3" % cv2.__version__)
import pytesseract
DEBUG = False
DEBUG_BOX = [float(v) for v in os.environ.get("FV_DEBUG_BOX", "").split(",")] if os.environ.get("FV_DEBUG_BOX") else None   # x0,y0,x1,y1 (working px)


def _dbg(tag, x, y, w, h, *more):
    """Trace what happens to candidates inside FV_DEBUG_BOX (development aid)."""
    if DEBUG_BOX and x < DEBUG_BOX[2] and x + w > DEBUG_BOX[0] and y < DEBUG_BOX[3] and y + h > DEBUG_BOX[1]:
        print("DBG", tag, x, y, w, h, *more)
from skimage.morphology import skeletonize

# ----------------------------------------------------------------- helpers

def cluster_1d(values, tol, weights=None, max_span=3.5):
    """Group 1-D values closer than tol. Returns {original_value: cluster_position}.
    A cluster may not grow wider than max_span (single-link chaining would otherwise walk a 300.5 edge over to 297 through
    a row of short ticks), and its position is the weighted mean, so a long line is not dragged about by short ones."""
    if not values:
        return {}
    weights = weights or {}
    vs = sorted(set(values))
    groups, cur = [], [vs[0]]
    for v in vs[1:]:
        if v - cur[-1] <= tol and v - cur[0] <= max_span:
            cur.append(v)
        else:
            groups.append(cur); cur = [v]
    groups.append(cur)
    out = {}
    for g in groups:
        w = np.array([weights.get(v, 1.0) for v in g], float)
        m = round(float(np.average(g, weights=w)) * 2) / 2.0          # half-pixel grid
        for v in g:
            out[v] = m
    return out


def signed_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def rectilinearise(poly, tol=3.0, soft_T=None):
    """Force every edge of a polygon to exactly horizontal or vertical.  soft_T (wall thickness) is given for blurred inputs:
    their corners come out as short slanted chamfers, so a short edge that is clearly not a 45-degree one is squared as well,
    and the passes repeat until nothing moves (squaring one edge can tilt its neighbour again)."""
    pts = [list(map(float, p)) for p in poly]
    n = len(pts)
    for _ in range(2 if soft_T is None else 8):
        moved = False
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
            if dx > dy and (dy <= tol or (soft_T is not None and dy <= 0.45 * dx and dy <= 0.3 * soft_T)):      # horizontal edge
                m = (a[1] + b[1]) / 2; moved = moved or dy > 1e-9; a[1] = b[1] = m
            elif dy > dx and (dx <= tol or (soft_T is not None and dx <= 0.45 * dy and dx <= 0.3 * soft_T)):    # vertical edge
                m = (a[0] + b[0]) / 2; moved = moved or dx > 1e-9; a[0] = b[0] = m
        if soft_T is not None and not moved:
            break
    if soft_T is not None:
        # a blurred corner comes out as a short diagonal between a horizontal and a vertical edge: put the corner back
        # (real 45-degree chamfers on walls are about a wall thickness long and stay)
        changed = True
        while changed and len(pts) > 4:
            changed = False; n = len(pts)
            for i in range(n):
                p0, a, b, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
                dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
                if dx < 0.5 or dy < 0.5 or math.hypot(dx, dy) > max(0.6 * soft_T, 16.0):
                    continue
                prev_h = abs(p0[1] - a[1]) < 0.5 and abs(p0[0] - a[0]) > 0.5
                prev_v = abs(p0[0] - a[0]) < 0.5 and abs(p0[1] - a[1]) > 0.5
                next_h = abs(p3[1] - b[1]) < 0.5 and abs(p3[0] - b[0]) > 0.5
                next_v = abs(p3[0] - b[0]) < 0.5 and abs(p3[1] - b[1]) > 0.5
                if prev_h and next_v:
                    corner = [b[0], a[1]]
                elif prev_v and next_h:
                    corner = [a[0], b[1]]
                elif prev_h and next_h:                     # a small step between two horizontals: make it a vertical riser
                    corner = None; a[0] = b[0] = (a[0] + b[0]) / 2.0; changed = True; break
                elif prev_v and next_v:
                    corner = None; a[1] = b[1] = (a[1] + b[1]) / 2.0; changed = True; break
                else:
                    continue
                j = (i + 1) % n
                pts[i] = corner
                del pts[j]
                changed = True; break
        n = len(pts)
    # drop duplicate / collinear vertices
    out = []
    for i in range(n):
        p, q, r = pts[i - 1], pts[i], pts[(i + 1) % n]
        if abs(q[0] - p[0]) + abs(q[1] - p[1]) < 0.75:
            continue
        cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
        if abs(cross) < 1e-6:
            continue
        out.append(q)
    return out


_OCT_N = {0: (0.0, 1.0), 90: (1.0, 0.0), 45: (-math.sqrt(0.5), math.sqrt(0.5)), 135: (math.sqrt(0.5), math.sqrt(0.5))}


def regularise_polygon(poly, T):
    """Soft inputs: a traced wall outline is a drawing made of straight faces in the four drawing directions (0 / 45 / 90 /
    135 degrees).  Every edge is put on its direction, jogs smaller than a third of a wall thickness are flattened (the face
    of the longest piece wins), blurred corners are squared, and the vertices are re-cut as intersections of the faces.
    A long edge that is clearly in none of the four directions keeps its own direction."""
    pts = []
    for p in poly:
        if not pts or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) >= 0.75:
            pts.append([float(p[0]), float(p[1])])
    if len(pts) > 1 and abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) < 0.75:
        pts.pop()
    if len(pts) < 4:
        return pts
    small, diag_min = 0.35 * T, max(0.6 * T, 16.0)
    E = []                                                  # [class, normal, offset, length, a, b]
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
        ang = math.degrees(math.atan2(dy, dx)) % 180.0
        best = min((0, 45, 90, 135), key=lambda c: min(abs(ang - c), 180 - abs(ang - c)))
        dev = min(abs(ang - best), 180 - abs(ang - best))
        if L > 2.0 * T and dev > 7.0:
            cls, nrm = "f%.1f" % ang, (-dy / L, dx / L)
        else:
            cls, nrm = best, _OCT_N[best]
        mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        E.append([cls, nrm, nrm[0] * mid[0] + nrm[1] * mid[1], L, a, b])
    orig_area = abs(signed_area(pts))
    changed = True
    while changed and len(E) > 3:
        changed = False
        # merge neighbours lying on the same face
        i = 0
        while i < len(E) and len(E) > 3:
            e, f_ = E[i], E[(i + 1) % len(E)]
            if e[0] == f_[0] and abs(e[2] - f_[2]) <= small:
                keep = e if e[3] >= f_[3] else f_
                E[i] = [keep[0], keep[1], keep[2], e[3] + f_[3], e[4], f_[5]]
                del E[(i + 1) % len(E)]; changed = True
                if i >= len(E):
                    i = len(E) - 1
            else:
                i += 1
        # the shortest removable run: a small jog (one to three short pieces) between two pieces of one face, a blurred
        # corner, or a sliver between two faces that simply meet
        cand = []
        nE = len(E)
        for i in range(nE):
            for k_ in (1, 2, 3):
                if nE - k_ < 4:
                    break
                run = [E[(i + j) % nE] for j in range(k_)]
                p_, q_ = E[i - 1], E[(i + k_) % nE]
                tot = sum(r_[3] for r_ in run)
                if p_[0] == q_[0] and abs(p_[2] - q_[2]) <= small and tot <= (small if k_ == 1 else 0.6 * T) and all(r_[0] != p_[0] for r_ in run[:1]):
                    cand.append((tot, i, k_))
            e = E[i]; p_, q_ = E[i - 1], E[(i + 1) % nE]
            if e[0] in (45, 135) and e[3] < diag_min and {p_[0], q_[0]} == {0, 90}:
                cand.append((e[3], i, 1))
            elif e[0] in (0, 90) and e[3] < 0.5 * T and {p_[0], q_[0]} == {45, 135}:
                cand.append((e[3], i, 1))
            elif e[3] < max(3.0, 0.1 * T) and p_[0] != q_[0]:
                cand.append((e[3], i, 1))
        if cand:
            _t, i, k_ = min(cand)
            for j in sorted(((i + j) % nE for j in range(k_)), reverse=True):
                del E[j]
            changed = True
    if len(E) < 3:
        return pts
    def cut(E_):
        out_ = []
        for i in range(len(E_)):
            e, f_ = E_[i], E_[(i + 1) % len(E_)]
            (a1, b1), c1, (a2, b2), c2 = e[1], e[2], f_[1], f_[2]
            det = a1 * b2 - a2 * b1
            if abs(det) < 1e-6:                             # parallel faces left side by side: keep the traced step between them
                j = e[5]
                out_.append([j[0] + a1 * (c1 - (a1 * j[0] + b1 * j[1])), j[1] + b1 * (c1 - (a1 * j[0] + b1 * j[1]))])
                out_.append([j[0] + a2 * (c2 - (a2 * j[0] + b2 * j[1])), j[1] + b2 * (c2 - (a2 * j[0] + b2 * j[1]))])
            else:
                out_.append([(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det])
        return out_
    out = cut(E)
    for _ in range(6):                                      # a face whose re-cut length is a sliver: its neighbours simply meet
        if len(E) <= 4 or len(out) != len(E):
            break
        ln = [math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]) for i in range(len(out))]   # face i runs out[i-1] -> out[i]
        k_ = min(range(len(E)), key=lambda i: ln[i])
        if ln[k_] >= max(3.0, 0.1 * T) or E[k_ - 1][0] == E[(k_ + 1) % len(E)][0]:
            break
        del E[k_]; out = cut(E)
    clean = []
    for p in out:
        if not clean or abs(p[0] - clean[-1][0]) + abs(p[1] - clean[-1][1]) >= 0.5:
            clean.append(p)
    if len(clean) > 1 and abs(clean[0][0] - clean[-1][0]) + abs(clean[0][1] - clean[-1][1]) < 0.5:
        clean.pop()
    area = abs(signed_area(clean)) if len(clean) >= 3 else 0.0
    if len(clean) < 3 or not (0.75 * orig_area <= area <= 1.3 * orig_area):
        return pts
    return clean


def fit_circle(pts):
    """Algebraic least-squares circle. pts: Nx2 (x,y)."""
    x, y = pts[:, 0], pts[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x ** 2 + y ** 2
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = sol[0], sol[1]
    r = math.sqrt(max(sol[2] + cx ** 2 + cy ** 2, 1e-9))
    return cx, cy, r


def ransac_circle(pts, r_min, r_max, iters=250, tol=1.6, rng=None):
    rng = rng or np.random.default_rng(0)
    best = None
    n = len(pts)
    if n < 25:
        return None
    for _ in range(iters):
        s = pts[rng.choice(n, 3, replace=False)]
        try:
            cx, cy, r = fit_circle(s)
        except Exception:
            continue
        if not (r_min <= r <= r_max):
            continue
        d = np.abs(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) - r)
        inl = d < tol
        if best is None or inl.sum() > best[0]:
            best = (inl.sum(), inl)
    if best is None:
        return None
    inl = best[1]
    if inl.sum() < 25:
        return None
    cx, cy, r = fit_circle(pts[inl])
    d = np.abs(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) - r)
    inl = d < tol
    return cx, cy, r, inl


def angular_span(pts, cx, cy):
    """Start/end angle (deg, image coords) of points on a circle: the complement of the largest gap."""
    ang = np.sort(np.degrees(np.arctan2(pts[:, 1] - cy, pts[:, 0] - cx)) % 360)
    gaps = np.diff(np.r_[ang, ang[0] + 360])
    k = int(np.argmax(gaps))
    start = ang[(k + 1) % len(ang)]
    span = 360 - gaps[k]
    return start, span


def trace_skeleton(sk):
    """Skeleton bitmap -> list of pixel chains [(x,y),...]."""
    ys, xs = np.nonzero(sk)
    pts = set(zip(ys.tolist(), xs.tolist()))
    def nb(p):
        return [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy or dx) and (p[0] + dy, p[1] + dx) in pts]
    deg = {p: len(nb(p)) for p in pts}
    nodes = {p for p in pts if deg[p] != 2}
    seen, paths = set(), []
    for n in nodes:
        for q in nb(n):
            if (n, q) in seen:
                continue
            path, prev, cur = [n, q], n, q
            seen.add((n, q))
            while cur not in nodes:
                nxt = [t for t in nb(cur) if t != prev and t not in path[-3:]]
                if not nxt:
                    break
                prev, cur = cur, nxt[0]
                path.append(cur)
            seen.add((cur, prev))
            paths.append(path)
    used = {p for path in paths for p in path}
    rest = pts - used
    while rest:                                            # closed loops
        start = rest.pop(); path = [start]; cur = start
        while True:
            nxt = [t for t in nb(cur) if t in rest]
            if not nxt:
                break
            cur = nxt[0]; rest.discard(cur); path.append(cur)
        if len(path) > 6:
            path.append(start)
        paths.append(path)
    return [[(x + 0.5, y + 0.5) for (y, x) in p] for p in paths if len(p) >= 4]



# ------------------------------------------------ fixture curve fitting

def _bez(ctrl, t):
    t = np.asarray(t)[:, None]
    return ((1 - t) ** 3) * ctrl[0] + 3 * ((1 - t) ** 2) * t * ctrl[1] + 3 * (1 - t) * t ** 2 * ctrl[2] + t ** 3 * ctrl[3]


def _unit(v):
    n = float(np.hypot(*v))
    return v / n if n > 1e-9 else np.array([1.0, 0.0])


def _fit_one_cubic(pts, u, t1, t2):
    b0, b1, b2, b3 = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u ** 2 * (1 - u), u ** 3
    a1, a2 = t1[None, :] * b1[:, None], t2[None, :] * b2[:, None]
    c00, c01, c11 = (a1 * a1).sum(), (a1 * a2).sum(), (a2 * a2).sum()
    tmp = pts - (pts[0][None, :] * (b0 + b1)[:, None] + pts[-1][None, :] * (b2 + b3)[:, None])
    x0, x1 = (a1 * tmp).sum(), (a2 * tmp).sum()
    det = c00 * c11 - c01 * c01
    chord = float(np.hypot(*(pts[-1] - pts[0])))
    if abs(det) > 1e-9:
        al1, al2 = (x0 * c11 - x1 * c01) / det, (c00 * x1 - c01 * x0) / det
    else:
        al1 = al2 = 0.0
    if al1 < 1e-3 * chord or al2 < 1e-3 * chord or al1 > 3 * chord or al2 > 3 * chord:
        al1 = al2 = chord / 3.0
    return np.array([pts[0], pts[0] + t1 * al1, pts[-1] + t2 * al2, pts[-1]])


def fit_cubics(pts, tol, t1=None, t2=None, depth=0):
    """Schneider's algorithm: a point chain -> list of cubic Beziers (4x2 arrays) within tol."""
    pts = np.asarray(pts, float)
    k = min(4, len(pts) - 1)
    t1 = _unit(pts[k] - pts[0]) if t1 is None else t1
    t2 = _unit(pts[-1 - k] - pts[-1]) if t2 is None else t2
    if len(pts) <= 2 or float(np.hypot(*(pts[-1] - pts[0]))) < 1e-6 and len(pts) < 4:
        d = float(np.hypot(*(pts[-1] - pts[0]))) / 3.0
        return [np.array([pts[0], pts[0] + t1 * d, pts[-1] + t2 * d, pts[-1]])]
    seg = np.hypot(*np.diff(pts, axis=0).T)
    u = np.r_[0, np.cumsum(seg)]
    u = u / u[-1] if u[-1] > 0 else np.linspace(0, 1, len(pts))
    ctrl, err, worst = None, 1e9, len(pts) // 2
    for _ in range(5):
        ctrl = _fit_one_cubic(pts, u, t1, t2)
        d = np.hypot(*(_bez(ctrl, u) - pts).T)
        worst, err = int(np.argmax(d)), float(d.max())
        if err <= tol:
            return [ctrl]
        # Newton re-parameterisation
        q = _bez(ctrl, u)
        d1 = 3 * (ctrl[1:] - ctrl[:-1]); d2 = 2 * (d1[1:] - d1[:-1])
        tt = u[:, None]
        q1 = (1 - tt) ** 2 * d1[0] + 2 * (1 - tt) * tt * d1[1] + tt ** 2 * d1[2]
        q2 = (1 - tt) * d2[0] + tt * d2[1]
        num = ((q - pts) * q1).sum(1); den = (q1 * q1).sum(1) + ((q - pts) * q2).sum(1)
        u = np.clip(u - np.where(np.abs(den) > 1e-9, num / np.where(den == 0, 1, den), 0), 0, 1)
        u[0], u[-1] = 0.0, 1.0
        u = np.maximum.accumulate(u)
    if depth > 8 or len(pts) < 6:
        return [ctrl]
    worst = min(max(worst, 2), len(pts) - 3)
    tc = _unit(pts[worst - 2] - pts[worst + 2])
    return fit_cubics(pts[:worst + 1], tol, t1, tc, depth + 1) + fit_cubics(pts[worst:], tol, -tc, t2, depth + 1)


def arc_centre(p0, p1, r, large, sweep):
    """Centre of the SVG circular arc p0 -> p1 (screen coordinates, y down)."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0; L_ = float(np.hypot(*d)); r = max(r, L_ / 2.0 + 1e-9)
    h = math.sqrt(max(0.0, r * r - L_ * L_ / 4.0))
    nrm = np.array([-d[1], d[0]]) / (L_ or 1.0)
    sgn = 1.0 if (large != sweep) else -1.0
    return (p0 + p1) / 2.0 + sgn * h * nrm, r


def arc_points(p0, p1, r, large, sweep, n=32):
    c, r = arc_centre(p0, p1, r, large, sweep)
    a0 = math.atan2(p0[1] - c[1], p0[0] - c[0]); a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
    span = ((a1 - a0) if sweep else (a0 - a1)) % (2 * math.pi)
    tt = a0 + (1 if sweep else -1) * np.linspace(0, span, n)
    return np.c_[c[0] + r * np.cos(tt), c[1] + r * np.sin(tt)]


def _chord_dev(p):
    a, b = p[0], p[-1]
    n = float(np.hypot(*(b - a)))
    if n < 1e-9:
        return float(np.hypot(*(p - a).T).max())
    return float(np.abs((p[:, 0] - a[0]) * (b[1] - a[1]) - (p[:, 1] - a[1]) * (b[0] - a[0])).max() / n)


def fit_fixture_chain(pts, T, tol=0.9, arcs=True):
    """One skeleton chain -> path segments. Straight parts become exact lines (axis-aligned where the ink is),
    the rest become smooth cubics that leave the lines tangentially. A smooth closed loop becomes an ellipse."""
    pts = np.asarray(pts, float)
    closed = len(pts) > 8 and float(np.hypot(*(pts[0] - pts[-1]))) < 1.5
    n = len(pts)
    k = 5
    # 1. corners
    corner = []
    if n > 2 * k + 1:
        idx = range(n - 1) if closed else range(k, n - k)
        ang = {}
        for i in idx:
            a, b = (pts[(i - k) % (n - 1)], pts[(i + k) % (n - 1)]) if closed else (pts[i - k], pts[i + k])
            v1, v2 = pts[i] - a, b - pts[i]
            c = float(np.dot(_unit(v1), _unit(v2)))
            ang[i] = math.degrees(math.acos(max(-1, min(1, c))))
        for i, a in ang.items():
            if a >= 50 and all(a >= ang.get((i + j) % (n - 1) if closed else i + j, 0) for j in range(-k, k + 1)):
                if not corner or min(abs(i - corner[-1]), (n - 1) - abs(i - corner[-1]) if closed else 1e9) > k:
                    corner.append(i)
    if closed and not corner:
        if n >= 12:
            (ex, ey), (ma, mi), rot = cv2.fitEllipse(pts.astype(np.float32).reshape(-1, 1, 2))
            th = np.radians(rot); tt = np.linspace(0, 2 * np.pi, 240, endpoint=False)
            ell = np.c_[ex + ma / 2 * np.cos(tt) * np.cos(th) - mi / 2 * np.sin(tt) * np.sin(th),
                        ey + ma / 2 * np.cos(tt) * np.sin(th) + mi / 2 * np.sin(tt) * np.cos(th)]
            dist = np.hypot(pts[:, None, 0] - ell[None, :, 0], pts[:, None, 1] - ell[None, :, 1]).min(1)
            if dist.max() <= 1.2 and min(ma, mi) > 3:
                if abs(ma - mi) <= 0.08 * max(ma, mi) + 0.5:
                    r = (ma + mi) / 4
                    return {"type": "circle", "cx": float(ex), "cy": float(ey), "r": float(r)}
                q = round(rot / 90.0) * 90.0
                if abs(q - rot) < 4:
                    rot = q
                return {"type": "ellipse", "cx": float(ex), "cy": float(ey), "rx": float(ma / 2), "ry": float(mi / 2), "rot": float(rot % 180)}
    if closed and corner:                                   # start the loop at a corner
        r0 = corner[0]
        pts = np.vstack([pts[r0:-1], pts[:r0 + 1]])
        corner = sorted(((c - r0) % (n - 1)) for c in corner)
    cuts = [0] + [c for c in corner if 0 < c < len(pts) - 1] + [len(pts) - 1]
    # 2. inside each corner-to-corner span: long axis-aligned straight runs, otherwise curve
    pieces = []                                             # (i0, i1, kind)
    Lmin = max(14.0, 0.6 * T)
    for c0, c1 in zip(cuts, cuts[1:]):
        span = pts[c0:c1 + 1]
        if len(span) < 2:
            continue
        if _chord_dev(span) <= 0.9:
            pieces.append((c0, c1, "L")); continue
        i = c0
        cur = c0
        while i < c1:
            j, best = i + 1, None
            while j <= c1:
                seg_ = pts[i:j + 1]
                d = pts[j] - pts[i]
                if _chord_dev(seg_) > 0.6:
                    break
                best = j; j += 1
            if best is not None:
                d = pts[best] - pts[i]
                off_axis = min(abs(d[0]), abs(d[1])) > max(1.0, 0.07 * max(abs(d[0]), abs(d[1])))
            if best is not None and float(np.hypot(*(pts[best] - pts[i]))) >= (max(24.0, 0.8 * T) if off_axis else Lmin):
                if i > cur:
                    pieces.append((cur, i, "C"))
                pieces.append((i, best, "L")); cur = i = best
            else:
                i += 1
        if cur < c1:
            pieces.append((cur, c1, "C"))
    # 3. knots; axis-align the straight pieces
    K = {}
    for i0, i1, _k in pieces:
        K.setdefault(i0, pts[i0].copy()); K.setdefault(i1, pts[i1].copy())
    for i0, i1, kind in pieces:
        if kind != "L":
            continue
        d = pts[i1] - pts[i0]
        if abs(d[1]) <= max(1.0, 0.07 * abs(d[0])):
            y = round(float(np.mean(pts[i0:i1 + 1, 1])) * 2) / 2; K[i0][1] = K[i1][1] = y
        elif abs(d[0]) <= max(1.0, 0.07 * abs(d[1])):
            x = round(float(np.mean(pts[i0:i1 + 1, 0])) * 2) / 2; K[i0][0] = K[i1][0] = x
    if closed and pieces:
        K[pieces[-1][1]] = K[pieces[0][0]]
    segs = []
    for n_, (i0, i1, kind) in enumerate(pieces):
        if kind == "L":
            segs.append(["L", K[i1].tolist()]); continue
        data = pts[i0:i1 + 1].copy()
        if len(data) >= 7:                                  # pixel chains are stair-stepped: smooth before fitting
            ker = np.ones(7) / 7.0
            pad = np.vstack([data[:1]] * 3 + [data] + [data[-1:]] * 3)
            sm = np.c_[np.convolve(pad[:, 0], ker, "valid"), np.convolve(pad[:, 1], ker, "valid")]
            data = sm
        data[0], data[-1] = K[i0], K[i1]
        t1 = t2 = None
        if n_ > 0 and pieces[n_ - 1][2] == "L" and pieces[n_ - 1][1] == i0 and i0 not in corner:
            t1 = _unit(K[i0] - K[pieces[n_ - 1][0]])
        if n_ + 1 < len(pieces) and pieces[n_ + 1][2] == "L" and i1 not in corner:
            t2 = _unit(K[i1] - K[pieces[n_ + 1][1]])
        arc = None
        if arcs and len(data) >= 12:                        # a circular arc is smoother (and more honest) than a chain of cubics
            ccx, ccy, rr = fit_circle(data)
            res = np.abs(np.hypot(data[:, 0] - ccx, data[:, 1] - ccy) - rr)
            a0 = math.atan2(data[0][1] - ccy, data[0][0] - ccx); am = math.atan2(data[len(data) // 2][1] - ccy, data[len(data) // 2][0] - ccx)
            a1 = math.atan2(data[-1][1] - ccy, data[-1][0] - ccx)
            sweep = 1 if ((am - a0) % (2 * math.pi)) < ((a1 - a0) % (2 * math.pi)) else 0
            span = ((a1 - a0) if sweep else (a0 - a1)) % (2 * math.pi)
            if res.max() <= 1.0 and rr <= 12 * T and math.radians(25) <= span <= math.radians(330):
                # keep the end points, solve the radius that passes exactly through them with this centre side
                arc = ["A", data[-1].tolist(), float(rr), 1 if span > math.pi else 0, sweep]
        if arc:
            segs.append(arc); continue
        for c in fit_cubics(data, tol, t1, t2):
            segs.append(["C", c[1].tolist(), c[2].tolist(), c[3].tolist()])
    if not pieces:
        return None
    return {"type": "path", "start": K[pieces[0][0]].tolist(), "segs": segs, "closed": bool(closed)}


# words that appear on residential plans; used only to repair a read that is ONE character away from a known word
PLAN_VOCAB = {"BATH/", "WC", "BATH", "BEDROOM", "MAIN", "MASTER", "LIVING/", "LIVING", "DINING", "KITCHEN", "SERVICE",
              "YARD", "HOUSE-", "HOLD", "HOUSEHOLD", "SHELTER", "AIR-CON", "LEDGE", "SUGGESTED", "STUDY", "STORE",
              "BALCONY", "UTILITY", "FOYER", "ENTRANCE", "TOILET", "STOREROOM", "DRY", "WET", "ROOM", "FAMILY",
              "JUNIOR", "GUEST", "CORRIDOR", "PLANTER", "RC", "DB", "BOX", "DUCT", "RISER", "VOID", "LIFT", "LOBBY",
              "W.C.", "ACCESS", "DROP", "SCALE", "MODEL", "(CORRIDOR)", "EXECUTIVE", "APARTMENT", "(POINT", "BLOCK)", "PANTRY",
              "(APT.", "SHELTER)", "KITCHEN/", "W.C.", "STORE/", "DINING", "4-ROOM", "3-ROOM", "5-ROOM", "1:100", "WC.", "BATH/W.C."}


# Private-housing (condominium / landed) brochure terms, written down from general knowledge of how such plans are lettered -
# NOT collected from the benchmark's truth files.  Two-letter words are only taken from a confident read (see ocr_source_res).
PLAN_VOCAB |= {"HS", "AC", "A/C", "PES", "ST", "SH", "W/D", "DB/ST", "WD", "COMMON", "JR.", "JR", "SUITE", "ENSUITE", "LINEN", "WARDROBE",
               "WALK-IN", "TERRACE", "ROOF", "COURTYARD", "PRIVATE", "ENCLOSED", "SPACE", "TRELLIS", "TURFING", "KITCHENETTE", "POWDER",
               "PATIO", "DECK", "POOL", "GARDEN", "LAWN", "LOUNGE", "ISLAND", "LAUNDRY", "MAID", "MAID'S", "HELPER", "HELPER'S", "DRESSING",
               "VANITY", "SHOWER", "BATHROOM", "ABOVE", "BELOW", "OPEN", "SKY", "(OPEN", "SKY)", "ONLY", "LEVEL", "UPPER", "LOWER", "STOREY",
               "ATTIC", "STAIRCASE", "STAIRS", "BAY", "WINDOW", "TYPE", "AREA", "UNIT", "SQM", "SQFT", "FIN", "ARCHITECTURAL", "EXTERNAL",
               "SCREEN", "CANOPY", "STY", "2ND", "1ST", "AT", "TO", "DINING", "LIVING", "HOUSE", "WASH", "REFUSE", "CHUTE", "BOMB", "CD",
               "POWDER", "WORKSPACE", "NOOK", "DEN", "FLEXI", "DUAL", "KEY", "STUDIO", "BAR", "COUNTER", "DRYING", "LOBBY", "PASSAGE", "HALL"}


def _letters_only_change(tok, v):
    """A repair corrects a misread LETTER.  It never turns a digit that was read into something else ('BATH2' is 'BATH 2',
    not 'BATH/').  A punctuation mark may be read for another ('BATH:' for 'BATH/'); whether a trailing slash is really there is
    checked against the drawing afterwards (validate_slash_labels)."""
    if len(tok) != len(v):
        return all(ch.isalpha() or ch in tok for ch in v) and sum(ch.isdigit() for ch in tok) == sum(ch.isdigit() for ch in v)
    alike = {("8", "B"), ("0", "O"), ("1", "I"), ("5", "S"), ("2", "Z"), ("6", "G"), ("0", "D"), ("1", "L")}   # a digit read for the letter it looks like
    return all(a_ == b_ or (a_.isalpha() and b_.isalpha()) or (not a_.isalnum() and not b_.isdigit()) or (a_, b_) in alike for a_, b_ in zip(tok, v))


def vocab_fix(st, loose=False):
    out = []
    for tok in st.split():
        m_ = re.fullmatch(r"([A-Z][A-Z.\-]{2,})([0-9])", tok)
        if m_ and m_.group(1) in PLAN_VOCAB:                 # 'BATH2', 'BEDROOM3': the space was lost, nothing else
            out += [m_.group(1), m_.group(2)]; continue
        if any(ch.isalpha() for ch in tok) and tok not in PLAN_VOCAB and len(tok) >= 4:
            c = [v for v in PLAN_VOCAB if len(v) == len(tok) and lev(v, tok) == 1 and _letters_only_change(tok, v)]
            if len(c) == 1:
                tok = c[0]
            elif loose and len(tok) >= 6:                   # blurred input: two slips in a long word still leave only one candidate
                c = [v for v in PLAN_VOCAB if abs(len(v) - len(tok)) <= 1 and lev(v, tok) <= 2 and _letters_only_change(tok, v)]
                if len(c) == 1:
                    tok = c[0]
        out.append(tok)
    return " ".join(out)



def merge_smooth_chains(chains, reach=7.0, min_turn=152.0):
    """Skeleton chains are cut at every branch point. A drafter's stroke runs straight THROUGH a branch point, so join
    the two chain ends that continue each other most smoothly, repeatedly. A stroke that returns to its start closes."""
    def out_dir(ch, e):                                     # direction leaving the node along the chain
        pts = ch if e == 0 else ch[::-1]
        d = np.cumsum(np.r_[0, np.hypot(*np.diff(pts, axis=0).T)])
        j = min(max(int(np.searchsorted(d, reach)), 1), len(pts) - 1)
        return _unit(pts[j] - pts[0])
    closed, open_ = [], []
    for c in chains:
        c = np.asarray(c, float)
        (closed if len(c) > 8 and np.hypot(*(c[0] - c[-1])) < 1.5 else open_).append(c)
    while True:
        best = None
        for a in range(len(open_)):
            for ea in (0, -1):
                for b in range(a, len(open_)):
                    for eb in (0, -1):
                        if a == b and (ea == eb or len(open_[a]) < 12):
                            continue
                        if np.hypot(*(open_[a][ea] - open_[b][eb])) > 0.75:
                            continue
                        ang = math.degrees(math.acos(max(-1, min(1, float(np.dot(out_dir(open_[a], ea), out_dir(open_[b], eb)))))))
                        if ang >= min_turn and (best is None or ang > best[0]):
                            best = (ang, a, ea, b, eb)
        if best is None:
            return closed + open_
        _ang, a, ea, b, eb = best
        if a == b:                                          # the stroke meets its own start: a closed outline
            c = open_.pop(a); c[-1] = c[0]; closed.append(c); continue
        A = open_[a] if ea == -1 else open_[a][::-1]        # ... -> node
        B = open_[b] if eb == 0 else open_[b][::-1]         # node -> ...
        merged = np.vstack([A, B[1:]])
        open_ = [c for i_, c in enumerate(open_) if i_ not in (a, b)] + [merged]


# ---------------------------------------------------------------- pipeline

def deskew(gray):
    edges = cv2.Canny(gray, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 1800, 120,
                            minLineLength=gray.shape[1] // 8, maxLineGap=6)
    if lines is None:
        return gray, 0.0
    devs, wts = [], []
    for x1, y1, x2, y2 in lines[:, 0]:
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        d = ((a + 45) % 90) - 45                           # deviation from 0/90
        if abs(d) < 8:
            devs.append(d); wts.append(math.hypot(x2 - x1, y2 - y1))
    if not devs:
        return gray, 0.0
    order = np.argsort(devs); cw = np.cumsum(np.array(wts)[order])
    ang = float(np.array(devs)[order][np.searchsorted(cw, cw[-1] / 2)])  # weighted median
    if abs(ang) < 0.08:
        return gray, 0.0
    h, w = gray.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderValue=255), ang


def flatten_background(bgr):
    """Marketing plans are printed on a tint, with rooms filled in colour and a watermark across the sheet.  The drawing is
    the DARK linework; everything else is background.  Returns (grey image with the background taken to white, True), or
    (plain grey, False) for a drawing that is already black on white (those are left exactly as they were)."""
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    chroma = bgr.max(axis=2).astype(int) - bgr.min(axis=2).astype(int)
    if np.percentile(lum, 60) >= 252 and float((chroma > 18).mean()) <= 0.03:
        return lum, False
    k_ = max(31, int(round(0.035 * max(lum.shape))) | 1)
    bg = cv2.morphologyEx(lum, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_, k_)))
    bg = np.maximum(cv2.GaussianBlur(bg, (0, 0), 5), 160)     # (a solid black wall wider than the probe stays black against >= 160)
    norm = lum.astype(np.float32) / bg.astype(np.float32)
    return np.clip(norm / 0.88 * 255.0, 0, 255).astype(np.uint8), True      # within 12 % of its background = paper (tints, watermark)


def remove_watermark(gray):
    """A website or agency watermark is laid across the sheet in a PALE tone with strokes far fatter than any line of the
    drawing.  Pale ink (>= 170) that survives a 7 px opening is background; the pale rim around it goes with it.  Dark ink is
    never touched, thin pale lines (furniture drawn in light grey) are never touched.  Returns (gray, fraction removed)."""
    pale = (((gray >= 170) & (gray < 240)) * 255).astype(np.uint8)
    fat = cv2.morphologyEx(pale, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    frac = float((fat > 0).mean())
    if frac < 0.004:
        return gray, 0.0                                   # nothing of the kind on this sheet: not a pixel is changed
    zone = cv2.dilate(fat, np.ones((7, 7), np.uint8)) > 0
    out = gray.copy()
    out[zone & (gray >= 150)] = 255
    return out, frac


def normalise_wall_paint(gray):
    """Marketing plans paint their walls in a flat GREY instead of black.  If the fat solid regions of the sheet are
    (almost) all of one grey tone and there is next to no fat black, that tone is this drawing's wall paint: it is taken to
    black for the pipeline (a wall like any other) and drawn in its own tone again at the end.  Returns (gray, tone or None)."""
    k = np.ones((7, 7), np.uint8)
    dark = cv2.morphologyEx(((gray < 60) * 255).astype(np.uint8), cv2.MORPH_OPEN, k)
    mid = cv2.morphologyEx((((gray >= 60) & (gray < 170)) * 255).astype(np.uint8), cv2.MORPH_OPEN, k)
    a_dark, a_mid = int((dark > 0).sum()), int((mid > 0).sum())
    if a_mid < 0.01 * gray.size or a_dark > 0.2 * a_mid:
        return gray, None
    vals = gray[mid > 0]
    tone = int(np.median(vals))
    if float(np.mean(np.abs(vals.astype(int) - tone) <= 12)) < 0.8:
        return gray, None                                   # several greys: fills of different kinds, not one wall paint
    out = gray.copy()
    paint = cv2.dilate(mid, np.ones((5, 5), np.uint8)) > 0
    sel = paint & (gray < 200)
    # keep the anti-aliased edge where it is: tone -> 0, paper stays paper, in proportion
    out[sel] = np.clip((gray[sel].astype(np.float32) - tone) * 255.0 / max(1.0, 255.0 - tone), 0, 255).astype(np.uint8)
    return out, tone


def detect_hatched_walls(gray):
    """CAD renders draw walls as a heavy outline filled with thin 45-degree hatching instead of solid black.  The walls are
    the CLOSED CELLS of the heavy outline that are full of hatch.  Returns None, or {'solid': mask of the walls out to the
    outer edge of their outline, 'spacing', 'slash', 'outline_px', 'grey'}."""
    ink = ((gray < 215) * 255).astype(np.uint8)
    thick = cv2.dilate(cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((3, 3), np.uint8))
    best = None
    for slash in (True, False):
        k = np.zeros((9, 9), np.uint8)
        for i in range(9):
            k[i, (8 - i) if slash else i] = 1
        d = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)
        d[thick > 0] = 0                                    # hatch lines are hairlines
        if best is None or int(d.sum()) > int(best[0].sum()):
            best = (d, slash)
    d, slash = best
    gaps = []
    for y in range(0, gray.shape[0], 7):
        xs = np.where(d[y] > 0)[0]
        if len(xs) > 3:
            gaps += [v for v in np.diff(xs) if 3 <= v <= 40]
    if len(gaps) < 200:
        return None
    sp = int(np.median(gaps))
    if float(np.mean([abs(v - sp) <= 1 for v in gaps])) < 0.5:
        return None                                         # no steady rhythm: diagonal strokes of something else
    sep = cv2.morphologyEx(((gray < 100) * 255).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, _c = cv2.connectedComponentsWithStats(((sep == 0) * 255).astype(np.uint8), connectivity=4)
    cnt_h = np.bincount(lab[d > 0], minlength=n)
    cells = np.zeros_like(d)
    for i in range(1, n):
        a = st[i, 4]
        if 4 * sp * sp <= a < 0.2 * gray.size and cnt_h[i] / float(a) >= 0.06:
            cells[lab == i] = 255
    if float((cells > 0).mean()) < 0.01:
        return None
    ot = 2 * int(np.ceil(np.median(cv2.distanceTransform(sep, cv2.DIST_L2, 3)[sep > 0]))) + 3
    solid = cells | (cv2.dilate(cells, np.ones((2 * ot + 1, 2 * ot + 1), np.uint8)) & sep)
    # width of the outline = its ink (as darkness, so anti-aliased edges count for what they are) per unit length of wall edge
    band = (cv2.dilate(cells, np.ones((2 * ot + 1, 2 * ot + 1), np.uint8)) > 0) & (cells == 0)
    cn_, _h = cv2.findContours(solid, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    per_ = sum(cv2.arcLength(c_, True) for c_ in cn_)
    ow = float(((255.0 - gray[band].astype(np.float32)) / 255.0).sum() / max(1.0, per_))
    hp_ = gray[(d > 0) & (cells > 0)]
    return {"solid": solid, "spacing": sp, "slash": bool(slash), "outline_px": round(ow, 1), "grey": int(np.percentile(hp_, 25))}


def plan_region(gray):
    """The part of a page that is the drawing.  A brochure page carries the plan in a corner with a title, legend,
    footnotes and a key plan around it; tracing all of that costs minutes and starves the plan of resolution.  The drawing is
    the cluster of ink richest in long straight runs (walls, dimension lines), grown to take in whatever touches it."""
    H, W = gray.shape; L = max(W, H)
    ink = ((gray < 235) * 255).astype(np.uint8)
    run = int(max(12, 0.02 * L))
    long_h = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, run), np.uint8))
    long_v = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((run, 1), np.uint8))
    long_ = cv2.bitwise_or(long_h, long_v)
    k = int(max(9, 0.015 * L)) | 1
    blob = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(blob, connectivity=8)
    comps = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        mine = lab[y:y + h, x:x + w] == i
        # walls run both ways; a paragraph, a scale bar or a title runs one way only
        both = min(int((long_h[y:y + h, x:x + w] > 0)[mine].sum()), int((long_v[y:y + h, x:x + w] > 0)[mine].sum()))
        comps.append([int((long_[y:y + h, x:x + w] > 0)[mine].sum()), int(x), int(y), int(x + w), int(y + h), both])
    if not comps:
        return None
    comps.sort(reverse=True)
    _s, x0, y0, x1, y1, _b = comps[0]; m = int(0.03 * L)
    taken = {0}; changed = True
    while changed:
        changed = False
        for j, (_sc, a, b, c, d, _b2) in enumerate(comps):
            if j not in taken and a < x1 + m and c > x0 - m and b < y1 + m and d > y0 - m:
                x0, y0, x1, y1 = min(x0, a), min(y0, b), max(x1, c), max(y1, d); taken.add(j); changed = True
    # Nothing that could be part of the plan may be left outside: if any piece left out carries more than a small share
    # of the drawing's two-way linework (a key plan has a little; a detached wing of the plan has a lot), the page is
    # traced whole.  A wrong crop would lose rooms for good; a needless full-page run only costs time.
    inside = sum(comps[j][5] for j in taken)
    if any(comps[j][5] > 0.08 * inside for j in range(len(comps)) if j not in taken):
        return None
    m2 = int(0.04 * L)
    return max(0, x0 - m2), max(0, y0 - m2), min(W, x1 + m2), min(H, y1 + m2)


def find_scale_bar(g, exclude=None):
    """A graphic scale bar on the page: a wide flat mark (blocks or a line with ticks) with numbers and a unit written
    along it.  Returns page-pixel geometry and mm per page pixel, or None."""
    H, W = g.shape
    ink = ((g < 200) * 255).astype(np.uint8)
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((1, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    cands = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if not (1 <= h <= 40 and w >= 8 * h and 0.04 * W <= w <= 0.6 * W):
            continue
        if exclude and x < exclude[2] and x + w > exclude[0] and y < exclude[3] and y + h > exclude[1]:
            continue
        cands.append((int(x), int(y), int(w), int(h)))
    best = None
    cands.sort(key=lambda c_: -c_[1])                          # scale bars sit low on the page
    for x, y, w, h in cands[:25]:
        x0, x1 = max(0, x - int(0.12 * w)), min(W, x + w + int(0.15 * w))
        y0, y1 = max(0, y - 3 * h - 30), min(H, y + h + 30)
        band = g[y0:y1, x0:x1]
        big = cv2.resize(band, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        toks = []
        for psm in (7, 11):
            d = pytesseract.image_to_data(big, config="--psm %d -c tessedit_char_whitelist=0123456789.mMftFT" % psm, output_type=pytesseract.Output.DICT)
            got = []
            for t, l, wd, cf in zip(d["text"], d["left"], d["width"], d["conf"]):
                t = t.strip()
                mm_ = re.match(r"^(\d+(?:\.\d+)?)\s*(m|M|ft|FT)?$", t)
                if mm_ and float(cf) > 30:
                    got.append((float(mm_.group(1)), (mm_.group(2) or "").lower(), x0 + (l + wd / 2.0) / 3.0))
            if len(got) > len(toks):
                toks = got
        if len(toks) < 2:
            continue
        unit = "ft" if any(u == "ft" for _v, u, _x in toks) else "m"
        per = 304.8 if unit == "ft" else 1000.0
        vals = sorted(set(v for v, _u, _x in toks))
        if len(vals) < 2 or max(vals) > (60 if unit == "ft" else 30):
            continue
        # the numbers are written near the stops, not on them: snap each to the nearest tick (a column where the mark
        # stands taller than its bar - an end tick, or the step of a stepped line)
        mine = ink[y:y + h, x:x + w] > 0
        extent = mine.sum(axis=0)
        tall = extent >= max(2.0, 0.45 * extent.max())
        ticks = [float(x), float(x + w - 1)]                       # the mark's two ends are stops as well
        for cx_ in range(w):
            if tall[cx_] and (cx_ == 0 or not tall[cx_ - 1]):
                run_end = cx_
                while run_end + 1 < w and tall[run_end + 1]:
                    run_end += 1
                ticks.append(x + 0.5 * (cx_ + run_end))
        if ticks:
            snapped = []
            for v_, u_, px_ in toks:
                near = min(ticks, key=lambda t_: abs(t_ - px_))
                snapped.append((v_, u_, near if abs(near - px_) <= max(6.0, 1.2 * h) + 0.06 * w else px_))
            toks = snapped
        # least squares mm per px over the labels; they must line up (a caption of numbers would not)
        xs = np.array([t[2] for t in toks]); vs = np.array([t[0] * per for t in toks])
        A = np.vstack([xs, np.ones_like(xs)]).T
        (k, b), res, _r, _s = np.linalg.lstsq(A, vs, rcond=None)
        if k <= 0:
            continue
        pred = A @ np.array([k, b]); err = float(np.abs(pred - vs).max())
        if err > 0.08 * (vs.max() - vs.min() + 1e-9) + 0.5 * k * h:
            continue
        # the drawn bar must span about the labelled length
        span_px = (vs.max() - vs.min()) / k
        if not (0.8 * w <= span_px <= 1.25 * w):
            continue
        zero_x = -b / k
        cand = {"x0": float(zero_x), "x1": float(zero_x + vs.max() / k), "y": float(y + h / 2.0), "mm": float(vs.max()),
                "mm_per_px": float(k), "unit": unit, "labels": [[float(v), float(px)] for v, _u, px in toks], "labelFitErrorMm": round(err, 1)}
        if best is None or len(toks) > len(best["labels"]):
            best = cand
    return best


def stated_area(page_gray, exclude=None):
    """The floor area printed on a brochure page ("81 sqm / 872 sqft", "Area : 71 sq.m"), read off the whole page in
    one pass.  A check on the scale, never a scale: at the right scale the rooms add up to about this figure."""
    g = page_gray
    if exclude is not None:                                      # the drawing itself carries no area statement
        g = g.copy(); g[exclude[1]:exclude[3], exclude[0]:exclude[2]] = 255
    try:
        text = pytesseract.image_to_string(g, config="--psm 11")
    except Exception:
        return None
    found = []
    for mt in re.finditer(r"(\d{2,4}(?:\.\d)?)\s*(sqm|sq\.?\s*m\b|m2|m\u00b2|sqft|sq\.?\s*ft\b)", text, re.I):
        v = float(mt.group(1)); u = mt.group(2).lower().replace(" ", "").replace(".", "")
        m2 = v / 10.7639 if u.startswith("sqft") or u == "sqft" else v
        if 15 <= m2 <= 1500:
            found.append({"text": mt.group(0).strip(), "m2": round(m2, 1)})
    if not found:
        return None
    # the largest sqm figure is the unit; "(inclusive of 6 sqm balcony)" and the like are its parts
    main = max(found, key=lambda f_: f_["m2"])
    inc = re.search(r"inclusive of ([^)\n]*)", text, re.I)
    return {"m2": main["m2"], "text": main["text"], "parts": [f_ for f_ in found if f_ is not main], "inclusiveNote": inc.group(0).strip() if inc else None}


def extract(path):
    bgr0 = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr0 is None:
        sys.exit("cannot read an image from %r (no such file, or not a PNG / JPEG / WebP)" % path)
    gray0, flattened = flatten_background(bgr0)
    if not flattened:
        gray0 = cv2.imread(path, cv2.IMREAD_GRAYSCALE)      # (exactly the decode used so far: a JPEG's own grey differs by 1 from BGR->grey)
    gray0, wm_frac = remove_watermark(gray0)
    gray0, wall_tone = normalise_wall_paint(gray0)
    # a bold scan: every stroke 5-7 px fat.  All of it would pass for 'wall'.  The drawing is brought to the stroke width the
    # pipeline is built for (the typical stroke is 1 px on every other plan seen; measured 7 on the one bold scan)
    ink0_ = ((gray0 < 128) * 255).astype(np.uint8)
    sk0_ = skeletonize(ink0_ > 0)
    sw0_ = float(np.median(cv2.distanceTransform(ink0_, cv2.DIST_L2, 5)[sk0_]) * 2 - 1) if sk0_.any() else 1.0
    pre_scale = 1.0
    orig_size = [int(gray0.shape[1]), int(gray0.shape[0])]
    if sw0_ >= 4.0:
        pre_scale = max(0.35, 2.5 / sw0_)
        gray0 = cv2.resize(gray0, None, fx=pre_scale, fy=pre_scale, interpolation=cv2.INTER_AREA)
    gray, skew = deskew(gray0)
    hatch = detect_hatched_walls(gray)
    if hatch is not None:
        gray = gray.copy(); gray[hatch["solid"] > 0] = 0    # from here on a hatched wall is a wall like any other; it is DRAWN hatched again at the end
    H0, W0 = gray.shape
    page_gray = gray                                             # the whole deskewed page (a scale bar or a title lives outside the plan)
    crop = plan_region(gray)
    if crop is not None and (crop[2] - crop[0]) * (crop[3] - crop[1]) < 0.5 * W0 * H0:
        gray = gray[crop[1]:crop[3], crop[0]:crop[2]]
    else:
        crop = None
    # A graphic scale bar (brochure pages) gives the scale before anything is traced: it is read off the whole page, and
    # it decides the working resolution when the drawing itself is small.
    bar = find_scale_bar(page_gray, exclude=crop)
    # ---- working resolution ------------------------------------------------------------------------------------------
    # Every pixel constant below was tuned where a structural wall is ~30 px thick. A brochure JPEG has 10 px walls and
    # 9 px lettering, so it is enlarged to the same working scale first (the model and the SVG viewBox are then in working
    # pixels; the SVG keeps the source's width/height, and mm_per_px refers to working pixels).
    def wall_T(g_):
        ink_ = ((g_ < 128) * 255).astype(np.uint8)
        dt_ = cv2.distanceTransform(ink_, cv2.DIST_L2, 5)
        k_ = int(max(9, dt_.max() * 0.5))
        wm_ = cv2.morphologyEx(ink_, cv2.MORPH_OPEN, np.ones((k_, k_), np.uint8))
        if not wm_.any():
            return 20.0
        return float(np.median(cv2.distanceTransform(wm_, cv2.DIST_L2, 5)[skeletonize(wm_ > 0)]) * 2)
    def softness(g_):
        """Mid-grey pixels per perimeter pixel around solid black: ~0.7 for a crisp screenshot, ~2 for a blurred JPEG."""
        w_ = cv2.morphologyEx(((g_ < 60) * 255).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        er_ = cv2.erode(w_, np.ones((3, 3), np.uint8))
        per_ = int(((w_ > 0) & (er_ == 0)).sum())
        band_ = (cv2.dilate(w_, np.ones((7, 7), np.uint8)) > 0) & (er_ == 0)
        return float((band_ & (g_ > 60) & (g_ < 215)).sum()) / max(1, per_)
    T0 = wall_T(gray)
    soft_R = softness(gray)
    work_scale = 1 if T0 >= 24 else int(min(3, max(2, round(30.0 / max(T0, 1.0)))))
    if work_scale > 1:
        gray = cv2.resize(gray, None, fx=work_scale, fy=work_scale, interpolation=cv2.INTER_CUBIC)
    H, W = gray.shape
    otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    # clean digital backgrounds: keep faint anti-aliased hairlines (door arcs, dimension lines)
    clean_bg = np.percentile(gray, 60) >= 250 and (np.abs(gray.astype(int) - 255) < 6).mean() > 0.7
    # a crisp screenshot has 1px hairlines that only reach grey ~175, so the threshold must sit at 215 to keep them; a
    # blurred / enlarged image has lines that reach ~100 with wide skirts, and 215 would fatten and fuse them
    soft = work_scale > 1 or soft_R > 1.4
    peak = soft_R
    thr = (max(otsu, 180 if soft else 215)) if clean_bg else otsu
    ink = ((gray < thr) * 255).astype(np.uint8)
    model = {"size": [W, H], "source_size": [W0, H0], "work_scale": work_scale, "skew_deg": round(skew, 3),
             "ink_threshold": int(thr), "edge_softness": round(soft_R, 2), "soft_input": bool(soft)}
    if crop is not None:
        model["crop_offset"] = [int(crop[0]), int(crop[1])]     # of the traced part within the deskewed page, in page pixels
        model["page_size"] = [int(W0), int(H0)]
    if bar is not None:
        model["scale_bar"] = bar                                  # page pixels; mm_per_px there is per PAGE pixel
    if crop is not None or bar is not None:                      # a page with margins around the plan: look for its printed area
        area = stated_area(page_gray, exclude=crop)
        if area:
            model["stated_area"] = area
    model["_page_gray"] = page_gray
    if flattened:
        model["background_flattened"] = True
    if pre_scale != 1.0:
        model["pre_scale"] = round(pre_scale, 4); model["source_size"] = orig_size
    if wm_frac:
        model["watermark_removed"] = round(wm_frac, 4)
    if wall_tone is not None:
        model["wall_style"] = {"fill": int(wall_tone)}
    if hatch is not None:
        model["wall_style"] = {"hatch": {"spacing": hatch["spacing"] * work_scale, "slash": hatch["slash"], "grey": hatch["grey"]},
                               "outline_px": hatch["outline_px"] * work_scale}

    # ---- 1. walls: thick ink only -------------------------------------
    # soft inputs: structural walls are true black; mid-grey bands (parapets, sills, lightweight walls) are a class of their
    # own and must not be drawn black. The wall edge is taken near the half level, not at the blurred skirt.
    ink_wall = ((gray < 100) * 255).astype(np.uint8) if soft else ink
    dt = cv2.distanceTransform(ink_wall, cv2.DIST_L2, 5)
    k = int(max(9, dt.max() * 0.5))
    if soft:
        # 'half the thickest block' drops the thin black band walls when a plan also has fat columns: tie it to the image scale
        k = int(max(4 * work_scale + 1, min(k, 5 * work_scale + 1)))
    wall_mask = cv2.morphologyEx(ink_wall, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(wall_mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 2 * k * k or max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) < 3.5 * k:
            wall_mask[lab == i] = 0
        elif soft and float(np.median(gray[lab == i])) > 62:
            wall_mask[lab == i] = 0                         # a dark-grey (80-110) lightweight wall is not structural black: grey solid
    wall_dt = cv2.distanceTransform(wall_mask, cv2.DIST_L2, 5)
    T = float(np.median(wall_dt[skeletonize(wall_mask > 0)]) * 2) if wall_mask.any() else 20.0
    if soft:
        # T is the ruler for every constant below and was calibrated on the ink mask: measure it there, draw walls from black
        wm_ = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((int(max(9, cv2.distanceTransform(ink, cv2.DIST_L2, 5).max() * 0.5)),) * 2, np.uint8))
        if wm_.any():
            T = float(np.median(cv2.distanceTransform(wm_, cv2.DIST_L2, 5)[skeletonize(wm_ > 0)]) * 2)
    model["wall_thickness_px"] = round(T, 1)

    walls = []
    cnts, hier = cv2.findContours(wall_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    for ci, c in enumerate(cnts):
        is_hole = hier[0][ci][3] != -1
        if cv2.contourArea(c) < k * k:
            continue
        poly = cv2.approxPolyDP(c, 2.0, True)[:, 0, :].astype(float) + 0.5
        poly = rectilinearise(poly.tolist(), tol=max(3.0, T * 0.15), soft_T=T if soft else None)
        if soft:
            poly = regularise_polygon(poly, T)
        if len(poly) < (3 if soft else 4):
            continue
        # contour runs through boundary pixel centres: push edges out by half a pixel
        d = -0.5 if is_hole else 0.5
        cx = np.mean([p[0] for p in poly]); cy = np.mean([p[1] for p in poly])
        sgn = 1 if signed_area(poly) > 0 else -1
        off = []
        for i, q in enumerate(poly):
            p, r = poly[i - 1], poly[(i + 1) % len(poly)]
            def nrm(a, b):
                ex, ey = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ey) or 1
                return (sgn * ey / L, -sgn * ex / L)
            n1, n2 = nrm(p, q), nrm(q, r)
            off.append([q[0] + d * (n1[0] + n2[0]), q[1] + d * (n1[1] + n2[1])])
        walls.append({"hole": bool(is_hole), "parent": int(hier[0][ci][3]), "idx": ci, "pts": off})

    if soft:
        # solid black bars thinner than a wall but far thicker than a line (a window sash drawn solid): black rectangles too
        k2 = 4 * work_scale - 1
        bm_ = cv2.morphologyEx(ink_wall, cv2.MORPH_OPEN, np.ones((k2, k2), np.uint8))
        bm_[cv2.dilate(wall_mask, np.ones((5, 5), np.uint8)) > 0] = 0
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(bm_)
        for i in range(1, n_):
            x_, y_, w_, h_, a_ = [int(v) for v in st_[i]]
            lng_, sht_ = max(w_, h_), min(w_, h_)
            if sht_ <= k + 2 and lng_ >= max(1.2 * T, 5 * sht_) and a_ >= 0.7 * w_ * h_ and float(np.median(gray[lab_ == i])) <= 62:
                walls.append({"hole": False, "parent": -1, "idx": 10000 + i, "bar": True,
                              "pts": [[x_ - 0.5, y_ - 0.5], [x_ + w_ + 0.5, y_ - 0.5], [x_ + w_ + 0.5, y_ + h_ + 0.5], [x_ - 0.5, y_ + h_ + 0.5]]})
                wall_mask[lab_ == i] = 255
    wall_block = cv2.dilate(wall_mask, np.ones((5, 5), np.uint8))
    if soft:
        wall_block = cv2.dilate(wall_mask, np.ones((9, 9), np.uint8)) & ink      # the blurred skirt of a wall belongs to the wall
    thin = cv2.bitwise_and(ink, cv2.bitwise_not(wall_block))

    # ---- 1b. grey solids (soft inputs): flat mid-grey plateaus at least ~3 source px thick -----------------
    greys = []
    if soft:
        ws_ = work_scale
        band_ = ((gray > 70) & (gray < 190)).astype(np.uint8) * 255
        kk_ = np.ones((2 * ws_ + 1, 2 * ws_ + 1), np.uint8)
        rng_ = cv2.dilate(gray, kk_).astype(int) - cv2.erode(gray, kk_).astype(int)
        core_ = (((band_ > 0) & (rng_ < 32)) * 255).astype(np.uint8)
        core_ = cv2.morphologyEx(core_, cv2.MORPH_OPEN, np.ones((ws_ + 1, ws_ + 1), np.uint8))
        core_[wall_block > 0] = 0
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(core_)
        cdt_ = cv2.distanceTransform(core_, cv2.DIST_L2, 5)
        grey_mask = np.zeros_like(core_)
        for i in range(1, n_):
            if st_[i, 4] >= 30 * ws_ * ws_ and max(st_[i, 2], st_[i, 3]) >= 10 * ws_ and 2 * cdt_[lab_ == i].max() >= 2 * ws_ + 0.5:
                grey_mask[lab_ == i] = 255
        grey_mask = cv2.dilate(grey_mask, np.ones((2 * ws_ + 3, 2 * ws_ + 3), np.uint8)) & (((gray < 205) & (gray > 65)) * 255).astype(np.uint8)
        grey_mask[wall_block > 0] = 0
        grey_mask = cv2.morphologyEx(grey_mask, cv2.MORPH_OPEN, np.ones((2 * ws_ + 1, 2 * ws_ + 1), np.uint8))
        cnts_, _h = cv2.findContours(grey_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c_ in cnts_:
            if cv2.contourArea(c_) < 40 * ws_ * ws_:
                continue
            poly_ = cv2.approxPolyDP(c_, 2.0, True)[:, 0, :].astype(float) + 0.5
            poly_ = regularise_polygon(rectilinearise(poly_.tolist(), tol=max(3.0, T * 0.15), soft_T=T), T)
            if len(poly_) >= 3:
                m_ = np.zeros_like(grey_mask); cv2.drawContours(m_, [c_], -1, 255, -1)
                greys.append({"pts": poly_, "grey": int(np.median(gray[(m_ > 0) & (core_ > 0)])) if ((m_ > 0) & (core_ > 0)).any() else 128})
        # A grey band is a bar: an exact rectangle that runs from the wall (or band) it starts at to the one it ends at.  Traced
        # from a blurred image it comes out cut in pieces by every line, swing or dimension line crossing it and a few px
        # short of what it meets.  Pieces of one bar are joined, ends are taken to the face they were heading for, crumbs go.
        def _rect(g_):
            xs_ = sorted({round(p_[0], 1) for p_ in g_["pts"]}); ys_ = sorted({round(p_[1], 1) for p_ in g_["pts"]})
            return [xs_[0], ys_[0], xs_[1], ys_[1]] if len(g_["pts"]) == 4 and len(xs_) == 2 and len(ys_) == 2 else None
        bars_, polys_ = [], []
        for g_ in greys:
            r_ = _rect(g_)
            xs_ = [p_[0] for p_ in g_["pts"]]; ys_ = [p_[1] for p_ in g_["pts"]]
            if max(max(xs_) - min(xs_), max(ys_) - min(ys_)) < 1.0 * T:
                continue                                    # a crumb (a fused note, a blob inside lettering)
            if r_:
                bars_.append({"r": r_, "grey": g_["grey"], "o": "h" if r_[2] - r_[0] >= r_[3] - r_[1] else "v"})
            elif abs(signed_area(g_["pts"])) >= 0.45 * (max(xs_) - min(xs_)) * (max(ys_) - min(ys_)) or len(g_["pts"]) <= 8:
                polys_.append(g_)
        def _paper(x0_, y0_, x1_, y1_):
            reg_ = gray[int(max(0, y0_)):int(max(y0_ + 1, y1_)), int(max(0, x0_)):int(max(x0_ + 1, x1_))]
            return reg_.size == 0 or float((reg_ > 228).mean()) >= 0.5
        merged_ = True
        while merged_:
            merged_ = False
            for i_ in range(len(bars_)):
                for j_ in range(i_ + 1, len(bars_)):
                    b1, b2 = bars_[i_], bars_[j_]
                    if b1["o"] != b2["o"]:
                        continue
                    r1, r2 = b1["r"], b2["r"]
                    ax = 0 if b1["o"] == "h" else 1
                    o0, o1 = (1, 3) if ax == 0 else (0, 2)
                    t1, t2 = r1[o1] - r1[o0], r2[o1] - r2[o0]
                    gap_ = max(r1[ax], r2[ax]) - min(r1[ax + 2], r2[ax + 2])
                    if abs((r1[o0] + r1[o1]) - (r2[o0] + r2[o1])) / 2.0 > max(3.0, 0.3 * min(t1, t2)) or max(t1, t2) > 1.7 * min(t1, t2) or gap_ > 1.5 * T:
                        continue
                    lo_, hi_ = min(r1[ax + 2], r2[ax + 2]), max(r1[ax], r2[ax])
                    c0_, c1_ = max(r1[o0], r2[o0]), min(r1[o1], r2[o1])
                    if gap_ > 0.5 * T and (_paper(lo_, c0_, hi_, c1_) if ax == 0 else _paper(c0_, lo_, c1_, hi_)):
                        continue
                    if gap_ > 0 and ((wall_mask[int(c0_):int(c1_) + 1, int(lo_):int(hi_) + 1] if ax == 0 else wall_mask[int(lo_):int(hi_) + 1, int(c0_):int(c1_) + 1]) > 0).mean() > 0.3:
                        continue                            # a black wall stands between them
                    big, sm = (r1, r2) if (r1[ax + 2] - r1[ax]) >= (r2[ax + 2] - r2[ax]) else (r2, r1)
                    nr = list(big); nr[ax], nr[ax + 2] = min(r1[ax], r2[ax]), max(r1[ax + 2], r2[ax + 2])
                    bars_[i_] = {"r": nr, "grey": b1["grey"] if big is r1 else b2["grey"], "o": b1["o"]}
                    del bars_[j_]; merged_ = True; break
                if merged_:
                    break
        reach_ = max(0.7 * T, 6.0 * ws_)
        for b_ in bars_:
            r_ = b_["r"]; ax = 0 if b_["o"] == "h" else 1
            o0, o1 = (1, 3) if ax == 0 else (0, 2)
            for end_, sg_ in ((ax, -1), (ax + 2, 1)):
                best_ = None
                for d_ in range(1, int(reach_) + 1):
                    p_ = int(round(r_[end_] + sg_ * d_))
                    if p_ < 0 or p_ >= (W if ax == 0 else H):
                        break
                    strip_ = wall_mask[int(r_[o0]):int(r_[o1]) + 1, p_] if ax == 0 else wall_mask[p_, int(r_[o0]):int(r_[o1]) + 1]
                    if strip_.size and (strip_ > 0).mean() >= 0.5:
                        best_ = r_[end_] + sg_ * (d_ - 0.5); break
                if best_ is None:
                    for q_ in bars_:
                        if q_ is b_ or q_["o"] == b_["o"]:
                            continue
                        qr = q_["r"]
                        near_, far_ = (qr[ax], qr[ax + 2]) if sg_ > 0 else (qr[ax + 2], qr[ax])
                        if not (-0.5 * (qr[ax + 2] - qr[ax]) - 2 <= (near_ - r_[end_]) * sg_ <= reach_):
                            continue
                        if qr[o1] < r_[o0] - 0.6 * T or qr[o0] > r_[o1] + 0.6 * T:
                            continue
                        corner_ = qr[o0] > r_[o0] - 2 or qr[o1] < r_[o1] + 2      # the other bar ends here: an L corner, not a T
                        best_ = far_ if corner_ else near_
                        if corner_:
                            if qr[o0] > r_[o0] - 2:
                                qr[o0] = r_[o0]
                            else:
                                qr[o1] = r_[o1]
                        break
                if best_ is not None:
                    lo_, hi_ = sorted((r_[end_], best_))
                    if hi_ - lo_ <= 0.3 * T or not (_paper(lo_, r_[o0], hi_, r_[o1]) if ax == 0 else _paper(r_[o0], lo_, r_[o1], hi_)):
                        r_[end_] = best_; b_["att"] = b_.get("att", 0) + 1
        # a short grey patch that starts and ends nowhere is the blur between close strokes (a basin against a counter line)
        bars_ = [b_ for b_ in bars_ if b_.get("att", 0) > 0 or max(b_["r"][2] - b_["r"][0], b_["r"][3] - b_["r"][1]) >= 2.5 * T]
        greys = polys_ + [{"pts": [[b_["r"][0], b_["r"][1]], [b_["r"][2], b_["r"][1]], [b_["r"][2], b_["r"][3]], [b_["r"][0], b_["r"][3]]],
                           "grey": b_["grey"]} for b_ in bars_]
        gv_ = sorted(g_["grey"] for g_ in greys)             # two or three fills in a drawing, not thirty
        for g_ in greys:
            near_ = [v_ for v_ in gv_ if abs(v_ - g_["grey"]) <= 14]
            g_["grey"] = int(np.median(near_))
        grey_mask = np.zeros_like(grey_mask)
        for g_ in greys:
            cv2.fillPoly(grey_mask, [np.round(np.array(g_["pts"])).astype(np.int32)], 255)
        grey_mask[wall_mask > 0] = 0
        if os.environ.get("FV_GREY_PNG"):
            cv2.imwrite(os.environ["FV_GREY_PNG"], np.dstack([grey_mask, wall_mask, core_]))
        thin[cv2.dilate(grey_mask, np.ones((3, 3), np.uint8)) > 0] = 0
        bridge_ok = cv2.bitwise_or(thin, cv2.dilate(grey_mask, np.ones((7, 7), np.uint8)))   # a line may run on along the edge of a grey fill

    # ---- 2. long lines (before OCR so text is left clean) ---------------
    def line_pass(src, L):
        hm = cv2.morphologyEx(src, cv2.MORPH_OPEN, np.ones((1, L), np.uint8))
        vm = cv2.morphologyEx(src, cv2.MORPH_OPEN, np.ones((L, 1), np.uint8))
        out = []
        for m, horiz in ((hm, True), (vm, False)):
            n, lab_, st, _ = cv2.connectedComponentsWithStats(m)
            for i in range(1, n):
                x, y, w, h, _a = st[i]
                if soft and ((horiz and h > max(6, T * 0.45) and w <= 6 * h) or (not horiz and w > max(6, T * 0.45) and h <= 6 * w)):
                    m[lab_ == i] = 0                        # a blob, not a line: blurred lettering fused into a bar (MAIN) - leave it for the text stage
                    continue
                if soft and max(w, h) <= 4 * L:
                    # a short run with ink right above AND below most of its length lies inside a blob (fused lettering)
                    if horiz:
                        up_ = src[max(0, y - 4):max(0, y - 2), x:x + w]; dn_ = src[y + h + 2:y + h + 4, x:x + w]
                    else:
                        up_ = src[y:y + h, max(0, x - 4):max(0, x - 2)]; dn_ = src[y:y + h, x + w + 2:x + w + 4]
                    if up_.size and dn_.size and (up_ > 0).mean() > 0.55 and (dn_ > 0).mean() > 0.55:
                        m[lab_ == i] = 0
                        continue
                if horiz and h <= max(6, T * (0.45 if soft else 0.3)):
                    out.append({"o": "h", "c": y + h / 2, "a": float(x), "b": float(x + w), "t": float(h)})
                elif not horiz and w <= max(6, T * (0.45 if soft else 0.3)):
                    out.append({"o": "v", "c": x + w / 2, "a": float(y), "b": float(y + h), "t": float(w)})
        return out, cv2.bitwise_or(hm, vm)

    def ridge_line_pass(src, L, gimg=None):
        """Soft inputs: lines from the GREY image, not from the thresholded one. A blurred line is a valley across its width;
        two lines 3 source px apart fuse into one band at any threshold but are still two valleys. Position is sub-pixel
        (parabola through the valley floor, median along the run)."""
        d_ = work_scale + 1
        out, total = [], np.zeros_like(src)
        src_d = cv2.dilate(src, np.ones((3, 3), np.uint8))
        gimg = gray if gimg is None else gimg
        for horiz in (True, False):
            G = gimg.astype(np.float32) if horiz else gimg.astype(np.float32).T.copy()
            S_ = src_d if horiz else src_d.T.copy()
            r_ = np.minimum(np.roll(G, d_, 0), np.roll(G, -d_, 0)) - G
            locmin = (G <= np.roll(G, 1, 0)) & (G <= np.roll(G, -1, 0))
            R = (((r_ >= 14) & locmin & (G < 205) & (S_ > 0)) * 255).astype(np.uint8)
            # two lines only ~2 source px apart are one flat-bottomed valley: no floor at +-d. Look again on a smoothed
            # profile with a wider step, but only where the first look found nothing (else a resolvable pair gets a third line)
            Gs = cv2.blur(G, (1, 2 * work_scale + 1)); d2 = 2 * work_scale + 1
            r2 = np.minimum(np.roll(Gs, d2, 0), np.roll(Gs, -d2, 0)) - Gs
            lm2 = (Gs <= np.roll(Gs, 1, 0)) & (Gs <= np.roll(Gs, -1, 0))
            R2 = (((r2 >= 14) & lm2 & (Gs < 205) & (S_ > 0)) * 255).astype(np.uint8)
            R2[cv2.dilate(R, np.ones((4 * work_scale + 1, 1), np.uint8)) > 0] = 0
            R = R | R2
            R[:d2] = 0; R[-d2:] = 0
            Rd = cv2.dilate(R, np.ones((3, 1), np.uint8))
            Rc = cv2.morphologyEx(Rd, cv2.MORPH_CLOSE, np.ones((1, 6 * work_scale + 5), np.uint8)) & S_   # a crossing line hides the valley for its own width
            Ro = cv2.morphologyEx(Rc, cv2.MORPH_OPEN, np.ones((1, L), np.uint8))
            n_, lab_, st_, _c = cv2.connectedComponentsWithStats(Ro)
            Mk = np.zeros_like(Ro)
            for i in range(1, n_):
                x, y, w, h, _a = st_[i]
                bx_, by_, bw_, bh_ = (x, y, w, h) if horiz else (y, x, h, w)
                if h > 7:
                    _dbg("ridge: not one valley", bx_, by_, bw_, bh_)
                    continue                                # not one straight valley
                cols = np.arange(x, x + w)
                y0_, y1_ = max(1, y), min(G.shape[0] - 1, y + h)
                blk = G[y0_:y1_, x:x + w]
                am = blk.argmin(0) + y0_
                am = np.clip(am, 1, G.shape[0] - 2)
                g0, g1, g2 = G[am - 1, cols], G[am, cols], G[am + 1, cols]
                den = g0 - 2 * g1 + g2
                sub = am + np.where(np.abs(den) > 1e-6, 0.5 * (g0 - g2) / np.where(np.abs(den) > 1e-6, den, 1), 0.0)
                c_ = float(np.median(sub)) + 0.5
                # thickness: ink run across the line at each column
                tt = []
                for cx_ in cols[::max(1, w // 24)]:
                    yy = int(round(c_ - 0.5)); a_ = yy
                    while a_ > 0 and S_[a_ - 1, cx_] and yy - a_ < 12: a_ -= 1
                    b_ = yy
                    while b_ < G.shape[0] - 1 and S_[b_ + 1, cx_] and b_ - yy < 12: b_ += 1
                    tt.append(b_ - a_ + 1)
                t_ = float(np.median(tt)) if tt else 3.0
                half = int(min(max(2, round(t_ / 2.0)), 0.25 * T))
                if w <= 12 * T:
                    # lettering: the bars of neighbouring letters line up into a 'line', but beside it the ink comes and goes
                    # (stems); beside a real line there is nothing, or another line all the way along
                    yc_ = int(round(c_ - 0.5)); texty = False
                    for sgn in (-1, 1):
                        r0, r1 = sorted((yc_ + sgn * (half + 3), yc_ + sgn * (half + 9)))
                        r0, r1 = max(0, r0), min(G.shape[0], r1)
                        if r1 <= r0:
                            continue
                        side = (S_[r0:r1, x:x + w] > 0).any(0).astype(np.int8)
                        if int(np.abs(np.diff(side)).sum()) >= max(6, w / 12.0) and 0.15 <= side.mean() <= 0.9:
                            texty = True
                    if texty:
                        _dbg("ridge: lettering", bx_, by_, bw_, bh_)
                        continue
                Mk[max(0, int(round(c_ - 0.5)) - half):int(round(c_ - 0.5)) + half + 1, x:x + w] = 255
                # the valley fades a few px before the line really ends (at a corner, at a wall): follow the ink to the end
                yc_ = int(round(c_ - 0.5)); a_e, b_e = x, x + w
                # (lettering or a dot right beside the line also hides the valley, for longer: the ink itself still runs on)
                while a_e > 0 and x - a_e < 4 * T and S_[yc_, a_e - 1]:
                    a_e -= 1
                while b_e < G.shape[1] and b_e - (x + w) < 4 * T and S_[yc_, b_e]:
                    b_e += 1
                _dbg("ridge: LINE", bx_, by_, bw_, bh_, "c", round(c_, 2), "t", t_)
                out.append({"o": "h" if horiz else "v", "c": round(c_ * 4) / 4.0, "a": float(a_e), "b": float(b_e), "t": min(t_, 0.45 * T), "ridge": float(np.median(g1))})
            total |= (Mk if horiz else Mk.T.copy())
        return out, total

    L_long = int(max(40, 1.5 * T))
    text_protect = np.zeros_like(thin)
    if soft:
        # free-standing lettering is an ISOLATED dense blob (linework hangs together in one big network): keep it away from
        # the line passes, whose valleys would otherwise run through the aligned bars of B-E-D-R
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(thin)
        for i in range(1, n_):
            x, y, w, h, a_ = st_[i]
            if 10 <= min(w, h) <= 3.5 * T and max(w, h) <= 14 * T and a_ >= 0.3 * w * h and max(w, h) >= 14:
                part = ((lab_[y:y + h, x:x + w] == i) * 255).astype(np.uint8)
                # a stretch of double-line wall between two black blocks is isolated and dense as well - but it is thin and all
                # straight runs (fused lettering is as tall as its capitals and may well contain a long run)
                if min(w, h) <= 0.6 * T + 6 and (cv2.morphologyEx(part, cv2.MORPH_OPEN, np.ones((1, max(12, int(0.7 * w))), np.uint8)).any() or
                                                 cv2.morphologyEx(part, cv2.MORPH_OPEN, np.ones((max(12, int(0.7 * h)), 1), np.uint8)).any()):
                    continue
                text_protect[lab_ == i] = 255
    if soft:
        # ... and lettering that TOUCHES linework (a note inside a door swing): a compact patch where a third of the paper is ink.
        # Pairs of wall lines are just as dense but long and thin; grey solids and walls are already out of 'thin'.
        kd_ = 14 * work_scale
        dens_ = cv2.blur((thin > 0).astype(np.float32), (kd_, kd_))
        dm_ = ((dens_ >= 0.33) * 255).astype(np.uint8)
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(dm_)
        for i in range(1, n_):
            x, y, w, h, a_ = st_[i]
            if 8 * work_scale <= min(w, h) and max(w, h) <= 8 * min(w, h) and max(w, h) <= 14 * T and a_ >= 0.45 * w * h:
                blob = (lab_[y:y + h, x:x + w] == i)
                sub = thin[y:y + h, x:x + w]
                part = ((blob & (sub > 0)) * 255).astype(np.uint8)
                # lettering has no long straight runs; a window full of sashes and dashes does
                if cv2.morphologyEx(part, cv2.MORPH_OPEN, np.ones((1, max(12, int(0.7 * w))), np.uint8)).any() or \
                   cv2.morphologyEx(part, cv2.MORPH_OPEN, np.ones((max(12, int(0.7 * h)), 1), np.uint8)).any():
                    continue
                text_protect[y:y + h, x:x + w][part > 0] = 255
    if soft:
        # ... and lettering that STANDS ON a line (dimension numbers written right on their dimension line): take the long
        # straight runs away, and what is left in a row of three or more glyph-shaped pieces beside such a run is a number.
        online_h = []; online_protect = np.zeros_like(text_protect)
        def reads_as_number(x0_, y0_, x1_, y1_, vertical_):
            """Is this piece of ink a number?  Asked of the reader itself (long runs painted out), so that rails, dashes and door
            leaves beside a line are not mistaken for lettering."""
            p_ = 4
            xa, ya, xb, yb = max(0, x0_ - p_), max(0, y0_ - p_), min(W, x1_ + p_), min(H, y1_ + p_)
            cr_ = np.where(runs_[ya:yb, xa:xb] > 0, 255, gray[ya:yb, xa:xb]).astype(np.uint8)
            if vertical_:
                cr_ = cv2.rotate(cr_, cv2.ROTATE_90_CLOCKWISE)
            zf_ = float(min(5.0, max(1.0, 44.0 / max(8.0, cr_.shape[0] - 2 * p_))))
            cr_ = cv2.copyMakeBorder(cv2.resize(cr_, None, fx=zf_, fy=zf_, interpolation=cv2.INTER_CUBIC), 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
            d_ = pytesseract.image_to_data(cr_, config="--psm 7 -c tessedit_char_whitelist=0123456789", output_type=pytesseract.Output.DICT)
            got_ = [(t_.strip(), float(c_)) for t_, c_ in zip(d_["text"], d_["conf"]) if t_.strip()]
            if os.environ.get("FV_LOG_ONLINE"):
                print("ONLINE", (x0_, y0_, x1_, y1_), "vertical" if vertical_ else "level", got_)
            return any((len(t_) >= 3 and c_ >= 60) or (len(t_) >= 2 and c_ >= 30 and soft_R <= 1.4) for t_, c_ in got_)   # (crisp small lettering reads poorly but is unmistakable)
        runs_ = cv2.bitwise_or(cv2.morphologyEx(thin, cv2.MORPH_OPEN, np.ones((1, L_long), np.uint8)),
                               cv2.morphologyEx(thin, cv2.MORPH_OPEN, np.ones((L_long, 1), np.uint8)))
        loose_ = cv2.bitwise_and(thin, cv2.bitwise_not(runs_))
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(loose_)
        runs_near = cv2.dilate(runs_, np.ones((5, 5), np.uint8)) > 0
        for vertical_ in (False, True):
            gl_ = []
            for i in range(1, n_):
                x, y, w, h, a_ = st_[i]
                tall, wide = (w, h) if vertical_ else (h, w)     # glyph height / width in reading direction
                if 5 * work_scale <= tall <= 30 * work_scale and 0.2 * tall <= wide <= 1.0 * tall and a_ >= 0.25 * w * h:
                    gl_.append((x, y, w, h, i))
                elif 5 * work_scale <= tall <= 30 * work_scale and 1.0 * tall < wide <= 7.0 * tall and 0.25 * w * h <= a_ <= 0.8 * w * h:
                    # small lettering fuses into one piece per number: many strokes side by side, none of them a long run
                    part_ = (lab_[y:y + h, x:x + w] == i)
                    mid_ = part_[:, w // 2] if vertical_ else part_[h // 2, :]
                    strokes_ = int((np.diff(mid_.astype(np.int8)) == 1).sum()) + int(mid_[0])
                    touch_ = runs_near[min(H - 1, y + h):min(H, y + h + 4), x:x + w].any() or runs_near[max(0, y - 3):y + 1, x:x + w].any() if not vertical_ else \
                        runs_near[y:y + h, min(W - 1, x + w):min(W, x + w + 4)].any() or runs_near[y:y + h, max(0, x - 3):x + 1].any()
                    if strokes_ >= 3 and touch_ and reads_as_number(x, y, x + w, y + h, vertical_):
                        text_protect[lab_ == i] = 255; online_protect[lab_ == i] = 255; online_h.append(float(tall))
            gl_.sort(key=lambda g_: g_[1] if vertical_ else g_[0])
            used_ = set()
            for k_, g_ in enumerate(gl_):
                if k_ in used_:
                    continue
                row_ = [k_]
                for j_ in range(k_ + 1, len(gl_)):
                    p_, q_ = gl_[row_[-1]], gl_[j_]
                    tp, tq_ = (p_[2], q_[2]) if vertical_ else (p_[3], q_[3])
                    if vertical_:
                        gap_ = q_[1] - (p_[1] + p_[3]); off_ = abs((q_[0] + q_[2] / 2.0) - (p_[0] + p_[2] / 2.0))
                    else:
                        gap_ = q_[0] - (p_[0] + p_[2]); off_ = abs((q_[1] + q_[3] / 2.0) - (p_[1] + p_[3] / 2.0))
                    if j_ not in used_ and -2 <= gap_ <= 0.6 * tp and off_ <= 0.25 * tp and abs(tp - tq_) <= 0.3 * max(tp, tq_):
                        row_.append(j_)
                if len(row_) < 3:
                    continue
                x0_ = min(gl_[r_][0] for r_ in row_); y0_ = min(gl_[r_][1] for r_ in row_)
                x1_ = max(gl_[r_][0] + gl_[r_][2] for r_ in row_); y1_ = max(gl_[r_][1] + gl_[r_][3] for r_ in row_)
                # it stands on (or hangs from) a long run: that is what made the line passes eat it
                edge_ = runs_near[y0_:y1_ + 1, max(0, x0_ - 4):x0_ + 1].any() or runs_near[y0_:y1_ + 1, x1_:x1_ + 5].any() if vertical_ else \
                    runs_near[min(H - 1, y1_):min(H, y1_ + 5), x0_:x1_ + 1].any() or runs_near[max(0, y0_ - 4):y0_ + 1, x0_:x1_ + 1].any()
                if not edge_ or not reads_as_number(x0_, y0_, x1_, y1_, vertical_):
                    continue
                used_.update(row_)
                for r_ in row_:
                    text_protect[lab_ == gl_[r_][4]] = 255; online_protect[lab_ == gl_[r_][4]] = 255
                online_h.append(float(np.median([(gl_[r_][2] if vertical_ else gl_[r_][3]) for r_ in row_])))
    lines, long_mask = ridge_line_pass(cv2.bitwise_and(thin, cv2.bitwise_not(text_protect)), L_long) if soft else line_pass(thin, L_long)
    rest = cv2.bitwise_and(thin, cv2.bitwise_not(cv2.dilate(long_mask, np.ones((3, 3), np.uint8))))
    if soft:
        rest = cv2.bitwise_or(rest, cv2.bitwise_and(online_protect, cv2.bitwise_not(long_mask)))   # (the ring does not trim a number standing on the line)

    pre_arcs, pre_doors = [], []
    arc_spent = None
    if soft:
        # Quarter circles, looked for where they can be: hinged on a line end or a wall corner, opening to one of the four
        # quadrants. Blurred swings break into pieces and cross dashes, so chain fitting misses them; a direct vote does not.
        hp_ = {(round(l["a"] if l["o"] == "h" else l["c"]), round(l["c"] if l["o"] == "h" else l["a"])) for l in lines} | \
              {(round(l["b"] if l["o"] == "h" else l["c"]), round(l["c"] if l["o"] == "h" else l["b"])) for l in lines} | \
              {(round(p_[0]), round(p_[1])) for w_ in walls + greys for p_ in w_["pts"]}
        hl_ = [l for l in lines if l["o"] == "h"]; vl_ = [l for l in lines if l["o"] == "v"]
        for lh in hl_:                                      # and wherever a horizontal and a vertical line meet or cross
            for lv in vl_:
                if lh["a"] - 6 <= lv["c"] <= lh["b"] + 6 and lv["a"] - 6 <= lh["c"] <= lv["b"] + 6:
                    hp_.add((round(lv["c"]), round(lh["c"])))
        # ... and the ends of straight strokes too short to be 'lines' yet: the leaf of a casement sash is ~2T long
        hp_new = set()
        for kern_, vert_ in ((np.ones((int(1.8 * T), 1), np.uint8), True), (np.ones((1, int(1.8 * T)), np.uint8), False)):
            run_ = cv2.morphologyEx(thin, cv2.MORPH_OPEN, kern_)
            nr_, _lr, sr_, cr_ = cv2.connectedComponentsWithStats(run_)
            for i_ in range(1, nr_):
                x_, y_, w_, h_, a_ = sr_[i_]
                if (h_ if vert_ else w_) > 7 * T or (w_ if vert_ else h_) > 0.4 * T:
                    continue
                if vert_:
                    hp_new.add((int(round(cr_[i_][0])), int(y_))); hp_new.add((int(round(cr_[i_][0])), int(y_ + h_ - 1)))
                else:
                    hp_new.add((int(x_), int(round(cr_[i_][1])))); hp_new.add((int(x_ + w_ - 1), int(round(cr_[i_][1]))))
        hp_sets = [np.array(sorted(hp_), dtype=np.int32).reshape(-1, 2), np.array(sorted(hp_new - hp_), dtype=np.int32).reshape(-1, 2)]
        restd = cv2.dilate(thin, np.ones((3, 3), np.uint8)) > 0
        restf = cv2.dilate(thin, np.ones((7, 7), np.uint8)) > 0
        inkb = ink > 0
        thin_b = thin > 0
        dark_ = (255.0 - gray.astype(np.float32)) / 255.0
        built_ = (long_mask > 0) | (wall_mask > 0)
        ink_fat_ = cv2.dilate(ink, np.ones((5, 5), np.uint8)) > 0
        radii = np.arange(int(2.0 * T), int(7 * T) + 1, 2)
        tq = np.radians(np.linspace(4, 86, 44))
        new_arcs = []
        work_ = restd.copy().astype(np.uint8)
        # (first the hinges the drawing's lines give - as always; only then, over the ink still unspent, the short-stroke ends)
        for hp_ in hp_sets:
            votes = []
            if len(hp_):
                for q in range(4):
                    ca, sa = np.cos(tq + q * np.pi / 2), np.sin(tq + q * np.pi / 2)
                    ox = np.rint(radii[:, None] * ca[None, :]).astype(np.int32); oy = np.rint(radii[:, None] * sa[None, :]).astype(np.int32)
                    # coarse: fat mask, hinge as given or 6 px off it (a blurred jamb is not where its line ends), every second radius
                    seen_ = set()
                    for cjx in (-6, 0, 6):
                      for cjy in (-6, 0, 6):
                        X = hp_[:, 0][:, None, None] + cjx + ox[None]; Y = hp_[:, 1][:, None, None] + cjy + oy[None]
                        okb = (X >= 0) & (X < W) & (Y >= 0) & (Y < H)
                        sc = (restf[np.clip(Y, 0, H - 1), np.clip(X, 0, W - 1)] & okb).mean(2)
                        for i_, r_i in zip(*np.where(sc >= 0.8)):
                          if (i_, r_i // 3, cjx, cjy) in seen_:
                              continue
                          seen_.add((i_, r_i // 3, cjx, cjy))
                          # fine: thin mask, hinge +-4 px, radius +-3 px
                          best = (0.0, None)
                          for rr in range(int(radii[r_i]) - 3, int(radii[r_i]) + 4):
                            fx_ = np.rint(rr * ca).astype(np.int32); fy_ = np.rint(rr * sa).astype(np.int32)
                            for jx in range(-4, 5, 2):
                                for jy in range(-4, 5, 2):
                                    px = hp_[i_, 0] + cjx + jx + fx_; py = hp_[i_, 1] + cjy + jy + fy_
                                    if px.min() < 0 or py.min() < 0 or px.max() >= W or py.max() >= H:
                                        continue
                                    v_ = float(restd[py, px].mean()) + 0.1 * float(thin_b[py, px].mean()) + 0.2 * float(dark_[py, px].mean())   # ties: the circle along the valley floor
                                    if v_ > best[0]:
                                        best = (v_, (int(hp_[i_, 0] + cjx + jx), int(hp_[i_, 1] + cjy + jy), rr))
                          if best[0] >= 0.9 + 0.06 + 0.06:          # >= 90 % on the 3x3 mask, mostly on the ink itself, and dark
                            votes.append((best[0],) + best[1] + (q,))
            votes.sort(reverse=True)
            _la = [float(v_) for v_ in os.environ.get("FV_LOG_ARC", "").split(",")] if os.environ.get("FV_LOG_ARC") else None
            def _why(tag, hx, hy, r_, q, *more):
                if _la and math.hypot(hx - _la[0], hy - _la[1]) <= 14:
                    print("ARC", tag, hx, hy, r_, q, *more)
            if _la:
                print("ARC votes near", [(round(v_[0], 2),) + tuple(v_[1:]) for v_ in votes if math.hypot(v_[1] - _la[0], v_[2] - _la[1]) <= 14][:12])
            for sc_, hx, hy, r_, q in votes:
                if any(math.hypot(hx - e["cx"], hy - e["cy"]) < 0.5 * T and abs(r_ - e["r"]) < 0.3 * T + 3 for e in new_arcs):
                    continue
                a0 = q * 90.0
                # the ink of an accepted arc is spent: a slightly shifted circle over the same ink must not count again
                px = np.clip(np.rint(hx + r_ * np.cos(tq + q * np.pi / 2)).astype(int), 0, W - 1)
                py = np.clip(np.rint(hy + r_ * np.sin(tq + q * np.pi / 2)).astype(int), 0, H - 1)
                if work_[py, px].mean() < 0.8:
                    _why("spent", hx, hy, r_, q); continue
                # the middle of the swing is where nothing else can stand in for it: it must be inked there, and be a stroke
                # (darker than the paper 3-4 px inside and outside of it)
                k3 = slice(len(tq) // 3, 2 * len(tq) // 3)
                if restd[py[k3], px[k3]].mean() < 0.9:
                    _why("middle not inked", hx, hy, r_, q); continue
                val_ = []
                for dr_ in (-(work_scale + 2), work_scale + 2):
                    qx = np.clip(np.rint(hx + (r_ + dr_) * np.cos(tq + q * np.pi / 2)).astype(int), 0, W - 1)
                    qy = np.clip(np.rint(hy + (r_ + dr_) * np.sin(tq + q * np.pi / 2)).astype(int), 0, H - 1)
                    val_.append(gray[qy[k3], qx[k3]].astype(np.float32) - gray[py[k3], px[k3]].astype(np.float32))
                if float(np.mean((val_[0] > 8) & (val_[1] > 8))) < 0.6:
                    _why("not a stroke", hx, hy, r_, q); continue
                ring_ok = True
                for rr in (r_ - (2 * work_scale + 4), r_ + (2 * work_scale + 4)):
                    px = np.clip(np.rint(hx + rr * np.cos(tq + q * np.pi / 2)).astype(int), 0, W - 1)
                    py = np.clip(np.rint(hy + rr * np.sin(tq + q * np.pi / 2)).astype(int), 0, H - 1)
                    if inkb[py, px].mean() > 0.4:
                        ring_ok = False
                if not ring_ok:
                    _why("ring inked", hx, hy, r_, q); continue
                leaf = None
                def radius_ink(ang):
                    t_ = np.linspace(0.25, 0.9, 24)
                    px = np.clip(np.rint(hx + r_ * t_ * math.cos(math.radians(ang))).astype(int), 0, W - 1)
                    py = np.clip(np.rint(hy + r_ * t_ * math.sin(math.radians(ang))).astype(int), 0, H - 1)
                    return float(ink_fat_[py, px].mean())
                if radius_ink(a0) >= 0.75 and radius_ink(a0 + 90.0) >= 0.75:
                    leaf = a0 % 360                             # a window sash: both radii are drawn (frame side and sill)
                for ang, other in ((a0, a0 + 90.0), (a0 + 90.0, a0)):
                    if leaf is not None or radius_ink(ang) < 0.75:
                        continue
                    # the swing starts at the leaf tip and must END on something built: a wall, a long line (the jamb / frame)
                    ex = int(round(hx + r_ * math.cos(math.radians(other)))); ey = int(round(hy + r_ * math.sin(math.radians(other))))
                    if 0 <= ex < W and 0 <= ey < H and built_[max(0, ey - 6):ey + 7, max(0, ex - 6):ex + 7].any():
                        leaf = ang % 360; break
                    # ... or on more linework: ink just beyond the end of the swing, outwards or onwards
                    ux_, uy_ = math.cos(math.radians(other)), math.sin(math.radians(other))
                    for dx_, dy_ in ((ux_, uy_), (-math.cos(math.radians(ang)), -math.sin(math.radians(ang)))):
                        qx, qy = int(round(ex + 6 * dx_)), int(round(ey + 6 * dy_))
                        if 0 <= qx < W and 0 <= qy < H and inkb[max(0, qy - 2):qy + 3, max(0, qx - 2):qx + 3].any():
                            leaf = ang % 360
                    if leaf is not None:
                        break
                if leaf is None:
                    _why("no leaf", hx, hy, r_, q); continue
                if r_ < 2.0 * T:
                    continue
                _why("ACCEPTED", hx, hy, r_, q)
                new_arcs.append({"cx": float(hx), "cy": float(hy), "r": float(r_), "start": a0, "span": 90.0, "voted": round(sc_, 2)})
                cv2.ellipse(work_, (int(hx), int(hy)), (int(r_),) * 2, 0, a0 - 3, a0 + 93, 0, 4 * work_scale + 5)
                pre_doors.append({"hinge": [float(hx), float(hy)], "leaf_px": float(r_), "leaf_angle_deg": leaf})
        for a_ in new_arcs:
            cv2.ellipse(rest, (int(a_["cx"]), int(a_["cy"])), (int(a_["r"]),) * 2, 0, a_["start"] - 3, a_["start"] + 93, 0, 9)
        pre_arcs += new_arcs
        arc_spent = (work_ == 0) & restd
        if DEBUG: print("voted quarter arcs", [(a_["cx"], a_["cy"], a_["r"], a_["start"], a_["voted"]) for a_ in new_arcs])
    ridge_diags = []
    if soft:
        # 45-degree linework (point blocks): the same valley search on the image turned by 45 degrees
        Rm = cv2.getRotationMatrix2D((W / 2.0, H / 2.0), 45.0, 1.0)
        cs_, sn_ = abs(Rm[0, 0]), abs(Rm[0, 1])
        Wr, Hr = int(H * sn_ + W * cs_), int(H * cs_ + W * sn_)
        Rm[0, 2] += Wr / 2.0 - W / 2.0; Rm[1, 2] += Hr / 2.0 - H / 2.0
        g45 = cv2.warpAffine(gray, Rm, (Wr, Hr), flags=cv2.INTER_LINEAR, borderValue=255)
        t45 = cv2.warpAffine(cv2.bitwise_and(rest, cv2.bitwise_not(text_protect)), Rm, (Wr, Hr), flags=cv2.INTER_NEAREST, borderValue=0)
        if t45.any():
            dl_, _mk = ridge_line_pass(t45, int(max(L_long, 2.5 * T)), g45)   # (after the swings are out: a quarter circle is nearly straight at 45 degrees)
            Ri = cv2.invertAffineTransform(Rm)
            for l in dl_:
                p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
                q1 = [float(Ri[0, 0] * p1[0] + Ri[0, 1] * p1[1] + Ri[0, 2]), float(Ri[1, 0] * p1[0] + Ri[1, 1] * p1[1] + Ri[1, 2])]
                q2 = [float(Ri[0, 0] * p2[0] + Ri[0, 1] * p2[1] + Ri[0, 2]), float(Ri[1, 0] * p2[0] + Ri[1, 1] * p2[1] + Ri[1, 2])]
                ridge_diags.append([q1, q2])
                cv2.line(rest, (int(round(q1[0])), int(round(q1[1]))), (int(round(q2[0])), int(round(q2[1]))), 0, int(min(max(5, l["t"] + 2), 0.45 * T)))
    # ---- 3. dimension dots ------------------------------------------------
    dots = []
    dk_n = max(5, int(round(0.22 * T)) | 1)                # 7px at T=32: scale the probe with the drawing
    dk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dk_n, dk_n))
    dm = cv2.morphologyEx(thin, cv2.MORPH_OPEN, dk)
    n, lab, st, cen = cv2.connectedComponentsWithStats(dm)
    dot_mask = np.zeros_like(ink)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        r = (w + h) / 4
        on_line = any(abs(l_["c"] - (cen[i][1] + 0.5 if l_["o"] == "h" else cen[i][0] + 0.5)) <= max(2.5, 0.5 * r) and
                      l_["a"] - r - 2 <= (cen[i][0] if l_["o"] == "h" else cen[i][1]) <= l_["b"] + r + 2 and
                      r >= 1.5 * l_["t"]                     # and is clearly fatter than that line (a blurred crossing is not)
                      for l_ in lines)
        # a dimension dot always sits ON a dimension line; a round blob anywhere else is a letter's bowl or a fixture
        if 3 <= r <= T * 0.45 and 0.75 < w / h < 1.33 and a / (math.pi * r * r) > 0.78 and on_line:
            dots.append({"cx": float(cen[i][0] + 0.5), "cy": float(cen[i][1] + 0.5), "r": float(r)})
            cv2.circle(dot_mask, (int(round(cen[i][0])), int(round(cen[i][1]))), int(r + 3), 255, -1)
    if len(dots) < 4 or float(np.std([d["r"] for d in dots])) > 0.2 * float(np.median([d["r"] for d in dots])):
        dots = []                                           # this drawing does not mark dimensions with dots (crossings / ticks)
        dot_mask[:] = 0
    if dots:
        r_med = float(np.median([d["r"] for d in dots]))
        # (a) two dots so close that they fuse into one blob
        for i in range(1, n):
            x, y, w, h, a = st[i]
            for horiz in (True, False):
                lng, sht = (w, h) if horiz else (h, w)
                if abs(sht - 2 * r_med) <= 2.5 and 2 * r_med + 2.5 < lng <= 4 * r_med + 2 and a > 0.7 * (math.pi * r_med ** 2 + (lng - 2 * r_med) * sht * 0.6):
                    for k_ in (0, 1):
                        c_long = (x if horiz else y) + (r_med if k_ == 0 else lng - r_med)
                        c_sht = (y if horiz else x) + sht / 2.0
                        dots.append({"cx": float(c_long + 0.5) if horiz else float(c_sht + 0.5), "cy": float(c_sht + 0.5) if horiz else float(c_long + 0.5),
                                     "r": r_med, "fused": True})
                    cv2.rectangle(dot_mask, (x - 3, y - 3), (x + w + 3, y + h + 3), 255, -1)
                    break
        # (b) a dot sitting on a wall face: only the half outside the wall is loose ink
        wm = cv2.dilate(wall_mask, np.ones((3, 3), np.uint8))
        bump = cv2.bitwise_and(cv2.morphologyEx(ink, cv2.MORPH_OPEN, dk), cv2.bitwise_not(wm))
        nb_, lb_, sb_, _cb = cv2.connectedComponentsWithStats(bump)
        for i in range(1, nb_):
            x, y, w, h, a = sb_[i]
            for horiz in (True, False):                     # horiz: flat side is horizontal (wall above or below)
                lng, sht = (w, h) if horiz else (h, w)
                if not (abs(lng - 2 * r_med) <= 3 and 0.45 * r_med <= sht <= 1.25 * r_med and a >= 0.6 * lng * sht):
                    continue
                cx_ = x + w / 2.0; cy_ = y + h / 2.0
                if horiz:
                    below = wm[min(H - 1, y + h + 2), int(cx_)] > 0; above = wm[max(0, y - 3), int(cx_)] > 0
                    if below == above:
                        continue
                    dots.append({"cx": float(cx_ + 0.5), "cy": float((y + h) if below else y) + 0.5, "r": r_med, "on_wall": True})
                else:
                    right = wm[int(cy_), min(W - 1, x + w + 2)] > 0; left = wm[int(cy_), max(0, x - 3)] > 0
                    if right == left:
                        continue
                    dots.append({"cx": float((x + w) if right else x) + 0.5, "cy": float(cy_ + 0.5), "r": r_med, "on_wall": True})
                cv2.rectangle(dot_mask, (x - 2, y - 2), (x + w + 2, y + h + 2), 255, -1)
                break
    rest = cv2.bitwise_and(rest, cv2.bitwise_not(dot_mask))

    # ---- 4. text (OCR, two orientations, then a second chance on missed glyph clusters)
    PAD = 24
    ocr_src = cv2.copyMakeBorder(255 - rest, PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=255)
    # same ink, but with the original anti-aliased grey levels: condensed lettering reads better un-binarised
    if os.environ.get("FV_REST_PNG"):
        cv2.imwrite(os.environ["FV_REST_PNG"], np.dstack([rest, thin, text_protect if soft else ink]))
    ocr_gray = cv2.copyMakeBorder(np.where(cv2.dilate(rest, np.ones((3, 3), np.uint8)) > 0, gray, 255).astype(np.uint8),
                                  PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=255)
    texts = []
    word_re = re.compile(r"^[A-Za-z0-9/\-\.&'\(\):]+$" if soft else r"^[A-Za-z0-9/\-\.&'\(\)]+$")

    def recog(box, vertical):
        """Re-read one crop as a single line at 4x. Returns (string, conf)."""
        x, y, w, h = [int(round(v)) for v in box]
        best = ("", 0.0)
        for src_i, src_img in enumerate((ocr_src, ocr_gray)):
          crop = src_img[y + PAD - 5:y + h + PAD + 5, x + PAD - 5:x + w + PAD + 5]
          if crop.size == 0:
            return "", 0.0
          if vertical:
            crop = cv2.rotate(crop, cv2.ROTATE_90_COUNTERCLOCKWISE if vertical == "down" else cv2.ROTATE_90_CLOCKWISE)
          zf = 4.0 if not soft else float(min(4.0, max(1.0, 44.0 / max(8.0, min(w, h)))))
          crop = cv2.copyMakeBorder(cv2.resize(crop, None, fx=zf, fy=zf, interpolation=cv2.INTER_CUBIC),
                                  30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
          if src_i == 0:
            crop = cv2.GaussianBlur(crop, (3, 3), 0)
          for cfg in ("--psm 7", "--psm 7 -c tessedit_char_whitelist=0123456789"):
              d = pytesseract.image_to_data(crop, config=cfg, output_type=pytesseract.Output.DICT)
              ws = [(t.strip(), float(c)) for t, c in zip(d["text"], d["conf"]) if t.strip() and float(c) >= 0]
              if not ws:
                  continue
              st, cf = " ".join(w_[0] for w_ in ws), float(np.mean([w_[1] for w_ in ws]))
              digits = sum(ch.isdigit() for ch in st)
              if "whitelist" in cfg and digits < 3:
                  continue
              if "whitelist" in cfg and sum(ch.isdigit() for ch in best[0]) >= 0.5 * max(1, len(best[0])):
                  cf += 15                                   # a dimension: trust the digits-only read
              if cf > best[1]:
                  best = (st, cf)
        return best

    def ocr(img, rotated):
        Z = 1 if soft else 2
        big = cv2.resize(img, None, fx=Z, fy=Z, interpolation=cv2.INTER_CUBIC) if Z != 1 else img
        d = pytesseract.image_to_data(big, config="--psm 11", output_type=pytesseract.Output.DICT)
        rows = {}
        for i, t in enumerate(d["text"]):
            t = t.strip()
            if not t or float(d["conf"][i]) < 55 or not word_re.match(t):
                continue
            x, y, w, h = [d[k][i] / Z for k in ("left", "top", "width", "height")]
            if len(t) >= 2 and w < h * 0.8:
                continue                                   # wrong orientation for this pass
            if len(t) == 1 and float(d["conf"][i]) < 80:
                continue
            key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
            rows.setdefault(key, []).append((x, y, w, h, t, float(d["conf"][i])))
        for ws in rows.values():
            ws.sort()
            groups, cur = [], [ws[0]]
            for wd in ws[1:]:
                same_row = abs((wd[1] + wd[3] / 2) - (cur[-1][1] + cur[-1][3] / 2)) < 0.5 * cur[-1][3]
                if wd[0] - (cur[-1][0] + cur[-1][2]) > 1.2 * cur[-1][3] or not same_row:
                    groups.append(cur); cur = [wd]
                else:
                    cur.append(wd)
            groups.append(cur)
            for g in groups:
                hmed = float(np.median([w_[3] for w_ in g])); ymed = float(np.median([w_[1] for w_ in g]))
                x0 = min(w_[0] for w_ in g); x1 = max(w_[0] + w_[2] for w_ in g)
                y0, y1 = ymed, ymed + hmed
                s_ = " ".join(w_[4] for w_ in g); cf = float(np.mean([w_[5] for w_ in g]))
                if rotated == "down":
                    bx, by, bw, bh = (W + 2 * PAD) - y1, x0, y1 - y0, x1 - x0
                elif rotated:
                    bx, by, bw, bh = y0, (H + 2 * PAD) - x1, y1 - y0, x1 - x0
                else:
                    bx, by, bw, bh = x0, y0, x1 - x0, y1 - y0
                texts.append({"s": s_, "box": [float(bx - PAD), float(by - PAD), float(bw), float(bh)],
                              "vertical": rotated, "conf": round(cf, 1)})
    gray_nolines = gray.copy()                              # dimension numbers often SIT on their line: for the reader, paint the long lines out
    for l_ in lines:
        hw_ = int(math.ceil(max(l_.get("t", 3.0), 2.0) / 2.0)) + 1; c_ = int(round(l_["c"])); a_, b_ = int(l_["a"]), int(l_["b"]) + 1
        if l_["o"] == "h":
            gray_nolines[max(0, c_ - hw_):c_ + hw_ + 1, max(0, a_):b_] = 255
        else:
            gray_nolines[max(0, a_):b_, max(0, c_ - hw_):c_ + hw_ + 1] = 255
    def ocr_source_res(rot, clean=False, zoom=1):
        """Soft inputs: tesseract's sparse-text mode works well at the SOURCE resolution (it is the 2-3x enlargement of blurred
        lettering that it cannot read). Only confident, plausible words are taken; the rest is left to the cluster reader.
        clean: read the image with the long lines painted out; zoom: enlargement over the source (small lettering)."""
        src_ = gray_nolines if clean else gray
        small = cv2.resize(src_, None, fx=1.0 / work_scale, fy=1.0 / work_scale, interpolation=cv2.INTER_AREA) if work_scale > 1 else src_
        Hs, Ws = small.shape
        if zoom > 1:
            small = cv2.resize(small, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
        img_ = small if not rot else cv2.rotate(small, cv2.ROTATE_90_CLOCKWISE if rot == "up" else cv2.ROTATE_90_COUNTERCLOCKWISE)
        d = pytesseract.image_to_data(img_, config="--psm 11", output_type=pytesseract.Output.DICT)
        rows = {}
        for i, t in enumerate(d["text"]):
            t = t.strip().replace("\u2014", "-").replace("\u2013", "-").replace("\u2019", "'").replace("\u2018", "'")
            cf = float(d["conf"][i])
            if not t or cf < 55:
                continue
            t_read = t
            t = vocab_fix(t, loose=True)
            if t != t_read:
                # a repair replaces what was read by what was expected: only when the PIXELS prefer the expected word
                bx_ = [float(d[k][i]) for k in ("left", "top", "width", "height")]      # (in img_'s own pixels)
                ok_fix, sc_fix = pixels_prefer_repair(img_, bx_, False, t_read, t)
                if os.environ.get("FV_LOG_REPAIR"):
                    print("REPAIR src-res", repr(t_read), "->", repr(t), "conf", cf, sc_fix, "KEPT" if ok_fix else "REJECTED")
                if not ok_fix:
                    t = t_read
            if cf < 80 and not (t in PLAN_VOCAB and cf >= 70) and not re.match(r"^'[A-Z]'$", t) and t not in ("4-ROOM", "3-ROOM", "5-ROOM", "2-ROOM"):
                continue
            if len(t) <= 2 and t.isalpha() and cf < 85 and t not in ("WC", "RC", "DB"):
                continue                                    # two letters are easily read out of two strokes: only from a confident read
            ok_ = (t.isdigit() and 3 <= len(t) <= 5) or t in PLAN_VOCAB or re.match(r"^'[A-Z]'$", t) or \
                  (re.match(r"^[0-9]$", t) and cf >= 90) or (re.match(r"^[(]?[A-Z][A-Z\-/.]{3,}[)]?$", t) and cf >= 90)
            if not ok_:
                continue
            x, y, w, h = [float(d[k][i]) / zoom for k in ("left", "top", "width", "height")]
            if len(t) >= 2 and w < h * 0.8 and not re.match(r"^'[A-Z]'$", t):
                continue
            rows.setdefault((d["block_num"][i], d["par_num"][i], d["line_num"][i]), []).append((x, y, w, h, t, cf))
        for wds in rows.values():
            wds.sort()
            groups, cur = [], [wds[0]]
            for wd in wds[1:]:
                same_row = abs((wd[1] + wd[3] / 2) - (cur[-1][1] + cur[-1][3] / 2)) < 0.5 * cur[-1][3]
                if wd[0] - (cur[-1][0] + cur[-1][2]) > 1.2 * min(wd[3], cur[-1][3]) or not same_row:
                    groups.append(cur); cur = [wd]
                else:
                    cur.append(wd)
            groups.append(cur)
            for g in groups:
                x0 = min(w_[0] for w_ in g); x1 = max(w_[0] + w_[2] for w_ in g)
                # the line's height is that of a plain word; brackets, quotes and dashes give tesseract boxes of any height
                plain = [w_ for w_ in g if re.match(r"^[A-Z0-9]{3,}$", w_[4])] or g
                ref = min(plain, key=lambda w_: w_[3])
                y0, y1 = ref[1], ref[1] + ref[3]
                s_ = " ".join(w_[4] for w_ in g); cf = float(np.mean([w_[5] for w_ in g]))
                if rot == "up":
                    bx, by, bw, bh = y0, Hs - x1, y1 - y0, x1 - x0
                elif rot == "down":
                    bx, by, bw, bh = Ws - y1, x0, y1 - y0, x1 - x0
                else:
                    bx, by, bw, bh = x0, y0, x1 - x0, y1 - y0
                texts.append({"s": s_, "box": [float(v_ * work_scale) for v_ in (bx, by, bw, bh)], "vertical": rot,
                              "conf": round(cf, 1), "source_res": True})
    if soft:
        ocr_source_res(False); ocr_source_res("up")
        if os.environ.get("FV_CLEAN_OCR"):                  # EXPERIMENT, off by default: measured net-harmful in round 6 (see TUNING.md)
            for z_ in (1, 3):
                ocr_source_res(False, clean=True, zoom=z_); ocr_source_res("up", clean=True, zoom=z_)
        # a word with a slash or a bracket gets a taller box than its letters: give it the height of the plain words
        hs_ = [(t_["box"][2] if t_["vertical"] else t_["box"][3]) for t_ in texts if re.match(r"^[A-Z0-9 ]+$", t_["s"]) and any(ch.isalpha() for ch in t_["s"])]
        if len(hs_) >= 3:
            med_ = float(np.median(hs_))
            for t_ in texts:
                k_ = 2 if t_["vertical"] else 3
                if not re.match(r"^[A-Z0-9 ]+$", t_["s"]) and 1.1 * med_ < t_["box"][k_] < 1.7 * med_:
                    c_ = t_["box"][k_ - 2] + t_["box"][k_] / 2.0
                    t_["erase_box"] = list(t_["box"])
                    t_["box"][k_ - 2], t_["box"][k_] = c_ - med_ / 2.0, med_
    if not soft:
        ocr(ocr_src, False)
        ocr(cv2.rotate(ocr_src, cv2.ROTATE_90_CLOCKWISE), "up")
        ocr(cv2.rotate(ocr_src, cv2.ROTATE_90_COUNTERCLOCKWISE), "down")
    # (soft inputs: tesseract's own sparse-text detection returns noise on blurred lettering; labels are found below by
    #  clustering glyph-sized components, and each cluster is read from the grey image at a comfortable size)
    texts.sort(key=lambda t: -t["conf"]); keep = []
    for t in texts:
        x, y, w, h = t["box"]; clash = False
        for u in keep:
            ux, uy, uw, uh = u["box"]
            ix = max(0, min(x + w, ux + uw) - max(x, ux)); iy = max(0, min(y + h, uy + uh) - max(y, uy))
            if ix * iy > 0.3 * min(w * h, uw * uh):
                clash = True; break
        if not clash:
            keep.append(t)
    texts = keep
    th0 = float(np.median([t["box"][2] if t["vertical"] else t["box"][3] for t in texts])) if texts else T
    texts = [t for t in texts if t.get("source_res") or ((t["box"][2] if t["vertical"] else t["box"][3]) <= 1.5 * th0
             and not (len(t["s"]) == 1 and not t["s"].isdigit()))]
    alpha = [t for t in texts if any(ch.isalpha() for ch in t["s"])]
    if alpha and sum(t["s"].upper() == t["s"] for t in alpha) >= 0.8 * len(alpha):
        texts = [t for t in texts if t["s"].upper() == t["s"]]   # plan lettering is all-caps: mixed case = misread linework
    for t in texts:                                        # second, focused read of every label
        if t.get("source_res"):
            continue
        s2, c2 = recog(t["box"], t["vertical"])
        if s2 and s2 != t["s"]:
            t["alt"] = s2
        if s2 and c2 > t["conf"] and word_re.match(s2.replace(" ", "")) and not t["s"].isdigit():
            t["alt"], t["s"], t["conf"] = t["s"], s2, round(c2, 1)
        elif s2 and s2 != t["s"] and t["s"].isdigit() and s2.isdigit() and len(s2) == len(t["s"]) and \
                int(t["s"]) % 5 and not int(s2) % 5:
            t["alt"], t["s"] = t["s"], s2                   # drawn dimensions are multiples of 5 mm; tesseract confuses 5 and 9
    th = float(np.median([t["box"][2] if t["vertical"] else t["box"][3] for t in texts])) if texts else T
    th_modes = [th]
    if soft:
        # lettering sizes = peaks of the glyph-height histogram (labels, a larger title, a smaller scale note)
        n_, lab_, st_, _c = cv2.connectedComponentsWithStats(rest)
        def peaks_of(hist_, floor_):
            sm = np.convolve(hist_, np.ones(5), "same")
            pk = [i for i in range(2, len(sm) - 2) if sm[i] >= floor_ and sm[i] == sm[max(0, i - 4):i + 5].max()]
            return sorted(pk, key=lambda i: -sm[i])
        nb_ = int(3.3 * T) + 3
        # (a) separate glyphs: count components by height   (b) fused word-blobs: weigh by ink area ~ number of glyphs
        h_cnt = np.bincount(np.array([int(st_[i, 3]) for i in range(1, n_) if 0.2 * T <= st_[i, 3] <= 3.2 * T
                                      and st_[i, 2] <= 3.0 * st_[i, 3] and st_[i, 4] >= 10] or [int(T)]), minlength=nb_).astype(float)[:nb_]
        h_area = np.zeros(nb_)
        for i in range(1, n_):
            if 0.3 * T <= st_[i, 3] <= 3.2 * T and st_[i, 2] <= 9.0 * st_[i, 3] and st_[i, 4] >= 0.25 * st_[i, 2] * st_[i, 3]:
                h_area[int(st_[i, 3])] += st_[i, 4] / max(1.0, float(st_[i, 3]) ** 2)
        th_modes = []
        for p_ in peaks_of(h_cnt, 12)[:3] + peaks_of(h_area, 6)[:3]:
            if all(abs(p_ - q_) > 0.3 * max(p_, q_) for q_ in th_modes):
                th_modes.append(float(p_))
        sm_ = h_cnt
        th_modes = [p_ for p_ in th_modes if p_ >= 14][:4] or [0.9 * T]   # nothing under 14 working px is legible lettering (window dashes are not)
        if len(online_h) >= 3:                              # numbers standing on their lines: their height is a lettering size too
            oh_ = float(np.median(online_h))
            if oh_ >= 10 and all(abs(oh_ - q_) > 0.2 * max(oh_, q_) for q_ in th_modes):
                th_modes.append(oh_)
        th = th_modes[0]
        if DEBUG: print('lettering sizes', th_modes, [int(sm_[int(p)]) for p in th_modes])

    def erase_text(t):
        x, y, w, h = [int(v) for v in t.get("erase_box", t["box"])]; p = 3
        x0, y0, x1, y1 = max(0, x - p), max(0, y - p), min(W, x + w + p), min(H, y + h + p)
        for i in np.unique(lab[y0:y1, x0:x1]):
            if i == 0:
                continue
            cx, cy, cw, ch, _a = st[i]
            if cx >= x0 and cy >= y0 and cx + cw <= x1 and cy + ch <= y1:
                if rest[lab == i].any():
                    k_ = t.get("ink")
                    t["ink"] = [int(cx), int(cy), int(cx + cw), int(cy + ch)] if not k_ else \
                        [min(k_[0], int(cx)), min(k_[1], int(cy)), max(k_[2], int(cx + cw)), max(k_[3], int(cy + ch))]
                    t.setdefault("_comps", []).append((int(cx), int(cy), int(cw), int(ch)))
                rest[lab == i] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest)
    for t in texts:
        erase_text(t)
        cs_ = t.pop("_comps", [])
        if soft and len(cs_) >= 3 and not t["vertical"]:
            # letters set the height of the line: a slash, a bracket or a quote is taller / shorter than the capitals
            hh_ = sorted(c_[3] for c_ in cs_); hm_ = hh_[len(hh_) // 2]
            let_ = [c_ for c_ in cs_ if 0.8 * hm_ <= c_[3] <= 1.2 * hm_]
            if len(let_) >= 2:
                top_ = float(np.median([c_[1] for c_ in let_])); bot_ = float(np.median([c_[1] + c_[3] for c_ in let_]))
                t["ink"] = [t["ink"][0], top_, t["ink"][2], bot_]
        t.pop("erase_box", None)

    # second chance: clusters of glyph-sized components that OCR skipped
    unread = []
    th_main = th
    for th in th_modes:                                    # one pass per lettering size (one only for crisp inputs)
        n, lab, st, _ = cv2.connectedComponentsWithStats(rest)
        for vertical in (False, "up", "down"):
            gl = []
            for i in range(1, n):
                x, y, w, h, a_ = st[i]
                if not rest[lab == i].any():
                    continue
                size, other = (w, h) if vertical else (h, w)
                if 0.7 * th <= size <= 1.3 * th and other <= (1.4 if not soft else 9.0) * th and a_ >= 8:
                    gl.append((x, y, w, h))
            gl.sort(key=lambda g: g[1] if vertical else g[0])
            used = [False] * len(gl)
            for i, g in enumerate(gl):
                if used[i]:
                    continue
                grp = [g]; used[i] = True
                for j in range(i + 1, len(gl)):
                    if used[j]:
                        continue
                    q, p_ = gl[j], grp[-1]
                    if vertical:
                        ok = abs(q[0] - p_[0]) < 0.35 * th and -2 <= q[1] - (p_[1] + p_[3]) < 1.1 * th
                    else:
                        ok = abs(q[1] - p_[1]) < 0.35 * th and -2 <= q[0] - (p_[0] + p_[2]) < 1.1 * th
                        if soft:                            # fused / clipped glyphs: judge by vertical overlap, not by their tops
                            ov_ = min(q[1] + q[3], p_[1] + p_[3]) - max(q[1], p_[1])
                            ok = ov_ >= 0.5 * min(q[3], p_[3]) and -3 <= q[0] - (p_[0] + p_[2]) < 1.1 * th
                    if ok:
                        grp.append(q); used[j] = True
                if len(grp) < 2 and not (soft and (grp[0][3] if vertical else grp[0][2]) >= 1.6 * th):
                    continue
                x0 = min(q[0] for q in grp); y0 = min(q[1] for q in grp)
                x1 = max(q[0] + q[2] for q in grp); y1 = max(q[1] + q[3] for q in grp)
                box = [float(x0), float(y0), float(x1 - x0), float(y1 - y0)]
                s2, c2 = recog(box, vertical)
                _dbg("cluster read", box[0], box[1], box[2], box[3], repr(s2), c2, "vertical", vertical, "glyphs", len(grp))
                if soft and s2:                             # typical slips of this engine on blurred condensed lettering
                    s2 = s2.replace("_", ".").replace("..", ".").replace(",", "/").strip(" .")
                    s2n = re.sub(r"^(W\.?C\.?)\s*(\d)$", r"W.C. \2", s2)
                    if s2n != s2:                           # 'WC 1' and 'W.C. 1' are both written on plans: the pixels decide
                        ok_fix, sc_fix = pixels_prefer_repair(gray, box, vertical, s2, s2n)
                        if os.environ.get("FV_LOG_REPAIR"):
                            print("REPAIR wc-form", repr(s2), "->", repr(s2n), sc_fix, "KEPT" if ok_fix else "REJECTED")
                        s2 = s2n if ok_fix else s2
                s2_read = s2
                s2 = vocab_fix(s2, loose=soft) if s2 else s2
                if s2 != s2_read and soft:
                    ok_fix, sc_fix = pixels_prefer_repair(gray, box, vertical, s2_read, s2)
                    if os.environ.get("FV_LOG_REPAIR"):
                        print("REPAIR cluster", repr(s2_read), "->", repr(s2), "conf", c2, sc_fix, "KEPT" if ok_fix else "REJECTED")
                    if not ok_fix:
                        s2 = s2_read
                if soft and s2 and any(ch.isalpha() for ch in s2):
                    toks = [tk for tk in s2.split() if any(ch.isalpha() for ch in tk)]
                    long_ok = any(len(tk) >= 5 and c2 >= 75 for tk in toks)
                    # (a short word beside a long confident one in the same cluster is part of the same note: 'AT TOPMOST')
                    if not all(tk in PLAN_VOCAB or (len(tk) >= 5 and c2 >= 75) or (long_ok and tk.isalpha() and tk.isupper() and len(toks) >= 2) for tk in toks):
                        _dbg("cluster rejected as stray letters", box[0], box[1], box[2], box[3], repr(s2), c2)
                        c2 = 0.0                            # two stray letters are not a label
                    elif toks and all(tk in PLAN_VOCAB for tk in toks) and sum(len(tk) for tk in toks) >= 4:
                        c2 = max(c2, 45.0)                  # a whole plan word: the vocabulary vouches for it
                if s2 and c2 >= 45 and word_re.match(s2.replace(" ", "")) and len(s2) >= 2 and not any(ch.islower() for ch in s2):
                    t = {"s": s2, "box": box, "vertical": vertical, "conf": round(c2, 1), "second_chance": True}
                    texts.append(t); erase_text(t)
                elif (len(grp) >= 3 and sum(1 for q in grp if min(q[2], q[3]) >= 0.3 * th) >= 3) or \
                        (soft and (box[3] if vertical else box[2]) >= 1.6 * th):
                    # looks like lettering but could not be read: never let glyphs fall through and become linework
                    u = {"box": box, "vertical": vertical, "read": s2, "conf": round(c2, 1)}
                    if soft:
                        bx_, by_, bw_, bh_ = [int(round(v_)) for v_ in box]
                        if (rest[by_:by_ + bh_, bx_:bx_ + bw_] > 0).mean() < 0.30:
                            continue                        # blurred lettering is dense; this sparse is linework (window swings, arcs): leave it to the tracer
                        if re.fullmatch(r"[=\-_|~.:'\"\u2014\u2013]*", s2 or "") and min(bw_, bh_) < 0.7 * th_main:
                            continue                        # two short strokes read as '=': a wall cap, a jamb - linework
                        reg_ = rest[by_:by_ + bh_, bx_:bx_ + bw_]
                        if reg_.size and (reg_ > 0).any():
                            long_ = cv2.morphologyEx(reg_, cv2.MORPH_OPEN, np.ones((1, max(3, int(0.5 * bw_))), np.uint8)) if bw_ >= bh_ else \
                                cv2.morphologyEx(reg_, cv2.MORPH_OPEN, np.ones((max(3, int(0.5 * bh_)), 1), np.uint8))
                            if (long_ > 0).sum() >= 0.45 * (reg_ > 0).sum():
                                continue                    # ruled strokes as long as half the cluster: a window frame, not a word
                    if soft:                                # what the cluster says if it is forced to be a number (used with geometry later)
                        bx_, by_, bw_, bh_ = [int(round(v_)) for v_ in box]
                        cr_ = ocr_gray[by_ + PAD - 4:by_ + bh_ + PAD + 4, bx_ + PAD - 4:bx_ + bw_ + PAD + 4]
                        if cr_.size:
                            if vertical:
                                cr_ = cv2.rotate(cr_, cv2.ROTATE_90_COUNTERCLOCKWISE if vertical == "down" else cv2.ROTATE_90_CLOCKWISE)
                            zf_ = float(min(4.0, max(1.0, 44.0 / max(8.0, min(bw_, bh_)))))
                            cr_ = cv2.copyMakeBorder(cv2.resize(cr_, None, fx=zf_, fy=zf_, interpolation=cv2.INTER_CUBIC), 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
                            u["digits"] = re.sub(r"\D", "", pytesseract.image_to_string(cr_, config="--psm 7 -c tessedit_char_whitelist=0123456789"))
                    unread.append(u); erase_text(u)

    th = th_main
    # a trailing '/' that touches other ink (a WC bowl) is not a whole component, so erase_text leaves it behind:
    # find the stroke itself and remove it, the live text already carries the character
    rest_fat = cv2.dilate(rest, np.ones((3, 3), np.uint8))
    for t in texts:
        if t["vertical"] or not t["s"].rstrip().endswith("/"):
            continue
        x, y, w, h = t["box"]; best = (0.0, None)
        for xb in np.arange(x + w - 0.6 * h, x + w + 0.5 * h, 1.0):
            for lean in np.arange(0.15 * h, 0.65 * h, 1.0):
                yy = np.linspace(y + 1, y + h - 1, 16); xx = xb + lean * (y + h - yy) / h
                if xx.max() >= W or xx.min() < 0 or yy.max() >= H:
                    continue
                sc = float((rest_fat[yy.astype(int), xx.astype(int)] > 0).mean())
                if sc > best[0]:
                    best = (sc, (xb, lean))
        if best[0] >= 0.85:
            xb, lean = best[1]
            cv2.line(rest, (int(round(xb)), int(round(y + h))), (int(round(xb + lean * (h - 1) / h)), int(round(y + 1))), 0, 6)
            t["box"] = [x, y, max(w, xb + lean + 1 - x), h]
            if t.get("ink"):
                t["ink"][2] = max(t["ink"][2], int(math.ceil(xb + lean + 1)))

    # ---- 5. diagonals + door arcs (per skeleton chain) ---------------------
    diag, cand = [], []
    ink_fat = cv2.dilate(ink, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest)
    for i in range(1, n):
        x, y, w, h, a_ = st[i]
        if max(w, h) < 0.4 * T:
            continue
        comp = (lab[y:y + h, x:x + w] == i)
        for chain in trace_skeleton(skeletonize(comp)):
            pts = np.array([[px + x, py + y] for px, py in chain], dtype=np.float32)
            simp = cv2.approxPolyDP(pts.reshape(-1, 1, 2), 1.5, False)[:, 0, :]
            seg = np.hypot(*np.diff(simp, axis=0).T) if len(simp) > 1 else np.array([0.0])
            d_ = np.abs(np.diff(simp, axis=0)) if len(simp) > 1 else np.zeros((1, 2))
            axis_aligned = np.all(np.minimum(d_[:, 0], d_[:, 1]) < 2.0)
            if len(simp) >= 2 and len(pts) >= 6:
                # straight diagonal legs (bi-fold 'V's), also when they are only part of a longer chain. A leg is straight
                # against the dense chain, clearly off-axis and long; a 'V' has a real corner; curves give 3+ legs in a row
                idx = [int(np.argmin(np.hypot(pts[:, 0] - v[0], pts[:, 1] - v[1]))) for v in simp]
                idx[0], idx[-1] = 0, len(pts) - 1
                def leg_ok(j):
                    d2 = np.abs(simp[j + 1] - simp[j]); L2 = float(np.hypot(*d2))
                    a_, b_ = sorted((idx[j], idx[j + 1]))
                    return L2 >= 0.6 * T and min(d2) >= 0.17 * max(d2) and b_ - a_ >= 2 and _chord_dev(pts[a_:b_ + 1].astype(float)) <= 1.25
                ok = [leg_ok(j) for j in range(len(simp) - 1)]
                j = 0; took = False
                while j < len(ok):
                    if not ok[j]:
                        j += 1; continue
                    e = j
                    while e + 1 < len(ok) and ok[e + 1]:
                        e += 1
                    run = simp[j:e + 2]
                    def turn_(p0, p1, p2):
                        return math.degrees(math.acos(max(-1, min(1, float(np.dot(_unit(p1 - p0), _unit(p2 - p1)))))))
                    gentle = (j > 0 and turn_(simp[j - 1], simp[j], simp[j + 1]) < 35) or \
                             (e + 2 < len(simp) and turn_(simp[e], simp[e + 1], simp[e + 2]) < 35)
                    if gentle:                              # the leg carries on as a curve: not a diagonal
                        j = e + 1; continue
                    if len(run) == 2:
                        diag.append([[float(px), float(py)] for px, py in run]); took = True
                    elif len(run) == 3:
                        v1, v2 = run[1] - run[0], run[2] - run[1]
                        if math.degrees(math.acos(max(-1, min(1, float(np.dot(_unit(v1), _unit(v2))))))) >= 35:
                            diag.append([[float(px), float(py)] for px, py in run]); took = True
                    j = e + 1
                if took and len(simp) <= 3:
                    continue
            if len(pts) >= 18:
                cx, cy, r = fit_circle(pts.astype(float))
                rms = float(np.sqrt(np.mean((np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) - r) ** 2)))
                if rms < 1.1 and (1.0 if not soft else 2.0) * T <= r <= 12 * T:
                    start, span = angular_span(pts.astype(float), cx, cy)
                    if span >= 20:
                        cand.append({"cx": cx, "cy": cy, "r": r, "start": start, "span": span})
    if DEBUG:
        for c_ in cand: print('cand', {k: round(v,1) for k,v in c_.items()})
    # hinge-driven: every long line may be a door leaf; verify a quarter circle against the original ink
    ink3 = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    found = []
    tt = np.radians(np.linspace(4, 86, 60))
    for l in lines:
        ln = l["b"] - l["a"]
        if not (0.9 * T <= ln <= 6 * T):
            continue
        ends = [(l["a"], l["b"]), (l["b"], l["a"])]
        for hp, tp in ends:
            hx, hy = (hp, l["c"]) if l["o"] == "h" else (l["c"], hp)
            leaf_ang = math.atan2((l["c"] if l["o"] == "h" else tp) - hy, (tp if l["o"] == "h" else l["c"]) - hx)
            for sgn in (1, -1):
                best = (0, None)
                for dr in range(-4, 5):
                    for jx in (-2, 0, 2):
                        for jy in (-2, 0, 2):
                            r_ = ln + dr
                            px = (hx + jx + r_ * np.cos(leaf_ang + sgn * tt)).astype(int)
                            py = (hy + jy + r_ * np.sin(leaf_ang + sgn * tt)).astype(int)
                            ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
                            if ok.sum() < len(tt):
                                continue
                            sc = (ink3[py, px] > 0).mean()
                            if sc > best[0]:
                                best = (sc, (hx + jx, hy + jy, r_))
                if best[0] >= 0.8:
                    # reject if the "arc" is really just ink everywhere (hatching): inner/outer rings must be mostly empty
                    hx2, hy2, r2 = best[1]
                    ring = []
                    for rr in (r2 - 7, r2 + 7):
                        px = np.clip((hx2 + rr * np.cos(leaf_ang + sgn * tt)).astype(int), 0, W - 1)
                        py = np.clip((hy2 + rr * np.sin(leaf_ang + sgn * tt)).astype(int), 0, H - 1)
                        ring.append((ink[py, px] > 0).mean())
                    if max(ring) < 0.35:
                        found.append({"cx": hx2, "cy": hy2, "r": r2, "leaf": math.degrees(leaf_ang) % 360,
                                      "sgn": sgn, "score": best[0]})
    found.sort(key=lambda d_: -d_["score"])
    hinge_doors = []
    for d_ in found:
        d_["start"] = (d_["leaf"] if d_["sgn"] == 1 else d_["leaf"] - 90) % 360
        if all(math.hypot(d_["cx"] - e["cx"], d_["cy"] - e["cy"]) > 0.6 * T
               or abs(((d_["start"] - e["start"] + 180) % 360) - 180) > 30 for e in hinge_doors):
            hinge_doors.append(d_)
    merged = []                                            # same circle seen in pieces -> one arc
    for a_ in sorted(cand, key=lambda a_: -a_["span"]):
        for m_ in merged:
            if math.hypot(a_["cx"] - m_["cx"], a_["cy"] - m_["cy"]) < 0.15 * m_["r"] + 3 and abs(a_["r"] - m_["r"]) < 0.08 * m_["r"] + 2:
                s0 = m_["start"]; rel = (a_["start"] - s0 + 180) % 360 - 180
                lo = min(0, rel); hi = max(m_["span"], rel + a_["span"])
                if hi - lo < 200:
                    m_["start"], m_["span"] = (s0 + lo) % 360, hi - lo
                break
        else:
            merged.append(dict(a_))
    arcs, doors = list(pre_arcs), list(pre_doors)
    def on_spent(cx_, cy_, r_, a0_, span_):
        if arc_spent is None:
            return False
        tt_ = np.radians(np.linspace(a0_ + 5, a0_ + span_ - 5, 40))
        px = np.clip(np.rint(cx_ + r_ * np.cos(tt_)).astype(int), 0, W - 1); py = np.clip(np.rint(cy_ + r_ * np.sin(tt_)).astype(int), 0, H - 1)
        return float(cv2.dilate(arc_spent.astype(np.uint8), np.ones((5, 5), np.uint8))[py, px].mean()) > 0.5
    hinge_doors = [d_ for d_ in hinge_doors if not on_spent(d_["cx"], d_["cy"], d_["r"], (d_["leaf"] if d_["sgn"] == 1 else d_["leaf"] - 90), 90.0)]
    merged = [a_ for a_ in merged if not on_spent(a_["cx"], a_["cy"], a_["r"], a_["start"], a_["span"])]
    for d_ in hinge_doors:
        start = d_["leaf"] if d_["sgn"] == 1 else d_["leaf"] - 90
        arcs.append({"cx": d_["cx"], "cy": d_["cy"], "r": d_["r"], "start": start % 360, "span": 90.0})
        doors.append({"hinge": [round(d_["cx"], 1), round(d_["cy"], 1)], "leaf_px": round(d_["r"], 1),
                      "leaf_angle_deg": round(d_["leaf"], 1), "swing": "cw" if d_["sgn"] == 1 else "ccw"})
        cv2.ellipse(rest, (int(round(d_["cx"])), int(round(d_["cy"]))), (int(round(d_["r"])),) * 2,
                    0, start - 3, start + 93, 0, 7)
    for a_ in merged:
        if any(math.hypot(a_["cx"] - e["cx"], a_["cy"] - e["cy"]) < 0.5 * T and abs(a_["r"] - e["r"]) < 0.3 * T for e in arcs):
            continue                                      # a door = arc + hinge + leaf along a radius
        if not (45 <= a_["span"] <= 135):
            continue
        cx, cy, r = a_["cx"], a_["cy"], a_["r"]
        leaf = None
        for ang in (a_["start"], a_["start"] + a_["span"]):
            t_ = np.linspace(0.2, 0.92, 24)
            px = np.clip((cx + r * t_ * math.cos(math.radians(ang))).astype(int), 0, W - 1)
            py = np.clip((cy + r * t_ * math.sin(math.radians(ang))).astype(int), 0, H - 1)
            if (ink_fat[py, px] > 0).mean() >= 0.8:
                leaf = ang % 360
        if DEBUG: print('merged', {k: round(v,1) for k,v in a_.items()}, 'leaf', leaf)
        if leaf is None:
            continue
        if 70 <= a_["span"] <= 110:                        # door swings are quarter circles
            mid = a_["start"] + a_["span"] / 2
            a_["start"], a_["span"] = mid - 45, 90.0
            q = round(a_["start"] / 90.0) * 90.0           # and orthogonal plans open to 0/90
            if abs(q - a_["start"]) < 8:
                a_["start"] = q
        arcs.append(a_)
        doors.append({"hinge": [round(cx, 1), round(cy, 1)], "leaf_px": round(r, 1), "leaf_angle_deg": round(leaf, 1)})
        cv2.ellipse(rest, (int(round(cx)), int(round(cy))), (int(round(r)), int(round(r))),
                    0, a_["start"] - 3, a_["start"] + a_["span"] + 3, 0, 5)
    if ridge_diags:
        def near_ridge(pt):
            for (x0, y0), (x1, y1) in ridge_diags:
                L_ = math.hypot(x1 - x0, y1 - y0); t_ = ((pt[0] - x0) * (x1 - x0) + (pt[1] - y0) * (y1 - y0)) / (L_ * L_)
                if -0.05 <= t_ <= 1.05 and abs((pt[0] - x0) * (y1 - y0) - (pt[1] - y0) * (x1 - x0)) / L_ <= 4.0:
                    return True
            return False
        diag = [p for p in diag if not all(near_ridge(q) for q in p)]
    for p in diag:                                         # a skeleton chain can stop at a spur: follow the ink to the real end
        for e0, e1 in ((0, 1), (-1, -2)):
            d_ = _unit(np.array(p[e0]) - np.array(p[e1])); q = np.array(p[e0], float); miss = 0
            for step in range(int(3 * T)):
                nx_ = q + d_
                xi, yi = int(nx_[0]), int(nx_[1])
                if not (1 <= xi < W - 1 and 1 <= yi < H - 1):
                    break
                if ink[yi - 1:yi + 2, xi - 1:xi + 2].any() and not wall_block[yi, xi]:
                    q = nx_; miss = 0
                else:
                    miss += 1; q = nx_
                    if miss > 1:
                        q = q - 2 * d_; break
            p[e0] = [float(q[0]), float(q[1])]
    for p in diag:
        cv2.polylines(rest, [np.array(p, np.int32)], False, 0, 5)
    for t in texts:                                        # a '/' that OCR read belongs to the label, not to the linework
        if "/" not in t["s"] or t["vertical"]:
            continue
        x, y, w, h = t["box"]
        for p in list(diag):
            xs_, ys_ = [q[0] for q in p], [q[1] for q in p]
            if len(p) == 2 and min(xs_) >= x - 3 and max(xs_) <= x + w + 0.8 * h and min(ys_) >= y - 4 and max(ys_) <= y + h + 4:
                diag.remove(p)
                x1 = max(x + w, max(xs_) + 1); t["box"] = [x, y, x1 - x, h]
    for t in texts:
        x, y, w, h = t["box"]
        for a_ in arcs:
            ang = np.radians(np.linspace(a_["start"], a_["start"] + a_["span"], 90))
            ax, ay = a_["cx"] + a_["r"] * np.cos(ang), a_["cy"] + a_["r"] * np.sin(ang)
            if ((ax > x) & (ax < x + w) & (ay > y) & (ay < y + h)).any():
                for img_ in (ocr_src, ocr_gray):
                    cv2.ellipse(img_, (int(round(a_["cx"])) + PAD, int(round(a_["cy"])) + PAD), (int(round(a_["r"])),) * 2,
                                0, a_["start"], a_["start"] + a_["span"], 255, 3)
                s2, c2 = recog(t["box"], t["vertical"])
                if s2 and word_re.match(s2.replace(" ", "")):
                    t["alt"], t["s"] = t["s"], s2
                break

    # ---- 5b. fixtures (WC, basin, sink ...): curved symbols are recognised as whole shapes ---------------
    # A component with real non-axis-aligned ink is a fixture seed. Short "long lines" that end on a seed (the flat
    # sides of a WC bowl, a cistern edge) were taken by the long-line pass: give them back, then fit each skeleton
    # chain with exact lines + smooth cubics (or an ellipse). Nothing curved is left for the short-line pass to chop up.
    k3 = np.ones((3, 3), np.uint8)
    h8 = cv2.morphologyEx(rest, cv2.MORPH_OPEN, np.ones((1, 8), np.uint8)); v8 = cv2.morphologyEx(rest, cv2.MORPH_OPEN, np.ones((8, 1), np.uint8))
    hv8 = cv2.bitwise_or(h8, v8)
    hv4 = cv2.bitwise_or(cv2.morphologyEx(rest, cv2.MORPH_OPEN, np.ones((1, 4), np.uint8)),
                         cv2.morphologyEx(rest, cv2.MORPH_OPEN, np.ones((4, 1), np.uint8)))
    resid4 = cv2.bitwise_and(rest, cv2.bitwise_not(cv2.dilate(hv4, k3)))
    # a gentle curve is a staircase of runs: each run starts where the previous one ends, one pixel over
    def stair_runs(runs):
        """Mask of horizontal runs that are partly (15-85 %) covered by a run in an adjacent row."""
        out_ = np.zeros_like(runs)
        rows2 = np.zeros((runs.shape[0] * 2, runs.shape[1]), np.uint8); rows2[::2] = runs     # blank rows: one component per run
        nr_, lr_ = cv2.connectedComponents(rows2, connectivity=4)
        lr_ = lr_[::2]
        if nr_ <= 1:
            return out_
        size_ = np.bincount(lr_.ravel(), minlength=nr_).astype(float)
        hit = np.zeros(nr_, bool)
        for sh in (1, -1):
            cov = np.bincount(lr_.ravel(), weights=((runs > 0) & (np.roll(runs, sh, 0) > 0)).ravel().astype(float), minlength=nr_)
            fr_ = cov / np.maximum(size_, 1)
            hit |= (fr_ >= 0.15) & (fr_ <= 0.85)
        hit[0] = False
        out_[hit[lr_]] = 255
        return out_
    stair = cv2.bitwise_or(stair_runs(h8), stair_runs(v8.T.copy()).T)
    resid = cv2.bitwise_and(rest, cv2.bitwise_not(cv2.dilate(hv8, k3)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest)
    seed = np.zeros_like(rest)
    solids, small, ring_fx = [], [], []
    for i in range(1, n):
        x, y, w, h, a_ = st[i]
        if 4 <= min(w, h) and max(w, h) < 6 and abs(w - h) <= 1 and a_ >= 8 and \
           int(gray[y + h // 2, x + w // 2]) >= int(gray[y:y + h, x:x + w].min()) + 40:
            ring_fx.append({"type": "circle", "cx": x + w / 2.0, "cy": y + h / 2.0, "r": max(1.0, (w + h) / 4.0 - 0.6)})
            rest[lab == i] = 0                              # a tiny ring (flush button, tap head)
            continue
        if a_ < 12 or max(w, h) < 6 or max(w, h) > 8 * T:
            continue
        own_ = lab[y:y + h, x:x + w] == i
        rr = (resid[y:y + h, x:x + w] > 0) & own_
        nn, _l, ss, _c = cv2.connectedComponentsWithStats(rr.astype(np.uint8))
        curved = any(max(ss[j, 2], ss[j, 3]) >= 6 and ss[j, 4] >= 8 for j in range(1, nn)) and \
            int(((resid4[y:y + h, x:x + w] > 0) & own_).sum()) >= 6
        ns_, _l2, s2_, _c2 = cv2.connectedComponentsWithStats(((stair[y:y + h, x:x + w] > 0) & own_).astype(np.uint8))
        stair_px = int(sum(s2_[j, 4] for j in range(1, ns_)))
        stepped = stair_px >= max(40, 0.28 * int(own_.sum()))   # WC ~0.4; a rectilinear cabinet with ragged 2px strokes ~0.2
        if max(w, h) <= 0.9 * T:
            # small symbol: anything with curved ink that is not just a little rectangle / frame tick
            blob8 = any(max(ss[j, 2], ss[j, 3]) >= 6 and ss[j, 4] >= 8 for j in range(1, nn))
            frac4 = float(((hv4[y:y + h, x:x + w] > 0) & own_).sum()) / max(1, int(own_.sum()))
            if DEBUG: print('small?', x, y, w, h, blob8, round(frac4, 2))
            if blob8 and frac4 < 0.9 and min(w, h) >= 5:
                small.append(i)
            continue
        if not (curved or stepped):
            continue
        seed[lab == i] = 255
    # tiny dense symbols (tap, flush button): strokes as wide as their details make a centre-line meaningless, so keep
    # the silhouette, traced at sub-pixel level from the grey image. Pieces cut apart by a crossing line are one symbol.
    groups = []
    for i in small:
        x, y, w, h, _a = st[i]
        for g_ in groups:
            if x <= g_[2] + 5 and g_[0] <= x + w + 5 and y <= g_[3] + 5 and g_[1] <= y + h + 5 and \
               max(max(g_[2], x + w) - min(g_[0], x), max(g_[3], y + h) - min(g_[1], y)) <= 1.2 * T:
                g_[0], g_[1], g_[2], g_[3] = min(g_[0], x), min(g_[1], y), max(g_[2], x + w), max(g_[3], y + h); g_[4].append(i)
                break
        else:
            groups.append([x, y, x + w, y + h, [i]])
    for gx0, gy0, gx1, gy1, ids in groups:
        Z, p_ = 4, 4
        x0, y0, x1, y1 = max(0, gx0 - p_), max(0, gy0 - p_), min(W, gx1 + p_), min(H, gy1 + p_)
        own = cv2.dilate(np.isin(lab[y0:y1, x0:x1], ids).astype(np.uint8), np.ones((5, 5), np.uint8))
        g_ = np.where(own > 0, gray[y0:y1, x0:x1], 255).astype(np.uint8)
        up = cv2.resize(g_, None, fx=Z, fy=Z, interpolation=cv2.INTER_CUBIC)
        cn, hr = cv2.findContours((up < min(thr, 190)).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        rings = []
        for c_ in cn:
            if len(c_) < 12:
                continue
            pts_ = (c_[:, 0, :].astype(float) + 0.5) / Z + [x0, y0]
            fx = fit_fixture_chain(np.vstack([pts_, pts_[:1]]), T, tol=0.3)
            if fx:
                rings.append(fx)
        if rings:
            solids.append(rings)
            rest[np.isin(lab, ids)] = 0
    fix_mask = seed.copy()
    joined = []
    changed = True
    while changed and seed.any():
        changed = False
        near = cv2.dilate(fix_mask, np.ones((9, 9), np.uint8))
        for l in lines:
            if any(l is j_ for j_ in joined) or l["b"] - l["a"] > 3 * T:
                continue
            ends = [(l["a"], l["c"]), (l["b"], l["c"])] if l["o"] == "h" else [(l["c"], l["a"]), (l["c"], l["b"])]
            if any(near[min(H - 1, max(0, int(ey))), min(W - 1, max(0, int(ex)))] for ex, ey in ends):
                x0, x1, y0, y1 = ((l["a"], l["b"], l["c"] - l["t"] / 2 - 2, l["c"] + l["t"] / 2 + 2) if l["o"] == "h"
                                  else (l["c"] - l["t"] / 2 - 2, l["c"] + l["t"] / 2 + 2, l["a"], l["b"]))
                x0, x1, y0, y1 = int(max(0, x0)), int(min(W, x1 + 1)), int(max(0, y0)), int(min(H, y1 + 1))
                fix_mask[y0:y1, x0:x1] = cv2.bitwise_or(fix_mask[y0:y1, x0:x1], thin[y0:y1, x0:x1])
                joined.append(l); changed = True
    lines = [l for l in lines if not any(l is j_ for j_ in joined)]
    fixtures = []
    n, lab, st, _ = cv2.connectedComponentsWithStats(fix_mask)
    for i in range(1, n):
        x, y, w, h, a_ = st[i]
        if a_ < 12 or max(w, h) < 5:
            continue
        comp = (lab[y:y + h, x:x + w] == i)
        chains = [np.array([[px + x, py + y] for px, py in ch], float) for ch in trace_skeleton(skeletonize(comp))]
        # chains of one symbol must meet exactly where the skeleton branches
        ends = [(ci, e) for ci, ch in enumerate(chains) for e in (0, -1) if np.hypot(*(ch[0] - ch[-1])) > 1.5]
        used = set()
        for a_i, (ci, e) in enumerate(ends):
            if a_i in used:
                continue
            grp = [a_i] + [b_i for b_i in range(a_i + 1, len(ends)) if b_i not in used
                           and np.hypot(*(chains[ends[b_i][0]][ends[b_i][1]] - chains[ci][e])) <= 3.0]
            if len(grp) > 1:
                m_ = np.mean([chains[ends[g][0]][ends[g][1]] for g in grp], axis=0)
                for g in grp:
                    chains[ends[g][0]][ends[g][1]] = m_; used.add(g)
        chains = merge_smooth_chains(chains)
        for ch in chains:
            if len(ch) < 4 or cv2.arcLength(ch.astype(np.float32).reshape(-1, 1, 2), False) < 5:
                continue
            fx = fit_fixture_chain(ch, T)
            if fx:
                fx["symbol"] = i
                fixtures.append(fx)
    # small door leaves escape the hinge search above (their leaf is shorter than a "long line"), and end up here as a
    # traced straight leaf + a piece of curve. Test every such leaf as a door: hinge at one end, exact quarter circle.
    tq_ = np.radians(np.linspace(4, 86, 60))
    def quarter(hx_, hy_, r_, leaf_ang, sgn_):
        best_ = (0.0, None)
        ux_, uy_ = math.cos(leaf_ang), math.sin(leaf_ang)  # hinge -> tip. The tip is well traced; the hinge end is often cut short
        for t_ in range(-4, 15):                             # so slide the hinge back along the leaf with the tip fixed
            for jp in (-2, -1, 0, 1, 2):
                for dr in (-1, 0, 1):
                    hxx, hyy = hx_ - t_ * ux_ - jp * uy_, hy_ - t_ * uy_ + jp * ux_
                    rr_ = r_ + t_ + dr
                    px = (hxx + rr_ * np.cos(leaf_ang + sgn_ * tq_)).astype(int); py = (hyy + rr_ * np.sin(leaf_ang + sgn_ * tq_)).astype(int)
                    if px.min() < 0 or py.min() < 0 or px.max() >= W or py.max() >= H:
                        continue
                    sc_ = float((ink[py, px] > 0).mean()) + 0.25 * float((ink3[py, px] > 0).mean())
                    if sc_ > best_[0]:
                        best_ = (sc_, (hxx, hyy, rr_))
        if best_[1] is not None:
            hxx, hyy, rr_ = best_[1]
            px = (hxx + rr_ * np.cos(leaf_ang + sgn_ * tq_)).astype(int); py = (hyy + rr_ * np.sin(leaf_ang + sgn_ * tq_)).astype(int)
            best_ = (float((ink3[py, px] > 0).mean()), best_[1])
        if best_[0] < 0.8:
            return None
        hx2, hy2, r2 = best_[1]
        for rr_ in (r2 - 6, r2 + 6):                         # not just ink everywhere
            px = np.clip((hx2 + rr_ * np.cos(leaf_ang + sgn_ * tq_)).astype(int), 0, W - 1); py = np.clip((hy2 + rr_ * np.sin(leaf_ang + sgn_ * tq_)).astype(int), 0, H - 1)
            if float((ink[py, px] > 0).mean()) >= 0.35:
                return None
        return best_[0], hx2, hy2, r2
    drop = set()
    for fi, fx in enumerate(fixtures):
        if fx["type"] != "path" or fx["closed"]:
            continue
        cur_ = fx["start"]
        for sg in fx["segs"]:
            if sg[0] == "L":
                (xa, ya), (xb, yb) = cur_, sg[1]
                ln_ = math.hypot(xb - xa, yb - ya)
                if 0.6 * T <= ln_ <= 2.5 * T and (abs(xa - xb) <= 1.0 or abs(ya - yb) <= 1.0):
                    found_ = None
                    for (hx_, hy_), (tx_, ty_) in (((xa, ya), (xb, yb)), ((xb, yb), (xa, ya))):
                        la = math.radians(round(math.degrees(math.atan2(ty_ - hy_, tx_ - hx_)) / 90.0) * 90.0)
                        for sgn_ in (1, -1):
                            q_ = quarter(hx_, hy_, ln_, la, sgn_)
                            if q_ and (found_ is None or q_[0] > found_[0][0]):
                                found_ = (q_, la, sgn_)
                    if found_:
                        (sc_, hx2, hy2, r2), la, sgn_ = found_
                        # exact geometry: the hinge is on the leaf's own axis, where the frame line crosses it; radius = hinge -> tip
                        vert = abs(xa - xb) <= 1.0
                        tip = (xb, yb) if math.hypot(xa - hx2, ya - hy2) < math.hypot(xb - hx2, yb - hy2) else (xa, ya)
                        if vert:
                            hx2 = (xa + xb) / 2.0
                            near_ = [l_["c"] for l_ in lines if l_["o"] == "h" and abs(l_["c"] - hy2) <= 5 and l_["a"] - 3 <= hx2 <= l_["b"] + 3]
                            hy2 = min(near_, key=lambda c_: abs(c_ - hy2)) if near_ else hy2
                            r2 = abs(tip[1] - hy2)
                        else:
                            hy2 = (ya + yb) / 2.0
                            near_ = [l_["c"] for l_ in lines if l_["o"] == "v" and abs(l_["c"] - hx2) <= 5 and l_["a"] - 3 <= hy2 <= l_["b"] + 3]
                            hx2 = min(near_, key=lambda c_: abs(c_ - hx2)) if near_ else hx2
                            r2 = abs(tip[0] - hx2)
                        st_ = math.degrees(la) if sgn_ == 1 else math.degrees(la) - 90
                        arcs.append({"cx": float(hx2), "cy": float(hy2), "r": float(r2), "start": st_ % 360, "span": 90.0, "from": "small-leaf"})
                        doors.append({"hinge": [round(float(hx2), 1), round(float(hy2), 1)], "leaf_px": round(float(r2), 1),
                                      "leaf_angle_deg": round(math.degrees(la) % 360, 1), "swing": "cw" if sgn_ == 1 else "ccw", "small_leaf": True})
                        # this component was a door, not a fixture: only the swing is curved. Give everything else (jamb,
                        # frame, the leaf itself) back to the rectilinear pipeline instead of fitting it as a free-form shape
                        sid = fx.get("symbol")
                        for fj, fo in enumerate(fixtures):
                            if fo.get("symbol") == sid:
                                drop.add(fj)
                        cm_ = (lab == sid)
                        fix_mask[cm_] = 0
                        for jl in list(joined):
                            jx_, jy_ = ((jl["a"] + jl["b"]) / 2.0, jl["c"]) if jl["o"] == "h" else (jl["c"], (jl["a"] + jl["b"]) / 2.0)
                            if cm_[int(min(H - 1, jy_)), int(min(W - 1, jx_))]:
                                lines.append(jl); joined.remove(jl)
                        cv2.ellipse(rest, (int(round(hx2)), int(round(hy2))), (int(round(r2)),) * 2, 0, st_ - 2, st_ + 92, 0, 7)
            cur_ = sg[1]
    if soft:
        # the narrow leaf of a one-and-a-half door swings both ways: a short line standing ACROSS the threshold line, a small
        # quarter circle on either side of it.  Too small for the swing vote (r < 2T), so test exactly this figure.
        for l_ in list(lines):
            ln_ = l_["b"] - l_["a"]
            if "dash" in l_ or not (0.6 * T <= ln_ <= 5.0 * T):
                continue
            for q_ in lines:
                if q_["o"] == l_["o"] or "dash" in q_ or not (q_["a"] - 2 <= l_["c"] <= q_["b"] + 2):
                    continue
                if not (l_["a"] - 2.5 <= q_["c"] <= l_["b"] + 2.5):
                    continue                                # the leaf stands on (or across) this line
                hx_, hy_ = (l_["c"], q_["c"]) if l_["o"] == "v" else (q_["c"], l_["c"])
                h0_ = hy_ if l_["o"] == "v" else hx_
                arms = [tip_ for tip_ in (l_["a"], l_["b"]) if 0.6 * T <= abs(tip_ - h0_) < 2.0 * T]
                if not arms:
                    continue
                got = []
                for tip_ in arms:
                    r_ = abs(tip_ - h0_)
                    la = (math.pi / 2 if tip_ > h0_ else -math.pi / 2) if l_["o"] == "v" else (0.0 if tip_ > h0_ else math.pi)
                    found_ = None
                    for sgn_ in (1, -1):
                        qq = quarter(hx_, hy_, r_, la, sgn_)
                        if qq and (found_ is None or qq[0] > found_[0][0]):
                            found_ = (qq, sgn_)
                    if found_ and found_[0][0] >= 0.85:
                        got.append((r_, la, found_[1]))
                if len(got) == 1:                           # the other half of the leaf lies on a wall face: look for its swing as well
                    r_, la, sgn_ = got[0]
                    qq = quarter(hx_, hy_, r_, la + math.pi, -sgn_)
                    if qq and qq[0] >= 0.85:
                        got.append((r_, la + math.pi, -sgn_))
                twin = len(got) == 1 and any(math.hypot(a_["cx"] - hx_, a_["cy"] - hy_) <= 0.6 * T and abs(a_["r"] - got[0][0]) <= 0.35 * got[0][0] for a_ in arcs)
                if len(got) < 2 and not twin:
                    continue                                # one small quarter circle on its own is too easily a fixture corner
                for r_, la, sgn_ in got:
                    st_ = math.degrees(la) if sgn_ == 1 else math.degrees(la) - 90
                    if any(math.hypot(a_["cx"] - hx_, a_["cy"] - hy_) <= 0.5 * T and abs(a_["r"] - r_) <= 0.3 * r_ and
                           abs(((a_["start"] - st_) + 180) % 360 - 180) < 45 for a_ in arcs):
                        continue
                    arcs.append({"cx": float(hx_), "cy": float(hy_), "r": float(r_), "start": st_ % 360, "span": 90.0, "from": "double-swing-leaf"})
                    cv2.ellipse(rest, (int(round(hx_)), int(round(hy_))), (int(round(r_)),) * 2, 0, st_ - 2, st_ + 92, 0, 7)
                break
    # a "fixture" made only of axis-aligned straight pieces is not a fixture: it is ordinary linework that was pulled in
    # with a seed (or lost its seed to a door). Hand it back so it is snapped, merged and joined like every other line.
    by_sym = {}
    for fi, fx in enumerate(fixtures):
        if fi not in drop:
            by_sym.setdefault(fx.get("symbol"), []).append(fi)
    for sid, idxs in by_sym.items():
        def straight_(fx):
            if fx["type"] != "path":
                return False
            cur_ = np.array(fx["start"], float)
            for sg in fx["segs"]:
                end_ = np.array(sg[3] if sg[0] == "C" else sg[1], float)
                chord = float(np.hypot(*(end_ - cur_)))
                if sg[0] == "L":
                    ok_ = min(abs(end_[0] - cur_[0]), abs(end_[1] - cur_[1])) <= 2.0
                elif sg[0] == "A":
                    ok_ = chord <= 4.0 or sg[2] - math.sqrt(max(0.0, sg[2] ** 2 - (chord / 2.0) ** 2)) <= 1.0
                else:                                        # a cubic whose control points hug the chord is a straight piece
                    ok_ = chord <= 4.0 or _chord_dev(np.array([cur_, sg[1], sg[2], end_], float)) <= 1.0
                if not ok_:
                    return False
                cur_ = end_
            return True
        if sid is None or not all(straight_(fixtures[fi]) for fi in idxs):
            continue
        drop.update(idxs)
        cm_ = (lab == sid)
        fix_mask[cm_] = 0
        for jl in list(joined):
            jx_, jy_ = ((jl["a"] + jl["b"]) / 2.0, jl["c"]) if jl["o"] == "h" else (jl["c"], (jl["a"] + jl["b"]) / 2.0)
            if cm_[max(0, int(min(H - 1, jy_)) - 1):int(min(H - 1, jy_)) + 2, max(0, int(min(W - 1, jx_)) - 1):int(min(W - 1, jx_)) + 2].any():
                lines.append(jl); joined.remove(jl)
    fixtures = [fx for fi, fx in enumerate(fixtures) if fi not in drop]
    fixtures += ring_fx
    rest = cv2.bitwise_and(rest, cv2.bitwise_not(cv2.dilate(fix_mask, k3)))

    # ---- 6. short lines, then what is left = fixtures ----------------------
    short, short_mask = line_pass(cv2.bitwise_and(rest, cv2.bitwise_not(text_protect)) if soft else rest, 6 if not soft else 5 * work_scale)   # curves are gone by now, so short frame ticks are safe to take
    lines += short
    rest = cv2.bitwise_and(rest, cv2.bitwise_not(cv2.dilate(short_mask, np.ones((3, 3), np.uint8))))

    n, lab, st, _ = cv2.connectedComponentsWithStats(rest)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 12 or max(w, h) < 5:
            continue
        comp = (lab[y:y + h, x:x + w] == i)
        for chain in trace_skeleton(skeletonize(comp)):
            ch = np.array([[px + x, py + y] for px, py in chain], float)
            if cv2.arcLength(ch.astype(np.float32).reshape(-1, 1, 2), False) > 4:
                fx = fit_fixture_chain(ch, T)
                if fx:
                    fx["leftover"] = True
                    if soft and fx.get("type") == "path":
                        # crumbs and jagged traces of blurred detail are not drawing: a leftover is kept only when it is a
                        # reasonably long, SMOOTH shape (few pieces for its length)
                        ln_ = float(cv2.arcLength(ch.astype(np.float32).reshape(-1, 1, 2), False))
                        if ln_ < 1.2 * T or len(fx["segs"]) > max(2, ln_ / (1.0 * T)):
                            continue
                    fixtures.append(fx)

    if soft:
        # a straight horizontal / vertical stroke that ended up traced as a free shape (a faint line the line passes lost) is a
        # line: drawn as a traced path it wobbles, as a line it is snapped, merged and joined like the rest of the drawing
        keep_fx = []
        for fx in fixtures:
            if fx.get("type") == "path" and not fx.get("closed"):
                sp_ = np.array(_sample_fixture(fx), float)
                if len(sp_) >= 2:
                    (x0_, y0_), (x1_, y1_) = sp_.min(0), sp_.max(0)
                    thin_ = max(3.0, 0.1 * T)
                    if y1_ - y0_ <= thin_ and x1_ - x0_ >= 0.8 * T:
                        lines.append({"o": "h", "c": float(np.median(sp_[:, 1])), "a": float(x0_), "b": float(x1_), "t": 3.0}); continue
                    if x1_ - x0_ <= thin_ and y1_ - y0_ >= 0.8 * T:
                        lines.append({"o": "v", "c": float(np.median(sp_[:, 0])), "a": float(y0_), "b": float(y1_), "t": 3.0}); continue
            keep_fx.append(fx)
        fixtures = keep_fx

    # ---- 7. global snap -------------------------------------------------------
    tol = 2.5
    xs = [p[0] for w_ in walls + greys for p in w_["pts"]] + [l["c"] for l in lines if l["o"] == "v"]
    ys = [p[1] for w_ in walls + greys for p in w_["pts"]] + [l["c"] for l in lines if l["o"] == "h"]
    wx, wy = {}, {}
    for w_ in walls:                                        # walls anchor the grid, then long lines, then short ones
        for p in w_["pts"]:
            wx[p[0]] = wx.get(p[0], 0.0) + 20 * T; wy[p[1]] = wy.get(p[1], 0.0) + 20 * T
    for l in lines:
        d_ = wy if l["o"] == "h" else wx
        d_[l["c"]] = d_.get(l["c"], 0.0) + (l["b"] - l["a"])
    mx, my = cluster_1d(xs, tol, wx), cluster_1d(ys, tol, wy)
    for w_ in walls + greys:
        w_["pts"] = [[mx[p[0]], my[p[1]]] for p in w_["pts"]]
    for l in lines:
        l["_c0"] = l["c"]                                   # where the ink really is: pixel tests must not use snapped positions
        l["c"] = (my if l["o"] == "h" else mx)[l["c"]]
    # merge collinear pieces / detect dashed runs (before corners, so a corner sees whole lines)
    lines = merge_collinear(lines)
    # rounded corners: an h end and a v end that BOTH stop short of their common corner by about the same amount, with
    # ink on the quarter circle between them. Found on the raw ends, before end-snapping can close the gap the wrong way.
    fillets = []
    hl = [l for l in lines if l["o"] == "h" and "dash" not in l]; vl = [l for l in lines if l["o"] == "v" and "dash" not in l]
    gmax = 0.4 * T
    cand_f = []
    for lh in hl:
        for he in ("a", "b"):
            for lv in vl:
                for ve in ("a", "b"):
                    xh, yc, xc, yv = lh[he], lh["c"], lv["c"], lv[ve]
                    gx, gy = abs(xh - xc), abs(yv - yc)
                    if not (0.5 <= gx <= gmax and 0.5 <= gy <= gmax and abs(gx - gy) <= 3.5):
                        continue
                    # both ends must stop SHORT of the corner (the corner lies beyond each end, outwards)
                    if (xc - xh) * (1 if he == "b" else -1) < 0 or (yc - yv) * (1 if ve == "b" else -1) < 0:
                        continue
                    if abs(lh["b" if he == "a" else "a"] - xc) < gx or abs(lv["b" if ve == "a" else "a"] - yc) < gy:
                        continue                            # each end must be the one pointing at the corner
                    sx, sy = (1 if xc > xh else -1), (1 if yc > yv else -1)
                    xr, yr = lv.get("_c0", xc), lh.get("_c0", yc)  # raw corner, for looking at pixels
                    best = (0.0, None)
                    for r_ in np.arange(max(gx, gy), max(gx, gy) + 0.25 * T, 0.5):
                        tt_ = np.linspace(0.15, np.pi / 2 - 0.15, 14)
                        ax_ = (xr - sx * r_) + sx * r_ * np.sin(tt_); ay_ = (yr - sy * r_) + sy * r_ * np.cos(tt_)
                        if ax_.min() < 0 or ay_.min() < 0 or ax_.max() >= W or ay_.max() >= H:
                            continue
                        sc = float((ink[ay_.astype(int), ax_.astype(int)] > 0).mean())
                        if sc > best[0] + 1e-9:
                            best = (sc, float(r_))
                    px_ = np.r_[np.linspace(xh, xr, 8), np.full(8, xr)]; py_ = np.r_[np.full(8, yr), np.linspace(yr, yv, 8)]
                    cor_sc = float((ink[np.clip(py_.astype(int), 0, H - 1), np.clip(px_.astype(int), 0, W - 1)] > 0).mean())
                    if cor_sc >= 0.8:                       # the ink runs into a square corner: the ends were only cut short
                        cand_f.append((2.0 + cor_sc, lh, he, lv, ve, 0.0, sx, sy)); continue
                    # a small rounded corner (too small to draw as a fillet): both runs fall short by about the same amount
                    # and there is ink between them. Close it square, and do it BEFORE blind end-snapping can pair either
                    # end with the wrong neighbour (nested basin rectangles are only 4-5 px apart).
                    r0 = max(gx, gy)
                    tt_ = np.linspace(0.2, np.pi / 2 - 0.2, 10)
                    ax_ = np.clip(((xr - sx * r0) + sx * r0 * np.sin(tt_)).astype(int), 0, W - 1); ay_ = np.clip(((yr - sy * r0) + sy * r0 * np.cos(tt_)).astype(int), 0, H - 1)
                    if max(gx, gy) >= 2.0 and float((ink3[ay_, ax_] > 0).mean()) >= 0.7 and not (best[0] >= 0.8 and best[1] >= 3.5 and cor_sc < 0.5):
                        cand_f.append((1.0 - 0.1 * abs(gx - gy), lh, he, lv, ve, 0.0, sx, sy)); continue
                    if cor_sc < 0.5 and best[0] >= 0.8 and best[1] >= 3.5 and int(gray[int(min(H - 1, yr)), int(min(W - 1, xr))]) >= 225 and \
                       int(gray[int(min(H - 1, max(0, yr - 0.5 * sy))), int(min(W - 1, max(0, xr - 0.5 * sx)))]) >= 200:
                        cand_f.append((best[0], lh, he, lv, ve, best[1], sx, sy))
    cand_f.sort(key=lambda c: -c[0])
    for sc, lh, he, lv, ve, r_, sx, sy in cand_f:
        if he in lh.get("_lock", ()) or ve in lv.get("_lock", ()):
            continue
        xc, yc = lv["c"], lh["c"]
        lh[he], lv[ve] = xc - sx * r_, yc - sy * r_
        lh.setdefault("_lock", []).append(he); lv.setdefault("_lock", []).append(ve)
        if r_ == 0.0:
            continue
        fillets.append({"cx": xc - sx * r_, "cy": yc - sy * r_, "r": r_, "from": [xc - sx * r_, yc], "to": [xc, yc - sy * r_],
                        "sweep": 0 if sx * sy > 0 else 1, "_l": lh})
    # endpoints -> meet perpendicular lines / wall edges exactly; only lines/edges that really pass by this end count
    wall_v, wall_h = [], []
    for w_ in walls:
        P = w_["pts"]
        for i in range(len(P)):
            p, q = P[i], P[(i + 1) % len(P)]
            if p[0] == q[0]:
                wall_v.append((p[0], min(p[1], q[1]), max(p[1], q[1])))
            elif p[1] == q[1]:
                wall_h.append((p[1], min(p[0], q[0]), max(p[0], q[0])))
    snap_t = 4.0 if not soft else max(4.0, 0.4 * T)        # a blurred end is only known to a few px: snap further
    def snap_end(v, cands, t=None):
        t = snap_t if t is None else t
        best = min(cands, key=lambda c: abs(c - v)) if cands else v
        return best if abs(best - v) <= t else v
    reach_ = 4.0 if not soft else max(4.0, 0.4 * T)
    for l in lines:
        if l["o"] == "h":
            cands = [v_["c"] for v_ in lines if v_["o"] == "v" and v_["a"] - reach_ <= l["c"] <= v_["b"] + reach_] + \
                    [x_ for x_, y0_, y1_ in wall_v if y0_ - 4 <= l["c"] <= y1_ + 4]
        else:
            cands = [h_["c"] for h_ in lines if h_["o"] == "h" and h_["a"] - reach_ <= l["c"] <= h_["b"] + reach_] + \
                    [y_ for y_, x0_, x1_ in wall_h if x0_ - 4 <= l["c"] <= x1_ + 4]
        for e_ in ("a", "b"):
            if e_ in l.get("_lock", ()):
                continue
            sgn_ = 1 if e_ == "b" else -1                  # outward direction of this end
            outw = [c for c in cands if (c - l[e_]) * sgn_ >= (-3.0 if not soft else -snap_t)]   # an end is extended to a neighbour, never pulled back far
            v_new = snap_end(l[e_], outw)
            if soft and (v_new - l[e_]) * sgn_ > 4.0:
                # a blurred end is only known to a few px - but a gap that shows PAPER is drawn, not blur (an extension line
                # stops short of the wall it refers to): no blind snap across it
                lo_, hi_ = sorted((l[e_], v_new)); c0 = int(round(l.get("_c0", l["c"]) - 0.5))
                us_ = np.arange(int(lo_), int(hi_) + 1)
                rows_ = [gray[np.clip(c0 + k_, 0, H - 1), np.clip(us_, 0, W - 1)] if l["o"] == "h" else gray[np.clip(us_, 0, H - 1), np.clip(c0 + k_, 0, W - 1)] for k_ in (-1, 0, 1)]
                bright_ = np.min(np.array(rows_), axis=0) > 215
                run_ = best_run_ = 0
                for b_ in bright_:
                    run_ = run_ + 1 if b_ else 0; best_run_ = max(best_run_, run_)
                if best_run_ >= 1.5 * work_scale:
                    v_new = l[e_]
            ahead = [c for c in cands if (c - l[e_]) * sgn_ > 0]
            if v_new == l[e_] and ahead:
                # further than the blind tolerance, but the ink itself runs on to the next line (the long-line pass cut it)
                far = min(ahead, key=lambda c: abs(c - l[e_]))
                if 4.0 < abs(far - l[e_]) <= 0.35 * T:
                    us = np.linspace(l[e_], far, 8); c0 = l.get("_c0", l["c"])
                    px_ = (us if l["o"] == "h" else np.full(8, c0)).astype(int); py_ = (np.full(8, c0) if l["o"] == "h" else us).astype(int)
                    # the ink must run on in the line's OWN one/two pixel rows (a rounded corner curving away does not count)
                    if l["o"] == "h":
                        band = (ink[np.clip(py_, 0, H - 1), np.clip(px_, 0, W - 1)] > 0) | (ink[np.clip(py_ - 1, 0, H - 1), np.clip(px_, 0, W - 1)] > 0)
                    else:
                        band = (ink[np.clip(py_, 0, H - 1), np.clip(px_, 0, W - 1)] > 0) | (ink[np.clip(py_, 0, H - 1), np.clip(px_ - 1, 0, W - 1)] > 0)
                    if band.all():
                        v_new = far
            l[e_] = v_new
    vx = sorted(set(mx.values())); hy = sorted(set(my.values()))
    lines = [l for l in lines if l["b"] - l["a"] >= 1.0]
    # after the ends have been snapped, collinear pieces that now touch are one line (a stroke cut by an erased crossing)
    solid_ = [l for l in lines if "dash" not in l]; dashed_ = [l for l in lines if "dash" in l]
    rejoined = []
    for o_ in ("h", "v"):
        grp_ = {}
        if soft:
            # pieces of one blurred line can sit a pixel apart across it: bring them onto one coordinate first
            ls_ = sorted([l for l in solid_ if l["o"] == o_], key=lambda q: q["c"])
            i_ = 0
            while i_ < len(ls_):
                j_ = i_
                while j_ + 1 < len(ls_) and ls_[j_ + 1]["c"] - ls_[j_]["c"] <= 1.5 and ls_[j_ + 1]["c"] - ls_[i_]["c"] <= 2.5:
                    j_ += 1
                if j_ > i_:
                    wt_ = [q["b"] - q["a"] for q in ls_[i_:j_ + 1]]
                    cm_ = ls_[i_ + int(np.argmax(wt_))]["c"]       # the longest piece knows best
                    for q in ls_[i_:j_ + 1]:
                        q["c"] = cm_
                i_ = j_ + 1
        for l in solid_:
            if l["o"] == o_:
                grp_.setdefault(l["c"], []).append(l)
        for c_, segs_ in grp_.items():
            segs_.sort(key=lambda q: q["a"])
            cur_l = segs_[0]
            for q in segs_[1:]:
                locked = ("b" in cur_l.get("_lock", ())) or ("a" in q.get("_lock", ()))
                bridged = False
                if soft and not locked and 0.75 < q["a"] - cur_l["b"] <= 12 * T:
                    # the valley is lost where a line runs through grey hatching or fused detail, but its ink carries on
                    c0_ = int(round(cur_l.get("_c0", c_) - 0.5)); g0, g1 = int(cur_l["b"]), int(q["a"])
                    strip = bridge_ok[np.clip(c0_, 0, H - 1), g0:g1] if o_ == "h" else bridge_ok[g0:g1, np.clip(c0_, 0, W - 1)]   # (not through walls)
                    bridged = strip.size > 0 and float((strip > 0).mean()) >= 0.92
                if (q["a"] - cur_l["b"] <= 0.75 or bridged) and not locked:
                    cur_l["b"] = max(cur_l["b"], q["b"]); cur_l["t"] = max(cur_l["t"], q["t"])
                    if "b" in q.get("_lock", ()):
                        cur_l.setdefault("_lock", []).append("b")
                else:
                    rejoined.append(cur_l); cur_l = q
            rejoined.append(cur_l)
    lines = rejoined + dashed_
    # short ticks between two close parallel lines (door-jamb rebates, bar ends) are shorter than any line pass can
    # take, and the ring removed around a nearby long line often eats them. Read them straight from the ink: a tick is a
    # row (column) of unbroken ink bridging the pair that no existing line already explains.
    ticks = []
    for o_ in ("v", "h"):
        par = [l for l in lines if l["o"] == o_ and "dash" not in l]
        perp = [l for l in lines if l["o"] != o_ and "dash" not in l]
        for i_, l1 in enumerate(par):
            for l2 in par[i_ + 1:]:
                lo_, hi_ = sorted((l1, l2), key=lambda q: q["c"])
                gap_ = hi_["c"] - lo_["c"]
                if not (2.5 <= gap_ <= 0.3 * T):
                    continue
                s0, s1 = max(l1["a"], l2["a"]), min(l1["b"], l2["b"])
                if s1 - s0 < 3:
                    continue
                c_lo, c_hi = int(round(lo_.get("_c0", lo_["c"]) - 0.5)), int(round(hi_.get("_c0", hi_["c"]) - 0.5))
                run_ = []
                for u in range(int(s0) - 1, int(s1) + 2):
                    if not (0 <= u < (H if o_ == "v" else W)):
                        continue
                    strip = ink[u, c_lo:c_hi + 1] if o_ == "v" else ink[c_lo:c_hi + 1, u]
                    if strip.size and (strip > 0).all():
                        run_.append(u)
                    elif run_:
                        run_.append(None)
                groups_, cur_g = [], []
                for u in run_ + [None]:
                    if u is None:
                        if cur_g:
                            groups_.append(cur_g)
                        cur_g = []
                    else:
                        cur_g.append(u)
                for g_ in groups_:
                    if len(g_) > 4:
                        continue                              # a filled block, not a tick
                    pos = round((g_[0] + g_[-1] + 1) / 2.0 * 2) / 2.0
                    if any(abs(q["c"] - pos) <= 2.0 and q["a"] <= lo_["c"] + 1.0 and q["b"] >= hi_["c"] - 1.0 for q in perp):
                        continue                              # already drawn
                    if any(abs(tk["c"] - pos) <= 2.0 and tk["o"] != o_ and abs(tk["a"] - lo_["c"]) < 1 and abs(tk["b"] - hi_["c"]) < 1 for tk in ticks):
                        continue
                    ext_ = [q for q in perp + ticks if q["o"] != o_ and abs(q["c"] - pos) <= 1.5
                            and (abs(q["a"] - hi_["c"]) <= 1.5 or abs(q["b"] - lo_["c"]) <= 1.5)]
                    if ext_:                                  # the tick continues an existing line: lengthen that line instead
                        ext_[0]["a"], ext_[0]["b"] = min(ext_[0]["a"], lo_["c"]), max(ext_[0]["b"], hi_["c"])
                        continue
                    ticks.append({"o": "h" if o_ == "v" else "v", "c": pos, "a": lo_["c"], "b": hi_["c"], "t": float(len(g_)), "tick": True})
    lines += ticks
    # dots sit on line crossings
    for d in dots:
        d["cx"], d["cy"] = snap_end(d["cx"], vx, 3.0), snap_end(d["cy"], hy, 3.0)

    diag += ridge_diags
    for p in diag:                                         # diagonal ends sit exactly on the line they spring from
        for e0, e1 in ((0, 1), (-1, -2)):
            (x_, y_), (xo, yo) = p[e0], p[e1]
            for l in lines:
                if l["o"] == "h" and abs(l["c"] - y_) <= 3.5 and l["a"] - 3 <= x_ <= l["b"] + 3 and abs(y_ - yo) > 1:
                    p[e0] = [x_ + (l["c"] - y_) * (x_ - xo) / (y_ - yo), l["c"]]; break
                if l["o"] == "v" and abs(l["c"] - x_) <= 3.5 and l["a"] - 3 <= y_ <= l["b"] + 3 and abs(x_ - xo) > 1:
                    p[e0] = [l["c"], y_ + (l["c"] - x_) * (y_ - yo) / (x_ - xo)]; break
    # true stroke width = integrated darkness across the line (thresholding fattens anti-aliased hairlines)
    # Measured in a narrow window (a parallel neighbour 3px away must not count) at several stations (crossings must
    # not count). Drawings use a few pen weights, so lines are clustered into at most two weight classes.
    gf = 255.0 - gray.astype(np.float32)
    def darkness(l):
        L_ = l["b"] - l["a"]
        lo, hi = int(math.floor(l["c"] - 2)), int(math.ceil(l["c"] + 2))
        ps = []
        for u in np.linspace(l["a"] + 0.25 * L_, l["b"] - 0.25 * L_, 9):
            u = int(min(max(u, 0), (W if l["o"] == "h" else H) - 1))
            strip = gf[max(0, lo):hi, u] if l["o"] == "h" else gf[u, max(0, lo):hi]
            ps.append(float(strip.sum()) / 255.0)
        return float(np.median(ps))
    for l in lines:
        l["_d"] = darkness(l) if l["b"] - l["a"] >= 12 and "dash" not in l else None
    if soft:
        # a line must be there: integrated darkness along it well below the others' means a phantom of the snapping / merging
        dd_ = [l["_d"] for l in lines if l["_d"] is not None]
        if len(dd_) >= 8:
            floor_ = 0.3 * float(np.median(dd_))
            for l in [l for l in lines if l["_d"] is not None and l["_d"] < floor_ and "tick" not in l]:
                _dbg("phantom line dropped", *((l["a"], l["c"], l["b"] - l["a"], 1) if l["o"] == "h" else (l["c"], l["a"], 1, l["b"] - l["a"])))
            lines = [l for l in lines if l["_d"] is None or l["_d"] >= floor_ or "tick" in l]
    ref = sorted(l["_d"] for l in lines if l["_d"] is not None and l["b"] - l["a"] >= 30 and 0.2 <= l["_d"] <= 3.0)
    classes = [float(np.median(ref))] if ref else [1.0]
    if len(ref) >= 12 and not soft:                        # (a blurred scan cannot tell pen weights apart: one weight, drawn sharp)
        best = None
        for i in range(5, len(ref) - 4):                   # 1-D two-class split with the smallest within-class spread
            a_, b_ = np.array(ref[:i]), np.array(ref[i:])
            cost = a_.var() * len(a_) + b_.var() * len(b_)
            if best is None or cost < best[0]:
                best = (cost, float(np.median(a_)), float(np.median(b_)))
        if best and best[2] >= 1.4 * best[1]:
            classes = [best[1], best[2]]
    classes = [max(0.35, round(c * 20) / 20) for c in classes]
    for l in lines:
        d_ = l.pop("_d")
        l["w"] = classes[0] if d_ is None else min(classes, key=lambda c: abs(c - d_))
    sw = classes[0]
    for f_ in fillets:
        f_["w"] = f_.pop("_l").get("w", sw)
    for l in lines:
        l.pop("_lock", None); l.pop("_c0", None)
    for a_ in arcs:                                         # door swings: same measurement, along the arc
        ang = np.radians(np.linspace(a_["start"] + 8, a_["start"] + a_["span"] - 8, 25)); ps = []
        for t_ in ang:
            rr = a_["r"] + np.arange(-2.0, 2.01, 0.5)
            px = np.clip((a_["cx"] + rr * math.cos(t_)).astype(int), 0, W - 1); py = np.clip((a_["cy"] + rr * math.sin(t_)).astype(int), 0, H - 1)
            ps.append(float(gf[py, px].sum()) * 0.5 / 255.0)
        a_["w"] = (max(0.35, round(float(np.median(ps)) * 20) / 20) if ps else sw) if not soft else sw
    # lettering: measure the real glyph ink, then give every label of a lettering size the SAME size. The OCR box is
    # only a search window (its height wanders by several px between labels of identical lettering).
    for t in texts + unread:
        t.pop("_comps", None)
    caps = []
    for t in texts:
        k_ = t.get("ink")
        if not k_:
            x, y, w, h = t["box"]; k_ = t["ink"] = [x, y, x + w, y + h]; t["ink_estimated"] = True
        caps.append((k_[2] - k_[0]) if t["vertical"] else (k_[3] - k_[1]))
    cmap = cluster_1d([float(c) for c in caps], 1.6)
    for t, c in zip(texts, caps):
        t["cap_px"] = cmap[float(c)]
    model.update({
        "stroke_px": sw, "stroke_classes": classes,
        "dot_r": round(float(np.median([d["r"] for d in dots])) * 2) / 2 if dots else 0,
        "walls": walls, "lines": lines, "arcs": arcs, "dots": dots,
        "fillets": fillets, "texts": texts, "unread_text": unread, "fixtures": fixtures, "fixture_solids": solids, "diagonals": diag, "doors": doors, "text_h": th, "grey_solids": greys})
    model["_gray"] = gray                                  # working-resolution grey, for checks against the pixels (not serialised)
    return model


def merge_collinear(lines):
    out = []
    for o in ("h", "v"):
        by_c = {}
        for l in lines:
            if l["o"] == o:
                by_c.setdefault(l["c"], []).append(l)
        for c, segs in by_c.items():
            segs.sort(key=lambda s: s["a"])
            # 1) join touching pieces
            joined = [dict(segs[0])]
            for s in segs[1:]:
                if s["a"] - joined[-1]["b"] <= 1.5:
                    joined[-1]["b"] = max(joined[-1]["b"], s["b"])
                else:
                    joined.append(dict(s))
            # 2) runs of short, evenly spaced pieces = one dashed line
            i = 0
            while i < len(joined):
                run = [joined[i]]
                while i + len(run) < len(joined):
                    nx = joined[i + len(run)]; pv = run[-1]
                    ln, lp = nx["b"] - nx["a"], pv["b"] - pv["a"]
                    gap = nx["a"] - pv["b"]
                    if lp < 40 and ln < 40 and 1.5 < gap < 3.5 * max(lp, ln):
                        run.append(nx)
                    else:
                        break
                even_ = len(run) == 3 and max(r["b"] - r["a"] for r in run) <= 1.35 * min(r["b"] - r["a"] for r in run) and \
                    max(run[j + 1]["a"] - run[j]["b"] for j in range(2)) <= 1.5 * min(run[j + 1]["a"] - run[j]["b"] for j in range(2))
                if len(run) >= 4 or (even_ and min(r["b"] - r["a"] for r in run) >= 8):
                    dash = float(np.median([r["b"] - r["a"] for r in run]))
                    gap = float(np.median([run[j + 1]["a"] - run[j]["b"] for j in range(len(run) - 1)]))
                    out.append({"o": o, "c": c, "a": run[0]["a"], "b": run[-1]["b"],
                                "t": run[0]["t"], "dash": [round(dash, 1), round(gap, 1)]})
                else:
                    out.extend(run)
                i += len(run)
    return out


def lev(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[-1]


_FONT_PATHS = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/Library/Fonts/Arial.ttf",
               "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "C:/Windows/Fonts/arial.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
_glyph_cache = {}


def _render_number(s):
    """Tight grey image of the string in a plain sans (black on white), 100 px tall or so."""
    if s in _glyph_cache:
        return _glyph_cache[s]
    img = None
    try:
        from PIL import Image, ImageDraw, ImageFont
        for fp in _FONT_PATHS:
            if os.path.exists(fp):
                fnt = ImageFont.truetype(fp, 120)
                l_, t_, r_, b_ = fnt.getbbox(s)
                im = Image.new("L", (r_ - l_ + 40, b_ - t_ + 40), 255)
                ImageDraw.Draw(im).text((20 - l_, 20 - t_), s, font=fnt, fill=0)
                img = np.array(im); break
    except Exception:
        img = None
    if img is None:                                        # no font file: OpenCV's built-in stroke font still tells 0 from 5
        img = np.full((160, 90 * len(s) + 40), 255, np.uint8)
        cv2.putText(img, s, (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 4.0, 0, 9, cv2.LINE_AA)
    ys, xs = np.where(img < 128)
    img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    _glyph_cache[s] = img
    return img


def _template_cap(s):
    """(k, top): a template whose ink stands taller than the capitals (brackets, a slash) is k times the cap height tall and
    its capitals start `top` (as a fraction of the cap height) below its upper edge.  (1.0, 0.0) for plain capitals / digits."""
    a0 = _render_number(s)
    if not re.search(r"[()\[\]{}|]", s):
        return 1.0, 0.0
    core = re.sub(r"[()\[\]{}|]", "", s).strip()
    if not core:
        return 1.0, 0.0
    ac = _render_number(core)
    k_ = a0.shape[0] / float(ac.shape[0])
    if k_ < 1.15:
        return 1.0, 0.0
    try:
        from PIL import ImageFont
        fp = next(fp for fp in _FONT_PATHS if os.path.exists(fp))
        fnt = ImageFont.truetype(fp, 120)
        top = (fnt.getbbox(core)[1] - fnt.getbbox(s)[1]) / float(ac.shape[0])
    except Exception:
        top = (k_ - 1.0) / 2.0
    return k_, max(0.0, top)


def render_score(gray, box, vertical, s, cap):
    """How well does the number `s`, drawn at lettering height `cap` and blurred like the scan, match the pixels around
    `box`?  (normalised correlation, best over small size changes and positions).  Blurred brochure digits that OCR cannot
    read still tell 3300 from 3250 this way, because geometry has already cut the choice down to two or three numbers."""
    x, y, w, h = [int(v) for v in box]
    if vertical:
        cx = x + w / 2.0; x0, x1 = int(cx - cap), int(cx + cap); y0, y1 = int(y - 1.2 * cap), int(y + h + 1.2 * cap)
    else:
        cy = y + h / 2.0; y0, y1 = int(cy - cap), int(cy + cap); x0, x1 = int(x - 1.2 * cap), int(x + w + 1.2 * cap)
    reg = gray[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
    if reg.size == 0:
        return -1.0
    if vertical:
        reg = cv2.rotate(reg, cv2.ROTATE_90_CLOCKWISE if vertical != "down" else cv2.ROTATE_90_COUNTERCLOCKWISE)
    reg = reg.astype(np.float32)
    a0 = _render_number(s); best = -1.0
    for hs in (0.92, 1.0, 1.08):
        for ws in (0.85, 0.95, 1.05):
            hh = int(round(cap * hs)); ww = int(round(a0.shape[1] * cap / a0.shape[0] * ws))
            if hh < 5 or ww < 5 or hh + 4 > reg.shape[0] or ww + 4 > reg.shape[1]:
                continue
            a = cv2.resize(a0, (ww, hh), interpolation=cv2.INTER_AREA).astype(np.float32)
            a = cv2.GaussianBlur(cv2.copyMakeBorder(a, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255), (0, 0), cap / 16.0)
            best = max(best, float(cv2.matchTemplate(reg, a, cv2.TM_CCOEFF_NORMED).max()))
    return best


def render_find(gray, region, vertical, s, cap, wfs=(0.85, 0.95, 1.05)):
    """Like render_score, but searches a region (x0, y0, x1, y1) and also says WHERE the number sits: (match, [x, y, w, h])."""
    H_, W_ = gray.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in region]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W_, x1), min(H_, y1)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return -1.0, None
    reg = gray[y0:y1, x0:x1]
    if vertical:
        reg = cv2.rotate(reg, cv2.ROTATE_90_COUNTERCLOCKWISE if vertical == "down" else cv2.ROTATE_90_CLOCKWISE)
    reg = reg.astype(np.float32)
    a0 = _render_number(s); best = (-1.0, None)
    kc_, top_ = _template_cap(s)                            # `cap` is the height of the CAPITALS, not of a bracket beside them
    for hs in (0.92, 1.0, 1.08):
        for ws in wfs:
            hh = int(round(cap * hs * kc_)); ww = int(round(a0.shape[1] * cap * kc_ / a0.shape[0] * ws))
            if hh < 5 or ww < 5 or hh + 4 > reg.shape[0] or ww + 4 > reg.shape[1]:
                continue
            a = cv2.resize(a0, (ww, hh), interpolation=cv2.INTER_AREA).astype(np.float32)
            a = cv2.GaussianBlur(cv2.copyMakeBorder(a, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255), (0, 0), cap / 16.0)
            res = cv2.matchTemplate(reg, a, cv2.TM_CCOEFF_NORMED)
            _mn, mx, _l, loc = cv2.minMaxLoc(res)
            if mx > best[0]:
                u0, v0 = loc[0] + 2, loc[1] + 2
                if vertical == "down":                      # rotated 90 deg counter-clockwise: rotated (u, v) -> original (Wr - 1 - v, u)
                    box = [x0 + (x1 - x0) - (v0 + hh), y0 + u0, hh, ww]
                elif vertical:                              # rotated 90 deg clockwise: rotated (u, v) -> original (v, Hr - 1 - u)
                    box = [x0 + v0, y0 + (y1 - y0) - (u0 + ww), hh, ww]
                else:
                    box = [x0 + u0, y0 + v0 + top_ * cap * hs, ww, hh / kc_]      # the box of the capitals
                best = (float(mx), [float(b_) for b_ in box])
    return best


def pixels_prefer_repair(img, box, vertical, read, fixed):
    """A vocabulary repair replaces what was READ by what was EXPECTED.  That is only right when the pixels agree: draw both
    strings at this plan's lettering width and compare them with the image (a longer string gets the same small allowance the
    number matcher uses, because a short string also matches inside a long one)."""
    x, y, w, h = box
    cap0 = float(w if vertical else h)
    reg = (x - 0.8 * cap0, y - 0.6 * cap0, x + w + 0.8 * cap0, y + h + 0.6 * cap0)
    wfs = tuple(round(0.5 + 0.05 * i, 2) for i in range(12))
    clean = lambda t: re.sub(r"[^A-Za-z0-9/.()'\- ]", "", t)
    sc = {}
    for key, t in (("read", clean(read)), ("fixed", clean(fixed))):
        sc[key] = max((render_find(img, reg, vertical, t, cap0 * k, wfs)[0] for k in (0.8, 0.9, 1.0)), default=-1.0) + 0.06 * sum(ch.isalnum() for ch in t) if t else -1.0
    return sc["fixed"] > sc["read"], sc                    # (the allowance counts letters and digits only: a full stop adds no ink to match)


TITLE_WORDS = {"area", "type", "unit", "units", "unit(s)", "sqm", "sqft", "sq.m", "sq.ft", "sq"}


def read_title_lines(m):
    """The title block beside a marketing plan ('TYPE B3b', 'Area : 71 sq.m', 'Unit(s) : #02-31 to #15-31') is set in mixed
    case, often in a pale colour, and the label reader (capitals only) rightly ignores it.  A line of the page reader that
    contains one of the title words is read again by itself, enlarged; it is kept when the reader is confident of the line."""
    gray = m.get("_gray")
    if gray is None:
        return
    ws = m.get("work_scale", 1)
    small = cv2.resize(gray, None, fx=1.0 / ws, fy=1.0 / ws, interpolation=cv2.INTER_AREA) if ws > 1 else gray
    d = pytesseract.image_to_data(small, config="--psm 11", output_type=pytesseract.Output.DICT)
    lines_ = {}
    for i, t in enumerate(d["text"]):
        if t.strip():
            lines_.setdefault((d["block_num"][i], d["par_num"][i], d["line_num"][i]), []).append(i)
    added = []
    for idx in lines_.values():
        if not any(re.sub(r"[^a-z().]", "", d["text"][i].lower()) in TITLE_WORDS for i in idx):
            continue
        y0 = min(d["top"][i] for i in idx); y1 = max(d["top"][i] + d["height"][i] for i in idx); h_ = y1 - y0
        if h_ < 6:
            continue
        # everything lettered on the same row belongs to the line (the page reader splits a title at its wide gaps)
        row = [i for i in range(len(d["text"])) if d["text"][i].strip() and abs((d["top"][i] + d["height"][i] / 2.0) - (y0 + y1) / 2.0) <= 0.35 * h_]
        x0 = min(d["left"][i] for i in row); x1 = max(d["left"][i] + d["width"][i] for i in row)
        pad = int(0.4 * h_)
        crop = small[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
        z = 48.0 / h_
        crop = cv2.copyMakeBorder(cv2.resize(crop, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC), 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        dd = pytesseract.image_to_data(crop, config="--psm 7", output_type=pytesseract.Output.DICT)
        wds = [(dd["text"][i].strip(), float(dd["conf"][i]), dd["left"][i], dd["width"][i]) for i in range(len(dd["text"])) if dd["text"][i].strip()]
        if os.environ.get("FV_LOG_TITLE"):
            print("TITLE", [(w_[0], w_[1]) for w_ in wds])
        wds = [w_ for w_ in wds if w_[1] >= 75 and re.fullmatch(r"[A-Za-z0-9#().:/,\-]+", w_[0])]      # word by word: what the reader is sure of
        if len(wds) < 2 or not any(re.sub(r"[^a-z().]", "", w_[0].lower()) in TITLE_WORDS for w_ in wds):
            continue
        box = [float(x0 * ws), float(y0 * ws), float((x1 - x0) * ws), float(h_ * ws)]
        if any(min(o["box"][0] + o["box"][2], box[0] + box[2]) - max(o["box"][0], box[0]) > 0 and min(o["box"][1] + o["box"][3], box[1] + box[3]) - max(o["box"][1], box[1]) > 0.5 * box[3]
               for o in m["texts"]):
            m["texts"] = [o for o in m["texts"] if not (min(o["box"][0] + o["box"][2], box[0] + box[2]) - max(o["box"][0], box[0]) > 0 and
                                                       min(o["box"][1] + o["box"][3], box[1] + box[3]) - max(o["box"][1], box[1]) > 0.5 * box[3])]
        s_ = " ".join(w_[0] for w_ in wds)
        m["texts"].append({"s": s_, "box": box, "vertical": False, "conf": round(float(np.mean([w_[1] for w_ in wds])), 1), "title": True})
        m["unread_text"] = [u for u in m.get("unread_text", []) if not (min(u["box"][0] + u["box"][2], box[0] + box[2]) - max(u["box"][0], box[0]) > 0 and
                                                                        min(u["box"][1] + u["box"][3], box[1] + box[3]) - max(u["box"][1], box[1]) > 0)]
        added.append(s_)
    if added:
        m.setdefault("dimension_report_pre", {})["title_lines"] = added


NUMBERED_LABELS = {"BEDROOM", "BATH", "BATHROOM", "WC", "W.C.", "STORE", "BALCONY", "STUDY"}


def number_after_label(m):
    """'BEDROOM 3', 'BATH 2': the room number stands a word space after the label and the page reader often drops it.  It is
    looked for exactly there, by drawing the digits 1-6 at the label's own lettering size; a digit is only taken when the
    place is inked, it matches clearly, and clearly better than the next best digit."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    added = []
    for t in m["texts"]:
        if t.get("angle") is not None or t["s"] not in NUMBERED_LABELS:
            continue
        x, y, w, h = t["box"]; v = t["vertical"]; cap = float(w if v else h)
        if not (8 <= cap <= 80):
            continue
        if not v:
            region = (x + w + 0.15 * cap, y - 0.3 * cap, x + w + 1.6 * cap, y + h + 0.3 * cap)
        elif v == "up":                                      # reads bottom-to-top: the number stands ABOVE the word
            region = (x - 0.3 * cap, y - 1.6 * cap, x + w + 0.3 * cap, y - 0.15 * cap)
        else:
            region = (x - 0.3 * cap, y + h + 0.15 * cap, x + w + 0.3 * cap, y + h + 1.6 * cap)
        x0, y0, x1, y1 = [int(round(q)) for q in region]
        reg = gray[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
        if reg.size == 0 or float((reg < 150).mean()) < 0.04:
            continue                                        # nothing is lettered there
        if any(o is not t and min(o["box"][0] + o["box"][2], x1) - max(o["box"][0], x0) > 0 and min(o["box"][1] + o["box"][3], y1) - max(o["box"][1], y0) > 0 for o in m["texts"]):
            continue
        sc = {dg: render_find(gray, region, v, dg, cap, (0.7, 0.85, 1.0)) for dg in "123456"}
        rank = sorted(sc, key=lambda dg: -sc[dg][0])
        if sc[rank[0]][0] >= 0.72 and sc[rank[0]][0] - sc[rank[1]][0] >= 0.05 and sc[rank[0]][1] is not None:
            bx, by, bw, bh = sc[rank[0]][1]
            # a digit is as tall as the lettering and stands alone: a stroke that runs on past the lettering band is a line of the
            # drawing (every vertical line looks like a '1'), and ink right beside it means it is part of something else
            xi0, yi0, xi1, yi1 = int(bx), int(by), int(bx + bw) + 1, int(by + bh) + 1
            ext = int(0.6 * cap)
            grown = gray[max(0, yi0 - ext):yi1 + ext, max(0, xi0 - ext):xi1 + ext] < 150
            inner = np.zeros_like(grown); inner[min(ext, yi0):min(ext, yi0) + (yi1 - yi0), min(ext, xi0):min(ext, xi0) + (xi1 - xi0)] = True
            n_, lab_, st_, _c = cv2.connectedComponentsWithStats((grown * 255).astype(np.uint8))
            touching = {int(v_) for v_ in np.unique(lab_[inner & grown]) if v_ > 0}
            if any(st_[i_, 3] > 1.35 * max(bh, bw if v else bh) + 2 or st_[i_, 2] > 1.35 * max(bw, bh) + 2 for i_ in touching):
                continue
            nx0, ny0 = min(x, bx), min(y, by); nx1, ny1 = max(x + w, bx + bw), max(y + h, by + bh)
            t["s"] = t["s"] + " " + rank[0]; t["box"] = [nx0, ny0, nx1 - nx0, ny1 - ny0]; t["number_found"] = round(sc[rank[0]][0], 2)
            if t.get("ink"):
                t["ink"] = [nx0, ny0, nx1, ny1]
            added.append(t["s"])
    if added:
        m.setdefault("dimension_report_pre", {})["numbers_after_labels"] = added


def sanity_texts(m):
    """Strings no drawing contains: lettering a fraction of the plan's own lettering height (a tick pair read as '14', a rack
    bar read as '7'), and one- or two-letter 'words' outside the plan vocabulary.  They go to the review list, not the drawing."""
    caps = [float(t["box"][2] if t["vertical"] else t["box"][3]) for t in m["texts"] if t.get("angle") is None and len(t["s"].replace(" ", "")) >= 3]
    if len(caps) < 5:
        return
    cap = float(np.median(caps)); keep, dropped = [], []
    for t in m["texts"]:
        if t.get("angle") is not None or t.get("voted") or t.get("completed_from"):
            keep.append(t); continue
        c_ = float(t["box"][2] if t["vertical"] else t["box"][3]); s_ = t["s"].replace(" ", "")
        tiny = c_ < 0.55 * cap
        stray = s_.isalpha() and len(s_) <= 2 and s_ not in PLAN_VOCAB and s_ not in SMALL_WORDS
        toks_ = t["s"].split()
        # plan lettering is capitals: a token with lower-case letters, or a short token outside the vocabulary inside a longer
        # string, is linework read as letters (mixed-case title blocks are read by read_title_lines and flagged 'title')
        garbled = not t.get("title") and any(any(ch.islower() for ch in k_) or (k_.isalpha() and len(k_) <= 2 and k_ not in PLAN_VOCAB and k_ not in SMALL_WORDS)
                                              for k_ in toks_)
        if tiny or stray or garbled:
            dropped.append(t["s"]); continue
        keep.append(t)
    if dropped:
        m["texts"] = keep
        m.setdefault("dimension_report_pre", {})["strings_rejected"] = dropped


def vote_verify_numbers(m):
    """Every dimension number that was read is read again from a tight crop of its own pixels, twelve ways (three sizes, plain /
    thickened strokes, two single-word modes).  A clear majority (>= 60 %) that differs from the first read replaces it: thin CAD
    lettering turns a 3 into a 5 or a 9 for the page reader once, but not twelve times over.  Nothing is invented - the result
    is always a reading of the pixels."""
    gray = m.get("_gray")
    if gray is None:
        return
    changed = []
    for t in m["texts"]:
        s_ = t["s"].replace(" ", "")
        if t.get("angle") is not None or not re.fullmatch(r"[0-9/.,'\-]{3,6}", s_) or not any(ch.isdigit() for ch in s_):
            continue
        x, y, w, h = [int(round(v)) for v in t["box"]]
        cap = float(w if t["vertical"] else h)
        if cap < 6:
            continue
        pad = max(3, int(0.25 * cap))
        crop = gray[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
        if crop.size == 0:
            continue
        if t["vertical"]:
            crop = cv2.rotate(crop, cv2.ROTATE_90_COUNTERCLOCKWISE if t["vertical"] == "down" else cv2.ROTATE_90_CLOCKWISE)
        votes = []
        for target in (50.0, 75.0, 100.0):                  # (measured on three CAD renders: single-word modes at >= 50 px read 40-42 of 46 numbers, line mode 13-36)
            z = target / cap
            u = cv2.resize(crop, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC if z > 1 else cv2.INTER_AREA)
            for v in (u, cv2.erode(u, np.ones((3, 3), np.uint8))):
                v = cv2.copyMakeBorder(v, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
                for psm in (8, 13):
                    votes.append(pytesseract.image_to_string(v, config="--psm %d -c tessedit_char_whitelist=0123456789" % psm).strip())
        cnt = {}
        for v_ in votes:
            if v_:
                cnt[v_] = cnt.get(v_, 0) + 1
        if not cnt:
            continue
        top, n_top = max(cnt.items(), key=lambda kv: kv[1])
        if top != s_ and len(top) < len(s_) and (s_.endswith(top) or s_.startswith(top)) and t.get("conf", 0) >= 60:
            continue                                        # the first read WITH one more digit at an end: the tight crop clipped it
        t["vote"] = [top, n_top, len(votes)]
        if os.environ.get("FV_LOG_VOTE"):
            print("VERIFY", t["s"], "conf", t.get("conf"), sorted(cnt.items(), key=lambda kv: -kv[1])[:3])
    # (the votes are only RECORDED here; solve_dimensions decides whether this drawing's numbers are better read this way)


def apply_votes(m):
    changed = []
    for t in m["texts"]:
        if not t.get("vote"):
            continue
        top, n_top, n_all = t["vote"]; s_ = t["s"].replace(" ", "")
        if n_top >= 0.8 * n_all and len(top) >= 3:
            t["vote_strong"] = True
        if n_top >= 0.6 * n_all and len(top) >= 3 and top != s_:
            changed.append({"from": t["s"], "to": top, "votes": "%d/%d" % (n_top, n_all)})
            t["first_read"], t["s"], t["voted"] = t["s"], top, True
        elif n_top >= 0.6 * n_all and top == s_:
            t["voted"] = True                               # read twice over: geometry may not rewrite it without the pixels' consent
    if changed:
        m.setdefault("dimension_report_pre", {})["numbers_corrected_by_vote"] = changed


def solve_dimensions(m):
    """Which reader suits this drawing's lettering is not known in advance: the page reader is right on brochure lettering
    where the word-by-word vote drops a leading digit; the vote is right on thin CAD lettering where the page reader turns 3
    into 5.  Both are tried, and the drawing decides: the variant in which more written numbers agree with the measured
    lengths (untouched by any repair) is kept.  A tie keeps the first reads."""
    import copy
    def variant(use_votes):
        m2 = copy.deepcopy({k: v for k, v in m.items() if k not in ("_gray", "_unrect")})
        for k in ("_gray", "_unrect"):
            if k in m:
                m2[k] = m[k]
        if use_votes:
            apply_votes(m2)
        vote_read_numbers(m2)
        check_dimensions(m2)
        its = m2.get("_dim_items") or []
        good = sum(1 for it in its if it.get("clean"))      # numbers that agree with their measured length exactly as read
        rewritten = sum(1 for t in m2["texts"] if t.get("corrected_from"))      # numbers geometry had to rewrite: not read at all
        return (good, -rewritten), m2
    ga, A = variant(False)
    if not any(t.get("vote") and t["vote"][0] != t["s"].replace(" ", "") and t["vote"][1] >= 0.6 * t["vote"][2] for t in m["texts"]):
        best, which = A, "first reads (the vote agrees)"
    else:
        gb, B = variant(True)
        best, which = (B, "vote") if gb > ga else (A, "first reads")
        best.setdefault("dimension_report", {})["reader_chosen"] = {"chosen": which, "agreeing_first_reads": ga[0], "agreeing_vote": gb[0],
                                                                      "rewritten_first_reads": -ga[1], "rewritten_vote": -gb[1]}
    m.clear(); m.update(best)


SMALL_WORDS = {"RAMP", "UP", "DOWN", "DN", "DB", "RC", "DUCT", "VOID"}     # small print beside the linework (room labels have their own stages)


def vote_read_numbers(m):
    """Soft / low-resolution inputs, before the dimensions are checked.  A dimension number the reader missed (7 px tall, or
    standing on its line) is usually still readable from a TIGHT crop of just its glyphs: it is read many times over - at
    several enlargements, plain / sharpened / binarised, two page modes - and accepted only when the readings agree.  Nothing
    is guessed: a number enters the drawing only as the majority reading of its own pixels."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    caps = [(t["box"][2] if t["vertical"] else t["box"][3]) for t in m["texts"] if t["s"].isdigit() and len(t["s"]) >= 3 and t.get("angle") is None]
    if len(caps) < 3:
        return
    cap = float(np.median(caps)); T = m["wall_thickness_px"]; H, W = gray.shape
    thr = m.get("ink_threshold", 180)
    ink = ((gray < thr) * 255).astype(np.uint8)
    L_ = int(max(2.2 * cap, 1.2 * T))
    long_ = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, L_), np.uint8)) | cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((L_, 1), np.uint8))
    rest = ink & ~long_
    for w_ in m["walls"]:
        if not w_.get("hole"):
            cv2.fillPoly(rest, [np.rint(np.array(w_["pts"])).astype(np.int32)], 0)
    taken = [t["box"] for t in m["texts"] if t.get("angle") is None]
    for bx, by, bw, bh in taken:
        rest[max(0, int(by) - 2):int(by + bh) + 3, max(0, int(bx) - 2):int(bx + bw) + 3] = 0
    n, lab, st, _c = cv2.connectedComponentsWithStats(rest)
    added, pending, lettering = [], [], []
    def read_votes(crop):
        votes = []
        for z in (2, 3, 4):
            u = cv2.resize(crop, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC)
            for prep in range(3):
                v = u
                if prep == 1:
                    v = cv2.addWeighted(u, 1.8, cv2.GaussianBlur(u, (0, 0), z * 0.6), -0.8, 0)
                elif prep == 2:
                    _t, v = cv2.threshold(u, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                v = cv2.copyMakeBorder(v, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
                for psm in (7, 8):
                    votes.append(pytesseract.image_to_string(v, config="--psm %d -c tessedit_char_whitelist=0123456789" % psm).strip())
                if prep == 0 and z == 2 and not any(len(v_) >= 2 for v_ in votes):
                    return votes                            # nothing like a number here: no need to ask seventeen more times
        return votes
    for vertical in (False, "up"):
        gl = []
        for i in range(1, n):
            x, y, w, h, a_ = [int(v) for v in st[i]]
            size, other = (w, h) if vertical else (h, w)
            if 0.7 * cap <= size <= 1.4 * cap and 0.12 * cap <= other <= 3.5 * cap and a_ >= 6:
                gl.append((x, y, w, h))
        gl.sort(key=lambda g_: g_[1] if vertical else g_[0])
        used = [False] * len(gl)
        for i, g_ in enumerate(gl):
            if used[i]:
                continue
            grp = [g_]; used[i] = True
            for j in range(i + 1, len(gl)):
                if used[j]:
                    continue
                q, p_ = gl[j], grp[-1]
                if vertical:
                    ok = abs((q[0] + q[2] / 2.0) - (p_[0] + p_[2] / 2.0)) <= 0.3 * cap and -2 <= q[1] - (p_[1] + p_[3]) <= 0.7 * cap
                else:
                    ok = abs((q[1] + q[3] / 2.0) - (p_[1] + p_[3] / 2.0)) <= 0.3 * cap and -2 <= q[0] - (p_[0] + p_[2]) <= 0.7 * cap
                if ok:
                    grp.append(q); used[j] = True
            x0 = min(q[0] for q in grp); y0 = min(q[1] for q in grp); x1 = max(q[0] + q[2] for q in grp); y1 = max(q[1] + q[3] for q in grp)
            run = (y1 - y0) if vertical else (x1 - x0)
            if not (0.9 * cap <= run <= 5.0 * cap) or (run < 1.3 * cap and len(grp) < 2):
                continue
            crop = gray[max(0, y0 - 3):y1 + 3, max(0, x0 - 3):x1 + 3]
            if vertical:
                crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
            votes = read_votes(crop)
            if len(votes) < 18:
                # not a number.  A word of the plan vocabulary, lettered too small for the page reader ('RAMP', 'UP')?
                wv = []
                for z in (2, 3, 4):
                    u = cv2.resize(crop, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC)
                    for prep in range(3):
                        v = u if prep == 0 else cv2.addWeighted(u, 1.8, cv2.GaussianBlur(u, (0, 0), z * 0.6), -0.8, 0) if prep == 1 else \
                            cv2.threshold(u, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
                        v = cv2.copyMakeBorder(v, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
                        wv.append(re.sub(r"[^A-Z/.\-]", "", pytesseract.image_to_string(v, config="--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ/.-").strip()))
                    if z == 2 and not any(w_ in SMALL_WORDS for w_ in wv):
                        break
                cw = {}
                for w_ in wv:
                    cw[w_] = cw.get(w_, 0) + 1
                topw = max(cw.items(), key=lambda kv: kv[1])
                if os.environ.get("FV_LOG_VOTE"):
                    print("VOTE word", "vertical" if vertical else "horizontal", [x0, y0, x1 - x0, y1 - y0], sorted(cw.items(), key=lambda kv: -kv[1])[:4])
                if len(wv) == 9 and topw[0] in SMALL_WORDS and topw[1] >= 5:
                    m["texts"].append({"s": topw[0], "box": [float(x0), float(y0), float(x1 - x0), float(y1 - y0)], "vertical": vertical,
                                       "conf": round(100.0 * topw[1] / len(wv), 1), "voted": True})
                    added.append(topw[0])
                elif len(grp) >= 3 and len(wv) == 9 and sum(1 for w_ in wv if len(w_) >= 2) >= 5:
                    lettering.append(([float(x0), float(y0), float(x1 - x0), float(y1 - y0)], vertical, topw[0]))
                continue
            cnt = {}
            for v_ in votes:
                cnt[v_] = cnt.get(v_, 0) + 1
            rank = sorted(cnt.items(), key=lambda kv: -kv[1])
            rank = [kv for kv in rank if kv[0]] or [("", 0)]        # (an empty reading is no reading; it still counts in the total)
            top, n_top = rank[0]
            if os.environ.get("FV_LOG_VOTE"):
                print("VOTE", "vertical" if vertical else "horizontal", [x0, y0, x1 - x0, y1 - y0], rank[:4])
            box = [float(x0), float(y0), float(x1 - x0), float(y1 - y0)]
            rival = max([c_ for v_, c_ in rank[1:] if v_.isdigit() and len(v_) >= 3] or [0])
            agreed = top.isdigit() and 3 <= len(top) <= 5 and 300 <= int(top) <= 30000 and \
                ((n_top >= 0.5 * len(votes) and rival <= 0.5 * n_top) or (n_top >= 0.35 * len(votes) and 3 * rival <= n_top))
            if not agreed and len(grp) >= 3:
                lettering.append((box, vertical, top))
            if not agreed:
                # the readings differ ('4570' nine times, '1570' five): the drawing itself says which one was written - the
                # length of the dimension the number stands on, at the scale the numbers already read give
                pending.append((box, vertical, [(v_, c_) for v_, c_ in rank if v_.isdigit() and 3 <= len(v_) <= 5 and c_ >= 3], len(votes)))
                continue
            m["texts"].append({"s": top, "box": box, "vertical": vertical, "conf": round(100.0 * n_top / len(votes), 1), "voted": True})
            m["unread_text"] = [u_ for u_ in m.get("unread_text", []) if not (min(u_["box"][0] + u_["box"][2], x1) - max(u_["box"][0], x0) > 0 and
                                                                             min(u_["box"][1] + u_["box"][3], y1) - max(u_["box"][1], y0) > 0)]
            added.append(top)
    # --- readings that did not agree, settled by the length they stand on
    def segment_px(box, vertical):
        bx, by, bw, bh = box
        mid = (by + bh / 2.0) if vertical else (bx + bw / 2.0)
        best = None
        for l in m["lines"]:
            if "dash" in l or l["o"] != ("v" if vertical else "h") or (l["b"] - l["a"]) < 2.0 * cap or not (l["a"] <= mid <= l["b"]):
                continue
            d_ = (l["c"] - (bx + bw)) if vertical else (l["c"] - (by + bh))       # the line runs under the feet of the number
            if -0.5 * cap <= d_ <= 1.3 * cap and (best is None or abs(d_) < best[0]):
                best = (abs(d_), l)
        if best is None:
            return None
        l = best[1]
        stops = {round(l["a"], 1), round(l["b"], 1)}
        for q in m["lines"]:
            if q["o"] != l["o"] and "dash" not in q and l["a"] - 3 <= q["c"] <= l["b"] + 3 and q["a"] - 3 <= l["c"] <= q["b"] + 3:
                stops.add(round(q["c"], 1))
        for d in m["dots"]:
            if abs((d["cx"] if vertical else d["cy"]) - l["c"]) <= 3:
                stops.add(round(d["cy"] if vertical else d["cx"], 1))
        st_ = sorted(stops); st2 = [st_[0]]
        for v_ in st_[1:]:
            if v_ - st2[-1] > 0.5 * cap:
                st2.append(v_)
        for a_, b_ in zip(st2, st2[1:]):
            if a_ <= mid <= b_:
                return b_ - a_
        return None
    if pending:
        ratios = []
        for t in m["texts"]:
            if t["s"].isdigit() and len(t["s"]) >= 3 and t.get("angle") is None and (t.get("conf", 0) >= 60 or t.get("voted")):
                px_ = segment_px(t["box"], t["vertical"])
                if px_ and px_ > 2 * cap:
                    ratios.append(int(t["s"]) / px_)
        if len(ratios) >= 4:
            sc0 = float(np.median(ratios))
            if float(np.mean([abs(r_ / sc0 - 1.0) <= 0.03 for r_ in ratios])) >= 0.6:       # the scale is only trusted if the read numbers agree on it
                for box, vertical, cands, nv in pending:
                    px_ = segment_px(box, vertical)
                    if not px_:
                        continue
                    fit = [(v_, c_) for v_, c_ in cands if abs(int(v_) / (px_ * sc0) - 1.0) <= 0.03]
                    if os.environ.get("FV_LOG_VOTE"):
                        print("VOTE by length", [round(b_) for b_ in box], cands, "measured", round(px_ * sc0), "->", fit)
                    if not fit and cands:
                        # one digit off the length it stands on ('1350' read where 9358 mm is measured): the number one edit
                        # away that fits - if the pixels prefer it to what was read
                        v0 = cands[0][0]; mm_ = px_ * sc0
                        near = [v_ for v_ in range(int(mm_ * 0.985 // 5) * 5, int(mm_ * 1.015) + 5, 5) if abs(v_ / mm_ - 1.0) <= 0.015 and lev(str(v_), v0) == 1
                                and len(str(v_)) == len(v0)]
                        near = [v_ for v_ in near if v_ % 50 == 0] or near
                        if len(near) == 1:
                            ok_, sc_ = pixels_prefer_repair(gray, box, vertical, v0, str(near[0]))
                            if os.environ.get("FV_LOG_VOTE"):
                                print("VOTE one digit off", v0, "->", near[0], sc_, "KEPT" if ok_ else "REJECTED")
                            if ok_:
                                fit = [(str(near[0]), cands[0][1])]
                    if len(fit) == 1:
                        m["texts"].append({"s": fit[0][0], "box": box, "vertical": vertical, "conf": round(100.0 * fit[0][1] / nv, 1), "voted": True,
                                           "confirmed_by_length_mm": round(px_ * sc0)})
                        x0, y0, x1, y1 = box[0], box[1], box[0] + box[2], box[1] + box[3]
                        m["unread_text"] = [u_ for u_ in m.get("unread_text", []) if not (min(u_["box"][0] + u_["box"][2], x1) - max(u_["box"][0], x0) > 0 and
                                                                                         min(u_["box"][1] + u_["box"][3], y1) - max(u_["box"][1], y0) > 0)]
                        added.append(fit[0][0])
    # lettering that stayed unread is still lettering: it goes to the review list, never into the linework as crumbs
    for box, vertical, read_ in lettering:
        x0, y0, x1, y1 = box[0], box[1], box[0] + box[2], box[1] + box[3]
        def hit(o_):
            return min(o_["box"][0] + o_["box"][2], x1) - max(o_["box"][0], x0) > 0 and min(o_["box"][1] + o_["box"][3], y1) - max(o_["box"][1], y0) > 0
        if not any(hit(o_) for o_ in m["texts"] + m.get("unread_text", [])):
            m.setdefault("unread_text", []).append({"box": box, "vertical": vertical, "read": read_, "conf": 0.0, "digits": read_ if read_.isdigit() else "", "from_vote": True})
    if added:
        m.setdefault("dimension_report", {})["numbers_read_by_vote"] = added


def find_swings(gray, rmin=25, rmax=None):
    """Scale-free search for door swings: quarter circles with a drawn leaf and an empty sweep.  [(cx, cy, r, quadrant, score)]"""
    H, W = gray.shape
    rmax = rmax or int(0.22 * max(H, W))
    ink = gray < 200
    fat = cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    inkd = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    circles = cv2.HoughCircles(cv2.GaussianBlur(gray, (0, 0), 1.2), cv2.HOUGH_GRADIENT, dp=1.5, minDist=6, param1=120, param2=18, minRadius=rmin, maxRadius=rmax)
    if circles is None:
        return []
    tq = np.radians(np.linspace(5, 85, 40))
    def quad_cov(mask, cx, cy, r):
        cov = []
        for q in range(4):
            xs = np.rint(cx + r * np.cos(tq + q * np.pi / 2)).astype(int); ys = np.rint(cy + r * np.sin(tq + q * np.pi / 2)).astype(int)
            ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
            cov.append(float((mask[np.clip(ys, 0, H - 1), np.clip(xs, 0, W - 1)] & ok).mean()))
        return cov
    out = []
    for cx, cy, r in circles[0][:3000]:
        c0 = quad_cov(fat, cx, cy, r)
        if max(c0) < 0.85 or sorted(c0)[-2] > 0.6:
            continue
        best = None
        for jx in (-2, 0, 2):
            for jy in (-2, 0, 2):
                for dr in (-2, 0, 2):
                    cov = quad_cov(inkd, cx + jx, cy + jy, r + dr)
                    q = int(np.argmax(cov)); oth = sorted(cov)[-2]
                    if cov[q] >= 0.92 and oth <= 0.45 and (best is None or cov[q] - oth > best[0]):
                        best = (cov[q] - oth, cx + jx, cy + jy, r + dr, q)
        if best is None:
            continue
        sc_, x0, y0, r0, q = best
        leaf = []
        for ang in (q * 90, q * 90 + 90):
            t = np.linspace(0.2, 0.95, 30)
            xs = np.clip(np.rint(x0 + r0 * t * math.cos(math.radians(ang))).astype(int), 0, W - 1); ys = np.clip(np.rint(y0 + r0 * t * math.sin(math.radians(ang))).astype(int), 0, H - 1)
            leaf.append(float(inkd[ys, xs].mean()))
        if max(leaf) < 0.85:
            continue
        t = np.linspace(0.3, 0.8, 8); a_ = np.radians(np.linspace(q * 90 + 20, q * 90 + 70, 8))
        xs = np.clip(np.rint(x0 + r0 * np.outer(t, np.cos(a_))).astype(int), 0, W - 1); ys = np.clip(np.rint(y0 + r0 * np.outer(t, np.sin(a_))).astype(int), 0, H - 1)
        if float(ink[ys, xs].mean()) > 0.25:
            continue                                        # a rug, a round table: the sweep of a door is empty floor
        out.append((float(x0), float(y0), float(r0), q, round(sc_, 2)))
    out.sort(key=lambda o: -o[4]); keep = []
    for o in out:
        if not any(math.hypot(o[0] - k[0], o[1] - k[1]) < 0.3 * o[2] and abs(o[2] - k[2]) < 0.2 * o[2] for k in keep):
            keep.append(o)
    return keep


DOOR_LEAF_MM = 850.0         # a room door: 800-900 mm leaf.  Used ONLY to estimate a scale for a plan that writes no dimensions


def scale_from_bar(m):
    """A page with a graphic scale bar and no written dimensions is scaled by the bar: an exact scale, not an estimate.
    The bar's labelled stops also go into dim_spans, so the app can check them against the drawing like any dimension.
    Where written dimensions exist they win; the bar is only recorded beside them."""
    bar = m.get("scale_bar")
    if not bar:
        return
    ws = float(m.get("work_scale", 1) or 1); ox, oy = m.get("crop_offset", [0, 0])
    to_work = lambda x, y: ((x - ox) * ws, (y - oy) * ws)
    per_work = bar["mm_per_px"] / ws
    if m.get("mm_per_px"):
        m["dimension_report"] = dict(m.get("dimension_report") or {}, scale_bar_mm_per_px=round(per_work, 4), scale_bar_agrees=abs(per_work / m["mm_per_px"] - 1) <= 0.03)
        return
    m["mm_per_px"] = round(per_work, 4)
    m["scale_source"] = {"estimated": False, "from": "scale bar", "unit": bar["unit"], "labels": len(bar["labels"])}
    labels = sorted(bar["labels"])                                # [value, page x]
    per = 304.8 if bar["unit"] == "ft" else 1000.0
    y_w = to_work(0, bar["y"])[1]
    items = []
    pairs = [(labels[i], labels[i + 1]) for i in range(len(labels) - 1)]
    if len(labels) > 2:
        pairs.append((labels[0], labels[-1]))
    for (v0, x0), (v1, x1) in pairs:
        mm = int(round((v1 - v0) * per))
        if mm <= 0:
            continue
        p_, q_ = to_work(x0, 0)[0], to_work(x1, 0)[0]
        items.append({"axis": "x", "p": float(min(p_, q_)), "q": float(max(p_, q_)), "mm": mm, "lc": float(y_w),
                      "s": "%g%s" % (v1, bar["unit"]), "tc": [float((p_ + q_) / 2.0), float(y_w - 3 * ws)], "conf": 0.9, "vote_strong": True, "clean": True,
                      "from": "scale bar"})
    m["_dim_items"] = (m.get("_dim_items") or []) + items


def estimate_scale(m):
    """A plan without written dimensions has no scale, and every clean-up stage that thinks in millimetres is skipped.  The one
    object of known size that nearly every plan draws is a door: the largest group of like-sized swings is taken as 850 mm
    leaves.  The result is an ESTIMATE (+-10 %), flagged as such: the page stays in pixels and no dimension is ever written
    from it; it only tells the clean-up stages how big a crumb, a window or a fixture is."""
    if m.get("mm_per_px") or m.get("_gray") is None:
        return
    # quarter circles the swing vote accepted (each has a drawn leaf and ends on something built); small-leaf / sash figures excluded
    rs = [a["r"] for a in m["arcs"] if abs(a.get("span", 0) - 90) < 1 and a.get("from") is None]
    src = "traced swings"
    if not rs:
        g_ = m["_gray"]; ws_ = m.get("work_scale", 1)
        small = cv2.resize(g_, None, fx=1.0 / ws_, fy=1.0 / ws_, interpolation=cv2.INTER_AREA) if ws_ > 1 else g_
        rs = [r_ * ws_ for _x, _y, r_, _q, _s in find_swings(small)]; src = "swing search"
    if not rs:
        return
    rs = sorted(rs)
    groups = [[r_ for r_ in rs if 0.88 * c_ <= r_ <= 1.14 * c_] for c_ in rs]
    # room doors are the LARGEST swings of a plan that come in numbers (shower screens, sashes and cupboard doors are smaller)
    multi = [g_ for g_ in groups if len(g_) >= 2]
    grp = max(multi, key=lambda g_: float(np.median(g_))) if multi else [rs[-1]]
    r_med = float(np.median(grp))
    ys_, xs_ = np.where(m["_gray"] < 128)
    if len(xs_):
        extent_m = max(xs_.max() - xs_.min(), ys_.max() - ys_.min()) * (DOOR_LEAF_MM / r_med) / 1000.0
        if not (4.0 <= extent_m <= 32.0):
            return                                          # a home is not 2 m or 80 m across: these were not room doors
    m["mm_per_px"] = DOOR_LEAF_MM / r_med
    m["scale_source"] = {"estimated": True, "from": src, "swings": len(grp), "leaf_px": round(r_med, 1), "assumed_leaf_mm": DOOR_LEAF_MM}
    m.setdefault("dimension_report", {}).setdefault("labels_tied_to_geometry", 0)
    m["dimension_report"]["scale_estimated"] = m["scale_source"]


def check_dimensions(m):
    """Tie every dimension label to the two dots it spans, derive mm/px, and let geometry repair OCR."""
    th = m["text_h"]; dots = m["dots"]
    if m.get("soft_input"):
        # on soft inputs the first lettering mode can be a noise size: the dimension lettering itself is the better ruler
        hs_ = [(t["box"][2] if t["vertical"] else t["box"][3]) for t in m["texts"] if sum(ch.isdigit() for ch in t["s"]) >= 3]
        if len(hs_) >= 3:
            th = max(th, float(np.median(hs_))); m["dim_text_h"] = th
    def rows(key, other):
        g = {}
        for d in dots:
            g.setdefault(round(d[key]), []).append(d[other])
        return {k: sorted(v) for k, v in g.items()}
    hrows, vcols = rows("cy", "cx"), rows("cx", "cy")
    Tw = m["wall_thickness_px"]
    gray = m.get("_gray") if m.get("soft_input") else None
    _stops_cache = {}; _bare_ends = {}
    _boxes = [t_["box"] for t_ in m["texts"]] + [u_["box"] for u_ in m.get("unread_text", [])]
    blobmap = None
    if gray is not None:
        # diagonal ink run through every pixel (the shorter of the two 45-degree runs): ~1.4x the stroke on a bare line or a
        # plain crossing, about twice that through a dimension dot
        B_ = gray < m.get("ink_threshold", 128)
        def diag_runs(Bm):
            Hh, Ww = Bm.shape
            f_ = np.zeros((Hh, Ww), np.int16); b_ = np.zeros((Hh, Ww), np.int16)
            f_[0] = Bm[0]
            for y_ in range(1, Hh):
                f_[y_, 1:] = (f_[y_ - 1, :-1] + 1) * Bm[y_, 1:]; f_[y_, 0] = Bm[y_, 0]
            b_[Hh - 1] = Bm[Hh - 1]
            for y_ in range(Hh - 2, -1, -1):
                b_[y_, :-1] = (b_[y_ + 1, 1:] + 1) * Bm[y_, :-1]; b_[y_, -1] = Bm[y_, -1]
            return np.minimum(f_ + b_ - 1, 60) * Bm
        Bi = B_.astype(np.int16)
        blobraw = np.minimum(diag_runs(Bi), diag_runs(Bi[:, ::-1])[:, ::-1]).astype(np.uint8)
        blobmap = cv2.dilate(blobraw, np.ones((7, 7), np.uint8)).astype(np.int16)   # best within +-3 px
        blob_h = cv2.dilate(blobraw, np.ones((7, 1), np.uint8)).astype(np.int16)    # for horizontal lines: best across the line only
        blob_v = cv2.dilate(blobraw, np.ones((1, 7), np.uint8)).astype(np.int16)
    def line_stops(l):
        """Where a dimension line is cut: its own ends, wall faces it runs into, and the lines that cross it."""
        key_ = (l["o"], l["c"], l["a"], l["b"])
        if key_ in _stops_cache:
            return _stops_cache[key_]
        o_dim = l["o"]
        cand = [(round(l["a"], 1), 0.0), (round(l["b"], 1), 0.0)]          # (position, weight)
        for w_ in m["walls"]:                               # a dimension that runs into a wall ends on one of that wall's faces
            P = w_["pts"]
            for i_ in range(len(P)):
                p1, p2 = P[i_], P[(i_ + 1) % len(P)]
                if o_dim == "h" and p1[0] == p2[0] and min(p1[1], p2[1]) - 3 <= l["c"] <= max(p1[1], p2[1]) + 3 and l["a"] - 1.5 * Tw <= p1[0] <= l["b"] + 1.5 * Tw:
                    cand.append((round(p1[0], 1), 1.0))
                if o_dim == "v" and p1[1] == p2[1] and min(p1[0], p2[0]) - 3 <= l["c"] <= max(p1[0], p2[0]) + 3 and l["a"] - 1.5 * Tw <= p1[1] <= l["b"] + 1.5 * Tw:
                    cand.append((round(p1[1], 1), 1.0))
        for q in m["lines"]:
            # a real extension line / tick runs THROUGH the dimension line or is long; a glyph stroke of a label sitting on
            # the line only touches it from one side and is no taller than the lettering
            if q["o"] != o_dim and "dash" not in q and l["a"] - 1 <= q["c"] <= l["b"] + 1 and q["a"] - 3 <= l["c"] <= q["b"] + 3:
                through = (q["a"] <= l["c"] - 3 and q["b"] >= l["c"] + 3) or q["b"] - q["a"] >= 1.5 * th
                if not through and m.get("soft_input") and q["b"] - q["a"] >= 0.4 * th:
                    # a short tick that ends ON the line is a stop too, unless it is a stroke of some lettering
                    qx0, qy0, qx1, qy1 = (q["a"], q["c"], q["b"], q["c"]) if q["o"] == "h" else (q["c"], q["a"], q["c"], q["b"])
                    through = not any(bx - 3 <= qx0 and qx1 <= bx + bw + 3 and by - 3 <= qy0 and qy1 <= by + bh + 3
                                      for bx, by, bw, bh in _boxes)
                if through:
                    cand.append((round(q["c"], 1), 2.0 + (q["b"] - q["a"])))
        if blobmap is not None and l["b"] - l["a"] >= 4 * th:
            # dimension dots seen directly: lettering or a grey band can hide the extension line, the dot on the line stays
            ii = np.arange(int(l["a"]), int(l["b"]) + 1); cc = int(round(l["c"]))
            prof = (blob_h[min(cc, blobmap.shape[0] - 1), np.clip(ii, 0, blobmap.shape[1] - 1)] if o_dim == "h"
                    else blob_v[np.clip(ii, 0, blobmap.shape[0] - 1), min(cc, blobmap.shape[1] - 1)]).astype(float)
            base_ = float(np.median(prof[prof > 0])) if (prof > 0).any() else 0.0
            need_ = 1.5 * base_ + 1.0
            if base_ > 0:
                hot = (prof >= need_) & (prof <= 3.2 * need_)
                j_ = 0
                while j_ < len(ii):
                    if hot[j_]:
                        e_ = j_
                        while e_ + 1 < len(ii) and hot[e_ + 1]:
                            e_ += 1
                        if e_ - j_ + 1 <= 3.5 * need_:       # a dot, not a run of fat ink
                            wts_ = prof[j_:e_ + 1] - need_ + 1.0
                            pos_ = float((ii[j_:e_ + 1] * wts_).sum() / wts_.sum()) + 0.5
                            # the feet of a number standing on its dimension line are fat ink on the line as well: not dots
                            in_txt = False
                            for t_ in m["texts"] + m.get("unread_text", []):
                                bx_, by_, bw_, bh_ = t_["box"]
                                a0_, a1_, c0_, c1_ = (bx_, bx_ + bw_, by_, by_ + bh_) if o_dim == "h" else (by_, by_ + bh_, bx_, bx_ + bw_)
                                if a0_ - 2 <= pos_ <= a1_ + 2 and c0_ - 6 <= l["c"] <= c1_ + 6:
                                    in_txt = True; break
                            if not in_txt:
                                cand.append((round(pos_, 1), 1000.0))
                        j_ = e_ + 1
                    else:
                        j_ += 1
        if m.get("soft_input"):
            # a blurred tick blob next to its extension line gives two crossings a few px apart: keep the longer line's
            cand.sort(); kept = []
            for pos_, wt_ in cand:
                if kept and pos_ - kept[-1][0] <= 0.5 * Tw and max(wt_, kept[-1][1]) >= 1000.0:
                    # a dot and the extension line through it are one stop: the line gives the finer position
                    a_, b_ = sorted([(pos_, wt_), kept[-1]], key=lambda e_: e_[1])
                    kept[-1] = (a_[0] if a_[1] >= 1.5 * th + 2.0 else b_[0], 1000.0 + a_[1])
                elif kept and pos_ - kept[-1][0] <= 0.3 * Tw and min(wt_, kept[-1][1]) < 1.5 * th + 2.0:
                    if wt_ > kept[-1][1]:
                        kept[-1] = (pos_, wt_)
                else:
                    kept.append((pos_, wt_))
            cand = kept
        out = sorted({p_ for p_, _w in cand})
        _bare_ends[tuple(out)] = {p_ for p_, w_ in cand if w_ == 0.0} - {p_ for p_, w_ in cand if w_ > 0.0}
        _stops_cache[key_] = out
        return out
    items = []
    for t in m["texts"]:
        if sum(ch.isdigit() for ch in t["s"]) < 2 or not (3 <= len(t["s"].replace(" ", "")) <= 5):
            continue
        x, y, w, h = t["box"]
        if t["vertical"]:
            c, edge, table = y + h / 2, x + w, vcols
        else:
            c, edge, table = x + w / 2, y + h, hrows
        best = None
        for pos, stops in table.items():
            if not (-0.3 * th <= pos - edge <= 1.2 * th):
                continue
            for p, q in zip(stops, stops[1:]):
                if p < c < q and (best is None or abs(pos - edge) < best[0]):
                    best = (abs(pos - edge), q - p, pos, p, q)
        if best is None:
            # no dots on this drawing (or none here): the dimension line is the line the label sits on, and it is cut into
            # dimensions by the extension lines that CROSS it (its own two ends count as well)
            o_dim = "v" if t["vertical"] else "h"
            for l in m["lines"]:
                if l["o"] != o_dim or "dash" in l or not (-0.3 * th <= l["c"] - edge <= 1.2 * th) or not (l["a"] < c < l["b"]):
                    continue
                Tw = m["wall_thickness_px"]
                stops = line_stops(l)
                # crossings closer together than a label is wide are double lines (wall faces), keep the outer one each side
                half_ = 0.4 * (h if t["vertical"] else w)
                left_ = [p for p in stops if p <= c - half_]; right_ = [q for q in stops if q >= c + half_]
                if left_ and right_ and (best is None or -(l["b"] - l["a"]) < best[0]):
                    p, q = left_[-1], right_[0]
                    best = (-(l["b"] - l["a"]), q - p, round(l["c"]), p, q,
                            [x_ for x_ in left_ if p - x_ <= 1.3 * Tw], [x_ for x_ in right_ if x_ - q <= 1.3 * Tw], stops, l["c"])
            if best:
                t["dim_by"] = "crossings"
        if best:
            items.append({"t": t, "px": best[1], "line": best[2], "p": best[3], "q": best[4]})
            if len(best) > 5:
                items[-1]["p_alts"], items[-1]["q_alts"], items[-1]["stops"], items[-1]["lc"] = best[5], best[6], best[7], best[8]
    good = [it["t"]["s"] for it in items if it["t"]["s"].isdigit()]
    if len(good) < 3:
        return
    scale = float(np.median([int(it["t"]["s"]) / it["px"] for it in items if it["t"]["s"].isdigit()]))
    if any("stops" in it for it in items):
        # crossing-terminated drawings: reads are fewer and worse, and the nearest stops are not always the right ones, so
        # the scale is the value that the MOST labels agree with, each label being free to use any pair of stops around it
        def spans_(it):
            x, y, w, h = it["t"]["box"]; c_ = (y + h / 2) if it["t"]["vertical"] else (x + w / 2)
            st_ = it.get("stops") or [it["p"], it["q"]]
            return [q_ - p_ for p_ in st_ if p_ < c_ for q_ in st_ if q_ > c_ and q_ - p_ > 4]
        cand_items = [(int(it["t"]["s"]), spans_(it)) for it in items if it["t"]["s"].isdigit() and int(it["t"]["s"]) >= 300]
        hyps = [v_ / sp for v_, sps in cand_items for sp in sps]
        if hyps:
            votes = lambda s_: sum(1 for v_, sps in cand_items if any(abs(v_ / sp / s_ - 1) < 0.012 for sp in sps))
            # second witness, independent of the OCR: at the true scale the segments BETWEEN stops come out as round numbers
            seen_l, segs_ = set(), []
            for it in items:
                if "stops" in it and (bool(it["t"]["vertical"]), round(it["lc"])) not in seen_l:
                    seen_l.add((bool(it["t"]["vertical"]), round(it["lc"])))
                    segs_ += [b_ - a_ for a_, b_ in zip(it["stops"], it["stops"][1:]) if b_ - a_ >= 40]
            roundness = lambda s_: sum(1 for sp in segs_ if abs(sp * s_ - round(sp * s_ / 50.0) * 50) <= max(1.2 * s_, 0.006 * sp * s_))
            best_s = max(hyps, key=lambda s_: (2 * votes(s_) + roundness(s_), votes(s_)))
            if votes(best_s) >= 3 or (votes(best_s) >= 2 and roundness(best_s) >= 0.6 * max(1, len(segs_))):
                agree_ = [v_ / sp for v_, sps in cand_items for sp in sps if abs(v_ / sp / best_s - 1) < 0.012]
                scale = float(np.mean(agree_))
    if os.environ.get("FV_LOG_DIMS"):
        print("DIMS scale", round(scale, 3))
        for it in items:
            print("DIMS item", it["t"]["s"], "conf", it["t"].get("conf"), "vertical", it["t"]["vertical"], "line c", round(it.get("lc", -1)), "p", round(it["p"]), "q", round(it["q"]), "px", round(it["px"]),
                  "mm/px", round(int(it["t"]["s"]) / it["px"], 2) if it["t"]["s"].isdigit() and it["px"] else None, "stops", [round(v_) for v_ in it.get("stops", [])])
    # refine with labels that already agree
    # a crossing-terminated dimension may end on either face of a wall / either of two close lines: with the scale roughly
    # known, take the pair of stops that the written number itself agrees with best
    for it in items:
        if "stops" in it and it["t"]["s"].isdigit():
            val = int(it["t"]["s"]); t_ = it["t"]
            x, y, w, h = t_["box"]; c_ = (y + h / 2) if t_["vertical"] else (x + w / 2); half_ = 0.4 * (h if t_["vertical"] else w)
            want = val / scale
            pairs = [(p_, q_) for p_ in it["stops"] if p_ <= c_ - half_ and c_ - p_ <= 1.3 * want
                     for q_ in it["stops"] if q_ >= c_ + half_ and q_ - c_ <= 1.3 * want]
            if pairs:
                p, q = min(pairs, key=lambda pq: abs((pq[1] - pq[0]) * scale - val))
                # only a pair the written number really agrees with may replace the nearest stops (a misread must not pick its own span)
                if abs((q - p) * scale - val) <= max(15, 0.012 * val, 2.5 * scale):
                    it["p"], it["q"], it["px"] = p, q, q - p
    agree = [int(it["t"]["s"]) / it["px"] for it in items if it["t"]["s"].isdigit()
             and abs(int(it["t"]["s"]) / it["px"] / scale - 1) < 0.015]
    if agree:
        scale = float(np.mean(agree))
    fixed = []
    _rs_cache = {}
    cap = th
    if gray is not None:
        # lettering height for the drawn comparisons: the one at which labels that were read best match their own pixels
        ref_ = [it["t"] for it in items if it["t"]["s"].isdigit() and len(it["t"]["s"]) >= 3 and it["t"].get("conf", 0) >= 60
                and abs(int(it["t"]["s"]) / it["px"] / scale - 1) < 0.03][:8]
        if ref_:
            cap = max((th * k_ for k_ in (0.62, 0.7, 0.78, 0.86, 0.94, 1.02, 1.1)),
                      key=lambda c_: sum(render_score(gray, t_["box"], t_["vertical"], t_["s"], c_) for t_ in ref_))
        else:
            cap = 0.86 * th
        m["dim_cap_px"] = round(float(cap), 1)
    def render_pick(t_, stops_, reads_):
        """Soft inputs: choose the number for a label from (a) the spans between the stops around it and (b) how the candidate
        numbers, drawn and blurred, match the label's pixels.  Returns (value, p, q, match) or None when the pixels say nothing."""
        if gray is None:
            return None
        x_, y_, w_, h_ = t_["box"]; vert_ = t_["vertical"]
        c_ = (y_ + h_ / 2.0) if vert_ else (x_ + w_ / 2.0); half_ = 0.3 * (h_ if vert_ else w_)
        L_ = [p_ for p_ in stops_ if p_ <= c_ - half_][-3:][::-1]; R_ = [q_ for q_ in stops_ if q_ >= c_ + half_][:3]
        opts_ = {}; bare_ = _bare_ends.get(tuple(stops_), set()); fits_ = set()
        for i_, p_ in enumerate(L_):
            for j_, q_ in enumerate(R_):
                e_ = (q_ - p_) * scale; tl_ = max(20, 0.015 * e_, 2.5 * scale)
                if p_ in bare_ or q_ in bare_:
                    tl_ *= 2.0                              # a bare line end is a poor stop (lines overshoot)
                for v_ in range(int((e_ - max(2.5 * tl_, 0.06 * e_)) // 50) * 50, int(e_ + max(2.5 * tl_, 0.07 * e_)) + 50, 50):
                    if v_ >= 100 and abs(v_ - e_) <= max(1.8 * tl_, 50) or (v_ >= 100 and str(v_) in reads_ and abs(v_ - e_) <= max(2.5 * tl_, 0.06 * v_)):
                        if abs(v_ - e_) <= 2.5 * tl_ and i_ + j_ == 0 or abs(v_ - e_) <= tl_:
                            fits_.add(v_)                   # (a stop can be a few px out; between the NEAREST stops a confident read may differ more)
                        # skipping a stop costs; skipping the twin of a double line (two wall faces) costs little
                        skip_ = sum(0.3 if abs(o_ - p_) <= 0.8 * th else 1.5 for o_ in L_[:i_]) + \
                                sum(0.3 if abs(o_ - q_) <= 0.8 * th else 1.5 for o_ in R_[:j_])
                        g_ = abs(v_ - e_) / tl_ + skip_
                        if v_ not in opts_ or g_ < opts_[v_][0]:
                            opts_[v_] = (g_, p_, q_)
        if not opts_:
            return None
        def rs_(v_):
            k_ = (x_, y_, w_, h_, v_)
            if k_ not in _rs_cache:
                _rs_cache[k_] = render_score(gray, t_["box"], vert_, str(v_), cap)
            return _rs_cache[k_]
        if str(t_.get("s", "")).isdigit() and t_.get("conf", 0) >= 90 and int(t_["s"]) % 50 == 0 and int(t_["s"]) in opts_ and int(t_["s"]) not in fits_:
            v = int(t_["s"])
            e0_ = (R_[0] - L_[0]) * scale if L_ and R_ else 0
            if rs_(v) >= 0.75 and rs_(v) >= max(rs_(v_) for v_ in opts_) - 0.02 and abs(v - e0_) <= 0.06 * v:
                # read with high confidence AND the best picture of all candidates: the number stands; a stop is off (hidden in a wall)
                t_["stop_mismatch_mm"] = round(v - e0_)
                return v, L_[0], R_[0], rs_(v)
        if str(t_.get("s", "")).isdigit() and t_.get("conf", 0) >= 80 and int(t_["s"]) in fits_ and int(t_["s"]) % 50 == 0 and rs_(int(t_["s"])) >= 0.5:
            v = int(t_["s"])                                # read with confidence, round, and a span between two stops agrees: that is the dimension
            return v, opts_[v][1], opts_[v][2], rs_(v)
        r_max = max(rs_(v_) for v_ in opts_)
        lev_w = 1.0 if (t_.get("conf", 0) >= 60 or t_.get("voted")) and str(t_.get("s", "")).isdigit() and len(t_["s"]) >= 3 else 0.25   # a confident read counts
        if r_max < 0.45:
            return None
        cost = lambda v_: opts_[v_][0] + 10.0 * (r_max - rs_(v_)) + lev_w * min([lev(str(v_), r_) for r_ in reads_ if r_] or [2])
        v = min(opts_, key=cost)
        if DEBUG: print("PICK", [round(b_) for b_ in t_["box"]], t_.get("s", t_.get("read")), reads_, "bare", bare_, [(v_, round(opts_[v_][0], 2), round(rs_(v_), 2), round(cost(v_), 2)) for v_ in sorted(opts_)], "->", v)
        if rs_(v) < 0.55 and min([lev(str(v), r_) for r_ in reads_ if r_] or [9]) > 1:
            return None                                     # nothing like it was read, and the pixels are lukewarm: leave it
        if opts_[v][0] > 1.2 and (rs_(v) < 0.6 or opts_[v][1] in bare_ or opts_[v][2] in bare_):
            return None                                     # a poor fit to the geometry needs a clear picture
        return v, opts_[v][1], opts_[v][2], rs_(v)
    for it in items:
        t = it["t"]; exp = it["px"] * scale
        if "stops" in it and gray is not None:
            pk_ = render_pick(t, it["stops"], [t["s"].replace(" ", "")] + ([t["alt"].replace(" ", "")] if t.get("alt") else []))
            if pk_ and str(pk_[0]) != t["s"] and t["s"].isdigit() and len(t["s"]) >= 3 and (t.get("conf", 0) >= 60 or t.get("voted")):
                # geometry wants another number than the one that was READ.  As for words: only if the pixels prefer it.  Else the
                # read stands and it is the stops that are in doubt (kept out of scale and rectification).
                ok_fix, sc_fix = pixels_prefer_repair(gray, t["box"], t["vertical"], t["s"], str(pk_[0]))
                if t.get("vote_strong"):
                    ok_fix = False                          # read the same way ten times out of twelve: it is the STOPS that are in doubt, not the number
                if os.environ.get("FV_LOG_REPAIR"):
                    print("REPAIR number", t["s"], "->", pk_[0], sc_fix, "KEPT" if ok_fix else "REJECTED")
                if not ok_fix:
                    it["mm"] = int(t["s"]); t["stop_mismatch_mm"] = round(int(t["s"]) - it["px"] * scale)
                    continue
            if pk_:
                v, it["p"], it["q"], r_ = pk_; it["px"] = it["q"] - it["p"]; it["mm"] = v; t["pixel_match"] = round(r_, 2)
                if str(v) != t["s"]:
                    fixed.append({"from": t["s"], "to": str(v), "measured_mm": round(it["px"] * scale)})
                    t["corrected_from"], t["s"], it["repaired"] = t["s"], str(v), True
                continue
        slack = 2.5 * scale if "p_alts" in it else 0.0     # crossings on a soft image are only good to a couple of pixels
        if "stops" in it and t["s"].isdigit() and int(t["s"]) % 50 == 0 and int(t["s"]) >= 300:
            val_ = int(t["s"]); x, y, w, h = t["box"]; c_ = (y + h / 2) if t["vertical"] else (x + w / 2)
            fits = [(abs((q_ - p_) * scale - val_), p_, q_) for p_ in it["stops"] if p_ < c_ for q_ in it["stops"] if q_ > c_]
            if fits and min(fits)[0] <= max(0.02 * val_, slack):
                _f, it["p"], it["q"] = min(fits); it["px"] = it["q"] - it["p"]
                it["mm"] = val_; t["loose_fit"] = True; continue
        if t["s"].isdigit() and abs(int(t["s"]) - exp) <= max(15, 0.012 * exp, slack):
            it["mm"] = int(t["s"]); continue
        lo, hi = exp - max(20, 0.015 * exp), exp + max(20, 0.015 * exp)
        cands = [v for v in range(int(lo // 5) * 5, int(hi) + 5, 5) if lo <= v <= hi]
        reads = [t["s"].replace(" ", "")] + ([t["alt"].replace(" ", "")] if t.get("alt") else [])
        tol_ = max(20, 0.015 * exp, slack)
        def cost_(v):                                       # edit distance, roundness of the number (drawn dims are round), fit
            rnd = 0.0 if v % 50 == 0 else 0.3 if v % 25 == 0 else 0.5 if v % 10 == 0 else 0.8
            return min(lev(str(v), r) for r in reads) + rnd + abs(v - exp) / tol_
        v = min(cands, key=cost_)
        lv_ = min(lev(str(v), r) for r in reads)
        same_ends = any((len(r) == len(str(v)) and r[:1] == str(v)[:1] and r[-1:] == str(v)[-1:]) or
                        (len(r) >= 3 and (str(v).startswith(r) or str(v).endswith(r))) for r in reads)   # or a clipped read
        if lv_ > 1 and not (lv_ == 2 and v % 50 == 0 and same_ends and abs(v - exp) <= 0.6 * tol_):   # too far from what was read: a geometry miss, not OCR
            t["unverified"] = True; it["mm"] = int(t["s"]) if t["s"].isdigit() else None
            continue
        if str(v) == t["s"]:
            it["mm"] = v; continue
        one7 = len(str(v)) == len(t["s"]) and all(a_ == b_ or {a_, b_} == {"1", "7"} for a_, b_ in zip(str(v), t["s"]))
        if t.get("vote_strong") and t["s"].isdigit() and not one7:       # (crisp inputs have no pixel gate here: the unanimous vote is the gate;
            # single-stroke CAD lettering draws 1 and 7 alike, so between those two the measured length decides)
            it["mm"] = int(t["s"]); t["stop_mismatch_mm"] = round(int(t["s"]) - exp)
            continue
        if gray is not None and (m.get("soft_input") or t.get("voted")) and t["s"].isdigit() and len(t["s"]) >= 3 and (t.get("conf", 0) >= 60 or t.get("voted")):
            ok_fix, sc_fix = pixels_prefer_repair(gray, t["box"], t["vertical"], t["s"], str(v))     # as for words: the pixels must prefer it
            if t.get("vote_strong"):
                ok_fix = False
            if os.environ.get("FV_LOG_REPAIR"):
                print("REPAIR number(2)", t["s"], "->", v, sc_fix, "KEPT" if ok_fix else "REJECTED")
            if not ok_fix:
                it["mm"] = int(t["s"]); t["stop_mismatch_mm"] = round(int(t["s"]) - exp)
                continue
        fixed.append({"from": t["s"], "to": str(v), "measured_mm": round(exp)})
        t["corrected_from"], t["s"], it["mm"], it["repaired"] = t["s"], str(v), v, True
    # two text fragments tied to the same segment are one label read in pieces: keep the one that is a number, absorb the other
    seen_seg = {}
    for it in list(items):
        key = (bool(it["t"]["vertical"]), it["line"], round(it["p"]), round(it["q"]))
        if key in seen_seg:
            a_, b_ = seen_seg[key], it
            good_ = lambda i_: (i_.get("mm") is not None) + (not i_["t"].get("unverified", False))
            win, lose = (a_, b_) if good_(a_) >= good_(b_) else (b_, a_)
            wx, wy, ww, wh = win["t"]["box"]; lx, ly, lw, lh = lose["t"]["box"]
            gap_ = max(lx - (wx + ww), wx - (lx + lw), ly - (wy + wh), wy - (ly + lh))
            if gap_ <= 1.5 * th:
                x0_, y0_ = min(wx, lx), min(wy, ly); x1_, y1_ = max(wx + ww, lx + lw), max(wy + wh, ly + lh)
                if win["t"]["vertical"]:
                    win["t"]["box"] = [wx, y0_, ww, y1_ - y0_]
                else:
                    win["t"]["box"] = [x0_, wy, x1_ - x0_, wh]
                win["t"].pop("ink", None)
                if lose["t"] in m["texts"]:
                    m["texts"].remove(lose["t"])
                items.remove(lose); seen_seg[key] = win
        else:
            seen_seg[key] = it
    # Dimensions the OCR could not read at all are still KNOWN: the stops along a dimension line and the scale give their
    # length, and drawn dimensions are round numbers. Where some lettering sits over such a segment, write the number in.
    inferred = []
    taken = {id(it["t"]) for it in items}
    crossing_mode = any("stops" in it for it in items)
    tied_lines = {(bool(it["t"]["vertical"]), round(it.get("lc", -1))) for it in items if "lc" in it}
    if crossing_mode:
        pool = [("t", t_) for t_ in m["texts"] if id(t_) not in taken and sum(ch.isdigit() for ch in t_["s"]) >= 2] + \
               [("u", u_) for u_ in m.get("unread_text", [])]
        for kind, t_ in pool:
            vertical = bool(t_["vertical"])
            x, y, w, h = t_["box"]
            c_, edge_ = (y + h / 2, x + w) if vertical else (x + w / 2, y + h)
            best = None
            for l in m["lines"]:
                if l["o"] != ("v" if vertical else "h") or "dash" in l or l["b"] - l["a"] < 3 * th:
                    continue
                if not (-0.3 * th <= l["c"] - edge_ <= 1.2 * th) or not (l["a"] < c_ < l["b"]):
                    continue
                if best is None or l["b"] - l["a"] > best["b"] - best["a"]:
                    best = l
            if best is None:
                continue
            stops = line_stops(best)
            half_ = 0.3 * (h if vertical else w)
            left_ = [p for p in stops if p <= c_ - half_]; right_ = [q for q in stops if q >= c_ + half_]
            if not left_ or not right_:
                continue
            p, q = left_[-1], right_[0]
            if any(bool(it["t"]["vertical"]) == vertical and ((abs(it.get("lc", -9) - best["c"]) < 2 and p < it["q"] and it["p"] < q) or
                                                              (abs(it["p"] - p) < 3 and abs(it["q"] - q) < 3)) for it in items):
                continue                                    # that segment / that very span already has its dimension
            if any(bool(it["t"]["vertical"]) == vertical and it.get("mm") is not None and abs(it.get("lc", -9e9) - best["c"]) <= 4 * th and
                   min(q, it["q"]) - max(p, it["p"]) >= 0.8 * (q - p) and abs(it["mm"] - (q - p) * scale) <= 40 for it in items):
                continue                                    # a ghost of a label that is already tied on the neighbouring line
            reads = [r_ for r_ in (re.sub(r"\D", "", t_.get("s", "") or ""), t_.get("digits", ""), re.sub(r"\D", "", t_.get("read", "") or "")) if r_]
            pk_ = render_pick(t_, stops, reads)
            if pk_ and not any(bool(it["t"]["vertical"]) == vertical and abs(it.get("lc", -9) - best["c"]) < 2 and pk_[1] < it["q"] and it["p"] < pk_[2] for it in items):
                v, p, q, r_ = pk_
                old = t_.get("s", t_.get("read", ""))
                if kind == "u":
                    m["unread_text"].remove(t_)
                    t_ = {"s": str(v), "box": t_["box"], "vertical": t_["vertical"], "conf": 0.0}
                    m["texts"].append(t_)
                t_["corrected_from"], t_["s"], t_["inferred_from_geometry"], t_["pixel_match"] = old, str(v), True, round(r_, 2)
                t_.pop("unverified", None)
                items.append({"t": t_, "px": q - p, "line": round(best["c"]), "p": p, "q": q, "mm": v, "repaired": True, "stops": stops, "lc": best["c"]})
                taken.add(id(t_)); tied_lines.add((vertical, round(best["c"])))
                inferred.append({"was": old, "to": str(v), "measured_mm": round((q - p) * scale)})
                continue
            if gray is not None:
                continue                                    # with the pixels at hand, no number is written in that they do not support
            exp = (q - p) * scale
            tol_ = max(20, 0.015 * exp, 2.5 * scale)
            opts = sorted({int(round(exp / st_) * st_) for st_ in (50, 25, 10)}, key=lambda v_: (v_ % 50 != 0, abs(v_ - exp)))
            opts = [v_ for v_ in opts if abs(v_ - exp) <= tol_ * (1.0 if v_ % 50 == 0 else 0.5) and v_ >= 100]
            if not opts:
                continue
            reads = [r_ for r_ in (re.sub(r"\D", "", t_.get("s", "") or ""), t_.get("digits", ""), re.sub(r"\D", "", t_.get("read", "") or "")) if r_]
            def in_band(o_):
                ox, oy, ow, oh = o_["box"]
                ce, ee = (oy + oh / 2, ox + ow) if vertical else (ox + ow / 2, oy + oh)
                return bool(o_["vertical"]) == vertical and -0.3 * th <= best["c"] - ee <= 1.2 * th and best["a"] < ce < best["b"]
            crowd = sum(1 for _k, o_ in pool if in_band(o_)) + sum(1 for it in items if abs(it.get("lc", -9) - best["c"]) < 2)
            on_known_line = (vertical, round(best["c"])) in tied_lines or crowd >= 3
            v = None
            for v_ in opts:
                lv_ = min([lev(str(v_), r_) for r_ in reads] or [9])
                clean_read = kind == "t" and t_["s"].isdigit() and len(t_["s"]) >= 3
                if lv_ <= 1 or (not clean_read and ((lv_ <= 2 and (on_known_line or len(str(v_)) >= 4)) or on_known_line)):
                    v = v_; break
            if v is None:
                continue
            old = t_.get("s", t_.get("read", ""))
            if kind == "u":
                m["unread_text"].remove(t_)
                t_ = {"s": str(v), "box": t_["box"], "vertical": t_["vertical"], "conf": 0.0}
                m["texts"].append(t_)
            t_["corrected_from"], t_["s"], t_["inferred_from_geometry"] = old, str(v), True
            t_.pop("unverified", None)
            items.append({"t": t_, "px": q - p, "line": round(best["c"]), "p": p, "q": q, "mm": v, "repaired": True, "stops": stops, "lc": best["c"]})
            taken.add(id(t_)); tied_lines.add((vertical, round(best["c"])))
            inferred.append({"was": old, "to": str(v), "measured_mm": round(exp)})
    # Geometry first (soft inputs): a dimension line is cut into segments by its stops, and EVERY segment carries a number.
    # Where no lettering cluster survived (glyphs fused with linework, broken into pieces), look for the number itself:
    # draw the two or three values the segment length allows and search for them beside the line.
    # The sweep below proposes ROUND numbers (multiples of 50) for a segment.  That is how most plans are dimensioned - but not
    # all (3425, 1880 ...).  Whether this plan is, its own confident reads tell; where it is not, inventing round numbers is wrong.
    sure_ = [int(it["t"]["s"]) for it in items if it["t"]["s"].isdigit() and len(it["t"]["s"]) >= 3 and it["t"].get("conf", 0) >= 90 and not it.get("repaired")]
    round_plan = len(sure_) < 4 or sum(1 for v_ in sure_ if v_ % 50 == 0) >= 0.9 * len(sure_)
    m["_round_plan"] = bool(round_plan)
    if crossing_mode and gray is not None and round_plan:
        dim_lines = {}
        for it in items:
            if "lc" in it:
                tb = it["t"]["box"]; vert_ = bool(it["t"]["vertical"])
                off_ = ((tb[0] + tb[2] / 2.0) if vert_ else (tb[1] + tb[3] / 2.0)) - it["lc"]
                dim_lines.setdefault((vert_, round(it["lc"])), []).append(off_)
        lines_todo = []
        for l in m["lines"]:
            if "dash" in l or l["b"] - l["a"] < 6 * th:
                continue
            vert_ = l["o"] == "v"
            if (vert_, round(l["c"])) in dim_lines:
                lines_todo.append((l, float(np.median(dim_lines[(vert_, round(l["c"]))])), "up" if vert_ else False))
                continue
            # an overall-total line: parallel to a known dimension line, a few lettering heights away, covering it
            for (v2, c2), offs in list(dim_lines.items()):
                if v2 != vert_ or not (1.5 * th <= abs(l["c"] - c2) <= 9 * th):
                    continue
                sib = [it for it in items if bool(it["t"]["vertical"]) == vert_ and round(it.get("lc", -9e9)) == c2]
                lo_, hi_ = min(i_["p"] for i_ in sib), max(i_["q"] for i_ in sib)
                if l["a"] <= lo_ + 0.1 * (hi_ - lo_) and l["b"] >= hi_ - 0.1 * (hi_ - lo_):
                    lines_todo.append((l, float(np.median(offs)), "up" if vert_ else False)); break
        found_ = 0
        lines_todo.sort(key=lambda e_: (bool(e_[0]["o"] == "v"), round(e_[0]["c"])) not in dim_lines)   # part chains first, totals after
        if DEBUG: print("dimension lines to sweep", [(l_["o"], l_["c"], round(o_, 1)) for l_, o_, _v in lines_todo])
        for l, off_, vflag in lines_todo:
            vert_ = l["o"] == "v"
            stops = line_stops(l)
            mine = [it for it in items if bool(it["t"]["vertical"]) == vert_ and abs(it.get("lc", -9e9) - l["c"]) < 2]
            groups = []                                     # stops closer than a label is tall are one place (double lines)
            for s_ in stops:
                if groups and s_ - groups[-1][-1] < 0.8 * cap:
                    groups[-1].append(s_)
                else:
                    groups.append([s_])
            ends_ = _bare_ends.get(tuple(stops), set())
            pairs_ = [(groups[gi_], groups[gi_ + 1]) for gi_ in range(len(groups) - 1)]
            for gi_ in range(len(groups) - 2):              # afterwards: a piece too short to carry a number - the dimension runs on to the next stop
                if groups[gi_ + 1][-1] - groups[gi_][0] < 1.2 * cap and not (set(groups[gi_]) <= ends_ or set(groups[gi_ + 2]) <= ends_):
                    pairs_.append((groups[gi_], groups[gi_ + 2]))
            for G1, G2 in pairs_:
                if G2[-1] - G1[0] < 1.2 * cap or any(G1[-1] < it["q"] - 2 and it["p"] + 2 < G2[0] for it in mine):
                    continue
                mid = (G1[0] + G2[-1]) / 2.0; half_along = max(0.45 * (G2[-1] - G1[0]), 2.4 * th)
                lo_p, hi_p = sorted((l["c"] + np.sign(off_) * 0.15 * th, l["c"] + np.sign(off_) * (abs(off_) + 1.1 * th)))
                region = (lo_p, mid - half_along, hi_p, mid + half_along) if vert_ else (mid - half_along, lo_p, mid + half_along, hi_p)
                geo = {}
                for p_ in G1:
                    for q_ in G2:
                        e_ = (q_ - p_) * scale; tl_ = max(20, 0.015 * e_, 2.5 * scale)
                        if p_ in ends_ or q_ in ends_:
                            tl_ *= 2.0                      # a bare line end is a poor stop (lines overshoot)
                        for v_ in range(int((e_ - 1.8 * tl_) // 50) * 50, int(e_ + 1.8 * tl_) + 50, 50):
                            if v_ >= 100 and abs(v_ - e_) <= max(1.8 * tl_, 50):
                                g_ = abs(v_ - e_) / tl_ + 0.3 * (len(G1) - 1 - G1.index(p_) + G2.index(q_))
                                if v_ not in geo or g_ < geo[v_][0]:
                                    geo[v_] = (g_, p_, q_)
                if not geo:
                    continue
                # an overall total equals the sum of the parts it covers, when those are known
                parts_sum = None
                for key2 in {(bool(i_["t"]["vertical"]), round(i_.get("lc", -9e9))) for i_ in items if "lc" in i_}:
                    if key2[0] != vert_ or abs(key2[1] - l["c"]) < 2:
                        continue
                    sib = sorted([i_ for i_ in items if bool(i_["t"]["vertical"]) == vert_ and round(i_.get("lc", -9e9)) == key2[1]
                                  and i_.get("mm") is not None and i_["p"] >= G1[0] - 6 and i_["q"] <= G2[-1] + 6], key=lambda i_: i_["p"])
                    if len(sib) >= 2 and abs(sib[0]["p"] - G1[-1]) <= 0.8 * th + 6 and abs(sib[-1]["q"] - G2[0]) <= 0.8 * th + 6 and \
                            all(abs(a_["q"] - b_["p"]) <= 0.8 * th for a_, b_ in zip(sib, sib[1:])):
                        parts_sum = sum(i_["mm"] for i_ in sib)
                hits = {v_: render_find(gray, region, vflag, str(v_), cap) for v_ in geo}
                r_max = max(h_[0] for h_ in hits.values())
                v = min(geo, key=lambda v_: geo[v_][0] + 10.0 * (r_max - hits[v_][0]) - (3.0 if v_ == parts_sum else 0.0))
                if DEBUG: print("sweep", l["o"], l["c"], G1, G2, parts_sum, [(v_, round(h_[0], 2)) for v_, h_ in hits.items()])
                if hits[v][0] < (0.4 if v == parts_sum else 0.5):
                    continue
                p, q = geo[v][1], geo[v][2]; exp = (q - p) * scale
                box_ = hits[v][1]
                def _ov(o_):
                    ox, oy, ow, oh = o_["box"]
                    iw = min(ox + ow, box_[0] + box_[2]) - max(ox, box_[0]); ih = min(oy + oh, box_[1] + box_[3]) - max(oy, box_[1])
                    return iw > 0 and ih > 0 and iw * ih >= 0.3 * min(ow * oh, box_[2] * box_[3])
                if any(_ov(it["t"]) for it in items):
                    continue                                # that number already belongs to a dimension (seen again from a parallel line)
                t_new = {"s": str(v), "box": box_, "vertical": vflag, "conf": 0.0, "found_by_geometry": True, "pixel_match": round(hits[v][0], 2)}
                for u_ in list(m.get("unread_text", [])):     # fragments of this very label
                    ux, uy, uw, uh = u_["box"]
                    if box_[0] - 4 <= ux and ux + uw <= box_[0] + box_[2] + 4 and box_[1] - 4 <= uy and uy + uh <= box_[1] + box_[3] + 4:
                        m["unread_text"].remove(u_)
                m["texts"].append(t_new)
                new_it = {"t": t_new, "px": q - p, "line": round(l["c"]), "p": p, "q": q, "mm": v, "repaired": True, "stops": stops, "lc": l["c"]}
                items.append(new_it); mine.append(new_it); found_ += 1
                inferred.append({"was": "", "to": str(v) + " (found beside its dimension line)", "measured_mm": round(exp)})
    if crossing_mode:
        # one extension line is one stop: dimension lines side by side must not disagree about where it is by a few px
        # (a dot's estimate on one, the line's position on the other). The busier dimension line knows better.
        for vertical in (False, True):
            its_ = [it for it in items if bool(it["t"]["vertical"]) == vertical and it.get("mm") is not None and "lc" in it]
            busy = {}
            for it in its_:
                busy[round(it["lc"])] = busy.get(round(it["lc"]), 0) + 1
            ends_ = sorted([(it[k_], busy[round(it["lc"])], it, k_) for it in its_ for k_ in ("p", "q")], key=lambda e_: e_[0])
            i_ = 0
            while i_ < len(ends_):
                j_ = i_
                while j_ + 1 < len(ends_) and ends_[j_ + 1][0] - ends_[i_][0] <= 8.0:
                    j_ += 1
                grp_ = ends_[i_:j_ + 1]
                if j_ > i_ and len({round(e_[2]["lc"]) for e_ in grp_}) > 1:
                    top_ = max(e_[1] for e_ in grp_)
                    best_line = [e_ for e_ in grp_ if e_[1] == top_]
                    # stops of ONE dimension line stay apart (two wall faces); the others take the nearest stop of the busiest line
                    for _v, _b, it, k_ in grp_:
                        if _b < top_:
                            it[k_] = min((e_[0] for e_ in best_line), key=lambda v_: abs(v_ - _v))
                            it["px"] = it["q"] - it["p"]
                i_ = j_ + 1
    # chains: a 2-dot line whose ends match a multi-dot line should equal the sum of its parts
    chains = []
    for vertical in (False, True):
        lines_ = {}
        for it in items:
            if bool(it["t"]["vertical"]) == vertical:
                lines_.setdefault(it["line"], []).append(it)
        for la, A in lines_.items():
            for lb, B in lines_.items():
                if len(A) == 1 and len(B) > 1 and la != lb and all(i.get("mm") is not None for i in B) and A[0].get("mm") is not None:
                    # one part of the chain has no readable label at all: the total and the other parts give it exactly
                    Bs_ = sorted(B, key=lambda i: i["p"]); ap, aq = A[0]["p"], A[0]["q"]
                    if Bs_[0]["p"] >= ap - 5 and Bs_[-1]["q"] <= aq + 5:
                        edges = [ap] + [v_ for i in Bs_ for v_ in (i["p"], i["q"])] + [aq]
                        gaps = [(edges[k_], edges[k_ + 1]) for k_ in range(0, len(edges), 2) if edges[k_ + 1] - edges[k_] > 1.5 * th]
                        rest_mm = A[0]["mm"] - sum(i["mm"] for i in Bs_)
                        if len(gaps) == 1 and "lc" in Bs_[0]:
                            # the missing part must lie ON that dimension line; beyond its end there is nothing to label
                            o_b = "v" if vertical else "h"
                            if not any(l_["o"] == o_b and abs(l_["c"] - Bs_[0]["lc"]) < 2 and l_["a"] <= gaps[0][0] + 5 and l_["b"] >= gaps[0][1] - 5
                                       for l_ in m["lines"]):
                                gaps = []
                        if len(gaps) == 1 and rest_mm >= 100 and abs((gaps[0][1] - gaps[0][0]) * scale - rest_mm) <= max(25, 0.02 * rest_mm, 3 * scale):
                            sib = Bs_[0]["t"]; sx_, sy_, sw_, sh_ = sib["box"]; gc = (gaps[0][0] + gaps[0][1]) / 2.0
                            box_ = [sx_, gc - sh_ / 2.0, sw_, sh_] if vertical else [gc - sw_ / 2.0, sy_, sw_, sh_]
                            t_new = {"s": str(int(rest_mm)), "box": box_, "vertical": sib["vertical"], "conf": 0.0,
                                     "inferred_from_chain": True, "cap_px": sib.get("cap_px")}
                            m["texts"].append(t_new)
                            new_it = {"t": t_new, "px": gaps[0][1] - gaps[0][0], "line": lb, "p": gaps[0][0], "q": gaps[0][1], "mm": int(rest_mm), "repaired": False}
                            B.append(new_it); items.append(new_it)
                            inferred.append({"was": "", "to": str(int(rest_mm)) + " (chain total minus the other parts)", "measured_mm": round((gaps[0][1] - gaps[0][0]) * scale)})
                if len(A) == 1 and len(B) > 1:
                    b0, b1 = min(i["p"] for i in B), max(i["q"] for i in B)
                    if abs(A[0]["p"] - b0) < 5 and abs(A[0]["q"] - b1) < 5:
                        Bs = sorted(B, key=lambda i: i["p"])
                        if any(i["mm"] is None for i in Bs) or A[0]["mm"] is None:
                            continue
                        rep = [i for i in Bs if i.get("repaired")]
                        if sum(i["mm"] for i in Bs) != A[0]["mm"] and len(rep) == 1 and not A[0].get("repaired"):
                            v = A[0]["mm"] - sum(i["mm"] for i in Bs if i is not rep[0])
                            if abs(v - rep[0]["px"] * scale) <= max(20, 0.015 * v):
                                rep[0]["mm"] = v; rep[0]["t"]["s"] = str(v)
                                for fx in fixed:
                                    if fx["from"] == rep[0]["t"]["corrected_from"]:
                                        fx["to"] = str(v) + " (closed by chain total)"
                        parts = [i["mm"] for i in Bs]
                        ch_ = {"total": A[0]["mm"], "parts": parts, "ok": sum(parts) == A[0]["mm"]}
                        if ch_ not in chains:
                            chains.append(ch_)
    if crossing_mode and gray is not None:
        # every solved label gets the box of its own number as drawn (partial clusters gave partial boxes) and one lettering size
        for it in items:
            t_ = it["t"]
            if it.get("mm") is None or not t_["s"].isdigit():
                continue
            x, y, w, h = t_["box"]; e_ = 1.6 * cap
            region = (x - 0.7 * cap, y - e_, x + w + 0.7 * cap, y + h + e_) if t_["vertical"] else (x - e_, y - 0.7 * cap, x + w + e_, y + h + 0.7 * cap)
            sc_, box_ = render_find(gray, region, t_["vertical"], t_["s"], cap)
            if box_ and sc_ >= 0.5:
                t_["box"] = box_; t_["ink"] = [box_[0], box_[1], box_[0] + box_[2], box_[1] + box_[3]]
                t_["cap_px"] = round(float(cap), 1); t_["pixel_match"] = round(sc_, 2)
                for u_ in list(m.get("unread_text", [])):   # fragments of this very label
                    ux, uy, uw, uh = u_["box"]
                    if box_[0] - 4 <= ux and ux + uw <= box_[0] + box_[2] + 4 and box_[1] - 4 <= uy and uy + uh <= box_[1] + box_[3] + 4:
                        m["unread_text"].remove(u_)
    if crossing_mode and gray is not None and not m["dots"]:
        # Blurred dimension dots fail the dot detector, but with the stops known they can be looked for where they must be:
        # through a dot the ink runs about twice as far along the 45-degree diagonals as it does through a bare line.
        B_ = gray < m.get("ink_threshold", 128)
        def drun(x_, y_, dx, dy):
            n_ = 0
            for sg_, i0 in ((1, 0), (-1, 1)):
                i_ = i0
                while i_ < 60:
                    xx, yy = int(round(x_ + sg_ * i_ * dx)), int(round(y_ + sg_ * i_ * dy))
                    if 0 <= xx < B_.shape[1] and 0 <= yy < B_.shape[0] and B_[yy, xx]:
                        n_ += 1; i_ += 1
                    else:
                        break
            return n_
        def blob(x_, y_):
            best_ = (0, x_, y_)
            for ox in range(-3, 4):
                for oy in range(-3, 4):
                    v_ = min(drun(x_ + ox, y_ + oy, 1, 1), drun(x_ + ox, y_ + oy, 1, -1))
                    if v_ > best_[0] or (v_ == best_[0] and abs(ox) + abs(oy) < abs(best_[1] - x_) + abs(best_[2] - y_)):
                        best_ = (v_, x_ + ox, y_ + oy)
            return best_[0]
        tied_ = [it for it in items if it.get("mm") is not None and "lc" in it and not it["t"].get("unverified")]
        pts_ = {}
        for it in tied_:
            for s_ in (it["p"], it["q"]):
                pts_[(round(s_, 1), round(it["lc"], 1)) if not it["t"]["vertical"] else (round(it["lc"], 1), round(s_, 1))] = None
        base_ = [blob(*(((it["p"] + it["q"]) / 2.0 + 0.6 * th, it["lc"]) if not it["t"]["vertical"] else (it["lc"], (it["p"] + it["q"]) / 2.0 + 0.6 * th)))
                 for it in tied_ if it["q"] - it["p"] > 3 * th]
        crisp_small = m.get("edge_softness", 9.9) <= 1.4
        if crisp_small:
            # small crisp plans letter their numbers ON the line: the bare line is the LEAST ink found along a span, and a dot
            # there is a 4 px diamond - only ~1.5 times as far through as the line itself
            base_ = [min(blob(*((it["p"] + f_ * (it["q"] - it["p"]), it["lc"]) if not it["t"]["vertical"] else (it["lc"], it["p"] + f_ * (it["q"] - it["p"]))))
                         for f_ in (0.12, 0.25, 0.75, 0.88)) for it in tied_ if it["q"] - it["p"] > 3 * th]
        if base_ and len(pts_) >= 4:
            need_ = (1.4 * float(np.median(base_)) + 0.5) if crisp_small else (1.5 * float(np.median(base_)) + 1.0)
            for k_ in pts_:
                pts_[k_] = blob(*k_)
            if os.environ.get("FV_LOG_DOTS"):
                print("STOP DOTS base", sorted(base_), "need", need_, "at stops", sorted(pts_.values()))
            hit_ = {k_: v_ for k_, v_ in pts_.items() if need_ <= v_ <= 3.2 * need_}
            if len(hit_) >= 0.6 * len(pts_):
                m["dots"] = [{"cx": float(k_[0]), "cy": float(k_[1]), "r": 0.5 * v_, "from_stops": True} for k_, v_ in sorted(hit_.items())]
                m["dot_r"] = round(float(np.median([d_["r"] for d_ in m["dots"]])) * 2) / 2
    if crossing_mode:
        ok_ = [it for it in items if it.get("mm") is not None and not it["t"].get("unverified") and it["px"] > 0 and not it["t"].get("stop_mismatch_mm")]
        if len(ok_) >= 3:
            scale = float(sum(it["mm"] for it in ok_) / sum(it["px"] for it in ok_))   # every tied dimension weighs in by its length
    m["_dim_items"] = [{"axis": "y" if it["t"]["vertical"] else "x", "p": float(it["p"]), "q": float(it["q"]), "mm": int(it["mm"]), "lc": float(it.get("lc", it["line"])),
                        "s": it["t"]["s"], "tc": [it["t"]["box"][0] + it["t"]["box"][2] / 2.0, it["t"]["box"][1] + it["t"]["box"][3] / 2.0],
                        "conf": float(it["t"].get("conf") or 0), "vote_strong": bool(it["t"].get("vote_strong")),
                        "clean": not it.get("repaired") and not it["t"].get("corrected_from") and not it["t"].get("inferred_from_geometry")}
                       for it in items if it.get("mm") is not None and not it["t"].get("unverified") and not it["t"].get("stop_mismatch_mm")
                       # (a dimension whose traced stops disagree with its number by more than tracing error has a wrong stop:
                       #  it keeps its number but must not drag the drawing)
                       and abs(it["mm"] - it["px"] * scale) <= 1.2 * max(20, 0.015 * it["mm"], 2.5 * scale)]
    m["mm_per_px"] = round(scale, 4)
    m["dimension_report"] = {"labels_tied_to_geometry": len(items), "ocr_repaired": fixed, "inferred_from_geometry": inferred, "chains": chains}


def diagonal_dimensions(m):
    """Dimensions drawn along 45-degree walls.  Their lettering is rotated, so neither OCR pass sees it.  Take every long thin
    diagonal line, cut the strip beside it out of the image turned level, and look there for a number that the line's own length
    allows: read it (tesseract, digits only) or, for round values, recognise it by drawing the candidates (render_find)."""
    gray, scale, cap = m.get("_gray"), m.get("mm_per_px"), m.get("dim_cap_px")
    if gray is None or not scale or not cap:
        return
    segs = [(d[0], d[-1]) for d in m.get("diagonals", []) if len(d) == 2]
    for f_ in m.get("fixtures", []):
        if f_.get("type") == "path":
            p_ = f_["start"]
            for sg in f_["segs"]:
                q_ = sg[1] if sg[0] in ("L", "A") else sg[3]
                if sg[0] == "L":
                    segs.append((p_, q_))
                p_ = q_
    # pieces of one diagonal line (it is broken where ticks and other lines cross it) are one line
    diag_ = []
    for p_, q_ in segs:
        dx, dy = q_[0] - p_[0], q_[1] - p_[1]; L = math.hypot(dx, dy)
        ang = math.degrees(math.atan2(dy, dx)) % 180
        if L >= 2 * cap and min(ang, abs(ang - 90), 180 - ang) >= 10:
            diag_.append([list(p_), list(q_)] if dx >= 0 else [list(q_), list(p_)])
    merged = True
    while merged:
        merged = False
        for i_ in range(len(diag_)):
            for j_ in range(i_ + 1, len(diag_)):
                a_, b_ = diag_[i_], diag_[j_]
                ua = np.array([a_[1][0] - a_[0][0], a_[1][1] - a_[0][1]], float); La = np.linalg.norm(ua); ua /= La
                off = [abs((pt[0] - a_[0][0]) * -ua[1] + (pt[1] - a_[0][1]) * ua[0]) for pt in b_]
                if max(off) > 4.0:
                    continue
                ts = sorted([0.0, La] + [(pt[0] - a_[0][0]) * ua[0] + (pt[1] - a_[0][1]) * ua[1] for pt in b_])
                tb = [(pt[0] - a_[0][0]) * ua[0] + (pt[1] - a_[0][1]) * ua[1] for pt in b_]
                if min(tb) - La > 3 * cap or 0 - max(tb) > 3 * cap:
                    continue
                diag_[i_] = [[a_[0][0] + ua[0] * ts[0], a_[0][1] + ua[1] * ts[0]], [a_[0][0] + ua[0] * ts[-1], a_[0][1] + ua[1] * ts[-1]]]
                del diag_[j_]; merged = True; break
            if merged:
                break
    found = []
    for p_, q_ in diag_:
        dx, dy = q_[0] - p_[0], q_[1] - p_[1]; L = math.hypot(dx, dy)
        if L < 5 * cap:
            continue
        ux, uy = dx / L, dy / L
        if ux < 0:
            ux, uy = -ux, -uy
        nx, ny = -uy, ux
        mx, my = (p_[0] + q_[0]) / 2.0, (p_[1] + q_[1]) / 2.0
        Ws, Hs = int(L + 2 * cap), int(6 * cap)
        A = np.array([[ux, nx, mx - ux * Ws / 2.0 - nx * Hs / 2.0], [uy, ny, my - uy * Ws / 2.0 - ny * Hs / 2.0]], np.float32)
        strip = cv2.warpAffine(gray, A, (Ws, Hs), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderValue=255)
        cands = [v_ for v_ in range(300, int(1.02 * L * scale) + 50, 50) if v_ <= 1.02 * L * scale]
        for _rep in range(3):                                 # a long line can carry several dimensions
            best = None
            for r0, r1 in ((Hs / 2.0 - 2.3 * cap, Hs / 2.0 - 0.1 * cap), (Hs / 2.0 + 0.1 * cap, Hs / 2.0 + 2.3 * cap)):
                for v_ in cands:
                    sc_, box_ = render_find(strip, (cap * 0.5, r0, Ws - cap * 0.5, r1), False, str(v_), cap)
                    # a shorter number also matches inside a longer one (900 in 2900): prefer the longer
                    if box_ and (best is None or sc_ + 0.06 * len(str(v_)) > best[0] + 0.06 * len(str(best[2]))):
                        best = (sc_, box_, v_)
            if best is None or best[0] < 0.5:
                break
            sc_, (bx, by, bw, bh), v = best
            crop = strip[max(0, int(by - 5)):int(by + bh + 5), max(0, int(bx - 0.4 * cap)):int(bx + bw + 0.4 * cap)]
            zf = float(min(4.0, max(1.0, 44.0 / max(8.0, cap))))
            crop = cv2.copyMakeBorder(cv2.resize(crop, None, fx=zf, fy=zf, interpolation=cv2.INTER_CUBIC), 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
            read = re.sub(r"\D", "", pytesseract.image_to_string(crop, config="--psm 7 -c tessedit_char_whitelist=0123456789"))
            s_txt, how = None, None
            if 3 <= len(read) <= 5 and len(read) == len(str(v)) and 300 <= int(read) <= 1.02 * L * scale and lev(read, str(v)) <= 2:
                s_txt, how = read, "read"                       # e.g. 2928: not a round number, but it fits the line and looks like the best round one
            elif sc_ >= 0.6:
                s_txt, how = str(v), "pixel_match"
            strip_box = (max(0, int(by - 3)), int(by + bh + 3), max(0, int(bx - 3)), int(bx + bw + 3))
            if s_txt is None:
                strip[strip_box[0]:strip_box[1], strip_box[2]:strip_box[3]] = 255
                continue
            to_img = lambda i_, j_: [float(A[0, 0] * i_ + A[0, 1] * j_ + A[0, 2]), float(A[1, 0] * i_ + A[1, 1] * j_ + A[1, 2])]
            e_ = 0.25 * cap
            quad = [to_img(bx - e_, by - e_), to_img(bx + bw + e_, by - e_), to_img(bx + bw + e_, by + bh + e_), to_img(bx - e_, by + bh + e_)]
            if any(abs(to_img(bx + bw / 2.0, by + bh / 2.0)[0] - o_["centre"][0]) < cap and abs(to_img(bx + bw / 2.0, by + bh / 2.0)[1] - o_["centre"][1]) < cap for o_ in found):
                strip[max(0, int(by - 3)):int(by + bh + 3), max(0, int(bx - 3)):int(bx + bw + 3)] = 255
                continue                                        # the same label seen from a second piece of the same line
            xs_, ys_ = [q[0] for q in quad], [q[1] for q in quad]
            t_ = {"s": s_txt, "box": [min(xs_), min(ys_), max(xs_) - min(xs_), max(ys_) - min(ys_)], "vertical": False, "conf": 0.0,
                  "angle": round(math.degrees(math.atan2(uy, ux)), 2), "baseline_mid": to_img(bx + bw / 2.0, by + bh), "run": float(bw),
                  "centre": to_img(bx + bw / 2.0, by + bh / 2.0), "quad": quad, "cap_px": round(float(cap), 1), "diagonal_dimension": how,
                  "pixel_match": round(sc_, 2), "line_mm": round(L * scale)}
            found.append(t_)
            strip[strip_box[0]:strip_box[1], strip_box[2]:strip_box[3]] = 255
    m["texts"] += found
    # dots where a diagonal dimension line crosses its (diagonal) extension lines.  What a dot looks like is measured on this
    # drawing: halfway between the darkness of its known dots and that of plain line crossings.
    if m.get("dots") and len(diag_) >= 2:
        g_ = gray.astype(np.float32); Hh, Ww = g_.shape; r_ = float(np.median([d_["r"] for d_ in m["dots"]]))
        def disc(x, y):
            yy, xx = np.mgrid[int(y - r_) - 1:int(y + r_) + 2, int(x - r_) - 1:int(x + r_) + 2]
            k_ = (xx - x) ** 2 + (yy - y) ** 2 <= (0.8 * r_) ** 2
            return float(g_[np.clip(yy, 0, Hh - 1), np.clip(xx, 0, Ww - 1)][k_].mean())
        known = [disc(d_["cx"], d_["cy"]) for d_ in m["dots"]]
        plain = []
        for a_ in m["lines"]:
            if a_["o"] != "h" or "dash" in a_:
                continue
            for b_ in m["lines"]:
                if b_["o"] == "v" and "dash" not in b_ and a_["a"] + r_ < b_["c"] < a_["b"] - r_ and b_["a"] + r_ < a_["c"] < b_["b"] - r_ \
                        and all(math.hypot(d_["cx"] - b_["c"], d_["cy"] - a_["c"]) > 3 * r_ for d_ in m["dots"]):
                    plain.append(disc(b_["c"], a_["c"]))
        if len(plain) >= 3:
            thr_ = (float(np.median(known)) + float(np.median(plain))) / 2.0
            new_dots = []
            for i_ in range(len(diag_)):
                for j_ in range(i_ + 1, len(diag_)):
                    (x1, y1), (x2, y2) = diag_[i_]; (x3, y3), (x4, y4) = diag_[j_]
                    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
                    if abs(den) < 1e-6:
                        continue
                    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
                    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
                    on_ = lambda u, v, w: min(u, v) - r_ <= w <= max(u, v) + r_
                    if not (on_(x1, x2, px) and on_(y1, y2, py) and on_(x3, x4, px) and on_(y3, y4, py)):
                        continue
                    if disc(px, py) < thr_ and all(math.hypot(d_["cx"] - px, d_["cy"] - py) > 2 * r_ for d_ in m["dots"] + new_dots):
                        new_dots.append({"cx": float(px), "cy": float(py), "r": r_, "diagonal": True})
            m["dots"] += new_dots
            if new_dots:
                m.setdefault("dimension_report", {})["diagonal_dots"] = {"found": len(new_dots), "threshold_grey": round(thr_, 1),
                                                                          "known_dot_grey": round(float(np.median(known)), 1), "plain_crossing_grey": round(float(np.median(plain)), 1)}
    if found:
        m.setdefault("dimension_report", {})["diagonal_labels"] = [{"text": t_["s"], "by": t_["diagonal_dimension"], "line_mm": t_["line_mm"]} for t_ in found]


LABEL_FOLLOWERS = {                                          # second lines of room labels, as HDB plans write them
    "BATH/": ("below", ["W.C. 1", "W.C. 2", "W.C. 3", "W.C.", "WC 1", "WC 2", "WC 3", "WC"]), "LIVING/": ("below", ["DINING"]), "KITCHEN/": ("below", ["DINING"]),
    "STORE/": ("below", ["PANTRY"]), "PANTRY": ("below", ["(APT."]), "(APT.": ("below", ["SHELTER)"]), "SERVICE": ("below", ["BALCONY", "YARD"]),
    "HOUSEHOLD": ("below", ["SHELTER"]), "BEDROOM": ("above", ["MAIN", "MASTER"]), "SHELTER)": ("above", ["(APT."]),
    "DINING": ("above", ["LIVING/", "KITCHEN/"]), "BALCONY": ("above", ["SERVICE"]),
    "W.C. 1": ("above", ["BATH/"]), "W.C. 2": ("above", ["BATH/"]), "W.C. 3": ("above", ["BATH/"]), "W.C.": ("above", ["BATH/"]),
    "SCALE": ("right", ["1:100", "1:50", "1:200", "1:75", "1:150"])}


def _whole_word(gray, box, thr=170):
    """Is the lettering in `box` a word by itself?  Ink at letter height within 0.7 cap heights to its left or right, closer than
    a word space, means the box covers only part of a longer word."""
    x, y, w, h = [int(round(v)) for v in box]
    H, W = gray.shape
    y0, y1 = max(0, y + int(0.2 * h)), min(H, y + int(0.8 * h) + 1)
    for xa, xb in ((x - int(0.45 * h), x - 1), (x + w + 1, x + w + int(0.45 * h))):
        xa, xb = max(0, xa), min(W, xb)
        if xb - xa < 2 or y1 - y0 < 2:
            continue
        band = gray[y0:y1, xa:xb] < thr
        cols = band.any(axis=0)
        # a full-height column is the stem of a letter - unless it runs on well above and below the lettering (a wall, a frame line)
        ya, yb = max(0, y - int(0.6 * h)), min(H, y + h + int(0.6 * h))
        tall = gray[ya:yb, xa:xb] < thr
        runs_on = bool((tall.mean(axis=0) > 0.95).any())
        if cols.mean() > 0.35 and band.mean() > 0.12 and not runs_on:
            return False
    return True


def complete_labels(m):
    """Soft inputs: a room label's other line is known vocabulary ('BATH/' is followed by 'W.C. n'). Where the reader missed
    it, look for exactly those words in exactly that place by drawing them (render_find), as for the dimension numbers."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    added = []
    wr0 = []
    for t_ in m["texts"]:
        if not t_["vertical"] and t_.get("angle") is None and t_["s"] in PLAN_VOCAB and len(t_["s"]) >= 5:
            a0 = _render_number(t_["s"]); wr0.append(t_["box"][2] / (a0.shape[1] * t_["box"][3] / float(a0.shape[0])))
    wf0 = float(np.median(wr0)) if len(wr0) >= 3 else 0.8
    wfs0 = (0.93 * wf0, wf0, 1.07 * wf0)
    def rescue_unread():
        # lettering clusters the reader could not read: try the plan vocabulary on them, word by word, by drawing it
        caps_ = [float(t_["box"][3]) for t_ in m["texts"] if not t_["vertical"] and t_.get("angle") is None and any(ch.isalpha() for ch in t_["s"])
                 and t_["s"] in PLAN_VOCAB | {"BEDROOM 2", "BEDROOM 3", "BEDROOM 1"}]
        if len(caps_) >= 3:
            cap_l = float(np.median(caps_))
            # how condensed is this plan's lettering against the comparison font? (read labels tell)
            wr_ = []
            for t_ in m["texts"]:
                if not t_["vertical"] and t_.get("angle") is None and t_["s"] in PLAN_VOCAB and len(t_["s"]) >= 5:
                    a0 = _render_number(t_["s"]); wr_.append(t_["box"][2] / (a0.shape[1] * t_["box"][3] / float(a0.shape[0])))
            wf_ = float(np.median(wr_)) if len(wr_) >= 3 else 0.8
            wfs_ = (0.93 * wf_, wf_, 1.07 * wf_)
            vocab = sorted(PLAN_VOCAB | {"W.C. 1", "W.C. 2", "W.C. 3", "BEDROOM 1", "BEDROOM 2", "BEDROOM 3", "BEDROOM 4"})
            for u_ in list(m.get("unread_text", [])):
                if u_["vertical"]:
                    continue
                ux, uy, uw, uh = u_["box"]
                if not (0.45 * cap_l <= uh <= 1.7 * cap_l) or uw < 1.2 * uh:
                    continue
                read_ = re.sub(r"[^A-Z0-9/.()]", "", (u_.get("read") or "").upper())
                # a label crossed by a swing or a dashed line is read in part ('CONY', 'LED'): the rest of the word is looked for
                # around the fragment - the fragment that WAS read is the evidence, the drawn word has to fit the pixels
                frag_ = re.sub(r"[^A-Z]", "", read_)
                if len(frag_) >= 3:
                    whole_ = [wd for wd in vocab if frag_ in re.sub(r"[^A-Z]", "", wd) and len(re.sub(r"[^A-Z]", "", wd)) > len(frag_)]
                    best_w = None
                    for wd in whole_:
                        a0 = _render_number(wd); nat_w = a0.shape[1] * cap_l / a0.shape[0] * wf_
                        region = (ux - nat_w, uy - 0.6 * cap_l, ux + uw + nat_w, uy + uh + 0.6 * cap_l)
                        sc_, box_ = render_find(gray, region, False, wd, cap_l, wfs_)
                        if box_ and sc_ >= 0.7 and box_[0] <= ux + 0.5 * uw <= box_[0] + box_[2] and (best_w is None or sc_ > best_w[0]) \
                                and _whole_word(gray, box_):    # (not the tail of a longer word: 'ROOM' of BEDROOM)
                            best_w = (sc_, wd, box_)
                    if best_w and not any(min(o_["box"][0] + o_["box"][2], best_w[2][0] + best_w[2][2]) - max(o_["box"][0], best_w[2][0]) > 0 and
                                          min(o_["box"][1] + o_["box"][3], best_w[2][1] + best_w[2][3]) - max(o_["box"][1], best_w[2][1]) > 0 for o_ in m["texts"]):
                        sc_, wd, (bx, by, bw, bh) = best_w
                        m["texts"].append({"s": wd, "box": [bx, by, bw, bh], "vertical": False, "conf": 0.0, "completed_from": u_.get("read", ""),
                                           "pixel_match": round(sc_, 2), "ink": [bx, by, bx + bw, by + bh]})
                        m["unread_text"].remove(u_); added.append(wd)
                        continue
                scored = []
                for cap_u in ([cap_l] if uh >= 0.8 * cap_l else [float(uh)]):     # small print (SCALE 1:100) has its own height
                  region = (ux - 0.8 * cap_u, uy - 0.6 * cap_u, ux + uw + 0.8 * cap_u, uy + uh + 0.6 * cap_u)
                  for wd in vocab:
                    a0 = _render_number(wd); nat_w = a0.shape[1] * cap_u / a0.shape[0] * wf_
                    if not (0.75 * uw <= nat_w <= 1.3 * uw):
                        continue                                # a word of another length altogether
                    sc_, box_ = render_find(gray, region, False, wd, cap_u, wfs_)
                    if box_:
                        scored.append((sc_ + (0.06 if read_ and lev(read_, re.sub(r"[^A-Z0-9/.()]", "", wd)) <= 2 else 0.0), sc_, wd, box_))
                scored.sort(reverse=True)
                if not scored or scored[0][1] < 0.7:
                    continue
                pick = scored[0]
                for o_ in scored[1:3]:                          # LIVING against LIVING/: the longer word, if it fits nearly as well
                    if o_[2].startswith(pick[2]) and o_[1] >= pick[1] - 0.09 and any(ch.isalnum() for ch in o_[2][len(pick[2]):]):
                        pick = o_
                for o_ in scored:                               # ... and a full stop is only there if the word without it fits WORSE
                    if pick[2].endswith(".") and o_[2] == pick[2].rstrip(".") and o_[1] >= pick[1] - 0.02:
                        pick = o_
                rest_ = [o_ for o_ in scored if o_ is not pick and not o_[2].startswith(pick[2]) and not pick[2].startswith(o_[2])]
                if rest_ and pick[0] - rest_[0][0] < 0.04:
                    continue
                _b, sc_, wd, (bx, by, bw, bh) = pick
                if not _whole_word(gray, (bx, by, bw, bh)):
                    continue                                    # lettering runs on beside it: the tail of a longer word ('ROOM' of BEDROOM)
                m["texts"].append({"s": wd, "box": [bx, by, bw, bh], "vertical": False, "conf": 0.0, "completed_from": u_.get("read", ""),
                                   "pixel_match": round(sc_, 2), "ink": [bx, by, bx + bw, by + bh]})
                m["unread_text"].remove(u_); added.append(wd)
    for _round in range(3):                                  # a found line can have a follower of its own: STORE/ PANTRY (APT. SHELTER)
        if _round == 2:
            rescue_unread()                                 # ... and a rescued word as well: SCALE 1:100
        for t in list(m["texts"]):
            if t["vertical"] or t.get("angle") is not None or t["s"] not in LABEL_FOLLOWERS:
                continue
            where, cands = LABEL_FOLLOWERS[t["s"]]
            x, y, w, h = t["box"]; cap = float(h)
            if not (10 <= cap <= 80):
                continue
            y0, y1 = (y + h + 0.05 * cap, y + h + 2.0 * cap) if where == "below" else (y - 2.0 * cap, y - 0.05 * cap)
            region = (x - 1.0 * cap, y0, x + max(w, 5.5 * cap) + 1.0 * cap, y1)
            if where == "right":
                y0, y1 = y - 0.5 * cap, y + h + 0.5 * cap
                region = (x + w + 0.3 * cap, y0, x + w + 9.0 * cap, y1)
            def overlaps(o_):
                ox, oy, ow, oh = o_["box"]
                return min(ox + ow, region[2]) - max(ox, region[0]) > 0.5 * min(ow, region[2] - region[0]) and min(oy + oh, y1) - max(oy, y0) > 0.5 * oh
            if any(o_ is not t and not o_["vertical"] and o_.get("angle") is None and overlaps(o_) and (where == "right" or any(ch.isalpha() for ch in o_["s"])) for o_ in m["texts"]):
                continue                                    # something is already read there
            wfs_f = wfs0 if where != "right" else tuple(wf0 * k_ for k_ in (1.0, 1.15, 1.3, 1.45))     # figures are set wider than words
            # (the lines of one label are not always lettered at one height on a brochure: the next line is tried a size up and down)
            hits = {c_: max((render_find(gray, region, False, c_, cap * kc2_, wfs_f) for kc2_ in (1.0, 0.88, 1.12, 1.25)), key=lambda h_: h_[0]) for c_ in cands}
            best = max(hits, key=lambda c_: hits[c_][0])
            if hits[best][0] < 0.62 or hits[best][1] is None:
                continue
            stem = min((c_ for c_ in cands if best.startswith(c_)), key=len)      # 'W.C.' of 'W.C. 2'
            longer = [c_ for c_ in cands if c_ != stem and c_.startswith(stem) and len(c_) == len(stem) + 2]
            if longer and hits[stem][1] is not None and hits[stem][0] >= 0.62:
                # the number after 'W.C.' stands well apart from it: judge that one glyph on its own
                bx, by, bw, bh = hits[stem][1]
                tail = (bx + bw, by - 0.3 * cap, bx + bw + 2.2 * cap, by + bh + 0.3 * cap)
                sc_ = {c_: render_find(gray, tail, False, c_[-1], cap, wfs0) for c_ in longer}
                top = max(sc_, key=lambda c_: sc_[c_][0])
                if sc_[top][0] >= 0.62 and sc_[top][1] is not None:
                    dx_, dy_, dw_, dh_ = sc_[top][1]
                    hits[top] = (hits[stem][0], [bx, by, dx_ + dw_ - bx, bh]); best = top
                else:
                    best = stem
            bx, by, bw, bh = hits[best][1]
            t_new = {"s": best, "box": [bx, by, bw, bh], "vertical": False, "conf": 0.0, "completed_from": t["s"],
                     "pixel_match": round(hits[best][0], 2), "cap_px": float(bh), "ink": [bx, by, bx + bw, by + bh]}
            m["texts"].append(t_new); added.append(best)
            for u_ in list(m.get("unread_text", [])):
                ux, uy, uw, uh = u_["box"]
                if min(ux + uw, bx + bw) - max(ux, bx) > 0.5 * uw and min(uy + uh, by + bh) - max(uy, by) > 0.5 * uh:
                    m["unread_text"].remove(u_)
    if added:
        m.setdefault("dimension_report", {})["labels_completed"] = added


def validate_slash_labels(m):
    """A label that ends in '/' continues on the next line ('BATH/' over 'W.C. 1', 'LIVING/' over 'DINING').  A trailing slash
    with nothing lettered beneath it was a furniture line or a bracket read as a slash: the label is the word alone."""
    fixed = []
    for t in m["texts"]:
        s_ = t["s"]
        if t["vertical"] or t.get("angle") is not None or not s_.endswith("/") or len(s_) < 3:
            continue
        x, y, w, h = t["box"]
        below = any(o is not t and not o["vertical"] and o.get("angle") is None and any(ch.isalnum() for ch in o["s"])
                    and y + 0.7 * h <= o["box"][1] <= y + 2.6 * h and min(o["box"][0] + o["box"][2], x + w) - max(o["box"][0], x) > -1.0 * h
                    for o in m["texts"])
        if not below:
            fixed.append(s_); t["s"] = s_[:-1]; t["slash_removed"] = True
    if fixed:
        m.setdefault("dimension_report", {})["slashes_removed"] = fixed


def read_level_notes(m):
    """Soft inputs: the small rotated notes at thresholds ('100 DROP', '50 DROP') are beyond the reader, but they are always the
    same two words.  Find DROP by drawing it (all three orientations), then the figure on the line before it."""
    gray, cap0 = m.get("_gray"), m.get("dim_cap_px")
    if gray is None or not m.get("soft_input") or not cap0:
        return
    H_, W_ = gray.shape[:2]
    a0 = _render_number("DROP")
    hits = []
    for vertical in ("up", "down", False):
        img = gray if not vertical else cv2.rotate(gray, cv2.ROTATE_90_COUNTERCLOCKWISE if vertical == "down" else cv2.ROTATE_90_CLOCKWISE)
        img = img.astype(np.float32)
        for cap in (0.8 * cap0, 0.9 * cap0, 1.0 * cap0, 1.1 * cap0):
            for wf in (0.62, 0.76):
                hh = int(round(cap)); ww = int(round(a0.shape[1] * cap / a0.shape[0] * wf))
                a = cv2.resize(a0, (ww, hh), interpolation=cv2.INTER_AREA).astype(np.float32)
                a = cv2.GaussianBlur(cv2.copyMakeBorder(a, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255), (0, 0), cap / 16.0)
                res = cv2.matchTemplate(img, a, cv2.TM_CCOEFF_NORMED)
                for _k in range(6):
                    _mn, mx, _l, loc = cv2.minMaxLoc(res)
                    if mx < 0.66:
                        break
                    u0, v0 = loc[0] + 2, loc[1] + 2
                    if vertical == "down":
                        box = [W_ - (v0 + hh), u0, hh, ww]
                    elif vertical:
                        box = [v0, H_ - (u0 + ww), hh, ww]
                    else:
                        box = [u0, v0, ww, hh]
                    hits.append((float(mx), vertical, float(cap), [float(b_) for b_ in box]))
                    cv2.rectangle(res, (max(0, loc[0] - ww), max(0, loc[1] - hh)), (loc[0] + ww, loc[1] + hh), -1.0, -1)
    hits.sort(key=lambda h_: -h_[0])
    taken, notes = [], []
    for sc, vertical, cap, box in hits:
        bx, by, bw, bh = box
        if any(min(bx + bw, t[0] + t[2]) > max(bx, t[0]) and min(by + bh, t[1] + t[3]) > max(by, t[1]) for t in taken):
            continue
        if any(not t_["vertical"] == (not vertical) and min(bx + bw, t_["box"][0] + t_["box"][2]) - max(bx, t_["box"][0]) > 0.5 * bw
               and min(by + bh, t_["box"][1] + t_["box"][3]) - max(by, t_["box"][1]) > 0.5 * bh for t_ in m["texts"]):
            continue                                        # lettering that is already read
        # the figure stands on the line before: left of an upward note, right of a downward one, above a level one
        g_ = 1.6 * cap
        if vertical == "up":
            region = (bx - g_, by - 0.5 * cap, bx + 0.15 * cap, by + bh + 0.5 * cap)
        elif vertical == "down":
            region = (bx + bw - 0.15 * cap, by - 0.5 * cap, bx + bw + g_, by + bh + 0.5 * cap)
        else:
            region = (bx - 0.5 * cap, by - g_, bx + bw + 0.5 * cap, by + 0.15 * cap)
        figs = {s_: render_find(gray, region, vertical, s_, cap * 1.05, (0.6, 0.7, 0.8, 0.9)) for s_ in ("50", "100", "150", "200", "25", "75")}
        best = max(figs, key=lambda s_: figs[s_][0] + 0.03 * len(s_))
        if figs[best][0] < 0.7 or figs[best][1] is None:
            continue
        taken.append(box); taken.append(figs[best][1])
        for s_, b_ in ((best, figs[best][1]), ("DROP", box)):
            m["texts"].append({"s": s_, "box": b_, "vertical": vertical, "conf": 0.0, "note": True, "pixel_match": round(sc if s_ == "DROP" else figs[best][0], 2),
                               "cap_px": round(cap, 1), "ink": [b_[0], b_[1], b_[0] + b_[2], b_[1] + b_[3]]})
        notes.append(best + " DROP")
        fb = figs[best][1]
        m.setdefault("note_zones", []).append([min(box[0], fb[0]), min(box[1], fb[1]), max(box[0] + box[2], fb[0] + fb[2]), max(box[1] + box[3], fb[1] + fb[3])])
        for u_ in list(m.get("unread_text", [])):
            ux, uy, uw, uh = u_["box"]
            for b_ in (box, figs[best][1]):
                if min(ux + uw, b_[0] + b_[2]) > max(ux, b_[0]) and min(uy + uh, b_[1] + b_[3]) > max(uy, b_[1]) and u_ in m["unread_text"]:
                    m["unread_text"].remove(u_)
    # the angle note of a point block ('135°', beside the leader where a 45-degree wall turns): same method, and only where
    # a diagonal stroke ends close by
    if m.get("diagonals"):
        img = gray.astype(np.float32)
        for s_ in ("135\u00b0", "45\u00b0"):
            a1 = _render_number(s_); best = (0.0, None, None)
            for cap in (0.92 * cap0, 1.0 * cap0, 1.08 * cap0):
                for wf in (0.7, 0.8, 0.9):
                    hh = int(round(cap)); ww = int(round(a1.shape[1] * cap / a1.shape[0] * wf))
                    a = cv2.resize(a1, (ww, hh), interpolation=cv2.INTER_AREA).astype(np.float32)
                    a = cv2.GaussianBlur(cv2.copyMakeBorder(a, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255), (0, 0), cap / 16.0)
                    _mn, mx, _l, loc = cv2.minMaxLoc(cv2.matchTemplate(img, a, cv2.TM_CCOEFF_NORMED))
                    if mx > best[0]:
                        best = (float(mx), [float(loc[0] + 2), float(loc[1] + 2), float(ww), float(hh)], float(cap))
            sc, box, cap = best
            if sc < 0.68 or box is None:
                continue
            bx, by, bw, bh = box
            near_diag = any(math.hypot(q_[0] - (bx + bw / 2.0), q_[1] - (by + bh / 2.0)) <= 5.0 * cap for dg in m["diagonals"] for q_ in (dg[0], dg[-1]))
            clash = any(min(bx + bw, t_["box"][0] + t_["box"][2]) > max(bx, t_["box"][0]) and min(by + bh, t_["box"][1] + t_["box"][3]) > max(by, t_["box"][1]) for t_ in m["texts"])
            if near_diag and not clash:
                m["texts"].append({"s": s_, "box": box, "vertical": False, "conf": 0.0, "note": True, "pixel_match": round(sc, 2), "cap_px": round(cap, 1),
                                   "ink": [bx, by, bx + bw, by + bh]})
                notes.append(s_)
                for u_ in list(m.get("unread_text", [])):
                    ux, uy, uw, uh = u_["box"]
                    if min(ux + uw, bx + bw) > max(ux, bx) and min(uy + uh, by + bh) > max(uy, by):
                        m["unread_text"].remove(u_)
                # the dimension arc itself: about the vertex where a level leader meets a 45-degree one, between the two
                inkd = cv2.dilate((gray < m.get("ink_threshold", 180)).astype(np.uint8), np.ones((3, 3), np.uint8))
                done_ = False
                for l in m["lines"]:
                    if l["o"] != "h" or "dash" in l or done_:
                        continue
                    for e, o_e in (("a", "b"), ("b", "a")):
                        vx, vy = l[e], l["c"]
                        if math.hypot(vx - (bx + bw / 2.0), vy - (by + bh / 2.0)) > 8.0 * cap:
                            continue
                        for dg in m["diagonals"]:
                            for p_, q_ in ((dg[0], dg[-1]), (dg[-1], dg[0])):
                                if math.hypot(p_[0] - vx, p_[1] - vy) > 8.0:
                                    continue
                                a_h = 0.0 if l[o_e] > l[e] else 180.0
                                a_d = math.degrees(math.atan2(q_[1] - p_[1], q_[0] - p_[0])) % 360
                                span = (a_h - a_d) % 360
                                start = a_d
                                if span > 180:
                                    start, span = a_h, 360 - span
                                if abs(span - float(s_[:-1])) > 12:
                                    continue
                                span = float(s_[:-1]); best_r = (0.0, None)
                                t_ = np.radians(np.linspace(start + 6, start + span - 6, 50))
                                for rr in np.arange(1.2 * cap, 7.0 * cap, 1.0):
                                    px = np.clip(np.rint(vx + rr * np.cos(t_)).astype(int), 0, W_ - 1); py = np.clip(np.rint(vy + rr * np.sin(t_)).astype(int), 0, H_ - 1)
                                    c_ = float(inkd[py, px].mean())
                                    if c_ > best_r[0]:
                                        best_r = (c_, float(rr))
                                if best_r[0] >= 0.75:
                                    rr = best_r[1]
                                    m["arcs"].append({"cx": float(vx), "cy": float(vy), "r": rr, "start": float(start), "span": span, "from": "angle-note"})
                                    rd_ = m.get("dot_r") or 3.0
                                    for g_ in (start, start + span):
                                        m["dots"].append({"cx": float(vx + rr * math.cos(math.radians(g_))), "cy": float(vy + rr * math.sin(math.radians(g_))), "r": rd_, "angle_note": True})
                                    done_ = True
                                if done_:
                                    break
                            if done_:
                                break
                        if done_:
                            break
                break
    if notes:
        m.setdefault("dimension_report", {})["level_notes"] = notes


def bar_continuations(m):
    """Soft inputs.  A short solid bar (a rail, a gate) often runs on as a THICK DOTTED line of the same width.  The wall
    stage keeps only the solid part; the dotted run is read from the pixels and drawn as one dashed stroke of that width."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    T = m["wall_thickness_px"]; H, W = gray.shape
    g = gray.astype(float)
    rep = []
    for w_ in m["walls"]:
        if not w_.get("bar") or w_.get("hole"):
            continue
        xs = [p_[0] for p_ in w_["pts"]]; ys = [p_[1] for p_ in w_["pts"]]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        vert = (y1 - y0) >= (x1 - x0)
        wid = (x1 - x0) if vert else (y1 - y0)
        if wid > 0.5 * T or len(w_["pts"]) != 4:
            continue
        c0, c1 = ((x0, x1) if vert else (y0, y1))
        lo_, hi_ = int(round(c0 + 0.2 * wid)), max(int(round(c0 + 0.2 * wid)) + 1, int(round(c1 - 0.2 * wid)))
        inside = g[int(y0) + 2:int(y1) - 1, lo_:hi_] if vert else g[lo_:hi_, int(x0) + 2:int(x1) - 1]
        if inside.size == 0:
            continue
        dark = float(np.median(inside))
        for sg, e0 in ((1, (y1 if vert else x1)), (-1, (y0 if vert else x0))):
            n_max = int(6 * T)
            prof = []
            for k_ in range(1, n_max):
                t_ = int(round(e0 + sg * k_))
                if not (0 <= t_ < (H if vert else W)):
                    break
                prof.append(float((g[t_, lo_:hi_] if vert else g[lo_:hi_, t_]).mean()))
            if len(prof) < 12:
                continue
            prof = np.array(prof)
            # the level between the dots: what the run looks like where it is lightest, short of paper
            bg = float(np.percentile(prof[:int(3 * T)], 80))
            if bg - dark < 35:
                continue
            on = prof < (dark + bg) / 2.0
            runs, i_ = [], 0
            while i_ < len(on):
                if on[i_]:
                    j_ = i_
                    while j_ + 1 < len(on) and on[j_ + 1]:
                        j_ += 1
                    runs.append((i_, j_ + 1)); i_ = j_ + 1
                else:
                    i_ += 1
            runs = [r_ for r_ in runs if r_[1] - r_[0] >= 2]
            if len(runs) < 3:
                continue
            seq = [runs[0]]
            for r_ in runs[1:]:
                gaps_ = [b_[0] - a_[1] for a_, b_ in zip(seq, seq[1:])] or [r_[0] - seq[-1][1]]
                if r_[0] - seq[-1][1] <= 2.5 * max(2.0, float(np.median(gaps_))) and r_[1] - r_[0] <= 0.8 * T:
                    seq.append(r_)
                else:
                    break
            if seq[0][0] > 0.6 * T or len(seq) < 3 or (seq[0][1] - seq[0][0]) > 0.8 * T:
                continue
            dl = float(np.median([b_ - a_ for a_, b_ in seq])); gp = float(np.median([b_[0] - a_[1] for a_, b_ in zip(seq, seq[1:])]))
            if dl > 0.6 * T or gp > 0.6 * T:
                continue
            a_, b_ = sorted((e0 + sg * seq[0][0], e0 + sg * seq[-1][1]))
            m["lines"].append({"o": "v" if vert else "h", "c": float((c0 + c1) / 2.0), "a": float(a_), "b": float(b_), "t": float(wid), "w": float(wid),
                               "dash": [round(dl, 1), round(gp, 1)], "from": "bar-dots"})
            rep.append({"bar": [round(x0), round(y0), round(x1), round(y1)], "dots": len(seq), "to": round(b_ if sg > 0 else a_)})
    if rep:
        m.setdefault("dimension_report", {})["bar_continuations"] = rep


def slanted_strokes(m):
    """Soft inputs.  A note leader is drawn freehand-straight from a dot to its note and is rarely square to the sheet.  Traced
    as a vertical / horizontal line it sits beside its own ink at one end (and the tracer adds a second short line for the
    part it missed).  A long line whose ink centre drifts steadily from end to end IS slanted: it becomes a two-point
    diagonal on its measured centres; its foot (the short tick towards the note) and its dot are taken from the pixels."""
    gray, scale = m.get("_gray"), m.get("mm_per_px")
    if gray is None or not scale or not m.get("soft_input"):
        return
    T = m["wall_thickness_px"]; H, W = gray.shape
    thr = m.get("ink_threshold", 180)
    g = gray.astype(float)
    report = []
    for l in list(m["lines"]):
        L_ = l["b"] - l["a"]
        if "dash" in l or L_ < 3.0 * T or l.get("t", 3.0) > 0.5 * T:
            continue
        if sum(1 for d in m["dots"] if abs((d["cy"] if l["o"] == "h" else d["cx"]) - l["c"]) <= 3.0 and l["a"] - 3 <= (d["cx"] if l["o"] == "h" else d["cy"]) <= l["b"] + 3) >= 1:
            continue                                        # dimension and extension lines are ruled
        ts, cs = [], []
        for t_ in np.arange(l["a"] + 3, l["b"] - 3, 2.0):
            ti = int(t_)
            prof = (255.0 - (g[ti, max(0, int(l["c"]) - 9):int(l["c"]) + 10] if l["o"] == "v" else g[max(0, int(l["c"]) - 9):int(l["c"]) + 10, ti]))
            if len(prof) < 19 or prof.max() < 255 - thr:
                continue
            on = prof >= 0.35 * prof.max()
            idx = np.where(on)[0]
            if idx[-1] - idx[0] + 1 != on.sum() or on.sum() > 9 or on[0] or on[-1]:
                continue                                    # other ink beside the stroke here: not a clean sample
            pr = np.where(on, prof, 0.0)
            ts.append(t_); cs.append(int(l["c"]) - 9 + float((pr * np.arange(len(pr))).sum() / pr.sum()) + 0.5)
        if len(ts) < 0.5 * (L_ / 2.0) or len(ts) < 12:
            continue
        k_, c0_ = np.polyfit(ts, cs, 1)
        res = np.abs(np.polyval([k_, c0_], ts) - np.array(cs))
        drift = abs(k_) * L_
        if drift < 3.0 or drift > 0.12 * L_ or np.percentile(res, 90) > 0.8 or L_ < 4.0 * T:
            continue
        if abs(np.polyfit(ts, cs, 2)[0]) * L_ * L_ / 4.0 > 0.8:
            continue                                        # it bends: the flat end of a long curve, not a slanted straight stroke
        pa = (l["a"], float(np.polyval([k_, c0_], l["a"]))); pb = (l["b"], float(np.polyval([k_, c0_], l["b"])))
        P0, P1 = ([pa[1], pa[0]], [pb[1], pb[0]]) if l["o"] == "v" else ([pa[0], pa[1]], [pb[0], pb[1]])
        m["lines"] = [q for q in m["lines"] if q is not l]
        # the second trace of the same stroke: a short parallel line lying on the slanted centre line
        def on_slant(q):
            if q["o"] != l["o"] or "dash" in q or q["b"] - q["a"] > 0.6 * L_ or q["a"] < l["a"] - 3 or q["b"] > l["b"] + 3:
                return False
            return all(abs(q["c"] - float(np.polyval([k_, c0_], t_))) <= 3.0 for t_ in (q["a"], q["b"]))
        m["lines"] = [q for q in m["lines"] if not on_slant(q)]
        m.setdefault("leaders", []).append([P0, P1])
        rep = {"from": [round(v) for v in P0], "to": [round(v) for v in P1], "drift_px": round(drift, 1)}
        ink = gray < thr
        for P in (P0, P1):
            xi, yi = int(round(P[0])), int(round(P[1]))
            # foot: a short stroke square to the sheet leaving the end of the leader
            best = None
            for o_, dx, dy in (("h", 1, 0), ("h", -1, 0), ("v", 0, 1), ("v", 0, -1)):
                if o_ == l["o"]:
                    continue
                for off in range(-4, 5):
                    x_, y_ = (xi, yi + off) if o_ == "h" else (xi + off, yi)
                    n_ = 0
                    while 0 <= x_ + dx * (n_ + 1) < W and 0 <= y_ + dy * (n_ + 1) < H and n_ < 3 * T and \
                            ink[max(0, y_ + dy * (n_ + 1) - 1):y_ + dy * (n_ + 1) + 2, max(0, x_ + dx * (n_ + 1) - 1):x_ + dx * (n_ + 1) + 2].any():
                        n_ += 1
                    if 0.3 * T <= n_ < 3 * T and (best is None or n_ > best[0]):
                        # the ridge of the foot, across it
                        cs_ = []
                        for k2 in range(3, n_ - 1):
                            pr = 255.0 - (g[y_ - 4:y_ + 5, x_ + dx * k2] if o_ == "h" else g[y_ + dy * k2, x_ - 4:x_ + 5])
                            if len(pr) == 9 and pr.max() >= 255 - thr:
                                cs_.append((y_ if o_ == "h" else x_) - 4 + int(np.argmax(pr)) + 0.5)
                        if len(cs_) >= 3 and np.ptp(cs_) <= 2.0:
                            best = (n_, o_, float(np.median(cs_)), dx + dy)
            if best:
                n_, o_, c_, sg_ = best
                e0 = P[0] if o_ == "h" else P[1]
                a_, b_ = sorted((e0, e0 + sg_ * n_))
                if not any(q["o"] == o_ and abs(q["c"] - c_) <= 2.5 and min(q["b"], b_) - max(q["a"], a_) >= 0.5 * (b_ - a_) for q in m["lines"]):
                    m["lines"].append({"o": o_, "c": c_, "a": float(a_), "b": float(b_), "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "leader-foot"})
                    P[1 if o_ == "h" else 0] = c_            # the leader ends ON its foot
                    rep["foot"] = [o_, round(c_), round(a_), round(b_)]
            # dot: a filled disc on the end
            r_ = m.get("dot_r") or 3.0
            yy, xx = np.ogrid[-int(3 * r_):int(3 * r_) + 1, -int(3 * r_):int(3 * r_) + 1]
            for cy_ in range(yi - int(r_), yi + int(r_) + 1):
                for cx_ in range(xi - int(r_), xi + int(r_) + 1):
                    if not (int(3 * r_) <= cx_ < W - int(3 * r_) and int(3 * r_) <= cy_ < H - int(3 * r_)):
                        continue
                    win = ink[cy_ - int(3 * r_):cy_ + int(3 * r_) + 1, cx_ - int(3 * r_):cx_ + int(3 * r_) + 1]
                    disc = (xx * xx + yy * yy) <= (0.85 * r_) ** 2
                    ring = ((xx * xx + yy * yy) >= (1.8 * r_) ** 2) & ((xx * xx + yy * yy) <= (2.6 * r_) ** 2)
                    if win[disc].mean() >= 0.95 and win[ring].mean() <= 0.35:
                        if not any(math.hypot(d["cx"] - cx_, d["cy"] - cy_) <= 2 * r_ for d in m["dots"]):
                            m["dots"].append({"cx": cx_ + 0.5, "cy": cy_ + 0.5, "r": r_, "leader": True}); rep["dot"] = [cx_, cy_]
                        break
                else:
                    continue
                break
        report.append(rep)
    if report:
        m.setdefault("dimension_report", {})["slanted_strokes"] = report


def refine_soft(m):
    """Soft inputs, before the drawing is moved onto its dimensions (so that model and pixels still coincide):
    diagonals must really be inked end to end; dashed runs carry on to the frame line they visibly run up to."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    H, W = gray.shape
    ink = gray < m.get("ink_threshold", 180)
    core = gray < 150                                        # the dark heart of a stroke, not its blurred skirt
    keep = []
    for d_ in m.get("diagonals", []):
        ok = True
        for (x0, y0), (x1, y1) in zip(d_, d_[1:]):
            n_ = max(8, int(math.hypot(x1 - x0, y1 - y0)))
            xs = np.clip(np.rint(np.linspace(x0, x1, n_)).astype(int), 0, W - 1); ys = np.clip(np.rint(np.linspace(y0, y1, n_)).astype(int), 0, H - 1)
            k_ = slice(int(0.06 * n_), int(0.94 * n_))
            cov = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8))[ys[k_], xs[k_]].mean()
            if cov < 0.9:
                ok = False
            # a drawn diagonal is a lone stroke: clear paper on both sides of it (a 'diagonal' through hatching is not)
            L_ = math.hypot(x1 - x0, y1 - y0); nx_, ny_ = -(y1 - y0) / L_, (x1 - x0) / L_
            off = max(5.0, 0.3 * m["wall_thickness_px"])
            sides = []
            for sg_ in (-1, 1):
                sx = np.clip(np.rint(xs[k_] + sg_ * off * nx_).astype(int), 0, W - 1); sy = np.clip(np.rint(ys[k_] + sg_ * off * ny_).astype(int), 0, H - 1)
                sides.append(float(ink[sy, sx].mean()))
            if min(sides) > 0.5:                              # (one side may be the twin of a double line)
                ok = False
        if ok:
            keep.append(d_)
    m["diagonals"] = keep
    # what lies beside each line: white paper or a grey fill (double-line walls are often filled grey)
    for l in m["lines"]:
        if "dash" in l or l["b"] - l["a"] < 20:
            continue
        us = np.linspace(l["a"] + 0.15 * (l["b"] - l["a"]), l["b"] - 0.15 * (l["b"] - l["a"]), 15)
        sides = []
        for sg_ in (-1, 1):
            vals = []
            for off in (4, 5, 6):
                cc = int(round(l["c"] - 0.5 + sg_ * off))
                if l["o"] == "h":
                    vals.append(gray[np.clip(cc, 0, H - 1), np.clip(us.astype(int), 0, W - 1)])
                else:
                    vals.append(gray[np.clip(us.astype(int), 0, H - 1), np.clip(cc, 0, W - 1)])
            sides.append(float(np.median(np.max(np.array(vals), axis=0))))
        l["side_grey"] = [round(sides[0]), round(sides[1])]
    for l in m["lines"]:
        if "dash" not in l:
            continue
        period = float(sum(l["dash"])); o = l["o"]
        for end, sgn in (("a", -1), ("b", 1)):
            best = None
            for q in m["lines"]:
                if q["o"] == o or "dash" in q or not (q["a"] - 3 <= l["c"] <= q["b"] + 3):
                    continue
                d_ = (q["c"] - l[end]) * sgn
                if 2 <= d_ <= 4 * period and (best is None or d_ < best[0]):
                    best = (d_, q["c"])
            if best is None:
                continue
            lo, hi = sorted((l[end], best[1])); cc = int(round(l["c"] - 0.5))
            seg = ink[np.clip(cc, 0, H - 1), int(lo):int(hi)] if o == "h" else ink[int(lo):int(hi), np.clip(cc, 0, W - 1)]
            if seg.size >= 4 and 0.2 <= float(seg.mean()) <= 0.9:
                l[end] = float(best[1])


def window_bands(m):
    """Soft inputs, before rectification.  A window is drawn as a BAND: three or more parallel strokes (frame, glass, louvre
    dashes, sill) running between the same two jambs.  Traced stroke by stroke from a blurred image the members start and
    stop anywhere and dashed ones fall apart into crumbs.  Put back what a band is: every member runs from jamb to jamb, as
    a solid line when it is mostly inked and as a dashed line when it is not; jambs that are visibly inked are closed."""
    gray, scale = m.get("_gray"), m.get("mm_per_px")
    if gray is None or not scale or not m.get("soft_input"):
        return
    T = m["wall_thickness_px"]; H, W = gray.shape
    ink = gray < m.get("ink_threshold", 180)
    wmask = np.zeros((H, W), np.uint8)
    for w_ in m["walls"]:
        if not w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 255)
    wmask = cv2.dilate(wmask, np.ones((5, 5), np.uint8))
    on_dim = lambda l: any(abs((d["cy"] if l["o"] == "h" else d["cx"]) - l["c"]) <= 1.5 and l["a"] - 1.5 <= (d["cx"] if l["o"] == "h" else d["cy"]) <= l["b"] + 1.5 for d in m["dots"])
    dmax = 480.0 / scale
    report = []
    for o in ("h", "v"):
        def in_text(l):
            p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
            def inside(px, py):
                for t_ in m["texts"] + m.get("unread_text", []):
                    bx, by, bw, bh = t_["box"]; pd = 0.35 * min(bw, bh)
                    if bx - pd <= px <= bx + bw + pd and by - pd <= py <= by + bh + pd:
                        return True
                return False
            return inside(*p1) and inside(*p2) and inside((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)
        G = [l for l in m["lines"] if l["o"] == o and not on_dim(l) and (l["b"] - l["a"]) >= 0.8 * T and not in_text(l)]
        n = len(G); par = list(range(n))
        def find(i):
            while par[i] != i:
                par[i] = par[par[i]]; i = par[i]
            return i
        for i in range(n):
            for j in range(i + 1, n):
                a, b = G[i], G[j]
                if abs(a["c"] - b["c"]) > dmax:
                    continue
                ov = min(a["b"], b["b"]) - max(a["a"], b["a"])
                if abs(a["c"] - b["c"]) <= 2.5:
                    if ov >= -1.2 * T and (min(a["b"] - a["a"], b["b"] - b["a"]) <= 4.0 * T or ov > 0):
                        par[find(i)] = find(j)             # pieces of one broken stroke (not two walls in line across a gap)
                elif ov >= 0.5 * min(a["b"] - a["a"], b["b"] - b["a"]):
                    par[find(i)] = find(j)
        groups = {}
        for i in range(n):
            groups.setdefault(find(i), []).append(G[i])
        for grp in groups.values():
            cs = sorted(l["c"] for l in grp)
            levels = [[cs[0]]]
            for c in cs[1:]:
                if c - levels[-1][-1] <= 2.5:
                    levels[-1].append(c)
                else:
                    levels.append([c])
            if os.environ.get("FV_BANDS") and len(levels) >= 3:
                print("BAND?", o, [round(np.mean(c), 1) for c in levels], round(cs[-1] - cs[0]), [(round(l["a"]), round(l["b"])) for l in grp])
            if len(levels) < 3 or cs[-1] - cs[0] > 700.0 / scale:
                continue
            # the jambs: where most members start and where most end
            def mode(vals, wts):
                best = None
                for v in vals:
                    w_ = sum(wt for u, wt in zip(vals, wts) if abs(u - v) <= 0.5 * T)
                    if best is None or w_ > best[0]:
                        best = (w_, float(np.average([u for u in vals if abs(u - v) <= 0.5 * T], weights=[wt for u, wt in zip(vals, wts) if abs(u - v) <= 0.5 * T])))
                return best[1]
            wts = [(l["b"] - l["a"]) * (0.3 if "dash" in l else 1.0) for l in grp]      # the ends of a dashed run are the least certain
            A, B = mode([l["a"] for l in grp], wts), mode([l["b"] for l in grp], wts)
            if B - A < max(2.0 * T, 450.0 / scale) or B - A > 4500.0 / scale:
                continue
            members = [l for l in grp if (l["a"] >= A - 0.35 * (B - A) and l["b"] <= B + 0.35 * (B - A) and min(l["b"], B) - max(l["a"], A) > 0)
                       or ("dash" in l and min(l["b"], B) - max(l["a"], A) >= 0.5 * (B - A))]
            lv = []
            for c_grp in levels:
                ls = [l for l in members if c_grp[0] - 1e-6 <= l["c"] <= c_grp[-1] + 1e-6]
                if not ls:
                    continue
                span_ = sum(min(l["b"], B) - max(l["a"], A) for l in ls)
                broken = any("dash" in l for l in ls) or len(ls) >= 2
                # a member is a stroke that runs (nearly) from jamb to jamb, or a broken one (dashes).  One solid piece over
                # part of the stretch is something else lying beside the band - a door leaf against its wall - and is left alone
                if span_ >= 0.8 * (B - A) or (broken and span_ >= 0.2 * (B - A)):
                    lv.append(ls)
            n_broken = sum(1 for ls in lv if any("dash" in l for l in ls) or (len(ls) >= 2 and sum(l["b"] - l["a"] for l in ls) < 0.8 * (B - A)))
            if len(lv) < 3 or (n_broken == 0 and len(lv) < 4):
                continue
            members = [l for ls in lv for l in ls]
            dashes = [l["dash"] for l in members if "dash" in l]
            new_lines, extra = [], []
            for ls in lv:
                c = float(np.average([l["c"] for l in ls], weights=[l["b"] - l["a"] for l in ls]))
                # how much of the stretch is really inked along this level? (the traced pieces may be fewer than the ink)
                cc = int(round(c - 0.5)); xs = np.arange(int(A) + 2, int(B) - 1)
                if len(xs) < 4:
                    continue
                band = [ink[np.clip(cc + k, 0, H - 1), xs] if o == "h" else ink[xs, np.clip(cc + k, 0, W - 1)] for k in (-1, 0, 1)]
                cov = float(np.max(np.array(band), axis=0).mean())
                proto = dict(max(ls, key=lambda l: l["b"] - l["a"])); proto.pop("dash", None)
                proto.update({"c": c, "a": A, "b": B})
                if cov >= 0.8 and not all("dash" in l for l in ls):
                    # a member that runs on past the jamb to a wall face is the wall line the band sits in: it keeps that reach
                    for l in ls:
                        if "dash" in l:
                            continue
                        for e, jamb, sg in (("a", A, -1), ("b", B, 1)):
                            if (l[e] - jamb) * sg > 2.0:
                                xi, yi = (int(round(l[e] + sg * 2)), int(round(c))) if o == "h" else (int(round(c)), int(round(l[e] + sg * 2)))
                                if 0 <= xi < W and 0 <= yi < H and wmask[yi, xi]:
                                    proto[e] = l[e]
                    new_lines.append(proto)
                elif cov >= 0.25:
                    pieces = sorted((l["a"], l["b"]) for l in ls if "dash" not in l)
                    if dashes:
                        dash = list(dashes[0])
                    elif len(pieces) >= 2:
                        dl = float(np.median([b_ - a_ for a_, b_ in pieces])); gp = float(np.median([b2[0] - a2[1] for a2, b2 in zip(pieces, pieces[1:])]))
                        dash = [round(dl, 1), round(max(3.0, gp), 1)]
                    else:
                        dash = [round(0.9 * T, 1), round(0.5 * T, 1)]
                    proto["dash"] = dash
                    new_lines.append(proto)
            if len(new_lines) < 3:
                continue
            # what a member had beyond the jambs (a wall line running on past the window) stays, where it is really inked
            for ls in lv:
                c = float(np.average([l["c"] for l in ls], weights=[l["b"] - l["a"] for l in ls])); cc = int(round(c - 0.5))
                done_lv = next((q for q in new_lines if abs(q["c"] - c) <= 1e-6), None)
                for lo_, hi_ in ((min(l["a"] for l in ls), (done_lv or {"a": A})["a"]), ((done_lv or {"b": B})["b"], max(l["b"] for l in ls))):
                    if hi_ - lo_ <= 3.0:
                        continue
                    xs = np.arange(int(lo_) + 1, int(hi_))
                    if len(xs) < 2:
                        continue
                    band = [ink[np.clip(cc + k, 0, H - 1), xs] if o == "h" else ink[xs, np.clip(cc + k, 0, W - 1)] for k in (-1, 0, 1)]
                    if float(np.max(np.array(band), axis=0).mean()) >= 0.85:
                        proto = dict(max(ls, key=lambda l: l["b"] - l["a"])); proto.pop("dash", None)
                        proto.update({"c": c, "a": float(lo_), "b": float(hi_)})
                        extra.append(proto)
            ids = {id(l) for l in members}
            for l in grp:                                   # a neighbour's stroke on a member's level stops at the jamb
                if id(l) in ids or "dash" in l or not any(abs(l["c"] - q["c"]) <= 2.5 for q in new_lines):
                    continue
                if l["a"] < A < l["b"] and l["b"] - A <= 0.35 * (B - A):
                    l["b"] = A
                elif l["a"] < B < l["b"] and B - l["a"] <= 0.35 * (B - A):
                    l["a"] = B
            m["lines"] = [l for l in m["lines"] if id(l) not in ids] + new_lines + extra
            c0, c1 = new_lines[0]["c"], new_lines[-1]["c"]
            c0, c1 = min(l["c"] for l in new_lines), max(l["c"] for l in new_lines)
            for jx in (A, B):                                # jambs
                xi = int(round(jx - 0.5)); ys = np.arange(int(c0) + 1, int(c1))
                if len(ys) < 3:
                    continue
                col = [ink[ys, np.clip(xi + k, 0, W - 1)] if o == "h" else ink[np.clip(xi + k, 0, H - 1), ys] for k in (-2, -1, 0, 1, 2)]
                if float(np.max(np.array(col), axis=0).mean()) < 0.75:
                    continue
                inwall = wmask[int((c0 + c1) / 2), np.clip(xi, 0, W - 1)] if o == "h" else wmask[np.clip(xi, 0, H - 1), int((c0 + c1) / 2)]
                po = "v" if o == "h" else "h"
                have = any(l["o"] == po and abs(l["c"] - jx) <= 3.0 and min(l["b"], c1) - max(l["a"], c0) >= 0.6 * (c1 - c0) for l in m["lines"])
                if not inwall and not have:
                    m["lines"].append({"o": po, "c": float(jx), "a": float(c0), "b": float(c1), "t": 3.0, "w": m.get("stroke_px", 1.0)})
            report.append({"o": o, "from": round(A), "to": round(B), "levels": len(new_lines), "dashed": sum(1 for l in new_lines if "dash" in l)})
    if report:
        m.setdefault("dimension_report", {})["window_bands"] = report


def arc_radii(a_):
    """(rx, ry) of a swing: equal for a true quarter circle; a swing drawn flatter than its leaf is a quarter ellipse."""
    return a_.get("rx", a_["r"]), a_.get("ry", a_["r"])


def set_arc_radius(a_, horizontal, val):
    if "rx" in a_ or "ry" in a_:
        a_["rx" if horizontal else "ry"] = float(val)
        a_["r"] = (a_.get("rx", a_["r"]) + a_.get("ry", a_["r"])) / 2.0
    else:
        a_["r"] = float(val)


def arc_point(a_, ang_deg):
    rx, ry = arc_radii(a_)
    return a_["cx"] + rx * math.cos(math.radians(ang_deg)), a_["cy"] + ry * math.sin(math.radians(ang_deg))


def mirror_swings(m):
    """Soft inputs, before rectification.  A leaf that swings both ways draws two quarter circles about ONE hinge with ONE
    radius.  Where a note stands inside one of them the vote settles on a wrong circle; the clean twin says what it must be."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    H, W = gray.shape; T = m["wall_thickness_px"]
    ink = cv2.dilate((gray < m.get("ink_threshold", 180)).astype(np.uint8), np.ones((3, 3), np.uint8))
    def cov(cx, cy, r, st):
        t = np.radians(np.linspace(st + 5, st + 85, 60))
        px = np.clip(np.rint(cx + r * np.cos(t)).astype(int), 0, W - 1); py = np.clip(np.rint(cy + r * np.sin(t)).astype(int), 0, H - 1)
        return float(ink[py, px].mean())
    def leaf_of(a_):
        out_ = []
        for ang in (a_["start"], a_["start"] + 90.0):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"; h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); sg = dx or dy
            lo, hi = sorted((h0, h0 + sg * a_["r"]))
            for l in m["lines"]:
                if l["o"] == o_ and abs(l["c"] - hc) <= 0.3 * T and min(l["b"], hi) - max(l["a"], lo) >= 0.7 * a_["r"]:
                    out_.append((l, (dx, dy))); break
        return out_
    def cov_e(cx, cy, rx, ry, st):
        t = np.radians(np.linspace(st + 5, st + 85, 60))
        px = np.clip(np.rint(cx + rx * np.cos(t)).astype(int), 0, W - 1); py = np.clip(np.rint(cy + ry * np.sin(t)).astype(int), 0, H - 1)
        return float(ink[py, px].mean())
    def has_leaf(a_):
        for ang in (a_["start"], a_["start"] + 90.0):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"; h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); sg = dx or dy
            lo, hi = sorted((h0, h0 + sg * a_["r"]))
            if any(l["o"] == o_ and abs(l["c"] - hc) <= 0.3 * T and min(l["b"], hi) - max(l["a"], lo) >= 0.7 * a_["r"] for l in m["lines"]):
                return True
        return False
    qa = [a_ for a_ in m["arcs"] if abs(a_["span"] - 90.0) <= 0.5]
    for a_ in qa:                                            # the hinge lies on the leaf and on the threshold
        for l, d_ in leaf_of(a_):
            if d_[0]:
                a_["cy"] = l["c"]
            else:
                a_["cx"] = l["c"]
    # the narrow leaf of a one-and-a-half door: hinged on the same threshold, one big radius plus its own small radius away,
    # swinging both ways like the big one.  Too small for the swing vote; looked for exactly where it has to be.
    def ring(cx, cy, r, st):
        return cov(cx, cy, r, st)
    for ref in list(qa):
        if not leaf_of(ref):
            continue
        twin = [b_ for b_ in qa if b_ is not ref and math.hypot(b_["cx"] - ref["cx"], b_["cy"] - ref["cy"]) <= 2.0 * T and abs((b_["start"] - ref["start"]) % 360 - 180) >= 1
                and abs((b_["start"] - ref["start"]) % 360) >= 1]
        if not twin:
            continue
        for ang in (ref["start"], ref["start"] + 90.0):     # the closed position: the radial edge that is not the leaf
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            best = None
            for r2 in np.arange(0.6 * T, 2.0 * T, 1.0):
                for jit in range(-9, 10):
                    cx2, cy2 = ref["cx"] + dx * (ref["r"] + r2 + jit), ref["cy"] + dy * (ref["r"] + r2 + jit)
                    back = math.degrees(math.atan2(-dy, -dx)) % 360
                    c1, c2 = ring(cx2, cy2, r2, back), ring(cx2, cy2, r2, back - 90.0)
                    sc = min(c1, c2)
                    if sc >= 0.85 and max(ring(cx2, cy2, r2 + 6, back), ring(cx2, cy2, r2 - 6, back)) < 0.5 and (best is None or sc > best[0]):
                        best = (sc, cx2, cy2, float(r2), back)
            if best is None:
                continue
            sc, cx2, cy2, r2, back = best
            if any(math.hypot(b_["cx"] - cx2, b_["cy"] - cy2) <= 0.6 * T and abs(b_["r"] - r2) <= 0.4 * r2 for b_ in m["arcs"]):
                continue
            for st in (back, back - 90.0):
                m["arcs"].append({"cx": float(cx2), "cy": float(cy2), "r": r2, "start": float(st % 360), "span": 90.0, "from": "narrow-leaf"})
            o2 = "v" if dx else "h"
            if o2 == "v":
                m["lines"].append({"o": "v", "c": float(cx2), "a": float(cy2 - r2), "b": float(cy2 + r2), "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "narrow-leaf"})
            else:
                m["lines"].append({"o": "h", "c": float(cy2), "a": float(cx2 - r2), "b": float(cx2 + r2), "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "narrow-leaf"})
    qa = [a_ for a_ in m["arcs"] if abs(a_["span"] - 90.0) <= 0.5 and a_.get("from") != "narrow-leaf"]
    for ref in qa:
        if not has_leaf(ref):
            continue
        for b_ in qa:
            if b_ is ref or math.hypot(b_["cx"] - ref["cx"], b_["cy"] - ref["cy"]) > 2.0 * T or abs((b_["start"] - ref["start"]) % 360 - 180) < 1:
                continue
            if abs((b_["start"] - ref["start"]) % 360) < 1 or (abs(b_["r"] - ref["r"]) <= 0.06 * ref["r"] and math.hypot(b_["cx"] - ref["cx"], b_["cy"] - ref["cy"]) <= 2.0):
                continue
            if has_leaf(b_) and abs(b_["r"] - ref["r"]) > 0.25 * ref["r"]:
                continue                                    # a different door that happens to hinge close by
            c_old = cov(b_["cx"], b_["cy"], b_["r"], b_["start"])
            rr_ = np.arange(0.86 * ref["r"], 1.2 * ref["r"], 2.0)
            c_new, r_new = max((cov_e(ref["cx"], ref["cy"], rx, ry, b_["start"]), (rx + ry) / 2.0) for rx in rr_ for ry in rr_)
            if cov(ref["cx"], ref["cy"], ref["r"], b_["start"]) >= c_new - 0.05:
                r_new = ref["r"]                            # the same radius when the pixels allow it
            if c_new >= 0.7 and c_new >= c_old - 0.12:
                b_["cx"], b_["cy"], b_["r"] = ref["cx"], ref["cy"], float(r_new); b_["mirrored"] = True


def swing_shapes(m):
    """Soft inputs, before rectification.  A swing starts at the tip of its leaf and ends on the threshold.  Hand-set brochure
    swings are often not true circles about the hinge (the leaf is longer than the reach along the threshold): with the hinge
    fixed where leaf and threshold meet, fit the two radii to the pixels and keep a quarter ellipse where that is what is drawn."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    H, W = gray.shape; T = m["wall_thickness_px"]
    g_ = cv2.GaussianBlur(gray, (0, 0), 1.2).astype(np.float32)
    def dark(cx, cy, rx, ry, st):
        t = np.radians(np.linspace(st + 8, st + 82, 60))
        px = np.clip(np.rint(cx + rx * np.cos(t)).astype(int), 0, W - 1); py = np.clip(np.rint(cy + ry * np.sin(t)).astype(int), 0, H - 1)
        return float(g_[py, px].mean())
    for a_ in m["arcs"]:
        if abs(a_["span"] - 90.0) > 0.5 or a_.get("from") in ("narrow-leaf", "angle-note", "double-swing-leaf") or a_["r"] < 2.0 * T:
            continue
        along = {}                                          # lines through the hinge along the two radial directions
        for ang in (a_["start"], a_["start"] + 90.0):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"; h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); sg = dx or dy
            for l in m["lines"]:
                if l["o"] == o_ and "dash" not in l and abs(l["c"] - hc) <= 2.5 and l["a"] - 0.3 * T <= h0 <= l["b"] + 0.3 * T:
                    Lb = (l["b"] - h0) if sg > 0 else (h0 - l["a"])
                    if Lb >= 0.5 * a_["r"]:
                        along[bool(dx)] = float(Lb)
        if not along:
            continue
        base = dark(a_["cx"], a_["cy"], a_["r"], a_["r"], a_["start"])
        rs = np.arange(0.85 * a_["r"], 1.25 * a_["r"] + 0.5, 1.0)
        best = min(((dark(a_["cx"], a_["cy"], rx, ry, a_["start"]), float(rx), float(ry)) for rx in rs for ry in rs), key=lambda v: v[0])
        if best[0] > base - 10:
            continue
        rx, ry = best[1], best[2]
        if True in along and abs(along[True] - rx) <= 0.05 * rx:
            rx = along[True]                                # the swing starts at the tip of the leaf
        if False in along and abs(along[False] - ry) <= 0.05 * ry:
            ry = along[False]
        if abs(rx - ry) <= 0.06 * max(rx, ry):
            a_["r"] = (rx + ry) / 2.0; a_.pop("rx", None); a_.pop("ry", None)
        else:
            a_["rx"], a_["ry"], a_["r"] = float(rx), float(ry), (rx + ry) / 2.0


def swing_leaves(m):
    """Soft inputs, before rectification.  Every swing has a leaf: the straight stroke from the hinge to where the arc starts.
    Where the tracer lost it (a short stroke beside a frame) and the pixels show it, draw it."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    H, W = gray.shape; T = m["wall_thickness_px"]
    ink = cv2.dilate((gray < m.get("ink_threshold", 180)).astype(np.uint8), np.ones((3, 3), np.uint8))
    for a_ in m["arcs"]:
        if abs(a_["span"] - 90.0) > 0.5:
            continue
        found, cands = False, []
        for ang in (a_["start"], a_["start"] + 90.0):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"
            h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); sg = dx or dy
            lo, hi = sorted((h0, h0 + sg * a_["r"]))
            have = [l for l in m["lines"] if l["o"] == o_ and abs(l["c"] - hc) <= 2.0 and min(l["b"], hi) - max(l["a"], lo) >= 0.85 * a_["r"]]   # a leaf is as long as a leaf: a window jamb beside the hinge is not one
            if have:
                found = True
                l = max(have, key=lambda q: min(q["b"], hi) - max(q["a"], lo))
                tip = h0 + sg * a_["r"]
                gap = (tip - l["b"]) if sg > 0 else (l["a"] - tip)       # the leaf stops short of where its swing starts
                if 2.0 < gap <= 0.5 * a_["r"] and "dash" not in l:
                    ts = np.linspace(l["b"] if sg > 0 else tip, tip if sg > 0 else l["a"], max(4, int(gap)))
                    px, py = (ts, np.full(len(ts), l["c"])) if dx else (np.full(len(ts), l["c"]), ts)
                    if float(ink[np.clip(np.rint(py).astype(int), 0, H - 1), np.clip(np.rint(px).astype(int), 0, W - 1)].mean()) >= 0.8:
                        l["b" if sg > 0 else "a"] = float(tip)
                continue
            n_ = max(6, int(a_["r"]))
            ts = np.linspace(0.12, 0.92, n_) * a_["r"] * sg + h0
            for off in (0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5):      # the voted hinge can sit a few px off the leaf
                px, py = (ts, np.full(n_, hc + off)) if dx else (np.full(n_, hc + off), ts)
                cov = float((gray[np.clip(np.rint(py).astype(int), 0, H - 1), np.clip(np.rint(px).astype(int), 0, W - 1)] < 150).mean())
                cands.append((cov - 0.01 * abs(off), o_, hc + off, lo, hi, bool(dx)))
        if cands:
            cov, o_, hc, lo, hi, horiz = max(cands)
            if cov >= 0.85 and (not found or len({c_[5] for c_ in cands}) == 1):
                m["lines"].append({"o": o_, "c": float(hc), "a": float(lo), "b": float(hi), "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "swing-leaf"})
                if horiz:
                    a_["cy"] = float(hc)
                else:
                    a_["cx"] = float(hc)


def close_open_ends(m):
    """Soft inputs, before rectification.  A stroke that ends in mid-air, while the ink visibly turns the corner there and runs
    on to a wall or another stroke close by, lost that short closing piece to the tracer (shorter than any line it looks
    for).  Follow the ink and draw it."""
    gray = m.get("_gray")
    if gray is None or not m.get("soft_input"):
        return
    H, W = gray.shape; T = m["wall_thickness_px"]
    ink = cv2.dilate((gray < m.get("ink_threshold", 180)).astype(np.uint8), np.ones((3, 3), np.uint8))
    wmask = np.zeros((H, W), np.uint8)
    for w_ in m["walls"] + m.get("grey_solids", []):
        if not w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 255)
    wnear = cv2.dilate(wmask, np.ones((5, 5), np.uint8))
    on_dim = lambda l: any(abs((d["cy"] if l["o"] == "h" else d["cx"]) - l["c"]) <= 1.5 and l["a"] - 1.5 <= (d["cx"] if l["o"] == "h" else d["cy"]) <= l["b"] + 1.5 for d in m["dots"])
    def line_at(x_, y_, me, tol=1.6):
        for l in m["lines"]:
            if l is me:
                continue
            if l["o"] == "h" and abs(l["c"] - y_) <= tol and l["a"] - tol <= x_ <= l["b"] + tol:
                return True
            if l["o"] == "v" and abs(l["c"] - x_) <= tol and l["a"] - tol <= y_ <= l["b"] + tol:
                return True
        return False
    anchors = [(a_["cx"] + a_["r"] * math.cos(math.radians(g_)), a_["cy"] + a_["r"] * math.sin(math.radians(g_))) for a_ in m["arcs"] for g_ in (a_["start"], a_["start"] + a_["span"])]
    anchors += [(a_["cx"], a_["cy"]) for a_ in m["arcs"]]
    added = []
    for l in list(m["lines"]):
        if "dash" in l or on_dim(l) or (l["b"] - l["a"]) < 1.0 * T:
            continue
        for e in ("a", "b"):
            x_, y_ = (l[e], l["c"]) if l["o"] == "h" else (l["c"], l[e])
            xi, yi = int(round(x_)), int(round(y_))
            if not (0 <= xi < W and 0 <= yi < H) or wnear[yi, xi] or line_at(x_, y_, l) or any(math.hypot(px - x_, py - y_) <= 4 for px, py in anchors):
                continue
            done = False
            for back in range(0, int(0.5 * T) + 1):          # the traced end may overshoot the corner by a few px
                bx_, by_ = (x_ - back * (1 if e == "b" else -1), y_) if l["o"] == "h" else (x_, y_ - back * (1 if e == "b" else -1))
                for sg in (-1, 1):
                    miss, reach = 0, None
                    for step in range(2, int(2.5 * T)):
                        xx, yy = (bx_, by_ + sg * step) if l["o"] == "h" else (bx_ + sg * step, by_)
                        xj, yj = int(round(xx)), int(round(yy))
                        if not (0 <= xj < W and 0 <= yj < H):
                            break
                        if wmask[yj, xj] or (step >= 3 and line_at(xx, yy, l, 1.2)):
                            reach = step; break
                        if not ink[yj, xj]:
                            miss += 1
                            if miss > 1:
                                break
                    if reach and reach >= 3:
                        a_, b_ = sorted(((by_ if l["o"] == "h" else bx_), (by_ if l["o"] == "h" else bx_) + sg * reach))
                        po_, pc_ = ("v" if l["o"] == "h" else "h"), (bx_ if l["o"] == "h" else by_)
                        twin_ = [q for q in m["lines"] if q["o"] == po_ and "dash" not in q and abs(q["c"] - pc_) <= max(4.0, 0.35 * T)
                                 and min(q["b"], b_) - max(q["a"], a_) >= 0.5 * (b_ - a_)]
                        if twin_:                           # the ink being followed IS that line: the end merely overshoots it
                            l[e] = float(min(twin_, key=lambda q: abs(q["c"] - pc_))["c"])
                            done = True; break
                        m["lines"].append({"o": "v" if l["o"] == "h" else "h", "c": float(bx_ if l["o"] == "h" else by_), "a": float(a_), "b": float(b_),
                                           "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "closing-piece"})
                        l[e] = float(bx_ if l["o"] == "h" else by_)
                        added.append((round(bx_), round(by_)))
                        done = True; break
                if done:
                    break
    if added:
        m.setdefault("dimension_report", {})["closing_pieces"] = len(added)


def tidy_soft(m):
    """Soft inputs, last pass: what is left of blurred small detail after lines, arcs, symbols and text have been taken is not
    drawing but crumbs. Keep a traced leftover only when it is a real, smooth shape; drop stubs that touch nothing."""
    scale = m.get("mm_per_px")
    if not m.get("soft_input") or not scale:
        return
    T = m["wall_thickness_px"]
    def flen(p_):
        pts = _sample_fixture(p_)
        return float(np.hypot(*np.diff(np.array(pts), axis=0).T).sum()) if len(pts) > 1 else 0.0
    # 'soft' covers two different things: a BLURRED image, where a free-form leftover is a wobble, and a crisp image that was
    # only enlarged because its walls are thin - there a free-form path is furniture, a basin, a plant, and is the drawing
    crisp = float(m.get("edge_softness", 9.9)) <= 1.4 or float(m.get("pre_scale", 1.0)) < 1.0      # (a bold scan brought DOWN in size is super-sampled: its traces are good)
    keep = []
    for p_ in m["fixtures"]:
        if crisp and p_.get("type") not in ("circle", "ellipse"):
            if flen(p_) * scale >= 60:
                keep.append(p_)
            continue
        if p_.get("type") in ("circle", "ellipse"):
            if min(p_.get("r", 1e9), p_.get("rx", 1e9), p_.get("ry", 1e9)) * scale >= 60:
                keep.append(p_)
            continue
        ln = flen(p_)
        if ln * scale < 300 or len(p_.get("segs", [])) > max(2, ln / (1.0 * T)):
            continue
        if not p_.get("closed"):
            # an open leftover is drawn only as what it can be named: a circular arc or a straight stroke.  A free-hand trace
            # of a blurred stroke is a wobble, not drawing.
            sp_ = np.array(_sample_fixture(p_), float)
            chord = float(np.hypot(*(sp_[-1] - sp_[0])))
            if chord > 1e-6:
                dev = np.abs((sp_[:, 0] - sp_[0, 0]) * (sp_[-1, 1] - sp_[0, 1]) - (sp_[:, 1] - sp_[0, 1]) * (sp_[-1, 0] - sp_[0, 0])) / chord
                if dev.max() <= 2.0 and chord * scale >= 350:
                    a_, b_ = sp_[0], sp_[-1]
                    if abs(a_[1] - b_[1]) <= 2.5:
                        m["lines"].append({"o": "h", "c": float((a_[1] + b_[1]) / 2), "a": float(min(a_[0], b_[0])), "b": float(max(a_[0], b_[0])), "t": 3.0, "w": m["stroke_px"]})
                    elif abs(a_[0] - b_[0]) <= 2.5:
                        m["lines"].append({"o": "v", "c": float((a_[0] + b_[0]) / 2), "a": float(min(a_[1], b_[1])), "b": float(max(a_[1], b_[1])), "t": 3.0, "w": m["stroke_px"]})
                    else:
                        m.setdefault("diagonals", []).append([[float(a_[0]), float(a_[1])], [float(b_[0]), float(b_[1])]])
                    continue
            if len(sp_) >= 12:
                try:
                    cx_, cy_, r_ = fit_circle(sp_)
                    res = float(np.sqrt(np.mean((np.hypot(sp_[:, 0] - cx_, sp_[:, 1] - cy_) - r_) ** 2)))
                    st_, span_ = angular_span(sp_, cx_, cy_)
                    sag_ = r_ - math.sqrt(max(0.0, r_ ** 2 - (chord / 2.0) ** 2)) if chord < 2 * r_ else r_
                    if res <= 1.0 and ln * scale >= 1500 and sag_ >= max(4.0, 0.01 * ln) and span_ <= 200 and \
                            not any(a_.get("from") == "curve" and math.hypot(a_["cx"] - cx_, a_["cy"] - cy_) <= 3 and abs(a_["r"] - r_) <= 3 for a_ in m["arcs"]):
                        # a long, clean circular curve that is no door swing: a curved balcony front, a bay
                        m["arcs"].append({"cx": float(cx_), "cy": float(cy_), "r": float(r_), "start": float(st_ % 360), "span": float(span_), "from": "curve"})
                        continue
                    if any(math.hypot(a_["cx"] - cx_, a_["cy"] - cy_) <= 0.6 * T and abs(a_["r"] - r_) <= 0.25 * r_ for a_ in m["arcs"]):
                        continue                            # this swing is drawn already
                    if res <= 1.2 and 350 <= r_ * scale <= 1300 and 60 <= span_ <= 200:
                        for q_ in (90.0, 180.0):               # a swing is a quarter (or a half) circle
                            if abs(span_ - q_) <= 14 and min(abs(st_ % 90), 90 - abs(st_ % 90)) <= 10:
                                st_, span_ = round(st_ / 90.0) * 90.0, q_
                        m["arcs"].append({"cx": float(cx_), "cy": float(cy_), "r": float(r_), "start": float(st_ % 360), "span": float(span_), "from": "leftover"})
                        continue
                except Exception:
                    pass
            continue
        keep.append(p_)
    m["fixtures"] = keep
    m["fixture_solids"] = []
    # where a long curve comes in tangent to a wall its last stretch is flat enough to have been traced as a straight line:
    # that line IS the curve, which runs on to where the line ended
    for a_ in [a_ for a_ in m["arcs"] if a_.get("from") == "curve"]:
        cx_, cy_, r_ = a_["cx"], a_["cy"], a_["r"]
        for l in list(m["lines"]):
            if "dash" in l or (l["b"] - l["a"]) > 0.25 * r_:
                continue
            P_ = [(l["a"], l["c"]), (l["b"], l["c"])] if l["o"] == "h" else [(l["c"], l["a"]), (l["c"], l["b"])]
            dv_ = [abs(math.hypot(x_ - cx_, y_ - cy_) - r_) for x_, y_ in P_]
            an_ = [(math.degrees(math.atan2(y_ - cy_, x_ - cx_)) - a_["start"]) % 360 for x_, y_ in P_]
            an_ = [v_ - 360 if v_ > 180 + a_["span"] / 2.0 else v_ for v_ in an_]            # angle from the start of the arc, signed
            ins_ = [-1.0 <= v_ <= a_["span"] + 1.0 for v_ in an_]
            gap_ = min(min(abs(v_), abs(v_ - a_["span"])) for v_ in an_) if not any(ins_) else 0.0
            if max(dv_) > 5.0 or min(dv_) > 2.5 or math.radians(gap_) * r_ > 0.5 * T:
                continue
            far_ = [v_ for v_, i_ in zip(an_, ins_) if not i_]
            if not far_ or dv_[an_.index(far_[0])] > 2.5:
                continue                                    # a line inside the curve's sweep is something else (a chord, a rail)
            lo_, hi_ = min([0.0] + far_), max([a_["span"]] + far_)
            a_["start"], a_["span"] = (a_["start"] + lo_) % 360, hi_ - lo_
            m["lines"] = [q for q in m["lines"] if q is not l]
    # what is left of a note that is now live text (the strokes between its two lines, its level arrow) goes with it
    for zx0, zy0, zx1, zy1 in m.get("note_zones", []):
        pd = 0.3 * min(zx1 - zx0, zy1 - zy0)
        inz = lambda x_, y_, zx0=zx0, zy0=zy0, zx1=zx1, zy1=zy1, pd=pd: zx0 - pd <= x_ <= zx1 + pd and zy0 - pd <= y_ <= zy1 + pd
        core = lambda x_, y_, zx0=zx0, zy0=zy0, zx1=zx1, zy1=zy1: zx0 - 2 <= x_ <= zx1 + 2 and zy0 - 2 <= y_ <= zy1 + 2
        def l_in(l):                                        # both ends by the note and its middle inside it (the threshold beside a note is not)
            p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
            return inz(*p1) and inz(*p2) and core((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)
        m["lines"] = [l for l in m["lines"] if not l_in(l)]
        m["diagonals"] = [d_ for d_ in m.get("diagonals", []) if not (inz(*d_[0]) and inz(*d_[-1]))]
        m["arcs"] = [a_ for a_ in m["arcs"] if not (a_["r"] * scale < 450 and inz(a_["cx"], a_["cy"]) and inz(a_["cx"] + a_["r"] * math.cos(math.radians(a_["start"] + a_["span"] / 2.0)),
                                                                                       a_["cy"] + a_["r"] * math.sin(math.radians(a_["start"] + a_["span"] / 2.0))))]
    # short diagonal strokes in a row, evenly spaced, are ONE dashed diagonal line (a raised-ceiling cross, a hidden edge)
    dg_ = [d_ for d_ in m.get("diagonals", []) if len(d_) == 2]
    used_d, dashed_d = set(), []
    for i_, a_ in enumerate(dg_):
        if i_ in used_d:
            continue
        (ax, ay), (bx, by) = a_; La = math.hypot(bx - ax, by - ay)
        if La < 6 or La * scale > 700:
            continue
        ux, uy = (bx - ax) / La, (by - ay) / La
        row = [(0.0, La, i_)]
        for j_, b_ in enumerate(dg_):
            if j_ == i_ or j_ in used_d:
                continue
            ts_ = [(q_[0] - ax) * ux + (q_[1] - ay) * uy for q_ in b_]; off_ = [abs((q_[0] - ax) * -uy + (q_[1] - ay) * ux) for q_ in b_]
            Lb = abs(ts_[1] - ts_[0])
            if max(off_) <= 3.0 and 0.5 * La <= Lb <= 2.0 * La:
                row.append((min(ts_), max(ts_), j_))
        row.sort()
        # keep the longest run with gaps no longer than two dashes
        runs, cur = [], [row[0]]
        for r_ in row[1:]:
            if 0 < r_[0] - cur[-1][1] <= 2.0 * La:
                cur.append(r_)
            else:
                runs.append(cur); cur = [r_]
        runs.append(cur)
        best = max(runs, key=len)
        if len(best) >= 3 and any(r_[2] == i_ for r_ in best):
            t0, t1 = best[0][0], best[-1][1]
            dl = float(np.median([r_[1] - r_[0] for r_ in best])); gp = float(np.median([b2[0] - b1[1] for b1, b2 in zip(best, best[1:])]))
            dashed_d.append({"p": [ax + ux * t0, ay + uy * t0], "q": [ax + ux * t1, ay + uy * t1], "dash": [round(dl, 1), round(max(2.0, gp), 1)]})
            used_d.update(r_[2] for r_ in best)
    if dashed_d:
        m["dashed_diagonals"] = dashed_d
        m["diagonals"] = [d_ for k_, d_ in enumerate(dg_) if k_ not in used_d] + [d_ for d_ in m.get("diagonals", []) if len(d_) != 2]
    m["diagonals"] = [d_ for d_ in m.get("diagonals", []) if math.hypot(d_[0][0] - d_[-1][0], d_[0][1] - d_[-1][1]) * scale >= (60 if crisp else 350)]
    # stubs: a short line both of whose ends are free (no line, wall, arc end or dot within reach) explains nothing
    ends = []
    for l in m["lines"]:
        ends.append(l)
    def touches(x_, y_, me):
        for l in m["lines"]:
            if l is me:
                continue
            if l["o"] == "h" and abs(l["c"] - y_) <= 4 and l["a"] - 4 <= x_ <= l["b"] + 4:
                return True
            if l["o"] == "v" and abs(l["c"] - x_) <= 4 and l["a"] - 4 <= y_ <= l["b"] + 4:
                return True
        for w_ in m["walls"] + m.get("grey_solids", []):
            xs_ = [q[0] for q in w_["pts"]]; ys_ = [q[1] for q in w_["pts"]]
            if min(xs_) - 4 <= x_ <= max(xs_) + 4 and min(ys_) - 4 <= y_ <= max(ys_) + 4:
                return True
        for a_ in m["arcs"]:
            for ang in (a_["start"], a_["start"] + a_["span"]):
                if math.hypot(a_["cx"] + a_["r"] * math.cos(math.radians(ang)) - x_, a_["cy"] + a_["r"] * math.sin(math.radians(ang)) - y_) <= 6:
                    return True
            if math.hypot(a_["cx"] - x_, a_["cy"] - y_) <= 6:
                return True
        for d_ in m.get("leaders", []):                     # the foot of a slanted leader
            if any(math.hypot(q_[0] - x_, q_[1] - y_) <= 6 for q_ in (d_[0], d_[-1])):
                return True
        return False
    # a stack of short parallel strokes, none of them tied into the drawing, is the wreck of a rotated note ('100 DROP')
    def tied(l):                                            # an end on a wall, a swing, or a line that is not itself a short stroke
        for e_ in ("a", "b"):
            x_, y_ = (l[e_], l["c"]) if l["o"] == "h" else (l["c"], l[e_])
            for q in m["lines"]:
                if q is l or (q["b"] - q["a"]) * scale < 650:
                    continue
                if q["o"] == "h" and abs(q["c"] - y_) <= 4 and q["a"] - 4 <= x_ <= q["b"] + 4:
                    return True
                if q["o"] == "v" and abs(q["c"] - x_) <= 4 and q["a"] - 4 <= y_ <= q["b"] + 4:
                    return True
        return False
    short_ = [l for l in m["lines"] if "dash" not in l and (l["b"] - l["a"]) * scale < 650 and not tied(l)]
    wreck = set()
    for l in short_:
        nb = [q for q in short_ if q is not l and q["o"] == l["o"] and 3 <= abs(q["c"] - l["c"]) <= 320.0 / scale
              and min(q["b"], l["b"]) - max(q["a"], l["a"]) >= 0.5 * min(q["b"] - q["a"], l["b"] - l["a"])]
        if len(nb) >= 3:
            wreck.add(id(l)); wreck.update(id(q) for q in nb)
    if not crisp:
        m["lines"] = [l for l in m["lines"] if id(l) not in wreck]
    out = []
    for l in m["lines"]:
        if crisp or "dash" in l or (l["b"] - l["a"]) * scale >= 200:
            out.append(l); continue
        p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
        if touches(p1[0], p1[1], l) or touches(p2[0], p2[1], l):
            out.append(l)
    m["lines"] = out


def partition_network(m):
    """Soft inputs: thin walls are drawn as two parallel lines ~100 mm apart. Traced line by line, their corners and T-junctions
    come out ragged (ends a few px long or short, lines running through a junction). Rebuild them as what they are: each pair
    becomes a rectangle, the rectangles are united, and the outline of the union is drawn - closed ends at door jambs, clean
    L- and T-junctions, nothing crossing inside a wall."""
    scale = m.get("mm_per_px")
    if not m.get("soft_input") or not scale:
        return
    dmin, dmax = 60.0 / scale, 210.0 / scale
    def is_leaf(l):                                         # the leaf of a swing: from the hinge, one radius long, along a radial edge
        for a_ in m["arcs"]:
            if abs(a_["span"] - 90.0) > 0.5:
                continue
            for ang in (a_["start"], a_["start"] + 90.0):
                dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
                if abs(dx) + abs(dy) != 1 or ("h" if dx else "v") != l["o"]:
                    continue
                h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); sg = dx or dy
                lo, hi = sorted((h0, h0 + sg * a_["r"]))
                if abs(l["c"] - hc) <= 3.0 and abs(l["a"] - lo) <= 0.3 * a_["r"] and abs(l["b"] - hi) <= 0.3 * a_["r"]:
                    return True
        return False
    L = [l for l in m["lines"] if "dash" not in l and l.get("role") not in ("dimension", "extension") and not is_leaf(l)]
    pairs = []
    for o in ("h", "v"):
        G = sorted([l for l in L if l["o"] == o], key=lambda l: l["c"])
        for i, l1 in enumerate(G):
            for l2 in G[i + 1:]:
                d = l2["c"] - l1["c"]
                if d > dmax:
                    break
                if d < dmin:
                    continue
                ov = min(l1["b"], l2["b"]) - max(l1["a"], l2["a"])
                if ov >= max(3 * d, 300.0 / scale):
                    pairs.append((l1, l2))
    # bundles (window frames: three or more parallel lines over the same stretch) are not walls: a line may have several
    # partners only one after the other along its length (a long face opposite two shorter ones at a T-junction)
    def span(pr):
        return max(pr[0]["a"], pr[1]["a"]), min(pr[0]["b"], pr[1]["b"])
    bad = set()
    for i_, p1 in enumerate(pairs):
        for p2 in pairs[i_ + 1:]:
            if not ({id(p1[0]), id(p1[1])} & {id(p2[0]), id(p2[1])}):
                continue
            (a1, b1), (a2, b2) = span(p1), span(p2)
            if min(b1, b2) - max(a1, a2) > 0.25 * min(b1 - a1, b2 - a2):
                # how much of a wall is each? (length of the common run over the spacing) - a real bundle has equals
                q1 = (b1 - a1) / (p1[1]["c"] - p1[0]["c"]); q2 = (b2 - a2) / (p2[1]["c"] - p2[0]["c"])
                if q1 >= 2.0 * q2:
                    bad.add(id(p2))
                elif q2 >= 2.0 * q1:
                    bad.add(id(p1))
                else:
                    bad.add(id(p1)); bad.add(id(p2))
    pairs = [pr for pr in pairs if id(pr) not in bad]
    # ... and so does a pair with a third parallel line running between or right beside it
    def crowded(l1, l2):
        d = l2["c"] - l1["c"]
        for q in L:
            if q is l1 or q is l2 or q["o"] != l1["o"]:
                continue
            if l1["c"] - 0.8 * d < q["c"] < l2["c"] + 0.8 * d and min(q["b"], l1["b"], l2["b"]) - max(q["a"], l1["a"], l2["a"]) >= 0.5 * (min(l1["b"], l2["b"]) - max(l1["a"], l2["a"])):
                return True
        return False
    pairs = [pr for pr in pairs if not crowded(*pr)]
    # grey bars are thin walls as well (a lightweight wall or a parapet drawn as two faces with a grey fill, a window band):
    # they join the same network, so they get the same clean faces, corners and T-junctions
    gbars, rest_g = [], []
    for g_ in m.get("grey_solids", []):
        P_ = g_["pts"]
        if any(min(abs(P_[i][0] - P_[i - 1][0]), abs(P_[i][1] - P_[i - 1][1])) > 0.5 for i in range(len(P_))):
            rest_g.append(g_); continue                     # not rectilinear (a 45-degree wall)
        gx = sorted({round(p_[0], 2) for p_ in P_}); gy = sorted({round(p_[1], 2) for p_ in P_})
        cnt_ = np.array(P_, np.float32)
        fill_ = np.array([[cv2.pointPolygonTest(cnt_, ((gx[i] + gx[i + 1]) / 2.0, (gy[j] + gy[j + 1]) / 2.0), False) > 0
                           for i in range(len(gx) - 1)] for j in range(len(gy) - 1)], bool)
        mr = []                                             # maximal rectangles of the cell grid
        nJ_, nI_ = fill_.shape
        for j0 in range(nJ_):
            for j1 in range(j0 + 1, nJ_ + 1):
                for i0 in range(nI_):
                    for i1 in range(i0 + 1, nI_ + 1):
                        if not fill_[j0:j1, i0:i1].all():
                            continue
                        if (j0 > 0 and fill_[j0 - 1, i0:i1].all()) or (j1 < nJ_ and fill_[j1, i0:i1].all()) or \
                                (i0 > 0 and fill_[j0:j1, i0 - 1].all()) or (i1 < nI_ and fill_[j0:j1, i1].all()):
                            continue
                        mr.append((gx[i0], gy[j0], gx[i1], gy[j1], j0, j1, i0, i1))
        thin_ = [r_ for r_ in mr if min(r_[2] - r_[0], r_[3] - r_[1]) <= 1.35 * dmax and max(r_[2] - r_[0], r_[3] - r_[1]) >= 1.8 * min(r_[2] - r_[0], r_[3] - r_[1])]
        covered_ = np.zeros_like(fill_)
        for r_ in thin_:
            covered_[r_[4]:r_[5], r_[6]:r_[7]] = True
        cell_a = np.array([[(gx[i + 1] - gx[i]) * (gy[j + 1] - gy[j]) for i in range(len(gx) - 1)] for j in range(len(gy) - 1)])
        if not thin_ or float(cell_a[fill_ & ~covered_].sum()) > 0.25 * float(cell_a[fill_].sum()):
            rest_g.append(g_); continue                     # (a small stub left over at a corner is covered again when the bars are joined)
        for r_ in thin_:
            o_ = "h" if r_[2] - r_[0] >= r_[3] - r_[1] else "v"
            gbars.append({"o": o_, "c0": r_[1] if o_ == "h" else r_[0], "c1": r_[3] if o_ == "h" else r_[2],
                          "a": r_[0] if o_ == "h" else r_[1], "b": r_[2] if o_ == "h" else r_[3], "fill": int(g_["grey"]), "src": []})
    T_ = m["wall_thickness_px"]
    for gb in gbars:
        # the traced faces: a line running along a face (just outside it, or inside the blurred edge) IS that face
        d_ = gb["c1"] - gb["c0"]
        for face, sgn in (("c0", -1), ("c1", 1)):
            best = None
            for l in L:
                if l["o"] != gb["o"]:
                    continue
                off = (l["c"] - gb[face]) * sgn              # > 0: outside the bar
                ov = min(l["b"], gb["b"]) - max(l["a"], gb["a"])
                if -0.45 * d_ <= off <= max(5.0, 0.3 * T_) and ov >= 0.5 * min(l["b"] - l["a"], gb["b"] - gb["a"]) and (best is None or ov > best[0]):
                    best = (ov, l)
            if best:
                gb[face] = best[1]["c"]; gb["src"].append(best[1])
        gb["d"] = gb["c1"] - gb["c0"]
        # ... and its ends: a traced stroke across the bar right at its end IS its cap (the flat grey stops short of the stroke)
        for e_, sgn in (("a", -1), ("b", 1)):
            capl = [l for l in L if l["o"] != gb["o"] and -2.0 <= (l["c"] - gb[e_]) * sgn <= max(5.0, 0.3 * T_)
                    and min(l["b"], gb["c1"]) - max(l["a"], gb["c0"]) >= 0.6 * gb["d"] and (l["b"] - l["a"]) <= 1.6 * gb["d"]]
            if capl:
                l_ = min(capl, key=lambda l: abs(l["c"] - gb[e_]))
                gb[e_] = l_["c"]                            # (the stroke itself stays: where two bars meet it is the divider between them)
    if not pairs and not gbars:
        return
    m["grey_solids"] = rest_g
    rects = []
    def _in_gbar(l1, l2):
        for gb in gbars:
            if gb["o"] != l1["o"]:
                continue
            ov = min(l1["b"], l2["b"], gb["b"]) - max(l1["a"], l2["a"], gb["a"])
            if ov >= 0.6 * (min(l1["b"], l2["b"]) - max(l1["a"], l2["a"])) and min(l2["c"], gb["c1"]) - max(l1["c"], gb["c0"]) >= 0.5 * (l2["c"] - l1["c"]):
                return gb
        return None
    def _swallowed(gb):                                     # 'grey' that is only the blur between the two faces of a longer wall
        for l1, l2 in pairs:
            if l1["o"] != gb["o"]:
                continue
            a_, b_ = max(l1["a"], l2["a"]), min(l1["b"], l2["b"])
            if b_ - a_ >= 1.5 * (gb["b"] - gb["a"]) and min(b_, gb["b"]) - max(a_, gb["a"]) >= 0.6 * (gb["b"] - gb["a"]) \
                    and min(l2["c"], gb["c1"]) - max(l1["c"], gb["c0"]) >= 0.5 * min(l2["c"] - l1["c"], gb["c1"] - gb["c0"]):
                return True
        return False
    def _strip_paper(o_, lo_, hi_, c0_, c1_):               # is the middle of the strip between two faces paper over [lo, hi]?
        g0_ = m.get("_gray")
        if g0_ is None or hi_ <= lo_:
            return False
        cm_ = (c0_ + c1_) / 2.0
        vals_ = []
        for t_ in np.arange(lo_, hi_ + 0.5, 1.0):
            x_, y_ = to_pixels(m, t_, cm_) if o_ == "h" else to_pixels(m, cm_, t_)
            xi_, yi_ = int(round(x_ - 0.5)), int(round(y_ - 0.5))
            if 0 <= yi_ < g0_.shape[0] and 0 <= xi_ < g0_.shape[1]:
                vals_.append(int(g0_[max(0, yi_ - 1):yi_ + 2, xi_].max()) if o_ == "h" else int(g0_[yi_, max(0, xi_ - 1):xi_ + 2].max()))
        return len(vals_) >= 3 and float(np.median(vals_)) > 225
    def _pane_pair(gb):                                     # the line pair a grey bar lies between
        for l1, l2 in pairs:
            if l1["o"] == gb["o"] and min(l1["b"], l2["b"], gb["b"]) - max(l1["a"], l2["a"], gb["a"]) >= 0.8 * (gb["b"] - gb["a"]) \
                    and min(l2["c"], gb["c1"]) - max(l1["c"], gb["c0"]) >= 0.5 * min(l2["c"] - l1["c"], gb["c1"] - gb["c0"]):
                return l1, l2
        return None
    for gb in gbars:
        pr_ = _pane_pair(gb)
        if pr_:
            pa_, pb_ = max(pr_[0]["a"], pr_[1]["a"]), min(pr_[0]["b"], pr_[1]["b"])
            if any(hi_ - lo_ > 0.5 * T_ and _strip_paper(gb["o"], lo_ + 2.0, hi_ - 2.0, pr_[0]["c"], pr_[1]["c"]) for lo_, hi_ in ((pa_, gb["a"]), (gb["b"], pb_))):
                gb["glass"] = True; gb["c0"], gb["c1"] = pr_[0]["c"], pr_[1]["c"]
    gbars = [gb for gb in gbars if gb.get("glass") or not _swallowed(gb)]
    for l1, l2 in pairs:
        gb = _in_gbar(l1, l2)
        if gb is not None:                                  # the same wall seen twice: the line pair gives its faces to the bar
            gb["c0"], gb["c1"] = l1["c"], l2["c"]; gb["d"] = gb["c1"] - gb["c0"]
            # ... unless the pair runs on past the grey over PAPER: a window drawn as a white frame with a grey pane in the
            # middle.  The frame is the partition (unfilled); the pane keeps its own length and its own inked ends.
            if not gb.get("glass"):
                gb["a"], gb["b"] = min(gb["a"], max(l1["a"], l2["a"])), max(gb["b"], min(l1["b"], l2["b"]))
                gb["src"] = [s_ for s_ in gb["src"] if s_ is not l1 and s_ is not l2] + [l1, l2]
                continue
        d = l2["c"] - l1["c"]
        a = min(l1["a"], l2["a"]) if abs(l1["a"] - l2["a"]) <= 1.6 * d else max(l1["a"], l2["a"])
        b = max(l1["b"], l2["b"]) if abs(l1["b"] - l2["b"]) <= 1.6 * d else min(l1["b"], l2["b"])
        g1, g2 = l1.get("side_grey"), l2.get("side_grey")
        fill = None
        # (two strokes a pixel or two apart blur into grey between them: a FILL needs room for a plateau between the strokes)
        if g1 and g2 and g1[1] < 190 and g2[0] < 190 and g1[0] > 225 and g2[1] > 225 and d >= m.get("stroke_px", 2.0) + 5.0 and not any(q_.get("glass") and _pane_pair(q_) == (l1, l2) for q_ in gbars):
            fill = int(min(200, (g1[1] + g2[0]) / 2.0))          # grey between the two faces, paper outside
        rects.append({"o": l1["o"], "c0": l1["c"], "c1": l2["c"], "a": a, "b": b, "d": d, "src": (l1, l2), "fill": fill})
    panes = [gb for gb in gbars if gb.get("glass")]
    rects += [gb for gb in gbars if not gb.get("glass")]
    # one wall cut in two by a dimension line or a swing crossing it (not by a doorway: the gap is not paper, and is small)
    gray_ = m.get("_gray")
    def _gap_paper(r1, r2):
        if gray_ is None:
            return True
        lo, hi = min(r1["b"], r2["b"]), max(r1["a"], r2["a"])
        c0, c1 = max(r1["c0"], r2["c0"]), min(r1["c1"], r2["c1"])
        c0, c1 = c0 + 0.3 * (c1 - c0), c1 - 0.3 * (c1 - c0)
        if r1["o"] == "h":
            (lo, c0), (hi, c1) = to_pixels(m, lo, c0), to_pixels(m, hi, c1)
        else:
            (c0, lo), (c1, hi) = to_pixels(m, c0, lo), to_pixels(m, c1, hi)
        reg = gray_[int(c0):int(c1) + 1, int(lo):int(hi) + 1] if r1["o"] == "h" else gray_[int(lo):int(hi) + 1, int(c0):int(c1) + 1]
        return reg.size == 0 or float(np.mean(reg)) > 235
    merged_ = True
    while merged_:
        merged_ = False
        for i_ in range(len(rects)):
            for j_ in range(i_ + 1, len(rects)):
                r1, r2 = rects[i_], rects[j_]
                tol_ = max(3.5, 0.35 * min(r1["c1"] - r1["c0"], r2["c1"] - r2["c0"]))
                if r1["o"] != r2["o"] or abs(r1["c0"] - r2["c0"]) > tol_ or abs(r1["c1"] - r2["c1"]) > tol_:
                    continue
                gap_ = max(r1["a"], r2["a"]) - min(r1["b"], r2["b"])
                if gap_ > min(1.5 * T_, 300.0 / scale) or (gap_ > 0 and _gap_paper(r1, r2)):
                    continue
                big = r1 if (r1["b"] - r1["a"]) >= (r2["b"] - r2["a"]) else r2
                fl_ = sum(r_.get("fill_len", (r_["b"] - r_["a"]) if r_["fill"] is not None else 0.0) for r_ in (r1, r2))
                tot_ = max(r1["b"], r2["b"]) - min(r1["a"], r2["a"])
                fv_ = [r_["fill"] for r_ in (r1, r2) if r_["fill"] is not None]
                rects[i_] = dict(big, a=min(r1["a"], r2["a"]), b=max(r1["b"], r2["b"]), src=tuple(r1["src"]) + tuple(r2["src"]),
                                 fill=(fv_[0] if fv_ and fl_ >= 0.5 * tot_ else None), fill_len=fl_)
                del rects[j_]; merged_ = True; break
            if merged_:
                break
    # faces shared by several rectangles (one long line) must give ONE coordinate; and the other face of neighbouring
    # stretches of the same wall is made to line up when it is within a pixel or two
    for o in ("h", "v"):
        cs = sorted({v for r in rects if r["o"] == o for v in (r["c0"], r["c1"])})
        rep = {}
        for v in cs:
            near = [u for u in rep.values() if abs(u - v) <= 2.0]
            rep[v] = near[0] if near else v
        for r in rects:
            if r["o"] == o:
                r["c0"], r["c1"] = rep[r["c0"]], rep[r["c1"]]
    # ... and a face that runs on from the face of a wall right beside it is that face (same tolerance as the wall outlines)
    tolw = max(3.0, 0.15 * T_)
    wf = {"h": [], "v": []}                                 # (coordinate, lo, hi) of wall / grey-solid edges
    for w_ in m["walls"] + m.get("grey_solids", []):
        P_ = w_["pts"]
        for i in range(len(P_)):
            (x0_, y0_), (x1_, y1_) = P_[i], P_[(i + 1) % len(P_)]
            if abs(y0_ - y1_) < 0.5:
                wf["h"].append((y0_, min(x0_, x1_), max(x0_, x1_)))
            elif abs(x0_ - x1_) < 0.5:
                wf["v"].append((x0_, min(y0_, y1_), max(y0_, y1_)))
    for r in rects:
        for face in ("c0", "c1"):
            near_ = [c_ for c_, lo_, hi_ in wf[r["o"]] if abs(c_ - r[face]) <= tolw and lo_ - 1.5 * T_ <= r["b"] and hi_ + 1.5 * T_ >= r["a"]
                     and (abs(lo_ - r["b"]) <= 1.5 * T_ or abs(hi_ - r["a"]) <= 1.5 * T_ or (lo_ <= r["a"] and hi_ >= r["b"]))]
            if near_:
                c_new = min(near_, key=lambda c_: abs(c_ - r[face]))
                other = r["c1"] if face == "c0" else r["c0"]
                if abs(c_new - other) >= 0.8 * abs(r[face] - other):      # never at the price of the wall's own thickness
                    r[face] = c_new
    # wall faces (black walls and grey solids) as rasters in model coordinates
    W_, H_ = m["size"]
    wmask = np.zeros((H_, W_), np.uint8)
    for w_ in m["walls"] + m.get("grey_solids", []):
        if not w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 255)
    for w_ in m["walls"]:
        if w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 0)
    def in_wall(x_, y_):
        xi, yi = int(round(x_)), int(round(y_))
        return 0 <= xi < W_ and 0 <= yi < H_ and wmask[max(0, yi - 1):yi + 2, max(0, xi - 1):xi + 2].any()
    # ends: run on to the far face of a partition they meet, or up to a wall face close by; trim small overshoots
    for r in rects:
        for end, sgn in (("a", -1), ("b", 1)):
            best = None
            for q in rects:
                if q["o"] == r["o"] or not (q["a"] - 1.5 * r["d"] <= (r["c0"] + r["c1"]) / 2.0 <= q["b"] + 1.5 * r["d"]):
                    continue
                near, far = (q["c1"], q["c0"]) if sgn < 0 else (q["c0"], q["c1"])
                gap = (near - r[end]) * sgn                  # > 0: the end stops short of the near face
                if -(q["d"] + 0.9 * r["d"]) <= gap <= 1.6 * r["d"] and (best is None or abs(gap) < best[0]):
                    if r.get("fill") is not None and gap > max(3.0, 0.5 * r["d"]) and _strip_paper(r["o"], min(r[end], near) + 1.5, max(r[end], near) - 1.5, r["c0"], r["c1"]):
                        continue                            # the drawing leaves paper between them: a parapet that stops short of the wall
                    best = (abs(gap), far)
            if best:
                r[end] = best[1]; continue
            # a thin line straight ahead that spans the wall's width, with the wall's own ink (not paper) running up to it
            ahead = None
            for q in m["lines"]:                            # (door leaves included: a wall stub often ends on the leaf line)
                if "dash" in q or q["o"] == r["o"] or any(q is s_ for s_ in r["src"]) or q.get("from") == "closing-piece" or (q["b"] - q["a"]) < 2.0 * r["d"]:
                    continue                                # (a real stroke, not a closing piece or a crumb)
                gap = (q["c"] - r[end]) * sgn
                if 1.0 < gap <= 1.3 * r["d"] and min(q["b"], r["c1"]) - max(q["a"], r["c0"]) >= 0.6 * r["d"] and (ahead is None or gap < ahead[0]):
                    ahead = (gap, q["c"])
            if ahead is not None and gray_ is not None:
                lo_, hi_ = sorted((r[end], ahead[1])); c0_, c1_ = r["c0"] + 0.3 * r["d"], r["c1"] - 0.3 * r["d"]
                (x0_, y0_), (x1_, y1_) = (to_pixels(m, lo_, c0_), to_pixels(m, hi_, c1_)) if r["o"] == "h" else (to_pixels(m, c0_, lo_), to_pixels(m, c1_, hi_))
                reg = gray_[int(min(y0_, y1_)):int(max(y0_, y1_)) + 1, int(min(x0_, x1_)):int(max(x0_, x1_)) + 1]
                # (blur turns a narrow gap grey, but a gap that is really there still has one clean white row right across it)
                rowmin_ = reg.min(axis=1 if r["o"] == "v" else 0) if reg.size else np.array([0])
                if reg.size and float((reg > 228).mean()) < 0.5 and float(rowmin_.max()) < 240:
                    r[end] = ahead[1]; continue
            # a black wall / grey solid straight ahead
            mid = (r["c0"] + r["c1"]) / 2.0
            for step in np.arange(0.0, 1.3 * r["d"], 1.0):
                pos = r[end] + sgn * step
                x_, y_ = (pos, mid) if r["o"] == "h" else (mid, pos)
                if in_wall(x_, y_):
                    r[end] = pos + sgn * 1.0; break
    xs = sorted({v for r in rects for v in ((r["a"], r["b"]) if r["o"] == "h" else (r["c0"], r["c1"]))})
    ys = sorted({v for r in rects for v in ((r["c0"], r["c1"]) if r["o"] == "h" else (r["a"], r["b"]))})
    if len(xs) < 2 or len(ys) < 2:
        return
    cov = np.zeros((len(ys) - 1, len(xs) - 1), bool)
    for r in rects:
        x0, x1, y0, y1 = (r["a"], r["b"], r["c0"], r["c1"]) if r["o"] == "h" else (r["c0"], r["c1"], r["a"], r["b"])
        i0, i1 = xs.index(x0), xs.index(x1); j0, j1 = ys.index(y0), ys.index(y1)
        cov[j0:j1, i0:i1] = True
    edges = []                                              # (o, c, a, b)
    nJ, nI = cov.shape
    for j in range(nJ):
        for i in range(nI):
            if not cov[j, i]:
                continue
            if j == 0 or not cov[j - 1, i]:
                edges.append(("h", ys[j], xs[i], xs[i + 1]))
            if j == nJ - 1 or not cov[j + 1, i]:
                edges.append(("h", ys[j + 1], xs[i], xs[i + 1]))
            if i == 0 or not cov[j, i - 1]:
                edges.append(("v", xs[i], ys[j], ys[j + 1]))
            if i == nI - 1 or not cov[j, i + 1]:
                edges.append(("v", xs[i + 1], ys[j], ys[j + 1]))
    # drop what lies on a wall face, then join collinear pieces
    kept = []
    for o, c, a, b in edges:
        mid = (a + b) / 2.0
        x_, y_ = (mid, c) if o == "h" else (c, mid)
        if not in_wall(x_, y_):
            kept.append((o, c, a, b)); continue
        # the middle lies on a wall face, but a long face may pass a SHORT wall (a solid bar standing against it): the rest stays
        if b - a < 2.0 * T_:
            continue
        ts_ = np.arange(a, b + 0.5, 1.0)
        free_ = [not in_wall(*((t_, c) if o == "h" else (c, t_))) for t_ in ts_]
        i_ = 0
        while i_ < len(ts_):
            if not free_[i_]:
                i_ += 1; continue
            j_ = i_
            while j_ + 1 < len(ts_) and free_[j_ + 1]:
                j_ += 1
            a2, b2 = (a if i_ == 0 else ts_[i_] - 1.0), (b if j_ == len(ts_) - 1 else ts_[j_] + 1.0)
            if b2 - a2 >= 1.0 * T_:
                kept.append((o, c, float(a2), float(b2)))
            i_ = j_ + 1
    # a free end is closed only where the drawing closes it: a parapet drawn as two bare lines stays open
    if gray_ is not None:
        ink_ = gray_ < 200
        def cap_inked(o, c, a, b):                          # o: orientation of the cap edge itself
            (xa_, ya_), (xb_, yb_) = (to_pixels(m, c, a), to_pixels(m, c, b)) if o == "v" else (to_pixels(m, a, c), to_pixels(m, b, c))
            c, a, b = (xa_, ya_, yb_) if o == "v" else (ya_, xa_, xb_)
            lo, hi = int(round(a)) + 4, int(round(b)) - 3    # well inside the two faces
            if hi - lo < 2:
                return True
            best = 0.0
            for d_ in range(-3, 4):
                p_ = int(round(c)) + d_
                if p_ < 0 or p_ >= (W_ if o == "v" else H_):
                    continue
                seg = ink_[lo:hi, p_] if o == "v" else ink_[p_, lo:hi]
                best = max(best, float(seg.mean()))
            return best >= 0.5
        caps = {("v" if r["o"] == "h" else "h", round(r[e], 3), round(r["c0"], 3), round(r["c1"], 3)) for r in rects for e in ("a", "b")}
        kept = [(o, c, a, b) for o, c, a, b in kept
                if not (any(o == k[0] and abs(c - k[1]) < 1e-3 and a >= k[2] - 1e-3 and b <= k[3] + 1e-3 for k in caps) and not cap_inked(o, c, a, b))]
    kept.sort()
    merged = []
    for o, c, a, b in kept:
        if merged and merged[-1][0] == o and abs(merged[-1][1] - c) < 1e-6 and abs(merged[-1][3] - a) < 1e-6:
            merged[-1] = (o, c, merged[-1][2], b)
        else:
            merged.append((o, c, a, b))
    sw = m["stroke_px"]
    used = {id(l) for r in rects for l in r["src"]}
    rest = []
    for l in m["lines"]:
        if id(l) not in used:
            rest.append(l); continue
        rs_ = sorted([r_ for r_ in rects if any(l is s_ for s_ in r_["src"])], key=lambda r_: r_["a"])   # what the line had beyond its walls stays a line
        cur = l["a"]
        for r in rs_ + [None]:
            a, b = cur, (min(l["b"], r["a"]) if r else l["b"])
            if b - a >= 2.5 * rs_[0]["d"]:
                q = dict(l); q["a"], q["b"] = a, b; rest.append(q)
            if r:
                cur = max(cur, r["b"])
    newl = [{"o": o, "c": c, "a": a, "b": b, "t": 3.0, "w": sw, "role": "partition"} for o, c, a, b in merged if b - a >= 0.5]
    # a cap or a jamb line that was traced on its own is now drawn by the wall outline: not twice
    def doubled(l):
        for q in newl:
            if q["o"] == l["o"] and abs(q["c"] - l["c"]) <= 2.5:
                ov = min(q["b"], l["b"]) - max(q["a"], l["a"])
                if ov >= 0.8 * (l["b"] - l["a"]):
                    return True
        return False
    def buried(l):                                          # a stroke traced inside a grey fill (along it, or across it)
        for gb in gbars:
            if gb["o"] == l["o"] and gb["c0"] + 1.0 < l["c"] < gb["c1"] - 1.0 and min(l["b"], gb["b"]) - max(l["a"], gb["a"]) >= 0.8 * (l["b"] - l["a"]):
                return True
            if gb["o"] != l["o"] and gb["a"] + 1.0 < l["c"] < gb["b"] - 1.0 and gb["c0"] - 1.0 <= l["a"] and l["b"] <= gb["c1"] + 1.0:
                return True
        return False
    rest = [l for l in rest if "dash" in l or not (doubled(l) or buried(l))]
    m["lines"] = rest + newl
    m["partitions"] = [{"o": r["o"], "c0": r["c0"], "c1": r["c1"], "a": r["a"], "b": r["b"], "thickness_mm": round(r["d"] * scale), "fill": r["fill"]} for r in rects]
    for gb in panes:                                        # the grey pane of a window: between the faces of its frame, ends as drawn
        host = [r for r in rects if r["o"] == gb["o"] and min(r["b"], gb["b"]) - max(r["a"], gb["a"]) >= 0.8 * (gb["b"] - gb["a"])
                and min(r["c1"], gb["c1"]) - max(r["c0"], gb["c0"]) >= 0.5 * (gb["c1"] - gb["c0"])]
        if host:
            h_ = min(host, key=lambda r: abs(r["c0"] - gb["c0"]) + abs(r["c1"] - gb["c1"]))
            gb["c0"], gb["c1"] = h_["c0"], h_["c1"]
        po = "v" if gb["o"] == "h" else "h"
        if gray_ is not None:                               # the pane ends on its drawn end stroke, just outside the flat grey
            for e, sg in (("a", -1), ("b", 1)):
                best = None
                for d_ in np.arange(0.0, 0.4 * T_ + 0.5, 1.0):
                    pos = gb[e] + sg * d_; vals_ = []
                    for c_ in np.arange(gb["c0"] + 3.0, gb["c1"] - 2.5, 1.0):
                        x_, y_ = to_pixels(m, pos, c_) if gb["o"] == "h" else to_pixels(m, c_, pos)
                        xi_, yi_ = int(round(x_ - 0.5)), int(round(y_ - 0.5))
                        if 0 <= yi_ < gray_.shape[0] and 0 <= xi_ < gray_.shape[1]:
                            vals_.append(int(gray_[yi_, xi_]))
                    if vals_ and (best is None or np.mean(vals_) < best[0]):
                        best = (float(np.mean(vals_)), pos)
                if best and best[0] < min(100.0, gb["fill"] - 15.0):
                    gb[e] = best[1] + 0.5
        for e in ("a", "b"):
            if gray_ is None or cap_inked(po, gb[e], gb["c0"], gb["c1"]):
                m["lines"].append({"o": po, "c": gb[e], "a": gb["c0"], "b": gb["c1"], "t": 3.0, "w": sw, "role": "partition"})
        m["partitions"].append({"o": gb["o"], "c0": gb["c0"], "c1": gb["c1"], "a": gb["a"], "b": gb["b"], "thickness_mm": round((gb["c1"] - gb["c0"]) * scale),
                                "fill": gb["fill"], "pane": True})


def extend_dashed_diagonals(m):
    """Soft inputs, after the partitions are known."""
    dashed_d = m.get("dashed_diagonals") or []
    g_ = m.get("_gray")
    if dashed_d and g_ is not None:
        # the traced dashes are only those the tracer could isolate: follow the dash rhythm along the same line for as long as the
        # pixels show it (dashes crossing a label or another dashed line), up to paper or solid ink
        Hh, Ww = g_.shape
        for dd in dashed_d:
            per = dd["dash"][0] + dd["dash"][1]
            for end, other in (("p", "q"), ("q", "p")):
                ex, ey = dd[end]; ox, oy = dd[other]; L0 = math.hypot(ex - ox, ey - oy)
                ux, uy = (ex - ox) / L0, (ey - oy) / L0
                def cov_at(t0):
                    ts = np.arange(t0, t0 + per, 1.0)
                    pts = [to_pixels(m, ex + ux * t_, ey + uy * t_) for t_ in ts]
                    xi = np.clip(np.rint([p_[0] for p_ in pts]).astype(int), 0, Ww - 1); yi = np.clip(np.rint([p_[1] for p_ in pts]).astype(int), 0, Hh - 1)
                    inside = all(0 <= p_[0] < Ww and 0 <= p_[1] < Hh for p_ in pts)
                    inkd = np.minimum.reduce([g_[np.clip(yi + dy_, 0, Hh - 1), np.clip(xi + dx_, 0, Ww - 1)] for dx_ in (-1, 0, 1) for dy_ in (-1, 0, 1)]) < 170
                    return (float(inkd.mean()) if inside else 0.0), inkd
                # ... but never through a wall or a partition: that is where such a line ends
                limit = 3.0 * L0
                polys_ = [np.array(w_["pts"], np.float32) for w_ in m["walls"] + m.get("grey_solids", []) if not w_.get("hole")]
                for t_ in np.arange(1.0, limit, 1.0):
                    px_, py_ = ex + ux * t_, ey + uy * t_
                    hit = any(cv2.pointPolygonTest(pl_, (float(px_), float(py_)), False) >= 0 for pl_ in polys_) or \
                        any(l_.get("role") == "partition" and ((l_["o"] == "h" and abs(l_["c"] - py_) <= 0.8 and l_["a"] <= px_ <= l_["b"]) or
                                                               (l_["o"] == "v" and abs(l_["c"] - px_) <= 0.8 and l_["a"] <= py_ <= l_["b"])) for l_ in m["lines"])
                    if hit:
                        limit = t_; break
                grown = 0.0
                while grown < limit:
                    cov, inkd = cov_at(grown)
                    if 0.25 <= cov <= 0.85:
                        grown += per; continue
                    # the rhythm is broken - by a label or a crossing line the dashes run through?  Then it resumes right after.
                    ahead = [cov_at(grown + k_ * per)[0] for k_ in (1, 2, 3)]
                    if cov > 0.85 and sum(1 for c_ in ahead if 0.25 <= c_ <= 0.85) >= 2:
                        grown += per; continue
                    if cov > 0.85:                          # solid ink ahead and nothing after it: the dashed line ends on it
                        grown += int(np.argmax(inkd)) if inkd.any() else 0
                    break
                grown = min(grown, limit)
                if grown > 0:
                    dd[end] = [ex + ux * grown, ey + uy * grown]


def finish_soft(m):
    """Soft inputs, the drawing as a whole: faces exact again after rectification, line ends taken to what they were heading
    for (or trimmed back to it), strokes that are tied to nothing removed, dots put on their crossings, one size per lettering."""
    scale = m.get("mm_per_px")
    if not m.get("soft_input") or not scale:
        return
    T = m["wall_thickness_px"]; W_, H_ = m["size"]
    extend_dashed_diagonals(m)
    for w_ in m["walls"] + m.get("grey_solids", []):
        w_["pts"] = regularise_polygon(w_["pts"], T)
    wmask = np.zeros((H_, W_), np.uint8)
    for w_ in m["walls"] + m.get("grey_solids", []):
        if not w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 255)
    for w_ in m["walls"]:
        if w_.get("hole"):
            cv2.fillPoly(wmask, [np.rint(np.array(w_["pts"])).astype(np.int32)], 0)
    wnear = cv2.dilate(wmask, np.ones((5, 5), np.uint8))
    def on_dim(l):
        return any(abs((d["cy"] if l["o"] == "h" else d["cx"]) - l["c"]) <= 1.5 and l["a"] - 1.5 <= (d["cx"] if l["o"] == "h" else d["cy"]) <= l["b"] + 1.5 for d in m["dots"])
    dimset = {id(l) for l in m["lines"] if on_dim(l)}
    def arc_pts(a_):
        return [arc_point(a_, g_) for g_ in (a_["start"], a_["start"] + a_["span"])]
    anchors = [p_ for a_ in m["arcs"] for p_ in arc_pts(a_) + [(a_["cx"], a_["cy"])]]
    anchors += [(d_["cx"], d_["cy"]) for d_ in m["dots"]]
    anchors += [tuple(q_) for dg in m.get("diagonals", []) + m.get("leaders", []) for q_ in (dg[0], dg[-1])]
    boxes = [s_["box"] for s_ in m.get("free_symbols", []) if s_.get("box")]
    def touches(x_, y_, me, tol=1.6):
        for l in m["lines"]:
            if l is me:
                continue
            if l["o"] == "h" and abs(l["c"] - y_) <= tol and l["a"] - tol <= x_ <= l["b"] + tol:
                return True
            if l["o"] == "v" and abs(l["c"] - x_) <= tol and l["a"] - tol <= y_ <= l["b"] + tol:
                return True
        xi, yi = int(round(x_)), int(round(y_))
        if 0 <= xi < W_ and 0 <= yi < H_ and wnear[yi, xi]:
            return True
        if any(math.hypot(px - x_, py - y_) <= 3.0 for px, py in anchors):
            return True
        for dg in m.get("diagonals", []) + m.get("leaders", []):
            (x0, y0), (x1, y1) = dg[0], dg[-1]
            L_ = math.hypot(x1 - x0, y1 - y0) or 1.0
            t_ = ((x_ - x0) * (x1 - x0) + (y_ - y0) * (y1 - y0)) / L_ ** 2
            if -0.02 <= t_ <= 1.02 and abs((x1 - x0) * (y0 - y_) - (x0 - x_) * (y1 - y0)) / L_ <= 2.5:
                return True
        return any(b_[0] - 3 <= x_ <= b_[2] + 3 and b_[1] - 3 <= y_ <= b_[3] + 3 for b_ in boxes)
    def end_xy(l, e):
        return (l[e], l["c"]) if l["o"] == "h" else (l["c"], l[e])
    # 0. doors: the hinge of a swing lies ON its leaf and ON the line the door closes against; the leaf is one radius long
    for a_ in m["arcs"]:
        if abs(a_["span"] - 90.0) > 0.5:
            continue
        r_ = a_["r"]
        for ang in (a_["start"], a_["start"] + 90.0):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"
            h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"])       # along / across the direction
            sg = dx or dy
            best = None
            for l in m["lines"]:
                if l["o"] != o_ or "dash" in l or abs(l["c"] - hc) > 0.45 * T:
                    continue
                lo, hi = sorted((h0, h0 + sg * r_))
                ov = min(l["b"], hi) - max(l["a"], lo)
                if ov >= 0.6 * r_ and (best is None or abs(l["c"] - hc) < abs(best["c"] - hc)):
                    best = l
            if best is None:
                continue
            if dx:
                a_["cy"] = best["c"]
            else:
                a_["cx"] = best["c"]
    # two swings that close on the same point of the threshold (a leaf swinging both ways) meet there exactly
    qa = [a_ for a_ in m["arcs"] if abs(a_["span"] - 90.0) <= 0.5]
    for a_ in qa:
        for b_ in qa:
            if a_ is b_ or a_["r"] > b_["r"]:
                continue                                    # the larger one gives way: its centre is fitted, not hinged
            for pa in arc_pts(a_):
                for k_, pb in enumerate(arc_pts(b_)):
                    if 1e-6 < math.hypot(pa[0] - pb[0], pa[1] - pb[1]) <= 0.4 * T:
                        ang = math.radians(b_["start"] + 90.0 * k_)
                        dx, dy = round(math.cos(ang)), round(math.sin(ang))
                        if dx and abs(pa[1] - b_["cy"]) <= 0.4 * T:
                            b_["cy"] = pa[1]; set_arc_radius(b_, True, abs(pa[0] - b_["cx"]))
                        elif dy and abs(pa[0] - b_["cx"]) <= 0.4 * T:
                            b_["cx"] = pa[0]; set_arc_radius(b_, False, abs(pa[1] - b_["cy"]))
    for a_ in m["arcs"]:
        if abs(a_["span"] - 90.0) > 0.5:
            continue
        r_ = a_["r"]
        for ang in (a_["start"], a_["start"] + 90.0):       # the leaf: from the hinge, one radius long
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o_ = "h" if dx else "v"
            h0, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"])
            sg = dx or dy
            r_ = arc_radii(a_)[0 if dx else 1]
            for l in m["lines"]:
                if l["o"] != o_ or "dash" in l or abs(l["c"] - hc) > 0.5 or id(l) in dimset:
                    continue
                near, far = ("a", "b") if sg > 0 else ("b", "a")
                if abs(l[near] - h0) <= 0.45 * T and abs(l[far] - (h0 + sg * r_)) <= max(0.1 * r_, 5.0):
                    l[near], l[far] = h0, h0 + sg * r_
                    if l["a"] > l["b"]:
                        l["a"], l["b"] = l["b"], l["a"]
                elif l["a"] < h0 - 0.45 * T and l["b"] > h0 + 0.45 * T and abs(l[far] - (h0 + sg * r_)) <= max(0.1 * r_, 5.0):
                    old_end = l[far]
                    l[far] = h0 + sg * r_                   # one leaf line through the hinge, swinging both ways
                    if abs(old_end - l[far]) > 2.0:         # the stub of the traced swing that hung on the old leaf tip goes with it
                        m["lines"] = [q for q in m["lines"] if not (q["o"] != l["o"] and "dash" not in q and (q["b"] - q["a"]) < 0.3 * r_ and abs(q["c"] - old_end) <= 3.0
                                                                   and min(abs(q["a"] - l["c"]), abs(q["b"] - l["c"])) <= 3.0)]
    anchors = [p_ for a_ in m["arcs"] for p_ in arc_pts(a_) + [(a_["cx"], a_["cy"])]] + anchors[3 * len(m["arcs"]):]
    g = max(5.0, 0.4 * T)
    # 1. ends: to the crossing line / wall face / swing end they stop just short of or run just past
    for _pass in range(2):
        for l in m["lines"]:
            if "dash" in l or id(l) in dimset:
                continue
            for e, sgn in (("a", -1), ("b", 1)):
                x_, y_ = end_xy(l, e)
                if touches(x_, y_, l):
                    continue
                best = None
                for q in m["lines"]:
                    if q is l or q["o"] == l["o"] or "dash" in q:
                        continue
                    d_ = abs(q["c"] - l[e])
                    if d_ <= g and q["a"] - g <= l["c"] <= q["b"] + g and (best is None or d_ < best[0]):
                        best = (d_, q["c"], q)
                for px, py in anchors:
                    along, across = ((px - x_), abs(py - y_)) if l["o"] == "h" else ((py - y_), abs(px - x_))
                    if across <= 3.0 and abs(along) <= g + 2 and (best is None or abs(along) < best[0]):
                        best = (abs(along), l[e] + along, None)
                if best is None or best[0] > 1.0:
                    for step in np.arange(1.0, g + 0.5, 1.0):          # a wall face straight ahead
                        xx, yy = (x_ + sgn * step, y_) if l["o"] == "h" else (x_, y_ + sgn * step)
                        xi, yi = int(round(xx)), int(round(yy))
                        if 0 <= xi < W_ and 0 <= yi < H_ and wmask[yi, xi]:
                            if best is None or step < best[0]:
                                best = (step, l[e] + sgn * (step - 0.5), None)
                            break
                if best is None:
                    continue
                new = best[1]
                if (l["b"] - new if e == "a" else new - l["a"]) < 0.4 * (l["b"] - l["a"]):
                    continue
                l[e] = new
                q = best[2]
                if q is not None and id(q) not in dimset:             # an open corner: the other line comes to it as well
                    if q["a"] - g <= l["c"] < q["a"]:
                        q["a"] = l["c"]
                    elif q["b"] < l["c"] <= q["b"] + g:
                        q["b"] = l["c"]
    # 2. strokes tied to nothing
    def crossed(l):
        for q in m["lines"]:
            if q is not l and q["o"] != l["o"] and q["a"] - 1 <= l["c"] <= q["b"] + 1 and l["a"] + 1.5 < q["c"] < l["b"] - 1.5:
                return True
        return False
    def body_touched(l):
        for q in m["lines"]:
            if q is l or q["o"] == l["o"]:
                continue
            for e in ("a", "b"):
                if abs(q[e] - l["c"]) <= 1.6 and l["a"] - 1.6 <= q["c"] <= l["b"] + 1.6:
                    return True
        return any((abs(py - l["c"]) <= 3 and l["a"] - 3 <= px <= l["b"] + 3) if l["o"] == "h" else (abs(px - l["c"]) <= 3 and l["a"] - 3 <= py <= l["b"] + 3) for px, py in anchors)
    changed = float(m.get("edge_softness", 9.9)) > 1.4 and float(m.get("pre_scale", 1.0)) >= 1.0      # (a crisp image has no debris: a stroke standing alone is a handle, a tap, a hanger)
    while changed:
        changed = False
        out = []
        for l in m["lines"]:
            if "dash" in l or id(l) in dimset or l.get("role") == "partition":
                out.append(l); continue
            ln = (l["b"] - l["a"]) * scale
            fa, fb = (not touches(*end_xy(l, "a"), l)), (not touches(*end_xy(l, "b"), l))
            if fa and fb and ln < 500 and not crossed(l) and not body_touched(l):
                changed = True; continue
            if (fa or fb) and ln < 120 and not crossed(l):
                changed = True; continue
            out.append(l)
        m["lines"] = out
    # 2a. a short stroke lying along a swing is the swing, traced twice
    def on_arc(x_, y_):
        for a_ in m["arcs"]:
            d_ = math.hypot(x_ - a_["cx"], y_ - a_["cy"])
            if abs(d_ - a_["r"]) <= 3.0:
                ang = (math.degrees(math.atan2(y_ - a_["cy"], x_ - a_["cx"])) - a_["start"]) % 360
                if ang <= a_["span"] + 4 or ang >= 356:
                    return a_
        return None
    keep_ = []
    for l in m["lines"]:
        if "dash" not in l and id(l) not in dimset:
            a1, a2 = on_arc(*end_xy(l, "a")), on_arc(*end_xy(l, "b"))
            if a1 is not None and a1 is a2 and (l["b"] - l["a"]) <= 0.4 * a1["r"]:
                continue
        keep_.append(l)
    m["lines"] = keep_
    # 2b. one stroke drawn twice (collinear pieces that overlap): one line
    merged_ = True
    while merged_:
        merged_ = False
        L_ = m["lines"]
        for i_ in range(len(L_)):
            for j_ in range(i_ + 1, len(L_)):
                a, b = L_[i_], L_[j_]
                if a["o"] != b["o"] or ("dash" in a) != ("dash" in b) or abs(a["c"] - b["c"]) > 2.2 or min(a["b"], b["b"]) - max(a["a"], b["a"]) < -1.5:
                    continue
                if (id(a) in dimset) != (id(b) in dimset):
                    continue
                keep = a if (a["b"] - a["a"]) >= (b["b"] - b["a"]) else b
                keep["a"], keep["b"] = min(a["a"], b["a"]), max(a["b"], b["b"])
                L_.remove(b if keep is a else a); merged_ = True; break
            if merged_:
                break
    # 2c. the ends of a long curve: on the wall face (or the line of that face, just past the wall's corner) or the line it was
    #     heading for.  A traced curve stops short, or is cut by a dimension tick crossing it; a parapet's two curves end on
    #     one straight line, closed by a short cap where the drawing inks it.
    gray_c = m.get("_gray")
    def inked_c(pts_):
        if gray_c is None or not pts_:
            return True
        n_ = 0
        for x_, y_ in pts_:
            X_, Y_ = to_pixels(m, x_, y_); xi_, yi_ = int(round(X_ - 0.5)), int(round(Y_ - 0.5))
            if 0 <= yi_ < gray_c.shape[0] and 0 <= xi_ < gray_c.shape[1] and gray_c[max(0, yi_ - 2):yi_ + 3, max(0, xi_ - 2):xi_ + 3].min() < 170:
                n_ += 1
        return n_ >= 0.7 * len(pts_)
    faces_c = []                                            # (o, c, lo, hi, real_lo, real_hi)
    for w_ in m["walls"] + m.get("grey_solids", []):
        P_ = w_["pts"]
        for i_ in range(len(P_)):
            (x0_, y0_), (x1_, y1_) = P_[i_], P_[(i_ + 1) % len(P_)]
            if abs(y0_ - y1_) < 0.5 and abs(x0_ - x1_) >= 0.5 * T:
                faces_c.append(("h", y0_, min(x0_, x1_) - T, max(x0_, x1_) + T, min(x0_, x1_), max(x0_, x1_)))
            elif abs(x0_ - x1_) < 0.5 and abs(y0_ - y1_) >= 0.5 * T:
                faces_c.append(("v", x0_, min(y0_, y1_) - T, max(y0_, y1_) + T, min(y0_, y1_), max(y0_, y1_)))
    for l_ in m["lines"]:
        if "dash" not in l_ and not any(abs((d["cy"] if l_["o"] == "h" else d["cx"]) - l_["c"]) <= 0.35 * T and l_["a"] - 0.35 * T <= (d["cx"] if l_["o"] == "h" else d["cy"]) <= l_["b"] + 0.35 * T
                                        for d in m["dots"]):
            faces_c.append((l_["o"], l_["c"], l_["a"] - 2, l_["b"] + 2, l_["a"], l_["b"]))
    curves_ = [a_ for a_ in m["arcs"] if a_.get("from") == "curve"]
    cands_c = {}
    for ia_, a_ in enumerate(curves_):
        cx_, cy_, r_ = a_["cx"], a_["cy"], a_["r"]
        for end_, sg_ in (("start", -1), ("end", 1)):
            ang0 = a_["start"] if sg_ < 0 else a_["start"] + a_["span"]
            lst = []
            for o_, c_, lo_, hi_, rlo_, rhi_ in faces_c:
                dd_ = (c_ - cy_) if o_ == "h" else (c_ - cx_)
                if abs(dd_) >= r_:
                    continue
                for s2_ in (-1, 1):
                    t_ = s2_ * math.sqrt(r_ * r_ - dd_ * dd_)
                    x_, y_ = (cx_ + t_, c_) if o_ == "h" else (c_, cy_ + t_)
                    if not (lo_ <= (x_ if o_ == "h" else y_) <= hi_):
                        continue
                    da_ = ((math.degrees(math.atan2(y_ - cy_, x_ - cx_)) - ang0 + 180) % 360 - 180) * sg_      # > 0: beyond the end
                    arc_ = math.radians(da_) * r_
                    if not (-0.6 * T <= arc_ <= 1.5 * T):
                        continue
                    if arc_ > 2.0 and not inked_c([(cx_ + r_ * math.cos(math.radians(ang0 + sg_ * q_)), cy_ + r_ * math.sin(math.radians(ang0 + sg_ * q_)))
                                                   for q_ in np.arange(0.0, da_, math.degrees(1.0 / r_))]):
                        continue
                    lst.append((arc_, da_, o_, c_, x_, y_, rlo_, rhi_))
            cands_c[(ia_, end_)] = lst
    chosen_c = {}
    for (ia_, end_), lst in cands_c.items():                # a parapet's two curves end on ONE line, inked from one to the other
        for (ib_, end2_), lst2 in cands_c.items():
            if ib_ <= ia_ or (ia_, end_) in chosen_c or (ib_, end2_) in chosen_c:
                continue
            def over_(c_):                                  # how far beyond the REAL extent of the face / line the end would land
                v_ = c_[4] if c_[2] == "h" else c_[5]
                return max(0.0, c_[6] - v_, v_ - c_[7])
            both = [((round(over_(p_) + over_(q_), 0), abs(p_[0]) + abs(q_[0])), p_, q_) for p_ in lst for q_ in lst2 if p_[2] == q_[2] and abs(p_[3] - q_[3]) <= 1.0
                    and math.hypot(p_[4] - q_[4], p_[5] - q_[5]) <= 3.0 * T]
            both = [b_ for b_ in both if inked_c([((v_, b_[1][3]) if b_[1][2] == "h" else (b_[1][3], v_))
                                                  for v_ in np.arange(min(b_[1][4], b_[2][4]) if b_[1][2] == "h" else min(b_[1][5], b_[2][5]),
                                                                      max(b_[1][4], b_[2][4]) if b_[1][2] == "h" else max(b_[1][5], b_[2][5]), 1.0)])]
            if both:
                _t, p_, q_ = min(both, key=lambda b_: b_[0])
                chosen_c[(ia_, end_)] = p_; chosen_c[(ib_, end2_)] = q_
    for key_, lst in cands_c.items():
        if key_ not in chosen_c and lst:
            fwd = [c_ for c_ in lst if c_[0] > 0]
            chosen_c[key_] = max(fwd, key=lambda c_: c_[0]) if fwd else max(lst, key=lambda c_: c_[0])
    for (ia_, end_), b_ in chosen_c.items():
        a_ = curves_[ia_]
        arc_, da_, o_, c_, x_, y_, rlo_, rhi_ = b_
        if end_ == "start":
            a_["start"] = (a_["start"] - da_) % 360; a_["span"] += da_
        else:
            a_["span"] += da_
        v_ = x_ if o_ == "h" else y_
        if v_ < rlo_ - 1.0 or v_ > rhi_ + 1.0:              # ended on the line of a face, past the wall's corner: the cap between
            lo2_, hi2_ = (v_, rlo_) if v_ < rlo_ else (rhi_, v_)
            pts_ = [((q_, c_) if o_ == "h" else (c_, q_)) for q_ in np.arange(lo2_ + 1.0, hi2_ - 0.5, 1.0)]
            if os.environ.get("FV_LOG_CURVE"):
                print("curve cap?", end_, o_, round(c_, 1), round(lo2_, 1), round(hi2_, 1), inked_c(pts_), [(l_["a"], l_["b"], l_.get("from")) for l_ in m["lines"] if l_["o"] == o_ and abs(l_["c"] - c_) <= 1.5 and l_["a"] <= lo2_ + 1.5 and l_["b"] >= hi2_ - 1.5])
            if inked_c(pts_) and not any(l_["o"] == o_ and abs(l_["c"] - c_) <= 1.5 and l_["a"] <= lo2_ + 1.5 and l_["b"] >= hi2_ - 1.5 for l_ in m["lines"]):
                m["lines"].append({"o": o_, "c": float(c_), "a": float(lo2_), "b": float(hi2_), "t": 3.0, "w": m.get("stroke_px", 1.0), "from": "curve-cap"})
    # 3. a dimension dot sits on the crossing of its dimension line and the extension line / tick
    for d in m["dots"]:
        hs = [l["c"] for l in m["lines"] if l["o"] == "h" and abs(l["c"] - d["cy"]) <= 0.35 * T and l["a"] - 0.35 * T <= d["cx"] <= l["b"] + 0.35 * T and (l["b"] - l["a"]) > 1.5 * T]
        vs = [l["c"] for l in m["lines"] if l["o"] == "v" and abs(l["c"] - d["cx"]) <= 0.35 * T and l["a"] - 0.35 * T <= d["cy"] <= l["b"] + 0.35 * T]
        hs2 = [l["c"] for l in m["lines"] if l["o"] == "h" and abs(l["c"] - d["cy"]) <= 0.35 * T and l["a"] - 0.35 * T <= d["cx"] <= l["b"] + 0.35 * T]
        vs2 = [l["c"] for l in m["lines"] if l["o"] == "v" and abs(l["c"] - d["cx"]) <= 0.35 * T and l["a"] - 0.35 * T <= d["cy"] <= l["b"] + 0.35 * T and (l["b"] - l["a"]) > 1.5 * T]
        if (hs or hs2) and (vs or vs2):
            d["cy"] = min(hs or hs2, key=lambda c: abs(c - d["cy"])); d["cx"] = min(vs or vs2, key=lambda c: abs(c - d["cx"]))
    # 4. lettering: a bracket or a slash stands taller than the capitals of its label; one size per lettering
    caps = [t["cap_px"] for t in m["texts"] if t.get("cap_px") and not t["s"].replace(".", "").isdigit() and not t.get("vertical") and t.get("angle") is None]
    if caps:
        vals, cnt = np.unique(np.round(caps, 1), return_counts=True)
        mode = float(vals[int(np.argmax(cnt))])
        allc = sorted({round(float(t["cap_px"]), 1) for t in m["texts"] if t.get("cap_px")})
        for t in m["texts"]:
            if t.get("vertical") or t.get("angle") is not None:
                continue
            k_ = t.get("ink")
            h_ = (k_[3] - k_[1]) if k_ else t["box"][3]
            c_ = t.get("cap_px")
            if c_ and 1.08 * mode < c_ <= 1.5 * mode and re.search(r"[()/\[\]]", t["s"]):
                t["cap_px"] = mode
                if k_:
                    mid = (k_[1] + k_[3]) / 2.0; t["ink"] = [k_[0], mid - mode / 2.0, k_[2], mid + mode / 2.0]
            elif not c_:
                near = [v for v in allc if abs(v - h_) <= 0.15 * h_]
                if near:
                    t["cap_px"] = min(near, key=lambda v: abs(v - h_))


def white_outline(gray, comp_mask, bbox, thr, half, horiz, axis_c, T, up=4, square_end=None):
    """The drawn outline of a fixture part, from the WHITE it encloses (soft inputs).  The white region is refined to
    sub-pixel accuracy on a 4x upsampled crop, grown by half a stroke (the centre line of the stroke that bounds it),
    made symmetric about the fixture's axis, and one half is fitted with lines / arcs / cubics; the other half is its
    exact mirror image.  Returns a closed path (absolute coordinates) or None.  horiz: the axis runs along x at y = axis_c."""
    if not horiz:                                           # work in a frame whose axis is horizontal
        p_ = white_outline(gray.T, comp_mask.T, (bbox[1], bbox[0], bbox[3], bbox[2]), thr, half, True, axis_c, T, up, square_end)
        if p_ is None:
            return None
        sw_ = lambda q: [q[1], q[0]]
        p_["start"] = sw_(p_["start"])
        p_["segs"] = [[sg[0], sw_(sg[1]), sg[2], sg[3], 1 - sg[4]] if sg[0] == "A" else [sg[0]] + [sw_(q) for q in sg[1:]] for sg in p_["segs"]]
        return p_
    x, y, w, h = bbox
    pad = int(math.ceil(half)) + 4
    H, W = gray.shape
    x0 = max(0, x - pad); x1 = min(W, x + w + pad)
    R = int(math.ceil(max(axis_c - (y - pad), (y + h + pad) - axis_c)))
    y0 = int(math.floor(axis_c - R)); y1 = int(round(2 * axis_c - y0))
    if y0 < 0 or y1 > H or x1 - x0 < 4:
        return None
    g_up = cv2.resize(gray[y0:y1, x0:x1], None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    seed = cv2.resize(comp_mask[y0:y1, x0:x1].astype(np.uint8), None, fx=up, fy=up, interpolation=cv2.INTER_NEAREST)
    M = ((g_up >= thr) & (cv2.dilate(seed, np.ones((2 * up + 1, 2 * up + 1), np.uint8)) > 0)).astype(np.uint8)
    n_, lab_, st_, _c = cv2.connectedComponentsWithStats(M, connectivity=4)
    if n_ < 2:
        return None
    k_ = max(range(1, n_), key=lambda i_: int(((lab_ == i_) & (seed > 0)).sum()))
    M = (lab_ == k_).astype(np.uint8)
    # half a stroke, measured here: from the edge of the white out to the darkest point of the stroke that bounds it
    dt_out = cv2.distanceTransform(1 - M, cv2.DIST_L2, 5)
    ring = (dt_out > 0) & (dt_out <= 4.0 * up)
    gs_ = cv2.GaussianBlur(g_up, (0, 0), 0.5 * up)
    ds_ = []
    cn_, _h = cv2.findContours(M, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    gy_, gx_ = np.gradient(dt_out)
    for px_, py_ in max(cn_, key=cv2.contourArea)[::max(1, up), 0, :]:
        best_ = None
        nx_, ny_ = None, None
        for d_ in range(1, int(4 * up) + 1):
            if nx_ is None:
                # outward normal from the distance field just outside the edge
                qx_, qy_ = int(px_), int(py_)
                g0x, g0y = 0.0, 0.0
                for ax_, ay_ in ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)):
                    xx_, yy_ = qx_ + ax_, qy_ + ay_
                    if 0 <= xx_ < M.shape[1] and 0 <= yy_ < M.shape[0] and not M[yy_, xx_]:
                        g0x += ax_; g0y += ay_
                nn_ = math.hypot(g0x, g0y)
                if nn_ < 1e-6:
                    break
                nx_, ny_ = g0x / nn_, g0y / nn_
            xx_, yy_ = int(round(px_ + nx_ * d_)), int(round(py_ + ny_ * d_))
            if not (0 <= xx_ < M.shape[1] and 0 <= yy_ < M.shape[0]):
                break
            v_ = float(gs_[yy_, xx_])
            if best_ is None or v_ < best_[0]:
                best_ = (v_, d_)
            elif v_ > best_[0] + 25:
                break                                       # past the stroke, the grey rises again
        if best_ and best_[0] < thr - 30:
            ds_.append(best_[1])
    if len(ds_) >= 8:
        half = float(np.clip(np.median(ds_) / up, 0.5 * half, 2.5 * half))
    r_ = max(1, int(round(half * up)))
    M = cv2.dilate(M, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r_ + 1, 2 * r_ + 1)))
    sd = cv2.distanceTransform(M, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - M, cv2.DIST_L2, 5)
    sd = (sd + sd[::-1, :]) / 2.0                           # the mean of the shape and its mirror image
    Ms = (sd > 0).astype(np.uint8)
    cnts, _h = cv2.findContours(Ms, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c_ = max(cnts, key=cv2.contourArea)[:, 0, :].astype(float)
    if len(c_) < 40:
        return None
    P = np.c_[(c_[:, 0] + 0.5) / up + x0, (c_[:, 1] + 0.5) / up + y0]
    kw = 2 * up + 1                                         # smooth the stair-steps (about 2 px of the working image)
    ext = np.vstack([P[-kw:], P, P[:kw]])
    ker = np.ones(kw) / kw
    P = np.c_[np.convolve(ext[:, 0], ker, "same"), np.convolve(ext[:, 1], ker, "same")][kw:-kw]
    # the half above the axis (y <= axis), from one axis crossing to the other
    above = P[:, 1] <= axis_c
    if above.all() or not above.any():
        return None
    i0 = next(i for i in range(len(P)) if above[i] and not above[i - 1])
    Q = np.vstack([P[i0:], P[:i0]]); ab = Q[:, 1] <= axis_c
    n_ab = int(np.argmin(ab)) if not ab.all() else len(Q)
    Hc = Q[:n_ab]
    if len(Hc) < 10 or ab[n_ab:].any():
        return None                                         # crosses the axis more than twice: not a simple symmetric shape
    Hc = np.vstack([[Hc[0, 0], axis_c], Hc, [Hc[-1, 0], axis_c]])
    sq_x = None
    if square_end:
        # the end that stands against a wall is square: grown by a disc the corner came out round, so the side runs on
        # straight to the back line and the back line runs straight to the axis
        if (Hc[0, 0] > Hc[-1, 0]) != (square_end == "hi"):
            pass
        else:
            Hc = Hc[::-1]
        # now the square end is the LAST point of the chain
        bx_ = Hc[-1, 0]; rc_ = half + 2.0; sq_x = float(bx_)
        far = np.where(np.abs(Hc[:, 0] - bx_) > rc_)[0]
        if len(far) and far[-1] >= 4:
            k1 = int(far[-1]); k0 = max(0, k1 - max(3, int(0.12 * T)))
            slope = (Hc[k1, 1] - Hc[k0, 1]) / (Hc[k1, 0] - Hc[k0, 0]) if abs(Hc[k1, 0] - Hc[k0, 0]) > 1e-6 else 0.0
            yc_ = Hc[k1, 1] + slope * (bx_ - Hc[k1, 0])
            n1 = max(2, int(abs(bx_ - Hc[k1, 0]))); n2 = max(2, int(abs(axis_c - yc_)))
            Hc = np.vstack([Hc[:k1 + 1], np.c_[np.linspace(Hc[k1, 0], bx_, n1 + 1)[1:], np.linspace(Hc[k1, 1], yc_, n1 + 1)[1:]],
                            np.c_[np.full(n2, bx_), np.linspace(yc_, axis_c, n2 + 1)[1:]]])
    seg = np.hypot(*np.diff(Hc, axis=0).T); u = np.r_[0, np.cumsum(seg)]
    uu = np.linspace(0, u[-1], max(8, int(round(u[-1]))) + 1)
    Hc = np.c_[np.interp(uu, u, Hc[:, 0]), np.interp(uu, u, Hc[:, 1])]
    fit = fit_fixture_chain(Hc, T, tol=0.7, arcs=False)     # (cubics: their end tangents can be set square to the axis)
    if not fit or fit.get("type") != "path":
        return None
    S, segs = list(fit["start"]), [list(sg) for sg in fit["segs"]]
    # a small rounded corner between two straight sides: ONE clean fillet, tangent to both (not the wobble of a 3 px trace)
    ends_ = lambda sg: sg[1] if sg[0] in ("L", "A") else sg[3]
    i_ = 1
    while i_ < len(segs) - 1:
        if segs[i_][0] != "C" or segs[i_ - 1][0] != "L":
            i_ += 1; continue
        j_ = i_
        while j_ < len(segs) and segs[j_][0] == "C":
            j_ += 1
        if j_ >= len(segs) or segs[j_][0] != "L":
            i_ = j_ + 1; continue
        a0 = np.array(S if i_ - 1 == 0 else ends_(segs[i_ - 2]), float); a1 = np.array(ends_(segs[i_ - 1]), float)
        b0 = np.array(ends_(segs[j_ - 1]), float); b1 = np.array(ends_(segs[j_]), float)
        chord = float(np.hypot(*(b0 - a1)))
        da, db = a1 - a0, b1 - b0
        den = da[0] * db[1] - da[1] * db[0]
        if chord <= 0.45 * T and abs(den) > 1e-6 * (np.hypot(*da) * np.hypot(*db) + 1e-9) and abs(den) / (np.hypot(*da) * np.hypot(*db)) > 0.5:
            t_ = ((b0[0] - a0[0]) * db[1] - (b0[1] - a0[1]) * db[0]) / den
            X = a0 + t_ * da
            if sq_x is not None and abs(X[0] - sq_x) <= 1.0 and np.hypot(*(X - a1)) <= 1.5 * chord + 2 and np.hypot(*(X - b0)) <= 1.5 * chord + 2:
                segs[i_ - 1][1] = X.tolist(); del segs[i_:j_]                 # the square corner against the wall: exact
                i_ += 1; continue
            if np.hypot(*(X - a1)) <= 1.5 * chord and np.hypot(*(X - b0)) <= 1.5 * chord:
                k_ = 0.5523
                segs[i_:j_] = [["C", (a1 + k_ * (X - a1)).tolist(), (b0 + k_ * (X - b0)).tolist(), b0.tolist()]]
                j_ = i_ + 1
        i_ = j_ + 1
    S[1] = axis_c
    if segs[0][0] == "C":
        segs[0][1] = [S[0], segs[0][1][1]]                  # leaves the axis at a right angle: the mirrored half joins smoothly
    E = segs[-1][1] if segs[-1][0] in ("L", "A") else segs[-1][3]
    E[1] = axis_c
    if segs[-1][0] == "C":
        segs[-1][2] = [E[0], segs[-1][2][1]]
    mir = lambda q: [q[0], 2 * axis_c - q[1]]
    starts = [S] + [(sg[1] if sg[0] in ("L", "A") else sg[3]) for sg in segs[:-1]]
    back = []
    for sg, st in zip(reversed(segs), reversed(starts)):
        if sg[0] == "L":
            back.append(["L", mir(st)])
        elif sg[0] == "A":
            back.append(["A", mir(st), sg[2], sg[3], sg[4]])
        else:
            back.append(["C", mir(sg[2]), mir(sg[1]), mir(st)])
    return {"type": "path", "start": S, "segs": segs + back, "closed": True}


def _path_map(p, fn):
    """A copy of a fixture path with fn applied to every point (end points and control points)."""
    q = {"type": "path", "start": fn(p["start"]), "closed": p.get("closed", False), "segs": []}
    for sg in p["segs"]:
        q["segs"].append([sg[0], fn(sg[1])] + list(sg[2:]) if sg[0] in ("L", "A") else [sg[0]] + [fn(c_) for c_ in sg[1:]])
    return q


def recognise_fixtures(m):
    """Soft inputs: sanitary fixtures are recognised from the WHITE they enclose, which survives blur far better than their
    2 px outlines do: a WC bowl is an axis-aligned ellipse of white about 340 x 470 mm, a basin a rounded rectangle, the leaf of
    a bi-fold door a white triangle on a line. Each is stored by its parameters and drawn clean later (build_free_symbols)."""
    gray, scale = m.get("_gray"), m.get("mm_per_px")
    if gray is None or not scale or not m.get("soft_input"):
        return
    thr = m.get("ink_threshold", 180)
    white = ((gray >= thr) * 255).astype(np.uint8)
    n, lab, st, _c = cv2.connectedComponentsWithStats(white, connectivity=4)
    tt_ = [l["t"] for l in m["lines"] if "t" in l]
    half = max(1.5, (float(np.median(tt_)) - 2.0) / 2.0) if tt_ else 2.5      # white edge -> centre of the drawn line
    tboxes = [t_["box"] for t_ in m["texts"]]
    out = []
    for i in range(1, n):
        x, y, w, h, a_ = [int(v) for v in st[i]]
        wm, hm = w * scale, h * scale
        if not (180 <= min(wm, hm) <= 700 and 230 <= max(wm, hm) <= 1000):
            continue
        cxr, cyr = x + w / 2.0, y + h / 2.0
        if any(bx <= cxr <= bx + bw and by <= cyr <= by + bh for bx, by, bw, bh in tboxes):
            continue                                        # the inside of an O or a D of some lettering
        reg = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        cnts, _h = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cnts, key=cv2.contourArea)
        sol = cv2.contourArea(c) / max(1.0, cv2.contourArea(cv2.convexHull(c)))
        fill = a_ / float(w * h)
        if sol < 0.9 or len(c) < 12:
            continue
        pts = c[:, 0, :].astype(float) + [x, y]
        # --- ellipse? (WC bowl, oval basin)
        (ex, ey), (d1, d2), ang = cv2.fitEllipse(c)
        ex += x; ey += y
        ang_ax = min(ang % 90, 90 - ang % 90)
        A_, B_ = d1 / 2.0, d2 / 2.0                          # along the box: fitEllipse gives (width, height) of the rotated rect
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        u_ = ((pts[:, 0] - ex) * ca + (pts[:, 1] - ey) * sa) / max(A_, 1e-6); v_ = (-(pts[:, 0] - ex) * sa + (pts[:, 1] - ey) * ca) / max(B_, 1e-6)
        resid = float(np.mean(np.abs(np.hypot(u_, v_) - 1.0))) * (A_ + B_) / 2.0
        if 0.70 <= fill <= 0.85 and resid <= 0.045 * (A_ + B_) / 2.0 + 0.6 and (ang_ax <= 12 or abs(d1 - d2) < 0.12 * max(d1, d2)):
            rx, ry = w / 2.0 + half, h / 2.0 + half
            lng, sht = max(rx, ry) * 2 * scale, min(rx, ry) * 2 * scale
            if 400 <= lng <= 600 and 300 <= sht <= 460 and 1.12 <= lng / sht <= 1.6:
                sym = {"type": "wc", "bowl": [cxr, cyr, rx, ry], "horizontal": bool(rx > ry)}
                # what is drawn, not what a WC usually looks like: the outline of the bowl and of the cistern behind it, from
                # the white each encloses (WC symbols differ from one drawing office to the next)
                hz = bool(rx > ry); ax_c = cyr if hz else cxr
                regi = (lab[y:y + h, x:x + w] == i); kq = max(2, int(0.14 * min(w, h)))
                cqi = {"nw": regi[:kq, :kq].mean(), "ne": regi[:kq, -kq:].mean(), "sw": regi[-kq:, :kq].mean(), "se": regi[-kq:, -kq:].mean()}
                # a D standing on a wall: both corners of one side are white right into the corner, the opposite two are not.
                # Its axis is square to that side, whatever the proportions of the box
                backs_i = [sd for sd, (c1, c2, c3, c4) in {"N": ("nw", "ne", "sw", "se"), "S": ("sw", "se", "nw", "ne"),
                                                            "W": ("nw", "sw", "ne", "se"), "E": ("ne", "se", "nw", "sw")}.items()
                           if min(cqi[c1], cqi[c2]) >= 0.6 and max(cqi[c3], cqi[c4]) <= 0.45]
                sq_i = None
                if len(backs_i) == 1:
                    hz = backs_i[0] in "WE"; ax_c = cyr if hz else cxr
                    sq_i = "hi" if backs_i[0] in "ES" else "lo"
                    sym["horizontal"] = hz
                ol = {"bowl": white_outline(gray, lab == i, (x, y, w, h), thr, half, hz, ax_c, m["wall_thickness_px"], square_end=sq_i)}
                for j in range(1, n):
                    if j == i:
                        continue
                    xj, yj, wj, hj, aj = [int(v) for v in st[j]]
                    along_j, lat_j, a0_j, l0_j = (wj, hj, xj, yj) if hz else (hj, wj, yj, xj)
                    along_i, lat_i, a0_i = (w, h, x) if hz else (h, w, y)
                    if not (60 <= along_j * scale <= 380 and 250 <= lat_j * scale <= 700 and 0.6 * lat_i <= lat_j <= 2.2 * lat_i):
                        continue
                    if abs(l0_j + lat_j / 2.0 - ax_c) > 0.2 * lat_i or aj < 0.6 * wj * hj:
                        continue
                    gap_ = max(a0_j - (a0_i + along_i), a0_i - (a0_j + along_j))
                    if -1 <= gap_ <= 3 * half + 3:
                        far_hi = a0_j > a0_i                  # the cistern lies on the high side of the bowl: its back is its high end
                        regj = (lab[yj:yj + hj, xj:xj + wj] == j)
                        kq = max(2, int(0.14 * min(wj, hj)))
                        cq = {"nw": regj[:kq, :kq].mean(), "ne": regj[:kq, -kq:].mean(), "sw": regj[-kq:, :kq].mean(), "se": regj[-kq:, -kq:].mean()}
                        pair_ = (("ne", "se") if far_hi else ("nw", "sw")) if hz else (("sw", "se") if far_hi else ("nw", "ne"))
                        sq_ = ("hi" if far_hi else "lo") if min(cq[pair_[0]], cq[pair_[1]]) >= 0.6 else None
                        ol["cistern"] = white_outline(gray, lab == j, (xj, yj, wj, hj), thr, half, hz, ax_c, m["wall_thickness_px"], square_end=sq_)
                        break
                if ol["bowl"] and ol.get("cistern"):
                    # the neck: the sides of the bowl run on to the front of the cistern (the stroke closing the white of the
                    # bowl is the arc drawn between them, a pixel or two in front of the cistern)
                    k_ax = 0 if hz else 1
                    B_ = _sample_fixture(ol["bowl"]); C_ = _sample_fixture(ol["cistern"])
                    toward = 1.0 if C_[:, k_ax].mean() > B_[:, k_ax].mean() else -1.0
                    xb_ = (B_[:, k_ax] * toward).max() * toward
                    nearb = B_[np.abs(B_[:, k_ax] - xb_) <= 3.0]
                    lat_ = float(np.abs(nearb[:, 1 - k_ax] - ax_c).max())
                    cb_ = nearb[int(np.argmax(np.abs(nearb[:, 1 - k_ax] - ax_c)))]
                    for sg_, nm_ in ((-1, "neck-1"), (1, "neck-2")):
                        band = C_[np.abs(C_[:, 1 - k_ax] - (ax_c + sg_ * lat_)) <= 1.0]
                        if not len(band):
                            continue
                        xf_ = (band[:, k_ax] * -toward).max() * -toward          # the cistern's front at this level
                        if os.environ.get("FV_LOG_SYM"):
                            print("neck", nm_, "corner", cb_, "lat", lat_, "front", xf_, "toward", toward)
                        if 0.5 < (xf_ - cb_[k_ax]) * toward <= max(10.0, 0.35 * m["wall_thickness_px"]):
                            pa_ = [cb_[k_ax], ax_c + sg_ * lat_]; pb_ = [xf_, ax_c + sg_ * lat_]
                            if not hz:
                                pa_, pb_ = pa_[::-1], pb_[::-1]
                            if all(gray[max(0, int(pa_[1] + t_ * (pb_[1] - pa_[1])) - 1):int(pa_[1] + t_ * (pb_[1] - pa_[1])) + 2,
                                        max(0, int(pa_[0] + t_ * (pb_[0] - pa_[0])) - 1):int(pa_[0] + t_ * (pb_[0] - pa_[0])) + 2].min() < thr for t_ in (0.2, 0.4, 0.6, 0.8)):
                                ol[nm_] = {"type": "path", "start": [float(pa_[0]), float(pa_[1])], "segs": [["L", [float(pb_[0]), float(pb_[1])]]], "closed": False}
                if ol["bowl"]:
                    sym["outline"] = {k_: _path_map(p_, lambda q, cxr=cxr, cyr=cyr: [q[0] - cxr, q[1] - cyr]) for k_, p_ in ol.items() if p_}
                out.append(sym)
            elif 200 <= sht and lng <= 700:
                out.append({"type": "oval", "cx": cxr, "cy": cyr, "rx": rx, "ry": ry})
            continue
        # --- triangle on a line: the folded leaf of a bi-fold door
        if 0.42 <= fill <= 0.64 and sol >= 0.9:
            tri = cv2.approxPolyDP(c, 0.12 * max(w, h), True)[:, 0, :].astype(float) + [x, y]
            if len(tri) == 3:
                out.append({"type": "bifold", "tri": tri.tolist(), "half": half})
            continue
        # --- rounded rectangle: basin (back corners square on the wall, front corners rounded)
        if 0.86 <= fill <= 0.965 and 300 <= min(wm, hm) and max(wm, hm) <= 650:
            k_ = max(2, int(0.14 * min(w, h)))
            corner = {"nw": reg[:k_, :k_].mean(), "ne": reg[:k_, -k_:].mean(), "sw": reg[-k_:, :k_].mean(), "se": reg[-k_:, -k_:].mean()}
            # back corners square (white right into the corner), front corners rounded (no white there) - judged against each
            # other, since blur takes the edge off a square corner as well
            backs = [sd for sd, (c1, c2, c3, c4) in {"N": ("nw", "ne", "sw", "se"), "S": ("sw", "se", "nw", "ne"),
                                                     "W": ("nw", "sw", "ne", "se"), "E": ("ne", "se", "nw", "sw")}.items()
                     if min(corner[c1], corner[c2]) >= 0.6 and max(corner[c3], corner[c4]) <= 0.45
                     and min(corner[c1], corner[c2]) - max(corner[c3], corner[c4]) >= 0.35]
            dr_ = 2.5 * (m.get("dot_r") or 3.0)
            if any(abs(d_["cx"] - px_) <= dr_ and abs(d_["cy"] - py_) <= dr_ for d_ in m["dots"] for px_ in (x, x + w) for py_ in (y, y + h)):
                backs = []                                  # a cell of the dimension grid, its corners taken by the dots
            if len(backs) == 1:
                r_ = math.sqrt(max(0.0, (1.0 - fill) * w * h / (2 * 0.2146)))
                sym = {"type": "basin_d", "box": [x - half, y - half, x + w + half, y + h + half], "back": backs[0], "r": r_ + half}
                hz = backs[0] in "WE"
                ol_ = white_outline(gray, lab == i, (x, y, w, h), thr, half, hz, (y + h / 2.0) if hz else (x + w / 2.0), m["wall_thickness_px"],
                                    square_end="hi" if backs[0] in "ES" else "lo")
                if ol_:
                    sym["outline"] = _path_map(ol_, lambda q, x=x, y=y, w=w, h=h: [q[0] - (x + w / 2.0), q[1] - (y + h / 2.0)])
                out.append(sym)
    m["free_symbols"] = out


def build_free_symbols(m):
    """Turn the recognised fixtures into drawn parts, seat them on the wall behind them, and clear the traced crumbs of the
    same fixture out of the model."""
    syms = m.get("free_symbols") or []
    if not syms:
        return
    scale = m["mm_per_px"]; sw = m["stroke_px"]
    def faces(o):                                           # positions of lines / wall faces of one orientation
        fs = [(l["c"], l["a"], l["b"]) for l in m["lines"] if l["o"] == o and "dash" not in l and l["b"] - l["a"] >= 150 / scale]
        for w_ in m["walls"] + m.get("grey_solids", []):
            P_ = w_["pts"]
            for i_ in range(len(P_)):
                p1, p2 = P_[i_], P_[(i_ + 1) % len(P_)]
                if o == "v" and abs(p1[0] - p2[0]) < 0.5:
                    fs.append((p1[0], min(p1[1], p2[1]), max(p1[1], p2[1])))
                if o == "h" and abs(p1[1] - p2[1]) < 0.5:
                    fs.append((p1[1], min(p1[0], p2[0]), max(p1[0], p2[0])))
        return fs
    zones = []
    for s_ in syms:
        if s_["type"] == "wc":
            cx, cy, rx, ry = s_["bowl"]
            horiz = s_["horizontal"]; A_, B_ = (rx, ry) if horiz else (ry, rx)
            best = None
            for sgn in (-1, 1):                             # the wall is behind the cistern: nearest face 60..420 mm beyond the bowl's end
                endp = (cx if horiz else cy) + sgn * A_
                for c_, a0, b0 in faces("v" if horiz else "h"):
                    d_ = (c_ - endp) * sgn
                    lat = cy if horiz else cx
                    if 60 / scale <= d_ <= 420 / scale and a0 - 2 <= lat <= b0 + 2 and (best is None or d_ < best[0]):
                        best = (d_, sgn, c_)
            if s_.get("outline"):
                k_ax = 0 if horiz else 1
                def place(q, best=best):
                    q = [q[0] + cx, q[1] + cy]
                    if best is not None and abs(q[k_ax] - best[2]) <= 3.0:
                        q[k_ax] = best[2]                   # the cistern stands ON the wall face behind it
                    return q
                paths_ = {k_: _path_map(p_, place) for k_, p_ in s_["outline"].items()}
                pts_ = np.vstack([_sample_fixture(p_) for p_ in paths_.values()])
                box = [float(pts_[:, 0].min()), float(pts_[:, 1].min()), float(pts_[:, 0].max()), float(pts_[:, 1].max())]
                s_.update({"box": box, "parts": [{"id": k_, "kind": "path", "d": path_d(p_)} for k_, p_ in paths_.items()], "stroke": sw, "design": "as-drawn"})
                if best is not None:
                    s_["wall_side"] = ("E" if best[1] > 0 else "W") if horiz else ("S" if best[1] > 0 else "N")
                zones.append(box); continue
            if best is None:
                continue
            d_, sgn, wall_c = best
            tip = (cx if horiz else cy) - sgn * A_
            side = ("E" if sgn > 0 else "W") if horiz else ("S" if sgn > 0 else "N")
            Wd = 2 * B_ / 0.77                               # bowl is 77 % of the cistern's width
            lo, hi = sorted((tip, wall_c))
            box = [lo, cy - Wd / 2, hi, cy + Wd / 2] if horiz else [cx - Wd / 2, lo, cx + Wd / 2, hi]
            L = hi - lo
            F = min(0.82, max(0.62, (2 * A_ * 0.93) / L))
            parts, _smp = wc_symbol(box, side, F, bowl=(A_, B_))
            if os.environ.get("FV_LOG_SYM") and m.get("_gray") is not None:
                g_ = m["_gray"]
                def cov_(pts_):
                    n_ = 0
                    for x_, y_ in pts_:
                        X_, Y_ = to_pixels(m, x_, y_); xi_, yi_ = int(round(X_ - 0.5)), int(round(Y_ - 0.5))
                        n_ += int(g_[max(0, yi_ - 2):yi_ + 3, max(0, xi_ - 2):xi_ + 3].min() < 170)
                    return round(n_ / max(1, len(pts_)), 2)
                nb_ = len(_smp) - 130
                bt_ = next(p_ for p_ in parts if p_["id"] == "flush-button")
                print("WC", [round(v_) for v_ in box], side, "bowl", cov_(_smp[:nb_]), "front", cov_(_smp[nb_:nb_ + 40]), "back", cov_(_smp[nb_ + 40:nb_ + 70]),
                      "seat", cov_(_smp[nb_ + 70:]), "button", cov_([(bt_["cx"], bt_["cy"])]), int(g_[int(to_pixels(m, bt_["cx"], bt_["cy"])[1]), int(to_pixels(m, bt_["cx"], bt_["cy"])[0])]))
            s_.update({"box": box, "wall_side": side, "parts": parts, "stroke": sw}); zones.append(box)
        elif s_["type"] == "oval":
            s_.update({"parts": [{"id": "bowl", "kind": "ellipse", "cx": s_["cx"], "cy": s_["cy"], "rx": s_["rx"], "ry": s_["ry"]}], "stroke": sw,
                       "box": [s_["cx"] - s_["rx"], s_["cy"] - s_["ry"], s_["cx"] + s_["rx"], s_["cy"] + s_["ry"]]})
            zones.append(s_["box"])
        elif s_["type"] == "basin_d":
            x0, y0, x1, y1 = s_["box"]; r_ = min(s_["r"], 0.45 * min(x1 - x0, y1 - y0)); bk = s_["back"]
            # seat the back on the line / wall face it stands against
            o_ = "h" if bk in "NS" else "v"; bc = {"N": y0, "S": y1, "W": x0, "E": x1}[bk]
            near = [c_ for c_, a0, b0 in faces(o_) if abs(c_ - bc) <= 5 and a0 - 2 <= ((x0 + x1) / 2 if o_ == "h" else (y0 + y1) / 2) <= b0 + 2]
            if near:
                bc = min(near, key=lambda c_: abs(c_ - bc))
                if bk == "N": y0 = bc
                elif bk == "S": y1 = bc
                elif bk == "W": x0 = bc
                else: x1 = bc
            if s_.get("outline"):
                k_ax = 1 if bk in "NS" else 0; bc0 = {"N": s_["box"][1], "S": s_["box"][3], "W": s_["box"][0], "E": s_["box"][2]}[bk]
                cxb, cyb = (s_["box"][0] + s_["box"][2]) / 2.0, (s_["box"][1] + s_["box"][3]) / 2.0
                def place_b(q):
                    q = [q[0] + cxb, q[1] + cyb]
                    if abs(q[k_ax] - bc0) <= 2.5 or abs(q[k_ax] - bc) <= 2.5:
                        q[k_ax] = bc
                    return q
                pb_ = _path_map(s_["outline"], place_b)
                s_.update({"box": [x0, y0, x1, y1], "parts": [{"id": "bowl", "kind": "path", "d": path_d(pb_)}], "stroke": sw, "design": "as-drawn"})
                zones.append([x0, y0, x1, y1]); continue
            P_ = {"N": [(x0, y0), (x0, y1 - r_), ("a", x0 + r_, y1), (x1 - r_, y1), ("a", x1, y1 - r_), (x1, y0)],
                  "S": [(x1, y1), (x1, y0 + r_), ("a", x1 - r_, y0), (x0 + r_, y0), ("a", x0, y0 + r_), (x0, y1)],
                  "W": [(x0, y1), (x1 - r_, y1), ("a", x1, y1 - r_), (x1, y0 + r_), ("a", x1 - r_, y0), (x0, y0)],
                  "E": [(x1, y0), (x0 + r_, y0), ("a", x0, y0 + r_), (x0, y1 - r_), ("a", x0 + r_, y1), (x1, y1)]}[bk]
            d = "M%s" % _pt(P_[0])
            for q in P_[1:]:
                d += (" A%s,%s 0 0 0 %s" % (f(r_), f(r_), _pt(q[1:]))) if q[0] == "a" else " L%s" % _pt(q)   # every corner is a left turn
            s_.update({"box": [x0, y0, x1, y1], "parts": [{"id": "bowl", "kind": "path", "d": d}], "stroke": sw}); zones.append([x0, y0, x1, y1])
        elif s_["type"] == "bifold":
            tri = [list(p_) for p_ in s_["tri"]]; h_ = s_["half"]
            # the base is the side lying along a line; the apex is the vertex opposite it
            def axis_err(p_, q_):
                return min(abs(p_[0] - q_[0]), abs(p_[1] - q_[1]))
            k_ = min(range(3), key=lambda i_: axis_err(tri[i_], tri[(i_ + 1) % 3]))
            b1, b2, ap = tri[k_], tri[(k_ + 1) % 3], tri[(k_ + 2) % 3]
            if axis_err(b1, b2) > 0.12 * math.hypot(b1[0] - b2[0], b1[1] - b2[1]):
                continue
            if abs(b1[1] - b2[1]) <= abs(b1[0] - b2[0]):   # horizontal base
                yb = (b1[1] + b2[1]) / 2.0; sgn = 1 if ap[1] > yb else -1
                near = [c_ for c_, a0, b0 in faces("h") if abs(c_ - (yb - sgn * h_)) <= max(6.0, 0.45 * m["wall_thickness_px"])]
                yb = min(near, key=lambda c_: abs(c_ - yb)) if near else yb - sgn * h_
                pts_ = [(min(b1[0], b2[0]) - h_, yb), (ap[0], ap[1] + sgn * h_), (max(b1[0], b2[0]) + h_, yb)]
            else:
                xb = (b1[0] + b2[0]) / 2.0; sgn = 1 if ap[0] > xb else -1
                near = [c_ for c_, a0, b0 in faces("v") if abs(c_ - (xb - sgn * h_)) <= max(6.0, 0.45 * m["wall_thickness_px"])]
                xb = min(near, key=lambda c_: abs(c_ - xb)) if near else xb - sgn * h_
                pts_ = [(xb, min(b1[1], b2[1]) - h_), (ap[0] + sgn * h_, ap[1]), (xb, max(b1[1], b2[1]) + h_)]
            s_.update({"parts": [{"id": "leaves", "kind": "path", "d": "M%s L%s L%s" % tuple(_pt(q) for q in pts_)}], "stroke": sw,
                       "box": [min(q[0] for q in pts_), min(q[1] for q in pts_), max(q[0] for q in pts_), max(q[1] for q in pts_)]})
            zones.append(s_["box"])
    m["free_symbols"] = [s_ for s_ in syms if "parts" in s_]
    # the traced pieces of the same fixtures go: whatever lies (almost) wholly inside a symbol's box
    def inside(x_, y_):
        return any(zx0 - 4 <= x_ <= zx1 + 4 and zy0 - 4 <= y_ <= zy1 + 4 for zx0, zy0, zx1, zy1 in zones)
    def fx_in(p_):
        pts = _sample_fixture(p_)
        return len(pts) > 0 and np.mean([inside(x_, y_) for x_, y_ in pts[::2]]) >= 0.7
    m["fixtures"] = [p_ for p_ in m["fixtures"] if not fx_in(p_)]
    def diag_in(d_):
        (x0, y0), (x1, y1) = d_[0], d_[-1]
        pts = [(x0 + (x1 - x0) * k_ / 10.0, y0 + (y1 - y0) * k_ / 10.0) for k_ in range(11)]
        return np.mean([any(zx0 - 9 <= x_ <= zx1 + 9 and zy0 - 9 <= y_ <= zy1 + 9 for zx0, zy0, zx1, zy1 in zones) for x_, y_ in pts]) >= 0.7
    m["diagonals"] = [d_ for d_ in m.get("diagonals", []) if not diag_in(d_)]
    def line_in(l):
        p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
        mg = max(7.0, 0.6 * m["wall_thickness_px"])
        return any(zx0 - mg <= min(p1[0], p2[0]) and max(p1[0], p2[0]) <= zx1 + mg and zy0 - mg <= min(p1[1], p2[1]) and max(p1[1], p2[1]) <= zy1 + mg
                   and max(p1[0] - p2[0], p1[1] - p2[1], p2[0] - p1[0], p2[1] - p1[1]) <= 1.15 * max(zx1 - zx0, zy1 - zy0)
                   for zx0, zy0, zx1, zy1 in zones)
    m["lines"] = [l for l in m["lines"] if not line_in(l)]
    m["fixture_solids"] = [rings for rings in m.get("fixture_solids", []) if not all(fx_in(r_) for r_ in rings)]
    def arc_mid(a_):
        t_ = math.radians(a_["start"] + a_["span"] / 2.0)
        return a_["cx"] + a_["r"] * math.cos(t_), a_["cy"] + a_["r"] * math.sin(t_)
    m["arcs"] = [a_ for a_ in m["arcs"] if not (a_["r"] * scale < 500 and (inside(a_["cx"], a_["cy"]) or inside(*arc_mid(a_))))]


PAPER_SCALE = 100            # HDB plans are drawn 1:100; --paper-scale=N changes it, --px-size keeps the page in source pixels


def to_pixels(m, x, y):
    """Model coordinates (possibly moved onto the written dimensions) -> where that point is in the source pixels."""
    u = m.get("_unrect") or {}
    if "x" in u:
        x = x - float(np.interp(x, *u["x"]))
    if "y" in u:
        y = y - float(np.interp(y, *u["y"]))
    return x, y


def svg_open(m, W, H, W0_, H0_):
    """Page size.  With the mm/px scale known from the dimensions, the page is the drawing at 1:100 in real millimetres, so
    that in Illustrator 1 mm on the artboard is 100 mm in the flat and the rulers can be trusted.  Geometry stays in px units."""
    sc = m.get("mm_per_px")
    if sc and (m.get("scale_source") or {}).get("estimated"):
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" data-scale-estimated="true" data-mm-per-unit-estimate="%s">' % (W, H, W0_, H0_, "%.2f" % sc)
    if sc and "--px-size" not in sys.argv:
        n_ = PAPER_SCALE
        for a_ in sys.argv:
            if a_.startswith("--paper-scale="):
                n_ = float(a_.split("=", 1)[1])
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%smm" height="%smm" data-mm-per-unit="%s" data-paper-scale="1:%g">'
                % (W, H, f(W * sc / n_), f(H * sc / n_), ("%.4f" % sc), n_))
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W0_, H0_)


def rectify_to_dimensions(m):
    """The written dimensions are the truth.  On a soft scan the traced stops are a few px off, so 3300 measures as 3275.
    Move every dimensioned position to where its numbers put it (least squares over all dimensions, staying as close to the
    traced positions as the numbers allow) and carry the rest of the drawing along, piecewise-linearly, per axis."""
    items = [it for it in (m.get("_dim_items") or []) if it.get("from") != "scale bar"]     # (the bar lies outside the drawing)
    scale = m.get("mm_per_px")
    if not scale or len(items) < 3:
        return
    report = {}
    maps = {}
    for axis in ("x", "y"):
        its = [it for it in items if it["axis"] == axis]
        if len(its) < 2:
            continue
        pos = sorted({v for it in its for v in (it["p"], it["q"])})
        reps = []                                           # stops of different dimension lines on the same extension line
        for v in pos:
            if reps and v - reps[-1][-1] <= 2.5:
                reps[-1].append(v)
            else:
                reps.append([v])
        centre = [float(np.mean(g_)) for g_ in reps]
        idx = {v: i for i, g_ in enumerate(reps) for v in g_}
        n = len(centre); rows, rhs = [], []
        for it in its:
            r_ = np.zeros(n); r_[idx[it["q"]]] += 1; r_[idx[it["p"]]] -= 1
            if r_.any():
                rows.append(10.0 * r_); rhs.append(10.0 * it["mm"] / scale)
        for i in range(n):
            r_ = np.zeros(n); r_[i] = 1.0; rows.append(r_); rhs.append(centre[i])
        sol = np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)[0]
        d = sol - np.array(centre)
        if np.abs(d).max() > 0.12 * m["wall_thickness_px"] + 6:
            report[axis] = {"skipped": "a shift of %.1f px is more than a tracing error" % float(np.abs(d).max())}
            continue
        maps[axis] = (np.array(centre), d)
        res = [abs((sol[idx[it["q"]]] - sol[idx[it["p"]]]) * scale - it["mm"]) for it in its]
        report[axis] = {"anchors": n, "max_shift_px": round(float(np.abs(d).max()), 2), "rms_shift_px": round(float(np.sqrt((d ** 2).mean())), 2),
                        "max_residual_mm_after": round(float(max(res)), 1)}
    m["rectified_to_dimensions"] = report
    if not maps:
        return
    ident = (np.array([0.0]), np.array([0.0]))
    # later stages still look at the pixels: keep the way back (the inverse of a piecewise-linear shift is one as well)
    m["_unrect"] = {ax: (c_ + d_, d_) for ax, (c_, d_) in maps.items()}
    fx = lambda v: float(v + np.interp(v, *maps.get("x", ident)))
    fy = lambda v: float(v + np.interp(v, *maps.get("y", ident)))
    P = lambda p_: [fx(p_[0]), fy(p_[1])]
    def path_(f_):
        if f_.get("type") in ("circle", "ellipse"):
            f_["cx"], f_["cy"] = fx(f_["cx"]), fy(f_["cy"]); return
        if "start" in f_:
            f_["start"] = P(f_["start"])
            for sg in f_.get("segs", []):
                if sg[0] == "L":
                    sg[1] = P(sg[1])
                elif sg[0] == "C":
                    sg[1], sg[2], sg[3] = P(sg[1]), P(sg[2]), P(sg[3])
                elif sg[0] == "A":
                    sg[1] = P(sg[1])
    for w_ in m["walls"] + m.get("grey_solids", []):
        w_["pts"] = [P(p_) for p_ in w_["pts"]]
    for l in m["lines"]:
        if l["o"] == "h":
            l["c"], l["a"], l["b"] = fy(l["c"]), fx(l["a"]), fx(l["b"])
        else:
            l["c"], l["a"], l["b"] = fx(l["c"]), fy(l["a"]), fy(l["b"])
    for a_ in m["arcs"]:
        a_["cx"], a_["cy"] = fx(a_["cx"]), fy(a_["cy"])
    for d_ in m["dots"]:
        d_["cx"], d_["cy"] = fx(d_["cx"]), fy(d_["cy"])
    for f_ in m.get("fillets", []):
        f_["cx"], f_["cy"] = fx(f_["cx"]), fy(f_["cy"]); f_["from"], f_["to"] = P(f_["from"]), P(f_["to"])
    for t_ in m["texts"] + m.get("unread_text", []):
        x, y, w, h = t_["box"]
        dx, dy = fx(x + w / 2.0) - (x + w / 2.0), fy(y + h / 2.0) - (y + h / 2.0)
        t_["box"] = [x + dx, y + dy, w, h]
        if t_.get("ink"):
            k_ = t_["ink"]; t_["ink"] = [k_[0] + dx, k_[1] + dy, k_[2] + dx, k_[3] + dy]
        if t_.get("angle") is not None:
            t_["baseline_mid"] = [t_["baseline_mid"][0] + dx, t_["baseline_mid"][1] + dy]
            t_["quad"] = [[q_[0] + dx, q_[1] + dy] for q_ in t_["quad"]]
    for f_ in m.get("fixtures", []):
        path_(f_)
    for grp in m.get("fixture_solids", []):
        for f_ in (grp if isinstance(grp, list) else [grp]):
            path_(f_)
    m["diagonals"] = [[P(p_) for p_ in dg] for dg in m.get("diagonals", [])]
    m["leaders"] = [[P(p_) for p_ in dg] for dg in m.get("leaders", [])]
    for s_ in m.get("free_symbols", []):
        if s_["type"] == "wc":
            s_["bowl"][0], s_["bowl"][1] = fx(s_["bowl"][0]), fy(s_["bowl"][1])
        elif s_["type"] == "oval":
            s_["cx"], s_["cy"] = fx(s_["cx"]), fy(s_["cy"])
        elif s_["type"] == "basin_d":
            b_ = s_["box"]; dx = fx((b_[0] + b_[2]) / 2) - (b_[0] + b_[2]) / 2; dy = fy((b_[1] + b_[3]) / 2) - (b_[1] + b_[3]) / 2
            s_["box"] = [b_[0] + dx, b_[1] + dy, b_[2] + dx, b_[3] + dy]
        elif s_["type"] == "bifold":
            s_["tri"] = [P(p_) for p_ in s_["tri"]]
    for d_ in m.get("doors", []):
        d_["hinge"] = P(d_["hinge"])
    for it in items:                                        # the exported dimension spans follow the drawing
        a_ = fx if it["axis"] == "x" else fy; c_ = fy if it["axis"] == "x" else fx
        it["p"], it["q"], it["lc"] = a_(it["p"]), a_(it["q"]), c_(it["lc"])
        if it.get("tc"):
            it["tc"] = P(it["tc"])


# --------------------------------------------------------------------- SVG

def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def path_d(p):
    if p["type"] in ("circle", "ellipse"):                  # as two arcs, so it can live inside a compound path
        rx, ry = (p["r"], p["r"]) if p["type"] == "circle" else (p["rx"], p["ry"])
        rot = p.get("rot", 0.0); c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        x0, y0, x1, y1 = p["cx"] - rx * c, p["cy"] - rx * s_, p["cx"] + rx * c, p["cy"] + rx * s_
        return "M%s,%s A%s,%s %s 1 0 %s,%s A%s,%s %s 1 0 %s,%s Z" % (f(x0), f(y0), f(rx), f(ry), f(rot), f(x1), f(y1),
                                                                     f(rx), f(ry), f(rot), f(x0), f(y0))
    d = "M%s,%s" % (f(p["start"][0]), f(p["start"][1]))
    for sg in p["segs"]:
        if sg[0] == "A":
            d += " A%s,%s 0 %d %d %s,%s" % (f(sg[2]), f(sg[2]), sg[3], sg[4], f(sg[1][0]), f(sg[1][1]))
        else:
            d += (" C" + " ".join(f(q[0]) + "," + f(q[1]) for q in sg[1:])) if sg[0] == "C" else (" L" + f(sg[1][0]) + "," + f(sg[1][1]))
    return d + (" Z" if p["closed"] else "")


def to_svg_grouped(m):
    W, H = m["size"]; sw = m["stroke_px"]
    W0_, H0_ = m.get("source_size", [W, H])
    o = [svg_open(m, W, H, W0_, H0_)]
    # walls: outer ring + its holes in one path
    o.append('<g id="walls" fill="#000" fill-rule="evenodd" stroke="none">')
    outers = [w for w in m["walls"] if not w["hole"]]
    for w in outers:
        rings = [w] + [h for h in m["walls"] if h["hole"] and h["parent"] == w["idx"]]
        d = " ".join("M" + " L".join(f(p[0]) + "," + f(p[1]) for p in r["pts"]) + " Z" for r in rings)
        o.append('  <path d="%s"/>' % d)
    o.append("</g>")
    o.append('<g id="lines" fill="none" stroke="#000" stroke-linecap="square">')
    for wi, wv in enumerate(sorted({l.get("w", sw) for l in m["lines"] if "dash" not in l})):
        o.append('  <g id="lines-weight-%d" stroke-width="%s">' % (wi + 1, f(wv)))
        for l in m["lines"]:
            if "dash" in l or l.get("w", sw) != wv:
                continue
            x1, y1, x2, y2 = (l["a"], l["c"], l["b"], l["c"]) if l["o"] == "h" else (l["c"], l["a"], l["c"], l["b"])
            o.append('    <line x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(x1), f(y1), f(x2), f(y2)))
        o.append("  </g>")
    o.append("</g>")
    o.append('<g id="dashed" fill="none" stroke="#000" stroke-width="%s">' % f(sw))
    for l in m["lines"]:
        if "dash" not in l:
            continue
        x1, y1, x2, y2 = (l["a"], l["c"], l["b"], l["c"]) if l["o"] == "h" else (l["c"], l["a"], l["c"], l["b"])
        o.append('  <line x1="%s" y1="%s" x2="%s" y2="%s" stroke-dasharray="%s %s"/>' %
                 (f(x1), f(y1), f(x2), f(y2), f(l["dash"][0]), f(l["dash"][1])))
    o.append("</g>")
    if m.get("fillets"):
        o.append('<g id="rounded-corners" fill="none" stroke="#000">')
        for fl in m["fillets"]:
            o.append('  <path stroke-width="%s" d="M%s,%s A%s,%s 0 0 %d %s,%s"/>' % (f(fl["w"]), f(fl["from"][0]), f(fl["from"][1]),
                     f(fl["r"]), f(fl["r"]), fl["sweep"], f(fl["to"][0]), f(fl["to"][1])))
        o.append("</g>")
    o.append('<g id="diagonals" fill="none" stroke="#000" stroke-width="%s" stroke-linejoin="miter">' % f(sw))
    for p in m.get("diagonals", []):
        o.append('  <polyline points="%s"/>' % " ".join(f(x) + "," + f(y) for x, y in p))
    o.append("</g>")
    o.append('<g id="door-arcs" fill="none" stroke="#000" stroke-width="%s">' % f(float(np.median([a.get("w", sw) for a in m["arcs"]])) if m["arcs"] else sw))
    for a in m["arcs"]:
        a0, a1 = math.radians(a["start"]), math.radians(a["start"] + a["span"])
        x0, y0 = a["cx"] + a["r"] * math.cos(a0), a["cy"] + a["r"] * math.sin(a0)
        x1, y1 = a["cx"] + a["r"] * math.cos(a1), a["cy"] + a["r"] * math.sin(a1)
        o.append('  <path d="M%s,%s A%s,%s 0 %d 1 %s,%s"/>' %
                 (f(x0), f(y0), f(a["r"]), f(a["r"]), 1 if a["span"] > 180 else 0, f(x1), f(y1)))
    o.append("</g>")
    o.append('<g id="fixtures" fill="none" stroke="#000" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round">' % f(sw))
    for p in m["fixtures"]:
        if p["type"] == "circle":
            o.append('  <circle cx="%s" cy="%s" r="%s"/>' % (f(p["cx"]), f(p["cy"]), f(p["r"])))
        elif p["type"] == "ellipse":
            o.append('  <ellipse cx="%s" cy="%s" rx="%s" ry="%s"%s/>' % (f(p["cx"]), f(p["cy"]), f(p["rx"]), f(p["ry"]),
                     "" if p["rot"] in (0, 0.0) else ' transform="rotate(%s %s %s)"' % (f(p["rot"]), f(p["cx"]), f(p["cy"]))))
        else:
            o.append('  <path d="%s"/>' % path_d(p))
    o.append("</g>")
    if m.get("fixture_solids"):
        o.append('<g id="fixture-details" fill="#000" fill-rule="evenodd" stroke="none">')
        for rings in m["fixture_solids"]:
            o.append('  <path d="%s"/>' % " ".join(path_d(r) for r in rings))
        o.append("</g>")
    if m.get("unread_text"):
        o.append('<g id="needs-review" fill="none" stroke="#e0007a" stroke-width="1" stroke-dasharray="4 3">')
        for u in m["unread_text"]:
            x, y, w, h = u["box"]
            o.append('  <rect x="%s" y="%s" width="%s" height="%s"><title>unread lettering%s</title></rect>' %
                     (f(x), f(y), f(w), f(h), (": " + u["read"].replace("&", "&amp;").replace("<", "&lt;")) if u.get("read") else ""))
        o.append("</g>")
    o.append('<g id="dimension-dots" fill="#000">')
    for d in m["dots"]:
        o.append('  <circle cx="%s" cy="%s" r="%s"/>' % (f(d["cx"]), f(d["cy"]), f(m["dot_r"])))
    o.append("</g>")
    o.append('<g id="text" fill="#000" font-family="\'Arial Narrow\', \'Liberation Sans Narrow\', \'TeX Gyre Heros Cn\', \'Roboto Condensed\', Arial, sans-serif" text-anchor="middle">')
    CAP = 0.716                                             # cap height of Arial / Helvetica, in em
    for t in m["texts"]:
        x0, y0, x1, y1 = t.get("ink") or [t["box"][0], t["box"][1], t["box"][0] + t["box"][2], t["box"][1] + t["box"][3]]
        s = t["s"].replace("&", "&amp;").replace("<", "&lt;")
        cap = t.get("cap_px") or ((x1 - x0) if t["vertical"] else (y1 - y0))
        fs = cap / CAP
        run = (y1 - y0) if t["vertical"] else (x1 - x0)
        fit = ' textLength="%s" lengthAdjust="spacingAndGlyphs"' % f(run) if len(t["s"]) > 1 else ""
        if t["vertical"] == "down":
            o.append('  <text font-size="%s"%s transform="translate(%s,%s) rotate(90)">%s</text>' % (f(fs), fit, f(x0), f((y0 + y1) / 2), s))
        elif t["vertical"]:
            o.append('  <text font-size="%s"%s transform="translate(%s,%s) rotate(-90)">%s</text>' % (f(fs), fit, f(x1), f((y0 + y1) / 2), s))
        else:
            o.append('  <text font-size="%s"%s x="%s" y="%s">%s</text>' % (f(fs), fit, f((x0 + x1) / 2), f(y1), s))
    o.append("</g>")
    o.append("</svg>")
    return "\n".join(o)



# ------------------------------------------------------------ symbol library
# Tracing can only ever be as good as ~80 px of anti-aliased ink. A WC or a basin is a KNOWN object, so once one is
# recognised it is re-drawn from a parametric symbol: true ellipse / circular arcs / G1 cubics, exactly mirror-symmetric,
# fitted to the traced box and orientation. The traced paths stay in the model as evidence but are not drawn.

def _frame(box, side):
    """Local frame of a symbol: origin at the front tip, u towards the back (the wall side), v = u turned +90 deg (screen)."""
    x0, y0, x1, y1 = box; cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    O, u = {"E": ((x0, cy), (1, 0)), "W": ((x1, cy), (-1, 0)), "S": ((cx, y0), (0, 1)), "N": ((cx, y1), (0, -1))}[side]
    v = (-u[1], u[0])
    L, Wd = ((x1 - x0), (y1 - y0)) if side in "EW" else ((y1 - y0), (x1 - x0))
    rot = {"E": 0, "S": 90, "W": 180, "N": 270}[side]
    P = lambda a, b: (O[0] + a * u[0] + b * v[0], O[1] + a * u[1] + b * v[1])
    return P, L, Wd, rot


def _pt(p):
    return f(p[0]) + "," + f(p[1])


def wc_symbol(box, side, F=0.725, bowl=None):
    """WC pan seen from above. F = position of the cistern front along the length (0 = bowl tip, 1 = back).
    bowl = (half length, half width) when the bowl was measured on its own (pixel-recognised symbols)."""
    P, L, Wd, rot = _frame(box, side)
    a, b = 0.42 * L, 0.385 * Wd                              # bowl ellipse: centre (a, 0)
    if bowl:
        a, b = bowl
    Fu = F * L
    vF = b * math.sqrt(max(0.0, 1 - ((Fu - a) / a) ** 2)) if Fu < 2 * a else 0.0
    parts = [{"id": "bowl", "kind": "path",
              "d": "M%s A%s,%s %d 1 0 %s" % (_pt(P(Fu, -vF)), f(a), f(b), rot, _pt(P(Fu, vF)))}]
    hl, e = 0.32 * Wd, 0.0                                  # seat edges end ON the cistern's back edge
    for nm, sg in (("seat-edge-1", -1), ("seat-edge-2", 1)):
        (xa, ya), (xb, yb) = P(a, sg * b), P(L - e, sg * hl)
        parts.append({"id": nm, "kind": "line", "x1": xa, "y1": ya, "x2": xb, "y2": yb})
    hA, c, hT, hB, r = 0.40 * Wd, 0.07 * L, 0.49 * Wd, 0.41 * Wd, 0.05 * L
    k = 0.5523
    def half(sg):                                           # front corner -> top edge -> back corner, for one side
        p0 = (Fu + c, sg * hT); p3 = (L - r, sg * hB)
        dd = math.hypot(p3[0] - p0[0], p3[1] - p0[1])
        te = _unit(np.array([p3[0] - p0[0], 1.4 * (p3[1] - p0[1])]))      # leaves the front corner level, arrives gently sloped
        top = (p0, (p0[0] + dd / 3.0, p0[1]), (p3[0] - te[0] * dd / 3.0, p3[1] - te[1] * dd / 3.0), p3)
        d_ = (L, sg * (hB - r))
        back = (p3, (p3[0] + k * r * te[0], p3[1] + k * r * te[1]), (d_[0], d_[1] + sg * k * r), d_)
        return top, back
    (topA, backA), (topB, backB) = half(-1), half(1)
    C = lambda q: "C%s %s %s" % (_pt(P(*q[1])), _pt(P(*q[2])), _pt(P(*q[3])))
    Cr = lambda q: "C%s %s %s" % (_pt(P(*q[2])), _pt(P(*q[1])), _pt(P(*q[0])))   # the same cubic, run backwards
    d = "M%s L%s A%s,%s %d 0 1 %s %s %s L%s %s %s A%s,%s %d 0 1 %s Z" % (
        _pt(P(Fu, hA)), _pt(P(Fu, -hA)), f(c), f(hT - hA), rot, _pt(P(Fu + c, -hT)), C(topA), C(backA),
        _pt(P(L, hB - r)), Cr(backB), Cr(topB), f(c), f(hT - hA), rot, _pt(P(Fu, hA)))
    parts.append({"id": "cistern", "kind": "path", "d": d})
    hh, sg_ = (vF if vF > 0.1 * Wd else 0.27 * Wd), 0.03 * L
    R = (hh * hh + sg_ * sg_) / (2 * sg_)
    parts.append({"id": "cistern-front", "kind": "path", "d": "M%s A%s,%s 0 0 1 %s" % (_pt(P(Fu, -hh)), f(R), f(R), _pt(P(Fu, hh)))})
    bx, by = P(Fu + 0.55 * (L - Fu), 0)
    parts.append({"id": "flush-button", "kind": "circle", "cx": bx, "cy": by, "r": 0.04 * Wd})
    # sample points for scoring against the traced evidence (bowl, cistern front and back, seat edges)
    tt = np.linspace(0, 2 * np.pi, 120)
    el = [(a + a * math.cos(t_), b * math.sin(t_)) for t_ in tt if a + a * math.cos(t_) <= Fu]
    fr = [(Fu, v_) for v_ in np.linspace(-hA, hA, 40)] + [(L, v_) for v_ in np.linspace(-(hB - r), hB - r, 30)]
    sl = [(a + s_ * (L - e - a), sg * (b + s_ * (hl - b))) for s_ in np.linspace(0, 1, 30) for sg in (-1, 1)]
    samples = np.array([P(*q) for q in el + fr + sl])
    return parts, samples


def basin_symbol(outer, inner, tap_box):
    """Wash basin: rounded outer slab, rounded bowl, and a tap drawn from two circles joined by their common tangents."""
    parts = [{"id": "slab", "kind": "rect", "x": outer[0], "y": outer[1], "w": outer[2] - outer[0], "h": outer[3] - outer[1],
              "rx": 0.065 * min(outer[2] - outer[0], outer[3] - outer[1])},
             {"id": "bowl", "kind": "rect", "x": inner[0], "y": inner[1], "w": inner[2] - inner[0], "h": inner[3] - inner[1],
              "rx": 0.13 * min(inner[2] - inner[0], inner[3] - inner[1])}]
    gaps = {"W": inner[0] - outer[0], "E": outer[2] - inner[2], "N": inner[1] - outer[1], "S": outer[3] - inner[3]}
    side = max(gaps, key=gaps.get); gap = gaps[side]
    if gap < 4:
        return parts, side
    n = {"W": (1, 0), "E": (-1, 0), "N": (0, 1), "S": (0, -1)}[side]      # from the wall edge into the bowl
    p = (-n[1], n[0])
    cx, cy = (inner[0] + inner[2]) / 2.0, (inner[1] + inner[3]) / 2.0
    if tap_box:                                              # keep the tap where the drawing has it
        cx, cy = (tap_box[0] + tap_box[2]) / 2.0, (tap_box[1] + tap_box[3]) / 2.0
    edge = {"W": outer[0], "E": outer[2], "N": outer[1], "S": outer[3]}[side]
    base = (edge + n[0] * gap * 0.5, cy) if side in "WE" else (cx, edge + n[1] * gap * 0.5)
    r2 = 0.30 * gap; r1 = 0.72 * r2
    Lt = max(1.7 * gap, (max(tap_box[2] - tap_box[0], tap_box[3] - tap_box[1]) if tap_box else 0.0))
    dd = Lt - r1 - r2
    C2 = base; C1 = (base[0] + n[0] * dd, base[1] + n[1] * dd)
    sn = (r2 - r1) / dd; cs = math.sqrt(1 - sn * sn)
    T = lambda Cc, rr, sg: (Cc[0] + rr * (sn * n[0] + sg * cs * p[0]), Cc[1] + rr * (sn * n[1] + sg * cs * p[1]))
    d = "M%s L%s A%s,%s 0 0 0 %s L%s A%s,%s 0 1 0 %s Z" % (_pt(T(C2, r2, 1)), _pt(T(C1, r1, 1)), f(r1), f(r1), _pt(T(C1, r1, -1)),
                                                          _pt(T(C2, r2, -1)), f(r2), f(r2), _pt(T(C2, r2, 1)))
    parts += [{"id": "tap-body", "kind": "path", "d": d},
              {"id": "tap-spout", "kind": "circle", "cx": C1[0], "cy": C1[1], "r": 0.5 * r1},
              {"id": "tap-head", "kind": "circle", "cx": C2[0], "cy": C2[1], "r": 0.4 * r2}]
    return parts, side


def _sample_fixture(p, step=1.0):
    if p["type"] == "circle":
        tt = np.linspace(0, 2 * np.pi, 24); return np.c_[p["cx"] + p["r"] * np.cos(tt), p["cy"] + p["r"] * np.sin(tt)]
    if p["type"] == "ellipse":
        return np.zeros((0, 2))
    out, cur = [], np.array(p["start"], float)
    for sg in p["segs"]:
        if sg[0] == "C":
            ctrl = np.array([cur] + [q for q in sg[1:]], float); out.append(_bez(ctrl, np.linspace(0, 1, 40))); cur = ctrl[3]
        elif sg[0] == "A":
            q = np.array(sg[1], float); out.append(arc_points(cur, q, sg[2], sg[3], sg[4])); cur = q
        else:
            q = np.array(sg[1], float); n_ = max(2, int(np.hypot(*(q - cur)) / step)); out.append(np.linspace(cur, q, n_)); cur = q
    return np.vstack(out) if out else np.zeros((0, 2))


def match_symbols(m):
    """Recognise WCs and basins among the fixture groups and replace their tracing by a drawn symbol."""
    T = m["wall_thickness_px"]; mm = m.get("mm_per_px")
    symbols = []
    for gi, grp in enumerate(m.get("fixture_groups", [])):
        paths = [m["fixtures"][i] for k_, i in grp if k_ == "path"]
        rects = [m["rects"][i] for k_, i in grp if k_ == "rect"]
        solids = [m["fixture_solids"][i] for k_, i in grp if k_ == "solid"]
        if len(rects) >= 2:                                  # basin: one rectangle inside another
            rr = sorted(rects, key=lambda r: -r["w"] * r["h"])
            o_ = [rr[0]["x"], rr[0]["y"], rr[0]["x"] + rr[0]["w"], rr[0]["y"] + rr[0]["h"]]
            i_ = [rr[1]["x"], rr[1]["y"], rr[1]["x"] + rr[1]["w"], rr[1]["y"] + rr[1]["h"]]
            if i_[0] >= o_[0] - 0.5 and i_[1] >= o_[1] - 0.5 and i_[2] <= o_[2] + 0.5 and i_[3] <= o_[3] + 0.5:
                tap = None
                if solids:
                    ev = np.vstack([_sample_fixture(r_) for r_ in solids[0]])
                    tap = [float(ev[:, 0].min()), float(ev[:, 1].min()), float(ev[:, 0].max()), float(ev[:, 1].max())]
                parts, side = basin_symbol(o_, i_, tap)
                symbols.append({"type": "basin", "group": gi, "box": o_, "wall_side": side, "parts": parts, "stroke": rr[0]["w_px"]})
            continue
        if len(paths) < 3:
            continue
        ev = np.vstack([_sample_fixture(p) for p in paths])
        box = [float(ev[:, 0].min()), float(ev[:, 1].min()), float(ev[:, 0].max()), float(ev[:, 1].max())]
        w_, h_ = box[2] - box[0], box[3] - box[1]
        lng, sht = max(w_, h_), min(w_, h_)
        size_ok = (560 <= lng * mm <= 860 and 330 <= sht * mm <= 520) if mm else (1.8 * T <= lng <= 3.4 * T)
        if not (size_ok and 1.3 <= lng / sht <= 2.0):
            continue
        best = None
        for side in ("EW" if w_ >= h_ else "SN"):
            for F in np.arange(0.66, 0.801, 0.01):
                _parts, smp = wc_symbol(box, side, float(F))
                d1 = np.hypot(smp[:, None, 0] - ev[None, :, 0], smp[:, None, 1] - ev[None, :, 1]).min(1)
                d2 = np.hypot(ev[:, None, 0] - smp[None, :, 0], ev[:, None, 1] - smp[None, :, 1]).min(1)
                sc = 0.6 * float((d1 <= 2.0).mean()) + 0.4 * float((d2 <= 3.0).mean())
                if best is None or sc > best[0]:
                    best = (sc, side, float(F))
        if best and best[0] >= 0.7:
            parts, _s = wc_symbol(box, best[1], best[2])
            symbols.append({"type": "wc", "group": gi, "box": box, "wall_side": best[1], "cistern_front": round(best[2], 3),
                            "match": round(best[0], 3), "parts": parts, "stroke": m["stroke_px"]})
    m["symbols"] = symbols
    return m


# ------------------------------------------------------- drawing structure
# What a person editing the drawing treats as ONE thing must be one object, and nothing more:
#   - a dimension chain is one segment per dimension (delete 2725 without losing 3325)
#   - a WC / basin is one group (bowl + cistern + button), but two WCs are two groups
#   - a door is its leaf + its swing
# Everything else stays an individual top-level object (no category groups: in Illustrator the Selection tool picks
# the outermost group, so a 'fixtures' group made every fixture select together).

def structure(m):
    T = m["wall_thickness_px"]
    # 0. a label's box belongs to the label: strokes lying wholly inside it are pieces of its glyphs that the text stage
    #    could not erase (fused / misread lettering on soft inputs, labels rebuilt from geometry), never linework
    if m.get("soft_input"):
        zones = [t_["box"] for t_ in m["texts"] if t_.get("angle") is None] + [u_["box"] for u_ in m.get("unread_text", [])]
        quads = [t_["quad"] for t_ in m["texts"] if t_.get("angle") is not None]
        def in_quad(x_, y_, q):
            sg_ = [(q[(i + 1) % 4][0] - q[i][0]) * (y_ - q[i][1]) - (q[(i + 1) % 4][1] - q[i][1]) * (x_ - q[i][0]) for i in range(4)]
            return all(v_ >= 0 for v_ in sg_) or all(v_ <= 0 for v_ in sg_)
        zones = [[bx - 0.25 * min(bw, bh), by - 0.25 * min(bw, bh), bw + 0.5 * min(bw, bh), bh + 0.5 * min(bw, bh)] for bx, by, bw, bh in zones]
        r_ = 1.7 * (m.get("dot_r") or 0)                    # a dot owns the crumbs of its own blurred blob
        zones += [[d_["cx"] - r_, d_["cy"] - r_, 2 * r_, 2 * r_] for d_ in m["dots"] if d_.get("from_stops")]
        def inside(x_, y_):
            return any(bx - 3 <= x_ <= bx + bw + 3 and by - 3 <= y_ <= by + bh + 3 for bx, by, bw, bh in zones)
        # the lines of ONE label stacked on each other are one zone as well: a bracket reaches from one line into the next
        hz_ = [t_["box"] for t_ in m["texts"] if t_.get("angle") is None and not t_["vertical"]]
        blocks = []
        for i_, (ax, ay, aw, ah) in enumerate(hz_):
            for bx, by, bw, bh in hz_[i_ + 1:]:
                if min(ax + aw, bx + bw) - max(ax, bx) >= 0.5 * min(aw, bw) and -2 <= max(ay, by) - min(ay + ah, by + bh) <= 0.6 * min(ah, bh):
                    x0_, y0_ = min(ax, bx), min(ay, by); pd_ = 0.25 * min(ah, bh)
                    blocks.append([x0_ - pd_, y0_ - pd_, max(ax + aw, bx + bw) - x0_ + 2 * pd_, max(ay + ah, by + bh) - y0_ + 2 * pd_])
        zones_same = zones + blocks
        def line_in(l):
            p1, p2 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
            if l.get("from") in ("curve-cap", "leader-foot"):
                return False                                # put there by reasoning about the drawing, not a traced crumb of a glyph
            return inside(*p1) and inside(*p2) and any(bx - 3 <= p1[0] <= bx + bw + 3 and by - 3 <= p1[1] <= by + bh + 3 and
                                                       bx - 3 <= p2[0] <= bx + bw + 3 and by - 3 <= p2[1] <= by + bh + 3 for bx, by, bw, bh in zones_same)
        m["lines"] = [l for l in m["lines"] if not line_in(l)]
        def fx_in(p):
            pts = _sample_fixture(p)
            return len(pts) > 0 and (all(inside(x_, y_) for x_, y_ in pts[::3]) or any(all(in_quad(x_, y_, q) for x_, y_ in pts[::3]) for q in quads))
        m["fixtures"] = [p for p in m["fixtures"] if not fx_in(p)]
        def inside_pad(x_, y_):                            # a '/' stands taller than the capitals of its label
            return any(bx - 0.4 * bh <= x_ <= bx + bw + 0.4 * bh and by - 0.4 * bh <= y_ <= by + bh + 0.4 * bh for bx, by, bw, bh in zones
                       if bw > bh) or inside(x_, y_)
        m["diagonals"] = [d for d in m.get("diagonals", []) if not (all(inside_pad(x_, y_) for x_, y_ in d)
                          and math.hypot(d[0][0] - d[-1][0], d[0][1] - d[-1][1]) <= 2.2 * max([z[3] for z in zones if z[2] > z[3]] or [0]))]
        m["fixture_solids"] = [rings for rings in m.get("fixture_solids", []) if not all(fx_in(r_) for r_ in rings)]
    # 1. dimension lines: split at the dots that sit on them
    out = []
    for l in m["lines"]:
        if "dash" in l:
            out.append(l); continue
        on = sorted(d["cx"] if l["o"] == "h" else d["cy"] for d in m["dots"]
                    if abs((d["cy"] if l["o"] == "h" else d["cx"]) - l["c"]) <= 1.0
                    and l["a"] - 1.0 <= (d["cx"] if l["o"] == "h" else d["cy"]) <= l["b"] + 1.0)
        if len(on) >= 2:
            cuts = [l["a"]] + on[1:-1] + [l["b"]]           # tails beyond the end dots stay with the end segments
            for a_, b_ in zip(cuts, cuts[1:]):
                if b_ - a_ >= 1.0:
                    out.append(dict(l, a=a_, b=b_, role="dimension"))
        elif len(on) == 1:
            out.append(dict(l, role="extension"))
        else:
            out.append(l)
    m["lines"] = out
    # 2. small closed rectangles made of exactly four lines (basins, cabinets) become one <rect>
    eq = lambda u, v: abs(u - v) <= 0.26
    free = [l for l in m["lines"] if "dash" not in l and not l.get("role")]
    hs = [l for l in free if l["o"] == "h"]; vs = [l for l in free if l["o"] == "v"]
    rects, used = [], set()
    for i, h1 in enumerate(hs):
        for h2 in hs[i + 1:]:
            if id(h1) in used or id(h2) in used or not (eq(h1["a"], h2["a"]) and eq(h1["b"], h2["b"])):
                continue
            y0, y1 = sorted((h1["c"], h2["c"]))
            if not (3 <= y1 - y0 <= 4 * T and 3 <= h1["b"] - h1["a"] <= 4 * T):
                continue
            side = [v for v in vs if id(v) not in used and eq(v["a"], y0) and eq(v["b"], y1) and (eq(v["c"], h1["a"]) or eq(v["c"], h1["b"]))]
            left = [v for v in side if eq(v["c"], h1["a"])]; right = [v for v in side if eq(v["c"], h1["b"])]
            if left and right:
                four = [h1, h2, left[0], right[0]]
                ws_ = [q.get("w", m["stroke_px"]) for q in four]
                used.update(id(q) for q in four)
                rects.append({"x": h1["a"], "y": y0, "w": h1["b"] - h1["a"], "h": y1 - y0, "w_px": sorted(ws_, key=lambda w_: (-ws_.count(w_), w_))[0]})
    m["lines"] = [l for l in m["lines"] if id(l) not in used]
    m["rects"] = rects
    # 3. fixture groups: parts whose boxes touch or nest are one symbol
    def bbox(p):
        if p["type"] == "circle":
            return [p["cx"] - p["r"], p["cy"] - p["r"], p["cx"] + p["r"], p["cy"] + p["r"]]
        if p["type"] == "ellipse":
            r_ = max(p["rx"], p["ry"]); return [p["cx"] - r_, p["cy"] - r_, p["cx"] + r_, p["cy"] + r_]
        pts = [p["start"]] + [q for sg in p["segs"] for q in (sg[1:] if sg[0] == "C" else [sg[1]])]
        return [min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts)]
    parts = [("path", i, bbox(p)) for i, p in enumerate(m["fixtures"])]
    parts += [("solid", i, [min(bbox(r)[0] for r in rings), min(bbox(r)[1] for r in rings), max(bbox(r)[2] for r in rings), max(bbox(r)[3] for r in rings)])
              for i, rings in enumerate(m.get("fixture_solids", []))]
    parts += [("rect", i, [r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]]) for i, r in enumerate(rects)]
    par = list(range(len(parts)))
    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    g_ = 2.5
    for a in range(len(parts)):
        for b in range(a + 1, len(parts)):
            A, B = parts[a][2], parts[b][2]
            if A[0] - g_ <= B[2] and B[0] - g_ <= A[2] and A[1] - g_ <= B[3] and B[1] - g_ <= A[3]:
                par[find(a)] = find(b)
    groups = {}
    for a in range(len(parts)):
        groups.setdefault(find(a), []).append(parts[a][:2])
    m["fixture_groups"] = sorted(groups.values(), key=lambda g: min(parts_i for _k, parts_i in g))
    # 4. doors: the swing arc and its leaf line
    for k, a in enumerate(m["arcs"]):
        a["leaf_line"] = None
        best = None
        for li, l in enumerate(m["lines"]):
            L_ = l["b"] - l["a"]
            if "dash" in l or l.get("role") or not (0.85 * a["r"] <= L_ <= 1.2 * a["r"]):
                continue
            # the hinge lies on the line, near one of its ends; the line points along one side of the quarter circle
            perp = abs((a["cy"] if l["o"] == "h" else a["cx"]) - l["c"]); along = (a["cx"] if l["o"] == "h" else a["cy"])
            if perp > 4.5:
                continue
            for e_, o_ in (("a", "b"), ("b", "a")):
                if abs(along - l[e_]) > 0.15 * a["r"]:
                    continue
                ang = (0.0 if l[o_] > l[e_] else 180.0) if l["o"] == "h" else (90.0 if l[o_] > l[e_] else 270.0)
                if min(abs((ang - x_ + 180) % 360 - 180) for x_ in (a["start"], a["start"] + a["span"])) <= 8:
                    sc = perp + abs(along - l[e_]) + abs(L_ - a["r"])
                    if best is None or sc < best[0]:
                        best = (sc, li)
        a["leaf_line"] = best[1] if best else None
        if a["leaf_line"] is not None:
            l = m["lines"][a["leaf_line"]]
            l["role"] = "door-leaf"
    return m


def inset_ring(ring, rings, d):
    """The ring moved by d towards the wall material (rings: all rings of the wall, even-odd).  Exact for straight edges."""
    P = [np.array(p_, float) for p_ in ring]; n = len(P)
    cnts = [np.array(r_, np.float32) for r_ in rings]
    def material(pt):
        return sum(1 for c_ in cnts if cv2.pointPolygonTest(c_, (float(pt[0]), float(pt[1])), False) > 0) % 2 == 1
    lines_ = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        e = b - a; L_ = float(np.hypot(*e))
        if L_ < 1e-9:
            lines_.append(None); continue
        nrm = np.array([-e[1], e[0]]) / L_
        mid = (a + b) / 2.0
        if not material(mid + nrm * min(0.5, d)):
            nrm = -nrm
        lines_.append((a + nrm * d, e / L_))
    out = []
    for i in range(n):
        l0, l1 = lines_[i - 1], lines_[i]
        if l0 is None or l1 is None:
            out.append(P[i].tolist()); continue
        (p0, u0), (p1, u1) = l0, l1
        den = u0[0] * u1[1] - u0[1] * u1[0]
        if abs(den) < 1e-6:
            out.append(p1.tolist()); continue
        t_ = ((p1[0] - p0[0]) * u1[1] - (p1[1] - p0[1]) * u1[0]) / den
        out.append((p0 + t_ * u0).tolist())
    return out


def to_svg(m):
    W, H = m["size"]; sw = m["stroke_px"]
    W0_, H0_ = m.get("source_size", [W, H])
    o = [svg_open(m, W, H, W0_, H0_)]
    ws0_ = m.get("wall_style")
    if ws0_ and ws0_.get("hatch"):
        hp_ = ws0_["hatch"]; per_ = hp_["spacing"] / math.sqrt(2.0)
        o.append('<defs><pattern id="wall-hatch" patternUnits="userSpaceOnUse" width="%s" height="%s" patternTransform="rotate(%d)">'
                 '<line x1="0" y1="0" x2="0" y2="%s" stroke="#%02x%02x%02x" stroke-width="1"/></pattern></defs>'
                 % ((f(per_), f(per_), 45 if hp_["slash"] else -45, f(per_)) + (int(hp_["grey"]),) * 3))
    ST = 'fill="none" stroke="#000" stroke-width="%s"'
    def line_el(l, id_, ind=""):
        x1, y1, x2, y2 = (l["a"], l["c"], l["b"], l["c"]) if l["o"] == "h" else (l["c"], l["a"], l["c"], l["b"])
        dash = ' stroke-dasharray="%s %s"' % (f(l["dash"][0]), f(l["dash"][1])) if "dash" in l else ' stroke-linecap="square"'
        return '%s<line id="%s" %s%s x1="%s" y1="%s" x2="%s" y2="%s"/>' % (ind, id_, ST % f(l.get("w", sw)), dash, f(x1), f(y1), f(x2), f(y2))
    for n_, g_ in enumerate(m.get("grey_solids", []), 1):  # under the walls: sills, parapets, lightweight walls drawn in grey
        d = "M" + " L".join(f(p[0]) + "," + f(p[1]) for p in g_["pts"]) + " Z"
        o.append('<path id="grey-%d" fill="#%02x%02x%02x" stroke="#000" stroke-width="%s" stroke-linejoin="miter" d="%s"/>' % ((n_,) + (int(g_["grey"]),) * 3 + (f(sw), d)))
    for n_, r_ in enumerate([r_ for r_ in m.get("partitions", []) if r_.get("fill")], 1):
        x0, x1, y0, y1 = (r_["a"], r_["b"], r_["c0"], r_["c1"]) if r_["o"] == "h" else (r_["c0"], r_["c1"], r_["a"], r_["b"])
        o.append('<rect id="partition-fill-%d" fill="#%02x%02x%02x" stroke="none" x="%s" y="%s" width="%s" height="%s"/>'
                 % ((n_,) + (int(r_["fill"]),) * 3 + (f(x0), f(y0), f(x1 - x0), f(y1 - y0))))
    for n_, w in enumerate([w for w in m["walls"] if not w["hole"]], 1):
        rings = [w] + [h for h in m["walls"] if h["hole"] and h["parent"] == w["idx"]]
        d = " ".join("M" + " L".join(f(p[0]) + "," + f(p[1]) for p in r["pts"]) + " Z" for r in rings)
        ws_ = m.get("wall_style")
        if ws_ and ws_.get("hatch"):
            # drawn as it was drawn: heavy outline (its OUTER edge is the wall face, so the path runs half a stroke inside) + hatch
            ow_ = float(ws_["outline_px"])
            d = " ".join("M" + " L".join(f(p[0]) + "," + f(p[1]) for p in inset_ring(r["pts"], [q["pts"] for q in rings], ow_ / 2.0)) + " Z" for r in rings)
            o.append('<path id="wall-%d" fill="url(#wall-hatch)" fill-rule="evenodd" stroke="#000" stroke-width="%s" stroke-linejoin="miter" d="%s"/>' % (n_, f(ow_), d))
            continue
        if ws_ and ws_.get("fill") is not None:
            o.append('<path id="wall-%d" fill="#%02x%02x%02x" fill-rule="evenodd" stroke="none" d="%s"/>' % ((n_,) + (int(ws_["fill"]),) * 3 + (d,)))
            continue
        o.append('<path id="wall-%d" fill="#000" fill-rule="evenodd" stroke="none" d="%s"/>' % (n_, d))
    cnt = {}
    for l in m["lines"]:
        if l.get("role") == "door-leaf":
            continue
        kind = "dashed-line" if "dash" in l else {"dimension": "dim-line", "extension": "dim-ext"}.get(l.get("role"), "line")
        cnt[kind] = cnt.get(kind, 0) + 1
        o.append(line_el(l, "%s-%d" % (kind, cnt[kind])))
    for n_, fl in enumerate(m.get("fillets", []), 1):
        o.append('<path id="corner-%d" %s d="M%s,%s A%s,%s 0 0 %d %s,%s"/>' % (n_, ST % f(fl["w"]), f(fl["from"][0]), f(fl["from"][1]),
                 f(fl["r"]), f(fl["r"]), fl["sweep"], f(fl["to"][0]), f(fl["to"][1])))
    for n_, p in enumerate(m.get("diagonals", []), 1):
        o.append('<polyline id="bifold-%d" %s stroke-linejoin="miter" points="%s"/>' % (n_, ST % f(sw), " ".join(f(x) + "," + f(y) for x, y in p)))
    for n_, p in enumerate(m.get("leaders", []), 1):
        o.append('<line id="leader-%d" %s x1="%s" y1="%s" x2="%s" y2="%s"/>' % (n_, ST % f(sw), f(p[0][0]), f(p[0][1]), f(p[1][0]), f(p[1][1])))
    for n_, dd in enumerate(m.get("dashed_diagonals", []), 1):
        o.append('<line id="dashed-diagonal-%d" %s stroke-dasharray="%s %s" x1="%s" y1="%s" x2="%s" y2="%s"/>' %
                 (n_, ST % f(sw), f(dd["dash"][0]), f(dd["dash"][1]), f(dd["p"][0]), f(dd["p"][1]), f(dd["q"][0]), f(dd["q"][1])))
    for n_, a in enumerate(m["arcs"], 1):
        a0, a1 = math.radians(a["start"]), math.radians(a["start"] + a["span"])
        x0, y0 = a["cx"] + a["r"] * math.cos(a0), a["cy"] + a["r"] * math.sin(a0)
        x1, y1 = a["cx"] + a["r"] * math.cos(a1), a["cy"] + a["r"] * math.sin(a1)
        rx_, ry_ = arc_radii(a)
        (x0, y0), (x1, y1) = arc_point(a, a["start"]), arc_point(a, a["start"] + a["span"])
        arc = '<path id="%s" %s d="M%s,%s A%s,%s 0 %d 1 %s,%s"/>' % ("angle-dim-%d-arc" % n_ if a.get("from") == "angle-note" else "curve-%d" % n_ if a.get("from") == "curve" else "door-%d-swing" % n_, ST % f(a.get("w", sw)), f(x0), f(y0), f(rx_), f(ry_),
                                                                                  1 if a["span"] > 180 else 0, f(x1), f(y1))
        if a.get("leaf_line") is not None:
            o.append('<g id="door-%d">' % n_); o.append("  " + arc); o.append(line_el(m["lines"][a["leaf_line"]], "door-%d-leaf" % n_, "  ")); o.append("</g>")
        else:
            o.append(arc)
    def fixture_part(kind, i, id_):
        if kind == "rect":
            r = m["rects"][i]
            return '<rect id="%s" %s x="%s" y="%s" width="%s" height="%s"/>' % (id_, ST % f(r["w_px"]), f(r["x"]), f(r["y"]), f(r["w"]), f(r["h"]))
        if kind == "solid":
            return '<path id="%s" fill="#000" fill-rule="evenodd" stroke="none" d="%s"/>' % (id_, " ".join(path_d(r) for r in m["fixture_solids"][i]))
        p = m["fixtures"][i]
        return '<path id="%s" %s stroke-linejoin="round" stroke-linecap="round" d="%s"/>' % (id_, ST % f(sw), path_d(p))
    sym_of = {s_["group"]: s_ for s_ in m.get("symbols", [])}
    sym_n = {}
    for n_, grp in enumerate(m.get("fixture_groups", []), 1):
        if n_ - 1 in sym_of:
            s_ = sym_of[n_ - 1]; sym_n[s_["type"]] = sym_n.get(s_["type"], 0) + 1
            gid = "%s-%d" % (s_["type"], sym_n[s_["type"]])
            o.append('<g id="%s">' % gid)
            for pt_ in s_["parts"]:
                head = '  <%s id="%s-%s" %s stroke-linejoin="round"' % ({"path": "path", "line": "line", "circle": "circle", "rect": "rect"}[pt_["kind"]],
                                                                       gid, pt_["id"], ST % f(s_["stroke"]))
                if pt_["kind"] == "path":
                    o.append('%s d="%s"/>' % (head, pt_["d"]))
                elif pt_["kind"] == "line":
                    o.append('%s x1="%s" y1="%s" x2="%s" y2="%s"/>' % (head, f(pt_["x1"]), f(pt_["y1"]), f(pt_["x2"]), f(pt_["y2"])))
                elif pt_["kind"] == "circle":
                    o.append('%s cx="%s" cy="%s" r="%s"/>' % (head, f(pt_["cx"]), f(pt_["cy"]), f(pt_["r"])))
                else:
                    o.append('%s x="%s" y="%s" width="%s" height="%s" rx="%s" ry="%s"/>' % (head, f(pt_["x"]), f(pt_["y"]), f(pt_["w"]), f(pt_["h"]), f(pt_["rx"]), f(pt_["rx"])))
            o.append("</g>")
            continue
        if len(grp) == 1:
            o.append(fixture_part(grp[0][0], grp[0][1], "fixture-%d" % n_)); continue
        o.append('<g id="fixture-%d">' % n_)
        for k_, (kind, i) in enumerate(grp, 1):
            o.append("  " + fixture_part(kind, i, "fixture-%d-part-%d" % (n_, k_)))
        o.append("</g>")
    for s_ in m.get("free_symbols", []):                   # fixtures recognised from the pixels and drawn clean
        nm_ = {"wc": "wc", "oval": "basin", "basin_d": "basin", "bifold": "bifold-door"}[s_["type"]]
        sym_n[nm_] = sym_n.get(nm_, 0) + 1
        gid = "%s-%d" % (nm_, sym_n[nm_])
        o.append('<g id="%s">' % gid)
        for pt_ in s_["parts"]:
            head = '  <%s id="%s-%s" %s stroke-linejoin="round"' % (pt_["kind"] if pt_["kind"] != "line" else "line", gid, pt_["id"], ST % f(s_["stroke"]))
            if pt_["kind"] == "path":
                o.append('%s d="%s"/>' % (head, pt_["d"]))
            elif pt_["kind"] == "line":
                o.append('%s x1="%s" y1="%s" x2="%s" y2="%s"/>' % (head, f(pt_["x1"]), f(pt_["y1"]), f(pt_["x2"]), f(pt_["y2"])))
            elif pt_["kind"] == "circle":
                o.append('%s cx="%s" cy="%s" r="%s"/>' % (head, f(pt_["cx"]), f(pt_["cy"]), f(pt_["r"])))
            elif pt_["kind"] == "ellipse":
                o.append('%s cx="%s" cy="%s" rx="%s" ry="%s"/>' % (head, f(pt_["cx"]), f(pt_["cy"]), f(pt_["rx"]), f(pt_["ry"])))
        o.append("</g>")
    for n_, d in enumerate(m["dots"], 1):
        o.append('<circle id="dim-dot-%d" fill="#000" cx="%s" cy="%s" r="%s"/>' % (n_, f(d["cx"]), f(d["cy"]), f(m["dot_r"])))
    for n_, u in enumerate(m.get("unread_text", []) if (not m.get("soft_input") or "--show-unread" in sys.argv) else [], 1):
        x, y, w, h = u["box"]
        o.append('<rect id="needs-review-%d" fill="none" stroke="#e0007a" stroke-width="1" stroke-dasharray="4 3" x="%s" y="%s" width="%s" height="%s"/>' % (n_, f(x), f(y), f(w), f(h)))
    FONT = "font-family=\"'Arial Narrow', 'Liberation Sans Narrow', 'TeX Gyre Heros Cn', 'Roboto Condensed', Arial, sans-serif\""
    CAP = 0.716
    lab_caps = [t_["cap_px"] for t_ in m["texts"] if t_.get("cap_px") and any(ch.isalpha() for ch in t_["s"]) and not t_["vertical"]]
    title_cap = float(np.median(lab_caps)) if lab_caps else None
    for n_, t in enumerate(m["texts"], 1):
        x0, y0, x1, y1 = t.get("ink") or [t["box"][0], t["box"][1], t["box"][0] + t["box"][2], t["box"][1] + t["box"][3]]
        s = t["s"].replace("&", "&amp;").replace("<", "&lt;")
        cap = t.get("cap_px") or ((x1 - x0) if t["vertical"] else (y1 - y0))
        run = (y1 - y0) if t["vertical"] else (x1 - x0)
        fit = ' textLength="%s" lengthAdjust="spacingAndGlyphs"' % f(run) if len(t["s"]) > 1 else ""
        head = '<text id="%s-%d" fill="#000" %s text-anchor="middle" font-size="%s"%s' % ("dim-text" if t["s"].isdigit() else "label", n_, FONT, f(cap / CAP), fit)
        if m.get("soft_input") and title_cap and cap >= 1.5 * title_cap and not t["vertical"] and t.get("angle") is None:
            # plan titles are single-stroke CAD lettering: thin for their size. A light face where the viewer has one.
            head = head.replace(FONT, "font-family=\"'Helvetica Neue', 'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif\" font-weight=\"300\"").replace('id="label-', 'id="title-')
        if t.get("angle") is not None:
            fit = ' textLength="%s" lengthAdjust="spacingAndGlyphs"' % f(t["run"])
            head = '<text id="dim-text-%d" fill="#000" %s text-anchor="middle" font-size="%s"%s' % (n_, FONT, f(cap / CAP), fit)
            o.append('%s transform="translate(%s,%s) rotate(%s)">%s</text>' % (head, f(t["baseline_mid"][0]), f(t["baseline_mid"][1]), f(t["angle"]), s))
        elif t["vertical"] == "down":
            o.append('%s transform="translate(%s,%s) rotate(90)">%s</text>' % (head, f(x0), f((y0 + y1) / 2), s))
        elif t["vertical"]:
            o.append('%s transform="translate(%s,%s) rotate(-90)">%s</text>' % (head, f(x1), f((y0 + y1) / 2), s))
        else:
            o.append('%s x="%s" y="%s">%s</text>' % (head, f((x0 + x1) / 2), f(y1), s))
    o.append("</svg>")
    return "\n".join(o)


def save_work_image(m, path):
    """The cleaned grey image the model was traced from, in the MODEL's coordinates (a soft scan is rectified to its written
    dimensions, so the image is warped the same way).  The app export reads wall fill and hatching from it."""
    gray = m.get("_gray")
    if gray is None:
        return
    un = m.get("_unrect")
    if un:
        H, W = gray.shape
        ident = (np.array([0.0]), np.array([0.0]))
        xs = np.arange(W, dtype=np.float32); ys = np.arange(H, dtype=np.float32)
        cx, dx = un.get("x", ident); cy, dy = un.get("y", ident)
        mx = (xs - np.interp(xs, cx, dx)).astype(np.float32); my = (ys - np.interp(ys, cy, dy)).astype(np.float32)
        gray = cv2.remap(gray, np.tile(mx, (H, 1)), np.tile(my[:, None], (1, W)), cv2.INTER_LINEAR, borderValue=255)
    cv2.imwrite(path, gray)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src, base = args[0], args[1]
    m = extract(src)
    if "--dump-extract" in sys.argv:
        import pickle; pickle.dump(m, open(base + ".extract.pkl", "wb"))
    read_title_lines(m)
    number_after_label(m)
    sanity_texts(m)
    vote_verify_numbers(m)
    solve_dimensions(m)
    scale_from_bar(m)
    estimate_scale(m)
    diagonal_dimensions(m)
    complete_labels(m)
    validate_slash_labels(m)
    read_level_notes(m)
    recognise_fixtures(m)
    slanted_strokes(m)
    bar_continuations(m)
    refine_soft(m)
    window_bands(m)
    mirror_swings(m)
    swing_leaves(m)
    swing_shapes(m)
    close_open_ends(m)
    if m.get("soft_input") and "--no-rectify" not in sys.argv:
        rectify_to_dimensions(m)                            # crisp inputs already agree with their numbers to the pixel
    m["dim_spans"] = m.pop("_dim_items", None) or []        # which number measures which two positions (for the app export)
    build_free_symbols(m)
    tidy_soft(m)
    partition_network(m)
    finish_soft(m)
    structure(m)
    match_symbols(m)
    save_work_image(m, base + ".work.png")
    m.pop("_gray", None); m.pop("_unrect", None); m.pop("_page_gray", None)
    m["round_numbers"] = m.pop("_round_plan", None)
    open(base + ".json", "w").write(json.dumps(m))
    # default: flat, one object per editable thing. --grouped: the older category groups (walls / lines / text ...)
    open(base + ".svg", "w").write(to_svg_grouped(m) if "--grouped" in sys.argv else to_svg(m))
    if "dimension_report" in m:
        r = m["dimension_report"]
        if (m.get("scale_source") or {}).get("estimated"):
            print("no written dimensions: scale ESTIMATED from %d door swing(s) taken as %d mm leaves: %.2f mm/px" % (m["scale_source"]["swings"], DOOR_LEAF_MM, m["mm_per_px"]))
        elif m.get("mm_per_px"):
            print("scale %.3f mm/px | %d dimension labels tied to geometry" % (m["mm_per_px"], r.get("labels_tied_to_geometry", 0)))
        else:
            print("no written dimensions and no door swing found: the drawing has no scale (clean-up stages that need one were skipped)")
        for fx in r.get("inferred_from_geometry", []):
            print("  unreadable label sized from geometry: %-6s -> %s  (measured %d mm)" % (fx["was"] or "-", fx["to"], fx["measured_mm"]))
        for fx in r.get("ocr_repaired", []):
            print("  OCR repaired by geometry: %-6s -> %s  (measured %d mm)" % (fx["from"], fx["to"], fx["measured_mm"]))
        for c in r.get("chains", []):
            print("  chain %s = %d  vs total %d  %s" % (" + ".join(map(str, c["parts"])), sum(c["parts"]), c["total"], "OK" if c["ok"] else "MISMATCH"))
    dashed = sum(1 for l in m["lines"] if "dash" in l)
    print("skew %.2f deg | wall T %.1fpx | walls %d | lines %d (%d dashed) | arcs %d | dots %d | texts %d | fixture paths %d"
          % (m["skew_deg"], m["wall_thickness_px"], sum(1 for w in m["walls"] if not w["hole"]),
             len(m["lines"]), dashed, len(m["arcs"]), len(m["dots"]), len(m["texts"]), len(m["fixtures"])))
