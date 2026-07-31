# Code health audit handoff

Audit date: 2026-07-31
Canonical repository: `/Users/justus/Developer/interior-ai`
Safety checkpoint: `08bdfe0c5e5c882777dc5da38168ea7db14840ad` on `safety/code-health-pre-audit-20260731`
Audit branch: `chore/code-health-audit-20260731`

## Outcome

The incoming 371-file working set was reviewed and preserved before audit work. No production behavior, source, catalog, schema, data, dependency, deployment, or remote system was changed. The repository was inventoried, architecture/import/history hotspots were measured, existing decisions and release documents were reconciled, focused and browser baselines were run, and a behavior-preserving modernization sequence was produced.

Created artifacts:

- `docs/code-health/00_SAFETY_AND_BASELINE.md`
- `docs/code-health/01_REPOSITORY_INVENTORY.md`
- `docs/code-health/02_CODE_HEALTH_AUDIT.md`
- `docs/code-health/03_TARGET_ARCHITECTURE.md`
- `docs/code-health/04_REFACTOR_ROADMAP.md`
- `docs/code-health/05_QUALITY_GATES_PLAN.md`
- `docs/code-health/HANDOFF.md`

## Inspected scope

- all 3,417 tracked files classified by role, with initial unknowns resolved;
- app/API routes, authentication/admin, persistence, quotas, sharing, events, integrations, health, and workflow transitions;
- canonical design/editor, 2D/3D scene, floor-plan import/compiler/publication, cabinetry, catalog/materials, commerce, exports, and accessibility overlays;
- TypeScript import graph, client/server boundary scan, function/component/file sizes, direct test references, and repository change history;
- package/lock/toolchain, Next/TypeScript/ESLint/Prisma/Playwright configuration and GitHub workflows;
- 42 migrations, generated sources, catalog YAML, binary/vendor assets, ignored/local outputs, and current/historical architecture/product/release documentation;
- delegated read-only frontend/scene, backend/security, and tooling/catalog/test audits, consolidated under stable CH IDs.

## Current baseline

Passes include typecheck, Prisma validation, design persistence, phase 7 security boundaries, the full required floor-plan umbrella, omitted-but-important floor-plan live progress, full cabinetry verification, editor accessibility/capability checks, generated surface drift/schema checks, strict asset inventory, catalog asset availability (with five draft missing-GLB warnings), theme contrast, optimized build, and two-case runtime smoke.

Known red checks:

- lint: one error and one warning under CI’s zero-warning policy;
- design cleanup: stale/failed command-bar save-status assertion;
- design architecture: two size ratchets exceeded;
- catalog audit: five invalid values across three Hamilton sofa YAML files;
- Phase 8: cold fingerprint p95 11.218 ms versus 6 ms budget; independent bundle measurement is also above current raw/Brotli budgets;
- Pro visual policy: Cabinet Preview opener hidden in Chromium and WebKit (2 pass, 2 fail);
- build is successful but catalog validation is lenient and Turbopack reports whole-project tracing risk.

Complete Playwright baseline: **FAIL — 183 passed, 29 failed, 13 did not run in 1.5 hours** across 225 cases with one worker. Artifacts are in `/private/tmp/code-health-e2e-full`. Twenty cabinetry failures and the Pro visual failure share a hidden `open-custom-millwork-studio` prerequisite; three failures expose 30 px touch targets; two are catalog drawer-name mismatches despite passing live-API data tests; one multi-room serial timeout suppresses 13 cases; one wall-orbit selection case fails; and the final paint case is infrastructure-contaminated by `ERR_CONNECTION_REFUSED` after port 3000 stops listening.

The complete run stopped the local port 3000 listener that existed before the audit. It was restored after the run.

The exact command/result matrix is in `00_SAFETY_AND_BASELINE.md`; proposed required/risk/preview/release cadence is in `05_QUALITY_GATES_PLAN.md`.

## Highest risks

