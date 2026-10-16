"""The app's wall footprints, as the app builds them from the evidence (round 37, J, 15 Oct: "all of those step should
be removed").

The exporter makes a few choices the app's own joining decides the look of: how thick a short jog between two pieces of
one wall line is, and where a standalone wall's faces go beside the walls it stands against.  The app joins walls in
lib/floor-plan-wall-footprints.ts and lib/floor-plan-wall-square-corners.ts (after vectorizer-face-millimetres.ts put
each level or plumb wall's faces on whole millimetres), and a jog came out with a step beside it either way round
depending on its neighbours.  This module replays those rules for a handful of wall edges near one place, unites the
footprints and counts the steps of the outline as the app check (tools/corpus/appcheck.py, steps counted sideways)
counts them, so the exporter can take the choice that leaves none.

Replayed, in source pixels at the evidence's scale:
  - alignVectorizerFaces: a level or plumb edge's two faces on the nearest whole millimetre (an odd thickness gives way
    on the face no neighbour shares), its centre-line and thickness from them, each node where its edges put it (the
    longer edge last); a slanted edge keeps its centre-line, its thickness in 5 mm steps;
  - applyCanonicalWallFootprintJoins: every wall a rectangle; at a node where every wall runs along one frame, one wall
    crosses another and it is not a plain L of two long walls, each wall's end runs on past the node by half the
    thickest wall crossing it (a square corner); else the walls' faces are mitred where they meet (within the app's
    reach); a wall shorter than its thickness, or whose mitred footprint is too small or misses its own centre-line,
    goes back to its plain rectangle;
  - the union of the footprints (the walls seen from above) and its steps: a jog of 0.1 to 2 px between two sides of
    2 px or more running on the same way, measured sideways, with the outline on whole millimetres.
Not replayed: a wall carried straight through a node at another angle (lib/floor-plan-wall-through-joins.ts; such a
node is mitred here), and the app's own scale solve (the evidence's scale stands in).  On the round-37 corpus this
replay gave the app check's own step count beside 604 of 616 jogs.  A change to those files of the app must be made
here too.
"""
import math

WALL_JOIN_EPSILON_MM = 0.01
HALF_DEGREE_SINE = math.sin(math.radians(0.5))
MIN_THICKNESS_MM, MAX_THICKNESS_MM = 40, 600


def _key(p):
    return (round(p[0], 3), round(p[1], 3))


def _js_round(v):
    return math.floor(v + 0.5)


class Wall:
    """one wall: centre-line a -> b and thickness t (source px), and its footprint {sl, el, er, sr} (start / end, left /
    right of a -> b)"""
    __slots__ = ("id", "a", "b", "t", "fp", "eps")

    def __init__(self, id_, a, b, t, eps):
        self.id, self.a, self.b, self.t, self.eps = id_, (float(a[0]), float(a[1])), (float(b[0]), float(b[1])), float(t), eps
        self.fp = None

    def length(self):
        return math.hypot(self.b[0] - self.a[0], self.b[1] - self.a[1])

    def rect(self):
        (ax, ay), (bx, by) = self.a, self.b
        L = self.length()
        if L <= self.eps:
            return {"sl": self.a, "el": self.b, "er": self.b, "sr": self.a}
        nx, ny = -(by - ay) / L * self.t / 2, (bx - ax) / L * self.t / 2
        return {"sl": (ax + nx, ay + ny), "el": (bx + nx, by + ny), "er": (bx - nx, by - ny), "sr": (ax - nx, ay - ny)}

    def polygon(self):
        return [self.fp["sl"], self.fp["el"], self.fp["er"], self.fp["sr"]]


class _End:
    """one wall's end at a node: the angle points from the node into the wall"""
    __slots__ = ("w", "end", "joint", "angle")

    def __init__(self, w, end):
        (ax, ay), (bx, by) = w.a, w.b
        L, sign = w.length(), (1 if end == "start" else -1)
        self.w, self.end, self.joint = w, end, (w.a if end == "start" else w.b)
        self.angle = math.atan2((by - ay) / L * sign, (bx - ax) / L * sign)


def _offset_line(w, side):
    """the wall's face on `side` (1 left, -1 right of a -> b) as (point, direction), or None"""
    (ax, ay), (bx, by) = w.a, w.b
    L = w.length()
    if L <= w.eps:
        return None
    d, h = ((bx - ax) / L, (by - ay) / L), w.t / 2
    return ((ax - d[1] * h * side, ay + d[0] * h * side), d)


def _crossing_point(f, s):
    if not f or not s:
        return None
    det = f[1][0] * s[1][1] - f[1][1] * s[1][0]
    if abs(det) <= 1e-6:
        return None
    dx, dy = s[0][0] - f[0][0], s[0][1] - f[0][1]
    t = (dx * s[1][1] - dy * s[1][0]) / det
    return (f[0][0] + f[1][0] * t, f[0][1] + f[1][1] * t)


