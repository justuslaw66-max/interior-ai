"""(r12) lettering the reader is sure of set in type: a word of the plan's lettering that tesseract reads with
confidence, and that the word set in a clean typeface (Liberation Sans, regular or bold) at the same size, place and
angle matches closely, is drawn as that type - sharp at any zoom - in place of its letters' traced outlines. A word it
is unsure of, or whose type does not match the picture (a misreading: 8ED for BED), keeps its traced letters.

J, 29 Oct: "Retype what's read".

(stage 1, 11 Nov) CAD lettering (FT_CAD_LETTERING=1): J, 11 Nov: "my goal is for everything to be clean and 100% perfect
like what the vector plan produce". A CAD plan's lettering is a pen's single strokes; it is set in the single-stroke
font CAD lettering comes from (Hershey simplex, hershey_strokes.json), and only:
  - where that font fits a word better than the sans font, and its strokes are pen-thin (a brochure's bold footer stays
    traced), at the weight and tone of the plan's own lettering, each letter keeping its spacing;
  - and only on a plan whose lettering can be set almost whole (75 %): clean type beside traced letters reads as two
    styles, so a plan that cannot be set whole is traced exactly as without retyping (faithful_trace.trace_gray).
Read from the bottom when upright (aligned dimensions: read upside down, 900 is 006); words left unread by tesseract
are read by matching the plan's own words set in the font (never figures: one whose digit touches its dimension line
fits as another figure). Blind A/Bs, 11 Nov (claude/image-to-clean-vector-plan-2026-11-11.md): on the 74-plan set the
qualifying plans came out the same or clearly better (J's 4-room plan, 3 of 3 graders), every other plan unchanged."""
import json, math, os, re
import cv2, numpy as np

CAD = os.environ.get("FT_CAD_LETTERING", "0") == "1"


def _env(name, plain, cad):
    """a setting: its own variable if set, else the CAD-lettering default when that is on, else the plain one"""
    v = os.environ.get(name)
    return v if v is not None else (cad if CAD else plain)


RETYPE = _env("FT_RETYPE", "0", "1") == "1"      # (off: blind A/B 29 Oct, r11 64 / r12 5 - mixed fonts, greys, misread figures)
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
UP_BIAS = float(os.environ.get("FT_RETYPE_UP_BIAS", "15"))   # confidence points in favour of upright lettering read from the bottom
# the fonts a word is fitted in, and those it may be set in: a word whose best fit is another font is left as traced
FONTS = [f for f in _env("FT_RETYPE_FONTS", "regular,bold", "regular,bold,stroke-light,stroke,stroke-heavy").split(",") if f]
SET = [f for f in _env("FT_RETYPE_SET", "", "stroke").split(",") if f]
PEN_SHARE = float(os.environ.get("FT_RETYPE_PEN_SHARE", "0.16"))   # a stroke-font word's stroke at most this share of its height
MATCH_READ = _env("FT_RETYPE_MATCH_READ", "0", "1") == "1"   # unread lettering read by matching the plan's font and words
MATCH_GAP = float(os.environ.get("FT_RETYPE_MATCH_GAP", "0.03"))   # ... the best reading at least this far ahead of the next
# all or none: the share of the plan's lettering that must be set for any of it to be (else all stays traced), and,
# before the trace, the share read (at least this part of it)
ALL_SHARE = float(_env("FT_RETYPE_ALL_SHARE", "0", "0.75"))
READ_SHARE = float(os.environ.get("FT_RETYPE_READ_SHARE", "0.9"))
TRACED_WEIGHT = _env("FT_RETYPE_TRACED_WEIGHT", "0", "1") == "1"   # stroke words at the weight of the plan's traced lettering
SPACING = float(_env("FT_RETYPE_SPACING", "9", "0.3"))   # neighbouring characters moved apart by at most this share of the height
# (r13, 12 Nov) more of a plan's lettering read, each its own switch, on with CAD lettering:
# a word read in pieces (BED, an R not read, OOM) matched whole against the plan's words that hold the pieces in order
JOIN = _env("FT_RETYPE_JOIN", "0", "1") == "1"
JOIN_GAP = float(os.environ.get("FT_RETYPE_JOIN_GAP", "0.75"))   # ... pieces and marks at most this share of the height apart
LEAST_JOIN = float(os.environ.get("FT_RETYPE_LEAST_JOIN", "0.3"))  # ... and each of its characters and its letter alike at least this
# (the letter tesseract could not read is the damaged one - an R or O broken by the picture's compression - and the
# pieces read on either side hold the word to the plan's own)
# a mark far taller than the letter beside it (a door swing by HOUSE- / HOLD) is not in that letter's line - it joined
# two lines of a label into one, which read as nothing
TALL_APART = _env("FT_RETYPE_TALL_APART", "0", "1") == "1"
TALL = float(os.environ.get("FT_RETYPE_TALL", "1.8"))      # ... far taller: this many times, beside a letter at least 6 px tall
# a word the plan's lettering holds elsewhere (BATH/ read in one bathroom) is matched in another at the plain bar,
# where it is well ahead of the next reading
SHEET_WORD = _env("FT_RETYPE_SHEET_WORD", "0", "1") == "1"
SHEET_GAP = float(os.environ.get("FT_RETYPE_SHEET_GAP", "0.1"))
# a plan's own word read exactly (LIVING/DINING) with little confidence - small or blurred lettering - is taken as read
# for the type's match to decide, as a word put right by the plan's words is (corrected)
VOCAB_READ = _env("FT_RETYPE_VOCAB_READ", "0", "1") == "1"
# the plan's lettering height, which decides what is a small drawing to redraw clean (a basin), measured with all its
# lettering, read or not: measured on the letters left unread it changed with what was read (s018's basins redrawn)
HEIGHT_ALL = _env("FT_RETYPE_HEIGHT_ALL", "0", "1") == "1"
# (built, off: lettering not retyped redrawn as pen strokes along its letters - lost the blind A/B 53 to 1, 11 Nov)
REDRAW = os.environ.get("FT_RETYPE_REDRAW", "0") == "1"
REDRAW_GAIN = float(os.environ.get("FT_RETYPE_REDRAW_GAIN", "-9"))
REDRAW_T = float(os.environ.get("FT_RETYPE_REDRAW_T", "0.3"))
_GLYPHS = None
STROKE_WEIGHTS = {"stroke-light": 0.06, "stroke": 0.09, "stroke-heavy": 0.13}   # pen widths, shares of the cap height


