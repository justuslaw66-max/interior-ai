# Floor-plan import platform

This application treats a floor plan as evidence-backed geometry, not as an image that can be guessed into a room list. `FloorPlanDocumentV2` is the canonical source for editing, 2D rendering, 3D extrusion, persistence, address-library revisions, and export.

## Upload workspace accessibility lifecycle

The upload/import UI is a `FULL_SCREEN_MODAL_WORKSPACE`, not a compact dialog.
Its existing mobile `100dvh` portal and desktop composition use the shared
editor dialog registry for one modal owner, background isolation, contained
Tab order, topmost Escape/backdrop, semantic return, registered-child
supersession, and stack-safe body-scroll locking. Consumer import-2D, Pro
start-upload, empty Surfaces, address library, Import, and workspace-launch
actions have stable semantic identities; route/design/mode/plan/auth scope
replacement cancels stale restoration.

The production Empty Surfaces action has the same lifecycle wiring, although
its existing integrated call sites are `hasRooms`-gated while its empty-state
card requires `!hasRooms`. This batch does not make that otherwise unreachable
product state visible. Required browser coverage mounts the exact production
action and workspace deterministically, and the static owner locks its
integration wiring.

The import state machine remains owned below the shell. Empty selection, PDF
page selection, processing, calibration/review, ready, failure/retry, and
history states expose an intentional current focus target without becoming a
second workflow store. Inline history delete confirmations remain under their
existing behavior pending a separate product decision; the parent merely
refuses generic close while a confirmation is visible.

## Accuracy contract

- `needs_review` is the default for extracted and migrated geometry.
- `source_verified` requires licensed publication-rights evidence, a separately recorded source-observation manifest, one-to-one mappings for every observed and canonical critical entity, exact dimension reconciliation, registered source anchors, topology validation, and reviewer approval.
- `construction_verified` additionally requires unit-specific CAD/as-built documents or site measurements.
- Assumed floor elevations, wall/structure base offsets, wall/structure heights, door/window heights, sills, slabs, or storey heights remain visibly marked `assumed` until supported evidence or a user/site measurement confirms them.
- Extraction failure never creates invented rooms. Upload and review are isolated from the open design, so a failed import cannot overlay or mutate existing rooms and furniture.

The seven Ping Yi Court documents are internal golden regression fixtures and remain `needs_review` until their source overlays and manifests pass every publication gate. Their schema-v1 YAML catalog is locked to `draft` + `review_only`; its unknown source licence and unresolved address transforms are preserved. It is available to authenticated admins for source/preview comparison and to internal regression tests, but consumers cannot search, browse, or apply it.

`generatePingYiCourtV2ReviewSeedBundle` now produces stable native `FloorPlanDocumentV2` review revisions for all seven layouts from that compatibility catalog plus the independent source manifest. Each bundle retains the source-page dimension inventory, corrected room/opening/structure assertions, unresolved evidence, official brochure reference, and the exact `810A` stacks `509`/`527` -> `3gen` binding. The source PDFs are represented as V2 sources, while every geometry entity deliberately retains `legacy` evidence and every unresolved manifest item remains a critical review issue. Printed dimensions without registered canonical endpoints stay in the bundle's evidence inventory instead of becoming invented `FloorPlanDimensionV2` geometry.

Run `npm run generate:floor-plan-ping-yi-v2-seeds` for a review summary, or add `-- --output <path>` to materialize the deterministic JSON bundle for an ingestion/review handoff. Generated review seeds do not alter publication state and are not an approval shortcut. Their geometry hashes are locked by `npm run test:floor-plan-ping-yi-v2-seeds`.

Consumer `/api/floor-plans` search and browse are canonical-database-only. A result exists only for an immutable published revision with revalidated address-binding evidence. The API fails closed when that store is unavailable and never serves a YAML compatibility plan as a fallback. Promoting a fixture requires normal ingestion and independent canonical approval; editing YAML cannot manufacture publication or licence evidence.

