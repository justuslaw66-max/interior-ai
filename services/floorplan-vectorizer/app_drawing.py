"""Stage 1's own vector drawing of the page -> the evidence's `drawing`: the clean traced drawing's shapes (round 38+,
exporter 0.28.1; J, 15 Oct: "trace and reproduce a clean 2D vector floor plan - walls, doors and windows redrawn as sharp,
separate vector shapes ... every wall the tracer found, not only the walls of rooms that closed").

Stage 1 writes its reading of the page as <plan>.svg beside <plan>.json (to_svg in floorplan_vectorize.py).  This turns
that SVG, in working pixels, into drawing items in SOURCE pixels, each shaped as the app's TracePath: points[0] is the
start, then each command takes its points (L 1, C 3, M 1, Z 0).  Walls, outlined walls (partitions), grey solids and
joints are fills - drawn solid (J, 15 Oct); every other shape is a stroke of its own width.  Text is left out (J, 15 Oct:
lettering kept as traced - the app traces it from the picture inside `textBoxes`), and so are stage 1's unclassified
leftovers (the app traces the ink nothing here explains) and its review markers.  Nothing here imports the vectorizer.
"""
import math, re
import xml.etree.ElementTree as ET

SKIP_IDS = re.compile(r"^(unclassified|needs-review|dim-text|label|title)")
NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def _arc_to_cubics(x0, y0, rx, ry, rot, large, sweep, x1, y1):
    """SVG endpoint arc -> cubic Beziers [(c1, c2, end)] (the standard centre conversion, quarter turns at most)"""
    if rx == 0 or ry == 0 or (x0 == x1 and y0 == y1):
        return [((x0, y0), (x1, y1), (x1, y1))]
    phi = math.radians(rot); cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x0 - x1) / 2.0, (y0 - y1) / 2.0
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    rx, ry = abs(rx), abs(ry)
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        s = math.sqrt(lam); rx *= s; ry *= s
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx, cy = cp * cxp - sp * cyp + (x0 + x1) / 2.0, sp * cxp + cp * cyp + (y0 + y1) / 2.0
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(1, int(math.ceil(abs(dt) / (math.pi / 2) - 1e-9)))
    d = dt / n; k = 4.0 / 3.0 * math.tan(d / 4.0)
    pt = lambda t: (cx + rx * math.cos(t) * cp - ry * math.sin(t) * sp, cy + rx * math.cos(t) * sp + ry * math.sin(t) * cp)
    dv = lambda t: (-rx * math.sin(t) * cp - ry * math.cos(t) * sp, -rx * math.sin(t) * sp + ry * math.cos(t) * cp)
    out = []
    for i in range(n):
        a, b = t1 + i * d, t1 + (i + 1) * d
        pa, pb, da, db = pt(a), pt(b), dv(a), dv(b)
        out.append(((pa[0] + k * da[0], pa[1] + k * da[1]), (pb[0] - k * db[0], pb[1] - k * db[1]), pb))
    out[-1] = (out[-1][0], out[-1][1], (x1, y1))
    return out


