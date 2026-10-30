#!/usr/bin/env python3
"""Decode the graders' replies with the key (rebuilt 30 Oct 2026 from collect_pairs.py).

    python3 ab_tally.py --key=<out>/key.json --replies=<dir of g*.json> [--groups=groups.json] [--json=result.json]

A reply is {"grader": "g1", "items": [{"item": 1, "better": "A"|"B"|"same", "margin": "clear"|"slight", ...}]}.
Prints, per run: pages it was better on (clear in brackets), and the same; by group when --groups maps id -> group
(else: s-plans "web", pages with "_p" "brochure", the rest "dev and HDB").
"""
import argparse
import collections
import glob
import json


def group_of(pid, groups):
    if groups:
        return groups.get(pid, "other")
    if pid.startswith("s0"):
        return "web"
    if "_p" in pid:
        return "brochure"
    return "dev and HDB"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True)
    ap.add_argument("--replies", required=True)
    ap.add_argument("--groups", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    key = json.load(open(a.key))
    groups = json.load(open(a.groups)) if a.groups else {}
    per = {}
    for f in sorted(glob.glob(a.replies.rstrip("/") + "/g*.json")):
        rep = json.load(open(f))
        g = rep["grader"]
        for it in rep["items"]:
            k = key.get(f"{g}/item_{it['item']}")
            if not k:
                continue
            win = "same" if it["better"] == "same" else k[it["better"]]
            per[k["id"]] = {"win": win, "margin": it.get("margin"), "why": it.get("why", ""),
                            "defects": {k["A"]: it.get("a_defects", ""), k["B"]: it.get("b_defects", "")}}
    runs = sorted({v for k in key.values() for v in (k["A"], k["B"])})
    tot = collections.Counter(v["win"] for v in per.values())
    clear = collections.Counter(v["win"] for v in per.values() if v["margin"] == "clear")
    print(f"{len(per)} pages graded of {len(key)}")
    print("  " + ", ".join(f"{r} better {tot[r]} ({clear[r]} clearly)" for r in runs) + f", same {tot['same']}")
    by = collections.defaultdict(collections.Counter)
    for pid, v in per.items():
        by[group_of(pid, groups)][v["win"]] += 1
    for grp, c in sorted(by.items()):
        print(f"  {grp}: " + ", ".join(f"{r} {c[r]}" for r in runs) + f", same {c['same']}")
    for r in runs:
        print(f"{r} better on: " + " ".join(sorted(p for p, v in per.items() if v["win"] == r)))
    if a.json:
        json.dump(per, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
