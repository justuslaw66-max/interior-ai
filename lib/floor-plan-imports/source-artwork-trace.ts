import { fitTraceFills } from "./source-trace-fills";
import { refineTraceCenters,restoreTraceCaps } from "./source-trace-center";
import { TRACE_SETTINGS,traceInkMask,traceFillMask,removeTraceSpecks } from "./source-trace-mask";
import { thinTraceMask,traceSkeletonPaths,traceFillContours } from "./source-trace-skeleton";
import { fitTracePath,type TracePath } from "./source-trace-fit";
import { preserveTraceGlyphs, type TraceTextRegion } from "./source-trace-glyphs";
import { setImmediate as yieldTracing } from "node:timers/promises";
export type SourceArtworkTrace = {version:string;widthPx:number;heightPx:number;paths:TracePath[];
  diagnostics:{inkPixels:number;removedSpeckPixels:number;rawChains:number;fillContours:number;curves:number;elapsedMs:number;glyphPixels:number};
  settings:typeof TRACE_SETTINGS};

/** Artwork-only extraction. Architectural proposals and OCR never supply pixels or shape templates. */
export async function extractSourceArtwork(bytes:Uint8Array,options:{signal?:AbortSignal;widthPx?:number;heightPx?:number;textRegions?:TraceTextRegion[]}={}):Promise<SourceArtworkTrace> {
  const started=Date.now(),{default:sharp}=await import("sharp");
  const signal=AbortSignal.any([AbortSignal.timeout(30_000),...(options.signal?[options.signal]:[])]);signal.throwIfAborted();
  const {data,info}=await sharp(bytes,{limitInputPixels:16_000_000}).flatten({background:"white"}).greyscale().raw().toBuffer({resolveWithObject:true});
  const width=info.width,height=info.height;
  if((options.widthPx&&options.widthPx!==width)||(options.heightPx&&options.heightPx!==height))throw new Error("Source trace frame changed.");
  const gray=new Uint8Array(data),{mask}=traceInkMask({gray,width,height,signal});
  await yieldTracing();signal.throwIfAborted();
  const removedSpeckPixels=removeTraceSpecks(mask,width,height),fill=traceFillMask(mask,width,height);
  const glyphPixels=preserveTraceGlyphs(mask,fill,width,height,options.textRegions??[]);
  const skeleton=await thinTraceMask(mask,width,height,signal);
  for(let i=0;i<skeleton.length;i++)if(fill[i])skeleton[i]=0;
  const chains=traceSkeletonPaths(skeleton,width,height),contours=traceFillContours(fill,width,height),paths:TracePath[]=[];
  paths.push(...fitTraceFills(contours,TRACE_SETTINGS.fitErrorPx));
  const endpoints = new Map<string,number>();
  for(const points of chains)for(const p of [points[0],points[points.length-1]]){const key=`${p.x}:${p.y}`;endpoints.set(key,(endpoints.get(key)??0)+1);}
  const caps=new Set([...endpoints].filter(([,count])=>count===1).map(([key])=>key));
  for(const [i,points] of chains.entries()){
    if(i%32===0)await yieldTracing();
    signal.throwIfAborted();const path=fitTracePath(refineTraceCenters(restoreTraceCaps(points,mask,fill,width,height,caps),gray,width,height),TRACE_SETTINGS.fitErrorPx,false,`stroke-${i}`);
    paths.push(path);
  }
  if(paths.length>20_000)throw new Error("Source artwork exceeds the bounded editable path limit.");
  return{version:TRACE_SETTINGS.version,widthPx:width,heightPx:height,paths,settings:TRACE_SETTINGS,
    diagnostics:{inkPixels:mask.reduce((s,v)=>s+v,0),removedSpeckPixels,rawChains:chains.length,fillContours:contours.length,
      curves:paths.reduce((s,p)=>s+p.commands.filter(c=>c==="C").length,0),elapsedMs:Date.now()-started,glyphPixels}};
}
