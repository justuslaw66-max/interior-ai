# Required-test truthfulness

Status: CH-0017 remains reopened after Outcome-C run `30707099465` at
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`. Its repository-controlled bounds
budget and unmasked synthetic OAuth transport defects are remediated by the
follow-up at `53a0c98bab4d5a211c93fd1f4f5057806e074bbd`. The workflow-only
follow-up containing this record separates ordinary required PR execution from
the deliberate full advisory lane. A new exact-head GitHub run, downloaded
artifact inspection, and required-check configuration remain external controls
and are not marked verified here.

## Canonical inventory

`scripts/required-test-manifest.json` is the single machine-readable owner for
required and advisory gate classification. `package.json` remains the command
owner; the manifest points to those commands and verifies their recursive test
sources instead of duplicating their shell bodies.

The manifest currently classifies 245 `scripts/test-*` files as risk-triggered
tests, 98 Playwright specs as release-only browser inventory, 14 imported
cabinetry/multi-room browser modules, and 8 imported cabinetry script-test
modules. The sorted path-set hashes make a new,
deleted, renamed, or moved test source a blocking manifest-review event. Static
registration contracts additionally prove every split-suite registration is
imported and invoked, so removing an import/call cannot silently exclude an
unchanged module. Critical requirements use stable IDs, source paths, test
titles, and browser projects rather than relying on a total test count alone.

Playwright attributes tests declared by split modules to the module file, not
the importing aggregator. The manifest therefore names the registration groups
whose runnable `.spec.ts` file owns those module records. Validation requires
every registered module to contribute at least one record in every required
project before records are attributed to the owner. The owner is counted once;
non-registering helpers remain classified supporting sources and are not
invented as runnable tests.

Repository-controlled cadence is explicit:

- `merge-required`: the `stable-checks` job invokes the named package command
  and shell/process failure remains blocking;
- `release-blocking`: evidence is validated before Vercel Gate A3 certification
  or by the existing cabinetry release-evidence validator;
- `advisory`: the full development/staging E2E inventory runs only by required
  manual exact-SHA dispatch, PR label `run-full-e2e`, or nightly staging
  schedule in its own non-required workflow; its real failed or cancelled
  conclusion and dishonest evidence remain visible and are never accepted as
  release certification.

The 21-gate inventory includes the required Git-history secret scan, code
quality, CH-0016 artifact-contract and runtime smoke, authorization/security,
database migration process, persistence, Stripe, Phase 14/15, Consumer/Pro
capability boundaries, cabinetry unit/accessibility/performance and release
evidence, design guards, typecheck, zero-warning lint, the complete floor-plan
umbrella (including live progress), catalog/materials, asset availability,
Chromium/WebKit Pro visual policy, and final merge-result aggregation. Gate A3
owns all 98 current browser specs and separately locks the six repaired
commerce/Kelsey requirement identities; cabinetry release evidence owns 23
named Consumer/Pro workflows. CH-0016 runtime smoke locks its two runtime
requirement identities.

## Truthful pass contract

A required Playwright pass proves all of the following:

1. the canonical command ran and its real process exit code is zero;
2. the report was freshly created inside the recorded process interval;
3. the report is readable JSON with a matching SHA-256;
4. `forbidOnly` is enabled and no grep, inverse-grep, or shard filter narrowed
   the suite;
5. the required source inventory, stable test identities, and browser projects
   were discovered exactly once;
6. every required test executed once and passed with no skip, retry, flake,
   annotation, expected-failure substitution, or not-run outcome;
7. aggregate counts match parsed per-test results;
8. the report identifies the canonical Playwright configuration and test root;
9. source commit, production artifact, and staged URL identities match where
   the gate requires them;
10. missing, malformed, truncated, tampered, stale, future-dated, filtered, or
    secret-bearing evidence fails closed.

The runner deletes an existing report before execution, canonicalizes repository
paths to `<repository-root>`, hashes the report, and writes a small evidence
envelope containing only gate/source/artifact identities, UTC timings, the real
process exit, report path/hash, result, and diagnostics. It never records an
environment dump, credentials, cookies, private designs, or machine-local
repository paths.

CI never uploads this raw directory. After an advisory runner result,
`evidence:required-tests:prepare-upload` requires the process envelope and
Playwright JSON report, verifies their source/hash/process/project/totals
relationship, and writes a safe failing-or-passing summary. Mandatory malformed
or unsafe JSON rejects the complete bundle. Optional diagnostic text is decoded
as strict UTF-8, normalized from Linux/macOS/Windows/home/temp paths to
`<WORKSPACE>`, and retained only under `optional-diagnostics/`; unsafe optional
files are omitted with a safe path, category, reason code, and original SHA-256.
Screenshots, videos, traces, archives, and other binary/uninspectable files are
never copied. A retained/omitted inventory makes omissions explicit. The staged
tree is rescanned and atomically published as `.local/required-test-upload/`;
every failure removes both staging and canonical output.

Process-only gates remain direct package commands or `&&`-chained umbrellas, so
missing executable files and nonzero child results already stop the command.
The manifest audit verifies a stable hash of every recursively reachable package
script body—41 scripts for the critical-domain umbrella, 55 for floor-plan, and
8 for catalog/materials—so a nested child, fail-open operator, or scope-changing
flag cannot silently disappear behind an edited umbrella.

## Commands

Static inventory and negative contract:

```sh
npm run test:required-test-truthfulness
node scripts/required-test-truthfulness.mjs check
npm run evidence:required-tests:prepare-upload
```

Broad E2E visibility, deliberately advisory:

```sh
npm run test:e2e:advisory
```

Exact staged-artifact Gate A3 evidence:

```sh
PLAYWRIGHT_RELEASE_BASE_URL='https://staged.example.vercel.app' \
REQUIRED_TEST_ARTIFACT_SHA256='<sha256 from .vercel/prebuilt-manifest.json>' \
  npm run test:e2e:release

