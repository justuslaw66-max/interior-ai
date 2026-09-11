# Singapore Floor Plan feature status

READY_FOR_FEATURE_REVIEW. Local implementation, validation and focused review are complete under owner approval in attachment 4b2abe57-4aaa-43d4-9957-c304405b18ba. Remote checks for the unpushed final HEAD are NOT_RUN. Starting branch/HEAD c4208ce6b3a93596d73c00c5360c3a8a634daede and clean worktree/index verified. Durable requests are DEFERRED_BY_OWNER for this increment; no other acceptance criterion is deferred.

## Locked contract

Tier 3: protected exact Singapore unit search or public catalogue selection; truthful eligibility, source preview, variants and orientation; correct canonical millimetre geometry shared by 2D/3D; authorized save/reopen with replacement safeguards; useful failure states and upload/manual fallback; keyboard, authorization and private-data boundaries.

A: Exact search uses POST bodies, actual approved unit bindings and private transient selectors; public browse uses a separate closed DTO and public cursor. Tests cover public result/URL/analytics boundaries, published eligibility, invalid selectors and cancellation. No private address provider or nationwide catalogue claimed.
B: Closed response validation rejects malformed/unknown eligibility, private fields and unsafe revision routes. Pending authored variants show their own verification/orientation and available source context; browse variant previews with no authoritative metadata are explicitly unavailable. Canonical/variant unit tests and active exact-selection UI pass; source imagery is not represented as a transformed unit drawing.
C: Positive actual-app Chromium/WebKit journey passes canonical selection, nondefault prior-work replacement confirmation, 2D/3D switching and unchanged source geometry. Render-parity/consumer/client tests cover canonical units, opening and orientation contracts. No separate geometry model introduced.
D: Local save/reopen passes in both browsers: reopened runtime matches the actual saved design projection. Owned reference/lineage, retired and legacy reference retention, negative ownership/rebinding and failure atomicity pass in-memory tests. Real PostgreSQL-backed persistence, rollback, catalogue privacy and retired-reference lifecycle now PASS; exact disposable-target cleanup and absence are verified (closeout evidence below).
E: No-match, invalid input, malformed response and service unavailability are truthful; upload/manual remain supported. No fictitious request-submitted feedback. Durable requests are DEFERRED_BY_OWNER for this increment. Existing copy explicitly says directory requests are unavailable and opens the supported local/manual plan workflow. It makes no submission, storage, operations-queue or notification promise. No UI change was needed for this scope decision.
F: Relevant Chromium/WebKit keyboard, focus ownership, upload fallback and privacy checks pass. Final focused security tests pass. Browser API/authentication fixtures are synthetic, not live authorization/provider/database proof.

Allowed subsystems: floor-plan UI/API/data, their direct canonical editor and owned persistence contracts, privacy-safe analytics and relevant tests. Exact changed paths are listed below. Non-goals: release certification, keys/T03/governance, provider activation, private-state inspection, database backup work, other editor features, broad cleanup, dependency upgrades, migrations, deployments, push or merge.

## Base, provenance and repository state

Approved base: integration/deep-clean-v1 at 87ba770d3f336553da7a9cbc2317b2b4a0c829d0, tree 81f7dacb61a73dba9c545fce14e76dc8dbfba56e; tracking refs/remotes/origin/integration/deep-clean-v1. Current nonsecret PR28_INTEGRATION_HANDOFF.md identified the merged target as ready for the next feature. Relevant origin/ref-only fetch completed 2026-09-11 and remained at that SHA. Remote: git@github.com:justuslaw66-max/interior-ai.git.

Feature: feature/fpd-sg-fast-feature in /Users/justus/Developer/interior-ai-fpd-fast-feature, created clean from that base. Initial port provenance: 850fc6b and 27618f3 from the clean feature/fpd-p0b-managed-field-protection history; merge base 72ec9e5d3d3cf4bd1afb20b25f062eb9abaa224a. Applied only that pair's diff; excluded later backup/KMS/dependency work. Existing dirty canonical checkout at 72ec9e5 on wip/integration-dirty-pre-display-units-20260902 was preserved; other worktrees and external security evidence were not modified.

Implementation commit: cf91083db8555be2f4a1d8f2775e1e639e240e76.
Final test correction commit: a398b2efcf0cb1ec2ca3e4532130a331fd9ef103.
Closeout executable/test commit: aaa68af5a11050351083d2e9d3042aa739ff38e2. The final status commit changes only this file; resolve its exact HEAD with git rev-parse HEAD. All commits remain local. Final source bindings and cleanliness are checked after the documentation commit.

