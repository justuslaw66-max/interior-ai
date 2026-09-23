import {
  CABINET_MAX_MODULE_WIDTH_MM,
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
  isCabinetOverallWidthLocked,
  setCabinetParameterState,
} from "../automation";
import {
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
  hasCabinetDrawerBoxes,
} from "../drawerBoxLayout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
  getCabinetDrawerFrontLayouts,
  hasCabinetDrawerSlides,
} from "../drawerSlideLayout";
import {
  getCabinetDrawerHeightMode,
  getCabinetDrawerHeightProportions,
  resizeCabinetDrawerHeightProportions,
} from "../frontBehavior";
import { formatCabinetLabel } from "../formatCabinetLabel";
import { getCabinetMinimumModuleWidthMm } from "../moduleWidthRules";
import {
  CABINET_SHELF_LAYOUT_FIELDS,
  cabinetShelfLayoutParameterPath,
  getCabinetEvenShelfCenterHeights,
  getCabinetShelfSpacingMode,
} from "../shelfLayout";
import type { CabinetDefinition, CabinetModuleDefinition } from "../types";

export type CabinetStudioDefinitionCommandResult =
  | { ok: true; definition: CabinetDefinition }
  | { ok: false; error: string };

export function applyCabinetModulePatchCommand(
  current: CabinetDefinition,
  moduleId: string,
  patch: Partial<CabinetModuleDefinition>
): CabinetStudioDefinitionCommandResult {
  const patchFields = Object.keys(patch) as (keyof CabinetModuleDefinition)[];
  if (typeof patch.width === "number" && isCabinetOverallWidthLocked(current)) {
    return {
      ok: false,
      error: "Overall width is locked. Unlock it before changing an individual bay width.",
    };
  }
  if (
    typeof patch.width === "number" &&
    (isCabinetModuleWidthLocked(current, moduleId) ||
      getCabinetAutomationState(current).equalModuleSizing)
  ) {
    return {
      ok: false,
      error: getCabinetAutomationState(current).equalModuleSizing
        ? "Equal module sizing is locked. Release it before changing one bay width."
        : "This module width is locked. Unlock it before changing the bay width.",
    };
  }
  if (
    patchFields.some((field) =>
      CABINET_SHELF_LAYOUT_FIELDS.includes(
        field as (typeof CABINET_SHELF_LAYOUT_FIELDS)[number]
      )
    ) &&
    getCabinetParameterState(
      current,
      cabinetShelfLayoutParameterPath(moduleId)
    ).locked
  ) {
    return {
      ok: false,
      error: "Shelf layout is locked. Unlock it before changing shelf settings.",
    };
  }
  const lockedField = patchFields.find(
    (field) =>
      getCabinetParameterState(
        current,
        `modules.${moduleId}.${String(field)}`
      ).locked
  );
  if (lockedField) {
    return {
      ok: false,
      error: `${formatCabinetLabel(String(lockedField))} is locked. Unlock it before changing this value.`,
    };
  }

  const currentModule = current.modules.find((module) => module.id === moduleId);
  let safePatch: Partial<CabinetModuleDefinition> =
    typeof patch.width === "number" && currentModule
      ? {
          ...patch,
          width: Math.max(
            getCabinetMinimumModuleWidthMm(currentModule, current),
            Math.min(CABINET_MAX_MODULE_WIDTH_MM, patch.width)
          ),
        }
      : patch;
  if (
    currentModule &&
    typeof patch.shelfCount === "number" &&
    getCabinetShelfSpacingMode(current, currentModule) === "custom"
  ) {
    const nextModule = {
      ...currentModule,
      ...safePatch,
      shelfCount: Math.max(0, Math.round(patch.shelfCount)),
    };
    safePatch = {
      ...safePatch,
      shelfCount: nextModule.shelfCount,
      shelfPositionsMm: getCabinetEvenShelfCenterHeights(current, nextModule),
    };
  }
  if (
    currentModule &&
    typeof patch.drawerCount === "number" &&
    getCabinetDrawerHeightMode(currentModule) === "custom"
  ) {
    const drawerCount = Math.max(0, Math.round(patch.drawerCount));
    safePatch = {
      ...safePatch,
      drawerCount,
      drawerHeightProportions: resizeCabinetDrawerHeightProportions(
        getCabinetDrawerHeightProportions(current, currentModule),
        drawerCount
      ),
    };
  }

  const nextDefinition: CabinetDefinition = {
    ...current,
    modules: current.modules.map((module) => {
      if (module.id !== moduleId) return module;

      const nextModule = { ...module, ...safePatch };
      const drawerFrontCount = getCabinetDrawerFrontLayouts(
        current,
        nextModule
      ).length;

      if (drawerFrontCount === 0 && hasCabinetDrawerSlides(nextModule)) {
        return {
          ...nextModule,
          drawerSlideHardwareEnabled: undefined,
          drawerSlideLength: undefined,
          drawerSlideClearance: undefined,
          drawerBoxEnabled: hasCabinetDrawerBoxes(nextModule)
            ? undefined
            : nextModule.drawerBoxEnabled,
          drawerBoxSideThickness: hasCabinetDrawerBoxes(nextModule)
            ? undefined
            : nextModule.drawerBoxSideThickness,
          drawerBoxBottomThickness: hasCabinetDrawerBoxes(nextModule)
            ? undefined
            : nextModule.drawerBoxBottomThickness,
          drawerBoxHeightClearance: hasCabinetDrawerBoxes(nextModule)
            ? undefined
            : nextModule.drawerBoxHeightClearance,
          drawerBoxBackClearance: hasCabinetDrawerBoxes(nextModule)
            ? undefined
            : nextModule.drawerBoxBackClearance,
        };
      }

      if (drawerFrontCount === 0 && hasCabinetDrawerBoxes(nextModule)) {
        return {
          ...nextModule,
          drawerBoxEnabled: undefined,
          drawerBoxSideThickness: undefined,
          drawerBoxBottomThickness: undefined,
          drawerBoxHeightClearance: undefined,
          drawerBoxBackClearance: undefined,
        };
      }

      if (
        drawerFrontCount > 0 &&
        module.drawerSlideHardwareEnabled !== false &&
        !hasCabinetDrawerSlides(nextModule) &&
        (safePatch.frontType !== undefined || safePatch.drawerCount !== undefined)
      ) {
        return {
          ...nextModule,
          drawerSlideHardwareEnabled: true,
          drawerSlideLength: CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
          drawerSlideClearance: CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
          ...(module.drawerBoxEnabled !== false && !hasCabinetDrawerBoxes(nextModule)
            ? {
                drawerBoxEnabled: true,
                drawerBoxSideThickness:
                  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
                drawerBoxBottomThickness:
                  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
                drawerBoxHeightClearance:
                  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
                drawerBoxBackClearance:
                  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
              }
            : {}),
        };
      }

      if (
        drawerFrontCount > 0 &&
        module.drawerBoxEnabled !== false &&
        !hasCabinetDrawerBoxes(nextModule) &&
        (safePatch.frontType !== undefined || safePatch.drawerCount !== undefined)
      ) {
        return {
          ...nextModule,
          drawerBoxEnabled: true,
          drawerBoxSideThickness: CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
          drawerBoxBottomThickness: CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
          drawerBoxHeightClearance: CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
          drawerBoxBackClearance: CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
        };
      }

      return nextModule;
    }),
  };
  let nextWithProvenance = Object.keys(safePatch).reduce(
    (definition, field) =>
      setCabinetParameterState(definition, `modules.${moduleId}.${field}`, {
        source: "user_overridden",
      }),
    nextDefinition
  );
  if (safePatch.doorLayoutMode === "recommended") {
    nextWithProvenance = setCabinetParameterState(
      nextWithProvenance,
      `modules.${moduleId}.doorCount`,
      { source: "automatic" }
    );
  }
  if (
    safePatch.drawerHeightMode === "equal" ||
    safePatch.drawerHeightMode === "recommended"
  ) {
    nextWithProvenance = setCabinetParameterState(
      nextWithProvenance,
      `modules.${moduleId}.drawerHeightProportions`,
      { source: "automatic" }
    );
  }
  if (safePatch.handlePlacementMode === "automatic") {
    nextWithProvenance = setCabinetParameterState(
      nextWithProvenance,
      `modules.${moduleId}.handleOffsetX`,
      { source: "automatic" }
    );
    nextWithProvenance = setCabinetParameterState(
      nextWithProvenance,
      `modules.${moduleId}.handleOffsetY`,
      { source: "automatic" }
    );
  }
  return { ok: true, definition: nextWithProvenance };
}
