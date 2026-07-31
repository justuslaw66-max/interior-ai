# Quality gates plan

## Gate principles

- A pass means the assertion executed; missing fixtures are failures in a required gate, not annotated early returns.
- Fast presubmit checks protect every change. Risk-triggered suites protect the domains touched. Preview smoke validates a batch on an immutable production build. Full Gate A3 certifies only the exact artifact ready for stable-staging promotion.
- Generated, migration, catalog, and release evidence is tied to a digest and source commit.
- Thresholds are ratchets: investigate variance, optimize, or document a dated exception; do not raise a budget inside a feature/refactor change.
- Test artifacts are machine-readable and remain ignored/ephemeral unless deliberately checked in as a stable baseline.

## Proposed command classes

### Required on every pull request

These should be deterministic and blocking:

1. secret scan and clean dependency install (`npm ci`);
2. `git diff --check` and, after a separate adoption decision, `npm run format:check`;
3. `npm run lint -- --max-warnings=0`;
4. `npm run typecheck` and proposed `npm run typecheck:e2e`;
5. `npx prisma validate`;
6. proposed test-manifest audit and server/client import-boundary check;
7. `npm run test:design-page-cleanup`;
8. `npm run verify:design-persistence`;
9. `npm run test:auth-env-hardening` plus `npm run test:phase7-security-boundaries`;
10. `npm run test:floor-plan-required`, amended to include `test:floor-plan-live-progress`;
11. `npm run test:designer-theme-contrast` and `npm run test:cabinetry-preview-renderer`;
12. generated surface `--check` and surface schema test through named package commands;
13. `npm run assets:inventory:strict`;
14. `npm run test:catalog-audit` and `npm run test:catalog-asset-availability`;
15. strict staging-equivalent `npm run build`.

The complete `verify:cabinetry` and all floor-plan subgroups need not run redundantly if the manifests prove the same commands are included. The manifest should emit an expanded command report so coverage is inspectable.

### Risk-triggered required checks

The test manifest maps changed paths/CH IDs to additive gates:

| Risk area | Required checks |
| --- | --- |
| Authentication/admin/security | environment/admin matrix, phase 7 security, negative API authorization matrix |
| Persistence/document/routes | `verify:design-persistence`, canonical-route E2E, share/duplicate/import fixtures |
| Prisma/migrations | blank deploy, predecessor upgrade, schema diff, data invariants, migration digest |
| Catalog/materials/commerce | strict audit, publication negatives, registry parity, surface checks, Stripe/Shopify contract tests, buy/variant E2E |
| Floor-plan import/publication | full required floor-plan manifest, worker/storage/retention tests, publisher negative tests |
| Cabinetry | `verify:cabinetry` and focused browser studio path |
| Scene/3D/assets | scene boundaries, GLB/render bounds, Phase 8, bundle, visual fixtures, memory/disposal benchmark |
| Sharing/export/PDF | persistence, token revocation, public share/export E2E, bounded request/tool tests |
| Accessibility/overlays | static editor/cabinetry accessibility, keyboard/focus/axe Playwright |
| Billing/entitlements | `test:stripe-pro`, deterministic Pro upgrade and webhook/idempotency E2E |

Changed-path routing is an optimization only. A developer can opt into more suites; the final preview/release stages do not rely on path inference.

### Immutable preview gate after a related batch

1. Build once with strict staging-equivalent configuration.
2. Record commit SHA, Next build ID, Node/npm/lockfile, catalog digest, generated-surface digest, and migration digest.
3. Start that exact output with `npm start` or prebuilt preview deployment; never `npm run dev`.
4. Probe shallow and protected readiness.
5. Run `tests/e2e/00-runtime-smoke.spec.ts`, Pro visual policy, the changed domain’s critical path, and Consumer/Pro capability parity.
6. Store Playwright JSON/JUnit, traces on failure, bundle report, and environment metadata.

### Release-candidate Gate A3

Run once on the exact immutable artifact intended for stable-staging promotion:

- every pull-request and risk-triggered gate;
- blank database deploy and populated supported-predecessor upgrade;
- full Playwright suite with no `continue-on-error`, explicit allowed skips, Linux visual baselines/job, and deterministic commerce fixtures;
- cross-browser policy subset where supported;
- full cabinetry browser and export flows;
- security/abuse/concurrency cases for changed boundaries;
- bundle, large-project CPU, scene memory/frame, and route/load budgets;
- release-evidence validation bound to code/build/catalog/generated/migration/database digests.

Any code, generated source, catalog, migration, lockfile, configuration, or build-environment change after certification invalidates the artifact. Narrowly test the change during iteration, accumulate approved fixes, then recertify the final artifact.

## Generated and data gates

Add named commands (names illustrative but should remain stable once introduced):

- `generate:surface-material-runtime`: write generated source;
- `check:surface-material-runtime`: run generator in `--check` mode;
- `test:surface-material-schema`: validate all authoring YAML;
- `check:test-manifest`: every `scripts/test-*`/E2E file classified;
- `check:migration-digest`: ordered directories, checksums, schema and evidence match;
- `check:catalog-projections`: authoring source and immutable client/server projections match selected policy.

