export type PlacementRecommendationKind =
  | "restore_valid"
  | "improve"
  | "best_room"
  | "best_option"
  | "move_blocker"
  | "swap_blocker"
  | "try_smaller";

export type PlacementRecommendation = {
  id: string;
  kind: PlacementRecommendationKind;
  label: string;
  scoreDelta?: number;
  fixesHardInvalid?: boolean;
  confidence?: number;
  roomId?: string;
  targetItemId?: string;
};

const KIND_PRIORITY: Record<PlacementRecommendationKind, number> = {
  restore_valid: 95,
  move_blocker: 88,
  swap_blocker: 84,
  improve: 78,
  best_room: 72,
  best_option: 68,
  try_smaller: 58,
};

export function rankPlacementRecommendations(
  recommendations: PlacementRecommendation[]
): PlacementRecommendation[] {
  return [...recommendations].sort((left, right) => {
    if (Boolean(left.fixesHardInvalid) !== Boolean(right.fixesHardInvalid)) {
      return left.fixesHardInvalid ? -1 : 1;
    }

    const deltaDiff = (right.scoreDelta ?? 0) - (left.scoreDelta ?? 0);
    if (deltaDiff !== 0) return deltaDiff;

    const priorityDiff = KIND_PRIORITY[right.kind] - KIND_PRIORITY[left.kind];
    if (priorityDiff !== 0) return priorityDiff;

    const confidenceDiff = (right.confidence ?? 0) - (left.confidence ?? 0);
    if (confidenceDiff !== 0) return confidenceDiff;

    return left.label.localeCompare(right.label);
  });
}

export function getPrimaryPlacementRecommendation(
  recommendations: PlacementRecommendation[]
): PlacementRecommendation | null {
  return rankPlacementRecommendations(recommendations)[0] ?? null;
}
