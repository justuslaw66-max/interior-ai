#!/usr/bin/env python3
"""Vectorizer model  ->  evidence for the Interior AI floor-plan import pipeline.

    python3 app_evidence.py model.json out.evidence.json [--check check.png] [--source plan.png]

Reads the model JSON written by floorplan_vectorize.py and writes ONE JSON whose parts follow the app's own types
(lib/floor-plan-imports/deterministic-evidence.ts): PageSemanticEvidence (room labels, dimension labels with their two
stops, opening symbols with their jamb-to-jamb span, fixtures), wall centre-lines with thickness, and room faces as ordered
source-pixel polygons with one edge record per side (RegisteredRoomBoundary.sourceEdges).

All positions leave this file in SOURCE-IMAGE pixels (and 0..1 ratios of the source image), never in the vectorizer's
working pixels.  Nothing here imports the vectorizer; it needs numpy and OpenCV (and scikit-image's skeleton, from the
vectorizer's own requirements, for the sloped strokes of slanted walls).
"""
import json, math, os, sys
import numpy as np
import cv2

VERSION = "app-evidence-0.16.0"
OUTDOOR_WORDS = ("BALCONY", "LEDGE", "YARD", "PES", "TERRACE", "PATIO", "PLANTER", "ENCLOSED SPACE", "ROOF", "COURTYARD", "DECK", "GARDEN", "VOID", "A/C", "AC ", "AIR-CON", "AIRCON")
SLIVER_M2 = 1.5          # a nameless face smaller than this is a shaft, a strip behind a wardrobe or a notch, not a room
INNER_SIGN = 1
ROOM_TYPES = (
    ("shelter", ("SHELTER", "HS", "H.S", "BOMB")),
    ("service_yard", ("SERVICE", "YARD")),
    ("toilet", ("BATH", "WC", "W.C", "TOILET", "POWDER", "SHOWER", "LAVATORY")),
    ("kitchen", ("KITCHEN", "PANTRY")),
    ("bedroom", ("BEDROOM", "BED ROOM", "MASTER", "BED", "JR", "JUNIOR", "GUEST ROOM")),
    ("living", ("LIVING", "LOUNGE", "FAMILY")),
    ("dining", ("DINING",)),
    ("study", ("STUDY", "OFFICE")),
)
ROOM_WORDS = ("BALCONY", "STORE", "UTILITY", "FOYER", "ENTRANCE", "CORRIDOR", "PASSAGE", "WARDROBE", "WALK-IN", "DRESSING", "TERRACE", "PATIO",
              "PES", "AC LEDGE", "A/C LEDGE", "LEDGE", "PLANTER", "LOBBY", "HALL", "ROOM", "DRY", "WET", "LAUNDRY", "MAID", "ACCESS", "VOID", "DUCT", "RISER")
NOT_ROOM = ("SCALE", "MODEL", "TYPE", "SQM", "SQ M", "SQFT", "SQ FT", "FLOOR", "PLAN", "UNIT", "BLK", "BLOCK", "DROP", "UP", "DN", "DOWN", "RAMP", "NORTH", "LEGEND")


# ----------------------------------------------------------------------------------------------- coordinates

