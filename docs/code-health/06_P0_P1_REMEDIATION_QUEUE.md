# P0/P1 remediation queue

Triage date: 2026-07-31 (Asia/Singapore)

Repository: `/Users/justus/Developer/interior-ai`

Branch: `security/ch-0001-fail-closed-admin-auth`

HEAD: `62ba966ecb2011e4233c99ce1dcc0641914af008`

This queue is a post-CH-0001 evidence review. It does not authorize implementation, push, deployment, external-control changes, or release promotion. The worktree was clean at entry. Node listeners on ports 3000 and 52401 both resolved with `lsof` to the canonical repository.

## Counts and selected action

- Unresolved P0: **0**.
- Unresolved P1: **16**.
- Resolved P1: **1** (`CH-0001`).
- Former P1 findings downgraded with current evidence: **2** (`CH-0009`, `CH-0014`).
- Selected next batch: **CH-0012 canonical saved-design routing characterization and redirect/URL boundary**. It is the highest-risk `READY` P1 after higher-ranked decision-blocked findings. No implementation was started.

## Classification summary

| Finding | Severity at HEAD | Classification | Queue reason |
| --- | --- | --- | --- |
| CH-0001 | P1, resolved | RESOLVED | Repository-controlled remediation complete at the exact HEAD commit; platform controls remain explicitly unverified. |
| CH-0002 | P1 | REQUIRES_PRODUCT_DECISION | Guest retention, quotas, and legacy-overage behavior determine the safe transaction contract. |
| CH-0003 | P1 | REQUIRES_PRODUCT_DECISION | Per-operation/global budgets and limiter-outage policy are not approved. |
| CH-0004 | P1 | READY | Trusted versus browser event authority can be separated without changing valid browser analytics. |
| CH-0005 | P1 | REQUIRES_PRODUCT_DECISION | Publisher-only retirement versus a distinct emergency-withdraw role changes operational authority. |
| CH-0006 | P1 | BLOCKED_DEPENDENCY | Public/unknown consumers of the legacy catalog DTO must be inventoried before narrowing it. |
| CH-0007 | P1 | REQUIRES_PRODUCT_DECISION | Canonical catalog source/precedence and Shopify intent are product/catalog decisions. |
| CH-0008 | P1 | REQUIRES_PRODUCT_DECISION | The owner must classify 73 unspecified entries and choose the controlled status model. |
| CH-0009 | P2 | DOWNGRADED_WITH_EVIDENCE | CH-0001 now makes the bounded route allowlisted-admin-only; mutable request-time package execution remains material debt. |
| CH-0010 | P1 | REQUIRES_PRODUCT_DECISION | Irreversible revocation is fail-safe, but automatic designer sharing changes the user contract. |
| CH-0011 | P1, conditional | REQUIRES_PRODUCT_DECISION | Legal basis, consent, opt-out, masking, and project-side PostHog state require an owner decision and external verification. |
| CH-0012 | P1 | READY | Internal links demonstrably target the lossy route while the canonical query route already exists. |
| CH-0013 | P1 | READY | Gate wiring is decision-free; payload restructuring can follow behind parity fixtures. |
| CH-0014 | P2 | DOWNGRADED_WITH_EVIDENCE | Source shows per-item ownership, but no measured P1 outage, data loss, or security/privacy consequence is currently demonstrated. |
| CH-0015 | P1 | READY | Invisible focusable drawer content is a concrete accessibility/core-workflow defect and a shared primitive exists. |
| CH-0016 | P1 | READY | Strict immutable build/start/smoke is a gate-only correction with no product-policy dependency. |
| CH-0017 | P1 | READY | The first bounded batches—manifest coverage and required-test truthfulness—are decision-free. |
| CH-0018 | P1 | BLOCKED_DEPENDENCY | Supported predecessor versions and a representative sanitized fixture owner are required. |
| CH-0019 | P1 release / P2 code health | READY | Several bounded baseline batches are independent; failures must remain separate from CH-0001. |

## Finding evidence and remediation boundaries

### CH-0001 — fail-open admin authorization

