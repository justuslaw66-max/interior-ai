# Code health audit

## 2026-08-05 bounded dependency P1 remediation

Starting from exact clean source `55bc4b65c121c1a6646fd2d8b38bb93f9061c372`, branch `security/dependency-auth-next-compatibility` updates the minimum coherent Next.js/Auth.js set (`next` 16.2.11, `next-auth` beta.32, Prisma adapter 2.11.3/core 0.41.3, and PostCSS 8.5.23). Fresh audits remove every reported direct-production Next/Auth advisory and both critical nodes while retaining five explicitly classified tool-path advisory IDs outside this batch. Runtime/auth behavior, 57-page build, required gates, and Phase 8 budgets remain green. The complete inventory, compatibility matrix, exact audit deltas, lockfile scope, validation, and rollback are in `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md`. CH-0004 and all other findings were untouched.

This register is anchored to checkpoint `08bdfe0c5e5c882777dc5da38168ea7db14840ad`. IDs are stable: implementation commits, pull requests, exceptions, and release evidence should cite them without renumbering. P0 means active catastrophic risk, P1 high risk or release blocker, P2 material maintainability/reliability debt, and P3 hygiene. No P0 was confirmed in this audit.

Post-CH-0001 triage was performed on 2026-07-31 at `62ba966ecb2011e4233c99ce1dcc0641914af008`. CH-0012 repository remediation was then completed at `2c9e8b4d2322484a8d80873019d2c3495dd862f5`. CH-0016 repository remediation was completed next at `cbed3550026e2803675f740b49be5fb15f15612b`; external execution and durable evidence retention remain unverified. CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. CH-0028 is **EXTERNALLY VERIFIED — RESOLVED** at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. CH-0029 is **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. The current classification is zero unresolved P0 findings, thirteen unresolved P1 findings, five resolved P1 findings, and two former P1 findings downgraded to P2 with current evidence. The finding-by-finding evidence, reachability, dependencies, test coverage, remediation scope, rollback, and ordered queue are recorded in `06_P0_P1_REMEDIATION_QUEUE.md`.

## Priority summary

The first ten risks by consequence, exploitability, customer impact, and change frequency are:

1. CH-0001 fail-open admin authorization;
2. CH-0002 guest storage abuse and non-atomic quota enforcement;
3. CH-0007 parallel catalog truths and non-transactional authoring;
4. CH-0008 fail-open catalog publication classification;
5. CH-0012 legacy editor navigation that drops modern document state;
6. CH-0016 CI that does not validate the built, strict artifact;
7. CH-0017 false-pass and omitted critical release gates;
8. CH-0018 fresh-install-only migration validation;
9. CH-0013 generated surface payload/drift contract;
10. CH-0014 per-item 3D resource and event ownership.

CH-0001, CH-0012, and CH-0016 are closed for repository-controlled remediation. CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. CH-0028 is **EXTERNALLY VERIFIED — RESOLVED** at `db346a51718967bd4dc1605b07c0850e02fd08d1`. CH-0029 is the active bounded performance remediation; CH-0004 trusted event provenance was not started.

## Findings

