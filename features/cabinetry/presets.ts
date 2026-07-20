import { CABINET_HARDWARE } from "./catalog/hardware";
import { CABINET_MATERIALS } from "./catalog/materials";
import { createCabinetAutomationState } from "./automation";
import {
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH,
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT,
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH,
  CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS,
  CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT,
  CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT,
  CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH,
} from "./mediaWallLayout";
import {
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER,
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT,
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION,
  CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT,
  CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER,
} from "./libraryLadderLayout";
import {
  CABINET_DEFAULT_STEMWARE_RACK_DEPTH,
  CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT,
  CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING,
  CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT,
  CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH,
} from "./stemwareRackLayout";
import {
  CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT,
  CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH,
  CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT,
  CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT,
} from "./lightingLayout";
import {
  CABINET_DEFAULT_HAMPER_BASKET_COUNT,
  CABINET_DEFAULT_HAMPER_BASKET_DEPTH,
  CABINET_DEFAULT_HAMPER_BASKET_HEIGHT,
  CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE,
} from "./hamperPullOutLayout";
import {
  CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
  CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
  CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
  CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
  CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
} from "./shelfPinLayout";
import {
  CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
  CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
} from "./doorHingeLayout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
} from "./drawerSlideLayout";
import {
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
} from "./drawerBoxLayout";
import {
  CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT,
  CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP,
  CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS,
} from "./installationCleatLayout";
import {
  CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT,
  CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES,
} from "./antiTipAnchorLayout";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetRequiredHostType,
  CabinetUnitType,
} from "./types";

export type CabinetPresetId =
  | "base"
  | "wall"
  | "tall"
  | "wardrobe"
  | "vanity"
  | "tv_console"
  | "cabinet_run"
  | "closet_system"
  | "media_wall"
  | "mudroom_storage"
  | "laundry_room"
  | "home_office_built_in"
  | "library_wall"
  | "window_seat"
  | "banquette"
  | "murphy_bed"
  | "fold_down_desk"
  | "platform_storage_bed"
  | "under_stair_storage"
  | "room_divider_storage"
  | "home_bar"
  | "kitchen_island"
  | "pantry_system"
  | "wine_storage"
  | "pet_built_in"
  | "kids_storage"
  | "hobby_storage"
  | "wall_paneling"
  | "slat_wall"
  | "ceiling_beams"
  | "coffered_ceiling"
  | "fireplace_surround"
  | "trim_package";

const nowIso = () => new Date().toISOString();

const names: Record<CabinetPresetId, string> = {
  base: "Base cabinet",
  wall: "Wall cabinet",
  tall: "Tall cabinet",
  wardrobe: "Wardrobe",
  vanity: "Vanity cabinet",
  tv_console: "TV console",
  cabinet_run: "Cabinet run",
  closet_system: "Closet system",
  media_wall: "Media wall",
  mudroom_storage: "Mudroom storage",
  laundry_room: "Laundry room",
  home_office_built_in: "Home office",
  library_wall: "Library wall",
  window_seat: "Window seat",
  banquette: "Banquette",
  murphy_bed: "Murphy bed",
  fold_down_desk: "Fold-down desk",
  platform_storage_bed: "Platform storage bed",
  under_stair_storage: "Under-stair storage",
  room_divider_storage: "Room divider storage",
  home_bar: "Home bar",
  kitchen_island: "Kitchen island",
  pantry_system: "Pantry system",
  wine_storage: "Wine storage",
  pet_built_in: "Pet built-in",
  kids_storage: "Kids storage",
  hobby_storage: "Hobby storage",
  wall_paneling: "Wall paneling",
  slat_wall: "Slat wall",
  ceiling_beams: "Ceiling beams",
  coffered_ceiling: "Coffered ceiling",
  fireplace_surround: "Fireplace surround",
  trim_package: "Trim package",
};

const unitTypeByPreset: Record<CabinetPresetId, CabinetUnitType> = {
  base: "base",
  wall: "wall",
  tall: "tall",
  wardrobe: "wardrobe",
  vanity: "vanity",
  tv_console: "tv_console",
  cabinet_run: "base",
  closet_system: "wardrobe",
  media_wall: "tall",
  mudroom_storage: "tall",
  laundry_room: "base",
  home_office_built_in: "base",
  library_wall: "wall",
  window_seat: "base",
  banquette: "base",
  murphy_bed: "wardrobe",
  fold_down_desk: "wall",
  platform_storage_bed: "base",
  under_stair_storage: "tall",
  room_divider_storage: "wall",
  home_bar: "base",
  kitchen_island: "base",
  pantry_system: "tall",
  wine_storage: "tall",
  pet_built_in: "base",
  kids_storage: "base",
  hobby_storage: "tall",
  wall_paneling: "wall",
  slat_wall: "wall",
  ceiling_beams: "wall",
  coffered_ceiling: "wall",
  fireplace_surround: "wall",
  trim_package: "wall",
};

type CabinetPresetModule = Omit<CabinetModuleDefinition, "id" | "type" | "height" | "depth"> &
  Partial<Pick<CabinetModuleDefinition, "type" | "height" | "depth">>;

const presets: Record<
  CabinetPresetId,
  Omit<CabinetDefinition, "id" | "createdAt" | "updatedAt" | "modules" | "materials" | "hardware"> & {
    modules: CabinetPresetModule[];
  }
