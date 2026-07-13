import type {
  RoomFloorPattern,
  RoomSurfaceAssignments,
  SurfacePattern,
  SurfacePatternOffset,
  SurfaceSettings,
} from "./room-types";
import {
  normalizeWallPaintColorHex,
  normalizeWallPaintName,
} from "./wall-paint";

export type FloorPatternOption = { id: RoomFloorPattern; label: string };

export const FLOOR_PATTERN_OPTIONS: FloorPatternOption[] = [
  { id: "straight", label: "Straight" },
  { id: "brick", label: "Brick" },
  { id: "herringbone", label: "Herringbone" },
  { id: "grid", label: "Grid" },
  { id: "checker", label: "Checker" },
];

export const GARDENIA_TILE_PATTERN_OPTIONS: FloorPatternOption[] = [
  { id: "herringbone", label: "Herringbone" },
  { id: "random_stagger", label: "Staggered" },
  { id: "straight", label: "Solid" },
  { id: "brick", label: "1/2 horizontal" },
  { id: "vertical_brick", label: "1/2 vertical" },
];

export const GARDENIA_DEFAULT_TILE_PATTERN_OPTIONS: FloorPatternOption[] = [
  { id: "straight", label: "Solid" },
  { id: "brick", label: "1/2 horizontal" },
  { id: "vertical_brick", label: "1/2 vertical" },
];

const ALL_FLOOR_PATTERN_OPTIONS: FloorPatternOption[] = [
  ...new Map(
    [...FLOOR_PATTERN_OPTIONS, ...GARDENIA_TILE_PATTERN_OPTIONS].map((option) => [
      option.id,
      option,
    ])
  ).values(),
];

const FLOOR_PATTERN_OPTION_BY_ID = new Map(
  ALL_FLOOR_PATTERN_OPTIONS.map((option) => [option.id, option])
);

export const FLOOR_ROTATION_PRESETS_DEG = [0, 45, 90, 135] as const;
export const DEFAULT_FLOOR_PATTERN: RoomFloorPattern = "straight";
export const DEFAULT_FLOOR_JOINT_SIZE_MM = 2;
export const DEFAULT_FLOOR_JOINT_COLOR = "#d8d2c7";
export const DEFAULT_FLOOR_PATTERN_OFFSET = { x: 0, y: 0 };
export const DEFAULT_WALL_JOINT_COLOR = "#dad7cf";
export const RECTANGULAR_WALL_FACE_IDS = ["north", "east", "south", "west"] as const;

export type FloorPatternOffset = {
  x: number;
  y: number;
};

export type NormalizedFloorSurfaceSettings = {
  floorPattern: RoomFloorPattern;
  floorRotationDeg: number;
  floorScale: number;
  floorPatternOffset: FloorPatternOffset;
  floorJointSizeMm: number;
  floorJointColor: string;
};

export type NormalizedSurfaceSettings = {
  materialId: string | null;
  paintColorHex: string | null;
  paintName: string | null;
  pattern: SurfacePattern;
  rotationDeg: number;
  scale: number;
  offset: SurfacePatternOffset;
  jointSizeMm: number;
  jointColor: string;
};

export type FloorSurfacePatch = Partial<
  Pick<
    RoomSurfaceAssignments,
    | "floorPattern"
    | "floorRotationDeg"
    | "floorScale"
    | "floorPatternOffset"
    | "floorJointSizeMm"
    | "floorJointColor"
  >
>;

export type SurfaceSettingsPatch = Partial<SurfaceSettings>;

const FLOOR_PATTERN_SET = new Set(ALL_FLOOR_PATTERN_OPTIONS.map((option) => option.id));

export function normalizeFloorPattern(value: unknown): RoomFloorPattern {
  return typeof value === "string" && FLOOR_PATTERN_SET.has(value as RoomFloorPattern)
    ? (value as RoomFloorPattern)
    : DEFAULT_FLOOR_PATTERN;
}

export function getFloorPatternOptionsForIds(values: readonly unknown[] | null | undefined): FloorPatternOption[] {
  if (!values) return [];
  const options: FloorPatternOption[] = [];
  const seen = new Set<RoomFloorPattern>();
  for (const value of values) {
    if (typeof value !== "string" || !FLOOR_PATTERN_SET.has(value as RoomFloorPattern)) continue;
    const pattern = value as RoomFloorPattern;
    if (seen.has(pattern)) continue;
    const option = FLOOR_PATTERN_OPTION_BY_ID.get(pattern);
    if (!option) continue;
    options.push(option);
    seen.add(pattern);
  }
  return options;
}

export function normalizeFloorPatternOffset(value: unknown): FloorPatternOffset {
  if (!value || typeof value !== "object") return { ...DEFAULT_FLOOR_PATTERN_OFFSET };
  const candidate = value as Partial<FloorPatternOffset>;
  const x = typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : 0;
  const y = typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : 0;

  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
  };
}

