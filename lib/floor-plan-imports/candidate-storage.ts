/**
 * How a floor-plan import candidate is stored and sent: its source-drawing marks packed, everything else as it is.
 *
 * A traced page holds thousands of source-drawing marks (the PDF's own vector segments, the faithful trace's paths),
 * and each mark repeats its page frame, scope, provenance and explanation. Packed, a floor keeps its other annotations
 * in `annotations` and its source-drawing marks in `sourceDrawingPack`: the parts they share as templates, their texts
 * in a table, their points as flat number arrays, and where each sat in `annotations`. Unpacking gives back the same
 * JSON, key order included, so the canonical document every reader uses never changes. Every reader accepts both forms
 * (docs/architecture/floor-plan-candidate-storage.md).
 */

export const SOURCE_DRAWING_PACK_FORMAT = "source-drawing-pack-v1";

/**
 * Whether candidates are stored and sent packed. Off in the release that teaches every reader to unpack, so any build
 * the app or the worker can be rolled back to reads a packed candidate before one is written; on in the release after
 * it (the design note's "Rollout"). Until then packing for storage gives the candidate unpacked.
 */
export const STORE_SOURCE_DRAWING_PACKED = false;

/**
 * The most one candidate's packs may expand to (their JSON, roughly), counted across its floors. A client may send a
 * packed candidate, and a small pack whose marks share one large template would otherwise unpack into far more than
 * the 5 MB cap on the unpacked candidate. Three times that cap: the estimate is close to the JSON, so a candidate the
 * cap allows is never refused here.
 */
export const MAX_UNPACKED_SOURCE_DRAWING_BYTES = 16 * 1024 * 1024;

/** The geometry fields that differ from mark to mark, in their packed names. */
const VARIABLE_GEOMETRY_FIELDS = [
  ["pathCommands", "c"],
  ["groupId", "g"],
  ["strokeWidthPx", "w"],
  ["tone", "t"],
  ["fill", "f"],
  ["textRotationDegrees", "r"],
] as const;
type VariableGeometryField = (typeof VARIABLE_GEOMETRY_FIELDS)[number][0];
type PackedExtras = Partial<Record<(typeof VARIABLE_GEOMETRY_FIELDS)[number][1], string | number | boolean>>;

/** [template, id, text, points as x0,y0,x1,y1…, extras] */
type PackedMark = [number, string, number, number[], PackedExtras?];

type SourceDrawingPack = {
  format: typeof SOURCE_DRAWING_PACK_FORMAT;
  templates: Record<string, unknown>[];
  texts: string[];
  /** [index in the unpacked annotations, count]: where consecutive packed marks sat. */
  runs: Array<[number, number]>;
  marks: PackedMark[];
};

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const PATH_COMMANDS = new Set(["M", "L", "C", "Z"]);

function packablePoints(points: unknown): number[] | null {
  if (!Array.isArray(points)) return null;
  const flat: number[] = [];
  for (const point of points) {
    if (!isRecord(point)) return null;
    const keys = Object.keys(point);
    if (keys.length !== 2 || keys[0] !== "x" || keys[1] !== "y") return null;
    if (typeof point.x !== "number" || typeof point.y !== "number") return null;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    flat.push(point.x, point.y);
  }
  return flat;
}

