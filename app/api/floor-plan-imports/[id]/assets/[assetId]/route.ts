import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloorPlanObjectStorageError } from "@/lib/floor-plan-imports/object-storage";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";
import { compileCandidateFloorPlanDocumentV2, parseRenderedPages } from "@/lib/floor-plan-imports/validation";
import { correctedPhotoPng } from "@/lib/floor-plan-imports/photo-preview";
import { assertPhotoSourceFrames } from "@/lib/floor-plan-photo-frame";

export const runtime = "nodejs";

const CONSUMER_PREVIEW_MIME_TYPES = new Set(["image/png", "image/webp"]);

function safeInlineName(fileName: string) {
  return fileName.replace(/["\\\r\n]/g, "_").slice(0, 180) || "floor-plan-preview";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, assetId } = await params;

  // Authorize against the owning job before asking the storage service for
  // bytes. The store deliberately looks up derivatives by asset ID only.
  const authorizedAsset = await prisma.floorPlanDerivedAsset.findFirst({
    where: {
      id: assetId,
      jobId: id,
      contentDeletedAt: null,
      job: { userId: session.user.id },
    },
    select: { mimeType: true },
  });
  if (
    !authorizedAsset ||
    !CONSUMER_PREVIEW_MIME_TYPES.has(authorizedAsset.mimeType)
  ) {
    // Do not disclose whether another user owns this job or derivative.
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }

  try {
    const asset = await new PrismaFloorPlanSourceStore().readDerivative(assetId);
    if (!asset || !CONSUMER_PREVIEW_MIME_TYPES.has(asset.mimeType)) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }
    const calibrationId=new URL(request.url).searchParams.get("photoCalibrationId");
    if(calibrationId) {
      const job=await prisma.floorPlanImportJob.findFirst({where:{id,userId:session.user.id,sourceDeletionRequestedAt:null,
        sourceRetentionExpiresAt:{gt:new Date()}},select:{candidateJson:true,renderedPagesJson:true}});
      if(!job) return NextResponse.json({error:"Preview not found"},{status:404});
      const document=compileCandidateFloorPlanDocumentV2(job.candidateJson).document;
      assertPhotoSourceFrames(document,parseRenderedPages(job.renderedPagesJson));
      const calibration=document.floors.flatMap((f)=>f.calibrations).find((c)=>c.id===calibrationId);
      const page=parseRenderedPages(job.renderedPagesJson).find((p)=>p.assetKey===assetId&&p.pageNumber===calibration?.pageNumber);
      if(!calibration?.photoCorrection||!page||page.widthPx!==calibration.imageWidthPx||page.heightPx!==calibration.imageHeightPx) {
        return NextResponse.json({error:"Preview not found"},{status:404});
      }
      return verifiedAssetResponse({...asset,fileName:"corrected-photo.png",mimeType:"image/png",
        bytes:await correctedPhotoPng(asset.bytes,calibration.photoCorrection)});
    }
    return verifiedAssetResponse(asset);
  } catch (cause) {
    if (cause instanceof FloorPlanObjectStorageError) {
      return NextResponse.json(
        { error: "Preview is temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    throw cause;
  }
}
