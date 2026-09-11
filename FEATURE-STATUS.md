# Singapore Floor Plan feature status

Recommendation: FEATURE_REMEDIATION_REQUIRED. The scoped implementation and focused review are complete; required database verification and a product-scope decision remain unresolved. No scope reduction is assumed. Continue here after those decisions; do not restart B10 or recreate the worktree.

## Locked contract

Tier 3: protected exact Singapore unit search or public catalogue selection; truthful eligibility, source preview, variants and orientation; correct canonical millimetre geometry shared by 2D/3D; authorized save/reopen with replacement safeguards; useful failure states and upload/manual fallback; keyboard, authorization and private-data boundaries.

A: Exact search uses POST bodies, actual approved unit bindings and private transient selectors; public browse uses a separate closed DTO and public cursor. Tests cover public result/URL/analytics boundaries, published eligibility, invalid selectors and cancellation. No private address provider or nationwide catalogue claimed.
B: Closed response validation rejects malformed/unknown eligibility, private fields and unsafe revision routes. Pending authored variants show their own verification/orientation and available source context; browse variant previews with no authoritative metadata are explicitly unavailable. Canonical/variant unit tests and active exact-selection UI pass; source imagery is not represented as a transformed unit drawing.
C: Positive actual-app Chromium/WebKit journey passes canonical selection, nondefault prior-work replacement confirmation, 2D/3D switching and unchanged source geometry. Render-parity/consumer/client tests cover canonical units, opening and orientation contracts. No separate geometry model introduced.
D: Local save/reopen passes in both browsers: reopened runtime matches the actual saved design projection. Owned reference/lineage, retired and legacy reference retention, negative ownership/rebinding and failure atomicity pass in-memory tests. Real PostgreSQL-backed persistence and disposable-database lifecycle remain BLOCKED/NOT_RUN.
E: No-match, invalid input, malformed response and service unavailability are truthful; upload/manual remain supported. No fictitious request-submitted feedback. Explicit user decision pending: accept directory-request unavailability plus existing fallback, or require durable protected requests. The latter is not implemented and depends on the separate managed-protection operational track; no activation is authorized here.
F: Relevant Chromium/WebKit keyboard, focus ownership, upload fallback and privacy checks pass. Final focused security tests pass. Browser API/authentication fixtures are synthetic, not live authorization/provider/database proof.

Allowed subsystems: floor-plan UI/API/data, their direct canonical editor and owned persistence contracts, privacy-safe analytics and relevant tests. Exact changed paths are listed below. Non-goals: release certification, keys/T03/governance, provider activation, private-state inspection, database backup work, other editor features, broad cleanup, dependency upgrades, migrations, deployments, push or merge.

## Base, provenance and repository state

Approved base: integration/deep-clean-v1 at 87ba770d3f336553da7a9cbc2317b2b4a0c829d0, tree 81f7dacb61a73dba9c545fce14e76dc8dbfba56e; tracking refs/remotes/origin/integration/deep-clean-v1. Current nonsecret PR28_INTEGRATION_HANDOFF.md identified the merged target as ready for the next feature. Relevant origin/ref-only fetch completed 2026-09-11 and remained at that SHA. Remote: git@github.com:justuslaw66-max/interior-ai.git.

Feature: feature/fpd-sg-fast-feature in /Users/justus/Developer/interior-ai-fpd-fast-feature, created clean from that base. Initial port provenance: 850fc6b and 27618f3 from the clean feature/fpd-p0b-managed-field-protection history; merge base 72ec9e5d3d3cf4bd1afb20b25f062eb9abaa224a. Applied only that pair's diff; excluded later backup/KMS/dependency work. Existing dirty canonical checkout at 72ec9e5 on wip/integration-dirty-pre-display-units-20260902 was preserved; other worktrees and external security evidence were not modified.

Implementation commit: cf91083db8555be2f4a1d8f2775e1e639e240e76.
Final test correction commit: a398b2efcf0cb1ec2ca3e4532130a331fd9ef103.
This checkpoint's subsequent commit changes only this file. Resolve exact current HEAD with git rev-parse HEAD; no self-referential commit hash is asserted. Worktree was clean before this documentation update; verify cleanliness after committing it. All commits remain local.

