"use client";

/* eslint-disable react-hooks/refs -- This shell intentionally forwards grouped ref objects to Three.js bridge components. */

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei/core/Environment";
import { Grid } from "@react-three/drei/core/Grid";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { MapControls } from "@react-three/drei/core/MapControls";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import {
  Suspense,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
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
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { CameraView } from "@/lib/design-page-types";
import type { LightingConfig } from "@/lib/lightingPresets";
import type { Plan2DCameraInvariantFit } from "@/lib/plan-camera-2d";
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
  lightConfig: LightingConfig;
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

const QUALITY_SHADOW_MAP_SIZE = 2048;
const QUALITY_SHADOW_FILTER = "percentage";
const QUALITY_SHADOW_RADIUS = 3.5;
const QUALITY_SHADOW_INTENSITY = 0.58;
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
  liteSceneEnabled: boolean;
  size: number;
};

function WorkspacePlanningGrid({
  centerX,
  centerZ,
  ceilingY,
  liteSceneEnabled,
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
          receiveShadow={!liteSceneEnabled}
          raycast={() => null}
        >
          <planeGeometry args={[size, size]} />
          <shadowMaterial
            color="#66736f"
            opacity={liteSceneEnabled ? 0 : 0.2}
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

  return (
    <CanvasErrorBoundary>
      <Canvas
        data-testid="scene-canvas"
        data-shadow-maps-enabled={
          viewMode === "3d" && !state.liteSceneEnabled ? "true" : "false"
        }
        data-shadow-filter={QUALITY_SHADOW_FILTER}
        data-shadow-map-size={QUALITY_SHADOW_MAP_SIZE}
        data-shadow-camera-half-span={shadowCameraHalfSpan}
        data-tone-mapping="aces"
        data-lighting-model="ambient-hemi-key-fill-ibl"
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
        shadows={
          viewMode === "3d" && !state.liteSceneEnabled
            ? QUALITY_SHADOW_FILTER
            : false
        }
        dpr={state.liteSceneEnabled ? [1, 1] : [1, 2]}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: configuration.lightConfig.exposure ?? 1,
        }}
        camera={{
          position: [...configuration.initialCameraView.pos],
          fov: configuration.initialCameraView.fov,
          near: 0.1,
          far: 300,
        }}
        onCreated={({ gl }) => {
          (
            gl as THREE.WebGLRenderer & {
              physicallyCorrectLights?: boolean;
            }
          ).physicallyCorrectLights = true;
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
            liteSceneEnabled={state.liteSceneEnabled}
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
        <Suspense fallback={null}>
          <Environment resolution={state.liteSceneEnabled ? 32 : 128}>
            <Lightformer
              intensity={state.liteSceneEnabled ? 0.55 : 0.9}
              color={configuration.lightConfig.keyColor ?? "#ffffff"}
              position={[5, 6, 4]}
              rotation={[0, Math.PI / 4, 0]}
              scale={[8, 8, 1]}
            />
            <Lightformer
              intensity={state.liteSceneEnabled ? 0.2 : 0.45}
              color={configuration.lightConfig.fillColor ?? "#f1f4f8"}
              position={[-4, 3, -3]}
              rotation={[0, -Math.PI / 6, 0]}
              scale={[6, 6, 1]}
            />
          </Environment>
        </Suspense>
        <ambientLight
          color={configuration.lightConfig.ambientColor ?? "#f6f6f4"}
          intensity={configuration.lightConfig.ambientIntensity}
        />
        <hemisphereLight
          color={configuration.lightConfig.skyColor ?? "#f5f6fa"}
          groundColor={configuration.lightConfig.groundColor ?? "#d9d7d1"}
          intensity={configuration.lightConfig.hemiIntensity ?? 0.3}
        />
        <directionalLight
          position={[5, 7, 4]}
          color={configuration.lightConfig.keyColor ?? "#ffffff"}
          intensity={
            configuration.lightConfig.keyIntensity ??
            configuration.lightConfig.directionalIntensity
          }
          castShadow={viewMode === "3d" && !state.liteSceneEnabled}
          shadow-mapSize-width={QUALITY_SHADOW_MAP_SIZE}
          shadow-mapSize-height={QUALITY_SHADOW_MAP_SIZE}
          shadow-camera-near={0.5}
          shadow-camera-far={80}
          shadow-camera-left={-shadowCameraHalfSpan}
          shadow-camera-right={shadowCameraHalfSpan}
          shadow-camera-top={shadowCameraHalfSpan}
          shadow-camera-bottom={-shadowCameraHalfSpan}
          shadow-bias={-0.00015}
          shadow-normalBias={0.02}
          shadow-radius={QUALITY_SHADOW_RADIUS}
          shadow-intensity={QUALITY_SHADOW_INTENSITY}
        />
        <directionalLight
          position={[-4, 4, -3]}
          color={configuration.lightConfig.fillColor ?? "#f1f4f8"}
          intensity={
            configuration.lightConfig.fillIntensity ??
            configuration.lightConfig.directionalIntensity * 0.5
          }
        />

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
