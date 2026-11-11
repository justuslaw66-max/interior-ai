import type { FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import type { PlanDrawingPrimitive, PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import type { FurnitureScheduleEntry } from "@/lib/floor-plan-vector-furniture";
import type { DownloadPlanDrawing } from "@/lib/download-plan-drawing";

/**
 * The furnished plan as the Download PDF request carries it: each sheet's paths and labels in
 * world millimetres, rounded to 0.1 mm, and the furniture schedule. Paths carry only M, L, C
 * and Z, so the server checks every one and rebuilds its points from it; nothing the client
 * sends reaches the PDF unread.
 */

export type PlanWirePath = {
  kind: "path"; path: string; role: string; fill?: boolean; paperFill?: boolean;
  paperStrokeMm?: number; paperDashMm?: [number, number]; strokeWidth?: number; inset?: { x: number; z: number };
};
export type PlanWireText = { kind: "text"; text: string; x: number; z: number; role: string; fallback?: string };
export type PlanWireSheet = { title: string; primitives: Array<PlanWirePath | PlanWireText> };
export type PlanWirePayload = { sheets: PlanWireSheet[]; schedule: FurnitureScheduleEntry[]; notDrawn: number };

/** A checked sheet: the drawing to lay out, and each label's stand-in for glyphs the font lacks. */
export type DecodedPlanSheet = { title: string; drawing: PlanVectorDrawing; fallbacks: Map<string, string> };
export type DecodedPlan = { sheets: DecodedPlanSheet[]; schedule: FurnitureScheduleEntry[]; notDrawn: number };

const MAX_SHEETS = 8;
const MAX_PRIMITIVES = 60_000;
const MAX_PATH_CHARS = 20_000;
const MAX_TOTAL_PATH_CHARS = 8_000_000;
const MAX_TEXT_CHARS = 160;
const MAX_COORDINATE_MM = 10_000_000;
const MAX_SCHEDULE = 500;
const ROLE = /^[a-z][a-z_-]{0,39}$/;
const COMMAND_ARGUMENTS: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 };

const tenth = (value: number) => Math.round(value * 10) / 10;

function encodePath(primitive: Extract<PlanDrawingPrimitive, { kind: "path" }>): PlanWirePath {
  const wire: PlanWirePath = { kind: "path", path: primitive.path.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, (value) => String(tenth(Number(value)))), role: primitive.role };
  if (primitive.fill) wire.fill = true;
  if (primitive.paperFill) wire.paperFill = true;
  if (primitive.paperStrokeMm !== undefined) wire.paperStrokeMm = primitive.paperStrokeMm;
  if (primitive.paperDashMm) wire.paperDashMm = primitive.paperDashMm;
  if (primitive.strokeWidth !== undefined) wire.strokeWidth = primitive.strokeWidth;
  if (primitive.strokeInsetNormal) wire.inset = primitive.strokeInsetNormal;
  return wire;
}

export function encodeDownloadPlan(plan: DownloadPlanDrawing): PlanWirePayload {
  return {
    sheets: plan.sheets.map((sheet) => ({
      title: sheet.title,
      primitives: sheet.primitives.map((primitive): PlanWirePath | PlanWireText => primitive.kind === "path" ? encodePath(primitive) : {
        kind: "text", text: primitive.text, x: tenth(primitive.point.xMm), z: tenth(primitive.point.zMm), role: primitive.role,
        ...(sheet.labelFallbacks[primitive.id] ? { fallback: sheet.labelFallbacks[primitive.id] } : {}),
      }),
    })),
    schedule: plan.schedule,
    notDrawn: plan.unsupported.length,
  };
}

const finite = (value: unknown, limit = MAX_COORDINATE_MM): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
/** Printable single-line text: no control characters, no line breaks. */
const oneLine = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit
  && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** The path's coordinate pairs (curve control points included), or null for anything but M, L, C and Z. */
export function planWirePathPoints(path: string): Point[] | null {
  const tokens = path.trim().split(/\s+/);
  if (tokens[0] !== "M") return null;
  const points: Point[] = [];
  for (let index = 0; index < tokens.length;) {
    const count = COMMAND_ARGUMENTS[tokens[index]];
    if (count === undefined) return null;
    const values = tokens.slice(index + 1, index + 1 + count).map(Number);
    if (values.length !== count || !values.every((value) => finite(value))) return null;
    for (let pair = 0; pair < count; pair += 2) points.push({ xMm: values[pair], zMm: values[pair + 1] });
    index += 1 + count;
  }
  return points;
}

type PathPrimitive = Extract<PlanDrawingPrimitive, { kind: "path" }>;
const INVALID = Symbol("invalid");

/** An optional field: absent, valid, or INVALID. */
function optional<T>(value: unknown, valid: (entry: unknown) => entry is T): T | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  return valid(value) ? value : INVALID;
}

const strokeMm = (value: unknown): value is number => finite(value, 5) && value >= 0;
const strokeWidth = (value: unknown): value is number => finite(value, 1_000) && value >= 0;
const dashMm = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((entry) => finite(entry, 20) && entry > 0);
const unitNormal = (value: unknown): value is { x: number; z: number } => record(value) && finite(value.x, 1) && finite(value.z, 1);