### CH-0001 — Deployment classification can fail open into admin access

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE. External platform settings remain explicitly unverified in `docs/security/CH-0001_EXTERNAL_CONTROLS_CHECKLIST.md`.
- **Resolution commit:** `62ba966ecb2011e4233c99ce1dcc0641914af008`.
- **Locations/symbols:** `lib/config.ts:getApplicationEnvironment`; `lib/admin.ts:isAdmin`; `app/layout.tsx` configuration validation.
- **Pre-remediation evidence:** Missing or unknown `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, and `VERCEL_ENV` became `development`. When `ADMIN_EMAILS` was empty, `isAdmin` treated any nonempty authenticated email as admin in that state; `NODE_ENV === "development"` was not required.
- **Evidence/current behavior at resolution HEAD:** Missing, blank, or unknown deployment classification is invalid; public variables and CI flags have no authorization authority; every administrative environment requires a valid Auth.js session email in a complete valid server allowlist; the former request-controlled catalog-audit bypasses are absent; discovered privileged handlers/pages and operational entry points enforce their applicable guard before work.
- **Risk:** A misconfigured or non-Vercel production deployment can grant every Google-authenticated user admin APIs and Pro access.
- **Improvement:** Fail closed. Permit a local bypass only through an explicit opt-in combined with Node development mode and loopback/local-host evidence; validate deployment classification at startup and in security tests.
- **Expected outcome:** Unknown production configuration cannot create privilege; intentional local development remains convenient and explicit.
- **Tests:** Table-driven environment/admin-email matrix; missing and invalid variables; preview/staging/production; loopback versus forwarded host; ordinary signed-in user denied every admin boundary.
- **Dependencies/decision:** Deployment environment inventory. No product decision.
- **Compatibility:** Behavior-preserving for valid production and explicit local development; it intentionally removes accidental privilege.
- **Resolution:** `getApplicationEnvironment` now accepts only the repository's explicit server-side deployment model, `instrumentation.ts` rejects missing/unknown classifiers during server preparation, and admin authorization requires a valid server session email in a complete valid `ADMIN_EMAILS` allowlist in every environment. Auth.js credentials no longer gain fixed or short-secret fallbacks from CI flags, and malformed reviewer/publisher lists deny the complete narrower role. `NEXT_PUBLIC_APP_ENV`, `NODE_ENV`, `ADMIN_REQUIRE_AUTH`, empty allowlists, CI flags, and the two query/header audit bypasses have no authority. The complete surface and deployment tables are in `docs/security/CH-0001_AUTHORIZATION_MATRIX.md`.
- **Regression evidence:** `npm run test:auth-env-hardening` discovers 25 admin route files and 14 admin pages, checks all direct handlers plus `/api/me`, the optimizer, the synthetic conversion route, eight operational TypeScript CLI/background entry points, and five backup/restore/test-only utilities, and covers environment/auth-credential/allowlist/session/side-effect negatives. `tests/e2e/13-admin-variant-audit.spec.ts` uses real local/CI Auth.js database sessions for signed-out, forged, expired, free, Pro, and allowlisted-admin direct requests.

### CH-0002 — Guest storage and plan quotas are bypassable and non-atomic

- **Severity:** P1.
- **Locations/symbols:** `app/api/designs/claim/route.ts`; `lib/design-route-payload.ts`; design create/import/duplicate/share-duplicate routes; `app/api/designs/merge/route.ts`; floor-plan confirmation/update creation paths.
- **Evidence/current behavior:** Anonymous claim accepts payloads up to 5 MB and keys limits to caller-supplied UUIDs, which can be rotated. Authenticated quota flows perform count-then-create in separate operations, while guest merge transfers all rows without a quota check.
- **Risk:** Storage exhaustion, cost abuse, and free-plan overage under UUID rotation or concurrent mixed-route requests.
- **Improvement:** Introduce a server-minted signed HttpOnly guest capability, IP+guest+global budgets, TTL/retention, and one quota-enforcing creation/claim service using an atomic counter, advisory lock, or serializable transaction.
- **Expected outcome:** All creation paths observe the same race-safe policy and anonymous storage has bounded provenance and lifetime.
- **Tests:** UUID rotation; replay; parallel requests at 19/20 across create/import/duplicate/share/floor-plan; over-quota merge; global and per-guest budgets; failure rollback.
- **Dependencies/decision:** Product decision required for guest retention, guest and authenticated quotas, and legacy overage behavior.
- **Compatibility:** Decision-required because valid current guest data may age out or claims may be rejected.

### CH-0003 — Cost-bearing rate limits are process-local

- **Severity:** P1.
- **Locations/symbols:** `lib/rateLimit.ts`; consumers in AI notes/layout, PDF export, share email, Stripe/Shopify checkout, GLB optimization, telemetry, and inline floor-plan processing; compare `lib/shared-rate-limit.ts`.
- **Evidence/current behavior:** A per-process `Map` enforces many sensitive limits. Cold starts and multiple instances reset or partition the budget; durable limiting exists but has narrow adoption.
- **Risk:** Distributed deployments can exceed cost, compute, and email limits; untrusted forwarding headers can fragment identity.
- **Improvement:** Standardize a shared limiter with user+guest+trusted-IP+global keys, platform-specific IP extraction, `Retry-After`, operation budgets, and fail-closed treatment for costly work.
- **Expected outcome:** Limits remain coherent across instances and restarts, with observable rejections.
- **Tests:** Two-instance concurrency; cold restart; forwarded-header spoofing; per-operation/global exhaustion; limiter outage policy.
- **Dependencies/decision:** Rate budgets and availability policy require product/operations approval.
- **Compatibility:** Decision-required; stricter shared enforcement may reject traffic currently admitted.

### CH-0004 — Public event ingestion can forge server-authoritative lifecycle events

- **Severity:** P1.
- **Locations/symbols:** `lib/app-events.ts`; `app/api/track/app-event/route.ts`; `app/admin/operations-data.ts`.
- **Evidence/current behavior:** Client events share an allowlist with `upgrade_checkout_completed`, `subscription_canceled`, and `webhook_failed`; the public route accepts the full set with optional authentication, and admin metrics consume the resulting records.
- **Risk:** Anonymous clients can poison KPIs, alerts, and operational decisions.
- **Improvement:** Separate browser and trusted-server event schemas; record provenance; require authenticated internal ingestion or direct service emission for lifecycle events.
- **Expected outcome:** Admin metrics contain only authoritative billing/webhook state for server-only event types.
- **Tests:** Anonymous and signed-in client denial for every server-only event; server provenance accepted; schema/version rejection; admin aggregation excludes forged fixtures.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving for legitimate browser analytics and server events.

### CH-0005 — Published floor-plan retirement uses a weaker role than publication

- **Severity:** P1.
- **Locations/symbols:** `lib/floor-plan-imports/publication-governance.ts`; admin approve/publish/retire routes; `scripts/test-floor-plan-revision-retirement.ts`.
- **Evidence/current behavior:** Approve and publish require the narrower publisher authority, but retirement of a published revision requires only general admin; tests codify that weaker check.
- **Risk:** A broad admin can remove public revisions outside the documented maker/publisher boundary.
- **Improvement:** Require publisher authority, or define an explicit emergency-withdraw role with mandatory reason and audit trail.
- **Expected outcome:** Publish and unpublish authority is coherent and auditable.
- **Tests:** ordinary admin/reviewer denied; publisher allowed; emergency role and reason if selected; audit event asserted.
- **Dependencies/decision:** Product/operations decision only if an emergency-withdraw role is desired.
- **Compatibility:** Behavior-preserving under the documented publisher model; decision-required for emergency semantics.

### CH-0006 — Legacy public catalog API exposes drafts and filesystem internals

- **Severity:** P1.
- **Locations/symbols:** `app/api/catalog/route.ts`; `lib/catalog-yaml.ts:getFreshCatalogYamlEntries`; `/api/catalog/live`.
- **Evidence/current behavior:** Unauthenticated `/api/catalog` returns every YAML entry, including five drafts, enriched with absolute `file_path`, validation, and authoring metadata. A publication-filtered public route already exists.
- **Risk:** Draft products and deployment paths leak, and external consumers can bind to an administrative DTO.
- **Improvement:** Inventory consumers, then remove/admin-protect the route or make it return the stripped live public DTO.
- **Expected outcome:** Anonymous catalog APIs expose only published product data and stable public fields.
- **Tests:** drafts, validation fields, and absolute paths absent; known public entry present; consumer contract; old route redirect/removal behavior.
- **Dependencies/decision:** Verify external consumers. No product decision unless the route was intentionally administrative.
- **Compatibility:** Characterize consumers first; public output intentionally narrows.

### CH-0007 — Catalog has parallel mutable truths and non-transactional authoring

- **Severity:** P1.
- **Locations/symbols:** `lib/catalog/data.ts`; `lib/catalog/registry.ts`; `catalog/furniture/**/catalog.yaml`; `lib/useDesignPageImportedModels.ts`; `lib/catalog/imported-model-assembly.ts`; admin catalog update route; Shopify checkout route.
- **Evidence/current behavior:** Static runtime registry has 30 items while YAML has 139; 109 YAML identities are absent from static data. Editor code asynchronously mutates module-global maps. Shopify validates only the static server map and all 30 static items currently resolve as affiliate, making the Shopify path unreachable. Admin update commits Prisma before writing deployment-bundled YAML, with no compensation.
- **Risk:** Editor, export, APIs, publication, and commerce can disagree; a filesystem failure leaves DB/YAML divergence; deployed files may be read-only or ephemeral.
- **Improvement:** Choose one durable authoring source, compile an immutable normalized versioned catalog, expose typed consumer projections, remove runtime global mutation, and use repository review or durable storage/outbox semantics for authoring.
- **Expected outcome:** A product identity has one versioned definition and deterministic projections across client/server/commerce.
- **Tests:** static/YAML migration parity; draft exclusion; editor/export/API identity parity; fault-injected authoring write; mocked successful Shopify checkout and invalid identity; immutable registry.
- **Dependencies/decision:** Product decision required for canonical source/precedence and whether Shopify is intentionally dormant.
- **Compatibility:** Decision-required and migration-backed; do not collapse sources opportunistically.

### CH-0008 — Catalog publication status fails open

- **Severity:** P1.
- **Locations/symbols:** `lib/catalog-publication.ts:isLiveCatalogEntry`; `lib/catalog-audit.ts`; catalog YAML; orphan `scripts/test-catalog-live-gate.ts`.
- **Evidence/current behavior:** Any status not in a short draft set is live. Current data has 73 unspecified, 54 `published`, 10 `live`, 2 `active`, and 5 `draft`; audit does not enforce a controlled enum. A typo, `retired`, or unknown value publishes.
- **Risk:** Unreviewed, retired, or malformed products can become public.
- **Improvement:** Decide a canonical status model, migrate all unspecified/legacy values explicitly, then validate the enum and fail closed for unknown states.
- **Expected outcome:** Publication is explicit, auditable, and typo-safe.
- **Tests:** each allowed state; typo/unknown/retired/archived denied; migration fixture for 73 unspecified records; public API and editor projection parity.
- **Dependencies/decision:** Product/catalog-owner decision required because classifying 73 entries changes availability.
- **Compatibility:** Decision-required; migration must precede fail-closed enforcement.

### CH-0009 — Request-time GLB optimization executes an unpinned network CLI

- **Severity:** P2 at post-CH-0001 HEAD; downgraded from P1 with evidence.
- **Status:** DOWNGRADED_WITH_EVIDENCE. CH-0001 made the route directly admin-only and the request body is bounded before optimization. The mutable request-time package execution remains a real supply-chain and availability defect, but current reachability requires a valid allowlisted administrator and no ordinary public caller can trigger it.
- **Locations/symbols:** `lib/asset-pipeline/normalize.ts`; `lib/asset-pipeline/optimize.ts`; `app/api/tools/glb-optimizer/route.ts`.
- **Evidence/current behavior:** The route accepts files up to 80 MB and synchronously executes `npx -y @gltf-transform/cli`, which is absent from package dependencies.
- **Risk:** Mutable supply-chain execution, runtime network dependency, event-loop blocking, and unbounded CPU/memory/output pressure.
- **Improvement:** Pin the tool at build time, call a resolved local library/binary in an isolated worker, and enforce timeout, CPU/memory/output and external-resource policies.
- **Expected outcome:** Offline, reproducible optimization with bounded resource use.
- **Tests:** no `npx/-y`; offline production; malformed and external-resource glTF; oversized output; timeout; concurrency; cleanup on failure.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving for accepted files; deterministic failures replace ambient network behavior.

### CH-0010 — Disabled share URLs can be resurrected

- **Severity:** P1.
- **Locations/symbols:** design share POST/DELETE route; `lib/useDesignPagePersistence.ts` automatic sharing behavior.
- **Evidence/current behavior:** Disabling only flips `shareEnabled`; enabling reuses the retained token. Designer mode can automatically re-enable sharing.
- **Risk:** A recipient link believed revoked can later work again without the owner sharing a new URL.
- **Improvement:** Rotate/clear token on disable-to-enable and require an explicit sharing action or clearly confirmed policy for automatic enablement.
- **Expected outcome:** Revoked URLs remain invalid permanently.
- **Tests:** disable, reload/designer entry, re-enable, old token remains 404/410, new token works, concurrent enable/disable.
- **Dependencies/decision:** Product decision for automatic-sharing UX; token revocation itself should be fail-safe.
- **Compatibility:** Intentional security semantics change; communicate regenerated links.

### CH-0011 — Session replay lacks an application consent/masking gate

- **Severity:** P1, conditional on project-side PostHog policy.
- **Locations/symbols:** `app/providers/PostHogProvider.tsx`; `app/layout.tsx`.
- **Evidence/current behavior:** Production sets `disable_session_recording: false`; no application consent state, opt-out, or explicit sensitive design/address masking policy was found.
- **Risk:** Room designs, addresses, inputs, or sensitive UI may be captured contrary to privacy expectations or legal basis.
- **Improvement:** Default deny until consent/legal basis is documented; disable replay or mask all text/input and block sensitive canvas/UI regions; expose opt-out.
- **Expected outcome:** Analytics initializes in a privacy-reviewed mode and replay starts only under explicit policy.
- **Tests:** before/after consent; opt-out; masking/block selectors; production/staging configuration; no replay event before approval.
- **Dependencies/decision:** Privacy/legal/product policy required.
- **Compatibility:** Decision-required; analytics volume may change.

### CH-0012 — Saved-design entry points open a lossy legacy editor

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE. The local implementation commit is the commit containing this record; its resolved SHA is recorded after creation in the final Codex response.
- **Locations/symbols:** `lib/design-editor-url.ts:buildDesignEditorUrl`; `app/design/[id]/page.tsx`; `components/DesignsListWithSelection.tsx`; `components/DuplicateDesignButton.tsx`; `app/checkout/success/page.tsx`; `components/editor/design-page/DesignPageWorkspace.tsx`; `components/editor/design-page/DesignPageDialogLayer.tsx`; `lib/useDesignPageFloorPlanLifecycleRegistration.ts`; `lib/useDesignPagePersistence.ts`.
- **Pre-remediation evidence:** Dashboard, duplicate, and checkout success linked to `/design/[id]`. That route cast items through `unknown`, dropped modern multi-room, floor-plan, finish/material and capability state, and rendered legacy `DesignerCanvas`. The canonical persisted-document loader already existed at `/design?designId=...`. Characterization also found that in-editor My Designs loaded a different design without changing the URL, failed/denied route loads could retain a prior document under the wrong URL, and successful floor-plan revision copies could leave the source identity in the address bar.
- **Risk:** The same saved design looks or behaves materially differently depending on entry point; users can conclude data was lost.
- **Resolution/current behavior:** All supported editable saved-design entry points use one typed helper and canonical `/design?designId=<opaque-id>` contract. `/design/[id]` is now a temporary server redirect and contains no database load or legacy renderer. Dashboard, successful duplicate response, checkout continuation, in-editor My Designs, refresh/history, and successful floor-plan revision-copy loading converge on the canonical v3 snapshot loader. Missing/denied loads restore the prior canonical identity or `/design`; superseded/unmounted operations cannot pull navigation back. My Designs is loaded on demand so the routing change does not worsen the inherited initial-JS bundle.
- **Canonical contract:** Consumer is the default with no `mode`; `mode=designer` only requests Designer presentation and never grants entitlement. Only verified `mode=designer`, `view=2d`, `workspace=furnish`, and an explicitly supplied encoded `floorPlanImport` value can accompany the encoded opaque `designId`. Arbitrary redirect, attribution, or destination parameters are not forwarded. Empty IDs are rejected by the helper. The design API remains the owner/enabled-share-token read boundary and owner-only write boundary; `/api/me` plan/capabilities remain the Pro authority.
- **Regression evidence:** `npm run test:design-editor-routing`; `npm run verify:design-persistence`; final six-case database-backed Chromium spec (6/6 in 3.0 minutes); existing share/duplicate smoke (4/4 in 16.7 seconds); floor-plan revision-copy and consumer-flow guards; focused and expanded zero-warning lint; typecheck; code-quality ratchet; explicit-development production build. The fixture proves full multi-room geometry, openings, finishes/opacity, item identities/transforms, zones, saved views, save/reload identity, no startup create, duplicate returned-ID use, checkout context, legacy redirect filtering, Pro non-escalation, history/refresh, and denied-ID fallback.
- **Compatibility:** Existing `/design/[id]` bookmarks remain compatible through a non-permanent redirect. `/share/[shareToken]` and the orphaned read-only `/d/[token]` compatibility route are separate share contracts; the latter remains documented debt, not an editable saved-design fallback.
- **Rollback:** Revert the single CH-0012 implementation commit. A partial emergency rollback should revert callers first while retaining `/design/[id]` as a compatibility redirect. There is no schema, migration, persisted-document rewrite, dependency upgrade, push, or deployment to undo.

### CH-0013 — Generated surface registry is an unenforced, oversized client contract

- **Severity:** P1.
- **Locations/symbols:** `scripts/generate-surface-material-runtime.ts`; `scripts/test-surface-material-schema.ts`; `lib/generated/surface-material-runtime.generated.ts`; `lib/surface-material-runtime.ts`; plan panel and surface inspector consumers; `package.json`; CI.
- **Evidence/current behavior:** Generated file is 92,044 lines/2.52 MB with 980 production entries, currently all draft. Production and fixtures are imported/spread before filtering; the built client contains a sentinel in a 3.79 MB chunk. Generator has `--check`, but its suggested package command does not exist and neither drift nor schema check is wired to CI. Measured initial JS is approximately 7,068,799 raw/1,160,288 Brotli, above current 6,955,000/1,130,000 budgets.
- **Risk:** Silent generated drift, large parse/download costs, linear lookups, and accidental fixture/draft shipping.
- **Improvement:** Add generate/check/schema commands and CI drift enforcement first. Then split compact render records from lazy authoring metadata and test fixtures, use keyed immutable indexes, and load Pro draft metadata on demand.
- **Expected outcome:** Reproducible generated data, no fixture leakage, preserved saved-material rendering, and budget headroom.
- **Tests:** generator idempotence/drift; schema; fixture exclusion; Consumer/Pro visibility; selected/saved material render/export parity; raw/compressed bundle budgets.
- **Dependencies/decision:** No decision if Pro visibility is preserved; confirm whether complete offline browsing is a product requirement.
- **Compatibility:** Gate wiring is behavior-preserving; payload restructuring requires parity fixtures.

### CH-0014 — Each 3D item owns expensive loading, listeners, and frame work

- **Severity:** P2 at post-CH-0001 triage; downgraded from P1 with evidence.
- **Status:** DOWNGRADED_WITH_EVIDENCE. The per-item loaders, global listeners, clones, and frame work remain visible in source, but the audit has no measured production threshold breach, data-loss path, security/privacy consequence, or demonstrated core-workflow outage attributable to this ownership. Keep it as material performance/reliability debt and promote it only if the required 10/100/500-item benchmark proves high-impact failure.
- **Locations/symbols:** scene item layer, `components/scene/FurnitureItem.tsx`, `components/scene/GLBScaledModel.tsx`, GLB normalization helpers.
- **Evidence/current behavior:** Instances create loader/decoder/load/clone work; each item registers global keyboard handling and frame callbacks. This scales per object rather than per scene/selection and complicates disposal.
- **Risk:** Large designs amplify network/decode/memory/event/frame costs, create duplicated handlers, and increase stale resource or leak risk.
- **Improvement:** Introduce a scene asset resource manager with promise/cache/ref-count/disposal ownership, centralize keyboard commands at editor scope, and invalidate frames only for active animation/interaction.
- **Expected outcome:** One load/decoder path per asset, deterministic disposal, one keyboard owner, and near-idle frame cost for static scenes.
- **Tests:** concurrent same-URL dedupe; retry/error; clone isolation; ref-count disposal; mount/unmount listener count; selected-item delete; 10/100/500-item CPU, memory, and frame benchmarks.
- **Dependencies/decision:** None; preserve visual and interaction parity.
- **Compatibility:** Behavior-preserving with golden scenes and interaction characterization.

### CH-0015 — Drawers and major overlays bypass accessible dialog ownership

- **Severity:** P1.
- **Locations/symbols:** `ItemCartDrawer`; editor dialog layer; Plans dialog; My Designs dialog; Command Palette; shared `EditorDialog`.
- **Evidence/current behavior:** Closed cart is translated off-screen while controls remain mounted/focusable. It lacks dialog semantics, inert/focus containment, Escape and focus return. Several major modals bypass the shared accessible dialog primitive.
- **Risk:** Keyboard and assistive-technology users can focus invisible controls, lose context, or become trapped; overlay behavior diverges.
- **Improvement:** Migrate overlays to one primitive with semantic title/description, inert background, focus trap/return, Escape policy, responsive sizing, and explicit non-modal exceptions.
- **Expected outcome:** Consistent accessible overlay lifecycle without changing domain actions.
- **Tests:** tab order when closed/open; axe; screen-reader names; Escape; click outside policy; focus return; narrow viewport; nested prompt; command palette shortcuts.
- **Dependencies/decision:** None unless a specific overlay must be non-modal.
- **Compatibility:** Behavior-preserving for actions; keyboard behavior becomes correct and consistent.

### CH-0016 — CI does not validate a strict production-equivalent artifact

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY REMEDIATION COMPLETE at `cbed3550026e2803675f740b49be5fb15f15612b`; EXTERNAL EXECUTION/VERIFICATION REQUIRED. No GitHub or Vercel execution is claimed.
- **Locations/symbols:** `.github/workflows/ci.yml`; `lib/catalog-runtime.ts`; `playwright.config.ts`; build and smoke scripts.
- **Pre-remediation evidence:** CI forced `CATALOG_STRICT_VALIDATION=false`, built leniently, then smoke defaulted to `npm run dev` rather than `npm start` against the built output. Existing Vercel source inspection ignored untracked files. A diagnostic artifact trace contained `.env`, `.env.local`, and a private release-evidence file.
- **Risk:** A green workflow can ship a production-only catalog, tracing, server-start, or build-artifact defect.
- **Resolution/current behavior:** Required CI now runs `npm ci --include=dev` from a clean exact commit, the existing generated-runtime drift check, a strict staging-mode `npm run build`, SHA-256 inventory of `.next` and `public`, blocking NFT trace-closure validation, and runtime smoke through a manifest-verifying wrapper around unchanged `npm run start`. Playwright cannot reuse a listener or choose `npm run dev`; its JSON report and `/api/health` response must match the source SHA, artifact SHA-256, and Next build ID. The manifest sidecar, embedded report hash, and current-state revalidation reject tampering or reuse. Local evidence always records `releaseReady=false`, `actualDeploymentVerified=false`, and Vercel/GitHub/OAuth/scheduler/database controls as `not_verified`.
- **Expected outcome:** Required CI proves one local production-mode artifact rather than a second development compilation, while external deployment claims remain separate.
- **Tests/evidence:** `npm run test:production-artifact-evidence` covers clean happy path, tracked/untracked source, SHA/lock/generated/artifact/report/staleness/environment/dev/skip/failure/same-artifact/external-control/secret/trace negatives and strict invalid-catalog validation. Strict staging build passed; rebuilt trace inventory contained 112 trace manifests/42,879 references with zero missing or prohibited paths. Final exact-candidate `evidence:production:build`, smoke, and verify results are recorded in the handoff. Their detached-worktree files are ephemeral local verification output, not durable release evidence; durable retention remains pending an actual GitHub Actions artifact upload.
- **Dependencies/decision:** CI secret/environment inventory. No product decision.
- **Compatibility/limits:** Gate-only; no product/data behavior, dependency, schema, migration, deployment, or external setting changed. Turbopack still warns that one floor-plan import causes broad tracing; the evidence inventories and bounds that closure rather than claiming the warning is fixed. CH-0013, CH-0017, and CH-0018 remain separate.
- **Rollback:** Revert the one CH-0016 implementation commit. This restores lenient/dev release evidence and is not a recommended steady state.

### CH-0017 — Critical tests are omitted or can report false passes

- **Severity:** P1.
- **Status:** TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN. Its gate identities, cadences, truthfulness semantics, source binding, workflow isolation, OAuth transport, artifact safety, and timeout provenance are unchanged by CH-0028 or CH-0029. The discovery fingerprint advanced from 365 to 368 classified sources only because CH-0029 added three risk-triggered focused scripts.
- **Locations/symbols:** `scripts/required-test-manifest.json`; `scripts/required-test-truthfulness.mjs`; `tests/e2e/05-buy.spec.ts`; `07-kelsey-variants.spec.ts`; `scripts/cabinetry-tests/export-behavior.ts`; CH-0016 and cabinetry report validators; `scripts/vercel-prebuilt-release.mjs`; Playwright configurations; CI/package gate wiring.
- **Pre-remediation evidence:** Commerce/variant cases annotated and returned when core fixtures/assertions were absent, which Playwright recorded as expected passes. The cabinetry GLB export test caught a missing `FileReader`, printed a skip message, and exited zero. The floor-plan live-progress test was absent from its required umbrella. Full E2E was non-required and `continue-on-error` without a separate process-bound release evidence contract. Gate A3 consumed only aggregate counts and URL; cabinetry used a minimum test count; CH-0016 did not verify its two stable runtime identities. Security, persistence, Stripe, Phase 14/15, Consumer/Pro, and cabinetry contract suites were not merge-required as one explicit critical group.
- **Risk:** Release summaries overstate validated customer paths and new persistence behavior can merge untested.
- **Resolution/current behavior:** One canonical manifest classifies 248 script tests, 98 browser specs, 14 imported browser modules, and 8 imported cabinetry script-test modules; binds source-inventory and recursively reachable package-command closure hashes, split-suite registrations, stable requirement IDs, commands, projects, cadence, reports, artifact policy, and CI ownership. Required Playwright evidence rejects zero discovery, missing/renamed/excluded specs or registrations, missing projects, filters/shards, `.only`, skips, retries/flakes, annotations, not-run/failed tests, aggregate disagreement, nonzero child status, stale/malformed/tampered reports, source/artifact/URL mismatch, machine-local paths, and secret-bearing fields. The two named commerce/variant specs now fail on missing prerequisites. A deterministic Node `FileReader` shim makes the GLB export assertion execute instead of skip. Live progress is in the required floor-plan chain. Critical domain contracts are merge-blocking. Broad full E2E is explicitly advisory; exact Gate A3 is separately release-blocking and bound to the staged prebuilt artifact. Cabinetry release evidence uses a clean-source process-captured envelope for all 23 stable workflows and binds its report to the top-level candidate artifact. Outcome D established that the furnished-template smoke used HTTP completion plus Playwright's implicit five-second poll as a proxy for client-side GLB decode/normalization readiness. The runtime now exposes its existing `loading`/`ready`/terminal-`error` lifecycle, and the smoke waits on that bounded semantic state with safe diagnostics. Exact-head run `30684560486` then proved semantic readiness but exposed the independent 240-second whole-test envelope defect. The smoke now derives a 660-second envelope from all 14 sequential phase budgets plus named overhead, emits portable phase timings, and retains immediate terminal failure. Imported Playwright modules must each contribute records before attribution to their single runnable aggregator owner. Advisory upload preparation atomically requires the structured envelope/report and truthfully summarizes failing results while omitting unsafe optional diagnostics with reason/SHA-256; malformed or unsafe mandatory evidence still rejects the bundle. One guarded non-production OAuth fixture and JSON session preflight prevent the prior invalid advisory environment. Gitleaks SARIF is atomically restaged at a deterministic root-level layout without weakening the scan.
- **Tests:** Temporary-directory negative suite exercises the real exported validator; CH-0016 and cabinetry suites exercise their real integrations and stable test identities. The two required runtime identities pass locally against a migrated strict production artifact. Portability negatives cover Linux/macOS/Windows/temp paths, nested error contexts, shaped and generic credentials, renamed binary bytes, unsafe cleanup targets, and atomic failure. Exact cases and commands are recorded in `docs/qa/required-test-truthfulness.md` and `HANDOFF.md`.
- **Dependencies/decision:** No product semantics changed. Honest commerce/visual/browser failures may now block their required cadence; resolving such behavior is a separate finding or fixture-owner decision, never a truthfulness waiver.
- **Compatibility:** Gate/test-evidence only; the cabinetry release-evidence contract schema is strengthened, but no dependency, framework, product/database/persisted-data schema, migration, catalog, product behavior, deployment, or external setting changed.
- **Rollback:** Revert the Outcome-D follow-up first, then `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then `c840c06dc2c5e67f463542292bb7391b0f93d731`. This restores timing-dependent smoke, unsafe/raw retention, and false-pass evidence paths and is not an acceptable steady state. No GitHub ruleset change is part of this chain.

