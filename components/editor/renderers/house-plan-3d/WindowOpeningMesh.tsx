"use client";

import { Line } from "@react-three/drei/core/Line";
import { useCursor } from "@react-three/drei/web/useCursor";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import {
  getWallInteriorSurfaceSide, type WallOpening3D, type WallSegment3D,
} from "./geometry";
import { getWindowOpeningHitVolume } from "./windowOpeningGeometry";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { useWindowOpeningDrag, type WindowOpeningDragActions } from "./useWindowOpeningDrag";

type OpeningTarget = { kind: "opening"; roomId: string; id: string };
type Props = WindowOpeningDragActions & {
  roomId: string;
  sourceOpening?: RoomRendererOpening;
  opening: WallOpening3D;
  segment: WallSegment3D;
  wallHeight: number;
  wallThickness: number;
  floorWorldY: number;
  interactive: boolean;
  hidden: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: OpeningTarget) => void;
  onClearHoverTarget: (target: OpeningTarget) => void;
  onSelectTarget: (target: OpeningTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
};

function stopPointer(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
  event.nativeEvent.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

/** The hit volume occupies only the aperture; surrounding solids still select the wall. */
export function WindowOpeningMesh(props: Props) {
  const { opening, segment, wallHeight, wallThickness, hidden } = props;
  const meshRef = useRef<THREE.Mesh>(null);
  const pickEnabledRef = useRef(false);
  const startDrag = useWindowOpeningDrag(props);
  useFrame(({ camera }) => {
    pickEnabledRef.current = !hidden && camera.position.y >= props.floorWorldY - 0.02;
  });
  const volume = getWindowOpeningHitVolume(segment, opening, wallHeight);
  const { width, height } = volume;
  const target: OpeningTarget = { kind: "opening", roomId: props.roomId, id: opening.sourceId };
  const targetKey = `opening:${props.roomId}:${opening.sourceId}`;
  useCursor(props.interactive && props.hoveredTargetKey === targetKey, "grab");
  const selected = props.selectedTargetKey === targetKey;
  const outlined = selected || props.hoveredTargetKey === targetKey;
  const halfWidth = width / 2;
  const z = getWallInteriorSurfaceSide(segment) * (wallThickness / 2 + 0.003);
  if (width <= 0 || height <= 0 || hidden) return null;
  return (
    <group position={[volume.x, volume.centerY, volume.z]} rotation-y={segment.rotationY}>
      <mesh ref={meshRef}
        raycast={(raycaster, hits) => {
          if (props.interactive && pickEnabledRef.current && meshRef.current) {
            THREE.Mesh.prototype.raycast.call(meshRef.current, raycaster, hits);
          }
        }}
        onPointerOver={(event) => { stopPointer(event); props.onHoverTarget(target); }}
        onPointerOut={() => props.onClearHoverTarget(target)}
        onPointerDown={(event) => {
          stopPointer(event);
          props.onSelectTarget(target, event);
          startDrag(event);
        }}
        onClick={(event) => { stopPointer(event); props.onSelectTarget(target, event); }}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {outlined && <Line points={[
        [-halfWidth, -height / 2, z], [halfWidth, -height / 2, z],
        [halfWidth, height / 2, z], [-halfWidth, height / 2, z], [-halfWidth, -height / 2, z],
      ]} color={selected ? "#2563eb" : "#00d5e8"} lineWidth={selected ? 2.8 : 2.4}
        renderOrder={26} depthTest={false} depthWrite={false} toneMapped={false} raycast={() => null} />}
    </group>
  );
}
