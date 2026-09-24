import type { SourcePointPx as Point } from "./deterministic-evidence";

function intensity(gray:Uint8Array,width:number,height:number,x:number,y:number) {
  x=Math.max(0,Math.min(width-1,x-0.5));y=Math.max(0,Math.min(height-1,y-0.5));
  const a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b;
  return gray[b*width+a]*(1-fx)*(1-fy)+gray[b*width+Math.min(a+1,width-1)]*fx*(1-fy)+
    gray[Math.min(b+1,height-1)*width+a]*(1-fx)*fy+gray[Math.min(b+1,height-1)*width+Math.min(a+1,width-1)]*fx*fy;
}

/** Refine each skeleton point only across its local stroke, by at most half a pixel.
 * The narrow stencil cannot jump onto a neighbouring parallel line. Junction endpoints stay shared. */
export function refineTraceCenters(points:Point[],gray:Uint8Array,width:number,height:number) {
  return points.map((p,i)=>{
    if(i===0||i===points.length-1)return p;
    const a=points[Math.max(0,i-3)],b=points[Math.min(points.length-1,i+3)],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(!length)return p;const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    const left=intensity(gray,width,height,p.x-nx,p.y-ny),center=intensity(gray,width,height,p.x,p.y),right=intensity(gray,width,height,p.x+nx,p.y+ny);
    const curvature=left-2*center+right;if(curvature<=1)return p;
    const shift=Math.max(-0.5,Math.min(0.5,(left-right)/(2*curvature)));
    return{x:p.x+nx*shift,y:p.y+ny*shift};
  });
}

/** Thinning can shorten a finite cap. Restore only its contiguous observed ink, never cross a blank pixel. */
export function restoreTraceCaps(points:Point[],mask:Uint8Array,fill:Uint8Array,width:number,height:number,ends:Set<string>) {
  const next=points.map(p=>({...p}));
  for(const index of [0,points.length-1]) {
    const p=points[index];if(!ends.has(`${p.x}:${p.y}`)||points.length<3)continue;
    const q=points[index===0?Math.min(4,points.length-1):Math.max(0,points.length-5)],length=Math.hypot(p.x-q.x,p.y-q.y);
    if(!length)continue;const dx=(p.x-q.x)/length,dy=(p.y-q.y)/length;
    for(let d=0.25;d<=3;d+=0.25){
      const x=p.x+dx*d,y=p.y+dy*d,ix=Math.floor(x),iy=Math.floor(y);
      if(ix<0||ix>=width||iy<0||iy>=height||!mask[iy*width+ix]||fill[iy*width+ix])break;
      next[index]={x,y};
    }
  }
  return next;
}
