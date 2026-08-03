import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveDesignLightingSettings,
  updateDesignLightingSettings,
} from "@/lib/design-lighting-settings";
import { buildDesignPagePresentationLightingState } from "@/lib/useDesignPagePresentationLightingRegistration";
import {
  snapshotToStored,
  storedToSnapshot,
} from "@/lib/room-persistence";
import {
  createRoom,
  type DesignItem,
  type DesignSnapshot,
} from "@/lib/room-types";
import { validateStoredDesignDocument } from "@/lib/design-document-contract";
import {
  cctKelvinToLinearSrgb,
  lumensToCandela,
  resolveLightingQualityBudget,
  resolveLightingScene,
  resolveSolarOrientation,
} from "@/lib/resolve-lighting-scene";
import { DEFAULT_DESIGN_LIGHTING_SETTINGS } from "@/lib/lightingPresets";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import {
  CONSUMER_LIGHTING_MODES,
  EDITOR_LIGHTING_PRESETS,
  resolveEditorLighting,
  resolveLightingMode,
  resolveObjectShadowEligibility,
  resolvePersistedLightingPreset,
  selectFixtureLightBudget,
  selectWindowLightBudget,
} from "@/components/editor/design-page/lighting";

const makeSnapshot = (
  extra: Partial<DesignSnapshot> = {}
): DesignSnapshot => ({
  version: 3,
  rooms: [createRoom("room-1", "Living room")],
  activeRoomId: "room-1",
  ...extra,
});

const defaults = resolveDesignLightingSettings(makeSnapshot());
assert.deepEqual(
  defaults,
  DEFAULT_DESIGN_LIGHTING_SETTINGS,
  "Missing settings should resolve to the versioned Bright & Clear defaults."
);
assert.equal(resolveLightingMode(defaults.preset), "design");
assert.deepEqual(CONSUMER_LIGHTING_MODES, [
  "design",
  "daylight",
  "evening",
]);
for (const mode of CONSUMER_LIGHTING_MODES) {
  const preset = EDITOR_LIGHTING_PRESETS[mode];
  assert.equal(resolvePersistedLightingPreset(mode), preset.persistedId);
  assert.ok(preset.environment.intensity >= 0);
  assert.ok(preset.ambient.intensity >= 0);
  assert.ok(preset.sun.intensity >= 0);
  assert.ok(preset.renderer.exposure > 0);
}
const resolvedDesignLighting = resolveEditorLighting(defaults, {
  performanceMode: "quality",
  liteEnabled: false,
});
assert.equal(resolvedDesignLighting.id, "design");
assert.equal(resolvedDesignLighting.fixtures.maxActiveLights, 0);
assert.equal(resolvedDesignLighting.sun.enabled, true);
assert.equal(resolvedDesignLighting.shadows.mapSize, 2048);
assert.ok(
  Math.abs(
    resolvedDesignLighting.sun.position[0] -
      resolvedDesignLighting.sun.position[2]
  ) >= 4,
  "Bright & Clear should use an asymmetric key direction so perpendicular wall faces do not render at one value."
);
assert.ok(
  resolvedDesignLighting.ambient.intensity >= 0.6 &&
    resolvedDesignLighting.sun.intensity /
      resolvedDesignLighting.ambient.intensity <=
      1.1,
  "Bright & Clear should keep a strong neutral illumination floor and a soft key-to-fill ratio."
);
const resolvedDaylightLighting = resolveEditorLighting(
  {
    ...defaults,
    preset: "daylight",
  },
  {
    performanceMode: "quality",
    liteEnabled: false,
  }
);
assert.ok(
  resolvedDaylightLighting.ambient.intensity >= 0.45 &&
    resolvedDaylightLighting.sun.intensity /
      resolvedDaylightLighting.ambient.intensity <=
      2.4,
  "Natural Daylight may be directional, but its shadow-side walls must remain readable."
);
assert.ok(
  resolvedDaylightLighting.sun.intensity >
    resolvedDesignLighting.sun.intensity,
  "Natural Daylight should retain a stronger directional cue than Bright & Clear."
);
const resolvedEveningPreviewLighting = resolveEditorLighting(
  {
    ...defaults,
    preset: "warm",
  },
  {
    performanceMode: "quality",
    liteEnabled: false,
  }
);
assert.ok(
  resolvedDesignLighting.renderer.exposure <= 1 &&
    resolvedDaylightLighting.renderer.exposure <= 1,
  "Bright & Clear and Natural Daylight should preserve material detail instead of washing out the scene."
);
assert.ok(
  resolvedEveningPreviewLighting.renderer.exposure <=
    resolvedDaylightLighting.renderer.exposure * 0.84,
  "Evening needs a visibly lower exposure than the daytime presets."
);
const legacyWarm = resolveDesignLightingSettings(
  makeSnapshot({ lightingPreset: "warm" })
);
assert.equal(legacyWarm.preset, "warm");
assert.equal(legacyWarm.timeMinutes, 18 * 60 + 30);
assert.equal(
  snapshotToStored(makeSnapshot({ lightingPreset: "warm" })).lighting?.version,
  1,
  "Saving a legacy design should intentionally upgrade it to versioned settings."
);
const structured = resolveDesignLightingSettings(
  makeSnapshot({
    lighting: {
      ...DEFAULT_DESIGN_LIGHTING_SETTINGS,
      preset: "daylight",
      shadowsEnabled: false,
    },
    lightingPreset: "warm",
  })
);
assert.equal(structured.preset, "daylight");
assert.equal(structured.shadowsEnabled, false);
const invalid = resolveDesignLightingSettings(
  makeSnapshot({
    lighting: {
      preset: "invalid",
      shadowsEnabled: "invalid",
    },
    lightingPreset: "warm",
  } as unknown as Partial<DesignSnapshot>)
);
assert.equal(invalid.preset, "warm");
assert.equal(invalid.shadowsEnabled, true);

