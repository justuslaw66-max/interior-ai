# Design Page Decomposition

Status: accepted cleanup architecture and living ownership ADR

This document records the architecture and compatibility rules for decomposing
`/design`. It describes an incremental refactor, not a workflow redesign. Update
it when ownership or acceptance gates change. Source separation alone does not
prove a runtime performance improvement; performance claims require before/after
measurements.

## Context and decision

The original `app/design/page.tsx` grew to 27,574 lines and owned routing,
editor state, domain operations, rendering, persistence, commerce, telemetry,
and QA behavior. The route is now a thin wrapper and
`components/editor/design-page/DesignPageWorkspace.tsx` is the composition root.
At the accepted cleanup checkpoint, the route is 12 lines and the clean
workspace is 519 lines. The former 2,500-line ceiling was a useful intermediate
decomposition milestone, not the governing finish line. The workspace now has a
550-line hard ratchet; changing that limit requires an explicit architecture
decision rather than incidental feature growth.

Continue decomposing by domain and lifecycle while preserving observable
behavior. Use typed `state`, `derived`, `configuration`, `refs`, and `actions`
contracts. Do not introduce a global editor store, mega-context, or a single
mega-controller merely to reduce the workspace line count.

## Repository stack

- Next.js 16 App Router, React 19, and TypeScript 5.9.
- npm with the Node and npm versions constrained in `package.json`.
- `next build` for production builds; local development uses the repository
  preflight and `next dev --webpack` scripts.
- ESLint 9 with `eslint-config-next`; touched code must produce zero warnings.
- Tailwind CSS 4 and PostCSS for styling.
- Three.js, React Three Fiber, and Drei for the editor scene.
- Prisma/Postgres, NextAuth, Stripe, and server routes for persistence, identity,
  billing, sharing, and exports.
- Playwright for browser coverage. Import-based TypeScript fixtures, focused
  source-ownership guards, and the architecture/cycle ratchet run through
  `test:design-page-cleanup` (73 guard files at the accepted checkpoint).

Primary gates are:

```bash
npx eslint <touched-files> --max-warnings 0
npx tsc --noEmit --pretty false --incremental false
npm run test:design-page-cleanup
npm run build
```

## Original responsibility inventory

| Area | Responsibilities that were coupled in the original page |
| --- | --- |
| Shell and access | Session and query parsing, homeowner/designer mode, client preview, Pro capability, paywall and billing entry points |
| Document | Design snapshot, active room, floors, openings, fixed elements, annotations, surfaces, zones, refs, and reconciliation |
| History and persistence | Transactions, undo/redo, local backup hydration, cloud load/save/delete, new-plan replacement, share links, and URL updates |
| Plan editing | Templates, upload/underlay, calibration, tracing, room geometry, plan quality, guidance, layers, themes, and measurement units |
| Products and placement | Catalog loading, variants, configuration, placement scoring, collision/containment, room transfer, scene drag, and smart recommendations |
| Selection and inspection | Selected IDs, primary selection, transforms, product inspection, surface inspection, selected-item actions, and stale cleanup |
| Scene and camera | 2D/3D modes, camera transitions, named views, scene readiness, render quality, cutaways, item readiness, and performance QA data |
| Feature workflows | AI layout and notes, onboarding, shopping/cart readiness, exports, cabinetry, and floor management |
| Presentation | Command bar, tool rail, panels, dialogs, portals, toasts, QA markers, command palette, safe areas, and layer ordering |
| Observability | Analytics events, funnel events, QA hooks, stable test IDs, debug snapshots, and runtime smoke evidence |

## Consumer, Pro, authentication, and preview boundaries

These are separate concerns and must remain separate in contracts:

- Consumer/homeowner behavior uses guided and simple plan controls, consumer
  presentation defaults, and capability-appropriate export/cabinetry views.
- Pro capability permits designer mode, Pro tools, advanced plan/presentation
  controls, and capability-gated exports. The resolved plan controls capability;
  a query parameter alone must not grant it.
- Authentication controls guest versus cloud workflows, saved designs, and
  billing identity. An authenticated user is not necessarily Pro.
