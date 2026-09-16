# Source artwork tracing

The source artwork is reference material, independent of metric calibration and architectural proposals. The user requested visible drawing recovery before further room interpretation. Original images, prior candidates and saved designs are preserved.

## Extraction and coordinates

`source-artwork-trace.ts` decodes the explicitly selected review image with Sharp without resizing or rectifying it. The grayscale mask combines bounded local contrast with absolute dark-ink retention. Components smaller than three pixels are excluded as specks. Morphological opening identifies broad observed fills; pixel-cell contours preserve their silhouette and holes. Stroke thinning preserves topology, and each undirected graph edge is consumed once, avoiding multiple threshold/pass duplicates. Junctions split paths for independent editing; ordinary continuation remains one chain.

Normal-direction grayscale refinement is limited to half a selected-source pixel. Finite caps extend by at most three pixels through contiguous observed ink, stopping at blank or filled pixels. Lines and least-squares cubic spans fit the observed finite chains within0.65 selected-source pixels, checking both observed and generated spans. No semantic arc, completed circle, angle snapping, room closure or gap repair is supplied. Fills use linear contours; genuine disconnected dashes stay disconnected.

Existing local OCR boxes select observed glyph paint only. Pixels in plausible text boxes are preserved as source-derived fills; no drawing pixel is erased and no OCR string becomes replacement glyph geometry. Suspected rail/punctuation readings remain strokes. Partially recognized text may therefore retain mixed representations. Text readings remain separately inspectable and never appear as accidental duplicate replacements in the final trace.

The16MP input bound,30-second cancellation deadline, bounded thinning iterations,20,000-path limit and cooperative event-loop yields constrain processing. These are operational bounds, not geometry acceptance relaxation. On the confirmed836×1080 source the registered view is the original frame. Existing architectural residual thresholds and calibration transforms are unchanged. Source-view fitting tolerances are not claimed to certify an arbitrary resampled original frame.

## Storage and review

Final artwork uses existing source-drawing annotations with configuration `source-artwork-trace-v1`, M/L/C/Z commands, fills, source dimensions and grouping IDs. Raw extraction candidates, OCR text and semantic proposals remain separate configurations/layers. This is not a second canonical wall model.

Normal raster upload runs artwork tracing after local OCR, regardless of scale/topology success. The review exposes source-only, vectors-only, overlay and optional raw diagnostics. Individual paths/control points can be edited, moved and locally undone, then saved through existing candidate persistence. Source-space artwork remains unavailable as measured3D building geometry until the independent architectural review succeeds.

Retrace previews use the owner-scoped retained derivative and checksum. Retention and candidate version are rechecked under existing source/job locks before writing preview assets or a separate child review. Accept revalidates image/source/page/version, preserves the parent, and refuses to replace final paths carrying consumer corrections. Client cancellation and keyed review sessions discard stale preview responses. A saved design is never replaced by tracing.

PDF/SVG reuse the existing vector writer with explicit source-pixel page fitting and a no-physical-scale label. Final artwork exports exclude raw proposals, canonical building geometry and embedded raster. The prior measured architectural export remains protected by its existing scale/junction/window/font/underlay regressions.

## Evidence and limits

Only synthetic generic cases enter repository tests. Private source, captured model data, independent source samples, reports, PDFs and browser captures live outside Git. The evaluation inventory is not an extractor input. Named crop checks cover clear strokes, finite spans, endpoints, curves, gaps, parallels and duplicate multiplicity; raster support alone is insufficient. The prior purple diagnostic dashes were proposal styling, not evidence of printed dashes.

The recovered right-side artwork retains observed rails, transverse bars and internal line; it is not replaced with a window template. Blurred junction silhouette, small dark marks and partially OCR-covered text remain explicit limitations. Clean tracing does not establish room semantics, site dimensions, construction accuracy, full-plan recall or independent real-plan coverage.
