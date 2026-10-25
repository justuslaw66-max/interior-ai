# Cabinet laminates

Cabinet fronts, bodies and countertops are made from a supplier's laminate sheets, drawn at their real size. The catalogue is Greenlam's, 373 designs in all:
- **The 4'×8' HPL collection** (22 Oct 2026): 342 designs, on 1220×2440 mm sheets.
- **The 4.25'×10' HPL collection** (25 Oct 2026): the 31 designs the 4'×8' collection doesn't have, on 1300×3050 mm sheets. J chose to add only these. Its other 77 designs are already in the app from the 4'×8' collection, where they stay. Offering them on the longer sheet too is a follow-up.

**Real products only (J, 23 Oct 2026).** The pickers offer only real laminate designs, and every template starts from them. The app's first five finishes (white melamine, oak veneer, walnut veneer, matte black laminate, painted shaker white) were placeholders with invented codes. They are kept so older saved designs still open unchanged, where each is marked as a placeholder with a Change button; they are never swapped silently.

## Where the data lives

| What | Where |
| --- | --- |
| The catalogue (authoring source) | `catalog/laminates/greenlam/hpl-1220x2440.json` and `hpl-1300x3050.json`, one file per collection |
| The pictures the app loads | `public/assets/catalog/laminates/greenlam/<collection>/<category>-<code>-<name>.webp`, plus a `_swatch.webp` for pickers |
| The runtime catalogue (generated) | `lib/generated/cabinet-laminates.generated.ts`, from `scripts/generate-cabinet-laminate-runtime.ts` |
| Laminates as cabinet materials | `features/cabinetry/catalog/laminates.ts` (`CABINET_LAMINATES`, `findCabinetLaminate`) |
| How a picture lies on a part | `features/cabinetry/materialTexture.ts`, used by `features/cabinetry/createCabinetThreeGroup.ts` |
| Loading the pictures, shared by every cabinet on the page | `features/cabinetry/cabinetLaminateTextures.ts`, leased by `features/cabinetry/hooks/useCabinetSceneResourceOwnership.ts` |
| Which finishes are offered, search, and keeping a design's materials in step | `features/cabinetry/catalog/finishes.ts` |
| The picker | `features/cabinetry/components/CabinetFinishPicker.tsx` (Guided Main finish) and `CabinetFinishField.tsx` (each Detailed choice, and the part inspector) |
| Checks | `scripts/test-cabinet-laminates.ts` and `scripts/test-cabinet-finishes.ts`; the picture cache in `scripts/test-cabinetry-preview-renderer.ts` (all part of `test:cabinetry`) |

- The JSON and the WebP pictures are made from the manufacturer's files by `make_app_copies.py <masters> <repo> [collection]`, which is kept with the originals in `~/Developer/material-masters/greenlam/`. The collection defaults to `hpl-1220x2440`. The masters folder also keeps each collection's picture inventory (`tracking/<collection>-pictures.csv`) and contact sheets.
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
- Finish is per category. The 4'×8' files don't give each design's finish. The 4.25'×10' entries list theirs from Greenlam's tables (`finishes`: Suede, Satin, Essentia and so on), but they aren't drawn yet. Roughness runs from 0.36 (metals) to 0.62 (woodgrains).
- The sheet comes from the collection: 1220×2440 mm or 1300×3050 mm.

## Real size

- **One picture is one sheet's worth of pattern.** Greenlam's Revit files map each picture over a whole sheet. Its width is the sheet's width, 1220 mm or 1300 mm, and its height follows the picture's own shape, so the grain is never stretched. The usual 900×1800 px picture covers 1220×2440 or 1300×2600 mm. On a bigger part the picture repeats, with a joint like a real sheet's.
- Greenlam's Revit files map the 4'×8' woodgrains at 1220×3050 mm and the 4.25'×10' collection at 1300×3050. That would stretch a 1:2 picture by 25% and 17%, so the catalogue doesn't follow it.
- The scale is the files' own and has not yet been checked against a real sheet. Each design's size is one value in the JSON.
- **On a part:**
  - Each face gets texture coordinates in millimetres divided by that size (`computeCabinetPartTextureUv`).
  - Coordinates are measured from the cabinet's origin, so neighbouring fronts in one plane continue the pattern, as fronts cut from one sheet do.
  - The grain runs along the part's grain axis from the cut list (`resolveCabinetPartFabricationSpec`): vertical on doors and sides by default, or as the module's grain setting says.
  - A design whose grain runs across its sheet defaults to horizontal grain (`fabricationSemantics.ts`), since that is what it is chosen for. Its picture stays upright.
  - Choosing horizontal grain for an `along` design turns its picture a quarter turn.
- The eight built-in cabinet materials have no real size, so they keep one picture per face, as before.

## Loading the pictures

