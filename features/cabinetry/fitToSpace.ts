import {
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetOverallWidthLocked,
  resizeCabinetToOverallWidth,
  setCabinetOverallWidthLocked,
  setCabinetParameterState,
  syncCabinetDefinitionDimensions,
  type CabinetDistributionIssue,
  type CabinetWidthAdjustment,
} from "./automation";
import {
  getCabinetModuleRunHeight,
  getCabinetModuleRunWidth,
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "./layout";
import {
  chooseCabinetFitSegment,
  getCabinetAvailableSegments,
} from "./fitSegments";
import { resolveCabinetTemplateHostCompatibility } from "./hostCompatibility";
import { validateCabinetDefinition } from "./validation";
import { getCabinetMinimumModuleWidthMm } from "./moduleWidthRules";
import type {
  CabinetDefinition,
  CabinetFitAlignment,
  CabinetFitMode,
  CabinetFitSegment,
  CabinetHostOpening,
  CabinetHostSpace,
  CabinetRoomType,
} from "./types";
import type { CabinetTemplateHost } from "./presets";

export type CabinetFitIssueCode =
  | "invalid_space"
  | "incompatible_host"
  | "no_available_segment"
  | "space_too_short"
  | "space_too_shallow"
  | "locked_layout_cannot_fit"
  | "dependent_constraints_cannot_fit"
  | "opening_needs_review"
  | "baseboard_offset_applied";

export interface CabinetFitIssue {
  code: CabinetFitIssueCode;
  severity: "error" | "warning" | "info";
  message: string;
  suggestedAction?: "choose_another_space" | "unlock_modules" | "unlock_overall_width" | "reduce_height" | "reduce_depth" | "review_opening";
  moduleIds?: string[];
}

export interface CabinetFitAdjustment {
  field: string;
  previousValue: number;
  nextValue: number;
  reason: string;
}

export interface CabinetFitResult {
  ok: boolean;
  definition: CabinetDefinition;
  segment: CabinetFitSegment | null;
  issues: CabinetFitIssue[];
  adjustments: CabinetFitAdjustment[];
  moduleAdjustments: CabinetWidthAdjustment[];
}

export interface CabinetFitOptions {
  mode?: CabinetFitMode;
  alignment?: CabinetFitAlignment;
  automaticFillerWidthMm?: number;
  snapIncrementMm?: number;
  requiredHostType?: CabinetTemplateHost;
}

export interface CabinetRoomWallOpeningInput extends CabinetHostOpening {
  wall: "north" | "south" | "east" | "west";
}

export interface CabinetPolygonWallOpeningInput extends CabinetHostOpening {
  wallId: string;
}

export interface CabinetRoomPolygonPointInput {
  x: number;
  z: number;
}

/**
 * Maps the legacy/cardinal room-opening model onto polygon wall IDs only when
 * the relationship is unambiguous. Cardinal openings are measured from the
 * room-local origin, while polygon Fit openings are measured from the wall
 * segment midpoint in that segment's tangent direction.
 *
 * Openings on sloped walls or interior notch edges are intentionally omitted:
 * the persisted opening model does not yet store a polygon wall ID, so
 * assigning either condition would invent site data.
 */
export function mapCabinetCardinalOpeningsToPolygonWalls(input: {
  polygon: readonly CabinetRoomPolygonPointInput[];
  openings: readonly CabinetRoomWallOpeningInput[];
  edgeToleranceMm?: number;
}): CabinetPolygonWallOpeningInput[] {
  const points = input.polygon.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.z)
  );
  if (points.length < 3) return [];

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const toleranceMeters = Math.max(0, input.edgeToleranceMm ?? 5) / 1000;

  return input.openings.flatMap((opening) => {
    if (
      !Number.isFinite(opening.offsetMm) ||
      !Number.isFinite(opening.widthMm) ||
      opening.widthMm <= 0
    ) {
      return [];
    }

    const openingAxisCenterMeters = opening.offsetMm / 1000;
    const openingHalfWidthMeters = opening.widthMm / 2000;
    const matchingEdge = points
      .map((start, index) => ({
        start,
        end: points[(index + 1) % points.length],
        index,
      }))
      .find(({ start, end }) => {
        const horizontal = Math.abs(start.z - end.z) <= toleranceMeters;
        const vertical = Math.abs(start.x - end.x) <= toleranceMeters;
        const onCardinalBoundary =
          opening.wall === "north"
            ? horizontal && Math.abs((start.z + end.z) / 2 - minZ) <= toleranceMeters
            : opening.wall === "south"
              ? horizontal && Math.abs((start.z + end.z) / 2 - maxZ) <= toleranceMeters
              : opening.wall === "west"
                ? vertical && Math.abs((start.x + end.x) / 2 - minX) <= toleranceMeters
                : vertical && Math.abs((start.x + end.x) / 2 - maxX) <= toleranceMeters;
        if (!onCardinalBoundary) return false;

        const startAxis = horizontal ? start.x : start.z;
        const endAxis = horizontal ? end.x : end.z;
        const edgeStart = Math.min(startAxis, endAxis);
        const edgeEnd = Math.max(startAxis, endAxis);
        return (
          openingAxisCenterMeters - openingHalfWidthMeters >= edgeStart - toleranceMeters &&
          openingAxisCenterMeters + openingHalfWidthMeters <= edgeEnd + toleranceMeters
        );
      });

    if (!matchingEdge) return [];
    const { start, end, index } = matchingEdge;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const lengthMeters = Math.hypot(deltaX, deltaZ);
    if (lengthMeters <= 0.001) return [];
    const tangentX = deltaX / lengthMeters;
    const tangentZ = deltaZ / lengthMeters;
    const midpointX = (start.x + end.x) / 2;
    const midpointZ = (start.z + end.z) / 2;
    const openingCenterX =
      opening.wall === "north" || opening.wall === "south"
        ? openingAxisCenterMeters
        : (start.x + end.x) / 2;
    const openingCenterZ =
      opening.wall === "east" || opening.wall === "west"
        ? openingAxisCenterMeters
        : (start.z + end.z) / 2;
    const offsetMm =
      ((openingCenterX - midpointX) * tangentX +
        (openingCenterZ - midpointZ) * tangentZ) *
      1000;
    const { wall: _wall, ...polygonOpening } = opening;
    return [{
      ...polygonOpening,
      wallId: `wall-${index}`,
      offsetMm: Number(offsetMm.toFixed(3)),
    }];
  });
}

