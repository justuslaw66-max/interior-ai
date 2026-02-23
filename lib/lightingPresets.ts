/**
 * Lighting preset configurations for different room moods
 */

export type LightingPreset = "daylight" | "warm" | "studio";

export interface LightingConfig {
  name: string;
  ambientIntensity: number;
  directionalIntensity: number;
  shadowBias?: number;
  shadowRadius?: number;
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingConfig> = {
  daylight: {
    name: "Soft Daylight",
    ambientIntensity: 0.6,
    directionalIntensity: 1.2,
    shadowBias: -0.001,
    shadowRadius: 2.5,
  },
  warm: {
    name: "Warm Evening",
    ambientIntensity: 0.35,
    directionalIntensity: 0.8,
    shadowBias: -0.002,
    shadowRadius: 3.5,
  },
  studio: {
    name: "Studio Neutral",
    ambientIntensity: 0.5,
    directionalIntensity: 1.0,
    shadowBias: -0.0005,
    shadowRadius: 1.8,
  },
};
