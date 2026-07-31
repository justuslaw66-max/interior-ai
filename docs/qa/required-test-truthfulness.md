# Required-test truthfulness

Status: repository-controlled CH-0017 contract. GitHub workflow execution,
branch-protection selection, and artifact retention remain external controls and
are not marked verified by this document.

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

Repository-controlled cadence is explicit:

- `merge-required`: the `stable-checks` job invokes the named package command
  and shell/process failure remains blocking;
- `release-blocking`: evidence is validated before Vercel Gate A3 certification
  or by the existing cabinetry release-evidence validator;
- `advisory`: the full development/staging E2E inventory runs in the explicitly
  `continue-on-error` job, but its child failure and dishonest evidence remain
  visible and are never accepted as release certification.

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

The formerly annotated early-return prerequisites in `05-buy.spec.ts` and
`07-kelsey-variants.spec.ts` now fail their tests when canvas, catalog, product,
variant, selection, cart, or buyer controls are absent. This can expose a red
commerce gate; that is truthful release evidence, not a reason to weaken an
expectation.

The cabinetry GLB export behavior check also no longer catches a missing
`FileReader`, prints a skip message, and returns success. It installs a bounded
Node-compatible `FileReader` shim for the test, restores the prior global after
execution, and always reaches the export assertion.

## External controls and rollback

Repository checks cannot verify which GitHub checks branch protection requires,
whether the workflow ran for the candidate, or whether uploaded evidence was
retained for the requested duration. Attach the actual workflow/run/settings
evidence before treating those controls as verified.

Rollback is one revert of the CH-0017 implementation commit. That would restore
aggregate-only and advisory ambiguity and is not an acceptable steady state.
Ignored `.local/required-test-evidence/`, `.vercel` reports, and Playwright
outputs are regenerated evidence, not source to commit.
