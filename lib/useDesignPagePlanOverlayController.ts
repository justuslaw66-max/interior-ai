"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildHouseRoomConnectionChecklist,
  type HousePlan2D,
  type HouseRoomDoorwaySuggestion,
} from "@/lib/design-page-house-plan";
import { getDoorwaySuggestionKey } from "@/lib/design-page-floor-plan-utils";
import {
  getDesignPageOpeningMetricsHistoryLabel,
  normalizeDesignPageOpeningMetrics,
  type DesignPageOpeningMetricsPatch,
} from "@/lib/design-page-opening-metrics";
import { buildEditorScene2D } from "@/lib/design-page-plan-scene";
import type { PlanLayerPresetId } from "@/lib/design-page-types";
import type {
  EditorAnnotation2D,
  FixedElement2D,
  RoomOpening2D,
} from "@/lib/editorScene";
import type { DesignItem } from "@/lib/room-types";
import {
  useDesignPagePlanActions,
  type PlanOverlayCommandId,
} from "@/lib/useDesignPagePlanActions";
import type {
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";

type ItemPlanningBoundsByInstanceId = Record<
  string,
  { w: number; d: number; h: number }
>;

type TrackPlanOverlayAction = (
  eventName: string,
  properties?: Record<string, unknown>
) => void;

export {
  getDesignPageOpeningMetricsHistoryLabel,
  normalizeDesignPageOpeningMetrics,
};
export type {
  DesignPageOpeningMetricsPatch,
  NormalizeDesignPageOpeningMetricsInput,
} from "@/lib/design-page-opening-metrics";

export type DesignPagePlanOverlayControllerState = {
  activeRoomId: string | null;
  activeRoomName?: string;
  housePlanRooms: HousePlan2D["rooms"];
  items: DesignItem[];
  itemPlanningBoundsByInstanceId: ItemPlanningBoundsByInstanceId;
  selectedInstanceId: string | null;
  planAnnotations: EditorAnnotation2D[];
  planOpenings: RoomOpening2D[];
  planFixedElements: FixedElement2D[];
  suppressedDoorwaySuggestionKeys: readonly string[];
};

export type DesignPagePlanOverlayControllerConfiguration = {
  catalogItems: typeof CATALOG_ITEMS;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  planViewWidth: number;
  planViewDepth: number;
};

export type DesignPagePlanOverlayControllerRefs = {
  planOpenings: MutableRefObject<RoomOpening2D[]>;
};

export type DesignPagePlanOverlayControllerActions = {
  setPlanTheme: Dispatch<SetStateAction<PlanTheme>>;
  setPlanLayers: Dispatch<SetStateAction<PlanLayers>>;
  setPlanLayerPreset: Dispatch<SetStateAction<PlanLayerPresetId>>;
  setPlanAnnotations: Dispatch<SetStateAction<EditorAnnotation2D[]>>;
  setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
  setPlanFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
  selectPlanOverlay: (id: string | null) => void;
  runHistoryTransaction: (name: string, action: () => void) => void;
  showToast: (message: string) => void;
  track: TrackPlanOverlayAction;
  canonicalTopology?: {
    moveOpening: (id: string, offsetMeters: number) => boolean;
    resizeOpening: (
      id: string,
      metrics: { widthMeters: number; offsetMeters: number }
    ) => boolean;
    updateOpeningMetrics: (
      id: string,
      metrics: DesignPageOpeningMetricsPatch
    ) => boolean;
  };
};

export type UseDesignPagePlanOverlayControllerInput = {
  state: DesignPagePlanOverlayControllerState;
  configuration: DesignPagePlanOverlayControllerConfiguration;
  refs: DesignPagePlanOverlayControllerRefs;
  actions: DesignPagePlanOverlayControllerActions;
};

export function useDesignPagePlanOverlayController({
  state: {
    activeRoomId,
    activeRoomName,
    housePlanRooms,
    items,
    itemPlanningBoundsByInstanceId,
    selectedInstanceId,
    planAnnotations,
    planOpenings,
    planFixedElements,
    suppressedDoorwaySuggestionKeys,
  },
  configuration: {
    catalogItems,
    roomWidth,
    roomDepth,
    roomHeight,
    planViewWidth,
    planViewDepth,
  },
  refs: { planOpenings: planOpeningsRef },
  actions: {
    setPlanTheme,
    setPlanLayers,
    setPlanLayerPreset,
    setPlanAnnotations,
    setPlanOpenings,
    setPlanFixedElements,
    selectPlanOverlay,
    runHistoryTransaction,
    showToast,
    track,
    canonicalTopology,
  },
}: UseDesignPagePlanOverlayControllerInput) {
  const [annotationToolKind, setAnnotationToolKind] =
    useState<EditorAnnotation2D["kind"]>("note");

  const editorScene2D = useMemo(
    () =>
      buildEditorScene2D({
        roomWidth,
        roomDepth,
        items,
        catalogItems,
        itemPlanningBoundsByInstanceId,
        selectedInstanceId,
        planAnnotations,
        planOpenings,
        planFixedElements,
      }),
    [
      catalogItems,
      itemPlanningBoundsByInstanceId,
      items,
      planAnnotations,
      planFixedElements,
      planOpenings,
      roomDepth,
      roomWidth,
      selectedInstanceId,
    ]
  );

  const {
    pendingAnnotationKind,
    pendingAnnotationText,
    setPendingAnnotationText,
    cancelPlanAnnotation,
    commitPlanAnnotation: commitPlanAnnotationFromPlanAction,
    handleMoveOpening2D: handleMoveOpening2DFromPlanAction,
    handleUpdateOpeningMetrics2D: handleUpdateOpeningMetrics2DFromPlanAction,
    handleAddSuggestedDoorway: handleAddSuggestedDoorwayFromPlanAction,
    handleMoveFixedElement2D,
    handleMoveAnnotation2D,
    runPlanOverlayCommand: runPlanOverlayCommandFromPlanAction,
  } = useDesignPagePlanActions({
    activeRoomName,
    housePlanRooms,
    planOpenings,
    planViewWidth,
    planViewDepth,
    setPlanTheme,
    setPlanLayers,
    setPlanLayerPreset,
    setPlanAnnotations,
    setPlanOpenings,
    setPlanFixedElements,
    onSelectPlanOverlay: selectPlanOverlay,
    showRuleToast: showToast,
    track,
  });

  const handleMoveOpening2D = useCallback(
    (id: string, offsetMeters: number) => {
      if (canonicalTopology?.moveOpening(id, offsetMeters)) return;
      handleMoveOpening2DFromPlanAction(id, offsetMeters);
    },
    [canonicalTopology, handleMoveOpening2DFromPlanAction]
  );

  const commitPlanAnnotation = useCallback(() => {
    if (!pendingAnnotationKind || !pendingAnnotationText.trim()) {
      commitPlanAnnotationFromPlanAction();
      return;
    }
    runHistoryTransaction(
      "Add annotation",
      commitPlanAnnotationFromPlanAction
    );
  }, [
    commitPlanAnnotationFromPlanAction,
    pendingAnnotationKind,
    pendingAnnotationText,
    runHistoryTransaction,
  ]);

  const handleUpdateOpeningMetrics2D = useCallback(
    (id: string, metrics: DesignPageOpeningMetricsPatch) => {
      const currentOpening = planOpeningsRef.current.find(
        (opening) => opening.id === id
      );
      const normalizedMetrics = normalizeDesignPageOpeningMetrics({
        currentOpening,
        metrics,
        roomHeight,
      });
      const historyLabel =
        getDesignPageOpeningMetricsHistoryLabel(normalizedMetrics);

      runHistoryTransaction(historyLabel, () => {
        if (canonicalTopology?.updateOpeningMetrics(id, normalizedMetrics)) return;
        handleUpdateOpeningMetrics2DFromPlanAction(id, normalizedMetrics);
      });
    },
    [
      handleUpdateOpeningMetrics2DFromPlanAction,
      canonicalTopology,
      planOpeningsRef,
      roomHeight,
      runHistoryTransaction,
    ]
  );

  const handleResizeOpening2D = useCallback(
    (
      id: string,
      metrics: { widthMeters: number; offsetMeters: number }
    ) => {
      if (canonicalTopology?.resizeOpening(id, metrics)) return;
      handleUpdateOpeningMetrics2DFromPlanAction(id, metrics);
    },
    [canonicalTopology, handleUpdateOpeningMetrics2DFromPlanAction]
  );

  const runPlanOverlayCommand = useCallback(
    (commandId: PlanOverlayCommandId) => {
      if (commandId.startsWith("preset:")) {
        runHistoryTransaction("Change plan preset", () =>
          runPlanOverlayCommandFromPlanAction(commandId)
        );
        return;
      }
      runPlanOverlayCommandFromPlanAction(commandId);
    },
    [runHistoryTransaction, runPlanOverlayCommandFromPlanAction]
  );

  const applyPlanLayerPresetInTransaction = useCallback(
    (presetId: PlanLayerPresetId) => {
      runPlanOverlayCommandFromPlanAction(`preset:${presetId}`);
    },
    [runPlanOverlayCommandFromPlanAction]
  );

  const selectAnnotationTool = useCallback(
    (kind: EditorAnnotation2D["kind"]) => {
      setAnnotationToolKind(kind);
      runPlanOverlayCommand(`annotation:${kind}`);
    },
    [runPlanOverlayCommand]
  );

  const handleAddSuggestedDoorway = useCallback(
    (suggestion: HouseRoomDoorwaySuggestion) => {
      if (
        suppressedDoorwaySuggestionKeys.includes(
          getDoorwaySuggestionKey(suggestion)
        )
      ) {
        return;
      }
      runHistoryTransaction("Add doorway", () =>
        handleAddSuggestedDoorwayFromPlanAction(suggestion)
      );
    },
    [
      handleAddSuggestedDoorwayFromPlanAction,
      runHistoryTransaction,
      suppressedDoorwaySuggestionKeys,
    ]
  );

  const roomConnectionChecklistItems = useMemo(
    () =>
      buildHouseRoomConnectionChecklist(
        housePlanRooms,
        planOpenings,
        activeRoomId
      ),
    [activeRoomId, housePlanRooms, planOpenings]
  );

  return {
    state: {
      editorScene2D,
      roomConnectionChecklistItems,
      annotationToolKind,
      pendingAnnotationKind,
      pendingAnnotationText,
    },
    actions: {
      setPendingAnnotationText,
      cancelPlanAnnotation,
      commitPlanAnnotation,
      handleMoveOpening2D,
      handleResizeOpening2D,
      handleUpdateOpeningMetrics2D,
      handleAddSuggestedDoorway,
      handleMoveFixedElement2D,
      handleMoveAnnotation2D,
      runPlanOverlayCommand,
      applyPlanLayerPresetInTransaction,
      selectAnnotationTool,
    },
  };
}