const updated = updateDesignLightingSettings(makeSnapshot(), {
  preset: "daylight",
  shadowsEnabled: false,
});
assert.equal(updated.lighting?.version, 1);
assert.equal(updated.lighting?.preset, "daylight");
assert.equal(updated.lighting?.shadowsEnabled, false);
assert.equal(
  updated.lightingPreset,
  "daylight",
  "Updates should mirror the preset for legacy clients."
);

const roundTrip = storedToSnapshot(snapshotToStored(updated));
assert.deepEqual(
  roundTrip.lighting,
  updated.lighting,
  "Lighting settings should survive storage serialization."
);
assert.equal(roundTrip.lightingPreset, "daylight");
assert.equal(
  validateStoredDesignDocument(snapshotToStored(updated)).ok,
  true,
  "Valid lighting settings should satisfy the design contract."
);

const invalidStored = {
  ...snapshotToStored(updated),
  lighting: { preset: "night", shadowsEnabled: "yes" },
};
const invalidValidation = validateStoredDesignDocument(invalidStored);
assert.equal(invalidValidation.ok, false);
if (!invalidValidation.ok) {
  assert.ok(
    invalidValidation.issues.some(
      (issue) => issue.path === "$.lighting.preset"
    )
  );
  assert.ok(
    invalidValidation.issues.some(
      (issue) => issue.path === "$.lighting.shadowsEnabled"
    )
  );
}

const warm2700 = cctKelvinToLinearSrgb(2700);
const neutral6500 = cctKelvinToLinearSrgb(6500);
const cool9000 = cctKelvinToLinearSrgb(9000);
assert.ok(
  warm2700[0] > warm2700[2],
  "2700K should resolve to a warm linear-sRGB color."
);
assert.ok(
  warm2700[1] > 0.7 && warm2700[2] > 0.6,
  "2700K should remain warm-white instead of rendering as saturated orange."
);
assert.ok(
  Math.abs(neutral6500[0] - neutral6500[2]) < 0.25,
  "6500K should remain comparatively neutral in linear-sRGB."
);
assert.ok(
  cool9000[0] > 0.8 && cool9000[1] > 0.85,
  "Cool dusk should retain enough red and green to avoid a saturated blue cast."
);
assert.ok(
  Math.abs(lumensToCandela(450, "point") - 450 / (4 * Math.PI)) <
    0.000001,
  "Point-source lumens should map to candela using a full sphere."
);
assert.ok(
  Math.abs(lumensToCandela(800, "spot") - 800 / Math.PI) < 0.000001,
  "Spot-source lumens should use Three.js' physical power convention."
);

