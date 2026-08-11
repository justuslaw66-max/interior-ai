# Architecture rules

Interior AI is one Next.js application with one canonical design meaning. Consumer and Pro are capability projections over shared document, command, rendering, persistence, catalog, and accessibility systems. These rules preserve that model while allowing incremental extraction behind existing contracts.

## Dependency direction

Delivery and rendering adapters depend on application use cases, which depend on domain models and commands. Infrastructure implements narrow ports owned inward:

`routes / UI / workers -> application services -> domain models and commands`

`Prisma / storage / email / payments / analytics / AI / render tooling -> typed ports`

Domain calculations must not depend on React, Three.js, Prisma, HTTP request objects, or vendor SDK shapes where a pure value contract is practical. Routes authenticate, validate, invoke one use case, and translate typed results. Renderers project canonical values and send commands back; they do not own persistence or alternate geometry.

## Canonical design and editor

- There is one versioned persisted document for rooms, floors, walls, openings, items, surfaces, cabinetry, and capability-independent meaning.
- Legacy input migrates at a boundary. It must not become a second editor model.
- The editor application layer owns load/save, undo/redo, selection, gestures, placement, room/floor switching, sharing, and export transactions. Each mutation and gesture has one owner.
- Consumer is the default presentation. Pro registers additional capabilities and metadata over the same commands and document; unavailable editing capability never silently deletes durable data.

## Geometry, placement, and rendering

- 2D and 3D consume the same canonical scene/document projection and shared placement/collision engine.
- The plan plane is XZ, Y is vertical, and durable rotation is `rotationDeg` about Y. Adapters may derive radians or matrices but may not persist a competing representation.
- Global selected-item rotation shortcuts are owned by `useDesignPageSelectionKeyboardController` and must execute through the shared selection-transform command path. Scene items may own pointer rotation gestures, but must not register window- or document-level rotation shortcuts.
- Active room tracing has higher ownership only for unmodified `R`: the selected-item capture router must decline that event before consuming it so the tracing route receives it once. Absent a pending placement, `Shift+R`, `Q`, `E`, and `0` remain selected-item commands; `Cmd/Ctrl/Alt+R` remains available to the browser/platform. Editable or modal focus and captured pointer interaction block both routes. Event-time tool refs, not render-time closures, decide this priority.
- The complete design-page keyboard priority is: editable/modal exclusion, then captured pointer interaction, then active tracing's plain `R`, then pending placement, then selected-item commands, then browser/platform default.
- Cmd/Ctrl+K has one editor-scope owner. Input, textarea, and contenteditable targets retain native suppression; Client Preview prohibits the command; any registered or external topmost modal consumes and blocks the shortcut. The Command Palette itself must register through `EditorDialog`, bind one route/design/project/mode generation, and synchronously close/consume before invoking an action so a dialog created by that action becomes the sole topmost owner.
- `useDesignPageFloorPlanTracingKeyboard` owns the single tracing listener lifecycle, while `useSynchronizedFloorPlanTraceMode` owns the intentional React-state/event-time-ref pair. Plan, editor, and selection composition pass one typed keyboard-ownership capability; broad facades must not reconstruct its individual refs or add another listener.
- Plan/topology calculations, measurements, constraints, openings, and placement decisions remain pure domain logic where practical.
- Rendering adapters own scene projection, picking, resource handles, material application, frame invalidation, and deterministic cleanup. They do not write persistence.
- Asset loading/decoding is deduplicated by normalized identity. Resource clone/instance and disposal ownership must be explicit.
- Global editor keyboard commands belong at editor scope, not per scene item. Static scenes must not perform avoidable per-item frame work.

## State and React boundaries

Appoint one source of truth for each durable or interaction state. Do not mirror canonical document data into a second store or rebuild derived state through effects. React hooks should adapt explicit application/domain owners rather than conceal business policy.

Place `use client` at the narrowest interactive boundary. Browser-safe shared modules must not import Prisma, auth secrets, Node filesystem/process-only modules, non-public environment values, or privileged integrations. Server modules expose typed DTOs and commands, not internal records.

## Catalog and generation

Catalog architecture separates authoring source, validation/publication, generated immutable projections, and consumer adapters. Every consumer uses stable identities from the canonical projection; runtime mutation of imported maps is forbidden. Public DTOs exclude authoring paths and validation internals.

Compared product IDs resolve through the current unfiltered public catalog projection, never through filtered or grouped card results. Comparison state contains ordered identities rather than mutable product objects; absent identities fail closed as unavailable without exposing draft/admin data or substituting another product.

Generated files contain provenance and are changed only by their generator. CI runs drift/schema check mode. Catalog source, generated output, fixtures, and local/build artifacts stay visibly separate.

## Persistence, security, and integrations

Authorization and validation occur before protected state access. Cross-row policy such as quotas, claims, state transitions, or token rotation uses an atomic transaction/CAS/lock/counter, not route-level check-then-write. Unknown environment or role classification fails closed.

Prisma and privileged integrations remain server-only behind explicit application services or repositories. External adapters own vendor DTO conversion, bounds, timeouts, retries, idempotency, redaction, and stable error translation. Browser analytics cannot emit server-authoritative lifecycle events.

## Dependency and module rules

- Do not use barrel exports to obscure ownership or reverse dependency direction.
- Static runtime import cycles are forbidden. The repository-wide quality gate covers measured production TypeScript and the specialized domain architecture gates retain additional boundary contracts; dynamic imports remain explicit asynchronous boundaries.
- Do not add generic utility/helper/manager/service dumping grounds. Names and locations must reveal the domain responsibility.
- Avoid direct database access from new delivery code when an application repository/service owns the use case.
- New architecture is introduced beside an existing contract, migrated one caller at a time, and removed only after parity and reference proof.

## Refactor protocol

Characterize the public contract first. Add a narrow interface, move one responsibility/caller, prove parity, then lower the relevant ratchet. Preserve facades while callers migrate. Do not mix document migrations, dependency upgrades, generated rewrites, formatting, visual redesign, or feature changes into structural extraction.

An architectural change must record the chosen owner, dependency direction, compatibility effect, rejected alternatives that materially affect future work, verification, and rollback. Exceptions to size or function metrics require a cohesion-based reason and expiry; they do not waive these dependency rules.
