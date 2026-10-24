# Source artwork tracing

The source artwork is reference material, independent of metric calibration and architectural proposals. The user requested visible drawing recovery before further room interpretation. Original images, prior candidates and saved designs are preserved.

## Extraction and coordinates

`source-artwork-trace.ts` decodes the explicitly selected review image with Sharp without resizing or rectifying it. The grayscale mask combines bounded local contrast with absolute dark-ink retention. Components smaller than three pixels are excluded as specks. Morphological opening identifies broad observed fills; pixel-cell contours preserve their silhouette and holes. Stroke thinning preserves topology, and each undirected graph edge is consumed once, avoiding multiple threshold/pass duplicates. Junctions split paths for independent editing; ordinary continuation remains one chain.

Normal-direction grayscale refinement is limited to half a selected-source pixel. Finite caps extend by at most three pixels through contiguous observed ink, stopping at blank or filled pixels. Lines and least-squares cubic spans fit the observed finite chains within0.65 selected-source pixels, checking both observed and generated spans. No semantic arc, completed circle, angle snapping, room closure or gap repair is supplied. Fills use linear contours; genuine disconnected dashes stay disconnected.

Version `source-strokes-v2` prefers a straight finite span whenever it fits the unchanged0.65px bound, instead of choosing a lower-residual cubic for scan wobble. Whole-chain minimax line proposals use the observed direction, then solve shared endpoints together within that same bound. Every affected path is checked against its original, unchanged dense observations in both directions; rejected junctions revert consistently across incident paths. Nearby distinct endpoints cannot collapse. Filled contours are partitioned into supported finite runs and use the same bounded junction fitting, retaining holes and short detail. This is a fitting refinement, not a change to the pixel mask, registration, metric calibration, source accuracy gates or source text. It cannot remove larger source distortion or substitute ideal CAD geometry for ambiguous ink.

Existing local OCR boxes select observed glyph paint only. Pixels in plausible text boxes are preserved as source-derived fills; no drawing pixel is erased and no OCR string becomes replacement glyph geometry. Suspected rail/punctuation readings remain strokes. Partially recognized text may therefore retain mixed representations. Text readings remain separately inspectable and never appear as accidental duplicate replacements in the final trace.

The16MP input bound,30-second cancellation deadline, bounded thinning iterations,20,000-path limit and cooperative event-loop yields constrain processing. These are operational bounds, not geometry acceptance relaxation. On the confirmed836×1080 source the registered view is the original frame. Existing architectural residual thresholds and calibration transforms are unchanged. Source-view fitting tolerances are not claimed to certify an arbitrary resampled original frame.

## Clean traced drawing (source-strokes-v3)

When the local vectorizer read the page, its evidence carries `drawing` (exporter 0.28.1+, `app_drawing.py`, switch `AE_DRAWING`): stage 1's own vector drawing of the page in source pixels - every wall it read, whether or not it closes a room, outlined walls, doors with their swings, windows, fixtures, dimension and other lines - as path items in the trace's M/L/C/Z form, plus the boxes of the lettering it found (read or not). The adapter registers it to the rendered page (`vectorizer-drawing.ts`). Given that drawing, `extractSourceArtwork` makes the clean traced drawing (J, 15 Oct: "trace and reproduce a clean 2D vector floor plan"), in this order:

