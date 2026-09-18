"use client";

import * as THREE from "three";

type CeilingShadowOccluderProps = {
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
};

/** Keeps a physical ceiling in shadow maps without drawing or intercepting it. */
export function CeilingShadowOccluder({
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
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
