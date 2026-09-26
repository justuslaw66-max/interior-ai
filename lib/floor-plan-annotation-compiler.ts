import type { CompiledFloorPlanAnnotationGeometryV2, CompiledFloorPlanAnnotationV2 } from "./floor-plan-compiler-v2";
import type { FloorPlanAnnotationV2, FloorPlanPointMmV2 } from "./floor-plan-document-v2";

export function compileFloorPlanAnnotationV2(annotation: FloorPlanAnnotationV2, projection: {
  vertex: (id: string) => FloorPlanPointMmV2;
  wallPoint: (id: string, offsetMm: number) => FloorPlanPointMmV2;
}): CompiledFloorPlanAnnotationV2 {
  let geometry: CompiledFloorPlanAnnotationGeometryV2;
  const source = annotation.geometry;
  if (source.kind === "source_drawing") geometry = structuredClone(source);
  else if (source.kind === "point") geometry = { kind: "point", point: projection.vertex(source.vertexId) };
  else if (source.kind === "polygon" || source.kind === "polyline") {
    geometry = { kind: source.kind, points: source.vertexIds.map(projection.vertex) };
  } else {
    geometry = { ...source, start: projection.wallPoint(source.wallId, source.offsetMm),
      end: projection.wallPoint(source.wallId, source.offsetMm + source.widthMm) };
  }
  const { provenance: _provenance, ...compiled } = annotation;
  return { ...compiled, geometry };
}
