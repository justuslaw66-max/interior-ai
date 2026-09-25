import type { FloorPlanAnnotationV2 } from "@/lib/floor-plan-document-v2";
import { sourceDrawingGeometryError, type FloorPlanSourceDrawingGeometryV2 } from "@/lib/floor-plan-source-drawing";
import type { RegisteredPageEvidence, SemanticRatioPoint } from "./deterministic-evidence";

/** Uncalibrated hints stay private reference artwork; they never supply walls, rooms, openings or live dimensions. */
export function sourceProposalAnnotations(page: RegisteredPageEvidence, sourceId: string, version: string) {
  const result: FloorPlanAnnotationV2[] = [];
  const point = (value: SemanticRatioPoint) => ({ x: value.xRatio * page.widthPx, y: value.yRatio * page.heightPx });
  const add = (key: string, text: string, points: FloorPlanSourceDrawingGeometryV2["points"]) => {
    const geometry: FloorPlanSourceDrawingGeometryV2 = { kind: "source_drawing", sourceId, pageNumber: page.pageNumber,
      widthPx: page.widthPx, heightPx: page.heightPx, command: "line", points };
    if (sourceDrawingGeometryError(geometry)) return;
    result.push({ id: `source-proposal:${page.pageNumber}:${key}`, kind: "note", scope: "reference", text, geometry,
      provenance: { confidence: 0, extractionVersion: version, reviewHistory: [], evidence: [{ sourceId, pageNumber: page.pageNumber,
        basis: "inferred", confidence: 0, extractorVersion: version, note: "Unverified source proposal retained for review only. Not accepted metric geometry or a confirmed measurement." }] } });
  };
  for (const [index, room] of (page.semantics.roomBoundaries ?? []).entries()) {
    room.points.forEach((value, edge) => add(`room:${index}:${edge}`, `Unverified boundary proposal: ${room.label}`, [point(value), point(room.points[(edge + 1) % room.points.length])]));
  }
  page.semantics.openingSymbols.forEach((opening, index) => {
    if (opening.spanStart && opening.spanEnd) add(`opening:${index}`, `Unverified ${opening.kind} span; operation ${opening.operation ?? "unknown"} needs review`, [point(opening.spanStart), point(opening.spanEnd)]);
  });
  page.semantics.dimensionLabels.forEach((dimension, index) => {
    if (!dimension.extensionStart || !dimension.extensionEnd) return;
    const observed = page.dimensionSpanEvidence?.observations.find((entry) => entry.labelIndex === index && entry.status === "source_supported");
    const ends = observed?.start && observed.end ? [observed.start, observed.end] : [point(dimension.extensionStart), point(dimension.extensionEnd)];
    add(`dimension:${index}`, `Unverified printed dimension: ${dimension.rawText ?? dimension.valueMm} (${dimension.valueMm} mm); ${observed ? "raster-supported ticks" : "proposed endpoints"}${dimension.setAside ? `. Set aside by the scale check: ${dimension.setAside}; check the printed number` : ""}`, ends);
  });
  return result;
}
