# P0/P1 remediation queue

## Runtime-smoke external timing ownership — 2026-08-15

- **Classification:** `RUNTIME_SMOKE_TIMING_EVIDENCE_ROOT_CONTRACT_DEFECT` and
  `STAGE_ENVIRONMENT_OUTPUT_CAPABILITY_OWNER_MISMATCH`; release-blocking
  certification-platform source defect.
- **Preserved blocker:** read-only review stopped candidate
  `d449afd0ff693ad8bd03932d13b768b961dceab4` / tree
  `2af0f9c22cff576663174903494f904bdd4c4960` before IDs, state, evidence root,
  doctor, or substantive stages. No mutation occurred and the result is not a
  runtime-smoke execution failure.
- **Owner/correction:** classification
  `PLAYWRIGHT_EXTERNAL_ROOT_OWNS_ALL_RUNTIME_OUTPUTS`. A versioned resolver
  prevalidates explicit external root plus report, timing, start-marker, and
  runtime-summary destinations. `CERTIFICATION_EVIDENCE_ROOT` stays
  parent-only; the timing writer consumes only the projected Playwright root
  and exact path, with no inference, fallback, tree creation, or overwrite.
- **Final binding:** portable timing evidence records the safe relative path,
  root-contract/profile/identity hashes, terminal marker, and complete
  certification/candidate/artifact/manifest/journal identity. Final standalone
  rehashes it and rejects wrong root/profile/run/artifact/completion/content.
- **Proof/status:** exact real-writer preflight regression, A–U isolation
  negatives, phase/deadline/readiness/failure guards, doctor, simulation through
  final/integration readiness, final tamper tests, historical/state/worktree/
  source/continuity matrices, artifact/truthfulness owners, and source-quality
  checks. The exact clean-commit qualifier returns
  `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`. Independent read-only review
  returned `PASS` with no remaining actionable finding after its simulation
  preflight coverage finding was fixed and rechecked. Real exact-head
  certification and final CH-0015 audit remain pending.
- **Scope/rollback:** certification/runtime-evidence infrastructure and docs
  only; no product, Floor Plan, vision, telemetry, NFT, timestamp, Playwright
  product assertion, Phase 8 semantic/budget, dependency/lockfile, database,
  workflow, deployment, or real-gate change. Revert the single focused commit;
  this restores the known source blocker and changes no external data.

## Transactional certification state and pristine worktrees — 2026-08-15

- **Classification:** `CERTIFICATION_STATE_PRECONDITION_MUTATION_DEFECT` and
  `CERTIFICATION_STAGE_WORKTREE_ISOLATION_DEFECT`. The retained historical
  attempt is failed/invalidated and must not be repaired or reused.
- **State correction:** validate complete invocation context before state read;
  use sealed state as canonical identity; make validation/resume/build
  eligibility read-only; emit sealed discrepancy/plan records; require an
  explicit reconciliation owner plus exact state hash for atomic invalidation.
  Every state write holds an exclusive sidecar lock and compares the expected
  current byte hash before atomic replacement. Precondition failures remain
  `consumed=false` and byte-identical; concurrent/stale writers fail closed.
- **Execution correction:** create distinct detached `source-validation`,
  `final-artifact`, and `development-browser` worktrees at the exact candidate.
  Bind physical/dependency/lifecycle identity, reject canonical/alias/symlink/
  wrong/cross-certification roots and ignored influence, strip `NODE_PATH` and
  `NODE_OPTIONS` from stage children and dependency installers, retain roots
  through continuity, and clean up only task-owned roots explicitly.
- **Canonical checkout:** its 1,305 ignored user paths, aggregate
  `8ad720847565da6d586f2881e674d51100b70da27335eedee4deee8814fb50af`, and
  external-target symlink are non-inputs. No quarantine, restoration, copying,
  ignored-file deletion, or `git clean` belongs to certification.
- **Proof/status:** the new transactional/worktree matrix, real Git-worktree
  fixtures, doctor, simulation, historical regressions, qualification, and
  independent read-only review own closure. The pre-commit dirty-tree qualifier
  returned `NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`; the final handoff records
  the sole post-commit qualifier result from the exact clean commit. Real
  exact-head certification, integration, and the final CH-0015 closure audit
  remain pending.
- **Scope/rollback:** certification infrastructure and documentation only; no
  product/UI, Floor Plan, telemetry, NFT, benchmark, dependency/lockfile,
  database/migration/data, workflow, deployment, or real-gate behavior. Revert
  the single focused commit to roll back; this restores the known blockers.

## Harness v1 source-validation and measured continuity — 2026-08-14

- **Classification:** `SOURCE_VALIDATION_STAGE_BYPASS_DEFECT` and
  `ARTIFACT_CONTINUITY_SELF_ASSERTION_DEFECT`; both are release-blocking source
  contracts and invalidate the earlier Harness v1 qualification result.
- **Source correction:** one machine-readable ordered 19-check set owns the
  canonical commands. The real stage invokes them, stops on first failure,
  retains sealed streams/results, verifies source stability, and cannot pass
  with an identity descriptor or edited state.
- **Continuity correction:** six lifecycle snapshots are independently measured
  from retained physical roots. Canonical application-artifact equality and
  complete executable archive-closure equality are separate, and final
  continuity rehashes roots and archive bytes before readiness.
- **Ownership/proof:** `ci.production-artifact-contract` owns 15 source
  anti-bypass cases, 23 physical-continuity/tamper cases, the preserved 26
  historical cases, doctor, deterministic simulation, and source qualification.
  Direct manifest inventory is 27 gates / 380 sources. The corrected bounded
  qualifier returned `A — QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; the
  final independent read-only review returned `PASS` with no actionable finding.
- **Scope/status:** no product/UI, Floor Plan, telemetry, NFT, timestamp,
  schema/journal, Playwright product, Phase 8, dependency, database, workflow,
  or deployment behavior changes. Real exact-head certification, integration,
  and the final CH-0015 closure audit remain pending; no known CH-0015
  product/UI implementation remains.
- **Rollback:** revert the single focused correction commit and rerun the
  production-artifact/truthfulness owners. This intentionally restores both
  known certification blockers and changes no data or external system.

## Production Certification Harness v1 — 2026-08-14

- **Prior classification:** `B — NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`; another
  real candidate cycle remains unauthorized until the bounded qualifier returns
  `A — QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`.
- **Correction:** one versioned platform now owns the 28-contract baseline,
  sealed doctor/state/attempt records, ordered 12-stage lifecycle, deterministic
  archive and recursive verifier closure, safe external Phase 8 and seven-owner
  reporting, final evidence and continuity, resume/invalidation, failure
  taxonomy, 26-case regression matrix, deterministic simulation, and the
  four-result source qualifier.
- **Qualification correction:** an initial provisional A was withdrawn after
  independent review. Real per-stage CLI ownership, raw report interpretation,
  live source/artifact resume checks, state policy, archive/symlink safety,
  canonical browser package commands, real config/list fixtures, and executable
  negative regressions were added before the successful bounded rerun.
- **Required final boundary:** exact identity plus successful Phase 8, 2/2
  runtime smoke with telemetry provenance, every required browser identity and
  project with zero retry/skip/flake, six-point artifact continuity, and
  non-simulation state are mandatory. Archive preflight remains standalone and
  explicitly non-final.
- **Ownership/status:** `ci.production-artifact-contract` owns the change without
  adding a gate. The bounded qualifier returned `A —
  QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; real exact-head build/
  certification, integration, and the final CH-0015 closure audit remain
  pending. No known CH-0015 product/UI implementation is introduced or left by
  this source-platform batch.
- **Scope/rollback:** no product, Floor Plan, telemetry, NFT, timestamp,
  assertion, benchmark, dependency/lockfile, database/migration, application
  data, workflow, or deployment change. Revert the single harness commit and
  rerun the production-artifact/truthfulness checks to restore the prior known
  blocker; no data or external rollback is needed.

## CH-0015I current journal-v2 final-consumer alignment — 2026-08-16

- **Classification:** `FINAL_RUNTIME_EVIDENCE_JOURNAL_SCHEMA_DRIFT /
  CANONICAL_JOURNAL_VERSION_CONSUMER_MISMATCH`. Candidate `73d5c541…`, tree
  `be98410f…`, was stopped by read-only review before resources or substantive
  gates; runtime smoke was never invoked.
- **Correction/policy:** current certification requires state v3, manifest
  v3/validator 3, and strict journal v2 from one canonical contract owner. Raw
  report, timing, runtime envelope, archive, final standalone, and continuity
  bind one nonce/artifact and reject v1, unknown/future, missing/malformed, and
  incomplete versions. Historical v1 remains offline-only and unchanged.
- **Ownership/proof:** existing owner `ci.production-artifact-contract` covers
  the physical positive final path, version-drift negatives, anti-drift guards,
  doctor, simulation tamper cases, historical boundary, and qualification. No
  new required gate is added.
- **Scope/status:** no product/UI, Floor Plan, telemetry, NFT, Playwright
  product spec, benchmark, dependency/lockfile, database/migration, workflow,
  deployment, or external change. Qualification returns
  `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; real certification,
  integration, and final closure audit remain pending.
- **Rollback:** revert the one focused correction commit. This restores the
  known final-consumer blocker and requires no data or external rollback.

## CH-0015I staged archive-preflight verifier — 2026-08-14

- **Classification:** `STAGED_ARCHIVE_PREFLIGHT_VERIFIER_CONTRACT_DEFECT /
  MISSING_STANDALONE_PRE_RUNTIME_VERIFICATION_MODE`. The preserved disposition
  is `STOPPED_NOT_CERTIFIED_NOT_INTEGRATED`: repository preflight required
  excluded Git state, while standalone final verification required runtime
  evidence unavailable at the staged pre-runtime gate.
- **Correction/policy:** add the explicit standalone, non-final
  `verify-archive-preflight` mode under the canonical production-artifact owner.
  It requires manifest v3, journal v1, bound inventory snapshot, external exact
  candidate/source/tree/Build ID/artifact identity, successful semantic build
  ordering, complete artifact rehash, trace/NFT safety, and contained verifier
  closure bound to the staging owner's expected SHA-256. `.git`, source fallback,
  unsafe portable paths, partial evidence, and unknown modes fail closed.
- **Separation/proof:** repository `verify-preflight` remains Git-bound;
  `verify-standalone` remains the sole final extracted-artifact mode and still
  requires complete runtime evidence. A real task-owned staged CLI fixture plus
  deterministic negatives is registered under `ci.production-artifact-contract`.
  Inventory remains 27 gates / 379 sources; no server or database is started.
- **Scope/status:** no runtime reordering, copied Git, archive/scanner/inclusion,
  schema/journal meaning, report path, Phase 8, Floor Plan, telemetry, NFT,
  timestamp, product, dependency, workflow, database, deployment, or external
  control change. Exact-head certification, integration, and the final CH-0015
  closure audit remain pending; no product/UI implementation surface is added.
- **Rollback:** revert the single staged-preflight correction commit and rerun
  production-artifact plus required-test truthfulness. This restores the known
  certification blocker and changes no persisted data or external system.

## CH-0015I external Playwright report destination — 2026-08-14

- **Classification:** `EXTERNAL_PLAYWRIGHT_REPORT_PATH_CONTRACT_DEFECT /
  ABSOLUTE_EXTERNAL_REPORT_PATH_REJECTED`. The exact-head external path was
  safe and correctly supplied, but the Playwright loader rejected it as not
  repository-relative before reporter/server/discovery startup.
- **Correction/policy:** the canonical resolver retains only the approved
  ignored repository-relative production-evidence directory and adds one
  absolute class gated by `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT`. Normalization,
  root/parent realpaths, all registered worktrees, writable-parent, absent JSON
  target, containment, and symlink checks fail closed. No arbitrary absolute
  path or overwrite is authorized, and no machine-local root enters portable
  evidence.
- **Ownership/proof:** `ci.production-artifact-contract` owns the resolver,
  security negatives, anti-drift guards, repository-relative compatibility,
  and a real Playwright config/list run that discovers exactly two specs and
  creates/parses/hashes the report only at a temporary external destination.
  Inventory remains 27 gates / 379 sources.
- **Scope/status:** GitHub stable-checks retains `.local` report ownership; the
  seven named product/required-test configs keep `REQUIRED_TEST_REPORT_PATH`.
  Schema/journal, server, reporter identity, retries, timeouts, product, Floor
  Plan, telemetry, NFT, timestamps, archive/scanner, Phase 8, dependency,
  workflow, database, and external-control behavior are unchanged. No CH-0015
  product/UI implementation surface remains. Exact-head recertification,
  integration, and final closure audit remain pending.
- **Rollback:** revert the single external-report correction commit and rerun
  production-artifact plus required-test truthfulness owners. This restores the
  known release blocker; it changes no persisted data or external system.

## CH-0015I Playwright production-artifact schema v3 — 2026-08-13

- **Classification:** `PRODUCTION_ARTIFACT_SCHEMA_CONSUMER_DRIFT`. The producer
  emitted v3 and runtime smoke passed that manifest to a Playwright config whose
  v2-only check failed before server startup or discovery.
- **Correction/policy:** one shared contract owns v3, validator 3, journal v1,
  and canonical commands. Current exact-head certification requires v3 and
  rejects v2, unknown schemas, and future versions. Historical v2 is not
  reinterpreted or silently admitted to current runtime smoke.
- **Bindings/tests:** the Playwright loader requires the shared canonical journal
  path, invokes the exact canonical validation-only CLI, then binds manifest
  hash/sidecar, candidate, commit/tree, nonce/journal, commands/order, successful
  build/inventory/completion, BUILD_ID, artifact SHA-256, and environment. A real
  configuration-load test proves production server selection and nonzero
  discovery; deterministic negatives and an anti-drift guard remain under
  `ci.production-artifact-contract`.
- **Scope/status:** inventory remains 27 gates / 379 sources. No product,
  Floor Plan, telemetry, NFT, timestamp, archive-root, scanner, Phase 8,
  dependency, database, workflow, or external-control semantics changed. No
  required CH-0015 implementation surface remains. Exact-head certification,
  integration, and the final closure audit remain pending.
- **Rollback:** revert the single Playwright-schema correction commit, then rerun
  production-artifact, required-test truthfulness, runtime configuration, lint,
  typecheck, code-quality, and hygiene owners. This intentionally restores the
  release-blocking v2/v3 mismatch and is emergency rollback only; no data or
  external rollback is involved.

## CH-0015I artifact timestamp provenance correction — 2026-08-13

- **Classification:** `D — CLOCK_SOURCE_OR_TIMESTAMP_CAPTURE_DEFECT`. The
  executing wrapper's UTC event boundaries were correct but ephemeral; a later
  recovery writer reconstructed generated/build fields from one log's
  birthtime/mtime and created contradictory ordering.
- **Correction:** schema v3 adds one atomic v1 semantic event journal owned by
  the executing wrapper. It distinguishes wrapper start from actual build
  dispatch, records child exit and inventory state, and binds nonce,
  commit/tree, hashed worktree identity, process, commands, wrapper hash,
  toolchain, BUILD_ID, and artifact hash. Explicit recovery accepts only that
  same complete run and never falls back to filesystem timestamps.
- **Invariant/status:** generated-source completion remains no later than actual
  build dispatch; build completion precedes inventory, and inventory completion
  precedes manifest creation. The retained ca77 cycle stays invalid and
  untouched. No required CH-0015 implementation surface remains after this
  correction; exact-head certification, integration, and final closure audit
  remain pending.
- **Scope/rollback:** no Floor Plan Upload, telemetry, NFT tracing, archive,
  scanner, Phase 8, workflow, dependency, database, or external-control change.
  Revert the single timestamp-provenance correction commit to restore schema v2
  and remove journal/recovery behavior; then rerun production-artifact and
  required-test truthfulness owners. Do not alter retained historical evidence.

## CH-0015I Floor Plan NFT overtrace correction — 2026-08-13

- **Classification:** `B — NFT_OVERTRACE_PACKAGING_DEFECT`. Three Floor Plan
  route NFTs packaged broad repository source because the asset reader's
  validated `/assets/` boundary was not preserved at the tracer-visible
  filesystem operation.
- **Correction:** the sole preview helper validates/decodes one relative path,
  rejects traversal/absolute/separator/NUL/encoding attacks, proves lexical and
  realpath containment, and reads from a direct static
  `process.cwd()/public/assets` join through a descriptor bound by post-open
  device/inode identity. Final-component symlinks fail closed. No trace
  exclusion or test-name-specific production rule was added.
- **Preliminary trace proof:** 57/57 diagnostic build; 112 NFTs; each target 3,307 -> 374
  references; zero target script/test edges; seven Floor Plan assets per
  target; zero missing/prohibited trace paths; both rejected scripts at zero
  global NFT edges. Plan-only staging has 69,874 files/rows and zero duplicate,
  missing-reason, runtime-closure, scanner, or exception result; it created no
  archive and ran no compression.
  This snapshot predates descriptor hardening; exact committed-head build and
  plan replay are authoritative.
- **Ownership/status:** `ci.floor-plan-required` now owns 56 scripts at closure
  SHA-256 `94276929fd43e144b2f23b037b63e28e15e1d2b385632a40e03b3347f12c465d`;
  the existing production-artifact owner enforces the post-build NFT contract.
  No required CH-0015 implementation surface remains after this bounded child.
  CH-0015 stays `IN_PROGRESS` until exact-head integration review and the final
  exact-source closure audit; this child does not begin that audit.
- **Rollback:** revert only this correction commit, then rerun the focused path
  owner, production-artifact contract, Floor Plan required umbrella, strict
  build/NFT guard, and plan-only constructor. No data, deployment, dependency,
  scanner, archive-policy, or external-control rollback is required.

## CH-0015I inherited runtime-smoke contract correction — 2026-08-12

- **Classification:** `B — TEST_ASSERTION_DEFECT`. The inherited unconditional
  `bootstrapEventsFlushed > 0` check confused records retained during import
  with collector activation and later direct telemetry. The preserved zero
  value plus nonzero timing/lifecycle/renderer evidence is not an event-loss
  proof.
- **Correction:** snapshot v2 records collector import state, one-shot
  activation mode/generation, exact queued-at-activation and flushed totals,
  hydration completion, direct mode, and direct activity. One shared validator
  accepts exact positive hydrated bootstrap or exact zero empty bootstrap with
  later substantive direct activity and rejects contradictory states.
- **Tests/evidence:** deterministic injected import completion owns empty,
  nonempty, loss, failure/no-retry, pending, direct/inactive, cap, fresh realm,
  snapshot stability, and malformed cases. The initial document and three
  reloads carry strict report attachments; production-artifact evidence v2
  binds their derived summary to the existing source/artifact/report identity.
- **Scope/status:** no Floor Plan implementation, domain, GLB renderer,
  cache/refcount, frameloop, timeout, retry, dependency, workflow, database, or
  external setting changes. No required CH-0015 implementation surface remains.
  CH-0015I remains pending separate integrator review and CH-0015 remains
  `IN_PROGRESS` until the final exact-source closure audit.

## CH-0015I Floor Plan Upload accessibility — 2026-08-12

- **Source/scope:** exact integration source
  `2c567fd483877c7dcbd8fd23e3cd8cb316732c8c` / tree
  `50f9c5d6a6610990606fd9db9a27ba40200fca90`; branch
  `fix/ch-0015-floor-plan-upload-accessibility`; parent full-screen workspace,
  semantic opener wiring, shared lifecycle/registry additions, state-focus
  annotations, focused owner, and records only.
- **Disposition:** `REQUIRED IMPLEMENTATION SURFACE LOCALLY RESOLVED`.
  The preserved full-screen shell owns one registered topmost modal,
  background isolation, state-aware focus and containment, semantic return,
  nested-dialog supersession, and token-owned body-scroll locking.
- **Required owner:** new `ci.floor-plan-upload-accessibility` owns ten stable
  identities in Chromium and WebKit; focused result is **10/10 per engine**,
  zero retries/skips/filters/shards/timeout increase. Existing
  `ci.floor-plan-required` remains the domain owner. Derived inventory is
  **27 gates / 377 sources**.
- **Behavior/rollback:** mobile `100dvh`, desktop composition, accepted files,
  image/PDF/page/calibration/review/history/create behavior, Consumer/Pro,
  persistence, APIs, schema, and analytics remain unchanged. Inline history
  confirmation policy is not decided; the parent only blocks bypassing it.
  Empty Surfaces is covered through its exact production action; its current
  integrated `hasRooms`/`!hasRooms` reachability contradiction is recorded and
  deliberately not changed by this accessibility batch.
  Revert the one focused commit and rerun both Floor Plan owners plus affected
  shared-dialog owners; no data or external rollback is required.
- **Queue status:** no required CH-0015 implementation surface remains after
  CH-0015I. CH-0015 itself remains `IN_PROGRESS` until the exact-source closure
  audit passes. Public legacy Upgrade and selected-item Preview remain separate
  P2 work.

## CH-0015H test-contract hardening — 2026-08-12

- **Source/scope:** child of
  `ee55098be7c750e8fa2a631978f3d4ebd956708c`; Pro Visual Palette and Client
  Preview assertions, one test-only recorder, static guard, truthfulness, and
  records only. Production focus, Palette actions, Floor Plan Upload,
  dependencies, Phase 8 thresholds, and workflows are unchanged.
- **Disposition:** `TEST CONTRACT HARDENED; PRODUCT CLASSIFICATION UNCHANGED`.
  Palette owns a production `F0 -> F1 -> F0` exact-once/one-Undo proof and
  Client Preview owns a fixed-capacity A–E semantic invalid-focus proof.
- **Provenance:** original WebKit result remains **D —
  NOT_REPRODUCED_WITH_PROVENANCE**. Original evidence/report hashes are
  `018afa76c7bc69104c879440f6d69801ddef9b238c713509f551f9f1a5095223` /
  `fd35b65201f0583a1b8e86de8df08d3520cf9ab8f833273af4829d61d00b339c`;
  diagnostic focus/report hashes are
  `e997098141ddf0828d69d67a09252cb0b79304a5751231d86e7a3c28ade0d2c5` /
  `e524a7e6cb7601f1858d06ac4dbceab1603689d15e02044f4351735465e5c9d2`.
  No product root cause or remediation is inferred.
- **Queue status:** CH-0015 remains open only for Floor Plan Upload. This child
  changes no production disposition.

## CH-0015H Command Palette accessibility — 2026-08-11

- **Source/scope:** exact integration source
  `5ab9db530d4e4fcc8d1f8f678994e09ab7bb3e67` / tree
  `f646076854c0c76b69c80c9cada996e58d01b1b0`; branch
  `fix/ch-0015-command-palette-accessibility`; only Cmd/Ctrl+K Palette session,
  semantic return, shared modal/visual stack additions, focused owner, and
  records.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015H LOCAL REMEDIATION COMPLETE`.
  One named modal owns input entry, containment, topmost Escape/backdrop,
  background isolation, semantic return, and scope cancellation. Another modal
  blocks opening; a newer direct root receives the next visual layer, while a
  superseded Palette withdraws visually across nested ancestor stacking
  contexts. Actions consume/clear/close before unchanged behavior runs.
