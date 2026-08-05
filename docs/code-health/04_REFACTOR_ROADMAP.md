# Refactor roadmap

This is a sequence of small, reversible batches, not a calendar promise. A phase may start only when its entry criteria are true. Each implementation commit cites CH IDs and contains one coherent behavior/security/gate change. Full Gate A3 is reserved for the exact immutable artifact proposed for stable-staging promotion; focused checks and preview smoke are used during iteration.

## Bounded dependency security batch — repository remediation complete

The P1 Next.js/Auth.js advisory batch begins at `55bc4b65c121c1a6646fd2d8b38bb93f9061c372` and is intentionally independent of the CH queue. It takes only the fixed Next 16.2.11 patch, aligned ESLint config, Auth.js beta.32/core 0.41.3/adapter 2.11.3 set, and PostCSS 8.5.23 override needed to eliminate the reported direct-production paths. Its exit contract is a clean install and fresh audits; focused real-session auth and fail-closed coverage; all required local gates except prohibited Full E2E; unchanged budgets; an optimized 57-page build and production start; and a clean detached exact-commit final build. Detailed evidence is in `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md`. This does not start CH-0004, Phase 8 follow-on work, or another dependency wave.

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
- P2-E: **COMPLETE (CH-0016)** — strict build plus verified `npm start` smoke against the exact artifact/build ID; developer smoke remains separate.
- P2-F: blank-install plus populated-predecessor migration gate and ordered digest in release evidence.

**Entry:** Phase 0 green or explicit baseline exception; CI budget/fixture owners named.
**Exit:** generated drift fails CI; every test is classified; E2E compiles; required gate passes mean assertions executed; strict built artifact is smoked; migration evidence binds code and DB state.
**Verification:** workflow dry run; `npm ci`; generated checks; `npm run typecheck` plus new `typecheck:e2e`; strict build/start/smoke; migration fixture commands; `npm run test:phase15`.
**Rollback:** each gate wiring change is independent; revert the gate commit if infrastructure is broken, preserving a dated blocking issue rather than weakening assertions.
**Compatibility:** gate/evidence only.

### CH-0016 implementation record

Status: **REPOSITORY REMEDIATION COMPLETE — EXTERNAL EXECUTION/VERIFICATION REQUIRED** at `cbed3550026e2803675f740b49be5fb15f15612b`. The focused commit adds a fail-closed production artifact evidence owner, negative-case suite, strict CI build/start/smoke path, exact health/build identity, trace-closure exclusions and inventory, Vercel untracked-source enforcement, a configured CI evidence upload with requested retention, and the repository/external guarantee split in `docs/qa/production-artifact-evidence.md`. Local detached-worktree output is ephemeral; durable retention remains pending an actual GitHub Actions upload and platform confirmation.

The build contract requires a clean exact commit, no influential local env file, `npm ci --include=dev`, lock/install identities, existing generated-runtime drift check, staging/production environment shape, strict catalog validation, one production build, Next build ID, and SHA-256 inventory of `.next` plus `public`. The test contract re-verifies the artifact, prohibits listener reuse/dev fallback, starts the unchanged `npm run start`, and binds Playwright JSON plus health identity to the same source/artifact/build. Missing, stale, modified, failed, flaky, skipped, development-mode, mismatched, or overclaimed evidence fails closed.

The strict diagnostic build passed after shaped nonfunctional staging configuration was supplied. Trace inventory changed from concrete `.env`/private-evidence leakage to 112 trace manifests and 42,879 references with zero missing/prohibited paths. The existing Turbopack broad-tracing warning remains explicit. No actual GitHub/Vercel run, preview/staging/production deployment, external-control verification, schema/data change, or dependency change is included. CH-0013 schema/payload work, CH-0017 test-truthfulness work, and CH-0018 migration evidence remain separate.

Rollback is one `git revert cbed3550026e2803675f740b49be5fb15f15612b`. Generated evidence is ignored and regenerated from an exact clean candidate. At CH-0016 completion, CH-0017 was the next READY P1; it was subsequently implemented as the separate record below. CH-0016 external GitHub Actions verification remains pending and was not reclassified by CH-0017.

