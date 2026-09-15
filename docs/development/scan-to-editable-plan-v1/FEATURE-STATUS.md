# Scan-to-Editable-Plan V1 — handoff status

2026-09-15. **IMPLEMENTED_PENDING_EXTERNAL_ACCEPTANCE**. Local implementation, the one independent review/remediation cycle, and final exact-source verification are complete. Required real-input accuracy and native Illustrator acceptance remain open; this is not READY or deployed. Full request: [MANDATE.md](MANDATE.md). Historical details: Git dbc0ef4 version of this file, E/status-before-handoff-dbc0ef4.md and E/status-before-final-consolidation-dc55090.md.

## Exact identity and authority

- Candidate **dbc0ef4013e9fe085c16a7baa3bfb11736706af3**, tree **fb3b36a9fbe0c9c9debf82fa9c7d575370411584**.
- Worktree `/Users/justus/Developer/interior-ai-scan-to-editable-plan`; branch `feature/scan-to-editable-plan-v1`. Subsequent status-only commits do not change this tested candidate. Read actual git HEAD/status before resuming.
- Base **a4295bb60c2819c0c3d380f2c758aad8f20f21db**, tree **4f82d7ab6bc838fb91ff42c4805dba7c93e0fd9d**. Integration ref resolved read-only at mandate start; re-read live target before any separately authorized integration. Protected dirty primary `/Users/justus/Developer/interior-ai` untouched.
- Private evidence root **E** = `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1`.
- Local implementation/tests/ordinary commits authorized. **No push, PR, merge/rebase/amend, deployment, shared database change, secrets change, paid infrastructure or external recognition performed.** No active permission request/rejection. One independent read-only reviewer `/root/final_review` completed; all three findings remediated. No second review campaign.

## Consumer workflow and milestone outcome

| Milestone | State |
|---|---|
| M0 baseline/proof | Complete: exact baseline, source discrepancy, authored end-to-end demonstration. |
| M1 recognition | Extraction improvements implemented; whole-plan real-input accuracy acceptance remains pending. |
| M2 review | Page/crop/source artwork, scale cross-checks, issue navigation, provenance, planning review and lifecycle guards implemented. |
| M3 Consumer edits | Canonical wall/opening numeric and native editing, partition/room topology, recovery, undo/reload implemented. |
| M4 3D/furnishing | Matching canonical geometry, placement/collision and furnishing implemented; inherited resource growth disclosed below. |
| M5 PDF/SVG | Scaled vector export and independent inspection pass; **ILLUSTRATOR_ACCEPTANCE_PENDING**. |
| M6 verification/handoff | Domain/required/build/types/lint/quality and all38 immutable browser cases PASS. No production/GateA3 or merge certification. |

- Guided upload review preserves original source and non-building artwork; artwork never automatically becomes geometry. Bounded rotated OCR and mixed-PDF extraction retain uncertainty, page transforms and evidence. Scale stores original endpoints, raw units, integer-mm rounding and up to eight independent checks. Conflicting scale saves as draft but blocks confirmation; no hidden perspective warp or invented topology.
- Consumer edits create a private proposed child. One FloorPlanDocumentV2/compiler/transaction owner regenerates 2D/3D/projections atomically. Original reference, surviving IDs, world furniture positions and recovery data are preserved. User-reviewed-for-planning never grants source/construction certification; geometry changes invalidate it, undo restores the baseline.
- Straight diagonal, full/partial partitions, T/L junctions, valid split/join, merged rooms and enclosed-room holes use canonical transactions. Hosted-opening deletion requires explicit dependency confirmation; crossing a split rejects. Zones follow furniture; spanning zones split into room-specific groups with a visible review message. Accepted gestures are one undoable change; Escape cancels previews.
- **Curve limitation:** existing curves remain intact. Adding/joining partitions on any floor containing curved walls is explicitly unsupported. This conservative guard avoids chord-based false containment. Curved authoring was out of scope; no silent straightening. Curved exported footprints remain sampled and are reported.
- Import actions are bound to file/job/consent/lifetime. Late responses cannot replace an active design or navigate after closure. A sent confirmation may finish creating its separate design; history can reopen it. Stale candidate versions require reload/review.
- Confirmation and deletion lock the same source row and recheck ownership/version/retention before CAS. Deletion scrubs saved underlays without deleting canonical geometry. Source images are private and opt-in for export; retention checks prevent stale image fallback. Affine/reflected registration is shared by picking, actual image mesh and PDF/SVG transforms.
- PDF/SVG contain separate walls, windows, door leaves/swings, fixtures/furniture, live dimensions and editable text. Fixed A4/A3 1:50/1:100 exports reject overflow. Clean output has no source raster/filename/metadata. Liberation Sans Regular is bundled under SIL OFL1.1; @pdf-lib/fontkit1.1.1 is MIT. Unsupported glyph/shaping/multiline fails visibly. No proprietary Illustrator layer/PGF promise.

## Verification evidence