const solarNorth = resolveSolarOrientation({
  timeMinutes: 12 * 60,
  planNorthDeg: 0,
  latitude: 1.3,
  longitude: 103.8,
  dateIso: "2026-03-20",
});
const solarEast = resolveSolarOrientation({
  timeMinutes: 12 * 60,
  planNorthDeg: 90,
  latitude: 1.3,
  longitude: 103.8,
  dateIso: "2026-03-20",
});
assert.ok(solarNorth.elevationDeg > 80, "Equatorial equinox noon should be high.");
assert.ok(
  Math.abs(
    ((solarEast.azimuthDeg - solarNorth.azimuthDeg + 360) % 360) - 90
  ) < 0.001,
  "Plan north should rotate solar azimuth deterministically."
);

const lightingRoom: HousePlanRoom2D = {
  id: "room-1",
  name: "Reference room",
  roomType: "living",
  shape: "rectangle",
  x: 2,
  z: 3,
  w: 5,
  d: 4,
  height: 2.7,
};
const fixtureItem: DesignItem = {
  instanceId: "fixture-1",
  productId: "reference-floor-lamp",
  variantId: "default",
  productSnapshot: {
    schemaVersion: 1,
    productId: "reference-floor-lamp",
    variantId: "default",
    name: "Reference floor lamp",
    category: "floor_lamp",
    dimensionsMm: { w: 400, d: 400, h: 1600 },
    variantLabel: "Default",
    assets: {},
    lighting: {
      emitterType: "point",
      localOffsetMeters: [0, 1.5, 0],
      direction: [0, -1, 0],
      beamAngleDeg: 180,
      luminousFluxLumens: 800,
      cctKelvin: 2700,
      dimmable: true,
      verification: "estimated",
    },
  },
  position: [0, 0, 0],
  fixtureLight: {
    isOn: true,
    dimmer: 0.5,
    cctKelvin: 3000,
    beamAngleDeg: 42,
  },
};
const fixtureSnapshot = makeSnapshot({
  rooms: [
    {
      ...createRoom("room-1", "Living room"),
      items: [fixtureItem],
    },
  ],
});
const emptyPresentationLighting = buildDesignPagePresentationLightingState(
  makeSnapshot()
);
assert.deepEqual(emptyPresentationLighting.lightingStatus, {
  placedFixtureCount: 0,
  activeFixtureCount: 0,
  estimatedFixtureCount: 0,
});

const fixtureProductSnapshot = fixtureItem.productSnapshot;
assert.ok(fixtureProductSnapshot);
const nonFixtureItem: DesignItem = {
  ...fixtureItem,
  instanceId: "chair-1",
  productId: "reference-chair",
  productSnapshot: {
    ...fixtureProductSnapshot,
    productId: "reference-chair",
    name: "Reference chair",
    category: "chair",
    lighting: undefined,
  },
  fixtureLight: { isOn: true, dimmer: 1 },
};
assert.deepEqual(
  buildDesignPagePresentationLightingState(
    makeSnapshot({
      rooms: [
        {
          ...createRoom("room-1", "Living room"),
          items: [nonFixtureItem],
        },
      ],
    })
  ).lightingStatus,
  {
    placedFixtureCount: 0,
    activeFixtureCount: 0,
    estimatedFixtureCount: 0,
  },
  "An item-level light override without fixture photometrics must not create a fixture-light entry."
);

const fixturePresentationLighting = buildDesignPagePresentationLightingState(
  fixtureSnapshot
);
assert.equal(fixturePresentationLighting.lightingPreset, "studio");
assert.deepEqual(fixturePresentationLighting.lightingStatus, {
  placedFixtureCount: 1,
  activeFixtureCount: 1,
  estimatedFixtureCount: 1,
});