- **Paper** (`source-trace-paper.ts`): a page printed on a tint is taken to white against its local background, and a website's watermark - pale ink in strokes far fatter than any line - is taken to white with its rim, the same two rules stage 1 reads the page with (`flatten_background`, `remove_watermark`); a piece lying mostly on the drawing's ink or in a text box is the plan's own and stays. A page drawn black on white is left as it is.
- **The reading, checked against the picture** (`source-trace-clean.ts`, `source-trace-walls.ts`, `source-trace-doubles.ts`): a stroke with less than 35 % of its length on ink is left out (its ink is traced instead), and so is a door swing running a third of its length well inside a wall, with the door's other swing (s001's basin read as a double door through the bath wall). Walls are drawn as the plan draws them (J, 15 Oct: "As drawn"): a wall whose inside is ink - black, painted grey or hatched - stays solid, each face moved onto the edge of its ink (the crossing nearest the face, at most 4 px; a wall with holes stays as it is); a wall with paper inside is drawn as the sides the plan draws; a wall the reading also outlined (a hatched wall) loses the outline, which stood half its weight out past the faces. Each straight line of the reading is moved onto the centre of its ink (the dark peak nearest it, found along most of its length and running straight) and drawn at the weight of that ink - a thin line grey or softened by blur as full-tone ink of the same weight (at least a pixel), a band wider than 4 px (a wall painted grey) as wide as it is; each dimension dot goes onto the centre of its darkest ink. Lines are then carried on along their ink. Faces are then made flat (`source-trace-flat-faces.ts`; J, 15 Oct: a wall is flat "until there is a step in the floor plan itself"): the level and plumb faces of the walls, of the lines lying on them and of lines 2 px or heavier, that run along one line, face the same way and meet end to end (or lie on each other) become one face on the outermost one's line - always within 1.5 px, and up to 3 px where the plan's ink beside the joint shows no step (its edge jumping less than 1 px, or less than half the step) - so a wall only grows onto the face beside it, a line's weight changes by at most 30 %, and two shapes with paper between stay two. Each line's ends are then joined onto the lines they meet, a joined end running on to the far face of the line it meets, so a corner is square whatever the two weights. On the 18 review plans this took the steps in the walls' outline (with every line on them) from 783 to 295 (h1 33 to 6), the drawing check unchanged. The drawing's shapes become the trace's first paths (`clean-<kind>-<n>`), and the ink they explain (within 1.5 px) leaves the mask.
- **Lettering** (`source-trace-lettering.ts`, `source-trace-fine.ts`) is never redrawn from the reading: each text box, grown over any letter it cuts through, is traced from the picture four times finer and cut at the tone half-way between its paper and its darkest ink, so letters keep the source's own weight with smooth edges (`letter-<n>`); a faint box (a watermark) is left out, a low-contrast one goes to the general pass.
- **Marks** (`source-trace-marks.ts`, `source-trace-mark-shapes.ts`): of the ink left, each piece up to 250 px across is cut, four times finer, at its own strokes' mid-tone (a light line running into a black dot keeps its weight); a round core (a dimension's dot, the line ends running into it) becomes a true circle, a core that fills its box (a frame's square post) a rectangle carried onto the drawing beside it; thin pieces become sharp strokes along their centres at the weight of their ink - a dash, a door's swing, a window's glazing lines and mullions, a frame's step - fitted with straight lines meeting at sharp corners unless they curve (a swing); the rest are smooth filled shapes (`mark-<n>`). A stroke running along the drawing's own ink (median within 1.5 px) is a line the drawing already has and is left out; faint pieces and the drawing's soft edges (within 3.5 px, no dark core) are left out; beside the lettering nothing is turned into strokes.
- **The general pass** traces what is left (pieces bigger than a mark, thinned to their mid-tone first) as before, without a traced line that doubles a drawn one or is only its soft edge. A piece the fitting cannot bound is fitted on its own or left out, rather than failing the trace.

Without a drawing the trace is `source-strokes-v2`, unchanged. Both the upload's trace (`attachRasterSourceArtwork`, after the vectorizer) and a retrace preview (`previewSourceTrace`, from the retained review extraction of the same frame) use the drawing when the page has one. The clean shapes carry the vectorizer's reading only as drawing: no building meaning or metric scale. Measured on the 13 sharp corpus plans (paper cleared, within 2 px): 98.5 % or more of the page's ink is drawn, and 96.9 % or more of the drawing lies on ink (walls painted grey or hatched, drawn solid, account for the rest).

## Faithful trace (faithful-trace-v1)

J, 22 Oct 2026: "get the app to produce these blurry lines as clean sharp vectors". With `FLOOR_PLAN_FAITHFUL_TRACE=1`
on the process that runs imports, a clean page is drawn by the faithful trace (`services/floorplan-vectorizer/
faithful_trace.py`, r6, run by `faithful_drawing.py` after stage 1 and the exporter): what is drawn, copied as clean
vectors - solid fills as polygons with straight edges, every line, arc and dot fitted at its own width and grey,
lettering and small marks copied by their outline. Nothing is read as a room, a door or a wall. Its drawing replaces
stage 1's in the evidence (`version: "faithful-trace-r6"`), with each item's grey as `tone` (0 black - 255 white) and
no `textBoxes`.

`extractSourceArtwork` takes such a drawing as the trace itself (`source-trace-faithful.ts`): its items become the
paths (`faithful-<kind>-<n>`) as they are, with their tone. None of the v3 passes run - the drawing is not moved
against the picture, and no lettering, marks or leftovers are traced from it - because the faithful trace already lies
on the page's ink and copies the lettering itself. The tone is carried into the source-drawing annotations
(`tone`, validated 0-255), drawn by the review overlay, the compare wipe and the retrace preview
(`sourceDrawingInk`), and by the SVG and PDF export; a path without a tone keeps the view's own ink. The retrace
preview reuses the retained drawing, so it needs no Python.

How the trace is carried: fills one item per polygon, rings wound by nesting depth so the nonzero rule fills them as
the trace's even-odd rule does; lines carried on by half their width at both ends (the trace draws square caps, the app
butt caps), lines of one width and grey grouped as separate sub-paths; arcs as cubics of at most 90 degrees; dots as
filled circles; lighter strokes listed first so darker lines lie over them, light lines through dark fills last. On ten
test plans, the app's drawing of the trace (drawn as the review overlay draws it) differs from the trace's own SVG, at
1x and 3x, on at most 0.12 % of the ink pixels by more than 64 grey levels; the differences are that order (a dark band
drawn over light stipple dots the trace had left on top of it).