1. CH-0001: missing/unknown deployment classification can grant broad admin/Pro access.
2. CH-0002: caller-minted guest IDs bypass storage limits; quota create/merge paths are non-atomic.
3. CH-0007/CH-0008: catalog identities/sources disagree and publication status fails open.
4. CH-0012: saved-design entry points open a lossy legacy editor instead of the canonical document path.
5. CH-0016/CH-0017: CI tests lenient/dev behavior and some release tests can pass without exercising assertions.
6. CH-0018: migration gate proves a fresh database, not a populated predecessor upgrade.
7. CH-0013/CH-0014: oversized generated surface payload and per-item 3D resource/event ownership threaten scale.
8. CH-0015: drawers/dialogs expose invisible focus targets and inconsistent modal semantics.

No P0, direct SQL injection, obvious core-design IDOR, or runtime import cycle was confirmed.

## First READY implementation batch

CH-0001 is READY after confirming the deployment variable inventory. It is a narrow fail-closed security change with no product-policy dependency.

Expected files:

- `lib/config.ts`
- `lib/admin.ts`
- `scripts/test-auth-env-hardening.ts`
- `package.json`
- `.github/workflows/ci.yml`

Entry, exact behavior, verification commands, exit criteria, and rollback are specified in Phase 1 of `04_REFACTOR_ROADMAP.md`. Correctly configured production behavior remains unchanged; only accidental privilege through missing/invalid classification is removed.

Phase 0 baseline-restoration batches can proceed in parallel only after product confirms the intended command-bar save chip and Cabinet Preview visibility. Do not weaken the tests or raise budgets merely to turn the baseline green.

## Decisions required

- guest retention, quota/overage, and distributed rate budgets;
- floor-plan emergency retirement role;
- canonical catalog authoring source/status and treatment of 73 unspecified entries;
- whether Shopify is intentionally dormant;
- automatic share enabling and permanent revocation UX;
- PostHog replay consent/masking/legal basis;
- command-bar and Cabinet Preview intended behavior;
- external deep-readiness monitoring migration;
- formatter adoption.

## Resume instructions

1. Confirm branch and status; do not edit an RC/evidence copy.
2. Read all seven code-health documents and the finding IDs for the selected batch.
3. Reconfirm the port 3000 process working directory before editing the running application.
4. Record the product/operations decision if the finding requires one.
5. Implement one batch with characterization first and the rollback boundary described in the roadmap.
6. Use focused checks during iteration, immutable preview smoke after related fixes, and full Gate A3 only on the final promotion artifact.

No push, deployment, pull request, production database action, or stable-staging promotion has been performed.

## Final repository and listener status

The audit document set is the only intended change on `chore/code-health-audit-20260731`; its local commit SHA and the verified post-commit worktree status are reported in the final response. The local application is restored on port 3000 as Node PID 24923. `lsof` confirms its cwd is `/Users/justus/Developer/interior-ai`, and the deep health endpoint returns HTTP 200.

---

## Permanent engineering guardrails batch — 2026-07-31

This entry supersedes the audit-only final status above for the current branch. The first implementation batch adds engineering instructions and machine-enforced code-health ratchets only. It does not change product source, data, schema, catalog content, dependencies, or runtime behavior.

### Commit

Local implementation commit: the single commit containing this handoff entry. A Git commit cannot contain its own content-derived SHA; resolve it after creation with `git rev-parse HEAD`. The exact resolved SHA is recorded in the final Codex response. Nothing was pushed or deployed.

### Guardrails added

