"use client";
import { createContext } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
export type SourceTraceRequest={assetId:string;pageNumber:number};
export const SourceTraceAction=createContext<{candidateVersion:number;saved:FloorPlanDocumentV2|null;onAccept:(request:SourceTraceRequest)=>void}|null>(null);