/** The path's optional paper styling, or null when any of it is out of range. */
function pathStyle(value: Record<string, unknown>): Partial<PathPrimitive> | null {
  const paperStrokeMm = optional(value.paperStrokeMm, strokeMm);
  const paperDashMm = optional(value.paperDashMm, dashMm);
  const width = optional(value.strokeWidth, strokeWidth);
  const inset = optional(value.inset, unitNormal);
  if (paperStrokeMm === INVALID || paperDashMm === INVALID || width === INVALID || inset === INVALID) return null;
  const style: Partial<PathPrimitive> = {};
  if (value.paperFill === true) style.paperFill = true;
  if (paperStrokeMm !== undefined) style.paperStrokeMm = paperStrokeMm;
  if (paperDashMm) style.paperDashMm = [paperDashMm[0], paperDashMm[1]];
  if (width !== undefined) style.strokeWidth = width;
  if (inset) style.strokeInsetNormal = { x: inset.x, z: inset.z };
  return style;
}

function decodePath(value: Record<string, unknown>, id: string): PlanDrawingPrimitive | null {
  if (typeof value.path !== "string" || value.path.length > MAX_PATH_CHARS || typeof value.role !== "string" || !ROLE.test(value.role)) return null;
  const points = planWirePathPoints(value.path);
  const style = pathStyle(value);
  if (!points?.length || !style) return null;
  return { ...style, id, kind: "path", path: value.path, fill: value.fill === true, points, role: value.role };
}

function decodeText(value: Record<string, unknown>, id: string): { primitive: PlanDrawingPrimitive; fallback?: string } | null {
  if (!oneLine(value.text, MAX_TEXT_CHARS) || !finite(value.x) || !finite(value.z) || typeof value.role !== "string" || !ROLE.test(value.role)) return null;
  const fallback = optional(value.fallback, (entry): entry is string => oneLine(entry, MAX_TEXT_CHARS));
  if (fallback === INVALID) return null;
  return { primitive: { id, kind: "text", text: value.text, point: { xMm: value.x, zMm: value.z }, role: value.role }, fallback };
}

type Budget = { primitives: number; pathChars: number };

/** One wire primitive, checked against its shape and the request's running budget. */
function decodePrimitive(entry: unknown, id: string, budget: Budget, fallbacks: Map<string, string>): PlanDrawingPrimitive | null {
  if (!record(entry)) return null;
  if (entry.kind === "path") {
    budget.pathChars += typeof entry.path === "string" ? entry.path.length : 0;
    return budget.pathChars <= MAX_TOTAL_PATH_CHARS ? decodePath(entry, id) : null;
  }
  if (entry.kind !== "text") return null;
  const text = decodeText(entry, id);
  if (text?.fallback) fallbacks.set(id, text.fallback);
  return text?.primitive ?? null;
}

function decodeSheet(value: unknown, sheetIndex: number, budget: Budget): DecodedPlanSheet | null {
  if (!record(value) || !oneLine(value.title, MAX_TEXT_CHARS) || !Array.isArray(value.primitives)) return null;
  budget.primitives += value.primitives.length;
  if (budget.primitives > MAX_PRIMITIVES) return null;
  const fallbacks = new Map<string, string>();
  const primitives: PlanDrawingPrimitive[] = [];
  for (const [index, entry] of value.primitives.entries()) {
    const primitive = decodePrimitive(entry, `sheet-${sheetIndex}:${index}`, budget, fallbacks);
    if (!primitive) return null;
    primitives.push(primitive);
  }
  return { title: value.title.trim(), drawing: { geometryHash: "", primitives, unsupported: [] }, fallbacks };
}

const wholeNumber = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
const productSize = (value: unknown): value is { w: number; d: number; h: number } =>
  record(value) && [value.w, value.d, value.h].every((entry) => finite(entry, 100_000) && entry > 0);
const roomNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 50 && value.every((room) => oneLine(room, 120));

function decodeScheduleEntry(value: unknown): FurnitureScheduleEntry | null {
  if (!record(value) || !wholeNumber(value.tag, 1, 9_999) || !oneLine(value.name, 200) || !productSize(value.sizeMm)) return null;
  const variant = optional(value.variant, (entry): entry is string => oneLine(entry, 120));
  if (variant === INVALID || !wholeNumber(value.quantity, 1, 100_000) || !roomNames(value.rooms)) return null;
  const { w, d, h } = value.sizeMm;
  return { tag: value.tag, name: value.name, ...(variant ? { variant } : {}), sizeMm: { w, d, h }, quantity: value.quantity, rooms: [...value.rooms] };
}

/** The checked plan, or null when any part of it is malformed or over its limits. */
export function decodeDownloadPlan(value: unknown): DecodedPlan | null {
  if (!record(value) || !Array.isArray(value.sheets) || value.sheets.length > MAX_SHEETS || !Array.isArray(value.schedule) || value.schedule.length > MAX_SCHEDULE) return null;
  const budget = { primitives: 0, pathChars: 0 };
  const sheets = value.sheets.map((sheet, index) => decodeSheet(sheet, index, budget));
  const schedule = value.schedule.map(decodeScheduleEntry);
  const notDrawn = value.notDrawn ?? 0;
  if (sheets.some((sheet) => !sheet) || schedule.some((entry) => !entry) || !wholeNumber(notDrawn, 0, 100_000)) return null;
  return { sheets: sheets.filter((sheet): sheet is DecodedPlanSheet => sheet !== null),
    schedule: schedule.filter((entry): entry is FurnitureScheduleEntry => entry !== null), notDrawn };
}
