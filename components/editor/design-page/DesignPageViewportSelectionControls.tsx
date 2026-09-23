"use client";

import type { ZoneMin } from "@/lib/room-types";
import { FloorStackControl } from "@/components/editor/design-page/FloorStackControl";
import { MultiSelectionToolbar } from "@/components/editor/design-page/MultiSelectionToolbar";
import { SelectedZoneToolbar } from "@/components/editor/design-page/SelectedZoneToolbar";
import type {
  DesignPageViewportSelectionControlsState as ResolvedViewportSelectionControlsState,
} from "@/lib/design-page-viewport-selection-controls";

export type DesignPageViewportSelectionControlsState =
  ResolvedViewportSelectionControlsState;

export type DesignPageViewportSelectionControlsConfiguration = {
  dark: boolean;
};

export type DesignPageViewportSelectionControlsActions = {
  floorStack: {
    switchFloor: (level: number) => void;
  };
  multiSelection: {
    alignX: () => void;
    alignZ: () => void;
    changeZoneType: (zoneType: ZoneMin["type"]) => void;
    createZone: () => void;
    clear: () => void;
  };
  selectedZone: {
    autoLayout: (zoneId: string) => void;
    rotateQuarterTurn: (zoneId: string) => void;
    ungroup: (zoneId: string) => void;
  };
};

type DesignPageViewportSelectionControlsProps = {
  state: DesignPageViewportSelectionControlsState;
  configuration: DesignPageViewportSelectionControlsConfiguration;
  actions: DesignPageViewportSelectionControlsActions;
};

export function DesignPageViewportSelectionControls({
  state,
  configuration,
  actions,
}: DesignPageViewportSelectionControlsProps) {
  const selectedZone = state.selectedZone;

  return (
    <>
      {state.floorStack && (
        <FloorStackControl
          state={state.floorStack}
          configuration={configuration}
          actions={actions.floorStack}
        />
      )}

      {state.multiSelection && (
        <MultiSelectionToolbar
          state={state.multiSelection}
          configuration={configuration}
          actions={actions.multiSelection}
        />
      )}

      {selectedZone && (
        <SelectedZoneToolbar
          state={{ label: selectedZone.label }}
          configuration={configuration}
          actions={{
            autoLayout: () => actions.selectedZone.autoLayout(selectedZone.id),
            rotate: () =>
              actions.selectedZone.rotateQuarterTurn(selectedZone.id),
            ungroup: () => actions.selectedZone.ungroup(selectedZone.id),
          }}
        />
      )}
    </>
  );
}
