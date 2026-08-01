# P0/P1 remediation queue

Triage date: 2026-07-31 (Asia/Singapore)

Repository: `/Users/justus/Developer/interior-ai`

Branch: `fix/ch-0017-required-test-truthfulness`

CH-0017 starting HEAD: `cea0cabe53742da8b47c1e119d889033351a1fdf`

Post-triage documentation checkpoint: `195deacba6e22293b4e887dd4b4bb5203028c0fb`

This queue began as a post-CH-0001 evidence review and now includes completed CH-0012 and CH-0016 repository remediations plus the reopened CH-0017 exact-head follow-up. It does not authorize another finding, push, deployment, external-control changes, or release promotion. CH-0017 started from clean `cea0cabe53742da8b47c1e119d889033351a1fdf`; Outcome D was reproduced from exact head `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`; the next external run exercised exact head `701aaa473518a0a4fdbc9cf9809dd8bd1bac918a`; CH-0001, CH-0012, and CH-0016 were ancestors. The listening Node process resolved with `lsof` to the canonical repository before code edits.

## Counts and selected action

- Unresolved P0: **0**.
- Unresolved P1: **14** (including reopened `CH-0017`).
- Resolved P1: **3** (`CH-0001`, `CH-0012`, `CH-0016`).
- Former P1 findings downgraded with current evidence: **2** (`CH-0009`, `CH-0014`).
- Selected active batch: **reopened CH-0017 required-test truthfulness**. CH-0004 remains the next otherwise-READY P1, but it is paused and was not started.

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
| CH-0012 | P1, resolved | RESOLVED | Supported editable entry points now converge on the canonical persisted-document loader; legacy bookmarks temporarily redirect. |
| CH-0013 | P1 | READY | Gate wiring is decision-free; payload restructuring can follow behind parity fixtures. |
| CH-0014 | P2 | DOWNGRADED_WITH_EVIDENCE | Source shows per-item ownership, but no measured P1 outage, data loss, or security/privacy consequence is currently demonstrated. |
| CH-0015 | P1 | READY | Invisible focusable drawer content is a concrete accessibility/core-workflow defect and a shared primitive exists. |
| CH-0016 | P1, resolved | RESOLVED | Strict clean-source build, artifact/trace hashing, production start, and health/report identity now fail closed; CI upload/retention is configured but external execution and platform acceptance remain unverified. |
| CH-0017 | P1, reopened | REOPENED | Exact-head 701aaa repository defects are fixed locally, but a new workflow run, artifact downloads, and required GitHub status-check configuration remain unverified. |
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

- **Status:** RESOLVED — repository-controlled remediation complete. The local implementation commit is the commit containing this record; resolve its SHA after creation. No push or deployment was performed.
- **Verified root cause:** Three production callers hard-coded `/design/[id]`, which selected an independent server-loaded `DesignerCanvas` adapter rather than the canonical v3 persistence path. The adapter cast items through `unknown` and omitted multi-room geometry, floor-plan/opening data, surface finishes/opacity, zones, saved views, and modern capability state. Route inventory then exposed three related identity defects: My Designs changed state without changing URL, denied route loads could leave a prior document under the denied identity, and a loaded floor-plan revision copy could retain the source URL.
- **Canonical URL contract:** `/design?designId=<percent-encoded opaque ID>` is the editable saved-design route. Consumer/default mode omits `mode`; only the verified `mode=designer`, `view=2d`, `workspace=furnish`, and explicitly supplied encoded `floorPlanImport` value can be added. Arbitrary `next`, redirect, return, or analytics parameters are dropped. The URL can request Designer presentation but cannot grant Pro: `/api/me` plan/capabilities remain authoritative. Empty IDs are rejected by the helper. `GET /api/designs/[id]` remains owner-or-enabled-valid-share-token and returns 404 otherwise; writes remain owner-only.
- **Implemented boundary:** `lib/design-editor-url.ts` is the single typed URL builder. Dashboard, duplicate success, checkout success, My Designs, denied-load recovery, and floor-plan revision-copy navigation use it. `/design/[id]` performs a temporary server redirect and no longer imports authentication, Prisma, or `DesignerCanvas`. The route forwards only verified context. Canonical loading treats IDs as opaque, waits for session/local-backup hydration, suppresses stale/superseded callbacks, restores the prior canonical URL or `/design` on failure, and guards floor-plan copy navigation with an operation generation invalidated on unmount. `MyDesignsDialog` is open-gated and lazy so the fix does not worsen initial JS.
- **Reach and impact after remediation:** Dashboard, in-editor My Designs, duplicate, checkout-success, old bookmarks, canonical direct load, refresh, browser back/forward, Consumer, Designer, and floor-plan revision copies all reach the same v3 loader and persistence identity. Existing floor-plan import assistant/history URLs were already canonical and were retained. `/share/[shareToken]` remains the canonical read-only share/client-preview path; `/d/[token]` is an orphaned read-only compatibility route with no discovered internal producer and is not an editable fallback. Billing success has no saved-design ID, and no distinct recent-design entry was found.
- **Tests and evidence:** Named source/helper guard; persistence umbrella; rich database-backed Chromium fixture; exact duplicate response ID and failure-no-navigation; checkout present/missing context; legacy redirect allowlist and Pro non-escalation; My Designs history/refresh; denied-ID owner isolation and context restoration; startup create/write monitoring; floor-plan copy generation guard; existing share duplicate smoke. Final Chromium results are 6/6 in 3.0 minutes plus 4/4 in 16.7 seconds.
- **Scope and rollback:** The batch changes routing, the persistence call surface made obsolete by route-driven My Designs, the directly related revision-copy continuation, the on-demand dialog boundary needed for bundle no-worsening, focused tests, and these records only. Revert the one implementation commit for full rollback; for a partial emergency rollback, revert callers first and retain the compatibility redirect. No schema, migration, saved-document rewrite, dependency, auth redesign, or feature flag is involved.

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

