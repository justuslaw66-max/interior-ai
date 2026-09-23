import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { getItemPrice } from "@/lib/design-page-utils";
import type {
  HousePlanTemplate,
  HousePlanTemplateFurnishingIntent,
} from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { DesignSnapshot } from "@/lib/room-types";

function hasTemplateFurnishingCommerce(product: CatalogItemSchema): boolean {
  const resolved = resolveCatalogVariant(product, product.defaultVariantId);
  const price = resolved.priceReference.amount ?? getItemPrice(product);
  if (!resolved.media.thumbUrl || !product.assets.modelUrl || !product.assets.thumbUrl) return false;
  if (!Number.isFinite(price) || price <= 0) return false;
  if (resolved.commerce.type === "affiliate") return Boolean(resolved.commerce.url);
  if (resolved.commerce.type === "shopify") {
    return Boolean(resolved.commerce.variantId && resolved.commerce.available);
  }
  return false;
}

export function resolveTemplateFurnishingProduct(
  intent: HousePlanTemplateFurnishingIntent
): CatalogItemSchema | null {
  return (
    Object.values(CATALOG_ITEMS)
      .filter((product) => product.category === intent.category)
      .filter(hasTemplateFurnishingCommerce)
      .sort((a, b) => getItemPrice(a) - getItemPrice(b))[0] ?? null
  );
}

export function isTemplateFurnishingNearDoorway(
  template: HousePlanTemplate,
  intent: HousePlanTemplateFurnishingIntent
): boolean {
  const room = template.rooms.find((entry) => entry.id === intent.roomId);
  if (!room) return true;

  return template.doorways.some((doorway) => {
    if (doorway.fromRoomId !== intent.roomId && doorway.toRoomId !== intent.roomId) return false;
    const wall = doorway.fromRoomId === intent.roomId
      ? doorway.wall
      : doorway.wall === "north"
        ? "south"
        : doorway.wall === "south"
          ? "north"
          : doorway.wall === "east"
            ? "west"
            : "east";
    const doorwayOffset = doorway.offsetMeters ?? 0;
    const doorwayX =
      wall === "east"
        ? room.width / 2
        : wall === "west"
          ? -room.width / 2
          : doorwayOffset;
    const doorwayZ =
      wall === "south"
        ? room.depth / 2
        : wall === "north"
          ? -room.depth / 2
          : doorwayOffset;
    const dx = intent.x - doorwayX;
    const dz = intent.z - doorwayZ;
    return Math.hypot(dx, dz) < 0.95;
  });
}

export function shouldConfirmPlanTemplateReplacement(
  snapshot: DesignSnapshot,
  openings: RoomOpening2D[]
): boolean {
  const rooms = snapshot.rooms ?? [];
  const itemCount = rooms.reduce((count, room) => count + room.items.length, 0);
  if (itemCount > 0) return true;
  if (rooms.length !== 1) return rooms.length > 0;

  const [room] = rooms;
  if (!room) return false;

  const isDefaultStarterLivingRoom =
    room.roomType === "living" &&
    Math.abs(room.geometry.width - ROOM_DIMENSION_DEFAULTS.width) < 0.001 &&
    Math.abs(room.geometry.depth - ROOM_DIMENSION_DEFAULTS.depth) < 0.001;

  return !isDefaultStarterLivingRoom || openings.length > 2;
}