All numeric tolerances were frozen before final evaluation: clean2px/scan3px source error; exact authored integer-mm edits; paper error<=0.01mm; native gesture<=1.5CSSpx; actual mesh<=5e-6m; <=100walls/50openings compile/accepted mutation p95<=50ms; pointer<=16ms excluding subsequent render;1MP extraction<=30s excluding bounded OCR. No universal memory/render threshold was invented.

| Command/check | Result and evidence |
|---|---|
| `node E/run-feature-check.mjs test:floor-plan-required` | **PASS**, final candidate session95337exit0; E/required-dbc0ef4-r1.log. Includes platform/ownership/retention/worker/ingress/review regressions.27 inherited architecture size warnings. |
| `npm run test:scan-plan` | **PASS**, matching immutable source; includes topology/Consumer/vector/scale/confirm/registration/planning/navigation and new final-review regressions. E/local-preview-dbc0ef4/scan-plan-domain.log. |
| `npm run typecheck`; `npm run lint -- --max-warnings=0`; `npm run check:code-quality` | **PASS**, same source before commit. E/final-remediation-{types,lint,quality}-r2.log.1265production files/183baselined oversized/541function-debt/18inherited suppressions/0cycles; no new suppressions. |
| `node E/local-preview-dbc0ef4/run.mjs build` | **PASS exit0**, immutable3980trackedfiles/222LFS verified unchanged. BuildID **ERsMos9wWbgkk3N9_wAyz**; identity.json and build.log. Optional inherited local-OCR bundler warning. |
| Playwright scan-plan config, Chromium+WebKit | **PASS38/38 in3.9min**, session9810exit0;1worker,0retries,unchanged120s/30s limits; exact source/harness with SCAN_PLAN_PERFORMANCE_ENFORCE=1. E/local-preview-dbc0ef4/browser-r1.log and browser-r1-artifacts. |
| Independent PDF/font/render inspection | **PASS**: A4 landscape297×210mm,9260→92.6mm,21pathstarts/1cubic/5textobjects/0images; font SHA/bytes match. E/local-preview-dbc0ef4/vector-pack/independent-pdf-inspection.json and proposed-apartment.png. Native Illustrator NOT_RUN. Final Poppler and native2D/3D captures visually inspected. |
| `verify:design-persistence` | **PASS** on prior production batch; E/persistence-import-lifecycle-r1.log. Final zone-specific real HistoryManager undo/redo and stored reload also pass. |

Browser command from the immutable source:

```sh
SCAN_PLAN_BASE_URL=http://127.0.0.1:3020 SCAN_PLAN_PERFORMANCE_ENFORCE=1 SCAN_PLAN_BROWSER_ARTIFACT_DIR=<private-output> node_modules/.bin/playwright test --config=playwright.scan-plan.config.ts
```

Component review/lifecycle cases use actual production components with inert HTTP/router boundaries. Actual /design cases cover native wall/opening/furniture/3D/undo/reload/export and rejected curves. These are not live cloud login/provider-quality certification. Earlier dc55090 all36cases passed but is superseded by the three reviewed fixes; do not substitute that pass for final candidate verification.

**Real PostgreSQL concurrency PASS:** `npm run test:scan-plan-postgres-concurrency` uses real Prisma and confirmation/source-deletion/retention routes, with only login identity stubbed. A third SQL transaction holds the source row; pg_stat_activity/pg_blocking_pids proves ordering. Deletion-first rejects confirmation with no orphan; confirmation-first then deletion preserves plan and scrubs underlay; simultaneous confirmations create one design; real version7→8 CAS rejects stale input; wrong owner404/no login401. E/db-retention-r1/concurrency-r2.{log,json}. PostgreSQL16.14 bound only127.0.0.1:55438 with guarded SHOWdata_directory under E; unchanged schema, authored data only, cluster **stopped**. Not cloud two-tab/login certification.

## Performance and inherited limitation

- Node24.13/macOSarm64/AppleM3Pro/12CPU/38.65GB. Same two-room authored plan at7walls/2openings and a stress variant at100segments/50smallwindows; the variant is not an independent recognition plan or typical window layout.
- Final compile p95 **3.355ms**, accepted edit including fork/compiler/projections **8.224ms**, render projection **3.179ms** for dense input. Synthetic1MP normalization+linework max **55.727ms** over5samples, excluding OCR;16segments. Dense forced-GC heap45.47→45.70MB. E/local-preview-dbc0ef4/performance-domain.{json,log}. All frozen Node budgets pass.
- Final browser performance PASS:105trusted pointer events per engine, p95Chromium .200ms/WebKit1ms; render CPU p95 5.2ms/4ms, excluding GPU completion. Setup-to-editor-ready including scripted clicks6.084s/1.181s (not pure load timing). Browser reports in each performance case artifact folder. Exact rendered IDs account for existing camera cutaway; canonical100walls/50openings remain unchanged.
- **Inherited resource growth:** +3renderer textures/+1geometry per repeated3D/2D cycle in both engines and prior production. Final Chromium after-GC heap34.66→36.24MB from first through sixth3Dcycle (pre3D34.06MB); WebKit heap unavailable. Lighting source and Drei dependency unchanged from base; installed ContactShadows allocates render targets without cleanup. Exact attribution of all3textures unproven. Independent reviewer judged this reportable inherited behavior, not a demonstrated feature blocker. **No memory-stability PASS claim.**

