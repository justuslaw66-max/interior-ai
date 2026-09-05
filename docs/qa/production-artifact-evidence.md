# Production-equivalent artifact evidence

## Archive consumption of persisted build-auth continuity — 2026-08-22

Archive verification does not require a live auth capability. Its authority is
the safe build-auth continuity already persisted in the production manifest:
session identity, classification, provider digests, no-regeneration proof, and
candidate binding, never raw provider values or private transport paths. The
validator now compares that record with a projected environment only when the
environment explicitly identifies an actual bound build stage. A sealed
archive wrapper parent is not a build child and is not used as historical build
evidence.

The stage environment owner classifies both raw provider variables as secret
and non-portable. The archive-verifier and archive-preflight profiles exclude
them, and focused regression coverage proves a fully populated private parent
transport is stripped before archive-child dispatch while persisted continuity
still validates. Altered continuity, foreign session identity, or mismatched
candidate manifest evidence continues to fail closed.

## Runtime report re-entry ownership correction — 2026-08-18

The preserved rehearsal ending `20260818T075947Z-5755043309d7` did not execute
a Playwright retry: the second evaluation was configuration/replacement-worker
re-entry at retry 0. Its report and all other evidence remain immutable, and
the failure remains consumed `PRODUCT_ASSERTION_FAILURE` rather than success.

Runtime report authorization now uses an adjacent canonical v2 owner sidecar.
The initial target and sidecar must both be absent; the sidecar is atomically
created before Playwright. Re-entry is permitted only when certification ID,
candidate ID, runtime stage/attempt, journal nonce, portable report path,
physical evidence-root identity hash, source commit/tree, Build ID, artifact
SHA-256, production-manifest SHA-256, and semantic-journal SHA-256 all match.
An existing report is always rejected, including for the owning run, so no
completed report can be overwritten. Unowned, stale, cross-attempt, cross-run,
cross-root, cross-destination, and cross-artifact claims fail closed. The
sidecar retains only portable non-secret identity; raw machine paths and
credentials are absent. Playwright `retries` remains exactly `0`.

This correction changes no browser product assertion, runtime wait, timeout,
or evidence payload. Exact source qualification is
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; a fresh rehearsal and immutable
final certification remain pending.

## Runtime report portable-path correction — 2026-08-23

The preserved rehearsal ending `20260822T171959Z-5GFdVZRv-r04` remains failed
at `runtime-smoke:001` with `FINAL_EVIDENCE_FAILURE` and
`consumedSubstantiveGate=true`. Its two Playwright tests passed with no skips,
flakes, failures, or retries; final-evidence truthfulness rejected only the raw
external `outputFile` and product-test `markerPath` recorded by Playwright.

External runtime report canonicalization now separates physical and portable
ownership. The physical Playwright JSON remains byte-preserved and its SHA-256
is retained by certification state. Before a portable in-memory projection is
accepted, the canonicalizer rehashes those bytes, verifies the canonical v2
owner sidecar against the exact certification/candidate/run/attempt/root, and
uses the retained external-file resolver to prove the report and start marker
are normalized physical files beneath the bound root. Only the JSON reporter's
`outputFile` and the registered start reporter's `markerPath` are projected to
their safe root-relative paths, including `playwright-report.json` and
`product-test-start.json`; repository-root projection remains unchanged.
Unknown absolute fields, foreign roots or identities, traversal, symlink
escapes, missing files, and raw-hash drift fail closed. Required-test
truthfulness still rejects every remaining machine-local path.

Status: repository-controlled CH-0016 contract. This document describes local
production-mode artifact evidence and required CI behavior. It does not describe
or prove a Vercel deployment, stable staging, production, or external platform
configuration.

## Canonical trace/archive inclusion policy

`scripts/production-trace-archive-policy.mjs` is the side-effect-free decision
owner shared by production artifact NFT validation and production archive
planning. It binds a normalized relative path to its provenance, NFT manifest
and route owner, runtime-necessity classification, prohibited-path decision,
and sensitive-scan requirement. Unknown provenance and unknown test-source
necessity fail closed. Environment files, Git data, private evidence, mutable
Next.js caches, and other prohibited paths remain rejected, and accepted inputs
remain subject to the existing sensitive-value scan.

The retained 2026-08-16 failed-rehearsal NFT identifies exactly eight
`scripts/test-*` references, all owned only by
`.next/server/app/api/tools/glb-optimizer/route.js.nft.json`:

- `scripts/test-floor-plan-construction-sources.ts`;
- `scripts/test-floor-plan-private-source-retention.ts`;
- `scripts/test-floor-plan-source-observation-governance.ts`;
- `scripts/test-floor-plan-source-overlay-residuals.ts`;
- `scripts/test-floor-plan-supplementary-sources.ts`;
- `scripts/test-production-certification-resources.mjs`;
- `scripts/test-production-certification-source-generated-outputs.mjs`;
- `scripts/test-runtime-smoke-resource-isolation.mjs`.

The production route and its `normalizeModel` / `optimizeModel` dependency chain
neither import nor open those files. The set is therefore classified
`B — PROVEN_NFT_OVERTRACE`. The GLB optimizer route owns a route-scoped tracing
exclusion for the filename class; the policy contains no eight-name allowlist,
and manually supplied or unrelated test sources remain rejected. Both artifact
validation and archive planning return `reject` with
`PROVEN_NFT_OVERTRACE_REJECTED` for the retained eight-path fixture. The
regression derives those paths from the retained raw NFT references in
`scripts/fixtures/production-trace/glb-optimizer-retained-overtrace.nft.json`
and verifies the post-correction route fixture contains zero test-source
references. Malformed or escaping NFT references are rejected by the same
canonical policy reason in both consumers.

## Current journal-v2 final-consumer alignment — 2026-08-16

Mandatory read-only review stopped exact candidate
`73d5c541c4171bf6c05b168e6bd29853b03ea011`, tree
`be98410f071a71a62311929a67cb2589783774e4`, before creating any
certification ID, candidate ID, evidence root, state, worktree, dependency
installation, database, doctor result, build, archive, benchmark, runtime,
browser, continuity, integration, or Full E2E evidence. No substantive gate was
consumed. The stop is classified
`FINAL_RUNTIME_EVIDENCE_JOURNAL_SCHEMA_DRIFT` /
`CANONICAL_JOURNAL_VERSION_CONSUMER_MISMATCH`; it is not a runtime-smoke
failure because runtime smoke never started.

Current exact-head certification now has one fail-closed compatibility policy:
state schema v3, production manifest schema v3 with validator 3, and semantic
journal schema/version v2. `scripts/production-artifact-contract.mjs` is the
side-effect-free canonical owner of the journal identifier, version, and strict
lifecycle validator. The producer, Playwright loader, runtime raw-report
consumer, timing writer, runtime envelope, archive preflight, final standalone,
and continuity consumer derive current identity from that owner. They require
candidate/commit/tree, nonce, worktree/process handoff, wrapper and canonical
commands, semantic timestamps/order, completion, Build ID, artifact SHA-256,
manifest binding, and retained journal hash to agree. Journal v1, unknown or
future versions, missing/malformed versions, incomplete v2 records, and
cross-run/cross-artifact substitutions are rejected.