const fixtureUsingPresetDefault = {
  ...fixtureItem,
  fixtureLight: { dimmer: 1 },
};
const warmDefaultFixtureLighting = buildDesignPagePresentationLightingState({
  ...fixtureSnapshot,
  lighting: { ...DEFAULT_DESIGN_LIGHTING_SETTINGS, preset: "warm" },
  rooms: [
    {
      ...fixtureSnapshot.rooms[0],
      items: [fixtureUsingPresetDefault],
    },
  ],
});
assert.equal(warmDefaultFixtureLighting.lightingStatus.activeFixtureCount, 1);
const explicitlyOffFixtureLighting = buildDesignPagePresentationLightingState({
  ...fixtureSnapshot,
  lighting: { ...DEFAULT_DESIGN_LIGHTING_SETTINGS, preset: "warm" },
  rooms: [
    {
      ...fixtureSnapshot.rooms[0],
      items: [
        {
          ...fixtureUsingPresetDefault,
          fixtureLight: { isOn: false, dimmer: 1 },
        },
      ],
    },
  ],
});
assert.equal(
  explicitlyOffFixtureLighting.lightingStatus.activeFixtureCount,
  0,
  "A per-fixture off override should win over the active preset default."
);

const multiRoomFixtureSnapshot = makeSnapshot({
  rooms: [
    { ...createRoom("room-1", "Living room"), items: [] },
    {
      ...createRoom("room-2", "Bedroom"),
      items: [{ ...fixtureItem, instanceId: "fixture-room-2" }],
    },
  ],
  activeRoomId: "room-1",
});
const inactiveRoomFixtureLighting =
  buildDesignPagePresentationLightingState(multiRoomFixtureSnapshot);
const switchedRoomFixtureLighting = buildDesignPagePresentationLightingState({
  ...multiRoomFixtureSnapshot,
  activeRoomId: "room-2",
});
assert.deepEqual(
  switchedRoomFixtureLighting,
  inactiveRoomFixtureLighting,
  "Fixture status should cover the canonical multi-room document and remain stable across room switches."
);

const fixturesDisabledLighting = buildDesignPagePresentationLightingState({
  ...fixtureSnapshot,
  lighting: {
    ...DEFAULT_DESIGN_LIGHTING_SETTINGS,
    preset: "warm",
    fixtureMasterEnabled: false,
  },
});
assert.equal(fixturesDisabledLighting.lightingStatus.placedFixtureCount, 1);
assert.equal(fixturesDisabledLighting.lightingStatus.activeFixtureCount, 0);
assert.equal(fixturesDisabledLighting.lightingStatus.estimatedFixtureCount, 1);

