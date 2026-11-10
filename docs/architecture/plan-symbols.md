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

## Next

- A black-and-white plan in the PDF export, through the SVG adapter.
- More symbols: bunk bed, sofa bed, U sofa, island counter, built-in oven, dishwasher, water heater, aircon fan-coil (dashed), bay-window seat, altar cabinet. Doors and windows stay with the openings code.

## Commands

```
npm run test:plan-symbols
npx tsx scripts/plan-symbol-sheet.ts docs/architecture/plan-symbol-sheet.svg
```

The test also checks that the committed sheet matches what the code draws, so regenerate the sheet after changing a symbol.
