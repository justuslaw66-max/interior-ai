# Production Certification Harness v1

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

Historical `interior-ai.production-certification-state.v1` records remain
readable and unchanged. New cycles use
`interior-ai.production-certification-state.v2`, atomically replaced and sealed
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
`interior-ai.production-certification-source-validation.v3` aggregate binds the
certification/candidate, harness and contract-matrix hashes, check-set hash,
stage-environment contract hash, ordered per-check profile IDs and profile
hashes, allowed/required environment-name-set hashes, value-policy hashes and
safe effective classifications, the certification-control and ambient-value
absence results, attempt nonce, ordered IDs and commands, timestamps, every
retained file hash, completion marker, and aggregate SHA-256. State validation reparses this
evidence and rehashes all files. A source identity descriptor alone is never
accepted, and earlier qualification evidence is never imported as a substitute.

## Stage environment capability contract

`docs/qa/production-certification-stage-environment.v2.json` is the canonical
machine-readable owner for certification child-process capabilities. Its schema
is `interior-ai.production-certification-stage-environment.v2`. It inventories
83 control names with canonical owner, classification, portability, secret
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
manifest/journal identities, and
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
| `verify-preflight` | Canonical repository with Git/source context | Manifest v3, journal v1, clean source and complete built artifact | No |
| `verify-archive-preflight` | Physical staged or extracted bytes; no `.git`, worktree, or global fallback | Manifest v3, journal v1, artifact inventory, NFT/trace safety, exact identity, recursive verifier closure | No; emits `certificationComplete=false` |
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
- `interior-ai.production-certification-state-validation.v1`
- `interior-ai.production-certification-invalidation-plan.v1`
- `interior-ai.production-certification-worktrees.v1`
- `interior-ai.production-certification-attempt.v1`
- `interior-ai.production-archive-plan.v1`
- `interior-ai.production-archive-inventory.v1`
- `interior-ai.production-verifier-source-closure.v1`
- `interior-ai.production-certification-phase8-evidence.v1`
- `interior-ai.production-certification-runtime-smoke-evidence.v1`
- `interior-ai.production-certification-browser-owner-evidence.v1`
- `interior-ai.production-certification-source-validation.v3`
- `interior-ai.production-certification-stage-environment.v2`
- `interior-ai.production-certification-artifact-snapshot.v1`
- `interior-ai.production-certification-artifact-root-private.v1`
- `interior-ai.production-certification-continuity.v1`
- `interior-ai.production-certification-final-evidence.v1`

Production manifest v3 and semantic journal v1 remain authoritative and are not
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

`scripts/production-certification-regressions.json` retains all 27 required
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

## Qualification and operational runbook

The bounded source qualification is:

```sh
npm run test:production-certification
node scripts/test-production-certification-state-worktrees.mjs
node scripts/test-production-certification-stage-environment.mjs
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
ordered 19-command source check set and proves check 1 passes
through its real `npm run test:production-artifact-evidence` command without
receiving the parent evidence root or any later-stage capability. The
simulation also proves canonical ignored bytes and an external-target symlink
remain unchanged, every stage uses only its assigned root, cross-role or
cross-certification reuse fails, and default cleanup removes only the three
task-created worktrees. It starts no app, database, or browser and runs no real
build or benchmark. Its
evidence is marked `deterministic-simulation` and cannot certify a real
candidate.

Doctor validates the Floor Plan check/policy owner, source/build/runtime policy
separation, unchanged false assertion and production enable gate, per-call
configuration reader, registered import-order regression, and exact historical
real-runner coverage before source validation may begin. `certification:simulate`
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