def _path_subpaths(d):
    """an SVG path's d -> subpaths [(start, [(cmd, pts)], closed)] with absolute L / C only"""
    toks = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|" + NUM.pattern, d)
    i, cmd, pos, start, subs, cur, last_c = 0, None, (0.0, 0.0), (0.0, 0.0), [], None, None
    def nums(k):
        nonlocal i
        v = [float(t) for t in toks[i:i + k]]; i += k
        return v
    while i < len(toks):
        if re.match(r"[A-Za-z]", toks[i]):
            cmd = toks[i]; i += 1
            if cmd in "Zz":
                if cur:
                    cur[2] = True
                pos = start; cur = None; continue
        rel = cmd.islower(); C = cmd.upper()
        ox, oy = pos if rel else (0.0, 0.0)
        if C == "M":
            x, y = nums(2); pos = start = (ox + x, oy + y)
            cur = [pos, [], False]; subs.append(cur); cmd = "l" if rel else "L"; last_c = None; continue
        if cur is None:
            cur = [pos, [], False]; subs.append(cur)
        if C in "LHV":
            if C == "L":
                x, y = nums(2); p = (ox + x, oy + y)
            elif C == "H":
                (x,) = nums(1); p = ((pos[0] if rel else 0.0) + x, pos[1])
            else:
                (y,) = nums(1); p = (pos[0], (pos[1] if rel else 0.0) + y)
            cur[1].append(("L", [p])); pos = p; last_c = None
        elif C == "C":
            v = nums(6); c1, c2, p = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3]), (ox + v[4], oy + v[5])
            cur[1].append(("C", [c1, c2, p])); pos = p; last_c = c2
        elif C == "S":
            v = nums(4); c1 = (2 * pos[0] - last_c[0], 2 * pos[1] - last_c[1]) if last_c else pos
            c2, p = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3])
            cur[1].append(("C", [c1, c2, p])); pos = p; last_c = c2
        elif C == "Q":
            v = nums(4); q, p = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3])
            c1 = (pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1]))
            c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            cur[1].append(("C", [c1, c2, p])); pos = p; last_c = None
        elif C == "A":
            rx, ry, rot, large, sweep, x, y = nums(7); p = (ox + x, oy + y)
            for c1, c2, e in _arc_to_cubics(pos[0], pos[1], rx, ry, rot, int(large), int(sweep), p[0], p[1]):
                cur[1].append(("C", [c1, c2, e]))
            pos = p; last_c = None
        else:
            raise ValueError("path command %s" % cmd)
    return [tuple(s) for s in subs]


def _ellipse(cx, cy, rx, ry):
    k = 0.5522847498
    segs = [("C", [(cx + rx, cy + k * ry), (cx + k * rx, cy + ry), (cx, cy + ry)]),
            ("C", [(cx - k * rx, cy + ry), (cx - rx, cy + k * ry), (cx - rx, cy)]),
            ("C", [(cx - rx, cy - k * ry), (cx - k * rx, cy - ry), (cx, cy - ry)]),
            ("C", [(cx + k * rx, cy - ry), (cx + rx, cy - k * ry), (cx + rx, cy)])]
    return [((cx + rx, cy), segs, True)]


def _dashed(subs, dash):
    """a dashed stroke as its dashes: straight subpaths only (stage 1 dashes lines)"""
    on, off = dash
    if on <= 0 or off < 0:
        return subs
    out = []
    for start, segs, _ in subs:
        pts = [start] + [s[1][-1] for s in segs]
        t_, draw = 0.0, True
        for a, b in zip(pts, pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); u = 0.0
            while u < L - 1e-9:
                step = min((on if draw else off) - t_, L - u)
                p = (a[0] + (b[0] - a[0]) * u / L, a[1] + (b[1] - a[1]) * u / L)
                q = (a[0] + (b[0] - a[0]) * (u + step) / L, a[1] + (b[1] - a[1]) * (u + step) / L)
                if draw:
                    out.append((p, [("L", [q])], False))
                u += step; t_ += step
                if t_ >= (on if draw else off) - 1e-9:
                    t_, draw = 0.0, not draw
    return out


def _shape(el, tag):
    g = lambda k, d=0.0: float(el.get(k, d))
    if tag == "path":
        return _path_subpaths(el.get("d", ""))
    if tag == "line":
        return [((g("x1"), g("y1")), [("L", [(g("x2"), g("y2"))])], False)]
    if tag in ("polyline", "polygon"):
        v = [float(t) for t in NUM.findall(el.get("points", ""))]
        P = list(zip(v[0::2], v[1::2]))
        return [(P[0], [("L", [p]) for p in P[1:]], tag == "polygon")] if P else []
    if tag == "rect":
        x, y, w, h = g("x"), g("y"), g("width"), g("height")
        return [((x, y), [("L", [(x + w, y)]), ("L", [(x + w, y + h)]), ("L", [(x, y + h)])], True)]
    if tag == "circle":
        return _ellipse(g("cx"), g("cy"), g("r"), g("r"))
    if tag == "ellipse":
        return _ellipse(g("cx"), g("cy"), g("rx"), g("ry"))
    return []


