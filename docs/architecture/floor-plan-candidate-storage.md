# Floor-plan candidate storage

An import's candidate (`FloorPlanImportJob.candidateJson`, the plan document under review) can be stored with its
source drawing packed. The canonical `FloorPlanDocumentV2` every reader uses is unchanged: packing is a storage and
transfer form only, owned by `lib/floor-plan-imports/candidate-storage.ts`. Decided 28 Oct 2026 (J: "proceed with what
is best for my webapp long term", then "proceed with both").

## Why

A traced page holds thousands of source-drawing marks: each segment of the PDF's own vector paths
(`source-drawing-annotations.ts`), each OCR word, and each path of the faithful trace (`floor-plan-source-trace.ts`).
Every mark repeats its page frame, scope, provenance and explanation. Measured on the live site on 28 Oct 2026 for
111 Emerald Hill p24 (`needs_review`): the candidate was 5,205,085 bytes, and 6,384 marks took 5,080 KB of it while
carrying 3 distinct provenance blocks between them. Packed, it is 6.05 times smaller (6 templates, 118 texts) and
unpacks to the same JSON.

## The packed form (`source-drawing-pack-v1`)

A packed floor keeps its other annotations in `annotations` and adds `sourceDrawingPack`:

- `templates`: each distinct mark with its `id`, `text`, `geometry.points` and per-mark geometry fields set to `null`
  (so key order survives); every template is a `source_drawing` mark;
- `texts`: each distinct `text`;
- `marks`: `[template, id, text, points as x0,y0,x1,y1…, extras?]`, where extras hold the per-mark geometry fields
  under short names (`pathCommands` as one string like `"LCZ"`, `groupId`, `strokeWidthPx`, `tone`, `fill`,
  `textRotationDegrees`);
- `runs`: `[index, count]`, where consecutive marks sat in the unpacked `annotations`.

Only `source_drawing` marks whose points are exactly `{ x, y }` finite numbers, and whose per-mark fields have the
types the document allows, are packed. Anything else stays in `annotations` as it is. A floor with no such marks, and
anything that isn't a candidate with `floors` (the page-selection envelope, for one), is stored as it was.

## Where it applies

- **Every write goes through `packFloorPlanCandidateForStorage`:** the import repository (the worker's stage results),
  page selection, consumer and admin review saves, photo and traced reviews (their child jobs), supplementary and
  construction sources, and review seeds. Review saves are sent in the same form.
- **Every server read unpacks**, through `unpackFloorPlanCandidate` or `compileCandidateFloorPlanDocumentV2` (which
  calls `parseCandidate`, which unpacks). The import, process and admin routes answer with the unpacked candidate, so
  the review, the admin workspace, Compare and exports see the canonical document. A save is checked as the canonical
  document whichever form it came in; hashes are of the unpacked candidate.
- **The cap stays on the unpacked candidate.** `parseCandidate` accepts either form, unpacks it, and refuses one whose
  unpacked JSON is over 5 MB. A design keeps the whole canonical document (`floorPlan.canonicalDocument`, written by
  `floor-plan-legacy-adapters.ts`) and is itself capped at 5 MB on save, so packing the candidate alone can't let a
  page hold more. A larger page needs the design's copy packed too: a separate change.
- **Guards:** `scripts/check-floor-plan-architecture.mjs` fails when an app or lib file writes `candidateJson` other
  than through `packFloorPlanCandidateForStorage` (shorthand included), or when a server file reads it without
  unpacking or compiling it anywhere. `scripts/test-floor-plan-candidate-storage-routes.ts` checks that the import,
  admin and process routes answer unpacked, and that a packed save is checked and stored exactly as the plain one.

## Limits and errors

- A malformed pack (unknown format, a template that isn't a source-drawing mark, a mark naming a missing template or
  text, points that aren't finite numbers, a per-mark field of the wrong type, runs that don't account for every mark)
  throws `Malformed source drawing pack: …`; a client that sends one gets the review route's 400.
- One candidate's packs may expand to at most 16 MB (`MAX_UNPACKED_SOURCE_DRAWING_BYTES`, their JSON, roughly),
  counted across all its floors, so a small pack can't unpack into far more than the cap. Packing applies the same
  count: a candidate whose packs would pass it is stored unpacked, so whatever is stored can be read back.

## Rollout

Older code doesn't know the pack: it compiles a packed candidate without its source drawing, and checks it applies to
annotations (sanitising a save, refusing a retrace over edited paths, keeping source marks out of a published plan)
don't see the packed marks. So no build that could still be running, or be rolled back to, may meet a packed
candidate. Packing ships in two releases:

1. **Read both forms** (28 Oct 2026, `STORE_SOURCE_DRAWING_PACKED = false`): every reader unpacks, and every write
   site and review save goes through `packFloorPlanCandidateForStorage`, which gives the candidate unpacked. Nothing
   is stored or sent packed, so the app and the worker can be deployed in either order.
2. **Store packed** (a later release, once the first is live on the app and the worker): set
   `STORE_SOURCE_DRAWING_PACKED = true`. The tests follow the switch. From then on, roll back no further than the first
   release: it reads, checks and publishes packed candidates as their unpacked form.

A future format follows the same two steps: readers first, then writers.

## Not changed

The canonical document and its compiler, the design's copy of it, published revisions (stored apart from the
candidate), the public document, exports, Compare and the review's own state.
