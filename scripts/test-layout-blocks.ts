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

testEveryKind();
testUpdate();
testNotForSale();
testSpot();
console.log(`layout blocks: ${PLAN_SYMBOL_KINDS.length} kinds, sizing, shopping, panel and placement checked`);
