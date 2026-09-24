import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import {
  DISPLAY_UNIT_METADATA,
  formatDisplayLengthInput,
  parseDisplayLength,
} from "@/lib/display-units";

/** A drawn segment can never be longer than a room may be. */
export const MAX_WALL_DRAW_SEGMENT_LENGTH_METERS = ROOM_DIMENSION_DEFAULTS.max;

export type WallDrawSegmentEditor = {
  segmentIndex: number;
  value: string;
};

/**
 * The in-canvas wall-length editor round-trips through the plan's display unit. Its read-only label
 * has followed that unit since #37, but the edit state seeded, parsed and labelled itself in
 * millimetres, so clicking a length switched the canvas to mm on its own.
 */
export function formatWallDrawLengthInput(
  lengthMm: number,
  unit: PlanMeasurementUnit
): string {
  return formatDisplayLengthInput(lengthMm, unit);
}

/**
 * Millimetres, or NaN when the text is not a length in this unit. NaN rather than a result object
 * so every caller keeps the single Number.isFinite check it already had: empty text parsed as 0
 * before and as NaN now, and both fall the same way through those checks.
 */
export function parseWallDrawLengthMm(
  value: string,
  unit: PlanMeasurementUnit
): number {
  const parsed = parseDisplayLength(value, unit);
  return parsed.status === "valid" ? parsed.valueMm : Number.NaN;
}

/** The suffix beside the input: "mm", "cm", "in" or "ft + in". */
export function wallDrawLengthUnitIndicator(unit: PlanMeasurementUnit): string {
  return DISPLAY_UNIT_METADATA[unit].indicator;
}

/**
 * The editor closes when the segment it edits can no longer exist, or when the typed length has run
 * past the draw limit. The limit is read in the plan's unit, like everything else the editor shows.
 */
export function wallDrawSegmentEditorIsStale(
  editor: WallDrawSegmentEditor,
  unit: PlanMeasurementUnit,
  canRenderMeasurements: boolean,
  drawPointCount: number
): boolean {
  if (!canRenderMeasurements) return true;
  if (editor.segmentIndex <= 0) return true;
  if (editor.segmentIndex >= drawPointCount) return true;
  const lengthMm = parseWallDrawLengthMm(editor.value, unit);
  return (
    Number.isFinite(lengthMm) &&
    lengthMm > MAX_WALL_DRAW_SEGMENT_LENGTH_METERS * 1000
  );
}
