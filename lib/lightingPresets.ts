/**
 * Lighting preset configurations for different room moods
 */

export type LightingPreset = "daylight" | "warm" | "studio";

export type EnvironmentPreset =
  | "apartment"
  | "city"
  | "dawn"
  | "forest"
  | "lobby"
  | "night"
  | "park"
  | "studio"
  | "sunset"
  | "warehouse";

export interface LightingConfig {
  name: string;
  ambientIntensity: number;
  directionalIntensity: number;
  ambientColor?: string;
  hemiIntensity?: number;
  skyColor?: string;
  groundColor?: string;
  keyIntensity?: number;
  keyColor?: string;
  fillIntensity?: number;
  fillColor?: string;
  exposure?: number;
  envPreset?: EnvironmentPreset;
  shadowBias?: number;
  shadowRadius?: number;
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingConfig> = {
  daylight: {
    name: "Natural Daylight",
    ambientIntensity: 0.16,
    ambientColor: "#f5f4f1",
    hemiIntensity: 0.44,
    skyColor: "#f2f5f9",
    groundColor: "#c9b8a3",
    directionalIntensity: 0.92,
    keyIntensity: 1.15,
    keyColor: "#fffaf0",
    fillIntensity: 0.22,
    fillColor: "#e9eff7",
    exposure: 0.96,
    envPreset: "apartment",
    shadowBias: -0.0012,
    shadowRadius: 2.8,
  },
  warm: {
    name: "Warm Evening",
    ambientIntensity: 0.11,
    ambientColor: "#f3e4d3",
    hemiIntensity: 0.3,
    skyColor: "#f3d6b2",
    groundColor: "#b68d67",
    directionalIntensity: 0.72,
    keyIntensity: 0.9,
    keyColor: "#ffd3a2",
    fillIntensity: 0.14,
    fillColor: "#f3c99c",
    exposure: 0.86,
    envPreset: "sunset",
    shadowBias: -0.002,
    shadowRadius: 3.5,
  },
  studio: {
    name: "Studio White",
    ambientIntensity: 0.18,
    ambientColor: "#f7f7f5",
    hemiIntensity: 0.34,
    skyColor: "#f5f6fa",
    groundColor: "#d9d7d1",
    directionalIntensity: 0.95,
    keyIntensity: 1.18,
    keyColor: "#ffffff",
    fillIntensity: 0.2,
    fillColor: "#edf2fa",
    exposure: 1,
    envPreset: "studio",
    shadowBias: -0.0005,
    shadowRadius: 1.8,
  },
};
