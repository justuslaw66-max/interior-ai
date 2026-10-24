"use client";

import { Button } from "@/components/ui/Button";
import { FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID } from "@/lib/floor-plan-upload-dialog-focus";
import { PLAN_START_TEMPLATE_ACTION_ID } from "@/lib/start-templates-request";

type RoomSetupStartActionsProps = {
  canEdit: boolean;
  actions: {
    chooseTemplate: () => void;
    drawRoom: () => void;
    uploadFloorPlan: () => void;
  };
};

/**
 * The other ways to start, under the room card: a template (Start a new design's, ST8), a measured
 * room, or a floor plan.
 * Upload floor plan is one visible line here, as in the Plan mockup (audit finding ST2); it was
 * a "Choose a file" tile in a section that started collapsed. The two actions are 44px Buttons that
 * share each line by label (UX 5n), and Upload floor plan is the app's link, 44px tall.
 */
export function RoomSetupStartActions({
  canEdit,
  actions,
}: RoomSetupStartActionsProps) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          id={PLAN_START_TEMPLATE_ACTION_ID}
          data-testid="plan-start-template"
          className="grow"
          disabled={!canEdit}
          onClick={actions.chooseTemplate}
        >
          Choose a template
        </Button>
        <Button
          data-testid="plan-start-draw"
          className="grow"
          disabled={!canEdit}
          onClick={actions.drawRoom}
        >
          Draw measured room
        </Button>
      </div>
      <p className="mt-2 text-center text-[13px] text-label-secondary">
        Have a floor plan?{" "}
        <Button
          variant="link"
          size="inline"
          id={FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID}
          data-testid="plan-tool-import-2d"
          className="min-h-11"
          disabled={!canEdit}
          onClick={actions.uploadFloorPlan}
        >
          Upload floor plan
        </Button>
      </p>
    </>
  );
}
