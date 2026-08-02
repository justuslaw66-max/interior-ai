"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  useDesignPageSurfaceActions,
  type DesignPageSurfaceActions,
} from "@/lib/useDesignPageSurfaceActions";
import type { DesignPageSurfaceStateActions } from "@/lib/useDesignPageSurfaceStateController";

type SurfaceActionsInput = Parameters<typeof useDesignPageSurfaceActions>[0];
type Track = typeof import("@/lib/analytics").track;

export type UseDesignPageSurfaceWorkspaceFacadeInput = {
  state: {
    document: { activeRoomId: string | null };
    selection: { selectedPlanRoomId: string | null };
    surface: SurfaceActionsInput["state"];
  };
  configuration: SurfaceActionsInput["configuration"];
  refs: {
    designSnapshot: SurfaceActionsInput["adapters"]["designSnapshotRef"];
  };
  actions: {
    document: Pick<
      SurfaceActionsInput["adapters"],
      | "setDesignSnapshot"
      | "runHistoryTransaction"
      | "runCoalescedHistoryTransaction"
    >;
    selection: {
      clearNonRoomSelection: () => void;
      setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
    };
    surfaceState: DesignPageSurfaceStateActions;
    navigation: {
      switchRoom: (roomId: string) => void;
      goPlan: () => void;
    };
    panels: {
      setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
      setDesignPanelCollapsed: Dispatch<SetStateAction<boolean>>;
      inspectorUi: { closeMaterialPicker: () => void };
    };
    feedback: {
      showToast: (message: string) => void;
      track: Track;
    };
  };
};

export type DesignPageSurfaceWorkspaceActions = DesignPageSurfaceActions & {
  openFloorEditorForRoom: (roomId?: string | null) => void;
  openWallMaterialEditorForRoom: (roomId: string, faceId: string) => void;
  openCeilingEditorForRoom: (roomId: string) => void;
};

/** Composes surface mutations with the three editor-opening workflows. */
export function useDesignPageSurfaceWorkspaceFacade({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageSurfaceWorkspaceFacadeInput): {
  derived: { canApplySurfaceBrush: boolean };
  actions: DesignPageSurfaceWorkspaceActions;
} {
  const { activeRoomId } = state.document;
  const { selectedPlanRoomId } = state.selection;
  const { selectedWallSurfaceTarget } = state.surface;
  const {
    clearNonRoomSelection,
    setSelectedPlanRoomId,
  } = actions.selection;
  const {
    setActiveSurfaceTarget,
    setSelectedWallSurfaceTarget,
    requestFinishPanelOpen,
  } = actions.surfaceState;
  const { switchRoom, goPlan } = actions.navigation;
  const {
    setDesignPanelOpen,
    setDesignPanelCollapsed,
    inspectorUi,
  } = actions.panels;
  const { showToast, track } = actions.feedback;

  const openFloorEditorForRoom = useCallback(
    (roomId?: string | null) => {
      const targetRoomId = roomId ?? selectedPlanRoomId ?? activeRoomId;
      if (!targetRoomId) return;

      if (activeRoomId !== targetRoomId) {
        switchRoom(targetRoomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(targetRoomId);
      setActiveSurfaceTarget("floor");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      inspectorUi.closeMaterialPicker();
      requestFinishPanelOpen();
      showToast("Choose a floor material from Surfaces");
      track("floor_finish_editor_opened", {
        roomId: targetRoomId,
        source: "selected_room",
      });
    },
    [
      activeRoomId,
      clearNonRoomSelection,
      goPlan,
      inspectorUi,
      requestFinishPanelOpen,
      selectedPlanRoomId,
      setActiveSurfaceTarget,
      setDesignPanelCollapsed,
      setDesignPanelOpen,
      setSelectedPlanRoomId,
      showToast,
      switchRoom,
      track,
    ]
  );

  const openWallMaterialEditorForRoom = useCallback(
    (roomId: string, faceId: string) => {
      if (activeRoomId !== roomId) {
        switchRoom(roomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(roomId);
      // Opening the material catalog for a mesh-selected panel must not
      // collapse that precise target back to its parent wall face. Doing so
      // caused the next catalog click to write a face override and repaint
      // every panel on the wall.
      setSelectedWallSurfaceTarget((current) =>
        current?.roomId === roomId && current.faceId === faceId
          ? current
          : selectedWallSurfaceTarget?.roomId === roomId &&
              selectedWallSurfaceTarget.faceId === faceId
            ? selectedWallSurfaceTarget
            : { roomId, faceId }
      );
      setActiveSurfaceTarget("selected_wall");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      inspectorUi.closeMaterialPicker();
      requestFinishPanelOpen();
      showToast("Choose a wall finish from Surfaces");
      track("wall_finish_editor_opened", {
        roomId,
        faceId,
        source: "selected_room",
      });
    },
    [
      activeRoomId,
      clearNonRoomSelection,
      goPlan,
      inspectorUi,
      requestFinishPanelOpen,
      setActiveSurfaceTarget,
      setDesignPanelCollapsed,
      setDesignPanelOpen,
      setSelectedPlanRoomId,
      selectedWallSurfaceTarget,
      setSelectedWallSurfaceTarget,
      showToast,
      switchRoom,
      track,
    ]
  );

  const openCeilingEditorForRoom = useCallback(
    (roomId: string) => {
      if (activeRoomId !== roomId) {
        switchRoom(roomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(roomId);
      setSelectedWallSurfaceTarget(null);
      setActiveSurfaceTarget("ceiling");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      inspectorUi.closeMaterialPicker();
      requestFinishPanelOpen();
      showToast("Choose a ceiling paint from Surfaces");
      track("ceiling_finish_editor_opened", {
        roomId,
        source: "selected_ceiling",
      });
    },
    [
      activeRoomId,
      clearNonRoomSelection,
      goPlan,
      inspectorUi,
      requestFinishPanelOpen,
      setActiveSurfaceTarget,
      setDesignPanelCollapsed,
      setDesignPanelOpen,
      setSelectedPlanRoomId,
      setSelectedWallSurfaceTarget,
      showToast,
      switchRoom,
      track,
    ]
  );

  const surfaceActionsController = useDesignPageSurfaceActions({
    state: state.surface,
    configuration,
    adapters: {
      designSnapshotRef: refs.designSnapshot,
      ...actions.document,
      showRuleToast: showToast,
      setActiveSurfaceTarget: actions.surfaceState.setActiveSurfaceTarget,
      setSelectedRendererSurfaceTarget:
        actions.surfaceState.setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget:
        actions.surfaceState.setSelectedWallSurfaceTarget,
      setSurfaceBrushActive: actions.surfaceState.setSurfaceBrushActive,
      setSurfaceBrushMaterialId:
        actions.surfaceState.setSurfaceBrushMaterialId,
      setSurfaceBrushPaint: actions.surfaceState.setSurfaceBrushPaint,
    },
  });

  return {
    derived: {
      canApplySurfaceBrush: surfaceActionsController.canApplySurfaceBrush,
    },
    actions: {
      ...surfaceActionsController.actions,
      openFloorEditorForRoom,
      openWallMaterialEditorForRoom,
      openCeilingEditorForRoom,
    },
  };
}
