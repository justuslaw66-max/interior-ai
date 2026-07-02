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
