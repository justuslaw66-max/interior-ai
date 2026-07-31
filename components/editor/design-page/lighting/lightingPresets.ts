import type {
  DesignLightingSettings,
  LightingPreset as PersistedLightingPreset,
} from "@/lib/lightingPresets";
import type { ResolvedLightingScene } from "@/lib/resolve-lighting-scene";

import type {
  EditorLightingPreset,
  LightingMode,
  LightingQuality,
  ResolvedEditorLighting,
} from "./lightingTypes";

const NEUTRAL_WHITE = "#ffffff";
const NEUTRAL_AMBIENT = "#f7f7f5";

/**
 * Central lighting intentions for the editor. These values are deliberately
 * named and co-located so room, furniture, and page components cannot apply
 * independent global-light compensation.
 */
export const EDITOR_LIGHTING_PRESETS: Record<
  LightingMode,
  EditorLightingPreset
> = {
  design: {
    id: "design",
    persistedId: "studio",
    label: "Bright & Clear",
    description: "Stable neutral light for editing materials and layouts.",
    environment: {
      enabled: true,
      intensity: 0.8,
      backgroundVisible: false,
      resolution: 128,
    },
    sun: {
      enabled: true,
      color: NEUTRAL_WHITE,
      // Keep the horizontal direction deliberately asymmetric so perpendicular
      // wall planes read as distinct faces instead of receiving the same value.
      intensity: 0.65,
      position: [7, 8, 2],
      castShadow: true,
    },
    ambient: {
      enabled: true,
      color: NEUTRAL_AMBIENT,
      intensity: 0.68,
    },
    fixtures: {
      enabled: false,
      maxActiveLights: 0,
      maxShadowCastingLights: 0,
    },
    windows: {
      enabled: false,
      maxActiveLights: 0,
    },
    shadows: {
      enabled: true,
      quality: "medium",
      mapSize: 2048,
      normalBias: 0.02,
      bias: -0.0001,
      radius: 3,
    },
    effects: {
      ambientOcclusion: false,
      contactShadows: true,
      bloom: false,
    },
    renderer: {
      exposure: 0.96,
      outputColorSpace: "srgb",
      toneMapping: "aces",
    },
  },
  daylight: {
    id: "daylight",
    persistedId: "daylight",
    label: "Natural Daylight",
    description: "Clear directional light with neutral daylight fill.",
    environment: {
      enabled: true,
      intensity: 0.68,
      backgroundVisible: false,
      resolution: 128,
    },
    sun: {
      enabled: true,
      color: NEUTRAL_WHITE,
      // Daylight keeps a readable directional cue, but the neutral sky fill
      // sets a floor under faces that do not receive the sun directly.
      intensity: 1.05,
      position: [7, 8, 2],
      castShadow: true,
    },
    ambient: {
      enabled: true,
      color: NEUTRAL_AMBIENT,
      intensity: 0.5,
    },
    fixtures: {
      enabled: false,
      maxActiveLights: 0,
      maxShadowCastingLights: 0,
    },
    windows: {
      enabled: true,
      maxActiveLights: 4,
    },
    shadows: {
      enabled: true,
      quality: "high",
      mapSize: 2048,
      normalBias: 0.02,
      bias: -0.0001,
      radius: 2.5,
    },
    effects: {
      ambientOcclusion: false,
      contactShadows: false,
      bloom: false,
    },
    renderer: {
      exposure: 0.92,
      outputColorSpace: "srgb",
      toneMapping: "aces",
    },
  },
  evening: {
    id: "evening",
    persistedId: "warm",
    label: "Evening",
    description: "Soft, readable evening preview without a global colour cast.",
    environment: {
      enabled: true,
      intensity: 0.38,
      backgroundVisible: false,
      resolution: 128,
    },
    sun: {
      enabled: false,
      color: NEUTRAL_WHITE,
      intensity: 0,
      position: [7, 8, 2],
      castShadow: false,
    },
    ambient: {
      enabled: true,
      color: NEUTRAL_AMBIENT,
      intensity: 0.68,
    },
    fixtures: {
      enabled: true,
      maxActiveLights: 4,
      maxShadowCastingLights: 1,
    },
    windows: {
      enabled: false,
      maxActiveLights: 0,
    },
    shadows: {
      enabled: true,
      quality: "medium",
      mapSize: 2048,
      normalBias: 0.02,
      bias: -0.0001,
      radius: 3,
    },
    effects: {
      ambientOcclusion: false,
      contactShadows: false,
      bloom: false,
    },
    renderer: {
      exposure: 0.76,
      outputColorSpace: "srgb",
      toneMapping: "aces",
    },
  },
  presentation: {
    id: "presentation",
    persistedId: null,
    label: "Presentation",
    description: "High-quality still preview; not used by the normal editor.",
    environment: {
      enabled: true,
      intensity: 0.72,
      backgroundVisible: false,
      resolution: 256,
    },
    sun: {
      enabled: true,
      color: NEUTRAL_WHITE,
      intensity: 1.18,
      position: [7, 8, 2],
      castShadow: true,
    },
    ambient: {
      enabled: true,
      color: NEUTRAL_AMBIENT,
      intensity: 0.38,
    },
    fixtures: {
      enabled: true,
      maxActiveLights: 8,
      maxShadowCastingLights: 2,
    },
    windows: {
      enabled: true,
      maxActiveLights: 6,
    },
    shadows: {
      enabled: true,
      quality: "high",
      mapSize: 4096,
      normalBias: 0.02,
      bias: -0.0001,
      radius: 3,
    },
    effects: {
      ambientOcclusion: false,
      contactShadows: true,
      bloom: false,
    },
    renderer: {
      exposure: 1.02,
      outputColorSpace: "srgb",
      toneMapping: "aces",
    },
  },
};