export function normalizeFloorJointSizeMm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_FLOOR_JOINT_SIZE_MM;
  return Math.max(0, Math.min(12, Number(value.toFixed(1))));
}

export function normalizeFloorJointColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_FLOOR_JOINT_COLOR;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : DEFAULT_FLOOR_JOINT_COLOR;
}

export function normalizeSurfaceJointColor(value: unknown, fallback = DEFAULT_FLOOR_JOINT_COLOR): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

export function normalizeSurfaceMaterialId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasOwnSurfaceSetting(settings: SurfaceSettings | undefined, key: keyof SurfaceSettings): boolean {
  return Boolean(settings && Object.prototype.hasOwnProperty.call(settings, key));
}

export function normalizeSurfaceSettings(
  settings: SurfaceSettings | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number,
  options: {
    materialId?: string | null;
    jointColor?: string;
  } = {}
): NormalizedSurfaceSettings {
  const rawMaterialId = hasOwnSurfaceSetting(settings, "materialId")
    ? settings?.materialId
    : options.materialId;
  const materialId = normalizeSurfaceMaterialId(rawMaterialId);
  const paintColorHex = materialId ? null : normalizeWallPaintColorHex(settings?.paintColorHex);
  return {
    materialId,
    paintColorHex,
    paintName: paintColorHex ? normalizeWallPaintName(settings?.paintName) : null,
    pattern: normalizeFloorPattern(settings?.pattern),
    rotationDeg: normalizeRotationDeg(settings?.rotationDeg),
    scale: clampScale(settings?.scale),
    offset: normalizeFloorPatternOffset(settings?.offset),
    jointSizeMm: normalizeFloorJointSizeMm(settings?.jointSizeMm),
    jointColor: normalizeSurfaceJointColor(settings?.jointColor, options.jointColor ?? DEFAULT_FLOOR_JOINT_COLOR),
  };
}

export function normalizeFloorSurfaceSettings(
  surfaces: RoomSurfaceAssignments | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number
): NormalizedFloorSurfaceSettings {
  const genericFloor = surfaces?.floor;
  return {
    floorPattern: normalizeFloorPattern(surfaces?.floorPattern ?? genericFloor?.pattern),
    floorRotationDeg: normalizeRotationDeg(surfaces?.floorRotationDeg ?? genericFloor?.rotationDeg),
    floorScale: clampScale(surfaces?.floorScale ?? genericFloor?.scale),
    floorPatternOffset: normalizeFloorPatternOffset(surfaces?.floorPatternOffset ?? genericFloor?.offset),
    floorJointSizeMm: normalizeFloorJointSizeMm(surfaces?.floorJointSizeMm ?? genericFloor?.jointSizeMm),
    floorJointColor: normalizeFloorJointColor(surfaces?.floorJointColor ?? genericFloor?.jointColor),
  };
}

export function floorSettingsToSurfaceSettings(
  surfaces: RoomSurfaceAssignments | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number
): NormalizedSurfaceSettings {
  const floorSettings = normalizeFloorSurfaceSettings(surfaces, normalizeRotationDeg, clampScale);
  return {
    materialId: normalizeSurfaceMaterialId(surfaces?.floorMaterialId ?? surfaces?.floor?.materialId),
    paintColorHex: null,
    paintName: null,
    pattern: floorSettings.floorPattern,
    rotationDeg: floorSettings.floorRotationDeg,
    scale: floorSettings.floorScale,
    offset: floorSettings.floorPatternOffset,
    jointSizeMm: floorSettings.floorJointSizeMm,
    jointColor: floorSettings.floorJointColor,
  };
}

export function getCeilingSurfaceSettings(
  surfaces: RoomSurfaceAssignments | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number
): NormalizedSurfaceSettings {
  const ceilingSettings = surfaces?.ceiling;
  return normalizeSurfaceSettings(
    {
      ...ceilingSettings,
      paintColorHex: hasOwnSurfaceSetting(ceilingSettings, "paintColorHex")
        ? ceilingSettings?.paintColorHex
        : surfaces?.ceilingColor,
    },
    normalizeRotationDeg,
    clampScale
  );
}

export function getDefaultWallSurfaceSettings(
  surfaces: RoomSurfaceAssignments | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number
): NormalizedSurfaceSettings {
  const defaultSettings = surfaces?.walls?.default;
  const defaultMaterialId = hasOwnSurfaceSetting(defaultSettings, "materialId")
    ? defaultSettings?.materialId
    : surfaces?.wallMaterialId;
  return normalizeSurfaceSettings(
    defaultSettings,
    normalizeRotationDeg,
    clampScale,
    {
      materialId: defaultMaterialId,
      jointColor: DEFAULT_WALL_JOINT_COLOR,
    }
  );
}

