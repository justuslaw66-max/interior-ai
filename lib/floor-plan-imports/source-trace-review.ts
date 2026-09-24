import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { replaceSourceTrace } from "../floor-plan-source-trace";
import { extractSourceArtwork,type SourceArtworkTrace } from "./source-artwork-trace";
import { PrismaFloorPlanSourceStore } from "./prisma-store";
import { PrismaFloorPlanImportJobRepository } from "./prisma-repository";
import { lockFloorPlanImportSource } from "./source-retention-lock";
import { compileCandidateFloorPlanDocumentV2,parseRenderedPages } from "./validation";
import { asEnvelope } from "./pdf-raster-evidence";
const load=(id:string,userId:string)=>prisma.floorPlanImportJob.findFirst({where:{id,userId,historyDeletedAt:null},include:{sourceAsset:true}});
type Job=NonNullable<Awaited<ReturnType<typeof load>>>;
type Input={jobId:string;userId:string;candidateVersion:number;pageNumber:number;signal?:AbortSignal};
type TracePack={jobId:string;candidateVersion:number;sourceSha256:string;pageAssetKey:string;imageSha256:string;pageNumber:number;trace:SourceArtworkTrace};
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function retained(job:Job|null,input:Input):asserts job is Job {
  if(!job||job.candidateVersion!==input.candidateVersion)throw new Error("The source review changed. Save or reload it before tracing.");
  if(!["needs_review","ready","applied"].includes(job.status)||job.sourceDeletionRequestedAt||job.sourceAsset.contentDeletedAt||job.sourceRetentionExpiresAt<=new Date())throw new Error("The source review is not retained and ready for tracing.");
  input.signal?.throwIfAborted();
}