def _stroke_fonts(path):
    """the single-stroke font (hershey_strokes.json: Hershey simplex, public domain, as built into OpenCV) outlined at
    STROKE_WEIGHTS' pen widths, in the form faithful_glyphs.json's fonts take (contours of on-curve points, y up)"""
    with open(path) as f:
        src = json.load(f)
    R, cap = 24.0, src["capHeight"]
    fonts = {}
    for name, share in STROKE_WEIGHTS.items():
        pen = share * cap
        out = {}
        for ch, g in src["glyphs"].items():
            if not g["s"]:
                out[ch] = {"adv": g["adv"], "c": []}
                continue
            allp = np.array([p for L in g["s"] for p in L], float)
            x0, y0 = allp.min(0) - 2 * pen
            x1, y1 = allp.max(0) + 2 * pen
            img = np.zeros((int((y1 - y0) * R) + 4, int((x1 - x0) * R) + 4), np.uint8)
            for L in g["s"]:
                P = np.array([[(x - x0) * R * 16, (y1 - y) * R * 16] for x, y in L], np.int32)
                cv2.polylines(img, [P], False, 255, max(1, int(round(pen * R))), cv2.LINE_AA, shift=4)
            cs, _ = cv2.findContours((img >= 128).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            rings = []
            for c in cs:
                a = cv2.approxPolyDP(c.astype(np.float32), 0.6, True).reshape(-1, 2)
                if len(a) >= 3:
                    rings.append([[round(float(px) / R + x0, 3), round(y1 - float(py) / R, 3), 1] for px, py in a])
            out[ch] = {"adv": g["adv"], "c": rings}
        fonts[name] = {"capHeight": cap, "xHeight": 0.7 * cap, "glyphs": out}
    return fonts


def glyphs():
    global _GLYPHS
    if _GLYPHS is None:
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "faithful_glyphs.json")) as f:
            _GLYPHS = json.load(f)
        if any(f_.startswith("stroke") for f_ in FONTS):
            _GLYPHS["fonts"].update(_stroke_fonts(os.path.join(here, "hershey_strokes.json")))
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
NORTH SOUTH EAST WEST SCALE SQM SQFT TOTAL INTERNAL STRATA AIRCON AC DROP END ACCESS HOLD SUGGESTED LAYOUT
OPTIONAL FUTURE FLEXI BLOCK STANDARD APARTMENT EXECUTIVE MAISONETTE FLAT NEW ROOM OF FOR ONLY TO BE""".split())


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
    # a name may be bracketed, or run on with a slash or hyphen to the next line: (CORRIDOR, END), LIVING/, HOUSE-
    core = re.sub(r"^[(]", "", re.sub(r"[)/-]$", "", t))
    if core != t and core and PLAIN.match(core) and not any(ch.isdigit() for ch in core):
        return True
    return bool(PLAIN.match(t) or NUMBER.match(t) or TAG.match(t))


def _boxes(polys):
    out = []
    for p in polys:
        R = np.vstack([np.asarray(r, float) for r in p["rings"] if len(r)])
        out.append((float(R[:, 0].min()), float(R[:, 1].min()), float(R[:, 0].max()), float(R[:, 1].max())))
    return out


def lines_of(_unused, boxes, tall_apart=False):
    """the marks standing side by side as the letters of a line of lettering, along the rows or up the columns:
    [(turn, [mark index])]. (tall_apart: a mark far taller than the letter beside it is not in its line - for the
    reading only, so the trace's own lettering marks are as before)"""
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
                if tall_apart and H_ > TALL * min(hi, hj) and min(hi, hj) >= 6:
                    continue                                    # (r13) a door swing beside a letter (a hyphen still joins)
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


def _ocr(img, psm, extra=""):
    import pytesseract
    return pytesseract.image_to_data(img, config=("--psm %d --oem 1 " % psm) + extra, output_type=pytesseract.Output.DICT)


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


def _read_strips(strips, paper, extra=""):
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
    data = _ocr(canvas, 6, extra)
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


def _word_of(mem, st, lab, g0, paper, px):
    """a word's own letters at the picture's size (its mask) and their box at half their ink's darkness: (box, mask),
    or None"""
    ux0, uy0 = min(st[i, 0] for i in mem), min(st[i, 1] for i in mem)
    ux1, uy1 = max(st[i, 0] + st[i, 2] for i in mem), max(st[i, 1] + st[i, 3] for i in mem)
    sub = np.isin(lab[uy0:uy1, ux0:ux1], mem).astype(np.uint8)
    if px > 1:
        sub = cv2.resize(sub, ((ux1 - ux0 + px - 1) // px, (uy1 - uy0 + px - 1) // px), interpolation=cv2.INTER_AREA)
    ox, oy = ux0 // px, uy0 // px
    sub = (sub > 0).astype(np.uint8)
    crop = g0[oy:oy + sub.shape[0], ox:ox + sub.shape[1]]
    sub = sub[:crop.shape[0], :crop.shape[1]]
    dk = _dark(crop, paper) * sub
    if dk.max() <= 0:
        return None
    ys_, xs_ = np.nonzero(dk >= 0.5 * dk.max())
    return (ox + xs_.min(), oy + ys_.min(), ox + xs_.max() + 1, oy + ys_.max() + 1), (ox, oy, sub)


def _join_rows(words, lines, line_words, st, cand, boxes, taken, lab, g0, paper, px):
    """(r13) a row's word read in pieces - BED, an R not read, OOM; H, an O not read, LD - matched whole: the pieces
    read and the unread marks between or beside them, no more than JOIN_GAP of the height apart, matched (_guess)
    against the plan's words that hold the pieces read, in order (BED.+OOM: BEDROOM), and taken as read where one
    matches; where none does, everything is as it was. Returns the marks taken into such words."""
    claimed, dead = set(), set()
    for li, t_ in line_words:
        turn, gm, h, _ = lines[li]
        if turn != 0:
            continue
        reads = [k for k, w_ in enumerate(words) if k not in dead and w_.get("text") and w_.get("line") == li
                 and not w_.get("join")]
        if not reads:
            continue
        ys0 = min(words[k]["box"][1] for k in reads); ys1 = max(words[k]["box"][3] for k in reads)
        hb = ys1 - ys0
        # the unread marks in the row's band, letter-sized
        free = []
        for i in range(len(cand)):
            if i in claimed:
                continue
            b = boxes[i]
            cy = 0.5 * (b[1] + b[3])
            if not (ys0 - 0.2 * hb <= cy <= ys1 + 0.2 * hb) or (b[3] - b[1]) > 1.3 * hb or (b[3] - b[1]) < 0.3 * hb:
                continue
            x, y, w, hh = st[cand[i], :4]
            if taken[y:y + hh, x:x + w][lab[y:y + hh, x:x + w] == cand[i]].any():
                continue
            free.append(i)
        pieces = [("w", k, words[k]["box"][0], words[k]["box"][2]) for k in reads] + \
                 [("m", i, boxes[i][0], boxes[i][2]) for i in free]
        pieces.sort(key=lambda p_: p_[2])
        runs, cur = [], []
        for p_ in pieces:
            if cur and p_[2] - max(q[3] for q in cur) > JOIN_GAP * h:
                runs.append(cur); cur = []
            cur.append(p_)
        if cur:
            runs.append(cur)
        for run in runs:
            ws_ = [p_ for p_ in run if p_[0] == "w"]
            ms_ = [p_ for p_ in run if p_[0] == "m"]
            if not ws_ or not ms_ or any(any(ch.isdigit() for ch in words[p_[1]]["text"]) for p_ in ws_):
                continue
            pat, prev = "", None
            for p_ in run:
                if p_[0] == "w":
                    pat += re.escape(words[p_[1]]["text"].upper())
                elif prev != "m":
                    pat += ".+"
                prev = p_[0]
            mem = [m_ for p_ in ws_ for m_ in words[p_[1]]["members"]] + [cand[p_[1]] for p_ in ms_]
            got = _word_of(mem, st, lab, g0, paper, px)
            if got is None:
                continue
            jbox, (ox, oy, sub) = got
            crop = g0[oy:oy + sub.shape[0], ox:ox + sub.shape[1]]
            sdk = cv2.resize(_dark(crop, paper) * cv2.dilate(sub, np.ones((3, 3), np.uint8)), None, fx=4, fy=4,
                             interpolation=cv2.INTER_CUBIC)
            parts = [words[p_[1]]["text"] for p_ in ws_]
            t = _guess({"box": jbox, "turn": 0, "h": h}, sdk, ox, oy,
                       [w_["text"] for k, w_ in enumerate(words) if w_.get("text") and k not in dead], (pat, parts))
            if DEBUG:
                print("join", pat, "box", [round(v) for v in jbox], "->", t)
            if t is None:
                continue                                        # (not one word: the pieces stay as they were)
            ms_ids = {cand[p_[1]] for p_ in ms_}
            # (a mark of the run another line read - an R read up its column - is the word's)
            gone = {p_[1] for p_ in ws_} | {k for k, w_ in enumerate(words) if k not in dead and w_.get("members")
                                            and set(w_["members"]) <= ms_ids}
            first = min(gone)
            words[first] = {"text": t, "conf": max(CONF, words[first].get("conf", 0.0)), "turn": 0, "h": h, "box": jbox,
                            "mask": (ox, oy, sub), "members": mem, "line": li, "join": (pat, parts)}
            dead |= gone - {first}
            claimed |= {p_[1] for p_ in ms_}
            for m_ in ms_ids:
                x, y, w, hh = st[m_, :4]
                taken[y:y + hh, x:x + w] |= (lab[y:y + hh, x:x + w] == m_).astype(np.uint8)
    words[:] = [w_ for k, w_ in enumerate(words) if k not in dead]
    return claimed


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
    grouped = lines_of(None, boxes, TALL_APART)
    # a word whose letters touch (a small or blurred picture: 4000, LEDGE) is one mark: shaped like a word, at the
    # height of the plan's lettering, it is a line of its own
    inline = {i for _, gm in grouped for i in gm}
    heights = sorted(min(b[2] - b[0], b[3] - b[1]) for b in (boxes[i] for _, gm in grouped for i in gm))
    if heights:
        lh = heights[len(heights) // 2]
        for i, (x0, y0, x1, y1) in enumerate(boxes):
            w_, h_ = x1 - x0, y1 - y0
            if i in inline:
                continue
            if 0.7 * lh <= h_ <= 2.2 * lh and w_ >= 1.6 * h_:
                grouped.append((0, [i, i]))
            elif 0.7 * lh <= w_ <= 2.2 * lh and h_ >= 1.6 * w_:
                grouped.append((1, [i, i]))
    for turn, gm in grouped:
        gm = sorted(set(gm)) if len(set(gm)) > 1 else gm
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
    # a line read as a figure gone wrong ("250, 495, £5)) is read again as figures only; the new reading is taken
    # where it is all figures and surer
    def figure_like(ws):
        t = "".join(x for x, _, _ in ws)
        return len(t) >= 2 and sum(ch.isdigit() for ch in t) >= 0.5 * len(t) and \
            (any(not ch.isdigit() for ch in t) or min(c for _, c, _ in ws) < CONF_NUM)
    again = [i for i, ws in enumerate(reads) if ws and figure_like(ws)]
    if again:
        try:
            digits = _read_strips([strips[i] for i in again], paper, "-c tessedit_char_whitelist=0123456789")
            for i, ws in zip(again, digits):
                if ws and all(x.isdigit() for x, _, _ in ws) and \
                        sum(c for _, c, _ in ws) / len(ws) >= sum(c for _, c, _ in reads[i]) / len(reads[i]):
                    if DEBUG:
                        print("figures", [x for x, _, _ in reads[i]], "->", [(x, c) for x, c, _ in ws])
                    reads[i] = ws
        except Exception:
            pass
    line_words, unread = [], []
    for li, (turn, gm, h, ss) in enumerate(lines):
        best = None
        read_as = {}
        for si in [i for i, o in enumerate(owner) if o == li]:
            ws = reads[si]
            score = sum(c for _, c, _ in ws) / len(ws) if ws else -1
            if ws:
                read_as[strips[si][0]] = " ".join(t for t, _, _ in ws)
            # a drawing's upright lettering reads from the bottom (aligned dimensions, ISO 129): read upside down,
            # 900 is 006 and 6 is 9, so the other way must read clearly better to be taken
            if ws and turn == 1 and strips[si][0] == 1:
                score += UP_BIAS
            if ws and (best is None or score > best[0]):
                best = (score, strips[si][0], ws)
        if best is None:
            unread.append((li, 1 if turn == 1 else 0))
            continue
        # a figure is read from the bottom whenever it reads that way at all (upside down, 900 is 006)
        if best[1] == -1 and 1 in read_as and any(ch.isdigit() for ch in read_as[-1]):
            best = next((sc, t_, ws) for sc, t_, ws in [(0, 1, reads[i]) for i, o in enumerate(owner)
                                                        if o == li and strips[i][0] == 1])
        _, t_, ws = best
        ws = _glued(list(ws), turn, h)
        line_words.append((li, t_))
        for txt, conf, wb in ws:
            if DEBUG:
                print("read", turn, t_, repr(txt), conf, [round(v, 1) for v in wb])
            fixed = corrected(txt)
            if fixed != txt or (VOCAB_READ and conf < CONF and len(txt) >= 3 and _in_vocab(txt.upper().strip("()-"))):
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
                          "mask": (ox, oy, sub), "members": mem, "line": li})
            for i in mem:
                x, y, w, h_ = st[i, :4]
                taken[y:y + h_, x:x + w] |= (lab[y:y + h_, x:x + w] == i).astype(np.uint8)
    if MATCH_READ:
        claimed = _join_rows(words, lines, line_words, st, cand, boxes, taken, lab, g0, paper, px) if JOIN else set()
        # the marks of a line that tesseract left unread (or read as nothing the plan holds), grouped into words by
        # the gaps between them, are offered to the matching reader (retype's _guess: the plan's own font and words)
        for li, t_ in unread + line_words:
            turn, gm, h, _ = lines[li]
            left = [i for i in gm if i not in claimed and not taken[st[cand[i], 1]:st[cand[i], 1] + st[cand[i], 3],
                                             st[cand[i], 0]:st[cand[i], 0] + st[cand[i], 2]].any()]
            ax = 0 if turn == 0 else 1
            left.sort(key=lambda i: boxes[i][ax])
            groups_, cur = [], []
            for i in left:
                if cur and boxes[i][ax] - max(boxes[j][ax + 2] for j in cur) > 0.75 * h:
                    groups_.append(cur); cur = []
                cur.append(i)
            if cur:
                groups_.append(cur)
            for gw in groups_:
                mem = [cand[i] for i in gw]
                ux0, uy0 = min(st[i, 0] for i in mem), min(st[i, 1] for i in mem)
                ux1, uy1 = max(st[i, 0] + st[i, 2] for i in mem), max(st[i, 1] + st[i, 3] for i in mem)
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
                L = (box[2] - box[0]) if turn == 0 else (box[3] - box[1])
                T = (box[3] - box[1]) if turn == 0 else (box[2] - box[0])
                if L < 0.8 * h:                       # a lone letter or mark: not guessed
                    continue
                if T > 1.6 * h:                       # taller than a line of lettering: a symbol's marks, not a word
                    continue
                words.append({"text": None, "conf": 0.0, "turn": 0 if turn == 0 else (t_ or 1), "h": h, "box": box,
                              "mask": (ox, oy, sub), "members": mem})
    if ALL_SHARE > 0:
        # all or none, decided before the trace uses what was read: a plan whose lettering does not read well enough
        # to be set almost whole is left exactly as traced (its letters' pixels are not set aside either)
        read_l = sum(sum(ch.isalnum() for ch in w_["text"]) for w_ in words if w_["text"])
        left_l = sum(((w_["box"][2] - w_["box"][0]) if w_["turn"] == 0 else (w_["box"][3] - w_["box"][1])) / max(1.0, 0.7 * w_["h"])
                     for w_ in words if not w_["text"])
        share = read_l / max(1.0, read_l + left_l)
        if DEBUG:
            print("lettering read: %d letters, unread %.0f, share %.2f" % (read_l, left_l, share))
        if share < READ_SHARE * ALL_SHARE:
            return [], np.zeros_like(taken)
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
    pending = []
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
        if txt is None:
            txt = _guess(w, sdk, ox, oy, [x["text"] for x in words if x["text"]])
            if txt is None:
                # an unread word whose strokes are heavier than a pen's is lettering in another style (a brochure's
                # bold footer), as a read one would be found to be
                heavy = _stroke_w(sdk > 0.5 * sdk.max()) / 4.0 > PEN_SHARE * h if sdk.max() > 0 else False
                pending.append((w, inw, "other style" if heavy else None))
                continue
            w = dict(w, text=txt, conf=max(CONF, CONF_NUM))
        res = None
        extra = None
        src_w = _stroke_w(sdk > 0.5 * sdk.max()) / 4.0
        if inw:
            # the letters' outlines give the box to a fraction of a pixel, where they hold the whole word
            mx0 = min(boxes[j][0] for j in inw); my0 = min(boxes[j][1] for j in inw)
            mx1 = max(boxes[j][2] for j in inw); my1 = max(boxes[j][3] for j in inw)
            if mx1 - mx0 >= 0.85 * (bx1 - bx0) and my1 - my0 >= 0.85 * (by1 - by0):
                bx0, by0, bx1, by1 = mx0, my0, mx1, my1
        lets = letters_of([boxes[j] for j in inw], w["turn"], (bx0, by0, bx1, by1)) if inw else []
        traced_w = 0.0
        if inw:
            rs = [np.array(r_, float) for j in inw for r_ in marks[j]["rings"] if len(r_) >= 3]
            if rs:
                tm = _raster(rs, ox, oy, 4, sdk.shape)
                traced_w = _stroke_w(tm > 0) / 4.0
        def place(weight, box):
            P = placed(txt, weight, box, w["turn"])
            return None if P is None else (P, None)
        for weight in FONTS:
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
                                # letters keep their spacing: a character is not pulled away from its neighbours
                                # onto a letter of their word (KITC HEN)
                                if (kk > 0 and abs(o2[kk] - o2[kk - 1]) > SPACING * h) or \
                                        (kk + 1 < len(o2) and abs(o2[kk + 1] - o2[kk]) > SPACING * h):
                                    continue
                                P2 = to_page_polys(loc, o2, tuple(box), w["turn"])
                                s2 = _match(P2, sdk, ox, oy, 4)
                                if s2 > score:
                                    offs, P, score = o2, P2, s2
            delta = 0.0
            P0, typ_w = P, 0.0
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
                extra = (P0, typ_w, src_w, traced_w)
        if DEBUG:
            print("type", repr(txt), None if res is None else (round(res[0], 3), res[1], "least %.3f" % res[3], "by letter" if res[4] else "word"), "marks", len(inw), "box", [round(v) for v in w["box"]], "turn", w["turn"], "conf", w["conf"])
        digits = any(ch.isdigit() for ch in txt)
        wrong_font = res is not None and SET and not any(res[1].startswith(f_) for f_ in SET)
        thick = res is not None and res[1].startswith("stroke") and src_w > PEN_SHARE * h
        if DEBUG and (wrong_font or thick):
            print("   left traced:", "fits %s better" % res[1] if wrong_font else "strokes %.2f thick for %.1f tall" % (src_w, h))
        if res is None or wrong_font or thick or res[0] < (MATCH_NUM if digits else MATCH) or \
                (res[4] and res[3] < (LEAST_JOIN if w.get("join") else LEAST)) \
                or (digits and w["conf"] < CONF_NUM):
            # (lettering in another style - a brochure's sans footer - is consistent as traced: it does not count
            # against the plan's own lettering being set whole)
            pending.append((w, inw, "other style" if wrong_font else None))
            continue
        # the reading must fit the picture better than any reading a letter away that is easily mistaken for it (3
        # for 8, 1 for 7): unless it is one of the plan's own words, such a near thing is left as traced
        if not all(part.upper().strip("()-.") in VOCAB for part in re.split(r"[/ ]", txt) if part.strip("()-.")):
            amb = _rival(txt, res, sdk, ox, oy, w["turn"])
            if DEBUG and amb:
                print("   rival", amb)
            if amb:
                pending.append((w, inw, None))
                continue
        tone = int(np.median([marks[j]["g"] for j in inw])) if inw else int(np.percentile(crop[sub > 0], 10))
        if res[1].startswith("stroke"):
            # a pen's thin strokes are mostly edge: their traced outlines' grey is far lighter than the pen; the
            # lettering's darkest pixels are its ink
            tone = int(np.percentile(crop[sub > 0], 5))
        # only the traced letters the type covers are dropped: a mark beside the word (the stem of an H read as part of
        # a door swing, BAT|) keeps its trace
        cover = cv2.dilate(_raster(res[2], ox, oy, 4, sdk.shape), np.ones((int(max(3, 1.2 * h)) | 1,) * 2, np.uint8))
        for j in list(inw):
            rs = [np.array(r_, float) for r_ in marks[j]["rings"] if len(r_) >= 3]
            mm = _raster(rs, ox, oy, 4, sdk.shape) if rs else None
            if mm is not None and mm.sum() > 0 and (mm & cover).sum() < 0.6 * mm.sum():
                inw.remove(j)
                if DEBUG:
                    print("   kept traced beside", repr(txt), [round(v) for v in boxes[j]])
        for j in inw:
            drop.add(mi[j])
        if strokes:
            for k, e_ in enumerate(strokes):
                if e_["k"] not in ("line", "arc", "dot", "path") or k in sdrop or e_.get("top"):
                    continue
                pts = _stroke_pts(e_)
                if len(pts) and pts[:, 0].min() >= bx0 - e and pts[:, 0].max() <= bx1 + e and \
                        pts[:, 1].min() >= by0 - e and pts[:, 1].max() <= by1 + e:
                    # (and only where the type covers it: a letter's stem beside the word keeps its line)
                    dense = np.vstack([pts[i] + (pts[i + 1] - pts[i]) * t_ for i in range(len(pts) - 1) for t_ in np.linspace(0, 1, 6)]) \
                        if len(pts) > 1 else pts
                    cx_ = np.clip(((dense[:, 0] - ox) * 4).astype(int), 0, cover.shape[1] - 1)
                    cy_ = np.clip(((dense[:, 1] - oy) * 4).astype(int), 0, cover.shape[0] - 1)
                    inside = ((dense[:, 0] - ox) * 4 >= 0) & ((dense[:, 0] - ox) * 4 < cover.shape[1]) & \
                        ((dense[:, 1] - oy) * 4 >= 0) & ((dense[:, 1] - oy) * 4 < cover.shape[0])
                    if (cover[cy_, cx_].astype(bool) & inside).mean() < 0.6:
                        if DEBUG:
                            print("   kept traced line beside", repr(txt), e_["k"])
                        continue
                    sdrop.add(k)
        rings = [[[round(float(a), 2), round(float(b), 2)] for a, b in P_] for P_ in res[2]]
        add.append({"rings": rings, "g": tone, "type": txt, "_pen": extra if res[1].startswith("stroke") else None})
        done.append((txt, res[1], round(res[0], 3)))
    # the redraw is for a CAD plan's single-stroke lettering: a plan with words set in the stroke font, and only words
    # no heavier than that plan's pen
    cad = [a_ for a_ in add if a_.get("_pen")]
    if ALL_SHARE > 0:
        # all or none: a plan whose lettering is only partly set keeps all of it traced (clean type beside traced
        # letters reads as two styles)
        set_letters = sum(sum(ch.isalnum() for ch in a_["type"]) for a_ in add)
        left = 0.0
        for w_, inw_, why_ in pending:
            if why_ == "other style":
                continue
            L_ = (w_["box"][2] - w_["box"][0]) if w_["turn"] == 0 else (w_["box"][3] - w_["box"][1])
            if DEBUG:
                print("   left:", repr(w_["text"]), why_, [round(v) for v in w_["box"]], "conf", w_["conf"])
            left += sum(ch.isalnum() for ch in w_["text"]) if w_["text"] else L_ / max(1.0, 0.7 * w_["h"])
        share = set_letters / max(1.0, set_letters + left)
        if DEBUG:
            print("lettering set: %d letters, left %.0f, share %.2f" % (set_letters, left, share))
        if share < ALL_SHARE:
            return polys, strokes, []
    redrawn = []
    if REDRAW and len(cad) >= 2:
        pen_px = float(np.median([a_["_pen"][2] for a_ in cad]))
        redrawn = _redraw(pending, marks, mi, boxes, drop, add, g0, paper, 1.3 * pen_px)
    if not add and not redrawn:
        return polys, strokes, []
    # a plan's lettering is one pen: words set in the stroke type share the darkest tone among them (a thin letter in a
    # small or compressed picture never reaches its pen's black)
    pen = [a_ for a_ in add if a_.get("_pen")]
    width, ink = 0.0, 0
    if pen:
        ink = min(a_["g"] for a_ in pen)
        # ... and one width: the median of the words' own (a blurred thin letter measures thinner than it is drawn,
        # and the thinnest words came out lighter than the rest)
        width = float(np.median([a_["_pen"][2] for a_ in pen]))
        if TRACED_WEIGHT:
            tw = [a_["_pen"][3] for a_ in pen if a_["_pen"][3] > 0]
            if tw:
                width = max(width, float(np.median(tw)))
        for a_ in pen:
            P0, typ_w, _, _ = a_["_pen"]
            delta = max(-0.45 * typ_w, min(0.6 * typ_w, (typ_w - width) / 2.0)) if typ_w > 0 else 0.0
            a_["g"] = ink
            a_["rings"] = [[[round(float(x), 2), round(float(y), 2)] for x, y in Q] for Q in _offset(P0, delta)]
    for a_ in add:
        a_.pop("_pen", None)
    if redrawn:
        pen_w = width if pen else float(np.median([r_["_w"] for r_ in redrawn]))
        pen_g = ink if pen else int(np.median([r_["_g"] for r_ in redrawn]))
        for r_ in redrawn:
            r_["w"], r_["g"] = round(pen_w, 2), int(pen_g)
            r_.pop("_w"); r_.pop("_g")
        strokes = list(strokes or []) + redrawn
        done += [("(redrawn)", "pen", 0.0)] * 0
    strokes = [e_ for k, e_ in enumerate(strokes)] if strokes is None else [e_ for k, e_ in enumerate(strokes) if k not in sdrop]
    return [p for i, p in enumerate(polys) if i not in drop] + add, strokes, done


def _word_choices(seen):
    """the words the plan's lettering may hold, as set: its vocabulary, run on or bracketed, and what it read elsewhere"""
    out = set(seen)
    for v in VOCAB:
        out |= {v, v + "/", v + "-", "(" + v, v + ")"}
    out |= {"AIR-CON", "W.C.", "W.C", "SCALE"}
    return sorted(t for t in out if t and not any(ch.isdigit() for ch in t))


def _refined(t, font, box, turn, sdk, ox, oy, h):
    """t set over the letters as retype() sets a reading: the box's edges, then each character, moved where the type
    fits the picture better. The best fit's score, or -1 where t cannot be set there."""
    P = placed(t, font, box, turn)
    if P is None:
        return -1.0
    score = _match(P, sdk, ox, oy, 4)
    box = list(box)
    for step in (0.5, 0.25):
        for k_ in range(4):
            for dv in (-step, step):
                b2 = list(box); b2[k_] += dv
                P2 = placed(t, font, tuple(b2), turn)
                if P2 is not None:
                    s2 = _match(P2, sdk, ox, oy, 4)
                    if s2 > score:
                        box, score = b2, s2
    loc = placed_local(t, font, tuple(box), turn)
    if loc is not None:
        offs = [0.0] * len(loc)
        lim = SHIFT_LIM * h
        for step in (0.5, 0.25):
            for kk in range(len(loc)):
                for dv in (-step, step, -2 * step, 2 * step):
                    o2 = list(offs); o2[kk] += dv
                    if abs(o2[kk]) > lim:
                        continue
                    s2 = _match(to_page_polys(loc, o2, tuple(box), turn), sdk, ox, oy, 4)
                    if s2 > score:
                        offs, score = o2, s2
    return score


def _guess(w, sdk, ox, oy, seen, join=None):
    """an unread line's word, read by matching (MATCH_READ): the plan's words and figures set in the stroke font over
    its letters, each fitted as retype() fits a reading; the best is kept where it matches well and clearly better than
    the next. None otherwise."""
    box, turn, h = w["box"], w["turn"], w["h"]
    font = "stroke"
    L = (box[2] - box[0]) if turn == 0 else (box[3] - box[1])
    quick = {}

    def score(t):
        if t not in quick:
            P = placed(t, font, box, turn)
            quick[t] = -1.0 if P is None else _match(P, sdk, ox, oy, 4)
        return quick[t]
    choices = _word_choices(seen)
    if join:
        # (r13) a word read in pieces: only the plan's words that hold the pieces, in order
        choices = [t for t in choices if re.fullmatch(join[0], t.upper().strip("()"))]
    for t in choices:
        score(t)
    # (no figures: a figure whose digit touches its dimension line is seen in part, and 2250 then fits as 1250 -
    # a wrong figure misleads, so figures are read by tesseract only)
    top = [t for v, t in sorted(((v, t) for t, v in quick.items() if v > 0), reverse=True)[:8]]
    ranked = sorted(((_refined(t, font, box, turn, sdk, ox, oy, h), t) for t in top), reverse=True)
    ranked = [(v, t) for v, t in ranked if v > 0]
    if not ranked:
        return None
    best, t = ranked[0]
    rest = [v for v, u in ranked[1:] if u.strip("()/-") != t.strip("()/-")]
    nxt = rest[0] if rest else 0.0
    need = MATCH_NUM if any(ch.isdigit() for ch in t) else MATCH
    if DEBUG:
        print("guess", [(u, round(v, 3)) for v, u in ranked[:3]], "box", [round(v) for v in box], "turn", turn,
              "join %s" % (join,) if join else "")
    if SHEET_WORD and not join and t in seen:
        # (r13) the word read elsewhere on this plan vouches for it: the plain bar, well ahead of the next
        return t if best >= need and best - nxt >= SHEET_GAP else None
    if best < need + 0.1 or best - nxt < MATCH_GAP:
        return None
    return t


def _center_paths(mask):
    """a thin shape's centre lines: its skeleton walked from end and branch points as polylines (mask's pixels)"""
    from skimage.morphology import skeletonize
    sk = skeletonize(mask > 0)
    ys, xs = np.nonzero(sk)
    pix = set(zip(xs.tolist(), ys.tolist()))
    nb = lambda p: [(p[0] + dx, p[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                    if (dx or dy) and (p[0] + dx, p[1] + dy) in pix]
    nodes = {p for p in pix if len(nb(p)) != 2}
    seen, out = set(), []

    def walk(a, b):
        path = [a, b]; seen.add(frozenset((a, b)))
        while path[-1] not in nodes:
            nxt = [q for q in nb(path[-1]) if frozenset((path[-1], q)) not in seen and q != path[-2]]
            if not nxt:
                break
            nxt.sort(key=lambda q: abs(q[0] - path[-1][0]) + abs(q[1] - path[-1][1]))
            seen.add(frozenset((path[-1], nxt[0]))); path.append(nxt[0])
        return path
    for a in nodes:
        for b in nb(a):
            if frozenset((a, b)) not in seen:
                out.append(walk(a, b))
    rest = {p for p in pix if all(frozenset((p, q)) not in seen for q in nb(p))}
    while rest:
        a = rest.pop(); n_ = nb(a)
        if not n_:
            continue
        path = walk(a, n_[0]); out.append(path + [a]); rest -= set(path)
    return out


def _redraw(pending, marks, mi, boxes, drop, add, g0, paper, max_sw=1e9):
    """(stage 1) lettering that was not retyped, redrawn as clean pen strokes along its letters: the picture's own
    letters there (whole where the traced outlines broke), letter-sized pieces only, reduced to their centre lines,
    each line the fewest straight runs within a third of a pixel. Width and tone are set afterwards (the plan's
    lettering pen). Returns the strokes; the word's traced letters are dropped."""
    out = []
    K = 4.0
    H, W = g0.shape
    for w, inw, _ in pending:
        h = w["h"]
        bx0, by0, bx1, by1 = w["box"]
        e = 0.15 * h + 1
        x0, y0 = int(max(0, math.floor(bx0 - e))), int(max(0, math.floor(by0 - e)))
        x1, y1 = int(min(W, math.ceil(bx1 + e))), int(min(H, math.ceil(by1 + e)))
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        dk = cv2.resize(_dark(g0[y0:y1, x0:x1], paper), None, fx=K, fy=K, interpolation=cv2.INTER_CUBIC)
        if dk.max() <= 0:
            continue
        m = (dk > REDRAW_T * dk.max()).astype(np.uint8)
        # letter-sized pieces: not a dimension line or a door swing running through the word's box
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        keep = np.zeros_like(m)
        for i in range(1, n):
            ww, hh = st[i, 2] / K, st[i, 3] / K
            if hh <= 1.5 * h and ww <= 3.0 * h and st[i, 4] >= 2 * K * K:
                keep[lab == i] = 1
        if not keep.any():
            continue
        dist = cv2.distanceTransform(keep, cv2.DIST_L2, 3)
        paths = _center_paths(keep)
        if not paths:
            continue
        sw = 2.0 * float(np.median([dist[y, x] for P in paths for x, y in P])) / K
        if sw > 0.22 * h or sw > max_sw:         # a bold or outline lettering: not a pen's single strokes
            continue
        drawn, mine = 0, []
        for P in paths:
            if len(P) < 2:
                continue
            arr = np.array(P, np.float32).reshape(-1, 1, 2)
            ap = cv2.approxPolyDP(arr, K / 3.0, False).reshape(-1, 2)
            pts = [[round((float(x) + 0.5) / K - 0.5 + x0, 2), round((float(y) + 0.5) / K - 0.5 + y0, 2)] for x, y in ap]
            if sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])) < 0.12 * h:
                continue
            mine.append({"k": "path", "parts": [["L", a, b] for a, b in zip(pts, pts[1:])], "closed": False,
                         "_w": sw, "_g": int(np.percentile(g0[y0:y1, x0:x1], 5))})
            drawn += 1
        # kept only where it is closer to the picture than the word's traced letters are ("only better")
        letters = [j for j in inw if mi[j] not in drop and boxes[j][3] - boxes[j][1] <= 1.5 * h and boxes[j][2] - boxes[j][0] <= 3.0 * h]
        tm = np.zeros(dk.shape, np.uint8)
        rings = [np.round((np.array(r, float) - [x0 - 0.5 + 0.5 / K, y0 - 0.5 + 0.5 / K]) * K * 16).astype(np.int32)
                 for j in letters for r in marks[j]["rings"] if len(r) >= 3]
        if rings:
            cv2.fillPoly(tm, rings, 1, cv2.LINE_AA, shift=4)
        rm = np.zeros(dk.shape, np.uint8)
        for P in paths:
            if len(P) >= 2:
                cv2.polylines(rm, [np.array(P, np.int32)], False, 1, max(1, int(round(sw * K))), cv2.LINE_AA)
        blur = lambda a_: cv2.GaussianBlur(a_.astype(np.float32), (0, 0), 0.6 * K)
        pic = blur(dk)
        s_trace, s_redraw = _corr(blur(tm), pic), _corr(blur(rm), pic)
        if DEBUG:
            print("   redraw %.3f against traced %.3f" % (s_redraw, s_trace))
        if s_redraw < s_trace + REDRAW_GAIN:
            continue
        out += mine
        if drawn:
            for j in inw:
                if mi[j] not in drop and boxes[j][3] - boxes[j][1] <= 1.5 * h and boxes[j][2] - boxes[j][0] <= 3.0 * h:
                    drop.add(mi[j])
        if DEBUG:
            print("redrawn", repr(w["text"]), "paths", drawn, "stroke %.2f" % sw, [round(v) for v in w["box"]])
    return out


CONFUSED = {"0": "8698DO", "1": "7Il", "2": "7Z", "3": "859", "4": "9A", "5": "63S", "6": "5809G", "7": "12",
            "8": "30695B", "9": "8406", "B": "8ER", "E": "FB", "F": "EP", "O": "0DQC", "D": "O0", "C": "GO", "G": "C6",
            "I": "1L", "L": "I", "S": "5", "Z": "2", "A": "4", "P": "RF", "R": "PB", "M": "N", "N": "MH", "H": "N",
            "U": "V", "V": "U"}


def _rival(txt, res, sdk, ox, oy, turn, margin=0.015):
    """a reading one letter from txt, easily mistaken for it, that fits the picture as well (within margin): or None"""
    own, weight, _, _, _, box, offs, delta = res
    for k, ch in enumerate(txt):
        for alt in CONFUSED.get(ch, ""):
            # a rival keeps its kind: a figure's digit against digits, a word's letter against letters (0 and O are
            # one shape in a pen's lettering; 54O0 is no reading of a dimension)
            if ch.isdigit() != alt.isdigit():
                continue
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
