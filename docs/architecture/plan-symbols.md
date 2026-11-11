# 2D plan symbols

Black-and-white furniture and fixture symbols for the 2D plan, in the style of a Singapore ID's layout plan: solid walls, furniture in thin line, ceiling items dashed. The sheet `plan-symbol-sheet.svg` beside this file shows every symbol.

## Why our own, drawn from the footprint

- **Every symbol is drawn in code from the product's width and depth.** A stretched icon distorts (a 2-seat sofa icon pulled to 2.4 m has giant cushions). Here a sofa gains seat cushions with width, a dining set gains chairs with length (ends from about 1.8 m of table), a bed has one pillow below 1.2 m and two from 1.2 m, a hob picks 2, 3, 4 or 5 burners from its size, and a sink becomes a double bowl at 78-99 cm and one bowl with a drainer from 1 m.
- **The symbol is the product.** It uses the same footprint the placement engine and the 3D model use, so switching to 3D needs no matching. A symbol never draws outside its footprint (tested).
- **No third-party artwork.** Nothing is traced or copied from stock icon sets or other apps; the shapes are generic drawing conventions drawn here from scratch.

## Conventions

- **Frame:** metres, in the item's own plan frame as `ItemRenderer2D` draws it: x across the width (−w/2 to +w/2), z across the depth from −d/2 (the back, against the wall) to +d/2 (the front). Arc angles are degrees from +x towards +z. `rotationDeg` and position are applied by the renderer, as for any item.
- **Three line weights** (`PlanSymbolStroke`): `outline` for the footprint, `detail` for the main parts (arms, pillows, bowls, burners), `fine` for texture (seat seams, hangers, books). The SVG adapter maps them to 1.5, 1 and 0.6 px by default.
- **Dashed** for what is overhead or hidden: pendant lights, a ceiling fan's sweep, a cooker hood, upper cabinets above a counter, a wardrobe's rail.
- **Fill:** shapes marked `fill` are painted paper-white first, so they hide what was drawn before them (a table over the tucked-in part of its chairs, a sofa over the floor).

## Code

| File | Owns |
|---|---|
| `lib/plan-symbols/plan-symbol-types.ts` | The shape types, symbol kinds and options |
| `lib/plan-symbols/plan-symbol-shapes.ts` | Shape constructors and shared parts (cushion, chair) |
| `lib/plan-symbols/plan-symbols-living.ts` | Sofas, chairs, tables, TV console, rug, lights, fan, plant |
| `lib/plan-symbols/plan-symbols-dining-bedroom.ts` | Dining, beds, wardrobe, desk, cabinets and shelves |
| `lib/plan-symbols/plan-symbols-kitchen-bath.ts` | Counter, hob, sink, appliances, toilet, basin, vanity, shower, bath |
| `lib/plan-symbols/plan-symbol-library.ts` | The registry: label, group, typical size and builder per kind; `buildPlanSymbol` |
| `lib/plan-symbols/plan-symbol-match.ts` | `resolvePlanSymbolKind(category, name)`: catalogue category first, then words in the name |
| `lib/plan-symbols/plan-symbol-svg.ts` | The SVG adapter (exports, sheets, thumbnails) |
| `lib/plan-symbols/plan-symbol-item.ts` | A placed item's shapes, and the plan heights |
| `lib/plan-symbols/plan-symbol-tessellate.ts` | Shapes as segments and paper polygons, layered by drawing order |
| `components/editor/renderers/PlanSymbol2D.tsx` | The 2D plan's WebGL drawing of a symbol |

The library is pure: no React or Three.js. Renderers consume its shapes: the SVG adapter directly, the 2D plan through the tessellation.

## In the 2D plan

`ItemRenderer2D` draws every placed product as its symbol through `PlanSymbol2D`, for consumers and Pro alike. The old tinted box with a line or two per category is gone.

- `lib/plan-symbols/plan-symbol-item.ts` picks the shapes for an item (its symbol, or a plain outlined box when nothing matches yet) and holds the plan heights.
- `lib/plan-symbols/plan-symbol-tessellate.ts` turns shapes into line segments and paper polygons. Drawing order becomes height: each filled shape sits one layer (0.5 mm, four depth steps of the plan camera) above what came before, so a table's paper covers its tucked-in chairs.
- `PlanSymbol2D` draws one paper mesh and one drei `Line` (in `segments` mode) per line weight and dash, so a symbol costs a handful of draw calls whatever its detail. Ink and paper go through the canvas palette (`#111111` and `#ffffff`, light lines on dark paper in dark mode).
- Selection, hover, snapping and clashes stay as coloured marks over the symbol at `PLAN_SYMBOL_OVERLAY_Y`; an invisible plane over the footprint is still the pick target.
- **Names:** the symbol says what an item is, so `PlanItemName2D` shows a product's name only while it is pointed at, selected or keyboard-focused, and always on a plain box with no symbol yet (J, 11 Nov: the 2D plan is for mapping out the layout). The name's button stays in place unseen, so Tab still reaches every item. Numbered tags with a product list belong to the PDF export.