export function createCabinetRoomWallSpaces(input: {
  roomId: string;
  roomName: string;
  roomType?: CabinetRoomType;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  openings?: CabinetRoomWallOpeningInput[];
  baseboardOffsetMm?: number;
  installationClearanceSideMm?: number;
  installationClearanceTopMm?: number;
}): CabinetHostSpace[] {
  const openings = input.openings ?? [];
  const installationClearanceSideMm = input.installationClearanceSideMm ?? 10;
  const installationClearanceTopMm = input.installationClearanceTopMm ?? 20;
  return (["north", "east", "south", "west"] as const).map((wall) => ({
    id: `${input.roomId}:${wall}`,
    kind: "wall" as const,
    label: `${wall[0].toUpperCase()}${wall.slice(1)} wall`,
    roomId: input.roomId,
    roomName: input.roomName,
    roomType: input.roomType,
    wallId: wall,
    wall,
    availableWidthMm:
      wall === "north" || wall === "south" ? input.widthMm : input.depthMm,
    availableHeightMm: input.heightMm,
    baseboardOffsetMm: input.baseboardOffsetMm ?? 0,
    installationClearanceLeftMm: installationClearanceSideMm,
    installationClearanceRightMm: installationClearanceSideMm,
    installationClearanceTopMm,
    openings: openings
      .filter((opening) => opening.wall === wall)
      .map(({ wall: _wall, ...opening }) => opening),
  }));
}

/**
 * Creates Fit-to-Space hosts from actual room-local polygon edges. Polygon
 * coordinates use metres, matching the house-plan model; persisted host
 * geometry uses millimetres with a normalized inward vector.
 */
