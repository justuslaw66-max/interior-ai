export type DisplayUnit = "mm" | "cm" | "in" | "ft-in";
export type MeasurementSystem = "metric" | "imperial";

export type DisplayUnitMetadata = {
  unit: DisplayUnit;
  label: string;
  indicator: string;
  system: MeasurementSystem;
  millimetresPerScalarUnit: number;
  scalarDecimalPlaces: number;
};

export const DEFAULT_DISPLAY_UNIT: DisplayUnit = "cm";

export const DISPLAY_UNIT_METADATA: Readonly<
  Record<DisplayUnit, DisplayUnitMetadata>
> = {
  mm: {
    unit: "mm",
    label: "Millimetres (mm)",
    indicator: "mm",
    system: "metric",
    millimetresPerScalarUnit: 1,
    scalarDecimalPlaces: 2,
  },
  cm: {
    unit: "cm",
    label: "Centimetres (cm)",
    indicator: "cm",
    system: "metric",
    millimetresPerScalarUnit: 10,
    scalarDecimalPlaces: 2,
  },
  in: {
    unit: "in",
    label: "Inches (in)",
    indicator: "in",
    system: "imperial",
    millimetresPerScalarUnit: 25.4,
    scalarDecimalPlaces: 3,
  },
  "ft-in": {
    unit: "ft-in",
    label: "Feet + inches (ft + in)",
    indicator: "ft + in",
    system: "imperial",
    millimetresPerScalarUnit: 25.4,
    scalarDecimalPlaces: 1,
  },
};

export const DISPLAY_UNIT_GROUPS = [
  { label: "Metric", units: ["mm", "cm"] },
  { label: "Imperial", units: ["in", "ft-in"] },
] as const satisfies ReadonlyArray<{
  label: string;
  units: readonly DisplayUnit[];
}>;

const SQUARE_METRES_TO_SQUARE_FEET = 10.763_910_416_709_722;
const COMPLETE_DECIMAL_NUMBER =
  /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const DECIMAL_TOKEN = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
const SIGNED_DECIMAL_TOKEN = String.raw`[+-]?${DECIMAL_TOKEN}`;
const FEET_MARKER = String.raw`(?:'|ft\.?|feet|foot)`;
const INCH_MARKER = String.raw`(?:"|in\.?|inches|inch)`;
const FEET_AND_OPTIONAL_INCHES = new RegExp(
  String.raw`^(${SIGNED_DECIMAL_TOKEN})\s*${FEET_MARKER}(?:\s*-?\s*(${DECIMAL_TOKEN})\s*${INCH_MARKER})?$`,
  "i"
);
const INCHES_ONLY = new RegExp(
  String.raw`^(${SIGNED_DECIMAL_TOKEN})\s*${INCH_MARKER}$`,
  "i"
);

export type DisplayLengthParseResult =
  | { status: "valid"; valueMm: number }
  | {
      status: "invalid";
      code: "empty" | "invalid_syntax" | "non_finite";
    };

export type DisplayLengthResolution =
  | { status: "valid"; valueMm: number }
  | {
      status: "invalid";
      code:
        | "empty"
        | "invalid_syntax"
        | "non_finite"
        | "below_minimum"
        | "above_maximum"
        | "step_mismatch";
      valueMm?: number;
    };

export type ResolveDisplayLengthOptions = {
  referenceMm?: number;
  minMm?: number;
  maxMm?: number;
  snapStepMm?: number;
  stepBaseMm?: number;
};

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function normalizePrimeCharacters(value: string): string {
  return value
    .replace(/[′’‘]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/\u00a0/g, " ")
    .trim();
}

function scalarSuffix(unit: Exclude<DisplayUnit, "ft-in">): RegExp {
  return new RegExp(`^(${SIGNED_DECIMAL_TOKEN}(?:[eE][+-]?\\d+)?)\\s*${unit}$`, "i");
}

function feetAndInchesParts(valueMm: number, inchDecimalPlaces: number) {
  const sign = valueMm < 0 ? "-" : "";
  const roundedTotalInches = roundTo(
    Math.abs(valueMm) / DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit,
    inchDecimalPlaces
  );
  const feet = Math.floor(roundedTotalInches / 12);
  const inches = roundTo(roundedTotalInches - feet * 12, inchDecimalPlaces);
  return { sign, feet, inches };
}

function formatInchPart(inches: number, inchDecimalPlaces: number): string {
  if (inches === 0) return "0";
  return inches.toFixed(inchDecimalPlaces);
}

export function isDisplayUnit(value: unknown): value is DisplayUnit {
  return (
    value === "mm" || value === "cm" || value === "in" || value === "ft-in"
  );
}

export function normalizeDisplayUnit(
  value: unknown,
  fallback: DisplayUnit = DEFAULT_DISPLAY_UNIT
): DisplayUnit {
  return isDisplayUnit(value) ? value : fallback;
}

