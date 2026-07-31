import type { LightingPreset as PersistedLightingPreset } from "@/lib/lightingPresets";
import type {
  ResolvedFixtureLight,
  ResolvedWindowLight,
} from "@/lib/resolve-lighting-scene";

export type LightingMode =
  | "design"
  | "daylight"
  | "evening"
  | "presentation";

export type LightingQuality = "low" | "medium" | "high";

export type LightingShadowQuality =
  | "off"
  | "low"
  | "medium"
  | "high";

export type LightingColor = string | [number, number, number];

export type EditorLightingPreset = {
  id: LightingMode;
  persistedId: PersistedLightingPreset | null;
  label: string;
  description: string;
  environment: {
    enabled: boolean;
    intensity: number;
    backgroundVisible: boolean;
    resolution: 32 | 64 | 128 | 256;
  };
  sun: {
    enabled: boolean;
    color: LightingColor;
    intensity: number;
    position: [number, number, number];
    castShadow: boolean;
  };
  ambient: {
    enabled: boolean;
    color: string;
    intensity: number;
  };
  fixtures: {
    enabled: boolean;
    maxActiveLights: number;
    maxShadowCastingLights: number;
  };
  windows: {
    enabled: boolean;
    maxActiveLights: number;
  };
  shadows: {
    enabled: boolean;
    quality: LightingShadowQuality;
    mapSize: 0 | 1024 | 2048 | 4096;
    normalBias: number;
    bias: number;
    radius: number;
  };
  effects: {
    ambientOcclusion: boolean;
    contactShadows: boolean;
    bloom: boolean;
  };
  renderer: {
    exposure: number;
    outputColorSpace: "srgb";
    toneMapping: "aces";
  };
};

export type ResolvedEditorLighting = EditorLightingPreset & {
  sourceMode: Exclude<LightingMode, "presentation">;
  quality: LightingQuality;
  renderer: EditorLightingPreset["renderer"] & {
    exposure: number;
  };
  shadows: EditorLightingPreset["shadows"] & {
    enabled: boolean;
  };
};

export type EditorFixtureLight = ResolvedFixtureLight & {
  priority?: number;
};

export type EditorWindowLight = ResolvedWindowLight & {
  priority?: number;
};
