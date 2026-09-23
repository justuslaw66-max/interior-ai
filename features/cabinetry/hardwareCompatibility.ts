import {
  CABINET_HARDWARE,
  getCabinetHardwareCatalogItem,
  getCabinetHardwareRole,
  isCabinetFrontHardwareType,
  type CabinetFrontHardwareType,
  type CabinetHardwareCatalogItem,
} from "./catalog/hardware";
import type {
  CabinetFrontType,
  CabinetHardwareRef,
  CabinetModuleDefinition,
  DoorStyle,
} from "./types";

export type CabinetHardwareCompatibilityStatus =
  | "compatible"
  | "review_required"
  | "incompatible";

export type CabinetHardwareCompatibilityReasonCode =
  | "compatible"
  | "unknown_custom_hardware"
  | "accessory_not_front_hardware"
  | "front_has_no_operable_panel"
  | "closed_front_has_no_opening_method"
  | "invalid_module_dimensions"
  | "front_too_small"
  | "glass_front_requires_mounting_review"
  | "edge_pull_incompatible_with_glass"
  | "edge_pull_requires_profile_review";

export interface CabinetHardwareCompatibilityReason {
  code: CabinetHardwareCompatibilityReasonCode;
  status: CabinetHardwareCompatibilityStatus;
  message: string;
}

export interface CabinetFrontEnvelope {
  frontCount: number;
  minimumFrontWidthMm: number;
  minimumFrontHeightMm: number;
}

export interface CabinetHardwareCompatibilityResult {
  status: CabinetHardwareCompatibilityStatus;
  isCompatible: boolean;
  isSelectable: boolean;
  knownCatalogHardware: boolean;
  hardwareId: string;
  hardwareType: CabinetHardwareRef["type"];
  moduleId: string;
  frontType: CabinetFrontType;
  doorStyle: DoorStyle;
  frontEnvelope: CabinetFrontEnvelope;
  reasons: readonly CabinetHardwareCompatibilityReason[];
}

export interface CabinetFrontHardwareFilterOptions {
  includeReviewRequired?: boolean;
}

export interface CabinetHardwareMinimumFrontSize {
  widthMm: number;
  heightMm: number;
}

export const CABINET_FRONT_HARDWARE_MINIMUM_FRONT_SIZE_MM: Readonly<
  Record<CabinetFrontHardwareType, CabinetHardwareMinimumFrontSize | null>
> = {
  none: null,
  bar_pull: { widthMm: 180, heightMm: 80 },
  knob: { widthMm: 60, heightMm: 60 },
  edge_pull: { widthMm: 120, heightMm: 60 },
  push_to_open: { widthMm: 80, heightMm: 80 },
};

const STATUS_PRIORITY: Readonly<Record<CabinetHardwareCompatibilityStatus, number>> = {
  compatible: 0,
  review_required: 1,
  incompatible: 2,
};

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Estimates the smallest generated front from module-level values. Construction
 * deductions (board thickness, reveal, toe kick) live on the assembly, so this
 * is a coarse compatibility envelope rather than a replacement for final part
 * validation.
 */
export function getCabinetModuleFrontEnvelope(
  module: CabinetModuleDefinition
): CabinetFrontEnvelope {
  if (!isFinitePositive(module.width) || !isFinitePositive(module.height)) {
    return {
      frontCount: 0,
      minimumFrontWidthMm: 0,
      minimumFrontHeightMm: 0,
    };
  }

  if (module.frontType === "open") {
    return {
      frontCount: 0,
      minimumFrontWidthMm: 0,
      minimumFrontHeightMm: 0,
    };
  }

  if (module.frontType === "drawer_stack") {
    const drawerCount = Math.max(0, Math.floor(module.drawerCount));
    return {
      frontCount: drawerCount,
      minimumFrontWidthMm: drawerCount > 0 ? module.width : 0,
      minimumFrontHeightMm: drawerCount > 0 ? module.height / drawerCount : 0,
    };
  }

  if (module.frontType === "door_and_drawer") {
    const doorCount = Math.max(1, Math.floor(module.doorCount));
    const drawerCount = Math.max(1, Math.floor(module.drawerCount));
    const drawerBandHeight = Math.min(220, module.height * 0.32);
    const doorBandHeight = Math.max(0, module.height - drawerBandHeight);

    return {
      frontCount: doorCount + drawerCount,
      minimumFrontWidthMm: Math.min(module.width / doorCount, module.width),
      minimumFrontHeightMm: Math.min(
        doorBandHeight,
        drawerBandHeight / drawerCount
      ),
    };
  }

  const doorCount =
    module.frontType === "double_door"
      ? Math.max(2, Math.floor(module.doorCount))
      : Math.max(1, Math.floor(module.doorCount || 1));

  return {
    frontCount: doorCount,
    minimumFrontWidthMm: module.width / doorCount,
    minimumFrontHeightMm: module.height,
  };
}

