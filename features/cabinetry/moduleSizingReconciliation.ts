import {
  CABINET_MAX_MODULE_WIDTH_MM,
  type CabinetDistributionIssue,
  type CabinetDistributionIssueCode,
  type CabinetWidthAdjustment,
  cabinetModuleWidthParameterPath,
  distributeCabinetModuleWidths,
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
  isCabinetOverallWidthLocked,
  setCabinetAutomationMode,
  setCabinetParameterState,
  syncCabinetDefinitionDimensions,
} from "./automation";
import {
  getCabinetModuleRunWidth,
  getCabinetOverallWidth,
} from "./layout";
import {
  getCabinetMinimumModuleWidthMm,
} from "./moduleWidthRules";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetModuleSizingMode,
  CabinetValidationIssue,
  CabinetValueSource,
} from "./types";
import { validateCabinetDefinition } from "./validation";

export type CabinetModuleChangeOperation =
  | "add"
  | "duplicate"
  | "delete"
  | "reorder";

export type CabinetModuleSizingReconciliationRequest =
  | {
      operation: CabinetModuleChangeOperation;
      /** The complete proposed module array after the requested change. */
      modules: readonly CabinetModuleDefinition[];
      /** Overrides the preserved overall/fitted width used by automatic mode. */
      targetOverallWidthMm?: number;
      /** Provenance used for new or directly changed widths in manual mode. */
      source?: CabinetValueSource;
    }
  | {
      operation: "set_mode";
      mode: CabinetModuleSizingMode;
      /** Usually omitted; fitted definitions automatically reuse their fitted width. */
      targetOverallWidthMm?: number;
    };

export type CabinetModuleSizingReconciliationIssueCode =
  | CabinetDistributionIssueCode
  | "invalid_module_change"
  | "locked_module_width_changed"
  | "manual_module_width_out_of_range"
  | "manual_equal_widths_conflict"
  | "candidate_validation_failed";

export interface CabinetModuleSizingReconciliationIssue {
  code: CabinetModuleSizingReconciliationIssueCode;
  message: string;
  moduleIds: string[];
  suggestedAction: CabinetDistributionIssue["suggestedAction"];
  validationIssueCodes?: string[];
}

export interface CabinetModuleSizingReconciliationResult {
  ok: boolean;
  /** The original definition is returned unchanged on every refusal. */
  definition: CabinetDefinition;
  operation: CabinetModuleSizingReconciliationRequest["operation"];
  mode: CabinetModuleSizingMode;
  targetOverallWidthMm: number;
  preservedOverallWidth: boolean;
  replacedUserOverrides: boolean;
  adjustments: CabinetWidthAdjustment[];
  issues: CabinetModuleSizingReconciliationIssue[];
  validationIssues: CabinetValidationIssue[];
  explanation: string;
}

const FIT_WIDTH_MODES = new Set(["fit_width", "fit_both", "between_boundaries"]);

function failure(
  definition: CabinetDefinition,
  request: CabinetModuleSizingReconciliationRequest,
  mode: CabinetModuleSizingMode,
  targetOverallWidthMm: number,
  issues: CabinetModuleSizingReconciliationIssue[],
  validationIssues: CabinetValidationIssue[] = []
): CabinetModuleSizingReconciliationResult {
  return {
    ok: false,
    definition,
    operation: request.operation,
    mode,
    targetOverallWidthMm,
    preservedOverallWidth: true,
    replacedUserOverrides: false,
    adjustments: [],
    issues,
    validationIssues,
    explanation:
      issues[0]?.message ??
      "The module change could not be reconciled without producing an invalid assembly.",
  };
}

