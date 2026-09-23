import { formatDisplayLength, type DisplayUnit } from "@/lib/display-units";
import type { RoomOpening2D } from "@/lib/editorScene";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";

export type DesignSelectionContext = {
  label: string;
  title: string;
  detail: string;
  tone: "plan" | "furnish";
};

type SelectedFurnitureContext = {
  title: string;
  category: string;
} | null;

type SelectedPlanRoomContext = {
  name: string;
  w: number;
  d: number;
} | null;

type BuildDesignSelectionContextParams = {
  selectedFurniture: SelectedFurnitureContext;
  activeRoomName: string;
  planMeasurementUnit: DisplayUnit;
  visiblePlanOpening: RoomOpening2D | null;
  visiblePlanOpeningRoomName: string;
  selectedPlanRoom: SelectedPlanRoomContext;
};

export function buildDesignSelectionContext({
  selectedFurniture,
  activeRoomName,
  planMeasurementUnit,
  visiblePlanOpening,
  visiblePlanOpeningRoomName,
  selectedPlanRoom,
}: BuildDesignSelectionContextParams): DesignSelectionContext | null {
  if (selectedFurniture) {
    return {
      label: "Selected furniture",
      title: selectedFurniture.title,
      detail: `${activeRoomName} - ${selectedFurniture.category}`,
      tone: "furnish",
    };
  }

  if (visiblePlanOpening) {
    return {
      label: visiblePlanOpening.kind === "door" ? "Selected door" : "Selected window",
      title: `${visiblePlanOpening.kind === "door" ? "Door" : "Window"} in ${visiblePlanOpeningRoomName}`,
      detail: `${formatDisplayLength(visiblePlanOpening.widthMm, planMeasurementUnit)} wide`,
      tone: "plan",
    };
  }

  if (selectedPlanRoom) {
    return {
      label: "Selected room",
      title: selectedPlanRoom.name,
      detail: formatPlanDimensionsLabel(selectedPlanRoom.w, selectedPlanRoom.d, planMeasurementUnit),
      tone: "plan",
    };
  }

  return null;
}