- **Required owner:** existing `ci.pro-visual-policy` owns five stable Palette
  identities in Chromium/WebKit; no gate, cadence, project, workflow, retry,
  timeout, or Full E2E ownership changed. Inventory remains 26 gates / 376
  classified sources; design cleanup remains 81 guards. The exactly-once final
  Phase 8 invocation passed its contract characterization and then stopped at
  the benchmark's clean-HEAD precondition, so final-source performance remains
  unverified and must be run by the integrator from the clean commit.
- **Behavior/rollback:** IDs, labels, hints, order, filtering, enabled
  predicates, first-enabled Enter, pointer/domain/history behavior,
  editable suppression, Preview exclusion, and Consumer/Pro capability policy
  remain unchanged. Revert one focused commit and rerun Palette/Pro, affected
  shared-dialog owners, truthfulness, Phase 8, and strict build; no data or
  external rollback.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with exactly one required
  batch: Floor Plan Upload. Public legacy Upgrade and selected-item preview
  remain separate P2 work.

## CH-0015G Retailer Confirmation accessibility — 2026-08-11

- **Source/scope:** exact integration source
  `d76994a778db99cb57834ef6bb62db5e8705a478` / tree
  `ba00cb930778c84a4879d70274182868eb9c428f`; bounded branch
  `fix/ch-0015-retailer-confirmation-accessibility`; exactly the global and
  retailer-group four-plus-tab confirmation, its typed session/semantic IDs,
  local direct `EditorDialog` composition, focused gate, and records.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015G LOCAL REMEDIATION COMPLETE`.
  One named full-viewport modal owns close focus, containment, topmost generic
  dismissal, background isolation, and current semantic return. One typed
  generation captures lines/count/preference/opener/scope and consumes exactly
  once; cancel, scope, unmount, and supersession cannot continue stale work.
- **Required owner:** new `ci.retailer-confirmation-accessibility` owns 12
  stable cases after its static prerequisite. Canonical result: Chromium 12/12
  + WebKit 12/12, zero retries/skips/filters/shards/timeout change; derived
  inventory is 26 gates / 376 classified sources and design cleanup has 81
  guards.
- **Behavior/rollback:** the zero/one/three/four count boundary, bundles,
  duplicates, unavailable/missing URL behavior, row bypass, affiliate
  tracking/fail-open/UTM/pacing/same-tab, Guest/Consumer/Pro, and Shopify remain
  unchanged. Revert one focused commit and rerun Retailer/Cart/Guest, commerce,
  truthfulness, Phase 8, and strict build; no data or external rollback.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with exactly two required
  batches: Command Palette and Floor Plan Upload. Public legacy Upgrade and
  selected-item preview remain separate P2 work.

## CH-0015F Guest Save Prompt accessibility — 2026-08-10

- **Source/scope:** exact integration source
  `d649708ba31eb9d8ede183dea6d6268c9dd1aca3` / tree
  `a34e6a5831c0e7b40649895a7cc3e3f18b07fec4`; bounded branch
  `fix/ch-0015-guest-save-prompt-accessibility`; exactly Save, AI layout,
  checkout, their typed continuation controller and semantic IDs, one shared
  dialog extension for visible initial focus, focused gates, and records.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015F LOCAL REMEDIATION COMPLETE`.
  `save | ai-layout | checkout` remains typed through rendering. One scoped,
  generation-bound callback is consumed before execution or cancellation.
  `EditorDialog` owns name/modal state, close focus, containment, topmost
  Escape/backdrop, background isolation, and reason-specific return.
- **Required owner:** new `ci.guest-save-overlay-accessibility` owns eight
  stable scenarios after its static prerequisite and strict build. Canonical
  result: Chromium 8/8 + WebKit 8/8, zero retry/skip/flake/filter/shard; derived
  inventory is 25 gates / 376 classified sources.
- **Behavior/rollback:** explicit Not now alone executes the continuation once;
  Escape/backdrop/close execute none. Guest claim/sign-in, no-op AI guest
  behavior, checkout eligibility/payload/navigation, auth/quota policy, and
  unrelated overlays stay unchanged. Revert the one focused commit and rerun
  Guest Save static/browser, Save/AI/checkout guards, Phase 8, and strict build;
  no data or external rollback is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with exactly three required
  batches: Command Palette, Floor Plan Upload, and retailer confirmation.
  Public legacy Upgrade and selected-item preview are separate P2 work.

## CH-0015E Share Link Fallback accessibility — 2026-08-10

- **Source/scope:** exact integration source
  `d16109b95cc57774bf384b580f4bf669026bdf59` / tree
  `4dd30065236e651f552944c5077cef1be62c1a1f`; bounded branch
  `fix/ch-0015-share-link-fallback-accessibility`; nested fallback, parent
  dismissal guard, semantic Create Share/parent-close hierarchy,
  design/mode/unmount scope adapter, existing Pro/static owners, and records
  only.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015E LOCAL REMEDIATION COMPLETE`.
  Missing, permission-denied, or rejected clipboard writes now open one named
  registered child. It conceals/inerts the mounted Present/Export parent, owns
  focus, Tab/Shift+Tab, Escape, and backdrop, then returns to the current Create
  Share action and resumes the same parent. Supersession and scope changes
  cannot restore stale focus.
- **Required owner:** existing `ci.pro-visual-policy` owns three new stable
  identities. Canonical result: Chromium 13/13 + WebKit 13/13, zero
  retry/skip/flake/filter/shard/timeout change; inventory remains 24 gates / 376
  classified sources.
- **Behavior/rollback:** share API/token/URL, clipboard success/failure and
  Copy/Open behavior, analytics meaning, authorization/public projection,
  Consumer/Pro policy, and unrelated overlays are unchanged. Revert one
  focused commit and rerun the Share static guard, Pro owner, Phase 8, and
  strict build; no data or external rollback is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with four required batches:
  Guest Save, Command Palette, Floor Plan Upload, and retailer confirmation.
  Public legacy Upgrade is P2 post-candidate and is not in this count.

## CH-0015D My Designs dialog accessibility — 2026-08-09

- **Source/scope:** exact integration source
  `00628978e1eeb38d89370f84e537fc971de538e4` / tree
  `ef0c3bc8ac72276eaade6d3ea19f6710c8ffca7a`; bounded branch
  `fix/ch-0015-my-designs-dialog-accessibility`; My Designs parent, semantic
  command/design/bulk identities, its existing nested Confirm return wiring,
  retained first-use lazy boundary, focused gate, and records only.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015D LOCAL REMEDIATION COMPLETE`.
  My Designs is a labelled modal with intentional close focus, containment,
  topmost Escape/backdrop, background inertness, semantic command/More return,
  and route/unmount/reopen generation safety. Confirm conceals the mounted
  parent; cancel/failure returns to the current delete action and successful
  mutation resolves a current surviving row or close without focusing a
  deleted node.
- **Required owner:** the static guard remains in `ci.design-cleanup` and runs
  as the fail-closed prerequisite for new browser owner
  `ci.my-designs-overlay-accessibility`, which owns eight stable identities.
  Canonical strict-artifact
  result: Chromium 8/8 + WebKit 8/8, zero retry/skip/flake; derived inventory
  is 24 gates / 376 classified sources.
- **Behavior/rollback:** persistence, cloud/local identity, requested-design
  routing/supersession, list selection/order, single/bulk/current-design delete,
  authorization, API/schema, Consumer/Pro policy, and other overlays are
  unchanged. Revert the one focused commit and rerun My Designs required,
  persistence/routing, Phase 8, and strict build; no data or external rollback
  is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with six required batches:
  Guest Save, Command Palette, Floor Plan Upload, retailer confirmation, Share
  Link Fallback, and public legacy Upgrade. The last two remain required; the
  selected-item preview transition remains separate P2 work.

## CH-0015C Plans dialog accessibility — 2026-08-09

- **Source/scope:** exact integration source
  `683a91c12e3ac5b690375925ad93f84bec2c443f` / tree
  `9a06040b0a803156ae5402e1bc3da79ca70ab82f`; bounded branch
  `fix/ch-0015-plans-dialog-accessibility`; Plans, direct Account semantic
  opener wiring, nested Upgrade opener identity, narrow shared-lifecycle
  support, existing required/static owners, and documentation only.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015C LOCAL REMEDIATION COMPLETE`.
  Plans is a labelled modal with intentional focus, deterministic containment,
  topmost Escape/backdrop ownership, background inertness, semantic Account or
  Upgrade return, supersession/unmount cancellation, and a 16px gutter at
  390×844. Upgrade stays mounted but inert/hidden while Plans is topmost and
  resumes ownership after Plans alone closes.
- **Required owner:** existing `ci.pro-visual-policy` owns five new stable
  identities in Chromium and WebKit. Canonical result: 20/20, zero
  retry/skip/flake. Inventory remains 23 gates / 376 classified sources; the
  existing Stripe/Pro and editor-accessibility commands retain static billing
  and lifecycle ownership.
- **Behavior/rollback:** pricing, eligibility, Consumer/Free/Pro capability,
  checkout/portal/Stripe routing, subscription/entitlement state, analytics,
  and all other overlays are unchanged. Revert the one focused commit and
  rerun Pro visual, Stripe/Pro, editor accessibility, Phase 8, and strict build;
  no data or external rollback is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS` with seven required batches:
  My Designs, Guest Save, Command Palette, Floor Plan Upload, retailer
  confirmation, Share Link Fallback, and public legacy Upgrade. The last two
  are required rather than P2-deferred. The selected-item preview transition
  remains a separate P2 item.

## CH-0015B Client Preview command-bar accessibility — 2026-08-08

- **Source/scope:** exact integration source
  `f8c44bcd632820754edc4f862eef24c66e433510` / tree
  `ae067068656c46ac9aecb174b02a01ea21b6bdf4`; bounded branch
  `fix/ch-0015-client-preview-command-bar-inertness`; the one persistent
  command-bar root, existing Exit Presentation action, shared preview setter,
  focused Pro visual/static coverage, and documentation only.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015B LOCAL REMEDIATION COMPLETE`.
  Active preview now makes the mounted command bar inert,
  accessibility-hidden, pointer-inactive, and action-routing-inactive. Entry
  focuses visible Exit once per generation when command-bar focus becomes
  unavailable, while a valid outside focus owner remains; ordinary exit resolves
  the current semantic opener or More fallback; scope change/unmount cancels
  stale work. The command bar remains a persistent panel and no modal primitive
  is added.
- **Required owner:** existing merge-required `ci.pro-visual-policy` now owns
  five stable identities in Chromium and WebKit, 10 records total. The focused
  CH-0015B subset passes 6/6. Inventory stays 23 gates / 376 sources; no new
  gate or runnable source exists.
- **Behavior/rollback:** Consumer denial, Pro capability, export behavior,
  public sharing, selected-item state, and styling remain unchanged. Revert the
  single focused implementation commit and rerun the Pro gate, design cleanup,
  Phase 8, and strict build; no data or external rollback is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS`. The selected-item-panel P2
  preview transition is separately owned, and the CH-0015A inventory still
  lists custom overlay lifecycles for later bounded batches.

## CH-0015A Selection Tray accessibility — 2026-08-08

- **Source/scope:** exact integration source
  `00c93f510f24c6f759a6d16b839dadbe253920f8` / tree
  `5ad9392dffa8cad88871e898713fcead8e5656c1`; bounded branch
  `fix/ch-0015-cart-overlay-accessibility`; Selection Tray plus the existing
  shared dialog lifecycle only.
- **Disposition:** `PARTIALLY RESOLVED — CH-0015A LOCAL REMEDIATION COMPLETE`.
  Closed tray content is absent from DOM/accessibility/focus/pointer ownership;
  the open tray has one modal owner with deterministic focus and dismissal,
  including focus transfer before Clear, Remove, or decrement-to-zero unmounts
  the active row/footer control. The entry-focus follow-up additionally defers
  close-button focus through `mounting → entering → interactive` until motion
  is settled and the full target rectangle is within the viewport. During the
  first two phases the stable dialog container owns focus and background
  branches are inert and accessibility-hidden; the required responsive
  geometry assertion remains strict.
  The separate shopping cart/checkout panel and every unrelated overlay remain
  unchanged.
- **Required owner:** new merge-required `ci.cart-overlay-accessibility` runs
  eight stable identities in Chromium and WebKit outside Full E2E discovery.
  Inventory is 23 gates / 376 classified sources.
- **Behavior/rollback:** product/variant identity, quantity, removal, add-all,
  pricing, totals, Shopify/affiliate, checkout, and authorization contracts are
  unchanged. Revert the single focused implementation commit; no data or
  external rollback is required.
- **Queue status:** CH-0015 remains `IN_PROGRESS` rather than `RESOLVED` because
  the architecture inventory still identifies major custom overlay lifecycles.
  Select exactly one later overlay batch after separate review; do not bulk
  migrate or infer modal intent.

## CH-0013 canonical surface-material required owner — 2026-08-07

- **Source/scope:** exact integration source
  `8f05b0fedc3de9d92b9815cbde3092568fd7507f` / tree
  `748a0502b666c636720aafe552e016bb6756de2c`; bounded branch
  `fix/ch-0013-surface-material-required-owner`; test governance only.
- **Disposition:** `RESOLVED — LOCAL PRE-CANDIDATE REMEDIATION COMPLETE`.
  Existing merge-required `ci.catalog-materials` now singly owns the schema,
  browser-helper, and focused runtime/lazy-bundle suite. The existing
  production-artifact owner retains the one generator-drift execution before
  build, so the new closure does not duplicate it or full Phase 8.
- **Ownership evidence:** 22 gates / 376 classified sources; 12-script catalog
  closure SHA-256
  `7ea65dfdc5ea31aac049836764123a9bc5a2e80b3af30c36bb42c34d8755b5e0`;
  15 named semantic contributions; stable checks invoke the command after the
  strict build and continue to feed `merge-gate`.
- **Behavior/rollback:** no product code, material ID, generated output,
  catalog boundary, dependency, budget, schema, migration, or external setting
  changed. Revert the single implementation commit; do not edit generated
  files separately.
- **Superseding counts:** **0 unresolved P0 / 10 unresolved P1 / 8 resolved
  P1**. READY is now CH-0015; seven product-decision and two dependency-blocked
  P1s remain.
- **Exactly one next action:** obtain separate integrator review and
  authorization for CH-0013. After that review, CH-0015 is the next bounded
  decision-free pre-candidate P1. Do not begin it in this branch.

## CH-0004 trusted event provenance closure — 2026-08-07

- **Source/scope:** exact integration source
  `2e1df7ed7cefb5df2560fca70f77ef8785f37c8f` / tree
  `394d4444d46ca8c1ce95ae3f0113197c015fd813`; bounded branch
  `fix/ch-0004-trusted-event-provenance`; no integration-branch mutation, push,
  deployment, external control, Full E2E, CH-0013, or CH-0015 work.
- **Disposition:** `RESOLVED — LOCAL PRE-CANDIDATE REMEDIATION COMPLETE`.
  Browser analytics, trusted Stripe lifecycle, internal diagnostics, and
  untrusted/legacy records have separate typed/durable contracts. Historical
  records remain preserved and fail closed. Admin lifecycle health requires
  current verified Stripe provenance rather than event name or metadata.
- **Evidence owner:** existing `scripts/test-phase7-security-boundaries.ts`
  remains singly owned by merge-required `ci.critical-domain-contracts` through
  `npm run test:critical-required`; no test source, gate, cadence, retry, skip,
  timeout, workflow, or Full E2E ownership was added.
- **Migration/rollback:** the populated 42-migration predecessor upgraded to 43
  with 3/3 historical lifecycle rows preserved as legacy; trusted/browser/
  legacy fixtures produced exactly one authoritative count, while null-
  provenance, reserved-name, and unknown-name trusted inserts were rejected by
  the database constraint. Rollback is one
  application commit revert; deployed schema rollback is
  a forward correction or database restore, never migration-history rewriting.
- **Superseding counts:** **0 unresolved P0 / 11 unresolved P1 / 7 resolved
  P1**. READY is now CH-0013 and CH-0015; seven product-decision and two
  dependency-blocked P1s remain.
