import {
  CAD_SOURCE_LIMITS,
  CadSourceLimitError,
  CadSourceParseError,
  assertCadCoordinate,
  assertCadSourceByteBound,
  type CadParsedSource,
  type CadPathEvidence,
  type CadPoint,
  type CadTextEvidence,
} from "./cad-types";

export const DXF_PARSER_VERSION = "ascii-dxf-1.0.0";

type DxfGroup = { code: number; value: string };
type DxfEntity = { ordinal: number; type: string; groups: DxfGroup[] };

const DXF_UNIT_BY_CODE: Record<number, { name: string; millimetresPerUnit: number }> = {
  1: { name: "inch", millimetresPerUnit: 25.4 },
  2: { name: "foot", millimetresPerUnit: 304.8 },
  4: { name: "millimetre", millimetresPerUnit: 1 },
  5: { name: "centimetre", millimetresPerUnit: 10 },
  6: { name: "metre", millimetresPerUnit: 1_000 },
  9: { name: "mil", millimetresPerUnit: 0.0254 },
  10: { name: "yard", millimetresPerUnit: 914.4 },
  14: { name: "decimetre", millimetresPerUnit: 100 },
};

function decodeAsciiDxf(bytes: Uint8Array) {
  assertCadSourceByteBound(bytes.byteLength);
  if (Buffer.from(bytes.subarray(0, 22)).toString("ascii").startsWith("AutoCAD Binary DXF")) {
    throw new CadSourceParseError("Binary DXF is not supported; export an ASCII DXF instead");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new CadSourceParseError("DXF is not valid UTF-8/ASCII text");
  }
  if (source.includes("\0")) throw new CadSourceParseError("DXF contains binary data");
  const lines = source.split(/\r\n|\n|\r/);
  if (lines.length > CAD_SOURCE_LIMITS.maxLines) {
    throw new CadSourceLimitError("DXF exceeds the line-count parser limit");
  }
  if (lines.length % 2 === 1 && lines.at(-1)?.trim()) {
    throw new CadSourceParseError("DXF has an unmatched group-code line");
  }
  const groups: DxfGroup[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const codeText = lines[index].trim();
    if (!/^-?\d+$/.test(codeText)) {
      throw new CadSourceParseError(`DXF group code at line ${index + 1} is invalid`);
    }
    groups.push({ code: Number(codeText), value: lines[index + 1].trim() });
  }
  if (!groups.some((group) => group.code === 0 && group.value.toUpperCase() === "SECTION")) {
    throw new CadSourceParseError("DXF SECTION marker is missing");
  }
  return groups;
}

function groupValue(entity: DxfEntity, code: number) {
  return entity.groups.find((group) => group.code === code)?.value;
}

function numericGroup(entity: DxfEntity, code: number, required = true) {
  const raw = groupValue(entity, code);
  if (raw === undefined) {
    if (!required) return null;
    throw new CadSourceParseError(`${entity.type} #${entity.ordinal} is missing group ${code}`);
  }
  const value = Number(raw);
  return assertCadCoordinate(value, `${entity.type} #${entity.ordinal} group ${code}`);
}

function point(entity: DxfEntity, xCode: number, yCode: number): CadPoint {
  return {
    x: numericGroup(entity, xCode) as number,
    y: numericGroup(entity, yCode) as number,
    ...(numericGroup(entity, xCode + 20, false) !== null
      ? { z: numericGroup(entity, xCode + 20, false) as number }
      : {}),
  };
}

function isWallLayer(layer: string | null) {
  if (!layer) return false;
  const normalized = layer.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return /(^|-)(a-)?walls?($|-)/.test(normalized) ||
    /(^|-)(partition|structural-wall)($|-)/.test(normalized);
}

function parseEntities(groups: DxfGroup[]) {
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let current: DxfEntity | null = null;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.code === 0 && group.value.toUpperCase() === "SECTION") {
      const sectionName = groups[index + 1];
      inEntities = sectionName?.code === 2 && sectionName.value.toUpperCase() === "ENTITIES";
      current = null;
      continue;
    }
    if (group.code === 0 && group.value.toUpperCase() === "ENDSEC") {
      inEntities = false;
      current = null;
      continue;
    }
    if (!inEntities) continue;
    if (group.code === 0) {
      if (entities.length >= CAD_SOURCE_LIMITS.maxEntities) {
        throw new CadSourceLimitError("DXF exceeds the entity-count parser limit");
      }
      current = {
        ordinal: entities.length + 1,
        type: group.value.toUpperCase(),
        groups: [],
      };
      entities.push(current);
    } else if (current) {
      current.groups.push(group);
    }
  }
  if (!entities.length) throw new CadSourceParseError("DXF ENTITIES section is empty");
  return entities;
}

function sourceEntityId(entity: DxfEntity) {
  const handle = groupValue(entity, 5)?.replace(/[^a-zA-Z0-9_-]/g, "");
  return handle ? `dxf-${handle}` : `dxf-entity-${entity.ordinal}`;
}

function entityLayer(entity: DxfEntity) {
  return groupValue(entity, 8)?.slice(0, 160) || null;
}