const dimmedOffLighting = buildDesignPagePresentationLightingState({
  ...fixtureSnapshot,
  rooms: [
    {
      ...fixtureSnapshot.rooms[0],
      items: [
        {
          ...fixtureItem,
          fixtureLight: { ...fixtureItem.fixtureLight, dimmer: 0 },
        },
      ],
    },
  ],
});
assert.equal(dimmedOffLighting.lightingStatus.activeFixtureCount, 0);
const fixtureRoundTrip = storedToSnapshot(
  snapshotToStored(fixtureSnapshot)
);
assert.equal(
  fixtureRoundTrip.rooms[0].items[0].fixtureLight?.beamAngleDeg,
  42,
  "Per-fixture beam width should survive project storage."
);
assert.equal(
  validateStoredDesignDocument(snapshotToStored(fixtureSnapshot)).ok,
  true,
  "A supported beam width should satisfy the document contract."
);
const invalidBeamSnapshot = makeSnapshot({
  rooms: [
    {
      ...createRoom("room-1", "Living room"),
      items: [
        {
          ...fixtureItem,
          fixtureLight: { ...fixtureItem.fixtureLight, beamAngleDeg: 2 },
        },
      ],
    },
  ],
});
const invalidBeamValidation = validateStoredDesignDocument(
  snapshotToStored(invalidBeamSnapshot)
);
assert.equal(invalidBeamValidation.ok, false);
if (!invalidBeamValidation.ok) {
  assert.ok(
    invalidBeamValidation.issues.some((issue) =>
      issue.path.endsWith(".fixtureLight.beamAngleDeg")
    ),
    "Out-of-range beam widths should identify the saved fixture field."
  );
}
const fixtureEntry: SceneRoomItemEntry = {
  item: fixtureItem,
  roomId: lightingRoom.id,
  layerId: "room:room-1:items",
  visible: true,
  roomOffset: { x: lightingRoom.x, z: lightingRoom.z },
  roomFloorElevationMeters: 0,
  roomWidth: lightingRoom.w,
  roomDepth: lightingRoom.d,
  roomHeight: lightingRoom.height!,
  roomPlanShape: "rectangle",
  roomWallThickness: 0.2,
  roomWallModel: "house-plan-shell",
  isActiveRoom: true,
};
const referenceSettings = {
  ...DEFAULT_DESIGN_LIGHTING_SETTINGS,
  preset: "daylight" as const,
  timeMinutes: 12 * 60,
};
const referenceScene = resolveLightingScene({
  settings: referenceSettings,
  rooms: [lightingRoom],
  openings: [
    {
      id: "window-1",
      roomId: lightingRoom.id,
      wall: "north",
      offsetMm: 500,
      widthMm: 1600,
      kind: "window",
    },
  ],
  items: [fixtureEntry],
  qualityMode: "quality",
  liteEnabled: false,
  activeRoomId: lightingRoom.id,
});
assert.equal(referenceScene.fixtures.length, 1);
assert.equal(
  referenceScene.fixtures[0].type,
  "spot",
  "An estimated shaded floor lamp should use one downward beam instead of an omnidirectional point source."
);
assert.deepEqual(referenceScene.fixtures[0].direction, [0, -1, 0]);
assert.equal(
  referenceScene.fixtures[0].powerLumens,
  150,
  "The conservative direct-light estimate should still respect the saved 50% dimmer."
);
assert.equal(referenceScene.fixtures[0].cctKelvin, 3000);
assert.ok(
  Math.abs(referenceScene.fixtures[0].beamAngleRad - (21 * Math.PI) / 180) <
    0.000001,
  "A saved full beam width should reach the renderer as a half-angle."
);
assert.ok(
  referenceScene.fixtures[0].distanceMeters <=
    Math.hypot(lightingRoom.w, lightingRoom.d),
  "Fixture influence must be bounded to the owning-room diagonal."
);
assert.equal(referenceScene.windows[0].widthMeters, 1.6);
assert.equal(referenceScene.windows[0].heightMeters, 1.2);
assert.equal(referenceScene.windows[0].sillMeters, 0.9);
assert.ok(
  referenceScene.windows[0].position[2] <
    lightingRoom.z - lightingRoom.d / 2,
  "A north-wall window emitter should sit immediately outside its opening."
);
assert.equal(referenceScene.diagnostics.estimatedWindowCount, 1);
assert.ok(
  referenceScene.windows[0].powerLumens <=
    referenceScene.sky.luminance * 10_000 * 1.6 * 1.2 * 0.006 + 0.000001,
  "Window aperture lights should use diffuse sky without duplicating direct sun."
);

const inspectionScene = resolveLightingScene({
  settings: DEFAULT_DESIGN_LIGHTING_SETTINGS,
  rooms: [
    lightingRoom,
    {
      ...lightingRoom,
      id: "room-2",
      name: "Adjacent room",
      x: 9,
    },
  ],
  openings: [],
  items: [],
  qualityMode: "auto",
  liteEnabled: false,
  activeRoomId: lightingRoom.id,
});
assert.equal(
  inspectionScene.previewFills.length,
  1,
  "Preview fill should be limited to the active unlit room."
);
assert.equal(inspectionScene.previewFills[0].roomId, lightingRoom.id);
assert.ok(
  inspectionScene.previewFills[0].widthMeters > 1 &&
    inspectionScene.previewFills[0].depthMeters > 1,
  "Preview fill should resolve as a broad panel instead of a point hotspot."
);
assert.ok(
  inspectionScene.sun.rendererIntensity < 0.5,
  "Material Check should retain modeled contrast instead of clipping surfaces."
);

