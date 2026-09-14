# Scan-to-editable-plan V1

Status: IN_PROGRESS. This is a persistent implementation checkpoint, not feature acceptance.

## Identity and authority

- Worktree: `/Users/justus/Developer/interior-ai-scan-to-editable-plan`
- Branch: `feature/scan-to-editable-plan-v1`
- Read-only live fetch: `git fetch --no-tags origin integration/deep-clean-v1`, 2026-09-14.
- Base/current initial SHA: `a4295bb60c2819c0c3d380f2c758aad8f20f21db`
- Base tree: `4f82d7ab6bc838fb91ff42c4805dba7c93e0fd9d`
- Original mandate: [MANDATE.md](MANDATE.md). No push, PR, integration, deployment, paid inference, shared database writes, or secrets changes authorized.
- `lsof`: port 3000 PID 49747 cwd canonical dirty primary; ports 3016/3017 belong to furniture-import-v2. Those applications are intentionally different from this authorized isolated target and are untouched.
- Matching lockfile permits read-only reuse of primary `node_modules` via local ignored symlink. Do not generate Prisma or install through that symlink.

## Acceptance frozen before implementation

The mandate's six milestone acceptance sections apply without narrowing. Supported V1 input: existing JPEG/PNG/image and vector/raster/mixed PDF formats, one selected apartment floor, straight walls including diagonals. Curves are preserved and unsupported mutations explicitly rejected. Existing ingress limits apply (25 MB, bounded pages/pixels/segments). Exact authored coordinates survive integer-mm serialization; compiled 2D/3D geometry hashes agree; export scale error <= 0.01 mm on paper (9260 mm becomes 92.6 mm at 1:100). Recognition benchmark tolerance is 2 source pixels for clean digital paths, 3 pixels for scans, with missing/extra critical entities reported separately; this does not certify site accuracy. Conflicting independent calibration dimensions remain unresolved. Real-plan accuracy and actual Illustrator edit/save/reopen remain required. No synthetic fixture counts as recognition evidence.

Initial performance budgets on named local environment (macOS arm64, Node v24.13.0, npm 11.6.2): canonical apartment <= 100 walls / 50 openings, compile+mutation p95 <= 50 ms; pointer work <= 16 ms excluding rendering; local 1 MP extraction <= 30 s excluding optional OCR, OCR <= existing configured timeout. These are fixture budgets pending measurement, not universal device claims. Baseline measurements must be recorded before final comparison.

## Milestones

| Milestone | State | Evidence / next work |
| --- | --- | --- |
| 0 Baseline / proof | COMPLETE | Live base and behavior mapped; original-name discrepancy recorded. Local original-image importer run; authored remove/add/opening/compiled-3D/vector-PDF proof passes. |
| 1 Recognition | IN_PROGRESS | Inspect actual adapter and run local-only original-image baseline. |
| 2 Guided review | IN_PROGRESS | Existing page/crop/calibration/review architecture located; behavior still to verify. |
| 3 Consumer editing | IN_PROGRESS | Private add/remove/attach/merge/split and opening edits implemented; Chromium/WebKit authored journey demonstrated; advanced editing and recovery remain. |
| 4 Matching 3D | IN_PROGRESS | Matching extrusion/placement checks implemented for wall solids; existing-object drag and full clearance integration remain. |
| 5 Vector export | IN_PROGRESS | Independent vector paths/text/curves and physical PDF scale proved; native Illustrator automation timed out; options/font/curve coverage remain. |
| 6 Handoff | IN_PROGRESS | Required checks, browser, recognition coverage, performance, one independent final review still outstanding. |

## Discovery / failure classification

- D: sandbox fetch DNS failure, resolved by authorized read-only network escalation.
- Exact `IMG_4900(1).jpg` absent in attachment/canonical checkout. A visually relevant `IMG_4900.jpg` exists in Downloads, 836x1080, SHA256 `a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006`; inspected locally. Do not assume byte identity with the missing filename. Source remains outside Git. Private benchmark overlays belong outside worktree.
- Adobe Illustrator 2024 installed; actual automation availability and editing acceptance untested.
- No external recognition calls made. API-key presence is not authorization. Isolated runtime must explicitly disable external vision and catalog matching for accuracy evaluation.
- Evidence directory (ignored/untracked outside feature source): `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1/`.
- Baseline commands started: `npm run test:floor-plan-platform`, `npm run typecheck`, then `npm run check:code-quality`. Outputs under evidence `baseline/`; outcomes pending.

