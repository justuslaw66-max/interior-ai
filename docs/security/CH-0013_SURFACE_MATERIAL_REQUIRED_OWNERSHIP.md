# CH-0013 surface-material required ownership

Status: **LOCAL PRE-CANDIDATE REMEDIATION COMPLETE — INTEGRATOR REVIEW AND
EXTERNAL REQUIRED-CHECK VERIFICATION PENDING**.

## Scope and starting identity

This bounded governance change started from exact integration source
`8f05b0fedc3de9d92b9815cbde3092568fd7507f` and tree
`748a0502b666c636720aafe552e016bb6756de2c` on
`fix/ch-0013-surface-material-required-owner`. The previous client-payload,
fixture-isolation, and deterministic-generation work remains unchanged. No
production material source, material ID, catalog record, Prisma state,
dependency, budget, browser design, or lazy-loading behavior changed.

The remaining gap was ownership: `test:surface-material-schema` and the
surface-specific part of the Phase 8 boundary were manually runnable, while
Full E2E and Gate A3 could only discover broader browser behavior at advisory
or release cadence. No merge-required manifest owner executed the coherent
schema/parity suite.

## Canonical owner and command closure

The existing merge-required `ci.catalog-materials` gate is the sole canonical
owner. Its domain already covered strict catalog quality and asset identity,
and the additional static work needs neither a browser nor a database.
`stable-checks` now runs the following inside the existing catalog-quality
step, after the exact-source strict build:

```sh
npm run test:catalog-audit && npm run test:surface-material-semantics
```

The gate's complete canonical command remains:

```sh
npm run test:catalog-audit && \
  npm run test:catalog-asset-availability && \
  npm run test:surface-material-semantics
```

The CH-0013 closure is exact and deterministic:

```text
test:surface-material-semantics
├── test:surface-material-schema
├── test:surface-material-browser-semantics
└── test:surface-material-runtime-boundary
```

Across the existing catalog commands and this umbrella, the gate owns 12
unique package scripts. Its closure SHA-256 is
`7ea65dfdc5ea31aac049836764123a9bc5a2e80b3af30c36bb42c34d8755b5e0`.
There are no filters, shards, `.only`, skips, retries, fail-open operators, or
swallowed exits. The focused runtime-boundary mode reuses `.next` produced by
the existing strict build and does not rerun the full Phase 8 gate.

The generator freshness command is deliberately not duplicated in this
closure. `evidence:production:build` already runs
`npm run check:surface-material-runtime` before the strict build and owns that
required drift evidence. The new schema owner consumes the same exact source
and generated projections later in `stable-checks`. Removing the existing
drift command or changing its body remains blocking through the production-
artifact contract and its truthfulness tests.

## Exact suite inventory

Durations are local wall-clock measurements on 2026-08-07. “Indirect” means a
separate existing required owner already executes or composes that protection;
it is not a second owner of the CH-0013 test source.

| Source path | Test or command | Semantic invariant | Package-command owner | Final status | Already indirect | Duplicate risk | Duration | DB/browser | Generated-state prerequisite |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| `scripts/generate-surface-material-runtime.ts` | generator `--check` | deterministic render/catalog/fixture outputs and stale-output rejection | `check:surface-material-runtime` through `evidence:production:build` | required, existing production-artifact owner | yes | avoided; not repeated in CH closure | 0.91 s | no/no | canonical YAML |
| `scripts/test-surface-material-schema.ts` | surface material schema audit | YAML/render/lazy IDs, texture maps, dimensions/UV, 2D/3D identity, assignments, application persistence transforms, BOM/export, publication negatives | `test:surface-material-schema` | required by `ci.catalog-materials` | previously manual only | none; one merge-required owner | 4.49 s | no/no | fresh generated projections |
| `scripts/test-surface-material-browser-semantics.ts` | browser helper semantics | executable production search/filter predicates, supplier/collection fallbacks, grouping, facets, variants, swatches, and 2,484 Nippon rows | `test:surface-material-browser-semantics` | required by `ci.catalog-materials` | no | none; one merge-required owner | 0.72 s | no/no | fresh render/catalog projections |
| `scripts/test-phase8-performance-boundaries.ts` | `--surface-material-contract-only` | render/lazy parity, loader caching/retry, explicit-open boundary, static import exclusion, and built chunk placement | `test:surface-material-runtime-boundary` | required by `ci.catalog-materials` | full Phase 8 remained manual validation | focused mode prevents duplicate full Phase 8 | 0.78 s with existing build | no/no | strict `.next` and `/design` route manifest are mandatory |
| `scripts/test-catalog-quality-audit.ts` | strict catalog quality audit | schema, identity, duplicate, and catalog quality policy | `test:catalog-audit` | required by `ci.catalog-materials` | yes | unchanged existing owner | 6.29 s | no/no | none |
| `scripts/test-catalog-asset-availability.ts` | catalog asset availability | referenced local assets exist; draft warnings remain non-publishing | `test:catalog-asset-availability` | required by `ci.catalog-materials` | yes | unchanged existing owner | 0.65 s | no/no by default | canonical catalog files |
| `scripts/test-design-route-payload.ts` and persistence umbrella sources | design persistence | stored surface identity survives validated document/save/reload infrastructure | `verify:design-persistence` through `test:critical-required` | required by `ci.critical-domain-contracts` | yes | not added to catalog owner | 3.15 s focused | no/no | none |
| `tests/e2e/flooring-surface-materials.spec.ts` | six flooring browser cases | interaction-level apply/reload, variants, Nippon, 2D/3D, and export | `test:e2e:advisory`; complete Gate A3 discovery | advisory/release-wide, not canonical owner | yes | intentionally not promoted: contains a DB-conditional skip | not run; Full E2E prohibited | yes/yes for export case | production server and database for complete file |
| `scripts/production-artifact-evidence.mjs` and its contract test | strict artifact build | exact-source generator freshness before build and production fixture/chunk evidence | `evidence:production:build` / `test:production-artifact-evidence` | required, existing production-artifact owners | yes | retained once, before build | 43.03 s contract | no/no for contract test | clean exact source |

