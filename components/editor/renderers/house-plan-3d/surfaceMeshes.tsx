"use client";

import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  clampFloorPatternScale,
  normalizeFloorRotationDeg,
  type FloorMaterial,
} from "@/lib/floor-materials";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { normalizeFloorSurfaceSettings } from "@/lib/surface-settings";
import { useSurfaceMaterialTexture } from "../useSurfaceMaterialTexture";
import { createFloorMaterialTexture } from "./materials";
import {
  buildLegacyWallBandCoreGeometry,
  buildHorizontalRoomGeometry,
  buildRoomEdgeBandGeometry,
  buildRoomShapeGeometry,
  getRoomOutlinePoints,
  legacyPlanarShape,
  type LegacyFloorSlab3D,
  type LegacyWallBand3D,
  type WallFaceRenderPatch,
} from "./geometry";

type StructureTarget = {
  kind: "floor" | "wall" | "ceiling" | "opening";
  roomId: string;
  id: string;
};

type StructureOutlineStyle = {
  color: string;
  lineWidth: number;
} | null;

const CEILING_THICKNESS_METERS = 0.025;
const CEILING_EDGE_COLOR = "#f1f1ed";
const INACTIVE_WALL_COLOR = "#ddddda";
const WALL_CUT_SURFACE_COLOR = INACTIVE_WALL_COLOR;
const WALL_INDIRECT_FILL_INTENSITY = 0.08;
const ROOM_FLOOR_SURFACE_OFFSET_METERS = 0.006;

