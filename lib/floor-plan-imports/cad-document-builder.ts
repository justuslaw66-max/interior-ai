import type {
  FloorPlanDocumentV2,
  FloorPlanEvidenceV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import { cadPointToPreview, computeCadPreviewLayout } from "./cad-preview";
import { CAD_SOURCE_LIMITS, type CadParsedSource, type CadPoint } from "./cad-types";
import type { FloorPlanReviewIssue, FloorPlanSourceDescriptor } from "./types";

function safeId(value: string, fallback: string) {
  const normalized = value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 140) || fallback;
}

export function manifestCadEvidence(parsed: CadParsedSource) {
  const paths = [] as CadParsedSource["paths"];
  let pointCount = 0;
  for (const entry of parsed.paths.slice(0, 1_500)) {
    if (pointCount >= 6_000) break;
    const points = entry.points.slice(0, 6_000 - pointCount);
    pointCount += points.length;
    paths.push({ ...entry, points });
  }
  const texts = parsed.texts.slice(0, 1_000);
  return {
    ...parsed,
    paths,
    texts,
    evidenceTruncated:
      paths.length !== parsed.paths.length ||
      pointCount !== parsed.paths.reduce((sum, entry) => sum + entry.points.length, 0) ||
      texts.length !== parsed.texts.length,
    retainedEvidenceCounts: { paths: paths.length, points: pointCount, texts: texts.length },
  };
}

function provenance(
  sourceId: string,
  parserVersion: string,
  explicitUnits: boolean,
  note: string,
  sourceEvidence: Partial<
    Pick<
      FloorPlanEvidenceV2,
      "pageNumber" | "cropPx" | "calibrationId" | "sourceAnchors"
    >
  > = {}
): FloorPlanEntityProvenanceV2 {
  const confidence = explicitUnits ? 0.82 : 0.35;
  return {
    confidence,
    extractionVersion: parserVersion,
    evidence: [{
      sourceId,
      basis: explicitUnits ? "cad" : "inferred",
      confidence,
      extractorVersion: parserVersion,
      ...sourceEvidence,
      note: note.slice(0, 2_000),
    }],
    reviewHistory: [],
  };
}

function canonicalCoordinates(parsed: CadParsedSource) {
  const points = parsed.paths.flatMap((entry) => entry.points);
  let minX = 0;
  let minY = 0;
  if (points.length) {
    minX = Number.POSITIVE_INFINITY;
    minY = Number.POSITIVE_INFINITY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
    }
  }
  const millimetresPerUnit = parsed.units.millimetresPerUnit ?? 1;
  return {
    minX,
    minY,
    millimetresPerUnit,
    point(input: CadPoint) {
      const xMm = Math.round((input.x - minX) * millimetresPerUnit);
      const zMm = Math.round((input.y - minY) * millimetresPerUnit);
      if (
        Math.abs(xMm) > CAD_SOURCE_LIMITS.maxCanonicalMagnitudeMm ||
        Math.abs(zMm) > CAD_SOURCE_LIMITS.maxCanonicalMagnitudeMm
      ) {
        throw new Error("CAD geometry exceeds the canonical millimetre coordinate limit");
      }
      return { xMm, zMm };
    },
  };
}

