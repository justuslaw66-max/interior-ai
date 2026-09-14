# Scan-to-Editable-Plan V1 — persistent status

Updated 2026-09-15. **IN_PROGRESS**. Continue the mandate; this checkpoint does not request permission to continue. Full requirements are in [MANDATE.md](MANDATE.md). Prior implementation history is preserved in Git and the private evidence logs.

## Checkout and authority

- Worktree: `/Users/justus/Developer/interior-ai-scan-to-editable-plan`.
- Branch: `feature/scan-to-editable-plan-v1`.
- Read-only live integration base: `a4295bb60c2819c0c3d380f2c758aad8f20f21db`; tree `4f82d7ab6bc838fb91ff42c4805dba7c93e0fd9d`.
- Last committed implementation: `c22172b7ba261c8d3577b422c8092a8e14c2150e`; tree `a481009e1d6e7cbbb167203fb8f74353064faa21`. Source-artwork/OCR/scale-validation batch is awaiting its ordinary checkpoint commit. Read actual HEAD/status before continuing.
- Earlier proof commit: `357030d73568c6c40bcd4fe72b2811e9af54ebda`.
- Dirty primary `/Users/justus/Developer/interior-ai` and other worktrees remain untouched. No push, PR, merge, rebase, amend, deploy, external recognition call, dependency installation, schema migration or shared database write occurred.
- User authorizes local implementation/tests/checkpoint commits and one independent read-only FINAL review. Do not spawn routine subagents. No reviewer has been spawned yet.
- `node_modules` is an ignored read-only symlink to the primary checkout with matching lockfile. Do not install packages or generate Prisma through it.

## Runtime and evidence

- macOS arm64; Node 24.13.0; npm 11.6.2. Feature launcher: `node scripts/run-scan-plan-local.mjs`, http://127.0.0.1:3018.
- Current listening PID **39639**, cwd confirmed with lsof. Task-owned prior launcher 9845/server 9847 were stopped normally to investigate startup stalls. New launcher exec session 37151. Primary port 3000 and other app ports untouched.
- Runtime uses inert supported local OAuth fixtures, external vision disabled, empty provider/telemetry keys and `postgresql://isolated:isolated@127.0.0.1:1/scan_plan_disposable`. Telemetry database errors are expected environment limitations. No shared DB endpoint is configured.
- Private evidence root: `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1` (outside Git). New server log `dev-server-r2.log`; previous server/failed browser logs retained.
- Browser tests: `SCAN_PLAN_BROWSER_ARTIFACT_DIR=<private output> node_modules/.bin/playwright test --config=playwright.scan-plan.config.ts`. Chromium/WebKit, one worker, zero retries, unchanged 120 s test / 30 s action limits. Browser execution needs sandbox escalation. The extra agent-browser session was closed.
- PDF rendering needs task-local Fontconfig: `FONTCONFIG_FILE=/private/tmp/scan-plan-fontconfig/fonts.conf FONTCONFIG_PATH=/private/tmp/scan-plan-fontconfig`. That configuration reads system fonts and writes only its own `/private/tmp` cache. Initial unconfigured Poppler attempt failed noisily; configured rerun passed. Do not repeat the unconfigured command.

## Frozen acceptance and milestones

Single selected apartment floor; existing JPEG/PNG/image and native/raster/mixed PDFs; straight walls including diagonals. Curves retained; unsupported edits reject visibly. Existing 25 MB and page/pixel/segment budgets remain. Authored integer-mm edits must survive serialization. Source comparison tolerances: 2 pixels clean paths / 3 pixels scans. PDF physical-scale error <= 0.01 mm on paper. These criteria have not been loosened.

Budgets: <=100 walls/50 openings, compile+mutation p95 <=50 ms; pointer work <=16 ms excluding rendering; local 1 MP extraction <=30 s excluding OCR; OCR within configured deadline. These are named-environment fixture budgets, not universal claims; final compile/pointer/memory measurements remain.