Historical journal-v1 fixtures are not rewritten or promoted. State v1/v2 plus
journal v1 is readable only through
`scripts/production-certification-historical-evidence.mjs`, an explicitly
offline compatibility owner. The current physical final-standalone verifier
accepts state v3 only and rejects the same historical fixture. Deterministic
simulation produces manifest v3/journal v2 and binds v2 in the raw report,
timing evidence, runtime envelope, archive, final standalone, continuity, and
integration-readiness path. Qualification returns
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; this is source-platform proof,
not real candidate evidence. No product/UI, Floor Plan, telemetry, NFT,
Playwright product assertion, benchmark, dependency/lockfile, database,
migration, workflow, or deployment behavior changes. Exact-head real
certification and the final CH-0015 closure audit remain pending.

## CH-0015I runtime timing external-root correction

Mandatory read-only review stopped exact candidate
`d449afd0ff693ad8bd03932d13b768b961dceab4`, tree
`2af0f9c22cff576663174903494f904bdd4c4960`, before certification-resource
creation. It created no certification/candidate ID, state, or evidence root;
doctor and substantive stages never ran. No source or external state changed,
and the result is not a runtime-smoke failure.

The source blocker is
`RUNTIME_SMOKE_TIMING_EVIDENCE_ROOT_CONTRACT_DEFECT` /
`STAGE_ENVIRONMENT_OUTPUT_CAPABILITY_OWNER_MISMATCH`. The isolated runtime
child correctly received `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` and an absolute
timing path but not parent-only `CERTIFICATION_EVIDENCE_ROOT`; the timing writer
authorized against the absent parent root.

Classification `PLAYWRIGHT_EXTERNAL_ROOT_OWNS_ALL_RUNTIME_OUTPUTS` now makes
the runtime bundle coherent. One versioned resolver validates the explicit
external root and exact report, timing, product-test marker, and runtime-summary
destinations before Playwright. It enforces external lexical/physical
containment, repository/worktree exclusion, non-symlink existing writable
parent, absent target, and role filename. The phase writer consumes only that
explicit root/path, creates no evidence tree, has no `.local` or generic-root
fallback, and atomically finalizes an absent target.

Portable phase-timing evidence binds the root-contract schema/version/hash,
destination class, safe relative path, terminal completion marker, file hash,
certification/candidate/commit/tree/Build-ID/artifact/manifest/journal identity,
and runtime profile ID/hash. It excludes the machine-local absolute root and
secrets. Final standalone rehashes the raw timing file and rejects root/path,
profile, cross-run, cross-artifact, completion, or byte tampering. Readiness,
post-readiness, browser, and failure diagnostics remain embedded in report/
timing evidence; safe child streams are not independent portable artifacts.

The focused regression uses the real runtime projector, production runner
preflight, and phase writer without launching Playwright. Simulation carries
the produced external timing file into final standalone and integration
readiness. Phase names, deadlines, budgets, readiness contracts, measurement,
failure behavior, and runtime product assertions are unchanged. The exact
clean-commit qualifier returns
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; no real build, Phase 8, runtime,
browser matrix, Full E2E, integration, or push was performed. Exact-head real
certification and the final CH-0015 closure audit remain pending. Independent
read-only review returned `PASS` with no remaining actionable finding.

## CH-0015I source-stage environment isolation correction

Failed real certification `CH-0015I-final-20260814-c1826f884d67` for candidate
`CH-0015I-8c0d52273227e887` remains preserved with its original
`SOURCE_CONTRACT_FAILURE`, consumption flag, attempt numbering, state,
stdout/stderr, child result, and independent review. No historical evidence is
edited or rehabilitated. The additional root-cause classification recorded by
this correction is `SOURCE_VALIDATION_STAGE_ENVIRONMENT_LEAKAGE_DEFECT`, under
the capability-boundary class
`CERTIFICATION_CONTROL_VARIABLE_CAPABILITY_BOUNDARY_DEFECT`.

The parent source-validation runner legitimately owned
`CERTIFICATION_EVIDENCE_ROOT`, but full parent-environment inheritance exposed
that orchestration root to check 1. The real production-artifact test loaded
the real Playwright configuration, which treated root presence as activation
of the later runtime-smoke lifecycle and demanded its start marker before the
build stage. The marker could not truthfully exist in source validation.

The v1 stage-environment machine contract and canonical projector now make the
root parent-only for real source checks, bind the projected profile to source
evidence v2, and use `CERTIFICATION_ENVIRONMENT_STAGE=runtime-smoke` as the
explicit runtime activation. Runtime still requires the real product-test
start marker and fails closed without it. The exact regression loads the real
manifest/journal and real `playwright.config.ts` under a source-validation
parent root with no marker and requires discovery to pass; the paired runtime
case requires the same config to reject the missing marker. No Playwright
assertion, count, retry, skip, worker, timeout, origin, or discovery contract is
changed.

## Harness v1 source-validation and measured-continuity correction

The mandatory post-implementation integrator review classified two
release-blocking source defects:
`SOURCE_VALIDATION_STAGE_BYPASS_DEFECT` and
`ARTIFACT_CONTINUITY_SELF_ASSERTION_DEFECT`. The earlier Harness v1 source
qualification was therefore incorrect: the real runner wrote only a source
identity descriptor before marking `source-validation` passed, while the
continuity record assigned one stored artifact hash to all six lifecycle
positions instead of measuring their physical bytes.

The correction makes the machine-readable certification contract the sole
owner of the ordered source-check set. The real source stage now invokes every
canonical command against the exact candidate, stops at the first required
failure, retains stdout/stderr and result evidence outside the source tree, and
seals `interior-ai.production-certification-source-validation.v4`. Identity-only,
missing, extra, duplicate, reordered, substituted, failed, stale, incomplete,
or tampered evidence cannot pass state validation.

Continuity now seals independent
`interior-ai.production-certification-artifact-snapshot.v1` measurements at
immediate post-build, staged archive, compressed archive, extracted archive,
post-Phase-8, and post-runtime/browser boundaries. Canonical `.next`/`public`
artifact equality is distinct from full executable archive-closure equality.
Staging, compressed, extraction, and live roots are retained through the final
comparison, which re-reads the physical roots and archive bytes rather than
trusting stored summaries. `integration-ready` requires both the real sealed
source result and physically measured continuity.

The correction changes only certification infrastructure. It does not change
product/UI, Floor Plan Upload, telemetry bootstrap, NFT tracing, timestamp,
schema-v3/journal-v1, Playwright product, Phase 8, dependency, database, or
deployment behavior. The corrected bounded qualifier returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; the final independent read-only
review returned **PASS** with no remaining actionable finding. Exact-head
certification, integration, and the final CH-0015 closure audit remain separate.
No real candidate lifecycle is run by this correction.

## Production Certification Harness v1 finalization

Harness v1 supersedes the earlier runtime-only final lifecycle described in the
chronological CH-0015I records below. The prior qualification was
`NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT`: final standalone verification did not
require Phase 8, all seven browser-owner reports, continuity, or one complete
candidate/artifact/harness identity.