def _translate(el):
    m = re.match(r"\s*translate\(\s*(" + NUM.pattern + r")[\s,]+(" + NUM.pattern + r")\s*\)\s*$", el.get("transform", ""))
    if el.get("transform") and not m:
        return None                                          # (a rotation: only text has one)
    return (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)


def drawing_items(svg_text, to_source, k):
    """stage 1's SVG (working px) -> drawing items in source px.  to_source(x, y) maps a point, k a length."""
    root = ET.fromstring(svg_text)
    items = []
    def walk(el, off, gid):
        tag = el.tag.split("}")[-1]
        id_ = el.get("id") or gid or ""
        if tag in ("defs", "text", "pattern") or SKIP_IDS.match(id_):
            return
        tr = _translate(el)
        if tr is None:
            return
        off = (off[0] + tr[0], off[1] + tr[1])
        if tag in ("svg", "g"):
            for ch in el:
                walk(ch, off, id_ if tag == "g" else gid)
            return
        subs = _shape(el, tag)
        if not subs:
            return
        fill = el.get("fill") not in (None, "none", "")       # (walls, outlined walls, grey solids, joints, dots, solid fixtures)
        sw = float(el.get("stroke-width", 0) or 0) if el.get("stroke", "none") != "none" else 0.0
        dash = el.get("stroke-dasharray")
        if dash and not fill:
            subs = _dashed(subs, [float(v) for v in NUM.findall(dash)][:2])
        pts, cmds = [], []
        for start, segs, closed in subs:
            p0 = to_source(start[0] + off[0], start[1] + off[1])
            if pts:
                cmds.append("M")
            pts.append(p0)
            for c, ps in segs:
                cmds.append(c); pts.extend(to_source(x + off[0], y + off[1]) for x, y in ps)
            if closed:
                cmds.append("Z")
        kind = re.sub(r"-\d+(-[a-z-]+)?$", lambda mo: (mo.group(1) or ""), id_) or tag
        items.append({"kind": kind[:40], "fill": fill, "strokeWidthPx": round(sw * k, 3) if not fill else 0.0,
                      "commands": cmds, "points": [[round(p[0], 2), round(p[1], 2)] for p in pts]})
        if fill and sw > 0:                                  # (a filled grey solid with its own outline: the outline too)
            items.append(dict(items[-1], fill=False, strokeWidthPx=round(sw * k, 3)))
    walk(root, (0.0, 0.0), "")
    return items


def text_boxes(m, to_source):
    """every piece of lettering stage 1 found, read or not, as a source-px box (the app traces it from the picture)"""
    out = []
    for t in list(m.get("texts", [])) + list(m.get("unread_text", [])):
        x0, y0, x1, y1 = t.get("ink") or [t["box"][0], t["box"][1], t["box"][0] + t["box"][2], t["box"][1] + t["box"][3]]
        ps = [to_source(x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        xs, ys = [p[0] for p in ps], [p[1] for p in ps]
        out.append([round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)])
    return out



DRAWING_VERSION = "stage1-svg-1"
# The app's schema limits (vectorizer-evidence-schema.ts): a drawing over them is left out whole, never cut.
MAX_ITEMS, MAX_COMMANDS, MAX_POINTS, MAX_TEXT_BOXES = 8000, 4000, 12000, 2000


def drawing(m, svg_text, to_source):
    """the evidence's `drawing` from stage 1's SVG, or (None, why) when it cannot be one"""
    items = [i for i in drawing_items(svg_text, to_source, to_source.k)
             if len(i["commands"]) <= MAX_COMMANDS and 1 <= len(i["points"]) <= MAX_POINTS]
    boxes = text_boxes(m, to_source)[:MAX_TEXT_BOXES]
    if len(items) > MAX_ITEMS:
        return None, "%d shapes, over the %d the app takes" % (len(items), MAX_ITEMS)
    return {"version": DRAWING_VERSION, "items": items, "textBoxes": boxes}, None
