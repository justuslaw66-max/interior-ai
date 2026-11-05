import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import { floorPlanImportResponseJson } from "./useConsumerFloorPlanImportSession";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import type { ReviewHomeTypeId } from "@/lib/floor-plan-imports/review-home-type";

type CreationInput = {
  activeJob: ConsumerFloorPlanImportJob | null;
  title: string;
  beginAction: () => AbortSignal;
  setSubmitting: (value: boolean) => void;
  setCreateError: (value: string | null) => void;
  onActiveJobIdChange?: (id: string | null) => void;
};

export function useConsumerFloorPlanImportCreation({ activeJob, title, beginAction, setSubmitting, setCreateError, onActiveJobIdChange }: CreationInput) {
  const router = useRouter();
  // homeType: the one chosen on the ready card, when it isn't the one the card started on; the server applies it.
  return useCallback(async (homeType: ReviewHomeTypeId | null = null) => {
    if (!activeJob || activeJob.status !== "ready") return;
    const signal = beginAction();
    setSubmitting(true);
    setCreateError(null);
    try {
      // Confirmation can finish server-side after closure; suppress its stale UI effects.
      const payload = await floorPlanImportResponseJson(await fetch(`/api/floor-plan-imports/${activeJob.id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, candidateVersion: activeJob.candidateVersion, ...(homeType ? { homeType } : {}) }),
      }));
      signal.throwIfAborted();
      const id = typeof payload.id === "string" ? payload.id : null;
      if (!id) throw new Error("The new design ID is missing");
      onActiveJobIdChange?.(null);
      // The new design opens in Plan, in 2D, with a note on what to check (audit finding ST5).
      router.push(buildDesignEditorUrl({ designId: id, view: "2d", floorPlanImportId: activeJob.id }));
    } catch (cause) {
      if (signal.aborted) return;
      setCreateError(userFacingErrorMessage(cause, "Unable to create the new design"));
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }, [activeJob, title, beginAction, setSubmitting, setCreateError, onActiveJobIdChange, router]);
}