export function getWallFaceSurfaceSettings(
  surfaces: RoomSurfaceAssignments | undefined,
  faceId: string | null | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number
): NormalizedSurfaceSettings {
  const defaultSettings = getDefaultWallSurfaceSettings(surfaces, normalizeRotationDeg, clampScale);
  const faceSettings = faceId ? surfaces?.walls?.faces?.[faceId] : undefined;
  return normalizeSurfaceSettings(
    {
      materialId: hasOwnSurfaceSetting(faceSettings, "materialId")
        ? faceSettings?.materialId
        : defaultSettings.materialId,
      paintColorHex: hasOwnSurfaceSetting(faceSettings, "paintColorHex")
        ? faceSettings?.paintColorHex
        : defaultSettings.paintColorHex,
      paintName: hasOwnSurfaceSetting(faceSettings, "paintName")
        ? faceSettings?.paintName
        : defaultSettings.paintName,
      pattern: hasOwnSurfaceSetting(faceSettings, "pattern")
        ? faceSettings?.pattern
        : defaultSettings.pattern,
      rotationDeg: hasOwnSurfaceSetting(faceSettings, "rotationDeg")
        ? faceSettings?.rotationDeg
        : defaultSettings.rotationDeg,
      scale: hasOwnSurfaceSetting(faceSettings, "scale")
        ? faceSettings?.scale
        : defaultSettings.scale,
      offset: hasOwnSurfaceSetting(faceSettings, "offset")
        ? faceSettings?.offset
        : defaultSettings.offset,
      jointSizeMm: hasOwnSurfaceSetting(faceSettings, "jointSizeMm")
        ? faceSettings?.jointSizeMm
        : defaultSettings.jointSizeMm,
      jointColor: hasOwnSurfaceSetting(faceSettings, "jointColor")
        ? faceSettings?.jointColor
        : defaultSettings.jointColor,
    },
    normalizeRotationDeg,
    clampScale,
    {
      jointColor: DEFAULT_WALL_JOINT_COLOR,
    }
  );
}

export function createSurfaceSettingsPatch(
  materialId: string | null | undefined,
  normalizeRotationDeg: (rotationDeg?: number | null) => number,
  clampScale: (scale?: number | null) => number,
  patch: SurfaceSettingsPatch = {},
  base?: SurfaceSettings
): SurfaceSettings {
  const requestedMaterialId = normalizeSurfaceMaterialId(
    patch.materialId !== undefined ? patch.materialId : materialId ?? base?.materialId
  );
  const requestedPaintColorHex = normalizeWallPaintColorHex(
    patch.paintColorHex !== undefined ? patch.paintColorHex : base?.paintColorHex
  );
  const materialWins = Boolean(requestedMaterialId) && patch.paintColorHex === undefined;
  const normalized = normalizeSurfaceSettings(
    {
      ...base,
      ...patch,
      materialId: materialWins ? requestedMaterialId : null,
      paintColorHex: materialWins ? null : requestedPaintColorHex,
      paintName: materialWins
        ? null
        : patch.paintName !== undefined
          ? patch.paintName
          : base?.paintName,
    },
    normalizeRotationDeg,
    clampScale
  );
  return {
    materialId: normalized.materialId,
    paintColorHex: normalized.paintColorHex,
    paintName: normalized.paintName,
    pattern: normalized.pattern,
    rotationDeg: normalized.rotationDeg,
    scale: normalized.scale,
    offset: normalized.offset,
    jointSizeMm: normalized.jointSizeMm,
    jointColor: normalized.jointColor,
  };
}

export function getWallFaceLabel(faceId: string | null | undefined): string {
  if (!faceId) return "Selected wall";
  if (faceId === "north") return "North wall";
  if (faceId === "east") return "East wall";
  if (faceId === "south") return "South wall";
  if (faceId === "west") return "West wall";
  const match = /^wall-(\d+)$/.exec(faceId);
  if (match) return `Wall ${Number(match[1]) + 1}`;
  return faceId.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getDeterministicWallFaceId(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `wall-${value}`;
  }
  if (typeof value !== "string") return "wall-0";
  const trimmed = value.trim();
  if ((RECTANGULAR_WALL_FACE_IDS as readonly string[]).includes(trimmed)) return trimmed;
  if (/^wall-\d+$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `wall-${trimmed}`;
  return trimmed || "wall-0";
}

export function getFloorPatternLabel(pattern: RoomFloorPattern | undefined): string {
  const normalized = normalizeFloorPattern(pattern);
  return ALL_FLOOR_PATTERN_OPTIONS.find((option) => option.id === normalized)?.label ?? "Straight";
}