- **Exactly one next action:** obtain separate integrator review and integration
  authorization for CH-0004; the independent implementation review has no
  remaining actionable finding. After integration, the next decision-free pre-candidate P1 is
  CH-0013 (or CH-0015 if the approved sequence changes).

## Integration tracked-artifact hygiene checkpoint — 2026-08-06

- **Scope:** bounded CH-0027 repository hygiene only on
  `fix/integration-tracked-artifact-hygiene`, starting at
  `4634384a819a515137ed0d72b339d13496c7a757` / tree
  `9540ec0b4a0e81f4df1633ad05d1e13cd99672a9`; no P0/P1 remediation, product
  behavior, external control, push, deployment, or Full E2E work was started.
- **Disposition:** remove generated `test-results/.last-run.json` and the
  `UNUSED_OR_OBSOLETE_PLACEHOLDER` `prisma/dev.db`; explicitly retain the
  placeholder-only `.env.staging.template` as deployment-owned source rather
  than ignored local configuration. The final tracked-ignored inventory is
  empty and no mutable local database artifact remains tracked.
- **Recurrence owner:** the existing required `check:code-quality` gate now
  inspects normalized Git-tracked and ignored-but-tracked paths. Nine focused
  scenarios and the required local gates pass, including a 1/1 focused
  Playwright generation check and design cleanup 78/78.
- **Exactly one next action:** use the exact local commit containing this
  checkpoint as the starting SHA when `integration/deep-clean-v1` is later
  created. This remediation does not create that branch and does not change the
  final Deep Clean v1 re-triage below.

## Final Deep Clean v1 re-triage — 2026-08-06

- **Source and status:** exact clean source
  `2328f297e43b77e5a82693b1844bce1fe61512f9`; **0 unresolved P0 / 12
  unresolved P1**; **A. INTEGRATION PLANNING MAY BEGIN**. This is not merge or
  release permission.
- **CH-0019 correction:** `RESOLVED`, not READY. Ancestors `fe668ab`, `6f63c11`,
  `9ba876b`, the architecture/contract chain through `69a7627`, `101f25d`,
  `299536f`, and `55bc4b6` close every original baseline, Pro-visual, and
  Phase 8 failure. Current validation is green for those owners.
- **Current unresolved P1 split:** READY 3 (`CH-0004`, `CH-0013`, `CH-0015`);
  REQUIRES_PRODUCT_DECISION 7 (`CH-0002`, `CH-0003`, `CH-0005`, `CH-0007`,
  `CH-0008`, `CH-0010`, `CH-0011`); BLOCKED_DEPENDENCY 2 (`CH-0006`,
  `CH-0018`); BLOCKED_EXTERNAL_CONTROL 0.
- **Integration sequencing:** no READY P1 is pre-integration required. CH-0004,
  CH-0013, and CH-0015 may be implemented after integration but before release;
  none is accepted risk. CH-0018 remains a data-loss-sensitive release blocker
  until supported predecessors and a populated sanitized upgrade fixture exist.
- **RC47-RC55:** closed under the current semantic owners. Fresh public-share
  required coverage passed 8/8 and required Pro visual passed 4/4. The fresh
  drawer matrix was 17/18 because one Chromium case twice lost an optional
  `Maybe later` locator between `isVisible()` and `click()` before reaching the
  drawer assertions; the corrected RC52 Workspace-unmount case passed in both
  engines. Treat that setup race as P2 pre-release test debt, not a reopened
  archival application invariant, and do not report this audit as fresh 18/18.
- **Exactly one next action:** after the documentation-only audit commit,
  prepare `integration/deep-clean-v1` from that exact commit. Do not create it
  in this audit.

## ARCH-RC52 WebKit Workspace-focus closure — 2026-08-06

- **Outcome:** **A. RC47–RC55 LOCAL DISPOSITION COMPLETE** on
  `fix/arch-rc52-webkit-workspace-focus`, starting exactly at
  `ff5f98db74f44cece2519f0570ee2fdfdbb5b2b1` with application parent
  `7dddf06249b44c3b447a2fdde98b64b3306be003`.
- **Sole archival item closed:** `ARCH-RC52-DRAWER-FOCUS-WEBKIT` is classified
  **F. TEST_ORDERING_OR_ASSERTION_DEFECT**. Both engines run the documented
  Workspace first-item focus frame and make the connected Plan menu item the
  semantic owner. The old test then focused the trigger while the menu remained
  open and asserted that manufactured intermediate state. The corrected test
  asserts Plan while open and the current connected Workspace trigger only
  after Plan closes the menu and unmounts the catalog drawer. No production
  source changed.
- **Trace and result:** the browser-native product-button focus difference is
  confined to pre-drawer pointer behavior. Drawer close, Workspace Plan, and
  final Workspace trigger owners are identical in both engines. Drawer
  generation 4 is invalidated by unmount generation 5, with no later focus
  mutation. Chromium passes 9/9 and WebKit passes 9/9; all 18 cases use zero
  retries and contain no skip or flake.
- **Closed items:** RC47, RC48, RC49/50, RC51, all three RC53 sub-scopes, RC54,
  all four RC55 sub-scopes, and the separate Consumer Undo/Redo touch target
  are green under current ownership. Old archival commits remain evidence only
  and must not be cherry-picked.
- **Queue counts:** this closure adds no P0/P1 item. The superseding final
  re-triage records **0 unresolved P0 and 12 unresolved P1** after resolving
  CH-0019. RC47-RC55 no longer blocks local
  integration planning; immutable-preview review and exact-artifact Gate A3
  certification remain later release-cadence work.
- **Boundaries:** Full E2E was not run. GitHub ruleset enforcement, CH-0030
  larger-runner A/B, and applicable Vercel/OAuth/database/scheduler/release
  controls remain external and unverified. Rollback is one local revert of the
  focused assertion/documentation commit followed by the exact two-engine case
  and full 18-case matrix; there is no data or external rollback.

## Current bounded dependency-security batch

- Branch: `security/dependency-auth-next-compatibility`.
- Exact starting source: `55bc4b65c121c1a6646fd2d8b38bb93f9061c372`.
- Scope: direct-production Next.js/Auth.js advisory remediation only; CH-0004 and every queued finding below remain unchanged.
- Result: minimum same-line/same-channel patches remove all 13 unique direct-package Next/Auth advisory IDs from fresh full and omit-dev audits; critical package nodes fall from 2 to 0. Five unresolved tool-path advisory IDs remain explicitly classified and are not hidden by the lockfile.
- Evidence: `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md` contains the advisory inventory, compatibility matrix, remaining paths, gates, budgets, rollback, and external-verification boundary.

Triage date: 2026-07-31 (Asia/Singapore)

Repository: `/Users/justus/Developer/interior-ai`

Prior CH-0029 branch: `fix/ch-0029-main-thread-starvation`

CH-0017 starting HEAD: `cea0cabe53742da8b47c1e119d889033351a1fdf`

Post-triage documentation checkpoint: `195deacba6e22293b4e887dd4b4bb5203028c0fb`

Current superseding statuses are: CH-0017 **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**; CH-0028 **EXTERNALLY VERIFIED — RESOLVED** at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`; and CH-0029 **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. CH-0029 began from that exact clean CH-0028 source on `fix/ch-0029-main-thread-starvation`; before edits, `lsof` resolved the active Node listener to `/Users/justus/Developer/interior-ai`, matching the canonical checkout. This batch authorizes no push, deployment, external-control change, release promotion, CH-0004 work, or Full E2E.

## Counts and selected action

- Unresolved P0: **0**.
- Unresolved P1: **11**.
- Resolved P1: **7** (`CH-0001`, `CH-0004`, `CH-0012`, `CH-0016`, `CH-0017`, `CH-0019`, `CH-0028`).
- Former P1 findings downgraded with current evidence: **2** (`CH-0009`, `CH-0014`).
- Selected active batch: **CH-0004 locally complete**. Exactly one next action
  is separate review/integration authorization; CH-0013, CH-0015, and CH-0030
  were not started by this batch.

## Classification summary

| Finding | Severity at HEAD | Classification | Queue reason |
| --- | --- | --- | --- |
| CH-0001 | P1, resolved | RESOLVED | Repository-controlled remediation complete at the exact HEAD commit; platform controls remain explicitly unverified. |
| CH-0002 | P1 | REQUIRES_PRODUCT_DECISION | Guest retention, quotas, and legacy-overage behavior determine the safe transaction contract. |
| CH-0003 | P1 | REQUIRES_PRODUCT_DECISION | Per-operation/global budgets and limiter-outage policy are not approved. |
| CH-0004 | P1, resolved | RESOLVED | Browser/trusted/internal/legacy authority is typed and durable; public forgery is denied and authoritative operations require verified Stripe provenance. |
| CH-0005 | P1 | REQUIRES_PRODUCT_DECISION | Publisher-only retirement versus a distinct emergency-withdraw role changes operational authority. |
| CH-0006 | P1 | BLOCKED_DEPENDENCY | Public/unknown consumers of the legacy catalog DTO must be inventoried before narrowing it. |
| CH-0007 | P1 | REQUIRES_PRODUCT_DECISION | Canonical catalog source/precedence and Shopify intent are product/catalog decisions. |
| CH-0008 | P1 | REQUIRES_PRODUCT_DECISION | The owner must classify 73 unspecified entries and choose the controlled status model. |
| CH-0009 | P2 | DOWNGRADED_WITH_EVIDENCE | CH-0001 now makes the bounded route allowlisted-admin-only; mutable request-time package execution remains material debt. |
| CH-0010 | P1 | REQUIRES_PRODUCT_DECISION | Irreversible revocation is fail-safe, but automatic designer sharing changes the user contract. |
| CH-0011 | P1, conditional | REQUIRES_PRODUCT_DECISION | Legal basis, consent, opt-out, masking, and project-side PostHog state require an owner decision and external verification. |
| CH-0012 | P1, resolved | RESOLVED | Supported editable entry points now converge on the canonical persisted-document loader; legacy bookmarks temporarily redirect. |
| CH-0013 | P1, resolved | RESOLVED | Phase 8A/B runtime work is preserved and `ci.catalog-materials` now singly owns the required schema/browser-helper/lazy-boundary suite; generator drift remains required once through production-artifact evidence. |
| CH-0014 | P2 | DOWNGRADED_WITH_EVIDENCE | Source shows per-item ownership, but no measured P1 outage, data loss, or security/privacy consequence is currently demonstrated. |
| CH-0015 | P1 | IN_PROGRESS | CH-0015A fixes Selection Tray, CH-0015B fixes Client Preview command-bar concealment/focus, CH-0015C fixes direct/nested Plans, and CH-0015D fixes My Designs plus its nested delete Confirm. Six required overlay batches and the separate selected-item P2 remain. |
| CH-0016 | P1, resolved | RESOLVED | Strict clean-source build, artifact/trace hashing, production start, and health/report identity now fail closed; CI upload/retention is configured but external execution and platform acceptance remain unverified. |
| CH-0017 | P1, resolved/frozen | RESOLVED | TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN. |
| CH-0018 | P1 | BLOCKED_DEPENDENCY | Supported predecessor versions and a representative sanitized fixture owner are required. |
| CH-0019 | P1 release / P2 code health, resolved | RESOLVED | Every original baseline, architecture, Pro-visual, and Phase 8 failure is closed by current ancestors and green current gates. |
| CH-0028 | P1 release/runtime, resolved | RESOLVED | EXTERNALLY VERIFIED — RESOLVED at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. |
| CH-0029 | P2 performance | OPEN | OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION. A local C/G contention correction is complete; required-only external verification remains required. |

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

- **Current evidence and affected symbols:** `lib/app-event-provenance.ts` owns the exact class unions/parser and current provenance version; `lib/app-events.ts` owns non-authoritative browser/server analytics plus internal diagnostics; `lib/trusted-app-events.ts` is server-only and imported only by the verified Stripe webhook route; `lib/app-event-operations.ts` owns the full trusted admin filter. Billing success uses `checkout_success_viewed`.
- **Reach and impact:** The public route remains reachable but denies all trusted, internal, unknown, and provenance-reserved submissions for anonymous and authenticated/Pro/admin identities. Authentication never promotes authority. Valid browser analytics persist with public/browser/current provenance and remain non-authoritative.
- **Dependencies and tests:** No product decision. Existing Phase 7 required ownership executes the full identity/type ingestion matrix, context/persistence failure, resolved importer graph, mixed-authority admin fixtures, invalid signature, verified retry deduplication, transaction rollback, migration default/constraint, and billing naming. Live disposable-database requests returned one 200 persisted browser record, 400 for every trusted/reserved lifecycle name, spoof, and unknown type, with zero forbidden rows.
- **Scope and rollback:** `RESOLVED — LOCAL PRE-CANDIDATE REMEDIATION COMPLETE`. Revert the one focused application commit if needed; retaining nullable provenance columns is safe. A deployed database uses a forward correction/restore. Never promote historical rows or restore public trusted names.

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

- **Phase 8A status:** `RESOLVED FOR THE CLIENT PAYLOAD BOUNDARY` on 2026-08-04 from exact source `101f25d095c6e205e2d40e1ad843a24210696e40`; the implementation commit is the commit containing this record and is resolved after creation. YAML remains canonical. The deterministic audited generator emits a 980-record compact render projection, a same-order/same-ID 980-record lazy catalog projection, and one test-only fixture in a test-only module. Named generate, drift, and schema commands are present. No workflow was modified in this bounded batch.
- **Verified runtime boundary:** The synchronous keyed render facade retains every field consumed by selected-material hydration, application, texture/UV behavior, 2D/3D rendering, inspector identity, and export counting. Full descriptive, compatibility, sample, and browser commerce metadata plus the 2,484-row Nippon paint catalog load together through the only approved dynamic-import owner after an explicit surface-workspace open. One promise caches success or rejection; failure leaves the design/render registry intact and requires explicit retry. Server BOM/share/export continues to use validated `catalog-registry` YAML records, so price/source/product semantics are unchanged rather than routed through client lazy state.
- **Measured result:** Exact clean strict builds changed `/design` initial JS from 7,103,302 raw / 1,169,257 Brotli to 5,790,970 / 1,104,573, with 26 initial chunks before and after. Both unchanged JavaScript limits pass. Full catalog and Nippon semantic markers plus a distinctive source URL occur only in lazy chunks; a real production render identity remains initial; no fixture marker or equivalent eager metadata copy exists. CSS is unchanged at 143,779 raw, so the full Phase 8 command remains red only on its separate 140,000-byte CSS limit.
- **Validation and remaining scope:** Generator drift/schema, texture/pattern and 2D/3D parity, persistence/save/reload, BOM/export, browser/search helpers, strict catalog audit, asset availability, 21-gate truthfulness, 78/78 design cleanup, Pro visual policy 4/4, zero-warning lint, typecheck, code quality, semantic chunk guard, and the strict 57-page build pass. The field matrix and inventories are in `docs/architecture/surface-material-runtime-boundary.md` and `docs/architecture/phase8-performance-baseline-and-budgets.md`. The next bounded performance batch is Phase 8B CSS; no CSS, budget, workflow, CH-0004, or CH-0017-through-CH-0030 behavior changed. Rollback is the one focused implementation commit.
- **Phase 8B CSS status:** `RESOLVED` on 2026-08-04 from exact source `299536fee37fe68b3fde38c02984f5aba21a6231`; the implementation commit is the one containing this record and is resolved after creation. The prior broad Tailwind scan made 53 admin-only, 20 GLB-optimizer-only, and 98 already-lazy Cabinetry Studio utilities part of `/design` initial CSS. Those exact, pairwise-disjoint candidate sets now load from their route or dynamic feature owners. Ten utilities used by multiple excluded owners remain once in the root sheet. The semantic guard recomputes the complete ownership union with Tailwind, rejects candidate drift/overlap/omission, proves compiled membership, and does not bind hashes. Scoped Tailwind property registrations are removed only after the guard proves identical root registrations and route load ordering, leaving no initial/lazy CSS duplication.
- **Phase 8B measured result and validation:** Clean strict builds changed one `/design` initial CSS chunk from 143,779 raw / 18,417 Brotli to 129,803 / 17,182, passing the unchanged 140,000 / 18,000 ceilings with 10,197 raw / 818 Brotli headroom. Initial JS remains 26 chunks and passes at 5,791,004 raw / 1,104,582 Brotli; Cabinetry Studio and GLTFExporter lazy JS are byte-identical. Manual production open/close/reopen proved the Studio stylesheet absent initially, present before interactivity, exclusive and shared computed geometry applied, and exactly two unique stylesheet URLs after reopen. The complete Phase 8 gate, full Cabinetry verification, all 78 design cleanup guards, editor accessibility, Chromium/WebKit Pro policy 4/4, truthfulness, artifact evidence, lint, typecheck, code quality, and strict build pass. Full E2E was not run. No CH-0004 or CH-0017-through-CH-0030 behavior, dependency, workflow, schema, migration, push, or deployment is included. Exact inventories and the ownership matrix are in the Phase 8 architecture documents; rollback is one focused local revert.

### CH-0014 — per-item 3D ownership

- **Current evidence and affected symbols:** `components/scene/FurnitureItem.tsx` registers per-item key listeners and `useFrame`; `components/scene/GLBScaledModel.tsx` creates loaders/decoders, loads, clones, and disposes per instance. Current evidence does not include the required 10/100/500-item regression measurements or a demonstrated customer outage.
- **Reach and impact:** The 3D editor is production reachable. The concern is cumulative CPU/memory/event/resource reliability; no direct security/privacy or persistence-corruption effect is proven, and core impact remains a scale hypothesis rather than a measured P1 failure.
- **Dependencies and tests:** No product decision. First establish same-URL load counts, listener counts, idle frames/CPU, heap/resource proxies, retry/error, clone isolation, and disposal at 10/100/500 items.
- **Scope and rollback:** Introduce a resource repository and central keyboard owner one asset/caller at a time behind existing render props. Roll back by asset class with the old adapter retained briefly. Classification is `DOWNGRADED_WITH_EVIDENCE` to P2 pending measurements.

### CH-0015 — inaccessible drawer/overlay ownership

- **Current evidence and affected symbols:** CH-0015A migrates `components/ItemCartDrawer.tsx` to `components/editor/design-system/EditorDialog.tsx`; closed Selection Tray content is now unmounted and the shared lifecycle owns semantics, topmost focus, dismissal, semantic return, and cancellation. CH-0015B keeps `EditorCommandBar` classified as a persistent panel while adding inert/accessibility concealment and generation-scoped focus entry/return. CH-0015C migrates direct/nested Plans. CH-0015D migrates My Designs and gives its existing nested delete Confirm current semantic deletion/survivor return while the parent is inert/hidden. The selected-item P2 and six required overlay batches remain open.
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

- **Status:** `TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN`. CH-0028 and CH-0029 do not modify this evidence model or workflow contract.
- **Verified root cause:** `05-buy.spec.ts` and `07-kelsey-variants.spec.ts` turned absent prerequisites into expected Playwright passes; the cabinetry GLB export check swallowed a missing `FileReader` and exited zero; live progress was omitted from the required floor-plan chain; critical domain suites lacked a required CI owner; the full-E2E job was advisory without a distinct release contract; Gate A3 trusted aggregate counts/URL without child status, file/project scope, stable identities, freshness, or artifact-bound evidence; cabinetry used a minimum count; CH-0016 runtime smoke trusted aggregates rather than its two requirement identities.
- **Implemented contract:** The canonical manifest classifies all 248 script tests, 98 Playwright specs, 14 imported cabinetry/multi-room browser modules, and 8 imported cabinetry script-test modules by cadence and locks their path inventories, split-suite registrations, and recursively reachable package-command closures. Every required entry names its invariant, command, sources/identities, projects, skip/retry policy, report type, artifact policy, and enforcement point. Required Playwright evidence is process-bound and rejects focus/filter/shard, zero/missing/moved/excluded scope, skipped/retried/flaky/annotated/not-run/failed cases, aggregate disagreement, malformed/stale/tampered output, dirty release source, wrong source/artifact/deployment, machine-local paths, and secret-bearing fields. The six named commerce/Kelsey requirements now fail missing prerequisites and are locked in Gate A3; the GLB export assertion executes under a deterministic Node `FileReader` shim; live progress is required; critical domains are in stable CI; advisory full E2E and release Gate A3 are unambiguous. CH-0016 locks two stable runtime identities. Cabinetry owns all 23 registered browser identities and consumes the wrapper envelope/report bound to the top-level release-candidate artifact.
- **Exact-head 701aaa follow-up:** Run `30684560486` proved the semantic lifecycle fix but exposed a separate whole-test timeout after readiness, an invalid advisory OAuth placeholder, all-or-nothing optional diagnostic retention, and runner-prefixed Gitleaks SARIF layout. One 14-phase table now derives a 660-second whole-test budget (585-second maximum sequential phase sum plus 75 seconds named overhead) and produces a closed-schema, non-overlapping, whole-envelope-contained portable timing record. One script-only JSON fixture supplies structurally valid non-secret CI OAuth values through exactly three guarded, single-line `GITHUB_ENV` assignments after proving the runner file is outside the checkout; the following step validates propagation without logging values or paths. Canonical environment classification refuses implicit, invalid, or production use, and structured `/api/auth/session` is preflighted before browser installation. Advisory mandatory envelope/report JSON binds the registered command, exact checkout, project, bounded process exit, fresh timing, report hash, full diagnostics/conclusion, and explicit null release identity; unsafe optional content or filenames are omitted with safe hashed metadata, while `.last-run.json` is hash-recorded as redundant rerun state and excluded. Gitleaks scanning is unchanged; its deterministic two-file artifact records verified checkout `testedSourceSha` separately from workflow-context `workflowContextSha`. Advisory no longer waits for stable checks because it shares no artifact/output/database/environment and remains excluded from merge aggregation.
- **Outcome-D evidence and remediation:** Exact-head GitHub run `30658564565` attempts 1 and 2 passed secret scan, 42 migrations, truthfulness/evidence contracts, and strict build, then failed only the furnished-template runtime identity at the same implicit five-second diagnostics poll. The fixture is browser-local and its GLB load/normalization/bounds diagnostics are client-computed; no database/API/worker/scheduler producer is missing. This is a test synchronization defect. The runtime now exposes `loading`/`ready`/terminal-`error`, and required smoke waits on that semantic state with bounded safe diagnostics while retaining the original behavioral assertions. Local CI-shaped production smoke passed both stable identities with process exit 0 and 0/0/0 failed/flaky/skipped.
- **Outcome-C evidence and remediation:** Exact-head run `30707099465` at `8cb7cae37d6bb49cd66d61f5523927dc7b64283d` exhausted the explicit 20-second `bounds-verification` budget after semantic readiness, and later runner step metadata exposed the names and unmasked values of the synthetic OAuth pair and active marker. No values are retained here; they were synthetic, unrelated to repository/organization secrets, and externally inert. Three clean CI-like local runs measured the unchanged bounds completion at 7,476/7,108/7,253 ms with `stable` lifecycle and complete-test bodies at 119,946/123,137/119,869 ms. The bounded 45-second phase ceiling leaves at least 37,524 ms local headroom and changes the mechanically derived envelope from 660 to 685 seconds (610 seconds sequential plus the unchanged 75 seconds named overhead). The exporter now generates a nonce-bound pair only in memory, registers each exact generated value with `add-mask` before the single guarded `GITHUB_ENV` write, and retains structural validation, the advisory JSON preflight, production exclusion, zero retry/skip, all assertions, and terminal fail-fast.
- **Required/advisory execution policy:** Before the workflow-only follow-up, every ordinary PR synchronize launched the complete advisory E2E job inside the required workflow even though merge aggregation did not need it. Required CI now retains secret scan, the complete stable lane, lightweight live-auth and advisory evidence contracts, production smoke/evidence/standalone verification, and merge aggregation. Full `npm run test:e2e:advisory` moved unchanged to an explicitly owned workflow triggered only by exact-SHA manual dispatch, PR label `run-full-e2e`, or nightly staging. Exact checkout verification precedes execution; separate advisory concurrency cannot cancel required CI; failures/cancellation and safe artifacts remain truthful. The 21 gate identities and every required cadence remain unchanged; the classified-source inventory advanced from 365 to 368 only for CH-0029's three risk-triggered focused scripts.
- **Exact-head d295 phase-contract follow-up:** The failure artifact recorded reload-1 at 70,001/70,000 ms after remount but did not retain enough reload state or checkpoint evidence to claim continued final-window progress, near-readiness, or a hidden terminal condition. Audit found 311,000 ms of configured finite sequential waits plus unbounded browser evaluations inside each 70,000 ms reload parent. The local GLBs are repository-owned production assets, and no authoritative 70-second product requirement exists. Classification is **A — CH-0017 phase-budget defect**. One canonical object now derives all 14 phase budgets. Pre-push reconciliation rejected the first 236,000 ms claim because hydration/final diagnostic reads were still unbounded and settling counted samples rather than elapsed wall time; no push occurred. The corrected shared reload contract is 246,000 ms of named bounded operations plus 30,000 ms orchestration margin, separates a non-failing 70,000 ms performance observation threshold, emits safe progress checkpoints, and enforces terminal-error and 75,000 ms no-progress fail-fast. Three exact-corrected-tree isolated-database CI-like runs passed 2/2; bounds used 7,253–7,365/71,000 ms, remount 11,908–12,330/165,000 ms, and reloads 21,746–25,016/276,000 ms, all without warnings, retries, skips, or removed assertions.
- **Exact-head 7a58 nested-timeout provenance follow-up:** External execution proved that a nested `diagnostics-settle` expiry was constructed as a phase timeout and then flattened to parent outcome `timed-out`, losing the child identity. The version-3 closed failure contract now distinguishes phase, nested-operation, no-progress, terminal, assertion, and unexpected failures; a nested expiry retains operation identity/budget and makes the parent `failed`, while a genuine phase expiry has no fabricated child. The settle envelope is derived from three bounded 10-second evaluations, two 500 ms intervals, 1,000 ms assertion allowance, and 10,000 ms orchestration margin: 42,000 ms total, yielding 103,000 ms bounds, 308,000 ms reloads, and a 2,190,000 ms whole-test budget. Stable failure diagnostics are uploaded only after semantic report/timing verification; ambiguous or contradictory evidence is withheld. Three final-code isolated-database executions passed 2/2 with complete failure-free timing. No product, ruleset, required-check, trigger, PR, deployment, migration, dependency, or CH-0004 change is included.
- **Exact-head bc26 canonical-operation follow-up:** Run evidence showed `model-responses-and-readiness` begin with its registered 70,000 ms budget, then pass about 65,507 ms remaining to a diagnostic read. The old raw-number API restarted timing at that read and serialized 65,507 as `operationBudgetMs`; schema v3 correctly rejected the noncanonical record and therefore withheld even the safe failure archive. The local producer now resolves a branded immutable deadline from the registered phase contract, measures elapsed time from that deadline's start, and records the decreasing per-call value only as `attemptTimeoutMs`/`remainingAtAttemptStartMs`. A deterministic forced reload-1 failure proves canonical 70,000 ms operation and 308,000 ms failed parent provenance, exact three-file safe diagnostics, and withheld stable evidence. All timeout values, retries, skips, assertions, ruleset state, and CH-0004 scope remain unchanged.
- **CH-0028 boundary-provenance follow-up:** Source `fb0e06ee9de1d2fa5126acadd0e1d8073f9adebc` produced process exit 1 with the correct 70,000 ms operation contract and 65,458 ms attempt allowance, but serialized 69,999 ms elapsed because the host timer and integer `Date.now()` evidence decision had separate clock semantics. Schema v3 rejected the early canonical claim, preventing the safe failure package. The CH-0017 producer now owns start, deadline, remaining allowance, attempt conversion, and deadline decision in one high-resolution monotonic context. It records precise plus integer elapsed values and `deadlineReached`, waits through the residual display boundary, classifies materially early capped attempts separately, and still rejects genuinely premature evidence. No CH-0028 file or canonical timeout value changed.
- **Ownership and portability:** Aggregator specs own execution; each registered imported module must contribute report records in every required project before attribution to exactly one owner. Missing/reclassified modules and owner-only false coverage fail, while helpers remain non-runnable. Advisory upload preparation atomically publishes only strict UTF-8 text with portable path placeholders and a complete included/omitted inventory; binary/archive content is omitted, generic/shaped secrets are rejected, and failure removes the upload directory. Required stable evidence remains unavailable after smoke failure by design.
- **Coverage and compatibility:** The temporary-fixture negative suite and real CH-0016/cabinetry integrations cover the contract, module attribution, unsafe-path/credential/binary cases, and atomic upload failure. Test expectations and the cabinetry release-evidence contract schema were strengthened only to replace false passes. No product/data behavior, threshold, dependency, framework, product/database/persisted-data schema, migration, catalog, deployment, or external setting changed. Honest existing failures are not reclassified. Ruleset `staging-light-protection` (`13671593`) still requires no status check; no ruleset mutation is part of this batch.
- **Scope and rollback:** Revert the workflow-only separation first, then `53a0c98bab4d5a211c93fd1f4f5057806e074bbd`, `8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, the prior CH-0017 follow-ups, and `c840c06dc2c5e67f463542292bb7391b0f93d731`. This restores automatic two-hour advisory execution and then the demonstrated undersized/unmasked and earlier false-pass paths, so it is emergency-only. Ignored evidence is regenerated; ruleset `13671593` remains unchanged and separately administrator-owned.