const eveningScene = resolveLightingScene({
  settings: { ...referenceSettings, preset: "warm" },
  rooms: [lightingRoom],
  openings: [],
  items: [fixtureEntry],
  qualityMode: "auto",
  liteEnabled: false,
});
assert.equal(eveningScene.sun.illuminanceLux, 0);
assert.ok(
  eveningScene.sky.colorLinear[2] >= eveningScene.sky.colorLinear[0],
  "Evening exterior light should be cool, never a warm global overlay."
);
assert.ok(
  eveningScene.fixtures[0].colorLinear[0] >
    eveningScene.fixtures[0].colorLinear[2],
  "Evening warmth should remain localized to fixtures."
);
assert.ok(
  eveningScene.fixtures[0].distanceMeters <=
    Math.min(lightingRoom.w, lightingRoom.d) * 0.42,
  "A fixture should illuminate a local zone instead of tinting the full room."
);
assert.ok(
  eveningScene.sky.luminance >= 0.35,
  "Evening should retain a restrained cool exterior contribution."
);
const overBudgetFixtures = Array.from({ length: 7 }, (_, index) => ({
  ...eveningScene.fixtures[0],
  id: `fixture-${index}`,
  priority: index,
  castShadow: true,
}));
const resolvedEveningLighting = resolveEditorLighting(
  { ...referenceSettings, preset: "warm" },
  { performanceMode: "quality", liteEnabled: false }
);
const budgetedEveningFixtures = selectFixtureLightBudget(
  overBudgetFixtures,
  resolvedEveningLighting
);
assert.equal(
  budgetedEveningFixtures.length,
  resolvedEveningLighting.fixtures.maxActiveLights
);
assert.equal(
  budgetedEveningFixtures.filter((fixture) => fixture.castShadow).length,
  resolvedEveningLighting.fixtures.maxShadowCastingLights
);
assert.equal(
  selectFixtureLightBudget(overBudgetFixtures, resolvedDesignLighting).length,
  0,
  "Design View must never mount functional fixture lights."
);
const resolvedPhysicalDaylight = resolveEditorLighting(referenceSettings, {
  performanceMode: "quality",
  liteEnabled: false,
  physicalScene: referenceScene,
});
assert.deepEqual(
  resolvedPhysicalDaylight.sun.position,
  referenceScene.sun.position,
  "Daylight should consume the geographic sun resolved from date, time, location, and plan north."
);
assert.equal(
  selectWindowLightBudget(referenceScene.windows, resolvedPhysicalDaylight)
    .length,
  1,
  "Daylight should mount measured aperture fill inside its window budget."
);
const presentationLighting = resolveEditorLighting(
  { ...referenceSettings, preset: "warm" },
  {
    performanceMode: "auto",
    liteEnabled: false,
    modeOverride: "presentation",
    physicalScene: eveningScene,
  }
);
assert.equal(presentationLighting.id, "presentation");
assert.equal(presentationLighting.sourceMode, "evening");
assert.equal(presentationLighting.quality, "high");
assert.equal(presentationLighting.shadows.mapSize, 4096);
assert.equal(presentationLighting.fixtures.enabled, true);
assert.ok(
  presentationLighting.fixtures.maxActiveLights >
    resolvedEveningLighting.fixtures.maxActiveLights,
  "Presentation should temporarily increase the Evening fixture budget."
);
assert.equal(
  resolveEditorLighting(referenceSettings, {
    performanceMode: "lite",
    liteEnabled: true,
    physicalScene: referenceScene,
  }).fixtures.maxShadowCastingLights,
  0,
  "Low quality must disable fixture shadows."
);
assert.deepEqual(
  resolveObjectShadowEligibility({
    category: "sofa",
    quality: "medium",
  }),
  { castShadow: true, receiveShadow: false }
);
assert.equal(
  resolveObjectShadowEligibility({
    category: "glass decor",
    quality: "high",
  }).castShadow,
  false
);
assert.equal(
  resolveObjectShadowEligibility({ category: "sofa", quality: "low" })
    .castShadow,
  false
);

