# Cabinet laminates

Cabinet fronts, bodies and countertops are made from a supplier's laminate sheets, drawn at their real size. The catalogue is Greenlam's, 375 designs in all:
- **The 4'×8' HPL collection** (22 Oct 2026): 342 designs, on 1220×2440 mm sheets.
- **The 4.25'×10' HPL collection** (25 Oct 2026): the 33 designs the 4'×8' collection doesn't have, on 1300×3050 mm sheets (31 until 28 Oct, when Alabaster and Arctic Grey joined). J chose to add only these. Its other 77 designs are already in the app from the 4'×8' collection, where they stay. Offering them on the longer sheet too is a follow-up.

**Real products only (J, 23 Oct 2026).** The pickers offer only real laminate designs, and every template starts from them. The app's first five finishes (white melamine, oak veneer, walnut veneer, matte black laminate, painted shaker white) were placeholders with invented codes. They are kept so older saved designs still open unchanged, where each is marked as a placeholder with a Change button; they are never swapped silently.

## Where the data lives

| What | Where |
| --- | --- |
| The catalogue (authoring source) | `catalog/laminates/greenlam/hpl-1220x2440.json` and `hpl-1300x3050.json`, one file per collection |
| The pictures the app loads | `public/assets/catalog/laminates/greenlam/<collection>/<category>-<code>-<name>.webp`, plus a `_swatch.webp` for pickers |
| The runtime catalogue (generated) | `lib/generated/cabinet-laminates.generated.ts`, from `scripts/generate-cabinet-laminate-runtime.ts` |
| Laminates as cabinet materials | `features/cabinetry/catalog/laminates.ts` (`CABINET_LAMINATES`, `findCabinetLaminate`) |
| Laminates as wall panels (surface materials) | `lib/laminate-wall-panel-materials.ts`, read by `lib/surface-material-sources.ts` (the server registry) and `scripts/generate-surface-material-runtime.ts`; see "On walls" below |
| How a laminate takes the light, per kind of decor | `lib/laminate-surface-finish.ts`, for cabinets and walls alike |
| How a picture lies on a part | `features/cabinetry/materialTexture.ts`, used by `features/cabinetry/createCabinetThreeGroup.ts` |
| Loading the pictures, shared by every cabinet on the page | `features/cabinetry/cabinetLaminateTextures.ts`, leased by `features/cabinetry/hooks/useCabinetSceneResourceOwnership.ts` |
| Which finishes are offered, search, and keeping a design's materials in step | `features/cabinetry/catalog/finishes.ts` |
| The picker | `features/cabinetry/components/CabinetFinishPicker.tsx` (Guided Main finish) and `CabinetFinishField.tsx` (each Detailed choice, and the part inspector) |
| Checks | `scripts/test-cabinet-laminates.ts` and `scripts/test-cabinet-finishes.ts`; the picture cache in `scripts/test-cabinetry-preview-renderer.ts` (all part of `test:cabinetry`) |

- The JSON and the WebP pictures are made from the manufacturer's files by `make_app_copies.py <masters> <repo> [collection]`, which is kept with the originals in `~/Developer/material-masters/greenlam/`. The collection defaults to `hpl-1220x2440`. The masters folder also keeps each collection's picture inventory (`tracking/<collection>-pictures.csv`) and contact sheets.
- After changing the JSON, run `npm run generate:cabinet-laminates`, then `npm run generate:surface-material-runtime` for the wall panels. `npm run check:cabinet-laminates`, `npm run check:surface-material-runtime` and the tests fail when a generated file is out of date.
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

## On walls

