import { DESIGN_DOCUMENT_LIMITS } from "./design-document-contract";
import {
  packFloorPlanCandidate,
  sourceDrawingBudget,
  unpackFloorPlanCandidate,
} from "./floor-plan-imports/candidate-storage";

/**
 * How a design stores the floor-plan documents it carries: `floorPlan.canonicalDocument` and, while a proposal is open,
 * `floorPlan.proposal.originalDocument`. At rest (the database, the browser backup, request and response bodies) their
 * source drawing may be packed, as an import's candidate is (floor-plan-imports/candidate-storage.ts); in memory, in the
 * editor and on every server path that uses them, they are unpacked. `snapshotToStored` and `sanitizeStoredDesign`
 * give the stored form; `storedToSnapshot` gives the unpacked one (docs/architecture/floor-plan-candidate-storage.md,
 * "Designs").
 */

/**
 * Whether designs store their plans packed. Off in the release that teaches every reader to unpack, so a build or an
 * open tab that predates it never meets a packed design; on in a later release.
 */
export const STORE_DESIGN_SOURCE_DRAWING_PACKED = false;

/**
 * The most a design's plans may expand to when unpacked (their JSON, roughly), counted across both documents. While
 * designs are stored unpacked that is the design limit itself, since a design past it is refused anyway; once they are
 * stored packed, four times it.
 */
export const MAX_UNPACKED_DESIGN_PLAN_BYTES =
  DESIGN_DOCUMENT_LIMITS.maxSerializedBytes * (STORE_DESIGN_SOURCE_DRAWING_PACKED ? 4 : 1);

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The floor plan with its documents mapped; the same object when neither changes. */
function mapFloorPlanDocuments<T>(floorPlan: T, map: (document: unknown) => unknown): T {
  if (!isRecord(floorPlan)) return floorPlan;
  let next: JsonRecord = floorPlan;
  if (floorPlan.canonicalDocument !== undefined) {
    const canonicalDocument = map(floorPlan.canonicalDocument);
    if (canonicalDocument !== floorPlan.canonicalDocument) next = { ...next, canonicalDocument };
  }
  const proposal = floorPlan.proposal;
  if (isRecord(proposal) && proposal.originalDocument !== undefined) {
    const originalDocument = map(proposal.originalDocument);
    if (originalDocument !== proposal.originalDocument) next = { ...next, proposal: { ...proposal, originalDocument } };
  }
  return next as T;
}

/** The floor plan with both documents unpacked against one budget. Throws on a malformed pack or past the limit. */
export function unpackDesignFloorPlan<T>(floorPlan: T): T {
  const budget = sourceDrawingBudget(MAX_UNPACKED_DESIGN_PLAN_BYTES);
  return mapFloorPlanDocuments(floorPlan, (document) => unpackFloorPlanCandidate(document, budget));
}

/**
 * The floor plan as the editor and the server read it: unpacked. One that can't be unpacked (a malformed pack, or one
 * past this build's limit, as a later build's design is after a rollback) is given as it is stored: the plan shows
 * without its source drawing, nothing is lost, and saving it is refused until a build that can read it is back.
 */
export function readDesignFloorPlan<T>(floorPlan: T): T {
  try {
    return unpackDesignFloorPlan(floorPlan);
  } catch {
    return floorPlan;
  }
}

/** Both documents in the stored form: packed, against one budget, when `storePacked`. Throws as unpacking does. */
function storedForm<T>(floorPlan: T, storePacked: boolean): T {
  const unpacked = unpackDesignFloorPlan(floorPlan);
  if (!storePacked) return unpacked;
  const budget = sourceDrawingBudget(MAX_UNPACKED_DESIGN_PLAN_BYTES);
  return mapFloorPlanDocuments(unpacked, (document) => packFloorPlanCandidate(document, budget));
}

/**
 * The floor plan as it is stored and sent: packed once STORE_DESIGN_SOURCE_DRAWING_PACKED is on. A plan that can't be
 * unpacked is given as it is (the editor keeps working; the server refuses to save it).
 */
export function packDesignFloorPlanForStorage<T>(floorPlan: T, storePacked = STORE_DESIGN_SOURCE_DRAWING_PACKED): T {
  try {
    return storedForm(floorPlan, storePacked);
  } catch {
    return floorPlan;
  }
}

/** The floor plan as a save stores it, checked: throws on a malformed pack or past the limit, so the save is refused. */
export function checkedDesignFloorPlanForStorage<T>(floorPlan: T, storePacked = STORE_DESIGN_SOURCE_DRAWING_PACKED): T {
  return storedForm(floorPlan, storePacked);
}