## Smallest next executable action

Finish the active Chromium/WebKit r6 run and scoped validation below, make the ordinary local checkpoint, then implement preserved scan artwork/mixed-PDF evidence and guided review. Do not restart worktree discovery or request another planning prompt. Read the unresolved implementation list before treating any milestone as accepted.

## Milestone 0 implementation checkpoint

- Canonical operations `add_wall` / `remove_wall` extend the existing transaction owner. Directed room boundaries are split/stitched; no parallel geometry engine. Shared-wall removal requires an exact reviewed opening list and explicit retained room. Exterior/hole boundary removal rejects with a correction message. Freestanding walls have no invented room loop. Existing compiler rejects overlap/intersections/invalid entities.
- Existing split implementation moved unchanged into `floor-plan-wall-split.ts` with its room-loop update isolated; original topology tests characterize it. Consumer room reconciliation preserves furniture world positions, immutable original geometry and removed-room metadata. Camera saved views are already world-space and remain unchanged.
- Existing consumer panel now includes wall creation/removal, door/window numeric controls, original/proposed preview and clean PDF/SVG export. Geometry editing's one call site is independent of furniture-catalog readiness; Client Preview remains prohibited. The initial missing-panel diagnosis was corrected: the browser was in 3D, and the panel is correctly 2D-only.
- Local-only source baseline: 836x1080 JPG; render 140.12 ms, extraction 559.68 ms (23 OCR candidates, 7 dimension observations), scale solve 2.09 ms, topology 1.72 ms. No valid scale/rooms/walls/openings, explicit unresolved review issues. This is a failed automatic recognition baseline (B), not recognition acceptance. Exact requested `(1)` filename still unavailable; found-image identity is recorded above.
- Original platform suite: environment-only missing DATABASE_URL initially (D); rerun with a non-routable placeholder passed (`floor-plan-platform-isolated.log`, exit 0). No database connection/write or external model call was made by this suite. Baseline typecheck/code quality passed before implementation.
- Current focused checks PASS: `npm run test:scan-plan`; `npm run test:floor-plan-topology-mutations`; `npm run test:floor-plan-topology-editor`; `npm run typecheck`; `npm run check:code-quality`; focused ESLint on changed geometry and UI files. The old topology-editor assertions of local furniture coordinates were updated to the new world-position invariant; regression tests pass.
- Vector proof: `artifacts/proposed-apartment.pdf`, `.svg`, `.json`, and `vector-inspection.json` under evidence root. 23 primitives / 5 PDF text objects / 1 cubic curve / 0 images; A4 landscape, 1:100; 9260 mm spans 92.6 mm. Deterministic bytes and independent Poppler visual rendering passed. Curved wall footprints remain reported as sampled/unsupported in export; editable font coverage currently Helvetica WinAnsi only and unsupported text fails visibly. Illustrator editing NOT tested yet.
- Local runtime: `node scripts/run-scan-plan-local.mjs`, http://127.0.0.1:3018, PID 9847 confirmed with lsof, isolated worktree cwd. Inert supported local OAuth fixture, external vision disabled, non-routable database. Auth session/me endpoints 200; expected telemetry persistence failure against placeholder database (D). Browser Chromium via cached agent-browser, session `scan-plan`, socket directory `/private/tmp/scan-plan-browser-sockets`; CLI commands need sandbox escalation. Initial app verification: content + canvas, no browser errors / no error overlay. Consumer UI confirmed orientation, entered local editing, removed shared wall + door. Saved local storage verifies one `living` room, six exterior walls, one `window`, original `authored-reference`. Browser images in `artifacts/`.
- Code quality baseline lowered for topology/editor/controller. One documented temporary +1-line exception in `room-types.ts` retains the additive optional proposal field next to the canonical document (expires 2026-12-14); final review must assess it.
- Remaining direct implementation work: protected-opening proposal evidence demotion, richer snap/join/endpoint/length/height controls, source detail preservation + calibration/review improvements, full collision/placement parity and recovery UI, complete curved/annotation/furniture/underlay export options, browser undo/redo/reload and WebKit, genuine original-plan recognition comparisons and pilot coverage, required domain/build checks, one independent final review. No feature-ready claim.
- Next action: finish browser replacement-wall test; extend proposal opening edits without weakening reference evidence guards; implement automatic endpoint attachment in canonical partition mutations; then continue recognition/review milestones. Save this status before compaction; resume from current source instead of restarting discovery.

