"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  resolvePlan2DViewFit,
  WHOLE_HOME_FIT_ZOOM_SCALE,
  type Plan2DViewFitOrientation,
} from "@/components/editor/camera/EditorCamera2D";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { CameraView } from "@/lib/design-page-types";
import { track } from "@/lib/analytics";
import {
  applyPlan2DCameraInvariant,
  type Plan2DCameraControls,
} from "@/lib/plan-camera-2d";
import type { DesignItem } from "@/lib/room-types";
import { mapToTopCategory } from "@/lib/catalog/view-builders";

const PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS = 3.2;
const PLAN_2D_WHOLE_HOME_FIT_PADDING_RATIO = 0.24;
const PLAN_3D_WHOLE_HOME_FIT_DISTANCE_SCALE = 0.95;

type PlanFitBounds = {
  centerX: number;
  centerZ: number;
  widthMeters: number;
  depthMeters: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

export type DesignPageCameraNavigationRefs = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  cameraRef: MutableRefObject<THREE.Camera | null>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  cameraViewRef: MutableRefObject<CameraView>;
};

export type DesignPageCameraNavigationState = {
  cameraView: CameraView;
  viewMode: EditorViewMode;
  sceneReady: boolean;
  hasWholeHousePlan: boolean;
  designRoomCount: number;
  rooms: HousePlanRoom2D[];
  items: DesignItem[];
  selectedItem: DesignItem | null;
  selectedProduct: CatalogItemSchema | null;
};

export type DesignPageCameraNavigationConfiguration = {
  defaultCameraView: CameraView;
  designId: string | null;
  viewportSize: ViewportSize;
  planFitBounds: PlanFitBounds;
  planSafeAreaLeftPx: number;
  planSafeAreaRightPx: number;
  planSafeAreaBottomPx: number;
  floatingPlanOverlayStackVisible: boolean;
  floatingPlanOverlayStackWidthPx: number;
  roomHeight: number;
  planViewWidth: number;
  planViewDepth: number;
  min3DPolarAngle: number;
  max3DPolarAngle: number;
};

export type DesignPageCameraNavigationAdapters = {
  setCameraView: Dispatch<SetStateAction<CameraView>>;
  setViewMode: Dispatch<SetStateAction<EditorViewMode>>;
  resetFloorPlanInteraction: (options?: { resetCalibrationDistance?: boolean }) => void;
  showRuleToast: (message: string) => void;
  switchRoom: (roomId: string) => void;
};

export type DesignPageCameraNavigationActions = {
  updateProjection: (camera: THREE.Camera | null) => void;
  updateCameraViewFromScene: () => void;
  preserveCameraAfterPlanOverlaySelection: () => void;
  transitionToCameraView: (nextView: CameraView, durationMs?: number) => void;
  applyQueued3DView: (nextView: CameraView, durationMs?: number, attempt?: number) => void;
  applyPlan2DCameraView: (options?: {
    centerX?: number;
    centerZ?: number;
    fitOrientation?: Plan2DViewFitOrientation;
    widthMeters?: number;
    depthMeters?: number;
    paddingMeters?: number;
  }) => boolean;
  applyQueued2DPlanView: (attempt?: number) => void;
  prepareForPlanTemplate: () => void;
  handleEditorViewModeChange: (next: EditorViewMode) => void;
  handleFitPlanView: () => void;
  handleFitSelectedPlanRoom: (roomId: string) => void;
  focusWholeHomeCameraPoint: (x: number, z: number, durationMs?: number) => void;
  handleWholeHomeMoveTarget: (x: number, z: number) => void;
  handleWholeHomeMoveCamera: (x: number, z: number) => void;
  nudgeWholeHomeCameraForDrag: (event: ThreeEvent<PointerEvent>) => void;
  handleWholeHomeNavigatorZoom: (direction: "in" | "out") => void;
  handleWholeHomeFocusRoom: (roomId: string) => void;
  getWholeHome3DView: () => CameraView;
  getEyeLevelView: () => CameraView;
  getFocusView: () => CameraView;
};

export type DesignPageCameraNavigationController = {
  state: {
    plan2DWholeHomeViewFit: ReturnType<typeof resolvePlan2DViewFit>;
  };
  refs: {
    isCameraAnimatingRef: MutableRefObject<boolean>;
    cameraTransitionTokenRef: MutableRefObject<number>;
    cameraSelectionGuardUntilRef: MutableRefObject<number>;
    last3DViewRef: MutableRefObject<CameraView | null>;
    pending3DViewRef: MutableRefObject<CameraView | null>;
    suppressNext3DViewSaveRef: MutableRefObject<boolean>;
  };
  actions: DesignPageCameraNavigationActions;
};

type UseDesignPageCameraNavigationOptions = {
  refs: DesignPageCameraNavigationRefs;
  state: DesignPageCameraNavigationState;
  configuration: DesignPageCameraNavigationConfiguration;
  actions: DesignPageCameraNavigationAdapters;
};

