# Refactor roadmap

This is a sequence of small, reversible batches, not a calendar promise. A phase may start only when its entry criteria are true. Each implementation commit cites CH IDs and contains one coherent behavior/security/gate change. Full Gate A3 is reserved for the exact immutable artifact proposed for stable-staging promotion; focused checks and preview smoke are used during iteration.

## Universal batch contract

Every batch must:

1. begin from a recorded clean commit and list its CH IDs;
2. add or run characterization before structural edits;
3. avoid unrelated formatting, dependency upgrades, generated rewrites, feature changes, and visual redesign;
4. state exact files, commands, output artifacts, migration/data impact, and rollback;
5. preserve canonical document and Consumer/Pro semantics unless a signed product decision says otherwise;
6. pass `git diff --check`, focused lint, typecheck, relevant domain tests, and a manual/browser retest proportional to risk;
7. use a strict immutable preview for related-batch smoke before release certification;
8. lower or hold architecture/performance budgets; never silently raise them.

## Phase 0 — Restore an unambiguous fast baseline

**Findings:** CH-0019, then gate-only portions of CH-0013, CH-0017, CH-0025.
**Purpose:** Separate inherited implementation defects, stale tests, and environmental issues before structural changes.

Recommended one-issue batches:

- Baseline A — React-hook lint remediation: fix `CatalogPanel` effect ownership. Include the `FloorPlanImportAssistant` unnecessary dependency only if both changes remain small, behavior-preserving, and independently reviewable.
- Baseline B — command-bar save-status contract remediation: characterize the intended responsive chip contract, then update the stale assertion or implementation according to that evidence; do not change both by assumption.
- Baseline C — Hamilton controlled-vocabulary remediation: repair five invalid values across the three source YAML files against the existing canonical vocabulary; do not weaken the schema.

These three batches account for the four inherited failure groups reported at CH-0001 closure. Post-closure triage also confirmed three separate CH-0019 follow-ups that were previously masked or omitted: restore the design architecture ratchet through extraction rather than a limit increase; reduce the initial-JS raw bundle below 6,955,000 bytes without moving equivalent eager bytes; and resolve the hidden Cabinet Preview opener after the product visibility policy is recorded. They are not CH-0001 regressions and must not be folded into the three inherited-failure batches.

**Entry:** checkpoint and audit docs reviewed; intended command-bar/Cabinet Preview behavior confirmed.
**Exit:** lint, design cleanup, design architecture, catalog audit, Phase 8, build, runtime smoke, and Pro visual policy pass twice; no temporary exception without owner and expiry.
**Verification:** exact commands in `05_QUALITY_GATES_PLAN.md`.
**Rollback:** revert each single-purpose commit independently.
**Compatibility:** characterize current intended behavior; no test deletion or budget increase as a fix.

## Phase 1 — READY: fail-closed deployment/admin boundary

**Finding:** CH-0001.
**Status:** RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE at `62ba966ecb2011e4233c99ce1dcc0641914af008`; platform configuration verification remains in `docs/security/CH-0001_EXTERNAL_CONTROLS_CHECKLIST.md`.
**Why first:** Highest-consequence confirmed defect that is narrow, server-side, decision-free, and independent of the red UI/catalog baseline.

### Exact intended batch

Expected files:

- `lib/config.ts`
- `lib/admin.ts`
- `scripts/test-auth-env-hardening.ts`
- `package.json`
- `.github/workflows/ci.yml`

Planned change:

- expose/test strict deployment classification instead of mapping unknown values to privileged development;
- require explicit local admin bypass plus `NODE_ENV=development` and local-host context (or remove email-wide bypass entirely in favor of an explicit test-only predicate);
- keep configured `ADMIN_EMAILS` matching unchanged;
- extend the existing auth/environment test into a complete environment/admin matrix;
- add a named package command and required CI invocation.

**Entry criteria:** deployment variable inventory confirms production, preview/staging, CI, and local conventions; no legitimate environment relies on an absent classifier for admin access.
**Exit criteria:** missing/invalid classifier denies admin; staging/production require configured admin email; explicit local development works only under the documented opt-in; all current admin callers use the hardened predicate.
**Verification:** `git diff --check`; `npx eslint lib/config.ts lib/admin.ts scripts/test-auth-env-hardening.ts --max-warnings=0`; new `npm run test:auth-env-hardening`; `npm run test:phase7-security-boundaries`; `npm run typecheck`; `npm run build`; negative local requests to `/api/me` and one admin route under missing/invalid env.
**Rollback:** revert the batch commit; no data migration. Preserve a break-glass documented configured `ADMIN_EMAILS`, never a fail-open classifier.
**Compatibility:** correctly configured users see no change; accidental admin privilege is intentionally removed.

