#!/usr/bin/env python3
"""Draw the app's document over the plan, to check corrections.py's counts by eye (score harness; rebuilt 30 Oct 2026).

    python3 docpic.py --docs=<document-from-evidence.json> --plan=<id> --image=<plan image> --out=<png> \
        [--corr=<corrections.json>]

Rooms are tinted, outlined and named as the app names them (void rooms hatched grey); doors red, doorways green,
windows blue, each a dot at its middle with a short bar. With --corr the plan's corrections are listed in a band
below the picture. Refuses a sealed plan given with --sealed.
"""
import argparse
import json
import sys

import cv2
import numpy as np

PALETTE = [(255, 179, 102), (153, 230, 153), (255, 204, 229), (179, 179, 255), (255, 255, 153), (204, 153, 255),
           (153, 255, 255), (255, 153, 153), (204, 255, 153), (230, 204, 179)]
OPEN_COLOUR = {"door": (0, 0, 220), "gate": (0, 0, 220), "open_passage": (0, 170, 0), "window": (220, 90, 0)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--corr", default="")
    ap.add_argument("--sealed", default="")
    a = ap.parse_args()
    if a.plan in a.sealed.split(","):
        sys.exit("refused: sealed plan")
    doc = next(d for d in json.load(open(a.docs)) if d["file"].replace(".evidence.json", "") == a.plan)
    img = cv2.imread(a.image, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit("cannot read " + a.image)
    h, w = img.shape[:2]
    base = cv2.addWeighted(img, 0.55, np.full_like(img, 255), 0.45, 0)
    tint = base.copy()
    for k, r in enumerate(doc.get("rooms", [])):
        pts = np.array(r["outlinePx"], np.int32)
        if len(pts) < 3:
            continue
        if r["void"]:
            cv2.fillPoly(tint, [pts], (200, 200, 200))
        else:
            cv2.fillPoly(tint, [pts], PALETTE[k % len(PALETTE)])
    out = cv2.addWeighted(tint, 0.45, base, 0.55, 0)
    lw = max(1, round(min(h, w) / 600))
    for k, r in enumerate(doc.get("rooms", [])):
        pts = np.array(r["outlinePx"], np.int32)
        if len(pts) < 3:
            continue
        cv2.polylines(out, [pts], True, (60, 60, 60), lw)
        m = cv2.moments(pts)
        cx, cy = (m["m10"] / m["m00"], m["m01"] / m["m00"]) if m["m00"] else pts.mean(axis=0)
        label = r["name"] or "(void)"
        fs = max(0.35, min(h, w) / 1800)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)
        org = (int(cx - tw / 2), int(cy + th / 2))
        cv2.rectangle(out, (org[0] - 2, org[1] - th - 3), (org[0] + tw + 2, org[1] + 3), (255, 255, 255), -1)
        cv2.putText(out, label, org, cv2.FONT_HERSHEY_SIMPLEX, fs, (20, 20, 20), 1, cv2.LINE_AA)
    for o in doc.get("openings", []):
        col = OPEN_COLOUR.get(o["kind"], (120, 0, 120))
        x, y = int(o["midPx"][0]), int(o["midPx"][1])
        cv2.circle(out, (x, y), 3 * lw + 2, col, -1)
    if a.corr:
        c = json.load(open(a.corr)).get(a.plan, {})
        lines = [f"{a.plan}: {c.get('total')} corrections (strict {c.get('strict')}); scale "
                 f"{doc['scale']['basis']} {doc['scale']['mmPerPx']:.2f} mm/px"]
        lines += ["  " + " ".join(str(x) for x in item)[:150] for item in c.get("detail", [])]
        band = np.full((22 * len(lines) + 10, w, 3), 255, np.uint8)
        for i, t in enumerate(lines):
            cv2.putText(band, t, (8, 20 + 22 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        out = np.vstack([out, band])
    cv2.imwrite(a.out, out)
    print(a.out)


if __name__ == "__main__":
    main()
