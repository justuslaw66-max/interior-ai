import assert from "node:assert/strict";
import sharp from "sharp";
import { extractSourceArtwork } from "../lib/floor-plan-imports/source-artwork-trace";
import { sourceTraceAnnotations } from "../lib/floor-plan-source-trace";
import { sourceDrawingSvgPath,sourceDrawingGeometryError } from "../lib/floor-plan-source-drawing";
import { pointSegmentDistance,type TracePath } from "../lib/floor-plan-imports/source-trace-fit";
import { thinTraceMask } from "../lib/floor-plan-imports/source-trace-skeleton";
import { preserveTraceGlyphs } from "../lib/floor-plan-imports/source-trace-glyphs";

type Point={x:number;y:number};
function samples(path:TracePath) {
  const points:Point[]=[];let at=1,start=path.points[0],first=start;
  for(const command of path.commands){
    if(command==="M"){start=path.points[at++];first=start;continue;}
    if(command==="Z"){points.push(first);start=first;continue;}
    const controls=path.points.slice(at,at+(command==="C"?3:1));at+=controls.length;
    const end=controls[controls.length-1],count=Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)*3)+1;
    for(let i=0;i<=count;i++){const t=i/count,s=1-t;points.push(command==="C"?{x:s*s*s*start.x+3*s*s*t*controls[0].x+3*s*t*t*controls[1].x+t*t*t*end.x,y:s*s*s*start.y+3*s*s*t*controls[0].y+3*s*t*t*controls[1].y+t*t*t*end.y}:{x:start.x*s+end.x*t,y:start.y*s+end.y*t});}
    start=end;
  }return points;
}
const svg=(body:string)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="220"><rect width="240" height="220" fill="white"/>${body}</svg>`);
async function run() {
  const body='<g fill="none" stroke="#555" stroke-width="1.5"><path d="M30 20L30 190M34 20L34 190M38 60L38 160M30 20L34 20M30 60L38 60M30 160L38 160"/><path d="M80 30L160 37M80 70C120 70 140 100 140 140"/><path d="M160 180L168 180M172 180L180 180M184 180L192 180"/><path d="M175 20L175 80M160 50L195 50"/></g><path d="M60 170L140 172" stroke="#e5e5e5" stroke-width="1.5"/><text x="80" y="53" font-size="13">1234</text>';
  const bytes=await sharp(svg(body)).png().toBuffer(),trace=await extractSourceArtwork(bytes),all=trace.paths.filter(p=>!p.fill).flatMap(samples);
  const nearest=(p:Point)=>Math.min(...all.map(q=>Math.hypot(q.x-p.x,q.y-p.y)));
  for(const x of [30,34])for(let y=25;y<187;y+=5)assert.ok(nearest({x,y})<1.5,`Distinct outline missing ${x},${y}`);
  for(let y=64;y<158;y+=5)assert.ok(nearest({x:38,y})<1.5,`Internal divider missing ${y}`);
  for(let x=32;x<37;x++)assert.ok(nearest({x,y:60})<1.5,"Crossbar lost");
  for(let x=65;x<136;x+=5)assert.ok(nearest({x,y:170+(x-60)/40})<1.5,"Faint line lost");
  for(let t=0;t<=1;t+=0.05){const s=1-t;assert.ok(nearest({x:80*s*s*s+360*s*s*t+420*s*t*t+140*t*t*t,y:70*s*s*s+210*s*s*t+300*s*t*t+140*t*t*t})<1.5,`Visible cubic span lost at ${t}`);}
  assert.ok(trace.diagnostics.curves>0,"Curved strokes require real bounded curves");
  assert.ok(nearest({x:170,y:180})>1.5&&nearest({x:182,y:180})>1.5,"Intentional dash gaps must stay open");
  assert.ok(nearest({x:175,y:22})<1.5&&nearest({x:162,y:50})<1.5,"Junction arms remain");
  assert.equal(new Set(trace.paths.map(p=>JSON.stringify(p))).size,trace.paths.length,"No identical final paths");
  const again=await extractSourceArtwork(bytes);assert.deepEqual(again.paths,trace.paths,"Repeated extraction is deterministic; no appended duplicates");
  const annotations=sourceTraceAnnotations(trace,"test-source",1);
  for(const a of annotations){assert.equal(a.geometry.kind,"source_drawing");if(a.geometry.kind==="source_drawing")assert.equal(sourceDrawingGeometryError(a.geometry),null);}
  const solid=await extractSourceArtwork(await sharp(svg('<path d="M20 20H150V130H20Z M50 50V100H120V50Z" fill="black" fill-rule="evenodd"/>')).png().toBuffer());
  const fills=solid.paths.filter(p=>p.fill);assert.equal(fills.length,1,"Filled silhouette is one compound object");assert.ok(fills[0].commands.includes("M"),"Hole remains a subpath");
  const fillGeometry=sourceTraceAnnotations(solid,"test-source",1)[0].geometry;
  assert.equal(fillGeometry.kind,"source_drawing");if(fillGeometry.kind!=="source_drawing")throw Error("Missing fill");
  const rendered=await sharp(svg(`<path d="${sourceDrawingSvgPath(fillGeometry)}" fill="black"/>`)).greyscale().raw().toBuffer();
  assert.equal(rendered[70*240+80],255,"Filled-region hole cannot be painted over");assert.equal(rendered[30*240+80],0,"Broad solid ink interior cannot be erased by local normalization");
  const controller=new AbortController();controller.abort();await assert.rejects(()=>extractSourceArtwork(bytes,{signal:controller.signal}));
  const inFlight=new AbortController(),dense=new Uint8Array(500*500);
  for(let y=20;y<480;y++)dense.fill(1,y*500+20,y*500+480);
  const thinning=thinTraceMask(dense,500,500,inFlight.signal);setImmediate(()=>inFlight.abort());
  await assert.rejects(thinning,/abort/i,"Cancellation must be observed during CPU tracing, not only before decode");
  const ink=new Uint8Array(100),glyphFill=new Uint8Array(100);for(let x=0;x<10;x++)ink[50+x]=1;
  const beforeInk=ink.slice();preserveTraceGlyphs(ink,glyphFill,10,10,[{center:{x:5,y:5},widthPx:3,heightPx:3,text:"123"}]);
  assert.deepEqual(ink,beforeInk,"OCR boxes never erase any neighboring or touching drawing pixels");
  assert.equal(glyphFill[55],1);assert.equal(glyphFill[50],0);assert.equal(glyphFill[44],0,"Glyph paint cannot invent ink inside a text box");
  const railFill=new Uint8Array(100);preserveTraceGlyphs(ink,railFill,10,10,[{center:{x:5,y:5},widthPx:9,heightPx:9,text:"I|"}]);
  assert.equal(railFill.reduce((sum,p)=>sum+p,0),0,"Rail-like OCR cannot convert linework to text paint");
  await assert.rejects(()=>extractSourceArtwork(bytes,{widthPx:999}),/frame changed/);
  assert.equal(pointSegmentDistance({x:1,y:1},{x:0,y:0},{x:2,y:0}),1);
  console.log("Source tracing: parallels, divided outlines, full cubic spans, faint strokes, dashes, junctions, nearby text, filled holes, determinism and bounds PASS.");
}
void run().catch(e=>{console.error(e);process.exitCode=1;});