### Implementation record

- strict server classification recognizes explicit `development`, `staging`, and `production`, plus Vercel `development`, `preview` (staging), and `production` only when `APP_ENV` is absent;
- public deployment variables, missing/blank/unknown values, malformed admin/reviewer/publisher lists, unauthenticated local access, and request-controlled audit bypasses deny;
- GitHub Actions flags no longer substitute fixed/missing Auth.js credentials or accept a short secret; CI supplies explicit build credentials and the required test exercises production denial;
- CI and the local example now set `APP_ENV=development` explicitly;
- `instrumentation.ts` validates deployment classification during production-server preparation, while each direct privileged handler still performs its own authentication and authorization before work;
- eight operational TypeScript CLI/background entry points now validate the same deployment classifier before database, filesystem, object-store, or queue work; their operator credentials and concrete targets remain external controls;
- backup/restore scripts require explicit environment state (restore also requires exact target-environment confirmation), while legacy seed and billing utilities refuse non-development/non-local production targets;
- `npm run test:auth-env-hardening` is a required stable check, and the authorization matrix inventories all affected pages, handlers, operation-specific reviewer/publisher policies, and deployment scripts;
- removing the unsafe audit bypass shortened an existing overlong function from 107 to 102 lines, so the permanent no-growth ratchet required that single baseline maximum to decrease. No rule, threshold, exception, or suppression was weakened.

## Phase 2 — Make verification truthful and production-equivalent

**Findings:** CH-0013, CH-0016, CH-0017, CH-0018, CH-0025.
**Batches:**

- P2-A: add `generate/check/test` surface commands and require drift/schema checks; no generated content change.
- P2-B: add `test:floor-plan-live-progress` to the required umbrella and add a meta-test classifying all floor-plan test commands.
- P2-C: create a repository test manifest/audit and typecheck E2E separately; classify the 44 orphan scripts before adding them to required CI.
- P2-D: eliminate gate early returns in commerce/variant E2E using deterministic fixtures; make reporter distinguish pass/skip/not-run.
- P2-E: strict build plus `npm start` smoke against the exact artifact/build ID; developer smoke remains separate.
- P2-F: blank-install plus populated-predecessor migration gate and ordered digest in release evidence.

**Entry:** Phase 0 green or explicit baseline exception; CI budget/fixture owners named.
**Exit:** generated drift fails CI; every test is classified; E2E compiles; required gate passes mean assertions executed; strict built artifact is smoked; migration evidence binds code and DB state.
**Verification:** workflow dry run; `npm ci`; generated checks; `npm run typecheck` plus new `typecheck:e2e`; strict build/start/smoke; migration fixture commands; `npm run test:phase15`.
**Rollback:** each gate wiring change is independent; revert the gate commit if infrastructure is broken, preserving a dated blocking issue rather than weakening assertions.
**Compatibility:** gate/evidence only.

## Phase 3 — Canonical saved-design routing

**Finding:** CH-0012.
**Status:** SELECTED NEXT BATCH by the post-CH-0001 decision rule. CH-0002, CH-0007, and CH-0008 rank higher by raw risk but require product decisions; CH-0012 is the highest-risk READY P1. This selection is planning only and does not authorize implementation in the triage session.
**Batches:** characterize a modern saved document through both URLs; add `lib/design-editor-url.ts`; make `/design/[id]` a safe canonical redirect/adapter; update dashboard, duplicate, and checkout-success links; remove legacy canvas only after zero references/telemetry.

Expected first routing files:

- `lib/design-editor-url.ts` (new)
- `app/design/[id]/page.tsx`
- `components/DesignsListWithSelection.tsx`
- `components/DuplicateDesignButton.tsx`
- `app/checkout/success/page.tsx`
- a focused script contract and Playwright route fixture under `scripts/` and `tests/e2e/`

