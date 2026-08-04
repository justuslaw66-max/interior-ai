# Code health audit handoff

## Latest bounded implementation record — Next.js/Auth.js security compatibility

Branch `security/dependency-auth-next-compatibility` starts exactly at clean frozen source `55bc4b65c121c1a6646fd2d8b38bb93f9061c372`. It updates Next 16.2.10 -> 16.2.11, next-auth beta.30 -> beta.32, Prisma adapter 2.11.1 -> 2.11.3 with one core 0.41.3, aligned eslint-config-next, and PostCSS 8.5.20 -> 8.5.23. Fresh full audit moves 16 -> 11 package nodes (critical 2 -> 0); omit-dev moves 12 -> 7, with no remaining Next/Auth/PostCSS advisory node. Required local gates, focused real-session authorization, 57-page build, built runtime health/session, and Phase 8 budgets pass. The only compatibility code change strengthens the existing test-only auth preflight for providers, CSRF, Google sign-in/PKCE/callback URL, sign-out, and redirects. Full evidence, remaining advisory classifications, and rollback are in `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md`. No Full E2E, CH-0004, push, deployment, schema, provider, or platform-setting change occurred.

Current superseding status: CH-0001, CH-0012, and CH-0016 repository remediation are complete. CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. CH-0028 is **EXTERNALLY VERIFIED — RESOLVED** at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. CH-0029 is **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION** with local remediation complete and required-only external verification pending; CH-0004 was not started. The latest implementation record is at the end of this handoff.

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
- `test:e2e:advisory` remains visible but non-required through its separately owned full-advisory workflow; its real failure or cancellation is preserved without `continue-on-error`. `test:e2e:release`, Pro visual policy, CH-0016 runtime smoke, and cabinetry release evidence are required and process-bound. Gate A3 certification now consumes the evidence envelope and exact source/artifact/staged-URL binding instead of raw aggregate JSON.
- The CH-0016 production-artifact validator retains its source, lock, generated-source, trace-closure, build, runtime, and report protections and now additionally requires both stable runtime-smoke identities with exact project/config semantics. Gate A3 locks the six repaired commerce/Kelsey identities in addition to owning the complete 98-spec browser inventory. Cabinetry evidence requires all 23 registered stable tests and consumes the process-captured wrapper envelope plus its bound report, source, artifact SHA-256, candidate/environment, and URL instead of a minimum total or hand-entered child status. The canonical runner/envelope contract is reused rather than replacing either domain-specific release record.
- `05-buy.spec.ts` and `07-kelsey-variants.spec.ts` now assert every required prerequisite and outcome. Missing catalog cards, variants, swatches, buyer controls, checkout, or cart state is a real failure. The GLB export behavior check installs a deterministic Node `FileReader` shim and always performs the export assertion; it no longer warns and returns success without exercising export.
- `test:floor-plan-required` now invokes `test:floor-plan-live-progress`. `test:critical-required` names the security, persistence, billing, product-flow, telemetry, capability/accessibility, cabinetry, and cabinetry-evidence umbrellas that CI actually requires.

Negative coverage uses the real exported validators with temporary repositories and reports. It proves a valid report passes and rejects missing/renamed required source, removed split-suite registration, changed nested package closure, zero discovery, missing/wrong projects, filtered or wrong files, renamed stable identities, skip, retry/flaky results, `.only`, annotated returns, a nonzero process with passing JSON, a zero process with failed JSON, missing/malformed/truncated/stale or substituted evidence, source/artifact/URL mismatch, wrong exact config/root, merge-aggregation drift, machine-local fields, and secret-bearing fields or values. Missing, malformed, or unsafe reports and their Playwright output are removed before CI artifact upload; valid non-sensitive failed reports remain available for diagnosis. The suite separately proves advisory failure remains visible at its explicit non-required workflow owner. CH-0016 and cabinetry validator suites use complete per-test fixtures and add missing/renamed stable identity, focus, retry, project, process, source, artifact, URL, and promotion-certification negatives.

Independent read-only review disposition: **PASS — no remaining repository-controlled blockers**. The reviewer inspected the complete current diff and verified `git diff --check`, the 21-gate/365-source manifest, and JavaScript syntax. Review findings closed during the batch covered imported browser/script-module registration, recursive package closure, the six repaired commerce/Kelsey identities, exact config/root and mandatory source/artifact validation, filtered-run coverage, merge-result aggregation, Gate A3 certification/promotion binding, cabinetry source/artifact/URL/process/report hardening, CI evidence uploads, and deletion of unsafe or unparseable raw artifacts before upload. The reviewer made no edits. GitHub workflow execution, required-check selection, artifact retention/download hashes, and inherited CH-0016 platform controls remain correctly external and unverified.

Final pre-commit validation:

- PASS: `npm run test:required-test-truthfulness`; `node scripts/required-test-truthfulness.mjs check` (21 gates and 365 classified test sources); targeted ESLint over every changed JavaScript/TypeScript/E2E/config file with `--max-warnings=0`; `npm run typecheck`; `npm run test:production-artifact-evidence`; `npm run test:cabinetry-release-evidence`; `npm run check:code-quality` (1,012 production files, 198 file baselines, 554 function-debt baselines, 20 suppression baselines, no runtime cycle or unsafe-TypeScript regression); `npm run test:critical-required`; `npm run test:floor-plan-required`; `npm run test:catalog-asset-availability`; and `git diff --check`.
- PASS: strict shaped staging `npm run build`. The first sandboxed attempt failed because Turbopack could not bind its helper port. A later approved diagnostic reached page collection but correctly rejected a malformed non-secret Google client-ID placeholder; the corrected shaped configuration completed all 57 pages. The inherited whole-project NFT tracing warning remains visible.
- EXPECTED INHERITED FAIL, NOW TRUTHFULLY RECORDED: `npm run test:pro-visual-policy` produced a nonzero process and a failed CH-0017 evidence envelope. Two of four tests failed because `open-custom-millwork-studio` remained hidden in Chromium and WebKit; the other two passed. The report names both exact failed stable test/project identities and agrees with process exit 1.
- EXPECTED INHERITED FAIL: full lint remains exactly `CatalogPanel.tsx:358` plus `FloorPlanImportAssistant.tsx:294`; design cleanup remains the command-bar assertion at `scripts/test-command-bar-save-status.ts:34`; catalog audit remains five controlled-vocabulary failures in the same three Hamilton YAML files. None of these files, expectations, thresholds, suppressions, or baselines changed.

First external run: draft PR `#27` targets `staging`; GitHub Actions run `30656047329` was a `pull_request` run whose head metadata identified `c840c06dc2c5e67f463542292bb7391b0f93d731`, but `actions/checkout` actually selected synthetic merge commit `616d74c17acc254fdca9016b00670b97066b1261`. Secret scan passed. Stable checks passed the CH-0017 validator, CH-0016 contract tests, and strict production build, then failed runtime smoke because the fresh PostgreSQL service had not yet run `npm run gate:a3:db`; logs reported missing `AppEvent`, `ModelAsset`, and `FloorPlanAddressBinding` tables. Playwright's CI-default Git diff capture also copied shaped sensitive environment values from the workflow into the JSON report. The always-run upload retained that unsafe, non-standalone evidence for 14 days, while the advisory full-E2E job was skipped. Merge aggregation failed as required. No GitHub deployment record was created.

The downloaded first-run artifact `8803556691` was associated with run `30656047329` and head SHA `c840c06dc2c5e67f463542292bb7391b0f93d731`; GitHub accepted expiry `2026-08-14T18:51:41Z`. Its manifest sidecar passed, but standalone verification correctly failed because the artifact roots and repository identity were absent, the smoke record was not approval-ready, and the report contained shaped sensitive environment values. Repository ruleset `staging-light-protection` (`13671593`) applies pull-request/thread-resolution policy to `staging` but has no required-status-check rule. Therefore neither Gate A3 nor `merge-gate` is currently required; advisory full E2E is also not required. This external configuration gap is not changed by the repository follow-up.

The first permitted follow-up at `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b` binds all CI checkouts to the exact PR head, migrates PostgreSQL before production evidence, disables Playwright commit/diff capture, makes advisory full E2E execute nonblockingly on the verification PR, restores the exact `merge-gate` context name, and uploads only a scanned tar bundle whose artifact roots and symlinks can be rehashed by `verify-standalone` after download. Vercel, OAuth, scheduler, and database items inherited from CH-0016 remain unverified.

Independent read-only follow-up review disposition: **PASS — no remaining actionable findings**. Three findings were closed before commit: the bundle cleanup API is constrained to the exact dedicated upload directory and cannot delete a caller-selected repository path; Playwright Git capture is disabled in both the main and Pro visual configurations; and the tests now complete a positive tar sidecar/allowlist/exclusion/symlink/extraction/standalone-verifier round trip. The reviewer reran syntax checks, both evidence/truthfulness suites, and `git diff --check` over the complete follow-up.

Rollback the external-run follow-up commit first, then `git revert c840c06dc2c5e67f463542292bb7391b0f93d731`. Reverting both removes the exact-head/migration/report/bundle corrections and the original fail-closed inventory/report/evidence contract, restoring known false-pass paths; this is an emergency rollback rather than an acceptable steady state. Ignored `.local/required-test-evidence/`, `.local/production-artifact-evidence/`, `.vercel` reports, and Playwright artifacts are regenerated and are not source-controlled. The follow-up changes no product/database/persisted-data schema, migration files, dependency versions, catalog data, production data, product/UI, deployment, or external setting. Ruleset `13671593` remains a separate administrator-owned configuration state.

### Outcome-D repository follow-up

Exact-head run `30658564565` attempts 1 and 2 exercised `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`. Secret scan, all 42 migrations, the required-test truthfulness suite, CH-0016 production-artifact contract tests, and the strict production build passed. Health/catalog identity passed, but the furnished-template stable runtime identity failed both attempts at `tests/e2e/00-runtime-smoke.spec.ts:299`: a completed GLB response was followed by Playwright's implicit five-second diagnostic poll, which expired before client-side decode/normalization/bounds diagnostics became observable. No stable bundle was uploaded because required smoke failed. Advisory E2E ran and retained honest failures, but module-attributed records created false missing-aggregator/out-of-scope diagnostics, and retained `error-context.md` included `/home/runner/work/...`.

The furnished fixture is created and persisted in browser local storage. GLB loading, normalization, bounds, selection outline, and diagnostic publication run client-side. There is no relevant database commit, authorization boundary, API background job, worker, scheduler, or cross-test state dependency. The exact classification is **test synchronization defect**. `GLBScaledModel` now reports the existing lifecycle as `loading`, `ready`, or terminal `error` with a safe code at its production load boundaries. Required smoke waits up to a bounded 60 seconds for that semantic lifecycle and, on failure, records only safe phase, elapsed time, fixture identity, request/response counts, and portable diagnostics. It retains the original Auburn selection outline, bounds, mount/unmount, reload, and render-loop invariants; no retry, advisory downgrade, final-state seeding, or test-only bypass was added. A focused patched run passed both stable identities (2/2) with process exit 0 and no failed/flaky/skipped test.

Playwright reports tests declared in imported cabinetry and multi-room modules against those module paths. The manifest now registers those modules under one runnable aggregator owner. Validation first requires every registered imported module to contribute at least one raw report record in every required project, then attributes those records once to the owner. Deleting the owner, deleting/renaming/reclassifying a module, missing a module's report records, duplicate ownership, or a missing target fails; helpers remain non-runnable and no coverage is double-counted.

Advisory evidence is no longer uploaded from raw Playwright directories. The always-run preparation command decodes only approved text formats as strict UTF-8, rejects binary/archive signatures and unsafe controls even when renamed with a text extension, normalizes Linux GitHub, macOS, Windows, and temporary paths to `<WORKSPACE>`, scans nested text/JSON/Markdown/log content for shaped and generic secret/key/token/password/cookie/database/authorization/private-key forms, and writes an included/omitted inventory. It builds in a staging directory, performs a final audit, and atomically renames to `.local/required-test-upload/`; any error removes staging and final outputs. Traces, video, screenshots, archives, and other uninspectable binary material are omitted. Stable CH-0016 upload remains limited to the validated tar and sidecar created only after required smoke succeeds.

Local validation before this commit passed `npm run test:required-test-truthfulness`, `node scripts/required-test-truthfulness.mjs check`, `npm run test:production-artifact-evidence`, `npm run test:cabinetry-release-evidence`, `npm run test:critical-required`, `npm run test:floor-plan-required`, `npm run test:glb-local-render-bounds`, `npm run test:design-page-scene-layers`, `npm run typecheck`, `npm run check:code-quality`, generated-runtime drift, strict asset inventory, catalog asset availability, targeted zero-warning ESLint, the focused runtime smoke, and `git diff --check`. Full lint remains the inherited `CatalogPanel.tsx:358` error plus `FloorPlanImportAssistant.tsx:294` warning; design cleanup remains the command-bar size assertion; catalog audit remains five values in the same three Hamilton YAML files; Pro visual policy remains the prior two-of-four hidden-millwork failure. No affected expectation, baseline, threshold, suppression, or inherited source was changed.

The separate read-only reviewer found and caused fixes for: an unconstrained cleanup root; disguised binary and generic-credential gaps; a partial upload directory after preparation failure; imported-module false coverage; and API/access-key colon-form gaps in both advisory and production evidence scans. The reviewer made no edits. Its final fresh pass checked both validator syntaxes, truthfulness, production evidence, GLB coverage, typecheck, targeted ESLint, and diff hygiene and reported **PASS — no actionable findings**.

Commit relationship: CH-0016 implementation `cbed3550026e2803675f740b49be5fb15f15612b`; CH-0017 starting checkpoint `cea0cabe53742da8b47c1e119d889033351a1fdf`; the intervening commit is a separately reviewed CH-0016 external-verification documentation checkpoint (`docs/ch-0016-verification-handoff`) affecting documentation only and containing no production change; CH-0017 implementation `c840c06dc2c5e67f463542292bb7391b0f93d731`; first hardening follow-up `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`; Outcome-D follow-up is the commit containing this entry and its exact SHA is recorded in the final local report.

Repository ruleset `staging-light-protection` (`13671593`) still contains no required-status-check rule. It therefore does not require `merge-gate` or Gate A3; advisory full E2E also remains correctly non-required. No ruleset was modified. The next exact-head workflow execution, durable artifact identity/expiry, and repository-enforcement configuration remain external verification work. No push, merge, deployment, schema/migration/dependency/catalog/product-data/UI change, or external setting is part of this local follow-up.

Rollback the Outcome-D follow-up first, then `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then `c840c06dc2c5e67f463542292bb7391b0f93d731`. That would restore timing-dependent runtime evidence, unsafe/raw advisory retention, and the original false-pass paths; it is an emergency rollback, not a recommended steady state. GitHub ruleset rollback is separately administrator-owned and is not implied.

Active P1: **CH-0017 required-test truthfulness**. CH-0004 trusted event provenance was not started and must remain paused until CH-0017 is externally verified and closed.

---

## CH-0017 exact-head 701aaa CI evidence follow-up — 2026-08-01

Scope remains CH-0017 only. Starting SHA was
`701aaa473518a0a4fdbc9cf9809dd8bd1bac918a` on
`fix/ch-0017-required-test-truthfulness`; the tree was clean and untracked-free,
draft PR #27 remained open against `staging`, its remote head matched, and
ruleset `staging-light-protection` (`13671593`) still had no required-status
checks. No push, merge, deployment, ruleset, schema, migration, dependency,
catalog, production-data, or product/UI change was made. `lsof` showed no app
listener on port 3000 before this follow-up; the only relevant Node process cwd
matched the canonical `/Users/justus/Developer/interior-ai` checkout.

Commit relationship is explicit: CH-0016 implementation
`cbed3550026e2803675f740b49be5fb15f15612b`; CH-0017 starting checkpoint
`cea0cabe53742da8b47c1e119d889033351a1fdf`; the intervening `cea0cabe...`
commit is the separately reviewed `docs/ch-0016-verification-handoff`
documentation checkpoint (five documentation files, no production change);
CH-0017 implementation `c840c06dc2c5e67f463542292bb7391b0f93d731`;
hardening `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`; Outcome-D follow-up
`701aaa473518a0a4fdbc9cf9809dd8bd1bac918a`; this follow-up is the commit
containing this record.

Authoritative run `30684560486` passed the 42-migration/pre-smoke contracts and
strict build. Required furnished-template smoke then failed after semantic GLB
readiness because its manually duplicated 240-second whole-test timeout expired
during a later body assertion; health/catalog passed, yielding 1 passed, 1
failed, process exit 1, and a correctly failed merge gate. The fix preserves all
selection, bounds, remount, three reload, persistence, render-loop, body, and
terminal lifecycle assertions. A single 14-phase definition totals 585,000 ms;
fixture setup, fixture teardown, assertion scheduling (15,000 ms each), and a
30,000 ms orchestration margin derive a 660,000 ms whole-test timeout. The
production bundle now includes strict portable `runtime-smoke-phases.json`, and
the manifest binds its SHA-256, phase count, elapsed total, and derived timeout.
Focused negatives prove mechanical derivation, phase changes updating the
whole envelope, immediate terminal failure, phase-specific timeout diagnostics,
absence of retry/skip/`test.slow()`, canonical non-overlapping timeline order,
whole-envelope containment, closed timing fields, and non-error passed lifecycle
states. The first two post-fixture phases are truthfully named
`fixture-reload-2d-readiness` and
`initial-glb-loading-and-selection-verification` for the work they run.

The advisory run's 107 passed, 92 failed, and 33 not-run results were
contaminated by the malformed
`gate-a3-ci-google-client-secret-placeholder` and are not a clean product
baseline. One repository-owned synthetic fixture now serves stable and
advisory CI. Its complete non-secret pair is committed once in
`scripts/ci-auth-fixture.json`, outside the application build graph; only its
environment transport is materialized in an explicit non-production CI/test
scope by appending exactly three allowlisted single-line assignments to the
runner-owned `GITHUB_ENV`, after proving its real path is outside the checkout.
The next workflow step validates propagation. Values and paths are absent from
logs and evidence inputs; no `BASH_ENV` or workspace transport is used. It
cannot act as an implicit application
fallback, and canonical environment classification rejects missing, invalid,
and production deployment state. The
preflight runs before browser installation and proved that the advisory Next.js
server returns a structured anonymous `/api/auth/session` JSON response without
auth initialization, HTML 500, `Unexpected token '<'`, or `ClientFetchError`.

The exact unsafe optional input was the flooring `error-context.md` named by the
external preparation log; its prohibited contents were not reproduced here.
Preparation now requires and validates `evidence.json` plus `playwright.json`,
including source SHA, report hash, process exit, project identity, per-test
identities, and truthful passed/failed/skipped/not-run/flaky/retry totals. It
also binds the registered advisory command, exact checkout, 0-255 process exit,
fresh process/report interval, configured project, full validator diagnostics,
and conclusion while requiring every release/artifact identity to remain null.
Safe
text is normalized into a new output layout; no raw `playwright-output/`
directory is uploadable. Optional unsafe, malformed, or binary diagnostics are
omitted with only safe relative path, category, reason code, and original
SHA-256; an unsafe filename is replaced by a stable hashed path identifier.
Unsafe/malformed mandatory JSON still rejects the entire bundle. Final
scanning and publication are atomic and every failure removes staging and final
directories. A representative process-exit-1 report remains downloadable and
truthful with its omission manifest.

Official Gitleaks v2 source confirms it always scans with
`--report-path=results.sarif` and separately honors
`GITLEAKS_ENABLE_UPLOAD_ARTIFACT=false`. CI disables only that automatic
workspace-root upload. Repository staging validates strict SARIF JSON and
portable paths, preserves its exact bytes, records exact source/run identity,
and uploads only root-level `artifact-manifest.json` and `results.sarif` from
`.local/gitleaks-upload/` for 90 days. A future real artifact download must
still verify the ZIP entries. The advisory job's former `needs: stable-checks`
edge was removed only after proving it consumes no stable artifact/output,
database, or environment; `merge-gate` remains exactly dependent on
`secret-scan` and `stable-checks`, so advisory remains nonblocking and separate.

Local validation passed: required-test truthfulness; CH-0016 production
evidence and standalone bundle round trip; auth hardening; live advisory auth
preflight; GLB lifecycle/bounds; cabinetry release evidence; complete critical
required and floor-plan required umbrellas; typecheck; targeted ESLint with
zero warnings; code-quality ratchets (1,012 production files, 198 size and 554
function-debt baselines, 20 suppressions, no cycle/unsafe-TypeScript regression);
generated surface-runtime drift; strict 1,613-file/283,251,305-byte asset
inventory; catalog asset availability; and diff hygiene. A focused development
runtime run completed every lifecycle/reload phase in about two minutes, then
correctly failed only its final console-error assertion because its deliberately
nonexistent fallback database returned two 500s; it was not represented as the
required pass. The final clean detached production build, 42-migration isolated
database, 2/2 smoke, phase timing, stable bundle, standalone verification,
advisory safe-subset fixture, and artifact hashes are recorded in the final
local response after the commit is created.

Independent read-only review initially found and verified fixes for: a tracked
Playwright last-run artifact, now omitted as hashed redundant rerun state rather
than claimed as uploaded evidence; terminal GLB state being masked while response
counts were polled; phase records without closed fields, non-overlap, whole-test
containment, or passed-lifecycle consistency; the complete OAuth pair entering
the application build graph; raw `APP_ENV` checks bypassing the canonical Vercel
deployment classifier; advisory pairs not binding command, exact checkout,
project, process/report conclusion, diagnostics, freshness, or null release
identity; secret-shaped optional filenames escaping into the omission inventory;
and phase names that did not match their actual work. After the fixes and focused
reruns, the reviewer returned **PASS — no remaining actionable CH-0017 findings**
on the complete diff. Its final read-only checks also passed diff hygiene, Node
syntax for changed/new `.mjs` files, JSON parsing, and transient-output cleanup.

Inherited and out of scope: catalog audit still has five enum failures across
the same three Hamilton YAML files. Existing full-lint/design-cleanup/Pro visual
failures from the previous handoff were not modified or reclassified. GitHub
workflow execution/retention and enforcement are still external: ruleset
`13671593` does not require `merge-gate`; advisory is correctly not required.
CH-0004 remains paused.

Rollback order is the commit containing this record, then
`701aaa473518a0a4fdbc9cf9809dd8bd1bac918a`, then
`b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then
`c840c06dc2c5e67f463542292bb7391b0f93d731`. This is emergency rollback only:
it would restore the undersized timeout, contaminated advisory auth, missing
safe failure evidence, runner-prefixed SARIF, and earlier false-pass paths.

