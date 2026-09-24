Interior AI — Scan-to-Editable-Plan V1

Persistent Codex development mandate

DEVELOPMENT MODE: FAST FEATURE

Implement this feature in the existing Interior AI application. This is authorization for scoped local implementation, testing, correction and checkpoint commits—not a request to stop after producing a plan. Work through the milestones without asking whether to continue after each one. Keep genuine approval requests inside Codex.

1. Product outcome and scope

Enable this complete consumer journey:

Upload a floor-plan image or PDF → review recognition and confirm scale → accurately edit walls, openings and details in 2D → view the same proposed geometry in 3D → furnish → export a genuine vector PDF whose drawing components can be edited in Illustrator.

Basic structural editing belongs in Consumer Mode. Do not deliver a Pro-only workaround or an Illustrator export tool while leaving consumers unable to add or remove walls inside the app.

The first release targets single-floor apartment plans, including Singapore HDB-style plans, primarily straight walls, clean scans and moderately degraded scans. Support uploaded photographs/scans through the existing desktop-first application; a dedicated mobile app, scanner-driver integration and a new camera-capture workflow are not prerequisites. Support JPEG/PNG and existing supported PDF/image formats without regressing current imports. Handle vector, raster and mixed PDFs appropriately.

Required wall editing includes straight diagonal walls as well as horizontal/vertical walls. Preserve existing curved geometry; visibly constrain unsupported curve edits rather than silently straightening it. General curved-wall authoring, handwritten/sketch interpretation, severe lens distortion, new DWG/IFC capability, BIM certification, AI training from scratch and an Illustrator-to-app semantic round trip are outside this release.

Keep the consumer interface guided and minimal. Reuse the existing editor, undo/redo, persistence, import review and rendering architecture. Do not introduce a second independent geometry engine or parallel editor.

2. Working authority and continuity

Isolated, current baseline

Read applicable AGENTS.md instructions and inspect worktrees before modifying anything. Protect the existing dirty primary checkout and all unrelated feature work. Resolve the live origin/integration/deep-clean-v1 ref with a read-only remote fetch and record its full commit/tree identity. The remote snapshot observed on 2026-09-14 was a4295bb60c2819c0c3d380f2c758aad8f20f21db; it is a reference, not permission to use a stale base.

This mandate authorizes a new isolated worktree/branch from the current designated integration branch. Suggested names: feature/scan-to-editable-plan-v1 and interior-ai-scan-to-editable-plan. Do not overwrite an existing branch/path; inspect and choose an unused name or resume only matching authorized work. Record inherited relevant failures before implementation. Never reset, stash, clean or rewrite another worktree.

Continue locally without repeated approvals

Proceed autonomously with in-scope diagnosis, implementation, local tests, scoped dependency changes that are directly necessary and compatible, and ordinary checkpoint commits. Prefer existing dependencies. Any necessary schema change must be additive/backward-compatible, demonstrated as necessary, and tested only on an isolated disposable database. No shared development/staging/production database changes are authorized.

Do not push, create/publish a PR, merge branches, rebase, amend, squash, force-push, deploy, change remote configuration, alter secrets, create paid infrastructure or execute billable external-model calls without explicit approval for that action. Do not bypass tool permission prompts. A configured API key is not spending or data-transfer authorization.

For a paid/external recognition test, present one bounded request inside Codex identifying provider/model, images sent, privacy implications, call/spend cap and purpose. Continue independent local work while that approval is pending. Public documentation reads and routine approved package retrieval are not equivalent to uploading client plans.

Classify failures as A: feature-caused; B: inherited baseline; C: unrelated newly exposed; D: environment-only. Record uncertainty rather than guessing a category. Fix direct feature blockers. Do not expand into repository-wide cleanup, CI infrastructure, security certification or unrelated feature repairs.

Use one focused final review/remediation cycle, followed by targeted verification. Routine development debugging is not a succession of formal review campaigns. Never waive a remaining direct blocker merely to satisfy the cycle limit; report it as blocked with a precise next action.