class ToSource:
    """working pixels -> source-image pixels (undo work_scale, the deskew rotation and the bold-scan pre-scale)"""
    def __init__(self, m):
        self.ws = float(m.get("work_scale", 1) or 1); self.pre = float(m.get("pre_scale", 1.0) or 1.0)
        self.W0, self.H0 = m.get("source_size", m["size"])
        self.ox, self.oy = m.get("crop_offset", [0, 0])            # the traced part's place on the page
        w, h = (m["page_size"] if m.get("page_size") else [m["size"][0] / self.ws, m["size"][1] / self.ws])   # the image the deskew turned
        ang = math.radians(float(m.get("skew_deg", 0.0) or 0.0))
        # cv2.getRotationMatrix2D(centre, ang): x' = a x + b y + ..., y' = -b x + a y + ...; its inverse turns by -ang
        self.a, self.b, self.cx, self.cy = math.cos(ang), math.sin(ang), w / 2.0, h / 2.0
        self.k = 1.0 / (self.ws * self.pre)                         # length factor working px -> source px

    def __call__(self, x, y):
        x, y = x / self.ws + self.ox, y / self.ws + self.oy
        dx, dy = x - self.cx, y - self.cy
        x, y = self.cx + self.a * dx - self.b * dy, self.cy + self.b * dx + self.a * dy
        return [x / self.pre, y / self.pre]

    def ratio(self, x, y):
        p = self(x, y)
        return {"xRatio": round(min(1.0, max(0.0, p[0] / self.W0)), 6), "yRatio": round(min(1.0, max(0.0, p[1] / self.H0)), 6)}

    def bbox(self, x0, y0, x1, y1):
        ps = [self(x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        xs, ys = [p[0] for p in ps], [p[1] for p in ps]
        c = lambda v, n: round(min(1.0, max(0.0, v / n)), 6)
        return {"leftRatio": c(min(xs), self.W0), "topRatio": c(min(ys), self.H0), "rightRatio": c(max(xs), self.W0), "bottomRatio": c(max(ys), self.H0)}


def pseudo_scale(m):
    """mm per WORKING pixel.  A plan without any scale still has walls: taken as 150 mm they give lengths good enough for the
    size tests in here (never exported as a scale)."""
    s = m.get("mm_per_px")
    if s:
        return float(s)
    if "_pseudo" not in m:
        T = max(1.0, float(m["wall_thickness_px"]))
        xs, ys = [], []
        for l in m["lines"]:
            if l.get("role") in ("dimension", "extension"):
                continue
            (xs if l["o"] == "h" else ys).extend((l["a"], l["b"])); (ys if l["o"] == "h" else xs).append(l["c"])
        for w_ in m["walls"]:
            xs += [p_[0] for p_ in w_["pts"]]; ys += [p_[1] for p_ in w_["pts"]]
        ext = max(np.percentile(xs, 98) - np.percentile(xs, 2), np.percentile(ys, 98) - np.percentile(ys, 2)) if xs and ys else 0
        # the commonest wall is 100 .. 250 mm thick: take the thickness that makes the whole flat a believable size (about 12 m)
        m["_pseudo"] = min((t_ / T for t_ in (100.0, 125.0, 150.0, 200.0, 250.0)), key=lambda v: abs(ext * v - 12000.0)) if ext else 150.0 / T
    return m["_pseudo"]


# ----------------------------------------------------------------------------------------------- walls -> bars

def wall_mask(m):
    W, H = m["size"]
    k = np.zeros((H, W), np.uint8)
    for w in m["walls"]:
        if not w.get("hole"):
            cv2.fillPoly(k, [np.rint(np.array(w["pts"])).astype(np.int32)], 255)
    for w in m["walls"]:
        if w.get("hole"):
            cv2.fillPoly(k, [np.rint(np.array(w["pts"])).astype(np.int32)], 0)
    for p in m.get("partitions", []):
        a, b, c0, c1 = int(round(p["a"])), int(round(p["b"])), int(round(p["c0"])), int(round(p["c1"]))
        if p["o"] == "h":
            k[max(0, c0):c1 + 1, max(0, a):b + 1] = 255
        else:
            k[max(0, a):b + 1, max(0, c0):c1 + 1] = 255
    return k


def solid_blobs(m, gray):
    """small solid black posts (the jamb two doors share, a column) that the tracer kept as something other than wall"""
    mm = pseudo_scale(m)
    n_ = max(3, int(round(70.0 / mm)))
    dark = (gray < 110).astype(np.uint8)
    for t in m["texts"] + m.get("unread_text", []):
        x, y, w, h = [int(v) for v in t["box"]]
        dark[max(0, y - 2):y + h + 3, max(0, x - 2):x + w + 3] = 0
    solid = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((n_, n_), np.uint8))
    return (solid * 255).astype(np.uint8)


def outline_wall_cells(m, gray, known=None):
    """Walls drawn as two outlines with nothing (or a pale tint) between them leave no wall MASS in the model.  In the cleaned
    image such a wall is a long narrow cell of paper closed in by ink: narrower than any room or piece of furniture is deep,
    much longer than wide.  Returns the mask of those cells together with the ink that bounds them."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = gray.shape
    thr = min(235, int(m.get("ink_threshold", 180)) + 20)
    ink = gray < thr
    free = (~ink).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    if n < 3:
        return np.zeros((H, W), np.uint8)
    dt = cv2.distanceTransform(free, cv2.DIST_L2, 3)
    maxdt = np.zeros(n, np.float32)
    np.maximum.at(maxdt, lab.ravel(), dt.ravel())
    # lettering, and the strips between dimension lines, are not walls
    veto = np.zeros((H, W), np.uint8)
    for t in m["texts"] + m.get("unread_text", []):
        x, y, w, h = [int(v) for v in t["box"]]
        veto[max(0, y - 2):y + h + 3, max(0, x - 2):x + w + 3] = 1
    dimk = np.zeros((H, W), np.uint8)
    for l in m["lines"]:
        if l.get("role") in ("dimension", "extension"):
            p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
            cv2.line(dimk, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), 1, 5)
    bands = np.zeros((H, W), np.uint8)
    for g in window_bundles(m, np.zeros((H, W), np.uint8), need_ends=False):
        a, b, c0, c1 = int(g["a"]), int(math.ceil(g["b"])), int(g["lo"]), int(math.ceil(g["hi"]))
        if g["o"] == "h":
            bands[c0:c1 + 1, a:b + 1] = 1
        else:
            bands[a:b + 1, c0:c1 + 1] = 1
    sel = np.zeros(n, bool)
    light_ids = set()
    pen_cut = None
    idt = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 3)
    weight = {}
    for i in range(1, n):
        x, y, w, h, area = st[i]
        width = 2.0 * float(maxdt[i])
        if not (45.0 <= width * mm <= 420.0) or area < 6:
            continue
        length = area / max(1.0, width)
        if length < 2.5 * width or length * mm < 250:
            continue
        sel[i] = True
        x0, y0 = max(0, x - 4), max(0, y - 4)
        sub = lab[y0:y + h + 4, x0:x + w + 4] == i
        ring = cv2.dilate(sub.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~sub & ink[y0:y + h + 4, x0:x + w + 4]
        if ring.sum() >= 5:
            weight[i] = (2.0 * float(np.percentile(idt[y0:y + h + 4, x0:x + w + 4][ring], 80)), length)
    # Many plans draw walls with a heavier pen than furniture.  Where the strokes around the cells fall into two clear
    # weights, only the heavy ones are walls.
    if len(weight) >= 8:
        v = np.array([a for a, _b in weight.values()]); wt = np.array([b_ for _a, b_ in weight.values()])
        best = None
        for cut in np.arange(v.min() + 0.25, v.max(), 0.25):
            lo_, hi_ = v < cut, v >= cut
            if wt[lo_].sum() < 0.12 * wt.sum() or wt[hi_].sum() < 0.12 * wt.sum():
                continue
            m0, m1 = np.average(v[lo_], weights=wt[lo_]), np.average(v[hi_], weights=wt[hi_])
            score_ = wt[lo_].sum() * wt[hi_].sum() * (m1 - m0) ** 2
            inside = wt[(v > cut - 0.5) & (v < cut + 0.5)].sum() / wt.sum()
            if m1 - m0 >= 1.4 and inside <= 0.08 and (best is None or score_ > best[0]):
                best = (score_, cut)
        if best is not None:
            pen_cut = best[1]
            for i, (a, _b) in weight.items():
                if a < best[1]:
                    sel[i] = False; light_ids.add(i)
    cand = sel[lab]
    out = np.zeros((H, W), np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), connectivity=4)
    for i in range(1, n2):
        x, y, w, h, area = st2[i]
        cell = lab2[y:y + h, x:x + w] == i
        if veto[y:y + h, x:x + w][cell].mean() > 0.3:
            continue
        if bands[y:y + h, x:x + w][cell].mean() > 0.5:
            # inside a band of parallel strokes: a WINDOW is two or more narrow cells side by side; one narrow cell with a
            # stray parallel stroke near it (a skirting, a worktop edge) is still a wall
            x0_, y0_ = max(0, x - 6), max(0, y - 6)
            sub = lab2[y0_:y + h + 6, x0_:x + w + 6]
            near = cv2.dilate((sub == i).astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool) & (sub > 0) & (sub != i)
            mates = [j for j in np.unique(sub[near]) if st2[j][4] >= 0.5 * area]
            if mates:
                continue
        ring = cv2.dilate(cell.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~cell
        if ring.any() and dimk[y:y + h, x:x + w][ring].mean() > 0.3:
            continue
        if known is not None:
            # On a plan with filled walls an empty strip IN a wall line, with wall at both of its ends, is a window (or a
            # parapet); an empty strip that runs off the side of a wall is a partition drawn in outline.
            horiz = w >= h
            ys_, xs_ = np.nonzero(cell)
            cmid = int(y + (ys_.mean() if horiz else 0)) if horiz else int(x + xs_.mean())
            pad = int(0.6 * T) + 4
            if horiz:
                e0 = known[max(0, cmid - 2):cmid + 3, max(0, x - pad):x].any(); e1 = known[max(0, cmid - 2):cmid + 3, x + w:x + w + pad].any()
            else:
                e0 = known[max(0, y - pad):y, max(0, cmid - 2):cmid + 3].any(); e1 = known[y + h:y + h + pad, max(0, cmid - 2):cmid + 3].any()
            if e0 and e1:
                continue
        out[y:y + h, x:x + w][cell] = 255
    # Light-pen cells are furniture - or partitions, on plans that keep the heavy pen for structural walls.  A light cell
    # is a partition when a door swing stands at it, or when it runs from wall to wall (both ends on accepted wall).
    if light_ids:
        pts = []
        for a_ in m.get("arcs", []):
            pts.append((a_["cx"], a_["cy"]))
            for ang in (a_["start"], a_["start"] + a_["span"]):
                pts.append((a_["cx"] + a_["r"] * math.cos(math.radians(ang)), a_["cy"] + a_["r"] * math.sin(math.radians(ang))))
        pend = []
        for i in light_ids:
            x, y, w, h, area = st[i]
            cell = lab[y:y + h, x:x + w] == i
            if veto[y:y + h, x:x + w][cell].mean() > 0.3 or bands[y:y + h, x:x + w][cell].mean() > 0.5:
                continue
            pend.append((i, x, y, w, h, cell))
        reach = int(1.2 * T)
        changed = True
        while changed:
            changed = False
            acc = cv2.dilate(out, np.ones((2 * int(0.5 * T) + 1,) * 2, np.uint8)) > 0
            for item in list(pend):
                i, x, y, w, h, cell = item
                at_door = any(x - reach <= px <= x + w + reach and y - reach <= py <= y + h + reach for px, py in pts)
                ys_, xs_ = np.nonzero(cell)
                if w >= h:
                    e0 = acc[y + ys_[xs_ == xs_.min()], x + xs_.min()].any(); e1 = acc[y + ys_[xs_ == xs_.max()], x + xs_.max()].any()
                else:
                    e0 = acc[y + ys_.min(), x + xs_[ys_ == ys_.min()]].any(); e1 = acc[y + ys_.max(), x + xs_[ys_ == ys_.max()]].any()
                spans = e0 and e1 and max(w, h) * mm >= 900
                if at_door or spans:
                    out[y:y + h, x:x + w][cell] = 255; pend.remove(item); changed = True
    # Walls whose outlines stop without a cap have no cell of their own: their channel is cut out of the room or the page
    # it runs into, and joins the cells under the same tests (lettering, window bands, dimension lines, the light pen)
    chan = leaked_channels(m, ink, free, n, lab, maxdt)
    n3, lab3, st3, _ = cv2.connectedComponentsWithStats(chan, connectivity=4)
    recovered = 0
    for i in range(1, n3):
        x, y, w, h, area = st3[i]
        cell = lab3[y:y + h, x:x + w] == i
        if veto[y:y + h, x:x + w][cell].mean() > 0.3 or bands[y:y + h, x:x + w][cell].mean() > 0.5:
            continue
        ring = cv2.dilate(cell.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~cell
        if ring.any() and dimk[y:y + h, x:x + w][ring].mean() > 0.3:
            continue
        if pen_cut is not None:
            x0, y0 = max(0, x - 4), max(0, y - 4)
            sub = lab3[y0:y + h + 4, x0:x + w + 4] == i
            ring2 = cv2.dilate(sub.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~sub & ink[y0:y + h + 4, x0:x + w + 4]
            if ring2.sum() >= 5 and 2.0 * float(np.percentile(idt[y0:y + h + 4, x0:x + w + 4][ring2], 80)) < pen_cut:
                continue                                      # drawn with the light (furniture) pen
        out[y:y + h, x:x + w][cell] = 255; recovered += 1
    m["_leaked_channels"] = recovered
    out = drop_stacked_cells(m, out, known if known is not None else wall_mask(m))
    grown = cv2.dilate(out, np.ones((7, 7), np.uint8))
    out[(grown > 0) & ink] = 255                             # the outlines belong to the wall
    return out


LEAK_DISC_MM = 420.0      # as wide as the widest wall: a channel is where no disc this wide fits
NARROW_SWING_MM = float(os.environ.get("AE_NARROW_SWING", 550))   # no door swing is narrower (0 = rule off)
CASEMENT_RATIO = float(os.environ.get("AE_CASEMENT_RATIO", 0.75))   # two leaves this close in size: a casement window (> 1 = rule off)
SHARED_SPAN = os.environ.get("AE_SHARED_SPAN", "1") != "0"          # one span for an opening both its rooms cut their sides at
FOLD_MIN_MM = float(os.environ.get("AE_FOLD_MIN", 150))             # no folding door is narrower (a scrap of the symbol; 0 = rule off)
PANELS_IN_WALL = os.environ.get("AE_PANELS_IN_WALL", "1") != "0"    # "staggered strokes" must be panels in the wall, else a window
SLIDE_OUT_MIN_MM = float(os.environ.get("AE_SLIDE_OUT_MIN", 2400))  # a sliding "door" to the outside narrower than this is a window (0 = off)
MEET_AT_OPENING = os.environ.get("AE_MEET", "1") != "0"             # two rooms whose sides miss each other by a wall's width meet at their opening
DIM_SCRAPS = os.environ.get("AE_DIM_SCRAPS", "1") != "0"           # a stroke in line with a dimension line, and a partition cut from one, are that line's own scraps
PASSAGE_WIDE = os.environ.get("AE_PASSAGE_WIDE", "1") != "0"       # two wall ends facing each other up to 2 m apart are a doorway (else 1.5 m)
PASSAGE_MAX_MM = float(os.environ.get("AE_PASSAGE_MAX", 2000 if PASSAGE_WIDE else 1500))
PANEL_PAIR = os.environ.get("AE_PANEL_PAIR", "1") != "0"           # two staggered strokes a panel's width apart along a long gap: a sliding partition, kept only between two named rooms
PANEL_PAIR_COVER = float(os.environ.get("AE_PANEL_PAIR_COVER", 0.7))   # ... together running along at least this share of the gap


def leaked_channels(m, ink, free, n, lab, maxdt):
    """A wall drawn as two outlines whose outlines stop without a cap - at the edge of the plan, at a doorway drawn as a
    plain break - is no closed cell: its paper runs out into the page around the plan or into a room, and the whole
    component is as wide as that.  Its channel is cut out of such a WIDE component at the mouth: the part where no disc
    as wide as the widest wall fits.  Not every narrow part of a room is a wall - the floor between a rug and the wall,
    between a bed and a wardrobe, the counter behind a sink - so a channel is kept only when it passes the cell test and
    LEAKS: every mouth is about as wide as the channel, and the ink that bounds it ends there.  A strip of floor opens into
    the room because the furniture beside it turns away while the wall runs on past the mouth.  A channel is also straight
    (most of it in straight runs at least a thin wall wide).  Returns the channels' mask (1 = channel)."""
    mm = pseudo_scale(m); H, W = free.shape
    out = np.zeros((H, W), np.uint8)
    wide = np.zeros(n, bool)
    wide[1:] = 2.0 * maxdt[1:] * mm > 420.0
    if not wide.any():
        return out
    kd = int(round(LEAK_DISC_MM / mm)) + 3; kd += (kd % 2 == 0)
    wide_px = wide[lab] & (free > 0)
    opened = cv2.morphologyEx(wide_px.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kd, kd))) > 0
    narrow = (wide_px & ~opened).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(narrow, connectivity=4)
    if n2 < 2:
        return out
    # dashed strokes (wall cupboards over a counter, stair treads above) close nothing: the strips they cut a counter
    # into are no channels, and a dash is no stroke that runs on past a mouth
    dashed = np.zeros((H, W), np.uint8)
    for l in m["lines"]:
        if l.get("dash"):
            p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
            cv2.line(dashed, (int(round(p0[0])), int(round(p0[1]))), (int(round(p1[0])), int(round(p1[1]))), 1, 5)
    dt2 = cv2.distanceTransform(narrow, cv2.DIST_L2, 3)
    md2 = np.zeros(n2, np.float32)
    np.maximum.at(md2, lab2.ravel(), dt2.ravel())
    near_open = cv2.dilate(opened.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    log = os.environ.get("AE_LOG_LEAK")
    for i in range(1, n2):
        x, y, w, h, area = st2[i]
        width = 2.0 * float(md2[i])
        if x == 0 or y == 0 or x + w >= W or y + h >= H or not (45.0 <= width * mm <= 420.0) or area < 6:
            continue
        length = area / max(1.0, width)
        if length < 2.5 * width or length * mm < 250:
            continue
        x0, y0, x1, y1 = max(0, x - 2), max(0, y - 2), min(W, x + w + 2), min(H, y + h + 2)
        piece = lab2[y0:y1, x0:x1] == i
        if dashed[y0:y1, x0:x1][piece].mean() > 0.05:
            continue
        # a wall channel runs between two straight outlines: most of it is straight runs at least a thin wall wide (the
        # hairline ring inside a box drawn with a double outline, or the ragged floor beside a bed, is not)
        straight = np.zeros(piece.shape, bool)
        for tr in (False, True):
            for a0, a1, c0, c1 in strips(piece.T if tr else piece):
                c0, c1 = int(round(c0)), int(round(c1))
                if c1 - c0 >= max(3.0, 40.0 / mm) and a1 - a0 >= 2.0 * (c1 - c0):
                    if tr:
                        straight[a0:a1, c0:c1] = True
                    else:
                        straight[c0:c1, a0:a1] = True
        if float((straight & piece).sum()) < 0.75 * float(piece.sum()):
            continue
        mouth = piece & near_open[y0:y1, x0:x1]
        nm, _lm, stm, cm = cv2.connectedComponentsWithStats(mouth.astype(np.uint8), connectivity=8)
        why = None
        for j in range(1, nm):
            mx, my = cm[j][0] + x0, cm[j][1] + y0
            if stm[j][4] > 2.0 * width + 4:
                why = "mouth %d px long" % stm[j][4]; break      # open along its side: a strip of floor
            # which way the channel runs out through this mouth: from its own pixels near the mouth to the mouth
            r = int(2.5 * width) + 4
            bx0, by0 = max(0, int(mx) - r), max(0, int(my) - r)
            ys_, xs_ = np.nonzero(lab2[by0:int(my) + r + 1, bx0:int(mx) + r + 1] == i)
            u = np.array([mx - (xs_.mean() + bx0), my - (ys_.mean() + by0)]) if len(xs_) >= 4 else np.zeros(2)
            if np.hypot(*u) < 1e-3:
                why = "no direction at the mouth"; break
            u = u / np.hypot(*u)
            # ink past the mouth, within one and a half widths: a stroke running on (the wall a strip of floor lay beside)
            R = max(4.0, 1.5 * width)
            gx0, gy0, gx1, gy1 = max(0, int(mx - R) - 1), max(0, int(my - R) - 1), min(W, int(mx + R) + 2), min(H, int(my + R) + 2)
            gy, gx = np.mgrid[gy0:gy1, gx0:gx1]
            dx, dy = gx - mx, gy - my
            beyond = ((dx * dx + dy * dy) <= R * R) & ((dx * u[0] + dy * u[1]) >= 2.0)
            if int((ink[gy0:gy1, gx0:gx1] & (dashed[gy0:gy1, gx0:gx1] == 0) & beyond).sum()) > 0.5 * R:
                why = "a stroke runs on past the mouth at %d,%d" % (mx, my); break
        if nm < 2:
            why = "no mouth"
        if log:
            print("leak piece at %d,%d %dx%d width %d mm length %d mm, %d mouth(s): %s" % (x, y, w, h, width * mm, length * mm, nm - 1, why or "channel"))
        if why is None:
            out[y0:y1, x0:x1][piece] = 1
    return out


STACK_RULE = True
BESIDE_RULE = False


def drop_stacked_cells(m, cells, base):
    """A wardrobe, a kitchen counter, a vanity, a bed head or the back of a sofa drawn against a wall is a rectangle whose
    inside is cut by a rail or worktop line into strips as narrow as a wall - and each strip passes the cell test.  What
    tells such a strip from a wall is that it runs ALONGSIDE the wall (or its own twin strip) a stroke or a hand's width
    away, where walls never run alongside each other.  The cells are taken apart into straight bars; a bar is furniture
    when traced wall mass or a longer bar of another cell lies along its side, or when a twin bar of its own length does
    (two twins are furniture together; a bar of a wall network - a cell that turns corners over metres - is not)."""
    if not STACK_RULE:
        return cells
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = cells.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats(cells, connectivity=4)
    if n < 2:
        return cells
    smooth = cv2.morphologyEx(cells, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))   # the anti-aliased halo of an outline steps by a pixel
    bars = []
    for x0, x1, y0, y1 in strips(smooth > 0):
        y0, y1 = int(round(y0)), int(round(y1)); w_, h_ = x1 - x0, y1 - y0
        if min(w_, h_) < 4 or max(w_, h_) < 2 * min(w_, h_) or max(w_, h_) * mm < 250:
            continue
        cid = int(lab[(y0 + y1) // 2, (x0 + x1) // 2])
        if cid:
            bars.append({"x0": int(x0), "x1": int(x1), "y0": y0, "y1": y1, "cell": cid, "o": "h" if w_ >= h_ else "v", "L": max(w_, h_), "wd": min(w_, h_)})
    if not bars:
        return cells
    span = {}
    for b in bars:
        s_ = span.setdefault(b["cell"], {"h": 0, "v": 0}); s_[b["o"]] += b["L"]
    network = {c for c, s_ in span.items() if s_["h"] and s_["v"] and (st[c][2] + st[c][3]) * mm >= 4500}   # turns corners over metres
    bid = np.zeros((H, W), np.int32)
    for i, b in enumerate(bars):
        bid[b["y0"]:b["y1"], b["x0"]:b["x1"]] = i + 1
    basec = base > 0
    reach = int(max(4, round(min(T, 250.0 / mm))))            # a stroke, or a hand's width of floor, between the pieces of a stack
    log = os.environ.get("AE_LOG_STACK")
    if log:
        m["_cells_dbg"] = (lab, base)
    drop = {}
    changed = True
    while changed:
        changed = False
        for i, b in enumerate(bars):
            if i in drop:
                continue
            why = None
            for side in (0, 1):
                if b["o"] == "h":
                    y0, y1 = (max(0, b["y0"] - reach), b["y0"]) if side == 0 else (b["y1"], min(H, b["y1"] + reach))
                    if y1 <= y0:
                        continue
                    strip_bb = basec[y0:y1, b["x0"]:b["x1"]]; strip_b = strip_bb.any(axis=0); strip_i = bid[y0:y1, b["x0"]:b["x1"]]
                    cover = lambda mask_: float(mask_.any(axis=0).mean())
                else:
                    x0, x1 = (max(0, b["x0"] - reach), b["x0"]) if side == 0 else (b["x1"], min(W, b["x1"] + reach))
                    if x1 <= x0:
                        continue
                    strip_bb = basec[b["y0"]:b["y1"], x0:x1]; strip_b = strip_bb.any(axis=1); strip_i = bid[b["y0"]:b["y1"], x0:x1]
                    cover = lambda mask_: float(mask_.any(axis=1).mean())
                if float(strip_b.mean()) >= 0.5 and b["wd"] * mm >= 100:
                    # (a thinner strip beside a traced wall is the wall's own outline, or a wall back to back with it; and
                    #  a strip beside a traced LINE is a pale wall whose outline alone was traced)
                    counts = strip_bb.sum(axis=0) if b["o"] == "h" else strip_bb.sum(axis=1)
                    if float(np.median(counts[counts > 0])) * mm >= 80:
                        why = "traced wall alongside"; break
                for j in np.unique(strip_i):
                    if not j or j - 1 == i or bars[j - 1]["cell"] == b["cell"]:
                        continue
                    q = bars[j - 1]; f = cover(strip_i == j)
                    if f < 0.5:
                        continue
                    if (j - 1) in drop:
                        # the next strip of the same piece of furniture (a counter behind its worktop edge); a wall that is
                        # part of a network, or clearly longer than the strip, is not carried away with it
                        if b["cell"] not in network and q["L"] >= 0.85 * b["L"]:
                            why = "furniture bar %d alongside" % (j - 1); break
                    elif q["L"] > 1.15 * b["L"]:
                        why = "longer bar %d alongside" % (j - 1); break
                    elif f >= 0.6 and abs(q["L"] - b["L"]) <= 0.15 * max(q["L"], b["L"]) and b["cell"] not in network:
                        why = "twin bar %d alongside" % (j - 1); break
                if why:
                    break
            if why:
                drop[i] = why; changed = True
    if log:
        for i, b in enumerate(bars):
            print("bar %d of cell %d at %d,%d %dx%d width %d mm%s -> %s" % (i, b["cell"], b["x0"], b["y0"], b["x1"] - b["x0"], b["y1"] - b["y0"], b["wd"] * mm,
                  " (network)" if b["cell"] in network else "", drop.get(i, "wall")))
    # A cell that is not a network and lies along traced wall for a good part of its boundary is furniture whatever its
    # inside looks like (a counter cut into crumbs by a dashed appliance symbol has no bars at all).
    thick_k = max(3, int(round(80.0 / mm)))                  # traced wall mass at least a real wall thick, not a traced outline
    thick_base = cv2.morphologyEx(basec.astype(np.uint8), cv2.MORPH_OPEN, np.ones((thick_k, thick_k), np.uint8))
    near_base = cv2.dilate(thick_base, np.ones((9, 9), np.uint8)) > 0    # hugging it: only a stroke between
    along_base = {}
    for c in range(1, n):
        if c in network:
            continue
        x, y, w, h, area = st[c]
        sub = (lab[y:y + h, x:x + w] == c).astype(np.uint8)
        edge = (sub > 0) & (cv2.erode(sub, np.ones((3, 3), np.uint8)) == 0)
        if edge.sum() >= 20:
            along_base[c] = float((edge & near_base[y:y + h, x:x + w]).sum()) / float(edge.sum())
    out = cells.copy()
    for i in drop:
        b = bars[i]
        out[b["y0"]:b["y1"], b["x0"]:b["x1"]] = 0
    # A piece of furniture is one cell; once a fair part of it has gone as furniture, its rails, hanger marks and end
    # panels go with it (a wall network only loses the bars that lay against something).
    gone = {}
    for i, why in drop.items():
        b = bars[i]
        gone[b["cell"]] = gone.get(b["cell"], 0) + (b["x1"] - b["x0"]) * (b["y1"] - b["y0"])
    whole = {c for c, a in gone.items() if c not in network and a >= 0.25 * st[c][4]}
    for c, f in along_base.items():
        if f < 0.3:
            continue
        # traced wall INSIDE the cell's own footprint: a wall drawn twice over part of its length (outline and traced
        # partition), not furniture beside a wall - only the bars along the traced part go
        x, y, w, h, area = st[c]
        if float(basec[y:y + h, x:x + w].sum()) >= 0.15 * area:
            continue
        whole.add(c)
    if log:
        for c in sorted(set(gone) | set(whole)):
            print("cell %d: %d of %d px in furniture bars, %.2f of its edge along traced wall%s%s" % (c, gone.get(c, 0), st[c][4], along_base.get(c, 0.0),
                  " (network)" if c in network else "", " -> whole cell goes" if c in whole else ""))
    if whole:
        out[np.isin(lab, list(whole))] = 0
    # A shaft or duct drawn as a box with a cross in it is structure, not furniture: it stays as wall mass even when the
    # cell it sits in goes (a riser at the end of a wall anchors the window band next to it).
    opened = cv2.morphologyEx(cells, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(opened, connectivity=4)
    gray = m.get("_work_gray")
    for c in range(1, n2):
        x, y, w, h, area = st2[c]
        if gray is None or min(w, h) < 15 or max(w, h) > 2.5 * min(w, h) or max(w, h) * mm > 1300 or area < 0.6 * w * h:
            continue
        if out[y:y + h, x:x + w][lab2[y:y + h, x:x + w] == c].any():
            continue                                          # still there
        ink = (gray[y:y + h, x:x + w] < min(235, int(m.get("ink_threshold", 180)) + 20)).astype(np.uint8)
        ink[cv2.dilate((lab2[y:y + h, x:x + w] == c).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 0
        ink[:3, :] = 0; ink[-3:, :] = 0; ink[:, :3] = 0; ink[:, -3:] = 0
        runs = []
        for slash in (True, False):                          # a cross: strokes both ways at 45 degrees (drawn solid or dashed)
            kx = np.zeros((5, 5), np.uint8)
            for i in range(5):
                kx[i, (4 - i) if slash else i] = 1
            runs.append(int(cv2.morphologyEx(ink, cv2.MORPH_OPEN, kx).sum()))
        if min(runs) >= 6:
            keep_px = cv2.dilate((lab2[y:y + h, x:x + w] == c).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
            out[y:y + h, x:x + w][keep_px & (lab[y:y + h, x:x + w] > 0)] = 255
            if log:
                print("cell part at %d,%d %dx%d: a box with a cross in it -> kept as structure" % (x, y, w, h))
    furniture = ((cells > 0) & (out == 0)).astype(np.uint8)
    m["_furniture"] = cv2.bitwise_or(m["_furniture"], furniture) if m.get("_furniture") is not None else furniture
    m["_stackedCellsDropped"] = m.get("_stackedCellsDropped", 0) + len(drop) + len(whole)
    return out


DEBUG_HATCH = None
LEAF_RULE = True
PALE_PEN_MIN = 70        # darkest tenth of a piece's ink paler than this grey: furniture pen (None = rule off)
HATCH_INK_MIN = 0.0    # 0 = off. 0.03 removes headboard / sofa-back false walls on d12 but loses the d12 service yard and d11 ledge (2026-09-21)


def hatch_wall_supplement(m, gray, k):
    """On a plan with hatched walls, hatching the tracer did not take for wall (a thin hatched partition between two thick
    walls) is still wall: ink that closes up solid at the hatch spacing, is thicker than a stroke, and touches known wall."""
    sp = int(((m.get("wall_style") or {}).get("hatch") or {}).get("spacing") or 0)
    if sp < 3:
        return k
    H, W = gray.shape; mm = pseudo_scale(m)
    ink = (gray < min(235, int(m.get("ink_threshold", 180)) + 20)).astype(np.uint8)
    for t in m["texts"] + m.get("unread_text", []):
        x, y, w, h = [int(v) for v in t["box"]]
        ink[max(0, y - 3):y + h + 4, max(0, x - 3):x + w + 4] = 0
    ker = np.ones((sp + 3, sp + 3), np.uint8)
    solid = cv2.morphologyEx(cv2.morphologyEx(ink, cv2.MORPH_CLOSE, ker), cv2.MORPH_OPEN, np.ones((sp + 5, sp + 5), np.uint8))
    solid[k > 0] = 0
    near = cv2.dilate(k, np.ones((9, 9), np.uint8)) > 0
    # Two furniture lines closer together than the hatch spacing close up solid as well (a headboard, the back of a sofa).
    # Hatching is made of short slanted strokes; ink lying in long level or upright runs is outline, not hatching.
    run = 3 * sp
    long_ink = cv2.bitwise_or(cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, run), np.uint8)), cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((run, 1), np.uint8)))
    hatch_ink = ink & (1 - np.minimum(long_ink, 1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    out = k.copy()
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area * mm * mm < 150 * 150 or max(w, h) * mm < 400:
            continue
        comp = lab[y:y + h, x:x + w] == i
        if not near[y:y + h, x:x + w][comp].any():
            continue
        if DEBUG_HATCH is not None:
            DEBUG_HATCH.append((int(x), int(y), int(w), int(h), round(float(hatch_ink[y:y + h, x:x + w][comp].sum()) / float(area), 3)))
        if float(hatch_ink[y:y + h, x:x + w][comp].sum()) < HATCH_INK_MIN * float(area):
            continue
        out[y:y + h, x:x + w][comp] = 255
    # Furniture is drawn with a pale pen, walls and partitions with a black one.  Two pale furniture lines close together (a
    # bedhead against the wall, the back of a sofa) close up solid just like a thin partition; they are not wall.
    if PALE_PEN_MIN is not None:
        add = ((out > 0) & (k == 0)).astype(np.uint8)
        away = add & (cv2.dilate(k, np.ones((11, 11), np.uint8)) == 0).astype(np.uint8)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(away, connectivity=8)
        for i in range(1, n2):
            x, y, w, h, area = st2[i]
            if area * mm * mm < 100 * 100:
                continue
            comp = lab2[y:y + h, x:x + w] == i
            g_ = gray[y:y + h, x:x + w][comp]; g_ = g_[g_ < 200]
            if len(g_) and float(np.percentile(g_, 10)) > PALE_PEN_MIN:
                whole = cv2.dilate((lab2 == i).astype(np.uint8), np.ones((15, 15), np.uint8)) & add
                out[whole > 0] = 0
    return out


def strips(b):
    """maximal rectangles made of neighbouring COLUMNS whose vertical run is the same (to a pixel): (x0, x1, y0, y1)"""
    H, W = b.shape
    pad = np.zeros((1, W), bool)
    d = np.diff(np.concatenate([pad, b, pad], axis=0).astype(np.int8), axis=0)
    active, done = [], []
    for x in range(W):
        col = d[:, x]
        runs = list(zip(np.flatnonzero(col == 1), np.flatnonzero(col == -1)))
        nxt = []
        for r in active:
            hit = None
            for q in runs:
                if abs(q[0] - r[2]) <= 1 and abs(q[1] - r[3]) <= 1:
                    hit = q; break
            if hit is not None:
                runs.remove(hit); r[1] = x + 1; r[4].append(hit[0]); r[5].append(hit[1]); nxt.append(r)
            else:
                done.append(r)
        for q in runs:
            nxt.append([x, x + 1, int(q[0]), int(q[1]), [q[0]], [q[1]]])
        active = nxt
    done += active
    return [(r[0], r[1], float(np.median(r[4])), float(np.median(r[5]))) for r in done]


def wall_bars(m, k):
    """The wall mass as axis-aligned BARS (centre-line + thickness): runs of neighbouring columns (rows) over which the wall
    has the same two faces.  A wall that changes thickness (a column in a partition line) gives one bar per thickness; a
    corner belongs to both of its walls.  Wall mass no bar covers is told apart (residual_kinds): thick level / plumb mass
    (shelter walls, posts), slanted walls - kept in m['_slant_mask'] for the openings next to them - and curved mass."""
    T = float(m["wall_thickness_px"]); Tmax = 2.6 * T
    b = k > 0
    bars = []
    cover = np.zeros(k.shape, np.uint8)
    for o in ("h", "v"):
        for x0, x1, y0, y1 in strips(b if o == "h" else b.T):
            t, length = y1 - y0, x1 - x0
            if t > Tmax or length < max(1.15 * t, 0.5 * T) or t < 2:
                continue
            bars.append({"o": o, "c": (y0 + y1) / 2.0, "a": float(x0), "b": float(x1), "t": float(t)})
            if o == "h":
                cover[int(y0):int(math.ceil(y1)), x0:x1] = 1
            else:
                cover[x0:x1, int(y0):int(math.ceil(y1))] = 1
    rest = (b & (cover == 0)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest, connectivity=8)
    blobs, unsupported = [], 0
    kinds = {"axis": 0, "slanted": 0, "curved": 0}; parts = []
    slant = np.zeros(k.shape, np.uint8); sparts = []; axis_px = np.zeros(k.shape, np.uint8)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < 0.2 * T * T:
            continue
        if max(w, h) > 3.2 * T:
            unsupported += int(area)
            for kind_, px_, ang_, mask_ in residual_kinds(lab[y:y + h, x:x + w] == i, T):
                kinds[kind_] += px_
                if kind_ == "axis":
                    axis_px[y:y + h, x:x + w][mask_] = 1
                parts.append((kind_, px_, ang_, int(x), int(y), int(w), int(h)))
                if kind_ == "slanted" and _off_axis(ang_) >= SLANT_MIN_DEG and _straight(mask_)[3] <= Tmax:   # (a wall, not a slab of furniture)
                    slant[y:y + h, x:x + w][mask_] = 1
                    sparts.append((kind_, px_, ang_, int(x), int(y), int(w), int(h), mask_))
        blobs.append({"x0": float(x), "y0": float(y), "x1": float(x + w), "y1": float(y + h), "area": int(area)})
    nonaxis = rest.copy()                                    # what no bar covers and is not a thick level / plumb piece
    m["_residual_kinds"] = kinds; m["_residual_parts"] = parts; m["_slant_mask"] = slant; m["_slant_parts"] = sparts; m["_nonaxis"] = nonaxis & ~axis_px
    return bars, blobs, unsupported


def _straight(comp):
    """(is the piece one straight band, the angle of its long side in degrees 0..180, its length, its thickness)"""
    ys, xs = np.nonzero(comp)
    if len(xs) < 5:
        return False, 0.0, 0.0, 0.0
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.stack([xs, ys], 1).astype(np.float32))
    long_, short_ = max(rw, rh), min(rw, rh)
    theta = (ang if rw >= rh else ang + 90.0) % 180.0
    dt = cv2.distanceTransform(np.pad(comp.astype(np.uint8), 1), cv2.DIST_L2, 3)
    t_loc = 2.0 * float(dt.max())
    fill = len(xs) / max(1.0, rw * rh)
    return (short_ <= 1.4 * t_loc + 3.0 and fill >= 0.5), theta, long_, short_


def _line_kernel(L, ang):
    k_ = np.zeros((L, L), np.uint8); c_ = (L - 1) / 2.0
    dx, dy = math.cos(math.radians(ang)) * c_, math.sin(math.radians(ang)) * c_
    cv2.line(k_, (int(round(c_ - dx)), int(round(c_ - dy))), (int(round(c_ + dx)), int(round(c_ + dy))), 1, 1)
    return k_


def _families(piece, T):
    """split a piece of wall mass into its straight runs by direction: [(angle, mask)], and the pixels no straight run
    covers (on a copy scaled so that a wall is about 6 px thick; 5-degree steps)"""
    f = max(1.0, T / 6.0)
    h, w = piece.shape
    small = cv2.resize(piece.astype(np.uint8), (max(1, int(round(w / f))), max(1, int(round(h / f)))), interpolation=cv2.INTER_NEAREST)
    L = 15
    best = np.full(small.shape, -1, np.int32)
    angs = list(range(0, 180, 5))
    opened = [cv2.morphologyEx(small, cv2.MORPH_OPEN, _line_kernel(L, a)) > 0 for a in angs]
    tot = [int(o_.sum()) for o_ in opened]
    order = sorted(range(len(angs)), key=lambda j: -tot[j])              # the direction with the most mass claims first
    for j in order:
        best[opened[j] & (best < 0)] = j
    up = lambda msk: cv2.resize(msk.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST) > 0
    fams = {j: up(best == j) & piece for j in order if (best == j).any()}
    left_ = up((small > 0) & (best < 0)) & piece
    # the pixels the scaling lost at the edges go to the run next to them
    rest = piece & ~left_
    for j in fams:
        rest &= ~fams[j]
    if rest.any():
        ker = np.ones((int(math.ceil(f)) * 2 + 3,) * 2, np.uint8)
        for j in order:
            if j in fams and rest.any():
                grow = (cv2.dilate(fams[j].astype(np.uint8), ker) > 0) & rest
                fams[j] |= grow; rest &= ~grow
        left_ |= rest
    return [(float(angs[j]), fams[j]) for j in order if j in fams], left_


def residual_kinds(comp, T):
    """What wall mass no axis bar covers is made of: [(kind, px, angle, mask)], kind axis (walls thicker than a bar takes -
    shelter walls, posts - or the stubs of level / plumb walls), slanted (straight runs at another angle) or curved (the
    rest: pieces no straight run covers), each with its mask (in the piece's box).  A piece that is not one straight band
    is taken apart into its straight runs by direction (two slanted walls meeting at a corner, a wall and its return, an L
    of thick level / plumb walls).  Only reported and used to tell slanted walls apart, never built into walls itself."""
    comp = comp > 0
    ok, theta, long_, short_ = _straight(comp)
    off = min(theta % 90.0, 90.0 - theta % 90.0)
    if ok:
        return [("axis" if off <= 3.0 else "slanted", int(comp.sum()), round(theta, 1), comp)]
    out = []
    n0, lab0, st0, _ = cv2.connectedComponentsWithStats(comp.astype(np.uint8), connectivity=8)
    for i0 in range(1, n0):
        x0, y0, w0, h0, a0 = st0[i0]
        piece0 = lab0[y0:y0 + h0, x0:x0 + w0] == i0
        def put(kind, px, ang, sub, ox, oy):
            whole = np.zeros(comp.shape, bool); whole[oy:oy + sub.shape[0], ox:ox + sub.shape[1]] = sub
            out.append((kind, px, ang, whole))
        ok0, th0, long0, _s0 = _straight(piece0)
        if ok0 or max(w0, h0) <= 1.5 * T:
            off0 = min(th0 % 90.0, 90.0 - th0 % 90.0)
            put("slanted" if ok0 and long0 >= 1.5 * T and off0 > 3.0 else "axis", int(a0), round(th0, 1), piece0, x0, y0)
            continue
        # thick level / plumb walls meeting (an L, a T, a post on a wall): level and plumb runs three times as long as the
        # piece is thick cover it; a slanted wall is crossed by level runs only 1.4 - 2 times its thickness
        t0 = 2.0 * float(cv2.distanceTransform(np.pad(piece0.astype(np.uint8), 1), cv2.DIST_L2, 3).max())
        La = max(3, int(round(3.0 * t0)))
        p8 = piece0.astype(np.uint8)
        cov = (cv2.morphologyEx(p8, cv2.MORPH_OPEN, np.ones((1, La), np.uint8)) | cv2.morphologyEx(p8, cv2.MORPH_OPEN, np.ones((La, 1), np.uint8))) > 0
        if float(cov.sum()) >= 0.8 * float(a0):
            put("axis", int(a0), 0.0, piece0, x0, y0)
            continue
        fam, left_ = _families(piece0, T)
        for a_, m_ in fam:
            n2, lab2, st2, _ = cv2.connectedComponentsWithStats(m_.astype(np.uint8), connectivity=8)
            for i2 in range(1, n2):
                x2, y2, w2, h2, a2 = st2[i2]
                pm = lab2[y2:y2 + h2, x2:x2 + w2] == i2
                ok2, th2, long2, _s2 = _straight(pm)
                off2 = min(th2 % 90.0, 90.0 - th2 % 90.0)
                if ok2 and long2 >= 1.5 * T and off2 > 3.0:
                    kind = "slanted"
                elif ok2 or long2 <= 1.5 * T or _off_axis(a_) <= 3.0:
                    kind = "axis"                                # level / plumb, or a scrap at a corner or a wall end
                else:
                    kind = "curved"
                put(kind, int(a2), round(th2, 1), pm, x0 + x2, y0 + y2)
        if left_.any():
            n3, lab3, st3, _ = cv2.connectedComponentsWithStats(left_.astype(np.uint8), connectivity=8)
            for i3 in range(1, n3):
                x3, y3, w3, h3, a3 = st3[i3]
                put("curved" if max(w3, h3) > 1.5 * T else "axis", int(a3), 0.0, lab3[y3:y3 + h3, x3:x3 + w3] == i3, x0 + x3, y0 + y3)
    return out


# ----------------------------------------------------------------------------------------------- openings

def _runs(v):
    d = np.diff(np.concatenate([[0], v.astype(np.int8), [0]]))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def find_gaps(m, k, bars, blobs):
    """Every stretch of free floor between two pieces of wall mass ON THE LINE OF A WALL: the candidates for doors, windows
    and passages.  Looked for along the centre-line of every bar and every column, in both directions."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m)
    H, W = k.shape
    b = k > 0
    gaps = []
    for o in ("h", "v"):
        img = b if o == "h" else b.T
        cs = sorted({round(q["c"]) for q in bars if q["o"] == o} |
                    {round((q["y0"] + q["y1"]) / 2 if o == "h" else (q["x0"] + q["x1"]) / 2) for q in blobs if max(q["x1"] - q["x0"], q["y1"] - q["y0"]) <= 2.6 * T})
        cs = set(cs); wall_rows = set(cs)
        furn = m.get("_furniture")
        furn = cv2.dilate(furn, np.ones((7, 7), np.uint8)) if furn is not None else None
        for l in m["lines"]:                                 # sliding panels and screens stand where no wall line runs: look along them too
            if l["o"] == o and l.get("role") not in ("dimension", "extension") and (l["b"] - l["a"]) * mm >= 500:
                if any(abs(l["c"] - c_) <= 2 for c_ in cs):
                    continue
                c_ = int(min(max(round(l["c"]), 0), (H if o == "h" else W) - 1)); a_, b_ = int(max(0, l["a"])), int(min((W if o == "h" else H) - 1, l["b"]))
                if furn is not None:                         # the edge of a wardrobe or a counter is no line to look along
                    along = furn[c_, a_:b_ + 1] if o == "h" else furn[a_:b_ + 1, c_]
                    if along.size and float((along > 0).mean()) >= 0.5:
                        continue
                # nor is a stroke running beside a wall (a sliding-door track, a skirting): a screen stands where no wall is
                r_ = int(1.5 * T)
                beside = (b[max(0, c_ - r_):c_ + r_ + 1, a_:b_ + 1] if o == "h" else b[a_:b_ + 1, max(0, c_ - r_):c_ + r_ + 1].T)
                touch = (b[max(0, c_ - 2):c_ + 3, a_:b_ + 1] if o == "h" else b[a_:b_ + 1, max(0, c_ - 2):c_ + 3].T)
                if BESIDE_RULE and beside.size and touch.size and float(beside.any(axis=0).mean()) >= 0.5 and float(touch.any(axis=0).mean()) < 0.2:
                    if os.environ.get("AE_SKIP_ONLY") and os.environ["AE_SKIP_ONLY"] != "%s%d" % (o, c_):
                        pass
                    else:
                        continue                                 # (a line ON the wall mass is that wall's own face: still looked along)
                cs.add(round(l["c"]))
        for c in sorted(cs):
            c = int(min(max(c, 1), img.shape[0] - 2))
            row = img[c - 1:c + 2].any(axis=0)
            rs = _runs(row)
            for (s0, e0), (s1, e1) in zip(rs, rs[1:]):
                g = s1 - e0
                if g < 3 or g * mm > 6500:
                    continue
                gaps.append({"o": o, "c": float(c), "a": float(e0), "b": float(s1), "jamb": [int(e0 - s0), int(e1 - s1)],
                             "on_wall_line": any(abs(c - w_) <= 2 for w_ in wall_rows)})
    # the same gap seen from several lines a few pixels apart: keep one per place (the line nearest the middle of the group)
    gaps.sort(key=lambda q: (q["o"], q["a"], q["c"]))
    out = []
    for q in gaps:
        grp = next((r for r in out if r[0]["o"] == q["o"] and abs(r[0]["a"] - q["a"]) <= 3 and abs(r[0]["b"] - q["b"]) <= 3 and abs(r[-1]["c"] - q["c"]) <= 1.5 * T), None)
        if grp is None:
            out.append([q])
        else:
            grp.append(q)
    res = []
    for grp in out:
        cs_ = [q["c"] for q in grp]
        q = dict(min(grp, key=lambda r: abs(r["c"] - (min(cs_) + max(cs_)) / 2.0)))
        q["c_lo"], q["c_hi"] = min(cs_), max(cs_)
        q["on_wall_line"] = any(r.get("on_wall_line") for r in grp)
        # where the WALL is, across the line: from the wall ends at the two jambs (a jamb that is the flank of a crossing wall says nothing)
        runs = []
        for c_try in sorted(set(cs_), key=lambda v: abs(v - q["c"])):
            for x in (q["a"] - 2, q["b"] + 1):
                r_ = _across_run(k, q["o"], c_try, x)
                if r_ is not None and r_[1] - r_[0] + 1 <= 2.6 * T:
                    runs.append(r_)
            if runs:
                break
        if runs:
            q["lo"], q["hi"] = float(min(r_[0] for r_ in runs)), float(max(r_[1] for r_ in runs) + 1)
            # the opening is as thick as the wall it sits in, not as the column or post at one of its jambs: the thinner
            # jamb's run is kept for measuring the wall, the union of both for closing the room
            thin = min(runs, key=lambda r_: r_[1] - r_[0])
            q["lo_thin"], q["hi_thin"] = float(thin[0]), float(thin[1] + 1)
            thin_to_line(q, bars, T)                        # both jambs posts: the wall is as thick as the bars on its line
            q["c"] = (q["lo"] + q["hi"]) / 2.0
            q["c_lo"], q["c_hi"] = min(q["c_lo"], q["c"]), max(q["c_hi"], q["c"])
        else:
            q["lo"], q["hi"] = q["c"] - T / 2.0, q["c"] + T / 2.0
        res.append(q)
    return res


def thin_to_line(q, bars, T):
    """An opening between two posts, or a band of strokes wider than the wall, is still only as thick as the wall bars on
    its line: that thickness is what the room faces and the exported wall carry (the union stays for closing the room)."""
    lo, hi = q.get("lo_thin", q["lo"]), q.get("hi_thin", q["hi"])
    line_bars = [bar for bar in bars if bar["o"] == q["o"] and abs(bar["c"] - q["c"]) <= 0.75 * T and bar["b"] - bar["a"] >= 1.5 * T]
    if not line_bars:
        return
    t_ = float(np.median([bar["t"] for bar in line_bars])); c_line = float(np.median([bar["c"] for bar in line_bars]))
    if hi - lo > 1.5 * t_:
        q["lo_thin"], q["hi_thin"] = c_line - t_ / 2.0, c_line + t_ / 2.0


def _across_run(k, o, c, x):
    img = (k > 0) if o == "h" else (k > 0).T
    x = int(min(max(x, 0), img.shape[1] - 1)); c = int(min(max(c, 0), img.shape[0] - 1))
    col = img[:, x]
    if not col[c]:
        near = [d for d in range(-3, 4) if 0 <= c + d < len(col) and col[c + d]]
        if not near:
            return None
        c += min(near, key=abs)
    lo = c
    while lo > 0 and col[lo - 1]:
        lo -= 1
    hi = c
    while hi < len(col) - 1 and col[hi + 1]:
        hi += 1
    return lo, hi


def _end_face(k, o, c, x, T):
    """is the wall mass at (x along, c across) the END of a wall running along o (thin across), not the flank of a crossing wall?"""
    img = (k > 0) if o == "h" else (k > 0).T
    x = int(min(max(x, 0), img.shape[1] - 1)); c = int(min(max(c, 0), img.shape[0] - 1))
    col = img[:, x]
    if not col[c]:
        near = [d for d in range(-3, 4) if 0 <= c + d < len(col) and col[c + d]]
        if not near:
            return False
        c += min(near, key=abs)
    lo = c
    while lo > 0 and col[lo - 1]:
        lo -= 1
    hi = c
    while hi < len(col) - 1 and col[hi + 1]:
        hi += 1
    return (hi - lo + 1) <= 2.6 * T


def _tip(k, o, c, x, T, along):
    """the wall mass at (x along, c across) is the end of a wall on this line, or the tip of a wall crossing it right here"""
    img = (k > 0) if o == "h" else (k > 0).T
    x = int(min(max(x, 0), img.shape[1] - 1)); c = int(min(max(c, 0), img.shape[0] - 1))
    col = img[:, x]
    if not col[c]:
        near = [d for d in range(-3, 4) if 0 <= c + d < len(col) and col[c + d]]
        if not near:
            return False
        c += min(near, key=abs)
    lo = c
    while lo > 0 and col[lo - 1]:
        lo -= 1
    hi = c
    while hi < len(col) - 1 and col[hi + 1]:
        hi += 1
    if hi - lo + 1 <= 2.6 * T:
        return True
    reach = 1.2 * min(max(along, 3), 2.6 * T) + 2
    return (c - lo) <= reach or (hi - c) <= reach


def _across(k, o, c, x):
    """thickness of the wall mass across the line at (x along, c across); 0 where there is none"""
    img = (k > 0) if o == "h" else (k > 0).T
    x = int(min(max(x, 0), img.shape[1] - 1)); c = int(min(max(c, 0), img.shape[0] - 1))
    col = img[:, x]
    if not col[c]:
        return 0
    lo = c
    while lo > 0 and col[lo - 1]:
        lo -= 1
    hi = c
    while hi < len(col) - 1 and col[hi + 1]:
        hi += 1
    return hi - lo + 1

def _ink_cover(gray, k, pts, thr, text=None):
    """share of the sample points with ink within 2 px, and the share lying in wall mass or lettering"""
    H, W = gray.shape; ink = hit = tot = skipped = 0
    for x, y in pts:
        xi, yi = int(round(x)), int(round(y))
        if not (2 <= xi < W - 2 and 2 <= yi < H - 2):
            continue
        if text is not None and text[yi, xi]:                   # lettering tells nothing either way - unless it is most of the path
            skipped += 1
            continue
        tot += 1
        if k[yi, xi]:
            hit += 1
        elif gray[yi - 2:yi + 3, xi - 2:xi + 3].min() < thr:
            ink += 1
    if skipped > 0.4 * max(1, len(pts)):
        return 0.0, 1.0
    return (ink / tot if tot else 0.0), (hit / tot if tot else 1.0)


def drawn_door(m, k, g, T):
    """A door drawn in a way the tracer does not keep: a dashed V from the two jambs to a point inside the room (a folding
    door on HDB plans), or a pale / dashed quarter arc from one jamb (a swing on condo plans).  Read from the work image."""
    gray = m.get("_work_gray")
    if gray is None:
        return None
    if m.get("_text_mask") is None:                           # lettering and numbers are never part of a door symbol
        tm = np.zeros(gray.shape, np.uint8)
        for t in m["texts"] + m.get("unread_text", []):
            x, y, w, h = [int(v) for v in t["box"]]
            tm[max(0, y - 2):y + h + 3, max(0, x - 2):x + w + 3] = 1
        for l in m["lines"]:                                  # nor are dimension and extension lines
            if l.get("role") in ("dimension", "extension"):
                p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
                cv2.line(tm, (int(round(p0[0])), int(round(p0[1]))), (int(round(p1[0])), int(round(p1[1]))), 1, 5)
        m["_text_mask"] = tm
    text = m["_text_mask"]
    o, a, b, c = g["o"], g["a"], g["b"], g["c"]; L = b - a
    half = 0.5 * (g.get("hi", c) - g.get("lo", c))
    thr = min(200, int(m.get("ink_threshold", 180)))
    P = (lambda u, v: (u, v)) if o == "h" else (lambda u, v: (v, u))   # (along, across) -> (x, y)
    if L < 40:
        return None
    # a "gap" lying on a dimension line or through lettering is no gap in a wall
    on_line = [P(a + (b - a) * t, c) for t in np.linspace(0.05, 0.95, 16)]
    if sum(1 for x, y in on_line if 0 <= int(y) < gray.shape[0] and 0 <= int(x) < gray.shape[1] and text[int(y), int(x)]) >= 8:
        return None
    # the leaf alone, drawn open as a thin rectangle standing on one jamb, the arc left out (condo plans)
    perp = "v" if o == "h" else "h"
    mm_ = pseudo_scale(m)
    for hinge, j in ((("start", a), ("end", b)) if LEAF_RULE and L * mm_ <= 1000 else ()):      # one leaf: a metre at most
        for sgn in (-1, 1):
            face = c + sgn * half
            rails = []
            for l in m["lines"]:
                if l["o"] != perp or l.get("role") in ("dimension", "extension") or abs(l["c"] - j) > 0.2 * L:
                    continue
                lo_, hi_ = (l["a"], l["b"])
                near_end, far_end = (lo_, hi_) if sgn > 0 else (hi_, lo_)
                if abs(near_end - face) <= 0.15 * L and sgn * (far_end - face) >= 0.35 * L and sgn * (far_end - face) <= 1.2 * L:
                    rails.append((l["c"], sgn * (far_end - face)))
            for i in range(len(rails)):
                for j2 in range(i + 1, len(rails)):
                    gap_ = abs(rails[i][0] - rails[j2][0]); ln = min(rails[i][1], rails[j2][1])
                    if not (3 <= gap_ <= max(6, 0.12 * L) and abs(rails[i][1] - rails[j2][1]) <= 0.2 * ln):
                        continue
                    # a leaf stands alone in the room: nothing drawn alongside it, nothing running on from its far end
                    # (a kitchen counter or a wardrobe is a thin rectangle too, but never on its own)
                    lo_c, hi_c = min(rails[i][0], rails[j2][0]), max(rails[i][0], rails[j2][0])
                    away = hi_c + 0.3 * L if hinge == "start" else lo_c - 0.3 * L     # the open side (the jamb wall is on the other)
                    beside = [P(away, face + sgn * ln * t) for t in np.linspace(0.1, 0.9, 12)]
                    onward = [P(lo_c - 0.3 * L + (hi_c - lo_c + 0.6 * L) * t, face + sgn * (ln + 0.12 * L)) for t in np.linspace(0.0, 1.0, 12)]
                    inside_ = [P(0.5 * (lo_c + hi_c), face + sgn * ln * t) for t in np.linspace(0.1, 0.9, 12)]
                    checks = [_ink_cover(gray, k, pts_, thr, text) for pts_ in ((beside, onward, inside_) if gap_ >= 9 else (beside, onward))]
                    if all(cv_ <= 0.2 and ht_ <= 0.3 for cv_, ht_ in checks):
                        return ("swing" if ln >= 0.75 * L else "folding", hinge, sgn, 1.0)
    # What else is drawn in the square the symbol would stand in: the symbol must stand out from it.  A bed, a basin or a
    # window's mullions cover chance chords through the square nearly as well as they cover the symbol's own lines.
    rng = np.random.RandomState(int(a) * 7 + int(c))
    def control(sgn):
        u0, u1 = a, b; v0, v1 = c + sgn * half, c + sgn * (half + L)
        covs = []
        for _ in range(14):
            p0 = (rng.uniform(u0, u1), v0 if rng.rand() < 0.5 else v1) if rng.rand() < 0.5 else (u0 if rng.rand() < 0.5 else u1, rng.uniform(min(v0, v1), max(v0, v1)))
            p1 = (rng.uniform(u0, u1), rng.uniform(min(v0, v1), max(v0, v1)))
            pts = [P(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t) for t in np.linspace(0.1, 0.9, 20)]
            covs.append(_ink_cover(gray, k, pts, thr)[0])
        return float(np.median(covs))
    ctrl = {sgn: control(sgn) for sgn in (-1, 1)}
    best = None
    # the V: its base is the leaf, standing against one jamb and spanning half the gap or all of it
    for sgn in (-1, 1):
        if ctrl[sgn] > 0.25:
            continue
        for wf in (1.0, 0.85, 0.7, 0.6, 0.5, 0.42):
            w_ = wf * L
            for u0, u1 in ((a, a + w_), (b - w_, b)):
                for hf in (0.35, 0.5, 0.65, 0.8, 1.0):
                    apex = (0.5 * (u0 + u1), c + sgn * (half + hf * w_))
                    covs = []; hits = []
                    for j in (u0, u1):
                        pts = [P(j + (apex[0] - j) * t, c + sgn * half + (apex[1] - c - sgn * half) * t) for t in np.linspace(0.12, 0.92, 24)]
                        cv, ht = _ink_cover(gray, k, pts, thr, text); covs.append(cv); hits.append(ht)
                    sc = min(covs)
                    if sc >= 0.38 and sc >= ctrl[sgn] + 0.25 and max(hits) <= 0.15 and (best is None or sc > best[-1]):
                        # the two lines END at the apex: an arc or a longer line running on past it is not a V
                        beyond = []
                        for j in (u0, u1):
                            pts = [P(j + (apex[0] - j) * t, c + sgn * half + (apex[1] - c - sgn * half) * t) for t in np.linspace(1.12, 1.45, 8)]
                            beyond.append(_ink_cover(gray, k, pts, thr, text)[0])
                        # and nothing is drawn inside the V (the folded corner of a bed is a V with the pillow lines in it)
                        inner = []
                        for t in (0.3, 0.5, 0.7):
                            for f_ in (0.3, 0.5, 0.7):
                                lx = u0 + (apex[0] - u0) * t; rx = u1 + (apex[0] - u1) * t; y_ = c + sgn * half + (apex[1] - c - sgn * half) * t
                                inner.append(P(lx + (rx - lx) * f_, y_))
                        if max(beyond) <= 0.25 and _ink_cover(gray, k, inner, thr, text)[0] <= 0.15:
                            best = ("folding", None, sgn, sc)
                if wf == 1.0:
                    break                                    # the two anchors are the same V
    if best:
        return best
    # the quarter arc - only where the tracer found no arc: a traced arc near a jamb belongs to a door already dealt with
    # (or refused), and the swing of the door next to this gap must not be read as this gap's own
    for a_ in m.get("arcs", []):                              # an arc the tracer found at this gap was judged already
        if CURVE_NOSWING and a_.get("from") == "curve":
            continue
        cu, cv_ = (a_["cx"], a_["cy"]) if o == "h" else (a_["cy"], a_["cx"])
        if min(abs(cu - a), abs(cu - b)) <= 0.35 * L and abs(cv_ - c) <= 0.35 * L and 0.6 * L <= a_["r"] <= 1.4 * L:
            return None
    for hinge, j, along in (("start", a, 1.0), ("end", b, -1.0)):
        for sgn in (-1, 1):
            if ctrl[sgn] > 0.25:
                continue
            for r in (0.85 * L, 0.95 * L, 1.05 * L):
                pts = [P(j + along * r * math.cos(th), c + sgn * half + sgn * r * math.sin(th)) for th in np.radians(np.linspace(10, 82, 36))]
                cv, ht = _ink_cover(gray, k, pts, thr, text)
                mid_cv, _mh = _ink_cover(gray, k, pts[12:24], thr, text)    # an L of two straight lines covers the ends of an arc, not its middle
                if mid_cv < 0.35:
                    continue
                # the leaf: a line from the hinge out to the arc's far end
                leaf = [P(j, c + sgn * half + sgn * r * t) for t in np.linspace(0.2, 0.9, 12)]
                lv, lh = _ink_cover(gray, k, leaf, thr, text)
                sc = cv + 0.3 * lv
                if cv >= 0.5 and cv >= ctrl[sgn] + 0.3 and ht <= 0.15 and (best is None or sc > best[-1]):
                    best = ("swing", hinge, sgn, sc)
    return best


def _bifold_base(tri, o):
    """The two ends of a folding door's V that stand on the wall: for a gap running along o, the pair of the triangle's
    corners that lie level (o = h) or plumb (o = v) with each other.  Stage 1 does not order the corners: on some plans
    the apex comes last, on others in between."""
    pairs = ((0, 1), (0, 2), (1, 2))
    axis = 1 if o == "h" else 0
    i, j = min(pairs, key=lambda pr: abs(tri[pr[0]][axis] - tri[pr[1]][axis]))
    return tri[i], tri[j]


def _line_broken_over(m, k, g, u0, u1, band, T):
    """One of the strokes drawn along the gap (within its band) is missing over [u0, u1] but drawn on both flanks of it:
    a partition line stops at the jambs of a door hung in it."""
    gray = m.get("_work_gray")
    if gray is None:
        return False
    thr = min(200, int(m.get("ink_threshold", 180)))
    o, c = g["o"], g["c"]
    P = (lambda u, v: (u, v)) if o == "h" else (lambda u, v: (v, u))
    w = u1 - u0
    if w < 8:
        return False
    for l in m["lines"]:
        if l["o"] != o or l.get("role") in ("dimension", "extension", "door-leaf") or abs(l["c"] - c) > band + 0.5 * T:
            continue
        if l["a"] > u0 - 0.3 * w or l["b"] < u1 + 0.3 * w:
            continue                                       # the stroke must reach past the door on both sides to be the partition
        over = [P(u0 + w * t, l["c"]) for t in np.linspace(0.2, 0.8, 13)]
        left = [P(u0 - w * t, l["c"]) for t in np.linspace(0.08, 0.3, 6)]
        right = [P(u1 + w * t, l["c"]) for t in np.linspace(0.08, 0.3, 6)]
        # read the paper itself (a partition stroke lies inside the wall mask, which _ink_cover would count as wall): the
        # darkest ink under the stroke, over the door against either flank.  On a scan the line does not vanish at the
        # jambs, it goes pale (the closed leaf is drawn thin), so the test is the contrast, not presence.
        def darkest(pts):
            H, W = gray.shape; vals = []
            for x, y in pts:
                xi, yi = int(round(x)), int(round(y))
                if 2 <= xi < W - 2 and 2 <= yi < H - 2:
                    vals.append(int(gray[yi - 2:yi + 3, xi - 2:xi + 3].min()))
            return float(np.median(vals)) if vals else 255.0
        d_over, d_left, d_right = darkest(over), darkest(left), darkest(right)
        if d_over - max(d_left, d_right) >= 40 and max(d_left, d_right) < thr:
            return l
    return None


FOLD_IN_PARTITION = os.environ.get("AE_FOLD_PARTITION", "1") != "0"   # a folding door hung in a partition is as thick as the partition


def partition_band(m, o, stroke, u0, u1, T):
    """The band (lo, hi across the gap) of the partition the stroke belongs to: stage 1's partition rectangle holding the
    stroke, else the stroke and its parallel twin within a partition's thickness.  None when there is neither."""
    c = stroke["c"]
    for p in m.get("partitions", []):
        if p["o"] == o and p["c0"] - 1.5 <= c <= p["c1"] + 1.5 and p["a"] <= u1 and p["b"] >= u0:
            return float(p["c0"]), float(p["c1"])
    twins = [l for l in m["lines"] if l["o"] == o and l is not stroke and l.get("role") not in ("dimension", "extension", "door-leaf")
             and 2.0 <= abs(l["c"] - c) <= 0.7 * T and min(l["b"], u1) - max(l["a"], u0) >= 0.5 * (u1 - u0)]
    if twins:
        t_ = min(twins, key=lambda l: abs(l["c"] - c))
        return float(min(c, t_["c"])) - 1.0, float(max(c, t_["c"])) + 1.0
    return None


WALL_BAND = os.environ.get("AE_WALL_BAND", "1") != "0"   # a gap closed as wall by the strokes drawn along it is as thick as those strokes
WALL_BAND_RATIO = float(os.environ.get("AE_WALL_BAND_RATIO", 1.5))   # ... when the jambs' band is thicker than that by more than this


def strokes_band(m, g, T):
    """The band of the wall drawn ALONG a gap (a partition in outline, the panels of a screen): stage 1's partition
    rectangle over the gap, else the two outermost strokes running the length of the gap inside its band.  None when
    there is neither."""
    o, a, b_ = g["o"], g["a"], g["b"]; L = b_ - a
    lo, hi = g.get("lo", g["c"] - 0.5 * T), g.get("hi", g["c"] + 0.5 * T)
    for p in m.get("partitions", []):
        if p["o"] == o and lo - 0.5 * T <= p["c0"] and p["c1"] <= hi + 0.5 * T and min(p["b"], b_) - max(p["a"], a) >= 0.8 * L:
            return float(p["c0"]) - 1.0, float(p["c1"]) + 1.0
    inside = [l for l in m["lines"] if l["o"] == o and l.get("role") not in ("dimension", "extension", "door-leaf")
              and lo - 0.5 * T <= l["c"] <= hi + 0.5 * T and min(l["b"], b_) - max(l["a"], a) >= 0.8 * L]
    if len(inside) >= 2:
        cs = [l["c"] for l in inside]
        return float(min(cs)) - 1.0, float(max(cs)) + 1.0
    return None


def wall_gaps_take_their_strokes_band(m, openings, T):
    """A gap's band (lo / hi, across it) comes from the wall runs at its two ENDS - the cross walls, or a post.  A gap that
    is closed as wall because of the strokes drawn along it (a partition drawn in outline between two named rooms: h1's
    study wall, 84 mm, hung between a 300 mm post and the outer wall) was being filled as thick as those ends, and both
    rooms then measured the partition at the post's thickness and stood their faces on the slab.  Such a gap is as thick
    as its strokes.  Returns the number of gaps changed."""
    changed = 0
    for g in openings:
        if g["kind"] != "wall" or g.get("frame") or g.get("_stroke_band"):
            continue
        band = strokes_band(m, g, T)
        if band is None:
            continue
        w0, w1 = g.get("hi_thin", g["hi"]) - g.get("lo_thin", g["lo"]), band[1] - band[0]
        if w1 < 2.0 or w0 <= WALL_BAND_RATIO * w1:
            continue
        g["_stroke_band"] = True
        g.update(lo=band[0], hi=band[1], lo_thin=band[0], hi_thin=band[1], c=0.5 * (band[0] + band[1]), c_lo=0.5 * (band[0] + band[1]), c_hi=0.5 * (band[0] + band[1]))
        changed += 1
    return changed


def _panels_in_wall(part, g, c, L, mm):
    """two strokes of the gap's own wall (between its faces), 15 - 100 mm apart and staggered along it: sliding panels"""
    lo_, hi_ = g.get("lo", c) - 2.0, g.get("hi", c) + 2.0
    wall_ = [l for l in part if lo_ <= l["c"] <= hi_]
    for i_, l1 in enumerate(wall_):
        for l2 in wall_[i_ + 1:]:
            if 15 <= abs(l1["c"] - l2["c"]) * mm <= 100 and (abs(l1["a"] - l2["a"]) >= 0.08 * L or abs(l1["b"] - l2["b"]) >= 0.08 * L):
                return True
    return False


def classify_gaps(m, k, gaps):
    """door / window / folding door / passage / hidden wall, from what is drawn in the gap"""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m)
    lines = [l for l in m["lines"] if l.get("role") not in ("dimension", "extension")]
    arcs = m.get("arcs", [])
    used_arcs = set()
    out = []
    # door swings: hinge at one jamb, radius about the gap, closed position along the gap.  Every swing opens ONE gap: the
    # one its radius fits best.
    cand = []
    for gi, g in enumerate(gaps):
        o, c, a, b_ = g["o"], g["c"], g["a"], g["b"]; L = b_ - a
        tj = [t_ for t_ in (_across(k, g["o"], g["c"], g["a"] - 2), _across(k, g["o"], g["c"], g["b"] + 1)) if 0 < t_ <= 2.6 * T]
        band = max(T, 0.5 * (g["c_hi"] - g["c_lo"]) + 0.6 * T, 0.5 * max(tj) + 3 if tj else 0)
        for i, a_ in enumerate(arcs):
            if CURVE_NOSWING and a_.get("from") == "curve":
                continue                                     # a curved parapet is no door, however wide the gap beside it
            hx, hy = (a_["cx"], a_["cy"]) if o == "h" else (a_["cy"], a_["cx"])
            if abs(hy - c) > band + 0.4 * T:
                continue
            for end, sgn in ((a, 1), (b_, -1)):
                if abs(hx - end) <= 1.1 * T + 0.12 * a_["r"]:
                    want = (0.0 if o == "h" else 90.0) + (0.0 if sgn > 0 else 180.0)
                    ends = [a_["start"], a_["start"] + a_["span"]]
                    if any(abs(((e - want + 180) % 360) - 180) <= 12 for e in ends) or abs(a_["span"] - 90) > 1:
                        cand.append((abs(a_["r"] - L) + abs(hx - end), gi, i, sgn))
    door_of = {}; pairs = []
    for err, gi, i, sgn in sorted(cand):
        g = gaps[gi]; L = g["b"] - g["a"]; r = arcs[i]["r"]
        if i in used_arcs:
            continue
        if gi in door_of:
            d0 = door_of[gi]
            if len(d0) == 1 and d0[0][1] != sgn and abs(arcs[d0[0][0]]["r"] + r - L) <= 0.25 * L + 0.6 * T:
                d0.append((i, sgn)); used_arcs.add(i)
            continue
        if abs(r - L) <= 0.28 * L + 0.6 * T:
            door_of[gi] = [(i, sgn)]; used_arcs.add(i)
        else:
            other = [(e2, i2, s2) for e2, g2, i2, s2 in cand if g2 == gi and i2 != i and s2 != sgn and i2 not in used_arcs]
            for e2, i2, s2 in other:
                if abs(arcs[i2]["r"] + r - L) <= 0.25 * L + 0.6 * T:
                    door_of[gi] = [(i, sgn), (i2, s2)]; used_arcs.update((i, i2)); break
    for gi, g in enumerate(gaps):
        o, c, a, b_ = g["o"], g["c"], g["a"], g["b"]; L = b_ - a
        tj = [t_ for t_ in (_across(k, g["o"], g["c"], g["a"] - 2), _across(k, g["o"], g["c"], g["b"] + 1)) if 0 < t_ <= 2.6 * T]
        band = max(T, 0.5 * (g["c_hi"] - g["c_lo"]) + 0.6 * T, 0.5 * max(tj) + 3 if tj else 0)
        if gi in door_of:
            ds = door_of[gi]
            if len(ds) == 1:
                i, sgn = ds[0]; a_ = arcs[i]
                ang = [a_["start"], a_["start"] + a_["span"]]
                along = (0.0 if o == "h" else 90.0) + (0.0 if sgn > 0 else 180.0)
                leaf = max(ang, key=lambda e: abs(((e - along + 180) % 360) - 180))      # the radial end that is NOT along the wall
                side = math.sin(math.radians(leaf)) if o == "h" else math.cos(math.radians(leaf))
                out.append(dict(g, kind="door", operation="swing", hinge="start" if sgn > 0 else "end", swing_side=1 if side > 0 else -1,
                                leaf_px=float(a_["r"]), confidence=0.9 if abs(a_["r"] - L) <= 0.15 * L else 0.75, arcs=[i]))
            else:
                out.append(dict(g, kind="door", operation="swing", hinge="none", handing="double", swing_side=0, confidence=0.8, arcs=[d[0] for d in ds]))
            continue
        # folding doors: the two ends of the drawn zig-zag stand at the two jambs
        fold = None
        for s_ in m.get("free_symbols", []):
            if s_.get("type") == "bifold":
                p0, p2 = s_["tri"][0], s_["tri"][2]
                u = sorted((p0[0], p2[0]) if o == "h" else (p0[1], p2[1])); v = ((p0[1] + p2[1]) / 2) if o == "h" else ((p0[0] + p2[0]) / 2)
                if abs(v - c) <= band + T and abs(u[0] - a) <= 1.2 * T and abs(u[1] - b_) <= 1.2 * T:
                    fold = s_
        if fold is not None:
            out.append(dict(g, kind="door", operation="folding", hinge="unknown", swing_side=0, confidence=0.8)); fold["_hosted"] = True; continue
        # a folding door standing in a LONGER gap (the partition it is hung in was traced as two strokes, not as wall):
        # the door takes its own width, what is left of the gap on either side of it is wall
        part_fold = None
        for s_ in m.get("free_symbols", []):
            if s_.get("type") == "bifold" and not s_.get("_hosted"):
                p0, p2 = _bifold_base(s_["tri"], o)
                if (abs(p0[1] - p2[1]) <= abs(p0[0] - p2[0])) != (o == "h"):
                    continue
                u = sorted((p0[0], p2[0]) if o == "h" else (p0[1], p2[1])); v = ((p0[1] + p2[1]) / 2) if o == "h" else ((p0[0] + p2[0]) / 2)
                if not (abs(v - c) <= band + T and u[0] >= a - 0.6 * T and u[1] <= b_ + 0.6 * T):
                    continue
                if (u[1] - u[0]) >= 0.25 * L:
                    part_fold = (s_, max(a, u[0]), min(b_, u[1]), None)
                else:
                    broken = _line_broken_over(m, k, g, u[0], u[1], band, T) if 250 <= (u[1] - u[0]) * mm <= 1300 else None
                    if broken is not None:
                        # A bathroom folding door 400-900 mm wide hung in a long partition (exec, h1): the V is narrow against
                        # the gap, but one of the partition's strokes stops at its jambs.  The folded corner of a bed is a V
                        # too, drawn against the bedside strip - its edge lines run straight through.
                        part_fold = (s_, max(a, u[0]), min(b_, u[1]), broken)
        if part_fold is not None:
            s_, u0, u1, broken = part_fold; s_["_hosted"] = True
            # The gap's band came from the walls at its two ends (the room's cross walls), not from the partition the door
            # hangs in; the door, and the wall on either side of it, are as thick as that partition and sit on its line.
            # Otherwise the whole partition is closed as a slab as thick as the cross walls, and both rooms measure it so.
            band_ = partition_band(m, o, broken, a, b_, T) if (FOLD_IN_PARTITION and broken is not None) else None
            gb = dict(g, lo=band_[0], hi=band_[1], lo_thin=band_[0], hi_thin=band_[1], c=0.5 * (band_[0] + band_[1]), c_lo=0.5 * (band_[0] + band_[1]), c_hi=0.5 * (band_[0] + band_[1])) if band_ else g
            if band_:
                m["_fold_partition"] = m.get("_fold_partition", 0) + 1
            out.append(dict(gb, a=u0, b=u1, kind="door", operation="folding", hinge="unknown", swing_side=0, confidence=0.75))
            for r0, r1 in ((a, u0), (u1, b_)):
                if r1 - r0 > 3:
                    out.append(dict(gb, a=r0, b=r1, kind="wall", operation=None, confidence=0.5, why="beside a folding door"))
            continue
        # strokes drawn in the gap, inside the thickness of the wall
        inband = [l for l in lines if l["o"] == o and abs(l["c"] - c) <= band + 0.5 * T and l["a"] >= a - 0.6 * T and l["b"] <= b_ + 0.6 * T and l.get("role") != "door-leaf"]
        inside = [l for l in lines if l["o"] == o and abs(l["c"] - c) <= band + 0.5 * T and l.get("role") != "door-leaf" and min(l["b"], b_) - max(l["a"], a) >= 0.8 * L]
        part = [l for l in inband if 0.2 * L <= min(l["b"], b_) - max(l["a"], a) < 0.8 * L]
        cover = np.zeros(max(1, int(L)), bool)
        for l in inband:
            cover[max(0, int(l["a"] - a)):max(0, int(l["b"] - a))] = True
        tipped = _tip(k, o, c, a - 2, T, g["jamb"][0]) or _tip(k, o, c, b_ + 1, T, g["jamb"][1])
        if len(inside) >= 2 and L * mm >= 350 and tipped:
            # A closed door leaf drawn across the opening (the household-shelter blast door, c21 / p05): a thin rectangle
            # two long strokes 25-90 mm apart, lying against ONE face of the wall, nothing on the other half of the
            # thickness.  A window band spreads its strokes over the wall's thickness.  A stroke on the face line itself
            # is the wall's outline running across the opening, not the symbol.
            lo_, hi_ = g.get("lo", c), g.get("hi", c)
            sym = [l["c"] for l in inside if min(abs(l["c"] - lo_), abs(l["c"] - hi_)) > 2.5]
            leaf = any(25 <= abs(u_ - v_) * mm <= 90 for i_, u_ in enumerate(sym) for v_ in sym[i_ + 1:]) or \
                   any(25 <= min(abs(u_ - lo_), abs(u_ - hi_)) * mm <= 90 for u_ in sym)
            one_side = bool(sym) and (all(u_ <= c for u_ in sym) or all(u_ >= c for u_ in sym))
            # Only where a household shelter is labelled next to the opening: an exterior window is drawn flush with
            # the outer face as well, and the blast door is the one door on these plans drawn closed.
            mid_ = ((a + b_) / 2.0, c) if o == "h" else (c, (a + b_) / 2.0)
            shelter = any(room_type(t.get("s", "")) == "shelter" and math.hypot(t["box"][0] + t["box"][2] / 2 - mid_[0], t["box"][1] + t["box"][3] / 2 - mid_[1]) * mm <= 2500
                          for t in m.get("texts", []))
            if leaf and one_side and shelter and 600 <= L * mm <= 1300 and (hi_ - lo_) * mm >= 150:
                out.append(dict(g, kind="door", operation="swing", hinge="unknown", swing_side=0, confidence=0.55, why="a closed leaf drawn across the opening, against one face of the wall")); continue
            out.append(dict(g, kind="window", operation="fixed", hinge="none", swing_side=0, confidence=0.85 if len(inside) >= 3 else 0.7, strokes=len(inside))); continue
        # sliding doors: two or more PANELS (each a thin rectangle: two strokes of one length, a panel's thickness apart),
        # staggered across the wall line and between them covering the gap
        panels = []
        for i_, l1 in enumerate(inband):
            for l2 in inband[i_ + 1:]:
                if abs(l1["a"] - l2["a"]) <= 4 and abs(l1["b"] - l2["b"]) <= 4 and 15 <= abs(l1["c"] - l2["c"]) * mm <= 90 and 0.2 * L <= l1["b"] - l1["a"] < 0.8 * L:
                    panels.append((min(l1["a"], l2["a"]), max(l1["b"], l2["b"]), (l1["c"] + l2["c"]) / 2))
        pc = np.zeros(max(1, int(L)), bool)
        for p0_, p1_, _c in panels:
            pc[max(0, int(p0_ - a)):max(0, int(p1_ - a))] = True
        if len(panels) >= 2 and pc.mean() >= 0.8 and 700 <= L * mm <= 5200 and len({round(p_[0] / 6) for p_ in panels}) >= 2:
            out.append(dict(g, kind="door", operation="sliding", hinge="none", swing_side=0, confidence=0.7, why="staggered panels from jamb to jamb")); continue
        # panels drawn slid half open, each as one stroke: three or more staggered strokes on three lines close together
        stag = sorted(part, key=lambda l: l["c"])
        if len(stag) >= 3 and len({round(l["c"] / 2) for l in stag}) >= 3 and (stag[-1]["c"] - stag[0]["c"]) * mm <= 220 and 1200 <= L * mm <= 5200 and \
                max(l["a"] for l in stag) - min(l["a"] for l in stag) >= 0.08 * L and max(l["b"] for l in stag) - min(l["b"] for l in stag) >= 0.08 * L and cover.mean() >= 0.5:
            out.append(dict(g, kind="door", operation="sliding", hinge="none", swing_side=0, confidence=0.6, why="three or more staggered panel strokes")); continue
        if len(part) >= 2 and cover.mean() >= 0.85 and 700 <= L * mm <= 5200 and len({round(l["c"]) for l in part}) >= 2 and \
                tipped and g.get("on_wall_line"):
            out.append(dict(g, kind="door", operation="sliding", hinge="none", swing_side=0, confidence=0.55, why="staggered strokes between two wall ends",
                            panels=_panels_in_wall(part, g, c, L, mm))); continue
        # A sliding partition between a bedroom and the living room (the 2-room flat's bedroom wall, d13): a gap of two
        # metres or more between a post and a wall, with two thin strokes a panel's width apart and staggered along it,
        # covering most of it - the panels, slid open at one end.  Whether it is a door is decided once the rooms are
        # made: only between two different named indoor rooms (else the gap stays open, as before).
        if PANEL_PAIR and L * mm >= 1800 and tipped:
            near = [l for l in part if abs(l["c"] - c) <= 1.0 * T]
            pair = None
            for i_, l1 in enumerate(near):
                for l2 in near[i_ + 1:]:
                    if 15 <= abs(l1["c"] - l2["c"]) * mm <= 100 and (abs(l1["a"] - l2["a"]) >= 0.08 * L or abs(l1["b"] - l2["b"]) >= 0.08 * L):
                        cv_ = np.zeros(max(1, int(L)), bool)
                        for l in (l1, l2):
                            cv_[max(0, int(l["a"] - a)):max(0, int(l["b"] - a))] = True
                        if cv_.mean() >= PANEL_PAIR_COVER and (pair is None or cv_.mean() > pair[0]):
                            pair = (float(cv_.mean()), l1, l2)
            if pair is not None:                             # (a candidate only: added at the end where nothing else was read in the gap)
                pairs.append(dict(g, kind="door", operation="sliding", hinge="none", swing_side=0, confidence=0.5, panels=True, from_strokes=True,
                                  why="two staggered strokes a panel's width apart along a long gap: a sliding partition"))
        ends_ok = _end_face(k, o, c, a - 2, T) and _end_face(k, o, c, b_ + 1, T)
        if L * mm <= 500:
            if _end_face(k, o, c, a - 2, T) or _end_face(k, o, c, b_ + 1, T):
                out.append(dict(g, kind="wall", operation=None, confidence=0.45, why="a break in a wall line shorter than any opening, with nothing drawn in it"))
            continue
        one_end = _end_face(k, o, c, a - 2, T) or _end_face(k, o, c, b_ + 1, T)
        if one_end and 550 <= L * mm <= 1500:
            dd = drawn_door(m, k, g, T)
            if dd and dd[0] == "folding":
                out.append(dict(g, kind="door", operation="folding", hinge="unknown", swing_side=dd[2], confidence=0.7, why="dashed V from the two jambs")); continue
            if dd and dd[0] == "swing":
                out.append(dict(g, kind="door", operation="swing", hinge=dd[1], swing_side=dd[2], leaf_px=float(L), confidence=0.7, why="pale or dashed swing arc")); continue
        if len(inside) == 1 and L * mm <= 3600 and one_end and abs(inside[0]["c"] - c) <= band:
            out.append(dict(g, kind="open_passage", operation="open", hinge="none", swing_side=0, confidence=0.55, why="one stroke from jamb to jamb")); continue
        if ends_ok and 550 <= L * mm <= PASSAGE_MAX_MM:
            # (wider than 1.5 m - the doorless opening between exec's study and its living room - only once the rooms are
            #  made, and only between two different named indoor rooms)
            out.append(dict(g, kind="open_passage", operation="open", hinge="none", swing_side=0, confidence=0.4, wide=bool(L * mm > 1500),
                            why="two wall ends facing each other a door's width apart")); continue
    rank = {"door": 0, "window": 1, "open_passage": 2, "wall": 3}
    out.sort(key=lambda g: (rank[g["kind"]], -g["confidence"]))
    kept = []
    for g in out:                                           # one opening per place
        clash = any(h["o"] == g["o"] and abs(h["c"] - g["c"]) <= (3.0 if h["kind"] == g["kind"] == "door" else 1.5) * T and min(h["b"], g["b"]) - max(h["a"], g["a"]) > 0.3 * min(h["b"] - h["a"], g["b"] - g["a"]) for h in kept)
        if not clash:
            kept.append(g)
    for g in pairs:                                         # the sliding-partition candidates, where the gap got nothing else
        same = lambda h: h["o"] == g["o"] and abs(h["c"] - g["c"]) <= 1.5 * T
        ov = lambda h: min(h["b"], g["b"]) - max(h["a"], g["a"])
        if any(same(h) and (h["kind"] == "door" or ov(h) > 0.3 * (g["b"] - g["a"])) for h in kept):
            continue
        # a window or wall piece read on a part of the gap (the strokes beside the shorter panel) is part of the partition
        g["displaced"] = [h for h in kept if same(h) and ov(h) >= 0.5 * (h["b"] - h["a"])]      # (put back if the door is not kept)
        kept = [h for h in kept if not (same(h) and ov(h) >= 0.5 * (h["b"] - h["a"]))] + [g]
    # a folding door drawn across a wall that was traced straight through it
    for s_ in m.get("free_symbols", []):
        if s_.get("type") != "bifold" or s_.get("_hosted"):
            continue
        p0, p2 = s_["tri"][0], s_["tri"][2]
        o = "h" if abs(p0[1] - p2[1]) <= abs(p0[0] - p2[0]) else "v"
        u = sorted((p0[0], p2[0]) if o == "h" else (p0[1], p2[1])); v = ((p0[1] + p2[1]) / 2) if o == "h" else ((p0[0] + p2[0]) / 2)
        best = None
        for d_ in sorted(range(-int(1.5 * T), int(1.5 * T) + 1, 2), key=abs):
            r_ = _across_run(k, o, v + d_, (u[0] + u[1]) / 2)
            if r_ is not None and r_[1] - r_[0] + 1 <= 2.6 * T and r_[0] - 3 <= v + d_ <= r_[1] + 3:
                best = r_; break
        if best is None:
            continue
        g = {"o": o, "a": float(u[0]), "b": float(u[1]), "lo": float(best[0]), "hi": float(best[1] + 1), "c": (best[0] + best[1] + 1) / 2.0, "jamb": [0, 0]}
        g["c_lo"] = g["c_hi"] = g["c"]
        if not any(h["o"] == o and abs(h["c"] - g["c"]) <= 1.5 * T and min(h["b"], g["b"]) - max(h["a"], g["a"]) > 0.3 * (g["b"] - g["a"]) for h in kept):
            kept.append(dict(g, kind="door", operation="folding", hinge="unknown", swing_side=0, confidence=0.7, why="folding door drawn on a traced wall"))
    for s_ in m.get("free_symbols", []):
        s_.pop("_hosted", None)
    # A swing that found no gap on a known wall line: look along its own two edges, a little to either side of the hinge,
    # for free floor that starts at the hinge and ends where the leaf would close.
    img_h, img_v = (k > 0), (k > 0).T
    for i, a_ in enumerate(arcs):
        if i in used_arcs or abs(a_["span"] - 90) > 1:
            continue
        best = None
        for ang in (a_["start"], a_["start"] + a_["span"]):
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            if abs(dx) + abs(dy) != 1:
                continue
            o = "h" if dx else "v"; img = img_h if dx else img_v; sgn = dx or dy
            hx, hc = (a_["cx"], a_["cy"]) if dx else (a_["cy"], a_["cx"]); r = a_["r"]
            for s_ in sorted(range(-int(T), int(T) + 1, 2), key=abs):
                c = int(round(hc + s_))
                if not (1 <= c < img.shape[0] - 1):
                    continue
                row = img[c - 1:c + 2].any(axis=0)
                mid = int(round(hx + sgn * 0.5 * r))
                if not (0 <= mid < len(row)) or row[mid]:
                    continue
                lo = mid
                while lo > 0 and not row[lo - 1]:
                    lo -= 1
                hi = mid
                while hi < len(row) - 1 and not row[hi + 1]:
                    hi += 1
                hi += 1
                near, far = (lo, hi) if sgn > 0 else (hi, lo)
                if lo == 0 or hi >= len(row) - 1:
                    continue
                e1, e2 = abs(near - hx), abs(far - (hx + sgn * r))
                if e1 <= 0.25 * r + 0.3 * T and e2 <= 0.25 * r + 0.3 * T:
                    cand_ = (e1 + e2 + 0.5 * abs(s_), o, c, lo, hi, sgn, ang)
                    if best is None or cand_[0] < best[0]:
                        best = cand_
                    break
        if best is None:
            continue
        _e, o, c, lo, hi, sgn, ang = best
        g = {"o": o, "c": float(c), "a": float(lo), "b": float(hi), "jamb": [0, 0], "c_lo": float(c), "c_hi": float(c)}
        runs = [r_ for r_ in (_across_run(k, o, c, lo - 2), _across_run(k, o, c, hi + 1)) if r_ is not None and r_[1] - r_[0] + 1 <= 2.6 * T]
        if runs:
            g["lo"], g["hi"] = float(min(r_[0] for r_ in runs)), float(max(r_[1] for r_ in runs) + 1); g["c"] = (g["lo"] + g["hi"]) / 2
        else:
            g["lo"], g["hi"] = c - T / 2.0, c + T / 2.0
        if any(h["o"] == o and abs(h["c"] - g["c"]) <= 3.0 * T and min(h["b"], hi) - max(h["a"], lo) > 0.3 * (hi - lo) for h in kept if h["kind"] == "door"):
            used_arcs.add(i); continue                       # the gate of a door already found
        other = [e for e in (a_["start"], a_["start"] + a_["span"]) if e != ang][0]
        side = math.sin(math.radians(other)) if o == "h" else math.cos(math.radians(other))
        kept = [h for h in kept if not (h["o"] == o and abs(h["c"] - g["c"]) <= 1.5 * T and min(h["b"], hi) - max(h["a"], lo) > 0.3 * min(hi - lo, h["b"] - h["a"]))]
        kept.append(dict(g, kind="door", operation="swing", hinge="start" if sgn > 0 else "end", swing_side=1 if side > 0 else -1, leaf_px=float(a_["r"]),
                         confidence=0.8, arcs=[i], why="found from the swing"))
        used_arcs.add(i)
    unhosted = [i for i in range(len(arcs)) if i not in used_arcs]
    return kept, unhosted


# ----------------------------------------------------------------------------------------------- rooms

def window_bundles(m, k, need_ends=True):
    """A window is drawn as a BAND of three or more parallel strokes of one length, no wider than a wall.  Found from the
    strokes alone, so that a window running into another window at a corner (no wall there at all) is still a boundary.
    A band must end on wall mass or on another band at both ends."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = k.shape
    lines = [l for l in m["lines"] if l.get("role") not in ("dimension", "extension", "door-leaf") and (l["b"] - l["a"]) * mm >= 450]
    bands = []
    for o in ("h", "v"):
        ls = sorted([l for l in lines if l["o"] == o], key=lambda l: l["c"])
        used = set()
        for i, l in enumerate(ls):
            if i in used:
                continue
            grp = [i]
            for j in range(i + 1, len(ls)):
                q = ls[j]
                if (q["c"] - ls[grp[0]]["c"]) * mm > 380:
                    break
                if j in used:
                    continue
                ov = min(q["b"], l["b"]) - max(q["a"], l["a"])
                if ov >= 0.85 * max(q["b"] - q["a"], l["b"] - l["a"]):
                    grp.append(j)
            if len(grp) >= 3:
                used.update(grp)
                a = float(np.median([ls[j]["a"] for j in grp])); b = float(np.median([ls[j]["b"] for j in grp]))
                lo, hi = ls[grp[0]]["c"], ls[grp[-1]]["c"]
                furn = m.get("_furniture")
                if furn is not None:
                    # the rail and the two long edges of a wardrobe are three parallel strokes as well
                    ya, yb, xa, xb = (int(lo), int(math.ceil(hi)) + 1, int(a), int(math.ceil(b)) + 1) if o == "h" else (int(a), int(math.ceil(b)) + 1, int(lo), int(math.ceil(hi)) + 1)
                    box = furn[max(0, ya - 3):yb + 3, max(0, xa - 3):xb + 3]
                    if box.size and float((box > 0).mean()) >= 0.3:
                        continue
                if (hi - lo) * mm >= 60:
                    bands.append({"o": o, "a": a, "b": b, "lo": float(lo), "hi": float(hi), "c": (lo + hi) / 2.0, "c_lo": float(lo), "c_hi": float(hi), "jamb": [0, 0],
                                  "kind": "window", "operation": "fixed", "hinge": "none", "swing_side": 0, "confidence": 0.8, "strokes": len(grp), "why": "a band of parallel strokes"})
    def rect(g, grow=0.0):
        return (g["a"] - grow, g["lo"] - grow, g["b"] + grow, g["hi"] + grow) if g["o"] == "h" else (g["lo"] - grow, g["a"] - grow, g["hi"] + grow, g["b"] + grow)
    def touches(g, end, others):
        u = g["a"] if end == 0 else g["b"]; sgn = -1 if end == 0 else 1
        for s_ in range(0, int(0.9 * T) + 2):
            for v in (g["lo"], g["c"], g["hi"]):
                x, y = (u + sgn * s_, v) if g["o"] == "h" else (v, u + sgn * s_)
                xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < W and 0 <= yi < H and k[yi, xi]:
                    return True
                for h_ in others:
                    x0, y0, x1, y1 = rect(h_, 0.3 * T)
                    if x0 <= x <= x1 and y0 <= y <= y1:
                        return True
        return False
    changed = need_ends
    while changed:
        changed = False
        for g in list(bands):
            others = [h_ for h_ in bands if h_ is not g]
            if not (touches(g, 0, others) and touches(g, 1, others)):
                bands.remove(g); changed = True
    return bands


def close_openings(m, k, openings, thin=False):
    """the wall mass with every door, window and passage filled in: what is left free is floor (thin: filled only as thick
    as the thinner of the two jambs - the mask the wall thickness is measured on, so that a post at one jamb does not
    make the whole wall as thick as itself)"""
    T = float(m["wall_thickness_px"]); H, W = k.shape
    closed = k.copy()
    reach = int(0.9 * T) + 2                                  # what window_bundles allows between a band's end and the wall
    for g in openings:
        g["t"] = max(2.0, g.get("hi_thin", g["hi"]) - g.get("lo_thin", g["lo"]))   # the opening is as thick as the wall it sits in
        a, b = int(math.floor(g["a"])) - 1, int(math.ceil(g["b"])) + 1
        lo, hi = (g.get("lo_thin", g["lo"]), g.get("hi_thin", g["hi"])) if thin else (g["lo"], g["hi"])
        c0, c1 = int(math.floor(lo)), int(math.ceil(hi))
        # a band of strokes that stops a few pixels short of the wall it belongs to still closes up to that wall
        cm = int(round((g["lo"] + g["hi"]) / 2.0))
        kk = g["frame"]["kr"] if g.get("frame") else k         # (an opening in a slanted wall: in its own frame)
        Hk, Wk = kk.shape
        for end, sgn in ((0, -1), (1, 1)):
            u = a if end == 0 else b
            for d in range(1, reach + 1):
                v = u + sgn * d
                if not (0 <= v < (Wk if g["o"] == "h" else Hk)) or not (0 <= cm < (Hk if g["o"] == "h" else Wk)):
                    break
                hit = kk[cm, v] if g["o"] == "h" else kk[v, cm]
                if hit:
                    if end == 0:
                        a = v
                    else:
                        b = v
                    break
        if g.get("frame"):
            quad = [g_pt(g, a, c0), g_pt(g, b + 1, c0), g_pt(g, b + 1, c1), g_pt(g, a, c1)]
            cv2.fillPoly(closed, [np.rint(np.array(quad)).astype(np.int32)], 255)
        elif g["o"] == "h":
            closed[max(0, c0):c1, max(0, a):b + 1] = 255
        else:
            closed[max(0, a):b + 1, max(0, c0):c1] = 255
    return closed


CHAMFER = os.environ.get("AE_CHAMFER", "1") != "0"     # a scrap of a side across a corner between two level / plumb sides: the corner is where they cross
CHAMFER_T = float(os.environ.get("AE_CHAMFER_T", 0.6))  # ... when the scrap is shorter than this many T
CHAMFER_FAR = float(os.environ.get("AE_CHAMFER_FAR", 1.0))   # ... and its corners land this many T or more from its face ends (or its neighbours cross)
CHAMFER_JAMB = float(os.environ.get("AE_CHAMFER_JAMB", 1.0))  # ... and it stands within this many T of an opening's jamb


def _simplify(pts, step_lim, spur_lim, far_lim=0.0, protect=None):
    """Take the small steps (a column standing a little proud of its wall) and the stubs (a wall end standing in the room) out
    of a room outline.  The outline is handled as a ring of LINES (corners are where neighbours cross), so taking a side out
    can never bend the sides that stay.  A side protect(a, b) says yes to (one that follows a curve) is never taken out.
    (Round 16 tried taking chamfers - a scrap of a side across a corner - out here as well: on the outline plans that
    unmasks the steps the scraps sat between, and the step rule then moves whole walls; left to _legal_outline, which
    takes out only the chamfers that do harm.)"""
    P = [tuple(map(float, p)) for p in pts]
    P = [p for i, p in enumerate(P) if math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.5]
    lines = []
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        lines.append({"p": a, "u": ((b[0] - a[0]) / L, (b[1] - a[1]) / L), "keep": bool(protect and protect(a, b))})
    def cross(l1, l2):
        den = l1["u"][0] * l2["u"][1] - l1["u"][1] * l2["u"][0]
        if abs(den) < 1e-9:
            return None
        k_ = ((l2["p"][0] - l1["p"][0]) * l2["u"][1] - (l2["p"][1] - l1["p"][1]) * l2["u"][0]) / den
        return (l1["p"][0] + l1["u"][0] * k_, l1["p"][1] + l1["u"][1] * k_)
    def merge_parallel(ls):
        """neighbours on one line (or on two lines a hair apart) are one side: the longer one says where"""
        changed = True
        while changed and len(ls) > 3:
            changed = False
            V = verts(ls)
            for i in range(len(ls)):
                j = (i + 1) % len(ls)
                if ls[i]["keep"] or ls[j]["keep"]:
                    continue
                if abs(ls[i]["u"][0] * ls[j]["u"][1] - ls[i]["u"][1] * ls[j]["u"][0]) < 0.03:
                    Li = _len(V, i, len(ls)); Lj = _len(V, j, len(ls))
                    keep, drop = (i, j) if Li >= Lj else (j, i)
                    del ls[drop]; changed = True; break
        return ls
    def verts(ls):
        n = len(ls); out = []
        for i in range(n):
            q = cross(ls[i - 1], ls[i])
            out.append(q if q is not None else ls[i]["p"])
        return out                                           # out[i] = start of side i
    def _len(V, i, n):
        a, b = V[i], V[(i + 1) % n]
        return math.hypot(b[0] - a[0], b[1] - a[1])
    lines = merge_parallel(lines)
    kept = set()                                             # steps whose removal would throw a corner far away
    for _ in range(300):
        n = len(lines)
        if n < 5:
            break
        V = verts(lines)
        best = None
        for i in range(n):
            if id(lines[i]) in kept or lines[i]["keep"]:
                continue
            L = _len(V, i, n)
            a, b = lines[i - 1], lines[(i + 1) % n]
            par = abs(a["u"][0] * b["u"][1] - a["u"][1] * b["u"][0]) < 0.03
            if not par:
                continue
            # which way do the two neighbours run?  (as walked: V[i-1]->V[i] and V[i+1]->V[i+2])
            d1 = (V[i][0] - V[i - 1][0], V[i][1] - V[i - 1][1]); d2 = (V[(i + 2) % n][0] - V[(i + 1) % n][0], V[(i + 2) % n][1] - V[(i + 1) % n][1])
            same = d1[0] * d2[0] + d1[1] * d2[1] > 0
            if (same and L < step_lim) or (not same and L < spur_lim):
                if best is None or L < best[0]:
                    best = (L, i, same)
        if best is None:
            break
        L, i, same = best
        L1, L2 = _len(V, (i - 1) % n, n), _len(V, (i + 1) % n, n)
        if same:
            drop = {i, (i + 1) % n} if L1 >= L2 else {i, (i - 1) % n}
        elif abs(L1 - L2) <= max(3.0, 0.03 * max(L1, L2)):
            drop = {(i - 1) % n, i, (i + 1) % n}
        else:
            drop = {i, (i + 1) % n} if L1 > L2 else {(i - 1) % n, i}
        if any(lines[j]["keep"] for j in drop):             # a step beside a curve stays: the curve's chain is not to be bent
            kept.add(id(lines[i]))
            continue
        cand = merge_parallel([l for j, l in enumerate(lines) if j not in drop])
        if far_lim and len(cand) >= 3:
            # every corner a removal leaves is one of the old corners, or within the size of the step it took out; two
            # lines a few degrees apart that become neighbours meet far out instead - that step stays
            lim_ = max(far_lim, step_lim if same else spur_lim)
            if any(min(math.hypot(v_[0] - w_[0], v_[1] - w_[1]) for w_ in V) > lim_ for v_ in verts(cand)):
                kept.add(id(lines[i]))
                continue
        lines = cand
    return [list(v) for v in verts(lines)]


def pull_faces_to_wall(rooms, openings):
    """A door or window is closed as thick as the thicker of its two jambs so that the room stays shut; a room face that
    then lies along that closed-up strip is moved back to the wall the opening really sits in (the thinner jamb's run)."""
    for g in openings:
        lo, hi = g["lo"], g["hi"]; lo_t, hi_t = g.get("lo_thin", lo), g.get("hi_thin", hi)
        if g.get("frame") or (abs(lo_t - lo) < 1.0 and abs(hi_t - hi) < 1.0):
            continue
        ax = 0 if g["o"] == "v" else 1                        # the coordinate across the opening
        a, b = g["a"] - 2, g["b"] + 2
        for r in rooms:
            pts = r["face"]; n = len(pts)
            for i in range(n):
                p, q = pts[i], pts[(i + 1) % n]
                if abs(p[ax] - q[ax]) > 1.0:
                    continue
                s0, s1 = sorted((p[1 - ax], q[1 - ax]))
                if min(s1, b) - max(s0, a) < 0.7 * max(1.0, s1 - s0):
                    continue
                for face, thin in ((lo, lo_t), (hi, hi_t)):
                    if abs(p[ax] - face) <= 1.5 and abs(thin - face) >= 1.0:
                        p[ax] = q[ax] = thin


STRAIGHTEN_ABS = float(os.environ.get("AE_STRAIGHTEN_ABS", 0))   # a side is made level / plumb only if it drops this many T at most
# (0 = off.  Round 15 measured 0.35: no score moved on any plan - p02's parapet slopes 0.143, past the 0.14 rule anyway, and
#  was never wall mass - while p03's faces got a little worse (8.0 % off by > 3 px against 7.9 %); left off.)


def room_outlines(m, closed):
    """free floor enclosed by walls -> one outline per room, along the FACES of its walls (working pixels)"""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m)
    curves = curve_arcs(m) if CURVE_SIDES else []; ctol = max(3.0, 0.25 * T)
    H, W = closed.shape
    wall = cv2.dilate(closed, np.ones((3, 3), np.uint8))     # a one-pixel slit between two wall pieces is not a way out
    free = (wall == 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    rooms = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if x == 0 or y == 0 or x + w >= W or y + h >= H:
            continue                                         # the outside
        if area * mm * mm < 0.35e6:
            continue
        comp = (lab == i).astype(np.uint8)
        comp = cv2.dilate(comp, np.ones((3, 3), np.uint8))   # back out to the wall faces
        cs, _h = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)
        poly = cv2.approxPolyDP(c, max(1.5, 0.12 * T), True)[:, 0, :].astype(float)
        # straighten: nearly horizontal / vertical sides become exactly so
        pts = [list(p) for p in poly]; n_ = len(pts)
        on = [side_on_curve(pts[j], pts[(j + 1) % n_], curves, ctol) for j in range(n_)]   # sides that follow a traced curve
        for j in range(n_):
            a, b = pts[j], pts[(j + 1) % n_]
            dx, dy = b[0] - a[0], b[1] - a[1]
            if math.hypot(dx, dy) < 0.35 * T or on[j] is not None:
                continue
            # (with an absolute limit as well: a long gentle slope - p02's balcony parapet, 8 degrees over 3 m - drops by
            #  far more than any wall face that is level and was only drawn a pixel off)
            lim = STRAIGHTEN_ABS * T if STRAIGHTEN_ABS > 0 else float("inf")
            if abs(dy) <= 0.14 * abs(dx) and abs(dy) <= lim:
                v = (a[1] + b[1]) / 2.0; a[1] = b[1] = v
            elif abs(dx) <= 0.14 * abs(dy) and abs(dx) <= lim:
                v = (a[0] + b[0]) / 2.0; a[0] = b[0] = v
        if CURVE_REFIT and any(on) and not all(on):
            pts = refit_curve_sides(pts, on, T)
        prot = (lambda a, b: side_on_curve(a, b, curves, ctol) is not None) if curves else None
        pts = _simplify(pts, step_lim=160.0 / mm, spur_lim=450.0 / mm, far_lim=3.0 * T + 3.0, protect=prot)
        if len(pts) >= 3:
            r_ = {"face": pts, "comp": comp, "area_px": float(area)}
            if curves:
                r_["on_curve"] = [side_on_curve(pts[j], pts[(j + 1) % len(pts)], curves, ctol) is not None for j in range(len(pts))]
            rooms.append(r_)
    return rooms


def refit_curve_sides(pts, on, T):
    """The polygon approximation of a room's outline follows a curved wall as a few long chords (each up to 0.12 T off
    the curve).  Every run of sides that lie on one traced curve is laid on that curve instead: the fitted circle,
    at the radius the face was found at, in steps of CURVE_STEP_DEG (the ends where the run's own ends were)."""
    n_ = len(pts)
    k0 = next(j for j in range(n_) if on[j] is None)
    pts = pts[k0:] + pts[:k0]; on = on[k0:] + on[:k0]
    out = []; j = 0
    while j < n_:
        if on[j] is None:
            out.append(pts[j]); j += 1; continue
        a_ = on[j]; j2 = j
        while j2 < n_ and on[j2] is a_:
            j2 += 1
        verts = [pts[q] for q in range(j, j2)] + [pts[j2 % n_]]
        rad = float(np.median([math.hypot(v[0] - a_["cx"], v[1] - a_["cy"]) for v in verts]))
        ang = [math.degrees(math.atan2(v[1] - a_["cy"], v[0] - a_["cx"])) for v in (verts[0], verts[-1])]
        d = (ang[1] - ang[0]) % 360.0
        if d > 180.0:
            d -= 360.0                                       # the run walks the curve either way: the shorter sweep is its own
        steps = max(1, int(math.ceil(abs(d) / CURVE_STEP_DEG)))
        chain = [[a_["cx"] + rad * math.cos(math.radians(ang[0] + d * i / steps)), a_["cy"] + rad * math.sin(math.radians(ang[0] + d * i / steps))] for i in range(steps + 1)]
        out.extend(chain[:-1])                               # the run's last vertex is the next side's first
        j = j2
    return out


TWIN_WELD = os.environ.get("AE_TWIN_WELD", "1") != "0"      # a side on a stroke a wall's width from a wall is welded onto that wall
TWIN_THIN = float(os.environ.get("AE_TWIN_THIN", 0.25))      # ... when what it measured behind itself is at most this many T
SPLIT_T = os.environ.get("AE_SPLIT_T", "1") != "0"           # a room side is split where the wall behind it changes thickness
SPLIT_T_RATIO = float(os.environ.get("AE_SPLIT_T_RATIO", 1.5))   # ... by more than this factor
SPLIT_T_RUN = float(os.environ.get("AE_SPLIT_T_RUN", 1.5))       # ... over a stretch at least this many T long
SPLIT_T_OTHER = os.environ.get("AE_SPLIT_T_OTHER", "1") != "0"   # ... and only where a different room looks at the thicker part


def _ray_t(wallb, px, py, nx, ny, T):
    """the thickness of wall mass behind the face point (px, py) along the outward normal, in px (None: no wall there)"""
    H, W = wallb.shape
    t, started = 0, False
    for s_ in range(-2, int(4.5 * T)):
        x, y = int(round(px + nx * s_)), int(round(py + ny * s_))
        if not (0 <= x < W and 0 <= y < H):
            break
        if wallb[y, x]:
            started = True; t += 1
        elif started or s_ > 4:
            break
    return t if started else None


def split_sides_at_thickness_changes(sides, wallb, T, orient, ops):
    """One room side runs along a 100 mm partition and then along the 300 mm structural wall of the ledge next door as ONE
    side with ONE thickness (the median of what its rays saw), so the app draws the thick part 100 mm thin - and the room
    on the other side of the thick part, which measured 300, gets its own line a wall's width away (two walls where the
    drawing has one).  The thickness is sampled every half T along the side; a stretch at least SPLIT_T_RUN T long whose
    thickness differs from its neighbours' by more than SPLIT_T_RATIO becomes a side of its own, and the two parts are
    joined by a short side across the wall (from the one centre-line to the other, inside the thicker part's band).
    Level / plumb sides only; a side on a curve is never split."""
    out = []
    for s_ in sides:
        L = s_["L"]
        if s_.get("curve") or L < 2.0 * SPLIT_T_RUN * T or not (abs(s_["u"][0]) < 1e-6 or abs(s_["u"][1]) < 1e-6):
            out.append(s_); continue
        step = max(2.0, 0.5 * T)
        n_ = int(L / step)
        if n_ < 4:
            out.append(s_); continue
        ux, uy = s_["u"]; nx, ny = s_["n"]; a = s_["a"]
        pos = [(k_ + 0.5) * L / n_ for k_ in range(n_)]
        ts = [_ray_t(wallb, a[0] + ux * q, a[1] + uy * q, nx, ny, T) for q in pos]
        # what an opening's closing box reads is the box, not the wall: those samples take their neighbours' reading
        ax = 0 if abs(ux) < 1e-6 else 1; al = 1 - ax; face = a[ax]
        o = "v" if ax == 0 else "h"
        for g in ops:
            if g["kind"] == "wall" or g.get("frame") or g["o"] != o or not (g["lo"] - 2.0 <= face <= g["hi"] + 2.0):
                continue
            for k_, q in enumerate(pos):
                if g["a"] - 1.0 <= a[al] + (uy if ax == 0 else ux) * q <= g["b"] + 1.0:
                    ts[k_] = None
        ts = [None if (t is not None and t >= 4.0 * T) else t for t in ts]   # (a ray that ran to its end ran ALONG a wall)
        if all(t is None for t in ts):
            out.append(s_); continue
        for k_ in range(n_):                                 # a sample with no wall takes its neighbour's reading
            if ts[k_] is None:
                ts[k_] = next((ts[j] for j in list(range(k_ - 1, -1, -1)) + list(range(k_ + 1, n_)) if ts[j] is not None), 0)
        # runs of one thickness: a sample joins the run while it is within the ratio of the run's median
        runs = []                                            # [start, end) sample indexes
        for k_ in range(n_):
            if runs:
                med = float(np.median(ts[runs[-1][0]:runs[-1][1]]))
                if max(ts[k_], med) <= SPLIT_T_RATIO * max(1.0, min(ts[k_], med)):
                    runs[-1][1] = k_ + 1; continue
            runs.append([k_, k_ + 1])
        # a run shorter than SPLIT_T_RUN T joins the neighbour whose thickness is nearer its own
        # ... and a run shorter than it is thick is the flank of a wall running away from the face (the rays run along
        # it), not a thicker stretch of this wall
        min_n = max(2, int(math.ceil(SPLIT_T_RUN * T / (L / n_))))
        def small(j):
            cnt = runs[j][1] - runs[j][0]
            return cnt < min_n or cnt * (L / n_) < float(np.median(ts[runs[j][0]:runs[j][1]]))
        changed = True
        while changed and len(runs) > 1:
            changed = False
            small_ = [j for j in range(len(runs)) if small(j)]
            if not small_:
                break
            k_ = min(small_, key=lambda j: runs[j][1] - runs[j][0])
            med = float(np.median(ts[runs[k_][0]:runs[k_][1]]))
            cand = [j for j in (k_ - 1, k_ + 1) if 0 <= j < len(runs)]
            j = min(cand, key=lambda q: abs(float(np.median(ts[runs[q][0]:runs[q][1]])) - med))
            lo_, hi_ = min(runs[k_][0], runs[j][0]), max(runs[k_][1], runs[j][1])
            runs = [r_ for q, r_ in enumerate(runs) if q not in (k_, j)]
            runs.insert(min(k_, j), [lo_, hi_]); changed = True
        # neighbours that ended up within the ratio of each other are one run again
        k_ = 0
        while k_ + 1 < len(runs):
            m1 = float(np.median(ts[runs[k_][0]:runs[k_][1]])); m2 = float(np.median(ts[runs[k_ + 1][0]:runs[k_ + 1][1]]))
            if max(m1, m2) <= SPLIT_T_RATIO * max(1.0, min(m1, m2)):
                runs[k_][1] = runs[k_ + 1][1]; del runs[k_ + 1]
            else:
                k_ += 1
        if len(runs) < 2:
            out.append(s_); continue
        if os.environ.get("AE_LOG_SPLIT"):
            print("SPLIT side %s-%s t %s runs %s" % ([round(v) for v in s_["a"]], [round(v) for v in s_["b"]], ts, [(r_[0], r_[1], round(float(np.median(ts[r_[0]:r_[1]])), 1)) for r_ in runs]))
        cuts = [0.5 * (pos[r_[1] - 1] + pos[r_[1]]) for r_ in runs[:-1]]   # along the side, from a
        bounds = [0.0] + cuts + [L]
        parts = []
        for r_, (q0, q1) in zip(runs, zip(bounds, bounds[1:])):
            t = float(np.median(ts[r_[0]:r_[1]]))
            if q1 - q0 < 1.5 * t:
                t = min(t, max(T, q1 - q0))
            pa = [a[0] + ux * q0, a[1] + uy * q0]; pb = [a[0] + ux * q1, a[1] + uy * q1]
            parts.append(dict(s_, a=pa, b=pb, L=q1 - q0, t=min(t, 4.0 * T), split=True, whole=s_))
        for j, part in enumerate(parts):
            if j:
                prev = parts[j - 1]
                # the joint: a side across the wall at the cut, from the thinner part's centre-line out to the thicker
                # part's (it lies inside the thicker part's band, and is as thick as the thinner part)
                d_ = 1.0 if prev["t"] <= part["t"] else -1.0
                ju = (d_ * nx, d_ * ny)
                jn = (ju[1], -ju[0]) if orient > 0 else (-ju[1], ju[0])
                out.append({"a": list(part["a"]), "b": list(part["a"]), "u": ju, "n": jn, "t": max(2.0, min(prev["t"], part["t"])),
                            "L": 0.5 * abs(part["t"] - prev["t"]), "joint": True, "whole": s_})
            out.append(part)
    return out


PAIR_STRIPS = os.environ.get("AE_PAIR_STRIPS", "1") != "0"   # two faces of one wall: the wall between them read at several places, not one


def _wall_between(s_, q, wallb, T, ops=()):
    """Is there wall between the two faces?  Read across at the middle of the two sides' common stretch - or, when an
    opening's closing box stands there (a window in the wall reads as wall; h1's bedroom | ledge wall has the ledge's
    window at the middle of the stretch, and the wall itself is beside it), at the nearest place along the stretch
    outside every opening.  PAIR_STRIPS off: always the middle (the old test)."""
    lo_, hi_ = max(s_["lo"], q["lo"]), min(s_["hi"], q["hi"])
    c0, c1 = sorted((int(round(s_["face"])), int(round(q["face"]))))
    ax = s_["axis"]; o = "v" if ax == 0 else "h"
    def in_opening(u):
        return any(g["kind"] != "wall" and not g.get("frame") and g["o"] == o and g["a"] - 1 <= u <= g["b"] + 1
                   and min(g["hi"], c1) - max(g["lo"], c0) > 0 for g in ops)
    u = 0.5 * (lo_ + hi_)
    if PAIR_STRIPS and c1 - c0 <= 1.6 * T and in_opening(u):   # (only for faces a wall's width apart: the twin class)
        free = [lo_ + f_ * (hi_ - lo_) for f_ in (0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9) if not in_opening(lo_ + f_ * (hi_ - lo_))]
        if free:
            u = free[0]
    strip = wallb[int(u), c0:c1 + 1] if ax == 0 else wallb[c0:c1 + 1, int(u)]
    return bool(strip.size) and strip.mean() >= 0.7


def _faces_each_other(s_, q, wallb, mm, T, ops=()):
    """the test two sides must pass to be the two faces of one wall (as in centre_lines' pairing)"""
    if q["axis"] != s_["axis"] or q["sgn"] == s_["sgn"]:
        return False
    d = (q["face"] - s_["face"]) * s_["sgn"]
    ov = min(s_["hi"], q["hi"]) - max(s_["lo"], q["lo"])
    if not (1.0 < d <= 650.0 / mm) or ov < 0.3 * min(s_["hi"] - s_["lo"], q["hi"] - q["lo"]) or ov < 3:
        return False
    return _wall_between(s_, q, wallb, T, ops)


def unsplit_without_partner(rooms, wallb, T, mm, ops=()):
    """A thicker part of a split side stays only if another room looks at it from the other side of the wall (the
    ledge's own side along its 300 mm wall, where the bedroom's side runs on from a 100 mm partition): a stretch of
    wall that is thicker to this room alone is a post or a strip against the wall, and the side stays one side with
    the one thickness its rays measured.  Returns the number of splits kept."""
    every = [(ri, s_) for ri, r in enumerate(rooms) for s_ in r["sides"] if "axis" in s_ and not s_.get("joint")]
    kept = 0
    for ri, r in enumerate(rooms):
        groups = {}
        for s_ in r["sides"]:
            if s_.get("whole") is not None:
                groups.setdefault(id(s_["whole"]), []).append(s_)
        undo = set()
        for gid, members in groups.items():
            parts = [s_ for s_ in members if s_.get("split")]
            thin = min(p_["t"] for p_ in parts)
            partners = [{qi for qi, q in every if qi != ri and _faces_each_other(p_, q, wallb, mm, T, ops)} for p_ in parts]
            thin_rooms = set().union(*[pr for p_, pr in zip(parts, partners) if p_["t"] <= SPLIT_T_RATIO * thin])
            for p_, pr in zip(parts, partners):
                # a thicker part stays only where a room of its own looks at it - a different room from the one(s)
                # behind the thin part: the wall behind the side changed, not only its thickness
                if p_["t"] > SPLIT_T_RATIO * thin and (not pr or (SPLIT_T_OTHER and pr & thin_rooms)):
                    undo.add(gid); break
            if gid not in undo:
                kept += 1
        if undo:
            sides = []; done = set()
            for s_ in r["sides"]:
                w = s_.get("whole")
                if w is not None and id(w) in undo:
                    if id(w) not in done:
                        sides.append(w); done.add(id(w))
                    continue
                sides.append(s_)
            r["sides"] = sides
    return kept


def centre_lines(m, closed, rooms):
    """every side of a room outline moved out by half the thickness of the wall behind it; shared walls then coincide"""
    T = float(m["wall_thickness_px"]); H, W = closed.shape
    wallb = closed > 0
    for r in rooms:
        pts = r["face"]; n = len(pts); sides = []
        area2 = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6:
                continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx, ny = (uy, -ux) if area2 > 0 else (-uy, ux)   # outward
            ts = []
            for f_ in (0.12, 0.3, 0.5, 0.7, 0.88):
                px, py = a[0] + ux * L * f_, a[1] + uy * L * f_
                t, started = 0, False
                for s_ in range(-2, int(4.5 * T)):
                    x, y = int(round(px + nx * s_)), int(round(py + ny * s_))
                    if not (0 <= x < W and 0 <= y < H):
                        break
                    if wallb[y, x]:
                        started = True; t += 1
                    elif started or s_ > 4:
                        break
                if started:
                    ts.append(t)
            t = float(np.median(ts)) if ts else T
            if L < 1.5 * t:
                t = min(t, max(T, L))                        # a short return: the ray runs ALONG the wall it belongs to
            sides.append({"a": a, "b": b, "u": (ux, uy), "n": (nx, ny), "t": min(t, 4.0 * T), "L": L})
            if r.get("on_curve") and r["on_curve"][i]:
                sides[-1]["curve"] = True
        if SPLIT_T:
            sides = split_sides_at_thickness_changes(sides, wallb, T, area2, m.get("_ops", []))
        r["sides"] = sides
    mm = pseudo_scale(m)
    for r in rooms:
        for s_ in r["sides"]:
            for axis in (0, 1):
                if abs(s_["u"][axis]) < 1e-6:                # axis 0: x constant (a vertical side); axis 1: y constant
                    s_["axis"] = axis; s_["face"] = s_["a"][axis]; s_["sgn"] = 1.0 if s_["n"][axis] > 0 else -1.0
                    s_["lo"], s_["hi"] = sorted((s_["a"][1 - axis], s_["b"][1 - axis]))
                    if s_.get("joint"):
                        s_["coord"] = s_["face"]             # (a joint between two parts of one side stands AT the cut)
                    w = s_.get("whole")
                    if w is not None and "axis" not in w:
                        w["axis"] = axis; w["face"] = w["a"][axis]; w["sgn"] = s_["sgn"]; w["lo"], w["hi"] = sorted((w["a"][1 - axis], w["b"][1 - axis]))
    ops = m.get("_ops", [])
    if SPLIT_T:
        m["_splits"] = m.get("_splits", 0) + unsplit_without_partner(rooms, wallb, T, mm, ops)
    # Two rooms looking at the SAME wall from its two sides: the centre-line is half way between their two faces, whatever
    # each of them measured by itself.
    flat = [s_ for r in rooms for s_ in r["sides"] if "axis" in s_ and not s_.get("joint")]
    parent = list(range(len(flat)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    pairs = []
    for i, s_ in enumerate(flat):
        for j in range(i + 1, len(flat)):
            q = flat[j]
            if q["axis"] != s_["axis"] or q["sgn"] == s_["sgn"]:
                continue
            d = (q["face"] - s_["face"]) * s_["sgn"]
            ov = min(s_["hi"], q["hi"]) - max(s_["lo"], q["lo"])
            # (a part of a split side faces q as its whole side does: the whole is what the wall is measured on)
            whole_ok = ov >= 3 and (s_.get("whole") is not None or q.get("whole") is not None) and \
                _faces_each_other(s_.get("whole") or s_, q.get("whole") or q, wallb, mm, T, ops)
            if whole_ok:
                pairs.append((i, j, ov, 0.5 * (s_["face"] + q["face"])))
                parent[find(i)] = find(j)
                continue
            if not (1.0 < d <= 650.0 / mm) or ov < 0.3 * min(s_["hi"] - s_["lo"], q["hi"] - q["lo"]) or ov < 3:
                if os.environ.get("AE_LOG_PAIR") and 1.0 < d <= 650.0 / mm and ov > 0:
                    bx = [float(v) for v in os.environ["AE_LOG_PAIR"].split(",")]
                    mid_ = 0.5 * (max(s_["lo"], q["lo"]) + min(s_["hi"], q["hi"])); pt = (s_["face"], mid_) if s_["axis"] == 0 else (mid_, s_["face"])
                    if bx[0] <= pt[0] <= bx[2] and bx[1] <= pt[1] <= bx[3]:
                        print("PAIR axis %d faces %.1f/%.1f d %.1f ov %.0f (%.0f/%.0f) -> too little overlap" % (s_["axis"], s_["face"], q["face"], d, ov, s_["hi"] - s_["lo"], q["hi"] - q["lo"]))
                continue
            mid = 0.5 * (max(s_["lo"], q["lo"]) + min(s_["hi"], q["hi"]))
            c0, c1 = sorted((int(round(s_["face"])), int(round(q["face"]))))
            strip = wallb[int(mid), c0:c1 + 1] if s_["axis"] == 0 else wallb[c0:c1 + 1, int(mid)]
            ok = _wall_between(s_, q, wallb, T, ops)
            if not ok and TWIN_WELD and d <= 1.6 * T:
                # A side standing on a stroke a wall's width from a real wall (the headboard of a bed drawn against the
                # wall, the front of a counter) with paper between: the room ends at the wall, and its side goes on
                # the wall's own centre-line, as thick as the wall.
                thin, thick = (s_, q) if s_["t"] <= q["t"] else (q, s_)
                if thin["t"] <= TWIN_THIN * T and thick["t"] >= 0.5 * T and thick["t"] <= d:
                    thin["twin_of"] = thick
                    pairs.append((i, j, ov, thick["face"] + thick["sgn"] * thick["t"] / 2.0))
                    parent[find(i)] = find(j); ok = None
            if os.environ.get("AE_LOG_PAIR"):
                bx = [float(v) for v in os.environ["AE_LOG_PAIR"].split(",")]
                pt = (s_["face"], mid) if s_["axis"] == 0 else (mid, s_["face"])
                if bx[0] <= pt[0] <= bx[2] and bx[1] <= pt[1] <= bx[3]:
                    print("PAIR axis %d faces %.1f/%.1f d %.1f ov %.0f (%.0f/%.0f) strip %.2f -> %s" % (s_["axis"], s_["face"], q["face"], d, ov, s_["hi"] - s_["lo"], q["hi"] - q["lo"], strip.mean() if strip.size else -1, ok))
            if ok:
                pairs.append((i, j, ov, 0.5 * (s_["face"] + q["face"])))
                parent[find(i)] = find(j)
    # every side gets a first centre-line: half way to the room on the other side where there is one, else half its own
    # measured thickness; then lines a few pixels apart are welded (length-weighted), and a group of sides that look at each
    # other across one wall always ends up on ONE line
    for s_ in flat:
        s_["coord"] = s_["face"] + s_["sgn"] * s_["t"] / 2.0
    groups = {}
    for i, j, ov, midline in pairs:
        groups.setdefault(find(i), []).append((ov, midline))
    for i, s_ in enumerate(flat):
        g = groups.get(find(i))
        if g:
            s_["coord"] = sum(o * c_ for o, c_ in g) / sum(o for o, _c in g)
    for axis in (0, 1):
        vals = sorted(((s_["coord"], s_["L"], s_) for s_ in flat if s_["axis"] == axis), key=lambda v: v[0])
        grp = []
        def flush(g):
            if g:
                w_ = sum(v[1] for v in g); c_ = sum(v[0] * v[1] for v in g) / w_
                for v in g:
                    v[2]["coord"] = c_
        for v in vals:
            if grp and v[0] - grp[-1][0] > 0.3 * T:
                flush(grp); grp = []
            grp.append(v)
        flush(grp)
    for s_ in flat:                                          # the wall is as thick as twice the way from the face to its centre-line
        if os.environ.get("AE_LOG_SIDES") and abs(s_["face"] - float(os.environ["AE_LOG_SIDES"])) < 6:
            print("side axis %d face %.1f lo %.0f hi %.0f measured t %.1f coord %.1f -> t %.1f" % (s_["axis"], s_["face"], s_["lo"], s_["hi"], s_["t"], s_["coord"], 2.0 * abs(s_["coord"] - s_["face"])))
        s_["t"] = max(2.0, min(4.0 * T, 2.0 * abs(s_["coord"] - s_["face"])))
    for s_ in flat:                                          # (a side welded onto a wall it stood a stroke away from: as thick as that wall)
        if s_.get("twin_of") is not None:
            s_["t"] = s_["twin_of"]["t"]; m["_twin_welds"] = m.get("_twin_welds", 0) + 1
    if DIAG_WELD:
        m["_welds"] = m.get("_welds", 0) + weld_slanted_sides(rooms, wallb, T, mm)
    for r in rooms:                                          # the joints of split sides, now that the parts' lines are settled
        sides = r["sides"]; n = len(sides); keep = []
        for i, s_ in enumerate(sides):
            if not s_.get("joint"):
                keep.append(s_); continue
            prev, nxt = sides[i - 1], sides[(i + 1) % n]
            if "coord" not in prev or "coord" not in nxt or prev.get("axis") != nxt.get("axis"):
                keep.append(s_); continue
            d_ = nxt["coord"] - prev["coord"]
            if abs(d_) < 0.5:
                continue                                     # (the two parts ended up on one line: no joint)
            ax = prev["axis"]; s_["u"] = (math.copysign(1.0, d_), 0.0) if ax == 0 else (0.0, math.copysign(1.0, d_))
            s_["L"] = abs(d_); s_["t"] = max(2.0, min(prev["t"], nxt["t"]))
            keep.append(s_)
        r["sides"] = keep
    kept = []
    for r in rooms:
        if os.environ.get("AE_LOG_FACES"):
            bx = [float(v) for v in os.environ["AE_LOG_FACES"].split(",")]
            if any(bx[0] <= p[0] <= bx[2] and bx[1] <= p[1] <= bx[3] for p in r["face"]):
                print("FACE", [(round(p[0]), round(p[1])) for p in r["face"]])
                print("SIDES", [(s_.get("axis"), round(s_.get("coord", -1), 1), round(s_["t"], 1), round(s_["L"])) for s_ in r["sides"]])
        ok = _legal_outline(r, T, m)
        if os.environ.get("AE_LOG_FACES") and any(bx[0] <= p[0] <= bx[2] and bx[1] <= p[1] <= bx[3] for p in r["face"]):
            print("PTS", ok, [(round(p[0]), round(p[1])) for p in r.get("pts", [])], "stubs", len(r.get("stubs", [])))
        if ok:
            kept.append(r)
        elif os.environ.get("AE_LOG_ROOMS"):
            xs_ = [p[0] for p in r["face"]]; ys_ = [p[1] for p in r["face"]]
            print("room withheld (no legal outline): face bbox %d,%d %dx%d, %d sides" % (min(xs_), min(ys_), max(xs_) - min(xs_), max(ys_) - min(ys_), len(r["face"])))
    rooms[:] = kept
    _settle_crossings(rooms, T, 650.0 / mm, m)
    # What is still not legal for the app does not leave this program: the smaller (or the stroke-closed outdoor) room of
    # a crossing pair, and any room whose own outline uses a wall twice, is withheld and counted.
    dropped = 0
    while True:
        worst = None
        for r in rooms:
            n = len(r["pts"])
            near = lambda p_, q_: math.hypot(p_[0] - q_[0], p_[1] - q_[1]) <= 2.0 * max(1.0, float(m.get("work_scale", 1) or 1))
            if any((near(r["pts"][i], r["pts"][j]) and near(r["pts"][(i + 1) % n], r["pts"][(j + 1) % n])) or
                   (near(r["pts"][i], r["pts"][(j + 1) % n]) and near(r["pts"][(i + 1) % n], r["pts"][j])) for i in range(n) for j in range(i + 1, n)):
                worst = r; break
            for q in rooms:
                if q is r:
                    continue
                m_ = len(q["pts"])
                if any(_proper_cross(r["pts"][i], r["pts"][(i + 1) % n], q["pts"][j], q["pts"][(j + 1) % m_]) and
                       min(_pt_seg(r["pts"][i], q["pts"][j], q["pts"][(j + 1) % m_]), _pt_seg(r["pts"][(i + 1) % n], q["pts"][j], q["pts"][(j + 1) % m_]),
                           _pt_seg(q["pts"][j], r["pts"][i], r["pts"][(i + 1) % n]), _pt_seg(q["pts"][(j + 1) % m_], r["pts"][i], r["pts"][(i + 1) % n])) > 0.75 * max(1.0, float(m.get("work_scale", 1) or 1))
                       for i in range(n) for j in range(m_)):
                    worst = r if (r.get("outdoor") and not q.get("outdoor")) or (bool(r.get("outdoor")) == bool(q.get("outdoor")) and r["area_px"] <= q["area_px"]) else q
                    if os.environ.get("AE_LOG_ROOMS"):
                        for i in range(n):
                            for j in range(m_):
                                if _proper_cross(r["pts"][i], r["pts"][(i + 1) % n], q["pts"][j], q["pts"][(j + 1) % m_]):
                                    print("   cross: %s-%s x %s-%s" % ([round(v) for v in r["pts"][i]], [round(v) for v in r["pts"][(i + 1) % n]], [round(v) for v in q["pts"][j]], [round(v) for v in q["pts"][(j + 1) % m_]]))
                    break
            if worst is not None:
                break
        if worst is None:
            break
        if os.environ.get("AE_LOG_ROOMS"):
            xs_ = [p[0] for p in worst["pts"]]; ys_ = [p[1] for p in worst["pts"]]
            print("room withheld (crosses / uses a wall twice): bbox %d,%d %dx%d" % (min(xs_), min(ys_), max(xs_) - min(xs_), max(ys_) - min(ys_)))
        rooms[:] = [r for r in rooms if r is not worst]; dropped += 1
    m["_withheld_rooms"] = m.get("_withheld_rooms", 0) + dropped
    return rooms


def _pt_seg(p, s_, e):
    L2 = (e[0] - s_[0]) ** 2 + (e[1] - s_[1]) ** 2
    if L2 == 0:
        return math.hypot(p[0] - s_[0], p[1] - s_[1])
    t = max(0.0, min(1.0, ((p[0] - s_[0]) * (e[0] - s_[0]) + (p[1] - s_[1]) * (e[1] - s_[1])) / L2))
    return math.hypot(p[0] - s_[0] - t * (e[0] - s_[0]), p[1] - s_[1] - t * (e[1] - s_[1]))


def _move_cut(q, j, u, T, m=None):
    """Move the cut at the near end of split part j of room q to u (along the part), if that end is within the part's own
    thickness of u; the joint and the part beyond it follow.  Returns whether anything moved."""
    sides = q["sides"]; n = len(sides); sj = sides[j]; al = 1 - sj["axis"]
    for end, k_ in ((0, (j - 1) % n), (1, (j + 1) % n)):
        pt = sj["a"] if end == 0 else sj["b"]
        if abs(pt[al] - u) > sj["t"] + 2.0 or abs(pt[al] - u) < 0.5:
            continue
        jn = sides[k_]; other = sides[(k_ - 1) % n] if end == 0 else sides[(k_ + 1) % n]
        if not jn.get("joint") or not other.get("split") or other.get("axis") != sj["axis"]:
            continue
        pt[al] = u
        opt = other["b"] if end == 0 else other["a"]
        opt[al] = u
        jn["a"][al] = jn["b"][al] = u; jn["face"] = jn["coord"] = u
        for s_ in (sj, other):
            s_["lo"], s_["hi"] = sorted((s_["a"][al], s_["b"][al])); s_["L"] = s_["hi"] - s_["lo"]
        return _legal_outline(q, T, m)
    return False


def _settle_crossings(rooms, T, reach, m=None):
    """Walls of two rooms may meet only at corners.  Where a side of one room runs a little way THROUGH a wall line of
    another (its own end wall was measured on a different line than the neighbour's), its end wall is moved onto the
    neighbour's line: both rooms are looking at the same wall."""
    for _ in range(12):
        moved = False
        for r in rooms:
            n = len(r["pts"])
            for i in range(n):
                a, b = r["pts"][i], r["pts"][(i + 1) % n]
                for q in rooms:
                    if q is r or moved:
                        continue
                    m_ = len(q["pts"])
                    for j in range(m_):
                        c, d = q["pts"][j], q["pts"][(j + 1) % m_]
                        sj = q["sides"][j]
                        if "axis" not in sj or "axis" not in r["sides"][i] or sj["axis"] == r["sides"][i]["axis"] or not _proper_cross(a, b, c, d):
                            continue
                        ax = sj["axis"]                       # the crossed wall is the line  (coordinate ax) = sj.coord
                        # which end of side i sticks out beyond the crossed line, and by how much?
                        over = [(abs(p_[ax] - sj["coord"]), k_) for k_, p_ in ((0, a), (1, b))]
                        dist, end = min(over)
                        if dist > reach:
                            continue
                        nb = r["sides"][(i - 1) % n] if end == 0 else r["sides"][(i + 1) % n]
                        small = r.get("outdoor") or r["area_px"] <= q["area_px"]
                        # The crossed side is the thick part of a side split where the wall behind it changes thickness,
                        # and the change is where THIS room's wall meets it (the thick mass begins with that wall's flank):
                        # the split moves onto this wall's centre-line, so that the thin part meets it at the corner.
                        if sj.get("split") and _move_cut(q, j, r["sides"][i]["coord"], T, m):
                            moved = True
                            break
                        if nb.get("axis") == ax and small:
                            nb["coord"] = sj["coord"]; nb["t"] = sj["t"]
                            if _legal_outline(r, T, m):
                                moved = True
                            break
                    if moved:
                        break
                if moved:
                    break
            if moved:
                break
        if not moved:
            break


DIAG_WELD = os.environ.get("AE_DIAG_WELD", "1") != "0"    # two rooms looking at one slanted wall share its centre-line

def weld_slanted_sides(rooms, wallb, T, mm):
    """Two rooms looking at the SAME slanted wall from its two sides (exec's kitchen and service balcony): each would put
    the wall's centre-line half its own measured thickness out from its own face, a little apart and a little askew, and
    the two outlines would cross.  As for level / plumb walls, the centre-line is half way between the two faces - one
    line, in one direction, for every side that looks at that wall."""
    H, W = wallb.shape
    diag = [(ri, s_) for ri, r in enumerate(rooms) for s_ in r["sides"] if "axis" not in s_ and not s_.get("curve") and s_["L"] >= 1.5]
    if len(diag) < 2:
        return 0
    parent = list(range(len(diag)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    pairs = []
    for i, (ri, s_) in enumerate(diag):
        for j in range(i + 1, len(diag)):
            rj, q = diag[j]
            if rj == ri or s_["n"][0] * q["n"][0] + s_["n"][1] * q["n"][1] > -math.cos(math.radians(4.0)):
                continue
            u, n = s_["u"], s_["n"]
            d = [((p[0] - s_["a"][0]) * n[0] + (p[1] - s_["a"][1]) * n[1]) for p in (q["a"], q["b"])]
            t_ = sorted(((p[0] - s_["a"][0]) * u[0] + (p[1] - s_["a"][1]) * u[1]) for p in (q["a"], q["b"]))
            ov = min(s_["L"], t_[1]) - max(0.0, t_[0])
            dm = 0.5 * (d[0] + d[1])
            if not (1.0 < dm <= 650.0 / mm) or abs(d[0] - d[1]) > max(3.0, 0.8 * dm) or ov < 3 or ov < 0.3 * min(s_["L"], q["L"]):
                continue
            mid_t = 0.5 * (max(0.0, t_[0]) + min(s_["L"], t_[1]))
            hit = tot = 0
            for f_ in np.linspace(0.15, 0.85, 7):
                x, y = s_["a"][0] + u[0] * mid_t + n[0] * dm * f_, s_["a"][1] + u[1] * mid_t + n[1] * dm * f_
                xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < W and 0 <= yi < H:
                    tot += 1; hit += 1 if wallb[yi, xi] else 0
            if tot and hit >= 0.7 * tot:
                pairs.append((i, j, ov)); parent[find(i)] = find(j)
    groups = {}
    for i, j, ov in pairs:
        groups.setdefault(find(i), []).append((i, j, ov))
    for g_, prs in groups.items():
        members = sorted({x for i, j, _o in prs for x in (i, j)})
        ref = diag[members[0]][1]["u"]
        ux = uy = 0.0
        for x in members:
            s_ = diag[x][1]; sg = 1.0 if s_["u"][0] * ref[0] + s_["u"][1] * ref[1] >= 0 else -1.0
            ux += sg * s_["u"][0] * s_["L"]; uy += sg * s_["u"][1] * s_["L"]
        Lu = math.hypot(ux, uy); U = (ux / Lu, uy / Lu); N = (-U[1], U[0])
        face = {x: N[0] * diag[x][1]["a"][0] + N[1] * diag[x][1]["a"][1] for x in members}
        fmid = {x: 0.5 * (face[x] + N[0] * diag[x][1]["b"][0] + N[1] * diag[x][1]["b"][1]) for x in members}   # (the face at its middle)
        num = sum(ov * 0.5 * (fmid[i] + fmid[j]) for i, j, ov in prs); den = sum(ov for _i, _j, ov in prs)
        off = num / den
        t_g = sum(ov * abs(fmid[i] - fmid[j]) for i, j, ov in prs) / den      # one wall, one thickness for every room that faces it
        for x in members:
            s_ = diag[x][1]
            along = U[0] * s_["a"][0] + U[1] * s_["a"][1]
            s_["cline"] = ([N[0] * off + U[0] * along, N[1] * off + U[1] * along], U)
            s_["t"] = max(2.0, min(4.0 * T, t_g))
    return len(groups)


def _side_line(s_):
    if "cline" in s_:
        return list(s_["cline"][0]), s_["cline"][1]
    if "coord" in s_:
        p = [s_["a"][0], s_["a"][1]]; p[s_["axis"]] = s_["coord"]
    else:
        p = [s_["a"][0] + s_["n"][0] * s_["t"] / 2.0, s_["a"][1] + s_["n"][1] * s_["t"] / 2.0]
    return p, s_["u"]


def _outline_from_sides(sides):
    n = len(sides); lines = [_side_line(s_) for s_ in sides]; poly = []
    for i in range(n):
        (p1, u1), (p2, u2) = lines[i - 1], lines[i]
        den = u1[0] * u2[1] - u1[1] * u2[0]
        if abs(den) < 1e-6:
            q = [(sides[i - 1]["b"][0] + sides[i]["a"][0]) / 2.0, (sides[i - 1]["b"][1] + sides[i]["a"][1]) / 2.0]
            q = [q[0] + sides[i]["n"][0] * sides[i]["t"] / 2.0, q[1] + sides[i]["n"][1] * sides[i]["t"] / 2.0]
        else:
            k_ = ((p2[0] - p1[0]) * u2[1] - (p2[1] - p1[1]) * u2[0]) / den
            q = [p1[0] + u1[0] * k_, p1[1] + u1[1] * k_]
            # Two sides a few degrees apart meet far out along their lines, and the corner would be thrown across the
            # room.  A centre-line corner stands within a wall's thickness or two of the face corner it comes from:
            # side i then starts where its own face starts, on its own centre-line.
            c_ = sides[i]["a"]
            if abs(den) < 0.35 and math.hypot(q[0] - c_[0], q[1] - c_[1]) > 3.0 * max(sides[i - 1]["t"], sides[i]["t"]) + 3.0:
                q = list(p2)
        poly.append(q)
    return poly                                              # poly[i] is the START of side i


def _proper_cross(a, b, c, d):
    o = lambda p, q, r_: (q[0] - p[0]) * (r_[1] - p[1]) - (q[1] - p[1]) * (r_[0] - p[0])
    o1, o2, o3, o4 = o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)
    return (o1 > 1e-6) != (o2 > 1e-6) and (o3 > 1e-6) != (o4 > 1e-6) and min(abs(o1), abs(o2), abs(o3), abs(o4)) > 1e-6


def _at_jamb(m, b, T):
    """the scrap side b stands at the jamb of an opening: one end of a door / window / passage found on a level or plumb
    line lies within a wall's thickness of the scrap"""
    for g in m.get("_ops", []):
        if g["kind"] == "wall" or g.get("frame"):
            continue
        for u in (g["a"], g["b"]):
            q = (u, g["c"]) if g["o"] == "h" else (g["c"], u)
            if min(math.hypot(q[0] - b["a"][0], q[1] - b["a"][1]), math.hypot(q[0] - b["b"][0], q[1] - b["b"][1])) <= CHAMFER_JAMB * T:
                return True
    return False


def _legal_outline(r, T, m=None):
    """The app's rules for a room loop: no wall used twice, no side crossing another.  A wall stub standing in the room comes
    out of the centre-line outline as a walk out and back along one line: the stub is taken out of the loop (and kept as
    r['stubs']).  Sides turned inside out by the offset (a post narrower than its wall is thick) are taken out likewise."""
    sides = r["sides"]; r["stubs"] = []
    for _ in range(60):
        n = len(sides)
        if n < 3:
            return False
        poly = _outline_from_sides(sides)
        length = lambda i: math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1])
        drop = None
        for i in range(n):                                   # neighbours on one line
            a, b = sides[i - 1], sides[i]
            if a.get("curve") or b.get("curve") or abs(a["u"][0] * b["u"][1] - a["u"][1] * b["u"][0]) > 0.03:
                continue
            (pa, ua), (pb, _ub) = _side_line(a), _side_line(b)
            if abs((pb[0] - pa[0]) * -ua[1] + (pb[1] - pa[1]) * ua[0]) > 1.5:
                continue
            La, Lb = length((i - 1) % n), length(i)
            back = a["u"][0] * b["u"][0] + a["u"][1] * b["u"][1] < 0
            if back:
                short = (i - 1) % n if La <= Lb else i
                r["stubs"].append({"a": poly[short], "b": poly[(short + 1) % n], "t": sides[short]["t"]})
                drop = {short} if abs(La - Lb) > 1.5 else {(i - 1) % n, i}
            else:
                drop = {(i - 1) % n if La < Lb else i}
            break
        if drop is None:
            for i in range(n):                               # a side squeezed to nothing between its neighbours
                if length(i) > 1.5 or n <= 4:
                    continue
                a, b = sides[i - 1], sides[(i + 1) % n]
                par = abs(a["u"][0] * b["u"][1] - a["u"][1] * b["u"][0]) <= 0.03
                (pa, ua), (pb, _ub) = _side_line(a), _side_line(b)
                if par and abs((pb[0] - pa[0]) * -ua[1] + (pb[1] - pa[1]) * ua[0]) <= 1.5 and a["u"][0] * b["u"][0] + a["u"][1] * b["u"][1] < 0:
                    La, Lb = length((i - 1) % n), length((i + 1) % n)
                    short = (i - 1) % n if La <= Lb else (i + 1) % n
                    r["stubs"].append({"a": poly[short], "b": poly[(short + 1) % n], "t": sides[short]["t"]})
                    drop = {i, short} if abs(La - Lb) > 1.5 else {(i - 1) % n, i, (i + 1) % n}
                else:
                    drop = {i}
                break
        if drop is None and CHAMFER:
            # a chamfer: a scrap of a side across the corner between two level / plumb sides that meet at a right angle
            # (the free floor's contour cuts a corner where a door's closing box meets the wall it is hung in).  Its own
            # centre-line meets its neighbours' far out (a spike a wall thick at exec's kitchen door post) or a hair past
            # them (the neighbours then cross and one of them is thrown out): the two walls meet at their corner instead.
            for i in range(n):
                a, b, c_ = sides[i - 1], sides[i], sides[(i + 1) % n]
                if n <= 4 or b.get("curve") or b["L"] > CHAMFER_T * T or "axis" not in a or "axis" not in c_ or a["axis"] == c_["axis"]:
                    continue
                # only where it does harm: its centre-line corners thrown more than a wall's thickness from its own face
                # ends, or its two neighbours' centre-lines already crossing each other
                far = max(math.hypot(poly[i][0] - b["a"][0], poly[i][1] - b["a"][1]), math.hypot(poly[(i + 1) % n][0] - b["b"][0], poly[(i + 1) % n][1] - b["b"][1])) > CHAMFER_FAR * T
                if not (far or _proper_cross(poly[i - 1], poly[i], poly[(i + 1) % n], poly[(i + 2) % n])):
                    continue
                if m is None or not _at_jamb(m, b, T):
                    continue
                if os.environ.get("AE_LOG_CHAMFER"):
                    print("CHAMFER drop side %d L %.1f far %s corners %s face %s" % (i, b["L"], far, [(round(poly[i][0]), round(poly[i][1])), (round(poly[(i + 1) % n][0]), round(poly[(i + 1) % n][1]))], [(round(b["a"][0]), round(b["a"][1])), (round(b["b"][0]), round(b["b"][1]))]))
                m["_chamfers"] = m.get("_chamfers", 0) + 1
                drop = {i}
                break
        if drop is None:
            # a scrap of a side at the end of a slanted wall two rooms share (the corner of the face, cut off at an acute
            # angle): the two rooms must turn that corner at the same point, where the neighbouring lines cross
            for i in range(n):
                a, b = sides[i - 1], sides[(i + 1) % n]
                if length(i) > 0.6 * T or n <= 4 or ("cline" not in a and "cline" not in b):
                    continue
                (pa, ua), (pb, ub) = _side_line(a), _side_line(b)
                den = ua[0] * ub[1] - ua[1] * ub[0]
                if abs(den) < 0.2:
                    continue
                k_ = ((pb[0] - pa[0]) * ub[1] - (pb[1] - pa[1]) * ub[0]) / den
                q = (pa[0] + ua[0] * k_, pa[1] + ua[1] * k_)
                if math.hypot(q[0] - poly[i][0], q[1] - poly[i][1]) <= 1.5 * T:
                    drop = {i}
                    break
        if drop is None:
            bad = set()
            for i in range(n):
                for j in range(i + 2, n):
                    if i == 0 and j == n - 1:
                        continue
                    if _proper_cross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]):
                        bad.update((i, j))
            if not bad:
                inverted = [i for i in range(n) if length(i) > 0.5 and
                            (poly[(i + 1) % n][0] - poly[i][0]) * sides[i]["u"][0] + (poly[(i + 1) % n][1] - poly[i][1]) * sides[i]["u"][1] < 0]
                if not inverted:
                    r["pts"] = poly
                    return True
                bad = set(inverted)
            drop = {min(bad, key=length)}
        r["sides"] = sides = [s_ for j, s_ in enumerate(sides) if j not in drop]
    return False


def attach_openings(m, rooms, openings):
    """cut every room side where a door / window / passage lies on it; one side = one kind"""
    T = float(m["wall_thickness_px"])
    def hosts_on(s_, a, b):
        o = "v" if s_["axis"] == 0 else "h"; al = 1 if o == "v" else 0
        lo, hi = sorted((a[al], b[al]))
        for g in openings:
            if g["kind"] == "wall" or g.get("frame") or g["o"] != o or abs(g["c"] - s_["coord"]) > max(T, 0.5 * s_["t"] + 0.5 * T):
                continue
            if min(hi, g["b"]) - max(lo, g["a"]) >= 0.6 * (g["b"] - g["a"]):
                yield g, lo, hi
    # An opening between two rooms is cut into BOTH their sides.  Where the two sides end at different places (one room's
    # corner a few pixels short of the other's, a balcony narrower than the living-room wall it opens off), each room
    # would cut its own stretch and the app would get two openings - two walls, two doors - for one.  Both take the stretch
    # the two sides have in common.
    span = {}; mid_line = {}
    if SHARED_SPAN:
        seen_h = {}
        for r in rooms:
            n = len(r["pts"])
            for i in range(n):
                s_ = r["sides"][i]
                if "axis" not in s_:
                    continue
                pa = r["pts"][i]; perp_ = pa[0] if s_["axis"] == 0 else pa[1]
                for g, lo, hi in hosts_on(s_, r["pts"][i], r["pts"][(i + 1) % n]):
                    seen_h.setdefault(id(g), (g, []))[1].append((lo, hi, perp_, id(r)))
        for g, hs in seen_h.values():
            if len(hs) >= 2:
                A = max([g["a"]] + [h[0] for h in hs]); B = min([g["b"]] + [h[1] for h in hs])
                if B - A >= 0.6 * (g["b"] - g["a"]):
                    span[id(g)] = (A, B)
                # The two rooms' sides a wall's width apart instead of on one centre line (a door between two walls that do
                # not line up, a jamb notch taken for the face): each room would cut its own copy of the opening, and the
                # app would build two walls with two doors in them.  The opening is put on the line half way between, and
                # each room reaches it with a short stub of wall at either jamb.
                perps = sorted({round(h[2], 2) for h in hs})
                if MEET_AT_OPENING and len(hs) == 2 and hs[0][3] != hs[1][3] and 2.0 <= perps[-1] - perps[0] <= 1.6 * T and id(g) in span:
                    mid_line[id(g)] = 0.5 * (perps[0] + perps[-1])
    for r in rooms:
        n = len(r["pts"]); pts, meta = [], []
        for i in range(n):
            a, b = r["pts"][i], r["pts"][(i + 1) % n]; s_ = r["sides"][i]
            cuts = []
            if "axis" in s_:
                o = "v" if s_["axis"] == 0 else "h"; al = 1 if o == "v" else 0
                lo, hi = sorted((a[al], b[al]))
                for g in openings:
                    if g["kind"] == "wall" or g.get("frame") or g["o"] != o or abs(g["c"] - s_["coord"]) > max(T, 0.5 * s_["t"] + 0.5 * T):
                        continue
                    ov = min(hi, g["b"]) - max(lo, g["a"])
                    if ov >= 0.6 * (g["b"] - g["a"]):
                        A, B = span.get(id(g), (g["a"], g["b"]))
                        cuts.append((max(lo, A), min(hi, B), g))
            elif any(g.get("frame") for g in openings):
                # a slanted side: the openings found along slanted walls, cut where their span projects onto it
                L_ = math.hypot(b[0] - a[0], b[1] - a[1])
                if L_ > 1e-6:
                    u = ((b[0] - a[0]) / L_, (b[1] - a[1]) / L_); nn = (-u[1], u[0])
                    dcuts = []
                    for g in openings:
                        if g["kind"] == "wall" or not g.get("frame"):
                            continue
                        q0, q1 = gap_pts(g)
                        d0 = (q0[0] - a[0]) * nn[0] + (q0[1] - a[1]) * nn[1]; d1 = (q1[0] - a[0]) * nn[0] + (q1[1] - a[1]) * nn[1]
                        if max(abs(d0), abs(d1)) > max(T, 0.5 * s_["t"] + 0.5 * T):
                            continue
                        t0, t1 = sorted(((q0[0] - a[0]) * u[0] + (q0[1] - a[1]) * u[1], (q1[0] - a[0]) * u[0] + (q1[1] - a[1]) * u[1]))
                        if min(L_, t1) - max(0.0, t0) >= 0.6 * (t1 - t0):
                            dcuts.append((max(0.0, t0), min(L_, t1), g))
                    if dcuts:
                        dcuts.sort(key=lambda c_: c_[0]); cur_t = 0.0
                        for t0, t1, g in dcuts:
                            if t0 - cur_t > 1.0:
                                pts.append([a[0] + u[0] * cur_t, a[1] + u[1] * cur_t]); meta.append({"kind": "wall", "t": s_["t"], "opening": None})
                            pts.append([a[0] + u[0] * t0, a[1] + u[1] * t0]); meta.append({"kind": g["kind"], "t": g.get("t", s_["t"]), "opening": g})
                            cur_t = t1
                        if L_ - cur_t > 1.0:
                            pts.append([a[0] + u[0] * cur_t, a[1] + u[1] * cur_t]); meta.append({"kind": "wall", "t": s_["t"], "opening": None})
                        continue
            cuts.sort(key=lambda c_: c_[0])
            if not cuts:
                pts.append(a); meta.append({"kind": "wall", "t": s_["t"], "opening": None}); continue
            al = 1 if s_["axis"] == 0 else 0; fwd = b[al] >= a[al]
            seq = cuts if fwd else cuts[::-1]
            cur = a
            for c0, c1, g in seq:
                u0, u1 = (c0, c1) if fwd else (c1, c0)
                p0 = list(a); p0[al] = u0; p1 = list(a); p1[al] = u1
                if abs(p0[al] - cur[al]) > 1.0:
                    pts.append(cur); meta.append({"kind": "wall", "t": s_["t"], "opening": None})
                ml = mid_line.get(id(g))
                if ml is not None and abs(p0[1 - al] - ml) > 0.25:
                    q0 = list(p0); q0[1 - al] = ml; q1 = list(p1); q1[1 - al] = ml
                    pts.append(p0); meta.append({"kind": "wall", "t": s_["t"], "opening": None})               # stub to the shared line
                    pts.append(q0); meta.append({"kind": g["kind"], "t": g.get("t", s_["t"]), "opening": g})
                    pts.append(q1); meta.append({"kind": "wall", "t": s_["t"], "opening": None})               # and back
                    cur = p1
                    continue
                pts.append(p0); meta.append({"kind": g["kind"], "t": g.get("t", s_["t"]), "opening": g})
                cur = p1
            if abs(b[al] - cur[al]) > 1.0:
                pts.append(cur); meta.append({"kind": "wall", "t": s_["t"], "opening": None})
        r["pts"], r["meta"] = pts, meta
    return rooms


# ----------------------------------------------------------------------------------------------- labels

def is_number(s):
    s_ = s.replace(" ", "")
    return bool(s_) and sum(ch.isdigit() for ch in s_) >= 0.6 * len(s_)


def room_type(label):
    u = label.upper()
    for typ, keys in ROOM_TYPES:
        if any(k_ in u for k_ in keys):
            return typ
    return "other"


def room_labels(m, k=None):
    """Room names as the app wants them: the lines of one name joined ('MAIN' over 'BEDROOM', 'BATH/' over 'W.C. 1').
    Works for lettering that reads upwards or downwards as well (a plan drawn turned on its sheet)."""
    dim_text = {(round(d["tc"][0]), round(d["tc"][1])) for d in m.get("dim_spans", []) if d.get("tc")}
    words = []
    for t in m["texts"]:
        s = (t.get("s") or "").strip()
        if not s or is_number(s) or t.get("title") or t.get("angle") is not None:
            continue
        x, y, w, h = t["box"]
        if (round(x + w / 2), round(y + h / 2)) in dim_text:
            continue
        if t.get("ink"):                                     # the lettering itself, not the search box it was read in
            x, y, w, h = t["ink"][0], t["ink"][1], t["ink"][2] - t["ink"][0], t["ink"][3] - t["ink"][1]
        u = s.upper()
        if any(n in u.split() or n == u for n in NOT_ROOM) or ":" in u or "'" in u:
            continue
        if sum(ch.isalpha() for ch in u) < 2:
            continue
        way = t.get("vertical") or "across"
        # 'stack' runs from one line of a name to the next, 'along' is the reading direction
        if way == "across":
            along, stack = (x, x + w), (y, y + h)
        elif way == "up":
            along, stack = (y, y + h), (x, x + w)
        else:
            along, stack = (y, y + h), (-(x + w), -x)
        words.append({"s": s, "x0": x, "y0": y, "x1": x + w, "y1": y + h, "conf": float(t.get("conf") or 60), "cap": float(t.get("cap_px") or min(w, h)),
                      "way": way, "along": along, "stack": stack})
    words.sort(key=lambda w_: (w_["way"], w_["stack"][0], w_["along"][0]))
    used, labels = set(), []
    for i, w_ in enumerate(words):
        if i in used:
            continue
        grp = [w_]; used.add(i)
        grew = True
        while grew:
            grew = False
            for j, v in enumerate(words):
                if j in used or v["way"] != w_["way"]:
                    continue
                last = grp[-1]
                gap = v["stack"][0] - last["stack"][1]
                over = min(v["along"][1], last["along"][1]) - max(v["along"][0], last["along"][0])
                if k is not None:                           # two lines of one name never have a wall between them
                    xa, ya = int((v["x0"] + v["x1"] + last["x0"] + last["x1"]) / 4), int((v["y0"] + v["y1"] + last["y0"] + last["y1"]) / 4)
                    x0_, x1_ = sorted((int((v["x0"] + v["x1"]) / 2), int((last["x0"] + last["x1"]) / 2))); y0_, y1_ = sorted((int((v["y0"] + v["y1"]) / 2), int((last["y0"] + last["y1"]) / 2)))
                    if w_["way"] == "across":
                        blocked = k[max(0, y0_):y1_ + 1, min(max(xa, 0), k.shape[1] - 1)].any()
                    else:
                        blocked = k[min(max(ya, 0), k.shape[0] - 1), max(0, x0_):x1_ + 1].any()
                    if blocked:
                        continue
                if -0.6 * last["cap"] <= gap <= 1.3 * last["cap"] and v["stack"][0] > last["stack"][0] + 0.5 * last["cap"] and \
                        over >= 0.3 * min(v["along"][1] - v["along"][0], last["along"][1] - last["along"][0]) and 0.7 <= v["cap"] / last["cap"] <= 1.4:
                    grp.append(v); used.add(j); grew = True
        text = " ".join(g["s"] for g in grp).replace("/ ", "/").strip()
        known = room_type(text) != "other" or any(k_ in text.upper() for k_ in ROOM_WORDS)
        labels.append({"label": text, "roomType": room_type(text), "box": [min(g["x0"] for g in grp), min(g["y0"] for g in grp), max(g["x1"] for g in grp), max(g["y1"] for g in grp)],
                       "confidence": round(min(0.97, (np.mean([g["conf"] for g in grp]) / 100.0) * (1.0 if known else 0.6)), 3), "known": known, "reads": w_["way"]})
    return labels


def point_in_poly(p, poly):
    x, y = p; inside = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


# ----------------------------------------------------------------------------------------------- assemble

def area_check(m, rooms_out):
    """The floor area printed on the page against the rooms found: at the right scale they agree to within the walls and
    the parts a brochure leaves out (ledges are non-strata).  A check for the reviewer, never a scale."""
    st = m.get("stated_area")
    if not st:
        return None
    named = [r_ for r_ in rooms_out if r_.get("areaM2")]
    if not named:
        return {"statedM2": st["m2"], "statedText": st["text"], "roomsM2": None, "verdict": "no scaled rooms"}
    strata = sum(r_["areaM2"] for r_ in named if not any(w_ in (r_.get("label") or "").upper() for w_ in ("LEDGE", "AC ", "A/C", "PLANTER", "VOID")))
    # rooms are measured wall face to wall face; the strata area includes the walls: allow for them
    ratio = strata / st["m2"] if st["m2"] else None
    verdict = "agrees" if ratio is not None and 0.75 <= ratio <= 1.05 else ("rooms too small: some are missing or the scale is off" if ratio is not None and ratio < 0.75 else "rooms too large for the stated area")
    return {"statedM2": st["m2"], "statedText": st["text"], "roomsM2": round(strata, 1), "ratio": round(ratio, 3) if ratio is not None else None, "verdict": verdict}


def scale_estimate(m, edges, mm_per_source_px):
    """What an estimated scale rests on, for the reviewer: the assumed door-leaf width and the door openings it can be
    checked or confirmed against (jamb to jamb, in source pixels, with the width each would have at the estimate)."""
    src = m.get("scale_source") or {}
    seen = set(); doors = []
    for e in edges:
        op = e.get("opening")
        if not op or op["kind"] != "door" or op.get("operation") != "swing" or op.get("confidence", 0) < 0.75:
            continue
        (x0, y0), (x1, y1) = e["sourcePx"]
        key = (round((x0 + x1) / 16), round((y0 + y1) / 16))
        if key in seen:
            continue
        seen.add(key)
        doors.append({"openingId": e["id"], "sourcePx": e["sourcePx"], "widthPx": round(math.hypot(x1 - x0, y1 - y0), 2),
                      "widthMmAtEstimate": int(round(math.hypot(x1 - x0, y1 - y0) * mm_per_source_px / 10.0) * 10)})
    doors.sort(key=lambda d: -d["widthPx"])
    return {"method": str(src.get("from") or "door leaves"), "assumedLeafMm": float(src.get("assumed_leaf_mm") or 850.0),
            "swingsMeasured": int(src.get("swings") or 0), "doorOpenings": doors[:8]}


# ----------------------------------------------------------------------------------------------- slanted walls (round 15)

SLANT_MIN_DEG = 5.0                                           # a stroke or wall this far off level / plumb is slanted
DIAG_WALLS = os.environ.get("AE_DIAG_WALLS", "1") != "0"      # slanted grey bands and slanted stroke pairs are wall mass
SLOPED_RAILS = os.environ.get("AE_SLOPED_RAILS", "1") != "0"  # long sloped strokes close outdoor spaces, as level / plumb ones do
SLOPED_MIN_MM = float(os.environ.get("AE_SLOPED_MIN", 150))     # the shortest sloped stroke read from the work image
PAIR_OVERLAP_MM = float(os.environ.get("AE_PAIR_OVERLAP", 150))   # two strokes of a thin slanted wall run side by side this far


def _off_axis(ang):
    a = ang % 90.0
    return min(a, 90.0 - a)


# ----------------------------------------------------------------------------------------------- curved walls (round 15b)
# Stage 1 hands over a long, large-radius curve that is no door swing (a curved balcony parapet, a bay) as an entry of
# `arcs` with from = "curve": centre, radius, start angle and span, one per drawn line (a double-line parapet is two).

CURVED_RAILS = os.environ.get("AE_CURVED_RAILS", "1") != "0"   # curves close outdoor spaces, as level / plumb / sloped strokes do
CURVE_NOSWING = os.environ.get("AE_CURVE_NOSWING", "1") != "0"  # a curve is never the swing of a door
CURVE_SIDES = os.environ.get("AE_CURVE_SIDES", "1") != "0"      # a room side that follows a curve stays a chain of short lines
CURVE_REFIT = os.environ.get("AE_CURVE_REFIT", "1") != "0"      # ... and the chain is laid on the fitted circle at an even step
CURVE_MIN_MM = float(os.environ.get("AE_CURVE_MIN", 1000))      # the shortest curve that closes a space
CURVE_STEP_DEG = float(os.environ.get("AE_CURVE_STEP", 4.0))    # the chain's step, in degrees of arc (4: sin > 0.03, the "one line" test)


def curve_arcs(m):
    """the curves stage 1 traced, long enough to close a space with"""
    mm = pseudo_scale(m)
    return [a_ for a_ in m.get("arcs", []) if a_.get("from") == "curve" and math.radians(a_["span"]) * a_["r"] * mm >= CURVE_MIN_MM]


def curve_polyline(a_, step_deg=1.0, r=None):
    """points along an arc, start to end, at most step_deg apart (the ends exact)"""
    r = a_["r"] if r is None else r
    n = max(1, int(math.ceil(a_["span"] / step_deg)))
    return [(a_["cx"] + r * math.cos(math.radians(a_["start"] + a_["span"] * i / n)), a_["cy"] + r * math.sin(math.radians(a_["start"] + a_["span"] * i / n))) for i in range(n + 1)]


def _on_curve(p, a_, tol):
    """p lies on the arc a_: at its radius (within tol) and inside its sweep (a little over the ends)"""
    d = math.hypot(p[0] - a_["cx"], p[1] - a_["cy"])
    if abs(d - a_["r"]) > tol:
        return False
    ang = (math.degrees(math.atan2(p[1] - a_["cy"], p[0] - a_["cx"])) - a_["start"]) % 360.0
    slack = math.degrees(tol / max(1.0, a_["r"]))
    return ang <= a_["span"] + slack or ang >= 360.0 - slack


PANEL_PARTITION = os.environ.get("AE_PANEL_PARTITION", "1") != "0"   # two staggered panel outlines joined into a partition by stage 1: a sliding door onto a balcony


def panel_partitions(m, k):
    """Stage 1 rebuilds thin walls drawn as two parallel lines as partition rectangles (partition_network), and joins
    rectangles that lie in one line.  The two panels of a sliding door onto a balcony are drawn as exactly that: two thin
    rectangles end to end in the wall's line, staggered, so a closing stroke stands inside the run and one outline runs
    on past the other's end to the jamb.  Such a partition is read again as a sliding door from wall to wall; whether it
    really leads onto an outdoor space is decided once the rooms are known (else it stays the wall it was)."""
    out = []
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = k.shape
    plines = [l for l in m["lines"] if l.get("role") == "partition"]
    for p in m.get("partitions", []):
        o = o_ = p["o"]; c0, c1, a, b = p["c0"], p["c1"], p["a"], p["b"]; L = b - a
        if p.get("fill") or (c1 - c0) * mm > 100 or L * mm < 1200:
            continue
        po = "v" if o == "h" else "h"
        # a stroke across the rectangle well inside its run (where one panel ends and the next begins), no longer than the rectangle is thick
        inner = [l for l in m["lines"] if l["o"] == po and a + 0.15 * L <= l["c"] <= b - 0.15 * L and l["a"] <= c0 + 2.5 and l["b"] >= c1 - 2.5 and (l["b"] - l["a"]) <= (c1 - c0) + 6]
        if not inner:
            continue
        # one of the two long outlines runs on past the rectangle's end by a panel's overlap or more
        longs = [l for l in plines if l["o"] == o and c0 - 1.5 <= l["c"] <= c1 + 1.5 and min(l["b"], b) - max(l["a"], a) >= 0.8 * L]
        if max([max(0.0, l["b"] - b, a - l["a"]) for l in longs] or [0.0]) * mm < 300:
            continue
        A, B = min([a] + [l["a"] for l in longs]), max([b] + [l["b"] for l in longs])
        # from wall to wall: the run must stop at wall mass at both ends, close by
        c = (c0 + c1) / 2.0
        img = (k > 0) if o == "h" else (k > 0).T
        row = img[int(round(c))]
        def mass_at(x, step):
            x = int(round(x))
            for d_ in range(0, int(1.5 * T)):
                xx = x + step * d_
                if not (0 <= xx < len(row)):
                    return None
                if row[xx]:
                    return xx
            return None
        ea, eb = mass_at(A - 1, -1), mass_at(B + 1, 1)
        if ea is None or eb is None:
            continue
        A, B = float(ea + 1), float(eb)
        out.append({"o": o, "c": c, "a": A, "b": B, "lo": float(c0), "hi": float(c1), "lo_thin": float(c0), "hi_thin": float(c1), "c_lo": c, "c_hi": c, "jamb": [0, 0],
                    "kind": "door", "operation": "sliding", "hinge": "none", "swing_side": 0, "panels": True, "confidence": 0.55, "from_partition": True,
                    "why": "two staggered panel outlines that stage 1 joined into a partition: the sliding door onto a balcony"})
    return out


def side_on_curve(a, b, curves, tol):
    """the curve a side from a to b lies on (both ends and the middle), or None"""
    mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    for a_ in curves:
        if _on_curve(a, a_, tol) and _on_curve(b, a_, tol) and _on_curve(mid, a_, tol):
            return a_
    return None


def sloped_strokes(m, gray, k=None):
    """Straight strokes at an angle that stage 1 left out of its model: it keeps level and plumb lines, and as `diagonals`
    only some of the rest (a gentle slope - p02's balcony parapet - and one face of a thin 45-degree partition are in
    neither).  Found on the work image: the ink that is not lettering, not in level or plumb runs and not wall mass,
    read as straight segments.  [{p, q, u, ang, len, w}] in working pixels, at least 250 mm long."""
    if "_sloped" in m:
        return m["_sloped"]
    out = []
    m["_sloped"] = out
    if gray is None or gray.shape[:2] != (m["size"][1], m["size"][0]):
        return out
    mm = pseudo_scale(m); H, W = gray.shape
    ink = (gray < min(235, int(m.get("ink_threshold", 180)) + 20)).astype(np.uint8)
    for t in m["texts"] + m.get("unread_text", []):
        x, y, w, h = [int(v) for v in t["box"]]
        ink[max(0, y - 2):y + h + 3, max(0, x - 2):x + w + 3] = 0
    L0 = max(5, int(round(300.0 / mm)))
    axis_ = cv2.bitwise_or(cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, L0), np.uint8)), cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((L0, 1), np.uint8)))
    sl = ink & (1 - axis_)
    if k is not None:
        sl[k > 0] = 0
    min_len = SLOPED_MIN_MM / mm
    from skimage.morphology import skeletonize             # (in the vectorizer's own requirements; only needed here)
    sk = skeletonize(sl > 0).astype(np.uint8)              # a stroke's centre line: two strokes a few pixels apart stay two
    # the skeleton taken apart at its junctions: each branch between two junctions (or a junction and an end) is read as
    # a straight segment when it is one, and segments on one line across a junction (a stroke crossing another) are one
    nb = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - sk
    junc = ((sk > 0) & (nb >= 3)).astype(np.uint8)
    br = sk & (1 - cv2.dilate(junc, np.ones((3, 3), np.uint8)))
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(br, connectivity=8)
    raw = []
    for i in range(1, n_):
        x, y, w, h, area = st_[i]
        if area < 5:
            continue
        ys, xs = np.nonzero(lab_[y:y + h, x:x + w] == i)
        xs = xs.astype(np.float64) + x; ys = ys.astype(np.float64) + y
        mx, my = xs.mean(), ys.mean()
        cov = np.cov(np.stack([xs - mx, ys - my]))
        ev, evec = np.linalg.eigh(cov)
        u = (float(evec[0, 1]), float(evec[1, 1]))
        t = (xs - mx) * u[0] + (ys - my) * u[1]
        d = np.abs(-(xs - mx) * u[1] + (ys - my) * u[0])
        tol = max(1.5, 0.004 * float(t.max() - t.min()))       # (a long stroke may bow by a pixel or two)
        n0 = len(xs)
        for _it in range(3):                                   # a spur or a jog at one end: read the line from the rest
            inl = d <= tol
            if inl.all() or inl.sum() < 5:
                break
            xs, ys = xs[inl], ys[inl]
            mx, my = xs.mean(), ys.mean()
            ev, evec = np.linalg.eigh(np.cov(np.stack([xs - mx, ys - my])))
            u = (float(evec[0, 1]), float(evec[1, 1]))
            t = (xs - mx) * u[0] + (ys - my) * u[1]
            d = np.abs(-(xs - mx) * u[1] + (ys - my) * u[0])
        if (d <= tol).sum() < 0.6 * n0:
            continue                                           # an arc, a letter, a knot of strokes
        ang = math.degrees(math.atan2(u[1], u[0])) % 180.0
        if _off_axis(ang) < SLANT_MIN_DEG:
            continue
        # the junction taken out of the skeleton took a few pixels off each end: the stroke runs on as long as its ink does
        e0, e1 = float(t.min()), float(t.max())
        for sgn in (-1, 1):
            for step in range(1, 5):
                tt = (e0 if sgn < 0 else e1) + sgn * 1.0
                xx, yy = int(round(mx + u[0] * tt)), int(round(my + u[1] * tt))
                if not (0 <= xx < W and 0 <= yy < H) or not sl[yy, xx]:
                    break
                if sgn < 0:
                    e0 = tt
                else:
                    e1 = tt
        raw.append([mx + u[0] * e0, my + u[1] * e0, mx + u[0] * e1, my + u[1] * e1, ang])
    groups = []
    for s_ in sorted(raw, key=lambda r: -math.hypot(r[2] - r[0], r[3] - r[1])):
        x0, y0, x1, y1, ang = s_
        hit = None
        for g_ in groups:
            d_ang = abs(ang - g_["ang"]); d_ang = min(d_ang, 180.0 - d_ang)
            if d_ang > 2.0:
                continue
            u, n = g_["u"], (-g_["u"][1], g_["u"][0])
            off = [abs((px - g_["p"][0]) * n[0] + (py - g_["p"][1]) * n[1]) for px, py in ((x0, y0), (x1, y1))]
            t_ = sorted(((px - g_["p"][0]) * u[0] + (py - g_["p"][1]) * u[1] for px, py in ((x0, y0), (x1, y1))))
            if max(off) <= 2.0 and t_[0] <= g_["t1"] + 6 and t_[1] >= g_["t0"] - 6:
                hit = g_; break
        if hit is None:
            L = max(1e-6, math.hypot(x1 - x0, y1 - y0)); u = ((x1 - x0) / L, (y1 - y0) / L)
            groups.append({"p": (x0, y0), "u": u, "ang": ang, "t0": 0.0, "t1": L})
        else:
            u = hit["u"]
            t_ = [(px - hit["p"][0]) * u[0] + (py - hit["p"][1]) * u[1] for px, py in ((x0, y0), (x1, y1))]
            hit["t0"], hit["t1"] = min(hit["t0"], *t_), max(hit["t1"], *t_)
    for g_ in groups:
        L = g_["t1"] - g_["t0"]
        if L < min_len:
            continue
        u = g_["u"]; n = (-u[1], u[0])
        p = (g_["p"][0] + u[0] * g_["t0"], g_["p"][1] + u[1] * g_["t0"]); q = (g_["p"][0] + u[0] * g_["t1"], g_["p"][1] + u[1] * g_["t1"])
        # the stroke's width across it, and how much of its length is inked
        ws_, inked = [], 0
        for f_ in np.linspace(0.05, 0.95, 19):
            cx, cy = p[0] + (q[0] - p[0]) * f_, p[1] + (q[1] - p[1]) * f_
            run = [s2 for s2 in range(-12, 13) if 0 <= int(round(cx + n[0] * s2)) < W and 0 <= int(round(cy + n[1] * s2)) < H and ink[int(round(cy + n[1] * s2)), int(round(cx + n[0] * s2))]]
            near = [s2 for s2 in run if abs(s2) <= 2]
            if near:
                inked += 1
                lo_ = hi_ = near[0]
                while lo_ - 1 in run:
                    lo_ -= 1
                while hi_ + 1 in run:
                    hi_ += 1
                ws_.append(hi_ - lo_ + 1)
        if inked < 0.8 * 19:
            continue
        out.append({"p": p, "q": q, "u": u, "ang": g_["ang"], "len": L, "w": float(np.median(ws_)) if ws_ else 1.0})
    return out