- concise permanent repository instructions in `AGENTS.md`;
- detailed standards, review guidance, and architecture rules in `docs/engineering/`;
- a dependency-free Node/TypeScript production-source scanner with stable repository-relative paths;
- accepted baselines for 198 oversized files, function length/complexity/nesting debt in 554 files, and 20 existing lint suppressions across 1,011 measured production files;
- hard failures for new/raised file and function debt, net growth in lint suppressions by file/rule, TypeScript suppression directives, explicit `any`, and static runtime cycles;
- automatic stale-baseline failures so successful reductions must lower or remove accepted debt;
- a history comparison that prevents hand-raising the baseline instead of using a reviewed, owned, expiring exception;
- generated, fixture/snapshot, migration, catalog/data-only, vendored, test, lockfile, and build-output exclusions;
- `check:code-quality`, `check:code-quality:baseline`, and `test:code-quality` package commands;
- required `stable-checks` CI integration without another job or another analysis dependency;
- explicit ESLint errors for `no-explicit-any` and banned TypeScript comments.

### Commands and results

- `lsof -nP -iTCP -sTCP:LISTEN` plus `lsof -a -p 24923 -d cwd` and `lsof -a -p 95580 -d cwd`: both Node listeners resolved to `/Users/justus/Developer/interior-ai`; edit target matched the running app.
- `npm run check:code-quality`: PASS against the accepted baseline; the dedicated fixture tests covered baseline pass, growth, mandatory lowering, no-raise history, reviewed exceptions, new-file limits, function metrics, suppression replacement/inline config, unsafe TypeScript, exclusions, and cycles.
- deliberate temporary edit to `lib/useDesignPagePlanActions.ts`: EXPECTED FAIL — `OVERSIZED_FILE_GROWTH`, 402 lines versus accepted 401/normal 400; the temporary line was removed and the gate passed again.
- `npx eslint scripts/code-quality/check.mjs scripts/code-quality/policy.mjs scripts/test-code-quality-ratchet.mjs eslint.config.mjs --max-warnings=0`: PASS.
- `npm run typecheck`: PASS.
- `npm run lint -- --max-warnings=0`: FAIL only on the documented incoming baseline: `components/catalog/CatalogPanel.tsx:358` (`react-hooks/set-state-in-effect`) and `components/editor/FloorPlanImportAssistant.tsx:294` (`react-hooks/exhaustive-deps` warning). No new-file lint finding remained.
- `npm run build`: PASS; retained the documented lenient-catalog notices and Turbopack whole-project tracing warning through the floor-plan raster import path.
- `git diff --check` and `git diff --cached --check`: PASS on the complete staged change.
- `curl -sS -i http://127.0.0.1:3000/api/health?deep=1`: PASS with HTTP 200 after approved local-app access; `lsof` still identified PID 24923 in the canonical checkout.
- independent read-only subagent review: identified coverage, suppression, cycle, and exception-validation bypasses; valid findings were fixed and covered by focused tests before commit.

Full Gate A3 and immutable-preview smoke were not run: this batch changes repository instructions, tooling, and CI only, and the release cadence reserves those gates for a related runtime batch and the exact promotion artifact. The inherited lint baseline remains explicitly red; it was not changed or suppressed here.

### Remaining limitations

- Function debt is ratcheted by per-file violation count and maximum, not stable per-function identity. It blocks aggregate growth but cannot prove that two same-sized functions did not exchange debt; review and characterization remain required.
- Lint debt is ratcheted by per-file/per-rule net count. Replacing or relocating one existing suppression with another for the same rule is intentionally left to complete-diff review because a stricter line/target identity produced false positives for reason edits and ordinary changes under an existing directive.
- Cycle detection covers measured production TypeScript static imports/exports and string-literal `require`; dynamic imports are treated as explicit asynchronous boundaries.
- Unused-export and unused-dependency enforcement is deferred until repository entry points, scripts, generated modules, and optional integrations can be classified without high false-positive rates or overlapping packages.
- Exact catalog/data-only exclusions are policy-owned and must be extended deliberately if a new generated/data location is introduced.
- The baseline records substantial historical debt; passing means no regression, not that current source meets every target.
- Existing lint, design cleanup/architecture, catalog, Phase 8, and Pro visual failures from the audit remain outside this batch.

### Superseded next-batch note