Persistent handoff

Within the feature's documentation folder, maintain MANDATE.md and one concise FEATURE-STATUS.md (reuse an equivalent established structure rather than duplicating it). Record exact worktree, branch, base/current SHAs, milestone status, decisions, commands/results, artifact paths, known blockers, pending approvals and the smallest next executable action.

Update the status after each milestone and before compaction/session end. On resumption, read that file and relevant source instead of restarting discovery or requesting another ChatGPT prompt. A milestone update is a checkpoint, not a request for permission to continue. Session and permission limits remain real; leave an executable handoff when they interrupt work.

3. Architecture and accuracy contract

One authoritative proposed design

Inspect and extend FloorPlanDocumentV2, compileFloorPlanDocumentV2, existing topology mutation boundaries, PDF/raster adapters, import review, export, underlay and cloud-revision protections. Confirm actual code behavior; documentation and old passing reports are not proof of current behavior.

Keep the original source and imported reference revision immutable. Recognition corrections must have explicit provenance. Create private editable child revisions for proposed renovation changes; never alter a published address-library plan or overwrite the original reference. Provide a simple original/proposed comparison without requiring a full renovation-management system. Private planning edits must not require admin publication or invent new publication privileges; preserve existing ownership and source-access checks.

All accepted geometry mutations must update one canonical proposed document. Derive 2D, 3D, dimensions, collision/placement data and export from it. Legacy editor projections must be regenerated atomically, not edited independently. Preserve stable IDs where entities survive; make split/merge lineage and dependent-object changes explicit. Preserve existing save/reload, revision-conflict and stale-response protections.

Retain non-building artwork—dimension leaders, fixture symbols, text and unclassified strokes—in the existing annotation/drawing system, extending it minimally when necessary. Such artwork is selectable but must not automatically become a wall, room or 3D object. An unclassified detail must not silently disappear just because semantic recognition fails.

Precision without false certainty

Keep canonical coordinates in the repository's existing units and precision, including integer millimetres where required. Display-unit changes must not repeatedly rescale stored geometry. Distinguish exact authored dimensions from dimensions estimated from pixels and from site-confirmed measurements.

Preserve source-to-page/crop/deskew/model transforms. Record confirmed calibration endpoints, units and residuals. A global scale cannot repair arbitrary perspective distortion. Correct supported distortion explicitly, or request a better source/guided tracing; never silently stretch a plan to fit conflicting dimensions.

AI output supplies proposals, not unquestionable coordinates, structural classification or verification. Validate structured responses and tie accepted entities to source evidence or explicit user-authored edits. Treat model confidence as a review signal unless actually calibrated. No invented rooms, windows, dimensions or hidden reconstruction to make a layout look conventional.

Separate “needs review,” “user-reviewed for planning,” and existing source/construction verification tiers. Consumer approval must not mint a verified-library badge or construction approval. User edits invalidate affected source/dimension claims rather than retaining stale certification.

Physical-work warning

Digital wall removal is a proposed design change, not permission to demolish. Do not infer that a wall is non-structural because it looks thin or is easy to delete. Surface warnings for unknown/structural walls and protected elements, while retaining an explicit conceptual-proposal workflow. Never market the result as safe or approved construction documentation solely because it is dimensioned.

Milestone 0 — Establish behavior and an end-to-end proof

Goal: Identify the smallest extension to existing code and prove the whole route, not just a recognition demo.

Run the existing importer on the supplied original IMG_4900(1).jpg, when accessible. The Illustrator screenshots communicate the desired object editability and the failed trace; do not treat their screenshot pixels as source geometry or claim to have inspected the original editable PDF. Keep private source fixtures and identifiable client details out of public commits and shared artifacts.

Inspect relevant import, canonical topology, source-locked UI controls, 2D/3D, persistence and PDF-export code. Map each requirement to existing behavior, a needed extension or a demonstrated blocker. Check current tests and runtime configuration, including whether external vision is actually enabled and authorized.

