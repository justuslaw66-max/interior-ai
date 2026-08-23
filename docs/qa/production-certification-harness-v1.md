# Production Certification Harness v1

## Archive-preflight auth and abort-attribution correction — 2026-08-22

The retained rehearsal attempt remains failed and is not resumed, retried,
reconciled, or rehabilitated. The primary archive failure is classified
**D — MIXED**: the archive child environment projection leaked the raw provider
pair, while artifact validation interpreted the archive wrapper's sealed
parent transport as though it were the historical projected build child.
Those committed defects are respectively
`ARCHIVE_PREFLIGHT_STAGE_ENVIRONMENT_PROJECTION_DEFECT` and
`BUILD_AUTH_CONTINUITY_VALIDATOR_CONTEXT_DEFECT`. No narrower committed
launcher-to-wrapper parent contract is proven, so a parent-transport defect is
not inferred. The restricted archive invocation is separately classified
`OPERATOR_ARCHIVE_EXECUTION_CONTEXT_ROUTING_DEFECT`; the wrapper already owns
automatic cleanup in its invocation context and no committed cleanup delegation
defect is inferred.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are now controlled, secret,
non-portable stage capabilities. They are admitted only to the canonical auth
preflight and build child; the Phase 8, runtime-smoke, browser-owner/discovery,
and nested artifact-product-server app execution paths; and the deterministic
production-evidence simulation that validates staging configuration with
placeholders. Their values are never recorded in projection metadata. Archive,
doctor, and every other unrelated child strip them. Archive artifact validation
consumes the persisted safe build-auth continuity record; projected raw-value
continuity is cross-checked only for an actual bound build-stage child. A sealed
archive wrapper parent can therefore preserve private outer-session transport
without exposing it to the archive child or being reinterpreted as build
evidence.

Automatic database abort now checkpoints the original stage failure before its
first cleanup inspection. If that inspection is denied, the portable stage
result retains the original precondition classification and records the cleanup
failure separately from the physical lifecycle evidence. A precondition result
may bind the resulting state SHA transition only when a fully validated
automatic-abort record proves that original failure, cleanup outcome, and
non-rehabilitation. Later cleanup success never changes the retained attempt's
failed certification status.

## Auth-preflight failure-evidence retention correction — 2026-08-22

The retained failed attempt remains unchanged as
`AUTH_PREFLIGHT_INNER_FAILURE_UNATTRIBUTED`,
`PRECONDITION_ORCHESTRATION_FAILURE`, and
`consumedSubstantiveGate=false`. Its exact fixture-session manifest and private
transport prove one successful generation event, but the committed outer owner
placed every command-result sidecar in its disposable orchestration root and
unconditionally removed that root on failure. The earliest post-generation
boundary therefore cannot be attributed beyond export result publication and
validation. No HTTP, database, or later-stage failure is inferred.

This correction is classified as **H —
AUTH_PREFLIGHT_FAILURE_EVIDENCE_CONTRACT_DEFECT** and is committed-source
owned. For a caller-owned canonical fixture session,
`scripts/run-ci-auth-fixture-session.mjs` now creates the physical mode-0700
`auth-preflight-results` directory under that already private external session
root. The existing versioned result JSON and SHA-256 sidecars for export,
validate-existing, production-misuse-existing, and the composed database
preflight wrapper are published there. The disposable orchestration root and
its private `GITHUB_ENV` are still removed. Task-owned qualification sessions
retain their existing cleanup behavior.

If the database/worktree/server helper fails before the normal composed wrapper
can be successfully published and validated, it now publishes the separate safe
`interior-ai.auth-preflight-orchestration-failure.v1` receipt beside the
expected wrapper path. That checksummed receipt binds the candidate, fixture
session aggregate, and invocation nonce digest; identifies the earliest safe
orchestration boundary; and records database, workspace, child-result, and
composed-result cleanup/publication status after committed cleanup. A partial
or invalid normal-result JSON cannot suppress this receipt. The database
attribution also retains the safe lifecycle state, failure mode and
classification, evidence digest, and separate results for plan, provision,
migrations, initial verification, scoped-role/private-sidecar creation, stage
binding, and projection. It contains
no raw provider value, auth secret, database URL, password, cookie, session,
CSRF value, or private path. It does not substitute for a successful auth
result.

The focused regression drives the exact canonical outer command with a safe
auth-secret alias mismatch before database creation. It proves the successful
export result and the structured validation failure both remain complete,
checksummed, candidate/session/nonce-bound, and free of raw provider values
after orchestration cleanup. A separate ownership assertion proves task-owned
success evidence is removed with its task root. An exact imported real-helper
failure uses an in-memory database adapter and injects a safe exception at the
committed private-sidecar activation checkpoint after plan, provision, and
migration execution. It proves the receipt distinguishes that precise database
substage, survives beside a deliberately partial normal-result JSON, and
remains after the private inner result root is removed. No live database is
touched by that focused regression. The miniature qualification repository
copies the tracked migration inventory required by this lifecycle regression;
it does not execute a live database lifecycle. This correction does not replay or rehabilitate
the failed rehearsal and does not change application auth, database, server,
route, or cleanup semantics.

## Auth-preflight tracked-output ownership correction — 2026-08-21

The bounded ownership audit classifies the retained failure as **D — MIXED**.
The task-local rehearsal launcher selected the canonical candidate checkout as
the auth-preflight working directory, while the committed real-preflight helper
also reused its caller working directory and accepted success without owning or
validating tracked generated output. The retained attempt remains unchanged as
`AUTH_PREFLIGHT_TRACKED_SOURCE_MUTATION_OWNERSHIP_UNRESOLVED`,
`PRECONDITION_ORCHESTRATION_FAILURE`, and
`consumedSubstantiveGate=false`; its later manual source restoration is not
rehabilitation and no rehearsal is part of this correction.

`scripts/ci-auth-preflight-worktree.mjs` now owns a disposable detached
exact-head worktree bound to the candidate commit/tree and consumed fixture
session identity. Only that worktree receives the auth server. The owner seals
the canonical source state and `tsconfig.json`, accepts either no tracked
change or the exact deterministic Next.js addition
`.next/dev/dev/types/**/*.ts`, rejects staged, ordinary-untracked, symlink, or
other tracked output, removes only its exact task-owned worktree, proves the
registration absent, and rechecks that the canonical source is byte-identical.
The real preflight cannot publish success without this terminal evidence and
database absence proof. The outer canonical auth command emits a redacted
`AUTH_PREFLIGHT_WORKSPACE_RESULT` record for retention by its caller.

The focused regression matrix covers exact-head detachment, canonical-source
immutability, deterministic mutation containment, clean no-output operation,
staged/untracked/symlink/unexpected-output rejection, exact cleanup, foreign
worktree preservation, contract tamper rejection, and absence of raw paths or
private values. Doctor and deterministic simulation register the new owner.
Fresh rehearsal, immutable final certification, integration, push, deployment,
and CH-0015 closure remain pending.

## Auth fixture continuity correction — 2026-08-20

The latest failed static discovery is preserved unchanged as
`COMMITTED_COMMAND_MODE_INCONCLUSIVE`,
`PRECONDITION_ORCHESTRATION_FAILURE`, and
`consumedSubstantiveGate=false`. The correction establishes one external
exactly-once auth fixture session, keeps `ci:auth-fixture:export` as the sole
canonical generator, and makes explicit validation, expected-negative
production misuse, database-backed auth-session preflight, and build projection
consume that same session and provider digests.

The build parent consumes with its sealed candidate commit/tree rather than an
ambient handoff, rejects conflicting ambient identity, and projects the
existing raw pair with an explicit application-auth activation scope. The
private session root is inventoried but prohibited from the build child and
all unrelated stage children. Qualification-only unbound artifact evidence is
explicitly ineligible and fails outside qualification. Independent read-only
review is **PASS**. Exact clean committed-head qualification on implementation
commit `54401bfeff100e59ffc7412197d0816858ada0bf`, tree
`1ad58ea5b661e659b43393395f6b083d82bc54bd`, returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; the final handoff records the
required rerun for the documentation-only follow-up.

The canonical command is `npm run certification:auth-preflight`; internally it
runs export, validate-existing, production-misuse-existing, and the isolated
database lifecycle plus preflight-existing. The preflight database remains
`AUTH_SESSION_PREFLIGHT_ONLY` and cannot be reused by rehearsal. Raw values
remain in the external mode-0600 transport. `preflight-local` is advisory-only.

Focused exactly-once, structured-result, database lifecycle, build-continuity,
doctor, simulation, and qualification owners are registered. A fresh rehearsal,
immutable final certification, integration, push, deployment, and CH-0015
closure remain pending. No rehearsal was started by this correction.

## Canonical certification stage-command result consumer — 2026-08-19

The preserved read-only audit remains exactly
`COMMITTED_CERTIFICATION_STAGE_RESULT_CONSUMER_NOT_EXPOSED`; the source defect
classification is `CERTIFICATION_WRAPPER_RESULT_FRAMING_CONTRACT_GAP`. The
failed rehearsal
`REHEARSAL_ONLY-NOT_RELEASE_CERTIFICATION-NOT_VALID_FOR_INTEGRATION-CERT-20260819T072721Z-2635f1cc6d80`
was not resumed, reconciled, rerun, or reused.

The selected transport is one explicitly framed final stdout record:
`INTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 <canonical-json>`. This option is
safe because every real wrapper waits for synchronous/awaited owners and all
child streams to close, publishes durable evidence and the sealed physical
state first, waits for failure cleanup, and writes one terminal record after
all other stdout. A sidecar would duplicate authority and is unnecessary.
Stdout and stderr remain complete human/nested-process logs; earlier unframed
JSON is never semantic authority. Missing, malformed, competing, non-final,
or trailing frames fail closed. The archive-child backward-search helper
remains unchanged and is prohibited for wrapper results.

`scripts/production-certification-stage-result-contract.mjs` is the sole
owner of schema
`interior-ai.production-certification-stage-command-result.v1`, its aggregate
SHA-256, the 26 state-backed command/mode mappings, and safe framed parser.
The schema binds certification and candidate ID, commit/tree, harness and
result-contract hashes, command/mode, stage/attempt, invocation nonce,
passed/failed/precondition result, classification, consumed gate, child and
wrapper exit/signal/spawn status, pre/post state SHA-256, path
classification, evidence IDs/relative paths/hashes/completion markers,
timestamps, and the aggregate hash. It contains no state path, private
sidecar path, raw environment, credential, cookie/session, or database URL.
Validation reports are recursively redacted and resealed before result
construction, and the producer runs the complete result schema/privacy check
before the frame can reach stdout.

