import { flushSync } from "react-dom";
import { track } from "@/lib/analytics";
import {
  captureFloorPlanWorkspaceOpener,
  forwardFloorPlanWorkspaceOpener,
} from "@/lib/floor-plan-upload-dialog-focus";
import type { FloorPlanUploadSource } from "@/lib/floor-plan-upload-request";

/** Opens the upload window from Plan, recording where the upload started. */
export function openFloorPlanUploadWorkspace(
  semanticOpenerId: string | undefined,
  source: FloorPlanUploadSource,
  selectUploadMode: () => void
) {
  const openerId = semanticOpenerId ?? captureFloorPlanWorkspaceOpener();
  track("launch_path_selected", { path: "upload", source });
  flushSync(selectUploadMode);
  const uploadPanel = document.getElementById("floor-plan-upload");
  const uploadInput = uploadPanel?.querySelector<HTMLInputElement>(
    '[data-testid="floor-plan-upload-input"]'
  );
  const launcher = uploadPanel?.querySelector<HTMLButtonElement>(
    '[data-testid="floor-plan-import-workspace-launcher"]'
  );
  if (launcher) {
    forwardFloorPlanWorkspaceOpener(launcher, openerId);
  } else if (uploadInput) {
    forwardFloorPlanWorkspaceOpener(uploadInput, openerId);
    window.requestAnimationFrame(() => {
      uploadPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}
