import type { FloorPlanDocumentV2 } from "./floor-plan-document-v2";
import type { FloorPlanRenderedPage } from "./floor-plan-imports/types";
import { inversePhotoMatrix } from "./floor-plan-photo-math";

export function originalPhotoFrame(page:FloorPlanRenderedPage) {
  const n=page.normalization;
  if(!n)return undefined;
  const [a,b,c,d,e,f]=n.sourceToRendered;
  return {widthPx:n.sourceWidthPx,heightPx:n.sourceHeightPx,renderedToOriginal:inversePhotoMatrix([a,c,e,b,d,f,0,0,1])};
}

/** A client cannot replace the retained source coordinate frame to reduce its residuals. */
export function assertPhotoSourceFrames(document:FloorPlanDocumentV2,pages:FloorPlanRenderedPage[]) {
  for(const floor of document.floors)for(const calibration of floor.calibrations) {
    if(!calibration.photoCorrection)continue;
    const page=pages.find((p)=>p.pageNumber===calibration.pageNumber);
    if(!page||page.widthPx!==calibration.imageWidthPx||page.heightPx!==calibration.imageHeightPx)throw new Error("The source preview frame changed.");
    const expected=originalPhotoFrame(page),observed=calibration.photoCorrection.constraints.originalFrame;
    if(JSON.stringify(expected??null)!==JSON.stringify(observed??null))throw new Error("Photo checks must use the retained original-pixel mapping.");
  }
}