export function createCabinetPolygonWallSpaces(input: {
  roomId: string;
  roomName: string;
  roomType?: CabinetRoomType;
  polygon: readonly CabinetRoomPolygonPointInput[];
  heightMm: number;
  openings?: readonly CabinetPolygonWallOpeningInput[];
  baseboardOffsetMm?: number;
  installationClearanceSideMm?: number;
  installationClearanceTopMm?: number;
}): CabinetHostSpace[] {
  const points = input.polygon.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.z)
  );
  if (points.length < 3) return [];

  const signedTwiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  if (Math.abs(signedTwiceArea) < 0.000001) return [];
  const isCounterClockwise = signedTwiceArea > 0;
  const openings = input.openings ?? [];
  const installationClearanceSideMm = input.installationClearanceSideMm ?? 10;
  const installationClearanceTopMm = input.installationClearanceTopMm ?? 20;

  return points.flatMap((start, index) => {
    const end = points[(index + 1) % points.length];
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const lengthMeters = Math.hypot(deltaX, deltaZ);
    if (!Number.isFinite(lengthMeters) || lengthMeters <= 0.001) return [];
    const tangentX = deltaX / lengthMeters;
    const tangentZ = deltaZ / lengthMeters;
    const inwardNormalX = isCounterClockwise ? -tangentZ : tangentZ;
    const inwardNormalZ = isCounterClockwise ? tangentX : -tangentX;
    // House-plan surface selection uses zero-based deterministic wall IDs.
    const wallId = `wall-${index}`;
    return [{
      id: `${input.roomId}:${wallId}`,
      kind: "wall" as const,
      label: `Wall ${index + 1}`,
      roomId: input.roomId,
      roomName: input.roomName,
      roomType: input.roomType,
      wallId,
      wallSegment: {
        startXmm: start.x * 1000,
        startZmm: start.z * 1000,
        endXmm: end.x * 1000,
        endZmm: end.z * 1000,
        inwardNormalX,
        inwardNormalZ,
      },
      availableWidthMm: lengthMeters * 1000,
      availableHeightMm: input.heightMm,
      baseboardOffsetMm: input.baseboardOffsetMm ?? 0,
      installationClearanceLeftMm: installationClearanceSideMm,
      installationClearanceRightMm: installationClearanceSideMm,
      installationClearanceTopMm,
      openings: openings
        .filter((opening) => opening.wallId === wallId)
        .map(({ wallId: _wallId, ...opening }) => opening),
    }];
  });
}

export { chooseCabinetFitSegment, getCabinetAvailableSegments } from "./fitSegments";

function mapDistributionIssue(issue: CabinetDistributionIssue): CabinetFitIssue {
  return {
    code: "locked_layout_cannot_fit",
    severity: "error",
    message: issue.message,
    suggestedAction:
      issue.code === "overall_width_locked"
        ? "unlock_overall_width"
        : issue.suggestedAction === "unlock_modules" || issue.suggestedAction === "reduce_locked_widths"
        ? "unlock_modules"
        : "choose_another_space",
    moduleIds: issue.moduleIds,
  };
}

function resizeCabinetToOverallHeight(
  definition: CabinetDefinition,
  targetOverallHeightMm: number
): CabinetDefinition {
  const currentRunHeightMm = getCabinetModuleRunHeight(definition);
  const fixedHeightMm = getCabinetOverallHeight(definition) - currentRunHeightMm;
  const targetRunHeightMm = Math.max(200, Math.round(targetOverallHeightMm - fixedHeightMm));
  const scale = currentRunHeightMm > 0 ? targetRunHeightMm / currentRunHeightMm : 1;
  const tallestIndex = definition.modules.findIndex((module) => module.height === currentRunHeightMm);
  let next: CabinetDefinition = {
    ...definition,
    modules: definition.modules.map((module, index) => ({
      ...module,
      height:
        index === tallestIndex
          ? targetRunHeightMm
          : Math.max(200, Math.round(module.height * scale)),
    })),
  };
  next = setCabinetParameterState(next, "overall.height", { source: "automatic" });
  return syncCabinetDefinitionDimensions(next);
}

