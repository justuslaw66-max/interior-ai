/**
 * Inches as a tape measure reads them: whole inches and a fraction to 1/16″ (47 3/8), the way
 * SketchUp's architectural units and US builders write them (market practice, J 14 Nov 2026).
 * Entry takes the fraction or a decimal (47 3/8, 47-3/8, 3/8, 47.4), so a value typed either way
 * is understood.
 */
export const INCH_FRACTION_DENOMINATOR = 16;

/** The resolution shown, in inches: 1/16″, about 1.6 mm. */
export const INCH_FRACTION_STEP_INCHES = 1 / INCH_FRACTION_DENOMINATOR;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** Inches rounded to the nearest 1/16″, as whole inches and sixteenths (0–15). */
export function roundToSixteenths(inches: number): { whole: number; sixteenths: number } {
  const totalSixteenths = Math.round(Math.abs(inches) * INCH_FRACTION_DENOMINATOR);
  return {
    whole: Math.floor(totalSixteenths / INCH_FRACTION_DENOMINATOR),
    sixteenths: totalSixteenths % INCH_FRACTION_DENOMINATOR,
  };
}

/** "3/8" for six sixteenths, reduced; "" for none. */
export function formatSixteenths(sixteenths: number): string {
  if (sixteenths === 0) return "";
  const divisor = greatestCommonDivisor(sixteenths, INCH_FRACTION_DENOMINATOR);
  return `${sixteenths / divisor}/${INCH_FRACTION_DENOMINATOR / divisor}`;
}

/** Whole inches and a reduced fraction: "47 3/8", "3/8", "47", or "0"; no sign or unit. */
export function formatWholeAndFraction(whole: number, sixteenths: number): string {
  const fraction = formatSixteenths(sixteenths);
  if (!fraction) return String(whole);
  return whole === 0 ? fraction : `${whole} ${fraction}`;
}

/** A positive number of inches to the nearest 1/16″: "47 3/8". The caller adds any sign. */
export function formatInchesAsFraction(inches: number): string {
  const { whole, sixteenths } = roundToSixteenths(inches);
  return formatWholeAndFraction(whole, sixteenths);
}

const DECIMAL = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
const FRACTION = String.raw`\d+\s*\/\s*\d+`;
/**
 * An unsigned inch amount as it may be typed: a decimal (47.4), a fraction (3/8), or whole inches and
 * a fraction joined by a space or a hyphen (47 3/8, 47-3/8).
 */
export const INCH_AMOUNT_PATTERN = String.raw`(?:\d+\s*(?:-|\s)\s*${FRACTION}|${FRACTION}|${DECIMAL})`;

/** The inches an amount matched by INCH_AMOUNT_PATTERN stands for; NaN for a zero denominator. */
export function parseInchAmount(token: string): number {
  const text = token.trim();
  const mixed = text.match(/^(\d+)\s*(?:-|\s)\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + fractionValue(mixed[2], mixed[3]);
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return fractionValue(fraction[1], fraction[2]);
  return Number(text);
}

function fractionValue(numerator: string, denominator: string): number {
  const bottom = Number(denominator);
  return bottom === 0 ? Number.NaN : Number(numerator) / bottom;
}
