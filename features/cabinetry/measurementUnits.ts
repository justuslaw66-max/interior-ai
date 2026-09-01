import {
  formatDisplayLength,
  getDisplayScalarDecimalPlaces,
  getDisplayUnitResolutionMm,
  getMillimetresPerDisplayScalarUnit,
  millimetresToScalarDisplay,
  scalarDisplayToMillimetres,
  type DisplayUnit,
} from "@/lib/display-units";

export type CabinetMeasurementUnit = "mm" | "cm" | "in";

export function getCabinetMillimetresPerDisplayUnit(
  unit: CabinetMeasurementUnit
): number {
  return getMillimetresPerDisplayScalarUnit(unit);
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function getCabinetDisplayDecimalPlaces(unit: CabinetMeasurementUnit): number {
  return getDisplayScalarDecimalPlaces(unit);
}

/** Smallest authored display increment retained by the shared measurement UI. */
export function getCabinetDisplayDraftStep(unit: CabinetMeasurementUnit): number {
  return 10 ** -getCabinetDisplayDecimalPlaces(unit);
}

export function getCabinetDisplayResolutionMm(unit: CabinetMeasurementUnit): number {
  return getDisplayUnitResolutionMm(unit);
}

export function cabinetMillimetresToDisplay(
  valueMm: number,
  unit: CabinetMeasurementUnit
): number {
  return millimetresToScalarDisplay(valueMm, unit);
}

export function cabinetDisplayToMillimetres(
  value: number,
  unit: CabinetMeasurementUnit
): number {
  return scalarDisplayToMillimetres(value, unit);
}

export interface CabinetDisplayToModelOptions {
  referenceMm?: number;
  minMm?: number;
  maxMm?: number;
  snapStepMm?: number;
  stepBaseMm?: number;
}

export type CabinetDisplayMeasurementResolution =
  | { status: "valid"; valueMm: number }
  | {
      status: "invalid";
      code: "non_finite" | "below_minimum" | "above_maximum" | "integer_required" | "step_mismatch";
      valueMm: number;
    };

/**
 * Converts an authored display value while restoring exact model values that
 * became approximate only because the selected unit has finite display precision.
 */
export function cabinetDisplayToModelMillimetres(
  value: number,
  unit: CabinetMeasurementUnit,
  options: CabinetDisplayToModelOptions = {}
): number {
  const converted = cabinetDisplayToMillimetres(value, unit);
  if (!Number.isFinite(converted)) return converted;

  const toleranceMm = getCabinetDisplayResolutionMm(unit) / 2 + 0.000_501;
  const snapTargets: number[] = [];
  if (Number.isFinite(options.minMm)) snapTargets.push(options.minMm!);
  if (Number.isFinite(options.maxMm)) snapTargets.push(options.maxMm!);
  if (Number.isFinite(options.referenceMm)) snapTargets.push(options.referenceMm!);

  if (Number.isFinite(options.snapStepMm) && options.snapStepMm! > 0) {
    const base = Number.isFinite(options.stepBaseMm) ? options.stepBaseMm! : 0;
    snapTargets.push(
      base + Math.round((converted - base) / options.snapStepMm!) * options.snapStepMm!
    );
  }

  const precisionTarget = snapTargets.find(
    (target) => Math.abs(converted - target) <= toleranceMm
  );
  return precisionTarget === undefined ? converted : roundTo(precisionTarget, 3);
}

/** Resolves display input and enforces accepted increments in model millimetres. */
export function resolveCabinetDisplayMeasurement(
  value: number,
  unit: CabinetMeasurementUnit,
  options: CabinetDisplayToModelOptions & { integer?: boolean } = {}
): CabinetDisplayMeasurementResolution {
  const valueMm = cabinetDisplayToModelMillimetres(value, unit, options);
  if (!Number.isFinite(valueMm)) {
    return { status: "invalid", code: "non_finite", valueMm };
  }
  if (Number.isFinite(options.minMm) && valueMm < options.minMm!) {
    return { status: "invalid", code: "below_minimum", valueMm };
  }
  if (Number.isFinite(options.maxMm) && valueMm > options.maxMm!) {
    return { status: "invalid", code: "above_maximum", valueMm };
  }
  if (options.integer && !Number.isInteger(valueMm)) {
    return { status: "invalid", code: "integer_required", valueMm };
  }

  const stepMm = options.snapStepMm;
  if (Number.isFinite(stepMm) && stepMm! > 0) {
    const baseMm = Number.isFinite(options.stepBaseMm) ? options.stepBaseMm! : 0;
    const quotient = (valueMm - baseMm) / stepMm!;
    const nearest = Math.round(quotient);
    const tolerance = Number.EPSILON * 64 * Math.max(1, Math.abs(quotient));
    if (Math.abs(quotient - nearest) > tolerance) {
      return { status: "invalid", code: "step_mismatch", valueMm };
    }
  }

  return { status: "valid", valueMm };
}

export function formatCabinetMeasurement(
  valueMm: number,
  unit: DisplayUnit,
  options: { includeMillimetreReference?: boolean } = {}
): string {
  const primary = formatDisplayLength(valueMm, unit);
  if (unit === "mm" || !options.includeMillimetreReference) return primary;
  return `${primary} (${Math.round(valueMm).toLocaleString("en-US")} mm)`;
}

const MILLIMETRE_MESSAGE_RANGE =
  /(^|[^A-Za-z0-9_.-])([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*([-–—])\s*([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s+mm\b(?![²³]|\^[23])/gi;
const MILLIMETRE_MESSAGE_TOKEN =
  /(^|[^A-Za-z0-9_.-])([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s+mm\b(?![²³]|\^[23])/gi;

function formatExactMillimetreReference(valueMm: number): string {
  return valueMm.toLocaleString("en-US", {
    maximumFractionDigits: 12,
    useGrouping: true,
  });
}

function formatFeedbackMeasurement(valueMm: number, unit: DisplayUnit): string {
  return `${formatCabinetMeasurement(valueMm, unit)} (${formatExactMillimetreReference(valueMm)} mm)`;
}

/**
 * Converts standalone linear-measurement tokens in domain feedback without
 * touching unrelated numbers, IDs, compact SKU fragments, or area/volume units.
 * Domain producers can therefore remain millimetre-native while the UI follows
 * the active project unit. Existing `cm/in (... mm)` output is left unchanged.
 */
export function formatCabinetMeasurementTokens(
  message: string,
  unit: DisplayUnit
): string {
  if (!message || unit === "mm") return message;

  const rangesFormatted = message.replace(
    MILLIMETRE_MESSAGE_RANGE,
    (match, prefix: string, startToken: string, separator: string, endToken: string) => {
      const startMm = Number(startToken.replace(/,/g, ""));
      const endMm = Number(endToken.replace(/,/g, ""));
      if (!Number.isFinite(startMm) || !Number.isFinite(endMm)) return match;
      return `${prefix}${formatFeedbackMeasurement(startMm, unit)}${separator}${formatFeedbackMeasurement(endMm, unit)}`;
    }
  );

  return rangesFormatted.replace(
    MILLIMETRE_MESSAGE_TOKEN,
    (match, prefix: string, numericToken: string, offset: number, source: string) => {
      if (
        prefix === "(" &&
        /\b(?:cm|in)\s*$/i.test(source.slice(0, offset))
      ) {
        return match;
      }
      const valueMm = Number(numericToken.replace(/,/g, ""));
      if (!Number.isFinite(valueMm)) return match;
      return `${prefix}${formatFeedbackMeasurement(valueMm, unit)}`;
    }
  );
}