function adaptCabinetHeightDependencies(
  previous: CabinetDefinition,
  resized: CabinetDefinition
): { definition: CabinetDefinition; adjustments: CabinetFitAdjustment[] } {
  const previousById = new Map(previous.modules.map((module) => [module.id, module]));
  const previousOverallHeightMm = Math.max(1, getCabinetOverallHeight(previous));
  const resizedOverallHeightMm = Math.max(1, getCabinetOverallHeight(resized));
  const overallScale = resizedOverallHeightMm / previousOverallHeightMm;
  const adjustments: CabinetFitAdjustment[] = [];
  const changedPaths: string[] = [];
  const moduleScaledFields = [
    "antiTipAnchorHeight",
    "convertiblePanelHeight",
    "convertibleHingeHeight",
    "stemwareRackMountHeight",
    "libraryLadderRailHeight",
    "fireplaceOpeningHeight",
    "fireplaceHeaderHeight",
    "fireplaceMantelHeight",
  ] as const;
  const overallScaledFields = [
    "mudroomHookRailHeight",
    "mediaTvOpeningHeight",
    "mediaTvMountHeight",
    "mediaCableChaseHeight",
    "trimSetoutHeight",
    "stairScribeHighHeight",
    "stairScribeLowHeight",
  ] as const;

  const modules = resized.modules.map((module) => {
    const previousModule = previousById.get(module.id);
    if (!previousModule) return module;
    const moduleScale = module.height / Math.max(1, previousModule.height);
    let nextModule = { ...module };

    const scaleField = (
      field: (typeof moduleScaledFields)[number] | (typeof overallScaledFields)[number],
      scale: number
    ) => {
      const previousValue = previousModule[field];
      if (typeof previousValue !== "number") return;
      const path = `modules.${module.id}.${field}`;
      const state = getCabinetParameterState(previous, path);
      if (state.locked || state.source === "user_overridden") return;
      let nextValue = Math.max(1, Math.round(previousValue * scale));
      if (field === "antiTipAnchorHeight") {
        nextValue = Math.min(nextValue, Math.max(32, module.height - 32));
      } else if (field === "convertiblePanelHeight") {
        nextValue = Math.min(nextValue, module.height);
      } else if (field === "convertibleHingeHeight") {
        nextValue = Math.min(nextValue, Math.max(1, module.height - 1));
      } else if (field === "libraryLadderRailHeight") {
        nextValue = Math.min(nextValue, Math.max(1, module.height - 1));
      }
      if (nextValue === previousValue) return;
      nextModule = { ...nextModule, [field]: nextValue };
      changedPaths.push(path);
      adjustments.push({
        field: path,
        previousValue,
        nextValue,
        reason: "Kept a dependent installation height proportional to the fitted assembly",
      });
    };

    moduleScaledFields.forEach((field) => scaleField(field, moduleScale));
    overallScaledFields.forEach((field) => scaleField(field, overallScale));

    const lowPath = `modules.${module.id}.stairScribeLowHeight`;
    const highPath = `modules.${module.id}.stairScribeHighHeight`;
    const lowState = getCabinetParameterState(previous, lowPath);
    const highState = getCabinetParameterState(previous, highPath);
    if (
      typeof nextModule.stairScribeLowHeight === "number" &&
      !lowState.locked &&
      lowState.source !== "user_overridden"
    ) {
      nextModule.stairScribeLowHeight = Math.min(
        resizedOverallHeightMm,
        Math.max(module.height, nextModule.stairScribeLowHeight)
      );
    }
    if (
      typeof nextModule.stairScribeHighHeight === "number" &&
      !highState.locked &&
      highState.source !== "user_overridden"
    ) {
      nextModule.stairScribeHighHeight = Math.min(
        resizedOverallHeightMm,
        Math.max(
          nextModule.stairScribeLowHeight ?? module.height,
          nextModule.stairScribeHighHeight
        )
      );
    }
    return nextModule;
  });

  let definition = syncCabinetDefinitionDimensions({ ...resized, modules });
  changedPaths.forEach((path) => {
    definition = setCabinetParameterState(definition, path, { source: "automatic" });
  });
  return { definition, adjustments };
}

