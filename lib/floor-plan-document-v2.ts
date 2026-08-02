/**
 * Canonical, source-auditable floor-plan document.
 *
 * All authored spatial values are integer millimetres. Derived renderer values
 * may be fractional (for example, a point along an arc), but they are never
 * written back into this document.
 */

export type FloorPlanVerificationTierV2 =
  | "needs_review"
  | "source_verified"
  | "construction_verified";

export type FloorPlanSourceKindV2 =
  | "pdf"
  | "raster"
  | "cad"
  | "as_built"
  | "site_measurement"
  | "legacy";

export type FloorPlanEvidenceBasisV2 =
  | "explicit_dimension"
  | "vector_traced"
  | "raster_traced"
  | "inferred"
  | "user_confirmed"
  | "site_measured"
  | "cad"
  | "as_built"
  | "legacy";

export type FloorPlanReviewActionV2 =
  | "created"
  | "corrected"
  | "confirmed"
  | "approved"
  | "rejected";

export type FloorPlanReviewRecordV2 = {
  id: string;
  action: FloorPlanReviewActionV2;
  reviewerId: string;
  reviewedAt: string;
  note?: string;
};

export type FloorPlanSourceCropV2 = {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
};

/**
 * A pixel observed directly on the registered source drawing.
 *
 * The role is interpreted against the entity that owns the evidence. Wall
 * anchors refer to the authored wall path; opening anchors refer to the exact
 * span on its host wall. Keeping the plan coordinate implicit prevents a
 * reviewer or extractor from supplying a second, self-consistent geometry that
 * is unrelated to the canonical document.
 */
export type FloorPlanSourceAnchorV2 = {
  role: "start" | "midpoint" | "end";
  sourcePx: { x: number; y: number };
};

export type FloorPlanEvidenceV2 = {
  sourceId: string;
  basis: FloorPlanEvidenceBasisV2;
  confidence: number;
  extractorVersion: string;
  pageNumber?: number;
  cropPx?: FloorPlanSourceCropV2;
  /** Exact registration used to compare sourceAnchors with canonical geometry. */
  calibrationId?: string;
  /** Direct source observations used by the publication residual gate. */
  sourceAnchors?: FloorPlanSourceAnchorV2[];
  note?: string;
};

export type FloorPlanEntityProvenanceV2 = {
  confidence: number;
  extractionVersion: string;
  evidence: FloorPlanEvidenceV2[];
  reviewHistory: FloorPlanReviewRecordV2[];
};

export type FloorPlanSourceV2 = {
  id: string;
  kind: FloorPlanSourceKindV2;
  name: string;
  mimeType: string;
  uri?: string;
  sha256?: string;
  pageCount?: number;
  widthPx?: number;
  heightPx?: number;
};

export type FloorPlanPointMmV2 = {
  xMm: number;
  zMm: number;
};

