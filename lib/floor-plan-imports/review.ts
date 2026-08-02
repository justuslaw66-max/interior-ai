import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import { hashCanonicalJson } from "./json";
import {
  floorPlanMvpBlockingIssueIds,
  isFloorPlanMvpSuggestionIssue,
  type FloorPlanReviewIssue,
} from "./types";

type ReviewableEntity = { id: string; provenance: FloorPlanEntityProvenanceV2 };

function withoutProvenance(entity: ReviewableEntity) {
  const { provenance: _provenance, ...authored } = entity;
  return authored;
}

function isUnchanged(current: ReviewableEntity | undefined, next: ReviewableEntity) {
  return Boolean(
    current &&
      hashCanonicalJson(withoutProvenance(current)) ===
        hashCanonicalJson(withoutProvenance(next))
  );
}

function userConfirmedProvenance(input: {
  sourceId: string;
  userId: string;
  at: string;
  note: string;
  pageNumber?: number;
}): FloorPlanEntityProvenanceV2 {
  return {
    confidence: 0.8,
    extractionVersion: "consumer-review-1",
    evidence: [
      {
        sourceId: input.sourceId,
        basis: "user_confirmed",
        confidence: 0.8,
        extractorVersion: "consumer-review-1",
        ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}),
        note: input.note,
      },
    ],
    reviewHistory: [
      {
        id: `consumer-confirmation-${input.at.replace(/[^0-9]/g, "")}`,
        action: "confirmed",
        reviewerId: input.userId,
        reviewedAt: input.at,
        note: input.note,
      },
    ],
  };
}

function sanitizeEntities<T extends ReviewableEntity>(input: {
  current: T[];
  next: T[];
  sourceId: string;
  userId: string;
  at: string;
  note: string;
  pageNumber?: number;
}): T[] {
  const currentById = new Map(input.current.map((entity) => [entity.id, entity]));
  return input.next.map((entity) => {
    const current = currentById.get(entity.id);
    return {
      ...entity,
      provenance: isUnchanged(current, entity)
        ? current!.provenance
        : userConfirmedProvenance(input),
    };
  });
}

function sanitizeFloor(input: {
  current: FloorPlanFloorV2 | undefined;
  next: FloorPlanFloorV2;
  sourceId: string;
  userId: string;
  at: string;
  note: string;
}): FloorPlanFloorV2 {
  const current = input.current;
  const pageNumber = input.next.calibrations[0]?.pageNumber;
  const entityInput = {
    sourceId: input.sourceId,
    userId: input.userId,
    at: input.at,
    note: input.note,
    pageNumber,
  };
  const sanitizeMeasured = (
    key: keyof FloorPlanFloorV2["defaults"]
  ): FloorPlanFloorV2["defaults"][typeof key] => {
    const next = input.next.defaults[key];
    const previous = current?.defaults[key];
    if (
      previous &&
      previous.valueMm === next.valueMm &&
      previous.evidence === next.evidence
    ) {
      return { ...next, provenance: previous.provenance };
    }
    return {
      ...next,
      evidence: "user_confirmed",
      provenance: userConfirmedProvenance(entityInput),
    };
  };
  return {
    ...input.next,
    defaults: {
      wallHeight: sanitizeMeasured("wallHeight"),
      doorHeight: sanitizeMeasured("doorHeight"),
      windowHeight: sanitizeMeasured("windowHeight"),
      windowSillHeight: sanitizeMeasured("windowSillHeight"),
    },
    vertices: sanitizeEntities({ current: current?.vertices ?? [], next: input.next.vertices, ...entityInput }),
    walls: sanitizeEntities({ current: current?.walls ?? [], next: input.next.walls, ...entityInput }),
    rooms: sanitizeEntities({ current: current?.rooms ?? [], next: input.next.rooms, ...entityInput }),
    openings: sanitizeEntities({ current: current?.openings ?? [], next: input.next.openings, ...entityInput }),
    structures: sanitizeEntities({ current: current?.structures ?? [], next: input.next.structures, ...entityInput }),
    annotations: sanitizeEntities({ current: current?.annotations ?? [], next: input.next.annotations, ...entityInput }),
    dimensions: sanitizeEntities({ current: current?.dimensions ?? [], next: input.next.dimensions, ...entityInput }),
  };
}

export function validateReviewIssueResolution(
  current: FloorPlanReviewIssue[],
  submitted: FloorPlanReviewIssue[]
) {
  if (submitted.length !== current.length) {
    throw new Error("Review issues cannot be added or removed by the client");
  }
  const submittedById = new Map(submitted.map((issue) => [issue.id, issue]));
  return current.map((issue) => {
    const next = submittedById.get(issue.id);
    if (
      !next ||
      next.code !== issue.code ||
      next.message !== issue.message ||
      next.severity !== issue.severity ||
      hashCanonicalJson(next.entityIds ?? []) !== hashCanonicalJson(issue.entityIds ?? [])
    ) {
      throw new Error(`Review issue ${issue.id} was modified instead of resolved`);
    }
    if (
      issue.severity === "critical" &&
      !isFloorPlanMvpSuggestionIssue(issue) &&
      next.resolved &&
      (!next.resolution || next.resolution.trim().length < 12)
    ) {
      throw new Error(
        `Critical review issue ${issue.id} requires a descriptive resolution note`
      );
    }
    return {
      ...issue,
      resolved: next.resolved,
      ...(next.resolution ? { resolution: next.resolution } : {}),
    };
  });
}

export function applyConsumerFloorPlanCorrection(input: {
  current: FloorPlanDocumentV2;
  next: FloorPlanDocumentV2;
  currentIssues: FloorPlanReviewIssue[];
  submittedIssues: FloorPlanReviewIssue[];
  sourceId: string;
  sourceSha256: string;
  userId: string;
  note: string;
  at?: string;
}) {
  if (
    input.next.id !== input.current.id ||
    input.next.schemaVersion !== 2 ||
    input.next.units !== "mm"
  ) {
    throw new Error("Canonical document identity cannot be changed during review");
  }
  if (input.next.verification.tier !== "needs_review") {
    throw new Error("Consumer review cannot assign a verified tier");
  }
  const uploadedSource = input.current.sources.find(
    (source) => source.id === input.sourceId && source.sha256 === input.sourceSha256
  );
  if (!uploadedSource) throw new Error("Current candidate is not bound to its uploaded source");
  if (hashCanonicalJson(input.next.sources) !== hashCanonicalJson(input.current.sources)) {
    throw new Error("Source provenance cannot be changed during consumer review");
  }
  const issues = validateReviewIssueResolution(input.currentIssues, input.submittedIssues);
  const unresolvedCriticalIds = floorPlanMvpBlockingIssueIds(issues);
  const at = input.at ?? new Date().toISOString();
  const currentFloors = new Map(input.current.floors.map((floor) => [floor.id, floor]));
  const document: FloorPlanDocumentV2 = {
    ...input.next,
    // Guided repair mutations use transient client revision IDs so their local
    // history remains auditable. The import job owns canonical revision
    // identity, so never persist client-supplied revision lineage.
    revisionId: input.current.revisionId,
    parentRevisionId: input.current.parentRevisionId,
    createdAt: input.current.createdAt,
    sources: input.current.sources,
    verification: {
      tier: "needs_review",
      criticalIssueIds: unresolvedCriticalIds,
    },
    floors: input.next.floors.map((floor) =>
      sanitizeFloor({
        current: currentFloors.get(floor.id),
        next: floor,
        sourceId: input.sourceId,
        userId: input.userId,
        at,
        note: input.note || "Consumer confirmed import review",
      })
    ),
  };
  return { document, issues };
}