## CH-0017 exact-head 8cb7cae Outcome-C follow-up — 2026-08-02

Scope remains CH-0017 only. GitHub Actions run `30707099465`, exact PR head
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, established Outcome C. Stable job
`91387983537` failed in `Run runtime smoke tests` because
`bounds-verification` reached its 20,000 ms phase ceiling; the always-run
`Upload smoke diagnostics` step then also failed because no stable bundle was
eligible. The runner metadata for steps after `Configure synthetic CI OAuth
fixture` exposed the unmasked values of `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `CI_AUTH_FIXTURE_ACTIVE`. No value is reproduced in
this record. The pair was synthetic, generated from the earlier repository
fixture rather than a GitHub repository or organization secret, and was not a
registered Google client/secret capable of external authentication.

The bounds assertions and synchronization are unchanged. Three clean CI-like
executions against an isolated 42-migration PostgreSQL database all completed
2/2 with process exit 0 and zero failed, flaky, skipped, or retried tests:

| Run | Phase start (relative) | Phase end (relative) | Elapsed | Lifecycle/completion | Complete test body |
| --- | ---: | ---: | ---: | --- | ---: |
| 1 | 29,192 ms | 36,668 ms | 7,476 ms | `stable`; settled bounds stayed unchanged | 119,946 ms |
| 2 | 29,685 ms | 36,793 ms | 7,108 ms | `stable`; settled bounds stayed unchanged | 123,137 ms |
| 3 | 29,579 ms | 36,832 ms | 7,253 ms | `stable`; settled bounds stayed unchanged | 119,869 ms |

The canonical bounds budget is now 45,000 ms. It leaves 37,524 ms headroom
above the slowest clean local observation and a bounded CI-contention margin
above the externally exhausted 20-second ceiling. The maximum sequential phase
sum is 610,000 ms; the unchanged named 75,000 ms setup, teardown, assertion,
and orchestration allowances mechanically derive a 685,000 ms whole-test
timeout. Semantic GLB readiness, selection and bounds assertions, remount, all
three reloads, persistence, render-loop assertions, retries=0, and terminal
error fail-fast remain intact. Contract negatives lock the one canonical
budget, derivation, phase-specific timeout/safe state, immediate terminal
failure, and absence of retry or skip.

The OAuth policy file now contains only an inert runtime-generation policy.
The exporter creates a fresh nonce-bound client/secret pair in memory, registers
both exact values with GitHub `add-mask` workflow commands, and only then appends
the three fixed allowlisted single-line assignments to runner-owned
`GITHUB_ENV`. It never routes values through workflow YAML, command arguments,
`GITHUB_OUTPUT`, job outputs, `GITHUB_STEP_SUMMARY`, artifacts, evidence
manifests, or JSON diagnostics. Structural validation in the following step and
the advisory `/api/auth/session` JSON preflight remain fail closed. Application
validation accepts the pair only when both nonce fingerprints match, explicit
CI/test activation is present, and the canonical environment is development or
staging; production and implicit/malformed use fail before browser execution.
The retired fixed fixture shape is rejected in every environment so stale
configuration cannot be reclassified as ordinary Google credentials.

Independent read-only review found one fail-closed regression before commit:
the retired fixed fixture pair could otherwise have passed the generic Google
shape validators after runtime generation replaced it. The accepted correction
rejects either retired marker half in every environment and adds production and
non-activated-development negatives. The reviewer then rechecked the complete
ten-file diff, assertion preservation, timeout math, transport ordering,
production exclusion, `.mjs` syntax, and diff hygiene and returned **PASS — no
remaining actionable CH-0017 findings**.

Rollback this Outcome-C follow-up first, then
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, then the previously recorded
CH-0017 commits. That rollback would restore the externally demonstrated
undersized phase budget and unmasked transport and is therefore emergency-only.
Ruleset `13671593` remains active with the same pull-request/thread-resolution
policy and no required-status-check rule. No ruleset, PR state, deployment,
product, schema, migration, dependency, catalog, or production data was changed;
CH-0004 remains paused.

## CH-0017 required/advisory workflow separation — 2026-08-02

Starting commit `53a0c98bab4d5a211c93fd1f4f5057806e074bbd` was clean and one commit ahead of
the remote CH-0017 branch. Before this workflow-only follow-up,
`.github/workflows/ci.yml` launched `secret-scan`, `stable-checks`, the complete
`e2e-full` inventory, and `merge-gate` on every ordinary PR synchronize. The
aggregation graph already excluded `e2e-full`, but the roughly two-hour suite
still ran for narrow updates and shared the required workflow's cancellation
group.

The required PR workflow now contains only `secret-scan`, `stable-checks`, and
`merge-gate`; aggregation still needs exactly the first two. Stable checks keep
the complete existing required lane and now run the structured auth-session
preflight plus auth/evidence hardening before the expensive build, and verify a
fresh extraction of the standalone production evidence bundle after smoke. The
existing truthfulness suite is the lightweight advisory-contract preflight: it
tests mask-before-`GITHUB_ENV`, no checkout transport, representative failing
advisory evidence, truthful safe retention/omission, exact archive inventory,
and prohibited credential/environment/path/content rejection without running
the broad browser suite.

The unchanged full runner moved to
`.github/workflows/full-advisory-e2e.yml`. It runs deliberately by exact-SHA
`workflow_dispatch`, adding PR label `run-full-e2e`, or a nightly staging
checkout. Ordinary synchronize is not a trigger. A pre-browser step verifies
the actual checkout against the PR head or required manual SHA; scheduled runs
record resolved staging HEAD. Its separate `full-advisory-*` concurrency group
can cancel only an obsolete advisory run for the same PR/ref. The separate job
has no `continue-on-error`: child failures remain failed but non-required,
cancellation remains cancelled, and safe evidence preparation/upload remains
unchanged. The manifest now owns this workflow path explicitly, so missing or
renamed workflow/job/step fails validation. No gate/source moved: 21 gates and
365 classified sources remain.

Rollback the workflow-only commit containing this record first, then
`53a0c98bab4d5a211c93fd1f4f5057806e074bbd` and the previously documented
CH-0017 order. No application, test identity, expectation, ruleset, PR,
deployment, schema, migration, dependency, catalog, product, or production-data
state changed. No push is included; CH-0004 remains paused.

## CH-0017 exact-head d295 reload phase-contract follow-up — 2026-08-02

Scope remains CH-0017 only. Exact-head GitHub execution at
`d295e98c4abe3b00d02507cc3820df20439b2134` verified the frozen checkout,
workspace isolation, OAuth masking, Gitleaks identity, truthfulness manifest,
diagnostic upload, required/advisory separation, and aggregation controls up to
required runtime smoke. The furnished-template identity then failed reload-1
at 70,001/70,000 ms. Artifact `8828579681` was safe and source-bound, but its
timing record said only that remount was the last completed phase and its coarse
final lifecycle was `ready`. It contained no reload URL, current design
identity, room/item counts, per-model lifecycle counts, selection/bounds or
hydration state, outstanding requests, browser/server errors, or safe progress
timeline. Therefore it cannot prove final-ten-second progress, near-readiness,
or an unsurfaced terminal state.

Classification is **A — CH-0017 PHASE-BUDGET DEFECT**. Before this correction,
each 70,000 ms reload enclosed 311,000 ms of configured finite sequential waits:
60,000 ms navigation; 30,000 ms canvas; 5,000 ms room lookup; 30,000 ms item
lookup; 30,000 ms view activation; up to 70,000 ms model responses; up to
70,000 ms semantic diagnostics; 5,000 ms body state; 10,000 ms settling; and
1,000 ms post-settle observation. A browser evaluation also lacked its own
finite bound. Reload-2 and reload-3 were identical copies of the same invalid
contract. No authoritative product SLO makes 70 seconds a correctness limit;
the existing product metric remains observation-before-target. All GLBs used by
the fixture are checked-in root-relative production assets with embedded
content, not uncontrolled external URLs, CDNs, or services.

The one canonical furnished-template contract now derives all 14 parent
budgets from named nested operations plus explicit margins. All three reloads
share a 236,000 ms legal operation envelope—60,000 ms navigation, 30,000 ms
bootstrap, 30,000 ms view-state read, 30,000 ms view activation, one combined
70,000 ms model-response and semantic-readiness observation, 5,000 ms body
assertion, 10,000 ms settle, and 1,000 ms post-settle observation—plus 30,000 ms
orchestration margin, for 266,000 ms.
The combined model loop removes duplicate serial observation without removing
an assertion. A separate non-failing 70,000 ms performance threshold records
the measured duration. Safe checkpoints reset a 75,000 ms no-progress timer;
terminal GLB lifecycle errors remain immediate failures. Bounds now derive to
71,000 ms and remount to 165,000 ms. The complete 1,957,000 ms sequential phase
sum plus 75,000 ms named setup/teardown/assertion/orchestration overhead derives
the 2,032,000 ms whole-test timeout. Retries and skips remain zero; selection,
bounds, remount, three reloads, persistence, render-loop, and final-body
assertions remain required.

Three clean CI-like executions used an isolated PostgreSQL database with all 42
migrations and passed furnished-template plus health/catalog 2/2 with process
exit 0. Long-phase measurements were:

| Run | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,199/71,000 | 12,677/165,000 | 28,099/266,000 | 24,521/266,000 | 23,637/266,000 |
| 2 | 7,111/71,000 | 11,923/165,000 | 23,416/266,000 | 24,294/266,000 | 22,141/266,000 |
| 3 | 7,502/71,000 | 11,911/165,000 | 24,737/266,000 | 23,113/266,000 | 23,189/266,000 |

Every phase completed with terminal `phase-complete` evidence, each reload
retained at least 12 safe checkpoints beginning at `not-observed`, no
performance warning fired, and no terminal
lifecycle error occurred. Focused contract, production-artifact, truthfulness,
GLB bounds, persistence, scene-boundary/layer, typecheck, zero-warning ESLint,
syntax, and diff-hygiene checks passed. The independent reviewer record and
detached exact-commit production build/smoke/bundle/standalone-verification
result are recorded in the final local report for the commit containing this
entry.

The first independent implementation review found three actionable contract
gaps before commit: sequential click/assertion waits reused one named timeout
and could consume the claimed orchestration margin; reload phase-start evidence
could inherit the prior phase's `stable` lifecycle; and the v2 validator lacked
negative mutations of its new warning/checkpoint fields. The correction splits
every affected sequential wait into its own named budget, adds initial-GLB
checkpoints so the no-progress watchdog cannot truncate a legal child envelope,
resets every reload to `not-observed`, rejects late post-failure checkpoints,
and adds wrong-warning, unsafe-checkpoint, missing-phase-complete, and operation-
consumption regressions. A final review also found that partial ready diagnostics
with missing peers could be labeled aggregate `ready`; one shared aggregate
lifecycle helper now permits `ready` only when every expected diagnostic and
required response satisfies the full readiness predicate, with a focused
partial-ready/missing-model negative. The three clean smoke executions above were rerun only
after these corrections; the tracked Playwright last-run marker was restored.
The final read-only review inspected the complete eight-file diff and returned
**PASS — no remaining actionable CH-0017 findings**.

Rollback the single phase-contract commit containing this entry before the
earlier CH-0017 commits. No workflow trigger, evidence identity, auth control,
ruleset, PR state, deployment, product behavior, schema, migration, dependency,
catalog, or production data changes are included. No push is included; a new
exact-head required run and unchanged-ruleset verification are still required,
and CH-0004 remains paused.

## CH-0017 pre-push reload-envelope reconciliation — 2026-08-02

The authorized pre-push gate for commit
`31766eba834ad26a99953a8cad8d6ea3bad7c1d0` stopped the push before any remote
mutation. PR `#27` remained open, draft, and targeted at `staging`; its remote
head remained `d295e98c4abe3b00d02507cc3820df20439b2134`. Ruleset `13671593` remained
active and unchanged with only the `pull_request` rule, zero required approvals,
and required review-thread resolution. No workflow or full advisory run was
triggered.

The original 311,000 ms figure and the final legal reload envelope reconcile as
follows:

| Operation | Old bound/classification | Corrected bound/classification |
| --- | ---: | ---: |
| Navigation/reload | 60,000 ms sequential | 60,000 ms sequential |
| Scene canvas | 30,000 ms sequential | concurrent inside one 30,000 ms bootstrap bound |
| Room restoration | 5,000 ms sequential | concurrent with scene canvas; no additive bound |
| Local hydration identity | outside the old 311,000 ms; evaluation unbounded | 5,000 ms sequential, bounded operation |
| 3D view state read | 30,000 ms sequential | 30,000 ms sequential |
| Conditional 3D activation | 30,000 ms mutually exclusive with the already-active branch, but sequential in the worst branch | 30,000 ms worst-branch sequential |
| Model response observation | 70,000 ms sequential | replaced by one combined 70,000 ms wall-clock operation |
| Semantic model readiness | 70,000 ms sequential | concurrent in the combined model-response/readiness operation; no second 70,000 ms |
| Body error assertion | 5,000 ms sequential | 5,000 ms sequential |
| Diagnostic settling | 10,000 ms sample-count loop with unbounded evaluations | 10,000 ms sequential elapsed-time operation with every evaluation bounded by remaining time |
| Post-settle observation | 1,000 ms sequential | 1,000 ms sequential |
| Final diagnostic snapshot | outside the old 311,000 ms; evaluation unbounded | 5,000 ms sequential, bounded operation |

The old finite sum is 60,000 + 30,000 + 5,000 + 30,000 + 30,000 + 70,000 +
70,000 + 5,000 + 10,000 + 1,000 = 311,000 ms, plus unbounded diagnostic
evaluations. The first 236,000 ms replacement was not mechanically sufficient:
it omitted bounded ownership for hydration/final snapshots and its settle/read
helpers did not enforce the declared wall clock. The pre-push gate therefore
correctly refused to push it. The corrected maximum legal sequential envelope
is 60,000 + 30,000 + 5,000 + 30,000 + 30,000 + 70,000 + 5,000 + 10,000 +
1,000 + 5,000 = **246,000 ms**. A 30,000 ms orchestration margin derives each
reload parent at 276,000 ms. All three reloads consume the same contract.

The complete phase sum is now 1,987,000 ms; 75,000 ms named whole-test overhead
derives a 2,062,000 ms test-body timeout. That test-body timeout deliberately
does not include server startup or post-test evidence work. Playwright has no
finite `globalTimeout`; its independent web-server startup allowance is 120,000
ms. The evidence runner's Playwright child process and the runtime-smoke GitHub
step have no smaller shell/step timeout. The stable job has no explicit timeout
override and therefore retains GitHub's 360-minute job ceiling, leaving more
than 325 minutes beyond the 34-minute-22-second test-body envelope for startup,
report/evidence finalization, cleanup, and the other stable steps. The separate
20-minute floor-plan step occurs later and does not enclose runtime smoke.

