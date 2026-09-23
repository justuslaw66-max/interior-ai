# Gardenia Surface Catalog Cross-Check - 2026-07-04

## Scope
- Source index: https://www.gardenia.it/en/collections
- Configurator source: https://www.gardenia.it/en/configurator
- Embedded configurator app: https://www.realityremod.com/GARDENIA
- Imported only Gardenia collections exposed by the RealityRemod configurator catalog.
- Collection pages were used as the source of truth for technology, collection size ranges, thickness ranges, and per-color availability.

## Results
- Gardenia collection index links found: 22
- Configurator tile groups imported: 144
- Exact tile item/target variants fetched: 995
- Equivalent visible variants collapsed: 40
- Visible surface material entries written: 955
- Flooring variants: 473
- Wall tile variants: 482
- Flooring product cards after UI size grouping: 127
- Entries enriched from collection product pages: 955
- Entries with unambiguous inferred thickness: 517
- Missing local swatch/base-color assets: 0
- Duplicate Gardenia material IDs: 0
- Duplicate visible Gardenia variant groups: 0

## Imported Configurator Collections
- Anima: 38 variants, 26 with exact thickness
- Bon Ton: 53 variants, 53 with exact thickness
- Dorica: 24 variants, 0 with exact thickness
- Falaise: 44 variants, 14 with exact thickness
- Gioia: 21 variants, 0 with exact thickness
- I Pigmenti: 166 variants, 146 with exact thickness
- La Geoteca: 92 variants, 47 with exact thickness
- La Marmoteca: 201 variants, 105 with exact thickness
- Make: 60 variants, 40 with exact thickness
- Orosei: 78 variants, 46 with exact thickness
- Oxide: 38 variants, 30 with exact thickness
- Pietra Viva: 86 variants, 0 with exact thickness
- Tabulae: 54 variants, 10 with exact thickness

## Gardenia Collections Not In Configurator Import
These are present on the Gardenia collection index, but were not exposed by the RealityRemod configurator tile catalog response used for this import:
- boiserie
- camouflage
- chrome
- epoque20
- hermione
- just-nature
- luce
- pleinair
- storm

## Correctness Rules Applied
- Each imported material now maps to one Gardenia configurator tile item, format, surface target, and tile number.
- If Gardenia exposes multiple item codes with the same visible target, product name, dimensions, thickness, design metadata, and texture, the importer keeps one visible catalog entry and records the equivalent item code references in source notes.
- The `/design` material browser groups same-look size variants into one product card; sizes remain selectable in the Product detail Size section before applying.
- `tile_width_mm`, `tile_length_mm`, and `texture_repeat_size_cm` come from the configurator item format.
- `source_url`, technology, collection description, collection size list, collection thickness list, and color availability come from the English Gardenia collection page.
- `total_thickness_mm` is filled only when the collection page makes the thickness unambiguous for that color and format.
- When Gardenia lists multiple possible thicknesses for the same color/format, thickness remains `null` and the material keeps the `confirm_physical_dimensions` blocker.
- Slip rating, package quantity, price, and seamless texture QA remain unresolved because they were not exposed by the checked Gardenia pages/API.

## Verification
- `npm run import:gardenia-surfaces -- --dry-run --skip-assets`
- `npm run import:gardenia-surfaces`
- Runtime registry regenerated with `scripts/generate-surface-material-runtime.ts`
- Exact visible-variant scan passed: 0 duplicate visible Gardenia groups
- Surface material schema audit passed: 980 files scanned
- `npm run test:catalog-audit` passed: 109 files scanned
- `npm run test:catalog-asset-availability` passed: 109 files scanned, Gardenia local assets present; unrelated draft model warnings remain non-blocking
- `npx playwright test tests/e2e/flooring-surface-materials.spec.ts` passed: 3 tests, including live Gardenia size selection
- `npx tsc --noEmit` passed
- `npm run build` passed
