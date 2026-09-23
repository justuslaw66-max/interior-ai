import { useCallback, useEffect, useMemo, useState } from "react";
import { fingerprintFloorPlanAdminReviewDraft } from "@/lib/floor-plan-admin-review-draft";
import {
  isFloorPlanMvpBlockingIssue,
  isFloorPlanMvpSuggestionIssue,
} from "@/lib/floor-plan-imports/types";
import { notifyFloorPlanAdminJobUpdated } from "@/lib/floor-plan-admin-review-events";
import {
  asFloorPlanDocumentV2,
  buildFloorPlanAdminSourceOverlay,
  type FloorPlanAdminSourceOverlay,
} from "@/lib/floor-plan-imports/admin-review";
import {
  createConstructionEvidenceDraft,
  emptyBinding,
  getRenderedPages,
  getReviewIssues,
  withDefaultReviewIssueResolutions,
} from "./floorPlanReviewModel";
import {
  approveFloorPlanRevision,
  loadFloorPlanAdminJob,
  publishFloorPlanRevision,
  retireFloorPlanRevision,
  saveFloorPlanCandidate,
} from "./floorPlanReviewRequests";
import type {
  AdminJob,
  Feedback,
  PublicDisplayMetadataDraft,
  ReviewIssue,
  VerificationTier,
} from "./floorPlanReviewTypes";
import { useFloorPlanReviewDraftGuard } from "./useFloorPlanReviewDraftGuard";

const EMPTY_OVERLAY: FloorPlanAdminSourceOverlay = {
  evidence: [],
  walls: [],
  calibrations: [],
  anchorResiduals: [],
  anchorIssues: [],
};

const EMPTY_PUBLIC_DISPLAY_METADATA: PublicDisplayMetadataDraft = {
  projectName: "",
  label: "",
  flatType: "",
  floorAreaSqm: "",
  previewUrl: "",
  sourceUrl: "",
  sourceTitle: "",
  sourcePage: "",
  publisher: "",
};

