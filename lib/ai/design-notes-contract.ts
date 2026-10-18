import { parseDesignNotesRoom } from "@/lib/ai/design-notes-room";
import type { SurfaceCheckRoom } from "@/lib/floor-plan-surface-checks";

export const DESIGN_NOTES_MAX_BODY_BYTES = 512 * 1024;

type DesignNotesActionType =
  | "RUG_RESIZE_TO_SOFA"
  | "MAKE_CHEAPER"
  | "ADD_LAMP_NEAR_READING"
  | "SWAP_SURFACE";

export type DesignNotesInput = {
  design: {
    id: string | null;
    /** The active room's type and finishes (18 Oct 2026); `null` when the page sent none. */
    room: SurfaceCheckRoom | null;
    items: Array<Record<string, unknown>>;
    categories: string[];
    budget: string | null;
  };
  mode: "homeowner" | "designer";
};

export type DesignNotesOutput = {
  summary: string[];
  rationale: string;
  suggestions: Array<{
    id: string;
    label: string;
    action: {
      type: DesignNotesActionType;
      percent?: number;
      sofaItemId?: string;
      /** SWAP_SURFACE: the room, the surface (only "floor"), the tile to lay and the floor it replaces. */
      roomId?: string;
      surface?: string;
      materialId?: string;
      fromMaterialId?: string | null;
    };
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    ? value.trim()
    : null;
}

/** The string fields AI notes keeps for each item, with their longest allowed length. */
const ITEM_STRING_FIELDS = [
  ["id", 128],
  ["productId", 128],
  ["name", 120],
  ["category", 80],
  ["variantId", 128],
] as const;

/** A whole number of 1 to 999, `undefined` when absent, `null` when invalid. */
function parseItemQuantity(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999 ? value : null;
}

/** A price of 0 to 1,000,000,000; `undefined` when it isn't a number, `null` when out of range. */
function parseItemPrice(value: unknown): number | null | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? value : null;
}

function parseItemSize(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const size: Record<string, number> = {};
  for (const key of ["width", "height", "depth"]) {
    const dimension = value[key];
    if (typeof dimension === "number" && Number.isFinite(dimension) && dimension > 0 && dimension <= 100) {
      size[key] = dimension;
    }
  }
  return size;
}

function parseItemTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((tag) => safeString(tag, 80))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 30);
}

function parseDesignNotesItem(rawItem: unknown): Record<string, unknown> | null {
  if (!isRecord(rawItem)) return null;
  const item: Record<string, unknown> = {};
  for (const [key, maxLength] of ITEM_STRING_FIELDS) {
    const text = safeString(rawItem[key], maxLength);
    if (text) item[key] = text;
  }
  item.locked = rawItem.locked === true;
  const quantity = parseItemQuantity(rawItem.quantity);
  const price = parseItemPrice(rawItem.price);
  if (quantity === null || price === null) return null;
  if (quantity !== undefined) item.quantity = quantity;
  if (price !== undefined) item.price = price;
  const size = parseItemSize(rawItem.size);
  if (size) item.size = size;
  const tags = parseItemTags(rawItem.tags);
  if (tags) item.tags = tags;
  return item;
}

export function parseDesignNotesInput(value: unknown): DesignNotesInput | null {
  if (!isRecord(value) || !isRecord(value.design)) return null;
  const mode = value.mode === "designer" ? "designer" : "homeowner";
  const rawItems = value.design.items;
  const rawCategories = value.design.categories;
  if (!Array.isArray(rawItems) || rawItems.length > 500) return null;
  if (rawCategories !== undefined && (!Array.isArray(rawCategories) || rawCategories.length > 100)) {
    return null;
  }

  const items: Array<Record<string, unknown>> = [];
  for (const rawItem of rawItems) {
    const item = parseDesignNotesItem(rawItem);
    if (!item) return null;
    items.push(item);
  }

  const categories = Array.isArray(rawCategories)
    ? rawCategories
        .map((entry) => safeString(entry, 80))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  if (categories.length !== (rawCategories?.length ?? 0)) return null;

  const id = value.design.id === undefined || value.design.id === null
    ? null
    : safeString(value.design.id, 64);
  if (value.design.id !== undefined && value.design.id !== null && !id) return null;

  return {
    design: {
      id,
      room: parseDesignNotesRoom(value.design.room),
      items,
      categories,
      budget: safeString(value.design.budget, 40),
    },
    mode,
  };
}

const ACTION_TYPES = new Set<DesignNotesActionType>([
  "RUG_RESIZE_TO_SOFA",
  "MAKE_CHEAPER",
  "ADD_LAMP_NEAR_READING",
  "SWAP_SURFACE",
]);

type DesignNotesAction = DesignNotesOutput["suggestions"][number]["action"];

function parseDesignNotesAction(raw: Record<string, unknown>): DesignNotesAction | null {
  const type = raw.type;
  if (typeof type !== "string" || !ACTION_TYPES.has(type as DesignNotesActionType)) return null;
  const action: DesignNotesAction = { type: type as DesignNotesActionType };
  if (raw.percent !== undefined) {
    const percent = raw.percent;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
    action.percent = percent;
  }
  for (const key of ["sofaItemId", "roomId", "surface"] as const) {
    const text = safeString(raw[key], 128);
    if (text) action[key] = text;
  }
  const materialId = safeString(raw.materialId, 200);
  if (materialId) action.materialId = materialId;
  if (type === "SWAP_SURFACE" && (!action.roomId || !action.surface || !action.materialId)) return null;
  return action;
}

export function parseDesignNotesOutput(value: unknown): DesignNotesOutput | null {
  if (!isRecord(value) || !Array.isArray(value.summary) || !Array.isArray(value.suggestions)) {
    return null;
  }
  if (value.summary.length < 3 || value.summary.length > 6) return null;
  const summary = value.summary.map((entry) => safeString(entry, 500));
  const rationale = safeString(value.rationale, 3_000);
  if (summary.some((entry) => !entry) || !rationale) return null;
  if (value.suggestions.length < 1 || value.suggestions.length > 6) return null;

  const suggestions: DesignNotesOutput["suggestions"] = [];
  for (const entry of value.suggestions) {
    if (!isRecord(entry) || !isRecord(entry.action)) return null;
    const id = safeString(entry.id, 128);
    const label = safeString(entry.label, 500);
    const action = parseDesignNotesAction(entry.action);
    if (!id || !label || !action) return null;
    suggestions.push({ id, label, action });
  }

  return { summary: summary as string[], rationale, suggestions };
}
