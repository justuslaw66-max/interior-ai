import { flushSync } from "react-dom";
import { track } from "@/lib/analytics";
import {
  captureFloorPlanWorkspaceOpener,
  forwardFloorPlanWorkspaceOpener,
} from "@/lib/floor-plan-upload-dialog-focus";

export function openFloorPlanUploadWorkspace(
  semanticOpenerId: string | undefined,
  isDesigner: boolean,
  selectUploadMode: () => void
) {
  const openerId = semanticOpenerId ?? captureFloorPlanWorkspaceOpener();
  track("launch_path_selected", {
    path: "upload",
    source: isDesigner ? "pro_plan_tools" : "consumer_room_setup",
  });
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