| Milestone | State | Current evidence / remaining work |
| --- | --- | --- |
| 0 Baseline/proof | COMPLETE | Live base, original-image discrepancy, failed importer baseline and authored canonical remove/add/3D/vector route recorded. |
| 1 Recognition | IN_PROGRESS | Mixed PDF/open-stroke retention and rotated OCR improved; real scan number audit below. Whole-plan wall/opening ground truth and thin/dashed/arc recognition remain incomplete. |
| 2 Guided review | IN_PROGRESS | Existing page/crop/scale/tracing retained; source drawing selection/text correction added. Full import/cancel/conflict route, issue zoom, planning-review tier and independent calibration confirmation remain. |
| 3 Consumer editing | IN_PROGRESS | Private canonical add/remove/attach/split/merge/opening edits pass real Consumer browser journey. Remaining controls/topology/recovery below. |
| 4 Matching 3D | IN_PROGRESS | Canonical extrusion and placement checks; matching document across views/undo/reload. All existing drag/clearance paths remain to prove. |
| 5 Vector PDF/SVG | IN_PROGRESS | Editable primitive/physical PDF tests pass; native Illustrator pending; remaining export options/fonts/curve bounds below. |
| 6 Handoff | IN_PROGRESS | Required domain checks and browser passes available; final exact-source build/production smoke/performance/independent review remain. |

## Implemented behavior

- One canonical FloorPlanDocumentV2/compiler/transaction owner. `add_wall` / `remove_wall` preserve exact coordinates; shared-wall removal stitches room loops, demands the exact reviewed hosted-opening list and explicit retained room. Exterior/hole deletion without valid replacement rejects. Freestanding partitions do not invent rooms.
- Exact boundary attachment splits straight hosts inside the same transaction; crossing opening spans reject atomically. Partial chains joining two boundary vertices divide the room; ambiguous paths reject with bounded search. Curved host attachments reject.
- Consumer proposal clones immutable original geometry. Room reconciliation preserves furniture world positions, surviving IDs, finishes and private removed-room recovery metadata (including old planPosition). Camera savedViews are already world-space. Unaffected source protections remain.
- Proposed opening edits demote only affected measurement evidence. Unchanged displayed default height/sill values are not submitted as changes. Associative dimensions recompute and invalidate stale source text. Deleted hosted marks become reference polylines.
- Canonical wall solids drive new placement containment, including openings, raised/partial walls. Existing affected furniture receives review messages without deletion/movement. Unknown item dimensions remain unresolved.
- Legacy canonical opening projections now retain world centres, fixing false host ambiguity after a boundary is split. Freestanding/diagonal legacy opening projection still needs work.
- Source drawings now live in canonical reference annotations (`source_drawing`): exact source pixels, native line/cubic/quadratic commands and text rotation, bounded validation, source ownership references. They survive failed scale/topology without fake model millimetres, do not create 3D geometry, and are excluded from default proposed vector exports and public projection. Private note/text selection is available in the existing import canvas; text corrections use canonical transactions. Raw original source bytes remain outside the document.
- Native rotated PDF text now keeps its actual baseline centre and orientation; mixed/raster PDF geometry uses conservative raster provenance. Mixed PDFs retain native paths/text and analyze raster image regions. Native-overlapping raster copies are deduplicated; incomplete raster strokes survive without being promoted to closed room cycles. Grouped PDF image operations conservatively analyze the full rendered page and deduplicate native copies. No thin-line extraction thresholds were tuned to this scan.
- Local OCR performs original/90°/270° passes using one worker and the existing total page deadline. Coordinates and text rotation return to the original registered page. Conflicting overlapping rotations remain flagged evidence and cannot supply automatic semantic labels/dimensions. No remote OCR/model call.
- Automatic scale is cross-checked against independent nearby centred dimension spans rather than trusting only a winning ratio cluster. Conflicts block automatic calibration and produce a review message. No arbitrary stretching or source-specific geometry is applied.
- PDF/SVG use canonical wall/opening/dimension/label/structure primitives. Native PDF paths/text/cubic curves, deterministic bytes, A4/A3 orientation and fixed 1:50/1:100 with fit rejection. Current font is Helvetica WinAnsi; unsupported text fails visibly. Curved wall footprint export is sampled and reported unsupported. Default export has no source raster.