function addAutomaticFitModules(
  definition: CabinetDefinition,
  targetOverallWidthMm: number
): { definition: CabinetDefinition; addedCount: number } {
  const automation = getCabinetAutomationState(definition);
  if (automation.moduleSizingMode !== "automatic") return { definition, addedCount: 0 };
  if (
    definition.modules.some(
      (module) => (module.millworkComponentType ?? "cabinet") !== "cabinet"
    )
  ) {
    return { definition, addedCount: 0 };
  }

  const fixedWidthMm = getCabinetOverallWidth(definition) - getCabinetModuleRunWidth(definition);
  const targetModuleRunWidthMm = Math.max(0, targetOverallWidthMm - fixedWidthMm);
  const preferredMaximumWidthMm = 1200;
  const requiredModuleCount = Math.min(
    12,
    Math.max(definition.modules.length, Math.ceil(targetModuleRunWidthMm / preferredMaximumWidthMm))
  );
  const addedCount = requiredModuleCount - definition.modules.length;
  if (addedCount <= 0) return { definition, addedCount: 0 };

  const sourceModule =
    [...definition.modules].reverse().find(
      (module) => !getCabinetAutomationState(definition).parameters[`modules.${module.id}.width`]?.locked
    ) ?? definition.modules[definition.modules.length - 1];
  if (!sourceModule) return { definition, addedCount: 0 };

  const existingIds = new Set(definition.modules.map((module) => module.id));
  const addedModules = Array.from({ length: addedCount }, (_, index) => {
    let suffix = definition.modules.length + index + 1;
    let id = `module-fit-${suffix}`;
    while (existingIds.has(id)) {
      suffix += 1;
      id = `module-fit-${suffix}`;
    }
    existingIds.add(id);
    return { ...sourceModule, id };
  });
  return {
    definition: {
      ...definition,
      modules: [...definition.modules, ...addedModules],
    },
    addedCount,
  };
}