export function getDisplayUnitMetadata(unit: DisplayUnit): DisplayUnitMetadata {
  return DISPLAY_UNIT_METADATA[unit];
}

export function getMeasurementSystem(unit: DisplayUnit): MeasurementSystem {
  return DISPLAY_UNIT_METADATA[unit].system;
}

export function getMillimetresPerDisplayScalarUnit(unit: DisplayUnit): number {
  return DISPLAY_UNIT_METADATA[unit].millimetresPerScalarUnit;
}

export function getDisplayScalarDecimalPlaces(unit: DisplayUnit): number {
  return DISPLAY_UNIT_METADATA[unit].scalarDecimalPlaces;
}

export function getDisplayUnitResolutionMm(unit: DisplayUnit): number {
  return (
    10 ** -getDisplayScalarDecimalPlaces(unit) *
    getMillimetresPerDisplayScalarUnit(unit)
  );
}

export function millimetresToScalarDisplay(
  valueMm: number,
  unit: DisplayUnit
): number {
  if (!Number.isFinite(valueMm)) return valueMm;
  return roundTo(
    valueMm / getMillimetresPerDisplayScalarUnit(unit),
    getDisplayScalarDecimalPlaces(unit)
  );
}

export function scalarDisplayToMillimetres(
  value: number,
  unit: DisplayUnit
): number {
  if (!Number.isFinite(value)) return value;
  return roundTo(value * getMillimetresPerDisplayScalarUnit(unit), 3);
}

export function formatDisplayLengthInput(
  valueMm: number,
  unit: DisplayUnit,
  options: { inchDecimalPlaces?: number } = {}
): string {
  if (!Number.isFinite(valueMm)) return "";
  if (unit !== "ft-in") return String(millimetresToScalarDisplay(valueMm, unit));

  const inchDecimalPlaces = options.inchDecimalPlaces ?? 1;
  const { sign, feet, inches } = feetAndInchesParts(valueMm, inchDecimalPlaces);
  return `${sign}${feet}′ ${formatInchPart(inches, inchDecimalPlaces)}″`;
}

export function formatDisplayLength(
  valueMm: number,
  unit: DisplayUnit,
  options: { inchDecimalPlaces?: number } = {}
): string {
  if (!Number.isFinite(valueMm)) return "—";
  if (unit === "ft-in") return formatDisplayLengthInput(valueMm, unit, options);

  const displayValue = millimetresToScalarDisplay(valueMm, unit);
  const maximumFractionDigits = unit === "in" ? 3 : unit === "cm" ? 2 : 1;
  return `${displayValue.toLocaleString("en-US", {
    maximumFractionDigits,
  })} ${unit}`;
}

function parseScalarDisplayLength(
  normalized: string,
  unit: Exclude<DisplayUnit, "ft-in">
): DisplayLengthParseResult {
  const suffixMatch = normalized.match(scalarSuffix(unit));
  const numericToken = suffixMatch?.[1] ?? normalized;
  if (!COMPLETE_DECIMAL_NUMBER.test(numericToken)) {
    return { status: "invalid", code: "invalid_syntax" };
  }
  const value = Number(numericToken);
  if (!Number.isFinite(value)) return { status: "invalid", code: "non_finite" };
  return { status: "valid", valueMm: scalarDisplayToMillimetres(value, unit) };
}

function parseFeetAndInchesLength(normalized: string): DisplayLengthParseResult {
  const feetMatch = normalized.match(FEET_AND_OPTIONAL_INCHES);
  if (feetMatch) {
    const feetToken = feetMatch[1];
    const feet = Number(feetToken);
    const inches = feetMatch[2] === undefined ? 0 : Number(feetMatch[2]);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      return { status: "invalid", code: "non_finite" };
    }
    const sign = feetToken.startsWith("-") ? -1 : 1;
    const valueMm = sign * (Math.abs(feet) * 12 + inches) *
      DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit;
    return { status: "valid", valueMm: roundTo(valueMm, 3) };
  }

  const inchesMatch = normalized.match(INCHES_ONLY);
  const bareInches = COMPLETE_DECIMAL_NUMBER.test(normalized) ? normalized : null;
  const inchesToken = inchesMatch?.[1] ?? bareInches;
  if (inchesToken === null) return { status: "invalid", code: "invalid_syntax" };

  const inches = Number(inchesToken);
  if (!Number.isFinite(inches)) return { status: "invalid", code: "non_finite" };
  return { status: "valid", valueMm: scalarDisplayToMillimetres(inches, "in") };
}

