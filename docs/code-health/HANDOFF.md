# Code health audit handoff

Current superseding status: CH-0001, CH-0012, CH-0016, and CH-0017 repository remediation are complete. CH-0016 still requires external GitHub/Vercel execution verification, and CH-0017 requires external GitHub enforcement verification; no external control is claimed verified. The next READY P1 is CH-0004 trusted event provenance, which has not been started. The latest implementation record is at the end of this handoff.

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

The historical selection above is superseded by the completed CH-0012 record below.

---

## CH-0012 canonical saved-design routing — 2026-07-31

Status: **RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE** on `fix/ch-0012-canonical-saved-design-routing`. Starting SHA: `62ba966ecb2011e4233c99ce1dcc0641914af008`. The four post-CH-0001 triage documents were isolated first in `195deacba6e22293b4e887dd4b4bb5203028c0fb`. The local implementation commit is the commit containing this record; its resolved SHA is reported after creation in the final Codex response. Nothing was pushed or deployed.

The verified root cause was route selection, not snapshot storage: dashboard, duplicate, and checkout-success callers hard-coded `/design/[id]`, selecting an independent legacy `DesignerCanvas` loader that cast items through `unknown` and omitted modern multi-room, floor-plan/opening, finish/opacity, zone, saved-view, and capability state. Route inventory also found that My Designs could change the loaded state without changing history, denied query loads could retain a prior document under the wrong URL, and successful floor-plan revision copies could retain the source URL.

The editable contract is now `/design?designId=<encoded opaque ID>`. The typed helper emits Consumer/default mode without `mode`; it preserves only verified `mode=designer`, `view=2d`, `workspace=furnish`, and explicitly supplied encoded `floorPlanImport`. It rejects an empty ID and does not forward arbitrary redirects, return targets, or analytics attribution. A URL can request Designer presentation but cannot grant Pro: `/api/me` plan/capabilities remain authoritative. `GET /api/designs/[id]` still requires owner identity or an enabled valid share token and returns 404 otherwise; writes remain owner-only.

Implemented behavior:

- dashboard, duplicate success, and checkout success use the canonical helper; duplicate failure does not navigate and success uses the authoritative returned copy ID;
- `/design/[id]` is a temporary server redirect with no Prisma/auth load or legacy renderer and forwards only the verified context allowlist;
- My Designs closes and synchronously pushes the canonical URL, after which the route loader owns history, refresh, loading, and save identity;
- direct canonical loads wait for session and local-backup hydration, treat IDs as opaque, ignore superseded loads, and restore the prior canonical identity or `/design` after missing/denied/unavailable results;
- floor-plan revision copies navigate only after the returned copy loads exactly as `"loaded"`; an operation generation invalidated on unmount stops every post-await stale continuation;
- `MyDesignsDialog` is open-gated and lazy, keeping CH-0012 below the exact starting initial-JS artifact;
- existing floor-plan import assistant/history URLs were already canonical and remain unchanged; `/share/[shareToken]` remains the separate read-only share/client-preview contract; orphaned `/d/[token]` remains read-only compatibility debt outside CH-0012.

The complete per-entry routing table is in `06_P0_P1_REMEDIATION_QUEUE.md`. No separate recent-design route was found, billing success has no saved-design continuation ID, and no new route architecture was invented.

Final evidence on the exact pre-commit tree:

- PASS: `npm run test:design-editor-routing`; `npm run verify:design-persistence`; `npm run check:code-quality` (1,012 production files, 198 oversized baselines, 554 function-debt baselines, 20 suppression baselines, no runtime cycle or unsafe TypeScript suppression); targeted and expanded ESLint with zero warnings; `npm run typecheck`; `npm run test:floor-plan-revision-copy`; direct `scripts/test-floor-plan-consumer-flow.ts`; `git diff --check`.
- PASS: `APP_ENV=development npx playwright test tests/e2e/design-editor-routing.spec.ts --project=chromium` — 6/6 in 3.0 minutes. The database-backed fixture verifies complete multi-room structure, openings, finishes/opacity, item identities/transforms, zones, saved views, startup writes/no create, edit/save/reload identity, history/refresh, legacy allowlist redirect, Pro non-escalation, duplicate returned ID/failure behavior, checkout present/missing context, and denied-ID fallback with preserved allowed context.
- PASS: existing `tests/e2e/16-share-duplicate-smoke.spec.ts` — 4/4 in 16.7 seconds.
- PASS: `APP_ENV=development npm run build`; inherited lenient-catalog notices and the Turbopack whole-project tracing warning remain.
- EXPECTED INHERITED FAIL: full lint remains exactly `CatalogPanel.tsx:358` plus `FloorPlanImportAssistant.tsx:294`; design cleanup remains exactly `test-command-bar-save-status.ts:34`; architecture remains 594/550 and 361/300.
- EXPECTED INHERITED FAIL WITH IMPROVEMENT: the configured Phase 8 initial-JS budget remains red at 7,062,575/6,955,000 raw and 1,159,786/1,130,000 Brotli. The exact CH-0012 starting artifact was 7,068,799 raw / 1,160,288 Brotli, so this batch improves by 6,224 raw / 502 Brotli bytes and introduces no bundle regression.
- NOT RECLASSIFIED: five Hamilton controlled-vocabulary failures and Pro visual policy 2/4 were not rerun; their source/policy inputs were not changed. No inherited failure was suppressed, rebaselined, or claimed green.

Independent read-only review initially found the My Designs URL/history gap, denied-ID wrong-URL state, floor-plan copy source identity, allowed-context loss, and late navigation after unmount. Each valid finding was fixed and affected checks rerun. Final disposition: **no blockers**. Non-blocking residuals are the lazy dialog's null/chunk-error fallback, unusual external close during pending delete, duplicate success being compositional rather than one monolithic UI sequence, and orphaned read-only `/d/[token]` debt.

Rollback is one `git revert` of the CH-0012 implementation commit; an emergency partial rollback should revert callers first while retaining `/design/[id]` as the compatibility redirect. There is no schema, migration, dependency, persisted-document rewrite, production-data action, push, deployment, or external-control change to reverse.

CH-0016 was subsequently completed as its own bounded repository-evidence batch. Next READY P1: **CH-0017 required-test truthfulness and coverage**. Do not start it as part of CH-0012 or CH-0016.

---

## CH-0016 production-equivalent artifact evidence — 2026-07-31

Status: **REPOSITORY REMEDIATION COMPLETE — EXTERNAL EXECUTION/VERIFICATION REQUIRED** on `fix/ch-0016-production-equivalent-artifact-evidence`. Starting SHA: `2c9e8b4d2322484a8d80873019d2c3495dd862f5`. Implementation SHA: `cbed3550026e2803675f740b49be5fb15f15612b`. Both required predecessors, CH-0001 `62ba966ecb2011e4233c99ce1dcc0641914af008` and CH-0012 `2c9e8b4d2322484a8d80873019d2c3495dd862f5`, were ancestors; entry status/diff/untracked checks were empty. Before editing, `lsof` resolved the listening Node process to `/Users/justus/Developer/interior-ai`, matching the intended canonical checkout. Nothing was pushed or deployed.

The verified root cause was a broken evidence chain. Required CI explicitly set `CATALOG_STRICT_VALIDATION=false`, built once, then invoked a Playwright smoke configuration that selected `npm run dev`, producing and testing a second development compilation. The report did not identify the built artifact, the health endpoint did not expose its Next build ID/artifact/source identity, and no validator bound source, dependency lock, generated source, build, trace closure, runtime, and report. The Vercel prebuilt manifest also omitted untracked and ignored influential source. A safe diagnostic rebuild confirmed that broad Next tracing could capture ignored `.env`, `.env.local`, and private release-evidence paths.

Repository-controlled contract and flow:

- `evidence:production:build` requires a fresh artifact-free checkout at one full clean commit, a safe candidate ID, clean submodules, no ordinary untracked source, and no ignored input outside named generated dependency/build/evidence roots. It runs `npm ci --include=dev` so locked build tooling remains available under `NODE_ENV=production`, records exact package-manager/Node/lock/installed-lock identities, runs the existing generated surface-runtime `--check`, requires consistent `APP_ENV`/`NEXT_PUBLIC_APP_ENV`/optional `VERCEL_ENV`, disables development-only flags, validates non-secret staging/production configuration shape, and builds once with strict catalog validation.
- The manifest uses canonical JSON plus a SHA-256 sidecar. A locale-independent inventory hashes every `.next` and `public` file or contained symlink, excluding only named mutable Next cache/diagnostic paths. Every NFT manifest/reference must exist; prohibited or outside-repository lexical and resolved targets fail. The content of the unique runtime closure, including safely contained traced package directories, is hashed. The Next `BUILD_ID`, artifact root hash, source SHA, build timestamps, safe flag identity, and exact commands are recorded.
- `evidence:production:smoke` revalidates the source, dependency identities, artifact, closure, and manifest before Playwright starts anything. Evidence mode cannot use a remote URL, `npm run dev`, an existing listener, or an arbitrary server command. Its wrapper revalidates again, invokes the unchanged `npm run start`, and supplies the exact manifest identity to `/api/health`. Runtime smoke requires the health source SHA, artifact SHA-256, and Next build ID to match.
- The Playwright JSON records its actual web-server command/reuse policy and manifest metadata. Known machine-local Playwright paths are canonicalized to `<repository-root>` before hashing; non-canonical path fields, sensitive field names, or known secret values fail. Passing evidence requires positive test count and zero failed, flaky, or skipped critical tests. Its embedded report hash, canonical UTC timestamps, current-state revalidation, and same-artifact fields reject modification, substitution, or stale reuse.
- Repository evidence always uses `evidenceKind=local-production-mode-artifact`, `releaseReady=false`, `actualDeploymentVerified=false`, and the exact fixed Vercel/GitHub/OAuth/scheduler/database checklist with every status `not_verified`. Human approval and external execution remain separate. The CI upload requests 14-day retention, but only an actual GitHub run can verify execution and retention.

Local validation artifacts were generated successfully in an ephemeral detached-worktree directory. Their hashes and results are recorded below for local verification only. The temporary manifest, runtime report, and 403 MB build artifact may disappear after restart, cleanup, or operating-system maintenance; none is durable release evidence and the build artifact must not be committed.

Durable evidence retention remains pending a real GitHub Actions execution and artifact upload.

Primary implementation surfaces are `scripts/production-artifact-evidence.mjs`, its temporary-Git-repository negative suite, the strict `stable-checks` build/smoke path, the evidence-specific Playwright configuration, runtime health identity, trace exclusions, the Vercel clean-source inspector, and `docs/qa/production-artifact-evidence.md`. No dependency, package lock, schema, migration, catalog content, production data, product workflow, external setting, or human approval mechanism changed.

Focused fail-closed coverage exercises the real exported validator for clean success; tracked, ordinary untracked, and ignored influential source; wrong source SHA; missing/tampered lock and installed-lock identity; failed generated check; missing/tampered artifact and empty/missing/prohibited/symlink-escaped trace closure; missing/tampered/non-canonical manifest and report; stale/non-UTC timestamps; missing/unknown/contradictory environment; development build/server and enabled development flags; actual Playwright server command/listener reuse; failed/flaky/zero/skipped tests; wrong artifact binding; external overclaim; report path portability; and secret field/value leakage. The same suite behaviorally proves Vercel inspection rejects both ordinary untracked and ignored influential input. Static contract checks prove CI has no lenient override, evidence mode has no development fallback, and Next excludes prohibited private roots; the existing real catalog validator rejects an invalid catalog fixture.

Validation on the reviewed pre-commit tree:

- PASS: `npm run test:production-artifact-evidence`; targeted ESLint over every changed JavaScript/TypeScript/config file with `--max-warnings=0`; `npm run typecheck`; `npm run check:code-quality` (1,012 production files, 198 file baselines, 554 function-debt baselines, 20 suppressions, no cycle/unsafe-TypeScript regression); `npm run test:auth-env-hardening`; `npm run test:phase7-security-boundaries`; `npm run test:phase15`; `npm run test:cabinetry-release-evidence`; `git diff --check`.
- PASS: the existing generated surface-runtime `--check`; strict staging diagnostic `npm run build` with shaped nonfunctional configuration; current-artifact inspection found 2,403 artifact files / 403,549,198 bytes, 112 NFT manifests / 42,879 references, zero missing/prohibited paths, and a content-bound closure of 4,436 entries / 6,085 files. The exact diagnostic hashes and build ID are not release evidence because that checkout contained ignored local environment/evidence inputs.
- EXPECTED ENVIRONMENTAL RETRY: the initial sandboxed Turbopack build could not bind its helper port; the approved unsandboxed diagnostic build passed. The existing broad-tracing warning through the floor-plan PDF path remains and is bounded by the manifest rather than claimed fixed.
- PASS on the exact post-commit candidate: fresh detached-worktree `evidence:production:build`, production-server smoke, `evidence:production:verify`, and manifest sidecar verification. The local identities are recorded below; the underlying files remain ephemeral.
- EXPECTED INHERITED FAIL: full lint remains `CatalogPanel.tsx:358` plus `FloorPlanImportAssistant.tsx:294`; design cleanup remains the command-bar assertion at `test-command-bar-save-status.ts:34`; catalog audit remains five controlled-vocabulary failures in the same three Hamilton YAML files; and direct design architecture remains 594/550 and 361/300. The same inherited Phase 8 budget gate remains failing: representative project timings pass before the initial-JS raw limit fails at 7,062,575/6,955,000 bytes. Compared with the earlier 7,068,799-byte measurement, raw initial JS decreased by 6,224 bytes and did not worsen. Pro visual policy remains the recorded starting 2/4 and was not rerun because none of its source/policy inputs changed. CH-0016 changed none of these inputs, suppressions, baselines, thresholds, or expected assertions; no inherited failure is claimed fixed.

Exact local validation record for `cbed3550026e2803675f740b49be5fb15f15612b`:

- Artifact SHA-256: `687ae0dc8caef59efa70744fa15bf4bdad10cbe340573b7526c9bd325f5b6a1b`.
- Next build ID: `rA5fXIu9h0ME9YOlllsOn`.
- Manifest SHA-256: `35022a6d8270427b615f45d24fd48b29f46a24ceb55c7a7294da4fd6ec3eba36`.
- Runtime report SHA-256: `bf2521c331f0ef20ef8eb5cf862cf36bf625025aee5b83341ff86e5c5d053453`.
- Production smoke: 2/2 passed; zero failed, flaky, or skipped tests; process exit code 0.
- Standalone verification and manifest sidecar verification: PASS.

These identities describe the one local run, not a reproducible-build promise. A GitHub build may have a different artifact SHA-256 or Next build ID; its own manifest, tested artifact, health response, and test report must agree with each other and identify the exact source SHA.

Independent read-only review found and drove fixes for: incomplete manifest-field revalidation; runtime-closure content not initially bound; ignored build inputs; macOS realpath and artifact/trace symlink escape handling; legitimate traced dependency directories; locale-dependent inventory order; zero-trace acceptance; canonical UTC test timestamps; contradictory public/Vercel environment identity; overclaimable repository statements; secret-bearing or absolute-path report data; metadata that did not prove the actual Playwright server; a nonzero Playwright process exit that could initially leave passing JSON marked valid; text-only Vercel regression coverage; and missing negative/HANDOFF coverage. Every valid finding was addressed in the contract and affected tests rerun. Final disposition after the complete stable diff review: **PASS — no blocking findings**.

External controls still requiring dated human/platform evidence are: Vercel project/environment/deployment and runtime configuration; GitHub required checks, permissions, immutable run, and artifact retention; OAuth provider applications/redirects/credential state; scheduler identity/target/cadence/retry state; and database target/access/backup/migration state. Repository output does not mark any of them verified.

External GitHub Actions verification record — **PENDING**:

- GitHub workflow run: Pending.
- Source SHA: `cbed3550026e2803675f740b49be5fb15f15612b`.
- Workflow/ref: Pending.
- Artifact name: Pending platform confirmation (configured name: `playwright-smoke-results`).
- Artifact expiry/retention: Pending platform confirmation.
- CI artifact SHA-256: Pending.
- CI build ID: Pending.
- Manifest SHA-256: Pending.
- Runtime report SHA-256: Pending.
- Standalone verification of downloaded evidence: Pending.
- Required-check conclusion: Pending.
- External controls verified: None.
- External controls still unverified: GitHub execution/retention and all Vercel, OAuth, scheduler, and database controls listed above.

Rollback is `git revert cbed3550026e2803675f740b49be5fb15f15612b`. This removes the evidence scripts, strict CI binding, health identity, trace exclusions, and implementation documentation together; it restores the unsafe lenient/dev evidence path and is therefore an emergency rollback, not an acceptable long-term state. Ignored `.local/production-artifact-evidence/` output is regenerated, not source-controlled. No external deployment or setting exists to roll back.

Next READY P1: **CH-0017 required-test truthfulness and coverage**. It was not started, must remain a separate batch, and must not begin until the exact CH-0016 implementation commit has completed the external GitHub Actions verification above.

---

## CH-0017 required-test truthfulness and coverage — 2026-08-01

Status: **CH-0017 REOPENED — EXTERNAL RUN FOLLOW-UP IN PROGRESS** on `fix/ch-0017-required-test-truthfulness`. Starting SHA: `cea0cabe53742da8b47c1e119d889033351a1fdf`; implementation SHA: `c840c06dc2c5e67f463542292bb7391b0f93d731`. CH-0001 `62ba966ecb2011e4233c99ce1dcc0641914af008`, CH-0012 `2c9e8b4d2322484a8d80873019d2c3495dd862f5`, and CH-0016 `cbed3550026e2803675f740b49be5fb15f15612b` are ancestors. Entry status, tracked diff, and untracked checks were empty. Before editing, `lsof` resolved the listening Node process to `/Users/justus/Developer/interior-ai`, matching the intended canonical checkout.

The verified root cause was a collection of independently false-green paths rather than one bad assertion. Two E2E specs annotated and returned when buyer-flow or Kelsey catalog prerequisites were absent; floor-plan live-progress coverage existed but was omitted from the required umbrella; the full browser inventory was advisory without a separately process-bound Gate A3 evidence contract; CH-0016 runtime smoke and cabinetry release evidence relied on aggregate counts instead of stable test identities; Gate A3 accepted aggregate report statistics and a URL without proving exact file/project discovery, filtering, focus, skip, retry, runner exit, freshness, source, or artifact identity; and the cabinetry GLB export test caught a missing `FileReader`, printed a skip message, and exited zero.

Repository-controlled contract and flow:

- `scripts/required-test-manifest.json` is the single classification and evidence owner for 21 gates. It locks sorted inventories of 245 `scripts/test-*` files, 98 E2E specs, 14 imported cabinetry/multi-room browser modules, and 8 imported cabinetry script-test modules; declares merge-required, release-blocking, and advisory ownership; maps package and CI entry points; and records exact files, projects, runner/config, skip/retry, report, stable-identity, source, artifact, and external-control expectations. Split-suite import/call registrations and recursively reachable package-script closure hashes prevent unchanged test modules or nested umbrella commands from disappearing. The required Git-history secret scan, database migration process, and final merge-result aggregation are inventoried alongside executable repository tests instead of remaining implicit workflow-only checks.
- `scripts/required-test-truthfulness.mjs` fails closed on inventory drift, missing or unreachable commands, wrong CI wiring, `.only`, annotated-away prerequisites, missing/renamed/extra/duplicate files or stable tests, zero discovery, wrong/missing projects, filtering/sharding, skip/fixme/annotations, retry/flaky/failed/not-run outcomes, aggregate/per-test disagreement, nonzero runner exit, missing/malformed/truncated/stale/future evidence, report substitution, source/artifact mismatch, and secret-bearing report fields. It deletes stale output before execution, writes a small evidence envelope on failure, and preserves the Playwright process result.
- `test:e2e:advisory` remains visibly nonblocking only through the named CI `continue-on-error` boundary. `test:e2e:release`, Pro visual policy, CH-0016 runtime smoke, and cabinetry release evidence are required and process-bound. Gate A3 certification now consumes the evidence envelope and exact source/artifact/staged-URL binding instead of raw aggregate JSON.
- The CH-0016 production-artifact validator retains its source, lock, generated-source, trace-closure, build, runtime, and report protections and now additionally requires both stable runtime-smoke identities with exact project/config semantics. Gate A3 locks the six repaired commerce/Kelsey identities in addition to owning the complete 98-spec browser inventory. Cabinetry evidence requires all 23 registered stable tests and consumes the process-captured wrapper envelope plus its bound report, source, artifact SHA-256, candidate/environment, and URL instead of a minimum total or hand-entered child status. The canonical runner/envelope contract is reused rather than replacing either domain-specific release record.
- `05-buy.spec.ts` and `07-kelsey-variants.spec.ts` now assert every required prerequisite and outcome. Missing catalog cards, variants, swatches, buyer controls, checkout, or cart state is a real failure. The GLB export behavior check installs a deterministic Node `FileReader` shim and always performs the export assertion; it no longer warns and returns success without exercising export.
- `test:floor-plan-required` now invokes `test:floor-plan-live-progress`. `test:critical-required` names the security, persistence, billing, product-flow, telemetry, capability/accessibility, cabinetry, and cabinetry-evidence umbrellas that CI actually requires.

