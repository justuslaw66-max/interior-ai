# Singapore Floor Plan feature status

## Contract and scope

Tier 3 feature-branch completion: select an eligible published Singapore plan through protected exact-unit search or public catalogue browse; show truthful preview/source verification, variant and orientation; apply canonical geometry to the shared2D/3D editor; preserve supported references through authorized save/reload; protect replacement/unsaved work, privacy and keyboard accessibility. No nationwide coverage or live-provider evidence is asserted. Existing review-only catalogue seeds are not production availability.

A: Exact-unit matching must use protected request bodies and actual approved bindings; no unit/address selectors in URLs/public results/analytics. Public browse remains separate.
B: Only currently eligible published canonical revisions are selectable; unknown variant/orientation/verification is not inferred.
C: Preserve canonical dimensions, millimetres, openings and orientation across2D/3D; retain replacement/unsaved-work guards.
D: Save/reopen through the existing owned design persistence flow, validating revision/reference relationships without leaking selectors or destroying prior state on errors.
E: No match, invalid input, unavailable service and malformed plans must be truthful and usable with existing upload/manual fallback. User decision pending: retain explicit durable-request unavailability, or require durable requests as a blocked dependency. Do not silently treat unavailable requests as complete durable functionality.
F: Relevant keyboard/focus, authorization and privacy boundaries remain mandatory.

Permitted paths: app/api/floor-plans/route.ts; app/api/floor-plans/revisions/[id]/route.ts; app/providers/PostHogProvider.tsx; components/editor/FloorPlanAddressFields.tsx, FloorPlanAddressSearch.tsx, FloorPlanCatalogResultList.tsx and their exact-search/result-application hooks; lib/floor-plan-{binding-match,catalog-client,catalog-cursor,catalog-prisma,catalog-repository,consumer-search,design-reference,directory-client,directory-contract,exact-search-request-authority,authored-variant-links,revision-updates}.ts; lib/floor-plan-imports/public-document.ts; lib/posthog-privacy.ts; lib/design-page-house-plan.ts; lib/useDesignPageFloorPlanUnderlayController.ts; directly required canonical editor/persistence contracts; relevant scripts/test-floor-plan-*.ts, privacy assertion fixtures and tests/required/floor-plan-upload-accessibility.spec.ts. Additional direct-contract files will be named here before edits.

Special files: package.json only to register the existing privacy test command; scripts/code-quality/baseline.json only to lower touched floor-plan debt required by its ratchet. scripts/required-test-manifest.json only if its existing test-truthfulness contract requires registering these feature tests; no workflow/check redesign. No dependency/package-lock, migration, KMS/governance or broad-baseline changes planned.

Non-goals: production release/certification, T03/keys/policy adoption, provider contact/activation, database-backup changes, broad E2E/CI repair, catalogue expansion, new admin workflow, unrelated editor features, deployments/push/merge.

## Baseline and provenance

Approved integration branch: integration/deep-clean-v1. Current nonsecret PR28_INTEGRATION_HANDOFF.md identifies this merged target as ready for the next feature. Explicit origin-only/ref-only fetch completed2026-09-11; tracking ref refs/remotes/origin/integration/deep-clean-v1 pins87ba770d3f336553da7a9cbc2317b2b4a0c829d0 (tree81f7dacb61a73dba9c545fce14e76dc8dbfba56e).
Feature branch: feature/fpd-sg-fast-feature. Worktree: /Users/justus/Developer/interior-ai-fpd-fast-feature. Initially clean at the exact base. Port3000 had no listener at baseline; no existing running application was edited.
Canonical checkout remains on dirty wip/integration-dirty-pre-display-units-20260902 at72ec9e5d3d3cf4bd1afb20b25f062eb9abaa224a; all unrelated changes preserved. Other worktrees and external security evidence excluded.
Existing relevant branch feature/fpd-p0b-managed-field-protection is clean at9be5b89ce7f98f1b51fff64238584e6629ed34ae. Merge base with approved integration:72ec9e5d3d3cf4bd1afb20b25f062eb9abaa224a. Reuse only850fc6b (exact-unit privacy) and27618f3 (direct privacy review fixes); exclude later backup/KMS/dependency changes. Existing implementation supplies much of the canonical selection/persistence path; baseline currently leaks exact-unit GET selectors and has page-only request feedback. Existing prior privacy code remains subject to focused verification here.

## CI observed through normal GitHub connection

