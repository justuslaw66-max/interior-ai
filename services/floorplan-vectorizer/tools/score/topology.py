"""The score harness's topology score (8 Nov 2026, workstream 1 of claude/handoff-2026-11-08-vectorizer-model-first.md).

What the 3D view shows of an imported plan's walls, counted per plan on the app's own document (the `graph` that
document-from-evidence.ts writes into docs.json), in millimetres:

- unjoined ends: a wall end no other wall ends at, with another wall within the join reach (1.5 x the thicker
  wall's thickness) of it - a corner or T the model nearly made and didn't (the 3D shows a gap, a notch or an overlap);
- ends alongside (reported, not gated): a free end lying beside a wall the piece runs along (parallel, off its line) -
  a piece thickening a wall, which "overlap metres" measures, not a corner nearly made;
- open ends: a wall end with no other wall end at it and nothing within the reach (a wall stopping in the open; most
  plans have a few that are real, such as a partition beside an open kitchen). Reported, not gated;
- stubs: a wall shorter than STUB_MM (or twice its thickness, if more) with an end that touches nothing (no wall ends
  there and none is within the reach);
- slivers: a wall shorter than its own thickness (SLIVER_MIN_MM at least) that runs on straight, at the same thickness,
  into no other wall at either end - a jog, or a notch where the thickness changes (a short piece of a straight wall,
  between a corner or T and the rest of that wall, draws as part of it);
- overlap metres: the length of wall lying along another wall - two walls parallel within 2 degrees, their
  centre-lines closer than half their thicknesses together, overlapping by more than OVERLAP_MM along their length
  (the 3D draws two walls in one place, the 2D two outlines). A length, so splitting a wall in two doesn't count it
  twice; reported beside the defects, not added to them;
- unclosed rooms: a room whose wall loop isn't a closed chain, or encloses no area;
- openings off a wall: an opening whose wall is missing or that runs past its wall's ends;
- compile errors: what the app's compiler refuses in the document (the editor won't open it); must stay 0;
- off-square corners: two walls meeting at a corner within 10 degrees of square but more than half a degree off it
  (reported, not gated; HDB plans are drawn square).

Usage: python3 topology.py --docs=<docs.json> [--json=<out.json>] [--sealed=a,b] [-v]
Sealed plans print as "(sealed)" with numbers only. No network; reads only --docs, writes only --json.
"""
import json
import math
import statistics
import sys

REACH = 1.5            # the join reach, in wall thicknesses (the handoff's starting point, to be measured)
STUB_MM = 300.0        # a stub is shorter than this (or twice its thickness, if more)
SLIVER_MIN_MM = 50.0   # a sliver is shorter than its thickness, and than this at least
OVERLAP_MM = 20.0      # two walls along each other for more than this overlap
SQUARE_TOL_DEG = 10.0  # a corner this near square counts for "off-square"
SQUARE_EXACT_DEG = 0.5

KINDS = ["unjoined_ends", "stubs", "slivers", "unclosed_rooms", "openings_off_wall"]
INFO = ["overlap_m", "open_ends", "ends_alongside", "off_square_corners", "walls", "rooms", "compile_errors"]


def _seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return math.hypot(p[0] - ax, p[1] - ay), 0.0
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)), t


def _angle(u, v):
    """Angle between two directions, 0..180 degrees."""
    nu, nv = math.hypot(*u), math.hypot(*v)
    if not nu or not nv:
        return 0.0
    c = max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))
    return math.degrees(math.acos(c))