Three clean CI-like runs against a fresh database with all 42 migrations passed
both identities 2/2 with process exit 0, no retries/skips, no performance
warning, no watchdog, and no terminal lifecycle error:

| Run | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,253/71,000 | 12,203/165,000 | 23,711/276,000 | 21,746/276,000 | 22,519/276,000 |
| 2 | 7,292/71,000 | 11,908/165,000 | 25,016/276,000 | 23,647/276,000 | 23,453/276,000 |
| 3 | 7,365/71,000 | 12,330/165,000 | 23,099/276,000 | 23,676/276,000 | 22,743/276,000 |

This follow-up changes only the reload timing/evidence contract, focused
negative tests, and CH-0017 documentation. It is local only. A new commit SHA
must receive separate authorization before any push or external run. No
ruleset, PR, workflow, deployment, secret, environment, database setting, or
other external control changed; CH-0004 remains paused.

## CH-0017 nested runtime-timeout provenance correction — 2026-08-02

Scope remains CH-0017 only. Exact-head run at
`7a58b5aca0350f2500d12922e4684841625dfbfa` exposed one remaining truthfulness
defect: `bounds-verification` reported a parent phase timeout even though the
expired bound belonged to its nested `diagnostics-settle` operation. The helper
created `RuntimeSmokePhaseTimeoutError` with the child budget, and the recorder
then classified every instance by error class as `phase-timeout`, discarded the
operation identity, and marked the parent `timed-out`. No later wrapper caused
the ambiguity; it originated at the nested timeout helper and was flattened by
the phase recorder.

The correction introduces one closed structured failure-provenance contract for
`phase-timeout`, `nested-operation-timeout`, `no-progress-watchdog`,
`terminal-lifecycle-error`, `assertion-failure`, and `unexpected-error`.
Nested-operation expiry records the phase ID and parent elapsed/budget, operation
ID and elapsed/budget, last safe checkpoint, lifecycle state, progress status,
and a safe original-cause summary; the operation is `timed-out` while its parent
phase is `failed`. A true phase deadline has no invented operation identity and
keeps parent outcome `timed-out`. The no-progress and terminal paths keep their
own outcomes, while Node and Playwright matcher assertions remain assertion
failures. The version-3 timing validator rejects missing or unknown identities,
budget drift, parent/child outcome contradictions, top-level/phase disagreement,
unsafe cause fields, and legacy version-2 ambiguous records.

The settle operation and each browser evaluation have separate canonical
identities. An evaluation that exhausts its 10,000 ms child bound remains
`diagnostics-settle-evaluation`; it is never relabeled as though the 42,000 ms
parent settle operation expired. Only actual exhaustion of the parent emits
`diagnostics-settle`. No-progress evidence retains and validates its canonical
watchdog budget and originating phase. Every non-phase-timeout failure must fit
inside the parent phase budget.

The settle arithmetic is derived from the actual work: one immediate baseline
evaluation plus two required stable samples at 500 ms intervals means three
bounded browser evaluations. At 10,000 ms per evaluation, 1,000 ms assertion
allowance, and 10,000 ms orchestration margin, the legal operation budget is
42,000 ms (32,000 ms sequential envelope plus margin), not the former 10,000
ms. `bounds-verification` is therefore 103,000 ms and each reload phase is
308,000 ms. The complete sequential phase sum is 2,115,000 ms; the existing
75,000 ms named overhead derives a 2,190,000 ms whole-test timeout. Performance
warning thresholds, retries, skips, assertions, terminal fail-fast behavior,
and the 75,000 ms no-progress watchdog are unchanged.

Stable failure handling now validates the semantic report/timing pair before
staging diagnostic evidence. A genuine, internally consistent runtime failure
may produce the existing exact three-file safe diagnostic archive; contradictory
or ambiguous records fail closed and withhold upload. The standalone production
evidence verifier binds the structured failure to the tested source, artifact,
report hash, process status, and failed test identity. Success evidence still
requires a complete failure-free timing record.

That pre-upload verifier runs the full production-evidence identity validation:
canonical manifest and sidecar, exact clean checkout, recomputed artifact and
BUILD_ID, canonical commands/server, and Playwright production metadata. A
coherently substituted manifest/test identity cannot pass against an unchanged
checkout, artifact, or report.

Three clean CI-like executions against separate databases with all 42
migrations passed both runtime identities 2/2, with no retries/skips,
performance warning, watchdog, terminal error, or failure provenance:

| Run | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 | 7,231/103,000 | 12,042/165,000 | 23,430/308,000 | 23,577/308,000 | 22,859/308,000 |
| 8 | 7,562/103,000 | 11,556/165,000 | 23,349/308,000 | 22,222/308,000 | 22,323/308,000 |
| 9 | 7,119/103,000 | 11,477/165,000 | 24,363/308,000 | 22,705/308,000 | 22,174/308,000 |

An earlier isolated run reached an existing `verify-selection` product
assertion instead of a timeout. It was not counted among the three clean runs,
was not repaired or reclassified, and confirmed that a structured Playwright
matcher error is retained as `assertion-failure` rather than
`unexpected-error`. No inherited product failure is claimed fixed.

The independent read-only implementation review first found missing full
checkout/artifact/report binding in failure staging, leaf-versus-parent settle
timeout ambiguity, incomplete watchdog provenance, async negative-test misuse,
and terminal/non-phase containment gaps. All valid findings were corrected and
the affected suites and three runtime smokes were rerun. Final disposition:
**PASS — no remaining actionable CH-0017 findings**.

This correction changes only runtime failure/timing evidence, its focused
validators/tests, workflow staging order, and these CH-0017 records. It does not
change the staging ruleset, required-check configuration, workflow trigger, PR
state, application behavior, schema, migration, dependency, deployment, or
secret. CH-0004 remains paused. The single local commit containing this entry
requires separate authorization before any push or exact-head external run.

## CH-0017 canonical operation-budget provenance correction — 2026-08-02

Exact-head run at `bc26cb18d7de7a99f3a36e2c57751979f2dbde25`
exposed one producer defect after the version-3 validator correctly rejected
the result. `waitForReloadModelsReady` started the registered 70,000 ms
`model-responses-and-readiness` operation, but the diagnostic-read helper
accepted one ambiguous raw timeout. A read beginning about 4,493 ms later was
given the 65,507 ms remaining allowance; the helper restarted its clock and
used that allowance as `operationBudgetMs`. The rejected test record then left
the safe failure-diagnostic producer without a canonical input.

The replacement API gives every registered operation one frozen deadline with
its phase/operation identity, canonical contract budget, start, and deadline.
Each polling iteration derives a branded attempt whose `attemptTimeoutMs` and
`remainingAtAttemptStartMs` may decrease. A structured timeout can be created
only from that attempt: `operationElapsedMs` comes from the canonical start and
`operationBudgetMs` comes from the registered contract. Callers can no longer
construct the timeout by supplying an arbitrary budget. Independent leaf
operations such as `diagnostics-settle-evaluation` retain their own registered
10,000 ms identity; exhaustion of the enclosing settle deadline remains the
42,000 ms `diagnostics-settle` operation.

The closed schema-v3 failure object now also carries the two attempt fields and
rejects attempt/remaining values that exceed one another or the registered
canonical budget. Deterministic regression coverage reproduces a 70,000 ms
canonical operation with a 65,507 ms attempt, validates reload-1 as a failed
308,000 ms parent with `nested-operation-timeout`, and separately rejects the
old 65,507-as-canonical representation. It also proves changing polling
allowances, the 42,000/10,000 settle boundary, true phase timeout, 75,000 ms
watchdog, terminal failure, assertion failure, exact safe three-file staging,
and stable-evidence withholding.

No timeout value changed: settle remains 42,000 ms, bounds 103,000 ms, combined
reload readiness 70,000 ms, each reload 308,000 ms, the whole test 2,190,000
ms, and the reload no-progress watchdog 75,000 ms. Retries remain zero and all
three reloads, selection, bounds, persistence, render-loop, terminal-error, and
final-state assertions remain intact. This correction changes no product code,
workflow trigger, ruleset, required check, PR state, deployment, migration,
dependency, or secret. CH-0004 remains paused and pushing still requires
separate authorization.

Final isolated-database focused runtime validation passed both required
identities 2/2 with no failure provenance: bounds used 7,344/103,000 ms and the
three reloads used 23,930, 23,443, and 23,625/308,000 ms. Production-evidence,
required-test truthfulness, auth hardening, GLB bounds/lifecycle, typecheck,
targeted zero-warning lint, JavaScript syntax, and tracked/untracked diff
hygiene also passed. The independent read-only review first found a public raw
branding escape hatch, missing split-module bundle/source ownership, and a
missing capped-poll assertion. All were corrected; final disposition was
**PASS — no actionable findings**.

## CH-0028 first-reload model readiness convergence — 2026-08-02

This bounded runtime finding is separate from CH-0017. The branch
`fix/ch-0028-reload-model-readiness` was created from exact clean source
`8e0260f5654126ec21b669d0471bcfb3c0f5cf5b`. Before edits, PR #27 was open,
draft, targeted `staging`, and still pointed to the frozen source; `lsof`
resolved the port-3000 Node listener to the canonical
`/Users/justus/Developer/interior-ai` checkout. CH-0020 through CH-0027 were
already assigned globally, so the next unused ID is CH-0028.

### Authoritative condition and classification

Required run `30745386331` truthfully reported furnished-template failed,
health/catalog passed, retries 0, and process exit 1. Reload 1 ended failed at
76,043/308,000 ms because `model-responses-and-readiness` expired at
70,001/70,000 ms (64,679 ms last attempt allowance). All nine responses were
complete, required responses were six, outstanding responses were zero, and
the lifecycle retained three loading / zero ready / zero terminal error.

The exact records were:

| Key | Product / variant | URL / safe hash |
| --- | --- | --- |
| `runtime-smoke-model-1` | `sofa-real-castlery-dawson-ottoman` / `runtime-smoke-sofa-real-castlery-dawson-ottoman` | `/assets/models/sofa-real-castlery-dawson-ottoman.glb` / `fnv1a-09942d68` |
| `runtime-smoke-model-2` | `sofa-real-castlery-jaron-3s` / `runtime-smoke-sofa-real-castlery-jaron-3s` | `/assets/models/sofa-real-castlery-jaron-3s.glb` / `fnv1a-a7623e72` |
| `runtime-smoke-model-3` | `sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` / `runtime-smoke-sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` | `/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb` / `fnv1a-3fa7f0e6` |

Classification is **F — genuine performance condition**. Exact safe
key/mount/generation/stage tracing proved that the current required identities
progress through response, parse, normalization, material, bounds, attachment,
and ready on the controlled production path. It found no stale generation,
unmounted blocker, ignored current callback, optional-entry contamination,
cache-hit transition gap, terminal error, or registry growth. Pre-fix source
created new loader work and repeated parse/decode, geometry/material cloning,
normalization, and bounds work during the forced 2D→3D remount. The external
nine-versus-six response count is direct evidence of that extra generation.
The external artifact retained aggregate loading rather than exact
post-response stages. Completion of those stages on controlled same-path
production traces, combined with the external response timing, supports the F
classification; it is not presented as a retained external stage trace.

### Remediation and lifecycle result

Before: each forced remount started a new GLTF loader and repeated the complete
prepared-scene pipeline. Safe diagnostics exposed aggregate state but did not
bind every stage to exact required current-generation identity.

After: `useGLBModelLifecycle` owns exact lifecycle identity and
`modelDiagnostics` remains its only registry. A ref-counted 32-entry parsed
cache shares URL-backed results; a separate 32-entry prepared cache shares
equivalent normalized geometry/material and local bounds only for models
without external variant texture maps. Failed loads evict, inactive LRU entries
prune, resources dispose once per cache entry, prepared entries retain their
source lease, and `pagehide` clears prepared before parsed resources. Cache
hits emit equivalent response/parse/normalize/bounds stages and never seed
ready. True reloads create new document generations and perform real responses.

Unmount and supersession explicitly terminalize old records as non-blocking
`cancelled`; stale handles cannot mutate a newer mount. Required readiness is
checked against exact key/mount/generation identities and the stable complete
active-required-key set. Closed safe stages identify post-response work, and
closed error categories terminalize loader/import/parse, normalization,
material, bounds/empty-bounds, and attachment failure reports.

### Validation

Focused passes:

- lifecycle contract: network/cache ready, unmount cancellation,
  supersession/stale rejection, current completion, duplicate URL/distinct
  identity, optional scoping, terminal categories, three generations, no
  registry growth;
- bounded resource cache: concurrent dedupe, cached remount, failure eviction,
  inactive LRU pruning, ref ownership, one disposal path, clear;
- GLB local bounds/normalization and requested-design persistence umbrella;
- production-artifact evidence and required-test truthfulness with the frozen
  manifest/hash unchanged;
- typecheck, targeted ESLint with zero warnings, code-quality ratchet, and
  `git diff --check`;
- strict production build; the inherited broad Turbopack/NFT floor-plan trace
  warning remains separate and unchanged;
- focused production smoke 2/2 with all three reloads and
  zero retry/skip/failure.

Three CI-like production smokes used separate databases, each newly created and
verified at 42 completed migrations. Every run passed furnished-template and
health/catalog 2/2, with exit 0, no failed/flaky/skipped/retried cases, no
performance warning, no stale loading identity, and the expected registry size:

| Run | Semantic | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,159/80,000 | 6,823/103,000 | 10,572/165,000 | 19,917/308,000 | 21,581/308,000 | 22,064/308,000 |
| 2 | 7,309/80,000 | 6,894/103,000 | 10,864/165,000 | 22,939/308,000 | 21,064/308,000 | 21,311/308,000 |
| 3 | 6,815/80,000 | 6,861/103,000 | 11,294/165,000 | 21,414/308,000 | 21,210/308,000 | 20,404/308,000 |

The first ready checkpoints in the three reloads retained explicit 8-ready,
0-loading, 0-error complete active-required states, while the three exact
response fixtures retained cumulative real response counts 6, 9, and 12.
The 70,000 ms nested budget, 308,000 ms parent budget, three reloads, response
requirements, zero retries/skips, and all selection, bounds, persistence,
remount, render-loop, and final-state assertions remain unchanged.

Independent complete-diff review disposition is **PASS — no actionable
findings**. The reviewer verified metadata-only updates, configuration-bound
attempt identity, full active-required gating plus exact fixture assertions,
material and attachment terminal emitters, absorbing terminal state, bounded
inactive diagnostics, stale resource/material suppression, bounds error
classification, BFCache cleanup, and external-fact versus controlled-inference
wording. The reviewer reran the lifecycle/cache/bounds checks and
`git diff --check`, made no edits, and ran no browser suite. The one focused
commit containing this entry cannot contain its own content-derived SHA.
Therefore the resolved SHA, detached exact-commit production
build/smoke/bundle/standalone verification, final worktree status, and reviewer
disposition are reported after commit in the final Codex response.

No Full E2E, timeout increase, CH-0004 work, CH-0017 evidence change, workflow
or ruleset mutation, push, PR update, merge, deployment, dependency, schema,
migration, catalog, production data, or user-content change is included.
Rollback is one `git revert` of the CH-0028 commit; no data rollback exists.

## CH-0028 post-readiness cache snapshot follow-up — 2026-08-02

This entry supersedes the CH-0028 status above without modifying CH-0017.
The follow-up began from exact source
`c0ccd0d5f4c4d20b058712e4c6e20c3146f02068` on
`fix/ch-0028-reload-model-readiness`. The active Node listener's working
directory matched `/Users/justus/Developer/interior-ai` before edits. No PR,
workflow, ruleset, deployment, timeout, retry, skip, schema, migration,
dependency, catalog, CH-0004, or Full E2E action was taken.

### Authoritative failure and exact classification

Required-only run `30752899319` reached 8 ready / 0 loading / 0 error, the
expected six cumulative fixture responses on reload 1, exact Dawson/Jaron/
Auburn identities, current reload generation, registry-size equality, and
stable active-required keys. Semantic readiness used 13,533 ms, bounds 40,109
ms, remount 58,849 ms, reload 1 119,031 ms, models-ready approximately 71,352
ms from reload start, and bounds-settled approximately 109,629 ms. The final
diagnostic snapshot then exceeded its unchanged canonical 5,000 ms operation
budget. Safe failure artifact `8835124580` contained exactly three JSON files,
was source-bound to `c0ccd0d5f4c4d20b058712e4c6e20c3146f02068`, and correctly withheld stable
evidence.

The failure is classified exactly as **B — browser main-thread starvation**.
The external artifact did not contain callback-entry/computation/serialization
milestones, so the five-second total alone was not used. Instead, the retained
phase evidence showed that prior browser-evaluation callbacks were delayed:
models-ready was observed around 71.3 seconds, the next diagnostic sample
around 98.5 seconds, and bounds-settled around 109.6 seconds. The new required
path separately records host request, in-page callback entry, computation
start/end, explicit JSON serialization completion, and host receipt; safe
failure-path checkpoints retain the last reached milestone even when no result
returns. Across the final nine clean local reloads, host-to-callback scheduling
used 510–674 ms, snapshot computation 0–0.2 ms (0–1 ms at wall-clock
precision), serialization 0 ms, and result transfer 255–448 ms. The in-page
event-loop probe independently recorded 9,557.2–11,320.3 ms stalls. This
excludes snapshot execution,
registry convergence, payload serialization, and stale-source observation as
the primary failure.

### Required snapshot and cache proof

`modelDiagnostics` remains the single lifecycle registry owner. The parsed and
prepared caches now expose synchronous read-only inspections; no second cache
or lifecycle store exists. Schema `interior-ai.glb-required-snapshot.v1`
exports only safe identities/hashes, reload generation and mutation epochs,
active-required state, closed per-model stages/timings, separate parsed and
prepared per-model hit-or-miss outcomes, cache metadata and counters,
refcounts, and consistency results. It does not traverse or expose
Three.js graphs, clone geometry/materials, recalculate bounds, parse GLBs,
perform network work, update React state, mutate either cache, expose raw cache
keys or raw URLs, or include machine-local/private data. Returned stage-timing
objects are detached from the registry. The runtime smoke no longer
depends on the obsolete rich global for its required proof.

Every post-reload snapshot in all three clean runs proved:

- registry 8, active-required 8, all current and ready;
- parsed cache 8 entries / 13 active references;
- prepared cache 12 entries / 7 active references;
- five zero-reference prepared configuration variants retained within the
  documented 32-entry LRU policy;
- stable entry counts across reloads 1, 2, and 3;
- coherent registry/cache versions, exact internal reference sums, lifecycle
  ownership agreement, nonnegative references, no stale active entry, and no
  terminal error.

