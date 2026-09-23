import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import type { DesignItem } from "@/lib/room-types";

export type AiLayoutPreviewFootprint = {
  id: string;
  productId: string;
  title: string;
  variantLabel: string;
  position: [number, number, number];
  rotationY: number;
  width: number;
  depth: number;
  outlinePoints: [number, number, number][];
};

export function buildAiLayoutPreviewFootprints({
  items,
  roomOffset = { x: 0, z: 0 },
}: {
  items: DesignItem[];
  roomOffset?: { x: number; z: number };
}): AiLayoutPreviewFootprint[] {
  return items.flatMap((item) => {
    const product = CATALOG_ITEMS[item.productId];
    if (!product) return [];

    const resolved = resolveCatalogVariant(product, item.variantId);
    const width = resolved.dimsMm.w / 1000;
    const depth = resolved.dimsMm.d / 1000;

    return {
      id: item.instanceId,
      productId: item.productId,
      title: product.title,
      variantLabel: resolved.variant.label,
      position: [
        item.position[0] + roomOffset.x,
        0.082,
        item.position[2] + roomOffset.z,
      ],
      rotationY: item.rotationY ?? 0,
      width,
      depth,
      outlinePoints: [
        [-width / 2, 0.105, -depth / 2],
        [width / 2, 0.105, -depth / 2],
        [width / 2, 0.105, depth / 2],
        [-width / 2, 0.105, depth / 2],
        [-width / 2, 0.105, -depth / 2],
      ],
    };
  });
}
