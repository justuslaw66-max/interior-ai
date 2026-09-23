import {
  DEFAULT_DESIGN_LIGHTING_SETTINGS,
  LIGHTING_PRESETS,
  isLightingPreset,
  type DesignLightingSettings,
} from "@/lib/lightingPresets";
import type { DesignSnapshot } from "@/lib/room-types";

type LightingSnapshot = Pick<DesignSnapshot, "lighting" | "lightingPreset">;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveLocation(
  value: DesignLightingSettings["location"] | undefined
): DesignLightingSettings["location"] | undefined {
  if (
    !value ||
    !Number.isFinite(value.latitude) ||
    !Number.isFinite(value.longitude)
  ) {
    return undefined;
  }
  return {
    latitude: clamp(value.latitude, -90, 90),
    longitude: clamp(value.longitude, -180, 180),
  };
}

/**
 * Reads the canonical lighting object while accepting the legacy preset field.
 * Invalid or absent values fall back without mutating the loaded snapshot.
 */
export function resolveDesignLightingSettings(
  snapshot: LightingSnapshot
): DesignLightingSettings {
  const lighting =
    snapshot.lighting && typeof snapshot.lighting === "object"
      ? snapshot.lighting
      : undefined;
  const preset = isLightingPreset(lighting?.preset)
    ? lighting.preset
    : isLightingPreset(snapshot.lightingPreset)
      ? snapshot.lightingPreset
      : DEFAULT_DESIGN_LIGHTING_SETTINGS.preset;

  const location = resolveLocation(lighting?.location);
  const dateIso =
    typeof lighting?.dateIso === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(lighting.dateIso)
      ? lighting.dateIso
      : undefined;

  return {
    version: 1,
    preset,
    timeMinutes: clamp(
      finiteNumber(
        lighting?.timeMinutes,
        LIGHTING_PRESETS[preset].defaultTimeMinutes
      ),
      0,
      1439
    ),
    planNorthDeg:
      ((finiteNumber(
        lighting?.planNorthDeg,
        DEFAULT_DESIGN_LIGHTING_SETTINGS.planNorthDeg
      ) %
        360) +
        360) %
      360,
    ...(location ? { location } : {}),
    ...(dateIso ? { dateIso } : {}),
    exposureCompensationEv: clamp(
      finiteNumber(
        lighting?.exposureCompensationEv,
        DEFAULT_DESIGN_LIGHTING_SETTINGS.exposureCompensationEv
      ),
      -3,
      3
    ),
    fixtureMasterEnabled:
      typeof lighting?.fixtureMasterEnabled === "boolean"
        ? lighting.fixtureMasterEnabled
        : DEFAULT_DESIGN_LIGHTING_SETTINGS.fixtureMasterEnabled,
    fixtureMasterLevel: clamp(
      finiteNumber(
        lighting?.fixtureMasterLevel,
        DEFAULT_DESIGN_LIGHTING_SETTINGS.fixtureMasterLevel
      ),
      0,
      1
    ),
    shadowsEnabled:
      typeof lighting?.shadowsEnabled === "boolean"
        ? lighting.shadowsEnabled
        : DEFAULT_DESIGN_LIGHTING_SETTINGS.shadowsEnabled,
    previewFillEnabled:
      typeof lighting?.previewFillEnabled === "boolean"
        ? lighting.previewFillEnabled
        : DEFAULT_DESIGN_LIGHTING_SETTINGS.previewFillEnabled,
  };
}

/**
 * Updates the canonical settings and mirrors the preset to the legacy field so
 * older clients continue to render the same scene.
 */
export function updateDesignLightingSettings(
  snapshot: DesignSnapshot,
  patch: Partial<DesignLightingSettings>
): DesignSnapshot {
  const current = resolveDesignLightingSettings(snapshot);
  const next = resolveDesignLightingSettings({
    lighting: {
      ...current,
      ...patch,
      preset: isLightingPreset(patch.preset) ? patch.preset : current.preset,
    },
    lightingPreset: current.preset,
  } as LightingSnapshot);

  if (
    JSON.stringify(snapshot.lighting) === JSON.stringify(next) &&
    snapshot.lightingPreset === next.preset
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    lighting: next,
    lightingPreset: next.preset,
  };
}