Exact base87ba770: Secret scan, Stable checks, Advisory contract preflight and merge-gate all completed successfully in run34254522550. Despite its name, Advisory contract preflight is a dependency of the repository merge-gate. Stable checks includes required domain/security/persistence, full floor-plan, lint/typecheck/build and named browser owners. Those remote definitions are preserved; this feature's local batch is focused.
Branch-protection endpoint returned404 Branch not protected; branch-rules endpoint returned[]. This does not waive the repository CI contract. Feature HEAD is unpushed: no remote evidence exists for modified/unpushed code; do not reuse base green as feature green.

## Environment and pending decisions

Copied dependencies were independently materialized from the canonical checkout using copy-on-write. Source and target package-lock SHA256 bothff61bfab30cea6196ff453b228da91d70121c1ce9ab266dadc35ba1a61b7b51d; no install hooks/provider access or lock changes. Copy completed; all723 installed lock entries match versions/integrities (zero mismatches). Node requirement>=24.13.0<25, npm>=11.6.2<12.
Local PostgreSQL listens on loopback5432. Requested bounded user approval for exclusive disposable database interior_ai_fpd_fast_feature_test_20260911, existing unchanged migrations, synthetic tests and owned cleanup. No database connection/mutation has occurred. Shared-development and production data prohibited.
Durable-request product decision pending in Codex. No acceptance scope reduction assumed.

## Verification plan and results

NOT_RUN: focused privacy/consumer/catalog/canonical/persistence/reference tests; relevant required critical subgroup; shared2D/3D render-parity; Chromium+WebKit active UI journey; relevant database-backed persistence/lifecycle; typecheck; lint; code-quality; production build; final diff-check and one independent focused review.
Use existing declared commands after checking effects. Counts from mocks/in-memory Prisma doubles remain component evidence, not database proof. Run a coherent final relevant batch against actual final source and commit feature-only changes after staged diff review. No remote passing checks can exist for an unpushed local HEAD.

## Failures / next action

Initial focused privacy, consumer-flow, catalog-client/repository, design-reference/persistence, public-document and render-parity scripts all passed on the uncommitted port; logs and source-diff binding are in test-results/fpd-fast-feature/initial-focused.json. These are component/in-memory tests, not real database evidence. Missing dependencies are environment setup, not a feature test failure. Initial discovery searches were too broad and truncated; subsequent reads are limited to the actual application and relevant contracts.
The two privacy commits applied cleanly. Next: validate public response envelopes and revision routing, cancel stale browse applications, clarify source-preview/orientation labels, then focused verification/build/browser and independent review. Await product/database answers only for dependent work. Keep this file current and continue at checkpoints.

Additional direct-contract path declared before editing: lib/floor-plan-directory-response.ts validates the public HTTP response without retaining unexpected/private fields. No dependency or workflow changes.

Browser fixture path added before editing: tests/required/fixtures/floor-plan-directory-fixture.ts reuses the canonical catalog-client synthetic geometry for actual application selection tests; it is test data only. Production build passed with supported inert local OAuth shape and an unreachable database URL (no real provider/database). Rebuild with QA markers and final source is pending. Initial quality growth was feature-caused; functions were reduced and improved baseline entries lowered, with no exception or relaxed threshold.

Focused review remediation: directly required app/api/designs/[id]/route.ts passes the server-read prior snapshot so unchanged owned lineage can remain savable after retirement; new or rebound retired selections stay prohibited. components/editor/FloorPlanSelectionContext.tsx will own shared current preview/orientation/source context in results and pending authored-variant confirmation.

The new privacy test is now added to the existing floor-plan-required chain; required-test-manifest.json will update only that chain closure identity and declared privacy source. This strengthens the existing gate, with no workflow change.

Independent focused reviewer fpd_focused_review completed read-only review against87ba770 and the complete working diff. Two direct blockers: retained retired/legacy design lineage unsavable; authored-variant confirmation stale orientation/source. One remediation cycle implemented: trusted previous snapshot plus stored owned reference required for retention; new/rebound retirement remains rejected, targeted regressions pass; selected variant context is shown and unavailable variant imagery is explicit. Verification of corrected diff requested from same reviewer; not a new broad review.

Reviewer verified both corrections, identifying no remaining direct flaw in those findings. Focused batch:14 feature scripts, persistence-critical, security-critical, typecheck, lint, quality and inventory ran; two static ownership assertions (authored-variant-links, optional-configurations) were feature-caused stale assumptions after hook extraction, corrected to assert actual caller/hook wiring. Browser r1:20passed,2failed; positive regression incorrectly expected confirmation for unchanged default starter room, while source contract allows direct replacement. Test now seeds nondefault prior work in the actual local-backup format and checks canonical local save/reload. Failed artifacts preserved. No database-backed result is claimed; product and disposable database questions remain unanswered.
