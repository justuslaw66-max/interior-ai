import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanStructureV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanVertexDraftV2 } from "@/lib/floor-plan-topology-mutations";

export type FloorPlanStructureRectangleMm = {
  xMm: number;
  zMm: number;
  widthMm: number;
  depthMm: number;
};

function collectDocumentIds(document: FloorPlanDocumentV2): Set<string> {
  const ids = new Set<string>([
    document.id,
    document.revisionId,
    ...document.sources.map((source) => source.id),
  ]);
  for (const floor of document.floors) {
    ids.add(floor.id);
    for (const collection of [
      floor.calibrations,
      floor.vertices,
      floor.walls,
      floor.rooms,
      floor.openings,
      floor.structures,
      floor.annotations,
      floor.dimensions,
    ]) {
      for (const entity of collection) ids.add(entity.id);
    }
  }
  return ids;
}

export function nextFloorPlanReviewEntityId(
  document: FloorPlanDocumentV2,
  prefix: string
): string {
  const used = collectDocumentIds(document);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function getStructureRectangleBounds(
  floor: FloorPlanFloorV2,
  structure: FloorPlanStructureV2
): FloorPlanStructureRectangleMm | null {
  if (structure.vertexIds.length !== 4) return null;
  const vertices = structure.vertexIds.map((id) =>
    floor.vertices.find((vertex) => vertex.id === id)
  );
  if (vertices.some((vertex) => !vertex)) return null;
  const points = vertices as NonNullable<(typeof vertices)[number]>[];
  const xValues = [...new Set(points.map((point) => point.xMm))].sort(
    (a, b) => a - b
  );
  const zValues = [...new Set(points.map((point) => point.zMm))].sort(
    (a, b) => a - b
  );
  if (xValues.length !== 2 || zValues.length !== 2) return null;
  const cornerKeys = new Set(points.map((point) => `${point.xMm}:${point.zMm}`));
  if (
    xValues.some((xMm) =>
      zValues.some((zMm) => !cornerKeys.has(`${xMm}:${zMm}`))
    )
  ) {
    return null;
  }
  return {
    xMm: xValues[0],
    zMm: zValues[0],
    widthMm: xValues[1] - xValues[0],
    depthMm: zValues[1] - zValues[0],
  };
}

export function buildStructureRectangleVertices(input: {
  document: FloorPlanDocumentV2;
  floor: FloorPlanFloorV2;
  bounds: FloorPlanStructureRectangleMm;
  idPrefix: string;
}): { vertexIds: string[]; vertices: FloorPlanVertexDraftV2[] } {
  const { xMm, zMm, widthMm, depthMm } = input.bounds;
  if (
    ![xMm, zMm, widthMm, depthMm].every(Number.isSafeInteger) ||
    widthMm <= 0 ||
    depthMm <= 0
  ) {
    throw new Error("Structure bounds need positive integer-millimetre width and depth.");
  }
  const used = collectDocumentIds(input.document);
  const vertices: FloorPlanVertexDraftV2[] = [];
  const corners = [
    { xMm, zMm },
    { xMm: xMm + widthMm, zMm },
    { xMm: xMm + widthMm, zMm: zMm + depthMm },
    { xMm, zMm: zMm + depthMm },
  ];
  const vertexIds = corners.map((corner, cornerIndex) => {
    const existing = input.floor.vertices.find(
      (vertex) => vertex.xMm === corner.xMm && vertex.zMm === corner.zMm
    );
    if (existing) return existing.id;
    let suffix = cornerIndex + 1;
    let id = `${input.idPrefix}-vertex-${suffix}`;
    while (used.has(id)) {
      suffix += 4;
      id = `${input.idPrefix}-vertex-${suffix}`;
    }
    used.add(id);
    vertices.push({ id, ...corner });
    return id;
  });
  return { vertexIds, vertices };
}
