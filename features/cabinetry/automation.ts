import {
  getCabinetModuleRunWidth,
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "./layout";
import {
  CABINET_MAX_MODULE_WIDTH_MM,
  CABINET_MIN_MODULE_WIDTH_MM,
  getCabinetMinimumModuleWidthMm,
} from "./moduleWidthRules";
import type {
  CabinetAutomationState,
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetParameterState,
  CabinetValueSource,
} from "./types";

export { CABINET_MAX_MODULE_WIDTH_MM, CABINET_MIN_MODULE_WIDTH_MM } from "./moduleWidthRules";
export const CABINET_OVERALL_WIDTH_PARAMETER_PATH = "overall.width";
export const CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH = "modules.equalWidths";

const CABINET_DEFINITION_NON_PARAMETER_FIELDS = new Set<string>([
  "id",
  "name",
  "version",
  "units",
  "millworkFamily",
  "millworkAssemblyType",
  "sourcePresetId",
  "requiredHostType",
  "automation",
  "fitState",
  "modules",
  "materials",
  "hardware",
  "createdAt",
  "updatedAt",
]);

const CABINET_AUTOMATIC_MODULE_PARAMETER_FIELDS = new Set<string>([
  "doorLayoutMode",
  "drawerHeightMode",
  "drawerHeightProportions",
  "handlePlacementMode",
  "handleOffsetX",
  "handleOffsetY",
]);

function cabinetDefinitionParameterPath(field: string): string {
  if (field === "totalWidth") return CABINET_OVERALL_WIDTH_PARAMETER_PATH;
  if (field === "height") return "overall.height";
  if (field === "depth") return "overall.depth";
  return field;
}

export function cabinetModuleParameterPath(moduleId: string, field: string): string {
  return `modules.${moduleId}.${field}`;
}

export function cabinetModuleWidthParameterPath(moduleId: string): string {
  return cabinetModuleParameterPath(moduleId, "width");
}

export function createCabinetAutomationState(
  definition: Partial<CabinetDefinition> & Pick<CabinetDefinition, "modules">
): CabinetAutomationState {
  const parameters: Record<string, CabinetParameterState> = {
    [CABINET_OVERALL_WIDTH_PARAMETER_PATH]: { source: "template_defined" },
    [CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH]: { source: "template_defined" },
    "overall.height": { source: "template_defined" },
    "overall.depth": { source: "template_defined" },
    leftFillerWidth: { source: "template_defined" },
    rightFillerWidth: { source: "template_defined" },
  };

  // Presets contain many assembly-specific controls. Discover present values so
  // new construction fields cannot silently fall back to inherited provenance.
  Object.entries(definition).forEach(([field, value]) => {
    if (value === undefined || CABINET_DEFINITION_NON_PARAMETER_FIELDS.has(field)) return;
    parameters[cabinetDefinitionParameterPath(field)] = { source: "template_defined" };
  });

  definition.modules.forEach((module) => {
    Object.entries(module).forEach(([field, value]) => {
      if (field === "id" || value === undefined) return;
      parameters[cabinetModuleParameterPath(module.id, field)] = {
        source: CABINET_AUTOMATIC_MODULE_PARAMETER_FIELDS.has(field)
          ? "automatic"
          : "template_defined",
      };
    });

    CABINET_AUTOMATIC_MODULE_PARAMETER_FIELDS.forEach((field) => {
      parameters[cabinetModuleParameterPath(module.id, field)] = { source: "automatic" };
    });
  });

  return {
    moduleSizingMode: "automatic",
    equalModuleSizing: false,
    fillerSizingMode: "automatic",
    shelfSpacingMode: "even",
    frontLayoutMode: "recommended",
    parameters,
  };
}

export function getCabinetAutomationState(definition: CabinetDefinition): CabinetAutomationState {
  const defaults = createCabinetAutomationState(definition);
  return {
    ...defaults,
    ...definition.automation,
    parameters: {
      ...defaults.parameters,
      ...definition.automation?.parameters,
    },
  };
}

export function getCabinetParameterState(
  definition: CabinetDefinition,
  path: string
): CabinetParameterState {
  return getCabinetAutomationState(definition).parameters[path] ?? { source: "inherited" };
}

export function setCabinetParameterState(
  definition: CabinetDefinition,
  path: string,
  patch: Partial<CabinetParameterState>
): CabinetDefinition {
  const automation = getCabinetAutomationState(definition);
  const current = automation.parameters[path] ?? { source: "inherited" as const };
  return {
    ...definition,
    automation: {
      ...automation,
      parameters: {
        ...automation.parameters,
        [path]: { ...current, ...patch },
      },
    },
  };
}

export function setCabinetModuleWidthLocked(
  definition: CabinetDefinition,
  moduleId: string,
  locked: boolean
): CabinetDefinition {
  return setCabinetParameterState(definition, cabinetModuleWidthParameterPath(moduleId), { locked });
}

export function setCabinetParameterLocked(
  definition: CabinetDefinition,
  path: string,
  locked: boolean
): CabinetDefinition {
  return setCabinetParameterState(definition, path, { locked });
}

export function isCabinetParameterLocked(
  definition: CabinetDefinition,
  path: string
): boolean {
  return Boolean(getCabinetParameterState(definition, path).locked);
}

export function setCabinetOverallWidthLocked(
  definition: CabinetDefinition,
  locked: boolean
): CabinetDefinition {
  return setCabinetParameterLocked(definition, CABINET_OVERALL_WIDTH_PARAMETER_PATH, locked);
}

export function isCabinetOverallWidthLocked(definition: CabinetDefinition): boolean {
  return isCabinetParameterLocked(definition, CABINET_OVERALL_WIDTH_PARAMETER_PATH);
}

export function isCabinetModuleWidthLocked(
  definition: CabinetDefinition,
  moduleId: string
): boolean {
  return Boolean(getCabinetParameterState(definition, cabinetModuleWidthParameterPath(moduleId)).locked);
}

export function syncCabinetDefinitionDimensions(definition: CabinetDefinition): CabinetDefinition {
  return {
    ...definition,
    totalWidth: getCabinetOverallWidth(definition),
    height: getCabinetOverallHeight(definition),
    depth: getCabinetOverallDepth(definition),
    updatedAt: new Date().toISOString(),
  };
}

export type CabinetDistributionIssueCode =
  | "invalid_target_width"
  | "overall_width_locked"
  | "equal_widths_conflict"
  | "locked_modules_exceed_space"
  | "no_unlocked_modules"
  | "unlocked_modules_too_narrow"
  | "unlocked_modules_too_wide";

export interface CabinetDistributionIssue {
  code: CabinetDistributionIssueCode;
  message: string;
  moduleIds: string[];
  suggestedAction: "unlock_modules" | "increase_space" | "reduce_locked_widths" | "review_width";
}

export interface CabinetWidthAdjustment {
  moduleId: string;
  previousWidthMm: number;
  nextWidthMm: number;
  source: CabinetValueSource;
}

export interface CabinetDistributionResult {
  ok: boolean;
  definition: CabinetDefinition;
  issues: CabinetDistributionIssue[];
  adjustments: CabinetWidthAdjustment[];
}

function snapWidth(value: number, incrementMm: number): number {
  if (incrementMm <= 1) return Math.round(value);
  return Math.round(value / incrementMm) * incrementMm;
}

export function distributeCabinetModuleWidths(
  definition: CabinetDefinition,
  targetModuleRunWidthMm: number,
  options: {
    minimumModuleWidthMm?: number;
    maximumModuleWidthMm?: number;
    minimumModuleWidthById?: Record<string, number>;
    maximumModuleWidthById?: Record<string, number>;
    snapIncrementMm?: number;
    source?: CabinetValueSource;
  } = {}
): CabinetDistributionResult {
  const minimumModuleWidthMm = options.minimumModuleWidthMm ?? CABINET_MIN_MODULE_WIDTH_MM;
  const maximumModuleWidthMm = options.maximumModuleWidthMm ?? CABINET_MAX_MODULE_WIDTH_MM;
  const snapIncrementMm = options.snapIncrementMm ?? 1;
  const source = options.source ?? "automatic";
  const minimumWidthFor = (module: CabinetModuleDefinition) =>
    Math.max(
      minimumModuleWidthMm,
      getCabinetMinimumModuleWidthMm(module, definition),
      options.minimumModuleWidthById?.[module.id] ?? minimumModuleWidthMm
    );
  const maximumWidthFor = (module: CabinetModuleDefinition) =>
    Math.min(
      maximumModuleWidthMm,
      options.maximumModuleWidthById?.[module.id] ?? maximumModuleWidthMm
    );

  if (!Number.isFinite(targetModuleRunWidthMm) || targetModuleRunWidthMm <= 0) {
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "invalid_target_width",
        message: "The available width must be a positive measurement before modules can be distributed.",
        moduleIds: [],
        suggestedAction: "review_width",
      }],
    };
  }

  const lockedModules = definition.modules.filter((module) =>
    isCabinetModuleWidthLocked(definition, module.id)
  );
  const unlockedModules = definition.modules.filter(
    (module) => !isCabinetModuleWidthLocked(definition, module.id)
  );
  const automation = getCabinetAutomationState(definition);

  if (automation.equalModuleSizing && definition.modules.length > 0) {
    const roundedTargetMm = Math.round(targetModuleRunWidthMm);
    const baseWidthMm = Math.floor(roundedTargetMm / definition.modules.length);
    const remainderMm = roundedTargetMm - baseWidthMm * definition.modules.length;
    const equalWidthById = new Map(
      definition.modules.map((module, index) => [
        module.id,
        baseWidthMm + (index < remainderMm ? 1 : 0),
      ])
    );
    const outOfRangeModules = definition.modules.filter((module) => {
      const widthMm = equalWidthById.get(module.id) ?? 0;
      return widthMm < minimumWidthFor(module) || widthMm > maximumWidthFor(module);
    });
    if (outOfRangeModules.length) {
      return {
        ok: false,
        definition,
        adjustments: [],
        issues: [{
          code: "equal_widths_conflict",
          message: `Equal module sizing cannot divide ${roundedTargetMm} mm into ${definition.modules.length} valid bays.`,
          moduleIds: outOfRangeModules.map((module) => module.id),
          suggestedAction: "review_width",
        }],
      };
    }
    const conflictingLockedModules = lockedModules.filter(
      (module) => Math.abs(module.width - (equalWidthById.get(module.id) ?? module.width)) > 0.5
    );
    if (conflictingLockedModules.length) {
      return {
        ok: false,
        definition,
        adjustments: [],
        issues: [{
          code: "equal_widths_conflict",
          message: "Individual module locks conflict with the equal-width layout.",
          moduleIds: conflictingLockedModules.map((module) => module.id),
          suggestedAction: "unlock_modules",
        }],
      };
    }

    const adjustments: CabinetWidthAdjustment[] = [];
    let equalDefinition: CabinetDefinition = {
      ...definition,
      automation,
      modules: definition.modules.map((module) => {
        if (isCabinetModuleWidthLocked(definition, module.id)) return module;
        const nextWidthMm = equalWidthById.get(module.id) ?? module.width;
        if (nextWidthMm !== module.width) {
          adjustments.push({
            moduleId: module.id,
            previousWidthMm: module.width,
            nextWidthMm,
            source,
          });
        }
        return { ...module, width: nextWidthMm };
      }),
    };
    unlockedModules.forEach((module) => {
      equalDefinition = setCabinetParameterState(
        equalDefinition,
        cabinetModuleWidthParameterPath(module.id),
        { source }
      );
    });
    return {
      ok: true,
      definition: syncCabinetDefinitionDimensions(equalDefinition),
      issues: [],
      adjustments,
    };
  }

  const lockedWidthMm = lockedModules.reduce((sum, module) => sum + module.width, 0);
  const remainingWidthMm = Math.round(targetModuleRunWidthMm - lockedWidthMm);

  if (remainingWidthMm < 0) {
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "locked_modules_exceed_space",
        message: `Locked modules need ${lockedWidthMm} mm, which is wider than the ${Math.round(targetModuleRunWidthMm)} mm available for modules.`,
        moduleIds: lockedModules.map((module) => module.id),
        suggestedAction: "reduce_locked_widths",
      }],
    };
  }

  if (unlockedModules.length === 0) {
    if (Math.abs(remainingWidthMm) <= 1) {
      return { ok: true, definition: syncCabinetDefinitionDimensions(definition), issues: [], adjustments: [] };
    }
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "no_unlocked_modules",
        message: `All module widths are locked, leaving ${Math.abs(remainingWidthMm)} mm that cannot be allocated.`,
        moduleIds: lockedModules.map((module) => module.id),
        suggestedAction: "unlock_modules",
      }],
    };
  }

  const minimumRequiredMm = unlockedModules.reduce(
    (sum, module) => sum + minimumWidthFor(module),
    0
  );
  if (remainingWidthMm < minimumRequiredMm) {
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "unlocked_modules_too_narrow",
        message: `${unlockedModules.length} unlocked modules need at least ${minimumRequiredMm} mm, but only ${remainingWidthMm} mm remains.`,
        moduleIds: unlockedModules.map((module) => module.id),
        suggestedAction: lockedModules.length ? "reduce_locked_widths" : "increase_space",
      }],
    };
  }

  const maximumAllowedMm = unlockedModules.reduce(
    (sum, module) => sum + maximumWidthFor(module),
    0
  );
  if (remainingWidthMm > maximumAllowedMm) {
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "unlocked_modules_too_wide",
        message: `${unlockedModules.length} unlocked modules can cover at most ${maximumAllowedMm} mm. Add another module or reduce the fitted width.`,
        moduleIds: unlockedModules.map((module) => module.id),
        suggestedAction: "review_width",
      }],
    };
  }

  const currentUnlockedWidthMm = unlockedModules.reduce((sum, module) => sum + module.width, 0);
  let assignedWidthMm = 0;
  const nextWidthById = new Map<string, number>();

  unlockedModules.forEach((module, index) => {
    const modulesAfter = unlockedModules.slice(index + 1);
    const remainingMinimumMm = modulesAfter.reduce(
      (sum, remainingModule) => sum + minimumWidthFor(remainingModule),
      0
    );
    const remainingMaximumMm = modulesAfter.reduce(
      (sum, remainingModule) => sum + maximumWidthFor(remainingModule),
      0
    );
    const idealWidthMm =
      currentUnlockedWidthMm > 0
        ? (module.width / currentUnlockedWidthMm) * remainingWidthMm
        : remainingWidthMm / unlockedModules.length;
    const snappedWidthMm = snapWidth(idealWidthMm, snapIncrementMm);
    const lowerBoundMm = Math.max(
      minimumWidthFor(module),
      remainingWidthMm - assignedWidthMm - remainingMaximumMm
    );
    const upperBoundMm = Math.min(
      maximumWidthFor(module),
      remainingWidthMm - assignedWidthMm - remainingMinimumMm
    );
    const nextWidthMm =
      index === unlockedModules.length - 1
        ? remainingWidthMm - assignedWidthMm
        : Math.max(lowerBoundMm, Math.min(upperBoundMm, snappedWidthMm));
    nextWidthById.set(module.id, nextWidthMm);
    assignedWidthMm += nextWidthMm;
  });

  const adjustments: CabinetWidthAdjustment[] = [];
  let nextDefinition: CabinetDefinition = {
    ...definition,
    automation: getCabinetAutomationState(definition),
    modules: definition.modules.map((module) => {
      const nextWidthMm = nextWidthById.get(module.id);
      if (nextWidthMm === undefined) return module;
      if (nextWidthMm !== module.width) {
        adjustments.push({
          moduleId: module.id,
          previousWidthMm: module.width,
          nextWidthMm,
          source,
        });
      }
      return { ...module, width: nextWidthMm };
    }),
  };

  unlockedModules.forEach((module) => {
    nextDefinition = setCabinetParameterState(
      nextDefinition,
      cabinetModuleWidthParameterPath(module.id),
      { source }
    );
  });

  return {
    ok: true,
    definition: syncCabinetDefinitionDimensions(nextDefinition),
    issues: [],
    adjustments,
  };
}