> = {
  base: {
    name: names.base,
    version: 1,
    units: "mm",
    totalWidth: 900,
    height: 720,
    depth: 580,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 100,
    revealGap: 3,
    modules: [{
      width: 900,
      frontType: "drawer_stack",
      doorStyle: "flat_slab",
      doorCount: 0,
      drawerCount: 3,
      shelfCount: 1,
      materialId: "white_melamine",
      frontMaterialId: "oak_veneer",
      hardwareId: "brushed_steel_bar_pull",
      drawerBoxEnabled: true,
      drawerBoxSideThickness: CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
      drawerBoxBottomThickness: CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
      drawerBoxHeightClearance: CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
      drawerBoxBackClearance: CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
      drawerSlideHardwareEnabled: true,
      drawerSlideLength: CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
      drawerSlideClearance: CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
    }],
  },
  wall: {
    name: names.wall,
    version: 1,
    units: "mm",
    totalWidth: 900,
    height: 720,
    depth: 350,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [{
      width: 900,
      frontType: "double_door",
      doorStyle: "flat_slab",
      doorCount: 2,
      drawerCount: 0,
      shelfCount: 2,
      materialId: "white_melamine",
      frontMaterialId: "painted_shaker_white",
      hardwareId: "black_bar_pull",
      hingeSide: "double",
      doorHingeHardwareEnabled: true,
      doorHingeCountPerDoor: CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
      doorHingeInsetFromTopBottom: CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
      installationCleatEnabled: true,
      installationCleatHeight: CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT,
      installationCleatThickness: CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS,
      installationCleatInsetFromTop: CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP,
    }],
  },
  tall: {
    name: names.tall,
    version: 1,
    units: "mm",
    totalWidth: 600,
    height: 2200,
    depth: 580,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 100,
    revealGap: 3,
    modules: [{
      width: 600,
      frontType: "double_door",
      doorStyle: "flat_slab",
      doorCount: 2,
      drawerCount: 0,
      shelfCount: 5,
      materialId: "white_melamine",
      frontMaterialId: "walnut_veneer",
      hardwareId: "brushed_steel_bar_pull",
      hingeSide: "double",
      antiTipAnchorEnabled: true,
      antiTipAnchorCount: CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT,
      antiTipAnchorHeight: 2020,
      antiTipAnchorInsetFromSides: CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES,
    }],
  },
  wardrobe: {
    name: names.wardrobe,
    version: 1,
    units: "mm",
    totalWidth: 1200,
    height: 2400,
    depth: 620,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    modules: [{
      width: 1200,
      frontType: "double_door",
      doorStyle: "flat_slab",
      doorCount: 2,
      drawerCount: 0,
      shelfCount: 4,
      hangingRodCount: 1,
      hangingRodHeight: 1700,
      hamperPullOutEnabled: true,
      hamperBasketCount: CABINET_DEFAULT_HAMPER_BASKET_COUNT,
      hamperBasketDepth: CABINET_DEFAULT_HAMPER_BASKET_DEPTH,
      hamperBasketHeight: CABINET_DEFAULT_HAMPER_BASKET_HEIGHT,
      hamperSlideClearance: CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE,
      materialId: "white_melamine",
      frontMaterialId: "matte_black_laminate",
      hardwareId: "edge_pull",
      hingeSide: "double",
      antiTipAnchorEnabled: true,
      antiTipAnchorCount: CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT,
      antiTipAnchorHeight: 2220,
      antiTipAnchorInsetFromSides: CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES,
    }],
  },
  vanity: {
    name: names.vanity,
    version: 1,
    units: "mm",
    totalWidth: 790,
    height: 658,
    depth: 525,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    includeCountertop: true,
    countertopThickness: 38,
    countertopOverhangLeft: 20,
    countertopOverhangRight: 20,
    countertopOverhangFront: 25,
    countertopOverhangBack: 0,
    countertopMaterialId: "painted_shaker_white",
    modules: [{
      width: 750,
      height: 620,
      depth: 500,
      frontType: "door_and_drawer",
      doorStyle: "flat_slab",
      doorCount: 2,
      drawerCount: 1,
      shelfCount: 1,
      sinkCutoutEnabled: true,
      sinkCutoutWidth: 480,
      sinkCutoutDepth: 340,
      sinkCutoutOffsetX: 0,
      sinkCutoutOffsetZ: 250,
      plumbingChaseWidth: 360,
      plumbingChaseHeight: 420,
      plumbingChaseDepth: 90,
      materialId: "white_melamine",
      frontMaterialId: "oak_veneer",
      hardwareId: "round_knob",
      hingeSide: "double",
    }],
  },
  tv_console: {
    name: names.tv_console,
    version: 1,
    units: "mm",
    totalWidth: 1600,
    height: 480,
    depth: 420,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [{
      width: 1600,
      frontType: "slab_panel",
      doorStyle: "flat_slab",
      doorCount: 2,
      drawerCount: 0,
      shelfCount: 1,
      materialId: "white_melamine",
      frontMaterialId: "walnut_veneer",
      hardwareId: "push_to_open",
    }],
  },
  cabinet_run: {
    name: names.cabinet_run,
    version: 1,
    units: "mm",
    totalWidth: 2400,
    height: 720,
    depth: 580,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 100,
    revealGap: 3,
    modules: [
      {
        width: 800,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "brushed_steel_bar_pull",
      },
      {
        width: 800,
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 2,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 800,
        frontType: "door_and_drawer",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 1,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
    ],
  },
  closet_system: {
    name: names.closet_system,
    version: 1,
    units: "mm",
    millworkFamily: "closet",
    millworkAssemblyType: "closet_system",
    totalWidth: 1800,
    height: 2400,
    depth: 600,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    modules: [
      {
        width: 900,
        type: "wardrobe",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 6,
        hangingRodCount: 2,
        hangingRodHeight: 1800,
        hangingRodSpacing: 900,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 900,
        type: "wardrobe",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 4,
        hangingRodCount: 1,
        hangingRodHeight: 1700,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
    ],
  },
  media_wall: {
    name: names.media_wall,
    version: 1,
    units: "mm",
    millworkFamily: "media_wall",
    millworkAssemblyType: "media_wall",
    totalWidth: 3000,
    height: 2100,
    depth: 420,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
      {
        width: 1800,
        type: "tv_console",
        height: 520,
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 3,
        drawerCount: 0,
        shelfCount: 1,
        mediaWallEnabled: true,
        mediaTvOpeningWidth: CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH,
        mediaTvOpeningHeight: CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT,
        mediaTvMountHeight: CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT,
        mediaTvBlockingThickness: CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS,
        mediaCableChaseWidth: CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH,
        mediaCableChaseHeight: CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT,
        mediaCableChaseDepth: CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH,
        mediaVentSlotCount: CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT,
        mediaVentSlotWidth: CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH,
        mediaVentSlotHeight: CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT,
        mediaVentSlotSpacing: CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING,
        materialId: "white_melamine",
        frontMaterialId: "matte_black_laminate",
        hardwareId: "push_to_open",
      },
      {
        width: 600,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  mudroom_storage: {
    name: names.mudroom_storage,
    version: 1,
    units: "mm",
    millworkFamily: "mudroom",
    millworkAssemblyType: "mudroom_storage",
    totalWidth: 2400,
    height: 2100,
    depth: 450,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        frontType: "single_door",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "left",
      },
      {
        width: 1200,
        type: "base",
        height: 520,
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        mudroomHookCount: 4,
        mudroomHookRailHeight: 1450,
        mudroomHookProjection: 55,
        shoeCubbyCount: 4,
        shoeCubbyHeight: 170,
        shoeCubbyDepth: 360,
        shoeCubbyDividerThickness: 18,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "tall",
        frontType: "single_door",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "right",
      },
    ],
  },
  laundry_room: {
    name: names.laundry_room,
    version: 1,
    units: "mm",
    millworkFamily: "laundry_room",
    millworkAssemblyType: "laundry_room_cabinetry",
    totalWidth: 2400,
    height: 900,
    depth: 600,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 100,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "base",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 1200,
        type: "base",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        laundryApplianceBayEnabled: true,
        laundryApplianceKind: "washer_dryer",
        laundryApplianceCount: 2,
        laundryApplianceWidth: 570,
        laundryApplianceHeight: 850,
        laundryApplianceDepth: 560,
        laundryApplianceSideClearance: 20,
        laundryApplianceTopClearance: 40,
        laundryApplianceBackClearance: 40,
        laundryUtilityChaseHeight: 180,
        laundryUtilityChaseDepth: 80,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "base",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
    ],
  },
  home_office_built_in: {
    name: names.home_office_built_in,
    version: 1,
    units: "mm",
    millworkFamily: "home_office",
    millworkAssemblyType: "home_office_built_in",
    totalWidth: 3000,
    height: 2100,
    depth: 650,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    modules: [
      {
        width: 700,
        type: "tall",
        depth: 550,
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 1600,
        type: "base",
        height: 720,
        depth: 550,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 1,
        officeWorksurfaceEnabled: true,
        officeWorksurfaceThickness: 36,
        officeWorksurfaceDepth: 650,
        officeWorksurfaceOverhangFront: 100,
        cableGrommetCount: 3,
        cableGrommetDiameter: 80,
        cableGrommetOffsetFromBack: 110,
        deskPowerChaseHeight: 120,
        deskPowerChaseDepth: 60,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "brushed_steel_bar_pull",
      },
      {
        width: 700,
        type: "tall",
        depth: 550,
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  library_wall: {
    name: names.library_wall,
    version: 1,
    units: "mm",
    millworkFamily: "library",
    millworkAssemblyType: "library_wall",
    totalWidth: 3000,
    height: 2400,
    depth: 350,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 1000,
        type: "wall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 7,
        libraryLadderRailEnabled: true,
        libraryLadderRailHeight: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT,
        libraryLadderRailDiameter: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER,
        libraryLadderRailProjection: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION,
        libraryLadderStandoffCount: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT,
        libraryLadderStandoffDiameter: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER,
        lightingChannelEnabled: true,
        lightingChannelCount: CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT,
        lightingChannelDepth: CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH,
        lightingChannelHeight: CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT,
        lightingChannelInsetFromFront: CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT,
        shelfPinRowsEnabled: true,
        shelfPinRowPairCount: CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
        shelfPinHoleCount: CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
        shelfPinHoleSpacing: CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
        shelfPinInsetFromFront: CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
        shelfPinStartHeight: CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 1000,
        type: "wall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 7,
        libraryLadderRailEnabled: true,
        libraryLadderRailHeight: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT,
        libraryLadderRailDiameter: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER,
        libraryLadderRailProjection: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION,
        libraryLadderStandoffCount: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT,
        libraryLadderStandoffDiameter: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER,
        lightingChannelEnabled: true,
        lightingChannelCount: CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT,
        lightingChannelDepth: CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH,
        lightingChannelHeight: CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT,
        lightingChannelInsetFromFront: CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT,
        shelfPinRowsEnabled: true,
        shelfPinRowPairCount: CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
        shelfPinHoleCount: CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
        shelfPinHoleSpacing: CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
        shelfPinInsetFromFront: CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
        shelfPinStartHeight: CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 1000,
        type: "wall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 7,
        libraryLadderRailEnabled: true,
        libraryLadderRailHeight: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT,
        libraryLadderRailDiameter: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER,
        libraryLadderRailProjection: CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION,
        libraryLadderStandoffCount: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT,
        libraryLadderStandoffDiameter: CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER,
        lightingChannelEnabled: true,
        lightingChannelCount: CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT,
        lightingChannelDepth: CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH,
        lightingChannelHeight: CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT,
        lightingChannelInsetFromFront: CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT,
        shelfPinRowsEnabled: true,
        shelfPinRowPairCount: CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
        shelfPinHoleCount: CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
        shelfPinHoleSpacing: CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
        shelfPinInsetFromFront: CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
        shelfPinStartHeight: CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  window_seat: {
    name: names.window_seat,
    version: 1,
    units: "mm",
    millworkFamily: "window_seat",
    millworkAssemblyType: "window_seat",
    totalWidth: 1800,
    height: 480,
    depth: 520,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [
      {
        width: 900,
        type: "base",
        height: 380,
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 1,
        seatDeckThickness: 24,
        seatCushionThickness: 75,
        seatCushionDepth: 540,
        seatCushionOverhangFront: 20,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "push_to_open",
      },
      {
        width: 900,
        type: "base",
        height: 380,
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 1,
        seatDeckThickness: 24,
        seatCushionThickness: 75,
        seatCushionDepth: 540,
        seatCushionOverhangFront: 20,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "push_to_open",
      },
    ],
  },
  banquette: {
    name: names.banquette,
    version: 1,
    units: "mm",
    millworkFamily: "banquette",
    millworkAssemblyType: "banquette",
    totalWidth: 2200,
    height: 820,
    depth: 580,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [
      {
        width: 1100,
        type: "base",
        height: 360,
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 1,
        seatDeckThickness: 24,
        seatCushionThickness: 80,
        seatCushionDepth: 610,
        seatCushionOverhangFront: 30,
        seatBackHeight: 420,
        seatBackThickness: 24,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "push_to_open",
      },
      {
        width: 1100,
        type: "base",
        height: 360,
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 1,
        seatDeckThickness: 24,
        seatCushionThickness: 80,
        seatCushionDepth: 610,
        seatCushionOverhangFront: 30,
        seatBackHeight: 420,
        seatBackThickness: 24,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "push_to_open",
      },
    ],
  },
  murphy_bed: {
    name: names.murphy_bed,
    version: 1,
    units: "mm",
    millworkFamily: "murphy_bed",
    millworkAssemblyType: "murphy_bed",
    totalWidth: 2200,
    height: 2300,
    depth: 450,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 375,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 1450,
        type: "wardrobe",
        millworkComponentType: "wall_bed_panel",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        convertiblePanelThickness: 42,
        convertiblePanelHeight: 2200,
        convertibleOpenDepth: 2050,
        convertibleHingeHeight: 90,
        convertibleSupportLegCount: 2,
        convertibleSupportLegWidth: 45,
        convertibleSupportLegDepth: 45,
        wallBedMattressSize: "double",
        wallBedOrientation: "vertical",
        wallBedDisplayState: "closed",
        wallBedClearanceVisible: true,
        wallBedSideStorage: "both",
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
      },
      {
        width: 375,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  fold_down_desk: {
    name: names.fold_down_desk,
    version: 1,
    units: "mm",
    millworkFamily: "home_office",
    millworkAssemblyType: "fold_down_desk",
    totalWidth: 1200,
    height: 1500,
    depth: 320,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 1200,
        type: "wall",
        millworkComponentType: "fold_down_worksurface",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        convertiblePanelThickness: 30,
        convertiblePanelHeight: 720,
        convertibleOpenDepth: 650,
        convertibleHingeHeight: 740,
        convertibleSupportLegCount: 2,
        convertibleSupportLegWidth: 35,
        convertibleSupportLegDepth: 35,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "edge_pull",
      },
    ],
  },
  platform_storage_bed: {
    name: names.platform_storage_bed,
    version: 1,
    units: "mm",
    millworkFamily: "storage_bed",
    millworkAssemblyType: "platform_storage_bed",
    totalWidth: 2400,
    height: 420,
    depth: 1040,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [
      {
        width: 1200,
        depth: 1000,
        type: "base",
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 2,
        shelfCount: 0,
        platformDeckThickness: 24,
        platformDeckOverhangFront: 20,
        platformDeckOverhangBack: 20,
        platformSupportRibCount: 3,
        platformSupportRibWidth: 70,
        platformSupportRibHeight: 90,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "edge_pull",
      },
      {
        width: 1200,
        depth: 1000,
        type: "base",
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 2,
        shelfCount: 0,
        platformDeckThickness: 24,
        platformDeckOverhangFront: 20,
        platformDeckOverhangBack: 20,
        platformSupportRibCount: 3,
        platformSupportRibWidth: 70,
        platformSupportRibHeight: 90,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "edge_pull",
      },
    ],
  },
  under_stair_storage: {
    name: names.under_stair_storage,
    version: 1,
    units: "mm",
    millworkFamily: "under_stair_storage",
    millworkAssemblyType: "under_stair_storage",
    totalWidth: 1800,
    height: 1800,
    depth: 600,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        height: 1800,
        frontType: "single_door",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "left",
      },
      {
        width: 600,
        type: "tall",
        height: 1350,
        frontType: "single_door",
        doorStyle: "flat_slab",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 3,
        stairScribeStepCount: 3,
        stairScribeHighHeight: 1800,
        stairScribeLowHeight: 1500,
        stairScribeDepth: 24,
        stairScribeDirection: "rises_left",
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "left",
      },
      {
        width: 600,
        type: "base",
        height: 900,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 0,
        stairScribeStepCount: 3,
        stairScribeHighHeight: 1500,
        stairScribeLowHeight: 1050,
        stairScribeDepth: 24,
        stairScribeDirection: "rises_left",
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "edge_pull",
      },
    ],
  },
  room_divider_storage: {
    name: names.room_divider_storage,
    version: 1,
    units: "mm",
    millworkFamily: "room_divider_storage",
    millworkAssemblyType: "room_divider_storage",
    totalWidth: 2400,
    height: 1800,
    depth: 360,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [
      {
        width: 800,
        type: "wall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        roomDividerFinishedBack: true,
        roomDividerBackPanelCount: 2,
        roomDividerBackPanelThickness: 18,
        roomDividerStabilizerFootCount: 2,
        roomDividerStabilizerFootWidth: 90,
        roomDividerStabilizerFootHeight: 45,
        roomDividerStabilizerFootDepth: 360,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 800,
        type: "wall",
        frontType: "slab_panel",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 3,
        roomDividerFinishedBack: true,
        roomDividerBackPanelCount: 2,
        roomDividerBackPanelThickness: 18,
        roomDividerStabilizerFootCount: 2,
        roomDividerStabilizerFootWidth: 90,
        roomDividerStabilizerFootHeight: 45,
        roomDividerStabilizerFootDepth: 360,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "push_to_open",
      },
      {
        width: 800,
        type: "wall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        roomDividerFinishedBack: true,
        roomDividerBackPanelCount: 2,
        roomDividerBackPanelThickness: 18,
        roomDividerStabilizerFootCount: 2,
        roomDividerStabilizerFootWidth: 90,
        roomDividerStabilizerFootHeight: 45,
        roomDividerStabilizerFootDepth: 360,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  home_bar: {
    name: names.home_bar,
    version: 1,
    units: "mm",
    millworkFamily: "bar",
    millworkAssemblyType: "home_bar",
    totalWidth: 2400,
    height: 2100,
    depth: 520,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    modules: [
      {
        width: 800,
        type: "tall",
        frontType: "double_door",
        doorStyle: "glass",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 4,
        stemwareRackEnabled: true,
        stemwareRackLaneCount: CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT,
        stemwareRackDepth: CABINET_DEFAULT_STEMWARE_RACK_DEPTH,
        stemwareRackRailWidth: CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH,
        stemwareRackLaneSpacing: CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING,
        stemwareRackMountHeight: CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT,
        materialId: "white_melamine",
        frontMaterialId: "glass",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 800,
        type: "base",
        height: 900,
        frontType: "door_and_drawer",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 1,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
      {
        width: 800,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 2,
        wineRackColumnCount: 2,
        wineRackRowCount: 4,
        wineRackDepth: 460,
        wineRackDividerThickness: 18,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  kitchen_island: {
    name: names.kitchen_island,
    version: 1,
    units: "mm",
    millworkFamily: "island",
    millworkAssemblyType: "kitchen_island",
    totalWidth: 2440,
    height: 900,
    depth: 1245,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 100,
    revealGap: 3,
    includeCountertop: true,
    countertopThickness: 38,
    countertopOverhangLeft: 20,
    countertopOverhangRight: 20,
    countertopOverhangFront: 25,
    countertopOverhangBack: 320,
    countertopMaterialId: "painted_shaker_white",
    islandSeatingOverhangEnabled: true,
    islandSeatingOverhangDepth: 320,
    islandSupportPanelCount: 3,
    islandSupportPanelThickness: 36,
    islandSupportPanelDepth: 260,
    islandSupportPanelEndInset: 180,
    modules: [
      {
        width: 800,
        type: "base",
        height: 862,
        depth: 900,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 0,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "brushed_steel_bar_pull",
      },
      {
        width: 800,
        type: "base",
        height: 862,
        depth: 900,
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 2,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 800,
        type: "base",
        height: 862,
        depth: 900,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 0,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
      },
    ],
  },
  pantry_system: {
    name: names.pantry_system,
    version: 1,
    units: "mm",
    millworkFamily: "pantry",
    millworkAssemblyType: "pantry_system",
    totalWidth: 2400,
    height: 2400,
    depth: 600,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 80,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 2,
        pantryPullOutTrayEnabled: true,
        pantryPullOutTrayCount: 4,
        pantryPullOutTrayDepth: 520,
        pantryPullOutTrayFrontHeight: 70,
        pantryPullOutSlideClearance: 35,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 600,
        type: "tall",
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 4,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "brushed_steel_bar_pull",
      },
      {
        width: 600,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 6,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "tall",
        frontType: "double_door",
        doorStyle: "glass",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "glass",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
    ],
  },
  wine_storage: {
    name: names.wine_storage,
    version: 1,
    units: "mm",
    millworkFamily: "wine_storage",
    millworkAssemblyType: "wine_storage",
    totalWidth: 1800,
    height: 2100,
    depth: 480,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        frontType: "double_door",
        doorStyle: "glass",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 5,
        materialId: "white_melamine",
        frontMaterialId: "glass",
        hardwareId: "black_bar_pull",
        hingeSide: "double",
      },
      {
        width: 600,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        wineRackColumnCount: 3,
        wineRackRowCount: 6,
        wineRackDepth: 420,
        wineRackDividerThickness: 18,
        materialId: "walnut_veneer",
        frontMaterialId: "walnut_veneer",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "base",
        height: 900,
        frontType: "door_and_drawer",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 1,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "walnut_veneer",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
    ],
  },
  pet_built_in: {
    name: names.pet_built_in,
    version: 1,
    units: "mm",
    millworkFamily: "lifestyle_built_in",
    millworkAssemblyType: "pet_built_in",
    totalWidth: 1800,
    height: 900,
    depth: 520,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "base",
        frontType: "door_and_drawer",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 1,
        shelfCount: 1,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "round_knob",
        hingeSide: "double",
      },
      {
        width: 600,
        type: "base",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 1,
        lifestyleInsertKind: "pet_bed",
        lifestyleInsertCount: 1,
        lifestyleInsertDepth: 460,
        lifestyleInsertDeckHeight: 24,
        lifestyleInsertLipHeight: 80,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "base",
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 3,
        shelfCount: 0,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "brushed_steel_bar_pull",
      },
    ],
  },
  kids_storage: {
    name: names.kids_storage,
    version: 1,
    units: "mm",
    millworkFamily: "lifestyle_built_in",
    millworkAssemblyType: "kids_storage",
    totalWidth: 1800,
    height: 1200,
    depth: 450,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 40,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "base",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 3,
        lifestyleInsertKind: "toy_bin",
        lifestyleInsertCount: 2,
        lifestyleInsertDepth: 400,
        lifestyleInsertDeckHeight: 18,
        lifestyleInsertLipHeight: 120,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "base",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 2,
        materialId: "white_melamine",
        frontMaterialId: "oak_veneer",
        hardwareId: "round_knob",
        hingeSide: "double",
      },
      {
        width: 600,
        type: "base",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 3,
        lifestyleInsertKind: "toy_bin",
        lifestyleInsertCount: 2,
        lifestyleInsertDepth: 400,
        lifestyleInsertDeckHeight: 18,
        lifestyleInsertLipHeight: 120,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
    ],
  },
  hobby_storage: {
    name: names.hobby_storage,
    version: 1,
    units: "mm",
    millworkFamily: "lifestyle_built_in",
    millworkAssemblyType: "hobby_storage",
    totalWidth: 2400,
    height: 1800,
    depth: 520,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 60,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "tall",
        frontType: "double_door",
        doorStyle: "flat_slab",
        doorCount: 2,
        drawerCount: 0,
        shelfCount: 4,
        materialId: "white_melamine",
        frontMaterialId: "matte_black_laminate",
        hardwareId: "edge_pull",
        hingeSide: "double",
      },
      {
        width: 1200,
        type: "base",
        height: 900,
        frontType: "drawer_stack",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 4,
        shelfCount: 0,
        materialId: "white_melamine",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "black_bar_pull",
      },
      {
        width: 600,
        type: "tall",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 5,
        lifestyleInsertKind: "hobby_tray",
        lifestyleInsertCount: 3,
        lifestyleInsertDepth: 460,
        lifestyleInsertDeckHeight: 18,
        lifestyleInsertLipHeight: 70,
        materialId: "white_melamine",
        frontMaterialId: "white_melamine",
        hardwareId: "none",
      },
    ],
  },
  wall_paneling: {
    name: names.wall_paneling,
    version: 1,
    units: "mm",
    millworkFamily: "paneling",
    millworkAssemblyType: "wall_paneling",
    totalWidth: 2400,
    height: 1200,
    depth: 80,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 600,
        type: "wall",
        frontType: "slab_panel",
        doorStyle: "shaker",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 0,
        panelColumnCount: 1,
        panelRowCount: 2,
        panelFrameWidth: 55,
        panelFrameDepth: 18,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "wall",
        frontType: "slab_panel",
        doorStyle: "shaker",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 0,
        panelColumnCount: 1,
        panelRowCount: 2,
        panelFrameWidth: 55,
        panelFrameDepth: 18,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "wall",
        frontType: "slab_panel",
        doorStyle: "shaker",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 0,
        panelColumnCount: 1,
        panelRowCount: 2,
        panelFrameWidth: 55,
        panelFrameDepth: 18,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
      {
        width: 600,
        type: "wall",
        frontType: "slab_panel",
        doorStyle: "shaker",
        doorCount: 1,
        drawerCount: 0,
        shelfCount: 0,
        panelColumnCount: 1,
        panelRowCount: 2,
        panelFrameWidth: 55,
        panelFrameDepth: 18,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
    ],
  },
  slat_wall: {
    name: names.slat_wall,
    version: 1,
    units: "mm",
    millworkFamily: "paneling",
    millworkAssemblyType: "slat_wall",
    totalWidth: 1800,
    height: 2400,
    depth: 90,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: Array.from({ length: 6 }, () => ({
      width: 300,
      type: "wall",
      frontType: "slab_panel",
      doorStyle: "fluted",
      doorCount: 1,
      drawerCount: 0,
      shelfCount: 0,
      slatCount: 4,
      slatWidth: 32,
      slatDepth: 38,
      materialId: "walnut_veneer",
      frontMaterialId: "walnut_veneer",
      hardwareId: "none",
    })),
  },
  ceiling_beams: {
    name: names.ceiling_beams,
    version: 1,
    units: "mm",
    millworkFamily: "ceiling_woodwork",
    millworkAssemblyType: "ceiling_beams",
    totalWidth: 3000,
    height: 180,
    depth: 2400,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 3000,
        type: "wall",
        millworkComponentType: "ceiling_beam_array",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        ceilingBeamCount: 4,
        ceilingBeamWidth: 160,
        ceilingBeamDepth: 180,
        ceilingBeamOrientation: "z",
        materialId: "walnut_veneer",
        frontMaterialId: "walnut_veneer",
        hardwareId: "none",
      },
    ],
  },
  coffered_ceiling: {
    name: names.coffered_ceiling,
    version: 1,
    units: "mm",
    millworkFamily: "ceiling_woodwork",
    millworkAssemblyType: "coffered_ceiling",
    totalWidth: 2400,
    height: 220,
    depth: 2400,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 2400,
        type: "wall",
        millworkComponentType: "coffered_ceiling_grid",
        frontType: "open",
        doorStyle: "shaker",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        ceilingGridColumnCount: 3,
        ceilingGridRowCount: 3,
        ceilingBeamWidth: 120,
        ceilingBeamDepth: 220,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
    ],
  },
  fireplace_surround: {
    name: names.fireplace_surround,
    version: 1,
    units: "mm",
    millworkFamily: "trim",
    millworkAssemblyType: "fireplace_surround",
    totalWidth: 2400,
    height: 2100,
    depth: 220,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 2400,
        type: "wall",
        millworkComponentType: "fireplace_surround_frame",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        fireplaceOpeningWidth: 1100,
        fireplaceOpeningHeight: 900,
        fireplaceLegWidth: 180,
        fireplaceHeaderHeight: 220,
        fireplaceMantelHeight: 120,
        fireplaceMantelDepth: 300,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
    ],
  },
  trim_package: {
    name: names.trim_package,
    version: 1,
    units: "mm",
    millworkFamily: "trim",
    millworkAssemblyType: "trim_package",
    totalWidth: 3200,
    height: 160,
    depth: 90,
    boardThickness: 18,
    backPanelThickness: 6,
    toeKickHeight: 0,
    revealGap: 3,
    modules: [
      {
        width: 3200,
        type: "wall",
        millworkComponentType: "trim_run",
        frontType: "open",
        doorStyle: "flat_slab",
        doorCount: 0,
        drawerCount: 0,
        shelfCount: 0,
        trimMemberCount: 4,
        trimProfileWidth: 160,
        trimProfileDepth: 24,
        trimOrientation: "x",
        trimPlacement: "baseboard",
        trimSetoutHeight: 0,
        materialId: "painted_shaker_white",
        frontMaterialId: "painted_shaker_white",
        hardwareId: "none",
      },
    ],
  },
};