function packedExtra(field: VariableGeometryField, value: unknown): string | number | boolean | null {
  if (field === "pathCommands") {
    return Array.isArray(value) && value.every((command) => typeof command === "string" && PATH_COMMANDS.has(command))
      ? value.join("")
      : null;
  }
  if (field === "groupId") return typeof value === "string" ? value : null;
  if (field === "fill") return typeof value === "boolean" ? value : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A text's length in JSON: a text shared by many marks is written out in full for each, escapes included. */
const jsonLength = (text: string) => JSON.stringify(text).length;

/** What a mark adds to the unpacked JSON, roughly: its template's, its id, text, points and per-mark fields. */
function markCost(templateBytes: number, id: string, textBytes: number, coordinates: number, extras: JsonRecord) {
  let cost = templateBytes + id.length + textBytes + coordinates * 12;
  for (const value of Object.values(extras)) cost += typeof value === "string" ? value.length * 4 : 24;
  return cost;
}

/** A mark split into its template (variable fields left as null, so key order survives) and what is its own. */
function splitMark(annotation: unknown) {
  if (!isRecord(annotation) || typeof annotation.id !== "string" || typeof annotation.text !== "string") return null;
  const geometry = annotation.geometry;
  if (!isRecord(geometry) || geometry.kind !== "source_drawing") return null;
  const points = packablePoints(geometry.points);
  if (!points) return null;
  const extras: PackedExtras = {};
  const templateGeometry: JsonRecord = { ...geometry, points: null };
  for (const [field, packedName] of VARIABLE_GEOMETRY_FIELDS) {
    if (!(field in geometry)) continue;
    const value = packedExtra(field, geometry[field]);
    if (value === null) return null;
    extras[packedName] = value;
    templateGeometry[field] = null;
  }
  const template: JsonRecord = { ...annotation, id: null, text: null, geometry: templateGeometry };
  return { template, id: annotation.id, text: annotation.text, points, extras };
}

/** The floor packed, and what its pack expands to. */
function packFloor(floor: unknown): { floor: unknown; cost: number } {
  if (!isRecord(floor) || !Array.isArray(floor.annotations)) return { floor, cost: 0 };
  const kept: unknown[] = [];
  const pack: SourceDrawingPack = { format: SOURCE_DRAWING_PACK_FORMAT, templates: [], texts: [], runs: [], marks: [] };
  const templateIndex = new Map<string, number>();
  const templateBytes: number[] = [];
  const textIndex = new Map<string, number>();
  const textBytes: number[] = [];
  let cost = 0;
  floor.annotations.forEach((annotation, index) => {
    const mark = splitMark(annotation);
    if (!mark) {
      kept.push(annotation);
      return;
    }
    const key = JSON.stringify(mark.template);
    let template = templateIndex.get(key);
    if (template === undefined) {
      template = pack.templates.push(mark.template) - 1;
      templateBytes.push(key.length);
      templateIndex.set(key, template);
    }
    let text = textIndex.get(mark.text);
    if (text === undefined) {
      text = pack.texts.push(mark.text) - 1;
      textBytes.push(jsonLength(mark.text));
      textIndex.set(mark.text, text);
    }
    const hasExtras = Object.keys(mark.extras).length > 0;
    pack.marks.push(hasExtras ? [template, mark.id, text, mark.points, mark.extras] : [template, mark.id, text, mark.points]);
    cost += markCost(templateBytes[template], mark.id, textBytes[text], mark.points.length, mark.extras);
    const run = pack.runs.at(-1);
    if (run && run[0] + run[1] === index) run[1]++;
    else pack.runs.push([index, 1]);
  });
  if (!pack.marks.length) return { floor, cost: 0 };
  return { floor: { ...floor, annotations: kept, sourceDrawingPack: pack }, cost };
}

function malformed(reason: string): never {
  throw new Error(`Malformed source drawing pack: ${reason}`);
}

/** Templates must be source-drawing marks: a pack can't carry any other kind of annotation. */
const isMarkTemplate = (template: unknown) =>
  isRecord(template) && isRecord(template.geometry) && template.geometry.kind === "source_drawing";

function readPack(value: unknown): SourceDrawingPack {
  if (!isRecord(value) || value.format !== SOURCE_DRAWING_PACK_FORMAT) malformed("unknown format");
  const { templates, texts, runs, marks } = value;
  if (!Array.isArray(templates) || !templates.every(isMarkTemplate)) malformed("templates");
  if (!Array.isArray(texts) || !texts.every((text) => typeof text === "string")) malformed("texts");
  if (!Array.isArray(runs) || !Array.isArray(marks)) malformed("runs or marks");
  return value as SourceDrawingPack;
}

/**
 * What packs have expanded to so far (their JSON, roughly) and what they may: so a pack can't expand without bound, and
 * one budget can cover several documents (a design's).
 */
export type SourceDrawingBudget = { spent: number; limit: number };

export function sourceDrawingBudget(limit = MAX_UNPACKED_SOURCE_DRAWING_BYTES): SourceDrawingBudget {
  return { spent: 0, limit };
}

/** The template's and the texts' JSON lengths, measured once per pack. */
type PackSizes = { templateBytes: number[]; textBytes: number[] };

/** A packed mark's parts, checked against its pack. */
function readMark(pack: SourceDrawingPack, mark: unknown) {
  if (!Array.isArray(mark) || mark.length < 4 || mark.length > 5) malformed("mark");
  const [templateIndex, id, textIndex, points, extras = {}] = mark as PackedMark;
  const template = Number.isSafeInteger(templateIndex) ? pack.templates[templateIndex] : undefined;
  const text = Number.isSafeInteger(textIndex) ? pack.texts[textIndex] : undefined;
  if (!template || !isRecord(template.geometry) || typeof id !== "string" || typeof text !== "string") malformed("mark");
  if (!Array.isArray(points) || points.length % 2 !== 0 || !isRecord(extras)) malformed("mark points");
  return { templateIndex, textIndex, template, geometry: template.geometry, id, text, points, extras };
}

function unpackPoints(points: unknown[]) {
  const unpacked: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += 2) {
    const [x, y] = [points[i], points[i + 1]];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) malformed("mark points");
    unpacked.push({ x, y });
  }
  return unpacked;
}

