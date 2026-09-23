import type { MillworkAssemblyType } from "@/features/millwork/types";
import type {
  CabinetDefinition,
  CabinetFrontType,
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
  CabinetUnitType,
} from "./types";

export type CabinetPropertySection =
  | "dimensions"
  | "structure"
  | "installation"
  | "layout"
  | "inserts"
  | "services"
  | "fronts"
  | "materials"
  | "fitting"
  | "construction"
  | "worktop"
  | "seating";

type CabinetModulePropertyField = Extract<keyof CabinetModuleDefinition, string>;
type CabinetDefinitionPropertyField = Extract<keyof CabinetDefinition, string>;

interface CabinetPropertyMetadataBase {
  /** Stable UI/search identifier. This is not the definition field path. */
  id: string;
  label: string;
  description: string;
  section: CabinetPropertySection;
  /** Existing CabinetryStudio control id, retained for focus and regression tests. */
  controlTestId: string;
  /** Friendly synonyms, trade terms, abbreviations, and fabrication language. */
  searchTerms: readonly string[];
  componentTypes?: readonly CabinetMillworkComponentType[];
  assemblyTypes?: readonly MillworkAssemblyType[];
  unitTypes?: readonly CabinetUnitType[];
  frontTypes?: readonly CabinetFrontType[];
  /** Higher values sort first when a query produces otherwise equal matches. */
  priority: number;
}

export interface CabinetModulePropertyMetadata extends CabinetPropertyMetadataBase {
  scope: "module";
  field: CabinetModulePropertyField;
}

export interface CabinetDefinitionPropertyMetadata extends CabinetPropertyMetadataBase {
  scope: "definition";
  field: CabinetDefinitionPropertyField;
}

export type CabinetPropertyMetadata =
  | CabinetModulePropertyMetadata
  | CabinetDefinitionPropertyMetadata;

export interface CabinetPropertyContext {
  activeModule?: Pick<
    CabinetModuleDefinition,
    "millworkComponentType" | "type" | "frontType"
  > | null;
  assemblyType?: MillworkAssemblyType;
}

export interface CabinetPropertyFilterOptions {
  /** Allows an explicit advanced search to reveal a normally hidden group. */
  includeInapplicable?: boolean;
}

interface PropertyOptions {
  description: string;
  terms?: readonly string[];
  componentTypes?: readonly CabinetMillworkComponentType[];
  assemblyTypes?: readonly MillworkAssemblyType[];
  unitTypes?: readonly CabinetUnitType[];
  frontTypes?: readonly CabinetFrontType[];
  priority?: number;
}

function moduleProperty(
  field: CabinetModulePropertyField,
  label: string,
  section: CabinetPropertySection,
  controlTestId: string,
  options: PropertyOptions
): CabinetModulePropertyMetadata {
  return {
    id: `module.${field}`,
    scope: "module",
    field,
    label,
    section,
    controlTestId,
    description: options.description,
    searchTerms: options.terms ?? [],
    componentTypes: options.componentTypes,
    assemblyTypes: options.assemblyTypes,
    unitTypes: options.unitTypes,
    frontTypes: options.frontTypes,
    priority: options.priority ?? 50,
  };
}

function definitionProperty(
  field: CabinetDefinitionPropertyField,
  label: string,
  section: CabinetPropertySection,
  controlTestId: string,
  options: PropertyOptions
): CabinetDefinitionPropertyMetadata {
  return {
    id: `definition.${field}`,
    scope: "definition",
    field,
    label,
    section,
    controlTestId,
    description: options.description,
    searchTerms: options.terms ?? [],
    componentTypes: options.componentTypes,
    assemblyTypes: options.assemblyTypes,
    unitTypes: options.unitTypes,
    frontTypes: options.frontTypes,
    priority: options.priority ?? 50,
  };
}

const CABINET_COMPONENT = ["cabinet"] as const satisfies readonly CabinetMillworkComponentType[];
const DOOR_FRONTS = ["single_door", "double_door", "door_and_drawer"] as const satisfies readonly CabinetFrontType[];
const DRAWER_FRONTS = ["drawer_stack", "door_and_drawer"] as const satisfies readonly CabinetFrontType[];
const CLOSET_ASSEMBLIES = ["closet_system", "wardrobe"] as const satisfies readonly MillworkAssemblyType[];
const SEATING_ASSEMBLIES = ["window_seat", "banquette"] as const satisfies readonly MillworkAssemblyType[];
const LIFESTYLE_ASSEMBLIES = ["pet_built_in", "kids_storage", "hobby_storage"] as const satisfies readonly MillworkAssemblyType[];
const COUNTERTOP_ASSEMBLIES = [
  "base",
  "vanity",
  "cabinet_run",
  "home_bar",
  "kitchen_island",
  "laundry_room_cabinetry",
  "home_office_built_in",
] as const satisfies readonly MillworkAssemblyType[];

/**
 * Searchable controls for the contextual cabinetry inspector.
 *
 * The registry intentionally indexes high-value controls with stable test ids.
 * It does not attempt to mirror every low-level fabrication input in the current
 * detailed editor; new controls can be added without changing the filter API.
 */
