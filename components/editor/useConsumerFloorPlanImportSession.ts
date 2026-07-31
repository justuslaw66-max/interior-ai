"use client";

import { useEffect, useRef, useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanImportStatus,
  FloorPlanReviewIssue,
} from "@/lib/floor-plan-imports/types";
import {
  isPausedFloorPlanImportStatus,
  startAndPollFloorPlanImport,
} from "@/lib/floor-plan-import-client";
import type {
  ConsumerFloorPlanImportJob,
  ConsumerFloorPlanImportProgressEstimate,
} from "./floor-plan-import-ui-types";

export type ConsumerFloorPlanImportState =
  | { kind: "idle" }
  | {
      kind: "working";
      message: string;
      progress: number;
      status?: FloorPlanImportStatus;
      estimate?: ConsumerFloorPlanImportProgressEstimate;
    }
  | { kind: "job"; job: ConsumerFloorPlanImportJob }
  | {
      kind: "error";
      message: string;
      authenticationRequired?: boolean;
      resumableJobId?: string;
    };

export function parseFloorPlanImportDocument(value: unknown): FloorPlanDocumentV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<FloorPlanDocumentV2>;
  return candidate.schemaVersion === 2 && candidate.units === "mm"
    ? (value as FloorPlanDocumentV2)
    : null;
}

export function parseFloorPlanImportIssues(value: unknown): FloorPlanReviewIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (issue): issue is FloorPlanReviewIssue =>
      Boolean(issue) &&
      typeof issue === "object" &&
      typeof (issue as FloorPlanReviewIssue).id === "string"
  );
}

export async function floorPlanImportResponseJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw Object.assign(
      new Error(typeof payload.error === "string" ? payload.error : "Floor-plan import failed"),
      { status: response.status }
    );
  }
  return payload;
}

export async function loadConsumerFloorPlanImportJob(
  statusUrl: string,
  signal?: AbortSignal
) {
  const payload = await floorPlanImportResponseJson(
    await fetch(statusUrl, { signal, cache: "no-store" })
  );
  const job = (payload.job ?? null) as ConsumerFloorPlanImportJob;
  if (payload.progressEstimate && typeof payload.progressEstimate === "object") {
    job.progressEstimate =
      payload.progressEstimate as ConsumerFloorPlanImportProgressEstimate;
  }
  return job;
}

function progressMessage(status: FloorPlanImportStatus) {
  const messages: Partial<Record<FloorPlanImportStatus, string>> = {
    received: "Upload received",
    rendered: "Pages rendered",
    extracted: "Reading labels and source linework",
    selecting_page: "Waiting for source-page selection",
    scale_solved: "Scale checked against printed dimensions",
    topology_built: "Building rooms, walls and openings",
    validating: "Checking geometry",
  };
  return messages[status] ?? "Processing floor plan";
}

