# Scan-to-Editable-Plan V1 — acceptance continuation

2026-09-15. **IN_PROGRESS**. Real-input recovery and consumer acceptance remain open local work. The normal isolated installation gap is closed for the resumed revision. This is not READY, integrated or deployed. Scope: [original mandate](MANDATE.md), [acceptance continuation](Scan_Plan_Acceptance_Completion_Mandate.md).

## Source, revision and authority

- **Source identity CLOSED:** local `/Users/justus/Downloads/IMG_4900.jpg` was rehashed: SHA-256 `a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006`, 93,802 bytes, 836 × 1080 pixels. These are the original uploaded `IMG_4900(1).jpg` bytes. Earlier identity uncertainty is superseded, not extraction accuracy.
- Worktree `/Users/justus/Developer/interior-ai-scan-to-editable-plan`, branch `feature/scan-to-editable-plan-v1`. Resumed HEAD **21b3354e11e222c1ef9e3df6e0979a13c9e17add**, tree **7573057964b3b129818ba32b1d6d3a34466da26e**, initially clean. Its only diff from the previously tested dbc0ef4 is this status document.
- Continuation changes: retain rejected scale associations and their endpoints/counts in private diagnostics; describe those endpoints as unverified in review; retain individual pipeline-stage outputs in the local benchmark. No tolerance, topology, dependency or canonical geometry change. Current edits await a normal local checkpoint and verification of that exact revision.
- Base **a4295bb60c2819c0c3d380f2c758aad8f20f21db**, tree **4f82d7ab6bc838fb91ff42c4805dba7c93e0fd9d**. No target synchronization. Dirty primary `/Users/justus/Developer/interior-ai` preserved.
- **E** = `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1`. Prior handoff preserved verbatim in E/status-before-acceptance-continuation-21b3354.md and Git. Existing immutable preview/evidence remain unchanged.
- Local work/tests/ordinary commits authorized. No push, PR, merge/rebase/amend, deployment, shared-database writes, secrets changes or external recognition. The one independent review is complete; no new review campaign.

## Normal isolated installation — PASS on 21b3354

Directory E/clean-install-21b3354-r1/source, Node **24.13.0**, npm **11.6.2**, normal `npm ci` with lifecycle scripts enabled. First attempt failed ECONNRESET; the same normal command succeeded on retry. Both logs retained. Prisma Client 7.9.0 generated only into this copy against an inert database URL.

- Own real node_modules and package cache; zero dependency symlinks escaping this installation. No overlay, borrowed packages, dependency updates or skipped lifecycle scripts.
- Lock SHA-256 **795e5926392614736ba10acb4ec97ef83941128b6a58b5265cc2746c2f3a92f0**. All 3,980 tracked files, including 222 expanded LFS assets, verified unchanged after installation/build/checks. Manifest and lockfile unchanged.
- Declared installed feature packages: @pdf-lib/fontkit1.1.1, pdf-lib1.17.1, sharp0.35.3, @napi-rs/canvas1.0.2, tesseract.js7.0.0, @tesseract.js-data/eng1.0.0. Exact real paths in dependency-verification.json.
- `npm run build -- --webpack`, `npm run typecheck`, `npm run test:scan-plan`, `npm run test:floor-plan-required`: **PASS exit0**. BuildID **QJxlSBUiC2Nca9YhMAs3O**. Optional existing local-OCR createRequire bundler warning remains; local OCR actually ran in the trace below.
- Actual PDF/SVG export and independent pypdf/Poppler verification **PASS**: 297 × 210 mm, 9260 mm span → 92.6 mm paper, 21 path starts, 5 text objects, 1 cubic swing, 0 images, complete licensed font embedded. Fresh PDF SHA **a06977f066e4feed3b5248badb6f4126344a8503ce190e7ba5dd68f830422e76**. Same bytes as the prior authored test pack. Native Illustrator remains a separate acceptance check.
- Evidence: E/clean-install-21b3354-r1/{verification-complete.json,identity.json,dependency-verification.json,ci.log,ci-r2.log,build.log,types.log,scan.log,required.log,vector-pack}. No browser run claimed yet for this installation. These checks do not certify later continuation code.

