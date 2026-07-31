"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import {
  LightingSystem,
  resolveEditorLighting,
  selectFixtureLightBudget,
  selectWindowLightBudget,
  type LightingMode,
} from "@/components/editor/design-page/lighting";
import {
  ScenePerformanceBridge,
  type ScenePerformanceBridgeProps,
} from "@/components/scene/ScenePerformanceBridge";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  LIGHTING_PRESETS,
  type DesignLightingSettings,
  type LightingPreset,
} from "@/lib/lightingPresets";
import { resolveLightingScene } from "@/lib/resolve-lighting-scene";
import type { DesignItem } from "@/lib/room-types";

const REFERENCE_ROOM: HousePlanRoom2D = {
  id: "lighting-reference-room",
  name: "Lighting reference",
  roomType: "living",
  shape: "rectangle",
  x: 0,
  z: 0,
  w: 10,
  d: 6,
  height: 3,
};

const REFERENCE_OPENINGS: RoomOpening2D[] = [
  {
    id: "lighting-reference-window",
    roomId: REFERENCE_ROOM.id,
    kind: "window",
    wall: "north",
    offsetMm: 0,
    widthMm: 2200,
    heightMm: 1400,
    bottomMm: 850,
  },
];

const REFERENCE_FIXTURE_ITEM: DesignItem = {
  instanceId: "lighting-reference-floor-lamp",
  productId: "lighting-reference-floor-lamp",
  variantId: "default",
  position: [-3.6, 0, 1.1],
  productSnapshot: {
    schemaVersion: 1,
    productId: "lighting-reference-floor-lamp",
    variantId: "default",
    name: "Reference floor lamp",
    category: "floor_lamp",
    dimensionsMm: { w: 420, d: 420, h: 1600 },
    variantLabel: "Reference",
    assets: {},
    lighting: {
      emitterType: "spot",
      localOffsetMeters: [0, 1.35, 0],
      direction: [0, -1, 0],
      beamAngleDeg: 100,
      luminousFluxLumens: 300,
      cctKelvin: 2700,
      dimmable: true,
      verification: "photometric",
      emissiveMeshNames: ["verified-reference-bulb"],
    },
  },
};

const REFERENCE_FIXTURE_ENTRY: SceneRoomItemEntry = {
  item: REFERENCE_FIXTURE_ITEM,
  roomId: REFERENCE_ROOM.id,
  layerId: `room:${REFERENCE_ROOM.id}:items`,
  visible: true,
  roomOffset: { x: 0, z: 0 },
  roomFloorElevationMeters: 0,
  roomWidth: REFERENCE_ROOM.w,
  roomDepth: REFERENCE_ROOM.d,
  roomHeight: REFERENCE_ROOM.height ?? 3,
  roomPlanShape: "rectangle",
  roomWallThickness: 0.2,
  roomWallModel: "house-plan-shell",
  isActiveRoom: true,
};

const REFERENCE_CEILING_FIXTURE_ITEM: DesignItem = {
  instanceId: "lighting-reference-ceiling-fixture",
  productId: "lighting-reference-ceiling-fixture",
  variantId: "default",
  position: [2.4, 0, 0.5],
  productSnapshot: {
    schemaVersion: 1,
    productId: "lighting-reference-ceiling-fixture",
    variantId: "default",
    name: "Reference ceiling fixture",
    category: "pendant_light",
    dimensionsMm: { w: 420, d: 420, h: 320 },
    variantLabel: "Reference",
    assets: {},
    lighting: {
      emitterType: "spot",
      localOffsetMeters: [0, -0.12, 0],
      direction: [0, -1, 0],
      beamAngleDeg: 58,
      luminousFluxLumens: 1100,
      cctKelvin: 3000,
      dimmable: true,
      verification: "photometric",
    },
  },
};

const REFERENCE_CEILING_FIXTURE_ENTRY: SceneRoomItemEntry = {
  ...REFERENCE_FIXTURE_ENTRY,
  item: REFERENCE_CEILING_FIXTURE_ITEM,
};

const subscribeToHydration = () => () => {};
const ignoreFpsSample: ScenePerformanceBridgeProps["onFpsSample"] = () =>
  undefined;
const ignoreRendererSample: ScenePerformanceBridgeProps["onRendererSample"] =
  () => undefined;
const ignoreLowFpsSample: ScenePerformanceBridgeProps["onSustainedLowFps"] =
  () => undefined;

