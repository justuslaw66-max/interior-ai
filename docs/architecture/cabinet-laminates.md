# Cabinet laminates

Cabinet fronts, bodies and countertops can be made from a supplier's laminate sheets, drawn at their real size. The first catalogue is Greenlam's 4'×8' HPL collection (22 Oct 2026): 342 designs.

## Where the data lives

| What | Where |
| --- | --- |
| The catalogue (authoring source) | `catalog/laminates/greenlam/hpl-1220x2440.json` |
| The pictures the app loads | `public/assets/catalog/laminates/greenlam/hpl-1220x2440/<category>-<code>-<name>.webp`, plus a `_swatch.webp` for pickers |
| The runtime catalogue (generated) | `lib/generated/cabinet-laminates.generated.ts`, from `scripts/generate-cabinet-laminate-runtime.ts` |
| Laminates as cabinet materials | `features/cabinetry/catalog/laminates.ts` (`CABINET_LAMINATES`, `findCabinetLaminate`) |
| How a picture lies on a part | `features/cabinetry/materialTexture.ts`, used by `features/cabinetry/createCabinetThreeGroup.ts` |
| Checks | `scripts/test-cabinet-laminates.ts` (`npm run test:cabinet-laminates`, part of `test:cabinetry`) |

- The JSON and the WebP pictures are made from the manufacturer's files by `make_app_copies.py`, which is kept with the originals in `~/Developer/material-masters/greenlam/`. The masters folder also keeps the inventory of every picture (`tracking/hpl-1220x2440-pictures.csv`) and its contact sheets.
- After changing the JSON, run `npm run generate:cabinet-laminates`. `npm run check:cabinet-laminates` and the test fail when the generated file is out of date.
- **Picture rights:** Greenlam's permission was given (J, 22 Oct 2026). Its details are to be recorded in the masters README.

## What an entry holds

- Supplier code, name and category: abstracts, metals, pearlescents, solids, Unicore or woodgrains.
- The mean colour of its picture.
- The sheet picture and the real area it covers. Solid colours are drawn as a flat colour, the picture's mean: their scans carry uneven lighting (up to 21 grey levels across a sheet), which would show as a fake gradient.
- Its grain:
  - `along` the sheet, for most woodgrains;
  - `across` it, for the ten "horizonte" woods (5517 to 5520, 5523, 5524, 5527 to 5530);
  - `pattern`, for the herringbone 5379 Manor;
  - `none`, for everything else.
- Finish is per category, since the 4'×8' files don't give each design's finish. Roughness runs from 0.36 (metals) to 0.62 (woodgrains).

## Real size

- **One picture is one sheet's worth of pattern.** Greenlam's Revit files map each picture over a whole sheet. Its width is the sheet's 1220 mm, and its height follows the picture's own shape (2440 mm for the usual 900×1800 px picture), so the grain is never stretched. On a bigger part the picture repeats, with a joint like a real sheet's.
- Greenlam's Revit files map the 4'×8' woodgrains at 1220×3050 mm and the 4.25'×10' collection at 1300×3050. That would stretch a 1:2 picture by 25% and 17%, so the catalogue doesn't follow it.
- The scale is the files' own and has not yet been checked against a real sheet. Each design's size is one value in the JSON.
- **On a part:**
  - Each face gets texture coordinates in millimetres divided by that size (`computeCabinetPartTextureUv`).
  - Coordinates are measured from the cabinet's origin, so neighbouring fronts in one plane continue the pattern, as fronts cut from one sheet do.
  - The grain runs along the part's grain axis from the cut list (`resolveCabinetPartFabricationSpec`): vertical on doors and sides by default, or as the module's grain setting says.
  - A design whose grain runs across its sheet defaults to horizontal grain (`fabricationSemantics.ts`), since that is what it is chosen for. Its picture stays upright.
  - Choosing horizontal grain for an `along` design turns its picture a quarter turn.
- The eight built-in cabinet materials have no real size, so they keep one picture per face, as before.

## Pictures that needed care (Greenlam 4'×8')

- 3396 Tango Wood is left out: its picture is a 600×650 panel on white, and 5396 Tango Wood has a full one.
- 5394 Nordic Acacia uses the full picture from Greenlam's 4.25'×10' collection; the 4'×8' one is a boxed panel.
- 5594 Olympia is both an abstract and a Unicore design, with two entries. The Revit file names the Unicore one 95594.
- 13 newer abstracts (505 and 5641 to 5675) have small pictures, about 0.26 px per mm. They are fine at room scale but soft up close.
- Match pictures to designs by file name, not by Greenlam's Revit materials: some of those point at another design's picture.
