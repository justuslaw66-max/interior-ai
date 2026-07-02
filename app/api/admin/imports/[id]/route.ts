import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { updateImportJobStatus } from "@/lib/import-jobs/update-import-job-status";
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
  const body = (await request.json()) as {
    status?: string;
    notes?: string | null;
    errorMessage?: string | null;
    normalizedAssetId?: string | null;
    catalogItemId?: string | null;
  };

  const status = asImportJobStatus(body.status);
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await updateImportJobStatus({
    id,
    to: status,
    notes: body.notes,
    errorMessage: body.errorMessage,
    normalizedAssetId: body.normalizedAssetId,
    catalogItemId: body.catalogItemId,
  });

  return NextResponse.json({ ok: true });
}