**Entry:** canonical `/design?designId=` persistence fixture passes; external old-link consumers inventoried.
**Exit:** all internal entry points use the helper; old URL preserves design identity/query/auth and opens canonical renderer; multi-room/floor-plan/material fixture has save/reload/export parity.
**Verification:** add a named `npm run test:design-editor-routing` characterization command; `npm run verify:design-persistence`; `npm run check:code-quality`; focused lint over the routing files; `npm run typecheck`; focused Playwright dashboard/duplicate/checkout/direct-link tests; `APP_ENV=development npm run build`; `git diff --check`. Run `npm run test:design-page-cleanup` as an inherited-baseline comparison until Baselines B and the masked architecture ratchet are green; do not report that umbrella as passing while either remains.
**Rollback:** revert link callers first; redirect route remains a compatibility adapter until confirmed safe to remove.
**Compatibility:** one canonical editor; no document rewrite.

## Phase 4 — Security and workflow services

**Findings:** CH-0002 through CH-0005, CH-0010, CH-0023, CH-0026.
**Decision gate:** approve guest retention/quota/rate budgets and emergency retirement role before enforcement changes.

Suggested batches:

- P4-A: split trusted server events from browser analytics (CH-0004).
- P4-B: enforce publisher retirement boundary (CH-0005).
- P4-C: add irreversible share-token rotation while preserving explicit share UX (CH-0010).
- P4-D: add server-only markers and client-import graph guard (CH-0026).
- P4-E: bounded streaming request reader and stable API error wrapper (CH-0023).
- P4-F: central `DesignCreationService` with transaction-safe quotas; migrate one route at a time (CH-0002).
- P4-G: server-minted guest capability and retention; dual-read/migration window if required (CH-0002).
- P4-H: shared distributed limiter, starting with cost-bearing endpoints (CH-0003).

**Entry:** policy decisions recorded; concurrency/storage test infrastructure available.
**Exit:** all creation routes share atomic policy; guest identity is not caller-minted; cost limits survive multi-instance tests; lifecycle events have server provenance; retirement/share/API contracts are coherent.
**Verification:** security boundary suite, new concurrency/abuse tests, Prisma transaction integration tests, focused API/browser tests, migration status, preview load/abuse test.
**Rollback:** additive service and route-by-route adapter; feature flag only for migration routing, default fail-closed on security; rollback schema additions only with a forward migration.
**Compatibility:** decisions explicitly document any quota, retention, or link changes.

## Phase 5 — Catalog source, publication, and commerce convergence

**Findings:** CH-0006, CH-0007, CH-0008, CH-0024.
**Decision gate:** catalog owner chooses canonical durable source/status model and Shopify intent.

Suggested batches:

- P5-A: characterize and strip/protect legacy public catalog DTO (CH-0006).
- P5-B: add controlled publication enum while retaining a temporary explicit legacy mapping; migrate 73 unspecified entries through review (CH-0008).
- P5-C: generate immutable versioned client/server projections and compare them with both existing sources (CH-0007).
- P5-D: move each consumer—public API, editor, export, commerce, admin—to the repository interface; remove module-global mutation.
- P5-E: replace DB-then-filesystem mutation with selected durable authoring/outbox or repository-review flow.
- P5-F: cache catalog/readiness by build digest and protect deep readiness (CH-0024).

**Entry:** decision record and migration inventory; current 139/30 item differences reconciled by owner.
**Exit:** one identity/version/status truth; public DTO contains only live fields; Shopify either has a tested reachable product or is explicitly removed/dormant; failed authoring cannot partially commit.
**Verification:** strict catalog audit; publication negative tests; registry parity; public API snapshots; editor/save/export/commerce E2E; authoring fault injection; build digest and concurrent-read load test.
**Rollback:** versioned generated projections and dual-read comparator; switch consumers back per adapter; never rewrite catalog data without preserved source commit.
**Compatibility:** owner-approved availability migration; saved item render records remain supported.

## Phase 6 — Surface payload and scene resource lifecycle

**Findings:** CH-0013, CH-0014, CH-0021, CH-0022.
**Batches:**

- P6-A: split surface render index, authoring metadata, and fixtures while keeping current lookup facade.
- P6-B: replace linear lookups with immutable keyed indexes and lazy Pro metadata.
- P6-C: introduce scene asset repository and dedupe one GLB path; add ref-count diagnostics.
- P6-D: migrate remaining models/textures and deterministic disposal.
- P6-E: centralize keyboard commands and active-frame invalidation.
- P6-F: fix drag transaction final-position ownership.
- P6-G: move performance sampling out of root React state.

