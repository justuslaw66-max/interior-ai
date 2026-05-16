# Catalog Import Gold Standard Checklist

Use this checklist for every new catalog import before it is treated as publish-ready.

## Core Decision
- Confirm the separate product vs variant split is correct.
- Confirm the category is correct and not a near-duplicate of an existing category.
- Confirm the product belongs in the right family folder and naming pattern.

## Product-Level Completeness
- `brand`, `category`, `product_family`, and `product_name` are present.
- `design_zone` and `anchor_role` are present and use frozen vocabulary values.
- `room_compatibility` is present and non-empty.
- `dimensions` are complete and units are consistent.
- `material_family`, `shape`, `style_cluster`, `tone`, and `price_band` use approved values.
- `compatibility` and `bundle_metadata` are added when the product has matching companions or bundle logic.
- `assets.asset_id`, `assets.model_url`, and `assets.thumbnail_url` are present.

## Variant-Level Completeness
- Every variant has a `variant` label.
- Every variant has complete pricing and dimensions.
- `finish_code` and `finish_label` are both present when finish differentiation exists.
- `upholstery_code` and `upholstery_label` are both present when upholstery differentiation exists.
- Variant codes are normalized consistently (hyphen/underscore differences do not change identity matching).
- Duplicate shopper-facing color labels are disambiguated with a stable family qualifier (for example `Moss (Peyton Fleece)`).
- `swatch_group` is present when multi-swatch selection exists.
- Structured `materials` data is present where available.
- Structured `finish` data is present where available.

## Relationship And Bundle Logic
- Related products use approved relationship values.
- Bundle roles are explicit where the product participates in a set.
- Dining anchors and dining seating products cross-reference each other when relevant.

## Publish Readiness
- Publish readiness passes preset validation.
- Preview media exists and is usable in authoring and QA.
- No duplicate asset ids or duplicate product records are introduced.
- No invalid enum values or legacy categories are introduced.

## Required Commands
- `npm run test:catalog-audit`
- `npm run test:hardening`
- `npx tsc --noEmit`

## Import Operating Rule (Current Wave)
- Import only categories that already have a preset.
- Every product must match a canonical structure reference.
- Anything ambiguous stays draft and does not move to published.
- See `catalog/IMPORT_OPERATING_RULE.md` for the full rule and family coverage map.

## Current Reference Examples
- Dining table: `catalog/furniture/dining_tables/kelsey_marble_160/catalog.yaml`
- Dining bench: `catalog/furniture/dining_benches/sloane_bench_150_no_cushion/catalog.yaml`
- Sofa: `catalog/furniture/sofas/jaron_3s/catalog.yaml`
- Sofa with broader finish matrix: `catalog/furniture/sofas/madison_2s/catalog.yaml`
- Ottoman: `catalog/furniture/sofas/madison_ottoman/catalog.yaml`

## Notes For The Next Import Wave
- Prefer frozen vocab values over inventing new variants of the same meaning.
- If a new value is genuinely needed, add it to `controlled_vocabularies.yaml` first, then import the item.
- Treat `accessory` as legacy taxonomy; prefer a concrete category such as `ottoman` or `bench` for new imports.