export const CABINET_PROPERTY_REGISTRY: readonly CabinetPropertyMetadata[] = [
  moduleProperty("width", "Module width", "dimensions", "cabinet-dimension-width", {
    description: "Width of the selected bay or component.",
    terms: ["bay width", "carcass width", "case width", "x dimension", "w"],
    priority: 100,
  }),
  moduleProperty("height", "Module height", "dimensions", "cabinet-dimension-height", {
    description: "Finished height of the selected bay or component.",
    terms: ["carcass height", "case height", "y dimension", "h"],
    priority: 100,
  }),
  moduleProperty("depth", "Module depth", "dimensions", "cabinet-dimension-depth", {
    description: "Front-to-back depth of the selected bay or component.",
    terms: ["carcass depth", "case depth", "projection", "z dimension", "d"],
    priority: 100,
  }),
  definitionProperty("totalWidth", "Overall width", "dimensions", "cabinet-guided-width", {
    description: "Finished width of the complete millwork assembly.",
    terms: ["total width", "run length", "assembly width", "fit width"],
    priority: 95,
  }),
  definitionProperty("height", "Overall height", "dimensions", "cabinet-guided-height", {
    description: "Finished height of the complete millwork assembly.",
    terms: ["total height", "assembly height", "fit height"],
    priority: 95,
  }),
  definitionProperty("depth", "Overall depth", "dimensions", "cabinet-guided-depth", {
    description: "Maximum front-to-back depth of the complete assembly.",
    terms: ["total depth", "assembly depth", "projection"],
    priority: 95,
  }),
  moduleProperty("millworkComponentType", "Component type", "structure", "cabinet-input-component-type", {
    description: "Switches the selected module between cabinetry and specialty millwork constructions.",
    terms: ["component", "construction type", "specialty millwork", "beam", "trim", "surround"],
    priority: 90,
  }),
  moduleProperty("type", "Cabinet type", "structure", "cabinet-input-module-type", {
    description: "Sets the selected cabinet as a base, wall, tall, vanity, console, or wardrobe unit.",
    terms: ["unit type", "case type", "base cabinet", "wall cabinet", "tall cabinet"],
    componentTypes: CABINET_COMPONENT,
    priority: 85,
  }),
  moduleProperty("shelfCount", "Shelves", "layout", "cabinet-input-shelves", {
    description: "Number of shelves inside the selected cabinet bay.",
    terms: ["shelf count", "adjustable shelves", "interior shelves", "shelving"],
    componentTypes: CABINET_COMPONENT,
    priority: 80,
  }),
  moduleProperty("shelfSpacingMode", "Shelf spacing mode", "layout", "cabinet-shelf-spacing-even", {
    description: "Switches the selected cabinet between evenly distributed and custom shelf heights.",
    terms: ["even shelves", "custom shelf spacing", "manual shelf layout", "shelf distribution"],
    componentTypes: CABINET_COMPONENT,
    priority: 79,
  }),
  moduleProperty("shelfPositionsMm", "Custom shelf heights", "layout", "cabinet-shelf-spacing-custom", {
    description: "Stores the individual installation height of every shelf in a custom layout.",
    terms: ["shelf positions", "shelf elevations", "manual shelf heights", "adjust shelf level"],
    componentTypes: CABINET_COMPONENT,
    priority: 76,
  }),
  moduleProperty("verticalDividerCount", "Vertical dividers", "layout", "cabinet-input-dividers", {
    description: "Number of vertical partitions inside the selected bay.",
    terms: ["divider count", "partition", "upright", "vertical panel"],
    componentTypes: CABINET_COMPONENT,
    priority: 75,
  }),
  moduleProperty("doorCount", "Doors", "fronts", "cabinet-input-doors", {
    description: "Number of hinged doors on the selected cabinet.",
    terms: ["door count", "cabinet fronts", "hinged fronts"],
    componentTypes: CABINET_COMPONENT,
    priority: 80,
  }),
  moduleProperty("doorLayoutMode", "Door layout mode", "fronts", "cabinet-door-layout-recommended", {
    description: "Lets the Studio recommend a safe door count or preserve a manual count.",
    terms: ["recommended doors", "manual door count", "automatic door split", "door layout mode"],
    componentTypes: CABINET_COMPONENT,
    priority: 82,
  }),
  moduleProperty("drawerCount", "Drawers", "fronts", "cabinet-input-drawers", {
    description: "Number of drawers in the selected cabinet.",
    terms: ["drawer count", "drawer stack", "pullouts", "drawer fronts"],
    componentTypes: CABINET_COMPONENT,
    priority: 80,
  }),
  moduleProperty("drawerHeightMode", "Drawer height mode", "fronts", "cabinet-drawer-heights-recommended", {
    description: "Uses equal, recommended, or custom bottom-to-top drawer proportions.",
    terms: ["drawer proportions", "custom drawer heights", "equal drawers", "recommended drawer stack"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DRAWER_FRONTS,
    priority: 81,
  }),
  moduleProperty("drawerHeightProportions", "Custom drawer proportions", "fronts", "cabinet-drawer-proportion-1", {
    description: "Stores each custom drawer-front share from bottom to top.",
    terms: ["drawer percentages", "drawer ratios", "manual drawer heights", "bottom drawer height"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DRAWER_FRONTS,
    priority: 77,
  }),
  moduleProperty("frontType", "Front layout", "fronts", "cabinet-input-front-type", {
    description: "Chooses open, door, drawer, combined, or fixed-panel fronts.",
    terms: ["front type", "door drawer layout", "open cabinet", "slab panel"],
    componentTypes: CABINET_COMPONENT,
    priority: 85,
  }),
  moduleProperty("doorStyle", "Door style", "fronts", "cabinet-input-door-style", {
    description: "Selects the visual construction of doors and drawer fronts.",
    terms: ["front style", "shaker", "flat slab", "glass door", "fluted"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: [...DOOR_FRONTS, ...DRAWER_FRONTS],
    priority: 80,
  }),
  moduleProperty("hingeSide", "Hinge side", "fronts", "cabinet-input-hinge-side", {
    description: "Sets the swing side for a hinged cabinet front.",
    terms: ["door handing", "door swing", "left hinge", "right hinge", "double doors"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DOOR_FRONTS,
    priority: 70,
  }),
  moduleProperty("materialId", "Cabinet structure material", "materials", "cabinet-input-material", {
    description: "Material used for the cabinet box or specialty component body. Professional term: carcass material.",
    terms: ["carcass material", "case material", "box material", "board finish", "sheet good", "substrate"],
    priority: 85,
  }),
  moduleProperty("frontMaterialId", "Front material", "materials", "cabinet-input-front-material", {
    description: "Material or finish used for visible doors and drawer fronts.",
    terms: ["door material", "drawer front finish", "facade material", "front finish"],
    componentTypes: CABINET_COMPONENT,
    priority: 80,
  }),
  moduleProperty("grainDirection", "Grain direction", "construction", "cabinet-input-grain-direction", {
    description: "Controls the visible and fabrication grain orientation for the selected module.",
    terms: ["grain", "veneer direction", "wood direction", "vertical grain", "horizontal grain"],
    priority: 78,
  }),
  moduleProperty("edgeTreatment", "Edge treatment", "construction", "cabinet-input-edge-treatment", {
    description: "Chooses matching banding, contrasting banding, solid lipping, painted edge, or no treatment.",
    terms: ["edge band", "edge banding", "lipping", "painted edge", "finished edge"],
    priority: 78,
  }),
  moduleProperty("edgeMaterialId", "Edge material", "materials", "cabinet-input-edge-material", {
    description: "Assigns the contrasting edge-band or solid-lipping finish.",
    terms: ["edge finish", "contrasting edge", "lipping material", "edge colour"],
    priority: 72,
  }),
  moduleProperty("exposedFaces", "Exposed faces", "construction", "cabinet-input-exposed-faces-automatic", {
    description: "Identifies which module faces need a visible finished surface.",
    terms: ["finished face", "visible side", "exposed side", "finished back", "finished top"],
    priority: 78,
  }),
  moduleProperty("hardwareId", "Handle hardware", "materials", "cabinet-input-hardware", {
    description: "Compatible pull, knob, edge pull, or touch-latch hardware for cabinet fronts.",
    terms: ["handle", "pull", "knob", "grip", "push to open", "touch latch", "hardware compatibility", "compatible hardware"],
    componentTypes: CABINET_COMPONENT,
    priority: 80,
  }),
  moduleProperty("handlePlacementMode", "Handle placement", "fronts", "cabinet-handle-placement-automatic", {
    description: "Positions handles automatically or applies a precise custom shift from that position.",
    terms: ["handle offset", "pull position", "knob position", "automatic handles", "custom handle placement"],
    componentTypes: CABINET_COMPONENT,
    priority: 79,
  }),
  moduleProperty("handleOffsetX", "Handle horizontal shift", "fronts", "cabinet-input-handle-offset-x", {
    description: "Moves generated handles left or right from their automatic position.",
    terms: ["handle x offset", "pull horizontal", "move handle left", "move handle right"],
    componentTypes: CABINET_COMPONENT,
    priority: 74,
  }),
  moduleProperty("handleOffsetY", "Handle vertical shift", "fronts", "cabinet-input-handle-offset-y", {
    description: "Moves generated handles up or down from their automatic position.",
    terms: ["handle y offset", "pull vertical", "move handle up", "move handle down"],
    componentTypes: CABINET_COMPONENT,
    priority: 74,
  }),

  moduleProperty("installationCleatEnabled", "Installation cleat", "installation", "cabinet-input-installation-cleat-enabled", {
    description: "Adds a wall-mounting cleat behind the selected cabinet.",
    terms: ["french cleat", "mounting rail", "wall cleat", "hanging rail"],
    componentTypes: CABINET_COMPONENT,
    priority: 72,
  }),
  moduleProperty("installationCleatHeight", "Cleat height", "installation", "cabinet-input-installation-cleat-height", {
    description: "Vertical size of the installation cleat.",
    terms: ["mounting rail height", "french cleat size"],
    componentTypes: CABINET_COMPONENT,
  }),
  moduleProperty("installationCleatThickness", "Cleat thickness", "installation", "cabinet-input-installation-cleat-thickness", {
    description: "Front-to-back thickness of the installation cleat.",
    terms: ["cleat depth", "mounting rail thickness"],
    componentTypes: CABINET_COMPONENT,
  }),
  moduleProperty("antiTipAnchorEnabled", "Anti-tip anchors", "installation", "cabinet-input-anti-tip-anchor-enabled", {
    description: "Adds wall restraint brackets to reduce tip-over risk.",
    terms: ["wall anchor", "tip restraint", "safety bracket", "seismic restraint"],
    componentTypes: CABINET_COMPONENT,
    unitTypes: ["tall", "wardrobe"],
    priority: 75,
  }),
  moduleProperty("antiTipAnchorCount", "Anti-tip anchor count", "installation", "cabinet-input-anti-tip-anchor-count", {
    description: "Number of wall restraint brackets on the selected unit.",
    terms: ["anchor quantity", "restraint bracket count"],
    componentTypes: CABINET_COMPONENT,
    unitTypes: ["tall", "wardrobe"],
  }),

  moduleProperty("hangingRodCount", "Hanging rods", "inserts", "cabinet-input-hanging-rods", {
    description: "Number of clothes rails in the selected wardrobe bay.",
    terms: ["wardrobe rail", "clothes rail", "closet rod", "garment rod"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: CLOSET_ASSEMBLIES,
    priority: 75,
  }),
  moduleProperty("hangingRodHeight", "Hanging rod height", "inserts", "cabinet-input-hanging-rod-height", {
    description: "Mounting height of the first clothes rail.",
    terms: ["closet rod height", "wardrobe rail elevation"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: CLOSET_ASSEMBLIES,
  }),
  moduleProperty("shelfPinRowsEnabled", "Adjustable shelf pin rows", "inserts", "cabinet-input-shelf-pin-rows-enabled", {
    description: "Adds paired drilling rows for adjustable shelf supports.",
    terms: ["system 32", "32mm holes", "line boring", "shelf peg holes", "adjustable shelves"],
    componentTypes: CABINET_COMPONENT,
    priority: 68,
  }),
  moduleProperty("shelfPinHoleSpacing", "Shelf pin spacing", "inserts", "cabinet-input-shelf-pin-spacing", {
    description: "Vertical pitch between shelf-pin holes.",
    terms: ["32mm system", "line bore pitch", "hole spacing"],
    componentTypes: CABINET_COMPONENT,
  }),

  moduleProperty("ceilingBeamCount", "Beam count", "layout", "cabinet-input-ceiling-beams", {
    description: "Number of parallel members in the ceiling beam array.",
    terms: ["timber count", "false beams", "box beams", "beam quantity"],
    componentTypes: ["ceiling_beam_array"],
    priority: 80,
  }),
  moduleProperty("ceilingBeamWidth", "Beam width", "structure", "cabinet-input-ceiling-beam-width", {
    description: "Cross-section width of each ceiling beam.",
    terms: ["beam section", "timber width"],
    componentTypes: ["ceiling_beam_array"],
  }),
  moduleProperty("ceilingBeamDepth", "Beam depth", "structure", "cabinet-input-ceiling-beam-depth", {
    description: "Drop or cross-section depth of each ceiling beam.",
    terms: ["beam drop", "timber depth", "beam projection"],
    componentTypes: ["ceiling_beam_array"],
  }),
  moduleProperty("ceilingBeamOrientation", "Beam direction", "layout", "cabinet-input-ceiling-beam-orientation", {
    description: "Direction in which parallel ceiling beams run.",
    terms: ["beam orientation", "x axis", "z axis", "grain direction"],
    componentTypes: ["ceiling_beam_array"],
  }),
  moduleProperty("ceilingGridColumnCount", "Coffered ceiling columns", "layout", "cabinet-input-ceiling-grid-columns", {
    description: "Number of coffer bays across the ceiling grid.",
    terms: ["coffer columns", "ceiling grid bays", "grid columns"],
    componentTypes: ["coffered_ceiling_grid"],
    priority: 80,
  }),
  moduleProperty("ceilingGridRowCount", "Coffered ceiling rows", "layout", "cabinet-input-ceiling-grid-rows", {
    description: "Number of coffer bays along the ceiling grid.",
    terms: ["coffer rows", "ceiling grid bays", "grid rows"],
    componentTypes: ["coffered_ceiling_grid"],
    priority: 80,
  }),

  moduleProperty("trimPlacement", "Trim placement", "layout", "cabinet-input-trim-placement", {
    description: "Sets the run as baseboard, crown, casing, chair rail, picture rail, or generic trim.",
    terms: ["skirting", "baseboard", "crown moulding", "molding", "casing", "dado rail"],
    componentTypes: ["trim_run"],
    priority: 85,
  }),
  moduleProperty("trimProfileWidth", "Trim profile width", "structure", "cabinet-input-trim-profile-width", {
    description: "Visible face width of the trim profile.",
    terms: ["moulding width", "molding face", "architrave width"],
    componentTypes: ["trim_run"],
  }),
  moduleProperty("trimProfileDepth", "Trim profile depth", "structure", "cabinet-input-trim-profile-depth", {
    description: "Projection of the trim profile from its host surface.",
    terms: ["moulding thickness", "molding depth", "profile projection"],
    componentTypes: ["trim_run"],
  }),
  moduleProperty("trimSetoutHeight", "Trim setout height", "installation", "cabinet-input-trim-setout-height", {
    description: "Installation elevation for the trim run.",
    terms: ["mounting height", "rail height", "datum", "elevation"],
    componentTypes: ["trim_run"],
  }),
  moduleProperty("trimLeftEndTreatment", "Left trim end", "construction", "cabinet-input-trim-left-end-treatment", {
    description: "Joinery or return treatment at the left end of a trim run.",
    terms: ["mitered return", "coped", "scribed", "butt end", "end condition"],
    componentTypes: ["trim_run"],
  }),
  moduleProperty("trimRightEndTreatment", "Right trim end", "construction", "cabinet-input-trim-right-end-treatment", {
    description: "Joinery or return treatment at the right end of a trim run.",
    terms: ["mitered return", "coped", "scribed", "butt end", "end condition"],
    componentTypes: ["trim_run"],
  }),

  moduleProperty("fireplaceOpeningWidth", "Fireplace opening width", "dimensions", "cabinet-input-fireplace-opening-width", {
    description: "Clear width inside the fireplace surround frame.",
    terms: ["firebox width", "inner opening", "clear opening"],
    componentTypes: ["fireplace_surround_frame"],
    priority: 80,
  }),
  moduleProperty("fireplaceOpeningHeight", "Fireplace opening height", "dimensions", "cabinet-input-fireplace-opening-height", {
    description: "Clear height inside the fireplace surround frame.",
    terms: ["firebox height", "inner opening", "clear opening"],
    componentTypes: ["fireplace_surround_frame"],
    priority: 80,
  }),
  moduleProperty("fireplaceMantelHeight", "Mantel height", "layout", "cabinet-input-fireplace-mantel-height", {
    description: "Installation height of the mantel shelf.",
    terms: ["mantel elevation", "mantelpiece height", "shelf height"],
    componentTypes: ["fireplace_surround_frame"],
  }),
  moduleProperty("fireplaceMantelDepth", "Mantel depth", "structure", "cabinet-input-fireplace-mantel-depth", {
    description: "Projection of the mantel shelf from the surround.",
    terms: ["mantel projection", "mantel shelf depth"],
    componentTypes: ["fireplace_surround_frame"],
  }),

  moduleProperty("convertiblePanelHeight", "Convertible panel height", "dimensions", "cabinet-input-convertible-panel-height", {
    description: "Height of the fold-down bed or worksurface panel.",
    terms: ["murphy bed panel", "fold down desk", "folding panel", "panel length"],
    componentTypes: ["wall_bed_panel", "fold_down_worksurface"],
    priority: 78,
  }),
  moduleProperty("convertibleOpenDepth", "Open projection", "dimensions", "cabinet-input-convertible-open-depth", {
    description: "Distance the convertible panel projects when fully open.",
    terms: ["open depth", "bed projection", "desk projection", "swing clearance"],
    componentTypes: ["wall_bed_panel", "fold_down_worksurface"],
    priority: 75,
  }),
  moduleProperty("convertibleHingeHeight", "Pivot height", "installation", "cabinet-input-convertible-hinge-height", {
    description: "Height of the hinge or pivot axis above the floor.",
    terms: ["hinge elevation", "pivot elevation", "rotation axis"],
    componentTypes: ["wall_bed_panel", "fold_down_worksurface"],
  }),
  moduleProperty("convertibleSupportLegCount", "Support legs", "structure", "cabinet-input-convertible-support-legs", {
    description: "Number of support legs on the open convertible panel.",
    terms: ["folding legs", "bed legs", "desk supports"],
    componentTypes: ["wall_bed_panel", "fold_down_worksurface"],
  }),
  moduleProperty("wallBedMattressSize", "Wall-bed mattress size", "layout", "cabinet-wall-bed-mattress-double", {
    description: "Selects the standard mattress envelope used to size the wall-bed cabinet and deployed panel.",
    terms: ["murphy bed size", "single bed", "double bed", "queen bed", "king bed", "mattress dimensions"],
    componentTypes: ["wall_bed_panel"],
    priority: 86,
  }),
  moduleProperty("wallBedOrientation", "Wall-bed orientation", "layout", "cabinet-wall-bed-orientation-vertical", {
    description: "Chooses whether the wall bed deploys vertically or horizontally.",
    terms: ["murphy bed direction", "vertical opening", "horizontal opening", "bed rotation"],
    componentTypes: ["wall_bed_panel"],
    priority: 84,
  }),
  moduleProperty("wallBedDisplayState", "Wall-bed preview state", "layout", "cabinet-wall-bed-state-closed", {
    description: "Shows the wall bed in its closed cabinet state or its open deployed state.",
    terms: ["open bed", "closed bed", "deployed preview", "folded preview", "murphy bed state"],
    componentTypes: ["wall_bed_panel"],
    priority: 82,
  }),
  moduleProperty("wallBedClearanceVisible", "Wall-bed clearance display", "installation", "cabinet-wall-bed-clearance-visible", {
    description: "Shows or hides the required floor projection for the deployed wall bed.",
    terms: ["bed clearance", "floor clearance", "deployment zone", "open projection", "swing area"],
    componentTypes: ["wall_bed_panel"],
    priority: 81,
  }),
  moduleProperty("wallBedSideStorage", "Wall-bed side storage", "layout", "cabinet-wall-bed-side-storage", {
    description: "Chooses whether coordinated storage towers appear to the left, right, both sides, or neither side of the bed.",
    terms: ["bedside cabinets", "side towers", "left storage", "right storage", "both sides"],
    componentTypes: ["wall_bed_panel"],
    priority: 80,
  }),

  moduleProperty("slatCount", "Slat count", "layout", "cabinet-input-slats", {
    description: "Number of vertical or horizontal members in the slat wall.",
    terms: ["wood slats", "batten count", "linear screen", "fluted wall"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["slat_wall"],
    priority: 78,
  }),
  moduleProperty("slatWidth", "Slat width", "structure", "cabinet-input-slat-width", {
    description: "Face width of each slat.",
    terms: ["batten width", "strip width"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["slat_wall"],
  }),
  moduleProperty("slatSpacing", "Slat spacing", "layout", "cabinet-input-slat-spacing", {
    description: "Clear gap between neighboring slats.",
    terms: ["batten gap", "slat gap", "pitch", "spacing on center"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["slat_wall"],
  }),
  moduleProperty("panelColumnCount", "Panel columns", "layout", "cabinet-input-panel-columns", {
    description: "Number of panel bays across a wall-paneling composition.",
    terms: ["wainscot columns", "panel grid columns", "field panels"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["wall_paneling"],
    priority: 75,
  }),
  moduleProperty("panelRowCount", "Panel rows", "layout", "cabinet-input-panel-rows", {
    description: "Number of panel bays vertically in a wall-paneling composition.",
    terms: ["wainscot rows", "panel grid rows", "field panels"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["wall_paneling"],
    priority: 75,
  }),

  moduleProperty("platformDeckThickness", "Platform deck thickness", "structure", "cabinet-input-platform-deck-thickness", {
    description: "Thickness of the storage-bed platform deck.",
    terms: ["bed deck", "platform top", "deck panel"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["platform_storage_bed"],
    priority: 72,
  }),
  moduleProperty("platformSupportRibCount", "Platform support ribs", "structure", "cabinet-input-platform-support-ribs", {
    description: "Number of internal ribs supporting the bed platform.",
    terms: ["bed supports", "deck ribs", "cross members"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["platform_storage_bed"],
  }),
  moduleProperty("stairScribeStepCount", "Under-stair profile steps", "fitting", "cabinet-input-stair-scribe-steps", {
    description: "Number of stair-step notches followed by the under-stair cabinet structure. Professional term: stair scribe.",
    terms: ["stair profile", "riser count", "stepped top", "under stair scribe"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["under_stair_storage"],
    priority: 80,
  }),
  moduleProperty("stairScribeDirection", "Stair rise direction", "fitting", "cabinet-input-stair-scribe-direction", {
    description: "Whether the stair profile rises to the left or right.",
    terms: ["stair direction", "rises left", "rises right", "handing"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["under_stair_storage"],
    priority: 75,
  }),
  moduleProperty("roomDividerFinishedBack", "Finished back", "construction", "cabinet-input-room-divider-finished-back", {
    description: "Finishes the rear face of a freestanding room-divider assembly.",
    terms: ["double sided", "finished rear", "exposed back", "room divider back"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["room_divider_storage"],
    priority: 76,
  }),
  moduleProperty("roomDividerStabilizerFootCount", "Stabilizer feet", "installation", "cabinet-input-room-divider-stabilizer-feet", {
    description: "Number of floor stabilizers on a room divider.",
    terms: ["outrigger feet", "anti tip feet", "divider supports"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["room_divider_storage"],
  }),

  moduleProperty("lifestyleInsertKind", "Built-in insert type", "inserts", "cabinet-input-lifestyle-insert-kind", {
    description: "Chooses a pet bed, toy bin, or hobby tray insert.",
    terms: ["pet bed", "dog bed", "toy storage", "craft tray", "hobby insert"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: LIFESTYLE_ASSEMBLIES,
    priority: 80,
  }),
  moduleProperty("lifestyleInsertCount", "Built-in insert count", "inserts", "cabinet-input-lifestyle-insert-count", {
    description: "Number of lifestyle inserts in the selected bay.",
    terms: ["pet bed count", "toy bin count", "tray quantity"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: LIFESTYLE_ASSEMBLIES,
  }),
  moduleProperty("wineRackColumnCount", "Wine rack columns", "inserts", "cabinet-input-wine-rack-columns", {
    description: "Number of bottle cells across the wine rack.",
    terms: ["bottle columns", "wine cubbies", "lattice rack"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["wine_storage", "home_bar"],
    priority: 76,
  }),
  moduleProperty("wineRackRowCount", "Wine rack rows", "inserts", "cabinet-input-wine-rack-rows", {
    description: "Number of bottle cells vertically in the wine rack.",
    terms: ["bottle rows", "wine cubbies", "lattice rack"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["wine_storage", "home_bar"],
    priority: 76,
  }),
  moduleProperty("stemwareRackEnabled", "Stemware rack", "inserts", "cabinet-input-stemware-rack-enabled", {
    description: "Adds hanging rails for wine glasses or other stemware.",
    terms: ["wine glass rack", "glass hanger", "goblet rail", "under cabinet glass rack"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["home_bar", "wine_storage"],
    priority: 74,
  }),

  moduleProperty("seatCushionDepth", "Seat cushion depth", "seating", "cabinet-input-seat-cushion-depth", {
    description: "Front-to-back size of the fitted seat cushion.",
    terms: ["bench cushion depth", "banquette cushion", "window seat cushion"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: SEATING_ASSEMBLIES,
    priority: 74,
  }),
  moduleProperty("seatBackHeight", "Seat back height", "seating", "cabinet-input-seat-back-height", {
    description: "Height of the upholstered or timber seat back.",
    terms: ["bench back", "banquette backrest", "back cushion height"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: SEATING_ASSEMBLIES,
  }),
  moduleProperty("mudroomHookCount", "Mudroom hooks", "inserts", "cabinet-input-mudroom-hooks", {
    description: "Number of coat hooks on the mudroom rail.",
    terms: ["coat hooks", "robe hooks", "entry hooks", "hook count"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["mudroom_storage"],
    priority: 78,
  }),
  moduleProperty("shoeCubbyCount", "Shoe cubbies", "inserts", "cabinet-input-shoe-cubbies", {
    description: "Number of divided shoe-storage openings.",
    terms: ["shoe storage", "boot cubbies", "footwear bays"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["mudroom_storage"],
    priority: 78,
  }),

  moduleProperty("sinkCutoutEnabled", "Sink cutout", "services", "cabinet-input-sink-cutout-enabled", {
    description: "Adds a sink opening to the vanity or worktop support layout.",
    terms: ["basin cutout", "sink opening", "countertop cutout", "lavatory opening"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["vanity"],
    priority: 82,
  }),
  moduleProperty("sinkCutoutWidth", "Sink cutout width", "services", "cabinet-input-sink-cutout-width", {
    description: "Clear left-to-right size of the sink opening.",
    terms: ["basin opening width", "sink hole width"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["vanity"],
  }),
  moduleProperty("plumbingChaseWidth", "Plumbing chase width", "services", "cabinet-input-plumbing-chase-width", {
    description: "Reserved service zone for water and waste connections.",
    terms: ["pipe chase", "service void", "waste pipe clearance", "plumbing void"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["vanity", "laundry_room_cabinetry"],
    priority: 74,
  }),
  moduleProperty("laundryApplianceBayEnabled", "Laundry appliance bay", "services", "cabinet-input-laundry-appliance-bay-enabled", {
    description: "Reserves a measured bay for a washer, dryer, or stacked appliance.",
    terms: ["washer opening", "dryer opening", "appliance niche", "machine bay"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["laundry_room_cabinetry"],
    priority: 84,
  }),
  moduleProperty("laundryApplianceKind", "Laundry appliance type", "services", "cabinet-input-laundry-appliance-kind", {
    description: "Selects the washer and dryer configuration for the appliance bay.",
    terms: ["washer dryer", "stacked laundry", "machine type", "appliance kind"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["laundry_room_cabinetry"],
    priority: 76,
  }),
  moduleProperty("laundryApplianceWidth", "Appliance width", "services", "cabinet-input-laundry-appliance-width", {
    description: "Nominal width of each laundry appliance.",
    terms: ["washer width", "dryer width", "machine width"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["laundry_room_cabinetry"],
  }),
  moduleProperty("officeWorksurfaceEnabled", "Office worksurface", "services", "cabinet-input-office-worksurface-enabled", {
    description: "Adds an integrated desk or writing surface.",
    terms: ["desktop", "desk top", "writing desk", "worktop", "home office"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["home_office_built_in"],
    priority: 82,
  }),
  moduleProperty("officeWorksurfaceDepth", "Worksurface depth", "dimensions", "cabinet-input-office-worksurface-depth", {
    description: "Front-to-back depth of the integrated desktop.",
    terms: ["desk depth", "desktop projection", "worktop depth"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["home_office_built_in"],
  }),
  moduleProperty("cableGrommetCount", "Cable grommets", "services", "cabinet-input-cable-grommets", {
    description: "Number of desktop pass-throughs for power and data cables.",
    terms: ["cord holes", "wire pass through", "desk grommet", "cable management"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["home_office_built_in"],
    priority: 70,
  }),
  moduleProperty("pantryPullOutTrayEnabled", "Pantry pull-outs", "inserts", "cabinet-input-pantry-pullouts-enabled", {
    description: "Adds sliding pantry trays to the selected tall cabinet.",
    terms: ["rollout trays", "pullout shelves", "sliding shelves", "pantry drawers"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["pantry_system"],
    priority: 82,
  }),
  moduleProperty("pantryPullOutTrayCount", "Pantry pull-out trays", "inserts", "cabinet-input-pantry-pullout-trays", {
    description: "Number of sliding trays in the pantry bay.",
    terms: ["rollout tray count", "pullout shelf count"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["pantry_system"],
  }),
  moduleProperty("mediaWallEnabled", "Media wall features", "services", "cabinet-input-media-wall-enabled", {
    description: "Enables the television opening, blocking, ventilation, and cable chase.",
    terms: ["tv wall", "entertainment center", "television niche", "media center"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["media_wall"],
    priority: 85,
  }),
  moduleProperty("mediaTvOpeningWidth", "TV opening width", "dimensions", "cabinet-input-media-tv-opening-width", {
    description: "Clear width reserved for the television display.",
    terms: ["television niche width", "screen opening", "tv recess"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["media_wall"],
    priority: 78,
  }),
  moduleProperty("mediaTvMountHeight", "TV mount height", "installation", "cabinet-input-media-tv-mount-height", {
    description: "Elevation of the television mounting and blocking zone.",
    terms: ["screen center height", "tv bracket height", "VESA mount elevation"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["media_wall"],
    priority: 72,
  }),
  moduleProperty("mediaCableChaseWidth", "Media cable chase", "services", "cabinet-input-media-cable-chase-width", {
    description: "Width of the concealed route for AV, power, and data cabling.",
    terms: ["tv cable", "av chase", "wire conduit", "cord channel", "cable management"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["media_wall"],
    priority: 74,
  }),
  moduleProperty("libraryLadderRailEnabled", "Library ladder rail", "installation", "cabinet-input-library-ladder-rail-enabled", {
    description: "Adds a rolling-library-ladder rail and standoffs.",
    terms: ["rolling ladder", "bookcase ladder", "ladder track", "library rail"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["library_wall"],
    priority: 82,
  }),
  moduleProperty("libraryLadderRailHeight", "Ladder rail height", "installation", "cabinet-input-library-ladder-rail-height", {
    description: "Installation elevation of the library-ladder rail.",
    terms: ["ladder track height", "rail elevation"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["library_wall"],
  }),
  moduleProperty("lightingChannelEnabled", "Integrated lighting channel", "services", "cabinet-input-lighting-channel-enabled", {
    description: "Adds routed channels for linear LED lighting.",
    terms: ["led strip", "light extrusion", "aluminum profile", "dado", "under cabinet lighting"],
    componentTypes: CABINET_COMPONENT,
    priority: 76,
  }),
  moduleProperty("hamperPullOutEnabled", "Hamper pull-out", "inserts", "cabinet-input-hamper-pullout-enabled", {
    description: "Adds sliding laundry hamper baskets to the selected bay.",
    terms: ["laundry basket", "pullout hamper", "clothes bin", "linen hamper"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["closet_system", "wardrobe", "laundry_room_cabinetry"],
    priority: 74,
  }),
  moduleProperty("doorHingeHardwareEnabled", "Door hinge hardware", "construction", "cabinet-input-door-hinge-hardware-enabled", {
    description: "Adds concealed hinges and drilling information for cabinet doors.",
    terms: ["euro hinge", "cup hinge", "concealed hinge", "hinge boring"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DOOR_FRONTS,
    priority: 72,
  }),
  moduleProperty("doorHingeCountPerDoor", "Hinges per door", "construction", "cabinet-input-door-hinge-count", {
    description: "Number of concealed hinges allocated to each door.",
    terms: ["hinge count", "cup hinge quantity"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DOOR_FRONTS,
  }),
  moduleProperty("drawerBoxEnabled", "Drawer boxes", "construction", "cabinet-input-drawer-box-enabled", {
    description: "Generates inner drawer-box parts behind drawer fronts.",
    terms: ["drawer construction", "drawer carcass", "drawer box parts"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DRAWER_FRONTS,
    priority: 72,
  }),
  moduleProperty("drawerSlideHardwareEnabled", "Drawer slides", "construction", "cabinet-input-drawer-slide-hardware-enabled", {
    description: "Adds slide hardware and side clearances for drawer boxes.",
    terms: ["drawer runners", "undermount slides", "side mount slides", "guides"],
    componentTypes: CABINET_COMPONENT,
    frontTypes: DRAWER_FRONTS,
    priority: 72,
  }),

  definitionProperty("leftFillerWidth", "Left wall fitting panel", "fitting", "cabinet-input-left-filler", {
    description: "Panel between the assembly and the left boundary. Professional terms: filler, infill, or scribe strip.",
    terms: ["left filler", "left infill", "wall filler", "fitting panel", "scribe strip"],
    componentTypes: CABINET_COMPONENT,
    priority: 75,
  }),
  definitionProperty("rightFillerWidth", "Right wall fitting panel", "fitting", "cabinet-input-right-filler", {
    description: "Panel between the assembly and the right boundary. Professional terms: filler, infill, or scribe strip.",
    terms: ["right filler", "right infill", "wall filler", "fitting panel", "scribe strip"],
    componentTypes: CABINET_COMPONENT,
    priority: 75,
  }),
  definitionProperty("leftFillerScribeAllowance", "Left wall-fit trimming allowance", "fitting", "cabinet-input-left-filler-scribe-allowance", {
    description: "Extra material reserved for trimming the left fitting panel to the wall. Professional term: scribe allowance.",
    terms: ["left scribe allowance", "field scribing", "site trim allowance", "wall irregularity", "scribe margin"],
    componentTypes: CABINET_COMPONENT,
  }),
  definitionProperty("rightFillerScribeAllowance", "Right wall-fit trimming allowance", "fitting", "cabinet-input-right-filler-scribe-allowance", {
    description: "Extra material reserved for trimming the right fitting panel to the wall. Professional term: scribe allowance.",
    terms: ["right scribe allowance", "field scribing", "site trim allowance", "wall irregularity", "scribe margin"],
    componentTypes: CABINET_COMPONENT,
  }),
  definitionProperty("boardThickness", "Cabinet structure thickness", "construction", "cabinet-input-board-thickness", {
    description: "Thickness of the main boards used for the cabinet box and internal structure.",
    terms: [
      "board thickness",
      "carcass thickness",
      "case thickness",
      "cabinet box thickness",
      "sheet thickness",
      "panel thickness",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 78,
  }),
  definitionProperty("backPanelThickness", "Back panel thickness", "construction", "cabinet-input-back-panel-thickness", {
    description: "Thickness of the rear cabinet panel behind shelves and storage.",
    terms: [
      "cabinet back thickness",
      "back board thickness",
      "rear panel thickness",
      "cabinet backing",
      "backing panel",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 76,
  }),
  definitionProperty("toeKickHeight", "Floor-base height", "construction", "cabinet-input-toe-kick-height", {
    description: "Height of the recessed floor base below floor-supported cabinet modules.",
    terms: [
      "toe kick height",
      "toe-kick height",
      "plinth height",
      "kickboard height",
      "toe space height",
      "recessed base height",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 74,
  }),
  definitionProperty("toeKickSetback", "Floor-base setback", "construction", "cabinet-input-toe-kick-setback", {
    description: "Horizontal recess from the cabinet front to the floor base. Professional terms: toe-kick or plinth setback.",
    terms: ["toe kick setback", "toe-kick setback", "toe space", "plinth recess", "kickboard setback", "recessed base"],
    componentTypes: CABINET_COMPONENT,
    priority: 70,
  }),
  definitionProperty("toeKickDepth", "Floor-base depth", "construction", "cabinet-input-toe-kick-depth", {
    description: "Front-to-back depth of the recessed floor base. Professional terms: toe-kick or plinth depth.",
    terms: ["toe kick depth", "toe-kick depth", "toe space depth", "plinth depth", "kickboard depth"],
    componentTypes: CABINET_COMPONENT,
  }),
  definitionProperty("revealGap", "Door and drawer spacing", "construction", "cabinet-input-reveal-gap", {
    description: "Visible spacing maintained between adjacent doors, drawers, and fixed fronts.",
    terms: [
      "reveal",
      "reveal gap",
      "door reveal",
      "front reveal",
      "door gap",
      "drawer gap",
      "front spacing",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 77,
  }),
  definitionProperty("includeLeftEndPanel", "Left finished end panel", "construction", "cabinet-input-left-end-panel", {
    description: "Adds a finished panel to the exposed left end of the assembly.",
    terms: ["left gable", "applied end", "decorative end panel", "finished side"],
    componentTypes: CABINET_COMPONENT,
    priority: 68,
  }),
  definitionProperty("includeRightEndPanel", "Right finished end panel", "construction", "cabinet-input-right-end-panel", {
    description: "Adds a finished panel to the exposed right end of the assembly.",
    terms: ["right gable", "applied end", "decorative end panel", "finished side"],
    componentTypes: CABINET_COMPONENT,
    priority: 68,
  }),
  definitionProperty("leftEndPanelThickness", "Left finished-side thickness", "construction", "cabinet-input-left-end-panel-thickness", {
    description: "Thickness of the applied finished panel on the left end of the assembly.",
    terms: [
      "left end panel thickness",
      "left applied end thickness",
      "left gable thickness",
      "left finished side thickness",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 66,
  }),
  definitionProperty("rightEndPanelThickness", "Right finished-side thickness", "construction", "cabinet-input-right-end-panel-thickness", {
    description: "Thickness of the applied finished panel on the right end of the assembly.",
    terms: [
      "right end panel thickness",
      "right applied end thickness",
      "right gable thickness",
      "right finished side thickness",
    ],
    componentTypes: CABINET_COMPONENT,
    priority: 66,
  }),
  definitionProperty("levelingFeetEnabled", "Leveling feet", "installation", "cabinet-input-leveling-feet-enabled", {
    description: "Adds adjustable feet below cabinet modules.",
    terms: ["adjustable legs", "cabinet legs", "levelers", "plinth feet"],
    componentTypes: CABINET_COMPONENT,
    unitTypes: ["base", "tall", "vanity", "tv_console", "wardrobe"],
    priority: 72,
  }),
  definitionProperty("faceFrameEnabled", "Face frame", "construction", "cabinet-input-face-frame-enabled", {
    description: "Adds stiles and rails to create face-frame cabinet construction.",
    terms: ["framed cabinet", "stiles and rails", "inset cabinetry", "American style cabinet"],
    componentTypes: CABINET_COMPONENT,
    priority: 74,
  }),
  definitionProperty("faceFrameMaterialId", "Face frame material", "materials", "cabinet-input-face-frame-material", {
    description: "Material or finish used for face-frame stiles and rails.",
    terms: ["frame finish", "stile material", "rail material"],
    componentTypes: CABINET_COMPONENT,
  }),
  definitionProperty("includeCountertop", "Countertop / worktop", "worktop", "cabinet-input-countertop-enabled", {
    description: "Adds a finished top across the cabinet assembly.",
    terms: ["counter top", "work top", "bench top", "worksurface", "stone top"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
    priority: 82,
  }),
  definitionProperty("countertopThickness", "Countertop thickness", "worktop", "cabinet-input-countertop-thickness", {
    description: "Finished thickness of the countertop or worktop.",
    terms: ["worktop thickness", "benchtop thickness", "top slab"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
  }),
  definitionProperty("countertopOverhangFront", "Front countertop overhang", "worktop", "cabinet-input-countertop-overhang-front", {
    description: "Projection of the countertop beyond the cabinet fronts.",
    terms: ["worktop projection", "benchtop overhang", "front overhang"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
  }),
  definitionProperty("countertopMaterialId", "Countertop material", "materials", "cabinet-input-countertop-material", {
    description: "Finish or slab material used for the countertop.",
    terms: ["worktop finish", "stone", "quartz", "solid surface", "benchtop material"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
  }),
  definitionProperty("includeBacksplash", "Backsplash / upstand", "worktop", "cabinet-input-backsplash-enabled", {
    description: "Adds a vertical splash panel above the countertop.",
    terms: ["splashback", "upstand", "counter splash", "wall splash"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
    priority: 70,
  }),
  definitionProperty("backsplashHeight", "Backsplash height", "worktop", "cabinet-input-backsplash-height", {
    description: "Vertical height of the backsplash or upstand.",
    terms: ["splashback height", "upstand height"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: COUNTERTOP_ASSEMBLIES,
  }),
  definitionProperty("islandSeatingOverhangEnabled", "Island seating overhang", "seating", "cabinet-input-island-seating-enabled", {
    description: "Extends the island countertop to create a supported seating zone.",
    terms: ["breakfast bar", "stool overhang", "counter seating", "island knee space"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["kitchen_island"],
    priority: 85,
  }),
  definitionProperty("islandSeatingOverhangDepth", "Island seating depth", "seating", "cabinet-input-island-seating-overhang-depth", {
    description: "Clear countertop overhang provided for seated knees and stools.",
    terms: ["knee clearance", "breakfast bar depth", "stool overhang"],
    componentTypes: CABINET_COMPONENT,
    assemblyTypes: ["kitchen_island"],
    priority: 75,
  }),
];

function includesValue<T extends string>(values: readonly T[] | undefined, value: T | undefined): boolean {
  return !values || (value !== undefined && values.includes(value));
}

/** Returns whether a property belongs in the inspector for the current selection. */
export function isCabinetPropertyApplicable(
  property: CabinetPropertyMetadata,
  context: CabinetPropertyContext
): boolean {
  const activeModule = context.activeModule ?? null;
  if (property.scope === "module" && !activeModule) return false;

  const componentType = activeModule
    ? activeModule.millworkComponentType ?? "cabinet"
    : undefined;

  return (
    includesValue(property.componentTypes, componentType) &&
    includesValue(property.assemblyTypes, context.assemblyType) &&
    includesValue(property.unitTypes, activeModule?.type) &&
    includesValue(property.frontTypes, activeModule?.frontType)
  );
}

/** Returns the registry entries that apply to the current component and assembly. */
export function getCabinetPropertiesForContext(
  context: CabinetPropertyContext
): CabinetPropertyMetadata[] {
  return CABINET_PROPERTY_REGISTRY.filter((property) =>
    isCabinetPropertyApplicable(property, context)
  ).sort(comparePropertyPriority);
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSearchText(property: CabinetPropertyMetadata): string {
  return normalizeSearchText(
    [
      property.label,
      property.description,
      property.id,
      property.field,
      property.section,
      property.controlTestId,
      ...property.searchTerms,
    ].join(" ")
  );
}

function getSearchScore(property: CabinetPropertyMetadata, normalizedQuery: string): number {
  if (!normalizedQuery) return property.priority;

  const label = normalizeSearchText(property.label);
  const field = normalizeSearchText(property.field);
  const terms = property.searchTerms.map(normalizeSearchText);
  let score = property.priority;

  if (label === normalizedQuery) score += 1000;
  else if (label.startsWith(normalizedQuery)) score += 600;
  else if (label.includes(normalizedQuery)) score += 400;

  if (field === normalizedQuery) score += 800;
  else if (field.startsWith(normalizedQuery)) score += 350;

  if (terms.some((term) => term === normalizedQuery)) score += 700;
  else if (terms.some((term) => term.startsWith(normalizedQuery))) score += 300;

  return score;
}

function comparePropertyPriority(
  left: CabinetPropertyMetadata,
  right: CabinetPropertyMetadata
): number {
  return right.priority - left.priority || left.label.localeCompare(right.label);
}

/**
 * Searches applicable properties. Every word in the query must match, while
 * exact labels, field names, and trade synonyms receive the strongest rank.
 */
export function filterCabinetProperties(
  query: string,
  context: CabinetPropertyContext,
  options: CabinetPropertyFilterOptions = {}
): CabinetPropertyMetadata[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return CABINET_PROPERTY_REGISTRY
    .filter(
      (property) =>
        options.includeInapplicable === true ||
        isCabinetPropertyApplicable(property, context)
    )
    .filter((property) => {
      if (!queryTokens.length) return true;
      const searchText = getSearchText(property);
      return queryTokens.every((token) => searchText.includes(token));
    })
    .sort((left, right) => {
      const scoreDifference =
        getSearchScore(right, normalizedQuery) - getSearchScore(left, normalizedQuery);
      return scoreDifference || comparePropertyPriority(left, right);
    });
}

/** Finds a registered property by its stable `scope.field` identifier. */
export function getCabinetPropertyById(
  id: string
): CabinetPropertyMetadata | undefined {
  return CABINET_PROPERTY_REGISTRY.find((property) => property.id === id);
}
