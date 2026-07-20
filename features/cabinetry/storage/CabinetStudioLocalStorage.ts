import type { CabinetHostSpace } from "../types";
import type { SavedCabinetTemplate } from "../components/CabinetryStudio.types";

export type { SavedCabinetTemplate } from "../components/CabinetryStudio.types";

const CABINET_CUSTOM_TEMPLATE_STORAGE_KEY = "interior-ai:millwork-custom-templates:v1";
const CABINET_CUSTOM_SPACE_STORAGE_KEY = "interior-ai:millwork-custom-host-spaces:v1";
const CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY =
  "interior-ai:millwork-inspector-preferences:v1";
const CABINET_STUDIO_STORAGE_VERSION = 1;
const CABINET_CUSTOM_SPACE_LIMIT = 24;
const CABINET_CUSTOM_SPACE_KINDS = ["niche", "opening", "rectangular_area"] as const;
const CABINET_ROOM_TYPES = [
  "living",
  "bedroom",
  "dining",
  "kitchen",
  "toilet",
  "custom",
] as const;

export interface CabinetInspectorPreferences {
  moduleOptionsOpen: boolean;
  advancedOpen: boolean;
  fabricationOpen: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteMeasurement(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isOptionalStoredString(
  value: unknown,
  maximumLength: number
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= maximumLength &&
      value === value.trim())
  );
}

export function isStoredCabinetCustomSpaceKind(
  value: unknown
): value is (typeof CABINET_CUSTOM_SPACE_KINDS)[number] {
  return CABINET_CUSTOM_SPACE_KINDS.some((candidate) => candidate === value);
}

function isStoredCabinetRoomType(
  value: unknown
): value is (typeof CABINET_ROOM_TYPES)[number] {
  return CABINET_ROOM_TYPES.some((candidate) => candidate === value);
}

export function parseStoredCabinetCustomSpace(value: unknown): CabinetHostSpace | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const id = value.id;
  const label = value.label;
  if (
    typeof id !== "string" ||
    id.length > 128 ||
    !/^custom-space-[a-zA-Z0-9_-]+$/.test(id) ||
    !isStoredCabinetCustomSpaceKind(kind) ||
    typeof label !== "string" ||
    label.length === 0 ||
    label.length > 80 ||
    label !== label.trim() ||
    !isOptionalStoredString(value.roomId, 160) ||
    !isOptionalStoredString(value.roomName, 160) ||
    (value.roomType !== undefined && !isStoredCabinetRoomType(value.roomType)) ||
    !isFiniteMeasurement(value.availableWidthMm, 1, 100_000) ||
    !isFiniteMeasurement(value.availableHeightMm, 1, 30_000) ||
    !isFiniteMeasurement(value.availableDepthMm, 1, 30_000) ||
    !isFiniteMeasurement(value.baseboardOffsetMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceLeftMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceRightMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceTopMm, 0, 5_000) ||
    (value.mountingHeightMm !== undefined &&
      !isFiniteMeasurement(value.mountingHeightMm, 0, 30_000)) ||
    !Array.isArray(value.openings) ||
    value.openings.length !== 0
  ) {
    return null;
  }

  return {
    id,
    kind,
    label,
    roomId: value.roomId,
    roomName: value.roomName,
    roomType: value.roomType,
    availableWidthMm: value.availableWidthMm,
    availableHeightMm: value.availableHeightMm,
    availableDepthMm: value.availableDepthMm,
    baseboardOffsetMm: value.baseboardOffsetMm,
    installationClearanceLeftMm: value.installationClearanceLeftMm,
    installationClearanceRightMm: value.installationClearanceRightMm,
    installationClearanceTopMm: value.installationClearanceTopMm,
    mountingHeightMm: value.mountingHeightMm,
    openings: [],
  };
}

export function writeStoredCabinetCustomSpaces(spaces: readonly CabinetHostSpace[]): void {
  if (typeof window === "undefined") return;
  const normalized = spaces
    .map(parseStoredCabinetCustomSpace)
    .filter((space): space is CabinetHostSpace => Boolean(space))
    .slice(-CABINET_CUSTOM_SPACE_LIMIT);
  try {
    if (!normalized.length) {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      CABINET_CUSTOM_SPACE_STORAGE_KEY,
      JSON.stringify({ version: CABINET_STUDIO_STORAGE_VERSION, spaces: normalized })
    );
  } catch {
    // Browser persistence is optional; the current session remains usable.
  }
}