- **Current evidence and affected symbols:** `lib/config.ts:getApplicationEnvironment` and `validateDeploymentEnvironmentOrThrow`, `lib/admin.ts:isAdminEmail`/`canAccessAdmin`, `lib/auth-env.ts:getAuthEnvOrThrow`, `instrumentation.ts:register`, 25 discovered admin route files, 14 admin pages, and 13 privileged CLI/background/backup/test entry points are covered by `scripts/test-auth-env-hardening.ts` and `scripts/test-admin-authorization.ts`. The former query/header audit bypass strings are rejected by the test. Commit `62ba966ecb2011e4233c99ce1dcc0641914af008` is HEAD and in current history.
- **Reach and impact:** All repository-controlled privileged surfaces are directly protected before sensitive work. No current repository evidence reopens the former security/privacy or privileged-mutation risk. External Vercel, GitHub, OAuth, scheduler, storage, and database controls are not repository-verifiable.
- **Dependencies and tests:** Focused rerun passed: `npm run test:auth-env-hardening` and `npm run test:phase7-security-boundaries`. The full authorization inventory and external checklist remain in `docs/security/`.
- **Scope and rollback:** `RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE`. No rollback is recommended; reverting the commit would restore fail-open behavior. A future regression requires concrete failing policy/route evidence, not a general reopen.

### CH-0002 — guest storage and non-atomic quotas

- **Current evidence and affected symbols:** `app/api/designs/claim/route.ts` reads up to 5 MiB, rate-limits by caller-supplied `anonymousId`, then performs `design.count` followed by `design.create`. The create/import/duplicate/floor-plan paths repeat count-before-create patterns, while `app/api/designs/merge/route.ts` transfers rows with `updateMany` and no shared quota reservation. `lib/design-route-payload.ts` owns payload boundaries but not atomic quota policy.
- **Reach and impact:** Public guest claim and authenticated core save/import/duplicate/merge paths are production reachable. Security/cost impact is storage abuse; data integrity impact is inconsistent quota enforcement under concurrency; core workflow impact is over-quota or rejected saves once policy is corrected.
- **Dependencies and tests:** Requires approved guest retention, guest/authenticated quotas, and legacy-overage behavior. Existing route/persistence tests do not cover mixed-route concurrency at the limit. Required tests: UUID rotation/replay, 19/20 parallel mixed-route requests, over-quota merge, global budgets, and transaction rollback.
- **Scope and rollback:** Add a server-minted guest capability and one atomic design-creation/quota service, migrating one route at a time. Roll back adapters per route; any schema addition rolls back only through a forward migration and fail-closed quota behavior must remain.

### CH-0003 — process-local cost limits

- **Current evidence and affected symbols:** `lib/rateLimit.ts` still owns a process-local `Map`. AI, PDF, email/share, Stripe/Shopify, GLB, telemetry, and floor-plan routes import it, while `lib/shared-rate-limit.ts` has narrower adoption. Several routes derive keys directly from `x-forwarded-for`.
- **Reach and impact:** Public and authenticated cost-bearing production routes are reachable across multiple instances. Security/availability impact is bypassable cost/compute/email control; no direct corruption path is shown; affected customer workflows can be degraded by resource exhaustion.
- **Dependencies and tests:** Product/operations must approve operation/global budgets, trusted-IP extraction, and limiter-outage policy. Required tests span two instances, cold restart, forwarded-header spoofing, global exhaustion, `Retry-After`, and backend outage.
- **Scope and rollback:** Introduce a shared limiter port and migrate the highest-cost endpoints first. Keep per-route adapters reversible; rollback must not silently change a costly operation from fail-closed to unlimited.

### CH-0004 — browser-forgeable lifecycle events

- **Current evidence and affected symbols:** `lib/app-events.ts:APP_EVENT_TYPES` includes `upgrade_checkout_completed`, `subscription_canceled`, and `webhook_failed`. `app/api/track/app-event/route.ts` accepts the complete set through its public allowlist, with authentication optional, and `app/admin/operations-data.ts` counts at least `webhook_failed` as operational evidence.
- **Reach and impact:** The ingestion route is publicly reachable. Security/integrity impact is forged server-authoritative operational data; no design-row corruption is shown; core product state is not directly changed, but alerts and release/operations decisions can be poisoned.
- **Dependencies and tests:** No product decision. Existing Phase 7 coverage does not prove browser denial for every server-only type. Add a browser/trusted schema matrix, provenance assertions, and admin aggregation exclusion fixtures.
- **Scope and rollback:** Split browser and trusted-server schemas, record provenance, and move authoritative emissions to server call sites. Roll back the browser-type narrowing independently while retaining provenance fields; never restore public authority for server-only events as a fallback.

