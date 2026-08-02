"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type {
  EditorWindowLight,
  ResolvedEditorLighting,
} from "./lightingTypes";

export function selectWindowLightBudget(
  windows: readonly EditorWindowLight[],
  lighting: ResolvedEditorLighting
): EditorWindowLight[] {
  if (!lighting.windows.enabled) return [];

  return [...windows]
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id)
    )
    .slice(0, lighting.windows.maxActiveLights);
}

function WindowAreaLight({ window }: { window: EditorWindowLight }) {
  const quaternion = useMemo(() => {
    const direction = new THREE.Vector3(...window.direction).normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      direction
    );
  }, [window.direction]);

  return (
    <rectAreaLight
      name={`editor-window-light:${window.id}`}
      position={window.position}
      quaternion={quaternion}
      color="#f4f7ff"
      power={window.powerLumens}
      width={window.widthMeters}
      height={window.heightMeters}
    />
  );
}

/**
 * Diffuse sky contribution at measured window apertures. Direct sunlight is
 * still represented once by SunController, so these area sources never cast
 * shadows and never reuse solar illuminance.
 */
export function WindowLightManager({
  windows,
  lighting,
}: {
  windows: readonly EditorWindowLight[];
  lighting: ResolvedEditorLighting;
}) {
  const activeWindows = selectWindowLightBudget(windows, lighting);

  return (
    <group
      name="editor-window-light-manager"
      userData={{
        activeWindowLights: activeWindows.length,
        maxWindowLights: lighting.windows.maxActiveLights,
      }}
    >
      {activeWindows.map((window) => (
        <WindowAreaLight key={window.id} window={window} />
      ))}
    </group>
  );
}
