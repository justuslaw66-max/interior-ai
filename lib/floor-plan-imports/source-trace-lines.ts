import type { SourcePointPx as Point } from "./deterministic-evidence";
import { pointSegmentDistance } from "./source-trace-fit";

type Line = { normal:Point; offset:number; length:number };
const key = (p:Point) => `${p.x}:${p.y}`;

function principalDirection(points:Point[]) {
  const center=points.reduce((s,p)=>({x:s.x+p.x/points.length,y:s.y+p.y/points.length}),{x:0,y:0});
  let xx=0,xy=0,yy=0;
  for(const p of points){const x=p.x-center.x,y=p.y-center.y;xx+=x*x;xy+=x*y;yy+=y*y;}
  return Math.atan2(2*xy,xx-yy)/2;
}

function lineAt(points:Point[],angle:number) {
  const normal={x:-Math.sin(angle),y:Math.cos(angle)};
  let low=Infinity,high=-Infinity;
  for(const p of points){const offset=p.x*normal.x+p.y*normal.y;low=Math.min(low,offset);high=Math.max(high,offset);}
  return {normal,offset:(low+high)/2,error:(high-low)/2};
}

/** Minimax offset fits a finite observed stroke, without snapping its direction.
 * The same fitting tolerance applies to every point, including its endpoints. */
function supportedLine(points:Point[],tolerance:number):Line|null {
  const first=points[0],last=points[points.length-1],length=Math.hypot(last.x-first.x,last.y-first.y);
  if(length<12)return null;
  const angle=principalDirection(points),range=Math.atan2(tolerance*2,length);
  let low=angle-range,high=angle+range;
  for(let i=0;i<24;i++){
    const a=low+(high-low)/3,b=high-(high-low)/3;
    if(lineAt(points,a).error<lineAt(points,b).error)high=b;else low=a;
  }
  const line=lineAt(points,(low+high)/2);
  if(line.error>tolerance)return null;
  const project=(p:Point)=>{const d=line.offset-p.x*line.normal.x-p.y*line.normal.y;return{x:p.x+d*line.normal.x,y:p.y+d*line.normal.y};};
  const a=project(first),b=project(last);
  return points.every(p=>pointSegmentDistance(p,a,b)<=tolerance)?{...line,length}:null;
}

function sharedEndpoint(point:Point,lines:Line[],tolerance:number):Point {
  // A weak positional anchor leaves a single line's longitudinal cap unchanged.
  let xx=0.001,xy=0,yy=0.001,bx=point.x*0.001,by=point.y*0.001;
  for(const line of lines){const {x,y}=line.normal,w=Math.min(line.length,100);xx+=x*x*w;xy+=x*y*w;yy+=y*y*w;bx+=x*line.offset*w;by+=y*line.offset*w;}
  const det=xx*yy-xy*xy,result={x:(bx*yy-by*xy)/det,y:(by*xx-bx*xy)/det};
  return Math.hypot(result.x-point.x,result.y-point.y)<=tolerance?result:point;
}

/** Refine shared graph endpoints together. Return the original dense observations
 * with only endpoint proposals changed; downstream fits still check the originals. */
export function proposeStraightTraceJunctions(chains:Point[][],tolerance:number) {
  const nodes=new Map<string,{point:Point;lines:Line[]}>();
  for(const points of chains){
    const line=supportedLine(points,tolerance);
    for(const point of [points[0],points[points.length-1]]){
      const id=key(point),node=nodes.get(id)??{point,lines:[]};if(line)node.lines.push(line);nodes.set(id,node);
    }
  }
  const proposed=new Map([...nodes].filter(([,node])=>node.lines.length).map(([id,node])=>[id,sharedEndpoint(node.point,node.lines,tolerance)]));
  protectDistinctEndpoints(nodes,proposed,tolerance);
  return proposed;
}

function protectDistinctEndpoints(nodes:Map<string,{point:Point}>,proposed:Map<string,Point>,tolerance:number) {
  const size=tolerance*4,cells=new Map<string,Point[]>(),rejected=new Set<string>();
  for(const {point:p} of nodes.values()){
    const cell=`${Math.floor(p.x/size)}:${Math.floor(p.y/size)}`;cells.set(cell,[...(cells.get(cell)??[]),p]);
  }
  const offsets=[-1,0,1].flatMap(y=>[-1,0,1].map(x=>({x,y})));
  for(const {point:p} of nodes.values())for(const {x,y} of offsets){
    const nearby=cells.get(`${Math.floor(p.x/size)+x}:${Math.floor(p.y/size)+y}`)??[];
    for(const q of nearby){
      if(key(p)===key(q))continue;const a=proposed.get(key(p))??p,b=proposed.get(key(q))??q;
      if(Math.hypot(a.x-b.x,a.y-b.y)<Math.hypot(p.x-q.x,p.y-q.y)/2){rejected.add(key(p));rejected.add(key(q));}
    }
  }
  for(const id of rejected)proposed.delete(id);
}

export function applyTraceJunctions(points:Point[],nodes:Map<string,Point>) {
  return points.map((p,i)=>i===0||i===points.length-1?nodes.get(key(p))??p:p);
}

/** Partition a filled silhouette into finite, source-supported runs. Short details
 * retain their own vertices; this never replaces a region with a bounding box. */
export function splitTraceFillRuns(points:Point[],tolerance:number,depth=0):Point[][] {
  const first=points[0],last=points[points.length-1];let error=0,split=0;
  points.forEach((p,i)=>{const d=pointSegmentDistance(p,first,last);if(d>error){error=d;split=i;}});
  if(points.length<=2||error<=tolerance||supportedLine(points,tolerance))return[points];
  if(depth>32)throw new Error("Source fill run fitting exceeded its depth bound.");
  split=Math.max(1,Math.min(points.length-2,split||Math.floor(points.length/2)));
  return [...splitTraceFillRuns(points.slice(0,split+1),tolerance,depth+1),...splitTraceFillRuns(points.slice(split),tolerance,depth+1)];
}
