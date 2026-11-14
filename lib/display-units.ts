import { formatInchesAsFraction, formatSixteenths, formatWholeAndFraction, INCH_AMOUNT_PATTERN, parseInchAmount, roundToSixteenths } from "@/lib/inch-fractions";

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
const COMPOUND_FEET_AND_INCHES = new RegExp(
  String.raw`^(\d+)\s*${FEET_MARKER}\s*(${INCH_AMOUNT_PATTERN})\s*${INCH_MARKER}$`,
  "i"
);
const FEET_ONLY = new RegExp(
  String.raw`^(${SIGNED_DECIMAL_TOKEN})\s*${FEET_MARKER}$`,
  "i"
);
const INCHES_ONLY = new RegExp(String.raw`^([+-]?)(${INCH_AMOUNT_PATTERN})\s*${INCH_MARKER}$`, "i");
/** An inches field's entry: a decimal or a fraction, with or without the unit. */
const INCH_FIELD = new RegExp(String.raw`^([+-]?)(${INCH_AMOUNT_PATTERN})\s*(?:${INCH_MARKER})?$`, "i");
export type DisplayLengthParseResult =
  | { status: "valid"; valueMm: number }
  | {
      status: "invalid";
      code:
        | "empty"
        | "invalid_syntax"
        | "non_finite"
        | "compound_inches_out_of_range";
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
        | "compound_inches_out_of_range"
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
/** Feet, then inches to the nearest 1/16″ ("9 3/8"; under an inch keeps its 0: 4′ 0 3/8″). */
function feetAndInchesParts(valueMm: number) {
  const sign = valueMm < 0 ? "-" : "";
  const { whole, sixteenths } = roundToSixteenths(Math.abs(valueMm) / DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit);
  const feet = Math.floor(whole / 12);
  const inchWhole = whole - feet * 12;
  return { sign, feet, inches: inchWhole === 0 && sixteenths ? `0 ${formatSixteenths(sixteenths)}` : formatWholeAndFraction(inchWhole, sixteenths) };
}
/** Signed inches to the nearest 1/16″ for an inches field: "47 3/8", "-3/8". */
function formatInchesField(valueMm: number): string {
  const inches = Math.abs(valueMm) / DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit;
  const text = formatInchesAsFraction(inches);
  return valueMm < 0 && text !== "0" ? `-${text}` : text;
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
/** A length as its field shows it: metric decimals, inches as 1/16″ fractions (lib/inch-fractions.ts). */
export function formatDisplayLengthInput(valueMm: number, unit: DisplayUnit): string {
  if (!Number.isFinite(valueMm)) return "";
  if (unit === "in") return formatInchesField(valueMm);
  if (unit !== "ft-in") return String(millimetresToScalarDisplay(valueMm, unit));
  const { sign, feet, inches } = feetAndInchesParts(valueMm);
  return `${sign}${feet}′ ${inches}″`;
}
export function formatDisplayLength(valueMm: number, unit: DisplayUnit): string {
  if (!Number.isFinite(valueMm)) return "—";
  if (unit === "ft-in") return formatDisplayLengthInput(valueMm, unit);
  if (unit === "in") return `${formatInchesField(valueMm)} in`;

  const displayValue = millimetresToScalarDisplay(valueMm, unit);
  const maximumFractionDigits = unit === "cm" ? 2 : 1;
  return `${displayValue.toLocaleString("en-US", {
    maximumFractionDigits,
  })} ${unit}`;
}
/** Inches typed with a sign, from their sign and amount; NaN amounts are non-finite. */
function signedInchesResult(sign: string, amount: string): DisplayLengthParseResult {
  const inches = parseInchAmount(amount);
  if (!Number.isFinite(inches)) return { status: "invalid", code: "non_finite" };
  return { status: "valid", valueMm: scalarDisplayToMillimetres(sign === "-" ? -inches : inches, "in") };
}
function parseScalarDisplayLength(
  normalized: string,
  unit: Exclude<DisplayUnit, "ft-in">
): DisplayLengthParseResult {
  if (unit === "in") {
    const inchMatch = normalized.match(INCH_FIELD);
    return inchMatch ? signedInchesResult(inchMatch[1], inchMatch[2]) : { status: "invalid", code: "invalid_syntax" };
  }
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
  const compoundMatch = normalized.match(COMPOUND_FEET_AND_INCHES);
  if (compoundMatch) {
    const feet = Number(compoundMatch[1]);
    const inches = parseInchAmount(compoundMatch[2]);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      return { status: "invalid", code: "non_finite" };
    }
    if (inches >= 12) {
      return { status: "invalid", code: "compound_inches_out_of_range" };
    }
    const valueMm = (feet * 12 + inches) *
      DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit;
    return { status: "valid", valueMm: roundTo(valueMm, 3) };
  }

  const feetMatch = normalized.match(FEET_ONLY);
  if (feetMatch) {
    const feet = Number(feetMatch[1]);
    if (!Number.isFinite(feet)) return { status: "invalid", code: "non_finite" };
    return {
      status: "valid",
      valueMm: roundTo(
        feet * 12 * DISPLAY_UNIT_METADATA.in.millimetresPerScalarUnit,
        3
      ),
    };
  }

  const inchesMatch = normalized.match(INCHES_ONLY);
  if (!inchesMatch) return { status: "invalid", code: "invalid_syntax" };
  return signedInchesResult(inchesMatch[1], inchesMatch[2]);
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
  unit: DisplayUnit,
  options: ResolveDisplayLengthOptions
): number[] {
  const boundaryTargets: number[] = [];
  if (Number.isFinite(options.minMm)) boundaryTargets.push(options.minMm!);
  if (Number.isFinite(options.maxMm)) boundaryTargets.push(options.maxMm!);
  if (getMeasurementSystem(unit) === "imperial") return boundaryTargets;
  const metricRestorationTargets: number[] = [];
  if (Number.isFinite(options.referenceMm)) {
    metricRestorationTargets.push(options.referenceMm!);
  }
  if (
    Number.isFinite(options.snapStepMm) &&
    options.snapStepMm! > 0
  ) {
    const base = Number.isFinite(options.stepBaseMm) ? options.stepBaseMm! : 0;
    metricRestorationTargets.push(
      base + Math.round((valueMm - base) / options.snapStepMm!) * options.snapStepMm!
    );
  }
  return boundaryTargets.concat(metricRestorationTargets);
}

function snapDisplayMillimetres(
  valueMm: number,
  unit: DisplayUnit,
  options: ResolveDisplayLengthOptions
): number {
  const toleranceMm = getDisplayUnitResolutionMm(unit) / 2 + 0.000_501;
  const precisionTarget = collectDisplaySnapTargets(valueMm, unit, options).find(
    (target) => Math.abs(valueMm - target) <= toleranceMm
  );
  return precisionTarget === undefined ? valueMm : roundTo(precisionTarget, 3);
}

function followsDisplayStep(
  valueMm: number,
  unit: DisplayUnit,
  options: ResolveDisplayLengthOptions
): boolean {
  // Room geometry persists finite metre values below the 10 mm UI increment.
  // Imperial text therefore keeps its parsed millimetres exactly; the step is
  // reserved for metric entry and keyboard adjustment, never proximity-based
  // acceptance or rejection of an imperial value.
  if (getMeasurementSystem(unit) === "imperial") return true;
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
  const referenceMm = options.referenceMm;
  const preservesImperialReference =
    getMeasurementSystem(unit) === "imperial" &&
    typeof referenceMm === "number" &&
    Number.isFinite(referenceMm) &&
    input.trim() === formatDisplayLengthInput(referenceMm, unit);
  const valueMm = preservesImperialReference
    ? referenceMm
    : snapDisplayMillimetres(parsed.valueMm, unit, options);
  if (Number.isFinite(options.minMm) && valueMm < options.minMm!) {
    return { status: "invalid", code: "below_minimum", valueMm };
  }
  if (Number.isFinite(options.maxMm) && valueMm > options.maxMm!) {
    return { status: "invalid", code: "above_maximum", valueMm };
  }
  if (!followsDisplayStep(valueMm, unit, options)) {
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
  if (resolution.code === "compound_inches_out_of_range") {
    return "Inches must be less than 12 when feet are included.";
  }
  if (resolution.code === "step_mismatch") {
    return `Use a valid ${getDisplayUnitMetadata(unit).indicator} increment.`;
  }
  return unit === "ft-in"
    ? "Enter a length such as 13′ 9 3/8″."
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
