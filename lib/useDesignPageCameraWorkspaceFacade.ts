"use client";

import type { Dispatch, SetStateAction } from "react";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { CameraView } from "@/lib/design-page-types";
import {
  useDesignPageCameraNavigation,
  type DesignPageCameraNavigationAdapters,
  type DesignPageCameraNavigationConfiguration,
  type DesignPageCameraNavigationState,
} from "@/lib/useDesignPageCameraNavigation";
import type { DesignPageCameraBridgeController } from "@/lib/useDesignPageCameraBridgeController";
import {
  useDesignPageCanvasInteractionController,
  type UseDesignPageCanvasInteractionControllerInput,
} from "@/lib/useDesignPageCanvasInteractionController";

type CanvasInput = UseDesignPageCanvasInteractionControllerInput;
type BridgeRefs = DesignPageCameraBridgeController["refs"];
type BridgeActions = DesignPageCameraBridgeController["actions"];

export type UseDesignPageCameraWorkspaceFacadeInput = {
  state: {
    cameraView: CameraView;
    navigation: Omit<DesignPageCameraNavigationState, "cameraView">;
    canvas: CanvasInput["state"];
  };
  configuration: {
    navigation: DesignPageCameraNavigationConfiguration;
  };
  refs: Pick<
    BridgeRefs,
    "canvas" | "camera" | "controls" | "cameraView"
  >;
  actions: {
    camera: Pick<
      BridgeActions,
      "setCameraView" | "navigation" | "bindNavigationActions"
    >;
    navigation: Omit<DesignPageCameraNavigationAdapters, "setCameraView"> & {
      setViewMode: Dispatch<SetStateAction<EditorViewMode>>;
    };
    canvas: Pick<CanvasInput["actions"], "history">;
  };
};

/**
 * Composes late camera navigation and canvas interaction while the bridge keeps
 * earlier consumers independent of hook order.
 */
export function useDesignPageCameraWorkspaceFacade({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageCameraWorkspaceFacadeInput) {
  const {
    canvas: canvasRef,
    camera: cameraRef,
    controls: controlsRef,
    cameraView: cameraViewRef,
  } = refs;
  const navigationController = useDesignPageCameraNavigation({
    refs: {
      canvasRef,
      cameraRef,
      controlsRef,
      cameraViewRef,
    },
    state: {
      ...state.navigation,
      cameraView: state.cameraView,
    },
    configuration: configuration.navigation,
    actions: {
      ...actions.navigation,
      setCameraView: actions.camera.setCameraView,
    },
  });

  // Earlier delegates must see the current render's actions immediately.
  actions.camera.bindNavigationActions(navigationController.actions);

  const canvasController = useDesignPageCanvasInteractionController({
    state: state.canvas,
    refs: {
      orbitControls: controlsRef,
      cameraAnimating: navigationController.refs.isCameraAnimatingRef,
    },
    actions: {
      history: actions.canvas.history,
      updateCameraViewFromScene:
        actions.camera.navigation.updateCameraViewFromScene,
    },
  });

  return {
    state: {
      navigation: navigationController.state,
      canvas: canvasController.state,
    },
    configuration,
    refs: {
      navigation: navigationController.refs,
      canvas: canvasController.refs,
    },
    actions: {
      navigation: navigationController.actions,
      stableNavigation: actions.camera.navigation,
      canvas: canvasController.actions,
    },
  };
}
