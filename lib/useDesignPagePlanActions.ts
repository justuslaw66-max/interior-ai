"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { metersToMm, type EditorAnnotation2D, type FixedElement2D, type RoomOpening2D } from "@/lib/editorScene";
import type { HousePlan2D, HouseRoomDoorwaySuggestion } from "@/lib/design-page-house-plan";
import {
  PLAN_LAYER_PRESETS,
  type PlanLayerPresetId,
} from "@/lib/design-page-types";
import { createPlanAnnotation } from "@/lib/design-page-plan-scene";
import {
  clampPlanOpeningMetrics,
  movePlanAnnotation,
  movePlanFixedElement,
  PLAN_OPENING_MAX_HEIGHT_METERS,
  PLAN_OPENING_MIN_HEIGHT_METERS,
  updatePlanOpeningMetrics,
} from "@/lib/design-page-plan-overlays";
import {
  clampOpeningToNearestClearInterval,
  validateTracedOpeningPlacement,
} from "@/lib/floor-plan-tracing";
import type { PlanLayers, PlanTheme } from "@/lib/useDesignPagePlanState";

type OpeningMetricsPatch = {
  widthMeters?: number;
  offsetMeters?: number;
  heightMeters?: number;
  bottomMeters?: number;
  kind?: RoomOpening2D["kind"];
};

function clampOpeningHeightMeters(heightMeters: number): number {
  return Math.min(
    Math.max(heightMeters, PLAN_OPENING_MIN_HEIGHT_METERS),
    PLAN_OPENING_MAX_HEIGHT_METERS
  );
}

type TrackPlanAction = (
  eventName: string,
  properties?: Record<string, unknown>
) => void;

type UseDesignPagePlanActionsParams = {
  activeRoomName?: string;
  housePlanRooms: HousePlan2D["rooms"];
  planOpenings: RoomOpening2D[];
  planViewWidth: number;
  planViewDepth: number;
  setPlanTheme: Dispatch<SetStateAction<PlanTheme>>;
  setPlanLayers: Dispatch<SetStateAction<PlanLayers>>;
  setPlanLayerPreset: Dispatch<SetStateAction<PlanLayerPresetId>>;
  setPlanAnnotations: Dispatch<SetStateAction<EditorAnnotation2D[]>>;
  setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
  setPlanFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
  onSelectPlanOverlay: (id: string | null) => void;
  showRuleToast: (label: string) => void;
  track: TrackPlanAction;
};

export type PlanOverlayCommandId =
  | "preset:presentation"
  | "preset:technical"
  | "preset:staging"
  | "annotation:note"
  | "annotation:callout"
  | "annotation:room_tag";