### CH-0018 — Migration validation proves fresh install, not safe upgrade

- **Severity:** P1.
- **Locations/symbols:** `scripts/provision-gate-a3-database.mjs`; `prisma/migrations`; `lib/phase15-release-evidence.ts`; release entry criteria.
- **Evidence/current behavior:** Gate A3 deploys a fresh database and counts migrations. It lacks `prisma validate`, schema/database diff, and a populated predecessor upgrade. Migration `20260211150315_add_user_to_design` explicitly fails on nonempty `Design` before a later migration restores nullability. Release evidence accepts any nonblank migration version and docs say 38 while 42 directories exist.
- **Risk:** Historical or future upgrades can fail or lose data despite a green fresh install; evidence can claim an unrelated migration state.
- **Improvement:** Test blank install plus representative populated predecessor upgrade, schema diff, data invariants, ordered migration digest, and dedicated deployment database status.
- **Expected outcome:** Release evidence is cryptographically/logically bound to the migrations and upgrade path actually tested.
- **Tests:** predecessor fixtures with nonempty designs/users/shares/floor-plan jobs; deploy; schema diff; row/invariant preservation; digest mismatch rejected.
- **Dependencies/decision:** Select supported predecessor versions and sanitized fixture ownership.
- **Compatibility:** Gate/evidence only; no migration rewrite without a separate recovery design.

