import {
  recordGLBModelPipelineStage,
  reportGLBModelLoadState,
} from "./modelDiagnostics";
import type { GLBModelLifecycleHandle } from "./modelLifecycleTypes";
import {
  measureGLBMainThreadWork,
  recordGLBMainThreadCounter,
} from "./glbMainThreadTelemetryFacade";

export function reportGLBSceneAttachmentReady(
  handle: GLBModelLifecycleHandle,
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void,
) {
  measureGLBMainThreadWork("scene-attachment", () => {
    recordGLBMainThreadCounter("sceneAttachments");
    recordGLBModelPipelineStage(handle, "scene-attached");
    reportGLBModelLoadState(handle, "ready", onLoadStateChange);
  });
}