function compatibilityReason(
  code: CabinetHardwareCompatibilityReasonCode,
  status: CabinetHardwareCompatibilityStatus,
  message: string
): CabinetHardwareCompatibilityReason {
  return { code, status, message };
}

function highestStatus(
  reasons: readonly CabinetHardwareCompatibilityReason[]
): CabinetHardwareCompatibilityStatus {
  return reasons.reduce<CabinetHardwareCompatibilityStatus>(
    (current, reason) =>
      STATUS_PRIORITY[reason.status] > STATUS_PRIORITY[current]
        ? reason.status
        : current,
    "compatible"
  );
}

function isKnownCatalogHardware(hardware: CabinetHardwareRef): boolean {
  const catalogItem = getCabinetHardwareCatalogItem(hardware.id);
  return catalogItem?.type === hardware.type;
}

/**
 * Resolves whether a hardware item can be used as the selected module's front
 * opening hardware. Unknown custom items remain selectable for professional
 * workflows, but require review until their mounting data is catalogued.
 */
export function resolveCabinetHardwareCompatibility(
  hardware: CabinetHardwareRef,
  module: CabinetModuleDefinition
): CabinetHardwareCompatibilityResult {
  const reasons: CabinetHardwareCompatibilityReason[] = [];
  const frontEnvelope = getCabinetModuleFrontEnvelope(module);
  const knownCatalogHardware = isKnownCatalogHardware(hardware);
  const hardwareType = hardware.type;
  const hardwareRole = getCabinetHardwareRole(hardwareType);
  const isFrontHardware = isCabinetFrontHardwareType(hardwareType);

  if (hardwareRole === "accessory") {
    reasons.push(
      compatibilityReason(
        "accessory_not_front_hardware",
        "incompatible",
        `${hardware.name} is cabinet accessory hardware, not a door or drawer opening control.`
      )
    );
  }

  if (module.frontType === "open") {
    if (hardware.type !== "none") {
      reasons.push(
        compatibilityReason(
          "front_has_no_operable_panel",
          "incompatible",
          "Open storage has no door or drawer front for this hardware. Choose None or change the front layout."
        )
      );
    }
  } else if (hardware.type === "none") {
    reasons.push(
      compatibilityReason(
        "closed_front_has_no_opening_method",
        module.frontType === "slab_panel" ? "review_required" : "incompatible",
        module.frontType === "slab_panel"
          ? "Confirm that this slab panel is fixed or has an integrated grip. Otherwise choose a pull, edge pull, or push-to-open mechanism."
          : "This door or drawer has no opening method. Choose a pull, knob, edge pull, or push-to-open mechanism."
      )
    );
  }

  if (
    module.frontType !== "open" &&
    isFrontHardware &&
    hardwareType !== "none"
  ) {
    if (!isFinitePositive(module.width) || !isFinitePositive(module.height)) {
      reasons.push(
        compatibilityReason(
          "invalid_module_dimensions",
          "incompatible",
          "Set a valid positive module width and height before selecting front hardware."
        )
      );
    } else {
      const minimum = CABINET_FRONT_HARDWARE_MINIMUM_FRONT_SIZE_MM[hardwareType];
      if (
        minimum &&
        (frontEnvelope.frontCount === 0 ||
          frontEnvelope.minimumFrontWidthMm < minimum.widthMm ||
          frontEnvelope.minimumFrontHeightMm < minimum.heightMm)
      ) {
        reasons.push(
          compatibilityReason(
            "front_too_small",
            "incompatible",
            `${hardware.name} needs each front to be at least ${minimum.widthMm} × ${minimum.heightMm} mm. The smallest estimated front is ${Math.round(frontEnvelope.minimumFrontWidthMm)} × ${Math.round(frontEnvelope.minimumFrontHeightMm)} mm.`
          )
        );
      }
    }

    if (module.doorStyle === "glass" && hardwareType !== "push_to_open") {
      reasons.push(
        hardwareType === "edge_pull"
          ? compatibilityReason(
              "edge_pull_incompatible_with_glass",
              "incompatible",
              "Edge pulls cannot be assigned directly to a glass front. Choose a knob or pull approved for the front frame."
            )
          : compatibilityReason(
              "glass_front_requires_mounting_review",
              "review_required",
              "Confirm the mounting point and manufacturer approval before using this hardware on a glass front."
            )
      );
    } else if (
      hardwareType === "edge_pull" &&
      module.doorStyle !== "flat_slab"
    ) {
      reasons.push(
        compatibilityReason(
          "edge_pull_requires_profile_review",
          "review_required",
          "Confirm that the shaped front profile leaves a continuous mounting edge for this edge pull."
        )
      );
    }
  }

  if (!knownCatalogHardware && hardwareRole === "front_operation") {
    reasons.push(
      compatibilityReason(
        "unknown_custom_hardware",
        "review_required",
        "This custom hardware is not in the millwork catalog. Verify its dimensions, mounting method, and front compatibility."
      )
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      compatibilityReason(
        "compatible",
        "compatible",
        "This hardware is compatible with the selected front layout."
      )
    );
  }

  const status = highestStatus(reasons);

  return {
    status,
    isCompatible: status === "compatible",
    isSelectable: status !== "incompatible",
    knownCatalogHardware,
    hardwareId: hardware.id,
    hardwareType: hardware.type,
    moduleId: module.id,
    frontType: module.frontType,
    doorStyle: module.doorStyle,
    frontEnvelope,
    reasons,
  };
}