Optional rooms and partitions remain annotations in the default canonical document. `FloorPlanOptionalConfigurationPanel` shows those source marks before a private import is confirmed and before an address-library revision is applied. `resolveFloorPlanAuthoredConfiguration` accepts only a complete authored revision whose revision ID, geometry hash, source identity/page and direct entity evidence match its approved configuration record; annotation points, polygons, labels and dashed lines are never executable patches. The immutable authored-variant lifecycle now stores complete revision and address-binding links, requires reviewer approval followed by a different publisher, and exposes only published groups whose exact revision, geometry hash, source evidence and transform remain valid. The Ping Yi Type 2 review seeds describe the intended open/partitioned relationship but remain unpublished review fixtures. `SUGGESTED STUDY` has no complete authored alternate geometry and therefore stays visibly annotation-only rather than becoming a guessed transformation.

## Import lifecycle

`received -> rendered -> extracted -> selecting_page -> scale_solved -> topology_built -> validating -> needs_review -> ready -> applied/published | failed`

`selecting_page` is used only when an enhanced image/PDF import has multiple candidate plan pages. The background queue ignores an unselected job. `POST /api/floor-plan-imports/:id/select-page` records one owner-confirmed page with optimistic candidate versioning and marks the job resumable without reversing its lifecycle. Single-page and legacy jobs skip this pause.

Processing stages are lease-guarded and resumable. Production defaults to `FLOOR_PLAN_PROCESSING_MODE=background`: the process endpoint acknowledges the durable queued job and never ties extraction to the browser or HTTP request lifetime. Run `npm run worker:floor-plans` as a persistent worker; scheduled deployments can invoke it with `--once`. Expired leases resume from the last committed stage, while stale workers are prevented from committing. `inline` remains available for local or single-process development and must not be used as the only production worker.

`GET /api/health?deep=1` includes queue depth, active and expired leases, recent failures, and the oldest queued age. `FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS` controls the queue SLO reported by that check; an expired lease fails health, while queued work without an active lease or work older than the SLO reports degradation.

Every committed pipeline transition emits a bounded local operational event and a best-effort durable `FloorPlanImportStageEvent` with stage duration, adapter version, aggregate issue counts and allowlisted numeric/boolean/null extraction metrics. Observer failures cannot fail or retry a successfully committed stage. The event schema and sanitizer exclude user IDs, filenames, source hashes, addresses, labels, review text and geometry; metric names are code-owned so dynamic labels cannot be smuggled through keys. External analytics export is not enabled by this pipeline.

Public search revalidates immutable publication and binding evidence on every uncached request and fails closed. Run `npm run audit:floor-plan-serving-integrity` from monitoring/cron to deeply recompile every published revision, recompute its geometry hash, recheck opaque IDs and every address binding, and emit a non-zero result if a revision has become unservable.

Consumer endpoints:

- `POST /api/floor-plan-imports`
- `GET /api/floor-plan-imports/:id`
- `PATCH /api/floor-plan-imports/:id/candidate`
- `POST /api/floor-plan-imports/:id/select-page`
- `POST /api/floor-plan-imports/:id/process`
- `POST /api/floor-plan-imports/:id/confirm`
- `DELETE /api/floor-plan-imports/:id/source`

Upload ingress is bounded before multipart parsing. The route authenticates and rate-limits the caller before reading the body, validates declared length and media type, then reads at most the 25 MB file allowance plus 1 MB of multipart framing. It cancels the upstream stream as soon as that bound is crossed, so a missing or forged `Content-Length` cannot trigger unbounded buffering. The reconstructed multipart request carries only the validated content type; untrusted length or transfer-encoding headers are not copied.

The import limit is enforced both by the process-local fast path and by atomic Postgres `ApiRateLimitBucket` counters shared across application instances. Bucket keys are HMAC-SHA-256 digests, not stored user IDs. Production must set `API_RATE_LIMIT_HASH_SECRET` to at least 16 characters, or supply an existing `AUTH_SECRET`/`NEXTAUTH_SECRET` of that length; limiter configuration or database failure returns `503` before the upload is accepted. Deploy the `20260716213000_add_shared_api_rate_limit` Prisma migration before enabling imports. Expired buckets are removed through the indexed cleanup performed by the limiter.