def _seg_pairs(segs, mm, lo_mm=40.0, hi_mm=420.0, ov_mm=None):
    """two strokes parallel within 3 degrees, lo..hi mm apart (centre to centre), overlapping along their direction by
    ov_mm or more: (i, j, distance px, overlap interval along the first one's direction)"""
    out = []
    ov_mm = PAIR_OVERLAP_MM if ov_mm is None else ov_mm
    for i, a in enumerate(segs):
        u = a["u"]; n = (-u[1], u[0])
        for j in range(i + 1, len(segs)):
            b = segs[j]
            d_ang = abs(a["ang"] - b["ang"]); d_ang = min(d_ang, 180.0 - d_ang)
            if d_ang > max(3.0, math.degrees(math.atan2(5.0, min(a["len"], b["len"])))):   # (a short stroke's angle is read to a pixel or two at each end)
                continue
            dist = abs(((b["p"][0] - a["p"][0]) * n[0] + (b["p"][1] - a["p"][1]) * n[1] + (b["q"][0] - a["q"][0]) * n[0] + (b["q"][1] - a["q"][1]) * n[1]) / 2.0)
            t_ = sorted(((b["p"][0] - a["p"][0]) * u[0] + (b["p"][1] - a["p"][1]) * u[1], (b["q"][0] - a["p"][0]) * u[0] + (b["q"][1] - a["p"][1]) * u[1]))
            t0, t1 = max(0.0, t_[0]), min(a["len"], t_[1])
            if lo_mm <= dist * mm <= hi_mm and (t1 - t0) * mm >= ov_mm:
                out.append((i, j, dist, t0, t1))
    return out


