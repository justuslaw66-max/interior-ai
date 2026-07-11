import {
  getCabinetWallBedDisplayState,
  isCabinetWallBedPanel,
} from "./convertibleLayout";
import { generateCabinetParts } from "./generateCabinetParts";
import type { CabinetDefinition, CabinetPart } from "./types";

const CABINET_CLEARANCE_PREVIEW_PART_TYPES = new Set<CabinetPart["type"]>([
  "sink_cutout_template",
  "plumbing_chase_void",
  "laundry_appliance_clearance",
  "laundry_utility_chase",
  "cable_grommet_template",
  "desk_power_chase",
  "media_cable_chase",
  "media_vent_slot_template",
]);

// These components remain in generated parts, the BOM, documentation, and
// fabrication semantics. They sit behind closed fronts in the finished cabinet,
// so drawing their simplified marker boxes in the consumer preview only creates
// exterior z-fighting or exposes hardware that should be concealed.
const CABINET_CONCEALED_HARDWARE_PREVIEW_PART_TYPES = new Set<CabinetPart["type"]>([
  "door_hinge_pair",
  "drawer_slide_pair",
]);

export function getCabinetVisiblePreviewParts(
  definition: CabinetDefinition,
  generatedParts: readonly CabinetPart[] = generateCabinetParts(definition),
  options: { showClearances?: boolean } = {}
): CabinetPart[] {
  const moduleById = new Map(
    definition.modules.map((module) => [module.id, module])
  );
  return generatedParts.filter((part) => {
    if (CABINET_CONCEALED_HARDWARE_PREVIEW_PART_TYPES.has(part.type)) {
      return false;
    }
    if (options.showClearances === false && CABINET_CLEARANCE_PREVIEW_PART_TYPES.has(part.type)) {
      return false;
    }
    const cabinetModule = moduleById.get(part.moduleId);
    if (!cabinetModule || !isCabinetWallBedPanel(cabinetModule)) return true;
    const displayState = getCabinetWallBedDisplayState(cabinetModule);
    if (part.type === "convertible_panel") {
      const partState = part.metadata?.state;
      return displayState === "open"
        ? partState === "deployed"
        : partState === "closed";
    }
    if (part.type === "support_leg") return displayState === "open";
    return true;
  });
}