Negative coverage uses the real exported validators with temporary repositories and reports. It proves a valid report passes and rejects missing/renamed required source, removed split-suite registration, changed nested package closure, zero discovery, missing/wrong projects, filtered or wrong files, renamed stable identities, skip, retry/flaky results, `.only`, annotated returns, a nonzero process with passing JSON, a zero process with failed JSON, missing/malformed/truncated/stale or substituted evidence, source/artifact/URL mismatch, wrong exact config/root, merge-aggregation drift, machine-local fields, and secret-bearing fields or values. Missing, malformed, or unsafe reports and their Playwright output are removed before CI artifact upload; valid non-sensitive failed reports remain available for diagnosis. The suite separately proves advisory failure is visible but nonblocking only at its explicit CI owner. CH-0016 and cabinetry validator suites use complete per-test fixtures and add missing/renamed stable identity, focus, retry, project, process, source, artifact, URL, and promotion-certification negatives.

Independent read-only review disposition: **PASS — no remaining repository-controlled blockers**. The reviewer inspected the complete current diff and verified `git diff --check`, the 21-gate/365-source manifest, and JavaScript syntax. Review findings closed during the batch covered imported browser/script-module registration, recursive package closure, the six repaired commerce/Kelsey identities, exact config/root and mandatory source/artifact validation, filtered-run coverage, merge-result aggregation, Gate A3 certification/promotion binding, cabinetry source/artifact/URL/process/report hardening, CI evidence uploads, and deletion of unsafe or unparseable raw artifacts before upload. The reviewer made no edits. GitHub workflow execution, required-check selection, artifact retention/download hashes, and inherited CH-0016 platform controls remain correctly external and unverified.

Final pre-commit validation:

- PASS: `npm run test:required-test-truthfulness`; `node scripts/required-test-truthfulness.mjs check` (21 gates and 365 classified test sources); targeted ESLint over every changed JavaScript/TypeScript/E2E/config file with `--max-warnings=0`; `npm run typecheck`; `npm run test:production-artifact-evidence`; `npm run test:cabinetry-release-evidence`; `npm run check:code-quality` (1,012 production files, 198 file baselines, 554 function-debt baselines, 20 suppression baselines, no runtime cycle or unsafe-TypeScript regression); `npm run test:critical-required`; `npm run test:floor-plan-required`; `npm run test:catalog-asset-availability`; and `git diff --check`.
- PASS: strict shaped staging `npm run build`. The first sandboxed attempt failed because Turbopack could not bind its helper port. A later approved diagnostic reached page collection but correctly rejected a malformed non-secret Google client-ID placeholder; the corrected shaped configuration completed all 57 pages. The inherited whole-project NFT tracing warning remains visible.
- EXPECTED INHERITED FAIL, NOW TRUTHFULLY RECORDED: `npm run test:pro-visual-policy` produced a nonzero process and a failed CH-0017 evidence envelope. Two of four tests failed because `open-custom-millwork-studio` remained hidden in Chromium and WebKit; the other two passed. The report names both exact failed stable test/project identities and agrees with process exit 1.
- EXPECTED INHERITED FAIL: full lint remains exactly `CatalogPanel.tsx:358` plus `FloorPlanImportAssistant.tsx:294`; design cleanup remains the command-bar assertion at `scripts/test-command-bar-save-status.ts:34`; catalog audit remains five controlled-vocabulary failures in the same three Hamilton YAML files. None of these files, expectations, thresholds, suppressions, or baselines changed.