Create a small independently authored canonical apartment fixture and demonstrate one wall removal, one wall addition, a 3D update and vector-PDF output early. Use it to expose schema, room-topology and export limitations before investing heavily in recognition. It is an integration fixture, not evidence of scan-recognition accuracy.

Establish the supported-input set, source-appropriate geometry tolerances, named runtime environment and relevant baseline checks. Freeze acceptance criteria before evaluating the final candidate; do not narrow them after seeing failures.

Acceptance: Exact base and gaps recorded; original image baseline captured or clearly unavailable; an executable end-to-end test exists. Continue implementation immediately. Do not spend a milestone only creating documents, and do not hardcode this user's layout.

Milestone 1 — Recover detailed, evidence-backed plan elements

Goal: Recognize more than the darkest wall blocks while preserving uncertainty and source detail.

Branch by actual content: retain native paths/text for vector PDFs; process raster regions for scans; handle mixed pages without duplicating content. Keep page selection and crop controls. Preserve original resolution within explicit resource limits and retain coordinate transforms through every processing stage.

Improve preprocessing and extraction through benchmarked changes: background normalization, local/adaptive contrast or thresholding, bounded deskew, thick-wall and thin-line passes, dashed/arc detection and text recognition. Avoid destructive denoising that erases windows or swing dashes. Use overlapping crops only when useful and reconcile their coordinates/deduplicated observations.

Recover walls/partitions, openings, door leaves and swings, window symbols, room text, printed dimensions, fixture groups and otherwise-unclassified linework. Keep dimension/extension lines separate from building geometry. Distinguish visible facts from proposed semantic labels. Preserve optional/dashed partitions as annotations unless the source and user establish an actual wall configuration.

Reuse the existing optional AI-provider boundary. Keep provider/model configurable; validate geometry, enums, bounds and response size before accepting proposals. Missing credentials, disabled AI, timeouts and malformed responses must lead to clear retry/review behavior—not fabricated success. A human tracing fallback is required but is not proof that automatic recognition works.

Reuse durable job processing with bounded image/page/segment counts, timeouts and retries. Long-running analysis must not block the browser interaction thread or depend on a single browser request remaining open. New results may not overwrite a newer user correction, replaced upload or different design.

Acceptance: The supplied scan's faint details are meaningfully recovered or explicitly exposed for review. Against independently annotated fixtures, report automatic missing/extra walls and openings, geometry error, text errors and assistance required. Save before/after overlays. Do not claim improvement from synthetic examples alone.

Milestone 2 — Consumer scale confirmation and review

Goal: Turn an imperfect import into a trustworthy planning baseline without requiring CAD expertise.

Implement a guided sequence: choose page/crop → check scale → review highlighted issues → confirm editable plan. Overlay recovered vectors on the source, with opacity and original/result toggles. Clicking an issue should zoom to its evidence and offer the relevant correction.

Allow calibration from two selected endpoints and a confirmed real-world length. Cross-check an independent dimension, preferably in the other direction, when available. Detect conflicts rather than silently choosing a number. Reuse existing metric/imperial display support; show units and rounding explicitly. Uncalibrated work may be saved as a draft but must not appear as a confirmed-scale plan.

Offer endpoint correction, merge/split strokes, opening classification, door hinge/swing correction, text correction, missing-element insertion and assisted manual tracing. Retain separate recovery/review and proposed-design edits so consumers can compare against the original instead of losing its meaning.

Represent unresolved geometry, uncertain labels and missing heights differently. Block unsupported geometry from being promoted as a valid 3D design; do not block a usable planning draft solely because optional annotation text is uncertain. Unknown heights can use visibly assumed defaults, not invented source measurements.

Acceptance: A consumer can resolve scale and key missing/misclassified items, confirm the planning baseline, save, reload and resume without losing corrections. Import cancellation, failure and back-navigation leave any previously open design unchanged.

Milestone 3 — Real, detailed 2D wall and opening editing