`scripts/production-certification-stage-result-consumer.mjs` owns the
importable process-and-stream-close consumer and validation-only
`certification:stage-result:validate` CLI. It retains both logs, accepts only
the frame, independently hashes canonical physical state and every referenced
evidence file, runs the canonical state validator, matches exact
stage/attempt/status/classification/consumption/process identity, validates
safe state-validation details, and returns only the exact physical next-state
SHA for propagation. The wrapper now publishes success only after its durable
post-state and publishes failure only after the failed state/evidence and
non-rehabilitating database cleanup are settled.
An explicit abort-cleanup result is failure-authoritative: it binds the
lifecycle-retained original stage, attempt, classification, consumed bit,
failed-state SHA, and evidence descriptors, and cannot imply that a consumed
failure is safely retryable. Non-stage and stage-precondition frames require
zero consumption and null child/spawn results unless physical state proves a
completed stage attempt.

The focused 25-case matrix covers npm prose, multiline Prisma logs, earlier
JSON-looking logs, missing/malformed/competing/trailing frames, pending state,
missing/failed/tampered evidence, cross-run/candidate/commit, stale nonce,
state/stage/attempt/consumption mismatch, nonzero consumed failure, and
signal/spawn truthfulness, retained cleanup authority, producer privacy, and
consumable redacted invalid-state reports. Deterministic simulation drives the actual framed
source-validation wrapper through all 19 checks, proves generated-output
cleanup, consumes the exact next-state SHA, and stops at the pending build
boundary. Doctor requires the owner, consumer, CLI, regression, physical
state/evidence validation, unchanged auth/database channels, and absence of a
copied/backward parser before resource creation.

Auth raw fixture export remains private `GITHUB_ENV`; auth semantic results
remain structured sidecars. The database plan remains one complete canonical
stdout JSON document. No product/UI, Floor Plan, auth endpoint, telemetry,
model, runtime-readiness, archive-policy, Phase 8, Playwright assertion,
database provisioning, Prisma, migration, dependency, lockfile, or workflow
behavior is changed; only abort-result failure attribution is strengthened.
Fresh rehearsal, immutable final certification, integration, push,
deployment, and CH-0015 closure audit remain pending. Exact clean committed-
head qualification on implementation commit
`fc75748cbe181e75fa2393bb161c76126f15cf53`, tree
`2dd7c0da34e8ae7ab8bf68d2ccf9d5ece21bc355`, returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; this documentation-only
follow-up requires the same exact-head rerun before handoff.
Independent read-only review returned **PASS** after verifying physical
cleanup/spawn bindings, the producer privacy boundary, and unchanged
auth/database result-channel owners.

## Auth-session preflight database correction

The pre-correction stop remains
`PRECONDITION_ORCHESTRATION_FAILURE` / `consumedSubstantiveGate=false` and is
not repaired, reconciled, resumed, or reused. The bounded correction adds the
explicit `auth-session-preflight` database stage, preflight-only invocation and
database identity, canonical plan/provision/migrate/initial-verify/project/
final-inspect/drop/absence orchestration, structured auth-result database
evidence, and normal/abort cleanup. The auth helper retains auth sequencing and
result ownership but contains no handwritten database SQL or connection URL.

The exact helper orchestration path owns a 27-case fail-closed matrix,
including server-before-listener, readiness, invalid-session,
structured-result publication, active-session termination, normal-cleanup,
and repeated-abort failures. Simulation parses the exact named-case result
rather than inferring those claims from a generic success marker. Failure
evidence requires original-failure retention, non-rehabilitation, role/drop/
absence proof, and recovery-root retention whenever terminal absence cannot be
proved.

The focused regression owner is
`test:production-certification-auth-preflight-database`; the focused real owner
and canonical orchestration command are respectively
`test:ci-auth-fixture-real-preflight` and
`certification:auth-session-preflight`. Doctor, deterministic simulation, the
production-certification contract gate, and committed-head qualification all
register the bridge. Simulation remains ineligible for real certification and
proves a distinct later rehearsal database identity. Required-test inventory
is 27 gates and 394 classified sources.

Final independent read-only review passed with no actionable finding. Exact
clean committed-head qualification returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; this is source qualification
only and does not certify or promote an immutable release artifact.

No product/auth endpoint behavior, Prisma schema/migration, dependency,
lockfile, workflow, Phase 8 threshold, browser product assertion, runtime
readiness, archive policy, or Floor Plan behavior changes. A fresh rehearsal,
immutable final certification, integration, push, deployment, and CH-0015
closure audit remain pending.

## Canonical auth command result channel — 2026-08-19

The preserved channel-mapping result remains exactly
`COMMITTED_RESULT_CHANNEL_INCONCLUSIVE`. The certification-infrastructure
classifications are `COMMITTED_AUTH_RESULT_CHANNEL_MISSING`,
`AUTH_PREFLIGHT_STRUCTURED_EVIDENCE_CONTRACT_GAP`, and
`AUTH_SESSION_PREFLIGHT_FAILURE_EVIDENCE_CONTRACT_DEFECT`.

`scripts/ci-auth-fixture-result-contract.cjs` now owns the versioned
`interior-ai.ci-auth-fixture-command-result.v1` schema, explicit authorized
external destination, exclusive atomic writer/checksum, and canonical reader.
Provider export keeps raw values only in private `GITHUB_ENV`; its sidecar is
safe completion metadata. Environment validation no longer relies on prose.
Production misuse requires the exact safe production-prohibition code and
structured child proof rather than any nonzero exit. Local/CI auth-session
preflight retains safe server lifecycle/stream, session status/content
type/body hash and exact signed-out `null`, remaining route-contract,
observed-network/no-leak, and post-close termination/port-release evidence
before discarding private process memory. Nested invocation, process, session,
failure, and cleanup evidence is cross-bound to the command and top-level
identity; rejected or contradictory kill/close outcomes cannot pass. Sealed
canonical bytes are schema- and raw-plus-trimmed-private-value-validated before
publication. External publication accepts only resolver-issued destinations
under a root disjoint from every worktree, is exclusive, and revalidates its
exact paths and physical parent; workflow readers consume both
success and failure sidecars before propagating the captured command status.
Stdout/stderr remain human logs only.

Doctor registers the owner and reader; deterministic simulation exercises
success, failure, expected-negative, stale/cross-run/tamper, cleanup, and leak
cases; committed-head qualification includes the focused matrix and one real
task-owned preflight with a disposable loopback database. The complete command
matrix, schema, destination lifecycle, and rejection policy are in
`docs/qa/ci-auth-fixture-result-contract-v1.md`.