export type CabinetTemplateCategory =
  | "Kitchen"
  | "Bathroom"
  | "Wardrobes & closets"
  | "Living room"
  | "Home office"
  | "Mudroom & entry"
  | "Laundry"
  | "Bedroom"
  | "Small-space systems"
  | "Architectural woodwork";

export type CabinetTemplateDifficulty = "Quick" | "Guided" | "Advanced";
export type CabinetTemplateHost = CabinetRequiredHostType;

export type CabinetTemplateCustomizationOption =
  | "overall_dimensions"
  | "fit_to_space"
  | "module_layout"
  | "front_layout"
  | "door_layout"
  | "drawer_layout"
  | "shelf_layout"
  | "hanging_layout"
  | "door_style"
  | "materials"
  | "hardware"
  | "fillers_and_scribes"
  | "finished_end_panels"
  | "countertop"
  | "toe_kick"
  | "mounting_height"
  | "construction_details"
  | "sink_and_plumbing"
  | "media_opening"
  | "cable_management"
  | "ventilation"
  | "lighting"
  | "appliance_openings"
  | "work_surface"
  | "seating_layout"
  | "hook_layout"
  | "wall_bed_configuration"
  | "deployed_clearance"
  | "bed_platform_layout"
  | "stair_profile"
  | "finished_back"
  | "bar_storage"
  | "stemware_storage"
  | "wine_rack_layout"
  | "pull_out_storage"
  | "lifestyle_inserts"
  | "panel_pattern"
  | "slat_layout"
  | "beam_array"
  | "coffer_grid"
  | "fireplace_opening"
  | "mantel"
  | "trim_profile"
  | "trim_placement";