### CH-0017 implementation record

Status: **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. Original implementation `c840c06dc2c5e67f463542292bb7391b0f93d731` and its bounded follow-ups culminate in the frozen source. `scripts/required-test-manifest.json` remains the single required/advisory gate inventory, while `package.json` remains the executable command owner. CH-0028 and CH-0029 change no CH-0017 gate identity, cadence, truthfulness semantic, source binding, workflow isolation, OAuth transport, artifact safety, or timeout provenance; CH-0029's three focused scripts only advance the discovery fingerprint from 365 to 368 classified sources.

The fail-closed runner deletes stale output, records the real Playwright process exit, canonicalizes paths, hashes JSON, and validates required files, identities, projects, configuration, per-test outcomes, aggregate agreement, source/artifact/deployment binding, timestamps, and secret-free structure. CH-0016 runtime evidence and cabinetry release evidence consume the same identities. Gate A3 certification now accepts the process-bound evidence envelope instead of raw aggregate JSON. Broad staging E2E remains explicitly advisory and cannot be mistaken for release certification.

Exact-head run `30684560486` passed required pre-smoke controls and strict build, then exposed four remaining repository boundaries: semantic readiness completed but the 240-second whole-test timeout expired later; advisory auth used a malformed synthetic Google secret; one unsafe flooring error context eliminated all safe advisory evidence; and the Gitleaks archive preserved runner workspace directories. The current follow-up derives a 660-second envelope from 585 seconds of named sequential phases plus 75 seconds of explicit overhead and requires closed, ordered, whole-envelope-contained portable phase timings. The non-secret OAuth pair lives once in script-only JSON outside the application build graph, is production-excluded through canonical environment classification, and is preflighted through the JSON auth session before browser installation. Mandatory failing advisory evidence binds exact source/command/project/process/timing/diagnostics and explicit null release identity while unsafe optional content or filenames are represented only by safe omission metadata. Gitleaks is atomically staged at root-level `results.sarif` plus its source/run manifest. Advisory E2E was safely decoupled from `stable-checks` because it consumes no stable output/artifact/database/environment and remains absent from `merge-gate` dependencies.

The floor-plan live-progress test is included in `test:floor-plan-required`; security, persistence, Stripe, Phase 14/15, Consumer/Pro, and cabinetry contracts are in one required CI umbrella; and the named commerce/variant tests fail missing prerequisites instead of annotating a pass. The cabinetry GLB export check uses a deterministic Node `FileReader` shim and executes its assertion instead of logging a skip and returning success. Existing behavioral failures remain visible and were not weakened, suppressed, or rebaselined. CH-0013, CH-0018, CH-0019, and external GitHub settings remain separate.

Focused negative tests cover valid evidence, missing/renamed source, zero discovery, missing project, filtered scope, skips, retries, `.only`, annotated returns, swallowed child failure, report-declared failure, missing/malformed/stale evidence, source/artifact mismatch, advisory visibility, and secret fields.

Outcome D reproduced the required furnished-template failure twice on GitHub run `30658564565` at exact head `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`: health/catalog passed, but client-side GLB diagnostics missed an implicit five-second poll. The cause is a test synchronization defect, not an absent database transaction, API authorization, worker, or scheduler. The smallest fix exposes the existing client model lifecycle and waits for bounded semantic readiness, failing immediately on a terminal safe error while retaining selection, bounds, remount, reload, and render-loop assertions. Local CI-shaped production smoke passed both stable identities with zero failed/flaky/skipped tests.

The ownership model now treats cabinetry and multi-room aggregators as the runnable specs and their registered imported modules as contributing implementation modules. Every registered module must emit records in each required project before those records are attributed once to its owner, so missing/reclassified modules fail without double counting. Advisory retention no longer uploads raw Playwright output: an atomic preparation step decodes only approved text, normalizes Linux/macOS/Windows/temp paths to `<WORKSPACE>`, rescans path and credential patterns, inventories omitted binaries/archives, and leaves no upload directory on failure. Stable CH-0016 bundling remains gated after successful required smoke.

