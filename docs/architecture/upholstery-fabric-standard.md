# Upholstery fabric standard

How a fabric's colour and weave get onto a sofa or armchair model. Set on the
Dawson family (November 2026) as the baseline for every upholstered product,
whatever generated the GLB. The shape of the model and the look of the fabric
are separate: one model per shape, one library entry per fabric.

## Rules

1. **Colour comes from the fabric's own swatch photo.** Each option in an
   upholstery library carries `swatch_hex`, the linear-light average of the
   centre of the retailer's swatch photo for that fabric. Never leave it to
   `mapColorFromText`: that keyword fallback gives every "cream" or "moss" the
   same colour.
2. **The weave comes from a photo tile of that fabric,** at
   `public/pbr/<family>/<fabric>/basecolor.jpg`, made with
   `make_fabric_tile.py` (kept in `interior-ai-task-state/model-gen/fabric/`):
   lighting flattened, made seamless with a variance-preserving cross-fade,
   mean colour scaled to `swatch_hex`. The photo supplies only the weave; the
   catalogue supplies the colour.
3. **Size is physical.** `render_assets.tile_scale.size_m` says how many metres of
   cloth one tile covers (0.08 for flat weaves, 0.10 for boucle). The renderer
   measures the model's metres per UV unit at its final scale
   (`components/scene/glb-scaled-model/upholsteryTileScale.ts`, called from
   `glbModelResourceResolution.ts` after the model is normalised) and sets the
   repeat. Do not tune `tile_scale` by eye: an AI-generated sofa packs several
   metres of surface into one UV unit, and the right repeat differs per model.
4. **Relief suits the real size.** With threads at real size, flat weaves take
   `importedNormalScale` 0.25-0.35 and boucle about 0.9. Values near 0.01 were
   compensating for a weave drawn twenty times too large.
5. **A family's weave normal map must exist.** If the library points at
   `/pbr/fabrics/<family>/normal.jpg` and the file is missing, derive it from
   the processed tile of one fabric in the family.
6. **Leather is colour and sheen,** not a photo tile, until a leather grain map
   exists; its calibration is shared across retailers' leather sofas. A leather
   option takes `swatch_hex` only: no `tile_scale.size_m`, because giving a
   size makes the app fetch a colour photo that leather does not have.

## Adding a fabric or a family

1. Get the swatch photo (the retailer's close-up of the cloth, not a product
   detail shot). Sample `swatch_hex`.
2. Make the tile; look at a 2x2 repeat of it. No plaid grid, no seam, no
   lighting gradient.
3. Add `swatch_hex`, `base_color_map`, `normal_map` and `tile_scale.size_m` to the
   library option. The family's row in its appearance table (Dawson:
   `components/scene/furniture/dawsonFabricAppearance.ts`) needs `disableBaseColorMap: false`, `variantMapTintStrength: 0`,
   `brightness: 1`, `saturation: 1` and its relief.
4. Look at it on the model in the app next to the swatch, at room distance and
   close up, on at least one fabric per family and on every fabric whose tile
   has a strong directional pattern (twill, slub).

## What this does not fix

Flat scene lighting and missing seams or piping on generated models limit how
real a sofa looks more than the fabric does. Both are separate work.
