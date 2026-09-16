import assert from "node:assert/strict";
import Module from "node:module";
import { acceptedPhotoFixture } from "./fixtures/scan-to-editable-plan/photo-calibration";
import { TRACE_SETTINGS } from "../lib/floor-plan-imports/source-trace-mask";
import { editSourceTrace,isFinalSourceTrace } from "../lib/floor-plan-source-trace";
async function main(){
  const document=acceptedPhotoFixture();document.floors[0].calibrations=[];const sourceId=document.sources[0].id;
  const expiry=new Date(Date.now()+86_400_000);
  const fresh=()=>({id:"parent",userId:"owner",sourceAssetId:sourceId,candidateJson:document,candidateVersion:7,status:"needs_review",sourceManifestJson:{},
    renderedPagesJson:[{pageNumber:1,widthPx:1000,heightPx:1000,assetKey:"page"}],reviewIssuesJson:[],historyDeletedAt:null as Date|null,
    sourceDeletionRequestedAt:null as Date|null,sourceRetentionExpiresAt:expiry,adapterId:"pdf",extractionVersion:"test",
    trainingBenchmarkOptIn:false,trainingBenchmarkOptInAt:null,trainingBenchmarkConsentVersion:null,trainingBenchmarkRevokedAt:null,
    sourceAsset:{id:sourceId,sha256:"a".repeat(64),contentDeletedAt:null as Date|null}});
  let state=fresh(),user:string|null="owner",afterExtraction=()=>{},created=0,owned=true,savedChild:typeof document|undefined;
  const assets=new Map<string,{fileName:string;mimeType:string;bytes:Uint8Array}>(),writes:string[]=[],saved=new Map<string,NodeModule|undefined>();
  assets.set("page",{fileName:"original.png",mimeType:"image/png",bytes:new Uint8Array([1,2,3])});
  const stub=(name:string,exports:object)=>{const id=require.resolve(name);saved.set(id,require.cache[id]);const m=new Module(id);m.exports=exports;m.loaded=true;require.cache[id]=m;};
  const findFirst=async({where}:{where:{userId:string}})=>where.userId===state.userId&&!state.historyDeletedAt?structuredClone(state):null;
  const tx={$queryRaw:async()=>[{id:sourceId}],floorPlanImportJob:{findFirst,update:async({where,data}:{where:{id:string};data:{candidateJson:typeof document}})=>{assert.equal(where.id,"child");savedChild=data.candidateJson;}},floorPlanDerivedAsset:{findFirst:async()=>owned?{id:"trace"}:null}};
  stub("@/lib/auth",{auth:async()=>user?{user:{id:user}}:null});stub("@/lib/shared-rate-limit",{takeSharedRateLimit:async()=>({ok:true})});
  stub("@/lib/prisma",{prisma:{...tx,$transaction:async(callback:(transaction:typeof tx)=>Promise<unknown>)=>callback(tx)}});
  stub("@/lib/floor-plan-imports/prisma-repository",{PrismaFloorPlanImportJobRepository:class{async create(){created++;return{id:"child"};}}});
  stub("@/lib/floor-plan-imports/prisma-store",{PrismaFloorPlanSourceStore:class{async readDerivative(id:string){return assets.get(id);}
    async putDerivative(input:{jobId:string;fileName:string;mimeType:string;bytes:Uint8Array}){writes.push(input.jobId);const id=`asset-${writes.length}`;assets.set(id,input);return id;}}});
  stub("@/lib/floor-plan-imports/source-artwork-trace",{extractSourceArtwork:async()=>{afterExtraction();return{version:TRACE_SETTINGS.version,widthPx:1000,heightPx:1000,settings:TRACE_SETTINGS,
    paths:[{points:[{x:10,y:10},{x:80,y:10}],commands:["L"],strokeWidthPx:1,fill:false,groupId:"line"}],diagnostics:{rawChains:1,curves:0}};}});
  try{
    const {POST}=await import("../app/api/floor-plan-imports/[id]/source-trace/route");
    const request=(action="preview",assetId?:string,candidateVersion=7)=>POST(new Request("http://localhost/source-trace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,assetId,candidateVersion,pageNumber:1})}),{params:Promise.resolve({id:"parent"})});
    user=null;assert.equal((await request()).status,401);user="other";assert.equal((await request()).status,404);user="owner";
    assert.equal((await request("preview",undefined,6)).status,409);assert.equal(writes.length,0);
    const original=JSON.stringify(state),preview=await request();assert.equal(preview.status,200);const payload=await preview.json() as {assetId:string};assert.equal(JSON.stringify(state),original);
    owned=false;assert.equal((await request("accept",payload.assetId)).status,409);owned=true;
    state.candidateVersion++;assert.equal((await request("accept",payload.assetId)).status,409);state=fresh();
    assert.equal((await request("accept",payload.assetId)).status,201);assert.equal(JSON.stringify(state),original);assert.equal(created,1);
    assert.ok(savedChild);assert.equal(savedChild.floors[0].walls.length,0);assert.equal(savedChild.floors[0].calibrations.length,0);
    assert.equal(savedChild.floors[0].annotations.filter(isFinalSourceTrace).length,1);assert.ok(writes.slice(1).every(id=>id==="child"));
    const edited=editSourceTrace(savedChild,savedChild.floors[0].id,"source-trace:1:0",[{x:11,y:10},{x:81,y:10}]);state.candidateJson=edited;
    assert.equal((await request("accept",payload.assetId)).status,409,"A retrace cannot overwrite existing source path corrections");
    const changes=[()=>{state.candidateVersion++;},()=>{state.sourceDeletionRequestedAt=new Date();},()=>{state.sourceAsset.contentDeletedAt=new Date();},()=>{state.sourceRetentionExpiresAt=new Date(0);},()=>{state.userId="other";}];
    for(const change of changes){state=fresh();afterExtraction=change;const beforeWrites:number=writes.length;assert.equal((await request()).status,409);assert.equal(writes.length,beforeWrites,"No retained trace write after source/version race");}
  }finally{for(const[id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}}
  console.log("PASS: actual trace route authorization, version/source retention races, no-scale artwork, separate-child writes, parent preservation and corrected-path protection (DB/extractor stubs).");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
