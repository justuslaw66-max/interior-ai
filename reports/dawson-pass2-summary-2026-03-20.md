# Dawson Pass 2 Summary (2026-03-20)

## Scope Completed

- Second tuning pass applied to family-specific generation controls.
- Full texture regeneration completed.
- Before/after comparison images generated for all family normal and roughness maps.
- In-app screenshots captured for import panel, Indigo, and Cumin states.

## Tuning Intent

- Increase slub variation for linen slub weave.
- Increase relief for textured plain weave.
- Reduce over-aggressive relief for infinity boucle.

## Metric Deltas (Pass 1 -> Pass 2)

- linen-slub-weave
  - normal std: 23.44 -> 28.26
  - roughness mean: 211.38 -> 213.96
  - roughness std: 3.52 -> 4.40
- twill
  - normal std: 43.15 -> 43.15
  - roughness mean: 180.08 -> 180.08
  - roughness std: 13.75 -> 13.75
- textured-plain-weave
  - normal std: 42.12 -> 45.20
  - roughness mean: 223.82 -> 227.24
  - roughness std: 10.38 -> 11.14
- performance-fleece
  - normal std: 28.55 -> 28.55
  - roughness mean: 206.59 -> 206.59
  - roughness std: 6.96 -> 6.96
- infinity-boucle
  - normal std: 35.58 -> 31.83
  - roughness mean: 210.87 -> 208.97
  - roughness std: 13.78 -> 10.85

## Comparison Artifacts

- Family map comparisons (left=pass1, right=pass2): [reports/dawson-comparison](reports/dawson-comparison)
- In-app QA screenshots:
  - [reports/dawson-comparison/design-inapp-overview.jpg](reports/dawson-comparison/design-inapp-overview.jpg)
  - [reports/dawson-comparison/design-inapp-import-panel.jpg](reports/dawson-comparison/design-inapp-import-panel.jpg)
  - [reports/dawson-comparison/design-inapp-indigo.jpg](reports/dawson-comparison/design-inapp-indigo.jpg)
  - [reports/dawson-comparison/design-inapp-cumin.jpg](reports/dawson-comparison/design-inapp-cumin.jpg)

## Generated Asset Targets

- Swatches: [public/swatches/dawson](public/swatches/dawson)
- Closeups: [public/materials/dawson](public/materials/dawson)
- Base color maps: [public/pbr/dawson](public/pbr/dawson)
- Shared family maps: [public/pbr/fabrics](public/pbr/fabrics)

## Notes

- This pass is generated from product-page reference images, so maps are approximate rather than scan-grade PBR.
- Further realism improvements should focus on seam removal and periodic tiling refinement per family.
