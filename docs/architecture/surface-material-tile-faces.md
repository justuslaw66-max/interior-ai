# Surface materials on real tile faces

Some surface materials are drawn from the manufacturer's own pictures of whole tiles ("faces") instead of one repeating texture. Each face covers exactly one tile, so the pattern is drawn at its real size and neighbouring tiles differ, as on a real floor.

## Which materials

| Supplier | Collection | Entries | Faces | Source record |
| --- | --- | --- | --- | --- |
| Florim | Ardoise Blanc | 14 drafts | 34 | `catalog/surface-materials/flooring/florim/ardoise/florim-ardoise-blanc.manifest.json` |
| Gardenia (ABK Group) | Anima, six colours | 38 drafts (19 floor, 19 wall) | 182 | `catalog/surface-materials/flooring/gardenia/anima/gardenia-anima-<colour>-faces.manifest.json` |

Every other material still uses one picture repeated over the surface.

## How a material declares faces

In `texture_assets` of its `catalog.yaml`:

```yaml
  image_physical_size_mm:
    width: 600
    height: 1200
  faces:
    - url: /assets/catalog/surface-materials/gardenia/anima/0006051_01.webp
      width_mm: 600
      height_mm: 1200
```

- `width_mm` and `height_mm` say how much of the tile the picture covers, with the long side upright. A landscape tile turns the picture a quarter turn.
- **In the render data** (`lib/generated/surface-material-render.generated.ts`, loaded with every design page), faces named `<prefix>01.webp`, `<prefix>02.webp`, … with one size are written as a run: `[prefix, count, width_mm, height_mm]`. The app expands it back into the same face list (`lib/surface-texture-face-run.ts`), so pictures, order and sizes are unchanged. A face list that doesn't follow the pattern is written in full. Name new faces `<item>_<nn>.webp`, numbered from 01, to keep them compact.
- `tileable` is `false`.
- The sampling rule is in `lib/surface-material-physical-sampling.ts`; the drawing is in `components/editor/renderers/surfaceTilePainter.ts`.
- `scripts/test-surface-material-physical-scale.ts` checks the rule and the Florim and Anima entries.

## Resolution: the stored faces are deliberately smaller than the originals

**Gardenia Anima faces are stored at 0.6 px per mm. The originals are 1.3 to 3.9 px per mm, so sharper faces can be made at any time from the same originals.**

| | Pixels per mm |
| --- | --- |
| Floors as drawn today (`DEFAULT_TARGET_PIXELS_PER_METER` = 260 in `useSurfaceMaterialTexture.ts`, canvas up to 2048 px) | 0.26 |
| Walls as drawn today (`WALL_SURFACE_TEXTURE_RESOLUTION` = 560 px per metre, canvas up to 4096 px) | 0.56 |
| Gardenia Anima faces in this repository (decided 4 Oct 2026, to keep the repository small) | 0.6 |
| Gardenia Anima originals (ABK download area JPGs) | 1.3 to 3.9 |
| Florim Ardoise Blanc faces in this repository | as supplied, 0.58 to 1.18 |

At today's renderer settings, 0.6 px per mm loses nothing visible. If the renderer starts drawing more pixels per metre (larger canvases, close-ups, or drawing each tile from its face on the GPU), make the faces sharper:

1. Get the originals.
   - Each Anima colour's `*-faces.manifest.json` names the source ZIP with its sha256 and lists, for every face, the original file, its pixel size, its px per mm and its sha256.
   - The project owner keeps the ZIPs and tracking files outside the repository (`~/Developer/material-masters/gardenia/anima/` on his Mac).
   - The same ZIPs can be downloaded again from the ABK Group download area (Gardenia&Ariana, Single Item Picture, Anima) with a signed-in account.
2. Re-export each face from its original at the new px per mm, keeping the file name, the upright orientation and any crop noted in the manifest.
3. Update `stored_px_per_mm` and the byte counts in the manifests.

No catalogue change is needed: the YAML gives sizes in millimetres, not pixels.

Size guide for Anima (all 182 faces): about 11 MB at 0.6 px per mm, about 32 MB at 1 px per mm.

## Gardenia Anima specifics

- ABK supplies every face twice: a lighter JPG with an sRGB profile and a darker JPG without one. They are the same picture exported two ways (lighter ≈ 0.93 x darker + 14.5 in level). The lighter sRGB copy is used for every face.
- All sizes of a colour are cuts of one graphic at one scale (image matching between sizes, r 0.96 to 1.00), so the pictures are true to size. The Grigio 120x280 is its own graphic.
- Grigio 120x280: ABK's pictures are 3.2% wider than 1200 x 2800 mm. The extra width (19 mm per side) is cut off, keeping the length at true scale.
- The wall-only item codes 0007195 (Fango 60x120) and 0007196 (Grigio 60x120) have no pictures of their own. They are the same tiles as 0006049 and 0006050 and use those faces.
