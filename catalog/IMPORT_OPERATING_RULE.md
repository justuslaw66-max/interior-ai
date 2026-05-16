# Import Operating Rule (Current Wave)

For this import wave, keep the process strict and predictable:

1. Import only categories that already have a preset in `lib/catalog-presets/index.ts`.
2. Every product must match a canonical structure reference.
3. Any ambiguous item stays `draft` and is not published.
4. Variant-label hardening is mandatory: normalize variant codes and disambiguate duplicate shopper-facing labels with stable family qualifiers.

## Design Pairings Rule (Tiered)

- Anchor categories (for example `sofa`, `dining_table`, `bed`, `desk`) use strict token-match validation.
- Rule: `design_pairings` must match at least 2 expected category tokens; missing all expected tokens is a hard failure.
- Secondary categories (for example `dining_chair`, `side_table`, `nightstand`, `ottoman`, `rug`) use warning-level token-match validation.
- Rule: at least 1 expected token match is recommended; misses raise warnings.
- Flexible decor categories (for example `pendant_light`) remain advisory.
- Rule: pairings are optional; low-signal pairings are advisory warnings.

## Canonical Family Coverage

Current live canonical YAML references:
- Seating: `catalog/furniture/sofas/jaron_3s/catalog.yaml`
- Table: `catalog/furniture/dining_tables/kelsey_marble_160/catalog.yaml`

Canonical structure references for next family expansions (template-grade, not live assets yet):
- Storage: `catalog/furniture/_templates/canonical/storage_nightstand.example.yaml`
- Bed: `catalog/furniture/_templates/canonical/bed_queen.example.yaml`
- Lighting: `catalog/furniture/_templates/canonical/lighting_pendant.example.yaml`
- Outdoor (optional next wave): `catalog/furniture/_templates/canonical/outdoor_sofa.example.yaml`

When those families enter active import, promote one real item per family into the live reference set in `catalog/README.md`.