Special files: package.json registers the privacy test and adds it to the existing required floor-plan chain. scripts/required-test-manifest.json updates only that closure identity, privacy source registration and script inventory. scripts/code-quality/baseline.json lowers improved metrics on touched floor-plan files; no thresholds/exceptions weakened. No package-lock/dependency/migration/workflow changes.

Dependencies: independent copy-on-write node_modules from the canonical checkout; package-lockSHA256 ff61bfab30cea6196ff453b228da91d70121c1ce9ab266dadc35ba1a61b7b51d in both copies; all 723 installed lock entries matched versions/integrities. Node 24.13.0/npm 11.6.2. No private env files copied/read, provider connection, install hooks or dependency upgrades. Task-owned servers have been stopped by Playwright; verify port 3000 absence at final closeout.

## Verification and evidence bindings

Application source in a398b2e is identical to cf91083; only this checkpoint and the new browser journey assertion differ. Ordinary complete logs/reports and retained failed artifacts are in test-results/fpd-fast-feature (ignored, local). No remote or certification evidence is claimed from these files.

PASS on committed cf91083: 14 focused scripts (directory-privacy, consumer-flow, catalog-client, catalog-repository, design-reference, design-reference-persistence, public-document, render-parity, public-display-metadata, serving-integrity, authored-variant-links, optional-configurations, request-hardening, shared-rate-limit), npm run verify:design-persistence, npm run test:phase7-security-boundaries, npm run typecheck, npm run lint -- --max-warnings=0, npm run check:code-quality and npm run test:required-test-truthfulness. Exact commands, statuses and SHA are in committed-focused.json; individual logs are committed-*.log. Focused TS commands use the existing local ts-node/tsconfig-paths runner.

PASS production build on cf91083: npm run build; supported explicitly inert local OAuth fixture, APP_ENV=development, NEXT_PUBLIC_ENABLE_QA_HOOKS=1, no real provider or usable database endpoint. This is a production-mode application build for local testing, not production release eligibility. Exact result:committed-browser-build.json / build-final.log.

Browser: 20 existing tests passed across Chromium/WebKit on cf91083 (browser-final.log). The two added active journey tests passed on a398b2e using the same production artifact/source (browser-positive-final.log / positive-final.json); changed-test typecheck and lint also passed. Commands: local playwright test --config=playwright.floor-plan-upload.config.ts, and the affected-case rerun with --grep 'directory cancellation'. Existing actual-app tests and inert empty-entry fixture tests remain distinguishable; no-op fixture callbacks are not positive-selection evidence. Auth/catalogue/revision APIs are explicitly mocked; actual application selection, editor, rendering and local backup/reload run in the browser.

PASS git diff --check before each local commit; recheck at closeout. Required remote feature gates remain NOT_RUN because the branch is unpushed. Real database-backed persistence/lifecycle: BLOCKED/NOT_RUN, not N/A. Real providers, release GateA3, key operations and deployment:N/A to this authorized feature milestone, not accomplished.

## Review and failure classification

One genuinely separate reviewer, fpd_focused_review, inspected the whole feature diff and direct contracts read-only. It found two direct blockers: saves of retained retired/legacy references rejected as new selections; authored-variant confirmation displaying stale orientation/source context. One remediation cycle fixed both. The same reviewer inspected the corrections and found no remaining direct flaw in those two findings. Reviewer did not independently execute tests; implementation verification is reported separately.

Feature-caused failures fixed: malformed HTTP response trust, stale browse application, invalid punctuation silently normalized into a different unit; quality growth corrected without relaxed limits; two static tests updated to assert the actual moved hook ownership. The privacy script inventory was registered rather than omitted.

Browser test failures retained: r1 incorrectly expected confirmation for a default starter room (the source contract allows direct replacement); test now seeds nondefault existing work in the actual local backup format. Next run compared a transient pre-save QA marker with the post-reload runtime. Bounded diagnostic captured identical before/after saved JSON; both yielded a85bc7d7 through production storedToSnapshot/fingerprintDesignSnapshot, matching the reopened runtime. The corrected assertion compares the actual saved projection and passes. No production persistence change was made to conceal this test assumption. Artifacts:browser-r1-artifacts, browser-final-artifacts, browser-reload-diagnostic-artifacts, synthetic-snapshot-roundtrip.json.

