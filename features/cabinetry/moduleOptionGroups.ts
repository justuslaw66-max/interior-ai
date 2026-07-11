import type { MillworkAssemblyType } from "@/features/millwork/types";
import type {
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
  CabinetUnitType,
} from "./types";

export const CABINET_MODULE_OPTION_GROUP_IDS = [
  "installation_cleat",
  "anti_tip",
  "hanging_rods",
  "shelf_pins",
  "hamper",
  "slat",
  "panel",
  "ceiling",
  "trim",
  "fireplace",
  "convertible",
  "platform_bed",
  "stair",
  "room_divider",
  "lifestyle",
  "pantry",
  "wine",
  "seating",
  "mudroom",
  "sink",
  "laundry",
  "office",
  "media",
  "library",
  "lighting",
] as const;

export type CabinetModuleOptionGroupId =
  (typeof CABINET_MODULE_OPTION_GROUP_IDS)[number];

export interface CabinetModuleOptionGroupContext {
  assemblyType?: MillworkAssemblyType;
  module: CabinetModuleDefinition;
}

export interface CabinetModuleOptionGroupDefinition {
  label: string;
  controlTestIds: readonly string[];
  allCabinetModules?: boolean;
  assemblyTypes?: readonly MillworkAssemblyType[];
  componentTypes?: readonly CabinetMillworkComponentType[];
  unitTypes?: readonly CabinetUnitType[];
  isFeatureActive?: (module: CabinetModuleDefinition) => boolean;
}

const CLOSET_ASSEMBLIES = [
  "closet_system",
  "wardrobe",
] as const satisfies readonly MillworkAssemblyType[];
const CONVERTIBLE_ASSEMBLIES = [
  "murphy_bed",
  "fold_down_desk",
] as const satisfies readonly MillworkAssemblyType[];
const LIFESTYLE_ASSEMBLIES = [
  "pet_built_in",
  "kids_storage",
  "hobby_storage",
] as const satisfies readonly MillworkAssemblyType[];
const SEATING_ASSEMBLIES = [
  "window_seat",
  "banquette",
] as const satisfies readonly MillworkAssemblyType[];
const WINE_ASSEMBLIES = [
  "wine_storage",
  "home_bar",
] as const satisfies readonly MillworkAssemblyType[];

/**
 * Declarative visibility rules for the Detailed inspector's More module options.
 * Existing feature state remains editable after an import or assembly conversion,
 * while unrelated specialty controls stay out of ordinary casework.
 */
export const CABINET_MODULE_OPTION_GROUP_REGISTRY: Readonly<
  Record<CabinetModuleOptionGroupId, CabinetModuleOptionGroupDefinition>
