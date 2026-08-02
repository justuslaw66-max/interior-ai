# Target architecture

## Intent

Interior AI remains one product and one deployable Next.js application. Consumer and Pro are capability/entitlement projections over the same canonical design document, editor commands, renderers, persistence, and catalog identities. The target is not a rewrite, microservice split, or visual redesign. It is a set of enforceable ownership boundaries that let the current product evolve safely.

## Dependency direction

Dependencies should flow inward from delivery and rendering adapters to application services and pure domain contracts:

`routes / UI / workers -> application services -> domain models and commands`

Infrastructure implements ports owned by the application/domain layer:

`Prisma / object storage / email / Stripe / Shopify / PostHog / OpenAI -> typed ports`

Generated/catalog inputs are compiled before consumers load them:

`authoring source -> validation + generation -> versioned immutable runtime projections -> UI / API / export / commerce`

Cross-layer access happens through typed commands, queries, DTOs, and resource handles—not mutable module globals, deep component refs, or direct database imports from delivery code.

## Proposed module boundaries

### 1. Canonical design domain

Owns document versions, rooms, floors, openings, placed items, finish/material references, cabinetry references, selection-independent geometry semantics, migrations, and pure commands. Existing `lib/design-document-*`, room types, floor-plan document V2, and command modules are the migration nucleus.

Rules:

- one canonical persisted shape with versioned adapters;
- commands are deterministic and return state plus domain events/errors;
- routes and renderers do not invent alternate document shapes;
- legacy snapshots migrate at the boundary and never become a second editor model;
- Consumer/Pro capability does not alter document meaning.

Addresses CH-0012, CH-0020, and CH-0021.

### 2. Editor application layer

Owns use cases and interaction transactions: load/save, undo/redo, room/floor switching, selection, placement gestures, catalog selection, surface changes, sharing, and export orchestration. React hooks become thin adapters over explicit services/stores while existing public hook facades remain during migration.

Suggested internal packages under the current repository, introduced only when needed:

- `features/editor/application/commands/`
- `features/editor/application/queries/`
- `features/editor/application/transactions/`
- `features/editor/state/`
- `features/editor/ui/`

Rules:

- one owner per mutation and gesture lifecycle;
- root composition registers capabilities but does not implement domain calculations;
- telemetry observes events without forcing root state updates;
- URL/loading is centralized through a canonical design-editor URL/query adapter.

Addresses CH-0012, CH-0020, CH-0021, and CH-0022.

### 3. Plan and geometry domain

Owns canonical 2D geometry, constraints, measurements, wall/opening topology, imports, evidence, compilation, and validation. Rendering adapters consume immutable projections; they do not own topology truth.

Organize large floor-plan units by pipeline stage rather than arbitrary file size:

- ingress and bounded source reading;
- extraction/observation adapters;
- evidence and reconciliation;
- canonical topology compilation;
- quality/publication policy;
- persistence/job lifecycle.

Existing strong floor-plan tests remain the compatibility contract. Oversized warnings ratchet only as a touched module is decomposed. Addresses CH-0005, CH-0020, CH-0023, and CH-0024.

### 4. Rendering and scene runtime

Owns projection of canonical documents into 2D/3D scene records, asset acquisition, instancing/cloning, material application, animation/invalidation, picking, and disposal.

Introduce an explicit `SceneAssetRepository`/resource handle contract:

- one configured loader/decoder pipeline;
- promise deduplication and negative/retry policy by normalized asset identity;
- reference-counted clone/instance ownership;
- deterministic texture/geometry/material disposal;
- diagnostics outside React root state;
- one editor-level keyboard command owner.

Renderers remain adapters and receive commands/callbacks rather than mutating persistence. Visual output, camera behavior, transforms, selection, and exports are golden-test invariants. Addresses CH-0013, CH-0014, CH-0021, and CH-0022.

### 5. Catalog and material platform

Separates four concerns that currently overlap:

1. **Authoring source:** the product-owned durable source selected by decision record.
2. **Validation/publication:** controlled schema/status, media health, provenance, review, and fail-closed publication.
3. **Generated runtime projections:** versioned immutable client render index, server product/commerce index, optional Pro authoring metadata, and fixtures in separate test modules.
4. **Consumer adapters:** editor search/configuration, public API DTO, export, affiliate, Shopify, and admin review.

Every projection carries a catalog build/version digest. Consumers never mutate the registry. Selected/saved render records remain available even when browsing metadata is lazy. Addresses CH-0006, CH-0007, CH-0008, CH-0013, and CH-0024.

### 6. Persistence and workflow services

Owns transaction boundaries, authorization, quota reservation, guest claims, sharing, import transitions, outboxes, and stable API errors. Routes become authentication/parsing/response adapters.

Core services:

- `DesignCreationService` for every create/import/duplicate/merge/claim path;
- `GuestCapabilityService` for server-minted identity and retention;
- `ShareService` for irreversible token revocation/rotation;
- `ImportJobService` for versioned state transitions;
- `ApiOperation` wrapper for bounded input, stable errors, operation IDs, and observability.

Prisma is server-only and accessed behind these services. Cross-row policy uses a transaction, CAS/version, advisory lock, or atomic counter rather than route-level count-then-write. Addresses CH-0002, CH-0010, CH-0018, CH-0023, and CH-0026.

### 7. Identity, authorization, and abuse prevention

Owns explicit environment classification, authentication context, roles/capabilities, trusted client identity, distributed budgets, and security audit events.

Rules:

- unknown deployment configuration is an error, never development privilege;
- admin, publisher, reviewer, and emergency roles are explicit capabilities;
- cost limits compose user/guest/IP/global keys and use shared storage;
- browser event schemas cannot express server-authoritative lifecycle events;
- server modules are marked and graph-tested as server-only.

Addresses CH-0001 through CH-0005 and CH-0026.

### 8. External integration adapters

Stripe, Shopify, PostHog, email, OpenAI, object storage, PDF/raster tools, and GLB processing implement narrow ports. They own vendor DTO conversion, retry/idempotency, timeouts, resource bounds, and redaction. Domain/application modules do not import vendor SDK shapes.

Request-time tools are installed and pinned at build. Privacy-sensitive analytics are default-deny until policy/consent state is supplied. Addresses CH-0003, CH-0004, CH-0009, and CH-0011.

### 9. Accessible UI system

Shared primitives own dialog/drawer/popover semantics, focus, escape/outside-click behavior, inert backgrounds, responsive constraints, status/error announcements, and return focus. Feature overlays supply content and domain callbacks. Addresses CH-0015.

### 10. Verification and release evidence

One machine-readable test manifest classifies each command/spec as fast-required, risk-triggered, preview, release-only, integration, destructive, or retired. Generated artifacts and migrations have digests. CI starts and tests the exact strict artifact. Release evidence records code SHA, build ID, catalog digest, migration digest/status, environment class, commands, outcomes, skips, and artifact links. Addresses CH-0016 through CH-0019, CH-0025, and CH-0027.

## Consumer and Pro invariant

Capability checks may reveal tools, limits, metadata, workflows, and export formats. They must not create separate document semantics, catalog identities, scene objects, save/load routes, or accessibility primitives. A Consumer document opened after upgrade to Pro—and a Pro document viewed without a Pro-only editing control—must retain geometry, placed products, finishes, cabinetry, and render/export meaning.

The target capability model is:

- authentication context supplies identity;
- entitlement query returns named capabilities and limits;
- UI registration declares which commands/views require each capability;
- application services enforce the same capability server-side;
- canonical document contains durable feature data, not plan-branded forks;
- unavailable editing capability produces read-only/upgrade behavior, never silent data deletion.

## Enforceable architecture rules

Add these gradually, with existing violations baselined and touched-file ratchets:

- no client graph reaches Prisma, `fs`, auth secrets, non-public environment values, or server integration modules;
- no API route performs direct count-then-create quota logic;
- no public DTO includes filesystem paths or validation internals;
- no runtime mutation of generated/static catalog maps;
- no renderer writes persistence directly;
- no component below editor application scope installs a global editor keyboard command;
- no generated source changes without generator drift/schema checks;
- no new unclassified `scripts/test-*` or E2E spec;
- no migration/release evidence without ordered digest and upgrade coverage classification;
- no increase to touched hotspot size/budget without an explicit exception and expiry.

## Migration strategy

Use a strangler sequence:

1. characterize current public behavior and make the fast baseline unambiguous;
2. add a narrow interface beside current code;
3. route one caller/use case through it;
4. prove parity with focused and golden tests;
5. migrate callers in small batches;
6. delete the old path only after import/runtime/telemetry proof;
7. lower the architecture ratchet after each extraction.

Do not combine dependency upgrades, formatting, generated-data rewrites, document migrations, visual redesign, or feature changes with structural extraction. Each needs its own review and rollback boundary.

## Success measures

- no P1 security/publication finding remains open without an owner and dated exception;
- all required fast checks green on two consecutive runs;
- strict production artifact smoke is required and records build/catalog/migration identity;
- initial JS and Phase 8 performance are under ratcheted budgets with stable fixtures;
- legacy `/design/[id]` has zero lossy renderer usage;
- all catalog consumers resolve one immutable identity/version;
- 3D repeated assets load once and static scenes perform no per-item idle work;
- every test and generated file has an explicit command/cadence;
- top high-churn functions shrink through parity-preserving extractions, not wholesale rewrites.