### CH-0005 — weaker retirement authority

- **Current evidence and affected symbols:** Publish uses `requireFloorPlanPublisher` in `app/api/admin/floor-plan-imports/[id]/publish/route.ts`; standalone retirement in the sibling `retire/route.ts` uses only `canAccessAdmin`. `scripts/test-floor-plan-revision-retirement.ts` explicitly asserts the general-admin guard. CH-0001 hardened the general admin predicate but did not alter this narrower-role policy.
- **Reach and impact:** Allowlisted administrators can remove approved/published floor plans. This is an authorization/separation-of-duties issue and a public-catalog availability change; revision audit/atomicity tests reduce corruption risk, but a broader role can still affect a core published workflow.
- **Dependencies and tests:** Operations/product must choose publisher-only withdrawal or an emergency role/reason trail. Extend retirement tests for ordinary admin/reviewer denial, publisher/emergency success, reason and audit evidence.
- **Scope and rollback:** Change only the retirement capability guard and audit contract after the decision. Roll back the role check separately; preserve transaction/audit behavior and do not weaken general CH-0001 authorization.

### CH-0006 — legacy public catalog DTO exposure

- **Current evidence and affected symbols:** Unauthenticated `app/api/catalog/route.ts:GET` returns `getAllCatalogYamlEntries()` plus the registry. `lib/catalog-yaml.ts` enriches entries with `file_path`, `validation`, and `preset_validation`; `app/api/catalog/live/route.ts` already exposes a publication-filtered payload.
- **Reach and impact:** The route is publicly production reachable. It leaks deployment filesystem paths, authoring validation, and draft product data; it does not mutate data, but external consumers may bind to an unstable administrative DTO and users may see unreleased content.
- **Dependencies and tests:** Inventory repository, telemetry, and known external consumers before narrowing/removal. Required contract tests prove draft/validation/path omission, known live item presence, and old-route redirect or authorization behavior.
- **Scope and rollback:** First characterize consumers, then redirect, protect, or replace the response with the stripped live DTO. Keep a versioned compatibility adapter for rollback; do not restore absolute paths or drafts to satisfy an unknown client silently.

### CH-0007 — parallel catalog truths and non-transactional authoring

- **Current evidence and affected symbols:** `lib/catalog/data.ts`, `lib/catalog/registry.ts:CATALOG_ITEMS_MAP`, 144 current YAML files, `lib/useDesignPageImportedModels.ts`, and `lib/catalog/imported-model-assembly.ts` still form multiple projections; the latter mutates `CATALOG_ITEMS_MAP`. `app/api/admin/catalog/[catalogItemId]/route.ts` updates Prisma before `fs.writeFile`, so a filesystem failure can leave divergence. Shopify validates the static catalog path.
- **Reach and impact:** Editor, public API, admin authoring, export, and commerce are production reachable. Integrity/corruption risk is inconsistent identity/state across sources and partial DB/YAML commits; core browsing/purchase/export workflows can disagree.
- **Dependencies and tests:** Catalog/product owner must choose durable source and precedence and decide Shopify intent. Required parity, immutable-registry, authoring fault-injection, and reachable-commerce tests are absent as one coherent gate.
- **Scope and rollback:** Generate versioned immutable projections and migrate one consumer at a time; replace DB-then-filesystem authoring with the chosen durable/outbox flow. Roll back by projection version/adapter, retaining the source commit and never overwriting complete dirty catalog files.

### CH-0008 — fail-open publication status

- **Current evidence and affected symbols:** `lib/catalog-publication.ts:isLiveCatalogEntry` still treats every status outside a short non-live set as live. `scripts/test-catalog-live-gate.ts` explicitly keeps a no-status item live-compatible. `lib/catalog-audit.ts` does not enforce a publication enum across the catalog.
- **Reach and impact:** Public catalog/editor projections consume this classification. Unknown/typo/retired states can publish, creating product confidentiality and catalog-integrity risk and incorrect core browsing/purchase availability.
- **Dependencies and tests:** The owner must choose the canonical states and classify 73 audited unspecified entries. Add allowed-state, typo/unknown/retired/archived denial, migration, public API, and editor parity tests.
- **Scope and rollback:** Add an explicit temporary legacy mapping, migrate reviewed entries, then fail closed. Roll back the consumer to the versioned prior projection if needed; never remove validation while leaving unknown values implicitly live.

