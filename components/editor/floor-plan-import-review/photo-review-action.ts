import type { SourceTraceRequest } from "./source-trace-action";
import { createContext } from "react";
import type { PhotoConstraints } from "@/lib/floor-plan-photo-constraints";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
import { floorPlanImportResponseJson,parseFloorPlanImportDocument } from "../useConsumerFloorPlanImportSession";

export type PhotoReviewRequest={constraints:PhotoConstraints;pageNumber:number};
/** The import session owns async job switching; nested source tools only request it. */
export const PhotoReviewAction=createContext<((request:PhotoReviewRequest)=>void)|null>(null);
export const photoReviewBusy=(...states:boolean[])=>states.some(Boolean);

function hasOtherUnsavedPhotoEdits(current:FloorPlanDocumentV2,saved:FloorPlanDocumentV2) {
  const withoutPhoto=(doc:FloorPlanDocumentV2)=>({...doc,revisionId:"",floors:doc.floors.map(({calibrations:_c,photoReviewDrafts:_d,...floor})=>floor)});
  return JSON.stringify(withoutPhoto(current))!==JSON.stringify(withoutPhoto(saved));
}

export function assertPhotoForkDraft(photo:PhotoReviewRequest|undefined,current:FloorPlanDocumentV2|null,saved:FloorPlanDocumentV2|null) {
  if(photo&&current&&(!saved||hasOtherUnsavedPhotoEdits(current,saved)))throw new Error("Save your other review corrections before creating a separate corrected review.");
}

export function createdReviewJobId(payload:Record<string,unknown>) {
  const job=payload.job;
  if(!job||typeof job!=="object"||!("id" in job)||typeof job.id!=="string")throw new Error("The new review job ID is missing");
  return job.id;
}

export async function requestDetectionReview(input:{activeJob:ConsumerFloorPlanImportJob;photo?:PhotoReviewRequest;trace?:SourceTraceRequest;candidate:FloorPlanDocumentV2|null;
  signal:AbortSignal;onActiveJobIdChange?: (id:string)=>void;
  processAndPoll:(id:string,message:string,options:{signal:AbortSignal})=>Promise<ConsumerFloorPlanImportJob>}) {
  const {activeJob,photo,trace,candidate,signal}=input;
  if(trace && JSON.stringify(candidate)!==JSON.stringify(parseFloorPlanImportDocument(activeJob.candidateJson)))throw new Error("Save review edits before opening the traced review.");
  assertPhotoForkDraft(photo,candidate,parseFloorPlanImportDocument(activeJob.candidateJson));
  const payload=await floorPlanImportResponseJson(await fetch(`/api/floor-plan-imports/${activeJob.id}/${trace?"source-trace":photo?"photo-review":"retry-detection"}`,
    {method:"POST",signal,...((photo||trace)?{headers:{"content-type":"application/json"},body:JSON.stringify({...photo,...trace,...(trace?{action:"accept"}:{}),candidateVersion:activeJob.candidateVersion})}:{})}));
  signal.throwIfAborted();const id=createdReviewJobId(payload);input.onActiveJobIdChange?.(id);signal.throwIfAborted();
  return input.processAndPoll(id,trace?"Opening the traced artwork review":photo?"Re-extracting the corrected source locally":"Retrying with improved wall and dimension detection",{signal});
}
