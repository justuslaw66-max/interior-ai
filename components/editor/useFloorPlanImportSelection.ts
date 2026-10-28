"use client";

import { useCallback, useState } from "react";
import {
  floorPlanImportHintFor,
  planFloorPlanImportReopen,
  readActiveFloorPlanImportId,
  readFloorPlanImportHint,
  writeActiveFloorPlanImportId,
  writeFloorPlanImportHint,
  type FloorPlanImportHint,
} from "@/lib/floor-plan-import-client";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";

function readStoredImport(accountKey: string) {
  if (typeof window === "undefined") return { storedJobId: null, hint: null, ...planFloorPlanImportReopen(null, null) };
  const storedJobId = readActiveFloorPlanImportId(window.localStorage);
  const hint = storedJobId ? readFloorPlanImportHint(window.localStorage, storedJobId, accountKey) : null;
  return { storedJobId, hint, ...planFloorPlanImportReopen(storedJobId, hint) };
}

/**
 * Which upload the window shows: a new file, the stored upload when it is still being read, or
 * (for one waiting on the person) a card to continue it. Keeps the stored id and its hint in step;
 * the hint belongs to `accountKey`, so a browser shared between accounts never shows one person's upload to another.
 */
export function useFloorPlanImportSelection<TRequest>(request: TRequest | null, accountKey: string) {
  const [stored] = useState(() => readStoredImport(accountKey));
  const [resumeJobId, setResumeJobId] = useState<string | null>(stored.resumeJobId);
  const [lastUpload, setLastUpload] = useState<FloorPlanImportHint | null>(stored.lastUpload);
  const [resumeFileName, setResumeFileName] = useState<string | null>(stored.hint?.fileName ?? null);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(stored.storedJobId);
  const [ignoredRequest, setIgnoredRequest] = useState<TRequest | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<ConsumerFloorPlanImportJob | null>(null);
  const [reviewSession, setReviewSession] = useState(0);

  const selectImportJob = useCallback((jobId: string | null) => {
    if (jobId !== activeImportJobId) { setReviewSession((value) => value + 1); setActiveJobSnapshot(null); }
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    if (!jobId) writeFloorPlanImportHint(window.localStorage, null);
    setResumeJobId(jobId);
    setResumeFileName(lastUpload && lastUpload.id === jobId ? lastUpload.fileName : null);
    setLastUpload(null);
    setIgnoredRequest(request);
    setActiveImportJobId(jobId);
    setHistoryRefreshKey((value) => value + 1);
  }, [request, activeImportJobId, lastUpload]);

  const recordActiveImportJob = useCallback((jobId: string | null) => {
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    if (!jobId) writeFloorPlanImportHint(window.localStorage, null);
    setActiveImportJobId(jobId);
    if (!jobId) setActiveJobSnapshot(null);
    setHistoryRefreshKey((value) => value + 1);
  }, []);

  const recordJobUpdate = useCallback((job: ConsumerFloorPlanImportJob) => {
    writeFloorPlanImportHint(window.localStorage, floorPlanImportHintFor(job, accountKey));
    setActiveJobSnapshot(job);
    setActiveImportJobId(job.id);
  }, [accountKey]);

  const activeRequest = request !== ignoredRequest ? request : null;
  return {
    activeRequest, resumeJobId, resumeFileName, lastUpload, activeImportJobId, historyRefreshKey,
    activeJobSnapshot, reviewSession, selectImportJob, recordActiveImportJob, recordJobUpdate,
  };
}