GATE_A3_CERTIFIED_DEPLOYMENT_URL='https://staged.example.vercel.app' \
  npm run release:vercel:certify -- \
  .vercel/gate-a3-required-test-evidence.json
```

`release:vercel:certify` validates the evidence envelope, its hashed Playwright
report, exact source/artifact/staged URL, full checked-in spec inventory, and
per-test outcomes. A raw Playwright report is no longer certification input.

## Fail-closed coverage

`scripts/test-required-test-truthfulness.mjs` uses temporary directories and the
real exported validator. It covers a complete pass plus missing/renamed source,
zero discovery, missing project, filtered scope, skip, retry/flake, focused
`.only`, annotated early return, nonzero child with passing JSON, zero child with
failed JSON, missing/malformed/stale report, source mismatch, artifact mismatch,
advisory failure visibility, and secret-bearing report fields. CH-0016 and
cabinetry validator suites additionally exercise their actual integration with
the two runtime, six commerce/Kelsey, and 23 cabinetry stable identities,
project coverage, focused execution, and retry rejection.

The Outcome-D negatives additionally cover imported-module-to-aggregator
attribution, an owner with no contributing module record, missing/reclassified
registered modules, duplicate ownership, Linux GitHub/macOS/Windows/temp paths,
nested JSON/Markdown/log evidence, advisory error contexts, shaped and generic
credentials, API/access-key fields, binary/archive bytes disguised with a text
extension, unsafe cleanup targets, final-audit failure, and the invariant that a
failed preparation leaves no upload directory.

The formerly annotated early-return prerequisites in `05-buy.spec.ts` and
`07-kelsey-variants.spec.ts` now fail their tests when canvas, catalog, product,
variant, selection, cart, or buyer controls are absent. This can expose a red
commerce gate; that is truthful release evidence, not a reason to weaken an
expectation.

The cabinetry GLB export behavior check also no longer catches a missing
`FileReader`, prints a skip message, and returns success. It installs a bounded
Node-compatible `FileReader` shim for the test, restores the prior global after
execution, and always reaches the export assertion.

## Outcome D external evidence and remediation

The exact-head GitHub run for `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`
(`30658564565`, attempts 1 and 2) passed secret scan, 42 migrations, the
truthfulness suite, the CH-0016 evidence contract, and the strict build. Both
attempts then failed the furnished-template case at the same implicit
five-second diagnostic poll while the health/catalog case passed. The advisory
job ran and retained honest failures, but Playwright attributed cabinetry and
multi-room tests to imported modules, producing false missing-aggregator and
out-of-scope-module diagnostics. A retained `error-context.md` also exposed a
`/home/runner/work/...` path. Required smoke failure correctly prevented the
stable production bundle.

The furnished fixture is created and persisted by the browser in local storage;
GLB loading, normalization, bounds, and selection diagnostics are computed
client-side. There is no database transaction, API authorization, worker, or
scheduler in that readiness path. HTTP completion was being treated as model
readiness, then Playwright's default five-second poll was used for asynchronous
decode/normalization. Two external failures plus a clean CI-shaped local pass
classify the cause as a **test synchronization defect**. Diagnostics now expose
the existing semantic model lifecycle (`loading`, `ready`, or terminal `error`
with a safe code); the required case waits on that bounded observable state and
emits phase, elapsed time, fixture identity, safe request/response counts, and
current diagnostics without weakening selection, bounds, remount, reload, or
render-loop assertions.

Local focused validation passed the two runtime identities with process exit 0
and no failed/flaky/skipped result. Truthfulness, production-evidence,
cabinetry-evidence, critical-domain, floor-plan, typecheck, code-quality,
generated-runtime, asset-inventory, and catalog-asset checks also passed. Full
lint, design cleanup, and catalog audit retain the same inherited failures
recorded in the code-health handoff; no exception, threshold, baseline, or
expectation was changed.

## Exact-head 701aaa follow-up

GitHub Actions run `30684560486` attempt 1 proved the pre-smoke contracts and
strict build, then truthfully rejected required smoke: health/catalog passed,
while the furnished-template identity reached semantic GLB readiness but the
manually duplicated 240-second whole-test timeout expired during a later body
assertion (about 4.3 minutes). The fix does not alter production GLB behavior,
remove a reload, introduce a retry, or downgrade the identity. One canonical
14-phase table budgets every sequential setup, navigation, fixture creation,
fixture reload/2D readiness, combined initial GLB loading and selection
verification, lifecycle, bounds, render-idle, remount, three reload,
persistence, and final-state phase. Its 585,000 ms sequential sum plus 15,000 ms each for
fixture setup, fixture teardown, and assertion scheduling and a documented
30,000 ms orchestration margin mechanically derives the 660,000 ms Playwright
whole-test timeout. Every phase has its own preemptive timeout, and terminal GLB
`error` still rejects immediately. The strict phase JSON records only relative
start, elapsed time, outcome, phase budget, lifecycle state, and a safe category.
Its schema and encoding are closed; canonical order must be non-overlapping,
every phase end must remain inside the derived whole-test envelope, and a passed
phase cannot claim terminal `error` state.

The same external run's 232-test advisory job reported 107 passed, 92 failed,
and 33 not run with process exit 1, but its environment used the structurally
invalid `gate-a3-ci-google-client-secret-placeholder`; those results are not a
clean product baseline. Stable and advisory CI now call one repository-owned
synthetic OAuth fixture policy. The policy is committed once in
`scripts/ci-auth-fixture.json`, outside the application build graph; each pair
is generated only in exporter memory. CI transports it only as exactly three
allowlisted single-line assignments in runner-owned `GITHUB_ENV`, whose real
path must exist outside the checkout. The exporter registers both generated
values with `add-mask` before the write, and the immediately following step
validates propagation. It never prints fixture values or runner paths outside
the required masking command, writes a workspace transport, uses `BASH_ENV`, or
places values in workflow YAML, command arguments, outputs, summaries,
artifacts, manifests, or JSON diagnostics. Pair detection in
`lib/auth-env.ts` requires explicit CI/test activation and a canonically resolved
`development` or `staging` environment; missing, invalid, and Vercel-production
classifications reject it. The pair is never an implicit application or
production fallback. Before browser installation,
the advisory job validates that exact environment, starts the same Next.js app,
and requires `/api/auth/session` to return structured JSON without Auth.js HTML
or `ClientFetchError` signatures. Unit coverage retains trimming policy while
rejecting absent, quoted, whitespace-only, truncated, malformed, mismatched,
implicit, and production fixture use.

The run's flooring error context was the exact optional file rejected for
prohibited environment output; no diagnostic contents were copied into this
record. It is now omitted without discarding the mandatory failing report. The
mandatory pair is bound to the registered advisory command, exact checkout SHA,
configured project, process exit, canonical/fresh timing envelope, report hash,
full validator diagnostics, and a conclusion that cannot contradict the report.
Production-artifact, release-candidate, release-environment, and Gate A3 URL
bindings must remain null. Unsafe optional filenames are represented in the
omission inventory only by a stable SHA-256 path identifier so a secret-shaped
name cannot eliminate the safe bundle. The
advisory job consumes no stable-checks output, artifact, database, or environment
state and has its own exact-head checkout and PostgreSQL service, so its
`needs: stable-checks` edge was removed. `merge-gate` still depends only on
`secret-scan` and `stable-checks`; the advisory conclusion remains separately
visible and non-required.

Gitleaks still scans the full checkout with the official v2 action and writes
`results.sarif`; its automatic workspace-root artifact upload is disabled. A
repository-owned atomic staging step validates strict SARIF JSON and rejects
runner paths, preserves the SARIF bytes, and uploads only root-level
`results.sarif` plus `artifact-manifest.json` from `.local/gitleaks-upload/` at
the existing 90-day policy. The next real artifact download must still verify
the ZIP entry layout.

Focused local validation passed the phase derivation/terminal/timeout tests,
required-test truthfulness, production evidence, auth hardening, live auth
preflight, GLB bounds, cabinetry evidence, complete critical and floor-plan
umbrellas, typecheck, targeted zero-warning ESLint, code-quality ratchets,
generated-runtime drift, strict asset inventory, and catalog asset availability.
A development smoke exercised all phases in about two minutes; its final check
correctly reported two 500 console errors caused by the deliberately nonexistent
local fallback database. The required 2/2 result and production evidence hashes
are therefore taken only from the final clean detached, migrated-database proof.
The inherited catalog audit remains five invalid Hamilton enum values in three
unchanged YAML files.

## Exact-head 8cb7cae Outcome-C correction

Run `30707099465`, stable job `91387983537`, passed checkout, migration,
truthfulness, production-evidence, strict-build, and OAuth validation steps, then
failed `Run runtime smoke tests` when `bounds-verification` exhausted its
20,000 ms budget. Runner metadata after `Configure synthetic CI OAuth fixture`
also exposed `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`CI_AUTH_FIXTURE_ACTIVE`; no value is reproduced. The values were synthetic,
not derived from repository or organization secrets, and not a registered
externally authenticating Google client/secret.

