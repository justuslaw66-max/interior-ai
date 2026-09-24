import type { SourcePointPx } from "./deterministic-evidence";
import { setImmediate as yieldTracing } from "node:timers/promises";

/** Topology-preserving thinning: no gap repair or direction snapping. */
export async function thinTraceMask(input: Uint8Array, width: number, height: number, signal?: AbortSignal) {
  const mask = input.slice(); let changed = true, iteration = 0;
  while (changed && iteration++ < 256) {
    await yieldTracing();
    signal?.throwIfAborted(); changed = false;
    for (let phase = 0; phase < 2; phase++) {
      const remove=removablePixels(mask,width,height,phase);
      if (remove.length) changed = true;
      for (const p of remove) mask[p] = 0;
    }
  }
  if (changed) throw new Error("Source trace thinning exceeded its bounded iteration limit.");
  return mask;
}

function neighbours(mask: Uint8Array, at: number, width: number, height: number) {
  const x = at % width, y = Math.floor(at/width), result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || outside(x+dx,y+dy,width,height) || !mask[at+dy*width+dx]) continue;
    // An orthogonal connection already owns this corner; don't create triangular duplicate edges.
    if (dx && dy && (mask[at+dx] || mask[at+dy*width])) continue;
    result.push(at+dy*width+dx);
  }
  return result;
}

export function traceSkeletonPaths(mask: Uint8Array, width: number, height: number) {
  const adjacency = new Map<number, number[]>(), visited = new Set<string>(), paths: SourcePointPx[][] = [];
  for (let at = 0; at < mask.length; at++) if (mask[at]) adjacency.set(at, neighbours(mask,at,width,height));
  const key = (a: number,b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const walk = (start: number, next: number) => {
    const pixels = [start]; let previous = start, at = next;
    while (!visited.has(key(previous,at))) {
      visited.add(key(previous,at)); pixels.push(at);
      const candidates = adjacency.get(at) ?? [];
      if (candidates.length !== 2 || at === start) break;
      const following = candidates.find(p => p !== previous); if (following === undefined) break;
      previous = at; at = following;
    }
    if (pixels.length > 1) paths.push(pixels.map(p => ({x:p%width+0.5,y:Math.floor(p/width)+0.5})));
  };
  for (const [at,ns] of adjacency) if (ns.length !== 2) for (const next of ns) if (!visited.has(key(at,next))) walk(at,next);
  for (const [at,ns] of adjacency) for (const next of ns) if (!visited.has(key(at,next))) walk(at,next);
  return paths;
}

/** Directed pixel-cell boundaries preserve holes and disconnected silhouettes. */
export function traceFillContours(mask: Uint8Array, width: number, height: number) {
  const edges = new Map<number, number[]>(), stride = width+1;
  const add = (a:number,b:number) => edges.set(a,[...(edges.get(a)??[]),b]);
  addFillEdges(mask,width,height,add);
  const contours:SourcePointPx[][]=[];
  for(const [start,targets] of edges) while(targets.length) {
    const contour=[start];let at=start;
    do { const next=edges.get(at)?.pop();if(next===undefined)break;contour.push(next);at=next; } while(at!==start&&contour.length<=mask.length*4);
    if(contour.length>3)contours.push(contour.map(p=>({x:p%stride,y:Math.floor(p/stride)})));
  }
  return contours;
}

function removable(mask:Uint8Array,p:number,width:number,phase:number) {
        const n = [mask[p-width],mask[p-width+1],mask[p+1],mask[p+width+1],mask[p+width],mask[p+width-1],mask[p-1],mask[p-width-1]];
        const count = n.reduce((s,v) => s+v,0); if (count < 2 || count > 6) return false;
        if (n.reduce((s,v,i) => s+(!v && n[(i+1)%8] ? 1 : 0),0) !== 1) return false;
        if (phase ? n[0]*n[2]*n[6] || n[0]*n[4]*n[6] : n[0]*n[2]*n[4] || n[2]*n[4]*n[6]) return false;
  return true;
}

function removablePixels(mask:Uint8Array,width:number,height:number,phase:number) {
  const result:number[]=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const p=y*width+x;if(mask[p]&&removable(mask,p,width,phase))result.push(p);}
  return result;
}
function outside(x:number,y:number,width:number,height:number){return x<0||x>=width||y<0||y>=height;}

function addFillEdges(mask:Uint8Array,width:number,height:number,add:(a:number,b:number)=>void) {
  const stride=width+1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const at=y*width+x;if(!mask[at])continue;const p=y*stride+x;
    if(!y||!mask[at-width])add(p,p+1);
    if(x===width-1||!mask[at+1])add(p+1,p+stride+1);
    if(y===height-1||!mask[at+width])add(p+stride+1,p+stride);
    if(!x||!mask[at-1])add(p+stride,p);
  }
}
