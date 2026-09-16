import assert from "node:assert/strict";
import Module from "node:module";
import sharp from "sharp";
import { acceptedPhotoFixture,camera } from "./fixtures/scan-to-editable-plan/photo-calibration";
import { correctedPhotoPng } from "../lib/floor-plan-imports/photo-preview";
import { mapPhotoPoint } from "../lib/floor-plan-photo-math";
import { registeredImportUnderlay } from "../lib/floor-plan-imports/registered-underlay";
import { buildFloorPlanSourceProjection } from "../lib/floor-plan-imports/source-projection";
import { mapUnderlayWorldPointToPixels } from "../lib/floor-plan-calibration";
import { vectorUnderlayCorners,vectorUnderlayPlacement } from "../lib/floor-plan-vector-underlay";

async function main() {
  const document=acceptedPhotoFixture(),calibration=document.floors[0].calibrations[0],correction=calibration.photoCorrection!;
  const sourcePoint=mapPhotoPoint(camera,{x:8000,y:9000}),pixel=mapPhotoPoint(correction.originalToCorrected,sourcePoint);
  const raw=Buffer.alloc(1000*1000,255);
  for(let y=0;y<1000;y++)for(let x=0;x<1000;x++)if(Math.hypot(x-sourcePoint.x,y-sourcePoint.y)<=4)raw[y*1000+x]=0;
  const original=await sharp(raw,{raw:{width:1000,height:1000,channels:1}}).toColourspace("b-w").png().toBuffer(),before=Buffer.from(original);
  const corrected=await correctedPhotoPng(original,correction),image=await sharp(corrected).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(image.info.channels,4);assert.equal(image.info.width,correction.correctedWidthPx);assert.deepEqual(original,before);
  const index=(Math.round(pixel.y)*image.info.width+Math.round(pixel.x))*4;
  assert(image.data[index]<20,"A source mark lands at its predicted corrected pixel, including grayscale inputs.");
  assert.deepEqual([...image.data.subarray(0,4)],[255,255,255,255],"Correction padding is opaque white.");
  const pages=[{pageNumber:1,widthPx:1000,heightPx:1000,assetKey:"source-page"}],source=document.sources[0];
  const underlay=registeredImportUnderlay({document,jobId:"private-job",renderedPages:pages,
    sourceAsset:{id:source.id,sha256:"a".repeat(64),fileName:"synthetic.png",mimeType:"image/png"}})!;
  assert.match(underlay.assetUrl!,/photoCalibrationId=/);
  const projection=buildFloorPlanSourceProjection(calibration)!;
  for(const measurement of correction.constraints.measurements)for(const p of [measurement.first,measurement.second]) {
    const metric=projection.unproject(p)!,mapped=mapUnderlayWorldPointToPixels(underlay,{x:metric.xMm/1000,z:metric.zMm/1000})!,expected=mapPhotoPoint(correction.originalToCorrected,p);
    assert(Math.hypot(mapped.x-expected.x,mapped.y-expected.y)<1,"Review, underlay selection and corrected pixels share the same mapping.");
  }
  const roundTrip=JSON.parse(JSON.stringify(underlay));
  assert.deepEqual(vectorUnderlayCorners(vectorUnderlayPlacement(roundTrip,document.floors[0].id)),
    vectorUnderlayCorners(vectorUnderlayPlacement(underlay,document.floors[0].id)),"Reload preserves export placement exactly.");

  let user:string|null="owner",owned=true,retained=true,reads=0;
  const saved=new Map<string,NodeModule|undefined>();
  const stub=(name:string,exports:object)=>{const id=require.resolve(name);saved.set(id,require.cache[id]);const stubModule=new Module(id);stubModule.exports=exports;stubModule.loaded=true;require.cache[id]=stubModule;};
  stub("@/lib/auth",{auth:async()=>user?{user:{id:user}}:null});
  stub("@/lib/prisma",{prisma:{floorPlanDerivedAsset:{findFirst:async({where}:{where:{job:{userId:string}}})=>owned&&where.job.userId==="owner"?{mimeType:"image/png"}:null},
    floorPlanImportJob:{findFirst:async()=>retained?{candidateJson:document,renderedPagesJson:pages}:null}}});
  stub("@/lib/floor-plan-imports/prisma-store",{PrismaFloorPlanSourceStore:class{async readDerivative(){reads++;return {fileName:"synthetic.png",mimeType:"image/png",bytes:original};}}});
  try {
    const {GET}=await import("../app/api/floor-plan-imports/[id]/assets/[assetId]/route");
    const request=(id=calibration.id)=>GET(new Request(`http://localhost/api/asset?photoCalibrationId=${id}`),{params:Promise.resolve({id:"private-job",assetId:"source-page"})});
    user=null;assert.equal((await request()).status,401);assert.equal(reads,0);
    user="other";assert.equal((await request()).status,404);assert.equal(reads,0);
    user="owner";owned=false;assert.equal((await request()).status,404);assert.equal(reads,0);
    owned=true;retained=false;assert.equal((await request()).status,404);
    retained=true;assert.equal((await request("wrong-calibration")).status,404);
    const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),corrected);
  }finally{for(const [id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}}
  console.log("PASS: photo grayscale raster, unchanged original, source/selection/export registration, reload and owner-scoped corrected asset authorization/retention. Auth/storage use isolated stubs.");
}
void main().catch(cause=>{console.error(cause);process.exitCode=1;});