function validateModuleChangeShape(
  definition: CabinetDefinition,
  operation: CabinetModuleChangeOperation,
  modules: readonly CabinetModuleDefinition[]
): CabinetModuleSizingReconciliationIssue | null {
  const ids = modules.map((module) => module.id);
  const uniqueIds = new Set(ids);
  const previousIds = new Set(definition.modules.map((module) => module.id));
  const nextIds = new Set(ids);
  const invalidIds = modules.filter((module) => !module.id.trim()).map((module) => module.id);

  if (!modules.length) {
    return {
      code: "invalid_module_change",
      message: "A cabinet assembly must retain at least one module.",
      moduleIds: [],
      suggestedAction: "review_width",
    };
  }
  if (uniqueIds.size !== modules.length || invalidIds.length) {
    return {
      code: "invalid_module_change",
      message: "Every proposed module needs a unique, non-empty ID before widths can be reconciled.",
      moduleIds: ids.filter((id, index) => !id.trim() || ids.indexOf(id) !== index),
      suggestedAction: "review_width",
    };
  }

  const preservesPreviousIds = definition.modules.every((module) => nextIds.has(module.id));
  const containsOnlyPreviousIds = modules.every((module) => previousIds.has(module.id));
  const validShape =
    operation === "add" || operation === "duplicate"
      ? modules.length === definition.modules.length + 1 && preservesPreviousIds
      : operation === "delete"
        ? modules.length === definition.modules.length - 1 && containsOnlyPreviousIds
        : modules.length === definition.modules.length &&
          preservesPreviousIds &&
          containsOnlyPreviousIds;

  if (validShape) return null;
  return {
    code: "invalid_module_change",
    message: `The proposed module list does not match a valid ${operation} operation.`,
    moduleIds: ids,
    suggestedAction: "review_width",
  };
}

function resolveAutomaticTargetOverallWidthMm(
  definition: CabinetDefinition,
  request: CabinetModuleSizingReconciliationRequest
): number {
  if (request.targetOverallWidthMm !== undefined) return request.targetOverallWidthMm;
  if (
    definition.fitState &&
    FIT_WIDTH_MODES.has(definition.fitState.mode)
  ) {
    return definition.fitState.segment.widthMm;
  }
  return getCabinetOverallWidth(definition);
}

function distributionIssues(
  issues: CabinetDistributionIssue[]
): CabinetModuleSizingReconciliationIssue[] {
  return issues.map((issue) => ({ ...issue }));
}

function pruneRemovedModuleParameters(
  original: CabinetDefinition,
  candidate: CabinetDefinition
): CabinetDefinition {
  const candidateIds = new Set(candidate.modules.map((module) => module.id));
  const removedPrefixes = original.modules
    .filter((module) => !candidateIds.has(module.id))
    .map((module) => `modules.${module.id}.`);
  if (!removedPrefixes.length) return candidate;

  const automation = getCabinetAutomationState(candidate);
  return {
    ...candidate,
    automation: {
      ...automation,
      parameters: Object.fromEntries(
        Object.entries(automation.parameters).filter(
          ([path]) => !removedPrefixes.some((prefix) => path.startsWith(prefix))
        )
      ),
    },
  };
}

function validateCandidate(
  original: CabinetDefinition,
  candidate: CabinetDefinition,
  request: CabinetModuleSizingReconciliationRequest,
  mode: CabinetModuleSizingMode,
  targetOverallWidthMm: number,
  adjustments: CabinetWidthAdjustment[],
  replacedUserOverrides: boolean,
  explanation: string
): CabinetModuleSizingReconciliationResult {
  const validation = validateCabinetDefinition(candidate);
  const validationErrors = validation.issues.filter((issue) => issue.severity === "error");
  if (validationErrors.length) {
    return failure(
      original,
      request,
      mode,
      targetOverallWidthMm,
      [{
        code: "candidate_validation_failed",
        message: `The requested change would leave ${validationErrors.length} blocking validation ${validationErrors.length === 1 ? "issue" : "issues"}. The original layout was preserved.`,
        moduleIds: [...new Set(validationErrors.flatMap((issue) => issue.target.moduleIds ?? []))],
        suggestedAction: "review_width",
        validationIssueCodes: validationErrors.map((issue) => issue.code),
      }],
      validationErrors
    );
  }

  const currentOverallWidthMm = getCabinetOverallWidth(candidate);
  return {
    ok: true,
    definition: candidate,
    operation: request.operation,
    mode,
    targetOverallWidthMm,
    preservedOverallWidth: Math.abs(currentOverallWidthMm - targetOverallWidthMm) <= 0.5,
    replacedUserOverrides,
    adjustments,
    issues: [],
    validationIssues: [],
    explanation,
  };
}

