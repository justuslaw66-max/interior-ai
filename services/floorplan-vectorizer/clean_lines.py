"""(r12) line drawings redrawn clean: a fixture or a piece of furniture drawn in thin lines (a sink's basin and
drainer, a hob, a bath, a bed, a table) is read as a CAD drawing is made - straight lines and arcs, joined - not
copied pixel by pixel. Each line's centre is read from the picture's own ink, to a tenth of a pixel, across the line;
the fewest straight lines and arcs that lie within LINE_TOL of those centres are fitted along it, corners meeting
exactly and curves running smoothly into the lines beside them; a line fading out for a pixel or two (a slot's narrow
end, where its two sides blur together) is carried through; each line is drawn at one weight along its length, as
one path with no ends where it turns."""
import math, os
import cv2, numpy as np
from skimage.morphology import skeletonize

CLEAN = os.environ.get("FT_CLEAN", "1") == "1"
LINE_TOL = float(os.environ.get("FT_LINE_TOL", "0.35"))     # picture px: a fitted line or arc within this of the centres
DRAW_MIN = float(os.environ.get("FT_DRAW_MIN", "12"))        # picture px: a drawing at least this big ...
DRAW_MAX = float(os.environ.get("FT_DRAW_MAX", "220"))       # ... and at most this big
DRAW_REL = float(os.environ.get("FT_DRAW_REL", "0.08"))      # ... and at most this share of the picture's longer side
                                                             # (a fixture's size: a whole room on a small web plan is
                                                             # traced as before - its windows broke into wavy pieces)
DRAW_W = float(os.environ.get("FT_DRAW_W", "2.6"))           # picture px: drawn in lines at most this wide
DRAW_THIN = float(os.environ.get("FT_DRAW_THIN", "0.1"))     # ... a small one, its lines at most this share of its size
DRAW_BIG = 40.0                                              # picture px: a drawing this big is no letter
HAIR = float(os.environ.get("FT_HAIR", "0.9"))     # picture px: a light line drawn this wide, as light as its ink
UTURN = float(os.environ.get("FT_UTURN", "4.5"))    # picture px: a U-turn at most this wide drawn round
ANCHOR_MIN = float(os.environ.get("FT_ANCHOR_MIN", "4.0"))   # picture px: a straight run at least this long is a line
GAP = float(os.environ.get("FT_DRAW_GAP", "3.5"))             # picture px: a line's break at most this long carried through
ROUGH = float(os.environ.get("FT_ROUGH", "0.5"))
CURVED = float(os.environ.get("FT_CURVED", "0.02"))   # a drawing redrawn only if at least this share of its lines is curved   # a drawing more than this share of whose lines fit roughly is left
DOUBLE = os.environ.get("FT_DOUBLE", "1") == "1"
BAND = os.environ.get("FT_BAND", "1") == "1"
TAKE_UNDER = os.environ.get("FT_TAKE_UNDER", "1") == "1"   # the ink under a redrawn line taken with it
DRAW_LETTERS = float(os.environ.get("FT_DRAW_LETTERS", "2.5"))  # a drawing at least this many letters' height across
INSIDE_W = float(os.environ.get("FT_INSIDE_W", "0.1"))     # a piece inside a drawing in lines at most this share of a letter's height
EXTRA_MAX = int(os.environ.get("FT_EXTRA_MAX", "4"))         # a drawing with more small pieces beside it is in dashes
LETTER_H = 10.0                                              # picture px: the lettering's height, where none is found                # a flat grey band read across its ripples            # two hairlines run together drawn as two
DEBUG = os.environ.get("FT_CLEAN_DEBUG") == "1"


# ------------------------------------------------------------------------------------------------ reading the picture
def sample(d0, X, Y, cubic=True):
    """d0 (float32) read at the points X, Y (picture px, pixel centres at whole numbers; outside it, 0): bicubic
    (a = -0.75, as OpenCV's) or bilinear, at the exact point. OpenCV 4's remap rounds the point to 1/32 px, which moves
    a centre read to a tenth of a pixel; this reads the same whatever OpenCV the worker has."""
    X = np.asarray(X, np.float64); Y = np.asarray(Y, np.float64)
    H, W = d0.shape
    x0 = np.floor(X); y0 = np.floor(Y)
    fx = X - x0; fy = Y - y0
    x0 = x0.astype(np.int64); y0 = y0.astype(np.int64)
    if cubic:
        def w4(t):
            a = -0.75
            t1, t2 = t + 1.0, 1.0 - t
            return [((a * t1 - 5 * a) * t1 + 8 * a) * t1 - 4 * a,
                    ((a + 2) * t - (a + 3)) * t * t + 1,
                    ((a + 2) * t2 - (a + 3)) * t2 * t2 + 1,
                    ((a * (t2 + 1) - 5 * a) * (t2 + 1) + 8 * a) * (t2 + 1) - 4 * a]
        offs = (-1, 0, 1, 2)
        wx, wy = w4(fx), w4(fy)
    else:
        offs = (0, 1)
        wx, wy = [1.0 - fx, fx], [1.0 - fy, fy]
    out = np.zeros(X.shape, np.float64)
    for j, oy in enumerate(offs):
        yy = y0 + oy
        iny = (yy >= 0) & (yy < H)
        yc = np.clip(yy, 0, H - 1)
        for i, ox in enumerate(offs):
            xx = x0 + ox
            inn = iny & (xx >= 0) & (xx < W)
            v = d0[yc, np.clip(xx, 0, W - 1)]
            out += np.where(inn, v, 0.0) * wy[j] * wx[i]
    return out.astype(np.float32)


# ------------------------------------------------------------------------------------------------ the centre line
def field_centres(d0, P, N, px, reach):
    """each point of P (working px) moved along its normal N to the centre of the line's ink there, read from the
    picture's darkness d0 (picture px, cubic): (centres, ok, ink width, darkest) - the width in working px"""
    step = 0.125 * px
    T = np.arange(-reach, reach + 1e-9, step)
    X = (P[:, 0:1] + N[:, 0:1] * T[None]) / px - 0.5
    Y = (P[:, 1:2] + N[:, 1:2] * T[None]) / px - 0.5
    V = np.clip(sample(d0, X, Y), 0, 1)
    n, m = V.shape
    mid = m // 2
    shift = np.zeros(n); ok = np.zeros(n, bool); inkw = np.zeros(n); dk = np.zeros(n)
    pair = np.zeros(n, bool); sep = np.zeros(n); pshift = np.zeros(n)
    for i in range(n):
        v = V[i]
        top = v.max()
        if top < 0.06:
            continue
        # the peak nearest the middle that is a real line (not a neighbour's fringe)
        pk = np.nonzero((v[1:-1] >= v[:-2]) & (v[1:-1] >= v[2:]) & (v[1:-1] >= max(0.06, 0.35 * top)))[0] + 1
        if not len(pk):
            continue
        k = int(pk[np.argmin(np.abs(pk - mid))])
        p = v[k]
        # the line's ink: out from its peak while it falls, and across a flat band's ripples (two hairlines blurred
        # into one grey band read whole, not to its first ripple)
        # (only a light band: a dark line that wide is one thick line, its ripples the picture's)
        band = BAND and p <= 0.65
        j0 = k
        while j0 > 0 and v[j0 - 1] >= 0.12 * p and (v[j0 - 1] <= v[j0] + 0.01 or (band and v[j0 - 1] >= 0.6 * p and v[j0:k + 1].min() >= 0.6 * p)):
            j0 -= 1
        j1 = k
        while j1 < m - 1 and v[j1 + 1] >= 0.12 * p and (v[j1 + 1] <= v[j1] + 0.01 or (band and v[j1 + 1] >= 0.6 * p and v[k:j1 + 1].min() >= 0.6 * p)):
            j1 += 1
        seg = v[j0:j1 + 1]
        core = seg >= 0.5 * p
        shift[i] = float(np.sum(T[j0:j1 + 1][core] * seg[core]) / max(1e-9, seg[core].sum()))
        ok[i] = True
        inkw[i] = float(seg.sum()) * step
        dk[i] = p
        # two hairlines side by side (a basin's double rim): a second peak close beside this one with a dip between,
        # or, where the two have run together, a light band too wide for one hairline
        for k2 in pk:
            dd = abs(T[k2] - T[k])
            if k2 == k or dd < 1.0 * px or dd > 3.2 * px or v[k2] < 0.5 * p:
                continue
            lo_, hi_ = min(k, k2), max(k, k2)
            if float(v[lo_:hi_ + 1].min()) <= 0.9 * min(p, v[k2]):
                # the pair's middle: the centroid of the ink of both
                a_ = lo_
                while a_ > 0 and v[a_ - 1] <= v[a_] + 0.01 and v[a_ - 1] >= 0.12 * p:
                    a_ -= 1
                b_ = hi_
                while b_ < m - 1 and v[b_ + 1] <= v[b_] + 0.01 and v[b_ + 1] >= 0.12 * p:
                    b_ += 1
                seg2 = v[a_:b_ + 1]
                core2 = seg2 >= 0.3 * float(seg2.max())
                pair[i] = True; sep[i] = dd
                pshift[i] = float(np.sum(T[a_:b_ + 1][core2] * seg2[core2]) / max(1e-9, seg2[core2].sum()))
                break
        if not pair[i]:
            half = np.nonzero(core)[0]
            wid = float(T[j0 + half[-1]] - T[j0 + half[0]]) + step
            asym = shift[i] - float(T[k])
            if 2.2 * px <= wid <= 4.0 * px and abs(asym) >= 0.2 * px:
                # a dark hairline with a lighter one against it: the band leans to the lighter side
                sp = min(2.5 * px, max(1.0 * px, wid - 1.4 * px))
                pair[i] = True; sep[i] = sp; pshift[i] = shift[i]
            elif p <= 0.6 and wid >= 2.4 * px:
                pair[i] = True; sep[i] = wid - 1.0 * px; pshift[i] = shift[i]
    field_centres.pair = (P + N * pshift[:, None], pair, sep)
    return P + N * shift[:, None], ok, inkw, dk


def _normals(P, closed):
    if len(P) < 2:
        return np.tile([[0.0, 1.0]], (len(P), 1))
    if closed:
        T = np.roll(P, -2, 0) - np.roll(P, 2, 0)
    else:
        Q = np.vstack([P[:1].repeat(2, 0), P, P[-1:].repeat(2, 0)])
        T = Q[4:] - Q[:-4]
        if len(P) >= 2:
            T[0] = P[min(2, len(P) - 1)] - P[0]; T[-1] = P[-1] - P[max(0, len(P) - 3)]
    L = np.hypot(T[:, 0], T[:, 1])
    T = T / np.maximum(1e-9, L)[:, None]
    return np.stack([-T[:, 1], T[:, 0]], 1)


def _smooth(P, sig, closed):
    if len(P) < 5 or sig <= 0:
        return P
    k = int(3 * sig) + 1
    w = np.exp(-0.5 * (np.arange(-k, k + 1) / sig) ** 2); w /= w.sum()
    if closed:
        # (round a short closed chain the ends wrap more than once)
        n = len(P)
        ext = np.vstack([np.take(P, np.arange(-k, 0), axis=0, mode="wrap"), P,
                         np.take(P, np.arange(n, n + k), axis=0, mode="wrap")])
    else:
        ext = np.vstack([P[:1].repeat(k, 0), P, P[-1:].repeat(k, 0)])
    out = np.stack([np.convolve(ext[:, 0], w, "valid"), np.convolve(ext[:, 1], w, "valid")], 1)
    if not closed:
        out[0], out[-1] = P[0], P[-1]
    return out


