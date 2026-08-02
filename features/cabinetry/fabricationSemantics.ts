import type {
  CabinetDefinition,
  CabinetEdgeTreatment,
  CabinetExposedFace,
  CabinetGrainDirection,
  CabinetModuleDefinition,
  CabinetPart,
  CabinetPartFabricationSpec,
  CabinetPartType,
  CabinetTreatedEdge,
} from "./types";

type CabinetCutFace = CabinetPartFabricationSpec["cutFace"];

const FRONT_CUT_FACE: CabinetCutFace = {
  widthAxis: "width",
  heightAxis: "height",
  thicknessAxis: "depth",
};
const SIDE_CUT_FACE: CabinetCutFace = {
  widthAxis: "depth",
  heightAxis: "height",
  thicknessAxis: "width",
};
const PLAN_CUT_FACE: CabinetCutFace = {
  widthAxis: "width",
  heightAxis: "depth",
  thicknessAxis: "height",
};

const CUT_FACE_BY_PART_TYPE: Record<CabinetPartType, CabinetCutFace> = {
  left_side_panel: SIDE_CUT_FACE,
  right_side_panel: SIDE_CUT_FACE,
  bottom_panel: PLAN_CUT_FACE,
  top_panel: PLAN_CUT_FACE,
  back_panel: FRONT_CUT_FACE,
  shelf: PLAN_CUT_FACE,
  vertical_divider: SIDE_CUT_FACE,
  door_front: FRONT_CUT_FACE,
  drawer_front: FRONT_CUT_FACE,
  face_frame_stile: FRONT_CUT_FACE,
  face_frame_rail: FRONT_CUT_FACE,
  drawer_box_side: SIDE_CUT_FACE,
  drawer_box_back: FRONT_CUT_FACE,
  drawer_box_bottom: PLAN_CUT_FACE,
  installation_cleat: FRONT_CUT_FACE,
  anti_tip_anchor_bracket: FRONT_CUT_FACE,
  leveling_foot: FRONT_CUT_FACE,
  toe_kick: FRONT_CUT_FACE,
  handle: FRONT_CUT_FACE,
  hanging_rod: FRONT_CUT_FACE,
  slat: FRONT_CUT_FACE,
  panel_stile: FRONT_CUT_FACE,
  panel_rail: FRONT_CUT_FACE,
  ceiling_beam: PLAN_CUT_FACE,
  trim_member: FRONT_CUT_FACE,
  trim_return: FRONT_CUT_FACE,
  trim_reveal_strip: FRONT_CUT_FACE,
  convertible_panel: FRONT_CUT_FACE,
  support_leg: SIDE_CUT_FACE,
  hinge_rail: FRONT_CUT_FACE,
  platform_deck: PLAN_CUT_FACE,
  platform_support_rib: FRONT_CUT_FACE,
  stair_scribe_panel: FRONT_CUT_FACE,
  room_divider_back_panel: FRONT_CUT_FACE,
  room_divider_stabilizer_foot: PLAN_CUT_FACE,
  lifestyle_insert_deck: PLAN_CUT_FACE,
  lifestyle_insert_lip: FRONT_CUT_FACE,
  wine_rack_vertical_divider: SIDE_CUT_FACE,
  wine_rack_horizontal_rail: PLAN_CUT_FACE,
  seat_deck_panel: PLAN_CUT_FACE,
  seat_cushion: PLAN_CUT_FACE,
  seat_back_panel: FRONT_CUT_FACE,
  mudroom_hook_rail: FRONT_CUT_FACE,
  mudroom_hook: FRONT_CUT_FACE,
  shoe_cubby_vertical_divider: SIDE_CUT_FACE,
  shoe_cubby_shelf: PLAN_CUT_FACE,
  sink_cutout_template: PLAN_CUT_FACE,
  plumbing_chase_void: FRONT_CUT_FACE,
  laundry_appliance_clearance: FRONT_CUT_FACE,
  laundry_utility_chase: FRONT_CUT_FACE,
  office_worksurface: PLAN_CUT_FACE,
  cable_grommet_template: PLAN_CUT_FACE,
  desk_power_chase: FRONT_CUT_FACE,
  island_overhang_support_panel: SIDE_CUT_FACE,
  pantry_pullout_tray_deck: PLAN_CUT_FACE,
  pantry_pullout_tray_front: FRONT_CUT_FACE,
  pantry_pullout_slide_pair: SIDE_CUT_FACE,
  media_tv_blocking_panel: FRONT_CUT_FACE,
  media_cable_chase: FRONT_CUT_FACE,
  media_vent_slot_template: FRONT_CUT_FACE,
  library_ladder_rail: FRONT_CUT_FACE,
  library_ladder_standoff: FRONT_CUT_FACE,
  stemware_rack_rail: PLAN_CUT_FACE,
  led_lighting_channel: FRONT_CUT_FACE,
  hamper_pullout_basket: FRONT_CUT_FACE,
  hamper_pullout_slide_pair: SIDE_CUT_FACE,
  shelf_pin_hole_row: SIDE_CUT_FACE,
  door_hinge_pair: FRONT_CUT_FACE,
  drawer_slide_pair: SIDE_CUT_FACE,
  countertop: PLAN_CUT_FACE,
  backsplash: FRONT_CUT_FACE,
  filler: FRONT_CUT_FACE,
  end_panel: SIDE_CUT_FACE,
};

