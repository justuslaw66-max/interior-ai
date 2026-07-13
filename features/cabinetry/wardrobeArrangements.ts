import {
  cabinetModuleParameterPath,
  getCabinetParameterState,
  setCabinetParameterState,
} from "./automation";
import {
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
} from "./drawerBoxLayout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
} from "./drawerSlideLayout";
import {
  CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
  CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
} from "./doorHingeLayout";
import { getCabinetRecommendedDoorCount } from "./frontBehavior";
import { resolveCabinetHardwareCompatibility } from "./hardwareCompatibility";
import {
  CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
  CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
  CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
  CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
  CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
} from "./shelfPinLayout";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetValidationIssue,
  CabinetValueSource,
} from "./types";
import { validateCabinetDefinition } from "./validation";

export type CabinetWardrobeArrangementId =
  | "long_hanging"
  | "double_hanging"
  | "shelves"
  | "drawer_bank"
  | "mixed_storage";

export type CabinetWardrobeArrangementVisualElement =
  | "hanging_rod"
  | "shelf"
  | "drawer";

export interface CabinetWardrobeArrangementVisualMetadata {
  /** Normalized bottom-to-top locations used by a Guided card illustration. */
  hangingRodLevels: readonly number[];
  /** Normalized bottom-to-top locations used by a Guided card illustration. */
  shelfLevels: readonly number[];
  drawerBands: number;
  front: "open" | "doors" | "drawers" | "doors_and_drawer";
  dominantElement: CabinetWardrobeArrangementVisualElement;
}

export interface CabinetWardrobeArrangementOption {
  id: CabinetWardrobeArrangementId;
  label: string;
  description: string;
  accessibilityLabel: string;
  minimumHeightMm: number;
  minimumDepthMm: number;
  visual: CabinetWardrobeArrangementVisualMetadata;
}

/**
 * UI-independent card data. The normalized levels are deliberately semantic so
 * Guided mode can render them as CSS, SVG, canvas, or native controls without
 * importing editor components into this domain layer.
 */
export const CABINET_WARDROBE_ARRANGEMENTS = [
  {
    id: "long_hanging",
    label: "Long hanging",
    description: "One high rail with a top shelf for coats, dresses, and long garments.",
    accessibilityLabel: "Long hanging arrangement with one high rail and one top shelf",
    minimumHeightMm: 1600,
    minimumDepthMm: 500,
    visual: {
      hangingRodLevels: [0.72],
      shelfLevels: [0.9],
      drawerBands: 0,
      front: "open",
      dominantElement: "hanging_rod",
    },
  },
  {
    id: "double_hanging",
    label: "Double hanging",
    description: "Two vertically spaced rails for shirts, jackets, trousers, and folded-over garments.",
    accessibilityLabel: "Double hanging arrangement with upper and lower rails and one top shelf",
    minimumHeightMm: 2200,
    minimumDepthMm: 500,
    visual: {
      hangingRodLevels: [0.43, 0.78],
      shelfLevels: [0.91],
      drawerBands: 0,
      front: "open",
      dominantElement: "hanging_rod",
    },
  },
  {
    id: "shelves",
    label: "Shelves",
    description: "Evenly spaced adjustable shelves for folded clothes, bags, shoes, and boxes.",
    accessibilityLabel: "Shelf arrangement with seven evenly spaced adjustable shelves",
    minimumHeightMm: 900,
    minimumDepthMm: 300,
    visual: {
      hangingRodLevels: [],
      shelfLevels: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.92],
      drawerBands: 0,
      front: "open",
      dominantElement: "shelf",
    },
  },
  {
    id: "drawer_bank",
    label: "Drawer bank",
    description: "Five graduated soft-close drawers for folded clothing and smaller accessories.",
    accessibilityLabel: "Drawer bank arrangement with five graduated drawers",
    minimumHeightMm: 900,
    minimumDepthMm: 350,
    visual: {
      hangingRodLevels: [],
      shelfLevels: [],
      drawerBands: 5,
      front: "drawers",
      dominantElement: "drawer",
    },
  },
  {
    id: "mixed_storage",
    label: "Mixed storage",
    description: "A top drawer, enclosed hanging space, and two shelves for a balanced everyday wardrobe.",
    accessibilityLabel: "Mixed storage arrangement with one drawer, two doors, one rail, and two shelves",
    minimumHeightMm: 1800,
    minimumDepthMm: 500,
    visual: {
      hangingRodLevels: [0.69],
      shelfLevels: [0.16, 0.84],
      drawerBands: 1,
      front: "doors_and_drawer",
      dominantElement: "hanging_rod",
    },
  },
] as const satisfies readonly CabinetWardrobeArrangementOption[];

