import {
  rankPlacementRecommendations,
  type PlacementRecommendation,
} from "@/lib/placement-recommendations";
import type { RoomHealthSummary } from "@/lib/room-health-summary";

export type RoomFixPreview = {
  canApply: boolean;
  actionLabel: string;
  requiresLayoutVersionRestore: boolean;
  fixes: PlacementRecommendation[];
  reason: string;
};

export function buildRoomFixPreviewFromRecommendations(
  roomHealth: RoomHealthSummary,
  recommendations: PlacementRecommendation[]
): RoomFixPreview {
  const rankedFixes = rankPlacementRecommendations(recommendations).filter(
    (recommendation) => recommendation.fixesHardInvalid || (recommendation.scoreDelta ?? 0) > 0
  );
  const canApply = roomHealth.level !== "ready" && rankedFixes.length > 0;

  return {
    canApply,
    actionLabel: canApply ? `Preview ${rankedFixes.length} room fix${rankedFixes.length === 1 ? "" : "es"}` : "No room fix available",
    requiresLayoutVersionRestore: true,
    fixes: rankedFixes,
    reason: canApply
      ? roomHealth.nextAction
      : roomHealth.level === "ready"
        ? "Room is already ready."
        : "No safe recommendation is available yet.",
  };
}
