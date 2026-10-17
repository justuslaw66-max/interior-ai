"""The app check's slots, seams and steps, replayed on the evidence (round 39b; J, 13 Oct: "a floor plan should never have
a small gap like that").

tools/corpus/appcheck.py looks at the app's walls from above, just under the ceiling (above every door and window), as
the app unites its wall solids, and counts:
  - holes (step 4): floor plan that is neither wall nor inside a room, which a square of 1.5 wall thicknesses closes
    over - a slot when it is that long, else a notch;
  - seams (step 4b): an outline of the united walls that runs inside the walls' area - two solids that only touch, or a
    hairline gap between them;
  - steps (step 4c): a jog of 0.1 to 2 px in an outline whose sides before and after run on the same way.
This module replays them on an evidence dict, with the app's walls as app_footprints.py builds them (faces on whole
millimetres, square corners and mitres) and their union outline, so that round 39's reading can be compared with round
38's before the exporter keeps it.  Rasterised as the app check rasterises the app's own polygons.
"""
import math

import cv2
import numpy as np

import app_footprints as af


SAME_FACE_MM = 3.5                                       # (vectorizer-standalone-walls.ts)


def _lined_up(edges, used, mm):
    """the standalone walls (edges no room uses) lined up with the room walls beside them as the app lines them up
    (vectorizer-standalone-walls.ts, in short): a face within the app's rounding reach (3.5 mm) of a room wall's face
    beside it, facing the same way, moves onto it, and so does a free end onto a face across its run or onto the end of a
    room wall in line with it.  (Without it the replay finds a hairline seam where the app lines the faces up.)"""
    tol = SAME_FACE_MM / mm
    axis = lambda e: (0 if abs(e["sourcePx"][0][1] - e["sourcePx"][1][1]) < 1e-6 else 1 if abs(e["sourcePx"][0][0] - e["sourcePx"][1][0]) < 1e-6 else None)
    faces = {0: [], 1: []}                                   # (face coordinate, side -1 / +1, along from, along to)
    for e in edges:
        a = axis(e)
        if a is None or e["id"] not in used:
            continue
        c = e["sourcePx"][0][1] if a == 0 else e["sourcePx"][0][0]
        lo, hi = sorted([e["sourcePx"][0][0 if a == 0 else 1], e["sourcePx"][1][0 if a == 0 else 1]])
        t = float(e["thicknessPx"]) / 2
        faces[a] += [(c - t, -1, lo, hi), (c + t, 1, lo, hi)]
    out = []
    for e in edges:
        a = axis(e)
        if a is None or e["id"] in used or not used:
            out.append(e); continue
        c = e["sourcePx"][0][1] if a == 0 else e["sourcePx"][0][0]
        lo, hi = sorted([e["sourcePx"][0][0 if a == 0 else 1], e["sourcePx"][1][0 if a == 0 else 1]])
        t = float(e["thicknessPx"]) / 2
        best = None
        for f, side in ((c - t, -1), (c + t, 1)):
            for g, gs, glo, ghi in faces[a]:
                if gs == side and abs(g - f) <= tol and glo <= hi + 1 and ghi >= lo - 1 and (best is None or abs(g - f) < abs(best)):
                    best = g - f
        if best:
            e = dict(e, sourcePx=[[p[0], p[1] + best] if a == 0 else [p[0] + best, p[1]] for p in e["sourcePx"][:2]])
            c += best
        # and each free end along its run onto a room wall's face across it, or onto the end of one in line with it
        al = 0 if a == 0 else 1                              # (the coordinate along the run)
        ends = []
        for q in edges:
            qa = axis(q)
            if qa is None or q["id"] not in used:
                continue
            qc = q["sourcePx"][0][1] if qa == 0 else q["sourcePx"][0][0]
            qlo, qhi = sorted([q["sourcePx"][0][0 if qa == 0 else 1], q["sourcePx"][1][0 if qa == 0 else 1]])
            qt = float(q["thicknessPx"]) / 2
            if qa != a and qlo - qt <= c + t and qhi + qt >= c - t:
                ends += [qc - qt, qc + qt]
            elif qa == a and abs(qc - c) <= t:
                ends += [qlo, qhi]
        P = [list(p) for p in e["sourcePx"][:2]]
        for p in P:
            near = [v for v in ends if abs(v - p[al]) <= tol]
            if near:
                p[al] = min(near, key=lambda v: abs(v - p[al]))
        if P != [list(p) for p in e["sourcePx"][:2]]:
            e = dict(e, sourcePx=P)
        out.append(e)
    return out


def _walls(ev):
    mm = float((ev.get("scale") or {}).get("millimetresPerPixel") or 10.0)
    used = {i for r in ev.get("rooms", []) for i in r.get("edgeIds", [])}
    edges = _lined_up([e for e in ev.get("wallEdges", []) if e.get("thicknessPx") and len(e.get("sourcePx") or []) >= 2], used, mm)
    eps = af.WALL_JOIN_EPSILON_MM / mm
    walls = af.footprints([af.Wall(i, a, b, t, eps) for i, a, b, t in af.aligned(edges, mm)], mm)
    return [w for w in walls if w.length() > w.eps], mm


def _box(P):
    xs, ys = [p[0] for p in P], [p[1] for p in P]
    return min(xs), min(ys), max(xs), max(ys)


