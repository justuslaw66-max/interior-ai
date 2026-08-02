import {
  getCabinetOverallDepth,
  getCabinetOverallHeight,
} from "../layout";
import type { CabinetDefinition } from "../types";
import {
  CABINET_GUIDED_DIMENSION_INCREMENT_MM,
  CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM,
  CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM,
} from "./CabinetryStudio.config";

export function roundToIncrement(
  value: number,
  increment = CABINET_GUIDED_DIMENSION_INCREMENT_MM
): number {
  return Math.round(value / increment) * increment;
}

export function resizeCabinetDefinition(
  definition: CabinetDefinition,
  field: "height" | "depth",
  requestedValue: number
): CabinetDefinition {
  if (!Number.isFinite(requestedValue) || definition.modules.length === 0) {
    return definition;
  }

  if (field === "height") {
    const currentRunHeight = Math.max(
      ...definition.modules.map((module) => module.height)
    );
    const fixedHeight = getCabinetOverallHeight(definition) - currentRunHeight;
    const targetRunHeight = Math.max(
      CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM,
      requestedValue - fixedHeight
    );
    const scale = currentRunHeight > 0 ? targetRunHeight / currentRunHeight : 1;
    const tallestIndex = definition.modules.findIndex(
      (module) => module.height === currentRunHeight
    );
    return {
      ...definition,
      modules: definition.modules.map((module, index) => ({
        ...module,
        height:
          index === tallestIndex
            ? targetRunHeight
            : Math.max(
                CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM,
                roundToIncrement(module.height * scale)
              ),
      })),
    };
  }

  const currentRunDepth = Math.max(
    ...definition.modules.map((module) => module.depth)
  );
  const fixedDepth = getCabinetOverallDepth(definition) - currentRunDepth;
  const targetRunDepth = Math.max(
    CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM,
    requestedValue - fixedDepth
  );
  const scale = currentRunDepth > 0 ? targetRunDepth / currentRunDepth : 1;
  const deepestIndex = definition.modules.findIndex(
    (module) => module.depth === currentRunDepth
  );
  return {
    ...definition,
    modules: definition.modules.map((module, index) => ({
      ...module,
      depth:
        index === deepestIndex
          ? targetRunDepth
          : Math.max(
              CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM,
              roundToIncrement(module.depth * scale)
            ),
    })),
  };
}