def _resample(P, step, closed):
    Q = np.vstack([P, P[:1]]) if closed else P
    D = np.hypot(*np.diff(Q, axis=0).T)
    s = np.concatenate([[0], np.cumsum(D)])
    if s[-1] < step:
        return P.copy()
    n = max(2, int(round(s[-1] / step)) + (0 if closed else 1))
    q = np.linspace(0, s[-1], n, endpoint=not closed)
    return np.stack([np.interp(q, s, Q[:, 0]), np.interp(q, s, Q[:, 1])], 1)


# ------------------------------------------------------------------------------------------------ fitting
def _line_fit(R):
    c = R.mean(0)
    _, _, vt = np.linalg.svd(R - c, full_matrices=False)
    u = vt[0]
    nrm = np.array([-u[1], u[0]])
    return c, u, np.abs((R - c) @ nrm)


def _circle_fit(R):
    x, y = R[:, 0], R[:, 1]
    mx, my = x.mean(), y.mean()
    xs, ys = x - mx, y - my
    A = np.stack([xs, ys, np.ones_like(xs)], 1)
    try:
        sol, *_ = np.linalg.lstsq(A, -(xs * xs + ys * ys), rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy = -sol[0] / 2, -sol[1] / 2
    r2 = cx * cx + cy * cy - sol[2]
    if r2 <= 0:
        return None
    r = math.sqrt(r2)
    return np.array([cx + mx, cy + my]), r, np.abs(np.hypot(xs - cx, ys - cy) - r)


def _sweep(R, c):
    a = np.unwrap(np.arctan2(R[:, 1] - c[1], R[:, 0] - c[0]))
    da = np.diff(a)
    return float(a[-1] - a[0]), da


def _line_ok(R, tol):
    if len(R) < 2:
        return None
    c, u, dev = _line_fit(R)
    return (c, u) if dev.max() <= tol else None


def _arc_ok(R, tol, px):
    if len(R) < 6:
        return None
    f = _circle_fit(R)
    if f is None:
        return None
    c, r, dev = f
    if r < 0.75 * px or r > 400 * px or dev.max() > tol:
        return None
    sw, da = _sweep(R, c)
    # the points go one way round, at most once
    if abs(sw) > 2 * math.pi + 0.2 or (np.sign(da) != np.sign(sw)).mean() > 0.1:
        return None
    return c, r, sw


def _bent(R, tol):
    """really bent: its middle stands off the chord by more than the tolerance"""
    ch = R[-1] - R[0]
    L = float(np.hypot(*ch))
    if L < 1e-6:
        return True
    nrm = np.array([-ch[1], ch[0]]) / L
    return float(np.abs((R - R[0]) @ nrm).max()) > 1.2 * tol


def _longest(i, n, ok, kmin=1):
    """the farthest j (i < j < n) for which ok(i, j) holds, searching outward then halving"""
    best, res = None, None
    k = max(2, kmin)
    while True:
        j = min(n - 1, i + k)
        r = ok(i, j)
        if r is None:
            hi = j
            break
        best, res = j, r
        if j == n - 1:
            return best, res
        k *= 2
    lo = best if best is not None else i + 1
    if best is None:
        # even the shortest failed; try the shortest stretches one by one
        for j in range(i + max(1, kmin), min(n, i + max(3, kmin + 2))):
            r = ok(i, j)
            if r is not None:
                best, res = j, r
        if best is None:
            return None, None
        lo = best
    while hi - lo > 1:
        mid = (lo + hi) // 2
        r = ok(i, mid)
        if r is None:
            hi = mid
        else:
            lo, best, res = mid, mid, r
    return best, res


def fit_pieces(R, tol, px):
    """the fewest lines and arcs, end to end, along the centres R: [(kind, i, j, fit)]"""
    n = len(R)
    out = []
    i = 0
    while i < n - 1:
        jl, fl = _longest(i, n, lambda a, b: _line_ok(R[a:b + 1], tol))
        ja, fa = _longest(i, n, lambda a, b: _arc_ok(R[a:b + 1], tol, px), 5) if n - i >= 6 else (None, None)
        if ja is not None and not _bent(R[i:ja + 1], tol):
            ja = None
        if jl is None and ja is None:
            jl, fl = i + 1, _line_fit(R[i:i + 2])[:2]
        if ja is not None and (jl is None or ja > jl + max(3, 0.15 * (jl - i))):
            out.append(("A", i, ja, fa)); i = ja
        else:
            out.append(("L", i, jl, fl)); i = jl
    return out


def _proj_line(p, c, u):
    return c + u * float((p - c) @ u)


def _proj_arc(p, c, r):
    v = p - c
    L = float(np.hypot(*v))
    return c + v / max(1e-9, L) * r


def _meet(a, b, pt, tol):
    """the joint of two pieces at the sample pt: two lines at a corner meet where they cross"""
    if a[0] == "L" and b[0] == "L":
        (c1, u1), (c2, u2) = a[3], b[3]
        cr = u1[0] * u2[1] - u1[1] * u2[0]
        if abs(cr) > math.sin(math.radians(4)):
            t = ((c2 - c1)[0] * u2[1] - (c2 - c1)[1] * u2[0]) / cr
            x = c1 + u1 * t
            if np.hypot(*(x - pt)) <= 6 * tol:
                return x
    qa = _proj_line(pt, *a[3]) if a[0] == "L" else _proj_arc(pt, a[3][0], a[3][1])
    qb = _proj_line(pt, *b[3]) if b[0] == "L" else _proj_arc(pt, b[3][0], b[3][1])
    return (qa + qb) / 2


def _arc_through(p0, p1, c_fit, r_fit, sw):
    """the arc from p0 to p1 of radius near r_fit, its centre on c_fit's side: (centre, r, a0, a1)"""
    ch = p1 - p0
    L = float(np.hypot(*ch))
    if L < 1e-9:
        r = r_fit; c = c_fit
    else:
        r = max(r_fit, L / 2 + 1e-6)
        m = (p0 + p1) / 2
        nrm = np.array([-ch[1], ch[0]]) / L
        h = math.sqrt(max(0.0, r * r - (L / 2) ** 2))
        side = 1.0 if float((c_fit - m) @ nrm) >= 0 else -1.0
        c = m + nrm * h * side
    a0 = math.atan2(p0[1] - c[1], p0[0] - c[0]); a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
    if sw >= 0:
        d = (a1 - a0) % (2 * math.pi)
        if d < 1e-6 and abs(sw) > math.pi:
            d = 2 * math.pi
        a1 = a0 + d
    else:
        d = (a0 - a1) % (2 * math.pi)
        if d < 1e-6 and abs(sw) > math.pi:
            d = 2 * math.pi
        a1 = a0 - d
    return c, r, a0, a1


def _tangent_fix(parts, R, pieces, tol):
    """a curve and the line it runs into, nearly in line at their joint, made to meet smoothly: the arc turned to run
    out of the line along it (when that keeps it within the tolerance of its centres)"""
    n = len(parts)
    for k in range(n):
        if parts[k][0] != "A":
            continue
        _, c, r, a0, a1 = parts[k]
        sw = a1 - a0
        i, j = pieces[k][1], pieces[k][2]
        Rk = R[i:j + 1]
        for side in (0, 1):
            nb = k - 1 if side == 0 else k + 1
            if nb < 0 or nb >= n or parts[nb][0] != "L":
                continue
            la, lb = np.asarray(parts[nb][1]), np.asarray(parts[nb][2])
            u = (lb - la) / max(1e-9, float(np.hypot(*(lb - la))))
            J = np.array(parts[k][1]) + r * np.array([math.cos(a0 if side == 0 else a1), math.sin(a0 if side == 0 else a1)])
            # the arc's direction at J (going along the path)
            ang = a0 if side == 0 else a1
            t = np.array([-math.sin(ang), math.cos(ang)]) * (1 if sw >= 0 else -1)
            if float(t @ u) < math.cos(math.radians(12)):
                continue
            # a circle tangent to the line at J through the arc's other end K
            K = np.array(c) + r * np.array([math.cos(a1 if side == 0 else a0), math.sin(a1 if side == 0 else a0)])
            nrm = np.array([-u[1], u[0]])
            den = 2 * float((K - J) @ nrm)
            if abs(den) < 1e-9:
                continue
            r2 = float((K - J) @ (K - J)) / den
            c2 = J + nrm * r2
            r2 = abs(r2)
            if not (0.75 * r <= r2 <= 1.5 * r) and abs(r2 - r) > 2 * tol:
                continue
            dev = np.abs(np.hypot(Rk[:, 0] - c2[0], Rk[:, 1] - c2[1]) - r2)
            if dev.max() > 1.6 * tol:
                continue
            p0, p1 = (J, K) if side == 0 else (K, J)
            cc, rr, b0, b1 = _arc_through(p0, p1, c2, r2, sw)
            parts[k] = ("A", tuple(cc), rr, b0, b1)
            _, c, r, a0, a1 = parts[k]
            sw = a1 - a0
    return parts


def realise(R, pieces, closed, ends=(None, None), tol=0.7):
    """the pieces as a path: joints where neighbours meet, the ends at the given points (a junction) or where the
    centres end; [("L", a, b) | ("A", c, r, a0, a1)]"""
    n = len(pieces)
    J = []
    for k in range(n + 1):
        if k == 0 or k == n:
            if closed:
                J.append(_meet(pieces[-1], pieces[0], R[pieces[0][1]], tol))
                continue
            e = ends[0] if k == 0 else ends[1]
            pc = pieces[0] if k == 0 else pieces[-1]
            pt = R[pc[1]] if k == 0 else R[pc[2]]
            if e is not None:
                J.append(np.asarray(e, float))
            else:
                J.append(_proj_line(pt, *pc[3]) if pc[0] == "L" else _proj_arc(pt, pc[3][0], pc[3][1]))
        else:
            J.append(_meet(pieces[k - 1], pieces[k], R[pieces[k][1]], tol))
    if closed:
        J[-1] = J[0]
    parts = []
    for k, pc in enumerate(pieces):
        p0, p1 = J[k], J[k + 1]
        if pc[0] == "L":
            parts.append(("L", tuple(p0), tuple(p1)))
        else:
            c, r, sw = pc[3]
            cc, rr, a0, a1 = _arc_through(p0, p1, c, r, sw)
            if abs(sw) > 2 * math.pi - 0.3 and np.hypot(*(p1 - p0)) < tol:
                parts.append(("A", tuple(c), r, 0.0, 2 * math.pi * (1 if sw >= 0 else -1)))
            else:
                parts.append(("A", tuple(cc), rr, a0, a1))
    return _tangent_fix(parts, R, pieces, tol)


def _dist_parts(Q, parts):
    """each point's distance to the nearest of the parts"""
    best = np.full(len(Q), np.inf)
    for p in parts:
        if p[0] == "L":
            a, b = np.asarray(p[1], float), np.asarray(p[2], float)
            v = b - a
            t = np.clip(((Q - a) @ v) / max(1e-12, float(v @ v)), 0, 1)
            dd = np.hypot(*(Q - (a + t[:, None] * v)).T)
        else:
            _, c, r, a0, a1 = p
            c = np.asarray(c, float)
            ang = np.arctan2(Q[:, 1] - c[1], Q[:, 0] - c[0])
            lo, sw = a0, a1 - a0
            rel = (ang - lo) % (2 * math.pi) if sw >= 0 else (lo - ang) % (2 * math.pi)
            on = rel <= abs(sw) + 1e-9
            e0 = c + r * np.array([math.cos(a0), math.sin(a0)]); e1 = c + r * np.array([math.cos(a1), math.sin(a1)])
            dd = np.where(on, np.abs(np.hypot(Q[:, 0] - c[0], Q[:, 1] - c[1]) - r),
                          np.minimum(np.hypot(*(Q - e0).T), np.hypot(*(Q - e1).T)))
        best = np.minimum(best, dd)
    return best


def _plen(p):
    if p[0] == "L":
        return float(np.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]))
    return abs(p[4] - p[3]) * p[2]