Goal: Deliver the core feature: consumers can actually remodel the proposed plan.

Provide a small contextual toolset for selection, adding walls, editing/removing walls, doors/windows and measurements. Numeric controls must accompany dragging. Support wall endpoints, length, position, thickness and applicable height/base offset; support opening position, width, type, hinge/swing and applicable height/sill. Expose whether a dimension references a centreline or finished face. Preserve straight diagonal directions; never cardinalize them silently.

Implement wall addition/removal, movement, endpoint edits, split and valid joining through canonical transactions. Removing a shared interior wall must join the usable space appropriately. Adding a full partition must create the corresponding room division. Partial/freestanding partitions must not invent closed rooms. Maintain T/L junctions, shared-wall identity, room loops, holes and the floor footprint. Exterior-envelope changes must remain valid or explain the unresolved boundary, not erase the floor unexpectedly.

Handle dependencies explicitly. Before deleting a wall, show the doors/windows and attached objects affected. Remove confirmed hosted openings atomically or rehost only where the mapping is unambiguous. Splits must redistribute hosted openings correctly; openings crossing a split must be resolved or rejected. Reject overlap, zero-length geometry and invalid topology before commit, with a specific correction message.

Reconcile room IDs, names, finishes, zones and placed objects across splits/merges. Preserve world positions and unaffected data. When a finish/name association is ambiguous, use a declared rule with a visible choice rather than silently discarding it. Preserve displaced or unassigned furniture for recovery instead of deleting it.

Every gesture/confirmed numeric edit must form a coherent undoable transaction including canonical geometry, derived projections and dependencies. Escape cancels a preview; undo/redo and save/reload restore the complete state. Invalid drafts never become the saved authoritative plan. Keep viewport pan/zoom distinct from dragging rooms, walls and objects.

Replace source-locking only through private proposal mutations. Do not remove guards globally, mutate published references, hide walls with styling, or edit only the legacy room representation.

Acceptance: Automated and browser tests demonstrate removing a shared wall, adding a room-dividing wall, adding a partial partition, moving/resizing a diagonal wall, editing door/window properties, deleting a host wall, undo/redo and reload. Expected room connectivity and dependent entities must match—not merely the screenshot. Core controls work in Consumer Mode.

Milestone 4 — Matching 3D geometry and furnishing

Goal: The 3D view represents exactly the accepted proposed 2D plan.

Use the same compiled canonical document for both views. Test that added/removed/moved walls, thicknesses, openings, sill heights and partial-height walls produce the corresponding 3D result. Do not re-run image recognition or construct an approximate parallel room model on switching views.

Preserve floor boundaries, holes/voids, room identity and applicable elevations. Keep explicit source or user heights distinct from defaults. A missing plan height is not permission to claim an observed height. Maintain the existing behavior for other floors without expanding this release into multi-storey authoring.

Recompute placement boundaries, collisions and relevant clearance guidance from the accepted geometry. A removed wall must not leave an invisible collision barrier. A new wall must not leave furniture silently intersecting it. Show affected placements and preserve recovery options; do not rearrange or delete furniture automatically.

Acceptance: The same test sequence passes in 2D, 3D, furnishing, mode switching, undo/redo and saved reload. Check geometry identities and concrete walls/openings/placement boundaries. A viewport that only looks similar is insufficient.

Milestone 5 — True vector PDF, editable in Illustrator

Goal: Export the actual proposed 2D drawing as independently editable components, not a screenshot inside a PDF.

Make vector PDF a required deliverable, with SVG as a useful companion. SVG does not substitute for a failing PDF requirement. Reuse the existing export infrastructure where suitable, but bypass screenshot/canvas flattening for architectural linework.

Create deterministic drawing primitives from the canonical proposed geometry and current annotations. Emit separate wall shapes, lines, arcs/curves, door/window primitives, fixture outlines, dimension lines/ticks and text. Avoid one giant compound path containing the whole plan. Keep components independently selectable even when they meet. Use sensible groups where portable; do not promise native Illustrator layer hierarchy or proprietary Illustrator editing data.