### CH-0018 — fresh-only migration validation

- **Current evidence and affected symbols:** `scripts/provision-gate-a3-database.mjs` runs `prisma migrate deploy` on the configured gate database and counts completed rows; it does not run a populated supported-predecessor upgrade or schema diff. `prisma/migrations/20260211150315_add_user_to_design/migration.sql` contains a nonempty-design failure path later compensated by another migration. `lib/phase15-release-evidence.ts` accepts a nonblank migration version, and release docs still mention 38 while 42 directories exist.
- **Reach and impact:** Deployment/migration tooling reaches production data during release. The concrete high-impact risk is upgrade failure or data loss despite a green blank install; core availability and persisted designs are affected.
- **Dependencies and tests:** Release/DB owners must select supported predecessors and own representative sanitized fixtures. Required tests: blank deploy, populated predecessor upgrade, Prisma/schema diff, ordered digest, and row/invariant hashes.
- **Scope and rollback:** Add evidence/digest gates before any migration rewrite; repair history only through a separately designed forward migration. Rollback is restore/recovery against the verified target, never destructive reset or casual historical edit.

### CH-0019 — red baseline and masked assertions

- **Current status:** `RESOLVED`. The original failures described by this heading
  are historical and no longer reproduce at the final audited source.
- **Current evidence:** Hook diagnostics, save status, Hamilton vocabulary,
  design architecture, Pro visual policy, and Phase 8 are each closed by their
  bounded ancestor commits. Full zero-warning lint, cleanup 78/78, code quality,
  Pro visual 4/4, Phase 8, and the 57-page strict build pass.
- **Scope and rollback:** Preserve the existing independent rollback boundaries;
  do not combine or replay their patches. A future regression requires a new
  concrete failing owner rather than reopening this historical umbrella.

### CH-0028 — first-reload model readiness convergence

- **Superseding status:** `EXTERNALLY VERIFIED — RESOLVED` at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. The historical local evidence below records how the correction was derived; its pending-verification language is superseded by this status. Required-only run `30780102332` reached reload-1 `models-ready` at approximately 9.268 seconds with 8 ready / 0 loading / 0 error and six responses, then made no progress for the unchanged 75-second watchdog interval before any final snapshot request. A controlled hard-bound reproduction reached a coherent immediate snapshot, invoked the separate body-state browser call, observed no callback entry, and failed at its unchanged 5,000 ms canonical deadline. The cause was exactly **C — browser main-thread starvation** under the then-current A–F taxonomy.
- **Minimal post-readiness correction:** The unchanged body-text condition is now read in the atomic callback that already proves readiness and asserted afterward by the existing hard-bounded host operation. This removes a second browser-admission dependency without skipping the assertion. Immediate evidence and started/completed checkpoints identify response, generation, active-key, body-state, settle, observation, and required-snapshot boundaries; the final snapshot remains mandatory. Relative host/browser timing separates callback admission, sub-millisecond body computation/serialization, host receipt, and assertion completion. The scheduling condition remains CH-0029 rather than a timeout or cache-policy change.
- **Final local proof:** Three separate 42-migration databases passed focused production smoke 2/2. Reload totals were 20,279/21,685/20,240 ms; 20,585/19,484/19,880 ms; and 22,201/27,956/28,707 ms. All nine reloads proved 8 ready / 0 loading / 0 error, response totals 6/9/12, complete immediate and final snapshots, registry 8, parsed 8 entries / 13 references, prepared 12 entries / 7 references, and five bounded zero-reference prepared variants.
- **Authoritative follow-up evidence:** Required-only run `30752899319` at source `c0ccd0d5f4c4d20b058712e4c6e20c3146f02068` reached 8 ready / 0 loading / 0 error, six cumulative fixture responses, exact Dawson/Jaron/Auburn identity success, stable active keys and registry equality, and current-generation readiness. Semantic readiness used 13,533 ms, bounds 40,109 ms, remount 58,849 ms, reload 1 119,031 ms, models-ready approximately 71,352 ms from reload start, and bounds-settled approximately 109,629 ms. The final required snapshot alone exceeded its unchanged 5,000 ms operation budget. Safe artifact `8835124580` retained the failure but, by itself, could not distinguish callback scheduling from computation or serialization.
- **Earlier snapshot cause proof:** Under the earlier follow-up taxonomy, the external run's diagnostic callbacks were delayed: models-ready occurred around 71.3 seconds, the next sample around 98.5 seconds, and bounds-settled around 109.6 seconds. The replacement records host request, callback entry, computation start/end, explicit JSON serialization completion, and host receipt independently; failure-path checkpoints retain how far the operation progressed even if no result returns. Across the earlier nine clean local reloads, callback scheduling was 510–674 ms, bounded snapshot computation was 0–0.2 ms (0–1 ms at wall-clock precision), JSON serialization was 0 ms, and transfer was 255–448 ms. The browser event-loop probe nevertheless observed 9,557.2–11,320.3 ms stalls. Snapshot logic and payload cost were excluded; the measured category remains scheduling starvation, now named C by the superseding current taxonomy above.
- **Atomic required snapshot:** `modelDiagnostics` remains the single lifecycle registry owner, and the existing parsed/prepared caches expose synchronous read-only metadata inspections. The schema-v1 export contains current required identities, generation/registry epochs, closed stage state/timing, safe resource hashes, separate per-model parsed/prepared hit-or-miss outcomes, cache state/counts/refcounts, disposal/failure/stale-completion counters, and consistency booleans. It performs no Three.js traversal, clone, bounds work, network request, React update, or cache/refcount mutation; returned timing records are detached copies, and the payload exposes no object graphs, raw URLs/cache keys, local paths, or credentials. Rich diagnostics are not required by the proof.
- **Cache/refcount result:** Every one of the nine reload snapshots was coherent with registry size 8, active-required count 8, parsed cache 8 entries / 13 active references, and prepared cache 12 entries / 7 active references. Five distinct prepared variants remained at zero references under the documented bounded 32-entry LRU policy; reloads 2 and 3 did not grow either cache. All active entries were current, converged, ready, and positively referenced; aggregate refcounts matched lifecycle ownership and never became negative.
- **Performance-stage result:** Reload phases used 20,251–22,178 ms. Measured per-model maxima were response 696.1 ms, parse/decode 287.7 ms, normalization 8.4 ms, per-instance material/geometry cloning 0.3 ms, material setup 168.5 ms, bounds 4.0 ms, prerequisite-to-post-commit scene attachment 97.4 ms, and ready publication 0.1 ms. Separate acquisition outcomes included prepared miss/parsed miss, prepared miss/parsed hit, and direct parsed hit; no duplicate in-document loader generation, disposal/stale-completion event, bounds computation, preparation stage, or attachment interval explains the multi-second gaps. Event-loop values attached to stages are same-boundary observations rather than causal attribution; historical Resource Timing response ends intentionally carry no loop sample. The measured long-delay category is **main-thread scheduling**, amplified on the external runner; CI CPU contention is a plausible environment contributor, not asserted as the only cause.
- **70-second contract:** Two distinct values remain unchanged. The canonical `model-responses-and-readiness` operation has a hard 70,000 ms budget. Separately, the reload phase's `performanceWarningThresholdMs: 70_000` is explicitly emitted as a **non-failing performance observation threshold** by `runtime-smoke-phase-budget.mjs`; it is neither an authoritative product requirement nor an independent release gate. CH-0028 can therefore complete on lifecycle/cache correctness while the latency remains reported as CH-0029.
- **Coverage:** Deterministic checks cover bounded no-mutation snapshots, split scheduling/execution/serialization timing, atomic epochs/generations/active keys/counts/refcounts, shared acquisition/release and nonnegative bounded retention, remount/true reload, failure eviction and stale completion, clone isolation, BFCache retention, and independence from the obsolete rich global. The runtime smoke retains each exact fixture identity, 8-ready gating, cumulative response totals 6/9/12, three reloads, and zero retry/skip without changing any timeout.
- **Three isolated runs:** Three separate PostgreSQL databases each received all 42 migrations. Each production-mode run passed furnished-template and health/catalog 2/2, with zero failed/flaky/skipped/retried tests and exit 0.

| Run | Semantic | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,867/80,000 | 6,892/103,000 | 12,537/165,000 | 20,765/308,000 | 20,860/308,000 | 20,708/308,000 |
| 2 | 6,759/80,000 | 6,878/103,000 | 12,210/165,000 | 20,639/308,000 | 22,178/308,000 | 20,251/308,000 |
| 3 | 7,328/80,000 | 7,406/103,000 | 12,186/165,000 | 20,876/308,000 | 20,489/308,000 | 21,029/308,000 |

- **Boundaries/rollback:** No CH-0017 contract/evidence assertion, timeout, retry, skip, workflow, ruleset, PR, schema, migration, dependency, catalog, deployment, or CH-0004 change. CH-0028 assertions were strengthened to enforce exact eight-model state, response totals, and split cache outcomes. Revert the single CH-0028 commit; no data rollback is needed. The exact local commit must receive a detached production evidence proof and separate required-only external verification before any release claim.

### CH-0029 — post-response browser/main-thread starvation