def score_graph(g):
    V = {k: tuple(v) for k, v in g["vertices"].items()}
    walls = [w for w in g["walls"] if w["a"] in V and w["b"] in V]
    by_id = {w["id"]: w for w in walls}
    ends = {}
    for w in walls:
        ends.setdefault(w["a"], []).append(w)
        ends.setdefault(w["b"], []).append(w)
    length = {w["id"]: math.dist(V[w["a"]], V[w["b"]]) for w in walls}
    out = {k: 0 for k in KINDS + INFO}
    out["walls"] = len(walls)
    out["rooms"] = len({lp["roomId"] for lp in g["loops"]})
    detail = []

    def touches(w, v):
        """The nearest other wall within the reach of the free end v of wall w: (distance, alongside), else None.
        Alongside: that wall runs beside w (parallel within 5 degrees, off its line by more than 10 mm) and the end
        lies beside it - w is a piece lying along that wall (measured in overlap metres), not a corner nearly made."""
        p = V[v]
        best = None
        wd = (V[w["b"]][0] - V[w["a"]][0], V[w["b"]][1] - V[w["a"]][1])
        for o in walls:
            if o["id"] == w["id"]:
                continue
            d, t = _seg_dist(p, V[o["a"]], V[o["b"]])
            if d <= REACH * max(w["t"], o["t"]) and (best is None or d < best[0]):
                od = (V[o["b"]][0] - V[o["a"]][0], V[o["b"]][1] - V[o["a"]][1])
                a = _angle(wd, od)
                best = (d, min(a, 180 - a) <= 5 and 0 < t < 1 and d > 10)
        return best

    free = {}
    for w in walls:
        for v in (w["a"], w["b"]):
            if len(ends[v]) == 1:
                free[(w["id"], v)] = touches(w, v)
    for (wid, v), near in free.items():
        if near is None:
            out["open_ends"] += 1
        elif near[1]:
            out["ends_alongside"] += 1
        else:
            out["unjoined_ends"] += 1
            detail.append(("unjoined_end", wid, [round(c) for c in V[v]], round(near[0])))

    for w in walls:
        L = length[w["id"]]
        loose = [v for v in (w["a"], w["b"]) if free.get((w["id"], v), 0) is None]
        if loose and L < max(STUB_MM, 2 * w["t"]):
            out["stubs"] += 1
            detail.append(("stub", w["id"], round(L)))
        if L < max(w["t"], SLIVER_MIN_MM) and not w["arc"]:
            d = (V[w["b"]][0] - V[w["a"]][0], V[w["b"]][1] - V[w["a"]][1])

            def continued(v):
                for o in ends[v]:
                    if o["id"] == w["id"]:
                        continue
                    od = (V[o["b"]][0] - V[o["a"]][0], V[o["b"]][1] - V[o["a"]][1])
                    a = _angle(d, od)
                    if min(a, 180 - a) <= 2.0 and abs(o["t"] - w["t"]) <= 1:
                        return True
                return False
            if not (continued(w["a"]) or continued(w["b"])):
                out["slivers"] += 1
                detail.append(("sliver", w["id"], round(L), w["t"]))

    lines = [w for w in walls if not w["arc"] and length[w["id"]] > 0]
    for i, w in enumerate(lines):
        a, b = V[w["a"]], V[w["b"]]
        d = (b[0] - a[0], b[1] - a[1])
        L = length[w["id"]]
        for o in lines[i + 1:]:
            od = (V[o["b"]][0] - V[o["a"]][0], V[o["b"]][1] - V[o["a"]][1])
            ang = _angle(d, od)
            if min(ang, 180 - ang) > 2.0:
                continue
            ux, uy = d[0] / L, d[1] / L
            oa, ob = V[o["a"]], V[o["b"]]
            off = abs((oa[0] - a[0]) * -uy + (oa[1] - a[1]) * ux)
            if off >= (w["t"] + o["t"]) / 2:
                continue
            s0 = (oa[0] - a[0]) * ux + (oa[1] - a[1]) * uy
            s1 = (ob[0] - a[0]) * ux + (ob[1] - a[1]) * uy
            ov = min(L, max(s0, s1)) - max(0.0, min(s0, s1))
            if ov > OVERLAP_MM:
                out["overlap_m"] += ov / 1000
                detail.append(("overlap", w["id"], o["id"], round(ov), round(off)))

    for v, ws in ends.items():
        if len(ws) != 2:
            continue
        p = V[v]
        dirs = []
        for w in ws:
            q = V[w["b"]] if w["a"] == v else V[w["a"]]
            dirs.append((q[0] - p[0], q[1] - p[1]))
        off = abs(_angle(*dirs) - 90)
        if SQUARE_EXACT_DEG < off <= SQUARE_TOL_DEG:
            out["off_square_corners"] += 1

    for lp in g["loops"]:
        seq = []
        ok = True
        for ref in lp["walls"]:
            w = by_id.get(ref["wallId"])
            if not w:
                ok = False
                break
            seq.append((w["a"], w["b"]) if ref["forward"] else (w["b"], w["a"]))
        if ok and seq:
            ok = all(seq[i][1] == seq[(i + 1) % len(seq)][0] for i in range(len(seq)))
        if ok:
            pts = [V[s[0]] for s in seq]
            area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2
            ok = abs(area) > 1e4  # 0.01 m2
        if not ok:
            out["unclosed_rooms"] += 1
            detail.append(("unclosed_room", lp["roomId"]))

    for o in g["openings"]:
        w = by_id.get(o["wallId"])
        if not w or o["offsetMm"] < -1 or o["offsetMm"] + o["widthMm"] > length[w["id"]] + 1:
            out["openings_off_wall"] += 1
            detail.append(("opening_off_wall", o["id"], o["wallId"]))
    out["overlap_m"] = round(out["overlap_m"], 1)
    out["defects"] = sum(out[k] for k in KINDS)
    return out, detail


