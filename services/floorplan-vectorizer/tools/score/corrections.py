#!/usr/bin/env python3
"""Corrections per plan: the edits a user makes in the import review step before the plan is right (score harness,
step 2 of 2; rebuilt 30 Oct 2026 from the description in claude/real-plan-check-2026-10-17.md).

    python3 corrections.py --docs=<document-from-evidence.json> --ev=<dir of <plan>.evidence.json> \
        --truth=<dir>[,<dir>...] [--plans=a,b] [--sealed=a,b] [--json=out.json] [-v]

Reads the summaries document-from-evidence.ts writes (the FloorPlanDocumentV2 the app builds from each evidence file)
and the room truth files (<plan>.rooms.txt, the grammar in tools/truth-rooms/README.md). For each plan it counts:

  rooms     draw    a truth space no app room holds
            split   k truth spaces in one app room = k - 1
            join    one truth space spread over k app rooms = k - 1
            rename  a misread name (WAN BEDROOM) or a name not read (Room 5): a leftover app room paired with a
                    leftover truth space by name similarity, then by agreeing doors, then by count; also a room that
                    holds its space's label but shows another name
            delete  an app room left over that holds no truth space (one is excused per unlabelled truth space)
  doors     add     a truth door or doorway not found between the right two rooms (a door of a space still to draw or
                    split counts too); found as a door or a doorway either way
            delete  an app door between two rooms given truth spaces (or one and the outside) that no truth door or
                    doorway excuses (roomscore.py's false door; a doorway left over is counted in "strict" only)
  windows   add     per truth space (or group of spaces sharing app rooms): truth count minus app windows, if positive
            delete  an app window between two indoor rooms
  scale     set     the app solved no scale, or only assumed one (door-width estimate)

"strict" adds: a truth door read as a doorway, a doorway no truth door excuses, app windows beyond the truth's count, and
a rename where the names differ only in a number or punctuation (counted in the main total as no correction).

Left out: voids (the app's void rooms; truth voids are not typed) and the doors and windows of spaces the truth leaves
unlabelled ("(unlabelled corridor)"): they cannot be checked.

Choices the description leaves open (made here so the score is the reviewer's best case):
  - Spaces sharing a printed label (two BEDROOMs): the rooms holding it are given to those spaces in whichever order
    needs the fewest corrections.
  - A truth door to a space still to draw is found by an app door from the other room to the outside (the wall the drawn
    room will lie against), so it is not counted twice.
Sealed plans (--sealed) print numbers only, never names.
"""
import argparse
import difflib
import itertools
import json
import os
import re
import statistics
import sys

OUT = "OUTSIDE"
OUTDOOR = re.compile(r"BALCONY|YARD|LEDGE|PES\b|TERRACE|PLANTER|ROOF|PATIO|GARDEN|AIR ?-?CON|A/?C\b|POOL|DECK|BAY")
GENERIC = re.compile(r"^(ROOM \d+)?$", re.I)
KINDS = ["draw", "split", "join", "rename", "delete", "door_add", "door_delete", "window_add", "window_delete", "scale"]
STRICT = ["doorway_for_door", "extra_doorways", "extra_windows", "rename_number_only"]


def norm(s):
    s = re.sub(r"\([^)]*\)", "", s.upper())
    return re.sub(r"[^A-Z0-9]", "", s)


def norm_loose(s):
    return re.sub(r"[^A-Z]", "", re.sub(r"\([^)]*\)", "", s.upper()))


# ----------------------------------------------------------------------------------------------------- truth
def read_truth(path):
    spaces, doors, windows = [], [], []
    for ln in open(path, encoding="utf-8"):
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        key, _, val = ln.partition(":")
        key, val = key.strip(), val.strip()
        if key == "space":
            parts = [v.strip() for v in val.split("+")]
            labels = [norm(p) for p in parts if not p.startswith("(") and norm(p)]
            spaces.append({"raw": val, "first_raw": parts[0], "labels": labels, "unlabelled": not labels,
                           "outdoor": bool(OUTDOOR.search(val.upper()))})
        elif key in ("door", "gap"):
            a, _, b = val.partition("|")
            doors.append((a.strip(), b.strip(), key))
        elif key == "windows":
            a, _, n = val.rpartition("=")
            windows.append((a.strip(), int(n)))
    return spaces, doors, windows