**Entry:** surface/scene golden fixtures, bundle report, render-count and 10/100/500-item benchmark recorded.
**Exit:** fixtures absent from production chunk; budgets green; repeated URL loads once; no per-item global keyboard owner; static idle frame work bounded; drag/save/history parity passes.
**Verification:** generated/schema checks; Phase 8 twice; bundle raw/compressed diff; scene boundary and GLB tests; targeted Playwright interactions; memory/disposal and long-idle profiles; visual golden suite.
**Rollback:** preserve facade and legacy loader behind an internal switch for one preview; revert per asset class; resource cache must be safe to disable.
**Compatibility:** exact visual, transform, material, selection, persistence, and export parity.

## Phase 7 — Editor/plan/cabinetry ownership and accessible overlays

**Findings:** CH-0015 and CH-0020.
**Batches:** first migrate overlays to the established dialog primitive one at a time; then extract pure calculations/state machines from highest-churn monoliths behind existing facade props; finally lower touched-file architecture budgets.

**Entry:** Phase 0 architecture gate green; characterization exists for the exact seam.
**Exit:** cart/plans/designs/palette have consistent focus semantics; selected hotspot responsibilities are named and smaller; import graph remains acyclic; public facades and document/render output unchanged.
**Verification:** editor accessibility suite plus keyboard/axe Playwright; design/floor-plan/cabinetry focused suites; facade/API snapshots; architecture check; visual and performance gates.
**Rollback:** one overlay or extraction per commit; old facade delegates to new implementation until all callers move.
**Compatibility:** no UX redesign; only semantic/focus corrections and internal ownership changes.

## Phase 8 — Integration hardening and privacy

**Findings:** CH-0009 and CH-0011.
**Decision gate:** privacy/legal session-replay policy.

**Batches:** pin and isolate GLB optimization first; then add default-deny/masked analytics configuration and consent/opt-out behavior.

**Entry:** offline/resource-limit fixtures; signed privacy decision.
**Exit:** no request-time network package execution; optimizer bounded and observable; replay cannot start without approved policy and masking.
**Verification:** offline optimizer tests, malformed/concurrency/timeouts, dependency inventory/SBOM, analytics network event tests and masking review.
**Rollback:** pinned adapter can fall back only to “optimization unavailable,” not `npx`; analytics rollback defaults recording off.
**Compatibility:** accepted GLBs retain output quality; privacy behavior follows signed decision.

## Phase 9 — Documentation, hygiene, and dependency upgrades

**Finding:** CH-0027 plus dependencies discovered by prior phases.
**Separation rule:** documentation/local-output cleanup, formatting adoption, and dependency upgrades are three distinct workstreams and never share functional refactor commits.

- Documentation: mark historical files, fix commands/paths/migration references, and keep one current operations index.
- Hygiene: untrack `prisma/dev.db` and `test-results/.last-run.json` after clean-clone proof.
- Formatting: adopt only after team choice; baseline reformat in an isolated commit with no logic.
- Dependencies: one ecosystem slice at a time, changelog/security review, lockfile isolated, focused plus full gates, and explicit downgrade path.

**Entry:** functional phases do not depend on pending cleanup; current baseline green.
**Exit:** docs checks pass, clean clone stays clean, format is deterministic if adopted, and each upgraded dependency has a compatibility record.
**Rollback:** separate commits and lockfile-only downgrade per dependency batch.
**Compatibility:** no feature or visual change.

## Product decisions required before implementation

- CH-0002: guest retention, guest/authenticated quotas, and legacy overage behavior.
- CH-0003: per-operation and global cost/rate budgets.
- CH-0005: publisher-only retirement versus emergency-withdraw role.
- CH-0007/CH-0008: canonical catalog source, statuses, handling of 73 unspecified entries, and Shopify intent.
- CH-0010: whether designer entry may automatically enable sharing.
- CH-0011: PostHog replay legal basis, consent, opt-out, and masking.
- CH-0019: intended command-bar save and Cabinet Preview visibility behavior.
- CH-0024: migration for any external deep-readiness monitor.
- CH-0027: formatter choice.

Until a decision is recorded, implementation may add characterization, telemetry, or fail-safe guards that do not reclassify valid product behavior, but must not silently choose policy.