def slanted_thin_walls(m, gray, k):
    """Thin walls at an angle, which stage 1 leaves out of its wall mass: (1) its grey bands that are not level or plumb
    (a lightweight wall or window band drawn as two faces with a grey fill - stage 1 makes the level / plumb ones walls and
    sets the 45-degree ones aside), and (2) two parallel sloped strokes 40 - 420 mm apart with paper between them, whose
    band reaches wall mass at BOTH ends (exec's kitchen walls; a wardrobe's hanger strokes or a door leaf stand free at
    one end at least).  Each piece runs on to the wall mass its end stops a few pixels short of, as a window band does.
    Returns the wall mass with them added; the pieces are kept in m['_slant_pieces'] (centre, unit, half length, half width)."""
    m["_slant_pieces"] = []
    if not DIAG_WALLS:
        return k
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = k.shape
    base = k > 0
    reach = 0.6 * T + 2
    pieces = []                                              # (centre, u, half length, half width, needs mass at both ends)
    for g_ in m.get("grey_solids", []):
        P_ = g_["pts"]
        if any(min(abs(P_[i][0] - P_[i - 1][0]), abs(P_[i][1] - P_[i - 1][1])) > 0.5 for i in range(len(P_))):
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.array(P_, np.float32))
            th = math.radians(ang if rw >= rh else ang + 90.0)
            if _off_axis(math.degrees(th) % 180.0) >= SLANT_MIN_DEG:
                pieces.append(((cx, cy), (math.cos(th), math.sin(th)), max(rw, rh) / 2.0, min(rw, rh) / 2.0, False))
    segs = []
    for d_ in m.get("diagonals", []):
        for a_, b_ in zip(d_, d_[1:]):
            L = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
            if L * mm < SLOPED_MIN_MM:
                continue
            ang = math.degrees(math.atan2(b_[1] - a_[1], b_[0] - a_[0])) % 180.0
            if _off_axis(ang) >= SLANT_MIN_DEG:
                segs.append({"p": tuple(a_), "q": tuple(b_), "u": ((b_[0] - a_[0]) / L, (b_[1] - a_[1]) / L), "ang": ang, "len": L, "w": 1.0})
    segs += [s_ for s_ in sloped_strokes(m, gray, k) if s_["w"] * mm <= 60]
    thr = min(235, int(m.get("ink_threshold", 180)) + 20)
    for i, j, dist, t0, t1 in _seg_pairs(segs, mm):
        a, b = segs[i], segs[j]; u = a["u"]; n = (-u[1], u[0])
        side = 1.0 if ((b["p"][0] - a["p"][0]) * n[0] + (b["p"][1] - a["p"][1]) * n[1] + (b["q"][0] - a["q"][0]) * n[0] + (b["q"][1] - a["q"][1]) * n[1]) > 0 else -1.0
        P0 = (a["p"][0] + u[0] * t0, a["p"][1] + u[1] * t0); P1 = (a["p"][0] + u[0] * t1, a["p"][1] + u[1] * t1)
        off = (n[0] * side * dist, n[1] * side * dist)
        # paper between the two strokes (a band of hatching or a dimension line beside a stroke has ink there)
        mid = [(P0[0] + (P1[0] - P0[0]) * f_ + 0.5 * off[0], P0[1] + (P1[1] - P0[1]) * f_ + 0.5 * off[1]) for f_ in np.linspace(0.1, 0.9, 17)]
        if gray is not None and dist >= 4:
            dark = sum(1 for x, y in mid if 0 <= int(round(x)) < W and 0 <= int(round(y)) < H and gray[int(round(y)), int(round(x))] < thr)
            if dark > 0.35 * len(mid):
                continue
        # and no third stroke of that direction between them or close beside them: the hanger strokes of a wardrobe, the
        # treads of a stair, hatching are rows of parallel strokes; a wall is two (stage 1's own test for level / plumb pairs)
        crowded = False
        for j2, c2 in enumerate(segs):
            if j2 in (i, j) or c2 is a or c2 is b:
                continue
            d_ang = abs(c2["ang"] - a["ang"]); d_ang = min(d_ang, 180.0 - d_ang)
            if d_ang > max(3.0, math.degrees(math.atan2(5.0, min(a["len"], c2["len"])))):
                continue
            dc = side * ((c2["p"][0] - a["p"][0]) * n[0] + (c2["p"][1] - a["p"][1]) * n[1] + (c2["q"][0] - a["p"][0]) * n[0] + (c2["q"][1] - a["p"][1]) * n[1]) / 2.0
            if not (-0.8 * dist < dc < 1.8 * dist) or abs(dc) <= 2.0 or abs(dc - dist) <= 2.0:
                continue                                      # (the same stroke found twice - in both lists - is no third one)
            tc = sorted(((c2["p"][0] - a["p"][0]) * u[0] + (c2["p"][1] - a["p"][1]) * u[1], (c2["q"][0] - a["p"][0]) * u[0] + (c2["q"][1] - a["p"][1]) * u[1]))
            if min(t1, tc[1]) - max(t0, tc[0]) >= 0.5 * (t1 - t0):
                crowded = True; break
        if crowded:
            continue
        c_ = ((P0[0] + P1[0]) / 2.0 + 0.5 * off[0], (P0[1] + P1[1]) / 2.0 + 0.5 * off[1])
        pieces.append((c_, u, (t1 - t0) / 2.0, dist / 2.0 + 1.0, True))
    def run_on(c_, u, hl, hw, sgn):
        """how far past its end (0 .. reach) the piece runs before it meets wall mass, or None"""
        n = (-u[1], u[0])
        for s2 in np.arange(0.0, reach + 0.1, 1.0):
            e = (c_[0] + sgn * u[0] * (hl + s2), c_[1] + sgn * u[1] * (hl + s2))
            hit = 0; tot = 0
            for f_ in np.linspace(-0.8, 0.8, 5):
                xx, yy = int(round(e[0] + n[0] * hw * f_)), int(round(e[1] + n[1] * hw * f_))
                if 0 <= xx < W and 0 <= yy < H:
                    tot += 1; hit += 1 if base[yy, xx] else 0
            if tot and hit >= 1:
                return s2
        return None
    added = 0; k = k.copy()
    # stage 1's own grey bands first, then the stroke pairs, as long as one more reaches wall mass at both ends (a pair
    # can end on a grey band, or on another pair)
    todo = sorted(pieces, key=lambda p_: p_[4])
    changed = True
    while changed and todo:
        changed = False
        for pc in list(todo):
            c_, u, hl, hw, both = pc
            e0, e1 = run_on(c_, u, hl, hw, -1), run_on(c_, u, hl, hw, 1)
            if both and (e0 is None or e1 is None):
                continue
            a0, a1 = hl + (e0 or 0.0) + 1.0, hl + (e1 or 0.0) + 1.0
            n = (-u[1], u[0])
            quad = [(c_[0] - u[0] * a0 + n[0] * hw, c_[1] - u[1] * a0 + n[1] * hw), (c_[0] + u[0] * a1 + n[0] * hw, c_[1] + u[1] * a1 + n[1] * hw),
                    (c_[0] + u[0] * a1 - n[0] * hw, c_[1] + u[1] * a1 - n[1] * hw), (c_[0] - u[0] * a0 - n[0] * hw, c_[1] - u[1] * a0 - n[1] * hw)]
            qm = np.zeros(k.shape, np.uint8); cv2.fillPoly(qm, [np.rint(np.array(quad)).astype(np.int32)], 1)
            todo.remove(pc); changed = True
            if float((base & (qm > 0)).sum()) >= 0.9 * float(qm.sum()):
                continue                                     # the same wall found twice (a stroke in both lists)
            k[qm > 0] = 255
            base = k > 0
            m["_slant_pieces"].append({"c": c_, "u": u, "hl": (a0 + a1) / 2.0, "hw": hw, "quad": quad})
            added += 1
    m["_diag_walls"] = added
    return k