First external run: draft PR `#27` targets `staging`; GitHub Actions run `30656047329` was a `pull_request` run whose head metadata identified `c840c06dc2c5e67f463542292bb7391b0f93d731`, but `actions/checkout` actually selected synthetic merge commit `616d74c17acc254fdca9016b00670b97066b1261`. Secret scan passed. Stable checks passed the CH-0017 validator, CH-0016 contract tests, and strict production build, then failed runtime smoke because the fresh PostgreSQL service had not yet run `npm run gate:a3:db`; logs reported missing `AppEvent`, `ModelAsset`, and `FloorPlanAddressBinding` tables. Playwright's CI-default Git diff capture also copied shaped sensitive environment values from the workflow into the JSON report. The always-run upload retained that unsafe, non-standalone evidence for 14 days, while the advisory full-E2E job was skipped. Merge aggregation failed as required. No GitHub deployment record was created.

The downloaded first-run artifact `8803556691` was associated with run `30656047329` and head SHA `c840c06dc2c5e67f463542292bb7391b0f93d731`; GitHub accepted expiry `2026-08-14T18:51:41Z`. Its manifest sidecar passed, but standalone verification correctly failed because the artifact roots and repository identity were absent, the smoke record was not approval-ready, and the report contained shaped sensitive environment values. Repository ruleset `staging-light-protection` (`13671593`) applies pull-request/thread-resolution policy to `staging` but has no required-status-check rule. Therefore neither Gate A3 nor `merge-gate` is currently required; advisory full E2E is also not required. This external configuration gap is not changed by the repository follow-up.

The one permitted follow-up commit immediately after `c840c06...` binds all CI checkouts to the exact PR head, migrates PostgreSQL before production evidence, disables Playwright commit/diff capture, makes advisory full E2E execute nonblockingly on the verification PR, restores the exact `merge-gate` context name, and uploads only a scanned tar bundle whose artifact roots and symlinks can be rehashed by `verify-standalone` after download. The external rerun and its immutable identities are recorded in the final verification report rather than asserted before execution. Vercel, OAuth, scheduler, and database items inherited from CH-0016 remain unverified.

Independent read-only follow-up review disposition: **PASS — no remaining actionable findings**. Three findings were closed before commit: the bundle cleanup API is constrained to the exact dedicated upload directory and cannot delete a caller-selected repository path; Playwright Git capture is disabled in both the main and Pro visual configurations; and the tests now complete a positive tar sidecar/allowlist/exclusion/symlink/extraction/standalone-verifier round trip. The reviewer reran syntax checks, both evidence/truthfulness suites, and `git diff --check` over the complete follow-up.

Rollback the external-run follow-up commit first, then `git revert c840c06dc2c5e67f463542292bb7391b0f93d731`. Reverting both removes the exact-head/migration/report/bundle corrections and the original fail-closed inventory/report/evidence contract, restoring known false-pass paths; this is an emergency rollback rather than an acceptable steady state. Ignored `.local/required-test-evidence/`, `.local/production-artifact-evidence/`, `.vercel` reports, and Playwright artifacts are regenerated and are not source-controlled. The follow-up changes no product/database/persisted-data schema, migration files, dependency versions, catalog data, production data, product/UI, deployment, or external setting. Ruleset `13671593` remains a separate administrator-owned configuration state.

Next READY P1: **CH-0004 trusted event provenance**. It was not started and must remain a separate batch.