Exact clean code head `ac0f981993deae1d0783eb17da4e5e5cfa554ae9`, tree
`0d597321c4f2f6744287b1807836858ef230564c`, returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`. Independent terminal read-only
review passed with no actionable findings. This remains source qualification,
not rehearsal or final-certification authority.

Database-plan JSON remains on stdout from its existing lifecycle owner.
Certification-stage result routing remains wrapper plus sealed physical
state/evidence. No rehearsal was resumed or started. A fresh rehearsal,
immutable final certification, integration, and CH-0015 closure audit remain
pending.

## Source-validation database environment projection — 2026-08-18

The retained failed source-projection rehearsal remains closed as
`CERTIFICATION_REHEARSAL_FAILED_CLOSED` / `SOURCE_CONTRACT_FAILURE`, with zero
source child attempts and `consumedSubstantiveGate=false`. Resource
preparation, all 19 doctor checks, exact disposable database planning,
provisioning, 43 migrations, 33 initially empty application tables, dependency
installation/binding, abort cleanup, database absence, state-SHA continuity,
downstream invalidations, and the terminal physical state remain historical
facts. This correction does not resume, reconcile, reuse, or mark that
rehearsal passed.

`resolveCertificationDatabaseStageEnvironment` in
`scripts/production-certification-database-lifecycle.mjs` is the canonical
private database-binding resolver. It rereads and validates the sealed
lifecycle evidence, exact certification/candidate commit/tree, current state
binding and evidence hash, generated database identity, active lifecycle with
provision/migration/initial-empty history, exact stage binding, approved
loopback target, and canonical target database. Provisioning creates a
lifecycle-scoped login with `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`;
the raw target is retained only in a mode-0600 private worktree-root sidecar,
whose hash is sealed into lifecycle evidence. Stage binding also connects with
that role and proves the live exact target and absence of admin capability. A
stale, foreign, failed,
dropped, non-loopback, cross-database, or ambient-override binding fails before
a source child starts. Durable role-creation receipts authorize cleanup of only
task-created or ambiguously task-created roles; a pre-existing same-name role
is retained as a foreign collision. Only the stage projector receives the raw target URL;
portable state, metadata, errors, and evidence retain names, classifications,
and hashes, never raw URLs or passwords. Source stdout/stderr are captured only
in parent memory, sanitized before exclusive evidence writes, then scanned again
by the evidence validator; detecting a raw URL or the exact private password
makes an otherwise-successful zero-exit check fail closed.

The real source runner now validates/binds the database, installs and atomically
binds source dependencies, resolves the private database capability, applies
the `source-validation` profile, and passes the projected environment to
`sourceValidationStageEvidence`. It no longer passes `context.environment`.
`DATABASE_URL` is an inventoried, non-portable secret capability: the database
profiles below receive it through stage inputs owned by the projector, while
database-free profiles strip and record an ambient occurrence. Parent-only
`CERTIFICATION_DATABASE_ADMIN_URL` and lifecycle/drop controls never enter a
child environment, and the child credential itself has no create-database,
create-role, superuser, session-cleanup, or database-drop authority. The nested
artifact server accepts it only from the certified runtime projection and
rejects ordinary developer-shell database URLs.

| Stage/profile | Database lifecycle | Private binding owner | Projection owner | Expected identity | Portable evidence |
|---|---|---|---|---|---|
| `source-validation` / qualification profile | active after provision, 43 migrations, initial-empty verification, exact source stage binding | database lifecycle owner | real runner `stageChildProjection` plus per-check projector | state-bound certification, candidate, commit/tree, database name/identity and lifecycle evidence hashes | profile/contract hashes and environment-name inventory only |
| `build` | active and exact build stage binding | same | `stageChildProjection` | same lifecycle identity | names/hashes only |
| `phase8` | active and exact Phase 8 binding | same | `stageChildProjection` | same lifecycle identity | names/hashes only |
| `runtime-smoke` and nested `artifact-product-server` | active and exact runtime binding | same | runner projection, then the artifact server profile | same lifecycle identity | names/hashes only |
| production/development browser owner and discovery profiles | active and exact browser-owner binding | same | `stageChildProjection` | same lifecycle identity | names/hashes only |
| deterministic `simulation-production-evidence` | qualification-only synthetic build evidence | simulation fixture owner | dedicated simulation projector | synthetic fixture database identity only | names/hashes only |
| doctor, archive, final-standalone, continuity, integration-ready, qualification control | no child database capability | parent lifecycle only where applicable | stage projector strips `DATABASE_URL` | no child database identity | stripped-name inventory only |

`scripts/test-production-certification-source-database-projection.mjs`
constructs the current real state and lifecycle shapes with a task-owned private
database fixture, omits parent `DATABASE_URL`, and invokes the actual
`runSourceValidationStage` path. An instrumented historical copy restores only
the old `context.environment` handoff and proves the missing-name failure occurs
before check 1 with zero consumption. The corrected probe proves check 1 receives the exact
lifecycle target and neither admin nor lifecycle controls; one intentional
check failure proves truthful attempt/consumption accounting. It also rejects
unprovisioned, incomplete-migration, missing-initial-verification, failed,
dropped, stale, cross-certification/candidate/commit/tree/database, missing or
foreign private-connection, non-loopback, descriptor-hash, and ambient foreign
URL states before another source child can start. The stage-environment matrix
proves every database-free profile strips the capability and that only the eleven
declared database profiles require it. The probe deliberately prints its URL;
retained stdout/stderr contain only the redaction marker, and state/evidence/
errors are scanned for raw connection material. Regression case 34, doctor, deterministic
simulation, and committed-head qualification all register this owner. No
handwritten task-driver `DATABASE_URL` is required.

## Real-runner stage-order import regression

The canonical stage-order owner is the frozen string array
`CERTIFICATION_STAGE_ORDER` exported by
`scripts/production-certification-contract.mjs`. State, transition validation,
doctor, simulation, the CLI/qualification owner, and the committed real runner
must import that same binding; no runner-local list or fallback is permitted.
The real runner's contract import is acyclic because the canonical contract's
transitive import graph does not reach the real runner.

`scripts/test-production-certification-stage-order.mjs` owns the exact dispatch
regression. It loads an instrumented copy of the committed real runner rather
than a helper-only substitute, supplies a task-owned sealed state-v4 fixture,
and stops at the database stage-binding boundary before dependency installation
or a substantive source check. The historical
`ec56e6e7d680ac768624f565cee422d091a78642` source must fail there with
`CERTIFICATION_STAGE_ORDER is not defined`; the corrected source must resolve
`source-validation` at canonical index 1, after passed `doctor`, and reach the
canonical database dispatch with the source attempt still zero. No production
build, server, browser, or full dependency installation is part of this test.

Doctor and deterministic simulation use the same import/export coherence
guard. It proves one exporting owner, canonical imports in doctor, simulation,
qualification, state, and real runner, identical order hash, complete known
runner-stage inventory, no import cycle, and registration in the historical
matrix and committed qualifier. Tamper coverage rejects missing import, copied
list, reorder, omission, duplicate, and unknown stage. These checks do not
change the 12 canonical stage names or order.

## Repository-owned disposable database lifecycle — 2026-08-17

The harness now has one high-level database owner:
`scripts/production-certification-database-lifecycle.mjs`. The complete
versioned contract and operator runbook are in
`docs/qa/production-certification-database-lifecycle-v1.md`.

The preserved preflight remains `PRECONDITION_ORCHESTRATION_FAILURE` /
`COMMITTED_DATABASE_LIFECYCLE_OWNER_ABSENT`, non-consuming, unchanged, and not
resumable. `gate:a3:db` remains only the lower-level merge-required migration
primitive; certification never uses its broad caller-selected/reusable target
contract as lifecycle authority.

The canonical order is database plan → environment envelope → state init →
resource preparation → doctor → exact generated database provision and 43
migrations → initial-empty proof → bound source/build/Phase 8/runtime/browser
stages → final-empty proof → exact session release/drop/absence → final
standalone/continuity. Normal and abort paths seal the same
`interior-ai.production-certification-database-lifecycle.v1` evidence. Initial
or final row leakage is recorded and fails closed; no generic deletion makes it
pass. A durable pre-create authorization closes ambiguous-success recovery,
while an observed duplicate revokes ownership and is never dropped. Semantic
transition/invariant validation rejects resealed impossible histories. Sealed
revision ancestry lets state recover only an exact stale lifecycle binding
after a CAS loss. Doctor repeats live catalog absence; signal and failure
cleanup serialize after the active owner and checkpoint partial cleanup facts.
Abort cannot rehabilitate a failed run or erase a previously proved
final-empty result.

## Canonical report-parent preparation owner — 2026-08-16

The preserved rehearsal
`REHEARSAL_ONLY-NOT_RELEASE_CERTIFICATION-NOT_VALID_FOR_INTEGRATION-CERT-20260816T131707Z-16ae9ed`
and candidate
`REHEARSAL_ONLY-NOT_RELEASE_CERTIFICATION-NOT_VALID_FOR_INTEGRATION-CANDIDATE-20260816T131707Z-16ae9ed`
remain failed, read-only, and ineligible for resume or reuse. State, doctor
attempt 001, all three stage-worktree identities, the missing report-parent
issue, the separately observed process-ownership issue, downstream
invalidations, storage, and cleanup records are unchanged. The doctor result
remains `PRECONDITION_ORCHESTRATION_FAILURE` /
`CERTIFICATION_REHEARSAL_FAILED_CLOSED` with
`consumedSubstantiveGate=false`. The host diagnostic disposition is
`A — CONTROL_PLANE_RECOGNIZED_CORRECTLY`; this correction does not change
process ownership, names, ancestry, helper exclusions, `ps`, `lsof`, or ports.

`state:init` now seals the complete v1 resource plan from the current contract
matrix and canonical path resolvers without creating any report target or
parent. `npm run certification:prepare-resources` is the single committed
parent owner. Under the existing state lock and caller-supplied state SHA it
rederives the same path set, creates only missing physical parents, runs an
atomic write/fsync/rename/read/unlink sibling probe for every destination,
proves both probe names removed, proves every final target absent, writes one
sealed portable preparation record, and atomically binds it into state v4. A
second invocation validates the same identity without writing a duplicate.
Changed state, candidate, contract, root, path set, target, parent type,
symlink chain, destination ownership, evidence identity, or seal fails closed.

The lifecycle is now:

`state:init` → `certification:prepare-resources` → preparation validation →
`doctor` → substantive stages.

Doctor remains read-only. It still applies the canonical destination resolvers
and absent-target checks, then requires the preparation evidence to match the
same state, candidate, contract matrix, path-contract hashes, external-root
identity, and destination-set hash. It never creates or repairs resources.

### Complete pre-doctor destination ownership matrix

All rows use external-root owner `state:init/operator`, parent owner
`certification:prepare-resources`, canonical path owner
`scripts/playwright-report-path.mjs`, require an absent final target and atomic
sibling probe, and retain only portable root-relative classifications. Runtime
rows share `runtime-smoke/`; browser rows may use distinct configured parents;
archive rows share `archive/`. Physical roots never enter portable evidence.

| Stable destination ID | Required stage | Type / path source | Shared parent | Cleanup or retention owner |
| --- | --- | --- | --- | --- |
| `runtime-smoke-report` | `runtime-smoke` | JSON / `CERTIFICATION_RUNTIME_REPORT_PATH` | runtime bundle | runtime smoke / final standalone |
| `runtime-smoke-phase-timings` | `runtime-smoke` | JSON / `CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH` | runtime bundle | runtime smoke / final standalone |
| `runtime-smoke-start-marker` | `runtime-smoke` | JSON / canonical `runtime-smoke/product-test-start.json` | runtime bundle | runtime smoke / final standalone |
| `runtime-smoke-summary` | `runtime-smoke` | JSON / `CERTIFICATION_RUNTIME_EVIDENCE_PATH` | runtime bundle | runtime smoke / final standalone |
| `phase8-summary` | `phase8` | JSON / `CERTIFICATION_PHASE8_EVIDENCE_PATH` | configured parent | Phase 8 / final standalone |
| `phase8-raw-root` | `phase8` | directory / canonical `phase8` | external root | Phase 8 / final standalone |
| `browser-floor-plan-upload-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-pro-visual-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-guest-save-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-my-designs-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-public-share-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-cart-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `browser-retailer-report` | `browser-owners` | JSON / owner environment path | configured browser parent | browser owners / final standalone |
| `archive-plan` | `archive-preflight` | JSON / canonical `archive/plan.json` | archive parent | archive preflight / final standalone |
| `archive-stage-root` | `archive-preflight` | directory / canonical `archive/stage` | archive parent | archive / final standalone |
| `archive-compressed` | `archive` | tar+gzip / canonical `archive/candidate.tar.gz` | archive parent | archive / final standalone |
| `archive-extracted-root` | `extracted-archive-preflight` | directory / canonical `archive/extracted` | archive parent | final standalone / worktree cleanup |

The state file is not a preparation target: `state:init` owns its existing
physical file. Doctor, source-validation, build, continuity, and final
aggregates remain stage-owned retained evidence and are not pre-doctor report
destinations. Preparation evidence schema
`interior-ai.production-certification-resource-preparation-evidence.v1` binds
the certification/candidate/commit/tree, pre-mutation state SHA, harness,
contract and per-path hashes, ordered IDs, destination aggregate, portable
paths/classes, parent existence/creation and realpath class, containment,
target absence, writability, probe result/hash/removal, timestamps, completion,
aggregate digest, and self-seal. No credential, raw environment value, or
machine-local absolute root is retained.

The deterministic simulation begins with all 17 parents absent, proves direct
doctor failure on the actual missing-parent resolver, invokes the canonical
preparer, proves targets/probes absent, validates the preparation, retries the
actual doctor successfully, and continues through integration readiness. It
also invokes the actual doctor with present parents but omitted preparation,
and with a target created after preparation; both fail closed before the
successful retry. The focused resource suite adds outside-root,
repository/worktree, relative/malformed,
symlink, file/unwritable parent, duplicate/type-conflict, stale-state/contract,
cross-rehearsal evidence, manual edit, and leftover-probe cases. Qualification
requires that suite plus the existing state/worktree/dependency/source-output/
continuity/runtime/journal/historical/artifact/truthfulness/lint/type/quality/
architecture/hygiene checks.

The focused required-test owner is
`npm run test:production-certification-resources`, backed by
`scripts/test-production-certification-resources.mjs`; the qualifier invokes
that source directly before simulation. The truthfulness manifest classifies
it in the risk-triggered `script-tests` inventory. That inventory is now 264
sorted paths with SHA-256
`403050babe473d84ac408f92c7b03b8c8880aab2a954ba474cd8c7aa59401133`;
direct manifest validation reports 27 gates and 387 classified sources. No
gate owner, required/advisory policy, skip/retry allowance, or workflow changed.

No product/UI, Floor Plan, telemetry, NFT tracing, browser product assertion,
Phase 8 semantic, dependency/lockfile, migration, database, workflow, Git
history, deployment, or external-system behavior changes. A fresh rehearsal,
real build, real Phase 8, runtime smoke, browser-owner matrix, final
certification, integration, and CH-0015 closure audit remain pending. Deferred
process hardening debt is recorded separately: narrow considered names,
name-based helper exclusions, fail-open command-status handling, and generic
issues without exact PID. The next rehearsal must use the same host-capable
inspection context as diagnostic A.