const VERTICAL_GRAIN_PART_TYPES = new Set<CabinetPartType>([
  "left_side_panel",
  "right_side_panel",
  "back_panel",
  "vertical_divider",
  "door_front",
  "drawer_front",
  "face_frame_stile",
  "slat",
  "panel_stile",
  "convertible_panel",
  "support_leg",
  "stair_scribe_panel",
  "room_divider_back_panel",
  "lifestyle_insert_lip",
  "wine_rack_vertical_divider",
  "seat_back_panel",
  "shoe_cubby_vertical_divider",
  "island_overhang_support_panel",
  "pantry_pullout_tray_front",
  "media_tv_blocking_panel",
  "backsplash",
  "filler",
  "end_panel",
]);

const FULL_PERIMETER_PART_TYPES = new Set<CabinetPartType>([
  "door_front",
  "drawer_front",
  "face_frame_stile",
  "face_frame_rail",
  "slat",
  "panel_stile",
  "panel_rail",
  "ceiling_beam",
  "trim_member",
  "trim_return",
  "trim_reveal_strip",
  "convertible_panel",
  "platform_deck",
  "stair_scribe_panel",
  "room_divider_back_panel",
  "room_divider_stabilizer_foot",
  "lifestyle_insert_deck",
  "lifestyle_insert_lip",
  "seat_deck_panel",
  "seat_back_panel",
  "mudroom_hook_rail",
  "countertop",
  "office_worksurface",
  "island_overhang_support_panel",
  "pantry_pullout_tray_deck",
  "pantry_pullout_tray_front",
  "media_tv_blocking_panel",
]);

const ALL_TREATED_EDGES: CabinetTreatedEdge[] = ["top", "right", "bottom", "left"];

export function getCabinetPartCutFace(part: CabinetPart): CabinetCutFace {
  return CUT_FACE_BY_PART_TYPE[part.type];
}

function getCutDimension(part: CabinetPart, axis: CabinetCutFace["widthAxis"]): number {
  return part.size[axis];
}

function automaticEdgeRule(part: CabinetPart): {
  treatedEdges: CabinetTreatedEdge[];
  treatedLengthMm: number;
} {
  const cutFace = getCabinetPartCutFace(part);
  const cutWidth = getCutDimension(part, cutFace.widthAxis);
  const cutHeight = getCutDimension(part, cutFace.heightAxis);

  if (FULL_PERIMETER_PART_TYPES.has(part.type)) {
    return { treatedEdges: ALL_TREATED_EDGES, treatedLengthMm: 2 * (cutWidth + cutHeight) };
  }

  if (part.type === "support_leg") {
    return { treatedEdges: ["left", "right"], treatedLengthMm: 2 * part.size.height };
  }
  if (part.type === "platform_support_rib") {
    return { treatedEdges: ["top", "bottom"], treatedLengthMm: 2 * part.size.width };
  }
  if (part.type === "wine_rack_vertical_divider") {
    return { treatedEdges: ["right"], treatedLengthMm: part.size.height };
  }
  if (part.type === "wine_rack_horizontal_rail") {
    return { treatedEdges: ["top"], treatedLengthMm: part.size.width };
  }
  if (part.type === "shoe_cubby_vertical_divider") {
    return { treatedEdges: ["right"], treatedLengthMm: part.size.height };
  }
  if (
    part.type === "shoe_cubby_shelf" ||
    part.type === "drawer_box_back" ||
    part.type === "installation_cleat" ||
    part.type === "toe_kick" ||
    part.type === "shelf" ||
    part.type === "bottom_panel" ||
    part.type === "top_panel"
  ) {
    return { treatedEdges: ["top"], treatedLengthMm: part.size.width };
  }
  if (part.type === "backsplash") {
    return {
      treatedEdges: ["top", "left", "right"],
      treatedLengthMm: part.size.width + 2 * part.size.height,
    };
  }
  if (part.type === "drawer_box_side") {
    return {
      treatedEdges: ["top", "right"],
      treatedLengthMm: part.size.depth + part.size.height,
    };
  }
  if (
    part.type === "left_side_panel" ||
    part.type === "right_side_panel" ||
    part.type === "end_panel" ||
    part.type === "filler" ||
    part.type === "vertical_divider"
  ) {
    return { treatedEdges: ["right"], treatedLengthMm: part.size.height };
  }

  return { treatedEdges: [], treatedLengthMm: 0 };
}

export function getCabinetAutomaticEdgeBandingMm(part: CabinetPart): number {
  return automaticEdgeRule(part).treatedLengthMm;
}

function uniqueFaces(faces: readonly CabinetExposedFace[]): CabinetExposedFace[] {
  return Array.from(new Set(faces));
}