- **Status:** `OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION`. Local remediation is complete and remains open until required-only external `workflow_dispatch` verifies the exact final two-commit branch head. The mandatory pre-push bundle comparison stopped `696a735a1c3c07125da8e45689611ac16c8b1d4a` before any push because its full telemetry collector remained eager; a separate local follow-up now lazy-loads that collector. CH-0017 remains frozen and CH-0028 remains externally resolved at `db346a51718967bd4dc1605b07c0850e02fd08d1`.
- **Measured classification and owner:** **C/G — React/R3F render work plus host/test contention**, an inseparable aggregate resource-contention cluster. Before the behavior change, the hidden loading Canvas continuously executed the complete mounted per-frame subscriber workload plus renderer/GPU submission while Playwright retained trace/video work on the same constrained host. The 10,736 ms long task was correctly `unattributed`; measured `r3f-render` work was 320 calls, 387.9 ms total, and 148.1 ms maximum. No evidence attributes the 10.736-second task directly to `WebGLRenderer.render` or to one GLB pipeline stage.
- **Before/after scheduling:** While the scene loading veil is active, Canvas now uses demand rendering; once the scene is visible and interactive it restores the existing continuous `always` mode. Trace and video are disabled only for this stable smoke, leaving global failure-diagnostic defaults and the safe CH-0017 structured artifact contract unchanged. No readiness, lifecycle, cache, timeout, retry, or product interaction behavior changed.
- **Measurements:** Authoritative external run `30787561725` retained an 11,747 ms heartbeat gap, a maximum admitted callback delay of 5,281 ms, and a final requested callback that never entered. Matched local pre-fix tracing observed a 10,736 ms unattributed long task, about 11,010 ms heartbeat delay, and 11,109 ms callback admission. Final-code pristine runs observed maxima of 6,858 ms heartbeat and 6,406 ms admitted callback; all callbacks entered. Under two controlled ~98% CPU workers, the final run observed 8,102 ms heartbeat and 7,168 ms callback admission and still passed. This proves bounded admission and removes the no-entry failure; it does not establish a numeric callback-gap improvement over the external 5,281 ms admitted maximum.
- **Telemetry and lazy evidence boundary:** A 96-entry metadata-only ring records fixed timing categories, long tasks, heartbeat/frame gaps, current safe stage counts, synchronous-operation concurrency, and lifecycle/store/render counters. Production collection requires the existing explicit diagnostic flag, and the complete collector now resides only in diagnostics-loaded chunk `1a39505_z1u2r.js` (6,205 bytes); ordinary production navigation inserts no collector script and installs no snapshot hook. During the import, the facade retains at most 96 fixed timing/gap events plus five fixed counters capped at 96 and one monotonic scalar epoch, then flushes once without collapsing distinct relative start times. At this CH-0029 checkpoint, required QA asserted a nonzero flush plus timing/lifecycle/render activity in the initial document and all three new reload realms; the CH-0015I inherited-contract correction above supersedes that assertion. Import failure is terminal and non-failing for the document, clears bootstrap metadata, creates no retry, and leaves lifecycle/readiness/cache/refcount behavior unchanged. Renderer identity is tracked only in a `WeakSet`; no renderer or raw WebGL graph is retained. Nested snapshot metadata is detached, and 10,000 bounded ring writes cost 0.5–1.2 ms in focused checks. URLs, paths, materials, textures, credentials, arbitrary payloads, and user data are not retained.
- **Validation:** Three fresh 42-migration production smokes passed furnished-template and health/catalog 2/2 with no failure, flake, skip, or retry. Reloads were 10,196/10,822/10,485 ms; 11,262/10,684/10,832 ms; and 11,354/10,192/10,570 ms. Every reload retained responses 6/9/12, 8 ready / 0 loading / 0 error, parsed cache 8/13, prepared cache 12/7, five bounded zero-reference variants, current generations, coherent refcounts, and no stale active entries. The pressure reloads were 12,725/11,859/12,048 ms with the same invariants and the unchanged 70,000 ms correctness contract. A focused final lazy-candidate smoke also passed furnished-template and health/catalog 2/2 while asserting bootstrap hydration in each reload realm. The pre-push clean bundle proof measures the corrected candidate at 7,096,918 raw / 1,168,050 Brotli versus the CH-0028 base at 7,092,223 / 1,166,410, with 26 initial chunks in both and the full collector absent from the corrected initial graph.
- **Limits and rollback:** Stricter user-experience responsiveness remains a product decision; the longest JavaScript task remains unattributed and constrained-host admission can still exceed five seconds. The unchanged 6,955,000-byte Phase 8 raw budget remains separately red at 7,096,918 and was not repaired or rebaselined; the residual +4,695 raw / +1,640 Brotli CH-0029 delta belongs to the later dedicated bundle optimization. Roll back the separate lazy-collector commit and then the original CH-0029 commit to restore eager diagnostics plus continuous hidden-Canvas rendering and stable-smoke trace/video capture; no data, schema, cache-policy, timeout, workflow, ruleset, PR, or deployment rollback is needed.

## Four inherited failure groups

| Group | Likely severity | CI/release block | Runtime risk | Before large refactor? | Bounded batch |
| --- | --- | --- | --- | --- | --- |
| `CatalogPanel.tsx:358` `set-state-in-effect` | P2 | Resolved locally by Baseline A; full lint is green. | Canonical category/room transactions now invalidate stale sofa-only filters without a synchronous effect. | Complete. | Baseline A completed on `fix/baseline-react-hook-diagnostics`; the single local implementation commit is the branch head. |
| `FloorPlanImportAssistant.tsx:294` unnecessary dependency | P3 | Resolved locally by Baseline A; zero-warning lint is green. | The callback now depends only on values it reads; no stale-closure defect was present. | Complete. | Baseline A removed only the unnecessary stable setter dependency and retained focused floor-plan coverage. |
| `test-command-bar-save-status.ts:34` | P3 stale contract assertion | Resolved locally by Baseline B; the save-status guard now passes and `test:design-page-cleanup` advances to the inherited presentation-workspace size assertion. | No runtime defect: the chip retains `md:flex`, the intentional 30 px command-bar geometry, canonical persistence state, and polite desktop status announcements. | Complete. | Baseline B completed on `fix/baseline-save-status-contract` with a test-only semantic geometry/visibility correction. |
| Five Hamilton YAML vocabulary failures | P2 data-quality defect | Yes: blocks catalog audit and strict release validation. | Low-to-moderate catalog filtering/recommendation mismatch; no crash or corruption reproduced. | Yes. | Baseline C: map `l_shaped` and `guest_room` to already-approved vocabulary in the three source YAMLs; run strict catalog/asset/product tests. |

The four groups are independent of CH-0001. The separately confirmed design-architecture, raw-bundle, and Cabinet Preview failures are also independent of CH-0001, but they are not included in the four-group inheritance claim and need their own batches.

## Ordered remediation queue

Risk order includes blocked findings so decisions are visible; `READY` ordering determines executable work.

1. `CH-0002` — `REQUIRES_PRODUCT_DECISION` (highest storage/cost/integrity exposure).
2. `CH-0007` — `REQUIRES_PRODUCT_DECISION` (catalog identity and partial-authoring integrity).
3. `CH-0008` — `REQUIRES_PRODUCT_DECISION` (fail-open public product availability).
4. `CH-0012` — `RESOLVED` (canonical saved-design routing repository remediation complete).
5. `CH-0016` — `RESOLVED` (production-equivalent artifact evidence repository remediation complete; external execution remains unverified).
6. `CH-0017` — `TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN`.
7. `CH-0028` — `EXTERNALLY VERIFIED — RESOLVED` at `db346a51718967bd4dc1605b07c0850e02fd08d1`.
8. `CH-0029` — `OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION`, **selected active batch**; local remediation complete, external verification pending.
9. `CH-0018` — `BLOCKED_DEPENDENCY` (populated upgrade/data-loss evidence).
10. `CH-0010` — `REQUIRES_PRODUCT_DECISION` (permanent share revocation and auto-sharing).
11. `CH-0011` — `REQUIRES_PRODUCT_DECISION` (privacy consent/masking and external PostHog state).
12. `CH-0004` — `READY`, not started (trusted event provenance).
13. `CH-0006` — `BLOCKED_DEPENDENCY` (legacy public API consumers).
14. `CH-0003` — `REQUIRES_PRODUCT_DECISION` (distributed cost budgets/outage policy).
15. `CH-0005` — `REQUIRES_PRODUCT_DECISION` (retirement authority).
16. `CH-0013` — `READY` (surface drift/schema gates, then payload).
17. `CH-0015` — `IN_PROGRESS` (Selection Tray, Client Preview command bar, Plans, and My Designs are complete in CH-0015A/B/C/D; six required overlay batches and the selected-item P2 stay queued separately).
18. `CH-0019` — `RESOLVED` by the completed bounded baseline, architecture,
    Pro-visual, and Phase 8 sequence; no longer queued.

`CH-0009`, `CH-0014`, and `CH-0029` remain P2 findings; none competes in the P1
decision rule. Baselines A, B, and C and the later CH-0019 closure batches are
complete in current ancestry. CH-0029 and CH-0004 were not modified by those
baseline batches.

### Baseline A — inherited React-hook diagnostics — 2026-08-03

- **Starting source:** exact clean `7158b5152336565a1d2b8caa42c2adab108268d2`; isolated branch `fix/baseline-react-hook-diagnostics`. The CH-0030 profiling commit `d7a50698707153b43df0a982766288060c24b997` was not merged or cherry-picked. No push or deployment was performed.
- **Verified baseline:** a clean detached full `npm run lint -- --max-warnings=0` failed only at `components/catalog/CatalogPanel.tsx:358` (`react-hooks/set-state-in-effect`) and `components/editor/FloorPlanImportAssistant.tsx:294` (`react-hooks/exhaustive-deps`, unnecessary `setState` dependency).
- **Corrections:** catalog results already ignored sofa capacity outside sofa scope, but an effect synchronously deleted the stored bucket after navigation and reset scroll a second time. The controlled category transaction and central design-snapshot setter now advance semantic navigation revisions, covering active-room ID, name, and room-type changes from every snapshot path. A sofa filter records the selection revision, so incompatible navigation removes it from results, chips, drawer state, and counts without an effect and it cannot resurrect on return; Brand and every unrelated filter remain. The cohesive filter/navigation hook also keeps this state transition outside the oversized panel, and the main-group action derives its scope from available categories. `createDesign` never read `setState`, so only that stable unnecessary dependency was removed; current job, title, active-job callback, and router dependencies remain.
- **Behavior and coverage:** focused catalog coverage proves applicable-filter retention, unrelated-filter preservation, controlled-navigation invalidation, non-resurrection after returning to sofa, valid table results, and idempotent repeat navigation; source guards lock the production revision wiring. Focused floor-plan coverage locks the callback dependency contract while existing consumer, live-progress, routing, cancellation/failure, retry, completion, and private-source guards remain green. Production-browser verification applied Brand plus `Seats: 3`, switched Living / Sleep -> Kitchenette -> Living / Sleep, retained Brand, removed and did not resurrect Seats, returned seven valid dining-table results, kept two placed items, and recorded no browser errors.
- **Validation:** targeted production/test ESLint passed with zero warnings; focused catalog and floor-plan consumer guards passed; `test:floor-plan-live-progress`, `test:design-editor-routing`, and `test:floor-plan-private-source-retention` passed; full lint passed with zero warnings; typecheck passed; code quality passed while lowering `CatalogPanel` from 1177 to 1160 lines / overlong maximum 999 to 980 and `DesignControlsFurnishPanel` from 1311 to 1309 lines / overlong maximum 1195 to 1191 / complexity maximum 73 to 72; `APP_ENV=development npm run build` passed outside the sandbox, retaining the documented floor-plan NFT trace warning and lenient catalog notices. `test:design-page-cleanup` reached the catalog guard, then failed only at the untouched save-status assertion (`scripts/test-command-bar-save-status.ts:34`). Full E2E was not run.
- **Remaining/next:** the command-bar save-status contract is the next bounded baseline (Baseline B). Hamilton vocabulary, architecture ratchets, Phase 8 initial-JavaScript budget, Full E2E, CH-0017, CH-0028, CH-0029, CH-0030, CH-0004, and unrelated findings remain untouched. The implementation commit is the single local branch-head commit containing this record.

### Baseline B — command-bar save-status contract — 2026-08-03

- **Starting source and safety:** exact clean `fe668ab31340d8092f4306361736a7b3015a2533`; isolated branch `fix/baseline-save-status-contract`. Entry status, tracked diff, diff check, diff stat, and untracked checks were empty. The Baseline A commit is the exact parented starting source, and `lsof` resolved the active Node listener to `/Users/justus/Developer/interior-ai`. No prior work was discarded; no push, deployment, Full E2E, dependency, catalog, architecture, or product change was performed.
- **Original failure and history:** the exact static guard failed at `scripts/test-command-bar-save-status.ts:34` because it expected `h-7`. The command-bar implementation used `h-[30px]` together with `hidden` and `md:flex`. The mismatch predates Baseline A: Baseline A changed none of the command-bar/save-status files, and the earlier compact-toolbar checkpoint intentionally changed the 36 px bar and its controls, including save status, to approximately 30 px while adding browser geometry coverage; that same checkpoint accidentally changed only this static expectation from `h-9` to `h-7`.
- **Intended product contract:** `useDesignPagePersistence` remains the single owner of manual save, local backup, cloud autosave, conflict, failure, reconnect retry, project-switch reset/load, and success timestamps. `getDesignPageSaveStatus` derives the presentation model; the design-page wrapper and `EditorCommandBar` only forward and render it. Initial/local or cloud pending, scheduled/saving, local/cloud success, local/cloud failure, conflict, signed-out local backup, authenticated cloud design, and reconnect retry all retain their existing behavior. Offline is represented by the cloud failure detail and the existing `online` event retry rather than a duplicate offline state. Consumer and Pro share the same state contract; Pro changes only theme classes.
- **Responsive and accessibility contract:** the status chip is absent below `md`, renders from `md` upward, is exactly 30 px high inside the 36 px desktop bar, shows its status dot at `md`, label at `lg`, and detail/retry at `xl`. The visible desktop chip exposes exact status/source/last-success metadata, a title and aria-label, `role="status"`, and `aria-live="polite"`; its decorative dot is hidden from assistive technology. The Save action remains available on compact/mobile widths. No floating duplicate or second save-state owner exists.
- **Classification and correction:** **A — STALE STATIC TEST**. Product code is correct. The static guard now extracts the save-status opening element and class tokens, independently requires base `hidden` plus `md:flex`, and requires its sole height token to equal `h-[30px]`. It no longer depends on class order or unrelated formatting and will still fail if desktop visibility, mobile hiding, or exact geometry regresses. Accessibility assertions are scoped to the same element. No assertion was removed or weakened.
- **Validation:** the exact save-status contract passes; `npm run verify:design-persistence`, the design-page save-status unit test, command-bar wrapper guard, and floating-overlay/layout guard pass; targeted ESLint passes with zero warnings; full repository lint passes with zero warnings; typecheck passes; code quality passes for 1,035 production files with no raised allowance, cycle, unsafe TypeScript, or suppression regression; focused Chromium compact-toolbar coverage passes 2/2 at wide and 900 px desktop widths for Consumer and Pro; and `APP_ENV=development CATALOG_STRICT_VALIDATION=true npm run build` passes all 57 pages with only the inherited floor-plan NFT whole-project tracing warning. The catalog guard continues to pass before save status in `test:design-page-cleanup`.
- **Independent review and remaining work:** read-only review initially found compound/important/arbitrary Tailwind overrides that escaped the literal filter, unchecked dynamic class contributors, and an unnecessary `<div>` dependency. The guard now rejects display, height/min/max/size, conditional, and tone-helper geometry changes while allowing a behavior-preserving element type; mutation checks cover each finding. Final disposition: **PASS — no actionable findings**, no weakened assertion, product change, duplicate state, accessibility regression, Baseline A regression, unrelated cleanup, or scope creep. `npm run test:design-page-cleanup` now clears save status and next stops at `scripts/test-design-page-presentation-workspace-registration.ts:87`: `lib/useDesignPagePresentationWorkspaceRegistration.ts` is 455 physical lines (456 newline-split entries) against the inherited `<= 380` assertion. That architecture work is recorded only and not broadened into Baseline B. Baseline C — Hamilton controlled vocabulary — is next. Architecture ratchets, Phase 8 initial JavaScript, Cabinet Preview policy, Full E2E, CH-0017 through CH-0030, CH-0004, and unrelated findings remain untouched. The implementation commit is the single local branch-head commit containing this record.

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

### Baseline C — Hamilton controlled vocabulary — 2026-08-04

- **Starting source and scope:** exact clean `6f63c11d9b0697f55c39e7ffefcfdf67c5624276` on `fix/baseline-hamilton-controlled-vocabulary`. Baselines A and B are ancestors and remained intact. The only catalog sources changed are `catalog/furniture/sofas/hamilton_3_seater_sofa_bed/catalog.yaml`, `hamilton_chaise_sectional_sofa_bed_left/catalog.yaml`, and `hamilton_chaise_sectional_sofa_bed_right/catalog.yaml`; no unrelated catalog product, generated file, asset, application component, dependency, architecture ratchet, bundle budget, CH-0017 through CH-0030 source, or CH-0004 source changed.
- **Exact five corrections:** all three files changed `room_compatibility[3]` from unsupported `guest_room` to canonical `bedroom`. The left and right chaise files additionally changed top-level `shape` from unsupported `l_shaped` to canonical `rectangular`. Their separate `spatial_attributes.footprint_shape: "l_shaped"` values remain unchanged.
- **Semantic and identity proof:** the frozen room vocabulary and typed `RoomTag` boundary include `bedroom` and no `guest_room` alias. The frozen top-level product-shape vocabulary is `rectangular`, `square`, `round`, `oval`, or `organic`; nearby Hamilton and other chaise products use rectangular top-level form while retaining an L-shaped spatial footprint. Product IDs remain the three unchanged `assets.asset_id` values, SKUs remain `50441101-PM4002`, `50441102-PM4002`, and `50441103-PM4002`, and each product retains one authored variant. The derived IDs remain `imported-<product-id>-marcel-brilliant-white__marcel-brilliant-white`; dimensions, sleeper configuration bounds, model paths, retailer links, and left/right orientation mappings are unchanged.
- **Payload and focused coverage:** `buildImportedModelsPayload` projects YAML into the imported-model API payload; this repository has no tracked generated catalog-runtime file or catalog generation command to run. `test:catalog-registry-sync` is the canonical source/API-payload parity check and passed with 144 YAML entries, 139 live entries, five drafts, 139 payload entries, and 51 mapped sofas. Focused tests now reject `guest_room` and top-level `l_shaped`, accept `bedroom` while preserving the independent L-shaped footprint, preserve all three products and three variants, and prove API-payload shape, room compatibility, spatial footprint, dimensions, preset auto-metadata, and identity parity.
- **Inherited consumer limitation:** at the starting SHA and after this source-only correction, final imported catalog assembly derives `CatalogItemSchema.roomTags` from static configuration/template data rather than YAML `roomCompatibility`; the three Hamilton sleepers have no static configuration and therefore assemble with empty room tags. Final filtering and recommendation scoring consume those room tags. `CatalogItemSchema` has no spatial-footprint property, and placement/collision does not consume the YAML footprint. Correcting those consumers requires a separate catalog adapter and schema/placement-contract batch, so this batch does not claim bedroom filter/recommendation consumption or L-shaped footprint placement consumption.
- **Validation:** standard and strict catalog audits passed with 144 files, zero failures, zero warnings, and zero duplicate asset IDs. Catalog editor coverage, Hamilton model/configuration/retailer checks, 548 Castlery normalized-variant identities, asset availability, catalog filters, placement, live catalog, Phase 14 product flow, and full-catalog furnish checks passed. The generic filter and placement suites do not consume the corrected Hamilton source fields and are regression checks only. Asset availability remained 812 references / 519 unique URLs / 145 local URLs with the same five missing draft-only TV-console GLBs. Full lint passed with zero warnings; typecheck and code quality passed with no allowance raised; the strict production build passed all 57 pages with only the inherited floor-plan NFT trace warning. `test:design-page-cleanup` passed the catalog and Baseline B guards and stopped at the unchanged `useDesignPagePresentationWorkspaceRegistration.ts` 455-line versus 380-line architecture assertion.
- **Broader inherited checks:** the database-backed governance script reported zero duplicate IDs, parse errors, or missing asset IDs, then failed because the local database contains zero approved `ModelAsset` rows and therefore classifies all 139 live YAML identities as orphans. The legacy strict Phase 14 asset preflight reported zero contract errors and zero invalid variant assets, then failed all 30 static-registry products only on the existing renderer-disposal verification flag; its report contains no Hamilton product. Neither inherited result was changed or reclassified.
- **Remaining/next:** the five Hamilton failures are resolved and no catalog failure remains. The next bounded batch is the existing `lib/useDesignPagePresentationWorkspaceRegistration.ts` architecture ratchet. The separate Phase 8 initial-JavaScript budget and other recorded findings remain untouched. Full E2E was not run; nothing was pushed or deployed.

