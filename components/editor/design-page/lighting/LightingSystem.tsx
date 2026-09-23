"use client";

import type { ResolvedEditorLighting } from "./lightingTypes";
import { EnvironmentController } from "./EnvironmentController";
import { ExposureController } from "./ExposureController";
import { FixtureLightManager } from "./FixtureLightManager";
import { SunController } from "./SunController";
import { ContactShadowController } from "./ContactShadowController";
import { WindowLightManager } from "./WindowLightManager";
import type {
  EditorFixtureLight,
  EditorWindowLight,
} from "./lightingTypes";

/**
 * Single owner for editor-global scene lighting.
 *
 * Furniture and room components may provide materials and fixture metadata,
 * but must not add ambient, environment, or sun lights of their own.
 */
export function LightingSystem({
  lighting,
  shadowCameraHalfSpan,
  fixtures = [],
  windows = [],
  bounds,
}: {
  lighting: ResolvedEditorLighting;
  shadowCameraHalfSpan: number;
  fixtures?: readonly EditorFixtureLight[];
  windows?: readonly EditorWindowLight[];
  bounds?: {
    centerX: number;
    centerZ: number;
    width: number;
    depth: number;
    roomHeight: number;
  };
}) {
  return (
    <group
      name="editor-lighting-system"
      userData={{
        lightingMode: lighting.id,
        lightingQuality: lighting.quality,
      }}
    >
      <ExposureController lighting={lighting} />
      <EnvironmentController lighting={lighting} />
      {lighting.ambient.enabled ? (
        <ambientLight
          name="editor-low-ambient-fill"
          color={lighting.ambient.color}
          intensity={lighting.ambient.intensity}
        />
      ) : null}
      <SunController
        lighting={lighting}
        shadowCameraHalfSpan={shadowCameraHalfSpan}
        targetPosition={
          bounds ? [bounds.centerX, 0, bounds.centerZ] : undefined
        }
      />
      <WindowLightManager windows={windows} lighting={lighting} />
      <FixtureLightManager fixtures={fixtures} lighting={lighting} />
      {bounds ? (
        <ContactShadowController
          lighting={lighting}
          center={[bounds.centerX, bounds.centerZ]}
          width={bounds.width}
          depth={bounds.depth}
          roomHeight={bounds.roomHeight}
        />
      ) : null}
    </group>
  );
}
