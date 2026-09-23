"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignItem } from "@/lib/room-types";
import type { SurfaceSettingsPatch } from "@/lib/surface-settings";
import type { SurfaceTargetMode } from "@/lib/useDesignPageSurfaceActions";

export type DesignPagePanelActionsState = {
  activeRoomId: string | null;
  activeSurfaceTarget: SurfaceTargetMode;
  selectedWallFaceId: string | null;
  items: DesignItem[];
};

export type DesignPagePanelActionAdapters = {
  setClientPreview: Dispatch<SetStateAction<boolean>>;
  setDesignPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
  setShowGrid: Dispatch<SetStateAction<boolean>>;
  setSnapEnabled: Dispatch<SetStateAction<boolean>>;
  setItemCartOpen: Dispatch<SetStateAction<boolean>>;
  changeViewMode: (viewMode: EditorViewMode) => void;
  runAiLayout: (options?: {
    requestedRoles?: AiLayoutRole[];
  }) => void | Promise<unknown>;
  regenerateAiLayout: (
    requestedRoles?: AiLayoutRole[]
  ) => void | Promise<unknown>;
  changeWallSurfaceSettings: (
    patch: SurfaceSettingsPatch,
    roomId?: string | null,
    faceId?: string | null
  ) => void;
  resetWallSurface: (
    roomId?: string | null,
    faceId?: string | null
  ) => void;
  resetCeilingSurface: (roomId?: string | null) => void;
  commitItems: (
    updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
    actionName?: string
  ) => void;
  updateSelection: (
    selectedIds: Set<string>,
    primaryId: string | null
  ) => void;
};

export type UseDesignPagePanelActionsInput = {
  state: DesignPagePanelActionsState;
  refs: {
    selectedIds: MutableRefObject<Set<string>>;
    primaryId: MutableRefObject<string | null>;
  };
  actions: DesignPagePanelActionAdapters;
};

export function resolveDesignPageActiveWallFaceId(
  activeSurfaceTarget: SurfaceTargetMode,
  selectedWallFaceId: string | null
) {
  return activeSurfaceTarget === "selected_wall" ? selectedWallFaceId : null;
}

export function useDesignPagePanelActions({
  state,
  refs,
  actions,
}: UseDesignPagePanelActionsInput) {
  const {
    setClientPreview,
    setDesignPanelCollapsed,
    setDesignPanelOpen,
    setShowGrid,
    setSnapEnabled,
    setItemCartOpen,
    changeViewMode,
    runAiLayout: runAiLayoutAction,
    regenerateAiLayout: regenerateAiLayoutAction,
    changeWallSurfaceSettings,
    resetWallSurface,
    resetCeilingSurface,
    commitItems,
    updateSelection,
  } = actions;
  const exitClientPreview = useCallback(() => {
    setClientPreview(false);
  }, [setClientPreview]);

  const changeDesignPanelCollapsed = useCallback(
    (collapsed: boolean) => {
      setDesignPanelCollapsed(collapsed);
      if (!collapsed) setDesignPanelOpen(true);
    },
    [setDesignPanelCollapsed, setDesignPanelOpen]
  );

  const toggleGrid = useCallback(() => {
    setShowGrid((visible) => !visible);
  }, [setShowGrid]);

  const toggleSnap = useCallback(() => {
    setSnapEnabled((enabled) => !enabled);
  }, [setSnapEnabled]);

  const toggleItemCart = useCallback(() => {
    setItemCartOpen((open) => !open);
  }, [setItemCartOpen]);

  const goView3D = useCallback(() => {
    changeViewMode("3d");
  }, [changeViewMode]);

  const runAiLayout = useCallback(
    (requestedRoles?: AiLayoutRole[]) => {
      void runAiLayoutAction({ requestedRoles });
    },
    [runAiLayoutAction]
  );

  const regenerateAiLayout = useCallback(
    (requestedRoles?: AiLayoutRole[]) => {
      void regenerateAiLayoutAction(requestedRoles);
    },
    [regenerateAiLayoutAction]
  );

  const changeActiveWallSurfaceSettings = useCallback(
    (patch: SurfaceSettingsPatch) => {
      changeWallSurfaceSettings(
        patch,
        state.activeRoomId,
        resolveDesignPageActiveWallFaceId(
          state.activeSurfaceTarget,
          state.selectedWallFaceId
        )
      );
    },
    [
      changeWallSurfaceSettings,
      state.activeRoomId,
      state.activeSurfaceTarget,
      state.selectedWallFaceId,
    ]
  );

  const resetActiveWallSurface = useCallback(() => {
    resetWallSurface(
      state.activeRoomId,
      resolveDesignPageActiveWallFaceId(
        state.activeSurfaceTarget,
        state.selectedWallFaceId
      )
    );
  }, [
    resetWallSurface,
    state.activeRoomId,
    state.activeSurfaceTarget,
    state.selectedWallFaceId,
  ]);

  const resetActiveCeilingSurface = useCallback(() => {
    resetCeilingSurface(state.activeRoomId);
  }, [resetCeilingSurface, state.activeRoomId]);

  const removeShoppingItem = useCallback(
    (instanceId: string) => {
      const removedItem = state.items.find(
        (item) => item.instanceId === instanceId
      );
      const productName = removedItem
        ? CATALOG_ITEMS[removedItem.productId]?.title || "Item"
        : "Item";
      commitItems(
        (previous) =>
          previous.filter((item) => item.instanceId !== instanceId),
        `Delete ${productName}`
      );

      if (!refs.selectedIds.current.has(instanceId)) return;
      const next = new Set(refs.selectedIds.current);
      next.delete(instanceId);
      const nextPrimary =
        refs.primaryId.current === instanceId
          ? next.size
            ? Array.from(next)[next.size - 1]
            : null
          : refs.primaryId.current;
      updateSelection(next, nextPrimary);
    },
    [commitItems, refs.primaryId, refs.selectedIds, state.items, updateSelection]
  );

  return {
    actions: {
      exitClientPreview,
      changeDesignPanelCollapsed,
      toggleGrid,
      toggleSnap,
      toggleItemCart,
      goView3D,
      runAiLayout,
      regenerateAiLayout,
      changeActiveWallSurfaceSettings,
      resetActiveWallSurface,
      resetActiveCeilingSurface,
      removeShoppingItem,
    },
  };
}