## Consumer geometry / validation checkpoint (2026-09-14)

Current committed source is still `357030d73568c6c40bcd4fe72b2811e9af54ebda` (tree `613c6c5a16b469a26e2632106093e7153a86f518`). A second related batch is in the working tree, awaiting its checkpoint commit. Use `git status`/`git diff`; no unrelated files are present in this isolated checkout. No push, PR, merge, deployment, dependency installation, external recognition, database migration or shared database write occurred.

Implemented since the first checkpoint:

- Exact integer-mm partition endpoints automatically split straight boundary hosts inside the same canonical transaction. Hosted spans crossing a junction reject atomically. Partial chains that connect two boundary vertices create the corresponding room division; ambiguous routes reject, with bounded traversal. Partial/freestanding walls remain open. Joining arbitrary existing walls and general interior closed-loop room creation are still unsupported.
- Private proposed opening edits demote only affected measurement claims before the existing opening policy runs. Direct reference/Pro protection still rejects an unreviewed protected-width change. Original source measurements survive in the comparison document. Unchanged displayed window defaults no longer become unintended explicit height/sill edits.
- Associative dimensions recompute after endpoint movement, retaining historical numbers only in the original. Deleted wall annotations now become valid reference polylines (the initial two-point polygon implementation was an A defect). The clean proposed vector export excludes these historical marks. Polyline compilation, canonical ID remapping and CAD projection handling are additive; selected source-artwork UI remains to implement.
- Placement containment uses the same canonical wall extrusion slices and the existing polygon/footprint engine, including opening gaps and vertical extents. New walls are barriers, removed walls leave no barrier, and raised/partial walls respect height. Affected existing items receive review messages and retain world positions. This does not yet prove every existing furniture-drag/circulation path. Unknown product dimensions remain visible for manual review.
- Added boundary splits exposed an inherited legacy offset ambiguity (B exposed by the feature): the window host resolver treated a room-relative offset as relative to every collinear segment. Canonical projections now retain their world centre and use it to select the physical host. The regression test passes. This does not solve legacy projection of openings on freestanding or diagonal hosts, still outstanding.
- Browser wall selector now has a concise accessible name. Source-lock explanatory copy points to the proposed wall tools in 2D. Room-recovery metadata retains the original room origin for saved-layout recovery.

Verification and artifacts (all evidence paths relative to the evidence directory above):

- PASS `npm run test:scan-plan` after attachment/chain/placement/protected-opening changes. Includes exact source immutability, span rejection, room areas, dimensions, model hash, world positions and serialization. PASS `npm run test:floor-plan-topology-mutations` and `npm run test:floor-plan-topology-editor`.
- PASS `npm run test:floor-plan-required` with non-routable DATABASE_URL and external vision explicitly disabled. Full output `required-domain-r1.log`. This completed before the later canonical world-centre host correction; the targeted window suite subsequently passed (`opening-regressions-r2.log`). No feature readiness or remote CI claim follows from it.
- PASS Chromium + WebKit authored Consumer journey in `artifacts/browser-tests-r4`: shared-wall removal, opening dependency restoration by undo/redo, attached room-dividing partition, window width edit, 2D/3D mode switch and exact local save/reload. Two tests, 26.3 s. Images were inspected. They exposed the misleading window-host warning, subsequently fixed and asserted in the test.
- Failed browser rounds retained: r1 wrong orientation button label (A test authoring), r2 wall selector's oversized accessible name (A), r3 action-specific Undo label mismatch (A test authoring). All were corrected before r4. r5 did not complete under its unchanged 120 s limit: Chromium stalled during initial hydration; WebKit reached final reload. Server logged 15–66 s auth/catalog/telemetry requests. D suspected, functional attribution not proven. r6 reruns alone, same limits/assertions, no skip or acceptance relaxation. At this status write it is still running (exec session 68789).
- Latest `npm run typecheck` and `npm run check:code-quality` PASS after correcting the authored column's required name/locked fields and lowering improved file-size baselines (exec session 69401). Previous failed logs `types-r3.log`/`quality-r3.log` remain. Full lint exposed one unused type import (A); it was removed and affected-file ESLint passed. Full lint still needs the final rerun; initial output `lint-r2.log`.
- Vector authored fixture now includes a column outline: 24 primitives, 5 PDF text objects, 1 cubic swing, 0 images. Test reads actual emitted PDF path operators and concatenated transforms to confirm the 9260 mm dimension spans 92.6 mm on paper within 0.01 mm. SVG text explicitly has no inherited stroke. `artifacts/illustrator-r2` contains PDF/SVG/canonical JSON/drawing manifest/inspection; regenerate after final fixture field correction. Earlier Poppler render was inspected; updated fixture render remains to inspect.
- Illustrator 2024 version read succeeded: 28.0.0. Read-only `do javascript app.version` and a scoped System Events dialog query each timed out with AppleEvent `-1712`. No document was opened, edited, saved or closed by these calls. ILLUSTRATOR_ACCEPTANCE_PENDING; do not claim native editing acceptance. `sdef` was unavailable because full Xcode is absent. No reason for the AppleEvent timeout was established.

