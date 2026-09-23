"use client";

import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CeilingShadowOccluder } from "@/components/scene/CeilingShadowOccluder";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { buildHorizontalRoomGeometry, getRoomOutlinePoints } from "./geometry";
import type { StructureOutlineStyle, StructureTarget } from "./surfaceMeshes";


type RoomCeilingCapMeshProps = {
  room: HousePlanRoom2D;
  floorWorldY: number;
  wallHeight: number;
  wallThickness: number;
  visible: boolean;
  opacity: number;
  color: string;
  interactive: boolean;
  ceilingTarget: StructureTarget;
  outlineStyle: StructureOutlineStyle;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
};

/**
 * The ceiling covers the walls it sits on, out to their outer faces. The room is looked at from
 * outside at least as often as from inside, and from out there, below the ceiling, a wall's top
 * face points away from the camera: anything the ceiling does not cover is a wall-thickness strip
 * of nothing between the wall's top edge and the ceiling. Stopping on the room outline left half
 * that strip open, stopping on the inner faces left all of it, and covering to the outer faces
 * leaves none. From inside, the overhang is behind the wall's inner face and never seen.
 *
 * This puts the surface back in the wall heads' plane, so it takes the polygon offset the floor
 * surface has always used against its slab, and it reaches the corner squares that no wall fills,
 * which is right: from below, the ceiling reads as one slab over the whole footprint.
 */
function useCeilingSurfaceGeometries(
  room: HousePlanRoom2D,
  wallHeight: number,
  wallThickness: number
) {
  const ceilingCapGeometry = useMemo(
    () => buildHorizontalRoomGeometry(room, wallThickness / 2),
    [room, wallThickness]
  );
  const ceilingShadowGeometry = useMemo(
    () => buildHorizontalRoomGeometry(room, wallHeight * 2),
    [room, wallHeight]
  );
  useEffect(() => () => {
    ceilingCapGeometry.dispose();
    ceilingShadowGeometry.dispose();
  }, [ceilingCapGeometry, ceilingShadowGeometry]);
  return { ceilingCapGeometry, ceilingShadowGeometry };
}

/** The cap exists only for the room below it: above the ceiling plane it neither draws nor picks. */
function useCeilingCapVisibility({
  groupRef,
  pickEnabledRef,
  visible,
  floorWorldY,
  wallHeight,
}: {
  groupRef: MutableRefObject<THREE.Group | null>;
  pickEnabledRef: MutableRefObject<boolean>;
  visible: boolean;
  floorWorldY: number;
  wallHeight: number;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!visible) {
      group.visible = false;
      pickEnabledRef.current = false;
      return;
    }
    const ceilingWorldY = floorWorldY + wallHeight;
    const canPickCeilingCap = camera.position.y < ceilingWorldY - 0.005;
    group.visible = canPickCeilingCap;
    pickEnabledRef.current = canPickCeilingCap;
  });
}

type CeilingCapSurfaceProps = Pick<
  RoomCeilingCapMeshProps,
  "color" | "opacity" | "interactive" | "ceilingTarget" |
  "onHoverTarget" | "onClearHoverTarget" | "onSelectTarget"
> & {
  geometry: THREE.BufferGeometry;
  meshRef: MutableRefObject<THREE.Mesh | null>;
  pickEnabledRef: MutableRefObject<boolean>;
};

function CeilingCapSurface({
  geometry,
  meshRef,
  pickEnabledRef,
  color,
  opacity,
  interactive,
  ceilingTarget,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: CeilingCapSurfaceProps) {
  const raycastCeilingCap = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = meshRef.current;
      if (!interactive || !pickEnabledRef.current) return;
      if (raycaster.ray.direction.y <= 0.001) return;
      if (!mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive, meshRef, pickEnabledRef]
  );
  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      raycast={raycastCeilingCap}
      renderOrder={1}
      onPointerOver={interactive ? (event) => {
        event.stopPropagation();
        onHoverTarget(ceilingTarget);
      } : undefined}
      onPointerOut={interactive ? (event) => {
        event.stopPropagation();
        onClearHoverTarget(ceilingTarget);
      } : undefined}
      onClick={interactive ? (event) => onSelectTarget(ceilingTarget, event) : undefined}
    >
      <meshBasicMaterial
        color={color}
        opacity={opacity}
        transparent={opacity < 0.999}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

export function RoomCeilingCapMesh({
  room,
  floorWorldY,
  wallHeight,
  wallThickness,
  visible,
  opacity,
  color,
  interactive,
  ceilingTarget,
  outlineStyle,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: RoomCeilingCapMeshProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const ceilingCapMeshRef = useRef<THREE.Mesh | null>(null);
  const ceilingCapPickEnabledRef = useRef(false);
  const { ceilingCapGeometry, ceilingShadowGeometry } =
    useCeilingSurfaceGeometries(room, wallHeight, wallThickness);
  useCeilingCapVisibility({
    groupRef,
    pickEnabledRef: ceilingCapPickEnabledRef,
    visible,
    floorWorldY,
    wallHeight,
  });
  return (
    <>
      <CeilingShadowOccluder geometry={ceilingShadowGeometry} position={[0, wallHeight, 0]} />
      <group ref={groupRef} position={[0, wallHeight, 0]} visible={false}>
        <CeilingCapSurface
          geometry={ceilingCapGeometry}
          meshRef={ceilingCapMeshRef}
          pickEnabledRef={ceilingCapPickEnabledRef}
          color={color}
          opacity={opacity}
          interactive={interactive}
          ceilingTarget={ceilingTarget}
          onHoverTarget={onHoverTarget}
          onClearHoverTarget={onClearHoverTarget}
          onSelectTarget={onSelectTarget}
        />
        {outlineStyle ? (
          <Line
            points={getRoomOutlinePoints(room).map(([x, z]) => [x, -0.012, z])}
            color={outlineStyle.color}
            lineWidth={outlineStyle.lineWidth}
            depthTest={false}
            raycast={() => null}
          />
        ) : null}
      </group>
    </>
  );
}
