# Catalog comparison identity

## Contract

Catalog comparison stores ordered product IDs. It does not store product,
variant, price, media, availability, or commerce objects. Every render resolves
those IDs against the current unfiltered **public furnish catalog** projection.
Search, category, room, brand, price, stock/smart filtering, and family grouping
may change the rendered card grid but cannot become comparison lookup owners.

`resolveCatalogCompareItems` in `lib/catalog/compare.ts` is the focused lookup
owner. It accepts explicit product IDs, the selected variant ID map, and the
current canonical card map, then returns one ordered result per ID. A missing or
identity-mismatched product becomes `unavailable`. If catalog refresh removes a
selected variant and the underlying variant resolver falls back to a default,
the selector detects that variant-ID mismatch and also returns `unavailable`.
Neither state exposes preview or add actions or falls through to another product
or variant.

The selector does not create a registry or retain card objects. `CatalogPanel`
builds `allCardById` from its current `items` prop and selected-variant map. A
catalog refresh therefore rebuilds the map and comparison reads the new card
projection. `cardById`, by contrast, remains the rendered-grid map produced after
filtering, smart filtering, and family grouping and must not resolve comparison.

## Public catalog boundary

`useDesignPageImportedModels` owns the furnish catalog state. Its initial source
is the curated `CATALOG_ITEMS` registry. Hydration from `/api/models/imported`
uses `buildImportedModelsPayload`, which filters YAML entries through
`isLiveCatalogEntry` before merging them into the furnish registry. The resulting
`catalogItems` array is passed through `DesignControlsFurnishPanel` to the single
shared `CatalogPanel` used by Consumer and Pro.

Comparison cannot expand that boundary. An admin-only, draft, retired, or
otherwise absent ID is not present in `allCardById`, so it renders only the safe
unavailable state. The selector never imports authoring data or the admin
catalog, and analytics runs only after compare actions; neither controls lookup
correctness.

## Current data flow

| Step | Owner and symbol | Identity | Source and fallback | Missing/stale behavior | Coverage |
| --- | --- | --- | --- | --- | --- |
| 1. Add | `CatalogCard` / `CatalogItemDrawer` -> `CatalogPanel.toggleCompare` | Product ID (`string`) | The action originates on a rendered public card/detail. Existing ID toggles off; a fourth ID replaces the oldest. | No full object is copied. Duplicate IDs cannot accumulate. | `test-catalog-panel-logic.ts`; compare Chromium limit and keyboard cases. |
| 2. Store | `CatalogPanel.compareIds` | Ordered product IDs | Component-local React state only. Selected variants remain separately keyed by product ID in `variantSelectionByItem`. | Compare has no local-storage, URL, document, or cloud persistence contract. | Source guards plus compare Chromium cases. |
| 3. Filter | `useCatalogFilterNavigation`, `filterCatalogItems`, `groupCatalogItems`, smart-filter projections | Product IDs remain unchanged | Search/category/room/brand/price/width/stock-style filters derive `cardViews`; grouping derives rendered families. | A grid card may disappear without mutating `compareIds`. | Deterministic category/search/room/brand/price/grouping checks; catalog filter Chromium cases. |
| 4. Resolve | `CatalogPanel.allCardById` -> `resolveCatalogCompareItems` | Ordered product IDs plus selected variant IDs to discriminated compare results | Current unfiltered public `items` plus current `variantSelectionByItem`. No filtered fallback. | Absent/mismatched product or substituted selected variant becomes exactly one reasoned `unavailable` result. A catalog refresh supplies new card objects. | Fixed-ID canonical-versus-filtered, product/variant removal, mismatch, refresh, order, and mode-parity checks. |
| 5. Render/action | `CatalogCompareTray`; `buildCatalogCardView`; `prefetchDetail`; `addRememberedItem` | Product ID and selected variant ID | Card projection supplies current thumbnail identity, dimensions, price, badges, and variant. Open/add re-enter canonical item/detail/variant and commerce resolution. | Unavailable entries expose only native-button remove/clear actions; no preview, add, retailer, or purchase action is synthesized. | Static render check; product-flow, finish-picker, commerce, publication, accessibility; focused Chromium. |
| 6. Remove/clear | `CatalogCompareTray` callbacks -> `setCompareIds` | Product ID or all IDs | Removal filters the ordered ID list; clear replaces it with an empty list. Analytics observes the completed intent only. | Removing the last available or unavailable identity unmounts the tray. | Clear, remove, keyboard, mobile, order, and limit Chromium cases. |

## Before and after

Before `ARCH-RC51-COMPARE`, `compareCards` mapped ordered IDs through
`cardById`. That map is derived from `cardViews`, so category, search, room,
brand, price, stock/smart filters, or grouping could make a still-public compared
product unresolvable and silently remove it from the tray.

After remediation, `compareItems` resolves the same ordered IDs and their
separately stored selected variant IDs through `allCardById` via the pure
selector. Filter result count and compare count are independent, selected
variant projections stay current, and a removed product or selected variant is
explicit rather than substituted or silently dropped.

## Rollback

Revert the single `ARCH-RC51-COMPARE` implementation commit. This restores the
filtered lookup and removes the unavailable-state projection and focused
coverage; no schema, data migration, persisted compare payload, dependency, or
external setting requires rollback.
