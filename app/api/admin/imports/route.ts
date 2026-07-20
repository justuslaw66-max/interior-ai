import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { createImportJob } from "@/lib/import-jobs/create-import-job";
import { readJsonRequest } from "@/lib/api-boundary";

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
  if (!canAccessAdmin(session?.user?.email)) {
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
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await readJsonRequest(request, 256 * 1024).catch(() => null);
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Invalid import request" }, { status: 400 });
  }
  const body = rawBody as {
    sourceFileName?: string;
    sourceFileUrl?: string;
    sourceBrand?: string;
    notes?: string;
    uploadedByUserId?: string;
    rawMetadataJson?: unknown;
  };

  const sourceFileName = body.sourceFileName?.trim();
  const sourceFileUrl = body.sourceFileUrl?.trim();

  if (
    !sourceFileName ||
    sourceFileName.length > 255 ||
    /[\0/\\]/.test(sourceFileName) ||
    !/\.(glb|gltf)$/i.test(sourceFileName) ||
    !sourceFileUrl ||
    sourceFileUrl.length > 2_048
  ) {
    return NextResponse.json(
      { error: "A safe GLB/glTF filename and HTTPS source URL are required" },
      { status: 400 }
    );
  }
  try {
    const url = new URL(sourceFileUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80")
    ) throw new Error();
  } catch {
    return NextResponse.json({ error: "Source URL must be a public HTTPS URL" }, { status: 400 });
  }
  if (
    (body.sourceBrand !== undefined &&
      (typeof body.sourceBrand !== "string" || body.sourceBrand.length > 100)) ||
    (body.notes !== undefined &&
      (typeof body.notes !== "string" || body.notes.length > 2_000))
  ) {
    return NextResponse.json({ error: "Import metadata is invalid" }, { status: 400 });
  }

  const job = await createImportJob({
    sourceFileName,
    sourceFileUrl,
    sourceBrand: body.sourceBrand,
    notes: body.notes,
    uploadedByUserId: session?.user?.id,
    rawMetadataJson: body.rawMetadataJson,
  });

  return NextResponse.json({ job }, { status: 201 });
}
