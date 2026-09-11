import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";

export const DEFAULT_DOOR_HEIGHT_MM = 2100;
export const DEFAULT_WINDOW_HEIGHT_MM = 1200;
export const DEFAULT_WINDOW_SILL_MM = 900;
export const DEFAULT_DOOR_WIDTH_MM = 900;
export const DEFAULT_WINDOW_WIDTH_MM = 1200;
export const MIN_EFFECTIVE_OPENING_HEIGHT_MM = 1;

export type OpeningDimensionInputState =
  | "missing"
  | "undefined"
  | "null"
  | "non_finite"
  | "negative"
  | "zero"
  | "positive";

export type EffectiveOpeningDimensions = {
  supported: boolean;
  wallHeightMm: number;
  heightMm: number;
  bottomMm: number;
  topMm: number;
  heightInputState: OpeningDimensionInputState;
  bottomInputState: OpeningDimensionInputState;
  heightEstimated: boolean;
  bottomEstimated: boolean;
  heightAdjustedToWall: boolean;
  bottomAdjustedToWall: boolean;
  status: OpeningDimensionResolutionStatus;
  height: OpeningDimensionResolution;
  bottom: OpeningDimensionResolution;
  issues: string[];
};

export type OpeningDimensionResolutionStatus =
  | "exact"
  | "defaulted"
  | "constrained"
  | "invalid"
  | "unsupported";

export type OpeningDimensionResolution = {
  rawValueMm: number | null | undefined;
  rawEvidence?: FloorPlanPropertyEvidenceV2;
  effectiveValueMm: number;
  inputState: OpeningDimensionInputState;
  status: OpeningDimensionResolutionStatus;
  issue?: string;
};

export type OpeningDimensionDefaults = {
  doorHeightMm?: number;
  windowHeightMm?: number;
  windowSillMm?: number;
};

type OpeningDimensionInput = {
  kind: RoomOpening2D["kind"];
  heightMm?: number | null;
  bottomMm?: number | null;
  heightEvidence?: FloorPlanPropertyEvidenceV2;
  bottomEvidence?: FloorPlanPropertyEvidenceV2;
};

function classifyValue(
  input: OpeningDimensionInput,
  property: "heightMm" | "bottomMm"
): OpeningDimensionInputState {
  if (!Object.hasOwn(input, property)) return "missing";
  const value = input[property];
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (!Number.isFinite(value)) return "non_finite";
  if (value < 0) return "negative";
  if (value === 0) return "zero";
  return "positive";
}

function isEstimatedState(state: OpeningDimensionInputState): boolean {
  return (
    state === "missing" ||
    state === "undefined" ||
    state === "null" ||
    state === "non_finite" ||
    state === "negative"
  );
}

function requestedWindowBottom(
  input: OpeningDimensionInput,
  state: OpeningDimensionInputState,
  wallHeightMm: number,
  defaults: Required<OpeningDimensionDefaults>
): number {
  if (state === "zero" || state === "positive") return input.bottomMm ?? 0;
  return Math.min(
    defaults.windowSillMm,
    Math.max(0, wallHeightMm - defaults.windowHeightMm)
  );
}

function requestedHeight(
  input: OpeningDimensionInput,
  state: OpeningDimensionInputState,
  defaults: Required<OpeningDimensionDefaults>
): number {
  if (state === "positive") return input.heightMm ?? 0;
  return input.kind === "window"
    ? defaults.windowHeightMm
    : defaults.doorHeightMm;
}

function resolveDefaults(
  defaults: OpeningDimensionDefaults | undefined
): Required<OpeningDimensionDefaults> {
  return {
    doorHeightMm:
      Number.isFinite(defaults?.doorHeightMm) && defaults!.doorHeightMm! > 0
        ? defaults!.doorHeightMm!
        : DEFAULT_DOOR_HEIGHT_MM,
    windowHeightMm:
      Number.isFinite(defaults?.windowHeightMm) && defaults!.windowHeightMm! > 0
        ? defaults!.windowHeightMm!
        : DEFAULT_WINDOW_HEIGHT_MM,
    windowSillMm:
      Number.isFinite(defaults?.windowSillMm) && defaults!.windowSillMm! >= 0
        ? defaults!.windowSillMm!
        : DEFAULT_WINDOW_SILL_MM,
  };
}

function rawValue(
  input: OpeningDimensionInput,
  property: "heightMm" | "bottomMm"
) {
  return Object.hasOwn(input, property) ? input[property] : undefined;
}

function inputStatus(
  state: OpeningDimensionInputState,
  adjusted: boolean
): OpeningDimensionResolutionStatus {
  if (state === "positive" || state === "zero") {
    return adjusted ? "constrained" : "exact";
  }
  if (state === "missing" || state === "undefined" || state === "null") {
    return "defaulted";
  }
  return "invalid";
}

function overallStatus(
  height: OpeningDimensionResolutionStatus,
  bottom: OpeningDimensionResolutionStatus
): OpeningDimensionResolutionStatus {
  const ranks: Record<OpeningDimensionResolutionStatus, number> = {
    exact: 0,
    defaulted: 1,
    constrained: 2,
    invalid: 3,
    unsupported: 4,
  };
  return ranks[height] >= ranks[bottom] ? height : bottom;
}