> = {
  installation_cleat: {
    label: "Installation cleat",
    allCabinetModules: true,
    controlTestIds: [
      "cabinet-input-installation-cleat-enabled",
      "cabinet-input-installation-cleat-height",
      "cabinet-input-installation-cleat-thickness",
      "cabinet-input-installation-cleat-inset",
    ],
  },
  anti_tip: {
    label: "Anti-tip anchors",
    unitTypes: ["tall", "wardrobe"],
    isFeatureActive: (module) => module.antiTipAnchorEnabled === true,
    controlTestIds: [
      "cabinet-input-anti-tip-anchor-enabled",
      "cabinet-input-anti-tip-anchor-count",
      "cabinet-input-anti-tip-anchor-height",
      "cabinet-input-anti-tip-anchor-inset",
    ],
  },
  hanging_rods: {
    label: "Hanging rods",
    assemblyTypes: CLOSET_ASSEMBLIES,
    unitTypes: ["wardrobe"],
    isFeatureActive: (module) => (module.hangingRodCount ?? 0) > 0,
    controlTestIds: [
      "cabinet-input-hanging-rods",
      "cabinet-input-hanging-rod-height",
      "cabinet-input-hanging-rod-spacing",
    ],
  },
  shelf_pins: {
    label: "Adjustable shelf pins",
    allCabinetModules: true,
    controlTestIds: [
      "cabinet-input-shelf-pin-rows-enabled",
      "cabinet-input-shelf-pin-row-pairs",
      "cabinet-input-shelf-pin-holes",
      "cabinet-input-shelf-pin-spacing",
      "cabinet-input-shelf-pin-inset",
      "cabinet-input-shelf-pin-start-height",
    ],
  },
  hamper: {
    label: "Pull-out hamper",
    assemblyTypes: [
      ...CLOSET_ASSEMBLIES,
      "laundry_room_cabinetry",
    ],
    unitTypes: ["wardrobe"],
    isFeatureActive: (module) => module.hamperPullOutEnabled === true,
    controlTestIds: [
      "cabinet-input-hamper-pullout-enabled",
      "cabinet-input-hamper-baskets",
      "cabinet-input-hamper-basket-depth",
      "cabinet-input-hamper-basket-height",
      "cabinet-input-hamper-slide-clearance",
    ],
  },
  slat: {
    label: "Slat wall",
    assemblyTypes: ["slat_wall"],
    controlTestIds: [
      "cabinet-input-slats",
      "cabinet-input-slat-width",
      "cabinet-input-slat-depth",
      "cabinet-input-slat-spacing",
    ],
  },
  panel: {
    label: "Wall paneling",
    assemblyTypes: ["wall_paneling"],
    controlTestIds: [
      "cabinet-input-panel-columns",
      "cabinet-input-panel-rows",
      "cabinet-input-panel-frame-width",
      "cabinet-input-panel-frame-depth",
    ],
  },
  ceiling: {
    label: "Ceiling woodwork",
    assemblyTypes: ["ceiling_beams", "coffered_ceiling"],
    componentTypes: ["ceiling_beam_array", "coffered_ceiling_grid"],
    controlTestIds: [
      "cabinet-input-ceiling-beams",
      "cabinet-input-ceiling-beam-width",
      "cabinet-input-ceiling-beam-depth",
      "cabinet-input-ceiling-beam-orientation",
      "cabinet-input-ceiling-grid-columns",
      "cabinet-input-ceiling-grid-rows",
    ],
  },
  trim: {
    label: "Trim run",
    assemblyTypes: ["trim_package"],
    componentTypes: ["trim_run"],
    controlTestIds: [
      "cabinet-input-trim-members",
      "cabinet-input-trim-profile-width",
      "cabinet-input-trim-profile-depth",
      "cabinet-input-trim-orientation",
      "cabinet-input-trim-placement",
      "cabinet-input-trim-setout-height",
      "cabinet-input-trim-left-end-treatment",
      "cabinet-input-trim-right-end-treatment",
      "cabinet-input-trim-return-depth",
      "cabinet-input-trim-miter-angle",
      "cabinet-input-trim-reveal-strip-enabled",
      "cabinet-input-trim-reveal-strip-height",
      "cabinet-input-trim-reveal-strip-depth",
      "cabinet-input-trim-reveal-strip-inset",
    ],
  },
  fireplace: {
    label: "Fireplace surround",
    assemblyTypes: ["fireplace_surround"],
    componentTypes: ["fireplace_surround_frame"],
    controlTestIds: [
      "cabinet-input-fireplace-opening-width",
      "cabinet-input-fireplace-opening-height",
      "cabinet-input-fireplace-leg-width",
      "cabinet-input-fireplace-header-height",
      "cabinet-input-fireplace-mantel-height",
      "cabinet-input-fireplace-mantel-depth",
    ],
  },
  convertible: {
    label: "Convertible panel",
    assemblyTypes: CONVERTIBLE_ASSEMBLIES,
    componentTypes: ["wall_bed_panel", "fold_down_worksurface"],
    controlTestIds: [
      "cabinet-input-convertible-panel-thickness",
      "cabinet-input-convertible-panel-height",
      "cabinet-input-convertible-open-depth",
      "cabinet-input-convertible-hinge-height",
      "cabinet-input-convertible-support-legs",
      "cabinet-input-convertible-support-leg-width",
      "cabinet-input-convertible-support-leg-depth",
    ],
  },
  platform_bed: {
    label: "Platform storage bed",
    assemblyTypes: ["platform_storage_bed"],
    controlTestIds: [
      "cabinet-input-platform-deck-thickness",
      "cabinet-input-platform-deck-overhang-front",
      "cabinet-input-platform-deck-overhang-back",
      "cabinet-input-platform-support-ribs",
      "cabinet-input-platform-support-rib-width",
      "cabinet-input-platform-support-rib-height",
    ],
  },
  stair: {
    label: "Under-stair fitting",
    assemblyTypes: ["under_stair_storage"],
    controlTestIds: [
      "cabinet-input-stair-scribe-steps",
      "cabinet-input-stair-scribe-high-height",
      "cabinet-input-stair-scribe-low-height",
      "cabinet-input-stair-scribe-depth",
      "cabinet-input-stair-scribe-direction",
    ],
  },
  room_divider: {
    label: "Room divider",
    assemblyTypes: ["room_divider_storage"],
    controlTestIds: [
      "cabinet-input-room-divider-finished-back",
      "cabinet-input-room-divider-back-panels",
      "cabinet-input-room-divider-back-panel-thickness",
      "cabinet-input-room-divider-stabilizer-feet",
      "cabinet-input-room-divider-stabilizer-foot-width",
      "cabinet-input-room-divider-stabilizer-foot-height",
      "cabinet-input-room-divider-stabilizer-foot-depth",
    ],
  },
  lifestyle: {
    label: "Lifestyle insert",
    assemblyTypes: LIFESTYLE_ASSEMBLIES,
    controlTestIds: [
      "cabinet-input-lifestyle-insert-kind",
      "cabinet-input-lifestyle-insert-count",
      "cabinet-input-lifestyle-insert-depth",
      "cabinet-input-lifestyle-insert-deck-height",
      "cabinet-input-lifestyle-insert-lip-height",
    ],
  },
  pantry: {
    label: "Pantry pull-outs",
    assemblyTypes: ["pantry_system"],
    isFeatureActive: (module) => module.pantryPullOutTrayEnabled === true,
    controlTestIds: [
      "cabinet-input-pantry-pullouts-enabled",
      "cabinet-input-pantry-pullout-trays",
      "cabinet-input-pantry-pullout-tray-depth",
      "cabinet-input-pantry-pullout-front-height",
      "cabinet-input-pantry-pullout-slide-clearance",
    ],
  },
  wine: {
    label: "Wine and stemware storage",
    assemblyTypes: WINE_ASSEMBLIES,
    isFeatureActive: (module) =>
      (module.wineRackColumnCount ?? 0) > 0 ||
      module.stemwareRackEnabled === true,
    controlTestIds: [
      "cabinet-input-wine-rack-columns",
      "cabinet-input-wine-rack-rows",
      "cabinet-input-wine-rack-depth",
      "cabinet-input-wine-rack-divider-thickness",
      "cabinet-input-stemware-rack-enabled",
      "cabinet-input-stemware-rack-lanes",
      "cabinet-input-stemware-rack-depth",
      "cabinet-input-stemware-rack-rail-width",
      "cabinet-input-stemware-rack-lane-spacing",
      "cabinet-input-stemware-rack-mount-height",
    ],
  },
  seating: {
    label: "Built-in seating",
    assemblyTypes: SEATING_ASSEMBLIES,
    controlTestIds: [
      "cabinet-input-seat-deck-thickness",
      "cabinet-input-seat-cushion-thickness",
      "cabinet-input-seat-cushion-depth",
      "cabinet-input-seat-cushion-overhang-front",
      "cabinet-input-seat-back-height",
      "cabinet-input-seat-back-thickness",
    ],
  },
  mudroom: {
    label: "Mudroom inserts",
    assemblyTypes: ["mudroom_storage"],
    controlTestIds: [
      "cabinet-input-mudroom-hooks",
      "cabinet-input-mudroom-hook-rail-height",
      "cabinet-input-mudroom-hook-projection",
      "cabinet-input-shoe-cubbies",
      "cabinet-input-shoe-cubby-height",
      "cabinet-input-shoe-cubby-depth",
      "cabinet-input-shoe-cubby-divider-thickness",
    ],
  },
  sink: {
    label: "Sink service zone",
    assemblyTypes: ["vanity"],
    unitTypes: ["vanity"],
    isFeatureActive: (module) => module.sinkCutoutEnabled === true,
    controlTestIds: [
      "cabinet-input-sink-cutout-enabled",
      "cabinet-input-sink-cutout-width",
      "cabinet-input-sink-cutout-depth",
      "cabinet-input-sink-cutout-offset-x",
      "cabinet-input-sink-cutout-offset-z",
      "cabinet-input-plumbing-chase-width",
      "cabinet-input-plumbing-chase-height",
      "cabinet-input-plumbing-chase-depth",
    ],
  },
  laundry: {
    label: "Laundry appliance bay",
    assemblyTypes: ["laundry_room_cabinetry"],
    isFeatureActive: (module) => module.laundryApplianceBayEnabled === true,
    controlTestIds: [
      "cabinet-input-laundry-appliance-bay-enabled",
      "cabinet-input-laundry-appliance-kind",
      "cabinet-input-laundry-appliances",
      "cabinet-input-laundry-appliance-width",
      "cabinet-input-laundry-appliance-height",
      "cabinet-input-laundry-appliance-depth",
      "cabinet-input-laundry-appliance-side-clearance",
      "cabinet-input-laundry-appliance-top-clearance",
      "cabinet-input-laundry-appliance-back-clearance",
      "cabinet-input-laundry-utility-chase-height",
      "cabinet-input-laundry-utility-chase-depth",
    ],
  },
  office: {
    label: "Office workstation",
    assemblyTypes: ["home_office_built_in"],
    isFeatureActive: (module) => module.officeWorksurfaceEnabled === true,
    controlTestIds: [
      "cabinet-input-office-worksurface-enabled",
      "cabinet-input-office-worksurface-thickness",
      "cabinet-input-office-worksurface-depth",
      "cabinet-input-office-worksurface-overhang-front",
      "cabinet-input-cable-grommets",
      "cabinet-input-cable-grommet-diameter",
      "cabinet-input-cable-grommet-offset-from-back",
      "cabinet-input-desk-power-chase-height",
      "cabinet-input-desk-power-chase-depth",
    ],
  },
  media: {
    label: "Media wall service zone",
    assemblyTypes: ["media_wall"],
    isFeatureActive: (module) => module.mediaWallEnabled === true,
    controlTestIds: [
      "cabinet-input-media-wall-enabled",
      "cabinet-input-media-tv-opening-width",
      "cabinet-input-media-tv-opening-height",
      "cabinet-input-media-tv-mount-height",
      "cabinet-input-media-tv-blocking-thickness",
      "cabinet-input-media-cable-chase-width",
      "cabinet-input-media-cable-chase-height",
      "cabinet-input-media-cable-chase-depth",
      "cabinet-input-media-vent-slots",
      "cabinet-input-media-vent-slot-width",
      "cabinet-input-media-vent-slot-height",
      "cabinet-input-media-vent-slot-spacing",
    ],
  },
  library: {
    label: "Library ladder rail",
    assemblyTypes: ["library_wall"],
    isFeatureActive: (module) => module.libraryLadderRailEnabled === true,
    controlTestIds: [
      "cabinet-input-library-ladder-rail-enabled",
      "cabinet-input-library-ladder-rail-height",
      "cabinet-input-library-ladder-rail-diameter",
      "cabinet-input-library-ladder-rail-projection",
      "cabinet-input-library-ladder-standoffs",
      "cabinet-input-library-ladder-standoff-diameter",
    ],
  },
  lighting: {
    label: "Integrated lighting",
    allCabinetModules: true,
    controlTestIds: [
      "cabinet-input-lighting-channel-enabled",
      "cabinet-input-lighting-channel-count",
      "cabinet-input-lighting-channel-depth",
      "cabinet-input-lighting-channel-height",
      "cabinet-input-lighting-channel-inset",
    ],
  },
};