const overriddenOffScene = resolveLightingScene({
  settings: { ...referenceSettings, preset: "warm" },
  rooms: [lightingRoom],
  openings: [],
  items: [
    {
      ...fixtureEntry,
      item: {
        ...fixtureItem,
        fixtureLight: { ...fixtureItem.fixtureLight, isOn: false },
      },
    },
  ],
  qualityMode: "quality",
  liteEnabled: false,
});
assert.equal(
  overriddenOffScene.fixtures.length,
  0,
  "An explicit fixture override must survive preset switching."
);
assert.equal(resolveLightingQualityBudget("lite", false).maxFixtureShadows, 0);
assert.ok(
  resolveLightingQualityBudget("quality", false).maxFixtureShadows >
    resolveLightingQualityBudget("auto", false).maxFixtureShadows,
  "Quality should budget more fixture shadows than Auto."
);

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const commandBarSource = read("components/editor/EditorCommandBar.tsx");
const drawerSource = read(
  "components/editor/design-page/LightingSettingsDrawer.tsx"
);
const controlsSource = read(
  "components/editor/design-page/LightingSettingsControls.tsx"
);
const canvasSource = read(
  "components/editor/design-page/DesignSceneCanvas.tsx"
);
const presentationSource = read(
  "lib/useDesignPagePresentationWorkspaceRegistration.ts"
);
const presentationLightingSource = read(
  "lib/useDesignPagePresentationLightingRegistration.ts"
);