function unsupportedDimensions(
  input: OpeningDimensionInput,
  wallHeightMm: number,
  heightInputState: OpeningDimensionInputState,
  bottomInputState: OpeningDimensionInputState
): EffectiveOpeningDimensions {
  const issue = "The host wall has no usable vertical height.";
  const resolution = (
    property: "heightMm" | "bottomMm",
    rawEvidence: FloorPlanPropertyEvidenceV2 | undefined,
    inputState: OpeningDimensionInputState
  ): OpeningDimensionResolution => ({
    rawValueMm: rawValue(input, property), rawEvidence,
    effectiveValueMm: 0, inputState, status: "unsupported", issue,
  });
  return {
    supported: false, wallHeightMm, heightMm: 0, bottomMm: 0, topMm: 0,
    heightInputState, bottomInputState,
    heightEstimated: isEstimatedState(heightInputState) || heightInputState === "zero",
    bottomEstimated: input.kind === "window" && isEstimatedState(bottomInputState),
    heightAdjustedToWall: true, bottomAdjustedToWall: input.kind === "window",
    status: "unsupported",
    height: resolution("heightMm", input.heightEvidence, heightInputState),
    bottom: resolution("bottomMm", input.bottomEvidence, bottomInputState),
    issues: [issue],
  };
}

function resolutionIssue(
  dimension: "height" | "sill",
  status: OpeningDimensionResolutionStatus
) {
  if (status === "invalid") {
    return `Stored opening ${dimension} is invalid; compatibility geometry uses a default until it is repaired.`;
  }
  if (status === "constrained") {
    return `Stored opening ${dimension} ${dimension === "height" ? "exceeds the host wall and " : ""}is constrained for rendering.`;
  }
  return undefined;
}

function dimensionResolution(
  input: OpeningDimensionInput,
  property: "heightMm" | "bottomMm",
  effectiveValueMm: number,
  inputState: OpeningDimensionInputState,
  status: OpeningDimensionResolutionStatus,
  issue: string | undefined
): OpeningDimensionResolution {
  return {
    rawValueMm: rawValue(input, property),
    rawEvidence: property === "heightMm" ? input.heightEvidence : input.bottomEvidence,
    effectiveValueMm, inputState, status,
    ...(issue ? { issue } : {}),
  };
}

function supportedDimensions(
  input: OpeningDimensionInput,
  wallHeightMm: number,
  defaults: Required<OpeningDimensionDefaults>,
  heightInputState: OpeningDimensionInputState,
  bottomInputState: OpeningDimensionInputState
): EffectiveOpeningDimensions {
  const requestedBottom = input.kind === "door" ? 0
    : requestedWindowBottom(input, bottomInputState, wallHeightMm, defaults);
  const bottomMm = Math.min(Math.max(0, requestedBottom), wallHeightMm - MIN_EFFECTIVE_OPENING_HEIGHT_MM);
  const requestedHeightMm = requestedHeight(input, heightInputState, defaults);
  const heightMm = Math.min(Math.max(MIN_EFFECTIVE_OPENING_HEIGHT_MM, requestedHeightMm), wallHeightMm - bottomMm);
  const heightStatus = inputStatus(heightInputState, heightMm !== requestedHeightMm);
  const bottomStatus: OpeningDimensionResolutionStatus = input.kind === "door"
    ? "exact" : inputStatus(bottomInputState, bottomMm !== requestedBottom);
  const heightIssue = resolutionIssue("height", heightStatus);
  const bottomIssue = resolutionIssue("sill", bottomStatus);
  const issues = [heightIssue, bottomIssue].filter((issue): issue is string => Boolean(issue));
  return {
    supported: true, wallHeightMm, heightMm, bottomMm, topMm: bottomMm + heightMm,
    heightInputState, bottomInputState,
    heightEstimated: isEstimatedState(heightInputState) || heightInputState === "zero" || heightInputState === "negative",
    bottomEstimated: input.kind === "window" && isEstimatedState(bottomInputState),
    heightAdjustedToWall: heightMm !== requestedHeightMm,
    bottomAdjustedToWall: bottomMm !== requestedBottom,
    status: overallStatus(heightStatus, bottomStatus),
    height: dimensionResolution(input, "heightMm", heightMm, heightInputState, heightStatus, heightIssue),
    bottom: dimensionResolution(input, "bottomMm", bottomMm, bottomInputState, bottomStatus, bottomIssue),
    issues,
  };
}

/**
 * Resolves the one effective vertical opening geometry used by editors and
 * renderers. Invalid sparse values remain estimated; finite positive values
 * remain explicit, with only the physical wall constraint able to reduce
 * them. A wall shorter than the normal default receives a positive full-span
 * opening rather than an unrelated editor/rendering minimum.
 */
export function resolveEffectiveOpeningDimensions(
  input: OpeningDimensionInput,
  wallHeightMmInput: number,
  contextualDefaults?: OpeningDimensionDefaults
): EffectiveOpeningDimensions {
  const defaults = resolveDefaults(contextualDefaults);
  const wallHeightMm = Number.isFinite(wallHeightMmInput)
    ? Math.max(0, wallHeightMmInput)
    : 0;
  const heightInputState = classifyValue(input, "heightMm");
  const bottomInputState = classifyValue(input, "bottomMm");
  if (wallHeightMm < MIN_EFFECTIVE_OPENING_HEIGHT_MM) {
    return unsupportedDimensions(input, wallHeightMm, heightInputState, bottomInputState);
  }
  return supportedDimensions(input, wallHeightMm, defaults, heightInputState, bottomInputState);
}

export function openingMillimetresToMeters(valueMm: number): number {
  return valueMm / 1000;
}

export function openingMetersToMillimetres(valueMeters: number): number {
  return Math.round(valueMeters * 1000);
}
