import type {
  MillworkAssemblyProfile,
  MillworkAssemblyType,
  MillworkFabricationComplexity,
  MillworkFamily,
  MillworkPlacementKind,
  MillworkProjectPhase,
} from "./types";

type ProfileSeed = {
  label: string;
  projectPhase: MillworkProjectPhase;
  placementKind: MillworkPlacementKind;
  fabricationComplexity: MillworkFabricationComplexity;
  fieldMeasurementRequirements: string[];
  serviceCoordination: string[];
  installationConstraints: string[];
  quoteDrivers: string[];
};

const commonFieldMeasurements = [
  "Verify finished opening width, height, depth, and adjacent clearances.",
  "Confirm floor level, wall plumb, out-of-square conditions, and scribe allowances.",
];

const commonServices = [
  "Confirm electrical, plumbing, low-voltage, HVAC, and appliance conflicts before fabrication.",
];

const commonInstallConstraints = [
  "Confirm delivery path, protection, fastening substrate, and installation sequence.",
];

const commonQuoteDrivers = [
  "Overall dimensions",
  "module count",
  "finish material",
  "hardware count",
];

function seed(input: ProfileSeed): ProfileSeed {
  return input;
}

const PROFILE_SEEDS: Record<MillworkAssemblyType, ProfileSeed> = {
  base: seed({
    label: "Base cabinet",
    projectPhase: "mvp",
    placementKind: "floor_set",
    fabricationComplexity: "standard",
    fieldMeasurementRequirements: commonFieldMeasurements,
    serviceCoordination: commonServices,
    installationConstraints: commonInstallConstraints,
    quoteDrivers: commonQuoteDrivers,
  }),
  wall: seed({
    label: "Wall cabinet",
    projectPhase: "mvp",
    placementKind: "wall_mounted",
    fabricationComplexity: "standard",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Locate studs, blocking, ceiling height, and wall-cabinet mounting datum.",
    ],
    serviceCoordination: commonServices,
    installationConstraints: [
      "Confirm wall substrate, blocking, fastener schedule, and overhead installation access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "mounting hardware"],
  }),
  tall: seed({
    label: "Tall cabinet",
    projectPhase: "mvp",
    placementKind: "built_in_wall",
    fabricationComplexity: "standard",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify ceiling height, baseboard return, anti-tip anchoring, and plinth conditions.",
    ],
    serviceCoordination: commonServices,
    installationConstraints: [
      "Confirm upright installation clearance, anti-tip fastening, and scribe/filler plan.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "tall panel yield"],
  }),
  vanity: seed({
    label: "Bathroom vanity",
    projectPhase: "mvp",
    placementKind: "floor_set",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure sink centerlines, trap zone, wall tile returns, and countertop overhangs.",
    ],
    serviceCoordination: [
      "Coordinate plumbing, countertop, sink, faucet, mirror, lighting, and GFCI outlet locations.",
    ],
    installationConstraints: [
      "Confirm moisture exposure, wall fastening, plumbing cutouts, and countertop sequencing.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "plumbing cutouts", "countertop coordination"],
  }),
  tv_console: seed({
    label: "TV console",
    projectPhase: "mvp",
    placementKind: "floor_set",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Confirm TV width, media equipment depth, ventilation gaps, and cable path.",
    ],
    serviceCoordination: [
      "Coordinate power, data, HDMI, speaker wire, cable pass-throughs, and equipment ventilation.",
    ],
    installationConstraints: [
      "Confirm media equipment access, removable backs, and wall outlet alignment.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "ventilation details", "cable management"],
  }),
  wardrobe: seed({
    label: "Wardrobe",
    projectPhase: "mvp",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify ceiling height, hanging sections, shelf spans, and door swing or sliding clearances.",
    ],
    serviceCoordination: ["Coordinate lighting, switches, outlets, and ventilation if specified."],
    installationConstraints: [
      "Confirm wall anchoring, anti-tip hardware, plinth leveling, and door adjustment access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "door system", "interior accessories"],
  }),
  cabinet_run: seed({
    label: "Cabinet run",
    projectPhase: "mvp",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify run length, filler widths, appliance clearances, and end-panel exposure.",
    ],
    serviceCoordination: commonServices,
    installationConstraints: [
      "Confirm module sequencing, leveling strategy, fillers, scribes, and countertop readiness.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "filler/end panels", "countertop coordination"],
  }),
  closet_system: seed({
    label: "Closet system",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure hanging heights, return walls, door tracks, and access clearances.",
    ],
    serviceCoordination: ["Coordinate closet lighting, switches, outlets, sensors, and ventilation."],
    installationConstraints: [
      "Confirm wall anchoring, shelf span limits, hanging loads, and accessory positions.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "accessory package", "hanging hardware"],
  }),
  murphy_bed: seed({
    label: "Murphy bed",
    projectPhase: "phase_3",
    placementKind: "convertible_built_in",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify deployed bed clearance, mattress size, floor level, and ceiling height.",
    ],
    serviceCoordination: ["Coordinate lighting, outlets, side tables, and any integrated desk hardware."],
    installationConstraints: [
      "Confirm structural anchoring, lift mechanism specification, safety clearances, and installer signoff.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "bed mechanism", "safety hardware"],
  }),
  fold_down_desk: seed({
    label: "Fold-down desk",
    projectPhase: "phase_3",
    placementKind: "convertible_built_in",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify deployed work surface clearance, knee space, outlet access, and latch height.",
    ],
    serviceCoordination: ["Coordinate task lighting, outlets, cable routing, and wall blocking."],
    installationConstraints: [
      "Confirm hinge/lift hardware, wall anchoring, latch position, and operating clearance.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "folding hardware", "operable mechanism"],
  }),
  platform_storage_bed: seed({
    label: "Platform storage bed",
    projectPhase: "phase_3",
    placementKind: "floor_set",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify mattress size, drawer pull-out clearances, headboard conditions, and outlet locations.",
    ],
    serviceCoordination: ["Coordinate bedside outlets, lighting, and hidden cable routes."],
    installationConstraints: [
      "Confirm floor level, assembly sequence, drawer access, and serviceability around the bed.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "drawer storage", "bed platform span"],
  }),
  media_wall: seed({
    label: "Media wall",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure TV size, bracket blocking, speaker zones, equipment depth, and ventilation path.",
    ],
    serviceCoordination: [
      "Coordinate power, data, low-voltage, speakers, ventilation, fireplace clearances, and bracket blocking.",
    ],
    installationConstraints: [
      "Confirm access panels, removable backs, wall substrate, and media equipment service zones.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "media service cutouts", "ventilation and access panels"],
  }),
  mudroom_storage: seed({
    label: "Mudroom storage",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify bench height, hook height, footwear clearance, door swings, and traffic path.",
    ],
    serviceCoordination: ["Coordinate outlets, charging cubbies, HVAC returns, and entry hardware conflicts."],
    installationConstraints: [
      "Confirm durable finish, wall anchoring, bench support, and cleanable toe/base details.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "bench support", "hook/accessory hardware"],
  }),
  home_office_built_in: seed({
    label: "Home office built-in",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify desk height, knee space, monitor zones, printer depth, and file storage clearances.",
    ],
    serviceCoordination: ["Coordinate power, data, cable trays, task lighting, and printer ventilation."],
    installationConstraints: [
      "Confirm desktop support, grommet locations, wall anchoring, and sequencing around outlets.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "desktop surface", "cable management"],
  }),
  library_wall: seed({
    label: "Library wall",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify shelf spans, ceiling height, ladder rail needs, and wall anchoring.",
    ],
    serviceCoordination: ["Coordinate shelf lighting, outlets, switches, and HVAC conflicts."],
    installationConstraints: [
      "Confirm shelf load assumptions, anti-tip anchoring, scribe strategy, and installation sequence.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "shelf span", "lighting/accessory allowance"],
  }),
  laundry_room_cabinetry: seed({
    label: "Laundry room cabinetry",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure washer/dryer clearances, plumbing, venting, countertop height, and appliance service space.",
    ],
    serviceCoordination: [
      "Coordinate plumbing, electrical, dryer vent, appliance specifications, and backsplash returns.",
    ],
    installationConstraints: [
      "Confirm moisture-resistant finish, appliance access, service cutouts, and countertop sequencing.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "appliance coordination", "service cutouts"],
  }),
  window_seat: seed({
    label: "Window seat",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify sill height, cushion thickness, seat height, heat registers, and adjacent drapery clearances.",
    ],
    serviceCoordination: ["Coordinate outlets, HVAC registers, radiator access, and window treatment hardware."],
    installationConstraints: [
      "Confirm seat support, ventilation path, removable panels, and wall/floor scribe details.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "seat support", "cushion/accessory coordination"],
  }),
  banquette: seed({
    label: "Banquette",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify table clearance, finished seat height, cushion allowance, toe space, and traffic path.",
    ],
    serviceCoordination: ["Coordinate outlets, lighting, HVAC registers, and upholstery package."],
    installationConstraints: [
      "Confirm seat support, wall anchoring, cleanable base, and removable storage access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "seat construction", "upholstery coordination"],
  }),
  home_bar: seed({
    label: "Home bar",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure sink, appliance, glass shelf, countertop, and backsplash clearances.",
    ],
    serviceCoordination: [
      "Coordinate plumbing, electrical, refrigeration, lighting, countertop, backsplash, and ventilation.",
    ],
    installationConstraints: [
      "Confirm moisture-resistant details, appliance ventilation, glass door/shelf handling, and countertop sequencing.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "appliance/service coordination", "glass and lighting details"],
  }),
  kitchen_island: seed({
    label: "Kitchen island",
    projectPhase: "phase_2",
    placementKind: "freestanding_island",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify aisle clearances, seating overhang, appliance/sink positions, and slab size limits.",
    ],
    serviceCoordination: ["Coordinate floor power, plumbing, appliances, ventilation, countertop, and seating."],
    installationConstraints: [
      "Confirm floor anchoring, panel access, countertop support, appliance access, and delivery path.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "countertop support", "island services"],
  }),
  pantry_system: seed({
    label: "Pantry system",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify appliance niches, pull-out clearances, shelf loading, and door swing clearances.",
    ],
    serviceCoordination: ["Coordinate outlets, appliance niches, lighting, and ventilation if specified."],
    installationConstraints: [
      "Confirm shelf load assumptions, tall anchoring, pull-out hardware, and filler/scribe layout.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "pull-out accessories", "tall storage hardware"],
  }),
  wine_storage: seed({
    label: "Wine storage",
    projectPhase: "phase_2",
    placementKind: "built_in_wall",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify bottle clearances, refrigeration cavity, ventilation path, lighting, and glass door swing.",
    ],
    serviceCoordination: ["Coordinate cooling unit, power, lighting, ventilation, humidity, and glass hardware."],
    installationConstraints: [
      "Confirm ventilation clearance, bottle rack support, glass handling, and service access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "wine rack detailing", "cooling and glass coordination"],
  }),
  pet_built_in: seed({
    label: "Pet built-in",
    projectPhase: "phase_3",
    placementKind: "floor_set",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify pet opening size, washable finish zones, ventilation, and adjacent circulation.",
    ],
    serviceCoordination: ["Coordinate outlets, water bowls, ventilation, washable liners, and removable panels."],
    installationConstraints: [
      "Confirm cleanable materials, rounded/softened edges, ventilation path, and removable access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "washable liners", "specialty openings"],
  }),
  kids_storage: seed({
    label: "Kids storage",
    projectPhase: "phase_3",
    placementKind: "floor_set",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify child-safe reach heights, bin sizes, traffic path, and wall anchoring.",
    ],
    serviceCoordination: ["Coordinate outlets, charging stations, lighting, and adjacent play zones."],
    installationConstraints: [
      "Confirm anti-tip anchoring, softened edges, durable finish, and removable bin clearances.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "child-safe hardware", "bin/accessory system"],
  }),
  hobby_storage: seed({
    label: "Hobby storage",
    projectPhase: "phase_3",
    placementKind: "built_in_wall",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify tool/material sizes, work surface height, drawer loads, and lighting needs.",
    ],
    serviceCoordination: ["Coordinate power, task lighting, dust collection, ventilation, and specialty equipment."],
    installationConstraints: [
      "Confirm drawer load ratings, worktop support, wall anchoring, and cleanable finish.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "heavy-duty drawers", "specialty storage accessories"],
  }),
  wall_paneling: seed({
    label: "Wall paneling",
    projectPhase: "phase_4",
    placementKind: "wall_mounted",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure wall breaks, outlet locations, trim returns, and panel layout datum.",
    ],
    serviceCoordination: ["Coordinate outlets, switches, thermostats, sconces, and wall penetrations."],
    installationConstraints: [
      "Confirm substrate flatness, adhesive/fastener method, seams, reveals, and finish transitions.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "panel layout", "cutouts and trim returns"],
  }),
  slat_wall: seed({
    label: "Slat wall",
    projectPhase: "phase_4",
    placementKind: "wall_mounted",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure slat spacing, wall breaks, outlet locations, and finish transition edges.",
    ],
    serviceCoordination: ["Coordinate outlets, switches, sconces, acoustic backing, and wall penetrations."],
    installationConstraints: [
      "Confirm substrate flatness, backing board, reveal spacing, and attachment method.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "slat count", "backing/acoustic layer"],
  }),
  ceiling_beams: seed({
    label: "Ceiling beams",
    projectPhase: "phase_4",
    placementKind: "ceiling_mounted",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      "Verify ceiling height, joist direction, beam spacing, lighting/sprinkler conflicts, and room out-of-square.",
      "Confirm crown/ceiling transitions, beam drops, and fixture clearances.",
    ],
    serviceCoordination: ["Coordinate lighting, sprinklers, HVAC grilles, speakers, sensors, and structural blocking."],
    installationConstraints: [
      "Confirm overhead fastening, blocking, lift strategy, finish touch-up, and safety access.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "overhead installation", "beam count and joinery"],
  }),
  coffered_ceiling: seed({
    label: "Coffered ceiling",
    projectPhase: "phase_4",
    placementKind: "ceiling_mounted",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      "Verify ceiling height, room squareness, coffer grid datum, fixture conflicts, and perimeter transitions.",
      "Confirm crown profiles, beam drops, and access around sprinklers or HVAC.",
    ],
    serviceCoordination: ["Coordinate lighting, sprinklers, HVAC grilles, speakers, sensors, and ceiling access panels."],
    installationConstraints: [
      "Confirm overhead fastening, grid layout, blocking, lift strategy, and finish sequencing.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "coffer grid complexity", "overhead finishing"],
  }),
  fireplace_surround: seed({
    label: "Fireplace surround",
    projectPhase: "phase_4",
    placementKind: "built_in_wall",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify firebox dimensions, mantel height, hearth, non-combustible clearances, and TV/media conflicts.",
    ],
    serviceCoordination: ["Coordinate fireplace specifications, electrical, low-voltage, heat clearances, and mantel rules."],
    installationConstraints: [
      "Confirm code/fireplace clearances, substrate, mantel fastening, and heat-resistant transitions.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "mantel profile", "code/clearance detailing"],
  }),
  trim_package: seed({
    label: "Trim package",
    projectPhase: "phase_4",
    placementKind: "wall_mounted",
    fabricationComplexity: "moderate",
    fieldMeasurementRequirements: [
      "Measure room perimeter, ceiling height, outside/inside corners, door/window casing, and floor transitions.",
      "Confirm profile dimensions, returns, and paint/stain finish conditions.",
    ],
    serviceCoordination: ["Coordinate outlets, switches, HVAC grilles, door hardware, and wall penetrations."],
    installationConstraints: [
      "Confirm substrate flatness, scarf joints, miters, caulk/finish sequencing, and touch-up scope.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "linear footage", "profile complexity"],
  }),
  under_stair_storage: seed({
    label: "Under-stair storage",
    projectPhase: "phase_3",
    placementKind: "built_in_wall",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Measure stair rake, stringer line, headroom, irregular opening geometry, and access path.",
    ],
    serviceCoordination: ["Coordinate electrical, structural limits, stair framing, and hidden service runs."],
    installationConstraints: [
      "Confirm irregular templating, segmented install sequence, wall/stair anchoring, and drawer travel.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "irregular templating", "custom drawer geometry"],
  }),
  room_divider_storage: seed({
    label: "Room divider storage",
    projectPhase: "phase_3",
    placementKind: "freestanding_island",
    fabricationComplexity: "advanced",
    fieldMeasurementRequirements: [
      ...commonFieldMeasurements,
      "Verify circulation on both sides, ceiling/floor anchoring points, sight lines, and egress paths.",
    ],
    serviceCoordination: ["Coordinate power, lighting, floor/ceiling fastening, HVAC flow, and any room separation rules."],
    installationConstraints: [
      "Confirm lateral stability, anchoring, finish on both sides, and installation sequence.",
    ],
    quoteDrivers: [...commonQuoteDrivers, "two-sided finish", "structural anchoring"],
  }),
};

export function getMillworkAssemblyProfile(
  assemblyType: MillworkAssemblyType,
  family: MillworkFamily
): MillworkAssemblyProfile {
  const profile = PROFILE_SEEDS[assemblyType];
  return {
    schema: "custom_millwork.assembly_profile.v1",
    assemblyType,
    family,
    ...profile,
    fieldMeasurementRequirements: [...profile.fieldMeasurementRequirements],
    serviceCoordination: [...profile.serviceCoordination],
    installationConstraints: [...profile.installationConstraints],
    quoteDrivers: [...profile.quoteDrivers],
  };
}
