import type { SourcePointPx as Point } from "./deterministic-evidence";
import type { TracePath } from "./source-trace-fit";
import { splitTraceFillRuns } from "./source-trace-lines";
import { fitTraceStrokes } from "./source-trace-strokes";
const area=(points:Point[])=>points.slice(1).reduce((s,p,i)=>s+points[i].x*p.y-p.x*points[i].y,0)/2;
function inside(p:Point,polygon:Point[]) {
  let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }return result;
}
/** Each filled region owns its oppositely wound holes, rather than painting holes as extra fills. */
export async function fitTraceFills(contours:Point[][],tolerance:number,signal:AbortSignal):Promise<TracePath[]> {
  const outers=[];
  for(const [i,points] of contours.filter(p=>area(p)>0).entries())outers.push({points,area:area(points),path:await fitContour(points,tolerance,`fill-${i}`,signal)});
  for(const hole of contours.filter(p=>area(p)<0)) {
    const outer=outers.filter(p=>inside(hole[0],p.points)).sort((a,b)=>a.area-b.area)[0];if(!outer)throw new Error("A source fill hole has no containing contour.");
    const path=await fitContour(hole,tolerance,outer.path.groupId,signal);outer.path.commands.push("M",...path.commands);outer.path.points.push(...path.points);
  }
  return outers.map(o=>o.path);
}

async function fitContour(points:Point[],tolerance:number,groupId:string,signal:AbortSignal):Promise<TracePath> {
  const runs=splitTraceFillRuns(points,tolerance),paths=await fitTraceStrokes(runs,tolerance,signal,true);
  return {points:[paths[0].points[0],...paths.flatMap(p=>p.points.slice(1))],commands:[...paths.flatMap(p=>p.commands),"Z"],fill:true,strokeWidthPx:1,groupId};
}