export function buildCadDocument(input: {
  source: FloorPlanSourceDescriptor;
  parsed: CadParsedSource;
}) {
  const { parsed, source } = input;
  const coordinate = canonicalCoordinates(parsed);
  const explicitUnits = parsed.units.millimetresPerUnit !== null;
  const preview = computeCadPreviewLayout(parsed);
  const calibrationId = "cad-preview-registration-1";
  const previewPoint = (point: CadPoint) => {
    const projected = cadPointToPreview(point, preview);
    return { x: projected.x, y: projected.y };
  };
  const wallEvidence = (start: CadPoint, end: CadPoint) => {
    const startPx = previewPoint(start);
    const endPx = previewPoint(end);
    const paddingPx = 2;
    const xPx = Math.max(0, Math.min(startPx.x, endPx.x) - paddingPx);
    const yPx = Math.max(0, Math.min(startPx.y, endPx.y) - paddingPx);
    const maxX = Math.min(preview.widthPx, Math.max(startPx.x, endPx.x) + paddingPx);
    const maxY = Math.min(preview.heightPx, Math.max(startPx.y, endPx.y) + paddingPx);
    return {
      pageNumber: 1,
      calibrationId,
      cropPx: {
        xPx,
        yPx,
        widthPx: Math.max(1, maxX - xPx),
        heightPx: Math.max(1, maxY - yPx),
      },
      sourceAnchors: [
        { role: "start" as const, sourcePx: startPx },
        { role: "end" as const, sourcePx: endPx },
      ],
    };
  };
  const vertices: FloorPlanVertexV2[] = [];
  const vertexIdByPoint = new Map<string, string>();
  const addVertex = (point: CadPoint, note: string) => {
    const canonical = coordinate.point(point);
    const key = `${canonical.xMm}:${canonical.zMm}`;
    const existing = vertexIdByPoint.get(key);
    if (existing) return existing;
    const id = `cad-v-${vertices.length + 1}`;
    vertexIdByPoint.set(key, id);
    vertices.push({
      id,
      ...canonical,
      provenance: provenance(source.id, parsed.parserVersion, explicitUnits, note),
    });
    return id;
  };
  const walls: FloorPlanWallV2[] = [];
  const wallKeys = new Set<string>();
  for (const cadPath of parsed.paths.filter((entry) => entry.role === "wall")) {
    const pairs: Array<[CadPoint, CadPoint]> = [];
    for (let index = 1; index < cadPath.points.length; index += 1) {
      pairs.push([cadPath.points[index - 1], cadPath.points[index]]);
    }
    const first = cadPath.points[0];
    const last = cadPath.points.at(-1);
    if (cadPath.closed && first && last && (first.x !== last.x || first.y !== last.y)) {
      pairs.push([last, first]);
    }
    for (const [start, end] of pairs) {
      if (walls.length >= CAD_SOURCE_LIMITS.maxCanonicalWallSegments) {
        throw new Error("CAD wall promotion exceeds the canonical wall-segment limit");
      }
      const startId = addVertex(start, `${cadPath.entityType} ${cadPath.sourceEntityId}`);
      const endId = addVertex(end, `${cadPath.entityType} ${cadPath.sourceEntityId}`);
      if (startId === endId) continue;
      const key = [startId, endId].sort().join(":");
      if (wallKeys.has(key)) continue;
      wallKeys.add(key);
      walls.push({
        id: `cad-wall-${walls.length + 1}`,
        path: { kind: "line", startVertexId: startId, endVertexId: endId },
        thicknessMm: 200,
        classification: /struct/i.test(cadPath.layer ?? "") ? "structural" : "interior",
        adjacentRoomIds: [],
        provenance: provenance(
          source.id,
          parsed.parserVersion,
          explicitUnits,
          `${cadPath.entityType} ${cadPath.sourceEntityId}; path is source-derived, 200 mm thickness is assumed`,
          wallEvidence(start, end)
        ),
      });
    }
  }
  // Raw CAD text is evidence for the private review workspace, not canonical
  // display data. Titles, client names and file paths are common in drawing
  // text, so publishing every TEXT/IFCTEXTLITERAL as a plan annotation would
  // create a privacy leak. A reviewer or semantic classifier may promote only
  // an explicitly checked label later.
  const annotations: FloorPlanDocumentV2["floors"][number]["annotations"] = [];
  const defaultProperty = (valueMm: number) => ({
    valueMm,
    evidence: "assumed" as const,
    provenance: provenance(
      source.id,
      parsed.parserVersion,
      false,
      "3D property default is not supplied by the 2D CAD extraction"
    ),
  });
  const previewMin = cadPointToPreview({ x: preview.minX, y: preview.minY }, preview);
  const previewMaxX = cadPointToPreview({ x: preview.maxX, y: preview.minY }, preview);
  const previewMaxY = cadPointToPreview({ x: preview.minX, y: preview.maxY }, preview);
  const document: FloorPlanDocumentV2 = {
    schemaVersion: 2,
    units: "mm",
    id: safeId(`cad-import-${source.sha256.slice(0, 20)}`, "cad-import"),
    revisionId: safeId(`cad-revision-${source.sha256.slice(0, 20)}`, "cad-revision"),
    createdAt: "1970-01-01T00:00:00.000Z",
    verification: {
      tier: "needs_review",
      criticalIssueIds: [
        ...(parsed.parseFailure ? ["cad-parse-failed"] : []),
        ...(explicitUnits ? [] : ["cad-units-unconfirmed"]),
        ...(walls.length ? [] : ["cad-wall-geometry-unconfirmed"]),
        "cad-room-opening-topology-unconfirmed",
      ],
    },
    sources: [{
      id: source.id,
      kind: "cad",
      name: source.fileName,
      mimeType: source.mimeType,
      sha256: source.sha256,
      pageCount: 1,
    }],
    floors: [{
      id: "cad-floor-1",
      name: "Imported CAD level",
      levelIndex: 0,
      elevationMm: 0,
      storeyHeightMm: 2800,
      slabThicknessMm: 150,
      verticalEvidence: {
        elevation: (() => {
          const { valueMm: _valueMm, ...evidence } = defaultProperty(0);
          return evidence;
        })(),
        storeyHeight: (() => {
          const { valueMm: _valueMm, ...evidence } = defaultProperty(2800);
          return evidence;
        })(),
        slabThickness: (() => {
          const { valueMm: _valueMm, ...evidence } = defaultProperty(150);
          return evidence;
        })(),
      },
      defaults: {
        wallHeight: defaultProperty(2600),
        doorHeight: defaultProperty(2100),
        windowHeight: defaultProperty(1200),
        windowSillHeight: defaultProperty(900),
      },
      calibrations: explicitUnits && parsed.paths.length
        ? [{
            id: calibrationId,
            sourceId: source.id,
            pageNumber: 1,
            imageWidthPx: preview.widthPx,
            imageHeightPx: preview.heightPx,
            controlPoints: [
              { sourcePx: previewMin, planMm: { xMm: 0, zMm: 0 } },
              {
                sourcePx: previewMaxX,
                planMm: {
                  xMm: Math.round((preview.maxX - preview.minX) * coordinate.millimetresPerUnit),
                  zMm: 0,
                },
              },
              {
                sourcePx: previewMaxY,
                planMm: {
                  xMm: 0,
                  zMm: Math.round((preview.maxY - preview.minY) * coordinate.millimetresPerUnit),
                },
              },
            ],
            rmsErrorPx: 0,
          }]
        : [],
      vertices,
      walls,
      rooms: [],
      openings: [],
      structures: [],
      annotations,
      dimensions: [],
    }],
  };
  return {
    document,
    canonicalTransform: {
      sourceOrigin: { x: coordinate.minX, y: coordinate.minY },
      millimetresPerUnit: coordinate.millimetresPerUnit,
      unitsAssumed: !explicitUnits,
    },
  };
}