CH-0017's external truthfulness behavior is verified and its implementation is frozen. Administrator-owned ruleset state remains outside repository remediation. Rollback of the frozen chain is emergency-only; ignored evidence is regenerated. CH-0028 neither starts CH-0004 nor modifies any external control.

### CH-0028 implementation record

Status: **EXTERNALLY VERIFIED — RESOLVED** at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. The implementation history below predates and is superseded by that external status.

Classification is **F — genuine performance condition**. The authoritative run completed all required model responses but left the three exact current fixture identities loading when the unchanged 70-second nested operation expired; it retained aggregate state, not an exact post-response stage trace. New safe diagnostics prove exact key/mount/generation ownership on controlled same-path runs and rule out stale registry entries, old-generation callbacks, optional scoping, cache-transition loss, and unterminated parse/normalization/bounds errors. The pre-fix forced in-document remount repeated parse/decode, normalization/material cloning, and bounds work; the external nine-versus-six response count proves that extra generation. The controlled trace plus external timing supports the F classification.

The smallest canonical fix retains `modelDiagnostics` as the only lifecycle registry and adds bounded ref-counted parsed/prepared resource reuse under `GLBScaledModel`. Cache and network delivery share lifecycle transitions, failed promises evict, inactive entries prune to 32, entry-owned resources dispose once, source leases remain valid, and page hide clears dependency order before a real reload. A real reload still produces a new document generation and response set. The smoke now asserts exact current identities, terminal stages, active required-key stability, and registry size across three reloads without changing any timeout, retry, skip, response, selection, bounds, persistence, remount, render-loop, or final-state contract.

Three clean production-mode smokes against three separate 42-migration PostgreSQL databases passed furnished-template and health/catalog 2/2, exit 0. Reload totals were 19,917/21,581/22,064 ms; 22,939/21,064/21,311 ms; and 21,414/21,210/20,404 ms against the unchanged 308,000 ms parent budget. Focused lifecycle/cache/bounds, design persistence, production-evidence, truthfulness, typecheck, targeted zero-warning lint, code-quality, strict build, and diff checks pass. Exact detached-commit evidence and independent review are recorded in the final handoff entry. Rollback is the one CH-0028 commit; no data migration or external rollback exists.

### CH-0029 implementation record

Status: **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. The bounded local remediation starts from exact verified CH-0028 source `db346a51718967bd4dc1605b07c0850e02fd08d1` on `fix/ch-0029-main-thread-starvation`; required-only external verification is still required.

The verified root is the inseparable **C/G React/R3F render-work and host/test-contention cluster**. While the loading veil hid the scene, Canvas still ran all continuous R3F frame subscribers and renderer/GPU submission while Playwright retained trace/video work. The matched 10,736 ms long task remained `unattributed`; renderer instrumentation measured 387.9 ms total and 148.1 ms maximum, so the correction does not claim a single 10.7-second synchronous renderer call.

The smallest correction changes only hidden loading frames to `frameloop="demand"`, restores `always` when the scene becomes visible, and disables trace/video only for the stable smoke. Bounded production-gated telemetry retains safe fixed-category metadata, long-task context, heartbeat/frame gaps, concurrency, and lifecycle/store/render counters. It excludes pre-initialization tasks, deeply detaches nested snapshot metadata, and exposes no raw asset or user information.

Three final-code 42-migration production smokes passed furnished-template and health/catalog 2/2 with all reloads at 10,192–11,354 ms. A two-worker CPU-pressure run passed with reloads 12,725/11,859/12,048 ms. All runs retained responses 6/9/12, eight current ready models, zero loading/error, coherent cache/refcounts, no stale active entry, and zero retry/skip. External heartbeat 11,747 ms fell to at most 6,858 ms pristine and 8,102 ms under pressure, and every callback entered; callback admission reached 6,406/7,168 ms, so no numeric improvement over the external 5,281 ms admitted maximum is claimed. Rollback is the one CH-0029 commit; no timeout, schema, data, workflow, ruleset, PR, or deployment rollback exists.

## Phase 3 — Canonical saved-design routing

