import type { RoomOpening2D } from "@/lib/editorScene";

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
  visiblePlanOpening: RoomOpening2D | null;
  visiblePlanOpeningRoomName: string;
  selectedPlanRoom: SelectedPlanRoomContext;
};

export function buildDesignSelectionContext({
  selectedFurniture,
  activeRoomName,
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
      detail: `${(visiblePlanOpening.widthMm / 1000).toFixed(2)}m wide`,
      tone: "plan",
    };
  }

  if (selectedPlanRoom) {
    return {
      label: "Selected room",
      title: selectedPlanRoom.name,
      detail: `${selectedPlanRoom.w.toFixed(1)} x ${selectedPlanRoom.d.toFixed(1)}m`,
      tone: "plan",
    };
  }

  return null;
}
