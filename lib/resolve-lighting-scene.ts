import { CATALOG_ITEMS } from "@/lib/catalog";
import type {
  CatalogItemSchema,
  FixturePhotometricMetadata,
  FixturePhotometricVerification,
} from "@/lib/catalog-schema";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  ESTIMATED_CEILING_LIGHT_LUMENS,
  ESTIMATED_FLOOR_LAMP_DIRECT_LUMENS,
  ESTIMATED_SHADED_LAMP_BEAM_DEG,
  ESTIMATED_TABLE_LAMP_DIRECT_LUMENS,
} from "@/lib/fixture-lighting-defaults";
import {
  LIGHTING_PRESETS,
  type DesignLightingSettings,
} from "@/lib/lightingPresets";
import type { DesignItem, PlacedFixtureLightState } from "@/lib/room-types";

export type LinearSrgb = [number, number, number];
export type LightingQualityMode = "auto" | "quality" | "lite";

export type ResolvedLightingQualityBudget = {
  maxFixtureLights: number;
  maxFixtureShadows: number;
  maxWindowLights: number;
  maxWindowShadows: number;
  pmremResolution: number;
};

export type ResolvedFixtureLight = {
  id: string;
  roomId: string;
  type: "point" | "spot";
  position: [number, number, number];
  direction: [number, number, number];
  colorLinear: LinearSrgb;
  cctKelvin: number;
  powerLumens: number;
  intensityCandela: number;
  distanceMeters: number;
  beamAngleRad: number;
  castShadow: boolean;
  verification: FixturePhotometricVerification;
};

export type ResolvedWindowLight = {
  id: string;
  roomId: string;
  wall: RoomOpening2D["wall"];
  position: [number, number, number];
  direction: [number, number, number];
  target: [number, number, number];
  widthMeters: number;
  heightMeters: number;
  sillMeters: number;
  powerLumens: number;
  distanceMeters: number;
  beamAngleRad: number;
  castShadow: boolean;
  estimatedMeasurements: boolean;
};

export type ResolvedPreviewFill = {
  roomId: string;
  position: [number, number, number];
  colorLinear: LinearSrgb;
  powerLumens: number;
  widthMeters: number;
  depthMeters: number;
};

export type ResolvedLightingScene = {
  preset: DesignLightingSettings["preset"];
  exposure: number;
  sky: {
    luminance: number;
    turbidity: number;
    rayleigh: number;
    colorLinear: LinearSrgb;
    pmremResolution: number;
  };
  sun: {
    position: [number, number, number];
    direction: [number, number, number];
    colorLinear: LinearSrgb;
    elevationDeg: number;
    azimuthDeg: number;
    illuminanceLux: number;
    rendererIntensity: number;
    castShadow: boolean;
  };
  windows: ResolvedWindowLight[];
  fixtures: ResolvedFixtureLight[];
  previewFills: ResolvedPreviewFill[];
  quality: ResolvedLightingQualityBudget;
  diagnostics: {
    approximateSun: boolean;
    previewFillActive: boolean;
    estimatedFixtureCount: number;
    estimatedWindowCount: number;
    activeFixtureCount: number;
    inspectionLighting: boolean;
    messages: string[];
  };
};

export type ResolveLightingSceneInput = {
  settings: DesignLightingSettings;
  rooms: readonly HousePlanRoom2D[];
  openings: readonly RoomOpening2D[];
  items: readonly SceneRoomItemEntry[];
  qualityMode: LightingQualityMode;
  liteEnabled: boolean;
  activeRoomId?: string;
};

const DEFAULT_LATITUDE_DEG = 35;
const DEFAULT_DATE_ISO = "2026-03-20";
const DEFAULT_WINDOW_HEIGHT_METERS = 1.2;
const DEFAULT_WINDOW_SILL_METERS = 0.9;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeVector(
  vector: [number, number, number]
): [number, number, number] {
  const length = Math.hypot(...vector);
  if (length < 0.000001) return [0, -1, 0];
  return vector.map((value) => value / length) as [number, number, number];
}

function rotateAroundY(
  vector: [number, number, number],
  radians: number
): [number, number, number] {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    vector[0] * cosine + vector[2] * sine,
    vector[1],
    -vector[0] * sine + vector[2] * cosine,
  ];
}

function srgbChannelToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

/**
 * Converts CCT to a clamped, viewing-adapted linear-sRGB triplet. A raw
 * black-body display color makes 2700K orange and 9000K blue in a way that is
 * far stronger than an adapted eye or camera perceives in a residential room.
 * The restrained white adaptation keeps temperature differences legible
 * without recoloring neutral finishes.
 */
export function cctKelvinToLinearSrgb(kelvin: number): LinearSrgb {
  const clampedKelvin = clamp(kelvin, 1000, 40_000);
  const temperature = clampedKelvin / 100;
  const red =
    temperature <= 66
      ? 255
      : 329.698727446 *
        Math.pow(Math.max(temperature - 60, 0.0001), -0.1332047592);
  const green =
    temperature <= 66
      ? 99.4708025861 * Math.log(temperature) - 161.1195681661
      : 288.1221695283 *
        Math.pow(Math.max(temperature - 60, 0.0001), -0.0755148492);
  const blue =
    temperature >= 66
      ? 255
      : temperature <= 19
        ? 0
        : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  const rawLinear = [red, green, blue].map((channel) =>
    srgbChannelToLinear(clamp(channel, 0, 255) / 255)
  ) as LinearSrgb;
  const neutralAdaptation = clamp(
    0.58 +
      0.18 *
        (1 - Math.min(1, Math.abs(clampedKelvin - 5000) / 4000)),
    0.58,
    0.76
  );
  return rawLinear.map(
    (channel) => channel + (1 - channel) * neutralAdaptation
  ) as LinearSrgb;
}

export function lumensToCandela(
  lumens: number,
  emitterType: "point" | "spot"
): number {
  return Math.max(0, lumens) / (emitterType === "point" ? 4 * Math.PI : Math.PI);
}

export function resolveLightingQualityBudget(
  mode: LightingQualityMode,
  liteEnabled: boolean
): ResolvedLightingQualityBudget {
  if (mode === "lite" || liteEnabled) {
    return {
      maxFixtureLights: 6,
      maxFixtureShadows: 0,
      maxWindowLights: 4,
      maxWindowShadows: 0,
      pmremResolution: 32,
    };
  }
  if (mode === "quality") {
    return {
      maxFixtureLights: 20,
      maxFixtureShadows: 4,
      maxWindowLights: 10,
      maxWindowShadows: 2,
      pmremResolution: 128,
    };
  }
  return {
    maxFixtureLights: 12,
    maxFixtureShadows: 1,
    maxWindowLights: 6,
    maxWindowShadows: 1,
    pmremResolution: 64,
  };
}

function inferFixtureKind(
  item: DesignItem,
  product?: CatalogItemSchema | null
): "table" | "floor" | "ceiling" | null {
  const category = product?.category ?? item.productSnapshot?.category ?? "";
  const search = `${category} ${product?.title ?? ""} ${
    item.productSnapshot?.name ?? ""
  } ${item.productId}`.toLowerCase();
  if (/pendant|ceiling light|downlight/.test(search)) return "ceiling";
  if (/table[_ -]?lamp/.test(search)) return "table";
  if (/floor[_ -]?lamp/.test(search)) return "floor";
  return null;
}

