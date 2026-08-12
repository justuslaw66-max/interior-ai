import {
  FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID,
  FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID,
} from "@/lib/floor-plan-upload-dialog-focus";
import { FloorPlanWorkspaceOpener } from "../FloorPlanWorkspaceOpener";

type EmptyFloorPlanProUploadActionProps = {
  isDesigner: boolean;
  canEdit: boolean;
  className: string;
  onSelectUploadMode: () => void;
};

export function EmptyFloorPlanProUploadAction({
  isDesigner,
  canEdit,
  className,
  onSelectUploadMode,
}: EmptyFloorPlanProUploadActionProps) {
  return (
    <FloorPlanWorkspaceOpener
      semanticId={FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID}
      isDesigner={isDesigner}
      onSelectUploadMode={onSelectUploadMode}
      data-testid="plan-start-upload"
      className={className}
      disabled={!canEdit}
    >
      Upload plan
    </FloorPlanWorkspaceOpener>
  );
}

type EmptyFloorPlanSurfacesActionsProps = {
  dark: boolean;
  isDesigner: boolean;
  progressActionClass: string;
  progressSecondaryActionClass: string;
  progressMetaClass: string;
  onOpenTemplatePicker: () => void;
  onStartDrawRoomSetup: () => void;
  onSelectUploadMode: () => void;
  onAddDesignerRoom: () => void;
};

export function EmptyFloorPlanSurfacesActions({
  dark,
  isDesigner,
  progressActionClass,
  progressSecondaryActionClass,
  progressMetaClass,
  onOpenTemplatePicker,
  onStartDrawRoomSetup,
  onSelectUploadMode,
  onAddDesignerRoom,
}: EmptyFloorPlanSurfacesActionsProps) {
  return (
    <div
      data-testid="surfaces-start-state"
      className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg border border-neutral-200 bg-white p-3"}
    >
      <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-950"}>
        Choose a room before applying finishes
      </div>
      <div className={progressMetaClass}>Start from a template, draw a room, or upload a plan.</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className={progressActionClass} onClick={onOpenTemplatePicker}>
          Templates
        </button>
        <button type="button" className={progressSecondaryActionClass} onClick={onStartDrawRoomSetup}>
          Draw room
        </button>
        <FloorPlanWorkspaceOpener
          semanticId={FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID}
          isDesigner={isDesigner}
          onSelectUploadMode={onSelectUploadMode}
          data-testid="floor-plan-surfaces-upload"
          className={progressSecondaryActionClass}
        >
          Upload plan
        </FloorPlanWorkspaceOpener>
        <button type="button" className={progressSecondaryActionClass} onClick={onAddDesignerRoom}>
          Blank room
        </button>
      </div>
    </div>
  );
}
