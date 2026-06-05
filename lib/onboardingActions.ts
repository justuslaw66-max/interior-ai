import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { track } from "@/lib/analytics";
import type { OnboardingStep } from "@/lib/onboarding";

type PlacedItem = {
  productId: string;
  position: [number, number, number];
  rotationY?: number;
};

type OnboardingContext = {
  items: PlacedItem[];
  designId: string | null;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  addItem: (productId: string, position: [number, number, number], rotationY?: number) => void;
  findByCategory: (category: CatalogItemSchema["category"]) => PlacedItem | null;
};

function firstCatalogIdByCategory(category: CatalogItemSchema["category"]): string | undefined {
  return Object.values(CATALOG_ITEMS).find((item) => item.category === category)?.id;
}

const DEFAULT_SOFA_ID = firstCatalogIdByCategory("sofa");
const DEFAULT_RUG_ID = firstCatalogIdByCategory("rug");
const DEFAULT_COFFEE_ID = firstCatalogIdByCategory("coffee_table");
const DEFAULT_CHAIR_ID = firstCatalogIdByCategory("accent_chair");
const DEFAULT_LAMP_ID = firstCatalogIdByCategory("floor_lamp");

function clampToRoom(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomW: number,
  roomD: number,
  wall: number
): [number, number] {
  const minX = -roomW / 2 + wall + itemWidth / 2;
  const maxX = roomW / 2 - wall - itemWidth / 2;
  const minZ = -roomD / 2 + wall + itemDepth / 2;
  const maxZ = roomD / 2 - wall - itemDepth / 2;

  const clampedX = Math.max(minX, Math.min(maxX, x));
  const clampedZ = Math.max(minZ, Math.min(maxZ, z));

  return [clampedX, clampedZ];
}

function pickRugForSofa(sofa: CatalogItemSchema | null) {
  const rugs = Object.values(CATALOG_ITEMS).filter((item) => item.category === "rug");
  if (!sofa || rugs.length === 0) {
    return DEFAULT_RUG_ID ? CATALOG_ITEMS[DEFAULT_RUG_ID] : undefined;
  }

  const target = (sofa.dimsMm.w / 1000) * 0.75; // Convert mm to meters
  let best = rugs[0];
  let bestDiff = Math.abs((best.dimsMm.w / 1000) - target);

  for (const r of rugs) {
    const diff = Math.abs((r.dimsMm.w / 1000) - target);
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }

  return best;
}

export async function autoCompleteStep(step: OnboardingStep, ctx: OnboardingContext) {
  track("onboarding_auto_clicked", { step, design_id: ctx.designId });

  if (step === "sofa") {
    if (ctx.findByCategory("sofa")) return;
    if (!DEFAULT_SOFA_ID) return;
    ctx.addItem(DEFAULT_SOFA_ID, [0, 0, -1.4]);
    return;
  }

  if (step === "rug") {
    if (ctx.findByCategory("rug")) return;
    const sofaItem = ctx.findByCategory("sofa");
    const sofaProduct = sofaItem ? CATALOG_ITEMS[sofaItem.productId] : null;
    const rug = pickRugForSofa(sofaProduct);
    if (!rug) return;
    const baseZ = sofaItem?.position?.[2] ?? -1.4;
    const sofaDepth = sofaProduct ? sofaProduct.dimsMm.d / 1000 : 0.9; // Convert mm to meters
    const z = baseZ + sofaDepth * 0.35;
    ctx.addItem(rug.id, [sofaItem?.position?.[0] ?? 0, 0, z]);
    return;
  }

  if (step === "coffee_table") {
    if (ctx.findByCategory("coffee_table")) return;
    const sofaItem = ctx.findByCategory("sofa");
    const sofaProduct = sofaItem ? CATALOG_ITEMS[sofaItem.productId] : null;
    const coffee = DEFAULT_COFFEE_ID ? CATALOG_ITEMS[DEFAULT_COFFEE_ID] : undefined;
    if (!coffee) return;
    const sofaZ = sofaItem?.position?.[2] ?? -1.4;
    const sofaDepth = sofaProduct ? sofaProduct.dimsMm.d / 1000 : 0.9;
    const coffeeDepth = coffee.dimsMm.d / 1000;
    const sofaFrontZ = sofaZ + sofaDepth / 2;
    const walkway = 0.6;
    const z = sofaFrontZ + walkway + coffeeDepth / 2;
    ctx.addItem(coffee.id, [sofaItem?.position?.[0] ?? 0, 0, z]);
    return;
  }

  if (step === "reading_corner") {
    const hasChair = ctx.findByCategory("accent_chair");
    const hasLamp = ctx.findByCategory("floor_lamp");
    if (hasChair && hasLamp) return;

    const chair = DEFAULT_CHAIR_ID ? CATALOG_ITEMS[DEFAULT_CHAIR_ID] : undefined;
    const lamp = DEFAULT_LAMP_ID ? CATALOG_ITEMS[DEFAULT_LAMP_ID] : undefined;

    let chairX = -1.1;
    let chairZ = -0.2;
    if (chair && !hasChair) {
      [chairX, chairZ] = clampToRoom(
        chairX,
        chairZ,
        chair.dimsMm.w / 1000,
        chair.dimsMm.d / 1000,
        ctx.roomWidth,
        ctx.roomDepth,
        ctx.wallThickness
      );
      ctx.addItem(chair.id, [chairX, 0, chairZ], Math.PI / 6);
    }

    if (!lamp || hasLamp) return;

    let lampX = chairX + 0.45;
    let lampZ = chairZ + 0.25;
    [lampX, lampZ] = clampToRoom(
      lampX,
      lampZ,
      lamp.dimsMm.w / 1000,
      lamp.dimsMm.d / 1000,
      ctx.roomWidth,
      ctx.roomDepth,
      ctx.wallThickness
    );

    ctx.addItem(lamp.id, [lampX, 0, lampZ]);
  }
}
