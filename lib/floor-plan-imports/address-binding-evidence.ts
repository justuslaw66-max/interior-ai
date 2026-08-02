import { z } from "zod";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanRenderedPage } from "./types";

export const FLOOR_PLAN_ADDRESS_TRANSFORMS = [
  "normal",
  "mirror_x",
  "mirror_z",
  "rotate_90",
  "rotate_180",
  "rotate_270",
  "mirror_x_rotate_90",
  "mirror_x_rotate_270",
] as const;

const sourceCropSchema = z
  .object({
    xPx: z.number().finite().nonnegative(),
    yPx: z.number().finite().nonnegative(),
    widthPx: z.number().finite().positive(),
    heightPx: z.number().finite().positive(),
  })
  .strict();

const addressAnchorSchema = z
  .object({
    kind: z.enum([
      "address_label",
      "postal_code",
      "block_label",
      "stack_label",
      "floor_range",
      "layout_label",
      "orientation_marker",
    ]),
    xPx: z.number().finite().nonnegative(),
    yPx: z.number().finite().nonnegative(),
    observedText: z.string().trim().min(1).max(240),
  })
  .strict();

export const floorPlanAddressBindingEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.string().trim().min(1).max(200),
    sourceSha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/),
    pageNumber: z.number().int().positive().max(10_000),
    cropPx: sourceCropSchema.optional(),
    anchors: z.array(addressAnchorSchema).min(1).max(100).optional(),
    observed: z
      .object({
        addressNormalized: z.string().trim().min(1).max(240).optional(),
        postalCode: z.string().trim().min(1).max(24).optional(),
        block: z.string().trim().min(1).max(32).optional(),
        stacks: z.array(z.string().trim().min(1).max(32)).max(500).default([]),
        floorMin: z.number().int().min(-20).max(300).nullable().optional(),
        floorMax: z.number().int().min(-20).max(300).nullable().optional(),
        documentId: z.string().trim().min(1).max(200),
      })
      .strict(),
    orientationSupport: z
      .object({
        transform: z.enum(FLOOR_PLAN_ADDRESS_TRANSFORMS),
        sourceUp: z.enum(["page_top", "page_right", "page_bottom", "page_left"]),
        basis: z.enum([
          "source_orientation_marker",
          "registered_overlay",
          "building_context",
          "reviewer_alignment",
        ]),
      })
      .strict(),
    reviewerConfirmation: z
      .object({
        confirmed: z.literal(true),
        scope: z.literal("address_binding_and_orientation"),
        reviewerId: z.string().trim().min(1).max(320).optional(),
        reviewedAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (!evidence.cropPx && !evidence.anchors?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cropPx"],
        message: "A bounded crop or one or more source anchors are required",
      });
    }
    if (
      !evidence.observed.addressNormalized &&
      !evidence.observed.postalCode &&
      !evidence.observed.block
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observed"],
        message: "Observed full address, postal code, or block is required",
      });
    }
    const hasFloorMin = evidence.observed.floorMin !== null &&
      evidence.observed.floorMin !== undefined;
    const hasFloorMax = evidence.observed.floorMax !== null &&
      evidence.observed.floorMax !== undefined;
    if (hasFloorMin !== hasFloorMax) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observed", "floorMin"],
        message: "Observed floor range requires both floorMin and floorMax",
      });
    } else if (
      hasFloorMin &&
      hasFloorMax &&
      evidence.observed.floorMin! > evidence.observed.floorMax!
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observed", "floorMin"],
        message: "Observed floorMin cannot exceed floorMax",
      });
    }
    const normalizedStacks = evidence.observed.stacks.map((stack) =>
      stack.trim().toUpperCase()
    );
    if (new Set(normalizedStacks).size !== normalizedStacks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observed", "stacks"],
        message: "Observed stacks must be unique",
      });
    }
  });

export type FloorPlanAddressBindingEvidence = z.infer<
  typeof floorPlanAddressBindingEvidenceSchema
>;

export type AddressBindingWithEvidence = {
  id?: string;
  revisionId?: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode?: string | null;
  stack?: string | null;
  floorMin?: number | null;
  floorMax?: number | null;
  transform: string;
  role?: "catalog" | "authored_variant";
  sourceEvidence?: unknown;
  sourceEvidenceJson?: unknown;
};

export class FloorPlanAddressBindingEvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`ADDRESS_BINDING_EVIDENCE_${code}: ${message}`);
    this.name = "FloorPlanAddressBindingEvidenceError";
    this.code = code;
  }
}

type EvidenceContext = {
  document: FloorPlanDocumentV2;
  sourceAsset: {
    id: string;
    sha256: string;
    contentDeletedAt?: Date | string | null;
  };
  renderedPages: readonly FloorPlanRenderedPage[];
  supplementarySources?: readonly {
    sourceAsset: {
      id: string;
      sha256: string;
      contentDeletedAt?: Date | string | null;
    };
    renderedPages: readonly FloorPlanRenderedPage[];
  }[];
  reviewer?: { id: string; reviewedAt: string };
};

function fail(code: string, message: string): never {
  throw new FloorPlanAddressBindingEvidenceError(code, message);
}

function normalizedSelector(value: string) {
  return value.trim().toUpperCase();
}

function parseEvidence(value: unknown, bindingLabel: string) {
  const parsed = floorPlanAddressBindingEvidenceSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(
      "MALFORMED",
      `${bindingLabel}: ${issue.path.join(".") || "sourceEvidence"} ${issue.message}`
    );
  }
  return parsed.data;
}

function resolveEvidenceSource(
  evidence: FloorPlanAddressBindingEvidence,
  context: EvidenceContext,
  label: string
) {
  if (evidence.sourceId === context.sourceAsset.id) {
    if (context.sourceAsset.contentDeletedAt) {
      fail("WRONG_SOURCE", `${label}: primary source content has been deleted`);
    }
    return {
      sourceAsset: context.sourceAsset,
      renderedPages: context.renderedPages,
    };
  }
  const matches = (context.supplementarySources ?? []).filter(
    (entry) => entry.sourceAsset.id === evidence.sourceId
  );
  if (matches.length !== 1) {
    fail(
      "WRONG_SOURCE",
      `${label}: sourceId is not a job-scoped durable primary or supplementary source`
    );
  }
  if (matches[0].sourceAsset.contentDeletedAt) {
    fail("WRONG_SOURCE", `${label}: supplementary source content has been deleted`);
  }
  return matches[0];
}