### CH-0009 — request-time network CLI

- **Current evidence and affected symbols:** `lib/asset-pipeline/normalize.ts` and `optimize.ts` still call `execFileSync("npx", ["-y", "@gltf-transform/cli", ...])`; the CLI is not pinned as an application dependency. The route bounds uploads at 80 MiB and, after CH-0001, `app/api/tools/glb-optimizer/route.ts` requires a valid allowlisted administrator before body/process work.
- **Reach and impact:** Production reachable only to allowlisted admins. Mutable package execution and synchronous compute remain server supply-chain/availability risks; no public trigger, data-corruption path, or demonstrated core-customer outage remains at HEAD.
- **Dependencies and tests:** No product decision. Add offline/no-`npx`, malformed/external-resource, timeout, concurrency, output-bound, and cleanup tests.
- **Scope and rollback:** Pin the tool and invoke a resolved local worker/library with resource bounds. Rollback may disable optimization cleanly; it must not fall back to network installation. Classification is `DOWNGRADED_WITH_EVIDENCE` to P2.

### CH-0010 — revoked share links can return

- **Current evidence and affected symbols:** `DELETE app/api/designs/[id]/share/route.ts` sets only `shareEnabled: false`. The POST path reuses `design.shareToken` unless explicit regeneration is requested. `lib/useDesignPagePersistence.ts` automatically calls `enableShare` when a designer-mode design loads or when designer mode becomes active.
- **Reach and impact:** Authenticated sharing and public link reads are core production workflows. This is a privacy/revocation defect: a recipient URL believed revoked can work again; no underlying design-row corruption is shown.
- **Dependencies and tests:** Product must decide automatic designer sharing, while permanent token invalidation should remain fail-safe. Add disable/reload/auto-enable/re-enable concurrency tests proving the old token never works and a new token does.
- **Scope and rollback:** Rotate/clear tokens on disable-to-enable and separate explicit sharing from mode entry. Roll back UI policy independently; do not roll back irreversible token revocation semantics.

### CH-0011 — replay consent and masking

- **Current evidence and affected symbols:** `app/providers/PostHogProvider.tsx` sets `disable_session_recording: isDevelopment`, so configured non-development deployments enable replay. No application consent/opt-out state or explicit masking/blocking policy is present in that initializer; `app/layout.tsx` supplies the provider.
- **Reach and impact:** Production client sessions are reachable when a usable PostHog key is configured. Potential privacy/legal impact includes captured room designs, addresses, and inputs; no database corruption path exists, but trust and core design privacy are affected.
- **Dependencies and tests:** Privacy/legal/product decision plus verification of project-side PostHog settings is required. Add pre/post-consent, opt-out, masking/block selectors, environment matrix, and no-preapproval-replay network assertions.
- **Scope and rollback:** Default recording off, then add the approved consent/masking model. Rollback must remain default-off. Classification stays conditional until external project state is verified.

### CH-0012 — lossy saved-design routing

- **Current evidence and affected symbols:** `components/DesignsListWithSelection.tsx`, `components/DuplicateDesignButton.tsx`, and `app/checkout/success/page.tsx` link to `/design/[id]`. `app/design/[id]/page.tsx` casts `design.items` through `unknown` and renders legacy `DesignerCanvas`. `components/editor/design-page/DesignPageWorkspace.tsx` already loads `?designId=` through the canonical editor.
- **Reach and impact:** Dashboard, duplicate, checkout-success, and direct legacy URLs are production-reachable core workflows. There is no direct security impact; the lossy adapter can omit modern room/floor/material/capability meaning and create apparent data loss or divergent saves.
- **Dependencies and tests:** No product decision if the canonical editor is authoritative; inventory external old links during characterization. Add a named route/helper test plus dashboard/duplicate/checkout/direct-old-URL Playwright coverage using a modern multi-room/floor-plan/material fixture, auth redirects, query preservation, reload, and back navigation. Existing `npm run verify:design-persistence` is required.
- **Scope and rollback:** First batch: characterize both URLs, add one canonical URL helper, and turn the old route into a safe redirect/adapter while updating internal callers. Roll back callers first; retain the compatibility redirect until reference/telemetry proof permits removal. This is the **selected next batch**.

### CH-0013 — generated surface payload and drift contract