function reconcileAutomatic(
  definition: CabinetDefinition,
  candidateModules: readonly CabinetModuleDefinition[],
  request: CabinetModuleSizingReconciliationRequest,
  replacedUserOverrides: boolean
): CabinetModuleSizingReconciliationResult {
  const targetOverallWidthMm = resolveAutomaticTargetOverallWidthMm(definition, request);
  if (!Number.isFinite(targetOverallWidthMm) || targetOverallWidthMm <= 0) {
    return failure(definition, request, "automatic", targetOverallWidthMm, [{
      code: "invalid_target_width",
      message: "Automatic module sizing needs a positive overall target width.",
      moduleIds: [],
      suggestedAction: "review_width",
    }]);
  }

  const previousOverallWidthMm = getCabinetOverallWidth(definition);
  if (
    isCabinetOverallWidthLocked(definition) &&
    Math.abs(previousOverallWidthMm - targetOverallWidthMm) > 0.5
  ) {
    return failure(definition, request, "automatic", targetOverallWidthMm, [{
      code: "overall_width_locked",
      message: `Overall width is locked at ${Math.round(previousOverallWidthMm)} mm, so it cannot use the ${Math.round(targetOverallWidthMm)} mm automatic target.`,
      moduleIds: [],
      suggestedAction: "unlock_modules",
    }]);
  }

  const candidate = pruneRemovedModuleParameters(
    definition,
    setCabinetAutomationMode(
      { ...definition, modules: [...candidateModules] },
      { moduleSizingMode: "automatic" }
    )
  );
  const fixedWidthMm = getCabinetOverallWidth(candidate) - getCabinetModuleRunWidth(candidate);
  const distribution = distributeCabinetModuleWidths(
    candidate,
    targetOverallWidthMm - fixedWidthMm,
    { source: "automatic" }
  );
  if (!distribution.ok) {
    return failure(
      definition,
      request,
      "automatic",
      targetOverallWidthMm,
      distributionIssues(distribution.issues)
    );
  }

  const marked = syncCabinetDefinitionDimensions(
    setCabinetParameterState(distribution.definition, "overall.width", {
      source: "automatic",
    })
  );
  const adjustedCount = distribution.adjustments.length;
  const unlockedCount = marked.modules.filter(
    (module) => !isCabinetModuleWidthLocked(marked, module.id)
  ).length;
  const explanation =
    request.operation === "set_mode"
      ? `Automatic sizing is active at ${Math.round(targetOverallWidthMm)} mm. ${unlockedCount} unlocked ${unlockedCount === 1 ? "module is" : "modules are"} available for future redistribution${replacedUserOverrides ? "; manual width provenance was replaced" : ""}.`
      : `Preserved the ${Math.round(targetOverallWidthMm)} mm overall target and automatically reconciled ${unlockedCount} unlocked ${unlockedCount === 1 ? "module" : "modules"}${adjustedCount ? ` with ${adjustedCount} width ${adjustedCount === 1 ? "adjustment" : "adjustments"}` : ""}.`;

  return validateCandidate(
    definition,
    marked,
    request,
    "automatic",
    targetOverallWidthMm,
    distribution.adjustments,
    replacedUserOverrides,
    explanation
  );
}