The pre-remount semantic baseline was seven prepared entries. The intentional
2D→3D configuration change added five distinct prepared variants, after which
the bounded stable count was 12 rather than a leak. Cumulative real fixture
response totals remained 6, 9, and 12 on the three true document reloads.

### Performance-stage result and threshold semantics

The three fresh 42-migration databases each passed furnished-template and
health/catalog 2/2 with exit 0 and zero failed/flaky/skipped/retried cases:

| Run | Semantic | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,867/80,000 | 6,892/103,000 | 12,537/165,000 | 20,765/308,000 | 20,860/308,000 | 20,708/308,000 |
| 2 | 6,759/80,000 | 6,878/103,000 | 12,210/165,000 | 20,639/308,000 | 22,178/308,000 | 20,251/308,000 |
| 3 | 7,328/80,000 | 7,406/103,000 | 12,186/165,000 | 20,876/308,000 | 20,489/308,000 | 21,029/308,000 |

Across those reloads, per-model maxima were response 696.1 ms, parse/decode
287.7 ms, normalization 8.4 ms, isolated per-instance material/geometry cloning
0.3 ms, material setup 168.5 ms, bounds 4.0 ms,
prerequisite-to-post-commit scene attachment 97.4 ms, and ready publication
0.1 ms. Separate acquisition outcomes proved prepared miss/parsed miss,
prepared miss/parsed hit, and direct parsed hit rather than collapsing them
into one ambiguous status. Disposal, stale-completion, cache state, and active
reference counters did not identify a leak or long pipeline stage. Per-stage
event-loop samples are observations captured at the same stage boundary, not
causal attribution; historical Resource Timing response ends carry a null loop
sample. The measured performance category is **main-thread scheduling**,
amplified on the constrained external runner. CI CPU contention is a plausible
contributor to that amplification, but the evidence does not justify claiming
it as the only cause.

There are two distinct 70-second values and neither changed. The canonical
`model-responses-and-readiness` operation retains its hard 70,000 ms budget.
The reload phase separately carries `performanceWarningThresholdMs: 70_000`,
which `runtime-smoke-phase-budget.mjs` explicitly describes as a **non-failing
performance observation threshold**. It is not an authoritative product
performance requirement or an independent release requirement. Therefore
CH-0028 lifecycle/cache correctness can complete while end-to-end latency
remains visible as separate P2 finding **CH-0029 — constrained-runner reload
latency**. CH-0029 is observation-only in this batch; no optimization, cache
policy expansion, threshold change, or workflow mutation is authorized here.

### Validation and remaining external step

Focused lifecycle, resource-cache/refcount, local bounds/remount/isolation,
design-persistence, CH-0017 required-test truthfulness, production-artifact
evidence, typecheck, targeted zero-warning ESLint, code-quality ratchet, strict
production build, and `git diff --check` passed. The strict build retained the
pre-existing Turbopack/NFT floor-plan trace warning. Independent complete-diff
read-only review is **PASS — no remaining actionable findings** after corrections
for exact response/eight-model assertions, raw-URL exclusion, deep snapshot and
prepared-instance isolation, truthful stage/event-loop/attachment timing,
failed-lease ownership, BFCache behavior, monotonic transition time, split
parsed/prepared acquisition outcomes, and production-file ratchets. Final local
validation still requires one focused commit and a detached exact-commit
production evidence proof. After those steps, the exact commit is ready for
another required-only `workflow_dispatch`; no external verification or release
claim is made by this entry.
## CH-0017 monotonic timeout-boundary provenance correction — 2026-08-03

The CH-0028 exact source `fb0e06ee9de1d2fa5126acadd0e1d8073f9adebc`
exposed one remaining CH-0017 producer boundary defect without changing any
canonical budget. The host attempt timer fired after its recorded 65,458 ms
allowance while the separate integer `Date.now()` evidence clock still read
69,999/70,000 ms. `runRuntimeSmokeBoundedOperation` immediately constructed a
canonical timeout without re-reading or proving the canonical deadline, so the
schema-v3 validator correctly rejected the premature record and no safe
three-file diagnostic could be staged.

The operation owner now uses one immutable high-resolution monotonic context
with `operationId`, registered `canonicalBudgetMs`, `monotonicStartedAt`, and
`monotonicDeadlineAt`. Remaining allowance is rounded up only when converted to
the integer host-timer delay, while persisted `operationElapsedMs` is the floor
of retained `operationElapsedPreciseMs`. A canonical timeout additionally
requires `deadlineReached=true`. If a full-remaining attempt fires at the
69,999 ms display boundary, the producer keeps the pending browser task alive
and schedules the residual interval from the same monotonic context; a
materially early capped attempt becomes a distinct internal-attempt failure
instead of canonical expiration.

The final diagnostics-settle leaf can be capped below its own 10,000 ms budget
when the 42,000 ms parent has less time remaining. That leaf now waits for its
own precise attempt boundary, remains explicitly noncanonical, and the settle
handler converts it to the branded parent timeout only after the same monotonic
clock proves the parent deadline. It can no longer bypass parent conversion as
an `unexpected-error` with null operation provenance.

Deterministic fake-clock coverage reproduces the external 65,458 ms attempt at
69,999.75 ms, proves that no timeout is emitted there, advances to 70,000.25 ms,
and validates persisted 70,000/70,000 ms canonical evidence with the reload-1
parent still `failed` at its unchanged 308,000 ms budget. Negative cases retain
rejection of missing identity/deadline proof, early expiration, attempt-budget
substitution, incorrect parent outcome, and report/timing contradictions. The
forced failure path verifies the exact manifest/report/timing archive and
withholds stable evidence. CH-0028 product code, all timeout values, retries,
ruleset, PR state, deployment, and CH-0004 remain untouched.

## CH-0017/CH-0028 combined local integration status — 2026-08-03

- **CH-0017:** TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED —
  IMPLEMENTATION FROZEN at `b06714267b35203185fdd5ba1c189ab74933ffc7`.
- **CH-0028:** OPEN — COMBINED REQUIRED-ONLY EXTERNAL VERIFICATION PENDING.
  The local merge retains the atomic metadata-only required snapshot together
  with the verified monotonic deadline and canonical failure provenance. Local
  evidence alone does not close this finding.
- **CH-0029:** OPEN — END-TO-END RELOAD / MAIN-THREAD SCHEDULING PERFORMANCE.

This integration does not change operation budgets, retries, required/advisory
workflow separation, PR state, rulesets, deployment state, or CH-0004.

## CH-0028 post-readiness browser-admission correction — 2026-08-03

This entry supersedes the earlier CH-0028 final-snapshot classification without
modifying frozen CH-0017. Work began from exact clean source
`af9873253d41901d884e29a09b0b92af17fc2eb6` on
`fix/ch-0028-reload-model-readiness`; before edits, `lsof` confirmed that the
active Node listener's working directory was the canonical
`/Users/justus/Developer/interior-ai` checkout. Required-only run
`30780102332`, artifact `8843450138`, reached reload-1 `models-ready` after
approximately 9.268 seconds with 8 ready / 0 loading / 0 error and exactly six
fixture responses, then retained `models-ready` as its last checkpoint for the
full unchanged 75-second no-progress interval. It never requested the final
required snapshot.

The exact first awaited step was the negative body-text locator assertion. It
ran as a Playwright host promise with a nominal 5,000 ms matcher timeout but no
canonical hard host boundary or browser-entry milestone. A controlled
production run made the blocked boundary conclusive: reload 1 reached
`models-ready` and captured a coherent immediate snapshot at 2,051 ms, invoked
the separate body-state browser call at 2,053 ms, never observed browser
callback entry, and failed at 7,055 ms with the unchanged canonical 5,000 ms
`body-state-assertion` deadline. The safe failure provenance named
`body-state-browser-call-invoked` rather than `models-ready`. This classifies
the cause exactly as **C — browser main-thread starvation**. It is not snapshot
computation, serialization, registry/cache incoherence, stale observation, or
missing progress reporting.

The minimal correction observes the unchanged `Maximum update depth exceeded`
condition inside the atomic metadata callback that already proves readiness,
then performs the required assertion in the existing hard-bounded host
operation after `models-ready`. This removes only the second browser-admission
dependency; it does not skip or weaken the assertion. Each later await now has
truthful started/completed checkpoints, while the immediate diagnostic copy
retains generation, eight active keys, ready/loading/error/stale totals,
response total, per-model last transition, registry size, parsed/prepared
entries and references, and bounded zero-reference retention. The final
required snapshot remains mandatory.

Host and browser timing are recorded separately with relative monotonic
values. Across the final nine reloads, host-observed callback entry ranged from
11 to 10,719 ms and host result receipt from 1,508 to 11,276 ms. Once admitted,
the in-page callback/body computation used 0–0.6 ms and serialization used
0–0.1 ms. One run also observed callback entry at 11 ms followed by host result
receipt at 10,830 ms, independently separating browser execution from host
receipt. The long component is scheduling/admission, while underlying
constrained-runner latency remains the separate CH-0029 performance finding.

Three final-source production-mode smokes used three separate local PostgreSQL
databases, each with all 42 migrations. Every run passed furnished-template
and health/catalog 2/2 with zero failed, flaky, skipped, or retried tests:

| Run | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: |
| 1 | 20,279 ms | 21,685 ms | 20,240 ms |
| 2 | 20,585 ms | 19,484 ms | 19,880 ms |
| 3 | 22,201 ms | 27,956 ms | 28,707 ms |

All nine reloads retained 8 ready / 0 loading / 0 error, cumulative response
totals 6/9/12, both immediate and final snapshots, registry 8, parsed cache 8
entries / 13 references, prepared cache 12 entries / 7 references, and five
bounded zero-reference prepared variants. Focused post-readiness ordering and
failure provenance, lifecycle/snapshot/reload-generation, resource-cache and
refcount, GLB bounds, persistence, frozen CH-0017 truthfulness/deadline,
production-artifact evidence, typecheck, targeted zero-warning ESLint,
code-quality, strict staging build, and diff checks pass. No timeout, retry,
sleep, schema, workflow, ruleset, PR, deployment, migration, dependency,
catalog, cache-policy, CH-0004, or Full E2E change is included. The exact local
follow-up commit still requires detached production proof and required-only
external workflow dispatch before CH-0028 can be closed.

## CH-0029 post-response browser/main-thread starvation — 2026-08-03

This entry supersedes every earlier current-status sentence for CH-0017,
CH-0028, and CH-0029 without rewriting their historical evidence:

- **CH-0017:** TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED —
  IMPLEMENTATION FROZEN.
- **CH-0028:** EXTERNALLY VERIFIED — RESOLVED at verified source
  `db346a51718967bd4dc1605b07c0850e02fd08d1`.
- **CH-0029:** OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION. Local
  remediation is complete; exact-commit required-only external verification
  remains required.

Work began on `fix/ch-0029-main-thread-starvation` from exact clean source
`db346a51718967bd4dc1605b07c0850e02fd08d1`. Before edits, the CH-0028 branch
was synchronized 0/0 with its remote, PR #27 and ruleset 13671593 were read
only and unchanged, and `lsof` confirmed the active Node listener belonged to
the canonical `/Users/justus/Developer/interior-ai` checkout.

### Root evidence and exact owner

Authoritative required-only run `30787561725` had all 6/6 responses complete,
zero outstanding requests, the current generation, eight active required
models, seven at bounds and one at materials, and no terminal error. Parsed
cache was 8 entries / 13 references and prepared cache 12 / 7 with five
bounded zero-reference variants; reference counts were valid and no stale
current entry existed. Work progressed whenever the browser admitted it.
The largest completed heartbeat gap was 11,747 ms, maximum admitted callback
delay 5,281 ms, and the final requested callback never entered. In-page body
computation, callback execution, and serialization were at most 0/3/0 ms.

Bounded instrumentation measured the work before the behavior change. The
matched local run recorded a 10,736 ms long task, approximately 11,010 ms
heartbeat delay, and 11,109 ms callback admission. The long task was correctly
`unattributed`: `r3f-render` accounted for 320 calls, 387.9 ms total, and
148.1 ms maximum, while normalization and bounds remained single-digit
milliseconds. The exact measured owner is therefore the hidden Canvas's
complete mounted per-frame subscriber workload plus renderer/GPU submission,
competing with Playwright trace/video and other host work. The
classification is the permitted inseparable **C/G React/R3F render-work and
host/test-contention cluster**, not a claim that `WebGLRenderer.render`
synchronously blocked for 10.736 seconds.

### Minimal correction and telemetry

`DesignSceneCanvas` now uses demand rendering only while the loading veil
hides the scene, then restores the existing continuous `always` mode before
visible interaction. The stable runtime-smoke spec disables trace and video
locally; global Playwright failure-diagnostic defaults and CH-0017's safe
structured evidence contract remain unchanged. This removes unnecessary
hidden frame and recording concentration without adding a sleep, yield loop,
retry, bypass, or timeout.

A 96-entry bounded metadata ring records fixed categories for callback,
cache, clone, normalization, bounds, material/texture, attachment, render, and
disposal work plus long tasks, heartbeat/frame gaps, safe generation/stage
counts, synchronous-operation concurrency, lifecycle/store/React counters,
and observer overhead. Production collection requires the existing explicit
diagnostic flag. Buffered entries that precede initialization are excluded,
nested task context is detached in snapshots, attribution requires at least
80% measured overlap, and no graph, URL, path, geometry, material, texture,
credential, GLB byte, environment value, or user datum is retained. Focused
measurement recorded 0.5–0.8 ms for 10,000 bounded ring writes.

Lifecycle ordering, current-generation ownership, cancellation, supersession,
terminal failures, cache/refcount behavior, per-item clone isolation, BFCache,
and real reload response generation are unchanged. Telemetry wrappers are
synchronous metadata observations only.

### Production measurements

Three final-code production smokes used three separate local PostgreSQL
databases, each with all 42 migrations. Every run passed furnished-template
and health/catalog 2/2 with zero failed, flaky, skipped, or retried cases:

| Run | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: |
| 1 | 10,196 ms | 10,822 ms | 10,485 ms |
| 2 | 11,262 ms | 10,684 ms | 10,832 ms |
| 3 | 11,354 ms | 10,192 ms | 10,570 ms |

All nine reloads executed and retained cumulative responses 6/9/12, 8 ready /
0 loading / 0 error, current generations, registry coherence, parsed cache
8 entries / 13 references, prepared cache 12 / 7, five bounded zero-reference
variants, nonnegative refcounts, no stale active entries, and the unchanged
70,000 ms model-readiness correctness contract. Across the final pristine
runs, the largest observed heartbeat delay was 6,858 ms and callback admission
6,406 ms; every requested callback entered.

The final controlled-pressure run kept two `yes` processes at approximately
98% CPU each while Chromium was also active. It passed 2/2 with reloads
12,725/11,859/12,048 ms and the same response, lifecycle, cache, and refcount
invariants. Its largest event-loop heartbeat delay was 8,102 ms and admitted
callback delay 7,168 ms. At the readiness observation the longest categorized
task was `r3f-render` at 139 ms; no measured multi-second GLB operation owned
the interval. The pressure result was retained rather than normalized away.

The external heartbeat improved from 11,747 ms to 6,858 ms pristine and
8,102 ms under pressure, and the requested-but-never-entered failure was
eliminated. Callback admission is bounded but its 6,406/7,168 ms maxima are not
numerically below the external 5,281 ms admitted maximum, so no such claim is
made. The longest JavaScript task remains unattributed, and a stricter
user-experience responsiveness target requires a separate product decision.

### Validation, review, and rollback

Focused telemetry, loading-frameloop, smoke-resource isolation, lifecycle,
cache/refcount, generation/supersession, cancellation/unmount, clone/mutation
isolation, GLB bounds, design persistence, CH-0017 truthfulness, production
artifact, typecheck, targeted zero-warning ESLint, code-quality ratchet,
strict production build, and diff hygiene checks pass. The inherited broad
Turbopack/NFT trace warning remains reported. Representative Phase 8 project
budgets pass, but the inherited raw initial-JS gate remains separately red at
7,100,273/6,955,000 bytes and was not repaired. Full E2E was not run.
The frozen 21 gate identities, cadences, and truthfulness semantics are
unchanged; the discovery inventory advanced from 365 to 368 classified sources
because the manifest now includes the three CH-0029 risk-triggered scripts,
for 248 script tests in total.

Independent read-only review is **PASS — no remaining actionable finding**
after five corrections: avoid over-attributing the 10.736-second task; avoid a
false numeric external callback claim; exclude pre-initialization long tasks
and preserve safe maximum-task context; remove an unmeasured invalidation
counter; and deeply detach nested task-stage metadata. The reviewer also
verified lifecycle/cache/cancellation/rendering safety and the spec-local
trace/video boundary.

Rollback is one `git revert` of the focused CH-0029 commit. That restores
continuous hidden-Canvas rendering and stable-smoke trace/video capture; no
data, schema, migration, dependency, cache policy, timeout, retry, workflow,
ruleset, PR, deployment, or CH-0004 rollback exists. The exact commit SHA and
detached exact-commit production proof are reported after the commit because a
commit cannot contain its own content-derived identity. No push is authorized.

## CH-0029 pre-push bundle-gate correction — 2026-08-03

The mandatory pre-push Phase 8 comparison correctly stopped external work for
`696a735a1c3c07125da8e45689611ac16c8b1d4a`. Identical clean detached builds at
Node 24.13.0/npm 11.6.2 measured the CH-0028 base at 7,092,223 raw / 1,166,410
Brotli initial-JS bytes and that first CH-0029 commit at 7,100,281 / 1,168,510,
an explained but avoidable +8,058 raw / +2,100 Brotli regression. The complete
collector had remained eager even though its runtime work was production-gated.
No push or workflow dispatch occurred.

The follow-up correction keeps only a small synchronous facade in the initial
graph and loads the complete collector through an explicit diagnostics-only
dynamic import. A repeated clean detached comparison measures 7,096,918 raw /
1,168,050 Brotli, or +4,695 raw / +1,640 Brotli from the CH-0028 base. Both
builds contain 26 initial JavaScript chunks. The independently identified full
collector is `1a39505_z1u2r.js` at 6,205 bytes and does not occur in the
`/design` client-reference manifest. The only newly introduced initial module
is the minimal facade; its required 96-event bootstrap ring and five capped
counters plus the truthful bootstrap epoch explain the +780 raw / +256 Brotli
increase over the pre-review lazy
candidate. The collector's long-task/frame observers, aggregate state, bounded
evidence rings, and snapshot implementation are not duplicated into it. The
Phase 8 budget remains unchanged at 6,955,000 raw / 1,130,000 Brotli, so 7,096,918 /
6,955,000 remains the separate inherited Phase 8 failure. The residual CH-0029
delta is accounted for here and belongs to the later dedicated bundle
optimization, not to a threshold increase in this batch.