## Real-source diagnosis and honest coverage

The actual adapter was rerun with external vision disabled using the clean declared installation. E/clean-install-21b3354-r1/real-scan-trace retains render/extract/solveScale/buildTopology/validate outputs and diagnostics. Original-to-rendered transform is identity; no deskew applied (estimated 0.25 degrees, insufficient confidence). Source digest verified before processing.

| Stage | Actual result and interpretation |
|---|---|
| Raster extraction | 243 horizontal/143 vertical runs → 65 horizontal/55 vertical strokes. 96,590 cycle checks, not capped, **0 conservative closed paths**. Strokes include text and dimensions; they are not semantic walls. |
| Local OCR | 61 retained text readings, 15 accepted printed dimension observations out of 16 independently read numbers. 2950 remains conflicted with rotated 0562. No complete-plan accuracy percentage claimed. |
| Semantics | 0 room labels/boundary proposals, 0 opening/fixture proposals. The optional external classifier was disabled. |
| Initial scale hypothesis | **66.007944 mm/px**, based on wrongly associated 38px (2500) and 53px (3510) fragments. This is a rejected machine hypothesis, never a confirmed scale. |
| Cross-check | Rejected 2500/1940/3510 associations with 127.1/285.6/163.8px residuals. Those alternative hosts also lack verified witness endpoints; the old message over-attributed them to independent dimension conflict. New diagnostics retain the raw 111 single/8 compound candidates instead of silently reporting zero after rejection. |
| Topology | Without scale: scale_unavailable. Diagnostic-only execution with the rejected scale still gives **no_closed_faces**. PDF wall-footprint fallback requires native PDF paths and does not interpret raster runs as wall bands. Zero canonical walls/rooms/openings; not a UI-only loss. |
| Reference preservation | 120 source strokes and 61 text annotations remain private reference artwork. This is not automatic editable-wall conversion. |

Independent assistant visual audit of all 16 printed dimensions: exact source crops, original/rendered/crop transforms, OCR candidates/orientation, automatically associated endpoints, separately observed tick endpoints, projected/Euclidean lengths and residuals are retained in E/clean-install-21b3354-r1/source-span-audit/{index.html,audit.json,*.png}. These approximate pixel observations are not site measurements or a human pilot. Projected-versus-Euclidean differences are under0.046px; that distinction cannot explain the observed disagreement. The top9260 span is about518px; the bottom chain totaling9260 is about501px. Their same-axis discrepancy remains beyond the frozen3px tolerance using observed ticks, independently of the erroneous automatic associations. No uniform scale is claimed; no image warp performed. Exact reconstruction requires a consistent source or explicitly reviewed measurements/constraints.

The original scan remains in results. Automatic recovery is incomplete; assisted import→wall/opening edits→save/reload→3D→furnish→PDF remains **NOT_DEMONSTRATED for this scan**. Existing authored-fixture journeys are separate. No manual tracing or authored JSON is counted as recognition, and no human correction-time claim exists.

## Illustrator — partial native observation, acceptance pending

**ILLUSTRATOR_ACCEPTANCE_PENDING.** User screenshot at2026-09-15 11:34:48 shows Illustrator2024 with proposed-apartment.pdf open as artwork, one displaced wall individually selected with vector handles. User reports that individual items can be moved. This supports native individual-object editing of the authored PDF.

Dimension Type-tool edit9260→9300, font/substitution warning, individual door leaf/swing manipulation, edited-copy save/close/reopen, paper scale and SVG checks still need actual observations. Pink text highlighting is visible; its cause has not been established. Exact observed output paths/hashes are pending. Previously read installed version28.0.0; no new automation result inferred. Two old AppleEvent timeouts preserved; no retry loop. Private screenshot/report: E/illustrator-manual-20260915. [Manual checklist](ILLUSTRATOR-ACCEPTANCE.md).

