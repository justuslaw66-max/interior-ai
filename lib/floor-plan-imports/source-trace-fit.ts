import type { SourcePointPx as Point } from "./deterministic-evidence";
export type TraceCommand = "M" | "L" | "C" | "Z";
export type TracePath = { points: Point[]; commands: TraceCommand[]; fill: boolean; strokeWidthPx: number; groupId: string };
const distance = (a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const blend = (a:Point,b:Point,t:number)=>({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t});

export function pointSegmentDistance(p:Point,a:Point,b:Point) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}

function cubicPoint(p:Point[],t:number) {
  return blend(blend(blend(p[0],p[1],t),blend(p[1],p[2],t),t),blend(blend(p[1],p[2],t),blend(p[2],p[3],t),t),t);
}

/** Least-squares bounded cubic with free controls and chord parameterization. No circular/door templates. */
function fitCubic(points:Point[],tolerance:number) {
  const start=points[0],end=points[points.length-1];
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  const total=lengths[lengths.length-1];let aa=0,ab=0,bb=0,ax=0,ay=0,bx=0,by=0;
  points.forEach((p,i)=>{
    const t=lengths[i]/(total||1),s=1-t,b1=3*s*s*t,b2=3*s*t*t;
    const rx=p.x-start.x*s*s*s-end.x*t*t*t,ry=p.y-start.y*s*s*s-end.y*t*t*t;
    aa+=b1*b1;bb+=b2*b2;ab+=b1*b2;ax+=b1*rx;ay+=b1*ry;bx+=b2*rx;by+=b2*ry;
  });
  const det=aa*bb-ab*ab;if(Math.abs(det)<1e-10)return null;
  const controls=[start,{x:(ax*bb-bx*ab)/det,y:(ay*bb-by*ab)/det},{x:(bx*aa-ax*ab)/det,y:(by*aa-ay*ab)/det},end];
  let error=0,split=Math.floor(points.length/2);
  points.forEach((p,i)=>{const d=distance(p,cubicPoint(controls,lengths[i]/(total||1)));if(d>error){error=d;split=i;}});
  if(error>tolerance)return{controls,error,split};
  // Also check generated spans against the full finite observed chain.
  for(let i=1;i<Math.ceil(total*2);i++) {
    const p=cubicPoint(controls,i/Math.ceil(total*2));let d=Infinity;
    for(let j=1;j<points.length;j++)d=Math.min(d,pointSegmentDistance(p,points[j-1],points[j]));
    error=Math.max(error,d);
  }
  return{controls,error,split};
}

function fitSpan(points:Point[],tolerance:number,result:TracePath,curves:boolean,depth=0) {
  const first=points[0],last=points[points.length-1];let error=0,split=0;
  points.forEach((p,i)=>{const d=pointSegmentDistance(p,first,last);if(d>error){error=d;split=i;}});
  const cubic=curves&&points.length>=6?fitCubic(points,tolerance):null;
  if(cubic&&error>0.15&&cubic.error<=tolerance&&(error>tolerance||cubic.error<error*0.6)){result.commands.push("C");result.points.push(...cubic.controls.slice(1));return;}
  if(error<=tolerance||points.length<=2){result.commands.push("L");result.points.push(last);return;}
  if(depth>32)throw new Error("Source trace curve fitting exceeded its depth bound.");
  split=Math.max(1,Math.min(points.length-2,split||Math.floor(points.length/2)));
  fitSpan(points.slice(0,split+1),tolerance,result,curves,depth+1);
  fitSpan(points.slice(split),tolerance,result,curves,depth+1);
}

export function fitTracePath(points:Point[],tolerance:number,fill:boolean,groupId:string):TracePath {
  const result:TracePath={points:[points[0]],commands:[],fill,strokeWidthPx:1,groupId};
  const closed=distance(points[0],points[points.length-1])<0.01;
  if(closed){const middle=Math.floor(points.length/2);fitSpan(points.slice(0,middle+1),tolerance,result,!fill);fitSpan(points.slice(middle),tolerance,result,!fill);result.commands.push("Z");}
  else fitSpan(points,tolerance,result,true);
  return result;
}
