import type { CabinetBOMItem, CabinetDefinition, CabinetPart } from "./types";
import { generateCabinetParts } from "./generateCabinetParts";
import { resolveCabinetPartFabricationSpec } from "./fabricationSemantics";

const PART_NAMES: Record<CabinetPart["type"], string> = {
  left_side_panel: "Left side panel",
  right_side_panel: "Right side panel",
  bottom_panel: "Bottom panel",
  top_panel: "Top panel",
  back_panel: "Back panel",
  shelf: "Shelf",
  vertical_divider: "Vertical divider",
  door_front: "Door front",
  drawer_front: "Drawer front",
  face_frame_stile: "Face frame stile",
  face_frame_rail: "Face frame rail",
  drawer_box_side: "Drawer box side",
  drawer_box_back: "Drawer box back",
  drawer_box_bottom: "Drawer box bottom",
  installation_cleat: "Installation cleat",
  anti_tip_anchor_bracket: "Anti-tip anchor bracket",
  leveling_foot: "Adjustable leveling foot",
  toe_kick: "Toe kick",
  handle: "Handle",
  hanging_rod: "Hanging rod",
  slat: "Slat",
  panel_stile: "Panel stile",
  panel_rail: "Panel rail",
  ceiling_beam: "Ceiling beam",
  trim_member: "Trim member",
  trim_return: "Trim return",
  trim_reveal_strip: "Trim reveal/backing strip",
  convertible_panel: "Convertible panel",
  support_leg: "Support leg",
  hinge_rail: "Hinge rail",
  platform_deck: "Platform deck",
  platform_support_rib: "Platform support rib",
  stair_scribe_panel: "Stair scribe panel",
  room_divider_back_panel: "Room divider back panel",
  room_divider_stabilizer_foot: "Room divider stabilizer foot",
  lifestyle_insert_deck: "Lifestyle insert deck",
  lifestyle_insert_lip: "Lifestyle insert lip",
  wine_rack_vertical_divider: "Wine rack vertical divider",
  wine_rack_horizontal_rail: "Wine rack horizontal rail",
  seat_deck_panel: "Seat deck panel",
  seat_cushion: "Seat cushion",
  seat_back_panel: "Seat back panel",
  mudroom_hook_rail: "Mudroom hook rail",
  mudroom_hook: "Mudroom hook",
  shoe_cubby_vertical_divider: "Shoe cubby vertical divider",
  shoe_cubby_shelf: "Shoe cubby shelf",
  sink_cutout_template: "Sink cutout template",
  plumbing_chase_void: "Plumbing chase clearance",
  laundry_appliance_clearance: "Laundry appliance clearance",
  laundry_utility_chase: "Laundry utility chase",
  office_worksurface: "Office work surface",
  cable_grommet_template: "Cable grommet template",
  desk_power_chase: "Desk power chase",
  island_overhang_support_panel: "Island overhang support panel",
  pantry_pullout_tray_deck: "Pantry pull-out tray deck",
  pantry_pullout_tray_front: "Pantry pull-out tray front",
  pantry_pullout_slide_pair: "Pantry pull-out slide pair",
  media_tv_blocking_panel: "Media TV blocking panel",
  media_cable_chase: "Media cable chase",
  media_vent_slot_template: "Media vent slot template",
  library_ladder_rail: "Library ladder rail",
  library_ladder_standoff: "Library ladder rail standoff",
  stemware_rack_rail: "Stemware rack rail",
  led_lighting_channel: "LED lighting channel",
  hamper_pullout_basket: "Pull-out hamper basket",
  hamper_pullout_slide_pair: "Pull-out hamper slide pair",
  shelf_pin_hole_row: "Adjustable shelf pin row",
  door_hinge_pair: "Concealed door hinge pair",
  drawer_slide_pair: "Soft-close drawer slide pair",
  countertop: "Countertop",
  backsplash: "Backsplash",
  filler: "Filler",
  end_panel: "End panel",
};

const keyFor = (definition: CabinetDefinition, part: CabinetPart) => {
  const fabrication = resolveCabinetPartFabricationSpec(definition, part);
  const cabinetModule = definition.modules.find((candidate) => candidate.id === part.moduleId);
  return [
    part.type,
    Math.round(part.size.width * 10) / 10,
    Math.round(part.size.height * 10) / 10,
    Math.round(part.size.depth * 10) / 10,
    part.materialId,
    part.skuId ?? "",
    fabrication.grainDirection,
    fabrication.edgeTreatment,
    fabrication.edgeMaterialId ?? "",
    fabrication.treatedEdges.join(","),
    cabinetModule?.exposedFaces === undefined ? "automatic" : fabrication.exposedFaces.join(","),
    `${fabrication.cutFace.widthAxis}:${fabrication.cutFace.heightAxis}:${fabrication.cutFace.thicknessAxis}`,
  ].join("|");
};