Three clean CI-like executions against an isolated migrated PostgreSQL database
passed 2/2, with zero failures, flakes, skips, or retries. Bounds started/ended
at 29,192/36,668 ms, 29,685/36,793 ms, and 29,579/36,832 ms: elapsed 7,476,
7,108, and 7,253 ms. Each completed only after diagnostics settled, one further
second elapsed, bounds material-change deltas remained zero, and lifecycle was
recorded `stable`; whole bodies completed in 119,946, 123,137, and 119,869 ms.
The phase budget is 45,000 ms, leaving 37,524 ms over the slowest local result
and a bounded CI margin above the externally exhausted ceiling. The sequential
sum is 610,000 ms and the unchanged 75,000 ms named overhead derives a 685,000
ms whole-test timeout.

The runtime-generated nonce is shared only between the client-ID and secret
shapes; it is random, unregistered, unrelated to any GitHub secret, and the
policy declares external authentication incapable. Both values are registered
with `add-mask` before the only `GITHUB_ENV` append. Exact allowlisting,
single-line validation, outside-workspace realpath checks, next-step structural
validation, `/api/auth/session` JSON preflight, explicit CI/test activation,
and production exclusion remain fail closed. Tests reject write-before-mask,
wrong mask/value binding, non-allowlisted keys, CR/LF, workspace/symlink
transports, mismatched pair fingerprints, production use, and the retired fixed
fixture pair in both production and non-activated development.

