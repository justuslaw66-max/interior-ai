import type { SourcePointPx as Point } from "./deterministic-evidence";
import { fitTracePath,tracePathFitsChain,type TracePath } from "./source-trace-fit";
import { applyTraceJunctions,proposeStraightTraceJunctions } from "./source-trace-lines";
import { setImmediate as yieldTracing } from "node:timers/promises";
const key=(p:Point)=>`${p.x}:${p.y}`;

/** Shared endpoints have a single coordinate. If any incident path cannot support
 * its movement within the original fitting bound, keep that junction unchanged. */
export async function fitTraceStrokes(chains:Point[][],tolerance:number,signal:AbortSignal,fill=false):Promise<TracePath[]> {
  const nodes=proposeStraightTraceJunctions(chains,tolerance);
  for(let pass=0;pass<9;pass++){
    if(pass===8)nodes.clear();
    const paths:TracePath[]=[],rejected=new Set<string>();
    for(const [i,original] of chains.entries()){
      if(i%32===0)await yieldTracing();signal.throwIfAborted();
      const points=applyTraceJunctions(original,nodes),path=fitTracePath(points,tolerance,fill,`stroke-${i}`);
      const ends=[original[0],original[original.length-1]];
      if(ends.some(p=>nodes.has(key(p)))&&!tracePathFitsChain(path,original,tolerance))for(const p of ends)rejected.add(key(p));
      paths.push(path);
    }
    if(!rejected.size)return paths;
    for(const id of rejected)nodes.delete(id);
  }
  throw new Error("Source trace junction fitting did not converge.");
}