/** A packed extra as its geometry field holds it, or null when it isn't one `packedExtra` could have written. */
function unpackedExtra(field: VariableGeometryField, value: unknown): unknown {
  if (field === "pathCommands") {
    return typeof value === "string" && [...value].every((command) => PATH_COMMANDS.has(command)) ? [...value] : null;
  }
  return packedExtra(field, value);
}

function unpackMark(pack: SourceDrawingPack, sizes: PackSizes, mark: unknown, budget: SourceDrawingBudget): JsonRecord {
  const { templateIndex, textIndex, template, geometry: templateGeometry, id, text, points, extras } = readMark(pack, mark);
  budget.spent += markCost(sizes.templateBytes[templateIndex], id, sizes.textBytes[textIndex], points.length, extras);
  if (budget.spent > budget.limit) malformed("it expands past the unpacked limit");
  const geometry: JsonRecord = { ...templateGeometry, points: unpackPoints(points) };
  for (const [field, packedName] of VARIABLE_GEOMETRY_FIELDS) {
    if (!(field in templateGeometry)) continue;
    const value = unpackedExtra(field, extras[packedName]);
    if (value === null) malformed(`mark ${id} lacks ${field}`);
    geometry[field] = value;
  }
  return { ...template, id, text, geometry };
}

/** A run as [first index, count], checked against the marks still to place. */
function readRun(run: unknown, remaining: number): [number, number] {
  if (!Array.isArray(run) || !Number.isSafeInteger(run[0]) || !Number.isSafeInteger(run[1])) malformed("run");
  const [start, count] = run as [number, number];
  if (start < 0 || count < 1) malformed("run");
  if (count > remaining) malformed("runs and marks disagree");
  return [start, count];
}

/**
 * Each mark goes back where it sat, and the other annotations fill the rest in order. A mark whose place is gone (code
 * that predates the pack kept it while removing other annotations) goes after them, so nothing is lost.
 */
function unpackFloor(floor: unknown, budget: SourceDrawingBudget): unknown {
  if (!isRecord(floor) || floor.sourceDrawingPack === undefined) return floor;
  const pack = readPack(floor.sourceDrawingPack);
  const kept = Array.isArray(floor.annotations) ? floor.annotations : malformed("annotations");
  const annotations: unknown[] = new Array(kept.length + pack.marks.length);
  const displaced: unknown[] = [];
  const sizes: PackSizes = {
    templateBytes: pack.templates.map((template) => JSON.stringify(template).length),
    textBytes: pack.texts.map(jsonLength),
  };
  let next = 0;
  for (const run of pack.runs) {
    const [start, count] = readRun(run, pack.marks.length - next);
    for (let index = start; index < start + count; index++) {
      const mark = unpackMark(pack, sizes, pack.marks[next++], budget);
      if (index < annotations.length && annotations[index] === undefined) annotations[index] = mark;
      else displaced.push(mark);
    }
  }
  if (next !== pack.marks.length) malformed("runs and marks disagree");
  const rest = [...kept, ...displaced];
  let restIndex = 0;
  for (let index = 0; index < annotations.length; index++) {
    if (annotations[index] === undefined) annotations[index] = rest[restIndex++];
  }
  const unpacked: JsonRecord = { ...floor, annotations };
  delete unpacked.sourceDrawingPack;
  return unpacked;
}

/**
 * The candidate with every floor's source drawing unpacked; any other value, or an unpacked candidate, as it is. Its
 * packs spend from `budget` (the candidate's own unless one is shared), and throw past its limit.
 */
export function unpackFloorPlanCandidate(value: unknown, budget = sourceDrawingBudget()): unknown {
  if (!isRecord(value) || !Array.isArray(value.floors)) return value;
  if (!value.floors.some((floor) => isRecord(floor) && floor.sourceDrawingPack !== undefined)) return value;
  return { ...value, floors: value.floors.map((floor) => unpackFloor(floor, budget)) };
}

/**
 * The candidate with every floor's source drawing packed. Packing a packed candidate is a no-op. What couldn't be read
 * back isn't packed: a candidate whose packs would spend past `budget`'s limit is given back unpacked.
 */
export function packFloorPlanCandidate(value: unknown, budget = sourceDrawingBudget()): unknown {
  const candidate = unpackFloorPlanCandidate(value);
  if (!isRecord(candidate) || !Array.isArray(candidate.floors)) return candidate;
  const packed = candidate.floors.map(packFloor);
  const cost = packed.reduce((sum, entry) => sum + entry.cost, 0);
  if (budget.spent + cost > budget.limit) return candidate;
  budget.spent += cost;
  return { ...candidate, floors: packed.map((entry) => entry.floor) };
}

/** The candidate as it is stored and sent: packed once STORE_SOURCE_DRAWING_PACKED is on, unpacked until then. */
export function packFloorPlanCandidateForStorage(value: unknown): unknown {
  return STORE_SOURCE_DRAWING_PACKED ? packFloorPlanCandidate(value) : unpackFloorPlanCandidate(value);
}