Environment-only observations: local browser server logs analytics persistence errors against intentionally unreachable 127.0.0.1:1; no real database target was used. They are not live persistence passes. No inherited required failure has been established on the exact base; do not attribute remaining blockers to baseline repair. No unrelated maintenance blocker found in focused review. Broader UI diagnostic-marker timing could be examined separately if useful; no maintenance branch created.

## Required CI and exact next action

Exact base 87ba770 had successful Secret scan, Stable checks, Advisory contract preflight and merge-gate in GitHub run 34254522550: https://github.com/justuslaw66-max/interior-ai/actions/runs/34254522550 . Advisory contract preflight is required by merge-gate despite its name. Branch-protection API returned 404 Branch not protected, and branch-rules API []; repository-required gates still apply unchanged. Feature checks cannot be inferred from base green. Final local HEAD has not been pushed; remote gates/merge approvals unavailable, so READY_TO_MERGE_FEATURE is not warranted.

Pending user decisions already requested in Codex:
1. Product: retain explicit durable-request unavailability and upload/manual fallback, or require durable protected requests and preserve the separate operational dependency as a blocker. No unapproved deferral is recorded as accepted.
2. Database: explicitly authorize exclusive creation of interior_ai_fpd_fast_feature_test_20260911 on existing 127.0.0.1:5432, unchanged repository migrations, synthetic feature persistence/lifecycle tests, and removal only of that task-owned database. Stop if it exists or the connection is unavailable; no credentials search, shared database access or server changes. No such connection or mutation has occurred.

After authorization, continue only dependent database-backed owned-save/reopen/reference eligibility/rollback checks and owned database cleanup, record actual results here, and resolve acceptance E according to the user's product decision. If durable requests are required, this feature remains blocked until their separate protection prerequisites and implementation are authorized and satisfied. Preserve all current successful evidence whose source/dependency binding remains unchanged. No second broad review, release certification, provider activation, push/merge or deployment under this mandate.

## Changed paths

- FEATURE-STATUS.md
- app/api/designs/[id]/route.ts
- app/api/floor-plans/revisions/[id]/route.ts
- app/api/floor-plans/route.ts
- app/providers/PostHogProvider.tsx
- components/editor/FloorPlanAddressFields.tsx
- components/editor/FloorPlanAddressSearch.tsx
- components/editor/FloorPlanCatalogResultList.tsx
- components/editor/FloorPlanSelectionContext.tsx
- components/editor/useFloorPlanExactSearchRequests.ts
- components/editor/useFloorPlanResultApplicationRequests.ts
- lib/design-page-house-plan.ts
- lib/floor-plan-authored-variant-links.ts
- lib/floor-plan-binding-match.ts
- lib/floor-plan-catalog-client.ts
- lib/floor-plan-catalog-cursor.ts
- lib/floor-plan-catalog-prisma.ts
- lib/floor-plan-catalog-repository.ts
- lib/floor-plan-consumer-search.ts
- lib/floor-plan-design-reference.ts
- lib/floor-plan-directory-client.ts
- lib/floor-plan-directory-contract.ts
- lib/floor-plan-directory-response.ts
- lib/floor-plan-exact-search-request-authority.ts
- lib/floor-plan-imports/public-document.ts
- lib/floor-plan-revision-updates.ts
- lib/posthog-privacy.ts
- lib/useDesignPageFloorPlanUnderlayController.ts
- package.json
- scripts/code-quality/baseline.json
- scripts/floor-plan-public-privacy-assertions.ts
- scripts/required-test-manifest.json
- scripts/test-floor-plan-authored-variant-links.ts
- scripts/test-floor-plan-catalog-client.ts
- scripts/test-floor-plan-catalog-repository.ts
- scripts/test-floor-plan-consumer-flow.ts
- scripts/test-floor-plan-design-reference-persistence.ts
- scripts/test-floor-plan-design-reference.ts
- scripts/test-floor-plan-directory-privacy.ts
- scripts/test-floor-plan-optional-configurations.ts
- scripts/test-floor-plan-public-document.ts
- tests/required/fixtures/floor-plan-directory-fixture.ts
- tests/required/floor-plan-upload-accessibility.spec.ts
