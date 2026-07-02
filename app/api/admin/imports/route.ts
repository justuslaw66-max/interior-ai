import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { createImportJob } from "@/lib/import-jobs/create-import-job";

type ImportJobListRow = {
  id: string;
  status: string;
  sourceBrand: string | null;
  sourceFileName: string;
  sourceFileUrl: string;
  uploadedByUserId: string | null;
  notes: string | null;
  errorMessage: string | null;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prismaCompat = prisma as unknown as {
    importJob: {
      findMany: (args: unknown) => Promise<ImportJobListRow[]>;
    };
  };

  const jobs = await prismaCompat.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      sourceBrand: true,
      sourceFileName: true,
      sourceFileUrl: true,
      uploadedByUserId: true,
      notes: true,
      errorMessage: true,
      normalizedAssetId: true,
      catalogItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    sourceFileName?: string;
    sourceFileUrl?: string;
    sourceBrand?: string;
    notes?: string;
    uploadedByUserId?: string;
    rawMetadataJson?: unknown;
  };

  const sourceFileName = body.sourceFileName?.trim();
  const sourceFileUrl = body.sourceFileUrl?.trim();

  if (!sourceFileName || !sourceFileUrl) {
    return NextResponse.json(
      { error: "sourceFileName and sourceFileUrl are required" },
      { status: 400 }
    );
  }

  const job = await createImportJob({
    sourceFileName,
    sourceFileUrl,
    sourceBrand: body.sourceBrand,
    notes: body.notes,
    uploadedByUserId: body.uploadedByUserId,
    rawMetadataJson: body.rawMetadataJson,
  });

  return NextResponse.json({ job }, { status: 201 });
}
