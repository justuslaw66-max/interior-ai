import { useCallback, useEffect, useRef } from "react";

/** A response may update only the upload and workspace that initiated it. */
export function useConsumerFloorPlanImportActionScope(file: File | null, resumeJobId: string | null, trainingBenchmarkOptIn: boolean) {
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => { current.current?.abort(); current.current = null; }, [file, resumeJobId, trainingBenchmarkOptIn]);
  return useCallback(() => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return controller.signal;
  }, []);
}
