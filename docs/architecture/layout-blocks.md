# Layout blocks

J, 12 Nov 2026: "lets do layout blocks now first". A layout block is a plan piece with no product behind it: any of the plan symbols (`lib/plan-symbols/`) at a size the person sets. A whole home can be laid out in 2D first, and products chosen later.

## What a block is

- An ordinary `DesignItem` with `assetType: "layout_block"`, `productId: "layout-block:<kind>"` and variant `custom`. Its product snapshot holds the name, a category close to its kind, and its size (`lib/layout-blocks.ts`).
- Because it is an item, placement, collision, drag, rotate, duplicate, undo, saving, sharing and the PDF all treat it like any placed item. The saved-snapshot path that already keeps a delisted product drawable (`resolveDesignItemVisualProduct`) resolves it.
- **Not for sale:** its commerce is `not_buyable`. It stays out of the Shopping list and the budget (`room-shopping`), the PDF's product list, and the item panel's swaps.
- **Overhead kinds:** pendant light, ceiling fan, wall TV, aircon, cooker hood, wall cabinets, drying rack, water heater and mirror cabinet are `ceilingOnly`. They pass over floor items, and in 3D they sit with their top at the ceiling.

## How it is used

- **Adding:** Furnish has Products | Layout blocks. Layout blocks lists every symbol by group at its usual size (`components/editor/FurnishLayoutBlocks.tsx`). Adding one puts it at the clear spot nearest the room's middle (`lib/layout-block-placement.ts`), selected, as one undoable step.
- **Item panel:** the panel shows the block's Name, Width, Depth and Height in the design's units (`LayoutBlockFields`). Each change is one undoable step, and sizes are clamped (50 mm to 20 m on plan, 10 mm to 5 m high).
- **Drawing:**
  - 2D plan and PDF: its own symbol, whatever its name (an explicit `kind` passed to `planSymbolShapesForItem`).
  - 3D and shared views: a plain box at its size.
  - The PDF schedule lists blocks by name, with variant "Layout block".

## Not yet

- Replace a block with a product (same spot and angle).
- Drag handles to resize on the plan.
- Collision checks after a resize.
