#!/usr/bin/env python3
"""Draw a clean-drawing JSON (faithful_drawing.py's output, or an evidence file's `drawing`) as the app draws it, to PNG
(blind A/B harness; rebuilt 30 Oct 2026 after the first one was lost with its cloud folder).

    python3 ab_render.py <drawing.json | evidence.json> <out.png> [--scale=1] [--width=W --height=H]

As lib/floor-plan-source-drawing.ts: each item one path ("M" at its first point, then its commands: C takes three
points, Z none, M and L one); a fill item is filled by the nonzero rule, any other item stroked at strokeWidthPx with
butt caps; colour rgb(tone) (black when the item has none); white paper. Chromium (Playwright) renders the SVG.
A {"skipped": ...} drawing renders as an empty white page the size of --width / --height, with the reason written on it.
"""
import argparse
import html
import json
import sys


def path_d(item):
    pts = item["points"]
    if not pts:
        return ""
    xy = lambda p: f"{p[0]:.2f} {p[1]:.2f}" if isinstance(p, (list, tuple)) else f"{p['x']:.2f} {p['y']:.2f}"
    d, i = [f"M {xy(pts[0])}"], 1
    for c in item.get("commands", []):
        n = 3 if c == "C" else 0 if c == "Z" else 1
        d.append(c + (" " + " ".join(xy(p) for p in pts[i:i + n]) if n else ""))
        i += n
    return " ".join(d)


def svg_of(drawing, w, h):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           f'<rect width="{w}" height="{h}" fill="#fff"/>']
    if "skipped" in drawing or not drawing.get("items"):
        why = html.escape(str(drawing.get("skipped", "no items")))
        out.append(f'<text x="20" y="40" font-size="24" fill="#c00">no drawing: {why}</text>')
    for it in drawing.get("items", []):
        tone = it.get("tone")
        ink = "#000" if tone is None else f"rgb({tone},{tone},{tone})"
        d = path_d(it)
        if not d:
            continue
        if it.get("fill"):
            out.append(f'<path d="{d}" fill="{ink}" fill-rule="nonzero" stroke="none"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{it.get("strokeWidthPx") or 1}" '
                       'stroke-linecap="butt"/>')
    out.append("</svg>")
    return "\n".join(out)


def render(svg, w, h, out, scale=1.0):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": int(w), "height": int(h)}, device_scale_factor=scale)
        pg.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        pg.screenshot(path=out, full_page=False, clip={"x": 0, "y": 0, "width": int(w), "height": int(h)})
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--width", type=int, default=0)
    ap.add_argument("--height", type=int, default=0)
    a = ap.parse_args()
    doc = json.load(open(a.src))
    drawing = doc.get("drawing", doc) if "kind" in doc else doc
    w = a.width or doc.get("page", {}).get("widthPx") or drawing.get("widthPx")
    h = a.height or doc.get("page", {}).get("heightPx") or drawing.get("heightPx")
    if not (w and h):
        sys.exit("page size unknown: give --width and --height")
    render(svg_of(drawing, w, h), w, h, a.out, a.scale)
    print(a.out)


if __name__ == "__main__":
    main()