Since 25 Oct 2026 the laminates are also wall finishes (J's choices: patterned designs first, whole sheets, a warning on bathroom walls, the pictures confirmed for walls; on 27 Oct, the solid colours as flat sheets and the 4.25'×10' designs at real size from the floor). They come from the same catalogue, with no copy in `catalog/surface-materials/`:
- **374 wall panels.** Each design is a `wall_panel` surface material with the cabinets' id (`greenlam-<category>-<code>`) and its collection's sheet, published:
  - the 4'×8' collection's 233 patterned designs and 108 flat colours;
  - the 4.25'×10' collection's 21 patterned designs and 12 flat colours.

  5338 Steamed Bouchle is left out: its picture covers 1220×2115 mm of a 2440 mm sheet, so it would repeat on every sheet.
- **Flat colours** have no usable picture (their scans are unevenly lit, which is why the cabinets draw them flat). A wall panel draws its catalogue colour from a one-colour 4×8 px PNG named by the colour, over the whole sheet (`getLaminateFlatPictureUrl` in `lib/laminate-flat-pictures.ts`). `scripts/generate-laminate-flat-pictures.ts` (`npm run generate:laminate-flat-pictures`) writes them to `public/assets/catalog/laminates/flat-colours/` from the generated laminate runtime: 116 colours for 120 designs. The image data is stored, not compressed, so every machine writes the same bytes; `npm run check:laminate-flat-pictures` and the surface schema test check them.
- **4.25'×10' pictures cover only 2600 of the sheet's 3050 mm** (Tuscany Oak 2816; Albin Oak Black is a 1299 mm tile that repeats by design). On a wall they are drawn at real size from the sheet's foot and repeat straight up (`components/editor/renderers/wallPanelSheetPainter.ts`): a 2.6 m wall shows the picture once, and a taller wall shows the picture's foot again in its top strip. A wall panel's picture is never turned a quarter turn, so the grain runs as the sheet stands. A 10' sheet goes floor to ceiling, so on walls under 3.05 m every sheet is trimmed and none counts as whole.
- **One catalogue, two readers.** `lib/surface-material-sources.ts` gives the server registry the YAML records and these; the surface generator audits both alike and writes them into the render and catalogue data, so the 3D view, the inspector and the browser treat a panel like any other wall finish. See `docs/architecture/surface-material-runtime-boundary.md`.
- **A sheet on a wall** is a portrait "tile", 1220×2440 or 1300×3050 mm, whose one face is the design's picture, at the size it covers (`image_physical_size_mm`). On 4'×8' sheets 228 pictures cover the sheet (within 3%) and the five taller ones show a sheet-sized window; the 10' pictures are shorter and stand on the sheet's foot (above). Panels are laid straight, from the floor up and from the face's start: the cut sheet is at the top, a full sheet meets the corner, and the parts of a wall beside, below and above a door or window, each painted on its own canvas, share their joints and sheet edges, with a sheet's picture carrying on across them (`components/editor/renderers/surfaceTileRows.ts`). Each part says how high it starts and how far along the face: `house-plan-3d/wallSurfaceLayout.ts` for drawn rooms (from the face's corner), `canonical-floor-plan/geometry.ts` (`wallSurfaceLayout`, given the wall's slices) for imported plans; each measures from the face's corner, the way its picture runs. Tiles are laid as before, from each part's top and left edges.
- **Joints:** 1 mm in dark grey (#444442), which reads as the shadow between butted sheets; the inspector calls them joints, not grout, and they can be changed like tile grout.
- **The browser:** brand Greenlam, each kind of decor a collection (Woodgrains, Abstracts, Pearlescents, Metals, Unicore, Solids). A wall panel is named design first ("Greenlam Nordic Acacia 5394"; cabinets say "Greenlam 5394 Nordic Acacia"), because the wall browser sorts by name: code first, all the panels would come ahead of every tile. Effect: woodgrains are Wood, solids and Unicore Plain, metals and pearlescents Metallic; an abstract is Marble, Stone, Concrete or Woven where its name says so (Creme Marquina, Tivoli Travertine, Grey Onyx, Dune Pietra, Urban Concrete, Grey Mesh), otherwise Pattern. The 120 flat colours close the browser, after every other card, A to Z (J, 27 Oct 2026: "Flat colours last"); otherwise Absolute White and twelve AFX colours would fill its first page of 16 (`buildSurfaceMaterialProductGroups`, which tells them by their picture, `lib/laminate-flat-pictures.ts`). The 10' sheets show "1300x3050 mm". The rooms it suits leave out bathrooms and balconies: thin HPL is for dry walls.
- **Colour** (28 Oct 2026, J: "Solids and woods"). The browser's colour filter finds a panel by the colour the app draws, its catalogue colour, not its name (`lib/laminate-colour-family.ts`, pinned by `scripts/test-laminate-colour-family.ts`):
  - **Solids and Unicore** (128 designs) take a colour or a neutral: White, Cream, Beige, Grey, Charcoal, Black, Brown, Red, Orange, Yellow, Green, Blue, Purple, Pink. The seven colours were added to the colour vocabulary for them (`SurfaceColorFamily`, `controlled_vocabularies.yaml`). A Unicore design's colour is its picture's mean.
  - **Woodgrains** (168) are classified by their picture's mean colour into the oak tones the floors use (Light oak, Natural oak, Warm oak for the golden and reddish ones, Walnut for the dark ones), Brown, or White, Grey, Charcoal and Black for greyed, limed and ebonised woods.
  - **Patterns, metals and pearlescents** (79) have no one colour and stay Unknown.
  - The colour is taken to CIELab (D65). Nearly black is Black; near-greys go by lightness, with their faint tints; light warm tints are Cream or Beige, dull warm mid-tones Brown, and the rest go by hue. The thresholds were set on Greenlam's designs, checked by eye on a contact sheet and against the standard web colours (pure red, blue, navy and so on). Some names disagree with the colour drawn: Sky Grey is a pale blue and Dull Pink a dusty red.
  - **Side effects:** the search text includes the colour family, as for floors, so a search for "oak" or "walnut" also finds woods in those tones. The 2D plan tints a wall by its finish's colour family: laminate walls in the neutrals and wood tones now get those tints, and the seven new colours keep the default tint.
- **Quantities: whole sheets** (26 Oct 2026; J chose "Share offcuts"). The bill of materials, the share CSV and PDF, the Shopping list and the surface summary count a panel finish in whole sheets of its collection (1220×2440 or 1300×3050 mm), with the measured area alongside; tiles and floors keep m² plus 10% (`lib/surface-material-sheets.ts`).
  - Each finish's pieces on the wall faces come with its area (`lib/surface-material-wall-panels.ts`). They are the finish as the 3D view draws it (`getWallSurfacePartAlongFace` in `house-plan-3d/wallSurfaceLayout.ts`): along the drawn face, joined at the corners as when no wall is cut away for the camera, from the face's start corner, and up from the floor. So the counted sheets are the drawn ones. Each wall's own height is read under its face id, as the 3D view reads it; before 26 Oct a drawn polygon's edited wall height ("wall-0") was missed, which understated its area too. The area beside them stays on the wall line, as for every finish, so it can be a little more than the drawn face (a 4×3 m room with 120 mm walls: 36.4 m² measured, 35.15 m² drawn).
  - A sheet position the finish fills from edge to edge is a whole sheet, including one notched around a door or window. The cut pieces (the narrow column at a wall's end, the strip at the top of a wall taller than 2440 mm, the pieces beside and above an opening) are packed upright, tallest first, onto shared sheets. Offcuts are shared within one finish in one room: the room's default walls, a finished face or a finished panel; not between rooms. A 4×3 m room with 2.6 m walls takes 13 sheets (by area it would be 14).
  - A finish turned a quarter turn lays its sheets on their side; any other angle is counted upright. Saw cuts and the 1 mm joints aren't allowed for. A face the plan doesn't lay out is counted from its order area, rounded up to whole sheets.
  - **Imported plans** are drawn from the plan's own walls (`canonical-floor-plan/geometry.ts`), which can run past a room, so their sheets can start in another room. Their count is laid from each room's own corners.
  - **Price:** sheets are bought whole, so a priced sheet finish costs its sheets' area (the CSV's unit price is per sheet). Greenlam's panels have no price yet.
- **Wet walls:** plan review gives a tip when a bathroom's walls, a face or a panel are in a laminate sheet: Greenlam's pasting manual bonds its laminates to a board, not to plaster or concrete, and its shower walls are Shower Surfaces, a 3 mm compact sold as waterproof. See `docs/architecture/surface-suitability-checks.md`, check 6.

## Pictures that needed care (Greenlam 4'×8')

- 3396 Tango Wood is left out: its picture is a 600×650 panel on white, and 5396 Tango Wood has a full one.
- 5394 Nordic Acacia uses the full picture from Greenlam's 4.25'×10' collection; the 4'×8' one is a boxed panel.
- 5594 Olympia is both an abstract and a Unicore design, with two entries. The Revit file names the Unicore one 95594.
- 13 newer abstracts (505 and 5641 to 5675) have small pictures, about 0.26 px per mm. They are fine at room scale but soft up close.
- Match pictures to designs by file name, not by Greenlam's Revit materials: some of those point at another design's picture.

## Pictures that needed care (Greenlam 4.25'×10')

- **Left out:** 9107 Lorraine Walnut. Its picture is 5004 Lorraine Walnut's, according to the Revit file, and the 4'×8' catalogue already has 5004. 9107 is in none of the collection's tables.
- **Drawn in the colour Greenlam gives** (28 Oct 2026, J: "Add both"; left out until then). 115 Alabaster and 471 Arctic Grey are plain colours on Greenlam's pages, but their pictures in the Colours folder are a stone and a woodgrain, so even their mean colour would be wrong. They are flat colours in their stated colour, each recorded with its source in the catalogue (`colour_source`):
  - 115 Alabaster is RAL 9001, `#e9e0d2`: RAL 9001's CIELab (89.616, 0.594, 8.06) in sRGB under D65, as Wikipedia's List of RAL colours and hextoral.com give it (233, 224, 210).
  - 471 Arctic Grey is Pantone 13-4403 TPG (Silver Birch), `#cecdc1`: sRGB 206, 204, 193, from Columbia Omni Studio's Pantone FHI chart. Pantone's own page gives the values only in Pantone Connect.
  - Both are screen values. Neither has been compared with a real sample.
- **Athena Aegis is 5784.** Its picture is named 5774 (Antico's code); Greenlam's table and Revit file both give 5784.
- **5765 Albin Oak Black** has one 900×900 tile drawn twice, with a light line across the joint. The import uses the top tile without the line, covering 1300×1299 mm.
- **5867 Seronic Black** is book-matched: the picture mirrors at its middle. That is the design, not a joint.
- **Pictures with odd sizes:**
  - 5762 Tuscany Oak's picture is 1087×2355 px, so it covers 1300×2816 mm.
  - Four of the solids have small pictures, about 320×650 px. That doesn't matter, because solids are drawn flat in their mean colour.