export function readStoredCabinetCustomSpaces(): CabinetHostSpace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== CABINET_STUDIO_STORAGE_VERSION ||
      !Array.isArray(parsed.spaces)
    ) {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
      return [];
    }

    const seen = new Set<string>();
    const spaces: CabinetHostSpace[] = [];
    for (let index = parsed.spaces.length - 1; index >= 0; index -= 1) {
      const space = parseStoredCabinetCustomSpace(parsed.spaces[index]);
      if (!space || seen.has(space.id)) continue;
      seen.add(space.id);
      spaces.unshift(space);
      if (spaces.length === CABINET_CUSTOM_SPACE_LIMIT) break;
    }

    const canonical = JSON.stringify({ version: CABINET_STUDIO_STORAGE_VERSION, spaces });
    if (canonical !== raw) {
      writeStoredCabinetCustomSpaces(spaces);
    }
    return spaces;
  } catch {
    try {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
    } catch {
      // Ignore storage access failures.
    }
    return [];
  }
}

export function capCabinetCustomSpaces(
  spaces: readonly CabinetHostSpace[],
  pinnedSpaceId?: string
): CabinetHostSpace[] {
  const deduplicated = new Map<string, CabinetHostSpace>();
  spaces.forEach((space) => {
    deduplicated.delete(space.id);
    deduplicated.set(space.id, space);
  });
  const allSpaces = Array.from(deduplicated.values());
  const measured = allSpaces.filter((space) => parseStoredCabinetCustomSpace(space));
  const sessionOnly = allSpaces.filter((space) => !parseStoredCabinetCustomSpace(space));
  let keptMeasured = measured.slice(-CABINET_CUSTOM_SPACE_LIMIT);
  const pinned = pinnedSpaceId
    ? measured.find((space) => space.id === pinnedSpaceId)
    : undefined;
  if (pinned && !keptMeasured.some((space) => space.id === pinned.id)) {
    keptMeasured = [pinned, ...keptMeasured.slice(-(CABINET_CUSTOM_SPACE_LIMIT - 1))];
  }
  return [...sessionOnly, ...keptMeasured];
}

export function readCabinetInspectorPreferences(): CabinetInspectorPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== CABINET_STUDIO_STORAGE_VERSION ||
      typeof parsed.moduleOptionsOpen !== "boolean" ||
      typeof parsed.advancedOpen !== "boolean" ||
      typeof parsed.fabricationOpen !== "boolean"
    ) {
      window.localStorage.removeItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
      return null;
    }
    return {
      moduleOptionsOpen: parsed.moduleOptionsOpen,
      advancedOpen: parsed.advancedOpen,
      fabricationOpen: parsed.fabricationOpen,
    };
  } catch {
    try {
      window.localStorage.removeItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
    } catch {
      // Ignore storage access failures.
    }
    return null;
  }
}

export function writeCabinetInspectorPreferences(
  preferences: CabinetInspectorPreferences
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: CABINET_STUDIO_STORAGE_VERSION, ...preferences })
    );
  } catch {
    // Browser persistence is optional; expansion state still works this session.
  }
}

export function readSavedCabinetTemplates(): SavedCabinetTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CABINET_CUSTOM_TEMPLATE_STORAGE_KEY) ?? "[]"
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is SavedCabinetTemplate => {
      if (!value || typeof value !== "object") return false;
      const candidate = value as Partial<SavedCabinetTemplate>;
      return Boolean(
        typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          typeof candidate.savedAt === "string" &&
          candidate.definition &&
          Array.isArray(candidate.definition.modules)
      );
    });
  } catch {
    return [];
  }
}

export function writeSavedCabinetTemplates(templates: readonly SavedCabinetTemplate[]): void {
  try {
    window.localStorage.setItem(CABINET_CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    throw new Error("This browser could not store the reusable template locally.");
  }
}