Final `verify-standalone` now additionally requires the sealed external
certification state/root, complete Phase 8 raw evidence and budgets, runtime
smoke 2/2 with telemetry provenance, the exact required identities/projects for
Floor Plan Upload, Pro Visual, Guest Save, My Designs, Public Share, Cart, and
Retailer with zero retry/skip/flake, six-point artifact continuity, and exact
manifest/journal/closure/archive/harness bindings. Simulation-classified,
missing, duplicated, partial, stale, contradictory, or cross-run evidence fails
closed. `verify-archive-preflight` remains standalone and explicitly non-final.
Real retained Phase 8 and Playwright reports are reparsed and compared with
their certification summaries; merely relabelling a hash cannot pass.

The committed archive owner derives the recursive local-ESM verifier closure
from canonical entrypoints, retains its import-edge ledger and aggregate hash,
stages physical contained bytes with per-file reasons, compresses
deterministically with normalized ownership metadata, rejects escaping symlink
targets before staged or extracted verification executes, and verifies
extracted inventory externally. Phase 8 and all
seven Playwright owners can write directly beneath one authorized external root
without `.local` contamination or overwrite. The complete architecture and
runbook are in `docs/qa/production-certification-harness-v1.md`.

No real build, Phase 8, runtime smoke, browser-owner matrix, or Full E2E is run
by source qualification. The bounded qualifier returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; exact-head certification,
integration, and the final CH-0015 closure audit remain pending.

## CH-0015I staged archive preflight verification (historical predecessor)

Classification is **STAGED_ARCHIVE_PREFLIGHT_VERIFIER_CONTRACT_DEFECT /
MISSING_STANDALONE_PRE_RUNTIME_VERIFICATION_MODE**. The preserved certification
disposition is **STOPPED_NOT_CERTIFIED_NOT_INTEGRATED**. The prior staged gate
was impossible to satisfy: repository `verify-preflight` allowed pending tests
but required intentionally excluded Git metadata, while `verify-standalone`
worked after extraction but correctly required runtime-smoke evidence that did
not exist before Phase 8 or runtime/browser certification. The failure remains
a production-evidence lifecycle defect, not an archive-file, module-resolution,
candidate-identity, Playwright, Phase 8, runtime-smoke, Floor Plan, or telemetry
failure.

The production-artifact owner now exposes three separate lifecycle modes:

| CLI mode | Repository/Git | Manifest/journal and artifact checks | Runtime/browser evidence | Result / lifecycle |
| --- | --- | --- | --- | --- |
| `verify-preflight` | Repository-bound; Git, exact checkout, and clean source are required | v3 manifest, v1 journal, generated-source/build ordering, Build ID, artifact inventory, trace/NFT closure, and current checkout are revalidated | Not required | Existing non-final repository pre-runtime check |
| `verify-archive-preflight` | Standalone; `.git` is prohibited and no checkout fallback is accepted | v3 manifest and sidecar, v1 journal, bound inventory snapshot, nonce/candidate/commit/tree, commands, toolchain, wrapper, Build ID, artifact SHA-256, every `.next`/`public` file, trace/NFT safety, verifier-source closure, and expected external identity are revalidated | Not required; absent evidence passes only here, while partial or contradictory evidence fails | Explicit `archive-preflight` JSON with `preflightPassed=true`, `certificationComplete=false`, `runtimeEvidenceRequired=true`, and `finalStandaloneVerificationRequired=true` |
| `verify-standalone` | Standalone; no Git or `node_modules` required | Existing extracted artifact, lockfile, wrapper, manifest sidecar, Build ID, inventory, trace/NFT, report, and timing bindings remain | Required; missing, failed, skipped, flaky, incomplete, stale, or mismatched runtime evidence fails | Existing final standalone artifact verification after runtime smoke |

Run the staged pre-runtime verifier from the physical staged root before
compression and before Phase 8/runtime smoke:

```sh
PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID='<candidate-id>' \
PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA='<candidate-commit>' \
PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA='<candidate-tree>' \
PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID='<next-build-id>' \
PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256='<artifact-sha256>' \
PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256='<closure-sha256>' \
node scripts/production-artifact-evidence.mjs verify-archive-preflight
```

The staged tree must carry the canonical manifest plus sidecar, semantic journal,
bound artifact-inventory snapshot, `.next`, `public`, package/lockfile identity,
and the complete nine-file verifier closure. Relative ESM dependencies must be
regular files contained in that same staged tree, and their aggregate SHA-256
must equal the staging owner's external expected identity. Missing closure files,
symlink/import escape, `.git`, environment files, Vercel/private evidence,
machine-local portable paths, cross-run bindings, incomplete build/inventory/
manifest events, unsafe artifact paths, and any identity mismatch fail closed.
The verifier requires no environment file and prints no raw environment value.

Runtime-smoke reports, browser-owner evidence, Phase 8 outcomes, and a final
certification outcome are intentionally excluded from the required preflight
evidence. Complete test evidence may be revalidated if already present, but it
never changes the preflight result into certification. Only the unchanged
`verify-standalone` final mode can satisfy the standalone post-runtime contract;
its tests were not made optional and a preflight result is not a promotion or
integration input. Unknown modes fail closed.

The focused owner constructs a task-owned staged tree outside the repository,
copies the real verifier closure, excludes `.git` and runtime/browser evidence,
and executes the physical staged entry point. It proves repository preflight
fails without Git, final standalone fails without runtime evidence, archive
preflight succeeds and remains non-final, every import resolves to staged bytes,
and the fixture is removed. The same physical fixture passes final standalone
only after valid runtime evidence is present. Deterministic negatives cover
schema/journal/identity/inventory/artifact/closure/order/completion/path/secret
boundaries and the existing final runtime failure matrix.

No Git metadata is copied, runtime smoke is not reordered, and the existing
archive constructor, scanner, file-inclusion policy, compression, upload paths,
schema-v3 field meanings, journal-v1 field meanings, timestamp ordering,
Playwright external report paths, Phase 8 budgets, product behavior, Floor Plan,
telemetry, and NFT tracing are unchanged. Exact-head certification, integration,
and the final CH-0015 closure audit remain pending.

## CH-0015I external Playwright report destinations

Classification is **EXTERNAL_PLAYWRIGHT_REPORT_PATH_CONTRACT_DEFECT /
ABSOLUTE_EXTERNAL_REPORT_PATH_REJECTED**. Exact-head certification supplied a
valid, absent, writable absolute `PLAYWRIGHT_JSON_OUTPUT_FILE` beneath its
private evidence root, but `scripts/production-artifact-playwright.mjs` applied
the manifest helper's repository-relative rule to the report. Playwright exited
before reporter initialization, server startup, or discovery. The preserved
failed integrator capture remains historical and is not relabelled or reused.

The complete `PLAYWRIGHT_JSON_OUTPUT_FILE` inventory is:

| Owner | Requirement and accepted class | Execution/parent ownership | Existing target and later use |
| --- | --- | --- | --- |
| `playwright.config.ts` | Required whenever `PRODUCTION_EVIDENCE_MANIFEST` activates production evidence; accepts the two validated classes below | GitHub/local CI and exact-head certification; Playwright's JSON reporter owns the final file | Existing targets reject in config preflight; Playwright writes the validated absolute destination |
| `scripts/production-artifact-evidence.mjs` smoke environment | Produces the variable from its CLI report option/default; committed smoke remains repository-relative | Stable-checks/local CI; `.local/production-artifact-evidence` | The committed owner removes its prior task-owned report, then canonicalizes, hashes, binds, copies, and bundles the newly produced report |
| `scripts/production-artifact-evidence.mjs` CLI default | Reads an optional value and otherwise selects `.local/production-artifact-evidence/runtime-smoke.json` | Same production-smoke owner | Delegates cleanup and later evidence handling to the smoke path above |
| `scripts/test-production-artifact-evidence.mjs` | Supplies both a repository-relative compatibility path and an absolute external path/root | Focused local/CI contract; fixture-owned `.local` or task-owned temporary external root | Both start absent; reports are parsed and hashed, and the external root is removed after verification |

No other source consumes this variable. The Floor Plan, Pro Visual, Guest Save,
My Designs, Public Share, Cart, and Retailer configurations consume the separate
`REQUIRED_TEST_REPORT_PATH`; their existing repository-relative CI/report upload
contract is not part of this change.

`scripts/playwright-report-path.mjs` now owns the report destination policy.
Production evidence accepts exactly two classes:

- `repository-relative` remains available for committed stable-checks and local
  production-evidence ownership. It must be a normalized `.json` beneath
  `.local/production-artifact-evidence`, remain inside the current worktree
  after parent realpath resolution, have an existing writable parent, and name
  an absent target.
- `external-evidence-root` is the exact-head certification class. The report
  and `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` must be normalized absolute paths.
  The root must already exist as a real directory rather than a symlink; the
  report parent must already exist and be writable; parent realpath and the
  canonical target must remain beneath the root; and the root, parent, and
  target must remain outside the current repository, canonical checkout, and
  registered Git worktrees. The final `.json` must not already exist.

Empty, malformed, NUL-bearing, traversing, unknown-policy, missing-root,
relative-root, missing-parent, unwritable-parent, existing-target, directory-
target, symlink-escape, repository, and outside-authorized-root destinations
fail closed with value-free errors. The resolver performs no file creation and
never precreates the report. It returns the canonical absolute output path to
the real Playwright config; a valid external path is not rewritten into
`.local`, `test-results`, or `playwright-report`.

Schema-v3 manifest and v1 journal validation still complete before report-path
resolution and before Playwright can expose the production web server. Reporter
metadata remains the prior portable artifact identity: the machine-local
external root and absolute report path are not serialized into the production
manifest or report metadata. The production smoke wrapper and GitHub workflow
retain their existing repository-relative cleanup, canonicalization, hashing,
copy, and bundle ownership; the seven Floor Plan, Pro Visual, Guest Save, My
Designs, Public Share, Cart, and Retailer required-test configs continue to use
their separate repository-relative `REQUIRED_TEST_REPORT_PATH` contract.

The existing production-artifact owner exercises both path classes. Its real
external producer-to-consumer case creates a task-owned root outside the test
repository, supplies the real v3 manifest/journal and both environment values,
loads actual `playwright.config.ts` with `--list`, starts no server, discovers
exactly the two committed runtime-smoke specs, writes/parses/hashes the report
at the exact external path, proves no repository fallback, proves a synthetic
secret is absent, and removes the temporary root. Schema, journal, server,
worker, retry, timeout, origin, discovery, runtime-smoke assertion, artifact,
archive, scanner, and product behavior are unchanged. Exact-head
recertification, integration, and the final CH-0015 closure audit remain
pending.

## CH-0015I Playwright schema-consumer compatibility

Classification is **PRODUCTION_ARTIFACT_SCHEMA_CONSUMER_DRIFT**. The exact
producer emitted `interior-ai.production-artifact-evidence.v3` while
`playwright.config.ts` accepted only the former v2 schema literal. The canonical
runtime-smoke owner supplied that v3 manifest through
`PRODUCTION_EVIDENCE_MANIFEST`, so configuration loading failed before the
production server or test discovery could begin.

`scripts/production-artifact-contract.mjs` is now the side-effect-free canonical
owner for the production schema, validator version, semantic-journal schema and
version, wrapper version, and build/server command identities. The evidence
writer/validator and `scripts/production-artifact-playwright.mjs` consume that
owner; Playwright does not import or execute the evidence wrapper merely to read
a version. The current exact-head certification policy accepts only schema v3 /
validator version 3 with the v1 semantic journal. Historical v2 evidence remains
historical/offline evidence and is rejected by the current runtime-smoke path.
Unknown schemas and future versions fail closed.

Before Playwright exposes a web-server command, the loader invokes the wrapper's
validation-only CLI and its complete canonical preflight must succeed. Runtime
smoke also supplies a SHA-256 of the exact canonical manifest plus the expected
commit, tree, BUILD_ID, and artifact SHA-256. The loader rechecks that hash and
sidecar, requires `PRODUCTION_EVIDENCE_JOURNAL_PATH` to equal the shared
canonical journal path validated by that CLI, requires its v1 schema/version and
completed same-run nonce, and cross-binds candidate,
commit/tree, wrapper/process, commands, generated-source-before-build ordering,
successful dependency/build/inventory outcomes, manifest completion, BUILD_ID,
and artifact inventory/hash. It also requires the pre-runtime pending-tests
state and the same staging/production APP/NEXT_PUBLIC/VERCEL environment
contract. Errors are field-oriented and never include raw environment values.

The accepted identity remains additive Playwright metadata. Server selection is
unchanged: production artifact evidence selects
`npm run evidence:production:serve`, disables listener reuse, and reaches the
unchanged `npm run start`; non-evidence production-server and development-server
paths retain their prior selection. Retry, worker, timeout, origin, cwd,
readiness, and discovery semantics are unchanged. A configuration-only
producer-to-consumer test passes a manifest written by the real producer through
the real environment path and actual `playwright.config.ts`, proves the expected
production command and exact bindings, and discovers the two runtime-smoke
identities without starting a server. Deterministic negatives cover schema,
version, journal, nonce, source/tree, BUILD_ID, artifact, ordering, process
result, inventory/completion, JSON/path/mode, and safe-error failures.

The standalone verifier archive retains its existing exact roots and scanning
policy; its explicit verifier-source inventory includes the new imported
contract module so the extracted validator remains executable. Artifact roots,
mutable-path exclusions, compression, upload roots, and sensitive-value scanner
policy are unchanged.

## CH-0015I semantic timestamp provenance

The failed ca77 certification cycle retained at
`interior-ai-release-evidence/ch0015i-final-integrator-ca77e55-20260813T120141Z`
remains historical, non-certified evidence. Its primary classification is
**D — CLOCK_SOURCE_OR_TIMESTAMP_CAPTURE_DEFECT**. The executing task-local
wrapper used `new Date().toISOString()` immediately around the generated-source
and build children, but manifest construction later rejected its missing
`NODE_ENV=production`. A separate recovery writer then replaced both pairs of
semantic boundaries with the entire build log's birthtime and mtime. The
preflight correctly rejected the resulting
`generatedSourceCheck.completedAt > build.startedAt` ordering. That evidence is
not edited, relabelled, or rehabilitated.

