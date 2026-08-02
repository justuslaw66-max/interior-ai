import path from "node:path";
import { z } from "zod";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  compileFloorPlanDocumentV2,
  FloorPlanDocumentValidationErrorV2,
} from "@/lib/floor-plan-compiler-v2";
import {
  FLOOR_PLAN_SOURCE_MIME_TYPES,
  isFloorPlanMvpBlockingIssue,
  isFloorPlanMvpSuggestionIssue,
  type FloorPlanRenderedPage,
  type FloorPlanReviewIssue,
  type FloorPlanSourceMimeType,
} from "./types";

export const MAX_FLOOR_PLAN_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_FLOOR_PLAN_CANDIDATE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, FloorPlanSourceMimeType> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".dxf": "application/dxf",
  ".ifc": "application/ifc",
  ".ifcstep": "application/x-step",
  ".step": "application/step",
  ".stp": "application/step",
  ".dwg": "application/dwg",
};

const reviewIssueSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(2_000),
    severity: z.enum(["info", "warning", "critical"]),
    entityIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
    resolved: z.boolean(),
    resolution: z.string().trim().max(2_000).optional(),
  })
  .superRefine((issue, context) => {
    if (
      issue.severity === "critical" &&
      !isFloorPlanMvpSuggestionIssue(issue) &&
      issue.resolved &&
      !issue.resolution
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolution"],
        message: "Resolved critical issues require a resolution note",
      });
    }
  });

const renderedPageSchema = z.object({
  pageNumber: z.number().int().positive().max(10_000),
  widthPx: z.number().int().positive().max(100_000),
  heightPx: z.number().int().positive().max(100_000),
  assetKey: z.string().trim().min(1).max(500),
  normalization: z
    .object({
      kind: z.literal("raster_deskew_v1"),
      coordinateSpace: z.literal("exif_oriented_source_px_to_rendered_px"),
      sourceWidthPx: z.number().int().positive().max(100_000),
      sourceHeightPx: z.number().int().positive().max(100_000),
      detectedSkewDegrees: z.number().finite().min(-5).max(5),
      appliedRotationDegrees: z.number().finite().min(-5).max(5),
      confidence: z.number().min(0).max(1),
      applied: z.boolean(),
      sourceToRendered: z
        .tuple([
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
        ]),
    })
    .optional(),
});

export const verificationTierSchema = z.enum([
  "source_verified",
  "construction_verified",
]);

export const addressBindingSchema = z
  .object({
    countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
    addressNormalized: z.string().trim().min(1).max(240),
    block: z.string().trim().max(32),
    street: z.string().trim().max(160),
    postalCode: z.string().trim().max(24).nullable().optional(),
    stack: z.string().trim().max(32).nullable().optional(),
    floorMin: z.number().int().min(-20).max(300).nullable().optional(),
    floorMax: z.number().int().min(-20).max(300).nullable().optional(),
    transform: z.enum([
      "normal",
      "mirror_x",
      "mirror_z",
      "rotate_90",
      "rotate_180",
      "rotate_270",
      "mirror_x_rotate_90",
      "mirror_x_rotate_270",
    ]),
    role: z.enum(["catalog", "authored_variant"]).default("catalog"),
    sourceEvidence: z.record(z.unknown()).optional(),
  })
  .superRefine((binding, context) => {
    if (!binding.postalCode?.trim() && !(binding.block && binding.street)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postalCode"],
        message: "A postal code or block and street is required",
      });
    }
    const hasFloorMin = binding.floorMin !== null && binding.floorMin !== undefined;
    const hasFloorMax = binding.floorMax !== null && binding.floorMax !== undefined;
    if (hasFloorMin !== hasFloorMax) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["floorMin"],
        message: "Optional floor range requires both floorMin and floorMax",
      });
    }
  });

export type FloorPlanAddressBindingInput = z.infer<typeof addressBindingSchema>;

export const sourceManifestSchema = z
  .object({
    sourceInventory: z.object({
      pageNumbers: z.array(z.number().int().positive()).min(1).max(500),
      visibleCriticalEntityIds: z.array(z.string().trim().min(1).max(160)).min(1).max(50_000),
      // Authoritative declared-unit CAD may not contain typeset dimension
      // entities. The publication service accepts an empty inventory only for
      // that narrowly verified CAD evidence path; PDF/raster plans still fail
      // the server gate when no printed dimensions are registered.
      printedDimensionIds: z.array(z.string().trim().min(1).max(160)).max(20_000),
      licenseStatus: z.enum(["licensed", "permission_confirmed", "public_domain"]),
      reviewerNotes: z.string().trim().min(1).max(10_000),
    }),
  })
  .passthrough()
  .superRefine((manifest, context) => {
    if ("publicationChecks" in manifest) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicationChecks"],
        message: "Publication checks are computed by the server and cannot be submitted",
      });
    }
    if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 1024 * 1024) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source manifest is larger than 1 MB",
      });
    }
  });

