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

type TemplateFurnishingCategory = HousePlanTemplateFurnishingIntent["category"];

const TEMPLATE_FURNISHING_NAMES: Readonly<Record<TemplateFurnishingCategory, [string, string]>> = {
  sofa: ["sofa", "sofas"],
  coffee_table: ["coffee table", "coffee tables"],
  rug: ["rug", "rugs"],
  dining_table: ["dining table", "dining tables"],
  dining_bench: ["dining bench", "dining benches"],
  accent_chair: ["armchair", "armchairs"],
  floor_lamp: ["floor lamp", "floor lamps"],
  tv_console: ["TV console", "TV consoles"],
  sideboard: ["sideboard", "sideboards"],
  ottoman: ["ottoman", "ottomans"],
  side_table: ["side table", "side tables"],
  bed: ["bed", "beds"],
};

/** "the rug", "the rug and the floor lamp", "the sofa, the rug and the side tables". */
function namedFurnishings(categories: readonly TemplateFurnishingCategory[]): string {
  const counts = new Map<TemplateFurnishingCategory, number>();
  for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
  const names = [...counts].map(
    ([category, count]) => `the ${TEMPLATE_FURNISHING_NAMES[category][count > 1 ? 1 : 0]}`
  );
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a template says once applied. A furnished one names what it couldn't place, instead of
 * "Some items couldn't be added" (UX phase 4a).
 */
export function templateAppliedMessage(
  templateLabel: string,
  pack: { intents: readonly unknown[] } | null,
  skipped: readonly TemplateFurnishingCategory[]
): string {
  if (!pack) return `${templateLabel} added`;
  if (skipped.length === 0) return `${templateLabel} added with furniture`;
  if (skipped.length >= pack.intents.length) return `${templateLabel} added without furniture`;
  return `${templateLabel} added without ${namedFurnishings(skipped)}`;
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
  snapshot: Pick<DesignSnapshot, "rooms">,
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

/**
 * The first visit's room, untouched (audit finding FR2): one living room at the default size, with no
 * products and at most the two openings it starts with. It reads as a draft until it is changed.
 */
export function isUntouchedStarterRoom(snapshot: Pick<DesignSnapshot, "rooms">, openings: RoomOpening2D[]): boolean {
  return (snapshot.rooms ?? []).length === 1 && !shouldConfirmPlanTemplateReplacement(snapshot, openings);
}