export function fitCabinetToSpace(
  definition: CabinetDefinition,
  space: CabinetHostSpace,
  options: CabinetFitOptions = {}
): CabinetFitResult {
  const mode = options.mode ?? "fit_both";
  const alignment = options.alignment ?? "center";
  const issues: CabinetFitIssue[] = [];
  const adjustments: CabinetFitAdjustment[] = [];
  const automaticFillerWidthMm = Math.max(0, options.automaticFillerWidthMm ?? 20);

  if (options.requiredHostType) {
    const compatibility = resolveCabinetTemplateHostCompatibility(
      options.requiredHostType,
      space
    );
    if (compatibility.status === "incompatible") {
      return {
        ok: false,
        definition,
        segment: null,
        adjustments,
        moduleAdjustments: [],
        issues: [{
          code: "incompatible_host",
          severity: "error",
          message: compatibility.message,
          suggestedAction: "choose_another_space",
        }],
      };
    }
    if (compatibility.status === "review_required") {
      issues.push({
        code: "incompatible_host",
        severity: "warning",
        message: compatibility.message,
        suggestedAction: "choose_another_space",
      });
    }
  }

  if (
    !Number.isFinite(space.availableWidthMm) ||
    !Number.isFinite(space.availableHeightMm) ||
    space.availableWidthMm <= 0 ||
    space.availableHeightMm <= 0
  ) {
    return {
      ok: false,
      definition,
      segment: null,
      adjustments,
      moduleAdjustments: [],
      issues: [{
        code: "invalid_space",
        severity: "error",
        message: "This space does not have valid width and height measurements yet.",
        suggestedAction: "choose_another_space",
      }],
    };
  }

  const topClearanceMm = Math.max(0, space.installationClearanceTopMm ?? 0);
  const mountingHeightMm = Math.max(0, space.mountingHeightMm ?? 0);
  const usableHeightMm = Math.max(
    0,
    space.availableHeightMm - topClearanceMm - mountingHeightMm
  );
  const fittedAssemblyHeightMm =
    mode === "fit_height" || mode === "fit_both"
      ? usableHeightMm
      : getCabinetOverallHeight(definition);
  const segments = getCabinetAvailableSegments(
    space,
    fittedAssemblyHeightMm,
    mountingHeightMm
  );
  const segment = chooseCabinetFitSegment(segments, alignment);
  if (!segment) {
    return {
      ok: false,
      definition,
      segment: null,
      adjustments,
      moduleAdjustments: [],
      issues: [{
        code: "no_available_segment",
        severity: "error",
        message: "Doors, windows, or installation clearances leave no usable wall segment for this assembly.",
        suggestedAction: "choose_another_space",
      }],
    };
  }

  const fitsWidth =
    mode === "fit_width" ||
    mode === "fit_both" ||
    mode === "between_boundaries";
  const originalOverallWidthLocked = isCabinetOverallWidthLocked(definition);
  const originalOverallWidthMm = getCabinetOverallWidth(definition);
  if (
    fitsWidth &&
    originalOverallWidthLocked &&
    Math.abs(originalOverallWidthMm - segment.widthMm) > 0.5
  ) {
    return {
      ok: false,
      definition,
      segment,
      adjustments: [],
      moduleAdjustments: [],
      issues: [{
        code: "locked_layout_cannot_fit",
        severity: "error",
        message: `Overall width is locked at ${Math.round(originalOverallWidthMm)} mm, but this space provides ${Math.round(segment.widthMm)} mm. Unlock overall width before fitting to this space.`,
        suggestedAction: "unlock_overall_width",
      }],
    };
  }

  let nextDefinition = definition;
  const automation = getCabinetAutomationState(nextDefinition);
  if (automation.fillerSizingMode === "automatic" && (mode === "fit_width" || mode === "fit_both" || mode === "between_boundaries")) {
    const previousLeft = nextDefinition.leftFillerWidth ?? 0;
    const previousRight = nextDefinition.rightFillerWidth ?? 0;
    const canAutoAdjust = (path: string) => {
      const state = getCabinetParameterState(nextDefinition, path);
      return !state.locked && state.source !== "user_overridden";
    };
    const canAutoLeft = canAutoAdjust("leftFillerWidth");
    const canAutoRight = canAutoAdjust("rightFillerWidth");
    const canAutoLeftScribe = canAutoAdjust("leftFillerScribeAllowance");
    const canAutoRightScribe = canAutoAdjust("rightFillerScribeAllowance");
    nextDefinition = {
      ...nextDefinition,
      leftFillerWidth: canAutoLeft ? automaticFillerWidthMm : nextDefinition.leftFillerWidth,
      rightFillerWidth: canAutoRight ? automaticFillerWidthMm : nextDefinition.rightFillerWidth,
      leftFillerScribeAllowance: canAutoLeftScribe
        ? Math.min(5, automaticFillerWidthMm)
        : nextDefinition.leftFillerScribeAllowance,
      rightFillerScribeAllowance: canAutoRightScribe
        ? Math.min(5, automaticFillerWidthMm)
        : nextDefinition.rightFillerScribeAllowance,
    };
    if (canAutoLeft) {
      nextDefinition = setCabinetParameterState(nextDefinition, "leftFillerWidth", { source: "automatic" });
    }
    if (canAutoRight) {
      nextDefinition = setCabinetParameterState(nextDefinition, "rightFillerWidth", { source: "automatic" });
    }
    if (canAutoLeftScribe) {
      nextDefinition = setCabinetParameterState(nextDefinition, "leftFillerScribeAllowance", { source: "automatic" });
    }
    if (canAutoRightScribe) {
      nextDefinition = setCabinetParameterState(nextDefinition, "rightFillerScribeAllowance", { source: "automatic" });
    }
    if (canAutoLeft && previousLeft !== automaticFillerWidthMm) {
      adjustments.push({ field: "leftFillerWidth", previousValue: previousLeft, nextValue: automaticFillerWidthMm, reason: "Automatic wall fitting panel" });
    }
    if (canAutoRight && previousRight !== automaticFillerWidthMm) {
      adjustments.push({ field: "rightFillerWidth", previousValue: previousRight, nextValue: automaticFillerWidthMm, reason: "Automatic wall fitting panel" });
    }
  }

  let moduleAdjustments: CabinetWidthAdjustment[] = [];
  if (fitsWidth) {
    const automaticModules = addAutomaticFitModules(nextDefinition, Math.round(segment.widthMm));
    nextDefinition = automaticModules.definition;
    if (automaticModules.addedCount > 0) {
      adjustments.push({
        field: "modules.length",
        previousValue: definition.modules.length,
        nextValue: nextDefinition.modules.length,
        reason: "Added modules to keep fitted bays within sensible widths",
      });
    }
    const distributionSource = originalOverallWidthLocked
      ? setCabinetOverallWidthLocked(nextDefinition, false)
      : nextDefinition;
    const widthResult = resizeCabinetToOverallWidth(distributionSource, Math.round(segment.widthMm), {
      snapIncrementMm: options.snapIncrementMm ?? 1,
      source: "automatic",
      minimumModuleWidthById: Object.fromEntries(
        nextDefinition.modules.map((module) => [
          module.id,
          getCabinetMinimumModuleWidthMm(module, nextDefinition),
        ])
      ),
    });
    if (!widthResult.ok) {
      return {
        ok: false,
        definition,
        segment,
        adjustments: [],
        moduleAdjustments: [],
        issues: widthResult.issues.map(mapDistributionIssue),
      };
    }
    nextDefinition = originalOverallWidthLocked
      ? setCabinetOverallWidthLocked(widthResult.definition, true)
      : widthResult.definition;
    moduleAdjustments = widthResult.adjustments;
  }

  if (mode === "fit_height" || mode === "fit_both") {
    if (usableHeightMm < 200) {
      return {
        ok: false,
        definition,
        segment,
        adjustments: [],
        moduleAdjustments: [],
        issues: [{
          code: "space_too_short",
          severity: "error",
          message: `Only ${Math.round(usableHeightMm)} mm of usable height remains after installation clearance.`,
          suggestedAction: "choose_another_space",
        }],
      };
    }
    const previousHeightMm = getCabinetOverallHeight(nextDefinition);
    const beforeHeightFit = nextDefinition;
    nextDefinition = resizeCabinetToOverallHeight(nextDefinition, usableHeightMm);
    const adaptedDependencies = adaptCabinetHeightDependencies(
      beforeHeightFit,
      nextDefinition
    );
    nextDefinition = adaptedDependencies.definition;
    adjustments.push(...adaptedDependencies.adjustments);
    const nextHeightMm = getCabinetOverallHeight(nextDefinition);
    if (previousHeightMm !== nextHeightMm) {
      adjustments.push({ field: "overall.height", previousValue: previousHeightMm, nextValue: nextHeightMm, reason: "Fit below ceiling clearance" });
    }
  }

  if (space.availableDepthMm && getCabinetOverallDepth(nextDefinition) > space.availableDepthMm) {
    issues.push({
      code: "space_too_shallow",
      severity: "warning",
      message: `The assembly is ${Math.round(getCabinetOverallDepth(nextDefinition) - space.availableDepthMm)} mm deeper than the recorded space. Review projection and circulation.`,
      suggestedAction: "reduce_depth",
    });
  }

  const softOpenings = space.openings.filter((opening) => opening.kind === "outlet");
  if (softOpenings.length) {
    issues.push({
      code: "opening_needs_review",
      severity: "warning",
      message: `${softOpenings.length} outlet ${softOpenings.length === 1 ? "location needs" : "locations need"} access or service cutout review.`,
      suggestedAction: "review_opening",
    });
  }
  if ((space.baseboardOffsetMm ?? 0) > 0) {
    issues.push({
      code: "baseboard_offset_applied",
      severity: "info",
      message: `Placement will stand ${space.baseboardOffsetMm} mm off the wall to clear the recorded baseboard.`,
    });
  }

  nextDefinition = syncCabinetDefinitionDimensions({
    ...nextDefinition,
    fitState: {
      host: space,
      mode,
      alignment,
      segment,
      appliedAt: new Date().toISOString(),
    },
  });

  const blockingCandidateIssues = validateCabinetDefinition(nextDefinition).issues.filter(
    (issue) => issue.severity === "error"
  );
  if (blockingCandidateIssues.length > 0) {
    return {
      ok: false,
      definition,
      segment,
      adjustments: [],
      moduleAdjustments: [],
      issues: blockingCandidateIssues.slice(0, 6).map((issue) => ({
        code: "dependent_constraints_cannot_fit" as const,
        severity: "error" as const,
        message: `${issue.title}: ${issue.message}`,
        suggestedAction: "choose_another_space" as const,
        moduleIds: issue.target.moduleIds,
      })),
    };
  }

  return {
    ok: true,
    definition: nextDefinition,
    segment,
    issues,
    adjustments,
    moduleAdjustments,
  };
}

