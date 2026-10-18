import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { getItemPrice } from "@/lib/design-page-utils";
import type { SurfaceCheckRoom } from "@/lib/floor-plan-surface-checks";
import type { DesignItem } from "@/lib/room-types";

type Catalog = Readonly<Record<string, CatalogItemSchema>>;

/**
 * What AI notes is told about each product in the room (18 Oct 2026): its instance id (the one RUG_RESIZE_TO_SOFA names),
 * what it is, its size in metres, its unit price and how many. Until then the page sent `productId`, `quantity` and
 * `price`, and the contract kept only the price, so the model saw a list of prices.
 */
export function buildDesignNotesItems(items: readonly DesignItem[], catalog: Catalog) {
  return items.map((item) => {
    const product: CatalogItemSchema | undefined = catalog[item.productId];
    return {
      id: item.instanceId,
      productId: item.productId,
      name: item.name ?? product?.title,
      category: product?.category,
      variantId: item.variantId,
      locked: item.locked === true,
      quantity: item.qty ?? 1,
      price: getItemPrice(product),
      size: product
        ? { width: product.dimsMm.w / 1000, depth: product.dimsMm.d / 1000, height: product.dimsMm.h / 1000 }
        : undefined,
      tags: product?.styleTags,
    };
  });
}

/**
 * The request body for `/api/ai/design-notes`: the room's products, their categories and their total, and the room's
 * type and finishes as material ids. The server looks up the tiles' facts itself.
 */
export function buildDesignNotesRequest(input: {
  designId: string | null;
  items: readonly DesignItem[];
  room: SurfaceCheckRoom | null;
  catalog: Catalog;
  designerMode: boolean;
}) {
  const items = buildDesignNotesItems(input.items, input.catalog);
  const categories = Array.from(new Set(items.flatMap((item) => (item.category ? [item.category] : []))));
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    design: { id: input.designId, room: input.room, items, categories, budget: String(total) },
    mode: input.designerMode ? "designer" : "homeowner",
  };
}
