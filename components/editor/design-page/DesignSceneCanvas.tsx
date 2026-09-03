"use client";
/* eslint-disable react-hooks/refs -- This shell intentionally forwards grouped ref objects to Three.js bridge components. */
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid } from "@react-three/drei/core/Grid";
import { MapControls } from "@react-three/drei/core/MapControls";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import { instrumentGLBMainThreadRenderer } from "@/components/scene/glb-scaled-model/glbMainThreadTelemetryFacade";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import EditorCamera2D, {
  WHOLE_HOME_FIT_ZOOM_SCALE,
  type Plan2DViewFitOrientation,
} from "@/components/editor/camera/EditorCamera2D";
import {
  Plan2DCameraInvariantGuard,
  type Plan2DCameraDiagnostics,
} from "@/components/editor/camera/Plan2DCameraInvariantGuard";
import { CameraCapture } from "@/components/scene/FurnitureItem";
import { LoadingOverlay } from "@/components/scene/LoadingOverlay";
import { RoomSkeleton } from "@/components/scene/RoomSkeleton";
import { ScenePerformanceBridge } from "@/components/scene/ScenePerformanceBridge";
import { SceneProgressBridge } from "@/components/scene/SceneProgressBridge";
import {
  LightingSystem,
  resolveEditorLighting,
  selectFixtureLightBudget,
  selectWindowLightBudget,
  type LightingMode,
} from "@/components/editor/design-page/lighting";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import type { CameraView } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignLightingSettings } from "@/lib/lightingPresets";
import type { Plan2DCameraInvariantFit } from "@/lib/plan-camera-2d";
import { resolveLightingScene } from "@/lib/resolve-lighting-scene";
import type { SceneRendererMetrics } from "@/lib/scene-performance-metrics";

type ScenePerformanceMode = "auto" | "quality" | "lite";

type DesignSceneCanvasState = {
  viewMode: EditorViewMode;
  isClientPreview: boolean;
  liteSceneEnabled: boolean;
  showSceneLoadingVeil: boolean;
  scenePerformanceMode: ScenePerformanceMode;
  controlsEnabled: boolean;
  cameraY: number;
  planDiagnostics: Plan2DCameraDiagnostics;
};

type DesignSceneCanvasConfiguration = {
  cursor: CSSProperties["cursor"];
  backgroundColor: string;
  lightingSettings: DesignLightingSettings;
  lightingItems: SceneRoomItemEntry[];
  lightingOpenings: RoomOpening2D[];
  activeRoomId: string;
  selectedItemIds: ReadonlySet<string>;
  lightingModeOverride?: LightingMode;
  initialCameraView: CameraView;
  planFit: Plan2DCameraInvariantFit & {
    orientation: Plan2DViewFitOrientation;
  };
  planBounds: {
    widthMeters: number;
    depthMeters: number;
    centerX: number;
    centerZ: number;
    roomHeight: number;
  };
  presentationBounds?: {
    widthMeters: number;
    depthMeters: number;
    centerX: number;
    centerZ: number;
  };
  planSafeArea: {
    leftPx: number;
    rightPx: number;
    bottomPx: number;
  };
  planRooms: HousePlanRoom2D[];
  orbit: {
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
  };
};

type DesignSceneCanvasRefs = {
  canvas: MutableRefObject<HTMLCanvasElement | null>;
  camera: MutableRefObject<THREE.Camera | null>;
  controls: MutableRefObject<OrbitControlsImpl | null>;
  renderer: MutableRefObject<THREE.WebGLRenderer | null>;
  scene: MutableRefObject<THREE.Scene | null>;
};

type DesignSceneCanvasActions = {
  onClearSelection: () => void;
  onPlanDiagnosticsChange: (diagnostics: Plan2DCameraDiagnostics) => void;
  updateProjection: (camera: THREE.Camera | null) => void;
  onSceneProgressReadyChange: (ready: boolean) => void;
  onFpsSample: (fps: number) => void;
  onRendererSample: (metrics: SceneRendererMetrics) => void;
  onSustainedLowFps: (fps: number) => void;
  onOrbitChange: () => void;
};

