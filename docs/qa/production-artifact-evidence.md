# Production-equivalent artifact evidence

Status: repository-controlled CH-0016 contract. This document describes local
production-mode artifact evidence and required CI behavior. It does not describe
or prove a Vercel deployment, stable staging, production, or external platform
configuration.

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
assertions. A canonical 585,000 ms sequential phase budget plus 75,000 ms of
named setup/teardown/assertion/orchestration overhead derives the 660,000 ms
whole-test timeout. This fixes the external whole-test envelope defect without
adding retries, seeding a test-only success state, changing `npm run start`, or
weakening the required identity.

Generated output is written only under the ignored directory
`.local/production-artifact-evidence/`:

- `manifest.json`: canonical UTF-8 provenance manifest;
- `manifest.json.sha256`: accidental-tamper sidecar for the exact manifest bytes;
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

The required `stable-checks` job migrates its fresh PostgreSQL service, runs the
negative-case contract test, performs the strict evidence build with shaped
nonfunctional staging placeholders, runs runtime smoke against that exact
artifact, validates it, and uploads only the prepared standalone bundle with a
requested 14-day retention. Placeholder configuration
proves application configuration shape only; no external integration call or
external-control claim follows from it. GitHub execution and artifact retention
must be confirmed from an actual workflow run.

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

Revert the Outcome-D follow-up first, then
`b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, before reverting the focused CH-0016
implementation commit. That restores the previous lenient/dev
CI behavior and is therefore a release-integrity rollback, not a recommended
steady state. No schema, migration-file, dependency-version, persisted data,
deployment, or external configuration rollback is involved. Generated
`.local/production-artifact-evidence/` files are ignored and can be regenerated
from the exact clean candidate; local copies are ephemeral and are not durable
release evidence.