CI uses check mode only. A generated diff must be produced locally by the generator and reviewed with source changes. Test fixtures live in test-only modules and are rejected from production chunks with sentinel scans.

## Performance and bundle budgets

Current repository budgets are already red and must be restored before ratcheting:

- Phase 8 large `fingerprintCold` p95: 6 ms budget; audit observed 11.218 ms once.
- Initial JS: current budget 6,955,000 raw / 1,130,000 Brotli; audit/subaudit measured approximately 7,068,799 raw / 1,160,288 Brotli.
- Largest observed initial client chunk: approximately 3,788,751 raw bytes and contains surface material data.
- Cabinetry large run: audit p50 32.74 ms, p95 33.14 ms for 24 modules/318 parts; retain current repository regression bounds.
- Floor-plan geometry validation: 12,000 walls in approximately 5 ms during audit; retain fixture and regression policy.

Measurement policy:

- run cold/warm cases separately with pinned Node, production build, machine metadata, fixed fixtures, and at least the repository’s statistically meaningful sample count;
- require two confirming runs before declaring a noisy regression or recovery;
- report median, p95, max, raw/compressed bytes, changed chunks/routes, and test data digest;
- add scene benchmarks for 10/100/500 items: unique/repeated assets, load/decode count, heap/GPU-resource proxies, idle frames/CPU, interaction p95, and disposal after unmount;
- use absolute ceilings plus “no material regression from base commit” for touched routes;
- store summaries as CI artifacts, not hand-edited evidence files.

After recovery, lower raw/compressed and hotspot budgets in small steps; never accept a surface split that merely moves equivalent eager bytes to another initial chunk.

## Architecture and static boundaries

Keep the existing no-cycle checks and add:

- resolved client-import graph: reject Prisma, auth secrets, Node filesystem/process-only modules, non-public env, server integrations;
- route dependency rule: direct database access allowed only through grandfathered baseline or application repository/service, with touched-file ratchet;
- renderer rule: no persistence imports or global keyboard listener below editor scope;
- catalog rule: no mutation of registry exports; public DTO excludes authoring fields;
- hotspot ratchet: no increase to physical/logical/component/function budgets in touched files; each extraction lowers the recorded baseline;
- generated rule: generated files contain provenance header and pass check mode.

Architecture limits are not style goals by themselves. A module can remain large when it is generated/data or a cohesive algorithm with strong tests. Behavior-heavy, high-churn, multi-owner functions are the extraction priority.

## Test-result truthfulness

The release reporter must record per test: passed, failed, skipped with approved reason, expected failure with expiry, not run, and infrastructure failure. It must reject:

- a required test that returns before its core assertion;
- missing prerequisite/fixture in a gate suite;
- zero discovered tests;
- expected-failure or skip without owner/reason/expiry;
- platform snapshot absence disguised as an assertion failure;
- artifact build ID different from the tested server.

Required smoke should state the server command and base URL in its artifact. The audit’s first Pro visual attempt failed at sandbox server binding; the approved rerun reached the app and revealed the real UI failure. Reporting must preserve that distinction.

## Database safety

- No test command may infer or reset a database merely from a name containing “dev.”
- Provision dedicated ephemeral databases with unique identifiers and explicit `APP_ENV=test`/gate marker.
- Before destructive setup, assert host/database allowlist, active-connection policy, and absence of production/staging markers.
- Never rewrite historical migrations casually. Test the historical chain, then add forward repair/migration where required.
- Upgrade fixtures include representative nonempty designs, users, shares, guest claims, subscriptions, catalog/admin data, floor-plan jobs/assets/evidence, and current progress/ETA rows.
- Record row/invariant hashes before and after migration and ensure failure leaves recoverable state.

## Artifact policy

Ephemeral/ignored: `.next/`, `.local/asset-inventory.json`, coverage, Playwright report, `test-results`, traces, videos, screenshots from failures, benchmark JSON, temporary databases. CI uploads relevant items with retention and secret/path redaction.

Tracked only by deliberate review: platform visual baselines, generated surface runtime, schema/migrations, catalog authoring data, deterministic golden fixtures, and release manifests. Generated/local artifacts such as `test-results/.last-run.json` and `prisma/dev.db` should be untracked in CH-0027 after clean-clone proof.

## Merge and release policy

- No new P0/P1 finding or red required gate can merge without named owner, documented scope, compensating control, expiry, and release approver.
- Existing baseline failures are not blanket waivers; Phase 0 resolves or grants narrow, expiring exceptions one by one.
- Security and data fixes favor fail closed and forward migration; feature flags cannot create unauthorized fallback paths.
- A refactor batch is rejected if behavior changes are not called out, if test assertions are weakened in the same commit, or if rollback requires restoring an entire dirty file.
- Promotion requires a clean source commit and evidence for the exact artifact. No push/deploy/promotion is part of this audit.
