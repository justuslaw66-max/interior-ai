# CI Auth Fixture Command Result Contract v1

## Scope and preserved mapping

This bounded correction is classified as
`COMMITTED_AUTH_RESULT_CHANNEL_MISSING`,
`AUTH_PREFLIGHT_STRUCTURED_EVIDENCE_CONTRACT_GAP`, and
`AUTH_SESSION_PREFLIGHT_FAILURE_EVIDENCE_CONTRACT_DEFECT`. These are
certification-infrastructure defects; application auth behavior, product/UI
behavior, runtime-readiness semantics, database schema, dependencies, and
certification stage semantics are unchanged.

The latest read-only channel-mapping outcome remains exactly:

`COMMITTED_RESULT_CHANNEL_INCONCLUSIVE`

That mapping remains authoritative for the pre-correction state: provider
fixture export used private `GITHUB_ENV`; auth validation and auth-session
preflight had prose-only success; production misuse used prose plus a nonzero
exit; database planning used canonical JSON on stdout; and certification
stages used wrapper results plus sealed physical state/evidence.

## Pre-edit command matrix

| Command ID / mode | Executable and argv | Inputs and semantic success | Exit and human streams | Cleanup owner | Previous machine evidence / gap |
| --- | --- | --- | --- | --- | --- |
| `ci:auth-fixture:export` / `provider-fixture-export` | package-owned `npx ts-node … scripts/ci-auth-fixture.ts export-github-env` | explicit non-production GitHub CI; physical private `GITHUB_ENV` outside workspace; runtime-generated inert pair; masks precede the sole append | 0 on complete export; mask commands and safe success prose on stdout; safe error on stderr | no process cleanup; workflow owns its private environment file | Raw provider values remain canonically transported only by `GITHUB_ENV`; no safe command-result sidecar existed |
| `ci:auth-fixture:validate` / `auth-environment-validation` | same owner with `validate-env` | explicit development/staging GitHub CI; provider grammar/pair, secret, alias, activation, and application validator pass | 0 plus prose on success; 1 plus safe error on failure | none | No machine result; prose/exit were the only command authority |
| `ci:auth-fixture:production-misuse` / `production-misuse-validation` | same owner with `production-misuse`; exact child uses `production-misuse-child` over IPC | an exact synthetic pair is rejected specifically because production activation is prohibited | parent exits 0 only after canonical expected-negative proof; child remains nonzero for the intended rejection; streams remain logs | parent owns the exact child | No dedicated command or intended-rejection proof existed; the old test accepted an in-process expected throw |
| `ci:auth-fixture:preflight` / `auth-session-preflight` | same owner with `preflight` | CI-provided inert fixture; exact loopback Next dev server; canonical session/provider/CSRF/sign-out/sign-in/discovery checks | 0 plus safe prose on success; 1 plus earliest safe failure on failure | command owns SIGTERM, bounded SIGKILL fallback, final termination, and port release | Server/request/response facts were held in memory and discarded |
| `test:advisory-auth-preflight` / `auth-session-preflight` | same owner with `preflight-local` | task-generated inert fixture and the same exact preflight contract | same | same | Same missing result/evidence contract |
| `test:e2e:runtime-smoke-ci` / `runtime-smoke-local` | same script with Playwright runtime-smoke argv | separate runtime-smoke owner | unchanged | Playwright/runtime-smoke owners | Out of scope; no auth result routing was attached |

Stable checks use export then validation. Advisory-contract and full-advisory
use export, validation, then preflight; the required workflow retains its
separate post-preflight port-isolation probe. Production-artifact evidence
continues to own only production environment shape and leak rejection. It does
not become an auth command-result owner.

## Canonical result

`scripts/ci-auth-fixture-result-contract.cjs` is the side-effect-free CommonJS
interoperability owner shared by the CommonJS ts-node auth entrypoint and the
ESM production-certification harness. The schema is:

`interior-ai.ci-auth-fixture-command-result.v1`

