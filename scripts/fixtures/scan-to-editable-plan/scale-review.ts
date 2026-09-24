import { authoredApartment } from "./apartment";
import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";

export function calibratedScaleFixture() {
  const document = authoredApartment();
  document.sources[0].sha256 = "a".repeat(64);
  document.floors[0].calibrations = [{ id: "scale", sourceId: "authored-source", pageNumber: 1, imageWidthPx: 1000, imageHeightPx: 800,
    controlPoints: [{ sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } }, { sourcePx: { x: 1000, y: 0 }, planMm: { xMm: 10000, zMm: 0 } }] }];
  return document;
}

export function scaleMeasurement(overrides: Partial<FloorPlanSourceMeasurementV2> = {}): FloorPlanSourceMeasurementV2 {
  return { id: "independent", firstPx: { x: 200, y: 100 }, secondPx: { x: 200, y: 500 }, confirmedLengthMm: 4000,
    inputUnit: "mm", sourceQuality: "clean", confirmedAt: "2026-09-15T00:00:00Z", ...overrides };
}

