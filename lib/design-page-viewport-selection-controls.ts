import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  getFloorAccentColor,
  type FloorOption,
} from "@/lib/floor-manager-logic";
import { getZoneLabel } from "@/lib/design-page-zone-layout";
import type { ZoneMin } from "@/lib/room-types";

export type DesignPageViewportSelectionControlsState = {
  floorStack: {
    floors: Array<{
      level: number;
      label: string;
      active: boolean;
      hidden: boolean;
      accentColor: string;
    }>;
  } | null;
  multiSelection: {
    count: number;
    zoneType: ZoneMin["type"];
  } | null;
  selectedZone: {
    id: string;
    label: string;
  } | null;
};

export type DesignPageViewportSelectionControlsInput = {
  viewMode: EditorViewMode;
  stackedFloorView: boolean;
  floorOptions: FloorOption[];
  activeFloorLevel: number;
  hiddenFloorLevels: number[];
  selectedCount: number;
  pendingZoneType: ZoneMin["type"];
  selectedZone: Pick<ZoneMin, "id" | "type"> | null;
  isClientPreview: boolean;
};

export function resolveDesignPageViewportSelectionControlsState({
  viewMode,
  stackedFloorView,
  floorOptions,
  activeFloorLevel,
  hiddenFloorLevels,
  selectedCount,
  pendingZoneType,
  selectedZone,
  isClientPreview,
}: DesignPageViewportSelectionControlsInput): DesignPageViewportSelectionControlsState {
  return {
    floorStack:
      viewMode === "3d" &&
      stackedFloorView &&
      floorOptions.length > 1 &&
      !isClientPreview
        ? {
            floors: floorOptions.map((option) => ({
              level: option.level,
              label: option.label,
              active: option.level === activeFloorLevel,
              hidden: hiddenFloorLevels.includes(option.level),
              accentColor: getFloorAccentColor(option.level),
            })),
          }
        : null,
    multiSelection:
      selectedCount > 1 && !isClientPreview
        ? {
            count: selectedCount,
            zoneType: pendingZoneType,
          }
        : null,
    selectedZone:
      selectedZone && !isClientPreview
        ? {
            id: selectedZone.id,
            label: getZoneLabel(selectedZone.type),
          }
        : null,
  };
}
