import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import { floorPlanImportResponseJson } from "./useConsumerFloorPlanImportSession";

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
  return useCallback(async () => {
    if (!activeJob || activeJob.status !== "ready") return;
    const signal = beginAction();
    setSubmitting(true);
    setCreateError(null);
    try {
      // Confirmation can finish server-side after closure; suppress its stale UI effects.
      const payload = await floorPlanImportResponseJson(await fetch(`/api/floor-plan-imports/${activeJob.id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, candidateVersion: activeJob.candidateVersion }),
      }));
      signal.throwIfAborted();
      const id = typeof payload.id === "string" ? payload.id : null;
      if (!id) throw new Error("The new design ID is missing");
      onActiveJobIdChange?.(null);
      router.push(`/design?designId=${encodeURIComponent(id)}&view=2d&workspace=furnish&floorPlanImport=${encodeURIComponent(activeJob.id)}`);
    } catch (cause) {
      if (signal.aborted) return;
      setCreateError(cause instanceof Error ? cause.message : "Unable to create the new design");
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }, [activeJob, title, beginAction, setSubmitting, setCreateError, onActiveJobIdChange, router]);
}
