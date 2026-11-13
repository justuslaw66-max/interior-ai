import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveDesignItemVisualProduct, resolveLayoutBlockProduct } from "@/lib/design-item-product-snapshot";
import { buildPdfExportItems } from "@/lib/design-page-pdf-export-payload";
import { placePlanFurniture } from "@/lib/floor-plan-vector-furniture";
import { findLayoutBlockSpot } from "@/lib/layout-block-placement";
import {
  createLayoutBlockItem,
  isOverheadLayoutBlockKind,
  layoutBlockKind,
  layoutBlockTypicalSizeMm,
  LAYOUT_BLOCK_LIMITS_MM,
  updateLayoutBlock,
} from "@/lib/layout-blocks";
import { buildPlanSymbol, PLAN_SYMBOLS, PLAN_SYMBOL_KINDS } from "@/lib/plan-symbols/plan-symbol-library";
import { planSymbolShapesForItem } from "@/lib/plan-symbols/plan-symbol-item";
import { resolveRoomShoppingItems, summarizeShoppingRooms } from "@/lib/room-shopping";
import { createRoom, type DesignItem, type RoomSnapshot } from "@/lib/room-types";
import { buildSelectedItemSummary } from "@/lib/selected-item-summary";
import { computeAABB } from "@/lib/snapGuides";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import { catalogOrLayoutBlockProduct } from "@/lib/design-item-product-snapshot";
import { findCatalogPlacementCollision } from "@/lib/catalog-placement";
import { layoutBlockResizeCursor, layoutBlockResizeTarget, resizeLayoutBlockFootprint } from "@/lib/layout-block-resize";
import { layoutBlockCollisionProduct } from "@/lib/layout-blocks";
import { resolveLayoutBlockResize } from "@/lib/useLayoutBlockResizeCommit";

/** Layout blocks (lib/layout-blocks.ts): plan pieces with no product, placed, sized and drawn like items. */

const block = (kind: Parameters<typeof createLayoutBlockItem>[0]["kind"], instanceId: string = kind, position: [number, number, number] = [0, 0, 0]) =>
  createLayoutBlockItem({ kind, instanceId, position });

function testEveryKind() {
  for (const kind of PLAN_SYMBOL_KINDS) {
    const item = block(kind);
    assert.equal(layoutBlockKind(item), kind, `${kind}: the block keeps its kind`);
    const product = resolveDesignItemVisualProduct(item);
    if (!product) throw new Error(`${kind}: a block resolves to its own product`);
    assert.equal(product.title, PLAN_SYMBOLS[kind].label);
    assert.deepEqual(product.dimsMm, layoutBlockTypicalSizeMm(kind), `${kind}: placed at its typical size`);
    assert.equal(product.commerce.type, "not_buyable", `${kind}: never for sale`);
    assert.equal(product.placementRules.ceilingOnly, isOverheadLayoutBlockKind(kind), `${kind}: overhead only when fixed high`);
    assert.equal(product.placementRules.surfaceOnly, false, `${kind}: never needs a table under it`);
    assert(Object.values(product.dimsMm).every((value) => Number.isFinite(value) && value > 0));
  }
  assert.equal(layoutBlockKind({ assetType: "catalog_item", productId: "layout-block:sofa" }), null, "Only a block has a block kind.");
  assert.equal(layoutBlockKind({ assetType: "layout_block", productId: "layout-block:spaceship" }), null, "An unknown kind is no kind.");
  const sofa = block("sofa");
  assert.equal(resolveLayoutBlockProduct(sofa), resolveLayoutBlockProduct(sofa), "The panel's product is stable for one item.");
  assert.equal(resolveLayoutBlockProduct({ ...sofa, assetType: undefined }), null);
}