Special files: package.json registers the privacy test and adds it to the existing required floor-plan chain. scripts/required-test-manifest.json updates only that closure identity, privacy source registration and script inventory. scripts/code-quality/baseline.json lowers improved metrics on touched floor-plan files; no thresholds/exceptions weakened. No package-lock/dependency/migration/workflow changes.

Dependencies: independent copy-on-write node_modules from the canonical checkout; package-lockSHA256 ff61bfab30cea6196ff453b228da91d70121c1ce9ab266dadc35ba1a61b7b51d in both copies; all 723 installed lock entries matched versions/integrities. Node 24.13.0/npm 11.6.2. No private env files copied/read, provider connection, install hooks or dependency upgrades. Task-owned servers have been stopped by Playwright; verify port 3000 absence at final closeout.

## Verification and evidence bindings

Application source in a398b2e is identical to cf91083; only this checkpoint and the new browser journey assertion differ. Ordinary complete logs/reports and retained failed artifacts are in test-results/fpd-fast-feature (ignored, local). No remote or certification evidence is claimed from these files.

PASS on committed cf91083: 14 focused scripts (directory-privacy, consumer-flow, catalog-client, catalog-repository, design-reference, design-reference-persistence, public-document, render-parity, public-display-metadata, serving-integrity, authored-variant-links, optional-configurations, request-hardening, shared-rate-limit), npm run verify:design-persistence, npm run test:phase7-security-boundaries, npm run typecheck, npm run lint -- --max-warnings=0, npm run check:code-quality and npm run test:required-test-truthfulness. Exact commands, statuses and SHA are in committed-focused.json; individual logs are committed-*.log. Focused TS commands use the existing local ts-node/tsconfig-paths runner.

PASS production build on cf91083: npm run build; supported explicitly inert local OAuth fixture, APP_ENV=development, NEXT_PUBLIC_ENABLE_QA_HOOKS=1, no real provider or usable database endpoint. This is a production-mode application build for local testing, not production release eligibility. Exact result:committed-browser-build.json / build-final.log.

Browser: 20 existing tests passed across Chromium/WebKit on cf91083 (browser-final.log). The two added active journey tests passed on a398b2e using the same production artifact/source (browser-positive-final.log / positive-final.json); changed-test typecheck and lint also passed. Commands: local playwright test --config=playwright.floor-plan-upload.config.ts, and the affected-case rerun with --grep 'directory cancellation'. Existing actual-app tests and inert empty-entry fixture tests remain distinguishable; no-op fixture callbacks are not positive-selection evidence. Auth/catalogue/revision APIs are explicitly mocked; actual application selection, editor, rendering and local backup/reload run in the browser.

PASS git diff --check before each local commit; recheck at closeout. Required remote feature gates remain NOT_RUN because the branch is unpushed. Real database-backed persistence/lifecycle: PASS on the source-bound closeout below. Real providers, release GateA3, key operations and deployment:N/A to this authorized feature milestone, not accomplished.

## Review and failure classification

One genuinely separate reviewer, fpd_focused_review, inspected the whole feature diff and direct contracts read-only. It found two direct blockers: saves of retained retired/legacy references rejected as new selections; authored-variant confirmation displaying stale orientation/source context. One remediation cycle fixed both. The same reviewer inspected the corrections and found no remaining direct flaw in those two findings. Reviewer did not independently execute tests; implementation verification is reported separately.

Feature-caused failures fixed: malformed HTTP response trust, stale browse application, invalid punctuation silently normalized into a different unit; quality growth corrected without relaxed limits; two static tests updated to assert the actual moved hook ownership. The privacy script inventory was registered rather than omitted.

Browser test failures retained: r1 incorrectly expected confirmation for a default starter room (the source contract allows direct replacement); test now seeds nondefault existing work in the actual local backup format. Next run compared a transient pre-save QA marker with the post-reload runtime. Bounded diagnostic captured identical before/after saved JSON; both yielded a85bc7d7 through production storedToSnapshot/fingerprintDesignSnapshot, matching the reopened runtime. The corrected assertion compares the actual saved projection and passes. No production persistence change was made to conceal this test assumption. Artifacts:browser-r1-artifacts, browser-final-artifacts, browser-reload-diagnostic-artifacts, synthetic-snapshot-roundtrip.json.

Environment-only observations: local browser server logs analytics persistence errors against intentionally unreachable 127.0.0.1:1; no real database target was used. They are not live persistence passes. No inherited required failure has been established on the exact base; do not attribute remaining blockers to baseline repair. No unrelated maintenance blocker found in focused review. Broader UI diagnostic-marker timing could be examined separately if useful; no maintenance branch created.

## Required CI and exact next action