## Real-input evidence (private)

- Requested `IMG_4900(1).jpg` is unavailable. Located and visually inspected `/Users/justus/Downloads/IMG_4900.jpg`, 836×1080, SHA-256 `a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006`. Optional identity question remains unanswered; do not assume byte identity.
- Initial `private-baseline`: render140.12 ms/extract559.68 ms; 23 OCR candidates, 7 dimension observations, zero valid scale/rooms/walls/openings and zero annotations. Failed automatic recognition baseline (B).
- Independent visual audit `private-source-audit/audit.json` was written by the assistant from the original image before examining rotated OCR output. It covers 16 printed numbers and three approximate dimension spans; it is NOT complete wall/opening ground truth, a human usability pilot or a site survey.
- After bounded rotated OCR: 15/16 audited numbers can supply automatic dimension observations, zero unexpected accepted numeric values. The 2950 reading is retained but explicitly conflicted with upside-down 0562. Upside-down LEDGE→39031 is also excluded from automatic dimensions. All 16 actual numbers occur in retained readings, but do not present that as 16/16 automatic acceptance.
- `private-rotated-ocr-r2` has 120 strokes +61 OCR items =181 reference annotations. Automatic topology still yields zero rooms/walls/openings. Local extraction1235.58 ms (single observation).
- IMPORTANT correction: rotated OCR initially caused the inherited scale solver to accept a spurious two-dimension cluster. An earlier commentary incorrectly said automatic scale was unresolved. Final `private-scale-review-r1` confirms zero calibrations and an explicit independent-dimension conflict. Render102.48 ms/extract1105.49 ms/scale3.81 ms/topology2.55 ms. Cross-check is now tested with an independent authored contradiction.
- Audit spans cannot fit one global scale within 3 pixels: fitted residuals approximately +1.6, -14.7 and +18.6 pixels. Approximate manually read anchors; no calibration from this audit was applied. A better source or guided measured reconstruction is required for an accurately confirmed plan.
- Before/after number reports and retained-evidence SVG/PNG: `private-source-audit/` and `private-source-audit/rotated-ocr-r2/`. Generic reproducible audit command is `scripts/scan-plan-source-audit.ts <source> <extraction.json> <independent audit.json> <private output>`. It checks source hashes and refuses unsupported nonidentity source transforms.
- Actual coverage: ONE located real scan and ONE authored apartment layout. No claim of a 15–30-plan pilot, complete geometric accuracy, observed human correction time or automatic recognition of every faint mark.

## Validation and failure ledger