def _fillet(l1, l2, Q, tol, px):
    """the round that best joins line l1 (running into the corner) to line l2 (running out of it), tangent to both,
    fitted to the centres Q about the corner: (t1, arc, t2, worst) or None. Nearly parallel lines (a slot's two sides)
    are joined by the half circle that sits where they are its width apart."""
    a1, b1 = np.asarray(l1[1], float), np.asarray(l1[2], float)
    a2, b2 = np.asarray(l2[1], float), np.asarray(l2[2], float)
    u1 = (b1 - a1) / max(1e-9, np.hypot(*(b1 - a1))); u2 = (b2 - a2) / max(1e-9, np.hypot(*(b2 - a2)))
    turn = u1[0] * u2[1] - u1[1] * u2[0]
    side = 1.0 if turn > 0 else -1.0
    if abs(turn) < 1e-6 and float(u1 @ u2) > 0:
        return None                                              # in line: no corner
    n1 = np.array([-u1[1], u1[0]]) * side; n2 = np.array([-u2[1], u2[0]]) * side
    if float(u1 @ u2) < -0.5:
        # a U-turn: the round lies on the inner side, which is where the other line is
        sgn = 1.0 if float((a2 - a1) @ np.array([-u1[1], u1[0]])) > 0 else -1.0
        n1 = np.array([-u1[1], u1[0]]) * sgn; n2 = -np.array([-u2[1], u2[0]]) * sgn
        if float((a1 - a2) @ n2) < 0:
            n2 = -n2
    best = None
    L1 = float(np.hypot(*(b1 - a1))); L2 = float(np.hypot(*(b2 - a2)))
    for r in np.concatenate([np.arange(0.4, 3.0, 0.1), np.arange(3.0, 12.0, 0.4), np.arange(12, 60, 2.0)]) * px:
        # the centre: r from both lines, on their inner sides
        p1 = a1 + n1 * r; p2 = a2 + n2 * r
        cr = u1[0] * u2[1] - u1[1] * u2[0]
        if abs(cr) < 1e-9:
            continue
        t = ((p2 - p1)[0] * u2[1] - (p2 - p1)[1] * u2[0]) / cr
        c = p1 + u1 * t
        T1 = c - n1 * r; T2 = c - n2 * r
        s1 = float((T1 - a1) @ u1); s2 = float((T2 - a2) @ u2)
        if s1 < 0.3 * L1 or s1 > L1 + 6 * px or s2 > 0.7 * L2 or s2 < -6 * px:
            continue
        g0 = math.atan2(T1[1] - c[1], T1[0] - c[0]); g1 = math.atan2(T2[1] - c[1], T2[0] - c[0])
        # round the way the path turns
        d_ = (g1 - g0) % (2 * math.pi)
        tang = np.array([-math.sin(g0), math.cos(g0)])
        if float(tang @ u1) < 0:
            d_ = d_ - 2 * math.pi
        arc = ("A", tuple(c), float(r), g0, g0 + d_)
        parts = [("L", tuple(a1), tuple(T1)), arc, ("L", tuple(T2), tuple(b2))]
        worst = float(_dist_parts(Q, parts).max())
        if best is None or worst < best[3]:
            best = (tuple(T1), arc, tuple(T2), worst)
    return best


def _fillets(parts, R, pieces, tol, px, closed):
    """corners and U-turns made exactly round where the centres show a round: two lines with nothing, or only short
    pieces, between them are joined by the arc tangent to both that best fits the centres there"""
    k = 0
    out = list(parts)
    spans = [(p[1], p[2]) for p in pieces]
    while k < len(out):
        if out[k][0] != "L":
            k += 1; continue
        done = False
        for m in range(k + 1, min(len(out), k + 5)):
            if out[m][0] != "L":
                continue
            mid = out[k + 1:m]
            if any(_plen(p) > 6 * px for p in mid) or sum(_plen(p) for p in mid) > 8 * px:
                break
            if _plen(out[k]) < 1.0 * px or _plen(out[m]) < 1.0 * px:
                break
            # the centres about the corner: the ends of the two lines and all between
            i0 = spans[k][0] + (spans[k][1] - spans[k][0]) // 2
            i1 = spans[m][0] + (spans[m][1] - spans[m][0]) // 2
            Q = R[i0:i1 + 1]
            if len(Q) < 3:
                break
            cur = float(_dist_parts(Q, out[k:m + 1]).max())
            f = _fillet(out[k], out[m], Q, tol, px)
            if f is None:
                break
            T1, arc, T2, worst = f
            if worst <= tol and (worst < cur - 0.05 * px or cur > tol or mid):
                out[k] = ("L", out[k][1], T1)
                out[m] = ("L", T2, out[m][2])
                out[k + 1:m] = [arc]
                spans[k + 1:m] = [(spans[k][1], spans[m][0])] if m > k + 1 else [(spans[k][1], spans[m][0])]
                done = True
            break
        k += 1
    return out


def _end_dir(C, at_start, n=6):
    """the way a chain's centres run out at one end (pointing out of the chain)"""
    if at_start:
        a, b = C[min(n, len(C) - 1)], C[0]
    else:
        a, b = C[max(0, len(C) - 1 - n)], C[-1]
    v = b - a
    return v / max(1e-9, float(np.hypot(*v)))


def _ink_along(d0, Q, px):
    X = (Q[:, 0] / px - 0.5).astype(np.float32)[None]; Y = (Q[:, 1] / px - 0.5).astype(np.float32)[None]
    return np.clip(sample(d0, X, Y, cubic=False)[0], 0, 1)


def _bridge(e1, u1, e2, u2, px):
    """points carrying a line from end e1 (running out along u1) on to end e2 (running out along u2), or None: straight
    across a break, round a U-turn, or on to where the two lines would meet"""
    s = e2 - e1
    L = float(np.hypot(*s))
    if L < 1e-6:
        return np.zeros((0, 2))
    n = max(2, int(math.ceil(L / (0.5 * px))))
    if float(u1 @ s) > 0.7 * L and float(u2 @ -s) > 0.7 * L:
        t = np.linspace(0, 1, n + 1)[1:-1, None]
        return e1 + s * t                                        # straight across
    if float(u1 @ u2) > 0.3:
        ub = (u1 + u2) / max(1e-9, float(np.hypot(*(u1 + u2))))
        if abs(float(s @ ub)) <= 0.6 * L:
            # a U-turn: half round the two ends
            c = (e1 + e2) / 2; r = L / 2
            g0 = math.atan2(e1[1] - c[1], e1[0] - c[0])
            A = np.linspace(0, math.pi, n + 1)[1:-1]
            sgn = 1.0 if float(np.array([-math.sin(g0), math.cos(g0)]) @ ub) > 0 else -1.0
            return np.stack([c[0] + r * np.cos(g0 + sgn * A), c[1] + r * np.sin(g0 + sgn * A)], 1)
    cr = u1[0] * u2[1] - u1[1] * u2[0]
    if abs(cr) > 0.3:
        t1 = (s[0] * u2[1] - s[1] * u2[0]) / cr
        X = e1 + u1 * t1
        t2 = float((X - e2) @ u2)
        if 0 < t1 <= 3 * px * 2 and 0 < t2 <= 3 * px * 2:
            n1 = max(1, int(math.ceil(t1 / (0.5 * px)))); n2 = max(1, int(math.ceil(t2 / (0.5 * px))))
            A = e1 + u1 * np.linspace(0, t1, n1 + 1)[1:, None]
            B = X + (e2 - X) * np.linspace(0, 1, n2 + 1)[1:-1, None]
            return np.vstack([A, B])
    return None


RING_GAP_INK = float(os.environ.get("FT_RING_GAP_INK", "0.15"))   # a ring's gap closed if its ink is at least this share


def _ring_gap(C, px):
    """points round the gap of an open chain that runs most of the way round one circle (from its last centre on to
    its first), or None"""
    if len(C) < 10:
        return None
    f = _circle_fit(C)
    if f is None:
        return None
    c, r, dev = f
    if r < 1.0 * px or r > 30 * px or float(dev.max()) > 0.45 * px:
        return None
    sw, da = _sweep(C, c)
    if abs(sw) < math.radians(220) or abs(sw) > 2 * math.pi or (np.sign(da) != np.sign(sw)).mean() > 0.1:
        return None
    g1 = math.atan2(C[-1][1] - c[1], C[-1][0] - c[0])
    rest = (2 * math.pi - abs(sw)) * (1 if sw > 0 else -1)
    k = max(2, int(math.ceil(abs(rest) * r / (0.5 * px))))
    A = g1 + rest * np.linspace(0, 1, k + 1)[1:-1]
    return np.stack([c[0] + r * np.cos(A), c[1] + r * np.sin(A)], 1)


def join_breaks(fits, d0, px):
    """chains whose free ends lie within GAP of each other, running on into one another, joined into one chain"""
    gap = GAP * px
    changed = True
    while changed:
        changed = False
        ends = []
        for fi, f in enumerate(fits):
            if f["closed"] or f.get("gone"):
                continue
            for at_start, nd in ((True, f["pa"]), (False, f["pb"])):
                if nd is not None:
                    continue
                C = f["C"]
                ends.append((fi, at_start, C[0] if at_start else C[-1], _end_dir(C, at_start)))
        best = None
        for a in range(len(ends)):
            for b in range(a, len(ends)):
                fa, sa, ea, ua = ends[a]; fb, sb, eb, ub = ends[b]
                if a == b:
                    continue
                L = float(np.hypot(*(eb - ea)))
                if fa == fb and L > gap:
                    # a ring with a faint part missing (a tap hole's top): round the circle it lies on, if it is one
                    Bp = _ring_gap(fits[fa]["C"], px)
                    if Bp is not None:
                        ink_ = _ink_along(d0, Bp, px)
                        dk_ = fits[fa]["dark"]
                        if DEBUG:
                            print("ring gap", (ea / px).round(1), "L %.1f" % (L / px), "ink min %.2f mean %.2f dark %.2f" % (ink_.min(), ink_.mean(), dk_))
                        if float(ink_.min()) >= RING_GAP_INK * dk_ and (best is None or L < best[0]):
                            best = (L, a, b, Bp)
                    continue
                if L > gap:
                    continue
                if fa == fb and len(fits[fa]["C"]) < 12:
                    continue
                if ("double" in fits[fa]) != ("double" in fits[fb]):
                    continue                                  # (a double rim runs on into a single line at a junction)
                Bp = _bridge(ea, ua, eb, ub, px)
                if DEBUG:
                    print("ends", (ea / px).round(1), (eb / px).round(1), "L %.1f" % (L / px), "bridge", None if Bp is None else len(Bp),
                          "ink", None if Bp is None or not len(Bp) else round(float(_ink_along(d0, Bp, px).mean()), 2))
                if Bp is None:
                    continue
                # carried through only where the line is still there, if faintly (not across a dashed line's gaps)
                if len(Bp) and L > 1.2 * px:
                    ink_ = _ink_along(d0, Bp, px)
                    dk_ = 0.5 * (fits[fa]["dark"] + fits[fb]["dark"])
                    if float(ink_.min()) < 0.2 * dk_ or float(ink_.mean()) < 0.4 * dk_:
                        continue
                if best is None or L < best[0]:
                    best = (L, a, b, Bp)
        if best is None:
            break
        _, a, b, Bp = best
        fa, sa, ea, ua = ends[a]; fb, sb, eb, ub = ends[b]
        Ca = fits[fa]["C"]; Cb = fits[fb]["C"]
        if fa == fb:
            # the chain closes on itself
            C = Ca if not sa else Ca[::-1]
            fits[fa]["C"] = np.vstack([C, Bp]) if len(Bp) else C
            fits[fa]["closed"] = True
            changed = True
            continue
        A_ = Ca[::-1] if sa else Ca                       # a's free end last
        B_ = Cb if sb else Cb[::-1]                       # b's free end first
        la, lb = len(A_), len(B_)
        new = {"C": np.vstack([A_, Bp, B_]) if len(Bp) else np.vstack([A_, B_]), "closed": False,
               "inkw": (fits[fa]["inkw"] * la + fits[fb]["inkw"] * lb) / (la + lb),
               "dark": (fits[fa]["dark"] * la + fits[fb]["dark"] * lb) / (la + lb),
               "src": fits[fa].get("src", []) + fits[fb].get("src", []),
               "pa": fits[fa]["pb"] if sa else fits[fa]["pa"],          # a's other end
               "pb": fits[fb]["pb"] if sb else fits[fb]["pa"]}          # b's other end
        if "double" in fits[fa] and "double" in fits[fb]:
            new["double"] = 0.5 * (fits[fa]["double"] + fits[fb]["double"])
        fits[fa]["gone"] = True; fits[fb]["gone"] = True
        fits.append(new)
        changed = True
    return [f for f in fits if not f.get("gone")]


