/**
 * Versioned lighting settings and the three user-facing scene shortcuts.
 *
 * The preset is deliberately only one input to the lighting resolver. Fixture
 * overrides live on placed items and are never mutated when this value changes.
 */

export type LightingPreset = "daylight" | "warm" | "studio";

export type LightingLocation = {
  latitude: number;
  longitude: number;
};

export interface DesignLightingSettings {
  version: 1;
  preset: LightingPreset;
  timeMinutes: number;
  planNorthDeg: number;
  location?: LightingLocation;
  dateIso?: string;
  exposureCompensationEv: number;
  fixtureMasterEnabled: boolean;
  fixtureMasterLevel: number;
  shadowsEnabled: boolean;
  previewFillEnabled: boolean;
}

export const DEFAULT_DESIGN_LIGHTING_SETTINGS: DesignLightingSettings = {
  version: 1,
  preset: "studio",
  timeMinutes: 12 * 60,
  planNorthDeg: 0,
  exposureCompensationEv: 0,
  fixtureMasterEnabled: true,
  fixtureMasterLevel: 1,
  shadowsEnabled: true,
  previewFillEnabled: true,
};

export function isLightingPreset(value: unknown): value is LightingPreset {
  return value === "daylight" || value === "warm" || value === "studio";
}

export interface LightingConfig {
  name: string;
  description: string;
  defaultTimeMinutes: number;
  baseExposure: number;
  skyLuminance: number;
  skyTurbidity: number;
  skyRayleigh: number;
  sunIlluminanceLux: number;
  exteriorCctKelvin: number;
  fixtureDefaultOn: boolean;
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingConfig> = {
  daylight: {
    name: "Natural Daylight",
    description: "Daylight-balanced sky and sun",
    defaultTimeMinutes: 12 * 60,
    baseExposure: 0.96,
    skyLuminance: 0.28,
    skyTurbidity: 3.2,
    skyRayleigh: 1.4,
    sunIlluminanceLux: 58_000,
    exteriorCctKelvin: 6500,
    fixtureDefaultOn: false,
  },
  warm: {
    name: "Evening",
    description: "Soft, readable evening preview",
    defaultTimeMinutes: 18 * 60 + 30,
    baseExposure: 0.86,
    skyLuminance: 0.36,
    skyTurbidity: 6,
    skyRayleigh: 2.2,
    sunIlluminanceLux: 0,
    exteriorCctKelvin: 9000,
    fixtureDefaultOn: true,
  },
  studio: {
    name: "Bright & Clear",
    description: "Stable neutral light for editing",
    defaultTimeMinutes: 12 * 60,
    baseExposure: 1,
    skyLuminance: 0.3,
    skyTurbidity: 2,
    skyRayleigh: 0.8,
    sunIlluminanceLux: 22_000,
    exteriorCctKelvin: 5000,
    fixtureDefaultOn: false,
  },
};
