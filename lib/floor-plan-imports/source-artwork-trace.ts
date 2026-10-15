import { fitTraceFills } from "./source-trace-fills";
import { refineTraceCenters,restoreTraceCaps } from "./source-trace-center";
import { CLEAN_TRACE_SETTINGS,boxMask,cleanDrawingPaths,explainedInkMask,extendAlongInk,joinLines,keepTracedLettering,planLineTone,removeExplainedInk,supportedDrawing } from "./source-trace-clean";
import { centredOnInk,withoutShadows } from "./source-trace-doubles";
import { flatFaces } from "./source-trace-flat-faces";
import { wallsAsDrawn } from "./source-trace-walls";
import { faintTone,pageTone,paperTone } from "./source-trace-fine";
import { clearPaper } from "./source-trace-paper";
import { letteringBoxes,traceLettering } from "./source-trace-lettering";
import { letteringZones,traceMarks } from "./source-trace-marks";
import { distanceToInk } from "./source-trace-mark-shapes";
import { TRACE_SETTINGS,traceInkMask,traceFillMask,removeTraceSpecks } from "./source-trace-mask";
import { thinTraceMask,traceSkeletonPaths,traceFillContours } from "./source-trace-skeleton";
import type { TracePath } from "./source-trace-fit";
import type { SourcePointPx as Point } from "./deterministic-evidence";
import { fitTraceStrokes } from "./source-trace-strokes";
import { preserveTraceGlyphs, type TraceTextRegion } from "./source-trace-glyphs";
import type { RegisteredVectorizerDrawing } from "./vectorizer-drawing";
import { setImmediate as yieldTracing } from "node:timers/promises";
export type SourceArtworkTrace = {version:string;widthPx:number;heightPx:number;paths:TracePath[];
  diagnostics:{inkPixels:number;removedSpeckPixels:number;rawChains:number;fillContours:number;curves:number;elapsedMs:number;glyphPixels:number;
    cleanItems?:number;explainedPixels?:number;letterPaths?:number;markPaths?:number;droppedPixels?:number;unsupportedItems?:number;hollowWalls?:number;refacedWalls?:number;centredLines?:number;extendedLines?:number;joinedLines?:number;flatFaces?:number};
  settings:Omit<typeof TRACE_SETTINGS,"version">&{version:string}};
type TraceOptions={signal?:AbortSignal;widthPx?:number;heightPx?:number;textRegions?:TraceTextRegion[];clean?:RegisteredVectorizerDrawing};

/** The clean drawing's part of a trace (v3): its shapes, the smooth lettering and small marks, with the ink they explain
 * taken out of the mask (faint marks and soft edges too); `lettering` is what the smooth pass left to the general one. */
async function cleanPart(mask:Uint8Array,gray:Uint8Array,width:number,height:number,given:RegisteredVectorizerDrawing|undefined,signal:AbortSignal) {
  if(!given?.items.length)return null;
  const lines=planLineTone(given,gray,width),faint=faintTone(gray,lines?.light??null);
  const shadowTone=lines?(lines.median+paperTone(gray))/2:faint;
  const tones={ink:shadowTone,paper:paperTone(gray),full:pageTone(gray,0.01)},supported=supportedDrawing(given,gray,width,shadowTone);
  const walls=wallsAsDrawn(supported.drawing,gray,width,tones),centred=centredOnInk(walls.drawing,gray,width,tones);
  const extended=extendAlongInk(centred.drawing,gray,width,shadowTone);
  const flat=flatFaces(extended.drawing,gray,width,tones),{drawing:clean,moved}=joinLines(flat.drawing);
  const unsupported=supported.unsupported;
  const {explained,removed,solid}=removeExplainedInk(mask,clean,width,height),drawn=explainedInkMask(clean,width,height,0.5);
  const letters=await traceLettering({ink:mask,gray,width,height,explained,drawn,faint,signal,boxes:clean.textBoxes});
  const near=explainedInkMask(clean,width,height,CLEAN_TRACE_SETTINGS.shadowMarginPx);
  const zones=letteringZones(letteringBoxes(clean.textBoxes,width,height)),lineGap=distanceToInk(drawn,width,height);
  const marks=await traceMarks({ink:mask,gray,width,height,drawn,lineGap,near,faint,shadowTone,inkTone:pageTone(gray,0.01),zones,signal,
    explained:explained.map((v,i)=>v&&!solid[i]?1:0)});  // (a dot on a line is its own)
  return{paths:[...cleanDrawingPaths(clean),...letters.paths,...marks.paths],lettering:boxMask(letters.untraced,width,height),near,shadowTone,lineGap,
    diagnostics:{cleanItems:clean.items.length,explainedPixels:removed,letterPaths:letters.paths.length,markPaths:marks.paths.length,
      droppedPixels:marks.dropped,unsupportedItems:unsupported,hollowWalls:walls.hollow,refacedWalls:walls.refaced,centredLines:centred.moved,extendedLines:extended.extended,joinedLines:moved,flatFaces:flat.flattened}};
}

/** A fitting that cannot bound one piece fails the whole trace (v2). Beside the clean drawing (v3) the general pass
 * only traces leftovers, so there each piece is fitted on its own and one that cannot be bounded is left out. */