Confirmation is always explicit, creates a new saved design, and never overwrites the design that was open during upload. The editor opens that design in the 2D Furnish workspace with no furniture. Its selected source page is attached as a locked, initially hidden reference layer with an owner-scoped asset URL. Candidate and page-selection updates use optimistic `candidateVersion` checks, and the server sanitizes consumer corrections so source identity, evidence tier, and verification status cannot be forged.

Every design create and update transaction also synchronizes a one-to-one `FloorPlanDesignReference`. Revision, import-job and address-binding foreign keys are accepted only after owner and cross-lineage validation; geometry and source hashes must agree with the durable records. Private imports may retain their synthetic document revision inside snapshot JSON, but only their owner-scoped persisted job becomes an indexed foreign key. Legacy or local synthetic revisions without a durable job remain JSON-only so compatibility designs continue to save without manufacturing a database relation. Removing floor-plan lineage from a snapshot removes the projection in the same transaction.

When a library revision supersedes another, a reviewer first creates an approved immutable replacement while the prior revision remains live. A different authorized publisher then retires the old revision and publishes the replacement in one serializable transaction. Standalone withdrawal requires an exact admin confirmation phrase and preserves the immutable geometry, bindings and audit history. Existing designs continue to load their saved revision; the editor offers an explicit compare-and-copy action that first saves the current design, creates a separate design from the replacement revision, and copies only compatible room-scoped furniture, finishes, zones and views. It never mutates the original design or guesses across ambiguous room IDs.

Admin review is available under `/admin/floor-plans`. Approval derives publication gates on the server; client-supplied claims are not trusted. Published revisions are immutable, and overlapping address bindings are rejected in both application code and the database.

The reviewer records a versioned `FloorPlanSourceObservationManifest` through typed controls. It starts empty and is never prefilled from extracted candidate geometry. Each visible wall, opening, structure, room label and printed dimension is tied to a durable source page, bounded crop and source-pixel anchors, then manually mapped to exactly one canonical entity. Unmapped source observations, unmapped canonical critical entities, mismatched entity kinds or dimensions, stale candidate mappings, expired rights and out-of-bounds evidence all block approval. Any candidate or attached-source change invalidates the stored observation manifest. Legacy/Ping Yi fixtures remain review-only until this independent work is completed.

Public lifecycle authority is narrower than general admin access. Configure authenticated reviewers in `FLOOR_PLAN_REVIEWER_EMAILS` and publishers in `FLOOR_PLAN_PUBLISHER_EMAILS`. Approval requires the reviewer role; publication requires the publisher role and a different normalized actor identity from the recorded reviewer. Both the API and PostgreSQL enforce that maker-checker separation. Rights evidence records the legal basis, evidence reference, expiry, permission to publish derived geometry and whether the original source asset itself may be redistributed.

Verified publication requires direct source-pixel anchors for every wall and opening. The server recomputes calibration and entity residuals (including arc midpoints) and rejects any required anchor beyond one Euclidean source pixel. A declared RMS value or in-bounds crop alone cannot pass this gate. Approval/publication and their complete address-binding/source snapshots are recorded in an append-only audit log; bindings on approved, published, or retired revisions cannot be mutated or deleted.

An address-searchable binding has its own strict evidence record. It must identify the canonical source asset and SHA-256, a rendered source page, a bounded crop and/or bounded anchors, the observed block, exact stack and floor range, the observed canonical document ID, the supported orientation transform, and an explicit reviewer confirmation. The server replaces any submitted reviewer identity/time with the authenticated admin and transaction time, stores the complete evidence on the binding, and snapshots it in every lifecycle audit. Approval and publication both revalidate it. Search and the public revision route fail closed for legacy published rows without evidence; a starter revision with no address bindings remains valid.

Address evidence may come from the primary plan or an independently uploaded official brochure. Supplementary sources are admin-only, job-scoped assets with separately rendered pages. An admin must explicitly attach the durable source to the canonical review candidate before a binding can cite it; generic candidate JSON updates cannot add, replace or remove source provenance. Supplementary sources can support block/stack/floor/orientation evidence only. They never satisfy the primary geometry, scale, calibration, overlay, dimension or source-publication gates. Once a revision exists, the database rejects supplementary-source mutation.