def _original_side(end, outward):
    return outward if end == "start" else -outward


def _set_corner(ref, outward, p):
    side = _original_side(ref.end, outward)
    ref.w.fp[("s" if ref.end == "start" else "e") + ("l" if side == 1 else "r")] = p


def _turn_from_frame(angle, frame):
    q = math.pi / 2
    t = math.fmod(angle - frame, q)
    return t - q if t > q / 2 else t + q if t < -q / 2 else t


def _crossing(ends, ref):
    return [o for o in ends if o is not ref and abs(math.cos(o.angle - ref.angle)) <= HALF_DEGREE_SINE * 2]


def _square_node(ends):
    """squareOrthogonalWallNode: True when the node was squared"""
    if len(ends) < 2:
        return False
    turns = [_turn_from_frame(r.angle, ends[0].angle) for r in ends]
    if math.sin(max(turns) - min(turns)) > 2 * HALF_DEGREE_SINE or not any(_crossing(ends, r) for r in ends):
        return False
    thickest = max(r.w.t for r in ends)
    if len(ends) == 2 and all(r.w.length() >= thickest - r.w.eps for r in ends):
        return False                                         # (a plain L of two long walls keeps its mitre)
    for r in ends:
        run = max([0.0] + [o.w.t for o in _crossing(ends, r)]) / 2
        end = (r.joint[0] - math.cos(r.angle) * run, r.joint[1] - math.sin(r.angle) * run)
        for outward in (1, -1):
            line = _offset_line(r.w, _original_side(r.end, outward))
            if line:
                _set_corner(r, outward, (end[0] + line[0][0] - r.w.a[0], end[1] + line[0][1] - r.w.a[1]))
    return True


def _mitre_node(ends, mm_px):
    """miterAuthoredWallNode"""
    if len(ends) < 2:
        return
    s = sorted(ends, key=lambda r: r.angle)
    for i, cur in enumerate(s):
        nxt = s[(i + 1) % len(s)]
        if (nxt.angle - cur.angle + 2 * math.pi) % (2 * math.pi) <= 1e-6:
            continue
        p = _crossing_point(_offset_line(cur.w, _original_side(cur.end, 1)), _offset_line(nxt.w, _original_side(nxt.end, -1)))
        reach = max(250.0 / mm_px, 4 * max(cur.w.t, nxt.w.t))
        if p is None or math.hypot(p[0] - cur.joint[0], p[1] - cur.joint[1]) > reach:
            continue
        _set_corner(cur, 1, p)
        _set_corner(nxt, -1, p)


def _inside(p, poly):
    hit = False
    for i in range(len(poly)):
        a, b = poly[i], poly[i - 1]
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
    return hit


def _on_outline(p, poly, eps):
    for i in range(len(poly)):
        a, b = poly[i - 1], poly[i]
        ex, ey = b[0] - a[0], b[1] - a[1]
        l2 = ex * ex + ey * ey
        if l2 > eps * eps:
            t = max(0.0, min(1.0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2))
            if math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t) <= eps:
                return True
    return False


def _stable(w, mm_px):
    """wallFootprintIsStable"""
    L = w.length()
    if L <= w.eps or L < w.t - w.eps:
        return False                                         # (shorter than its thickness: a plain rectangle)
    P = w.polygon()
    area = sum(P[i][0] * P[(i + 1) % 4][1] - P[(i + 1) % 4][0] * P[i][1] for i in range(4))
    on_own_line = all(_on_outline(q, P, w.eps) or _inside(q, P) for q in
                      [(w.a[0] + (w.b[0] - w.a[0]) * f, w.a[1] + (w.b[1] - w.a[1]) * f) for f in (0.25, 0.5, 0.75)])
    return math.isfinite(area) and abs(area) >= max(1.0 / (mm_px * mm_px), L * w.t * 0.25) and on_own_line


def footprints(walls, mm_px):
    """applyCanonicalWallFootprintJoins on walls joined where their ends meet (to a thousandth of a pixel)"""
    for w in walls:
        w.fp = w.rect()
    nodes = {}
    for w in walls:
        if w.length() > w.eps:
            for end in ("start", "end"):
                nodes.setdefault(_key(w.a if end == "start" else w.b), []).append(_End(w, end))
    for ends in nodes.values():
        if not _square_node(ends):
            _mitre_node(ends, mm_px)
    for w in walls:
        if not _stable(w, mm_px):
            w.fp = w.rect()
    return walls


