"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

import type { ResolvedEditorLighting } from "./lightingTypes";

function applyRendererLightingSettings(
  renderer: THREE.WebGLRenderer,
  exposure: number
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
}

/**
 * Sole runtime owner of renderer-wide colour output and exposure.
 */
export function ExposureController({
  lighting,
}: {
  lighting: ResolvedEditorLighting;
}) {
  const renderer = useThree((state) => state.gl);

  useEffect(() => {
    applyRendererLightingSettings(renderer, lighting.renderer.exposure);
  }, [lighting.renderer.exposure, renderer]);

  return null;
}