export function useDesignPageCameraNavigation({
  refs,
  state,
  configuration,
  actions,
}: UseDesignPageCameraNavigationOptions): DesignPageCameraNavigationController {
  const {
    canvasRef,
    cameraRef,
    controlsRef,
    cameraViewRef,
  } = refs;
  const {
    cameraView,
    viewMode,
    sceneReady,
    hasWholeHousePlan,
    designRoomCount,
    rooms,
    items,
    selectedItem,
    selectedProduct,
  } = state;
  const {
    defaultCameraView,
    designId,
    viewportSize,
    planFitBounds,
    planSafeAreaLeftPx,
    planSafeAreaRightPx,
    planSafeAreaBottomPx,
    floatingPlanOverlayStackVisible,
    floatingPlanOverlayStackWidthPx,
    roomHeight,
    planViewWidth,
    planViewDepth,
    min3DPolarAngle,
    max3DPolarAngle,
  } = configuration;
  const {
    setCameraView,
    setViewMode,
    resetFloorPlanInteraction,
    showRuleToast,
    switchRoom,
  } = actions;

  const isCameraAnimatingRef = useRef(false);
  const cameraTransitionTokenRef = useRef(0);
  const cameraSelectionGuardUntilRef = useRef(0);
  const last3DViewRef = useRef<CameraView | null>(null);
  const previousViewModeRef = useRef<EditorViewMode>(viewMode);
  const suppressNext3DViewSaveRef = useRef(false);
  const pending3DViewRef = useRef<CameraView | null>(null);
  const initialWholeHome3DFitKeyRef = useRef<string | null>(null);
  const [wholeHomeFitOrientation, setWholeHomeFitOrientation] =
    useState<Plan2DViewFitOrientation>("auto");

  const wholeHomeNavigationBounds = useMemo(() => {
    if (!rooms.length) {
      return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    rooms.forEach((room) => {
      minX = Math.min(minX, room.x - room.w / 2);
      maxX = Math.max(maxX, room.x + room.w / 2);
      minZ = Math.min(minZ, room.z - room.d / 2);
      maxZ = Math.max(maxZ, room.z + room.d / 2);
    });

    const buffer = Math.max(1.5, Math.max(maxX - minX, maxZ - minZ) * 0.2);
    return {
      minX: minX - buffer,
      maxX: maxX + buffer,
      minZ: minZ - buffer,
      maxZ: maxZ + buffer,
    };
  }, [rooms]);

  const plan2DWholeHomeFitPaddingMeters = Math.max(
    PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS,
    Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) *
      PLAN_2D_WHOLE_HOME_FIT_PADDING_RATIO
  );
  const plan2DWholeHomeViewFit = useMemo(() => {
    const viewportWidthPx = viewportSize.width;
    const viewportHeightPx = viewportSize.height;
    const leftInsetPx = viewportWidthPx >= 768 ? planSafeAreaLeftPx : 0;
    const rightInsetPx = viewportWidthPx >= 768 ? planSafeAreaRightPx : 0;
    const bottomInsetPx = viewportWidthPx < 768 ? planSafeAreaBottomPx : 0;

    return resolvePlan2DViewFit({
      centerX: planFitBounds.centerX,
      centerZ: planFitBounds.centerZ,
      fitOrientation: wholeHomeFitOrientation,
      paddingMeters: plan2DWholeHomeFitPaddingMeters,
      planDepthMeters: planFitBounds.depthMeters,
      planWidthMeters: planFitBounds.widthMeters,
      safeAreaBottomPx: bottomInsetPx,
      safeAreaLeftPx: leftInsetPx,
      safeAreaRightPx: rightInsetPx,
      viewportHeightPx,
      viewportWidthPx,
      zoomScale: WHOLE_HOME_FIT_ZOOM_SCALE,
    });
  }, [
    planFitBounds.centerX,
    planFitBounds.centerZ,
    planFitBounds.depthMeters,
    planFitBounds.widthMeters,
    planSafeAreaBottomPx,
    planSafeAreaLeftPx,
    planSafeAreaRightPx,
    plan2DWholeHomeFitPaddingMeters,
    viewportSize.height,
    viewportSize.width,
    wholeHomeFitOrientation,
  ]);

  const updateProjection = useCallback((camera: THREE.Camera | null) => {
    if (!camera) return;
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      camera.updateProjectionMatrix();
    }
  }, []);

  const updateCameraViewFromScene = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target as THREE.Vector3;
    const perspectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined;
    const next: CameraView = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: perspectiveFov,
    };

    setCameraView((previous) => {
      const [px, py, pz] = previous.pos;
      const [tx, ty, tz] = previous.target;
      const changed =
        Math.abs(px - next.pos[0]) > 0.001 ||
        Math.abs(py - next.pos[1]) > 0.001 ||
        Math.abs(pz - next.pos[2]) > 0.001 ||
        Math.abs(tx - next.target[0]) > 0.001 ||
        Math.abs(ty - next.target[1]) > 0.001 ||
        Math.abs(tz - next.target[2]) > 0.001 ||
        Math.abs((previous.fov ?? 45) - (next.fov ?? 45)) > 0.01;
      return changed ? next : previous;
    });
  }, [cameraRef, controlsRef, setCameraView]);

  const preserveCameraAfterPlanOverlaySelection = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const preservedPosition = camera.position.clone();
    const preservedTarget = (controls.target as THREE.Vector3).clone();
    const preservedUp = camera.up.clone();
    const preservedFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined;
    const preservedZoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : undefined;
    cameraSelectionGuardUntilRef.current = Date.now() + 360;
    cameraTransitionTokenRef.current += 1;

    const restore = () => {
      const currentCamera = cameraRef.current;
      const currentControls = controlsRef.current;
      if (!currentCamera || !currentControls) return;

      cameraTransitionTokenRef.current += 1;
      isCameraAnimatingRef.current = false;
      currentCamera.position.copy(preservedPosition);
      currentCamera.up.copy(preservedUp);
      (currentControls.target as THREE.Vector3).copy(preservedTarget);
      if (currentCamera instanceof THREE.PerspectiveCamera && preservedFov !== undefined) {
        currentCamera.fov = preservedFov;
      }
      if (currentCamera instanceof THREE.OrthographicCamera && preservedZoom !== undefined) {
        currentCamera.zoom = preservedZoom;
      }
      updateProjection(currentCamera);
      currentControls.update();
      updateCameraViewFromScene();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 90);
    window.setTimeout(restore, 180);
  }, [cameraRef, controlsRef, updateCameraViewFromScene, updateProjection]);

  const transitionToCameraView = useCallback(
    (nextView: CameraView, durationMs = 520) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      isCameraAnimatingRef.current = true;
      const transitionToken = cameraTransitionTokenRef.current + 1;
      cameraTransitionTokenRef.current = transitionToken;
      const fromPos = camera.position.clone();
      const fromTarget = (controls.target as THREE.Vector3).clone();
      const toPos = new THREE.Vector3(...nextView.pos);
      const toTarget = new THREE.Vector3(...nextView.target);
      const isPerspective = camera instanceof THREE.PerspectiveCamera;
      const fromFov = isPerspective ? camera.fov : cameraView.fov ?? 45;
      const toFov = nextView.fov ?? fromFov;
      const start = performance.now();

      const tick = (timestamp: number) => {
        if (cameraTransitionTokenRef.current !== transitionToken) {
          isCameraAnimatingRef.current = false;
          return;
        }

        const t = Math.min(1, (timestamp - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(fromPos, toPos, eased);
        (controls.target as THREE.Vector3).lerpVectors(fromTarget, toTarget, eased);
        if (isPerspective) {
          camera.fov = fromFov + (toFov - fromFov) * eased;
        }
        updateProjection(camera);
        controls.update();

        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }

        isCameraAnimatingRef.current = false;
        updateCameraViewFromScene();
      };

      requestAnimationFrame(tick);
    },
    [cameraRef, cameraView.fov, controlsRef, updateCameraViewFromScene, updateProjection]
  );

  const applyQueued3DView = useCallback(
    (nextView: CameraView, durationMs = 420, attempt = 0) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      if (!(camera instanceof THREE.PerspectiveCamera) || !controls) {
        if (attempt < 8) {
          window.requestAnimationFrame(() => {
            applyQueued3DView(nextView, durationMs, attempt + 1);
          });
        }
        return;
      }

      camera.up.set(0, 1, 0);
      transitionToCameraView(nextView, durationMs);
    },
    [cameraRef, controlsRef, transitionToCameraView]
  );

  const getWholeHome3DView = useCallback((): CameraView => {
    const fov = 46;
    const canvas = canvasRef.current;
    const viewportWidthPx = canvas?.clientWidth ?? viewportSize.width;
    const viewportHeightPx = canvas?.clientHeight ?? viewportSize.height;
    const leftInsetPx = viewportWidthPx >= 768 ? planSafeAreaLeftPx : 0;
    const rightInsetPx =
      viewportWidthPx >= 768 && floatingPlanOverlayStackVisible
        ? floatingPlanOverlayStackWidthPx + 32
        : 0;
    const topInsetPx = viewportWidthPx >= 768 ? 96 : 72;
    const bottomInsetPx = viewportWidthPx < 768 ? 96 : 48;
    const effectiveWidthPx = Math.max(320, viewportWidthPx - leftInsetPx - rightInsetPx);
    const effectiveHeightPx = Math.max(260, viewportHeightPx - topInsetPx - bottomInsetPx);
    const aspect = Math.max(0.65, effectiveWidthPx / effectiveHeightPx);
    const verticalFovRad = THREE.MathUtils.degToRad(fov);
    const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * aspect);
    const limitingFovRad = Math.max(
      THREE.MathUtils.degToRad(24),
      Math.min(verticalFovRad, horizontalFovRad)
    );
    const planWidth = Math.max(planFitBounds.widthMeters, 3);
    const planDepth = Math.max(planFitBounds.depthMeters, 3);
    const planRadius =
      Math.sqrt(planWidth * planWidth + planDepth * planDepth) / 2 +
      Math.max(1.2, roomHeight * 0.35);
    const cameraDistance =
      Math.max(9, (planRadius / Math.sin(limitingFovRad / 2)) * 0.74) *
      PLAN_3D_WHOLE_HOME_FIT_DISTANCE_SCALE;
    const direction = new THREE.Vector3(0.62, 0.58, 0.9).normalize();
    const targetY = Math.min(1.1, roomHeight * 0.42);
    const target = new THREE.Vector3(planFitBounds.centerX, targetY, planFitBounds.centerZ);
    const position = target.clone().addScaledVector(direction, cameraDistance);

    const visibleLeftPx = Math.min(viewportWidthPx, Math.max(0, leftInsetPx));
    const visibleRightPx = Math.max(
      visibleLeftPx,
      viewportWidthPx - Math.max(0, rightInsetPx)
    );
    const desiredCenterXPx = (visibleLeftPx + visibleRightPx) / 2;
    const actualAspect = Math.max(0.1, viewportWidthPx / Math.max(1, viewportHeightPx));
    const fitCamera = new THREE.PerspectiveCamera(fov, actualAspect, 0.1, 300);
    fitCamera.position.copy(position);
    fitCamera.lookAt(target);
    fitCamera.updateMatrixWorld();
    fitCamera.updateProjectionMatrix();

    const halfWidth = planWidth / 2;
    const halfDepth = planDepth / 2;
    let projectedMinX = Infinity;
    let projectedMaxX = -Infinity;
    for (const x of [-halfWidth, halfWidth]) {
      for (const y of [0, roomHeight]) {
        for (const z of [-halfDepth, halfDepth]) {
          const projected = new THREE.Vector3(
            planFitBounds.centerX + x,
            y,
            planFitBounds.centerZ + z
          ).project(fitCamera);
          if (!Number.isFinite(projected.x)) continue;
          const screenX = (projected.x * 0.5 + 0.5) * viewportWidthPx;
          projectedMinX = Math.min(projectedMinX, screenX);
          projectedMaxX = Math.max(projectedMaxX, screenX);
        }
      }
    }

    if (Number.isFinite(projectedMinX) && Number.isFinite(projectedMaxX)) {
      const projectedCenterXPx = (projectedMinX + projectedMaxX) / 2;
      const centerDeltaPx = projectedCenterXPx - desiredCenterXPx;
      const horizontalFovActualRad =
        2 * Math.atan(Math.tan(verticalFovRad / 2) * actualAspect);
      const worldMetersPerPx =
        (2 * cameraDistance * Math.tan(horizontalFovActualRad / 2)) /
        Math.max(1, viewportWidthPx);
      const cameraRight = new THREE.Vector3();
      fitCamera.matrixWorld.extractBasis(
        cameraRight,
        new THREE.Vector3(),
        new THREE.Vector3()
      );
      const centerCorrectionMeters = THREE.MathUtils.clamp(
        centerDeltaPx * worldMetersPerPx,
        -planRadius * 0.4,
        planRadius * 0.4
      );
      target.addScaledVector(cameraRight, centerCorrectionMeters);
      position.addScaledVector(cameraRight, centerCorrectionMeters);
    }

    return {
      target: [target.x, target.y, target.z],
      pos: [position.x, position.y, position.z],
      fov,
    };
  }, [
    canvasRef,
    floatingPlanOverlayStackVisible,
    floatingPlanOverlayStackWidthPx,
    planFitBounds.centerX,
    planFitBounds.centerZ,
    planFitBounds.depthMeters,
    planFitBounds.widthMeters,
    planSafeAreaLeftPx,
    roomHeight,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!sceneReady || viewMode !== "3d" || !hasWholeHousePlan) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const fitKey = [
      designId ?? "local",
      rooms.length,
      planFitBounds.widthMeters.toFixed(2),
      planFitBounds.depthMeters.toFixed(2),
      planFitBounds.centerX.toFixed(2),
      planFitBounds.centerZ.toFixed(2),
      Math.round(viewportSize.width / 24),
      Math.round(viewportSize.height / 24),
      Math.round(planSafeAreaLeftPx / 24),
    ].join(":");
    if (initialWholeHome3DFitKeyRef.current === fitKey) return;

    initialWholeHome3DFitKeyRef.current = fitKey;
    if (Date.now() < cameraSelectionGuardUntilRef.current) return;
    last3DViewRef.current = null;
    pending3DViewRef.current = null;
    applyQueued3DView(getWholeHome3DView(), 260);
  }, [
    applyQueued3DView,
    designId,
    getWholeHome3DView,
    hasWholeHousePlan,
    planFitBounds.centerX,
    planFitBounds.centerZ,
    planFitBounds.depthMeters,
    planFitBounds.widthMeters,
    planSafeAreaLeftPx,
    rooms.length,
    sceneReady,
    viewMode,
    viewportSize.height,
    viewportSize.width,
  ]);

  const handleEditorViewModeChange = useCallback(
    (next: EditorViewMode) => {
      if (next === "3d") {
        resetFloorPlanInteraction({ resetCalibrationDistance: false });
        pending3DViewRef.current = hasWholeHousePlan
          ? getWholeHome3DView()
          : defaultCameraView;
      }
      setViewMode(next);
    },
    [defaultCameraView, getWholeHome3DView, hasWholeHousePlan, resetFloorPlanInteraction, setViewMode]
  );

  const prepareForPlanTemplate = useCallback(() => {
    setWholeHomeFitOrientation("normal");
    last3DViewRef.current = null;
    pending3DViewRef.current = null;
    suppressNext3DViewSaveRef.current = true;
  }, []);

  const applyPlan2DCameraView = useCallback(
    ({
      centerX = planFitBounds.centerX,
      centerZ = planFitBounds.centerZ,
      widthMeters = planFitBounds.widthMeters,
      depthMeters = planFitBounds.depthMeters,
      fitOrientation = wholeHomeFitOrientation,
      paddingMeters,
    }: {
      centerX?: number;
      centerZ?: number;
      fitOrientation?: Plan2DViewFitOrientation;
      widthMeters?: number;
      depthMeters?: number;
      paddingMeters?: number;
    } = {}) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!(camera instanceof THREE.OrthographicCamera) || !controls) return false;

      const canvas = canvasRef.current;
      const span = Math.max(widthMeters, depthMeters);
      const viewportWidthPx = canvas?.clientWidth ?? window.innerWidth;
      const viewportHeightPx = canvas?.clientHeight ?? window.innerHeight;
      const leftInsetPx = viewportWidthPx >= 768 ? planSafeAreaLeftPx : 0;
      const rightInsetPx = viewportWidthPx >= 768 ? planSafeAreaRightPx : 0;
      const bottomInsetPx = viewportWidthPx < 768 ? planSafeAreaBottomPx : 0;
      const fitPaddingMeters = paddingMeters ?? plan2DWholeHomeFitPaddingMeters;
      const fitZoomScale = paddingMeters == null ? WHOLE_HOME_FIT_ZOOM_SCALE : 1;
      const fit = resolvePlan2DViewFit({
        centerX,
        centerZ,
        fitOrientation,
        paddingMeters: fitPaddingMeters,
        planDepthMeters: depthMeters,
        planWidthMeters: widthMeters,
        safeAreaBottomPx: bottomInsetPx,
        safeAreaLeftPx: leftInsetPx,
        safeAreaRightPx: rightInsetPx,
        viewportHeightPx,
        viewportWidthPx,
        zoomScale: fitZoomScale,
      });

      applyPlan2DCameraInvariant({
        camera,
        controls: controls as Plan2DCameraControls,
        fit,
        cameraHeightMeters: span + roomHeight + 6,
        updateProjection,
      });
      updateCameraViewFromScene();
      return true;
    },
    [
      cameraRef,
      canvasRef,
      controlsRef,
      planFitBounds.centerX,
      planFitBounds.centerZ,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      planSafeAreaBottomPx,
      planSafeAreaLeftPx,
      planSafeAreaRightPx,
      plan2DWholeHomeFitPaddingMeters,
      roomHeight,
      updateCameraViewFromScene,
      updateProjection,
      wholeHomeFitOrientation,
    ]
  );

  const applyQueued2DPlanView = useCallback(
    (attempt = 0) => {
      if (applyPlan2DCameraView()) return;
      if (attempt >= 10) return;
      window.requestAnimationFrame(() => {
        applyQueued2DPlanView(attempt + 1);
      });
    },
    [applyPlan2DCameraView]
  );

  const handleFitPlanView = useCallback(() => {
    if (viewMode === "2d") {
      applyQueued2DPlanView();
      showRuleToast("Plan fitted");
    } else {
      transitionToCameraView(hasWholeHousePlan ? getWholeHome3DView() : defaultCameraView, 420);
      showRuleToast(hasWholeHousePlan ? "Home fitted" : "Room fitted");
    }

    track("floor_plan_fit_clicked", {
      viewMode,
      roomCount: designRoomCount,
      planWidth: planViewWidth,
      planDepth: planViewDepth,
    });
  }, [
    applyQueued2DPlanView,
    defaultCameraView,
    designRoomCount,
    getWholeHome3DView,
    hasWholeHousePlan,
    planViewDepth,
    planViewWidth,
    showRuleToast,
    transitionToCameraView,
    viewMode,
  ]);

  const handleFitSelectedPlanRoom = useCallback(
    (roomId: string) => {
      const room = rooms.find((entry) => entry.id === roomId);
      if (!room) return;

      const paddedWidth = room.w + 1.4;
      const paddedDepth = room.d + 1.4;

      if (
        !applyPlan2DCameraView({
          centerX: room.x,
          centerZ: room.z,
          fitOrientation: "normal",
          widthMeters: paddedWidth,
          depthMeters: paddedDepth,
          paddingMeters: 1.2,
        })
      ) {
        transitionToCameraView(
          {
            target: [room.x, 0, room.z],
            pos: [
              room.x,
              Math.max(paddedWidth, paddedDepth) + roomHeight + 6,
              room.z + 0.001,
            ],
            fov: 45,
          },
          260
        );
      }

      showRuleToast(`${room.name} fitted`);
      track("floor_plan_fit_selected_room_clicked", { roomId });
    },
    [applyPlan2DCameraView, roomHeight, rooms, showRuleToast, transitionToCameraView]
  );

  const focusWholeHomeCameraPoint = useCallback(
    (x: number, z: number, durationMs = 280) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const currentTarget = controls.target as THREE.Vector3;
      const nextX = Math.max(
        wholeHomeNavigationBounds.minX,
        Math.min(wholeHomeNavigationBounds.maxX, x)
      );
      const nextZ = Math.max(
        wholeHomeNavigationBounds.minZ,
        Math.min(wholeHomeNavigationBounds.maxZ, z)
      );
      const deltaX = nextX - currentTarget.x;
      const deltaZ = nextZ - currentTarget.z;
      const perspectiveFov =
        camera instanceof THREE.PerspectiveCamera
          ? camera.fov
          : cameraView.fov ?? defaultCameraView.fov;

      if (viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: nextX,
            offsetZ: nextZ,
            up: plan2DWholeHomeViewFit.up,
            zoom: camera.zoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
        updateCameraViewFromScene();
        return;
      }

      transitionToCameraView(
        {
          pos: [
            camera.position.x + deltaX,
            camera.position.y,
            camera.position.z + deltaZ,
          ],
          target: [nextX, currentTarget.y, nextZ],
          fov: perspectiveFov,
        },
        durationMs
      );
    },
    [
      cameraRef,
      cameraView.fov,
      controlsRef,
      defaultCameraView.fov,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      plan2DWholeHomeViewFit.up,
      roomHeight,
      transitionToCameraView,
      updateCameraViewFromScene,
      updateProjection,
      viewMode,
      wholeHomeNavigationBounds,
    ]
  );

  const clampWholeHomeNavigatorPoint = useCallback(
    (x: number, z: number) => ({
      x: Math.max(
        wholeHomeNavigationBounds.minX,
        Math.min(wholeHomeNavigationBounds.maxX, x)
      ),
      z: Math.max(
        wholeHomeNavigationBounds.minZ,
        Math.min(wholeHomeNavigationBounds.maxZ, z)
      ),
    }),
    [wholeHomeNavigationBounds]
  );

  const handleWholeHomeMoveTarget = useCallback(
    (x: number, z: number) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const target = controls.target as THREE.Vector3;
      const next = clampWholeHomeNavigatorPoint(x, z);
      const deltaX = next.x - target.x;
      const deltaZ = next.z - target.z;
      if (viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: next.x,
            offsetZ: next.z,
            up: plan2DWholeHomeViewFit.up,
            zoom: camera.zoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
        updateCameraViewFromScene();
        return;
      }
      target.set(next.x, target.y, next.z);
      camera.position.set(
        camera.position.x + deltaX,
        camera.position.y,
        camera.position.z + deltaZ
      );
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [
      cameraRef,
      clampWholeHomeNavigatorPoint,
      controlsRef,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      plan2DWholeHomeViewFit.up,
      roomHeight,
      updateCameraViewFromScene,
      updateProjection,
      viewMode,
    ]
  );

  const handleWholeHomeMoveCamera = useCallback(
    (x: number, z: number) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const next = clampWholeHomeNavigatorPoint(x, z);
      if (viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: next.x,
            offsetZ: next.z,
            up: plan2DWholeHomeViewFit.up,
            zoom: camera.zoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
        updateCameraViewFromScene();
        return;
      }
      camera.position.set(next.x, camera.position.y, next.z);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [
      cameraRef,
      clampWholeHomeNavigatorPoint,
      controlsRef,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      plan2DWholeHomeViewFit.up,
      roomHeight,
      updateCameraViewFromScene,
      updateProjection,
      viewMode,
    ]
  );

  const nudgeWholeHomeCameraForDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!hasWholeHousePlan) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const nativeEvent = event.nativeEvent as PointerEvent | undefined;
      const element = nativeEvent?.target instanceof Element ? nativeEvent.target : null;
      const canvas = element?.closest("canvas");
      if (!nativeEvent || !canvas) return;

      const bounds = canvas.getBoundingClientRect();
      const edge = 72;
      let xDir = 0;
      let zDir = 0;
      if (nativeEvent.clientX < bounds.left + edge) xDir = -1;
      if (nativeEvent.clientX > bounds.right - edge) xDir = 1;
      if (nativeEvent.clientY < bounds.top + edge) zDir = -1;
      if (nativeEvent.clientY > bounds.bottom - edge) zDir = 1;
      if (xDir === 0 && zDir === 0) return;

      const target = controls.target as THREE.Vector3;
      const distance = Math.max(1, camera.position.distanceTo(target));
      const step = Math.max(0.05, Math.min(0.35, distance * 0.012));
      const next = clampWholeHomeNavigatorPoint(
        target.x + xDir * step,
        target.z + zDir * step
      );
      const deltaX = next.x - target.x;
      const deltaZ = next.z - target.z;
      if (Math.abs(deltaX) < 0.001 && Math.abs(deltaZ) < 0.001) return;

      if (viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: next.x,
            offsetZ: next.z,
            up: plan2DWholeHomeViewFit.up,
            zoom: camera.zoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
        updateCameraViewFromScene();
        return;
      }

      target.set(next.x, target.y, next.z);
      camera.position.set(
        camera.position.x + deltaX,
        camera.position.y,
        camera.position.z + deltaZ
      );
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [
      cameraRef,
      clampWholeHomeNavigatorPoint,
      controlsRef,
      hasWholeHousePlan,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      plan2DWholeHomeViewFit.up,
      roomHeight,
      updateCameraViewFromScene,
      updateProjection,
      viewMode,
    ]
  );

  const handleWholeHomeNavigatorZoom = useCallback(
    (direction: "in" | "out") => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const target = controls.target as THREE.Vector3;
      if (viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
        const nextZoom = Math.max(
          8,
          Math.min(420, camera.zoom * (direction === "in" ? 1.18 : 0.82))
        );
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: target.x,
            offsetZ: target.z,
            up: plan2DWholeHomeViewFit.up,
            zoom: nextZoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
        updateCameraViewFromScene();
        track("floor_plan_navigator_zoom_clicked", {
          direction,
          roomCount: rooms.length,
        });
        return;
      }

      const offset = camera.position.clone().sub(target);
      const currentDistance = Math.max(0.001, offset.length());
      const nextDistance = Math.max(
        2.5,
        Math.min(80, currentDistance * (direction === "in" ? 0.82 : 1.18))
      );
      offset.setLength(nextDistance);
      camera.position.copy(target).add(offset);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
      track("floor_plan_navigator_zoom_clicked", {
        direction,
        roomCount: rooms.length,
      });
    },
    [
      cameraRef,
      controlsRef,
      planFitBounds.depthMeters,
      planFitBounds.widthMeters,
      plan2DWholeHomeViewFit.up,
      roomHeight,
      rooms.length,
      updateCameraViewFromScene,
      updateProjection,
      viewMode,
    ]
  );

  const handleWholeHomeFocusRoom = useCallback(
    (roomId: string) => {
      const room = rooms.find((entry) => entry.id === roomId);
      if (!room) return;
      switchRoom(roomId);
      focusWholeHomeCameraPoint(room.x, room.z, 320);
      track("floor_plan_navigator_room_clicked", {
        roomId,
        roomType: room.roomType,
        roomCount: rooms.length,
      });
    },
    [focusWholeHomeCameraPoint, rooms, switchRoom]
  );

  useEffect(() => {
    if (!sceneReady) return;
    const previousViewMode = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;

    if (viewMode === "2d") {
      if (previousViewMode === "3d" && !suppressNext3DViewSaveRef.current) {
        last3DViewRef.current = cameraViewRef.current;
      }
      suppressNext3DViewSaveRef.current = false;
      if (previousViewMode !== "2d") {
        applyQueued2DPlanView();
      }
      return;
    }

    suppressNext3DViewSaveRef.current = false;
    if (Date.now() < cameraSelectionGuardUntilRef.current) {
      pending3DViewRef.current = null;
      return;
    }
    if (pending3DViewRef.current) {
      const pendingView = pending3DViewRef.current;
      pending3DViewRef.current = null;
      applyQueued3DView(pendingView, 420);
      return;
    }

    if (previousViewMode === "2d" && last3DViewRef.current) {
      const restore = last3DViewRef.current;
      last3DViewRef.current = null;
      transitionToCameraView(restore, 420);
    }
  }, [
    applyQueued2DPlanView,
    applyQueued3DView,
    cameraViewRef,
    sceneReady,
    transitionToCameraView,
    viewMode,
  ]);

  useEffect(() => {
    if (!sceneReady || viewMode !== "2d") return;
    applyQueued2DPlanView();
  }, [
    applyQueued2DPlanView,
    planFitBounds.centerX,
    planFitBounds.centerZ,
    planFitBounds.depthMeters,
    planFitBounds.widthMeters,
    plan2DWholeHomeViewFit.orientation,
    sceneReady,
    viewMode,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (viewMode === "2d") {
      if (camera instanceof THREE.OrthographicCamera) {
        applyPlan2DCameraInvariant({
          camera,
          controls: controls as Plan2DCameraControls,
          fit: {
            offsetX: plan2DWholeHomeViewFit.offsetX,
            offsetZ: plan2DWholeHomeViewFit.offsetZ,
            up: plan2DWholeHomeViewFit.up,
            zoom: camera.zoom,
          },
          cameraHeightMeters:
            Math.max(planFitBounds.widthMeters, planFitBounds.depthMeters) + roomHeight + 6,
          updateProjection,
        });
      }
    } else {
      camera.up.set(0, 1, 0);
      controls.minPolarAngle = min3DPolarAngle;
      controls.maxPolarAngle = max3DPolarAngle;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    }

    if (viewMode !== "2d") {
      updateProjection(camera);
      controls.update();
    }
  }, [
    cameraRef,
    controlsRef,
    max3DPolarAngle,
    min3DPolarAngle,
    planFitBounds.centerX,
    planFitBounds.centerZ,
    planFitBounds.depthMeters,
    planFitBounds.widthMeters,
    plan2DWholeHomeViewFit.offsetX,
    plan2DWholeHomeViewFit.offsetZ,
    plan2DWholeHomeViewFit.up,
    roomHeight,
    updateProjection,
    viewMode,
  ]);

  const getEyeLevelView = useCallback((): CameraView => {
    const sofa =
      items.find((item) => {
        const catalogItem = CATALOG_ITEMS[item.productId];
        return catalogItem
          ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa"
          : false;
      }) ?? null;
    if (!sofa) {
      return {
        target: [...defaultCameraView.target],
        pos: [...defaultCameraView.pos],
        fov: defaultCameraView.fov,
      };
    }

    const product = CATALOG_ITEMS[sofa.productId];
    const sofaX = sofa.position?.[0] ?? 0;
    const sofaZ = sofa.position?.[2] ?? 0;
    const targetY = Math.max(0.8, (product.dimsMm.h / 1000) * 0.5);
    const offsetBack = Math.max(2.2, (product.dimsMm.d / 1000) * 2.8);

    return {
      target: [sofaX, targetY, sofaZ],
      pos: [sofaX, 1.5, sofaZ + offsetBack],
      fov: 45,
    };
  }, [defaultCameraView, items]);

  const getFocusView = useCallback((): CameraView => {
    if (!selectedItem || !selectedProduct) {
      return getEyeLevelView();
    }

    const rotation = selectedItem.rotationY ?? 0;
    const normalizedQuarterTurns =
      ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const isOddRot = normalizedQuarterTurns % 2 !== 0;
    const width = isOddRot
      ? selectedProduct.dimsMm.d / 1000
      : selectedProduct.dimsMm.w / 1000;
    const depth = isOddRot
      ? selectedProduct.dimsMm.w / 1000
      : selectedProduct.dimsMm.d / 1000;
    const centerX = selectedItem.position?.[0] ?? 0;
    const centerZ = selectedItem.position?.[2] ?? 0;
    const centerY = Math.max(0.4, (selectedProduct.dimsMm.h / 1000) * 0.52);
    const itemSize = Math.max(width, depth, selectedProduct.dimsMm.h / 1000);
    const distance = Math.max(1.8, Math.min(4.4, itemSize * 2.4));

    return {
      target: [centerX, centerY, centerZ],
      pos: [
        centerX + distance * 0.42,
        centerY + Math.max(0.5, itemSize * 0.45),
        centerZ + distance,
      ],
      fov: 45,
    };
  }, [getEyeLevelView, selectedItem, selectedProduct]);

  return {
    state: {
      plan2DWholeHomeViewFit,
    },
    refs: {
      isCameraAnimatingRef,
      cameraTransitionTokenRef,
      cameraSelectionGuardUntilRef,
      last3DViewRef,
      pending3DViewRef,
      suppressNext3DViewSaveRef,
    },
    actions: {
      updateProjection,
      updateCameraViewFromScene,
      preserveCameraAfterPlanOverlaySelection,
      transitionToCameraView,
      applyQueued3DView,
      applyPlan2DCameraView,
      applyQueued2DPlanView,
      prepareForPlanTemplate,
      handleEditorViewModeChange,
      handleFitPlanView,
      handleFitSelectedPlanRoom,
      focusWholeHomeCameraPoint,
      handleWholeHomeMoveTarget,
      handleWholeHomeMoveCamera,
      nudgeWholeHomeCameraForDrag,
      handleWholeHomeNavigatorZoom,
      handleWholeHomeFocusRoom,
      getWholeHome3DView,
      getEyeLevelView,
      getFocusView,
    },
  };
}
