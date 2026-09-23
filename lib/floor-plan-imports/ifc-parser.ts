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

export const IFC_PARSER_VERSION = "ifc-step-1.0.0";

type IfcEntity = {
  id: string;
  type: string;
  args: string[];
  references: string[];
};

type Transform2D = [number, number, number, number, number, number];
const IDENTITY: Transform2D = [1, 0, 0, 1, 0, 0];

function decodeIfc(bytes: Uint8Array) {
  assertCadSourceByteBound(bytes.byteLength);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new CadSourceParseError("IFC STEP is not valid UTF-8/ASCII text");
  }
  if (source.includes("\0")) throw new CadSourceParseError("IFC contains binary data");
  if (!/^\s*ISO-10303-21\s*;/i.test(source)) {
    throw new CadSourceParseError("IFC STEP header ISO-10303-21 is missing");
  }
  if (!/FILE_SCHEMA\s*\([^;]*IFC/i.test(source)) {
    throw new CadSourceParseError("STEP source does not declare an IFC schema");
  }
  return source;
}

function splitStatements(source: string) {
  const statements: string[] = [];
  let start = 0;
  let inString = false;
  let inComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (!inString && !inComment && current === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (inComment) {
      if (current === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (current === "'") {
      if (inString && next === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
    }
    if (!inString && current === ";") {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
      if (statements.length > CAD_SOURCE_LIMITS.maxEntities * 2) {
        throw new CadSourceLimitError("IFC exceeds the statement-count parser limit");
      }
    }
    if (index - start > CAD_SOURCE_LIMITS.maxStatementChars) {
      throw new CadSourceLimitError("IFC statement exceeds the parser length limit");
    }
  }
  if (inString || inComment) throw new CadSourceParseError("IFC has an unterminated string or comment");
  return statements;
}

export function splitIfcArguments(value: string) {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (current === "'") {
      if (inString && next === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
    } else if (!inString && current === "(") {
      depth += 1;
    } else if (!inString && current === ")") {
      depth -= 1;
      if (depth < 0) throw new CadSourceParseError("IFC argument parentheses are unbalanced");
    } else if (!inString && depth === 0 && current === ",") {
      args.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (inString || depth !== 0) throw new CadSourceParseError("IFC argument list is malformed");
  args.push(value.slice(start).trim());
  return args;
}

function parseEntities(source: string) {
  const entities = new Map<string, IfcEntity>();
  for (const statement of splitStatements(source)) {
    if (!statement.startsWith("#")) continue;
    const match = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(([\s\S]*)\)$/i.exec(statement);
    if (!match) throw new CadSourceParseError("IFC DATA entity syntax is invalid");
    if (entities.size >= CAD_SOURCE_LIMITS.maxEntities) {
      throw new CadSourceLimitError("IFC exceeds the entity-count parser limit");
    }
    const id = `#${match[1]}`;
    if (entities.has(id)) throw new CadSourceParseError(`IFC repeats entity ${id}`);
    const references = match[3].match(/#\d+/g) ?? [];
    if (references.length > CAD_SOURCE_LIMITS.maxReferencesPerEntity) {
      throw new CadSourceLimitError(`${id} exceeds the reference-count parser limit`);
    }
    entities.set(id, {
      id,
      type: match[2].toUpperCase(),
      args: splitIfcArguments(match[3]),
      references,
    });
  }
  if (!entities.size) throw new CadSourceParseError("IFC DATA section has no entities");
  return entities;
}

function tupleNumbers(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return null;
  const body = trimmed.slice(1, -1);
  const tokens = splitIfcArguments(body);
  if (tokens.length < 2 || tokens.length > 3) return null;
  const values = tokens.map(Number);
  if (values.some((entry) => !Number.isFinite(entry))) return null;
  return values.map((entry, index) => assertCadCoordinate(entry, `IFC coordinate ${index}`));
}

function cartesianPoint(entity: IfcEntity | undefined): CadPoint | null {
  if (!entity || entity.type !== "IFCCARTESIANPOINT") return null;
  const values = tupleNumbers(entity.args[0] ?? "");
  return values ? { x: values[0], y: values[1], ...(values[2] === undefined ? {} : { z: values[2] }) } : null;
}

function firstReference(value: string | undefined) {
  return value?.match(/#\d+/)?.[0] ?? null;
}

function listReferences(value: string | undefined) {
  return value?.match(/#\d+/g) ?? [];
}

function decodeIfcString(value: string | undefined) {
  if (!value || !value.startsWith("'") || !value.endsWith("'")) return null;
  return value.slice(1, -1).replace(/''/g, "'").replace(/\\X2\\[0-9A-F]+\\X0\\/gi, "�").trim();
}

function multiply(left: Transform2D, right: Transform2D): Transform2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function applyTransform(transform: Transform2D, point: CadPoint): CadPoint {
  return {
    x: assertCadCoordinate(transform[0] * point.x + transform[2] * point.y + transform[4], "IFC transformed x"),
    y: assertCadCoordinate(transform[1] * point.x + transform[3] * point.y + transform[5], "IFC transformed y"),
    ...(point.z === undefined ? {} : { z: point.z }),
  };
}

function direction(entity: IfcEntity | undefined) {
  if (!entity || entity.type !== "IFCDIRECTION") return null;
  const values = tupleNumbers(entity.args[0] ?? "");
  if (!values) return null;
  const length = Math.hypot(values[0], values[1]);
  return length > 1e-9 ? { x: values[0] / length, y: values[1] / length } : null;
}

function axisTransform(axis: IfcEntity | undefined, entities: Map<string, IfcEntity>) {
  if (!axis || !["IFCAXIS2PLACEMENT2D", "IFCAXIS2PLACEMENT3D"].includes(axis.type)) {
    return IDENTITY;
  }
  const origin = cartesianPoint(entities.get(firstReference(axis.args[0]) ?? "")) ?? { x: 0, y: 0 };
  const directionArgument = axis.type === "IFCAXIS2PLACEMENT3D" ? axis.args[2] : axis.args[1];
  const xAxis = direction(entities.get(firstReference(directionArgument) ?? "")) ?? { x: 1, y: 0 };
  return [xAxis.x, xAxis.y, -xAxis.y, xAxis.x, origin.x, origin.y] as Transform2D;
}

function placementTransform(
  id: string | null,
  entities: Map<string, IfcEntity>,
  cache: Map<string, Transform2D>,
  visiting = new Set<string>()
): Transform2D {
  if (!id) return IDENTITY;
  const cached = cache.get(id);
  if (cached) return cached;
  if (visiting.has(id)) throw new CadSourceParseError(`IFC placement cycle includes ${id}`);
  visiting.add(id);
  const placement = entities.get(id);
  if (!placement || placement.type !== "IFCLOCALPLACEMENT") return IDENTITY;
  const parentId = firstReference(placement.args[0]);
  const relativeId = firstReference(placement.args[1]);
  const result = multiply(
    placementTransform(parentId, entities, cache, visiting),
    axisTransform(entities.get(relativeId ?? ""), entities)
  );
  visiting.delete(id);
  cache.set(id, result);
  return result;
}

function pointLists(entities: Map<string, IfcEntity>) {
  const result = new Map<string, CadPoint[]>();
  let pointCount = 0;
  for (const entity of entities.values()) {
    if (!["IFCCARTESIANPOINTLIST2D", "IFCCARTESIANPOINTLIST3D"].includes(entity.type)) continue;
    const tuples = entity.args[0]?.match(/\([^()]+\)/g) ?? [];
    const points = tuples.flatMap((tuple) => {
      const values = tupleNumbers(tuple);
      return values ? [{ x: values[0], y: values[1], ...(values[2] === undefined ? {} : { z: values[2] }) }] : [];
    });
    pointCount += points.length;
    if (pointCount > CAD_SOURCE_LIMITS.maxPoints) {
      throw new CadSourceLimitError("IFC point lists exceed the total point-count parser limit");
    }
    if (points.length) result.set(entity.id, points);
  }
  return result;
}

function geometryPaths(entities: Map<string, IfcEntity>) {
  const lists = pointLists(entities);
  const paths = new Map<string, CadPoint[]>();
  let pointCount = 0;
  for (const entity of entities.values()) {
    let points: CadPoint[] = [];
    if (entity.type === "IFCPOLYLINE") {
      points = listReferences(entity.args[0]).flatMap((id) => {
        const point = cartesianPoint(entities.get(id));
        return point ? [point] : [];
      });
    } else if (entity.type === "IFCINDEXEDPOLYCURVE") {
      points = lists.get(firstReference(entity.args[0]) ?? "") ?? [];
    }
    if (points.length >= 2) {
      pointCount += points.length;
      if (pointCount > CAD_SOURCE_LIMITS.maxPoints) {
        throw new CadSourceLimitError("IFC exceeds the total point-count parser limit");
      }
      paths.set(entity.id, points);
    }
  }
  return paths;
}

function descendantsWithPaths(
  root: IfcEntity,
  entities: Map<string, IfcEntity>,
  paths: Map<string, CadPoint[]>,
  traversalBudget: { remaining: number }
) {
  const found = new Set<string>();
  const visited = new Set<string>();
  const queue = [...root.references];
  while (queue.length) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    traversalBudget.remaining -= 1;
    if (traversalBudget.remaining < 0) {
      throw new CadSourceLimitError("IFC representation graph exceeds the traversal limit");
    }
    if (paths.has(id)) found.add(id);
    const entity = entities.get(id);
    if (entity) queue.push(...entity.references);
  }
  return [...found];
}

function parseUnits(entities: Map<string, IfcEntity>) {
  for (const entity of entities.values()) {
    if (entity.type !== "IFCSIUNIT") continue;
    const normalized = entity.args.join(",").toUpperCase();
    if (!normalized.includes(".LENGTHUNIT.") || !normalized.includes(".METRE.")) continue;
    const prefix = normalized.match(/\.(MILLI|CENTI|DECI|KILO)\./)?.[1] ?? null;
    const factors: Record<string, number> = { MILLI: 1, CENTI: 10, DECI: 100, KILO: 1_000_000 };
    const factor = prefix ? factors[prefix] : 1_000;
    return {
      name: prefix ? `${prefix.toLowerCase()}metre` : "metre",
      millimetresPerUnit: factor,
      basis: "source_declared" as const,
      sourceEntityId: entity.id,
    };
  }
  return { name: null, millimetresPerUnit: null, basis: "missing" as const };
}

export function parseIfcStep(bytes: Uint8Array): CadParsedSource {
  const entities = parseEntities(decodeIfc(bytes));
  const rawPaths = geometryPaths(entities);
  const layerByItem = new Map<string, string>();
  for (const entity of entities.values()) {
    if (entity.type !== "IFCPRESENTATIONLAYERASSIGNMENT") continue;
    const layer = decodeIfcString(entity.args[0])?.slice(0, 160) ?? "unnamed";
    for (const id of listReferences(entity.args[2])) layerByItem.set(id, layer);
  }
  const output = new Map<string, CadPathEvidence>();
  const placementCache = new Map<string, Transform2D>();
  const traversalBudget = { remaining: CAD_SOURCE_LIMITS.maxReferenceTraversal };
  for (const wall of [...entities.values()].filter((entity) => entity.type.startsWith("IFCWALL"))) {
    const placementId = wall.references.find((id) => entities.get(id)?.type === "IFCLOCALPLACEMENT") ?? null;
    const transform = placementTransform(placementId, entities, placementCache);
    for (const pathId of descendantsWithPaths(wall, entities, rawPaths, traversalBudget)) {
      const points = (rawPaths.get(pathId) ?? []).map((point) => applyTransform(transform, point));
      output.set(`${wall.id}:${pathId}`, {
        id: `path-ifc-${wall.id.slice(1)}-${pathId.slice(1)}`,
        sourceEntityId: wall.id,
        entityType: wall.type,
        layer: layerByItem.get(pathId) ?? null,
        role: "wall",
        closed: points.length > 2 && points[0].x === points.at(-1)?.x && points[0].y === points.at(-1)?.y,
        points,
      });
    }
  }
  for (const [pathId, points] of rawPaths) {
    const layer = layerByItem.get(pathId) ?? null;
    const normalizedLayer = layer?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "";
    if (!/(^|-)(a-)?walls?($|-)/.test(normalizedLayer)) continue;
    if ([...output.keys()].some((key) => key.endsWith(`:${pathId}`))) continue;
    output.set(pathId, {
      id: `path-ifc-${pathId.slice(1)}`,
      sourceEntityId: pathId,
      entityType: entities.get(pathId)?.type ?? "IFCGEOMETRY",
      layer,
      role: "wall",
      closed: points.length > 2 && points[0].x === points.at(-1)?.x && points[0].y === points.at(-1)?.y,
      points,
    });
  }
  const texts: CadTextEvidence[] = [];
  for (const entity of entities.values()) {
    if (entity.type !== "IFCSPACE" && entity.type !== "IFCTEXTLITERAL") continue;
    const text = decodeIfcString(entity.type === "IFCSPACE" ? entity.args[2] : entity.args[0]);
    if (!text) continue;
    const placementId = entity.references.find((id) => entities.get(id)?.type === "IFCLOCALPLACEMENT") ?? null;
    const transform = placementTransform(placementId, entities, placementCache);
    texts.push({
      id: `text-ifc-${entity.id.slice(1)}`,
      sourceEntityId: entity.id,
      entityType: entity.type,
      layer: null,
      text: text.slice(0, 2_000),
      point: placementId ? applyTransform(transform, { x: 0, y: 0 }) : null,
    });
    if (texts.length > CAD_SOURCE_LIMITS.maxTextEntities) {
      throw new CadSourceLimitError("IFC exceeds the text-entity parser limit");
    }
  }
  const units = parseUnits(entities);
  return {
    kind: "floor_plan_cad_evidence_v1",
    format: "ifc",
    parserVersion: IFC_PARSER_VERSION,
    units,
    entityCount: entities.size,
    paths: [...output.values()],
    texts,
    warnings: [
      ...(units.basis === "missing" ? ["IFC does not declare a supported SI length unit"] : []),
      ...(!output.size ? ["No wall-associated IFC curve geometry was found"] : []),
      "IFC wall curves require topology, opening and storey review before use",
    ],
    parseFailure: null,
  };
}