def resolve(spaces, name):
    """indices of the spaces a door / windows line means (several when spaces share a printed label); OUT; or None"""
    if name.upper() == OUT:
        return OUT
    if name.startswith("("):
        hit = [i for i, s in enumerate(spaces) if s["first_raw"] == name]
        return hit or None
    exact = [i for i, s in enumerate(spaces) if s["first_raw"] == name]
    if exact:
        return exact
    n = norm(name)
    hit = [i for i, s in enumerate(spaces) if s["labels"] and s["labels"][0] == n]
    if not hit:
        nl = norm_loose(name)
        hit = [i for i, s in enumerate(spaces) if s["labels"] and norm_loose(s["first_raw"]) == nl]
    return hit or None


# ----------------------------------------------------------------------------------------------------- app side
def inside(pt, poly):
    x, y = pt
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            c = not c
    return c


def match_label(raw, truth_labels):
    """the truth labels one printed / exported label stands for (roomscore.py's containment rule)"""
    n = norm(raw)
    if not n:
        return []
    if n in truth_labels:
        return [n]
    within = [t for t in truth_labels if t and t in n]
    within = [t for t in within if not any(t != u and t in u for u in within)]
    around = [t for t in truth_labels if t and n in t]
    return within or (around if len(around) == 1 else [])


def app_rooms(doc, ev, truth_labels):
    W, H = ev["page"]["widthPx"], ev["page"]["heightPx"]
    printed = [(l.get("label") or l.get("rawText") or "", (l["centerXRatio"] * W, l["centerYRatio"] * H))
               for l in ev.get("semantics", {}).get("roomLabels", []) if float(l.get("confidence", 1)) >= 0.45]
    rooms = []
    for r in doc["rooms"]:
        if r["void"]:
            continue
        held = set()
        texts = [] if GENERIC.match(r["name"].strip()) else [r["name"]]
        texts += [t for t, at in printed if len(r["outlinePx"]) >= 3 and inside(at, r["outlinePx"])]
        for t in texts:
            held.update(match_label(t, truth_labels))
        rooms.append({"id": r["id"], "name": r["name"], "held": held, "generic": bool(GENERIC.match(r["name"].strip()))})
    return rooms


# ----------------------------------------------------------------------------------------------------- matching
def max_matching(cands):
    """cands: {left: [right...]} -> {left: right}, a maximum bipartite matching (augmenting paths)"""
    owner = {}

    def try_(u, seen):
        for v in cands[u]:
            if v in seen:
                continue
            seen.add(v)
            if v not in owner or try_(owner[v], seen):
                owner[v] = u
                return True
        return False

    for u in cands:
        try_(u, set())
    return {u: v for v, u in owner.items()}