Only a clean picture: crisp (stage 1's edge softness at most 1.4). Up to `FLOOR_PLAN_FAITHFUL_TRACE_MAX_PIXELS`
(default 4,000,000) it is traced at twice its size (about 400 MB of memory per million pixels, 30-50 s per page on one
core); up to three times that, at its own size (about 110 MB per million pixels; lines a pixel apart may merge).
Otherwise, and on a failure or timeout (`FLOOR_PLAN_FAITHFUL_TRACE_TIMEOUT_MS`, default 240000), the page keeps stage
1's drawing (v3) and its notes say why. Stage 1's rooms, walls, openings and scale are unchanged either way.

## Storage and review

Final artwork uses existing source-drawing annotations with configuration `source-artwork-trace-v1`, M/L/C/Z commands, fills, source dimensions and grouping IDs. Raw extraction candidates, OCR text and semantic proposals remain separate configurations/layers. This is not a second canonical wall model.

Normal raster upload runs artwork tracing after local OCR, regardless of scale/topology success. The review exposes source-only, vectors-only, overlay and optional raw diagnostics. Individual paths/control points can be edited, moved and locally undone, then saved through existing candidate persistence. Source-space artwork remains unavailable as measured3D building geometry until the independent architectural review succeeds.

Retrace previews use the owner-scoped retained derivative and checksum. Retention and candidate version are rechecked under existing source/job locks before writing preview assets or a separate child review. Accept revalidates image/source/page/version, preserves the parent, and refuses to replace final paths carrying consumer corrections. Client cancellation and keyed review sessions discard stale preview responses. A saved design is never replaced by tracing.

PDF/SVG reuse the existing vector writer with explicit source-pixel page fitting and a no-physical-scale label. Final artwork exports exclude raw proposals, canonical building geometry and embedded raster. The prior measured architectural export remains protected by its existing scale/junction/window/font/underlay regressions.

## Evidence and limits

Only synthetic generic cases enter repository tests. Private source, captured model data, independent source samples, reports, PDFs and browser captures live outside Git. The evaluation inventory is not an extractor input. Named crop checks cover clear strokes, finite spans, endpoints, curves, gaps, parallels and duplicate multiplicity; raster support alone is insufficient. The prior purple diagnostic dashes were proposal styling, not evidence of printed dashes.

The recovered right-side artwork retains observed rails, transverse bars and internal line; it is not replaced with a window template. Blurred junction silhouette, small dark marks and partially OCR-covered text remain explicit limitations. Clean tracing does not establish room semantics, site dimensions, construction accuracy, full-plan recall or independent real-plan coverage.