export type CabinetTemplateRoomType =
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "closet"
  | "living_room"
  | "dining_room"
  | "home_office"
  | "mudroom"
  | "entry"
  | "laundry"
  | "utility_room"
  | "pantry"
  | "library"
  | "playroom"
  | "hobby_room"
  | "pet_area"
  | "hallway"
  | "multipurpose_room"
  | "wine_cellar"
  | "whole_home";

export type CabinetTemplateSafetyClassification =
  | "standard"
  | "anchoring_required"
  | "operational_clearance_required"
  | "structural_review_required"
  | "specialist_installation_required";

export type CabinetTemplateVisualThumbnailKind =
  | "casework"
  | "wall_bed"
  | "fold_down_desk"
  | "platform_bed"
  | "under_stair"
  | "room_divider"
  | "wall_paneling"
  | "slat_wall"
  | "ceiling_beams"
  | "coffered_ceiling"
  | "fireplace_surround"
  | "trim_package";

export type CabinetTemplateVisualThumbnail = Readonly<{
  kind: CabinetTemplateVisualThumbnailKind;
  presetId: CabinetPresetId;
}>;

export type CabinetTemplateDefaultDimensions = Readonly<{
  widthMm: number;
  heightMm: number;
  depthMm: number;
}>;

export type CabinetTemplateDefaultModuleLayoutItem = Readonly<
  Pick<
    CabinetModuleDefinition,
    | "type"
    | "width"
    | "height"
    | "depth"
    | "frontType"
    | "doorStyle"
    | "doorCount"
    | "drawerCount"
    | "shelfCount"
    | "materialId"
    | "frontMaterialId"
    | "hardwareId"
  >
