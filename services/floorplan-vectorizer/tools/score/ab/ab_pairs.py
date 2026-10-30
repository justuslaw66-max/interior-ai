#!/usr/bin/env python3
"""Blind A/B packs: two runs of the clean drawing against the original, for graders who never learn which run is which
(rebuilt 30 Oct 2026 from the r8 mkpairs.py of 24 Oct, generalised).

    python3 ab_pairs.py --list=list80.txt --originals=<dir> --run1=<dir> --run2=<dir> --names=r12,r13d \
        --out=<dir> [--graders=8] [--per=10] [--seed=20261030] [--sealed=a,b]

<dir>/<id>.png in each folder (the original page as the app reads or renders it, and each run's drawing drawn by
ab_render.py at the same size). Every page goes to one grader; each grader gets --per pages; for each page the order
of the two runs is drawn at random from the seed. Each pack holds, per item, item_<n>_full.png, item_<n>_left.png and
item_<n>_right.png (the plan's ink box and its two halves, ORIGINAL | A | B), and the key goes to <out>/key.json -
never into a grader's folder. Sealed plans (--sealed) are refused. Give each grader prompt.md and its folder only.
"""
import argparse
import json
import os
import random
import sys

import cv2
import numpy as np


def ink_box(g):
    ink = (g < 200).astype(np.uint8)
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    ys, xs = np.nonzero(ink)
    H, W = g.shape
    if not len(xs):
        return 0, 0, W, H
    x0, x1 = max(0, int(np.percentile(xs, 0.5)) - 15), min(W, int(np.percentile(xs, 99.5)) + 15)
    y0, y1 = max(0, int(np.percentile(ys, 0.5)) - 15), min(H, int(np.percentile(ys, 99.5)) + 15)
    return x0, y0, x1, y1


def panel(images, box, width=640):
    x0, y0, x1, y1 = box
    s = width / max(1, x1 - x0)
    tiles = []
    for im in images:
        crop = im[y0:y1, x0:x1]
        tiles.append(cv2.resize(crop, (width, max(1, int((y1 - y0) * s))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC))
    gap = np.full((tiles[0].shape[0], 6), 128, np.uint8)
    row = np.hstack([tiles[0], gap, tiles[1], gap, tiles[2]])
    band = np.full((40, row.shape[1]), 255, np.uint8)
    for i, t in enumerate(["ORIGINAL", "A", "B"]):
        cv2.putText(band, t, (i * (width + 6) + 10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2, cv2.LINE_AA)
    return np.vstack([band, row])


def main():
    ap = argparse.ArgumentParser()
    for k in ("list", "originals", "run1", "run2", "names", "out"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--graders", type=int, default=8)
    ap.add_argument("--per", type=int, default=10)
    ap.add_argument("--seed", type=int, default=20261030)
    ap.add_argument("--sealed", default="")
    a = ap.parse_args()
    ids = [l.strip() for l in open(a.list) if l.strip() and not l.startswith("#")]
    sealed = set(a.sealed.split(",")) & set(ids)
    if sealed:
        sys.exit("refused: sealed plans in the list: " + ",".join(sorted(sealed)))
    n1, n2 = a.names.split(",")
    rng = random.Random(a.seed)
    order = ids[:]
    rng.shuffle(order)
    key = {}
    for gk in range(a.graders):
        part = order[gk * a.per:(gk + 1) * a.per]
        if not part:
            break
        gdir = os.path.join(a.out, f"g{gk + 1}")
        os.makedirs(gdir, exist_ok=True)
        for n, pid in enumerate(part, 1):
            g = cv2.imread(os.path.join(a.originals, pid + ".png"), cv2.IMREAD_GRAYSCALE)
            r1 = cv2.imread(os.path.join(a.run1, pid + ".png"), cv2.IMREAD_GRAYSCALE)
            r2 = cv2.imread(os.path.join(a.run2, pid + ".png"), cv2.IMREAD_GRAYSCALE)
            if g is None or r1 is None or r2 is None:
                print("missing a picture for", pid)
                continue
            r1 = cv2.resize(r1, (g.shape[1], g.shape[0])) if r1.shape != g.shape else r1
            r2 = cv2.resize(r2, (g.shape[1], g.shape[0])) if r2.shape != g.shape else r2
            first_is_1 = rng.random() < 0.5
            A, B = (r1, r2) if first_is_1 else (r2, r1)
            key[f"g{gk + 1}/item_{n}"] = {"id": pid, "A": n1 if first_is_1 else n2, "B": n2 if first_is_1 else n1}
            x0, y0, x1, y1 = ink_box(g)
            xm = (x0 + x1) // 2
            cv2.imwrite(os.path.join(gdir, f"item_{n}_full.png"), panel([g, A, B], (x0, y0, x1, y1)))
            cv2.imwrite(os.path.join(gdir, f"item_{n}_left.png"), panel([g, A, B], (x0, y0, min(x1, xm + 10), y1)))
            cv2.imwrite(os.path.join(gdir, f"item_{n}_right.png"), panel([g, A, B], (max(x0, xm - 10), y0, x1, y1)))
    json.dump(key, open(os.path.join(a.out, "key.json"), "w"), indent=1)
    print(len(key), "pairs in", a.out)


if __name__ == "__main__":
    main()