function ReferenceCamera() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.position.set(0, 5.5, 10.5);
    camera.lookAt(0, 0.85, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function ReferenceMaterials() {
  return (
    <group name="stable-lighting-reference-materials">
      <mesh
        name="reference-floor"
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial color="#bca477" roughness={0.7} metalness={0} />
      </mesh>

      <mesh name="reference-back-wall" position={[0, 1.5, -3]} castShadow receiveShadow>
        <boxGeometry args={[10, 3, 0.12]} />
        <meshStandardMaterial color="#f2f0e9" roughness={0.82} />
      </mesh>
      <mesh
        name="reference-closed-divider"
        position={[-2.5, 1.35, 0.6]}
        castShadow
        receiveShadow
        userData={{ blocksDirectFixtureLight: true }}
      >
        <boxGeometry args={[0.16, 2.7, 2.8]} />
        <meshStandardMaterial color="#48505b" roughness={0.86} />
      </mesh>
      <mesh
        name="reference-rug"
        position={[1.5, 0.008, 0.65]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[3.2, 2.1]} />
        <meshStandardMaterial color="#a89d8f" roughness={0.96} />
      </mesh>
      <mesh name="neutral-gray" position={[-1.6, 0.55, -1.75]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.1, 0.34]} />
        <meshStandardMaterial color="#777777" roughness={0.72} />
      </mesh>
      <mesh name="reference-white" position={[-0.5, 0.55, -1.75]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.1, 0.34]} />
        <meshStandardMaterial color="#f4f3ee" roughness={0.68} />
      </mesh>
      <mesh name="reference-wood" position={[0.6, 0.55, -1.75]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.1, 0.34]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.62} />
      </mesh>
      <mesh name="black-laminate" position={[1.7, 0.55, -1.75]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.1, 0.34]} />
        <meshStandardMaterial color="#111215" roughness={0.32} />
      </mesh>
      <mesh name="saturated-fabric" position={[2.8, 0.55, -1.75]} castShadow receiveShadow>
        <sphereGeometry args={[0.62, 40, 24]} />
        <meshStandardMaterial color="#124fc4" roughness={0.94} />
      </mesh>
      <mesh name="polished-metal" position={[3.9, 0.55, -1.75]} castShadow receiveShadow>
        <sphereGeometry args={[0.62, 40, 24]} />
        <meshStandardMaterial color="#bfc3c8" roughness={0.12} metalness={1} />
      </mesh>
      <mesh name="reference-glass" position={[-1.2, 0.68, 0.45]} castShadow>
        <cylinderGeometry args={[0.48, 0.48, 1.35, 40]} />
        <meshPhysicalMaterial
          color="#d8f2f2"
          roughness={0.05}
          transmission={0.9}
          thickness={0.18}
          transparent
          opacity={0.5}
        />
      </mesh>

      <group name="reference-fabric-sofa" position={[1.05, 0, 1.35]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.68, 0.82]} />
          <meshStandardMaterial color="#b7b0a7" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.95, 0.32]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.82, 0.2]} />
          <meshStandardMaterial color="#aaa39a" roughness={0.95} />
        </mesh>
      </group>
      <group name="reference-wood-table" position={[3.25, 0, 0.7]}>
        <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.1, 40]} />
          <meshStandardMaterial color="#794b2e" roughness={0.66} />
        </mesh>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.14, 0.56, 20]} />
          <meshStandardMaterial color="#5a3624" roughness={0.72} />
        </mesh>
      </group>
      <group
        name="reference-ceiling-fixture"
        position={[2.4, 2.75, 0.5]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.42, 0.32, 32]} />
          <meshStandardMaterial color="#ded9d0" roughness={0.74} />
        </mesh>
      </group>

      <mesh name="reference-lamp-stand" position={[-3.6, 0.75, 1.1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.06, 0.12, 1.5, 20]} />
        <meshStandardMaterial color="#202125" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh name="reference-lamp-shade" position={[-3.6, 1.48, 1.1]} receiveShadow>
        <coneGeometry args={[0.46, 0.62, 32, 1, true]} />
        <meshStandardMaterial color="#efe4cd" roughness={0.86} side={THREE.DoubleSide} />
      </mesh>
      <mesh name="verified-reference-bulb" position={[-3.6, 1.35, 1.1]}>
        <sphereGeometry args={[0.09, 20, 12]} />
        <meshStandardMaterial
          color="#fff1dc"
          emissive="#ffb86b"
          emissiveIntensity={0.7}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