Portable evidence is now
`interior-ai.production-artifact-evidence.v3` / validator version 3. The
executing wrapper owns an atomic private journal with schema
`interior-ai.production-artifact-semantic-event-journal.v2`. It is created
before dependency installation and binds a UUID run nonce, candidate, commit,
tree, hashed local worktree identity, wrapper version/path/SHA-256, process and
parent identity, exact install/generated/build commands, safe build contract,
and toolchain. It records only UTC wall-clock values produced by
`new Date().toISOString()` at semantic boundaries. The portable manifest
retains the nonce, source/tree, normalized wrapper identity, process identity,
command identities, and final event fields; it does not disclose the worktree
path or environment values.

Only the journal-bound PID/parent PID may write an event. Certification may
cross the required atomic dependency-binding boundary by recording one exact
`post-dependency-install-pre-generated-source` process handoff. The handoff
binds the prior and next PID/parent PID plus its UTC completion time; only the
new process may then write generated-source and build events. Unrecorded owner
impersonation, a second handoff, or a handoff outside that boundary fails
closed. Certification requires exactly one handoff, binds it in the
certification build result, and rechecks the same record from the retained
journal and manifest during final standalone verification; the generic
single-process build command may still have none. A child signal is recorded
separately from a numeric exit code.
The actual `npm --version` output must match the exact committed
`packageManager` declaration; recovery repeats that executable check rather
than trusting the declaration as observed toolchain provenance.

The semantic sequence is fail-closed:

```text
cycleStartedAt
<= installStartedAt <= installCompletedAt
<= optional processHandoffCompletedAt
<= generatedSourceCheckStartedAt <= generatedSourceCheckCompletedAt
<= buildStartedAt <= buildCompletedAt
<= artifactInventoryStartedAt <= artifactInventoryCompletedAt
<= manifestCreatedAt
```

`buildWrapperStartedAt` is a separate envelope field. It may precede the
generated-source check and never substitutes for `buildStartedAt`, which is
atomically persisted immediately before the wrapper dispatches the actual
canonical `npm run build` child. `buildCompletedAt` is persisted immediately
after that child returns, including a nonzero return, before NFT or artifact
inspection. Generated-source start/completion and child exit are treated the
same way. A generated-source failure leaves build state pending with no build
timestamps; a build failure retains truthful start/completion/exit and cannot
certify an artifact.

After a successful build, artifact inventory has its own start/completion or
failure state. Its canonical snapshot is atomically written and bound to the
same nonce, commit/tree, Next.js BUILD_ID, and artifact SHA-256 before manifest
construction. A later manifest or evidence-writer failure therefore cannot
erase the semantic child boundaries. Recovery uses
`PRODUCTION_EVIDENCE_RUN_NONCE='<recorded-uuid>' npm run evidence:production:recover`
and accepts only a complete same-worktree journal whose source/tree, commands,
wrapper version/hash, toolchain, inventory snapshot, BUILD_ID, and artifact hash
still agree. Missing, malformed, incomplete, cross-run, cross-source,
cross-command, cross-wrapper, or cross-artifact journals fail closed.

Birthtime, ctime, mtime, log start/end, directory timestamps, and inferred
times are prohibited as inputs to semantic fields. They may appear only in the
journal's explicitly labelled optional diagnostic metadata and are never
copied into `generatedSourceCheck.startedAt/completedAt` or
`build.startedAt/completedAt`. The substantive
`generatedSourceCheckCompletedAt <= buildStartedAt` guarantee remains; hashes
and source identity complement rather than replace proof that drift checking
completed before actual build dispatch. Archive roots, bundle inputs,
compression, extraction, scanner policy, telemetry, Floor Plan behavior, NFT
tracing, and Phase 8 contracts are unchanged.

## Floor Plan route NFT regression contract

Every production evidence build now runs a fail-closed Floor Plan NFT check
against these exact generated manifests:

- `.next/server/app/api/admin/floor-plan-imports/[id]/construction-sources/route.js.nft.json`;
- `.next/server/app/api/admin/floor-plan-imports/[id]/supplementary-sources/route.js.nft.json`;
- `.next/server/app/api/floor-plan-imports/[id]/process/route.js.nft.json`.

The check requires each route chunk, safe contained raw references, zero missing
or prohibited paths, at least one canonical
`public/assets/floor-plans/**` reference, and zero lexical or resolved
`scripts/test-*` and `tests/**` edges. It reports the exact source-relative
NFT/path edge on failure. `artifact.floorPlanRouteNftContract` retains all three
ordered NFT/chunk identities and their positive reference, unique-path, and
public-asset counts. Checkout validation recomputes the contract; standalone
validation fail-closes on missing, reordered, malformed, or implausible target
summaries. No exact total reference count is a release invariant.

CH-0015I preliminary tracer diagnostic evidence from a clean snapshot is
stored outside the repository at
`interior-ai-release-evidence/ch0015i-floor-plan-nft-overtrace-precommit-23cfa48-20260813T112112Z`.
The build completed 57/57 pages with BUILD_ID
`jO3szeGYAxDWICbI5COws`, retained 112 raw NFTs, and recorded artifact SHA-256
`19a7382a0bf9af45158215ba1d2bd0e6fd7ebfc71488f611a0acff33227e2c9f`.
Trace closure has 34,669 edges, 2,878 unique paths, zero missing/prohibited
paths, and SHA-256
`427255c15edd3888a10d5b26c51272c7dcad1887ca283cedd9fe144c84a113c2`.
Each target fell from 3,307 broad references to 374, retained seven Floor Plan
assets, and has zero script/test edges. Both previously rejected scripts have
zero edges globally. This snapshot predates the later descriptor-identity
hardening, so it proves the static trace formulation but is not promoted as
final-candidate evidence; the exact committed-head build supersedes it.
The authoritative committed-head capture is retained at
`interior-ai-release-evidence/ch0015i-floor-plan-nft-overtrace-exact-head-20260813T114021Z`;
its manifests and sidecars own the final source, artifact, NFT, trace, and plan
hashes without copying machine-local evidence into Git.

The recovered constructor was also replayed preliminarily in plan-only mode under the same
evidence root. Its 69,874 planned files have 69,874 provenance rows, zero
duplicates, zero missing inclusion reasons, and zero missing artifact,
required-server, or NFT runtime paths. Both rejected scripts have zero
`R5_NFT_NON_ARTIFACT_REFERENCE` selections and zero scanner matches. The
unchanged exact-value scanner found zero matches and used zero exceptions. No
archive or compression was created, and neither output tracing, executable
archive scope, nor sensitive-scanner policy was weakened.
The committed-head plan-only replay remains the authoritative result.

## Runtime telemetry provenance in schema v3

`interior-ai.production-artifact-evidence.v3` / validator version 3 requires
the furnished-template Playwright result to carry four bounded inline JSON
attachments named `runtime-smoke-telemetry-bootstrap-evidence`: the initial
document followed by reloads 1–3. Each
`interior-ai.runtime-smoke-telemetry-bootstrap-evidence.v1` record has a strict
key set, known collector/import enums, nonnegative safe integers, booleans,
current activation generation, semantic ready-model counts, substantive timing
and lifecycle/renderer counters, exact queued/flushed accounting, and the pure
validator's `valid`/`issues` result.