def evaluate(spaces, doors, windows, rooms, openings, assign_dup):
    """count every correction for one way of giving duplicate-label rooms to their spaces"""
    c = dict.fromkeys(KINDS + STRICT, 0)
    detail = []
    S = range(len(spaces))
    room_ids = [r["id"] for r in rooms]
    space_rooms = {i: set() for i in S}
    room_spaces = {r["id"]: set() for r in rooms}
    for i in S:
        s = spaces[i]
        if s["unlabelled"]:
            continue
        for r in rooms:
            if set(s["labels"]) & r["held"]:
                owner = assign_dup.get((r["id"], tuple(s["labels"])))
                if owner is not None and owner != i:
                    continue
                space_rooms[i].add(r["id"])
                room_spaces[r["id"]].add(i)
    # rooms: split / join
    for rid in room_ids:
        if len(room_spaces[rid]) > 1:
            c["split"] += len(room_spaces[rid]) - 1
            detail.append(("split", rid, len(room_spaces[rid]) - 1))
    for i in S:
        if len(space_rooms[i]) > 1:
            c["join"] += len(space_rooms[i]) - 1
            detail.append(("join", spaces[i]["raw"], len(space_rooms[i]) - 1))
    # leftovers and the rename pairing
    missing = [i for i in S if not spaces[i]["unlabelled"] and not space_rooms[i]]
    leftover = [r for r in rooms if not room_spaces[r["id"]]]
    room_by_id = {r["id"]: r for r in rooms}

    def side_space(rid):
        if rid == OUT:
            return {OUT}
        return room_spaces.get(rid) or set()

    def door_partners_room(rid):
        out = set()
        for o in openings:
            if o["kind"] not in ("door", "open_passage", "gate"):
                continue
            sides = o["roomIds"] + ([OUT] if len(o["roomIds"]) == 1 else [])
            if rid in sides and len(sides) == 2:
                other = sides[1] if sides[0] == rid else sides[0]
                out |= side_space(other)
        return out

    def door_partners_space(i):
        out = set()
        for a, b, _k in doors:
            ra, rb = resolve(spaces, a), resolve(spaces, b)
            for x, y in ((ra, rb), (rb, ra)):
                if isinstance(x, list) and i in x:
                    out |= {OUT} if y == OUT else set(y or [])
        return out

    paired = []
    # (a) name similarity
    cand = []
    for r in leftover:
        if r["generic"]:
            continue
        for i in missing:
            ratio = max(difflib.SequenceMatcher(None, norm(r["name"]), l).ratio() for l in spaces[i]["labels"])
            if ratio >= 0.5:
                cand.append((ratio, r["id"], i))
    used_r, used_s = set(), set()
    for ratio, rid, i in sorted(cand, reverse=True):
        if rid in used_r or i in used_s:
            continue
        used_r.add(rid)
        used_s.add(i)
        paired.append((rid, i, "name"))
    # (b) agreeing doors
    cand = []
    for r in leftover:
        if r["id"] in used_r:
            continue
        pr = door_partners_room(r["id"])
        for i in missing:
            if i in used_s:
                continue
            ov = len(pr & door_partners_space(i))
            if ov:
                cand.append((ov, r["id"], i))
    for ov, rid, i in sorted(cand, reverse=True):
        if rid in used_r or i in used_s:
            continue
        used_r.add(rid)
        used_s.add(i)
        paired.append((rid, i, "doors"))
    # (c) the unlabelled truth spaces excuse one leftover room each (unnamed rooms first)
    excused = 0
    n_unl = sum(1 for s in spaces if s["unlabelled"])
    rest = sorted([r for r in leftover if r["id"] not in used_r], key=lambda r: (not r["generic"], r["id"]))
    for r in rest[:n_unl]:
        used_r.add(r["id"])
        excused += 1
    # (d) by count
    rest_r = [r for r in leftover if r["id"] not in used_r]
    rest_s = [i for i in missing if i not in used_s]
    for r, i in zip(rest_r, rest_s):
        used_r.add(r["id"])
        used_s.add(i)
        paired.append((r["id"], i, "count"))
    for rid, i, how in paired:
        name = room_by_id[rid]["name"]
        if not room_by_id[rid]["generic"] and norm_loose(name) == norm_loose(spaces[i]["first_raw"]):
            c["rename_number_only"] += 1
        else:
            c["rename"] += 1
            detail.append(("rename", name, spaces[i]["raw"], how))
        space_rooms[i].add(rid)
        room_spaces[rid].add(i)
    for i in missing:
        if i not in used_s:
            c["draw"] += 1
            detail.append(("draw", spaces[i]["raw"]))
    for r in leftover:
        if r["id"] not in used_r:
            c["delete"] += 1
            detail.append(("delete", r["name"]))
    # a room that holds its one space but shows another name
    for r in rooms:
        sp = room_spaces[r["id"]]
        if len(sp) == 1 and not r["generic"] and r["id"] not in {p[0] for p in paired}:
            i = next(iter(sp))
            if not match_label(r["name"], spaces[i]["labels"]):
                if norm_loose(r["name"]) == norm_loose(spaces[i]["first_raw"]):
                    c["rename_number_only"] += 1
                else:
                    c["rename"] += 1
                    detail.append(("rename", r["name"], spaces[i]["raw"], "shown name"))
    # doors
    known = lambda rid: rid == OUT or bool(room_spaces.get(rid))          # rooms given a truth space (renamed ones too)
    door_like = [o for o in openings if o["kind"] in ("door", "open_passage", "gate")]
    truth_doors = []
    for a, b, k in doors:
        ra, rb = resolve(spaces, a), resolve(spaces, b)
        if ra is None or rb is None:
            continue
        if any(isinstance(x, list) and any(spaces[i]["unlabelled"] for i in x) for x in (ra, rb)):
            continue
        truth_doors.append((ra, rb, k, f"{a} | {b}"))

    def rooms_of(x):
        if x == OUT:
            return {OUT}, False
        rs = set().union(*(space_rooms[i] for i in x))
        return rs, not rs

    cands = {}
    for ti, (ra, rb, k, _txt) in enumerate(truth_doors):
        RA, a_missing = rooms_of(ra)
        RB, b_missing = rooms_of(rb)
        cands[ti] = []
        if RA & RB - {OUT}:
            continue                                              # both in one room: added after the split
        for oi, o in enumerate(door_like):
            sides = o["roomIds"] + ([OUT] if len(o["roomIds"]) == 1 else [])
            if len(sides) != 2:
                continue
            s0, s1 = sides
            ok = (s0 in RA and s1 in RB) or (s1 in RA and s0 in RB)
            if not ok and b_missing and not a_missing:
                ok = (s0 in RA and s1 == OUT) or (s1 in RA and s0 == OUT)
            if not ok and a_missing and not b_missing:
                ok = (s0 in RB and s1 == OUT) or (s1 in RB and s0 == OUT)
            if ok:
                cands[ti].append(oi)
        # a door matched by a door before a doorway
        cands[ti].sort(key=lambda oi: door_like[oi]["kind"] == "open_passage" if k == "door" else 0)
    m = max_matching(cands)
    for ti, (ra, rb, k, txt) in enumerate(truth_doors):
        if ti in m:
            if k == "door" and door_like[m[ti]]["kind"] == "open_passage":
                c["doorway_for_door"] += 1
        else:
            c["door_add"] += 1
            detail.append(("door_add", txt))
    used_o = set(m.values())
    for oi, o in enumerate(door_like):
        if oi in used_o:
            continue
        sides = o["roomIds"] + ([OUT] if len(o["roomIds"]) == 1 else [])
        if len(sides) != 2 or not all(known(s) for s in sides) or sides == [OUT, OUT]:
            continue
        if sides[0] != OUT and sides[1] != OUT and room_spaces[sides[0]] == room_spaces[sides[1]]:
            continue                                              # two pieces of one space: gone with the join
        names = [room_by_id[s]["name"] if s != OUT else OUT for s in sides]
        if o["kind"] == "open_passage":
            c["extra_doorways"] += 1
        else:
            c["door_delete"] += 1
            detail.append(("door_delete", names))
    # windows
    indoor_room = lambda rid: rid != OUT and bool(room_spaces.get(rid)) and not any(spaces[i]["outdoor"] for i in room_spaces[rid])
    win_of_room = {rid: 0 for rid in room_ids}
    for o in openings:
        if o["kind"] != "window":
            continue
        sides = o["roomIds"]
        if len(sides) == 2 and indoor_room(sides[0]) and indoor_room(sides[1]):
            c["window_delete"] += 1
            detail.append(("window_delete", [room_by_id[s]["name"] for s in sides]))
            continue
        host = next((s for s in sides if room_spaces.get(s) and not any(spaces[i]["outdoor"] for i in room_spaces[s])),
                    sides[0] if sides else None)
        if host in win_of_room:
            win_of_room[host] += 1
    want = {}
    seen_name = {}
    for name, n in windows:
        r = resolve(spaces, name)
        if not isinstance(r, list) or any(spaces[i]["unlabelled"] for i in r):
            continue
        k = seen_name.get(name, 0)
        seen_name[name] = k + 1
        i = r[k] if k < len(r) else r[-1]                         # the k-th line naming a shared label: the k-th space
        want[i] = want.get(i, 0) + n
    # groups of spaces and rooms joined by the assignment
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in S:
        find(("s", i))
        for rid in space_rooms[i]:
            parent[find(("s", i))] = find(("r", rid))
    groups = {}
    for i in want:
        groups.setdefault(find(("s", i)), set()).add(i)
    for g, sp in groups.items():
        rs = set().union(*(space_rooms[i] for i in sp))
        have = sum(win_of_room.get(r, 0) for r in rs)
        need = sum(want[i] for i in sp)
        if need > have:
            c["window_add"] += need - have
            detail.append(("window_add", [spaces[i]["raw"] for i in sp], need - have))
        elif have > need:
            c["extra_windows"] += have - need
    return c, detail