### CH-0019 — The audit baseline is red and masking later assertions

- **Severity:** P1 for release readiness, P2 as code-health debt.
- **Status:** READY as bounded baseline-restoration batches; it does not outrank a higher-risk READY product finding under the post-closure decision rule.
- **Locations/symbols:** `CatalogPanel.tsx`; `FloorPlanImportAssistant.tsx`; `scripts/test-command-bar-save-status.ts`; three Hamilton catalog YAMLs; design architecture checker; Phase 8 benchmark; Pro visual policy.
- **Evidence/current behavior:** At `62ba966ecb2011e4233c99ce1dcc0641914af008`, focused reruns confirm the four inherited groups: one `CatalogPanel` hook error, one `FloorPlanImportAssistant` hook warning, the stale command-bar save-status assertion, and five catalog vocabulary failures across three Hamilton YAML files. Separate current checks also confirm masked or omitted failures: design architecture is 594/550 and 361/300 lines, Phase 8 CPU fingerprinting now passes but the initial-JS raw bundle is 7,068,799/6,955,000 bytes, and Pro visual policy remains 2/4 because the Cabinet Preview opener is hidden in Chromium and WebKit. Sequential commands mask the architecture check behind the save-status assertion. CI builds with `CATALOG_STRICT_VALIDATION=false`.
- **Risk:** Refactors cannot distinguish regressions from inherited failures; release confidence is ambiguous.
- **Improvement:** Establish a baseline-restoration phase with one defect per reviewed commit, record stale-test versus implementation decisions explicitly, and run masked checks separately until green.
- **Expected outcome:** Required fast baseline is green before structural work, with any temporary exception owner/expiry documented.
- **Tests:** Exact commands in `05_QUALITY_GATES_PLAN.md`; repeat twice for timing-sensitive performance/visual failures.
- **Dependencies/decision:** Command-bar and Cabinet Preview intended behavior need product confirmation before changing tests or UI.
- **Compatibility:** Characterization first; no test should be weakened to obtain green.

