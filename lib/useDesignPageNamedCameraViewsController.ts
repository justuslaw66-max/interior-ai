"use client";

import { useCallback, useState } from "react";

import type {
  CameraView,
  NamedCameraView,
} from "@/lib/design-page-types";
import {
  getActiveRoom,
  updateRoom,
  type DesignSnapshot,
  type SavedView,
} from "@/lib/room-types";

type SetDesignSnapshot = (
  next:
    | DesignSnapshot
    | ((previous: DesignSnapshot) => DesignSnapshot)
) => void;

export type BuildDesignPageSavedCameraViewInput = {
  requestedName: string;
  existingViewCount: number;
  idTimestamp: number;
  timestamp: number;
  cameraPosition: CameraView["pos"];
  cameraTarget: CameraView["target"];
};

export function buildDesignPageSavedCameraView({
  requestedName,
  existingViewCount,
  idTimestamp,
  timestamp,
  cameraPosition,
  cameraTarget,
}: BuildDesignPageSavedCameraViewInput): SavedView {
  const fallbackName = `View ${existingViewCount + 1}`;
  const name = requestedName.trim() || fallbackName;

  return {
    id: `view-${idTimestamp}`,
    name,
    cameraPosition: [...cameraPosition],
    cameraTarget: [...cameraTarget],
    timestamp,
  };
}

export function mapDesignPageSavedCameraViewsToLegacy(
  savedViews: readonly SavedView[],
  fov: number | undefined
): NamedCameraView[] {
  return savedViews.map((view) => ({
    name: view.name,
    view: {
      pos: view.cameraPosition,
      target: view.cameraTarget,
      fov,
    },
  }));
}

export function appendDesignPageSavedCameraView(
  savedViews: readonly SavedView[],
  savedView: SavedView,
  maximumSavedViews: number
): SavedView[] {
  return [...savedViews, savedView].slice(-maximumSavedViews);
}

export function removeDesignPageSavedCameraView(
  savedViews: readonly SavedView[],
  viewId: string
): SavedView[] {
  return savedViews.filter((view) => view.id !== viewId);
}

export type DesignPageNamedCameraViewsControllerState = {
  cameraView: CameraView;
};

export type DesignPageNamedCameraViewsControllerConfiguration = {
  maximumSavedViews: number;
  openTransitionDurationMs: number;
};

export type DesignPageNamedCameraViewsControllerRefs = {
  designSnapshot: { current: DesignSnapshot };
};

export type DesignPageNamedCameraViewsControllerActions = {
  setDesignSnapshot: SetDesignSnapshot;
  setLegacySavedViews: (savedViews: NamedCameraView[]) => void;
  showToast: (message: string) => void;
  handleEditorViewModeChange: (viewMode: "3d") => void;
  transitionToCameraView: (cameraView: CameraView, durationMs: number) => void;
};

export type UseDesignPageNamedCameraViewsControllerInput = {
  state: DesignPageNamedCameraViewsControllerState;
  configuration: DesignPageNamedCameraViewsControllerConfiguration;
  refs: DesignPageNamedCameraViewsControllerRefs;
  actions: DesignPageNamedCameraViewsControllerActions;
};

export function useDesignPageNamedCameraViewsController({
  state: { cameraView },
  configuration: { maximumSavedViews, openTransitionDurationMs },
  refs: { designSnapshot: designSnapshotRef },
  actions: {
    setDesignSnapshot,
    setLegacySavedViews,
    showToast,
    handleEditorViewModeChange,
    transitionToCameraView,
  },
}: UseDesignPageNamedCameraViewsControllerInput) {
  const [cameraViewNameInput, setCameraViewNameInput] = useState("");

  const saveCurrentNamedView = useCallback(() => {
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) {
      showToast("Add a room before saving camera views");
      return;
    }

    const savedView = buildDesignPageSavedCameraView({
      idTimestamp: Date.now(),
      requestedName: cameraViewNameInput,
      existingViewCount: room.savedViews?.length ?? 0,
      cameraPosition: cameraView.pos,
      cameraTarget: cameraView.target,
      timestamp: Date.now(),
    });
    const nextRoomViews = appendDesignPageSavedCameraView(
      room.savedViews ?? [],
      savedView,
      maximumSavedViews
    );
    const nextLegacyViews = mapDesignPageSavedCameraViewsToLegacy(
      nextRoomViews,
      cameraView.fov
    );

    setDesignSnapshot((previous) => {
      const currentRoom = getActiveRoom(previous);
      if (!currentRoom) return previous;
      return updateRoom(previous, {
        ...currentRoom,
        savedViews: nextRoomViews,
      });
    });
    setLegacySavedViews(nextLegacyViews);
    setCameraViewNameInput("");
    showToast(`${savedView.name} saved`);
  }, [
    cameraView.fov,
    cameraView.pos,
    cameraView.target,
    cameraViewNameInput,
    designSnapshotRef,
    maximumSavedViews,
    setDesignSnapshot,
    setLegacySavedViews,
    showToast,
  ]);

  const deleteSavedCameraView = useCallback(
    (viewId: string) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextRoomViews = removeDesignPageSavedCameraView(
        room.savedViews ?? [],
        viewId
      );
      const nextLegacyViews = mapDesignPageSavedCameraViewsToLegacy(
        nextRoomViews,
        cameraView.fov
      );

      setDesignSnapshot((previous) => {
        const currentRoom = getActiveRoom(previous);
        if (!currentRoom) return previous;
        return updateRoom(previous, {
          ...currentRoom,
          savedViews: nextRoomViews,
        });
      });
      setLegacySavedViews(nextLegacyViews);
      showToast("Camera view removed");
    },
    [
      cameraView.fov,
      designSnapshotRef,
      setDesignSnapshot,
      setLegacySavedViews,
      showToast,
    ]
  );

  const openSavedCameraView = useCallback(
    (view: SavedView) => {
      handleEditorViewModeChange("3d");
      transitionToCameraView(
        {
          pos: view.cameraPosition,
          target: view.cameraTarget,
          fov: cameraView.fov,
        },
        openTransitionDurationMs
      );
    },
    [
      cameraView.fov,
      handleEditorViewModeChange,
      openTransitionDurationMs,
      transitionToCameraView,
    ]
  );

  return {
    state: { cameraViewNameInput },
    actions: {
      setCameraViewNameInput,
      saveCurrentNamedView,
      deleteSavedCameraView,
      openSavedCameraView,
    },
  };
}