Preserve text as editable text in the editing-oriented export. Use an appropriate font with confirmed embedding rights and document Illustrator font availability/substitution requirements; embedded display glyphs alone are not proof of editable typography. Never silently turn all text into outlines. An optional appearance-oriented outlined-text export must be explicitly labelled and is not the editable-text acceptance artifact.

Provide paper size/orientation, declared scale such as 1:50 or 1:100, and toggles for dimensions, labels, fixtures/furniture and reference underlay. Do not label a fit-to-page export as a fixed scale. Warn or choose a fitting page rather than clip or silently rescale. Test physical PDF dimensions; a 9260 mm length must span 92.6 mm at 1:100, independent of any image boundary.

Keep the original image out of the default clean plan. An explicitly requested underlay can be raster, but must remain separate from vector geometry. Exclude private source filenames, addresses and source metadata by default; only user-selected project information belongs in the title area. Do not copy the reference screenshot's branding.

Regenerate associative proposed dimensions after geometry edits. Separate historical printed dimensions from live proposed measurements so stale source numbers, erased walls and original fixture marks do not reappear as current geometry. Label drawings as proposed/unverified where applicable, without burying the actual drawing in disclaimers.

Validate PDF contents structurally and visually: inspect path/text operators and decoded object structure, confirm the plan is not a page-sized raster, render independently, and compare source-derived geometry with exported primitives and scale. Avoid unnecessary clipping, transparency flattening and duplicate hidden artwork. Record actual output counts and unsupported annotations.

Perform an actual Illustrator 2024 acceptance check where authorized tooling is available. Open the PDF as artwork, not as a linked placed page. Select/move/delete one wall, edit one window, manipulate a door leaf and swing, move a fixture and edit a dimension number; save and reopen. Test SVG separately. Record exact file/version/actions and observed grouping/font behavior.

If Illustrator access is unavailable, complete all independent tests and provide a compact test pack and instructions in Codex. Mark ILLUSTRATOR_ACCEPTANCE_PENDING; do not claim Illustrator compatibility was manually proven by PDF inspection or another vector editor. This missing external check must not halt unrelated implementation or trigger a return to ChatGPT.

Acceptance: Scaled vector PDF and SVG preserve the proposed drawing and independently editable components. Required PDF behavior is demonstrated in Illustrator, or clearly remains a final external acceptance blocker.

Milestone 6 — Integrated quality, performance and feature handoff

Goal: Deliver a reviewable consumer workflow with measured recognition quality and no direct unresolved feature blockers.

Aim for a pilot of 15–30 distinct, authorized apartment plans covering clean/faint scans, noise, rotation, phone photographs, thin/dashed lines, rotated text, vector/mixed PDFs, diagonals, small service spaces and ambiguous symbols. Keep independent holdout layouts. Variants of one drawing do not count as independent plans. Do not turn data acquisition into an indefinite project; report the actual sample coverage and remaining real-plan acceptance gaps.

Use ground truth independently authored or reviewed against the source, never generated from the same extraction output under test. For each plan report automatic recognition completeness/error, user corrections, final connectivity/geometry tolerance, processing latency and actual correction time where observed. Do not invent human usability timings or present a model's confidence as an accuracy score. Compare against the previous importer and manual tracing where real measurements are available.

Require zero silent missing/invented critical elements in the accepted fixture comparisons; unresolved ones must remain visibly unresolved. Exact authored numeric edits must survive serialization. Scale, geometry, openings and dimensions must agree across review, 2D, 3D and export within the predeclared source/export tolerances. Poor-source recognition must fail visibly, not lower its own acceptance standard.

Run risk-appropriate focused checks for changed geometry, import/review, permissions, persistence, 2D/3D, exports and affected existing regressions, plus repository-required checks. Use real browser coverage for the critical consumer journey, including the supported Safari/WebKit path where applicable. Preserve keyboard access and focus behavior. Full-repository certification is not the default, but required checks may not be skipped or represented by unrelated focused passes.