Exact base 87ba770 had successful Secret scan, Stable checks, Advisory contract preflight and merge-gate in GitHub run 34254522550: https://github.com/justuslaw66-max/interior-ai/actions/runs/34254522550 . Advisory contract preflight is required by merge-gate despite its name. Branch-protection API returned 404 Branch not protected, and branch-rules API []; repository-required gates still apply unchanged. Feature checks cannot be inferred from base green. Final local HEAD has not been pushed; remote gates/merge approvals unavailable, so READY_TO_MERGE_FEATURE is not warranted.

Both pending decisions are resolved: durable requests are DEFERRED_BY_OWNER, and the exact disposable database lifecycle was approved and completed. No further product or database approval is pending for this increment.

Next boundary: one owner approval in Codex to push only feature/fpd-sg-fast-feature to origin (git@github.com:justuslaw66-max/interior-ai.git) and open its PR targeting integration/deep-clean-v1. No push or PR creation has occurred. Opening the PR triggers Secret scan, Stable checks, Advisory contract preflight and merge-gate via ci.yml; feature-branch push alone does not match that workflow's push filter. The full informational E2E workflow is label/manual/schedule driven, not automatically triggered by opening this PR. Tracked Vercel configuration exists, but connected hosting trigger settings were not established: base check metadata contains only GitHub Actions, and the recent GitHub deployments query returned an empty list. These observations do not prove a hosting integration is absent; publication may cause a connected service to create a preview. No automatic deployment or production readiness claim is made. No merge, explicit deployment or full-E2E label is part of the next requested approval.

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
- scripts/floor-plan-disposable-database.mjs
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
- tests/database/floor-plan-directory.ts
- tests/required/fixtures/floor-plan-directory-fixture.ts
- tests/required/floor-plan-upload-accessibility.spec.ts

## Approved database closeout execution plan

The previously pending lifecycle is approved and complete. Read-only probe confirmed host 127.0.0.1, port 5432, local role justus, maintenance database postgres, and absence of interior_ai_fpd_fast_feature_test_20260911. It used local passwordless access, an empty credential environment and a password callback that refuses credential lookup; no private files were read. The ordinary existing provisioning script may reuse existing targets, so this batch instead enforces exclusive creation and refuses pre-existing databases.

Paths declared before editing: scripts/floor-plan-disposable-database.mjs (bounded lifecycle driver), tests/database/floor-plan-directory.ts (real PostgreSQL exercise of existing application contracts). Existing persistence tests use in-memory doubles and cannot be relabeled database-backed. These new tests close that material gap. Execution exposed the narrow catalogue production defect fixed below; dependencies, migrations and required-test registration remain unchanged in this closeout.

Command: node scripts/floor-plan-disposable-database.mjs --run-approved-batch. The driver connects to maintenance postgres only to check target absence and create the exact target, records its OID/owner and task marker, supplies an explicitly constructed target URL in a clean child environment, applies unchanged migrations with local Prisma migrate deploy, and runs local ts-node against tests/database/floor-plan-directory.ts. The test verifies effective current_database/server address/port and database OID before synthetic writes; checks owned save/read, mismatch and unauthorized rollback, retained retired/legacy references versus prohibited new/rebound retired selections, private import ownership and fail-closed public catalogue behavior. No RLS or external-authentication claim is made. All Prisma clients close before cleanup.

Cleanup only after exact OID/owner/marker match; DROP DATABASE without FORCE or unrelated session termination. Pre-existence, changed ownership/identity, unavailable credentials or active external sessions stops mutation/cleanup rather than choosing another target. Ordinary sanitized evidence retains all phases/failures and actual cleanup status. No global role/server changes.

Deferred backlog: a separate future feature may implement durable protected floor-plan requests with real persistence and truthful submission status; queue, administration and notifications require their own scoped design and authorization. Nothing is implemented or promised for that future workflow here.

Database batch 2026-09-11T15-46-15-714Z: exclusive create succeeded, 43 unchanged migrations applied, test stopped on missing reviewerConfirmation in synthetic evidence before seed writes; cleanup DROPPED_AND_ABSENCE_VERIFIED. Classification: feature-test fixture setup defect, not a product or inherited failure. Added the required synthetic confirmation; no guard bypass. Narrow static reviewer found no direct lifecycle/test issues before execution. Initial TypeScript literal widening error was also corrected before this run; logs retained.

Batch 2026-09-11T15-47-15-104Z applied 43 migrations; seed transaction rolled back on existing public-metadata lifecycle guard. Corrected fixture order to draft/bindings → approved → matching metadata/audits → published. Its cleanup preserved the target while one session remained; read-only recheck confirmed identical OID 959163 / owner justus/task marker and zero sessions, then authorized DROP completed with absence verified, recorded in separate -cleanup.json without rewriting the failed report. No session was terminated. Runner now allows 500 ms after observed child exit before checking sessions; it still refuses DROP if any remain.

