import assert from "node:assert/strict";
import Module from "node:module";
import { acceptedPhotoFixture,photoConstraintsFixture } from "./fixtures/scan-to-editable-plan/photo-calibration";
import { saveSourceReviewSpan } from "../lib/floor-plan-source-span-review";

async function main() {
  const document=acceptedPhotoFixture(),sourceId=document.sources[0].id,page={pageNumber:1,widthPx:1000,heightPx:1000,assetKey:"original-page"};
  const uncalibrated=structuredClone(document);uncalibrated.floors[0].calibrations=[];
  const marked=saveSourceReviewSpan({document:uncalibrated,floorId:document.floors[0].id,sourceId,page,points:[{x:100,y:100},{x:100,y:180}],
    kind:"door",note:"Separate entrance, host boundary unresolved",at:"2026-09-16T00:00:00Z"});
  assert.equal(marked.floors[0].walls.length,0);assert.equal(marked.floors[0].openings.length,0);assert.equal(marked.floors[0].calibrations.length,0);
  assert.match(marked.floors[0].annotations[0].text,/Manually marked door proposal/);assert.equal(uncalibrated.floors[0].annotations.length,0);
  const edited=saveSourceReviewSpan({document:marked,floorId:document.floors[0].id,sourceId,page,annotationId:marked.floors[0].annotations[0].id,
    points:[{x:100,y:110},{x:100,y:190}],kind:"door",note:"Corrected jamb endpoints",at:"2026-09-16T00:01:00Z"});
  assert.equal(edited.floors[0].annotations.length,1);assert.match(edited.floors[0].annotations[0].text,/Manually corrected/);
  assert.equal(edited.floors[0].annotations[0].provenance.reviewHistory.length,2);

  const fresh=()=>({id:"parent",userId:"owner",sourceAssetId:sourceId,candidateJson:document,candidateVersion:7,status:"needs_review",
    sourceManifestJson:{reviewExtractionAssetId:"observations"},renderedPagesJson:[page],reviewIssuesJson:[],historyDeletedAt:null as Date|null,
    sourceDeletionRequestedAt:null as Date|null,sourceRetentionExpiresAt:new Date(Date.now()+86_400_000),adapterId:"pdf",extractionVersion:"test",
    trainingBenchmarkOptIn:false,trainingBenchmarkOptInAt:null,trainingBenchmarkConsentVersion:null,trainingBenchmarkRevokedAt:null,
    sourceAsset:{id:sourceId,sha256:"a".repeat(64),contentDeletedAt:null as Date|null}});
  let state=fresh(),user:string|null="owner",afterRecompute=()=>{},created=0,updates=0,computes=0;
  const events:string[]=[],assetWrites:Array<{jobId:string;mimeType:string}>=[],saved=new Map<string,NodeModule|undefined>();
  const stub=(name:string,exports:object)=>{const id=require.resolve(name);saved.set(id,require.cache[id]);const stubModule=new Module(id);stubModule.exports=exports;stubModule.loaded=true;require.cache[id]=stubModule;};
  const findFirst=async({where}:{where:{userId:string;historyDeletedAt?:null}})=>where.userId===state.userId&&!state.historyDeletedAt?structuredClone(state):null;
  const tx={$queryRaw:async()=>{events.push("lock");return [{id:sourceId}];},floorPlanImportJob:{findFirst,update:async({where}:{where:{id:string}})=>{
    assert.equal(where.id,"child");updates++;events.push("update-child");}}};
  stub("@/lib/auth",{auth:async()=>user?{user:{id:user}}:null});
  stub("@/lib/shared-rate-limit",{takeSharedRateLimit:async()=>({ok:true})});
  stub("@/lib/prisma",{prisma:{floorPlanImportJob:{findFirst},floorPlanDerivedAsset:{findFirst:async()=>({id:"observations"})},
    $transaction:async(callback:(transaction:typeof tx)=>Promise<unknown>)=>{const prior=created;try{return await callback(tx);}catch(cause){created=prior;throw cause;}}}});
  stub("@/lib/floor-plan-imports/prisma-repository",{PrismaFloorPlanImportJobRepository:class{async create(){created++;events.push("create-child");return {id:"child"};}}});
  stub("@/lib/floor-plan-imports/prisma-store",{PrismaFloorPlanSourceStore:class{
    async readSource(){return {id:sourceId,sha256:"a".repeat(64)};}
    async readDerivative(id:string){return id==="observations"?{mimeType:"application/json",bytes:new TextEncoder().encode(JSON.stringify({kind:"floor_plan_deterministic_evidence_v1"}))}:
      {fileName:"original.webp",mimeType:"image/webp",bytes:new Uint8Array([1])};}
    async putDerivative(input:{jobId:string;mimeType:string}){assetWrites.push(input);return `child-asset-${assetWrites.length}`;}
  }});
  stub("@/lib/floor-plan-imports/photo-recompute",{recomputeCorrectedPhoto:async(input:{context:{localOnly:boolean}})=>{
    assert.equal(input.context.localOnly,true);computes++;afterRecompute();return {document,reviewIssues:[],sourceManifest:{}};
  }});
  try {
    const {POST}=await import("../app/api/floor-plan-imports/[id]/photo-review/route");
    const request=(version=7)=>POST(new Request("http://localhost/photo-review",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({candidateVersion:version,pageNumber:1,constraints:photoConstraintsFixture})}),{params:Promise.resolve({id:"parent"})});
    user=null;assert.equal((await request()).status,401);user="other";assert.equal((await request()).status,404);assert.equal(computes,0);
    user="owner";assert.equal((await request(6)).status,409);assert.equal(computes,0);
    const prior=JSON.stringify(state);assert.equal((await request()).status,201);assert.equal(JSON.stringify(state),prior);
    assert.equal(created,1);assert.equal(updates,1);assert.deepEqual(events,["lock","lock","create-child","update-child"]);
    assert.deepEqual(assetWrites.map(a=>a.mimeType),["image/webp","application/json"]);assert(assetWrites.every(a=>a.jobId==="child"));
    const races=[()=>{state.candidateVersion++;},()=>{state.historyDeletedAt=new Date();},()=>{state.sourceDeletionRequestedAt=new Date();},
      ()=>{state.sourceAsset.contentDeletedAt=new Date();},()=>{state.sourceRetentionExpiresAt=new Date(0);},()=>{state.userId="other";},()=>{state.status="failed";}];
    for(const change of races){state=fresh();afterRecompute=change;events.length=0;
      assert.equal((await request()).status,409);assert.equal(created,1);assert.equal(updates,1);assert.deepEqual(events,["lock","lock"]);}
    afterRecompute=()=>{};state=fresh();state.status="applied";
    assert.equal((await request()).status,201,"An applied design can seed a separate review without being updated.");
    assert.equal(state.status,"applied");assert.equal(created,2);
  }finally{for(const [id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}}
  console.log("PASS: pending source corrections before scale/walls; actual photo-review POST ownership, version, post-extraction concurrency/retention checks, child-only asset writes and preservation of applied parent. DB/extraction boundaries isolated.");
}
void main().catch(cause=>{console.error(cause);process.exitCode=1;});