ACROSS_SLANT = os.environ.get("AE_ACROSS_SLANT", "1") != "0"  # a level / plumb "gap" from one slanted wall to another is none


def across_slanted(m, k, slant, openings):
    """Gaps are looked for along level and plumb lines; where such a line crosses the corner between two slanted walls, or
    runs from a slanted wall to another, the "gap" it finds is the floor of the room between them, not an opening in a
    wall.  An opening whose wall mass at BOTH jambs is slanted mass is dropped (an opening in a slanted wall is looked for
    along that wall); one with slanted mass at ONE jamb, and no swing drawn at it, closes the room as wall."""
    if not slant.any():
        return openings, 0
    H, W = k.shape
    def slanted_at(o, c, x):
        px, py = (x, c) if o == "h" else (c, x)
        xi, yi = int(round(px)), int(round(py))
        box_k = k[max(0, yi - 2):yi + 3, max(0, xi - 2):xi + 3] > 0
        if not box_k.any():
            return False
        box_s = slant[max(0, yi - 2):yi + 3, max(0, xi - 2):xi + 3] > 0
        return float((box_s & box_k).sum()) >= 0.5 * float(box_k.sum())
    keep, dropped = [], 0
    for g in openings:
        if g.get("frame") is None and g["o"] in ("h", "v") and g["kind"] != "wall":
            n_sl = slanted_at(g["o"], g["c"], g["a"] - 2) + slanted_at(g["o"], g["c"], g["b"] + 1)
            if n_sl >= 2:
                dropped += 1; continue
            if n_sl == 1 and not g.get("arcs"):
                # from a wall end to the FACE of a slanted wall: no opening stands there (a door is hung between two wall
                # ends on one line), but the room is still closed across it - as wall.  A swing drawn at it is kept.
                g = dict(g, kind="wall", operation=None, confidence=0.45, why="from a wall end to the face of a slanted wall: no opening")
                dropped += 1
        keep.append(g)
    return keep, dropped