The public revision endpoint never returns the immutable internal document directly. It creates a deterministic public projection that removes source filenames, URIs and hashes, remaps source/calibration identifiers, removes review timelines and free-form provenance notes, and uses the already-public revision ID as the document ID. The server compiles both forms and refuses the response unless their canonical geometry hashes are identical. Search never derives preview, source, publisher, title, project or room strings from the raw source manifest. A separate one-to-one `FloorPlanRevisionPublicMetadata` record contains only strict allowlisted display fields, is approved with the immutable revision, cannot be updated or deleted, and is required before publication. Browse room summaries come from canonical semantic room types with server-generated names and IDs; missing or invalid display metadata fails closed.

Construction verification accepts only the versioned construction-evidence contract and a separately uploaded, admin-authorized `FloorPlanConstructionSource`. The attachment role is limited to unit CAD, as-built, or signed site-measurement evidence and records its durable asset, hash, evidence kind, authorizing admin, time, and candidate attachment. The primary extraction source and supplementary address brochure are never construction evidence.

The contract requires exact normalized country/address/block/street/stack/floor coverage for every catalog binding served by the revision. Because the evidence manifest is unit-specific, a range or second distinct binding blocks the revision-wide `construction_verified` tier instead of lending one unit's evidence to other consumers. Every critical vertex, wall/arc, opening span, structure polygon, and dimension must have direct provenance to that exact authorized source or a reconciled numeric coordinate signature. Every authored width, wall thickness, and printed dimension requires an exact scalar record for CAD, as-built, and site-measurement evidence alike; ID-only coverage is invalid. Every effective vertical claim must have property-specific provenance to that authorized source or an exact integer-mm manifest measurement; general entity provenance cannot cross-satisfy sibling height, sill, or base-offset properties. Stable IDs cover `vertical:<floor-id>:elevation`, storey height, slab thickness, every floor default, wall height/base offset, opening height/sill, and structure height/base offset. A label, unrelated file, arbitrary JSON object, or one evidence entry reused across sibling properties cannot unlock this tier.

## Adding a source adapter

Implement `FloorPlanSourceAdapter` from `lib/floor-plan-imports/source-adapter.ts` and register it in `createDefaultFloorPlanSourceAdapterRegistry`. An adapter must provide rendering, extraction, scale solving, topology building, and validation stages. It may use a vision model for semantic classification, but coordinates must come from source vectors, registered raster evidence, CAD geometry, or reviewed tracing.

The default registry now includes bounded ASCII DXF and IFC STEP adapters. DXF reads declared `$INSUNITS`, line/polyline/arc coordinates, positioned text and source-declared wall layers. IFC reads SI units, Cartesian curves, local placements, wall representation graphs, layer assignments and positioned space/text labels. Both create deterministic PNG review previews and retain entity-level CAD provenance. Only explicit wall-layer or `IFCWALL` curve geometry is promoted; rooms, openings, wall thicknesses and storey association remain critical review items instead of being inferred from unrelated linework. Invalid intersections or other non-canonical promoted geometry are demoted back to evidence so the persisted candidate stays valid.

DWG remains a deliberate proprietary-codec boundary. `DwgFloorPlanSourceAdapter` accepts an injected, versioned `DwgConversionProvider` that returns bounded ASCII DXF or IFC STEP bytes; provider identity and version are persisted with the evidence. Without one, the default adapter produces a review-blocking `cad_source_unreadable` issue and never attempts a fabricated native parse. Services can pass a registry created with `createDefaultFloorPlanSourceAdapterRegistry({ dwgConversionProvider })` through the optional `adapters` dependency on `processFloorPlanImportJob` or `processNextFloorPlanImportJob`.

CAD input is bounded by source bytes, lines/statements, entities, points, references, traversal work, canonical wall segments and preview segments. Large evidence is summarized into a bounded manifest after topology construction. Consumer previews are available only through an authenticated job-owner route that validates both the job and derivative IDs. That route reads database or private object-store bytes through the same integrity-checking source store and serves them with private no-store and browser-hardening headers. Object-store URLs are never exposed to or fetched by the browser.