export type FloorPlanVertexV2 = FloorPlanPointMmV2 & {
  id: string;
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanPropertyEvidenceV2 =
  | "assumed"
  | "source_documented"
  | "user_confirmed"
  | "site_measured";

export type FloorPlanMeasuredPropertyV2 = {
  valueMm: number;
  evidence: FloorPlanPropertyEvidenceV2;
  provenance: FloorPlanEntityProvenanceV2;
};

/**
 * Evidence for a measurement whose integer value remains a first-class floor
 * field for schema-v2 compatibility. Older documents omit this record and are
 * interpreted as `assumed`; absence must never be treated as verification.
 */
export type FloorPlanMeasuredPropertyEvidenceV2 = Omit<
  FloorPlanMeasuredPropertyV2,
  "valueMm"
>;

export type FloorPlanFloorVerticalEvidenceV2 = {
  elevation: FloorPlanMeasuredPropertyEvidenceV2;
  storeyHeight: FloorPlanMeasuredPropertyEvidenceV2;
  slabThickness: FloorPlanMeasuredPropertyEvidenceV2;
};

export type FloorPlanSourceCalibrationPointV2 = {
  sourcePx: { x: number; y: number };
  planMm: FloorPlanPointMmV2;
};

export type FloorPlanSourceCalibrationV2 = {
  id: string;
  sourceId: string;
  pageNumber: number;
  imageWidthPx: number;
  imageHeightPx: number;
  controlPoints: FloorPlanSourceCalibrationPointV2[];
  rmsErrorPx?: number;
};

export type FloorPlanWallClassificationV2 =
  | "exterior"
  | "interior"
  | "party"
  | "partition"
  | "structural";

export type FloorPlanWallPathV2 =
  | {
      kind: "line";
      startVertexId: string;
      endVertexId: string;
    }
  | {
      kind: "arc";
      startVertexId: string;
      endVertexId: string;
      centerVertexId: string;
      clockwise: boolean;
    };

export type FloorPlanWallV2 = {
  id: string;
  path: FloorPlanWallPathV2;
  thicknessMm: number;
  heightMm?: number;
  /** Evidence for an authored wall-specific height override. */
  heightEvidence?: FloorPlanPropertyEvidenceV2;
  baseOffsetMm?: number;
  /** Evidence for the effective wall base offset (authored value or zero). */
  baseOffsetEvidence?: FloorPlanPropertyEvidenceV2;
  classification: FloorPlanWallClassificationV2;
  adjacentRoomIds: string[];
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanDirectedWallReferenceV2 = {
  wallId: string;
  direction: "forward" | "reverse";
};

export type FloorPlanRoomWallLoopV2 = {
  kind: "outer" | "hole";
  walls: FloorPlanDirectedWallReferenceV2[];
};

export type FloorPlanRoomV2 = {
  id: string;
  name: string;
  roomType: string;
  wallLoops: FloorPlanRoomWallLoopV2[];
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanOpeningKindV2 =
  | "door"
  | "window"
  | "open_passage"
  | "gate"
  | "vent"
  | "louvre";

export type FloorPlanOpeningOperationV2 =
  | "swing"
  | "sliding"
  | "folding"
  | "fixed"
  | "open";

export type FloorPlanOpeningV2 = {
  id: string;
  wallId: string;
  kind: FloorPlanOpeningKindV2;
  operation: FloorPlanOpeningOperationV2;
  offsetMm: number;
  widthMm: number;
  heightMm?: number;
  /** Evidence for an authored opening-specific height override. */
  heightEvidence?: FloorPlanPropertyEvidenceV2;
  sillHeightMm?: number;
  /** Evidence for an authored opening-specific sill height override. */
  sillHeightEvidence?: FloorPlanPropertyEvidenceV2;
  hinge: "start" | "end" | "none" | "unknown";
  handing: "left" | "right" | "double" | "none" | "unknown";
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanStructureKindV2 =
  | "column"
  | "shaft"
  | "ledge"
  | "service_strip"
  | "void"
  | "structural_core"
  | "other";

export type FloorPlanStructureV2 = {
  id: string;
  name: string;
  kind: FloorPlanStructureKindV2;
  vertexIds: string[];
  baseOffsetMm: number;
  baseOffsetEvidence?: FloorPlanPropertyEvidenceV2;
  heightMm: number;
  heightEvidence?: FloorPlanPropertyEvidenceV2;
  locked: boolean;
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanAnnotationGeometryV2 =
  | { kind: "point"; vertexId: string }
  | { kind: "polygon"; vertexIds: string[] }
  | { kind: "wall_span"; wallId: string; offsetMm: number; widthMm: number };

export type FloorPlanAnnotationV2 = {
  id: string;
  kind: "label" | "suggested_room" | "optional_partition" | "note";
  text: string;
  geometry: FloorPlanAnnotationGeometryV2;
  configurationId?: string;
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanDimensionV2 = {
  id: string;
  label?: string;
  fromVertexId: string;
  toVertexId: string;
  axis: "aligned" | "horizontal" | "vertical";
  measuredMm: number;
  provenance: FloorPlanEntityProvenanceV2;
};

export type FloorPlanDefaultsV2 = {
  wallHeight: FloorPlanMeasuredPropertyV2;
  doorHeight: FloorPlanMeasuredPropertyV2;
  windowHeight: FloorPlanMeasuredPropertyV2;
  windowSillHeight: FloorPlanMeasuredPropertyV2;
};

export type FloorPlanFloorV2 = {
  id: string;
  name: string;
  levelIndex: number;
  elevationMm: number;
  storeyHeightMm: number;
  slabThicknessMm: number;
  /**
   * Optional only for backwards compatibility. Missing records compile as
   * assumed, preserving the value without silently upgrading its evidence.
   */
  verticalEvidence?: FloorPlanFloorVerticalEvidenceV2;
  defaults: FloorPlanDefaultsV2;
  calibrations: FloorPlanSourceCalibrationV2[];
  vertices: FloorPlanVertexV2[];
  walls: FloorPlanWallV2[];
  rooms: FloorPlanRoomV2[];
  openings: FloorPlanOpeningV2[];
  structures: FloorPlanStructureV2[];
  annotations: FloorPlanAnnotationV2[];
  dimensions: FloorPlanDimensionV2[];
};

export type FloorPlanVerificationV2 = {
  tier: FloorPlanVerificationTierV2;
  criticalIssueIds: string[];
  approvedBy?: string;
  approvedAt?: string;
};

export type FloorPlanDocumentV2 = {
  schemaVersion: 2;
  units: "mm";
  id: string;
  revisionId: string;
  parentRevisionId?: string;
  createdAt: string;
  verification: FloorPlanVerificationV2;
  sources: FloorPlanSourceV2[];
  floors: FloorPlanFloorV2[];
};