export function resizeCabinetToOverallWidth(
  definition: CabinetDefinition,
  targetOverallWidthMm: number,
  options: Parameters<typeof distributeCabinetModuleWidths>[2] = {}
): CabinetDistributionResult {
  if (
    isCabinetOverallWidthLocked(definition) &&
    Math.abs(getCabinetOverallWidth(definition) - targetOverallWidthMm) > 0.5
  ) {
    return {
      ok: false,
      definition,
      adjustments: [],
      issues: [{
        code: "overall_width_locked",
        message: `Overall width is locked at ${Math.round(getCabinetOverallWidth(definition))} mm. Unlock it before fitting or resizing the complete assembly.`,
        moduleIds: [],
        suggestedAction: "unlock_modules",
      }],
    };
  }
  const fixedWidthMm = getCabinetOverallWidth(definition) - getCabinetModuleRunWidth(definition);
  const result = distributeCabinetModuleWidths(
    definition,
    targetOverallWidthMm - fixedWidthMm,
    options
  );
  if (!result.ok) return result;
  const source = options.source ?? "user_overridden";
  const marked = setCabinetParameterState(result.definition, "overall.width", { source });
  return { ...result, definition: syncCabinetDefinitionDimensions(marked) };
}

export function setCabinetModuleWidth(
  definition: CabinetDefinition,
  moduleId: string,
  widthMm: number
): CabinetDefinition {
  if (
    isCabinetOverallWidthLocked(definition) ||
    isCabinetModuleWidthLocked(definition, moduleId) ||
    getCabinetAutomationState(definition).equalModuleSizing
  ) {
    return definition;
  }
  const next = {
    ...definition,
    modules: definition.modules.map((module) =>
      module.id === moduleId
        ? {
            ...module,
            width: Math.max(
              getCabinetMinimumModuleWidthMm(module, definition),
              Math.min(CABINET_MAX_MODULE_WIDTH_MM, widthMm)
            ),
          }
        : module
    ),
  };
  return syncCabinetDefinitionDimensions(
    setCabinetParameterState(next, cabinetModuleWidthParameterPath(moduleId), {
      source: "user_overridden",
    })
  );
}

export function setCabinetAutomationMode(
  definition: CabinetDefinition,
  patch: Partial<Omit<CabinetAutomationState, "parameters">>
): CabinetDefinition {
  const automation = getCabinetAutomationState(definition);
  return {
    ...definition,
    automation: {
      ...automation,
      ...patch,
    },
  };
}

export function setCabinetEqualModuleSizing(
  definition: CabinetDefinition,
  enabled: boolean
): CabinetDefinition {
  const automation = getCabinetAutomationState(definition);
  return setCabinetParameterState(
    {
      ...definition,
      automation: {
        ...automation,
        equalModuleSizing: enabled,
      },
    },
    CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH,
    { source: "user_overridden", locked: enabled }
  );
}

export function getCabinetModuleById(
  definition: CabinetDefinition,
  moduleId: string
): CabinetModuleDefinition | undefined {
  return definition.modules.find((module) => module.id === moduleId);
}