- **Current evidence and affected symbols:** `lib/generated/surface-material-runtime.generated.ts` is 92,044 lines and 2,518,834 bytes. `scripts/generate-surface-material-runtime.ts` has `--check`, but `package.json` and CI still lack named generate/check/schema commands. The current Phase 8 run passes CPU fingerprint budgets and then fails the initial-JS raw budget at 7,068,799 versus 6,955,000 bytes.
- **Reach and impact:** The client bundle and material browsing/render paths are production reachable. No security or persistent corruption path is confirmed; release performance, parse/download cost, and accidental draft/fixture payload risk affect core editor responsiveness.
- **Dependencies and tests:** Gate wiring needs no decision; payload restructuring needs render/export parity and confirmation of offline Pro browsing expectations. Add named drift/schema commands, fixture exclusion, Consumer/Pro visibility, selected/saved material parity, and raw/Brotli bundle gates.
- **Scope and rollback:** Wire existing checks first with no generated content change; then split compact render data from lazy authoring metadata behind the current facade. Roll back per projection version; source plus generated output remain atomic.

### CH-0014 — per-item 3D ownership

- **Current evidence and affected symbols:** `components/scene/FurnitureItem.tsx` registers per-item key listeners and `useFrame`; `components/scene/GLBScaledModel.tsx` creates loaders/decoders, loads, clones, and disposes per instance. Current evidence does not include the required 10/100/500-item regression measurements or a demonstrated customer outage.
- **Reach and impact:** The 3D editor is production reachable. The concern is cumulative CPU/memory/event/resource reliability; no direct security/privacy or persistence-corruption effect is proven, and core impact remains a scale hypothesis rather than a measured P1 failure.
- **Dependencies and tests:** No product decision. First establish same-URL load counts, listener counts, idle frames/CPU, heap/resource proxies, retry/error, clone isolation, and disposal at 10/100/500 items.
- **Scope and rollback:** Introduce a resource repository and central keyboard owner one asset/caller at a time behind existing render props. Roll back by asset class with the old adapter retained briefly. Classification is `DOWNGRADED_WITH_EVIDENCE` to P2 pending measurements.

### CH-0015 — inaccessible drawer/overlay ownership

- **Current evidence and affected symbols:** Closed `components/ItemCartDrawer.tsx` remains mounted and is only translated off-screen. `components/editor/design-system/EditorDialog.tsx` already owns role, focus trap/return, Escape, and backdrop semantics, while several overlays use custom lifecycles.
- **Reach and impact:** Cart and editor overlays are production-reachable core workflows. Keyboard and assistive-technology users can focus invisible controls or lose context; this is accessibility and workflow impact, not data corruption or a security boundary.
- **Dependencies and tests:** No decision unless a named surface must be non-modal. Add closed/open tab order, axe, accessible name, Escape, outside-click, focus-return, narrow-viewport, and nested-prompt tests.
- **Scope and rollback:** Migrate one overlay at a time to the shared primitive without visual/domain redesign. Roll back a single overlay adapter independently.

### CH-0016 — non-equivalent CI artifact

- **Current evidence and affected symbols:** `.github/workflows/ci.yml` still sets `CATALOG_STRICT_VALIDATION=false`. `playwright.config.ts` defaults local smoke to `npm run dev`; the workflow builds first but does not set `PLAYWRIGHT_USE_PRODUCTION_SERVER=1` for runtime smoke. Full E2E remains informational and `continue-on-error`.
- **Reach and impact:** This affects every merge/release validation path, not runtime authorization directly. It can certify an artifact different from the one built for release, masking catalog/startup/tracing defects and allowing core workflow regressions to ship.
- **Dependencies and tests:** Requires CI environment/secret inventory but no product semantics. Add invalid-catalog build failure, build-ID/runtime identity, production-start smoke, no-dev-fallback, and traced-output inventory tests.
- **Scope and rollback:** Make strict build and exact `npm start` artifact smoke required, leaving developer smoke separate. Roll back workflow wiring only for infrastructure failure with a named blocking issue; never label dev smoke production evidence.

### CH-0017 — omitted and false-pass tests