export function normalizeFloorPlanMimeType(fileName: string, suppliedMimeType: string) {
  const normalized = suppliedMimeType.trim().toLowerCase();
  if ((FLOOR_PLAN_SOURCE_MIME_TYPES as readonly string[]).includes(normalized)) {
    return normalized as FloorPlanSourceMimeType;
  }
  return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? null;
}

export function hasExpectedFloorPlanSignature(
  bytes: Uint8Array,
  mimeType: FloorPlanSourceMimeType
) {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") return (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
  if (["application/dxf", "application/x-dxf", "image/vnd.dxf"].includes(mimeType)) {
    if (Buffer.from(bytes.subarray(0, 22)).toString("ascii").startsWith("AutoCAD Binary DXF")) {
      return false;
    }
    const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65_536))).toString("utf8");
    return /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*(?:\r?\n|$)/i.test(header);
  }
  if (["application/ifc", "application/x-ifc", "application/step", "application/x-step"].includes(mimeType)) {
    const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65_536))).toString("utf8");
    return /^\s*ISO-10303-21\s*;/i.test(header) && /FILE_SCHEMA\s*\([^;]*IFC/i.test(header);
  }
  if ([
    "application/acad",
    "application/autocad_dwg",
    "application/dwg",
    "application/x-acad",
    "application/x-dwg",
    "image/vnd.dwg",
  ].includes(mimeType)) {
    return /^AC10\d{2}$/.test(Buffer.from(bytes.subarray(0, 6)).toString("ascii"));
  }
  return false;
}

export function sanitizeFloorPlanFileName(fileName: string) {
  const base = path.basename(fileName).trim().slice(0, 180);
  return base || "floor-plan";
}

export function parseReviewIssues(value: unknown): FloorPlanReviewIssue[] {
  return z.array(reviewIssueSchema).max(500).parse(value);
}

export function parseRenderedPages(value: unknown): FloorPlanRenderedPage[] {
  const pages = z.array(renderedPageSchema).min(1).max(500).parse(value);
  if (new Set(pages.map((page) => page.pageNumber)).size !== pages.length) {
    throw new Error("rendered source pages must have unique page numbers");
  }
  return pages;
}

export function hasUnresolvedCriticalIssues(issues: FloorPlanReviewIssue[]) {
  return issues.some(isFloorPlanMvpBlockingIssue);
}

export function parseCandidate(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("candidate must be a JSON object");
  }
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_FLOOR_PLAN_CANDIDATE_BYTES) {
    throw new Error("candidate is larger than 5 MB");
  }
  return value as Record<string, unknown>;
}

export function compileCandidateFloorPlanDocumentV2(value: unknown) {
  const candidate = parseCandidate(value);
  if (
    candidate.schemaVersion !== 2 ||
    candidate.units !== "mm" ||
    typeof candidate.id !== "string" ||
    typeof candidate.revisionId !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !candidate.verification ||
    typeof candidate.verification !== "object" ||
    !Array.isArray(candidate.sources) ||
    !Array.isArray(candidate.floors)
  ) {
    throw new Error("candidate is not a FloorPlanDocumentV2 document");
  }
  const document = candidate as unknown as FloorPlanDocumentV2;
  try {
    return { document, scene: compileFloorPlanDocumentV2(document) };
  } catch (cause) {
    if (cause instanceof FloorPlanDocumentValidationErrorV2) {
      const summary = cause.issues
        .slice(0, 8)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      throw new Error(`FloorPlanDocumentV2 validation failed: ${summary}`);
    }
    throw new Error(
      `FloorPlanDocumentV2 validation failed: ${
        cause instanceof Error ? cause.message : "malformed document"
      }`
    );
  }
}

export function parseAddressBindings(value: unknown) {
  const bindings = z.array(addressBindingSchema).max(2_000).parse(value ?? []);
  for (const binding of bindings) {
    if (
      binding.floorMin !== null &&
      binding.floorMin !== undefined &&
      binding.floorMax !== null &&
      binding.floorMax !== undefined &&
      binding.floorMin > binding.floorMax
    ) {
      throw new Error("floorMin cannot exceed floorMax");
    }
  }
  return bindings;
}
