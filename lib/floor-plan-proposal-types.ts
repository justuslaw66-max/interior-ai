import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RoomSnapshot } from "@/lib/room-types";

/** Immutable comparison reference and recoverable associations, never verification authority. */
export type FloorPlanProposalState = {
  originalDocument: FloorPlanDocumentV2;
  roomRecovery: Array<Pick<RoomSnapshot, "id" | "name" | "roomType" | "floorLevel" | "planPosition" | "surfaces" | "surfaceFinishes" | "savedViews" | "layoutVersions">>;
  reviewIssues: string[];
};