- **Current evidence and affected symbols:** `tests/e2e/05-buy.spec.ts` and `07-kelsey-variants.spec.ts` still annotate and return when core prerequisites/assertions are absent. Full E2E is non-required. `test:floor-plan-live-progress` exists but is absent from `test:floor-plan-required` and CI; several critical package suites are not merge-required. `scripts/vercel-prebuilt-release.mjs` consumes pass/expected counts but cannot make skipped assertions execute.
- **Reach and impact:** This is release-evidence reachability. It does not directly mutate user data, but false green results can allow security, persistence, commerce, and core workflow defects through the merge/release process.
- **Dependencies and tests:** Initial manifest and live-progress wiring are decision-free; deterministic commerce fixtures need CI runtime/fixture owners. Add a meta-test for unclassified tests and early-return gate patterns plus reporter pass/skip/not-run assertions.
- **Scope and rollback:** Start with test classification and the omitted live-progress command, then remove early returns using deterministic fixtures. Roll back each gate wiring change separately while recording a blocking issue; never weaken an assertion to obtain green.

### CH-0018 — fresh-only migration validation

- **Current evidence and affected symbols:** `scripts/provision-gate-a3-database.mjs` runs `prisma migrate deploy` on the configured gate database and counts completed rows; it does not run a populated supported-predecessor upgrade or schema diff. `prisma/migrations/20260211150315_add_user_to_design/migration.sql` contains a nonempty-design failure path later compensated by another migration. `lib/phase15-release-evidence.ts` accepts a nonblank migration version, and release docs still mention 38 while 42 directories exist.
- **Reach and impact:** Deployment/migration tooling reaches production data during release. The concrete high-impact risk is upgrade failure or data loss despite a green blank install; core availability and persisted designs are affected.
- **Dependencies and tests:** Release/DB owners must select supported predecessors and own representative sanitized fixtures. Required tests: blank deploy, populated predecessor upgrade, Prisma/schema diff, ordered digest, and row/invariant hashes.
- **Scope and rollback:** Add evidence/digest gates before any migration rewrite; repair history only through a separately designed forward migration. Rollback is restore/recovery against the verified target, never destructive reset or casual historical edit.

### CH-0019 — red baseline and masked assertions

- **Current evidence and affected symbols:** The four inherited groups remain exactly reproducible: `CatalogPanel.tsx:358` hook error; `FloorPlanImportAssistant.tsx:294` hook warning; `scripts/test-command-bar-save-status.ts:34` stale size-literal assertion (`h-7` expected while the implementation is `h-[30px]`, with the same `md:flex` behavior); and five invalid `shape`/`room_compatibility` values in three Hamilton YAML files. Separately, `check-design-page-architecture.mjs` fails at 594/550 and 361/300, the Phase 8 raw bundle is 7,068,799/6,955,000 bytes, and Pro visual policy is 2/4 because `open-custom-millwork-studio` is hidden in Chromium and WebKit.
- **Reach and impact:** These failures block CI or release evidence. The inherited four do not establish P0/P1 runtime defects individually; the hidden paid-Pro entry can block a core workflow, while architecture and bundle failures are release/maintainability/performance constraints. No CH-0001 regression evidence exists.
- **Dependencies and tests:** Command-bar intended responsive behavior and Cabinet Preview visibility require confirmation; the other bounded batches are ready. Retain exact failing commands and run timing/visual gates twice where applicable.
- **Scope and rollback:** Use Baseline A (React hooks), Baseline B (save-status contract), and Baseline C (Hamilton vocabulary) as separate commits; group the warning with Baseline A only if small and independently reviewable. Handle architecture, bundle, and Cabinet Preview as separate follow-ups. Each rollback is one bounded commit; no suppressions, schema weakening, budget raises, or combined cleanup.

## Four inherited failure groups

| Group | Likely severity | CI/release block | Runtime risk | Before large refactor? | Bounded batch |
| --- | --- | --- | --- | --- | --- |
| `CatalogPanel.tsx:358` `set-state-in-effect` | P2 | Yes: lint error blocks `stable-checks`. | Low-to-moderate render/state-ownership risk; no incorrect result reproduced. | Yes. | Baseline A: characterize filter reset, move ownership out of the synchronous effect, focused catalog tests/lint. |
| `FloorPlanImportAssistant.tsx:294` unnecessary dependency | P3 | Yes under `--max-warnings=0`. | Low; it is an unnecessary dependency, not a missing dependency. | Yes, preferably with Baseline A only if independently reviewable. | Remove only the unnecessary dependency and run focused floor-plan assistant tests/lint. |
| `test-command-bar-save-status.ts:34` | P3 stale contract assertion | Yes: stops `test:design-page-cleanup` and masks later checks. | No runtime defect demonstrated; current source retains `md:flex` and uses an equivalent 30 px height token rather than `h-7`. | Yes. | Baseline B: characterize responsive behavior, then update only the stale contract unless product evidence requires UI change. |
| Five Hamilton YAML vocabulary failures | P2 data-quality defect | Yes: blocks catalog audit and strict release validation. | Low-to-moderate catalog filtering/recommendation mismatch; no crash or corruption reproduced. | Yes. | Baseline C: map `l_shaped` and `guest_room` to already-approved vocabulary in the three source YAMLs; run strict catalog/asset/product tests. |

