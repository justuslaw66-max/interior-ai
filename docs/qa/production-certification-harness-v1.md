# Production Certification Harness v1

Status: **A — `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`** for source
qualification only. The previous read-only qualification was **B —
`NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`**. Harness v1 corrects that source
contract and its bounded qualifier now authorizes a separately approved new
exact-head cycle, but it does not itself certify a real candidate.
The final separate read-only review returned **PASS** with no remaining
actionable P0/P1 source-contract finding.

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

`interior-ai.production-certification-state.v1` is the only resumable state
shape. It is atomically replaced and sealed with its own SHA-256. It binds the
certification ID, immutable candidate ID, commit/tree/exact parent, harness version and
source hash, journal nonce, Build ID, artifact, manifest, journal, verifier
closure, archive, inventory, Phase 8, runtime, seven browser-owner, continuity,
prior-stage input, command, attempt, exit/signal, classification, one-shot
consumption, and completion fields. Credentials and raw environment values are
never state fields.

Stages are ordered and fail closed:

| Order | Stage | Canonical command |
| ---: | --- | --- |
| 1 | `doctor` | `npm run certification:doctor` |
| 2 | `source-validation` | `npm run certification:state:validate` |
| 3 | `build` | `npm run certification:build` |
| 4 | `archive-preflight` | `npm run certification:archive-preflight` |
| 5 | `archive` | `npm run certification:archive` |
| 6 | `extracted-archive-preflight` | `npm run certification:extracted-archive-preflight` |
| 7 | `phase8` | `npm run certification:phase8` |
| 8 | `runtime-smoke` | `npm run certification:runtime-smoke` |
| 9 | `browser-owners` | `npm run certification:browser-owners` |
| 10 | `final-standalone` | `npm run certification:final-standalone` |
| 11 | `continuity` | `npm run certification:continuity` |
| 12 | `integration-ready` | `npm run certification:state:validate` |

Every stage is exactly one of `pending`, `running`, `passed`, `failed`, or
`invalidated`. Unknown stages, statuses, classifications, schemas, or evidence
members are rejected. A stage cannot start until all predecessors pass and all
bound hashes still rehash. Consumed substantive one-shot stages cannot be
silently restarted.

## Verification modes

| Mode | Context | Required evidence | Final? |
| --- | --- | --- | --- |
| `verify-preflight` | Canonical repository with Git/source context | Manifest v3, journal v1, clean source and complete built artifact | No |
| `verify-archive-preflight` | Physical staged or extracted bytes; no `.git`, worktree, or global fallback | Manifest v3, journal v1, artifact inventory, NFT/trace safety, exact identity, recursive verifier closure | No; emits `certificationComplete=false` |
| `verify-standalone` | Physical extracted artifact plus authorized external certification root and sealed state | Phase 8, 2/2 runtime smoke, all seven browser owners, continuity, and complete candidate/artifact/harness identity | Yes |

There is no caller-controlled test-optional final mode. A legacy runtime-only
bundle may still satisfy its artifact-level schema validator, but the final CLI
rejects it because it lacks certification state and the external evidence root.
The standalone verifier itself, not only its lifecycle wrapper, requires its
artifact root to resolve to the canonical non-symlink
`<evidence-root>/archive/extracted` directory.

## Evidence schemas

- `interior-ai.production-certification-doctor.v1`
- `interior-ai.production-certification-state.v1`
- `interior-ai.production-certification-attempt.v1`
- `interior-ai.production-archive-plan.v1`
- `interior-ai.production-archive-inventory.v1`
- `interior-ai.production-verifier-source-closure.v1`
- `interior-ai.production-certification-phase8-evidence.v1`
- `interior-ai.production-certification-runtime-smoke-evidence.v1`
- `interior-ai.production-certification-browser-owner-evidence.v1`
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
inventory, and port/process checks. It also rejects a pre-existing `.next`,
semantic journal, manifest, or artifact inventory before the strict build can
consume anything. A failed doctor emits its sealed JSON with a nonzero process
result; because it is non-consuming, a corrected retry uses a new retained
attempt path.

Real operation supplies named values without placing secrets in state:

- `PRODUCTION_CERTIFICATION_ID`, `PRODUCTION_CERTIFICATION_STATE`, and an
  initial `npm run certification:state:init` before doctor;
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
- equality of immediate, staged, compressed, extracted, post-Phase-8, and
  post-runtime/browser artifact identities;
- exact candidate ID, commit, tree, parent, Build ID, artifact, manifest,
  journal, journal nonce, verifier closure, physical archive, archive inventory,
  Phase 8 summary/raw/completion, runtime summary/raw/timing, seven browser
  summaries/raw reports, runtime/browser start markers, continuity, harness
  version, and harness-source hashes.

Missing, duplicated, partial, stale, cross-run, simulation-classified,
contradictory, or mismatched evidence fails closed.

## Resume and invalidation

`npm run certification:state:validate` revalidates current Git HEAD/tree and
cleanliness, live manifest/journal/Build ID/artifact identity, the state seal,
every retained evidence hash, and completed raw evidence semantics. `npm run
certification:resume` returns only the first
eligible stage after performing the same checks. An input mismatch invalidates
that stage and every successor; it never edits a pass into existence. A source
change invalidates build onward. A build, Build ID, artifact, manifest, journal,
or closure change invalidates archive, Phase 8, runtime, browsers, final,
continuity, and readiness. All attempts remain in state; a non-consuming
precondition may be corrected and retried as a separately recorded attempt.

After continuity passes, the same state-validation CLI can produce
`integration-ready` only when the supplied canonical local branch and
remote-tracking refs still equal the separately declared integration commit and
tree and `git merge-base --is-ancestor` proves the candidate is a fast-forward
descendant. Real operation supplies `CERTIFICATION_INTEGRATION_BRANCH_REF`,
`CERTIFICATION_INTEGRATION_TRACKING_REF`,
`CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA`, and
`CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA`; the retained readiness record
pins both observed refs. This check does not fetch, merge, or integrate.

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

## Historical regression matrix

`scripts/production-certification-regressions.json` records all 26 required
historical failures. `scripts/test-production-certification.mjs` maps each entry
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
npm run certification:simulate
npm run test:production-artifact-evidence
npm run test:required-test-truthfulness
npm run certification:qualify
```

`certification:simulate` builds a miniature fixture outside the repository and
invokes physical committed CLIs for state initialization and transitions, a
sealed failed-doctor/retry cycle, source validation, journal/manifest
production, archive plan/stage/compress/extract, staged/extracted preflight,
final verification, integration-readiness validation, and synthetic Phase
8/runtime/seven-owner/continuity recording. It
starts no app, database, or browser and runs no real build or benchmark. Its
evidence is marked `deterministic-simulation` and cannot certify a real
candidate.

`certification:qualify` may emit only `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`,
`NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`, `NOT_QUALIFIED_ORCHESTRATION_GAP`, or
`INCONCLUSIVE`. It performs deterministic doctor/simulation/regression/state,
production-artifact/truthfulness, type, zero-warning lint, code-quality,
tracked-artifact hygiene, syntax, and diff checks without consuming the real
gates.

After an `A` result, a separately authorized exact-head real cycle must use a
clean immutable checkout and external roots, run doctor before any consuming
operation, advance state in order, preserve each result, verify final standalone
from extracted bytes, verify continuity, and only then produce
`integration-ready`. Integration and the final CH-0015 closure audit remain
separate pending operations.