export interface CabinetFitPlacement {
  position: [number, number, number];
  rotationY: number;
}

export function getCabinetFitPlacement(
  definition: CabinetDefinition,
  roomWidthMeters: number,
  roomDepthMeters: number
): CabinetFitPlacement | null {
  const fitState = definition.fitState;
  const wall = fitState?.host.wall;
  if (!fitState) return null;
  const offsetMeters = fitState.segment.centerOffsetMm / 1000;
  const wallOffsetMeters = Math.max(0, fitState.host.baseboardOffsetMm ?? 0) / 1000;
  const depthMeters = getCabinetOverallDepth(definition) / 1000;
  const mountingHeightMeters = Math.max(0, fitState.host.mountingHeightMm ?? 0) / 1000;

  const wallSegment = fitState.host.wallSegment;
  if (wallSegment) {
    const startX = wallSegment.startXmm / 1000;
    const startZ = wallSegment.startZmm / 1000;
    const endX = wallSegment.endXmm / 1000;
    const endZ = wallSegment.endZmm / 1000;
    const length = Math.hypot(endX - startX, endZ - startZ);
    const normalLength = Math.hypot(
      wallSegment.inwardNormalX,
      wallSegment.inwardNormalZ
    );
    if (length <= 0.001 || normalLength <= 0.001) return null;
    const tangentX = (endX - startX) / length;
    const tangentZ = (endZ - startZ) / length;
    const normalX = wallSegment.inwardNormalX / normalLength;
    const normalZ = wallSegment.inwardNormalZ / normalLength;
    const midpointX = (startX + endX) / 2;
    const midpointZ = (startZ + endZ) / 2;
    const inwardOffset = depthMeters / 2 + wallOffsetMeters;
    return {
      position: [
        midpointX + tangentX * offsetMeters + normalX * inwardOffset,
        mountingHeightMeters,
        midpointZ + tangentZ * offsetMeters + normalZ * inwardOffset,
      ],
      rotationY: Math.atan2(normalX, normalZ),
    };
  }

  if (!wall) return null;

  if (wall === "north") {
    return { position: [offsetMeters, mountingHeightMeters, -roomDepthMeters / 2 + depthMeters / 2 + wallOffsetMeters], rotationY: 0 };
  }
  if (wall === "south") {
    return { position: [offsetMeters, mountingHeightMeters, roomDepthMeters / 2 - depthMeters / 2 - wallOffsetMeters], rotationY: Math.PI };
  }
  if (wall === "west") {
    return { position: [-roomWidthMeters / 2 + depthMeters / 2 + wallOffsetMeters, mountingHeightMeters, offsetMeters], rotationY: Math.PI / 2 };
  }
  return { position: [roomWidthMeters / 2 - depthMeters / 2 - wallOffsetMeters, mountingHeightMeters, offsetMeters], rotationY: -Math.PI / 2 };
}