Every result binds schema/version, package command and mode, portable
executable/argv identity, `success`, `expected-negative-pass`, or `failure`, a
validity boolean, optional candidate commit/tree, invocation nonce, fixture
policy schema/hash, `lib/auth-env.ts` owner/hash, environment-name-set hash,
safe environment classification, start/completion timestamps, the closed
completion marker, and an aggregate SHA-256.

The result never stores OAuth values, auth secrets, cookies, session or CSRF
contents, passwords, provider tokens, raw database URLs, raw private
environment, response bodies, or private machine paths.

## Explicit external destination lifecycle

Each structured command requires all three explicit inputs:

- `CI_AUTH_FIXTURE_RESULT_ROOT`
- `CI_AUTH_FIXTURE_RESULT_PATH`
- `CI_AUTH_FIXTURE_RESULT_NONCE`

The root and target must be absolute canonical physical paths outside the
repository and every Git worktree. The root and parent must already exist; no
symlink component, repository-local fallback, or `.local` fallback is allowed.
The result and `<result>.sha256` must both be absent. Each file is written to a
mode-0600 same-parent temporary file, fsynced, renamed once, and followed by a
parent-directory fsync. Existing targets are never intentionally overwritten.
Failure to complete either file fails the command closed. GitHub workflows use
runner-temp roots and validate each sidecar with the canonical reader before
continuing.

Stdout and stderr remain human log streams. They are not semantic result
channels.

## Mode evidence

Auth environment validation records only provider-variable presence, client-ID
grammar, pair coherence, secret presence, alias-policy classification,
non-production classification, canonical application-validator result,
no-network classification, no-leak classification, and completion. Failures
retain a stable safe code/category plus safe stream descriptors and child
classification where applicable.

Production misuse passes only when the exact child IPC proves
`SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED`, synthetic fixture use, and
prohibited production activation. It also binds exit/signal/spawn status,
stdout/stderr byte counts and hashes, and positive exclusion of dependency,
loader, syntax, transport, missing-input, and database failures. An arbitrary
nonzero exit or absent result cannot pass.

Auth-session preflight retains portable invocation identity; server PID,
lifecycle, exit/signal/spawn classification, stream descriptors, listener and
readiness attempts/timestamps; and the session request's loopback/method,
status, redirect, content type, body byte/hash, safe body type, JSON parse, and
signed-out classifications. It also retains provider, CSRF, sign-out, Google
sign-in, inert-discovery, non-loopback-request-count, and log-safety results.
Cleanup records SIGTERM, SIGKILL fallback, final termination, port release,
task ownership, and completion. Response bodies, cookies, CSRF values, and
session contents remain process-private and are discarded after their safe
descriptors/classifications are sealed.

## Canonical validation

The importable reader and `ci:auth-fixture:result:validate` CLI reject unknown
or future schema, noncanonical JSON, missing completion, invalid result/mode,
stale or cross-run nonce, candidate or command mismatch, another external root,
mode evidence gaps, arbitrary expected-negative exits, preflight success
without signed-out session proof, failed server cleanup, aggregate or checksum
mismatch, stream descriptor mismatch, manual editing, and raw private-value
leakage.

Focused coverage is owned by `scripts/test-ci-auth-fixture-results.ts` and is
included in `test:auth-env-hardening`, deterministic certification simulation,
and committed-head qualification. Qualification also invokes one real
task-owned local auth-session preflight through
`scripts/run-ci-auth-fixture-real-preflight.mjs`; that owner creates and drops a
unique disposable loopback PostgreSQL database and validates the external
sidecar before cleaning its task-owned temporary result root.

## Unchanged result channels and pending release work

Provider values remain private `GITHUB_ENV` transport only. Database planning
remains canonical JSON on stdout from
`production-certification-database-lifecycle.mjs`. Certification stages remain
wrapper-result plus sealed physical state/evidence bound. This correction does
not generalize auth handling into a repository-wide stream parser.

A fresh rehearsal remains pending. Immutable final certification, integration,
and the CH-0015 closure audit remain pending; none is authorized by this
correction.