# ------------------------------------------------------------------------------------------------ anchored fitting
def _curved(R, px):
    """a run that is a gentle curve, not a line: a circle fits it much better, and it bows by a quarter pixel or more"""
    if len(R) < 8:
        return False
    _, _, dl = _line_fit(R)
    f = _circle_fit(R)
    if f is None:
        return False
    _, r, dc = f
    L = float(np.hypot(*(R[-1] - R[0])))
    sag = r - math.sqrt(max(0.0, r * r - (L / 2) ** 2))
    return sag >= 0.25 * px and dc.max() <= 0.6 * dl.max()


def find_anchors(R, tol, px, minL=None):
    """the straight runs along the centres: [[i, j, c, u]], u along the path"""
    n = len(R)
    tolA = 0.75 * tol
    minL = ANCHOR_MIN * px if minL is None else minL
    out = []
    i = 0
    while i < n - 1:
        j, f = _longest(i, n, lambda a, b: (_line_fit(R[a:b + 1])[:2] if _line_fit(R[a:b + 1])[2].max() <= tolA else None), 1)
        if j is not None and np.hypot(*(R[j] - R[i])) >= minL and not _curved(R[i:j + 1], px):
            # the line from the run's middle (its ends may lie on the curves either side), then every centre beside it
            k = max(1, (j - i) // 6)
            c, u, _ = _line_fit(R[i + k:j - k + 1]) if j - i - 2 * k >= 2 else _line_fit(R[i:j + 1])
            if float(u @ (R[j] - R[i])) < 0:
                u = -u
            nrm = np.array([-u[1], u[0]])
            on = np.abs((R - c) @ nrm) <= tolA
            a, b = i + k, j - k
            while a > 0 and on[a - 1] and (not out or a - 1 > out[-1][1]):
                a -= 1
            while b < n - 1 and on[b + 1]:
                b += 1
            c, u, _ = _line_fit(R[a:b + 1])
            if float(u @ (R[b] - R[a])) < 0:
                u = -u
            out.append([a, b, c, u])
            i = b
        else:
            i += 1
    # a short run in the middle of a wide curve (its chord within the tolerance of the arc) is part of the curve:
    # the curve runs on both sides of it, round one circle
    keep = []
    for A in out:
        a, b = A[0], A[1]
        L = float(np.hypot(*(R[b] - R[a])))
        if L < 12 * px and b - a >= 3:
            ext = R[max(0, a - (b - a)):min(n, b + (b - a) + 1)]
            if len(ext) >= len(R[a:b + 1]) + 4:
                f = _circle_fit(ext)
                if f is not None and f[2].max() <= tol and _line_fit(ext)[2].max() > tol and f[1] < 200 * px:
                    continue
        keep.append(A)
    out = keep
    # neighbouring runs along one line (a long line whose centres wander a little) are one run
    k = 0
    while k + 1 < len(out):
        A, B = out[k], out[k + 1]
        if B[0] - A[1] <= 3 and float(A[3] @ B[3]) > math.cos(math.radians(3)):
            c, u, dv = _line_fit(R[A[0]:B[1] + 1])
            if dv.max() <= tol:
                if float(u @ (R[B[1]] - R[A[0]])) < 0:
                    u = -u
                out[k] = [A[0], B[1], c, u]
                out.pop(k + 1)
                continue
        k += 1
    return out


def _isect(c1, u1, c2, u2):
    cr = u1[0] * u2[1] - u1[1] * u2[0]
    if abs(cr) < 1e-9:
        return None
    t = ((c2 - c1)[0] * u2[1] - (c2 - c1)[1] * u2[0]) / cr
    return c1 + u1 * t


def _arc_dir(T1, T2, c, u1):
    """the arc from T1 to T2 round c, leaving T1 along u1: (a0, a1)"""
    g0 = math.atan2(T1[1] - c[1], T1[0] - c[0]); g1 = math.atan2(T2[1] - c[1], T2[0] - c[0])
    tang = np.array([-math.sin(g0), math.cos(g0)])
    if float(tang @ u1) >= 0:
        return g0, g0 + (g1 - g0) % (2 * math.pi)
    return g0, g0 - (g0 - g1) % (2 * math.pi)


def _round_between(A, B, Q, px, mid=None):
    """the arc tangent to anchor lines A and B (each [i, j, c, u]) that best fits the centres Q between them:
    (T1, arc, T2, worst) or None. Its centre is sought along the line of points as far from both lines (their
    bisector), so two nearly parallel lines (a slot's sides) are joined by the half circle that fits their end."""
    c1, u1 = A[2], A[3]; c2, u2 = B[2], B[3]
    if mid is None:
        mid = Q[len(Q) // 2]
    n1 = np.array([-u1[1], u1[0]]); n2 = np.array([-u2[1], u2[0]])
    if float((mid - c1) @ n1) < 0:
        n1 = -n1
    if float((mid - c2) @ n2) < 0:
        n2 = -n2
    pa, pb = c1 + u1 * float((Q[0] - c1) @ u1), c2 + u2 * float((Q[-1] - c2) @ u2)
    # the bisector: n1.(p - c1) = n2.(p - c2)
    g = n1 - n2
    gl = float(np.hypot(*g))
    if gl < 1e-6:
        return None
    g = g / gl
    off = (float(n1 @ c1) - float(n2 @ c2)) / gl
    p0 = mid - g * (float(g @ mid) - off)                # the bisector's point nearest the corner's middle
    dvec = np.array([-g[1], g[0]])
    def trial(t):
        cc = p0 + dvec * t
        r = float(n1 @ (cc - c1))
        if r < 0.3 * px:
            return None
        T1 = cc - n1 * r; T2 = cc - n2 * r
        if float((T1 - pa) @ u1) < -0.5 * px or float((pb - T2) @ u2) < -0.5 * px:
            return None
        a0, a1 = _arc_dir(T1, T2, cc, u1)
        if abs(a1 - a0) > 1.2 * math.pi:
            return None
        arc = ("A", tuple(cc), r, a0, a1)
        worst = float(_dist_parts(Q, [("L", tuple(pa), tuple(T1)), arc, ("L", tuple(T2), tuple(pb))]).max())
        # and the round itself runs along the centres (not out past them, round something they don't show)
        Pa = path_points([arc], 0.5 * px)
        back = float(np.sqrt(((Pa[:, None, :] - Q[None, :, :]) ** 2).sum(-1)).min(1).max())
        return (T1, arc, T2, max(worst, back))
    best = None
    span = 30.0 * px
    for t in np.arange(-span, span + 1e-9, 0.5 * px):
        f = trial(t)
        if f is not None and (best is None or f[3] < best[0][3]):
            best = (f, t)
    if best is None:
        return None
    t0 = best[1]
    for t in np.arange(t0 - 0.5 * px, t0 + 0.5 * px + 1e-9, 0.05 * px):
        f = trial(t)
        if f is not None and f[3] < best[0][3]:
            best = (f, t)
    return best[0]


def _region(R, A, B, idx, tol, px, minL=None):
    """how anchor A runs on into anchor B over the centres R[idx]: (end of A, parts between, start of B)"""
    minL = ANCHOR_MIN * px if minL is None else minL
    Q = R[idx]
    c1, u1 = A[2], A[3]; c2, u2 = B[2], B[3]
    pa, pb = c1 + u1 * float((Q[0] - c1) @ u1), c2 + u2 * float((Q[-1] - c2) @ u2)
    cands = []
    X = _isect(c1, u1, c2, u2)
    turn = math.degrees(math.acos(max(-1.0, min(1.0, float(u1 @ u2)))))
    if X is not None and float((X - pa) @ u1) > -tol and float((pb - X) @ u2) > -tol \
            and float(np.hypot(*(Q - X).T).min()) <= 1.5 * px:
        w = float(_dist_parts(Q, [("L", tuple(pa), tuple(X)), ("L", tuple(X), tuple(pb))]).max())
        cands.append((w, 0, X, [], X))
    # the corner's middle: half way between where the two runs end
    ie, ib_ = int(np.searchsorted(idx, A[1])) if A[1] in idx else 0, int(np.searchsorted(idx, B[0])) if B[0] in idx else len(idx) - 1
    if (A[1] in idx) and (B[0] in idx):
        ie = int(np.nonzero(idx == A[1])[0][0]); ib_ = int(np.nonzero(idx == B[0])[0][-1])
    else:
        ie, ib_ = 0, len(idx) - 1
    midp = Q[(ie + ib_) // 2] if ib_ >= ie else Q[len(Q) // 2]
    f = _round_between(A, B, Q, px, midp)
    if f is not None:
        T1, arc, T2, w = f
        # a tight U-turn (a slot's end a few pixels across) is round: at that size the picture can't tell a round end
        # from a square one, and the slot's other ends are round
        if DEBUG:
            print("region at", (midp / px).round(1), "turn %.0f" % turn, "round w %.2f r %.2f" % (w / px, arc[2] / px),
                  "corner", [round(cd[0] / px, 2) for cd in cands], "minL", minL / px)
        if float(u1 @ u2) < -0.85:
            gapw = abs(float((pa - c2) @ np.array([-u2[1], u2[0]])))
            if gapw <= UTURN * px and w <= max(tol, 0.25 * gapw):
                return T1, [arc], T2
        cands.append((w, 1, T1, [arc], T2))
    ok = [cd for cd in cands if cd[0] <= tol]
    if ok:
        if len(ok) == 2:
            corner, rnd = ok[0], ok[1]
            if turn >= 20 and rnd[0] < corner[0] - 0.08 * px and rnd[3][0][2] >= 0.5 * px:
                return rnd[2], rnd[3], rnd[4]
            return corner[2], corner[3], corner[4]
        return ok[0][2], ok[0][3], ok[0][4]
    # shorter straight runs between (a slot's square end between its two sides): each corner between them sharp or
    # round in turn
    Rg = R[idx]
    if minL / 2 >= 1.0 * px:
        subs = find_anchors(Rg, tol, px, minL / 2)
        nrmA = np.array([-u1[1], u1[0]]); nrmB = np.array([-u2[1], u2[0]])
        subs = [sa for sa in subs
                if not (abs(float(sa[3] @ u1)) > math.cos(math.radians(4)) and np.abs((Rg[sa[0]:sa[1] + 1] - c1) @ nrmA).max() <= tol)
                and not (abs(float(sa[3] @ u2)) > math.cos(math.radians(4)) and np.abs((Rg[sa[0]:sa[1] + 1] - c2) @ nrmB).max() <= tol)]
        if subs:
            chain = [A] + [[idx[0] + sa[0], idx[0] + sa[1], sa[2], sa[3]] for sa in subs] + [B]
            gidx = lambda a, b: np.arange(a, b + 1)
            seams = []
            for k in range(len(chain) - 1):
                P_, Q_ = chain[k], chain[k + 1]
                lo = idx[0] if k == 0 else (P_[0] + P_[1]) // 2
                hi = idx[-1] if k == len(chain) - 2 else (Q_[0] + Q_[1]) // 2
                if hi - lo < 2:
                    lo, hi = max(idx[0], lo - 1), min(idx[-1], hi + 1)
                seams.append(_region(R, P_, Q_, np.arange(lo, hi + 1), tol, px, minL / 2))
            mid = list(seams[0][1])
            for k in range(1, len(seams)):
                mid.append(("L", tuple(seams[k - 1][2]), tuple(seams[k][0])))
                mid += list(seams[k][1])
            return seams[0][0], mid, seams[-1][2]
    # anything else: lines and arcs along the centres between, from A's end to B's start
    pieces = fit_pieces(Rg, tol, px)
    E = c1 + u1 * float((Rg[0] - c1) @ u1); S = c2 + u2 * float((Rg[-1] - c2) @ u2)
    mid = realise(Rg, pieces, False, (E, S), 2 * tol) if pieces else [("L", tuple(E), tuple(S))]
    return E, mid, S


def fit_path(C, closed, tol, px, ends=(None, None)):
    """the centres C as a path of lines and arcs: straight runs found first, then each corner between two of them made
    sharp, or round (the arc tangent to both), or, failing both, followed by lines and arcs"""
    n = len(C)
    anchors = find_anchors(C, tol, px)
    if not anchors:
        pieces = fit_pieces(C, tol, px)
        return realise(C, pieces, closed, ends, 2 * tol) if pieces else []
    R = C
    if closed:
        # round a closed chain the centres are taken twice over, so that the corner where the walk began is read in
        # one stretch (indices past the end run on round)
        R = np.vstack([C, C[1:]])
        if len(anchors) >= 2 and anchors[0][0] == 0 and anchors[-1][1] == n - 1:
            # the walk began in a straight run: the run cut by the start is one run
            a, b = anchors[-1], anchors[0]
            if float(a[3] @ b[3]) > math.cos(math.radians(3)):
                RR = R[a[0]:b[1] + n]
                c_, u_, dv = _line_fit(RR)
                if dv.max() <= tol:
                    if float(u_ @ (RR[-1] - RR[0])) < 0:
                        u_ = -u_
                    anchors[-1] = [a[0], b[1] + n - 1, c_, u_]
                    anchors.pop(0)
    K = len(anchors)
    seams = []
    for k in range(K if closed else K - 1):
        A, B = anchors[k], anchors[(k + 1) % K]
        if k == K - 1:
            B = [B[0] + n - 1, B[1] + n - 1, B[2], B[3]]
        ia = (A[0] + A[1]) // 2; ib = (B[0] + B[1]) // 2
        if ib >= len(R):
            ib = len(R) - 1
        seams.append(_region(R, A, B, np.arange(ia, ib + 1), tol, px))
    parts = []
    def start_of(k):
        return seams[k - 1][2] if (k > 0 or closed) else None
    for k in range(K):
        A = anchors[k]
        c, u = A[2], A[3]
        S = seams[k - 1][2] if (k > 0 or closed) else None
        E = seams[k][0] if (k < K - 1 or closed) else None
        if S is None:
            # the chain's start: lines and arcs up to the first run, or the run itself from the start
            if A[0] > 2:
                Rg = C[:A[0] + 1]
                S = c + u * float((C[A[0]] - c) @ u)
                pieces = fit_pieces(Rg, tol, px)
                if pieces:
                    parts += realise(Rg, pieces, False, (ends[0], S), 2 * tol)
            else:
                S = np.asarray(ends[0], float) if ends[0] is not None else c + u * float((C[0] - c) @ u)
        if E is None:
            if A[1] < n - 3:
                E = c + u * float((C[A[1]] - c) @ u)
                parts.append(("L", tuple(S), tuple(E)))
                Rg = C[A[1]:]
                pieces = fit_pieces(Rg, tol, px)
                if pieces:
                    parts += realise(Rg, pieces, False, (E, ends[1]), 2 * tol)
                continue
            E = np.asarray(ends[1], float) if ends[1] is not None else c + u * float((C[-1] - c) @ u)
        parts.append(("L", tuple(S), tuple(E)))
        if k < len(seams):
            parts += list(seams[k][1])
    return parts


# ------------------------------------------------------------------------------------------------ fewer, cleaner parts
MERGE = os.environ.get("FT_MERGE", "1") == "1"      # runs of short parts along one gentle curve drawn as one arc
MERGE_TURN = math.radians(float(os.environ.get("FT_MERGE_TURN", "25")))   # parts meeting at most this turn may merge


def _ends(pt):
    """a part's start and end points and its direction at each"""
    if pt[0] == "L":
        a, b = np.asarray(pt[1], float), np.asarray(pt[2], float)
        v = b - a
        L = float(np.hypot(*v))
        u = v / L if L > 1e-9 else np.array([1.0, 0.0])
        return a, b, u, u
    _, c, r, a0, a1 = pt
    c = np.asarray(c, float)
    sg = 1.0 if a1 >= a0 else -1.0
    P0 = c + r * np.array([math.cos(a0), math.sin(a0)]); P1 = c + r * np.array([math.cos(a1), math.sin(a1)])
    t0 = sg * np.array([-math.sin(a0), math.cos(a0)]); t1 = sg * np.array([-math.sin(a1), math.cos(a1)])
    return P0, P1, t0, t1


def _turn(u, v):
    return math.acos(max(-1.0, min(1.0, float(u @ v))))


def arc_through(S, E, P, tol, px):
    """the arc from S to E (both exactly) nearest the points P between them, if every point is within tol of it:
    ("A", c, r, a0, a1) or None"""
    S = np.asarray(S, float); E = np.asarray(E, float)
    ch = E - S
    L = float(np.hypot(*ch))
    if L < 1.0 * px or len(P) < 4:
        return None
    M = (S + E) / 2.0
    nrm = np.array([-ch[1], ch[0]]) / L
    f = _circle_fit(P)
    if f is None:
        return None
    lim = 400.0 * px
    t0 = max(-lim, min(lim, float((f[0] - M) @ nrm)))
    def dev(t):
        c = M + nrm * t
        r = float(np.hypot(*(S - c)))
        return float(np.abs(np.hypot(*(P - c).T) - r).max())
    best_t, best = t0, dev(t0)
    step = max(0.5 * px, 0.05 * abs(t0))
    for _ in range(200):
        if step <= 0.01 * px:
            break
        moved = False
        for t in (best_t - step, best_t + step):
            if abs(t) > lim:
                continue
            dv = dev(t)
            if dv < best:
                best, best_t, moved = dv, t, True
        if not moved:
            step /= 2.0
    if best > tol:
        return None
    c = M + nrm * best_t
    r = float(np.hypot(*(S - c)))
    if r > 400 * px or r < 0.75 * px:
        return None
    g0 = math.atan2(S[1] - c[1], S[0] - c[0]); g1 = math.atan2(E[1] - c[1], E[0] - c[0])
    # round the way the points go: the side of the chord they lie on
    side = float(np.median((P - S) @ nrm))
    ccw = (side * float(nrm @ (c - M))) < 0 if abs(best_t) > 1e-9 else True
    A = np.unwrap(np.arctan2(P[:, 1] - c[1], P[:, 0] - c[0]))
    sw = float(A[-1] - A[0])
    if sw >= 0:
        a1 = g0 + (g1 - g0) % (2 * math.pi)
    else:
        a1 = g0 - (g0 - g1) % (2 * math.pi)
    # the points go one way round, and the arc runs as they do
    dA = np.diff(A)
    if len(dA) and (np.sign(dA[np.abs(dA) > 1e-9]) != np.sign(sw)).mean() > 0.1:
        return None
    if abs((a1 - g0) - sw) > 0.5:
        return None
    return ("A", tuple(c), r, g0, a1)


def merge_parts(parts, tol, px, closed=False):
    """runs of parts that meet without a corner (a long gentle curve read as many short lines, a straight side read
    as several) drawn as one arc or one line, through the run's own two ends, if it lies within tol of the run"""
    if not MERGE or len(parts) < 2:
        return parts
    n = len(parts)
    E = [_ends(p_) for p_ in parts]
    smooth = [_turn(E[k][3], E[k + 1][2]) <= MERGE_TURN for k in range(n - 1)]
    pts = [path_points([p_], 0.25 * px) for p_ in parts]
    out = []
    i = 0
    while i < n:
        jmax = i
        while jmax < n - 1 and smooth[jmax]:
            jmax += 1
        done = False
        for j in range(jmax, i, -1):
            S, Eend = E[i][0], E[j][1]
            P = np.vstack(pts[i:j + 1])
            ch = Eend - S
            L = float(np.hypot(*ch))
            if L > 1e-6:
                nrm = np.array([-ch[1], ch[0]]) / L
                t = (P - S) @ (ch / L)
                if float(np.abs((P - S) @ nrm).max()) <= tol and t.min() >= -0.5 * px and t.max() <= L + 0.5 * px:
                    out.append(("L", tuple(S), tuple(Eend))); i = j + 1; done = True
                    break
            arc = arc_through(S, Eend, P, tol, px)
            if arc is not None:
                out.append(arc); i = j + 1; done = True
                break
        if not done:
            out.append(parts[i]); i += 1
    return out


SPIKE = float(os.environ.get("FT_SPIKE", "2.5"))     # picture px: parts this short turning back and forth are noise


def _signed_turn(u, v):
    return math.atan2(u[0] * v[1] - u[1] * v[0], float(u @ v))


def despike(parts, px, closed=False):
    """a few short parts turning sharply one way and back (centres read across a junction, where another line's ink
    pulls them aside) drawn as one straight line between the parts either side"""
    if len(parts) < 3:
        return parts
    E = [_ends(p_) for p_ in parts]
    Ls = [_plen(p_) for p_ in parts]
    n = len(parts)
    out = list(parts)
    k = 0
    res = []
    i = 0
    while i < n:
        if Ls[i] >= SPIKE * px:
            res.append(parts[i]); i += 1
            continue
        j = i
        while j + 1 < n and Ls[j + 1] < SPIKE * px:
            j += 1
        # the turns within the run and where it meets the parts either side
        lo, hi = max(0, i - 1), min(n - 1, j + 1)
        turns = [_signed_turn(E[q][3], E[q + 1][2]) for q in range(lo, hi)]
        back = sum(abs(t) for t in turns) - abs(sum(turns))
        if j - i >= 1 and back >= math.radians(80) and sum(Ls[i:j + 1]) <= 10 * px:
            S = E[i][0]; T = E[j][1]
            # at a free end (a junction, where the line runs on as another) the wiggle is left off; between two
            # parts, one straight line takes its place
            at_end = not closed and (i == 0 or j == n - 1) and not (i == 0 and j == n - 1)
            if not at_end and float(np.hypot(*(T - S))) > 0.05 * px:
                res.append(("L", tuple(S), tuple(T)))
            i = j + 1
            continue
        res += parts[i:j + 1]
        i = j + 1
    return res


# ------------------------------------------------------------------------------------------------ ends stitched
STITCH = float(os.environ.get("FT_STITCH", "7.0"))    # picture px: two path ends at most this far apart may be joined


def _arc_pt_tan(P, T, Q):
    """the arc leaving P along T that ends at Q: a part (a line if Q lies straight ahead)"""
    P = np.asarray(P, float); Q = np.asarray(Q, float)
    v = Q - P
    nrm = np.array([-T[1], T[0]])
    k = float(nrm @ v)
    if abs(k) < 1e-6 * max(1.0, float(v @ v)):
        return ("L", tuple(P), tuple(Q))
    r = float(v @ v) / (2.0 * k)                    # signed: the centre lies at P + nrm * r
    c = P + nrm * r
    a0 = math.atan2(P[1] - c[1], P[0] - c[0]); a1 = math.atan2(Q[1] - c[1], Q[0] - c[0])
    if r > 0:            # the centre on the left: round anticlockwise as y runs down... follow T
        pass
    tang = np.array([-math.sin(a0), math.cos(a0)])
    if float(tang @ T) >= 0:
        a1 = a0 + (a1 - a0) % (2 * math.pi)
    else:
        a1 = a0 - (a0 - a1) % (2 * math.pi)
    if abs(r) > 2000:
        return ("L", tuple(P), tuple(Q))
    return ("A", tuple(c), abs(r), a0, a1)


def biarc(P0, T0, P1, T1):
    """two arcs, tangent to each other, from P0 leaving along T0 to P1 arriving along T1: [parts] or None"""
    P0 = np.asarray(P0, float); P1 = np.asarray(P1, float)
    v = P1 - P0
    if float(np.hypot(*v)) < 1e-6:
        return []
    t = T0 + T1
    vt = float(v @ t)
    den = 2.0 * (1.0 - float(T0 @ T1))
    if abs(den) < 1e-6:
        # parallel ends: a straight line if they lie on one line, else an S of two equal arcs
        if abs(float(v @ np.array([-T0[1], T0[0]]))) < 1e-3:
            return [("L", tuple(P0), tuple(P1))]
        d = float(v @ v) / (4.0 * float(v @ T1)) if abs(float(v @ T1)) > 1e-9 else None
        if d is None or d <= 0:
            return None
    else:
        disc = vt * vt + den * float(v @ v)
        if disc < 0:
            return None
        d = (-vt + math.sqrt(disc)) / den
        if d <= 0:
            return None
    Pm = (P0 + P1 + d * (T0 - T1)) / 2.0
    a = _arc_pt_tan(P0, T0, Pm)
    # the second arc, run backwards from P1 against T1, then turned round
    b = _arc_pt_tan(P1, -T1, Pm)
    b = _reverse_part(b)
    return [a, b]


def _reverse_part(q):
    if q[0] == "L":
        return ("L", q[2], q[1])
    return ("A", q[1], q[2], q[4], q[3])


def _reverse(parts):
    return [_reverse_part(q) for q in parts[::-1]]


def _turning(parts):
    tot = 0.0
    E = [_ends(q) for q in parts]
    for q, e in zip(parts, E):
        if q[0] == "A":
            tot += abs(q[4] - q[3])
    for k in range(len(E) - 1):
        tot += _turn(E[k][3], E[k + 1][2])
    return tot


def _segs_cross(A, B):
    """two polylines (points) cross"""
    for i in range(len(A) - 1):
        p, r = A[i], A[i + 1] - A[i]
        for j in range(len(B) - 1):
            q, s_ = B[j], B[j + 1] - B[j]
            den = r[0] * s_[1] - r[1] * s_[0]
            if abs(den) < 1e-12:
                continue
            t = ((q - p)[0] * s_[1] - (q - p)[1] * s_[0]) / den
            u = ((q - p)[0] * r[1] - (q - p)[1] * r[0]) / den
            if 1e-6 < t < 1 - 1e-6 and 1e-6 < u < 1 - 1e-6:
                return True
    return False


def stitch(paths, d0, px, dark):
    """open paths ending near each other (lines parted where they meet at a junction, a double rim's two lines and
    the lines they run on into) joined end to end by a smooth bridge: the ends paired so the bridges are smooth and
    short and do not cross, and only across ink"""
    if STITCH <= 0:
        return paths
    paths = [dict(p_) for p_ in paths]
    ends = []
    trim = {}
    for k, p_ in enumerate(paths):
        if p_.get("closed") or not p_["parts"]:
            continue
        pp = p_["parts"]
        # an end that hooks off in its last short part (the ink of a faint end read askew) is joined from before it
        if len(pp) >= 3:
            e0, e1 = _ends(pp[0]), _ends(pp[1])
            if _plen(pp[0]) < SPIKE * px and _turn(e0[3], e1[2]) >= math.radians(30):
                trim[(k, 0)] = True
            e0, e1 = _ends(pp[-2]), _ends(pp[-1])
            if _plen(pp[-1]) < SPIKE * px and _turn(e0[3], e1[2]) >= math.radians(30):
                trim[(k, 1)] = True
        q0 = pp[1] if trim.get((k, 0)) else pp[0]
        q1 = pp[-2] if trim.get((k, 1)) else pp[-1]
        S, _, t0, _ = _ends(q0); _, T, _, t1 = _ends(q1)
        ends.append((k, 0, S, -t0))           # (path, which end, point, the way out of the path)
        ends.append((k, 1, T, t1))
    cand = {}
    for a in range(len(ends)):
        for b in range(a + 1, len(ends)):
            ka, sa, Pa, ua = ends[a]; kb, sb, Pb, ub = ends[b]
            L = float(np.hypot(*(Pb - Pa)))
            if L > STITCH * px:
                continue
            if ka == kb and _plen_all(paths[ka]["parts"]) < 6 * L:
                continue
            if L < 0.05 * px or (L < 1.0 * px and float(ua @ (-ub)) > 0.8):
                # ends that meet, or nearly, running on into each other (a loop the skeleton opened at a point of its
                # own, its ends overlapping a little): joined by the short step between them
                if float(ua @ (-ub)) > 0.5 or ka == kb:
                    cand[(a, b)] = (0.0, [] if L < 0.05 * px else [("L", tuple(Pa), tuple(Pb))], np.zeros((0, 2)))
                continue
            br = biarc(Pa, ua, Pb, -ub)
            if DEBUG:
                print("stitch?", (Pa / px).round(1), (Pb / px).round(1), "L %.1f" % (L / px), "biarc", br is not None and len(br),
                      "turn %.0f" % math.degrees(_turning(br)) if br else "")
            if br is None:
                continue
            tw = _turning(br)
            # a bridge that turns no more than a corner does; or round a U-turn (a slot's faint end), two lines
            # side by side ending together
            uturn = float(ua @ ub) > 0.5 and abs(float((Pb - Pa) @ ua)) <= 0.5 * L
            if tw > math.radians(100) and not (uturn and tw <= math.radians(200)):
                continue
            if tw > math.radians(100) and ka != kb and paths[ka].get("twin") is not None and paths[ka].get("twin") == paths[kb].get("twin"):
                continue                      # (a double rim's two lines are not one line turning back)
            Q = path_points(br, 0.5 * px)
            ink = _ink_along(d0, Q, px) if len(Q) else np.ones(1)
            if DEBUG:
                print("   ink mean %.2f p20 %.2f dark %.2f uturn %s tw %.0f" % (float(ink.mean()), float(np.percentile(ink, 20)), dark, uturn, math.degrees(tw)))
            if float(ink.mean()) < 0.3 * dark or float(np.percentile(ink, 20)) < 0.12 * dark:
                continue
            # (a U-turn only where nothing runs on: at a junction the lines that continue each other are paired)
            cand[(a, b)] = (L * (1.0 + tw) * (1.5 if tw > math.radians(100) else 1.0), br, Q)
    if not cand:
        return paths
    # clusters of ends that might be paired; each paired the best way (a missing pair costs as a long bridge)
    adj = {}
    for (a, b) in cand:
        adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    seen, pairs = set(), []
    for st in adj:
        if st in seen:
            continue
        comp, stack = [], [st]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x); comp.append(x); stack += list(adj[x])
        comp.sort()
        miss = STITCH * px * 3.0
        best = [None, None]
        def rec(rem, chosen, cost):
            if best[0] is not None and cost >= best[0]:
                return
            if not rem:
                best[0], best[1] = cost, list(chosen)
                return
            x = rem[0]
            rec(rem[1:], chosen, cost + miss)
            for y in rem[1:]:
                key = (min(x, y), max(x, y))
                if key not in cand:
                    continue
                Q = cand[key][2]
                if any(_segs_cross(Q, cand[c][2]) for c in chosen):
                    continue
                rec([z for z in rem[1:] if z != y], chosen + [key], cost + cand[key][0])
        if len(comp) <= 10:
            rec(comp, [], 0.0)
            pairs += best[1] or []
    # the joins, one at a time (an end's path may have been joined already)
    where = {k: k for k in range(len(paths))}            # path index -> the index of the path it is now part of
    flip = {k: False for k in range(len(paths))}         # ... and whether it runs backwards in it
    def find(k):
        r, f = k, False
        while where[r] != r:
            f ^= flip[r]; r = where[r]
        return r, f
    for (a, b) in pairs:
        for (k_, s_) in ((ends[a][0], ends[a][1]), (ends[b][0], ends[b][1])):
            if trim.pop((k_, s_), False):
                paths[k_]["parts"] = paths[k_]["parts"][1:] if s_ == 0 else paths[k_]["parts"][:-1]
    for (a, b) in pairs:
        ka, sa, Pa, ua = ends[a]; kb, sb, Pb, ub = ends[b]
        br = cand[(a, b)][1]
        ra, fa = find(ka); rb, fb = find(kb)
        ea = sa ^ fa; eb = sb ^ fb                       # which end of the joined paths these are now
        A_ = paths[ra]["parts"]; B_ = paths[rb]["parts"]
        if ra == rb:
            # the path closes on itself
            parts_ = (A_ if ea == 1 else _reverse(A_)) + br       # (a's end last, then the bridge from it to b's)
            paths[ra]["parts"] = parts_; paths[ra]["closed"] = True
            continue
        A2 = A_ if ea == 1 else _reverse(A_)             # a's joined end last
        B2 = B_ if eb == 0 else _reverse(B_)             # b's joined end first
        new = dict(paths[ra] if _plen_all(A_) >= _plen_all(B_) else paths[rb])
        new["parts"] = A2 + br + B2
        new["closed"] = False
        new["twin"] = None
        paths.append(new)
        nk = len(paths) - 1
        where[nk] = nk; flip[nk] = False
        where[ra] = nk; flip[ra] = (ea != 1)
        where[rb] = nk; flip[rb] = (eb != 0)
    return [paths[k] for k in range(len(paths)) if where.get(k, k) == k]


def _plen_all(parts):
    return sum(_plen(q) for q in parts)


# ------------------------------------------------------------------------------------------------ the drawings
def _letter_like(st, i, cand):
    """a mark of a letter's size with others of its size beside it in a row (or a column): lettering"""
    x, y, w, h = st[i, :4]
    for j in cand:
        if j == i:
            continue
        bx, by, bw, bh = st[j, :4]
        for (a0, a1, b0, b1, s0, s1, t0, t1) in ((y, y + h, by, by + bh, x, x + w, bx, bx + bw),
                                                 (x, x + w, bx, bx + bw, y, y + h, by, by + bh)):
            size, osize = a1 - a0, b1 - b0
            ov = min(a1, b1) - max(a0, b0)
            gap = max(t0 - s1, s0 - t1)
            if size > 0 and 0.6 * size <= osize <= 1.6 * size and ov >= 0.5 * min(size, osize) and gap <= 1.0 * max(size, osize):
                return True
    return False


def drawings(weak, px, img_side, letter_h=None):
    """the pieces of thin line work that are drawings (not lettering, not a whole plan's line work): their labels. A
    drawing is a fixture's size: across both ways at least DRAW_LETTERS times as big as the plan's lettering (a word
    run together, or a short wall with letters against it, is not one) and at most DRAW_REL of the picture"""
    n, lab, st, _ = cv2.connectedComponentsWithStats(weak, 8)
    lo, hi = DRAW_MIN * px, min(DRAW_MAX, DRAW_REL * img_side) * px
    lo2 = DRAW_LETTERS * (letter_h if letter_h else LETTER_H) * px
    small = [i for i in range(1, n) if max(st[i, 2], st[i, 3]) <= DRAW_BIG * px and st[i, 4] >= 2 * px * px]
    out = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        L = max(w, h)
        if L < lo or L > hi or min(w, h) < lo2:
            continue
        m = lab[y:y + h, x:x + w] == i
        dt = cv2.distanceTransform(np.pad(m, 1).astype(np.uint8), cv2.DIST_L2, 3)
        from skimage.morphology import skeletonize
        sk = skeletonize(np.pad(m, 1))
        if not sk.any():
            continue
        lw = 2.0 * float(np.median(dt[sk]))
        if DEBUG:
            print("drawing?", i, (x // px, y // px, w // px, h // px), "lw %.2f" % (lw / px))
        if lw > DRAW_W * px:
            continue
        if L < DRAW_BIG * px and (lw > DRAW_THIN * L or (lw > 0.075 * L and _letter_like(st, i, small))):
            continue
        out.append(i)
    # drawings a pixel or two apart (a drainer's outline parted where it fades) are one drawing, and small pieces a
    # pixel or two from one (a slot's end) are drawn with it
    extra = {}
    if out:
        # (only the drawings and the small pieces chain together: through the rest of the line work - a small web
        # plan's thin walls - every small piece on the plan was taken into one fixture's drawing)
        k = 2 * px + 1
        cand = set(out)
        sel = np.zeros(n, bool)
        sel[list(cand)] = True
        sel[1:] |= np.maximum(st[1:, 2], st[1:, 3]) <= 8 * px
        ng, glab = cv2.connectedComponents(cv2.dilate(sel[lab].astype(np.uint8), np.ones((k, k), np.uint8)), connectivity=8)
        gid = {}
        for j in np.nonzero(sel)[0]:
            x, y, w, h = st[j, :4]
            ys, xs = np.nonzero(lab[y:y + h, x:x + w] == j)
            gid[int(j)] = int(glab[y + ys[0], x + xs[0]])
        owner = {}
        for i in out:
            owner.setdefault(gid[i], i)
        for j, g_ in gid.items():
            if g_ not in owner or owner[g_] == j:
                continue
            extra.setdefault(owner[g_], []).append(j)
        out = [i for i in out if owner[gid[i]] == i]
        # and the hairline pieces lying inside a drawing (a drainer's slots inside its sink's outline, each smaller than
        # a drawing itself), so long as their lines are finer than the plan's lettering's strokes
        lh_ = (letter_h if letter_h else LETTER_H) * px
        taken_ = set(out) | {j for v in extra.values() for j in v}
        for i in out:
            x0, y0, x1, y1 = st[i, 0] - px, st[i, 1] - px, st[i, 0] + st[i, 2] + px, st[i, 1] + st[i, 3] + px
            for j in range(1, n):
                if j in taken_ or max(st[j, 2], st[j, 3]) <= 8 * px:
                    continue                                      # (small pieces go by the chaining above)
                if max(st[j, 2], st[j, 3]) < 1.5 * min(st[j, 2], st[j, 3]):
                    continue                                      # (long pieces: slots, not a hob's crossed burners)
                if st[j, 0] < x0 or st[j, 1] < y0 or st[j, 0] + st[j, 2] > x1 or st[j, 1] + st[j, 3] > y1:
                    continue
                mj = lab[st[j, 1]:st[j, 1] + st[j, 3], st[j, 0]:st[j, 0] + st[j, 2]] == j
                dtj = cv2.distanceTransform(np.pad(mj, 1).astype(np.uint8), cv2.DIST_L2, 3)
                skj = skeletonize(np.pad(mj, 1))
                if not skj.any() or 2.0 * float(np.median(dtj[skj])) > INSIDE_W * lh_:
                    continue
                extra.setdefault(i, []).append(j)
                taken_.add(j)
    return lab, st, out, extra


def clean_drawings(weak, d, px, img_side, skeleton_graph, prune_spurs, letter_h=None):
    """(r12) the thin line drawings in `weak` (working px) redrawn clean: [{"k": "path", ...}] and the pixels taken"""
    taken = np.zeros_like(weak)
    out = []
    if not CLEAN:
        return out, taken
    lab, st, ids, extra = drawings(weak, px, img_side, letter_h)
    if not ids:
        return out, taken
    d0 = np.ascontiguousarray(d[::px, ::px]).astype(np.float32) if px > 1 else d.astype(np.float32)
    tol = LINE_TOL * px
    for i in ids:
        ex = extra.get(i, [])
        if sum(1 for j in ex if max(st[j, 2], st[j, 3]) <= 8 * px) > EXTRA_MAX:
            continue                  # (a figure in dashes - a fridge's or a washer's dashed box - is left as traced)
        mem = [i] + extra.get(i, [])
        x = min(st[j, 0] for j in mem); y = min(st[j, 1] for j in mem)
        xe = max(st[j, 0] + st[j, 2] for j in mem); ye = max(st[j, 1] + st[j, 3] for j in mem)
        x0, y0 = max(0, x - 2 * px), max(0, y - 2 * px)
        x1, y1 = min(weak.shape[1], xe + 2 * px), min(weak.shape[0], ye + 2 * px)
        m = np.isin(lab[y0:y1, x0:x1], mem).astype(np.uint8)
        clean_one.give = None
        try:
            paths = clean_one(m, d[y0:y1, x0:x1], d0, px, (x0, y0), tol, skeleton_graph, prune_spurs)
        except Exception as ex:                   # (a drawing that can't be redrawn is traced as before, not the page lost)
            if DEBUG:
                print("clean_one failed:", repr(ex))
            continue
        if paths is None:
            continue
        out += paths
        give = clean_one.give
        taken[y0:y1, x0:x1] |= (m & (1 - give.astype(np.uint8))) if give is not None else m
        # and whatever ink lies under the lines now drawn (a ring's faint part, read before as a dash beside it)
        under = np.zeros((y1 - y0, x1 - x0), np.uint8)
        for p_ in (paths if TAKE_UNDER else []):
            Q = path_points(p_["parts"], 0.5 * px) - [x0, y0]
            th = max(1, int(round(p_["w"] + 2.0 * px)))
            cv2.polylines(under, [np.round(Q * 16).astype(np.int32)], bool(p_.get("closed")), 1, th, cv2.LINE_8, shift=4)
        taken[y0:y1, x0:x1] |= under & weak[y0:y1, x0:x1]
    return out, taken


def _chain_len(P):
    return float(np.sum(np.hypot(*np.diff(P, axis=0).T))) if len(P) > 1 else 0.0


def merge_through(chains, px):
    """the skeleton's chains tidied: a tiny loop (a blot at a corner) dropped, and two chains meeting at a junction
    with nothing else there made one chain running through it (so the corner there is fitted as a corner)"""
    chains = [dict(c) for c in chains]
    keep = []
    for c in chains:
        P = np.asarray(c["pts"], float)
        L = _chain_len(P)
        if c["closed"] and L < 4 * px:
            continue
        if not c["closed"] and c["a"] and c["a"] == c["b"] and L < 4 * px:
            continue
        keep.append(c)
    chains = keep
    while True:
        deg = {}
        for k, c in enumerate(chains):
            if c["closed"]:
                continue
            for e in ("a", "b"):
                if c[e]:
                    deg.setdefault(c[e], []).append((k, e))
        node = next((nd for nd, lst in deg.items() if len(lst) == 2), None)
        if node is None:
            # a node only one chain reaches is that chain's free end
            for nd, lst in deg.items():
                if len(lst) == 1:
                    k, e = lst[0]
                    chains[k][e] = 0
            return chains
        (k1, e1), (k2, e2) = deg[node]
        if k1 == k2:
            c = chains[k1]
            c["closed"] = True; c["a"] = c["b"] = 0
            continue
        c1, c2 = chains[k1], chains[k2]
        P1 = np.asarray(c1["pts"], float); P2 = np.asarray(c2["pts"], float)
        if e1 == "a":
            P1 = P1[::-1]                        # c1 now ends at the node
        if e2 == "b":
            P2 = P2[::-1]                        # c2 now starts at the node
        other1 = c1["b"] if e1 == "a" else c1["a"]
        other2 = c2["b"] if e2 == "a" else c2["a"]
        new = dict(c1)
        new["pts"] = np.vstack([P1, P2])
        new["a"], new["b"] = other1, other2
        n1, n2 = len(P1), len(P2)
        new["mass"] = (c1["mass"] * n1 + c2["mass"] * n2) / (n1 + n2)
        new["dark"] = (c1["dark"] * n1 + c2["dark"] * n2) / (n1 + n2)
        new["closed"] = False
        if other1 and other1 == other2 and other1 not in [nd for nd, l in deg.items() if len(l) > 2]:
            pass
        chains = [c for k, c in enumerate(chains) if k not in (k1, k2)] + [new]


def _fits_of(chains, jcen, ox, oy, d0, px):
    """each chain's centres read from the picture: [{"ch", "jc", "C", "closed", "inkw", "dark", "src", ("double")}]"""
    fits = []
    for ci, ch in enumerate(chains):
        P = np.asarray(ch["pts"], float) + [ox, oy]
        closed = bool(ch["closed"])
        if closed and len(P) > 2 and np.hypot(*(P[0] - P[-1])) < 1e-6:
            P = P[:-1]
        if len(P) < 3:
            continue
        P = _resample(_smooth(P, 1.5, closed), 0.5 * px, closed)
        if len(P) < 3:
            continue
        N = _normals(_smooth(P, 3.0, closed), closed)
        C, ok, inkw, dk = field_centres(d0, P, N, px, 2.5 * px)
        if ok.mean() < 0.6:
            continue
        Cp, pair, sep = field_centres.pair
        C = np.where(ok[:, None], C, P)
        node = lambda nd: (np.asarray(jcen[nd], float) + 0.5 + [ox, oy]) if nd else None
        f = {"ch": ch, "C": C, "closed": closed, "inkw": float(np.median(inkw[ok])),
             "dark": float(np.median(dk[ok])), "src": [ci],
             "pa": None if closed else node(ch["a"]), "pb": None if closed else node(ch["b"])}
        if DOUBLE and pair.mean() >= 0.6:
            f["C"] = np.where(pair[:, None], Cp, C)
            f["double"] = float(np.median(sep[pair]))
        elif pair.mean() >= 0.25:
            # two lines running together part of the way: the band's middle all along (not one line's, then the other's)
            f["C"] = np.where(pair[:, None], Cp, C)
        fits.append(f)
    return fits


def _owner(m, chains):
    """each pixel of m given to the chain whose centre pixels are nearest it: chain index + 1 (0 where none)"""
    lab_ = np.zeros(m.shape, np.int32)
    for ci, ch in enumerate(chains):
        Pq = np.round(np.asarray(ch["pts"], float) - 0.5).astype(int)
        Pq[:, 0] = np.clip(Pq[:, 0], 0, m.shape[1] - 1); Pq[:, 1] = np.clip(Pq[:, 1], 0, m.shape[0] - 1)
        lab_[Pq[:, 1], Pq[:, 0]] = ci + 1
    if not lab_.any():
        return lab_
    _, near = cv2.distanceTransformWithLabels((lab_ == 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(lab_)
    lmap = np.zeros(near.max() + 1, np.int32)
    lmap[near[ys, xs]] = lab_[ys, xs]
    return lmap[near]


def clean_one(m, dsub, d0, px, off, tol, skeleton_graph, prune_spurs):
    if DEBUG and not hasattr(clean_one, "dbg"):
        clean_one.dbg = []
    chains, jcen = skeleton_graph(m, dsub)
    chains = merge_through(prune_spurs(chains), px)
    ox, oy = off
    fits = _fits_of(chains, jcen, ox, oy, d0, px)
    dbl = [f for f in fits if "double" in f]
    if dbl and len(dbl) < len(fits) or len(dbl) > 1:
        # two hairlines side by side (a basin's rim) that the skeleton reads as a net of short pieces where they part and
        # join again: the band they make is closed into one and read again along its middle
        own = _owner(m, chains)
        ids = sorted(set(c for f in dbl for c in f["src"]))
        isb = np.zeros(len(chains) + 1, bool); isb[[c + 1 for c in ids]] = True
        band = ((m > 0) & isb[own]).astype(np.uint8)
        k = int(math.ceil(float(np.median([f["double"] for f in dbl])))) + 2
        mb = cv2.morphologyEx(band, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        ch2, jc2 = skeleton_graph(mb, dsub)
        ch2 = merge_through(prune_spurs(ch2), px)
        f2 = _fits_of(ch2, jc2, ox, oy, d0, px)
        for f in f2:
            f["src"] = list(ids)
        fits = [f for f in fits if "double" not in f] + f2
    if not fits:
        return None
    fits = join_breaks(fits, d0, px)
    paths = []
    for f in fits:
        C, closed = f["C"], f["closed"]
        if closed:
            # start at the sharpest turn, so no straight side is split where the walk began
            k = 3
            a = np.roll(C, -k, 0) - C; b = C - np.roll(C, k, 0)
            turn = np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1)))
            s = int(np.argmax(turn))
            C = np.vstack([np.roll(C, -s, 0), np.roll(C, -s, 0)[:1]])
        if DEBUG:
            clean_one.dbg.append({"C": C.copy(), "anchors": [(a[0], a[1]) for a in find_anchors(C, tol, px)]})
        ends = [None, None] if closed else [f["pa"], f["pb"]]
        circ = _circle_fit(C) if closed and len(C) >= 8 else None
        if circ is not None and float(circ[2].max()) <= tol and 0.75 * px <= circ[1] <= 60 * px:
            # a closed line that is a circle (a tap hole, a ring) drawn as one
            cc, rr = circ[0], circ[1]
            g0 = math.atan2(C[0][1] - cc[1], C[0][0] - cc[0])
            parts = [("A", tuple(cc), float(rr), g0, g0 + 2 * math.pi)]
        else:
            parts = fit_path(C, closed, tol, px, ends)
            if not parts:
                continue
            parts = merge_parts(despike(parts, px, closed), tol, px, closed)
        inkw, dark = f["inkw"], f["dark"]
        if "double" in f:
            inkw = inkw / 2.0
        if inkw / max(0.2, dark) <= 2.5 * px:
            # a thin line drawn crisp with the ink the picture gives it: a dark one black, as wide as its ink; a light
            # one (a plan's grey furniture) a hairline as light as its ink (r11 drew those black)
            wk = max(HAIR * px, inkw)
            dkk = min(1.0, inkw / wk)
        else:
            wk, dkk = max(0.75 * px, inkw / max(0.2, dark)), min(1.0, dark)
        paths.append({"k": "path", "parts": parts, "closed": closed, "w": wk, "dark": dkk, "shape": "drawing",
                      "double": f.get("double"), "len": sum(_plen(p) for p in parts), "src": f.get("src", [])})
    # a drawing whose lines could not be read as a few clean lines and arcs (two lines a pixel apart that the
    # picture blurs together, read now as one and now as the other) is left to be traced as before
    tot = sum(p["len"] for p in paths)
    rough = 0.0
    good = []
    for p in paths:
        L_ = [_plen(q) for q in p["parts"]]
        tiny = sum(1 for v in L_ if v < 1.0 * px)
        if len(L_) > 4 and (tiny > 0.3 * len(L_) or len(L_) > p["len"] / (2.5 * px)):
            rough += p["len"]
        else:
            good.append(p)
    if tot <= 0 or rough > ROUGH * tot:
        if DEBUG:
            print("drawing left as traced: rough %.2f" % (rough / max(1e-9, tot)), "chains", len(chains), "paths", len(paths))
            for p in paths:
                print("   path len %.1f parts %d" % (p["len"] / px, len(p["parts"])), [round(_plen(q) / px, 1) for q in p["parts"]][:30])
        return None
    # a drawing of straight lines only (a dimension's ticks and witness lines, a frame) is left to the strokes, which
    # draw such lines exactly and tidy their ends
    arc_len = sum(_plen(q) for p in good for q in p["parts"] if q[0] == "A")
    if DEBUG:
        print("clean_one: chains", len(chains), "fits", len(fits), "paths", len(paths), "good", len(good),
              "rough %.2f" % (rough / max(1e-9, tot)), "curved %.2f" % (arc_len / max(1e-9, sum(p["len"] for p in good))))
    turned = any(q[0] == "A" and abs(q[4] - q[3]) >= math.radians(45) for p in good for q in p["parts"])
    if not turned or arc_len < CURVED * max(1e-9, sum(p["len"] for p in good)):
        return None
    # the lines that fit roughly, or not at all, are given back to be traced as before (their own pixels: those
    # nearer their centre than any other line's)
    kept_src = set(c for p in good for c in p["src"])
    back = [ci for ci in range(len(chains)) if ci not in kept_src]
    give = np.zeros_like(m)
    if back:
        owner = _owner(m, chains)
        isback = np.zeros(len(chains) + 1, bool); isback[[c + 1 for c in back]] = True
        give = (m > 0) & isback[owner]
    clean_one.give = give
    paths = _dedupe(good, px)
    seps = [p["double"] for p in paths if p.get("double")]
    common = float(np.median(seps)) if seps else None
    out = []
    for ti, p in enumerate(paths):
        if p.get("double"):
            h = common / 2.0
            for dd in (h, -h):
                q = dict(p); q["parts"] = offset_parts(p["parts"], dd, p["closed"]); q["twin"] = ti
                if q["parts"]:
                    out.append(q)
        else:
            out.append(p)
    if len(out) > 1:
        dk_ = float(np.median([p["dark"] for p in out]))
        out = stitch(out, d0, px, dk_)
    for p in out:
        p.pop("double", None); p.pop("len", None); p.pop("src", None); p.pop("twin", None)
    return out


def _dedupe(paths, px):
    """a line found twice (the two hairlines of a double line, each read as the pair) drawn once: a path lying along a
    longer one for nearly all its length is dropped"""
    order = sorted(range(len(paths)), key=lambda i: -paths[i]["len"])
    kept = []
    for i in order:
        p = paths[i]
        Q = path_points(p["parts"], 0.5 * px)
        if not len(Q):
            continue
        dup = False
        for j in kept:
            dd = _dist_parts(Q, paths[j]["parts"])
            if float((dd <= max(0.6 * px, 0.35 * (p.get("double") or 0))).mean()) >= 0.8:
                dup = True
                break
        if not dup:
            kept.append(i)
    return [paths[i] for i in sorted(kept)]


def path_points(parts, step):
    out = []
    for pt in parts:
        if pt[0] == "L":
            a, b = np.asarray(pt[1], float), np.asarray(pt[2], float)
            k = max(2, int(math.ceil(np.hypot(*(b - a)) / step)) + 1)
            out.append(a + (b - a) * np.linspace(0, 1, k)[:, None])
        else:
            _, c, r, a0, a1 = pt
            k = max(3, int(math.ceil(abs(a1 - a0) * r / step)) + 1)
            A = np.linspace(a0, a1, k)
            out.append(np.stack([c[0] + r * np.cos(A), c[1] + r * np.sin(A)], 1))
    return np.vstack(out) if out else np.zeros((0, 2))


def offset_parts(parts, dd, closed):
    """the path moved dd to its left (as it runs), its corners kept: lines moved along, arcs' radii changed"""
    out = []
    for p in parts:
        if p[0] == "L":
            a, b = np.asarray(p[1], float), np.asarray(p[2], float)
            u = (b - a) / max(1e-9, float(np.hypot(*(b - a))))
            nrm = np.array([-u[1], u[0]])
            out.append(["L", a + nrm * dd, b + nrm * dd])
        else:
            _, c, r, a0, a1 = p
            r2 = r - dd if a1 >= a0 else r + dd
            if r2 <= 0.05:
                continue
            out.append(["A", c, r2, a0, a1])
    if not out:
        return []
    def end(q):
        return q[2] if q[0] == "L" else np.asarray(q[1]) + q[2] * np.array([math.cos(q[4]), math.sin(q[4])])
    def start(q):
        return q[1] if q[0] == "L" else np.asarray(q[1]) + q[2] * np.array([math.cos(q[3]), math.sin(q[3])])
    res = []
    n = len(out)
    for k in range(n):
        res.append(out[k])
        if k == n - 1 and not closed:
            break
        q, nx = out[k], out[(k + 1) % n]
        e, s_ = np.asarray(end(q), float), np.asarray(start(nx), float)
        if float(np.hypot(*(e - s_))) <= 0.02:
            continue
        if q[0] == "L" and nx[0] == "L":
            ua = (q[2] - q[1]); ub = (nx[2] - nx[1])
            X = _isect(q[1], ua / max(1e-9, np.hypot(*ua)), nx[1], ub / max(1e-9, np.hypot(*ub)))
            if X is not None and np.hypot(*(X - e)) < 10 * np.hypot(*(e - s_)) + 1:
                q[2] = X; nx[1] = X
                continue
        res.append(["L", e, s_])
    return [tuple([r_[0]] + [tuple(v) if isinstance(v, np.ndarray) else v for v in r_[1:]]) for r_ in res]
