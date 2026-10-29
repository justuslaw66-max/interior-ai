"""make_glyphs.py <out.json>: the outlines of the lettering the faithful trace retypes (r12), taken from Liberation
Sans 2 Regular and Bold (SIL Open Font License 1.1): per character its advance and its contours, quadratic
(TrueType) points as [x, y, on-curve], in font units (y up)"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

CHARS = "".join(chr(c) for c in range(32, 127)) + "°²³×±‘’“”–·½¼¾µ"
FONTS = {"regular": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "bold": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"}


def contours(gs, name):
    pen = DecomposingRecordingPen(gs)
    gs[name].draw(pen)
    out, cur = [], None
    for op, args in pen.value:
        if op == "moveTo":
            cur = [[round(args[0][0]), round(args[0][1]), 1]]
        elif op == "lineTo":
            cur.append([round(args[0][0]), round(args[0][1]), 1])
        elif op == "qCurveTo":
            pts = list(args)
            for p in pts[:-1]:
                cur.append([round(p[0]), round(p[1]), 0])
            if pts[-1] is not None:
                cur.append([round(pts[-1][0]), round(pts[-1][1]), 1])
        elif op == "curveTo":                       # (not in these fonts; kept as on-curve points)
            for p in args:
                cur.append([round(p[0]), round(p[1]), 1])
        elif op in ("closePath", "endPath"):
            if cur:
                if len(cur) > 1 and cur[-1][:2] == cur[0][:2] and cur[-1][2] == 1:
                    cur = cur[:-1]
                out.append(cur)
            cur = None
    return out


def main(out_path):
    data = {"source": "Liberation Sans 2 (Regular, Bold): Digitized data copyright (c) 2010 Google Corporation; "
                      "Copyright (c) 2012 Red Hat, Inc. SIL Open Font License, Version 1.1 (see OFL.txt)",
            "unitsPerEm": 2048, "fonts": {}}
    for key, path in FONTS.items():
        f = TTFont(path)
        cmap = f.getBestCmap()
        gs = f.getGlyphSet()
        hmtx = f["hmtx"]
        os2 = f["OS/2"]
        glyphs = {}
        for ch in CHARS:
            name = cmap.get(ord(ch))
            if name is None:
                continue
            glyphs[ch] = {"adv": hmtx[name][0], "c": contours(gs, name)}
        data["fonts"][key] = {"capHeight": os2.sCapHeight, "xHeight": os2.sxHeight, "glyphs": glyphs}
    json.dump(data, open(out_path, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1])