Declared-unit CAD can satisfy the dimension-evidence gate without typeset dimension entities only when the primary source is CAD, every floor has a registered three-point calibration, and every canonical vertex and wall has direct primary-source CAD evidence. The independent manifest records that evidence mode and still requires manually mapped wall, opening, structure and label observations from the deterministic preview. PDF, raster and weak/undeclared-unit CAD imports require one-to-one printed-dimension observations and mappings.

The source store is an injectable boundary. Postgres remains the default. Set
`FLOOR_PLAN_OBJECT_STORAGE_PROVIDER=s3` to move original and derived bytes to a
private S3-compatible bucket while retaining only metadata in Postgres. This
selection is fail-closed: endpoint, region, bucket, credentials and a separate
32-byte object-key secret must all validate before the store is constructed.
The endpoint must be HTTPS in production; HTTP is accepted only for a
non-production loopback emulator.

Object keys are deterministic HMAC identifiers under
`FLOOR_PLAN_S3_KEY_PREFIX`; filenames, addresses, owner IDs, job IDs and source
hashes do not appear in the bucket namespace. Requests use AWS Signature V4,
never public or pre-signed URLs. PUT does not request a public ACL, GET is
bounded by the stored byte count, and both response metadata and downloaded
bytes are checked against the Postgres SHA-256 before the source store returns
them. Transient idempotent requests retry at most three times. DELETE treats a
missing object as success so retention cleanup remains resumable.

Use `FLOOR_PLAN_S3_SERVER_SIDE_ENCRYPTION=AES256` for S3-managed encryption,
`aws:kms` plus `FLOOR_PLAN_S3_KMS_KEY_ID` for a customer-managed key, or
`managed` only when the S3-compatible service transparently encrypts every
object and rejects public access at the bucket policy. Keep S3 Block Public
Access (or the provider equivalent) enabled and grant the application identity
only object read/write/delete rights under the configured prefix. Rotate the
object-key HMAC secret only through an explicit key migration: changing it does
not rename existing keys, but future writes would otherwise use a new
namespace. Source hashes remain deduplicated only inside the owner privacy
boundary.

PNG, JPEG and WebP pages use adaptive ink thresholding, bounded projection-profile deskew (at most five degrees), merged horizontal/vertical run evidence and conservative four-sided cycle detection. Deskew is applied only when independent horizontal and vertical profiles agree; its angle, confidence and source-to-rendered affine transform are persisted with the rendered page and source manifest. Dense or ambiguous linework has a fixed candidate-search budget and returns to review/guided tracing rather than publishing partial geometry. Raster cycles provide coordinate evidence only: they never supply a room label, scale, opening or verification tier by themselves.

## Private-source privacy and retention

Private uploads are not available for training or benchmarking by default. The upload UI offers a separate, unchecked opt-in; the server records the exact consent time and contract version only when it receives the literal `true` choice. Consent never extends byte retention and an owner-requested source deletion also revokes future use. No current pipeline automatically exports private plans for training or benchmarks.

`FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS` configures the byte-retention deadline. The deployment default is 30 days, with values bounded to 1–365 days. Run `npm run cleanup:floor-plan-private-sources -- --limit=50` from cron to process a bounded batch, or append `--dry-run` to inspect it. Cleanup clears database-backed original, supplementary, construction-evidence and rendered bytes/URLs immediately while retaining SHA-256 hashes, bounded evidence summaries, correction history, canonical geometry and saved designs for integrity. Construction attachments share their import job's privacy boundary and all supplementary/construction references are checked before shared bytes are cleared. For non-promoted CAD imports it replaces raw path coordinates, text labels, warnings and filenames with bounded counts, declared units, conversion identity and deterministic integrity hashes across every job affected by a shared source. It skips active leases and every revision that is or has ever been approved or published. A re-upload after deletion creates a new live source generation; immutable tombstone rows are never resurrected.