>;

export interface CabinetPresetOption {
  id: CabinetPresetId;
  /** Canonical user-facing template name. */
  name: string;
  /** Backward-compatible card label. */
  label: string;
  category: CabinetTemplateCategory;
  description: string;
  visualThumbnail: CabinetTemplateVisualThumbnail;
  defaultDimensions: CabinetTemplateDefaultDimensions;
  defaultModuleLayout: readonly CabinetTemplateDefaultModuleLayoutItem[];
  defaultMaterialIds: readonly string[];
  defaultHardwareIds: readonly string[];
  difficulty: CabinetTemplateDifficulty;
  estimatedMinutes: number;
  /** Backward-compatible placement field used by the current template cards. */
  host: CabinetTemplateHost;
  /** Explicit host requirement persisted into every definition created from this preset. */
  requiredHostType: CabinetTemplateHost;
  supportedCustomizationOptions: readonly CabinetTemplateCustomizationOption[];
  applicableRoomTypes: readonly CabinetTemplateRoomType[];
  safetyClassification: CabinetTemplateSafetyClassification;
  featured?: boolean;
  keywords: string[];
}

type CabinetPresetOptionCore = Omit<
  CabinetPresetOption,
  | "name"
  | "visualThumbnail"
  | "defaultDimensions"
  | "defaultModuleLayout"
  | "defaultMaterialIds"
  | "defaultHardwareIds"
  | "requiredHostType"
  | "supportedCustomizationOptions"
  | "applicableRoomTypes"
  | "safetyClassification"