- **A picture is loaded once per page and shared** by every cabinet that uses it, in the Studio's preview and in the room alike (`cabinetLaminateTextures.ts`).
- **Each 3D view gets its own copy**, made from the image already loaded, so it has no download, decode or wait of its own. A WebGL renderer keeps a listener on every texture it has drawn until that texture is disposed. With one texture shared by every view, each closed Studio preview's renderer would stay in memory as long as the picture did. A closed view's copies are disposed like any other unused picture.
- **An edit doesn't flash.** Each edit rebuilds a cabinet's meshes and materials. A rebuilt cabinet leases its pictures in a layout effect, so a picture already loaded is on it before its first frame. When each rebuild loaded its own pictures, the doors showed plain colour for a frame after every edit.
- **Only a design's first appearance waits for its picture.** Until the picture arrives, the design shows its mean colour.
- **A picture no cabinet uses is kept** while the cache holds 8 or fewer (counting each view's copy), so going back to a design just browsed past is instant. Beyond that, the least recently used unused pictures are disposed, and a picture in use never is.
  - A picture that arrives after its entry was disposed is disposed too.
  - A picture that fails to load leaves the mean colour, and the next cabinet to ask tries again.
  - A page leaving for good (a `pagehide` that isn't kept for back and forward) disposes them all, as the GLB caches do.

## In a design

- **Choosing a laminate lists it in the design.** Every Studio edit passes through `syncCabinetFinishMaterials`: each laminate the design names (module bodies, fronts and edges; countertop, splash and face frame) is listed in `definition.materials`, and one it no longer names leaves. The built-in materials always stay listed: glass fronts, seat upholstery, service-zone markers and black handles still draw from them.
- **The catalogue is the source of truth for a laminate's picture and size.** Rendering and texture loading use `currentCabinetMaterials`, so a design saved before a correction (the real-life scale check is still to come) draws the current catalogue entry, not its saved copy.
- **Templates** name laminate ids in `presetData.ts`; each placeholder was replaced by the closest Greenlam design by name and colour: 101 White (white melamine), 107 Wool (painted shaker white), 5308 Rift Oak (oak veneer), 791 Milwakee Walnut (walnut veneer) and 9861 AFX Black X (matte black laminate).
- **Edge bands** are matching by default, ordered in the laminate's own design code. A contrasting edge band or lipping is chosen from the same picker; its first suggestion is 9861 black, or 101 white on black fronts.
- **Quotes** price laminates at the app's existing laminate placeholder rate; they are still not supplier prices.
- Glass and seat upholstery stay generic until there is a real catalogue for them; they are not offered as finishes.

## The picker

- Designs by kind (Woodgrains, Solid colours, Stone & abstract, Pearlescent, Metallic, Unicore), 24 at a time with "Show all", and a search: a word matches a code from its start, or the design's name, supplier or kind.
- The chosen design is always in view: it takes the first place when it would be further on.
- Tiles show the middle of the sheet (`_swatch.webp`) or the flat colour, the code and name, and a label for a horizontal grain or a pattern. The summary says how the design is drawn.

## Pictures that needed care (Greenlam 4'×8')

- 3396 Tango Wood is left out: its picture is a 600×650 panel on white, and 5396 Tango Wood has a full one.
- 5394 Nordic Acacia uses the full picture from Greenlam's 4.25'×10' collection; the 4'×8' one is a boxed panel.
- 5594 Olympia is both an abstract and a Unicore design, with two entries. The Revit file names the Unicore one 95594.
- 13 newer abstracts (505 and 5641 to 5675) have small pictures, about 0.26 px per mm. They are fine at room scale but soft up close.
- Match pictures to designs by file name, not by Greenlam's Revit materials: some of those point at another design's picture.

## Pictures that needed care (Greenlam 4.25'×10')

- **Left out, three designs:**
  - 115 Alabaster and 471 Arctic Grey are plain colours on Greenlam's pages (RAL 9001 and Pantone 13-4403 TPG). Their pictures in the Colours folder are a stone and a woodgrain, so even their mean colour would be wrong.
  - 9107 Lorraine Walnut's picture is 5004 Lorraine Walnut's, according to the Revit file, and the 4'×8' catalogue already has 5004. 9107 is in none of the collection's tables.
- **Athena Aegis is 5784.** Its picture is named 5774 (Antico's code); Greenlam's table and Revit file both give 5784.
- **5765 Albin Oak Black** has one 900×900 tile drawn twice, with a light line across the joint. The import uses the top tile without the line, covering 1300×1299 mm.
- **5867 Seronic Black** is book-matched: the picture mirrors at its middle. That is the design, not a joint.
- **Pictures with odd sizes:**
  - 5762 Tuscany Oak's picture is 1087×2355 px, so it covers 1300×2816 mm.
  - Four of the solids have small pictures, about 320×650 px. That doesn't matter, because solids are drawn flat in their mean colour.
