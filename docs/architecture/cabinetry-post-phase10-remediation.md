# Cabinetry Studio post-Phase 10 remediation

Date: 2026-07-20

This report records the authorized follow-up to the Phase 10 point-in-time
report. It covers dependency advisories, repository lint and stale guard
failures, locally automatable accessibility/device checks, and the formal
release-evidence status. It does not treat automation as observed-human
evidence or approve the release.

## Outcome

- The npm advisory count is zero across the installed 816-package graph.
- Full repository ESLint and non-incremental TypeScript checks pass.
- All 76 design-page cleanup guards pass.
- The Cabinetry deterministic, accessibility, performance, persistence,
  security, schema, production-build, and focused browser checks pass.
- The release-evidence file is structurally valid, but the release gate remains
  not ready: 48 required evidence rows are `not_run` and trusted product-owner
  approval is absent.

## Dependency remediation

Direct version ranges were advanced without downgrading Next or Prisma:

| Package | Previous | Remediated |
| --- | --- | --- |
| `@sentry/browser` | `^10.42.0` | `^10.66.0` |
| `@sentry/nextjs` | `^10.42.0` | `^10.66.0` |
| `eslint` | `^9.39.2` | `^9.39.5` |
| `postcss` | `^8.5.6` | `^8.5.20` |

Targeted overrides replace exact vulnerable transitive pins while preserving
their package families:

- Prisma's `@hono/node-server@1.19.11` pin resolves to `1.19.14`.
- The legacy `brace-expansion@1.1.12` pin resolves to `1.1.16`.
- Next's `postcss@8.4.31` pin resolves to `8.5.20`.

`npm audit --json` reports zero info, low, moderate, high, or critical
vulnerabilities. `npm ls --depth=0` exits successfully. It still labels the
optional hoisted `@emnapi/runtime@1.8.1` package as extraneous; the package was
not removed because pruning did not identify it as a safe target and the
installed tree otherwise validates.

## Lint and guard remediation

The renderer's legacy watertight-geometry inputs are now typed as readonly,
three unreferenced helpers were removed, and the unused room input was removed
from the interior-side calculation while its public test wrapper remains
compatible. The planar-union memo is intentionally retained for interactive
performance. A scoped React-compiler lint exception documents that the compiler
cannot prove the immutability of editor snapshots across the legacy helpers;
normal React dependency memoization remains active.

The old admin guard no longer asserts a deleted `/admin/catalog/health` route.
It checks the current `/admin/audit` quality link and the operations-data rows
for checkout starts and webhook-delivery failures.

Three other guards were updated to follow approved hardened boundaries instead
of stale implementation text:

- Live catalog checks now require the uncached request, its abort signal, and
  unmount cleanup.
- My Designs deletion checks the shared encoded design API client.
- New-plan preservation checks the shared update/create API client.

The aggregate run also found a real regression introduced during API-boundary
hardening: the AI-layout route and extracted client had stopped forwarding the
supported floor-plan quality context. Record-shape validation and the payload
forwarding were restored without weakening the request-size, catalog, numeric,
role-count, authentication, or rate-limit boundaries.

## Verification

| Gate | Result |
| --- | --- |
| `git diff --check` | Pass |
| Full repository ESLint | Pass; generated material file emits Babel's expected >500 KiB styling note |
| Non-incremental TypeScript | Pass |
| Design-page cleanup aggregate | Pass, 76/76 guards |
| `npm run verify:cabinetry` | Pass; 33/33 presets and architecture ratchets pass |
| Static Cabinetry accessibility | Pass |
| Editor capability/accessibility | Pass |
| Design persistence and compatibility | Pass |
| Phase 7 security boundaries | Pass |
| Prisma schema validation | Pass |
| Production build | Pass; existing broad NFT-trace warning remains in floor-plan import code |
| Phase 8 project and bundle budgets | Pass |
| Legacy watertight renderer | Pass |
| Focused Chromium device/access smoke | Pass, 3/3 in 3.4 minutes |
| Release-evidence validator tests | Pass |
| Release-evidence structural report | Pass, zero structural errors |
| npm audit | Pass, 0 vulnerabilities |
| Deep health | HTTP 200; degraded only because one old floor-plan import is queued while its worker remains intentionally stopped |

The focused browser run covered the first-time Guided drawer-cabinet path,
keyboard-operable preview controls while resizing from desktop to 390×844 and
back to 1280×900, and Consumer/Free Guided access with Pro controls absent. It
is useful automation evidence only. It was not written into the canonical
release record as a human accessibility, usability, or device observation.

The Phase 10 report retains the earlier complete 20/20 Cabinetry Playwright run.
The follow-up did not claim a new full-browser release row because the current
working tree is not a frozen, named release candidate and no hashed release JSON
report was captured for that row.

## Release-evidence disposition

`reports/cabinetry-studio-release-evidence.v2.json` remains unchanged and
truthful:

- Structural validity: pass.
- Evidence completeness: incomplete.
- Required rows: 48 `not_run`.
- Product-owner approval: not verified.
- Release gate: not ready.

Completion requires a frozen named release candidate followed by the observed
A–E sessions, 33 template sessions, Consumer and Pro access smokes, Guided and
full manual smokes, independent UX gate, full hashed browser report, real
keyboard/screen-reader observation, live Consumer and Pro analytics captures,
fabricator/export review, and a trusted product-owner Ed25519 signature. Those
items require human observers, approved environments and devices, durable local
artifacts, or signing authority that were not available in this coding session.

## Repository state

- Branch: `safety/cabinetry-pre-phase1-20260719`.
- HEAD: `f813b2c17160173e3a529596acc0fc0ef2956a94`.
- No path was staged, committed, pushed, reset, stashed, or cleaned.
- The floor-plan worker remained stopped.
- The broad user-owned worktree remains intentionally dirty; the exact final
  counts belong in the handoff because this report itself is an untracked
  program artifact.

## Warnings encountered

- The first final npm-audit attempt could not resolve the registry inside the
  restricted network sandbox. The approved registry retry completed and
  verified zero advisories.
- The production build retained the known broad NFT trace warning rooted in
  dynamic filesystem access in floor-plan import services.
- Deep health remains degraded only for the intentionally unserved queued
  floor-plan import; application, catalog, and database checks are healthy.
