# Cabinetry Studio Decomposition

Status: Phase 10 verified composition boundary

This document defines the target-scoped rules for decomposing
`features/cabinetry/components/CabinetryStudio.tsx`. Phase 1 preserves product
behavior and public contracts. It does not authorize a new editor workflow,
saved-data migration, floor-plan worker change, authorization redesign, or
complete persistence-recovery redesign.

## Decision and checkpoint

`CabinetryStudio.tsx` began Phase 1 as a 10,505-line handwritten application
source combining composition, state, commands, persistence, validation,
rendering, and Consumer/Pro presentation. Phase 9 Batch 8 completes the planned
root decomposition: the original module is now a 2,700-line coordinator and
compatibility facade, while Guided and Detailed markup live in mode-specific
render boundaries.

The coordinator still owns initialization, derived state, commands, effects,
IO adapters, and error/busy handling. It hands each view one labeled typed
binding tuple whose order is statically asserted. The tuple keeps the boundary
explicit without shipping hundreds of repeated object-property names. The views own markup and UI event adaptation but no React state,
lifecycle hooks, storage, analytics, document IO, or generated-part lifecycle.
This avoids a global editor context, a replacement mega-controller, and hidden
initialization order.

The decision and its rejected alternatives are recorded in
`docs/architecture/adr-0001-cabinetry-studio-composition-boundaries.md`. The
complete Phase 10 audit and verification results are recorded in
`docs/architecture/cabinetry-phase10-final-report.md`.

`npm run check:cabinetry-architecture` enforces separate no-growth ratchets for
the coordinator and both mode views, rejects lower-feature imports of the
composition root, preserves the lazy route boundary, and detects runtime cycles.
Raising a limit requires an explicit architecture decision in this file.

## Repository stack and commands

- Next.js 16 App Router, React 19, TypeScript 5.9, npm 11, and Node 24.
- Three.js, React Three Fiber, and Drei render the interactive preview.
- ESLint 9 provides static linting.
- Import-based TypeScript scripts provide focused domain, component, storage,
  accessibility, and performance checks.
- Playwright protects browser workflows.

The deterministic Cabinetry Studio entry point is:

```bash
npm run verify:cabinetry
```

It runs the focused behavior suite, architecture/line-count/cycle ratchet,
static accessibility checks, and performance budgets. Complete validation for a
runtime change also includes:

```bash
npx eslint <touched-source-files> --max-warnings 0
npx tsc --noEmit --incremental false --pretty false
npm run build
npx playwright test tests/e2e/cabinetry-studio.spec.ts
```

Dependency-boundary changes also require read-only review before any upgrade:

```bash
npm ls --depth=0
npm audit --omit=dev
npm outdated
```

Do not run `npm audit fix`, a broad install, or a major upgrade as incidental
cleanup. Record advisory chains and handle them in a separately reviewed
security batch when the fix changes framework, telemetry, ORM, or build-tool
versions.

No checked-in CI workflow is present in this repository. Phase 1 therefore
encodes the ratchet in portable npm commands rather than inventing
provider-specific configuration; the same commands are ready for the eventual
CI workflow to call.

The manual and signed release-evidence gate remains separate because automated
or static checks cannot replace the required human usability, accessibility,
analytics, and fabricator observations. See
`docs/qa/cabinetry-studio-mvp.md`.

## Responsibility inventory

The Batch 8 coordinator contains these orchestration responsibilities:

| Area | Current responsibility |
| --- | --- |
| Studio lifecycle | Create/edit initialization, initial-definition acceptance, close/save/place/copy actions, busy and feedback state |
| Document state | Active `CabinetDefinition`, active module, template provenance, history, and stable identifier preservation |
| Guided workflow | Guided step, fit, template, and Consumer-default state and commands; markup is delegated to `CabinetryStudioGuidedView` |
| Detailed workflow | Detailed selection, construction, fabrication, output, and Pro state and commands; markup is delegated to `CabinetryStudioDetailedView` |
| Commands | Definition/module updates, sizing reconciliation, Fit-to-Space, undo/redo, preset/template operations, validation fixes, import/export |
| Derived models | Active module, generated parts, BOM/documentation, preview parts, validation issues, readiness, estimate, and recommendations |
| Rendering wiring | Preview view, semantic selection, dimension previews, clearances, and camera-facing adapters; responsive surfaces are mode-view owned |
| Persistence wiring | Custom spaces, inspector preferences, saved templates, onboarding preference, and dismissal state |
| Observability | Privacy-limited Studio, history, validation, template, import, export, place/update, and close events |

Further decomposition must move one cohesive coordinator lifecycle or one named
view section at a time. Do not replace these responsibilities with a single
mega-controller, mega-context, or broad `utils` module.

## Accepted ownership tree