async function tolerantly(fit:(pieces:Point[][])=>Promise<TracePath[]>,pieces:Point[][],signal:AbortSignal):Promise<TracePath[]> {
  try { return await fit(pieces); } catch(error) {
    if(signal.aborted)throw error;
    const paths:TracePath[]=[];
    for(const piece of pieces)paths.push(...await fit([piece]).catch((inner)=>{if(signal.aborted)throw inner;return [];}));
    return paths;
  }
}

/** The general pass: the fill mask as filled shapes, the rest of the ink as strokes along its skeleton. */
async function generalPaths(mask:Uint8Array,fill:Uint8Array,gray:Uint8Array,width:number,height:number,signal:AbortSignal,tolerant=false) {
  const skeleton=await thinTraceMask(mask,width,height,signal);
  for(let i=0;i<skeleton.length;i++)if(fill[i])skeleton[i]=0;
  const chains=traceSkeletonPaths(skeleton,width,height),contours=traceFillContours(fill,width,height),paths:TracePath[]=[];
  const fills=(pieces:Point[][])=>fitTraceFills(pieces,TRACE_SETTINGS.fitErrorPx,signal);
  paths.push(...await (tolerant?tolerantly(fills,contours,signal):fills(contours)));
  const endpoints = new Map<string,number>();
  for(const points of chains)for(const p of [points[0],points[points.length-1]]){const key=`${p.x}:${p.y}`;endpoints.set(key,(endpoints.get(key)??0)+1);}
  const caps=new Set([...endpoints].filter(([,count])=>count===1).map(([key])=>key));
  const observations=chains.map(points=>refineTraceCenters(restoreTraceCaps(points,mask,fill,width,height,caps),gray,width,height));
  const strokes=(pieces:Point[][])=>fitTraceStrokes(pieces,TRACE_SETTINGS.fitErrorPx,signal);
  paths.push(...await (tolerant?tolerantly(strokes,observations,signal):strokes(observations)));
  return{paths,rawChains:chains.length,fillContours:contours.length};
}

/** The grey page with its tint and watermark taken to white (v3 only; a page in black on white comes back as it is). */
async function paperGray(sharp:(typeof import("sharp"))["default"],bytes:Uint8Array,gray:Uint8Array,width:number,height:number,
  clean:RegisteredVectorizerDrawing) {
  const {data}=await sharp(bytes,{limitInputPixels:16_000_000}).flatten({background:"white"}).removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
  if(data.length!==gray.length*3)return gray;
  const own=explainedInkMask(clean,width,height),boxes=boxMask(letteringBoxes(clean.textBoxes,width,height),width,height);
  for(let i=0;i<own.length;i++)own[i]|=boxes[i];
  return clearPaper(gray,new Uint8Array(data),width,height,own).gray;
}

/** Artwork extraction. Without `clean` (v2) it is artwork only: architectural proposals and OCR never supply pixels or
 * shape templates. With `clean` (v3) the vectorizer's own drawing of the page supplies the walls, openings and lines as
 * clean shapes; the ink it does not explain - the lettering above all - is still traced from the picture. */
export async function extractSourceArtwork(bytes:Uint8Array,options:TraceOptions={}):Promise<SourceArtworkTrace> {
  const started=Date.now(),{default:sharp}=await import("sharp");
  const signal=AbortSignal.any([AbortSignal.timeout(30_000),...(options.signal?[options.signal]:[])]);signal.throwIfAborted();
  const {data,info}=await sharp(bytes,{limitInputPixels:16_000_000}).flatten({background:"white"}).greyscale().raw().toBuffer({resolveWithObject:true});
  const width=info.width,height=info.height;
  if((options.widthPx&&options.widthPx!==width)||(options.heightPx&&options.heightPx!==height))throw new Error("Source trace frame changed.");
  const gray=options.clean?.items.length?await paperGray(sharp,bytes,new Uint8Array(data),width,height,options.clean):new Uint8Array(data);
  const {mask}=traceInkMask({gray,width,height,signal});
  await yieldTracing();signal.throwIfAborted();
  const clean=await cleanPart(mask,gray,width,height,options.clean,signal);
  const removedSpeckPixels=removeTraceSpecks(mask,width,height),fill=traceFillMask(mask,width,height);
  const glyphPixels=preserveTraceGlyphs(mask,fill,width,height,options.textRegions??[])+(clean?keepTracedLettering(mask,fill,clean.lettering):0);
  const general=await generalPaths(mask,fill,gray,width,height,signal,Boolean(clean));
  const paths=clean?[...clean.paths,...withoutShadows(general.paths,{width,gray,shadowTone:clean.shadowTone,near:clean.near,lettering:clean.lettering,lineGap:clean.lineGap})]:general.paths;
  if(paths.length>20_000)throw new Error("Source artwork exceeds the bounded editable path limit.");
  const version=clean?CLEAN_TRACE_SETTINGS.version:TRACE_SETTINGS.version;
  return{version,widthPx:width,heightPx:height,paths,settings:{...TRACE_SETTINGS,version},
    diagnostics:{inkPixels:mask.reduce((s,v)=>s+v,0),removedSpeckPixels,rawChains:general.rawChains,fillContours:general.fillContours,
      curves:paths.reduce((s,p)=>s+p.commands.filter(c=>c==="C").length,0),elapsedMs:Date.now()-started,glyphPixels,...clean?.diagnostics}};
}