function includesValue<T extends string>(
  values: readonly T[] | undefined,
  value: T | undefined
): boolean {
  return value !== undefined && (values?.includes(value) ?? false);
}

/** Returns whether a group belongs to the current assembly/module context. */
export function isCabinetModuleOptionGroupApplicable(
  groupId: CabinetModuleOptionGroupId,
  context: CabinetModuleOptionGroupContext
): boolean {
  const group = CABINET_MODULE_OPTION_GROUP_REGISTRY[groupId];
  const componentType = context.module.millworkComponentType ?? "cabinet";
  if (group.componentTypes) {
    return includesValue(group.componentTypes, componentType);
  }
  if (componentType !== "cabinet") return false;
  if (group.allCabinetModules && componentType === "cabinet") return true;

  return (
    includesValue(group.assemblyTypes, context.assemblyType) ||
    includesValue(group.unitTypes, context.module.type) ||
    group.isFeatureActive?.(context.module) === true
  );
}

/**
 * Returns the visible groups, allowing one explicit property-search reveal to
 * override normal contextual filtering without changing the saved definition.
 */
export function getVisibleCabinetModuleOptionGroupIds(
  context: CabinetModuleOptionGroupContext,
  explicitlyRevealedGroupId?: CabinetModuleOptionGroupId | null
): CabinetModuleOptionGroupId[] {
  return CABINET_MODULE_OPTION_GROUP_IDS.filter(
    (groupId) =>
      groupId === explicitlyRevealedGroupId ||
      isCabinetModuleOptionGroupApplicable(groupId, context)
  );
}

export const CABINET_MODULE_OPTION_GROUP_BY_CONTROL_TEST_ID: Readonly<
  Record<string, CabinetModuleOptionGroupId>
> = Object.fromEntries(
  CABINET_MODULE_OPTION_GROUP_IDS.flatMap((groupId) =>
    CABINET_MODULE_OPTION_GROUP_REGISTRY[groupId].controlTestIds.map(
      (controlTestId) => [controlTestId, groupId] as const
    )
  )
);

/** Finds the group that must be mounted before focusing a searched control. */
export function getCabinetModuleOptionGroupIdForControlTestId(
  controlTestId: string
): CabinetModuleOptionGroupId | undefined {
  return CABINET_MODULE_OPTION_GROUP_BY_CONTROL_TEST_ID[controlTestId];
}
