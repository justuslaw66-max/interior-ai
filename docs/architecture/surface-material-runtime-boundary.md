# Surface-material runtime boundary

## Source of truth and generated projections

The files under `catalog/surface-materials/**/catalog.yaml` remain the only
production source of truth. `scripts/generate-surface-material-runtime.ts`
audits every YAML record, rejects duplicate material IDs and slugs, sorts by
material ID, and emits three deterministic projections:

- `lib/generated/surface-material-render.generated.ts` contains the compact,
  synchronous render tuples used to hydrate and render an already-selected
  material.
- `lib/generated/surface-material-catalog.generated.ts` contains browsing,
  filtering, descriptive, and sample metadata. It is dynamically imported.
- `tests/fixtures/surface-material-runtime.generated.ts` contains test-only
  records. Production code does not import it.

`npm run check:surface-material-runtime` compares all three outputs and also
fails while the legacy combined generated file exists. The production render
and catalog projections each contain 980 records in the same order with the
same unique IDs. The test fixture is separate and contains one record.

## Field-consumer matrix

This matrix classifies every field that existed in the former generated
runtime record. Fields that exist only in the wider YAML schema continue to be
owned by the canonical server catalog; they were not silently removed from the
old client projection.

| Former runtime field | Class | Current owner | Proven consumer and reason |
| --- | --- | --- | --- |
| `surface_material.material_id`, `slug` | A — immediate | Eager render registry | `getRuntimeSurfaceMaterialById` resolves persisted IDs/slugs for hydration, actions, 2D, 3D, inspector, and export counting. |
| `surface_material.product_name` | A — immediate | Eager render registry | Active selected-finish and inspector labels remain meaningful before the browser catalog loads. |
| `surface_material.supplier`, `brand` | A/B shared identity | Eager render registry | Selected-finish identity and grouped inspector fallback are synchronous; browser grouping reuses the same values after the join. |
| Declared `surface_material.collection` | E — not emitted by former generator | Canonical YAML only | The former runtime type allowed this optional field, but its generator never emitted it. The split preserves actual fallback/grouping behavior instead of newly activating collection labels. |
| `surface_material.surface_category`, `material_family` | A/B shared classification | Eager render registry | Surface actions/inspector must distinguish flooring, walls, paint, and families before browsing; the browser also filters/groups on them. |
| `classification.design_effect`, `color_family` | A/B shared visual classification | Eager render registry | The synchronous inspector and lazy browser use the same visual identity/facet values. |
| `physical_specs.plank_width_mm`, `plank_length_mm`, `tile_width_mm`, `tile_length_mm` | A — immediate rendering | Eager render registry | `useSurfaceMaterialTexture`, 2D/3D material adapters, and the surface inspector derive physical UV/pattern scale and variant geometry. |
| `texture_assets.*` | A — immediate rendering | Eager render registry | Base color/swatch, normal, roughness, AO, preview, tiling, and repeat size feed the shared 2D/3D texture pipeline and safe fallback selection. |
| `rendering.*` | A — immediate rendering | Eager render registry | Rotation, roughness, metalness, normal strength, scale mode, seam strategy, source patterns, and layouts are renderer inputs and therefore never lazy. |
| `import_governance.publish_status`, `publish_blockers` | A/B shared availability | Eager render registry | A selected saved material must retain its exact status and identity; browser visibility and surface summaries reuse them after loading. |
| `source.source_url`, `sample_request_url`, `license_status` | B — browser/details | Lazy catalog metadata | Source/detail links and sample actions are read only inside the opened surface workspace. |
| `classification.tone`, `style_cluster`, `room_suitability` | B — browser/search/filter | Lazy catalog metadata | Search and browsing facets use these descriptions only after the surface workspace opens. |
| `physical_specs.total_thickness_mm`, `wear_layer_mm`, `waterproof`, `suitable_for_outdoor`, `commercial_grade` | B — browser/details | Lazy catalog metadata | Product grouping/detail labels and compatibility information do not affect initial scene hydration or rendering. |
| `commerce.purchase_mode`, `sample_available`, `sample_request_url` | B — browser/details | Lazy catalog metadata | Surface browser summaries, source links, and sample actions consume these only after the lazy join. |
| Nippon paint names, codes, hex values, families, and source paths | B — browser/search/filter | Lazy paint catalog | `WallPaintPicker` needs the 2,484 rows only while the surface workspace is visible. The small canonical family/count/source contract and twelve curated defaults remain eager. |
| Full YAML price/currency, installation, wet-area/slip data, source notes/region, checkout, and QA fields | C/E — server/admin/BOM or not in former client runtime | Canonical YAML and `catalog-registry` | `surface-material-bom.ts`, share CSV/PDF, and admin/audit code use the canonical validated server record. These fields were never in the former generated client runtime and are not duplicated into either new projection. |
| Test-only material records | D — tests only | Test fixture generated module | Schema and fixture-isolation tests import them directly; production output and chunks contain no test marker. |

## Runtime and loading contract

`lib/surface-material-runtime.ts` synchronously decodes the compact render
tuples, freezes the 980-record registry, and builds one ID/slug map. Rendering,
room hydration, material application, 2D/3D switching, surface inspection, and
export material counting use that facade without loading catalog metadata.

`lib/surface-material-catalog-loader.ts` is the only production owner of the
dynamic imports for the generated catalog metadata and the Nippon paint
catalog. One cached promise coordinates both imports. On success it validates
duplicate, missing, and count mismatches before joining metadata to the eager
render records. A fulfilled load is reused across repeated open/close cycles.
A rejected load remains rejected until explicit `retry`; it does not loop or
alter the eager render registry.

`lib/nippon-paint-catalog.ts` is the one small source for Nippon families,
count, source URL, and import date. The large row module and the eager paint
helpers both consume that contract, so deferring rows does not duplicate
catalog constants or create a drift-prone second source of truth.

`useSurfaceMaterialCatalog` starts the load only after an explicit room-finish
workspace open. Both the contextual room card and the Pro standalone
floor-finish card have an explicit Change/Browse transition before rendering
the browser. It does not load merely for Consumer or Pro `/design` mount,
room/project hydration, or 2D/3D view change. The boundary shows a bounded
loading state and a recoverable error with Retry while the currently selected
material continues to render from the eager registry.

The surface browser receives the joined records for search, filters, groups,
source/sample details, and Nippon paint rows. Server BOM/share/export remains
on `catalog-registry`, so its product identity and commerce metadata are
unchanged and it does not introduce a client lazy-load dependency.

## Boundary verification

`scripts/test-phase8-performance-boundaries.ts` proves ID/order parity,
required render fields, a synchronous selected-material lookup, single-flight
and fulfilled caching, rejected-promise stability, explicit retry, approved
dynamic imports, absence of static catalog imports/barrel exports, test-fixture
isolation, and semantic initial/lazy chunk membership. The full schema test
continues to cover texture scale/pattern behavior, room persistence, 2D/3D
identity, BOM, export, search helpers, and production/test counts.

The Phase 8A measurement and exact before/after chunk inventories are recorded
in `docs/architecture/phase8-performance-baseline-and-budgets.md`.
