import { sourceTraceAnnotations } from "../floor-plan-source-trace";
import type { FloorPlanAnnotationV2, FloorPlanEntityProvenanceV2 } from "@/lib/floor-plan-document-v2";
import { sourceDrawingGeometryError, type FloorPlanSourceDrawingGeometryV2 } from "@/lib/floor-plan-source-drawing";
import type { FloorPlanReviewIssue } from "./types";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import { sourceProposalAnnotations } from "./source-proposal-annotations";

/** Preserve private source marks independently of semantic/topology success. */
export function sourceDrawingAnnotations(page: RegisteredPageEvidence | undefined, sourceId: string, version: string, issues: FloorPlanReviewIssue[] = []) {
  const annotations: FloorPlanAnnotationV2[] = [];
  if (!page) return annotations;
  let rejected = 0;
  const conflictIds: string[] = [];
  const add = (command: FloorPlanSourceDrawingGeometryV2["command"],
    points: FloorPlanSourceDrawingGeometryV2["points"], text: string, raster: boolean, textRotationDegrees?: number, reviewRequired = false) => {
    const geometry: FloorPlanSourceDrawingGeometryV2 = {
      kind: "source_drawing", sourceId, pageNumber: page.pageNumber,
      widthPx: page.widthPx, heightPx: page.heightPx, command, points, ...(textRotationDegrees ? { textRotationDegrees } : {}),
    };
    if (sourceDrawingGeometryError(geometry)) { rejected++; return; }
    const provenance: FloorPlanEntityProvenanceV2 = {
      confidence: 0, extractionVersion: version, reviewHistory: [],
      evidence: [{ sourceId, pageNumber: page.pageNumber,
        basis: raster ? "raster_traced" : "vector_traced", confidence: 0, extractorVersion: version,
        note: "Unclassified reference artwork; no building meaning, scale or verification is inferred.",
      }],
    };
    if (reviewRequired) conflictIds.push(`source-artwork:${page.pageNumber}:${annotations.length + 1}`);
    annotations.push({
      id: `source-artwork:${page.pageNumber}:${annotations.length + 1}`,
      kind: command === "text" ? "label" : "note", text: text || "Unclassified source stroke",
      scope: "reference", geometry, provenance,
    });
  };
  for (const segment of page.vectorSegments) {
    add("line", [segment.start, segment.end], "", segment.evidenceKind === "raster_linework");
  }
  for (const path of page.vectorPaths) {
    for (const curve of path.curves ?? []) {
      add(curve.command, [curve.start, ...curve.controlPoints, curve.end], "", false);
    }
  }
  for (const text of page.text.filter((entry) => entry.text.trim())) add("text", [text.center], text.text, text.evidenceKind === "ocr", text.rotationDegrees, text.reviewRequired);
  if (rejected) issues.push({ id: "source-artwork-bounds", code: "source_artwork_unresolved", resolved: false,
    message: `${rejected} source marks exceed supported drawing bounds; inspect the original underlay.`, severity: "warning" });
  if (conflictIds.length) issues.push({ id: "source-text-conflict", code: "source_text_conflict", resolved: false,
    entityIds: conflictIds, message: "Rotated OCR passes disagree on highlighted text. Compare the readings with the source; they have not supplied automatic labels or dimensions.", severity: "warning" });
  return [...annotations, ...(page.sourceArtwork ? sourceTraceAnnotations(page.sourceArtwork, sourceId, page.pageNumber) : []), ...sourceProposalAnnotations(page, sourceId, version)];
}
