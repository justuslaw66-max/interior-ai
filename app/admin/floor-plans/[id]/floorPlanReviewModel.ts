import type {
  AddressBindingInput,
  BindingDraft,
  Feedback,
  RenderedPage,
  ReviewIssue,
} from "./floorPlanReviewTypes";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanMvpIssueLevel,
  isFloorPlanMvpSuggestionIssue,
} from "@/lib/floor-plan-imports/types";

export const REVIEW_STAGES = [
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
  "ready",
  "applied",
  "published",
] as const;

export const ADDRESS_TRANSFORMS = [
  "normal",
  "mirror_x",
  "mirror_z",
  "rotate_90",
  "rotate_180",
  "rotate_270",
  "mirror_x_rotate_90",
  "mirror_x_rotate_270",
] as const;

export function emptyBinding(): BindingDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    countryCode: "SG",
    addressNormalized: "",
    block: "",
    street: "",
    postalCode: "",
    stack: "",
    floorMin: "",
    floorMax: "",
    transform: "normal",
    role: "catalog",
    sourceEvidenceText: "",
  };
}

export function createAddressBindingEvidenceDraft({
  binding,
  documentId,
  page,
  sourceAsset,
}: {
  binding: BindingDraft;
  documentId: string;
  page: RenderedPage;
  sourceAsset: { id: string; sha256: string };
}) {
  const observed: Record<string, unknown> = {
    documentId,
    stacks: binding.stack.trim() ? [binding.stack.trim()] : [],
  };
  if (binding.addressNormalized.trim()) {
    observed.addressNormalized = binding.addressNormalized.trim();
  }
  if (binding.postalCode.trim()) {
    observed.postalCode = binding.postalCode.trim();
  }
  if (binding.block.trim()) {
    observed.block = binding.block.trim();
  }
  const floorMin = Number(binding.floorMin);
  const floorMax = Number(binding.floorMax);
  if (
    binding.floorMin.trim() &&
    binding.floorMax.trim() &&
    Number.isInteger(floorMin) &&
    Number.isInteger(floorMax)
  ) {
    observed.floorMin = floorMin;
    observed.floorMax = floorMax;
  }

  return JSON.stringify(
    {
      schemaVersion: 1,
      sourceId: sourceAsset.id,
      sourceSha256: sourceAsset.sha256.toLowerCase(),
      pageNumber: page.pageNumber,
      cropPx: {
        xPx: 0,
        yPx: 0,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
      },
      observed,
      orientationSupport: {
        transform: binding.transform,
        sourceUp: "page_top",
        basis: "reviewer_alignment",
      },
      reviewerConfirmation: {
        confirmed: true,
        scope: "address_binding_and_orientation",
      },
    },
    null,
    2
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getRenderedPages(value: unknown): RenderedPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (page): page is RenderedPage =>
      isRecord(page) &&
      Number.isInteger(page.pageNumber) &&
      typeof page.widthPx === "number" &&
      typeof page.heightPx === "number" &&
      typeof page.assetKey === "string"
  );
}

export function getReviewIssues(value: unknown): ReviewIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (issue): issue is ReviewIssue =>
      isRecord(issue) &&
      typeof issue.id === "string" &&
      typeof issue.code === "string" &&
      typeof issue.message === "string" &&
      ["info", "warning", "critical"].includes(String(issue.severity)) &&
      typeof issue.resolved === "boolean"
  );
}