export type CabinetWardrobeArrangementIssueCode =
  | "module_not_found"
  | "module_not_eligible"
  | "insufficient_geometry"
  | "required_hardware_unavailable"
  | "locked_parameter"
  | "validation_failed";

export interface CabinetWardrobeArrangementIssue {
  code: CabinetWardrobeArrangementIssueCode;
  message: string;
  paths: string[];
  validationIssues?: CabinetValidationIssue[];
}

export interface ApplyCabinetWardrobeArrangementOptions {
  /**
   * Keeps the operation pure and deterministic: callers that own revision time
   * may supply it, while callers that do not leave the existing timestamp alone.
   */
  updatedAt?: string;
}

export interface CabinetWardrobeArrangementResult {
  ok: boolean;
  arrangementId: CabinetWardrobeArrangementId;
  moduleId: string;
  definition: CabinetDefinition;
  changedPaths: string[];
  affectedPaths: string[];
  issues: CabinetWardrobeArrangementIssue[];
}

type ArrangementPatch = Partial<CabinetModuleDefinition>;

const AUTOMATIC_FIELDS = new Set<keyof CabinetModuleDefinition>([
  "doorCount",
  "drawerHeightProportions",
  "shelfPositionsMm",
  "hangingRodHeight",
  "hangingRodSpacing",
  "hardwareId",
  "handleOffsetX",
  "handleOffsetY",
  "shelfPinRowPairCount",
  "shelfPinHoleCount",
  "shelfPinHoleSpacing",
  "shelfPinInsetFromFront",
  "shelfPinStartHeight",
  "doorHingeCountPerDoor",
  "doorHingeInsetFromTopBottom",
  "drawerBoxSideThickness",
  "drawerBoxBottomThickness",
  "drawerBoxHeightClearance",
  "drawerBoxBackClearance",
  "drawerSlideLength",
  "drawerSlideClearance",
]);

function parameterSource(field: keyof CabinetModuleDefinition): CabinetValueSource {
  return AUTOMATIC_FIELDS.has(field) ? "automatic" : "user_overridden";
}

function optionFor(id: CabinetWardrobeArrangementId): CabinetWardrobeArrangementOption {
  return CABINET_WARDROBE_ARRANGEMENTS.find((option) => option.id === id)!;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => Object.is(value, right[index]))
    );
  }
  return Object.is(left, right);
}

function isEligibleWardrobeModule(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): boolean {
  if ((module.millworkComponentType ?? "cabinet") !== "cabinet") return false;
  return (
    module.type === "wardrobe" ||
    (definition.millworkFamily === "closet" &&
      (module.type === "tall" || module.type === "wall"))
  );
}

function customShelfPositions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  levels: readonly number[]
): number[] {
  const minimum = definition.toeKickHeight + definition.boardThickness;
  const maximum = Math.max(minimum, module.height - definition.boardThickness);
  const span = Math.max(0, maximum - minimum);
  return levels.map((level) => Math.round(minimum + span * level));
}

function longHangingRodHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const minimum = definition.toeKickHeight + definition.boardThickness + 900;
  const maximum = module.height - definition.boardThickness - 100;
  return Math.round(Math.max(minimum, Math.min(module.height - 650, maximum)));
}

function doubleHangingGeometry(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): { height: number; spacing: number } {
  const lower = definition.toeKickHeight + definition.boardThickness + 950;
  const upper = module.height - definition.boardThickness - 450;
  return {
    height: Math.round(upper),
    spacing: Math.round(upper - lower),
  };
}

function defaultDrawerSlideLength(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const interiorDepth = module.depth - definition.backPanelThickness;
  return Math.max(
    1,
    Math.min(
      module.drawerSlideLength ?? CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
      Math.floor(interiorDepth - 20)
    )
  );
}

