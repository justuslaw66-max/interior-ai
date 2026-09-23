"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

import {
  recordSceneDemandMutation,
  requestSceneDemandFrame,
} from "@/components/scene/sceneDemandDiagnostics";
import type { ResolvedEditorLighting } from "./lightingTypes";

function applyRendererLightingSettings(
  renderer: THREE.WebGLRenderer,
  exposure: number
) {
  const changed =
    renderer.outputColorSpace !== THREE.SRGBColorSpace ||
    renderer.toneMapping !== THREE.ACESFilmicToneMapping ||
    renderer.toneMappingExposure !== exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  return changed;
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
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (applyRendererLightingSettings(renderer, lighting.renderer.exposure)) {
      recordSceneDemandMutation("exposure", lighting.renderer.exposure);
      requestSceneDemandFrame(invalidate);
    }
  }, [invalidate, lighting.renderer.exposure, renderer]);

  return null;
}