## One final review/remediation and failure classes

- Reviewer found three **A feature-caused** defects: straight partitions crossing a curved exterior, zones left behind after room division, and dimension witnesses starting at projected points. All reproduced and fixed in dbc0ef4. Tests cover source immutability, visible curved addition/join rejection, intact/split-zone membership plus real undo/redo/reload, and horizontal/vertical/aligned/opposite-side PDF/SVG witnesses.
- Focused native curve tests PASS2/26.5s/0retries before final build. E/browser-curved-remediation-r1-artifacts; screenshot inspected. Review findings/disposition: E/independent-final-review-dc55090.md. No second independent review claimed.
- Corrected test-only failures: duplicate witness vertex, readonly fixture typing, obsolete static delegation assertions and rapid-event timestamp coalescence. Original failing evidence retained; frozen geometry/time limits and minimum sample counts unchanged.
- **B inherited:** architecture warnings, optional OCR bundler warning and renderer resource growth. **D environment:** earlier development restart, macOS timing wrapper sysctl restriction and Illustrator AppleEvent timeouts. Final build exits0 without that timing wrapper. No unresolved newly exposed unrelated repair expanded into scope.

## Required external acceptance and actual coverage

- Requested IMG_4900(1).jpg was unavailable. Different located `/Users/justus/Downloads/IMG_4900.jpg`,836×1080,SHA256 **a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006**; identity not confirmed. ONE real scan+ONE independently authored apartment; no15–30pilot, independent whole-plan wall/opening ground truth or human correction-time study.
- Baseline23OCR/7dimensions/0calibration/topology. Improved rotated local OCR accepted15/16 independently audited numbers with0unexpected;2950 conflicts with0562,LEDGE39031 excluded.120strokes+61OCRreference annotations preserved, **0 inferred topology**. All16 occur in retained readings, not16automatic acceptances. Independent approximate span residuals+1.6/−14.7/+18.6px cannot satisfy one global3px scale; plan stays visibly scale_unresolved. Better source or measured tracing required. E/private-source-audit and E/private-scale-review-r1; no fabricated walls/rooms or synthetic accuracy claim.
- **ILLUSTRATOR_ACCEPTANCE_PENDING:** installed Illustrator2024v28.0; two read-only AppleEvents timed out−1712. No artwork opened/edited/saved/reopened. PDF inspection, font embedding and SVG do not prove native editability. Fresh authored test pack: E/local-preview-dbc0ef4/vector-pack, [instructions](ILLUSTRATOR-ACCEPTANCE.md), [Consumer guide](CONSUMER-GUIDE.md). The supplied scan's full central journey has not been certified.
- No schema migration or secrets/env change. Normal dependency install must include @pdf-lib/fontkit1.1.1 and bundled font/license. Tests/build used read-only existing packages plus isolated fontkit overlay; **full clean dependency installation has not been certified**. No paid/external processing authorization requested or used.

## Handoff and remaining acceptance

- All required local work is complete. Final3980trackedfiles/222LFS and BuildID reverified unchanged after38-case run; E/local-preview-dbc0ef4/identity.json records PASS and pending external acceptance. Fresh independent affine-image PDF checks also pass in both engines: max2.796e-11mm versus0.01mm. No active test/review sessions.
- Current artifacts: E/local-preview-dbc0ef4/vector-pack (PDF/SVG/source fixture/manifest/inspection/PNG); browser-r1-artifacts (native2D/3D/furnishing/reload/registered-image/privacy/lifecycle/performance); E/independent-final-review-dc55090.md; E/db-retention-r1/concurrency-r2.json. Compact authored-only review pack: E/scan-to-editable-plan-v1-review-pack.zip.
- External acceptance requires confirming/providing the actual source and authorized independent plans/ground truth, plus opening/editing/saving/reopening the supplied PDF and SVG in Illustrator using [the checklist](ILLUSTRATOR-ACCEPTANCE.md). The one real scan remains visibly unresolved. No invented pilot, human correction times or model-quality scores.
- Any integration, publication, paid model test or deployment requires separate authorization. Re-read the live integration target and assess drift then. Full clean dependency installation and merge/CI readiness are not certified by this local run. Do not create a monitor, goal or another review campaign without a new request.

Runtime: finalpreview3020PID82067/session22998 cwdE/local-preview-dbc0ef4/source; featuredev3018PID34870; primary3000 untouched. Verify with lsof before anyappedit. Immutable source must stay unchanged. Use bundledPython3.12 at `/Users/justus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` for E/verify-final-vector-pack.py and E/create-immutable-preview.py. Never install/generate through the shared node_modules links.
