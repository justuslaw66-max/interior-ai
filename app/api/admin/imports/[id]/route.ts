import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  ImportJobUpdateValidationError,
  updateImportJobStatus,
} from "@/lib/import-jobs/update-import-job-status";
import type { ImportJobStatus } from "@/lib/import-jobs/types";

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

function asImportJobStatus(value: unknown): ImportJobStatus | null {
  if (typeof value !== "string") return null;
  return (STATUSES as string[]).includes(value) ? (value as ImportJobStatus) : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid PATCH body" }, { status: 400 });
  }

  const patch = body as {
    status?: string;
    notes?: string | null;
    errorMessage?: string | null;
    normalizedAssetId?: string | null;
    catalogItemId?: string | null;
  };

  const knownFields = [
    "status",
    "notes",
    "errorMessage",
    "normalizedAssetId",
    "catalogItemId",
  ] as const;
  if (!knownFields.some((field) => Object.hasOwn(patch, field))) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  let status: ImportJobStatus | undefined;
  if (patch.status !== undefined) {
    const parsedStatus = asImportJobStatus(patch.status);
    if (!parsedStatus) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = parsedStatus;
  }

  if (
    (patch.notes !== undefined && !isNullableString(patch.notes)) ||
    (patch.errorMessage !== undefined && !isNullableString(patch.errorMessage)) ||
    (patch.normalizedAssetId !== undefined &&
      !isNullableString(patch.normalizedAssetId)) ||
    (patch.catalogItemId !== undefined && !isNullableString(patch.catalogItemId))
  ) {
    return NextResponse.json({ error: "Invalid field value" }, { status: 400 });
  }

  try {
    await updateImportJobStatus({
      id,
      to: status,
      notes: patch.notes,
      errorMessage: patch.errorMessage,
      normalizedAssetId: patch.normalizedAssetId,
      catalogItemId: patch.catalogItemId,
    });
  } catch (error) {
    if (error instanceof ImportJobUpdateValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
