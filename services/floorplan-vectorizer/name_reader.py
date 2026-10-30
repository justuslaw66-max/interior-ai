"""name_reader.py <page image> <stage-1 model.json> [--readings=<json>] [--dump=<json>]: room names read a second time,
by a learned reader, where stage 1 left them unread or misread (beta step 2.2, ML-1; built 30 Oct 2026 from the test of
18 Oct, claude/ocr-reader-test-2026-10-18.md: corrections 693 -> 623, renames 72 -> 37 on 74 development plans).

The reader is RapidOCR (PP-OCR detection and recognition on ONNX Runtime, Apache-2.0). Its model files come inside its
package, installed into the worker image; nothing is fetched at run time. It reads the page as it came, at its own size
and at twice it, and only room names are kept. The model JSON is rewritten in place, before the exporter reads it (the
round-41 plain reading beside it, <model>.plain.json, too):

- the two sizes' readings together, one per place (the surer), score 0.8 or more, and a room name: a room type or room
  word of the exporter's (app_evidence.ROOM_TYPES / ROOM_WORDS), nothing of NOT_ROOM;
- left out: notes and captions (over 26 characters, over 3 words, a comma or colon, BUILT / BEAMS / INCLUSIVE /
  APARTMENT / FLAT / IMPROVED / STANDARD ...), the flat's type ("4 Room", "3-Bedroom", "5Room") and non-room labels
  (DUCT, RISER, SHAFT, PIPE);
- the reader's box is tightened to the ink inside it (the detector pads round the letters);
- a reading collides with a stage-1 text when they overlap by 30 % or more of the smaller box. It is added as a text
  where it collides with none; where it collides with one stage-1 text that is no room name, it corrects that reading's
  spelling (BEL200M -> BEDROOM, BATE -> BATH, ITCH: -> KITCHEN), stage 1's box and letter height kept (they join a
  name's lines); otherwise stage 1's reading stands.

--readings gives readings already made (a list of {"text", "score", "box": [[x, y] x 4], "scale": 1|2}, source px at
that scale), so the merge can be run and tested without the reader. --dump writes the readings made. Fails soft: any
error leaves the model as stage 1 wrote it, and prints why. The model gains "name_reader": {"added", "replaced", ...}.
"""
import json
import math
import os
import re
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app_evidence import NOT_ROOM, ROOM_TYPES, ROOM_WORDS, ToSource  # noqa: E402

MIN_SCORE = float(os.environ.get("FV_NAME_READER_MIN_SCORE", "0.8"))
COLLIDE = 0.30                     # share of the smaller box two boxes must overlap by to be one place
CAPTION_WORDS = ("BUILT", "BEAMS", "INCLUSIVE", "APARTMENT", "FLAT", "IMPROVED", "STANDARD", "APPROX", "AREA", "SQM",
                 "SQFT", "SQ.M", "SQ.FT", "SCALE", "TYPE", "MODEL", "BLK", "BLOCK", "STOREY", "STY", "LEVEL", "FLOOR PLAN")
NOT_NAMES = ("DUCT", "RISER", "SHAFT", "PIPE", "REFUSE", "CHUTE")
FLAT_TYPE = re.compile(r"^\s*\d\s*[- ]?\s*(ROOM|RM|BEDROOM|BR|BED)S?\b", re.I)
# A short word of a reading (4 letters or fewer) must be one of these, or several run together (a 0 between letters read
# as O): a reader's slip on a small web plan is still room-like ("MAN BEDROOM", "LNNG ROOM", "DNNG ROOM" on s080, where
# the I's vanish) and named the wrong room.
WORDS = set("""
BEDROOM BEDROOMS BED ROOM ROOMS RM BR BDRM MBR MASTER MAIN JUNIOR JR COMMON GUEST FAMILY LIVING DINING KITCHEN KITCHENETTE
PANTRY DRY WET BATH BATHROOM WC TOILET POWDER SHOWER LAVATORY ENSUITE EN SUITE STUDY OFFICE LOUNGE SITTING HALL LOBBY
FOYER ENTRANCE CORRIDOR PASSAGE WARDROBE WALK IN DRESSING STORE STOREROOM UTILITY SERVICE YARD LAUNDRY MAID MAIDS HELPER
BALCONY TERRACE PATIO PES PLANTER LEDGE AIR CON AIRCON AC HOUSE HOLD HOUSEHOLD SHELTER HS BOMB ACCESS VOID AREA SPACE
OPEN PRIVATE ENCLOSED ROOF GARDEN POOL DECK MULTI PURPOSE PRAYER PLAY READING GYM CLOSET FLEX RC APT
""".split())