**Finding:** CH-0012.
**Status:** RESOLVED — repository-controlled remediation complete at `2c9e8b4d2322484a8d80873019d2c3495dd862f5`. CH-0016 was subsequently completed as the bounded P2-E evidence batch at `cbed3550026e2803675f740b49be5fb15f15612b`; CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**.
**Implemented batch:** characterized a modern v3 document through every discovered entry; added `lib/design-editor-url.ts`; made `/design/[id]` a temporary canonical redirect; updated dashboard, duplicate, checkout-success, My Designs, and floor-plan revision-copy navigation; made denied/superseded/unmounted loads restore or retain the correct identity; and removed all legacy rendering from the compatibility route.

Expected first routing files:

- `lib/design-editor-url.ts` (new)
- `app/design/[id]/page.tsx`
- `components/DesignsListWithSelection.tsx`
- `components/DuplicateDesignButton.tsx`
- `app/checkout/success/page.tsx`
- a focused script contract and Playwright route fixture under `scripts/` and `tests/e2e/`

**Entry result:** canonical `/design?designId=` persistence behavior and the complete route graph were characterized before production changes. No separate recent-design route or billing-success saved-design continuation exists. External bookmarks remain covered by the compatibility redirect.
**Exit result:** all supported editable entry points use the canonical contract; the old URL preserves only verified context and opens the canonical renderer; the rich multi-room/floor-plan/material fixture retains full structure, saves and reloads the same ID, and does not create or overwrite another design during startup/history/denied-load cases.
**Verification result:** PASS — named routing guard, persistence umbrella, code-quality ratchet, focused and expanded lint, typecheck, floor-plan copy/consumer guards, six-case Chromium routing spec, four-case share/duplicate smoke, explicit-development production build, and diff hygiene. EXPECTED INHERITED FAIL — full lint, design cleanup, design architecture, and Phase 8 bundle budget remain limited to their documented baseline findings. Final `/design` initial JS is 7,062,575 raw / 1,159,786 Brotli versus the exact starting 7,068,799 / 1,160,288, so CH-0012 improves rather than worsens both measures while the configured 6,955,000 / 1,130,000 budget remains red.
**Independent review:** Initial findings for My Designs history, denied-ID state, floor-plan revision-copy identity, context loss, and late navigation after unmount were fixed and covered. Final disposition: no blockers. Non-blocking residuals are the lazy dialog's null/chunk-error fallback, unusual external close during pending delete, compositional duplicate browser coverage, and orphaned read-only `/d/[token]` debt.
**Rollback:** revert the single implementation commit; if isolating callers during an emergency, retain `/design/[id]` as the compatibility redirect. No document rewrite or schema/data rollback exists.
**Compatibility:** one canonical editable editor; no document rewrite, entitlement change, or authorization redesign.

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

**Phase 8A checkpoint (2026-08-04):** P6-A and the surface-material portion of
P6-B are complete from exact source
`101f25d095c6e205e2d40e1ad843a24210696e40`. The canonical generator now emits
one compact synchronous 980-record render projection, one same-ID lazy catalog
projection, and a separate test-only fixture. A single-flight loader owns the
only production dynamic imports for full surface metadata and the 2,484-row
Nippon browser catalog; it loads only after explicit surface-workspace open and
has bounded loading/error/retry behavior. Saved selection, hydration, 2D/3D
rendering, UV scale, application, persistence, BOM/export identity, search,
and Consumer/Pro contracts pass. Clean strict measurements changed `/design`
initial JS from 7,103,302 raw / 1,169,257 Brotli to 5,790,970 /
1,104,573 across the same 26 chunks, so both JavaScript budgets are green
without a rebaseline. CSS is unchanged at 143,779 raw and remains the separate
3,779-byte Phase 8B blocker. P6-C through P6-G remain separate; this checkpoint
does not start scene-resource, CH-0004, or CH-0017-through-CH-0030 work.

