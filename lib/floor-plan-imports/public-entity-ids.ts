import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";

type PublicEntityCollection =
  | "floor"
  | "vertex"
  | "wall"
  | "room"
  | "opening"
  | "structure"
  | "annotation"
  | "dimension";

const PUBLIC_ENTITY_ID_PATTERNS: Record<PublicEntityCollection, RegExp> = {
  floor: /^(?:floor|cad-floor)(?:[-:]\d+)+$/,
  vertex: /^(?:v\d+|(?:v|vertex|cad-v)(?:[-:]-?\d+)+)$/,
  wall: /^(?:w\d+|(?:wall|cad-wall)(?:[-:]\d+)+)$/,
  room: /^room(?:[-:]\d+)+$/,
  opening:
    /^(?:opening|door|doorway|window|passage|vent|louvre|gate)(?:[-:]\d+)+(?:[:.-]part[:.-]\d+)?$/,
  structure:
    /^(?:structure|column|shaft|ledge|service-strip|void|structural-core)(?:[-:]\d+)+$/,
  annotation:
    /^(?:annotation|label|suggested-room|optional-partition)(?:[-:]\d+)+$/,
  dimension: /^dimension(?:[-:]\d+)+$/,
};

export class FloorPlanPublicEntityIdError extends Error {
  readonly collection: PublicEntityCollection;

  constructor(collection: PublicEntityCollection) {
    super(`The floor plan contains a non-opaque public ${collection} identifier`);
    this.name = "FloorPlanPublicEntityIdError";
    this.collection = collection;
  }
}

function normalizedToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function basenameWithoutExtension(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const basename = withoutQuery.split(/[\\/]/).at(-1) ?? withoutQuery;
  return basename.replace(/\.[a-z0-9]{1,12}$/i, "");
}

function isGenericDisplayValue(value: string): boolean {
  const normalized = normalizedToken(value);
  return /^(?:level|floor|storey)-?\d+$/.test(normalized) ||
    /^(?:living-room|bedroom|main-bedroom|dining-room|kitchen|bathroom|toilet|room|service-yard|household-shelter|study|column|shaft|ledge|service-strip|void|structural-core|structure)(?:-\d+)?$/.test(
      normalized
    ) ||
    normalized === "suggested-room" ||
    normalized === "optional-partition" ||
    normalized === "main-entrance";
}

function sensitiveTokens(
  document: FloorPlanDocumentV2,
  privateValues: readonly string[]
): Set<string> {
  const rawValues = [
    ...privateValues,
    document.id,
    document.revisionId,
    document.parentRevisionId ?? "",
    ...document.sources.flatMap((source) => [
      source.id,
      source.name,
      basenameWithoutExtension(source.name),
      source.uri ?? "",
      source.uri ? basenameWithoutExtension(source.uri) : "",
      source.sha256 ?? "",
    ]),
    ...document.floors.flatMap((floor) => [
      floor.name,
      ...floor.rooms.map((room) => room.name),
      ...floor.structures.map((structure) => structure.name),
      ...floor.annotations.map((annotation) => annotation.text),
      ...floor.dimensions.map((dimension) => dimension.label ?? ""),
    ]),
  ];
  return new Set(
    rawValues
      .filter((value) => value && !isGenericDisplayValue(value))
      .map(normalizedToken)
      .filter((value) => value.length >= 3)
  );
}

function containsSensitiveToken(id: string, tokens: ReadonlySet<string>): boolean {
  const normalized = normalizedToken(id);
  for (const token of tokens) {
    if (
      normalized === token ||
      normalized.startsWith(`${token}-`) ||
      normalized.endsWith(`-${token}`) ||
      normalized.includes(`-${token}-`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Canonical IDs participate in the immutable geometry hash, so the public API
 * cannot safely rewrite them after approval. This gate requires identifiers to
 * be generated machine ordinals before an immutable revision is created and
 * rejects known private source/job/display tokens as a second line of defence.
 */
export function assertPublicFloorPlanEntityIdsOpaque(
  document: FloorPlanDocumentV2,
  options: { privateValues?: readonly string[] } = {}
): void {
  const tokens = sensitiveTokens(document, options.privateValues ?? []);
  const assertId = (collection: PublicEntityCollection, id: string) => {
    if (
      !PUBLIC_ENTITY_ID_PATTERNS[collection].test(id) ||
      containsSensitiveToken(id, tokens)
    ) {
      throw new FloorPlanPublicEntityIdError(collection);
    }
  };

  for (const floor of document.floors) {
    assertId("floor", floor.id);
    floor.vertices.forEach((entity) => assertId("vertex", entity.id));
    floor.walls.forEach((entity) => assertId("wall", entity.id));
    floor.rooms.forEach((entity) => assertId("room", entity.id));
    floor.openings.forEach((entity) => assertId("opening", entity.id));
    floor.structures.forEach((entity) => assertId("structure", entity.id));
    floor.annotations.forEach((entity) => assertId("annotation", entity.id));
    floor.dimensions.forEach((entity) => assertId("dimension", entity.id));
  }
}