export function getCompatibleCabinetFrontHardware(
  module: CabinetModuleDefinition
): CabinetHardwareCatalogItem[];
export function getCompatibleCabinetFrontHardware<T extends CabinetHardwareRef>(
  module: CabinetModuleDefinition,
  hardwareItems: readonly T[],
  options?: CabinetFrontHardwareFilterOptions
): T[];
export function getCompatibleCabinetFrontHardware(
  module: CabinetModuleDefinition,
  hardwareItems: readonly CabinetHardwareRef[] = CABINET_HARDWARE,
  options: CabinetFrontHardwareFilterOptions = {}
): CabinetHardwareRef[] {
  return hardwareItems.filter((hardware) => {
    const compatibility = resolveCabinetHardwareCompatibility(hardware, module);
    return (
      compatibility.status === "compatible" ||
      (options.includeReviewRequired === true &&
        compatibility.status === "review_required")
    );
  });
}

/**
 * Returns the first fully compatible opening method from the supplied catalog.
 * Callers that intend to patch a design should pass that design's hardware
 * collection so the recommendation cannot introduce an unresolved reference.
 */
export function getRecommendedCompatibleCabinetFrontHardware(
  module: CabinetModuleDefinition
): CabinetHardwareCatalogItem | undefined;
export function getRecommendedCompatibleCabinetFrontHardware<
  T extends CabinetHardwareRef,
>(module: CabinetModuleDefinition, hardwareItems: readonly T[]): T | undefined;
export function getRecommendedCompatibleCabinetFrontHardware(
  module: CabinetModuleDefinition,
  hardwareItems: readonly CabinetHardwareRef[] = CABINET_HARDWARE
): CabinetHardwareRef | undefined {
  return getCompatibleCabinetFrontHardware(module, hardwareItems)[0];
}