Successful evidence requires four valid records in consecutive fresh realm
generations. The manifest stores a compact derived
`interior-ai.runtime-smoke-telemetry-bootstrap-summary.v1`; validation decodes
the canonical base64 attachments, rejects attachment paths and missing/extra or
malformed provenance, recomputes every cross-field invariant, and requires the
derived summary to match the report. A failed smoke may retain a partial or
invalid observation sequence for diagnosis, but cannot turn it into valid
repository evidence. Contradictory queued/flushed state remains in the bound
report rather than being erased. The report and manifest retain the existing
source commit, artifact SHA-256, BUILD_ID, phase-timing, process, and truthfulness
bindings and record no machine path, environment value, credential, or payload.

## Claim supported

The evidence proves that one exact clean commit was installed with
`npm ci --include=dev` (build tooling included from the committed lockfile),
checked for generated surface-runtime drift, built once in strict staging or
production mode, hashed, started with the production Next.js server, and tested
without a development-server fallback. The Playwright JSON report identifies the
same source commit, artifact SHA-256, and Next.js build ID returned by the running
health endpoint.

It does not claim bit-for-bit reproducibility across machines. It does not prove
that Vercel, GitHub, OAuth, scheduler, or database controls are configured
correctly. A local `next start` process also does not reproduce Vercel-specific
edge, serverless, routing, networking, or project controls.

## Canonical flow

Run this only in a fresh clean checkout without `.env`, `.env.local`,
`.env.production`, `.env.production.local`, or an existing `.next` directory.
Supply required non-production configuration through the process environment;
the evidence records required variable names and safe booleans, never values or
an environment dump. `APP_ENV` and `NEXT_PUBLIC_APP_ENV` must match; an optional
`VERCEL_ENV=preview` maps only to staging and `VERCEL_ENV=production` maps only
to production.

```sh
PRODUCTION_EVIDENCE_CANDIDATE_ID='<immutable-candidate-id>' \
APP_ENV=staging \
CATALOG_STRICT_VALIDATION=true \
npm run evidence:production:build

npm run evidence:production:smoke
npm run evidence:production:verify
npm run evidence:production:bundle
```

If the build succeeds and inventory has not started, or inventory completes but
later manifest/evidence writing fails, retain the private journal and emitted
run nonce. An inventory that started and failed remains failed evidence; it is
not retried or certified by recovery. Recovery is an explicit same-run
operation, never an automatic filesystem-time fallback:

```sh
PRODUCTION_EVIDENCE_RUN_NONCE='<recorded-uuid>' \
npm run evidence:production:recover
```

`evidence:production:build` refuses a dirty tracked tree, any untracked source,
an ignored file outside explicit generated dependency/build/evidence roots, an
unresolved submodule, an influential local environment
file, an existing build output, an unknown/development environment, a
development-only QA/fixture flag, missing configuration shape, or non-strict
catalog mode. It then runs the committed-lockfile install, the existing generated
surface runtime check, one production build, and artifact hashing.

`evidence:production:smoke` verifies the manifest before starting the app. Its
Playwright configuration cannot reuse an existing listener and selects
`npm run evidence:production:serve`, which re-verifies the artifact and invokes
the unchanged `npm run start` production server. It never selects `npm run dev`.
The health response must return the expected full commit, artifact SHA-256, and
Next.js build ID before the runtime smoke can pass.

The Playwright JSON is normalized so its repository-local configuration and
test/output paths use `<repository-root>` rather than a machine path. Validation
also checks the report's actual web-server command, URL, listener-reuse setting,
process exit code, counts, metadata, secret-bearing fields/known values, and
embedded SHA-256 identity. CH-0017 additionally validates the two stable runtime
requirement identities, the Chromium project, unfiltered configuration,
`forbidOnly`, per-test execution, and aggregate/per-test agreement through the
canonical required-test manifest.

The furnished-template identity does not infer readiness from completed GLB
HTTP responses. The production component reports its existing semantic load
lifecycle to diagnostics. The test fails immediately on a terminal load code,
waits boundedly for semantic readiness, and then applies the original bounds,
selection, remount, three reload, persistence, render-idle, and final-state
assertions. After exact-head run `30707099465` exhausted the former 20,000 ms
bounds phase ceiling, exact-head run at
`d295e98c4abe3b00d02507cc3820df20439b2134` exhausted reload-1 at
70,001/70,000 ms. The retained report proved only that remount was the last
completed phase and the coarse lifecycle remained `ready`; it did not retain
the reload's current scene/model/network state or a safe progress timeline.
Contract audit found 311,000 ms of configured finite sequential waits inside
each 70,000 ms reload budget, plus an unbounded browser evaluation. The
70-second value was a hang ceiling, not an authoritative product-performance
requirement, and the GLBs are repository-owned local production assets rather
than external network dependencies.

One canonical 14-phase contract now derives every correctness timeout from its
named nested operations plus an explicit orchestration margin. Reload-1,
reload-2, and reload-3 share the same 246,000 ms legal operation envelope plus
30,000 ms margin, for 276,000 ms each. Storage hydration and the final
diagnostic snapshot have explicit 5,000 ms wall-clock bounds; every diagnostic
evaluation is bounded by its enclosing named operation, and settle/readiness
loops enforce elapsed time rather than a sample count. A separate non-failing 70,000 ms
performance observation threshold records regressions without redefining test
correctness. Safe progress checkpoints reset a bounded 75,000 ms no-progress
watchdog, while terminal model errors still fail immediately. The canonical
1,987,000 ms sequential sum plus 75,000 ms of named whole-test overhead derives
the 2,062,000 ms whole-test timeout. Three clean CI-like runs of this exact
corrected tree used 7,253–7,365/71,000 ms for bounds,
11,908–12,330/165,000 ms for remount, and 21,746–25,016/276,000 ms for each
reload, with no performance warning. This
fixes the invalid parent/nested phase contract without adding retries, seeding
a test-only success state, changing `npm run start`, or weakening the required
identity.

Generated output is written only under the ignored directory
`.local/production-artifact-evidence/`:

- `manifest.json`: canonical UTF-8 provenance manifest;
- `manifest.json.sha256`: accidental-tamper sidecar for the exact manifest bytes;
- `semantic-event-journal.json`: private atomic same-run event journal (not a
  standalone bundle input);
- `artifact-inventory.json`: private same-run inventory snapshot bound by the
  journal (not a standalone bundle input);
- `runtime-smoke.json`: Playwright JSON report bound to the manifest identity.
- `runtime-smoke-phases.json`: strict portable per-phase timing and outcome
  evidence bound by path, SHA-256, phase count, elapsed total, and derived
  whole-test timeout in the production manifest;
- `upload/ch0016-ch0017-evidence-bundle.tar.gz`: a scanned transport archive
  containing the exact artifact roots, manifest/report, lockfile identity, and
  standalone verifier inputs while preserving symlinks;
- `upload/ch0016-ch0017-evidence-bundle.tar.gz.sha256`: the archive sidecar.