### CH-0020 — High-churn editor, floor-plan, and cabinetry monoliths exceed ownership budgets

- **Severity:** P2.
- **Locations/symbols:** `RoomRenderer2D`; `DesignControlsPlanPanel`; `DesignPageWorkspace`; viewport registration; Cabinetry Studio coordinator/views/validation/generation; floor-plan compiler/raster/evidence modules.
- **Evidence/current behavior:** Multiple component bodies exceed 2,500–4,000 lines; validation exceeds 3,400; the design architecture ratchet is red; floor-plan architecture permits 30 oversize warnings; several units are also top history churn.
- **Risk:** Changes cross concerns, reviews become non-local, effect/state ownership blurs, and merge conflict/regression rates rise.
- **Improvement:** Extract pure domain calculations and stable adapters behind existing public facades; split by responsibility only after characterization; ratchet touched-file budgets downward without mass rewrites.
- **Expected outcome:** Smaller review surfaces and explicit state/render/integration ownership while routes and document formats remain stable.
- **Tests:** Existing characterization and E2E, import-cycle graph, facade/API snapshots, file/function budgets for touched modules, visual golden fixtures.
- **Dependencies/decision:** Sequence after CH-0019; no redesign of Consumer/Pro.
- **Compatibility:** Behavior-preserving, incremental strangler pattern.

