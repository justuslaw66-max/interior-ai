import { HOUSE_ROOM_TEMPLATES } from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";
import type { DesignControlsPlanPanelProps } from "./DesignControlsPlanPanel.types";

type AddRoomTemplateTilesProps = {
  dark: boolean;
  canEdit: boolean;
  measurementUnit: PlanMeasurementUnit;
  onAddRoomTemplate: DesignControlsPlanPanelProps["onAddRoomTemplate"];
};

/**
 * "Add one room", under "Choose a template" in the palette's Templates (UX audit ST8, J 5 Oct):
 * Plan's template list went to Start a new design, and these were the rest of it.
 */
export function AddRoomTemplateTiles({ dark, canEdit, measurementUnit, onAddRoomTemplate }: AddRoomTemplateTilesProps) {
  return (
    <div
      role="group"
      aria-labelledby="add-room-templates-title"
      className={dark ? "designer-recessed border-t border-white/10 p-2" : "border-t border-neutral-100 bg-white p-2"}
    >
      <div id="add-room-templates-title" className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
        Add one room
      </div>
      <div className={dark ? "mt-0.5 text-xs text-neutral-400" : "mt-0.5 text-xs text-neutral-500"}>
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
            className={
              dark
                ? "designer-control rounded-lg border px-3 py-2 text-left text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                : "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            <span className="block">{template.label}</span>
            <span className={dark ? "mt-0.5 block text-xs text-neutral-400" : "mt-0.5 block text-xs text-neutral-500"}>
              {formatPlanDimensionsLabel(template.width, template.depth, measurementUnit)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
