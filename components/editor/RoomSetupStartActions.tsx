"use client";

import { FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID } from "@/lib/floor-plan-upload-dialog-focus";

type RoomSetupStartActionsProps = {
  dark: boolean;
  canEdit: boolean;
  secondaryActionClass: string;
  actions: {
    chooseTemplate: () => void;
    drawRoom: () => void;
    uploadFloorPlan: () => void;
  };
};

/**
 * The other ways to start, under the room card: a template, a measured room, or a floor plan.
 * Upload floor plan is one visible line here, as in the Plan mockup (audit finding ST2); it was
 * a "Choose a file" tile in a section that started collapsed. The link is the same blue in the
 * Pro theme, whose work surfaces are light too.
 */
export function RoomSetupStartActions({
  dark,
  canEdit,
  secondaryActionClass,
  actions,
}: RoomSetupStartActionsProps) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="plan-start-template"
          className={secondaryActionClass}
          disabled={!canEdit}
          onClick={actions.chooseTemplate}
        >
          Choose a template
        </button>
        <button
          type="button"
          data-testid="plan-start-draw"
          className={secondaryActionClass}
          disabled={!canEdit}
          onClick={actions.drawRoom}
        >
          Draw measured room
        </button>
      </div>
      <p className={`mt-2 text-center text-[13px] ${dark ? "text-neutral-400" : "text-neutral-600"}`}>
        Have a floor plan?{" "}
        <button
          id={FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID}
          type="button"
          data-testid="plan-tool-import-2d"
          className="inline-flex min-h-11 items-center font-bold text-blue-700 underline-offset-2 hover:underline focus-visible:underline disabled:opacity-50"
          disabled={!canEdit}
          onClick={actions.uploadFloorPlan}
        >
          Upload floor plan
        </button>
      </p>
    </>
  );
}
