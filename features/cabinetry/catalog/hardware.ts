import type { CabinetHardwareRef, HandleType } from "../types";

export type CabinetHardwareRole = "front_operation" | "accessory";

export type CabinetFrontHardwareType = Extract<
  HandleType,
  "none" | "bar_pull" | "knob" | "edge_pull" | "push_to_open"
>;

export const CABINET_HARDWARE_ROLE_BY_TYPE: Readonly<Record<HandleType, CabinetHardwareRole>> = {
  none: "front_operation",
  bar_pull: "front_operation",
  knob: "front_operation",
  edge_pull: "front_operation",
  push_to_open: "front_operation",
  hanging_rod: "accessory",
  mudroom_hook: "accessory",
  pantry_slide_pair: "accessory",
  library_ladder_rail: "accessory",
  stemware_rack: "accessory",
  led_strip_channel: "accessory",
  hamper_basket: "accessory",
  hamper_slide_pair: "accessory",
  shelf_pin_set: "accessory",
  door_hinge_pair: "accessory",
  drawer_slide_pair: "accessory",
  anti_tip_anchor_bracket: "accessory",
  leveling_foot: "accessory",
};

export function getCabinetHardwareRole(type: HandleType): CabinetHardwareRole {
  return CABINET_HARDWARE_ROLE_BY_TYPE[type];
}

export function isCabinetFrontHardwareType(type: HandleType): type is CabinetFrontHardwareType {
  return getCabinetHardwareRole(type) === "front_operation";
}

export type CabinetHardwareCatalogItem = CabinetHardwareRef & {
  role: CabinetHardwareRole;
  pricePlaceholder?: number;
};

export const CABINET_HARDWARE: CabinetHardwareCatalogItem[] = [
  {
    id: "none",
    name: "None",
    type: "none",
    role: "front_operation",
  },
  {
    id: "brushed_steel_bar_pull",
    name: "Brushed steel bar pull",
    type: "bar_pull",
    role: "front_operation",
    skuId: "CAB-HDL-BAR-STL",
  },
  {
    id: "black_bar_pull",
    name: "Black bar pull",
    type: "bar_pull",
    role: "front_operation",
    skuId: "CAB-HDL-BAR-BLK",
  },
  {
    id: "round_knob",
    name: "Round knob",
    type: "knob",
    role: "front_operation",
    skuId: "CAB-HDL-KNOB-RND",
  },
  {
    id: "edge_pull",
    name: "Edge pull",
    type: "edge_pull",
    role: "front_operation",
    skuId: "CAB-HDL-EDGE",
  },
  {
    id: "push_to_open",
    name: "Push-to-open",
    type: "push_to_open",
    role: "front_operation",
    skuId: "CAB-HDL-PUSH",
  },
  {
    id: "closet_hanging_rod",
    name: "Closet hanging rod",
    type: "hanging_rod",
    role: "accessory",
    skuId: "CAB-HW-CLOSET-ROD",
  },
  {
    id: "library_ladder_rail",
    name: "Library ladder rail system",
    type: "library_ladder_rail",
    role: "accessory",
    skuId: "CAB-HW-LIB-LADDER-RAIL",
  },
  {
    id: "stemware_rack",
    name: "Stemware rack rail set",
    type: "stemware_rack",
    role: "accessory",
    skuId: "CAB-HW-STEMWARE-RACK",
  },
  {
    id: "led_strip_channel",
    name: "LED strip channel",
    type: "led_strip_channel",
    role: "accessory",
    skuId: "CAB-HW-LED-STRIP-CHANNEL",
  },
  {
    id: "pullout_hamper_basket",
    name: "Pull-out hamper basket",
    type: "hamper_basket",
    role: "accessory",
    skuId: "CAB-HW-HAMPER-BASKET",
  },
  {
    id: "pullout_hamper_slide_pair",
    name: "Pull-out hamper slide pair",
    type: "hamper_slide_pair",
    role: "accessory",
    skuId: "CAB-HW-HAMPER-SLIDE-PAIR",
  },
  {
    id: "adjustable_shelf_pin_set",
    name: "Adjustable shelf pin set",
    type: "shelf_pin_set",
    role: "accessory",
    skuId: "CAB-HW-SHELF-PIN-SET",
  },
  {
    id: "concealed_door_hinge_pair",
    name: "Concealed door hinge pair",
    type: "door_hinge_pair",
    role: "accessory",
    skuId: "CAB-HW-DOOR-HINGE-PAIR",
  },
  {
    id: "soft_close_drawer_slide_pair",
    name: "Soft-close drawer slide pair",
    type: "drawer_slide_pair",
    role: "accessory",
    skuId: "CAB-HW-DRAWER-SLIDE-PAIR",
  },
  {
    id: "anti_tip_anchor_bracket",
    name: "Anti-tip anchor bracket",
    type: "anti_tip_anchor_bracket",
    role: "accessory",
    skuId: "CAB-HW-ANTI-TIP-BRACKET",
  },
  {
    id: "adjustable_leveling_foot",
    name: "Adjustable leveling foot",
    type: "leveling_foot",
    role: "accessory",
    skuId: "CAB-HW-LEVELING-FOOT",
  },
];

export function getCabinetHardwareCatalogItem(
  hardwareId: string
): CabinetHardwareCatalogItem | undefined {
  return CABINET_HARDWARE.find((hardware) => hardware.id === hardwareId);
}
