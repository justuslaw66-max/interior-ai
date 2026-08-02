export const FLOOR_PLAN_IMPORT_STATUSES = [
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
  "ready",
  "applied",
  "published",
  "failed",
] as const;

export type FloorPlanImportStatus = (typeof FLOOR_PLAN_IMPORT_STATUSES)[number];

export const FLOOR_PLAN_SOURCE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
  "application/ifc",
  "application/x-ifc",
  "application/step",
  "application/x-step",
  "application/acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-acad",
  "application/x-dwg",
  "image/vnd.dwg",
] as const;

export type FloorPlanSourceMimeType = (typeof FLOOR_PLAN_SOURCE_MIME_TYPES)[number];

export type FloorPlanReviewIssueSeverity = "info" | "warning" | "critical";

export type FloorPlanReviewIssue = {
  id: string;
  code: string;
  message: string;
  severity: FloorPlanReviewIssueSeverity;
  entityIds?: string[];
  resolved: boolean;
  resolution?: string;
};

export type FloorPlanVerificationTier =
  | "unverified"
  | "source_verified"
  | "construction_verified";

export type FloorPlanPublicationStatus = "draft" | "approved" | "published" | "retired";

export type FloorPlanAddressTransform =
  | "normal"
  | "mirror_x"
  | "mirror_z"
  | "rotate_90"
  | "rotate_180"
  | "rotate_270"
  | "mirror_x_rotate_90"
  | "mirror_x_rotate_270";

export type FloorPlanSourceDescriptor = {
  id: string;
  fileName: string;
  /** MIME is open-ended so future CAD adapters do not require editor changes. */
  mimeType: string;
  byteLength: number;
  sha256: string;
};

export type FloorPlanRenderedPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  assetKey: string;
  normalization?: {
    kind: "raster_deskew_v1";
    coordinateSpace: "exif_oriented_source_px_to_rendered_px";
    sourceWidthPx: number;
    sourceHeightPx: number;
    detectedSkewDegrees: number;
    appliedRotationDegrees: number;
    confidence: number;
    applied: boolean;
    /** [a,b,c,d,e,f] maps source (x,y) to rendered (x,y). */
    sourceToRendered: [number, number, number, number, number, number];
  };
};

export type FloorPlanPageCandidate = {
  pageNumber: number;
  rank: number;
  score: number;
  widthPx: number;
  heightPx: number;
  roomLabelCount: number;
  dimensionLabelCount: number;
  openingSymbolCount: number;
  vectorPathCount: number;
  vectorSegmentCount: number;
};

export type FloorPlanExtractionResult = {
  candidate: Record<string, unknown> | null;
  sourceManifest: Record<string, unknown> | null;
  reviewIssues: FloorPlanReviewIssue[];
  metrics?: Record<string, number | string | boolean | null>;
};

export type FloorPlanImportJobRecord = {
  id: string;
  userId: string;
  sourceAssetId: string;
  status: FloorPlanImportStatus;
  statusChangedAt: Date | null;
  adapterId: string | null;
  extractionVersion: string | null;
  renderedPages: FloorPlanRenderedPage[];
  candidate: Record<string, unknown> | null;
  sourceManifest: Record<string, unknown> | null;
  reviewIssues: FloorPlanReviewIssue[];
  progress: number;
  errorMessage: string | null;
  privacy: import("./privacy").FloorPlanImportPrivacy;
  attemptCount: number;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorAt: Date | null;
  lastRecoveredAt: Date | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
};

/** Review items that improve an import without blocking its 2D/3D baseline. */
export const FLOOR_PLAN_MVP_SUGGESTION_CODES = new Set([
  "rooms_confirmation",
  "source_room_coverage_incomplete",
  "unlabeled_rooms_require_name",
  "openings_confirmation",
  "entrance_confirmation",
  "assumed_heights_confirmation",
  "exterior_boundary_confirmation",
]);

export function isFloorPlanMvpSuggestionIssue(
  issue: Pick<FloorPlanReviewIssue, "code" | "severity">
) {
  return (
    issue.severity !== "critical" ||
    FLOOR_PLAN_MVP_SUGGESTION_CODES.has(issue.code)
  );
}

export function isFloorPlanMvpBlockingIssue(
  issue: Pick<FloorPlanReviewIssue, "code" | "severity" | "resolved">
) {
  return (
    issue.severity === "critical" &&
    !issue.resolved &&
    !FLOOR_PLAN_MVP_SUGGESTION_CODES.has(issue.code)
  );
}

export function floorPlanMvpIssueLevel(
  issue: Pick<FloorPlanReviewIssue, "code" | "severity" | "resolved">
) {
  if (issue.resolved) return "resolved" as const;
  return isFloorPlanMvpBlockingIssue(issue)
    ? ("blocking" as const)
    : ("suggestion" as const);
}

export function floorPlanMvpBlockingIssueIds(
  issues: readonly FloorPlanReviewIssue[]
) {
  return issues.filter(isFloorPlanMvpBlockingIssue).map((issue) => issue.id);
}
