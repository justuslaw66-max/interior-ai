import {
  FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID,
  FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID,
} from "@/lib/floor-plan-upload-dialog-focus";
import { requestStartTemplates, SURFACES_START_TEMPLATE_ACTION_ID } from "@/lib/start-templates-request";
import { FloorPlanWorkspaceOpener } from "../FloorPlanWorkspaceOpener";
import { Button, buttonClassName } from "@/components/ui/Button";

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
      Upload floor plan
    </FloorPlanWorkspaceOpener>
  );
}

type EmptyFloorPlanSurfacesActionsProps = {
  isDesigner: boolean;
  progressMetaClass: string;
  onStartDrawRoomSetup: () => void;
  onSelectUploadMode: () => void;
  onAddDesignerRoom: () => void;
};

export function EmptyFloorPlanSurfacesActions({
  isDesigner,
  progressMetaClass,
  onStartDrawRoomSetup,
  onSelectUploadMode,
  onAddDesignerRoom,
}: EmptyFloorPlanSurfacesActionsProps) {
  return (
    <div
      data-testid="surfaces-start-state"
      className="rounded-lg border border-box-border bg-field p-3"
    >
      <div className="text-sm font-semibold text-label">
        Choose a room before applying finishes
      </div>
      <div className={progressMetaClass}>Choose a template, draw a room, or upload a floor plan.</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button id={SURFACES_START_TEMPLATE_ACTION_ID} variant="primary" size="compact" className="grow"
          onClick={() => requestStartTemplates({ openerId: SURFACES_START_TEMPLATE_ACTION_ID })}>
          Templates
        </Button>
        <Button size="compact" className="grow" onClick={onStartDrawRoomSetup}>
          Draw room
        </Button>
        <FloorPlanWorkspaceOpener
          semanticId={FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID}
          isDesigner={isDesigner}
          onSelectUploadMode={onSelectUploadMode}
          data-testid="floor-plan-surfaces-upload"
          className={buttonClassName({ size: "compact", className: "grow" })}
        >
          Upload floor plan
        </FloorPlanWorkspaceOpener>
        <Button size="compact" className="grow" onClick={onAddDesignerRoom}>
          Blank room
        </Button>
      </div>
    </div>
  );
}