export function useDesignPagePlanActions({
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
  onSelectPlanOverlay,
  showRuleToast,
  track,
}: UseDesignPagePlanActionsParams) {
  const [pendingAnnotationKind, setPendingAnnotationKind] =
    useState<EditorAnnotation2D["kind"] | null>(null);
  const [pendingAnnotationText, setPendingAnnotationText] = useState("");
  const lastOpeningValidationToastRef = useRef<{
    id: string;
    reason: string;
  } | null>(null);

  const showOpeningValidationToast = useCallback(
    (id: string, validation: Exclude<ReturnType<typeof validateTracedOpeningPlacement>, { valid: true }>) => {
      const lastToast = lastOpeningValidationToastRef.current;
      if (lastToast?.id === id && lastToast.reason === validation.reason) return;
      lastOpeningValidationToastRef.current = {
        id,
        reason: validation.reason,
      };
      showRuleToast(validation.label);
    },
    [showRuleToast]
  );

  const clearOpeningValidationToastGuard = useCallback((id: string) => {
    if (lastOpeningValidationToastRef.current?.id === id) {
      lastOpeningValidationToastRef.current = null;
    }
  }, []);

  const applyPlanLayerPreset = useCallback(
    (presetId: PlanLayerPresetId) => {
      const selectedPreset = PLAN_LAYER_PRESETS[presetId];
      setPlanLayerPreset(presetId);
      setPlanTheme(selectedPreset.theme);
      setPlanLayers({ ...selectedPreset.layers });
    },
    [setPlanLayerPreset, setPlanLayers, setPlanTheme]
  );

  const getDefaultAnnotationText = useCallback(
    (kind: EditorAnnotation2D["kind"]) => {
      return kind === "room_tag"
        ? activeRoomName ?? "Living Room"
        : kind === "callout"
          ? "Keep clear"
          : "Main circulation";
    },
    [activeRoomName]
  );

  const addPlanAnnotation = useCallback(
    (kind: EditorAnnotation2D["kind"]) => {
      setPendingAnnotationKind(kind);
      setPendingAnnotationText(getDefaultAnnotationText(kind));
    },
    [getDefaultAnnotationText]
  );

  const cancelPlanAnnotation = useCallback(() => {
    setPendingAnnotationKind(null);
    setPendingAnnotationText("");
  }, []);

  const commitPlanAnnotation = useCallback(() => {
    if (!pendingAnnotationKind) return;
    const text = pendingAnnotationText.trim();
    if (!text) {
      cancelPlanAnnotation();
      return;
    }

    const id = `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nextAnnotation = createPlanAnnotation({ id, kind: pendingAnnotationKind, text });
    setPlanAnnotations((prev) => [...prev, nextAnnotation]);
    onSelectPlanOverlay(id);
    cancelPlanAnnotation();
  }, [
    cancelPlanAnnotation,
    onSelectPlanOverlay,
    pendingAnnotationKind,
    pendingAnnotationText,
    setPlanAnnotations,
  ]);

  const handleMoveOpening2D = useCallback(
    (id: string, offsetMeters: number) => {
      const currentOpening = planOpenings.find((opening) => opening.id === id);
      if (!currentOpening) return;

      const boundedOpening = clampPlanOpeningMetrics(
        {
          ...currentOpening,
          offsetMm: metersToMm(offsetMeters),
        },
        {
          rooms: housePlanRooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        }
      );
      const nextOpening = clampOpeningToNearestClearInterval(
        boundedOpening,
        housePlanRooms,
        currentOpening
      );
      const blockedByWall = boundedOpening.offsetMm !== nextOpening.offsetMm;
      if (blockedByWall) {
        showOpeningValidationToast(id, {
          valid: false,
          reason: "blocked_by_wall",
          label: "Blocked by wall",
        });
      }

      const validation = validateTracedOpeningPlacement(
        nextOpening,
        housePlanRooms,
        planOpenings,
        id
      );
      if (!validation.valid) {
        showOpeningValidationToast(id, validation);
        return;
      }
      if (!blockedByWall) {
        clearOpeningValidationToastGuard(id);
      }

      setPlanOpenings((prev) =>
        prev.map((opening) => (opening.id === id ? nextOpening : opening))
      );
    },
    [
      housePlanRooms,
      planOpenings,
      planViewDepth,
      planViewWidth,
      clearOpeningValidationToastGuard,
      setPlanOpenings,
      showOpeningValidationToast,
    ]
  );

  const handleUpdateOpeningMetrics2D = useCallback(
    (id: string, metrics: OpeningMetricsPatch) => {
      const currentOpening = planOpenings.find((opening) => opening.id === id);
      if (!currentOpening) return;

      const nextOpening = clampPlanOpeningMetrics(
        {
          ...currentOpening,
          widthMm:
            metrics.widthMeters !== undefined
              ? metersToMm(metrics.widthMeters)
              : currentOpening.widthMm,
          offsetMm:
            metrics.offsetMeters !== undefined
              ? metersToMm(metrics.offsetMeters)
              : currentOpening.offsetMm,
          heightMm:
            metrics.heightMeters !== undefined
              ? metersToMm(clampOpeningHeightMeters(metrics.heightMeters))
              : currentOpening.heightMm,
          bottomMm:
            metrics.kind === "door"
              ? 0
              : metrics.bottomMeters !== undefined
                ? metersToMm(Math.max(0, metrics.bottomMeters))
                : currentOpening.bottomMm,
          kind: metrics.kind ?? currentOpening.kind,
        },
        {
          rooms: housePlanRooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        }
      );

      const validation = validateTracedOpeningPlacement(
        nextOpening,
        housePlanRooms,
        planOpenings,
        id
      );
      if (!validation.valid) {
        showOpeningValidationToast(id, validation);
        return;
      }
      clearOpeningValidationToastGuard(id);

      setPlanOpenings((prev) =>
        updatePlanOpeningMetrics(prev, id, metrics, {
          rooms: housePlanRooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        })
      );
    },
    [
      housePlanRooms,
      planOpenings,
      planViewDepth,
      planViewWidth,
      clearOpeningValidationToastGuard,
      setPlanOpenings,
      showOpeningValidationToast,
    ]
  );

  const handleAddSuggestedDoorway = useCallback(
    (suggestion: HouseRoomDoorwaySuggestion) => {
      const id = `opening-${Date.now()}`;
      const offsetMm = metersToMm(suggestion.offsetMeters);
      const widthMm = metersToMm(suggestion.widthMeters);
      const alreadyExists = planOpenings.some(
        (opening) =>
          opening.kind === "door" &&
          opening.roomId === suggestion.roomId &&
          opening.wall === suggestion.wall &&
          Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2)
      );

      if (alreadyExists) {
        showRuleToast("Doorway already exists");
        return;
      }

      setPlanOpenings((prev) => {
        const existing = prev.some(
          (opening) =>
            opening.kind === "door" &&
            opening.roomId === suggestion.roomId &&
            opening.wall === suggestion.wall &&
            Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2)
        );

        if (existing) return prev;

        return [
          ...prev,
          {
            id,
            roomId: suggestion.roomId,
            wall: suggestion.wall,
            kind: "door",
            offsetMm,
            widthMm,
          },
        ];
      });

      onSelectPlanOverlay(id);
      showRuleToast("Doorway added");
      track("floor_plan_suggested_doorway_added", {
        roomId: suggestion.roomId,
        adjacentRoomId: suggestion.adjacentRoomId,
        wall: suggestion.wall,
        widthMm,
      });
    },
    [onSelectPlanOverlay, planOpenings, setPlanOpenings, showRuleToast, track]
  );

  const handleMoveFixedElement2D = useCallback(
    (id: string, xMeters: number, zMeters: number) => {
      setPlanFixedElements((prev) => movePlanFixedElement(prev, id, xMeters, zMeters));
    },
    [setPlanFixedElements]
  );

  const handleMoveAnnotation2D = useCallback(
    (id: string, xMeters: number, zMeters: number) => {
      setPlanAnnotations((prev) => movePlanAnnotation(prev, id, xMeters, zMeters));
    },
    [setPlanAnnotations]
  );

  const runPlanOverlayCommand = useCallback(
    (commandId: PlanOverlayCommandId) => {
      if (commandId === "preset:presentation") {
        applyPlanLayerPreset("presentation");
        return;
      }
      if (commandId === "preset:technical") {
        applyPlanLayerPreset("technical");
        return;
      }
      if (commandId === "preset:staging") {
        applyPlanLayerPreset("staging");
        return;
      }
      if (commandId === "annotation:note") {
        addPlanAnnotation("note");
        return;
      }
      if (commandId === "annotation:callout") {
        addPlanAnnotation("callout");
        return;
      }
      addPlanAnnotation("room_tag");
    },
    [addPlanAnnotation, applyPlanLayerPreset]
  );

  return {
    pendingAnnotationKind,
    pendingAnnotationText,
    setPendingAnnotationText,
    cancelPlanAnnotation,
    commitPlanAnnotation,
    handleMoveOpening2D,
    handleUpdateOpeningMetrics2D,
    handleAddSuggestedDoorway,
    handleMoveFixedElement2D,
    handleMoveAnnotation2D,
    runPlanOverlayCommand,
  };
}
