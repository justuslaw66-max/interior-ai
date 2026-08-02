import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { FloorPlanObjectStorageError } from "@/lib/floor-plan-imports/object-storage";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";

export const runtime = "nodejs";

function safeInlineName(fileName: string) {
  return fileName.replace(/["\\\r\n]/g, "_").slice(0, 180) || "floor-plan-source";
}

function verifiedAssetResponse(asset: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const responseBody = new ArrayBuffer(asset.bytes.byteLength);
  new Uint8Array(responseBody).set(asset.bytes);
  return new NextResponse(responseBody, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${safeInlineName(asset.fileName)}"`,
      "Content-Length": String(asset.bytes.byteLength),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": asset.mimeType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function unavailableAssetResponse() {
  return NextResponse.json(
    { error: "Asset content is unavailable" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } }
  );
}

async function readAuthorizedAsset(input: {
  kind: "source" | "derived";
  assetId: string;
}) {
  try {
    const store = new PrismaFloorPlanSourceStore();
    const asset =
      input.kind === "source"
        ? await store.readSource(input.assetId)
        : await store.readDerivative(input.assetId);
    return asset ? verifiedAssetResponse(asset) : unavailableAssetResponse();
  } catch (cause) {
    if (cause instanceof FloorPlanObjectStorageError) {
      return NextResponse.json(
        { error: "Asset content is temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    throw cause;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, assetId } = await params;

  if (assetId === "source") {
    const job = await prisma.floorPlanImportJob.findUnique({
      where: { id },
      select: {
        sourceAsset: {
          select: { id: true, contentDeletedAt: true },
        },
      },
    });
    if (!job || job.sourceAsset.contentDeletedAt) return unavailableAssetResponse();
    return readAuthorizedAsset({ kind: "source", assetId: job.sourceAsset.id });
  }

  const supplementary = await prisma.floorPlanSupplementarySource.findFirst({
    where: { jobId: id, sourceAssetId: assetId },
    select: {
      sourceAsset: {
        select: { id: true, contentDeletedAt: true },
      },
    },
  });
  if (supplementary) {
    if (supplementary.sourceAsset.contentDeletedAt) return unavailableAssetResponse();
    return readAuthorizedAsset({
      kind: "source",
      assetId: supplementary.sourceAsset.id,
    });
  }

  const construction = await prisma.floorPlanConstructionSource.findFirst({
    where: { jobId: id, sourceAssetId: assetId },
    select: {
      sourceAsset: {
        select: { id: true, contentDeletedAt: true },
      },
    },
  });
  if (construction) {
    if (construction.sourceAsset.contentDeletedAt) return unavailableAssetResponse();
    return readAuthorizedAsset({
      kind: "source",
      assetId: construction.sourceAsset.id,
    });
  }

  const derivedAsset = await prisma.floorPlanDerivedAsset.findFirst({
    where: { id: assetId, jobId: id, contentDeletedAt: null },
    select: { id: true },
  });
  if (!derivedAsset) return unavailableAssetResponse();
  return readAuthorizedAsset({ kind: "derived", assetId: derivedAsset.id });
}