### Presentation workspace architecture ratchet — 2026-08-04

- **Starting source and boundary:** exact clean `9ba876b0e8fb53a676bfaf5898bf8e548aacbb79` on `refactor/presentation-workspace-registration`, with Baselines A-C present. The 455-line module consisted of the original presentation/QA composition plus a later substantial lighting responsibility. That responsibility now lives in one focused registration module with a pure typed read-model builder and history-aware command adapter; it owns no React state/effect or document state and imports no presentation workspace facade.
- **Behavior preserved:** presentation/QA registration, canonical snapshot and history ownership, all-room fixture counts, default and overridden fixture activation, Consumer/Pro capability projection, client preview, presentation mode, selected-item and viewport behavior, room/project switching, save/reload, and 2D/3D shared scene meaning are unchanged. The downstream selected-fixture and viewport-region construction files were inspected and not modified.
- **Ratchet result:** `useDesignPagePresentationWorkspaceRegistration.ts` is 378 physical lines, down from 455. Its oversized-file baseline is removed and its overlong-function maximum lowers from 406 to 340. The new 129-line module and all of its functions satisfy normal new-file/function limits; no threshold, exception, cycle, suppression, or unsafe TypeScript construct was added.
- **Validation and next inherited failures:** focused lighting characterization, presentation registration, Consumer/Pro accessibility, client-preview presentation/export, selection and room-plan registration, save/local-backup persistence, full zero-warning lint, typecheck, code quality, targeted ESLint, and strict production build pass. The sandboxed build failed only on Turbopack helper-port permission and the approved outside-sandbox rerun passed all 57 pages with the inherited floor-plan NFT warning. `test:design-page-cleanup` now passes this presentation guard and next stops at the untouched `test-design-page-scene-layers.ts` GLB local-bounds static assertion. A direct viewport guard also retains the later inherited 361/280 line failure. No fix or reclassification was made for either inherited result.
- **Scope and rollback:** one production extraction, its existing focused lighting test, the automatically lowered code-quality baseline, and these three records only. Revert the one local implementation commit for rollback. No push, deployment, Full E2E, Phase 8, workflow, dependency, schema, migration, catalog, CH-0004, other CH-0017 through CH-0030 work, or Hamilton adapter work is included.

### GLB local-bounds scene-layer contract — 2026-08-04

- **Starting source and safety:** exact clean `9e8efa4c2a56ca1ea2526f9421c3069841e5499e` on `fix/baseline-glb-local-bounds-contract`. The requested base and all completed baseline commits were present, entry status/diff/untracked checks were empty, and `lsof` resolved the only listening Node application to `/Users/justus/Developer/interior-ai`. No work was discarded or carried across branches.
- **Exact inherited failure and classification:** `scripts/test-design-page-scene-layers.ts:693` expected `const detachedModel = normalizedModel.clone(true)` and `new THREE.Box3().setFromObject(detachedModel, true)` inside the concatenated `localRenderBounds.ts`/`GLBScaledModel.tsx` source. The assertion was introduced at `08bdfe0c`; CH-0028 commit `c0ccd0d` later moved that exact responsibility into exported `measureGLBLocalRenderBounds` in `glbModelResources.ts` without updating the scene-layer guard. That exact inherited failure was stale, but independent review reproduced two production ownership/validity gaps: prepared mounts shared the cache-owned tuple arrays, and non-finite or all-zero measurements could pass the bounds stage. The batch is therefore **E — CODE AND TEST BOTH REQUIRE CORRECTION**. No user-visible selection or placement/collision defect was reproduced.
- **Verified contract:** `measureGLBLocalRenderBounds` is the canonical normalized scene-item-local bounds owner. It measures a detached normalized model after catalog target scale, calibration, normalization offsets, and root/node transforms, but before the enclosing furniture translation and durable Y rotation. `boundsForResource` returns the prepared value on cache hits and measures the normalized instance on the uncached/texture path; `useGLBModelLifecycle` exposes it to `GLBScaledModel`. Each prepared mount owns copied primitive tuples. Empty geometry is `glb-empty-bounds`; non-finite and all-zero results are `glb-bounds-failed`, while a planar result with one zero axis remains valid. The model owns the precise selection outline under the furniture transform. Placement/collision deliberately uses the independent XZ planning footprint from catalog/planning dimensions and canonical item transforms, not GLB render bounds. None of these derived bounds are persisted.
- **Correction and coverage:** the scene-layer guard now checks the exported resource owner, validity policy, mount-copy boundary, prepared/fresh resolver, lifecycle exposure, semantic publication, selection consumer, and split diagnostic APIs separately instead of depending on former co-location or variable names. The production owner rejects invalid measurements and prepared publication copies center/size tuples without changing cache policy or lifecycle ordering. Focused runtime coverage loads a checked-in GLB, independently normalizes it twice, proves exact target dimensions, translation and Y-rotation world projection without local mutation, real cache miss/hit/remount/reload parity, per-item resource and bounds isolation, empty/non-finite/all-zero failure, valid planar bounds, tolerance, and source ownership.
- **Independent review:** the read-only review found the shared prepared tuple, invalid-measurement, synthetic-only coverage, and resource-module size-ratchet gaps. All four were corrected without a cache-policy change or quality exception. The final complete-diff disposition is **PASS — no actionable findings**.
- **Validation and next inherited failure:** the exact scene-layer guard; local/render bounds; lifecycle; cache/refcount; runtime clone isolation; selection-transform and viewport-selection guards; placement scripts; design persistence; targeted zero-warning ESLint; full zero-warning lint; typecheck; code quality; and strict 57-page production build pass. The sandboxed build failed only because Turbopack could not bind its helper port; the approved outside-sandbox rerun passed with the inherited floor-plan NFT trace warning. `test:design-page-cleanup` clears the GLB guard and next stops at the untouched `lib/design-page-viewport-workspace-registration.ts` size assertion: 361 physical lines (362 newline-split entries) against 280. Full E2E was not run, and the viewport extraction was not started.
- **Scope and rollback:** three existing focused GLB production modules plus the extracted 28-line measurement owner, two focused test scripts, the GLB lifecycle bounds-vocabulary documentation, and these two code-health records only. The extraction keeps `glbModelResources.ts` below the standard file-size limit without an exception. Revert the single local commit containing this record for rollback. No push, deployment, Phase 8, CH-0004, CH-0017 through CH-0030, workflow, dependency, schema, migration, catalog, cache policy, timeout, retry, frameloop, or telemetry change is included.

### Viewport workspace architecture ratchet — 2026-08-04

- **Starting source and ownership map:** exact clean `3f84fbd98e1154285c537119e7ec8227727f9d24` on `refactor/viewport-workspace-registration`, with the completed baseline chain present. `lib/design-page-viewport-workspace-registration.ts` had six imports, one 341-line top-level builder, and five nested callback functions. It selected 13 existing state sources, derived selected-fixture lighting, constructed 12 viewport state groups plus configuration, wired one reference group and 11 command groups, and returned one viewport region. It owned no React state, effect, registry, cleanup lifecycle, or persistence. Its history was 258 lines at initial viewport composition, 279 after imported-wall editing, 304 after multi-room plan summary, and 361 after fixture-lighting integration.
- **Chosen boundary:** `lib/design-page-viewport-workspace-read-model.ts` now owns only the immutable viewport `state` and `configuration` projection. Its typed input exposes the exact read-only `state`/`derived` dependencies; it cannot access commands. The original module still selects boundaries, constructs all command/event callbacks and references, invokes the existing viewport adapter, and returns the unchanged registration facade. The read model has no React import, state write, effect, hidden side effect, alternate registry, or duplicated selected/camera/document state.
- **Behavior preserved:** 2D and 3D continue to consume the same canonical scene/document and XZ/Y-rotation placement meaning. Room identity/order, selected room/opening/zone, whole-home camera/navigation, Consumer/Pro projection, client-preview suppression, presentation navigator disablement, imported-wall availability, plan quality/canvas, selected-fixture lighting, keyboard/accessibility, persistence, and room/project switching remain owned by their existing controllers and are only projected into the viewport contract.
- **Ratchet result:** the registration is 210 physical lines, down from 361 and below 280. The new read-model module is 298 lines; its seven functions are all at or below 48 lines. The design architecture limit tightens from 300 to 280, and the code-quality baseline lowers the registration's overlong-function maximum from 341 to 193. No file/function allowance is raised and no exception, suppression, unsafe assertion, or cycle is introduced.
- **Coverage and validation:** the new deterministic read-model test covers no room, one/multiple rooms, 2D/3D, Consumer/Pro, client preview, presentation, selected-opening presence/removal, empty and ordered room projections, room/project switching, repeated construction, and save/reload-equivalent inputs. Focused viewport overlay/selection, plan canvas/quality, zone, camera, 2D/3D continuity, selection transforms, scene layers/registration, presentation, room plan, lighting, keyboard/accessibility, and persistence tests pass. Targeted and full lint pass with zero warnings; typecheck and code quality pass; strict production build passes all 57 pages outside the sandbox with only the inherited floor-plan NFT warning. The exact cleanup suite clears the viewport assertion and next fails only the untouched `DesignPageWorkspace.tsx` 594/550 guard. The separately inherited `test-editor-3d-floor-cutaway.ts` source assertion was reproduced before editing and remains outside this batch.
- **Independent review:** read-only review corrected two documentation-only inaccuracies (the new module has seven functions, and the test proves ordered room projections rather than an ordered region list). Final disposition is **PASS — no actionable findings**: the boundary is cohesive, read-only inputs exclude commands, canonical owners remain unchanged, mappings and policy are equivalent, static guards are not materially weakened, and there is no cycle, hidden side effect, duplicate state, alternate registry, raised allowance, or scope creep.
- **Scope and rollback:** one production read-model extraction, ownership-aware updates to the existing static guards, one registered deterministic test, tightened architecture/code-quality ratchets, and the three required code-health records only. Revert the single local implementation commit for rollback. No push, deployment, Full E2E, Phase 8, CH-0004, CH-0017 through CH-0030, dependency, workflow, schema, migration, catalog, presentation-lighting, GLB, or unrelated editor/scene cleanup is included.

### DesignPageWorkspace architecture ratchet — 2026-08-04

- **Starting evidence and cause:** exact clean `f95b7e27f6729a36372f00ae0e78b93ea6fd1901`; direct cleanup and architecture checks reproduced `DesignPageWorkspace.tsx` at 594/550. The workspace's requested-ID effect was only the route trigger and late-navigation guard. Epochs, aborts, error translation, document replacement, and persistence activation already had one owner in `useDesignPagePersistence`; duplicating or moving that state machine was rejected.
- **Chosen boundary:** `useDesignPageRequestedDesignWorkspaceRegistration.ts` composes after the existing persistence registration and owns canonical requested-ID decisions, route completion/fallback, cancellation, and My Designs navigation. Its pure `design-page-requested-design-load-coordinator.ts` support owns the unique request token and abort controller used by persistence. The boundary creates no second parser, document, store, Consumer/Pro path, network path, or response adapter.
- **Ratchet and behavior:** the workspace falls to 543 physical lines; the route registration is 125 and pure arbiter is 43. Architecture tightens from 550 to 543; code quality lowers the workspace's 594-line record to 543 and overlong maximum from 560 to 510. Persistence also falls from 1,360 to 1,359 with lower function maxima. Canonical URL identity, denied/missing/unavailable messaging, hydration/autosave ordering, room/project switching, duplicate IDs, reload, Consumer/Pro entitlement, and local/authenticated behavior remain unchanged; supersession no longer relies on adapter abort compliance.
- **Coverage and next:** deterministic route decisions and completion cover no ID, signed out, hydration wait, current/repeated ID, load, missing, unavailable, superseded, route change, and unmount. Deferred controlled adapters prove B supersedes A and route removal prevents A from committing when abort is ignored. Routing, persistence, local backup, registration, floor-plan lifecycle, duplicate identity, Consumer/Pro, zero-warning lint, typecheck, code quality, direct architecture, focused Chromium 6/6, and strict 57-page build pass. `test:design-page-cleanup` clears the workspace and requested-design guards and next stops at the untouched inherited `test-editor-3d-floor-cutaway.ts:82` `floorWorldY` assertion; it is not fixed here.
- **Independent review:** initial read-only review found missing route-cleanup invalidation, reused concurrent-load epochs, and no deferred production-arbiter test. Those three findings were corrected. Final disposition is **PASS — no actionable findings**: an abort-ignoring A cannot overwrite B or survive route removal; the extraction, persistence ownership, Consumer/Pro path, hook order, ratchets, dependency graph, docs, and scope are sound. A dedicated rendered-hook race test remains only a non-blocking residual risk.
- **Scope and rollback:** one requested-design production registration, the workspace integration, deterministic and ownership-aware focused test updates, tightened ratchets, and the required documentation only. Revert the single local implementation commit for rollback. No push, deployment, Full E2E, Phase 8, CH-0004, CH-0017 through CH-0030, workflow, dependency, schema, migration, catalog, viewport/presentation/GLB, or unrelated cleanup is included.

### 3D floor-cutaway `floorWorldY` contract — 2026-08-04

- **Starting source and original failure:** exact clean `2a6a979f34b6c1c0e6ea8a09c6cfdc86ac370617` on `fix/baseline-3d-floor-cutaway-contract`. The exact guard failed at `scripts/test-editor-3d-floor-cutaway.ts:82` because it searched `HousePlanRenderer3D.tsx` for `/floorWorldY: number;/`. Commit `08bdfe0` had moved that implementation into `house-plan-3d/surfaceMeshes.tsx` without moving the source assertion. The guard was static/source-based, and cleanup stopped at the same assertion.
- **Classification and canonical contract:** **E — CODE AND TEST BOTH REQUIRE CORRECTION**. The stale owner check was brittle, and independent review found a production mismatch: the rectangular one-room renderer could remain selected for a room with nonzero `floorElevationMm`, leaving its shell at world Y zero while the established item projection added the canonical elevation to furniture. Canonical integer `elevationMm` / `floorElevationMm` owns the finished-floor plane; `floorWorldY` is its derived world-space metre value. Slab top equals that plane, slab center is `floorWorldY - thickness / 2`, slab bottom is `floorWorldY - thickness`, walls span `floorWorldY` through `floorWorldY + wallHeight`, and the `0.006 m` finish offset is render-only. The underside threshold is `floorWorldY - slabThickness * 0.35`; it is neither the slab bottom nor a clipping plane.
- **Smallest coherent correction:** one pure helper now owns the underside threshold for single-room, compatibility whole-home, and canonical slab consumers. Single-room scene registration projects the active room's canonical elevation once, the existing adapter preserves it, and `Room` positions the complete shell plus its floor/ceiling visibility on the same `floorWorldY`. A second pure non-mutating projector translates floor-relative camera position/target for initial readiness, 3D entry, Fit Room, eye-level, item focus, and selected canonical-room framing; raw saved/restored world views are not translated. Single-room initialization is stable per design/room/floor so resize and layout changes cannot reset a user camera, while whole-home fitting remains responsive. Furniture persistence remains room-local and the established 3D scene projection adds the same canonical elevation. No per-frame position derivation, arbitrary offset, alternate source of truth, material change, clipping plane, or 2D XZ mutation was added.
- **Coverage and validation:** the focused guard executes default, nonzero, negative, malformed, slab-relative threshold, camera projection, stable single-room/responsive whole-home key, mutation, and tolerance cases and binds source checks to the real owners, visibility assignments, elevation handoffs, and camera consumers. Exact cutaway, editor-registration, scene-layer, single-room floor, camera navigation/2D invariant, presentation/export, canonical/legacy/multifloor render parity, finishes/openings, room placement, snapshot migration, and persistence checks pass. The camera controller ratchet lowers from 1,301 to 1,299 lines and maximum function 1,165 to 1,160. Cleanup clears the floor-cutaway guard and next stops at the untouched `scripts/test-plan-template-access.ts:188` stable test-ID assertion; only that script's later directly affected camera source guard changed. Direct design and floor-plan architecture, targeted zero-warning ESLint, full zero-warning lint, typecheck, code quality, and the strict 57-page production build pass; existing floor-plan architecture size warnings and the inherited NFT trace warning remain. The in-app browser could not reach the isolated local listener, so no manual visual pass is claimed; deterministic path and geometry checks cover the correction.
- **Independent review and scope:** read-only review successively found the nonzero single-room shell/item divergence, source assertions insufficiently bound to visibility assignments, zero-based camera consumers, a resize-sensitive single-room initialization key, and incomplete records. Every finding was corrected and affected checks rerun; final complete-diff review found no remaining actionable issue. Revert the single focused local commit for rollback. No push, deployment, Full E2E, Phase 8, CH-0004, CH-0017 through CH-0030, plan-template implementation/failing test-ID assertion, workflow, dependency, schema, migration, catalog, GLB lifecycle/cache/bounds, frameloop, telemetry, or unrelated scene cleanup is included.

### Plan-template access stable test-ID contract — 2026-08-04

- **Starting source and inherited proof:** exact clean `bb22590ed5728c6868aa18e0738152fc7f36cfdc` on `fix/baseline-plan-template-access-contract`. The prior floor-cutaway commit changed only the later camera assertion in `scripts/test-plan-template-access.ts`; it changed neither line 188, its expected ID, its surrounding plan-tool guard, nor `DesignControlsPlanPanel.tsx`, `ConsumerRoomSetupCard.tsx`, or `PlanToolComponents.tsx`. Clean detached runs at `2a6a979f34b6c1c0e6ea8a09c6cfdc86ac370617` and `bb22590ed5728c6868aa18e0738152fc7f36cfdc` both failed at line 188 with the same normalized diagnostic and expected ``/data-testid=\{`plan-tool-section-\$\{section\}`\}/``. The floor-cutaway batch merely exposed the inherited failure.
- **Classification and contract:** **C — BRITTLE SOURCE GUARD**. Production already renders the intended `plan-tool-section-${section}` identity from exported `PlanToolSection`; the failing guard searched only the former `DesignControlsPlanPanel.tsx` source location. The selector is an automation/QA identity, not an accessible name, analytics key, entitlement check, or authorization boundary. The four fixed section keys are `importFloorPlan`, `drawRoom`, `openings`, and `templates`; they are independent of display text, index, random/time values, and product data. Consumer and Pro continue to reach the same template picker and apply commands through mode-appropriate, mutually exclusive entry projections.
- **Smallest correction and coverage:** production code is unchanged. The guard imports and server-renders the exported owner, proves each canonical section ID appears exactly once, verifies native-button keyboard semantics and visible section names separately from the ID, binds that native button to the canonical `onToggle` action, proves the panel wires all four keys exactly once, and rejects a second parent-owned ID. Adjacent section/tile source checks left behind by the same extraction now inspect `PlanToolComponents.tsx`; none was removed or weakened. Focused browser coverage proves Consumer and Pro entry, heading/first-action focus, Escape focus return, keyboard/pointer entry activation, replacement outcomes, document identity, and local save/reload behavior. Source/guard inspection separately proves disabled template actions retain their IDs and confirms one shared apply-controller path; this batch does not claim a browser-level disabled-transition or invocation-count assertion.
- **Validation, review, scope, and rollback:** the exact plan-template guard, all 78 design-page cleanup guards, direct design/floor-plan architecture, full zero-warning lint, typecheck, code quality, capability/accessibility, persistence, targeted ESLint, focused Consumer/Pro/focus Chromium workflows, and the strict 57-page production build pass. The sandboxed build failed only because Turbopack could not bind its helper port; the approved outside-sandbox rerun passed with the inherited floor-plan NFT trace warning. One broader Consumer room-setup browser case passed all stable section-selector checks and then failed at its unrelated centimetres-toggle assertion; that untouched measurement behavior is recorded but not expanded into this batch. Cleanup has no next inherited failure: the complete registered suite passes. Independent read-only review first required explicit `onToggle` wiring evidence and narrower claims for disabled/exactly-once browser coverage; both findings were corrected, affected checks reran, and final complete-diff review passed with no remaining actionable finding. Revert the single focused local commit for rollback. No production implementation, product behavior, floor-cutaway, workspace/coordinator/registration, GLB, CatalogPanel, command-bar, Hamilton, Phase 8, CH-0004, CH-0017 through CH-0030, workflow, dependency, schema, migration, Full E2E, push, or deployment change is included.

