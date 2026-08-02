# Dawson Texture Asset Checklist

Status: all Dawson upholstery preview and texture assets referenced by the catalog are currently missing from `public`.

Checked on: 2026-03-19

## Summary

- Missing swatch images: 11
- Missing close-up material images: 11
- Missing per-option base color maps: 11
- Missing shared fabric normal maps: 5
- Missing shared fabric roughness maps: 5
- Total missing files: 43

## Missing Per-Upholstery Assets

### navagio_seagull

- `public/swatches/dawson/navagio-seagull.jpg`
- `public/materials/dawson/navagio-seagull-closeup.jpg`
- `public/pbr/dawson/navagio-seagull/basecolor.jpg`

### performance_creamy_white

- `public/swatches/dawson/performance-creamy-white.jpg`
- `public/materials/dawson/performance-creamy-white-closeup.jpg`
- `public/pbr/dawson/performance-creamy-white/basecolor.jpg`

### indigo_blue

- `public/swatches/dawson/indigo-blue.jpg`
- `public/materials/dawson/indigo-blue-closeup.jpg`
- `public/pbr/dawson/indigo-blue/basecolor.jpg`

### marcel_brilliant_white

- `public/swatches/dawson/marcel-brilliant-white.jpg`
- `public/materials/dawson/marcel-brilliant-white-closeup.jpg`
- `public/pbr/dawson/marcel-brilliant-white/basecolor.jpg`

### peyton_ivory

- `public/swatches/dawson/peyton-ivory.jpg`
- `public/materials/dawson/peyton-ivory-closeup.jpg`
- `public/pbr/dawson/peyton-ivory/basecolor.jpg`

### peyton_dove_grey

- `public/swatches/dawson/peyton-dove-grey.jpg`
- `public/materials/dawson/peyton-dove-grey-closeup.jpg`
- `public/pbr/dawson/peyton-dove-grey/basecolor.jpg`

### marcel_smoke_grey

- `public/swatches/dawson/marcel-smoke-grey.jpg`
- `public/materials/dawson/marcel-smoke-grey-closeup.jpg`
- `public/pbr/dawson/marcel-smoke-grey/basecolor.jpg`

### peyton_moss

- `public/swatches/dawson/peyton-moss.jpg`
- `public/materials/dawson/peyton-moss-closeup.jpg`
- `public/pbr/dawson/peyton-moss/basecolor.jpg`

### peyton_cumin

- `public/swatches/dawson/peyton-cumin.jpg`
- `public/materials/dawson/peyton-cumin-closeup.jpg`
- `public/pbr/dawson/peyton-cumin/basecolor.jpg`

### infinity_boucle_ginger

- `public/swatches/dawson/infinity-boucle-ginger.jpg`
- `public/materials/dawson/infinity-boucle-ginger-closeup.jpg`
- `public/pbr/dawson/infinity-boucle-ginger/basecolor.jpg`

### infinity_boucle_white_quartz

- `public/swatches/dawson/infinity-boucle-white-quartz.jpg`
- `public/materials/dawson/infinity-boucle-white-quartz-closeup.jpg`
- `public/pbr/dawson/infinity-boucle-white-quartz/basecolor.jpg`

## Missing Shared Fabric Assets

### linen-slub-weave

- `public/pbr/fabrics/linen-slub-weave/normal.jpg`
- `public/pbr/fabrics/linen-slub-weave/roughness.jpg`

### twill

- `public/pbr/fabrics/twill/normal.jpg`
- `public/pbr/fabrics/twill/roughness.jpg`

### textured-plain-weave

- `public/pbr/fabrics/textured-plain-weave/normal.jpg`
- `public/pbr/fabrics/textured-plain-weave/roughness.jpg`

### performance-fleece

- `public/pbr/fabrics/performance-fleece/normal.jpg`
- `public/pbr/fabrics/performance-fleece/roughness.jpg`

### infinity-boucle

- `public/pbr/fabrics/infinity-boucle/normal.jpg`
- `public/pbr/fabrics/infinity-boucle/roughness.jpg`

## How To Build These From Reference Images

Use the reference images in three output layers per upholstery option:

1. Swatch image
   - Tight crop of the fabric sample
   - Consistent framing across all 11 options
   - Recommended size: 512x512 or 1024x1024 JPG

2. Close-up material image
   - Higher-detail crop for inspector previews
   - Keep real weave direction and texture character visible
   - Recommended size: 1024x1024 or 2048x2048 JPG

3. Base color map
   - Seamless tile if possible
   - No specular lighting baked in
   - Preserve color variation and weave pattern but remove shadows and folds
   - Recommended size: 1024x1024 or 2048x2048 JPG

Shared fabric maps should be authored once per fabric family:

1. Normal map
   - Encodes surface relief for the weave or boucle texture
   - Reused by all colorways in that family

2. Roughness map
   - Encodes sheen and matte variation for the family
   - Reused by all colorways in that family

## Intake Notes Per Fabric Family

### linen-slub-weave

- Family character: visible slub, irregular yarn texture
- Used by: `navagio_seagull`

### twill

- Family character: diagonal woven grain, tighter structure
- Used by: `performance_creamy_white`, `indigo_blue`

### textured-plain-weave

- Family character: coarse woven texture, more tactile than twill
- Used by: `marcel_brilliant_white`, `marcel_smoke_grey`

### performance-fleece

- Family character: soft nap, velvet-like fleece surface
- Used by: `peyton_ivory`, `peyton_dove_grey`, `peyton_moss`, `peyton_cumin`

### infinity-boucle

- Family character: chunky boucle loops, large texture scale
- Used by: `infinity_boucle_ginger`, `infinity_boucle_white_quartz`

## Current Limitation

The code path is already wired to consume these files, but the renderer currently falls back to tint-based materials because the files above are absent.