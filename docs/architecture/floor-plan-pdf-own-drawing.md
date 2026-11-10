# A vector PDF's traced drawing, taken from the PDF (9 Nov 2026)

**Decision (J, 9 Nov 2026: "Use PDF's own vectors").** On a vector PDF page, the review's traced drawing ("Traced", the overlay and Compare) is the page's own drawing:
- every line at its own width, ends, corners and grey;
- every fill, white masks included;
- the lettering as the fonts' own outlines.

It is no longer a re-trace of the 144 dpi page picture. Images, scanned PDFs and PDF pages carrying a picture keep the picture-based tracers.

## How

- **`pdf-drawing-recorder.ts`.** PDF.js draws the page through the 2D canvas API. `DrawingRecorder` takes those calls and keeps each fill and stroke as a shape, in page-picture pixels: it follows the transform, the styles and the clips the way a canvas does.
  - With `disableFontFace`, PDF.js draws a letter as its font's outline. The recorder takes an outline in em units as lettering.
  - A shape it cannot keep stops the page's drawing, and the page keeps its picture-based trace. These are: a picture, a pattern or gradient, a blend mode or filter, text with no outline, a clip that cuts a shape, or a clip that is not a rectangle.
- **`pdf-own-drawing.ts`** turns the shapes into the trace's paths (`TracePath`, `pdf-own-drawing-v1`):
  - White painted on blank paper is dropped.
  - Even-odd fills are redrawn for the non-zero rule the views use: each outline turns the way its depth asks.
  - Dashes are cut into their pieces.
  - Smooth runs of curves are refitted within 0.08 page pixels (`pdf-own-curves.ts`).
  - Shapes that look alike are joined, so a page fits the candidate's 5 MB cap. Lettering is joined page-wide (`pdf-letter-*`). Other shapes join only shapes they touch (`pdf-*`), so a path stays one drawn thing for the Clean plan's fixtures. A shape only moves back to join a path when nothing drawn since in another grey overlaps it.
  - Fills of one outline are turned the same way and may join overlapping ones. The pieces of a solid (a wall's triangles, a dot's slices) are then one path, with no seam between them. A fill with holes only joins where it overlaps nothing.
- **Where it is used.** `attachSourceArtwork` (raster-page-evidence.ts) uses it on the same pages that were traced before: the faithful-trace pages and picture pages. The page must have vector paths and no picture. Every other page, or a failure, goes to the tracers as before, with a page note giving the reason.
- **Fonts.** PDF.js's standard fonts are loaded from `pdfjs-dist/standard_fonts`, which `next.config.ts` ships. A font the PDF doesn't embed (HDB's Helvetica) then still has outlines. Without them, its text has no outline and the page keeps its picture-based trace.
- **Line ends and corners.** These are new optional geometry fields, `lineCap` (round, square) and `lineJoin` (round, bevel). `sourceDrawingStroke` gives them to the views, for final traces only.

## Measured (cloud, J's vector PDFs, page 1, against poppler at 432 dpi)

| PDF | Paths | Points | Trace annotations | Mean grey difference |
|---|---|---|---|---|
| HDB Blk 670 | 509 | 11,810 | 0.73 MB (faithful trace was 1.26 MB) | 0.8 / 255 |
| HDB Blk 88 | 395 | 12,008 | 0.65 MB | 0.7 |
| Fernvale | 447 | 46,274 | 1.62 MB | 2.1 |
| Tengah | 350 | 77,377 | 2.34 MB | 2.0 |

Thomson (AutoCAD, with a picture on the page) keeps its picture-based trace. (Superseded 10 Nov: see below.)

## A sheet with several plans: the plan area only (10 Nov 2026)

Thomson Reserve's A1 brochure sheet came out blank in Traced: two plans (approved and show unit), tables, notes, a key
plan and pictures, about 170,000 points and pictures that are no lines; the faithful trace skips it (16 Mpx) and the
vectorizer could not read it. J: "proceed with 1 fix it now".

- `pdf-own-plan-area.ts` finds the plan: the largest group of walls lying close together (within 3% of the sheet). The
  walls are the vectorizer's wall edges and rooms where it read the page (12% margin for the dimension chains), or else
  the sheet's own solid dark fills, which are walls and dimension ticks (3% margin for the figures). Of plans weighing
  within 10% of each other the first in reading order is taken (Thomson: the approved plan, above the show-unit plan).
- The recorder keeps where each problem lies. Where the whole sheet cannot be drawn, only the shapes wholly inside the
  area are, unless a picture or lettering lies over the area, or a shape left out (cut by a clip, a pattern) lies wholly
  inside it. The page notes that the rest of the sheet is left out.
- Thomson: 591 paths, 12,284 points (live worker image, J's job). Single-plan sheets draw whole, as before.

## Limits and follow-ups

- A page over 100,000 points keeps the tracer, unless its plan area can be drawn alone.
- A sheet's second plan is left out; choosing which plan to import is a follow-up after the testers.
- The trace export (`floor-plan-source-trace-export.ts`) does not yet carry line ends.
- The review's manual "Trace" preview still re-traces the picture.