type DesignSceneCanvasProps = {
  state: DesignSceneCanvasState;
  configuration: DesignSceneCanvasConfiguration;
  sceneRefs: DesignSceneCanvasRefs;
  actions: DesignSceneCanvasActions;
  children: ReactNode;
};

const QUALITY_SHADOW_FILTER = "percentage";
const MIN_SHADOW_CAMERA_HALF_SPAN_METERS = 8;
const MAX_SHADOW_CAMERA_HALF_SPAN_METERS = 32;
const SHADOW_CAMERA_PADDING_METERS = 3;
const WORKSPACE_GRID_CELL_SIZE_METERS = 0.2;
const WORKSPACE_GRID_SECTION_SIZE_METERS = 1;
const WORKSPACE_GRID_MIN_SIZE_METERS = 160;
const WORKSPACE_GRID_PLAN_PADDING_METERS = 60;
const WORKSPACE_GRID_FADE_DISTANCE_METERS = 80;
const WORKSPACE_GRID_FLOOR_Y_METERS = -0.1;
const WORKSPACE_GRID_CAMERA_SWITCH_Y_METERS = -0.05;
const WORKSPACE_GRID_CEILING_CLEARANCE_METERS = 0.15;

type WorkspacePlanningGridProps = {
  centerX: number;
  centerZ: number;
  ceilingY: number;
  shadowsEnabled: boolean;
  size: number;
};
// Controls and product state invalidate the canvas when visual work is required.
// Keeping the idle scene on the same demand-driven contract prevents a loaded
// design from monopolizing the browser main thread between interactions.
const DESIGN_SCENE_FRAMELOOP = "demand";

function WorkspacePlanningGrid({
  centerX,
  centerZ,
  ceilingY,
  shadowsEnabled,
  size,
}: WorkspacePlanningGridProps) {
  const floorGridRef = useRef<THREE.Group>(null);
  const ceilingGridRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const showCeilingGrid =
      camera.position.y < WORKSPACE_GRID_CAMERA_SWITCH_Y_METERS;

    if (floorGridRef.current) {
      floorGridRef.current.visible = !showCeilingGrid;
    }
    if (ceilingGridRef.current) {
      ceilingGridRef.current.visible = showCeilingGrid;
    }
  });

  return (
    <>
      <group ref={floorGridRef} name="workspace-floor-grid">
        <mesh
          position={[centerX, WORKSPACE_GRID_FLOOR_Y_METERS, centerZ]}
          rotation-x={-Math.PI / 2}
          raycast={() => null}
        >
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial color="#f3f5f5" toneMapped={false} />
        </mesh>
        <mesh
          position={[
            centerX,
            WORKSPACE_GRID_FLOOR_Y_METERS + 0.005,
            centerZ,
          ]}
          rotation-x={-Math.PI / 2}
          receiveShadow={shadowsEnabled}
          raycast={() => null}
        >
          <planeGeometry args={[size, size]} />
          <shadowMaterial
            color="#66736f"
            opacity={shadowsEnabled ? 0.08 : 0}
            transparent
          />
        </mesh>
        <Grid
          args={[size, size]}
          position={[
            centerX,
            WORKSPACE_GRID_FLOOR_Y_METERS + 0.01,
            centerZ,
          ]}
          cellSize={WORKSPACE_GRID_CELL_SIZE_METERS}
          cellThickness={0.45}
          cellColor="#ffffff"
          sectionSize={WORKSPACE_GRID_SECTION_SIZE_METERS}
          sectionThickness={0.8}
          sectionColor="#ffffff"
          fadeDistance={WORKSPACE_GRID_FADE_DISTANCE_METERS}
          fadeStrength={1.35}
          fadeFrom={1}
          followCamera={false}
          infiniteGrid={false}
          side={THREE.DoubleSide}
          material-depthTest
          material-depthWrite={false}
          material-toneMapped={false}
          raycast={() => null}
        />
      </group>

      <group
        ref={ceilingGridRef}
        name="workspace-ceiling-grid"
        visible={false}
      >
        <mesh
          position={[centerX, ceilingY + 0.005, centerZ]}
          rotation-x={-Math.PI / 2}
          raycast={() => null}
        >
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial
            color="#f3f5f5"
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <Grid
          args={[size, size]}
          position={[centerX, ceilingY, centerZ]}
          cellSize={WORKSPACE_GRID_CELL_SIZE_METERS}
          cellThickness={0.45}
          cellColor="#ffffff"
          sectionSize={WORKSPACE_GRID_SECTION_SIZE_METERS}
          sectionThickness={0.8}
          sectionColor="#ffffff"
          fadeDistance={WORKSPACE_GRID_FADE_DISTANCE_METERS}
          fadeStrength={1.35}
          fadeFrom={1}
          followCamera={false}
          infiniteGrid={false}
          side={THREE.DoubleSide}
          material-depthTest
          material-depthWrite={false}
          material-toneMapped={false}
          raycast={() => null}
        />
      </group>
    </>
  );
}