- **Status and commit:** `RESOLVED — REPOSITORY REMEDIATION COMPLETE; EXTERNAL EXECUTION/VERIFICATION REQUIRED` at `cbed3550026e2803675f740b49be5fb15f15612b`. No GitHub/Vercel execution, push, or deployment occurred.
- **Verified root cause:** Required CI explicitly forced `CATALOG_STRICT_VALIDATION=false`, built once, then allowed runtime smoke to select `npm run dev`, creating a second development compilation. Neither smoke JSON nor health proved the built artifact ID. Existing Vercel source inspection used `--untracked-files=no`. Rebuilt pre-fix trace evidence exposed `.env`, `.env.local`, and a private release-evidence file through the broad trace closure.
- **Implemented evidence flow:** `scripts/production-artifact-evidence.mjs` owns build, serve, smoke, and verification. It requires clean tracked/untracked/submodule state, no influential local env file, exact candidate/commit, `npm ci --include=dev`, lock/install hashes, existing generated-source drift check, strict staging/production configuration shape, and one fresh production build. It hashes `.next` and `public`, validates every NFT trace, records the Next build ID, starts unchanged `npm run start` through a revalidating wrapper, and binds health plus Playwright JSON to the same source/artifact/build. Canonical manifest/report hashes, timestamps, test counts, and fixed external-control statuses are revalidated.
- **Fail-closed coverage:** Focused temporary-repository cases cover happy path, dirty tracked and untracked source, source/lock/generated/artifact/report/stale/missing/environment/development/server/test-count/same-artifact/external-control/secret/trace failures, manifest sidecar tampering, strict invalid-catalog rejection, no dev fallback, no listener reuse, CI strict wiring, and Vercel untracked-source inspection.
- **Validation and limitations:** Strict staging diagnostic build passed. Post-build inventory: 112 NFT files, 42,879 references, zero missing paths, and zero prohibited paths. The Turbopack broad-tracing warning remains and is reported rather than reclassified. Final exact-clean-candidate build/smoke/verify and independent review are recorded in `HANDOFF.md`. Detached-worktree output is ephemeral; durable evidence requires an actual GitHub Actions upload whose execution and retention are confirmed by the platform. The same inherited Phase 8 gate remains red at 7,062,575/6,955,000 raw bytes, but the measurement decreased by 6,224 bytes from 7,068,799 and did not worsen. CH-0013, CH-0017, CH-0018, other inherited baseline failures, and external controls remain untouched/unverified.
- **Scope and rollback:** Gate/evidence/configuration/docs only; no dependency, schema, migration, catalog content, production data, product behavior, or external setting. Revert the single implementation commit; that restores lenient/dev evidence and is not a recommended steady state.

### CH-0017 — omitted and false-pass tests