function reconcileManualChange(
  definition: CabinetDefinition,
  request: Extract<CabinetModuleSizingReconciliationRequest, { operation: CabinetModuleChangeOperation }>
): CabinetModuleSizingReconciliationResult {
  const targetOverallWidthMm = getCabinetOverallWidth(definition);
  const previousById = new Map(definition.modules.map((module) => [module.id, module]));
  const lockedChanges = request.modules.filter((module) => {
    const previous = previousById.get(module.id);
    return Boolean(
      previous &&
      isCabinetModuleWidthLocked(definition, module.id) &&
      Math.abs(previous.width - module.width) > 0.5
    );
  });
  if (lockedChanges.length) {
    return failure(definition, request, "manual", targetOverallWidthMm, [{
      code: "locked_module_width_changed",
      message: "One or more locked module widths were changed by the proposed manual operation.",
      moduleIds: lockedChanges.map((module) => module.id),
      suggestedAction: "unlock_modules",
    }]);
  }

  const outOfRangeModules = request.modules.filter((module) => {
    const minimumMm = getCabinetMinimumModuleWidthMm(module, {
      ...definition,
      modules: [...request.modules],
    });
    return !Number.isFinite(module.width) ||
      module.width < minimumMm ||
      module.width > CABINET_MAX_MODULE_WIDTH_MM;
  });
  if (outOfRangeModules.length) {
    return failure(definition, request, "manual", targetOverallWidthMm, [{
      code: "manual_module_width_out_of_range",
      message: "Manual module widths must remain within their specialty-aware fabrication limits.",
      moduleIds: outOfRangeModules.map((module) => module.id),
      suggestedAction: "review_width",
    }]);
  }

  if (getCabinetAutomationState(definition).equalModuleSizing) {
    const widths = request.modules.map((module) => module.width);
    if (Math.max(...widths) - Math.min(...widths) > 1) {
      return failure(definition, request, "manual", targetOverallWidthMm, [{
        code: "manual_equal_widths_conflict",
        message: "The equal-width group lock does not allow this manual module arrangement.",
        moduleIds: request.modules.map((module) => module.id),
        suggestedAction: "unlock_modules",
      }]);
    }
  }

  let candidate = pruneRemovedModuleParameters(
    definition,
    setCabinetAutomationMode(
      { ...definition, modules: [...request.modules] },
      { moduleSizingMode: "manual" }
    )
  );
  const candidateOverallWidthMm = getCabinetOverallWidth(candidate);
  if (
    isCabinetOverallWidthLocked(definition) &&
    Math.abs(candidateOverallWidthMm - targetOverallWidthMm) > 0.5
  ) {
    return failure(definition, request, "manual", targetOverallWidthMm, [{
      code: "overall_width_locked",
      message: `Overall width is locked at ${Math.round(targetOverallWidthMm)} mm. The proposed manual module widths total ${Math.round(candidateOverallWidthMm)} mm including fitting components.`,
      moduleIds: [],
      suggestedAction: "unlock_modules",
    }]);
  }

  const source = request.source ?? "user_overridden";
  request.modules.forEach((module) => {
    const previous = previousById.get(module.id);
    if (!previous || Math.abs(previous.width - module.width) > 0.5) {
      candidate = setCabinetParameterState(
        candidate,
        cabinetModuleWidthParameterPath(module.id),
        { source }
      );
    }
  });
  candidate = setCabinetParameterState(candidate, "overall.width", {
    source: "automatic",
  });
  candidate = syncCabinetDefinitionDimensions(candidate);

  const derivedOverallWidthMm = getCabinetOverallWidth(candidate);
  return validateCandidate(
    definition,
    candidate,
    request,
    "manual",
    derivedOverallWidthMm,
    [],
    false,
    `Preserved every entered module width and derived a ${Math.round(derivedOverallWidthMm)} mm overall width including fillers, end panels, and worktop overhangs.`
  );
}

/**
 * Reconciles module-list mutations and automatic/manual transitions at one
 * transactional engine boundary. Callers own history/undo and should only
 * commit `result.definition` when `result.ok` is true.
 */
export function reconcileCabinetModuleSizing(
  definition: CabinetDefinition,
  request: CabinetModuleSizingReconciliationRequest
): CabinetModuleSizingReconciliationResult {
  const currentMode = getCabinetAutomationState(definition).moduleSizingMode;

  if (request.operation === "set_mode") {
    if (request.mode === "manual") {
      const candidate = syncCabinetDefinitionDimensions(
        setCabinetAutomationMode(definition, { moduleSizingMode: "manual" })
      );
      return validateCandidate(
        definition,
        candidate,
        request,
        "manual",
        getCabinetOverallWidth(candidate),
        [],
        false,
        currentMode === "manual"
          ? "Manual module sizing is already active."
          : "Manual module sizing is active. The generated widths were preserved as editable starting values."
      );
    }

    const replacedUserOverrides = definition.modules.some(
      (module) =>
        !isCabinetModuleWidthLocked(definition, module.id) &&
        getCabinetParameterState(
          definition,
          cabinetModuleWidthParameterPath(module.id)
        ).source === "user_overridden"
    );
    return reconcileAutomatic(
      definition,
      definition.modules,
      request,
      replacedUserOverrides
    );
  }

  const shapeIssue = validateModuleChangeShape(
    definition,
    request.operation,
    request.modules
  );
  if (shapeIssue) {
    return failure(
      definition,
      request,
      currentMode,
      getCabinetOverallWidth(definition),
      [shapeIssue]
    );
  }

  return currentMode === "automatic"
    ? reconcileAutomatic(definition, request.modules, request, false)
    : reconcileManualChange(definition, request);
}