export function resolveFixturePhotometrics(
  item: DesignItem,
  product: CatalogItemSchema | null | undefined = CATALOG_ITEMS[item.productId]
): FixturePhotometricMetadata | null {
  const kind = inferFixtureKind(item, product);
  const authored = item.productSnapshot?.lighting ?? product?.lighting;
  if (authored) {
    const estimatedShadedLamp =
      authored.verification === "estimated" &&
      (kind === "floor" || kind === "table");
    return {
      ...authored,
      // Legacy estimated lamp metadata used a point source, which emitted
      // through the opaque shade and produced wall-sized hotspots. Until a
      // manufacturer or photometric distribution is available, one wide
      // downward cone is the honest approximation for a shaded residential
      // floor/table lamp. Verified metadata remains untouched.
      emitterType: estimatedShadedLamp ? "spot" : authored.emitterType,
      localOffsetMeters: [...authored.localOffsetMeters],
      direction: estimatedShadedLamp
        ? [0, -1, 0]
        : normalizeVector([...authored.direction]),
      beamAngleDeg: estimatedShadedLamp
        ? ESTIMATED_SHADED_LAMP_BEAM_DEG
        : authored.beamAngleDeg,
      luminousFluxLumens: estimatedShadedLamp
        ? kind === "table"
          ? ESTIMATED_TABLE_LAMP_DIRECT_LUMENS
          : ESTIMATED_FLOOR_LAMP_DIRECT_LUMENS
        : authored.luminousFluxLumens,
      emissiveMeshNames: authored.emissiveMeshNames
        ? [...authored.emissiveMeshNames]
        : undefined,
    };
  }

  if (!kind) return null;
  const heightMeters =
    (item.productSnapshot?.dimensionsMm.h ?? product?.dimsMm.h ?? 1200) / 1000;
  const ceiling = kind === "ceiling";
  return {
    emitterType: "spot",
    localOffsetMeters: [
      0,
      Math.max(0.08, heightMeters - (ceiling ? 0.14 : 0.1)),
      0,
    ],
    direction: [0, -1, 0],
    beamAngleDeg: ceiling ? 56 : ESTIMATED_SHADED_LAMP_BEAM_DEG,
    luminousFluxLumens:
      kind === "table"
        ? ESTIMATED_TABLE_LAMP_DIRECT_LUMENS
        : kind === "floor"
          ? ESTIMATED_FLOOR_LAMP_DIRECT_LUMENS
          : ESTIMATED_CEILING_LIGHT_LUMENS,
    cctKelvin: 2700,
    dimmable: true,
    verification: "estimated",
  };
}

function resolveFixtureState(
  state: PlacedFixtureLightState | undefined,
  settings: DesignLightingSettings
) {
  const preset = LIGHTING_PRESETS[settings.preset];
  return {
    isOn: state?.isOn ?? preset.fixtureDefaultOn,
    dimmer: clamp(state?.dimmer ?? 1, 0, 1),
    cctKelvin: clamp(state?.cctKelvin ?? 2700, 1800, 6500),
  };
}

function dayOfYear(dateIso: string): number {
  const [year, month, day] = dateIso.split("-").map(Number);
  const start = Date.UTC(year, 0, 0);
  return Math.max(
    1,
    Math.min(366, Math.floor((Date.UTC(year, month - 1, day) - start) / 86_400_000))
  );
}

export function resolveSolarOrientation({
  timeMinutes,
  planNorthDeg,
  latitude,
  longitude,
  dateIso,
}: {
  timeMinutes: number;
  planNorthDeg: number;
  latitude: number;
  longitude: number;
  dateIso: string;
}) {
  const day = dayOfYear(dateIso);
  const fractionalYear =
    (2 * Math.PI * (day - 1 + (timeMinutes / 60 - 12) / 24)) / 365;
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(fractionalYear) -
      0.032077 * Math.sin(fractionalYear) -
      0.014615 * Math.cos(2 * fractionalYear) -
      0.040849 * Math.sin(2 * fractionalYear));
  const localMeridian = Math.round(longitude / 15) * 15;
  const solarMinutes =
    timeMinutes + equationOfTime + 4 * (longitude - localMeridian);
  const hourAngle = (solarMinutes / 4 - 180) * DEG_TO_RAD;
  const declination =
    0.006918 -
    0.399912 * Math.cos(fractionalYear) +
    0.070257 * Math.sin(fractionalYear) -
    0.006758 * Math.cos(2 * fractionalYear) +
    0.000907 * Math.sin(2 * fractionalYear) -
    0.002697 * Math.cos(3 * fractionalYear) +
    0.00148 * Math.sin(3 * fractionalYear);
  const latitudeRad = clamp(latitude, -90, 90) * DEG_TO_RAD;
  const cosZenith = clamp(
    Math.sin(latitudeRad) * Math.sin(declination) +
      Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle),
    -1,
    1
  );
  const elevationDeg = 90 - Math.acos(cosZenith) * RAD_TO_DEG;
  const azimuthDeg = normalizeDegrees(
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitudeRad) -
        Math.tan(declination) * Math.cos(latitudeRad)
    ) *
      RAD_TO_DEG +
      180
  );
  const worldAzimuth = normalizeDegrees(azimuthDeg + planNorthDeg);
  const elevationRad = elevationDeg * DEG_TO_RAD;
  const azimuthRad = worldAzimuth * DEG_TO_RAD;
  const direction = normalizeVector([
    Math.sin(azimuthRad) * Math.cos(elevationRad),
    Math.sin(elevationRad),
    -Math.cos(azimuthRad) * Math.cos(elevationRad),
  ]);
  return { elevationDeg, azimuthDeg: worldAzimuth, direction };
}