export function defaultReviewIssueResolution(
  issue: ReviewIssue,
  document: FloorPlanDocumentV2 | null
) {
  const floorCount = document?.floors.length ?? 0;
  const roomCount =
    document?.floors.reduce((total, floor) => total + floor.rooms.length, 0) ?? 0;
  const wallCount =
    document?.floors.reduce((total, floor) => total + floor.walls.length, 0) ?? 0;
  if (["scale_unresolved", "source_registration_incomplete"].includes(issue.code)) {
    return `Confirmed source-to-millimetre calibration for ${floorCount} floor${floorCount === 1 ? "" : "s"}.`;
  }
  if (
    ["room_topology_unresolved", "canonical_room_coverage_incomplete"].includes(
      issue.code
    )
  ) {
    return `Confirmed ${roomCount} closed room outline${roomCount === 1 ? "" : "s"} and ${wallCount} wall${wallCount === 1 ? "" : "s"} against the source plan.`;
  }
  if (
    ["structures_confirmation", "exterior_boundary_confirmation"].includes(
      issue.code
    )
  ) {
    return "Confirmed the structural footprint and exterior boundary against the source plan.";
  }
  return "Confirmed this required check against the uploaded source plan.";
}

export function withDefaultReviewIssueResolutions(
  issues: ReviewIssue[],
  document: FloorPlanDocumentV2 | null
) {
  return issues.map((issue) =>
    issue.severity === "critical" &&
    !isFloorPlanMvpSuggestionIssue(issue) &&
    issue.resolved &&
    !issue.resolution?.trim()
      ? {
          ...issue,
          resolution: defaultReviewIssueResolution(issue, document),
        }
      : issue
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function optionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer, received ${value}`);
  }
  return parsed;
}

export function buildAddressBindingInputs(
  bindings: BindingDraft[]
): AddressBindingInput[] {
  return bindings
    .filter((binding) =>
      [
        binding.addressNormalized,
        binding.block,
        binding.street,
        binding.postalCode,
        binding.stack,
      ].some(
        (value) => value.trim()
      )
    )
    .map((binding) => {
      if (
        binding.countryCode.trim().length !== 2 ||
        !binding.addressNormalized.trim() ||
        (!binding.postalCode.trim() &&
          !(binding.block.trim() && binding.street.trim()))
      ) {
        throw new Error(
          "Each searchable plan needs country, full address, and either postal code or block and street"
        );
      }
      const floorMin = optionalInteger(binding.floorMin);
      const floorMax = optionalInteger(binding.floorMax);
      if ((floorMin === null) !== (floorMax === null)) {
        throw new Error("Optional unit details need both floor minimum and maximum");
      }
      if (!binding.sourceEvidenceText.trim()) {
        throw new Error(
          `Structured source evidence is required for ${binding.addressNormalized}`
        );
      }
      return {
        countryCode: binding.countryCode.trim().toUpperCase(),
        addressNormalized: binding.addressNormalized.trim(),
        block: binding.block.trim(),
        street: binding.street.trim(),
        postalCode: binding.postalCode.trim() || null,
        stack: binding.stack.trim() || null,
        floorMin,
        floorMax,
        transform: binding.transform,
        role: binding.role,
        sourceEvidence: parseJson(
          binding.sourceEvidenceText,
          `Source evidence for ${binding.addressNormalized}`
        ),
      };
    });
}

export function createConstructionEvidenceDraft() {
  return JSON.stringify(
    {
      schemaVersion: 1,
      kind: "as_built",
      unit: {
        address: "",
        countryCode: "",
        block: "",
        street: "",
        stack: "",
        floor: 1,
      },
      source: {
        name: "",
        sha256: "",
        mimeType: "application/pdf",
        issuer: "",
      },
      confirmedEntityIds: [],
      measurements: [],
      reviewerNotes: "",
    },
    null,
    2
  );
}

export function issueTone(issue: ReviewIssue) {
  if (issue.resolved) return "border-emerald-200 bg-emerald-50";
  if (floorPlanMvpIssueLevel(issue) === "blocking") {
    return "border-red-200 bg-red-50";
  }
  if (issue.severity === "warning" || issue.severity === "critical") {
    return "border-amber-200 bg-amber-50";
  }
  return "border-blue-200 bg-blue-50";
}

export function feedbackTone(feedback: Feedback) {
  if (feedback?.tone === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (feedback?.tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}