SLANT_GAPS = os.environ.get("AE_SLANT_GAPS", "0") == "1"    # doors, windows and passages in slanted walls, looked for along them
# (off.  Round 15 built it and measured it: it finds nothing on the 20 plans - no dev, gate or sealed plan has an opening
#  in a slanted wall once the slanted walls themselves are wall mass - and on six dev plans turned 30 degrees
#  (tools/rotmodel.py, tools/rotcheck.py) it found 153 openings of which 53 sit on an opening of the plan as drawn:
#  too many strays to switch on unmeasured.  The frame plumbing (g_pt, gap_pts, the frame-aware closing, cutting and
#  export) stays: it does nothing while no opening carries a frame.)


def g_pt(g, u, v):
    """a point given along / across an opening's own line -> working pixels (an opening in a slanted wall was found in a
    frame turned to that wall; everything else in the working frame itself)"""
    x, y = (u, v) if g["o"] == "h" else (v, u)
    F = g.get("frame")
    if not F:
        return (x, y)
    Mi = F["Minv"]
    return (Mi[0][0] * x + Mi[0][1] * y + Mi[0][2], Mi[1][0] * x + Mi[1][1] * y + Mi[1][2])


def gap_pts(g):
    """the two ends of an opening's span, in working pixels"""
    return g_pt(g, g["a"], g["c"]), g_pt(g, g["b"], g["c"])