- Client preview suppresses editing chrome and editing actions without changing
  the underlying design document.
- Consumer and Pro flows share the same canonical room, item, surface, opening,
  and persistence schemas. Mode changes presentation and permitted actions, not
  persisted-data meaning.
- Consumer cabinetry remains a guided planning experience. Detailed construction,
  fabrication, quote, and release information stays behind its established
  capability policy; custom millwork remains outside normal cart checkout.

## Target ownership tree

```text
app/design/page.tsx                         thin route/Suspense wrapper
components/editor/design-page/
  DesignPageWorkspace.tsx                  orchestration and composition only
  DesignPageComposition.tsx                outer visual shell
  DesignPageSceneRegion.tsx                scene region
  DesignPageEditorChrome.tsx               command bar and tool rail
  DesignPagePanelRegion.tsx                panels and inspectors
  DesignPageDialogLayer.tsx                dialogs, portals, feedback
  DesignPagePresentationQaLayer.tsx        QA markers and command palette
  <focused leaf components>.tsx            presentational behavior
lib/
  design-page-*-workspace-registration.ts  pure region adapter composition
  design-page-*.ts                         pure policy, adapters, and models
  useDesignPage*Controller.ts              one stateful domain/lifecycle
  useDesignPage*Facade.ts                  narrow composition boundary
  useDesignPage*RegistrationFacade.ts      preserves split registration slots
features/cabinetry/                        cabinetry domain and adapters
scripts/test-*.ts                          pure behavior and ownership guards
tests/e2e/                                 browser workflows
```

New files should follow the existing flat naming convention unless a separately
reviewed directory migration is justified. Do not move unrelated features simply
to make this tree visually uniform.

## Accepted line-count checkpoint

| File | Before | Accepted | Ownership |
| --- | ---: | ---: | --- |
| `app/design/page.tsx` | 27,574 | 12 | Route and Suspense wrapper |
| `DesignPageWorkspace.tsx` | 6,661 after the first route split | 519 | Hook ordering, facade registration, and region composition |
| `DesignPageSceneRegion.tsx` | Rendered inside the workspace | 121 | Scene and viewport-region rendering |
| `DesignPageEditorChrome.tsx` | Rendered inside the workspace | 73 | Command bar and tool rail |
| `DesignPagePanelRegion.tsx` | Rendered inside the workspace | 134 | Plan, catalog, shopping, and selection panels |
| `DesignPageDialogLayer.tsx` | Rendered inside the workspace | 120 | Dialogs, portals, and feedback |
| `DesignPagePresentationQaLayer.tsx` | Rendered inside the workspace | 37 | QA markers and command palette |

`lib/useDesignPageSceneRegionWorkspaceRegistration.ts` is 417 lines. It is the
one accepted design-page composition module above the preferred 350-line review
threshold: its single responsibility is mapping the typed presentation facade to
the performance-sensitive scene adapter without owning state or effects. Its hard
ratchet is 450 lines.

## Dependency direction

```text
route
  -> DesignPageWorkspace
      -> registration facades / domain facades / controllers / read models
          -> pure design-page policy, adapters, and domain helpers
      -> scene, chrome, panel, dialog, and QA regions
          -> focused leaf components
```

Rules:

- Pure helpers must not import React, the workspace, or rendered regions.
- Controllers may depend on pure helpers and leaf prop types; they must not
  import the workspace.
- Facades compose existing controllers and return narrow grouped contracts.
- Regions are presentational. They receive models/actions and do not recreate
  document, persistence, entitlement, or analytics policy.
- Feature domains such as cabinetry own their domain logic. The design page uses
  typed adapters rather than duplicating that logic.
- Lower layers never import the route or composition root. Avoid circular
  imports and cross-domain reach-through.

## Ordered extraction batches

Each batch must be independently reviewable and green before the next begins.

1. Protect the baseline: verify the canonical listener, snapshot the workspace,
   checkpoint reviewed changes, and record the current line-count ratchet.
2. Establish tests: import pure behavior in tests and retain source inspection
   only for ownership, imports, render order, and size limits.