function commonPatch(): ArrangementPatch {
  return {
    doorLayoutMode: "recommended",
    drawerHeightMode: "recommended",
    drawerHeightProportions: undefined,
    handlePlacementMode: "automatic",
    handleOffsetX: undefined,
    handleOffsetY: undefined,
  };
}

function openStorageHardwarePatch(module: CabinetModuleDefinition): ArrangementPatch {
  return {
    hardwareId: "none",
    doorHingeHardwareEnabled: false,
    doorHingeCountPerDoor:
      module.doorHingeCountPerDoor ?? CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
    doorHingeInsetFromTopBottom:
      module.doorHingeInsetFromTopBottom ??
      CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
    drawerBoxEnabled: false,
    drawerSlideHardwareEnabled: false,
  };
}

function shelfPinPatch(module: CabinetModuleDefinition, enabled: boolean): ArrangementPatch {
  return {
    shelfPinRowsEnabled: enabled,
    shelfPinRowPairCount:
      module.shelfPinRowPairCount ?? CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
    shelfPinHoleCount: module.shelfPinHoleCount ?? CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
    shelfPinHoleSpacing:
      module.shelfPinHoleSpacing ?? CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
    shelfPinInsetFromFront:
      module.shelfPinInsetFromFront ?? CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
    shelfPinStartHeight:
      module.shelfPinStartHeight ?? CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
  };
}

function drawerHardwarePatch(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  enabled: boolean
): ArrangementPatch {
  return {
    drawerBoxEnabled: enabled,
    drawerBoxSideThickness:
      module.drawerBoxSideThickness ?? CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
    drawerBoxBottomThickness:
      module.drawerBoxBottomThickness ??
      CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
    drawerBoxHeightClearance:
      module.drawerBoxHeightClearance ??
      CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
    drawerBoxBackClearance:
      module.drawerBoxBackClearance ?? CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
    drawerSlideHardwareEnabled: enabled,
    drawerSlideLength: defaultDrawerSlideLength(definition, module),
    drawerSlideClearance:
      module.drawerSlideClearance ?? CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  };
}

function closedDoorHardwarePatch(module: CabinetModuleDefinition, enabled: boolean): ArrangementPatch {
  return {
    doorHingeHardwareEnabled: enabled,
    doorHingeCountPerDoor:
      module.doorHingeCountPerDoor ?? CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
    doorHingeInsetFromTopBottom:
      module.doorHingeInsetFromTopBottom ??
      CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
  };
}

function buildArrangementPatch(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  arrangementId: CabinetWardrobeArrangementId
): ArrangementPatch {
  const shared = commonPatch();

  if (arrangementId === "long_hanging") {
    return {
      ...shared,
      ...openStorageHardwarePatch(module),
      ...shelfPinPatch(module, true),
      frontType: "open",
      doorCount: 0,
      drawerCount: 0,
      shelfCount: 1,
      shelfSpacingMode: "custom",
      shelfPositionsMm: customShelfPositions(definition, module, [0.91]),
      hangingRodCount: 1,
      hangingRodHeight: longHangingRodHeight(definition, module),
      hangingRodSpacing: 0,
    };
  }

  if (arrangementId === "double_hanging") {
    const rods = doubleHangingGeometry(definition, module);
    return {
      ...shared,
      ...openStorageHardwarePatch(module),
      ...shelfPinPatch(module, true),
      frontType: "open",
      doorCount: 0,
      drawerCount: 0,
      shelfCount: 1,
      shelfSpacingMode: "custom",
      shelfPositionsMm: customShelfPositions(definition, module, [0.92]),
      hangingRodCount: 2,
      hangingRodHeight: rods.height,
      hangingRodSpacing: rods.spacing,
    };
  }

  if (arrangementId === "shelves") {
    return {
      ...shared,
      ...openStorageHardwarePatch(module),
      ...shelfPinPatch(module, true),
      frontType: "open",
      doorCount: 0,
      drawerCount: 0,
      shelfCount: 7,
      shelfSpacingMode: "even",
      shelfPositionsMm: undefined,
      hangingRodCount: 0,
      hangingRodHeight: longHangingRodHeight(definition, module),
      hangingRodSpacing: 0,
    };
  }

  if (arrangementId === "drawer_bank") {
    return {
      ...shared,
      ...closedDoorHardwarePatch(module, false),
      ...drawerHardwarePatch(definition, module, true),
      ...shelfPinPatch(module, false),
      frontType: "drawer_stack",
      doorCount: 0,
      drawerCount: 5,
      shelfCount: 0,
      shelfSpacingMode: "even",
      shelfPositionsMm: undefined,
      hangingRodCount: 0,
      hangingRodHeight: longHangingRodHeight(definition, module),
      hangingRodSpacing: 0,
    };
  }

  const preliminary: CabinetModuleDefinition = {
    ...module,
    ...shared,
    frontType: "door_and_drawer",
    doorCount: 2,
    drawerCount: 1,
    hingeSide: "double",
  };
  return {
    ...shared,
    ...closedDoorHardwarePatch(module, true),
    ...drawerHardwarePatch(definition, module, true),
    ...shelfPinPatch(module, true),
    frontType: "door_and_drawer",
    doorCount: getCabinetRecommendedDoorCount(definition, preliminary),
    drawerCount: 1,
    shelfCount: 2,
    shelfSpacingMode: "custom",
    shelfPositionsMm: customShelfPositions(definition, module, [0.16, 0.82]),
    hangingRodCount: 1,
    hangingRodHeight: longHangingRodHeight(definition, module),
    hangingRodSpacing: 0,
    hingeSide: "double",
  };
}

