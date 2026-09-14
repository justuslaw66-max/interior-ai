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
| 3 Consumer editing | IN_PROGRESS | Existing private child mutations support move/split/update, no add/remove wall operations or room reconciliation. |
| 4 Matching 3D | IN_PROGRESS | Existing compiler/render projection located; verify partition/dependency/placement behavior. |
| 5 Vector export | IN_PROGRESS | Existing pdf-lib; current export owner must be extended beyond screenshot export. |
| 6 Handoff | IN_PROGRESS | Required checks, browser, recognition coverage, performance, one independent final review still outstanding. |

## Discovery / failure classification

- D: sandbox fetch DNS failure, resolved by authorized read-only network escalation.
- Exact `IMG_4900(1).jpg` absent in attachment/canonical checkout. A visually relevant `IMG_4900.jpg` exists in Downloads, 836x1080, SHA256 `a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006`; inspected locally. Do not assume byte identity with the missing filename. Source remains outside Git. Private benchmark overlays belong outside worktree.
- Adobe Illustrator 2024 installed; actual automation availability and editing acceptance untested.
- No external recognition calls made. API-key presence is not authorization. Isolated runtime must explicitly disable external vision and catalog matching for accuracy evaluation.
- Evidence directory (ignored/untracked outside feature source): `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1/`.
- Baseline commands started: `npm run test:floor-plan-platform`, `npm run typecheck`, then `npm run check:code-quality`. Outputs under evidence `baseline/`; outcomes pending.

## Smallest next executable action

Read the baseline logs; implement add/remove topology operations inside the existing canonical transaction boundary with an independently authored two-room apartment test, room lineage and hosted-opening assertions; generate vector PDF through existing pdf-lib. Continue milestones; do not request another planning prompt.

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
