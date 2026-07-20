# ADR 0001: Cabinetry Studio composition boundaries

- Status: Accepted
- Date: 2026-07-20
- Owners: Editor and Cabinetry maintainers

## Context

`CabinetryStudio.tsx` began the hardening program as a 10,505-line client
component. It combined public contracts, initialization, state, history,
storage, analytics, import/export, domain commands, generated output, 3D
preview ownership, Guided presentation, and Detailed presentation. The module
was difficult to review without risking persisted-data, accessibility, and
Consumer/Pro behavior.

The application must retain a lazy `next/dynamic` overlay boundary, stable
Cabinetry Studio props, millimetre-based domain values, stable saved IDs,
existing storage keys, and one canonical definition shared by 2D and 3D.

## Decision

Keep `CabinetryStudio.tsx` as the client composition root and compatibility
facade. It owns initialization, hooks, derived state, commands, side effects,
busy/error state, and IO-adapter calls. It selects one of two hook-free,
IO-free mode views:

- `CabinetryStudioGuidedView.tsx` owns Guided/Consumer markup and event
  adaptation.
- `CabinetryStudioDetailedView.tsx` owns Detailed/Pro markup and event
  adaptation.

Each view receives a labeled readonly binding tuple. The tuple order is
statically checked and avoids shipping repeated property-name strings in the
large lazy Studio chunk. Focused components, hooks, state modules, storage,
analytics, and document-IO adapters remain below those three boundaries.

The overlay imports the prop contract as a type and dynamically imports the
implementation with `ssr: false`. Lower feature modules may not import the
composition root. Presentation modules may not own React lifecycle, storage,
analytics, document IO, or generated-part lifecycle.

## Consequences

- The original coordinator is 2,696 lines, with separate ratchets of 2,750,
  2,050, and 3,400 lines for coordinator, Guided view, and Detailed view.
- Public props, default export, error/loading semantics, saved schemas, storage
  keys, DOM test IDs, and Consumer/Pro capability behavior remain compatible.
- Labeled tuples are less discoverable than named object properties; their
  labels and order assertions are mandatory and covered by composition tests.
- Further extraction must move one cohesive lifecycle, command family, or
  named view section. A global editor context, mega-controller, or broad
  `utils` module is not an accepted replacement.
- `npm run check:cabinetry-architecture` enforces line ratchets, lazy loading,
  dependency direction, presentation ownership, and runtime-cycle freedom.

## Rejected alternatives

- A global Cabinetry context: hides dependencies and broadens rerender scope.
- A replacement mega-hook/controller: moves rather than resolves ownership.
- Eager Studio import: regresses the existing lazy route boundary.
- Separate Consumer and Pro models: risks saved-data and output divergence.
- Prop objects with hundreds of repeated keys: clearer locally but measurably
  increases the already budgeted lazy chunk without improving ownership.

## Verification

The accepted decision is protected by `npm run verify:cabinetry`, non-
incremental TypeScript, zero-warning scoped ESLint, production build and bundle
budgets, and the complete Cabinetry Playwright file.