>;

type CabinetPresetMetadata = Pick<
  CabinetPresetOption,
  "supportedCustomizationOptions" | "applicableRoomTypes" | "safetyClassification"
>;

const CASEWORK_CORE_OPTIONS = [
  "overall_dimensions",
  "module_layout",
  "front_layout",
  "door_layout",
  "drawer_layout",
  "shelf_layout",
  "door_style",
  "materials",
  "hardware",
  "construction_details",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

const BUILT_IN_FIT_OPTIONS = [
  ...CASEWORK_CORE_OPTIONS,
  "fit_to_space",
  "fillers_and_scribes",
  "finished_end_panels",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

const ARCHITECTURAL_CORE_OPTIONS = [
  "overall_dimensions",
  "fit_to_space",
  "materials",
  "construction_details",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

function definePresetMetadata(
  supportedCustomizationOptions: readonly CabinetTemplateCustomizationOption[],
  applicableRoomTypes: readonly CabinetTemplateRoomType[],
  safetyClassification: CabinetTemplateSafetyClassification,
): CabinetPresetMetadata {
  return { supportedCustomizationOptions, applicableRoomTypes, safetyClassification };
}

/**
 * Curated capability metadata is intentionally exhaustive. A new preset ID must
 * declare its supported controls, intended rooms, and installation risk before
 * TypeScript will accept it as a released template.
 */
const CABINET_PRESET_METADATA = {
  base: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "toe_kick", "countertop"],
    ["kitchen", "laundry", "home_office"],
    "standard",
  ),
  wall: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "fillers_and_scribes", "mounting_height"],
    ["kitchen", "laundry", "utility_room"],
    "anchoring_required",
  ),
  tall: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "toe_kick"],
    ["kitchen", "pantry", "laundry", "utility_room"],
    "anchoring_required",
  ),
  wardrobe: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "toe_kick"],
    ["bedroom", "closet"],
    "anchoring_required",
  ),
  vanity: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "sink_and_plumbing", "countertop", "toe_kick"],
    ["bathroom"],
    "standard",
  ),
  tv_console: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "cable_management", "ventilation"],
    ["living_room", "bedroom", "multipurpose_room"],
    "standard",
  ),
  cabinet_run: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "countertop", "toe_kick"],
    ["kitchen", "laundry", "utility_room"],
    "standard",
  ),
  closet_system: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "lighting", "toe_kick"],
    ["bedroom", "closet"],
    "anchoring_required",
  ),
  media_wall: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "media_opening",
      "cable_management",
      "ventilation",
      "lighting",
    ],
    ["living_room", "bedroom", "multipurpose_room"],
    "anchoring_required",
  ),
  mudroom_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "hook_layout", "seating_layout", "toe_kick"],
    ["mudroom", "entry"],
    "anchoring_required",
  ),
  laundry_room: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "appliance_openings",
      "sink_and_plumbing",
      "countertop",
      "toe_kick",
    ],
    ["laundry", "utility_room"],
    "operational_clearance_required",
  ),
  home_office_built_in: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "work_surface", "cable_management", "lighting", "toe_kick"],
    ["home_office", "bedroom", "multipurpose_room"],
    "anchoring_required",
  ),
  library_wall: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "lighting", "mounting_height"],
    ["library", "living_room", "home_office"],
    "anchoring_required",
  ),
  window_seat: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "seating_layout", "toe_kick"],
    ["living_room", "bedroom", "dining_room"],
    "structural_review_required",
  ),
  banquette: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "seating_layout", "finished_back", "toe_kick"],
    ["dining_room", "kitchen"],
    "structural_review_required",
  ),
  murphy_bed: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "wall_bed_configuration",
      "deployed_clearance",
      "mounting_height",
    ],
    ["bedroom", "home_office", "multipurpose_room"],
    "specialist_installation_required",
  ),
  fold_down_desk: definePresetMetadata(
    [
      "overall_dimensions",
      "fit_to_space",
      "materials",
      "hardware",
      "work_surface",
      "deployed_clearance",
      "mounting_height",
      "construction_details",
    ],
    ["home_office", "bedroom", "multipurpose_room"],
    "operational_clearance_required",
  ),
  platform_storage_bed: definePresetMetadata(
    [
      "overall_dimensions",
      "module_layout",
      "drawer_layout",
      "materials",
      "hardware",
      "bed_platform_layout",
      "construction_details",
    ],
    ["bedroom"],
    "structural_review_required",
  ),
  under_stair_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "stair_profile"],
    ["hallway", "entry", "living_room"],
    "structural_review_required",
  ),
  room_divider_storage: definePresetMetadata(
    [
      ...CASEWORK_CORE_OPTIONS,
      "fit_to_space",
      "finished_back",
      "finished_end_panels",
    ],
    ["living_room", "dining_room", "multipurpose_room"],
    "anchoring_required",
  ),
  home_bar: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "bar_storage",
      "stemware_storage",
      "wine_rack_layout",
      "countertop",
      "lighting",
      "toe_kick",
    ],
    ["living_room", "dining_room", "kitchen"],
    "anchoring_required",
  ),
  kitchen_island: definePresetMetadata(
    [
      ...CASEWORK_CORE_OPTIONS,
      "countertop",
      "seating_layout",
      "finished_back",
      "appliance_openings",
      "sink_and_plumbing",
      "toe_kick",
    ],
    ["kitchen"],
    "structural_review_required",
  ),
  pantry_system: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "pull_out_storage", "toe_kick"],
    ["pantry", "kitchen"],
    "anchoring_required",
  ),
  wine_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "wine_rack_layout", "lighting", "toe_kick"],
    ["wine_cellar", "dining_room", "living_room"],
    "anchoring_required",
  ),
  pet_built_in: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "lifestyle_inserts", "toe_kick"],
    ["pet_area", "mudroom", "entry"],
    "standard",
  ),
  kids_storage: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "lifestyle_inserts", "toe_kick"],
    ["bedroom", "playroom"],
    "anchoring_required",
  ),
  hobby_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "lifestyle_inserts", "work_surface", "toe_kick"],
    ["hobby_room", "home_office", "multipurpose_room"],
    "anchoring_required",
  ),
  wall_paneling: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "panel_pattern", "mounting_height"],
    ["whole_home", "living_room", "dining_room", "bedroom", "entry"],
    "anchoring_required",
  ),
  slat_wall: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "slat_layout", "mounting_height", "lighting"],
    ["whole_home", "living_room", "bedroom", "home_office", "entry"],
    "anchoring_required",
  ),
  ceiling_beams: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "beam_array"],
    ["whole_home", "living_room", "dining_room", "kitchen", "bedroom"],
    "specialist_installation_required",
  ),
  coffered_ceiling: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "coffer_grid"],
    ["whole_home", "living_room", "dining_room", "kitchen", "bedroom"],
    "specialist_installation_required",
  ),
  fireplace_surround: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "fireplace_opening", "mantel"],
    ["living_room", "bedroom"],
    "specialist_installation_required",
  ),
  trim_package: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "trim_profile", "trim_placement"],
    ["whole_home"],
    "standard",
  ),
} satisfies Record<CabinetPresetId, CabinetPresetMetadata>;