## Build generated-output lifecycle correction — 2026-08-16

Rehearsal `CH-0015I-rehearsal-20260816T091554Z-238b1fa` remains failed and
preserved at candidate commit `238b1fa744dee3c69aef492dfb7e355686da6385`,
tree `1d56b9315cd48858259f8f38db4e79372c4c812d`. Its strict production
build, production evidence validation, dependency remeasurement, and
`immediateBuild` physical snapshot completed successfully. After the build
action returned, managed-stage post-action worktree revalidation rejected the
ignored literal `next-env.d.ts` generated by Next 16.2.11. The recorded machine
classification is `ARTIFACT_CONTINUITY_FAILURE` with substantive consumption;
the operator classification is `CERTIFICATION_HARNESS_SOURCE_DEFECT`. This is
not a product build or snapshot failure, and no downstream stage ran.

The build owner now gives only that literal generated file an exact lifecycle.
It must be ignored, untracked, and have no filesystem entry before the
build-completion child opens the producer window. After the successful producer
and its in-command artifact and journal validation, it must be a no-follow
physical regular file whose bytes
match the current production Next type-declaration contract. The lifecycle
evidence binds the certification, candidate, commit, tree, Build ID, artifact,
manifest, journal hash, and journal nonce; it inventories the exact file and is
self-sealed. The owner then hash-validates and unlinks only `next-env.d.ts` and
proves absence before post-build dependency validation, the immediate physical
artifact snapshot, and managed-stage post-action worktree validation. `.next`
remains untouched and is still governed by production artifact continuity.

No ignored-path allowlist, `.d.ts` glob, worktree policy, product source,
dependency, assertion, threshold, timeout, retry, or skip is relaxed. The
canonical checkout's ignored files remain outside stage ownership and are not
read, copied, or changed by this lifecycle. Development-server ownership is a
separate browser-stage correction boundary and is not included in this build
correction. Exact clean-commit qualification and a fresh rehearsal remain
pending.

## Current semantic-journal compatibility policy — 2026-08-16

The current real certification path accepts exactly
`interior-ai.production-certification-state.v4`,
`interior-ai.production-artifact-evidence.v3` with validator 3, and
`interior-ai.production-artifact-semantic-event-journal.v2` with version 2.
`scripts/production-artifact-contract.mjs` owns the schema/version constants and
strict journal validator. The executing producer delegates to that validator;
Playwright propagates its returned identity; runtime raw report, timing,
envelope, archive preflight, final standalone, and continuity all verify the
same current identity. Journal v1, unknown/future versions, missing or
non-integer versions, extra/missing v2 fields, incomplete lifecycle state, and
nonce/candidate/commit/tree/Build-ID/artifact/hash mismatches fail closed.

The physical final-standalone CLI supports current state v4 only. Historical
state v1/v2 and journal v1 remain unchanged and are handled solely by the
explicit offline module
`scripts/production-certification-historical-evidence.mjs`; that compatibility
does not flow into current certification. Sealed state v3 is a predecessor and
is not accepted by the current final path. The deterministic current positive
fixture invokes the actual standalone CLI over an extracted physical artifact
and completes state-v4/manifest-v3/journal-v2, raw runtime report, timing,
runtime envelope, archive inventory, seven browser-owner summaries, and final
identity checks. Simulation also tampers raw/timing/envelope versions, archive
journal identity, nonce, and historical substitution.

The read-only blocker that led to this correction was found at candidate
`73d5c541c4171bf6c05b168e6bd29853b03ea011`, tree
`be98410f071a71a62311929a67cb2589783774e4`, before any certification resource
or gate was consumed. Its classifications are
`FINAL_RUNTIME_EVIDENCE_JOURNAL_SCHEMA_DRIFT` and
`CANONICAL_JOURNAL_VERSION_CONSUMER_MISMATCH`, not runtime-smoke failure.
Qualification returns `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`. No real
build, Phase 8, runtime smoke, browser matrix, Full E2E, integration, push, or
deployment is part of the correction. Exact-head certification and the final
CH-0015 closure audit remain pending.

## Runtime-smoke evidence-root correction — 2026-08-15

The exact candidate `d449afd0ff693ad8bd03932d13b768b961dceab4`, tree
`2af0f9c22cff576663174903494f904bdd4c4960`, was stopped by mandatory
read-only source review before any certification resource was created. No
certification ID, candidate ID, state, or evidence root exists for that review;
doctor and substantive stages did not run, and no source, Git, database,
build, archive, benchmark, runtime, browser, or integration mutation occurred.
It is a pre-certification source blocker, not a runtime-smoke test failure.

The blocker classifications are
`RUNTIME_SMOKE_TIMING_EVIDENCE_ROOT_CONTRACT_DEFECT` and
`STAGE_ENVIRONMENT_OUTPUT_CAPABILITY_OWNER_MISMATCH`. The runtime projector
correctly withheld parent-only `CERTIFICATION_EVIDENCE_ROOT`, but the timing
writer incorrectly required that absent parent capability even though the real
runner supplied the stage-owned `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` and an
absolute timing destination.

The selected owner classification is
`A — PLAYWRIGHT_EXTERNAL_ROOT_OWNS_ALL_RUNTIME_OUTPUTS`. The smallest coherent
source-owned bundle consists of the Playwright report, phase timings,
child-owned product-test start marker, and parent runtime summary beneath one
authorized external runtime directory. Readiness, post-readiness, browser, and
failure diagnostics are embedded in the report/timing evidence; inherited safe
stdout/stderr and server output are streams, not separately retained portable
files. Playwright's configured output directory remains transient execution
state and is not a final standalone input.

| Output | Canonical writer | Exact path input | Authorization | Portable retention | Creation/final rule |
| --- | --- | --- | --- | --- | --- |
| Playwright JSON report and embedded readiness/browser/failure diagnostics | Playwright JSON reporter | `PLAYWRIGHT_JSON_OUTPUT_FILE` | child-visible `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT`; parent certification root is absent | `runtime-smoke/playwright-report.json` plus SHA-256 | Existing parent, absent target; required by final standalone |
| Phase budgets, completion, and timing identity | `scripts/runtime-smoke-phase-budget.mjs` | `RUNTIME_SMOKE_PHASE_TIMINGS_PATH` | same child-visible external root and canonical v1 resolver | `runtime-smoke/phase-timings.json` plus SHA-256/binding | Existing writable parent, absent target, atomic single finalization; required and incomplete/absent invalidates runtime |
| Product-test start marker | `scripts/certification-playwright-start-reporter.mjs` | `CERTIFICATION_RUNTIME_START_MARKER_PATH` | same child-visible external root and canonical v1 resolver | `runtime-smoke/product-test-start.json` plus SHA-256 | Existing parent, absent target; required after actual runtime discovery |
| Runtime result envelope | `scripts/production-certification-real.mjs` | `CERTIFICATION_RUNTIME_EVIDENCE_PATH` | parent-owned certification lifecycle, prevalidated against the same physical external runtime root | `runtime-smoke/evidence.json` plus SHA-256 | Existing parent, absent target; required by state/final standalone |
| Safe stdout/stderr and product-server logs | parent process stream owner | no retained file path | parent orchestration | machine-local stream only | Not an independent final input; report/timing diagnostics remain authoritative |

`scripts/playwright-report-path.mjs` owns the side-effect-free
`interior-ai.runtime-smoke-evidence-root-contract.v1`. It validates an explicit
absolute stage root and explicit absolute output, exact output role/filename,
lexical and realpath containment, repository/worktree exclusion, physical
non-symlink parent, writability, and absent target. It returns the canonical
path, destination class, safe root-relative path, and contract/version hash;
portable evidence never serializes the machine-local absolute root.

The real runner preflights report, timing, marker, and summary destinations
before Playwright. The committed runtime profile passes only the external root,
exact paths, complete candidate/artifact/manifest/journal identity, and its
profile ID/hash. The timing writer uses that same contract, has no generic-root
or `.local` fallback, and cannot overwrite a final target. Final standalone
rehashes the timing file and requires its terminal marker, root contract,
portable path, certification/candidate/commit/tree/Build-ID/artifact/manifest/
journal identity, and runtime profile binding. Cross-run, cross-artifact,
wrong-root, wrong-profile, missing, incomplete, or tampered timing evidence is
rejected.

Phase names, phase boundaries, deadlines, runtime-duration measurement,
readiness/post-readiness behavior, budgets, and product assertions are
unchanged. Deterministic qualification exercises the real projector, real
runner preflight, and real timing writer without launching a browser, then
feeds the external timing evidence to final standalone. The exact clean-commit
qualifier result is `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; this is
source-platform qualification, not real candidate evidence. Exact-head real
certification and the final CH-0015 closure audit remain pending. Independent
read-only review returned `PASS` with no remaining actionable finding after its
simulation-preflight coverage finding was corrected and rechecked.

Status: transactional state-validation and pristine stage-worktree correction
implemented on the exact child of candidate
`cd2d426900916a1096fd0dab9380020db1c62671`, tree
`f783e8affd82c8fc6f933650b5cb59dedbbfea49`. The earlier CH-0015I
certification attempt remains invalidated and is neither repaired nor reused.
No real build, Phase 8 run, runtime/browser suite, or candidate certification is
performed by this correction. The bounded qualifier returned **A —
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`**.

This batch changes certification-platform ownership only. It does not change
product/UI behavior, Floor Plan Upload, GLB telemetry, NFT asset resolution,
semantic timestamp meaning, Playwright assertions/retries/workers/timeouts/
selectors, Phase 8 operations/samples/percentiles/thresholds/budgets,
dependencies, the lockfile, database schema, migrations, or application data.

## Preserved CH-0015I dependency-order failure

Certification `CH-0015I-final-20260815T105213Z-cd21d61f` and candidate
`CH-0015I-20260815T105213Z-cd21d61f` remain failed and preserved at candidate
commit `cd21d61fe0b0581144b3ce77aa091789ac915393`, tree
`566da9faccd85d7c8cc10bbe2c79a7ab25713f85`. Its state retains a null
source-validation dependency identity, while the post-install aggregate retains
the measured identity beginning `65dd2bef`. All 19 source children exited zero;
the stale comparison correctly produced `SOURCE_CONTRACT_FAILURE` with
`consumedSubstantiveGate=true` and downstream invalidation.

That evidence, state, doctor, child results, aggregate, review, retained
worktrees, and cleanup status are not repaired, resumed, rerun, or reused. The
new root-cause classifications are
`POST_INSTALL_DEPENDENCY_IDENTITY_BINDING_ORDER_DEFECT` and
`CERTIFICATION_WORKTREE_DEPENDENCY_STATE_LIFECYCLE_DEFECT`. A later exact-head
certification must use a new certification ID, candidate ID, state, evidence
root, and worktrees. Exact-head certification and the final CH-0015 closure
audit remain pending.