def union_outline(polys, d=1e-4):
    """app_footprints.union_outline, each polygon cut only by those whose boxes meet its own (the same outline, faster)"""
    def area2(P):
        return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    polys = [P if area2(P) > 0 else P[::-1] for P in polys if len(P) >= 3 and abs(area2(P)) > 1e-12]
    boxes = [_box(P) for P in polys]
    near = [[j for j, b in enumerate(boxes) if b[0] <= a[2] + 1e-6 and a[0] <= b[2] + 1e-6 and b[1] <= a[3] + 1e-6 and a[1] <= b[3] + 1e-6]
            for a in boxes]
    seen, out = set(), []
    for i, P in enumerate(polys):
        others = [j for j in near[i] if j != i]
        inside_any = lambda x: any(af._inside(x, polys[j]) for j in near[i])
        for k in range(len(P)):
            p, q = P[k], P[(k + 1) % len(P)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            if L <= 1e-9:
                continue
            ts = {0.0, 1.0}
            for j in others:
                Q = polys[j]
                for m in range(len(Q)):
                    ts.update(af._cuts(p, q, Q[m], Q[(m + 1) % len(Q)]))
            ts = sorted(ts)
            n = ((p[1] - q[1]) / L, (q[0] - p[0]) / L)
            at = lambda t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
            for t0, t1 in zip(ts, ts[1:]):
                if (t1 - t0) * L <= 1e-7:
                    continue
                mid = at((t0 + t1) / 2)
                if inside_any((mid[0] - n[0] * d, mid[1] - n[1] * d)) or not inside_any((mid[0] + n[0] * d, mid[1] + n[1] * d)):
                    continue
                seg = (at(t0), at(t1))
                key = tuple(round(v, 5) for v in seg[0] + seg[1])
                if key not in seen:
                    seen.add(key)
                    out.append(seg)
    return out


def wall_T(ev):
    """the plan's wall thickness as the app check measures it: the median of its room walls' (leftout.wall_T)"""
    used = {i for r in ev.get("rooms", []) for i in r.get("edgeIds", [])}
    ts = sorted(float(e["thicknessPx"]) for e in ev.get("wallEdges", []) if e.get("thicknessPx") and (e["id"] in used or not used))
    return ts[len(ts) // 2] if ts else 6.0


def flaws(ev):
    """{"slots": [(x, y, w, h)], "notches": [...], "seams": [(x, y, length)], "steps": [(x, y, size)]} in source px"""
    walls, mm = _walls(ev)
    out = {"slots": [], "notches": [], "seams": [], "steps": []}
    if not walls:
        return out
    polys = [w.polygon() for w in walls]
    rings = [r for r in af.rings(union_outline(polys)) if len(r) >= 3]
    W, H = int(ev["page"]["widthPx"]), int(ev["page"]["heightPx"])

    def fill_at(Z):
        # the union's rings filled as the app check fills the app's polygons; where a ring did not chain (walls lying
        # on each other), only what lies within a pixel of a wall's own footprint
        ring_fill = np.zeros((H * Z, W * Z), np.uint8)
        cv2.fillPoly(ring_fill, [np.round(np.array(r) * Z).astype(np.int32) for r in rings], 255)
        own = np.zeros_like(ring_fill)
        for P in polys:
            cv2.fillPoly(own, [np.round(np.array(P) * Z).astype(np.int32)], 255)
        return ring_fill & cv2.dilate(own, np.ones((2 * Z + 1, 2 * Z + 1), np.uint8))

    Z = 4                                                    # holes (appcheck.holes)
    wall = fill_at(Z)
    rooms = np.zeros_like(wall)
    for r in ev.get("rooms", []):
        if len(r.get("sourcePoints") or []) >= 3:
            cv2.fillPoly(rooms, [np.round(np.array([[q["x"], q["y"]] for q in r["sourcePoints"]]) * Z).astype(np.int32)], 255)
    T = wall_T(ev)
    k = max(3, int(round(1.5 * T * Z)) | 1)
    closed = cv2.morphologyEx(wall, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    gap = (closed > 0) & (wall == 0) & (rooms == 0)
    n, _lab, st, _c = cv2.connectedComponentsWithStats(gap.astype(np.uint8), 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] / float(Z * Z) < 1.0:
            continue
        x, y, w, h = st[i, :4]
        hole = (round((x + w / 2) / Z, 1), round((y + h / 2) / Z, 1), round(w / Z, 1), round(h / Z, 1))
        out["slots" if max(w, h) / Z >= 1.5 * T else "notches"].append(hole)
    fill = fill_at(2)                                        # seams (appcheck.seams)
    edges = np.zeros_like(fill)
    cv2.polylines(edges, [np.round(np.array(r) * 2).astype(np.int32) for r in rings], True, 255, 1)
    seam = ((edges > 0) & (cv2.erode(fill, np.ones((3, 3), np.uint8)) > 0)).astype(np.uint8)
    n, _lab, st, _c = cv2.connectedComponentsWithStats(seam, 8)
    out["seams"] = [(round((st[i, 0] + st[i, 2] / 2.0) / 2.0, 1), round((st[i, 1] + st[i, 3] / 2.0) / 2.0, 1), round(max(st[i, 2], st[i, 3]) / 2.0, 1))
                    for i in range(1, n) if max(st[i, 2], st[i, 3]) >= 2]
    out["steps"] = [(round(x, 1), round(y, 1), round(s, 2)) for x, y, s in af.steps(rings, mm)]
    return out


def added(new, old, near=6.0):
    """the slots, seams and steps of `new` with none of the same kind within `near` px in `old`"""
    return {k: [f for f in new[k] if not any(abs(f[0] - g[0]) < near and abs(f[1] - g[1]) < near for g in old[k])] for k in new}
