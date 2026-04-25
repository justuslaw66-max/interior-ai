import type { AISuggestionAction } from "@/lib/ai/applySuggestion";
import type { AABB } from "@/lib/snapGuides";

export const STYLES = ["Scandi", "Luxury", "Modern", "Japandi", "Minimalistic"] as const;
export type Style = (typeof STYLES)[number];

export type CameraView = {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
};

export type NamedCameraView = {
  name: string;
  view: CameraView;
};

export type LayoutPlan = {
  picks?: Partial<Record<"sofa" | "rug" | "coffee_table" | "tv_console" | "accent_chair" | "floor_lamp", string | null>>;
};

export type AINotesResponse = {
  summary: string[];
  rationale: string;
  suggestions: Array<{
    id: string;
    label: string;
    action: AISuggestionAction;
  }>;
  cached?: boolean;
  ms?: number;
};

export type SnapNeighbor = {
  aabb: AABB;
  label: string;
};

export type PlanLayerPresetId = "presentation" | "technical" | "staging";

export const PLAN_LAYER_PRESETS: Record<
  PlanLayerPresetId,
  {
    label: string;
    theme: "consumer" | "pro";
    layers: {
      grid: boolean;
      dimensions: boolean;
      labels: boolean;
      openings: boolean;
      builtIns: boolean;
      zones: boolean;
      annotations: boolean;
    };
  }
> = {
  presentation: {
    label: "Presentation",
    theme: "consumer",
    layers: {
      grid: false,
      dimensions: false,
      labels: true,
      openings: true,
      builtIns: true,
      zones: true,
      annotations: true,
    },
  },
  technical: {
    label: "Technical",
    theme: "pro",
    layers: {
      grid: true,
      dimensions: true,
      labels: true,
      openings: true,
      builtIns: true,
      zones: true,
      annotations: true,
    },
  },
  staging: {
    label: "Staging",
    theme: "consumer",
    layers: {
      grid: true,
      dimensions: false,
      labels: false,
      openings: true,
      builtIns: false,
      zones: true,
      annotations: false,
    },
  },
};

export type PlanMeasurementUnit = "mm" | "cm" | "in";

export type WallDescriptor = {
  axis: "x" | "z";
  coord: number;
  min: number;
  max: number;
};

export type ConfigurableNodeTransform = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visible?: boolean;
};

export type ConfigurableBoundsCm = {
  width?: number;
  depth?: number;
  height?: number;
};

/**
 * Room bounds define the available floor space for furniture placement.
 * All values in meters, centered at origin (0, 0).
 */
export type RoomBounds = {
  width: number;   // Total room width (X axis)
  depth: number;   // Total room depth (Z axis)
  height?: number; // Room height (optional, for ceiling references)
  wallThickness?: number; // Wall thickness for constraint calculations
};