### CH-0021 — Pointer-up can persist a stale drag position

- **Severity:** P2.
- **Locations/symbols:** `components/scene/Furniture.tsx` drag move/up handlers and cross-room placement dispatch.
- **Evidence/current behavior:** Pointer move enqueues state, while pointer up reads closure position instead of a ref containing the latest accepted transform. A final rapid move or cross-room placement can be omitted.
- **Risk:** Visible item position and persisted/history position diverge at gesture end.
- **Improvement:** Keep the authoritative accepted transform in a ref owned by the gesture transaction; commit exactly once on pointer-up/cancel and reconcile rejected constraints.
- **Expected outcome:** Final visible, undo/history, room ownership, and persisted positions match.
- **Tests:** rapid final move+up; throttled state; cross-room drag; constraint rejection; pointer cancel/lost capture; undo/redo and reload.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving bug fix.

### CH-0022 — Performance sampling forces root updates even when disabled

- **Severity:** P2.
- **Locations/symbols:** `ScenePerformanceBridge`; `useScenePerformance`; editor Canvas integration.
- **Evidence/current behavior:** A one-second sampler updates root React state and invokes callbacks before checking whether performance collection is enabled.
- **Risk:** Permanent editor rerenders contaminate the performance being measured and add idle work for every user.
- **Improvement:** Early-return when disabled; store samples in refs/external store; subscribe only visible diagnostics; batch non-urgent updates.
- **Expected outcome:** Zero sampling-driven root renders when disabled and isolated diagnostics overhead when enabled.
- **Tests:** render-count harness; fake timers enabled/disabled; callback count; unmount cleanup; long-idle profile.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving; telemetry values remain available to subscribers.

### CH-0023 — Request bounds, workflow transitions, and API errors are inconsistent