- **Status:** `REOPENED AFTER OUTCOME D — REPOSITORY FOLLOW-UP COMPLETE LOCALLY; EXTERNAL WORKFLOW AND ENFORCEMENT VERIFICATION REQUIRED`. Original implementation: `c840c06dc2c5e67f463542292bb7391b0f93d731`; first external-hardening follow-up: `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`; Outcome-D follow-up: the commit containing this record.
- **Verified root cause:** `05-buy.spec.ts` and `07-kelsey-variants.spec.ts` turned absent prerequisites into expected Playwright passes; the cabinetry GLB export check swallowed a missing `FileReader` and exited zero; live progress was omitted from the required floor-plan chain; critical domain suites lacked a required CI owner; the full-E2E job was advisory without a distinct release contract; Gate A3 trusted aggregate counts/URL without child status, file/project scope, stable identities, freshness, or artifact-bound evidence; cabinetry used a minimum count; CH-0016 runtime smoke trusted aggregates rather than its two requirement identities.
- **Implemented contract:** The canonical manifest classifies all 245 script tests, 98 Playwright specs, 14 imported cabinetry/multi-room browser modules, and 8 imported cabinetry script-test modules by cadence and locks their path inventories, split-suite registrations, and recursively reachable package-command closures. Every required entry names its invariant, command, sources/identities, projects, skip/retry policy, report type, artifact policy, and enforcement point. Required Playwright evidence is process-bound and rejects focus/filter/shard, zero/missing/moved/excluded scope, skipped/retried/flaky/annotated/not-run/failed cases, aggregate disagreement, malformed/stale/tampered output, dirty release source, wrong source/artifact/deployment, machine-local paths, and secret-bearing fields. The six named commerce/Kelsey requirements now fail missing prerequisites and are locked in Gate A3; the GLB export assertion executes under a deterministic Node `FileReader` shim; live progress is required; critical domains are in stable CI; advisory full E2E and release Gate A3 are unambiguous. CH-0016 locks two stable runtime identities. Cabinetry owns all 23 registered browser identities and consumes the wrapper envelope/report bound to the top-level release-candidate artifact.
- **Exact-head 701aaa follow-up:** Run `30684560486` proved the semantic lifecycle fix but exposed a separate whole-test timeout after readiness, an invalid advisory OAuth placeholder, all-or-nothing optional diagnostic retention, and runner-prefixed Gitleaks SARIF layout. One 14-phase table now derives a 660-second whole-test budget (585-second maximum sequential phase sum plus 75 seconds named overhead) and produces a closed-schema, non-overlapping, whole-envelope-contained portable timing record. One script-only JSON fixture supplies structurally valid non-secret CI OAuth values through exactly three guarded, single-line `GITHUB_ENV` assignments after proving the runner file is outside the checkout; the following step validates propagation without logging values or paths. Canonical environment classification refuses implicit, invalid, or production use, and structured `/api/auth/session` is preflighted before browser installation. Advisory mandatory envelope/report JSON binds the registered command, exact checkout, project, bounded process exit, fresh timing, report hash, full diagnostics/conclusion, and explicit null release identity; unsafe optional content or filenames are omitted with safe hashed metadata, while `.last-run.json` is hash-recorded as redundant rerun state and excluded. Gitleaks scanning is unchanged; its deterministic two-file artifact records verified checkout `testedSourceSha` separately from workflow-context `workflowContextSha`. Advisory no longer waits for stable checks because it shares no artifact/output/database/environment and remains excluded from merge aggregation.
- **Outcome-D evidence and remediation:** Exact-head GitHub run `30658564565` attempts 1 and 2 passed secret scan, 42 migrations, truthfulness/evidence contracts, and strict build, then failed only the furnished-template runtime identity at the same implicit five-second diagnostics poll. The fixture is browser-local and its GLB load/normalization/bounds diagnostics are client-computed; no database/API/worker/scheduler producer is missing. This is a test synchronization defect. The runtime now exposes `loading`/`ready`/terminal-`error`, and required smoke waits on that semantic state with bounded safe diagnostics while retaining the original behavioral assertions. Local CI-shaped production smoke passed both stable identities with process exit 0 and 0/0/0 failed/flaky/skipped.
- **Ownership and portability:** Aggregator specs own execution; each registered imported module must contribute report records in every required project before attribution to exactly one owner. Missing/reclassified modules and owner-only false coverage fail, while helpers remain non-runnable. Advisory upload preparation atomically publishes only strict UTF-8 text with portable path placeholders and a complete included/omitted inventory; binary/archive content is omitted, generic/shaped secrets are rejected, and failure removes the upload directory. Required stable evidence remains unavailable after smoke failure by design.
- **Coverage and compatibility:** The temporary-fixture negative suite and real CH-0016/cabinetry integrations cover the contract, module attribution, unsafe-path/credential/binary cases, and atomic upload failure. Test expectations and the cabinetry release-evidence contract schema were strengthened only to replace false passes. No product/data behavior, threshold, dependency, framework, product/database/persisted-data schema, migration, catalog, deployment, or external setting changed. Honest existing failures are not reclassified. Ruleset `staging-light-protection` (`13671593`) still requires no status check; no ruleset mutation is part of this batch.
- **Scope and rollback:** Revert the Outcome-D follow-up first, then `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then `c840c06dc2c5e67f463542292bb7391b0f93d731`. This restores timing-dependent smoke, unsafe/raw retention, and false-pass/aggregate-only evidence, so it is an emergency rollback rather than an acceptable steady state. Ignored generated evidence is regenerated.

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
4. `CH-0012` — `RESOLVED` (canonical saved-design routing repository remediation complete).
5. `CH-0016` — `RESOLVED` (production-equivalent artifact evidence repository remediation complete; external execution remains unverified).
6. `CH-0017` — `REOPENED`, **selected active batch** (Outcome-D repository follow-up complete locally; external workflow and enforcement unverified).
7. `CH-0018` — `BLOCKED_DEPENDENCY` (populated upgrade/data-loss evidence).
8. `CH-0010` — `REQUIRES_PRODUCT_DECISION` (permanent share revocation and auto-sharing).
9. `CH-0011` — `REQUIRES_PRODUCT_DECISION` (privacy consent/masking and external PostHog state).
10. `CH-0004` — `READY`, **paused until CH-0017 closes** (trusted event provenance).
11. `CH-0006` — `BLOCKED_DEPENDENCY` (legacy public API consumers).
12. `CH-0003` — `REQUIRES_PRODUCT_DECISION` (distributed cost budgets/outage policy).
13. `CH-0005` — `REQUIRES_PRODUCT_DECISION` (retirement authority).
14. `CH-0013` — `READY` (surface drift/schema gates, then payload).
15. `CH-0015` — `READY` (accessible overlay ownership).
16. `CH-0019` — `READY` in bounded baseline batches and required before architectural refactoring.

`CH-0009` and `CH-0014` remain queued as P2; neither competes in the P1 decision rule. Baseline A/B/C should be accumulated as independent reviewed fixes before architectural refactoring. The active finding remains reopened CH-0017; CH-0004 must not begin until its external workflow and enforcement verification is complete.

## Completed batch record: CH-0012 only

Implemented files and symbols:

- `lib/design-editor-url.ts` canonical URL helper;
- `app/design/[id]/page.tsx` legacy loader/redirect boundary;
- `components/DesignsListWithSelection.tsx` saved-design link;
- `components/DuplicateDesignButton.tsx` post-duplicate navigation;
- `app/checkout/success/page.tsx` design continuation link;
- `components/editor/design-page/DesignPageWorkspace.tsx` canonical `designId` loading, My Designs navigation, failure restoration, and superseded/unmount guard;
- `components/editor/design-page/DesignPageDialogLayer.tsx` open-gated lazy My Designs boundary used to prevent initial-bundle regression;
- `lib/useDesignPageFloorPlanLifecycleRegistration.ts` successful revision-copy canonical continuation plus operation-generation guard;
- `lib/useDesignPagePersistence.ts` removal of the obsolete direct My Designs load wrapper while retaining the authoritative loader;
- `scripts/test-design-editor-routing.ts`, `scripts/test-floor-plan-revision-copy.ts`, `scripts/test-floor-plan-consumer-flow.ts`, `tests/e2e/design-editor-routing.spec.ts`, and the `test:design-editor-routing` package command.

Verified routing inventory:

| Origin/action | Pre-remediation route/behavior | Identity and mode source | Canonical result / compatibility |
| --- | --- | --- | --- |
| Dashboard saved-design row | `/design/[id]` -> lossy `DesignerCanvas` | Server-listed owned `design.id`; no mode | Helper -> `/design?designId=...`; rich persisted fixture loads and only that ID saves. |
| In-editor My Designs | Direct `handleLoadDesign(id)` left the old URL and broke refresh/history identity | Owned `/api/designs` summary ID; allowed current editor context | Close dialog and synchronously push helper URL; route loader owns load, back/forward, and refresh. Dialog code loads only when opened. |
| Dashboard/share duplicate button | Success used `/design/[newId]`; failure path already stayed put | Authoritative successful duplicate response ID, never source/browser input | Navigate only after success to returned ID through helper; failure does not navigate. |
| Checkout success | `/design/[designId]` | Associated query context emitted by the existing checkout return flow | Helper link when ID exists; missing context renders no design link and selects no unrelated ID. |
| Direct `/design/[id]` bookmark | Server loaded lossy legacy editor | Opaque path ID; optional caller query | Temporary server redirect to helper contract; only `designer`, `2d`, `furnish`, and explicit floor-plan import context survive. No arbitrary attribution/destination forwarding. |
| Direct canonical, refresh, back/forward | Existing query load, but failure could retain another state under the requested URL | Query `designId`; API response snapshot/mode; session/local backup hydration | Canonical v3 API loader; failed/denied load restores previous helper URL or `/design`; superseded/unmounted continuation cannot pull history back. |
| Consumer / Designer | URL could request `mode`; entitlement remained separate | Default Consumer; verified `mode=designer` request; server `/api/me` plan/capabilities | Same canonical URL; URL never elevates a free user. Loaded persisted mode and server capabilities remain authoritative. |
| Floor-plan import assistant/history | Already emitted canonical query URL with `view=2d`, `workspace=furnish`, and encoded import ID | Returned design/import job IDs | Retained unchanged after characterization. |
| Floor-plan revision copy | Loaded returned copy in place while the source URL remained | Authoritative POST response copy ID and existing allowed context | After exact `"loaded"`, helper push uses returned copy ID; operation generation stops stale post-await navigation. |
| `/share/[shareToken]` / client preview | Separate read-only canonical share renderer | Enabled share token and server share boundary | Preserved; common duplicate button now opens its returned editable copy canonically. |
| `/d/[token]` | Orphaned legacy read-only token renderer | Share token | No internal producer found; retained as explicit compatibility debt outside editable CH-0012 scope. |
| Billing success / recent | Billing success has no saved ID; no separate recent-design producer found | None | Unchanged; no invented route or context. |

Final validation commands:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
npm run test:design-editor-routing
npm run verify:design-persistence
npm run check:code-quality
npx eslint 'lib/design-editor-url.ts' 'app/design/[id]/page.tsx' components/DesignsListWithSelection.tsx components/DuplicateDesignButton.tsx app/checkout/success/page.tsx --max-warnings=0
npm run typecheck
APP_ENV=development npx playwright test tests/e2e/design-editor-routing.spec.ts --project=chromium
APP_ENV=development npm run build
git diff --check
git status --short
```