The four groups are independent of CH-0001. The separately confirmed design-architecture, raw-bundle, and Cabinet Preview failures are also independent of CH-0001, but they are not included in the four-group inheritance claim and need their own batches.

## Ordered remediation queue

Risk order includes blocked findings so decisions are visible; `READY` ordering determines executable work.

1. `CH-0002` — `REQUIRES_PRODUCT_DECISION` (highest storage/cost/integrity exposure).
2. `CH-0007` — `REQUIRES_PRODUCT_DECISION` (catalog identity and partial-authoring integrity).
3. `CH-0008` — `REQUIRES_PRODUCT_DECISION` (fail-open public product availability).
4. `CH-0012` — `READY`, **selected next batch** (highest-risk READY core workflow/data-fidelity issue).
5. `CH-0016` — `READY` (production-equivalent artifact evidence).
6. `CH-0017` — `READY` (required test truthfulness and coverage).
7. `CH-0018` — `BLOCKED_DEPENDENCY` (populated upgrade/data-loss evidence).
8. `CH-0010` — `REQUIRES_PRODUCT_DECISION` (permanent share revocation and auto-sharing).
9. `CH-0011` — `REQUIRES_PRODUCT_DECISION` (privacy consent/masking and external PostHog state).
10. `CH-0004` — `READY` (trusted event provenance).
11. `CH-0006` — `BLOCKED_DEPENDENCY` (legacy public API consumers).
12. `CH-0003` — `REQUIRES_PRODUCT_DECISION` (distributed cost budgets/outage policy).
13. `CH-0005` — `REQUIRES_PRODUCT_DECISION` (retirement authority).
14. `CH-0013` — `READY` (surface drift/schema gates, then payload).
15. `CH-0015` — `READY` (accessible overlay ownership).
16. `CH-0019` — `READY` in bounded baseline batches and required before architectural refactoring.

`CH-0009` and `CH-0014` remain queued as P2; neither competes in the P1 decision rule. Baseline A/B/C should be accumulated as independent reviewed fixes before architectural refactoring, but the single next selected P1 remains CH-0012.

## Selected batch contract: CH-0012 only

Likely files and symbols:

- new `lib/design-editor-url.ts` canonical URL helper;
- `app/design/[id]/page.tsx` legacy loader/redirect boundary;
- `components/DesignsListWithSelection.tsx` saved-design link;
- `components/DuplicateDesignButton.tsx` post-duplicate navigation;
- `app/checkout/success/page.tsx` design continuation link;
- `components/editor/design-page/DesignPageWorkspace.tsx` canonical `designId` loading contract, only if characterization exposes a boundary gap;
- new focused script and Playwright characterization for dashboard, duplicate, checkout success, direct legacy URL, authentication, and query preservation.

Required validation commands for that future implementation batch:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
npm run test:design-editor-routing
npm run verify:design-persistence
npm run check:code-quality
npx eslint 'lib/design-editor-url.ts' 'app/design/[id]/page.tsx' components/DesignsListWithSelection.tsx components/DuplicateDesignButton.tsx app/checkout/success/page.tsx --max-warnings=0
npm run typecheck
npx playwright test tests/e2e/design-editor-routing.spec.ts --project=chromium
APP_ENV=development npm run build
git diff --check
git status --short
```

`test:design-editor-routing` and `tests/e2e/design-editor-routing.spec.ts` are planned new characterization artifacts, not commands/files currently present. `npm run test:design-page-cleanup` should also be run as an inherited-baseline comparison, but it must remain reported as failing until Baseline B and the masked architecture ratchet are resolved.

Rollback: revert internal link callers first and keep `/design/[id]` as a compatibility redirect/adapter; remove the legacy renderer only after reference, telemetry, and parity proof. No document rewrite, migration, schema change, or feature flag is part of the first batch.