**Phase 8B checkpoint (2026-08-04):** the bounded initial-CSS blocker is green
from exact source `299536fee37fe68b3fde38c02984f5aba21a6231`. Tailwind
ownership now follows the existing `/admin`, `/tools`, and dynamically imported
Cabinetry Studio boundaries. Exact clean measurements changed `/design` initial
CSS from 143,779 raw / 18,417 Brotli to 129,803 / 17,182 while keeping one
initial CSS chunk. Initial JS remains 26 chunks and passes at 5,791,004 raw /
1,104,582 Brotli; the 34 raw / 9 Brotli delta is the deterministic stylesheet
edge, while the measured Cabinetry Studio JS chunk is byte-identical. Shared
first-paint, material-browser, focus, responsive, modal, print/export, Consumer,
and Pro styling remain global. The complete Phase 8 gate is green without a
raised baseline. P6-C through P6-G remain separate and were not started.

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

## Phase 0 presentation-workspace architecture ratchet — 2026-08-04

This bounded CH-0019/CH-0020 batch starts from exact clean source
`9ba876b0e8fb53a676bfaf5898bf8e548aacbb79` after Baselines A-C. It extracts
the presentation lighting read model and history-aware lighting commands from
`useDesignPagePresentationWorkspaceRegistration.ts` into the focused
`useDesignPagePresentationLightingRegistration.ts` module. The parent hook
remains the orchestration and presentation/QA composition owner; canonical
document state, history, fixture state, Consumer/Pro access, client preview,
viewport regions, selection, persistence, and export owners are unchanged.

The original module falls from 455 to 378 physical lines. The code-quality
baseline removes its oversized-file allowance and lowers its one overlong
function maximum from 406 to 340. Direct deterministic lighting coverage now
locks empty and non-fixture documents, valid and estimated fixtures, active
fixture policy, multi-room/room-switch behavior, and master/dimmer disablement.
The presentation guard, focused lighting and editor contracts, persistence,
zero-warning lint, typecheck, code quality, and strict production build pass.
`test:design-page-cleanup` clears the remediated presentation guard and next
stops at the inherited GLB local-bounds source assertion in
`test-design-page-scene-layers.ts`; a direct later viewport guard also retains
its existing 361-line versus 280-line failure. Neither inherited area is part
of this batch. Full E2E, Phase 8, CH-0004, other CH-0017 through CH-0030 work,
Hamilton adapter limitations, workflows, dependencies, schema, and migrations
remain untouched.

## Phase 0 viewport-workspace architecture ratchet — 2026-08-04

This bounded CH-0019/CH-0020 batch starts from exact clean source
`3f84fbd98e1154285c537119e7ec8227727f9d24` after the completed baseline
chain. The 361-line viewport registration combined immutable viewport
state/configuration projection with reference and command wiring inside one
341-line builder. History grew the original 258-line composition through
imported-wall editing, multi-room plan summary, and selected-fixture lighting;
the behavior remains valid, but the mixed construction responsibilities no
longer fit the verified 280-line registration budget.

The selected extraction is the viewport workspace read model. The new pure
`design-page-viewport-workspace-read-model.ts` consumes an explicit typed set
of read-only `state`/`derived` sources and constructs viewport state and
configuration. The original registration remains the sole orchestration owner
for boundary selection, references, command callbacks, adapter invocation, and
the returned viewport region. It introduces no hook, effect, store, registry,
camera state, selection state, or Consumer/Pro fork.

The original module is 210 physical lines, down from 361; the new module is
298 lines, with seven focused functions and a 48-line maximum. The design
architecture limit is tightened from 300 to the verified 280 maximum, and the
code-quality baseline lowers the registration's one overlong-function maximum
from 341 to 193. No allowance, exception, suppression, cycle, or unsafe
TypeScript construct is added.

Deterministic coverage now locks empty, one-room, multi-room, 2D, 3D,
Consumer, Pro, client-preview, presentation, selected-opening removal,
room/project switching, canonical room ordering, repeated construction, and
save/reload-equivalent input behavior. Focused viewport, camera, continuity,
selection, lighting, presentation, persistence, keyboard, and accessibility
checks pass, as do full zero-warning lint, typecheck, code quality, and the
strict 57-page production build. The sandboxed build fails only on the known
Turbopack helper-port restriction; the approved outside-sandbox run passes with
the inherited floor-plan NFT tracing warning. `test:design-page-cleanup` clears
the viewport 280-line guard and next stops at the untouched
`DesignPageWorkspace.tsx` 594/550 limit. That next architecture batch, Full
E2E, Phase 8, CH-0004, CH-0017 through CH-0030, and unrelated editor/scene work
remain out of scope.