Results: focused routing, persistence, code-quality, targeted/expanded lint, typecheck, floor-plan copy/consumer, production build, and diff hygiene passed. The final database-backed routing spec passed 6/6 in 3.0 minutes; the existing share/duplicate smoke passed 4/4 in 16.7 seconds. `npm run test:design-page-cleanup` remains the expected inherited failure at `test-command-bar-save-status.ts:34`.

Quality comparison: full lint remains exactly one `CatalogPanel.tsx:358` error and one `FloorPlanImportAssistant.tsx:294` warning. Architecture remains 594/550 and 361/300. Final initial JS is 7,062,575 raw / 1,159,786 Brotli versus the exact starting 7,068,799 / 1,160,288, an improvement of 6,224 raw / 502 Brotli bytes; the configured 6,955,000 / 1,130,000 budget therefore remains an inherited CH-0019 failure rather than a CH-0012 regression. Hamilton vocabulary and Pro visual inputs were not changed or reclassified.

Independent review first identified stale My Designs history, denied-ID identity, floor-plan copy identity, context loss, and unmounted late-navigation races. All valid findings were fixed and focused coverage rerun. Final disposition: no blockers. Residual non-blockers are the lazy dialog's null/chunk-error fallback, unusual external close during pending deletion, compositional duplicate-success UI coverage, and orphaned `/d/[token]` read-only debt.

Rollback: revert the single CH-0012 implementation commit. If callers must be isolated first, keep `/design/[id]` as a compatibility redirect. No document rewrite, migration, schema change, feature flag, push, or deployment is part of this batch.
