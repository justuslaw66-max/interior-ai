import {
  DEFAULT_DESIGN_LIGHTING_SETTINGS,
  isLightingPreset,
  type DesignLightingSettings,
} from "@/lib/lightingPresets";
import type { DesignSnapshot } from "@/lib/room-types";

type LightingSnapshot = Pick<DesignSnapshot, "lighting" | "lightingPreset">;

/**
 * Reads the canonical lighting object while accepting the legacy preset field.
 * Invalid or absent values fall back to today's Studio + shadows appearance.
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

  return {
    preset,
    shadowsEnabled:
      typeof lighting?.shadowsEnabled === "boolean"
        ? lighting.shadowsEnabled
        : DEFAULT_DESIGN_LIGHTING_SETTINGS.shadowsEnabled,
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
  const next: DesignLightingSettings = {
    preset: isLightingPreset(patch.preset) ? patch.preset : current.preset,
    shadowsEnabled:
      typeof patch.shadowsEnabled === "boolean"
        ? patch.shadowsEnabled
        : current.shadowsEnabled,
  };

  if (
    snapshot.lighting?.preset === next.preset &&
    snapshot.lighting?.shadowsEnabled === next.shadowsEnabled &&
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