Batch 2026-09-11T15-48-53-635Z: 43 migrations passed; seed rejected by existing source-observation guard, rolled back; drop/absence verified. Reviewed all applicable revision lifecycle triggers, added schema-validated synthetic source-observation manifest and matching version 3 publication evidence rather than weakening the guard. This remains fixture setup remediation; no real reviewer/provider evidence is asserted.

Batch 2026-09-11T15-50-20-788Z: 43 migrations passed, synthetic seed and committed persistence/readback plus four ownership/unit/geometry/private-source rollback cases passed, catalogue excluded fixture; drop/absence verified. Non-executing serving-integrity diagnosis identified a non-opaque opening ID carried over from the browser-only fixture. Adapted synthetic IDs to the production public-entity contract and recomputed canonical hash; no application guard changed. Added a pure fixture preflight before further database work.

Batch 2026-09-11T15-56-07-389Z: 43 migrations passed, valid database catalogue row reached public mapping but yielded no result. Direct product defect: raw Prisma publicMetadata carries internal approval fields rejected by the strict public schema. Corrected only lib/floor-plan-catalog-prisma.ts to use the existing allowlisted projection after full integrity validation. No schema/privacy guard relaxed. Failed report retained; drop/absence verified. Added this production file and dependency lock hash to subsequent batch source bindings.

## Completed database and final validation

PASS batch 2026-09-11T15-57-21-721Z on the working bytes later committed as aaa68af5a11050351083d2e9d3042aa739ff38e2. Exact target: local 127.0.0.1:5432/interior_ai_fpd_fast_feature_test_20260911, owner justus, exclusively created OID 963003 and batch-specific marker. All 43 unchanged migrations applied. Real Prisma transactions and reads proved committed design/reference round trips, design ownership, invalid unit and geometry rejection, private import ownership, atomic rollback, exact public catalogue matching and privacy, wrong-unit exclusion, retained exact/legacy reference saves after audited retirement, and rejection of new/rebound retired selections. These are application data-contract tests using synthetic rows; they do not execute HTTP authentication or prove database-role isolation/RLS, external identity, real source review or live providers.

Cleanup: DROPPED_AND_ABSENCE_VERIFIED after exact OID/owner/marker and zero-session checks. No FORCE, session termination, shared database mutation or global changes. Earlier unsuccessful runs remain retained, including the separate cleanup supplement for the temporarily preserved target. All exact commands, phase outcomes, identities and hashes are in test-results/fpd-fast-feature/database-closeout/2026-09-11T15-57-21-721Z.json and its migrate/feature-tests logs. Report SHA-256: f9996582b01c8a64bf80a004f6b02b4000dd56e53ea2e5e7b37a30aea33b7f1c.

PASS affected tests: floor-plan-directory-privacy, catalog-client, catalog-repository, public-display-metadata and serving-integrity, using local ts-node with --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' -r tsconfig-paths/register. PASS npm run typecheck; npm run lint -- --max-warnings=0; npm run check:code-quality; npm run test:required-test-truthfulness; npm run build. Exact invocations/statuses/source hashes: test-results/fpd-fast-feature/closeout-validation.json; full logs: closeout-*.log. Build used explicit inert local OAuth fixture and an unreachable database endpoint, without provider execution. Prior browser and unchanged persistence/security test evidence remains valid within its recorded scope; it was not relabeled as the new database result or rerun unnecessarily.

The separate fpd_focused_review reviewer checked only the new three-file executable/test diff and found no direct defects. It confirmed projection follows full integrity validation, tests exercise the real Prisma/public-result path, and the bounded cleanup pause leaves ownership/zero-session guards intact. This was static review; test execution was performed by the implementer. The earlier full-feature review and two completed corrections remain preserved.

Source/dependency preservation: closeout-commit-binding.json binds the tested working-file hashes to committed bytes, including package-lock.json. Only the three declared code/test paths and this status file changed after approved starting HEAD c4208ce. No further package, migration, workflow, required-test manifest or baseline change occurred. The only production closeout change is the public-metadata projection. Port 3000 absence and clean final worktree/index are verified at final closeout.

Remaining feature-caused blockers: NONE. The directly relevant catalogue defect and test-fixture setup failures were corrected without guard bypass; unsuccessful evidence remains. Inherited required failures: NONE established; no baseline-repair classification asserted. Operational limitations: live external authentication/providers, production data/service availability and deployment are unverified; real catalogue coverage is not a nationwide guarantee. Durable requests are the sole owner-approved deferral, with the single backlog entry above. Required final feature-HEAD remote checks: NOT_RUN. Recommendation: READY_FOR_FEATURE_REVIEW; READY_TO_MERGE_FEATURE is not established.