## In the vector plan export

The uploaded-plan wall editor's "Compare and export vector plan" (PDF and SVG at 1:50 or 1:100) draws furniture with the same symbols (J, 11 Nov: the vector export first, the main Download PDF next).

- `lib/floor-plan-vector-furniture.ts` places each item as before (same footprint and transform as the scene). It then draws a paper-white footprint with no line of its own: this is the item's single editable path, role `furniture`. Next come the symbol's shapes, each its own path (`furniture-symbol`, from `lib/floor-plan-vector-furniture-symbols.ts`). Last comes a numbered tag (`furniture-tag`).
- Line weights and dashes are in paper millimetres (`paperStrokeMm`, `paperDashMm`): outline 0.25, detail 0.18, fine 0.13, dashes 1.2/0.8. They print the same at either scale.
- Furniture is drawn before dimensions and room names, so its paper never covers them. Tags are drawn last.
- **Tags:** the same product, variant and size share a number, counted in drawing order. A tag is a 2.1 mm paper circle with its number.
- **Schedule:** the PDF adds a page (more if needed) listing No., Item (with variant), Size W × D × H, Qty and Room (`lib/floor-plan-vector-schedule.ts`). The SVG has the tags but no list.
- Overhead items (a ceiling fan's blades and sweep) have no paper, so the furniture under them still shows.

## In the Download PDF

Every design's Download PDF ends with a furnished layout plan: one sheet per floor, then the furniture schedule. Free exports carry the watermark on these pages too.

- **Drawing (client, `lib/download-plan-drawing.ts`):** an imported plan draws its own walls, openings, structures and room names (`buildFloorPlanVectorDrawing`, without dimension strings). Any other design draws its rooms (`lib/download-plan-rooms-drawing.ts`): the same wall bands as the 2D editor, cut where doors and windows stand, square caps where walls turn, and each room's name and floor area on one line. Door and window symbols come from `lib/plan-opening-symbol-lines.ts`, which the 2D editor also draws from; a door swing is one cubic curve.
- **Walls (J, 11 Nov):** cut walls keep their true thickness but print light: a light grey fill (`tone` 217) under fine face lines (0.35 mm), not a dark mass. `lib/plan-wall-faces.ts` finds the faces: each wall piece's edges where they meet open floor, with the seams between bands, corner caps and mitred strips left out. Imported plans' walls get the same treatment.
- **Windows** draw as a layout plan does: three lines across the opening, the wall's two faces and the glass on its centreline (J, 11 Nov); the jambs are the cut wall's own faces. The 2D editor keeps its own window symbol.
- **Doors and windows** come from the editor's live plan openings, not the snapshot's copy, which is only refreshed when the design is saved (the first download of a new template design had none).
- **Room names** move to the free spot nearest the room's middle, clear of every item's footprint (`lib/download-plan-labels.ts`, sized at 1:50).
- **One numbering for the home:** `placePlanFurniture` numbers every drawn room's items together, so a tag means the same product on every floor. The product list in the PDF prints each product's tag (`lib/export-pdf-item-list.ts`), and the schedule lists every tag with its size and rooms.
- **Wire (`lib/download-plan-wire.ts`):** the request carries each sheet's paths (M, L, C and Z only, rounded to 0.1 mm) and labels, and the schedule. The server checks every path and rebuilds its points from it, with limits on sheets, primitives, path length, coordinates and text. A malformed plan rejects the request (400).
- **Pages (server, `lib/download-pdf-plan-pages.ts`):** each sheet takes the first true scale that fits: A4 at 1:50, A4 at 1:100, A3 at 1:100, A4 at 1:200, then A3 at 1:200. A sheet too large for all of these is left out, never shrunk off-scale. Labels are set in Liberation Sans, read from `public/fonts` (traced into the route in `next.config.ts`). A room name the font cannot set (Chinese, say) falls back to its room type; any other label it cannot set is left off, and the footer says how many.
- If the plan cannot be built in the browser or drawn on the server, the PDF still downloads, without it.
- Not yet drawn: configured products whose size comes from their configuration (their size needs the editor's configuration resolvers), and openings not on a wall. The footer counts what was left out.

## Next

- More symbols: bunk bed, sofa bed, U sofa, island counter, built-in oven, dishwasher, water heater, aircon fan-coil (dashed), bay-window seat, altar cabinet. Doors and windows stay with the openings code.

## Commands

```
npm run test:plan-symbols
npx tsx scripts/plan-symbol-sheet.ts docs/architecture/plan-symbol-sheet.svg
```

The test also checks that the committed sheet matches what the code draws, so regenerate the sheet after changing a symbol.