## Required semantic contract

The manifest records 15 stable contribution IDs. Each marker must remain
inside an executable assertion; a comment cannot satisfy ownership. A missing
or renamed source, source outside the command closure, duplicate required
owner, stale package/inventory hash, forbidden command modifier, equivalent
failure-swallowing shell form, renamed CI step, invocation moved outside its
owner step, fail-open workflow command, or ordering regression fails
truthfulness.

| Contract | Required evidence |
| --- | --- |
| YAML to render parity | all 980 YAML IDs contribute exactly one render record; supported texture-map fields match YAML |
| Render/lazy ID parity | both 980-record projections have identical ordered unique IDs |
| Fixture and draft policy | test-only fixture is absent from runtime and production chunks; draft publication negatives remain fail closed |
| Deterministic generation | existing production-artifact prerequisite runs canonical generator `--check` once before build |
| Texture identities | swatch, base color, normal, roughness, AO, preview, repeat, and tileability are compared; displacement and opacity are not surface-schema fields and are therefore not invented |
| Dimensions and UV | physical plank/tile dimensions, room-independent repeat, scale, pattern, joint, and rotation semantics |
| 2D/3D parity | shared surface settings plus room-facing 3D side and 2D alias behavior |
| Room assignments | floor, default wall, face, and panel overrides retain exact IDs/settings |
| Save/reload | the complete surface assignment/settings object survives `snapshotToStored`, `sanitizeStoredDesign`, and `storedToSnapshot`; the broader required persistence umbrella remains separate |
| Search/filter/grouping | the exact production panel predicates execute product/ID/supplier/collection/suitability search; effect/collection/size/color/favorite/recommended filters; and stable group/facet behavior |
| Variants and Nippon | preferred Gardenia variant identity, five-size grouping, and all 2,484 lazy Nippon selections |
| BOM/export | floor/wall/panel area, product ID, pattern, rotation, scale, joint, and waste metadata |
| Negative publication | missing assets, tileability, dimensions, rights, blockers, and sample paths reject publication |
| Lazy catalog boundary | only explicit Browse/Change intent loads full metadata; cached failure requires retry |
| Phase 8 bundle boundary | full catalog, source/sample metadata, Nippon rows, and fixtures stay out of `/design` initial chunks while render identity remains eager |

## Truthfulness inventory

The manifest remains 22 gates: 19 merge-required, one advisory, and two
release-blocking. It classifies 376 sources: 253 script tests, 101 browser
specs, 14 imported browser modules, and 8 imported script modules.

| Inventory | Count | Sorted path SHA-256 |
| --- | ---: | --- |
| `script-tests` | 253 | `4b3aac7e5b284060e26d4e62810494020c8b367b371cc27282a7fa0357a5b9e3` |
| `browser-specs` | 101 | `b4e63b256df544fa8009e1dc5bf393251ff3cb68fa2d3caee6fa7d5dde521875` |
| `cabinetry-browser-modules` | 6 | `805b0ec8a0d24658c0cb5e01616fb1a684c8dc2aae81b6338f3d1b87fd6fafa9` |
| `multi-room-browser-modules` | 8 | `e701b0ff04421c8eca749fdd8e6daffcd0c0fbb987226ec2319bdcee8d368851` |
| `cabinetry-script-modules` | 8 | `55ed53e1acde7854a321a3a6480aba3c2c89636d9227057d66341bfd845d6696` |

The manifest file SHA-256 is
`d9a201872750c58742ca2e116044fd60663f35b3229bfa1fc78f77beadae06fc`.
Truthfulness negatives cover missing/renamed sources, zero discovery,
duplicate owner, advisory-only ownership, filtered/skip/retry/`.only` command
mutations even after closure-hash regeneration, swallowed failure, stale
inventory/closure hashes, missing command sources, a marker reduced to a
comment (including inside an assertion span), renamed CI ownership steps,
invocations moved out of their declared step, and invalid post-build ordering.

## Required, advisory, and release separation

`ci.catalog-materials` fails `stable-checks`; `merge-gate` still requires the
successful `stable-checks` conclusion. Full E2E remains in its separate
advisory workflow and was not run. Gate A3 remains release-blocking against an
exact immutable candidate and cannot substitute for merge-required ownership.
No GitHub ruleset was inspected or modified, so external selection of the
`merge-gate` status remains unverified.

## Rollback and remaining blockers

Rollback is one focused commit revert. That removes the catalog-step command,
manifest contribution registration, focused semantic command, helper test,
and truthfulness extensions together; it does not touch generated runtime
data or material behavior. Do not edit generated files individually.

Repository-local CH-0013 ownership is ready for separate integrator review.
Promotion still requires external required-check evidence and the normal exact-
candidate release process. CH-0015 is the next decision-free pre-candidate P1.
Product-decision, dependency, and external-control blockers remain unchanged.
