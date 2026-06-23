import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanDrawRoomMode, FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type EditorViewMode = "3d" | "2d";
type PlanStartMode = "start" | "draw" | "upload" | "template";

export type PlanCanvasGuidanceTone = "active" | "blocked" | "ready";
export type PlanCanvasGuidanceAction = "scale" | "addOpening" | "furnish";

export type PlanCanvasGuidance = {
  title: string;
  detail: string;
  label: string;
  tone: PlanCanvasGuidanceTone;
  action?: PlanCanvasGuidanceAction;
};

type ResolvePlanCanvasGuidanceParams = {
  viewMode: EditorViewMode;
  editorMode: DesignPageEditorMode;
  isClientPreview: boolean;
  isDesigner: boolean;
  planStartMode: PlanStartMode;
  floorPlanUnderlay: FloorPlanUnderlay | null;
  floorPlanCalibrationMode: boolean;
  floorPlanCalibrationPointCount: number;
  floorPlanTraceRoomMode: boolean;
  floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
  floorPlanTraceRoomPointCount: number;
  floorPlanTraceOpeningMode: boolean;
  floorPlanTraceOpeningKind: RoomOpening2D["kind"];
  floorPlanTraceOpeningPointCount: number;
  hasRooms: boolean;
  hasOpenings: boolean;
  hasConnectionBlockers: boolean;
  hasFurniture: boolean;
};

function getOpeningLabel(kind: RoomOpening2D["kind"]) {
  return kind === "window" ? "window" : "door";
}

function resolveCalibrationGuidance(pointCount: number): PlanCanvasGuidance {
  if (pointCount >= 2) {
    return {
      title: "Enter scale length",
      detail: "Use the measured distance for the two selected points.",
      label: "Scale",
      tone: "active",
    };
  }

  if (pointCount === 1) {
    return {
      title: "Pick second scale point",
      detail: "Choose the other end of the same measured wall.",
      label: "Scale",
      tone: "active",
    };
  }

  return {
    title: "Set plan scale",
    detail: "Pick two points on a wall with a known real length.",
    label: "Scale",
    tone: "active",
  };
}

function resolveRoomDrawGuidance(params: {
  drawMode: FloorPlanDrawRoomMode;
  pointCount: number;
  hasUnderlay: boolean;
}): PlanCanvasGuidance {
  const { drawMode, pointCount, hasUnderlay } = params;

  if (drawMode === "rectangle_wall") {
    if (pointCount > 0) {
      return {
        title: "Finish room outline",
        detail: "Pick the opposite corner to place the room.",
        label: "Room",
        tone: "active",
      };
    }

    return {
      title: hasUnderlay ? "Trace room outline" : "Draw room outline",
      detail: "Drag from one corner to the opposite corner.",
      label: "Room",
      tone: "active",
    };
  }

  if (drawMode === "arc_wall") {
    if (pointCount >= 2) {
      return {
        title: "Shape the curved wall",
        detail: "Pick the curve point, then close the room outline.",
        label: "Room",
        tone: "active",
      };
    }

    if (pointCount === 1) {
      return {
        title: "Pick curve endpoint",
        detail: "Choose where the curved wall should end.",
        label: "Room",
        tone: "active",
      };
    }

    return {
      title: "Start curved wall",
      detail: "Pick the first point of the room outline.",
      label: "Room",
      tone: "active",
    };
  }

  if (pointCount >= 3) {
    return {
      title: "Close room outline",
      detail: "Click the first corner to finish the room.",
      label: "Room",
      tone: "active",
    };
  }

  if (pointCount > 0) {
    return {
      title: "Trace next wall",
      detail: "Keep placing corners around the room.",
      label: "Room",
      tone: "active",
    };
  }

  return {
    title: hasUnderlay ? "Trace first corner" : "Place first corner",
    detail: "Start at a clean corner of the room outline.",
    label: "Room",
    tone: "active",
  };
}

function resolveOpeningGuidance(params: {
  kind: RoomOpening2D["kind"];
  pointCount: number;
  hasUnderlay: boolean;
}): PlanCanvasGuidance {
  const openingLabel = getOpeningLabel(params.kind);

  if (!params.hasUnderlay) {
    return {
      title: `Place ${openingLabel}`,
      detail: "Click the wall where it belongs.",
      label: "Opening",
      tone: "active",
    };
  }

  if (params.pointCount > 0) {
    return {
      title: `Finish ${openingLabel}`,
      detail: "Pick the other end along the same wall.",
      label: "Opening",
      tone: "active",
    };
  }

  return {
    title: `Trace ${openingLabel}`,
    detail: "Pick one end of the opening on the plan.",
    label: "Opening",
    tone: "active",
  };
}

export function resolvePlanCanvasGuidance(
  params: ResolvePlanCanvasGuidanceParams
): PlanCanvasGuidance | null {
  if (
    params.isClientPreview ||
    params.isDesigner ||
    params.viewMode !== "2d" ||
    params.editorMode !== "design"
  ) {
    return null;
  }

  if (params.floorPlanCalibrationMode) {
    return resolveCalibrationGuidance(params.floorPlanCalibrationPointCount);
  }

  if (params.floorPlanTraceRoomMode) {
    return resolveRoomDrawGuidance({
      drawMode: params.floorPlanDrawRoomMode,
      pointCount: params.floorPlanTraceRoomPointCount,
      hasUnderlay: Boolean(params.floorPlanUnderlay),
    });
  }

  if (params.floorPlanTraceOpeningMode) {
    return resolveOpeningGuidance({
      kind: params.floorPlanTraceOpeningKind,
      pointCount: params.floorPlanTraceOpeningPointCount,
      hasUnderlay: Boolean(params.floorPlanUnderlay),
    });
  }

  if (!params.hasRooms) return null;

  if (params.floorPlanUnderlay && !params.floorPlanUnderlay.calibration) {
    return {
      title: "Set plan scale",
      detail: "Calibrate the upload before tracing rooms from it.",
      label: "Scale",
      tone: "active",
      action: "scale",
    };
  }

  if (params.hasConnectionBlockers) {
    return {
      title: "Add doorway link",
      detail: "Connect adjacent rooms before furnishing the full plan.",
      label: "Fix needed",
      tone: "blocked",
      action: "addOpening",
    };
  }

  if (!params.hasFurniture && !params.hasOpenings) {
    return {
      title: "Room outline ready",
      detail: "Add doors and windows if they matter for furniture placement.",
      label: "Optional",
      tone: "ready",
      action: "addOpening",
    };
  }

  if (!params.hasFurniture) {
    return {
      title: "Ready to furnish",
      detail: "Switch to Furnish when the room outline feels right.",
      label: "Next",
      tone: "ready",
      action: "furnish",
    };
  }

  return null;
}
