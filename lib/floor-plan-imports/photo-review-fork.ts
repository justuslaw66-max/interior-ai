import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parsePhotoConstraints } from "../floor-plan-photo-constraints";
import { applyPhotoCalibration } from "../floor-plan-photo-review";
import { PrismaFloorPlanSourceStore } from "./prisma-store";
import { PrismaFloorPlanImportJobRepository } from "./prisma-repository";
import { lockFloorPlanImportSource } from "./source-retention-lock";
import { compileCandidateFloorPlanDocumentV2,parseRenderedPages } from "./validation";
import { asEnvelope } from "./pdf-raster-evidence";
import { recomputeCorrectedPhoto } from "./photo-recompute";
import { PdfRasterFloorPlanSourceAdapter } from "./pdf-raster-adapter";

type Input={jobId:string;userId:string;candidateVersion:number;pageNumber:number;constraints:unknown};
type ReviewJob=NonNullable<Awaited<ReturnType<typeof loadJob>>>;
const loadJob=(id:string,userId:string)=>prisma.floorPlanImportJob.findFirst({where:{id,userId,historyDeletedAt:null},include:{sourceAsset:true}});
function assertRetained(job:ReviewJob,version:number) {
  if(job.candidateVersion!==version)throw new Error("The source review changed. Reload before recomputing.");
  if(!["needs_review","ready","applied"].includes(job.status))throw new Error("Wait for the current source review to finish.");
  if(job.sourceDeletionRequestedAt||job.sourceAsset.contentDeletedAt||job.sourceRetentionExpiresAt<=new Date())throw new Error("The retained source is no longer available.");
}
const privacy=(job:ReviewJob)=>({trainingBenchmarkOptIn:job.trainingBenchmarkOptIn,trainingBenchmarkOptInAt:job.trainingBenchmarkOptInAt,
  trainingBenchmarkConsentVersion:job.trainingBenchmarkConsentVersion,trainingBenchmarkRevokedAt:job.trainingBenchmarkRevokedAt,
  sourceRetentionExpiresAt:job.sourceRetentionExpiresAt,sourceDeletionRequestedAt:null});

export async function forkPhotoReview(input:Input) {
  const job=await loadJob(input.jobId,input.userId);if(!job)throw new Error("Floor-plan import not found.");assertRetained(job,input.candidateVersion);
  const original=compileCandidateFloorPlanDocumentV2(job.candidateJson).document,pages=parseRenderedPages(job.renderedPagesJson);
  const empty=structuredClone(original),floor=empty.floors[0];if(!floor)throw new Error("A source floor is required.");
  floor.vertices=[];floor.walls=[];floor.rooms=[];floor.openings=[];floor.structures=[];floor.dimensions=[];
  const reviewed=applyPhotoCalibration({document:empty,floorId:floor.id,sourceId:job.sourceAssetId,pageNumber:input.pageNumber,
    constraints:parsePhotoConstraints(input.constraints),expectedRevisionId:empty.revisionId,at:new Date().toISOString()});
  const calibration=reviewed.floors[0].calibrations.find(c=>c.sourceId===job.sourceAssetId&&c.pageNumber===input.pageNumber);
  if(!calibration)throw new Error("The correction is missing.");
  const store=new PrismaFloorPlanSourceStore(),source=await store.readSource(job.sourceAssetId);
  const manifest=job.sourceManifestJson as Record<string,unknown>|null,assetId=manifest?.reviewExtractionAssetId;
  if(!source||typeof assetId!=="string")throw new Error("This older review has no retained observations. Upload the original again to start a separate correction review.");
  const owned=await prisma.floorPlanDerivedAsset.findFirst({where:{id:assetId,jobId:job.id,contentDeletedAt:null},select:{id:true}});
  const observationAsset=owned?await store.readDerivative(assetId):null;
  if(!observationAsset||observationAsset.mimeType!=="application/json")throw new Error("Retained source observations are unavailable.");
  // Read only a checksum-verified derivative owned by this source job, never client-supplied geometry.
  const observations=asEnvelope(JSON.parse(new TextDecoder().decode(observationAsset.bytes)));
  const result=await recomputeCorrectedPhoto({original,calibration,source,pages,observations,adapter:new PdfRasterFloorPlanSourceAdapter(),
    context:{jobId:job.id,store,privacy:privacy(job),localOnly:true}});
  return commitFork(input,job,pages,observationAsset.bytes,result);
}

async function commitFork(input:Input,job:ReviewJob,pages:ReturnType<typeof parseRenderedPages>,observations:Uint8Array,
  result:Awaited<ReturnType<typeof recomputeCorrectedPhoto>>) {
  return prisma.$transaction(async(transaction)=>{
    await lockFloorPlanImportSource(transaction,job.id,input.userId);
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "FloorPlanImportJob" WHERE "id"=${job.id} AND "userId"=${input.userId} FOR UPDATE`);
    const latest=await transaction.floorPlanImportJob.findFirst({where:{id:job.id,userId:input.userId,historyDeletedAt:null},include:{sourceAsset:true}});
    if(!latest)throw new Error("The source review is no longer available.");assertRetained(latest,input.candidateVersion);
    const created=await new PrismaFloorPlanImportJobRepository(transaction).create({userId:input.userId,sourceAssetId:job.sourceAssetId,privacy:privacy(latest)});
    const store=new PrismaFloorPlanSourceStore(transaction),copies=[];
    for(const page of pages){const asset=await store.readDerivative(page.assetKey);if(!asset)throw new Error("The source preview was removed.");
      if(asset.mimeType!=="image/png"&&asset.mimeType!=="image/webp")throw new Error("The source preview type is unsupported.");
      const assetKey=await store.putDerivative({jobId:created.id,fileName:asset.fileName,mimeType:asset.mimeType,bytes:asset.bytes});copies.push({...page,assetKey});}
    const reviewExtractionAssetId=await store.putDerivative({jobId:created.id,fileName:"source-review-observations.json",mimeType:"application/json",bytes:observations});
    const document={...result.document,id:`import-${created.id}`,revisionId:`candidate-${created.id}-1`,parentRevisionId:undefined};
    const sourceManifest={...result.sourceManifest,reviewExtractionAssetId,photoReviewParent:{jobId:job.id,candidateVersion:job.candidateVersion,
      priorGeometryPreserved:true,priorSavedDesignPreserved:true}};
    await transaction.floorPlanImportJob.update({where:{id:created.id},data:{status:"needs_review",progress:85,statusChangedAt:new Date(),
      adapterId:job.adapterId,extractionVersion:job.extractionVersion,candidateVersion:1,renderedPagesJson:copies as Prisma.InputJsonValue,
      candidateJson:document as unknown as Prisma.InputJsonValue,sourceManifestJson:sourceManifest as unknown as Prisma.InputJsonValue,
      reviewIssuesJson:result.reviewIssues as Prisma.InputJsonValue}});
    return {id:created.id,priorJobId:job.id};
  },{timeout:20_000});
}
