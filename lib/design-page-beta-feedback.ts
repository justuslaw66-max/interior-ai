import type { BetaFeedbackContext } from "@/components/BetaFeedbackWidget";

export type DesignPageBetaFeedbackInput = {
  identity: {
    designId: string | null;
    shareToken: string | null;
  };
  editor: {
    mode: string;
    viewMode: string;
    plan: string;
    saveStatus: string;
    shareEnabled: boolean;
  };
  project: {
    activeRoomName: string;
    roomCount: number;
    itemCount: number;
    openingCount: number;
    exportReadinessScore: number;
  };
  selection: {
    itemId: string | null;
    productId: string | null;
  };
  placement: {
    score: number | null;
    kind: string | null;
    targetRoomName: string | null;
    fallbackRoomName: string | null;
  };
  shopping: {
    readyCount: number;
    needsReviewCount: number;
  };
  viewport: {
    width: number;
    height: number;
  };
};

export function buildDesignPageBetaFeedbackContext({
  identity,
  editor,
  project,
  selection,
  placement,
  shopping,
  viewport,
}: DesignPageBetaFeedbackInput): BetaFeedbackContext {
  return {
    designId: identity.designId,
    shareToken: identity.shareToken,
    mode: editor.mode,
    viewMode: editor.viewMode,
    plan: editor.plan,
    activeRoomName: project.activeRoomName,
    roomCount: project.roomCount,
    itemCount: project.itemCount,
    openingCount: project.openingCount,
    exportReadinessScore: project.exportReadinessScore,
    selectedItemId: selection.itemId,
    selectedItemProductId: selection.productId,
    placementScore: placement.score,
    placementKind: placement.kind,
    shoppingReadyCount: shopping.readyCount,
    shoppingNeedsReviewCount: shopping.needsReviewCount,
    saveStatus: editor.saveStatus,
    shareEnabled: editor.shareEnabled,
    activePlacementTarget:
      placement.targetRoomName ?? placement.fallbackRoomName,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
}