External object deletion uses the durable `FloorPlanObjectDeletionOutbox`. The retention transaction only enqueues a unique source/derived request; it never waits on object storage and does not set `contentDeletedAt`. Run `npm run worker:floor-plan-deletions` alongside the import worker, or use `--once`/`--limit=N` for scheduled bounded processing. The worker leases each request, calls the private storage provider outside the database transaction, and atomically tombstones the asset only after deletion succeeds. Failures use bounded exponential backoff, exhausted requests enter `dead_letter`, expired leases are recoverable, and the provider's missing-object success makes a crash after DELETE safe to retry. The cleanup command can drain up to `--deletion-limit=25` queued objects after scanning; use `--enqueue-only` when a separate persistent deletion worker owns delivery.

Run both workers as persistent production processes, or use their bounded forms from a scheduler:

```bash
npm run worker:floor-plans
npm run worker:floor-plan-deletions
npm run worker:floor-plans -- --once
npm run worker:floor-plan-deletions -- --once --limit=25
npm run cleanup:floor-plan-private-sources -- --enqueue-only --limit=50
```

Owner-requested deletion also scrubs SHA/job-linked underlays from saved designs, and design saves check the source tombstone under the same row lock so a stale autosave cannot restore deleted bytes.

Authenticated consumers can call `DELETE /api/floor-plan-imports/:id/source` once an import is ready, applied or failed. The request is owner-scoped and idempotent, covers all private processing copies that share that owner-scoped source, and never deletes the resulting saved design. Database deletion returns `deletionState: deleted`; external deletion returns HTTP 202 with `deletionState: queued` until the leased worker confirms it. The editor clears only its local rendered underlay when a request is accepted and does not fabricate a server tombstone while external deletion is pending; canonical geometry and integrity hashes remain.

Enhanced detection is controlled by `FLOOR_PLAN_IMPORT_ENHANCED_DETECTION`; set it to `0` for rollback. Semantic classification is separately optional and configured with `OPENAI_API_KEY` plus an optional `FLOOR_PLAN_VISION_MODEL`. It remains off unless `FLOOR_PLAN_VISION_ENABLED=1`. Ranked page previews use a low-detail semantic pass, while the confirmed plan crop uses original detail with structured output and `store: false`. Model labels, boxes and span endpoints remain proposals: deterministic source linework supplies scale and geometry, and unsupported observations return to review. Without a configured classifier, outlined text or weak scans correctly remain in review/guided-tracing fallback instead of being guessed.

Share-token and public-catalog boundaries never return raw source manifests or private import lineage. Shared canonical documents receive a geometry-derived share ID, lose source job/address/underlay/reviewer metadata, and retain only sanitized room and structure display names. Catalog room summaries are derived from an allowlisted semantic room type with server-generated IDs; a malformed or uploader-defined type fails closed instead of exposing the manifest label.

## Canonical rendering and compatibility

`compileFloorPlanDocumentV2` produces the shared render model. The 2D and 3D renderers use that same object; a geometry-hash mismatch blocks canonical rendering instead of silently falling back to approximate legacy walls. Canonical wall IDs, opening spans and polygonal structures are rendered directly in both modes. Room outer loops and hole loops compile once and are reused for 2D fill, 3D floors/ceilings and placement containment, so shafts, cores and internal voids cannot become usable floor area.

Canonical 2D deliberately renders and hit-tests only the active floor, resolving the exact canonical floor ID first and its one-based editor level as the fallback. This prevents walls, openings and structures on different storeys from overlapping as clickable plan geometry. Canonical 3D consumes every floor in the compiled model at its authored elevation; stacked-floor mode may fade inactive storeys but does not reconstruct or substitute their geometry. Both views therefore retain the same document geometry hash even though 2D shows one storey at a time.

Entity IDs are unique per kind across the complete document, not merely within a floor. This keeps flattened editor projections, review evidence and selection targets unambiguous in multi-storey homes. The legacy snapshot adapter namespaces its synthetic wall and vertex IDs; genuinely duplicated persisted opening IDs become critical review issues and receive deterministic replacement IDs. Canonical floor elevation, storey height and slab thickness remain exact integer-millimetre room metadata through save/reload. In 3D, room floors, ceilings, structures, walls and furniture use the authored `elevationMm`, including nonuniform floor-to-floor spacing; furniture is converted back to room-local Y before persistence.

One-way adapters preserve existing work:

- catalog schema v1 -> `FloorPlanDocumentV2`
- design snapshot v3 -> `FloorPlanDocumentV2`
- `FloorPlanDocumentV2` -> the legacy room projection required by current furniture and finish tools

