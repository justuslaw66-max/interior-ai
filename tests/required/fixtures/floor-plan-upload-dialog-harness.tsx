import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";

const CHILD_OPENER_ID = "floor-plan-test-child-opener";
const childPortalHost = document.createElement("div");
childPortalHost.dataset.testid = "floor-plan-child-portal-host";
document.body.append(childPortalHost);

function FloorPlanChildHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid="floor-plan-child-harness"
      style={{ position: "fixed", right: 80, top: 80, zIndex: 1001 }}
    >
      <button
        id={CHILD_OPENER_ID}
        type="button"
        data-testid="floor-plan-open-child-dialog"
        onClick={() => setOpen(true)}
      >
        Open registered child
      </button>
      {createPortal(
        <EditorDialog
          open={open}
          title="Floor Plan child fixture"
          onClose={() => setOpen(false)}
          testId="floor-plan-child-dialog"
          closeButtonTestId="floor-plan-child-close"
          returnFocusIds={[CHILD_OPENER_ID]}
          cancelFocusRestorationOnUnmount
          manageBackground
          lockBodyScroll
        >
          <button type="button">Child action</button>
        </EditorDialog>,
        childPortalHost
      )}
    </div>
  );
}

const host = document.createElement("div");
host.dataset.testid = "floor-plan-child-harness-host";
const hostOwner =
  document.querySelector('[data-testid="floor-plan-import-dialog-panel"]') ??
  document.body;
hostOwner?.append(host);
createRoot(host).render(
  <StrictMode>
    <FloorPlanChildHarness />
  </StrictMode>
);