function withDefaultFrontHardware(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  patch: ArrangementPatch
): ArrangementPatch | null {
  const candidate = { ...module, ...patch };
  if (candidate.frontType === "open") {
    const none = definition.hardware.find((hardware) => hardware.type === "none");
    return { ...patch, hardwareId: none?.id };
  }

  const preferredIds = [
    "black_bar_pull",
    "brushed_steel_bar_pull",
    "round_knob",
    "edge_pull",
    "push_to_open",
  ];
  const hardware = [...definition.hardware]
    .sort((left, right) => {
      const leftIndex = preferredIds.indexOf(left.id);
      const rightIndex = preferredIds.indexOf(right.id);
      return (
        (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    })
    .find(
      (item) =>
        item.type !== "none" &&
        resolveCabinetHardwareCompatibility(item, candidate).status === "compatible"
    );
  return hardware ? { ...patch, hardwareId: hardware.id } : null;
}

function failedResult(
  definition: CabinetDefinition,
  moduleId: string,
  arrangementId: CabinetWardrobeArrangementId,
  issue: CabinetWardrobeArrangementIssue
): CabinetWardrobeArrangementResult {
  return {
    ok: false,
    arrangementId,
    moduleId,
    definition,
    changedPaths: [],
    affectedPaths: [],
    issues: [issue],
  };
}

/**
 * Applies one recognizable wardrobe arrangement as an all-or-nothing semantic
 * edit. It never mutates the input, never resizes the module, and never replaces
 * module IDs. Conflicting parameter locks or validator errors return the exact
 * input definition so a Guided editor can explain the refusal safely.
 */
export function applyCabinetWardrobeArrangement(
  definition: CabinetDefinition,
  moduleId: string,
  arrangementId: CabinetWardrobeArrangementId,
  options: ApplyCabinetWardrobeArrangementOptions = {}
): CabinetWardrobeArrangementResult {
  const selectedModule = definition.modules.find((candidate) => candidate.id === moduleId);
  if (!selectedModule) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "module_not_found",
      message: `Module ${moduleId} is not part of this cabinet definition.`,
      paths: [],
    });
  }
  if (!isEligibleWardrobeModule(definition, selectedModule)) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "module_not_eligible",
      message: "Guided wardrobe arrangements can only be applied to a wardrobe module or a tall closet-family module.",
      paths: [cabinetModuleParameterPath(moduleId, "type")],
    });
  }

  const option = optionFor(arrangementId);
  if (
    selectedModule.height < option.minimumHeightMm ||
    selectedModule.depth < option.minimumDepthMm
  ) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "insufficient_geometry",
      message: `${option.label} needs at least ${option.minimumHeightMm} mm height and ${option.minimumDepthMm} mm depth.`,
      paths: [
        cabinetModuleParameterPath(moduleId, "height"),
        cabinetModuleParameterPath(moduleId, "depth"),
      ],
    });
  }

  const patch = withDefaultFrontHardware(
    definition,
    selectedModule,
    buildArrangementPatch(definition, selectedModule, arrangementId)
  );
  if (!patch) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "required_hardware_unavailable",
      message: `${option.label} needs compatible front-opening hardware, but this definition has no compatible hardware option.`,
      paths: [cabinetModuleParameterPath(moduleId, "hardwareId")],
    });
  }

  const entries = Object.entries(patch) as Array<
    [keyof CabinetModuleDefinition, CabinetModuleDefinition[keyof CabinetModuleDefinition]]
  >;
  const lockedPaths = entries.flatMap(([field, nextValue]) => {
    const path = cabinetModuleParameterPath(moduleId, String(field));
    const state = getCabinetParameterState(definition, path);
    return state.locked && !valuesEqual(selectedModule[field], nextValue) ? [path] : [];
  });
  if (lockedPaths.length > 0) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "locked_parameter",
      message: `${option.label} would change ${lockedPaths.length} locked parameter${lockedPaths.length === 1 ? "" : "s"}. Unlock the listed field${lockedPaths.length === 1 ? "" : "s"} or choose another arrangement.`,
      paths: lockedPaths,
    });
  }

  const changedPaths = entries.flatMap(([field, nextValue]) =>
    valuesEqual(selectedModule[field], nextValue)
      ? []
      : [cabinetModuleParameterPath(moduleId, String(field))]
  );
  const affectedPaths = entries.map(([field]) =>
    cabinetModuleParameterPath(moduleId, String(field))
  );
  let candidate: CabinetDefinition = {
    ...definition,
    ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
    modules: definition.modules.map((item) =>
      item.id === moduleId ? { ...item, ...patch } : item
    ),
  };

  for (const [field] of entries) {
    const path = cabinetModuleParameterPath(moduleId, String(field));
    if (getCabinetParameterState(definition, path).locked) continue;
    candidate = setCabinetParameterState(candidate, path, {
      source: parameterSource(field),
    });
  }

  const validationIssues = validateCabinetDefinition(candidate).issues.filter(
    (issue) => issue.severity === "error"
  );
  if (validationIssues.length > 0) {
    return failedResult(definition, moduleId, arrangementId, {
      code: "validation_failed",
      message: `${option.label} could not be applied without validation errors. Review the module geometry and its existing specialty options.`,
      paths: validationIssues.flatMap((issue) =>
        issue.field ? [issue.field] : []
      ),
      validationIssues,
    });
  }

  return {
    ok: true,
    arrangementId,
    moduleId,
    definition: candidate,
    changedPaths,
    affectedPaths,
    issues: [],
  };
}