function resolveWindowLight(
  opening: RoomOpening2D,
  room: HousePlanRoom2D,
  settings: DesignLightingSettings,
  exteriorLux: number,
  colorAvailable: boolean
): Omit<ResolvedWindowLight, "castShadow"> {
  const widthMeters = Math.max(0.2, opening.widthMm / 1000);
  const heightMeters =
    typeof opening.heightMm === "number" && opening.heightMm > 0
      ? opening.heightMm / 1000
      : DEFAULT_WINDOW_HEIGHT_METERS;
  const sillMeters =
    typeof opening.bottomMm === "number" && opening.bottomMm >= 0
      ? opening.bottomMm / 1000
      : DEFAULT_WINDOW_SILL_METERS;
  const offsetMeters = opening.offsetMm / 1000;
  const roomHeight = room.height ?? 2.6;
  const centerY = clamp(
    sillMeters + heightMeters / 2,
    0.1,
    roomHeight - 0.1
  );
  const outside = 0.08;
  let position: [number, number, number];
  let direction: [number, number, number];
  if (opening.wall === "north") {
    position = [room.x + offsetMeters, centerY, room.z - room.d / 2 - outside];
    direction = [0, 0, 1];
  } else if (opening.wall === "south") {
    position = [room.x + offsetMeters, centerY, room.z + room.d / 2 + outside];
    direction = [0, 0, -1];
  } else if (opening.wall === "east") {
    position = [room.x + room.w / 2 + outside, centerY, room.z + offsetMeters];
    direction = [-1, 0, 0];
  } else {
    position = [room.x - room.w / 2 - outside, centerY, room.z + offsetMeters];
    direction = [1, 0, 0];
  }
  const target: [number, number, number] = [
    room.x,
    Math.min(1.4, roomHeight * 0.55),
    room.z,
  ];
  const distanceMeters = clamp(Math.hypot(room.w, room.d) + 0.25, 2, 12);
  const targetDistance = Math.max(
    0.5,
    Math.hypot(
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2]
    )
  );
  const halfSpan = Math.max(room.w, room.d) * 0.52;
  return {
    id: opening.id,
    roomId: room.id,
    wall: opening.wall,
    position,
    direction,
    target,
    widthMeters,
    heightMeters,
    sillMeters,
    powerLumens:
      Math.max(0, exteriorLux) *
      widthMeters *
      heightMeters *
      // Window sources supplement the PMREM sky and direct sun; this
      // transmittance scale prevents several apertures from double-counting
      // the same exterior illuminance across a multi-room plan.
      (colorAvailable ? 0.006 : 0.003),
    distanceMeters,
    beamAngleRad: clamp(Math.atan2(halfSpan, targetDistance), 0.42, 1.28),
    estimatedMeasurements:
      typeof opening.heightMm !== "number" ||
      typeof opening.bottomMm !== "number" ||
      !opening.roomId,
  };
}

