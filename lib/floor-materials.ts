import type { RoomType } from "@/lib/room-types";

export type FloorMaterialCategory = "wood" | "tile" | "stone" | "vinyl" | "carpet";
export type FloorPattern = "wood_plank" | "tile_grid" | "soft_fleck" | "plain";

export type FloorMaterial = {
  id: string;
  name: string;
  category: FloorMaterialCategory;
  swatchColor: string;
  accentColor: string;
  renderColor: string;
  planColor: string;
  planMutedColor: string;
  lineColor: string;
  pattern: FloorPattern;
  recommendedRoomTypes: RoomType[];
};

export const DEFAULT_FLOOR_MATERIAL_ID = "natural_oak_plank";
export const DEFAULT_FLOOR_PATTERN_SCALE = 1;
export const MIN_FLOOR_PATTERN_SCALE = 0.5;
export const MAX_FLOOR_PATTERN_SCALE = 2;

export const FLOOR_MATERIALS: FloorMaterial[] = [
  {
    id: "natural_oak_plank",
    name: "Natural oak plank",
    category: "wood",
    swatchColor: "#d8c29a",
    accentColor: "#b99664",
    renderColor: "#d8c19a",
    planColor: "#ded3be",
    planMutedColor: "#e7dfd2",
    lineColor: "#bda783",
    pattern: "wood_plank",
    recommendedRoomTypes: ["living", "bedroom", "dining", "kitchen"],
  },
  {
    id: "pale_ash_plank",
    name: "Pale ash plank",
    category: "wood",
    swatchColor: "#e9ddc5",
    accentColor: "#cdbb9d",
    renderColor: "#eadfc9",
    planColor: "#ebe4d5",
    planMutedColor: "#f0ece4",
    lineColor: "#cdbb9d",
    pattern: "wood_plank",
    recommendedRoomTypes: ["living", "bedroom", "dining"],
  },
  {
    id: "warm_walnut_plank",
    name: "Warm walnut plank",
    category: "wood",
    swatchColor: "#8f6540",
    accentColor: "#5f4028",
    renderColor: "#8a633f",
    planColor: "#c9b39e",
    planMutedColor: "#d8cbbc",
    lineColor: "#745439",
    pattern: "wood_plank",
    recommendedRoomTypes: ["living", "bedroom", "dining"],
  },
  {
    id: "light_stone_tile",
    name: "Light stone tile",
    category: "tile",
    swatchColor: "#d8d5cd",
    accentColor: "#aaa69c",
    renderColor: "#d6d2c8",
    planColor: "#dedbd3",
    planMutedColor: "#e8e6e0",
    lineColor: "#aaa69c",
    pattern: "tile_grid",
    recommendedRoomTypes: ["kitchen", "toilet", "dining"],
  },
  {
    id: "soft_grey_tile",
    name: "Soft grey tile",
    category: "tile",
    swatchColor: "#c9cccc",
    accentColor: "#8f9697",
    renderColor: "#c8cccc",
    planColor: "#d8dddd",
    planMutedColor: "#e4e7e7",
    lineColor: "#9aa1a2",
    pattern: "tile_grid",
    recommendedRoomTypes: ["kitchen", "toilet"],
  },
  {
    id: "warm_neutral_carpet",
    name: "Warm neutral carpet",
    category: "carpet",
    swatchColor: "#cfc6b7",
    accentColor: "#a79c8c",
    renderColor: "#cac0b0",
    planColor: "#ddd5c8",
    planMutedColor: "#e8e1d8",
    lineColor: "#b5aa9a",
    pattern: "soft_fleck",
    recommendedRoomTypes: ["bedroom", "living"],
  },
];

export function getFloorMaterialById(materialId?: string | null): FloorMaterial {
  return FLOOR_MATERIALS.find((material) => material.id === materialId) ?? FLOOR_MATERIALS[0];
}

export function getRecommendedFloorMaterials(roomType?: RoomType): FloorMaterial[] {
  const recommended = FLOOR_MATERIALS.filter((material) =>
    roomType ? material.recommendedRoomTypes.includes(roomType) : true
  );
  return recommended.length > 0 ? recommended : FLOOR_MATERIALS;
}

export function normalizeFloorRotationDeg(rotationDeg?: number | null): number {
  if (typeof rotationDeg !== "number" || !Number.isFinite(rotationDeg)) return 0;
  return (((Math.round(Number(rotationDeg) / 45) * 45) % 360) + 360) % 360;
}

export function clampFloorPatternScale(scale?: number | null): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) return DEFAULT_FLOOR_PATTERN_SCALE;
  return Math.min(MAX_FLOOR_PATTERN_SCALE, Math.max(MIN_FLOOR_PATTERN_SCALE, Number(scale)));
}
