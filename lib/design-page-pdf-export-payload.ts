import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { getItemPrice } from "@/lib/design-page-utils";
import type { PlanWirePayload } from "@/lib/download-plan-wire";
import type { RoomOpening2D } from "@/lib/editorScene";
import { isLayoutBlock } from "@/lib/layout-blocks";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";

/**
 * What the Download PDF request carries besides its images: the product list, each product
 * with its tag on the furnished plan, and the plan itself (lib/download-plan-wire).
 */

export type PdfExportListItem = {
  name: string;
  price: number;
  qty: number;
  retailer: string | null;
  buyUrl: string | null;
  tag?: number;
};

export function buildPdfExportItems(items: readonly DesignItem[], tagByInstanceId: Readonly<Record<string, number>> = {}): PdfExportListItem[] {
  return items.flatMap((item) => {
    // A layout block has no product to buy: the plan's schedule lists it, the product list doesn't.
    if (isLayoutBlock(item)) return [];
    const liveProduct = CATALOG_ITEMS[item.productId];
    const visualProduct = resolveDesignItemVisualProduct(item, CATALOG_ITEMS);
    if (!visualProduct) return [];
    const affiliate = liveProduct?.commerce.type === "affiliate" ? liveProduct.commerce.data : null;
    const tag = tagByInstanceId[item.instanceId];
    return [{
      name: visualProduct.title,
      price: liveProduct ? getItemPrice(liveProduct) : 0,
      qty: item.qty || 1,
      retailer: affiliate?.retailer ?? null,
      buyUrl: affiliate?.url ?? null,
      ...(tag ? { tag } : {}),
    }];
  });
}

/**
 * The furnished plan for the request, or none: the PDF still downloads when the plan cannot be
 * drawn here, without the plan pages or the list's tags. The doors and windows are the plan's
 * live ones: the snapshot carries its own copy only from the last save.
 */
export async function buildPdfExportPlan(snapshot: DesignSnapshot, openings: readonly RoomOpening2D[]): Promise<{ plan?: PlanWirePayload; tagByInstanceId: Record<string, number> }> {
  try {
    const [{ buildDownloadPlanDrawing }, { encodeDownloadPlan }] = await Promise.all([
      import("@/lib/download-plan-drawing"),
      import("@/lib/download-plan-wire"),
    ]);
    const drawing = buildDownloadPlanDrawing({ ...snapshot, floorPlan: { ...snapshot.floorPlan, openings: [...openings] } });
    if (!drawing.sheets.length) return { tagByInstanceId: {} };
    return { plan: encodeDownloadPlan(drawing), tagByInstanceId: drawing.tagByInstanceId };
  } catch (error) {
    console.warn("[export] furnished plan skipped", error);
    return { tagByInstanceId: {} };
  }
}

/** The request's product list and plan, the list numbered to match the plan's tags. */
export async function buildPdfExportListAndPlan(items: readonly DesignItem[], snapshot: DesignSnapshot, openings: readonly RoomOpening2D[]) {
  const { plan, tagByInstanceId } = await buildPdfExportPlan(snapshot, openings);
  return { items: buildPdfExportItems(items, tagByInstanceId), ...(plan ? { plan } : {}) };
}