export function resolveLightingScene({
  settings,
  rooms,
  openings,
  items,
  qualityMode,
  liteEnabled,
  activeRoomId,
}: ResolveLightingSceneInput): ResolvedLightingScene {
  const preset = LIGHTING_PRESETS[settings.preset];
  const quality = resolveLightingQualityBudget(qualityMode, liteEnabled);
  const approximateSun =
    settings.preset !== "studio" &&
    (!settings.location || !settings.dateIso);
  const location = settings.location ?? {
    latitude: DEFAULT_LATITUDE_DEG,
    longitude: 0,
  };
  const solar =
    settings.preset === "studio"
      ? {
          elevationDeg: 52,
          azimuthDeg: 135,
          direction: normalizeVector([0.52, 0.79, 0.34]),
        }
      : resolveSolarOrientation({
          timeMinutes: settings.timeMinutes,
          planNorthDeg: settings.planNorthDeg,
          latitude: location.latitude,
          longitude: location.longitude,
          dateIso: settings.dateIso ?? DEFAULT_DATE_ISO,
        });
  const sunElevationDeg =
    settings.preset === "warm" ? Math.min(0, solar.elevationDeg) : solar.elevationDeg;
  const sunAboveHorizon = sunElevationDeg > 0;
  const sunIlluminanceLux =
    settings.preset === "warm" || !sunAboveHorizon
      ? 0
      : preset.sunIlluminanceLux *
        clamp(Math.sin(sunElevationDeg * DEG_TO_RAD) * 1.7, 0.12, 1);
  const center =
    rooms.length > 0
      ? rooms.reduce(
          (sum, room) => ({
            x: sum.x + room.x / rooms.length,
            z: sum.z + room.z / rooms.length,
          }),
          { x: 0, z: 0 }
        )
      : { x: 0, z: 0 };
  const sunDistance = 30;
  const sunDirection =
    settings.preset === "warm"
      ? normalizeVector([solar.direction[0], -0.02, solar.direction[2]])
      : solar.direction;
  const sunPosition: [number, number, number] = [
    center.x + sunDirection[0] * sunDistance,
    Math.max(1, sunDirection[1] * sunDistance),
    center.z + sunDirection[2] * sunDistance,
  ];

  const resolvedFixtures = items
    .map((entry) => {
      const metadata = resolveFixturePhotometrics(entry.item);
      if (!metadata) return null;
      const itemState = resolveFixtureState(entry.item.fixtureLight, settings);
      if (
        !settings.fixtureMasterEnabled ||
        !itemState.isOn ||
        itemState.dimmer <= 0 ||
        settings.fixtureMasterLevel <= 0
      ) {
        return null;
      }
      const rotation = entry.item.rotationY ?? 0;
      const localOffset = rotateAroundY(metadata.localOffsetMeters, rotation);
      const direction = normalizeVector(
        rotateAroundY(metadata.direction, rotation)
      );
      const kind = inferFixtureKind(
        entry.item,
        CATALOG_ITEMS[entry.item.productId]
      );
      const itemY =
        kind === "ceiling"
          ? Math.max(
              0,
              entry.roomHeight -
                (entry.item.productSnapshot?.dimensionsMm.h ??
                  CATALOG_ITEMS[entry.item.productId]?.dimsMm.h ??
                  1200) /
                  1000
            )
          : entry.item.position[1] ?? 0;
      const position: [number, number, number] = [
        entry.item.position[0] + entry.roomOffset.x + localOffset[0],
        itemY + entry.roomFloorElevationMeters + localOffset[1],
        entry.item.position[2] + entry.roomOffset.z + localOffset[2],
      ];
      const powerLumens =
        metadata.luminousFluxLumens *
        itemState.dimmer *
        settings.fixtureMasterLevel;
      return {
        id: entry.item.instanceId,
        roomId: entry.roomId,
        type: metadata.emitterType,
        position,
        direction,
        colorLinear: cctKelvinToLinearSrgb(
          entry.item.fixtureLight?.cctKelvin ?? metadata.cctKelvin
        ),
        cctKelvin: entry.item.fixtureLight?.cctKelvin ?? metadata.cctKelvin,
        powerLumens,
        intensityCandela: lumensToCandela(
          powerLumens,
          metadata.emitterType
        ),
        distanceMeters: clamp(
          Math.min(entry.roomWidth, entry.roomDepth) * 0.42,
          1.4,
          2.8
        ),
        beamAngleRad: clamp(
          (entry.item.fixtureLight?.beamAngleDeg ??
            metadata.beamAngleDeg) *
            DEG_TO_RAD *
            0.5,
          0.1,
          Math.PI / 2
        ),
        verification: metadata.verification,
      } satisfies Omit<ResolvedFixtureLight, "castShadow">;
    })
    .filter(
      (
        fixture
      ): fixture is Omit<ResolvedFixtureLight, "castShadow"> => fixture !== null
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((fixture) => ({
      ...fixture,
      // LightingSystem owns the final active-light and shadow budgets. Keep
      // every valid candidate eligible here so selected/active-room priority
      // can be applied before truncation.
      castShadow: settings.shadowsEnabled,
    }));

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const windowCandidates = openings
    .filter((opening) => opening.kind === "window")
    .map((opening) => {
      const room =
        (opening.roomId ? roomById.get(opening.roomId) : undefined) ??
        (activeRoomId ? roomById.get(activeRoomId) : undefined) ??
        rooms[0];
      if (!room) return null;
      return resolveWindowLight(
        opening,
        room,
        settings,
        // The directional light already models direct sun. Aperture lights
        // represent diffuse sky entering through the opening, so driving them
        // with solar illuminance would count the sun once per window.
        preset.skyLuminance * 10_000,
        settings.preset !== "warm"
      );
    })
    .filter(
      (
        window
      ): window is Omit<ResolvedWindowLight, "castShadow"> => window !== null
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((window) => ({
      ...window,
      // Diffuse window area sources do not cast shadows. Direct sunlight and
      // its one fitted shadow map remain the SunController responsibility.
      castShadow: false,
    }));

  const illuminatedRoomIds = new Set(
    resolvedFixtures.map((fixture) => fixture.roomId)
  );
  const previewRooms = activeRoomId
    ? rooms.filter((room) => room.id === activeRoomId)
    : rooms.slice(0, 1);
  const previewFills = settings.previewFillEnabled
    ? previewRooms
        .filter((room) => !illuminatedRoomIds.has(room.id))
        .map((room) => ({
          roomId: room.id,
          position: [
            room.x,
            (room.height ?? 2.6) * 0.68,
            room.z,
          ] as [number, number, number],
          colorLinear: cctKelvinToLinearSrgb(5000),
          powerLumens: settings.preset === "warm" ? 35 : 55,
          widthMeters: clamp(room.w * 0.55, 1.2, 4),
          depthMeters: clamp(room.d * 0.55, 1.2, 4),
        }))
    : [];
  const estimatedFixtureCount = resolvedFixtures.filter(
    (fixture) => fixture.verification === "estimated"
  ).length;
  const estimatedWindowCount = windowCandidates.filter(
    (window) => window.estimatedMeasurements
  ).length;
  const messages = [
    ...(approximateSun ? ["Approximate sun"] : []),
    ...(previewFills.length > 0 ? ["Preview fill active"] : []),
    ...(estimatedFixtureCount > 0 ? ["Estimated output"] : []),
    ...(settings.preset === "studio" ? ["Inspection lighting"] : []),
  ];

  return {
    preset: settings.preset,
    exposure:
      preset.baseExposure * Math.pow(2, settings.exposureCompensationEv),
    sky: {
      luminance: preset.skyLuminance,
      turbidity: liteEnabled ? Math.min(3, preset.skyTurbidity) : preset.skyTurbidity,
      rayleigh: preset.skyRayleigh,
      colorLinear: cctKelvinToLinearSrgb(preset.exteriorCctKelvin),
      pmremResolution: quality.pmremResolution,
    },
    sun: {
      position: sunPosition,
      direction: sunDirection,
      colorLinear: cctKelvinToLinearSrgb(
        settings.preset === "studio" ? 5000 : 5700
      ),
      elevationDeg: sunElevationDeg,
      azimuthDeg: solar.azimuthDeg,
      illuminanceLux: sunIlluminanceLux,
      // Three.js directional intensity is unitless. Retain real lux in the
      // diagnostic model and use one documented visualization scale here.
      rendererIntensity: sunIlluminanceLux / 70_000,
      castShadow: settings.shadowsEnabled && !liteEnabled && sunIlluminanceLux > 0,
    },
    windows: windowCandidates,
    fixtures: resolvedFixtures,
    previewFills,
    quality,
    diagnostics: {
      approximateSun,
      previewFillActive: previewFills.length > 0,
      estimatedFixtureCount,
      estimatedWindowCount,
      activeFixtureCount: resolvedFixtures.length,
      inspectionLighting: settings.preset === "studio",
      messages,
    },
  };
}
