"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type {
  EditorFixtureLight,
  ResolvedEditorLighting,
} from "./lightingTypes";

export function selectFixtureLightBudget(
  fixtures: readonly EditorFixtureLight[],
  lighting: ResolvedEditorLighting
): Array<EditorFixtureLight & { castShadow: boolean }> {
  if (!lighting.fixtures.enabled) return [];

  return [...fixtures]
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id)
    )
    .slice(0, lighting.fixtures.maxActiveLights)
    .map((fixture, index) => ({
      ...fixture,
      castShadow:
        lighting.shadows.enabled &&
        fixture.castShadow &&
        index < lighting.fixtures.maxShadowCastingLights,
    }));
}

function SpotFixtureLight({
  fixture,
  common,
}: {
  fixture: EditorFixtureLight & { castShadow: boolean };
  common: {
    name: string;
    position: [number, number, number];
    color: [number, number, number];
    power: number;
    distance: number;
    decay: number;
    castShadow: boolean;
    "shadow-mapSize-width": number;
    "shadow-mapSize-height": number;
    "shadow-bias": number;
    "shadow-normalBias": number;
  };
}) {
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(
    fixture.position[0] + fixture.direction[0],
    fixture.position[1] + fixture.direction[1],
    fixture.position[2] + fixture.direction[2]
  );
  target.updateMatrixWorld();

  return (
    <>
      <primitive object={target} />
      <spotLight
        {...common}
        target={target}
        angle={fixture.beamAngleRad}
        penumbra={0.35}
      />
    </>
  );
}

export function FixtureLightManager({
  fixtures,
  lighting,
}: {
  fixtures: readonly EditorFixtureLight[];
  lighting: ResolvedEditorLighting;
}) {
  // Memoized, so the count below is read from a value nothing changes later and the
  // userData memo holds (react-hooks/preserve-manual-memoization).
  const activeFixtures = useMemo(() => selectFixtureLightBudget(fixtures, lighting), [fixtures, lighting]);
  const activeFixtureLights = activeFixtures.length;
  const { maxActiveLights: maxFixtureLights, maxShadowCastingLights: maxFixtureShadows } = lighting.fixtures;
  // Stable user data: a page re-render that changes nothing here doesn't make R3F redraw.
  const userData = useMemo(
    () => ({ activeFixtureLights, maxFixtureLights, maxFixtureShadows }),
    [activeFixtureLights, maxFixtureLights, maxFixtureShadows]
  );

  return (
    <group name="editor-fixture-light-manager" userData={userData}>
      {activeFixtures.map((fixture) => {
        const common = {
          name: `editor-fixture-light:${fixture.id}`,
          position: fixture.position,
          color: fixture.colorLinear,
          power: fixture.powerLumens,
          distance: fixture.distanceMeters,
          decay: 2,
          castShadow: fixture.castShadow,
          "shadow-mapSize-width": 1024,
          "shadow-mapSize-height": 1024,
          "shadow-bias": -0.0001,
          "shadow-normalBias": 0.02,
        } as const;

        if (fixture.type === "spot") {
          return (
            <SpotFixtureLight
              key={fixture.id}
              fixture={fixture}
              common={common}
            />
          );
        }

        return <pointLight key={fixture.id} {...common} />;
      })}
    </group>
  );
}
