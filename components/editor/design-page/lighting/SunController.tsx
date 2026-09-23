"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { ResolvedEditorLighting } from "./lightingTypes";

export function SunController({
  lighting,
  shadowCameraHalfSpan,
  targetPosition = [0, 0, 0],
}: {
  lighting: ResolvedEditorLighting;
  shadowCameraHalfSpan: number;
  targetPosition?: [number, number, number];
}) {
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(...targetPosition);
  target.updateMatrixWorld();

  if (!lighting.sun.enabled) return null;

  return (
    <>
      <primitive object={target} />
      <directionalLight
        name="editor-primary-sun"
        position={lighting.sun.position}
        target={target}
        color={lighting.sun.color}
        intensity={lighting.sun.intensity}
        castShadow={lighting.sun.castShadow && lighting.shadows.enabled}
        shadow-mapSize-width={lighting.shadows.mapSize}
        shadow-mapSize-height={lighting.shadows.mapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-shadowCameraHalfSpan}
        shadow-camera-right={shadowCameraHalfSpan}
        shadow-camera-top={shadowCameraHalfSpan}
        shadow-camera-bottom={-shadowCameraHalfSpan}
        shadow-bias={lighting.shadows.bias}
        shadow-normalBias={lighting.shadows.normalBias}
        shadow-radius={lighting.shadows.radius}
        shadow-intensity={0.52}
      />
    </>
  );
}