def slanted_families(m, T):
    """the directions of the slanted wall mass (mod 90 degrees: a wall and the one square to it are looked along in one
    frame), each with the mask of its mass; a family needs a straight run of wall at least 3 T long"""
    fams = []
    for kind, px, ang, x, y, w, h, mask in m.get("_slant_parts", []):
        a90 = ang % 90.0
        f = next((f_ for f_ in fams if min(abs(f_["a"] - a90), 90.0 - abs(f_["a"] - a90)) <= 4.0), None)
        if f is None:
            f = {"a": a90, "px": 0, "w": 0.0, "parts": []}; fams.append(f)
        f["parts"].append((x, y, mask)); f["px"] += px; f["w"] += px * a90
    out = []
    for f in fams:
        if f["px"] >= 3.0 * T * T:
            out.append((f["w"] / f["px"], f["parts"]))
    return out


def rotated_view(m, k, theta, parts):
    """the wall mask and what the gap finder and the classifier read of the model, turned so that walls running at theta
    (and theta + 90) are level (and plumb); strokes at that angle - stage 1's `diagonals` and the sloped strokes read here -
    become its lines.  Returns (the turned model, its wall mask, the family's slanted mass there, M, M inverse)."""
    H, W = k.shape
    M = cv2.getRotationMatrix2D((W / 2.0, H / 2.0), theta, 1.0)
    ca, sa = abs(M[0, 0]), abs(M[0, 1])
    Wr, Hr = int(H * sa + W * ca) + 4, int(H * ca + W * sa) + 4
    M[0, 2] += Wr / 2.0 - W / 2.0; M[1, 2] += Hr / 2.0 - H / 2.0
    Minv = cv2.invertAffineTransform(M)
    P = lambda x, y: (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])
    kr = cv2.warpAffine(k, M, (Wr, Hr), flags=cv2.INTER_NEAREST, borderValue=0)
    fam = np.zeros(k.shape, np.uint8)
    for x, y, mask in parts:
        fam[y:y + mask.shape[0], x:x + mask.shape[1]][mask] = 1
    famr = cv2.warpAffine(fam, M, (Wr, Hr), flags=cv2.INTER_NEAREST, borderValue=0)
    mr = dict(m)
    mr["size"] = [Wr, Hr]
    gray = m.get("_work_gray")
    mr["_work_gray"] = cv2.warpAffine(gray, M, (Wr, Hr), flags=cv2.INTER_NEAREST, borderValue=255) if gray is not None else None
    mr["_text_mask"] = None
    if m.get("_furniture") is not None:
        mr["_furniture"] = cv2.warpAffine(m["_furniture"], M, (Wr, Hr), flags=cv2.INTER_NEAREST, borderValue=0)
    strokes = []
    for d_ in m.get("diagonals", []):
        strokes += [(a_, b_) for a_, b_ in zip(d_, d_[1:])]
    strokes += [(s_["p"], s_["q"]) for s_ in m.get("_sloped", [])]
    lines = []
    for a_, b_ in strokes:
        (x0, y0), (x1, y1) = P(*a_), P(*b_)
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180.0
        if min(ang, 180.0 - ang) <= 3.0:
            lines.append({"o": "h", "c": (y0 + y1) / 2.0, "a": min(x0, x1), "b": max(x0, x1), "t": 3.0})
        elif abs(ang - 90.0) <= 3.0:
            lines.append({"o": "v", "c": (x0 + x1) / 2.0, "a": min(y0, y1), "b": max(y0, y1), "t": 3.0})
    mr["lines"] = lines
    mr["arcs"] = [dict(a_, cx=P(a_["cx"], a_["cy"])[0], cy=P(a_["cx"], a_["cy"])[1], start=(a_["start"] - theta) % 360.0) for a_ in m.get("arcs", [])]
    def box_r(b_):
        x, y, w, h = b_
        cx, cy = P(x + w / 2.0, y + h / 2.0)
        return [cx - w / 2.0, cy - h / 2.0, w, h]
    mr["texts"] = [dict(t, box=box_r(t["box"])) for t in m.get("texts", [])]
    mr["unread_text"] = [dict(t, box=box_r(t["box"])) for t in m.get("unread_text", [])]
    fs = []
    for s_ in m.get("free_symbols", []):
        s2 = dict(s_)
        if s_.get("tri"):
            s2["tri"] = [list(P(*p_)) for p_ in s_["tri"]]
        fs.append(s2)
    mr["free_symbols"] = fs
    return mr, kr, famr, M, Minv


def slanted_gaps(m, k, unhosted, T):
    """Doors, windows and passages in slanted walls: for each direction of slanted mass the plan is looked at turned so
    that those walls run level and plumb, and the gap finder and classifier of the level / plumb walls run there unchanged.
    What they find is kept only where BOTH jambs are that slanted mass (the level / plumb walls, turned, are looked along
    in their own frame, not here); each opening keeps its frame, and its points reach the rest of the program through
    g_pt / gap_pts."""
    found = []; hosted = set()
    if not SLANT_GAPS:
        return found, unhosted
    nonaxis = m.get("_nonaxis")
    for theta, parts in slanted_families(m, T):
        mr, kr, famr, M, Minv = rotated_view(m, k, theta, parts)
        if nonaxis is not None:                              # (the jambs and bars may be any slanted or odd mass, not only this family's straight runs)
            Hr_, Wr_ = kr.shape
            famr = np.maximum(famr, cv2.warpAffine(nonaxis.astype(np.uint8), M, (Wr_, Hr_), flags=cv2.INTER_NEAREST, borderValue=0))
        # swings that already hang in a level / plumb opening are not this frame's
        mr["arcs"] = [a_ if i in unhosted else dict(a_, r=0.0, span=0.0, cx=-1e6, cy=-1e6) for i, a_ in enumerate(mr["arcs"])]
        bars_r, blobs_r, _u = wall_bars(mr, kr)
        on_fam = lambda x0, y0, x1, y1: famr[max(0, int(y0)):int(math.ceil(y1)) + 1, max(0, int(x0)):int(math.ceil(x1)) + 1].mean() >= 0.5 if int(math.ceil(y1)) >= int(y0) and int(math.ceil(x1)) >= int(x0) else False
        bars_f = [b_ for b_ in bars_r if on_fam(*((b_["a"], b_["c"] - b_["t"] / 2, b_["b"], b_["c"] + b_["t"] / 2) if b_["o"] == "h" else (b_["c"] - b_["t"] / 2, b_["a"], b_["c"] + b_["t"] / 2, b_["b"])))]
        blobs_f = [b_ for b_ in blobs_r if on_fam(b_["x0"], b_["y0"], b_["x1"], b_["y1"])]
        if not bars_f:
            continue
        gaps_r = find_gaps(mr, kr, bars_f, blobs_f)
        ops_r, _unh = classify_gaps(mr, kr, gaps_r)
        F = {"theta": theta, "M": M.tolist(), "Minv": Minv.tolist(), "kr": kr}
        def jamb_on_fam(o, c, x):
            px, py = (x, c) if o == "h" else (c, x)
            xi, yi = int(round(px)), int(round(py))
            bk = kr[max(0, yi - 2):yi + 3, max(0, xi - 2):xi + 3] > 0
            bf = famr[max(0, yi - 2):yi + 3, max(0, xi - 2):xi + 3] > 0
            return bk.any() and float((bf & bk).sum()) >= 0.5 * float(bk.sum())
        for g in ops_r:
            if g["kind"] == "wall" or not (jamb_on_fam(g["o"], g["c"], g["a"] - 2) and jamb_on_fam(g["o"], g["c"], g["b"] + 1)):
                continue
            g = dict(g, frame=F)
            found.append(g); hosted.update(g.get("arcs", []))
    m["_slanted_gaps"] = len(found)
    return found, [i for i in unhosted if i not in hosted]


def wall_mass(m, gray=None):
    """the wall mass the rooms are closed with (working pixels): traced walls and partitions, and - by drawing style - the
    outline cells, or the hatching and solid posts the tracer did not keep"""
    mm = pseudo_scale(m)
    k = wall_mask(m)
    outline_style = False
    m["_work_gray"] = gray if (gray is not None and gray.shape == k.shape) else None
    if gray is not None and gray.shape == k.shape:
        filled = np.zeros(k.shape, np.uint8)
        for w_ in m["walls"]:
            if not w_.get("hole"):
                cv2.fillPoly(filled, [np.rint(np.array(w_["pts"])).astype(np.int32)], 1)
        outline_style = float(filled.sum()) * mm * mm < 1.0e6   # under a square metre of filled or hatched wall in a whole flat: the walls are drawn as outlines
        if outline_style:
            k = cv2.bitwise_or(k, outline_wall_cells(m, gray))
        else:
            k = hatch_wall_supplement(m, gray, k)
            k = cv2.bitwise_or(k, solid_blobs(m, gray))
            # (outline cells were tried on filled plans as well, for partitions drawn in outline next to filled walls: they
            #  cost more rooms and doors than they gave - windows and furniture strips look the same there)
    sloped_strokes(m, m["_work_gray"], k)                   # (read once, on the wall mass before anything slanted joins it)
    k = slanted_thin_walls(m, m["_work_gray"], k)
    return k, outline_style


def dimension_scraps(m):
    """A dimension line drawn INSIDE a room (h1's store: the shelter's 3000 beside a line from wall to wall) comes out of
    stage 1 in pieces, and the piece beside its own number carries no role, while the tick at its end became a 76 mm
    "partition".  A stroke in line with a dimension line (same axis, same place within a pixel, ends within two walls'
    thickness of it) is that line's own scrap, and so is a partition standing on it."""
    T = float(m["wall_thickness_px"])
    dims = [l for l in m["lines"] if l.get("role") == "dimension"]
    k = wall_mask(m); H, W = k.shape
    def beside_wall(l):                                       # wall mass alongside the stroke (a window's strokes on the outer wall, under the dimension chain)
        hit = tot = 0
        for u in np.linspace(l["a"], l["b"], 7):
            for d_ in (-1.5 * T, -0.8 * T, 0.8 * T, 1.5 * T):
                x, y = (u, l["c"] + d_) if l["o"] == "h" else (l["c"] + d_, u)
                x, y = int(round(x)), int(round(y))
                if 0 <= x < W and 0 <= y < H:
                    tot += 1; hit += 1 if k[y, x] else 0
        return tot > 0 and hit >= 0.4 * tot
    def wall_to_wall(l):                                      # the stroke runs from wall face to wall face (the line drawn across a room)
        ok = 0
        for u, sgn in ((l["a"], -1), (l["b"], 1)):
            for d_ in np.linspace(0.1 * T, 0.6 * T, 6):
                x, y = (u + sgn * d_, l["c"]) if l["o"] == "h" else (l["c"], u + sgn * d_)
                x, y = int(round(x)), int(round(y))
                if 0 <= x < W and 0 <= y < H and k[y, x]:
                    ok += 1; break
        return ok == 2
    n_lines = n_parts = 0
    changed = True
    while changed:                                            # (a scrap next to a scrap)
        changed = False
        for l in m["lines"]:
            if l.get("role") or l.get("dash"):
                continue
            for d in dims:
                if d["o"] == l["o"] and abs(d["c"] - l["c"]) <= 1.0 and max(l["a"], d["a"]) - min(l["b"], d["b"]) <= 2.0 * T and not beside_wall(l) and wall_to_wall(l):
                    l["role"] = "dimension"; dims.append(l); n_lines += 1; changed = True
                    break
    keep = []
    for p in m.get("partitions", []):
        on = any(d["o"] == p["o"] and (abs(d["c"] - p["c0"]) <= 1.0 or abs(d["c"] - p["c1"]) <= 1.0) and max(p["a"], d["a"]) - min(p["b"], d["b"]) <= 2.0 * T for d in dims)
        if on and (p["b"] - p["a"]) <= 2.0 * T:
            n_parts += 1
        else:
            keep.append(p)
    m["partitions"] = keep
    m["_dim_scraps"] = n_lines + n_parts