## Contract inventory

The machine-readable baseline is
`docs/qa/production-certification-contract.v1.json`. It records all 28 owners
from source validation through local fast-forward readiness, including the
canonical command, source owner, environment names, inputs, outputs, execution
location, lifecycle position, one-shot boundary, resumability, stop condition,
schema, identity fields, and pre-v1 gap. The baseline is bound to candidate
`5e956435c625cbb5be1887b3a20e9a947b43dce0`, tree
`6b8b7177e778e6338c2ff3036ff42fdea8dd1930`.

## State and identity

Historical `interior-ai.production-certification-state.v1` and `.v2` records
remain readable and unchanged. New cycles use
`interior-ai.production-certification-state.v4`, atomically replaced and sealed
with its own SHA-256. It binds the
certification ID, immutable candidate ID, commit/tree/exact parent, harness version and
source hash, journal nonce, Build ID, artifact, manifest, journal, verifier
closure, archive, inventory, Phase 8, runtime, seven browser-owner, continuity,
prior-stage input, command, attempt, exit/signal, classification, one-shot
consumption, completion, and three stage-worktree identity records. Credentials,
raw environment values, and machine-local worktree paths are never portable
state fields.

Stages are ordered and fail closed:

| Order | Stage | Canonical command |
| ---: | --- | --- |
| 1 | `doctor` | `npm run certification:doctor` |
| 2 | `source-validation` | `npm run certification:source-validation` |
| 3 | `build` | `npm run certification:build` |
| 4 | `archive-preflight` | `npm run certification:archive-preflight` |
| 5 | `archive` | `npm run certification:archive` |
| 6 | `extracted-archive-preflight` | `npm run certification:extracted-archive-preflight` |
| 7 | `phase8` | `npm run certification:phase8` |
| 8 | `runtime-smoke` | `npm run certification:runtime-smoke` |
| 9 | `browser-owners` | `npm run certification:browser-owners` |
| 10 | `final-standalone` | `npm run certification:final-standalone` |
| 11 | `continuity` | `npm run certification:continuity` |
| 12 | `integration-ready` | `npm run certification:integration-ready` |

Every stage is exactly one of `pending`, `running`, `passed`, `failed`, or
`invalidated`. Unknown stages, statuses, classifications, schemas, or evidence
members are rejected. A stage cannot start until all predecessors pass and all
bound hashes still rehash. Consumed substantive one-shot stages cannot be
silently restarted.

## Pristine stage-owned worktrees

Before `state:init` allocates any stage worktree, it validates the complete
environment and state target, exact clean source/candidate identity, all
resource destinations (including type/overlap/containment), the planned
database lifecycle binding, and the worktree-root plan. Allocation then uses
one invocation-private transaction ledger. A failure before durable state
publication rolls back only ledgered Git worktrees, registrations, sidecars,
and empty directories, and retains a portable
`interior-ai.production-certification-pre-state-failure.v1` receipt proving
the terminal registration and canonical-checkout results. The receipt is an
immutable create-if-absent file at the exact invocation-nonce-derived path; a
reused nonce fails closed without replacing history. It never fabricates
state for cleanup. Durable-state failures continue to use the existing
state-backed failed-run and continuity cleanup policy.

Every new certification cycle creates exactly three fresh detached Git
worktrees at the sealed candidate commit and tree:

| Role | Exclusive owners |
| --- | --- |
| `source-validation` | source checks and source-continuity evidence |
| `final-artifact` | install, build, archive, Phase 8, production runtime/browser owners, final standalone, and continuity |
| `development-browser` | cart and retailer development-server browser owners |

All three roots must be distinct physical directories outside the canonical
checkout, resolve to the same Git common directory, match the sealed candidate
commit/tree, contain zero ignored influential paths before use, and use
distinct physical `node_modules` directories. A canonical checkout, symlink,
realpath alias, wrong commit/tree, missing root, shared dependency tree, or root
bound to another certification ID is rejected before dispatch. The portable
state stores stable role/identity hashes; private evidence-root sidecars retain
machine-local realpath, filesystem, and dependency identities.

The canonical checkout is orchestration source only. Existing ignored files,
including `.env*`, `.local`, `.vercel`, reports, caches, and external-target
symlinks, are never inspected, copied, moved, deleted, or used by a stage. No
`git clean` operation is part of certification. Cleanup is an explicit owner
that removes only the three task-created worktrees after continuity. A terminal
abort retains the roots and private identities for separately authorized safe
operator cleanup. Cleanup is retryable after an interruption: a task-owned root
already removed by the interrupted cleanup is finalized from its sealed private
binding, while any surviving root is revalidated before removal.

## Worktree dependency lifecycle and atomic binding

New state v4 cycles give each role an explicit
`interior-ai.production-certification-worktree-dependency-lifecycle.v1` status:
`not-installed`, transient `installing`, `installed`, `failed`, or `removed`.
Initialization is exactly `not-installed` with a null identity and no install or
binding evidence. `installed` is valid only with a non-null identity, successful
completion record, and sealed
`interior-ai.production-certification-worktree-dependency-binding.v1` evidence.
Cleanup changes the role to `removed`; removed evidence cannot make a worktree
usable again. Historical state v1/v2 is validated under its historical schema
and is never silently reinterpreted as this lifecycle.

The shared installer records the canonical `npm ci --include=dev` child,
started/completed times, exit/signal, stdout/stderr hashes, Node/npm and npm
executable identities, package and lock hashes, a physical role-local
`node_modules` identity, full installed-package inventory, a recursive
implementation-file byte hash, top-level package resolution,
and a sealed exact proof of every ancestor/global Node module search root plus
the absence of `NODE_PATH`, symlink, cross-worktree, or ambient resolution.
Absolute paths remain in
private sidecars; portable evidence contains only stable identity hashes and
evidence-root-relative descriptors. Installation receives a minimal allowlisted
environment with npm global configuration locked to the platform null device,
user configuration resolved to a nonexistent child of that device, and
credentials, certification controls, `NODE_PATH`, and `NODE_OPTIONS` absent,
so retained child logs cannot disclose ambient certification secrets.

`worktree-dependencies:bind` is the sole durable binding owner. It requires the
caller's current state SHA-256, acquires the existing exclusive state lock,
rereads and rehashes state under the lock, validates every evidence and
certification/candidate/role/worktree binding, requires `not-installed`, and
performs a final physical remeasurement before it atomically replaces the
sealed state. The exact same installed identity may be
revalidated read-only. A different identity can never overwrite the binding.
Aggregate validators have no state-mutation authority.
Installation and binding receipts must fall within exactly one retained stage
attempt and no state transition may move durable time backward. A bind-time
remeasure race is atomically retained as terminal `binding-failed`; a later
invocation fails from that lifecycle before physical worktree inspection and
cannot run a second install. A non-consuming failure after a successful bind
may retry only through same-identity read-only revalidation; the complete prior
attempt remains and never-run downstream invalidations return to pending.
Direct npm-child identity and an enclosing wrapper failure are recorded
separately, so an outer signal after a successful nested install remains an
exact infrastructure failure rather than a contradictory child result.

The enforced role orders are:

1. Source validation installs, measures, seals evidence, binds state, rereads,
   retains the exact sealed binding-state receipt, revalidates, runs all 19
   checks, revalidates again, writes the v4 aggregate, and only then compares
   the aggregate identity with bound state. Retained passed or failed evidence
   must resolve that receipt and its exact state SHA.
2. Final-artifact preparation stops immediately after its one physical install;
   the harness binds state, records the journal v2 process handoff, and only
   then permits generated-source validation, build dispatch, artifact inventory,
   archive, Phase 8, or runtime/browser stages.
3. Development-browser installs and binds before Cart/Retailer Playwright
   discovery or server launch. Final-artifact and development-browser
   identities are revalidated immediately before discovery.

Source dependencies are remeasured after the checks, final-artifact dependencies
after the build and before and after production browser owners, and development
dependencies before and after Cart/Retailer. Root, lock, manifest, implementation bytes,
inventory, top-level
resolution, symlink, and isolation drift fails the current stage without a
second install or identity refresh.

The deterministic negative matrix injects implementation-byte changes through
the exported source, build, and browser stage owners and proves current-stage
classification, downstream blocking, and exactly one installation attempt.
Cleanup removes the physical roots, but final-state validation continues to
verify retained binding or failed-install evidence without remeasurement.
Retained search-root proofs are recomputed from the private worktree sidecar,
so empty, duplicate, or resealed proofs remain invalid after cleanup. Evidence
directory components are authorized as physical non-symlink directories before
any installer, binding-state receipt, check stream, or aggregate write.

## Nested auth-fixture regression isolation

The canonical `production-artifact-evidence-contracts` source check remains
`npm run test:production-artifact-evidence`. That command exercises build-auth
continuity and may run while an outer rehearsal provider context exists. That
real source check executes the deterministic
`test:ci-auth-fixture-session` package owner, which must not consume the outer
session: it creates an explicit copy, removes the complete
capability set derived from the canonical fixture-session, structured-result,
and stage-environment contracts, and spawns the same script with
`--isolated-auth-fixture-regression-child`. Global `process.env`, the source
stage profile, the outer private transport, and build/auth profiles are not
mutated.