function polylinePoints(entity: DxfEntity): CadPoint[] {
  const points: CadPoint[] = [];
  let pendingX: number | null = null;
  for (const group of entity.groups) {
    if (group.code === 10) {
      pendingX = assertCadCoordinate(Number(group.value), `${entity.type} x coordinate`);
    } else if (group.code === 20 && pendingX !== null) {
      points.push({
        x: pendingX,
        y: assertCadCoordinate(Number(group.value), `${entity.type} y coordinate`),
      });
      pendingX = null;
      if (points.length > CAD_SOURCE_LIMITS.maxPoints) {
        throw new CadSourceLimitError("DXF polyline exceeds the point-count parser limit");
      }
    }
  }
  if (pendingX !== null) throw new CadSourceParseError(`${entity.type} has an unmatched x coordinate`);
  return points;
}

function cleanDxfText(value: string) {
  return value
    .replace(/\\P/gi, " ")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function pathFromEntity(entity: DxfEntity): CadPathEvidence | null {
  const id = sourceEntityId(entity);
  const layer = entityLayer(entity);
  let points: CadPoint[];
  let closed = false;
  if (entity.type === "LINE") {
    points = [point(entity, 10, 20), point(entity, 11, 21)];
  } else if (entity.type === "LWPOLYLINE") {
    points = polylinePoints(entity);
    closed = ((numericGroup(entity, 70, false) ?? 0) & 1) === 1;
  } else if (entity.type === "ARC") {
    const center = point(entity, 10, 20);
    const radius = numericGroup(entity, 40) as number;
    const startDegrees = numericGroup(entity, 50) as number;
    let sweepDegrees = (numericGroup(entity, 51) as number) - startDegrees;
    while (sweepDegrees <= 0) sweepDegrees += 360;
    const segmentCount = Math.max(2, Math.ceil(sweepDegrees / 10));
    points = Array.from({ length: segmentCount + 1 }, (_, index) => {
      const radians = ((startDegrees + (sweepDegrees * index) / segmentCount) * Math.PI) / 180;
      return {
        x: assertCadCoordinate(center.x + Math.cos(radians) * radius, `${entity.type} x`),
        y: assertCadCoordinate(center.y + Math.sin(radians) * radius, `${entity.type} y`),
      };
    });
  } else {
    return null;
  }
  if (points.length < 2) return null;
  return {
    id: `path-${id}`,
    sourceEntityId: id,
    entityType: entity.type,
    layer,
    role: isWallLayer(layer) ? "wall" : "unknown",
    closed,
    points,
  };
}

function textFromEntity(entity: DxfEntity): CadTextEvidence | null {
  if (entity.type !== "TEXT" && entity.type !== "MTEXT") return null;
  const text = cleanDxfText(
    entity.groups
      .filter((group) => group.code === 1 || group.code === 3)
      .map((group) => group.value)
      .join("")
  );
  if (!text) return null;
  const id = sourceEntityId(entity);
  return {
    id: `text-${id}`,
    sourceEntityId: id,
    entityType: entity.type,
    layer: entityLayer(entity),
    text,
    point: point(entity, 10, 20),
  };
}

function insertionUnits(groups: DxfGroup[]) {
  const variableIndex = groups.findIndex(
    (group) => group.code === 9 && group.value.toUpperCase() === "$INSUNITS"
  );
  if (variableIndex < 0) return null;
  const raw = groups.slice(variableIndex + 1, variableIndex + 8).find((group) => group.code === 70);
  return raw && /^\d+$/.test(raw.value) ? DXF_UNIT_BY_CODE[Number(raw.value)] ?? null : null;
}

export function parseAsciiDxf(bytes: Uint8Array): CadParsedSource {
  const groups = decodeAsciiDxf(bytes);
  const entities = parseEntities(groups);
  const paths: CadPathEvidence[] = [];
  const texts: CadTextEvidence[] = [];
  let pointCount = 0;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (entity.type === "POLYLINE") {
      const vertices: CadPoint[] = [];
      for (index += 1; index < entities.length && entities[index].type !== "SEQEND"; index += 1) {
        if (entities[index].type === "VERTEX") vertices.push(point(entities[index], 10, 20));
      }
      if (vertices.length >= 2) {
        const layer = entityLayer(entity);
        paths.push({
          id: `path-${sourceEntityId(entity)}`,
          sourceEntityId: sourceEntityId(entity),
          entityType: entity.type,
          layer,
          role: isWallLayer(layer) ? "wall" : "unknown",
          closed: ((numericGroup(entity, 70, false) ?? 0) & 1) === 1,
          points: vertices,
        });
        pointCount += vertices.length;
      }
      continue;
    }
    const path = pathFromEntity(entity);
    if (path) {
      pointCount += path.points.length;
      paths.push(path);
    }
    const text = textFromEntity(entity);
    if (text) texts.push(text);
    if (pointCount > CAD_SOURCE_LIMITS.maxPoints) {
      throw new CadSourceLimitError("DXF exceeds the total point-count parser limit");
    }
    if (texts.length > CAD_SOURCE_LIMITS.maxTextEntities) {
      throw new CadSourceLimitError("DXF exceeds the text-entity parser limit");
    }
  }
  const unit = insertionUnits(groups);
  return {
    kind: "floor_plan_cad_evidence_v1",
    format: "dxf",
    parserVersion: DXF_PARSER_VERSION,
    units: unit
      ? { ...unit, basis: "source_declared", sourceEntityId: "$INSUNITS" }
      : { name: null, millimetresPerUnit: null, basis: "missing" },
    entityCount: entities.length,
    paths,
    texts,
    warnings: [
      ...(unit ? [] : ["DXF does not declare supported insertion units"]),
      ...(paths.some((path) => path.role === "unknown")
        ? ["Non-wall CAD layers were retained as evidence but not promoted to walls"]
        : []),
    ],
    parseFailure: null,
  };
}
