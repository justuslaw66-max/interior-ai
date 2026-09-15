# Dimension association and uncalibrated review

The primary consumer case is a photo with no original PDF or better scan available. Recovery must work from that photo and its visible dimensions, asking only for a minimal concrete confirmation when the geometry is underdetermined. A replacement file is optional, not an acceptance prerequisite.

The raster importer can use semantic endpoints to search a bounded area of the registered image. A hint alone is not a dimension measurement: both end ticks, their crossing witness strokes and the intervening dimension line must have pixel support. Ambiguous or absent support remains a review proposal. Dimension strokes are kept outside wall linework and cannot close architectural faces.

The defect was threefold: a nearby midpoint could outrank incorrect endpoints; collinear fragments could extend a measurement across adjacent dimension chains; and OCR deduplication could drop useful supplemental endpoints or a nearby, different printed number. Candidate filtering now checks both endpoints. Number provenance remains separate from supplemental endpoint provenance; different numeric observations remain distinct.

`raster-dimension-spans.ts` samples the exact registered derivative, checks its dimensions and records its digest, pixel frame, original hints, detected ticks, continuous-line coverage and rejection reason. It does not resize or rectify an image. Existing normalization transforms remain the authority for source/rendered coordinates. A span with failed pixel support cannot silently fall back to an unrelated raster fragment.

Scale clustering, source tolerances and topology gates are unchanged. Independently supported tick spans are cross-checked against the selected scale. The intersection of each span's permitted scale interval also exposes cases where no common scale can satisfy all observed dimensions; conflicting spans are not averaged or discarded.

## Captured semantic handoff

| Observation | Existing consumption | Review and limits |
| --- | --- | --- |
| Literal room labels | Label-to-source/face matching | A label does not establish a boundary. |
| Dimension values, orientation, text bounds | Dimension observations and scale candidates | The current stage's preferred number provenance is retained (OCR in local-preferred mode, vision in selected-page replay). Different numbers are not duplicates. |
| Dimension endpoint hints | Bounded raster tick search | Continuous source-line support required; coordinates remain proposals until reviewed. |
| Room polygons | Existing source-supported boundary registration | Uncalibrated edges additionally retained as dashed reference annotations; never direct canonical rooms. |
| Opening spans, kinds and operations | Existing source/wall support and host checks | Dashed reference spans retained without scale. Symbol classification and door operation still require review. |
| Fixture boxes | Existing fixture matching after supported room registration | No standalone geometry is created while topology is unavailable. |
| Extra wall-band observations outside semantic schema | Private diagnostic overlay only | Not passed through as authored walls or added to the canonical graph. |
| Uncertain regions and notes | Private response comparison and existing semantic notes where supported | No uncertainty is converted into verification. |

The selected-page captured replay already retained all dimension hints; the separate OCR-preferred merge regression is not presented as its topology failure cause. The one authorized response is replayed offline. There is no new recognition route, retry, provider fallback or production enablement in this change. Detailed client imagery, observations, response and overlays remain outside Git.

## Consumer correction before topology

The source workspace retains raw marks and uncalibrated room/opening/dimension proposals as reference annotations. A selectable dimension offers **Use these endpoints for scale review**. It replaces the two selected scale points atomically without creating walls or treating the number as confirmed. The consumer can choose different endpoints, enter the printed value and save an independent check through existing controls. Corrections and residuals are persisted on the draft calibration; original proposals remain separate reference artwork. Source/construction verification is not granted.

Selecting a primary measurement supplies a draft registration, not proof that every source dimension agrees. Existing independent-check conflicts are recomputed and block confirmation. The actual source still requires an adequate calibration plus supported boundary/opening extraction before the full editor journey can pass. The local browser harness exercises the actual Consumer UI and a fresh importer run from uploaded original bytes; HTTP/versioned persistence is an explicit local test boundary, not live database certification.

## Mapping boundary and validation

Existing source registration supports similarity and affine mappings and their inverse. Diagnostic fits must declare their controls and assumptions, report residuals in the original defined source-pixel frame and reserve separate spans for checks. A derived computational control is not an independently surveyed architectural anchor. Display crop/zoom is excluded from residuals.

A failed affine hypothesis does not prove a particular distortion model. Perspective, paper curvature, original drafting inconsistencies or misinterpreted witness edges require additional source evidence. This change does not introduce arbitrary warping, force rectangular rooms, or fabricate metric coordinates. Printed endpoint confirmation is distinct from site measurement.

Focused regression coverage includes adjacent dimension chains, tempting short fragments, blank images, competing ticks, slightly slanted dimensions, mismatched pixel frames, stale hints, exact-value merge provenance, contradictory dimensions and reference-only annotation scope. Existing scale, import lifecycle, export and repository gates remain required for the checkpoint.

A later local diagnostic shows that a single projective model can reconcile the observed dimension lengths, but lengths from two nearly parallel direction families do not uniquely determine shear/angles. A low residual alone must not authorize a skewed reconstruction. Require a separately supported geometric relationship (for example one confirmed corner angle), preserve invertible original-pixel reprojection and held-out checks, and keep the resulting capability scoped to source calibration. This does not authorize arbitrary per-room warping or a geometry-engine restart.

## Confirmed photo-calibration prototype and remaining product boundary

One user-confirmed square corner supplies the missing angular constraint. A bounded global projective fit then passes the predeclared original-pixel holdouts. The original and derived raster remain distinct, with digests and an exact inverse mapping. No local room warp or architectural coordinates are supplied. A private replay with one recorded OCR reading correction produces only three partial room outlines; it is not Consumer Mode acceptance or production photo correction.

The current source calibration type stores control points fitted by similarity/affine projection. `projectReviewSourcePointToPlan` inverts that affine basis; `registered-underlay.ts` decomposes it into affine image placement. Adding extra controls cannot make those paths projective. A scoped source-normalization extension must own the derivative and its original-pixel transform, preserve confirmed reading/corner evidence across versioned reprocessing, and evaluate checks in their declared original frame. Consumer endpoints must remain editable before topology exists. Keep the existing document, review workspace, importer, editor and exports.

The offline fallback can register a supported subset despite incomplete apartment coverage. Its completeness metric is not a whole-plan acceptance score. Source-supported room edges also do not establish measured wall thickness or interior/exterior classification. The reporting patch explicitly calls fallback thickness assumed and describes generated dimension counts without asserting exact reconciliation. It changes no geometry, confidence, readiness severity or acceptance threshold. Remaining centerline, missing-boundary and opening evidence must be resolved before claiming the real consumer journey passes.
