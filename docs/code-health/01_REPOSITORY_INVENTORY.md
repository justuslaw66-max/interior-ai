# Repository inventory

Inventory source: deterministic classification of the 3,417 files tracked by checkpoint `08bdfe0c5e5c882777dc5da38168ea7db14840ad`, supplemented by TypeScript AST/import scans and repository history. Counts are a planning baseline, not a substitute for ownership metadata.

## File classification

| Class | Files | Notes |
| --- | ---: | --- |
| Production source | 1,017 | Application routes, components, features, and runtime libraries |
| Tests | 371 | 240 `scripts/test-*` files, 97 Playwright specs, snapshots and other checks |
| Configuration | 22 | Framework, TypeScript, lint, Playwright, CI, and tool configuration |
| Scripts/tooling | 65 | Excludes files classified as tests despite living under `scripts/` |
| Schema/migrations | 45 | Prisma schema/support plus 42 migration directories |
| Generated source | 1 | `lib/generated/surface-material-runtime.generated.ts`; never hand-edit |
| Catalog/data | 1,144 | Furniture and surface-material YAML plus other domain data |
| Documentation | 125 | Current, historical, release, product, and evidence instructions |
| Binary assets | 624 | GLB, images, fonts, PDFs, snapshots, and vendored Draco runtime |
| Deprecated/legacy candidate | 1 | `lib/floor-plan-legacy-adapters.ts`; still referenced, so not deletion-ready |

The two initially unclassified files, `public/draco/draco_decoder.js` and `public/draco/draco_wasm_wrapper.js`, are vendored/generated Draco decoder runtime assets and belong with generated/vendor assets. No unknown file remains.

Top-level concentration: `catalog` 1,143 files, `public` 548, `lib` 489, `scripts` 307, `components` 228, `app` 160, `features` 137, `tests` 123, `reports` 105, `prisma` 45, `docs` 35, and `incoming` 20. Dominant extensions are YAML (1,139), TypeScript (1,092), TSX (316), GLB (222), WebP (151), JPG (120), PNG (96), Markdown (84), JSON (55), and SQL (43).

## Runtime map

The product is one Next.js application serving Consumer and Pro capabilities through shared document, editor, rendering, catalog, persistence, commerce, and export paths.

- `app/`: pages, API routes, authentication surfaces, admin tools, sharing, exports, health, and commerce endpoints.
- `components/editor/` and `components/scene/`: application shell, design controls, overlays, 2D/3D scene composition, interaction, and item rendering.
- `features/cabinetry/`: cabinetry domain, generators, validation, studio workflows, previews, and document production.
- `lib/design-*`, `lib/floor-plan-*`, and `lib/room-*`: canonical document/persistence models, floor-plan compilation/import, room and placement logic.
- `lib/catalog*`, `catalog/`, and generated surface runtime: catalog authoring, validation, runtime lookup, publication, and product configuration.
- `prisma/` and server-side `lib/*`: persistence, entitlements, admin operations, jobs, evidence, events, and integration boundaries.
- `tests/e2e/` plus `scripts/test-*`: browser/system contracts and a large custom static/behavioral test corpus.

No runtime import cycle was found by the whole-repository resolved import graph when type-only imports were excluded. That is a meaningful strength, but the graph has high fan-in hubs: `lib/room-types` (147 direct incoming imports), cabinetry types (108), Prisma (88), FloorPlanDocumentV2 (82), catalog runtime (78), catalog schema (75), auth (72), design-page house-plan helpers (66), analytics (62), editor scene state (58), and floor-plan import types (57).

## Size and change hotspots

Production TS/TSX contains approximately 281,412 physical lines. The largest behavior-heavy units are:

- `components/scene/RoomRenderer2D.tsx`: 5,636 lines; primary component body approximately 4,254 lines.
- `components/editor/DesignControlsPlanPanel.tsx`: 3,914 lines; component body approximately 3,807 lines.
- `features/cabinetry/components/CabinetryStudioDetailedView.tsx`: 3,375 lines; component body approximately 2,968 lines.
- `features/cabinetry/components/CabinetryStudio.tsx`: 2,696 lines; component body approximately 2,529 lines.
- `features/cabinetry/validation.ts`: 3,842 lines; `validateCabinetDefinition` approximately 3,434 lines.
- `features/cabinetry/generateCabinetParts.ts`: 2,775 lines; `generateModuleParts` approximately 1,719 lines.
- `lib/floor-plan-imports/pdf-raster-adapter.ts`: 2,871 physical lines / 2,808 logical lines.
- `lib/house-plan-3d/geometry.ts`: 2,661 lines.
- `lib/useDesignPageCatalogPlacement.ts`: 2,103 lines; main hook approximately 1,925 lines.
- `lib/useDesignPageProductConfiguration.ts`: 1,824 lines; main hook approximately 1,650 lines.
- `lib/useDesignPageSurfaceActions.ts`: 1,623 lines; main hook approximately 1,423 lines.
- `lib/useDesignPagePersistence.ts`: main hook approximately 1,210 lines.
- `lib/floor-plan-compiler-v2.ts`: 1,682 physical / 1,599 logical lines.

Some very large files are data or generation output rather than handwritten behavior: generated surface runtime is 92,044 lines/2.52 MB, cabinetry document generation is 8,372 lines, Nippon paint data is 2,530 lines, `lib/catalog/data.ts` is 2,413 lines, cabinetry types are 2,228 lines, and preset data is approximately 1,930 lines. Refactor metrics must not treat these classes identically.

History increases the priority of several large units. Direct change counts include `DesignPageWorkspace` 45, the design page route 39, `DesignControlsPlanPanel` 21, `Furniture` 20, `DesignControlsPanel` 19, `RoomRenderer2D` 18, `HousePlanRenderer3D` 16, `CatalogItemDrawer` 14, `GLBScaledModel` 13, `EditorCommandBar` 13, share export 13, and `CatalogPanel` 12. Large plus frequently changed is the most useful hotspot signal.

## Boundary and coverage observations

- There are 355 client-marked files. The present scan found no client import of Prisma, authentication internals, Node built-ins, or non-public environment variables. However, server modules do not use `server-only` guards, leaving a future regression path (CH-0026).
- No explicit production `any`, `@ts-ignore`, `@ts-expect-error`, or TODO/FIXME/HACK marker was found by the targeted scan. This is positive; unsafe shape conversion still exists through `unknown` casting in the legacy design route (CH-0013).
- No direct nearby/static test reference was found for large `useDesignPageProductConfiguration`, `useDesignPageProductSelectorState`, or `huggMaterial` modules. Several other large units have one direct reference. This does not prove absence of indirect E2E coverage, but it identifies characterization-test priorities (CH-0025).
- `scripts/run-design-page-cleanup-tests.mjs` is a handwritten manifest. Forty-four of 240 `scripts/test-*` files are referenced by neither package scripts nor that runner (CH-0025).
- E2E sources are excluded from `tsconfig.json`; the three visual snapshots are Darwin-specific while CI full E2E runs Ubuntu (CH-0025).
- The floor-plan architecture gate permits 30 existing oversized-file warnings; the design architecture gate is currently red. Cabinetry has strong targeted coverage and no runtime cycles, but its coordinator and major views remain very large (CH-0020).

## Documentation and generated/local-output inventory

Current architectural and product documentation contains valuable decisions around document ownership, renderer boundaries, cabinetry decomposition, security/observability, release criteria, and the golden path. Older root and phase documents also contain stale paths, multiple package-manager instructions, obsolete CI claims, and at least one destructive Prisma reset instruction. They should be labeled historical or reconciled, not silently used as current operations guidance (CH-0026).

Generated/local output policy inferred from ignore rules:

- ignore and regenerate: `.next/`, coverage, Playwright reports, `test-results/`, `.local/asset-inventory.json`, dependency caches;
- local secret/config: `.env`, `.env.local`, `.env.*.local`, `.vercel` environment material;
- generated but tracked: `lib/generated/surface-material-runtime.generated.ts`, with source-controlled generator and required future drift check;
- suspicious tracked local artifacts: zero-byte `prisma/dev.db` and `test-results/.last-run.json`, to untrack only in a reviewed hygiene batch.

## Legacy and deletion candidates

No production module was declared dead solely from a static scan. Candidate classes requiring usage proof are the `/design/[id]` legacy editor, `lib/floor-plan-legacy-adapters.ts`, obsolete documentation, dormant Shopify/static-catalog branches, and tracked local output. Deletion entry criteria are: zero runtime/build/test references, replacement parity characterized, migration or redirect in place, telemetry/consumer review complete, and a one-commit rollback. Until then they are adapters or migration surfaces, not cleanup fodder.