def _axis(e, mm_px):
    (x0, y0), (x1, y1) = e["sourcePx"][:2]
    t = float(e["thicknessPx"])
    level = y0 == y1 and x0 != x1
    if (not level and not (x0 == x1 and y0 != y1)) or t <= 0:
        return None
    c = y0 if level else x0
    lo, hi = (c - t / 2) * mm_px, (c + t / 2) * mm_px
    span = (min(x0, x1), max(x0, x1)) if level else (min(y0, y1), max(y0, y1))
    return {"e": e, "level": level, "from": span[0], "to": span[1], "lo": lo, "hi": hi, "low": _js_round(lo), "high": _js_round(hi)}


def _face_first(ax, axes):
    def shared(side):
        return any(o is not ax and o["level"] == ax["level"] and o["from"] <= ax["to"] + 1 and o["to"] >= ax["from"] - 1
                   and o[side] == ax[side] for o in axes)
    low, high = ax["low"], ax["high"]
    if (high - low) % 2 != 0:
        low_shared, high_shared = shared("low"), shared("high")
        move_high = low_shared if low_shared != high_shared else abs(ax["hi"] - high) >= abs(ax["lo"] - low)
        if move_high:
            high += 1 if ax["hi"] > high else -1
        else:
            low += 1 if ax["lo"] > low else -1
    return (low, high) if MIN_THICKNESS_MM <= high - low <= MAX_THICKNESS_MM else None


def aligned(edges, mm_px):
    """alignVectorizerFaces on wall edges: [(id, a, b, thickness)] in source px"""
    axes = [a for a in (_axis(e, mm_px) for e in edges) if a]
    fit = {}
    for ax in axes:
        faces = _face_first(ax, axes)
        if faces:
            fit[ax["e"]["id"]] = (ax["level"], (faces[0] + faces[1]) / 2.0 / mm_px, (faces[1] - faces[0]) / mm_px)
    node = {}
    length = lambda e: math.hypot(e["sourcePx"][1][0] - e["sourcePx"][0][0], e["sourcePx"][1][1] - e["sourcePx"][0][1])
    for e in sorted(edges, key=length):                      # (the longer edge last: it wins a straight joint)
        f = fit.get(e["id"])
        for v in e["sourcePx"][:2] if f else ():
            node.setdefault(_key(v), [None, None])[1 if f[0] else 0] = f[1]
    out = []
    for e in edges:
        f, ends = fit.get(e["id"]), []
        for v in e["sourcePx"][:2]:
            n = node.get(_key(v), [None, None])
            x, y = (v[0] if n[0] is None else n[0]), (v[1] if n[1] is None else n[1])
            if f:
                x, y = (x, f[1]) if f[0] else (f[1], y)
            ends.append((x, y))
        if f:
            t = f[2]
        else:
            step = 1 if _axis(e, mm_px) else 5
            t = max(MIN_THICKNESS_MM, min(MAX_THICKNESS_MM, _js_round(float(e["thicknessPx"]) * mm_px / step) * step)) / mm_px
        out.append((e["id"], ends[0], ends[1], t))
    return out