export function useFloorPlanReviewWorkspace(jobId: string) {
  const [job, setJob] = useState<AdminJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [candidateText, setCandidateText] = useState("");
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [correctionNote, setCorrectionNote] = useState("");
  const [reviewBaseline, setReviewBaseline] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(null);
  const [showWalls, setShowWalls] = useState(true);
  const [showEvidence, setShowEvidence] = useState(true);
  const [verificationTier, setVerificationTier] =
    useState<VerificationTier>("source_verified");
  const [constructionEvidenceText, setConstructionEvidenceText] = useState("{}");
  const [publicDisplayMetadata, setPublicDisplayMetadata] = useState(
    EMPTY_PUBLIC_DISPLAY_METADATA
  );
  const [bindings, setBindings] = useState([emptyBinding()]);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [supersedesRevisionId, setSupersedesRevisionId] = useState("");
  const [supersedeReason, setSupersedeReason] = useState("");
  const [supersedeConfirmed, setSupersedeConfirmed] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [retireConfirmation, setRetireConfirmation] = useState("");

  const hydrate = useCallback((next: AdminJob) => {
    const nextCandidateText = next.candidateJson
      ? JSON.stringify(next.candidateJson, null, 2)
      : "";
    const nextIssues = getReviewIssues(next.reviewIssuesJson);
    const pages = getRenderedPages(next.renderedPagesJson);
    setJob(next);
    setCandidateText(nextCandidateText);
    setIssues(nextIssues);
    setCorrectionNote("");
    setSelectedPageNumber((current) =>
      current && pages.some((page) => page.pageNumber === current)
        ? current
        : (pages[0]?.pageNumber ?? null)
    );
    setReviewBaseline(
      fingerprintFloorPlanAdminReviewDraft({
        candidateText: nextCandidateText,
        issues: nextIssues,
        correctionNote: "",
      })
    );
    const document = asFloorPlanDocumentV2(next.candidateJson);
    if (document) {
      setConstructionEvidenceText((current) =>
        current !== "{}"
          ? current
          : createConstructionEvidenceDraft()
      );
    }
  }, []);

  const reload = useCallback(
    async (canHydrate: () => boolean = () => true) => {
      const next = await loadFloorPlanAdminJob(jobId);
      if (!canHydrate()) return false;
      hydrate(next);
      return true;
    },
    [hydrate, jobId]
  );

  useEffect(() => {
    let active = true;
    reload()
      .catch(
        (error: Error) =>
          active && setFeedback({ tone: "error", message: error.message })
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reload]);

  const draftFingerprint = useMemo(
    () =>
      fingerprintFloorPlanAdminReviewDraft({
        candidateText,
        issues,
        correctionNote,
      }),
    [candidateText, correctionNote, issues]
  );
  const { guardedReload, hasUnsavedChanges } = useFloorPlanReviewDraftGuard({
    jobId,
    baselineFingerprint: reviewBaseline,
    draftFingerprint,
    reload,
    onError: (message) => setFeedback({ tone: "error", message }),
    onPreserved: (message) => setFeedback({ tone: "info", message }),
  });

  const refreshReview = useCallback(async () => {
    setPending("reload");
    setFeedback(null);
    try {
      await guardedReload();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to refresh import",
      });
    } finally {
      setPending(null);
    }
  }, [guardedReload]);

  const pages = useMemo(
    () => getRenderedPages(job?.renderedPagesJson),
    [job?.renderedPagesJson]
  );
  const selectedPage =
    pages.find((page) => page.pageNumber === selectedPageNumber) ?? null;
  const candidate = useMemo(() => {
    try {
      return candidateText ? (JSON.parse(candidateText) as unknown) : null;
    } catch {
      return null;
    }
  }, [candidateText]);
  const document = useMemo(() => asFloorPlanDocumentV2(candidate), [candidate]);
  const overlay = useMemo(
    () =>
      selectedPageNumber
        ? buildFloorPlanAdminSourceOverlay(candidate, selectedPageNumber)
        : EMPTY_OVERLAY,
    [candidate, selectedPageNumber]
  );
  const rooms =
    document?.floors.flatMap((floor, floorIndex) =>
      floor.rooms.map((room, roomIndex) => ({
        floor,
        floorIndex,
        room,
        roomIndex,
      }))
    ) ?? [];
  const unresolvedCriticalCount = issues.filter(isFloorPlanMvpBlockingIssue).length;
  const issuesForSave = useMemo(
    () => withDefaultReviewIssueResolutions(issues, document),
    [document, issues]
  );
  const missingResolution = issuesForSave.some(
    (issue) =>
      issue.severity === "critical" &&
      !isFloorPlanMvpSuggestionIssue(issue) &&
      issue.resolved &&
      !issue.resolution?.trim()
  );
  const reviewable = Boolean(
    job &&
      !job.revision &&
      ["needs_review", "ready", "validating"].includes(job.status) &&
      candidate
  );

  const run = useCallback(
    async (name: string, action: () => Promise<void>) => {
      setPending(name);
      setFeedback(null);
      try {
        await action();
        notifyFloorPlanAdminJobUpdated(jobId, { origin: "review_workspace" });
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Action failed",
        });
      } finally {
        setPending(null);
      }
    },
    [jobId]
  );

  const updateRoom = (
    floorIndex: number,
    roomIndex: number,
    field: "name" | "roomType",
    value: string
  ) => {
    if (!document) return;
    const next = structuredClone(document);
    next.floors[floorIndex].rooms[roomIndex][field] = value;
    setCandidateText(JSON.stringify(next, null, 2));
  };

  const saveCorrections = () =>
    run("save", async () => {
      if (!job) return;
      const payload = await saveFloorPlanCandidate({
        job,
        candidateText,
        issues: issuesForSave,
        correctionNote,
        missingResolution,
      });
      await reload();
      setCorrectionNote("");
      setFeedback({
        tone: "success",
        message: `Candidate v${payload?.candidateVersion} saved and revalidated.`,
      });
    });

  const approve = () =>
    run("approve", async () => {
      if (!job) return;
      const supersededRevision = supersedesRevisionId.trim();
      const payload = await approveFloorPlanRevision({
        job,
        bindings,
        verificationTier,
        constructionEvidenceText,
        publicDisplayMetadata,
        supersedesRevisionId,
        supersedeReason,
        supersedeConfirmed,
        hasUnsavedChanges,
      });
      await reload();
      setFeedback({
        tone: "success",
        message: payload?.awaitingPublication
          ? `Revision ${payload.revision?.id ?? "created"} is approved to replace ${payload.supersededRevisionId ?? supersededRevision}; a different publisher must now publish it atomically.`
          : `Immutable revision ${payload?.revision?.id ?? "created"} passed the server gates.`,
      });
    });

  const publish = () =>
    run("publish", async () => {
      if (!job) return;
      if (!publishConfirmed) {
        throw new Error("Confirm public library publication first");
      }
      const payload = await publishFloorPlanRevision(job.id);
      await reload();
      setFeedback({
        tone: "success",
        message: `Revision ${payload?.revisionId ?? ""} is published.`,
      });
    });

  const retire = () =>
    run("retire", async () => {
      if (!job?.revision) {
        throw new Error("No immutable revision is available to retire");
      }
      if (retireReason.trim().length < 10) {
        throw new Error(
          "Describe why this floor plan must be withdrawn (at least 10 characters)"
        );
      }
      const requiredConfirmation = `RETIRE ${job.revision.id}`;
      if (retireConfirmation.trim() !== requiredConfirmation) {
        throw new Error(`Type ${requiredConfirmation} exactly to confirm`);
      }
      const payload = await retireFloorPlanRevision({
        revisionId: job.revision.id,
        jobId: job.id,
        reason: retireReason,
        confirmation: retireConfirmation,
      });
      await reload();
      setRetireReason("");
      setRetireConfirmation("");
      setFeedback({
        tone: "success",
        message: `Revision ${payload?.revisionId ?? job.revision.id} was withdrawn from the public library. Existing saved designs remain usable.`,
      });
    });

  return {
    approve,
    bindings,
    candidateText,
    constructionEvidenceText,
    correctionNote,
    document,
    feedback,
    hasUnsavedChanges,
    issues,
    job,
    loading,
    missingResolution,
    overlay,
    pages,
    pending,
    publish,
    publishConfirmed,
    publicDisplayMetadata,
    refreshReview,
    reload,
    retire,
    retireConfirmation,
    retireReason,
    reviewable,
    rooms,
    saveCorrections,
    selectedPage,
    selectedPageNumber,
    setBindings,
    setCandidateText,
    setConstructionEvidenceText,
    setCorrectionNote,
    setIssues,
    setPublishConfirmed,
    setPublicDisplayMetadata,
    setRetireConfirmation,
    setRetireReason,
    setSelectedPageNumber,
    setShowEvidence,
    setShowWalls,
    setSupersedeConfirmed,
    setSupersedeReason,
    setSupersedesRevisionId,
    setVerificationTier,
    showEvidence,
    showWalls,
    supersedeConfirmed,
    supersedeReason,
    supersedesRevisionId,
    unresolvedCriticalCount,
    updateRoom,
    verificationTier,
  };
}