The note that formerly selected Phase 1 / CH-0001 is superseded by the completed security batch below and by the post-closure triage at the end of this handoff. CH-0001 must not be reopened without concrete regression evidence.

---

## CH-0001 fail-closed deployment/admin batch — 2026-07-31

Status: **RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE**. Resolution commit: `62ba966ecb2011e4233c99ce1dcc0641914af008`.

Missing or unknown deployment classification no longer becomes development, every administrative environment requires an authenticated allowlisted server identity, malformed admin/reviewer/publisher lists deny the complete corresponding authority, the two request-controlled catalog-audit bypasses are removed, CI flags cannot synthesize or weaken Auth.js credentials, production-server instrumentation rejects invalid deployment state, and thirteen privileged CLI/background/backup/test entry points enforce their applicable deployment and target policy before work. The complete 25-route/14-page/13-CLI inventory and policy tables are in `docs/security/CH-0001_AUTHORIZATION_MATRIX.md`; unverified Vercel/GitHub/OAuth/scheduler/database credentials and targets are in `docs/security/CH-0001_EXTERNAL_CONTROLS_CHECKLIST.md` and are not claimed as fixed.

The batch preserves Auth.js and the existing `ADMIN_EMAILS`, reviewer, and publisher sources of truth. It introduces no dependency, schema, migration, catalog data, production data, deployment, secret rotation, push, or product/UI change. CI and `.env.example` now classify development explicitly, CI supplies its existing explicit shaped credentials, and the named authentication/admin matrix is required.

Independent security review found additional CH-0001 enforcement and evidence gaps in unchanged surrounding helpers. The batch removes GitHub-Actions-only fixed credential and short-secret fallbacks from `lib/auth-env.ts`, changes reviewer/publisher allowlist parsing to reject a whole missing, blank, or malformed list instead of retaining valid-looking entries, and inventories/hardens operational workers, destructive retention/deletion, database backup/restore, model utilities, and test-only seed/billing entry points. `import-model.ts` now uses the canonical deployment classifier, so staging and production consistently make its existing finish-mapping QA findings strict. The review also hardened remote Playwright evidence: its four cookie fixtures must be distinct, expired/free/Pro identities are proven through `/api/me`, and tracing is disabled for the API-only spec so failure artifacts do not retain live session headers. These are narrowly documented security-enforcement and evidence-validity changes; no permanent engineering guardrail was replaced or weakened.

Focused and standard evidence:

- PASS: `npm run test:auth-env-hardening` (25 admin route files, 14 admin pages, 13 privileged CLI/background/backup/test entry points, extra privileged routes, `/api/me`, environment/auth-credential/admin/reviewer/publisher/session/error/side-effect matrix, behavioral production-target denial, and sanitized malformed-URL output).
- PASS: focused ESLint for every changed TypeScript/TSX file.
- PASS: `npm run test:phase7-security-boundaries` and focused floor-plan publication, reviewer/publisher, construction, supplementary-source, variant-link, and retirement checks.
- PASS: `tests/e2e/13-admin-variant-audit.spec.ts` (2/2 with real local Auth.js database sessions).
- PASS: `npm run test:floor-plan-required`, `npm run verify:design-persistence`, `npm run typecheck`, `npx prisma validate`, `npm run check:code-quality`, asset inventory, catalog asset availability, theme contrast, Cabinet Preview renderer policy, and final `npm run build`.
- EXPECTED INHERITED FAIL: full lint remains limited to `CatalogPanel.tsx:358` and `FloorPlanImportAssistant.tsx:294`; design cleanup remains limited to the command-bar save-chip assertion; catalog audit remains limited to five values in the three Hamilton sofa YAML files. These are unchanged from the audit baseline and were not suppressed or modified.
- PASS: invalid and missing classifier production-server preparation rejected the instrumentation hook; direct `/api/admin/audit` and `/api/me` requests returned safe 500 responses with no privileged work. Valid development direct requests returned 403 for the former bypass and 200 only for the real allowlisted-admin Playwright session.
- PASS: an unclassified `npm run build` stopped during prerender at the deployment validator; the supported explicit `APP_ENV=development npm run build` completed successfully.
- PASS after environmental rerun: the initial sandboxed build failed because Turbopack could not bind its internal helper port; the approved unsandboxed production build passed with the inherited whole-project tracing warning.