def _cuts(p, q, a, b):
    """where along pq (0..1, ends excluded) segment ab crosses or touches it, or lies along it"""
    r, s = (q[0] - p[0], q[1] - p[1]), (b[0] - a[0], b[1] - a[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12:
        if abs((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) >= 1e-9 * max(1.0, math.hypot(*r)):
            return []
        L2 = r[0] * r[0] + r[1] * r[1]
        return [t for t in (((c[0] - p[0]) * r[0] + (c[1] - p[1]) * r[1]) / L2 for c in (a, b)) if 0 < t < 1]
    t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den
    u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den
    return [t] if -1e-9 <= u <= 1 + 1e-9 and 0 < t < 1 else []


def union_outline(polys, d=1e-4):
    """the outline of the polygons' union as segments, each walked with the inside on its left: every polygon edge cut
    where another polygon's edges meet it, the pieces kept that have the union on one side only (one of two pieces
    lying on each other, facing the same way)"""
    def area2(P):
        return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    polys = [P if area2(P) > 0 else P[::-1] for P in polys if len(P) >= 3 and abs(area2(P)) > 1e-12]
    inside_any = lambda x: any(_inside(x, P) for P in polys)
    seen, out = set(), []
    for i, P in enumerate(polys):
        for k in range(len(P)):
            p, q = P[k], P[(k + 1) % len(P)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            if L <= 1e-9:
                continue
            ts = {0.0, 1.0}
            for j, Q in enumerate(polys):
                if j != i:
                    for m in range(len(Q)):
                        ts.update(_cuts(p, q, Q[m], Q[(m + 1) % len(Q)]))
            ts = sorted(ts)
            n = ((p[1] - q[1]) / L, (q[0] - p[0]) / L)
            at = lambda t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
            for t0, t1 in zip(ts, ts[1:]):
                if (t1 - t0) * L <= 1e-7:
                    continue
                m = at((t0 + t1) / 2)
                if inside_any((m[0] - n[0] * d, m[1] - n[1] * d)) or not inside_any((m[0] + n[0] * d, m[1] + n[1] * d)):
                    continue
                seg = (at(t0), at(t1))
                k_ = tuple(round(v, 5) for v in seg[0] + seg[1])
                if k_ not in seen:
                    seen.add(k_)
                    out.append(seg)
    return out


def rings(segs, tol=1e-4):
    """outline segments chained into rings of points (a pinch point turns sharpest left), straight-on points merged"""
    starts = {}
    for s in segs:
        starts.setdefault((round(s[0][0] / tol), round(s[0][1] / tol)), []).append(s)
    used, out = set(), []
    for s in segs:
        if id(s) in used:
            continue
        ring, cur = [s[0]], s
        used.add(id(s))
        while True:
            ring.append(cur[1])
            nxt = [c for c in starts.get((round(cur[1][0] / tol), round(cur[1][1] / tol)), []) if id(c) not in used]
            if not nxt:
                break
            heading = math.atan2(cur[1][1] - cur[0][1], cur[1][0] - cur[0][0])
            cur = min(nxt, key=lambda c: (math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]) - heading + 3 * math.pi) % (2 * math.pi))
            used.add(id(cur))
        if len(ring) > 2 and math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) <= 1e-3:
            ring.pop()
        out.append(_straightened(ring))
    return out


def _straightened(ring):
    changed = True
    while changed and len(ring) > 3:
        changed = False
        for i in range(len(ring)):
            a, b, c = ring[i - 1], ring[i], ring[(i + 1) % len(ring)]
            cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
            if abs(cross) <= 1e-7 * max(1.0, math.hypot(c[0] - a[0], c[1] - a[1])) or math.hypot(b[0] - a[0], b[1] - a[1]) <= 1e-6:
                del ring[i]
                changed = True
                break
    return ring


def steps(ring_list, mm_px, least=0.1):
    """the app check's steps (appcheck.steps, round 37) on rings in source px, their points on whole millimetres:
    [(x, y, size)]"""
    found = []
    for P in ring_list:
        P = [(round(p[0] * mm_px) / mm_px, round(p[1] * mm_px) / mm_px) for p in P]
        n = len(P)
        for i in range(n if n >= 4 else 0):
            a, b, c, d = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
            u, w = (b[0] - a[0], b[1] - a[1]), (d[0] - c[0], d[1] - c[1])
            lu, lw = math.hypot(*u), math.hypot(*w)
            if math.hypot(c[0] - b[0], c[1] - b[1]) >= 2.0 or lu < 2 or lw < 2 \
                    or (u[0] * w[0] + u[1] * w[1]) / (lu * lw) < math.cos(math.radians(5)):
                continue
            size = abs((c[0] - b[0]) * u[1] - (c[1] - b[1]) * u[0]) / lu
            if size >= least:
                found.append(((b[0] + c[0]) / 2.0, (b[1] + c[1]) / 2.0, size))
    return found


def local_walls(edges, centre, reach, mm_px, override=None):
    """the app's walls, with footprints, of the wall edges within `reach` px of `centre` and of the edges sharing their
    ends; `override` {edge id: thickness, or {field: value}} changes an edge for the replay only"""
    override = override or {}

    def gap(e):
        (ax, ay), (bx, by) = e["sourcePx"][:2]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 <= 0 else max(0.0, min(1.0, ((centre[0] - ax) * dx + (centre[1] - ay) * dy) / L2))
        return math.hypot(centre[0] - ax - t * dx, centre[1] - ay - t * dy)

    def changed(e):
        o = override.get(e["id"])
        return e if o is None else dict(e, **o) if isinstance(o, dict) else dict(e, thicknessPx=o)

    near = [e for e in edges if gap(e) <= reach]
    ends = {_key(v) for e in near for v in e["sourcePx"][:2]}
    ids = {e["id"] for e in near} | {e["id"] for e in edges if any(_key(v) in ends for v in e["sourcePx"][:2])}
    eps = WALL_JOIN_EPSILON_MM / mm_px
    local = [changed(e) for e in edges if e["id"] in ids]
    return footprints([Wall(i, a, b, t, eps) for i, a, b, t in aligned(local, mm_px)], mm_px)


def local_steps(edges, centre, radius, mm_px, override=None):
    """the steps of the app's walls within `radius` px of `centre` (the walls within radius + 40 px replayed)"""
    walls = [w for w in local_walls(edges, centre, radius + 40.0, mm_px, override) if w.length() > w.eps]
    found = steps(rings(union_outline([w.polygon() for w in walls])), mm_px)
    return [s for s in found if math.hypot(s[0] - centre[0], s[1] - centre[1]) <= radius]