3. Extract pure policy: geometry, placement ranking, surface/plan policy,
   summaries, readiness, and configuration resolution.
4. Extract stateful controllers: item document, item selection, catalog
   placement, surfaces, camera, AI layout, history, persistence, and paywall.
5. Compose narrow facades: plan, scene/room, placement/selection,
   presentation/QA, and other domains with repeated wiring.
6. Preserve split lifecycle slots: use registration facades where hooks cannot
   safely move together. Early paywall telemetry and deferred billing/paywall
   lifecycle registration are intentionally separate.
7. Split rendering last: scene, editor chrome, panels, dialogs/feedback, and QA
   regions. Keep regions presentational and preserve their mount order.
8. Contain hotspots: move catalog placement assessment/ranking to importable
   pure helpers while retaining the hook's public contract and lifecycle.
9. Remove compatibility bridges and unused code only after the last consumer is
   migrated and all gates pass.

## Compatibility constraints

### Requested-design route ownership

`useDesignPageRequestedDesignWorkspaceRegistration` is the canonical
route-to-document coordinator. It composes after the existing persistence
workspace, reads the opaque `designId` query value, waits for authentication
and local backup hydration, delegates loading, cancels pending work when route
intent disappears, restores the prior canonical URL after failed loads, and
owns My Designs navigation. The lower-level
`design-page-requested-design-load-coordinator.ts` owns the unique request token
and `AbortController`; persistence calls it before every network load and gates
all response mutation on its current token. Document state, response
translation, network access, and autosave remain in `useDesignPagePersistence`.
Consumer and Pro use this same route and persistence path.

At the 2026-08-04 ratchet the workspace is 543 physical lines, and both the
specialized architecture guard and code-quality baseline record that decrease
from 594. The registration is 125 lines, its pure request arbiter is 43 lines,
and neither creates application/document state.

### Hooks and effects

- Hooks remain unconditional. Do not call hooks inside builders, callbacks, or
  conditional branches.
- Preserve registration order when effects listen to the same browser event or
  synchronize related state. In particular, selection keyboard handling precedes
  command-palette registration.
- Do not merge hooks merely because their data is related. Early telemetry and
  deferred paywall lifecycle hooks remain in their current phases; the stable URL
  replacement callback remains immediately before the deferred lifecycle call.
- Preserve dependency arrays, ref handoffs, cleanup functions, state updater
  semantics, and the distinction between current state and mutable refs.

### Rendering, portals, and accessibility

- Preserve the composition order: QA/palette, scene plus editor chrome, panels,
  then dialogs/feedback.
- Preserve portal targets, stacking levels, focus behavior, dismissal behavior,
  and client-preview visibility. Moving JSX to a component must not change its
  effective containing block or z-index context.
- Preserve test IDs, roles, labels, keyboard shortcuts, status/live-region
  semantics, and touch target behavior.

### Persistence, URLs, APIs, and telemetry

- Do not rename storage keys, query parameters, route paths, analytics events,
  or funnel events during decomposition.
- Preserve `DesignSnapshot`, `StoredDesign`, room/item/opening data, variant and
  configuration identity, and local-backup hydration semantics. Schema changes
  require a separate migration ADR.
- Preserve API paths and payloads for catalog, AI, designs, sharing, exports,
  billing, and tracking. Adapters may move; request/response meaning may not.
- URL replacements retain `{ scroll: false }` and existing query parameters.
- Preserve event timing, once-only refs, metadata fields, guest/auth identity,
  and error-swallowing behavior at telemetry boundaries.

### Canonical cloud-load baseline ownership

Cloud-load normalization and acknowledgment are now explicit decomposition
boundaries rather than incidental state inside the persistence monolith:

- `design-page-persistence-projection.ts` owns the single saved-document
  projection: floor-plan persistence defaults, catalog product snapshots,
  active-room zone reconciliation, migration/validation, canonical round-trip,
  and fingerprinting. Loaded baselines and current saved-state fingerprints must
  use this projection; no transport or partially hydrated snapshot may own a
  baseline.