export function LightingReferenceClient() {
  const [preset, setPreset] = useState<LightingPreset>("studio");
  const [modeOverride, setModeOverride] = useState<LightingMode | undefined>();
  const clientHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  const settings = useMemo<DesignLightingSettings>(
    () => ({
      version: 1,
      preset,
      timeMinutes: LIGHTING_PRESETS[preset].defaultTimeMinutes,
      planNorthDeg: 22,
      location: { latitude: 1.3521, longitude: 103.8198 },
      dateIso: "2026-03-20",
      exposureCompensationEv: 0,
      fixtureMasterEnabled: true,
      fixtureMasterLevel: 1,
      shadowsEnabled: true,
      previewFillEnabled: false,
    }),
    [preset]
  );
  const scene = useMemo(
    () =>
      resolveLightingScene({
        settings,
        rooms: [REFERENCE_ROOM],
        openings: REFERENCE_OPENINGS,
        items: [
          REFERENCE_FIXTURE_ENTRY,
          REFERENCE_CEILING_FIXTURE_ENTRY,
        ],
        qualityMode: "quality",
        liteEnabled: false,
        activeRoomId: REFERENCE_ROOM.id,
      }),
    [settings]
  );
  const lighting = useMemo(
    () =>
      resolveEditorLighting(settings, {
        performanceMode: "quality",
        liteEnabled: false,
        modeOverride,
        physicalScene: scene,
      }),
    [modeOverride, scene, settings]
  );
  const activeFixtureLights = selectFixtureLightBudget(
    scene.fixtures,
    lighting
  );
  const activeWindowLights = selectWindowLightBudget(scene.windows, lighting);
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
    <main className="flex h-screen min-h-[640px] flex-col bg-neutral-100 text-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold">Residential lighting reference</h1>
          <p className="text-sm text-neutral-600">
            Stable gray, white, wood, laminate, fabric, metal, and glass targets.
          </p>
        </div>
        <div role="radiogroup" aria-label="Reference lighting scene" className="flex gap-2">
          {(Object.keys(LIGHTING_PRESETS) as LightingPreset[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preset === value && !modeOverride}
              data-testid={`reference-preset-${value}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                preset === value && !modeOverride
                  ? "bg-neutral-950 text-white"
                  : "bg-neutral-200 text-neutral-700"
              }`}
              onClick={() => {
                setPreset(value);
                setModeOverride(undefined);
              }}
            >
              {LIGHTING_PRESETS[value].name}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={modeOverride === "presentation"}
            data-testid="reference-preset-presentation"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              modeOverride === "presentation"
                ? "bg-neutral-950 text-white"
                : "bg-neutral-200 text-neutral-700"
            }`}
            onClick={() => setModeOverride("presentation")}
          >
            Presentation
          </button>
        </div>
      </header>
      <div
        className="relative min-h-0 flex-1"
        data-testid="lighting-reference-scene"
        data-client-hydrated={clientHydrated ? "true" : "false"}
        data-lighting-preset={scene.preset}
        data-lighting-mode={lighting.id}
        data-lighting-exposure={lighting.renderer.exposure.toFixed(3)}
        data-environment-intensity={lighting.environment.intensity.toFixed(3)}
        data-active-light-count={activeLightCount}
        data-shadow-casting-light-count={shadowCastingLightCount}
        data-shadow-map-size={lighting.shadows.mapSize}
        data-lighting-quality={lighting.quality}
        data-tone-mapping="aces"
        data-sun-lux={scene.sun.illuminanceLux.toFixed(0)}
        data-active-fixtures={scene.fixtures.length}
        data-window-lights={activeWindowLights.length}
        data-reference-material-count="11"
        data-closed-wall-blocks-direct-light="true"
        data-evening-sky-is-cool={String(
          scene.sky.colorLinear[2] >= scene.sky.colorLinear[0]
        )}
      >
        <Canvas
          shadows
          camera={{ fov: 38, near: 0.1, far: 80 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#dfe5e9"]} />
          <ReferenceCamera />
          <ScenePerformanceBridge
            enabled={false}
            onFpsSample={ignoreFpsSample}
            onRendererSample={ignoreRendererSample}
            onSustainedLowFps={ignoreLowFpsSample}
          />
          <LightingSystem
            lighting={lighting}
            shadowCameraHalfSpan={8}
            fixtures={scene.fixtures}
            windows={scene.windows}
            bounds={{
              centerX: 0,
              centerZ: 0,
              width: REFERENCE_ROOM.w,
              depth: REFERENCE_ROOM.d,
              roomHeight: REFERENCE_ROOM.height ?? 3,
            }}
          />
          <ReferenceMaterials />
        </Canvas>
        {process.env.NODE_ENV !== "production" ? (
          <dl className="pointer-events-none absolute left-4 top-4 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 rounded-xl bg-black/75 px-3 py-2 text-[11px] text-white shadow-lg">
            <dt>Mode</dt>
            <dd className="font-mono">{lighting.id}</dd>
            <dt>Exposure</dt>
            <dd className="font-mono">
              {lighting.renderer.exposure.toFixed(2)}
            </dd>
            <dt>Environment</dt>
            <dd className="font-mono">
              {lighting.environment.intensity.toFixed(2)}
            </dd>
            <dt>Lights</dt>
            <dd className="font-mono">{activeLightCount}</dd>
            <dt>Shadow lights</dt>
            <dd className="font-mono">{shadowCastingLightCount}</dd>
            <dt>Shadow map</dt>
            <dd className="font-mono">{lighting.shadows.mapSize}</dd>
            <dt>Tone mapping</dt>
            <dd className="font-mono">ACES</dd>
            <dt>Quality</dt>
            <dd className="font-mono">{lighting.quality}</dd>
          </dl>
        ) : null}
      </div>
      <footer className="border-t border-neutral-200 bg-white px-6 py-3 text-xs text-neutral-600">
        Interactive visualization only; not certified photometric analysis.
      </footer>
    </main>
  );
}