export function parseDisplayLength(
  input: string,
  unit: DisplayUnit
): DisplayLengthParseResult {
  const normalized = normalizePrimeCharacters(input);
  if (!normalized) return { status: "invalid", code: "empty" };
  if (/^[+-]?(?:nan|infinity)(?:\s*[a-z"']+)?$/i.test(normalized)) {
    return { status: "invalid", code: "non_finite" };
  }
  return unit === "ft-in"
    ? parseFeetAndInchesLength(normalized)
    : parseScalarDisplayLength(normalized, unit);
}

function collectDisplaySnapTargets(
  valueMm: number,
  options: ResolveDisplayLengthOptions
): number[] {
  const targets: number[] = [];
  if (Number.isFinite(options.minMm)) targets.push(options.minMm!);
  if (Number.isFinite(options.maxMm)) targets.push(options.maxMm!);
  if (Number.isFinite(options.referenceMm)) targets.push(options.referenceMm!);
  if (Number.isFinite(options.snapStepMm) && options.snapStepMm! > 0) {
    const base = Number.isFinite(options.stepBaseMm) ? options.stepBaseMm! : 0;
    targets.push(
      base + Math.round((valueMm - base) / options.snapStepMm!) * options.snapStepMm!
    );
  }
  return targets;
}

function snapDisplayMillimetres(
  valueMm: number,
  unit: DisplayUnit,
  options: ResolveDisplayLengthOptions
): number {
  const toleranceMm = getDisplayUnitResolutionMm(unit) / 2 + 0.000_501;
  const precisionTarget = collectDisplaySnapTargets(valueMm, options).find(
    (target) => Math.abs(valueMm - target) <= toleranceMm
  );
  return precisionTarget === undefined ? valueMm : roundTo(precisionTarget, 3);
}

function followsDisplayStep(
  valueMm: number,
  options: ResolveDisplayLengthOptions
): boolean {
  const stepMm = options.snapStepMm;
  if (!Number.isFinite(stepMm) || stepMm! <= 0) return true;
  const base = Number.isFinite(options.stepBaseMm) ? options.stepBaseMm! : 0;
  const quotient = (valueMm - base) / stepMm!;
  const nearest = Math.round(quotient);
  const tolerance = Number.EPSILON * 64 * Math.max(1, Math.abs(quotient));
  return Math.abs(quotient - nearest) <= tolerance;
}

export function resolveDisplayLengthInput(
  input: string,
  unit: DisplayUnit,
  options: ResolveDisplayLengthOptions = {}
): DisplayLengthResolution {
  const parsed = parseDisplayLength(input, unit);
  if (parsed.status === "invalid") return parsed;
  const valueMm = snapDisplayMillimetres(parsed.valueMm, unit, options);

  if (Number.isFinite(options.minMm) && valueMm < options.minMm!) {
    return { status: "invalid", code: "below_minimum", valueMm };
  }
  if (Number.isFinite(options.maxMm) && valueMm > options.maxMm!) {
    return { status: "invalid", code: "above_maximum", valueMm };
  }

  if (!followsDisplayStep(valueMm, options)) {
    return { status: "invalid", code: "step_mismatch", valueMm };
  }

  return { status: "valid", valueMm };
}

function displayConstraintLabel(valueMm: number, unit: DisplayUnit): string {
  const value = formatDisplayLengthInput(valueMm, unit);
  return unit === "ft-in" ? value : `${value} ${unit}`;
}

export function getDisplayLengthInputError(
  resolution: DisplayLengthResolution,
  unit: DisplayUnit,
  options: Pick<ResolveDisplayLengthOptions, "minMm" | "maxMm"> = {}
): string | null {
  if (resolution.status === "valid") return null;
  if (resolution.code === "empty") {
    return "Enter a measurement before applying this change.";
  }
  if (resolution.code === "non_finite") {
    return "Enter a finite measurement within the supported range.";
  }
  if (resolution.code === "below_minimum") {
    return `Enter ${displayConstraintLabel(options.minMm ?? 0, unit)} or more.`;
  }
  if (resolution.code === "above_maximum") {
    return `Enter ${displayConstraintLabel(options.maxMm ?? 0, unit)} or less.`;
  }
  if (resolution.code === "step_mismatch") {
    return `Use a valid ${getDisplayUnitMetadata(unit).indicator} increment.`;
  }
  return unit === "ft-in"
    ? "Enter a length such as 13′ 9.4″."
    : "Enter a decimal measurement using digits and a decimal point.";
}

export function formatDisplayArea(
  areaSquareMetres: number,
  unit: DisplayUnit
): string {
  if (!Number.isFinite(areaSquareMetres)) return "—";
  if (getMeasurementSystem(unit) === "imperial") {
    return `${(areaSquareMetres * SQUARE_METRES_TO_SQUARE_FEET).toFixed(1)} ft²`;
  }
  return `${areaSquareMetres.toFixed(1)} m²`;
}