def score_plan(doc, ev, truth_path):
    spaces, doors, windows = read_truth(truth_path)
    truth_labels = sorted({l for s in spaces for l in s["labels"]})
    rooms = app_rooms(doc, ev, truth_labels)
    openings = doc["openings"]
    # duplicate printed labels: rooms holding them may go to any space of the group; try the orders (capped)
    groups = {}
    for i, s in enumerate(spaces):
        if s["labels"]:
            groups.setdefault(tuple(s["labels"]), []).append(i)
    dup = {k: v for k, v in groups.items() if len(v) > 1}
    choices = []
    for key, idx in dup.items():
        holders = [r["id"] for r in rooms if set(key) & r["held"]]
        opts = []
        for perm in itertools.islice(itertools.permutations(idx, min(len(idx), len(holders)) or 0), 120):
            a = {}
            for k_, rid in enumerate(holders):
                a[(rid, key)] = perm[k_] if k_ < len(perm) else perm[0] if perm else idx[0]
            opts.append(a)
        choices.append(opts or [{}])
    best = None
    for combo in itertools.islice(itertools.product(*choices), 2000):
        assign = {}
        for a in combo:
            assign.update(a)
        c, d = evaluate(spaces, doors, windows, rooms, openings, assign)
        if doc.get("scale") and (not doc["scale"]["solvedByApp"] or doc["scale"]["assumed"]):
            c["scale"] = 1
            d = d + [("scale", doc["scale"]["basis"])]
        tot = sum(c[k] for k in KINDS)
        if best is None or tot < best[0]:
            best = (tot, c, d)
    tot, c, d = best
    return {"total": tot, "strict": tot + sum(c[k] for k in STRICT), "kinds": c, "detail": d,
            "spaces": sum(1 for s in spaces if s["labels"]), "rooms": len(rooms)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--docs", required=True)
    ap.add_argument("--ev", required=True)
    ap.add_argument("--truth", required=True, help="truth folders, first wins")
    ap.add_argument("--plans", default="")
    ap.add_argument("--sealed", default="")
    ap.add_argument("--json", default="")
    ap.add_argument("-v", action="store_true")
    a = ap.parse_args()
    docs = {d["file"].replace(".evidence.json", ""): d for d in json.load(open(a.docs))}
    want = [p for p in a.plans.split(",") if p] or sorted(docs)
    sealed = {p for p in a.sealed.split(",") if p}
    tdirs = [t for t in a.truth.split(",") if t]
    res = {}
    for plan in want:
        tp = next((os.path.join(t, plan + ".rooms.txt") for t in tdirs if os.path.exists(os.path.join(t, plan + ".rooms.txt"))), None)
        if not tp or plan not in docs:
            continue
        doc = docs[plan]
        if doc["stage"] != "built":
            res[plan] = {"total": None, "stage": doc["stage"], "error": doc.get("error")}
            continue
        ev = json.load(open(os.path.join(a.ev, plan + ".evidence.json")))
        res[plan] = score_plan(doc, ev, tp)
    rows = [(p, r) for p, r in res.items() if r.get("total") is not None]
    print(f"{'plan':10} {'total':>5} {'strict':>6}  " + " ".join(f"{k[:7]:>7}" for k in KINDS))
    for p, r in rows:
        name = "(sealed)" if p in sealed else p
        print(f"{name:10} {r['total']:5} {r['strict']:6}  " + " ".join(f"{r['kinds'][k]:7}" for k in KINDS))
        if a.v and p not in sealed:
            for item in r["detail"]:
                print("           ", *item)
    for p, r in res.items():
        if r.get("total") is None:
            print(f"{p:10} no document ({r['stage']}): {str(r.get('error'))[:120]}")
    tots = [r["total"] for _, r in rows]
    if tots:
        kinds = {k: sum(r["kinds"][k] for _, r in rows) for k in KINDS + STRICT}
        print(f"\n{len(tots)} plans: corrections {sum(tots)}, strict {sum(r['strict'] for _, r in rows)}; "
              f"at most 1: {sum(t <= 1 for t in tots)}, at most 3: {sum(t <= 3 for t in tots)} "
              f"({100 * sum(t <= 3 for t in tots) / len(tots):.0f} %); median {statistics.median(tots):g}, "
              f"mean {statistics.mean(tots):.1f}")
        print("by kind: " + ", ".join(f"{k} {v}" for k, v in kinds.items()))
    if a.json:
        out = {p: ({k: v for k, v in r.items() if k != "detail"} if p in sealed else r) for p, r in res.items()}
        json.dump(out, open(a.json, "w"), indent=1, default=list)


if __name__ == "__main__":
    sys.exit(main())
