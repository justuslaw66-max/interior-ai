"""Hershey simplex glyphs (OpenCV's built-in FONT_HERSHEY_SIMPLEX, public domain Hershey data) as stroke polylines in
font units (y up, baseline 0), recovered from a 1-px drawing at a large scale."""
import cv2, numpy as np, json, sys
S = 20.0; FONT = cv2.FONT_HERSHEY_SIMPLEX
def strokes_of(ch):
    (w, h), base = cv2.getTextSize(ch, FONT, S, 1)
    W, H = w + 200, h + base + 200
    img = np.zeros((H, W), np.uint8); org = (100, 100 + h)
    cv2.putText(img, ch, org, FONT, S, 255, 1, cv2.LINE_8)
    on = img > 0
    ys, xs = np.nonzero(on)
    pix = set(zip(xs.tolist(), ys.tolist()))
    nb = lambda p: [(p[0]+dx, p[1]+dy) for dx in (-1,0,1) for dy in (-1,0,1) if (dx or dy) and (p[0]+dx, p[1]+dy) in pix]
    deg = {p: len(nb(p)) for p in pix}
    nodes = {p for p in pix if deg[p] != 2}
    seen = set(); lines = []
    def walk(a, b):
        path = [a, b]; seen.add(frozenset((a, b)))
        while path[-1] not in nodes:
            nxt = [q for q in nb(path[-1]) if frozenset((path[-1], q)) not in seen and q != path[-2]]
            if not nxt: break
            # prefer 4-neighbours to avoid diagonal shortcuts
            nxt.sort(key=lambda q: abs(q[0]-path[-1][0]) + abs(q[1]-path[-1][1]))
            seen.add(frozenset((path[-1], nxt[0]))); path.append(nxt[0])
        return path
    for a in nodes:
        for b in nb(a):
            if frozenset((a, b)) not in seen:
                lines.append(walk(a, b))
    # closed loops without nodes (an O drawn in one line)
    rest = {p for p in pix if all(frozenset((p, q)) not in seen for q in nb(p))}
    while rest:
        a = rest.pop(); n = nb(a)
        if not n: continue
        path = walk(a, n[0]); lines.append(path); rest -= set(path)
    out = []
    for P in lines:
        if len(P) < 2: continue
        arr = np.array(P, np.float32).reshape(-1, 1, 2)
        ap = cv2.approxPolyDP(arr, 1.0, False).reshape(-1, 2)
        out.append([[round(float(x - org[0]) / S, 3), round(float(org[1] - y) / S, 3)] for x, y in ap])
    # merge pixel-node clusters: tiny segments (< 0.15 units) between junction pixels are dropped
    out = [L for L in out if not (len(L) == 2 and abs(L[0][0]-L[1][0]) + abs(L[0][1]-L[1][1]) < 0.2)]
    return out, float(w) / S
glyphs = {}
for code in range(32, 127):
    ch = chr(code)
    st, adv = strokes_of(ch) if ch != " " else ([], float(cv2.getTextSize("x", FONT, S, 1)[0][0]) / S)
    glyphs[ch] = {"adv": round(adv, 3), "s": st}
cap = max(p[1] for L in glyphs["H"]["s"] for p in L)
json.dump({"source": "Hershey Simplex (Dr. A. V. Hershey, public domain), as built into OpenCV's FONT_HERSHEY_SIMPLEX",
           "capHeight": cap, "glyphs": glyphs}, open(sys.argv[1], "w"), separators=(",", ":"))
print("cap", cap, "H", glyphs["H"], "\nO", len(glyphs["O"]["s"]), "B", glyphs["B"]["s"])