### Required-test inventory synchronization — 2026-08-04

- **Starting source and stale metadata:** exact clean `69a762727a45c145b9ea645f5a397c382accbd7e` on `fix/baseline-plan-template-access-contract`, then branched as `fix/required-test-inventory-sync`. The listening Node process resolved to the canonical `/Users/justus/Developer/interior-ai` checkout. The completed plan-template selector batch is the starting commit and remains intact. Canonical discovery found 250 normalized `scripts/test-*` paths while the manifest still expected 248 and hash `5103c2f9d54bf97fdca1b9d8a7a420a810f7e4290c708c49ee85bb6deb80ba9f`.
- **Canonical derivation and ownership:** the repository's recursive normalized/sorted path implementation independently derived script hash `0c033fb44f2e336b0433288d5fbee96f8948813fdf769be8d078aead8ff66d5c`, 370 complete classified sources, 21 unchanged gates, and zero duplicate, unowned, or multiply classified paths. The two additions since the stale fingerprint are `scripts/test-design-page-requested-design-workspace-registration.ts` and `scripts/test-design-page-viewport-workspace-read-model.ts`. Both are tracked, non-generated assertion programs registered exactly once by `scripts/run-design-page-cleanup-tests.mjs`; `ci.design-cleanup` owns them through `npm run test:design-page-cleanup` → `node scripts/run-design-page-cleanup-tests.mjs`. The runner's duplicate guard and one occurrence of each path prevent duplicate execution. Removing either changes count and hash; renaming one preserves count but changes the hash, so truthfulness rejects both cases.
- **Synchronization and validation:** only the script inventory count/hash and the verified QA totals changed. No production source, test implementation/assertion, gate identity, cadence, required/advisory classification, package closure, workflow, threshold, allowance, or suppression changed. Required-test truthfulness and its focused inventory negatives pass; direct `check` reports 21 gates / 370 sources; the CH-0016 production-evidence contract passes; design cleanup passes 78/78 with each synchronized test executing once; full lint passes with zero warnings; typecheck, code quality, and diff hygiene pass.
- **Independent review:** the separate read-only reviewer independently reproduced 250 script tests, 370 unique classified sources, the new hash, and the exact stale 248/hash pair when both files are removed. It confirmed 21 unchanged gates, zero gaps/overlaps, one required execution owner and one runner occurrence for each test, correct current documentation, the 2/4 Pro-policy evidence, and a four-file metadata/docs-only diff. Final disposition: **PASS — no actionable findings**. Historical 248/368 CH records remain intentionally unchanged.
- **Next required blocker:** the registered Pro visual-policy wrapper executes four tests with explicit local `APP_ENV=development`: the Consumer/Pro theme identity passes in Chromium and WebKit, while the Cabinet Preview identity fails in both because `open-custom-millwork-studio` is hidden, for 2/4 passed. `ci.pro-visual-policy` is merge-required and blocking, so Pro visual-policy remediation is the next local batch; it was not started. Phase 8 remains separate and unchanged at 7,101,416 raw initial-JS bytes versus 6,955,000 (146,416 excess), 1,169,365 Brotli bytes versus 1,130,000, and 3,779 bytes latent initial-CSS excess. Full E2E, Phase 8 remediation, CH-0004, CH-0017 through CH-0030 behavior, push, deployment, and external settings remain untouched.

### Pro visual-policy Cabinet Preview access contract — 2026-08-04

- **Starting source and exact failure:** exact clean `8cec1f0afe5da80f7cedd149c91586f930bb7738` on `fix/baseline-pro-visual-policy`; `lsof` resolved the listening Node app to the canonical `/Users/justus/Developer/interior-ai` checkout. With explicit `APP_ENV=development`, the required wrapper reproduced 2/4: the Consumer/Pro theme identity passed in Chromium and WebKit, while both Cabinet Preview identities timed out at `open-custom-millwork-studio`, an existing but hidden span inside the closed Workspace menu. The feature flag was enabled by the supported non-production default, the Cabinet case was on `/design?mode=designer` with the Pro plan mocked through `/api/me`, and opening Workspace exposed one visible `editor-workflow-millwork` menu item in both engines.
- **Classification and verified contract:** **F — CODE AND TEST BOTH REQUIRE CORRECTION**. The required test used a stale hidden-child interaction instead of the real visible flow, and manual/browser inspection independently found that the Studio lacked dialog semantics, focus entry/trapping/return, while WebKit did not provide a deterministic native-Tab path between menu buttons. The canonical flow is Workspace trigger → visible Workspace menu → unique `editor-workflow-millwork` action → one lazy Custom Millwork Studio dialog. `open-custom-millwork-studio` remains a legacy nested identity, not an interactive owner or authorization boundary.
- **Smallest correction and policy preservation:** the required spec now uses one domain-specific `openCustomMillworkStudioFromWorkspace` helper, proves the menu and legacy child are hidden while closed, opens the real menu, activates the canonical item through pointer and keyboard, retains every Cabinet Preview visual assertion, and proves close/reopen plus uniqueness. The command bar gives keyboard activation deterministic first-item focus, Arrow-key menu navigation, Escape/action focus return, and no duplicate opener. The Studio overlay now uses an isolated accessible dialog owner with modal/name semantics, initial focus, a Tab trap, guarded Escape dismissal, close focus return, and reopen-race protection. A Free plan deliberately requesting `?mode=designer` remains Consumer, Guided, and without the Pro indicator or Detailed control; Pro remains entitled to Detailed. The canonical public feature flag remains production-fail-closed; client preview still removes the action; authorization remains server/domain controlled.
- **Validation:** the final required wrapper passed 4/4 with truthfulness validation. Direct projects passed Chromium 2/2 and WebKit 2/2. All 78 design-page cleanup guards, required-test truthfulness, CH-0016 production-artifact evidence, editor command/capability/accessibility, cabinetry controller/runtime/composition/header/accessibility/preview-renderer checks, targeted and full zero-warning lint, typecheck, code quality, diff hygiene, and the strict 57-page production build passed. No force click, DOM click, sleep, timeout increase, skip, retry, allowance, suppression, workflow, dependency, or budget change was added. Required inventory remains 21 gates / 370 classified sources.
- **Bundle and separate next blocker:** identical strict builds measure initial JS from 7,101,416 raw / 1,169,365 Brotli at the starting SHA to 7,103,302 raw / 1,169,257 Brotli, an explained +1,886 raw / -108 Brotli accessibility correction. Initial CSS remains 143,779 raw, preserving the 3,779-byte excess. Cabinetry Studio remains one lazy 492,639 raw / 84,899 Brotli chunk; there is no eager duplicate or new dependency. The standard Phase 8 check passes representative project timings and then remains separately red at 7,103,302/6,955,000 raw; no Phase 8 implementation or budget was changed.
- **Review, scope, and rollback:** independent read-only review found two actionable gaps: the modal did not consume Escape through its canonical dismissal path, and the Consumer browser phase inherited a mocked Pro plan. Follow-up found that an inner control's already-prevented Escape could still reach background shortcuts. All findings were corrected with unconditional modal Escape isolation, dismissal only for an otherwise-unhandled Escape, and a real Free-plan `?mode=designer` downgrade case; affected static checks, Chromium, WebKit, the 4/4 wrapper, lint/typecheck/code quality, cleanup, and the strict build reran successfully. Final complete-diff disposition: **PASS — no actionable findings**. The one residual non-blocking limitation is that inner-control `defaultPrevented` isolation is protected by an exact source guard rather than a separate browser case; generic Escape dismissal and focus return are browser-covered. Revert the one focused local implementation commit for rollback. Full E2E was not run. No Phase 8 remediation, CH-0004, CH-0017 through CH-0030 behavior, geometry/export, GLB lifecycle/cache/telemetry, viewport/presentation architecture, catalog, workflow, dependency, lockfile, schema, migration, push, or deployment work is included.

### RC47-RC55 archival P1 persistence queue — 2026-08-05

- **`ARCH-RC49-50-CLOUD-BASELINE` — P1, locally remediated:** starting from
  exact clean `e06795dc92874afb383f61b28ba380930c1c7252`, the current architecture
  now validates and canonically projects loaded cloud documents before creating
  a fingerprint, binds the pending baseline to design ID, loaded revision, and
  document/load epoch, and blocks load, manual-save, recovery-copy, and autosave
  writes until the exact post-commit projection acknowledges it. Superseded or
  failed loads fail closed; duplicates receive an independent identity. RC49
  `d41bdf31720918705480a36a44c91347987080bb` and RC50
  `ee612c84f5f6c1e5370c7aeb12593cf920fe1967` were used only as intent evidence
  and were not cherry-picked.
- **`ARCH-RC53-CLOUD-REVISION` — P1, open:** manual and autosave operations
  capture `lastCloudRevision` before entering the serialized write queue. A
  later operation can execute after its predecessor committed while still
  submitting the old revision, producing a false 409 and stranding the latest
  edit. Read the current committed revision at execution time and reject stale
  autosave generations without weakening the server's `expectedUpdatedAt`
  compare-and-swap.
- **Severity boundary:** strong server CAS, local backup/offline handling,
  request coordination, and document-epoch rejection prevent evidence of silent
  cross-session overwrite or cross-design mutation. They do not make the two
  same-client persistence gaps safe. P1 reflects production reach, edit-loss/
  stranding potential, and weak detectability; no P0 is established.
