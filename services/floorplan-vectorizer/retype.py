"""(r12) lettering the reader is sure of set in type: a word of the plan's lettering that tesseract reads with
confidence, and that the word set in a clean typeface (Liberation Sans, regular or bold) at the same size, place and
angle matches closely, is drawn as that type - sharp at any zoom - in place of its letters' traced outlines. A word it
is unsure of, or whose type does not match the picture (a misreading: 8ED for BED), keeps its traced letters.

J, 29 Oct: "Retype what's read"."""
import json, math, os, re
import cv2, numpy as np

RETYPE = os.environ.get("FT_RETYPE", "0") == "1"      # (off: blind A/B 29 Oct, r11 64 / r12 5 - mixed fonts, greys, misread figures)
CONF = float(os.environ.get("FT_RETYPE_CONF", "75"))      # tesseract's confidence in the word, at least
MATCH = float(os.environ.get("FT_RETYPE_MATCH", "0.7"))   # the type and the picture's letters alike, at least
MATCH_NUM = float(os.environ.get("FT_RETYPE_MATCH_NUM", "0.78"))   # ... for a figure (a wrong figure misleads)
CONF_NUM = float(os.environ.get("FT_RETYPE_CONF_NUM", "88"))   # ... and tesseract's confidence in a figure, at least
LEAST = float(os.environ.get("FT_RETYPE_LEAST", "0.5"))   # ... and each character and its letter alike, at least
SHIFT = os.environ.get("FT_RETYPE_SHIFT", "1") == "1"    # each character sat on its own letter
LETTER_STROKE = float(os.environ.get("FT_LETTER_STROKE", "0.07"))   # a letter's stroke at least this share of its size
SHIFT_LIM = float(os.environ.get("FT_RETYPE_SHIFT_LIM", "0.6"))   # ... moved at most this share of the height
WEIGHT = os.environ.get("FT_RETYPE_WEIGHT", "1") == "1"  # the type's weight brought to the lettering's own
DEBUG = os.environ.get("FT_RETYPE_DEBUG") == "1"
_GLYPHS = None


def glyphs():
    global _GLYPHS
    if _GLYPHS is None:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faithful_glyphs.json")) as f:
            _GLYPHS = json.load(f)
    return _GLYPHS