/** Preview is source-only; existing geometry and edits are never changed by extraction. */
export async function previewSourceTrace(input:Input) {
  const job=await load(input.jobId,input.userId);retained(job,input);
  const page=parseRenderedPages(job.renderedPagesJson).find(p=>p.pageNumber===input.pageNumber);
  if(!page)throw new Error("Select a retained source page.");
  const store=new PrismaFloorPlanSourceStore(),asset=await store.readDerivative(page.assetKey);
  if(!asset)throw new Error("The source image is unavailable.");
  const textRegions=await retainedTextRegions(job,page,store);
  const trace=await extractSourceArtwork(asset.bytes,{widthPx:page.widthPx,heightPx:page.heightPx,signal:input.signal,textRegions});
  const pack:TracePack={jobId:job.id,candidateVersion:job.candidateVersion,sourceSha256:job.sourceAsset.sha256,
    pageAssetKey:page.assetKey,imageSha256:hash(asset.bytes),pageNumber:page.pageNumber,trace};
  return prisma.$transaction(async tx=>{
    await lockFloorPlanImportSource(tx,job.id,input.userId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FloorPlanImportJob" WHERE "id"=${job.id} AND "userId"=${input.userId} FOR UPDATE`);
    const latest=await tx.floorPlanImportJob.findFirst({where:{id:job.id,userId:input.userId,historyDeletedAt:null},include:{sourceAsset:true}});retained(latest,input);
    const assetId=await new PrismaFloorPlanSourceStore(tx).putDerivative({jobId:job.id,fileName:"source-artwork-trace.json",mimeType:"application/json",bytes:Buffer.from(JSON.stringify(pack))});
    return {assetId,trace,sourceSha256:pack.sourceSha256,imageSha256:pack.imageSha256,pageNumber:page.pageNumber,candidateVersion:job.candidateVersion};
  });
}

async function retainedTextRegions(job:Job,page:ReturnType<typeof parseRenderedPages>[number],store:PrismaFloorPlanSourceStore) {
  const manifest=job.sourceManifestJson as Record<string,unknown>|null,assetId=manifest?.reviewExtractionAssetId;
  if(typeof assetId!=="string")return [];
  const owned=await prisma.floorPlanDerivedAsset.findFirst({where:{id:assetId,jobId:job.id,contentDeletedAt:null},select:{id:true}});
  const asset=owned?await store.readDerivative(assetId):null;
  if(!asset||asset.mimeType!=="application/json")return [];
  const evidence=asEnvelope(JSON.parse(new TextDecoder().decode(asset.bytes))).pages.find(p=>p.pageNumber===page.pageNumber);
  // Never use text boxes registered to a different source frame.
  return evidence?.widthPx===page.widthPx&&evidence.heightPx===page.heightPx?evidence.text:[];
}

const privacy=(job:Job)=>({trainingBenchmarkOptIn:job.trainingBenchmarkOptIn,trainingBenchmarkOptInAt:job.trainingBenchmarkOptInAt,
  trainingBenchmarkConsentVersion:job.trainingBenchmarkConsentVersion,trainingBenchmarkRevokedAt:job.trainingBenchmarkRevokedAt,
  sourceRetentionExpiresAt:job.sourceRetentionExpiresAt,sourceDeletionRequestedAt:null});

/** Commit into a separate versioned review under the same source-retention lock used by photo correction. */
export async function acceptSourceTrace(input:Input&{assetId:string}) {
  return prisma.$transaction(async tx=>{
    await lockFloorPlanImportSource(tx,input.jobId,input.userId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FloorPlanImportJob" WHERE "id"=${input.jobId} AND "userId"=${input.userId} FOR UPDATE`);
    const job=await tx.floorPlanImportJob.findFirst({where:{id:input.jobId,userId:input.userId,historyDeletedAt:null},include:{sourceAsset:true}});retained(job,input);
    const owned=await tx.floorPlanDerivedAsset.findFirst({where:{id:input.assetId,jobId:job.id,contentDeletedAt:null,fileName:"source-artwork-trace.json"}});
    const store=new PrismaFloorPlanSourceStore(tx),asset=owned?await store.readDerivative(input.assetId):null;
    if(!asset)throw new Error("The source trace preview is unavailable.");
    const pack=JSON.parse(new TextDecoder().decode(asset.bytes)) as TracePack,pages=parseRenderedPages(job.renderedPagesJson);
    const page=pages.find(p=>p.pageNumber===input.pageNumber);
    if(pack.jobId!==job.id||pack.candidateVersion!==job.candidateVersion||pack.sourceSha256!==job.sourceAsset.sha256||pack.pageNumber!==input.pageNumber||pack.pageAssetKey!==page?.assetKey)throw new Error("This trace belongs to a different source or review version.");
    const image=await store.readDerivative(pack.pageAssetKey);if(!image||hash(image.bytes)!==pack.imageSha256)throw new Error("The trace source changed.");
    const original=compileCandidateFloorPlanDocumentV2(job.candidateJson).document,document=replaceSourceTrace(original,pack.trace,job.sourceAssetId,input.pageNumber);
    compileCandidateFloorPlanDocumentV2(document);
    return createTraceReview(tx,store,job,pages,document,pack);
  },{timeout:20_000});
}

async function createTraceReview(tx:Prisma.TransactionClient,store:PrismaFloorPlanSourceStore,job:Job,pages:ReturnType<typeof parseRenderedPages>,
  document:ReturnType<typeof replaceSourceTrace>,pack:TracePack) {
  const child=await new PrismaFloorPlanImportJobRepository(tx).create({userId:job.userId,sourceAssetId:job.sourceAssetId,privacy:privacy(job)}),copies=[];
  for(const page of pages){const asset=await store.readDerivative(page.assetKey);if(!asset || (asset.mimeType!=="image/png" && asset.mimeType!=="image/webp"))throw new Error("Source preview was removed or has an unsupported type.");
    const assetKey=await store.putDerivative({jobId:child.id,fileName:asset.fileName,mimeType:asset.mimeType,bytes:asset.bytes});copies.push({...page,assetKey});}
  const manifest={...((job.sourceManifestJson??{}) as Record<string,unknown>)};
  if(typeof manifest.reviewExtractionAssetId==="string"){
    const observation=await store.readDerivative(manifest.reviewExtractionAssetId);if(!observation || observation.mimeType!=="application/json")throw new Error("Source observations were removed or have an unsupported type.");
    manifest.reviewExtractionAssetId=await store.putDerivative({jobId:child.id,fileName:observation.fileName,mimeType:observation.mimeType,bytes:observation.bytes});
  }
  document.id=`import-${child.id}`;document.revisionId=`candidate-${child.id}-1`;delete document.parentRevisionId;
  manifest.sourceArtworkTrace={version:pack.trace.version,parentJobId:job.id,parentVersion:job.candidateVersion,sourceSha256:pack.sourceSha256,
    imageSha256:pack.imageSha256,pageNumber:pack.pageNumber,settings:pack.trace.settings,diagnostics:pack.trace.diagnostics,metricScaleInferred:false};
  await tx.floorPlanImportJob.update({where:{id:child.id},data:{status:"needs_review",progress:85,statusChangedAt:new Date(),adapterId:job.adapterId,
    extractionVersion:job.extractionVersion,candidateVersion:1,renderedPagesJson:copies as Prisma.InputJsonValue,
    candidateJson:document as unknown as Prisma.InputJsonValue,sourceManifestJson:manifest as Prisma.InputJsonValue,reviewIssuesJson:job.reviewIssuesJson??[]}});
  return {id:child.id,priorJobId:job.id};
}