Measure and record browser environment, plan size, pointer-interaction responsiveness, render/compile cost, import latency and memory behavior. Keep heavy processing off the interaction thread. Define reasonable numeric budgets early from the baseline; enforce them on representative fixtures rather than inventing unsupported universal device claims.

Exercise timeout/retry/cancel, worker recovery, duplicate responses, corrections during extraction, design replacement, ownership denial, two-tab stale saves, invalid files, oversized inputs and source deletion. Preserve existing private storage, source retention, consent and authorization controls. No client plans or secrets in public fixtures, logs, screenshots or telemetry. Source deletion must not resurrect bytes through stale saves.

Perform the focused final review/remediation cycle and rerun affected checks on the final exact source. Use an independent read-only reviewer when available; otherwise label the review as self-review rather than claiming independence. No claims of PASS for tests not run, mocked provider quality, synthetic real-scan accuracy or pending Illustrator actions. Before any later authorized integration, re-read the live target and assess drift; integration authorization is separate and shared-target merges must be serialized.

Acceptance: A reproducible end-to-end demonstration, before/after and 2D/3D captures, sample PDFs/SVGs, test results and truthful remaining boundaries are available. User-visible help explains scan uncertainty, scale, proposed wall edits and export limitations.

4. Completion and status contract

Use IN_PROGRESS, BLOCKED_LOCAL, AWAITING_APPROVAL_IN_CODEX, IMPLEMENTED_PENDING_EXTERNAL_ACCEPTANCE, or READY_FOR_FEATURE_REVIEW, with per-milestone status. Do not call the feature ready while a required Illustrator acceptance, real-input accuracy demonstration, direct geometry blocker or required feature test is unresolved. Report merge/CI readiness separately: an inherited unrelated required-check failure may block merging without authorizing unrelated repairs or negating demonstrated feature behavior. Never label that check as passing. Do not confuse implementation-complete with deployed or production-certified.

The final report must name the full candidate SHA/tree, worktree/branch and base; explain the working consumer journey; list test commands/results and failure classes; identify artifact locations; state recognition coverage, measured limitations, migration/configuration needs and pending approvals. State explicitly whether anything was pushed, merged, deployed or externally processed.

The central demonstration is: import the supplied plan, confirm its scale, correct recognition, remove a shared interior wall, add a replacement partition, adjust a door/window, save/reload, inspect matching 3D, place furniture, export the proposed vector PDF, and independently edit its components in Illustrator. Use a separate authored fixture for any example that cannot safely be represented in the supplied plan; do not alter its original source to force a demonstration.

Do not substitute a generic tracer, raster PDF, SVG-only export, fabricated AI layout, Pro-only wall controls, unchanged source-locked consumer editor or disconnected 2D/3D representations for this outcome.

Begin now with baseline/worktree discovery, persist this mandate, and execute the smallest end-to-end proof. Continue through the milestones without requesting another planning prompt.

Reference notes for the implementer (not additional feature scope)

Repository snapshot inspected: integration/deep-clean-v1 at a4295bb60c2819c0c3d380f2c758aad8f20f21db, observed 2026-09-14. Starting references are docs/development/floor-plan-import-platform.md and lib/floor-plan-imports/pdf-raster-adapter.ts. Recheck live code and current tool documentation before implementation.

OpenAI documents limitations with small/rotated text, differing line styles and precise spatial localization. Adobe documents PDF opening separately from linked-page placement, and its own Preserve Illustrator Editing Capabilities option adds Illustrator-specific PGF data. These support the proposal/validation separation and actual Illustrator acceptance test; they do not guarantee this implementation's results.

Primary documentation:

https://developers.openai.com/api/docs/guides/images-vision
https://helpx.adobe.com/illustrator/desktop/add-and-import-files/import-other-file-types/import-adobe-pdf-files.html
https://helpx.adobe.com/illustrator/kb/optimize-native-pdf-file-sizes.html