function validateEvidence(
  binding: AddressBindingWithEvidence,
  evidence: FloorPlanAddressBindingEvidence,
  context: EvidenceContext
) {
  const label = `${binding.addressNormalized}${binding.stack ? ` stack ${binding.stack}` : ""}`;
  const selectedSource = resolveEvidenceSource(evidence, context, label);
  if (evidence.sourceSha256 !== selectedSource.sourceAsset.sha256.toLowerCase()) {
    fail("WRONG_SOURCE_HASH", `${label}: sourceSha256 does not match the source asset`);
  }
  const canonicalSource = context.document.sources.find(
    (source) => source.id === evidence.sourceId
  );
  if (
    !canonicalSource ||
    canonicalSource.sha256?.toLowerCase() !== evidence.sourceSha256
  ) {
    fail(
      "SOURCE_NOT_CANONICAL",
      `${label}: source evidence is not bound to the canonical document source`
    );
  }

  const page = selectedSource.renderedPages.find(
    (entry) => entry.pageNumber === evidence.pageNumber
  );
  if (!page) {
    fail("WRONG_PAGE", `${label}: source page ${evidence.pageNumber} was not rendered`);
  }
  if (
    canonicalSource.pageCount !== undefined &&
    evidence.pageNumber > canonicalSource.pageCount
  ) {
    fail("WRONG_PAGE", `${label}: source page exceeds the source page count`);
  }

  if (evidence.cropPx) {
    const crop = evidence.cropPx;
    if (
      crop.xPx + crop.widthPx > page.widthPx ||
      crop.yPx + crop.heightPx > page.heightPx
    ) {
      fail("OUT_OF_BOUNDS", `${label}: source crop extends outside the rendered page`);
    }
  }
  for (const anchor of evidence.anchors ?? []) {
    if (anchor.xPx >= page.widthPx || anchor.yPx >= page.heightPx) {
      fail("OUT_OF_BOUNDS", `${label}: source anchor extends outside the rendered page`);
    }
    if (
      evidence.cropPx &&
      (anchor.xPx < evidence.cropPx.xPx ||
        anchor.yPx < evidence.cropPx.yPx ||
        anchor.xPx > evidence.cropPx.xPx + evidence.cropPx.widthPx ||
        anchor.yPx > evidence.cropPx.yPx + evidence.cropPx.heightPx)
    ) {
      fail("OUT_OF_BOUNDS", `${label}: source anchor is outside its evidence crop`);
    }
  }

  const addressMatches = Boolean(
    evidence.observed.addressNormalized &&
    normalizedSelector(evidence.observed.addressNormalized) ===
      normalizedSelector(binding.addressNormalized)
  );
  const postalMatches = Boolean(
    binding.postalCode?.trim() &&
    evidence.observed.postalCode &&
    normalizedSelector(evidence.observed.postalCode) ===
      normalizedSelector(binding.postalCode)
  );
  const blockMatches = Boolean(
    binding.block.trim() &&
    evidence.observed.block &&
    normalizedSelector(evidence.observed.block) === normalizedSelector(binding.block)
  );
  if (!addressMatches && !postalMatches && !blockMatches) {
    fail(
      "OBSERVED_SELECTOR_MISMATCH",
      `${label}: source evidence does not match its full address, postal code, or block`
    );
  }
  if (binding.stack?.trim()) {
    const observedStacks = evidence.observed.stacks.map(normalizedSelector);
    if (!observedStacks.includes(normalizedSelector(binding.stack))) {
      fail(
        "OBSERVED_SELECTOR_MISMATCH",
        `${label}: observed stacks do not include the optional binding stack`
      );
    }
  }
  const hasBindingFloorMin = Number.isInteger(binding.floorMin);
  const hasBindingFloorMax = Number.isInteger(binding.floorMax);
  if (hasBindingFloorMin !== hasBindingFloorMax) {
    fail("MISSING_FLOOR_RANGE", `${label}: optional floor ranges require both bounds`);
  }
  if (
    hasBindingFloorMin &&
    (evidence.observed.floorMin !== binding.floorMin ||
      evidence.observed.floorMax !== binding.floorMax)
  ) {
    fail(
      "OBSERVED_SELECTOR_MISMATCH",
      `${label}: observed floor range does not match the optional binding range`
    );
  }
  if (evidence.observed.documentId !== context.document.id) {
    fail(
      "WRONG_LAYOUT",
      `${label}: observed layout is not the canonical document being approved`
    );
  }
  if (evidence.orientationSupport.transform !== binding.transform) {
    fail(
      "UNSUPPORTED_TRANSFORM",
      `${label}: source orientation does not support transform ${binding.transform}`
    );
  }

  if (context.reviewer) {
    return {
      ...evidence,
      reviewerConfirmation: {
        confirmed: true as const,
        scope: "address_binding_and_orientation" as const,
        reviewerId: context.reviewer.id,
        reviewedAt: context.reviewer.reviewedAt,
      },
    };
  }
  if (
    !evidence.reviewerConfirmation.reviewerId ||
    !evidence.reviewerConfirmation.reviewedAt
  ) {
    fail(
      "UNCONFIRMED",
      `${label}: persisted address evidence requires reviewer confirmation`
    );
  }
  return evidence;
}

/**
 * Validates every address-search selector against the source and canonical
 * layout. Passing a reviewer stamps trusted server identity/time over any
 * submitted values. An empty binding list is a valid non-addressable starter.
 */
export function validateFloorPlanAddressBindingEvidence<
  TBinding extends AddressBindingWithEvidence,
>(
  bindings: readonly TBinding[],
  context: EvidenceContext
) {
  return bindings.map((binding) => {
    const rawEvidence =
      binding.sourceEvidenceJson === undefined
        ? binding.sourceEvidence
        : binding.sourceEvidenceJson;
    if (rawEvidence === undefined || rawEvidence === null) {
      fail(
        "MISSING",
        `${binding.addressNormalized}${binding.stack ? ` stack ${binding.stack}` : ""}: structured source evidence is required`
      );
    }
    const evidence = parseEvidence(rawEvidence, binding.addressNormalized);
    return {
      ...binding,
      sourceEvidence: validateEvidence(binding, evidence, context),
    };
  });
}
