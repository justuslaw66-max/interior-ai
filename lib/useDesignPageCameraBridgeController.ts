"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type {
  CameraView,
  NamedCameraView,
} from "@/lib/design-page-types";
import type { FloorActionAdapters } from "@/lib/useFloorManager";
import type { DesignPageCameraNavigationActions } from "@/lib/useDesignPageCameraNavigation";

export type UseDesignPageCameraBridgeControllerInput = {
  configuration: {
    initialCameraView: CameraView;
    initialSavedViews?: NamedCameraView[];
    transitionDurationMs: number;
  };
};

export type DesignPageCameraBridgeNavigationActions = {
  updateProjection: (camera: THREE.Camera | null) => void;
  updateCameraViewFromScene: () => void;
  preserveCameraAfterPlanOverlaySelection: () => void;
  transitionToCameraView: (nextView: CameraView, durationMs?: number) => void;
  prepareCameraForPlanTemplate: () => void;
};

function cloneCameraView(view: CameraView): CameraView {
  return {
    pos: [...view.pos],
    target: [...view.target],
    fov: view.fov,
  };
}

/**
 * Owns camera state and refs that must exist before the navigation controller.
 * Stable delegates let earlier controllers call navigation without changing hook
 * order; the late camera facade binds the real navigation actions synchronously.
 */
export function useDesignPageCameraBridgeController({
  configuration,
}: UseDesignPageCameraBridgeControllerInput) {
  const {
    initialCameraView,
    initialSavedViews = [],
    transitionDurationMs,
  } = configuration;
  const [cameraView, setCameraView] = useState<CameraView>(() =>
    cloneCameraView(initialCameraView)
  );
  const [savedViews, setSavedViews] = useState<NamedCameraView[]>(() => [
    ...initialSavedViews,
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraViewRef = useRef(cameraView);
  const floorCameraViewsRef = useRef<Record<number, CameraView>>({});
  const navigationActionsRef =
    useRef<DesignPageCameraNavigationActions | null>(null);

  const updateProjection = useCallback((camera: THREE.Camera | null) => {
    navigationActionsRef.current?.updateProjection(camera);
  }, []);
  const updateCameraViewFromScene = useCallback(() => {
    navigationActionsRef.current?.updateCameraViewFromScene();
  }, []);
  const preserveCameraAfterPlanOverlaySelection = useCallback(() => {
    navigationActionsRef.current?.preserveCameraAfterPlanOverlaySelection();
  }, []);
  const transitionToCameraView = useCallback(
    (nextView: CameraView, durationMs = transitionDurationMs) => {
      navigationActionsRef.current?.transitionToCameraView(nextView, durationMs);
    },
    [transitionDurationMs]
  );
  const prepareCameraForPlanTemplate = useCallback(() => {
    navigationActionsRef.current?.prepareForPlanTemplate();
  }, []);
  const bindNavigationActions = useCallback(
    (nextActions: DesignPageCameraNavigationActions) => {
      navigationActionsRef.current = nextActions;
    },
    []
  );

  const floorActionAdaptersRef = useRef<FloorActionAdapters>({
    clearNonRoomSelection: () => undefined,
    transitionToCameraView,
    updateCameraViewFromScene,
  });

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  const bindFloorSelectionAction = useCallback(
    (clearNonRoomSelection: () => void) => {
      floorActionAdaptersRef.current = {
        clearNonRoomSelection,
        transitionToCameraView,
        updateCameraViewFromScene,
      };
    },
    [transitionToCameraView, updateCameraViewFromScene]
  );

  const resolveGroundPointFromClient = useCallback(
    (clientX: number, clientY: number): [number, number, number] | null => {
      const canvas = rendererRef.current?.domElement ?? canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return null;

      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1)
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const point = new THREE.Vector3();
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      return raycaster.ray.intersectPlane(groundPlane, point)
        ? [point.x, 0, point.z]
        : null;
    },
    []
  );

  const navigation: DesignPageCameraBridgeNavigationActions = {
    updateProjection,
    updateCameraViewFromScene,
    preserveCameraAfterPlanOverlaySelection,
    transitionToCameraView,
    prepareCameraForPlanTemplate,
  };

  return {
    state: { cameraView, savedViews },
    configuration: { initialCameraView, transitionDurationMs },
    refs: {
      canvas: canvasRef,
      camera: cameraRef,
      controls: controlsRef,
      renderer: rendererRef,
      scene: sceneRef,
      cameraView: cameraViewRef,
      floorCameraViews: floorCameraViewsRef,
      floorActionAdapters: floorActionAdaptersRef,
      navigationActions: navigationActionsRef,
    },
    actions: {
      setCameraView,
      setSavedViews,
      navigation,
      bindNavigationActions,
      bindFloorSelectionAction,
      resolveGroundPointFromClient,
    },
  };
}

export type DesignPageCameraBridgeController = ReturnType<
  typeof useDesignPageCameraBridgeController
>;