## Preserved completed work and limitations

- One canonical FloorPlanDocumentV2/compiler/transaction system drives private Consumer proposals, source revisions, 2D/3D, openings, furnishing/collision, export and persistence. Numeric/native wall edits, straight partial/full/diagonal T/L partitions, joins, holes, undo/reload and planning-review provenance remain implemented. Hosted opening deletion requires explicit dependency confirmation. Late import responses cannot replace the active design.
- Sole independent reviewer found three feature defects, fixed in **dbc0ef4013e9fe085c16a7baa3bfb11736706af3**, tree **fb3b36a9fbe0c9c9debf82fa9c7d575370411584**: partitions crossing curved boundaries, zones staying with the parent after room division, and incorrect dimension witness origins. Regression coverage retained. E/independent-final-review-dc55090.md.
- Immutable dbc0ef4 preview BuildID **ERsMos9wWbgkk3N9_wAyz**, all38 Chromium/WebKit cases passed with0retries; domain/required/build/types/lint/quality passed. E/local-preview-dbc0ef4. This is historical exact-source evidence, not a browser pass for current changes.
- Real disposable PostgreSQL confirmation/deletion/version races passed, with source-row lock ordering and actual routes/Prisma; only login was stubbed. E/db-retention-r1/concurrency-r2.{json,log}. Cluster stopped; no schema/shared-DB change.
- Frozen limits remain: clean2px/scan3px source error; exact integer-mm authored edits; paper≤0.01mm; native gesture≤1.5CSSpx; mesh≤5e-6m;100walls/50openings compile/mutation p95≤50ms; pointer≤16ms excluding rendering;1MP extraction≤30s excluding bounded OCR. Previous Node/browser limits pass; human timing unmeasured.
- **Curves:** adding/joining partitions is blocked on any floor containing curved walls, broader than curved-wall authoring alone. Existing curves remain intact; no new curved topology engine. [Consumer guide](CONSUMER-GUIDE.md).
- **Inherited renderer resource growth remains unresolved:** +3textures/+1geometry per repeated3D/2D switch, Chromium after-GC heap34.66→36.24MB over six cycles; WebKit heap unavailable. Unchanged lighting/ContactShadows allocations implicated but all-resource attribution unproven. No memory-stability PASS.
- PDF/SVG separate paths/text, fixed A4/A3 1:50/1:100, optional private retained underlay, explicit unsupported glyph/shaping/curved-footprint limitations. Liberation Sans139,512B/SIL OFL1.1, font SHA f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f; fontkit1.1.1/MIT. No Illustrator-native layer/PGF promise.

## Pending inputs and next work

- Native Illustrator follow-up requested directly in Codex; the user has partially responded as recorded above.
- One targeted request for local paths to3–5 authorized varied apartment plans and known measurements is pending. No independent additional layouts processed; no15–30-plan pilot claimed.
- **AWAITING_APPROVAL_IN_CODEX** only for the proposed one-call OpenAI GPT-5.6 Sol experiment on this confirmed scan, max12,000 output tokens/US$1, store:false/no retries. Standard API content retention terms disclosed. Details E/recognition-experiment-proposal.md. No external processing or credential read performed. Local work continues while pending.
- Next: finish exact-revision checks for diagnostics changes; demonstrate the real scan's consumer draft/calibration/conflict state; complete supported assisted conversion when adequate source evidence is available; finish native Illustrator and independent-plan acceptance. Do not relabel remaining local recognition/UI work as exclusively external.

Runtime provenance last checked: feature3018PID34870 cwd feature worktree; immutable3020PID82067 cwdE/local-preview-dbc0ef4/source. Recheck actual lsof before runtime edits. Existing ignored feature dependency overlay remains untouched; installations only in disposable copies.
