#!/usr/bin/env python3
"""Vectorizer model  ->  evidence for the Interior AI floor-plan import pipeline.

    python3 app_evidence.py model.json out.evidence.json [--check check.png] [--source plan.png] [--svg=model.svg]

Reads the model JSON written by floorplan_vectorize.py and writes ONE JSON whose parts follow the app's own types
(lib/floor-plan-imports/deterministic-evidence.ts): PageSemanticEvidence (room labels, dimension labels with their two
stops, opening symbols with their jamb-to-jamb span, fixtures), wall centre-lines with thickness, and room faces as ordered
source-pixel polygons with one edge record per side (RegisteredRoomBoundary.sourceEdges).

All positions leave this file in SOURCE-IMAGE pixels (and 0..1 ratios of the source image), never in the vectorizer's
working pixels.  Nothing here imports the vectorizer; it needs numpy and OpenCV (and scikit-image's skeleton, from the
vectorizer's own requirements, for the sloped strokes of slanted walls).
"""
import json, math, os, re, sys
import numpy as np
import cv2

VERSION = "app-evidence-0.32.1"
OUTDOOR_WORDS = ("BALCONY", "LEDGE", "YARD", "PES", "TERRACE", "PATIO", "PLANTER", "ENCLOSED SPACE", "ROOF", "COURTYARD", "DECK", "GARDEN", "VOID", "A/C", "AC ", "AIR-CON", "AIRCON")
SLIVER_M2 = 1.5          # a nameless face smaller than this is a shaft, a strip behind a wardrobe or a notch, not a room
R39_PICTURE_BAND = os.environ.get("AE_R39_PICTURE_BAND", "1") != "0"   # round 39: a window read in the picture where stage 1 has its strokes only in pieces
R39_BAND_COVER = float(os.environ.get("AE_R39_BAND_COVER", 0.7))
R39_STROKE_WINDOWS = os.environ.get("AE_R39_STROKE_WINDOWS", "1") != "0"   # round 39: a sliding-partition candidate in an outer wall is a window (s038)
R39_SPACE_ROOMS = os.environ.get("AE_R39_SPACE_ROOMS", "1") != "0"   # round 39: a nameless space the strokes enclose, room-sized, against the walls: a room (s038)
R39_SPACE_MIN_M2 = float(os.environ.get("AE_R39_SPACE_MIN_M2", 4.0))
R39_STROKE_ROOMS = os.environ.get("AE_R39_STROKE_ROOMS", "1") != "0"   # round 39: an indoor name outside every room: the strokes around it close it (s028, s037)
R39_BAND_SOLID = os.environ.get("AE_R39_BAND_SOLID", "1") != "0"   # round 39: no picture-band window where the wall runs on unbroken beside the gap (c22's bath ledge)
R39_EXT_NO_WALL = os.environ.get("AE_R39_EXT_NO_WALL", "1") != "0"   # round 39: the outside is looked for beyond a band's face up to the next wall only
R39_LEAVES_OUT = os.environ.get("AE_R39_LEAVES_OUT", "1") != "0"   # round 39: no picture-band window where a leaf hinged in the gap swings into the flat
R39_OCR_FIX = os.environ.get("AE_R39_OCR_FIX", "1") != "0"   # round 39: room words the OCR garbled are read as the word they are a letter or two from
R39_THIN_STROKES = os.environ.get("AE_R39_THIN_STROKES", "0") != "0"   # round 39: the drawn strokes join the thin walls the rooms' sides are traced on, on every plan, not only one with an outdoor name outside the rooms
R39_GUARD = os.environ.get("AE_R39_GUARD", "1") != "0"   # round 39: its reading is kept only if it places every name round 38's placed on its own
R39_STROKE_ROOMS_OUT = os.environ.get("AE_R39_STROKE_ROOMS_OUT", "1") != "0"   # round 39: strokes close a named room only where its floor leaks to the page's edge
R39_JUNCTION_ROOMS = os.environ.get("AE_R39_JUNCTION_ROOMS", "1") != "0"   # round 39: a small nameless face with openings to two rooms is a room (c22's WC), not a sliver
R39_SLIVER_OUT = os.environ.get("AE_R39_SLIVER_OUT", "1") != "0"   # round 39: a room's opening into a sliver open to the outside stays (s038)
R40_CLOSED_NAMES = os.environ.get("AE_R40_CLOSED_NAMES", "1") != "0"   # round 40: a room name in a space the strokes close in, alone there, gets that space (s023's utility)
R40_CLOSED_WALL = float(os.environ.get("AE_R40_CLOSED_WALL", 0.3))   # (the share of such a space's boundary that must be wall mass)
R40_SLIT_K = int(os.environ.get("AE_R40_SLIT_K", 5))
R40_SLITS = os.environ.get("AE_R40_SLITS", "1") != "0"   # round 40: a stroke ending inside a space the strokes close is no side of its room (s023's balcony and kitchen)
R40_GAP_LOCAL = os.environ.get("AE_R40_GAP_LOCAL", "1") != "0"   # round 40: where round 39 / 40's reading adds a gap, its new rooms and windows at that gap are left out and the rest kept
R40_MIXED_ALL = os.environ.get("AE_R40_MIXED_ALL", "0") != "0"   # round 40: the second reading with the thin walls drawn as two lines read as walls, on any plan whose names share a room (s009)
R40_NEEDS_GAIN = os.environ.get("AE_R40_NEEDS_GAIN", "1") != "0"   # round 40: its reading is kept only where it places more names (p02's low-res copy)
R40_CELL_PIECES = os.environ.get("AE_R40_CELL_PIECES", "1") != "0"   # round 40: a network of thin walls drawn as two lines is tested piece by piece (s009)
R40_LEAF_STUBS = os.environ.get("AE_R40_LEAF_STUBS", "1") != "0"   # round 40: a door leaf drawn open against a wall stub the wall mass lost (s054's main bedroom) - the stub is wall
R39_NO_NEW_GAPS = os.environ.get("AE_R39_NO_NEW_GAPS", "1") != "0"   # round 39b: round 39's reading is kept only if it adds no slot or seam to round 38's (app_flaws.py)
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
    """working pixels -> source-image pixels (undo work_scale, the deskew rotation - or the perspective that put a keystoned
    photo straight - and the bold-scan pre-scale)"""
    def __init__(self, m):
        self.ws = float(m.get("work_scale", 1) or 1); self.pre = float(m.get("pre_scale", 1.0) or 1.0)
        self.W0, self.H0 = m.get("source_size", m["size"])
        self.ox, self.oy = m.get("crop_offset", [0, 0])            # the traced part's place on the page
        w, h = (m["page_size"] if m.get("page_size") else [m["size"][0] / self.ws, m["size"][1] / self.ws])   # the image the deskew turned
        ang = math.radians(float(m.get("skew_deg", 0.0) or 0.0))
        # cv2.getRotationMatrix2D(centre, ang): x' = a x + b y + ..., y' = -b x + a y + ...; its inverse turns by -ang
        self.a, self.b, self.cx, self.cy = math.cos(ang), math.sin(ang), w / 2.0, h / 2.0
        self.k = 1.0 / (self.ws * self.pre)                         # length factor working px -> source px
        Hp = m.get("page_homography")                               # (round 30: picture -> straightened page)
        self.Hi = np.linalg.inv(np.array(Hp, dtype=np.float64)) if Hp else None

    def __call__(self, x, y):
        x, y = x / self.ws + self.ox, y / self.ws + self.oy
        if self.Hi is not None:
            q = self.Hi @ np.array([x, y, 1.0])
            x, y = float(q[0] / q[2]), float(q[1] / q[2])
        else:
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
CASEMENT_ROW = os.environ.get("AE_CASEMENT_ROW", "1") != "0"        # leaves in a row on an outer wall: a casement window, never a door
PRIVATE_NO_EXIT = os.environ.get("AE_PRIVATE_NO_EXIT", "1") != "0"  # a bedroom / bath / store / shelter door onto unclaimed space is not placed
SHARED_SPAN = os.environ.get("AE_SHARED_SPAN", "1") != "0"          # one span for an opening both its rooms cut their sides at
FOLD_MIN_MM = float(os.environ.get("AE_FOLD_MIN", 150))             # no folding door is narrower (a scrap of the symbol; 0 = rule off)
PANELS_IN_WALL = os.environ.get("AE_PANELS_IN_WALL", "1") != "0"    # "staggered strokes" must be panels in the wall, else a window
SLIDE_OUT_MIN_MM = float(os.environ.get("AE_SLIDE_OUT_MIN", 2400))  # a sliding "door" to the outside narrower than this is a window (0 = off)
MEET_AT_OPENING = os.environ.get("AE_MEET", "1") != "0"             # two rooms whose sides miss each other by a wall's width meet at their opening
SNAP_CUTS = float(os.environ.get("AE_SNAP_CUTS", 1.5))     # an opening cut this close (px) to a corner on its wall line is cut at the corner: no sub-pixel wall piece for the app to refuse
WELD_CORNERS = float(os.environ.get("AE_WELD_CORNERS", 1.0))   # two rooms' corners this close (px) are one corner: no sub-pixel piece of wall for the app to refuse
SHARED_ENDS = float(os.environ.get("AE_SHARED_ENDS", 3.0))     # the two rooms' ends of one opening's span, 1 - 3 px apart along the wall: one end (round 28)
LAST_CHECK = os.environ.get("AE_LAST_CHECK", "1") != "0"     # the app's geometry rules once more on the outlines as they leave: mend, else withhold (round 29)
APP_REPLAY = os.environ.get("AE_APP_REPLAY", "1") != "0"     # ... and on the walls the app itself builds from them, in whole mm (round 31)
NO_OVERLAP_CUTS = os.environ.get("AE_NO_OVERLAP_CUTS", "1") != "0"   # two openings cut into one side never over the same stretch (round 31)
SCHEMA_CAPS = os.environ.get("AE_SCHEMA_CAPS", "1") != "0"   # the evidence kept within the app's schema limits (round 31)
CLOSE_SLOTS = float(os.environ.get("AE_CLOSE_SLOTS", "1.5"))   # two rooms' walls with an empty strip this many T wide or less between: one wall (round 31; 0 = off)
SLOT_OVERLAP = float(os.environ.get("AE_SLOT_OVERLAP", "0.9"))  # ... where the side carried across faces the other along this share of its length at least
# A slanted piece of a room outline no longer than this many wall widths, between two level / plumb sides, where the
# walls' ink makes a square corner (a cut corner) or a square step (a jog): the square corner or step (round 32; 0 = off)
R39_LONG_CUTS = os.environ.get("AE_R39_LONG_CUTS", "1") != "0"   # round 39: square runs up to 8 wall widths long too (s034's kitchen corner at the refuse chute)
SQUARE_CUTS = float(os.environ.get("AE_SQUARE_CUTS", "8.0" if R39_LONG_CUTS else "2.0"))
# ... where a corner another room has only as a split point of one straight side is cut off by the run, it stays (round 33)
KEEP_SPLITS = os.environ.get("AE_KEEP_SPLITS", "1") != "0"
# ... and a run that dips off a side and comes back to its line through a short level / plumb side closes (round 33)
DIPS = os.environ.get("AE_DIPS", "1") != "0"
WITHHELD_DOORS = os.environ.get("AE_WITHHELD_DOORS", "1") != "0"   # a door into a room withheld as illegal geometry is found, not placed: not a way out (round 30)
ONE_WAY_IN = os.environ.get("AE_ONE_WAY_IN", "1") != "0"   # one entrance per flat; no door from a balcony / ledge / yard to the outside (round 30)
BEDROOM_PAIRS = os.environ.get("AE_BEDROOM_PAIRS", "1") != "0"   # no door between two bedrooms: one of them took in the passage (round 30)
LEDGE_NO_DOOR = os.environ.get("AE_LEDGE_NO_DOOR", "1") != "0"   # an air-con ledge is reached through a window, never a door (round 30)
ONE_DOOR_SMALL = os.environ.get("AE_ONE_DOOR_SMALL", "1") != "0"   # a bath, store or shelter has one door from any one room (round 30)
V_STROKES = os.environ.get("AE_V_STROKES", "1") != "0"   # on a restored picture, a folding door's V is drawn along its legs, not crossed by other lines (round 30)
DIM_SCRAPS = os.environ.get("AE_DIM_SCRAPS", "1") != "0"           # a stroke in line with a dimension line, and a partition cut from one, are that line's own scraps
PASSAGE_WIDE = os.environ.get("AE_PASSAGE_WIDE", "1") != "0"       # two wall ends facing each other up to 2 m apart are a doorway (else 1.5 m)
PASSAGE_MAX_MM = float(os.environ.get("AE_PASSAGE_MAX", 2000 if PASSAGE_WIDE else 1500))
PANEL_PAIR = os.environ.get("AE_PANEL_PAIR", "1") != "0"           # two staggered strokes a panel's width apart along a long gap: a sliding partition, kept only between two named rooms
PANEL_PAIR_COVER = float(os.environ.get("AE_PANEL_PAIR_COVER", 0.7))   # ... together running along at least this share of the gap


def mixed_partition_cells(m, gray, known):
    """Round 28 (AE_MIXED): many HDB sheets shade only the structural walls and columns black and draw every other wall
    as two thin lines with paper between.  Such a plan is "filled" (more than a square metre of fill), so the outline
    cells are not looked for, and its thin walls never become wall mass: the rooms behind them do not close (23 of the 55
    filled dev s-plans).  Outline cells on filled plans were tried once and cost more than they gave: beds, pillows,
    wardrobe hatching and basins are narrow paper cells too.  So only paper cells shaped like walls are kept: 45 - 300
    mm wide, made of straight level and plumb runs at least 600 mm long (one cell can be a whole network of partitions),
    not lettering, a window band or a dimension strip, not IN a wall line between two walls (a window), and joined at
    an end to the black walls - or to a thin wall already kept, so a run of partitions is followed out from the
    structure.  And they are read only where the plain reading needs them, and kept only where they help: see
    build_best."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = gray.shape
    thr = min(235, int(m.get("ink_threshold", 180)) + 20)
    ink = gray < thr
    free = (~ink).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    out = np.zeros((H, W), np.uint8)
    if n < 3:
        return out
    dt = cv2.distanceTransform(free, cv2.DIST_L2, 3)
    maxdt = np.zeros(n, np.float32)
    np.maximum.at(maxdt, lab.ravel(), dt.ravel())
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
    cands = []
    if R40_CELL_PIECES:                                      # (round 40: the strip beside the wall mass, see below)
        beside_ = cv2.dilate((known > 0).astype(np.uint8), np.ones((2 * int(max(3, 0.5 * T)) + 1,) * 2, np.uint8)) > 0
    for i in range(1, n):
        x, y, w, h, area = st[i]
        width = 2.0 * float(maxdt[i])
        if not (45.0 <= width * mm <= 300.0) or area < 6:
            continue
        horiz = w >= h
        if max(w, h) * mm < MIXED_MIN_MM:
            continue
        cell = lab[y:y + h, x:x + w] == i
        # made of straight level and plumb runs, each a thin wall piece long (a network of thin walls is one cell; a
        # triangle of hatching, a pillow or a basin is not straight anywhere)
        Lr = max(3, int(MIXED_MIN_MM / mm))
        c8 = cell.astype(np.uint8)
        hr_ = cv2.morphologyEx(c8, cv2.MORPH_OPEN, np.ones((1, Lr), np.uint8)) if w >= Lr else np.zeros_like(c8)
        vr_ = cv2.morphologyEx(c8, cv2.MORPH_OPEN, np.ones((Lr, 1), np.uint8)) if h >= Lr else np.zeros_like(c8)
        runs = cv2.bitwise_or(hr_, vr_)
        share_ = float(runs.sum()) / max(1.0, float(c8.sum()))
        network = R40_CELL_PIECES and ((w >= Lr and h >= Lr) or share_ >= 0.5)   # (a stub widening where it meets a band: s009)
        if float(runs.sum()) < MIXED_RECT * float(c8.sum()) and not network:
            continue
        pieces = [(x, y, w, h, cell, horiz)]
        if network:
            # round 40: a network of thin walls - a partition with a stub off it, a stub against a window band (s009's
            # bedroom) - is tested piece by piece: each straight run on its own, with its own two ends
            pieces = []
            for rr_, hz_ in ((hr_, True), (vr_, False)):
                n2_, lab2_, st2_, _c2 = cv2.connectedComponentsWithStats(rr_, connectivity=4)
                for j_ in range(1, n2_):
                    x2_, y2_, w2_, h2_, _a2 = st2_[j_]
                    if max(w2_, h2_) * mm >= MIXED_MIN_MM:
                        pieces.append((x + x2_, y + y2_, w2_, h2_, lab2_[y2_:y2_ + h2_, x2_:x2_ + w2_] == j_, hz_))
        for x, y, w, h, cell, horiz in pieces:
            if veto[y:y + h, x:x + w][cell].mean() > 0.3 or bands[y:y + h, x:x + w][cell].mean() > 0.3:
                continue
            if R40_CELL_PIECES and _box_near_gap(m, x, y, x + w, y + h):
                continue                                     # (round 40's local retry: left out where it made a gap)
            if network and beside_[y:y + h, x:x + w][cell].mean() > 0.5:
                continue                                     # (round 40: a piece running along a wall's face - a window's
                #  frame, a lining - would thicken that wall and move its face: s019's outer walls, 6175 built as 6416)
            ring = cv2.dilate(cell.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~cell
            if ring.any() and dimk[y:y + h, x:x + w][ring].mean() > 0.3:
                continue
            ys_, xs_ = np.nonzero(cell)
            cmid = int(y + ys_.mean()) if horiz else int(x + xs_.mean())
            pad = int(0.6 * T) + 4
            if horiz:
                e0 = known[max(0, cmid - 2):cmid + 3, max(0, x - pad):x].any(); e1 = known[max(0, cmid - 2):cmid + 3, x + w:x + w + pad].any()
            else:
                e0 = known[max(0, y - pad):y, max(0, cmid - 2):cmid + 3].any(); e1 = known[y + h:y + h + pad, max(0, cmid - 2):cmid + 3].any()
            if e0 and e1:
                continue                                     # IN a wall line between two walls: a window or a parapet
            cands.append((i, x, y, w, h, cell, horiz))
    # joined at an end to the black walls, or to a thin wall already kept
    reach = int(max(4, 0.6 * T))
    acc = known > 0
    if R40_CELL_PIECES:                                      # (round 40: a stub may stand on a window band, or on the long
        acc = acc | (bands > 0)                              #  line of an outer wall drawn as strokes - s009's bedroom)
        for l in m["lines"]:
            if l.get("role") not in ("dimension", "extension") and (l["b"] - l["a"]) * mm >= 1500:
                p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
                ln_ = np.zeros((H, W), np.uint8)
                cv2.line(ln_, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), 1, 3)
                acc |= ln_ > 0
    changed = True
    kept = 0
    while changed and cands:
        changed = False
        accd = cv2.dilate(acc.astype(np.uint8), np.ones((2 * reach + 1, 2 * reach + 1), np.uint8)) > 0
        for item in list(cands):
            i, x, y, w, h, cell, horiz = item
            if horiz:
                ends = (accd[y:y + h, max(0, x - 1)].any(), accd[y:y + h, min(W - 1, x + w)].any())
            else:
                ends = (accd[max(0, y - 1), x:x + w].any(), accd[min(H - 1, y + h), x:x + w].any())
            if ends[0] or ends[1]:
                out[y:y + h, x:x + w][cell] = 255
                acc[y:y + h, x:x + w] |= cell
                cands.remove(item); changed = True; kept += 1
    m["_mixed_cells"] = kept
    grown = cv2.dilate(out, np.ones((7, 7), np.uint8))
    out[(grown > 0) & ink] = 255                             # the outlines belong to the wall
    return out


MIXED_MIN_MM = float(os.environ.get("AE_MIXED_MIN", 600))      # a thin wall piece at least this long
MIXED_RECT = float(os.environ.get("AE_MIXED_RECT", 0.85))      # ... made of straight runs over this share of it
MIXED_NEW_OUT = os.environ.get("AE_MIXED_NEW_OUT", "wall")     # "keep": doors onto unclaimed space that only the thin-wall reading finds are kept


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
WIDE_STROKE_PASSAGE = os.environ.get("AE_WIDE_STROKE_PASSAGE", "1") != "0"   # "one stroke from jamb to jamb" up to 4 m (3.6 m before round 19: p03's balcony door is 3.7 m at the pseudo scale)
STROKE_PASSAGE_MM = float(os.environ.get("AE_STROKE_PASSAGE", 4000 if WIDE_STROKE_PASSAGE else 3600))
THRESHOLD_DOOR = os.environ.get("AE_THRESHOLD_DOOR", "1") != "0"   # a gap with only the wall's face lines across it and a swing drawn from a jamb is a door, not a window
SWING_SEARCH = os.environ.get("AE_SWING_SEARCH", "1") != "0"   # the pale / dashed swing arc looked for a leaf's thickness in from the jamb and over more radii, with its leaf
GLASS_BAND = os.environ.get("AE_GLASS_BAND", "1") != "0"   # a window drawn as glass in a thin wall: the stretch between two face lines filled dark - solid, grey or dashed (the louvres of HDB baths and kitchens)
HATCH_RAILS = os.environ.get("AE_HATCH_RAILS", "1") != "0"   # on a hatched plan, a window's rails (three or more parallel strokes a hatch spacing apart) close up solid like hatching: not wall
SILL_PASSAGE = os.environ.get("AE_SILL_PASSAGE", "1") != "0"   # a doorway between a named indoor room and the outside is a window: the way out of a flat is its entrance door
GLASS_MIN_MM = float(os.environ.get("AE_GLASS_MIN", 450)); GLASS_DROP = float(os.environ.get("AE_GLASS_DROP", 60))
PALE_PEN_MIN = 70        # darkest tenth of a piece's ink paler than this grey: furniture pen (None = rule off)
HATCH_INK_MIN = 0.0    # 0 = off. 0.03 removes headboard / sofa-back false walls on d12 but loses the d12 service yard and d11 ledge (2026-09-21)


def _rail_bands(m, mm):
    """rectangles (x0, y0, x1, y1) of three or more parallel strokes of one length (overlap 75 %), 450 mm or longer, within
    380 mm across - a window drawn as rails (window_bundles wants 85 %: a rail drawn a little short of the others)"""
    lines = [l for l in m["lines"] if l.get("role") not in ("dimension", "extension", "door-leaf") and (l["b"] - l["a"]) * mm >= 450]
    rects = []
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
                if ov >= 0.75 * max(q["b"] - q["a"], l["b"] - l["a"]):
                    grp.append(j)
            if len(grp) >= 3:
                used.update(grp)
                a = min(ls[j]["a"] for j in grp); b = max(ls[j]["b"] for j in grp)
                lo, hi = ls[grp[0]]["c"] - 1, ls[grp[-1]]["c"] + 1
                rects.append((int(a), int(lo), int(math.ceil(b)), int(math.ceil(hi))) if o == "h" else (int(lo), int(a), int(math.ceil(hi)), int(math.ceil(b))))
    return rects


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
    # A window's rails - three or more parallel strokes of one length a hatch spacing apart, between two wall ends - close
    # up solid like hatching too (d12's bath windows, 10 px apart on a plan hatched at 7): what they enclose is not wall.
    if HATCH_RAILS:
        for x0, y0, x1, y1 in _rail_bands(m, mm):
            out[y0:y1 + 1, x0:x1 + 1] = k[y0:y1 + 1, x0:x1 + 1]
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



def leaf_stubs(m, k, unhosted):
    """Round 40: a door whose leaf is drawn open flat against a short wall (s054's main bedroom: the leaf lies along the
    stub between the door and the bedroom's side wall).  The stub and the leaf are one strip of strokes, and stage 1 kept
    neither as wall, so the hinge stands in free floor, no gap has a jamb there and the room runs out through the
    doorway.  A swing is read so when its hinge is off the wall mass, one of its radii (the leaf, open) runs along ink
    and ends at the wall mass, and the other (the leaf, closed) crosses free floor and ends at the wall mass too: the
    first radius is then a wall - as thick as the strip of strokes along it - and the doorway is the second.  Only plain
    quarter swings of a door's size (500 - 1300 mm), level or plumb."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = k.shape
    gray = m.get("_work_gray")
    if gray is None:
        return None
    ink = gray < min(235, int(m.get("ink_threshold", 180)) + 20)
    kb = k > 0
    dk = cv2.distanceTransform((~kb).astype(np.uint8), cv2.DIST_L2, 3)
    R = 0.9 * T + 2
    out = np.zeros_like(k); n = 0
    for i in unhosted:
        a_ = m["arcs"][i]
        if a_.get("from") == "curve" or abs(a_["span"] - 90) > 1 or not (500 <= a_["r"] * mm <= 1300):
            continue
        hx, hy, r = float(a_["cx"]), float(a_["cy"]), float(a_["r"])
        if not (0 < hx < W - 1 and 0 < hy < H - 1):
            continue
        if dk[int(hy), int(hx)] <= R:
            continue                                         # the hinge is at the wall: not this case
        rad = []
        for t in (a_["start"], a_["start"] + a_["span"]):
            if abs(((t + 45) % 90) - 45) > 3:
                break                                        # level or plumb leaves only
            ux, uy = round(math.cos(math.radians(t))), round(math.sin(math.radians(t)))
            ex, ey = hx + r * ux, hy + r * uy
            if not (0 <= ex < W and 0 <= ey < H):
                break
            nn = max(5, int(r))
            ts = np.linspace(0.15, 0.85, nn)
            xs = np.clip(np.rint(hx + ts * r * ux).astype(int), 0, W - 1); ys = np.clip(np.rint(hy + ts * r * uy).astype(int), 0, H - 1)
            rad.append(dict(u=(ux, uy), e=(ex, ey), ink=float(ink[ys, xs].mean()), wall=float(kb[ys, xs].mean()),
                            dm=float(dk[int(ey), int(ex)]), xs=xs, ys=ys))
        if len(rad) != 2:
            continue
        lean = [q for q in rad if q["ink"] >= 0.8 and q["wall"] < 0.2]
        free = [q for q in rad if q["ink"] <= 0.3 and q["wall"] == 0.0]
        if len(lean) != 1 or len(free) != 1 or lean[0]["dm"] > R or free[0]["dm"] > R:
            continue
        q = lean[0]; ux, uy = q["u"]
        # the strip of strokes along the leaf: across it, the ink nearest the radius on either side, up to a wall's width
        span = int(0.8 * T)
        offs = []
        for x_, y_ in zip(q["xs"][::3], q["ys"][::3]):
            got = [d for d in range(-span, span + 1) if 0 <= x_ + d * abs(uy) < W and 0 <= y_ + d * abs(ux) < H and ink[y_ + d * abs(ux), x_ + d * abs(uy)]]
            if got:
                offs.append((min(got), max(got)))
        if len(offs) < 3:
            continue
        lo = int(np.median([o_[0] for o_ in offs])); hi = int(np.median([o_[1] for o_ in offs]))
        if hi - lo + 1 > T or hi - lo + 1 < 2:
            continue
        # from a little behind the hinge (so the doorway's line runs into it) to the wall mass past the leaf's end
        back = int(0.3 * T) + 2; fwd = int(r + q["dm"] + 2)
        p0 = (hx - back * ux, hy - back * uy); p1 = (hx + fwd * ux, hy + fwd * uy)
        if ux != 0:
            x0, x1 = sorted((p0[0], p1[0])); y0, y1 = hy + lo, hy + hi
        else:
            y0, y1 = sorted((p0[1], p1[1])); x0, x1 = hx + lo, hx + hi
        if _box_near_gap(m, x0, y0, x1, y1):
            continue                                         # (round 40's local retry: left out where it made a gap)
        out[max(0, int(y0)):int(y1) + 1, max(0, int(x0)):int(x1) + 1] = 255
        n += 1
    m["_leaf_stubs"] = n
    return out if n else None

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

def _ink_cover(gray, k, pts, thr, text=None, with_skip=False):
    """share of the sample points with ink within 2 px, and the share lying in wall mass or lettering (with_skip: and the
    share under lettering, which tells nothing either way)"""
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
    if with_skip:
        return (ink / tot if tot else 0.0), (hit / tot if tot else 0.0), skipped / max(1, len(pts))
    if skipped > 0.4 * max(1, len(pts)):
        return 0.0, 1.0
    return (ink / tot if tot else 0.0), (hit / tot if tot else 1.0)


def _v_crossed(gray, k, P, jambs, apex, face, thr, text, off=10.0):
    """On a restored picture every line is blurred wide and sharpened back, so a chance path across a kitchen counter, a
    sink and a dashed box finds ink at nearly every crossing: a V "read" there (c21 soft, round 30).  The legs of a real V
    are drawn along the legs - the paths 10 px to either side of each leg are clear; across other lines they are as inked
    as the leg itself.  True when a leg's side paths carry ink on more than 0.3 of their length."""
    for j in jambs:
        da_, dc_ = apex[0] - j, apex[1] - face
        ln_ = math.hypot(da_, dc_) or 1.0
        na_, nc_ = -dc_ / ln_, da_ / ln_
        for d_ in (off, -off):
            pts = [P(j + da_ * t + na_ * d_, face + dc_ * t + nc_ * d_) for t in np.linspace(0.12, 0.92, 24)]
            if _ink_cover(gray, k, pts, thr, text)[0] > 0.3:
                return True
    return False


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
                        if max(beyond) <= 0.25 and _ink_cover(gray, k, inner, thr, text)[0] <= 0.15 and \
                                not (V_STROKES and m.get("restored") and _v_crossed(gray, k, P, (u0, u1), apex, c + sgn * half, thr, text)):
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
    # The search: the hinge sits on the jamb, or a leaf's thickness in from it (the leaf drawn as a thin rectangle standing
    # on the jamb, its hinge on the rectangle's far rail - p05), and the radius is the leaf's length, 0.65 - 1.15 of the gap
    # (the main leaf of an unequal double door is about 0.7 of it).  Three radii on the jamb itself before round 19.
    offsets = (0.0, -0.05, 0.05, -0.1, 0.1) if SWING_SEARCH else (0.0,)
    radii = np.arange(0.65, 1.151, 0.05) if SWING_SEARCH else (0.85, 0.95, 1.05)
    for hinge, j0, along in (("start", a, 1.0), ("end", b, -1.0)):
        for sgn in (-1, 1):
            if ctrl[sgn] > 0.25:
                continue
            for off in offsets:
                j = j0 + along * off * L
                for rf in radii:
                    if SWING_SEARCH and off + float(rf) > 1.1:
                        continue                             # a leaf is no longer than its opening: the arc lands at the far jamb or short of it (h2)
                    r = float(rf) * L
                    pts = [P(j + along * r * math.cos(th), c + sgn * half + sgn * r * math.sin(th)) for th in np.radians(np.linspace(10, 82, 36))]
                    cv, ht = _ink_cover(gray, k, pts, thr, text)
                    # an L of two straight lines covers the ends of an arc, not its middle - unless the middle lies under
                    # the room's label (a small bathroom, p05's BATH 1): then the leaf must vouch for it
                    mid_cv, _mh, mid_skip = _ink_cover(gray, k, pts[12:24], thr, text, with_skip=True)
                    mid_under_text = SWING_SEARCH and mid_skip > 0.4
                    # the leaf: a line from the hinge out to the arc's far end (on the hinge, or a leaf's thickness either side of it)
                    lv = 0.0
                    for loff in ((0.0, -0.05, 0.05, -0.1, 0.1) if SWING_SEARCH else (0.0,)):
                        leaf = [P(j + along * loff * L, c + sgn * half + sgn * r * t) for t in np.linspace(0.2, 0.9, 12)]
                        lv_ = _ink_cover(gray, k, leaf, thr, text)[0]
                        if SWING_SEARCH and lv_ >= 0.6:
                            # the leaf ends where the arc starts; a line that runs on past it is the edge of a wardrobe
                            # or a counter standing against the jamb (d12), or the jamb wall's own face, not a leaf
                            on_ = [P(j + along * loff * L, c + sgn * half + sgn * r * t) for t in np.linspace(1.12, 1.5, 10)]
                            if _ink_cover(gray, k, on_, thr, text, with_skip=True)[0] > 0.2:
                                lv_ = 0.0
                        lv = max(lv, lv_)
                    # (a dash-dot arc, p05's entrance, can leave the middle third nearly bare: with its leaf drawn solid a
                    #  middle of 0.15 will do)
                    if mid_cv < 0.35 and not mid_under_text and not (SWING_SEARCH and lv >= 0.8 and mid_cv >= 0.15):
                        continue
                    sc = cv + 0.3 * lv
                    # (an arc read off the jamb, a dashed one, or one under the label, is taken only with its leaf drawn: a
                    #  chair back or a basin rim can cover a quarter circle, but not with a straight line from its centre
                    #  to the wall; with a solid leaf a dashed arc needs to cover only 0.4)
                    if SWING_SEARCH and (off != 0.0 or cv < 0.7 or mid_under_text) and lv < 0.6:
                        continue
                    need = 0.4 if (SWING_SEARCH and lv >= 0.8) else 0.5
                    if not (cv >= need and cv >= ctrl[sgn] + 0.3 and ht <= 0.15 and (best is None or sc > best[-1])):
                        continue
                    if SWING_SEARCH:
                        # an arc is ink at its radius and paper on either side of it; a bed's folded corner or a wardrobe's
                        # edge across the square covers the middle third at every radius (d12, c22)
                        ring = []
                        for rr in (r * 0.9, r * 1.1):
                            pr = [P(j + along * rr * math.cos(th), c + sgn * half + sgn * rr * math.sin(th)) for th in np.radians(np.linspace(30, 62, 12))]
                            ring.append(_ink_cover(gray, k, pr, thr, text, with_skip=True)[0])
                        if max(ring) > 0.35:
                            continue
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




def _exterior(m, k):
    """round 39: the page outside the flat - paper connected to the page's edge in the picture's own ink (dimension and
    extension lines taken out) with the wall mass: a window stage 1 read only in pieces still closes its room here"""
    if m.get("_ext_mask") is not None:
        return m["_ext_mask"]
    H, W = k.shape
    gray = m.get("_work_gray")
    if gray is None:
        return np.zeros((H, W), bool)
    ink = (gray < int(m.get("ink_threshold") or 180)).astype(np.uint8) * 255
    for l in m["lines"]:
        if l.get("role") not in ("dimension", "extension"):
            continue
        p0, p1 = ((l["a"], l["c"]), (l["b"], l["c"])) if l["o"] == "h" else ((l["c"], l["a"]), (l["c"], l["b"]))
        cv2.line(ink, (int(round(p0[0])), int(round(p0[1]))), (int(round(p1[0])), int(round(p1[1]))), 0, int(max(3, 2 * l.get("t", 2) + 2)))
    s_ = cv2.bitwise_or(ink, (k > 0).astype(np.uint8) * 255)
    s_ = cv2.morphologyEx(s_, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    free = (s_ == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(free, connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    ext = np.isin(lab, list(edge))
    m["_ext_mask"] = ext
    return ext


def _swing_side(a_, o, c):
    """round 39: the side of a wall line at c that an arc swings to (-1 or 1)"""
    t_ = math.radians(a_["start"] + a_["span"] / 2.0)
    v_ = (a_["cy"] + a_.get("r", a_.get("ry", 0)) * math.sin(t_)) if o == "h" else (a_["cx"] + a_.get("r", a_.get("rx", 0)) * math.cos(t_))
    return 1 if v_ > c else -1


def _exterior_side(m, k, o, lo, hi, a, b, T, mm):
    """round 39: -1 or 1 when the outside of the flat lies beyond the band's low or high face along most of the gap (and
    not beyond the other face), else None"""
    ext = _exterior(m, k)
    H, W = ext.shape
    far = max(int(2000.0 / mm), int(2 * T))
    found = []
    for sgn, face in ((-1, lo), (1, hi)):
        hits = n = 0
        for f in (0.2, 0.35, 0.5, 0.65, 0.8):
            t_ = a + f * (b - a); n += 1; run_k = 0
            for d in range(2, far, 2):
                v = face + sgn * d
                x, y = (int(round(t_)), int(round(v))) if o == "h" else (int(round(v)), int(round(t_)))
                if not (0 <= x < W and 0 <= y < H):
                    break
                if ext[y, x]:
                    hits += 1; break
                if R39_EXT_NO_WALL and d > 0.6 * T:
                    # (not through a wall - a counter, a stair, a bath against the outer wall - but through a thin line
                    #  the wall mass took: a ledge's parapet, a railing - c23's, s056's and s076's windows)
                    run_k = run_k + 2 if k[y, x] else 0
                    if run_k >= 0.75 * T:
                        break
        found.append(hits / float(n))
    if found[0] >= 0.6 and found[1] < 0.2:
        return -1
    if found[1] >= 0.6 and found[0] < 0.2:
        return 1
    return None


def _wall_through_band(k, gray, o, lo, hi, a, b, T, thr):
    """round 39: whether the wall mass runs on unbroken through a gap's band, so that the strokes read there are a wall
    and not a window: a run of wall mass along the whole gap (80 % of its length at each offset) thicker than a wall
    (a wall drawn in outline, filled in - p02's and p03's photographs), covering the band (s046), or one wall-thick run
    over solid ink beside a thin stroke (c22's and room4's baths: the outer wall past the ledge behind the WC).  The
    window lines a filled plan draws bold are two runs (s053) and stay a window."""
    H, W = k.shape
    p0, p1 = max(0, int(math.floor(lo))), int(math.ceil(hi))
    a0, b0 = max(0, int(a)), int(b)
    sub = k[a0:min(H, b0), p0:min(W, p1 + 1)] if o == "v" else k[p0:min(H, p1 + 1), a0:min(W, b0)].T
    if sub.size == 0:
        return False
    share = (sub > 0).mean(0)
    runs, cur = [], None
    for i_, v_ in enumerate(share):
        if v_ >= 0.8:
            cur = [i_, i_] if cur is None else [cur[0], i_]
        elif cur is not None:
            runs.append(cur); cur = None
    if cur is not None:
        runs.append(cur)
    if not runs:
        return False
    widths = [r_[1] - r_[0] + 1 for r_ in runs]
    if max(widths) >= 1.2 * T or sum(widths) >= 0.8 * len(share):
        return True
    thick = [r_ for r_, w_ in zip(runs, widths) if w_ >= 0.7 * T]
    if len(runs) == 1 and thick:
        g_ = gray[a0:min(H, b0), p0:min(W, p1 + 1)] if o == "v" else gray[p0:min(H, p1 + 1), a0:min(W, b0)].T
        r_ = thick[0]
        if g_.size and float((g_[:, r_[0]:r_[1] + 1] < thr).mean()) >= 0.85:
            return True
    return False


def _picture_band(gray, o, lo, hi, a, b, T, thr):
    """round 39: the share of the stations along a gap where the picture shows two or more separate strokes across the
    wall's thickness (lo - hi, a little either side) and is not solid ink there"""
    H, W = gray.shape
    p0, p1 = int(math.floor(lo - 0.3 * T)), int(math.ceil(hi + 0.3 * T))
    n = hit = 0
    for t_ in range(int(a) + 2, int(b) - 1, 2):
        if o == "h":
            if not (0 <= t_ < W):
                continue
            prof = gray[max(0, p0):min(H, p1 + 1), t_]
        else:
            if not (0 <= t_ < H):
                continue
            prof = gray[t_, max(0, p0):min(W, p1 + 1)]
        if prof.size < 4:
            continue
        n += 1
        dark = prof < thr
        runs = _runs(dark)
        if len(runs) >= 2 and dark.mean() <= 0.55:
            hit += 1
    return hit / float(n) if n else 0.0


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
            # Only the wall's own face lines run across the gap (a threshold drawn at both faces, p05's entrance), nothing
            # in the thickness: no window band - a door's width with a swing drawn from a jamb is a door
            on_faces = all(min(abs(l["c"] - lo_), abs(l["c"] - hi_)) <= 0.25 * T for l in inside)   # (a threshold drawn as a double line, 5 px in from the face, is on the face)
            if THRESHOLD_DOOR and on_faces and 550 <= L * mm <= 1500 and (_end_face(k, o, c, a - 2, T) or _end_face(k, o, c, b_ + 1, T)):
                dd = drawn_door(m, k, g, T)
                if dd and dd[0] == "swing":
                    m["_threshold_doors"] = m.get("_threshold_doors", 0) + 1
                    out.append(dict(g, kind="door", operation="swing", hinge=dd[1], swing_side=dd[2], leaf_px=float(L), confidence=0.7, why="a swing drawn from a jamb, the threshold at both faces")); continue
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
                m["_drawn_swings"] = m.get("_drawn_swings", 0) + 1
                out.append(dict(g, kind="door", operation="swing", hinge=dd[1], swing_side=dd[2], leaf_px=float(L), confidence=0.7, why="pale or dashed swing arc")); continue
        # round 39: a window whose strokes stage 1 read only in pieces (the leaves of a casement window hinge on them -
        # s037's main bedroom, s038's bedrooms - or a sill runs through from jamb to jamb past the frames - s028): read
        # in the picture, two or more strokes across the wall's thickness along most of the gap, no swing hinged in it
        hinged_in = [a_ for a_ in arcs if a_.get("from") != "curve" and abs(((a_["cy"] if o == "h" else a_["cx"])) - c) <= band + T
                     and a + 0.5 * T < (a_["cx"] if o == "h" else a_["cy"]) < b_ - 0.5 * T]
        # (one swing hinged inside the gap is a door standing in it; two or more in a row are the leaves of a casement window)
        ext_side = None
        near_gap_ = m.get("_gap_pts") and any(_near_gap(m, *((t_, c) if o == "h" else (c, t_))) for t_ in np.linspace(a, b_, 9))
        if R39_PICTURE_BAND and 400 <= L * mm <= 6500 and m.get("_work_gray") is not None and len(hinged_in) != 1 and not near_gap_:
            ext_side = _exterior_side(m, k, o, g.get("lo", c - T / 2.0), g.get("hi", c + T / 2.0), a, b_, T, mm)
            # (a casement window's leaves swing out of the flat: a leaf swinging into it is a door - s028's kitchen wall,
            #  its WC's and bath's doors hinged on it)
            if ext_side is not None and R39_LEAVES_OUT and any(_swing_side(a_, o, c) != ext_side for a_ in hinged_in):
                ext_side = None
        if ext_side is not None:
            pb = _picture_band(m["_work_gray"], o, g.get("lo", c - T / 2.0), g.get("hi", c + T / 2.0), a, b_, T, int(m.get("ink_threshold") or 180))
            if R39_BAND_SOLID and pb >= R39_BAND_COVER and _wall_through_band(k, m["_work_gray"], o, g.get("lo", c - T / 2.0), g.get("hi", c + T / 2.0), a, b_, T, int(m.get("ink_threshold") or 180)):
                m["_picture_bands_solid"] = m.get("_picture_bands_solid", 0) + 1
                pb = 0.0
            if pb >= R39_BAND_COVER:
                m["_picture_bands"] = m.get("_picture_bands", 0) + 1
                out.append(dict(g, kind="window", operation="fixed", hinge="none", swing_side=0, confidence=0.6, picture_band=round(pb, 2),
                                why="two or more strokes across the wall's thickness along the gap, read in the picture: a window")); continue
        if len(inside) == 1 and L * mm <= STROKE_PASSAGE_MM and one_end and abs(inside[0]["c"] - c) <= band:
            # (wider than 3.6 m - p03's balcony door - only between two rooms, decided once the rooms are made: a stroke
            #  between two wall ends in the page's margin is no doorway)
            out.append(dict(g, kind="open_passage", operation="open", hinge="none", swing_side=0, confidence=0.55, wide_stroke=bool(L * mm > 3600), why="one stroke from jamb to jamb")); continue
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


def glass_bands(m, gray, k, openings):
    """A window drawn as glass IN a thin wall: two face lines with paper between them, and the window the stretch between
    them filled dark - solid, grey or dashed (the louvre windows of HDB baths and kitchens, a pane in a bedroom's
    partition).  Read along every thin wall stage 1 kept as a partition, on the work image: the middle of the band is
    paper (or an even grey, where the faces blur together) along the wall and dark along the glass; the glass is no
    thicker than the wall (the dark run across the band does not run on past either face: a thicker wall on the same
    line, or a wall crossing it, is not glass); and the wall runs on hollow at one end at least - or the glass is drawn
    as dashes, which no solid wall is.  Returned as windows in the wall mass (nothing moves: the band stays wall for
    the rooms, and the window is cut into the sides that run along it)."""
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = gray.shape
    groups = []
    for p in m.get("partitions", []):
        g = next((g_ for g_ in groups if g_["o"] == p["o"] and abs(g_["c0"] - p["c0"]) <= 3 and abs(g_["c1"] - p["c1"]) <= 3), None)
        if g is None:
            groups.append({"o": p["o"], "c0": p["c0"], "c1": p["c1"], "ranges": [(p["a"], p["b"])]})
        else:
            g["ranges"].append((p["a"], p["b"]))
    texts = [t["box"] for t in m["texts"] + m.get("unread_text", [])]
    dims = [l for l in m["lines"] if l.get("role") == "dimension"]
    out = []
    for g in groups:
        o = g["o"]; c0, c1 = g["c0"], g["c1"]; th = c1 - c0
        if th < 4 or th > 0.9 * T:
            continue
        ga, gb = min(a for a, b in g["ranges"]), max(b for a, b in g["ranges"])
        if any(d["o"] == o and (abs(d["c"] - c0) <= 2 or abs(d["c"] - c1) <= 2) and max(d["a"], ga) - min(d["b"], gb) <= 2 * T for d in dims):
            continue                                         # (a face on a dimension line's own line: the chain's ticks and scraps, not a wall)
        cm = int(round((c0 + c1) / 2.0)); ic0, ic1 = int(round(c0)), int(round(c1))
        N = W if o == "h" else H
        if ic0 - 1 < 0 or ic1 + 1 >= (H if o == "h" else W):
            continue
        def col(u):                                          # mass across the band at u
            return (k[ic0:ic1 + 1, u] if o == "h" else k[u, ic0:ic1 + 1])
        lo_u, hi_u = int(min(a for a, b in g["ranges"])), int(math.ceil(max(b for a, b in g["ranges"])))
        for _ in range(int(6 * T)):                           # the line runs on through wall mass of the band's own thickness (a dark band stage 1 kept as wall)
            if lo_u - 1 >= 0 and float((col(lo_u - 1) > 0).mean()) >= 0.5:
                lo_u -= 1
            else:
                break
        for _ in range(int(6 * T)):
            if hi_u + 1 < N and float((col(hi_u + 1) > 0).mean()) >= 0.5:
                hi_u += 1
            else:
                break
        e0, e1 = int(max(0, lo_u - 1.5 * T)), int(min(N - 1, hi_u + 1.5 * T))
        if o == "h":
            mid = gray[cm - 1:cm + 2, e0:e1 + 1].max(axis=0)
            f0 = gray[ic0 - 1:ic0 + 2, e0:e1 + 1].min(axis=0); f1 = gray[ic1 - 1:ic1 + 2, e0:e1 + 1].min(axis=0)
            strip = gray[:, e0:e1 + 1]
            mass = (k[ic0:ic1 + 1, e0:e1 + 1] > 0).mean(axis=0)
        else:
            mid = gray[e0:e1 + 1, cm - 1:cm + 2].max(axis=1)
            f0 = gray[e0:e1 + 1, ic0 - 1:ic0 + 2].min(axis=1); f1 = gray[e0:e1 + 1, ic1 - 1:ic1 + 2].min(axis=1)
            strip = gray[e0:e1 + 1, :].T
            mass = (k[e0:e1 + 1, ic0:ic1 + 1] > 0).mean(axis=1)
        inside = np.zeros(len(mid), bool); inside[lo_u - e0:hi_u - e0 + 1] = True
        if inside.sum() < 3:
            continue
        hollow_level = float(np.percentile(mid[inside], 90))
        dark_thr = min(170.0, hollow_level - GLASS_DROP)
        faces = (f0 < 170) & (f1 < 170)
        # ink running on past either face (the dark run across the band, followed outward): a thicker wall on the same
        # line, or a wall crossing it - not a pane between two faces
        R = int(T) + 1; dk = strip < 150
        up = np.zeros(strip.shape[1], int); alive = np.ones(strip.shape[1], bool)
        for r in range(ic0 - 1, max(-1, ic0 - R - 1), -1):
            alive &= dk[r]; up += alive
        down = np.zeros(strip.shape[1], int); alive = np.ones(strip.shape[1], bool)
        for r in range(ic1 + 1, min(strip.shape[0], ic1 + R + 1)):
            alive &= dk[r]; down += alive
        thick = (up > 4) | (down > 4)
        # (a fixture's outline running into the wall is a stroke wide; a wall is wider than a third of T)
        wide_ = max(3, int(0.3 * T))
        thick = cv2.morphologyEx(thick.astype(np.uint8).reshape(1, -1), cv2.MORPH_OPEN, np.ones((1, wide_), np.uint8))[0] > 0
        is_dark = (mid < dark_thr) & ~thick & inside
        hollow = (mid >= hollow_level - 25) & faces
        gap = int(max(4, 0.8 * T))                            # (the gaps between the dashes)
        closed = cv2.morphologyEx(is_dark.astype(np.uint8).reshape(1, -1), cv2.MORPH_CLOSE, np.ones((1, gap), np.uint8))[0] > 0
        closed &= ~thick
        for s, e in _runs(closed):
            L = e - s
            if L * mm < GLASS_MIN_MM or L * mm > 3600:
                continue
            dens = float(is_dark[s:e].mean())
            log_ = (lambda why_: print("GLASS", o, round(c0), e0 + s, e0 + e, round(dens, 2), why_)) if os.environ.get("AE_LOG_GLASS") else (lambda why_: None)
            if dens < 0.45:
                log_("thin"); continue
            def hollow_at(u0, u1):
                u0, u1 = max(0, u0), min(len(mid), u1)
                return u1 - u0 >= 0.5 * T and float(hollow[u0:u1].mean()) >= 0.6
            h0 = hollow_at(int(s - 1.2 * T), int(s - 2)); h1 = hollow_at(int(e + 2), int(e + 1.2 * T))
            dashed = len(_runs(is_dark[s:e])) >= 2 and dens <= 0.85
            if not (h0 or h1 or dashed):
                log_("no hollow wall at either end, not dashed"); continue
            in_ = np.nonzero(mass[s:e] > 0.5)[0]            # (the run clipped to the wall mass: a door's threshold stroke runs on from the band's end)
            if len(in_) < 0.8 * (e - s) or float(mass[s + in_[0]:s + in_[-1] + 1].mean()) < 0.9:
                log_("not in the wall mass"); continue
            s, e = s + int(in_[0]), s + int(in_[-1]) + 1
            if (e - s) * mm < GLASS_MIN_MM:
                log_("short in the wall"); continue
            a, b = float(e0 + s), float(e0 + e)
            box = (a, c0, b, c1) if o == "h" else (c0, a, c1, b)
            if any(tx < box[2] and tx + tw > box[0] and ty < box[3] and ty + th_ > box[1] for tx, ty, tw, th_ in texts):
                log_("under text"); continue
            taken_ = [h_ for h_ in openings if h_["kind"] != "wall" and h_["o"] == o and abs(h_["c"] - (c0 + c1) / 2) <= 1.5 * T and min(h_["b"], b) - max(h_["a"], a) > 0.3 * (b - a)]
            over_ = None
            if taken_:
                # a doorway read from the stroke across a gap, with glass drawn between the faces along it: a window, not a doorway
                if all(h_["kind"] == "open_passage" for h_ in taken_) and len(taken_) == 1:
                    over_ = taken_[0]
                else:
                    log_("taken by %s %s %s" % (taken_[0]["kind"], taken_[0].get("operation"), taken_[0].get("why"))); continue
            log_("candidate" + (" (dashed)" if dashed else "") + (" over a doorway" if over_ else ""))
            out.append({"o": o, "c": (c0 + c1) / 2.0, "a": a, "b": b, "lo": float(c0), "hi": float(c1), "c_lo": float(c0), "c_hi": float(c1), "lo_thin": float(c0), "hi_thin": float(c1),
                        "jamb": [0, 0], "kind": "window", "operation": "fixed", "hinge": "none", "swing_side": 0, "confidence": 0.6, "glass": True, "over": over_,
                        "why": "glass drawn in a thin wall" + (" (dashed)" if dashed else "")})
    return out


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
    return reopen_ducts(m, closed)


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


# Round 25 - ducts.  A shaft or duct is drawn as a small box closed in by walls with a cross from corner to corner in it
# (solid or dashed).  Its inside is narrower than any opening, so the breaks across it were closed as wall and the box
# became wall mass: the walls around it came out two or three times their drawn thickness, and the outside wall past it
# was lost (J, 6 Oct: "one of the wall is thicker than usual" - c21's JR. MASTER BATH).  The box is kept as a space of
# its own, so that every wall around it keeps its own thickness.  It carries no name unless the plan writes one in it (J, 6 Oct:
# "leave duct as empty ... with dotted x shown like that it is a void unusable space").  It is flagged "shaft".  The truth lists no ducts: the room score
# does not count a duct as an extra room.
DUCT = os.environ.get("AE_DUCT", "1") != "0"
DUCT_WORDS = ("DUCT", "VOID", "SHAFT", "RISER", "P.D", "PD", "A.D", "R.D")


def find_ducts(m, k, gray, labels, log=False):
    """boxes closed in by wall mass with a cross drawn corner to corner in them -> [{"mask": full-size bool, "box", "name"}]"""
    if gray is None or gray.shape != k.shape:
        return []
    T = float(m["wall_thickness_px"]); mm = pseudo_scale(m); H, W = k.shape
    thr = min(235, int(m.get("ink_threshold", 180)) + 20)
    ink = (gray < thr).astype(np.uint8)
    on_walls = cv2.dilate(k, np.ones((5, 5), np.uint8)) > 0
    ink[on_walls] = 0
    # The probabilistic Hough transform visits the ink in a pseudo-random order that depends on ALL of its input, so a
    # change anywhere (a word read or not read across the plan) moved which strokes it found everywhere - a duct was
    # found or missed by chance.  It runs on overlapping tiles, each twice the largest cross, so what it finds in one
    # place depends only on the ink near it; lettering is dropped from its findings after, not painted out before.
    text_boxes = [[int(v) for v in t["box"]] for t in m.get("texts", [])]
    big = int(math.ceil(2000.0 / mm)) + 4
    tile = max(128, 4 * big); step = tile // 2
    found = []
    for ty in range(0, max(1, H - step), step):
        for tx in range(0, max(1, W - step), step):
            sub = ink[ty:ty + tile, tx:tx + tile]
            if not sub.any():
                continue
            sg = cv2.HoughLinesP(np.ascontiguousarray(sub) * 255, 1, np.pi / 180, threshold=max(8, int(120 / mm)),
                                 minLineLength=max(10, int(200 / mm)), maxLineGap=max(4, int(160 / mm)))
            if sg is not None:
                found.extend((float(a + tx), float(b + ty), float(c + tx), float(d + ty)) for a, b, c, d in sg[:, 0, :])
    def lettering(sg_):                                       # lettering is never a cross
        cx_, cy_ = (sg_[0] + sg_[2]) / 2.0, (sg_[1] + sg_[3]) / 2.0
        return any(x - 2 <= cx_ <= x + w + 2 and y - 2 <= cy_ <= y + h + 2 for x, y, w, h in text_boxes)
    found = sorted({sg_ for sg_ in found if not lettering(sg_)})
    if not found:
        return []
    pos, neg = [], []
    for x1, y1, x2, y2 in found:
        a = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        if 20 <= a <= 70:
            pos.append((float(x1), float(y1), float(x2), float(y2)))
        elif 110 <= a <= 160:
            neg.append((float(x1), float(y1), float(x2), float(y2)))
    gap_ = max(4, int(160 / mm))
    def merged(fam):                                          # (one stroke read in pieces - a dashed line - is one stroke)
        out_ = []
        for s in sorted(fam, key=lambda s: -math.hypot(s[2] - s[0], s[3] - s[1])):
            p0, p1 = np.array(s[:2]), np.array(s[2:]); L = float(np.hypot(*(p1 - p0)))
            for o_ in out_:
                u = o_["u"]; nrm = np.array([-u[1], u[0]])
                if abs(float(np.dot(p0 - o_["p"], nrm))) > 4.0 or abs(float(np.dot(p1 - o_["p"], nrm))) > 4.0:
                    continue
                t0, t1 = sorted((float(np.dot(p0 - o_["p"], u)), float(np.dot(p1 - o_["p"], u))))
                if t0 > o_["t1"] + 2 * gap_ or t1 < o_["t0"] - 2 * gap_:
                    continue
                o_["t0"], o_["t1"] = min(o_["t0"], t0), max(o_["t1"], t1); break
            else:
                out_.append({"p": p0, "u": (p1 - p0) / max(L, 1e-6), "t0": 0.0, "t1": L})
        return [tuple(float(v) for v in np.r_[o_["p"] + o_["u"] * o_["t0"], o_["p"] + o_["u"] * o_["t1"]]) for o_ in out_]
    pos, neg = merged(pos), merged(neg)
    cand = []
    for s in pos:                                            # two strokes crossing near their middles, of like length
        for t in neg:
            p, r = np.array(s[:2]), np.array(s[2:]) - np.array(s[:2])
            q, u = np.array(t[:2]), np.array(t[2:]) - np.array(t[:2])
            den = r[0] * u[1] - r[1] * u[0]
            if abs(den) < 1e-6:
                continue
            d = q - p
            ts, tu = (d[0] * u[1] - d[1] * u[0]) / den, (d[0] * r[1] - d[1] * r[0]) / den
            if not (0.2 <= ts <= 0.8 and 0.2 <= tu <= 0.8) or min(np.hypot(*r), np.hypot(*u)) < 0.5 * max(np.hypot(*r), np.hypot(*u)):
                continue
            xs = [s[0], s[2], t[0], t[2]]; ys = [s[1], s[3], t[1], t[3]]
            w_, h_ = max(xs) - min(xs), max(ys) - min(ys)
            if not (250 <= w_ * mm <= 2000 and 250 <= h_ * mm <= 2000) or w_ * h_ * mm * mm > 2.5e6:
                continue
            c = p + ts * r
            cand.append({"box": [min(xs), min(ys), max(xs), max(ys)], "c": [float(c[0]), float(c[1])], "segs": (s, t)})
    cand.sort(key=lambda d_: -(d_["box"][2] - d_["box"][0]) * (d_["box"][3] - d_["box"][1]))
    kept = []
    for d_ in cand:                                          # one per place: the largest cross
        if not any(abs(d_["c"][0] - e["c"][0]) < 0.3 * (e["box"][2] - e["box"][0]) and abs(d_["c"][1] - e["c"][1]) < 0.3 * (e["box"][3] - e["box"][1]) for e in kept):
            kept.append(d_)
    free0 = (cv2.dilate(k, np.ones((3, 3), np.uint8)) == 0).astype(np.uint8)
    out = []
    for d_ in kept:
        x0, y0, x1, y1 = d_["box"]
        mg = int(round(1.5 * T)) + 4
        X0, Y0, X1, Y1 = max(0, int(x0) - mg), max(0, int(y0) - mg), min(W, int(math.ceil(x1)) + mg + 1), min(H, int(math.ceil(y1)) + mg + 1)
        sub = free0[Y0:Y1, X0:X1]
        # the inside of the box, cut off from any narrow break in its walls (a jamb gap, a window band): opened by a disc
        rr = max(2, int(min(0.2 * min(x1 - x0, y1 - y0), 0.4 * T)))
        op = cv2.morphologyEx(sub, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rr + 1, 2 * rr + 1)))
        cx, cy = int(round(d_["c"][0])) - X0, int(round(d_["c"][1])) - Y0
        ys_, xs_ = np.nonzero(op[max(0, cy - rr):cy + rr + 1, max(0, cx - rr):cx + rr + 1])
        if not len(ys_):
            continue
        j = int(np.argmin((ys_ + max(0, cy - rr) - cy) ** 2 + (xs_ + max(0, cx - rr) - cx) ** 2))
        n_, lab = cv2.connectedComponents(op, connectivity=4)
        D = lab == lab[max(0, cy - rr) + ys_[j], max(0, cx - rr) + xs_[j]]
        leak = bool(D[0, :].any() or D[-1, :].any() or D[:, 0].any() or D[:, -1].any())
        bx = np.nonzero(D.any(0))[0]; by = np.nonzero(D.any(1))[0]
        fill_x = (min(x1, X0 + bx[-1]) - max(x0, X0 + bx[0])) / max(1.0, x1 - x0)   # the cross spans the box it is in
        fill_y = (min(y1, Y0 + by[-1]) - max(y0, Y0 + by[0])) / max(1.0, y1 - y0)
        span = min((x1 - x0) / max(1.0, bx[-1] - bx[0] + 1), (y1 - y0) / max(1.0, by[-1] - by[0] + 1))
        area_m2 = float(D.sum()) * mm * mm / 1e6
        inside = [l for l in labels if D[min(Y1 - Y0 - 1, max(0, int((l["box"][1] + l["box"][3]) / 2) - Y0)), min(X1 - X0 - 1, max(0, int((l["box"][0] + l["box"][2]) / 2) - X0))]
                  and X0 <= (l["box"][0] + l["box"][2]) / 2 < X1 and Y0 <= (l["box"][1] + l["box"][3]) / 2 < Y1]
        named = [l for l in inside if any(w_ in l["label"].upper().split() or l["label"].upper() == w_ for w_ in DUCT_WORDS)]
        # A shower tray is drawn the same way - a box with its falls to the drain corner to corner, inside a kerb of
        # partition strokes (c25's master bath) - but its cross is solid.  A shaft's cross is dashed (c21, c22, c23), or the
        # shaft is named; a solid cross that is a shaft is left as it was (wall mass): a shower cut out of its bath as
        # a "duct" would be worse.
        dashed = all(_dashed(gray, thr, sg, m, on_walls) for sg in d_["segs"])
        ok = not leak and span >= 0.6 and min(fill_x, fill_y) >= 0.6 and 0.04 <= area_m2 <= 2.0 and len(named) == len(inside) and (dashed or bool(named))
        if log:
            print("duct? cross at %d,%d %dx%d px: leak %s span %.2f fill %.2f/%.2f area %.2f m2 labels %s dashed %s -> %s" % (
                d_["c"][0], d_["c"][1], x1 - x0, y1 - y0, leak, span, fill_x, fill_y, area_m2, [l["label"] for l in inside], dashed, ok))
        if ok:
            # the whole inside: the free pixels within the opened core's extent joined to it (the inner corner of an
            # L-shaped box comes back; a break in the box's walls, outside that extent, stays shut)
            box_ = np.zeros_like(sub); box_[max(0, by[0] - 2):by[-1] + 3, max(0, bx[0] - 2):bx[-1] + 3] = 1
            _n, lab_ = cv2.connectedComponents(sub & box_, connectivity=4)
            D = np.isin(lab_, np.unique(lab_[D & (lab_ > 0)]))
            full = np.zeros((H, W), bool); full[Y0:Y1, X0:X1] = D
            if any((full & e["mask"]).any() for e in out):
                continue
            out.append({"mask": full, "box": [X0 + int(bx[0]), Y0 + int(by[0]), X0 + int(bx[-1]), Y0 + int(by[-1])], "name": named[0]["label"].title() if named else "",
                        "labels": [id(l) for l in named]})
    return out


def _dashed(gray, thr, seg, m, on_walls=None):
    """is the stroke along seg broken into dashes?  (its core - darker than the ink threshold, a pixel either side of
    the line - is off for two strokes' width or more at least three times, and on for under 90 % of its length: long dashes
    with short gaps, c22's, are on for 86 %; a solid stroke has no gaps).
    `on_walls`: wall mass; a stroke found running on into the wall at its ends is judged on its part off the wall."""
    x1, y1, x2, y2 = seg; L = math.hypot(x2 - x1, y2 - y1); H, W = gray.shape
    n = int(L)
    if n < 10:
        return False
    core = min(thr, int(m.get("ink_threshold", 180)))
    ux, uy = (x2 - x1) / L, (y2 - y1) / L; px_, py_ = -uy, ux
    steps = list(range(n + 1))
    if on_walls is not None:
        off_ = [i for i in steps if not on_walls[min(H - 1, max(0, int(round(y1 + uy * i)))), min(W - 1, max(0, int(round(x1 + ux * i))))]]
        if len(off_) < 10:
            return False
        steps = list(range(off_[0], off_[-1] + 1))
    on = []
    for i in steps:
        x, y = x1 + ux * i, y1 + uy * i
        v = 255
        for o in (-1.0, 0.0, 1.0):
            xi, yi = int(round(x + px_ * o)), int(round(y + py_ * o))
            if 0 <= xi < W and 0 <= yi < H:
                v = min(v, int(gray[yi, xi]))
        on.append(v < core)
    sw = max(1.0, float(m.get("stroke_px", 2.0)))
    gaps, run = 0, 0
    for v in on + [True]:
        if not v:
            run += 1
        else:
            if run >= 1.5 * sw:
                gaps += 1
            run = 0
    share = sum(on) / float(len(on))
    return gaps >= 3 and share <= 0.90


def snap_to_ducts(rooms, T, on_tol=1.5):
    snaps = 0
    for d_ in [r_ for r_ in rooms if r_.get("duct") is not None]:
        P = d_["pts"]; n = len(P)
        for r_ in rooms:
            if r_ is d_ or r_.get("duct") is not None:
                continue
            for j, v in enumerate(r_["pts"]):
                for i in range(n):
                    a, b = P[i], P[(i + 1) % n]
                    L = math.hypot(b[0] - a[0], b[1] - a[1])
                    if L < 1e-6:
                        continue
                    ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
                    t = (v[0] - a[0]) * ux + (v[1] - a[1]) * uy; off = abs(-(v[0] - a[0]) * uy + (v[1] - a[1]) * ux)
                    if off > on_tol or t <= 0.5 or t >= L - 0.5:
                        continue
                    c = a if t <= L - t else b
                    if min(t, L - t) <= 0.6 * T:
                        old_ = list(v); nr_ = len(r_["pts"])
                        r_["pts"][j] = [float(c[0]), float(c[1])]; snaps += 1
                        # (its sides stay level and plumb: a neighbour corner in line with it moves the same small way -
                        #  c22's KITCHEN beside the WC, whose corner would otherwise end half a pixel off the WC's)
                        for jn in ((j - 1) % nr_, (j + 1) % nr_):
                            w_ = r_["pts"][jn]
                            if abs(w_[0] - old_[0]) < 1e-6 and abs(c[0] - old_[0]) <= on_tol:
                                r_["pts"][jn] = [float(c[0]), float(w_[1])]
                            elif abs(w_[1] - old_[1]) < 1e-6 and abs(c[1] - old_[1]) <= on_tol:
                                r_["pts"][jn] = [float(w_[0]), float(c[1])]
                    break
            q = r_["pts"]; nq = len(q)                        # (a corner that landed on the next one goes, with its empty side)
            keep = [i for i in range(nq) if math.hypot(q[(i + 1) % nq][0] - q[i][0], q[(i + 1) % nq][1] - q[i][1]) > 1e-6]
            if len(keep) < len(q) and len(keep) >= 3:
                r_["pts"] = [q[i] for i in keep]; r_["meta"] = [r_["meta"][i] for i in keep]
    return snaps


def split_at_duct_jogs(rooms, T, mm):
    """A duct's wall can jog (c21's JR. MASTER BATH duct is L-shaped: its wall to the shower runs thicker at the top), while
    the room beside it keeps one straight face.  That room's side looks at two duct sides at two depths; as one side it
    takes one centre-line half way between, and the duct's L comes out a rectangle behind one over-thick wall.  The side is
    cut where the duct's sides change, so each part pairs with the duct side it faces: one wall each, at its own thickness."""
    def geo(s_):
        if abs(s_["u"][0]) < 1e-6:
            ax = 0
        elif abs(s_["u"][1]) < 1e-6:
            ax = 1
        else:
            return None
        lo, hi = sorted((s_["a"][1 - ax], s_["b"][1 - ax]))
        return ax, s_["a"][ax], (1.0 if s_["n"][ax] > 0 else -1.0), lo, hi
    dsides = [(s_, geo(s_)) for r in rooms if r.get("duct") is not None for s_ in r["sides"] if not s_.get("joint")]
    dsides = [(s_, g) for s_, g in dsides if g is not None]
    cuts_made = 0
    for r in rooms:
        if r.get("duct") is not None or not dsides:
            continue
        S_ = r["sides"]
        for j in range(len(S_) - 2):                        # parts split elsewhere near a jog: the cut goes onto the jog
            p1, jt, p2 = S_[j], S_[j + 1], S_[j + 2]
            if not (jt.get("joint") and p1.get("split") and p2.get("split") and p1.get("whole") is p2.get("whole")):
                continue
            g1 = geo(p1)
            if g1 is None:
                continue
            ax, face, sgn = g1[0], g1[1], g1[2]
            cut = p1["b"][1 - ax]
            facing = sorted([(q, gq) for q, gq in dsides if gq[0] == ax and gq[2] != sgn and 1.0 < (gq[1] - face) * sgn <= 650.0 / mm
                             and min(max(p1["a"][1 - ax], p2["b"][1 - ax]), max(gq[4], gq[3])) - max(min(p1["a"][1 - ax], p2["b"][1 - ax]), gq[3]) >= 3], key=lambda t_: t_[1][3])
            jogs = [0.5 * (g1_[4] + g2_[3]) for (q1_, g1_), (q2_, g2_) in zip(facing, facing[1:]) if abs(g1_[1] - g2_[1]) > 0.5 * T and g1_[4] <= g2_[3] + 2.0]
            near = [c for c in jogs if abs(c - cut) <= 0.6 * T]
            if near:
                c = min(near, key=lambda c_: abs(c_ - cut))
                p1["b"][1 - ax] = c; p2["a"][1 - ax] = c; jt["a"][1 - ax] = c; jt["b"][1 - ax] = c
                p1["L"] = abs(p1["b"][1 - ax] - p1["a"][1 - ax]); p2["L"] = abs(p2["b"][1 - ax] - p2["a"][1 - ax])
                cuts_made += 1
        out = []
        for s_ in r["sides"]:
            g = geo(s_) if not (s_.get("joint") or s_.get("curve")) else None
            if g is None:
                out.append(s_); continue
            ax, face, sgn, lo, hi = g
            facing = sorted([(q, gq) for q, gq in dsides if gq[0] == ax and gq[2] != sgn and 1.0 < (gq[1] - face) * sgn <= 650.0 / mm
                             and min(hi, gq[4]) - max(lo, gq[3]) >= 3], key=lambda t_: t_[1][3])
            cuts = []
            for (q1, g1), (q2, g2) in zip(facing, facing[1:]):
                if abs(g1[1] - g2[1]) > 0.5 * T and g1[4] <= g2[3] + 2.0:
                    c = 0.5 * (g1[4] + g2[3])
                    if lo + 0.5 * T < c < hi - 0.5 * T:
                        cuts.append(c)
            if not cuts:
                out.append(s_); continue
            a = s_["a"]; ux, uy = s_["u"]; nx, ny = s_["n"]; L = s_["L"]
            ual = uy if ax == 0 else ux                       # the side's direction along its own line (+1 / -1)
            qs = sorted((c - a[1 - ax]) * ual for c in cuts)
            bounds = [0.0] + qs + [L]
            whole = s_.get("whole") or s_
            parts = [dict(s_, a=[a[0] + ux * q0, a[1] + uy * q0], b=[a[0] + ux * q1, a[1] + uy * q1], L=q1 - q0, split=True, whole=whole)
                     for q0, q1 in zip(bounds, bounds[1:])]
            for j, part in enumerate(parts):
                if j:
                    prev = parts[j - 1]; d_ = 1.0
                    ju = (d_ * nx, d_ * ny); jn = (ju[1], -ju[0]) if r.get("_orient", 1) > 0 else (-ju[1], ju[0])
                    jt = {"a": list(part["a"]), "b": list(part["a"]), "u": ju, "n": jn, "t": max(2.0, min(prev["t"], part["t"])),
                          "L": 0.0, "joint": True, "whole": whole}
                    jax = 1 - ax
                    jt.update(axis=jax, face=jt["a"][jax], sgn=1.0 if jn[jax] > 0 else -1.0, lo=jt["a"][1 - jax], hi=jt["a"][1 - jax], coord=jt["a"][jax])
                    out.append(jt)
                part["lo"], part["hi"] = sorted((part["a"][1 - ax], part["b"][1 - ax]))
                out.append(part)
            cuts_made += len(cuts)
        r["sides"] = out
    return cuts_made


def reopen_ducts(m, closed):
    """the breaks across a duct box are narrower than any opening and were closed as wall: the inside is the duct"""
    for d_ in m.get("_ducts") or []:
        closed[d_["mask"]] = 0
    return closed


def room_outlines(m, closed, slits=False):
    """free floor enclosed by walls -> one outline per room, along the FACES of its walls (working pixels).  slits (round
    40, the strokes' pass): a stroke that ends inside the space - a counter's edge, a railing's return - is closed over,
    so the outline does not run up one side of it and back down the other (an outline that uses a wall twice, which the
    app refuses and which withheld the room)"""
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
        duct = None
        if m.get("_ducts"):                                  # (a duct is a space of its own however small)
            sel = lab[y:y + h, x:x + w] == i
            duct = next((n_ for n_, d_ in enumerate(m["_ducts"]) if (d_["mask"][y:y + h, x:x + w] & sel).sum() >= 0.5 * area), None)
        if area * mm * mm < 0.35e6 and duct is None:
            continue
        comp = (lab == i).astype(np.uint8)
        comp = cv2.dilate(comp, np.ones((3, 3), np.uint8))   # back out to the wall faces
        pts = _outline_pts(comp, T, mm, curves, ctol, duct, w, h)
        shut_ = None
        if slits:                                            # (the strokes' pass: the outline with notches and slits closed over, kept beside)
            comp2 = cv2.morphologyEx(comp, cv2.MORPH_CLOSE, np.ones((R40_SLIT_K, R40_SLIT_K), np.uint8))
            pts2 = _outline_pts(comp2, T, mm, curves, ctol, duct, w, h)
            if len(pts2) >= 3:
                shut_ = (pts2, comp2)
        if len(pts) >= 3 or shut_ is not None:
            if len(pts) < 3:
                pts, comp = shut_
            r_ = {"face": pts, "comp": comp, "area_px": float(area)}
            if shut_ is not None:
                r_["shut"] = shut_
            if duct is not None:
                r_["duct"] = duct
            if curves:
                r_["on_curve"] = [side_on_curve(pts[j], pts[(j + 1) % len(pts)], curves, ctol) is not None for j in range(len(pts))]
            rooms.append(r_)
    return rooms


def _outline_pts(comp, T, mm, curves, ctol, duct, w, h):
    """the outline of a room's floor (comp, working px) as room_outlines draws it: the outer contour, approximated,
    straightened, curves refitted, simplified"""
    if True:
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
        if duct is None:
            pts = _simplify(pts, step_lim=160.0 / mm, spur_lim=450.0 / mm, far_lim=3.0 * T + 3.0, protect=prot)
        else:                                                # (a duct is the size of the steps and stubs taken out of rooms)
            pts = _simplify(pts, step_lim=min(160.0 / mm, 0.2 * min(w, h)), spur_lim=min(450.0 / mm, 0.2 * min(w, h)), far_lim=0.0, protect=prot)
        return pts


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
PAIR_ALONG = os.environ.get("AE_PAIR_ALONG", "1") != "0"     # ... and, a wall's width apart, also a quarter of the way in from either end (round 28)


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
    if bool(strip.size) and strip.mean() >= 0.7:
        return True
    if PAIR_ALONG and c1 - c0 <= 1.6 * T and hi_ - lo_ >= 2.0 * T:
        # Round 28: read a quarter of the way in from either end as well.  A door's closing box in the middle of the stretch
        # stands where the door's band puts it, not where the wall is (s002: the bath's folding door in the upper half
        # of a thin wall), and the two rooms then kept a wall's width of nothing between them.
        for f_ in (0.25, 0.75):
            u2 = lo_ + f_ * (hi_ - lo_)
            if in_opening(u2):
                continue
            st2 = wallb[int(u2), c0:c1 + 1] if ax == 0 else wallb[c0:c1 + 1, int(u2)]
            if st2.size and st2.mean() >= 0.9:
                return True
    return False


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
        r["_orient"] = area2
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
    if m.get("_ducts"):
        m["_duct_jogs"] = m.get("_duct_jogs", 0) + split_at_duct_jogs(rooms, T, mm)
    # Two rooms looking at the SAME wall from its two sides: the centre-line is half way between their two faces, whatever
    # each of them measured by itself.
    flat = [s_ for r in rooms for s_ in r["sides"] if "axis" in s_ and not s_.get("joint")]
    duct_side = {id(s_) for r in rooms if r.get("duct") is not None for s_ in r["sides"]}
    duct_any = None
    if m.get("_ducts"):
        duct_any = np.zeros((H, W), bool)
        for d_ in m["_ducts"]:
            duct_any |= d_["mask"]
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
            if whole_ok and (id(s_) in duct_side or id(q) in duct_side) and ov < 0.3 * min(s_["hi"] - s_["lo"], q["hi"] - q["lo"]):
                whole_ok = False                             # (a duct side the part only grazes - past the jog it looks at another)
            if whole_ok:
                pairs.append((i, j, ov, 0.5 * (s_["face"] + q["face"])))
                parent[find(i)] = find(j)
                continue
            if duct_any is not None and id(s_) not in duct_side and id(q) not in duct_side and 1.0 < d <= 650.0 / mm and ov >= 3:
                # (two rooms on either side of a duct do not look at each other across one wall: the duct is between)
                # (anywhere along their overlap, or half a wall past it: the end wall of a duct is no wall between the two)
                a0_, a1_ = int(max(s_["lo"], q["lo"]) - 0.5 * T), int(math.ceil(min(s_["hi"], q["hi"]) + 0.5 * T))
                c0_, c1_ = sorted((int(round(s_["face"])), int(round(q["face"]))))
                if (duct_any[max(0, a0_):a1_ + 1, max(0, c0_):c1_ + 1] if s_["axis"] == 0 else duct_any[max(0, c0_):c1_ + 1, max(0, a0_):a1_ + 1]).any():
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
    # Two rooms' walls facing each other across a strip no room takes in, narrower than a wall and a half (round 31; J,
    # 11 Oct: "if this vector is placed in my webapp in 3d u will see a small weird gap, teach the system to close all of
    # this up"): each side kept its own measured wall, and the app built two walls with an open slot between them (c21's
    # ledge over the master bedroom, s064's DB cupboard).  The shorter side's wall is carried across the strip to the other
    # room's face: its centre-line goes half way between the two faces and its wall is as thick as they are apart, so each
    # room's own face stays where it was and the two walls meet.  Only for a side that faces the other along its whole
    # length, stands in no wall group already, and never across a duct, a room's floor or an opening in the strip.
    slot_fill = {}
    if CLOSE_SLOTS > 0:
        group_n = {}
        for i in range(len(flat)):
            group_n[find(i)] = group_n.get(find(i), 0) + 1
        for i, s_ in enumerate(flat):
            for j, q in enumerate(flat):
                if j == i or q["axis"] != s_["axis"] or q["sgn"] == s_["sgn"] or id(s_) in duct_side or id(q) in duct_side:
                    continue
                if group_n[find(i)] > 1 or id(s_) in slot_fill:
                    continue
                d = (q["face"] - s_["face"]) * s_["sgn"]
                if d <= 1.0 or not 0.25 < d - s_["t"] - q["t"] <= CLOSE_SLOTS * T:
                    continue
                lo_, hi_ = max(s_["lo"], q["lo"]), min(s_["hi"], q["hi"])
                if hi_ - lo_ < 3 or hi_ - lo_ < SLOT_OVERLAP * (s_["hi"] - s_["lo"]):
                    continue
                c0, c1 = sorted((s_["face"], q["face"]))
                fa, fb = (s_["face"] + s_["sgn"] * s_["t"], q["face"] - s_["sgn"] * q["t"])
                o_ = "v" if s_["axis"] == 0 else "h"
                if any(g["kind"] != "wall" and g["o"] == o_ and min(g["b"], hi_) - max(g["a"], lo_) > 0 and c0 - T <= g["c"] <= c1 + T for g in ops):
                    continue
                cm = 0.5 * (fa + fb)
                probes = [(cm, lo_ + f_ * (hi_ - lo_)) if s_["axis"] == 0 else (lo_ + f_ * (hi_ - lo_), cm) for f_ in (0.1, 0.3, 0.5, 0.7, 0.9)]
                probes = [(int(round(x)), int(round(y))) for x, y in probes]
                if any(not (0 <= x < W and 0 <= y < H) for x, y in probes):
                    continue
                if any(r_["comp"][y, x] for r_ in rooms if "comp" in r_ for x, y in probes):
                    continue
                if duct_any is not None and any(duct_any[y, x] for x, y in probes):
                    continue
                slot_fill[id(s_)] = (s_, 0.5 * (s_["face"] + q["face"]))
        m["_slots_closed"] = len(slot_fill)
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
    # (a wall shared with a duct keeps the line half way between its two faces: lines elsewhere on the plan a few pixels
    #  off - welded below into one, in a chain - would pull it back over the duct's jog)
    members_ = {}
    for i, s_ in enumerate(flat):
        members_.setdefault(find(i), []).append(s_)
    # (a group of a duct's side and the one room side facing it; where more rooms meet on that line, the line is theirs)
    duct_groups = {gid for gid, ms in members_.items() if groups.get(gid) and any(id(s_) in duct_side for s_ in ms)
                   and sum(1 for s_ in ms if id(s_) not in duct_side) <= 1}
    fixed = {id(s_) for i, s_ in enumerate(flat) if find(i) in duct_groups}
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
    for i, s_ in enumerate(flat):                            # (the welding is done as ever; a wall shared with a duct then
        if id(s_) in fixed:                                  #  takes back the line half way between its own two faces ...
            g = groups[find(i)]
            s_["coord"] = sum(o * c_ for o, c_ in g) / sum(o for o, _c in g)
    for axis in (0, 1):                                      #  ... and those lines a few pixels apart are welded among themselves)
        vals = sorted(((s_["coord"], s_["L"], s_) for s_ in flat if s_["axis"] == axis and id(s_) in fixed), key=lambda v: v[0])
        grp = []
        for v in vals:
            if grp and v[0] - grp[-1][0] > 0.3 * T:
                flush(grp); grp = []
            grp.append(v)
        flush(grp)
    for r in rooms:                                          # (a duct's step between two parallel sides - its wall jogging - stands at its face)
        if r.get("duct") is None:
            continue
        S_ = r["sides"]; n_ = len(S_)
        for i, s_ in enumerate(S_):
            pv, nx_ = S_[i - 1], S_[(i + 1) % n_]
            if "axis" in s_ and not s_.get("joint") and s_["L"] < 1.5 * T and pv.get("axis") == nx_.get("axis") and pv.get("axis") is not None \
                    and pv["axis"] != s_["axis"] and pv.get("sgn") == nx_.get("sgn") and abs(pv["face"] - nx_["face"]) > 0.5 * T:
                s_["coord"] = s_["face"]
    for s_, line_ in slot_fill.values():                     # (a wall carried across a slot: half way between the two faces)
        s_["coord"] = line_
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
        if worst.get("comp") is not None:
            m.setdefault("_withheld_comps", []).append(worst["comp"])
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


R38_SETTLE = os.environ.get("AE_R38_SETTLE", "1") != "0"   # round 38: a hook a wall's thickness through a neighbour's wall line is cut there (s036)


def _settle_crossings(rooms, T, reach, m=None):
    """Walls of two rooms may meet only at corners.  Where a side of one room runs a little way THROUGH a wall line of
    another (its own end wall was measured on a different line than the neighbour's), its end wall is moved onto the
    neighbour's line: both rooms are looking at the same wall.  Where the side runs through by a wall's thickness or less and
    turns back onto that same line by a scrap of a slanted side (a hook at a door's jamb, too short for the chamfer rule
    to see harm in within the room's own outline), the scrap goes and the side ends on the neighbour's line (round 38,
    s036: the living room's corridor ran 15 px into the main bedroom's wall at its door, and the main bedroom was withheld)."""
    for _ in range(12):
        moved = False
        for late in ((False, True) if R38_SETTLE else (False,)):
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
                            if not late and sj.get("split") and _move_cut(q, j, r["sides"][i]["coord"], T, m):
                                moved = True
                                break
                            if nb.get("axis") == ax and not late and small:
                                nb["coord"] = sj["coord"]; nb["t"] = sj["t"]
                                if _legal_outline(r, T, m):
                                    moved = True
                                break
                            if late and "axis" not in nb and not nb.get("curve") and nb["L"] <= CHAMFER_T * T and dist <= T:
                                k_nb = (i + 1) % n if end == 1 else (i - 1) % n
                                after = r["sides"][(k_nb + 1) % n] if end == 1 else r["sides"][(k_nb - 1) % n]
                                if after.get("axis") == ax and abs(after["coord"] - sj["coord"]) <= 0.5 * T:
                                    was = list(r["sides"])
                                    r["sides"] = [s_ for k_, s_ in enumerate(r["sides"]) if k_ != k_nb]
                                    if _legal_outline(r, T, m):
                                        moved = True
                                        if m is not None:
                                            m["_hooks_settled"] = m.get("_hooks_settled", 0) + 1
                                    else:                             # (as it was)
                                        r["sides"] = was
                                        _legal_outline(r, T, m)
                                    break
                        if moved:
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


OPENING_RANK = {"door": 3, "open_passage": 2, "window": 1}


# The limits of lib/floor-plan-imports/vectorizer-evidence-schema.ts: evidence past any of them is refused whole at the
# app's boundary, and the page then gets nothing from the vectorizer (c24's phone photo: 225 opening symbols, limit 200).
APP_LIMITS = {"roomLabels": 100, "dimensionLabels": 200, "openingSymbols": 200, "fixtureSymbols": 300, "notes": 30}


def fit_app_limits(out):
    """Keep the evidence within the app's limits: of a list past its limit, the surest items stay (opening symbols placed
    in a room's side before those found but not placed); strings are cut to their limit.  Returns how many items went."""
    gone = 0
    sem = out["semantics"]
    for key, cap in APP_LIMITS.items():
        items = sem.get(key) or []
        if len(items) <= cap:
            continue
        gone += len(items) - cap
        if key == "openingSymbols":
            rank = lambda it: ("spanSourcePx" in it, it.get("confidence", 0))      # (an opening placed in a side carries its span)
        else:
            rank = lambda it: (it.get("confidence", 0) if isinstance(it, dict) else 0)
        keep = set(map(id, sorted(items, key=rank, reverse=True)[:cap]))
        sem[key] = [it for it in items if id(it) in keep]
    sem["notes"] = [n_[:240] for n_ in sem.get("notes") or []]
    for it in sem.get("dimensionLabels") or []:
        if isinstance(it.get("rawText"), str):
            it["rawText"] = it["rawText"][:80]
    for it in sem.get("openingSymbols") or []:
        if isinstance(it.get("note"), str):
            it["note"] = it["note"][:240]
    for r_ in out["rooms"]:
        r_["label"] = r_["label"][:240]
    for e_ in out["wallEdges"]:
        o_ = e_.get("opening")
        if o_ and isinstance(o_.get("note"), str):
            o_["note"] = o_["note"][:240]
    return gone


def _no_overlapping_cuts(cuts):
    """Two openings cut into one side over the same stretch (c22 low-res: a window read along a wall line ran 12 px into
    the door beside it): walking the cuts in order then turned back along the side, and the app got a loop that uses one
    wall twice and refused the plan.  The stretch goes to a door before a passage before a window, then to the longer; the
    other keeps the longest part left beside it, or goes when that is under a pixel or under 60 % of its own span (the
    share that put it on the side)."""
    kept = []
    for c0, c1, g in sorted(cuts, key=lambda c_: (-OPENING_RANK.get(c_[2]["kind"], 0), -(c_[1] - c_[0]))):
        parts = [(c0, c1)]
        for k0, k1, _g in kept:
            nxt = []
            for p0, p1 in parts:
                if k1 <= p0 or k0 >= p1:
                    nxt.append((p0, p1)); continue
                if k0 > p0:
                    nxt.append((p0, k0))
                if k1 < p1:
                    nxt.append((k1, p1))
            parts = nxt
        if not parts:
            continue
        p0, p1 = max(parts, key=lambda q_: q_[1] - q_[0])
        if p1 - p0 < 1.0 or p1 - p0 < 0.6 * (c1 - c0):
            continue
        kept.append((p0, p1, g))
    return sorted(kept, key=lambda c_: c_[0])


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
    # The app splits every room side at every corner of every room that lies on it, makes vertices in whole millimetres
    # and merges them within half a pixel: an opening cut half a pixel from such a corner leaves a piece of wall whose two
    # ends land on one vertex, and the document is refused (h1's kitchen window, 0.5 px from the balcony door's jamb).
    # A cut that close to a corner on its line is made at the corner.
    corners = [p_ for r_ in rooms for p_ in r_["pts"]] if SNAP_CUTS > 0 else []
    def snap(v, o, coord, al):
        for p_ in corners:
            if abs(p_[1 - al] - coord) <= 0.75 and 0 < abs(p_[al] - v) <= SNAP_CUTS:
                return p_[al]
        return v
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
                        A, B = snap(A, o, s_["coord"], al), snap(B, o, s_["coord"], al)
                        if B - A < 1.0:
                            continue
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
            if NO_OVERLAP_CUTS and len(cuts) > 1:
                cuts = _no_overlapping_cuts(cuts)
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


# round 39: room names the OCR garbled (s034's 'BEL200M', s046's 'BEDRUIM 3' and 'BEORLIM', s037's 'BATA'): a word a
# letter or two away from a room word, with the digits it is often read as turned back into letters, is that word
OCR_ROOM_VOCAB = ("BEDROOM", "BATH", "KITCHEN", "LIVING", "DINING", "STORE", "BALCONY", "FOYER", "STUDY", "MASTER", "TOILET", "SHOWER",
                  "LAUNDRY", "UTILITY", "SERVICE", "FAMILY", "CORRIDOR", "SHELTER", "PANTRY", "LEDGE", "TERRACE", "PLANTER", "WARDROBE",
                  "POWDER", "ENTRANCE", "LOBBY")
OCR_REAL_WORDS = ("STOREY", "STOREYS", "BATHS", "BEDROOMS")
_OCR_DIGITS = str.maketrans("012586", "OIZSBG")


def _lev(a, b):
    p_ = list(range(len(b) + 1))
    for i_, ca in enumerate(a, 1):
        q_ = [i_]
        for j_, cb in enumerate(b, 1):
            q_.append(min(p_[j_] + 1, q_[j_ - 1] + 1, p_[j_ - 1] + (ca != cb)))
        p_ = q_
    return p_[-1]


def _ocr_room_word(t):
    if len(t) < 4 or not re.fullmatch(r"[A-Z0-9]+", t) or sum(ch.isalpha() for ch in t) < 2 or t in OCR_ROOM_VOCAB or t in OCR_REAL_WORDS:
        return None
    u = t.translate(_OCR_DIGITS)
    best = []
    for w in OCR_ROOM_VOCAB:
        if abs(len(w) - len(u)) > 1:
            continue
        d = _lev(u, w)
        if len(w) <= 4:
            ok = d <= 1 and u[0] == w[0]
        elif len(w) <= 6:
            ok = d <= 1 or (d <= 2 and u[:2] == w[:2])
        else:
            ok = d <= 2 or (d <= 3 and u[:2] == w[:2] and u[-1] == w[-1])
        if ok:
            best.append((d, w))
    best.sort()
    if not best or (len(best) > 1 and best[0][0] == best[1][0]):
        return None
    return best[0][1]


def ocr_room_name(s):
    """round 39: s with garbled room words put right, or s itself"""
    if not R39_OCR_FIX:
        return s
    parts = re.split(r"(\W+)", s)
    out = [(_ocr_room_word(t.upper()) or t) if t and re.fullmatch(r"\w+", t) else t for t in parts]
    return "".join(out)


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
        s_ = ocr_room_name(s)
        if s_ != s:
            m["_ocr_fixed"] = m.get("_ocr_fixed", []) + [[s, s_]]
            s = s_
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
GENTLE_SLOPE = os.environ.get("AE_GENTLE_SLOPE", "1") != "0"   # sloped strokes are read down to 2 degrees off level / plumb (p03's balcony parapet, 3.5 degrees)
GENTLE_SLOPE_DEG = float(os.environ.get("AE_GENTLE_SLOPE_DEG", 2.0))
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


def _walk_branch(bm):
    """The pixels of a skeleton branch (a path with two ends) in order from one end; None for a loop or a knot."""
    ys, xs = np.nonzero(bm)
    if len(xs) < 2:
        return None
    pts = set(zip(xs.tolist(), ys.tolist()))
    def nbrs(p_):
        return [(p_[0] + dx, p_[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and (p_[0] + dx, p_[1] + dy) in pts]
    ends = [p_ for p_ in pts if len(nbrs(p_)) == 1]
    if len(ends) != 2:
        return None
    path = [ends[0]]; seen = {ends[0]}
    while True:
        nx_ = [q for q in nbrs(path[-1]) if q not in seen]
        if not nx_:
            break
        # (prefer a 4-neighbour: the skeleton's diagonal shortcuts skip a pixel)
        nx_.sort(key=lambda q: abs(q[0] - path[-1][0]) + abs(q[1] - path[-1][1]))
        path.append(nx_[0]); seen.add(nx_[0])
    return path if len(path) >= 0.8 * len(pts) else None


def gentle_strokes(m, gray, k=None):
    """Strokes only a few degrees off level or plumb (p03's balcony parapet, 3.5 degrees), which stage 1 does not keep
    (not level) and sloped_strokes does not see (its level / plumb ink is taken out with a kernel a slope's runs pass).
    Read apart, so that sloped_strokes' own output stays as it was: the level / plumb ink is taken out with a kernel
    longer than a gentle slope's pixel runs, every skeleton branch is walked from one end and simplified to a polyline
    (a corner is no junction of the skeleton: the parapet runs on into the balcony's plumb edge), and each straight run
    2 - 5 degrees off is a stroke.  Marked gentle: they close outdoor spaces (the outdoor-label pass) and nothing else."""
    mm = pseudo_scale(m); H, W = gray.shape
    ink = (gray < min(235, int(m.get("ink_threshold", 180)) + 20)).astype(np.uint8)
    for t in m["texts"] + m.get("unread_text", []):
        x, y, w, h = [int(v) for v in t["box"]]
        ink[max(0, y - 2):y + h + 3, max(0, x - 2):x + w + 3] = 0
    L0 = max(int(round(300.0 / mm)), int(round(4.0 / math.tan(math.radians(GENTLE_SLOPE_DEG)))))
    axis_ = cv2.bitwise_or(cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, L0), np.uint8)), cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((L0, 1), np.uint8)))
    sl = ink & (1 - axis_)
    if k is not None:
        sl[k > 0] = 0
    min_len = 300.0 / mm                                      # (as long as the level / plumb railings the outdoor pass draws)
    from skimage.morphology import skeletonize
    sk = skeletonize(sl > 0).astype(np.uint8)
    nb = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - sk
    junc = ((sk > 0) & (nb >= 3)).astype(np.uint8)
    br = sk & (1 - cv2.dilate(junc, np.ones((3, 3), np.uint8)))
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(br, connectivity=8)
    out = []
    for i in range(1, n_):
        x, y, w, h, area = st_[i]
        if area < min_len:
            continue
        path = _walk_branch(lab_[y:y + h, x:x + w] == i)
        if path is None or len(path) < min_len:
            continue
        poly = cv2.approxPolyDP(np.array(path, np.int32).reshape(-1, 1, 2), 2.5, False).reshape(-1, 2)
        for (x0_, y0_), (x1_, y1_) in zip(poly[:-1], poly[1:]):
            ln_ = math.hypot(float(x1_ - x0_), float(y1_ - y0_))
            ang_ = math.degrees(math.atan2(float(y1_ - y0_), float(x1_ - x0_))) % 180.0
            if ln_ >= min_len and GENTLE_SLOPE_DEG <= _off_axis(ang_) < SLANT_MIN_DEG:
                p_, q_ = (float(x0_ + x), float(y0_ + y)), (float(x1_ + x), float(y1_ + y))
                u_ = ((q_[0] - p_[0]) / ln_, (q_[1] - p_[1]) / ln_)
                out.append({"p": p_, "q": q_, "u": u_, "ang": ang_, "len": ln_, "w": 2.0, "gentle": True})
    return out


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
    if GENTLE_SLOPE:
        out.extend(gentle_strokes(m, gray, k))                # (read apart, marked gentle: they close outdoor spaces and nothing else)
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
    segs += [s_ for s_ in sloped_strokes(m, gray, k) if s_["w"] * mm <= 60 and not s_.get("gentle")]
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
    strokes += [(s_["p"], s_["q"]) for s_ in m.get("_sloped", []) if not s_.get("gentle")]
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


MIXED = os.environ.get("AE_MIXED", "1") != "0"


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
        m["_filled_style"] = not outline_style
        if outline_style:
            k = cv2.bitwise_or(k, outline_wall_cells(m, gray))
        else:
            k = hatch_wall_supplement(m, gray, k)
            k = cv2.bitwise_or(k, solid_blobs(m, gray))
            if m.get("_mixed_pass"):
                k = cv2.bitwise_or(k, mixed_partition_cells(m, gray, k.copy()))
                if not m.get("_mixed_cells"):
                    raise NoThinWalls()                      # (the second reading would be the first one again)
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
    if R40_LEAF_STUBS and unhosted:
        stubs = leaf_stubs(m, k, unhosted)
        if stubs is not None:                                # the stubs are wall: the gaps and openings are read again with them
            k = cv2.bitwise_or(k, stubs)
            bars, blobs, unsupported = wall_bars(m, k)
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
    m["_ducts"] = find_ducts(m, k, m.get("_work_gray"), labels, log=bool(os.environ.get("AE_LOG_DUCT"))) if DUCT else []
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
        # round 39: an indoor room's name outside every room too - its window drawn as two or three thin lines between
        # columns, which no gap between wall ends accounts for, left it open to the outside (s028, s037): the strokes
        # around it close it, after the outdoor rooms have taken theirs
        wanted_in = [l for l in labels if R39_STROKE_ROOMS and not any(w_ in l["label"].upper() for w_ in OUTDOOR)
                     and room_type(l["label"]) != "other" and not any(at(r_, l) for r_ in inner)]
        if wanted_in and R39_STROKE_ROOMS_OUT:
            # (only a name whose floor runs out to the page's edge: its room leaks to the outside through a window the
            #  gaps do not account for. A name whose floor is closed in but no room - s002's kitchen, open to the corridor
            #  at this pass - is left to the openings: closed by strokes, it cut the entrance off the living room)
            n_, lab_ = cv2.connectedComponents((closed_ == 0).astype(np.uint8), connectivity=4)
            edge_ = set(np.unique(np.concatenate([lab_[0], lab_[-1], lab_[:, 0], lab_[:, -1]]).tolist())) - {0}
            def out_(l):
                x0_, y0_ = int(min(W - 1, max(0, (l["box"][0] + l["box"][2]) / 2))), int(min(H - 1, max(0, (l["box"][1] + l["box"][3]) / 2)))
                win_ = lab_[max(0, y0_ - 6):y0_ + 7, max(0, x0_ - 6):x0_ + 7]
                return bool(set(np.unique(win_).tolist()) & edge_)
            wanted_in = [l for l in wanted_in if out_(l)]
        closed2 = closed_
        added_ = 0                                           # (round 39: rooms the strokes closed for an indoor name, or a nameless space)
        m["_stroke_rooms"] = m["_space_rooms"] = m["_closed_names"] = m["_stroke_outdoor"] = 0   # (counted for the outlines as last made)
        if wanted or wanted_in or R39_SPACE_ROOMS or R40_CLOSED_NAMES:
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
                    if s_["len"] * mm < 300 or s_.get("gentle"):   # (as long as the level / plumb railings drawn here)
                        continue
                    cv2.line(closed2, (int(round(s_["p"][0])), int(round(s_["p"][1]))), (int(round(s_["q"][0])), int(round(s_["q"][1]))), 255, 3)
            if CURVED_RAILS:                                 # a curved parapet (h1's balcony), traced by stage 1 as a curve
                for a_ in curve_arcs(m):
                    cv2.polylines(closed2, [np.array(curve_polyline(a_), np.int32).reshape(-1, 1, 2)], False, 255, 3)
            def take_outdoor(closed_mask, labels_):
                found_ = []
                for r_ in room_outlines(m, closed_mask, slits=R40_SLITS):
                    if _comp_near_gap(m, r_["comp"]):
                        continue                             # (round 40: left out where it made a gap)
                    if any(at(r_, l) for l in labels_) and not any((r_["comp"] & q["comp"]).sum() > 0.2 * r_["comp"].sum() for q in inner) and r_["area_px"] * mm * mm <= 60e6:
                        r_["outdoor"] = True
                        _take(m, r_, [l["label"] for l in labels_ if at(r_, l)])
                        inner.append(r_); found_.append(r_)
                m["_stroke_outdoor"] = m.get("_stroke_outdoor", 0) + len(found_)
                return found_
            take_outdoor(closed2, wanted)
            if wanted_in:
                n0_ = len(inner)
                for r_ in room_outlines(m, closed2, slits=R40_SLITS):
                    if _comp_near_gap(m, r_["comp"]):
                        continue
                    if any(at(r_, l) for l in wanted_in) and not any(at(r_, l) for l in labels if l not in wanted_in) \
                            and not any((r_["comp"] & q["comp"]).sum() > 0.2 * r_["comp"].sum() for q in inner) and r_["area_px"] * mm * mm <= 60e6:
                        names_ = [l["label"] for l in wanted_in if at(r_, l)]
                        # (round 40: not a bed's or a rug's outline - s069. Round 40's own rule: round 39's reading is
                        #  round 39's exactly, and a room the reading under it already has keeps it - s031's living room,
                        #  closed by its window strokes, has far less wall than strokes round it)
                        if R40_CLOSED_WALL > 0 and R40_CLOSED_NAMES and frozenset(n_.strip().upper() for n_ in names_) not in m.get("_base_rooms", set()):
                            comp8_ = r_["comp"].astype(np.uint8)
                            ring_ = (cv2.dilate(comp8_, np.ones((5, 5), np.uint8)) > 0) & (comp8_ == 0)
                            if ring_.sum() == 0 or float((closed_[ring_] > 0).mean()) < R40_CLOSED_WALL:
                                continue
                        _take(m, r_, [l["label"] for l in wanted_in if at(r_, l)])
                        inner.append(r_)
                m["_stroke_rooms"] = m.get("_stroke_rooms", 0) + len(inner) - n0_
                added_ += len(inner) - n0_
            # (only among named rooms: on a plan where stage 1 read hardly any name - a photo, a blurred copy - every room
            #  is nameless already, and a space the strokes close is as likely a cupboard as a room: c24's photo copy)
            if R40_CLOSED_NAMES:
                # round 40: a room name whose floor the walls leave open but the strokes close in (s023's utility, closed
                # on its own by the thin lines round it) - when that space holds no other name stage 1 read, and is room
                # sized - is a room. (Not an outdoor name, which take_outdoor handles, and not ACCESS / VOID / a duct.)
                indoor_ = lambda l: (room_type(l["label"]) != "other" or any(w_ in l["label"].upper() for w_ in ROOM_WORDS)) \
                    and not any(w_ in l["label"].upper() for w_ in OUTDOOR + ("ACCESS", "VOID", "DUCT", "RISER"))
                closed_in_ = [l for l in labels if indoor_(l) and l not in wanted_in and not any(at(r_, l) for r_ in inner)]
                if closed_in_:
                    n2_ = len(inner)
                    for r_ in room_outlines(m, closed2, slits=R40_SLITS):
                        mine_ = [l for l in labels if at(r_, l)]
                        if len(mine_) != 1 or mine_[0] not in closed_in_ or not (1.0e6 <= r_["area_px"] * mm * mm <= 60e6) or _comp_near_gap(m, r_["comp"]):
                            continue
                        if any((r_["comp"] & q["comp"]).sum() > 0.2 * r_["comp"].sum() for q in inner):
                            continue
                        # (its boundary partly wall mass, not strokes alone: a name printed inside a bed's or a rug's
                        #  outline - s069's 'Master Bedroom', 'Living' - is closed by furniture, not by the flat's walls)
                        comp8_ = r_["comp"].astype(np.uint8)
                        ring_ = (cv2.dilate(comp8_, np.ones((5, 5), np.uint8)) > 0) & (comp8_ == 0)
                        if ring_.sum() == 0 or float((closed_[ring_] > 0).mean()) < R40_CLOSED_WALL:
                            continue
                        _take(m, r_, [mine_[0]["label"]])
                        inner.append(r_)
                    m["_closed_names"] = m.get("_closed_names", 0) + len(inner) - n2_
                    added_ += len(inner) - n2_
            if R39_SPACE_ROOMS and sum(1 for l in labels if room_type(l["label"]) != "other") >= 3:
                # round 39: a space the drawn strokes enclose, as big as a room, mostly against the wall mass, that holds no
                # name stage 1 read (s038's middle bedroom: its name was not read, its window drawn in pieces) is a room
                ring_k = np.ones((5, 5), np.uint8)
                n1_ = len(inner)
                for r_ in room_outlines(m, closed2, slits=R40_SLITS):
                    if any(at(r_, l) for l in labels) or not (R39_SPACE_MIN_M2 * 1e6 <= r_["area_px"] * mm * mm <= 60e6) or _comp_near_gap(m, r_["comp"]):
                        continue
                    if any((r_["comp"] & q["comp"]).sum() > 0.2 * r_["comp"].sum() for q in inner):
                        continue
                    comp8 = r_["comp"].astype(np.uint8)
                    ring = (cv2.dilate(comp8, ring_k) > 0) & (comp8 == 0)
                    if ring.sum() == 0 or float((closed_[ring] > 0).mean()) < 0.5:
                        continue
                    _take(m, r_, [])
                    inner.append(r_)
                m["_space_rooms"] = m.get("_space_rooms", 0) + len(inner) - n1_
                added_ += len(inner) - n1_
            # a label still outside every room: once more with the gentle slopes drawn (p03's balcony parapet, 3.5
            # degrees off level) - only then, so that a space that closes without them keeps its outline
            left_ = [l for l in wanted if not any(at(r_, l) for r_ in inner)]
            gentle_ = [s_ for s_ in m.get("_sloped", []) if s_.get("gentle")] if (SLOPED_RAILS and GENTLE_SLOPE) else []
            if left_ and gentle_:
                closed3 = closed2.copy()
                for s_ in gentle_:
                    cv2.line(closed3, (int(round(s_["p"][0])), int(round(s_["p"][1]))), (int(round(s_["q"][0])), int(round(s_["q"][1]))), 255, 3)
                if take_outdoor(closed3, left_):
                    closed2 = closed3                        # (the strokes that closed it count as its boundary below)
                    m["_gentle_closed"] = m.get("_gentle_closed", 0) + 1
        m["_withheld_rooms"] = 0; m["_welds"] = 0; m["_withheld_comps"] = []; m["_slots_closed"] = 0
        thin = close_openings(m, k, ops, thin=True)
        if wanted or added_ or R39_THIN_STROKES:              # (round 39: on every plan - s029's and s066's bedrooms)
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
        m["_withheld_rooms_last"] += len(rooms_) - len(legal)
        m["_withheld_comps"] += [r_["comp"] for r_ in rooms_ if not any(r_ is q_ for q_ in legal) and r_.get("comp") is not None]
        rooms_ = legal
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
        withheld_ = m.get("_withheld_comps", []) if WITHHELD_DOORS else []
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
                            if found is None and any(c_[y, x] for c_ in withheld_):
                                found = -1                   # (a room that was there, and was withheld as illegal geometry)
                        if found is not None:
                            break
                    if found is not None:
                        break
                sides.append(found)
            g["_into_withheld"] = -1 in sides
            g["between"] = [None if s_ == -1 else s_ for s_ in sides]
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
    tentative = [g for g in openings if g.get("wide") or g.get("from_strokes") or g.get("wide_stroke")]
    if tentative:
        settle(rooms, openings)                              # (which two rooms each opening joins, read as it is read below)
        drop = []
        for g in tentative:
            bt = g.get("between", [None, None])
            if g.get("wide_stroke"):
                if None in bt or bt[0] == bt[1]:
                    drop.append(g)
            elif R39_STROKE_WINDOWS and g.get("from_strokes") and (bt[0] is None) != (bt[1] is None):
                # round 39: strokes along a long gap with the outside on one side are a window drawn in pieces (s038's
                # middle bedroom: the leaves of its casement window broke the strokes), not a sliding partition
                g.update(kind="window", operation="fixed", hinge="none", swing_side=0, panels=None, from_strokes=False, confidence=0.55,
                         why="strokes along a long gap in an outer wall: a window drawn in pieces")
                m["_stroke_windows"] = m.get("_stroke_windows", 0) + 1
            elif not (None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1])):
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
    def arc_side(a_, o, c):                                # the side of the wall line the arc swings to
        t_ = math.radians(a_["start"] + a_["span"] / 2.0)
        v_ = (a_["cy"] + a_["r"] * math.sin(t_)) if o == "h" else (a_["cx"] + a_["r"] * math.cos(t_))
        return 1 if v_ > c else -1
    def leaves_in_row(g):
        """leaf arcs hinged on the opening's line, beside or over it: for a swing, the others of about its size that
        swing to its side; for sliding panels, those hinged along it"""
        o, c, a, b_ = g["o"], g["c"], g["a"], g["b"]
        band = max(T, 0.5 * (g.get("hi", c) - g.get("lo", c)) + 0.6 * T) + 0.4 * T
        own = [m["arcs"][i_] for i_ in g.get("arcs", [])]
        if g.get("operation") == "swing" and not own:
            return 0
        bt_ = g.get("between", [None, None])
        out_side = lambda sd: bt_[0 if sd < 0 else 1] is None   # casement leaves swing out of the flat, never into a room
        r0 = max([a_["r"] for a_ in own] or [0.0]); side0 = arc_side(own[0], o, c) if own else 0
        if own and not out_side(side0):
            return 0
        reach = 1.2 * r0 + T if own else 0.0
        seen = []; n_ = 0
        for j_, a_ in enumerate(m.get("arcs", [])):
            if j_ in g.get("arcs", []) or a_.get("from") == "curve":
                continue
            hu, hv = (a_["cx"], a_["cy"]) if o == "h" else (a_["cy"], a_["cx"])
            if abs(hv - c) > band or not (a - reach - 0.3 * T <= hu <= b_ + reach + 0.3 * T):
                continue
            if any(abs(hu - u_) <= 2 and abs(a_["r"] - r_) <= 3 and arc_side(a_, o, c) == s_ for u_, r_, s_ in seen):
                continue                                     # (one leaf found twice)
            if own:
                if not (CASEMENT_RATIO * r0 <= a_["r"] <= r0 / CASEMENT_RATIO) or arc_side(a_, o, c) != side0:
                    continue
            elif not (300.0 <= a_["r"] * mm <= 1000.0 and a_["r"] <= 0.6 * (b_ - a)) or not out_side(arc_side(a_, o, c)):
                continue
            seen.append((hu, a_["r"], arc_side(a_, o, c))); n_ += 1
        return n_
    casement_rows = 0
    bad = []; partitions = 0; narrow_swings = 0; casements = 0; scraps = 0; slide_windows = 0; not_panels = 0; panel_doors = 0
    panel_pairs = wide_passages = sills = 0
    for g in openings:
        bt = g.get("between", [None, None])
        if g.get("wide_stroke"):                             # a single-stroke doorway wider than 3.6 m: only between two rooms
            if None in bt or bt[0] == bt[1]:
                bad.append(g)
            continue
        if g.get("from_strokes") or g.get("wide"):          # a sliding partition read from two strokes, a doorway wider than 1.5 m: only between two named indoor rooms
            if None not in bt and bt[0] != bt[1] and indoor(bt[0]) and indoor(bt[1]):
                if g.get("from_strokes"):
                    panel_pairs += 1
                else:
                    wide_passages += 1
            elif R39_STROKE_WINDOWS and g.get("from_strokes") and (bt[0] is None) != (bt[1] is None):
                # round 39: strokes along a long gap with the outside on one side are a window drawn in pieces (s038's
                # middle bedroom: the casement leaves broke its strokes), not a sliding partition - the room keeps it
                g.update(kind="window", operation="fixed", hinge="none", swing_side=0, panels=None, confidence=0.55,
                         why="strokes along a long gap in an outer wall: a window drawn in pieces")
                m["_stroke_windows"] = m.get("_stroke_windows", 0) + 1
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
        # Leaves in a row on an outer wall are a casement window (round 28): the windows of HDB kitchens and living rooms
        # are three to six leaves hung side by side, every one swinging out, and once their room closes the leaf at a
        # jamb was read as a door, or the frame's strokes as the panels of a sliding door.  A door hangs alone on its
        # line: another leaf of about its size beside it, swinging to the same side, makes it a window - and sliding
        # panels never carry leaf arcs.
        if CASEMENT_ROW and g["kind"] == "door" and None in bt and g.get("operation") in ("swing", "sliding"):
            row = leaves_in_row(g)
            if (g.get("operation") == "swing" and row >= 1) or (g.get("operation") == "sliding" and row >= 2):
                g.update(kind="window", operation="fixed", hinge="none", handing="unknown", swing_side=0, confidence=min(g.get("confidence", 0.7), 0.6),
                         why="leaves in a row on an outer wall: a casement window")
                casement_rows += 1
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
        # A doorway between a named indoor room and the outside is a window: the way out of a flat is its entrance door
        # (c22's common bath, whose window to the ledge is a stroke between two wall ends).
        # (a ledge is never walked onto either: a doorway from a named room onto an air-con ledge is its window)
        if SILL_PASSAGE and g["kind"] == "open_passage" and bt[0] != bt[1]:
            ledge_ = lambda i_: i_ is None or any("LEDGE" in l["label"].upper() for l in rooms[i_]["labels"])
            if (ledge_(bt[0]) != ledge_(bt[1])) and indoor(bt[1] if ledge_(bt[0]) else bt[0]):
                for h_ in openings:                           # (a window read beside it on the same line keeps its stretch: one window is not exported twice)
                    if h_ is not g and h_["kind"] == "window" and h_["o"] == g["o"] and abs(h_["c"] - g["c"]) <= T and min(h_["b"], g["b"]) - max(h_["a"], g["a"]) > 0:
                        if h_["a"] <= g["a"] < h_["b"]:
                            g["a"] = h_["b"]
                        elif h_["a"] < g["b"] <= h_["b"]:
                            g["b"] = h_["a"]
                if g["b"] - g["a"] < 3:
                    bad.append(g); continue
                g.update(kind="window", operation="fixed", hinge="none", swing_side=0, confidence=min(g.get("confidence", 0.6), 0.55),
                         why="a doorway from a named room straight out of the flat, or onto a ledge: a window")
                sills += 1
                continue
        if bt[0] is not None and bt[0] == bt[1] and (g["kind"] == "window" or (g["kind"] == "open_passage" and g.get("confidence", 1) <= 0.55)):
            bad.append(g)
        elif (bt[0] is None) != (bt[1] is None) and g["kind"] != "window" and g.get("operation") != "swing" and blocked(g, -1 if bt[0] is None else 1):
            bad.append(g)
    if bad or partitions or sills:
        back = [h for g in bad if g.get("from_strokes") for h in g.get("displaced", [])]
        openings = [g for g in openings if not any(g is d_ for d_ in bad)] + back
        closed, rooms = make_rooms(openings)
        settle(rooms, openings)
    m["_openings_rejected"] = len(bad); m["_panel_pairs"] = panel_pairs; m["_wide_passages"] = wide_passages; m["_partitions"] = partitions; m["_narrow_swings"] = narrow_swings; m["_casements"] = casements; m["_casement_rows"] = casement_rows; m["_fold_scraps"] = scraps; m["_slide_windows"] = slide_windows; m["_not_panels"] = not_panels; m["_panel_doors"] = panel_doors; m["_sills"] = sills
    # A face under 1.5 m2 that carries no label is not a room: the inside of a shaft, the strip behind a wardrobe
    # drawn against a wall, a notch between a column and a cupboard.  The smallest named space on any plan seen is a
    # 1.3 m2 WC, and it carries its name.  Such faces are left out of the rooms, and an opening that led into one is
    # not an opening (the wall stands solid there); the rooms are rebuilt without it.
    def slivers(rooms_):
        cand_ = [r_ for r_ in rooms_ if scale_work and not r_["labels"] and r_.get("duct") is None and r_["area"] * scale_work * scale_work < SLIVER_M2 * 1e6]
        if R39_JUNCTION_ROOMS and cand_:
            # (round 39) a small face with a way in from one room and an opening to another is a room whose name was not
            # read - c22's WC, a door from the kitchen and a window to the air-con ledge.  Left out, its openings would
            # go and the two rooms join through it (c22's kitchen ran out over the ledge and its foyer was lost).
            ids_ = {id(r_): n_ for n_, r_ in enumerate(rooms_)}
            cs_ = {ids_[id(r_)] for r_ in cand_}
            keep_ = []
            for r_ in cand_:
                n_ = ids_[id(r_)]; nb_ = set(); walk_ = False
                for g in openings:
                    bt_ = g.get("between", [None, None])
                    if n_ not in bt_:
                        continue
                    other_ = bt_[1] if bt_[0] == n_ else bt_[0]
                    if other_ is None or other_ == n_ or other_ in cs_:
                        continue
                    nb_.add(other_)
                    walk_ = walk_ or g["kind"] in ("door", "open_passage")
                P_ = np.array(r_["pts"], float); w_, h_ = P_.max(0) - P_.min(0)
                near_ = m.get("_gap_pts") and any(_near_gap(m, float(px_), float(py_)) for px_, py_ in P_)   # (round 40)
                if len(nb_) >= 2 and walk_ and r_["area"] * scale_work * scale_work >= 0.9e6 and min(w_, h_) * scale_work >= 700 and not near_:
                    keep_.append(r_)
            if keep_:
                m["_junction_rooms"] = len(keep_)
                cand_ = [r_ for r_ in cand_ if not any(r_ is q for q in keep_)]
        return cand_
    sliver_count = 0
    for _round in range(3):
        sl = slivers(rooms)
        if not sl:
            break
        gone = {n_ for n_, r_ in enumerate(rooms) if any(r_ is q for q in sl)}
        into = [g for g in openings if any(b_ in gone for b_ in g.get("between", [None, None]) if b_ is not None)]
        if R39_SLIVER_OUT:
            # A sliver open to the outside is outside: the strip between a casement window and the arcs of its leaves,
            # which swing out of the flat (s038's main bedroom).  Its own openings to the outside go with it, but a room's
            # opening into it is that room's opening to the outside: it stays, so the room stays closed.
            out_ = {n_ for n_ in gone if any(None in g.get("between", [None, None]) and n_ in g.get("between", []) for g in openings)}
            # (only a named room's: a nameless face beyond it is the outside closed off by a dimension line - exec's
            #  strips between the columns and the dimension line over its bay windows)
            stay = [g for g in into if any(b_ is not None and b_ not in gone and rooms[b_]["labels"] for b_ in g.get("between", [None, None]))
                    and any(b_ in out_ for b_ in g.get("between", [None, None]))]
            if m.get("_gap_pts"):                            # (round 40: not where it made a gap)
                stay = [g for g in stay if not any(_near_gap(m, *((t_, g["c"]) if g["o"] == "h" else (g["c"], t_))) for t_ in np.linspace(g["a"], g["b"], 9))]
            if stay:
                m["_sliver_windows_kept"] = m.get("_sliver_windows_kept", 0) + len(stay)
                into = [g for g in into if not any(g is h_ for h_ in stay)]
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
        # (round 34) a balcony-type space holds outdoor names only - a room that a blurred trace merged with a bedroom is
        # not one, one merged with its air-con ledge still is - and an ACCESS balcony is the common corridor outside the
        # flat, whose windows stay windows
        outdoor = [any(w_ in l for l in ls for w_ in ONTO) and all(any(w_ in l for w_ in OUTDOOR_WORDS) and "ACCESS" not in l for l in ls)
                   for ls in labs]
        indoor = [any(room_type(l) in LIVING for l in ls) for ls in labs]
        if (outdoor[0] and indoor[1]) or (outdoor[1] and indoor[0]):
            g.update(kind="door", operation="sliding", hinge="none", swing_side=0, confidence=min(g.get("confidence", 0.7), 0.6), why="a wide window onto a balcony from a living space")
    # Glass drawn in a thin wall (the louvres of the baths and kitchens, a bedroom's pane): read last, against the rooms
    # and openings as they stand, and put in as windows in the wall mass - nothing moves, the band stays wall for the
    # rooms.  A window has the outdoors, or a space without a name, on one side: between two named indoor rooms the
    # band is a partition drawn dark, and it stays what it is.
    glass_windows = glass_partitions = 0
    def named_indoor(i_):                                    # (as indoor() above; that name is a list by now)
        labs_ = [l["label"].upper() for l in rooms[i_]["labels"]]
        return bool(labs_) and not any(w_ in l for l in labs_ for w_ in OUTDOOR_WORDS)
    if GLASS_BAND and m.get("_work_gray") is not None:
        hosted_ = {id(me["opening"]) for r_ in rooms for me in r_["meta"] if me.get("opening") is not None}
        glass = glass_bands(m, m["_work_gray"], k, [h_ for h_ in openings if id(h_) in hosted_])   # (an opening no room carries takes no place)
        if glass:
            settle(rooms, glass)
            keep = []; turned = 0
            for g in glass:
                bt = g.get("between", [None, None])
                if os.environ.get("AE_LOG_GLASS"):
                    print("GLASS between", bt, [[l["label"] for l in rooms[i_]["labels"]] if i_ is not None else None for i_ in bt], g["o"], g["a"], g["b"])
                if bt == [None, None] or bt[0] == bt[1]:
                    continue
                if None not in bt and named_indoor(bt[0]) and named_indoor(bt[1]):
                    glass_partitions += 1; continue
                if g.get("over") is not None:                # the doorway read along that stroke is this window
                    g["over"].update(kind="window", operation="fixed", hinge="none", swing_side=0, confidence=0.6, why="glass drawn between the faces along the stroke: a window, not a doorway")
                    turned += 1; continue
                keep.append(g)
            if keep or turned:
                openings = openings + keep
                snap = {k_: m.get(k_) for k_ in COUNTERS}
                closed, rooms = make_rooms(openings)
                for k_, v_ in snap.items():                  # (the same rooms once more: counted once)
                    if v_ is None:
                        m.pop(k_, None)
                    else:
                        m[k_] = v_
                settle(rooms, openings)
            glass_windows = len(keep) + turned
    m["_glass_windows"] = glass_windows; m["_glass_partitions"] = glass_partitions
    # Doors onto space no room claims, read against the rooms as they finally stand (round 28).  Such a door keeps closing
    # its gap as a door does - the rooms stay as they are - but it is reported as a door found and not placed, as a swing
    # without a gap is, and its side stays wall: put on the outside of its room it would be a way out of the flat.
    # - A bedroom, bath, store or household shelter has no door out of the flat: its door onto unclaimed space opens into
    #   a hall or living room that did not close (the shelter's door into the living room, a bedroom's into the passage).
    # - The thin-wall reading closes rooms whose neighbours may still lie open: of the doors onto unclaimed space, only
    #   those the plain reading had already are kept (a missed door costs less than a false one).
    def private(t_):                                         # a room no flat is entered by
        return room_type(t_) in ("bedroom", "toilet", "shelter") or "STORE" in t_.upper()
    mixed_out_doors = private_out = 0
    for g in openings:
        bt = g.get("between", [None, None])
        if g["kind"] != "door" or None not in bt:
            continue
        if m.get("_mixed_doors") is not None and MIXED_NEW_OUT == "wall" and \
                not any(o_ == g["o"] and abs(c_ - g["c"]) <= T and min(b0, g["b"]) - max(a0, g["a"]) > 0.5 * (g["b"] - g["a"]) for o_, c_, a0, b0 in m["_mixed_doors"]):
            g["_unclaimed"] = True
            mixed_out_doors += 1
            continue
        if PRIVATE_NO_EXIT and bt != [None, None]:
            names_ = [l["label"] for l in rooms[bt[0] if bt[0] is not None else bt[1]]["labels"] if l["known"]]
            if names_ and all(private(t_) for t_ in names_):
                g["_unclaimed"] = True
                private_out += 1
    m["_mixed_out_doors"] = mixed_out_doors; m["_private_out"] = private_out
    # A door into a room withheld as illegal geometry (round 30, d13 soft: a bath whose outline the living room's crossed)
    # has no room on that side, as a door out of the flat has none: placed, it would be a second way out.  It is reported
    # as found and not placed, its side stays wall - as an opening into a room the last check withholds is (round 29).
    withheld_doors = 0
    for g in openings:
        if g["kind"] == "door" and g.get("_into_withheld") and not g.get("_unclaimed"):
            g["_unclaimed"] = True
            withheld_doors += 1
    m["_withheld_doors"] = withheld_doors
    # One way into a flat (round 30; J 11 Oct: "we will fix the false doors next").  Every one of the 75 typed plans has
    # exactly one door to the outside: its entrance.  A second door "to the outside" leads into a room that did not close
    # (s040's bedroom, s044's two, s010's kitchen nook), and a door from a balcony, ledge or yard to the outside is a
    # railing or a sill (exec's photo).  Such doors keep closing their gaps as doors do, and are reported as found and not
    # placed, as a door onto unclaimed space is (round 28) - also from a room that is only private rooms and outdoor ones
    # run together (a bath merged with its service balcony).  Of several, the entrance kept is the one from a living room,
    # dining room, foyer or lobby, then from a named room (s026: not from a space without a name), a swing before a slider
    # or a folding door, the widest first (an entrance is the widest leaf of a flat, often a double leaf with a gate).
    outs_out = 0
    if ONE_WAY_IN:
        outs_ = []
        for g in openings:
            bt = g.get("between", [None, None])
            if g["kind"] != "door" or g.get("_unclaimed") or bt == [None, None] or None not in bt:
                continue
            labs_ = [l["label"].upper() for l in rooms[bt[0] if bt[0] is not None else bt[1]]["labels"] if l["known"]]
            if labs_ and all(any(w_ in l_ for w_ in OUTDOOR_WORDS) or private(l_) for l_ in labs_):     # (a bath merged with its service balcony: exec low-res)
                g["_unclaimed"] = True
                outs_out += 1
                continue
            outs_.append(g)
        if len(outs_) > 1:
            def way_in_rank(g):                              # a public room's door first, then a named room's, a swing, the widest
                labs_ = [l["label"].upper() for l in rooms[g["between"][0] if g["between"][0] is not None else g["between"][1]]["labels"] if l["known"]]
                public_ = any(w_ in l_ for l_ in labs_ for w_ in ("LIVING", "DINING", "FOYER", "ENTRANCE", "LOBBY", "HALL"))
                return (public_, bool(labs_), g.get("operation") == "swing", g["b"] - g["a"])
            way_in = max(outs_, key=way_in_rank)
            for g in outs_:
                if g is not way_in:
                    g["_unclaimed"] = True
                    outs_out += 1
    m["_second_ways_out"] = outs_out
    # No door joins two bedrooms (round 30): on the plans read so far every door "between two bedrooms" was a bedroom that
    # took in the passage its neighbours' doors open onto - its own door not found (s005, room4 soft) - or a pair of
    # wardrobes back to back read as sliding panels (c25).  Such a door is reported as found and not placed.
    pairs_out = 0
    if BEDROOM_PAIRS:
        for g in openings:
            bt = g.get("between", [None, None])
            if g["kind"] != "door" or g.get("_unclaimed") or None in bt or bt[0] == bt[1]:
                continue
            if all((lambda labs_: bool(labs_) and all(room_type(t_) == "bedroom" for t_ in labs_))([l["label"] for l in rooms[i_]["labels"] if l["known"]]) for i_ in bt):
                g["_unclaimed"] = True; g["_note"] = "door found between two bedrooms: one of them took in the space the door opens onto"
                pairs_out += 1
    m["_bedroom_pairs"] = pairs_out
    # An air-con ledge is reached through a window, never through a door (round 30, s012: a folding "door" from the living
    # room onto its ledge).  A door into a room that is only a ledge is reported as found and not placed.
    ledge_out = 0
    if LEDGE_NO_DOOR:
        def only_ledge(i_):
            labs_ = [l["label"].upper() for l in rooms[i_]["labels"] if l["known"]]
            return bool(labs_) and all("LEDGE" in t_ for t_ in labs_)
        for g in openings:
            bt = g.get("between", [None, None])
            if g["kind"] == "door" and not g.get("_unclaimed") and any(i_ is not None and only_ledge(i_) for i_ in bt):
                g["_unclaimed"] = True; g["_note"] = "door found onto an air-con ledge: a ledge is reached through a window"
                ledge_out += 1
    m["_ledge_doors"] = ledge_out
    # A bath, a store or a shelter is entered once from any one room (round 30): two doors between it and the same room
    # are a room that took in its neighbour - d11's photo, where the bedroom above the bath merged into the living room
    # and both bath doors then led there.  The surer one, then the wider, stays.
    twins_out = 0
    if ONE_DOOR_SMALL:
        by_pair = {}
        for g in openings:
            bt = g.get("between", [None, None])
            if g["kind"] == "door" and not g.get("_unclaimed") and None not in bt and bt[0] != bt[1]:
                by_pair.setdefault(tuple(sorted(bt)), []).append(g)
        def small(i_):
            labs_ = [l["label"] for l in rooms[i_]["labels"] if l["known"]]
            return bool(labs_) and all(room_type(t_) in ("toilet", "shelter") or "STORE" in t_.upper() for t_ in labs_)
        for pr_, gs_ in by_pair.items():
            if len(gs_) > 1 and (small(pr_[0]) or small(pr_[1])):
                keep_ = max(gs_, key=lambda g: (g.get("confidence", 0), g["b"] - g["a"]))
                for g in gs_:
                    if g is not keep_:
                        g["_unclaimed"] = True; g["_note"] = "a second door between the same two rooms: one of them took in its neighbour"
                        twins_out += 1
    m["_twin_doors"] = twins_out
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
    for r_ in rooms:                                         # doors onto space no room claims (round 28): a plain wall side
        for me in r_["meta"]:
            if me.get("opening") is not None and me["opening"].get("_unclaimed"):
                me["kind"] = "wall"; me["opening"] = None
    m["_welded_corners"] = weld_corners(rooms, WELD_CORNERS)
    # a side of one room under a source pixel long (a corner welded onto another room's half a pixel from this room's
    # own next corner: s031's BATH/WC 1) is a wall the app's construction can make zero-length - it goes
    m["_subpixel_sides"] = drop_subpixel_sides(rooms, 1.0 * float(m.get("work_scale", 1) or 1))
    # A duct has no door or window: an opening read on its side (the double line of a ledge parapet in front of a shaft)
    # is wall, in every room that carries it.
    shut = {id(me["opening"]) for r_ in rooms if r_.get("duct") is not None for me in r_["meta"] if me.get("opening") is not None}
    if shut:
        for r_ in rooms:
            for me in r_["meta"]:
                if me.get("opening") is not None and id(me["opening"]) in shut:
                    me["opening"] = None; me["kind"] = "wall"
    m["_duct_openings"] = len(shut)
    # A corner of another room standing on a duct's side a little short of the duct's own corner (the chamfer a room
    # outline keeps where it turns round the duct: c21's COMMON) would put three rooms on that stretch of wall: it goes
    # to the duct's corner.
    m["_duct_snaps"] = snap_to_ducts(rooms, T)
    snap_ = lambda rs: [([type(q)(q) for q in r_["pts"]], [dict(me) for me in r_["meta"]]) for r_ in rs]
    def put_(rs, saved_):
        for r_, (P_, M_) in zip(rs, saved_):
            r_["pts"] = [type(q)(q) for q in P_]; r_["meta"] = [dict(me) for me in M_]
    def tidy_(rs):
        # A wall meant level or plumb whose two ends came out a fraction of a pixel apart (c21's WC wall: 950.25 at the
        # void's corner, 950.09 at the kitchen's) is drawn by the app a hair slanted, and meets the next wall with a step:
        # such ends are put on one line, everywhere they occur.
        st_ = straighten_axis_sides(rs, 0.75 * float(m.get("work_scale", 1) or 1))
        sub_ = drop_subpixel_sides(rs, 1.0 * float(m.get("work_scale", 1) or 1)) if st_ else 0
        # (last: after every step that moves a corner, so the two rooms' ends of one opening stay one end)
        we_ = weld_shared_ends(rs, SHARED_ENDS) if SHARED_ENDS > 0 else 0
        return st_, sub_, we_
    short_cut_ = None
    if R39_LONG_CUTS and SQUARE_CUTS > 2.0:
        # round 39: the runs up to two wall widths first, as before; then the longer ones (s034's kitchen corner at the
        # refuse chute) - kept only if the app's geometry rules below withhold no more rooms for them (s029's bedroom)
        m["_squared_cuts"] = square_cut_corners(rooms, k, T, 2.0 * T, m.get("_work_gray"))
        before_ = snap_(rooms)
        n_long = square_cut_corners(rooms, k, T, SQUARE_CUTS * T, m.get("_work_gray"))
        if n_long:
            short_cut_ = before_
        m["_squared_cuts"] += n_long
    else:
        m["_squared_cuts"] = square_cut_corners(rooms, k, T, SQUARE_CUTS * T, m.get("_work_gray")) if SQUARE_CUTS > 0 else 0
    m["_straightened"], sub_, m["_shared_ends"] = tidy_(rooms)
    m["_subpixel_sides"] += sub_
    if short_cut_ is not None and LAST_CHECK:
        import copy as copy_
        mm_src_ = (float(m["mm_per_px"]) / S.k) if m.get("mm_per_px") else None
        mms_ = ([mm_src_ * f_ for f_ in (0.99, 1.0, 1.01)] if mm_src_ else list(ASSUMED_MM)) if APP_REPLAY else None
        withheld_ = lambda rs: len(last_legal_check(rs, S, T, 1.0 * float(m.get("work_scale", 1) or 1), mms_)[1])
        n_long_gone = withheld_(copy_.deepcopy(rooms))
        alt_ = copy_.deepcopy(rooms); put_(alt_, short_cut_); tidy_(alt_)
        if n_long_gone > withheld_(alt_):
            put_(rooms, short_cut_)
            m["_subpixel_sides"] -= sub_
            m["_straightened"], sub_, m["_shared_ends"] = tidy_(rooms)
            m["_subpixel_sides"] += sub_
            m["_long_cuts_undone"] = m.get("_long_cuts_undone", 0) + 1
    # The app's geometry rules once more, on the outlines as they now leave (round 29): what can be mended is, the rest is
    # withheld; an opening into a withheld room leads into space no room claims (as a door onto such space does above).
    if LAST_CHECK:
        mm_src = (float(m["mm_per_px"]) / S.k) if m.get("mm_per_px") else None
        mms = ([mm_src * f_ for f_ in (0.99, 1.0, 1.01)] if mm_src else list(ASSUMED_MM)) if APP_REPLAY else None
        kept, gone, m["_mended"], short = last_legal_check(rooms, S, T, 1.0 * float(m.get("work_scale", 1) or 1), mms)
        m["_subpixel_sides"] += short
        if gone:
            lost = {n_ for n_, r_ in enumerate(rooms) if any(r_ is q for q in gone)}
            for g in openings:
                if g["kind"] != "wall" and any(b_ in lost for b_ in g.get("between", [None, None]) if b_ is not None):
                    g["_unclaimed"] = True
            for r_ in kept:
                for me in r_["meta"]:
                    if me.get("opening") is not None and me["opening"].get("_unclaimed"):
                        me["kind"] = "wall"; me["opening"] = None
            m["_withheld_rooms_last"] = m.get("_withheld_rooms_last", 0) + len(gone)
        if gone or m["_mended"]:
            rooms = kept
            settle(rooms, openings)
    sem_open = []
    for g in openings:
        if g["kind"] == "wall":
            continue
        if g.get("_unclaimed"):
            p0, p1 = ((g["a"], g["c"]), (g["b"], g["c"])) if g["o"] == "h" else ((g["c"], g["a"]), (g["c"], g["b"]))
            r = S.ratio((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            sem_open.append({"kind": g["kind"], "operation": g["operation"], "centerXRatio": r["xRatio"], "centerYRatio": r["yRatio"], "confidence": 0.45, "evidenceKind": "vectorizer",
                             "hinge": "unknown", "swingSide": 0, "handing": "unknown", "note": g.get("_note") or "%s found, but the space beyond it did not close" % g["kind"].replace("_", " ")})
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
        shaft = r_.get("duct") is not None
        if shaft:
            label, typ = label or m["_ducts"][r_["duct"]]["name"], "other"
        npts = len(r_["pts"]); edge_recs = []
        for i in range(npts):
            a, b = r_["pts"][i], r_["pts"][(i + 1) % npts]; me = r_["meta"][i]
            key = tuple(sorted(((round(a[0]), round(a[1])), (round(b[0]), round(b[1])))))
            # the other room's cut of the same opening, a rounding step off this one's: one edge for both
            if me["opening"] is not None and me["opening"]["kind"] not in OPENING_RANK:
                # (an opening turned back into wall after it was cut into the side - strokes along a gap that are no sliding
                #  panels, d12's photo: it leaves as wall, as the app's schema knows only doors, windows and passages)
                me = dict(me, kind="wall", opening=None)
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
                          "sourceLabels": [l["label"] for l in r_["labels"]]} | ({"shaft": True} if shaft else {}))
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
        "diagnostics": {"bars": len(bars), "gapsSeen": len(gaps), "openings": {kk: sum(1 for g in openings if g["kind"] == kk and not g.get("_unclaimed")) for kk in ("door", "window", "open_passage", "wall")},
                        "doorSwingsWithoutGap": len(unhosted), "rooms": len(rooms_out), "roomsWithheldAsIllegalGeometry": int(m.get("_withheld_rooms_last", 0)), "roomOutlinesMendedForTheApp": int(m.get("_mended", 0)), "slotsBetweenWallsClosed": int(m.get("_slots_closed", 0)), "facesLeftOutAsSlivers": int(m.get("_slivers", 0)), "leakedWallChannels": int(m.get("_leaked_channels", 0)), "swingsTooNarrowForADoor": int(m.get("_narrow_swings", 0)), "doubleSwingsReadAsCasements": int(m.get("_casements", 0)), "leafRowsReadAsCasements": int(m.get("_casement_rows", 0)), "doorsNotPlacedBeyondOpenSpace": int(m.get("_private_out", 0)) + int(m.get("_mixed_out_doors", 0)), "doorsIntoWithheldRoomsNotPlaced": int(m.get("_withheld_doors", 0)), "secondWaysOutNotPlaced": int(m.get("_second_ways_out", 0)), "doorsBetweenTwoBedroomsNotPlaced": int(m.get("_bedroom_pairs", 0)), "doorsOntoLedgesNotPlaced": int(m.get("_ledge_doors", 0)), "secondDoorsIntoSmallRoomsNotPlaced": int(m.get("_twin_doors", 0)), "thinWallsReadAsWalls": int(m.get("_mixed_cells", 0)) if m.get("_mixed_pass") else 0, "leafStubsReadAsWalls": int(m.get("_leaf_stubs", 0)), "foldingScrapsDropped": int(m.get("_fold_scraps", 0)), "slidingPanelsReadAsWindows": int(m.get("_slide_windows", 0)), "stripsThatAreNoSlidingPanels": int(m.get("_not_panels", 0)), "windowsReadAsPartitions": int(m.get("_partitions", 0)), "openingsRejectedAsNotLeadingAnywhere": int(m.get("_openings_rejected", 0)), "labelsOutsideRooms": [l["label"] for l in labels if l["known"] and id(l) not in in_rooms],
                        "diagonalWallsAdded": int(m.get("_diag_walls", 0)), "gapsAcrossSlantedWallsDropped": int(m.get("_across_slant", 0)), "openingsInSlantedWalls": int(m.get("_slanted_gaps", 0)), "slantedSidesWelded": int(m.get("_welds", 0)), "slopedStrokes": sum(1 for s_ in m.get("_sloped", []) if not s_.get("gentle")), "curvedWalls": len(curve_arcs(m)), "curvedSides": int(curve_sides), "panelPartitionsAsSlidingDoors": int(m.get("_panel_doors", 0)), "foldingDoorsOnTheirPartition": int(m.get("_fold_partition", 0)), "wallGapsOnTheirStrokes": int(m.get("_wall_band", 0)), "sidesSplitAtThicknessChanges": int(m.get("_splits", 0)), "sidesWeldedOntoTheWall": int(m.get("_twin_welds", 0)), "jambChamfersDropped": int(m.get("_chamfers", 0)), "dimensionScrapsDropped": int(m.get("_dim_scraps", 0)), "slidingPartitionsFromStrokes": int(m.get("_panel_pairs", 0)), "wideDoorwaysKept": int(m.get("_wide_passages", 0)), "swingsReadFromTheDrawing": int(m.get("_drawn_swings", 0)), "thresholdDoors": int(m.get("_threshold_doors", 0)), "gentleSlopedStrokes": sum(1 for s_ in m.get("_sloped", []) if s_.get("gentle")), "outdoorSpacesClosedByGentleSlopes": int(m.get("_gentle_closed", 0)), "glassInThinWalls": int(m.get("_glass_windows", 0)), "glassBandsBetweenTwoRooms": int(m.get("_glass_partitions", 0)), "doorwaysToTheOutsideReadAsWindows": int(m.get("_sills", 0)), "cornersWelded": int(m.get("_welded_corners", 0)), "ductsKeptAsSpaces": sum(1 for r_ in rooms if r_.get("duct") is not None), "openingsOnDuctsShut": int(m.get("_duct_openings", 0)), "cornersSnappedToDucts": int(m.get("_duct_snaps", 0)), "subPixelSidesDropped": int(m.get("_subpixel_sides", 0)), "cornersStraightened": int(m.get("_straightened", 0)), "cutCornersSquared": int(m.get("_squared_cuts", 0)), "sidesCutAtDuctJogs": int(m.get("_duct_jogs", 0)), "windowsReadInThePicture": int(m.get("_picture_bands", 0)), "pictureBandsOnUnbrokenWalls": int(m.get("_picture_bands_solid", 0)), "roomsClosedByStrokes": int(m.get("_stroke_rooms", 0)), "namedSpacesClosedByStrokes": int(m.get("_closed_names", 0)), "outdoorRoomsClosedByStrokes": int(m.get("_stroke_outdoor", 0)), "namelessSpacesAsRooms": int(m.get("_space_rooms", 0)), "smallRoomsBetweenTwoRooms": int(m.get("_junction_rooms", 0)), "sliverWindowsKept": int(m.get("_sliver_windows_kept", 0)), "longCutsUndone": int(m.get("_long_cuts_undone", 0)), "roomNamesReadPastOcrSlips": len(m.get("_ocr_fixed", [])), "unsupportedWallPx": int(unsupported), "thickAxisWallPx": int(residual["axis"]), "slantedWallPx": int(slanted_px), "otherWallPx": int(residual["slanted"] + residual["curved"] - slanted_px), "workScale": m.get("work_scale"), "skewDeg": m.get("skew_deg"),
                        "pageCrop": {"offsetPx": m.get("crop_offset"), "pageSizePx": m.get("page_size")} if m.get("crop_offset") else None,
                        "scaleBar": ({k_: m["scale_bar"][k_] for k_ in ("mm", "unit", "labelFitErrorMm")} | {"source": "graphic scale bar"}) if m.get("scale_bar") else None,
                        "areaCheck": area_check(m, rooms_out)},
    }
    if ONE_T:
        out["diagnostics"]["wallThicknessUnified"] = unify_wall_thickness(out, (scale_work / k_len) if (scale_work and k_len) else None)
    out["diagnostics"]["jogFacesFlushed"] = flush_jog_faces(out, FLUSH_JOGS) if FLUSH_JOGS > 0 else 0
    out["diagnostics"]["facesFitToTheDrawing"] = fit_drawn_faces(out, gray, S, T * k_len, FIT_FACES) if FIT_FACES > 0 else 0
    jogs = out.pop("_jogs", [])
    chosen = choose_jog_thickness(out, jogs)                 # (before the standalone walls, which fit the walls as built)
    _standalone_walls(out, m, S, T, gray, jogs, chosen)
    if SCHEMA_CAPS:
        out["diagnostics"]["itemsLeftOutForTheAppsLimits"] = fit_app_limits(out)
    dbg = {"k": k, "closed": closed, "bars": bars, "blobs": blobs, "gaps": gaps, "openings": openings, "rooms": rooms, "labels": labels, "unhosted": list(unhosted)}
    return out, dbg


# Round 24 - clean corners.  The app builds one wall per room side and joins the walls meeting at a corner; where one wall
# line changes thickness from side to side (a wall measured 27, 21 and 18 px along its length, the door in it 12 px) every
# change is a step in both faces and a wedge at the joins (J, 6 Oct: "the corners are all not connected properly - it should
# be clean like the floor plan").  A drawn wall line has one thickness, except where the drawing really changes it.
# Measured on the 15 dev + gate plans (6 Oct): steps along a wall line 268 -> 59, faces off the ink 8.35 -> 8.06 %, no score
# moves (thickness takes no part in rooms, doors or windows).  The settings below were chosen among six on those plans.
ONE_T = os.environ.get("AE_ONE_T", "1") != "0"
ONE_T_SAME = float(os.environ.get("AE_ONE_T_SAME", "1.5"))        # neighbouring thicknesses within this ratio are one wall drawn once ...
ONE_T_SPREAD = float(os.environ.get("AE_ONE_T_SPREAD", "1.5"))      # ... as long as the whole group stays within this ratio
ONE_T_REAL = float(os.environ.get("AE_ONE_T_REAL", "3.0"))        # a different thickness is real when it runs on for this many of its own thicknesses
ONE_T_OPEN = float(os.environ.get("AE_ONE_T_OPEN", "0.5"))        # a door or window takes the wall it stands in unless that wall is under half its own thickness (a stroke)
# Round 33 - flush faces at a jog.  Where a wall line changes thickness at a jog (two parallel sides joined by a short side
# across the wall), the drawing keeps one face straight; the traced centre-lines and the measured thicknesses miss it by a
# fraction of a pixel, and the app builds the miss as a step in that face (J, 12 Oct, on s070's bottom wall).  A face pair
# off by at most this many source pixels is made flush by moving the shorter side's centre-line (0 = off).
FLUSH_JOGS = float(os.environ.get("AE_FLUSH_JOGS", "1.5"))


def unify_wall_thickness(out, mm_per_px):
    """one thickness per run of a wall line: the level / plumb edges on one centre-line that touch end to end (both rooms'
    sides, door and window spans included) are grouped; their thicknesses are clustered (neighbours within ONE_T_SAME, the
    group within ONE_T_SPREAD); a cluster is real when its walls run on for ONE_T_REAL x its thickness, and every wall takes
    the length-weighted median of its own cluster - or, for a short odd piece, of the real cluster nearest in thickness; a
    door or window takes the wall it stands in (unless that "wall" is a stroke, under ONE_T_OPEN of the opening's own
    thickness).  Returns the number of edges whose thickness changed."""
    E = out["wallEdges"]
    recs = []
    for e in E:
        (ax, ay), (bx, by) = e["sourcePx"][:2]
        if abs(ay - by) <= 0.5 and abs(ax - bx) > 0.5:
            recs.append({"e": e, "o": "h", "c": (ay + by) / 2.0, "a": min(ax, bx), "b": max(ax, bx)})
        elif abs(ax - bx) <= 0.5 and abs(ay - by) > 0.5:
            recs.append({"e": e, "o": "v", "c": (ax + bx) / 2.0, "a": min(ay, by), "b": max(ay, by)})
    changed = 0
    for o in ("h", "v"):
        rs = sorted((r for r in recs if r["o"] == o), key=lambda r: r["c"])
        lines, cur = [], []
        for r in rs:                                       # one centre-line: within a pixel
            if cur and r["c"] - cur[-1]["c"] > 1.0:
                lines.append(cur); cur = []
            cur.append(r)
        if cur:
            lines.append(cur)
        for line in lines:
            line.sort(key=lambda r: r["a"])
            runs, run, reach = [], [], None
            for r in line:                                 # touching end to end (or overlapping)
                if run and r["a"] > reach + 1.0:
                    runs.append(run); run = []
                run.append(r); reach = r["b"] if len(run) == 1 else max(reach, r["b"])
            if run:
                runs.append(run)
            for run in runs:
                walls = [r for r in run if not r["e"].get("opening")]
                if not walls:
                    continue
                walls_t = sorted(walls, key=lambda r: r["e"]["thicknessPx"])
                clusters, cl = [], [walls_t[0]]
                for r in walls_t[1:]:
                    t_ = r["e"]["thicknessPx"]
                    if t_ <= ONE_T_SAME * cl[-1]["e"]["thicknessPx"] and t_ <= ONE_T_SPREAD * cl[0]["e"]["thicknessPx"]:
                        cl.append(r)
                    else:
                        clusters.append(cl); cl = [r]
                clusters.append(cl)

                def wmedian(rs_):
                    rs_ = sorted(rs_, key=lambda r: r["e"]["thicknessPx"]); half = sum(r["b"] - r["a"] for r in rs_) / 2.0; acc = 0.0
                    for r in rs_:
                        acc += r["b"] - r["a"]
                        if acc >= half:
                            return r["e"]["thicknessPx"]
                    return rs_[-1]["e"]["thicknessPx"]
                info = [(wmedian(c), sum(r["b"] - r["a"] for r in c), c) for c in clusters]
                real = [(t, L, c) for t, L, c in info if L >= ONE_T_REAL * t] or [max(info, key=lambda q: q[1])]
                for t, L, c in info:
                    target = t if any(c is c2 for _t, _L, c2 in real) else min(real, key=lambda q: abs(q[0] - t))[0]
                    for r in c:
                        r["t_new"] = target
                for r in run:                              # a door or window takes the wall it stands in
                    if r["e"].get("opening"):
                        nb = [w for w in walls if abs(w["b"] - r["a"]) <= 1.0 or abs(w["a"] - r["b"]) <= 1.0] or walls
                        t_nb = float(np.median([w["t_new"] for w in nb]))
                        r["t_new"] = t_nb if t_nb >= ONE_T_OPEN * r["e"]["thicknessPx"] else r["e"]["thicknessPx"]
                for r in run:
                    t_new = round(float(r["t_new"]), 2)
                    if abs(t_new - r["e"]["thicknessPx"]) > 0.01:
                        r["e"]["thicknessPx"] = t_new
                        if r["e"].get("thicknessMm") is not None and mm_per_px:
                            r["e"]["thicknessMm"] = int(round(t_new * mm_per_px))
                        changed += 1
    return changed


def flush_jog_faces(out, tol):
    """Round 33: at a jog of a room outline - level / plumb side A, a short side J across the wall, side B parallel to A and
    running on the same way - where A and B are walls of different thickness and one pair of their faces (A's and B's on
    the same side) misses by more than a twentieth and at most tol source px, while the other pair is two pixels or more
    apart (a real change of thickness), the shorter of A and B moves across, so that face runs straight on.  Only where no
    door, window or passage stands on A, J or B, where every other side meeting the moved side's two corners (in any room)
    runs across it (else the other one moves, if it can), and where the jog keeps its direction and a pixel of length; a move that gives the app a geometry
    problem it did not have is undone.  Works on the evidence, after unify_wall_thickness, so the thicknesses are final.
    Returns the number of sides moved."""
    E = {e["id"]: e for e in out["wallEdges"]}
    rooms = out["rooms"]
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    def pts(r):
        return [(q["x"], q["y"]) for q in r["sourcePoints"]]
    def axis(a, b):
        if abs(a[1] - b[1]) < 1e-6 and abs(a[0] - b[0]) > 1e-6:
            return 1                                         # level: the centre-line is a y
        if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) > 1e-6:
            return 0                                         # plumb: the centre-line is an x
        return None
    def sides_at(p):
        """every side, in every room, with a corner at p: (room, index of the side, its other corner)"""
        k_ = key(p); out_ = []
        for ri, r in enumerate(rooms):
            P = pts(r); n = len(P)
            for i in range(n):
                if key(P[i]) == k_:
                    out_.append((ri, i, P[(i + 1) % n]))
                    out_.append((ri, (i - 1) % n, P[i - 1]))
        return out_
    def outlines():
        return [pts(r) for r in rooms]
    before = {repr(p_) for p_ in app_geometry_problems(outlines())}
    moved = 0
    for ri in range(len(rooms)):
        n = len(rooms[ri]["sourcePoints"])
        for i in range(n):
            P = pts(rooms[ri]); ids = rooms[ri]["edgeIds"]; n = len(P)
            if n < 6:
                break
            a, b, c, d = P[i], P[(i + 1) % n], P[(i + 2) % n], P[(i + 3) % n]
            ax = axis(a, b)
            if ax is None or axis(c, d) != ax or axis(b, c) != 1 - ax:
                continue
            al = 1 - ax                                      # along A and B
            if (b[al] - a[al]) * (d[al] - c[al]) <= 0:
                continue
            eA, eJ, eB = E.get(ids[i]), E.get(ids[(i + 1) % n]), E.get(ids[(i + 2) % n])
            if not (eA and eJ and eB) or eA.get("opening") or eJ.get("opening") or eB.get("opening"):
                continue
            tA, tB = float(eA.get("thicknessPx") or 0), float(eB.get("thicknessPx") or 0)
            if tA <= 0 or tB <= 0:
                continue
            cA, cB = a[ax], c[ax]
            jog = cB - cA
            best = None
            for s_ in (1, -1):
                miss = (cA + s_ * tA / 2.0) - (cB + s_ * tB / 2.0)
                other = (cA - s_ * tA / 2.0) - (cB - s_ * tB / 2.0)
                if 0.05 < abs(miss) <= tol and abs(other) >= 2.0:
                    best = miss
            if best is None:
                continue
            new_jog = jog + best
            if abs(new_jog) < 1.0 or new_jog * jog <= 0:
                continue
            def free(ends):
                """every other side at the two corners runs across the side (in any room)"""
                own = {key(ends[0]), key(ends[1])}
                for p in ends:
                    for rj, j, q in sides_at(p):
                        if {key(p), key(q)} != own and axis(p, q) != 1 - ax:
                            return False                     # (the side itself, in this room or the one beyond it, is skipped)
                return True
            # B moves by +miss onto A's face, or A by -miss onto B's: the shorter one that can
            cands = sorted([(abs(d[al] - c[al]), (c, d), best, "B"), (abs(b[al] - a[al]), (a, b), -best, "A")], key=lambda q: q[0])
            pick = next((q for q in cands if free(q[1])), None)
            if pick is None:
                continue
            _L, ends, shift, which = pick
            # move the two corners, in every room and every wall edge that has them
            moves = {key(p): (p[0] + (shift if ax == 0 else 0.0), p[1] + (shift if ax == 1 else 0.0)) for p in ends}
            saved = ([[dict(q) for q in r["sourcePoints"]] for r in rooms], [[list(v) for v in e["sourcePx"]] for e in out["wallEdges"]])
            for r in rooms:
                for q in r["sourcePoints"]:
                    t_ = moves.get(key((q["x"], q["y"])))
                    if t_:
                        q["x"], q["y"] = t_
            for e in out["wallEdges"]:
                for v in e["sourcePx"]:
                    t_ = moves.get(key(v))
                    if t_:
                        v[0], v[1] = t_
            after = {repr(p_) for p_ in app_geometry_problems(outlines())}
            if after - before:
                for r, sp in zip(rooms, saved[0]):
                    r["sourcePoints"] = sp
                for e, sp in zip(out["wallEdges"], saved[1]):
                    e["sourcePx"] = sp
                continue
            before = after
            moved += 1
            if os.environ.get("AE_LOG_FLUSH"):
                print("flush jog: room %d side %d, %s moved %.2f px (faces %.2f off, jog %.2f -> %.2f)" % (
                    ri, i, which, shift, best, jog, new_jog), file=sys.stderr)
    return moved


# Round 35 - wall and window faces where the drawing has them.  The traced centre-lines and the one-thickness-per-wall-line
# rule put every piece of a wall line on one centre-line with one thickness.  The drawing often has thick blocks (RC walls,
# columns) with thin windows or infill between them, the thin piece flush with one face of the blocks (J, 13 Oct, on his
# own HDB plan: the top window of BEDROOM 3 is a thin band flush with the room side of the two columns, and the app made it
# a 400 mm window wall); and a wall, a window and a column of one wall line drawn flush on one face came out with their
# centre-lines 4 and 8 px apart, a step in both faces.  Each level / plumb wall and window piece takes the faces the drawing
# shows (the dark band across it, measured on the work image; a wall drawn as two outlines is one band), faces of one wall
# line within FIT_FACES px (or 0.2 T) of each other are made one straight face, and where two pieces of one line now differ
# in centre-line by a pixel or more a short jog joins them.  Guards: a wall's band stays near its trace and never thins it
# to one drawn line or under 80 mm; a window's band stays within its line's walls, and the window never stands out past
# them; two rooms' pieces over one stretch of wall take both their faces.  A wall line whose change leans a side, makes an
# outline double back, gives the app a geometry problem it did not have, or fails, is put back exactly as it was.
FIT_FACES = float(os.environ.get("AE_FIT_FACES", "1.5"))
FIT_FACES_LOG = os.environ.get("AE_FIT_FACES_LOG")
# Round 37 - the line-up round (J, 14 Oct: "proceed with the next round"; faces the drawing has straight come out
# straight in the app, "it should be 0mm").  Measured with the app check counting steps sideways (a corner point on a
# straight face is none), round 35's fitting made about half the steps left: each piece took its own drawn band, and
# pieces a fraction of a pixel apart in one straight drawn face came out as steps.  So a wall line's new faces are kept
# only when they add no step the drawing does not have (_guard_after: the walls seen from above, rasterised, before and
# after; the drawing's ink judges a new step) - or when they close a gap between walls or cover more drawn wall.  A
# jog round 35 puts in is a quarter thicker than long (the app squares a wall shorter than its thickness and mitres one
# as long, and a millimetre of rounding chose which), or a fifth thinner where that leaves fewer steps beside it
# (choose_jog_thickness).  And the app now puts each wall's faces on whole millimetres
# (lib/floor-plan-imports/vectorizer-face-millimetres.ts), so a piece's end lined up with a face goes there.
# 0 = round 36 exactly.
LINE_UP = os.environ.get("AE_LINE_UP", "1") != "0"
STEP_GUARD = LINE_UP                                         # (_guard_after)
APP_FACES = LINE_UP                                          # (_app_face_ends: the app's faces on whole millimetres)
JOG_T = 1.25 if LINE_UP else 1.0                             # (a jog's thickness over its length)


def _from_source(S, X, Y, _cache={}):
    """source px -> working px (the inverse of ToSource)"""
    x, y = X * S.pre, Y * S.pre
    if S.Hi is not None:
        Hm = _cache.get(id(S))
        if Hm is None:
            Hm = _cache[id(S)] = np.linalg.inv(S.Hi)
        q = Hm @ np.array([x, y, 1.0])
        x, y = float(q[0] / q[2]), float(q[1] / q[2])
    else:
        dx, dy = x - S.cx, y - S.cy
        x, y = S.cx + S.a * dx + S.b * dy, S.cy - S.b * dx + S.a * dy
    return (x - S.ox) * S.ws, (y - S.oy) * S.ws


def _sample(gray, x, y):
    H_, W_ = gray.shape
    if not (0 <= x < W_ - 1 and 0 <= y < H_ - 1):
        return 255.0
    x0, y0 = int(x), int(y); fx, fy = x - x0, y - y0
    g = gray[y0:y0 + 2, x0:x0 + 2].astype(np.float64)
    return float(g[0, 0] * (1 - fx) * (1 - fy) + g[0, 1] * fx * (1 - fy) + g[1, 0] * (1 - fx) * fy + g[1, 1] * fx * fy)


def drawn_band(gray, S, ax, c, a, b, t, multi=False):
    """the dark band the drawing has across a level (ax 'h': centre-line y = c, from x = a to b) or plumb edge, in source
    px: (lo, hi) as medians over stations at 20-80 % of its length, or None when fewer than 60 % of them show one.  At a
    station the band is the dark run (darker than halfway between the paper and the darkest point within t/2 of the
    centre-line) through that darkest point, gaps of up to 0.75 t bridged in a wall (one drawn as two outlines) and 0.5 t in a
    window (several thin lines)."""
    step = 0.5
    reach = t / 2.0 + max(3.0, 0.5 * t)
    offs = np.arange(-reach, reach + 1e-9, step)
    inner = np.abs(offs) <= t / 2.0
    gap = (max(1.5, 0.5 * t) if multi else max(1.0, 0.75 * t)) / step    # a window: frame and glass lines; a wall: drawn
                                                                         # solid, or as two outlines (room4, J's plan)
    L = b - a
    n = max(3, min(40, int(L / 2.0)))
    lows, highs = [], []
    for s in np.linspace(a + 0.2 * L, a + 0.8 * L, n):
        v = np.array([_sample(gray, *_from_source(S, *((s, c + d) if ax == "h" else (c + d, s)))) for d in offs])
        paper, i_dark = float(np.percentile(v, 90)), int(np.argmin(np.where(inner, v, 1e9)))
        if paper - v[i_dark] < 40.0:
            continue
        dark = v < (paper + v[i_dark]) / 2.0
        lo = hi = i_dark
        miss = 0
        for i in range(i_dark - 1, -1, -1):
            if dark[i]:
                lo, miss = i, 0
            else:
                miss += 1
                if miss > gap:
                    break
        miss = 0
        for i in range(i_dark + 1, len(offs)):
            if dark[i]:
                hi, miss = i, 0
            else:
                miss += 1
                if miss > gap:
                    break
        if lo == 0 or hi == len(offs) - 1:
            continue                                         # the run leaves the window: not one band
        lows.append(offs[lo] - step / 2.0); highs.append(offs[hi] + step / 2.0)
    if len(lows) < 0.6 * n:
        return None
    return c + float(np.median(lows)), c + float(np.median(highs))


def _corner_keys(E, rooms):
    """one key per corner: rooms' corners and edges' ends within half a pixel of each other are the same corner (welding
    leaves some a few tenths apart)"""
    canon, grid = {}, {}
    def key(p):
        k6 = (round(p[0], 6), round(p[1], 6))
        if k6 in canon:
            return canon[k6]
        gx, gy = int(math.floor(p[0] / 0.5)), int(math.floor(p[1] / 0.5))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in grid.get((gx + dx, gy + dy), ()):
                    if abs(q[0] - p[0]) <= 0.5 and abs(q[1] - p[1]) <= 0.5:
                        canon[k6] = q
                        return q
        grid.setdefault((gx, gy), []).append(k6); canon[k6] = k6
        return k6
    for e in E:
        for v in e["sourcePx"]:
            key(v)
    for r in rooms:
        for q in r["sourcePoints"]:
            key((q["x"], q["y"]))
    return key


def _drawing_across(gray, S, ax, s_, offs):
    """the drawing across a level (ax 'h') or plumb edge at station s_, at the offsets given; with its paper and darkest"""
    v = np.array([_sample(gray, *_from_source(S, *((s_, d) if ax == "h" else (d, s_)))) for d in offs])
    return v, float(np.percentile(v, 90)), float(v.min())


def _band_stations(a, b):
    L = b - a
    n = max(3, min(40, int(L / 2.0)))
    return n, np.linspace(a + 0.2 * L, a + 0.8 * L, n)


def _dark_runs(v, paper, dark, offs):
    """the drawn lines across one station: [(lo, hi)] offsets of each run darker than halfway (and than 180)"""
    ink = v <= max(180.0, (paper + dark) / 2.0)
    runs, i = [], 0
    while i < len(ink):
        if ink[i]:
            j = i
            while j + 1 < len(ink) and ink[j + 1]:
                j += 1
            runs.append((offs[i] - 0.25, offs[j] + 0.25))
            i = j + 1
        else:
            i += 1
    return runs


def _outline_pair(gray, S, ax, c, a, b, t, mm_px):
    """round 36 (J, 13 Oct, his PDF's BATH/W.C. 2): a wall drawn as two thin lines with paper between, traced with one
    of them inside the trace and the other past its face (the reader took the paper on the room's side for wall).  At
    each station, on the side where it holds: the outermost line in the trace and the first line past that face, both
    thin, paper between, the second at most a wall's thickness out, the two from 0.75 to 1.4 thicknesses (and at least
    80 mm) across, and past the face by more than round 35's margin.  Returns (lo, hi, alone) as medians when three
    fifths of the stations agree on one side, alone when the trace holds only that one line, at its face; else None."""
    lo_t, hi_t = c - t / 2.0, c + t / 2.0
    thin = min(3.0, t / 2.5)
    w_min = max(0.75 * t, min(t, 80.0 / mm_px if mm_px else 0.0))
    offs = np.arange(-t / 2.0 - max(3.0, t), t / 2.0 + max(3.0, t) + 1e-9, 0.5)
    n, at = _band_stations(a, b)
    got = {0: [], 1: []}
    for s_ in at:
        v, paper, dark = _drawing_across(gray, S, ax, s_, c + offs)
        if paper - dark < 40.0:
            continue
        runs = [(c + r0, c + r1) for r0, r1 in _dark_runs(v, paper, dark, offs)]
        inside = [r for r in runs if r[1] > lo_t and r[0] < hi_t]
        for side in (0, 1):
            past = [r for r in runs if (r[0] >= hi_t if side else r[1] <= lo_t)]
            if not inside or not past:
                continue
            r1 = max(inside) if side else min(inside)
            r2 = min(past) if side else max(past)
            band = (r1[0], r2[1]) if side else (r2[0], r1[1])
            gap = r2[0] - r1[1] if side else r1[0] - r2[1]
            beyond = band[1] - hi_t if side else lo_t - band[0]
            if (r1[1] - r1[0] > thin or r2[1] - r2[0] > thin or gap < 1.0 or beyond > max(3.0, t) + thin
                    or beyond <= max(2.0, 0.25 * t) or not (w_min <= band[1] - band[0] <= 1.4 * t)):
                continue
            face = hi_t if side else lo_t
            alone = len(inside) == 1 and abs((r1[0] + r1[1]) / 2.0 - face) <= t / 3.0
            got[side].append((band[0], band[1], alone))
    side = max((0, 1), key=lambda k: len(got[k]))
    if len(got[side]) < 0.6 * n:
        return None
    g = got[side]
    return (float(np.median([x[0] for x in g])), float(np.median([x[1] for x in g])),
            sum(x[2] for x in g) >= 0.6 * n)


def _drawn_pieces(E, gray, S, mm_px):
    """1  the pieces: level / plumb edges, with the drawn band of each wall and window.  A wall's band must lie within its
    trace (a quarter of its thickness either side) and never thins it to one drawn line or under 80 mm; a window's band is
    checked against its line's walls later (_line_plan)."""
    pcs = {}
    for e in E:
        (x0, y0), (x1, y1) = e["sourcePx"][:2]
        t = float(e.get("thicknessPx") or 0)
        if t <= 0:
            continue
        if abs(y0 - y1) < 1e-6 and abs(x0 - x1) > 1e-6:
            ax, c, a, b = "h", y0, min(x0, x1), max(x0, x1)
        elif abs(x0 - x1) < 1e-6 and abs(y0 - y1) > 1e-6:
            ax, c, a, b = "v", x0, min(y0, y1), max(y0, y1)
        else:
            continue
        kind = (e.get("opening") or {}).get("kind") or "wall"
        band = None
        if kind in ("wall", "window") and b - a >= max(6.0, 0.5 * t):
            band = drawn_band(gray, S, ax, c, a, b, t, multi=(kind == "window"))
        if band:
            w = band[1] - band[0]
            if kind == "wall":
                m_out = max(2.0, 0.25 * t)
                if not (0.45 * t <= w <= 1.8 * t) or band[0] < c - t / 2.0 - m_out or band[1] > c + t / 2.0 + m_out \
                        or w < max(0.6 * t, min(t, 80.0 / mm_px if mm_px else 0.0)):
                    band = None
            elif not (max(2.5, 0.12 * t) <= w <= 1.15 * t):
                band = None
        pair = _outline_pair(gray, S, ax, c, a, b, t, mm_px) if kind == "wall" and b - a >= max(6.0, 0.5 * t) else None
        pcs[e["id"]] = {"e": e, "ax": ax, "c": c, "a": a, "b": b, "t": t, "kind": kind,
                        "band": band, "ends": [tuple(e["sourcePx"][0]), tuple(e["sourcePx"][1])],
                        "outline": bool(pair and pair[2]), "pair": pair[:2] if pair else None}
    return pcs


def _wall_lines(pcs, key):
    """2  wall lines: pieces of one axis meeting end to end, directly or through a jog across the line no longer than the
    larger thickness, and twins (two rooms' pieces over one stretch of one wall, one room seeing a wall where the other sees
    a window) even where their ends do not meet.  Returns (neighbours per piece, the lines of two pieces or more)."""
    at = {}
    for pid, p in pcs.items():
        for q in p["ends"]:
            at.setdefault(key(q), []).append(pid)
    def along(p, q):
        return q[0] if p["ax"] == "h" else q[1]
    nb = {pid: set() for pid in pcs}
    for pid, p in pcs.items():
        for q in p["ends"]:
            for oid in at.get(key(q), []):
                if oid == pid:
                    continue
                if pcs[oid]["ax"] == p["ax"]:
                    nb[pid].add(oid)
                    continue
                j = pcs[oid]
                if j["b"] - j["a"] <= max(p["t"], 1.0) and j["kind"] == "wall":
                    far = j["ends"][1] if key(j["ends"][0]) == key(q) else j["ends"][0]
                    for rid in at.get(key(far), []):
                        if rid not in (pid, oid) and pcs[rid]["ax"] == p["ax"] and abs(along(p, q) - along(p, far)) < 1e-6:
                            nb[pid].add(rid); nb[rid].add(pid)
    by_ax = {}
    for p in pcs.values():
        by_ax.setdefault(p["ax"], []).append(p)
    for ps_ in by_ax.values():
        ps_.sort(key=lambda p: p["c"])
        for i, p in enumerate(ps_):
            for q in ps_[i + 1:]:
                if q["c"] - p["c"] >= 0.5:
                    break
                if min(p["b"], q["b"]) - max(p["a"], q["a"]) > 0.5:
                    nb[p["e"]["id"]].add(q["e"]["id"]); nb[q["e"]["id"]].add(p["e"]["id"])
    seen, lines = set(), []
    for pid in pcs:
        if pid in seen:
            continue
        comp, stack = [], [pid]; seen.add(pid)
        while stack:
            u = stack.pop(); comp.append(u)
            for w in sorted(nb[u]):                         # (sorted: a set's order follows the hash seed)
                if w not in seen:
                    seen.add(w); stack.append(w)
        if len(comp) > 1:
            lines.append(comp)
    return nb, lines


def _face_lines(P, tol_):
    """3  each piece's faces: the drawn faces of the line clustered within tol_ (length-weighted) on each side, a piece
    taking the cluster nearest its own face when within tol_"""
    new = {}
    for side in (0, 1):
        vals = sorted((p["band"][side], max(p["b"] - p["a"], 1e-6)) for p in P if p["band"])
        groups = []
        for v, w in vals:
            if groups and v - groups[-1][-1][0] <= tol_:
                groups[-1].append((v, w))
            else:
                groups.append([(v, w)])
        lines_ = [sum(v * w for v, w in g) / sum(w for v, w in g) for g in groups]
        for p in P:
            f = p["band"][side] if p["band"] else p["c"] + (p["t"] / 2.0 if side else -p["t"] / 2.0)
            near = min(lines_, key=lambda L_: abs(L_ - f)) if lines_ else None
            new.setdefault(id(p), [None, None])[side] = near if near is not None and abs(near - f) <= tol_ else f
    return new


def _drop_stray_window_bands(P):
    """a window's drawn faces stand within its line's traced walls (a window traced off the wall's middle still has its
    frame there, J's BEDROOM 3), or within its own trace where the line has no walls: else the band is not the window's"""
    tw = [(p["c"] - p["t"] / 2.0, p["c"] + p["t"] / 2.0) for p in P if p["kind"] == "wall"]
    for p in P:
        if p["kind"] == "window" and p["band"]:
            lo_, hi_ = (min(f[0] for f in tw), max(f[1] for f in tw)) if tw else (p["c"] - p["t"] / 2.0, p["c"] + p["t"] / 2.0)
            m_out = max(2.0, 0.25 * p["t"])
            if p["band"][0] < lo_ - m_out or p["band"][1] > hi_ + m_out:
                p["band"] = None


def _clamp_windows(P, new):
    """no face of a window stands out past its line's walls' outermost faces (a ledge or railing line drawn beside the
    frame, J's BEDROOM 2)"""
    walls_ = [new[id(p)] for p in P if p["kind"] == "wall"]
    if not walls_:
        return
    env = (min(f[0] for f in walls_), max(f[1] for f in walls_))
    for p in P:
        if p["kind"] == "window" and p["band"]:
            lo, hi = max(new[id(p)][0], env[0]), min(new[id(p)][1], env[1])
            new[id(p)] = [lo, hi] if hi - lo >= max(1.0, 0.12 * p["t"]) else [p["c"] - p["t"] / 2.0, p["c"] + p["t"] / 2.0]


def _outline_line(P):
    """round 36: a wall line drawn as two thin lines with paper between and traced off them (J's BATH/W.C. 2) takes the
    two lines as the band of every wall piece - when a piece of it holds only the inner line, at its trace's face, and
    every wall piece of the line shows the same two lines (within 1.5 px; a piece whose trace also holds a fixture's edge
    still shows them).  Otherwise nothing changes: a railing or a fixture's edge beside part of a line is no wall."""
    seeds = [p for p in P if p.get("outline")]
    if not seeds:
        return
    lo = float(np.median([p["pair"][0] for p in seeds]))
    hi = float(np.median([p["pair"][1] for p in seeds]))
    walls = [p for p in P if p["kind"] == "wall"]
    if all(p.get("pair") and abs(p["pair"][0] - lo) <= 1.5 and abs(p["pair"][1] - hi) <= 1.5 for p in walls):
        for p in walls:
            p["band"] = (lo, hi)


def _line_plan(P, nb, key, tol_):
    """3-5 for one wall line: {edge id: (centre-line, thickness)} of the pieces that change"""
    ids = {p["e"]["id"]: p for p in P}
    _drop_stray_window_bands(P)
    _outline_line(P)
    new = _face_lines(P, tol_)
    _clamp_windows(P, new)
    # 4  doors and passages take the faces of the pieces they stand between when those agree
    for p in P:
        if p["kind"] in ("wall", "window") or p["band"]:
            continue
        ns = [ids[i] for i in sorted(nb[p["e"]["id"]]) if i in ids]
        if ns and all(abs(new[id(n_)][0] - new[id(ns[0])][0]) <= 0.25 and abs(new[id(n_)][1] - new[id(ns[0])][1]) <= 0.25 for n_ in ns):
            new[id(p)] = list(new[id(ns[0])])
        else:
            new[id(p)] = [p["c"] - p["t"] / 2.0, p["c"] + p["t"] / 2.0]
    plan = {}
    for p in P:
        lo, hi = new[id(p)]
        c2, t2 = (lo + hi) / 2.0, hi - lo
        if t2 >= 1.0 and (abs(c2 - p["c"]) >= 0.25 or abs(t2 - p["t"]) >= 0.25):
            plan[p["e"]["id"]] = (c2, t2)
    if not plan:
        return plan
    # 5  pieces meeting end to end keep one centre-line unless they now differ by a pixel or more: such pieces are grouped
    #    (through every joint under a pixel) and the group takes its length-weighted centre-line; twins take the faces of
    #    both together (what the app draws of the two)
    cen = {i: plan.get(i, (p["c"], p["t"]))[0] for i, p in ids.items()}
    parent = {i: i for i in cen}
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i, p in ids.items():
        for oid in sorted(nb[i]):
            if oid in ids and any(key(u) == key(v) for u in p["ends"] for v in ids[oid]["ends"]) and abs(cen[i] - cen[oid]) < 1.0:
                parent[root(i)] = root(oid)
    for p in P:
        for q in P:
            if p is not q and abs(p["c"] - q["c"]) < 0.5 and min(p["b"], q["b"]) - max(p["a"], q["a"]) > 0.5:
                fp, fq = (plan.get(o["e"]["id"], (o["c"], o["t"])) for o in (p, q))
                lo, hi = min(fp[0] - fp[1] / 2.0, fq[0] - fq[1] / 2.0), max(fp[0] + fp[1] / 2.0, fq[0] + fq[1] / 2.0)
                plan[p["e"]["id"]] = plan[q["e"]["id"]] = ((lo + hi) / 2.0, hi - lo)
                cen[p["e"]["id"]] = cen[q["e"]["id"]] = (lo + hi) / 2.0
                parent[root(p["e"]["id"])] = root(q["e"]["id"])
    groups_ = {}
    for i in cen:
        groups_.setdefault(root(i), []).append(i)
    for g in groups_.values():
        if len(g) < 2 or max(cen[i] for i in g) - min(cen[i] for i in g) < 1e-9:
            continue
        w_ = {i: max(ids[i]["b"] - ids[i]["a"], 1e-6) for i in g}
        cm = sum(cen[i] * w_[i] for i in g) / sum(w_.values())
        for i in g:
            plan[i] = (cm, plan.get(i, (ids[i]["c"], ids[i]["t"]))[1])
    return {i: v for i, v in plan.items() if abs(v[0] - ids[i]["c"]) >= 0.25 or abs(v[1] - ids[i]["t"]) >= 0.25}


_NO_MM = object()


def _snapshot(E, rooms):
    return (list(E), [([list(v) for v in e["sourcePx"]], e["thicknessPx"], e.get("thicknessMm", _NO_MM)) for e in E],
            [[dict(q) for q in r["sourcePoints"]] for r in rooms], [r["edgeIds"][:] for r in rooms])


def _restore(E, rooms, saved):
    """the edges (with any a jog's closing took out), their ends and thicknesses, and the rooms, exactly as before"""
    E[:] = saved[0]
    for e, (sp, t, tm) in zip(E, saved[1]):
        if len(e["sourcePx"]) == len(sp):                    # in place: the scale estimate's door list shares these
            for v, w in zip(e["sourcePx"], sp):
                v[:] = w
        else:
            e["sourcePx"] = sp
        e["thicknessPx"] = t
        if tm is _NO_MM:
            e.pop("thicknessMm", None)
        else:
            e["thicknessMm"] = tm
    for r, sp, ids in zip(rooms, saved[2], saved[3]):
        r["sourcePoints"] = sp; r["edgeIds"] = ids


def fit_drawn_faces(out, gray, S, T, tol):
    """Round 35 (see above).  Returns the number of pieces whose faces moved.  Each wall line is done on its own; a line
    whose change leans a side, makes an outline double back, gives the app a geometry problem it did not have, or cannot be
    done (an error is counted in the diagnostics as faceLinesThatFailed) is put back exactly as it was."""
    if gray is None or tol <= 0:
        return 0
    E = out["wallEdges"]; rooms = out["rooms"]
    key = _corner_keys(E, rooms)
    tol_ = max(tol, 0.2 * T)
    pcs = _drawn_pieces(E, gray, S, (out.get("scale") or {}).get("millimetresPerPixel"))
    nb, lines = _wall_lines(pcs, key)
    outlines = lambda: [[(q["x"], q["y"]) for q in r["sourcePoints"]] for r in rooms]
    before, slant0, spike0 = {repr(p_) for p_ in app_geometry_problems(outlines())}, _slanted(out), _spikes(out)
    moved = failed = 0
    next_id = [max((int(e["id"][1:]) for e in E if e["id"][1:].isdigit()), default=0) + 1]
    for comp in lines:
        live = {e["id"] for e in E}                          # (a jog closed up by a line done before is gone)
        P = [pcs[i] for i in comp if i in live]
        for p in P:                                          # a line done before may have moved these pieces' ends
            p["ends"] = [tuple(v) for v in p["e"]["sourcePx"][:2]]
            u = [v[0] if p["ax"] == "h" else v[1] for v in p["ends"]]
            p["a"], p["b"] = min(u), max(u)
        P = [p for p in P if p["b"] - p["a"] > 1e-6]
        if len(P) < 2:
            continue
        saved = _snapshot(E, rooms)
        guard = None
        try:
            plan = _line_plan(P, nb, key, tol_)
            if not plan:
                continue
            guard = _quietly(_guard_before, E, P, gray, S) if STEP_GUARD else None
            res = _apply_face_plan(out, pcs, plan, nb, key, next_id, {p["e"]["id"] for p in P})
        except Exception as ex:                              # a refinement: the line stays as traced, the export goes on
            plan, res = {}, "it failed: %s: %s" % (type(ex).__name__, ex)
            failed += 1
        ok = res is True
        if ok and _slanted(out) > slant0:
            res, ok = "a side would lean", False
        if ok and _spikes(out) > spike0:
            res, ok = "an outline would double back (h1 low-res: a window moved past the corner its jog meets)", False
        if ok and guard is not None:
            why = _quietly(_guard_after, guard, E, gray, S)
            if why:
                res, ok = why, False
        after = {repr(p_) for p_ in app_geometry_problems(outlines())} if ok else None
        if not ok or after - before:
            _restore(E, rooms, saved)
            if FIT_FACES_LOG:
                print("faces: line %s left (%s)" % (",".join(sorted(comp)), res if not ok else "app problem: %s" % sorted(after - before)[:2]), file=sys.stderr)
            continue
        before, slant0, spike0 = after, _slanted(out), _spikes(out)
        moved += len(plan)
        if FIT_FACES_LOG:
            print("faces: line %s: %s" % (",".join(sorted(comp)), "; ".join("%s c %.1f->%.1f t %.1f->%.1f" % (
                i, pcs[i]["c"], c2, pcs[i]["t"], t2) for i, (c2, t2) in sorted(plan.items()))), file=sys.stderr)
    out.setdefault("diagnostics", {})["faceLinesThatFailed"] = failed
    return moved


# Round 37 - no step beside a jog (J, 15 Oct, on the review of round 37's new steps: "all of those step shouldbe
# removed").  The app squares a wall shorter than its thickness (a plain rectangle between its centre-line ends) and runs
# a longer one on past a square corner by half the wall it meets; which of the two leaves a step beside a jog depends on
# its neighbours (h1: a short, thick piece beside the jog, whose end then shows; s016: beside a column, where the run-on
# stands out).  So each jog takes, of a quarter thicker than long (squared) and a fifth thinner (run on), the thickness
# that leaves fewer steps beside it as the app joins the walls, replayed by app_footprints.py; on a tie it keeps the
# one it has.  Once before the standalone walls are fitted (they are fitted to the walls as built) and once after.
JOG_CHOICE = LINE_UP
JOG_RUN_ON = 0.8


def choose_jog_thickness(out, jogs):
    """Round 37 (see above): `jogs` [(jog edge, piece id, other piece id)] as the face fitting made them (a jog of a line
    put back, or closed up, is no longer among the edges, and its id may since be another's).  Returns the ids of the
    jogs whose thickness changed."""
    changed = set()
    if not JOG_CHOICE or not jogs or not (out.get("scale") or {}).get("millimetresPerPixel"):
        return changed
    import app_footprints
    E = out["wallEdges"]
    by_id, live, mm_px = {e["id"]: e for e in E}, {id(e) for e in E}, float(out["scale"]["millimetresPerPixel"])
    for _ in range(2):                                       # (two jogs side by side: the second pass sees the first)
        for j, pid, oid in jogs:
            p, o, jid = by_id.get(pid), by_id.get(oid), j["id"]
            if id(j) not in live or p is None or o is None:
                continue                                     # (a line put back, or a jog closed up)
            (ax, ay), (bx, by) = j["sourcePx"][:2]
            L, cap = math.hypot(bx - ax, by - ay), min(p["thicknessPx"], o["thicknessPx"])
            if L <= 0:
                continue
            centre = ((ax + bx) / 2.0, (ay + by) / 2.0)
            radius = max(3.0, L / 2 + max(p["thicknessPx"], o["thicknessPx"]) / 2 + 2)
            options = []
            for t in (j["thicknessPx"], round(min(cap, max(1.0, JOG_T * L)), 2), round(min(cap, max(1.0, JOG_RUN_ON * L)), 2)):
                if all(abs(t - u) > 1e-3 for u, _ in options):
                    try:
                        n = len(app_footprints.local_steps(E, centre, radius, mm_px, override={jid: t}))
                    except Exception:                        # (a refinement: an odd neighbourhood keeps the jog as it is)
                        n = None
                    if n is None:
                        break
                    options.append((t, n))
            best = min(options, key=lambda tn: tn[1]) if options else None    # (the first, as it is, on a tie)
            if best is not None and abs(best[0] - j["thicknessPx"]) > 1e-6:
                j["thicknessPx"] = best[0]
                if j.get("thicknessMm") is not None:
                    j["thicknessMm"] = int(round(best[0] * mm_px))
                changed.add(jid)
    return changed


# Round 37 - a standalone wall's faces on the walls it stands against (s056: a column standing on a wall, its side a
# pixel short of the wall's end as the app builds it, a step).  The standalone walls (round 36) are fitted to the walls
# the app will build as leftover_walls pictures them, and the app runs a wall's end on past a square corner, so the
# picture can be a pixel out.  Each face of a level or plumb standalone wall with two free ends may move onto a face of
# a wall it stands against, as the app builds it (app_footprints.py), up to SA_FACE_PX, when that leaves fewer steps
# beside it; never thinner than the app's 40 mm.
SA_FACES = LINE_UP
SA_FACE_PX = 1.5


def standalone_faces_on_walls(out, added):
    """Round 37 (see above): the last `added` wall edges are the standalone walls.  Returns the number moved."""
    if not SA_FACES or not added or not (out.get("scale") or {}).get("millimetresPerPixel"):
        return 0
    import app_footprints
    E, mm_px = out["wallEdges"], float(out["scale"]["millimetresPerPixel"])
    count = {}
    for e in E:
        for q in e["sourcePx"][:2]:
            count[(round(q[0], 3), round(q[1], 3))] = count.get((round(q[0], 3), round(q[1], 3)), 0) + 1
    moved = 0
    for e in E[len(E) - added:]:
        try:
            moved += _standalone_faces(e, E, mm_px, count, app_footprints)
        except Exception:                                    # (a refinement: an odd neighbourhood keeps the wall as it is)
            continue
    return moved


def _standalone_faces(e, E, mm_px, count, app_footprints):
    """one standalone wall's faces (see standalone_faces_on_walls): 1 when they moved, else 0"""
    (ax, ay), (bx, by) = e["sourcePx"][:2]
    level = abs(ay - by) < 1e-9 < abs(ax - bx)
    if not level and not abs(ax - bx) < 1e-9 < abs(ay - by):
        return 0
    if any(count.get((round(q[0], 3), round(q[1], 3)), 0) != 1 for q in e["sourcePx"][:2]):
        return 0                                             # (an end on a corner stays where the corner is)
    t, c = float(e["thicknessPx"]), (ay if level else ax)
    centre, radius = ((ax + bx) / 2.0, (ay + by) / 2.0), math.hypot(bx - ax, by - ay) / 2 + 2 * t + 4

    def steps_with(lo, hi):
        c2 = (lo + hi) / 2
        sp = [[ax, c2], [bx, c2]] if level else [[c2, ay], [c2, by]]
        return len(app_footprints.local_steps(E, centre, radius, mm_px, override={e["id"]: {"sourcePx": sp, "thicknessPx": hi - lo}}))

    lo0, hi0 = c - t / 2, c + t / 2
    best = (lo0, hi0, steps_with(lo0, hi0))
    if best[2] == 0:
        return 0
    k = 1 if level else 0
    faces = sorted({round(q[k], 3) for w in app_footprints.local_walls(E, centre, radius + 40.0, mm_px)
                    if w.id != e["id"] for q in w.fp.values()})
    options = lambda f: [f] + [g for g in faces if 0.05 < abs(g - f) <= SA_FACE_PX]
    for lo in options(lo0):
        for hi in options(hi0):
            if (lo, hi) != (lo0, hi0) and hi - lo >= 40.0 / mm_px:
                n = steps_with(lo, hi)
                if n < best[2]:
                    best = (lo, hi, n)
    if (best[0], best[1]) == (lo0, hi0):
        return 0
    c2 = round((best[0] + best[1]) / 2, 3)
    e["sourcePx"] = [[ax, c2], [bx, c2]] if level else [[c2, ay], [c2, by]]
    e["thicknessPx"] = round(best[1] - best[0], 2)
    if e.get("thicknessMm") is not None:
        e["thicknessMm"] = int(round((best[1] - best[0]) * mm_px))
    return 1


def _quietly(fn, *args):
    """the guard is a check on a refinement: should it fail, the line goes on as round 35 had it"""
    try:
        return fn(*args)
    except Exception:                                        # (numpy / OpenCV on an odd region)
        return None


def _plan_joints(E):
    """{end (source px, 2 places): {direction N E S W: thickness}} of the level / plumb edges leaving each end"""
    J = {}
    for e in E:
        (x0, y0), (x1, y1) = e["sourcePx"][:2]
        t = float(e.get("thicknessPx") or 0)
        for (x, y), (ox, oy) in (((x0, y0), (x1, y1)), ((x1, y1), (x0, y0))):
            d = J.setdefault((round(x, 2), round(y, 2)), {})
            if abs(oy - y) <= 1e-6 and abs(ox - x) > 1e-6:
                k_ = "E" if ox > x else "W"
            elif abs(ox - x) <= 1e-6 and abs(oy - y) > 1e-6:
                k_ = "S" if oy > y else "N"
            else:
                continue
            d[k_] = max(t, d.get(k_, 0.0))
    return J


def _top_view(E, region):
    """the walls seen from above inside region (source px), as the app joins them - each level / plumb edge a rectangle,
    its ends carried to the faces of the walls meeting it across - rasterised at up to 10 per source px: (mask, x0, y0,
    zoom), or None where a slanted wall lies in the region (its stairs would read as steps)"""
    x0, y0, x1, y1 = region
    z = min(10.0, math.sqrt(12e6 / max((x1 - x0) * (y1 - y0), 1.0)))
    J = _plan_joints(E)
    W_, H_ = int(math.ceil((x1 - x0) * z)) + 1, int(math.ceil((y1 - y0) * z)) + 1
    mask = np.zeros((H_, W_), np.uint8)
    for e in E:
        (ax, ay), (bx, by) = e["sourcePx"][:2]
        t = float(e.get("thicknessPx") or 0)
        if t <= 0 or max(ax, bx) + t < x0 or min(ax, bx) - t > x1 or max(ay, by) + t < y0 or min(ay, by) - t > y1:
            continue
        lv, pl = abs(ay - by) <= 1e-6 < abs(ax - bx), abs(ax - bx) <= 1e-6 < abs(ay - by)
        if not (lv or pl):
            if math.hypot(bx - ax, by - ay) > 1e-6:
                return None
            continue
        ext = [max(J.get((round(q[0], 2), round(q[1], 2)), {}).get(d_, 0.0) for d_ in (("N", "S") if lv else ("E", "W"))) / 2.0
               for q in ((ax, ay), (bx, by))]
        if lv:
            (lo, elo), (hi, ehi) = sorted(((ax, ext[0]), (bx, ext[1])))
            r_ = (lo - elo, ay - t / 2.0, hi + ehi, ay + t / 2.0)
        else:
            (lo, elo), (hi, ehi) = sorted(((ay, ext[0]), (by, ext[1])))
            r_ = (ax - t / 2.0, lo - elo, ax + t / 2.0, hi + ehi)
        pts = np.array([[r_[0], r_[1]], [r_[2], r_[1]], [r_[2], r_[3]], [r_[0], r_[3]]]) - (x0, y0)
        cv2.fillPoly(mask, [np.round(pts * z * 16).astype(np.int32)], 255, shift=4)
    return mask, x0, y0, z


def _view_steps(view):
    """the steps in a top view's outline: [(x, y, size, A, B, C, D, n)] in source px - a jog of 0.1 to 2 px between two
    sides of 2 px or more running on the same way (as the app check counts them), n the outward normal of the sides.
    Read off the pixel edges between wall and paper: a run of them ending where a parallel run, facing the same way,
    starts a little across"""
    mask, x0, y0, z = view
    m = mask > 0
    found = []
    for flip in (False, True):                               # (level faces, then plumb ones on the transposed view)
        mm_ = m.T if flip else m
        H_, W_ = mm_.shape
        for face, out_ in (((mm_[:-1] & ~mm_[1:]), 1.0), ((~mm_[:-1] & mm_[1:]), -1.0)):
            ends, starts = {}, {}
            for y in np.nonzero(face.any(axis=1))[0]:
                row = np.concatenate(([0], face[y].astype(np.int8), [0]))
                d_ = np.diff(row)
                for xs_, xe_ in zip(np.nonzero(d_ == 1)[0], np.nonzero(d_ == -1)[0]):
                    if xs_ == 0 or xe_ >= W_ - 1 or xe_ - xs_ < 2 * z:
                        continue                             # (cut by the region's edge, or shorter than 2 px)
                    ends.setdefault(int(xe_), []).append((int(y), int(xs_)))
                    starts.setdefault(int(xs_), []).append((int(y), int(xe_)))
            for e_, rs in ends.items():
                for y1, s1 in rs:
                    for y2, e2 in starts.get(e_, ()):
                        k = abs(y2 - y1)
                        if not (0.1 * z - 0.5 <= k < 2 * z) or k == 0:
                            continue
                        A, B, C, D = (s1, y1 + 1), (e_, y1 + 1), (e_, y2 + 1), (e2, y2 + 1)
                        pts = [((q[1], q[0]) if flip else q) for q in (A, B, C, D)]
                        src = [(x0 + q[0] / z, y0 + q[1] / z) for q in pts]
                        n_ = (out_, 0.0) if flip else (0.0, out_)
                        found.append(((src[1][0] + src[2][0]) / 2.0, (src[1][1] + src[2][1]) / 2.0, k / z) + tuple(src) + (n_,))
    return found


def _drawn_edge(gray, S, p, n):
    """the drawing's dark-to-light edge nearest p along the outward normal n (source px), as an offset, or None"""
    offs = np.arange(-2.5, 2.5001, 0.1)
    v = np.array([_sample(gray, *_from_source(S, p[0] + o * n[0], p[1] + o * n[1])) for o in offs])
    paper, dark = float(np.percentile(v, 90)), float(v.min())
    if paper - dark < 40.0:
        return None
    lev = (paper + dark) / 2.0
    best = None
    for i in range(len(v) - 1):
        if v[i] <= lev < v[i + 1]:
            t_ = offs[i] + (lev - v[i]) / (v[i + 1] - v[i]) * (offs[i + 1] - offs[i])
            if best is None or abs(t_) < abs(best):
                best = t_
    return best


def _drawn_jog(gray, S, st):
    """does the drawing have this step: its edge on either side, 1.5 to 4 px from the corner, a jog as large (within
    0.35 px)?"""
    _, _, size, A, B, C, D, n = st
    app = (C[0] - B[0]) * n[0] + (C[1] - B[1]) * n[1]
    sides = []
    for corner, far in ((B, A), (C, D)):
        dx, dy = far[0] - corner[0], far[1] - corner[1]
        L = math.hypot(dx, dy)
        got = [e_ for s_ in (1.5, 2.25, 3.0, 4.0) if s_ <= L - 0.5
               for e_ in [_drawn_edge(gray, S, (corner[0] + dx / L * s_, corner[1] + dy / L * s_), n)] if e_ is not None]
        sides.append(float(np.median(got)) if got else None)
    if None in sides:
        return False
    drawn = app + sides[1] - sides[0]                        # (the drawing's own jog there, along n)
    return abs(drawn - app) <= 0.35 and abs(drawn) > 0.35


def _guard_before(E, P, gray, S):
    """the steps round the line before its change: (region, steps the drawing does not have), or None (no guard here)"""
    xs = [q[0] for p in P for q in p["e"]["sourcePx"][:2]]
    ys = [q[1] for p in P for q in p["e"]["sourcePx"][:2]]
    pad = 2.0 * max(p["t"] for p in P) + 4.0
    region = (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)
    view = _top_view(E, region)
    if view is None:
        return None
    t = max(p["t"] for p in P)
    return region, _view_steps(view), t, _view_gaps(view, t), _view_ink_left(view, gray, S)


def _view_ink_left(view, gray, S):
    """the drawing's ink in the top view's region that no wall covers (source px^2), at up to 4 per source px"""
    mask, x0, y0, z = view
    f = min(1.0, 4.0 / z)
    small = cv2.resize(mask, None, fx=f, fy=f, interpolation=cv2.INTER_AREA) if f < 1.0 else mask
    zz = z * f
    H_, W_ = small.shape
    X, Y = np.meshgrid(x0 + (np.arange(W_) + 0.5) / zz, y0 + (np.arange(H_) + 0.5) / zz)
    x, y = X * S.pre, Y * S.pre
    if S.Hi is not None:
        Hm = np.linalg.inv(S.Hi)
        w_ = Hm[2, 0] * x + Hm[2, 1] * y + Hm[2, 2]
        x, y = (Hm[0, 0] * x + Hm[0, 1] * y + Hm[0, 2]) / w_, (Hm[1, 0] * x + Hm[1, 1] * y + Hm[1, 2]) / w_
    else:
        dx, dy = x - S.cx, y - S.cy
        x, y = S.cx + S.a * dx + S.b * dy, S.cy - S.b * dx + S.a * dy
    g = cv2.remap(gray, ((x - S.ox) * S.ws).astype(np.float32), ((y - S.oy) * S.ws).astype(np.float32), cv2.INTER_LINEAR,
                  borderValue=255)
    return float(((g < 160) & (small < 128)).sum()) / (zz * zz)


def _view_gaps(view, t):
    """the floor between walls a square of 1.5 wall thicknesses closes over, in the top view (source px^2): a slot or
    a notch, as the app check counts them (room floors are wider and stay open)"""
    mask, _, _, z = view
    f = min(1.0, 2.0 / z)                                    # (at 2 per source px: a pixel square is 4 of them)
    if f < 1.0:
        mask = (cv2.resize(mask, None, fx=f, fy=f, interpolation=cv2.INTER_AREA) >= 128).astype(np.uint8) * 255
        z *= f
    k = max(3, int(round(1.5 * t * z)) | 1)
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    return float(((closed > 0) & (mask == 0)).sum()) / (z * z)


def _guard_after(guard, E, gray, S):
    """Round 37: a line whose new faces add steps the drawing does not have - more than they take away - is put back
    (round 35 fitted each piece to its own drawn band, and pieces a fraction of a pixel apart in one straight drawn face
    came out as steps: half the steps the app check counted).  A step where one was before, no larger, is not added; a
    new or larger one the drawing has (a thin window flush with one face of its columns, J's BEDROOM 3) is no reason,
    and a line that closes a gap between walls (a pixel square or more), or covers more of the drawn wall (half a wall
    thickness squared or more), keeps its faces whatever its steps."""
    region, st0, t, gap0, ink0 = guard
    view = _top_view(E, region)
    if view is None:
        return None
    if _view_gaps(view, t) < gap0 - 1.0:
        return None                                          # (it closes a slot or a notch: worth more than a step, c23)
    if _view_ink_left(view, gray, S) < ink0 - 0.5 * t * t:
        return None                                          # (it covers half a wall's square of ink more: the drawing's
                                                             # wall, which round 35 is for)
    st1 = _view_steps(view)
    at = lambda s_, t_: abs(s_[0] - t_[0]) <= 0.5 and abs(s_[1] - t_[1]) <= 0.5
    new = [s_ for s_ in st1 if not any(at(s_, t_) and s_[2] <= t_[2] + 0.12 for t_ in st0) and not _drawn_jog(gray, S, s_)]
    gone = [t_ for t_ in st0 if not any(at(s_, t_) for s_ in st1)]
    if len(new) > len(gone):
        return "it would add %d step(s) the drawing does not have (at %s), taking away %d" % (
            len(new), ", ".join("%.1f,%.1f" % s_[:2] for s_ in new[:3]), len(gone))
    return None


def _spikes(out):
    """places where a room's outline doubles back on itself along one line (a side and the next one level, or both plumb,
    running opposite ways): the app takes the wall there as used twice by the loop"""
    n = 0
    for r in out["rooms"]:
        P = [(q["x"], q["y"]) for q in r["sourcePoints"]]
        for i in range(len(P)):
            a, b, c = P[i - 1], P[i], P[(i + 1) % len(P)]
            for k in (0, 1):
                o = 1 - k
                if abs(a[o] - b[o]) < 1e-6 and abs(b[o] - c[o]) < 1e-6 and (b[k] - a[k]) * (c[k] - b[k]) < 0:
                    n += 1
    return n


def _slanted(out):
    """room sides and wall edges that are neither level nor plumb"""
    n = 0
    for e in out["wallEdges"]:
        (x0, y0), (x1, y1) = e["sourcePx"][:2]
        n += abs(x0 - x1) > 1e-6 and abs(y0 - y1) > 1e-6
    for r in out["rooms"]:
        P = r["sourcePoints"]
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            n += abs(a["x"] - b["x"]) > 1e-6 and abs(a["y"] - b["y"]) > 1e-6
    return n


def _length(e):
    (x0, y0), (x1, y1) = e["sourcePx"][:2]
    return math.hypot(x1 - x0, y1 - y0)


def _apply_face_plan(out, pcs, plan, nb, key, next_id, line_ids):
    """moves the pieces of one wall line to their planned centre-lines and thicknesses: each end of a moved piece moves
    across the line by the piece's shift - in every room and every edge that has it - where every other side meeting it
    runs across the line (a corner or a jog); where it meets a piece of the same line that shifts by a different amount,
    a jog is put in between.  False when an end cannot move cleanly (the line is then left as it was)."""
    E = out["wallEdges"]; rooms = out["rooms"]
    mm_px = (out.get("scale") or {}).get("millimetresPerPixel")
    shift = {pid: plan[pid][0] - pcs[pid]["c"] for pid in plan}
    moves, jogs = {}, []
    for pid in plan:
        p = pcs[pid]
        for q in p["ends"]:
            k_ = key(q)
            same = [o for o in sorted(nb[pid]) if o in line_ids and any(key(v) == k_ for v in pcs[o]["ends"])]
            other_side = [o for o in same if abs(shift.get(o, 0.0) - shift[pid]) >= 1e-6]
            if other_side:
                if len(same) != 1:
                    return "a joint of %s with %d pieces of its line" % (pid, len(same))
                o = other_side[0]
                if o not in plan or pid < o:                 # (one jog per joint; a piece that stays never asks for one)
                    jogs.append((k_, q, pid, o))
                continue
            d = shift[pid]
            m_ = (q[0], q[1] + d) if p["ax"] == "h" else (q[0] + d, q[1])
            if k_ in moves and moves[k_] != m_:
                return "an end of %s pulled two ways" % pid
            moves[k_] = m_
    # every other side at a moving end must run across the line (else the end cannot slide along it): a room's side
    # along the line there must be one of the moving pieces
    for r in rooms:
        Pp = [(q["x"], q["y"]) for q in r["sourcePoints"]]; ids = r["edgeIds"]; n = len(Pp)
        for i in range(n):
            if key(Pp[i]) not in moves:
                continue
            ax = next(pcs[pid]["ax"] for pid in plan if key(Pp[i]) in {key(v) for v in pcs[pid]["ends"]})
            for j, eid in ((i - 1, ids[(i - 1) % n]), ((i + 1) % n, ids[i])):
                a_, b_ = Pp[i], Pp[j]
                along_line = abs(a_[1] - b_[1]) < 0.5 if ax == "h" else abs(a_[0] - b_[0]) < 0.5
                if along_line and eid not in plan:
                    return "a side along the line at %s (%s) that does not move with it" % (Pp[i], eid)
    short_before = {e["id"] for e in E if _length(e) < 0.75}
    for r in rooms:
        for q in r["sourcePoints"]:
            m_ = moves.get(key((q["x"], q["y"])))
            if m_:
                q["x"], q["y"] = m_
    for e in E:
        for v in e["sourcePx"]:
            m_ = moves.get(key(v))
            if m_:
                v[0], v[1] = m_
    # a jog between two pieces that now meet on one centre-line closes up: it is taken out of every room and the edges
    # (only one this line's moves shortened: a short edge the trace already had is not this line's to take out)
    gone = {e["id"] for e in E if e["id"] not in plan and not e.get("opening") and len(e["sourcePx"]) == 2
            and _length(e) < 0.75} - short_before
    for r in rooms:
        ids = r["edgeIds"]
        for i in range(len(ids) - 1, -1, -1):
            if ids[i] in gone:
                if len(ids) <= 3:
                    return "a room would lose a side it needs"
                n_ = len(ids)
                del ids[i]
                del r["sourcePoints"][i + 1 if i + 1 < n_ else i]   # (the side's end merges into its start)
    E[:] = [e for e in E if e["id"] not in gone]
    # jogs where two pieces of the line meet and shift by different amounts
    for k_, q, pid, oid in jogs:
        p, o = pcs[pid], pcs[oid]
        dp, do = shift.get(pid, 0.0), shift.get(oid, 0.0)
        qp = (q[0], q[1] + dp) if p["ax"] == "h" else (q[0] + dp, q[1])
        qo = (q[0], q[1] + do) if p["ax"] == "h" else (q[0] + do, q[1])
        if math.hypot(qp[0] - qo[0], qp[1] - qo[1]) < 1.0:
            return "a jog under a pixel at %s" % (q,)
        jid = "e%d" % next_id[0]; next_id[0] += 1
        # the jog is as thick as it is long (at least a pixel), never thicker than either piece: a thicker jog would stand
        # out past a short neighbour's end, across the wall it meets (BALCONY / BEDROOM 3 on J's plan).  Round 37: a
        # quarter thicker than long - the app squares the ends of a wall shorter than its thickness (a joint between two
        # rooms' walls) and mitres one as long as it is thick, out past the walls it joins; exactly as thick as long, a
        # millimetre of rounding chose which, and the mitre showed as a step (s016)
        tj = min(plan.get(pid, (p["c"], p["t"]))[1], plan.get(oid, (o["c"], o["t"]))[1], max(1.0, JOG_T * abs(dp - do)))
        E.append({"id": jid, "kind": "wall_centerline", "sourcePx": [list(qp), list(qo)], "thicknessPx": round(tj, 2),
                  "thicknessMm": int(round(tj * mm_px)) if mm_px else None, "opening": None})
        out.setdefault("_jogs", []).append((E[-1], pid, oid))  # (choose_jog_thickness; taken out before the evidence leaves)
        for e in (p["e"], o["e"]):
            for v in e["sourcePx"]:
                if key(v) == k_:
                    v[0], v[1] = qp if e is p["e"] else qo
        for r in rooms:
            Pp = [(q2["x"], q2["y"]) for q2 in r["sourcePoints"]]; ids = r["edgeIds"]; n = len(Pp)
            for i in range(n):
                if key(Pp[i]) != k_:
                    continue
                e_in, e_out = ids[(i - 1) % n], ids[i]       # side i-1 ends at point i, side i starts there
                if {e_in, e_out} != {pid, oid}:
                    return "a room meets the jog at %s from another side" % (q,)
                first, second = (qp, qo) if e_in == pid else (qo, qp)
                r["sourcePoints"][i:i + 1] = [{"x": first[0], "y": first[1]}, {"x": second[0], "y": second[1]}]
                ids.insert(i, jid)
                break
    for pid, (c2, t2) in plan.items():
        e = pcs[pid]["e"]
        e["thicknessPx"] = round(t2, 2)
        if e.get("thicknessMm") is not None and mm_px:
            e["thicknessMm"] = int(round(t2 * mm_px))
    return True


# Round 36 - drawn wall the app would leave out (J, 13 Oct, on the review of round 35: the top of BEDROOM 2's corner
# columns, the study's wall and the short returns at its open end, the column at the AIR-CON LEDGE corner).  The app builds
# walls from room sides only, so ink the drawing has as wall but no room side runs through stays empty in 2D and 3D: a
# column standing out past a wall's face or end, and a wall with the same room on both sides (a study open to the living
# room).  Stage 1's solid wall masses and partitions, minus the walls the app will build (each edge's band, square caps at
# its ends), leave parts; a part that touches a wall and either lies inside a room or is compact (a column: at most
# LEFTOVER_COMPACT_T wall thicknesses long) becomes standalone wall edges - wall edges no room references, which the app
# builds as walls with no room on either side.  A long strip outside every room (a
# corridor parapet, the neighbour's wall, an exterior wall drawn thicker than traced) is left alone.  J's review of the
# first cut (13 Oct) left: a column standing on a room corner met the corner with a step and a hairline, and the last
# few pixels of a column beside a wall stayed out.  So a piece standing on the end of a wall line, or on a corner, ends
# on that corner's vertex and takes the wall's faces when they are a step away (one joint, as the app builds corners),
# a piece facing a wall across an empty strip narrower than half a wall meets it (the 3D showed a slot), and a
# last pass covers a sliver of solid ink that carries on a piece (at most LEFTOVER_SLIVER_T wall thicknesses deep).  His
# second review: that sliver read as a separate box, so it takes the piece's faces, overlaps the wall it meets and ends
# flush with the wall beside it (_align_sliver).
LEFTOVER = os.environ.get("AE_LEFTOVER_WALLS", "1") != "0"
LEFTOVER_COMPACT_T = float(os.environ.get("AE_LEFTOVER_COMPACT_T", "4"))
LEFTOVER_LOG = os.environ.get("AE_LEFTOVER_LOG")
LEFTOVER_MAX = 60
LEFTOVER_SLIVER_T = float(os.environ.get("AE_LEFTOVER_SLIVER_T", "0.35"))
LEFTOVER_SLIVERS = 12
# Round 40b - walls no room is traced against (J, 19 Oct: "proceed", after round 40; the column on s022's living-room
# wall).  The app check's drawn wall left out was, on the open plans, mostly whole runs of solid wall with no room traced
# on either side: a refuse chute's or a DB cupboard's walls, the outer walls of a room that was not traced (s005's study,
# s066, s073, s081), and s022's two columns, joined into one long part by the strip of wall between them.  Round 36 left a
# long part outside every room alone (a neighbour's wall, a parapet, a wall drawn wider than traced).  Now such a part
# becomes standalone walls when it is solid ink and most of it stands away from the app's walls - what lies within half a
# wall of them (a wall drawn wider than traced) is left to the pieces' growth into the walls they meet - in at most
# R40B_MAX_RECTS level / plumb rectangles covering nine tenths of it (not a slanted or ragged run).  J, 19 Oct: "keep it
# to the unit walls only but ensure not to detect wrongly and leave things out from the unit" - so a long piece of it is
# laid only where it is the unit's (_r40b_unit: the unit's envelope along one of its faces, or a room name in front of
# one); a stub standing out past the unit (a neighbour's wall, a corridor's) stays out, a column or fin on a wall is laid
# as round 36 lays columns.  Each part's pieces are kept only where the app check's replay (app_flaws.py) finds no new
# slot, notch, seam or step and no centre-line crossing, and the page's once every later pass is done
# (_standalone_walls).  (Notches too: the first full run added 26 at the runs' joints, most on the photographed copies;
# runs are laid only on a page drawn level, not turned or rectified, for the same reason.)
R40B_MISSING = os.environ.get("AE_R40B_MISSING_WALLS", "1") != "0"
R40B_REST = float(os.environ.get("AE_R40B_REST", "0.3"))     # (the share of a part standing half a wall off the walls)
R40B_MAX_RECTS = 6


def _work_wall_mask(out, S, shape, centre_only=False, joints=None):
    """the walls the app will build, in working pixels: each edge's band with square caps (the app squares its corners);
    or only their centre-lines.  With joints (_wall_vertices), an end is carried on only as far as the faces of the walls
    meeting it across - how the app joins a corner - and not at all at a free end or where the line runs straight on
    (a thick wall's square cap would claim the last pixels of a column standing past a thinner wall: J's BEDROOM 2)"""
    mask = np.zeros(shape, np.uint8)
    for e in out["wallEdges"]:
        p, q = e["sourcePx"][:2]
        (ax, ay), (bx, by) = _from_source(S, *p), _from_source(S, *q)
        t = float(e.get("thicknessPx") or 0) / S.k
        L = math.hypot(bx - ax, by - ay)
        if t <= 0 or L <= 1e-6:
            continue
        if centre_only:
            cv2.line(mask, (int(round(ax)), int(round(ay))), (int(round(bx)), int(round(by))), 255, 1)
            continue
        ux, uy = (bx - ax) / L, (by - ay) / L
        nx, ny, h = -uy, ux, t / 2.0
        ha = hb = h
        if joints is not None:
            across = ("E", "W") if abs(ux) < 0.5 else ("N", "S")
            ha, hb = (max([joints.get((round(r[0], 2), round(r[1], 2)), [0, 0, 0, {}])[3].get(d, 0.0) / 2.0 for d in across] + [0.0])
                      for r in (p, q))
        ax, ay, bx, by = ax - ux * ha, ay - uy * ha, bx + ux * hb, by + uy * hb
        poly = np.array([[ax + nx * h, ay + ny * h], [bx + nx * h, by + ny * h], [bx - nx * h, by - ny * h], [ax - nx * h, ay - ny * h]])
        cv2.fillPoly(mask, [np.round(poly).astype(np.int32)], 255)
    return mask


def _work_drawn_mask(m, shape, masses=True, partitions=True):
    """stage 1's solid wall masses (with their holes) and partitions, in working pixels"""
    mask = np.zeros(shape, np.uint8)
    for w in sorted(m.get("walls", []) if masses else [], key=lambda w_: bool(w_.get("hole"))):
        pts = np.round(np.array(w["pts"], float)).astype(np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(mask, [pts], 0 if w.get("hole") else 255)
    for p in m.get("partitions", []) if partitions else []:
        x0, y0, x1, y1 = (p["a"], p["c0"], p["b"], p["c1"]) if p["o"] == "h" else (p["c0"], p["a"], p["c1"], p["b"])
        cv2.rectangle(mask, (int(round(x0)), int(round(y0))), (int(round(x1)), int(round(y1))), 255, -1)
    return mask


def _rectangles(comp, min_area, min_side):
    """a part as axis-aligned rectangles, largest first, until 95 % of it is covered"""
    left = comp.copy(); total = int(comp.sum()); rects = []
    while left.sum() > 0.05 * total and len(rects) < 10:
        best = None
        h_ = np.zeros(left.shape[1], np.int32)
        for y in range(left.shape[0]):                       # largest rectangle in a histogram, row by row
            h_ = np.where(left[y] > 0, h_ + 1, 0)
            stack = []
            for x in range(len(h_) + 1):
                cur = h_[x] if x < len(h_) else 0
                start = x
                while stack and stack[-1][1] >= cur:
                    s_, hh = stack.pop()
                    if hh > 0 and (best is None or hh * (x - s_) > best[0]):
                        best = (hh * (x - s_), s_, y - hh + 1, x, y + 1)
                    start = s_
                stack.append((start, cur))
        if best is None or best[0] < min_area:
            break
        _, x0, y0, x1, y1 = best
        if min(x1 - x0, y1 - y0) >= min_side:
            rects.append((x0, y0, x1, y1))
        left[y0:y1, x0:x1] = 0
    return _absorb(comp, rects)


def _absorb(comp, rects):
    """the rectangles grown, within the part, over what none of them covers: a corner of the part too small to be a
    rectangle of its own stayed out, a pocket of drawn column beside the piece (h1, s005; J: "there is still a hole
    here").  A side grows only while its strip lies in the part (nine tenths) and takes in some of the uncovered rest."""
    H, W = comp.shape
    covered = np.zeros_like(comp)
    for x0, y0, x1, y1 in rects:
        covered[y0:y1, x0:x1] = 1
    out = []
    for x0, y0, x1, y1 in rects:
        grew = True
        while grew:
            grew = False
            for side in range(4):
                a, b, c, d = ((x0 - 1, y0, x0, y1), (x0, y0 - 1, x1, y0), (x1, y0, x1 + 1, y1), (x0, y1, x1, y1 + 1))[side]
                if a < 0 or b < 0 or c > W or d > H:
                    continue
                strip, cov = comp[b:d, a:c], covered[b:d, a:c]
                if strip.mean() >= 0.9 and (strip & (1 - cov)).any():
                    covered[b:d, a:c] = 1
                    x0, y0, x1, y1 = (a if side == 0 else x0, b if side == 1 else y0, c if side == 2 else x1, d if side == 3 else y1)
                    grew = True
        out.append((x0, y0, x1, y1))
    return out


def _sides(mask, x0, y0, x1, y1):
    """how much of the strip two pixels beyond each side of a rectangle the mask covers: (left, top, right, bottom)"""
    H, W = mask.shape
    strips = (mask[y0:y1, max(0, x0 - 2):x0], mask[max(0, y0 - 2):y0, x0:x1], mask[y0:y1, x1:min(W, x1 + 2)],
              mask[y1:min(H, y1 + 2), x0:x1])
    return [float((s_ > 0).mean()) if s_.size else 0.0 for s_ in strips]


def _along_wall(near, x0, y0, x1, y1):
    """a sliver lying against a wall along one of its long sides (the strip two pixels beyond it, three fifths near)"""
    H, W = near.shape
    if x1 - x0 >= y1 - y0:
        sides = (near[max(0, y0 - 2):y0, x0:x1], near[y1:min(H, y1 + 2), x0:x1])
    else:
        sides = (near[y0:y1, max(0, x0 - 2):x0], near[y0:y1, x1:min(W, x1 + 2)])
    return any(s_.size > 0 and float((s_ > 0).mean()) >= 0.6 for s_ in sides)


def _reach_walls(app, drawn, lines, x0, y0, x1, y1, reach):
    """a rectangle grown, on each side, over drawn wall and into the walls it meets (so it meets them in the app whatever
    corner the app builds there), never over bare paper and never onto a wall's centre-line: the app refuses a wall whose
    centre-line crosses another's without a shared end"""
    H, W = app.shape
    grow = [0, 0, 0, 0]
    strips = (lambda k: (x0 - k, y0, x0 - k + 1, y1), lambda k: (x0, y0 - k, x1, y0 - k + 1),
              lambda k: (x1 + k - 1, y0, x1 + k, y1), lambda k: (x0, y1 + k - 1, x1, y1 + k))
    for side, strip in enumerate(strips):
        for k in range(1, reach + 1):
            a, b, c, d = strip(k)
            if a < 0 or b < 0 or c > W or d > H or lines[b:d, a:c].any():
                break
            if ((app[b:d, a:c] > 0) | (drawn[b:d, a:c] > 0)).mean() < 0.5:
                break
            grow[side] = k
    return x0 - grow[0], y0 - grow[1], x1 + grow[2], y1 + grow[3]


def _through_mass(rect, drawn, app_j, lines, limit):
    """A piece is carried on along its length through the rest of its own drawn mass to the wall it meets there, as the
    app builds that wall (ends as the app joins them): the part was cut short where the square-capped walls claimed the
    mass, and a pocket of drawn column stayed out between the piece and the wall (s056, J: "there is still a hole here").
    Only over drawn wall that no app wall covers, never onto a centre-line, at most limit px, and only when it does reach
    a wall - else the side stays as it was."""
    x0, y0, x1, y1 = (int(math.floor(rect[0])), int(math.floor(rect[1])), int(math.ceil(rect[2])), int(math.ceil(rect[3])))
    H, W = drawn.shape
    plumb = y1 - y0 > x1 - x0
    sides = ((1, lambda k: (x0, y0 - k, x1, y0 - k + 1)), (3, lambda k: (x0, y1 + k - 1, x1, y1 + k))) if plumb else \
        ((0, lambda k: (x0 - k, y0, x0 - k + 1, y1)), (2, lambda k: (x1 + k - 1, y0, x1 + k, y1)))
    grow = [0, 0, 0, 0]
    for side, strip in sides:
        for k in range(1, int(limit) + 1):
            a, b, c, d = strip(k)
            if a < 0 or b < 0 or c > W or d > H or lines[b:d, a:c].any():
                break
            if float((app_j[b:d, a:c] > 0).mean()) >= 0.6:
                grow[side] = k - 1                           # (met the wall: the overlap step joins them)
                break
            if float((drawn[b:d, a:c] > 0).mean()) < 0.8:
                break                                        # (out of the mass before any wall: no change)
    return (rect[0] - grow[0], rect[1] - grow[1], rect[2] + grow[2], rect[3] + grow[3])


def _meet_across(rect, app, lines, T):
    """A piece facing a wall across an empty strip narrower than half a wall is carried across to meet it: the 3D would
    show the strip as a slot (s071's black wall).  Not wider: a pocket the walls close off is no strip (s001)"""
    x0, y0, x1, y1 = (int(math.floor(rect[0])), int(math.floor(rect[1])), int(math.ceil(rect[2])), int(math.ceil(rect[3])))
    H, W = app.shape
    strips = (lambda k: (x0 - k, y0, x0 - k + 1, y1), lambda k: (x0, y0 - k, x1, y0 - k + 1),
              lambda k: (x1 + k - 1, y0, x1 + k, y1), lambda k: (x0, y1 + k - 1, x1, y1 + k))
    grow = [0, 0, 0, 0]
    for side, strip in enumerate(strips):
        for k in range(1, int(math.ceil(0.5 * T)) + 1):
            a, b, c, d = strip(k)
            if a < 0 or b < 0 or c > W or d > H or lines[b:d, a:c].any():
                break
            cover = float((app[b:d, a:c] > 0).mean())
            if cover >= 0.6:
                grow[side] = k if k > 2 else 0                 # (a wall met at once needs nothing)
                break
            if cover > 0.2:
                break                                        # (a wall's corner or end, not one facing the piece)
    return (rect[0] - grow[0], rect[1] - grow[1], rect[2] + grow[2], rect[3] + grow[3])


def _wall_vertices(out, S):
    """the room walls' centre-line ends, in working px: {key: [x, y, source point, {direction: thickness}]} with the
    directions (N E S W) of the level / plumb edges leaving each"""
    verts = {}
    for e in out["wallEdges"]:
        p, q = e["sourcePx"][:2]
        (ax, ay), (bx, by) = _from_source(S, *p), _from_source(S, *q)
        t = float(e.get("thicknessPx") or 0) / S.k
        for (x, y), (ox, oy), src in (((ax, ay), (bx, by), p), ((bx, by), (ax, ay), q)):
            v = verts.setdefault((round(src[0], 2), round(src[1], 2)), [x, y, src, {}])
            if abs(oy - y) <= 0.5 and abs(ox - x) > 0.5:
                v[3]["E" if ox > x else "W"] = t
            elif abs(ox - x) <= 0.5 and abs(oy - y) > 0.5:
                v[3]["S" if oy > y else "N"] = t
    return verts


def _join_vertex(rect, verts, lines, T, reach, face_tol=None):
    """A piece standing on the end of a wall line or on a corner ends on that vertex - one joint, as the app builds a
    corner, instead of a step and a hairline beside it - and takes the faces of the wall it continues when they are a
    step away (J's BEDROOM 2, right column).  Returns (rectangle, vertex at its start or None, vertex at its end or None):
    unchanged when no vertex qualifies: near the piece's centre-line (within a quarter of its width, at most half a wall
    thickness), within reach of its end, no wall leaving it into the piece, and no other centre-line on the way.
    face_tol: how far a face may move out to the continued wall's (default a fifth of a wall, for a column; round 40b's
    runs of wall pass 2 px - s008's bedroom wall took the air-con ledge's faces, 60 mm past its own ink)."""
    x0, y0, x1, y1 = rect
    plumb = y1 - y0 > x1 - x0
    lo, hi, c0, c1 = (y0, y1, x0, x1) if plumb else (x0, x1, y0, y1)     # (along, across)
    c = (c0 + c1) / 2.0
    best = None
    for v in verts.values():
        va, vc = (v[1], v[0]) if plumb else (v[0], v[1])
        if abs(vc - c) > min(0.5 * T, 0.25 * (c1 - c0) + 1.0) or not v[3]:
            continue                                         # (near the piece's own centre-line, not at its face)
        for end, into, back, lo_, hi_ in ((lo, "S" if plumb else "E", "N" if plumb else "W", lo - reach, lo + 2),
                                          (hi, "N" if plumb else "W", "S" if plumb else "E", hi - 2, hi + reach)):
            if lo_ <= va <= hi_ and into not in v[3] and (best is None or abs(va - end) < best[0]):
                best = (abs(va - end), v, end == lo, va, vc, back)
    if best is None:
        return _flush_faces(rect, verts, plumb, lo, hi, c0, c1, reach), None, None
    _, v, at_lo, va, vc, back = best
    h = max(vc - c0, c1 - vc)
    tw = v[3].get(back)                                      # the wall this piece continues, straight on past the vertex
    if tw is not None and h <= tw / 2.0 + 2.0 and tw / 2.0 - h <= (max(2.0, 0.2 * T) if face_tol is None else face_tol):
        h = tw / 2.0                                         # (that wall's faces: traced from the same ink)
    elif max(c0 - (vc - h), vc + h - c1) > 2.0:
        return _flush_faces(rect, verts, plumb, lo, hi, c0, c1, reach), None, None   # (centred on the vertex it would
                                                                                    # stand out past its own ink: s071)
    lo, hi = (va, hi) if at_lo else (lo, va)
    a0, a1, b0, b1 = int(math.floor(lo)), int(math.ceil(hi)), int(math.floor(vc - h)), int(math.ceil(vc + h))
    keep = int(math.ceil(h)) + 3                             # (the vertex's own walls cross its centre-line there)
    path = lines[a0:a1, int(round(vc))] if plumb else lines[int(round(vc)), a0:a1]
    wide = lines[a0:a1, b0:b1] if plumb else lines[b0:b1, a0:a1]
    near_v = slice(0, -keep) if not at_lo else slice(keep, None)
    if path[near_v].any() or (wide[near_v] if plumb else wide[:, near_v]).any():
        return rect, None, None
    new = (vc - h, lo, vc + h, hi) if plumb else (lo, vc - h, hi, vc + h)
    return new, (v if at_lo else None), (None if at_lo else v)


def _flush_faces(rect, verts, plumb, lo, hi, c0, c1, reach):
    """A piece carrying a wall line straight on from its end vertex, off that wall's centre-line (a thinner piece on one
    face of a thicker wall), takes the wall's face on the side where the two miss by two pixels or less: no step in the
    face, no hairline at the joint (exec).  Only ever wider."""
    for v in verts.values():
        va, vc = (v[1], v[0]) if plumb else (v[0], v[1])
        for end_ok, back in ((lo - reach <= va <= lo + 2, "N" if plumb else "W"), (hi - 2 <= va <= hi + reach, "S" if plumb else "E")):
            tw = v[3].get(back)
            if not end_ok or tw is None or not (c0 - 2 <= vc <= c1 + 2 or abs(vc - (c0 + c1) / 2.0) <= tw / 2.0):
                continue
            f0, f1 = vc - tw / 2.0, vc + tw / 2.0
            n0 = min(c0, f0) if abs(f0 - c0) <= 2.0 else c0     # (only ever wider: a face moved in would open a gap)
            n1 = max(c1, f1) if abs(f1 - c1) <= 2.0 else c1
            if (n0, n1) != (c0, c1) and n1 - n0 >= 1.0:
                return (n0, lo, n1, hi) if plumb else (lo, n0, hi, n1)
    return rect


def _touch_walls(rect, app, lines):
    """A side within two pixels of a wall it runs along is carried onto it: the traced faces of one ink edge miss by a
    fraction of a pixel, and the app showed the miss as a hairline (exec)"""
    x0, y0, x1, y1 = (int(math.floor(rect[0])), int(math.floor(rect[1])), int(math.ceil(rect[2])), int(math.ceil(rect[3])))
    H, W = app.shape
    strips = (lambda k: (x0 - k, y0, x0 - k + 1, y1), lambda k: (x0, y0 - k, x1, y0 - k + 1),
              lambda k: (x1 + k - 1, y0, x1 + k, y1), lambda k: (x0, y1 + k - 1, x1, y1 + k))
    grow = [0, 0, 0, 0]
    for side, strip in enumerate(strips):
        a, b, c, d = strip(1)
        if a < 0 or b < 0 or c > W or d > H or (app[b:d, a:c] > 0).mean() >= 0.3:
            continue                                         # (touching already)
        for k in (2, 3):
            a, b, c, d = strip(k)
            if a < 0 or b < 0 or c > W or d > H or lines[b:d, a:c].any():
                break
            if (app[b:d, a:c] > 0).mean() >= 0.3:
                grow[side] = k
                break
    return (rect[0] - grow[0], rect[1] - grow[1], rect[2] + grow[2], rect[3] + grow[3])


def _wall_rects(out, S, joints):
    """the app's level and plumb walls (openings too: their lintels are wall above) as rectangles in working px, the ends
    carried as _work_wall_mask carries them"""
    rects = []
    for e in out["wallEdges"]:
        p, q = e["sourcePx"][:2]
        (ax, ay), (bx, by) = _from_source(S, *p), _from_source(S, *q)
        h = float(e.get("thicknessPx") or 0) / S.k / 2.0
        level, plumb = abs(ay - by) <= 0.5 < abs(ax - bx), abs(ax - bx) <= 0.5 < abs(ay - by)
        if h <= 0 or not (level or plumb):
            continue
        ha, hb = (max([joints.get((round(r[0], 2), round(r[1], 2)), [0, 0, 0, {}])[3].get(d, 0.0) / 2.0
                       for d in (("N", "S") if level else ("E", "W"))] + [0.0]) for r in (p, q))
        if level:
            (lo, c_lo), (hi, c_hi) = sorted(((ax, ha), (bx, hb)))
            rects.append((lo - c_lo, (ay + by) / 2.0 - h, hi + c_hi, (ay + by) / 2.0 + h))
        else:
            (lo, c_lo), (hi, c_hi) = sorted(((ay, ha), (by, hb)))
            rects.append(((ax + bx) / 2.0 - h, lo - c_lo, (ax + bx) / 2.0 + h, hi + c_hi))
    return rects


def _overlap_walls(rect, walls, lines):
    """Each side of a piece that touches a wall (or an earlier piece) - its face within 0.75 px inside to 1.5 px out, along a
    third of the side or more - is carried a pixel into it, or two where the wall lies beyond the whole side: the app joins wall solids
    that overlap, and draws two that only touch with a seam between, a separate box against the wall (J's BEDROOM 2
    column; s029, s071).  Never onto a centre-line (the strip's last two pixels aside, where the piece's own neighbours end)."""
    x0, y0, x1, y1 = rect
    H, W = lines.shape
    grow = [0, 0, 0, 0]
    for side in range(4):
        f, lo, hi = ((x0, y0, y1), (y0, x0, x1), (x1, y0, y1), (y1, x0, x1))[side]
        wf = (2, 3, 0, 1)[side]                              # (the face of a wall that meets this side)
        out_ = -1.0 if side < 2 else 1.0                     # (outward along the side's normal)
        meet = [w for w in walls if -0.75 <= (w[wf] - f) * out_ <= 1.5]
        n = sum(max(0.0, min(hi, (w[3] if side in (0, 2) else w[2])) - max(lo, (w[1] if side in (0, 2) else w[0])))
                for w in meet)
        cover = n / max(hi - lo, 1e-6)
        if cover < 0.3:
            continue
        gap = max(0, int(math.ceil(max((w[wf] - f) * out_ for w in meet) - 1e-6)))
        ix0, iy0, ix1, iy1 = (int(math.floor(x0)), int(math.floor(y0)), int(math.ceil(x1)), int(math.ceil(y1)))
        for k in ((gap + 2, gap + 1) if cover >= 0.95 else (gap + 1,)):
            a, b, c, d = ((ix0 - k, iy0 + 2, ix0, iy1 - 2), (ix0 + 2, iy0 - k, ix1 - 2, iy0), (ix1, iy0 + 2, ix1 + k, iy1 - 2),
                          (ix0 + 2, iy1, ix1 - 2, iy1 + k))[side]
            if a >= 0 and b >= 0 and c <= W and d <= H and not lines[b:d, a:c].any():
                grow[side] = k
                break
    return (x0 - grow[0], y0 - grow[1], x1 + grow[2], y1 + grow[3])


def _app_face_ends(out, S, rect, pa, pb, mm, free, head_on=False, own=None, across=None):
    """J, on the third review: a piece ending flush with a wall's face showed a step a pixel's twentieth wide, because
    the app keeps vertices in whole millimetres and thicknesses in steps of 5 mm.  So an end within 0.75 px of the face
    of a wall across the piece's line, next to it and facing the same way (a wall the end runs into is left to the
    overlap), is put where the app will build that face (in source px)."""
    lv = abs(pa[1] - pb[1]) <= abs(pa[0] - pb[0])            # (a level piece: its ends move in x)
    k = 0 if lv else 1
    if across is None:
        (sx0, sy0), (sx1, sy1) = S(rect[0], rect[1]), S(rect[2], rect[3])
        across = (min(sy0, sy1), max(sy0, sy1)) if lv else (min(sx0, sx1), max(sx0, sx1))
    lo, hi = across                                          # (the piece across its line, source px)
    rnd = lambda v: math.floor(v + 0.5)                      # (as JavaScript rounds)
    for pt in free:
        out_sign = 1 if pt[k] >= (pb if pt is pa else pa)[k] else -1   # (the end's outward direction: only a face whose
        best = None                                                      # wall lies behind it lines up; one in front is met)
        for e in out["wallEdges"]:
            if e is own:
                continue
            (ax, ay), (bx, by) = e["sourcePx"][:2]
            t = float(e.get("thicknessPx") or 0)
            if t <= 0 or e.get("opening") or not (abs(ax - bx) <= 0.01 if lv else abs(ay - by) <= 0.01):
                continue                                     # (a wall across the piece's line: plumb for a level piece)
            c, w0, w1 = (ax, min(ay, by), max(ay, by)) if lv else (ay, min(ax, bx), max(ax, bx))
            if min(hi, w1 + t / 2.0) - max(lo, w0 - t / 2.0) < (0.5 * (hi - lo) if head_on else -1.0):
                continue                                     # (not next to the piece; head on: not across most of it)
            tm = max(40, min(600, rnd(t * mm / 5.0) * 5))
            for sign in ((-out_sign,) if head_on else (out_sign,)):
                f = (rnd((c + sign * t / 2.0) * mm) if APP_FACES else rnd(c * mm) + sign * tm / 2.0) / mm
                if abs(f - pt[k]) <= 0.75 and (best is None or abs(f - pt[k]) < abs(best - pt[k])):
                    best = f
        for e in out["wallEdges"] if head_on else ():         # (head on, a wall of the same line ending there: end on
            if e is own:                                     # its end, where the app builds it)
                continue
            (ax, ay), (bx, by) = e["sourcePx"][:2]
            t = float(e.get("thicknessPx") or 0)
            if t <= 0 or e.get("opening") or not (abs(ay - by) <= 0.01 if lv else abs(ax - bx) <= 0.01):
                continue
            c = ay if lv else ax
            if min(hi, c + t / 2.0) - max(lo, c - t / 2.0) <= 0:
                continue
            for q in ((ax, bx) if lv else (ay, by)):
                f = rnd(q * mm) / mm
                if abs(f - pt[k]) <= 0.75 and (best is None or (f - best) * out_sign > 0):
                    best = f                                 # (the farthest out: meeting every wall there, not one)
        if best is not None:
            pt[k] = best


def _emit(out, S, rect, next_id, mm_src, start=None, end=None, head_on=False):
    """the wall edge of a rectangle (working px): its centre-line along the longer side, ending on a vertex's own
    source point where it joins one"""
    x0, y0, x1, y1 = rect
    if x1 - x0 >= y1 - y0:
        a, b, t = (x0, (y0 + y1) / 2.0), (x1, (y0 + y1) / 2.0), y1 - y0
    else:
        a, b, t = ((x0 + x1) / 2.0, y0), ((x0 + x1) / 2.0, y1), x1 - x0
    pa, pb = (list(start[2]) if start else S(*a)), (list(end[2]) if end else S(*b))
    if not (start or end):                                   # (an end within 0.75 px of a wall's end: the app would merge
        near = []                                            # the two, so the piece would lean - s045 - and is put on it)
        for e in out["wallEdges"]:
            for q in e["sourcePx"][:2]:
                for which, pt in (("start", pa), ("end", pb)):
                    dq = math.hypot(q[0] - pt[0], q[1] - pt[1])
                    if dq <= 0.75:
                        near.append((dq, which, [float(q[0]), float(q[1])]))
        if near:
            _, which, q = min(near)
            if which == "start":
                start = [0, 0, q]; pa = list(q)
            else:
                end = [0, 0, q]; pb = list(q)
    if (start or end) and S.Hi is None and S.b == 0:         # (a plan drawn level stays level: one coordinate shared)
        k_ = 0 if x1 - x0 < y1 - y0 else 1
        pa[k_] = pb[k_] = (start or end)[2][k_]
    if mm_src and not (start and end) and S.Hi is None and S.b == 0:
        _app_face_ends(out, S, rect, pa, pb, float(mm_src), [pt for pt, j in ((pa, start), (pb, end)) if not j], head_on)
    ts = t * S.k
    out["wallEdges"].append({"id": "e%d" % next_id, "kind": "wall_centerline", "sourcePx": [pa, pb],
                             "thicknessPx": round(ts, 2), "thicknessMm": int(round(ts * mm_src)) if mm_src else None,
                             "opening": None})
    return a, b, ts


def _mark(lines, app_near, rect, a, b):
    """a later piece meets this one as it meets a room's wall: over its band, never onto its centre-line"""
    x0, y0, x1, y1 = rect
    cv2.line(lines, (int(round(a[0])), int(round(a[1]))), (int(round(b[0])), int(round(b[1]))), 255, 3)
    cv2.rectangle(app_near, (int(math.floor(x0)), int(math.floor(y0))), (int(math.ceil(x1)) - 1, int(math.ceil(y1)) - 1), 255, -1)


def _log(kind, x, y, w, h, extra, T, rect, eid, S, a, b, ts):
    if LEFTOVER_LOG:
        print("leftover: %s at %d,%d %dx%d (%s, T %.1f) rect %.0fx%.0f -> e%d %s-%s t %.1f" % (
            kind, x, y, w, h, extra, T, rect[2] - rect[0], rect[3] - rect[1], eid,
            [round(float(v), 1) for v in S(*a)], [round(float(v), 1) for v in S(*b)], ts), file=sys.stderr)


def _continues(rect, rects, app, T):
    """the piece a sliver carries on past its end, and whether that piece is plumb, or None - the piece's own width,
    beyond its end or across the wall it stopped at (J's BEDROOM 2, left column: the column runs on past its wall's
    line).  Not one hanging off a piece's long side: that is a fixture's or a frame's teeth (c24)"""
    x0, y0, x1, y1 = rect
    for piece in rects:
        px0, py0, px1, py1 = piece
        plumb = py1 - py0 > px1 - px0
        a0, a1, pa0, pa1 = (x0, x1, px0, px1) if plumb else (y0, y1, py0, py1)          # across the piece
        b0, b1, pb0, pb1 = (y0, y1, py0, py1) if plumb else (x0, x1, px0, px1)          # along it
        if min(a1, pa1) - max(a0, pa0) < 0.6 * (a1 - a0):
            continue
        gap = max(pb0 - b1, b0 - pb1)
        if gap < -1 or gap > T + 3:
            continue
        if gap <= 2:
            return piece, plumb
        lo, hi = (b1, pb0) if pb0 >= b1 else (pb1, b0)
        o0, o1 = int(max(a0, pa0)), int(math.ceil(min(a1, pa1)))
        between = app[int(lo):int(math.ceil(hi)), o0:o1] if plumb else app[o0:o1, int(lo):int(math.ceil(hi))]
        if between.size and float((between > 0).mean()) >= 0.8:
            return piece, plumb
    return None


def _clear(lines, rect):
    """no wall's centre-line under a rectangle"""
    x0, y0, x1, y1 = (int(math.floor(rect[0])), int(math.floor(rect[1])), int(math.ceil(rect[2])), int(math.ceil(rect[3])))
    return x0 >= 0 and y0 >= 0 and not lines[y0:y1, x0:x1].any()


def _cross_faces(out, S):
    """the faces of the walls (no openings), in working px: {True: level walls' faces (y), False: plumb walls' (x)} -
    where a plumb or a level sliver's far end may stop flush"""
    faces = {True: [], False: []}
    for e in out["wallEdges"]:
        if e.get("opening"):
            continue
        p, q = e["sourcePx"][:2]
        (ax, ay), (bx, by) = _from_source(S, *p), _from_source(S, *q)
        h = float(e.get("thicknessPx") or 0) / S.k / 2.0
        if abs(ay - by) <= 0.5 < abs(ax - bx):
            faces[True] += [(ay + by) / 2.0 - h, (ay + by) / 2.0 + h]
        elif abs(ax - bx) <= 0.5 < abs(ay - by):
            faces[False] += [(ax + bx) / 2.0 - h, (ax + bx) / 2.0 + h]
    return faces


def _align_sliver(rect, piece, plumb, app, lines, T, faces):
    """J, on the second review: the sliver past his BEDROOM 2 column read as a separate box - off the column's face by
    a step, short of the corner's face below by a notch, outlined on its own.  So a sliver takes the faces of the piece
    it carries on where it lies within two pixels of them, overlaps the wall at its near end by two pixels (the app
    joins walls that overlap, not walls that only touch), and its far end goes on to the face of a wall beside it that
    stops at most a quarter of a wall further on.  Never onto a centre-line."""
    x0, y0, x1, y1 = rect
    a0, a1, b0, b1 = (x0, x1, y0, y1) if plumb else (y0, y1, x0, x1)          # (across, along) the piece
    pa0, pa1 = (piece[0], piece[2]) if plumb else (piece[1], piece[3])
    pb0, pb1 = (piece[1], piece[3]) if plumb else (piece[0], piece[2])
    box = (lambda a0_, a1_, b0_, b1_: (a0_, b0_, a1_, b1_)) if plumb else (lambda a0_, a1_, b0_, b1_: (b0_, a0_, b1_, a1_))
    if a0 >= pa0 - 2 and _clear(lines, box(pa0, a1, b0, b1)):
        a0 = pa0
    if a1 <= pa1 + 2 and _clear(lines, box(a0, pa1, b0, b1)):
        a1 = pa1
    after = pb1 <= b0 + 2                                    # (the sliver lies past the piece's far end)
    near = (lambda k: (b0 - k, b0 - k + 1)) if after else (lambda k: (b1 + k - 1, b1 + k))
    ia0, ia1 = int(math.floor(a0)), int(math.ceil(a1))
    def cover(c0, c1, d0, d1):
        c0, c1, d0, d1 = int(math.floor(c0)), int(math.ceil(c1)), int(math.floor(d0)), int(math.ceil(d1))
        if c0 < 0 or d0 < 0 or c1 > app.shape[1 if plumb else 0] or d1 > app.shape[0 if plumb else 1]:
            return 0.0
        s_ = app[d0:d1, c0:c1] if plumb else app[c0:c1, d0:d1]
        return float((s_ > 0).mean()) if s_.size else 0.0
    for k in (1, 2):                                         # (into the wall at the near end)
        d0, d1 = near(k)
        if cover(ia0, ia1, d0, d1) < 0.6 or not _clear(lines, box(a0, a1, min(b0, d0), max(b1, d1))):
            break
        b0, b1 = min(b0, d0), max(b1, d1)
    reach = max(3, int(math.ceil(0.25 * T)))
    for c0, c1 in ((ia0 - 2, ia0), (ia1, ia1 + 2)):          # (the far end, flush with a wall beside it)
        f = 0
        for k in range(1, reach + 1):
            d0, d1 = (b1 + k - 1, b1 + k) if after else (b0 - k, b0 - k + 1)
            if cover(c0, c1, d0, d1) < 0.6:
                break
            f = k
        if 0 < f < reach and cover(c0, c1, *((b1 - 2, b1) if after else (b0, b0 + 2))) >= 0.6:
            end = b1 + f if after else b0 - f                # (the wall's own face, where the mask's pixel rounds it)
            exact = [v for v in faces[plumb] if abs(v - end) <= 1.5 and (v > b1 if after else v < b0)]
            end = min(exact, key=lambda v: abs(v - end)) if exact else end
            new = (b0, end) if after else (end, b1)
            if _clear(lines, box(a0, a1, *new)):
                b0, b1 = new
                break
    return box(a0, a1, b0, b1)


def _slivers(out, S, T, drawn, ink_raw, lines, verts, rects, next_id, mm_src, room_left):
    """Last pass: a sliver of solid ink still left out that carries on one of this round's pieces - the last few pixels
    of a column past a wall's face or line (J's BEDROOM 2, left column; a column's bottom on his PDF): at most
    LEFTOVER_SLIVER_T wall thicknesses deep, at least 3 x 6 source pixels, 3/4 ink across its rectangle, not against a
    window or door, LEFTOVER_SLIVERS a page.  A strip along a wall's face alone is that wall drawn wider than traced, and
    stays out: covering those added stubs to window frames and fixtures on the test plans (exec, c24)."""
    H, W = drawn.shape
    joints = _wall_vertices(out, S)
    app = _work_wall_mask(out, S, (H, W), joints=joints)
    depth = max(3, int(round(LEFTOVER_SLIVER_T * T)))
    band = cv2.dilate(app, np.ones((2 * depth + 1, 2 * depth + 1), np.uint8)) > 0
    cand = (((drawn > 0) | (ink_raw > 0)) & (app == 0) & band).astype(np.uint8)
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    touch = cv2.dilate(app, np.ones((3, 3), np.uint8))       # (the opening can leave a pixel between a sliver and its wall)
    openings = cv2.dilate(_work_wall_mask({"wallEdges": [e for e in out["wallEdges"] if e.get("opening")]}, S, (H, W),
                                          joints=joints), np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand, 8)
    faces = _cross_faces(out, S)
    walls, placed = _wall_rects(out, S, joints), list(rects)
    added = 0
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in st[i])
        short, long_ = min(w, h), max(w, h)
        if (added >= room_left or area < max(10, 0.04 * T * T) or short * S.k < 3.0 or long_ * S.k < 6.0 or short > depth + 1
                or long_ < max(4, 0.25 * T) or long_ > LEFTOVER_COMPACT_T * T):
            continue
        box = (slice(y, y + h), slice(x, x + w))
        carried = _continues((x, y, x + w, y + h), rects, app, T)
        if (lab[box] == i).mean() < 0.7 or ink_raw[box].mean() < 0.75 or carried is None:
            continue                                         # (not a solid strip carrying on a piece)
        if max(_sides(openings, x, y, x + w, y + h)) > 0.3:
            continue                                         # (a window's mullion or a door's jamb, not a column)
        rect = _reach_walls(touch, drawn, lines, x, y, x + w, y + h, 2)   # (into the wall it meets, no further)
        rect = _align_sliver(rect, carried[0], carried[1], app, lines, T, faces)
        rect, sv, ev = _join_vertex(rect, verts, lines, T, 3)
        if sv is None and ev is None:
            rect = _overlap_walls(rect, walls + placed, lines)
        placed.append(rect)
        a, b, ts = _emit(out, S, rect, next_id, mm_src, sv, ev)
        _mark(lines, touch, rect, a, b)
        _log("sliver", x, y, w, h, "carries on a piece", T, rect, next_id, S, a, b, ts)
        next_id += 1; added += 1
    return added


def _crosses(rect, lines, ends=()):
    """the centre-line _emit would give a rectangle runs onto another wall's - away from ends (working px) where it
    will share a wall's own end (_emit puts it there; the app joins two walls at a shared end)"""
    x0, y0, x1, y1 = rect
    cl = np.zeros_like(lines)
    if x1 - x0 >= y1 - y0:
        cv2.line(cl, (int(round(x0)), int(round((y0 + y1) / 2))), (int(round(x1)) - 1, int(round((y0 + y1) / 2))), 255, 1)
    else:
        cv2.line(cl, (int(round((x0 + x1) / 2)), int(round(y0))), (int(round((x0 + x1) / 2)), int(round(y1)) - 1), 255, 1)
    for ex, ey in ends:
        cv2.circle(cl, (int(round(ex)), int(round(ey))), 3, 0, -1)
    return bool(((cl > 0) & (lines > 0)).any())


def _shared_ends(out, S, rect):
    """the ends of a rectangle's centre-line (working px) that lie within 0.75 source px of a wall's end"""
    x0, y0, x1, y1 = rect
    ends = [(x0, (y0 + y1) / 2.0), (x1, (y0 + y1) / 2.0)] if x1 - x0 >= y1 - y0 else [((x0 + x1) / 2.0, y0), ((x0 + x1) / 2.0, y1)]
    verts = [q for e in out["wallEdges"] for q in e["sourcePx"][:2]]
    hit = []
    for ex, ey in ends:
        sx, sy = S(ex, ey)
        if any(math.hypot(q[0] - sx, q[1] - sy) <= 0.75 for q in verts):
            hit.append((ex, ey))
    return hit


def _flush_with(rect, walls, grow):
    """a pocket's rectangle, grown into the walls round it (grow, per side) and, on a side it did not grow, carried out
    to the outermost face of the walls it lies between when that face is within 1.5 px: a face a fraction of a pixel
    short of its neighbours' showed as a hairline (h1)"""
    x0, y0, x1, y1 = rect[0] - grow[0], rect[1] - grow[1], rect[2] + grow[2], rect[3] + grow[3]
    out_ = [x0, y0, x1, y1]
    for side in range(4):
        if grow[side]:
            continue
        lv = side in (0, 2)                                  # (a left or right side: the walls above and below matter)
        f = out_[side]
        lo_, hi_ = (y0, y1) if lv else (x0, x1)
        faces = []
        for w in walls:
            near_ends = (abs(w[3] - lo_) <= 1.5 or abs(w[1] - hi_) <= 1.5) if lv else (abs(w[2] - lo_) <= 1.5 or abs(w[0] - hi_) <= 1.5)
            if not near_ends:
                continue
            wf = w[side]
            beyond = (f - wf) if side in (0, 1) else (wf - f)
            if 0 < beyond <= 1.5:
                faces.append(wf)
        if faces:
            out_[side] = min(faces) if side in (0, 1) else max(faces)
    return tuple(out_)


def _pockets(out, S, T, drawn, ink_raw, lines, rooms_mask, mm_src, room_left):
    """Last of all: a pocket of drawn wall still left out where the walls meet - not wall, not in a room, closed over by
    a square of one and a half walls (what the app check counts as a notch), mostly ink and nearly rectangular - gets a
    piece of its own, carried a pixel or two into the walls round it (J: "can you see there is still a hole here", a
    column covered only in part on s056; h1, s005, s057).  Paper between walls (a wedge where a wall meets a slanted
    one) is left alone.  Returns the number added."""
    H, W = drawn.shape
    wall = _work_wall_mask(out, S, (H, W), joints=_wall_vertices(out, S))
    k = max(3, int(round(1.5 * T)) | 1)
    closed = cv2.morphologyEx(wall, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    gap = ((closed > 0) & (wall == 0) & (rooms_mask == 0)).astype(np.uint8)
    inked = (drawn > 0) | (ink_raw > 0)
    slanted = np.zeros((H, W), np.uint8)                     # (a pocket at a slanted wall is that joint's own shape:
    for e in out["wallEdges"]:                               # filled with level pieces it showed seams and steps, s042)
        (ax, ay), (bx, by) = (_from_source(S, *q) for q in e["sourcePx"][:2])
        ang = abs(math.degrees(math.atan2(by - ay, bx - ax))) % 90.0
        if min(ang, 90.0 - ang) > 2.0:
            t = max(1, int(round(float(e.get("thicknessPx") or 0) / S.k)))
            cv2.line(slanted, (int(round(ax)), int(round(ay))), (int(round(bx)), int(round(by))), 255, t + 4)
    n, lab, st, _ = cv2.connectedComponentsWithStats(gap, 8)
    next_id = max((int(e["id"][1:]) for e in out["wallEdges"] if e["id"][1:].isdigit()), default=0) + 1
    min_t = (40.0 / float(mm_src)) / S.k if mm_src else 2.0   # (the app builds no wall thinner than 40 mm)
    added = 0
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in st[i])
        if added >= room_left or area < 4 or max(w, h) > 1.5 * T or area < 0.6 * w * h:
            continue
        comp = lab[y:y + h, x:x + w] == i
        if float(inked[y:y + h, x:x + w][comp].mean()) < 0.6 or (slanted[y:y + h, x:x + w][comp] > 0).any():
            continue                                         # (paper: the shape the drawing has, not a hole)
        rect = (float(x), float(y), float(x + w), float(y + h))
        grow = [0, 0, 0, 0]                                  # (into the walls round it; its centre-line is checked below)
        for side in range(4):
            for kk in (1, 2):
                a, b, c, d = ((x - kk, y, x - kk + 1, y + h), (x, y - kk, x + w, y - kk + 1),
                              (x + w + kk - 1, y, x + w + kk, y + h), (x, y + h + kk - 1, x + w, y + h + kk))[side]
                if a < 0 or b < 0 or c > W or d > H or (wall[b:d, a:c] > 0).mean() < 0.5:
                    break
                grow[side] = kk
        walls_ = _wall_rects(out, S, _wall_vertices(out, S))
        rect = _flush_with(rect, walls_, grow)
        if _crosses(rect, lines, _shared_ends(out, S, rect)):                            # (its ends overlapping a wall would meet that wall's
            lv = w >= h                                      # centre-line: they end on its face instead, exactly
            g = list(grow)                                   # where the app builds it)
            g[0 if lv else 1] = g[2 if lv else 3] = 0
            rect = _flush_with((float(x), float(y), float(x + w), float(y + h)), walls_, g)
            if _crosses(rect, lines, _shared_ends(out, S, rect)):
                continue
        across = (0, 2) if rect[3] - rect[1] > rect[2] - rect[0] else (1, 3)
        if min(rect[2] - rect[0], rect[3] - rect[1]) < min_t and not all(grow[sd] for sd in across):
            continue                                         # (the app would build it thicker than the pocket, out past
                                                             # it - unless it lies between two walls that hide that)
        a_, b_, ts = _emit(out, S, rect, next_id, mm_src, head_on=True)   # (an end short of a wall by a slit meets it)
        _mark(lines, wall, rect, a_, b_)
        _log("pocket", x, y, w, h, "ink %.0f%%" % (100 * float(inked[y:y + h, x:x + w][comp].mean())), T, rect, next_id,
             S, a_, b_, ts)
        next_id += 1; added += 1
    return added


def _align_after(out, S, first, mm_src):
    """The pieces' free ends once more, with every piece in place: an end flush with a piece emitted after it (the
    study's wall and its return on J's screenshot, a step a pixel's thirtieth wide) goes where the app builds that face."""
    if not mm_src or S.Hi is not None or S.b != 0:
        return
    count = {}
    for e in out["wallEdges"]:
        for q in e["sourcePx"][:2]:
            key = (round(q[0], 3), round(q[1], 3))
            count[key] = count.get(key, 0) + 1
    for e in out["wallEdges"][first:]:
        pa, pb = e["sourcePx"][0], e["sourcePx"][1]
        h = float(e.get("thicknessPx") or 0) / 2.0
        lv = abs(pa[1] - pb[1]) <= abs(pa[0] - pb[0])
        c = (pa[1] + pb[1]) / 2.0 if lv else (pa[0] + pb[0]) / 2.0
        free = [pt for pt in (pa, pb) if count.get((round(pt[0], 3), round(pt[1], 3)), 0) == 1]
        if free and h > 0:
            _app_face_ends(out, S, None, pa, pb, float(mm_src), free, own=e, across=(c - h, c + h))


def _standalone_pass(out, m, S, T, gray, jogs, chosen, runs, skip=()):
    out["diagnostics"]["standaloneWallsAdded"] = leftover_walls(out, m, S, T, gray, runs, skip) if LEFTOVER else 0
    out["diagnostics"]["jogsThicknessChosen"] = len(chosen | choose_jog_thickness(out, jogs))
    out["diagnostics"]["standaloneFacesOnTheWalls"] = standalone_faces_on_walls(out, out["diagnostics"]["standaloneWallsAdded"])


def _standalone_walls(out, m, S, T, gray, jogs, chosen):
    """The standalone walls (rounds 36, 37 and 40b).  Round 40b's runs of wall are kept only where the page, with every
    later pass done, has no slot, notch, seam or step the same reading without them lacks (app_flaws.py): a run near a new one
    is left out and the rest tried again, twice at most (the run itself was checked as it was laid, but a column or a
    pocket laid after it, or the faces put on the walls, can still meet it badly - s060's kitchen)."""
    import copy
    if not (LEFTOVER and R40B_MISSING) or S.Hi is not None or S.b != 0:
        _standalone_pass(out, m, S, T, gray, jogs, set(chosen), False)
        return                                               # (a page turned level or rectified: a level piece would lean
                                                             # in the source's pixels and leave wedges at its joints - the
                                                             # photographed copies' notches)
    before = copy.deepcopy(out)
    work = copy.deepcopy(before)
    _standalone_pass(work, m, S, T, gray, jogs, set(chosen), True)
    if work.get("_runs"):
        ref = copy.deepcopy(before)
        _standalone_pass(ref, m, S, T, gray, jogs, set(chosen), False)
        f_ref, skip, Tf = _r40b_flaws(ref), set(), None
        for attempt in range(3):
            f_w = _r40b_flaws(work)
            if f_ref is None or f_w is None:
                break
            import app_flaws
            new = app_flaws.added(f_w, f_ref)
            bad = [f for k_ in ("slots", "notches", "seams", "steps") for f in new[k_]]
            if not bad:
                break
            Tf = Tf or app_flaws.wall_T(work)
            near = {r_["part"] for r_ in work["_runs"] if any(r_["box"][0] - 2 * Tf <= f[0] <= r_["box"][2] + 2 * Tf
                                                             and r_["box"][1] - 2 * Tf <= f[1] <= r_["box"][3] + 2 * Tf for f in bad)}
            if attempt == 2 or not near:
                n_runs = len(work["_runs"])
                work = ref
                work["diagnostics"]["wallRunsNoRoomTracedAgainst"] = 0
                work["diagnostics"]["wallRunsWithheldAtTheEnd"] = n_runs
                break
            skip |= near
            work = copy.deepcopy(before)
            _standalone_pass(work, m, S, T, gray, jogs, set(chosen), True, skip)
            work["diagnostics"]["wallRunsLeftOutAtFlaws"] = len(skip)
            if not work.get("_runs"):
                break
    work.pop("_runs", None)
    out.clear(); out.update(work)


def leftover_walls(out, m, S, T, gray, runs=False, skip=()):
    """Round 36 (see above), with round 40b's runs of wall (runs: on; skip: the parts, by their box in working px, not
    to lay).  Returns the number of standalone wall edges added."""
    W, H = int(m["size"][0]), int(m["size"][1])
    app = _work_wall_mask(out, S, (H, W))
    lines = cv2.dilate(_work_wall_mask(out, S, (H, W), centre_only=True), np.ones((3, 3), np.uint8))
    room_lines = lines.copy()                                # (a few pixels' touch may cross a piece's line: the app
                                                             # drops such a piece, the document stands)
    drawn = _work_drawn_mask(m, (H, W))
    partitions = _work_drawn_mask(m, (H, W), masses=False)
    verts = _wall_vertices(out, S)
    ink = ink_raw = None                                     # solid ink: what stays of the dark pixels after a 1 px
    if gray is not None and gray.shape == (H, W):            # erosion (lines and hatching go, a filled column stays)
        ink_raw = (gray < float(m.get("ink_threshold") or 180)).astype(np.uint8)
        ink = cv2.erode(ink_raw, np.ones((3, 3), np.uint8))
    left = (drawn > 0) & (cv2.dilate(app, np.ones((5, 5), np.uint8)) == 0)
    left = cv2.morphologyEx(left.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    rooms_mask = np.zeros((H, W), np.uint8)
    for r in out["rooms"]:
        pts = np.round(np.array([_from_source(S, q["x"], q["y"]) for q in r["sourcePoints"]])).astype(np.int32)
        cv2.fillPoly(rooms_mask, [pts], 255)
    near = cv2.dilate(app, np.ones((9, 9), np.uint8))
    app_near = cv2.dilate(app, np.ones((7, 7), np.uint8))
    app_j = _work_wall_mask(out, S, (H, W), joints=verts)   # (ends as the app joins them: where a piece truly meets a wall)
    walls = _wall_rects(out, S, verts)
    n, lab, st, _ = cv2.connectedComponentsWithStats(left, 8)
    mm_src = (out.get("scale") or {}).get("millimetresPerPixel")
    next_id = max((int(e["id"][1:]) for e in out["wallEdges"] if e["id"][1:].isdigit()), default=0) + 1
    reach = int(math.ceil(T)) + 3
    added, rects = 0, []
    zone = flaws_before = unit = None
    flaws_at = -1
    missing = 0
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in st[i])
        if area < 0.25 * T * T:
            continue
        comp = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        if not (near[y:y + h, x:x + w][comp > 0] > 0).any():
            continue                                         # (standing apart from every wall: not this pass's)
        inside = float((rooms_mask[y:y + h, x:x + w][comp > 0] > 0).mean())
        compact = max(w, h) <= LEFTOVER_COMPACT_T * T and area <= 2.0 * LEFTOVER_COMPACT_T * T * T
        long_out = inside < 0.7 and not compact
        if long_out and not (runs and ink is not None) or (long_out and (x, y, w, h) in skip):
            continue
        part_rects, crossed = None, False
        if long_out:                                         # (round 40b: a run of wall no room is traced against)
            if zone is None:
                zone = cv2.dilate(app, np.ones((2 * int(math.ceil(0.5 * T)) + 1,) * 2, np.uint8))
            rest = ((comp > 0) & (zone[y:y + h, x:x + w] == 0)).astype(np.uint8)
            if rest.sum() < R40B_REST * comp.sum() or ink[y:y + h, x:x + w][rest > 0].mean() < 0.6:
                continue                                     # (a strip along a wall's face; lines, not a solid wall)
            if unit is None:
                unit = _r40b_unit(m, H, W, drawn, app, rooms_mask, T)
            rest = _r40b_unit_rest(rest, x, y, comp, unit, drawn, app, T)
            if rest.sum() < R40B_REST * comp.sum():
                continue                                     # (not the unit's: a neighbour's wall, a parapet)
            part_rects = _rectangles(rest, 0.25 * T * T, max(3.0, 0.2 * T))
            cover = np.zeros_like(rest)
            for x0, y0, x1, y1 in part_rects:
                cover[y0:y1, x0:x1] = 1
            if (not part_rects or len(part_rects) > R40B_MAX_RECTS
                    or float((cover & rest).sum()) < 0.9 * float(rest.sum())):
                continue                                     # (slanted or ragged: not level / plumb pieces)
            if flaws_before is None or flaws_at != len(out["wallEdges"]):
                flaws_before, flaws_at = _r40b_flaws(out), len(out["wallEdges"])   # (with every piece laid so far)
            undo = (len(out["wallEdges"]), lines.copy(), app_near.copy(), len(rects), next_id, added)
        for x0, y0, x1, y1 in (part_rects if part_rects is not None else _rectangles(comp, 0.25 * T * T, max(3.0, 0.2 * T))):
            if added >= LEFTOVER_MAX:
                break
            box = (slice(y + y0, y + y1), slice(x + x0, x + x1))
            # (a sliver a few pixels wide along a wall, a column standing a little past the wall's face, is judged
            # unshaved; a fixture's outline drawn as thick as that stands against no wall along its length)
            solid = ink is not None and (ink[box].mean() >= 0.6
                                         or (min(x1 - x0, y1 - y0) <= 8 and ink_raw[box].mean() >= 0.75
                                             and _along_wall(near, x + x0, y + y0, x + x1, y + y1)))
            outlined = partitions[box].mean() >= 0.8 * 255 and inside >= 0.7 and max(x1 - x0, y1 - y0) >= 2.0 * T
            if not (solid or outlined):
                continue                                     # (thin lines, not a filled wall or column: a bed's pillows
                                                             # stage 1 took for two partitions on p02)
            rect = _reach_walls(app_near, drawn, lines, x0 + x, y0 + y, x1 + x, y1 + y, reach)
            rect = _through_mass(rect, drawn, app_j, lines, 2 * reach)
            rect = _touch_walls(_meet_across(rect, app_j, lines, T), app_j, room_lines)
            rect, sv, ev = _join_vertex(rect, verts, lines, T, reach, 2.0 if long_out else None)
            if sv is None and ev is None:
                rect = _overlap_walls(rect, walls + rects, lines)
            if long_out and _crosses(rect, lines, _shared_ends(out, S, rect)):
                crossed = True                               # (its centre-line would cross a wall's: the app refuses it)
                break
            rects.append(rect)
            a, b, ts = _emit(out, S, rect, next_id, mm_src, sv, ev)
            _mark(lines, app_near, rect, a, b)
            _log("part", x, y, w, h, "%s, inside %.0f%%" % ("compact" if compact else "long", 100 * inside), T, rect,
                 next_id, S, a, b, ts)
            next_id += 1; added += 1
        if long_out and not crossed and added > undo[5] and added < LEFTOVER_MAX:
            added, next_id = _r40b_between(out, S, T, comp, x, y, w, h, rects[undo[3]:], rects, walls, app_j, app_near,
                                           drawn, lines, ink_raw, mm_src, next_id, added)
        if long_out:
            after = None if crossed or added == undo[5] else _r40b_flaws(out)
            new_ = ["a centre-line crossing"] if crossed else _r40b_new(after, flaws_before)
            if new_ or added == undo[5]:
                del out["wallEdges"][undo[0]:]
                lines[:], app_near[:] = undo[1], undo[2]
                del rects[undo[3]:]
                next_id, added = undo[4], undo[5]
                if new_ and LEFTOVER_LOG:
                    print("leftover: run at %d,%d %dx%d withheld (%s)" % (x, y, w, h, ", ".join(new_)), file=sys.stderr)
            else:
                flaws_before, flaws_at = (after, len(out["wallEdges"])) if after is not None else (flaws_before, -1)
                missing += 1
                pts = [q for e in out["wallEdges"][undo[0]:] for q in e["sourcePx"][:2]]
                out.setdefault("_runs", []).append({"part": (x, y, w, h), "box": (min(q[0] for q in pts), min(q[1] for q in pts),
                                                                                 max(q[0] for q in pts), max(q[1] for q in pts))})
    if ink_raw is not None and added < LEFTOVER_MAX:
        added += _slivers(out, S, T, drawn, ink_raw, lines, verts, rects, next_id, mm_src,
                          min(LEFTOVER_MAX - added, LEFTOVER_SLIVERS))
    if ink_raw is not None and added < LEFTOVER_MAX:
        added += _pockets(out, S, T, drawn, ink_raw, lines, rooms_mask, mm_src, min(LEFTOVER_MAX - added, LEFTOVER_SLIVERS))
    _align_after(out, S, len(out["wallEdges"]) - added, mm_src)
    if runs:
        out["diagnostics"]["wallRunsNoRoomTracedAgainst"] = missing
    return added


def _r40b_between(out, S, T, comp, x, y, w, h, run_rects, rects, walls, app_j, app_near, drawn, lines, ink_raw, mm_src,
                  next_id, added):
    """A strip of a run's part left between two of its pieces, along a wall's face (s022: the wall drawn wider between
    its two columns than the room's wall was traced) - solid ink, at most 0.6 of a wall deep, a wall long or longer, both
    its ends on pieces of this run - gets a piece of its own, carried into the wall and the pieces it meets.  A strip
    along a wall's face with no piece at an end stays out (round 36: window frames, fixtures)."""
    H, W = app_j.shape
    pad = int(math.ceil(T)) + 3
    X0, Y0, X1, Y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    pieces = np.zeros((Y1 - Y0, X1 - X0), np.uint8)
    for a0, b0, a1, b1 in run_rects:
        pieces[max(0, int(math.floor(b0)) - Y0):max(0, int(math.ceil(b1)) - Y0), max(0, int(math.floor(a0)) - X0):max(0, int(math.ceil(a1)) - X0)] = 1
    part = np.zeros_like(pieces)
    part[y - Y0:y - Y0 + h, x - X0:x - X0 + w] = comp
    left = ((part > 0) & (pieces == 0) & (app_j[Y0:Y1, X0:X1] == 0)).astype(np.uint8)
    left = cv2.morphologyEx(left, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(left, 8)
    for i in range(1, n):
        bx, by, bw, bh, area = (int(v) for v in st[i])
        short, long_ = min(bw, bh), max(bw, bh)
        if area < 0.5 * T * T or short > 0.6 * T + 1 or long_ < T or added >= LEFTOVER_MAX:
            continue
        sel = lab[by:by + bh, bx:bx + bw] == i
        if float(sel.mean()) < 0.8 or float(ink_raw[Y0 + by:Y0 + by + bh, X0 + bx:X0 + bx + bw][sel].mean()) < 0.75:
            continue                                         # (not a solid strip)
        plumb = bh > bw
        ends = ((pieces[max(0, by - 2):by, bx:bx + bw], pieces[by + bh:by + bh + 2, bx:bx + bw]) if plumb else
                (pieces[by:by + bh, max(0, bx - 2):bx], pieces[by:by + bh, bx + bw:bx + bw + 2]))
        if not all(e_.size and float(e_.mean()) >= 0.5 for e_ in ends):
            continue                                         # (not between two of the run's pieces)
        rect = _reach_walls(app_near, drawn, lines, X0 + bx, Y0 + by, X0 + bx + bw, Y0 + by + bh, 3)
        rect = _overlap_walls(rect, walls + rects, lines)
        if _crosses(rect, lines, _shared_ends(out, S, rect)):
            continue
        rects.append(rect)
        a, b, ts = _emit(out, S, rect, next_id, mm_src)
        _mark(lines, app_near, rect, a, b)
        _log("strip between a run's pieces", X0 + bx, Y0 + by, bw, bh, "", T, rect, next_id, S, a, b, ts)
        next_id += 1; added += 1
    return added, next_id


R40B_ROOM_WORDS = ("BED", "ROOM", "KITCHEN", "LIVING", "DINING", "BATH", "WC", "W.C", "TOILET", "STORE", "BALCONY", "STUDY",
                   "FAMILY", "UTILITY", "YARD", "LEDGE", "SHELTER", "FOYER", "HALL", "MASTER", "MAID", "POWDER", "PANTRY",
                   "LAUNDRY", "CLOSET", "WIC", "SERVICE", "LOUNGE", "OFFICE", "GUEST", "PES", "TERRACE", "PATIO")
R40B_COMMON = ("ACCESS", "CORRIDOR", "LOBBY", "LANDING", "LIFT", "STAIR", "COMMON")
R40B_TITLE = ("TYPE", "MODEL", "APARTMENT", "FLAT", "SCALE", "PLAN")


def _r40b_unit(m, H, W, drawn, app, rooms_mask, T):
    """J, 19 Oct: "keep it to the unit walls only but ensure not to detect wrongly and leave things out from the unit".
    The unit, for round 40b's runs: (a) its envelope - stage 1's walls, partitions, lines (not dimension or extension
    lines), slanted walls, arcs and door leaves, with the app's walls and rooms, closed over a metre (a door, a narrow
    window) and filled - less the common areas in it (the free space round an ACCESS BALCONY, CORRIDOR, LOBBY ...
    label, closed over 80 mm); and (b) the room names stage 1 read (not a plan's title or a common area).  Returns
    (envelope mask, names [(x, y)], mm per working px)."""
    mm = float(m.get("mm_per_px") or 0) or 200.0 / max(T, 1.0)
    s_ = drawn.copy()
    for l in m.get("lines", []):
        if l.get("role") in ("dimension", "extension"):
            continue
        t = max(2, int(round(l.get("w", 2))))
        a, b = (int(round(l["a"])), int(round(l["c"]))), (int(round(l["b"])), int(round(l["c"])))
        if l["o"] == "v":
            a, b = (a[1], a[0]), (b[1], b[0])
        cv2.line(s_, a, b, 255, t)
    for d in m.get("diagonals", []):
        P = np.round(np.array(d, float).reshape(-1, 2)).astype(np.int32)
        if len(P) >= 2:
            cv2.polylines(s_, [P], False, 255, 3)
    for a in m.get("arcs", []):
        rx, ry = a.get("rx", a["r"]), a.get("ry", a["r"])
        cv2.ellipse(s_, (int(round(a["cx"])), int(round(a["cy"]))), (int(round(rx)), int(round(ry))), 0, a["start"],
                    a["start"] + a.get("span", 90.0), 255, 3)
    for d in m.get("doors", []):
        hx, hy = d["hinge"]; L = d.get("leaf_px", 0); ang = math.radians(d.get("leaf_angle_deg", 0))
        cv2.line(s_, (int(round(hx)), int(round(hy))), (int(round(hx + L * math.cos(ang))), int(round(hy + L * math.sin(ang)))), 255, 3)
    s_ = s_ | app | rooms_mask
    k = max(3, int(round(1000.0 / mm)) | 1)
    closed = cv2.morphologyEx(s_, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    ff = np.pad((closed > 0).astype(np.uint8), 1)
    cv2.floodFill(ff, None, (0, 0), 2)
    env = (ff[1:-1, 1:-1] != 2).astype(np.uint8)            # (the closed structure and every hole in it)
    names, common = [], []
    for t in m.get("texts", []):
        s_t = t.get("s", "").upper()
        b = t.get("box") or [0, 0, 0, 0]
        c = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))
        if not (0 <= c[0] < W and 0 <= c[1] < H):
            continue
        if any(w_ in s_t for w_ in R40B_COMMON):
            common.append(c)
        elif (any(w_ in s_t for w_ in R40B_ROOM_WORDS) and len(s_t) <= 24 and not re.search(r"\d\s*-?\s*ROOM", s_t)
              and not any(w_ in s_t for w_ in R40B_TITLE)):
            names.append(c)
    if common:
        kf = max(3, int(round(80.0 / mm)) | 1)
        free = (cv2.morphologyEx(s_, cv2.MORPH_CLOSE, np.ones((kf, kf), np.uint8)) == 0).astype(np.uint8)
        n, lab, _st, _c = cv2.connectedComponentsWithStats(free, 4)
        for cx, cy in common:
            if lab[cy, cx] > 0 and not (rooms_mask[lab == lab[cy, cx]] > 0).any():
                env[lab == lab[cy, cx]] = 0                  # (a common area: not the unit, though walls close it in)
    return env, names, mm


def _r40b_unit_rest(rest, x, y, comp, unit, drawn, app, T):
    """the rest of a run's part, less its long pieces that are not the unit's: a long piece is the unit's where the
    unit's envelope lies along half of one of its long sides (within 1.5 wall thicknesses), or a room name stage 1 read
    lies in front of one of them, within 4 m, before any wall.  A compact piece (a column, a fin) stays, as round 36's
    columns do."""
    env, names, mm = unit
    H, W = env.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest, 8)
    out = rest.copy()
    D = int(math.ceil(1.5 * T)); Ld = int(4000.0 / mm)
    for j in range(1, n):
        bx, by, bw, bh, ba = (int(v) for v in st[j])
        if max(bw, bh) <= LEFTOVER_COMPACT_T * T and ba <= 2.0 * LEFTOVER_COMPACT_T * T * T:
            continue
        X0, Y0, X1, Y1 = x + bx, y + by, x + bx + bw, y + by + bh
        plumb = bh > bw
        sides = ((env[Y0:Y1, max(0, X0 - D):X0], env[Y0:Y1, X1:X1 + D]) if plumb else
                 (env[max(0, Y0 - D):Y0, X0:X1], env[Y1:Y1 + D, X0:X1]))
        if any(s_.size and float(s_.mean()) >= 0.5 for s_ in sides):
            continue
        own = np.zeros((H, W), np.uint8)
        own[y:y + comp.shape[0], x:x + comp.shape[1]] = comp
        named = False
        for sd in (-1, 1):
            swept = np.zeros((H, W), np.uint8)
            for f in np.linspace(0.0, 1.0, max(3, max(bw, bh) // 4)):
                if plumb:
                    yy, xx = int(Y0 + f * (Y1 - Y0 - 1)), (X0 - 1 if sd < 0 else X1)
                else:
                    xx, yy = int(X0 + f * (X1 - X0 - 1)), (Y0 - 1 if sd < 0 else Y1)
                for k_ in range(1, Ld):
                    px, py = (xx + sd * k_, yy) if plumb else (xx, yy + sd * k_)
                    if not (0 <= px < W and 0 <= py < H) or ((drawn[py, px] or app[py, px]) and not own[py, px]):
                        break
                    swept[py, px] = 1
            swept = cv2.dilate(swept, np.ones((5, 5), np.uint8))
            if any(swept[cy, cx] for cx, cy in names):
                named = True
                break
        if not named:
            out[lab == j] = 0
    return out


def _r40b_flaws(out):
    """the app check's slots, seams and steps, replayed (app_flaws.py), or None when it cannot run"""
    try:
        import app_flaws
        return app_flaws.flaws(out)
    except Exception:
        return None


def _r40b_new(after, before):
    """what a part's pieces add: new slots, notches, seams or steps (app_flaws.added) - or nothing to compare (kept)"""
    if after is None or before is None:
        return []
    import app_flaws
    new = app_flaws.added(after, before)
    return ["%d %s %s" % (len(new[k]), k, " ".join("(%s)" % ",".join("%g" % v for v in f) for f in new[k][:4]))
            for k in ("slots", "notches", "seams", "steps") if new[k]]


def weld_shared_ends(rooms, tol):
    """An opening both its rooms carry is exported once, on one span: the second room takes the first room's edge when
    the two cut it within a pixel of each other.  Each room snaps a cut that lands near its own corner to that corner
    (SNAP_CUTS), and two rooms' corners at the jamb can stand a pixel or two apart (s010 on the Mac: 338.5 and 337.7 at
    the folding bath door): the opening then went out twice, and the app would make two walls of it.  Where the two
    rooms' ends of one opening's span are more than a pixel and at most tol apart along the wall, the second room's end
    is moved onto the first room's (round 28).  Ends within a pixel are left as they are: they already make one span."""
    seen = {}
    n_ = 0
    for ri, r in enumerate(rooms):
        P = r["pts"]; k = len(P)
        for i in range(k):
            og = r["meta"][i].get("opening")
            if og is None:
                continue
            a, b = P[i], P[(i + 1) % k]
            hz = abs(a[1] - b[1]) <= abs(a[0] - b[0])
            u = 0 if hz else 1                               # the coordinate along the wall
            if (a[1 - u] != b[1 - u]) or a[u] == b[u]:
                continue                                     # (level / plumb spans only)
            if id(og) not in seen:
                seen[id(og)] = (ri, a, b, u); continue
            rj, a0, b0, u0 = seen[id(og)]
            if rj == ri or u0 != u or abs(a[1 - u] - a0[1 - u]) > 0.25:
                continue
            ends0 = sorted((a0, b0), key=lambda q: q[u])
            ends = sorted((a, b), key=lambda q: q[u])
            for p_, q_ in zip(ends, ends0):
                d = abs(p_[u] - q_[u])
                if 1.0 < d <= tol and not any(abs(t[0] - q_[0]) < 1e-9 and abs(t[1] - q_[1]) < 1e-9 for t in P):
                    p_[u] = q_[u]; n_ += 1
    return n_


def weld_corners(rooms, tol):
    """Two rooms' corners within tol pixels of each other become one point (the first seen).  The app splits every room
    side at every corner of every room on its line, makes vertices in whole millimetres and merges them within half a
    pixel: a corner half a pixel from another room's corner leaves a piece of wall with both ends on one vertex, which
    the document refuses (h1's kitchen window beside the balcony door: 709.5 and 710.0).  Nothing within one room is
    welded, so no side collapses."""
    if tol <= 0:
        return 0
    reps = []                                                # (x, y, room index)
    n_ = 0
    for ri, r in enumerate(rooms):
        for p in r["pts"]:
            hit = next((q for q in reps if abs(q[0] - p[0]) <= tol and abs(q[1] - p[1]) <= tol), None)
            if hit is None:
                reps.append((p[0], p[1], ri))
            elif hit[2] != ri and (hit[0] != p[0] or hit[1] != p[1]):
                if not any(abs(q[0] - hit[0]) < 1e-9 and abs(q[1] - hit[1]) < 1e-9 for q in r["pts"]):
                    p[0], p[1] = hit[0], hit[1]; n_ += 1
    return n_


def straighten_axis_sides(rooms, tol):
    """Room sides within `tol` (working pixels) of level or plumb, but not exactly, are made exact: the corners joined by
    such sides - across every room, a corner shared by two rooms being one corner - get one x (or y), the length-weighted
    mean of those sides.  Returns the number of corners moved."""
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    moved = 0
    for ax in (0, 1):
        parent = {}
        def find(a):
            while parent.setdefault(a, a) != a:
                parent[a] = parent[parent[a]]; a = parent[a]
            return a
        sides = []
        for r in rooms:
            P = r["pts"]; k = len(P)
            for i in range(k):
                a, b = P[i], P[(i + 1) % k]
                d_ax, d_along = abs(a[ax] - b[ax]), abs(a[1 - ax] - b[1 - ax])
                if d_ax <= tol and d_along >= 8.0 * max(d_ax, 1e-9) and d_along > 2.0 * tol:
                    ka, kb = key(a), key(b)
                    parent[find(ka)] = find(kb)
                    sides.append((ka, kb, d_along, 0.5 * (a[ax] + b[ax])))
        acc = {}
        for ka, kb, L, c in sides:
            g = find(ka); s_ = acc.setdefault(g, [0.0, 0.0, set()])
            s_[0] += L * c; s_[1] += L; s_[2].update((ka, kb))
        target = {}
        for g, (wc, w, members) in acc.items():
            vals = {k_[ax] for k_ in members}
            if len(vals) > 1 and max(vals) - min(vals) <= 2.0 * tol:
                c = wc / w
                for k_ in members:
                    target[k_] = c
        for r in rooms:
            for p in r["pts"]:
                c = target.get(key(p))
                if c is not None and p[ax] != c:
                    p[ax] = c; moved += 1
    return moved


def _axis_of(a, b, tol_deg=0.5):
    """'h' / 'v' where the side a-b lies within tol_deg of level / plumb, else None"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    if math.hypot(dx, dy) < 1e-9:
        return None
    ang = abs(math.degrees(math.atan2(dy, dx))) % 180.0
    if min(ang, 180.0 - ang) <= tol_deg:
        return "h"
    return "v" if abs(ang - 90.0) <= tol_deg else None


def _on_ink(k, p, r=1):
    """the wall mass k has ink within r px of p"""
    H, W = k.shape
    x, y = int(round(p[0])), int(round(p[1]))
    if not (0 <= x < W and 0 <= y < H):
        return False
    return bool(k[max(0, y - r):min(H, y + r + 1), max(0, x - r):min(W, x + r + 1)].any())


def _edges_along(gray, run, T):
    """the drawing's edges beside a run of slanted pieces (strong gradients of the work image within 0.75 T of a piece,
    between a tenth and nine tenths of it): the share, by gradient strength, that runs nearer the piece's own direction
    than the plan's level / plumb.  High where the run follows a wall drawn slanted; low where it cuts across a square
    corner (whose edges are level and plumb).  None without edges."""
    pts = np.array(run, float)
    H, W = gray.shape
    x0, y0 = np.maximum(0, np.floor(pts.min(0) - T).astype(int))
    x1, y1 = np.minimum([W, H], np.ceil(pts.max(0) + T).astype(int))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return None
    g = cv2.GaussianBlur(gray[y0:y1, x0:x1].astype(np.float32), (0, 0), 1.0)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    mag = np.hypot(gx, gy)
    edge = (np.degrees(np.arctan2(gy, gx)) + 90.0) % 180.0          # an edge runs across its gradient
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    along_run = total = 0.0
    for p, q in zip(run, run[1:]):
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        f = ((xx - p[0]) * ux + (yy - p[1]) * uy) / L
        d = np.abs((yy - p[1]) * ux - (xx - p[0]) * uy)
        sel = (f >= 0.1) & (f <= 0.9) & (d <= 0.75 * T) & (mag > 0.25 * mag.max())
        th = math.degrees(math.atan2(uy, ux)) % 180.0
        off_run = np.abs((edge[sel] - th + 90.0) % 180.0 - 90.0)
        off_axis = np.abs((edge[sel] + 45.0) % 90.0 - 45.0)
        w = mag[sel]
        along_run += float(w[off_run < off_axis].sum()); total += float(w.sum())
    return along_run / total if total > 0 else None


def square_cut_corners(rooms, k, T, max_len, gray=None):
    """Round 32 (J, 12 Oct, on the walls built from s042, s057 and s080: tapered walls, a step at a T, a hooked wall end):
    on a plan drawn level and plumb (four fifths of the outlines' length within half a degree), a run of slanted pieces
    of a room outline, each no longer than max_len, between two level / plumb sides, is where the trace cut across a
    corner it should have turned, joined two parallel sides by a diagonal, or dipped into a notch and back. It goes:
    the two sides meet in the square corner, a square step joins them, or the notch closes - only where the corner and
    the new sides lie on the walls' ink, never across an opening, and a corner another room shares moves only where that
    room's sides keep their level / plumb line (a one-piece step keeps both ends, and every room with that piece gets
    it). A run spanning three quarters of a wall width or more is squared only where the drawing's edges beside it run
    level and plumb (_edges_along under 0.6, from the work image gray; without it, never): exec's 45-degree wall and
    c24's slanted one follow their run, and a thick junction's ink alone would not tell them apart.  Round 33: a corner
    the run cuts off that another room has only as a split point of one straight side (s057's door jamb at the alcove: the
    living room's wall runs straight through it) stays, and the new corner goes beside it - the stretch between them may
    lack ink when the other room already has that very side (KEEP_SPLITS); and a run that leaves a side and comes back to
    its line through a short level / plumb side (s057's top wall) closes, the side running straight on (DIPS).  A change
    that gives the app a geometry problem it did not have (app_geometry_problems) is undone.  Returns the number of runs
    squared."""
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    near = lambda p, q: math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6
    total = level = 0.0
    for r in rooms:
        P = r["pts"]
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            total += L
            level += L if _axis_of(a, b) else 0.0
    if total <= 0 or level < 0.8 * total:
        return 0
    def ink_line(p, q):
        return all(_on_ink(k, (p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]))) for f in (0.25, 0.5, 0.75))
    def turns_back(path):
        seg = [(q[0] - p_[0], q[1] - p_[1]) for p_, q in zip(path, path[1:])]
        if any(math.hypot(*v) < 1e-6 for v in seg):
            return True
        return any(u[0] * w[0] + u[1] * w[1] < 0 and abs(u[0] * w[1] - u[1] * w[0]) <= 1e-6 * math.hypot(*u) * math.hypot(*w)
                   for u, w in zip(seg, seg[1:]))
    def slide_shared(r, gone, X, users):
        """the corners of other rooms at the places in gone, if each can move to X with that room's two sides at it
        keeping their level / plumb line, their direction and some length; None if any cannot"""
        moves = []
        for c in gone:
            for r_ in rooms:
                if r_ is r:
                    continue
                Q = r_["pts"]
                for t, q in enumerate(Q):
                    if not near(q, c):
                        continue
                    pc, nc = Q[t - 1], Q[(t + 1) % len(Q)]
                    for u, w in ((pc, q), (q, nc)):
                        o_ = _axis_of(u, w)
                        u2, w2 = (u, X) if w is q else (X, w)
                        if near(u2, w2) or not o_ or _axis_of(u2, w2) != o_:
                            return None
                        if (w[0] - u[0]) * (w2[0] - u2[0]) + (w[1] - u[1]) * (w2[1] - u2[1]) <= 0:
                            return None
                    moves.append(q)
        return moves
    def straight_through(r, c):
        """every other room with a corner at c has it in the middle of one straight side (its two sides there run on in
        one line): a split point, not a corner of that room"""
        for r_ in rooms:
            if r_ is r:
                continue
            Q = r_["pts"]
            for t, q in enumerate(Q):
                if not near(q, c):
                    continue
                u, w = Q[t - 1], Q[(t + 1) % len(Q)]
                v1, v2 = (q[0] - u[0], q[1] - u[1]), (w[0] - q[0], w[1] - q[1])
                if abs(v1[0] * v2[1] - v1[1] * v2[0]) > 1e-6 * math.hypot(*v1) * math.hypot(*v2) or v1[0] * v2[0] + v1[1] * v2[1] <= 0:
                    return False
        return True
    def has_side(r, c, X):
        """another room has a side from c to X (either way)"""
        for r_ in rooms:
            if r_ is r:
                continue
            Q = r_["pts"]
            for t in range(len(Q)):
                u, w = Q[t], Q[(t + 1) % len(Q)]
                if (near(u, c) and near(w, X)) or (near(u, X) and near(w, c)):
                    return True
        return False
    def one_run(r, users, skip):
        P, M = r["pts"], r["meta"]
        n = len(P)
        for s0 in range(n):                                  # s0: the level / plumb side before the run
            if not _axis_of(P[s0], P[(s0 + 1) % n]):
                continue
            run = []
            j = (s0 + 1) % n
            while len(run) < n - 3 and not _axis_of(P[j], P[(j + 1) % n]):
                run.append(j); j = (j + 1) % n
            if not run:
                continue
            a, b = P[run[0]], P[j]                           # the run goes from a to b; side j (b - pb) is level / plumb
            pa, pb = P[s0], P[(j + 1) % n]
            sig = (key(a), key(b))
            if sig in skip:
                continue
            pieces = [math.hypot(P[(q + 1) % n][0] - P[q][0], P[(q + 1) % n][1] - P[q][1]) for q in run]
            if max(pieces) > max_len or min(pieces) < 1e-6:
                continue
            if all(_axis_of(P[q], P[(q + 1) % n], 3.0) for q in run):
                continue                                     # (within 3 degrees: straighten_axis_sides' job)
            if any(M[q].get("opening") is not None for q in run):
                continue
            inner = [P[q] for q in run[1:]]                  # the corners between the run's pieces go in every case
            if any(len(users.get(key(c), ())) > 1 for c in inner):
                continue
            if math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.75 * T:
                along = _edges_along(gray, [a] + inner + [b], T) if gray is not None else None
                if along is None or along >= 0.6:
                    continue                                 # (a wall drawn slanted, or no picture to tell)
            o1, o2 = _axis_of(pa, a), _axis_of(b, pb)
            cands = [[b[0], a[1]]] if o1 == "h" else [[a[0], b[1]]]
            if o1 == o2:
                cands.append([a[0], b[1]] if o1 == "h" else [b[0], a[1]])
            for X in cands:
                if near(X, a) and near(X, b):
                    continue
                if DIPS and o1 != o2 and (near(X, pb) or near(X, pa)) and not near(X, a) and not near(X, b):
                    # a dip: the run leaves a side and comes back to its line through a short level / plumb side
                    # (s057's top wall: level, a 3-degree piece down, 2 px back up, level on the same line) - the run and
                    # that short side go, and the side runs straight on (round 33)
                    back = near(X, pb)
                    short_side, c_, far = (j, b, a) if back else (s0, a, b)
                    sp, sq = P[short_side], P[(short_side + 1) % n]
                    if math.hypot(sq[0] - sp[0], sq[1] - sp[1]) > max_len or M[short_side].get("opening") is not None \
                       or len(users.get(key(c_), ())) > 1 or not ink_line(far, X) or turns_back([pa, far, pb]):
                        continue
                    plain = lambda me: dict(me, kind="wall", opening=None)
                    new, new_meta, shape = ([a], [plain(M[s0])], "dip") if back else ([b], [M[j]], "dip")
                elif near(X, pa) or near(X, pb) or not _on_ink(k, X):
                    continue
                elif o1 != o2 or near(X, a) or near(X, b):   # a corner (or a notch): a and b give way to X
                    gone = [c for c in (a, b) if not near(c, X)]
                    if not all(ink_line(c, X) or has_side(r, c, X) for c in gone):
                        continue                             # (the stretches the sides grow by lie on the walls' ink, or
                                                             #  another room already has that very side)
                    # a corner another room has only as a point on one of its straight sides (it splits that side
                    # there, where this room's corner stood - s057's door jamb at the alcove) stays, and the new
                    # corner is added beside it (round 33; KEEP_SPLITS)
                    kept = [c for c in gone if KEEP_SPLITS and len(users.get(key(c), ())) > 1 and straight_through(r, c)]
                    gone = [c for c in gone if not any(c is k_ for k_ in kept)]
                    keep_a, keep_b = any(c is a for c in kept), any(c is b for c in kept)
                    path = [pa] + ([a] if keep_a else []) + [X] + ([b] if keep_b else []) + [pb]
                    if turns_back(path):
                        continue
                    # an opening's side may grow to the corner, never shrink
                    if M[s0].get("opening") is not None and math.hypot(X[0] - pa[0], X[1] - pa[1]) < math.hypot(a[0] - pa[0], a[1] - pa[1]) - 1e-6:
                        continue
                    if M[j].get("opening") is not None and math.hypot(pb[0] - X[0], pb[1] - X[1]) < math.hypot(pb[0] - b[0], pb[1] - b[1]) - 1e-6:
                        continue
                    # a corner another room shares slides to X only where that room's sides at it keep their line
                    moves = slide_shared(r, gone, X, users)
                    if moves is None:
                        continue
                    if (a[0] - pa[0]) * (X[0] - pa[0]) + (a[1] - pa[1]) * (X[1] - pa[1]) <= 0 or \
                       (pb[0] - b[0]) * (pb[0] - X[0]) + (pb[1] - b[1]) * (pb[1] - X[1]) <= 0:
                        continue                             # (the corner would lie behind pa, or past pb)
                    # the sides from the new corners: a kept a runs side s0 on to X (as wall), X runs side j's wall to a
                    # kept b, and the last corner starts side j as it did
                    plain = lambda me: dict(me, kind="wall", opening=None)
                    new = ([a] if keep_a else []) + [[X[0], X[1]]] + ([b] if keep_b else [])
                    new_meta = ([plain(M[s0])] if keep_a else []) + ([plain(M[j])] if keep_b else []) + [M[j]]
                    shape = "corner"
                else:                                        # a step: a - X - b
                    if len(run) > 1 and any(len(users.get(key(c), ())) > 1 for c in (a, b)):
                        continue
                    if not (ink_line(a, X) and ink_line(X, b)) or turns_back([pa, a, X, b, pb]):
                        continue
                    new = [a, [X[0], X[1]], b]
                    new_meta = [M[run[0]], M[run[0]], M[j]]
                    shape = "step"
                # rebuild the outline: ... pa, <new>, pb ...  (the sides keep their records: the step's from the run's first piece)
                order = [(s0 + 1 + t) % n for t in range(len(run) + 1)]   # indices of a, inner..., b
                keep = [q for q in range(n) if q not in order]
                newP, newM = [], []
                for q in range(n):
                    if q == order[0]:
                        for c, me in zip(new, new_meta):
                            newP.append([c[0], c[1]])
                            newM.append(dict(me))
                    elif q in keep:
                        newP.append(P[q]); newM.append(M[q])
                if shape == "dip" and not near(X, pb):       # (a dip back at pa: pa's side now runs along side j's line)
                    q_ = next(t for t, c in enumerate(newP) if c is pa)
                    newM[q_] = dict(M[j], kind="wall", opening=None)
                r["pts"][:] = newP; r["meta"][:] = newM
                if shape == "corner":
                    for c_ in moves:                         # (the other rooms' corners that slid to X)
                        c_[0], c_[1] = X[0], X[1]
                if len(run) == 1 and shape == "step":        # a one-piece step: every other room with that piece gets it too
                    for r_ in rooms:
                        if r_ is r:
                            continue
                        Q, N = r_["pts"], r_["meta"]
                        for t in range(len(Q)):
                            if {key(Q[t]), key(Q[(t + 1) % len(Q)])} == {key(a), key(b)}:
                                Q.insert(t + 1, [X[0], X[1]]); N.insert(t + 1, dict(N[t]))
                                break
                if os.environ.get("AE_LOG_SQUARE"):
                    print("square %s: %s .. %s (%d pieces) -> %s%s" % (shape, [round(v, 1) for v in a], [round(v, 1) for v in b], len(run), [round(v, 1) for v in X], " (kept %d)" % (len(new) - 1) if shape == "corner" and len(new) > 1 else ""), file=sys.stderr)
                return sig
        return None
    problems = lambda: {repr(p_) for p_ in app_geometry_problems([r_["pts"] for r_ in rooms])}
    done = 0
    before = problems()                                  # (the app's problems with the outlines as they stand)
    for r in rooms:
        skip = set()
        while len(r["pts"]) > 4:
            users = {}
            for ri_, r_ in enumerate(rooms):
                for p_ in r_["pts"]:
                    users.setdefault(key(p_), set()).add(ri_)
            saved = [([list(p_) for p_ in r_["pts"]], [dict(me) for me in r_["meta"]]) for r_ in rooms]
            sig = one_run(r, users, skip)
            if sig is None:
                break
            after = problems()
            if after - before:                           # the square corner crosses or doubles another room's wall: undone
                for r_, (P_, M_) in zip(rooms, saved):
                    r_["pts"][:] = P_; r_["meta"][:] = M_
                skip.add(sig)
                if os.environ.get("AE_LOG_SQUARE"):
                    print("   undone: it gave the app a geometry problem", file=sys.stderr)
                continue
            before = after
            done += 1
    return done

def drop_subpixel_sides(rooms, min_len):
    """Remove the sides shorter than min_len (working pixels) from every room outline.  Of the side's two corners, the
    one no other room shares goes (the shared one is where the rooms meet); the side's own record goes with it."""
    shared = {}
    for ri, r in enumerate(rooms):
        for p in r["pts"]:
            shared.setdefault((round(p[0], 6), round(p[1], 6)), set()).add(ri)
    n_ = 0
    for ri, r in enumerate(rooms):
        changed = True
        while changed and len(r["pts"]) > 3:
            changed = False
            P = r["pts"]; k = len(P)
            for i in range(k):
                a, b = P[i], P[(i + 1) % k]
                if math.hypot(b[0] - a[0], b[1] - a[1]) >= min_len:
                    continue
                if r["meta"][i].get("opening") is not None:
                    continue                                 # (an opening's side stays, however short)
                sa = len(shared.get((round(a[0], 6), round(a[1], 6)), ())) > 1
                sb = len(shared.get((round(b[0], 6), round(b[1], 6)), ())) > 1
                j = (i + 1) % k if (sa or not sb) else i     # the corner that goes: one only this room has
                M = r["meta"]
                keep_side = (j - 1) % k if i == j else j     # the long side the merged side continues (not the short one)
                newP, newM = [], []
                for q in range(k):
                    if q == j:
                        continue
                    newP.append(P[q])
                    newM.append(M[keep_side] if (q + 1) % k == j else M[q])   # (the side ending at the removed corner runs on past it)
                r["pts"][:] = newP; r["meta"][:] = newM
                n_ += 1; changed = True
                break
    return n_


# ---- the app's geometry rules, once more on the outlines as they leave (round 29) ---------------------------------------
# The rules of lib/floor-plan-compiler-v2.ts (tools/geomcheck.py is the gate's own copy of them), in source pixels: a room
# loop may not use one wall twice or cross itself, walls of two rooms may not cross, and a stretch of wall - once the app
# has split every side at the corners of other rooms lying on it within 0.75 px - may belong to two rooms at most.  The
# rules are checked earlier on the working outlines, but every later step (the welds, the straightening, the turn back to
# source pixels) moves corners again: this is the last word.  (Kept in this program: the worker runs it on its own.)

def _app_cross(a, b, c, d, eps=0.75):
    """two sides cross, and do not merely touch within eps of an end of either"""
    if min(_pt_seg(a, c, d), _pt_seg(b, c, d), _pt_seg(c, a, b), _pt_seg(d, a, b)) <= eps:
        return False
    o = lambda p, q, r_: (q[0] - p[0]) * (r_[1] - p[1]) - (q[1] - p[1]) * (r_[0] - p[0])
    return (o(a, b, c) > 0) != (o(a, b, d) > 0) and (o(c, d, a) > 0) != (o(c, d, b) > 0)


def _loop_area2(P):
    """twice the signed area of a loop (> 0: the room lies left of its sides)"""
    n = len(P)
    return sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))


def _stretch_use(outlines):
    """{stretch: [(room, side, which side of the stretch the room lies on: +1 / -1)]}, the stretches as the app cuts them"""
    corners = [p for P in outlines for p in P]
    use = {}
    for ri, P in enumerate(outlines):
        n = len(P); turn = 1.0 if _loop_area2(P) > 0 else -1.0
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6:
                continue
            u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L); ts = {0.0, L}
            for c in corners:
                t = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1]
                if abs((c[0] - a[0]) * -u[1] + (c[1] - a[1]) * u[0]) <= 0.75 and 0.5 < t < L - 0.5:
                    ts.add(t)
            ts = sorted(ts)
            for t0, t1 in zip(ts, ts[1:]):
                k = tuple(sorted(((round(a[0] + u[0] * t0), round(a[1] + u[1] * t0)), (round(a[0] + u[0] * t1), round(a[1] + u[1] * t1)))))
                way = u[0] if abs(u[0]) >= abs(u[1]) else u[1]     # (the side run one fixed way along its line: which side the room is on)
                use.setdefault(k, []).append((ri, i, 1 if turn * way > 0 else -1))
    return use


def app_geometry_problems(outlines):
    """What the app refuses in these room outlines (source pixels), a room's own problems first:
    ("twice", r) and ("self", r, i, j) - sides i and j of room r cross; then ("adjacent", [(r, side, +1 / -1)], stretch)
    and ("cross", r, s)."""
    own, shared, boxes = [], [], []
    q_ = lambda p: (round(p[0] / 0.75), round(p[1] / 0.75))
    for ri, P in enumerate(outlines):
        n = len(P)
        if len({tuple(sorted((q_(P[i]), q_(P[(i + 1) % n])))) for i in range(n)}) < n:
            own.append(("twice", ri))
        own += [("self", ri, i, j) for i in range(n) for j in range(i + 2, n)
                if not (i == 0 and j == n - 1) and _app_cross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])]
        boxes.append((min(p[0] for p in P) - 1, min(p[1] for p in P) - 1, max(p[0] for p in P) + 1, max(p[1] for p in P) + 1))
    for k, v in sorted(_stretch_use(outlines).items()):
        if len({e[0] for e in v}) > 2:
            shared.append(("adjacent", v, k))
    for ri, P in enumerate(outlines):
        for rj in range(ri + 1, len(outlines)):
            A, B = boxes[ri], boxes[rj]
            if A[0] > B[2] or B[0] > A[2] or A[1] > B[3] or B[1] > A[3]:
                continue
            Q = outlines[rj]
            if any(_app_cross(P[i], P[(i + 1) % len(P)], Q[j], Q[(j + 1) % len(Q)]) for i in range(len(P)) for j in range(len(Q))):
                shared.append(("cross", ri, rj))
    return own + shared


def _cut_twist(rooms, r, i, j, share=0.1):
    """A loop whose sides i and j cross is two loops joined at the crossing: the small one (a spike the outline took into
    the wall, at most `share` of the room, with no opening on it that another room carries too) is cut off.  False when it
    is not that small."""
    P, M = r["pts"], r["meta"]; n = len(P)
    carried = {id(me["opening"]) for q in rooms if q is not r for me in q["meta"] if me.get("opening") is not None}
    a, b, c, d = P[i], P[(i + 1) % n], P[j], P[(j + 1) % n]
    den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
    if abs(den) < 1e-12:
        return False
    t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
    X = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    inner, outer = [X] + P[i + 1:j + 1], P[:i + 1] + [X] + P[j + 1:]
    if abs(_loop_area2(inner)) <= abs(_loop_area2(outer)):
        keep, keep_meta, small, lost = outer, M[:i + 1] + M[j:], inner, M[i:j + 1]
    else:
        keep, keep_meta, small, lost = inner, M[i:j + 1], outer, M[:i + 1] + M[j:]
    if len(keep) < 3 or abs(_loop_area2(small)) > share * abs(_loop_area2(keep)) or any(me.get("opening") is not None and id(me["opening"]) in carried for me in lost):
        return False
    P[:] = keep; M[:] = keep_meta
    return True


def _inside(p, P, eps=0.75):
    """p lies inside loop P, further than eps from its sides"""
    n = len(P)
    if min(_pt_seg(p, P[i], P[(i + 1) % n]) for i in range(n)) <= eps:
        return False
    hit = False
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            hit = not hit
    return hit


def _drop_straight_corner(r, j):
    """corner j of room r standing on the straight line of its two sides (both plain wall) goes"""
    P, M = r["pts"], r["meta"]; n = len(P)
    if n <= 3 or M[j - 1].get("opening") is not None or M[j].get("opening") is not None:
        return
    a, p, b = P[j - 1], P[j], P[(j + 1) % n]
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    if L < 1e-6 or abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L > 0.5:
        return
    if not 0 < (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]) < L * L:
        return
    longer = M[j - 1] if math.hypot(p[0] - a[0], p[1] - a[1]) >= math.hypot(b[0] - p[0], b[1] - p[1]) else M[j]
    del P[j]; del M[j]
    M[j - 1] = longer


def _weld_overlap(rooms, pr, S, T, before):
    """Two rooms on one side of a stretch of wall overlap there: one room's corner went a little past the other's (a
    chamfer the reading left, c24's half-blurred scan).  Of the two rooms, the corner past the other's goes onto it - when
    that is no more than half a wall's thickness and leaves neither room reaching into the other.  True when it did."""
    v = pr[1]
    for side in (1, -1):
        both = [(ri, si) for ri, si, s_ in v if s_ == side]
        if len({ri for ri, _ in both}) == 2:
            break
    else:
        return False
    (xr, xs), (yr, ys) = both[0], next(e for e in both if e[0] != both[0][0])
    X, Y = rooms[xr], rooms[yr]
    ax, bx = X["pts"][xs], X["pts"][(xs + 1) % len(X["pts"])]
    L = math.hypot(bx[0] - ax[0], bx[1] - ax[1])
    if L < 1e-6:
        return False
    u = ((bx[0] - ax[0]) / L, (bx[1] - ax[1]) / L)
    t = lambda p: (p[0] - ax[0]) * u[0] + (p[1] - ax[1]) * u[1]
    ends = lambda R, s: sorted(((t(R["pts"][s]), s), (t(R["pts"][(s + 1) % len(R["pts"])]), (s + 1) % len(R["pts"]))))
    ex, ey = ends(X, xs), ends(Y, ys)
    if ex[0][0] > ey[0][0]:
        (X, ex), (Y, ey) = (Y, ey), (X, ex)
    if not ex[0][0] < ey[0][0] < ex[1][0] < ey[1][0] or ex[1][0] - ey[0][0] > 0.5 * T:
        return False                                         # (not two rooms overlapping by a little at their meeting)
    best = None
    for R, vi, Q, wi in ((X, ex[1][1], Y, ey[0][1]), (Y, ey[0][1], X, ex[1][1])):
        P0, M0, Q0 = list(R["pts"]), list(R["meta"]), Q["pts"][wi]
        R["pts"][vi] = [Q0[0], Q0[1]]
        for j in sorted(((vi - 1) % len(R["pts"]), (vi + 1) % len(R["pts"])), reverse=True):
            _drop_straight_corner(R, j)
        src = [[S(*p) for p in r_["pts"]] for r_ in rooms]
        Rs, Qs = src[next(n_ for n_, r_ in enumerate(rooms) if r_ is R)], src[next(n_ for n_, r_ in enumerate(rooms) if r_ is Q)]
        left = len(app_geometry_problems(src))
        if left < before and not any(_inside(p, Qs) for p in Rs) and not any(_inside(p, Rs) for p in Qs):
            moved = abs(abs(_loop_area2(R["pts"])) - abs(_loop_area2(P0)))
            if best is None or (left, moved) < best[:2]:
                best = (left, moved, R, list(R["pts"]), list(R["meta"]))
        R["pts"][:] = P0; R["meta"][:] = M0
    if best is None:
        return False
    best[2]["pts"][:] = best[3]; best[2]["meta"][:] = best[4]
    return True


def _to_withhold(rooms, pr):
    """the room a problem costs: a room's own problem costs that room; of two rooms on one side of an overlapping stretch,
    or two crossing rooms, the one without a name goes before a named one, an outdoor space before an indoor room, then
    the smaller"""
    if pr[0] in ("twice", "self"):
        return pr[1]
    if pr[0] == "app":
        if pr[2] != "adjacency":
            return pr[1]
        cands = sorted(set(pr[4]["rooms"]))
        named = lambda r_: any(l["known"] for l in r_["labels"]) or r_.get("duct") is not None
        return min(cands, key=lambda ri: (named(rooms[ri]), not rooms[ri].get("outdoor"), abs(_loop_area2(rooms[ri]["pts"])), ri))
    if pr[0] == "cross":
        cands = [pr[1], pr[2]]
    else:
        sides = [s_ for _ri, _si, s_ in pr[1]]
        side = 1 if sides.count(1) >= 2 and len({ri for ri, _si, s_ in pr[1] if s_ == 1}) >= 2 else -1
        cands = sorted({ri for ri, _si, s_ in pr[1] if s_ == side}) or sorted({e[0] for e in pr[1]})
    named = lambda r_: any(l["known"] for l in r_["labels"]) or r_.get("duct") is not None
    return min(cands, key=lambda ri: (named(rooms[ri]), not rooms[ri].get("outdoor"), abs(_loop_area2(rooms[ri]["pts"])), ri))


ASSUMED_MM = (5.0, 10.0, 20.0)     # the scales a plan exported without one is replayed at (the reviewer sets the real one later)


def _jsround(v):
    return math.floor(v + 0.5)


def _orient_mm(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_seg_mm(p, a, b):
    return _orient_mm(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def _touch_mm(a, b, c, d):
    """lib/floor-plan-geometry-validation.ts floorPlanLineSegmentsIntersect: crossing, or one end on the other segment"""
    fa, fb, sa, sb = _orient_mm(a, b, c), _orient_mm(a, b, d), _orient_mm(c, d, a), _orient_mm(c, d, b)
    if (fa > 0) != (fb > 0) and (sa > 0) != (sb > 0):
        return True
    return (fa == 0 and _on_seg_mm(c, a, b)) or (fb == 0 and _on_seg_mm(d, a, b)) or (sa == 0 and _on_seg_mm(a, c, d)) or (sb == 0 and _on_seg_mm(b, c, d))


def app_replay(outlines, mm, work=None):
    """The walls and room loops the app builds from these outlines (source px) at mm per px - pdf-raster-adapter.ts
    registerSupportedPageTopology as it stands: every side split at every room's corner within 0.75 px of it (the corner
    itself, not its foot), vertices in whole millimetres, a new point merged into the first vertex within max(2 mm, half a
    pixel).  Returns (vertex positions in mm, walls {(start, end): index}, rooms of each wall, and per room its loop as
    pieces (wall, start vertex, end vertex, own side, corner the piece starts at - in `work` coordinates when given))."""
    tol = max(2.0, mm * 0.5)
    vertices, by_key = [], {}
    def vertex(x, y):
        xm, zm = _jsround(x * mm), _jsround(y * mm)
        k_ = (xm, zm)
        if k_ in by_key:
            return by_key[k_]
        for i, (vx, vz) in enumerate(vertices):
            if math.hypot(vx - xm, vz - zm) <= tol:
                by_key[k_] = i
                return i
        vertices.append((xm, zm)); by_key[k_] = len(vertices) - 1
        return by_key[k_]
    corners = [(p, (work[ri][ci] if work else p)) for ri, P in enumerate(outlines) for ci, p in enumerate(P)]
    walls, rooms_of, loops = {}, {}, []
    for ri, P in enumerate(outlines):
        n = len(P); loop = []
        for side in range(n):
            a, b = P[side], P[(side + 1) % n]
            wa, wb = (work[ri][side], work[ri][(side + 1) % n]) if work else (a, b)
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            cands = [(a, 0.0, wa), (b, 1.0, wb)]
            if L > 0:
                for c, wc in corners:
                    t = ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / (L * L)
                    tc = min(1.0, max(0.0, t))
                    if t <= 0.001 or t >= 0.999 or math.hypot(c[0] - (a[0] + tc * (b[0] - a[0])), c[1] - (a[1] + tc * (b[1] - a[1]))) > 0.75:
                        continue
                    cands.append((c, t, wc))
            cands.sort(key=lambda q_: q_[1])
            uniq = [c_ for i, c_ in enumerate(cands) if i == 0 or abs(c_[1] - cands[i - 1][1]) * max(1.0, L) > 0.5]
            for i in range(len(uniq) - 1):
                p_, q_ = uniq[i][0], uniq[i + 1][0]
                if math.hypot(p_[0] - q_[0], p_[1] - q_[1]) < 0.5:
                    continue
                s_, e_ = vertex(*p_), vertex(*q_)
                w = walls.get((e_, s_), walls.get((s_, e_)))
                if w is None:
                    w = len(walls); walls[(s_, e_)] = w
                rs = rooms_of.setdefault(w, [])
                if ri not in rs:
                    rs.append(ri)
                loop.append((w, s_, e_, side, uniq[i][2]))
        loops.append(loop)
    return vertices, walls, rooms_of, loops


def app_replay_problems(outlines, mms):
    """What lib/floor-plan-compiler-v2.ts refuses in the walls the app builds from these outlines, at each of the scales
    mms: ("app", room, code, mm, detail) - code zero (a wall from a vertex to itself), twice (a wall twice in one loop),
    open, area (a loop of no area), self (a loop crossing or touching itself), adjacency (a wall of three rooms)."""
    for mm in mms:
        vertices, walls, rooms_of, loops = app_replay(outlines, mm)
        out = []
        for (s_, e_), w in walls.items():
            if s_ == e_:
                out.append(("app", rooms_of[w][0], "zero", mm, {}))
        for ri, loop in enumerate(loops):
            ws = [pc[0] for pc in loop]
            if len(loop) < 2 or any(loop[k][2] != loop[(k + 1) % len(loop)][1] for k in range(len(loop))):
                out.append(("app", ri, "open", mm, {})); continue
            if len(set(ws)) < len(ws):
                out.append(("app", ri, "twice", mm, {})); continue
            pts = []
            for pc in loop:
                if not pts or pts[-1] != vertices[pc[1]]:
                    pts.append(vertices[pc[1]])
            n = len(pts)
            if abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) < 1.0:
                out.append(("app", ri, "area", mm, {})); continue
            if n >= 3 and any(_touch_mm(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])
                              for i in range(n) for j in range(i + 1, n) if (i + 1) % n != j and (j + 1) % n != i):
                out.append(("app", ri, "self", mm, {}))
        for w, rs in rooms_of.items():
            if len(rs) > 2:
                out.append(("app", rs[0], "adjacency", mm, {"rooms": list(rs)}))
        if out:
            return out
    return []


def _cut_pinch(rooms, ri, S, mm, share=0.1):
    """A loop the app builds through one vertex twice (a spike back along its own wall, a lasso at a spike's tip: s080's
    room 7, p02 low-res's bedroom) is two loops joined there: the smaller - at most `share` of the room, with no opening on
    it that another room carries too - is cut off, at that vertex.  The room's outline is rebuilt from the pieces the app
    makes of it (other rooms' corners on its sides included), and points left on a straight line between two pieces of the
    same kind are dropped again.  False when no such cut exists."""
    r = rooms[ri]; P, M = r["pts"], r["meta"]
    src = [[S(*p) for p in r_["pts"]] for r_ in rooms]
    vertices, _walls, _rooms_of, loops = app_replay(src, mm, [r_["pts"] for r_ in rooms])
    loop = loops[ri]; N = len(loop)
    if N < 4:
        return False
    carried = {id(me["opening"]) for q in rooms if q is not r for me in q["meta"] if me.get("opening") is not None}
    seq = [pc[1] for pc in loop]
    area_mm = lambda ks: abs(sum(vertices[seq[ks[i]]][0] * vertices[seq[ks[(i + 1) % len(ks)]]][1] -
                                 vertices[seq[ks[(i + 1) % len(ks)]]][0] * vertices[seq[ks[i]]][1] for i in range(len(ks))))
    best = None
    for k1 in range(N):
        for k2 in range(k1 + 1, N):
            if seq[k1] != seq[k2]:
                continue
            inner, outer = list(range(k1, k2)), list(range(k2, N)) + list(range(0, k1))
            ai, ao = area_mm(inner), area_mm(outer)
            small, keep = (inner, outer) if ai <= ao else (outer, inner)
            if len(keep) < 3 or min(ai, ao) > share * max(ai, ao):
                continue
            if any(M[loop[k][3]].get("opening") is not None and id(M[loop[k][3]]["opening"]) in carried for k in small):
                continue
            if best is None or min(ai, ao) < best[0]:
                best = (min(ai, ao), keep)
    if best is None:
        return False
    keep = best[1]
    newP = [list(loop[k][4]) for k in keep]
    newM = [M[loop[k][3]] for k in keep]
    same = lambda x, y: x is y or (x.get("opening") is None and y.get("opening") is None and x.get("kind") == y.get("kind") and abs(x.get("t", 0) - y.get("t", 0)) < 1e-9)
    j = 0
    while j < len(newP) and len(newP) > 3:               # (a point on a straight line between two pieces of one kind goes)
        a, p_, b = newP[j - 1], newP[j], newP[(j + 1) % len(newP)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L > 1e-6 and same(newM[j - 1], newM[j]) and abs((p_[0] - a[0]) * (b[1] - a[1]) - (p_[1] - a[1]) * (b[0] - a[0])) / L <= 0.1 \
                and 0 < (p_[0] - a[0]) * (b[0] - a[0]) + (p_[1] - a[1]) * (b[1] - a[1]) < L * L:
            del newP[j]; del newM[j]
            continue
        j += 1
    P[:] = newP; M[:] = newM
    return True


def last_legal_check(rooms, S, T, min_side, mms=None):
    """The rooms as they leave, made what the app accepts: a spike cut off a loop, two rooms' overlap at their meeting
    welded shut (and a side a mend left shorter than min_side dropped, as before) - and what cannot be mended withheld.
    With mms (source mm per px: the scale and a per cent either side, or the assumed scales of a plan without one), the
    walls the app builds are replayed too (app_replay_problems), and a loop that comes back to a corner it has passed is
    cut there (_cut_pinch).  Returns (rooms kept, rooms withheld, outlines mended, short sides dropped)."""
    gone, mended, short = [], 0, 0
    for _ in range(4 * len(rooms) + 8):
        src = [[S(*p) for p in r_["pts"]] for r_ in rooms]
        found = app_geometry_problems(src)
        if not found and mms:
            found = app_replay_problems(src, mms)
        if not found:
            break
        pr = found[0]
        if (pr[0] == "self" and _cut_twist(rooms, rooms[pr[1]], pr[2], pr[3])) or (pr[0] == "adjacent" and _weld_overlap(rooms, pr, S, T, len(found))) \
                or (pr[0] == "app" and pr[2] != "adjacency" and _cut_pinch(rooms, pr[1], S, pr[3])):
            mended += 1
            short += drop_subpixel_sides(rooms, min_side)
            continue
        w_ = _to_withhold(rooms, pr)
        gone.append(rooms[w_]); rooms = rooms[:w_] + rooms[w_ + 1:]
    return rooms, gone, mended, short


class NoThinWalls(Exception):
    pass


R39_GEOMETRY = ("R39_PICTURE_BAND", "R39_STROKE_WINDOWS", "R39_SPACE_ROOMS", "R39_STROKE_ROOMS", "R39_SLIVER_OUT", "R39_JUNCTION_ROOMS",
                "R39_LONG_CUTS", "R39_THIN_STROKES", "R39_OCR_FIX", "R40_CLOSED_NAMES", "R40_SLITS", "R40_MIXED_ALL",
                "R40_CELL_PIECES", "R40_LEAF_STUBS")   # (round 38's reading is round 38's exactly, names as read)


def _named_alone(o):
    """the room names the export places one to a room, counted (each read past OCR slips, so that round 38's 'BEDRUIM 3'
    and round 39's 'BEDROOM 3' are one name)"""
    from collections import Counter
    known = lambda t: room_type(t) != "other" or any(k_ in t.upper() for k_ in ROOM_WORDS)
    fix = lambda t: "".join((_ocr_room_word(w_.upper()) or w_) if w_ and re.fullmatch(r"\w+", w_) else w_ for w_ in re.split(r"(\W+)", t))
    alone = Counter()
    for r_ in o["rooms"]:
        names = [fix(t) for t in r_.get("sourceLabels", []) if known(fix(t))]
        if len(names) == 1:
            alone[names[0].upper()] += 1
    return alone


def _take(m, r_, names):
    """round 40 (R40_SLITS): a room the strokes' pass takes is laid on its outline with notches and slits closed over -
    unless the reading round 40 builds on already has a room with exactly its names (that room keeps its own outline:
    s001's kitchen, whose closed-over outline left a slot at a wall's end)"""
    if r_.get("shut") is None:
        return r_
    base_ = m.get("_base_rooms")
    if base_ is not None and names and frozenset(n_.strip().upper() for n_ in names) in base_:
        return r_                                            # (the same names in one room under it: that room's outline)
    r_["face"], r_["comp"] = r_["shut"]
    return r_


def _near_gap(m, x, y, d=None):
    """round 40: (x, y) in working px lies within d (2 wall widths) of a gap the gap check found in an earlier reading
    of this plan (m["_gap_pts"], working px) - the place where round 39 / 40's rules are left out"""
    pts = m.get("_gap_pts")
    if not pts:
        return False
    d = 2.0 * float(m["wall_thickness_px"]) if d is None else d
    return any(abs(x - px) <= d and abs(y - py) <= d for px, py in pts)


def _box_near_gap(m, x0, y0, x1, y1, d=None):
    """round 40: a box in working px (a thin-wall piece, a leaf stub) reaches within d of such a gap"""
    pts = m.get("_gap_pts")
    if not pts:
        return False
    d = 2.0 * float(m["wall_thickness_px"]) if d is None else d
    return any(x0 - d <= px <= x1 + d and y0 - d <= py <= y1 + d for px, py in pts)


def _comp_near_gap(m, comp, d=None):
    """a room's floor (a mask in working px) reaches within d of such a gap"""
    pts = m.get("_gap_pts")
    if not pts or comp is None:
        return False
    d = int(round(2.0 * float(m["wall_thickness_px"]) if d is None else d))
    H, W = comp.shape
    for px, py in pts:
        x0, y0, x1, y1 = max(0, int(px) - d), max(0, int(py) - d), min(W, int(px) + d + 1), min(H, int(py) + d + 1)
        if x1 > x0 and y1 > y0 and comp[y0:y1, x0:x1].any():
            return True
    return False


def _gap_work_points(m, gaps):
    """the gaps' source-px points ("slot x,y") as working px (the exporter's ToSource turned back)"""
    ts = ToSource(m); W, H = m["size"]
    grid = [(x, y) for x in np.linspace(0, W, 5) for y in np.linspace(0, H, 5)]
    Hm, _ = cv2.findHomography(np.array([ts(x, y) for x, y in grid], np.float64), np.array(grid, np.float64), 0)
    out = []
    for g_ in gaps:
        try:
            x, y = [float(v) for v in g_.split()[1].split(",")]
        except (ValueError, IndexError):
            continue
        v = Hm @ np.array([x, y, 1.0]); out.append((float(v[0] / v[2]), float(v[1] / v[2])))
    return out


R40_RULES = ("R40_CLOSED_NAMES", "R40_SLITS", "R40_MIXED_ALL", "R40_CELL_PIECES", "R40_LEAF_STUBS")


def _reading(m, gray, off):
    """_build_best with the switches in `off` turned off (round 38's reading: SQUARE_CUTS back to 2 widths too)"""
    saved = {n_: globals()[n_] for n_ in off}
    sq_ = globals()["SQUARE_CUTS"]
    try:
        for n_ in off:
            globals()[n_] = False
        if "R39_LONG_CUTS" in off:
            globals()["SQUARE_CUTS"] = 2.0
        return _build_best(m, None if gray is None else gray.copy())
    finally:
        globals().update(saved); globals()["SQUARE_CUTS"] = sq_


def _doors(o):
    return sum(1 for w in o["wallEdges"] if (w.get("opening") or {}).get("kind") in ("door", "open_passage"))


def _gain(o, ref):
    """round 40: what reading o gives over ref - more names placed one to a room, fewer names outside every room, or
    fewer names sharing a room. Round 40's reading is kept only with a gain: one that only moves walls (p02's low-res
    copy: the same rooms, a wall fewer, two new steps) stays round 39's."""
    known = lambda t: room_type(t) != "other" or any(k_ in t.upper() for k_ in ROOM_WORDS)
    shared = lambda e: sum(max(0, sum(1 for t in r_.get("sourceLabels", []) if known(t)) - 1) for r_ in e["rooms"])
    return (sum(_named_alone(o).values()) > sum(_named_alone(ref).values())
            or len(o["diagnostics"].get("labelsOutsideRooms", [])) < len(ref["diagnostics"].get("labelsOutsideRooms", []))
            or shared(o) < shared(ref))


def _suspect_slots(o, ref):
    """round 40: the replay finds a slot in ref and in o at the same place, so it is no new slot - but where o's walls
    within two wall widths of it are not ref's, the replay cannot tell whether the app's slot is the same (s001's kitchen:
    the replay sees a slot in round 39's walls that the app does not, and the thin-wall pieces' walls there make the app's
    slot real) - such slots, ["slot x,y"]"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import app_flaws
    def seg_d(px, py, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / L))
        return math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)
    def near(ev, x, y, d):
        return sorted((tuple(round(v, 1) for v in w["sourcePx"][0]), tuple(round(v, 1) for v in w["sourcePx"][1]), round(float(w["thicknessPx"]), 1))
                      for w in ev["wallEdges"] if w.get("thicknessPx") and len(w.get("sourcePx") or []) >= 2 and seg_d(x, y, w["sourcePx"][0], w["sourcePx"][1]) <= d)
    try:
        fo, fr = app_flaws.flaws(o), app_flaws.flaws(ref); T = app_flaws.wall_T(o)
    except Exception:
        return []
    out = []
    for f in fo["slots"]:
        if any(abs(f[0] - g[0]) < 6 and abs(f[1] - g[1]) < 6 for g in fr["slots"]):
            d = 2.0 * T + max(f[2], f[3]) / 2.0
            if near(o, f[0], f[1], d) != near(ref, f[0], f[1], d):
                out.append("slot %.0f,%.0f" % f[:2])
    return out


def _against(o, ref, ref2=None, suspect=False):
    """why reading o may not replace reading ref: a name ref places alone that o does not; no more names placed and a door
    lost (s002's kitchen); or a slot / seam o's walls have and ref's do not (R39_NO_NEW_GAPS) - [] when it may"""
    lost = _named_alone(ref) - _named_alone(o)
    if lost:
        return sorted(lost), "names"
    if sum(_named_alone(o).values()) <= sum(_named_alone(ref).values()) and _doors(o) < _doors(ref):
        return ["doors %d -> %d" % (_doors(ref), _doors(o))], "doors"
    gaps = _new_gaps(o, ref) if R39_NO_NEW_GAPS else []
    if gaps and ref2 is not None:                            # (a gap round 38's reading has as well is no new gap)
        old2 = set(_new_gaps(o, ref2))
        gaps = [g_ for g_ in gaps if g_ in old2]
    if suspect and R39_NO_NEW_GAPS and o["diagnostics"].get("thinWallsReadAsWalls"):
        gaps = gaps + [g_ for g_ in _suspect_slots(o, ref) if g_ not in gaps]
    return gaps, "gaps" if gaps else None


def _try_over(m0, gray, off, ref, ref2=None, suspect=False):
    """the reading with `off` turned off, kept over ref when _against allows it - or, where only gaps stand in its way,
    once or twice more with its new rooms and windows at those gaps left out (R40_GAP_LOCAL). Returns (out, dbg, m,
    left_out) or (None, why, None, None)"""
    import copy
    m_ = copy.deepcopy(m0)
    out, dbg = _reading(m_, gray, off)
    why, kind = _against(out, ref, ref2, suspect)
    if not why:
        return out, dbg, m_, None
    if kind != "gaps" or not R40_GAP_LOCAL:
        return None, why, None, None
    gaps, pts_ = why, []
    for _ in range(2):
        pts_ = pts_ + _gap_work_points(m0, gaps)
        m2 = copy.deepcopy(m0); m2["_gap_pts"] = pts_
        out2, dbg2 = _reading(m2, gray, off)
        why2, kind2 = _against(out2, ref, ref2, suspect)
        if not why2:
            return out2, dbg2, m2, why
        if kind2 != "gaps":
            break
        gaps = why2
    return None, why, None, None


def build_best(m, gray=None):
    """Three readings, each kept only over the one before it (R39_GUARD): round 38's (R39_GEOMETRY and R40_RULES off),
    round 39's (R40_RULES off) and round 40's (all on). A reading is kept only when it places every name the one before
    placed alone, keeps its doors where it places no more names, and adds no slot or seam to its walls (_against) - so
    round 39 never takes away a named room (s066's bedrooms), and round 40 never undoes round 39 (round 40, J 17 Oct)."""
    import copy
    r39_on = any(globals()[n_] for n_ in R39_GEOMETRY if n_ not in R40_RULES)
    r40_on = any(globals()[n_] for n_ in R40_RULES)
    if not R39_GUARD or not (r39_on or r40_on):
        return _build_best(m, gray)
    m0 = copy.deepcopy(m)
    m38 = copy.deepcopy(m0)
    out38, dbg38 = _reading(m38, gray, R39_GEOMETRY)
    base, bdbg, bm, notes = out38, dbg38, m38, {}
    if r39_on:
        o, d, mm_, left = _try_over(m0, gray, R40_RULES, out38)
        if o is not None:
            base, bdbg, bm = o, d, mm_
            if left:
                notes["round40LeftOutAtGaps"] = left
        else:
            notes["round39Withheld"] = d
    dg_ = base["diagnostics"]
    could_ = dg_.get("labelsOutsideRooms") or dg_.get("roomsClosedByStrokes") or dg_.get("namelessSpacesAsRooms") or dg_.get("outdoorRoomsClosedByStrokes")
    # (the thin-wall pieces act where names share a room on a filled plan; the leaf stubs where a swing found no gap
    #  and has the shape leaf_stubs looks for)
    could_old = could_
    could_ = could_ or (R40_CELL_PIECES and MIXED and bm.get("_filled_style") and any(len(r_.get("sourceLabels", [])) > 1 for r_ in base["rooms"]))
    if not could_ and R40_LEAF_STUBS and bdbg.get("unhosted") and bm.get("_work_gray") is not None:
        try:
            could_ = leaf_stubs(dict(bm), bdbg["k"], bdbg["unhosted"]) is not None
        except Exception:
            could_ = False
    if r40_on and could_:                                    # (round 40's rules act on the strokes' pass only)
        m0["_base_rooms"] = {frozenset(t_.strip().upper() for t_ in r_.get("sourceLabels", [])) for r_ in base["rooms"] if r_.get("sourceLabels")}
        o, d, mm_, left = _try_over(m0, gray, (), base, suspect=R40_CELL_PIECES)
        no_gain = False
        if o is not None and R40_NEEDS_GAIN and not _gain(o, base):
            no_gain = o["wallEdges"] != base["wallEdges"] or o["rooms"] != base["rooms"]
            o, d = None, ["no gain"]
        if o is None and not no_gain and d != ["no gain"] and could_old and (R40_CELL_PIECES or R40_LEAF_STUBS):
            # (round 40's reading with the thin-wall pieces and leaf stubs withheld: once more without them, so that
            #  they never cost what round 40's other rules give - s004's service yard)
            o2, d2, mm2_, left2 = _try_over(m0, gray, ("R40_CELL_PIECES", "R40_LEAF_STUBS"), base)
            if o2 is not None and R40_NEEDS_GAIN and not _gain(o2, base):
                o2 = None
            if o2 is not None:
                notes["round40WithheldWithThinWallPieces"] = d
                o, d, mm_, left = o2, d2, mm2_, left2
        if o is not None:
            base, bdbg, bm = o, d, mm_
            if left:
                notes["round40LeftOutAtGaps"] = notes.get("round40LeftOutAtGaps", []) + left
            notes.pop("round39Withheld", None)
        elif d != ["no gain"] or no_gain:                    # (a reading the same as round 39's is no news)
            notes["round40Withheld"] = d
    m.clear(); m.update(bm)
    base["diagnostics"].update(notes)
    return base, bdbg


R39_SEAM_PX = 2.0


def _new_gaps(out, out38):
    """round 39b (J, 13 Oct: "a floor plan should never have a small gap like that"): the slots, and the seams of 2 px or
    longer, that round 39's walls have and round 38's do not, as the app check finds them (replayed: app_flaws.py) -
    ["slot x,y", "seam x,y"]; round 39's reading is then withheld.  (A seam of a pixel the replay finds where the app
    check does not, so only the longer ones count.)"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import app_flaws
    try:
        new = app_flaws.added(app_flaws.flaws(out), app_flaws.flaws(out38))
    except Exception as e:                                   # (the replay failing withholds nothing: round 39 as before)
        out["semantics"]["notes"] = (out["semantics"]["notes"] + ["Gap check unavailable: %s" % e])[:30]
        return []
    return ["slot %.0f,%.0f" % f[:2] for f in new["slots"]] + ["seam %.0f,%.0f" % f[:2] for f in new["seams"] if f[2] >= R39_SEAM_PX]


def _build_best(m, gray=None):
    """build(), and on a filled plan that leaves named rooms out or shares one room between two names, once more with the
    thin walls drawn as two lines read as walls too (round 28, AE_MIXED; see mixed_partition_cells).  The second reading
    is kept only when it gives more names a room of their own and takes that from none: a name the first reading placed
    alone stays alone, no name falls out of the rooms, and no more names share a room.  A plan the plain reading already
    closes is never touched."""
    import copy
    from collections import Counter
    m0 = copy.deepcopy(m)
    out, dbg = build(m, gray)
    if not MIXED or not (m.get("_filled_style") or R40_MIXED_ALL):
        return out, dbg
    def known(t):
        return room_type(t) != "other" or any(k_ in t.upper() for k_ in ROOM_WORDS)
    def placing(o):
        alone = Counter(); shared = 0
        for r_ in o["rooms"]:
            names = [t for t in r_.get("sourceLabels", []) if known(t)]
            if len(names) == 1:
                alone[names[0]] += 1
            shared += max(0, len(names) - 1)
        return alone, Counter(o["diagnostics"]["labelsOutsideRooms"]), shared
    alone1, out1, shared1 = placing(out)
    if not out1 and not shared1:
        return out, dbg
    m0["_mixed_pass"] = True
    m0["_mixed_doors"] = [(g["o"], g["c"], g["a"], g["b"]) for g in dbg["openings"] if g["kind"] == "door"]
    try:
        out2, dbg2 = build(m0, None if gray is None else gray.copy())
    except NoThinWalls:
        return out, dbg
    alone2, out2_, shared2 = placing(out2)
    if alone1 - alone2 or out2_ - out1 or shared2 > shared1 or sum(alone2.values()) <= sum(alone1.values()):
        return out, dbg
    m.clear(); m.update(m0)
    return out2, dbg2


def check_picture(m, out, dbg, path, source=None):
    W, H = m["size"]
    if source is not None and m.get("skew_deg", 0) == 0 and not m.get("page_homography"):
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


# The clean drawing (0.28.1; J, 15 Oct: "trace and reproduce a clean 2d vector floor plan"): stage 1's own drawing of the
# page - its <plan>.svg, every wall it read whether or not it closes a room, doors, windows, fixtures and lines - as the
# evidence's `drawing`, in source pixels, for the app's clean traced drawing (app_drawing.py).  0 = no drawing; the rest
# of the evidence is the same either way.
DRAWING = os.environ.get("AE_DRAWING", "1") != "0"


def add_drawing(out, m, svg_path):
    """the evidence's `drawing` from stage 1's SVG beside the model (app_drawing.py); none without the SVG"""
    if not DRAWING or not svg_path or not os.path.exists(svg_path):
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import app_drawing
    d, why = app_drawing.drawing(m, open(svg_path).read(), ToSource(m))
    if d is None:
        out["semantics"]["notes"] = (out["semantics"]["notes"] + ["No clean drawing: " + why])[:30]
    else:
        out["drawing"] = d


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opt = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
    m = json.load(open(args[0]))
    work = opt.get("--work") or (args[0][:-5] + ".work.png" if args[0].endswith(".json") else None)
    gray = cv2.imread(work, 0) if work and os.path.exists(work) else None
    out, dbg = build_best(m, gray)
    add_drawing(out, m, opt.get("--svg") or (args[0][:-5] + ".svg" if args[0].endswith(".json") else None))
    json.dump(out, open(args[1], "w"), indent=1)
    if opt.get("--check"):
        check_picture(m, out, dbg, opt["--check"], opt.get("--source"))
    d = out["diagnostics"]
    print("rooms %d | openings %s | swings without a gap %d | labels outside rooms %s | scale %s (%s)" % (
        d["rooms"], d["openings"], d["doorSwingsWithoutGap"], d["labelsOutsideRooms"], out["scale"]["millimetresPerPixel"], out["scale"]["basis"]))
    for r_ in out["rooms"]:
        print("   %-28s %-12s %s m2" % (r_["label"] or "?", r_["roomType"], r_["areaM2"]))