export function resolveCabinetModuleExposedFaces(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetExposedFace[] {
  if (module.exposedFaces) return uniqueFaces(module.exposedFaces);

  const moduleIndex = definition.modules.findIndex((candidate) => candidate.id === module.id);
  const faces: CabinetExposedFace[] = ["front"];
  if (moduleIndex === 0 && !definition.includeLeftEndPanel) faces.push("left");
  if (moduleIndex === definition.modules.length - 1 && !definition.includeRightEndPanel) faces.push("right");
  if (module.roomDividerFinishedBack) faces.push("back");
  if (!definition.includeCountertop && module.type !== "wall") faces.push("top");
  return uniqueFaces(faces);
}

function automaticPartExposedFaces(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition | undefined,
  part: CabinetPart
): CabinetExposedFace[] {
  if (!module) return [];
  const moduleFaces = resolveCabinetModuleExposedFaces(definition, module);
  switch (part.type) {
    case "door_front":
    case "drawer_front":
    case "filler":
    case "face_frame_stile":
    case "face_frame_rail":
    case "slat":
    case "panel_stile":
    case "panel_rail":
    case "backsplash":
      return ["front"];
    case "left_side_panel":
      return moduleFaces.includes("left") ? ["left"] : [];
    case "right_side_panel":
      return moduleFaces.includes("right") ? ["right"] : [];
    case "end_panel":
      return part.metadata?.side === "left" ? ["left"] : ["right"];
    case "back_panel":
    case "room_divider_back_panel":
      return moduleFaces.includes("back") ? ["back"] : [];
    case "top_panel":
    case "countertop":
    case "office_worksurface":
    case "seat_deck_panel":
    case "platform_deck":
      return ["top"];
    case "shelf":
    case "bottom_panel":
    case "toe_kick":
    case "installation_cleat":
      return ["front"];
    default:
      return module.exposedFaces ? uniqueFaces(module.exposedFaces) : [];
  }
}

function resolveMaterialGrainBehavior(
  definition: CabinetDefinition,
  part: CabinetPart
): "directional" | "non_directional" {
  const material = definition.materials.find((candidate) => candidate.id === part.materialId);
  if (material?.grainBehavior) return material.grainBehavior;
  return /veneer|wood|timber|oak|walnut/i.test(`${part.materialId} ${material?.name ?? ""}`)
    ? "directional"
    : "non_directional";
}

function resolveGrainDirection(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition | undefined,
  part: CabinetPart
): CabinetGrainDirection {
  if (resolveMaterialGrainBehavior(definition, part) === "non_directional") return "none";
  if (module?.grainDirection) return module.grainDirection;
  return VERTICAL_GRAIN_PART_TYPES.has(part.type) ? "vertical" : "horizontal";
}

function resolveEdgeTreatment(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition | undefined,
  part: CabinetPart,
  automaticLengthMm: number
): CabinetEdgeTreatment {
  if (module?.edgeTreatment) return module.edgeTreatment;
  if (automaticLengthMm <= 0) return "none";
  const material = definition.materials.find((candidate) => candidate.id === part.materialId);
  const supported = material?.supportedEdgeTreatments;
  if (supported?.length && !supported.includes("matching_edge_band")) {
    return supported.includes("painted_edge") ? "painted_edge" : "none";
  }
  return "matching_edge_band";
}

export function resolveCabinetPartFabricationSpec(
  definition: CabinetDefinition,
  part: CabinetPart
): CabinetPartFabricationSpec {
  const cabinetModule = definition.modules.find((candidate) => candidate.id === part.moduleId);
  const automaticEdge = automaticEdgeRule(part);
  const edgeTreatment = resolveEdgeTreatment(
    definition,
    cabinetModule,
    part,
    automaticEdge.treatedLengthMm
  );
  const grainDirection = resolveGrainDirection(definition, cabinetModule, part);
  const overridden = Boolean(
    cabinetModule &&
      (cabinetModule.grainDirection !== undefined ||
        cabinetModule.edgeTreatment !== undefined ||
        cabinetModule.edgeMaterialId !== undefined ||
        cabinetModule.exposedFaces !== undefined)
  );

  return {
    partId: part.id,
    moduleId: part.moduleId,
    cutFace: getCabinetPartCutFace(part),
    grainDirection,
    grainAxis:
      grainDirection === "vertical"
        ? "cut_height"
        : grainDirection === "horizontal"
          ? "cut_width"
          : "none",
    edgeTreatment,
    edgeMaterialId:
      edgeTreatment === "contrasting_edge_band"
        ? cabinetModule?.edgeMaterialId
        : edgeTreatment === "matching_edge_band"
          ? part.materialId
          : cabinetModule?.edgeMaterialId,
    treatedEdges: edgeTreatment === "none" ? [] : [...automaticEdge.treatedEdges],
    treatedLengthMm: edgeTreatment === "none" ? 0 : automaticEdge.treatedLengthMm,
    exposedFaces: cabinetModule?.exposedFaces
      ? uniqueFaces(cabinetModule.exposedFaces)
      : automaticPartExposedFaces(definition, cabinetModule, part),
    source: overridden ? "module_override" : "automatic",
  };
}