- `design-page-cloud-baseline.ts` owns the pure state machine and exact
  `{designId, revision, epoch}` identity comparison. Its states are detached,
  loading, pending, acknowledged, and failed. Existing-design writes are
  eligible only for an acknowledged matching identity.
- `useDesignPageCloudBaselineController.ts` owns render-to-render
  acknowledgment after the canonical document, identity, revision, and
  floor-plan state commit. It does not fetch, migrate, or write documents.
- `useDesignPageCloudLoadController.ts` owns fetch/validate/normalize/install
  sequencing and delegates abort/supersession to the existing requested-design
  coordinator. It does not own autosave or conflict policy.
- `useDesignPageCloudConflictCopyController.ts` owns recovery-copy creation,
  including its pre/post write gates and detached-new-identity commit. It does
  not own general conflict UI or ordinary save/autosave policy.
- `useDesignPagePersistence.ts` retains manual save, autosave, conflict UI,
  local backup, URL, and serialized-write ownership and composes the focused
  recovery-copy controller. It consumes the baseline controller as a write gate
  and stages successful ordinary cloud-write identities; it does not implement
  a second normalizer or fingerprint.

The ordering invariant is request epoch → validated ID/revision → canonical
projection → pending baseline → document/identity/revision commit → exact
post-commit acknowledgment → dirty calculation/autosave eligibility. A stale,
aborted, failed, or cross-design request cannot skip this order. Local-only
drafts remain detached from cloud acknowledgment and retain their existing
local persistence behavior.

## Performance considerations

- File extraction alone does not reduce render work, bundle size, scene cost, or
  memory use. Do not state that it does without measurements.
- Avoid rebuilding large models or callback graphs unnecessarily. Preserve memo
  dependencies and object identity where consumers depend on them.
- Keep high-frequency scene drag, camera, pointer, and selection paths free of
  new state fan-out or context-wide rerenders.
- Keep expensive catalog, geometry, cabinetry, and shopping calculations in pure
  functions or focused memoized read models when measurement shows they matter.
- Use existing scene-performance QA snapshots, browser traces, React profiling,
  and representative large-room/multi-room fixtures for before/after comparison.
- Record the device, fixture, build mode, sample window, and metric when making a
  performance claim.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hook or effect reordering | Extract at the existing call site; use split registration facades; add order guards where behavior depends on order |
| Stale closures or ref drift | Preserve dependency arrays and typed ref contracts; test drag, history, selection, and persistence handoffs |
| Contract or schema drift | Infer from existing controller/leaf types; prohibit payload, storage, and schema changes in cleanup batches |
| Portal or layer regression | Keep region order and portal ownership stable; run dialog, focus, mobile overlay, and screenshot checks |
| Source-regex tests blocking safe moves | Import pure behavior; retarget ownership checks to the new owner rather than weakening assertions |
| Prop explosion becoming a mega-controller | Group by domain and lifecycle; keep facades narrow; reject cross-domain convenience bags |
| Dirty-worktree loss or mixed patches | Snapshot and checkpoint first; review task-specific diffs; never replace whole dirty files |
| Build-only integration failures | Run clean TypeScript and production build after every accepted tranche |

## Test matrix

| Gate | Required evidence |
| --- | --- |
| Pure behavior | Import-based fixtures for extracted policy, ranking, reconciliation, transforms, persistence mapping, and compatibility adapters |
| Static quality | Targeted and full ESLint with zero warnings; non-incremental TypeScript; scoped `git diff --check` |
| Structural guards | Thin route, workspace/region/controller size limits, owner imports, hook registration boundaries, and render/layer order |
| Production | `npm run build`, including page-data collection and all static pages, with the normal local build environment |
| Runtime | Canonical `/design` returns HTTP 200; fresh browser/server logs contain no page or console errors |
| Core editor | Runtime smoke, onboarding, plan/furnish navigation, item placement, selection transforms, undo/redo, rotation, variants, and selected-item actions |
| Document workflows | Local backup, cloud save/load/delete, new plan, sharing, exports, and persisted zone/opening/surface identity |
| Plan and scene | Smart placement, multi-room, mobile plan mode, room resize, floor management, flooring/surfaces, camera transitions, and scene readiness |
| Access/features | Guest, authenticated Free, Pro/designer, client preview, paywall/billing, shopping, AI, and cabinetry |
| Accessibility/visual | Roles, labels, shortcuts, focus return, portal dismissal, touch targets, Consumer/Pro contrast, and focused visual snapshots |
| Performance | Only when affected: captured before/after measurements on the same fixture and build mode |