Independent read-only review corrected two documentation-only count/coverage
descriptions and then passed the current complete diff with no actionable
architecture, state-ownership, behavior, test, ratchet, or scope findings.

## Phase 0 DesignPageWorkspace architecture ratchet — 2026-08-04

This bounded CH-0019/CH-0020 batch starts from exact clean source
`f95b7e27f6729a36372f00ae0e78b93ea6fd1901`. The reproduced failure was
`DesignPageWorkspace.tsx` at 594 physical lines against its 550-line maximum.
The pre-edit map found that the workspace directly owned only route identity
intake and late-navigation suppression; request epochs, abort controllers,
cloud response translation, canonical document handoff, and autosave gates
already belonged to `useDesignPagePersistence`. Moving those lower-level
owners would have split the established persistence state machine.

The selected extraction is requested-design loading coordination. The new
`useDesignPageRequestedDesignWorkspaceRegistration.ts` composes after the
unchanged persistence workspace, evaluates the canonical `designId` route
decision, cancels pending route work, restores the prior canonical URL after
missing or unavailable loads, and owns My Designs navigation. Its pure
`design-page-requested-design-load-coordinator.ts` support owns a unique request
token plus abort controller so an adapter that ignores abort still cannot
commit stale data. Persistence remains the sole network, response-translation,
document-handoff, and autosave owner. Consumer/Pro, authentication, document,
project/room, analytics, and network paths are unchanged.

The workspace is 543 physical lines, the route registration is 125, the pure
arbiter is 43, and persistence also decreases from 1,360 to 1,359. The
specialized architecture maximum tightens from 550 to 543; code quality lowers
the workspace file count from 594 to 543 and its overlong function maximum from
560 to 510, while persistence maxima also decrease. No allowance, exception,
suppression, unsafe TypeScript construct, dependency, or cycle is added.

Deterministic coordinator coverage locks absent, signed-out, hydration-waiting,
current, valid, repeated, missing, unavailable, aborted/superseded, route-change,
and unmounted completion decisions. Deferred controlled adapters prove B beats
A and route removal invalidates A even when abort is ignored. Browser routing
coverage retains canonical save/reload identity, My Designs history/project
switching, duplicate response identity, Consumer/Pro entitlement, checkout,
and denied-design fallback. Focused checks, full zero-warning lint, typecheck,
code quality, direct architecture, and the strict 57-page production build
pass. The focused Chromium routing spec passes 6/6 in 2.9 minutes. The cleanup suite clears
the workspace guard and next stops at the untouched inherited
`test-editor-3d-floor-cutaway.ts:82` `floorWorldY` assertion. Full E2E, Phase 8,
CH-0004, CH-0017 through CH-0030, and unrelated editor work remain out of scope.

Initial read-only review found that route cleanup only suppressed navigation,
concurrent loads reused a document epoch, and the new test did not exercise a
deferred race. The corrections added route cancellation, the unique-token
arbiter, and controlled adapters that ignore abort. Final read-only review is
**PASS — no actionable findings**; all three findings are resolved, ownership
and hook order remain canonical, ratchets and docs are accurate, and the
remaining absence of a rendered-hook race test is non-blocking.

## RC47-RC55 bounded remediation sequence — 2026-08-05

The archival audit at source `7016da0ad74c7d463a07ec061259b50d757031e0`
found eight unresolved invariants across all nine RC commits. This is not an
authorization to implement or integrate them. If approved, sequence the work as
follows so high-reach persistence contracts settle before certification-only
changes:

1. P1 cloud baseline and revision freshness: resolve
   `ARCH-RC49-50-CLOUD-BASELINE` and `ARCH-RC53-CLOUD-REVISION` while preserving
   server compare-and-swap, local backup, request coordination, and document
   epoch rejection.