- **Severity:** P2.
- **Locations/symbols:** `lib/api-boundary.ts`; Stripe webhook; import job transition service; bulk import route; duplicate/floor-plan/Shopify route branches.
- **Evidence/current behavior:** Some size checks call `request.text()` before measuring; webhook lacks an application limit. Import transitions read then update only by ID, while bulk bypasses transition validation. Several routes bypass the structured error contract and can leak non-JSON Prisma failures.
- **Risk:** Memory amplification, stale concurrent transitions, forbidden state moves, and brittle clients/observability.
- **Improvement:** Use bounded streaming readers including raw signed bodies; version/CAS or serializable transition service; one route wrapper with stable codes, operation IDs, and Prisma conflict/retry mappings.
- **Expected outcome:** Bounded resource use, legal state machines under concurrency, and one predictable API error envelope.
- **Tests:** oversized chunked stream cancels before handler; webhook signature with bounds; stale parallel transitions; forbidden bulk move; contract matrix for 400/401/403/404/409/429/500.
- **Dependencies/decision:** Define maximum webhook/import sizes; otherwise no product decision.
- **Compatibility:** Mostly behavior-preserving; explicit bounds may reject formerly unbounded input.

### CH-0024 — Public readiness and catalog parsing amplify operational work

- **Severity:** P2.
- **Locations/symbols:** `app/api/health/route.ts`; public catalog routes; `lib/catalog-yaml.ts:getFreshCatalogYamlEntries`.
- **Evidence/current behavior:** Anonymous `?deep=1` performs DB/queue queries and reveals build/catalog/queue counts. Public health/catalog calls synchronously invalidate and reparse all YAML.
- **Risk:** Cheap public requests amplify filesystem, DB, and queue work and disclose operational state.
- **Improvement:** Keep shallow liveness public; authenticate/cache/rate-limit readiness; generate or cache immutable catalog data by build hash.
- **Expected outcome:** Public probes are constant-cost and operational details stay on protected readiness channels.
- **Tests:** anonymous deep denied; shallow response contract; cache hit/miss/concurrency load; build-hash invalidation; monitoring authentication.
- **Dependencies/decision:** Monitoring integration may require an endpoint migration.
- **Compatibility:** Decision-required only for external monitoring migration.

### CH-0025 — Test discovery, typing, and platform coverage are incomplete

- **Severity:** P2.
- **Locations/symbols:** 240 `scripts/test-*`; `scripts/run-design-page-cleanup-tests.mjs`; `tsconfig.json`; Playwright snapshots; large hooks without direct characterization references.
- **Evidence/current behavior:** Forty-four script tests have no package/runner reference. E2E is excluded from TypeScript compilation. Only three Darwin snapshot baselines exist while CI runs Ubuntu. Product configuration, selector state, and Hugg material logic have no direct nearby/static test reference.
- **Risk:** Valuable tests silently rot or never run; browser test type errors and platform snapshot failures appear late; monolith extraction lacks a safety net.
- **Improvement:** Add a test manifest audit or standard runner, `tsconfig.e2e.json`, explicit platform visual jobs/baselines, and characterization tests around high-risk seams.
- **Expected outcome:** Every test has an owner/cadence, E2E compiles, and visual/platform expectations are intentional.
- **Tests:** meta-test fails unclassified addition; E2E typecheck; Linux/Darwin snapshot selection; mutation/fixture checks for prioritized hooks.
- **Dependencies/decision:** CI platform ownership; no product decision.
- **Compatibility:** Gate-only.

### CH-0026 — Server-only boundaries are implicit

- **Severity:** P2.
- **Locations/symbols:** server-side auth, Prisma, filesystem, configuration, admin and integration modules.
- **Evidence/current behavior:** Current client/server scan found no confirmed forbidden import, but no `server-only` guard is used. Safety depends on convention and current graph shape.
- **Risk:** A future refactor can pull credentials, Node dependencies, or oversized server code into a client graph before review catches it.
- **Improvement:** Mark server entry modules, create browser-safe DTO/adapters, and add a resolved client-import boundary check.
- **Expected outcome:** Accidental server-to-client imports fail immediately in build/test.
- **Tests:** negative fixture imports Prisma/auth/fs/non-public env from a client module; allowed shared pure module remains valid.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving architecture guard.

### CH-0027 — Operational documentation and tracked local output have drifted

- **Severity:** P3.
- **Locations/symbols:** root README; `catalog/README.md`; older phase/deployment docs; product release criteria; tracked `prisma/dev.db` and `test-results/.last-run.json`; missing formatter setup.
- **Evidence/current behavior:** README advertises four package managers despite canonical npm; catalog docs name nonexistent commands; older docs contain stale absolute paths, obsolete CI/source-of-truth claims, and a destructive Prisma reset instruction; migration count says 38 instead of 42; ignored/local artifacts remain tracked; no format command exists.
- **Risk:** Engineers follow unsafe/stale procedures, waste time on nonexistent commands, and reviews accumulate avoidable formatting noise.
- **Improvement:** Label historical docs, reconcile canonical runbooks, generate command/migration references where practical, untrack local outputs in a reviewed commit, and adopt a formatter only as an isolated low-churn decision.
- **Expected outcome:** One trustworthy operational entry point and deterministic hygiene without mixed functional changes.
- **Tests:** documentation link/command audit; migration-count/digest check; clean-clone status; formatter check only after a dedicated no-behavior baseline.
- **Dependencies/decision:** Formatter choice is a team decision; documentation corrections are not.
- **Compatibility:** Behavior-preserving; keep formatting churn out of refactor batches.

### CH-0028 — First-reload model readiness convergence

- **Severity:** P1 release/runtime reliability.
- **Status:** EXTERNALLY VERIFIED — RESOLVED at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. The historical local-validation detail below predates and is superseded by that external status.
- **Authoritative evidence:** Source `8e0260f5654126ec21b669d0471bcfb3c0f5cf5b`, run `30745386331`: furnished-template failed, health/catalog passed, retries 0, exit 1. Reload 1 failed at 76,043/308,000 ms because `model-responses-and-readiness` expired at 70,001/70,000 ms with all responses complete, zero outstanding, and three current required fixture records still loading. CH-0017 reported the runtime failure truthfully and remains frozen.
- **Verified classification:** **F — genuine performance condition.** The external artifact retained aggregate loading state after all responses, not an exact post-response stage trace. Controlled same-path exact-identity/stage tracing showed current-generation active entries, no stale or optional blockers, no ignored current completion, and normal parse/normalization/bounds/attachment progression. The canonical component repeated GLB parse/decode, geometry/material normalization, and bounds work during the forced in-document remount. The external nine-versus-six response count confirms that extra generation; combined with the controlled trace and external timing, this supports the performance classification.
- **Resolution/current behavior:** One 32-entry ref-counted parsed cache and one 32-entry ref-counted prepared cache share equivalent resources across an in-document remount. Failed loads evict, inactive least-recently-used entries prune, disposal is per entry, prepared resources retain their parsed-source lease, terminal page hide clears prepared before parsed resources, and BFCache preservation retains both. Cache and network consumers emit equivalent lifecycle stages. The one existing safe diagnostic registry now binds scene/product/variant/readiness key, URL/hash, mount instance, reload generation, required/active state, stages, cancellation, transition time, and closed terminal category; inactive diagnostic tombstones are bounded at 128. Exact required identities and stable registry size—not aggregate counts alone—gate the smoke.
- **Compatibility and limits:** True page reloads still create new document generations and real responses. The 70,000 ms nested operation, 308,000 ms reload parent, three reloads, zero retries/skips, response checks, selection, bounds, persistence, remount, render-loop, and final-state assertions are unchanged. No schema, migration, dependency, catalog, product data, user content, URL-forced readiness, timeout increase, Full E2E, or external mutation is included.
- **Validation:** Deterministic lifecycle and cache contracts cover network/cache readiness, unmount cancellation, supersession/stale callback rejection, duplicate URLs, optional scoping, post-response pending stage, terminal parse/normalization/bounds categories, bounded ownership/disposal, and three generation resets without registry growth. GLB bounds, design persistence, production-evidence, required-test truthfulness, typecheck, zero-warning targeted lint, code-quality, strict production build, and diff hygiene pass. Three separate 42-migration PostgreSQL runs passed furnished-template and health/catalog 2/2, exit 0:

