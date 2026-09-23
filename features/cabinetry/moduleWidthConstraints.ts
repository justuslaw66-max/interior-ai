import {
  getCabinetAutomationState,
  isCabinetModuleWidthLocked,
} from "./automation";
import {
  getCabinetModuleRunWidth,
  getCabinetOverallWidth,
} from "./layout";
import {
  CABINET_MAX_MODULE_WIDTH_MM,
  getCabinetMinimumModuleWidthMm,
} from "./moduleWidthRules";
import type { CabinetDefinition } from "./types";

export interface CabinetOverallWidthLimits {
  minMm: number;
  maxMm: number;
}

/**
 * Returns conservative, solver-compatible limits for the overall-width controls.
 * Fixed fitting parts are included, specialty modules retain their dependent
 * minimums, and locked module widths are treated as fixed contributions.
 */
export function getCabinetOverallWidthLimits(
  definition: CabinetDefinition,
  maximumOverallWidthMm = 12_000
): CabinetOverallWidthLimits {
  const currentOverallWidthMm = Math.round(getCabinetOverallWidth(definition));
  if (!definition.modules.length) {
    return {
      minMm: currentOverallWidthMm,
      maxMm: currentOverallWidthMm,
    };
  }

  const fixedWidthMm = Math.max(
    0,
    getCabinetOverallWidth(definition) - getCabinetModuleRunWidth(definition)
  );
  const lockedModules = definition.modules.filter((module) =>
    isCabinetModuleWidthLocked(definition, module.id)
  );
  const unlockedModules = definition.modules.filter(
    (module) => !isCabinetModuleWidthLocked(definition, module.id)
  );

  // Equal sizing coupled to an individually locked bay has, at most, a tiny
  // rounding-specific range. Keep the control at the known-valid current value
  // and ask the user to release the conflicting lock before resizing.
  if (
    getCabinetAutomationState(definition).equalModuleSizing &&
    lockedModules.length > 0
  ) {
    return {
      minMm: currentOverallWidthMm,
      maxMm: currentOverallWidthMm,
    };
  }

  if (getCabinetAutomationState(definition).equalModuleSizing) {
    const equalMinimumModuleWidthMm = Math.max(
      ...definition.modules.map((module) => getCabinetMinimumModuleWidthMm(module, definition))
    );
    const minimumOverallWidthMm = Math.round(
      fixedWidthMm + equalMinimumModuleWidthMm * definition.modules.length
    );
    return {
      minMm: minimumOverallWidthMm,
      maxMm: Math.max(
        minimumOverallWidthMm,
        Math.min(
          maximumOverallWidthMm,
          Math.round(
            fixedWidthMm +
              CABINET_MAX_MODULE_WIDTH_MM * definition.modules.length
          )
        )
      ),
    };
  }

  const lockedWidthMm = lockedModules.reduce(
    (sum, module) => sum + module.width,
    0
  );
  const minimumUnlockedWidthMm = unlockedModules.reduce(
    (sum, module) => sum + getCabinetMinimumModuleWidthMm(module, definition),
    0
  );
  const maximumUnlockedWidthMm =
    unlockedModules.length * CABINET_MAX_MODULE_WIDTH_MM;
  const minimumOverallWidthMm = Math.round(
    fixedWidthMm + lockedWidthMm + minimumUnlockedWidthMm
  );
  const maximumFeasibleWidthMm = Math.round(
    fixedWidthMm + lockedWidthMm + maximumUnlockedWidthMm
  );

  if (!unlockedModules.length) {
    return {
      minMm: currentOverallWidthMm,
      maxMm: currentOverallWidthMm,
    };
  }

  return {
    minMm: minimumOverallWidthMm,
    maxMm: Math.max(
      minimumOverallWidthMm,
      Math.min(maximumOverallWidthMm, maximumFeasibleWidthMm)
    ),
  };
}