Production-browser checks prove the lazy contract in both directions. An
ordinary `/design` navigation with diagnostics disabled made zero collector
script insertions and installed no snapshot hook. The explicit QA path installs
the snapshot hook and records timing, lifecycle-transition, and renderer-call
activity. A strictly bounded metadata-only bootstrap retains at most 96 fixed
timing/gap events plus five fixed counters capped at 96 while the import is in
flight. One monotonic scalar activation epoch preserves distinct relative start
times when the buffer flushes; the flush count is reported. Required runtime smoke
asserts a nonzero flush plus timing/lifecycle/render activity in the initial
document and in each of three new reload realms. Renderer instrumentation uses
a `WeakSet` and retains no renderer or raw WebGL graph. Aborting the collector
request left the scene canvas mounted, installed no snapshot hook, made no
second request, emitted no page error, and did not change any
lifecycle, readiness, cache, refcount, cancellation, supersession, terminal
error, timeout, retry, or frameloop behavior. Import rejection permanently
clears the bounded bootstrap metadata for that document and fails closed.

Focused telemetry/lazy-boundary, loading-frameloop, smoke-isolation, lifecycle,
cache/refcount, generation/cancellation/supersession, GLB bounds, CH-0017
truthfulness, CH-0016 evidence-contract, Phase 8 project, typecheck, targeted
zero-warning ESLint, code-quality, strict production-build, and diff-hygiene
checks pass. Full E2E was not run. The exact final two-commit CH-0029 branch
head still requires a renewed normal-push authorization and the existing
required-only `workflow_dispatch`; no external verification claim is made.

## Baseline A inherited React-hook diagnostics — 2026-08-03

Baseline A started from exact clean source
`7158b5152336565a1d2b8caa42c2adab108268d2` on
`fix/baseline-react-hook-diagnostics`. The CH-0030 profiling source
`d7a50698707153b43df0a982766288060c24b997` remained isolated. No push,
deployment, Full E2E, external-control change, or work on another finding was
performed.

Exact detached starting-source lint reproduced only
`components/catalog/CatalogPanel.tsx:358`
`react-hooks/set-state-in-effect` and
`components/editor/FloorPlanImportAssistant.tsx:294`
`react-hooks/exhaustive-deps`. Catalog results already omitted the sofa-only
capacity bucket outside sofa scope, but a synchronous effect then deleted the
stored bucket and reset scroll after navigation. The controlled category
transaction and central design-snapshot setter now
advance semantic revisions for active-room ID, name, and room-type changes from
every established snapshot path. A sofa filter records its selection revision, so incompatible navigation removes it from results,
chips, drawer state, and counts without an effect and it cannot resurrect after
returning to sofa. Search, Brand and other filters, selection/variant state, and
memory scope remain mounted. The main-group scope also excludes unavailable
categories. `createDesign` does not read `setState`; removing only that stable
unnecessary dependency preserves current job/title, completion navigation,
error cleanup, and callback freshness.

Focused tests now cover sofa-scope retention, non-sofa category/group cleanup,
controlled room/category invalidation, non-resurrection, unrelated-filter
preservation, valid post-navigation results, repeat-navigation identity,
production revision wiring, and the exact current-data dependency list. Existing floor-plan
consumer coverage continues to exercise progress, error, cancellation/failed
polling termination, retry, completion, routing, and private-source behavior.
Production-browser verification applied Brand plus `3 seater`, switched Living
/ Sleep -> Kitchenette -> Living / Sleep, observed Brand retained and the seat
chip removed without resurrection, saw seven valid dining-table results, kept
the two placed items unchanged, and recorded zero browser errors.

Validation results:

- clean detached baseline `npm run lint -- --max-warnings=0`: expected FAIL,
  exactly one error and one warning above;
- targeted ESLint for both production files and their focused guards with
  `--max-warnings=0`: PASS;
- catalog logic and floor-plan consumer-flow focused guards: PASS;
- `npm run test:floor-plan-live-progress`,
  `npm run test:design-editor-routing`, and
  `npm run test:floor-plan-private-source-retention`: PASS;
- final `npm run lint -- --max-warnings=0`: PASS, zero warnings;
- `npm run typecheck`: PASS;
- `npm run check:code-quality`: PASS after structurally lowering `CatalogPanel`
  lines 1177 -> 1160 and overlong maximum 999 -> 980, plus
  `DesignControlsFurnishPanel` lines 1311 -> 1309, overlong maximum 1195 ->
  1191, and complexity maximum 73 -> 72;
- `APP_ENV=development npm run build`: PASS outside the sandbox; the inherited
  floor-plan NFT trace warning and lenient catalog notices remain;
- `npm run test:design-page-cleanup`: expected FAIL only at the untouched
  `scripts/test-command-bar-save-status.ts:34` after the catalog guard passed;
- focused production-browser catalog transition: PASS; Full E2E not run.

Remaining inherited work is unchanged: Baseline B command-bar save-status is
next; Hamilton vocabulary, architecture ratchets, Phase 8 initial-JavaScript
budget, Full E2E, CH-0017, CH-0028, CH-0029, CH-0030, CH-0004, and unrelated
findings were not modified. The implementation is the single local branch-head
commit containing this entry.

## Baseline B command-bar save-status contract — 2026-08-03

Baseline B began from exact clean Baseline A source
`fe668ab31340d8092f4306361736a7b3015a2533` on
`fix/baseline-save-status-contract`. Entry status, diff, diff check, diff stat,
and untracked output were empty. `lsof` resolved the active Node listener to
the canonical `/Users/justus/Developer/interior-ai` checkout. No work was
discarded and no push, deployment, Full E2E, dependency, catalog, architecture,
or product implementation change was made.

The exact inherited failure was `scripts/test-command-bar-save-status.ts:34`:
the static regex expected `h-7`, while `EditorCommandBar` rendered
`hidden h-[30px] ... md:flex`. This predates Baseline A, whose diff contains no
command-bar or save-status file. History independently establishes the intended
geometry: the compact-toolbar checkpoint changed the bar to 36 px and aligned
its controls, including save status, at approximately 30 px, then added a
Chromium geometry test that measures 29–31 px at wide and 900 px desktop
widths. The same checkpoint accidentally changed only the static expectation
from its prior `h-9` value to `h-7` instead of the implemented 30 px token.

The verified product contract remains unchanged. `useDesignPagePersistence`
owns manual cloud save, local backup, delayed cloud autosave, success/error
timestamps, conflicts, reconnect retry, and project identity transitions;
`getDesignPageSaveStatus` derives the presentation state; the presentation
facade, design-page wrapper, and `EditorCommandBar` only forward and render it.
The existing states cover initial local/cloud pending, scheduled/saving,
local/cloud success, local/cloud failure, conflict, authenticated cloud design,
signed-out local backup, and reconnect retry. Offline has no duplicate state:
it surfaces through the cloud error and the existing browser `online` listener
retries the canonical write. Consumer and Pro use the same owner and state
model, with theme-only visual differences.

The chip is intentionally hidden below `md`, visible from `md`, and exactly
30 px high inside the 36 px desktop bar. Its dot appears at `md`, label at
`lg`, and detail/retry at `xl`; the compact/mobile bar retains the Save action.
The desktop element exposes status, source, and last-success metadata, a title
and aria-label, `role="status"`, and `aria-live="polite"`; the dot is
decorative. No floating copy or duplicate state owner exists.

Classification is **A — STALE STATIC TEST**. The implementation is correct and
unchanged. The corrected static guard extracts the save-status element and its
class tokens, requires `hidden` plus `md:flex` independently of order, and
requires its only height token to be exactly `h-[30px]`. The accessibility
assertions target that same element. The guard still fails on geometry,
breakpoint, element, or announcement regression and no assertion was removed.

Validation on the changed tree:

- PASS: exact command-bar save-status contract; design-page save-status unit
  test; command-bar wrapper and floating-overlay/layout guards;
  `npm run verify:design-persistence`.
- PASS: targeted ESLint with `--max-warnings=0`; full repository lint with
  zero warnings; `npm run typecheck`; `npm run check:code-quality` over 1,035
  production files with no allowance, cycle, suppression, or unsafe-TypeScript
  regression.
- PASS: focused Chromium compact-toolbar layout, 2/2, proving approximately
  30 px save-status geometry at wide and 900 px desktop widths in Consumer and
  Pro.
- PASS: `APP_ENV=development CATALOG_STRICT_VALIDATION=true npm run build`, all
  57 pages. The inherited floor-plan NFT whole-project tracing warning remains.
- PARTIAL/EXPECTED INHERITED FAIL: `npm run test:design-page-cleanup` passes the
  catalog and save-status guards, then stops at
  `scripts/test-design-page-presentation-workspace-registration.ts:87` because
  `lib/useDesignPagePresentationWorkspaceRegistration.ts` is 455 physical
  lines (456 newline-split entries) against `<= 380`. It is recorded separately
  and not modified.

Independent read-only review first found compound/important/arbitrary Tailwind
overrides that escaped the literal token filter, unchecked dynamic class
contributors, and an unnecessary `<div>` dependency. The accepted correction
audits all display and height/min/max/size contributors, constrains and inspects
the conditional and tone-helper returns, and extracts the opening element
generically. Mutation checks prove each reported regression fails while a
behavior-preserving element-type change remains allowed. Final disposition is
**PASS — no actionable findings**: no weakened assertion, CSS substitution,
product/save change, duplicate state, accessibility or Baseline A regression,
unrelated cleanup, or scope creep.

Baseline C — Hamilton controlled vocabulary — is the next baseline batch.
Architecture ratchets, Phase 8 initial JavaScript, Cabinet Preview visibility,
Full E2E, CH-0017 through CH-0030, CH-0004, and unrelated findings remain
untouched. The single focused local implementation commit is the commit
containing this entry; its resolved SHA is reported after creation.

## Baseline C Hamilton controlled vocabulary — 2026-08-04

Baseline C began from exact clean source
`6f63c11d9b0697f55c39e7ffefcfdf67c5624276` on
`fix/baseline-hamilton-controlled-vocabulary`. Baselines A and B were preserved,
the active Node listener's cwd matched the canonical checkout, and no work was
discarded or carried from another branch.

The standard and strict pre-edit audits independently reproduced exactly five
failures, zero warnings, and zero duplicate IDs across exactly three Hamilton
sources. `hamilton_3_seater_sofa_bed/catalog.yaml` used unsupported
`room_compatibility[3]: guest_room`. The left and right Hamilton chaise sleeper
files each used both unsupported `room_compatibility[3]: guest_room` and
unsupported top-level `shape: l_shaped`.

The frozen YAML vocabulary and typed catalog room boundary contain `bedroom`
and no `guest_room` alias. The top-level product-shape vocabulary contains
`rectangular`, not `l_shaped`; related Hamilton, Jaron, Owen, and Auburn chaise
sources establish the same canonical-product-form versus spatial-footprint
distinction. The three room values are now `bedroom`, and the two top-level
shape values are now `rectangular`. Both chaise sources retain the separate
`spatial_attributes.footprint_shape: "l_shaped"`. No vocabulary, schema, audit
rule, placement rule, clearance, dimension, price, link, finish, description,
model path, asset, stock, ID, SKU, orientation, or unrelated tag changed.

The unchanged product IDs are
`sofa-real-castlery-hamilton-3-seater-sofa-bed`,
`sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left`, and
`sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right`; their SKUs remain
`50441101-PM4002`, `50441102-PM4002`, and `50441103-PM4002`. Each retains one
authored variant. Derived runtime variant IDs remain
`imported-<product-id>-marcel-brilliant-white__marcel-brilliant-white` because
identity derives from the unchanged product, upholstery, and finish codes.
Closed/open bounds remain 206×98×86 / 206×227×63 cm for the straight sleeper
and 296×171×86 / 296×227×86 cm for each oriented chaise sleeper.

`buildImportedModelsPayload` derives the imported-model API payload in memory
from YAML; there is no tracked generated catalog-runtime file or package
generation command. The canonical registry-sync check proved direct
source/API-payload parity for top-level shape, room compatibility, spatial
footprint, dimensions, and variants with 144 YAML entries, 139 live entries,
five drafts, and 139 payload entries. New negative coverage proves `guest_room`
and top-level `l_shaped` remain rejected while `bedroom` is accepted and the
independent L-shaped footprint remains unrejected and unchanged. Focused
Hamilton coverage proves all three products, all three variants, preset
auto-metadata, sleeper states, model files, retailer links, and orientation
selectors remain stable.

Independent review confirmed an inherited consumer limitation at the starting
SHA. Final imported catalog assembly derives `CatalogItemSchema.roomTags` from
static configuration/template data rather than YAML `roomCompatibility`; these
three Hamilton sleepers have no static configuration and therefore assemble
with empty room tags, while filters and recommendation scoring consume that
final field. `CatalogItemSchema` has no spatial-footprint property, and no
placement/collision consumer reads the YAML footprint. Resolving those gaps
requires a separate catalog adapter plus schema/placement-contract batch. This
source-only batch therefore does not claim bedroom filter/recommendation
consumption or L-shaped footprint placement consumption.

Validation passed for standard and strict catalog audit (144 files; zero
failures, warnings, or duplicate IDs), catalog editor coverage, Hamilton import,
Castlery finish/retailer mapping (548 normalized variants), asset availability,
catalog filters and placement, live catalog, Phase 14 product flow,
full-catalog furnish, zero-warning full lint, typecheck, code quality, and the
strict 57-page production build. Asset availability remains 812 references,
519 unique URLs, and 145 checked local URLs with the same five draft-only
missing TV-console GLBs. The build retains only the inherited floor-plan NFT
trace warning. `test:design-page-cleanup` clears the catalog and save-status
guards, then reaches the unchanged 455-line
`useDesignPagePresentationWorkspaceRegistration.ts` versus 380-line
architecture assertion. The generic filter and placement suites are regression
checks only; they do not consume the corrected Hamilton source fields described
above.

Two broader inherited checks remain explicitly separate. Database governance
found zero duplicates, parse errors, and missing asset IDs, then failed because
the local database has zero approved `ModelAsset` rows, making all 139 live YAML
IDs environmental orphans. The legacy strict Phase 14 asset preflight had zero
contract errors and zero invalid variant assets but retained 30 static-registry
`MEMORY_DISPOSAL_UNVERIFIED` errors; no Hamilton product appears in that report.

The next bounded batch is the presentation-workspace architecture ratchet.
That file, the separate Phase 8 budget, Full E2E, CH-0017 through CH-0030,
CH-0004, unrelated catalog products, workflows, and dependencies were not
modified. No push or deployment was performed. The single local Baseline C
commit is the commit containing this entry; its resolved SHA is reported after
creation.

## Presentation workspace registration architecture ratchet — 2026-08-04

This bounded batch began from exact clean source
`9ba876b0e8fb53a676bfaf5898bf8e548aacbb79` on
`refactor/presentation-workspace-registration`. Baselines A-C are direct
ancestors. Entry status, tracked diff, diff check, diff stat, and untracked
checks were empty, and the only listening Node application resolved by `lsof`
to `/Users/justus/Developer/interior-ai`, matching the canonical edit target.
No work was discarded or carried across branches.

The ownership inventory found one 406-line hook with ten import sources and
eleven nested arrow functions. Its original presentation/QA composition was
360 lines. Two smaller catalog/cabinetry adjustments brought it to 368;
persisted lighting then added 48 net lines, and later fixture-status/chrome
additions added 39, producing the current 455-line result. State reads span the
existing core shell, document/selection, plan, scene, persistence, onboarding,
cabinetry, paywall, and export registrations. The hook performs no direct
external effect: it composes the presentation/QA facade, while its lighting
callbacks explicitly delegate one history transaction and canonical snapshot
update. Downstream scene, panel, and viewport registrations consume the returned
boundaries; the viewport remains the owner of selected-fixture-light derivation
and viewport-region assembly.

The selected extraction is presentation lighting registration. Before, the
parent hook derived canonical lighting settings and all-room fixture status,
wrapped lighting edits in document history, and composed the presentation/QA
facade. After, `useDesignPagePresentationLightingRegistration.ts` owns only
that lighting adapter: a pure deterministic read-model builder plus a
history-aware command adapter over three explicit inputs. It owns no state,
environment read, analytics, registry, viewport region, or hidden side effect;
document mutations remain explicit through the injected canonical setter and
history runner. `useDesignPagePresentationWorkspaceRegistration.ts` continues
to own hook order and final presentation/QA composition and consumes the
extracted state/actions through a typed boundary.

The original file is 378 physical lines, down from 455; the new module is 129
lines. The code-quality baseline removes the original file's 455-line allowance
and lowers its one overlong-function maximum from 406 to 340. The new file has
no size or function exception. Existing lighting coverage now directly proves
zero fixtures, an item override without fixture photometrics, a valid estimated
fixture, active counts, multi-room/all-document counting across an active-room
switch, fixture-master disablement, and zero dimmer. Existing presentation,
Consumer/Pro, client-preview, selection, room-plan, persistence, local-backup,
and export contracts remain green.

Validation on the final production/test change before documentation:

- PASS: focused lighting, presentation-workspace, presentation/export,
  persistence/presentation, selection-workspace, room-plan, editor-command-bar,
  Consumer/Pro capability/accessibility, and `verify:design-persistence` checks.
- PASS: targeted ESLint with `--max-warnings=0`, full repository lint with zero
  warnings, typecheck, and the lowered code-quality gate.
- PASS: strict `APP_ENV=development CATALOG_STRICT_VALIDATION=true npm run
  build` outside the sandbox, all 57 pages. The first sandboxed attempt failed
  only because Turbopack could not bind its internal helper port; the inherited
  floor-plan NFT whole-project tracing warning remains.
- PARTIAL/EXPECTED INHERITED FAIL: `test:design-page-cleanup` clears the
  remediated presentation guard and next fails the untouched
  `test-design-page-scene-layers.ts` GLB local-bounds source assertion. A direct
  `test-design-page-viewport-workspace-registration.ts` run passes its semantic
  assertions and then retains its existing 361-physical-line/362-entry versus
  280-entry size failure. Neither is changed or reclassified.

The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E was not run. No push, deployment, Phase
8 work, CH-0004, other CH-0017 through CH-0030 work, Hamilton adapter/schema
limitation, workflow, dependency, schema, migration, catalog, or
production-data change is included.

## GLB local-bounds scene-layer contract — 2026-08-04

This bounded baseline remediation began from exact clean source
`9e8efa4c2a56ca1ea2526f9421c3069841e5499e` on
`fix/baseline-glb-local-bounds-contract`. Entry status, branch, HEAD, tracked
diff, diff check, diff stat, and untracked checks were clean, and the listening
Node application cwd matched the canonical `/Users/justus/Developer/interior-ai`
checkout. No work was discarded, copied from an RC, pushed, or deployed.