Pending work / limitations (required, not waived):

1. Recognition: located JPG still has unresolved automatic scale/topology; no after-recognition improvement claim. Exact requested `(1)` image identity remains an unanswered optional question. Pilot coverage is one located real image + one authored integration layout, not 15–30 independent plans. Need independently reviewed annotations/overlays and real missing/extra/text/error counts.
2. Retain source detail in canonical annotations and review. Inspect `pdf-raster-adapter.ts` fallback: weak PDFs discard raster segments when no closed cycle exists, mixed pages skip raster analysis whenever any native path exists. No adapter fix has been made in this batch. Avoid destructive threshold tuning without independent source comparison.
3. Finish guided calibration/correction/planning-review tier and issue focus; existing review has page/crop/opacity/two-point calibration/tracing, but the full consumer route and cancellation/stale-result behavior have not been demonstrated here.
4. Finish contextual wall length/height/base-offset/joining and direct drag/Escape; robust diagonal/freestanding hosted opening projection; source-curve/hole topology edge cases; split-wall finish inheritance during automatic attachments; usable room/furniture/layout recovery choices; saved layout world-origin conversion for surviving rooms.
5. Finish all furnishing drag/placement/clearance paths against canonical geometry. Current helper uses the existing conservative AABB furniture footprint against actual wall polygons; no universal placement-parity claim.
6. Finish export font/curved footprint/text bounds/fixture/furniture/underlay options and original/proposed preview freshness. Current PDF text is Helvetica WinAnsi; unsupported text rejects, default clean export has no underlay, native curved wall outlines remain visibly reported as sampled. Complete native Illustrator edit/save/reopen when available, or provide the pending acceptance pack.
7. Add source deletion/stale-save/privacy checks for the new proposal state, persistence conflicts and ownership; run remaining required checks/build and an immutable local production smoke (deployment is not authorized), measure performance, then one focused independent read-only final review/remediation cycle. No reviewer has been spawned yet. Keep the +1-line `room-types.ts` exception in that review.

Do not label the feature ready while these direct blockers remain. Current state is IN_PROGRESS.

### Latest checkpoint observations

- Current-source WebKit r6 PASS, including absence of the erroneous window-host warning, complete undo/redo and final reload. Current-source Chromium r6/r7 did not complete: r6 failed initial hydration with an unlocated parse error; r7 found the orientation button but timed out waiting for visibility/stability. Do not replace these results with r4's earlier pass. Attribution remains unresolved (D suspected from severe server/browser delays); this is a required browser follow-up.
- `node --check` passed the generated 41 MB development page bundle. All 807 embedded webpack module scripts parsed with V8 without executing module bodies (`bundle-parse.json`). The first diagnostic omitted webpack's trusted-script passthrough and parsed zero modules; only the corrected 807-module result is evidence. No source syntax defect or transport root cause was established.
- Closed the additional task-owned agent-browser session to reduce local resource use. The feature dev server remains on port 3018, PID 9847, confirmed cwd. Both stalled read-only AppleEvent commands ended with `-1712`; Illustrator and existing documents were left untouched.
- `npm run test:required-test-truthfulness` first hit loopback-bind EPERM (D), then exposed the three added script tests missing from the inventory (A). Updated only count/hash from 288 to 291 and the measured inventory digest; no gates/classifications relaxed. Its corrected rerun is active (session 18136, `required-truthfulness-r3.log`). Full lint rerun is active (session 12917, `lint-r3.log`). Finish these before reporting final validation.
- Physical PDF operator/transform verification passes after adding the independent scale reader. The column test fixture's required `name` and `locked` fields are fixed; regenerate its final acceptance pack to bind the latest source/geometry hash. [Illustrator acceptance instructions](ILLUSTRATOR-ACCEPTANCE.md) document the actual pending actions and current limitations.