export function LegacyFloorSlabMesh({ slab }: { slab: LegacyFloorSlab3D }) {
  const { camera } = useThree();
  const slabRef = useRef<THREE.Mesh | null>(null);
  const shapes = useMemo(() => legacyPlanarShape(slab.polygons), [slab.polygons]);
  useFrame(() => {
    if (!slabRef.current) return;
    slabRef.current.visible =
      camera.position.y > slab.elevationMeters - slab.thicknessMeters * 0.35;
  });
  return (
    <mesh
      ref={slabRef}
      position={[0, slab.elevationMeters - slab.thicknessMeters, 0]}
      rotation-x={-Math.PI / 2}
      raycast={() => null}
      userData={{
        testId: "legacy-watertight-floor-slab-3d",
        floorLevel: slab.floorLevel,
        polygonCount: slab.polygons.length,
      }}
    >
      <extrudeGeometry
        args={[
          shapes,
          { depth: slab.thicknessMeters, bevelEnabled: false, steps: 1 },
        ]}
      />
      <meshBasicMaterial
        attach="material-0"
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
      <meshBasicMaterial
        attach="material-1"
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

export function LegacyWallBandMesh({
  band,
  facePatches,
  opacity,
  showTopCap,
}: {
  band: LegacyWallBand3D;
  facePatches: readonly WallFaceRenderPatch[];
  opacity: number;
  showTopCap: boolean;
}) {
  const shapes = useMemo(() => legacyPlanarShape(band.polygons), [band.polygons]);
  const coreGeometry = useMemo(
    () =>
      buildLegacyWallBandCoreGeometry({
        band,
        facePatches,
        removeTopCap: showTopCap,
      }),
    [band, facePatches, showTopCap]
  );

  useEffect(() => () => coreGeometry.dispose(), [coreGeometry]);

  return (
    <group>
      <mesh
        castShadow
        receiveShadow
        position={[0, band.bottomMeters, 0]}
        rotation-x={-Math.PI / 2}
        raycast={() => null}
        userData={{
          testId: "legacy-watertight-wall-band-3d",
          floorLevel: band.floorLevel,
          polygonCount: band.polygons.length,
          wallFaceRenderPatchCount:
            coreGeometry.userData.wallFaceRenderPatchCount ?? 0,
          removedCoveredTriangleCount:
            coreGeometry.userData.removedCoveredTriangleCount ?? 0,
        }}
      >
        <primitive object={coreGeometry} attach="geometry" />
        <meshStandardMaterial
          color={INACTIVE_WALL_COLOR}
          emissive={INACTIVE_WALL_COLOR}
          emissiveIntensity={WALL_INDIRECT_FILL_INTENSITY}
          roughness={0.86}
          flatShading
          transparent={opacity < 0.999}
          opacity={opacity}
        />
      </mesh>
      {showTopCap ? (
        <mesh
          position={[0, band.topMeters, 0]}
          rotation-x={-Math.PI / 2}
          raycast={() => null}
          userData={{
            testId: "legacy-watertight-wall-top-cap-3d",
            floorLevel: band.floorLevel,
            polygonCount: band.polygons.length,
          }}
        >
          <shapeGeometry args={[shapes]} />
          <meshStandardMaterial
            color={WALL_CUT_SURFACE_COLOR}
            emissive={WALL_CUT_SURFACE_COLOR}
            emissiveIntensity={WALL_INDIRECT_FILL_INTENSITY}
            roughness={0.86}
            depthTest
            depthWrite={opacity >= 0.999}
            transparent={opacity < 0.999}
            opacity={opacity}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export function RoomFloorMesh({
  room,
  material,
  wallThickness,
  slabThickness,
  showEdgeBand,
  floorWorldY,
  floorOpacity,
  floorLayerIndex,
  interactive,
  floorTarget,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  material: FloorMaterial;
  wallThickness: number;
  slabThickness: number;
  showEdgeBand: boolean;
  floorWorldY: number;
  floorOpacity: number;
  floorLayerIndex: number;
  interactive: boolean;
  floorTarget: StructureTarget;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera, gl } = useThree();
  const floorSurfaceRef = useRef<THREE.Mesh | null>(null);
  const floorBandRef = useRef<THREE.Mesh | null>(null);
  const floorPickEnabledRef = useRef(true);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const floorSettings = normalizeFloorSurfaceSettings(
    surfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const floorRotation = THREE.MathUtils.degToRad(floorSettings.floorRotationDeg);
  const surfaceMaterial = getRuntimeSurfaceMaterialById(surfaces?.floorMaterialId);
  const slabEdgeOffset = wallThickness / 2;
  const floorBandGeometry = useMemo(
    () =>
      showEdgeBand
        ? buildRoomEdgeBandGeometry(room, slabThickness, slabEdgeOffset)
        : null,
    [room, showEdgeBand, slabEdgeOffset, slabThickness]
  );
  const surfaceTexture = useSurfaceMaterialTexture({
    material: surfaceMaterial,
    roomWidthMeters: room.w,
    roomDepthMeters: room.d,
    floorScale: floorSettings.floorScale,
    rotationRad: floorRotation,
    floorPattern: floorSettings.floorPattern,
    patternOffset: floorSettings.floorPatternOffset,
    jointSizeMm: floorSettings.floorJointSizeMm,
    jointColor: floorSettings.floorJointColor,
    maxAnisotropy,
  });
  const defaultTexture = useMemo(() => {
    const nextTexture = createFloorMaterialTexture(
      material,
      maxAnisotropy,
      floorSettings.floorPattern,
      floorSettings.floorJointSizeMm,
      floorSettings.floorJointColor
    );
    if (!nextTexture) return null;

    nextTexture.repeat.set(1 / floorSettings.floorScale, 1 / floorSettings.floorScale);
    nextTexture.center.set(0.5, 0.5);
    nextTexture.offset.set(floorSettings.floorPatternOffset.x, floorSettings.floorPatternOffset.y);
    nextTexture.rotation = floorRotation;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [
    material,
    maxAnisotropy,
    floorSettings.floorPattern,
    floorSettings.floorJointColor,
    floorSettings.floorJointSizeMm,
    floorSettings.floorPatternOffset.x,
    floorSettings.floorPatternOffset.y,
    floorSettings.floorScale,
    floorRotation,
  ]);

  useEffect(() => {
    return () => {
      defaultTexture?.dispose();
    };
  }, [defaultTexture]);

  useEffect(() => {
    return () => {
      floorBandGeometry?.dispose();
    };
  }, [floorBandGeometry]);

  const raycastFloorSurface = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = floorSurfaceRef.current;
      if (!interactive || !floorPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    const floorVisible = camera.position.y > floorWorldY - slabThickness * 0.35;
    if (floorSurfaceRef.current) floorSurfaceRef.current.visible = floorVisible;
    if (floorBandRef.current) floorBandRef.current.visible = floorVisible;
    floorPickEnabledRef.current = floorVisible;
  });

  return (
    <>
      <mesh
        ref={floorSurfaceRef}
        rotation-x={-Math.PI / 2}
        position={[0, ROOM_FLOOR_SURFACE_OFFSET_METERS, 0]}
        renderOrder={1 + floorLayerIndex}
        receiveShadow
        raycast={raycastFloorSurface}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                onHoverTarget(floorTarget);
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? (event) => {
                event.stopPropagation();
                onClearHoverTarget(floorTarget);
              }
            : undefined
        }
        onClick={(event) => {
          if (!interactive) return;
          onSelectTarget(floorTarget, event);
        }}
      >
        <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
        <meshStandardMaterial
          color={surfaceTexture || defaultTexture ? "#ffffff" : material.renderColor}
          map={surfaceTexture ?? defaultTexture ?? undefined}
          roughness={surfaceTexture && surfaceMaterial ? surfaceMaterial.rendering.roughness : 0.84}
          metalness={surfaceTexture && surfaceMaterial ? surfaceMaterial.rendering.metalness : 0}
          transparent={floorOpacity < 0.999}
          opacity={floorOpacity}
          depthWrite={floorOpacity > 0.34}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-(floorLayerIndex + 1)}
        />
      </mesh>
      {floorBandGeometry ? (
        <mesh
          ref={floorBandRef}
          geometry={floorBandGeometry}
          position={[0, -slabThickness, 0]}
          raycast={() => null}
        >
          <meshBasicMaterial
            color={material.lineColor}
            side={THREE.DoubleSide}
            transparent={floorOpacity < 0.999}
            opacity={floorOpacity}
          />
        </mesh>
      ) : null}
    </>
  );
}

export function RoomCeilingCapMesh({
  room,
  floorWorldY,
  wallHeight,
  visible,
  opacity,
  color,
  interactive,
  ceilingTarget,
  outlineStyle,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  floorWorldY: number;
  wallHeight: number;
  visible: boolean;
  opacity: number;
  color: string;
  interactive: boolean;
  ceilingTarget: StructureTarget;
  outlineStyle: StructureOutlineStyle;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const ceilingCapMeshRef = useRef<THREE.Mesh | null>(null);
  const ceilingCapPickEnabledRef = useRef(false);
  const ceilingCapGeometry = useMemo(
    () => buildHorizontalRoomGeometry(room),
    [room]
  );
  const ceilingBandGeometry = useMemo(
    () => buildRoomEdgeBandGeometry(room, CEILING_THICKNESS_METERS),
    [room]
  );
  const raycastCeilingCap = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = ceilingCapMeshRef.current;
      if (!interactive || !ceilingCapPickEnabledRef.current) return;
      if (raycaster.ray.direction.y <= 0.001) return;
      if (!mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!visible) {
      group.visible = false;
      ceilingCapPickEnabledRef.current = false;
      return;
    }

    const ceilingWorldY = floorWorldY + wallHeight;
    const canPickCeilingCap = camera.position.y < ceilingWorldY - 0.005;
    group.visible = canPickCeilingCap;
    ceilingCapPickEnabledRef.current = canPickCeilingCap;
  });

  useEffect(() => {
    return () => {
      ceilingCapGeometry.dispose();
      ceilingBandGeometry.dispose();
    };
  }, [ceilingBandGeometry, ceilingCapGeometry]);

  return (
    <group ref={groupRef} position={[0, wallHeight, 0]} visible={false}>
      <mesh
        ref={ceilingCapMeshRef}
        geometry={ceilingCapGeometry}
        raycast={raycastCeilingCap}
        renderOrder={1}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                onHoverTarget(ceilingTarget);
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? (event) => {
                event.stopPropagation();
                onClearHoverTarget(ceilingTarget);
              }
            : undefined
        }
        onClick={
          interactive
            ? (event) => {
                onSelectTarget(ceilingTarget, event);
              }
            : undefined
        }
      >
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          transparent={opacity < 0.999}
          side={THREE.DoubleSide}
        />
      </mesh>
      {outlineStyle ? (
        <Line
          points={getRoomOutlinePoints(room).map(([x, z]) => [x, -0.012, z])}
          color={outlineStyle.color}
          lineWidth={outlineStyle.lineWidth}
          depthTest={false}
          raycast={() => null}
        />
      ) : null}
      <mesh
        geometry={ceilingBandGeometry}
        raycast={() => null}
        renderOrder={2}
      >
        <meshBasicMaterial
          color={CEILING_EDGE_COLOR}
          opacity={opacity}
          transparent={opacity < 0.999}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