def build(m, gray=None):
    T = float(m["wall_thickness_px"]); S = ToSource(m)
    if DIM_SCRAPS:
        dimension_scraps(m)
    W, H = m["size"]
    scale_work = m.get("mm_per_px"); mm = pseudo_scale(m)
    estimated = bool((m.get("scale_source") or {}).get("estimated"))
    k, outline_style = wall_mass(m, gray)
    bars, blobs, unsupported = wall_bars(m, k)
    residual = dict(m["_residual_kinds"]); slant_mask = m["_slant_mask"]; slant_parts = m["_slant_parts"]; nonaxis_mask = m["_nonaxis"]
    slanted_px = sum(p_[1] for p_ in slant_parts)            # slanted WALLS: straight, 5 degrees or more off, no thicker than a wall
    gaps = find_gaps(m, k, bars, blobs)
    openings, unhosted = classify_gaps(m, k, gaps)
    # window bands that no gap between two wall ends accounts for (a window meeting a window at a corner): they stand in for
    # wall, and the openings next to them are looked for once more
    same_place = lambda h_, g: h_["o"] == g["o"] and h_["lo"] - 1.5 * T <= g["c"] <= h_["hi"] + 1.5 * T and min(h_["b"], g["b"]) - max(h_["a"], g["a"]) > 0.5 * min(g["b"] - g["a"], h_["b"] - h_["a"])
    bands = [h_ for h_ in window_bundles(m, k) if not any(same_place(h_, g) for g in openings)]
    for h_ in bands:
        thin_to_line(h_, bars, T)
    if bands:
        k2 = k.copy()
        for g in bands:
            a, b, c0, c1 = int(g["a"]), int(math.ceil(g["b"])), int(g["lo"]), int(math.ceil(g["hi"]))
            if g["o"] == "h":
                k2[c0:c1 + 1, a:b + 1] = 255
            else:
                k2[a:b + 1, c0:c1 + 1] = 255
        bars2, blobs2, _u = wall_bars(m, k2)
        more, unhosted2 = classify_gaps(m, k2, find_gaps(m, k2, bars2, blobs2))
        clash = lambda g, h_: h_["o"] == g["o"] and abs(h_["c"] - g["c"]) <= 1.5 * T and min(h_["b"], g["b"]) - max(h_["a"], g["a"]) > 0.3 * min(g["b"] - g["a"], h_["b"] - h_["a"])
        openings = openings + bands + [g for g in more if not any(clash(g, h_) for h_ in openings + bands)]
        unhosted = [i for i in unhosted if i in unhosted2]
    if ACROSS_SLANT:
        openings, dropped_ = across_slanted(m, k, slant_mask, openings)
        m["_across_slant"] = dropped_
    m["_slant_parts"] = slant_parts; m["_nonaxis"] = nonaxis_mask
    more_s, unhosted = slanted_gaps(m, k, unhosted, T)
    openings = openings + more_s
    if PANEL_PARTITION:
        same_line = lambda h_, g: h_["o"] == g["o"] and abs(h_["c"] - g["c"]) <= 1.5 * T
        for g in panel_partitions(m, k):
            if any(same_line(h_, g) and min(h_["b"], g["b"]) - max(h_["a"], g["a"]) > 0.3 * (g["b"] - g["a"]) for h_ in openings):
                continue                                     # an opening was found there already
            # the piece beside the panels that was read on its own (the threshold stroke past the shorter panel) is part of the door
            openings = [h_ for h_ in openings if not (same_line(h_, g) and min(h_["b"], g["b"]) - max(h_["a"], g["a"]) >= 0.5 * (h_["b"] - h_["a"]))] + [g]
    labels = room_labels(m, k)
    OUTDOOR = ("BALCONY", "LEDGE", "YARD", "PES", "TERRACE", "PATIO", "PLANTER", "ENCLOSED SPACE", "ROOF", "COURTYARD", "DECK")
    def make_rooms(ops):
        if WALL_BAND:
            m["_wall_band"] = m.get("_wall_band", 0) + wall_gaps_take_their_strokes_band(m, ops, T)
        closed_ = close_openings(m, k, ops, thin=bool(os.environ.get("AE_THIN_CLOSE")))
        if os.environ.get("AE_DUMP_CLOSED"):
            cv2.imwrite(os.environ["AE_DUMP_CLOSED"], closed_)
        inner = room_outlines(m, closed_)
        pull_faces_to_wall(inner, ops)
        at = lambda r_, l: bool(r_["comp"][int(min(H - 1, max(0, (l["box"][1] + l["box"][3]) / 2))), int(min(W - 1, max(0, (l["box"][0] + l["box"][2]) / 2)))])
        # Balconies, ledges and yards are closed in by railings and parapets drawn as plain strokes, not by walls.  Where a
        # label of that kind lies outside every room, the strokes around it count as its boundary.
        wanted = [l for l in labels if any(w_ in l["label"].upper() for w_ in OUTDOOR) and not any(at(r_, l) for r_ in inner)]
        closed2 = closed_
        if wanted:
            closed2 = closed_.copy()
            for l in m["lines"]:
                if l.get("role") in ("dimension", "extension", "door-leaf") or l.get("dash") or (l["b"] - l["a"]) * mm < 300:
                    continue
                p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
                cv2.line(closed2, (int(round(p0[0])), int(round(p0[1]))), (int(round(p1[0])), int(round(p1[1]))), 255, 3)
            for dg in m.get("diagonals", []):
                for a_, b_ in zip(dg, dg[1:]):
                    cv2.line(closed2, (int(a_[0]), int(a_[1])), (int(b_[0]), int(b_[1])), 255, 3)
            if SLOPED_RAILS:                                 # (and the sloped strokes stage 1 kept in neither list)
                for s_ in m.get("_sloped", []):
                    if s_["len"] * mm < 300:                 # (as long as the level / plumb railings drawn here)
                        continue
                    cv2.line(closed2, (int(round(s_["p"][0])), int(round(s_["p"][1]))), (int(round(s_["q"][0])), int(round(s_["q"][1]))), 255, 3)
            if CURVED_RAILS:                                 # a curved parapet (h1's balcony), traced by stage 1 as a curve
                for a_ in curve_arcs(m):
                    cv2.polylines(closed2, [np.array(curve_polyline(a_), np.int32).reshape(-1, 1, 2)], False, 255, 3)
            for r_ in room_outlines(m, closed2):
                if any(at(r_, l) for l in wanted) and not any((r_["comp"] & q["comp"]).sum() > 0.2 * r_["comp"].sum() for q in inner) and r_["area_px"] * mm * mm <= 60e6:
                    r_["outdoor"] = True
                    inner.append(r_)
        m["_withheld_rooms"] = 0; m["_welds"] = 0
        thin = close_openings(m, k, ops, thin=True)
        if wanted:
            thin = cv2.bitwise_or(thin, cv2.bitwise_and(closed2, cv2.bitwise_not(closed_)))   # the strokes that closed the outdoor rooms
        m["_ops"] = ops
        rooms_ = attach_openings(m, centre_lines(m, thin, inner), ops)
        m["_withheld_rooms_last"] = m.pop("_withheld_rooms", 0)
        tol = 2.0 * max(1.0, float(m.get("work_scale", 1) or 1))
        def twice(r_):                                       # cutting sides at openings must not leave one stretch of wall in the loop twice
            P_ = r_["pts"]; n_ = len(P_)
            near = lambda a_, b_: math.hypot(a_[0] - b_[0], a_[1] - b_[1]) <= tol
            return any((near(P_[i], P_[j]) and near(P_[(i + 1) % n_], P_[(j + 1) % n_])) or (near(P_[i], P_[(j + 1) % n_]) and near(P_[(i + 1) % n_], P_[j]))
                       for i in range(n_) for j in range(i + 1, n_))
        legal = [r_ for r_ in rooms_ if not twice(r_)]
        if os.environ.get("AE_LOG_ROOMS"):
            for r_ in rooms_:
                if r_ not in legal:
                    xs_ = [p[0] for p in r_["pts"]]; ys_ = [p[1] for p in r_["pts"]]
                    print("room withheld (a stretch of wall twice in the loop): bbox %d,%d %dx%d" % (min(xs_), min(ys_), max(xs_) - min(xs_), max(ys_) - min(ys_)))
                    P_ = r_["pts"]; n_ = len(P_)
                    near = lambda a_, b_: math.hypot(a_[0] - b_[0], a_[1] - b_[1]) <= tol
                    for i in range(n_):
                        for j in range(i + 1, n_):
                            if (near(P_[i], P_[j]) and near(P_[(i + 1) % n_], P_[(j + 1) % n_])) or (near(P_[i], P_[(j + 1) % n_]) and near(P_[(i + 1) % n_], P_[j])):
                                print("   twice: side %d %s-%s and side %d %s-%s" % (i, [round(v) for v in P_[i]], [round(v) for v in P_[(i + 1) % n_]], j, [round(v) for v in P_[j]], [round(v) for v in P_[(j + 1) % n_]]))
            print("rooms after outlines: %s" % [(int(r_["area_px"] * mm * mm / 1e6 * 10) / 10.0) for r_ in inner])
        m["_withheld_rooms_last"] += len(rooms_) - len(legal); rooms_ = legal
        for r_ in rooms_:
            r_["labels"] = [l for l in labels if at(r_, l)]
        return closed_, rooms_
    # Two openings side by side on one wall line (the entrance beside its side light, a door beside a fixed panel) can
    # leave a hairline of wall mass between their jambs that no gap finder returns.  A room would leak through it: the
    # wider opening takes the hairline.
    for g1 in openings:
        for g2 in openings:
            if g1 is g2 or g1.get("frame") or g2.get("frame") or g1["o"] != g2["o"] or abs(g1["c"] - g2["c"]) > T or g1["kind"] == "wall" or g2["kind"] == "wall":
                continue
            if g1.get("wide") or g1.get("from_strokes") or g2.get("wide") or g2.get("from_strokes"):
                continue                                     # (a tentative opening trims nothing: it may not stay)
            d_ = g2["a"] - g1["b"]
            if 0 < d_ <= max(3.0, 0.15 * T):
                if g1["b"] - g1["a"] >= g2["b"] - g2["a"]:
                    g1["b"] = g2["a"]
                else:
                    g2["a"] = g1["b"]
    def settle(rooms_, ops):
        for r_ in rooms_:
            n_ = len(r_["pts"])
            r_["area"] = abs(0.5 * sum(r_["pts"][i][0] * r_["pts"][(i + 1) % n_][1] - r_["pts"][(i + 1) % n_][0] * r_["pts"][i][1] for i in range(n_)))
        rooms_.sort(key=lambda q: -q["area"])
        rooms = rooms_; openings = ops
        # which two rooms does every opening join?  (looked up on either side of its middle, not read off shared sides: a
        # balcony closed in by railings has sides of its own along the living-room wall)
        for g in openings:
            mid = ((g["a"] + g["b"]) / 2.0, g["c"]) if g["o"] == "h" else (g["c"], (g["a"] + g["b"]) / 2.0)
            nrm = (0.0, 1.0) if g["o"] == "h" else (1.0, 0.0)
            half = 0.5 * (g.get("hi", g["c"]) - g.get("lo", g["c"]))
            sides = []
            L_ = g["b"] - g["a"]
            alongs = [0.0, -0.25 * L_, 0.25 * L_]              # the middle first, then either side of it (a door next to a jamb post)
            for sgn in (-1, 1):
                found = None
                for d_ in (half + 4, half + 10, half + 20, half + 0.8 * T + 20, half + 1.5 * T + 20):
                    for al in alongs:
                        if g.get("frame"):
                            x, y = g_pt(g, (g["a"] + g["b"]) / 2.0 + al, g["c"] + sgn * d_)
                        else:
                            x, y = mid[0] + sgn * nrm[0] * d_ + (al if g["o"] == "h" else 0.0), mid[1] + sgn * nrm[1] * d_ + (al if g["o"] == "v" else 0.0)
                        x, y = int(round(x)), int(round(y))
                        if 0 <= x < W and 0 <= y < H:
                            found = next((n_ for n_, r_ in enumerate(rooms) if r_["comp"][y, x]), None)
                        if found is not None:
                            break
                    if found is not None:
                        break
                sides.append(found)
            g["between"] = sides
    def indoor(i_):                                          # a named room that is not a balcony, ledge, yard or the like
        labs_ = [l["label"].upper() for l in rooms[i_]["labels"]]
        return bool(labs_) and not any(w_ in l for l in labs_ for w_ in OUTDOOR_WORDS)
    COUNTERS = ("_splits", "_twin_welds", "_chamfers", "_welds", "_withheld_rooms_last")   # (per build; _wall_band marks the gaps it banded and is not counted twice)
    snap = {k_: m.get(k_) for k_ in COUNTERS}
    closed, rooms = make_rooms(openings)
    # A doorway without a door between a NAMED room and a space without a name (the passage in front of the bedroom doors,
    # open to the living room) does not make two rooms: the passage belongs to the room it is open to.
    # A doorway wider than 1.5 m, a sliding partition read from two strokes: only between two named rooms.  Decided first,
    # and the rooms made again without the ones that fail, so that everything after is judged on the rooms it was before.
    tentative = [g for g in openings if g.get("wide") or g.get("from_strokes")]
    if tentative:
        settle(rooms, openings)                              # (which two rooms each opening joins, read as it is read below)
        drop = []
        for g in tentative:
            bt = g.get("between", [None, None])
            if not (None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1])):
                drop.append(g)
        if drop:
            kept_ = []
            for g in openings:                               # (the pieces a dropped partition displaced go back in its place)
                if any(g is d_ for d_ in drop):
                    kept_.extend(g.get("displaced", []) if g.get("from_strokes") else [])
                else:
                    kept_.append(g)
            openings = kept_
            for k_, v_ in snap.items():                      # as if the tentative openings had never been there
                if v_ is None:
                    m.pop(k_, None)
                else:
                    m[k_] = v_
            closed, rooms = make_rooms(openings)
    dissolve = []
    for g in openings:
        sides = [r_ for r_ in rooms if any(me["opening"] is g for me in r_["meta"])]
        if g["kind"] == "open_passage" and g.get("confidence", 1) <= 0.45:       # (a threshold stroke from jamb to jamb IS a doorway)
            if len(sides) == 2 and sum(1 for r_ in sides if not r_["labels"]) == 1:
                dissolve.append(g)
        elif g.get("operation") == "sliding":
            # sliding panels in front of a nameless strip no deeper than a wardrobe: a cupboard front, not a door between rooms
            for r_ in sides:
                if not r_["labels"] and len(sides) == 2:
                    depth = 2.0 * float(cv2.distanceTransform(r_["comp"], cv2.DIST_L2, 3).max()) * mm
                    if depth <= 850:
                        dissolve.append(g); break
    if dissolve:
        openings = [g for g in openings if not any(g is d_ for d_ in dissolve)]
        closed, rooms = make_rooms(openings)
    settle(rooms, openings)
    # An opening leads somewhere.  One with solid wall standing right behind it (a cupboard against the outer wall), or a
    # window or doorless gap with the same room on both sides (a notch around furniture), is not an opening.
    def blocked(g, sgn):
        half = 0.5 * (g.get("hi", g["c"]) - g.get("lo", g["c"])); L_ = g["b"] - g["a"]; hit = tot = 0
        for t_ in np.linspace(g["a"] + 0.15 * L_, g["b"] - 0.15 * L_, 9):
            for d_ in (half + 3, half + 0.35 * T, half + 0.7 * T):
                x, y = g_pt(g, t_, g["c"] + sgn * d_) if g.get("frame") else ((t_, g["c"] + sgn * d_) if g["o"] == "h" else (g["c"] + sgn * d_, t_))
                x, y = int(round(x)), int(round(y))
                if 0 <= x < W and 0 <= y < H:
                    tot += 1; hit += 1 if k[y, x] else 0
        return tot > 0 and hit >= 0.6 * tot
    def walled_up(g):                                        # solid wall running along INSIDE the band the gap was found in
        L_ = g["b"] - g["a"]; lo_, hi_ = int(g.get("lo", g["c"])) - 2, int(math.ceil(g.get("hi", g["c"]))) + 2; n_hit = n_tot = 0
        kk = g["frame"]["kr"] if g.get("frame") else k       # (an opening in a slanted wall: read in its own frame)
        Hk, Wk = kk.shape
        for t_ in np.linspace(g["a"] + 0.15 * L_, g["b"] - 0.15 * L_, 9):
            t_ = int(round(t_))
            line = kk[t_, max(0, lo_):min(Wk, hi_ + 1)] if g["o"] == "v" else kk[max(0, lo_):min(Hk, hi_ + 1), t_]
            if 0 <= t_ < (Hk if g["o"] == "v" else Wk):
                n_tot += 1
                n_hit += 1 if max([b_ - a_ for a_, b_ in _runs(line > 0)] or [0]) >= 0.5 * T else 0
        return n_tot > 0 and n_hit >= 0.6 * n_tot
    bad = []; partitions = 0; narrow_swings = 0; casements = 0; scraps = 0; slide_windows = 0; not_panels = 0; panel_doors = 0
    panel_pairs = wide_passages = 0
    for g in openings:
        bt = g.get("between", [None, None])
        if g.get("from_strokes") or g.get("wide"):          # a sliding partition read from two strokes, a doorway wider than 1.5 m: only between two named indoor rooms
            if None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1]):
                if g.get("from_strokes"):
                    panel_pairs += 1
                else:
                    wide_passages += 1
            else:
                bad.append(g)
            continue
        if g.get("from_partition"):                          # a partition read as the two panels of a sliding door: only onto a balcony
            if None not in bt and bt[0] != bt[1] and (indoor(bt[0]) != indoor(bt[1])) and all(rooms[i_]["labels"] for i_ in bt):
                panel_doors += 1
            else:
                g.update(kind="wall", operation=None, panels=None, confidence=0.45, why="a partition"); partitions += 1
            continue
        if g["kind"] == "open_passage" and walled_up(g):       # (folding and sliding doors are also read ACROSS a traced wall: not those)
            bad.append(g); continue
        # A swing narrower than any door (the narrowest on the plans seen is a 570 mm shelter door) is the leaf of a
        # casement window on an outer wall, or a cupboard door or a fixture's arc between two rooms.  (Folding doors are
        # measured on their V, which can be half the opening: not those.)
        if g["kind"] == "door" and g.get("operation") == "swing" and (g["b"] - g["a"]) * mm < NARROW_SWING_MM:
            if None in bt:
                g.update(kind="window", operation="fixed", hinge="none", swing_side=0, confidence=min(g.get("confidence", 0.7), 0.6),
                         why="a swing too narrow for a door, on an outer wall: a casement window")
            else:
                g.update(kind="wall", operation=None, confidence=0.45, why="a swing too narrow for a door between two rooms: a cupboard door or a fixture")
            narrow_swings += 1
            continue
        # Strokes along the whole gap that are no sliding panels: the panels of a sliding door lie in the thickness of the
        # wall, a panel's width apart (15 - 100 mm), overlapping end to end.  Two strokes of one length out beside the wall
        # (a sash, a laundry rack, the outline of an appliance) or the two faces of a thin wall are a window - or, between
        # two named indoor rooms, a partition drawn thin.  (The gap stays closed: only what closes it changes.)
        if g["kind"] == "door" and g.get("operation") == "sliding" and g.get("panels") is False and PANELS_IN_WALL:
            if None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1]):
                g.update(kind="wall", operation=None, confidence=0.5, why="strokes along the gap that are no sliding panels, between two named rooms: a partition drawn thin")
            else:
                g.update(kind="window", operation="fixed", hinge="none", swing_side=0, confidence=0.5, why="strokes along the gap that are no sliding panels: a window")
            not_panels += 1
            continue
        # Two leaves of one size hung from the two jambs of a gap in an outer wall are a casement window (the bedroom
        # windows of the HDB plans: leaf radii within 12 % of each other).  A double entrance is a main leaf with a half
        # leaf or a gate beside it (radii 0.2 - 0.4 of each other).
        if g["kind"] == "door" and g.get("operation") == "swing" and g.get("handing") == "double" and None in bt and len(g.get("arcs", [])) == 2:
            r1, r2 = (float(m["arcs"][i_]["r"]) for i_ in g["arcs"])
            if min(r1, r2) >= CASEMENT_RATIO * max(r1, r2):
                g.update(kind="window", operation="fixed", hinge="none", handing="unknown", swing_side=0, confidence=min(g.get("confidence", 0.8), 0.7),
                         why="two leaves of one size from the two jambs, on an outer wall: a casement window")
                casements += 1
                continue
        # a scrap of a folding-door symbol beside the door itself (h2's entrance gate): narrower than any leaf
        if g["kind"] == "door" and g.get("operation") == "folding" and (g["b"] - g["a"]) * mm < FOLD_MIN_MM:
            g.update(kind="wall", operation=None, confidence=0.45, why="narrower than any folding leaf: a scrap of the symbol")
            scraps += 1
            continue
        # Sliding panels in an OUTER wall narrower than a balcony door are a sliding window: the way out of a flat is its
        # entrance door, and a sliding door to the outside leads onto a balcony, 2.4 m wide or more, that did not close.
        # (Exported as a fixed window: the app allows moving operations on doors and gates only.)
        if g["kind"] == "door" and g.get("operation") == "sliding" and None in bt and bt != [None, None] and (g["b"] - g["a"]) * mm < SLIDE_OUT_MIN_MM:
            g.update(kind="window", operation="fixed", hinge="none", swing_side=0, confidence=min(g.get("confidence", 0.6), 0.55),
                     why="sliding panels in an outer wall, narrower than a door onto a balcony: a sliding window")
            slide_windows += 1
            continue
        # Two or three parallel lines between two named indoor rooms are a lightweight partition drawn in outline (the
        # bedroom / kitchen wall on HDB plans), not a window: a window has the outdoors, or a space without a name, on one side.
        if g["kind"] == "window" and None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1]):
            g.update(kind="wall", operation=None, confidence=0.5, why="parallel lines between two named indoor rooms: a partition drawn in outline, not a window")
            partitions += 1; continue
        if bt[0] is not None and bt[0] == bt[1] and (g["kind"] == "window" or (g["kind"] == "open_passage" and g.get("confidence", 1) <= 0.55)):
            bad.append(g)
        elif (bt[0] is None) != (bt[1] is None) and g["kind"] != "window" and g.get("operation") != "swing" and blocked(g, -1 if bt[0] is None else 1):
            bad.append(g)
    if bad or partitions:
        back = [h for g in bad if g.get("from_strokes") for h in g.get("displaced", [])]
        openings = [g for g in openings if not any(g is d_ for d_ in bad)] + back
        closed, rooms = make_rooms(openings)
        settle(rooms, openings)
    m["_openings_rejected"] = len(bad); m["_panel_pairs"] = panel_pairs; m["_wide_passages"] = wide_passages; m["_partitions"] = partitions; m["_narrow_swings"] = narrow_swings; m["_casements"] = casements; m["_fold_scraps"] = scraps; m["_slide_windows"] = slide_windows; m["_not_panels"] = not_panels; m["_panel_doors"] = panel_doors
    # A face under 1.5 m2 that carries no label is not a room: the inside of a shaft, the strip behind a wardrobe
    # drawn against a wall, a notch between a column and a cupboard.  The smallest named space on any plan seen is a
    # 1.3 m2 WC, and it carries its name.  Such faces are left out of the rooms, and an opening that led into one is
    # not an opening (the wall stands solid there); the rooms are rebuilt without it.
    def slivers(rooms_):
        return [r_ for r_ in rooms_ if scale_work and not r_["labels"] and r_["area"] * scale_work * scale_work < SLIVER_M2 * 1e6]
    sliver_count = 0
    for _round in range(3):
        sl = slivers(rooms)
        if not sl:
            break
        gone = {n_ for n_, r_ in enumerate(rooms) if any(r_ is q for q in sl)}
        into = [g for g in openings if any(b_ in gone for b_ in g.get("between", [None, None]) if b_ is not None)]
        sliver_count += len(sl)
        if not into:
            rooms = [r_ for r_ in rooms if not any(r_ is q for q in sl)]
            settle(rooms, openings)
            break
        openings = [g for g in openings if not any(g is d_ for d_ in into)]
        closed, rooms = make_rooms(openings)
        settle(rooms, openings)
        rooms = [r_ for r_ in rooms if not any(r_ is q for q in slivers(rooms))]
        settle(rooms, openings)
    m["_slivers"] = sliver_count
    # The way onto a balcony from the living room is a sliding door, drawn like a window (two or three lines from jamb to
    # jamb).  A wide "window" between a living / dining / kitchen space and a balcony-type space is that door.
    ONTO = ("BALCONY", "PES", "TERRACE", "PATIO", "DECK", "COURTYARD", "YARD")
    LIVING = ("living", "dining", "kitchen", "foyer", "family", "study")
    for g in openings:
        if g["kind"] != "window" or (g["b"] - g["a"]) * mm < 1500:
            continue
        bt = g.get("between", [None, None])
        if None in bt or bt[0] == bt[1]:
            continue
        labs = [[l["label"].upper() for l in rooms[i]["labels"]] for i in bt]
        outdoor = [any(w_ in l for l in ls for w_ in ONTO) for ls in labs]
        indoor = [any(room_type(l) in LIVING for l in ls) for ls in labs]
        if (outdoor[0] and indoor[1]) or (outdoor[1] and indoor[0]):
            g.update(kind="door", operation="sliding", hinge="none", swing_side=0, confidence=min(g.get("confidence", 0.7), 0.6), why="a wide window onto a balcony from a living space")
    fixtures = []
    for s_ in list(m.get("free_symbols", [])) + list(m.get("symbols", [])):
        kind = {"wc": "toilet", "basin": "basin", "basin_d": "basin", "oval": "basin"}.get(s_.get("type"))
        if kind and s_.get("box"):
            fixtures.append({"kind": kind, "box": s_["box"], "confidence": 0.85 if s_.get("type") != "oval" else 0.5})

    # ---- export, source pixels -------------------------------------------------------------------------
    k_len = S.k
    def edge_pts(e):
        return [S(*e["p"]), S(*e["q"])]
    sem_labels = []
    for l in labels:
        x0, y0, x1, y1 = l["box"]
        r = S.ratio((x0 + x1) / 2, (y0 + y1) / 2)
        sem_labels.append({"label": l["label"], "rawText": l["label"], "roomType": l["roomType"], "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"],
                           "bbox": S.bbox(x0, y0, x1, y1), "confidence": l["confidence"], "evidenceKind": "vectorizer"})
    sem_dims = []
    for d in m.get("dim_spans", []):
        p0, p1 = ((d["p"], d["lc"]), (d["q"], d["lc"])) if d["axis"] == "x" else ((d["lc"], d["p"]), (d["lc"], d["q"]))
        tc = d.get("tc") or [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
        r = S.ratio(*tc)
        conf = 0.95 if d.get("clean") and d.get("vote_strong") else 0.9 if d.get("clean") else 0.7
        sem_dims.append({"valueMm": int(d["mm"]), "rawText": d.get("s", str(d["mm"])), "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"],
                         "orientation": "horizontal" if d["axis"] == "x" else "vertical", "extensionStart": S.ratio(*p0), "extensionEnd": S.ratio(*p1),
                         "extensionEvidenceKind": "vectorizer", "confidence": conf, "evidenceKind": "vectorizer",
                         "spanSourcePx": [S(*p0), S(*p1)], "readingClean": bool(d.get("clean"))})
    # Numbers stage 1 tied to a dimension line but could not pair with two stops are still printed dimensions: the app
    # gets them as labels without a measured span, with a search hint of the printed length about the number on the
    # dimension line beside it (when stage 1 solved a scale) so that its own tick finder can confirm them.
    spanned = [d.get("tc") or [0, 0] for d in m.get("dim_spans", [])]
    mm_px = m.get("mm_per_px")
    for t in m.get("texts", []):
        s_ = str(t.get("s", "")).strip()
        if not s_.isdigit() or not (100 <= int(s_) <= 100000) or not t.get("dim_by"):
            continue
        x0, y0, w, h = t["box"]
        cx, cy = x0 + w / 2, y0 + h / 2
        if any(abs(tc[0] - cx) < 6 and abs(tc[1] - cy) < 6 for tc in spanned):
            continue
        vertical = bool(t.get("vertical"))
        r = S.ratio(cx, cy)
        lab = {"valueMm": int(s_), "rawText": s_, "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"],
               "orientation": "vertical" if vertical else "horizontal", "confidence": 0.7 if t.get("vote_strong") else 0.55,
               "evidenceKind": "vectorizer", "readingClean": False}
        if mm_px:
            L = int(s_) / mm_px
            along, perp = (cy, cx) if vertical else (cx, cy)
            near = [l for l in m.get("lines", []) if l["o"] == ("v" if vertical else "h") and abs(l["c"] - perp) <= 1.2 * m.get("text_h", h)
                    and l["a"] - m.get("text_h", h) <= along <= l["b"] + m.get("text_h", h)]
            lc = min(near, key=lambda l: abs(l["c"] - perp))["c"] if near else perp
            p0, p1 = ((lc, along - L / 2), (lc, along + L / 2)) if vertical else ((along - L / 2, lc), (along + L / 2, lc))
            lab.update({"extensionStart": S.ratio(*p0), "extensionEnd": S.ratio(*p1), "extensionEvidenceKind": "vectorizer"})
        sem_dims.append(lab)
    def swing_geometry(g):
        """where the hinge is and which way the leaf swings, as source-pixel points (the app works out start / end and
        left / right against the direction of ITS wall)"""
        if g.get("hinge") not in ("start", "end") or not g.get("swing_side"):
            return None, None
        u = g["a"] if g["hinge"] == "start" else g["b"]
        d_ = 0.5 * (g["b"] - g["a"]) * g["swing_side"]
        if g.get("frame"):
            return S(*g_pt(g, u, g["c"])), S(*g_pt(g, u, g["c"] + d_))
        hp = (u, g["c"]) if g["o"] == "h" else (g["c"], u)
        sp = (hp[0], hp[1] + d_) if g["o"] == "h" else (hp[0] + d_, hp[1])
        return S(*hp), S(*sp)
    sem_open = []
    for g in openings:
        if g["kind"] == "wall":
            continue
        g["_hinge_px"], g["_swing_px"] = swing_geometry(g)
        p0, p1 = gap_pts(g) if g.get("frame") else (((g["a"], g["c"]), (g["b"], g["c"])) if g["o"] == "h" else ((g["c"], g["a"]), (g["c"], g["b"])))
        r = S.ratio((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        sem_open.append({"kind": g["kind"], "operation": g["operation"], "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"],
                         "spanStart": S.ratio(*p0), "spanEnd": S.ratio(*p1), "confidence": g["confidence"], "evidenceKind": "vectorizer",
                         "spanSourcePx": [S(*p0), S(*p1)], "widthMm": int(round((g["b"] - g["a"]) * scale_work)) if scale_work else None,
                         "hinge": g.get("hinge", "unknown"), "swingSide": g.get("swing_side", 0), "handing": g.get("handing", "unknown"), "note": g.get("why"),
                         "hingeSourcePx": g["_hinge_px"], "swingTowardSourcePx": g["_swing_px"]})
    for i in unhosted:
        a_ = m["arcs"][i]
        r = S.ratio(a_["cx"], a_["cy"])
        sem_open.append({"kind": "door", "operation": "swing", "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"], "confidence": 0.45, "evidenceKind": "vectorizer",
                         "hinge": "unknown", "swingSide": 0, "handing": "unknown", "leafMm": int(round(a_["r"] * scale_work)) if scale_work else None,
                         "note": "door swing found, but no gap in a wall to put it in"})
    sem_fix = []
    for f_ in fixtures:
        x0, y0, x1, y1 = f_["box"]; r = S.ratio((x0 + x1) / 2, (y0 + y1) / 2)
        sem_fix.append({"kind": f_["kind"], "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"], "bbox": S.bbox(x0, y0, x1, y1), "confidence": f_["confidence"], "evidenceKind": "vectorizer"})
    walls_out, seen_w, seen_g = [], {}, {}
    rooms_out = []
    if os.environ.get("AE_LOG_OPEN"):
        _k = k_len
        for g in openings:
            if g["kind"] == "wall" and os.environ.get("AE_LOG_OPEN") != "2":
                continue
            p0, p1 = gap_pts(g)
            rec = {"kind": g["kind"], "band": [round(g.get("lo", 0)), round(g.get("hi", 0)), round(g.get("lo_thin", 0)), round(g.get("hi_thin", 0))], "op": g["operation"], "handing": g.get("handing"), "o": g["o"] if not g.get("frame") else "%s@%.1f" % (g["o"], g["frame"]["theta"]), "src": [S(*p0), S(*p1)],
                   "L_mm": round((g["b"] - g["a"]) * scale_work) if scale_work else None,
                   "radii_mm": [round(m["arcs"][i]["r"] * scale_work) for i in g.get("arcs", [])] if scale_work else None,
                   "between": [(rooms[b_]["labels"][0]["label"] if rooms[b_]["labels"] else "?") if b_ is not None else "OUT" for b_ in g.get("between", [None, None])],
                   "why": g.get("why")}
            sys.stderr.write("OPEN " + json.dumps(rec) + "\n")
    for n, r_ in enumerate(rooms):
        named = [l for l in r_["labels"] if l["known"]] or r_["labels"]
        label = " / ".join(l["label"] for l in named) if named else ""
        typ = next((l["roomType"] for l in named if l["roomType"] != "other"), "other")
        npts = len(r_["pts"]); edge_recs = []
        for i in range(npts):
            a, b = r_["pts"][i], r_["pts"][(i + 1) % npts]; me = r_["meta"][i]
            key = tuple(sorted(((round(a[0]), round(a[1])), (round(b[0]), round(b[1])))))
            # the other room's cut of the same opening, a rounding step off this one's: one edge for both
            og = me["opening"]; twin = None
            if og is not None and SHARED_SPAN:
                hz = abs(a[1] - b[1]) <= abs(a[0] - b[0])
                perp = (a[1] + b[1]) / 2.0 if hz else (a[0] + b[0]) / 2.0
                lo_, hi_ = sorted((a[0], b[0])) if hz else sorted((a[1], b[1]))
                twin = next((w_ for pp, l0, h0, w_ in seen_g.get(id(og), []) if abs(pp - perp) <= 0.25 and abs(l0 - lo_) <= 1.0 and abs(h0 - hi_) <= 1.0), None)
                if twin is None and key not in seen_w:
                    seen_g.setdefault(id(og), []).append((perp, lo_, hi_, "e%d" % (len(walls_out) + 1)))
            if twin is not None:
                edge_recs.append(twin)
                continue
            if key not in seen_w:
                g = me["opening"]
                seen_w[key] = "e%d" % (len(walls_out) + 1)
                walls_out.append({"id": seen_w[key], "kind": "wall_centerline" if me["kind"] == "wall" else "supported_opening_span", "sourcePx": [S(*a), S(*b)],
                                  "thicknessPx": round(me["t"] * k_len, 2), "thicknessMm": int(round(me["t"] * scale_work)) if scale_work else None,
                                  "opening": None if g is None else {"kind": g["kind"], "operation": g["operation"], "hinge": g.get("hinge", "unknown"), "swingSide": g.get("swing_side", 0),
                                                                     "handing": g.get("handing", "unknown"), "confidence": g["confidence"],
                                                                     "hingeSourcePx": g.get("_hinge_px"), "swingTowardSourcePx": g.get("_swing_px"), "note": g.get("why"),
                                                                     "widthMm": int(round((g["b"] - g["a"]) * scale_work)) if scale_work else None,
                                                                     "between": ["room-%d" % (b_ + 1) if b_ is not None else "outside" for b_ in g.get("between", [None, None])]}})
            edge_recs.append(seen_w[key])
        rooms_out.append({"key": "room-%d" % (n + 1), "label": label, "roomType": typ, "registrationKind": "assembled_wall_topology",
                          "confidence": round(min([0.9] + [l["confidence"] for l in named]) if named else 0.5, 3),
                          "sourcePoints": [dict(zip(("x", "y"), S(*p_))) for p_ in r_["pts"]], "edgeIds": edge_recs,
                          "areaM2": round(r_["area"] * scale_work * scale_work / 1e6, 2) if scale_work else None,
                          "sourceLabels": [l["label"] for l in r_["labels"]]})
    in_rooms = {id(l) for r_ in rooms for l in r_["labels"]}
    ext = None
    if rooms:
        xs = [p[0] for r_ in rooms for p in r_["pts"]]; ys = [p[1] for r_ in rooms for p in r_["pts"]]
        ext = S.bbox(min(xs) - 2 * T, min(ys) - 2 * T, max(xs) + 2 * T, max(ys) + 2 * T)
    notes = []
    if slanted_px > 4 * T * T:
        notes.append("Some walls are slanted: the rooms follow them, but doors and windows in a slanted wall are not read yet.")
    curve_sides = sum(1 for r_ in rooms for s_ in r_.get("sides", []) if s_.get("curve"))
    if curve_sides:
        notes.append("A curved wall is exported as a chain of short straight walls: the rooms follow it, but doors and windows in a curved wall are not read yet.")
    if estimated:
        notes.append("No written dimensions: the scale is an estimate from door leaves taken as %d mm and must be confirmed." % int((m.get("scale_source") or {}).get("assumed_leaf_mm", 850)))
    out = {
        "kind": "floorplan_vectorizer_evidence_v1", "exporterVersion": VERSION,
        "page": {"widthPx": S.W0, "heightPx": S.H0, "coordinateSpace": "source_image_px"},
        "scale": {"millimetresPerPixel": round(scale_work / k_len, 5) if scale_work else None,
                  "basis": "none" if not scale_work else "estimated_door_leaf" if estimated else "explicit_dimension",
                  "dimensionCount": len(sem_dims), "needsReview": bool(estimated or not scale_work),
                  "chainsChecked": (m.get("dimension_report") or {}).get("chains", []),
                  "estimate": scale_estimate(m, walls_out, scale_work / k_len) if (estimated and scale_work) else None},
        "semantics": {"planRegion": {"bbox": ext, "rotationDegrees": float(m.get("skew_deg", 0.0)), "confidence": 0.9, "evidenceKind": "vectorizer"} if ext else None,
                      "unitSystem": "metric_mm" if sem_dims else "unknown", "roomLabels": sem_labels,
                      "roomBoundaries": [{"label": r_["label"] or "Room", "roomType": r_["roomType"], "confidence": r_["confidence"], "evidenceKind": "vectorizer",
                                          "points": [{"xRatio": round(p["x"] / S.W0, 6), "yRatio": round(p["y"] / S.H0, 6)} for p in r_["sourcePoints"]]} for r_ in rooms_out],
                      "dimensionLabels": sem_dims, "openingSymbols": sem_open, "fixtureSymbols": sem_fix, "entrance": None, "notes": notes},
        "wallEdges": walls_out, "rooms": rooms_out,
        "diagnostics": {"bars": len(bars), "gapsSeen": len(gaps), "openings": {kk: sum(1 for g in openings if g["kind"] == kk) for kk in ("door", "window", "open_passage", "wall")},
                        "doorSwingsWithoutGap": len(unhosted), "rooms": len(rooms_out), "roomsWithheldAsIllegalGeometry": int(m.get("_withheld_rooms_last", 0)), "facesLeftOutAsSlivers": int(m.get("_slivers", 0)), "leakedWallChannels": int(m.get("_leaked_channels", 0)), "swingsTooNarrowForADoor": int(m.get("_narrow_swings", 0)), "doubleSwingsReadAsCasements": int(m.get("_casements", 0)), "foldingScrapsDropped": int(m.get("_fold_scraps", 0)), "slidingPanelsReadAsWindows": int(m.get("_slide_windows", 0)), "stripsThatAreNoSlidingPanels": int(m.get("_not_panels", 0)), "windowsReadAsPartitions": int(m.get("_partitions", 0)), "openingsRejectedAsNotLeadingAnywhere": int(m.get("_openings_rejected", 0)), "labelsOutsideRooms": [l["label"] for l in labels if l["known"] and id(l) not in in_rooms],
                        "diagonalWallsAdded": int(m.get("_diag_walls", 0)), "gapsAcrossSlantedWallsDropped": int(m.get("_across_slant", 0)), "openingsInSlantedWalls": int(m.get("_slanted_gaps", 0)), "slantedSidesWelded": int(m.get("_welds", 0)), "slopedStrokes": len(m.get("_sloped", [])), "curvedWalls": len(curve_arcs(m)), "curvedSides": int(curve_sides), "panelPartitionsAsSlidingDoors": int(m.get("_panel_doors", 0)), "foldingDoorsOnTheirPartition": int(m.get("_fold_partition", 0)), "wallGapsOnTheirStrokes": int(m.get("_wall_band", 0)), "sidesSplitAtThicknessChanges": int(m.get("_splits", 0)), "sidesWeldedOntoTheWall": int(m.get("_twin_welds", 0)), "jambChamfersDropped": int(m.get("_chamfers", 0)), "dimensionScrapsDropped": int(m.get("_dim_scraps", 0)), "slidingPartitionsFromStrokes": int(m.get("_panel_pairs", 0)), "wideDoorwaysKept": int(m.get("_wide_passages", 0)), "unsupportedWallPx": int(unsupported), "thickAxisWallPx": int(residual["axis"]), "slantedWallPx": int(slanted_px), "otherWallPx": int(residual["slanted"] + residual["curved"] - slanted_px), "workScale": m.get("work_scale"), "skewDeg": m.get("skew_deg"),
                        "pageCrop": {"offsetPx": m.get("crop_offset"), "pageSizePx": m.get("page_size")} if m.get("crop_offset") else None,
                        "scaleBar": ({k_: m["scale_bar"][k_] for k_ in ("mm", "unit", "labelFitErrorMm")} | {"source": "graphic scale bar"}) if m.get("scale_bar") else None,
                        "areaCheck": area_check(m, rooms_out)},
    }
    dbg = {"k": k, "closed": closed, "bars": bars, "blobs": blobs, "gaps": gaps, "openings": openings, "rooms": rooms, "labels": labels}
    return out, dbg


def check_picture(m, out, dbg, path, source=None):
    W, H = m["size"]
    if source is not None and m.get("skew_deg", 0) == 0:
        img = cv2.imread(source)
        if m.get("crop_offset"):                              # only the traced part of the page is drawn
            ox, oy = m["crop_offset"]; ws_ = float(m.get("work_scale", 1) or 1)
            img = img[int(oy):int(oy + H / ws_), int(ox):int(ox + W / ws_)]
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_CUBIC)
        img = cv2.addWeighted(img, 0.35, np.full_like(img, 255), 0.65, 0)
    else:
        img = cv2.cvtColor(255 - dbg["k"] // 4, cv2.COLOR_GRAY2BGR)
    img[dbg["k"] > 0] = (0.5 * img[dbg["k"] > 0] + 0.5 * np.array([150, 150, 150])).astype(np.uint8)
    pal = [(255, 214, 170), (170, 255, 214), (214, 170, 255), (170, 214, 255), (255, 170, 214), (214, 255, 170), (200, 200, 255), (255, 235, 150)]
    ov = img.copy()
    for n, r_ in enumerate(dbg["rooms"]):
        cv2.fillPoly(ov, [np.rint(np.array(r_["pts"])).astype(np.int32)], pal[n % len(pal)])
    img = cv2.addWeighted(ov, 0.55, img, 0.45, 0)
    col = {"wall": (40, 40, 40), "door": (0, 0, 230), "window": (230, 120, 0), "open_passage": (0, 170, 0)}
    for r_ in dbg["rooms"]:
        n_ = len(r_["pts"])
        for i in range(n_):
            p, q = tuple(int(round(v)) for v in r_["pts"][i]), tuple(int(round(v)) for v in r_["pts"][(i + 1) % n_])
            kd = r_["meta"][i]["kind"]
            cv2.line(img, p, q, col.get(kd, (40, 40, 40)), 6 if kd != "wall" else 3)
        for p in r_["pts"]:
            cv2.circle(img, (int(round(p[0])), int(round(p[1]))), 5, (0, 0, 0), -1)
    for g in dbg["gaps"]:                                    # gaps on a wall line that were given no meaning (yellow): where rooms leak
        if not any(h["o"] == g["o"] and abs(h["c"] - g["c"]) < 2 and abs(h["a"] - g["a"]) < 2 for h in dbg["openings"]) and (g["b"] - g["a"]) * pseudo_scale(m) <= 3000:
            p, q = gap_pts(g)
            cv2.line(img, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), (0, 200, 255), 2)
    for g in dbg["openings"]:                                # openings that ended up on no room side
        if g["kind"] != "wall" and not any(me["opening"] is g for r_ in dbg["rooms"] for me in r_["meta"]):
            p, q = gap_pts(g)
            cv2.line(img, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), col[g["kind"]], 2)
    fs = max(0.5, W / 1800.0)
    for n, r_ in enumerate(out["rooms"]):
        ys_, xs_ = np.nonzero(dbg["rooms"][n]["comp"]); c = (xs_.mean(), ys_.mean())
        txt = (r_["label"] or "?") + ("  %.1f m2" % r_["areaM2"] if r_["areaM2"] else "")
        cv2.putText(img, txt, (int(c[0] - 6 * len(txt) * fs), int(c[1])), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * fs, (120, 0, 120), max(1, int(2 * fs)))
    s = 1500.0 / max(W, H)
    cv2.imwrite(path, cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opt = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
    m = json.load(open(args[0]))
    work = opt.get("--work") or (args[0][:-5] + ".work.png" if args[0].endswith(".json") else None)
    gray = cv2.imread(work, 0) if work and os.path.exists(work) else None
    out, dbg = build(m, gray)
    json.dump(out, open(args[1], "w"), indent=1)
    if opt.get("--check"):
        check_picture(m, out, dbg, opt["--check"], opt.get("--source"))
    d = out["diagnostics"]
    print("rooms %d | openings %s | swings without a gap %d | labels outside rooms %s | scale %s (%s)" % (
        d["rooms"], d["openings"], d["doorSwingsWithoutGap"], d["labelsOutsideRooms"], out["scale"]["millimetresPerPixel"], out["scale"]["basis"]))
    for r_ in out["rooms"]:
        print("   %-28s %-12s %s m2" % (r_["label"] or "?", r_["roomType"], r_["areaM2"]))