Playwright commit and diff capture is disabled because CI diffs can contain
configured environment values from workflow source. After constraining its
cleanup target to the dedicated upload directory, the bundle command removes
any prior upload candidate, revalidates the complete evidence, scans artifact
bytes for configured sensitive values, and packages only the approved inputs.
Raw Playwright traces and other unscanned diagnostics are not upload inputs.

Repository-owned artifact uploads are deliberately separate:

| Job/path | Retained policy |
| --- | --- |
| `stable-checks` → `.local/production-artifact-evidence/upload/` | Only the validated standalone `.tar.gz` bundle and SHA-256 sidecar. The bundle is created only after required smoke succeeds; missing files fail the upload. Artifact bytes are scanned for every sensitive CI environment value, including API/access keys. |
| `e2e-full` → `.local/required-test-upload/` | Mandatory envelope/Playwright JSON plus a truthful totals/process/source/project summary are required even when the advisory suite fails. Safe optional text is normalized into `optional-diagnostics/`; unsafe or binary optional files are omitted with category/reason/SHA-256. Playwright `.last-run.json` is excluded with a hashed redundancy reason because its status/failed IDs add nothing beyond the hash-bound report and evidence envelope. `included` names the exact staged archive tree, including its inventory, and downloaded-tree verification rejects missing, extra, hidden, or renamed entries. Mandatory unsafe or malformed content rejects the bundle. Preparation publishes atomically; any failure leaves no uploadable directory. |
| `secret-scan` → `.local/gitleaks-upload/` | The official Gitleaks v2 scan remains authoritative, but automatic checkout-root upload is disabled. A post-checkout step proves `git rev-parse HEAD` equals the event's exact source SHA. Atomic staging preserves `results.sarif` bytes and adds only a manifest with distinct `testedSourceSha` and `workflowContextSha`; verification is bound to `testedSourceSha`, its SARIF hash, and the exact two root-level archive entries. Both entries are retained for 90 days. A real artifact download must confirm the final ZIP layout. |
| Raw `.local/required-test-evidence/`, `test-results/`, traces, video, screenshots, attachments, archives | Never direct upload inputs. Text diagnostics may be copied only through the sanitizer; uninspectable binary forms are omitted rather than rewritten. |

The Git-history secret-scan action still produces the required check result.
Repository staging changes only the transport layout; it cannot turn scan
findings or action failure into success.

After downloading the GitHub artifact into a fresh directory, verify the archive
sidecar, extract it, and run:

```sh
PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA='<workflow-head-sha>' \
node scripts/production-artifact-evidence.mjs verify-standalone
```

Standalone mode requires that explicit source SHA, rehashes the extracted
`.next` and `public` inventory (including preserved symlink identities), checks
the lockfile, build ID, manifest sidecar, runtime report hash and stable test
identities, and rejects source/artifact/report disagreement. It does not need a
Git checkout or `node_modules`; the original run remains responsible for the
recorded full trace-closure and installed-lockfile checks.

The manifest is an automated report suitable for hashing into the existing
Phase 15 signed release manifest. The sidecar is an integrity check, not a
substitute for the product-owner signature required by the final release
process.

## Repository-controlled contract

| Boundary | Required evidence |
| --- | --- |
| Source | Full commit SHA; branch/ref metadata when available; clean tracked and untracked status; clean submodules; no influential local environment or other ignored build-input files outside explicit generated roots. |
| Dependencies | Exact `npm@11.6.2` package-manager declaration; `package-lock.json` v3 SHA-256; `node_modules/.package-lock.json` SHA-256 produced after `npm ci --include=dev`; Node/npm versions. |
| Generated source | Existing surface-runtime generator `--check` completed before the build. This does not resolve CH-0013's separate schema, payload, or command-ownership work. |
| Environment | Explicit `staging` or `production`; strict catalog validation; development QA/fixture flags disabled; required configuration names present; no values recorded. |
| Build | One `npm run build`; production mode; UTC start/completion timestamps; nonempty `.next/BUILD_ID`. |
| Artifact | Stable SHA-256 inventory of `.next` and `public`, excluding only named mutable Next cache/diagnostic paths; required manifests/server/static output present. |
| Trace closure | Every `.nft.json` is parsed; positive trace/reference counts are required; missing, outside-repository, `.env`, Git, local evidence, Vercel metadata, private release-evidence, and test-result lexical or resolved paths are rejected; unique file and contained-directory contents are hashed. |
| Test | Runtime smoke uses the verified production server; no listener reuse; process exit zero; expected tests greater than zero; zero failure, flaky, or skipped cases; canonical portable JSON paths, metadata, and health identity match the artifact. |
| Integrity | Canonical manifest plus sidecar; current source/lock/install/artifact/trace/report hashes rechecked; stale source/artifact/report reuse rejected. |
| Claim | `evidenceKind=local-production-mode-artifact`; `releaseReady=false`; `actualDeploymentVerified=false`; every external control remains `not_verified`. |

The validator fails closed for a missing/malformed manifest, source or lockfile
mismatch, dirty or untracked source, stale generated output, development mode,
non-strict catalog mode, enabled test fixtures, missing build output, artifact or
report tampering, trace gaps, a different build ID, zero/failed/flaky/skipped
smoke or nonzero test process, non-UTC/stale timestamps, a mismatched same-artifact identity, secret-bearing
fields, or a repository claim that marks an external control verified.

## CI behavior and retention

### Structured runtime failure evidence

Portable runtime timing schema version 3 binds any failed smoke result to one
structured provenance object repeated consistently at the timing-envelope and
failed-phase boundaries. The paired Playwright report carries the same safe
provenance. `verify-runtime-failure` verifies exact source and artifact identity,
report/timing hashes, nonzero process status, failed test identity, phase and
operation budgets, parent/child outcomes, checkpoint/lifecycle data, and the
closed failure-kind semantics before a stable diagnostic can be staged.

This permits safe diagnosis without turning a failed smoke into release
evidence. Nested-operation timeout means the child operation is `timed-out` and
the parent phase is `failed`; phase timeout means the parent is `timed-out` and
no child is invented. No-progress, terminal-lifecycle, assertion, and unexpected
errors retain distinct kinds. Contradictory or legacy ambiguous timing is
withheld. A verified failure archive remains the exact existing three-file safe
subset; successful production evidence continues to require process exit zero,
two passed identities, zero failures/flakes/skips, complete timing, and null
failure provenance.

Each bounded runtime operation now starts from an immutable registered deadline
containing its operation ID, canonical budget, start, and deadline. Polling may
derive a smaller `attemptTimeoutMs` and records its
`remainingAtAttemptStartMs`, but `operationElapsedMs` is always measured from
the canonical start and `operationBudgetMs` always comes from the registered
phase contract. The timeout constructor accepts only the branded operation
attempt; a leaf caller cannot substitute a decreasing allowance as the
canonical budget. Schema version 3 validates both timing classes and rejects an
attempt greater than its recorded remaining allowance, remaining allowance
greater than the canonical budget, or canonical-budget drift.