export function DesignSceneCanvas({
  state,
  configuration,
  sceneRefs,
  actions,
  children,
}: DesignSceneCanvasProps) {
  const [clientHydrated, setClientHydrated] = useState(false);
  useEffect(() => {
    setClientHydrated(true);
  }, []);

  const { planBounds } = configuration;
  const presentationBounds =
    configuration.presentationBounds ?? configuration.planBounds;
  const shadowCameraHalfSpan = Math.min(
    MAX_SHADOW_CAMERA_HALF_SPAN_METERS,
    Math.max(
      MIN_SHADOW_CAMERA_HALF_SPAN_METERS,
      Math.max(
        presentationBounds.widthMeters,
        presentationBounds.depthMeters
      ) /
        2 +
        SHADOW_CAMERA_PADDING_METERS
    )
  );
  const workspaceGridSize = Math.max(
    WORKSPACE_GRID_MIN_SIZE_METERS,
    Math.ceil(
      Math.max(
        presentationBounds.widthMeters,
        presentationBounds.depthMeters
      ) + WORKSPACE_GRID_PLAN_PADDING_METERS
    )
  );
  const workspaceGridCeilingY =
    planBounds.roomHeight + WORKSPACE_GRID_CEILING_CLEARANCE_METERS;
  const { planDiagnostics, viewMode } = state;
  const controlsRef = sceneRefs.controls;
  const physicalLightingScene = useMemo(
    () =>
      resolveLightingScene({
        settings: configuration.lightingSettings,
        rooms: configuration.planRooms,
        openings: configuration.lightingOpenings,
        items: configuration.lightingItems,
        qualityMode: state.scenePerformanceMode,
        liteEnabled: state.liteSceneEnabled,
        activeRoomId: configuration.activeRoomId,
      }),
    [
      configuration.activeRoomId,
      configuration.lightingItems,
      configuration.lightingOpenings,
      configuration.lightingSettings,
      configuration.planRooms,
      state.liteSceneEnabled,
      state.scenePerformanceMode,
    ]
  );
  const lighting = resolveEditorLighting(configuration.lightingSettings, {
    performanceMode: state.scenePerformanceMode,
    liteEnabled: state.liteSceneEnabled,
    modeOverride: configuration.lightingModeOverride,
    physicalScene: physicalLightingScene,
  });
  const effectiveShadowsEnabled =
    viewMode === "3d" && lighting.shadows.enabled;
  const fixtureLights = useMemo(() => {
    if (!lighting.fixtures.enabled) return [];

    return physicalLightingScene.fixtures.map((fixture) => ({
      ...fixture,
      priority:
        (configuration.selectedItemIds.has(fixture.id) ? 1_000 : 0) +
        (fixture.roomId === configuration.activeRoomId ? 100 : 0) +
        (fixture.verification === "photometric" ? 20 : 0),
    }));
  }, [
    configuration.activeRoomId,
    configuration.selectedItemIds,
    lighting.fixtures.enabled,
    physicalLightingScene.fixtures,
  ]);
  const windowLights = useMemo(() => {
    if (!lighting.windows.enabled) return [];

    return physicalLightingScene.windows.map((window) => ({
      ...window,
      priority:
        (window.roomId === configuration.activeRoomId ? 100 : 0) +
        (window.estimatedMeasurements ? 0 : 20),
    }));
  }, [
    configuration.activeRoomId,
    lighting.windows.enabled,
    physicalLightingScene.windows,
  ]);
  const activeFixtureLights = selectFixtureLightBudget(
    fixtureLights,
    lighting
  );
  const activeWindowLights = selectWindowLightBudget(windowLights, lighting);
  const activeLightCount =
    (lighting.ambient.enabled ? 1 : 0) +
    (lighting.sun.enabled ? 1 : 0) +
    activeWindowLights.length +
    activeFixtureLights.length;
  const shadowCastingLightCount =
    (lighting.sun.enabled &&
    lighting.sun.castShadow &&
    lighting.shadows.enabled
      ? 1
      : 0) +
    activeFixtureLights.filter((fixture) => fixture.castShadow).length;

  return (
    <CanvasErrorBoundary>
      <Canvas
        data-testid="scene-canvas"
        data-client-hydrated={clientHydrated ? "true" : "false"}
        data-shadow-maps-enabled={
          effectiveShadowsEnabled ? "true" : "false"
        }
        data-shadow-filter={QUALITY_SHADOW_FILTER}
        data-shadow-map-size={lighting.shadows.mapSize}
        data-shadow-camera-half-span={shadowCameraHalfSpan}
        data-tone-mapping="aces"
        data-lighting-model="central-environment-sun-ambient"
        data-lighting-mode={lighting.id}
        data-lighting-source-mode={lighting.sourceMode}
        data-lighting-preset={configuration.lightingSettings.preset}
        data-lighting-quality={lighting.quality}
        data-lighting-exposure={lighting.renderer.exposure.toFixed(3)}
        data-lighting-environment-intensity={lighting.environment.intensity.toFixed(
          3
        )}
        data-active-light-count={activeLightCount}
        data-active-window-light-count={activeWindowLights.length}
        data-active-fixture-light-count={activeFixtureLights.length}
        data-shadow-casting-light-count={shadowCastingLightCount}
        data-lighting-diagnostics="Central preset-driven lighting"
        data-workspace-grid={viewMode === "3d" ? "visible" : "hidden"}
        data-workspace-grid-mode="camera-aware-floor-and-ceiling"
        data-workspace-grid-minor-meters={WORKSPACE_GRID_CELL_SIZE_METERS}
        data-workspace-grid-major-meters={WORKSPACE_GRID_SECTION_SIZE_METERS}
        data-camera-y={viewMode === "3d" ? String(state.cameraY) : undefined}
        data-plan-2d-orientation={
          viewMode === "2d" ? configuration.planFit.orientation : undefined
        }
        data-plan-2d-camera-valid={
          viewMode === "2d" ? String(planDiagnostics.valid) : undefined
        }
        data-plan-2d-camera-recoveries={
          viewMode === "2d" ? String(planDiagnostics.recoveries) : undefined
        }
        data-plan-2d-projected-room-min-width-px={
          viewMode === "2d"
            ? String(planDiagnostics.projectedRoomMinWidthPx)
            : undefined
        }
        data-plan-2d-projected-room-min-height-px={
          viewMode === "2d"
            ? String(planDiagnostics.projectedRoomMinHeightPx)
            : undefined
        }
        data-plan-2d-projected-room-min-area-px={
          viewMode === "2d"
            ? String(planDiagnostics.projectedRoomMinAreaPx)
            : undefined
        }
        style={{
          cursor: configuration.cursor,
          backgroundColor: configuration.backgroundColor,
          opacity: state.showSceneLoadingVeil ? 0 : 1,
          transition: "opacity 160ms ease",
        }}
        shadows={effectiveShadowsEnabled ? QUALITY_SHADOW_FILTER : false}
        dpr={state.liteSceneEnabled ? [1, 1] : [1, 2]}
        frameloop={DESIGN_SCENE_FRAMELOOP}
        gl={{
          antialias: true,
        }}
        onCreated={({ gl }) => instrumentGLBMainThreadRenderer(gl)}
        camera={{
          position: [...configuration.initialCameraView.pos],
          fov: configuration.initialCameraView.fov,
          near: 0.1,
          far: 300,
        }}
        onPointerMissed={actions.onClearSelection}
      >
        <EditorCamera2D
          active={viewMode === "2d"}
          fitOrientation={configuration.planFit.orientation}
          roomWidth={planBounds.widthMeters}
          roomDepth={planBounds.depthMeters}
          roomHeight={planBounds.roomHeight}
          centerX={planBounds.centerX}
          centerZ={planBounds.centerZ}
          safeAreaLeftPx={configuration.planSafeArea.leftPx}
          safeAreaRightPx={configuration.planSafeArea.rightPx}
          safeAreaBottomPx={configuration.planSafeArea.bottomPx}
          zoomScale={WHOLE_HOME_FIT_ZOOM_SCALE}
        />
        <Plan2DCameraInvariantGuard
          active={viewMode === "2d"}
          cameraHeightMeters={
            Math.max(planBounds.widthMeters, planBounds.depthMeters) +
            planBounds.roomHeight +
            6
          }
          controlsRef={sceneRefs.controls}
          fit={configuration.planFit}
          onDiagnosticsChange={actions.onPlanDiagnosticsChange}
          rooms={configuration.planRooms}
          updateProjection={actions.updateProjection}
        />
        <color attach="background" args={[configuration.backgroundColor]} />
        {viewMode === "3d" ? (
          <WorkspacePlanningGrid
            centerX={presentationBounds.centerX}
            centerZ={presentationBounds.centerZ}
            ceilingY={workspaceGridCeilingY}
            shadowsEnabled={effectiveShadowsEnabled}
            size={workspaceGridSize}
          />
        ) : null}
        <LoadingOverlay />
        <SceneProgressBridge onReadyChange={actions.onSceneProgressReadyChange} />
        <ScenePerformanceBridge
          enabled={
            viewMode === "3d" &&
            state.scenePerformanceMode === "auto" &&
            !state.liteSceneEnabled
          }
          onFpsSample={actions.onFpsSample}
          onRendererSample={actions.onRendererSample}
          onSustainedLowFps={actions.onSustainedLowFps}
        />
        {viewMode === "3d" ? (
          <LightingSystem
            lighting={lighting}
            shadowCameraHalfSpan={shadowCameraHalfSpan}
            fixtures={fixtureLights}
            windows={windowLights}
            bounds={{
              centerX: presentationBounds.centerX,
              centerZ: presentationBounds.centerZ,
              width: presentationBounds.widthMeters,
              depth: presentationBounds.depthMeters,
              roomHeight: planBounds.roomHeight,
            }}
          />
        ) : null}

        <Suspense fallback={<RoomSkeleton />}>{children}</Suspense>
        <CameraCapture
          cameraRef={sceneRefs.camera}
          canvasRef={sceneRefs.canvas}
          rendererRef={sceneRefs.renderer}
          sceneRef={sceneRefs.scene}
        />

        {viewMode === "2d" ? (
          <MapControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            enablePan={!state.isClientPreview}
            enableZoom={!state.isClientPreview}
            enableRotate={false}
            screenSpacePanning
            enabled={state.controlsEnabled}
          />
        ) : (
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            enablePan={!state.isClientPreview}
            enableZoom={!state.isClientPreview}
            enableRotate={!state.isClientPreview}
            rotateSpeed={0.8}
            minDistance={configuration.orbit.minDistance}
            maxDistance={configuration.orbit.maxDistance}
            minPolarAngle={configuration.orbit.minPolarAngle}
            maxPolarAngle={configuration.orbit.maxPolarAngle}
            enabled={state.controlsEnabled}
            onChange={actions.onOrbitChange}
          />
        )}
      </Canvas>
    </CanvasErrorBoundary>
  );
}