export function buildCadReviewIssues(
  parsed: CadParsedSource,
  document: FloorPlanDocumentV2
) {
  const issues: FloorPlanReviewIssue[] = [];
  const add = (id: string, code: string, message: string, severity: "warning" | "critical") => {
    issues.push({ id, code, message, severity, resolved: false });
  };
  if (parsed.parseFailure) {
    add("cad-parse-failed", "cad_source_unreadable", parsed.parseFailure, "critical");
  }
  if (parsed.units.millimetresPerUnit === null) {
    add(
      "cad-units-unconfirmed",
      "cad_units_unconfirmed",
      "The CAD file does not declare a supported length unit. Confirm scale before using its coordinates.",
      "critical"
    );
  }
  if (!document.floors[0]?.walls.length) {
    add(
      "cad-wall-geometry-unconfirmed",
      "cad_wall_mapping_unconfirmed",
      "No valid source-declared wall layer or IFC wall representation could be promoted. Use guided tracing or correct CAD layers.",
      "critical"
    );
  }
  add(
    "cad-room-opening-topology-unconfirmed",
    "cad_room_opening_topology_unconfirmed",
    "Review room loops, storeys, doors, windows and wall thicknesses. The importer does not infer these from unrelated CAD linework.",
    "critical"
  );
  parsed.warnings.forEach((message, index) => {
    add(`cad-warning-${index + 1}`, "cad_parser_warning", message, "warning");
  });
  return issues;
}
