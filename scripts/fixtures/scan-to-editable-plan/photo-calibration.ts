import { mapPhotoPoint,type PhotoMatrix } from "../../../lib/floor-plan-photo-math";
import type { PhotoConstraints } from "../../../lib/floor-plan-photo-constraints";
import { applyPhotoCalibration } from "../../../lib/floor-plan-photo-review";
import { authoredApartment } from "./apartment";
// Independent metric drawing, distorted by a declared camera mapping. No apartment/source pixels.
export const camera:PhotoMatrix=[0.052,0.002,40,-0.001,0.047,50,0.000002,-0.000004,1];
const spans=[
  [1000,1000,7000,1000],[2000,7000,12000,7000],[7000,14000,15000,14000],
  [1000,1000,1000,7000],[8000,2000,8000,11000],[15000,5000,15000,15000],
  [2000,3000,6500,3000],[9000,9000,14000,9000],[4000,2000,4000,14000],[12000,1000,12000,6500],
];
const image=(x:number,y:number)=>mapPhotoPoint(camera,{x,y});
export const photoConstraintsFixture:PhotoConstraints={widthPx:1000,heightPx:1000,
  measurements:spans.map(([x,y,u,v],i)=>({id:`span-${i}`,first:image(x,y),second:image(u,v),lengthMm:Math.round(Math.hypot(u-x,v-y)),use:i<6?"fit":"check",quality:"scan"})),
  squareCorner:{first:[image(12000,14000),image(15000,14000)],second:[image(15000,11000),image(15000,14000)],confirmed:true}};

export function acceptedPhotoFixture() {
  const document=authoredApartment(),floor=document.floors[0];
  floor.vertices=[];floor.walls=[];floor.rooms=[];floor.openings=[];floor.structures=[];floor.dimensions=[];floor.annotations=[];floor.calibrations=[];
  return applyPhotoCalibration({document,floorId:floor.id,sourceId:document.sources[0].id,pageNumber:1,constraints:photoConstraintsFixture,
    expectedRevisionId:document.revisionId,at:"2026-09-16T00:00:00Z"});
}