- **Gate:** `ARCH-RC53-CLOUD-REVISION` remains the open P1 persistence item and
  is explicitly outside this batch. The related P2/P3 items and full RC
  inventory remain in `docs/code-health/07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.
  Focused deterministic coverage, isolated PostgreSQL migration/browser proof,
  all required static/release gates, the strict production build, and Phase 8
  budgets pass for the cloud-baseline remediation. Full E2E was not run.

### RC47-RC55 archival P2 compare queue — 2026-08-05

- **`ARCH-RC51-COMPARE` — P2, locally remediated:** from exact clean
  `faaa463d2f0211fa2ec8f15fe3da1efc3e80c1c1`, ordered compared-product IDs now
  resolve through one pure selector over the current unfiltered public catalog
  projection. Filtered/grouped cards no longer own lookup, no mutable catalog
  object is copied into compare state, and selected variants continue to build
  current price/media/dimension projections. The archival RC51 commit
  `27b6a55bccbab5bf9a6556fea04fa4179343e447` was evidence only.
- **Failure boundary:** a genuinely missing, retired, mismatched, or non-public
  identity remains in deterministic order as one removable unavailable entry
  with no preview or purchase action. The selector cannot substitute another
  product or bypass the existing `isLiveCatalogEntry` hydration boundary. A
  removed selected variant is separately detected when the lower-level resolver
  falls back and becomes variant-unavailable rather than adopting the fallback's
  media, dimensions, price, or purchase identity.
- **Behavior preserved:** duplicate toggle removal, the three-item
  replace-oldest limit, clear/remove, Consumer/Pro sharing, pointer/keyboard
  access, analytics observation, catalog filters, grouping, IDs, and variant
  semantics are unchanged.
- **Evidence:** deterministic filter/identity/refresh coverage and the complete
  focused Chromium compare suite pass, as do product-flow, variant/price,
  publication/draft, refresh, and accessibility checks. Full required-gate
  results are in `HANDOFF.md`; Full E2E is intentionally excluded.
- **Remaining queue:** RC52 drawer focus remains P2. RC47, RC54, and the RC53/55
  responsive share work remain P3. No integration branch is eligible from this
  closure alone.

### RC47-RC55 archival P2 drawer-focus queue — 2026-08-05

- **`ARCH-RC52-DRAWER-FOCUS` — P2, locally remediated:** from exact clean
  `bb0e4f8f999d774b8490eca16efdc84d6751aafd`, product-card and compare-tray
  preview actions now establish one typed product/action/source restoration
  identity. Close-time lookup accepts only a connected, visible, enabled
  current action and falls back deterministically to a same-product details
  action or the catalog-results region.
- **Lifecycle boundary:** hydration, category/filtering, virtualization, and
  desktop/mobile replacement may disconnect the direct element without losing
  semantic identity. A newer modal or alertdialog suppresses entry, Escape, and
  restoration; route/workspace unmount and newer opens cancel queued focus;
  drawer-internal product changes preserve the original opener; reopen replaces
  it. Every close path releases the DOM-bearing optimization after cleanup.
- **Evidence and scope:** fixed Consumer/Pro product-card, compare-tray, search,
  real live-catalog unavailability, hydration-style replacement, both responsive
  directions, alertdialog entry/restoration, and unmount cases pass 18/18 with
  real focus assertions in Chromium and WebKit. RC52 archival commit
  `637281505493572229be864449d77e3a626c67fe` remained evidence only. No category
  freeze, drawer redesign, touch-target, publication, entitlement, purchase,
  routing, responsive-share, or other archival remediation is included.
- **Remaining queue:** P2 compare and drawer-focus findings are locally closed.
  RC47 and RC54 plus RC53/55 responsive share remain P3 and require separate
  bounded changes before any final integration candidate is eligible.

### RC47-RC55 archival P3 drawer-assertion queue — 2026-08-05

- **`ARCH-RC47-ASSERTIONS` — P3, locally remediated:** from exact clean
  `793986d22b073c2d4ba093350b2442838703deb0`, product specs 104 and 143 now
  select the unique visible modal product drawer by `dialog` role and its
  accessible name `Review exact variant`, assert `aria-modal="true"`, and retain
  their exact Arcadia and Seb Small product, variant, commerce, selected-item,
  material, dimension, warranty, swatch, and configuration contracts. The Seb
  assertion no longer uses `.first()`. Archival RC47 commit
  `23e12bfe85742acb3bb10ecfb808401b3b63c638` remained evidence only.
- **Classification and scope:** **A — STALE TEST ASSERTIONS**. The rendered
  product drawer was already one correctly named modal dialog; the obsolete
  `complementary` query targeted the wrong semantic contract, while the actual
  complementary landmark remained the separate plan-information region. No
  production, drawer-focus, compare, catalog, product, responsive-share, or
  external behavior changed.
- **Evidence:** the exact two-spec Chromium run moves from 5 passed / 2 failed
  to 7/7 passed; the RC52 Chromium/WebKit drawer-focus matrix remains 18/18;
  the focused Chromium compare/layout/product-flow set remains 10/10. All
  required local gates, strict catalog audit/build, Phase 8 budgets, and diff
  hygiene pass. Full E2E was intentionally excluded.
- **Remaining queue:** RC54 and RC53/55 responsive share remain P3 and require
  separate bounded changes. This closure does not authorize an integration
  branch, push, deployment, workflow change, or external-setting change.

### RC47-RC55 archival P3 public-projection assertion queue — 2026-08-05

- **`ARCH-RC54-PROJECTION-ASSERTION` — P3, locally remediated:** from exact
  clean `e7cd5d9df19439f0956f840b977ddf8c23dc2757`, the beta smoke now validates
  the closed public response envelope and design/revision identity, asserts
  meaningful public fixture values, and compares the authenticated duplicate
  only after canonical public projection and order-stable public
  fingerprinting. RC54 archival commit
  `588b90e8c526e54d314376f177bdb9c738ac659e` remained intent evidence only.
- **Classification and scope:** **E — CODE AND TEST BOTH REQUIRE CORRECTION**.
  The prior test compared a public source with an owner-visible duplicate.
  Independent review also found that arbitrary snapshot extensions survived
  projection and raw outer API/copy values could diverge from the projected v3
  snapshot. Production now enforces a closed declared structural schema and
  derives the non-owner envelope and recipient copy from one canonical public
  transport projection. Normalized nested sensitive names fail closed, a typed
  cabinetry responsibility role remains public, and no-snapshot legacy rows
  become parser-valid v3 projections. Authorization, token lifecycle, client preview,
  persistence schema, and responsive layout remain unchanged.
- **Evidence:** deterministic public/private field, leakage, completeness,
  multi-room, ordering, variant, dimensions, XZ/rotation, material, stale
  identity, divergent outer-envelope, and undeclared-field cases pass in the
  public-projection security suite. The exact Chromium beta smoke and focused
  share/duplicate specs pass after the correction. Final independent read-only
  review is **PASS — no actionable findings**. Complete local gate results are
  recorded in `HANDOFF.md`; Full E2E is intentionally excluded.
- **Remaining queue:** only RC53/55 responsive share remains P3. No integration
  branch, push, deployment, workflow change, or external-setting change is
  authorized by this closure.

### RC47-RC55 archival P3 responsive-share queue — 2026-08-05

- **`ARCH-RC53-55-SHARE-RESPONSIVE` — P3, locally remediated:** from exact
  clean `29a4c46070404a2426da123bc5b42c0592d95e34`, one canonical ARCH-RC54
  public projection now feeds one responsive shell and selected-room owner.
  Mobile cards expose every projected room; tablet/desktop retain the existing
  room table; one viewer/navigation tree remains actionable in every mode.
- **Continuity and readiness:** a selected room and supported saved view survive
  breakpoint changes. Missing room identity falls back to the first canonical
  public room. Readiness requires the exact current projection/mode/room layout
  key, Canvas creation, and finite positive measured surface dimensions. The
  numeric generation hash is diagnostic and cannot authorize stale evidence.
- **Accessibility and identity:** canonical room/view IDs back stable selectors;
  the active scope contains no duplicate selectors or DOM IDs. Room controls
  support Left/Right/Home/End, targets are at least 44 px, focus remains visible,
  all safe-area insets are present, and focused geometry checks reject page
  overflow or clipped non-scrollable controls.
- **Evidence and scope:** the responsive/read-only suite passes 12/12 in
  Chromium and WebKit; focused beta/client-preview and duplication pass 5/5;
  projection security, persistence, required truthfulness, critical-required,
  cleanup, lint, typecheck, code quality, strict build, Phase 8, and diff checks
  pass. Independent read-only review is PASS. The RC53 cloud-revision portion,
  RC54 projection policy, token/auth/publication behavior, persistence, and
  external systems were not changed. Full E2E was intentionally excluded.
- **Remaining queue:** no RC47-RC55 archival finding remains after the bounded
  local remediation branches. No integration branch, push, deployment,
  workflow, ruleset, runner, or external-setting action is included or
  authorized here.

### Superseding final RC47-RC55 disposition — 2026-08-05

The preceding “no finding remains” statement is superseded by independent and
local read-only review of exact source
`83425bad3cc30dc37100d090e79159998782bc29`. Final outcome is **B. RC47–RC55
DISPOSITION COMPLETE — ADDITIONAL BOUNDED REMEDIATION REQUIRED**.

- **P2 `ARCH-RC48-KEYBOARD` — OPEN:** selected-item capture-phase `R` can
  suppress floor-plan tracing's bubble-phase `R`; add explicit mode ownership
  and collision coverage.
- **P2 `ARCH-RC53-55-SHARE-RESPONSIVE-PROJECTION` — OPEN:** the share page
  still renders visible outer metadata from the raw row rather than exclusively
  from the canonical public projection.
- **P3 `ARCH-RC55-READINESS-IDENTITY` — OPEN:** eight-hex projection identity
  can collide; the existing test only proves the secondary layout hash cannot
  authorize a stale key.
- **P3 `ARCH-RC55-REQUIRED-GATE` — OPEN:** responsive unit/browser and focused
  WebKit coverage do not yet have complete merge-required Gate A3 ownership.
- **P2 Consumer touch-target evidence — OPEN:** the focused rotation/Consumer
  batch retained one failure because Undo measured 30 px rather than 44 px.

The RC49/50 baseline and RC53 cloud-revision findings are closed by the current
canonical baseline and execution-time write-queue protocols. The final per-RC
mapping is RC47 **A**; RC48 **F**; RC49/50/51/52 **B**; RC53 **F** overall;
RC54 **B**; RC55 **F**. At that historical checkpoint, these archival items did
not change the then-current code-health count of **0 unresolved P0 and 13
unresolved P1**. The final re-triage at the top of this file supersedes that
count and the integration hold.

### ARCH-RC53 public-share projection-source queue — 2026-08-06

- **`ARCH-RC53-SHARE-PROJECTION-SOURCE` — locally remediated:** from exact clean
  `12bc689b7db757c0f7323774d214aaa1aa8c8028` on
  `fix/arch-rc53-share-projection-source`, anonymous share page, HTML export,
  PDF export, native-share/CSV/PDF titles, and duplicate analytics now consume
  the existing `projectSharedDesignTransport` result instead of raw outer
  title/style/budget/notes. No archival patch was cherry-picked.
- **Privacy classification:** declared snapshot title/style/categorical budget/
  notes are intended public. Owner name/email, row `createdAt`, private
  provenance, and unknown outer fields are owner/internal only. Derived totals,
  readiness, filenames, catalog presentation, and generic metadata are public
  only as projection-derived/static values. No product/privacy ambiguity
  remains. Anonymous exports now label the preparer as `Interior AI` and omit
  row-created metadata.
- **Closed-flow invariant:** present fields in a valid v3 snapshot win over
  divergent raw columns. A no-snapshot row, or presentation metadata absent
  from an older v3 row, enters only through the explicit legacy transport
  upgrade and must become a valid closed v3 projection before presentation.
  Non-owner API and recipient-copy semantics remain projection-owned; private
  raw changes do not affect public output or fingerprint, while projected
  presentation changes do.
- **Typed presentation boundary and client preview:** the shared resolver
  enforces title ≤120, style ≤80, notes ≤20,000, and the explicit modern plus
  legacy budget categories. Owner/client preview consumes that same
  snapshot-first resolver and maps its category/style output only into existing
  editor controls; an independent divergent-envelope fixture proves the raw
  owner values do not regain ownership.
- **Scope:** no cloud revision/baseline, token lifecycle, authorization,
  publication rule, responsive geometry, RC55 projection identity, Gate A3
  ownership, dependency, lockfile, workflow, runner, deployment, secret, or
  external setting changed. Full E2E remains excluded.
- **Remaining archival queue:** RC48 tracing/rotation ownership; RC55
  collision-resistant projection identity; RC55 required-gate ownership for
  responsive Chromium/WebKit coverage.

### ARCH-RC48 tracing/selected-item keyboard queue — 2026-08-06

- **`ARCH-RC48-KEYBOARD` — locally remediated:** starting from exact clean
  `8818ac76d4772271f027e8dc3c8e9cd6b8009229`, active room tracing now owns only
  unmodified `R`; selected-item capture declines that command from synchronous
  event-time tool state before placement or item routing.
- **Preserved commands:** absent pending placement, `Shift+R`, `Q`, `E`, and
  `0` retain the canonical selected-item transform owner and its
  history/dirty/autosave/analytics path.
  `Cmd/Ctrl/Alt+R` is not intercepted. Editable/modal focus and captured pointer
  interaction block tracing and item commands consistently; repeat events have
  one owner each.
- **Direct evidence:** the focused Chromium regression was red before the fix
  because `R` changed the selected item fingerprint. It is green after the fix:
  tracing switches straight-wall to rectangle-wall while selected-item
  fingerprint, selection, and Undo history remain unchanged.
- **Scope and rollback:** no 2D/3D projection, persistence, schema, dependency,
  workflow, external setting, or unrelated Consumer Undo touch target changed.
  Roll back with one local revert and rerun the selection-keyboard and focused
  Chromium collision checks.
- **Remaining archival queue:** only RC55 collision-resistant projection
  identity and RC55 merge-required Gate A3 ownership for responsive
  Chromium/WebKit coverage remain.

### ARCH-RC55 collision-resistant projection identity queue — 2026-08-06

- **`ARCH-RC55-READINESS-IDENTITY` — locally remediated:** from exact clean
  `abec1b92b86a0b74193f437aea11033f666adca0` on
  `fix/arch-rc55-projection-identity`, correctness now uses full versioned
  SHA-256 identity over the closed canonical public projection. The exact
  retained title pair
  `ARCH-RC55 1vnkyl8-80u7s7-q7q69o` /
  `ARCH-RC55 y1co6q-7jaizn-1n448ct` collides at old FNV `bafccb68` but receives
  different new identities.
- **Identity vocabulary:** content identity is separate from the enabled-token
  design binding and public API `updatedAt` revision. The versioned exact layout
  tuple adds mode, canonical room, and saved view. Numeric FNV layout generation
  and the existing eight-hex handoff fingerprint are diagnostic only; the shell
  React key remains a design/token render-instance identity.
- **Failure and continuity:** SHA-256 is computed synchronously once on the
  server; there is no async completion race. A throw prevents the shell from
  rendering ready. Exact current-key checks reject stale Canvas and surface
  evidence, and selection resolution preserves only room/view IDs still present
  in the current projection.
- **Scope and evidence:** no field policy, token/auth lifecycle, cloud revision,
  responsive geometry, dependency, workflow, required-test manifest, Gate A3
  ownership, Full E2E, Consumer Undo target, push, deployment, or integration
  branch changed. Identity/security unit coverage, 12/12 responsive
  Chromium/WebKit, 5/5 beta/duplication, truthfulness, cleanup, critical-required,
  zero-warning lint, typecheck, strict build, and Phase 8 pass. The global
  code-quality command retains only ten unrelated violations independently
  reproduced at the untouched starting SHA; no allowance was changed.
- **Remaining archival queue:** only `ARCH-RC55-REQUIRED-GATE` remains open for
  canonical merge-required Gate A3 ownership of the responsive Chromium/WebKit
  coverage. RC55 remains overall F until that separate batch closes.

### ARCH-RC48 code-quality ratchet queue correction — 2026-08-06

- **Historical correction:** the earlier ARCH-RC48 entry’s “only RC55 remains”
  wording was accurate only for keyboard behavior. Its full-code-quality-pass
  report was false: a clean three-SHA audit found nine RC48-introduced growth
  findings and one required downward complexity-baseline correction, all first
  present at `abec1b92b86a0b74193f437aea11033f666adca0` and none owned by RC55.
- **`ARCH-RC48-CODE-QUALITY` — locally remediated:** from exact clean
  `27e78d25477b6e6d9282c59cd3c801e701abee9b` on
  `fix/arch-rc48-code-quality-ratchet`, tracing listener lifecycle and
  synchronized event-time mode ownership move to two narrow hooks, while one
  typed ownership capability replaces the separately threaded refs/config.
- **Ratchet result:** all nine growth findings are eliminated structurally;
  baseline updates only lower existing debt and remove stale complexity/
  nesting entries. No exception, suppression, policy, threshold, workflow,
  dependency, RC55 projection source, or external setting changes.
- **Proof and remaining queue:** focused behavior and all required local gates
  pass. Two clean exact-commit worktrees each pass `npm ci` and the full
  `npm run check:code-quality`. `npm run test:code-quality` is recorded only as
  checker-self-test evidence. Only `ARCH-RC55-REQUIRED-GATE` remains in the
  archival queue; Full E2E and the unrelated Undo target remain excluded.

### ARCH-RC55 canonical Gate A3 ownership queue — 2026-08-06

- **`ARCH-RC55-REQUIRED-GATE` — owner registered; validation blocked:** from exact clean
  `d93e34558221e99797ca73791364c016a14ef0cc` on
  `fix/arch-rc55-gate-a3-ownership`, new gate
  `ci.public-share-responsive` is the sole merge-required owner of
  `scripts/test-public-share-responsive.ts` and
  `tests/e2e/share-responsive.spec.ts`.
- **Truthful closure:**
  `npm run test:public-share-responsive-required` has a two-script
  manifest-controlled closure with SHA-256
  `d554bcd17619cead3de0012153f24a352b71dd45719262e0a7902c7453a033fe`.
  It runs the static projection/layout/privacy contract, then the exact
  `playwright.share-responsive.config.ts` scope: four responsive identities in
  Chromium and WebKit, no path/title/project filter, no shard, zero retries,
  no skip/flake/annotation, nonzero discovery, and JSON/process/count agreement.
  The evidence runner, rather than an unverified outer shell phase, executes the
  declared static prerequisite and requires the exact staging/strict-server
  environment; direct runner or required-config dev-server substitution fails.
- **CI ownership:** the one new `stable-checks` step follows database migration,
  the pristine strict staging build, browser installation, runtime smoke, and
  production-evidence preparation. It starts the existing `.next` output with
  `npm run start`, cannot reuse a listener, and does not invoke `next dev` or a
  second compilation. Stable failure reaches the unchanged `merge-gate`
  dependency. Full E2E remains separately advisory; `release.gate-a3` remains
  the complete release inventory, not the merge-required owner.
- **Inventory and evidence:** the manifest is 22 gates / 373 classified
  sources: 251 script tests, 100 browser specs, 6 cabinetry browser modules, 8
  multi-room browser modules, and 8 cabinetry script modules. Their hashes are
  unchanged because no runnable source was added or removed. Required capture
  disables trace, screenshot, and video; only ignored structured JSON/envelope
  output is produced, and existing safe upload/retention policy is unchanged.
- **Disposition and scope:** the first canonical run at implementation snapshot
  `729caae` passed the static prerequisite and WebKit 4/4 but failed Chromium
  0/4 without retry because two `public-share-root` elements coexist during
  hydration. A read-only timing diagnostic measured the duplicate interval at
  about 1.17 seconds, including simultaneous resolving and ready roots.
  `ARCH-RC55-REQUIRED-GATE` therefore remains open and the RC47-RC55 archival
  queue is not closed. Product behavior, responsive geometry,
  projection identity/source policy, persistence, keyboard ownership, Full E2E,
  dependencies, runners, deployments, secrets, environments, OAuth, GitHub
  rulesets, and branch protection were not changed; correcting the newly exposed
  runtime behavior requires a separately authorized production-scope batch.
  The external ruleset still does not have repository-verifiable required-check
  evidence. The unrelated
  Consumer Undo 44 px touch-target finding remains open.
- **Rollback:** revert the single focused ownership commit, then rerun direct
  manifest/truthfulness checks, the static contract, Chromium and WebKit, and
  production-evidence validation. No data, schema, deployment, credential, or
  external-setting rollback is involved.

### ARCH-RC55 Chromium public-share root lifecycle — 2026-08-06

- **Disposition:** resolved on `fix/arch-rc55-public-share-root-lifecycle` from
  exact clean starting SHA `371feb2641866aba28db0a5332971768bfe283a8`.
  `ci.public-share-responsive` remains the sole required owner; neither Gate A3
  ownership nor the 22-gate / 373-source inventory changed.
- **Verified cause:** classification B, SSR/hydration replacement. The automatic
  `[shareToken]/loading.tsx` boundary staged server node 1 under hidden React
  container `S:0` with 21 actionable descendants while Chromium created a
  separate visible client node 2 under `body`. Both carried the same token,
  projection identity, selected room, and resolving generation. This was not a
  responsive branch, React-key, token-generation, or locator defect.
- **Correction:** `PublicShareResolvedRoot` is the one resolved-root owner and
  mounts only through `PublicShareClientBoundary` with `ssr: false`; therefore
  the streamed server response cannot contain an old resolved tree for client
  hydration to duplicate. The accessible route loading status is retained,
  while the dynamic boundary emits no server/intermediate fallback markup.
  Loading, invalid/revoked, and error do not claim `public-share-root`.
  `PublicShareShell` reports resolving,
  ready, and empty attributes to the one mounted root without remounting it.
  The restored design-ID/share-token key remounts only for an actual public
  generation change, preventing room/view/readiness state from leaking from
  token A into token B.
  No projection, authorization, persistence, responsive geometry, or
  dependency changed.
- **Strict transient proof:** a test-only MutationObserver assigns WeakMap node
  identities and records state, projection/layout generation, room/view,
  parent/stream owner, connectedness, visibility, `aria-hidden`, inertness,
  focus, actionable descendants, duplicate stable selectors, and actions
  outside the current owner. The bounded log fails if truncated while maximum
  invariant counters continue updating. It rejects any sample with more than
  one connected or visible root, more than one visible or accessibility-active
  lifecycle owner, or any focus inside a hidden, inert, removed, or superseded
  root. A connected-but-hidden Next fallback handoff remains diagnostic only
  and cannot own or exempt actions. Direct navigation, a database-gated slow projection,
  ordered loading → resolving → ready, empty public content, route error,
  both resize directions, same-document token A → B with a retained stale
  control, browser back/forward, same-token reload, invalid/revoked, Chromium,
  and WebKit are covered without sleeps or retries.
- **Focused result:** static contract PASS; Chromium 4/4 PASS; WebKit 4/4 PASS;
  aggregate 8/8 PASS; zero retry, flake, or skip. The canonical clean-commit
  required result is recorded in HANDOFF.
- **Remaining external/separate work:** GitHub ruleset enforcement is still
  external and unverified. Consumer Undo remains the unrelated 44 px
  touch-target gap and was not changed.
- **Rollback:** revert the focused lifecycle commit, rebuild the strict
  production artifact, then rerun the static contract, the required Chromium /
  WebKit command, direct manifest/truthfulness, and production-evidence checks.
  No data, schema, token, credential, deployment, or external-setting rollback
  is required.

### Consumer Undo 44 px touch-target remediation — 2026-08-06

- **Disposition:** the retained Consumer Undo failure is locally remediated on
  `fix/consumer-undo-touch-target` from exact clean starting SHA
  `840037865531c7bc5fb8ac92d5fccd0b7393d942`. Classification is **A — product
  touch-target defect**: the actual semantic Undo and Redo buttons, not a visual
  child or wrapper, measured 30 x 30 px at the focused 390 x 844 / DPR 1
  Chromium viewport. The 36 px parent did not contain a compliant target.
- **Correction and preserved contracts:** `EditorCommandBar` now owns one shared
  responsive history-action class: Undo and Redo are 44 x 44 px below `md` and
  remain 30 x 30 px at desktop. A 48 px mobile bar contains the target and its
  inset top-edge focus outline; compact mobile gaps keep at least 4 px between
  the sidebar, Undo, Redo, and view toggle, while all desktop gaps and the 36 px
  bar remain unchanged. The 30 px desktop save-status chip, callbacks, disabled
  logic, accessible names, titles/tooltips, history controller, Consumer/Pro
  distinction, public share, and Gate A3 ownership are unchanged.
- **Focused evidence:** the original line-128 Consumer assertion now measures
  both dimensions of the button and passes. Placement Enter/Redo Space,
  rotation, nudge pointer Undo/Redo, duplicate, and delete each preserve the
  expected document fingerprint and one-history-entry semantics. The dedicated
  Consumer/Pro matrix passes 6/6 across Chromium and WebKit and both breakpoint
  directions, including enabled pointer/Enter/Space/focus/history behavior,
  disabled-state stability, complete semantic hit-box ownership, accessible
  names, adjacent history spacing, desktop 30 px controls, 36 px bar, exact
  30 px save status, and no horizontal page overflow. Focused Chromium
  placement/rotation plus desktop toolbar coverage passes 7/7.
- **Validation and budgets:** design cleanup passes 78/78; required-test
  truthfulness passes at 22 gates / 374 classified sources after synchronizing
  only the release-only browser path inventory; direct manifest validation,
  critical-required, zero-warning lint, typecheck, and code quality pass. The
  automatic quality baseline only decreases `EditorCommandBar` from 739 to 736
  lines, overlong maximum 647 to 644, and complexity maximum 65 to 64. The
  strict local optimized build passes 57 pages with the inherited floor-plan
  NFT trace warning. Phase 8 stays green: initial JS raw 5,815,818 -> 5,815,471
  (-347), gzip +69, Brotli +186; CSS raw 130,408 -> 130,792 (+384), gzip +97,
  Brotli +45; lazy chunks are unchanged.
- **Independent review:** read-only review initially found that WebKit proved
  disabled geometry but not enabled activation/focus/history parity. The final
  two-engine enabled flow closes that gap with real Tab/Option+Tab focus,
  pointer Undo/Redo, Enter Undo, Space Redo, and fingerprint checks. Final
  complete-diff disposition is **PASS — no actionable findings**; the reviewer
  confirmed the separate starting mobile flex collision does not occlude the
  history targets and should not broaden this no-redesign patch.
- **Scope boundary and remaining evidence:** no Full E2E, push, deployment,
  integration branch, dependency, lockfile, public-share implementation,
  history behavior, workflow, ruleset, runner, secret, or external setting is
  changed. Visual inspection reconfirmed an unrelated starting-SHA mobile
  workspace/right-action flex-group collision (including the `New plan` action);
  redesigning or relocating those controls is outside this bounded remediation.
  The history targets and their immediate neighbors do not overlap. GitHub
  ruleset enforcement remains external and unverified.
- **Rollback:** revert the single focused implementation commit, rebuild, then
  rerun the command-bar accessibility matrix, Consumer placement file, compact
  desktop toolbar spec, design cleanup, required-test truthfulness, code quality,
  lint, typecheck, critical-required, Phase 8, strict build, and the clean-source
  responsive public-share required gate. No data or external rollback is needed.

### Production certification dependency lifecycle — 2026-08-15

- **Disposition:** bounded harness defect corrected on
  `fix/production-certification-dependency-binding-order`; it is not a product
  P0/P1 and does not change the existing product queue.
- **Closed platform gap:** physical role dependencies now move from
  `not-installed` to `installed` only through sealed evidence and the atomic
  `worktree-dependencies:bind` state transition. Source checks, build dispatch,
  and development-browser discovery cannot precede binding. Drift fails closed.
- **Preserved evidence:** `CH-0015I-final-20260815T105213Z-cd21d61f` remains
  failed and unchanged. A new exact-head certification and final CH-0015
  closure audit remain pending after authorized integration.
- **Rollback:** revert the single focused harness commit. Do not repair or reuse
  the historical state/evidence root.