export function generateCabinetBOM(
  definition: CabinetDefinition,
  precomputedParts?: readonly CabinetPart[]
): CabinetBOMItem[] {
  const grouped = new Map<string, CabinetBOMItem>();
  const parts = precomputedParts ?? generateCabinetParts(definition);

  for (const part of parts) {
    const key = keyFor(definition, part);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
      continue;
    }

    grouped.set(key, {
      id: `bom:${key.replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
      name: PART_NAMES[part.type],
      type: part.type,
      quantity: 1,
      width: Math.round(part.size.width * 10) / 10,
      height: Math.round(part.size.height * 10) / 10,
      depth: Math.round(part.size.depth * 10) / 10,
      materialId: part.materialId,
      skuId: part.skuId,
      notes:
        part.type === "handle"
          ? "Hardware placeholder, replace with supplier SKU later."
          : part.type === "hanging_rod"
            ? "Closet/wardrobe hanging rod; confirm load rating, end sockets, and finish."
          : part.type === "slat"
            ? "Slat wall strip; confirm spacing, backing, reveals, and finish continuity."
          : part.type === "face_frame_stile" || part.type === "face_frame_rail"
            ? "Face frame rail/stile; confirm joinery, overlay clearances, grain direction, and finished reveal before fabrication."
          : part.type === "panel_stile" || part.type === "panel_rail"
            ? "Wall panel rail/stile trim; confirm backing, reveal layout, paint/finish, and field-fit scribing."
          : part.type === "ceiling_beam"
            ? "Ceiling beam or coffer grid member; confirm blocking, fasteners, fixture conflicts, and field-fit lengths."
          : part.type === "trim_member"
            ? "Trim, moulding, or mantel member; confirm field-fit lengths, returns, miters, clearances, and finish."
          : part.type === "trim_reveal_strip"
            ? "Trim shadow reveal/backing strip; confirm setback, fastener access, wall straightness, and finish shadow line."
          : part.type === "convertible_panel"
            ? "Convertible wall-bed or fold-down panel; confirm hardware loads, clearances, and safety stops."
          : part.type === "support_leg"
            ? "Convertible support leg; confirm folding hardware, floor contact, and deployed height."
          : part.type === "hinge_rail"
            ? "Convertible hinge/mechanism rail; confirm supplier hardware, fasteners, blocking, and safety rating."
          : part.type === "platform_deck"
            ? "Storage bed deck panel; confirm mattress support, seams, ventilation, and deck fasteners."
          : part.type === "platform_support_rib"
            ? "Storage bed platform support rib; confirm spacing, screw pattern, and drawer clearances."
          : part.type === "stair_scribe_panel"
            ? "Under-stair stepped scribe panel; confirm stair rake template, stringer clearance, and field-fit trimming."
          : part.type === "room_divider_back_panel"
            ? "Two-sided room divider finished back panel; confirm rear-facing finish, sight lines, and service access."
          : part.type === "room_divider_stabilizer_foot"
            ? "Room divider stabilizer foot; confirm anchoring, lateral stability, circulation clearance, and floor protection."
          : part.type === "lifestyle_insert_deck"
            ? "Lifestyle built-in insert deck; confirm intended pet, toy, hobby, or small-space organizer use."
          : part.type === "lifestyle_insert_lip"
            ? "Lifestyle built-in insert lip; confirm clear access, removable bins, cleaning, and safety edges."
          : part.type === "wine_rack_vertical_divider" || part.type === "wine_rack_horizontal_rail"
            ? "Wine rack divider/rail; confirm bottle diameter, clear opening, finish durability, and field-fit tolerance."
          : part.type === "seat_deck_panel"
            ? "Window-seat/banquette seat deck; confirm support span, access panels, cushion allowance, and finish durability."
          : part.type === "seat_cushion"
            ? "Seat cushion placeholder; confirm upholstery, removable cover, thickness, and supplier lead time."
          : part.type === "seat_back_panel"
            ? "Banquette/window-seat back panel; confirm wall anchoring, comfort angle, cleanability, and finish."
          : part.type === "mudroom_hook_rail"
            ? "Mudroom hook rail; confirm anchoring, wall blocking, hook spacing, and finish durability."
          : part.type === "mudroom_hook"
            ? "Mudroom hook placeholder; confirm hook style, load rating, finish, and mounting hardware."
          : part.type === "shoe_cubby_vertical_divider" || part.type === "shoe_cubby_shelf"
            ? "Shoe cubby component; confirm footwear clearance, cleanable finish, and moisture protection."
          : part.type === "sink_cutout_template"
            ? "Countertop sink cutout coordination marker; confirm sink model, faucet setout, template, and fabricator requirements."
          : part.type === "plumbing_chase_void"
            ? "Plumbing chase clearance marker; confirm trap, shutoff, supply, drain, and drawer/shelf conflicts."
          : part.type === "laundry_appliance_clearance"
            ? "Laundry appliance clearance marker; confirm appliance model, vibration clearance, door swing, service access, and ventilation."
          : part.type === "laundry_utility_chase"
            ? "Laundry utility chase marker; confirm water, drain, power, dryer vent, shutoff access, and wall penetrations."
          : part.type === "office_worksurface"
            ? "Office work surface; confirm span support, front overhang, cable access, edge treatment, and finish durability."
          : part.type === "cable_grommet_template"
            ? "Cable grommet coordination marker; confirm grommet diameter, device count, and supplier template before cutting."
          : part.type === "desk_power_chase"
            ? "Desk power/data chase marker; confirm outlet, low-voltage, ventilation, and access-panel coordination."
          : part.type === "island_overhang_support_panel"
            ? "Kitchen island seating-overhang support panel; confirm knee clearance, panel spacing, anchoring, and countertop support requirements."
          : part.type === "pantry_pullout_tray_deck" || part.type === "pantry_pullout_tray_front"
            ? "Pantry pull-out tray component; confirm slide rating, clear opening, stored goods, and removable tray access."
          : part.type === "pantry_pullout_slide_pair"
            ? "Pantry pull-out slide hardware pair; confirm load rating, extension length, fixing pattern, and supplier SKU."
          : part.type === "media_tv_blocking_panel"
            ? "Media wall TV blocking panel; confirm bracket model, mounting pattern, wall substrate, and fasteners."
          : part.type === "media_cable_chase"
            ? "Media wall cable chase marker; coordinate outlet, low-voltage, conduit, access, and bend-radius requirements."
          : part.type === "media_vent_slot_template"
            ? "Media wall ventilation slot template; confirm equipment heat load, grille details, and clear airflow path."
          : part.type === "library_ladder_rail"
            ? "Library ladder rail segment; confirm rail finish, splice locations, rolling ladder hardware, and wall blocking."
          : part.type === "library_ladder_standoff"
            ? "Library ladder rail standoff; confirm fixing pattern, backing, load rating, and projection."
          : part.type === "stemware_rack_rail"
            ? "Stemware rack rail; confirm glass base diameter, lane spacing, mounting substrate, and finish."
          : part.type === "led_lighting_channel"
            ? "LED lighting channel; confirm driver location, switching, diffuser, color temperature, and low-voltage routing."
          : part.type === "hamper_pullout_basket"
            ? "Pull-out hamper basket; confirm basket finish, ventilation, liner, removable cleaning access, and clear opening."
          : part.type === "hamper_pullout_slide_pair"
            ? "Pull-out hamper slide pair; confirm load rating, extension length, fixing pattern, and basket compatibility."
          : part.type === "shelf_pin_hole_row"
            ? "Adjustable shelf pin row; confirm drill spacing, shelf loads, side-panel thickness, and shelf-pin hardware."
          : part.type === "door_hinge_pair"
            ? "Concealed door hinge pair; confirm cup drilling pattern, overlay, opening angle, and load rating."
          : part.type === "drawer_slide_pair"
            ? "Soft-close drawer slide pair; confirm length, side clearance, load rating, and fixing pattern."
          : part.type === "drawer_box_side" || part.type === "drawer_box_back" || part.type === "drawer_box_bottom"
            ? "Drawer box component; confirm joinery, bottom capture, slide fixing pattern, squareness, and usable storage depth."
          : part.type === "installation_cleat"
            ? "Wall-mount installation cleat; confirm substrate, fasteners, anti-tip requirements, and site blocking."
          : part.type === "anti_tip_anchor_bracket"
            ? "Anti-tip anchor bracket; confirm substrate, blocking, fastener type, and final bracket location."
          : part.type === "leveling_foot"
            ? "Adjustable leveling foot; confirm load rating, height range, floor level, and plinth access."
          : part.type === "countertop"
            ? "Countertop/worktop placeholder; confirm final supplier, substrate, seams, cutouts, and overhang support."
          : part.type === "backsplash"
            ? "Backsplash/upstand; confirm wall scribe, sealant line, countertop seam, and outlet/service conflicts."
          : part.type === "toe_kick"
            ? "Recessed toe kick/plinth; confirm setback, depth, leveling feet, and finish return before installation."
            : undefined,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
}