2. P2 editor/catalog ownership: centralize the intended furniture rotation
   keyboard contract (`ARCH-RC48-KEYBOARD`), resolve comparison from the full
   product map (`ARCH-RC51-COMPARE`), and preserve drawer opener/category focus
   across hydration (`ARCH-RC52-DRAWER-FOCUS`).
3. P3 release truthfulness and responsive projection: correct the drawer role
   assertions (`ARCH-RC47-ASSERTIONS`), compare shared duplicates through like-
   for-like projections (`ARCH-RC54-PROJECTION-ASSERTION`), and implement plus
   stabilize the mobile/desktop share-room projections
   (`ARCH-RC53-55-SHARE-RESPONSIVE`).
4. Use focused checks during each batch. Certify only the final immutable
   artifact under the established release cadence; any later code change
   invalidates that certification.

Do not replay the RC chain as a unit. RC49 and RC50 form one baseline protocol;
RC53 contains two separable concerns; RC54 needs only its certification
correction; and RC48 must be adapted to current controller and analytics/history
ownership. Detailed proof is in
`docs/code-health/07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.

## ARCH-RC49-50 implementation record — 2026-08-05

The first bounded persistence item in the RC47-RC55 sequence is complete
locally from `e06795dc92874afb383f61b28ba380930c1c7252` on
`fix/arch-rc49-50-cloud-baseline`. No archival commit was cherry-picked.

The accepted boundary consists of one pure canonical persistence projection,
one pure typed cloud-baseline state machine, a focused React acknowledgment
owner, a focused cloud-load owner, and a focused recovery-copy create/gate/commit
owner. The existing persistence controller composes those owners and continues
to own manual save, autosave, conflict UI, local backup, and serialized writes.
The existing requested-design coordinator continues to own abort and
supersession. The projection performs supported migration, floor-plan defaults,
product snapshots, active-room zone reconciliation, stored document validation,
and fingerprinting in that order. The state machine binds acknowledgment to
exact design, revision, and epoch identities and fails closed.

This extraction reduces `useDesignPagePersistence.ts` from 1,359 to 1,288
physical lines. Code-quality allowances only decrease: persistence line and
function-debt metrics tighten overall, document-history overlong-function maximum drops
to 153, and no exception, suppression, unsafe TypeScript construct, dependency,
or runtime cycle is added.

Focused and database-backed verification plus the complete required static and
release gates pass. The next persistence step remains the distinct P1
`ARCH-RC53-CLOUD-REVISION`; do not fold execution-time revision ownership into
this completed baseline protocol. The P2/P3 sequence remains RC48 keyboard,
RC51 compare, RC52 drawer focus, RC47 assertions, RC54 projection assertion,
and RC53/55 responsive share. Certify a later integration artifact only after
those approved batches are accumulated under the established cadence.

## Final RC47-RC55 sequencing correction — 2026-08-05

The final read-only confirmation at exact source
`83425bad3cc30dc37100d090e79159998782bc29` supersedes the earlier sequencing
status. RC47, RC49, RC50, RC51, RC52, the RC53 cloud sub-scope, and RC54 are
closed by current implementation. RC48, the RC53 responsive sub-scope, and RC55
remain open; RC53 is therefore **F. STILL_REQUIRED** overall.

Before integration planning, keep the remaining work bounded and ordered:

1. Correct keyboard ownership so active floor-plan tracing owns its `R`
   contract even when furniture remains selected, and add a direct collision
   regression test.
2. Make the canonical public projection the sole source of visible responsive
   metadata, including title, style, budget, and notes.
3. Replace the truncated projection identity with collision-safe identity
   evidence and test a projection-identity collision, not only a secondary
   layout-generation collision.
4. Assign the responsive unit/browser and focused WebKit contracts to an actual
   merge-required release gate. Retain the separate 44 px Undo touch-target
   failure in the Consumer batch.
5. Run focused checks during remediation, then Gate A3 once against the exact
   immutable artifact proposed for promotion. Any later code change invalidates
   that certification.

Do not replay, cherry-pick, or merge the RC47-RC55 chain. Do not create an
integration branch yet. The exact final mapping and evidence are in
`docs/code-health/07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.
