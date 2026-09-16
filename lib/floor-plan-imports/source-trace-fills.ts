import type { SourcePointPx as Point } from "./deterministic-evidence";
import { fitTracePath,type TracePath } from "./source-trace-fit";
const area=(points:Point[])=>points.slice(1).reduce((s,p,i)=>s+points[i].x*p.y-p.x*points[i].y,0)/2;
function inside(p:Point,polygon:Point[]) {
  let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }return result;
}
/** Each filled region owns its oppositely wound holes, rather than painting holes as extra fills. */
export function fitTraceFills(contours:Point[][],tolerance:number):TracePath[] {
  const outers=contours.filter(p=>area(p)>0).map((points,i)=>({points,area:area(points),path:fitTracePath(points,tolerance,true,`fill-${i}`)}));
  for(const hole of contours.filter(p=>area(p)<0)) {
    const outer=outers.filter(p=>inside(hole[0],p.points)).sort((a,b)=>a.area-b.area)[0];if(!outer)throw new Error("A source fill hole has no containing contour.");
    const path=fitTracePath(hole,tolerance,true,outer.path.groupId);outer.path.commands.push("M",...path.commands);outer.path.points.push(...path.points);
  }
  return outers.map(o=>o.path);
}