The inherited failure was `scripts/test-design-page-scene-layers.ts:693`:
its source regex required the detached normalized-model clone and `Box3`
measurement inside the old `GLBScaledModel` source boundary. History shows the
guard originated at `08bdfe0c`, while CH-0028 commit `c0ccd0d` moved the same
logic into exported `measureGLBLocalRenderBounds` in `glbModelResources.ts` and
routed both prepared-cache and fresh normalized resources through
`boundsForResource`. The focused runtime bounds test already passed at the
starting SHA. The exact failure was stale, but independent review then
reproduced shared mutable prepared-bounds tuples across mounts and acceptance
of non-finite or all-zero measurements at the production measurement boundary.
Classification is therefore **E — CODE AND TEST BOTH REQUIRE CORRECTION**. No
user-visible selection or placement/collision defect was reproduced.

The canonical value is normalized scene-item-local `GLBLocalRenderBounds`.
Catalog target dimensions, calibration, normalization centering, intrinsic
normalization rotation, and configured root/node transforms are applied once
before measurement. The enclosing furniture translation and canonical Y
rotation are not part of that value; Three.js applies them to the local
selection outline, and any world AABB is a transient derivation. Placement,
snapping, and collision instead consume the separate XZ planning footprint
from catalog or `planningBoundsMm` plus the canonical item transform. Prepared
resources reuse the primitive local value while each mount deep-clones its
scene, geometry, and materials and receives copied center/size tuples; semantic
publication creates another per-model snapshot. Empty geometry is
`glb-empty-bounds`; non-finite and all-zero measurements are
`glb-bounds-failed`; a planar result with one zero axis remains valid. No bounds
representation is persisted.

The scene-layer guard now checks the stable semantic boundaries separately:
measurement and validity ownership, prepared-mount tuple copying,
prepared/fresh resolution, lifecycle exposure, semantic publication, precise
selection consumption, and split diagnostic APIs. Production measurement now
rejects invalid results, and prepared publication copies primitive bounds per
mount. The focused bounds test loads a checked-in GLB, runs two independent
normalizations, proves exact target dimensions, translation and Y-rotation
world projection without canonical-local mutation, actual cache
miss/hit/remount/reload parity, two-item resource and tuple isolation,
empty/non-finite/all-zero failure, valid planar bounds, tolerance, and tracker
remount behavior. Cache policy, lifecycle ordering, frameloop, telemetry,
timeouts, retries, placement, and persistence are unchanged.

The independent read-only review first found shared prepared tuple ownership,
non-finite/all-zero measurement acceptance, synthetic-only parity/remount
coverage, and the resulting resource-module size-ratchet failure. Each finding
was corrected without a quality exception or cache/lifecycle expansion. Its
final complete-diff disposition is **PASS — no actionable findings**.

Validation passes the exact scene-layer and GLB local/render-bounds guards,
GLB lifecycle and cache/refcount suites, runtime clone-isolation contract,
selection-transform and viewport-selection checks, direct catalog/room
placement checks, design persistence, targeted zero-warning ESLint, full
zero-warning lint, typecheck, code quality, and the strict 57-page production
build. The sandboxed build failed only on Turbopack's prohibited helper-port
bind; the approved outside-sandbox rerun passed with the inherited floor-plan
NFT trace warning. `test:design-page-cleanup` now clears the GLB guard and stops
at the known out-of-scope viewport registration limit: 361 physical lines (362
newline-split entries) versus 280. Full E2E was not run and the viewport
extraction was not started.

The single focused local commit containing this record changes three existing
focused GLB production modules, extracts the 28-line measurement owner to keep
the resource module below the standard size limit, and changes two test scripts,
`docs/architecture/glb-model-lifecycle.md`, and these two records only. Its
resolved SHA and final clean status are reported after commit. Rollback is one
local revert. No Phase 8, CH-0004, CH-0017 through CH-0030, workflow,
dependency, schema, migration, catalog, production-data, push, or deployment
change is included.

## Viewport workspace registration architecture ratchet — 2026-08-04

This bounded remediation began from exact clean source
`3f84fbd98e1154285c537119e7ec8227727f9d24` on
`refactor/viewport-workspace-registration`. Entry status, tracked diff, diff
check, diff stat, and untracked output were empty. The completed hook,
save-status, Hamilton, presentation, and GLB baseline commits were direct
ancestors. `lsof` resolved the listening Node application (`PID 24623`) to the
canonical `/Users/justus/Developer/interior-ai` checkout, matching the edit
target. No work was discarded, carried from another branch, pushed, or
deployed.

The exact inherited failure reproduced after all earlier cleanup guards:
`scripts/test-design-page-viewport-workspace-registration.ts:55` required the
viewport registration's newline-split source to be at most 280 entries. The
file was 361 physical lines / 362 newline-split entries. The separate design
architecture check reported the same file at 361/300 plus the existing
`DesignPageWorkspace.tsx` 594/550 failure. Targeted ESLint was green. Related
viewport guards were green except the separately inherited
`test-editor-3d-floor-cutaway.ts` source assertion for `floorWorldY`, which was
recorded and not modified.

The pre-edit responsibility inventory found six imports, one 341-line
top-level builder, and five nested arrow callbacks. The initial viewport
composition was 258 lines; imported-wall editing brought it to 279,
multi-room plan summary to 304, and selected-fixture lighting to 361. The
module selected existing core-shell, viewport-shell, document/room, scene,
selection, plan, imported-wall, placement, camera, and zone boundaries. It
derived selected-fixture light state, assembled 12 viewport state groups and
configuration, passed one plan-quality reference group, constructed 11 command
groups, invoked `buildDesignPageViewportRegionAdapter`, and returned one
viewport region. It contained no hook, React state, external effect,
registration/unregistration lifecycle, analytics, store, persistence write,
or cleanup responsibility; mutations occur only when its callbacks delegate
to the established command owners.

The chosen extraction is immutable viewport read-model construction. Before,
one builder selected sources, projected state/configuration, and wired
commands. After, `design-page-viewport-workspace-read-model.ts` receives an
explicit typed set of read-only `state`/`derived` sources and constructs only
viewport state/configuration. It cannot access actions and imports no React.
The original registration still selects boundaries, owns references and every
command/event callback, invokes the adapter, and returns the public registration
facade. There is no second viewport registry, selected-region state, camera
state, scene/document model, Consumer/Pro model, or hidden side effect.

The canonical scene and placement invariants are unchanged: 2D and 3D still
consume the same document/scene projection and shared placement/collision
owners; plan coordinates remain XZ, vertical remains Y, and durable rotation
remains canonical `rotationDeg`. Existing viewport-shell state continues to own
view mode, selected plan rooms/overlay, camera view, editor/presentation mode,
and plan preferences. Existing document/scene owners continue to own active
room, room order/counts, fixture state, lighting settings, and persistence.
Client preview and presentation policies are projected through the existing
adapter, while Consumer/Pro differences remain capability/theme projections
over the same model. Keyboard, accessibility, save/reload, project switching,
and cleanup owners are untouched.

The registration is now 210 physical lines, a 151-line reduction and safely
below 280. The extracted module is 298 lines with seven focused functions; the
largest is 48 lines. The design architecture limit tightens from 300 to 280,
and the automatically lowered code-quality baseline changes the original
builder maximum from 341 to 193. No allowance is raised, and no exception,
suppression, explicit `any`, TypeScript suppression, unexplained production
assertion, dependency, barrel, or cycle is added.

Deterministic read-model coverage proves empty/no-current-room behavior,
one-room and ordered multi-room projections, 2D and 3D availability, Consumer
fixture restriction, Pro selected-fixture projection, client-preview
suppression, presentation navigator disablement, selected-opening
presence/removal, active-room and project switching, repeated construction
without duplication, and save/reload-equivalent input parity. Cleanup and
unregistration are not applicable to the extracted pure function; the
unchanged higher-level registration remains effect-free, and existing scene
and viewport-shell lifecycle coverage remains green.

Validation on the production/test change before documentation:

- PASS: the new read-model test; viewport overlay and selection controls; plan
  canvas, plan quality, zone, 2D camera, navigation, representative-project
  2D/3D continuity, selection transforms, scene layers/registration,
  presentation, persistence/presentation, room plan, floating-overlay,
  designer-theme, topology-editor, lighting, Consumer/Pro capability and
  accessibility, selection keyboard, and design persistence checks.
- PASS: targeted ESLint with `--max-warnings=0`; full repository lint with zero
  warnings; typecheck; and code quality across 1,038 production files with the
  lowered baseline, no new cycle, unsafe TypeScript, or suppression.
- PASS: strict `APP_ENV=development CATALOG_STRICT_VALIDATION=true npm run
  build` outside the sandbox, all 57 pages. The first sandboxed attempt failed
  only because Turbopack could not bind its internal helper port; the inherited
  floor-plan NFT whole-project tracing warning remains.
- PARTIAL/EXPECTED INHERITED FAIL: `npm run test:design-page-cleanup` runs the
  new read-model coverage, clears the original viewport 280-line assertion,
  and next stops at the untouched `DesignPageWorkspace.tsx` 594/550 assertion
  in the same guard. Direct design architecture likewise reports only 594/550;
  its viewport limit is now 280 and passes.

Independent read-only review first corrected two documentation-only
inaccuracies: the new module has seven functions, and the test proves ordered
room projections rather than an ordered viewport-region list. Its final
complete-diff disposition is **PASS — no actionable findings**. It confirmed a
cohesive read-model boundary, read-only dependency direction, unchanged
canonical state/command owners, equivalent viewport and policy mappings,
unweakened static guards, lowered ratchets, and no hidden side effect, cycle,
duplicated state, alternate registry, or scope creep. The synthetic typed
facade fixture and absence of repeated browser/manual UI validation are noted
as non-blockers; focused runtime assertions and the author's strict build and
broader validation cover this behavior-preserving batch.

The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E was not run. The next inherited
workspace architecture failure is recorded only and not fixed. No Phase 8,
CH-0004, CH-0017 through CH-0030, dependency, workflow, schema, migration,
catalog, presentation-lighting, GLB, unrelated editor/scene cleanup, push, or
deployment change is included.

## DesignPageWorkspace requested-design architecture ratchet — 2026-08-04

This bounded remediation began from exact clean source
`f95b7e27f6729a36372f00ae0e78b93ea6fd1901` on
`refactor/design-page-workspace`. Entry status, tracked diff, diff check, diff
stat, and untracked checks were empty; the completed baseline commits were
ancestors. `lsof` resolved the listening Node application to the canonical
`/Users/justus/Developer/interior-ai` checkout. No work was discarded, carried
from another branch, pushed, or deployed.

The inherited failure reproduced exactly: `DesignPageWorkspace.tsx` was 594
physical lines against the direct architecture maximum of 550, and the cleanup
suite stopped at the corresponding viewport guard. Targeted ESLint and focused
persistence/core-shell registrations were green. The responsibility map found
that the workspace registered the core shell, document/selection, backup,
paywall, plan, editor interaction, persistence, floor-plan, AI, placement,
commerce, cabinetry, selection, presentation, scene, panel, dialog, and render
regions. Its only direct external synchronization was a 19-line requested-ID
effect. Network/database calls, request epochs, abort controllers, stale
response rejection, canonical document replacement, errors, autosave, and
cleanup already lived in the persistence owner.

The chosen extraction is requested-design workspace registration. Before, the
workspace mounted persistence, exploded its UI-facing state/actions, parsed the
canonical `designId`, triggered load, repaired failed navigation, and separately
wired My Designs navigation. After,
`useDesignPageRequestedDesignWorkspaceRegistration.ts` composes immediately
after the same persistence registration, makes pure deterministic route and
completion decisions, owns route cleanup/cancellation, and closes My Designs
before synchronously pushing the selected canonical ID. Its lower-level
`design-page-requested-design-load-coordinator.ts` support claims a unique token
before each request, aborts its predecessor, and invalidates pending tokens on
route cleanup. Persistence invokes that arbiter but remains the sole network,
document handoff, missing/denied/unavailable translation, share, save,
local-backup, and autosave owner.

No duplicate design state, route parser, entitlement path, network adapter, or
generic helper was introduced. The route ID remains opaque and canonical;
older/aborted loads cannot replace newer state even when an adapter ignores its
abort signal; unmounted or superseded effects
cannot restore stale navigation; failed loads restore the prior canonical
design or `/design`; My Designs, duplicate, checkout, legacy bookmarks, refresh,
and back/forward retain the canonical URL. Consumer and Pro share the same
loading and persistence system, URL mode cannot grant Pro, and signed-out/local
behavior continues to wait rather than invoking cloud loading. Persistence and
autosave remain gated by the existing hydration and current-design identity.

The workspace is now 543 physical lines, down 51 and below 550. The route
registration is 125 lines and its pure request arbiter is 43; neither creates
application or document state. The direct architecture maximum tightens to 543,
and code quality lowers the workspace entry from 594 to 543 plus its overlong
maximum from 560 to 510. Persistence also decreases from 1,360 to 1,359 lines,
its overlong maximum from 1,210 to 1,205, and complex maximum from 26 to 24. No
file or function allowance was raised; no exception, suppression, explicit `any`,
TypeScript suppression, unexplained assertion, dependency, barrel, or cycle was
added.

Validation on the production/test change before this documentation:

- PASS: deterministic requested-design decisions plus deferred controlled
  adapters proving B supersedes A and route removal invalidates A even if abort
  is ignored; canonical routing;
  persistence controller, AI/persistence, presentation/persistence, editor,
  core shell, floor-plan lifecycle, scene-order, viewport, local-backup, save
  status, and design persistence checks.
- PASS: focused Chromium `design-editor-routing.spec.ts`, 6/6 in 2.9 minutes,
  including save/reload, Consumer/Pro entitlement, My Designs history/project
  switching, duplicate response identity, checkout continuation, and denied-ID
  fallback.
- PASS: targeted ESLint and full repository lint with zero warnings; typecheck;
  code quality across 1,040 production files; direct design architecture across
  262 design-page files with no cycle; and strict production build across all
  57 pages. The sandboxed build failed only because Turbopack could not bind its
  helper port; the approved outside-sandbox rerun passed with the inherited
  floor-plan NFT trace warning.
- PARTIAL/EXPECTED INHERITED FAIL: `npm run test:design-page-cleanup` clears the
  original workspace guard and all preceding requested-design/viewport checks,
  then stops at untouched `scripts/test-editor-3d-floor-cutaway.ts:82`, whose
  static `floorWorldY` assertion was already recorded by the preceding viewport
  batch. It was not modified. A direct broader plan-template script also retains
  its earlier moved-test-ID assertion and is not part of this batch.

Initial independent read-only review returned three valid findings: cleanup
suppressed late navigation without invalidating the pending request, concurrent
A/B loads could reuse the same document epoch if an adapter ignored abort, and
the focused test covered pure decisions without a controlled deferred race.
The final implementation addresses each with route cleanup cancellation, a
unique-token request arbiter claimed before predecessor abort, mutation gates in
persistence, and production-arbiter deferred cases for B-over-A and route
removal. Final review is **PASS — no actionable findings**. It confirms the
boundary, canonical owners, Consumer/Pro equivalence, hook order, URL/error/
hydration behavior, ratchets, cycle checks, documentation, test strength, and
scope. A dedicated rendered-hook race test is noted only as non-blocking
residual risk because the production arbiter, source integration, and focused
browser path are already covered.

The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E was not run. No Phase 8, CH-0004,
CH-0017 through CH-0030, viewport, presentation lighting, GLB, catalog,
workflow, dependency, schema, migration, production-data, unrelated editor,
push, or deployment change is included.

## 3D floor-cutaway `floorWorldY` contract — 2026-08-04

This bounded remediation began from exact clean source
`2a6a979f34b6c1c0e6ea8a09c6cfdc86ac370617` on
`fix/baseline-3d-floor-cutaway-contract`. Entry status, tracked diff, diff
check, diff stat, and untracked checks were empty; completed baseline commits
were ancestors. `lsof` resolved the listening Node application (`PID 24623`)
to the canonical `/Users/justus/Developer/interior-ai` checkout, matching the
edit target. No work was discarded, carried from another branch, pushed, or
deployed.

The exact inherited static guard failed at
`scripts/test-editor-3d-floor-cutaway.ts:82`: it expected
`/floorWorldY: number;/` in `HousePlanRenderer3D.tsx`. The underside-cutaway
test was added by `53e2546`; later extraction `08bdfe0` moved the floor mesh
and its `floorWorldY` contract to `house-plan-3d/surfaceMeshes.tsx` without
updating the source guard. Cleanup reproduced the same failure. The initial
stale-owner diagnosis was incomplete: independent read-only review traced a
real one-room product divergence. A default rectangular, floor-target room can
use the single-room renderer even when its canonical `floorElevationMm` is
nonzero. The item scene domain already added that elevation to furniture, but
`RoomEnvironment` rendered the floor, slab, walls, and ceiling around world Y
zero.

The batch is therefore **E — CODE AND TEST BOTH REQUIRE CORRECTION**. Canonical
`FloorPlanDocumentV2.floors[].elevationMm`, projected as
`RoomSnapshot.floorElevationMm`, is the persisted integer-millimetre owner of
the finished-floor world plane. `floorWorldY` is only its renderer-boundary
metre projection. The slab top is `floorWorldY`; its center and bottom are
`floorWorldY - thickness / 2` and `floorWorldY - thickness`. Wall base/top are
`floorWorldY` and `floorWorldY + wallHeight`. The visible finish uses a local
`0.006 m` anti-z-fighting offset that changes neither placement nor persistence.
Furniture remains room-local at rest; spatial 3D adds the room elevation, 2D
preserves XZ plus local Y, and saving removes the world elevation. The floor
underside visibility threshold is the derived
`floorWorldY - slabThickness * 0.35`; it is not slab bottom or a clipping
plane. Wall cutaway remains camera-facing XZ omission/hiding, opening dragging
uses a horizontal plane at `floorWorldY`, and this path has no Three.js
material clipping plane. Consumer and Pro use the same scene model.

`resolveFloorUndersideCutawayElevationMeters` now owns the threshold and is
consumed by the single-room shell, compatibility whole-home floor meshes, and
canonical slab renderer. The scene workspace projects the active single room's
canonical elevation once, the existing region adapter and structure layer
preserve `floorWorldY`, and `Room` positions the complete structural group on
that plane. Its floor and ceiling visibility comparisons are world-relative.
The same validated active-room value reaches camera navigation. A pure,
non-mutating camera projector adds `floorWorldY` to both preset position and
target exactly once for initial single-room readiness, 3D entry, Fit Room,
eye-level, item-focus, and selected canonical-room framing. Saved/restored
world camera views still transition without projection. A stable
design/room/floor initialization key prevents viewport, safe-area, or plan-bound
changes from resetting a user-positioned single-room camera, while whole-home
fitting retains its responsive key. Whole-home slab/floor positions, wall
bases, material settings, selection-aware raycasts, opening plane, furniture
projection, and persistence formulas remain otherwise unchanged. No arbitrary
offset, second state owner, per-frame position calculation, broad extraction,
or quality allowance was introduced.

