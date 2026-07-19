import type { FloorPlanImportStatus } from "./types";

const TRANSITIONS: Record<FloorPlanImportStatus, readonly FloorPlanImportStatus[]> = {
  received: ["rendered", "failed"],
  rendered: ["extracted", "failed"],
  extracted: ["scale_solved", "needs_review", "failed"],
  scale_solved: ["topology_built", "needs_review", "failed"],
  topology_built: ["validating", "needs_review", "failed"],
  validating: ["needs_review", "ready", "failed"],
  needs_review: ["validating", "failed"],
  ready: ["applied", "published", "failed"],
  applied: [],
  published: [],
  failed: [],
};

export const FLOOR_PLAN_IMPORT_PROGRESS: Record<FloorPlanImportStatus, number> = {
  received: 5,
  rendered: 20,
  extracted: 40,
  scale_solved: 55,
  topology_built: 70,
  validating: 85,
  needs_review: 85,
  ready: 100,
  applied: 100,
  published: 100,
  failed: 100,
};

export function canTransitionFloorPlanImport(
  from: FloorPlanImportStatus,
  to: FloorPlanImportStatus
) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertFloorPlanImportTransition(
  from: FloorPlanImportStatus,
  to: FloorPlanImportStatus
) {
  if (!canTransitionFloorPlanImport(from, to)) {
    throw new Error(`Invalid floor-plan import transition: ${from} -> ${to}`);
  }
}

export function isTerminalFloorPlanImportStatus(status: FloorPlanImportStatus) {
  return status === "applied" || status === "published" || status === "failed";
}