const CABINET_PRESET_OPTION_CORES: CabinetPresetOptionCore[] = [
  { id: "base", label: names.base, category: "Kitchen", description: "A finished three-drawer cabinet with worktop-ready proportions.", difficulty: "Quick", estimatedMinutes: 2, host: "Floor", featured: true, keywords: ["drawers", "kitchen", "casework"] },
  { id: "wall", label: names.wall, category: "Kitchen", description: "A two-door wall cabinet with shelves and mounting cleat.", difficulty: "Quick", estimatedMinutes: 2, host: "Wall", featured: true, keywords: ["upper", "doors", "kitchen"] },
  { id: "tall", label: names.tall, category: "Kitchen", description: "Full-height storage with shelves and anti-tip anchoring.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", keywords: ["pantry", "tower", "storage"] },
  { id: "wardrobe", label: names.wardrobe, category: "Wardrobes & closets", description: "Two-door hanging storage with adjustable internal shelves.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", featured: true, keywords: ["closet", "hanging", "bedroom"] },
  { id: "vanity", label: names.vanity, category: "Bathroom", description: "A sink-ready vanity with plumbing chase and countertop cutout.", difficulty: "Guided", estimatedMinutes: 5, host: "Floor", featured: true, keywords: ["bathroom", "sink", "plumbing"] },
  { id: "tv_console", label: names.tv_console, category: "Living room", description: "Low media storage sized for equipment, cables, and ventilation.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", keywords: ["media", "television", "console"] },
  { id: "cabinet_run", label: names.cabinet_run, category: "Kitchen", description: "A coordinated multi-module run ready for fillers and end panels.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", featured: true, keywords: ["kitchen", "multi-module", "built-in"] },
  { id: "closet_system", label: names.closet_system, category: "Wardrobes & closets", description: "Multi-bay hanging, drawer, and shelf storage for a full wall.", difficulty: "Guided", estimatedMinutes: 7, host: "Wall", featured: true, keywords: ["wardrobe", "hanging", "drawers"] },
  { id: "media_wall", label: names.media_wall, category: "Living room", description: "A full media composition with TV opening and service routes.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["television", "cable", "built-in"] },
  { id: "mudroom_storage", label: names.mudroom_storage, category: "Mudroom & entry", description: "Bench, hooks, cubbies, and tall entry storage in one assembly.", difficulty: "Guided", estimatedMinutes: 7, host: "Wall", keywords: ["bench", "hooks", "shoes"] },
  { id: "laundry_room", label: names.laundry_room, category: "Laundry", description: "Cabinetry planned around appliances, clearances, and utility access.", difficulty: "Advanced", estimatedMinutes: 10, host: "Floor", keywords: ["washer", "dryer", "utility"] },
  { id: "home_office_built_in", label: names.home_office_built_in, category: "Home office", description: "Desk, storage, cable routes, and upper shelving for a work wall.", difficulty: "Guided", estimatedMinutes: 8, host: "Wall", keywords: ["desk", "workstation", "shelves"] },
  { id: "library_wall", label: names.library_wall, category: "Living room", description: "Floor-to-ceiling book storage with optional ladder rail details.", difficulty: "Guided", estimatedMinutes: 8, host: "Wall", keywords: ["books", "shelving", "ladder"] },
  { id: "window_seat", label: names.window_seat, category: "Living room", description: "A cushioned window bench with integrated storage below.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["bench", "cushion", "drawers"] },
  { id: "banquette", label: names.banquette, category: "Living room", description: "Built-in dining seating with storage and finished back support.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["dining", "bench", "seating"] },
  { id: "murphy_bed", label: names.murphy_bed, category: "Small-space systems", description: "A vertical wall-bed cabinet with deployed clearance guidance.", difficulty: "Advanced", estimatedMinutes: 12, host: "Wall", keywords: ["wall bed", "convertible", "small space"] },
  { id: "fold_down_desk", label: names.fold_down_desk, category: "Small-space systems", description: "A compact wall-mounted desk that folds away when not in use.", difficulty: "Advanced", estimatedMinutes: 8, host: "Wall", keywords: ["desk", "convertible", "compact"] },
  { id: "platform_storage_bed", label: names.platform_storage_bed, category: "Bedroom", description: "A bed platform with structural ribs and storage-ready bays.", difficulty: "Guided", estimatedMinutes: 8, host: "Floor", keywords: ["bed", "platform", "storage"] },
  { id: "under_stair_storage", label: names.under_stair_storage, category: "Small-space systems", description: "Stepped storage fitted to the slope beneath a stair.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["stair", "scribe", "compact"] },
  { id: "room_divider_storage", label: names.room_divider_storage, category: "Small-space systems", description: "Two-sided open storage that also defines a room boundary.", difficulty: "Advanced", estimatedMinutes: 9, host: "Floor", keywords: ["divider", "two-sided", "open"] },
  { id: "home_bar", label: names.home_bar, category: "Living room", description: "Display, bottle, stemware, and base storage for a complete bar wall.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["bar", "wine", "stemware"] },
  { id: "kitchen_island", label: names.kitchen_island, category: "Kitchen", description: "A freestanding island with worktop, seating overhang, and supports.", difficulty: "Guided", estimatedMinutes: 8, host: "Floor", keywords: ["island", "seating", "worktop"] },
  { id: "pantry_system", label: names.pantry_system, category: "Kitchen", description: "Tall food storage with pull-out trays and accessible clearances.", difficulty: "Guided", estimatedMinutes: 7, host: "Floor", keywords: ["pantry", "pull-out", "tall"] },
  { id: "wine_storage", label: names.wine_storage, category: "Living room", description: "Purpose-built bottle storage with configurable rack bays.", difficulty: "Guided", estimatedMinutes: 7, host: "Floor", keywords: ["wine", "bottles", "rack"] },
  { id: "pet_built_in", label: names.pet_built_in, category: "Mudroom & entry", description: "Integrated pet bed and storage sized as real cabinet modules.", difficulty: "Quick", estimatedMinutes: 4, host: "Floor", keywords: ["pet", "bed", "entry"] },
  { id: "kids_storage", label: names.kids_storage, category: "Bedroom", description: "Low, approachable toy and display storage for children’s rooms.", difficulty: "Quick", estimatedMinutes: 4, host: "Floor", keywords: ["kids", "toys", "low storage"] },
  { id: "hobby_storage", label: names.hobby_storage, category: "Home office", description: "Tall organized storage with trays for craft or hobby supplies.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["craft", "hobby", "trays"] },
  { id: "wall_paneling", label: names.wall_paneling, category: "Architectural woodwork", description: "Framed decorative wall panels with repeatable bay proportions.", difficulty: "Guided", estimatedMinutes: 6, host: "Wall", keywords: ["panels", "wainscot", "feature wall"] },
  { id: "slat_wall", label: names.slat_wall, category: "Architectural woodwork", description: "A dimensional timber slat feature with controlled spacing.", difficulty: "Quick", estimatedMinutes: 4, host: "Wall", keywords: ["slats", "feature wall", "timber"] },
  { id: "ceiling_beams", label: names.ceiling_beams, category: "Architectural woodwork", description: "A repeated decorative beam array across a ceiling span.", difficulty: "Guided", estimatedMinutes: 6, host: "Ceiling", keywords: ["beams", "ceiling", "array"] },
  { id: "coffered_ceiling", label: names.coffered_ceiling, category: "Architectural woodwork", description: "A regular coffer grid with controlled rows and columns.", difficulty: "Advanced", estimatedMinutes: 9, host: "Ceiling", keywords: ["coffer", "ceiling", "grid"] },
  { id: "fireplace_surround", label: names.fireplace_surround, category: "Architectural woodwork", description: "A mantel and framed opening with adjustable surround proportions.", difficulty: "Advanced", estimatedMinutes: 9, host: "Wall", keywords: ["fireplace", "mantel", "surround"] },
  { id: "trim_package", label: names.trim_package, category: "Architectural woodwork", description: "Coordinated base, casing, crown, or feature trim runs.", difficulty: "Advanced", estimatedMinutes: 8, host: "Flexible", keywords: ["trim", "moulding", "casing"] },
];

const CABINET_PRESET_THUMBNAIL_KINDS = {
  base: "casework",
  wall: "casework",
  tall: "casework",
  wardrobe: "casework",
  vanity: "casework",
  tv_console: "casework",
  cabinet_run: "casework",
  closet_system: "casework",
  media_wall: "casework",
  mudroom_storage: "casework",
  laundry_room: "casework",
  home_office_built_in: "casework",
  library_wall: "casework",
  window_seat: "casework",
  banquette: "casework",
  murphy_bed: "wall_bed",
  fold_down_desk: "fold_down_desk",
  platform_storage_bed: "platform_bed",
  under_stair_storage: "under_stair",
  room_divider_storage: "room_divider",
  home_bar: "casework",
  kitchen_island: "casework",
  pantry_system: "casework",
  wine_storage: "casework",
  pet_built_in: "casework",
  kids_storage: "casework",
  hobby_storage: "casework",
  wall_paneling: "wall_paneling",
  slat_wall: "slat_wall",
  ceiling_beams: "ceiling_beams",
  coffered_ceiling: "coffered_ceiling",
  fireplace_surround: "fireplace_surround",
  trim_package: "trim_package",
} as const satisfies Record<CabinetPresetId, CabinetTemplateVisualThumbnailKind>;

export const CABINET_PRESET_OPTIONS: CabinetPresetOption[] = CABINET_PRESET_OPTION_CORES.map(
  (option) => {
    const definition = presets[option.id];
    const defaultModuleLayout = definition.modules.map((module) => ({
      type: module.type ?? unitTypeByPreset[option.id],
      width: module.width,
      height: module.height ?? definition.height,
      depth: module.depth ?? definition.depth,
      frontType: module.frontType,
      doorStyle: module.doorStyle,
      doorCount: module.doorCount,
      drawerCount: module.drawerCount,
      shelfCount: module.shelfCount,
      materialId: module.materialId,
      frontMaterialId: module.frontMaterialId,
      hardwareId: module.hardwareId ?? "none",
    }));

    return {
      ...option,
      ...CABINET_PRESET_METADATA[option.id],
      name: option.label,
      visualThumbnail: {
        kind: CABINET_PRESET_THUMBNAIL_KINDS[option.id],
        presetId: option.id,
      },
      defaultDimensions: {
        widthMm: definition.totalWidth,
        heightMm: definition.height,
        depthMm: definition.depth,
      },
      defaultModuleLayout,
      defaultMaterialIds: [
        ...new Set(
          defaultModuleLayout.flatMap((module) =>
            module.frontMaterialId
              ? [module.materialId, module.frontMaterialId]
              : [module.materialId]
          )
        ),
      ],
      defaultHardwareIds: [
        ...new Set(defaultModuleLayout.map((module) => module.hardwareId ?? "none")),
      ],
      requiredHostType: option.host,
    };
  },
);

export type CabinetTemplateCatalogFilter = CabinetTemplateCategory | "Featured" | "All";

function normalizeCabinetTemplateSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

/**
 * Builds the complete public search surface for a template. Search includes the
 * installation, room, customization, dimensional, material, and hardware
 * metadata—not only the marketing copy visible on its card.
 */
export function getCabinetPresetSearchText(option: CabinetPresetOption): string {
  const materialNames = option.defaultMaterialIds.map(
    (materialId) =>
      CABINET_MATERIALS.find((material) => material.id === materialId)?.name ?? materialId
  );
  const hardwareNames = option.defaultHardwareIds.map(
    (hardwareId) =>
      CABINET_HARDWARE.find((hardware) => hardware.id === hardwareId)?.name ?? hardwareId
  );
  const dimensions = option.defaultDimensions;

  return [
    option.id,
    option.name,
    option.label,
    option.category,
    option.description,
    option.difficulty,
    `${option.estimatedMinutes} min minutes`,
    option.host,
    option.requiredHostType,
    option.safetyClassification,
    ...option.keywords,
    ...option.supportedCustomizationOptions,
    ...option.applicableRoomTypes,
    `${dimensions.widthMm} ${dimensions.heightMm} ${dimensions.depthMm} mm`,
    `${option.defaultModuleLayout.length} module modules`,
    ...option.defaultModuleLayout.map((module) => module.frontType),
    ...option.defaultMaterialIds,
    ...materialNames,
    ...option.defaultHardwareIds,
    ...hardwareNames,
  ]
    .map((value) => normalizeCabinetTemplateSearchTerm(String(value)))
    .filter(Boolean)
    .join(" ");
}

/** Pure catalog predicate shared by the Studio and focused non-browser tests. */
export function cabinetPresetMatchesCatalogFilters(
  option: CabinetPresetOption,
  query: string,
  filter: CabinetTemplateCatalogFilter,
): boolean {
  const queryTerms = normalizeCabinetTemplateSearchTerm(query).split(/\s+/).filter(Boolean);
  const matchesSearch = queryTerms.every((term) =>
    getCabinetPresetSearchText(option).includes(term)
  );
  const matchesCategory =
    filter === "All" ||
    (filter === "Featured"
      ? queryTerms.length > 0 || Boolean(option.featured)
      : option.category === filter);

  return matchesSearch && matchesCategory;
}

export function createCabinetPreset(presetId: CabinetPresetId, id = `cabinet-${presetId}`): CabinetDefinition {
  const preset = presets[presetId];
  const timestamp = nowIso();

  const definition: CabinetDefinition = {
    ...preset,
    id,
    sourcePresetId: presetId,
    requiredHostType:
      CABINET_PRESET_OPTIONS.find((option) => option.id === presetId)?.requiredHostType ??
      "Flexible",
    totalWidth: preset.totalWidth,
    height: preset.height,
    depth: preset.depth,
    materials: CABINET_MATERIALS,
    hardware: CABINET_HARDWARE,
    modules: preset.modules.map((module, index) => ({
      id: `module-${index + 1}`,
      ...module,
      type: module.type ?? unitTypeByPreset[presetId],
      height: module.height ?? preset.height,
      depth: module.depth ?? preset.depth,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...definition,
    automation: createCabinetAutomationState(definition),
  };
}

export function getCabinetPresetMillworkAssemblyType(
  presetId: CabinetPresetId
): CabinetDefinition["millworkAssemblyType"] {
  return presets[presetId].millworkAssemblyType;
}
