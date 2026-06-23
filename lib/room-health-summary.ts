import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { computeCirculationAnalysis } from "@/lib/circulation-analysis";
import type { RoomOpening2D } from "@/lib/editorScene";
import { scoreManualPlacement } from "@/lib/manual-placement-scoring";
import type { RoomSnapshot } from "@/lib/room-types";

export type RoomHealthLevel = "ready" | "review" | "blocked";

export type RoomHealthSummary = {
  roomId: string;
  roomName: string;
  level: RoomHealthLevel;
  placementScore: number;
  itemCount: number;
  blockedPlacementCount: number;
  crampedPlacementCount: number;
  missingAnchorCount: number;
  circulationWarningCount: number;
  shoppingNeedsReviewCount: number;
  exportIssueCount: number;
  nextAction: string;
};

type BuildRoomHealthSummaryParams = {
  room: RoomSnapshot;
  catalogItems: Record<string, CatalogItemSchema | undefined>;
  openings?: RoomOpening2D[];
  shoppingNeedsReviewCount?: number;
};

function getItemDims(room: RoomSnapshot, itemId: string, catalogItems: Record<string, CatalogItemSchema | undefined>) {
  const item = room.items.find((entry) => entry.instanceId === itemId);
  const product = item ? catalogItems[item.productId] : null;
  if (!item || !product) return null;
  const variant = product.variants.find((entry) => entry.id === item.variantId);
  return variant?.dimensionsMm ?? product.dimsMm;
}

export function buildRoomHealthSummary({
  room,
  catalogItems,
  openings = [],
  shoppingNeedsReviewCount = 0,
}: BuildRoomHealthSummaryParams): RoomHealthSummary {
  const scores = room.items.flatMap((item) => {
    const dimsMm = getItemDims(room, item.instanceId, catalogItems);
    if (!dimsMm) return [];
    return scoreManualPlacement({
      room,
      item,
      dimsMm,
      catalogItems,
      openings,
      existingItems: room.items,
    });
  });
  const circulation = computeCirculationAnalysis({
    room,
    items: room.items,
    catalogItems,
    openings,
    zones: room.zones,
  });
  const blockedPlacementCount = scores.filter((score) => score.kind === "blocks_path").length;
  const crampedPlacementCount = scores.filter((score) => score.kind === "cramped").length;
  const missingAnchorCount = scores.filter((score) => score.relationship === "missing").length;
  const placementScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length)
      : 100;
  const exportIssueCount = room.items.length === 0 ? 1 : 0;
  const hasBlocker =
    blockedPlacementCount > 0 ||
    !circulation.pathValid ||
    shoppingNeedsReviewCount > 0 ||
    exportIssueCount > 0;
  const hasReview =
    crampedPlacementCount > 0 ||
    missingAnchorCount > 0 ||
    circulation.warnings.length > 0 ||
    placementScore < 72;
  const level: RoomHealthLevel = hasBlocker ? "blocked" : hasReview ? "review" : "ready";
  const nextAction =
    blockedPlacementCount > 0 || !circulation.pathValid
      ? "Fix blocked circulation before saving or sharing."
      : crampedPlacementCount > 0
        ? "Preview a room fix for cramped placements."
        : shoppingNeedsReviewCount > 0
          ? "Fix shopping metadata before checkout."
          : exportIssueCount > 0
            ? "Add at least one item before export handoff."
            : missingAnchorCount > 0
              ? "Add or move anchor furniture for better recommendations."
              : "Room is ready for save, share, and export.";

  return {
    roomId: room.id,
    roomName: room.name,
    level,
    placementScore,
    itemCount: room.items.length,
    blockedPlacementCount,
    crampedPlacementCount,
    missingAnchorCount,
    circulationWarningCount: circulation.warnings.length,
    shoppingNeedsReviewCount,
    exportIssueCount,
    nextAction,
  };
}