## Required and full-advisory workflow separation

Previously `.github/workflows/ci.yml` owned `secret-scan`, `stable-checks`,
`e2e-full`, and `merge-gate`; every ordinary `pull_request` synchronize event
made the `e2e-full` condition true. Although `merge-gate` already needed only
`secret-scan` and `stable-checks`, the approximately two-hour advisory suite ran
on every narrow branch update and shared the required workflow's cancellation
domain.

The required workflow now owns only `secret-scan`, `stable-checks`, and
`merge-gate`. Every relevant PR update retains exact-head checkout, migrations,
masked OAuth export and structural validation, a live structured
`/api/auth/session` preflight, auth hardening, code-quality and truthfulness
contracts, strict production build, unchanged `npm run start` smoke identities,
evidence bundling, fresh standalone extraction verification, the remaining
required checks, and aggregation. The truthfulness step is the lightweight
advisory evidence preflight: its fixture cases preserve a representative failed
process/report pair, safe retained content, hashed omissions including redundant
`.last-run.json`, exact archive inventory, and rejection of hidden, extra,
environment, OAuth, credential, database, binary, or raw Playwright content. It
does not launch the application-wide E2E suite.

`.github/workflows/full-advisory-e2e.yml` is the canonical owner for
`advisory.full-e2e`. It is triggered only by a required exact `source_sha`
manual dispatch, adding `run-full-e2e` to a PR, or a nightly checkout of
`refs/heads/staging`; ordinary PR synchronize is not an event type. Label runs
checkout and compare the PR head SHA, manual runs compare the required input,
and scheduled runs record the resolved staging HEAD before migrations or
browsers. The full suite retains the canonical `npm run test:e2e:advisory`
runner, all 98 spec sources/current discovered records, real child exit and
counts, sanitized evidence, omission inventory, exact archive agreement, and
30-day upload. The separate job has no `continue-on-error`, so a child failure
remains a failed workflow without becoming merge-required. Its
`full-advisory-*` concurrency group can cancel an obsolete full-advisory run for
the same PR/ref but cannot cancel or gate required CI; a cancelled job skips
evidence preparation/upload and remains cancelled.