The focused guard now executes the canonical projection for zero, +3.475 m,
-1.25 m, and malformed/non-integer inputs; executes the slab-relative threshold
for default, positive, and negative floors; reads the extracted mesh owners;
and binds single-room, whole-home, merged-slab, and canonical-slab assertions
to the actual visibility assignments. It also guards the one-room projection,
adapter handoff, shell transform, ceiling plane, furniture/picking boundaries,
camera projection at +3.475 m and -1.25 m, stable single-room versus responsive
whole-home initialization keys, raw world-view restoration, 3D entry/fit/eye/
focus integrations, and the existing semantic geometry API. The directly
affected downstream camera assertion in `test-plan-template-access.ts` now
expects the floor-relative preset; its earlier failing plan-tool test-ID
assertion is untouched. Exact cutaway, editor registration, scene-layer,
room-floor, camera navigation/2D invariant, presentation/export, canonical
2D/3D render parity, multifloor parity, legacy watertight rendering, canonical
finishes/openings, room-placement, v3 floor-plan migration, and
design-persistence checks pass.

Validation also passes direct design architecture across 262 source files,
floor-plan architecture with its 30 existing oversized-file warnings,
targeted ESLint with zero warnings, full lint with zero warnings, typecheck,
and code quality across 1,040 production files with no raised allowance, new
cycle, unsafe TypeScript, or suppression. The camera controller ratchet lowers
from 1,301 to 1,299 lines and its maximum function from 1,165 to 1,160. The strict
`APP_ENV=development CATALOG_STRICT_VALIDATION=true npm run build` passes all
57 pages outside the sandbox; the sandboxed attempt failed only because
Turbopack could not bind its internal helper port, and the inherited floor-plan
NFT whole-project trace warning remains. `npm run test:design-page-cleanup`
clears the floor-cutaway guard and next stops at the untouched
`scripts/test-plan-template-access.ts:188` assertion that plan tool sections
expose stable test IDs. A separate scene-domain script retains its earlier
unrelated GLB disposal-source assertion. Neither failing assertion was
modified; only the later directly affected camera source guard in the
plan-template script changed.
The in-app browser was isolated from the local listener despite a temporary
development server reaching Ready, and Chrome control was unavailable, so no
manual visual pass is claimed; the server was stopped and deterministic path
and geometry checks cover this batch.

Independent review initially returned two valid findings: the nonzero
single-room structure/item mismatch, and new source checks that proved helper
calls without proving the visibility assignments consumed their results. Its
first rereview then found default/fit/eye/focus cameras still based at Y zero;
the next rereview found the initial single-room key incorrectly reused the
responsive whole-home resize inputs and identified incomplete records. All
findings are corrected with the shared elevation handoff, assignment-bound
guards, camera projection, stable single-room lifecycle key, lowered ratchet,
and this precise record. The affected focused, type, architecture, quality,
lint, cleanup, and build checks were rerun. Final complete-diff review is
**PASS — no actionable findings**.

The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E was not run. No Phase 8, CH-0004,
CH-0017 through CH-0030, plan-template implementation or failing test-ID
assertion, GLB lifecycle/cache/bounds, workflow, dependency, schema, migration,
catalog, frameloop, telemetry, unrelated scene, push, or deployment change is
included.

## Plan-template access stable test-ID contract — 2026-08-04

This required-baseline remediation began from exact clean source
`bb22590ed5728c6868aa18e0738152fc7f36cfdc` on
`fix/baseline-plan-template-access-contract`. Entry status, tracked diff, diff
check, diff stat, and untracked checks were empty; all completed baseline
commits were ancestors. `lsof` resolved the listening Node application (PID
24623) to `/Users/justus/Developer/interior-ai`, matching the canonical edit
target. No work was discarded, carried from another branch, pushed, or
deployed.

The exact original assertion was:

```ts
assert.match(
  source,
  /data-testid=\{`plan-tool-section-\$\{section\}`\}/,
  "Plan tool sections should expose stable test ids."
);
```

It searched only `DesignControlsPlanPanel.tsx`. The actual production owner is
the exported `PlanToolSection` in
`components/editor/design-controls-plan/PlanToolComponents.tsx`, which already
rendered the exact expected `plan-tool-section-${section}` value. The prior
floor-cutaway batch changed only this script's later camera assertion. Its
complete diff changed neither line 188 nor its surrounding plan-tool guard, and
the directly relevant production-file diff was empty. Clean detached runs at
`2a6a979f34b6c1c0e6ea8a09c6cfdc86ac370617` and
`bb22590ed5728c6868aa18e0738152fc7f36cfdc` both exited 1 at line 188 with the
same assertion message and expected regular expression. After normalizing the
detached path, the diagnostics were byte-for-byte identical. The failure is
therefore inherited; the floor-cutaway commit merely exposed it.

Classification is **C — BRITTLE SOURCE GUARD**. The stable identity is a QA and
automation selector. Accessible behavior remains owned by native buttons,
visible labels/headings, `aria-expanded`, the named picker region and dialog,
and deterministic focus movement. `launch_path_selected` separately uses the
fixed semantic `template` path plus Consumer/Pro source; analytics never reads
the test ID. Neither selector visibility nor analytics grants capability or
authorization.

Relevant selector inventory:

| Selector | Canonical owner and purpose | Mode / enabled state | Keyboard and focus | Direct consumers | Status |
| --- | --- | --- | --- | --- | --- |
| `plan-tool-section-${section}` | `PlanToolSection`; scopes the four grouped Consumer plan-tool sections | Consumer grouped tools; deterministic while collapsed or expanded | Native toggle button with `aria-expanded`; pointer and keyboard share `onToggle` | plan-template guard; Consumer room-setup; multi-room upload/drawing specs | Canonical; one rendered owner per fixed section key |
| `plan-start-template` | `DesignControlsPlanPanel.openTemplatePicker`, projected by `ConsumerRoomSetupCard` or the Pro start panel | Consumer/Pro projections are mutually exclusive; button remains identifiable while disabled by `!canEdit` | Native button; opening records the invoker and focuses the picker heading | runtime/beta/smart-placement/zone/multi-room helpers and Consumer setup | Canonical shared action; two mode-specific source projections, one active scope |
| `editor-command-new-plan` | `EditorCommandBar`; begins the shared New plan workflow that resolves to the panel picker | Consumer/Pro shared command bar; always mounted while its command surface is active | Native button; keyboard/pointer share `onNewPlan`; picker opening records it for Escape focus return | editor, Phase 14, floating-overlay and plan-template guards/specs | Canonical command entry projection |
| `beta-start-template` | `BetaStartPanel.StartPathButton`; first-run shortcut to the shared template action | Public-beta fast-start projection while that panel is visible | Native button; keyboard/pointer share `actions.chooseTemplate` | blocking runtime smoke | Canonical beta entry projection |
| `load-designs-open-templates` | `MyDesignsDialog`; direct shortcut from saved designs to the shared template picker | Shared Load dialog projection; remains enabled while the shortcut is rendered | Native button; keyboard/pointer share `onOpenTemplates`; picker receives heading focus | plan-template guard and blocking beta smoke | Canonical Load-dialog entry projection |
| `starter-floor-plan-picker` | `DesignControlsPlanPanel`; named region for address and starter templates | Shared Consumer/Pro picker when `planStartMode === "template"` | Heading receives focus on open; Escape closes and returns focus to the connected invoker | editor, beta, template, load-design shortcut, runtime smoke | Canonical shared region |
| `skip-to-starter-layouts` | `DesignControlsPlanPanel`; bypasses address search | Shared and enabled while picker is open | Native activation focuses the first empty-layout action | editor focus spec and accessibility guard | Canonical focus shortcut |
| `apply-plan-template-${template.id}` | Template card in `DesignControlsPlanPanel`; applies an empty layout | Shared; persists while disabled by `!canEdit` | Native button; the first stable action is the skip target | editor, multi-room, mobile, Phase 14, zone and surface specs | Canonical per stable template ID |
| `apply-furnished-template-${template.id}` | Template card in `DesignControlsPlanPanel`; applies the resolved furnishing pack | Shared; persists while disabled for no edit capability, pack, or pack items | Native button; same application owner as pointer activation | beta/runtime/staging/smart-placement/template specs | Canonical per stable template ID |
| `new-plan-choice-dialog` and `new-plan-*` actions | `PlanTemplateChoiceDialog`; protects meaningful existing work | Shared; action IDs persist while `busy` disables all actions and sets `aria-busy` | Initial focus on the primary action, trapped Tab order, guarded Escape, focus return | editor/new-plan/template/persistence guards and specs | Canonical replacement/preservation boundary |

The supposedly duplicated `plan-start-template` source strings are deliberate
mode projections and never render together: Consumer owns the guided room-setup
button, while Pro owns its start-panel button. Both invoke the same panel-owned
action and use the same ID because the product contract defines one template
entry action. The command-bar, beta-fast-start, and Load-dialog IDs name their
distinct entry surfaces; each routes to the shared picker instead of duplicating
the picker or apply handler. The failing `plan-tool-section-*` identity has only
one component owner. No selector depends on translated text, an array index,
randomness, or time. Template-card suffixes use the existing stable authored
template ID, not display copy or catalog availability. Loading/disabled states
leave IDs mounted, and no hidden duplicate element exists.

The correction changes no production code. The guard now imports and
server-renders `PlanToolSection`, proves exactly one occurrence of each fixed
`importFloorPlan`, `drawRoom`, `openings`, and `templates` selector, separately
checks the native collapsed button and visible label, binds the button to the
canonical `onToggle` action, proves the parent wires those four keys exactly
once, and rejects a second parent-owned section ID.
The few adjacent section/tile assertions stranded by the same component
extraction now inspect the actual exported owner. The assertions for compact
layout, content-driven height, pressed state, and keyboard shortcut remain in
force; none was deleted or replaced by a component-exists check.

Product behavior remains unchanged. Consumer and Pro open the same picker and
apply through the same floor-plan controller. The first template action becomes
the deterministic focus target after filters render; source/guard inspection
proves disabled actions remain addressable and all entry projections converge on
one shared apply-controller path. Existing focused browser coverage proves the
replacement outcome and resulting document/persistence state; this batch does
not claim a browser-level disabled-transition or invocation-count assertion.
Template application behavior and project/room identity, history, local backup,
cloud identity, and save/reload owners remain unchanged.

Validation on the final code/test change before independent review:

- PASS: exact `scripts/test-plan-template-access.ts` guard and targeted ESLint
  with zero warnings;
- PASS: `npm run test:design-page-cleanup`, all 78 registered guards; there is
  no next inherited cleanup failure;
- PASS: focused Chromium Consumer starter-template creation (1/1), Pro
  template entry/application through the selected-item fixture (1/1), and New
  plan heading/first-action/Escape focus lifecycle (1/1);
- PASS: editor capability/accessibility and complete design-persistence
  verification;
- PASS: direct design architecture (262 source files, no cycles) and floor-plan
  architecture (30 existing oversized-file warnings only);
- PASS: full repository lint with zero warnings, typecheck, code quality, and
  strict production build across all 57 pages. The sandboxed build failed only
  on Turbopack's helper-port restriction; the approved outside-sandbox rerun
  passed with the inherited floor-plan NFT trace warning.
- RECORDED OUT-OF-SCOPE BROWSER FAILURE: the broader Consumer room-setup case
  first passed all four `plan-tool-section-*` selector/expanded-state checks,
  then failed before template opening because keyboard activation left
  `room-setup-unit-cm` at `aria-pressed="false"`. Neither production nor that
  spec was touched. The dedicated Consumer template workflow passed, and this
  separate measurement-state issue was not repaired or reclassified here.

Independent read-only review initially found that server-rendered native-button
markup alone did not prove `onToggle` wiring and that the queue overstated
browser evidence for disabled identity and exactly-once application. The guard
now binds the semantic owner to `onClick={onToggle}`, and both records distinguish
focused browser results from source/guard inspection while explicitly declining
to claim a disabled-transition or invocation-count browser assertion. Exact
guard, targeted ESLint, all 78 cleanup guards, full zero-warning lint, and
typecheck reran after those corrections. Final complete-diff review passed with
no remaining actionable finding; it confirmed inherited proof, rendered
uniqueness, Consumer/Pro projections, accessibility wiring, unchanged
apply/persistence paths, floor-cutaway non-regression, and scope control.

The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E was not run. No production component,
product/permission behavior, floor-cutaway, DesignPageWorkspace,
requested-design coordinator, viewport/presentation registration, GLB,
CatalogPanel, command-bar, Hamilton, Phase 8, CH-0004, CH-0017 through CH-0030,
workflow, dependency, lockfile, schema, migration, catalog, push, or deployment
change is included.

## Required-test inventory synchronization — 2026-08-04

This bounded required-gate metadata remediation began from exact clean source
`69a762727a45c145b9ea645f5a397c382accbd7e` on
`fix/baseline-plan-template-access-contract`, whose commit is the completed
plan-template selector batch. Entry status, tracked diff, diff check, diff
stat, and untracked checks were empty. The requested
`fix/required-test-inventory-sync` branch was created from that exact SHA.
`lsof` resolved the only listening Node application to the canonical
`/Users/justus/Developer/interior-ai` checkout. No work was discarded or
carried from another branch, and nothing was pushed or deployed.

The canonical manifest check reproduced one mismatch only: `script-tests`
expected 248 paths and
`5103c2f9d54bf97fdca1b9d8a7a420a810f7e4290c708c49ee85bb6deb80ba9f`,
but current discovery found 250 paths and
`0c033fb44f2e336b0433288d5fbee96f8948813fdf769be8d078aead8ff66d5c`.
The repository has no inventory updater or generated inventory artifact; its
supported CLI modes are `check`, `run`, `verify`, `prepare-upload`, and
`verify-upload`. The implementation recursively walks each declared root,
normalizes separators to `/`, sorts the paths, and hashes the newline-joined
inventory with a final newline. Running that implementation independently
produced 250 normalized script-test paths, 370 total unique classified
sources, 21 gates, and zero duplicate, unowned, or multiply classified paths.
All other inventory counts and hashes matched the manifest.

The two paths absent from the stale fingerprint are:

- `scripts/test-design-page-requested-design-workspace-registration.ts`;
- `scripts/test-design-page-viewport-workspace-read-model.ts`.

Both files are tracked, hand-authored TypeScript assertion programs with
production imports, deterministic fixtures, and pass/fail output. They contain
no generated header, are not helpers or fixtures, and their creation commits
are the reviewed requested-design and viewport read-model extractions. Each
appears exactly once in the 77-TypeScript-plus-one-architecture-guard array in
`scripts/run-design-page-cleanup-tests.mjs`. The array rejects duplicate names
and missing sources before execution. The existing required owner is
`ci.design-cleanup`, through the exact package-command closure
`npm run test:design-page-cleanup` →
`node scripts/run-design-page-cleanup-tests.mjs`; that closure remains one
package script with SHA-256
`2649e75478c4214608459c1c4cfe063e69f07246b2341bfb484f8584a9697b49`.
No other package command or source registration names either test. Registering
the discovered paths in the manifest fingerprint therefore adds no execution
path, owner, imported module, or double count. An in-memory deletion proof
changed the inventory to 249 paths and a different hash for either file; an
in-memory rename retained 250 paths but changed the hash. Both cases are
rejected by truthfulness without altering either test.

The synchronization changes only `script-tests.expectedFileCount` from 248 to
250 and `expectedPathSha256` to the verified current hash. The QA document now
records 250 script tests and 370 complete classified sources instead of 248
and 368. All 21 gate identities, owners, required/advisory classifications,
browser projects, skip/retry/flaky policies, stable requirements,
source/artifact bindings, package-command closures, zero-test rejection, and
Full E2E's advisory status remain unchanged. No production file, test
implementation, test assertion, workflow, dependency, threshold, allowance,
suppression, or generated file changed.

Validation after synchronization:

- PASS: `npm run test:required-test-truthfulness`; the registered negative
  manifest/inventory suite completed and the checked-in contract validated.
- PASS: `node scripts/required-test-truthfulness.mjs check`, reporting 21 gates
  and 370 classified test sources.
- PASS: `npm run test:production-artifact-evidence`.
- PASS: `npm run test:design-page-cleanup`, all 78 registered guards. Both
  synchronized tests are visible in the runner output exactly once.
- PASS: `npm run lint -- --max-warnings=0`, zero warnings; `npm run typecheck`;
  and `npm run check:code-quality` across 1,040 production files, with 197
  oversized-file, 554 function-debt, and 19 suppression baselines unchanged,
  no static runtime cycle, and no unsafe TypeScript suppression.
- PASS: `git diff --check`. No allowance or suppression was raised. Full E2E
  was not run.

The separate read-only reviewer independently reproduced 250 script tests,
370 unique classified sources, the current normalized script hash, and the
exact stale 248/hash pair when both files are removed. It confirmed 21
unchanged gates, zero classification gaps or overlaps, one required execution
owner and one runner occurrence for each synchronized test, unchanged package
closure/cadence/classification, correct current documentation, the persisted
2/4 Pro-policy evidence, and a complete diff limited to the four authorized
metadata/documentation files. Its independent truthfulness, direct check,
production-evidence, 78/78 cleanup, typecheck, and diff-hygiene reruns passed.
Final disposition: **PASS — no actionable findings**. Older 248/368 records are
historical CH snapshots and remain intentionally unchanged.

The literal local `npm run test:pro-visual-policy` wrapper first proved its
fail-closed environment boundary by refusing to start without explicit
`APP_ENV` or `VERCEL_ENV`. With the minimal explicit local
`APP_ENV=development`, the same registered required wrapper discovered and ran
all four identities. The Consumer/Pro theme case passed in Chromium and WebKit.
The Cabinet Preview case failed in both engines at
`tests/e2e/pro-visual-policy.spec.ts:283` because
`open-custom-millwork-studio` resolved to a hidden element. The truthful result
is 2 passed / 2 failed, process exit nonzero, with the required evidence naming
both failed project identities. Because `ci.pro-visual-policy` is a
merge-required blocking gate, its bounded remediation is the next local batch;
it was not started.

