import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  hasOwn,
  isPlainObject,
  isStringArray,
  normalizeStringArray,
  pickDefinedFields as pickDefinedAllowedFields,
} from "@/lib/admin-api/update-validation";
import { prisma } from "@/lib/prisma";
import { updateImportJobStatus } from "@/lib/import-jobs/update-import-job-status";
import type { ImportJobStatus } from "@/lib/import-jobs/types";
import { getImportJobValidationBlockers, type AdminImportWorkflowJob } from "@/lib/import-jobs/admin-workflow";

type CatalogWorkflowStage =
  | "intake"
  | "enrichment"
  | "review"
  | "approved"
  | "published"
  | "blocked";

type DimensionsVerificationStatus =
  | "pending"
  | "matched"
  | "mismatch"
  | "missing_supplier"
  | "missing_extracted";

type ImportJobDetailRow = {
  id: string;
  status: string;
  sourceBrand: string | null;
  sourceFileName: string;
  sourceFileUrl: string;
  uploadedByUserId: string | null;
  notes: string | null;
  errorMessage: string | null;
  rawMetadataJson: unknown;
  reportJson: unknown;
  rawFileUrl: string | null;
  normalizedFileUrl: string | null;
  optimizedFileUrl: string | null;
  thumbnailUrl: string | null;
  metadataReportUrl: string | null;
  qaReportUrl: string | null;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImportJobPatchRow = {
  id: string;
  status: ImportJobStatus;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  workflowStage: CatalogWorkflowStage;
  workflowBlockers: string[];
  nextAction: string | null;
  reviewNotes: string | null;
  dimensionsVerificationStatus: DimensionsVerificationStatus | null;
  sourceBrand: string | null;
  sourceSku: string | null;
  sourceProductUrl: string | null;
  sourceFileName: string;
  errorMessage: string | null;
  rawMetadataJson: unknown;
  reportJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const STATUSES: ImportJobStatus[] = [
  "received",
  "normalizing",
  "optimized",
  "preview_generated",
  "metadata_extracted",
  "needs_mapping",
  "needs_review",
  "approved",
  "published",
  "failed",
];

const WORKFLOW_STAGES: CatalogWorkflowStage[] = [
  "intake",
  "enrichment",
  "review",
  "approved",
  "published",
  "blocked",
];

const DIMENSIONS_VERIFICATION_STATUSES: DimensionsVerificationStatus[] = [
  "pending",
  "matched",
  "mismatch",
  "missing_supplier",
  "missing_extracted",
];

const EDITABLE_PATCH_FIELDS = [
  "status",
  "notes",
  "errorMessage",
  "normalizedAssetId",
  "catalogItemId",
  "workflowStage",
  "workflowBlockers",
  "nextAction",
  "reviewNotes",
  "dimensionsVerificationStatus",
  "behaviorDefaultsApplied",
  "metadataTags",
  "brandId",
  "supplierSourceId",
  "sourceSku",
  "sourceProductUrl",
  "assetLicenseId",
] as const;

type EditablePatchField = (typeof EDITABLE_PATCH_FIELDS)[number];
type ImportJobPatchBody = Record<string, unknown>;
type ImportJobRouteUpdate = Partial<Record<EditablePatchField, unknown>>;

function asImportJobStatus(value: unknown): ImportJobStatus | null {
  if (typeof value !== "string") return null;
  return (STATUSES as string[]).includes(value) ? (value as ImportJobStatus) : null;
}

function pickDefinedFields(value: Record<string, unknown>) {
  return pickDefinedAllowedFields(value, EDITABLE_PATCH_FIELDS) as ImportJobRouteUpdate;
}

function normalizeRouteUpdate(data: ImportJobRouteUpdate) {
  const next: ImportJobRouteUpdate = { ...data };

  const trimNullableStringField = (field: EditablePatchField) => {
    if (typeof next[field] === "string") {
      const trimmed = next[field].trim();
      next[field] = trimmed;
    }
  };

  trimNullableStringField("status");
  trimNullableStringField("notes");
  trimNullableStringField("errorMessage");
  trimNullableStringField("normalizedAssetId");
  trimNullableStringField("catalogItemId");
  trimNullableStringField("workflowStage");
  trimNullableStringField("nextAction");
  trimNullableStringField("reviewNotes");
  trimNullableStringField("dimensionsVerificationStatus");
  trimNullableStringField("brandId");
  trimNullableStringField("supplierSourceId");
  trimNullableStringField("sourceSku");
  trimNullableStringField("sourceProductUrl");
  trimNullableStringField("assetLicenseId");

  if (Array.isArray(next.workflowBlockers) && next.workflowBlockers.every((entry) => typeof entry === "string")) {
    next.workflowBlockers = normalizeStringArray(next.workflowBlockers as string[]);
  }

  if (Array.isArray(next.metadataTags) && next.metadataTags.every((entry) => typeof entry === "string")) {
    next.metadataTags = normalizeStringArray(next.metadataTags as string[]);
  }

  return next;
}

function validateRouteUpdate(data: ImportJobRouteUpdate) {
  if (hasOwn(data as Record<string, unknown>, "status") && data.status !== null) {
    if (!asImportJobStatus(data.status)) {
      return "Invalid status.";
    }
  }

  const nullableStringFields: EditablePatchField[] = [
    "notes",
    "errorMessage",
    "normalizedAssetId",
    "catalogItemId",
    "nextAction",
    "reviewNotes",
    "brandId",
    "supplierSourceId",
    "sourceSku",
    "sourceProductUrl",
    "assetLicenseId",
  ];

  for (const field of nullableStringFields) {
    if (!hasOwn(data as Record<string, unknown>, field)) continue;
    const value = data[field];
    if (!(typeof value === "string" || value === null)) {
      return `${field} must be a string or null.`;
    }
  }

  if (hasOwn(data as Record<string, unknown>, "workflowStage")) {
    if (
      typeof data.workflowStage !== "string" ||
      !(WORKFLOW_STAGES as string[]).includes(data.workflowStage)
    ) {
      return "Invalid workflowStage.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "dimensionsVerificationStatus")) {
    if (
      !(data.dimensionsVerificationStatus === null ||
        (typeof data.dimensionsVerificationStatus === "string" &&
          (DIMENSIONS_VERIFICATION_STATUSES as string[]).includes(data.dimensionsVerificationStatus)))
    ) {
      return "Invalid dimensionsVerificationStatus.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "workflowBlockers") && !isStringArray(data.workflowBlockers)) {
    return "workflowBlockers must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "metadataTags") && !isStringArray(data.metadataTags)) {
    return "metadataTags must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "behaviorDefaultsApplied")) {
    if (typeof data.behaviorDefaultsApplied !== "boolean") {
      return "behaviorDefaultsApplied must be a boolean.";
    }
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: unknown) => Promise<ImportJobDetailRow | null>;
    };
  };

  const job = await prismaCompat.importJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sourceBrand: true,
      sourceFileName: true,
      sourceFileUrl: true,
      uploadedByUserId: true,
      notes: true,
      errorMessage: true,
      rawMetadataJson: true,
      reportJson: true,
      rawFileUrl: true,
      normalizedFileUrl: true,
      optimizedFileUrl: true,
      thumbnailUrl: true,
      metadataReportUrl: true,
      qaReportUrl: true,
      normalizedAssetId: true,
      catalogItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid PATCH body." }, { status: 400 });
  }

  if (!isPlainObject(parsedBody)) {
    return NextResponse.json({ error: "Invalid PATCH body." }, { status: 400 });
  }

  const updateData = normalizeRouteUpdate(pickDefinedFields(parsedBody as ImportJobPatchBody));
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid updatable fields provided." }, { status: 400 });
  }

  const validationError = validateRouteUpdate(updateData);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          status: true;
          normalizedAssetId: true;
          catalogItemId: true;
          workflowStage: true;
          workflowBlockers: true;
          nextAction: true;
          reviewNotes: true;
          dimensionsVerificationStatus: true;
          sourceBrand: true;
          sourceSku: true;
          sourceProductUrl: true;
          sourceFileName: true;
          errorMessage: true;
          rawMetadataJson: true;
          reportJson: true;
          createdAt: true;
          updatedAt: true;
        };
      }) => Promise<ImportJobPatchRow | null>;
    };
  };

  const currentJob = await prismaCompat.importJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      normalizedAssetId: true,
      catalogItemId: true,
      workflowStage: true,
      workflowBlockers: true,
      nextAction: true,
      reviewNotes: true,
      dimensionsVerificationStatus: true,
      sourceBrand: true,
      sourceSku: true,
      sourceProductUrl: true,
      sourceFileName: true,
      errorMessage: true,
      rawMetadataJson: true,
      reportJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!currentJob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextStatus = updateData.status
    ? asImportJobStatus(updateData.status) ?? currentJob.status
    : currentJob.status;
  const nextNormalizedAssetId =
    updateData.normalizedAssetId !== undefined
      ? ((updateData.normalizedAssetId as string | null | undefined) ?? null)
      : currentJob.normalizedAssetId;
  const nextCatalogItemId =
    updateData.catalogItemId !== undefined
      ? ((updateData.catalogItemId as string | null | undefined) ?? null)
      : currentJob.catalogItemId;

  if ((nextStatus === "approved" || nextStatus === "published") && !nextNormalizedAssetId) {
    return NextResponse.json(
      { error: `Cannot move import job ${id} to ${nextStatus} without a normalized asset id.` },
      { status: 400 }
    );
  }

  if (nextStatus === "published" && !nextCatalogItemId) {
    return NextResponse.json(
      { error: `Cannot publish import job ${id} without a linked catalog item id.` },
      { status: 400 }
    );
  }

  const candidateWorkflowJob: AdminImportWorkflowJob = {
    ...currentJob,
    status: nextStatus,
    normalizedAssetId: nextNormalizedAssetId,
    catalogItemId: nextCatalogItemId,
    workflowStage:
      (updateData.workflowStage as CatalogWorkflowStage | undefined) ?? currentJob.workflowStage,
    workflowBlockers:
      (updateData.workflowBlockers as string[] | undefined) ?? currentJob.workflowBlockers,
    nextAction: (updateData.nextAction as string | null | undefined) ?? currentJob.nextAction,
    reviewNotes: (updateData.reviewNotes as string | null | undefined) ?? currentJob.reviewNotes,
    dimensionsVerificationStatus:
      (updateData.dimensionsVerificationStatus as DimensionsVerificationStatus | null | undefined) ??
      currentJob.dimensionsVerificationStatus,
    sourceBrand: (updateData.brandId as string | null | undefined) !== undefined ? currentJob.sourceBrand : currentJob.sourceBrand,
    sourceSku: (updateData.sourceSku as string | null | undefined) ?? currentJob.sourceSku,
    sourceProductUrl:
      (updateData.sourceProductUrl as string | null | undefined) ?? currentJob.sourceProductUrl,
    sourceFileName: currentJob.sourceFileName,
    errorMessage: (updateData.errorMessage as string | null | undefined) ?? currentJob.errorMessage,
    rawMetadataJson: currentJob.rawMetadataJson,
    reportJson: currentJob.reportJson,
    createdAt: currentJob.createdAt,
    updatedAt: currentJob.updatedAt,
  };
  const validationBlockers = getImportJobValidationBlockers(candidateWorkflowJob);

  if ((nextStatus === "approved" || nextStatus === "published") && validationBlockers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot move import job ${id} to ${nextStatus} until blockers are cleared: ${validationBlockers.join("; ")}`,
      },
      { status: 400 }
    );
  }

  try {
    await updateImportJobStatus({
      id,
      to: nextStatus,
      notes: (updateData.notes as string | null | undefined) ?? undefined,
      errorMessage: (updateData.errorMessage as string | null | undefined) ?? undefined,
      normalizedAssetId: (updateData.normalizedAssetId as string | null | undefined) ?? undefined,
      catalogItemId: (updateData.catalogItemId as string | null | undefined) ?? undefined,
      workflowStage: (updateData.workflowStage as CatalogWorkflowStage | undefined) ?? undefined,
      workflowBlockers: (updateData.workflowBlockers as string[] | undefined) ?? undefined,
      nextAction: (updateData.nextAction as string | null | undefined) ?? undefined,
      reviewNotes: (updateData.reviewNotes as string | null | undefined) ?? undefined,
      dimensionsVerificationStatus:
        (updateData.dimensionsVerificationStatus as DimensionsVerificationStatus | null | undefined) ?? undefined,
      behaviorDefaultsApplied: (updateData.behaviorDefaultsApplied as boolean | undefined) ?? undefined,
      metadataTags: (updateData.metadataTags as string[] | undefined) ?? undefined,
      brandId: (updateData.brandId as string | null | undefined) ?? undefined,
      supplierSourceId: (updateData.supplierSourceId as string | null | undefined) ?? undefined,
      sourceSku: (updateData.sourceSku as string | null | undefined) ?? undefined,
      sourceProductUrl: (updateData.sourceProductUrl as string | null | undefined) ?? undefined,
      assetLicenseId: (updateData.assetLicenseId as string | null | undefined) ?? undefined,
    } as Parameters<typeof updateImportJobStatus>[0]);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "ImportJobUpdateValidationError" ||
        error.message.startsWith("Invalid ImportJob transition") ||
        error.message.startsWith("Cannot move import job") ||
        error.message.startsWith("Cannot publish import job"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.startsWith("ImportJob not found:")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.error("PATCH /api/admin/imports/[id] failed:", error);
    return NextResponse.json({ error: "Failed to update import job." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
