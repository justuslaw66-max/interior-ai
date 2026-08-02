import type { CabinetDefinition } from "@/features/cabinetry/types";
import { getMillworkAssemblyProfile } from "./assemblyProfiles";
import type { MillworkAssemblyType, MillworkDefinition, MillworkFamily } from "./types";

export function getCabinetMillworkAssemblyType(
  definition: CabinetDefinition
): MillworkAssemblyType {
  if (definition.millworkAssemblyType) {
    return definition.millworkAssemblyType;
  }

  if (
    definition.modules.length > 1 &&
    definition.modules.every((module) => module.type === "base")
  ) {
    return "cabinet_run";
  }

  return definition.modules[0]?.type ?? "base";
}

export function getCabinetMillworkFamily(definition: CabinetDefinition): MillworkFamily {
  if (definition.millworkFamily) {
    return definition.millworkFamily;
  }

  const assemblyType = getCabinetMillworkAssemblyType(definition);
  if (assemblyType === "wardrobe") return "wardrobe";
  if (assemblyType === "vanity") return "vanity";
  if (assemblyType === "murphy_bed") return "murphy_bed";
  if (assemblyType === "fold_down_desk") return "home_office";
  if (assemblyType === "platform_storage_bed") return "storage_bed";
  if (assemblyType === "media_wall") return "media_wall";
  if (assemblyType === "mudroom_storage") return "mudroom";
  if (assemblyType === "home_office_built_in") return "home_office";
  if (assemblyType === "library_wall") return "library";
  if (assemblyType === "laundry_room_cabinetry") return "laundry_room";
  if (assemblyType === "window_seat") return "window_seat";
  if (assemblyType === "banquette") return "banquette";
  if (assemblyType === "closet_system") return "closet";
  if (assemblyType === "home_bar") return "bar";
  if (assemblyType === "kitchen_island") return "island";
  if (assemblyType === "pantry_system") return "pantry";
  if (assemblyType === "wine_storage") return "wine_storage";
  if (assemblyType === "pet_built_in") return "lifestyle_built_in";
  if (assemblyType === "kids_storage") return "lifestyle_built_in";
  if (assemblyType === "hobby_storage") return "lifestyle_built_in";
  if (assemblyType === "wall_paneling") return "paneling";
  if (assemblyType === "slat_wall") return "paneling";
  if (assemblyType === "ceiling_beams") return "ceiling_woodwork";
  if (assemblyType === "coffered_ceiling") return "ceiling_woodwork";
  if (assemblyType === "fireplace_surround") return "trim";
  if (assemblyType === "trim_package") return "trim";
  if (assemblyType === "under_stair_storage") return "under_stair_storage";
  if (assemblyType === "room_divider_storage") return "room_divider_storage";

  return "cabinetry";
}

export function createCabinetMillworkDefinition(
  definition: CabinetDefinition
): MillworkDefinition<CabinetDefinition> {
  const assemblyType = getCabinetMillworkAssemblyType(definition);
  const family = getCabinetMillworkFamily(definition);

  return {
    id: definition.id,
    schema: "custom_millwork.definition.v1",
    version: 1,
    family,
    assemblyType,
    assemblyProfile: getMillworkAssemblyProfile(assemblyType, family),
    displayName: definition.name,
    sourceType: "cabinet_definition",
    sourceDefinition: definition,
    dimensions: {
      width: definition.totalWidth,
      height: definition.height,
      depth: definition.depth,
      units: definition.units,
    },
    materials: definition.materials,
    hardware: definition.hardware,
    capabilities: [
      "live_3d_preview",
      "glb_export",
      "house_plan_smart_asset",
      "edit_after_placement",
      "bom",
      "material_schedule",
      "hardware_schedule",
      "quote_ready_future",
      "fabrication_ready_future",
    ],
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}