# ------------------------------------------------------------------------------------------------ type
def _flatten(contour, steps=6):
    """a closed TrueType contour (quadratic, [x, y, on]) as a polygon"""
    pts = [(float(x), float(y), bool(on)) for x, y, on in contour]
    n = len(pts)
    if n < 2:
        return []
    # the implied on-curve points between two off-curve ones
    full = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        full.append(a)
        if not a[2] and not b[2]:
            full.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, True))
    k0 = next((i for i, p in enumerate(full) if p[2]), None)
    if k0 is None:
        return []
    full = full[k0:] + full[:k0]
    out = []
    i = 0
    m = len(full)
    while i < m:
        p = full[i]
        q = full[(i + 1) % m]
        if q[2]:
            out.append((p[0], p[1])); i += 1
        else:
            r = full[(i + 2) % m]
            for t in np.linspace(0, 1, steps, endpoint=False):
                out.append(((1 - t) ** 2 * p[0] + 2 * (1 - t) * t * q[0] + t * t * r[0],
                            (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * q[1] + t * t * r[1]))
            i += 2
    return out


_FLAT = {}


def glyph_polys(ch, weight):
    """a character's outlines as polygons (font units), or None"""
    key = (ch, weight)
    if key not in _FLAT:
        gl = glyphs()["fonts"][weight]["glyphs"].get(ch)
        _FLAT[key] = None if gl is None else ([np.array(P) for P in (_flatten(c) for c in gl["c"]) if len(P) >= 3], gl["adv"])
    return _FLAT[key]


def layout(text, weight):
    """the text set in font units: [polygon], its ink box (x0, y0, x1, y1), y up; or None if a character is missing"""
    x = 0.0
    polys = []
    for ch in text:
        gp = glyph_polys(ch, weight)
        if gp is None:
            return None
        for P in gp[0]:
            polys.append(P + [x, 0.0])
        x += gp[1]
    if not polys:
        return None
    allp = np.vstack(polys)
    return polys, (float(allp[:, 0].min()), float(allp[:, 1].min()), float(allp[:, 0].max()), float(allp[:, 1].max()))


def placed_local(text, weight, box, turn):
    """the text fitted to `box` as placed() does, but kept per character in the line's own (u along, v down) frame:
    ([(char's polygons as (u, v) arrays)], to_page) or None"""
    lay = layout(text, weight)
    if lay is None:
        return None
    _, (ix0, iy0, ix1, iy1) = lay
    bx0, by0, bx1, by1 = box
    L_, H_ = (bx1 - bx0, by1 - by0) if turn == 0 else (by1 - by0, bx1 - bx0)
    iw, ih = ix1 - ix0, iy1 - iy0
    if iw <= 0 or ih <= 0 or L_ <= 0 or H_ <= 0:
        return None
    sy, sx = H_ / ih, L_ / iw
    if not (0.6 <= sx / sy <= 1.5):
        return None
    x = 0.0
    chars = []
    for ch in text:
        gp = glyph_polys(ch, weight)
        if ch != " ":
            chars.append([np.stack([(P[:, 0] + x - ix0) * sx, (iy1 - P[:, 1]) * sy], 1) for P in gp[0]])
        x += gp[1]
    return chars


def to_page_polys(chars, offsets, box, turn):
    out = []
    for cp, du in zip(chars, offsets):
        for q in cp:
            X, Y = _to_page(q[:, 0] + du, q[:, 1], box, turn)
            out.append(np.stack([X, Y], 1))
    return out


def placed(text, weight, box, turn):
    """the text's polygons in page px, its ink box fitted to `box` (x0, y0, x1, y1, page px, y down); `turn` 0 for
    lettering along the rows, 1 for lettering reading up the page, -1 reading down"""
    lay = layout(text, weight)
    if lay is None:
        return None
    polys, (ix0, iy0, ix1, iy1) = lay
    bx0, by0, bx1, by1 = box
    if turn == 0:
        L_, H_ = bx1 - bx0, by1 - by0
    else:
        L_, H_ = by1 - by0, bx1 - bx0
    iw, ih = ix1 - ix0, iy1 - iy0
    if iw <= 0 or ih <= 0 or L_ <= 0 or H_ <= 0:
        return None
    sy = H_ / ih
    sx = L_ / iw
    if not (0.6 <= sx / sy <= 1.5):
        if DEBUG:
            print("   ratio", round(sx / sy, 2), text)
        return None
    out = []
    for P in polys:
        u = (P[:, 0] - ix0) * sx                      # along the line of lettering
        v = (iy1 - P[:, 1]) * sy                      # down from the top of its ink
        if turn == 0:
            X, Y = bx0 + u, by0 + v
        elif turn == 1:                               # reading up: the line runs from the bottom up
            X, Y = bx0 + v, by1 - u
        else:                                         # reading down
            X, Y = bx1 - v, by0 + u
        out.append(np.stack([X, Y], 1))
    return out


def _to_page(u, v, box, turn):
    bx0, by0, bx1, by1 = box
    if turn == 0:
        return bx0 + u, by0 + v
    if turn == 1:
        return bx0 + v, by1 - u
    return bx1 - v, by0 + u


def _to_local(x0, y0, x1, y1, box, turn):
    """a page box as (u0, v0, u1, v1) along and down the line of lettering"""
    bx0, by0, bx1, by1 = box
    if turn == 0:
        return x0 - bx0, y0 - by0, x1 - bx0, y1 - by0
    if turn == 1:
        return by1 - y1, x0 - bx0, by1 - y0, x1 - bx0
    return y0 - by0, bx1 - x1, y1 - by0, bx1 - x0


def placed_chars(text, weight, box, turn, letters):
    """the text set letter by letter over the picture's letters (their page boxes, in reading order, one per
    character): each character centred on its letter, all at the word's height and one width - so a plan's narrower
    or wider lettering, or its own spacing, is followed. ([polygons], [each character's page box]) or None"""
    f = glyphs()["fonts"][weight]["glyphs"]
    chars = [ch for ch in text if ch != " "]
    if len(chars) != len(letters) or any(ch not in f for ch in chars):
        return None
    lay = layout(text, weight)
    if lay is None:
        return None
    _, (ix0, iy0, ix1, iy1) = lay
    bx0, by0, bx1, by1 = box
    H_ = (by1 - by0) if turn == 0 else (bx1 - bx0)
    ih = iy1 - iy0
    if ih <= 0 or H_ <= 0:
        return None
    sy = H_ / ih
    gl = []
    for ch in chars:
        P = glyph_polys(ch, weight)[0]
        if not P:
            return None
        A = np.vstack(P)
        gl.append((P, float(A[:, 0].min()), float(A[:, 0].max())))
    loc = [_to_local(*lb, box, turn) for lb in letters]
    ratios = [(l[2] - l[0]) / ((g[2] - g[1]) * sy) for g, l in zip(gl, loc) if (g[2] - g[1]) * sy > 0.35 * H_]
    hs = float(np.median(ratios)) if ratios else 1.0
    hs = max(0.6, min(1.5, hs))
    sx = sy * hs
    out, cb = [], []
    for (P, g0_, g1_), l in zip(gl, loc):
        uc = (l[0] + l[2]) / 2.0
        gc = (g0_ + g1_) / 2.0
        for q in P:
            u = uc + (q[:, 0] - gc) * sx
            v = (iy1 - q[:, 1]) * sy
            X, Y = _to_page(u, v, box, turn)
            out.append(np.stack([X, Y], 1))
        A = np.vstack(out[-len(P):])
        cb.append((float(A[:, 0].min()), float(A[:, 1].min()), float(A[:, 0].max()), float(A[:, 1].max())))
    return out, cb


def letters_of(boxes, turn, box):
    """the marks of a word as its letters, in reading order: marks one above the other along the line (an i's dot,
    a broken stroke) are one letter"""
    loc = sorted(((_to_local(*b, box, turn), b) for b in boxes), key=lambda t: t[0][0])
    out = []
    for l, b in loc:
        if out:
            pl, pb = out[-1]
            ov = min(pl[2], l[2]) - max(pl[0], l[0])
            if ov >= 0.5 * min(pl[2] - pl[0], l[2] - l[0]):
                nl = (min(pl[0], l[0]), min(pl[1], l[1]), max(pl[2], l[2]), max(pl[3], l[3]))
                nb = (min(pb[0], b[0]), min(pb[1], b[1]), max(pb[2], b[2]), max(pb[3], b[3]))
                out[-1] = (nl, nb)
                continue
        out.append((l, b))
    return [b for _, b in out]


# ------------------------------------------------------------------------------------------------ the words
PLAIN = re.compile(r"^[A-Za-z][A-Za-z.'&/-]*[A-Za-z.]$|^[A-Za-z]$")
NUMBER = re.compile(r"^[(]?[+-]?\d+([.,:/]\d+)*([.,]?\d*)?(\s?[x×X*]\s?\d+([.,]\d+)*)*(mm|m|M|sqm|sq\.?m|m²|ft|sqft|'|\")?[)]?$")
TAG = re.compile(r"^[A-Z]{1,3}\d{1,3}[A-Z]?$|^\d{1,2}[A-Z]{1,2}$")


VOCAB = set("""LIVING DINING KITCHEN BEDROOM BED MASTER BATH BATHROOM TOILET SHOWER POWDER ROOM STORE STOREROOM STUDY
YARD UTILITY SERVICE HOUSEHOLD SHELTER BOMB BALCONY LEDGE AIR CON PLANTER BAY WINDOW FOYER ENTRANCE LOBBY LIFT CORRIDOR
WALK-IN WARDROBE DRY WET PES PATIO TERRACE ROOF POOL GARDEN LAUNDRY PANTRY FAMILY LOUNGE GUEST JUNIOR SUITE DRESSING
HALL PRIVATE STAIR STAIRS UP DOWN OPEN VOID ATTIC UNIT TYPE AREA LEVEL FLOOR GROUND BASEMENT PORCH SHOE CABINET FRIDGE
WASHER DRYER HOB OVEN SINK BASIN VANITY BENCH ISLAND MAID HELPER OFFICE LIBRARY GYM MEDIA THEATRE WINE CELLAR
CARPARK CAR LANAI DECK VERANDAH VERANDA HOUSE MAIN ENSUITE COMMON REFUSE CHUTE BIN DUCT SHAFT STOREY PLAN KEY
NORTH SOUTH EAST WEST SCALE SQM SQFT TOTAL INTERNAL STRATA AIRCON AC""".split())


def _lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def corrected(txt):
    """a reading of a plan's word set right by the plan's own words (BrDROOM -> BEDROOM, SHELIER -> SHELTER): each
    part between slashes, if it is one letter or two from exactly one such word, becomes that word"""
    if not re.match(r"^[A-Za-z/&.'-]+$", txt):
        return txt
    up = sum(ch.isupper() for ch in txt) >= 0.6 * sum(ch.isalpha() for ch in txt)
    out = []
    for part in txt.split("/"):
        P = part.upper()
        if P in VOCAB or len(P) < 4:
            out.append(P if up else part); continue
        lim = 1 if len(P) < 6 else 2
        best = sorted((_lev(P, v), v) for v in VOCAB if abs(len(v) - len(P)) <= lim)
        if best and best[0][0] <= lim and (len(best) == 1 or best[1][0] > best[0][0]):
            out.append(best[0][1] if up else best[0][1].capitalize())
        else:
            out.append(part)
    return "/".join(out)


def plausible(txt):
    """a word a plan's lettering holds: letters only (a name), a figure or measure, or a short tag (D1, 2A)"""
    t = txt.strip()
    if not t or len(t) > 24:
        return False
    return bool(PLAIN.match(t) or NUMBER.match(t) or TAG.match(t))


def _boxes(polys):
    out = []
    for p in polys:
        R = np.vstack([np.asarray(r, float) for r in p["rings"] if len(r)])
        out.append((float(R[:, 0].min()), float(R[:, 1].min()), float(R[:, 0].max()), float(R[:, 1].max())))
    return out


def lines_of(_unused, boxes):
    """the marks standing side by side as the letters of a line of lettering, along the rows or up the columns:
    [(turn, [mark index])]"""
    out = []
    for turn in (0, 1):
        B = [(b[0], b[1], b[2], b[3]) if turn == 0 else (b[1], b[0], b[3], b[2]) for b in boxes]
        idx = sorted(range(len(B)), key=lambda i: B[i][0])
        parent = {i: i for i in idx}

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for a_ in range(len(idx)):
            i = idx[a_]; x0, y0, x1, y1 = B[i]; hi = y1 - y0
            if hi < 3 or hi > 80:
                continue
            for b_ in range(a_ + 1, len(idx)):
                j = idx[b_]; u0, v0, u1, v1 = B[j]; hj = v1 - v0
                if hj < 1.5 or hj > 80:
                    continue
                H_ = max(hi, hj)
                if u0 > x1 + 0.9 * H_:
                    break
                if u0 < x1 - 0.35 * min(x1 - x0, u1 - u0) - 1:
                    continue
                ov = min(y1, v1) - max(y0, v0)
                if ov < 0.3 * min(hi, hj):
                    continue
                if H_ > 3.0 * min(hi, hj) and min(hi, hj) > 0.35 * H_:
                    continue
                parent[find(i)] = find(j)
        groups = {}
        for i in idx:
            groups.setdefault(find(i), []).append(i)
        for gm in groups.values():
            if len(gm) >= 2:
                out.append((turn, gm))
    # a mark in both a row and a column: the longer line keeps it
    seen = {}
    for k, (turn, gm) in enumerate(out):
        for i in gm:
            if i not in seen or len(out[seen[i]][1]) < len(gm):
                seen[i] = k
    return [(turn, [i for i in gm if seen[i] == k]) for k, (turn, gm) in enumerate(out)]


def letter_marks(weak, px):
    """(r12) the working pixels of the marks standing side by side as a line of lettering (lines_of, nothing read):
    kept from the clean drawing of line work, so lettering is outlined as before whether or not it is retyped; and
    (letter_marks.height) how tall the plan's lettering is"""
    n, lab, st, _ = cv2.connectedComponentsWithStats(weak, 8)
    # (a letter's strokes are a tenth or so of its height; a ring or a slot drawn in a hairline - a hob's burners side
    # by side - is far thinner for its size)
    from skimage.morphology import skeletonize
    skl = np.bincount(lab[skeletonize(weak > 0)], minlength=n).astype(float)
    sw = st[:, 4] / np.maximum(1.0, skl)
    cand = [i for i in range(1, n) if 3 * px <= max(st[i, 2], st[i, 3]) <= 80 * px and st[i, 4] >= 3 * px * px
            and sw[i] >= LETTER_STROKE * min(st[i, 2], st[i, 3]) and sw[i] >= 0.05 * max(st[i, 2], st[i, 3])]
    keep = np.zeros(n, bool)
    heights = []
    if len(cand) >= 2:
        boxes = [(st[i, 0] / px, st[i, 1] / px, (st[i, 0] + st[i, 2]) / px, (st[i, 1] + st[i, 3]) / px) for i in cand]
        for turn, gm in lines_of(None, boxes):
            if len(gm) < 2:
                continue
            hs = [(boxes[i][3] - boxes[i][1]) if turn == 0 else (boxes[i][2] - boxes[i][0]) for i in gm]
            x0 = min(boxes[i][0] for i in gm); y0 = min(boxes[i][1] for i in gm)
            x1 = max(boxes[i][2] for i in gm); y1 = max(boxes[i][3] for i in gm)
            hm = float(np.median(hs))
            if hm < 3 or (x1 - x0 if turn == 0 else y1 - y0) < 1.2 * hm:
                continue
            # (letters are about as wide as they are tall, or wider run together: marks much longer across the line
            # than along it - a drainer's slots one above another - are not a line of lettering)
            along = [(boxes[i][2] - boxes[i][0]) if turn == 0 else (boxes[i][3] - boxes[i][1]) for i in gm]
            if float(np.median(along)) < 0.3 * hm:
                continue
            for i, hh in zip(gm, hs):
                if hh <= 2.0 * hm:                      # (not a fixture standing beside its label)
                    keep[cand[i]] = True
            heights += [hm] * len(gm)
    keep[0] = False
    letter_marks.height = float(np.median(heights)) if heights else None       # picture px: the plan's lettering
    return keep[lab].astype(np.uint8)


def _ocr(img, psm):
    import pytesseract
    return pytesseract.image_to_data(img, config="--psm %d --oem 1" % psm, output_type=pytesseract.Output.DICT)


def _dark(g, paper):
    return np.clip((paper - g.astype(np.float32)) / max(1.0, paper - float(g.min())), 0, 1)


def _stroke_w(mask):
    """a mask's stroke width: twice the median distance to its edge along its skeleton (in its own px)"""
    from skimage.morphology import skeletonize
    m = np.pad(mask > 0, 2)
    if m.sum() < 4:
        return 0.0
    dt = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    sk = skeletonize(m)
    return 2.0 * float(np.median(dt[sk])) if sk.any() else 0.0


def _raster(polys_px, ox, oy, k, shape):
    m = np.zeros(shape, np.uint8)
    pts = [np.round((P - [ox, oy]) * k * 16).astype(np.int32) for P in polys_px]
    cv2.fillPoly(m, pts, 1, cv2.LINE_AA, shift=4)
    return m


def _offset(polys_px, delta):
    """the type's outlines moved delta into its ink (a lighter weight) or out of it (negative: a heavier one)"""
    if abs(delta) < 1e-3:
        return polys_px
    out = []
    pts_all = [P.astype(np.float32).reshape(-1, 1, 2) for P in polys_px]
    for P in polys_px:
        a = np.roll(P, 1, 0); b = np.roll(P, -1, 0)
        t = b - a
        L = np.maximum(1e-9, np.hypot(t[:, 0], t[:, 1]))
        nrm = np.stack([-t[:, 1], t[:, 0]], 1) / L[:, None]
        # which side is ink: count the outlines a probe just off the vertex lies in (even-odd)
        probe = P + nrm * 0.05
        inside = np.zeros(len(P), int)
        for C in pts_all:
            inside += np.array([cv2.pointPolygonTest(C, (float(x), float(y)), False) > 0 for x, y in probe], int)
        sgn = np.where(inside % 2 == 1, 1.0, -1.0)
        out.append(P + nrm * sgn[:, None] * delta)
    return out


def _corr(a, b):
    a = a - a.mean(); b = b - b.mean()
    den = math.sqrt(float((a * a).sum()) * float((b * b).sum()))
    return float((a * b).sum()) / den if den > 0 else 0.0


def _match(polys_px, src_dark, ox, oy, k, char_boxes=None):
    """how alike the type (polygons, page px) and the picture's letters (darkness, k x the page, from (ox, oy)) are:
    the correlation of the two, each smoothed a little - and, given each character's box, the least alike of the
    characters (a misread letter: SHELIER for SHELTER)"""
    H, W = src_dark.shape
    m = np.zeros((H, W), np.uint8)
    pts = [np.round((P - [ox, oy]) * k * 16).astype(np.int32) for P in polys_px]
    cv2.fillPoly(m, pts, 1, cv2.LINE_AA, shift=4)
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.6 * k)
    b = cv2.GaussianBlur(src_dark, (0, 0), 0.6 * k)
    whole = _corr(a, b)
    if not char_boxes:
        return whole
    least = 1.0
    for x0, y0, x1, y1 in char_boxes:
        c0, r0 = int(max(0, math.floor((x0 - ox - 0.5) * k))), int(max(0, math.floor((y0 - oy - 0.5) * k)))
        c1, r1 = int(min(W, math.ceil((x1 - ox + 0.5) * k))), int(min(H, math.ceil((y1 - oy + 0.5) * k)))
        if c1 - c0 < 2 or r1 - r0 < 2:
            continue
        least = min(least, _corr(a[r0:r1, c0:c1], b[r0:r1, c0:c1]))
    return whole, least


