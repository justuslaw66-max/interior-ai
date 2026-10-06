"use client";

import * as THREE from "three";
import { noRaycast } from "./stableSceneProps";

const OCCLUDER_USER_DATA = { testId: "ceiling-shadow-occluder" };

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
      raycast={noRaycast}
      userData={OCCLUDER_USER_DATA}
    >
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
