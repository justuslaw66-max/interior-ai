"use client";

import * as THREE from "three";

type CeilingShadowOccluderProps = {
  boxSize?: [number, number, number];
  geometry?: THREE.BufferGeometry;
  position?: [number, number, number];
};

/** Keeps a physical ceiling in shadow maps without drawing or intercepting it. */
export function CeilingShadowOccluder({
  boxSize,
  geometry,
  position,
}: CeilingShadowOccluderProps) {
  return (
    <mesh
      name="ceiling-shadow-occluder"
      geometry={geometry}
      position={position}
      castShadow
      raycast={() => null}
      userData={{ testId: "ceiling-shadow-occluder" }}
    >
      {boxSize ? <boxGeometry args={boxSize} /> : null}
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