Phase 8 was not rerun or modified. Its retained status remains 7,101,416 raw
initial-JS bytes against 6,955,000 (146,416 excess), 1,169,365 Brotli bytes
against 1,130,000, and 3,779 bytes of latent initial-CSS excess. The required
gate graph places Pro visual-policy before this separate optimization work.
The implementation commit is the single focused local commit containing this
record; its resolved SHA and final clean status are reported after creation.
Rollback is one local revert. Full E2E, Pro remediation, Phase 8 optimization,
CH-0004, CH-0017 through CH-0030 behavior, workflows, rulesets, runners, pull
requests, deployments, external settings, production code, and test behavior
remain untouched.

## Pro visual-policy Cabinet Preview access contract — 2026-08-04

This bounded required-gate remediation began from exact clean source
`8cec1f0afe5da80f7cedd149c91586f930bb7738` on
`fix/baseline-pro-visual-policy`. Entry status, tracked diff, diff check, diff
stat, and untracked checks were empty, and the requested starting commit and
completed cumulative baseline were already local ancestors. `lsof` resolved
the listening Node process to the canonical
`/Users/justus/Developer/interior-ai` checkout. No work was carried from the
prior branch, discarded, pushed, or deployed.

The exact `APP_ENV=development npm run test:pro-visual-policy` reproduction ran
all four identities. The Consumer/Pro theme case passed in Chromium and
WebKit. Each Cabinet Preview case failed at the same direct interaction with
`open-custom-millwork-studio`: the locator resolved to one span, but its owning
Workspace menu was closed and the span was hidden for the full 30-second
expectation. The Cabinet case was at `/design?mode=designer`, `/api/me` supplied
the Pro plan, and the supported non-production default enabled Custom Millwork
Studio. Opening `editor-command-workspace` made one
`editor-workflow-millwork` menu item and its legacy nested identity visible in
both engines; pointer activation opened one Pro Studio.

The final classification is **F — CODE AND TEST BOTH REQUIRE CORRECTION**. The
test interaction was stale because it treated the nested legacy identity as a
visible action before opening its owner. Independent manual browser inspection
also found genuine product accessibility defects: the lazy Studio had no
dialog semantics, did not take or trap focus, and did not return focus on
close. During strengthened required coverage, WebKit additionally demonstrated
that native Tab behavior did not give the menu a deterministic cross-engine
button path. These facts make a test-only locator update incomplete.

The verified product flow is one canonical chain:

1. activate the visible Workspace button;
2. expose the Workspace menu and its one visible Custom Millwork action;
3. activate `editor-workflow-millwork` through pointer or keyboard;
4. open one lazy Custom Millwork Studio dialog.

`open-custom-millwork-studio` remains a legacy child identity only. It is not
clickable while the menu is closed, does not own a second handler, and is not
an authorization boundary. The required spec's focused
`openCustomMillworkStudioFromWorkspace` helper proves closed/hidden state,
unique ownership, visible/actionable state, real pointer or keyboard
activation, one ready Studio, access level, dialog focus, and closed-menu state.
The existing theme and complete Cabinet Preview template/view screenshot
assertions remain intact. The keyboard path uses button activation, receives
deterministic first-menu-item focus, reaches Millwork with ArrowDown, activates
it with Enter, closes the dialog back to Workspace, and reopens once.

Production changes are limited to this verified focus contract. The command
bar focuses the first menu item for keyboard-generated activation, provides
ArrowUp/ArrowDown movement, returns focus on Escape and before a workflow
action, and retains one opener. The extracted Studio dialog owns `role=dialog`,
an accessible name, modal semantics, initial focus, Tab containment, guarded
Escape dismissal through the canonical cancellation owner, focus return, and
protection against a stale close callback stealing focus from a replacement
dialog. The original dynamic import and accessible loading state remain intact.
A mocked Free plan deliberately requests `?mode=designer` and remains Consumer,
Guided, without the Pro indicator or Detailed control; Pro retains Detailed
capability. `CABINETRY_STUDIO_FEATURE_ENABLED` remains the canonical public
feature flag with fail-closed production default, client preview still removes
the Workspace action, and entitlement remains server/domain controlled rather
than URL-, locator-, visibility-, analytics-, or client-state-controlled.

Final validation:

- PASS: canonical required wrapper, 4/4, including truthfulness validation;
- PASS: direct Chromium project, 2/2; direct WebKit project, 2/2;
- PASS: pointer, keyboard, menu focus, dialog focus/trap/return, close/reopen,
  uniqueness, Consumer Guided/no-Detailed, Pro access, feature-flag and client-
  preview source contracts;
- PASS: all 78 design-page cleanup guards; required-test truthfulness; CH-0016
  production-artifact evidence; editor command/capability/accessibility; and
  focused cabinetry controller, runtime, composition, header, accessibility,
  and preview-renderer checks;
- PASS: targeted and full lint with zero warnings, typecheck, code quality with
  no raised allowance/suppression, diff hygiene, and the strict production
  build with all 57 pages. The sandboxed build failed only because Turbopack
  could not bind its helper port; the approved outside-sandbox build passed
  with the inherited floor-plan NFT trace warning;
- PASS: required-test inventory remains 21 gates / 370 classified sources.

The exact identical-build bundle comparison is 7,101,416 → 7,103,302 raw
initial-JS bytes (+1,886) and 1,169,365 → 1,169,257 Brotli bytes (-108). This is
a small explained accessibility/menu correction, not a dependency or Cabinetry
duplication: initial CSS is unchanged at 143,779 raw bytes, and Cabinetry Studio
remains one lazy chunk at 492,639 raw / 84,899 Brotli. The standard Phase 8
check passes all representative project timings, then remains separately red
at 7,103,302/6,955,000 raw bytes; the 1,169,257/1,130,000 Brotli and 3,779-byte
CSS excesses also remain. No performance budget or Phase 8 implementation was
changed or rebaselined.

Independent read-only review found two actionable gaps: the new modal did not
consume Escape through the canonical cancellation owner, and the Consumer
browser phase still inherited the Pro API mock. Follow-up then found that an
inner control's already-prevented Escape could still reach background editor
shortcuts. All findings were corrected with unconditional modal Escape
isolation, dismissal only for an otherwise-unhandled Escape, and a Free-plan
`?mode=designer` downgrade proof. Affected static checks, direct Chromium/
WebKit projects, the final 4/4 wrapper, lint/typecheck/code quality, cleanup,
and the strict build reran successfully. Final complete-diff disposition is
**PASS — no actionable findings**. The residual non-blocking limitation is
that inner-control `defaultPrevented` isolation is source-contract covered
rather than a separate browser case; generic Escape dismissal and focus return
are browser-covered. The implementation commit is the single focused local
commit containing this record; its resolved SHA and final clean status are
reported after creation. Rollback is one local revert. Full E2E was not run.
Phase 8 remediation,
CH-0004, CH-0017 through CH-0030 behavior, geometry/export, GLB lifecycle/cache/
telemetry, viewport/presentation architecture, CatalogPanel, catalog sources,
workflows, dependencies, lockfile, schema, migrations, push, and deployment
remain untouched.

## Phase 8A surface-material initial-JS boundary — 2026-08-04

This bounded batch began from exact clean source
`101f25d095c6e205e2d40e1ad843a24210696e40` on
`perf/phase8-surface-material-initial-js`. The listening Node process resolved
through `lsof` to the canonical `/Users/justus/Developer/interior-ai` checkout.
The entry tree had no tracked diff or untracked files, and the required
cumulative commits were ancestors. No work was discarded, carried from an RC,
pushed, or deployed.

The clean detached before build reproduced 26 `/design` initial JS chunks at
7,103,302 raw / 1,169,257 Brotli bytes and 143,779 raw / 18,417 Brotli CSS.
The dominant initial chunk was 3,788,924 raw / 428,408 Brotli. Source
composition proved the former 92,044-line, 2,518,834-byte combined generated
surface runtime as the leading raw owner; after splitting that data, the
remaining Brotli miss was traced to the statically imported 2,484-row Nippon
paint browser catalog. Both are surface-workspace browse metadata owners, not
renderer or persistence state.

The canonical audited generator now emits:

- `surface-material-render.generated.ts`: compact eager render tuples;
- `surface-material-catalog.generated.ts`: lazy descriptive/sample metadata;
- `tests/fixtures/surface-material-runtime.generated.ts`: isolated test data.

All 980 production IDs are unique and identical across render and catalog
projections in deterministic material-ID order. The eager facade keeps stable
identity, category/family, selected-material labels, physical plank/tile
dimensions, every texture asset, every rendering parameter, and publication
status/blockers. The former runtime type declared optional `collection`, but
the former generator did not emit it; the split preserves the actual fallback
and grouping behavior instead of newly activating YAML collection labels. The
lazy projection keeps source/sample/license data, tone, style, room suitability,
thickness/wear/water/outdoor/commercial attributes, and browser commerce/sample
data. The same loader dynamically imports Nippon paint rows; one small eager
contract remains canonical for its family order, count, source URL, and import
date. Wider price/currency/installation/admin fields remain on canonical
YAML and the server `catalog-registry`; BOM/share/export behavior does not
depend on or eagerly import the client catalog. The exhaustive matrix is in
`docs/architecture/surface-material-runtime-boundary.md`.

The loader is triggered only when a user explicitly opens the room-finish
surface workspace. Both the contextual room card and Pro standalone floor-
finish card require that Change/Browse transition before rendering the browser.
Consumer or Pro `/design` mount, room hydration, a saved selected material, and
2D/3D switching do not trigger it. One cached promise
prevents duplicate requests. A rejected promise stays rejected until explicit
Retry; the bounded error UI states that current finishes are unchanged, and
the synchronous render registry remains available throughout. Search, filters,
supplier, swatches, source links, and sample links use the joined
records after success. Twelve curated paint defaults remain eager; the full
Nippon browser data does not.

The final clean strict measurement is 5,790,970 raw / 1,104,573 Brotli initial
JS across the same 26 chunks: reductions of 1,312,332 raw and 64,684 Brotli,
passing the unchanged 6,955,000 / 1,130,000 limits. Full surface catalog data
is in a 633,154 raw / 9,397 Brotli lazy chunk; Nippon paint is in a 274,965 raw /
58,679 Brotli lazy chunk. The semantic guard proves both absent initially, one
real render material present initially, and test fixtures absent everywhere.
Cabinetry Studio and GLTFExporter lazy chunks are unchanged. Exact inventories
and largest-chunk evidence are recorded in the Phase 8 performance document.

Validation passes: generator drift and surface schema (980 records; 25
Goodrich draft fixtures), wall-paint catalog, texture scale/pattern and 2D/3D
identity, surface persistence/save/reload, BOM/export, strict catalog audit,
asset availability, required-test truthfulness (21 gates / 370 sources), all
78 design-page cleanup checks, Pro visual policy 4/4 in Chromium/WebKit,
targeted and full zero-warning lint, typecheck, code quality, semantic bundle
boundary checks, project performance budgets, diff hygiene, and the strict
57-page production build. The sandboxed build failed only because Turbopack
could not bind its helper port; the approved outside-sandbox rerun passed with
the inherited NFT broad-trace warning. Full E2E was not run.

The focused Chromium surface suite is green across all six affected behaviors:
apply/reload, Gardenia variant selection, apply-all Nippon paint, ceiling paint
filtering, bottom-up 3D ceiling targeting, and share-export BOM. A final run
first exposed a duplicate test identity on the new standalone trigger; four
unaffected cases passed, the identity was made unique, and both affected cases
then passed on rerun. The required Pro visual-policy wrapper passed 4/4 again
across Chromium and WebKit after the final UI boundary change.

Independent read-only review found and closed five architectural issues: the
standalone Pro browser needed an explicit open transition instead of an idle
spinner or mount-time import; YAML `collection` would have newly changed
baseline grouping; Nippon constants had been duplicated; the semantic guard
needed a real lazy-only metadata value in addition to a marker; and the test-
fixture generated header named the wrong source root. The final reviewer
rechecked the complete diff, 980/980 projection parity, lazy loader/cache/error
contract, source-of-truth boundaries, fixture isolation, code-quality ratchet,
measurements, and documentation. Final disposition: **PASS — no actionable
findings**. The reviewer made no edits, commits, pushes, or deployments.

Phase 8A is green for its owned raw and Brotli JavaScript acceptance. CSS is
exactly unchanged at 143,779 raw / 18,417 Brotli, leaving the existing
3,779-byte raw CSS excess. Consequently the combined Phase 8 `--check` stops
only on CSS, as expected. Phase 8B CSS is the next bounded performance batch;
it was not started and no budget was raised. No CH-0004, CH-0017-through-
CH-0030 behavior, furniture/catalog source, GLB lifecycle/cache/telemetry,
Custom Millwork, DesignPageWorkspace architecture, dependency, lockfile,
schema, migration, workflow, push, or deployment change is included. The
implementation commit is the single focused commit containing this record;
resolve its SHA after creation. Rollback is one local revert.

## Phase 8B initial-CSS ownership boundary — 2026-08-04

This batch began from exact clean source
`299536fee37fe68b3fde38c02984f5aba21a6231` on
`perf/phase8-initial-css`. Before editing, the branch, status, diff, untracked
inventory, and exact SHA were recorded; the tree was clean. `lsof` confirmed
the listening Node process belonged to the canonical
`/Users/justus/Developer/interior-ai` checkout. Nothing was carried from an RC
or evidence directory, and nothing was pushed or deployed.

The clean detached before worktree used Node 24.13.0, npm 11.6.2,
`npm ci --include=dev`, non-secret strict build placeholders, the strict
57-page build, and the exact Phase 8 bundle measurement. It reproduced one
`/design` initial CSS chunk at 143,779 raw / 18,417 Brotli bytes. The only other
CSS output was the existing 30,366 raw / 3,966 Brotli admin module. `/design`
initial JS reproduced Phase 8A exactly at 5,790,970 raw / 1,104,573 Brotli
across 26 chunks; Cabinetry Studio and GLTFExporter remained lazy.

The starting JSON guard still said 19,000 Brotli bytes while the authoritative
Phase 8B ceiling is 18,000. The one config edit tightens that stale value to
18,000; it does not adopt the result as a baseline or raise any budget.

The root cause was source ownership, not minification: `app/globals.css`
scanned every `app` route and all of `features`, so 53 admin-only utilities, 20
GLB-optimizer-only utilities, and 98 already-dynamic Cabinetry Studio utilities
were compiled into the initial editor stylesheet. The correction adds explicit
negative source boundaries and three scoped Tailwind owners. Admin and tools
import their owners from route layouts. The existing dynamic
`CabinetryStudio` implementation imports its owner, so CSS follows the same
lazy interaction boundary as its UI and JavaScript. Ten candidates used by
multiple excluded owners remain once in the root sheet. No selector was
removed, renamed, hidden in JavaScript, or copied into a second eager sheet.
Shared first-paint, surface browser, focus-visible, responsive, reduced-motion,
modal, Consumer/Pro, and share/export styling remain in the root owner.

The post-change strict build maps `/design` only to a 129,803 raw / 17,182
Brotli global/shared chunk. The lazy Studio CSS chunk is 13,197 / 2,345; admin
Tailwind is 5,639 / 1,304; tools Tailwind is 2,693 / 623; the existing admin
module is unchanged at 30,366 / 3,966. Initial CSS therefore improves by
13,976 raw / 1,235 Brotli and has 10,197 / 818 bytes of headroom against the
140,000 / 18,000 ceilings. Initial JS remains 26 chunks at 5,791,004 raw /
1,104,582 Brotli. The explained +34 raw / +9 Brotli delta is the new
stylesheet dependency edge; the measured 492,639 / 84,899 Cabinetry Studio and
34,525 / 8,970 GLTFExporter JS chunks are byte-identical to Phase 8A.

The focused guard was written before the production change and first failed on
the missing negative ownership directive. It now uses Tailwind's scanner and
design system to require the exact global, cross-owner, and exclusive candidate
inventories; reject overlap, omission, and drift; and inspect compiled selector
membership without naming a hash. It proves admin/tools/Cabinetry rules load
outside the initial design CSS graph. A scoped PostCSS transform removes
duplicate Tailwind property registrations only after the guard proves every
required registration remains in root CSS and every route loads that root
sheet. The detailed A–F ownership matrix, conservative global decisions,
inventories, and compiler-registration contract are in
`docs/architecture/phase8-css-ownership.md` and
`docs/architecture/phase8-performance-baseline-and-budgets.md`.

Manual testing used the strict production artifact. Before open, `/design` had
one stylesheet, no Studio dialog, and no `min-h-[680px]` Studio rule. Requesting
Custom Millwork first showed the bounded loading status; the lazy stylesheet
then appeared before the interactive Studio, where the exclusive target
computed to 680px and a shared `gap-5` consumer computed to 20px. Close/reopen
retained two unique stylesheet URLs and restored the same geometry. This covers
the no-FOUC, cache, shared-utility, and duplicate-request contract at the
affected boundary.

Validation passes: the complete Phase 8 combined gate; full Cabinetry
verification including accessibility/performance/runtime boundaries; all 78
design-page cleanup guards including presentation/export runtime; editor
capability/accessibility; Chromium and WebKit Pro visual policy 4/4; required-
test truthfulness; production-artifact evidence; full zero-warning lint;
typecheck; code quality; diff hygiene; and the strict production build. The
sandboxed policy runner was unable to bind port 3000; its approved local-port
rerun passed. A final policy invocation without the repository-required
`APP_ENV` was rejected before test discovery; the corrected
`APP_ENV=development` run passed all four Chromium/WebKit cases in 2.7 minutes.
The ignored TypeScript incremental cache briefly referenced removed
`.next/dev` types; `tsc --build --clean` regenerated no source and the exact
`npm run typecheck` rerun passed. The inherited Turbopack/NFT broad-trace
warning, informational Babel large-generated-file notices, policy-runner
`NO_COLOR` notices, and request-reset messages during browser turnover remain.
Full E2E was not run.

The separate read-only reviewer initially returned changes required after
finding that per-boundary subtraction dropped 10 utilities shared only by two
or more excluded owners. It also challenged duplicated Tailwind property
registrations and required explicit root-sheet ordering evidence. The corrected
guard now covers the full candidate union, retains the 10 shared utilities once,
binds Cabinetry CSS to its semantic lazy entry, removes scoped registration
copies, and proves root availability. The reviewer reran the measurement and
compiled guards, reviewed the complete source and documentation diff, and
returned **PASS — no remaining findings**. It made no edits or commits.

Phase 8B has no remaining owned blocker: both CSS and JavaScript bundle limits
and the combined gate are green. P6-C through P6-G, CH-0003's product decision,
CH-0004, and CH-0017-through-CH-0030 behavior remain separate and were not
started. No workflow, dependency, lockfile, surface contract/data, material ID,
GLB lifecycle/cache/telemetry, schema, migration, budget raise, Full E2E, push,
or deployment is included. The implementation commit is the one focused commit
containing this record; resolve its SHA after creation. Rollback is one local
revert.