class _Mask:
    """a mask of part of the page (its top left at (y, x), less a pixel's margin), read as if the page's"""
    def __init__(self, y, x, m):
        self.y, self.x, self.m = y - 1, x - 1, m

    def __getitem__(self, sl):
        ys, xs = sl
        out = np.zeros((ys.stop - ys.start, xs.stop - xs.start), np.uint8)
        a0, a1 = max(ys.start, self.y), min(ys.stop, self.y + self.m.shape[0])
        b0, b1 = max(xs.start, self.x), min(xs.stop, self.x + self.m.shape[1])
        if a1 > a0 and b1 > b0:
            out[a0 - ys.start:a1 - ys.start, b0 - xs.start:b1 - xs.start] = self.m[a0 - self.y:a1 - self.y, b0 - self.x:b1 - self.x]
        return out


def _line_strips(g0, paper, members_mask, box, turn, h):
    """one line of lettering (only its own marks shown) enlarged to about 40 px tall, upright: [(turn as shown,
    image, (cx0, cy0, k, Hb, Wb))] - a line up the page both ways round"""
    H, W = g0.shape
    x0, y0, x1, y1 = box
    mg = max(2.0, 0.5 * h)
    cx0, cy0 = int(max(0, math.floor(x0 - mg))), int(max(0, math.floor(y0 - mg)))
    cx1, cy1 = int(min(W, math.ceil(x1 + mg))), int(min(H, math.ceil(y1 + mg)))
    if cx1 - cx0 < 3 or cy1 - cy0 < 3:
        return []
    k = max(1.0, min(8.0, 40.0 / max(1.0, h)))
    crop = g0[cy0:cy1, cx0:cx1]
    mask = members_mask[cy0:cy1, cx0:cx1]
    show = np.where(mask > 0, crop, paper).astype(np.uint8)
    big = cv2.resize(show, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    Hb, Wb = big.shape
    geo = (cx0, cy0, k, Hb, Wb)
    if turn == 1:
        return [(1, cv2.rotate(big, cv2.ROTATE_90_CLOCKWISE), geo), (-1, cv2.rotate(big, cv2.ROTATE_90_COUNTERCLOCKWISE), geo)]
    return [(0, big, geo)]


def _read_strips(strips, paper):
    """the strips read by tesseract in one go, stacked one under another: per strip [(text, conf, page box)]"""
    gap = 24
    Wc = max(s_[1].shape[1] for s_ in strips) + 2 * gap
    Hc = sum(s_[1].shape[0] + gap for s_ in strips) + gap
    canvas = np.full((Hc, Wc), int(paper), np.uint8)
    tops = []
    y = gap
    for _, img, _ in strips:
        canvas[y:y + img.shape[0], gap:gap + img.shape[1]] = img
        tops.append(y)
        y += img.shape[0] + gap
    data = _ocr(canvas, 6)
    out = [[] for _ in strips]
    for q in range(len(data["text"])):
        txt = data["text"][q].strip()
        if not txt:
            continue
        lx, ty, ww, hh = data["left"][q], data["top"][q], data["width"][q], data["height"][q]
        yc = ty + hh / 2.0
        si = next((i for i, t0 in enumerate(tops) if t0 - gap / 2 <= yc < t0 + strips[i][1].shape[0] + gap / 2), None)
        if si is None:
            continue
        t_, img, (cx0, cy0, k, Hb, Wb) = strips[si]
        lx -= gap; ty -= tops[si]
        if t_ == 0:
            bx0, by0, bx1, by1 = lx, ty, lx + ww, ty + hh
        elif t_ == 1:
            bx0, by0, bx1, by1 = ty, Hb - (lx + ww), ty + hh, Hb - lx
        else:
            bx0, by0, bx1, by1 = Wb - (ty + hh), lx, Wb - ty, lx + ww
        out[si].append((txt, float(data["conf"][q]), (cx0 + bx0 / k, cy0 + by0 / k, cx0 + bx1 / k, cy0 + by1 / k)))
    return out


def _in_vocab(txt):
    return all(part.upper() in VOCAB for part in txt.split("/")) and bool(txt)


def _glued(ws, turn, h):
    """a word's first or last letter read apart from it as a stroke ('|' 'IVING/DININC' for LIVING/DINING) put back
    on it, when the two read together are one of the plan's words"""
    if len(ws) < 2:
        return ws
    ax = 0 if turn == 0 else 1
    out = list(ws)
    k = 0
    while k + 1 < len(out):
        (ta, ca, ba), (tb, cb, bb) = out[k], out[k + 1]
        if ba[ax] > bb[ax]:
            (ta, ca, ba), (tb, cb, bb) = (tb, cb, bb), (ta, ca, ba)
        gap = bb[ax] - ba[ax + 2]
        short = [t for t in (ta, tb) if len(t) <= 1]
        if len(short) == 1 and gap <= 0.5 * h and max(len(ta), len(tb)) >= 3:
            norm = lambda t: t.replace("|", "I").replace("!", "I").replace("1", "I") if len(t) <= 1 else t
            joined = norm(ta) + norm(tb)
            fixed = corrected(joined)
            if _in_vocab(fixed) and len(fixed) == len(joined):          # (the stray mark is a letter of the word)
                box = (min(ba[0], bb[0]), min(ba[1], bb[1]), max(ba[2], bb[2]), max(ba[3], bb[3]))
                out[k] = (joined, min(ca, cb), box)
                out.pop(k + 1)
                continue
        k += 1
    return out


def read_words(weak, g0, px, paper):
    """(r12) the plan's lettering read before anything else is drawn: the small marks standing side by side as letters
    do, each line shown alone to tesseract. Returns the words read with confidence ([{"text", "conf", "box", "turn",
    "h"}], page px) and the working pixels of their letters (kept from the clean drawing of line work: a figure drawn
    in thin lines, the 0 of 900, is a letter)"""
    taken = np.zeros_like(weak)
    if not RETYPE:
        return [], taken
    n, lab, st, _ = cv2.connectedComponentsWithStats(weak, 8)
    H, W = g0.shape
    cand = [i for i in range(1, n) if 3 * px <= max(st[i, 2], st[i, 3]) <= 80 * px and st[i, 4] >= 3 * px * px]
    if len(cand) < 2:
        return [], taken
    boxes = [(st[i, 0] / px, st[i, 1] / px, (st[i, 0] + st[i, 2]) / px, (st[i, 1] + st[i, 3]) / px) for i in cand]
    words = []
    lines = []
    for turn, gm in lines_of(None, boxes):
        if len(gm) < 2:
            continue
        ids = [cand[i] for i in gm]
        x0 = min(boxes[i][0] for i in gm); y0 = min(boxes[i][1] for i in gm)
        x1 = max(boxes[i][2] for i in gm); y1 = max(boxes[i][3] for i in gm)
        h = (y1 - y0) if turn == 0 else (x1 - x0)
        if h < 4 or (x1 - x0 if turn == 0 else y1 - y0) < 1.2 * h:
            continue
        # the line's own marks, at the picture's size
        bx0, by0 = int(min(st[i, 0] for i in ids)), int(min(st[i, 1] for i in ids))
        bx1, by1 = int(max(st[i, 0] + st[i, 2] for i in ids)), int(max(st[i, 1] + st[i, 3] for i in ids))
        sub = np.isin(lab[by0:by1, bx0:bx1], ids)
        small = cv2.resize(sub.astype(np.uint8), ((bx1 - bx0 + px - 1) // px, (by1 - by0 + px - 1) // px),
                           interpolation=cv2.INTER_AREA) if px > 1 else sub.astype(np.uint8)
        ys, xs = by0 // px, bx0 // px
        mm = _Mask(ys, xs, cv2.dilate(np.pad((small > 0).astype(np.uint8), 1), np.ones((3, 3), np.uint8)))
        lines.append((turn, gm, h, _line_strips(g0, paper, mm, (x0, y0, x1, y1), turn, h)))
    # all the lines read in one go
    strips, owner = [], []
    for li, (_, _, _, ss) in enumerate(lines):
        for s_ in ss:
            strips.append(s_); owner.append(li)
    if not strips:
        return [], taken
    try:
        reads = _read_strips(strips, paper)
    except Exception:
        return [], taken
    for li, (turn, gm, h, ss) in enumerate(lines):
        best = None
        for si in [i for i, o in enumerate(owner) if o == li]:
            ws = reads[si]
            score = sum(c for _, c, _ in ws) / len(ws) if ws else -1
            if ws and (best is None or score > best[0]):
                best = (score, strips[si][0], ws)
        if best is None:
            continue
        _, t_, ws = best
        ws = _glued(list(ws), turn, h)
        for txt, conf, wb in ws:
            if DEBUG:
                print("read", turn, t_, repr(txt), conf, [round(v, 1) for v in wb])
            fixed = corrected(txt)
            if fixed != txt:
                txt = fixed
                conf = max(conf, CONF)                 # (a plan's own word: the type's match decides)
            if conf < CONF or not plausible(txt):
                continue
            mem = [cand[i] for i in gm if boxes[i][0] >= wb[0] - 0.3 * h and boxes[i][2] <= wb[2] + 0.3 * h
                   and boxes[i][1] >= wb[1] - 0.3 * h and boxes[i][3] <= wb[3] + 0.3 * h]
            if not mem:
                continue
            letters = sum(ch.isalnum() for ch in txt)
            # (not a row of rings read as O's and 0's: a hob's burners)
            if letters < 1 or set(txt) <= set("oO0Q.,-"):
                continue
            ux0, uy0 = min(st[i, 0] for i in mem), min(st[i, 1] for i in mem)
            ux1, uy1 = max(st[i, 0] + st[i, 2] for i in mem), max(st[i, 1] + st[i, 3] for i in mem)
            # the word's own letters at the picture's size (its mask), and their box at half their ink's darkness
            sub = np.isin(lab[uy0:uy1, ux0:ux1], mem).astype(np.uint8)
            if px > 1:
                sub = cv2.resize(sub, ((ux1 - ux0 + px - 1) // px, (uy1 - uy0 + px - 1) // px), interpolation=cv2.INTER_AREA)
            ox, oy = ux0 // px, uy0 // px
            sub = (sub > 0).astype(np.uint8)
            crop = g0[oy:oy + sub.shape[0], ox:ox + sub.shape[1]]
            sub = sub[:crop.shape[0], :crop.shape[1]]
            dk = _dark(crop, paper) * sub
            if dk.max() <= 0:
                continue
            ys_, xs_ = np.nonzero(dk >= 0.5 * dk.max())
            box = (ox + xs_.min(), oy + ys_.min(), ox + xs_.max() + 1, oy + ys_.max() + 1)
            words.append({"text": txt, "conf": conf, "turn": 0 if turn == 0 else t_, "h": h, "box": box,
                          "mask": (ox, oy, sub)})
            for i in mem:
                x, y, w, h_ = st[i, :4]
                taken[y:y + h_, x:x + w] |= (lab[y:y + h_, x:x + w] == i).astype(np.uint8)
    return words, taken


def retype(polys, g0, paper, words, strokes=None):
    """the words read (read_words) set in type over their letters' traced outlines (the trace's fills, page px) - and
    any short stroke the trace drew for a letter of theirs (an I) - where the type matches the picture:
    (polys, strokes, [(text, weight, match)])"""
    if not RETYPE or not words:
        return polys, strokes, []
    mi = [i for i, p in enumerate(polys) if (p.get("mark") or p.get("over")) and p.get("rings")]
    marks = [polys[i] for i in mi]
    boxes = _boxes(marks) if marks else []
    drop, add, done, sdrop = set(), [], [], set()
    H, W = g0.shape
    for w in words:
        bx0, by0, bx1, by1 = w["box"]
        h = w["h"]
        e = 0.2 * h + 0.5
        inw = [j for j in range(len(marks)) if mi[j] not in drop and boxes[j][0] >= bx0 - e and boxes[j][2] <= bx1 + e
               and boxes[j][1] >= by0 - e and boxes[j][3] <= by1 + e]
        txt = w["text"]
        ox, oy, sub = w["mask"]
        crop = g0[oy:oy + sub.shape[0], ox:ox + sub.shape[1]]
        sd = _dark(crop, paper) * cv2.dilate(sub, np.ones((3, 3), np.uint8))
        sdk = cv2.resize(sd, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        res = None
        src_w = _stroke_w(sdk > 0.5 * sdk.max()) / 4.0
        if inw:
            # the letters' outlines give the box to a fraction of a pixel, where they hold the whole word
            mx0 = min(boxes[j][0] for j in inw); my0 = min(boxes[j][1] for j in inw)
            mx1 = max(boxes[j][2] for j in inw); my1 = max(boxes[j][3] for j in inw)
            if mx1 - mx0 >= 0.85 * (bx1 - bx0) and my1 - my0 >= 0.85 * (by1 - by0):
                bx0, by0, bx1, by1 = mx0, my0, mx1, my1
        lets = letters_of([boxes[j] for j in inw], w["turn"], (bx0, by0, bx1, by1)) if inw else []
        def place(weight, box):
            P = placed(txt, weight, box, w["turn"])
            return None if P is None else (P, None)
        for weight in ("regular", "bold"):
            box = [bx0, by0, bx1, by1]
            r_ = place(weight, tuple(box))
            if r_ is None:
                continue
            P, cb = r_
            score = _match(P, sdk, ox, oy, 4)
            # each edge of the box moved a little where that fits the type to the letters better
            for step in (0.5, 0.25):
                for _ in range(2):
                    for k_ in range(4):
                        for dv in (-step, step):
                            b2 = list(box); b2[k_] += dv
                            r2 = place(weight, tuple(b2))
                            if r2 is None:
                                continue
                            s2 = _match(r2[0], sdk, ox, oy, 4)
                            if s2 > score:
                                box, (P, cb), score = b2, r2, s2
            loc = placed_local(txt, weight, tuple(box), w["turn"])
            offs = [0.0] * (len(loc) if loc is not None else 0)
            if SHIFT and loc is not None:
                # each character moved along the line where that sits it on its letter better (a plan's lettering is
                # spaced its own way)
                if True:
                    lim = SHIFT_LIM * h
                    for step in (0.5, 0.25):
                        for kk in range(len(loc)):
                            for dv in (-step, step, -2 * step, 2 * step):
                                o2 = list(offs); o2[kk] += dv
                                if abs(o2[kk]) > lim:
                                    continue
                                P2 = to_page_polys(loc, o2, tuple(box), w["turn"])
                                s2 = _match(P2, sdk, ox, oy, 4)
                                if s2 > score:
                                    offs, P, score = o2, P2, s2
            delta = 0.0
            if WEIGHT and src_w > 0:
                typ_w = _stroke_w(_raster(P, ox, oy, 4, sdk.shape) > 0) / 4.0
                delta = max(-0.35 * typ_w, min(0.35 * typ_w, (typ_w - src_w) / 2.0))
                P = _offset(P, delta)
            if loc is not None:
                cb = []
                for cp, du in zip(loc, offs):
                    Q = np.vstack(to_page_polys([cp], [du], tuple(box), w["turn"])) if cp else None
                    if Q is not None:
                        cb.append((float(Q[:, 0].min()), float(Q[:, 1].min()), float(Q[:, 0].max()), float(Q[:, 1].max())))
            whole, least = _match(P, sdk, ox, oy, 4, cb or [(min(q[:, 0].min() for q in P), min(q[:, 1].min() for q in P),
                                                             max(q[:, 0].max() for q in P), max(q[:, 1].max() for q in P))])
            if res is None or whole > res[0]:
                res = (whole, weight, P, least, bool(cb), tuple(box), offs, delta)
        if DEBUG:
            print("type", repr(txt), None if res is None else (round(res[0], 3), res[1], "least %.3f" % res[3], "by letter" if res[4] else "word"), "marks", len(inw))
        digits = any(ch.isdigit() for ch in txt)
        if res is None or res[0] < (MATCH_NUM if digits else MATCH) or (res[4] and res[3] < LEAST) \
                or (digits and w["conf"] < CONF_NUM):
            continue
        # the reading must fit the picture better than any reading a letter away that is easily mistaken for it (3
        # for 8, 1 for 7): unless it is one of the plan's own words, such a near thing is left as traced
        if not all(part.upper() in VOCAB for part in re.split(r"[/ ]", txt) if part):
            amb = _rival(txt, res, sdk, ox, oy, w["turn"])
            if DEBUG and amb:
                print("   rival", amb)
            if amb:
                continue
        tone = int(np.median([marks[j]["g"] for j in inw])) if inw else int(np.percentile(crop[sub > 0], 10))
        for j in inw:
            drop.add(mi[j])
        if strokes:
            for k, e_ in enumerate(strokes):
                if e_["k"] not in ("line", "arc", "dot", "path") or k in sdrop:
                    continue
                pts = _stroke_pts(e_)
                if len(pts) and pts[:, 0].min() >= bx0 - e and pts[:, 0].max() <= bx1 + e and \
                        pts[:, 1].min() >= by0 - e and pts[:, 1].max() <= by1 + e:
                    sdrop.add(k)
        rings = [[[round(float(a), 2), round(float(b), 2)] for a, b in P_] for P_ in res[2]]
        add.append({"rings": rings, "g": tone, "type": txt})
        done.append((txt, res[1], round(res[0], 3)))
    if not add:
        return polys, strokes, []
    strokes = [e_ for k, e_ in enumerate(strokes)] if strokes is None else [e_ for k, e_ in enumerate(strokes) if k not in sdrop]
    return [p for i, p in enumerate(polys) if i not in drop] + add, strokes, done


CONFUSED = {"0": "8698DO", "1": "7Il", "2": "7Z", "3": "859", "4": "9A", "5": "63S", "6": "5809G", "7": "12",
            "8": "30695B", "9": "8406", "B": "8ER", "E": "FB", "F": "EP", "O": "0DQC", "D": "O0", "C": "GO", "G": "C6",
            "I": "1L", "L": "I", "S": "5", "Z": "2", "A": "4", "P": "RF", "R": "PB", "M": "N", "N": "MH", "H": "N",
            "U": "V", "V": "U"}


def _rival(txt, res, sdk, ox, oy, turn, margin=0.015):
    """a reading one letter from txt, easily mistaken for it, that fits the picture as well (within margin): or None"""
    own, weight, _, _, _, box, offs, delta = res
    for k, ch in enumerate(txt):
        for alt in CONFUSED.get(ch, ""):
            var = txt[:k] + alt + txt[k + 1:]
            loc = placed_local(var, weight, box, turn)
            if loc is None or len(loc) != len(offs):
                continue
            P = to_page_polys(loc, offs, box, turn)
            if delta:
                P = _offset(P, delta)
            sc = _match(P, sdk, ox, oy, 4)
            if sc >= own - margin:
                return (var, round(sc, 3), round(own, 3))
    return None


def _stroke_pts(e):
    if e["k"] == "line":
        return np.array([e["a"], e["b"]], float)
    if e["k"] == "dot":
        return np.array([e["c"]], float)
    if e["k"] == "arc":
        A = np.linspace(e["a0"], e["a1"], 9)
        return np.stack([e["c"][0] + e["r"] * np.cos(A), e["c"][1] + e["r"] * np.sin(A)], 1)
    pts = []
    for p in e["parts"]:
        if p[0] == "L":
            pts += [p[1], p[2]]
        else:
            A = np.linspace(p[3], p[4], 9)
            pts += list(zip(p[1][0] + p[2] * np.cos(A), p[1][1] + p[2] * np.sin(A)))
    return np.array(pts, float)