assert.match(
  commandBarSource,
  /data-testid="editor-command-overflow-lighting"[\s\S]*?Lighting settings/,
  "Lighting settings should open from the existing More menu."
);
assert.match(
  drawerSource,
  /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="lighting-settings-title"/,
  "The drawer should expose an accessible dialog contract."
);
assert.match(
  drawerSource,
  /event\.key === "Escape"[\s\S]*?onClose\(\)/,
  "Escape should close the lighting drawer."
);
assert.match(
  drawerSource,
  /sm:inset-y-0[\s\S]*?sm:right-0/,
  "The mobile bottom sheet should become a right-side desktop drawer."
);
assert.match(
  controlsSource,
  /role="switch"[\s\S]*?checked=\{settings\.shadowsEnabled\}/,
  "The Pro shadow toggle should be announced as a switch."
);
assert.match(
  controlsSource,
  /\{advanced \? \([\s\S]*?data-testid="lighting-pro-controls"[\s\S]*?lighting-exposure-input[\s\S]*?lighting-shadows-toggle[\s\S]*?\) : null\}/,
  "Exposure and shadow controls should be disclosed only in Pro Mode."
);
assert.match(
  controlsSource,
  /lighting-time-input[\s\S]*?lighting-plan-north-input[\s\S]*?lighting-fixture-master/,
  "Pro controls should expose the daylight and fixture features mounted by LightingSystem."
);
assert.match(
  controlsSource,
  /Shadows are paused in Lite mode\./,
  "Lite mode should explain temporary shadow suppression."
);
assert.match(
  canvasSource,
  /const effectiveShadowsEnabled =\s*viewMode === "3d" && lighting\.shadows\.enabled;/,
  "Effective shadows should require 3D and the centralized lighting policy."
);
assert.match(
  canvasSource,
  /shadows=\{effectiveShadowsEnabled \? QUALITY_SHADOW_FILTER : false\}/,
  "Disabled shadows should turn off Canvas shadow-map rendering."
);
assert.doesNotMatch(
  canvasSource,
  /physicallyCorrectLights/,
  "The obsolete physical-light assignment must remain absent."
);
assert.match(
  canvasSource,
  /receiveShadow=\{shadowsEnabled\}[\s\S]*?opacity=\{shadowsEnabled \? 0\.08 : 0\}/,
  "The subtle workspace shadow catcher should turn off with shadows."
);
assert.match(
  presentationLightingSource,
  /runHistoryTransaction\([\s\S]*?updateDesignLightingSettings/,
  "Lighting edits should enter the design history transaction."
);
for (const transactionName of [
  "Change lighting preset",
  "Toggle scene shadows",
  "Change lighting settings",
] as const) {
  assert.ok(
    presentationLightingSource.includes(`"${transactionName}"`),
    `Lighting commands should retain the ${transactionName} history label.`
  );
}
assert.match(
  presentationSource,
  /useDesignPagePresentationLightingRegistration\(\{[\s\S]*?\.\.\.presentationLighting\.state[\s\S]*?lighting: presentationLighting\.actions\.lighting/,
  "Presentation composition should consume the focused lighting registration without duplicating lighting state."
);
const lightingSystemSource = read(
  "components/editor/design-page/lighting/LightingSystem.tsx"
);
const exposureControllerSource = read(
  "components/editor/design-page/lighting/ExposureController.tsx"
);
const environmentControllerSource = read(
  "components/editor/design-page/lighting/EnvironmentController.tsx"
);
const sunControllerSource = read(
  "components/editor/design-page/lighting/SunController.tsx"
);
const fixtureManagerSource = read(
  "components/editor/design-page/lighting/FixtureLightManager.tsx"
);
const shadowBudgetSource = read(
  "components/editor/design-page/lighting/ShadowBudgetManager.ts"
);
const readOnlyViewerSource = read("components/ReadOnlyViewer.tsx");
const shareViewerSource = read("components/ShareViewer.tsx");
const designerCanvasSource = read("components/DesignerCanvas.tsx");
assert.match(
  lightingSystemSource,
  /<ExposureController[\s\S]*?<EnvironmentController[\s\S]*?<ambientLight[\s\S]*?<SunController/,
  "LightingSystem should be the single composition root for renderer, environment, ambient fill, and sun."
);
assert.match(
  exposureControllerSource,
  /outputColorSpace = THREE\.SRGBColorSpace[\s\S]*?toneMapping = THREE\.ACESFilmicToneMapping[\s\S]*?toneMappingExposure = exposure[\s\S]*?applyRendererLightingSettings\(renderer, lighting\.renderer\.exposure\)/,
  "One controller should own sRGB output, ACES, and preset exposure."
);
assert.equal(
  (environmentControllerSource.match(/<Environment\b/g) ?? []).length,
  1,
  "The central controller should mount exactly one global environment."
);
assert.equal(
  (sunControllerSource.match(/<directionalLight\b/g) ?? []).length,
  1,
  "The central controller should mount exactly one primary sun."
);
assert.match(
  environmentControllerSource,
  /EnvironmentFailureBoundary[\s\S]*?getDerivedStateFromError[\s\S]*?using direct and ambient fallback/,
  "Environment failure must leave the scene usable through the central direct and ambient sources."
);
assert.match(
  fixtureManagerSource,
  /slice\(0, lighting\.fixtures\.maxActiveLights\)[\s\S]*?maxShadowCastingLights/,
  "Fixture selection should enforce active-light and shadow-light budgets."
);
assert.match(
  shadowBudgetSource,
  /quality === "low" \|\| transparent[\s\S]*?NON_SHADOW_CATEGORY_PATTERN/,
  "Object shadows should follow the central quality and transparency policy."
);
for (const [name, source] of [
  ["read-only", readOnlyViewerSource],
  ["share", shareViewerSource],
  ["legacy designer", designerCanvasSource],
] as const) {
  assert.match(
    source,
    /<ViewerLighting/,
    `${name} viewer should consume the central lighting contract.`
  );
  assert.doesNotMatch(
    source,
    /<(ambientLight|hemisphereLight|directionalLight|pointLight|spotLight|rectAreaLight)\b/,
    `${name} viewer must not retain an independent global light rig.`
  );
}
assert.doesNotMatch(
  [
    lightingSystemSource,
    environmentControllerSource,
    sunControllerSource,
  ].join("\n"),
  /AnalyticalSky|rectAreaLight|pointLight|spotLight|window-aperture|preview-fill/,
  "The Design View foundation must not restore analytical, aperture, preview, or fixture emitters."
);

console.log("Central lighting architecture and compatibility checks passed.");