function testUpdate() {
  const wardrobe = block("wardrobe");
  const resized = updateLayoutBlock(wardrobe, { sizeMm: { w: 2400.4, d: 10, h: 99_999 } });
  assert.deepEqual(resized.productSnapshot?.dimensionsMm, { w: 2400, d: LAYOUT_BLOCK_LIMITS_MM.minPlan, h: LAYOUT_BLOCK_LIMITS_MM.maxHeight });
  assert.deepEqual(updateLayoutBlock(wardrobe, { sizeMm: { w: Number.NaN, d: 650, h: 2400 } }).productSnapshot?.dimensionsMm, { w: 1800, d: 650, h: 2400 },
    "A size that isn't a number keeps the old one.");
  assert.equal(updateLayoutBlock(wardrobe, { name: "  Master wardrobe  " }).productSnapshot?.name, "Master wardrobe");
  assert.equal(updateLayoutBlock(wardrobe, { name: "   " }).productSnapshot?.name, "Wardrobe", "A blank name keeps the old one.");
  const product = { ...wardrobe, assetType: "catalog_item" as const };
  assert.equal(updateLayoutBlock(product, { name: "x" }), product, "A product item is never changed.");
  const renamed = updateLayoutBlock(wardrobe, { name: "Mum's cupboard" });
  const placed = placePlanFurniture([{ ...createRoom("bed", "Bedroom", "bedroom"), items: [renamed] }], { rooms: [] }).placed[0];
  assert.equal(placed.placement.kind, "wardrobe", "A renamed block still draws its own symbol.");
  assert.equal(placed.name, "Mum's cupboard", "…and the schedule lists it by its name.");
  assert.deepEqual(planSymbolShapesForItem("other", "Mum's cupboard", 1.8, 0.6, "wardrobe"), buildPlanSymbol("wardrobe", 1.8, 0.6).shapes);
}

function testNotForSale() {
  const room = { ...createRoom("living", "Living", "living"), items: [block("sofa"), block("aircon", "ac")] };
  assert.deepEqual(resolveRoomShoppingItems(room), [], "Blocks are not in the Shopping list.");
  const [summary] = summarizeShoppingRooms([room], room.id);
  assert.equal(summary.itemCount, 0);
  assert.equal(summary.subtotal, 0, "…nor in the budget.");
  assert.deepEqual(buildPdfExportItems(room.items), [], "…nor in the PDF's product list.");
  const sofa = room.items[0];
  const product = resolveDesignItemVisualProduct(sofa);
  if (!product) throw new Error("block product");
  const panel = buildSelectedItemSummary({ product, item: sofa, style: "modern", measurementUnit: "mm", catalogItems: CATALOG_ITEMS });
  assert.equal(panel.priceLabel, "Layout block");
  assert.deepEqual(panel.sale, { kind: "layout" });
  assert.deepEqual(panel.swaps, { cheaper: null, pricier: null }, "A block has no product to swap.");
}

function aabbOf(item: DesignItem) {
  const dims = item.productSnapshot?.dimensionsMm;
  if (!dims) return null;
  const [width, depth] = getRotatedFootprint(dims.w / 1000, dims.d / 1000, item.rotationY ?? 0);
  return computeAABB(item.position, width, depth);
}

/** Inside the walls' inner faces: the room's half-size less half a wall. */
function contained(room: RoomSnapshot, position: [number, number, number], rotationY: number, dims: { w: number; d: number }) {
  const [width, depth] = getRotatedFootprint(dims.w / 1000, dims.d / 1000, rotationY);
  const inset = (room.geometry.wallThickness ?? 0.12) / 2;
  return Math.abs(position[0]) + width / 2 <= room.geometry.width / 2 - inset + 1e-9
    && Math.abs(position[2]) + depth / 2 <= room.geometry.depth / 2 - inset + 1e-9;
}