export const CONSUMER_LIGHTING_MODES = [
  "design",
  "daylight",
  "evening",
] as const satisfies readonly LightingMode[];

export const PERSISTED_PRESET_TO_LIGHTING_MODE: Record<
  PersistedLightingPreset,
  Exclude<LightingMode, "presentation">
> = {
  studio: "design",
  daylight: "daylight",
  warm: "evening",
};

export function resolveLightingMode(
  preset: PersistedLightingPreset
): Exclude<LightingMode, "presentation"> {
  return PERSISTED_PRESET_TO_LIGHTING_MODE[preset];
}

export function resolvePersistedLightingPreset(
  mode: Exclude<LightingMode, "presentation">
): PersistedLightingPreset {
  return EDITOR_LIGHTING_PRESETS[mode]
    .persistedId as PersistedLightingPreset;
}

export function resolveLightingQuality(
  performanceMode: "auto" | "quality" | "lite",
  liteEnabled: boolean
): LightingQuality {
  if (liteEnabled || performanceMode === "lite") return "low";
  if (performanceMode === "quality") return "high";
  return "medium";
}

export function resolveEditorLighting(
  settings: DesignLightingSettings,
  options: {
    performanceMode: "auto" | "quality" | "lite";
    liteEnabled: boolean;
    modeOverride?: LightingMode;
    physicalScene?: Pick<ResolvedLightingScene, "sun">;
  }
): ResolvedEditorLighting {
  const sourceMode = resolveLightingMode(settings.preset);
  const mode = options.modeOverride ?? sourceMode;
  const sourcePreset = EDITOR_LIGHTING_PRESETS[sourceMode];
  const modePreset = EDITOR_LIGHTING_PRESETS[mode];
  const preset =
    mode === "presentation"
      ? {
          ...sourcePreset,
          id: "presentation" as const,
          label: `Presentation · ${sourcePreset.label}`,
          description: modePreset.description,
          environment: {
            ...sourcePreset.environment,
            resolution: modePreset.environment.resolution,
          },
          fixtures: {
            ...modePreset.fixtures,
            enabled: sourcePreset.fixtures.enabled,
          },
          windows: {
            ...modePreset.windows,
            enabled: sourcePreset.windows.enabled,
          },
          shadows: modePreset.shadows,
          effects: modePreset.effects,
        }
      : modePreset;
  const quality =
    mode === "presentation" &&
    !options.liteEnabled &&
    options.performanceMode !== "lite"
      ? "high"
      : resolveLightingQuality(
          options.performanceMode,
          options.liteEnabled
        );
  const qualityShadowMapSize =
    quality === "low"
      ? 1024
      : quality === "high"
        ? preset.shadows.mapSize
        : Math.min(preset.shadows.mapSize, 2048);
  const usePhysicalSun =
    sourceMode === "daylight" && options.physicalScene !== undefined;
  const physicalSun = options.physicalScene?.sun;
  const sun: EditorLightingPreset["sun"] = usePhysicalSun && physicalSun
    ? {
        ...preset.sun,
        enabled: preset.sun.enabled && physicalSun.illuminanceLux > 0,
        position: physicalSun.position,
        color: physicalSun.colorLinear,
        intensity: preset.sun.intensity * physicalSun.rendererIntensity,
      }
    : preset.sun;

  return {
    ...preset,
    sourceMode,
    quality,
    sun,
    environment: {
      ...preset.environment,
      resolution:
        quality === "low"
          ? 32
          : quality === "high"
            ? preset.environment.resolution
            : Math.min(preset.environment.resolution, 128) as 32 | 64 | 128 | 256,
    },
    fixtures: {
      ...preset.fixtures,
      maxActiveLights:
        quality === "low"
          ? Math.min(preset.fixtures.maxActiveLights, 2)
          : quality === "medium"
            ? Math.min(preset.fixtures.maxActiveLights, 4)
            : preset.fixtures.maxActiveLights,
      maxShadowCastingLights:
        quality === "low"
          ? 0
          : quality === "medium"
            ? Math.min(preset.fixtures.maxShadowCastingLights, 1)
            : preset.fixtures.maxShadowCastingLights,
    },
    windows: {
      ...preset.windows,
      maxActiveLights:
        quality === "low"
          ? Math.min(preset.windows.maxActiveLights, 2)
          : quality === "medium"
            ? Math.min(preset.windows.maxActiveLights, 4)
            : preset.windows.maxActiveLights,
    },
    shadows: {
      ...preset.shadows,
      enabled:
        preset.shadows.enabled &&
        settings.shadowsEnabled &&
        quality !== "low",
      mapSize: qualityShadowMapSize as 0 | 1024 | 2048 | 4096,
    },
    effects: {
      ...preset.effects,
      ambientOcclusion:
        preset.effects.ambientOcclusion && quality !== "low",
      contactShadows:
        preset.effects.contactShadows && quality !== "low",
      bloom: preset.effects.bloom && quality === "high",
    },
    renderer: {
      ...preset.renderer,
      exposure:
        preset.renderer.exposure *
        Math.pow(2, settings.exposureCompensationEv),
    },
  };
}