The deadline context uses one high-resolution monotonic clock for start,
remaining allowance, integer attempt conversion, and final expiration. A
canonical nested timeout persists `operationElapsedPreciseMs`, its floored
portable `operationElapsedMs`, and `deadlineReached=true`; the verifier requires
all three to agree with the registered budget. An early full-window timer wakeup
waits for the residual monotonic interval while the browser task remains live.
A capped attempt that expires materially before the canonical deadline is not
relabelled as operation expiration. This preserves a valid runtime report and
the exact three-file safe failure archive at the one-millisecond display
boundary without weakening rejection of genuinely early or contradictory
evidence.

When a final `diagnostics-settle-evaluation` attempt is capped by the remaining
42,000 ms parent window, its internal timeout remains noncanonical. The parent
handler waits through any residual integer-timer granularity and emits the
branded `diagnostics-settle` timeout only after the parent monotonic deadline is
reached, preserving the correct operation identity instead of an unstructured
failure.

The 10,000 ms `diagnostics-settle-evaluation` child and 42,000 ms
`diagnostics-settle` parent are distinct canonical operations. The verifier also
rechecks the manifest sidecar/canonical form, current clean checkout, artifact
inventory/hash, BUILD_ID, commands/server, and Playwright production metadata.
Self-consistent substitutions confined to manifest/test fields are rejected.

The required `stable-checks` job migrates its fresh PostgreSQL service, runs the
negative-case contract test, performs the strict evidence build with shaped
nonfunctional staging placeholders, runs runtime smoke against that exact
artifact, validates it, and uploads only the prepared standalone bundle with a
requested 14-day retention. Placeholder configuration
proves application configuration shape only; no external integration call or
external-control claim follows from it. GitHub execution and artifact retention
must be confirmed from an actual workflow run.

The Stable database parent classifies that service as
`github-hosted-service-container-loopback-forward` only after a private,
run/attempt/nonce-bound attestation and a fresh adapter-side Docker recheck prove
one running healthy official `postgres:15` container, its exact 5432/tcp
publication, live image repository identity, and exact PostgreSQL
server-address/network-gateway relationship. Native loopback remains the only
accepted release-certification transport. The standalone summary retains the
safe transport class, attestation digest, live-verification result, and approved
image class; all container/network addresses and identifiers remain private.

After that strict artifact and its runtime evidence are complete,
`ci.public-share-responsive` reuses the same checked-out `.next` output through
`npm run start` for its Chromium/WebKit merge-required matrix. It does not run a
second build or any development server. Its source-bound JSON/envelope remains
under ignored `.local/required-test-evidence/`; raw Playwright output is not an
upload input and trace, screenshot, and video capture are disabled for the
required run. This added consumer does not alter the CH-0016 bundle inputs,
hash, upload inventory, retention request, or source/artifact claims.

The first local canonical responsive consumer run at implementation snapshot
`729caae` truthfully failed: its static prerequisite and WebKit 4/4 passed, while
Chromium 0/4 encountered two public-share roots during hydration. The failure
does not invalidate the existing CH-0016 artifact contract or alter its bundle;
it prevents RC55 closure and requires a separate production-behavior decision.

Outcome-D execution at exact head `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`
failed the first furnished-template diagnostic poll in both attempts while the
health/catalog identity passed. Because bundling follows smoke, no stable bundle
was published, which is the intended fail-closed ordering. The repository
follow-up replaces the timing proxy with semantic model readiness and keeps the
same source/artifact/report binding. A fresh external exact-head run is still
required before durable evidence is claimed.

Local validation output generated in `.local/production-artifact-evidence/`
inside a detached worktree is ephemeral. Its hashes and results may be recorded
for local verification, but the temporary manifest, runtime report, and built
artifact are not durable release evidence and must not be committed merely for
retention. Durable evidence remains pending a real GitHub Actions execution,
successful artifact upload, and platform confirmation of the requested expiry.

The existing Vercel prebuilt path remains the owner for Build Output API
deployment identity. Its source-tree inspection includes non-ignored untracked
files and rejects ignored inputs outside explicit generated roots; pulled
`.vercel` configuration remains an external platform boundary.
Staging, certification, promotion, and cross-project production handling remain
separately authorized external operations under
`docs/qa/vercel-prebuilt-release.md`.

## External verification checklist

Repository evidence fixes none of the controls below. The responsible human or
process must attach platform evidence without copying secrets.

| Control | Platform | Expected state | Evidence required | Responsible role/process | Date/status |
| --- | --- | --- | --- | --- | --- |
| Deployment artifact and runtime configuration | Vercel | Recorded project/environment deploys the intended prebuilt output with approved configuration | Deployment ID/URL, project/environment ID, artifact comparison, build/runtime configuration fingerprint | Release engineering | Unverified |
| Required workflow and retention | GitHub | Required checks, permissions, protected branches, immutable run identity, and retained evidence are approved | Workflow run URL/ID, commit, required-check settings, artifact digest and expiry | Repository administration | Unverified |
| Redirects and credentials | OAuth provider | Approved non-production/production clients, redirects, scopes, and credential ownership | Provider project/client identifiers, reviewed redirect/scopes, verifier and timestamp | Identity/security owner | Unverified |
| Background jobs | Scheduler | Approved identity, target, cadence, retry, and environment | Scheduler job ID/configuration evidence, target commit/deployment, verifier and timestamp | Operations owner | Unverified |
| Target, migrations, access, backup | Database platform | Correct isolated target and approved access/backup/migration state | Non-secret instance/database ID, migration status/digest, access/backup evidence, verifier and timestamp | Database/release owner | Unverified |

## Rollback

Revert the Outcome-C follow-up first, then
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, then the Outcome-D follow-up and
`b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, before reverting the focused CH-0016
implementation commit. That restores the previous lenient/dev
CI behavior and is therefore a release-integrity rollback, not a recommended
steady state. No schema, migration-file, dependency-version, persisted data,
deployment, or external configuration rollback is involved. Generated
`.local/production-artifact-evidence/` files are ignored and can be regenerated
from the exact clean candidate; local copies are ephemeral and are not durable
release evidence.

Direct runtime-smoke invocations use a UUID separate from Playwright repeat,
retry, worker, and process identities. Playwright startup owns only that UUID's
output subtree. The direct reporter creates a unique physical results directory,
checks invocation and build identity before consuming timings, and removes only
its results directory after verified completion (including failed test statuses).
Reporter errors retain its existing files for diagnosis. Shared parents and
pre-existing files remain intact. Per-attempt stdout records preserve the exact
identity and paths before the existing transient-file cleanup.

A direct `PLAYWRIGHT_USE_PRODUCTION_SERVER=1` run now requires the canonical
`.local/production-artifact-evidence/manifest.json` and repository preflight. It
reuses that verifier's physical artifact inventory, BUILD_ID, and source binding;
no development fallback is allowed. Its fresh loopback production server receives
the validated identity through the existing health contract, which the furnished
smoke checks before product setup even when `--grep` omits the health test.
Timing and reporter records carry the same build, artifact and manifest hashes.
Genuine development runs have an explicit development classification and no
artifact hash. Direct execution does not certify Canonical Stable, whose sealed
parent paths and server projection remain unchanged. Actual BUILD_ID bytes are
never sanitized, and historical evidence is not rewritten.
