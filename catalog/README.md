# Catalog Authoring

Use the template and vocabularies under `catalog/furniture/_templates/` for each new model.

## Files
- `catalog/furniture/_templates/master_catalog.yaml`: master item schema template
- `catalog/furniture/_templates/controlled_vocabularies.yaml`: approved enum-style values
- `catalog/IMPORT_GOLD_STANDARD_CHECKLIST.md`: repeatable QA checklist and reference examples
- `catalog/IMPORT_OPERATING_RULE.md`: import-wave guardrails and canonical-family coverage
- `catalog/furniture/dining_tables/brighton_oval_180/catalog.yaml`: concrete example

## How To Add A New Item
1. Create a model folder (example: `catalog/furniture/sofas/jaron_3s/`).
2. Copy `master_catalog.yaml` into that folder as `catalog.yaml`.
3. Fill all fields using `controlled_vocabularies.yaml` values.
4. Place model/preview assets beside the catalog file.
5. Run `npm run test:catalog-audit` before considering the item publish-ready.

## Quality Gates
- `npm run test:catalog-governance`: checks asset-id coverage, duplicate mappings, and malformed YAML.
- `npm run test:catalog-quality`: checks frozen vocab values, required publish fields, variant finish/swatch consistency, and publish readiness.
- `npm run test:catalog-audit`: runs both checks together.

## Reference Set
Use these as current gold-standard examples for future imports:
- `catalog/furniture/dining_tables/kelsey_marble_160/catalog.yaml`
- `catalog/furniture/dining_benches/sloane_bench_150_no_cushion/catalog.yaml`
- `catalog/furniture/sofas/jaron_3s/catalog.yaml`
- `catalog/furniture/sofas/madison_2s/catalog.yaml`
- `catalog/furniture/sofas/madison_ottoman/catalog.yaml`

## Family Canonical Coverage
- Live canonical examples: seating, table
- Template canonical examples: storage, bed, lighting, outdoor
- Template examples are under `catalog/furniture/_templates/canonical/` and should be promoted to live references once real assets are imported.

## Surface Materials On Real Tile Faces
Florim Ardoise Blanc and Gardenia Anima, Dorica, Oxide, Falaise, Make (all but its mosaics), Tabulae (its chevrons laid as a chevron), Bon Ton, Pietra Viva, La Geoteca (all but two Negresco sizes), Orosei, Gioia, I Pigmenti (all but its mosaics), La Marmoteca (all but its book-matched pairs), Hermione, Concrea Plain, Just Nature, Luce, Storm, Epoque 2.0, Camouflage, Block and Eterea, with Plein Air's outdoor (R11) sizes of them, and Plein Air's own ranges are drawn from the manufacturer's whole-tile pictures (`texture_assets.faces`). The Gardenia faces are stored at 0.6 px per mm; the originals are sharper, so sharper faces can be re-exported later. See `docs/architecture/surface-material-tile-faces.md`.

Since 15 Oct 2026 the Gardenia entries on faces are published as quote on request (ABK's contact form as the quote link); the 52 still on configurator previews stay drafts. See `docs/architecture/surface-material-tile-faces.md`.

## Laminate Wall Panels
Greenlam's laminates are also wall finishes (`wall_panel`): the 4'×8' patterned designs since 25 Oct 2026, and the solid colours and 4.25'×10' designs since 27 Oct. They are made from `catalog/laminates/greenlam/*.json`, the catalogue the cabinets use, by `lib/laminate-wall-panel-materials.ts`; there are no YAML files for them under `catalog/surface-materials/`. After changing the laminate JSON, run `npm run generate:cabinet-laminates`, then `npm run generate:laminate-flat-pictures` (the flat colours' one-colour pictures) and `npm run generate:surface-material-runtime`. See `docs/architecture/cabinet-laminates.md`.

## Outdoor Surface Materials
An outdoor floor (`physical_specs.suitable_for_outdoor: true`) lists where it goes in `classification.outdoor_uses` (terrace, balcony, patio, garden, path, pool_edge, driveway, steps, outdoor_shower) and its outdoor laying in `physical_specs.installation_method`; the generator refuses one without them (and a driveway that isn't glued) and adds the same colour's indoor floor entries. The manufacturer's words behind them are in `lib/surface-material-outdoor-knowledge.ts` and `lib/surface-material-plein-air-system.ts` (ABK's Plein Air catalogue: laying, pedestals, packing, special pieces). See `docs/architecture/surface-material-outdoor-tiles.md`.

## Manufacturer Technical Sheets
Gardenia entries take `physical_specs.slip_rating` (DIN 51130) and, when missing, `total_thickness_mm` from ABK's technical sheets (`lib/surface-material-abk-data/datasheets.json`), and note the sheet. `scripts/test-surface-material-physical-scale.ts` checks every Gardenia entry against `findAbkDatasheetMatch`, so an entry that contradicts its sheet fails. See `docs/architecture/surface-material-abk-documents.md`.

## Condo Map (admin)
`catalog/condo-map/` holds the developments for the admin condo map (`/admin/condo-map`), generated from the floor-plan masters; only the admin page and its data route read it. See `catalog/condo-map/README.md` and `docs/architecture/condo-map.md`.

## Recommended Folder Pattern
```text
/catalog
  /furniture
    /dining_tables
      /brighton_oval_180
        model.glb
        catalog.yaml
        thumbnail.jpg
```