/** Returns the currently recognizable card state without modifying the design. */
export function getMatchingCabinetWardrobeArrangementId(
  definition: CabinetDefinition,
  moduleId: string
): CabinetWardrobeArrangementId | null {
  const selectedModule = definition.modules.find((candidate) => candidate.id === moduleId);
  if (!selectedModule || !isEligibleWardrobeModule(definition, selectedModule)) return null;

  if (
    selectedModule.frontType === "open" &&
    selectedModule.hangingRodCount === 1 &&
    selectedModule.shelfCount === 1 &&
    selectedModule.drawerCount === 0
  ) {
    return "long_hanging";
  }
  if (
    selectedModule.frontType === "open" &&
    selectedModule.hangingRodCount === 2 &&
    selectedModule.shelfCount === 1 &&
    selectedModule.drawerCount === 0
  ) {
    return "double_hanging";
  }
  if (
    selectedModule.frontType === "open" &&
    (selectedModule.hangingRodCount ?? 0) === 0 &&
    selectedModule.shelfCount === 7 &&
    selectedModule.drawerCount === 0
  ) {
    return "shelves";
  }
  if (
    selectedModule.frontType === "drawer_stack" &&
    (selectedModule.hangingRodCount ?? 0) === 0 &&
    selectedModule.drawerCount === 5
  ) {
    return "drawer_bank";
  }
  if (
    selectedModule.frontType === "door_and_drawer" &&
    selectedModule.hangingRodCount === 1 &&
    selectedModule.shelfCount === 2 &&
    selectedModule.drawerCount === 1
  ) {
    return "mixed_storage";
  }
  return null;
}
