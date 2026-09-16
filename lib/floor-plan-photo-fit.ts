import { originalPhotoPoint,type PhotoConstraints } from "./floor-plan-photo-constraints";
import { mapPhotoPoint, multiplyPhotoMatrices, photoCorners, photoDistance, solvePhotoSystem, type PhotoMatrix } from "./floor-plan-photo-math";

/** Translation/rotation are coordinate choices. Only metric and perspective terms are fitted. */
function constrainedMatrix(q: number[], input: PhotoConstraints): PhotoMatrix {
  const size = Math.max(input.widthPx, input.heightPx), a = Math.exp(q[0]), d = Math.exp(q[1]);
  const center: PhotoMatrix = [1/size, 0, -input.widthPx/(2*size), 0, 1/size, -input.heightPx/(2*size), 0, 0, 1];
  const perspective: PhotoMatrix = [1, 0, 0, 0, 1, 0, q[2] ?? 0, q[3] ?? 0, 1];
  const p = multiplyPhotoMatrices(perspective, center);
  const [u0,u1] = input.squareCorner.first.map((point) => mapPhotoPoint(p,point));
  const [v0,v1] = input.squareCorner.second.map((point) => mapPhotoPoint(p,point));
  const ux=u1.x-u0.x, uy=u1.y-u0.y, vx=v1.x-v0.x, vy=v1.y-v0.y;
  const aa=uy*vy, bb=ux*vy+uy*vx, cc=ux*vx+(d/a)**2*uy*vy;
  const discriminant=bb*bb-4*aa*cc;
  if (discriminant < 0 || Math.abs(bb)+Math.abs(aa) < 1e-14) throw new Error("The selected corner does not constrain a usable correction.");
  const roots=Math.abs(aa)<1e-14 ? [-cc/bb] : [(-bb+Math.sqrt(discriminant))/(2*aa),(-bb-Math.sqrt(discriminant))/(2*aa)];
  const t=roots.sort((x,y)=>Math.abs(x)-Math.abs(y))[0];
  const trace=a*a+(a*t)**2+d*d, determinant=(a*d)**2;
  const largest=(trace+Math.sqrt(Math.max(0,trace*trace-4*determinant)))/2;
  if (!Number.isFinite(largest) || largest/(a*d)>3 || q.slice(2).some((v)=>Math.abs(v)>=1)) {
    throw new Error("The anchors would require an unstable image distortion.");
  }
  const matrix=multiplyPhotoMatrices([a,a*t,0,0,d,0,q[2]??0,q[3]??0,1],center);
  if (photoCorners(input.widthPx,input.heightPx).some((point) => {
    const w=matrix[6]*point.x+matrix[7]*point.y+matrix[8]; return w<=0.25 || w>=4;
  })) throw new Error("The correction is unstable at the image boundary.");
  return matrix;
}

function fitResidual(q: number[], input: PhotoConstraints) {
  const matrix=constrainedMatrix(q,input);
  return input.measurements.filter((m)=>m.use==="fit").map((m)=> {
    const length=photoDistance(mapPhotoPoint(matrix,m.first),mapPhotoPoint(matrix,m.second));
    return (length-m.lengthMm)*photoDistance(originalPhotoPoint(input,m.first),originalPhotoPoint(input,m.second))/length;
  });
}

function normalEquations(q: number[], input: PhotoConstraints, residual: number[]) {
  const jac=q.map((_,column)=> {
    const plus=[...q],minus=[...q]; plus[column]+=1e-6; minus[column]-=1e-6;
    const a=fitResidual(plus,input), b=fitResidual(minus,input);
    return a.map((v,i)=>(v-b[i])/2e-6);
  });
  return { normal:jac.map((a)=>jac.map((b)=>a.reduce((sum,v,i)=>sum+v*b[i],0))),
    target:jac.map((a)=>-a.reduce((sum,v,i)=>sum+v*residual[i],0)) };
}

const squared=(values:number[])=>values.reduce((sum,v)=>sum+v*v,0);

function optimize(input:PhotoConstraints, initial:number[]) {
  let q=[...initial], damping=0.01;
  for(let step=0;step<160;step++) {
    const residual=fitResidual(q,input), {normal,target}=normalEquations(q,input,residual);
    const delta=solvePhotoSystem(normal.map((row,i)=>row.map((v,j)=>v+(i===j?damping*Math.max(normal[i][i],1):0))),target);
    if(!delta) throw new Error("The measurements do not constrain a unique correction.");
    const next=q.map((v,i)=>v+delta[i]);
    let cost=Infinity;
    try { cost=squared(fitResidual(next,input)); } catch { /* An invalid trial is rejected, never accepted as evidence. */ }
    if(cost<squared(residual)) {
      q=next; damping=Math.max(1e-12,damping/3);
      if(Math.hypot(...delta)<1e-9) break;
    } else damping=Math.min(1e12,damping*10);
  }
  const {normal}=normalEquations(q,input,fitResidual(q,input));
  const inverse=normal.map((_,i)=>solvePhotoSystem(normal,normal.map((__,j)=>i===j?1:0)));
  if(inverse.some((row)=>!row)) throw new Error("Add measurements in another direction or another part of the image.");
  const norm=Math.max(...normal.map((row)=>row.reduce((sum,v)=>sum+Math.abs(v),0)));
  const inverseNorm=Math.max(...inverse.map((row)=>row?.reduce((sum,v)=>sum+Math.abs(v),0)??Infinity));
  const condition=Math.sqrt(norm*inverseNorm);
  if(!Number.isFinite(condition)||condition>1e6) throw new Error("The selected measurements leave the correction ambiguous.");
  return {matrix:constrainedMatrix(q,input),condition,cost:squared(fitResidual(q,input))};
}

export function fitPhotoMetric(input:PhotoConstraints, projective:boolean) {
  const ratios=input.measurements.filter((m)=>m.use==="fit").map((m)=>m.lengthMm/photoDistance(m.first,m.second)).sort((a,b)=>a-b);
  const scale=ratios[Math.floor(ratios.length/2)]*Math.max(input.widthPx,input.heightPx);
  const seed=[Math.log(scale),Math.log(scale),...(projective?[0,0]:[])];
  return optimize(input,seed);
}
