import { CATALOG_ITEMS } from "@/lib/catalog";
import type { PendingCatalogPlacement } from "@/lib/catalog-placement";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  ManualPlacementScore,
  ManualPlacementScoreKind,
} from "@/lib/manual-placement-scoring";
import type { RoomSnapshot } from "@/lib/room-types";

const SCORE_LABELS: Record<
  ManualPlacementScoreKind,
  ManualPlacementScore["label"]
> = {
  great: "Great",
  okay: "Okay",
  cramped: "Cramped",
  blocks_path: "Blocks path",
  wrong_zone: "Wrong zone",
};

export const multiVariantPolicyProduct = Object.values(CATALOG_ITEMS).find(
  (product) => product.variants.length >= 3
) as CatalogItemSchema;

if (!multiVariantPolicyProduct) {
  throw new Error("Catalog policy tests require a product with at least three variants.");
}

export function makePolicyRoom(
  id: string,
  name = id,
  width = 5,
  depth = 5
): RoomSnapshot {
  return {
    id,
    name,
    roomType: "living",
    geometry: { width, depth, height: 2.7, wallThickness: 0.12 },
    items: [],
    zones: [],
    savedViews: [],
  };
}

export function makePolicyPlacement({
  roomId = "room-current",
  variantId = multiVariantPolicyProduct.defaultVariantId,
  position = [0, 0, 0],
  rotationY = 0,
  reason = "Test placement",
}: {
  roomId?: string;
  variantId?: string;
  position?: [number, number, number];
  rotationY?: number;
  reason?: string;
} = {}): PendingCatalogPlacement {
  return {
    productId: multiVariantPolicyProduct.id,
    variantId,
    roomId,
    position,
    rotationY,
    reason,
  };
}

export function makePolicyScore(
  score: number,
  kind: ManualPlacementScoreKind = "great",
  summary = `${SCORE_LABELS[kind]} placement`
): ManualPlacementScore {
  return {
    kind,
    label: SCORE_LABELS[kind],
    score,
    summary,
    warnings: [],
    suggestions: [],
    actions: [],
    compatibleZoneIds: [],
    relationship: "neutral",
  };
}