The only permanent code-quality artifact adjustment is a required lowering of `app/api/admin/audit/route.ts`'s existing overlong-function maximum from 107 to 102 after the unsafe bypass was deleted. No guardrail policy, threshold, exception, or suppression changed.

---

## Post-CH-0001 triage — 2026-07-31

Triage ran on `security/ch-0001-fail-closed-admin-auth` at exact HEAD `62ba966ecb2011e4233c99ce1dcc0641914af008`. The commit is in current history, the worktree was clean at entry, and `git diff --stat`/`git diff --check` were empty. Node listeners on ports 3000 and 52401 both resolved to `/Users/justus/Developer/interior-ai`, matching the intended documentation target. No production source, test, catalog, schema, dependency, configuration, push, deployment, or external control was changed.

CH-0001 closure was reconfirmed from the implementation, discovery matrix, authorization documentation, and focused tests. `npm run test:auth-env-hardening` passed with 25 admin routes, 14 admin pages, and 13 privileged entry points; `npm run test:phase7-security-boundaries` passed. No former query/header audit bypass or unauthenticated/empty-allowlist development authority remains. Human verification of Vercel, GitHub, OAuth, scheduler, storage, and database controls remains explicit in `docs/security/CH-0001_EXTERNAL_CONTROLS_CHECKLIST.md`.

The triage found zero unresolved P0 and sixteen unresolved P1 findings. CH-0009 is downgraded to P2 because CH-0001 now limits the bounded GLB optimizer route to allowlisted administrators, though request-time mutable package execution remains. CH-0014 is downgraded to P2 because per-item resource/event ownership remains visible but no P1 production outage, data loss, or security/privacy impact is measured. The complete classifications, evidence, reachability, dependencies, tests, scope, rollback, and queue are in `06_P0_P1_REMEDIATION_QUEUE.md`.

The four reported inherited groups remain separate from CH-0001:

- `CatalogPanel.tsx:358`: P2, blocks lint/CI; no incorrect runtime result reproduced.
- `FloorPlanImportAssistant.tsx:294`: P3, blocks zero-warning lint/CI; low runtime risk because the dependency is unnecessary rather than missing.
- `scripts/test-command-bar-save-status.ts:34`: P3 stale contract, blocks and masks the design-cleanup suite; source still uses `md:flex` and only the equivalent height token differs.
- three Hamilton sofa YAMLs: P2 catalog-data quality, five controlled-vocabulary failures, blocks catalog audit/strict release validation.

Focused post-closure checks also invalidated the claim that those four groups are the only remaining red evidence. These are not CH-0001 regressions: the design architecture checker is still 594/550 and 361/300 and is masked behind the save-status failure; Phase 8 CPU fingerprinting now passes but initial-JS raw size remains 7,068,799/6,955,000 bytes; Pro visual policy remains 2/4 because the Cabinet Preview opener is hidden in Chromium and WebKit. They require separate CH-0019 batches and must not be folded into the inherited four.

The decision rule selects exactly one next batch: **CH-0012 canonical saved-design routing characterization and redirect/URL boundary**. CH-0002, CH-0007, and CH-0008 rank higher by raw risk but require product decisions; CH-0012 is the highest-risk READY P1 and affects dashboard, duplicate, checkout-success, and direct saved-design entry into a lossy legacy editor. Likely files, required tests, exact future validation commands, and rollback are recorded in the queue and Phase 3 of `04_REFACTOR_ROADMAP.md`. No implementation has started.