def known_words(w):
    """w is room words run together (MAINBEDROOM, ACCESSBALCONY, ACLEDGE: the reader often drops the space)"""
    ok = [True] + [False] * len(w)
    for i in range(1, len(w) + 1):
        ok[i] = any(ok[j] and w[j:i] in WORDS for j in range(max(0, i - 12), i - 1))
    return ok[-1]


def short_slip(w):
    """a short word (4 letters or fewer) that is no room word, nor one with a stray last letter (WCi): MAN, DNNG, LNNG.
    A longer misread word (BEDROCM, LIMING) is left to the exporter's own spelling fixes, as stage 1's are"""
    return 1 < len(w) <= 4 and not known_words(w) and not known_words(w[:-1])


def is_room_name(text):
    """a room name as the exporter knows them (a room type or room word), not a note, caption, flat type or service"""
    u = text.upper().strip()
    if not u or len(u) > 26 or len(u.split()) > 3 or "," in u or ":" in u or u.startswith("("):
        return False                                   # (and a qualifier in brackets: "(CORRIDOR)", "(POINT BLOCK)")
    if FLAT_TYPE.match(u) or re.match(r"^\d+\s*ROOM$", u.replace("-", " ")):
        return False
    if any(w in u for w in CAPTION_WORDS) or any(re.search(r"\b%s\b" % re.escape(w), u) for w in NOT_ROOM):
        return False
    if any(w in u for w in NOT_NAMES):
        return False
    if any(short_slip(w) for w in re.findall(r"[A-Z]+", re.sub(r"(?<=[A-Z])0|0(?=[A-Z])", "O", u))):
        return False                                   # (a slip: a short word no room name has)
    if any(any(k in u for k in keys) for _, keys in ROOM_TYPES):
        return True
    return any(re.search(r"(^|[^A-Z])%s([^A-Z]|$)" % re.escape(w), u) for w in ROOM_WORDS)


# ----------------------------------------------------------------------------------------------- coordinates
class FromSource:
    """source-image pixels -> stage 1's working pixels: the inverse of app_evidence.ToSource"""

    def __init__(self, m):
        self.t = ToSource(m)
        Hp = m.get("page_homography")
        self.Hp = np.array(Hp, dtype=np.float64) if Hp else None

    def __call__(self, x, y):
        t = self.t
        x, y = x * t.pre, y * t.pre
        if self.Hp is not None:
            q = self.Hp @ np.array([x, y, 1.0])
            x, y = float(q[0] / q[2]), float(q[1] / q[2])
        else:
            dx, dy = x - t.cx, y - t.cy
            x, y = t.cx + t.a * dx + t.b * dy, t.cy - t.b * dx + t.a * dy
        return [(x - t.ox) * t.ws, (y - t.oy) * t.ws]


# ----------------------------------------------------------------------------------------------- reading
def read_page(path):
    """RapidOCR at the page's own size and twice it: [{"text", "score", "box", "scale"}], boxes in source px"""
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("unreadable picture")
    out = []
    for scale in (1, 2):
        im = img if scale == 1 else cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        result, _ = engine(im)
        for box, text, score in result or []:
            out.append({"text": str(text), "score": float(score), "scale": scale,
                        "box": [[float(p[0]) / scale, float(p[1]) / scale] for p in box]})
    return out


def ink_box(gray, x0, y0, x1, y1, pad=1):
    """(x0, y0, x1, y1) tightened to the ink inside it (the detector pads round the letters); None when it holds none"""
    H, W = gray.shape
    X0, Y0, X1, Y1 = max(0, int(math.floor(x0))), max(0, int(math.floor(y0))), min(W, int(math.ceil(x1))), min(H, int(math.ceil(y1)))
    if X1 <= X0 or Y1 <= Y0:
        return None
    sub = gray[Y0:Y1, X0:X1]
    paper = float(np.percentile(sub, 90))
    ink = sub < min(paper - 40, 170)
    if not ink.any():
        return None
    ys, xs = np.nonzero(ink)
    return [X0 + max(0, xs.min() - pad), Y0 + max(0, ys.min() - pad), X0 + min(sub.shape[1], xs.max() + 1 + pad),
            Y0 + min(sub.shape[0], ys.max() + 1 + pad)]


def overlap_share(a, b):
    """overlap of two (x0, y0, x1, y1) boxes as a share of the smaller"""
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    sa = (a[2] - a[0]) * (a[3] - a[1])
    sb = (b[2] - b[0]) * (b[3] - b[1])
    return w * h / max(1e-9, min(sa, sb))


def one_per_place(readings):
    """the two sizes' readings together, one per place: the surer"""
    keep = []
    for r in sorted(readings, key=lambda r: -r["score"]):
        if any(overlap_share(r["_src"], k["_src"]) >= COLLIDE for k in keep):
            continue
        keep.append(r)
    return keep