The executable historical regression first proves that an unsanitized child
with one valid outer session and a different nested pair is rejected at the
first provider identity, `GOOGLE_CLIENT_ID`. The corrected child receives no
outer capability, generates one fresh task-owned session, validates through the
unchanged canonical consumer, removes only its own resources, and emits only
safe names and non-reversible hashes. The fail-closed matrix retains provider,
session ID/root/nonce/digest, transport, mixed-pair, candidate/result, duplicate,
cleanup, parent-mutation, missing-identity, and raw-value protections. Doctor
executes the environment-isolation projector against all 22 canonical
capabilities and requires the real source-check invocation/result linkage
before a real run. The generated simulation supplies the eight pre-install auth
commands with its fixture-owned offline TypeScript runner, then exposes one
explicit, awaited generated auth-result test entrypoint after dependency
installation. Exact clean corrected-head qualification returns
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`.
Independent terminal read-only review is **PASS** after the exact-owner cleanup
boundary and all earlier isolation/source-linkage findings were rechecked.

## Source validation

The machine-readable `sourceValidation.checks` array in
`docs/qa/production-certification-contract.v1.json` is the single ordered
owner. Its 19 checks cover production-artifact and certification contracts,
truthfulness and direct manifest validation, the complete Floor Plan required
closure and Upload static owner, telemetry bootstrap, critical-required,
design cleanup, zero-warning lint, TypeScript, quality ratchets,
Design/Floor Plan/Cabinetry architecture, tracked-artifact hygiene,
JavaScript/JSON/workflow/shell syntax, `git diff --check`, and Git source
hygiene.

`npm run certification:source-validation` directly spawns each canonical
command in the pristine `source-validation` worktree. Before and after every invocation it
rechecks commit, tree, and cleanliness. It retains stdout, stderr, and a
process-result file outside the candidate source, records the direct child
exit/signal without a pipe or wrapper, and stops on the first nonzero result.
The contract validator requires the display command and executable arguments to
be the same invocation and rejects weaker substitutions, shells, pipes, and
`tee` wrappers. A child that exits zero after changing source is retained as a
source-contract failure with its original child result and a nonzero stage
result.
The failed aggregate is still state-retained and validated as the exact
canonical stopped prefix; if any earlier substantive check ran, a later
non-substantive failure remains one-shot rather than becoming retryable.
The sealed
`interior-ai.production-certification-source-validation.v4` aggregate binds the
certification/candidate, harness and contract-matrix hashes, check-set hash,
stage-environment contract hash, ordered per-check profile IDs and profile
hashes, allowed/required environment-name-set hashes, value-policy hashes and
safe effective classifications, the certification-control and ambient-value
absence results, attempt nonce, ordered IDs and commands, timestamps, every
retained file hash, completion marker, and aggregate SHA-256. State validation reparses this
evidence and rehashes all files. A source identity descriptor alone is never
accepted, and earlier qualification evidence is never imported as a substitute.

### Source generated-output ownership

`docs/qa/production-certification-source-generated-outputs.v1.json` is the
machine-readable fail-closed owner. Every check declares expected tracked
modifications `none`. Unless the table names an output, expected ignored output,
producer, consumer, retention, cleanup, portable output bytes, and later-stage
influence are all `none`/not applicable. Output bytes never belong to a later
stage; the separate Floor Plan browser-owner prerequisite rebuilds its fixture
in that owner's assigned worktree.

| # | Check ID | Canonical command | Declared ignored output and lifecycle |
| --- | --- | --- | --- |
| 1 | `production-artifact-evidence-contracts` | `npm run test:production-artifact-evidence` | none |
| 2 | `certification-harness-contracts` | `npm run test:production-certification` | none |
| 3 | `required-test-truthfulness` | `npm run test:required-test-truthfulness` | none |
| 4 | `required-test-manifest-direct` | `node scripts/required-test-truthfulness.mjs check` | none |
| 5 | `floor-plan-required-closure` | `npm run test:floor-plan-required` | none |
| 6 | `floor-plan-upload-static-owner` | `npm run test:floor-plan-upload-accessibility-static` | `.next/cache/floor-plan-upload-browser-fixture`, directory; first producer and cleanup owner check 6; no source-check consumer reads the bundle and the later browser owner rebuilds it in another worktree; retain through the producer's closed stdout manifest and clean immediately after the owner command completes; file bytes, sizes, hashes, inventory, builder/config/source hashes, and cleanup proof are portable evidence |
| 7 | `telemetry-bootstrap-contracts` | `npm run test:runtime-smoke-telemetry-bootstrap` | none |
| 8 | `critical-required` | `npm run test:critical-required` | none |
| 9 | `design-cleanup` | `npm run test:design-page-cleanup` | none |
| 10 | `zero-warning-lint` | `npm run lint -- --max-warnings=0` | none |
| 11 | `typescript-typecheck` | `npm run typecheck` | `tsconfig.tsbuildinfo`, regular file; first producer canonical incremental `tsc`; no later consumer; owner/last lifetime/cleanup owner check 11; hash and size are portable evidence; clean immediately after check 11 |
| 12 | `code-quality-ratchets` | `npm run check:code-quality` | none |
| 13 | `design-architecture` | `node scripts/check-design-page-architecture.mjs` | none |
| 14 | `floor-plan-architecture` | `npm run check:floor-plan-architecture` | none |
| 15 | `cabinetry-architecture` | `npm run check:cabinetry-architecture` | none |
| 16 | `tracked-artifact-hygiene` | `npm run test:tracked-artifact-hygiene` | none |
| 17 | `source-syntax` | `node scripts/production-certification-source-continuity.mjs source-syntax` | none |
| 18 | `git-diff-check` | `git diff --check` | none |
| 19 | `git-source-hygiene` | `node scripts/production-certification-source-continuity.mjs source-hygiene` | none |

Before each owner, the exact path must be physically absent. After the direct
child, the runner inventories with `lstat`/no-follow semantics, compares the
Floor Plan directory to its single producer-emitted closed manifest, rejects
unknown ignored or ordinary-untracked paths, and seals
`interior-ai.production-certification-source-generated-output-evidence.v1`.
Cleanup verifies the current closed inventory against the sealed hashes, uses
only exact regular-file unlink plus exact empty-directory removal, and proves
absence. It never uses `git clean`, recursive cache deletion, the canonical
checkout, or `node_modules`. The terminal validator again permits only the
dependency-bound `node_modules` root and requires zero declared or undeclared
generated output.

## Stage environment capability contract

`docs/qa/production-certification-stage-environment.v2.json` is the canonical
machine-readable owner for certification child-process capabilities. Its schema
is `interior-ai.production-certification-stage-environment.v2`. It inventories
114 control names with canonical owner, classification, portability, secret
classification, and presence/activation semantics. It separately inventories
the five Floor Plan vision/local-OCR application inputs with accepted-value,
default, secret, and read-timing semantics. It defines profiles for
doctor, real and qualification source validation, build, each archive step,
Phase 8, runtime smoke, production/development browser owners and discovery,
final standalone, continuity, integration readiness, qualification, and
simulation control.

`scripts/production-certification-stage-environment.mjs` is the only child
environment projector. It starts from the ordinary OS/toolchain/application
environment, strips all known certification controls and any unknown name under
the declared control prefixes, then re-adds only explicit profile inputs. An
unknown explicit control, prohibited input, wrong stage/profile, missing
required input, or contradictory fixed activation fails before dispatch. The
projector never mutates `process.env`. Secret values never enter evidence;
non-secret booleans/enums are retained only as safe classifications. It emits
sorted name inventories plus contract/profile/name-set/value-policy hashes.
Unknown parent controls are
stripped and recorded by the projector; doctor rejects them before source
validation in a real certification.

The real and qualification source profiles own the Floor Plan source-test
configuration. Only check `floor-plan-required-closure` receives the
check-owned fixture `FLOOR_PLAN_VISION_ENABLED=0`; ambient
`FLOOR_PLAN_VISION_ENABLED`, `FLOOR_PLAN_VISION_MODEL`,
`FLOOR_PLAN_VISION_DISABLED`, `FLOOR_PLAN_LOCAL_OCR_DISABLED`, and
`OPENAI_API_KEY` cannot influence it. Other source checks receive those inputs
absent. The build and runtime-smoke profiles instead preserve validated `0`/`1`
feature values, the optional model, and the optional secret without recording
the secret. Projected environments are fresh objects, so a child mutation
cannot affect a later check. Unknown `FLOOR_PLAN_*` variables are stripped and
recorded.

`CERTIFICATION_EVIDENCE_ROOT` is parent orchestration context for source
validation. The parent continues to write and seal check stdout, stderr,
results, and aggregate evidence beneath that root, while no source child
receives it. Qualification fixture controls use the separate
`source-validation-qualification` profile and therefore cannot appear in a
real source child. Per-check static requirements are folded into that check's
allowed/required name-set hashes: the Floor Plan closure declares
`DATABASE_URL`, which remains an ordinary preserved application variable and
must exist before dispatch without its value entering evidence. Runtime smoke receives only the narrow
`PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT`, exact report/timing/start-marker paths,
manifest/journal/certification/candidate/artifact identities, runtime profile
ID/hash, and
`CERTIFICATION_ENVIRONMENT_STAGE=runtime-smoke`. Generic evidence-root
ownership alone never activates runtime certification.

Legacy Gate A3 base URL/port and authentication fixture controls, including
all four session-cookie inputs, are inventoried but remain parent-only across
all certification profiles. The cookie and admin-identity records are secret
classified, so neither values nor derived value material enter environment
evidence. The archive verifier and production artifact product server use
separate nested profiles: only the archive verifier receives its validated
candidate/closure identities, and only the product server receives the three
internally derived `PRODUCTION_ARTIFACT_*` identities. Neither nested child
inherits the surrounding stage's broader certification controls.

## Verification modes

| Mode | Context | Required evidence | Final? |
| --- | --- | --- | --- |
| `verify-preflight` | Canonical repository with Git/source context | Manifest v3, journal v2, clean source and complete built artifact | No |
| `verify-archive-preflight` | Physical staged or extracted bytes; no `.git`, worktree, or global fallback | Manifest v3, journal v2, artifact inventory, NFT/trace safety, exact identity, recursive verifier closure | No; emits `certificationComplete=false` |
| `verify-standalone` | Physical extracted artifact plus authorized external certification root and sealed state | Phase 8, 2/2 runtime smoke, all seven browser owners, and complete candidate/artifact/harness identity | Yes |

There is no caller-controlled test-optional final mode. A legacy runtime-only
bundle may still satisfy its artifact-level schema validator, but the final CLI
rejects it because it lacks certification state and the external evidence root.
The standalone verifier itself, not only its lifecycle wrapper, requires its
artifact root to resolve to the canonical non-symlink
`<evidence-root>/archive/extracted` directory.

## Evidence schemas

- `interior-ai.production-certification-doctor.v1`
- `interior-ai.production-certification-state.v1`
- `interior-ai.production-certification-state.v2`
- `interior-ai.production-certification-state.v3`
- `interior-ai.production-certification-state.v4`
- `interior-ai.production-certification-state-validation.v1`
- `interior-ai.production-certification-invalidation-plan.v1`
- `interior-ai.production-certification-worktrees.v1` (historical)
- `interior-ai.production-certification-worktrees.v2`
- `interior-ai.production-certification-worktree-dependency-lifecycle.v1`
- `interior-ai.production-certification-worktree-dependency-installation.v1`
- `interior-ai.production-certification-worktree-dependency-binding.v1`
- `interior-ai.production-certification-attempt.v1`
- `interior-ai.production-archive-plan.v1`
- `interior-ai.production-archive-plan-child-result.v1`
- `interior-ai.production-archive-inventory.v1`
- `interior-ai.production-verifier-source-closure.v1`
- `interior-ai.production-certification-phase8-evidence.v1`
- `interior-ai.production-certification-runtime-smoke-evidence.v1`
- `interior-ai.production-certification-browser-owner-evidence.v1`
- `interior-ai.production-certification-source-validation.v3` (historical)
- `interior-ai.production-certification-source-validation.v4`
- `interior-ai.production-certification-source-generated-outputs.v1`
- `interior-ai.production-certification-source-generated-output-evidence.v1`
- `interior-ai.production-certification-stage-environment.v2`
- `interior-ai.production-certification-artifact-snapshot.v1`
- `interior-ai.production-certification-artifact-root-private.v1`
- `interior-ai.production-certification-continuity.v1`
- `interior-ai.production-certification-final-evidence.v1`

Production manifest v3 and semantic journal v2 remain authoritative and are not
weakened. Final evidence rehashes each retained file and requires one exact
identity across state, manifest, journal, artifact, archive/inventory, raw and
adapted reports, and harness source. For real candidates it reparses the retained
Phase 8 and Playwright reports, independently validates runtime telemetry
attachments and phase timings, and rejects every raw/summary disagreement. The
final identity pins the raw Phase 8/completion, runtime report/timing, and all
seven raw browser-report hashes as well as their certification summaries. It
also pins the child-owned runtime test-begin marker and seven browser-discovery
markers that define the one-shot consumption boundaries. The retained archive
inventory's canonical semantic digest must equal its state binding, the
extracted inventory, and a fresh inventory of the physical extracted tree.

## Doctor

`npm run certification:doctor` is sealed, JSON-only, and non-consuming. It
performs no install, build, archive staging/compression, server start, benchmark,
browser launch, or application-data access. It accumulates source/ancestry,
candidate grammar/propagation, safe environment-name and execution-class,
database/network shape, external roots and unique absent report targets,
v3/v1 compatibility and semantic ownership, build ordering, physical archive
owner, recursive closure, verification modes, Phase 8 destination, report
inventory, and port/process checks. It also validates all three physical
stage-worktree bindings, distinct roots and dependencies, exact candidate
identity, zero ignored influential paths, filesystem capacity, and absence of
canonical-root, alias, symlink, or cross-certification reuse. It validates that
the source check set is non-empty and fully commanded, both sealed schemas are supported, all six
physical capture commands and both comparison scopes are declared, staging and
extraction are retained, and copied-hash continuity is prohibited. It rejects a pre-existing `.next`,
semantic journal, manifest, or artifact inventory before the strict build can
consume anything. A failed doctor emits its sealed JSON with a nonzero process
result; because it is non-consuming, a corrected retry uses a new retained
attempt path.
The same contract explicitly declares that integration readiness requires
source validation, final standalone, and measured continuity.
Doctor also validates complete stage-profile coverage, all 19 source-check
profile bindings, required/prohibited disjointness, source evidence-root
parent ownership, explicit runtime activation and marker inputs, production vs
development browser mode separation, the Phase 8 external-root capability, and
fail-closed unknown-control handling.

Real operation supplies named values without placing secrets in state:

- `PRODUCTION_CERTIFICATION_ID`, `PRODUCTION_CERTIFICATION_STATE`, and an
  initial `npm run certification:state:init` before doctor;
- `CERTIFICATION_WORKTREE_ROOT`, used only as the parent for three newly created
  detached stage roots;
- `CERTIFICATION_SOURCE_ROOT`, `CERTIFICATION_EXPECTED_COMMIT_SHA`,
  `CERTIFICATION_EXPECTED_TREE_SHA`, and mandatory
  `CERTIFICATION_EXPECTED_PARENT_SHA`;
- immutable candidate ID and `CERTIFICATION_EXECUTION_CLASS=real-candidate`;
- `CERTIFICATION_EVIDENCE_ROOT` and the identical
  `PHASE8_EXTERNAL_EVIDENCE_ROOT`;
- one absent absolute Phase 8 summary target; distinct runtime report,
  phase-timing, and summary targets; and one unique absent absolute report
  target for each browser owner;
- database-role/connectivity and network configuration names/shapes required by
  the real operator environment, never application rows or raw credentials.

## Archive lifecycle

The committed archive owner exposes:

- `npm run archive:production:plan`
- `npm run archive:production:create`
- `npm run archive:production:verify`
- `npm run archive:production:extract-and-verify`

The plan owns `.next`, `public`, required-server-files, NFT-derived runtime
inputs, package/toolchain identity, manifest/journal/inventory, and the complete
recursive local-ESM closure derived from the canonical verifier entrypoints.
Every path has one or more explicit inclusion reasons. Missing/escaping imports,
symlinks where physical files are required, destination collisions, source or
global fallback, broad tests/scripts inclusion, prohibited private paths, and
historically rejected test sources fail before certification.

The archive-preflight parent retains every planner invocation beneath the
current `archive/attempt-NNN` directory. Redacted stdout and stderr are physical
files with byte counts and SHA-256 identities, and `plan-result.json` binds the
canonical child command, exact-candidate working-directory classification,
environment-profile contract/profile/value-policy/name hashes, child PID, exit
status, signal, spawn-error classification, structured safe failure code,
rejected normalized relative path and policy decision/reason, plus a terminal
completion marker. On failure, certification state references that result via
the existing `archive-plan` evidence slot. Raw environment values, credentials,
machine-private path values, and unredacted source contents are never portable
fields; stream output is redacted before its retained hash is computed.

The staged verifier runs from staged bytes. Compression uses a sorted file list,
normalized timestamps, regular-file modes, uid/gid/owner metadata, and a zero
gzip timestamp.
Staged and extracted symlink targets must stay inside their physical tree.
Extraction occurs outside the repository; extracted inventory must equal the staged inventory before the
standalone archive-preflight is accepted. The import-edge ledger and closure
hash are retained in the plan/evidence. Final verification is forced to the
canonical physical, non-symlink `archive/extracted` directory beneath the
authorized evidence root; a caller cannot redirect it to staging or another
contained copy.

## External evidence policy

Certification uses one authorized absolute root outside every Git worktree.
Lexical and realpath containment, existing physical parent, absent target,
unique target, repository exclusion, and symlink-escape checks run before an
owner starts. No certification owner silently falls back to `.local` or
overwrites another result.

All seven required Playwright configurations use the shared resolver while
retaining their repository-relative ignored CI mode. Certification mode binds
the external root and full candidate/artifact/harness metadata. The aggregate
invokes each canonical package command under `CI=true` while explicitly
canonicalizing `APP_ENV`/`NEXT_PUBLIC_APP_ENV`, production-server, catalog, and
release-URL state, exact source commit/tree metadata, and removing inherited
Vercel classification. Owner-specific
development/staging settings therefore cannot bleed between owners or reuse an
unowned listener. A child reporter writes an absent external discovery marker
from Playwright `onBegin`; pre-discovery failures remain non-consuming while a
crash after discovery remains consuming. The owners are:

| Owner | Gate/config |
| --- | --- |
| Floor Plan Upload | `ci.floor-plan-upload-accessibility` / `playwright.floor-plan-upload.config.ts` |
| Pro Visual | `ci.pro-visual-policy` / `playwright.pro-visual.config.ts` |
| Guest Save | `ci.guest-save-overlay-accessibility` / `playwright.guest-save-overlay.config.ts` |
| My Designs | `ci.my-designs-overlay-accessibility` / `playwright.my-designs-overlay.config.ts` |
| Public Share | `ci.public-share-responsive` / `playwright.share-responsive.config.ts` |
| Cart | `ci.cart-overlay-accessibility` / `playwright.cart-overlay.config.ts` |
| Retailer | `ci.retailer-confirmation-accessibility` / `playwright.retailer-confirmation.config.ts` |

`PHASE8_EXTERNAL_EVIDENCE_ROOT` writes Phase 8 raw arrays and completion data
directly beneath the same external certification root. The target must be
outside all repositories, absent/unique, and non-escaping. No copy/delete shim
is the canonical owner, and no benchmark operation, fixture, sample, percentile,
threshold, boundary, or budget changes.

Runtime smoke uses the same external policy through the stricter runtime v1
contract above. `CERTIFICATION_EVIDENCE_ROOT` remains parent-only. The child
must receive `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` plus each exact output path;
neither runner nor writer may infer authorization from a destination, fall back
to a repository path, or create the external evidence tree.

## Final standalone requirements

Final verification requires all of these, never aggregate counts alone:

- Phase 8 exact source/tree/Build ID/artifact and benchmark source/input hashes,
  successful child and parent validation, complete raw arrays, a retained and
  rehashed parent completion marker, all budget and
  boundary results, large `fingerprintCold` p95 at most 6 ms, large load p95 at
  most 10 ms, completion, and zero contradiction;
- runtime smoke exactly 2/2 with zero retry, flake, or skip, exact identity,
  independently re-parsed raw telemetry provenance for the initial realm and
  every reload, a semantically valid retained phase-timing record, and a
  child-owned marker written at the first Playwright `onTestBegin` boundary;
- the canonical expected identities, project ownership, and counts for every
  one of the seven browser owners, including Chromium/WebKit where owned, zero
  retry/skip/flake, unique report hashes, and completion;
- exact candidate ID, commit, tree, parent, Build ID, artifact, manifest,
  journal, journal nonce, verifier closure, physical archive, archive inventory,
  Phase 8 summary/raw/completion, runtime summary/raw/timing, seven browser
  summaries/raw reports, runtime/browser start markers, harness
  version, and harness-source hashes.

Missing, duplicated, partial, stale, cross-run, simulation-classified,
contradictory, or mismatched evidence fails closed.

## Physically measured continuity

Continuity is a separate stage after final standalone. Six independently
sealed `interior-ai.production-certification-artifact-snapshot.v1` records are
captured at their real events: `immediateBuild`, `stagedArchive`,
`compressedArchive`, `extractedArchive`, `postPhase8Live`, and
`postRuntimeBrowserLive`. Every snapshot has a unique path and capture event;
the portable record contains only a normalized root classification and relative
inventories. Its private, state-bound root sidecar retains the machine-local
realpath, device, inode, and physical kind so root replacement can be detected.

The canonical application-artifact scope is the owned `.next` and `public`
contract after its existing mutable exclusions. It must be byte-identical at
immediate build, inside staging, inside extraction, after Phase 8, and after all
runtime/browser owners. The executable archive-closure scope includes every
staged executable, verifier, required-server, NFT-derived, dependency, public,
and generated certification input; it must be identical in the staged tree,
the independently inspected compressed archive, and the extracted tree. The
compressed archive additionally binds its own bytes/size, deterministic
constructor version/source hash, physical closure-inventory hash, and the
archive constructor's separately sealed inventory hash.

`npm run certification:continuity` does not trust stored summaries. It reopens
and rehashes the live candidate root, staged tree, compressed archive, and
extracted tree; rejects missing/replaced/symlink-fallback roots and staged/
extracted realpath aliasing; revalidates every manifest and closure identity;
and records every comparison and exact mismatch. Staging and extraction are
retained until this succeeds. Only the resulting sealed continuity SHA can
satisfy state and `integration-ready`.
Deterministic physical mutations before and during the Phase 8 fixture boundary
are separate cases; neither invokes the real Phase 8 owner.
Failed continuity records use attempt-numbered paths and retain exact
missing/extra/path/type/size/hash/identity/root details. Because comparison
itself is non-consuming, a corrected physical root may be remeasured in a new
attempt without overwriting the failed evidence.

## Transactional validation, resume, and invalidation

`npm run certification:state:validate` revalidates the stage-owned roots, live
manifest/journal/Build ID/artifact identity, the state seal, every retained
evidence hash, and completed raw evidence semantics. `npm run
certification:resume` returns only the first eligible stage after the same
read-only validation. `npm run certification:build:eligibility` is also
read-only and validates its complete mode-specific invocation before reading
state.

These commands never initialize, rewrite, reconcile, invalidate, or advance
state. Missing or malformed candidate ID, malformed mode, wrong expected
commit/tree/parent comparator, missing state, unknown environment control,
missing source comparator, wrong worktree, or any other precondition failure is
`PRECONDITION_ORCHESTRATION_FAILURE`, `consumed=false`, and leaves the exact
state bytes, SHA-256, attempt history, and stage statuses unchanged. Canonical
identity always comes from the sealed state; caller values are comparators only.

A proven retained-input mismatch produces a sealed
`interior-ai.production-certification-invalidation-plan.v1` without changing
state. Only `npm run certification:state:reconcile`, supplied the plan path and
the exact pre-mutation state SHA-256, may atomically invalidate the first
affected stage and its successors. A stale plan, different state hash, or
unproven mismatch is rejected without mutation. Normal stage-transition owners
remain the only other state writers. Validation cannot create an attempt merely
by failing.

After continuity passes, the distinct `npm run
certification:integration-ready` mutating owner can produce readiness only when
the supplied canonical local branch and
remote-tracking refs still equal the separately declared integration commit and
tree and `git merge-base --is-ancestor` proves the candidate is a fast-forward
descendant. Real operation supplies `CERTIFICATION_INTEGRATION_BRANCH_REF`,
`CERTIFICATION_INTEGRATION_TRACKING_REF`,
`CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA`, and
`CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA`; the retained readiness record
pins both observed refs plus source-validation, final-standalone, and measured
continuity hashes. This check does not fetch, merge, or integrate.
Before readiness advances, live state validation rehashes all retained physical
roots and cross-binds every snapshot descriptor, nested identity, capture
event, comparison position set, and continuity input hash.

## Failure taxonomy

The only classifications are
`PRECONDITION_ORCHESTRATION_FAILURE`, `INFRASTRUCTURE_TRANSIENT`,
`SOURCE_CONTRACT_FAILURE`, `BUILD_FAILURE`, `ARCHIVE_FAILURE`,
`PERFORMANCE_GATE_FAILURE`, `PRODUCT_ASSERTION_FAILURE`,
`ARTIFACT_CONTINUITY_FAILURE`, and `FINAL_EVIDENCE_FAILURE`.

The attempt records whether a substantive boundary was consumed. Sampling,
product-test execution/discovery, and declared archive compression/verification
consume their gates; missing names, malformed IDs, unsafe paths, unresolved
modules, missing roots, or stale start-marker destinations rejected before
dispatch do not. Phase 8 sampling, runtime product-test start, and browser
discovery use child-owned, retained markers at their exact boundaries so a
post-boundary process signal or evidence-adaptation failure cannot silently
permit a retry.
An environment profile/doctor rejection before a source child starts is a
non-consuming precondition. Once a real required source command starts, its
failure consumes source validation under the existing taxonomy. A missing
runtime marker in the actual runtime stage is a runtime-stage failure; a
runtime-marker demand during source validation is classified as
`SOURCE_VALIDATION_STAGE_ENVIRONMENT_LEAKAGE_DEFECT`, an environment-contract
source defect. Historical attempt state is never rewritten to apply this
additional root-cause label.

## Historical regression matrix

`scripts/production-certification-regressions.json` retains all 32 required
historical failures and adds source-validation, physical-continuity, and
transactional state/worktree-isolation
anti-bypass cases. `scripts/test-production-certification.mjs` maps each entry
to executable deterministic CLI coverage plus anti-bypass source guards:
source/tree and candidate grammar;
external report presence/containment/staleness; schema/journal/timestamp/build
ordering; physical constructor and recursive imports; mode separation; missing
Phase 8/runtime/each browser owner; identity mismatch; external Phase 8;
canonical commands and process status; contradictory evidence; continuity; and
simulation rejection. Case 22 physically removes a retained raw browser report
and requires final rejection; case 23 sends a producer exit 17 through the same
child-status adapter used by the lifecycle and requires exact propagation.
Unknown inventory or classification fails closed.
Case 28 preserves the exact pre-runtime timing/root mismatch. Its focused
real-runner fixture projects the committed runtime profile, proves the generic
root is absent, invokes the production destination preflight and real timing
writer, and requires the external terminal timing record to rehash with no
secret or repository-local output. The paired A–U matrix rejects missing,
relative, escaping, repository/worktree, symlink, stale, cross-certification,
cross-artifact, wrong-profile, incomplete, or tampered evidence while retaining
the actual-runtime start-marker boundary.
Case 31 owns source-validation generator cleanup. Case 32 preserves the exact
CH-0015I rehearsal build failure: it requires literal ignored/untracked
`next-env.d.ts` ownership, pre-build absence, no-follow production-byte and
inode inventory, link-count-proven exact unlink, terminal worktree validation,
sealed candidate/artifact evidence, and invalid-but-resealed final-consumer
tamper rejection. Neither case broadens ignored-path policy.

## Qualification and operational runbook

The bounded source qualification is:

```sh
npm run test:production-certification
node scripts/test-production-certification-source-generated-outputs.mjs
node scripts/test-production-certification-source-generated-outputs.mjs --real-producers
node scripts/test-production-certification-state-worktrees.mjs
node scripts/test-production-certification-stage-environment.mjs
node scripts/test-production-certification-database-lifecycle.mjs
npm run certification:simulate
npm run test:production-artifact-evidence
npm run test:required-test-truthfulness
npm run certification:qualify
```

`certification:simulate` builds a miniature Git repository plus three real
detached worktrees outside the application repository and invokes physical
committed CLIs for state initialization and transitions, a
sealed failed-doctor/retry cycle, source validation, journal/manifest
production, archive plan/stage/compress/extract, staged/extracted preflight,
final verification, read-only validation, explicit reconciliation,
integration-readiness ownership, deterministic Phase
8/runtime/seven-owner evidence, six independent physical snapshots, and the
real continuity CLI. It also proves a source-check failure blocks build, a
physical artifact mutation blocks continuity/readiness, and copied hashes do
not satisfy continuity. A staged-root mutation additionally proves a failed
continuity attempt is retained and a corrected second attempt uses a distinct
evidence path before readiness. It supplies a realistic parent environment
containing later Phase 8, runtime, and
browser output paths, then proves all 19 fixture checks receive only their
declared source profile. The parent also has external Floor Plan vision enabled,
a model selector, a synthetic OpenAI key, and both disable flags; check 5 still
receives only its deterministic disabled fixture. It rejects a wrong profile,
profile/hash/value-policy tampering, ambient application-feature leakage, a
source fixture projected into build/runtime, import-order drift, and a leaked
runtime capability while retaining the parent-owned source evidence.
The production-artifact suite separately drives the real Playwright config
with a source-validation parent root and no runtime marker, then proves the
same config still fails closed when the explicit runtime stage omits its
marker. `scripts/test-production-certification-stage-environment.mjs` also
invokes the canonical source-stage executor in a clean temporary repository,
runs the exact historical `e39875191b0d…` runner/projector until canonical check
5 reproduces `externalVisionEnabled` `true !== false`, then runs the corrected
ordered 19-command source check set under the legacy strict terminal policy,
proves all children exit zero, records the exact five generated paths, and
proves check 1 passes
through its real `npm run test:production-artifact-evidence` command without
receiving the parent evidence root or any later-stage capability. The
`--real-producers` generated-output regression separately repeats the canonical
producer failure and then creates a fresh physical state-v4 worktree, durably
binds its local dependency identity, runs the complete corrected 19-command
closure, validates its running/completed source aggregate and certification
state, and proves exact cleanup plus a node_modules-only terminal inventory. The
simulation also proves canonical ignored bytes and an external-target symlink
remain unchanged, every stage uses only its assigned root, cross-role or
cross-certification reuse fails, and default cleanup removes only the three
task-created worktrees. It starts no app, database, or browser and runs no real
build or benchmark. Its
evidence is marked `deterministic-simulation` and cannot certify a real
candidate.

The simulation also runs the contract-only database lifecycle matrix: planned
absence, provision/migration, initial/final emptiness, fixture cleanup, exact
session release, normal drop/absence, abort retention, and cross-run/candidate/
session tamper rejection. It does not connect to PostgreSQL. Qualification
separately runs the real generated disposable-database fixture and requires its
post-drop absence proof.

The matrix also covers resume ordering through resource preparation and doctor,
live doctor absence failure, semantic-history tamper, state-binding CAS
reconciliation, signal-during-owner serialization, foreign create collision,
ambiguous create-response recovery, late-abort truth, partial abort retry, and
credential-bearing error redaction.

The simulated runtime stage uses the committed runtime projector and real
phase-budget writer. It preflights the four canonical destinations, proves the
parent-only root is stripped, writes terminal timing evidence externally, and
passes that exact file through final standalone and integration readiness.
Final-evidence regressions separately tamper the root/path contract, identity,
artifact, profile, completion marker, and bytes.

Doctor validates the runtime root owner/path, destination uniqueness,
runner/writer contract identity, profile capability boundaries, and final
consumer before source validation may begin. It also validates the Floor Plan
check/policy owner, source/build/runtime policy separation, unchanged false
assertion and production enable gate, per-call configuration reader, registered
import-order regression, and exact historical real-runner coverage.
`certification:simulate`
exercises all 19 fixture checks and the value-policy tamper matrix.
`certification:qualify` may emit only `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`,
`NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`, `NOT_QUALIFIED_ORCHESTRATION_GAP`, or
`INCONCLUSIVE`. It performs deterministic doctor/simulation/regression/state,
production-artifact/truthfulness, type, zero-warning lint, code-quality,
tracked-artifact hygiene, syntax, and diff checks without consuming the real
gates. It may emit `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION` only when the
ordinary tracked and untracked Git status is completely clean. Projected child
environments and both stage-owned dependency installations strip
`NODE_PATH`/`NODE_OPTIONS`. State mutation uses an exclusive sidecar lock and
expected-current-byte SHA-256 comparison before atomic replacement.

After an `A` result, a separately authorized exact-head real cycle must use a
clean immutable checkout and external roots, run doctor before any consuming
operation, advance state in order, preserve each result, verify final standalone
from extracted bytes, verify continuity, and only then produce
`integration-ready`. Integration and the final CH-0015 closure audit remain
separate pending operations.