The manifest records the advisory workflow path as part of CI ownership. A
missing or renamed file, job, step, or package invocation fails repository
validation. Gate/source inventories remain 21/365, no required gate changed
cadence, and `merge-gate` still depends exactly on `secret-scan` and
`stable-checks`.

## Runtime failure provenance

Runtime smoke timing uses schema version 3 and a closed failure-kind enum:
`phase-timeout`, `nested-operation-timeout`, `no-progress-watchdog`,
`terminal-lifecycle-error`, `assertion-failure`, and `unexpected-error`. Every
failure carries phase identity, elapsed time and budget, last safe checkpoint,
safe lifecycle state, progress observation, and a bounded safe cause summary.
Nested-operation failures additionally require the canonical operation identity,
elapsed time, budget, current `attemptTimeoutMs`,
`remainingAtAttemptStartMs`, and `operationOutcome=timed-out`; their parent
phase must be `failed`. A true phase timeout requires parent `timed-out` and
forbids child identity. Validators reject missing, extra, unknown, unsafe,
budget-drifted, or cross-record-inconsistent fields.

The producer owns one immutable deadline per registered operation. Its
`operationBudgetMs` is resolved from the phase contract, its elapsed time starts
when that operation starts, and polling iterations receive branded attempts
whose decreasing allowances are recorded only in the attempt fields. Neither a
browser evaluation nor the timeout-error constructor can promote its remaining
allowance into canonical evidence. The exact external regression—70,000 ms
canonical reload readiness with a 65,507 ms leaf allowance—remains a validator
negative when 65,507 is presented as the operation budget and is a valid
structured failure when the two values occupy their correct fields.

`diagnostics-settle-evaluation` is a canonical 10,000 ms child of the 42,000 ms
`diagnostics-settle` operation. A child evaluation timeout remains attributed to
that child; only exhaustion of the complete settle envelope is attributed to the
parent operation. No-progress records retain the canonical watchdog budget and
originating phase, and terminal/assertion/unexpected failures cannot exceed the
parent phase budget.

The `diagnostics-settle` operation is derived rather than guessed: one immediate
baseline read plus two required stable samples at 500 ms intervals entails three
browser evaluations. Three 10,000 ms evaluation allowances, 1,000 ms assertion
allowance, and 10,000 ms orchestration margin produce its 42,000 ms bound. The
source test must throw `RuntimeSmokeOperationTimeoutError` for nested expiry;
only the actual parent deadline may throw `RuntimeSmokePhaseTimeoutError`.

Stable CI runs `production-artifact-evidence.mjs verify-runtime-failure` before
preparing any always-run failure diagnostic. A coherent real failure remains
visible through the existing safe three-file archive; an ambiguous schema-v2
record, mismatched report/timing pair, wrong budget or outcome, substituted
source/artifact identity, or unsafe diagnostic is rejected and not uploaded.
The verifier recomputes the current checkout, artifact inventory and BUILD_ID,
and validates the canonical manifest/sidecar and report production metadata; it
does not accept identities merely because test and manifest fields agree with
each other.
The successful path remains fail closed and requires no failure provenance.

## External controls and rollback

Repository checks cannot verify which GitHub checks branch protection requires,
whether the workflow ran for the candidate, or whether uploaded evidence was
retained for the requested duration. Attach the actual workflow/run/settings
evidence before treating those controls as verified.

Rollback the workflow-separation follow-up first, then the Outcome-C follow-up
`53a0c98bab4d5a211c93fd1f4f5057806e074bbd`, then
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, then the follow-up containing the
exact-head 701aaa remediation, then
the Outcome-D commit, then
`b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then the CH-0017 implementation
`c840c06dc2c5e67f463542292bb7391b0f93d731`. That would restore unsafe/raw
retention, timing-dependent smoke, aggregate-only evidence, and advisory
ambiguity and is not an acceptable steady state. Ignored
`.local/required-test-evidence/`, `.local/production-artifact-evidence/`,
`.vercel` reports, and Playwright outputs are regenerated evidence, not source
to commit. GitHub ruleset changes, if separately approved later, require their
own administrator rollback and are not implied by either repository revert.
