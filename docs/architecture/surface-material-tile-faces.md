# Surface materials on real tile faces

Some surface materials are drawn from the manufacturer's own pictures of whole tiles ("faces") instead of one repeating texture. Each face covers exactly one tile, so the pattern is drawn at its real size and neighbouring tiles differ, as on a real floor.

## Which materials

| Supplier | Collection | Entries | Faces | Source record |
| --- | --- | --- | --- | --- |
| Florim | Ardoise Blanc | 14 drafts | 34 | `catalog/surface-materials/flooring/florim/ardoise/florim-ardoise-blanc.manifest.json` |
| Gardenia (ABK Group) | Anima, six colours | 38 drafts (19 floor, 19 wall) | 182 | `catalog/surface-materials/flooring/gardenia/anima/gardenia-anima-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Dorica, four colours | 24 drafts (13 floor, 11 wall) | 100 | `catalog/surface-materials/flooring/gardenia/dorica/gardenia-dorica-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Oxide, five colours | 38 drafts (19 floor, 19 wall) | 136 | `catalog/surface-materials/flooring/gardenia/oxide/gardenia-oxide-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Falaise, six colours | 44 drafts (23 floor, 21 wall) | 305 | `catalog/surface-materials/flooring/gardenia/falaise/gardenia-falaise-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Make, six colours | 48 of its 60 drafts (24 floor, 24 wall); the 12 T36 mosaics keep their previews | 92 | `catalog/surface-materials/flooring/gardenia/make/gardenia-make-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Tabulae, four woods and four decors | 46 of its 54 drafts (24 floor, 22 wall); the 8 chevron entries keep their previews | 336 | `catalog/surface-materials/flooring/gardenia/tabulae/gardenia-tabulae-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Bon Ton, four marbles and three decors | 53 drafts (23 floor, 30 wall) | 284 | `catalog/surface-materials/flooring/gardenia/bon-ton/gardenia-bon-ton-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | Pietra Viva, seven colours | 86 drafts (43 floor, 43 wall) | 226 | `catalog/surface-materials/flooring/gardenia/pietra-viva/gardenia-pietra-viva-<colour>-faces.manifest.json` |
| Gardenia (ABK Group) | La Geoteca, ten colours and three Plissè decors | 88 of its 92 drafts (46 floor, 42 wall); Negresco 120x280 and 80x80 keep their previews | 286 | `catalog/surface-materials/flooring/gardenia/la-geoteca/gardenia-la-geoteca-<colour>-faces.manifest.json` |

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
- **Faces win over the decor-sheet path.** Gardenia products whose names mark them as decors (Gioia, `3d`, `art`, `degrade`, `network`, `sticks` and so on; `shouldUseContinuousPatternSourceForTest` in `useSurfaceMaterialTexture.ts`) were drawn by stretching one preview over each tile, without turning it. Since 9 Oct, a product with whole-tile faces goes to the tile painter instead, like every other product: each face is turned to the tile, drawn at its real size and varied from tile to tile. Before that, Dorica Degradé and Falaise Art Beige and Art Grey (on faces since #101 and #106) showed their first face squeezed into landscape tiles.
- `scripts/test-surface-material-physical-scale.ts` checks the rule and the Florim, Anima, Dorica, Oxide, Falaise, Make, Tabulae, Bon Ton, Pietra Viva and La Geoteca entries.

## Resolution: the stored faces are deliberately smaller than the originals

**Gardenia Anima faces are stored at 0.6 px per mm. The originals are 1.3 to 3.9 px per mm, so sharper faces can be made at any time from the same originals.**

| | Pixels per mm |
| --- | --- |
| Floors as drawn today (`DEFAULT_TARGET_PIXELS_PER_METER` = 260 in `useSurfaceMaterialTexture.ts`, canvas up to 2048 px) | 0.26 |
| Walls as drawn today (`WALL_SURFACE_TEXTURE_RESOLUTION` = 560 px per metre, canvas up to 4096 px) | 0.56 |
| Gardenia faces in this repository (decided 4 Oct 2026 for Anima, to keep the repository small; the same for every Gardenia collection) | 0.6 |
| Gardenia Anima originals (ABK download area JPGs) | 1.3 to 3.9 |
| Gardenia Dorica and Oxide originals | 0.83 to 3.4 |
| Gardenia Falaise and Make originals | 1.46 to 4.3 |
| Gardenia Tabulae and Bon Ton originals | 0.91 (Bon Ton 120x280) to 4.4 |
| Gardenia Pietra Viva and La Geoteca originals | 1.0 (two Ceppo di Gre 60x120 pictures) to 3.4 |
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

## Gardenia Dorica and Oxide specifics (downloaded 6 Oct 2026)

- These downloads hold one copy of each face (no lighter and darker pair). Every site picture was matched to its ZIP file by sha256. Pictures ABK lists twice with identical bytes are used once (five in Oxide).
- Each colour's sizes were checked against each other by image matching, at the scale their labels imply and at other scales. Where a size's pictures are not true to their label, the entry uses a larger size's faces, and the renderer cuts true-scale tile windows from them:
  - **Dorica 20x120** (0010518, 0010519): ABK's 32 plank pictures are the colour's 120x120 graphic at 0.75 scale (r 0.96 to 0.99), so drawn as 200x1200 mm they would be 1.33 times too large. The 120x120 faces are used, turned a quarter so the veins run along the plank, stored as `0010518_nn` and `0010519_nn`.
  - **Oxide Iron 80x80** (g69332): its four pictures are the 120x120 pictures (three byte-identical). The 120x120 faces (1200x1200 mm) are used.
  - **Oxide Aluminum and Brass 80x80** (g69330, g69334): their pictures are the colour's 120x120 graphic squeezed to 800 mm, and are declared as 1200x1200 mm faces. On 6 Oct, whole-picture matching found three of Aluminum's six. Re-checked on 8 Oct with the crop test used for Make (300 mm crops from nine places, drawn as if the picture covered 800 to 1400 mm, looked for in the colour's other sizes): all six Aluminum pictures match at 1200 mm (r 0.85 to 0.96), and all seven Brass pictures match best at 1200 mm (r 0.30 to 0.77, against 0.13 to 0.31 at 800 mm). Oxide Green and Steel 80x80 match only at 800 mm and stay as labelled.
- **Dorica 0010147 and 0010148** (60x120) are listed by the configurator as one visible variant with 0010588 and 0010589 (R11), whose pictures are 0010008's and 0010009's (15 of 16 and all 16). They use those faces.
- ABK's 120x280 pictures are 3.2% wider than 1200x2800 mm, as for Anima Grigio; the extra width is cut off. The crop test (8 Oct) confirms their scale: every picture matches the other sizes best at the labelled size (Dorica r 0.86 to 0.92, Oxide 0.55 to 0.83).
- The tracking files (ZIPs' hashes, every picture, faces, contact sheets) are in J's `~/Developer/material-masters/gardenia/<collection>/`.

## Gardenia Falaise and Make specifics (downloaded 8 Oct 2026)

- As for Dorica and Oxide: one copy of each face, every site picture matched to its ZIP file by sha256, and each colour's sizes checked against each other by image matching. Pictures ABK lists twice with identical bytes are used once (four in Make, none in Falaise).
- **Falaise:** 60x60, 60x120 and 80x80 are true-scale cuts of the colour's 120x120 graphic (r 0.99 to 1.00 at the labelled scale, nothing at 0.67 or 1.5). The White 120x280 graphic overlaps the other sizes only at the labelled scale (r 0.70 to 0.86).
  - The R11 items show byte-identical copies of the Natural item's pictures (for Beige and Mint on ABK's Plein Air pages), so they use the Natural item's faces: 0017583 and 0017586 use 0017200's and 0017526's, 0017716 and 0017717 use 0017199's and 0017196's, 0017767 and 0017768 use 0017755's and 0017756's.
  - The 120x280 pictures (White, 0017338) are 1773 x 4096 px, 1% wider than 1200 x 2800 mm; that is under the 3% tolerance, so nothing is cut.
  - Art Beige (0010804) and Art Grey (0017607) are wall-only entries with eight faces each. Each comes in one size only, so there is nothing to match against; they are taken as labelled.
- **Make:** 60x60 is a true-scale cut of 60x120 for every colour (r 0.97 to 0.99). Make is a plain concrete look, so matching between sizes is weaker than for veined collections. With the crop test below, 100x100 matches the colour's 60x60 and 60x120 pictures at the labelled scale for Antracite and Nero Corten (r 0.80 to 0.91), more weakly for Bianco and Grigio Corten (r 0.37 to 0.56), and at no other scale; Ash's and Corda's 100x100 pictures are too plain to match and are taken as labelled.
  - **Make 80x80** (g73020 to g73025): ABK's pictures show a 1000 x 1000 mm graphic squeezed to 800 mm. 300 mm crops from nine places in each picture, drawn as if the picture covered 700, 800, 900, 1000 or 1100 mm, were looked for in the colour's 60x60, 60x120 and 100x100 pictures. 20 of the 24 pictures match at 1000 mm (r 0.47 to 0.99; eight are whole 100x100 pictures) and none at 800 mm (r 0.14 to 0.22); the other four (two Bianco, two Corda) are too plain to match at any scale. Every Make 80x80 picture is declared as a 1000x1000 mm face; the renderer cuts true-scale 800x800 windows from them.
  - The T36 mosaics (g73250 to g73255) have no pictures in the download area and keep their configurator previews.

## Gardenia Tabulae and Bon Ton specifics (downloaded 9 Oct 2026)

- As for the collections before: one copy of each face, every site picture (890) matched to its ZIP file by sha256, and each colour's sizes checked against each other with the crop test.
- **Every size is true to its label where it can be checked.** Tabulae's 10x60 and 5x120 planks match the 20x120 and 30x120 pictures best at the labelled scale (r 0.66 to 1.00), and 20x120 sits in 30x120 the same way (r 0.83 to 0.99). The 23,4x148 planks are a graphic of their own, so they are taken as labelled. Bon Ton's 5x120, 60x120, 120x120 and 120x280 match each other best at the labelled scale (r 0.81 to 1.00).
- **Byte-identical pictures:** Tabulae's 20x120 R11 items show the Natural item's 30 pictures; Bon Ton's 120x280 Soft items show the Lux item's 3 (Biancone, Botticino, Perlino); Carrara's and Perlino's 120x120 Antique items show the Nat item's 9. Those entries use the other item's faces. The 60x120 Antique and Nat items share only some pictures and keep their own.
- **Tabulae's chevrons** (15x85, `par-dx-sx`) keep their previews: ABK's pictures are single parallelogram pieces with slanted ends, and the renderer lays rectangular tiles in a straight grid. They need a chevron layout first.
- **Decors** come in one size each, so there is nothing to match them against; each picture is the whole tile. Bon Ton Network, Octagon and Tricot have a single face each. Tabulae Sticks' 6 pictures are 4% narrower than 600x1200 mm and are drawn at the tile's width.
- **Planks:** the 30x120 R11 planks (0021253, 0021254) are on ABK's Plein Air pages, not Tabulae's. Bon Ton's 120x280 pictures are 1% wider than 1200x2800 mm (under the 3% tolerance, not cut).
- The catalogue names Carrara 0020758 "120x280 Soft"; ABK's page lists 0020758 as Lux (and 0020766, not in the catalogue, as Soft). The entry uses 0020758's own pictures.

## Gardenia Pietra Viva and La Geoteca specifics (downloaded 9 Oct 2026)

- As for the collections before: one copy of each face, every site picture (858) matched to its ZIP file by sha256, and each colour's sizes checked against each other with the crop test. Pictures ABK lists twice with identical bytes are used once.
- **Byte-identical pictures:** every Pietra Viva Antique 3D item shows the Nat P.tech item's pictures, and the R11 items on ABK's Plein Air pages show the Nat P.tech item's wherever both have pictures (all but Travertino Ivory Cross 80x80, whose six R11 pictures are re-encoded copies, r 0.99, and are used as they are). Those entries use the Nat P.tech faces.
- **Sizes:** most sizes are true to their label: the 60x120, 120x120 and 120x280 pictures match each other best at the labelled scale (Pietra Viva r 0.83 to 1.00, La Geoteca 0.62 to 1.00), Camargue's and Limoges Sand's 80x80 and 80x160 match each other (r 0.48 to 0.99), and Limoges White's 80x160 matches its 120x120 best at the labelled scale (r 0.41 to 0.47). The exceptions:
  - **Aude 80x80** (0012262, 0012264, 0012265): the colour's 120x120 graphic squeezed to 800 mm (r 1.00 drawn as 1200 mm, 0.10 to 0.12 as 800 mm). Declared as 1200x1200 mm faces.
  - **Ceppo di Gre 80x80 R11** (0013072): the same, matching the 120x120 and 60x120 pictures only as 1200 mm (r 0.51 to 1.00). Declared as 1200x1200 mm faces.
  - **Limoges White 120x120** (0012922): three of its six pictures (2344 px) cover 1390 mm (r 0.88 to 1.00; 0.84 to 0.86 at 1370 or 1410 mm). Declared as 1390x1390 mm faces. Its 80x80 item (0012332) shows three of these pictures byte for byte and uses the 120x120 faces.
  - **Limoges White 120x280** (0012329): one of the two pictures is 1389 mm wide at true scale (r 0.99 drawn 2800 mm tall, 0.28 squeezed to 1200 mm wide); 189 mm of width is cut off. The other is its own graphic, taken as labelled.
  - **Negresco 60x120** (0011740): the pictures are 630 x 1200 mm at true scale (r 1.00, against 0.46 to 0.76 as 600 mm wide); 30 mm of width is cut off.
  - The 80x160 pictures are 3.3% and Ceppo di Gre's 120x280 3.2% wider than the tile (r 0.90 to 0.92 at that width); the extra width is cut off.
- **Stand-ins** (J, 9 Oct: "use them if they check out"), each named in its entry's note:
  - No pictures of their own, so the same colour and size in the other finish: Aude Beige 120x120 (0012260, from 0012911), Aude Beige and Grey 80x80 R11 (0012267, 0012266, from the Nat P.tech 80x80), Brennero and Serena 60x120 (0011738, 0011735, from the R11 60x120 on Plein Air).
  - Aude Grey 60x120 Nat P.tech (0012912): ABK's page shows the four 120x120 pictures; the Antique 3D 60x120 pictures (0011118) are used.
  - The configurator's codes that ABK lists under another code: Limestone 120x120 and 60x120 (0011775, 0011776 as 0010537, 0010539) and Travertino Ivory Cross and Vein 120x120 and 60x120 (0016136, 0016138, 0016137, 0016139 as 0017438, 0017439, 0012723, 0012726). The catalogue files Travertino under La Geoteca; ABK lists it under Dorica.
- **Negresco 120x280 and 80x80** (0011723, 0012155) have no pictures anywhere on ABK's site and keep their previews.
- **Ceppo di Gre 120x280** (0008674): six of ABK's 12 pictures on this page are named FUTURA CENERE, another product, and are left out.
- **Aude 120x280:** ABK's Aude Beige page lists 0014863 and its Aude Ivory page 0014862, but the pictures' own names (and the catalogue) pair 0014862 with Beige and 0014863 with Ivory. Each entry uses its own code's pictures.