def main(argv):
    opt = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in argv if a.startswith("-")}
    docs = json.load(open(opt["--docs"]))
    sealed = set(filter(None, str(opt.get("--sealed", "")).split(",")))
    rows = {}
    for d in docs:
        plan = d["file"].split(".")[0]
        if d.get("stage") != "built" or "graph" not in d:
            rows[plan] = {"stage": d.get("stage"), "error": (d.get("error") or "")[:120]}
            continue
        s, det = score_graph(d["graph"])
        s["compile_errors"] = len(d.get("compileErrors") or [])
        det += [("compile_error", c) for c in (d.get("compileErrors") or [])[:5]]
        rows[plan] = {**s, "detail": det}
    head = ["plan", "defects"] + KINDS + INFO
    print("  ".join(h[:9].rjust(9) if i else h.ljust(12) for i, h in enumerate(head)))
    for plan in sorted(rows):
        r = rows[plan]
        name = "(sealed)" if plan in sealed else plan
        if "defects" not in r:
            print(name.ljust(12), "not built:", r.get("stage"), r.get("error"))
            continue
        print("  ".join([name.ljust(12)] + [str(r[k]).rjust(9) for k in ["defects"] + KINDS + INFO]))
        if "-v" in opt and plan not in sealed:
            for item in r["detail"][:12]:
                print("     ", item)
    built = [r for r in rows.values() if "defects" in r]
    if built:
        tot = {k: round(sum(r[k] for r in built), 1) for k in ["defects"] + KINDS + INFO}
        med = {k: statistics.median(r[k] for r in built) for k in ["unjoined_ends", "stubs", "slivers", "overlap_m", "defects"]}
        print("\n%d plans built of %d: %s" % (len(built), len(rows), ", ".join("%s %g" % (k, v) for k, v in tot.items())))
        print("median: %s; plans with no defect: %d; plans with an unclosed room: %d" % (
            ", ".join("%s %g" % kv for kv in med.items()), sum(1 for r in built if r["defects"] == 0),
            sum(1 for r in built if r["unclosed_rooms"])))
    if opt.get("--json"):
        json.dump({p: ({k: v for k, v in r.items() if k != "detail"} if p in sealed else r) for p, r in rows.items()},
                  open(opt["--json"], "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
