# Dimension association and uncalibrated review

The raster importer can use semantic endpoints to search a bounded area of the registered image. A hint alone is not a dimension measurement: both end ticks, their crossing witness strokes and the intervening dimension line must have pixel support. Ambiguous or absent support remains a review proposal. Dimension strokes are kept outside wall linework and cannot close architectural faces.

The defect was threefold: a nearby midpoint could outrank incorrect endpoints; collinear fragments could extend a measurement across adjacent dimension chains; and OCR deduplication could drop useful supplemental endpoints or a nearby, different printed number. Candidate filtering now checks both endpoints. Number provenance remains separate from supplemental endpoint provenance; different numeric observations remain distinct.

`raster-dimension-spans.ts` samples the exact registered derivative, checks its dimensions and records its digest, pixel frame, original hints, detected ticks, continuous-line coverage and rejection reason. It does not resize or rectify an image. Existing normalization transforms remain the authority for source/rendered coordinates. A span with failed pixel support cannot silently fall back to an unrelated raster fragment.

Scale clustering, source tolerances and topology gates are unchanged. Independently supported tick spans are cross-checked against the selected scale. The intersection of each span's permitted scale interval also exposes cases where no common scale can satisfy all observed dimensions; conflicting spans are not averaged or discarded.

## Captured semantic handoff

| Observation | Existing consumption | Review and limits |
| --- | --- | --- |
| Literal room labels | Label-to-source/face matching | A label does not establish a boundary. |
| Dimension values, orientation, text bounds | Dimension observations and scale candidates | OCR number provenance retained when matching a supplemental observation. Different numbers are not duplicates. |
| Dimension endpoint hints | Bounded raster tick search | Continuous source-line support required; coordinates remain proposals until reviewed. |
| Room polygons | Existing source-supported boundary registration | Uncalibrated edges additionally retained as dashed reference annotations; never direct canonical rooms. |
| Opening spans, kinds and operations | Existing source/wall support and host checks | Dashed reference spans retained without scale. Symbol classification and door operation still require review. |
| Fixture boxes | Existing fixture matching after supported room registration | No standalone geometry is created while topology is unavailable. |
| Extra wall-band observations outside semantic schema | Private diagnostic overlay only | Not passed through as authored walls or added to the canonical graph. |
| Uncertain regions and notes | Private response comparison and existing semantic notes where supported | No uncertainty is converted into verification. |

The one authorized response is replayed offline. There is no new recognition route, retry, provider fallback or production enablement in this change. Detailed client imagery, observations, response and overlays remain outside Git.

## Consumer correction before topology

The source workspace retains raw marks and uncalibrated room/opening/dimension proposals as reference annotations. A selectable dimension offers **Use these endpoints for scale review**. It replaces the two selected scale points atomically without creating walls or treating the number as confirmed. The consumer can choose different endpoints, enter the printed value and save an independent check through existing controls. Corrections and residuals are persisted on the draft calibration; original proposals remain separate reference artwork. Source/construction verification is not granted.

Selecting a primary measurement supplies a draft registration, not proof that every source dimension agrees. Existing independent-check conflicts are recomputed and block confirmation. The actual source still requires an adequate calibration plus supported boundary/opening extraction before the full editor journey can pass. The local browser harness exercises the actual Consumer UI and a fresh importer run from uploaded original bytes; HTTP/versioned persistence is an explicit local test boundary, not live database certification.

## Mapping boundary and validation

Existing source registration supports similarity and affine mappings and their inverse. Diagnostic fits must declare their controls and assumptions, report residuals in the original defined source-pixel frame and reserve separate spans for checks. A derived computational control is not an independently surveyed architectural anchor. Display crop/zoom is excluded from residuals.

A failed affine hypothesis does not prove a particular distortion model. Perspective, paper curvature, original drafting inconsistencies or misinterpreted witness edges require additional source evidence. This change does not introduce arbitrary warping, force rectangular rooms, or fabricate metric coordinates. Printed endpoint confirmation is distinct from site measurement.

Focused regression coverage includes adjacent dimension chains, tempting short fragments, blank images, competing ticks, slightly slanted dimensions, mismatched pixel frames, stale hints, exact-value merge provenance, contradictory dimensions and reference-only annotation scope. Existing scale, import lifecycle, export and repository gates remain required for the checkpoint.