Unexpected Playwright skips fail acceptance unless the test explicitly documents
an unavailable external prerequisite. Tautological assertions are not coverage.

## File-size ratchet

- `app/design/page.tsx` has a hard ceiling of 30 physical lines.
- `DesignPageWorkspace.tsx` has a hard ceiling of 550 physical lines at the
  accepted checkpoint. The automated architecture guard enforces this ratchet.
- No replacement handwritten production module should become a god module. This
  applies to controllers, facades, adapters, read models, regions, and feature
  modules—not only to the workspace.
- Review the responsibilities of every handwritten production module over 350
  lines. A module over 500 lines requires an explicit reason to remain whole and
  a documented extraction decision. A module over 800 lines should be strongly
  presumed to need splitting.
- After every accepted batch, lower the recorded workspace ceiling to the new
  value. A later change may not raise it without an explicit ADR update.
- Count physical source lines in structural guards. Do not game the ratchet with
  minified formatting, giant inline objects, generated code, or unrelated moves.
- The line limit is a composition signal, not the goal by itself. Acceptance also
  requires readable contracts, correct dependency direction, and the complete
  behavior/test matrix above.

When the workspace reaches approximately 300–600 lines—or a specifically
justified maximum of 800—and all final gates pass, stop cleanup work. Further
architecture changes should be justified by a feature, measured defect, or
separate ADR rather than continued decomposition for its own sake.

## Deferred oversized domain modules

The following pre-existing modules remain above 800 lines. They were deliberately
not split in the final composition batches because each is behavior-heavy and a
safe extraction needs its own characterization tests, profiling where relevant,
and reviewable feature scope. Their size is recorded technical debt, not a reason
to continue the completed workspace cleanup opportunistically.

| Module | Lines | Deferred ownership decision |
| --- | ---: | --- |
| `design-page-house-plan.ts` | 2,835 | Split geometry/topology, derived plan models, and validation in a dedicated plan-domain change |
| `useDesignPageCatalogPlacement.ts` | 2,103 | Stateful placement lifecycle remains stable; continue extracting importable ranking/assessment policy only with placement coverage |
| `useDesignPageProductConfiguration.ts` | 1,808 | Variant/configuration lifecycle and compatibility need a dedicated product-domain batch |
| `useDesignPageSurfaceActions.ts` | 1,348 | Surface mutation transactions and analytics remain coupled pending dedicated characterization tests |
| `useDesignPageCameraNavigation.ts` | 1,260 | High-frequency camera behavior requires profiling and interaction coverage before further extraction |
| `useDesignPagePersistence.ts` | 1,131 | Storage, cloud persistence, URL, and guest/auth compatibility require a focused persistence change |
| `useDesignPageProductSelectorState.ts` | 1,010 | Selector lifecycle remains a product-domain follow-up |
| `design-page-calibration.ts` | 992 | Calibration math and workflow policy need separate pure-domain fixtures |
| `useDesignPageSelectionTransforms.ts` | 991 | Transform/history behavior needs focused pointer, keyboard, and undo/redo coverage |
| `useDesignPageSurfaceInspector.ts` | 964 | Inspector state and surface compatibility remain a dedicated surface-domain follow-up |
| `design-page-product-data.ts` | 950 | Static product mapping remains cohesive but should be split by schema/mapping responsibility when modified |
| `PresentExportDialog.tsx` | 947 | Export workflow branches need focused component decomposition and accessibility coverage |
| `SelectedSurfaceInspector.tsx` | 838 | Inspector UI should split by surface kind when feature work next touches it |
| `design-page-model-maps.ts` | 830 | Model mapping tables remain isolated data policy; split by model family only when maintained |