Ambiguous wall/opening mappings become review issues. `applyFloorPlanTopologyMutationV2` and its atomic batch variant now provide the canonical mutation boundary for integer-mm vertex moves, straight-wall translations and splits, and opening add/update/remove operations. They compile the source first, edit only a clone, create a distinct child revision, demote changed source evidence to `needs_review`, strip stale source anchors, and return only after the complete candidate recompiles. Splits update forward and reverse room loops plus wall-bound openings and annotations without changing existing IDs; spans that cross a split, arc edits, fractional points, open/self-intersecting loops, wall crossings/overlaps and opening overlaps are rejected instead of guessed.

The design editor now commits canonical opening moves, resizes, property changes, and deletes through a dedicated topology controller. Pointer gestures are projected back onto the referenced straight wall in integer millimetres, validated and recompiled before the canonical document, geometry hash, and legacy opening/fixed-element projections are replaced atomically. The same history transaction covers the canonical document and projections, so undo/redo and save/reload cannot leave two representations out of sync. The saved `floorPlan.revisionId` remains the immutable catalog/source revision used for update discovery, while the local child revision is retained on `canonicalDocument.revisionId`. Because pointer-move children are transient, the durable child keeps `parentRevisionId` anchored to that immutable source revision instead of pointing at an unsaved intermediate event.

Canonical room-boundary move, resize, duplicate, and delete controls remain source-locked with an editor explanation. Arc-hosted opening edits and invalid/off-wall/overlapping spans are blocked instead of falling back to a legacy-only edit. Furniture, finishes, room naming, selection, zones, and saved views remain editable and are preserved by stable room ID whenever the legacy projection is regenerated.

## Verification commands

```bash
npm run prisma:generate
node_modules/.bin/prisma migrate status
npm run test:floor-plan-foundation
npm run test:floor-plan-library
npm run test:floor-plan-platform
npm run test:floor-plan-design-reference
npm run test:floor-plan-design-reference-persistence
npm run test:floor-plan-raster-linework
npm run test:floor-plan-cad-adapters
npm run test:floor-plan-detection-evidence
npm run test:floor-plan-import-review-geometry
npm run test:floor-plan-optional-configurations
npm run test:floor-plan-publication-security
npm run test:floor-plan-serving-integrity
npm run test:floor-plan-object-storage
npm run test:floor-plan-asset-route-storage
npm run test:floor-plan-private-source-retention
npm run test:floor-plan-retention-outbox
npm run test:floor-plan-upload-ingress
npm run test:floor-plan-shared-rate-limit
npm run test:floor-plan-request-hardening
npm run test:floor-plan-worker-recovery
npm run test:floor-plan-processing-mode
npm run test:floor-plan-queue-health
npm run test:floor-plan-import-telemetry
npm run test:floor-plan-durable-telemetry
npm run test:floor-plan-admin-queue
npm run test:floor-plan-admin-review
npm run test:floor-plan-admin-review-workspace
npm run test:floor-plan-source-observations
npm run test:floor-plan-construction-sources
npm run test:floor-plan-construction-evidence
npm run test:floor-plan-supplementary-sources
npm run test:floor-plan-revision-copy
npm run test:floor-plan-retirement
npm run test:floor-plan-room-holes
npm run test:floor-plan-multifloor-parity
npm run test:floor-plan-topology-mutations
npm run test:floor-plan-topology-editor
npm run test:floor-plan-ping-yi-v2-seeds
npm run test:floor-plan-ping-yi-review-seed-intake
npm run test:floor-plan-geometry-performance
npm run test:floor-plan-quality
npm run check:floor-plan-architecture
npm run test:floor-plan-required
npm run audit:floor-plan-serving-integrity
npm run cleanup:floor-plan-private-sources -- --dry-run --limit=50
npm run typecheck -- --incremental false
npm run build
```

Every approved source should add a licensed fixture and regression assertions for geometry, labels, dimensions, evidence bounds, address transforms, and the compiled 2D/3D geometry hash. Private consumer uploads must not become fixtures or training data without explicit opt-in.
