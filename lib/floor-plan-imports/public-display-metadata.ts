import { z } from "zod";

const MAX_PUBLIC_URL_LENGTH = 2_048;

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    isPrivateIpv4(normalized)
  ) {
    return false;
  }
  return true;
}

function isSafeAbsolutePublicUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function isSafePublicPreviewUrl(value: string) {
  if (isSafeAbsolutePublicUrl(value)) return true;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return false;
  }
  try {
    const parsed = new URL(value, "https://public-preview.invalid");
    return parsed.origin === "https://public-preview.invalid";
  } catch {
    return false;
  }
}

const publicText = (label: string, maximum: number) =>
  z.string().trim().min(2, `${label} is required`).max(maximum).refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value),
    `${label} cannot contain control characters`
  );

const absolutePublicUrlSchema = z.string().trim().max(MAX_PUBLIC_URL_LENGTH).refine(
  isSafeAbsolutePublicUrl,
  "Source URL must be a public HTTPS URL"
);

const publicPreviewUrlSchema = z.string().trim().max(MAX_PUBLIC_URL_LENGTH).refine(
  isSafePublicPreviewUrl,
  "Preview URL must be a safe app-relative path or public HTTPS URL"
);

export const floorPlanPublicDisplayMetadataSchema = z.object({
  projectName: publicText("Project name", 160),
  label: publicText("Plan label", 160),
  flatType: publicText("Flat type", 80),
  floorAreaSqm: z.number().finite().min(5).max(5_000).multipleOf(0.01).nullable()
    .optional().default(null),
  previewUrl: publicPreviewUrlSchema,
  sourceUrl: absolutePublicUrlSchema.nullable().optional().default(null),
  sourceTitle: publicText("Source title", 200).nullable().optional().default(null),
  sourcePage: z.number().int().positive().max(10_000).nullable().optional().default(null),
  publisher: publicText("Publisher", 160),
}).strict().superRefine((metadata, context) => {
  const sourceValues = [metadata.sourceUrl, metadata.sourceTitle, metadata.sourcePage];
  const populated = sourceValues.filter((value) => value !== null).length;
  if (populated !== 0 && populated !== sourceValues.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceUrl"],
      message: "Source URL, title and page must be supplied together",
    });
  }
});

export type FloorPlanPublicDisplayMetadata = z.infer<
  typeof floorPlanPublicDisplayMetadataSchema
>;

type PersistedPublicMetadata = FloorPlanPublicDisplayMetadata & {
  approvedAt?: Date | string | null;
  approvedByEmail?: string | null;
};

/** Explicitly allowlists public fields from a wider Prisma persistence row. */
export function projectFloorPlanPublicDisplayMetadata(
  value: PersistedPublicMetadata
): FloorPlanPublicDisplayMetadata {
  return floorPlanPublicDisplayMetadataSchema.parse({
    projectName: value.projectName,
    label: value.label,
    flatType: value.flatType,
    floorAreaSqm: value.floorAreaSqm,
    previewUrl: value.previewUrl,
    sourceUrl: value.sourceUrl,
    sourceTitle: value.sourceTitle,
    sourcePage: value.sourcePage,
    publisher: value.publisher,
  });
}

export function assertFloorPlanPublicMetadataApprovalIntegrity(input: {
  metadata: PersistedPublicMetadata | null | undefined;
  revisionApprovedAt: Date | string | null | undefined;
  revisionApprovedByEmail: string | null | undefined;
}) {
  if (!input.metadata) {
    throw new Error("FLOOR_PLAN_PUBLIC_METADATA_REQUIRED: approve public display metadata first");
  }
  const metadata = projectFloorPlanPublicDisplayMetadata(input.metadata);
  const reviewer = input.revisionApprovedByEmail?.trim().toLowerCase() ?? "";
  const metadataReviewer = input.metadata.approvedByEmail?.trim().toLowerCase() ?? "";
  const revisionApprovedAt = input.revisionApprovedAt
    ? new Date(input.revisionApprovedAt).getTime()
    : Number.NaN;
  const metadataApprovedAt = input.metadata.approvedAt
    ? new Date(input.metadata.approvedAt).getTime()
    : Number.NaN;
  if (
    !reviewer ||
    reviewer !== metadataReviewer ||
    !Number.isFinite(revisionApprovedAt) ||
    revisionApprovedAt !== metadataApprovedAt
  ) {
    throw new Error(
      "FLOOR_PLAN_PUBLIC_METADATA_REVIEW_MISMATCH: metadata must be approved with the immutable revision"
    );
  }
  return metadata;
}