def text_box(t):
    """a stage-1 text's lettering box (x0, y0, x1, y1), working px"""
    if t.get("ink"):
        return [float(v) for v in t["ink"]]
    x, y, w, h = t["box"]
    return [x, y, x + w, y + h]


def merge(m, readings, gray):
    """the readings into the model's texts (in place); returns the report"""
    rep = {"readings": len(readings), "kept": 0, "added": [], "replaced": [], "stood": 0}
    to_work = FromSource(m)
    cand = []
    for r in readings:
        text = re.sub(r"\s+", " ", r["text"]).strip()
        if r["score"] < MIN_SCORE or not is_room_name(text):
            continue
        xs = [p[0] for p in r["box"]]
        ys = [p[1] for p in r["box"]]
        if (max(ys) - min(ys)) > 1.5 * (max(xs) - min(xs)):
            continue                                  # (lettering set upright: stage 1 reads it; not merged here)
        tight = ink_box(gray, min(xs), min(ys), max(xs), max(ys))
        if tight is None:
            continue
        cand.append(dict(r, text=text, _src=tight))
    cand = one_per_place(cand)
    rep["kept"] = len(cand)
    texts = m.setdefault("texts", [])
    for r in cand:
        x0, y0, x1, y1 = r["_src"]
        corners = [to_work(x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        wx0, wy0 = min(c[0] for c in corners), min(c[1] for c in corners)
        wx1, wy1 = max(c[0] for c in corners), max(c[1] for c in corners)
        wb = [wx0, wy0, wx1, wy1]
        hits = [i for i, t in enumerate(texts) if overlap_share(wb, text_box(t)) >= COLLIDE]
        rec = {"s": r["text"], "box": [round(wx0, 1), round(wy0, 1), round(wx1 - wx0, 1), round(wy1 - wy0, 1)],
               "vertical": False, "conf": round(100.0 * r["score"], 1), "source_res": True,
               "ink": [round(wx0, 1), round(wy0, 1), round(wx1, 1), round(wy1, 1)], "cap_px": round(wy1 - wy0, 1),
               "reader": "rapidocr"}
        if not hits:
            texts.append(rec)
            rep["added"].append(r["text"])
        elif len(hits) == 1 and not is_room_name(texts[hits[0]].get("s") or ""):
            # only the spelling: stage 1's box, letter height and place stand (they join a name's lines - SERVICE over
            # YARD - and the reader's box is taller: s004's SERVICE read 34 px high against stage 1's 22 lost the join)
            old_ = texts[hits[0]]
            rep["replaced"].append([old_.get("s"), r["text"]])
            texts[hits[0]] = dict(old_, s=r["text"], conf=rec["conf"], reader="rapidocr", read_as=old_.get("s"))
        else:
            rep["stood"] += 1
    return rep


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opt = dict(a[2:].split("=", 1) for a in argv if a.startswith("--") and "=" in a)
    page, model_path = args[0], args[1]
    try:
        if opt.get("readings"):
            with open(opt["readings"]) as f:
                readings = json.load(f)
        else:
            readings = read_page(page)
        if opt.get("dump"):
            with open(opt["dump"], "w") as f:
                json.dump(readings, f)
        gray = cv2.imread(page, cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise ValueError("unreadable picture")
        if os.environ.get("FV_INVERT_DARK", "0") == "1":
            import floorplan_vectorize as fv                   # (a page stage 1 read turned over: its ink is light)
            light_on_dark = getattr(fv, "light_on_dark", None)
            if light_on_dark is not None and light_on_dark(gray):
                gray = 255 - gray
        reports = {}
        paths = [model_path] + ([model_path[:-5] + ".plain.json"] if model_path.endswith(".json") else [])
        for path in paths:
            if not os.path.exists(path):
                continue
            with open(path) as f:
                m = json.load(f)
            rep = merge(m, readings, gray)
            m["name_reader"] = {"added": len(rep["added"]), "replaced": len(rep["replaced"]), "kept": rep["kept"],
                                "readings": rep["readings"]}
            with open(path + ".tmp", "w") as f:
                json.dump(m, f)
            os.replace(path + ".tmp", path)
            reports[os.path.basename(path)] = rep
        print("name reader: " + "; ".join("%s +%d, %d replaced" % (k, len(v["added"]), len(v["replaced"])) for k, v in reports.items()))
    except Exception as cause:                                   # the exporter reads stage 1's model as it was
        print("name reader not used: %s" % (str(cause)[:200] or type(cause).__name__))


if __name__ == "__main__":
    main(sys.argv[1:])
