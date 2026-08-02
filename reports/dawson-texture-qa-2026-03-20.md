# Dawson Texture QA - 2026-03-20

This report summarizes the first tuned generation pass from source images in `incoming/dawson-reference/originals/`.

## Generation Inputs

- Script: `scripts/generate-dawson-textures.mjs`
- Source set: 11 Dawson references
- Output types generated:
  - 11 swatches
  - 11 close-up previews
  - 11 base color maps
  - 5 family normal maps
  - 5 family roughness maps

## Current Family Tuning

- `linen-slub-weave`
  - cropBandRatio: 0.44
  - saturation: 1.03
  - normalStrength: 1.55
  - roughness: base 205, slope 0.24, min 160, max 238
- `twill`
  - cropBandRatio: 0.42
  - saturation: 1.08
  - normalStrength: 1.9
  - roughness: base 196, slope 0.26, min 145, max 232
- `textured-plain-weave`
  - cropBandRatio: 0.43
  - saturation: 1.04
  - normalStrength: 2.0
  - roughness: base 210, slope 0.28, min 165, max 242
- `performance-fleece`
  - cropBandRatio: 0.4
  - saturation: 1.03
  - normalStrength: 1.15
  - roughness: base 214, slope 0.2, min 178, max 244
- `infinity-boucle`
  - cropBandRatio: 0.42
  - saturation: 1.06
  - normalStrength: 2.4
  - roughness: base 216, slope 0.33, min 172, max 248

## QA Metrics (Shared Family Maps)

- `linen-slub-weave`
  - normal std: 23.44
  - roughness mean: 211.38
  - roughness std: 3.52
- `twill`
  - normal std: 43.15
  - roughness mean: 180.08
  - roughness std: 13.75
- `textured-plain-weave`
  - normal std: 42.12
  - roughness mean: 223.82
  - roughness std: 10.38
- `performance-fleece`
  - normal std: 28.55
  - roughness mean: 206.59
  - roughness std: 6.96
- `infinity-boucle`
  - normal std: 35.58
  - roughness mean: 210.87
  - roughness std: 13.78

## Visual QA Notes

- Twill: strong and clear directional weave, good definition.
- Performance fleece: soft relief and matte roughness, reads plausibly.
- Linen slub weave: a bit subtle and flat compared with expected slub irregularity.
- Textured plain weave: relief is present but can be slightly stronger.
- Infinity boucle: strong macro shape and depth; may be slightly aggressive in some lighting.

## Recommended Next Tuning Order

1. Increase slub variation for `linen-slub-weave`.
2. Increase relief slightly for `textured-plain-weave`.
3. Reduce amplitude slightly for `infinity-boucle` if highlights look too noisy in scene.

## How To Regenerate

Run:

`node scripts/generate-dawson-textures.mjs`
