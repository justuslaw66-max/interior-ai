import { HOUSE_ROOM_TEMPLATES } from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";
import type { DesignControlsPlanPanelProps } from "./DesignControlsPlanPanel.types";

type AddRoomTemplateTilesProps = {
  canEdit: boolean;
  measurementUnit: PlanMeasurementUnit;
  onAddRoomTemplate: DesignControlsPlanPanelProps["onAddRoomTemplate"];
};

/**
 * "Add one room", under "Choose a template" in the palette's Templates (UX audit ST8, J 5 Oct):
 * Plan's template list went to Start a new design, and these were the rest of it.
 */
export function AddRoomTemplateTiles({ canEdit, measurementUnit, onAddRoomTemplate }: AddRoomTemplateTilesProps) {
  return (
    <div
      role="group"
      aria-labelledby="add-room-templates-title"
      className="border-t border-neutral-100 bg-white p-2"
    >
      <div id="add-room-templates-title" className="text-xs font-semibold text-neutral-800">
        Add one room
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">
        Use these when you only need one extra room.
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {HOUSE_ROOM_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            data-testid={`add-room-template-${template.id}`}
            onClick={() => onAddRoomTemplate(template)}
            disabled={!canEdit}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block">{template.label}</span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              {formatPlanDimensionsLabel(template.width, template.depth, measurementUnit)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