```text
components/editor/design-page/
  DesignPageDialogLayer.tsx
    -> CabinetryStudioOverlay.tsx             overlay and lazy runtime boundary

features/cabinetry/
  components/
    CabinetryStudio.contract.ts               stable public prop contract
    CabinetryStudio.tsx                       lifecycle coordinator, composition root, compatibility facade
    CabinetryStudioGuidedView.tsx             Guided/Consumer render surface and UI event adaptation
    CabinetryStudioDetailedView.tsx           Detailed/Pro render surface and UI event adaptation
    CabinetStudioHeader.tsx                   header, mode, history, close actions
    CabinetGuidedStepNavigation.tsx           guided-step navigation
    CabinetOutputTabs.tsx                     output-tab semantics and keyboard behavior
    CabinetStudioFormPrimitives.tsx           focused form presentation primitives
    CabinetValidationFeedback.tsx             issue summaries and recovery actions
    CabinetTemplateDiagrams.tsx               template visual diagrams
    CabinetPreview3D.tsx                      Three/R3F preview composition
    <existing focused preview controls>       scene interaction leaves
  storage/
    CabinetStudioLocalStorage.ts              browser-storage validation and keys
  types.ts                                    canonical cabinetry contracts
  validation*.ts                              validation and issue policy
  layout/preset/generation modules            pure or focused domain behavior
  export/generation modules                   artifact adapters
  designItemAdapters.ts                       design-document compatibility adapter
  useDesignPageCabinetry.ts                   design-page integration lifecycle
```

## Dependency direction

```text
Design page composition
  -> overlay
      -> type-only Studio contract
      -> dynamically loaded Studio implementation
          -> Guided or Detailed mode-view boundary
              -> focused UI and preview leaves
          -> storage adapter
          -> domain, validation, generation, and export modules
              -> canonical cabinetry types
```

Rules:

- The overlay must import the prop contract without eagerly importing the
  Studio implementation. The implementation remains behind `next/dynamic`.
- `CabinetryStudio.tsx` is the composition root. Lower cabinetry modules must
  not import it.
- `CabinetryStudio.tsx` must not regain mode-view markup. It selects one typed
  mode view only after initialization and command construction are complete.
- Mode views may map UI events to supplied command callbacks and pure domain
  helpers. They must not own React state/effects, storage, analytics, document
  IO, generated-part lifecycle, or the full editor context.
- Extracted UI leaves receive explicit values and actions. They do not own the
  full Studio document or recreate storage, entitlement, analytics, or export
  policy.
- The browser-storage adapter may depend on cabinetry types; it must not depend
  on React, Next.js, Three.js, R3F, or the Studio composition root.
- Pure layout, validation, measurement, and generation policy must not depend
  on UI composition or browser storage. Rendering-specific code stays in named
  preview/render adapters.
- Keep side effects at explicit UI, storage, analytics, download, or design-page
  integration boundaries.
- No new runtime dependency cycles are allowed within `features/cabinetry`.
- Do not deep-import implementation details across unrelated features. Existing
  design-page integration imports are compatibility boundaries and should move
  behind an explicit cabinetry feature API only in a separately reviewed batch.

## Consumer and Pro boundary

- Consumer and Pro use the same `CabinetDefinition`, stable IDs, units,
  validation, derived geometry, and project adapters.
- Consumer remains guided with guarded defaults. Pro may reveal detailed
  construction, fabrication, and output controls.
- `accessLevel` is a presentation capability, not an authorization mechanism.
  Any server mutation, durable export, purchase, or privileged data access must
  independently authorize the request at the server boundary.
- The heavy Studio implementation is lazy-loaded when the overlay is opened.
  Pro-only code should remain isolated or lazy-loaded where measurement shows a
  material benefit; mode checks must not fork persisted-data meaning.

## Compatibility constraints

- Preserve the default `CabinetryStudio` export and named
  `CabinetryStudioProps` export. The overlay consumes the extracted contract,
  and direct callers retain the original module surface.
- Preserve `mode`, `accessLevel`, callback payloads, false-return behavior, and
  create/edit semantics.
- `CabinetDefinition.version` and `units: "mm"` remain canonical. Display units
  convert at the UI boundary; internal values stay in millimetres.
- Preserve definition, module, instance, part, material, hardware, host, and
  placement identifiers across edits, save/reload, undo/redo, 2D/3D mapping,
  and exports.
- Preserve `custom_millwork.source_definition.v1`, definition fingerprints,
  placed-asset adapters, snapshot fields, export schemas, event names, payload
  keys, test IDs, roles, labels, focus behavior, and keyboard behavior.
- Preserve these browser keys and their current formats until a migration is
  designed and fixture-tested:
  - `interior-ai:millwork-custom-templates:v1` (legacy unversioned array)
  - `interior-ai:millwork-custom-host-spaces:v1` (version 1 envelope)
  - `interior-ai:millwork-inspector-preferences:v1` (version 1 envelope)
- Persisted format changes require an explicit version, migration, and old-data
  fixture. Do not silently reinterpret an existing version.
- Rendering resources, listeners, animation frames, object URLs, geometries,
  materials, controls, and observers require explicit cleanup at their owning
  boundary.

## Known baselines and deferred risks

The scoped guard deliberately does not fail on every oversized legacy cabinetry
module. These are recorded debt, not permission to grow them:

| Module | Batch 8 physical lines | Decision |
| --- | ---: | --- |
| `CabinetryStudio.tsx` | 2,696 | Focused coordinator/facade; size is dominated by explicit domain commands and derived-state wiring, guarded by a 2,750-line ratchet |
| `CabinetryStudioGuidedView.tsx` | 1,898 | Cohesive Guided journey surface; intentionally exhaustive but IO/hook-free and guarded by a 2,050-line ratchet |
| `CabinetryStudioDetailedView.tsx` | 3,377 | Cohesive Detailed inspector surface spanning the supported millwork schema; intentionally exhaustive but IO/hook-free and guarded by a 3,400-line ratchet |
| `generateCabinetDocumentation.ts` | 8,366 | Dedicated artifact/schema decomposition with golden exports and fingerprint fixtures |
| `validation.ts` | 3,842 | Split by validation domain only with issue-code and auto-fix compatibility tests |
| `generateCabinetParts.ts` | 2,775 | Geometry/render-output change requires representative generation fixtures and profiling |
| `presets.ts` | 2,600 | Catalog data and creation policy require schema/preset fixtures before separation |
| `types.ts` | 2,228 | Split only along stable public model boundaries; avoid circular type ownership |
| `useDesignPageCabinetry.ts` | 1,377 | Separate design-page lifecycle batch; preserve history, placement, object URLs, and identity |

The earlier generated-cache diagnostic for
`.next/dev/types/app/api/floor-plan-imports/[id]/route.ts` was resolved in Phase
7 by keeping `MAX_FLOOR_PLAN_CANDIDATE_MUTATION_BODY_BYTES` route-private, as
required by the Next.js route-module contract. Full worktree TypeScript now
passes without a suppression.

`npm run test:design-page-cleanup` has a separate pre-existing admin assertion
failure in `scripts/test-beta-readiness-upgrades.ts:170`: the test expects an
`/admin/catalog/health` link directly in `app/admin/page.tsx`, while that page
delegates its UI to `OperationsDashboard`. The same failure reproduces at the
pre-Phase 1 checkpoint commit
`f813b2c17160173e3a529596acc0fc0ef2956a94`. It does not overlap the Studio or
overlay. The focused design-page architecture and cabinetry-controller checks
pass, so the admin assertion remains a separately owned baseline rather than a
Cabinetry Phase 1 fix.

The floor-plan worker constraint is:

`PRESERVE CURRENT STATE — INTENT REQUIRES SEPARATE VERIFICATION`

Do not remove, re-enable, or change the worker while performing Cabinetry Studio
decomposition.

Invalid local design backups are currently caught and ignored in
`lib/useDesignPageLocalBackupHydration.ts`. That silent discard is a known
reliability defect, not desired behavior. A dedicated persistence/recovery batch
must quarantine the invalid value without overwriting it, retain the last valid
project, notify the user, permit raw export and safe recovery, avoid logging
private contents, and prevent autosave from destroying recoverable data. Do not
fold that redesign into structural Studio extraction.

Target-scoped API, security, import, and recovery follow-ups are prioritized in
`docs/architecture/cabinetry-phase1-risk-backlog.md`.

## Verification and evidence policy

| Gate | Required evidence |
| --- | --- |
| Behavior | `npm run test:cabinetry`, including public contract, storage, validation, extracted UI, and preview ownership checks |
| Architecture | `npm run check:cabinetry-architecture`: line ratchets, lazy boundary, storage direction, composition-root direction, and no runtime cycles |
| Accessibility | `npm run test:cabinetry-accessibility` plus the required real keyboard/screen-reader release smoke |
| Performance | `npm run test:cabinetry-performance`; compare the same fixture, build mode, and machine before claiming an improvement |
| Static quality | Focused ESLint with zero warnings, non-incremental TypeScript, and `git diff --check` |
| Production | Clean isolated `npm run build`, including page-data collection and static routes |
| Runtime | Canonical listener points at this worktree; `/design` responds; browser logs show no relevant errors |
| Browser | `tests/e2e/cabinetry-studio.spec.ts`, including Consumer/Pro, import/export, focus, keyboard, persistence, and placement workflows |
| Release | Signed evidence matrix in `docs/qa/cabinetry-studio-mvp.md`; automated output never substitutes for human observations |

At the Phase 1 checkpoint, initial `/design` JavaScript was 6,674,544 bytes and
the lazy Studio chunk is 484,401 bytes in the same isolated production-build
method. The final Phase 1 performance samples were 35.49 ms p50 for the large-run
fixture and 0.70 ms p50 across all presets. These are evidence baselines, not
claims that source extraction alone improved runtime performance.

## Ordered follow-up

1. Phase 10 should begin from the three enforced Batch 8 boundaries, not reopen
   the original monolithic layout.
2. Persistence work protects invalid/old data, versioned migrations, quarantine,
   recovery, and fixture compatibility.
3. Any further coordinator extraction moves one lifecycle or command family
   with characterization coverage; any view extraction moves one named section
   with its complete UI contract.
4. Rendering and high-frequency interaction moves require resource-lifecycle
   tests and before/after profiling.
5. Lower the relevant ratchet after every accepted extraction and keep every
   batch independently reviewable and green.
