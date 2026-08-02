import type { FloorPlanTool } from "@/components/editor/FloorPlanToolStrip";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type {
  PlanCanvasGuidance,
  PlanCanvasGuidanceAction,
} from "@/lib/plan-canvas-guidance";
import type {
  DesignControlsPanelMode,
  DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";

export type DesignPagePlanCanvasOverlaysState = {
  guidedActionsChoiceVisible: boolean;
  manualQuickActions: {
    activeTool: FloorPlanTool;
    hasUnderlay: boolean;
    calibrationActive: boolean;
    canScale: boolean;
    hasRooms: boolean;
  } | null;
  guidedActionsToggle: {
    enabled: boolean;
    compact: boolean;
  } | null;
  focusControl: {
    mode: "scale" | RoomOpening2D["kind"] | "room";
    progressLabel: string;
    focused: boolean;
    guided: boolean;
    canUndo: boolean;
    canClear: boolean;
  } | null;
  guidance: {
    guidance: PlanCanvasGuidance;
    action: PlanCanvasGuidanceAction | null;
    key: string;
    dismissible: boolean;
  } | null;
  emptyPromptVisible: boolean;
  restoreTools: {
    label: string;
  } | null;
};

export type DesignPagePlanCanvasOverlaysInput = {
  showGuidedActionsToggle: boolean;
  guidedActionsEnabled: boolean;
  activeInteraction: boolean;
  planSettingsLoaded: boolean;
  guidedActionsChoiceSeen: boolean;
  showBetaStart: boolean;
  isClientPreview: boolean;
  isDesigner: boolean;
  viewMode: EditorViewMode;
  editorMode: DesignPageEditorMode;
  designControlsPanelVisible: boolean;
  designControlsPanelMode: DesignControlsPanelMode;
  roomCount: number;
  activeFloorPlanTool: FloorPlanTool;
  floorPlanUnderlay: Pick<FloorPlanUnderlay, "mimeType"> | null;
  floorPlanCalibrationMode: boolean;
  floorPlanCalibrationPointCount: number;
  floorPlanTraceRoomMode: boolean;
  floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
  floorPlanTraceRoomPointCount: number;
  floorPlanTraceOpeningMode: boolean;
  floorPlanTraceOpeningKind: RoomOpening2D["kind"];
  floorPlanTraceOpeningPointCount: number;
  planCanvasFocusActive: boolean;
  planCanvasGuidance: PlanCanvasGuidance | null;
  dismissedPlanCanvasGuidanceKey: string | null;
};

export function resolveDesignPagePlanCanvasOverlaysState({
  showGuidedActionsToggle,
  guidedActionsEnabled,
  activeInteraction,
  planSettingsLoaded,
  guidedActionsChoiceSeen,
  showBetaStart,
  isClientPreview,
  isDesigner,
  viewMode,
  editorMode,
  designControlsPanelVisible,
  designControlsPanelMode,
  roomCount,
  activeFloorPlanTool,
  floorPlanUnderlay,
  floorPlanCalibrationMode,
  floorPlanCalibrationPointCount,
  floorPlanTraceRoomMode,
  floorPlanDrawRoomMode,
  floorPlanTraceRoomPointCount,
  floorPlanTraceOpeningMode,
  floorPlanTraceOpeningKind,
  floorPlanTraceOpeningPointCount,
  planCanvasFocusActive,
  planCanvasGuidance,
  dismissedPlanCanvasGuidanceKey,
}: DesignPagePlanCanvasOverlaysInput): DesignPagePlanCanvasOverlaysState {
  const manualQuickActionsVisible =
    showGuidedActionsToggle && !guidedActionsEnabled && !activeInteraction;
  const guidedActionsChoiceVisible =
    showGuidedActionsToggle &&
    planSettingsLoaded &&
    !guidedActionsChoiceSeen &&
    !activeInteraction &&
    !showBetaStart;
  const emptyPromptVisible =
    !isClientPreview &&
    viewMode === "2d" &&
    roomCount === 0 &&
    !floorPlanTraceRoomMode &&
    !showBetaStart &&
    !guidedActionsChoiceVisible &&
    !manualQuickActionsVisible &&
    !designControlsPanelVisible;
  const restoreToolsVisible =
    !isClientPreview &&
    !isDesigner &&
    !designControlsPanelVisible &&
    !planCanvasFocusActive &&
    !showBetaStart &&
    !emptyPromptVisible &&
    (editorMode === "design" ||
      editorMode === "adjust" ||
      editorMode === "ai");

  const guidanceKey = planCanvasGuidance
    ? `${planCanvasGuidance.tone}:${planCanvasGuidance.title}:${planCanvasGuidance.action ?? "none"}`
    : null;
  const guidanceDismissed =
    Boolean(guidanceKey) && dismissedPlanCanvasGuidanceKey === guidanceKey;
  const visibleGuidance =
    guidedActionsChoiceVisible || guidanceDismissed
      ? null
      : planCanvasGuidance;

  const focusPointCount = floorPlanCalibrationMode
    ? floorPlanCalibrationPointCount
    : floorPlanTraceOpeningMode
      ? floorPlanTraceOpeningPointCount
      : floorPlanTraceRoomPointCount;
  const focusCanUndo =
    floorPlanTraceRoomMode &&
    floorPlanDrawRoomMode === "straight_wall" &&
    floorPlanTraceRoomPointCount > 0;
  const focusCanClear = !focusCanUndo && focusPointCount > 0;
  const focusProgressLabel = floorPlanCalibrationMode
    ? `${Math.min(floorPlanCalibrationPointCount, 2)}/2 points`
    : floorPlanTraceOpeningMode
      ? floorPlanUnderlay
        ? `${Math.min(floorPlanTraceOpeningPointCount, 2)}/2 points`
        : "Pick wall"
      : floorPlanDrawRoomMode === "straight_wall"
        ? `${floorPlanTraceRoomPointCount} corner${floorPlanTraceRoomPointCount === 1 ? "" : "s"}`
        : floorPlanTraceRoomPointCount > 0
          ? "Corner picked"
          : "Ready";

  return {
    guidedActionsChoiceVisible,
    manualQuickActions: manualQuickActionsVisible
      ? {
          activeTool: activeFloorPlanTool,
          hasUnderlay: Boolean(floorPlanUnderlay),
          calibrationActive: floorPlanCalibrationMode,
          canScale: Boolean(floorPlanUnderlay?.mimeType.startsWith("image/")),
          hasRooms: roomCount > 0,
        }
      : null,
    guidedActionsToggle: showGuidedActionsToggle
      ? {
          enabled: guidedActionsEnabled,
          compact: manualQuickActionsVisible,
        }
      : null,
    focusControl: activeInteraction
      ? {
          mode: floorPlanCalibrationMode
            ? "scale"
            : floorPlanTraceOpeningMode
              ? floorPlanTraceOpeningKind
              : "room",
          progressLabel: focusProgressLabel,
          focused: planCanvasFocusActive,
          guided: guidedActionsEnabled,
          canUndo: focusCanUndo,
          canClear: focusCanClear,
        }
      : null,
    guidance:
      visibleGuidance && guidanceKey
        ? {
            guidance: visibleGuidance,
            action:
              visibleGuidance.action && !activeInteraction
                ? visibleGuidance.action
                : null,
            key: guidanceKey,
            dismissible:
              visibleGuidance.tone === "ready" && !activeInteraction,
          }
        : null,
    emptyPromptVisible,
    restoreTools: restoreToolsVisible
      ? {
          label:
            designControlsPanelMode === "ai"
              ? "AI tools"
              : designControlsPanelMode === "furnish"
                ? "Furnish tools"
                : "Plan tools",
        }
      : null,
  };
}