| Run | Semantic | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,159/80,000 | 6,823/103,000 | 10,572/165,000 | 19,917/308,000 | 21,581/308,000 | 22,064/308,000 |
| 2 | 7,309/80,000 | 6,894/103,000 | 10,864/165,000 | 22,939/308,000 | 21,064/308,000 | 21,311/308,000 |
| 3 | 6,815/80,000 | 6,861/103,000 | 11,294/165,000 | 21,414/308,000 | 21,210/308,000 | 20,404/308,000 |

- **Rollback:** Revert the one CH-0028 commit. This disables resource reuse and exact lifecycle diagnostics together; no data rollback exists. Detailed ownership and safe diagnostic rules are in `docs/architecture/glb-model-lifecycle.md`.

### CH-0029 — Post-response browser/main-thread starvation

- **Severity/status:** P2 performance; **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. Local remediation is complete on the separate CH-0029 branch, but closure requires exact-commit required-only external verification.
- **Authoritative evidence:** Run `30787561725` completed 6/6 responses with zero outstanding and coherent current-generation lifecycle/cache ownership, but all eight required models remained loading while browser work was starved. Its largest completed heartbeat gap was 11,747 ms; its largest admitted callback delay was 5,281 ms; and the final requested callback never entered. Body computation, callback execution, and serialization were at most 0/3/0 ms.
- **Measured classification:** **C/G — React/R3F render work plus host/test contention**. The hidden loading Canvas ran the complete mounted per-frame subscriber workload plus renderer/GPU submission while trace/video work competed on the constrained host. A matched pre-fix run recorded a 10,736 ms `unattributed` long task; `r3f-render` was only 387.9 ms total and 148.1 ms maximum, so the long task is not attributed directly to the renderer. Parse, cache, clone, normalization, materials, bounds, scene attachment, disposal, lifecycle, and store timings did not own the interval.
- **Correction:** Use demand rendering only while the loading veil hides the Canvas, then restore continuous `always` rendering for visible interaction. Disable trace/video only in the stable runtime-smoke spec. Add bounded, production-gated, metadata-only fixed-category telemetry with detached snapshots and safe maximum-task context. No timeout, retry, readiness, cache/refcount, lifecycle ordering, cancellation, supersession, terminal path, clone isolation, BFCache, workflow, or product interaction contract changes.
- **Validation and limits:** Three fresh production smokes passed 2/2 and all nine reloads in 10,192–11,354 ms with cumulative responses 6/9/12, 8 ready / 0 loading / 0 error, current generations, and coherent 8/13 parsed plus 12/7 prepared cache/refcount totals. Maxima were 6,858 ms heartbeat and 6,406 ms admitted callback, with every callback entering. Under two ~98% CPU workers, reloads were 12,725/11,859/12,048 ms; maximum heartbeat was 8,102 ms and admitted callback 7,168 ms, again with all invariants. The heartbeat reduction and elimination of no-entry are material; the admitted maximum is not numerically below the external 5,281 ms maximum, and the longest JavaScript task remains unattributed.
- **Rollback:** Revert the one CH-0029 commit. This restores continuous hidden-Canvas frames and stable-smoke trace/video retention. No database, schema, cache-policy, timeout, external-control, PR, or deployment rollback exists.

## Positive controls worth preserving

- Strict TypeScript production source showed no explicit `any` or suppression directives in targeted scans.
- No resolved runtime dependency cycle was found.
- The canonical document, floor-plan, cabinetry, persistence, and security suites contain substantial domain-specific characterization.
- Core design/floor-plan ownership checks, Stripe signature/idempotency handling, and Shopify variant identity validation were generally strong in the inspected routes.
- Floor-plan processing already includes durable limiting/outbox/recovery patterns that can serve as models for broader services.

These strengths argue for incremental extraction behind existing contracts, not a rewrite.

## RC47-RC55 archival disposition — 2026-08-05

Exact candidate `7016da0ad74c7d463a07ec061259b50d757031e0` was audited read-only
against the retained RC47-RC55 chain. All nine references were recovered, but
none is an ancestor or patch-equivalent of the candidate. Each disposition is
**G — STILL_REQUIRED**, consolidated into eight stable findings:

- P1 `ARCH-RC49-50-CLOUD-BASELINE`: loaded and recovery-copy state lacks a
  normalized, render-acknowledged autosave baseline.
- P1 `ARCH-RC53-CLOUD-REVISION`: serialized writes can execute with a revision
  captured before the preceding write committed.
- P2 `ARCH-RC48-KEYBOARD`: furniture rotation remains split across per-item and
  central keyboard owners with conflicting Shift+R semantics.
- P2 `ARCH-RC51-COMPARE`: compared products resolve through the filtered map and
  disappear after category/filter changes.
- P2 `ARCH-RC52-DRAWER-FOCUS`: catalog hydration can unmount the drawer opener
  before focus restoration.
- P3 `ARCH-RC47-ASSERTIONS`: two product specs still query the drawer's obsolete
  `complementary` role.
- P3 `ARCH-RC53-55-SHARE-RESPONSIVE`: share rooms lack distinct mobile/table
  projections and stable layout readiness coverage.
- P3 `ARCH-RC54-PROJECTION-ASSERTION`: beta smoke compares owner-visible and
  public-projection fingerprints rather than like-for-like public projections.

The integration result is **B. ARCHIVAL DISPOSITION COMPLETE — ADDITIONAL
BOUNDED REMEDIATION REQUIRED**. No integration branch should be created yet.
The exact commit inventory, semantic evidence, validation results, and
independent review are in `docs/code-health/07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.