function testSpot() {
  const room = createRoom("living", "Living", "living", { width: 5, depth: 4, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
  const spot = (kind: Parameters<typeof block>[0], items: DesignItem[]) => findLayoutBlockSpot({
    room: { ...room, items }, sizeMm: layoutBlockTypicalSizeMm(kind), overhead: isOverheadLayoutBlockKind(kind), baseY: 0, getItemAABB: aabbOf, isContained: contained,
  });
  assert.deepEqual(spot("sofa", []), [0, 0, 0], "An empty room takes the block in its middle.");
  const sofa = block("sofa", "sofa-1");
  const next = spot("armchair", [sofa]);
  if (!next) throw new Error("A free spot exists beside the sofa.");
  const box = computeAABB(next, 0.8, 0.82), sofaBox = aabbOf(sofa);
  assert(sofaBox && (box.maxX <= sofaBox.minX || box.minX >= sofaBox.maxX || box.maxZ <= sofaBox.minZ || box.minZ >= sofaBox.maxZ), "…clear of the sofa.");
  assert.deepEqual(spot("aircon", [sofa]), [0, 0, 0], "An aircon passes over the sofa.");
  assert.deepEqual(spot("rug", []), [0, 0, 0]);
  const filler = updateLayoutBlock(block("wardrobe", "filler"), { sizeMm: { w: 4900, d: 3900, h: 2400 } });
  assert.equal(spot("armchair", [filler]), null, "A full room has no spot.");
}

const near = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

/** Resizing from the outline (J, 13 Nov 2026): the side opposite the handle stays put. */
function testResizeFootprint() {
  // A 1.8 × 0.6 wardrobe; the right edge dragged to x = 1.5 (0.6 past where it was).
  let next = resizeLayoutBlockFootprint({ handle: { sx: 1, sz: 0 }, startWidth: 1.8, startDepth: 0.6, pointerX: 1.5, pointerZ: 9 });
  near(next.width, 2.4, "Right edge: wider"); near(next.depth, 0.6, "…depth untouched");
  near(next.offsetX, 0.3, "…centre moves half the growth"); near(next.offsetZ, 0, "…not sideways");
  near(next.offsetX - next.width / 2, -0.9, "…left edge stays put");
  // The top-left corner pulled in: width and depth both shrink, the bottom-right corner stays.
  next = resizeLayoutBlockFootprint({ handle: { sx: -1, sz: -1 }, startWidth: 1.8, startDepth: 0.6, pointerX: -0.4, pointerZ: 0.1 });
  near(next.width, 1.3, "Corner: width to the pointer"); near(next.depth, 0.2, "…depth to the pointer");
  near(next.offsetX + next.width / 2, 0.9, "…right edge stays"); near(next.offsetZ + next.depth / 2, 0.3, "…bottom edge stays");
  // Snapped to whole centimetres, or to millimetres with Alt.
  near(resizeLayoutBlockFootprint({ handle: { sx: 1, sz: 0 }, startWidth: 1, startDepth: 1, pointerX: 0.7234, pointerZ: 0 }).width, 1.22, "1 cm steps");
  near(resizeLayoutBlockFootprint({ handle: { sx: 1, sz: 0 }, startWidth: 1, startDepth: 1, pointerX: 0.7234, pointerZ: 0, snap: false }).width, 1.223, "1 mm with Alt");
  // Dragged past the anchor: the smallest block, still on the anchor's side.
  next = resizeLayoutBlockFootprint({ handle: { sx: 1, sz: 0 }, startWidth: 1, startDepth: 1, pointerX: -3, pointerZ: 0 });
  near(next.width, LAYOUT_BLOCK_LIMITS_MM.minPlan / 1000, "Never below the minimum"); near(next.offsetX - next.width / 2, -0.5, "…anchored");
  near(resizeLayoutBlockFootprint({ handle: { sx: 0, sz: 1 }, startWidth: 1, startDepth: 1, pointerX: 0, pointerZ: 99 }).depth, 20, "Never above 20 m");
}

function testResizeTarget() {
  // Turned 90°, the block's +x points along the room's −z.
  const target = layoutBlockResizeTarget({ position: [2, 0.5, 3], rotationY: Math.PI / 2 }, { width: 2.4, depth: 0.6, offsetX: 0.3, offsetZ: 0 });
  near(target.position[0], 2, "Turned: x unchanged"); near(target.position[1], 0.5, "…height kept"); near(target.position[2], 2.7, "…moved along −z");
  assert.deepEqual(target.sizeMm, { w: 2400, d: 600 });
  assert.equal(layoutBlockResizeCursor(1, 0), "ew-resize");
  assert.equal(layoutBlockResizeCursor(0, -1), "ns-resize");
  assert.equal(layoutBlockResizeCursor(1, 1), "nwse-resize", "Down-right on the plan");
  assert.equal(layoutBlockResizeCursor(-1, 1), "nesw-resize");
}

function testResizeCommit() {
  const room = createRoom("bed", "Bedroom", "bedroom");
  const wardrobe = block("wardrobe", "w1");
  const contained: Parameters<typeof resolveLayoutBlockResize>[3] = {
    isCatalogPlacementContainedInRoom: () => true,
    findCatalogPlacementBlockerInRoom: () => null,
    getItemDisplayName: (item) => item?.productSnapshot?.name ?? null,
  };
  const grown = { width: 2.4, depth: 0.6, offsetX: 0.3, offsetZ: 0 };
  const result = resolveLayoutBlockResize(wardrobe, grown, room, contained);
  if (!result || !("item" in result)) throw new Error("A resize that fits is kept.");
  assert.deepEqual(result.item.productSnapshot?.dimensionsMm, { w: 2400, d: 600, h: layoutBlockTypicalSizeMm("wardrobe").h }, "Height kept");
  near(result.item.position[0], 0.3, "Centre moved");
  const outside = resolveLayoutBlockResize(wardrobe, grown, room, { ...contained, isCatalogPlacementContainedInRoom: () => false });
  assert.deepEqual(outside, { refused: "Keep the Wardrobe inside Bedroom." });
  const sofa = block("sofa", "s1");
  const blocked = resolveLayoutBlockResize(wardrobe, grown, room, { ...contained, findCatalogPlacementBlockerInRoom: () => sofa });
  assert.deepEqual(blocked, { refused: "That size runs into Sofa." });
  assert.deepEqual(resolveLayoutBlockResize({ ...wardrobe, locked: true }, grown, room, contained), { refused: "Unlock this item to resize it." });
  const product = Object.values(CATALOG_ITEMS)[0];
  const productItem: DesignItem = { instanceId: "p", productId: product.id, variantId: product.variants[0].id, position: [0, 0, 0], rotationY: 0, qty: 1 };
  assert.equal(resolveLayoutBlockResize(productItem, grown, room, contained), null, "Products are never resized");
}

/** Blocks are furniture to the rest of the editor: they turn, move between rooms and block others. */
function testBlocksAsFurniture() {
  const wardrobe = block("wardrobe");
  assert.equal(catalogOrLayoutBlockProduct(wardrobe)?.title, "Wardrobe", "Rotation and moves find the block");
  assert.equal(layoutBlockCollisionProduct("layout-block:aircon")?.placementRules.ceilingOnly, true);
  assert.equal(layoutBlockCollisionProduct("layout-block:sofa")?.placementRules.ceilingOnly, false);
  assert.equal(layoutBlockCollisionProduct("sofa-real-castlery-dawson-3s"), null);
  const sofa = block("sofa", "s1", [0, 0, 0]);
  const aabb = (item: DesignItem) => {
    const dims = item.productSnapshot?.dimensionsMm;
    return dims ? computeAABB(item.position, dims.w / 1000, dims.d / 1000) : null;
  };
  const args = { position: [0.2, 0, 0] as [number, number, number], rotationY: 0, items: [sofa], getItemAABB: aabb };
  assert.equal(findCatalogPlacementCollision({ productId: "layout-block:armchair", dimsMm: { w: 800, d: 800, h: 800 }, ...args }), sofa, "A block runs into a block");
  assert.equal(findCatalogPlacementCollision({ productId: "layout-block:aircon", dimsMm: { w: 800, d: 250, h: 300 }, ...args }), null, "An aircon block passes over it");
  assert.equal(findCatalogPlacementCollision({ productId: "layout-block:rug", dimsMm: { w: 2000, d: 1400, h: 10 }, ...args }), null, "A rug block lies under it");
}

testEveryKind();
testUpdate();
testNotForSale();
testSpot();
testResizeFootprint();
testResizeTarget();
testResizeCommit();
testBlocksAsFurniture();
console.log(`layout blocks: ${PLAN_SYMBOL_KINDS.length} kinds, sizing, shopping, panel, placement, resizing and collision checked`);