export function useConsumerFloorPlanImportSession(input: {
  file: File | null;
  resumeJobId: string | null;
  trainingBenchmarkOptIn: boolean;
  onActiveJobIdChange?: (jobId: string | null) => void;
  onJobUpdate?: (job: ConsumerFloorPlanImportJob) => void;
}) {
  const {
    file,
    resumeJobId,
    trainingBenchmarkOptIn,
    onActiveJobIdChange,
    onJobUpdate,
  } = input;
  const runIdRef = useRef(0);
  const [state, setState] = useState<ConsumerFloorPlanImportState>({ kind: "idle" });
  const [candidate, setCandidate] = useState<FloorPlanDocumentV2 | null>(null);
  const [issues, setIssues] = useState<FloorPlanReviewIssue[]>([]);
  const [title, setTitle] = useState("Imported floor plan");

  useEffect(() => {
    if (!file && !resumeJobId) {
      setState({ kind: "idle" });
      return;
    }
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    setCandidate(null);
    setIssues([]);
    if (file) setTitle(file.name.replace(/\.[^.]+$/, "") || "Imported floor plan");

    const loadJob = async (statusUrl: string) => {
      const job = await loadConsumerFloorPlanImportJob(
        statusUrl,
        controller.signal
      );
      onJobUpdate?.(job);
      return job;
    };

    const run = async () => {
      let recoveryJobId: string | null = resumeJobId;
      try {
        let next: { processUrl?: string; statusUrl?: string } | undefined;
        if (file) {
          setState({ kind: "working", message: "Uploading securely", progress: 2 });
          const formData = new FormData();
          formData.set("file", file);
          formData.set("trainingBenchmarkOptIn", trainingBenchmarkOptIn ? "true" : "false");
          const created = await floorPlanImportResponseJson(
            await fetch("/api/floor-plan-imports", {
              method: "POST",
              body: formData,
              signal: controller.signal,
            })
          );
          next = created.next as { processUrl?: string; statusUrl?: string } | undefined;
          const createdJob = created.job as { id?: unknown } | undefined;
          if (typeof createdJob?.id === "string") {
            recoveryJobId = createdJob.id;
            onActiveJobIdChange?.(createdJob.id);
          }
        } else {
          setState({ kind: "working", message: "Resuming private import", progress: 5 });
          next = {
            processUrl: `/api/floor-plan-imports/${encodeURIComponent(resumeJobId!)}/process`,
            statusUrl: `/api/floor-plan-imports/${encodeURIComponent(resumeJobId!)}`,
          };
          onActiveJobIdChange?.(resumeJobId);
        }
        if (!next?.processUrl || !next.statusUrl) throw new Error("Import job links are missing");

        let job = await loadJob(next.statusUrl);
        const sourceName = job.sourceAsset?.fileName;
        if (!file && sourceName) setTitle(sourceName.replace(/\.[^.]+$/, "") || "Imported floor plan");
        if (!isPausedFloorPlanImportStatus(job.status)) {
          setState({
            kind: "working",
            message: job.progressEstimate?.stageLabel ?? progressMessage(job.status),
            progress: job.progressEstimate?.estimatedPercent ?? job.progress,
            status: job.status,
            estimate: job.progressEstimate,
          });
          job = await startAndPollFloorPlanImport({
            initialJob: job,
            startProcessing: async () =>
              floorPlanImportResponseJson(
                await fetch(next.processUrl!, { method: "POST" })
              ),
            loadJob: () => loadJob(next.statusUrl!),
            signal: controller.signal,
            onProgress: (pendingJob) => {
              if (runIdRef.current !== runId) return;
              onJobUpdate?.(pendingJob);
              const nextProgress =
                pendingJob.progressEstimate?.estimatedPercent ??
                pendingJob.progress;
              setState((current) => ({
                kind: "working",
                message:
                  pendingJob.progressEstimate?.stageLabel ??
                  progressMessage(pendingJob.status),
                progress:
                  current.kind === "working" &&
                  current.status === pendingJob.status
                    ? Math.max(current.progress, nextProgress)
                    : nextProgress,
                status: pendingJob.status,
                estimate: pendingJob.progressEstimate,
              }));
            },
          });
        } else {
          onJobUpdate?.(job);
        }
        if (runIdRef.current !== runId) return;
        setCandidate(parseFloorPlanImportDocument(job.candidateJson));
        setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
        setState({ kind: "job", job });
      } catch (cause) {
        if (controller.signal.aborted || runIdRef.current !== runId) return;
        const error = cause as Error & { status?: number };
        if (error.status === 404 && !file) onActiveJobIdChange?.(null);
        const isCad = Boolean(file && /\.(dxf|ifc|ifcstep|stp|step|dwg)$/i.test(file.name));
        setState({
          kind: "error",
          message: error.status === 401
            ? isCad
              ? "Sign in to privately extract and review this CAD plan."
              : "Sign in to privately detect, review, and save this plan."
            : error.message,
          authenticationRequired: error.status === 401,
          ...(recoveryJobId ? { resumableJobId: recoveryJobId } : {}),
        });
      }
    };

    void run();
    return () => controller.abort();
  }, [
    file,
    onActiveJobIdChange,
    onJobUpdate,
    resumeJobId,
    trainingBenchmarkOptIn,
  ]);

  return {
    state,
    setState,
    candidate,
    setCandidate,
    issues,
    setIssues,
    title,
    setTitle,
  };
}