- PASS latest `npm run typecheck`; `npm run check:code-quality`; full `npm run lint`; final changed-file ESLint `--max-warnings=0`; `git diff --check`. All improved debt baselines lowered; no new suppressions/exceptions. Existing +1-line `room-types.ts` exception (owner scan, expiry2026-12-14) remains for final review.
- PASS `npm run test:floor-plan-required` for source-artwork/OCR batch BEFORE last scale-cross-check helper (`required-source-art-r1.log`). Latest scale cross-check has PASS `npm run test:floor-plan-raster-linework` (`raster-evidence-r5.log`); final platform regression PASS (`platform-source-art-final.log`). Native rotated-PDF text bounds were then corrected and passed the focused raster/PDF regression again (`raster-evidence-r6.log`). No Gate A3 or production certification claim.
- PASS packaged OCR, rotated coordinate restoration, conflicting-reading exclusion, abort/failure behavior (`local-ocr-r3.log`); native/raster/mixed PDF extraction, source art calibration/immutability/text transactions and scale conflict tests (`raster-evidence-r5.log`); public projection/privacy tests (`publication-source-art-r1.log`).
- PASS `npm run test:scan-plan` (`scan-plan-source-art-r2.log`): canonical partitions/openings/world positions/reload; 24 vector primitives, 5 text objects, 1 cubic curve, 0 images; independent PDF operators/transforms measure9260 mm as92.6 mm on paper. Regenerated artifacts `artifacts/source-artwork-batch/`; updated Poppler render visually inspected.
- PASS current Consumer journey + production review-component checks in Chromium/WebKit: `artifacts/browser-source-batch-r2`, four tests49.4 s. Consumer shared-wall removal, undo/redo dependency restoration, attached new partition, opening width change, 2D/3D and exact reload; no spurious window-host warning. Consumer times38.9 s/6.1 s. Source-component harness verifies keyboard/pointer selection, cubic retention, text correction, calibration and local component reload. Harness is authored and uses inert local boundaries; it is NOT real import-service/cloud coverage. Selected screenshots inspected.
- Earlier r4 Consumer browser pass retained. Later r5–r7 stalled during hydration/button stability; r6 WebKit passed, Chromium had an unlocated parse error. Generated bundle and807 embedded modules parsed successfully. Current fresh-server pass resolves the reproduced browser check; precise original root cause remains uncertain (D suspected). Do not erase failed traces or claim a proven root cause.
- A fixes: accessible Wall label; invalid two-point polygon replacement; absent column fixture fields; test selectors; test source-coordinate expectation; public test fixture initially used non-opaque IDs; undefined optional OCR property changed object shape. Fixed and relevant tests rerun. B/environment distinction for inherited window resolver/scale solver noted above; no unrelated cleanup.
- D: original missing dummy DATABASE_URL, sandbox loopback/ps restrictions, configured Fontconfig required, transient browser/server resource behavior suspected. Required-test truthfulness passed after the first batch's three new scripts were added to inventory (291 tests, unchanged classifications/gates). This batch adds no `test-*.ts` script inventory entry.

## Illustrator acceptance

Installed Adobe Illustrator2024 version28.0.0 was read successfully. Two read-only AppleEvent calls timed out with -1712; no document was opened/edited/saved/closed, no permissions bypassed. **ILLUSTRATOR_ACCEPTANCE_PENDING**. Follow [ILLUSTRATOR-ACCEPTANCE.md](ILLUSTRATOR-ACCEPTANCE.md) using the latest `artifacts/source-artwork-batch` pack. PDF inspection/Poppler/SVG do not prove native Illustrator editing or font behavior.

## Remaining direct work / next action

1. All active tests completed. Final typecheck/code quality and scoped ESLint PASS after the native rotated-PDF correction (`types-source-art-final-r2.log`, `quality-source-art-final.log`). Save the authorized checkpoint and record its SHA/tree; then continue step 2.
2. Continue M3: robust diagonal/freestanding opening projection, endpoint/length/height/base controls and direct drag/Escape, valid wall joining, curve/hole/closed-loop cases, automatic split finish inheritance. Inspect Consumer editor/legacy projection first; do not restart repository discovery.
3. Complete room/furniture/saved-layout recovery choices. Surviving room saved-layout coordinates still need world-origin translation; old recovery metadata has origin but no choice UI. Existing furniture/circulation/drag paths need canonical collision parity. No automatic deletion/rearrangement.
4. Complete M2 source issue zoom and correction flow, reference artwork review outside initial import as needed, independent calibration cross-check and planning-review tier. Full actual import/back-navigation/cancel/failure/stale-result tests and source deletion/two-tab/private-proposal persistence remain; use only disposable/local boundaries, no shared DB.
5. Finish PDF furniture/reference-underlay options, fonts/Unicode, curved-footprint and text bounds/freshness. Extend the Consumer browser journey through the actual vector download; current PDF fixture is a separate authored sequence, not a saved artifact of the browser sequence.
6. Complete independent wall/opening ground truth and report actual input coverage without fabricating a pilot. This scan remains unresolved for precise scale/complete topology; no external provider authorization exists.
7. Final exact-source required checks/build, immutable LOCAL production smoke, compile/pointer/memory measurements, ONE independent read-only final review and remediation/retest. Re-read live target only before any later separately authorized integration. No feature-ready claim while direct blockers remain.
